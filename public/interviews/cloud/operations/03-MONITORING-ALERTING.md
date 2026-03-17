# Monitoring & Alerting — Observability for 10K+ Hosts

> Operations perspective: How to instrument, collect, store, query, and act on telemetry at scale.

---

## 1. The Observability Stack

Observability is the ability to understand a system's internal state from its external outputs.
At 10K+ hosts, you need all three pillars working together — and they must be cheap to ingest,
fast to query, and reliable enough to trust during an incident.

```
                    ┌─────────────────────────────────────────────────────┐
                    │                    OBSERVABILITY                     │
                    │                                                     │
                    │   ┌───────────┐  ┌───────────┐  ┌───────────┐    │
                    │   │  METRICS  │  │   LOGS    │  │  TRACES   │    │
                    │   │           │  │           │  │           │    │
                    │   │ Numeric   │  │ Timestamped│  │ Request   │    │
                    │   │ time-series│  │ text events│  │ path graph│    │
                    │   │           │  │           │  │           │    │
                    │   │ "WHAT is  │  │ "WHY did  │  │ "WHERE is │    │
                    │   │ happening"│  │ it happen"│  │ the time" │    │
                    │   └─────┬─────┘  └─────┬─────┘  └─────┬─────┘    │
                    │         │              │              │           │
                    │         └──────────────┼──────────────┘           │
                    │                        │                           │
                    │               ┌────────▼────────┐                 │
                    │               │   Correlation   │                 │
                    │               │  (trace_id in   │                 │
                    │               │  logs & metrics)│                 │
                    │               └─────────────────┘                 │
                    └─────────────────────────────────────────────────────┘
```

### When to use each pillar

| Pillar  | Best for                                 | Cost model           | Query latency |
|---------|------------------------------------------|----------------------|---------------|
| Metrics | Trending, alerting, dashboards           | Low (aggregated)     | Milliseconds  |
| Logs    | Root-cause analysis, audit trail         | High (raw text)      | Seconds       |
| Traces  | Latency breakdown, service dependencies  | Medium (sampled)     | Seconds       |

### The correlation chain

```
Alert fires (metric threshold)
    ↓
Engineer opens dashboard (metrics — WHAT)
    ↓
Drills into logs for the affected host (logs — WHY)
    ↓
Finds a slow request, follows trace_id (traces — WHERE)
    ↓
Identifies slow downstream service
```

This chain only works if all three share a **common identifier**: `trace_id`, `service`, `host`, `pod`.

---

## 2. Metrics Pipeline

Every metric travels through a defined pipeline. Understanding each stage helps you debug
collection gaps, cardinality explosions, and alert delays.

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  Instrumented │    │  Collection  │    │ Aggregation  │    │   Storage    │
│   Services   │───▶│   (scrape/   │───▶│  (recording  │───▶│  (TSDB /     │
│              │    │   push)      │    │   rules)     │    │   Thanos)    │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
                                                                    │
                    ┌──────────────┐    ┌──────────────┐           │
                    │    Alert     │    │   Dashboard  │           │
                    │   Manager   │◀───│   (Grafana)  │◀──────────┘
                    └──────────────┘    └──────────────┘
```

### Collection methods

**Pull (Prometheus model)**
- Prometheus scrapes `/metrics` endpoints on a schedule (default: 15s)
- Service discovery via Kubernetes, Consul, EC2 tags, file-based SD
- Pros: Simple, self-documenting endpoints, no push coordination
- Cons: Firewall traversal issues, scrape interval jitter

**Push (StatsD/Telegraf/OTLP model)**
- Agents push to a gateway or aggregator
- Required for ephemeral jobs (batch, cron) via Pushgateway
- Pros: Works behind NAT, low-latency for short-lived jobs
- Cons: Stale metrics if source dies silently

### Aggregation with recording rules

Pre-compute expensive queries at ingest time:

```yaml
# prometheus-recording-rules.yaml
groups:
  - name: http_request_rates
    interval: 1m
    rules:
      - record: job:http_requests_total:rate5m
        expr: rate(http_requests_total[5m])

      - record: job:http_request_duration_p99:5m
        expr: histogram_quantile(0.99, rate(http_request_duration_bucket[5m]))

      - record: instance:node_cpu_utilization:rate5m
        expr: |
          1 - avg by (instance) (
            rate(node_cpu_seconds_total{mode="idle"}[5m])
          )
```

Recording rules reduce query time from seconds to milliseconds on dashboards.

---

## 3. Prometheus at Scale

A single Prometheus instance can handle ~1M active time series. At 10K hosts with
~200 series/host, you have 2M+ series — beyond single-instance capacity.

### Federation topology

```
                    ┌─────────────────────────────────┐
                    │         Global Prometheus        │
                    │    (federate/aggregate rules)    │
                    └──────┬──────────┬───────────────┘
                           │          │
                  ┌────────▼──┐  ┌────▼──────┐
                  │ Region-1  │  │ Region-2  │
                  │ Prometheus│  │ Prometheus│
                  └──┬─────┬──┘  └──┬──────┬─┘
                     │     │        │      │
               ┌─────▼┐ ┌──▼──┐ ┌──▼──┐ ┌─▼────┐
               │Shard1│ │Shard│ │Shard│ │Shard4│
               │      │ │  2  │ │  3  │ │      │
               └──────┘ └─────┘ └─────┘ └──────┘
               ~500K     ~500K   ~500K    ~500K
               series    series  series   series
```

**Federation scrape config (global Prometheus)**

```yaml
scrape_configs:
  - job_name: 'federate'
    scrape_interval: 15s
    honor_labels: true
    metrics_path: '/federate'
    params:
      match[]:
        - '{job="kubernetes-pods"}'
        - 'job:http_requests_total:rate5m'  # Only pre-aggregated
        - 'job:http_request_duration_p99:5m'
    static_configs:
      - targets:
          - 'prometheus-region-1:9090'
          - 'prometheus-region-2:9090'
```

### Thanos for long-term storage

```
┌─────────────┐    ┌─────────────┐    ┌──────────────────┐
│  Prometheus │    │   Thanos    │    │   Object Store   │
│  + Thanos   │───▶│   Sidecar  │───▶│  (S3/GCS/Azure)  │
│  Sidecar    │    │  (uploads  │    │  2yr retention   │
└─────────────┘    │  2h blocks)│    └──────────────────┘
                   └─────────────┘
                                           │
                   ┌───────────────────────▼────────────┐
                   │           Thanos Query              │
                   │  (fan-out queries across stores)    │
                   └───────────────────────┬────────────┘
                                           │
                   ┌───────────────────────▼────────────┐
                   │            Grafana                  │
                   │     (uses Thanos Query as source)   │
                   └────────────────────────────────────┘
```

**Thanos vs Cortex vs Mimir**

| Feature               | Thanos          | Cortex           | Grafana Mimir     |
|-----------------------|-----------------|------------------|-------------------|
| Storage backend       | Object store    | Object store     | Object store      |
| Query deduplication   | Yes             | Yes              | Yes               |
| Multi-tenancy         | Limited         | Full             | Full              |
| Horizontal scale      | Good            | Excellent        | Excellent         |
| Operational complexity| Medium          | High             | Medium            |
| Remote write support  | Thanos Receive  | Yes              | Yes               |
| Recommended for       | <50 Prometheus  | Large SaaS       | Large SaaS        |

### Cardinality management

Cardinality = number of unique label combinations. This is the #1 scaling problem.

**Dangerous patterns:**
```
# BAD: unbounded cardinality
http_requests_total{user_id="12345", session_id="abc-xyz", request_body="..."}

# GOOD: bounded cardinality
http_requests_total{service="api", endpoint="/users", status="200", method="GET"}
```

**Identifying cardinality explosions:**
```bash
# Top 10 metrics by series count
curl -s http://prometheus:9090/api/v1/label/__name__/values | \
  jq '.data[]' | while read metric; do
    count=$(curl -s "http://prometheus:9090/api/v1/series?match[]=${metric}" | \
      jq '.data | length')
    echo "$count $metric"
  done | sort -rn | head -10

# Prometheus TSDB cardinality analysis
curl http://prometheus:9090/api/v1/status/tsdb | jq '.data.seriesCountByMetricName[:10]'
```

**Recording rules to reduce cardinality:**
```yaml
# Aggregate away high-cardinality labels before storage
- record: service:http_requests_total:rate5m
  expr: |
    sum by (service, endpoint, status) (
      rate(http_requests_total[5m])
    )
  # Drops: instance, pod, container labels — reduces 100x series
```

---

## 4. Grafana Dashboards

### Dashboard-as-code with provisioning

Never click-to-create dashboards in production. Store as JSON, provision via ConfigMap or Git.

**Grafana provisioning directory structure:**
```
grafana/
├── provisioning/
│   ├── datasources/
│   │   └── prometheus.yaml
│   ├── dashboards/
│   │   └── dashboards.yaml        ← tells Grafana where to load
│   └── alerting/
│       └── alerts.yaml
└── dashboards/
    ├── infrastructure/
    │   ├── node-overview.json
    │   └── kubernetes-cluster.json
    └── application/
        ├── api-service.json
        └── database.json
```

**datasources provisioning:**
```yaml
# grafana/provisioning/datasources/prometheus.yaml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    url: http://thanos-query:9090
    isDefault: true
    jsonData:
      timeInterval: "15s"
      queryTimeout: "60s"
      httpMethod: POST

  - name: Loki
    type: loki
    url: http://loki:3100
    jsonData:
      derivedFields:
        - datasourceUid: tempo
          matcherRegex: "trace_id=(\\w+)"
          name: TraceID
          url: '$${__value.raw}'
```

### Dashboard variables

Variables make dashboards reusable across environments:

```json
{
  "templating": {
    "list": [
      {
        "name": "env",
        "type": "query",
        "query": "label_values(up, environment)",
        "refresh": 2,
        "multi": false
      },
      {
        "name": "service",
        "type": "query",
        "query": "label_values(up{environment=\"$env\"}, job)",
        "refresh": 2,
        "multi": true,
        "includeAll": true
      },
      {
        "name": "instance",
        "type": "query",
        "query": "label_values(up{job=~\"$service\"}, instance)",
        "multi": true
      }
    ]
  }
}
```

### RED and USE methods

**RED (for services — request-oriented):**
- **R**ate: requests per second
- **E**rrors: error rate (%)
- **D**uration: latency (p50, p95, p99)

```promql
# Rate
sum(rate(http_requests_total{job="$service", env="$env"}[5m]))

# Error rate
sum(rate(http_requests_total{job="$service", status=~"5.."}[5m]))
/ sum(rate(http_requests_total{job="$service"}[5m])) * 100

# p99 latency
histogram_quantile(0.99,
  sum by (le) (
    rate(http_request_duration_seconds_bucket{job="$service"}[5m])
  )
)
```

**USE (for resources — utilization-oriented):**
- **U**tilization: % of time resource is busy
- **S**aturation: queue depth / backlog
- **E**rrors: error count

```promql
# CPU utilization
1 - avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m]))

# CPU saturation (run queue length)
avg by (instance) (node_load1) / count by (instance) (
  node_cpu_seconds_total{mode="idle"}
)

# Disk I/O utilization
rate(node_disk_io_time_seconds_total[5m])

# Network saturation (bytes in/out vs link capacity)
rate(node_network_receive_bytes_total[5m]) / 1e9  # GB/s
```

---

## 5. Log Aggregation at Scale

### Architecture: Fluent Bit → Kafka → Storage

```
┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│  App/System  │   │  Fluent Bit  │   │    Kafka     │   │ Elasticsearch│
│    Logs      │──▶│  (per node   │──▶│  (durable    │──▶│  or Loki     │
│              │   │   DaemonSet) │   │  buffer)     │   │  (storage)   │
└──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘
                                              │
                                    ┌─────────▼──────────┐
                                    │  Logstash/Vector    │
                                    │  (transform, enrich)│
                                    └────────────────────┘
```

**Why Kafka in the middle?**
- Decouples producers from consumers — Elasticsearch can fall behind without losing logs
- Replay capability — re-process logs after a pipeline fix
- Fan-out — send same logs to security SIEM and observability stack simultaneously
- Backpressure absorption during traffic spikes

### Fluent Bit configuration

```ini
# fluent-bit.conf
[SERVICE]
    Flush         5
    Daemon        Off
    Log_Level     info
    Parsers_File  parsers.conf

[INPUT]
    Name              tail
    Path              /var/log/containers/*.log
    Parser            cri
    Tag               kube.*
    Refresh_Interval  5
    Mem_Buf_Limit     50MB
    Skip_Long_Lines   On

[FILTER]
    Name                kubernetes
    Match               kube.*
    Kube_URL            https://kubernetes.default.svc:443
    Merge_Log           On
    Keep_Log            Off
    K8S-Logging.Parser  On
    K8S-Logging.Exclude On

[FILTER]
    Name   grep
    Match  kube.*
    Exclude log ^\s*$          # Drop empty lines

[OUTPUT]
    Name        kafka
    Match       *
    Brokers     kafka-1:9092,kafka-2:9092,kafka-3:9092
    Topics      k8s-logs
    Timestamp_Key @timestamp
    Retry_Limit   False
```

### Structured logging

At scale, unstructured logs are useless. Enforce JSON everywhere:

```json
{
  "timestamp": "2024-01-15T10:30:45.123Z",
  "level": "ERROR",
  "service": "payment-api",
  "version": "v2.3.1",
  "trace_id": "4f8a9b2c1d3e5f6a",
  "span_id": "7b8c9d0e",
  "user_id": "usr_123456",
  "message": "Payment processing failed",
  "error": "stripe: card declined",
  "duration_ms": 342,
  "http_method": "POST",
  "http_path": "/v1/payments",
  "http_status": 402
}
```

**What to always include:**
- `timestamp` (RFC3339 with milliseconds)
- `level` (DEBUG, INFO, WARN, ERROR, FATAL)
- `service` and `version`
- `trace_id` and `span_id` (for correlation)
- `message` (human-readable)
- Structured error context (not string concatenation)

### Log levels and sampling

```
FATAL  ──── 100% sampled, immediate alert
ERROR  ──── 100% sampled, alert if sustained
WARN   ──── 100% sampled, no alert (monitor trend)
INFO   ──── 10% sampled in production (high volume)
DEBUG  ──── 0% in production (toggle per-service)
TRACE  ──── 0% in production (only local dev)
```

**Dynamic log-level adjustment without restart:**
```bash
# Spring Boot Actuator
curl -X POST http://service:8080/actuator/loggers/com.example.payments \
  -H 'Content-Type: application/json' \
  -d '{"configuredLevel": "DEBUG"}'

# Kubernetes — use a ConfigMap + env var reloader
kubectl set env deployment/payment-api LOG_LEVEL=DEBUG
```

### Retention policy

```
Hot (0-7 days)    → Elasticsearch SSD  → full text search, fast queries
Warm (7-30 days)  → Elasticsearch HDD  → searchable, slower
Cold (30-90 days) → S3 / GCS           → queryable via Athena/BigQuery
Archive (90d+)    → Glacier            → compliance only, restore-to-read
```

---

## 6. Distributed Tracing

### OpenTelemetry collector pipeline

```
┌────────────────────────────────────────────────────────────┐
│                  Application Services                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │ Service A│  │ Service B│  │ Service C│  │  DB      │ │
│  │ (OTLP)  │  │ (OTLP)  │  │ (OTLP)  │  │ (OTLP)  │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘ │
└───────┼──────────────┼──────────────┼──────────────┼───────┘
        └──────────────┴──────────────┴──────────────┘
                                │
                    ┌───────────▼───────────┐
                    │  OTel Collector       │
                    │  (receive, process,   │
                    │   batch, export)      │
                    └───────────┬───────────┘
                                │
                    ┌───────────▼───────────┐
                    │  Grafana Tempo        │
                    │  (or Jaeger)          │
                    │  trace storage        │
                    └───────────────────────┘
```

### OTel Collector configuration

```yaml
# otel-collector-config.yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:
    timeout: 1s
    send_batch_size: 1024

  tail_sampling:
    decision_wait: 10s
    num_traces: 100000
    expected_new_traces_per_sec: 10000
    policies:
      - name: errors-policy
        type: status_code
        status_code: {status_codes: [ERROR]}
      - name: slow-traces
        type: latency
        latency: {threshold_ms: 500}
      - name: probabilistic-sample
        type: probabilistic
        probabilistic: {sampling_percentage: 1}  # 1% of normal traces

exporters:
  otlp/tempo:
    endpoint: tempo:4317
    tls:
      insecure: true

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch, tail_sampling]
      exporters: [otlp/tempo]
```

### Trace sampling strategies

| Strategy           | Use case                              | Cost     | Coverage    |
|--------------------|---------------------------------------|----------|-------------|
| Head sampling      | Simple, early decision                | Low      | Biased      |
| Tail sampling      | Keep errors + slow traces             | Medium   | Good        |
| Probabilistic      | Uniform random % of traces            | Low      | Uniform     |
| Rate-limiting      | N traces/second per service           | Medium   | Even        |
| Adaptive           | Dynamic based on error rate           | High     | Excellent   |

**Recommended: Tail sampling with error + latency policies + 1% probabilistic.**

### Trace-to-log correlation

```python
# Python example — inject trace context into log fields
import logging
from opentelemetry import trace

def get_logger(name: str) -> logging.Logger:
    logger = logging.getLogger(name)
    return logger

class TraceContextFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        span = trace.get_current_span()
        if span.is_recording():
            ctx = span.get_span_context()
            record.trace_id = format(ctx.trace_id, '032x')
            record.span_id = format(ctx.span_id, '016x')
        else:
            record.trace_id = ''
            record.span_id = ''
        return True
```

This ensures every log line emitted within a traced request carries `trace_id` and `span_id`,
enabling a direct link from Grafana Loki log line → Tempo trace visualization.

---

## 7. Alerting Philosophy

### Symptom-based vs cause-based alerting

```
WRONG (cause-based):
  alert: CPUHigh
  expr: cpu_usage > 80%
  → Fires constantly, often not actionable

CORRECT (symptom-based):
  alert: HighErrorRate
  expr: http_error_rate > 1%
  → Users are experiencing errors RIGHT NOW
```

**The test:** "Is a user impacted?" If no, it's not an alert — it's a dashboard metric.

### Alert severity levels

| Severity | SLA impact  | Response time | Channel          | Example                     |
|----------|-------------|---------------|------------------|-----------------------------|
| P1/CRIT  | Yes, now    | 5 minutes     | PagerDuty + call | Service down, >5% error rate|
| P2/HIGH  | Imminent    | 30 minutes    | PagerDuty        | Latency p99 > 2s            |
| P3/WARN  | Potential   | Next business  | Slack            | Disk >80%, pod restarts     |
| P4/INFO  | No          | Sprint         | Ticket           | Deprecated API used         |

### Prometheus alert rules

```yaml
# alert-rules.yaml
groups:
  - name: service_slos
    rules:
      # Symptom: users see errors
      - alert: HighErrorRate
        expr: |
          (
            sum by (job) (rate(http_requests_total{status=~"5.."}[5m]))
            /
            sum by (job) (rate(http_requests_total[5m]))
          ) > 0.01
        for: 2m
        labels:
          severity: critical
          team: platform
        annotations:
          summary: "High error rate on {{ $labels.job }}"
          description: |
            Error rate is {{ $value | humanizePercentage }} over the last 5m.
            Threshold: 1%
          runbook: "https://wiki.internal/runbooks/high-error-rate"
          dashboard: "https://grafana.internal/d/service-overview"

      # Symptom: users experience slowness
      - alert: HighP99Latency
        expr: |
          histogram_quantile(0.99,
            sum by (job, le) (
              rate(http_request_duration_seconds_bucket[5m])
            )
          ) > 2.0
        for: 5m
        labels:
          severity: high
          team: platform
        annotations:
          summary: "p99 latency > 2s on {{ $labels.job }}"
          description: "p99={{ $value | humanizeDuration }}"
          runbook: "https://wiki.internal/runbooks/high-latency"

      # Cause: disk filling — actionable before user impact
      - alert: DiskWillFillIn4Hours
        expr: |
          predict_linear(
            node_filesystem_free_bytes{mountpoint="/"}[1h], 4 * 3600
          ) < 0
        for: 15m
        labels:
          severity: warning
          team: infra
        annotations:
          summary: "Disk predicted full in 4h on {{ $labels.instance }}"
          description: "Mount {{ $labels.mountpoint }} predicted full at current write rate"

  - name: slo_burn_rate
    rules:
      # Multi-window, multi-burn-rate SLO alerting (Google SRE book)
      - alert: SLOBurnRateFast
        expr: |
          (
            job:slo_error_rate:rate1h{job="payment-api"} > (14.4 * 0.001)
            and
            job:slo_error_rate:rate5m{job="payment-api"} > (14.4 * 0.001)
          )
        labels:
          severity: critical
          slo: payment_api_availability
        annotations:
          summary: "Fast burn rate — SLO budget depleting rapidly"
          description: "At this rate, the error budget will be exhausted in ~1 hour"
```

### AlertManager routing

```yaml
# alertmanager.yaml
global:
  resolve_timeout: 5m
  pagerduty_url: 'https://events.pagerduty.com/v2/enqueue'

route:
  group_by: ['alertname', 'job', 'severity']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  receiver: 'slack-default'

  routes:
    - match:
        severity: critical
      receiver: pagerduty-platform
      continue: true  # also notify Slack

    - match:
        severity: critical
        team: database
      receiver: pagerduty-dba

    - match:
        severity: warning
      receiver: slack-warnings

receivers:
  - name: pagerduty-platform
    pagerduty_configs:
      - service_key: '{{ env "PAGERDUTY_KEY_PLATFORM" }}'
        description: '{{ .CommonAnnotations.summary }}'
        details:
          runbook: '{{ .CommonAnnotations.runbook }}'
          dashboard: '{{ .CommonAnnotations.dashboard }}'

  - name: slack-warnings
    slack_configs:
      - api_url: '{{ env "SLACK_WEBHOOK_URL" }}'
        channel: '#alerts-warnings'
        title: '{{ .CommonAnnotations.summary }}'
        text: '{{ .CommonAnnotations.description }}'
        actions:
          - type: button
            text: 'Runbook'
            url: '{{ .CommonAnnotations.runbook }}'
          - type: button
            text: 'Dashboard'
            url: '{{ .CommonAnnotations.dashboard }}'

inhibit_rules:
  # If service is down, suppress latency alerts for same service
  - source_match:
      alertname: ServiceDown
    target_match_re:
      alertname: HighP99Latency|HighErrorRate
    equal: ['job']
```

### Alert fatigue prevention checklist

- Every alert has a runbook link
- Every alert requires a human action (if not, convert to dashboard)
- Alerts use `for:` duration to avoid flapping (minimum 2m for critical, 5m for warning)
- Inhibition rules suppress child alerts when parent fires
- Dead-man's-switch alert verifies the alerting pipeline is alive
- Monthly alert review: delete any alert that fired >20 times without action

---

## 8. Synthetic Monitoring

### Blackbox Exporter probes

```yaml
# blackbox.yaml
modules:
  http_2xx:
    prober: http
    timeout: 10s
    http:
      valid_http_versions: ["HTTP/1.1", "HTTP/2.0"]
      valid_status_codes: [200, 201, 204]
      method: GET
      follow_redirects: true
      preferred_ip_protocol: ip4
      tls_config:
        insecure_skip_verify: false

  http_post_200:
    prober: http
    http:
      method: POST
      headers:
        Content-Type: application/json
      body: '{"health": "check"}'

  tcp_connect:
    prober: tcp
    timeout: 5s

  tls_expiry:
    prober: http
    http:
      fail_if_not_ssl: true
      tls_config:
        insecure_skip_verify: false
```

**Prometheus scrape config for Blackbox:**
```yaml
scrape_configs:
  - job_name: 'blackbox-http'
    metrics_path: /probe
    params:
      module: [http_2xx]
    static_configs:
      - targets:
          - https://api.example.com/health
          - https://app.example.com
          - https://checkout.example.com/ping
    relabel_configs:
      - source_labels: [__address__]
        target_label: __param_target
      - source_labels: [__param_target]
        target_label: instance
      - target_label: __address__
        replacement: blackbox-exporter:9115
```

**Alerts on probe failures:**
```yaml
- alert: EndpointDown
  expr: probe_success == 0
  for: 2m
  labels:
    severity: critical
  annotations:
    summary: "Endpoint {{ $labels.instance }} is down"

- alert: SSLCertExpiringIn14Days
  expr: probe_ssl_earliest_cert_expiry - time() < 14 * 24 * 3600
  labels:
    severity: warning
  annotations:
    summary: "SSL cert for {{ $labels.instance }} expires in < 14 days"
    description: "Expiry: {{ $value | humanizeDuration }} from now"
```

### Canary deployment verification

```bash
#!/bin/bash
# canary-verify.sh — run after deployment, block promotion on failure

CANARY_HOST="canary.example.com"
STABLE_HOST="stable.example.com"
MAX_ERROR_DELTA=0.005   # canary error rate must be within 0.5% of stable
MAX_LATENCY_RATIO=1.1   # canary p99 must be < 110% of stable

canary_error_rate=$(curl -s "http://prometheus:9090/api/v1/query" \
  --data-urlencode "query=sum(rate(http_requests_total{job=\"canary\",status=~\"5..\"}[5m])) / sum(rate(http_requests_total{job=\"canary\"}[5m]))" \
  | jq -r '.data.result[0].value[1]')

stable_error_rate=$(curl -s "http://prometheus:9090/api/v1/query" \
  --data-urlencode "query=sum(rate(http_requests_total{job=\"stable\",status=~\"5..\"}[5m])) / sum(rate(http_requests_total{job=\"stable\"}[5m]))" \
  | jq -r '.data.result[0].value[1]')

delta=$(echo "$canary_error_rate - $stable_error_rate" | bc -l)

if (( $(echo "$delta > $MAX_ERROR_DELTA" | bc -l) )); then
  echo "FAIL: Canary error rate delta $delta exceeds $MAX_ERROR_DELTA — rolling back"
  exit 1
fi

echo "PASS: Canary within acceptable error rate bounds"
exit 0
```

---

## 9. Infrastructure Monitoring

### node_exporter key metrics

```bash
# Install
sudo apt install prometheus-node-exporter
# or via Docker
docker run -d --net="host" --pid="host" -v "/:/host:ro,rslave" \
  quay.io/prometheus/node-exporter --path.rootfs=/host
```

**Essential PromQL for infrastructure:**
```promql
# CPU utilization per host
100 - (avg by (instance) (
  rate(node_cpu_seconds_total{mode="idle"}[5m])
) * 100)

# Memory available percentage
(node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100

# Disk I/O utilization (% of time disk was busy)
rate(node_disk_io_time_seconds_total{device!~"dm-.*"}[5m]) * 100

# Filesystem usage
(1 - node_filesystem_free_bytes / node_filesystem_size_bytes) * 100

# Network saturation: receive bandwidth
rate(node_network_receive_bytes_total{device!="lo"}[5m]) * 8  # bits/sec

# Open file descriptor usage
node_filefd_allocated / node_filefd_maximum

# System load vs CPU count
node_load5 / count without (cpu, mode) (node_cpu_seconds_total{mode="idle"})
```

### Disk fill prediction

```promql
# Time until disk full at current consumption rate
predict_linear(node_filesystem_free_bytes{mountpoint="/data"}[6h], 7 * 24 * 3600)
```

```yaml
# Tiered disk alerts
- alert: DiskUsageHigh
  expr: (1 - node_filesystem_free_bytes / node_filesystem_size_bytes) > 0.80
  for: 5m
  labels:
    severity: warning

- alert: DiskUsageCritical
  expr: (1 - node_filesystem_free_bytes / node_filesystem_size_bytes) > 0.90
  for: 2m
  labels:
    severity: critical

- alert: DiskPredictedFull24h
  expr: predict_linear(node_filesystem_free_bytes[2h], 24 * 3600) < 0
  for: 10m
  labels:
    severity: high
```

### CloudWatch integration (AWS)

```yaml
# cloudwatch-exporter config for EC2/RDS/ELB
region: us-east-1
metrics:
  - aws_namespace: AWS/EC2
    aws_metric_name: CPUUtilization
    aws_dimensions: [InstanceId]
    aws_statistics: [Average, Maximum]
    period_seconds: 60

  - aws_namespace: AWS/RDS
    aws_metric_name: DatabaseConnections
    aws_dimensions: [DBInstanceIdentifier]
    aws_statistics: [Average]
    period_seconds: 60

  - aws_namespace: AWS/ApplicationELB
    aws_metric_name: TargetResponseTime
    aws_dimensions: [LoadBalancer, TargetGroup]
    aws_statistics: [p50, p95, p99]
    period_seconds: 60
    aws_extended_statistics:
      - p50
      - p95
      - p99
```

---

## 10. Building On-Call Dashboards

### The 4 Golden Signals

Defined by Google SRE — the minimum viable dashboard for any service:

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     SERVICE OVERVIEW: payment-api                        │
│                                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │   LATENCY   │  │   TRAFFIC   │  │   ERRORS    │  │ SATURATION  │  │
│  │             │  │             │  │             │  │             │  │
│  │  p50: 45ms  │  │  1,234 RPS  │  │  0.12%      │  │  CPU: 42%   │  │
│  │  p95: 120ms │  │             │  │  ████████   │  │  Mem: 68%   │  │
│  │  p99: 340ms │  │  ▁▃▅▇▆▅▄▃  │  │  (GREEN)    │  │  Queue: 12  │  │
│  │             │  │             │  │             │  │             │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

**PromQL for each golden signal:**
```promql
# Latency — histogram quantiles
histogram_quantile(0.99,
  sum by (le) (rate(http_request_duration_seconds_bucket{job="$service"}[5m]))
)

# Traffic — request rate
sum(rate(http_requests_total{job="$service"}[5m]))

# Errors — error ratio
sum(rate(http_requests_total{job="$service", status=~"5.."}[5m]))
/ sum(rate(http_requests_total{job="$service"}[5m]))

# Saturation — highest bottleneck
max by (instance) (
  (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes))
)
```

### Dependency map panel

Use the Node Graph panel in Grafana to visualize service dependencies with health status.
Drive it from OpenTelemetry span data via Tempo or from a custom service catalog metric:

```promql
# Edge weight: request rate between services
sum by (source, destination) (
  rate(service_to_service_requests_total[5m])
)
```

### On-call dashboard layout

```
┌─────────────────────────────────────────────────────────────────────┐
│ Row 1: Active Alerts + SLO burn rate budget remaining               │
├─────────────────────────────────────────────────────────────────────┤
│ Row 2: 4 Golden Signals (traffic, latency, errors, saturation)      │
├─────────────────────────────────────────────────────────────────────┤
│ Row 3: Dependency health map + downstream error rates               │
├─────────────────────────────────────────────────────────────────────┤
│ Row 4: Infrastructure — CPU, memory, disk, network per host group   │
├─────────────────────────────────────────────────────────────────────┤
│ Row 5: Recent deployments timeline + config changes                 │
├─────────────────────────────────────────────────────────────────────┤
│ Row 6: Links: Runbooks | Logs | Traces | Post-mortem template       │
└─────────────────────────────────────────────────────────────────────┘
```

### Runbook linking pattern

Every alert annotation must have a `runbook` link. Structure runbooks as:

```markdown
# HighErrorRate Runbook

## Impact
Users are receiving 5xx errors. Check SLO dashboard for budget remaining.

## Triage Steps
1. Identify which endpoints are erroring:
   `rate(http_requests_total{status=~"5.."}[5m]) by (endpoint)`
2. Check recent deployments in deployment timeline
3. Check downstream dependencies for elevated errors
4. Review error logs: `{job="payment-api"} |= "ERROR" | json`

## Escalation
- If fix not found in 15m: escalate to service owner via PagerDuty
- If data integrity risk: escalate to DBA immediately
```

---

## 11. Real-World Monitoring Architecture (5000-Host Platform)

### Scale parameters

| Parameter                  | Value                  |
|----------------------------|------------------------|
| Total hosts                | 5,000                  |
| Kubernetes pods            | ~30,000                |
| Active time series         | ~2,000,000             |
| Metrics ingestion rate     | ~150,000 samples/sec   |
| Log volume                 | ~2 TB/day              |
| Trace volume               | ~500 GB/day (sampled)  |
| Prometheus scrape interval | 15s                    |
| Long-term retention        | 13 months (S3)         |

### Full architecture

```
                        INSTRUMENTATION LAYER
┌──────────────────────────────────────────────────────────────────────┐
│  K8s Pods         Bare Metal Hosts       Managed Services (AWS)      │
│  (OTLP SDK)       (node_exporter)        (CloudWatch Exporter)       │
└──────┬───────────────────┬─────────────────────┬─────────────────────┘
       │                   │                     │
       ▼                   ▼                     ▼
                    COLLECTION LAYER
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Prometheus Shards                         │   │
│  │                                                             │   │
│  │  Shard A (region-1a)   Shard B (region-1b)   Shard C (1c) │   │
│  │  ~700K series          ~700K series           ~600K series │   │
│  │  2x replicas each (HA)                                     │   │
│  └─────────────────────────┬───────────────────────────────────┘   │
│                             │ remote_write                          │
│                             ▼                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              Grafana Mimir (multi-tenant TSDB)               │  │
│  │  Ingester × 6    Querier × 4    Compactor × 2               │  │
│  │  Rule evaluator  Store gateway (reads from S3)               │  │
│  └──────────────────────────┬───────────────────────────────────┘  │
│                             │                                       │
│                             ▼                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              S3 Object Store (13mo retention)                │  │
│  │  Parquet blocks, 2h granularity, lifecycle policy            │  │
│  └──────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘

                         LOGS LAYER
┌──────────────────────────────────────────────────────────────────────┐
│  Fluent Bit (DaemonSet, 5000 agents)                                 │
│     → Kafka (6 brokers, 3x replication, 72h retention)              │
│        → Logstash (enrichment, routing)                              │
│           → Elasticsearch (7-day hot/warm)                          │
│           → Loki (structured logs, label-indexed, cheaper)          │
│           → S3 (cold archive via Index Lifecycle Management)         │
└──────────────────────────────────────────────────────────────────────┘

                        TRACES LAYER
┌──────────────────────────────────────────────────────────────────────┐
│  OTel Collectors (10 instances, load-balanced)                       │
│     → Tail sampling (keep errors + latency > 500ms + 1% of rest)   │
│        → Grafana Tempo (object store backend, S3)                   │
│           → 7-day retention, trace-to-metrics, trace-to-logs        │
└──────────────────────────────────────────────────────────────────────┘

                      VISUALIZATION & ALERTING
┌──────────────────────────────────────────────────────────────────────┐
│  Grafana (3 instances, HA)                                           │
│     Datasources: Mimir, Loki, Tempo, Elasticsearch                  │
│     Dashboards: 200+ provisioned via GitOps                         │
│                                                                      │
│  Alertmanager (3 instances, clustered)                               │
│     → PagerDuty (P1/P2)                                             │
│     → Slack (P3/P4)                                                 │
│     → OpsGenie (escalation policies)                                │
└──────────────────────────────────────────────────────────────────────┘
```

### Resource sizing (approximate)

| Component              | Instances | CPU   | Memory  | Storage          |
|------------------------|-----------|-------|---------|------------------|
| Prometheus shards      | 6         | 4c    | 32 GB   | 500 GB NVMe each |
| Mimir ingesters        | 6         | 8c    | 64 GB   | 200 GB SSD each  |
| Mimir queriers         | 4         | 4c    | 16 GB   | —                |
| Grafana                | 3         | 2c    | 8 GB    | —                |
| Alertmanager           | 3         | 1c    | 4 GB    | —                |
| Kafka brokers          | 6         | 8c    | 32 GB   | 4 TB HDD each    |
| Elasticsearch data     | 12        | 8c    | 64 GB   | 4 TB SSD each    |
| Tempo                  | 4         | 4c    | 16 GB   | S3 backend       |
| OTel collectors        | 10        | 4c    | 8 GB    | —                |
| Fluent Bit (per host)  | 5000      | 0.1c  | 128 MB  | —                |

### Operational runbook: responding to 2M series alert

```bash
# 1. Identify which job is causing the explosion
curl -s http://mimir:9090/api/v1/status/tsdb \
  | jq '.data.seriesCountByMetricName | to_entries | sort_by(-.value) | .[0:10]'

# 2. Check label cardinality for that metric
curl -s "http://mimir:9090/api/v1/label/__name__/values" | \
  jq -r '.data[]' | while read m; do
    series=$(curl -s "http://mimir:9090/api/v1/series?match[]=$m&start=$(date -d '5min ago' +%s)&end=$(date +%s)" | jq '.data | length')
    [ "$series" -gt 10000 ] && echo "$series $m"
  done | sort -rn

# 3. Find which labels are high-cardinality
curl -s "http://mimir:9090/api/v1/labels" | jq -r '.data[]' | while read label; do
  count=$(curl -s "http://mimir:9090/api/v1/label/$label/values" | jq '.data | length')
  echo "$count $label"
done | sort -rn | head -20

# 4. Drop high-cardinality labels via metric_relabel_configs
# Add to prometheus scrape config:
#   metric_relabel_configs:
#     - source_labels: [__name__]
#       regex: 'offending_metric.*'
#       action: drop
```

### SLO budget tracking

```promql
# Error budget remaining (30-day rolling window)
# SLO: 99.9% availability = 0.1% error budget

(
  1 - (
    sum(rate(http_requests_total{job="payment-api", status=~"5.."}[30d]))
    /
    sum(rate(http_requests_total{job="payment-api"}[30d]))
  )
) / 0.001  # divide by error budget (1 - SLO)
-- returns: 1.0 = 100% budget remaining, 0.0 = exhausted
```

---

## Quick Reference: Key Commands

```bash
# Prometheus — query via API
curl 'http://prometheus:9090/api/v1/query?query=up'
curl 'http://prometheus:9090/api/v1/query_range?query=rate(http_requests_total[5m])&start=2024-01-01T00:00:00Z&end=2024-01-01T01:00:00Z&step=60'

# Reload Prometheus config (no restart)
curl -X POST http://prometheus:9090/-/reload

# Check Alertmanager status
amtool alert query --alertmanager.url=http://alertmanager:9093
amtool silence add alertname=Watchdog --duration=2h --comment="Maintenance window"

# Grafana — import dashboard via API
curl -X POST http://admin:admin@grafana:3000/api/dashboards/db \
  -H 'Content-Type: application/json' \
  -d @dashboard.json

# Elasticsearch — check index health
curl http://elasticsearch:9200/_cat/indices?v&s=store.size:desc | head -20
curl http://elasticsearch:9200/_cat/shards?v | grep UNASSIGNED

# Kafka — check consumer lag (log pipeline health)
kafka-consumer-groups.sh --bootstrap-server kafka:9092 \
  --describe --group logstash-consumer

# Loki — query logs
logcli query '{job="payment-api"} |= "ERROR" | json | level="ERROR"' \
  --from="2024-01-15T10:00:00Z" --to="2024-01-15T11:00:00Z" \
  --limit=100
```

---

## Interview Cheat Sheet

| Question                              | Key Answer                                                      |
|---------------------------------------|-----------------------------------------------------------------|
| "How do you handle 2M time series?"  | Sharding + federation + Thanos/Mimir + cardinality governance  |
| "Why does my alert keep flapping?"   | Missing `for:` duration, metric too volatile — use longer window|
| "Logs vs metrics for alerting?"       | Metrics for alerting (fast), logs for root cause (slow)        |
| "How do you prevent alert fatigue?"  | Symptom-based, inhibition rules, mandatory runbooks, reviews   |
| "What's tail sampling?"               | Decide to keep/drop trace AFTER seeing full span (errors/slow) |
| "RED vs USE?"                         | RED = services (requests), USE = resources (infrastructure)    |
| "How do you correlate logs + traces?" | Inject trace_id into log fields via OTel context propagation   |
| "Disk prediction in Prometheus?"      | `predict_linear(metric[window], seconds_to_project)`           |
| "How to reduce Prometheus costs?"     | Recording rules, drop unused metrics, cardinality audits       |
| "What are the 4 golden signals?"      | Latency, Traffic, Errors, Saturation                           |
