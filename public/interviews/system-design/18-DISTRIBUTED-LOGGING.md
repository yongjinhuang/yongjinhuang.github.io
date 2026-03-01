# Design a Distributed Logging & Monitoring System (ELK / Datadog)

## Table of Contents

1. [Requirements Clarification](#1-requirements-clarification)
2. [API Design](#2-api-design)
3. [Data Model](#3-data-model)
4. [High-Level Architecture](#4-high-level-architecture)
5. [Log Collection & Ingestion](#5-log-collection--ingestion)
6. [Distributed Tracing](#6-distributed-tracing)
7. [Metrics Pipeline](#7-metrics-pipeline)
8. [Elasticsearch Deep Dive](#8-elasticsearch-deep-dive)
9. [Alerting System](#9-alerting-system)
10. [Scaling Strategy](#10-scaling-strategy)
11. [Deployment Architecture](#11-deployment-architecture)
12. [Cost Optimization](#12-cost-optimization)
13. [Comparison: Build vs Buy](#13-comparison-build-vs-buy)
14. [Common Interview Follow-ups](#14-common-interview-follow-ups)

---

## 1. Requirements Clarification

### Functional Requirements

| Category | Requirements |
|----------|-------------|
| **Log Ingestion** | Collect logs from 100K+ servers, containers, and serverless functions; support structured (JSON) and unstructured (plaintext) formats; auto-parse common formats (Apache, Nginx, syslog) |
| **Search & Query** | Full-text search across all logs; filter by service, severity, host, time range; regex and wildcard support; saved queries and views |
| **Distributed Tracing** | Correlate requests across microservices via trace IDs; visualize request waterfall/flame chart; identify latency bottlenecks; support OpenTelemetry |
| **Metrics** | Collect system metrics (CPU, memory, disk, network); application metrics (request rate, error rate, latency percentiles); custom business metrics; aggregation and downsampling |
| **Alerting** | Threshold-based alerts (e.g., error rate > 5%); anomaly detection (deviation from baseline); composite alerts (multiple conditions); escalation policies and on-call rotation |
| **Dashboards** | Real-time dashboards with auto-refresh; customizable widgets (line charts, heatmaps, tables); template variables for environment/service filtering; shareable URLs |
| **Compliance** | Audit trail for log access; data retention policies per regulation; PII redaction; role-based access control (RBAC) |

### Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| Ingestion latency | < 5 seconds from log emission to searchability |
| Search latency | < 2 seconds for queries spanning 1 hour of data |
| Availability | 99.9% uptime for ingestion; 99.95% for dashboards |
| Data retention | Hot: 7 days, Warm: 30 days, Cold: 1 year, Frozen/Archive: 7 years |
| Durability | Zero log loss under normal operation; at-most 0.01% loss during failover |
| Throughput | Sustain 10M+ log events/second at peak |
| Scalability | Linear horizontal scaling for ingestion and storage |
| Security | Encryption in transit (TLS) and at rest (AES-256); RBAC; SOC2 compliance |

### Scale Estimates

```
Servers:                     100,000 hosts (mix of bare metal, VMs, containers)
Containers:                  500,000 (avg 5 per host)
Microservices:               2,000 distinct services

Log Volume:
  Avg log lines per host:    1,000 lines/sec
  Total log lines/sec:       100,000 * 1,000 = 100M lines/sec
  Average log line size:     500 bytes
  Ingestion bandwidth:       100M * 500 B = 50 GB/sec = 400 Gbps

  Daily log volume:          50 GB/s * 86,400 = 4.32 PB/day (raw)
  With compression (5:1):    ~864 TB/day compressed
  Monthly storage (hot):     864 TB * 7 = ~6 PB (7-day hot tier)

Metrics Volume:
  Metrics per host:          500 unique time series
  Total time series:         100K * 500 = 50M active time series
  Data points per series:    1 point / 15 sec = 5,760/day
  Daily data points:         50M * 5,760 = 288 billion points/day
  Storage per point:         16 bytes (timestamp + float64)
  Daily metrics storage:     288B * 16 = ~4.6 TB/day

Traces:
  Requests per second:       5M req/sec across all services
  Avg spans per trace:       8 spans
  Trace sampling rate:       10% (head sampling)
  Sampled spans/sec:         5M * 0.1 * 8 = 4M spans/sec
  Avg span size:             400 bytes
  Daily trace storage:       4M * 400 * 86,400 = ~138 TB/day
```

### Back-of-Envelope Summary

```
+-----------------------+------------------+------------------+
| Signal                | Ingestion Rate   | Daily Storage    |
+-----------------------+------------------+------------------+
| Logs                  | 50 GB/sec        | 864 TB (compr.)  |
| Metrics               | ~75 MB/sec       | 4.6 TB           |
| Traces (10% sampled)  | 1.6 GB/sec       | 138 TB           |
+-----------------------+------------------+------------------+
| TOTAL                 | ~52 GB/sec       | ~1 PB/day        |
+-----------------------+------------------+------------------+
```

---

## 2. API Design

### 2.1 Log Ingestion API

```
POST /api/v1/logs/ingest
Content-Type: application/json
Authorization: Bearer <api-key>
X-Org-ID: org_12345

Request Body:
[
  {
    "timestamp": "2026-03-01T12:00:00.123Z",
    "severity": "ERROR",
    "service": "payment-service",
    "host": "prod-payment-07",
    "container_id": "abc123def",
    "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
    "span_id": "00f067aa0ba902b7",
    "message": "Payment processing failed: timeout after 30s",
    "attributes": {
      "payment_id": "pay_9x8y7z",
      "amount": 99.99,
      "currency": "USD",
      "error_code": "GATEWAY_TIMEOUT",
      "retry_count": 3
    },
    "resource": {
      "k8s.namespace": "production",
      "k8s.pod": "payment-service-7b9f4d-x2k9l",
      "k8s.cluster": "us-east-1-prod",
      "cloud.region": "us-east-1"
    }
  }
]

Response: 202 Accepted
{
  "accepted": 1,
  "rejected": 0,
  "request_id": "req_abc123"
}
```

### 2.2 Log Search API

```
POST /api/v1/logs/search
Authorization: Bearer <api-key>

Request Body:
{
  "query": "severity:ERROR AND service:payment-service AND message:\"timeout\"",
  "time_range": {
    "from": "2026-03-01T11:00:00Z",
    "to": "2026-03-01T12:00:00Z"
  },
  "filters": {
    "host": ["prod-payment-07", "prod-payment-08"],
    "k8s.namespace": "production"
  },
  "sort": { "field": "timestamp", "order": "desc" },
  "limit": 100,
  "offset": 0,
  "aggregations": {
    "error_count_by_service": {
      "type": "terms",
      "field": "service",
      "size": 10
    },
    "errors_over_time": {
      "type": "date_histogram",
      "field": "timestamp",
      "interval": "5m"
    }
  }
}

Response: 200 OK
{
  "total_hits": 1423,
  "took_ms": 342,
  "logs": [ ... ],
  "aggregations": {
    "error_count_by_service": {
      "buckets": [
        { "key": "payment-service", "doc_count": 892 },
        { "key": "order-service", "doc_count": 312 }
      ]
    },
    "errors_over_time": {
      "buckets": [
        { "key": "2026-03-01T11:00:00Z", "doc_count": 45 },
        { "key": "2026-03-01T11:05:00Z", "doc_count": 120 }
      ]
    }
  }
}
```

### 2.3 Metrics Query API

```
POST /api/v1/metrics/query
Authorization: Bearer <api-key>

Request Body:
{
  "query": "avg:system.cpu.usage{service:payment-service, env:production} by {host}",
  "time_range": {
    "from": "2026-03-01T11:00:00Z",
    "to": "2026-03-01T12:00:00Z"
  },
  "rollup": {
    "interval": "1m",
    "aggregation": "avg"
  }
}

Response: 200 OK
{
  "series": [
    {
      "metric": "system.cpu.usage",
      "tags": { "host": "prod-payment-07" },
      "points": [
        [1709290800, 45.2],
        [1709290860, 47.8],
        [1709290920, 92.1]
      ]
    }
  ]
}
```

### 2.4 Alert Rules API

```
POST /api/v1/alerts/rules
Authorization: Bearer <api-key>

Request Body:
{
  "name": "High Error Rate - Payment Service",
  "type": "threshold",
  "query": "count:logs{severity:ERROR, service:payment-service}.rollup(sum, 300)",
  "conditions": [
    {
      "threshold": 100,
      "comparison": "above",
      "window": "5m",
      "trigger_after": 2
    }
  ],
  "severity": "critical",
  "notification_channels": ["pagerduty-oncall", "slack-payments-team"],
  "escalation_policy": "payments-escalation",
  "tags": ["team:payments", "env:production"],
  "message": "Error rate for payment-service exceeded 100 errors in 5 minutes.\nDashboard: https://monitor.example.com/d/payments\nRunbook: https://wiki.example.com/runbooks/payment-errors"
}

Response: 201 Created
{
  "id": "alert_rule_789",
  "status": "active",
  "created_at": "2026-03-01T12:00:00Z"
}
```

### 2.5 Trace Query API

```
GET /api/v1/traces/{trace_id}
Authorization: Bearer <api-key>

Response: 200 OK
{
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "root_service": "api-gateway",
  "duration_ms": 847,
  "span_count": 12,
  "error": true,
  "spans": [
    {
      "span_id": "00f067aa0ba902b7",
      "parent_span_id": null,
      "service": "api-gateway",
      "operation": "POST /api/orders",
      "start_time": "2026-03-01T12:00:00.000Z",
      "duration_ms": 847,
      "status": "ERROR",
      "attributes": { "http.status_code": 500 },
      "events": [
        {
          "name": "exception",
          "timestamp": "2026-03-01T12:00:00.845Z",
          "attributes": {
            "exception.type": "TimeoutError",
            "exception.message": "Payment gateway timeout"
          }
        }
      ],
      "children": ["span_abc123", "span_def456"]
    }
  ]
}
```

---

## 3. Data Model

### 3.1 Log Event Schema

```json
{
  "timestamp":    "datetime (nanosecond precision, UTC)",
  "observed_at":  "datetime (when collector received it)",
  "severity":     "enum: TRACE|DEBUG|INFO|WARN|ERROR|FATAL",
  "severity_num": "int (1-24, OpenTelemetry severity numbers)",
  "body":         "string (the log message)",
  "service":      "string (service name)",
  "host":         "string (hostname or IP)",
  "source":       "string (file path or component)",

  "trace_id":     "string (128-bit hex, W3C Trace Context)",
  "span_id":      "string (64-bit hex)",

  "resource": {
    "service.name":       "string",
    "service.version":    "string",
    "k8s.namespace":      "string",
    "k8s.pod.name":       "string",
    "k8s.container.name": "string",
    "k8s.cluster.name":   "string",
    "cloud.provider":     "string",
    "cloud.region":       "string",
    "host.name":          "string",
    "host.ip":            "string"
  },

  "attributes": {
    "key": "value (arbitrary key-value pairs)"
  },

  "org_id":       "string (tenant identifier)",
  "ingestion_id": "string (deduplication key)"
}
```

### 3.2 Elasticsearch Index Mapping

```json
{
  "mappings": {
    "properties": {
      "timestamp":       { "type": "date", "format": "strict_date_optional_time_nanos" },
      "observed_at":     { "type": "date" },
      "severity":        { "type": "keyword" },
      "severity_num":    { "type": "byte" },
      "body":            { "type": "text", "analyzer": "standard", "fields": {
                            "keyword": { "type": "keyword", "ignore_above": 1024 }
                          }},
      "service":         { "type": "keyword" },
      "host":            { "type": "keyword" },
      "source":          { "type": "keyword" },
      "trace_id":        { "type": "keyword" },
      "span_id":         { "type": "keyword" },
      "resource":        { "type": "object", "properties": {
                            "service.name":       { "type": "keyword" },
                            "service.version":    { "type": "keyword" },
                            "k8s.namespace":      { "type": "keyword" },
                            "k8s.pod.name":       { "type": "keyword" },
                            "k8s.cluster.name":   { "type": "keyword" },
                            "cloud.region":       { "type": "keyword" }
                          }},
      "attributes":      { "type": "flattened" },
      "org_id":          { "type": "keyword" },
      "ingestion_id":    { "type": "keyword" }
    }
  },
  "settings": {
    "number_of_shards": 6,
    "number_of_replicas": 1,
    "index.codec": "best_compression",
    "index.refresh_interval": "5s",
    "index.translog.durability": "async",
    "index.translog.sync_interval": "5s"
  }
}
```

### 3.3 Time-Series Metrics Schema (ClickHouse)

```sql
CREATE TABLE metrics (
    org_id          UInt32,
    metric_name     LowCardinality(String),
    tag_keys        Array(LowCardinality(String)),
    tag_values      Array(String),
    timestamp       DateTime64(3, 'UTC'),
    value           Float64,
    metric_type     Enum8('gauge' = 1, 'counter' = 2, 'histogram' = 3, 'summary' = 4)
)
ENGINE = MergeTree()
PARTITION BY (org_id, toYYYYMMDD(timestamp))
ORDER BY (org_id, metric_name, tag_keys, tag_values, timestamp)
TTL timestamp + INTERVAL 90 DAY
SETTINGS index_granularity = 8192;

-- Downsampled rollup table (1-minute aggregates)
CREATE TABLE metrics_1m (
    org_id          UInt32,
    metric_name     LowCardinality(String),
    tag_keys        Array(LowCardinality(String)),
    tag_values      Array(String),
    timestamp       DateTime64(3, 'UTC'),
    min_value       Float64,
    max_value       Float64,
    avg_value       Float64,
    sum_value       Float64,
    count           UInt64
)
ENGINE = AggregatingMergeTree()
PARTITION BY (org_id, toYYYYMM(timestamp))
ORDER BY (org_id, metric_name, tag_keys, tag_values, timestamp)
TTL timestamp + INTERVAL 1 YEAR;

-- Materialized view for automatic rollup
CREATE MATERIALIZED VIEW metrics_1m_mv TO metrics_1m AS
SELECT
    org_id,
    metric_name,
    tag_keys,
    tag_values,
    toStartOfMinute(timestamp) AS timestamp,
    min(value) AS min_value,
    max(value) AS max_value,
    avg(value) AS avg_value,
    sum(value) AS sum_value,
    count() AS count
FROM metrics
GROUP BY org_id, metric_name, tag_keys, tag_values, timestamp;
```

### 3.4 Trace/Span Schema

```sql
CREATE TABLE spans (
    trace_id        FixedString(32),
    span_id         FixedString(16),
    parent_span_id  FixedString(16),
    org_id          UInt32,
    service_name    LowCardinality(String),
    operation_name  LowCardinality(String),
    span_kind       Enum8('INTERNAL'=0, 'SERVER'=1, 'CLIENT'=2, 'PRODUCER'=3, 'CONSUMER'=4),
    start_time      DateTime64(6, 'UTC'),
    duration_ns     UInt64,
    status_code     Enum8('UNSET'=0, 'OK'=1, 'ERROR'=2),
    status_message  String,
    tag_keys        Array(LowCardinality(String)),
    tag_values      Array(String),
    events          Nested(
                        name String,
                        timestamp DateTime64(6, 'UTC'),
                        attributes Map(String, String)
                    ),
    resource_tags   Map(LowCardinality(String), String)
)
ENGINE = MergeTree()
PARTITION BY (org_id, toYYYYMMDD(start_time))
ORDER BY (org_id, service_name, operation_name, start_time, trace_id)
TTL start_time + INTERVAL 14 DAY
SETTINGS index_granularity = 8192;

-- Secondary index for trace_id lookups
ALTER TABLE spans ADD INDEX idx_trace_id (trace_id) TYPE bloom_filter GRANULARITY 4;
```

### 3.5 Alert Rules Schema

```sql
CREATE TABLE alert_rules (
    id              UUID PRIMARY KEY,
    org_id          UInt32,
    name            String,
    description     String,
    type            Enum8('threshold'=1, 'anomaly'=2, 'composite'=3, 'log_pattern'=4),
    signal          Enum8('logs'=1, 'metrics'=2, 'traces'=3),
    query           String,
    conditions      JSON,      -- threshold, comparison, window, etc.
    severity        Enum8('info'=1, 'warn'=2, 'error'=3, 'critical'=4),
    notification_channels Array(String),
    escalation_policy_id  Nullable(UUID),
    tags            Array(String),
    enabled         Boolean DEFAULT true,
    mute_until      Nullable(DateTime),
    created_by      String,
    created_at      DateTime DEFAULT now(),
    updated_at      DateTime DEFAULT now()
);

CREATE TABLE alert_events (
    id              UUID,
    rule_id         UUID,
    org_id          UInt32,
    status          Enum8('triggered'=1, 'acknowledged'=2, 'resolved'=3, 'snoozed'=4),
    triggered_at    DateTime64(3, 'UTC'),
    resolved_at     Nullable(DateTime64(3, 'UTC')),
    value           Float64,
    threshold       Float64,
    message         String,
    notification_log Array(Tuple(channel String, sent_at DateTime, status String))
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(triggered_at)
ORDER BY (org_id, rule_id, triggered_at);
```

---

## 4. High-Level Architecture

```
  +--------------------------------------------------------------------------+
  |                              APPLICATION LAYER                            |
  |                                                                           |
  |  +----------+  +----------+  +----------+  +----------+  +----------+   |
  |  | Service A|  | Service B|  | Service C|  |  Infra   |  | Cloud    |   |
  |  |  (Java)  |  |  (Go)    |  | (Python) |  | (syslog) |  | (Lambda) |   |
  |  +----+-----+  +----+-----+  +----+-----+  +----+-----+  +----+-----+   |
  |       |              |              |              |              |        |
  +-------+--------------+--------------+--------------+--------------+-------+
          |              |              |              |              |
          v              v              v              v              v
  +--------------------------------------------------------------------------+
  |                           COLLECTION LAYER                                |
  |                                                                           |
  |  +---------------+  +---------------+  +---------------+  +------------+ |
  |  |  OTel Agent   |  |  Fluentd /    |  |  Prometheus   |  |  StatsD /  | |
  |  |  (sidecar)    |  |  Vector       |  |  Node Export  |  |  DogStatsD | |
  |  |               |  |  (DaemonSet)  |  |               |  |            | |
  |  | Logs+Traces   |  |  Logs         |  |  Metrics      |  | Custom Met.| |
  |  | +Metrics      |  |               |  |               |  |            | |
  |  +-------+-------+  +-------+-------+  +-------+-------+  +------+-----+ |
  |          |                  |                   |                 |        |
  +----------+------------------+-------------------+-----------------+-------+
             |                  |                   |                 |
             v                  v                   v                 v
  +--------------------------------------------------------------------------+
  |                    MESSAGE QUEUE / BUFFER LAYER                            |
  |                                                                           |
  |  +-------------------------------------------------------------------+   |
  |  |                         Apache Kafka                               |   |
  |  |                                                                    |   |
  |  |   Topic: logs          Topic: metrics       Topic: traces          |   |
  |  |   (100 partitions)     (50 partitions)      (50 partitions)        |   |
  |  |                                                                    |   |
  |  |   Retention: 24h       Retention: 6h        Retention: 12h         |   |
  |  +-------------------------------------------------------------------+   |
  |                                                                           |
  +-----------+--------------------+--------------------+---------------------+
              |                    |                    |
              v                    v                    v
  +--------------------------------------------------------------------------+
  |                   PROCESSING / ENRICHMENT LAYER                           |
  |                                                                           |
  |  +------------------+  +------------------+  +------------------+        |
  |  |  Log Processor    |  |  Metrics Agg.    |  |  Trace Assembler |        |
  |  |                   |  |                   |  |                  |        |
  |  |  - Parse / grok   |  |  - Pre-aggregate  |  |  - Span linking  |        |
  |  |  - Enrich (geo,   |  |  - Downsample     |  |  - Service graph |        |
  |  |    k8s metadata)  |  |  - Tag normalize  |  |  - Error flagging|        |
  |  |  - PII redaction  |  |  - Rate/counter   |  |  - Tail sampling |        |
  |  |  - Severity map   |  |    conversion     |  |    decisions     |        |
  |  |  - Deduplication  |  |                   |  |                  |        |
  |  +--------+----------+  +--------+----------+  +--------+---------+        |
  |           |                      |                      |                  |
  +-----------+----------------------+----------------------+------------------+
              |                      |                      |
              v                      v                      v
  +--------------------------------------------------------------------------+
  |                            STORAGE LAYER                                  |
  |                                                                           |
  |  +------------------+  +------------------+  +------------------+        |
  |  |  Elasticsearch   |  |  ClickHouse /    |  |  ClickHouse /    |        |
  |  |  (Log Storage)   |  |  Mimir / VicMet  |  |  Tempo / Jaeger  |        |
  |  |                  |  |  (Metrics TSDB)  |  |  (Trace Store)   |        |
  |  |  Hot:  NVMe SSD  |  |                  |  |                  |        |
  |  |  Warm: SSD       |  |  Raw: 15-sec res |  |  Recent: 14 days |        |
  |  |  Cold: HDD       |  |  1m rollup: 90d  |  |  Archive: S3     |        |
  |  |  Frozen: S3      |  |  1h rollup: 1yr  |  |                  |        |
  |  +------------------+  +------------------+  +------------------+        |
  |                                                                           |
  |  +-------------------------------------------------------------------+   |
  |  |                    Object Storage (S3 / GCS)                       |   |
  |  |              Long-term archive, compliance, frozen tier            |   |
  |  +-------------------------------------------------------------------+   |
  |                                                                           |
  +----------+---------------------+---------------------+-------------------+
             |                     |                     |
             v                     v                     v
  +--------------------------------------------------------------------------+
  |                    QUERY & PRESENTATION LAYER                             |
  |                                                                           |
  |  +--------------+  +--------------+  +--------------+  +--------------+  |
  |  |  Query API   |  |  Alerting    |  |  Dashboard   |  |  CLI / SDK   |  |
  |  |  Gateway     |  |  Engine      |  |  (Grafana /  |  |              |  |
  |  |              |  |              |  |   Kibana)    |  |              |  |
  |  |  Unified     |  |  Rules eval  |  |              |  |  Log tail    |  |
  |  |  query lang  |  |  Anomaly det |  |  Realtime    |  |  Metric push |  |
  |  |  Fan-out     |  |  PagerDuty   |  |  charts      |  |  Trace query |  |
  |  |  Caching     |  |  Slack/Email |  |  Templates   |  |              |  |
  |  +--------------+  +--------------+  +--------------+  +--------------+  |
  |                                                                           |
  +--------------------------------------------------------------------------+
```

### Three Pillars of Observability

```
         +----------------------------------------------+
         |           OBSERVABILITY                       |
         |                                               |
         |   +-------+   +---------+   +--------+       |
         |   | Logs  |   | Metrics |   | Traces |       |
         |   |       |   |         |   |        |       |
         |   | WHAT  |   | HOW     |   | WHERE  |       |
         |   | hap-  |   | the     |   | the    |       |
         |   | pened |   | system  |   | request|       |
         |   |       |   | behaves |   | went   |       |
         |   +---+---+   +----+----+   +---+----+       |
         |       |            |            |             |
         |       +------------+------------+             |
         |                    |                          |
         |           Correlated by                       |
         |           trace_id, service,                  |
         |           timestamp, tags                     |
         +----------------------------------------------+
```

---

## 5. Log Collection & Ingestion

### 5.1 Agent-Based Collection

```
  Application Process
  +-----------------------------+
  |  App Code                   |
  |  +--------------------+     |           +--------------------+
  |  | Logger Library      |     |           | Container Runtime  |
  |  | (log4j / zap /     |-----+--stdout-->| (Docker/containerd)|
  |  |  structlog / slog) |     |           +----------+---------+
  |  +--------------------+     |                      |
  +-----------------------------+                      v
                                             +--------------------+
                                             | Log File / Journal |
                                             | /var/log/containers|
                                             +----------+---------+
                                                        |
                                               +--------v---------+
                                               | Collection Agent  |
                                               | (Vector/Fluentd/  |
                                               |  OTel Collector)  |
                                               |                   |
                                               |  - Tail files     |
                                               |  - Parse formats  |
                                               |  - Buffer locally |
                                               |  - Batch & send   |
                                               +--------+----------+
                                                        |
                                                        v
                                                    To Kafka
```

### 5.2 Collection Agent Comparison

| Feature | Fluentd | Vector | OTel Collector |
|---------|---------|--------|----------------|
| Language | Ruby + C | Rust | Go |
| Memory usage | ~40 MB | ~15 MB | ~30 MB |
| Throughput | ~10K events/s | ~50K events/s | ~30K events/s |
| Configuration | Ruby DSL | TOML/YAML | YAML |
| Plugin ecosystem | 800+ plugins | Built-in transforms | Growing |
| Signals supported | Logs only | Logs + Metrics | Logs + Metrics + Traces |
| Backpressure | Plugin-dependent | Built-in | Built-in |
| Best for | Legacy, Kubernetes | High throughput | Unified observability |

### 5.3 Structured Logging Best Practices

```
GOOD (structured JSON):
{
  "timestamp": "2026-03-01T12:00:00.123Z",
  "level": "ERROR",
  "service": "order-service",
  "message": "Failed to process order",
  "order_id": "ord_12345",
  "customer_id": "cust_789",
  "error": "insufficient_funds",
  "duration_ms": 234
}

BAD (unstructured):
2026-03-01 12:00:00 ERROR Failed to process order ord_12345
  for customer cust_789: insufficient_funds (took 234ms)

WHY structured is better:
  - Machine-parseable without regex/grok patterns
  - Consistent schema enables typed indexing
  - Searchable by any field without full-text parsing
  - Easily aggregatable for metrics extraction
```

### 5.4 Log Levels and When to Use Them

```
+----------+------+------------------------------------------+------------------+
| Level    | Num  | When to Use                              | Volume Impact    |
+----------+------+------------------------------------------+------------------+
| TRACE    |  1   | Detailed debugging, method entry/exit    | Extremely high   |
| DEBUG    |  5   | Diagnostic info for developers           | High             |
| INFO     |  9   | Normal operations, request completed     | Medium           |
| WARN     | 13   | Unexpected but recoverable situations    | Low              |
| ERROR    | 17   | Failed operations requiring attention    | Low              |
| FATAL    | 21   | Unrecoverable errors, process will exit  | Very rare        |
+----------+------+------------------------------------------+------------------+

Production recommendation:
  - Default level: INFO
  - Enable DEBUG per-service via dynamic config (feature flags)
  - Never log TRACE in production
  - WARN and above: always log, always alert-eligible
```

### 5.5 Sampling Strategies

```python
# Head sampling: Decide at trace/log creation time
def head_sample(trace_id, sample_rate=0.1):
    """Deterministic sampling based on trace_id hash.
    Same trace_id always gets same decision across services."""
    hash_value = fnv1a_hash(trace_id) % 10000
    return hash_value < (sample_rate * 10000)

# Tail sampling: Decide after seeing all data
def tail_sample(trace):
    """Keep all interesting traces, sample boring ones."""
    if trace.has_error:
        return True                  # Keep all errors
    if trace.duration_ms > 5000:
        return True                  # Keep slow traces
    if trace.is_new_deployment:
        return True                  # Keep canary traffic
    return random() < 0.01           # 1% of normal traces

# Dynamic sampling: Adjust rate based on volume
def dynamic_sample(service, current_rate_per_sec, target_rate=1000):
    """Automatically reduce sampling when volume spikes."""
    if current_rate_per_sec <= target_rate:
        return 1.0                   # Keep everything
    return target_rate / current_rate_per_sec
```

### 5.6 Backpressure Handling

```
Normal Flow:
  Agent --(100K/s)--> Kafka --(100K/s)--> Processor --(100K/s)--> Storage

Backpressure (storage slow):
  Agent --(100K/s)--> Kafka --(100K/s)--> Processor --(30K/s)--> Storage
                                                |                    |
                                                |  Consumer lag      | Slow writes
                                                |  increases         |
                                                v                    |
                                          Kafka buffers up to        |
                                          24h retention              |

Backpressure strategies (ordered by preference):
  1. Buffer in Kafka      - Increase partition count, extend retention
  2. Agent disk buffer    - Write to local disk when network is slow
  3. Adaptive sampling    - Reduce sample rate during spikes
  4. Priority queues      - ERROR/FATAL always ingested; DEBUG dropped first
  5. Circuit breaker      - Stop sending to prevent cascade failure
  6. Load shedding        - Drop lowest-priority data (TRACE/DEBUG)
```

---

## 6. Distributed Tracing

### 6.1 Trace and Span Model

```
  Trace: A single request flowing through the system

  +--------------------------------------------------------------------+
  | trace_id: 4bf92f3577b34da6a3ce929d0e0e4736                         |
  |                                                                     |
  | +-- api-gateway: POST /api/orders ---------------------- 847ms ---+|
  | |                                                                  ||
  | |  +-- auth-service: validateToken ---- 12ms ---+                  ||
  | |  +--------------------------------------------+                  ||
  | |                                                                  ||
  | |  +-- order-service: createOrder -------------- 820ms ---------+  ||
  | |  |                                                             |  ||
  | |  |  +-- inventory-service: checkStock -- 45ms --+              |  ||
  | |  |  +-------------------------------------------+              |  ||
  | |  |                                                             |  ||
  | |  |  +-- payment-service: charge --------- 750ms -- ERROR --+  |  ||
  | |  |  |                                                       |  |  ||
  | |  |  |  +-- stripe-client: POST /charges -- 730ms TIMEOUT -+ |  |  ||
  | |  |  |  +-------------------------------------------------+ |  |  ||
  | |  |  +-------------------------------------------------------+  |  ||
  | |  +--------------------------------------------------------------+  ||
  | +------------------------------------------------------------------+|
  +---------------------------------------------------------------------+

  Each box is a "Span":
    - span_id:        Unique ID for this unit of work
    - parent_span_id: Links child to parent span
    - service_name:   Which microservice
    - operation_name: What operation (HTTP endpoint, DB query, etc.)
    - start_time:     When it started (nanosecond precision)
    - duration:       How long it took
    - status:         OK, ERROR, or UNSET
    - attributes:     Key-value metadata (http.method, db.statement, etc.)
    - events:         Timestamped annotations (exceptions, logs)
```

### 6.2 Context Propagation

```
  Service A                    Service B                   Service C
  +-----------------+         +-----------------+         +------------------+
  |                 |  HTTP   |                 |  gRPC   |                  |
  |  Create span    |-------->|  Extract context|-------->|  Extract context |
  |  Inject context | Headers |  Create child   | Metadat |  Create child    |
  |  into headers   |         |  span           |         |  span            |
  |                 |         |  Inject context  |         |                  |
  +-----------------+         +-----------------+         +------------------+

  W3C Trace Context Headers (standard):
    traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
                 |  |                                 |                 |
                 |  trace-id (128-bit)                span-id (64-bit) |
                 version                                          trace-flags
                                                                  (01 = sampled)

    tracestate: vendor1=value1,vendor2=value2
                (vendor-specific propagation data)

  Propagation in different transports:
    HTTP:    traceparent / tracestate headers
    gRPC:    Metadata (same headers)
    Kafka:   Message headers
    SQS:     Message attributes
    Lambda:  X-Amzn-Trace-Id (converted at boundary)
```

### 6.3 Head Sampling vs Tail Sampling

```
HEAD SAMPLING (at start):
  +--------+         +------------+
  | Client |--req--> | Service A  |-- sampled=true? --> Continue tracing
  +--------+         | (decides)  |                     across all services
                     +------------+

  Pros:                              Cons:
  + Low overhead                     - May miss interesting traces
  + Simple implementation            - Cannot sample based on outcome
  + Consistent across services       - Errors/slow requests may be dropped
  + Predictable storage costs


TAIL SAMPLING (at end):
  +--------+   +-------+   +-------+   +--------------+   +--------+
  | Client |-->| Svc A |-->| Svc B |-->| Tail Sampler |-->| Storage|
  +--------+   +---+---+   +---+---+   | (collector)  |   +--------+
                   |            |       |              |
                   +--spans---->+------>| - Collect all|
                                        |   spans      |
                                        | - Wait for   |
                                        |   trace to   |
                                        |   complete   |
                                        | - Decide:    |
                                        |   keep/drop  |
                                        +--------------+

  Pros:                              Cons:
  + Can keep all errors              - Higher memory (buffer all spans)
  + Can keep slow traces             - More complex architecture
  + Better signal-to-noise ratio     - Spans must be routed by trace_id
  + Policy-driven decisions          - Latency before data available

  RECOMMENDATION: Use both!
    - Head sampling at 10% as baseline
    - Tail sampling to capture 100% of errors and slow traces
    - Results in ~15-20% effective sampling with high signal quality
```

### 6.4 Trace Storage Architecture

```
  +---------------------------------------------------------------+
  |                    Trace Storage Tiers                          |
  |                                                                |
  |  +------------------+   +-----------------+   +-------------+  |
  |  |   Hot Storage     |   |  Warm Storage    |   |   Cold      |  |
  |  |   (ClickHouse)    |   |  (ClickHouse)    |   |   (S3)      |  |
  |  |                   |   |                  |   |             |  |
  |  |   Last 48 hours   |   |  Last 14 days    |   |  90 days    |  |
  |  |   Full resolution |   |  Service graphs  |   |  Sampled    |  |
  |  |   NVMe SSD        |   |  + error traces  |   |  Parquet    |  |
  |  |                   |   |  SSD             |   |             |  |
  |  |   Query: <100ms   |   |  Query: <500ms   |   |  Query:     |  |
  |  |                   |   |                  |   |  <30sec     |  |
  |  +------------------+   +-----------------+   +-------------+  |
  +---------------------------------------------------------------+
```

---

## 7. Metrics Pipeline

### 7.1 Pull vs Push Models

```
PULL MODEL (Prometheus):
  +--------------+                    +-------------------+
  |  Application |                    |   Prometheus       |
  |              |   GET /metrics     |                   |
  |  /metrics <--+--------------------+   - Scrapes every |
  |  endpoint    |   (every 15s)      |     15 seconds    |
  |              |-------------------->   - Stores TSDB   |
  |  Exports:    |   Prometheus       |   - Service disc. |
  |  counters,   |   exposition       |     via k8s API   |
  |  gauges,     |   format           |                   |
  |  histograms  |                    +-------------------+
  +--------------+

  Pros:                              Cons:
  + Easy to debug (curl /metrics)    - Requires network access to targets
  + Service discovery driven         - Not ideal for short-lived jobs
  + No client-side buffering         - Scrape interval limits resolution
  + Central control of scrape rate   - Firewalls/NAT can be problematic


PUSH MODEL (StatsD / DogStatsD):
  +--------------+                    +-------------------+
  |  Application |  UDP/TCP push      |   StatsD Server   |
  |              |-------------------->                   |
  |  statsd.     |                    |   - Aggregates    |
  |  increment(  |  Fire-and-forget   |     locally       |
  |    'orders', |  (no response)     |   - Flushes every |
  |    tags={})  |                    |     10 seconds    |
  |              |                    |   - Forwards to   |
  +--------------+                    |     storage       |
                                      +-------------------+

  Pros:                              Cons:
  + Works behind firewalls/NAT       - Client must buffer/batch
  + Good for short-lived processes   - Potential data loss (UDP)
  + Low latency emission             - Harder to debug
  + No /metrics endpoint needed      - Client-side complexity


HYBRID (OpenTelemetry - recommended):
  Application --(OTLP push)--> OTel Collector --> Multiple backends
                                    |
                                    +--> Prometheus (remote write)
                                    +--> Datadog
                                    +--> ClickHouse
```

### 7.2 Time-Series Data Model

```
A metric data point:
  +-------------------------------------------------+
  |  Metric Name:  http_request_duration_seconds     |
  |  Labels/Tags:  {method="POST", path="/api/orders"|
  |                 service="order-svc", env="prod"}  |
  |  Timestamp:    2026-03-01T12:00:15.000Z          |
  |  Value:        0.247 (seconds)                    |
  |  Type:         histogram                          |
  +-------------------------------------------------+

Cardinality explosion warning:
  Labels with high cardinality DESTROY performance:
    BAD:   {user_id="12345", request_id="abc-def"}    -- millions of series
    GOOD:  {method="POST", status="200", env="prod"}  -- bounded combinations

  Cardinality budget:
    50M active time series = safe for a large cluster
    500M active time series = requires sharding and careful planning
    5B active time series = almost certainly a cardinality bug
```

### 7.3 Aggregation and Downsampling

```
  Raw data (15-second resolution):
  --------------------------------------------------
  12:00:00  12:00:15  12:00:30  12:00:45  12:01:00
    45.2      47.8      92.1      88.3      52.0
  --------------------------------------------------
                        |
                        v  1-minute rollup
  --------------------------------------------------
  12:00:00                                12:01:00
    min=45.2  max=92.1  avg=68.35  count=4  sum=273.4
  --------------------------------------------------
                        |
                        v  1-hour rollup
  --------------------------------------------------
  12:00:00                                 13:00:00
    min=12.1  max=98.7  avg=55.2  count=240  p99=95.3
  --------------------------------------------------

  Storage savings:
    Raw 15s:     5,760 points/day/series * 16B = 92 KB/day
    1-min:       1,440 points/day/series * 40B = 56 KB/day
    1-hour:         24 points/day/series * 40B = 960 B/day

  Retention policy:
    Raw 15s data:     7 days   (operational debugging)
    1-minute rollup:  90 days  (recent trends)
    1-hour rollup:    2 years  (long-term capacity planning)
```

### 7.4 PromQL Examples for Common Queries

```promql
# Request rate (requests per second) over last 5 minutes
rate(http_requests_total{service="api-gateway"}[5m])

# Error rate percentage
sum(rate(http_requests_total{status=~"5.."}[5m]))
/
sum(rate(http_requests_total[5m]))
* 100

# P99 latency from histogram
histogram_quantile(0.99,
  sum(rate(http_request_duration_seconds_bucket{service="order-svc"}[5m]))
  by (le)
)

# CPU usage per pod
100 - (avg by (pod) (
  rate(container_cpu_usage_seconds_total{namespace="production"}[5m])
) * 100)

# Memory usage percentage
container_memory_working_set_bytes{namespace="production"}
/
container_spec_memory_limit_bytes{namespace="production"}
* 100

# Disk space prediction (linear extrapolation)
predict_linear(node_filesystem_avail_bytes{mountpoint="/"}[6h], 24*3600)
```

---

## 8. Elasticsearch Deep Dive

### 8.1 Inverted Index

```
  Documents:
    doc_1: "payment processing failed timeout"
    doc_2: "payment gateway error connection refused"
    doc_3: "order processing completed successfully"

  Inverted Index:
  +-----------------+------------------------+
  | Term             | Posting List           |
  +-----------------+------------------------+
  | payment          | [doc_1, doc_2]         |
  | processing       | [doc_1, doc_3]         |
  | failed           | [doc_1]                |
  | timeout          | [doc_1]                |
  | gateway          | [doc_2]                |
  | error            | [doc_2]                |
  | connection       | [doc_2]                |
  | refused          | [doc_2]                |
  | order            | [doc_3]                |
  | completed        | [doc_3]                |
  | successfully     | [doc_3]                |
  +-----------------+------------------------+

  Query: "payment AND timeout"
    -> Intersect posting lists: [doc_1, doc_2] ^ [doc_1] = [doc_1]

  For log search, keyword fields use doc_values (columnar storage)
  instead of inverted index for exact match and aggregations.
```

### 8.2 Sharding Strategy

```
  Index: logs-2026.03.01
  +--------------------------------------------------------------+
  |                                                              |
  |  Shard 0 (P)    Shard 1 (P)    Shard 2 (P)    Shard 3 (P)  |
  |  +----------+   +----------+   +----------+   +----------+  |
  |  | 25% data |   | 25% data |   | 25% data |   | 25% data |  |
  |  | Node A   |   | Node B   |   | Node C   |   | Node D   |  |
  |  +----------+   +----------+   +----------+   +----------+  |
  |  +----------+   +----------+   +----------+   +----------+  |
  |  | Replica  |   | Replica  |   | Replica  |   | Replica  |  |
  |  | Node C   |   | Node D   |   | Node A   |   | Node B   |  |
  |  +----------+   +----------+   +----------+   +----------+  |
  |                                                              |
  +--------------------------------------------------------------+

  Shard sizing guidelines:
    - Target: 20-50 GB per shard
    - Max recommended: 65 GB per shard
    - Min recommended: 10 GB per shard (avoid tiny shards)

  Shards per index:
    Daily log volume per index: 864 TB / day (if single index)
    With per-service indexing: 864 TB / 2000 services = ~432 GB/service/day
    Shards per service index:  432 GB / 40 GB = ~11 shards

  Strategy: Time-based indices with rollover
    logs-payment-service-000001  (rolls over at 50GB or 1 day)
    logs-payment-service-000002
    logs-payment-service-000003
    ...
```

### 8.3 Index Lifecycle Management (ILM)

```
  +----------+      +----------+      +----------+      +----------+
  |   HOT    |----->|  WARM    |----->|  COLD    |----->|  DELETE   |
  |          |      |          |      |          |      |  / FREEZE |
  | NVMe SSD |      | SSD      |      | HDD      |      |  (S3)    |
  | 0-2 days |      | 2-30d    |      | 30-365d  |      | >365d    |
  |          |      |          |      |          |      |          |
  | Write +  |      | Read-    |      | Rare     |      | Complianc|
  | Search   |      | heavy    |      | access   |      | only     |
  +----------+      +----------+      +----------+      +----------+

  Phase transitions and actions:
  +----------+------------------+------------------------------------+
  | Phase    | Trigger          | Actions                            |
  +----------+------------------+------------------------------------+
  | Hot      | On write         | Rollover at 50GB or 1 day          |
  |          |                  | 1 replica, refresh_interval=5s     |
  +----------+------------------+------------------------------------+
  | Warm     | 2 days after     | Force merge to 1 segment           |
  |          | rollover         | Shrink from 6 shards to 1          |
  |          |                  | Enable best_compression            |
  |          |                  | Set read-only, refresh=30s         |
  +----------+------------------+------------------------------------+
  | Cold     | 30 days after    | Freeze index (no memory overhead)  |
  |          | rollover         | Move to cold nodes (HDD)           |
  |          |                  | Searchable snapshot (S3 backed)    |
  |          |                  | 0 replicas                         |
  +----------+------------------+------------------------------------+
  | Frozen   | 365 days         | Fully mounted from S3              |
  |          |                  | No local storage needed            |
  |          |                  | Very slow queries acceptable       |
  +----------+------------------+------------------------------------+
  | Delete   | Per retention    | Delete index entirely              |
  |          | policy (e.g. 7yr)|                                    |
  +----------+------------------+------------------------------------+
```

### 8.4 Hot-Warm-Cold Node Architecture

```
  +--------------------------------------------------------------------+
  |                    Elasticsearch Cluster                             |
  |                                                                     |
  |  Master Nodes (3x, dedicated, no data):                            |
  |  +---------+  +---------+  +---------+                             |
  |  |Master 1 |  |Master 2 |  |Master 3 |  Cluster state, shard      |
  |  | 8 CPU   |  | 8 CPU   |  | 8 CPU   |  allocation, ILM mgmt     |
  |  | 16 GB   |  | 16 GB   |  | 16 GB   |                            |
  |  +---------+  +---------+  +---------+                             |
  |                                                                     |
  |  Hot Nodes (20x):                                                   |
  |  +---------+  +---------+  +---------+  ...                        |
  |  | 32 CPU  |  | 32 CPU  |  | 32 CPU  |     High CPU + RAM         |
  |  | 128 GB  |  | 128 GB  |  | 128 GB  |     NVMe SSD (8 TB)       |
  |  | NVMe    |  | NVMe    |  | NVMe    |     Latest indices         |
  |  +---------+  +---------+  +---------+     Active writes           |
  |                                                                     |
  |  Warm Nodes (30x):                                                  |
  |  +---------+  +---------+  +---------+  ...                        |
  |  | 16 CPU  |  | 16 CPU  |  | 16 CPU  |     Medium CPU + RAM       |
  |  | 64 GB   |  | 64 GB   |  | 64 GB   |     SSD (16 TB)           |
  |  | SSD     |  | SSD     |  | SSD     |     Older indices          |
  |  +---------+  +---------+  +---------+     Read-only               |
  |                                                                     |
  |  Cold/Frozen Nodes (10x):                                           |
  |  +---------+  +---------+  +---------+  ...                        |
  |  | 8 CPU   |  | 8 CPU   |  | 8 CPU   |     Low CPU + RAM          |
  |  | 32 GB   |  | 32 GB   |  | 32 GB   |     HDD (50 TB) + S3      |
  |  | HDD+S3  |  | HDD+S3  |  | HDD+S3  |     Searchable snapshots  |
  |  +---------+  +---------+  +---------+     Rare queries            |
  |                                                                     |
  |  Coordinating Nodes (5x, no data):                                 |
  |  +---------+  +---------+  +---------+  ...                        |
  |  | 16 CPU  |  | 16 CPU  |  | 16 CPU  |     Scatter-gather         |
  |  | 64 GB   |  | 64 GB   |  | 64 GB   |     Query routing          |
  |  | No disk |  | No disk |  | No disk |     Result merge            |
  |  +---------+  +---------+  +---------+                             |
  +--------------------------------------------------------------------+
```

### 8.5 Search Optimization Techniques

```
  1. Index-per-day strategy:
     Query "last 1 hour" -> only searches 1 index (not all history)

  2. Routing by service:
     _routing = service_name -> all logs for a service on same shard
     Single-shard queries instead of scatter-gather across all shards

  3. Keyword vs Text fields:
     - severity: keyword (exact match, no analysis)
     - body:     text (full-text search with analyzer)
     - host:     keyword (exact match filtering)

  4. Filter context vs Query context:
     - Filters: cached, no scoring (severity:ERROR, service:payment)
     - Queries: scored, not cached (body:"timeout" with relevance)
     - Always put exact matches in filter context

  5. Date range prefiltering:
     Elasticsearch checks index names before opening shards.
     logs-2026.03.01 can be skipped entirely if query is for 2026.02.28.

  6. Avoid expensive queries:
     BAD:  wildcard leading ("*timeout*")  -> scans entire index
     GOOD: prefix ("timeout*")            -> uses index efficiently
     GOOD: exact match (severity:ERROR)   -> single term lookup

  7. Scroll / Search After for pagination:
     BAD:  from=10000, size=10 (deep pagination, O(from+size))
     GOOD: search_after=[last_sort_value] (cursor-based, O(size))
```

---

## 9. Alerting System

### 9.1 Alert Rules Engine

```
  +--------------------------------------------------------------+
  |                    Alerting Engine                             |
  |                                                               |
  |  +--------------+    +---------------+    +--------------+    |
  |  |  Rule Store   |    |  Evaluator    |    |  State Store |    |
  |  |               |    |               |    |              |    |
  |  |  2000 rules   |--->|  Every 60s:   |--->|  Current     |    |
  |  |  per org      |    |  - Fetch data |    |  alert state |    |
  |  |               |    |  - Eval rules |    |  (firing,    |    |
  |  |  Partitioned  |    |  - Compare to |    |   pending,   |    |
  |  |  across eval  |    |    thresholds |    |   resolved)  |    |
  |  |  workers      |    |  - Update     |    |              |    |
  |  |               |    |    state      |    |  Redis +     |    |
  |  |               |    |               |    |  PostgreSQL  |    |
  |  +--------------+    +-------+-------+    +--------------+    |
  |                              |                                 |
  |                              v                                 |
  |                    +------------------+                        |
  |                    |  Notification    |                        |
  |                    |  Router          |                        |
  |                    |                  |                        |
  |                    |  +------------+  |                        |
  |                    |  | PagerDuty  |  |                        |
  |                    |  | Slack      |  |                        |
  |                    |  | Email      |  |                        |
  |                    |  | Webhook    |  |                        |
  |                    |  | OpsGenie   |  |                        |
  |                    |  | MS Teams   |  |                        |
  |                    |  +------------+  |                        |
  |                    +------------------+                        |
  +--------------------------------------------------------------+
```

### 9.2 Alert Types

```python
# 1. Threshold Alert
def evaluate_threshold(rule, data_points):
    """Fires when metric crosses a static threshold."""
    window = data_points.last(rule.window)  # e.g., last 5 minutes
    value = aggregate(window, rule.aggregation)  # e.g., avg, sum, count

    if rule.comparison == "above" and value > rule.threshold:
        return AlertResult(status="FIRING", value=value)
    if rule.comparison == "below" and value < rule.threshold:
        return AlertResult(status="FIRING", value=value)
    return AlertResult(status="OK", value=value)


# 2. Anomaly Detection Alert
def evaluate_anomaly(rule, data_points):
    """Fires when metric deviates from learned baseline."""
    current = data_points.last(rule.window)
    baseline = compute_baseline(
        data_points.historical(weeks=4),
        seasonality="weekly"
    )

    current_value = aggregate(current, "avg")
    expected = baseline.expected_value()
    stddev = baseline.standard_deviation()

    deviation = abs(current_value - expected) / stddev

    if deviation > rule.sensitivity:  # e.g., 3 sigma
        return AlertResult(
            status="FIRING",
            value=current_value,
            expected=expected,
            deviation_sigma=deviation
        )
    return AlertResult(status="OK")


# 3. Composite Alert
def evaluate_composite(rule, sub_alerts):
    """Fires when multiple conditions are met simultaneously."""
    # Example: high error rate AND high latency AND low throughput
    conditions_met = sum(
        1 for sub in rule.sub_conditions
        if sub_alerts[sub.alert_id].status == "FIRING"
    )

    if rule.operator == "AND" and conditions_met == len(rule.sub_conditions):
        return AlertResult(status="FIRING")
    if rule.operator == "OR" and conditions_met > 0:
        return AlertResult(status="FIRING")
    return AlertResult(status="OK")


# 4. Log Pattern Alert
def evaluate_log_pattern(rule, log_stream):
    """Fires when log pattern frequency exceeds threshold."""
    matching_logs = log_stream.query(
        query=rule.pattern,
        time_range=rule.window
    )
    count = len(matching_logs)

    if count > rule.threshold:
        return AlertResult(
            status="FIRING",
            value=count,
            sample_logs=matching_logs[:5]
        )
    return AlertResult(status="OK")
```

### 9.3 Escalation Policies

```
  Escalation Policy: "payments-critical"
  +------------------------------------------------------------------+
  |                                                                  |
  |  Step 1 (0 min):     Notify on-call engineer via PagerDuty      |
  |                      + Slack #payments-alerts                    |
  |                      Wait: 5 minutes for acknowledgment          |
  |                                                                  |
  |  Step 2 (5 min):     Notify secondary on-call via PagerDuty     |
  |                      + Phone call to primary                     |
  |                      Wait: 10 minutes for acknowledgment         |
  |                                                                  |
  |  Step 3 (15 min):    Notify Engineering Manager                  |
  |                      + Slack #payments-escalation                |
  |                      Wait: 15 minutes for acknowledgment         |
  |                                                                  |
  |  Step 4 (30 min):    Notify VP of Engineering                    |
  |                      + Incident bridge opened automatically      |
  |                                                                  |
  +------------------------------------------------------------------+

  On-Call Rotation:
  +----------+--------------+--------------+--------------+
  | Week     | Primary      | Secondary    | Manager      |
  +----------+--------------+--------------+--------------+
  | Week 1   | Alice        | Bob          | Carol        |
  | Week 2   | Bob          | Charlie      | Carol        |
  | Week 3   | Charlie      | Alice        | Carol        |
  +----------+--------------+--------------+--------------+
```

### 9.4 Alert Fatigue Prevention

```
  Problem: Too many alerts -> humans ignore them -> real incidents missed

  Strategies:
  +-----------------------+----------------------------------------------+
  | Strategy              | Description                                  |
  +-----------------------+----------------------------------------------+
  | Deduplication         | Group identical alerts (same service +       |
  |                       | same error) into a single notification       |
  +-----------------------+----------------------------------------------+
  | Grouping              | Batch alerts from same root cause            |
  |                       | (e.g., node failure triggers 50 pod alerts)  |
  +-----------------------+----------------------------------------------+
  | Cooldown / Snooze     | After alert fires, suppress re-notification  |
  |                       | for N minutes                                |
  +-----------------------+----------------------------------------------+
  | Auto-resolve          | Automatically resolve when metric recovers   |
  |                       | (within M minutes)                           |
  +-----------------------+----------------------------------------------+
  | Severity tiering      | INFO -> Slack only                           |
  |                       | WARN -> Slack + ticket                       |
  |                       | ERROR -> PagerDuty (business hours)          |
  |                       | CRITICAL -> PagerDuty (24/7) + phone         |
  +-----------------------+----------------------------------------------+
  | Actionable require.   | Every alert MUST have a runbook link.        |
  |                       | If no one knows what to do, delete the rule. |
  +-----------------------+----------------------------------------------+
  | Alert review cadence  | Monthly review: delete alerts with           |
  |                       | >90% auto-resolve rate or <5% action rate    |
  +-----------------------+----------------------------------------------+

  Key metric: Signal-to-noise ratio
    Goal: >80% of pages should require human action
    Reality at most orgs: ~30% are actionable
```

---

## 10. Scaling Strategy

### 10.1 Kafka Partitioning for Log Ingestion

```
  Topic: logs (100 partitions)
  +--------------------------------------------------------------+
  |                                                              |
  |  Partition 0  -->  Consumer Group A (Log Processors)         |
  |  Partition 1  -->  Consumer 1: partitions [0-9]              |
  |  Partition 2  -->  Consumer 2: partitions [10-19]            |
  |  ...          -->  Consumer 3: partitions [20-29]            |
  |  Partition 99 -->  ...                                       |
  |                -->  Consumer 10: partitions [90-99]           |
  |                                                              |
  +--------------------------------------------------------------+

  Partition key strategy:
    Option A: service_name    -> All logs for a service on one partition
                               (good for ordering, risk of hot partitions)

    Option B: hash(host_id)   -> Even distribution across partitions
                               (good for throughput, loses service ordering)

    Option C: hash(org_id)    -> Tenant isolation in multi-tenant systems
                               (good for isolation, hot tenants need splitting)

  RECOMMENDED: hash(service_name + host_id)
    -> Even distribution while keeping locality for a specific instance

  Throughput per partition:
    Target:  1 MB/sec per partition (Kafka default producer batch)
    With 100 partitions: 100 MB/sec = 800 Mbps
    Need 50 GB/sec? -> 50,000 partitions across multiple Kafka clusters
                       (or use Kafka tiered storage for buffer capacity)
```

### 10.2 Elasticsearch Cluster Sizing

```
  Given: 864 TB/day compressed logs, 7-day hot retention

  Hot tier sizing:
    Daily data:          864 TB compressed
    7-day retention:     864 * 7 = 6,048 TB = ~6 PB
    Replica factor:      1 (1 primary + 1 replica) = 12 PB total
    Shard size target:   40 GB
    Number of shards:    12 PB / 40 GB = 300,000 shards
    Shards per node:     max 1,000 (with 64 GB heap)
    Minimum hot nodes:   300,000 / 1,000 = 300 nodes
    Storage per node:    12 PB / 300 = 40 TB per node (use 8x 8TB NVMe)

  REALITY CHECK: This is enormous. At this scale, you likely need:
    1. Per-service Elasticsearch clusters (not one monolith)
    2. Aggressive sampling (keep 10% of DEBUG/INFO, 100% of ERROR)
    3. ClickHouse for bulk storage (5-10x better compression)
    4. Elasticsearch only for recent searchable data

  Practical architecture at this scale:
    Elasticsearch: Last 2 days of hot data (~1.7 PB, 50 nodes)
    ClickHouse:    Last 30 days of all data (compressed)
    S3 + Parquet:  Long-term archive (query with Athena/Trino)
```

### 10.3 Storage Tiering

```
  +-------------------------------------------------------------------+
  |                    Storage Tier Comparison                          |
  |                                                                    |
  |  +---------+----------+------------+--------------+------------+   |
  |  | Tier    | Storage  | Latency    | Cost/TB/mo   | Duration   |   |
  |  +---------+----------+------------+--------------+------------+   |
  |  | Hot     | NVMe SSD | <100ms     | ~$200        | 0-7 days   |   |
  |  | Warm    | SSD      | <500ms     | ~$100        | 7-30 days  |   |
  |  | Cold    | HDD      | <5s        | ~$30         | 30-365 days|   |
  |  | Frozen  | S3       | <30s       | ~$5          | 1-7 years  |   |
  |  | Archive | S3 Glac. | hours      | ~$1          | 7+ years   |   |
  |  +---------+----------+------------+--------------+------------+   |
  |                                                                    |
  |  Cost savings: Moving 1 PB from Hot to Cold saves ~$170K/month    |
  |  Cost savings: Moving 1 PB from Hot to S3 saves ~$195K/month      |
  +-------------------------------------------------------------------+
```

### 10.4 Data Retention Policies

```python
# Retention policy configuration
RETENTION_POLICIES = {
    "logs": {
        "default": {
            "hot": "7d",
            "warm": "30d",
            "cold": "365d",
            "delete": "2555d"   # 7 years
        },
        "by_severity": {
            "DEBUG": {"hot": "1d", "warm": "7d", "delete": "30d"},
            "INFO":  {"hot": "3d", "warm": "14d", "delete": "90d"},
            "WARN":  {"hot": "7d", "warm": "30d", "delete": "365d"},
            "ERROR": {"hot": "14d", "warm": "90d", "delete": "2555d"},
            "FATAL": {"hot": "30d", "warm": "180d", "delete": "2555d"},
        },
        "by_compliance": {
            "pci_dss":  {"min_retention": "365d", "encryption": "required"},
            "hipaa":    {"min_retention": "2190d", "encryption": "required"},
            "gdpr":     {"max_retention": "depends", "pii_redaction": "required"},
            "sox":      {"min_retention": "2555d", "immutable": True},
        }
    },
    "metrics": {
        "raw_15s":  "7d",
        "rollup_1m": "90d",
        "rollup_1h": "730d",   # 2 years
        "rollup_1d": "3650d",  # 10 years
    },
    "traces": {
        "full_resolution": "14d",
        "service_graphs":  "90d",
        "error_traces":    "365d",
    }
}
```

---

## 11. Deployment Architecture

### 11.1 Multi-Region Deployment

```
  +---------------------------------------------------------------------+
  |                        REGION: US-EAST-1                             |
  |                                                                      |
  |  +-------------+  +--------------+  +---------------------------+   |
  |  | 50K Servers |  | Collection   |  | Kafka Cluster (Primary)   |   |
  |  | + Containers|->| Agents       |->| 30 brokers                |   |
  |  |             |  | (Vector)     |  | Topics: logs, metrics,    |   |
  |  +-------------+  +--------------+  |         traces            |   |
  |                                     +------------+--------------+   |
  |                                                  |                   |
  |                    +-----------------------------+                   |
  |                    |  Processing Pipeline         |                   |
  |                    |  (50 workers, k8s)           |                   |
  |                    +-----------------------------+                   |
  |                                  |                                    |
  |                                  v                                    |
  |  +------------------------------------------------------+           |
  |  |  Storage                                              |           |
  |  |  +------------+ +------------+ +----------+           |           |
  |  |  | ES Cluster | | ClickHouse | | S3       |           |           |
  |  |  | (Hot+Warm) | | (Metrics+  | | (Archive)|           |           |
  |  |  | 50 nodes   | |  Traces)   | |          |           |           |
  |  |  |            | | 20 nodes   | |          |           |           |
  |  |  +------------+ +------------+ +----------+           |           |
  |  +------------------------------------------------------+           |
  |                                                                      |
  |  +------------------------------------------------------+           |
  |  |  Query + UI Layer                                     |           |
  |  |  +----------+ +----------+ +----------+              |           |
  |  |  |Query API | |Alerting  | |Grafana   |              |           |
  |  |  |(10 pods) | |Engine    | |Dashboards|              |           |
  |  |  +----------+ +----------+ +----------+              |           |
  |  +------------------------------------------------------+           |
  |                                                                      |
  +--------------------------------------+-------------------------------+
                                         |
                Cross-region replication  |  (critical alerts + config)
                (Kafka MirrorMaker 2.0)  |
                                         |
  +--------------------------------------v-------------------------------+
  |                        REGION: EU-WEST-1                              |
  |                                                                       |
  |  +-------------+  +--------------+  +---------------------------+    |
  |  | 50K Servers |  | Collection   |  | Kafka Cluster (Primary)   |    |
  |  | + Containers|->| Agents       |->| 30 brokers                |    |
  |  |             |  | (Vector)     |  | (independent cluster)     |    |
  |  +-------------+  +--------------+  +------------+--------------+    |
  |                                                   |                   |
  |                    +------------------------------+                   |
  |                    |  Storage + Processing         |                   |
  |                    |  (mirrors US-EAST-1 arch)     |                   |
  |                    +------------------------------+                   |
  |                                                                       |
  |  GDPR Compliance:                                                     |
  |  - EU logs stay in EU region                                          |
  |  - PII redaction before cross-region replication                      |
  |  - Data residency controls per org/tenant                             |
  |                                                                       |
  +-----------------------------------------------------------------------+

  +-----------------------------------------------------------------------+
  |                    GLOBAL CONTROL PLANE                                 |
  |                                                                        |
  |  +---------------+  +---------------+  +---------------+              |
  |  |  Config Store  |  |  Alert Rules  |  |  User/Org     |              |
  |  |  (etcd/Consul) |  |  (PostgreSQL) |  |  Management   |              |
  |  |  Replicated    |  |  Multi-master |  |  (PostgreSQL) |              |
  |  +---------------+  +---------------+  +---------------+              |
  |                                                                        |
  |  DNS-based routing: logs.us.example.com / logs.eu.example.com          |
  |  Global dashboard: dashboard.example.com (reads from both regions)     |
  +-----------------------------------------------------------------------+
```

### 11.2 Disaster Recovery

```
  Recovery strategies by component:
  +------------------+-------------------+------------------------------+
  | Component        | RPO / RTO         | DR Strategy                  |
  +------------------+-------------------+------------------------------+
  | Kafka            | RPO=0, RTO<5min   | MirrorMaker 2.0 to DR region |
  |                  |                   | Async replication, lag <30s   |
  +------------------+-------------------+------------------------------+
  | Elasticsearch    | RPO<1h, RTO<30min | Snapshot to S3 every hour     |
  |                  |                   | Cross-cluster replication     |
  |                  |                   | for critical indices          |
  +------------------+-------------------+------------------------------+
  | ClickHouse       | RPO<1h, RTO<30min | Replicated tables across AZs |
  |                  |                   | S3 backups for cold data      |
  +------------------+-------------------+------------------------------+
  | Alert Rules      | RPO=0, RTO<5min   | PostgreSQL streaming replica  |
  |                  |                   | GitOps for rule definitions   |
  +------------------+-------------------+------------------------------+
  | Dashboards       | RPO<1h, RTO<15min | Dashboard-as-code (Terraform  |
  |                  |                   | or Grafana provisioning)      |
  +------------------+-------------------+------------------------------+

  Key principle: Losing logs is acceptable for DR.
  Losing alerting capability is NOT acceptable.
  Alerting must failover independently of storage.
```

---

## 12. Cost Optimization

### 12.1 Cost Breakdown at Scale

```
  Monthly cost for 100K-server monitoring platform:

  +------------------------+--------------+------------+------------+
  | Component              | Nodes/Units  | Unit Cost  | Monthly    |
  +------------------------+--------------+------------+------------+
  | Kafka brokers          | 60           | $2,000     | $120,000   |
  | ES Hot nodes (32c/128G)| 50           | $4,000     | $200,000   |
  | ES Warm nodes (16c/64G)| 80           | $2,000     | $160,000   |
  | ES Cold nodes          | 20           | $800       | $16,000    |
  | ClickHouse nodes       | 30           | $2,500     | $75,000    |
  | Processing workers     | 100          | $500       | $50,000    |
  | Collection agents      | 100,000      | $0 (OSS)   | $0*        |
  | S3 storage (archive)   | 10 PB        | $23/TB     | $230,000   |
  | Network transfer       | 5 PB         | $50/TB     | $250,000   |
  | Grafana/Kibana         | 10           | $500       | $5,000     |
  +------------------------+--------------+------------+------------+
  | TOTAL (self-hosted)    |              |            | ~$1.1M/mo  |
  +------------------------+--------------+------------+------------+
  | Datadog equivalent     | 100K hosts   | $23/host   | ~$2.3M/mo  |
  | (infrastructure only)  |              | + ingest.  | + ingest.  |
  +------------------------+--------------+------------+------------+

  * Agent CPU/memory overhead is included in server compute costs
```

### 12.2 Cost Optimization Strategies

```
  +-----------------------------+----------+-----------------------------+
  | Strategy                    | Savings  | Trade-off                   |
  +-----------------------------+----------+-----------------------------+
  | Aggressive sampling         | 50-80%   | May miss rare events        |
  | (keep 10% of DEBUG/INFO)    |          | Harder to debug edge cases  |
  +-----------------------------+----------+-----------------------------+
  | Log exclusion rules         | 10-30%   | Must maintain exclusion list|
  | (drop health checks, etc.)  |          | Risk of filtering too much  |
  +-----------------------------+----------+-----------------------------+
  | Compression (zstd)          | 60-80%   | CPU overhead for compress/  |
  |                             |          | decompress                  |
  +-----------------------------+----------+-----------------------------+
  | Metrics pre-aggregation     | 70-90%   | Lose per-instance detail    |
  | (aggregate before ingest)   |          | for old data                |
  +-----------------------------+----------+-----------------------------+
  | Short hot retention         | 40-60%   | Slow queries for older data |
  | (2 days hot vs 7 days)      |          |                             |
  +-----------------------------+----------+-----------------------------+
  | Reserved instances / spot   | 30-60%   | Commitment or interruption  |
  | (for processing workers)    |          | risk                        |
  +-----------------------------+----------+-----------------------------+
  | Tiered storage (S3 frozen)  | 90%+     | Very slow queries (seconds) |
  |                             |          | for archived data           |
  +-----------------------------+----------+-----------------------------+
```

### 12.3 Sampling vs Full Ingestion Decision Framework

```
  When to use FULL INGESTION (100%):
    - Error and Fatal severity logs (always keep)
    - Security/audit logs (compliance requirement)
    - Payment transaction logs (debugging financial issues)
    - Alert-critical metrics (SLO tracking)
    - Traces for error paths

  When to use SAMPLING:
    - DEBUG/TRACE level logs -> 1-5% sample
    - Health check logs -> exclude entirely
    - High-volume INFO logs -> 10-20% sample
    - Normal (non-error) traces -> 10% head sample
    - Per-request metrics -> pre-aggregate to per-minute

  When to use DYNAMIC SAMPLING:
    - During traffic spikes -> auto-reduce to stay within budget
    - New deployments -> temporarily increase to 100% then taper
    - After incidents -> increase for post-mortem window

  Cost impact example:
    Full ingestion:     $1.1M/month
    With sampling:      $350K/month (68% reduction)
    Key insight: 80% of logs are DEBUG/INFO that rarely get searched
```

---

## 13. Comparison: Build vs Buy

### 13.1 Platform Comparison

```
+------------------+--------------+--------------+--------------+--------------+
| Feature          | ELK Stack    | Datadog      | Grafana      | Splunk       |
|                  | (self-hosted)| (SaaS)       | Cloud (SaaS) | (SaaS/On-p.) |
+------------------+--------------+--------------+--------------+--------------+
| Logs             | Elasticsearch| Native       | Loki         | Native       |
|                  | + Kibana     |              | + Grafana    |              |
+------------------+--------------+--------------+--------------+--------------+
| Metrics          | Need to add  | Native       | Mimir        | Add-on       |
|                  | (Prometheus) |              | (Prometheus) | (ITSI)       |
+------------------+--------------+--------------+--------------+--------------+
| Traces           | Need to add  | Native (APM) | Tempo        | Add-on       |
|                  | (Jaeger)     |              |              |              |
+------------------+--------------+--------------+--------------+--------------+
| Alerting         | ElastAlert / | Native       | Grafana      | Native       |
|                  | Kibana alerts| (monitors)   | Alerting     |              |
+------------------+--------------+--------------+--------------+--------------+
| APM              | Elastic APM  | Native       | Tempo + Pyro | Splunk APM   |
+------------------+--------------+--------------+--------------+--------------+
| Ops burden       | Very High    | None         | Low-Medium   | Medium       |
+------------------+--------------+--------------+--------------+--------------+
| Cost at 100K     | ~$1.1M/mo    | ~$2.5M/mo    | ~$800K/mo    | ~$3M/mo      |
| hosts            | (infra only) | (all-in)     | (all-in)     | (all-in)     |
+------------------+--------------+--------------+--------------+--------------+
| Team required    | 5-10 SREs    | 0-1 SREs     | 2-3 SREs     | 2-3 SREs     |
+------------------+--------------+--------------+--------------+--------------+
| Search perf      | Excellent    | Excellent    | Good (Loki   | Excellent    |
|                  | (inverted    |              | uses label   |              |
|                  |  index)      |              | index, not   |              |
|                  |              |              | full-text)   |              |
+------------------+--------------+--------------+--------------+--------------+
| Data ownership   | Full         | Vendor-owned | Full (LGTM   | Vendor-owned |
|                  |              |              | stack is OSS)|              |
+------------------+--------------+--------------+--------------+--------------+
| Vendor lock-in   | None         | High         | Low          | High         |
+------------------+--------------+--------------+--------------+--------------+
| Best for         | Large teams  | All sizes,   | Cost-aware   | Enterprise   |
|                  | wanting full | especially   | teams with   | with deep    |
|                  | control      | mid-size     | k8s-native   | pockets      |
|                  |              | startups     | infra        |              |
+------------------+--------------+--------------+--------------+--------------+
```

### 13.2 Build vs Buy Decision Framework

```
  BUILD (Self-hosted ELK/LGTM stack) when:
    + You have 5+ SREs who can manage the platform
    + Data sovereignty/compliance requires on-prem or specific cloud
    + Log volume exceeds SaaS cost thresholds (usually >50TB/day)
    + You need deep customization of the pipeline
    + Organization is already running Kubernetes at scale

  BUY (Datadog/Splunk/New Relic) when:
    + Engineering team is small (<50 engineers)
    + Time-to-value matters more than cost
    + Log volume is under 10TB/day
    + You want integrated APM + logs + metrics + RUM out of box
    + On-call team is not specialized in observability infra

  HYBRID (most common at scale):
    + Metrics: Self-hosted Prometheus/Mimir (high volume, low cost)
    + Traces: SaaS or Tempo (moderate volume)
    + Logs: Self-hosted for high-volume services, SaaS for the rest
    + Alerting: Centralized SaaS (PagerDuty/OpsGenie)
    + Dashboards: Grafana (works with any backend)
```

---

## 14. Common Interview Follow-ups

### 14.1 How to Handle Log Spikes

```
  Scenario: A bad deployment causes 100x normal log volume
  (100M/sec -> 10B/sec) for one service

  Immediate response (automated):
  +----------------------------------------------------------------------+
  |                                                                      |
  |  1. Detection (within 30 seconds):                                   |
  |     - Kafka consumer lag alert fires                                 |
  |     - Log ingestion rate metric spikes                               |
  |     - Adaptive sampling kicks in automatically                       |
  |                                                                      |
  |  2. Dynamic sampling (within 1 minute):                              |
  |     - Identify the spiking service from metadata                     |
  |     - Reduce sampling for that service: 100% -> 1%                   |
  |     - Keep 100% of ERROR/FATAL regardless                           |
  |     - Other services unaffected                                      |
  |                                                                      |
  |  3. Backpressure (within 2 minutes):                                 |
  |     - Kafka buffers absorb the burst (24h retention)                 |
  |     - Agent-side disk buffering if Kafka is full                     |
  |     - Circuit breaker drops lowest priority logs                     |
  |                                                                      |
  |  4. Recovery (within 5 minutes):                                     |
  |     - Bad deployment is rolled back (or fixed)                       |
  |     - Log volume returns to normal                                   |
  |     - Kafka consumer lag drains                                      |
  |     - Sampling rates restored to normal                              |
  |                                                                      |
  +----------------------------------------------------------------------+

  Design considerations:
  - NEVER let a log spike take down the monitoring system
  - Monitoring of monitoring (meta-monitoring) is critical
  - Rate limiting per tenant/service at the ingestion gateway
  - Separate Kafka topics for high-priority (ERROR) vs low-priority (DEBUG)
```

### 14.2 Debugging a Production Issue Using Logs/Traces/Metrics

```
  Scenario: Users report "orders are failing" at 14:00 UTC

  Step-by-step investigation:
  +----------------------------------------------------------------------+
  |                                                                      |
  |  1. CHECK METRICS (30 seconds) - "How bad is it?"                   |
  |     Dashboard: order-service SLOs                                    |
  |     -> Error rate: 23% (normally 0.1%)                               |
  |     -> P99 latency: 12s (normally 200ms)                             |
  |     -> Throughput: 500 req/s (normally 2000 req/s)                   |
  |     -> Started at: 13:47 UTC                                         |
  |                                                                      |
  |  2. CHECK LOGS (1 minute) - "What errors?"                          |
  |     Query: severity:ERROR AND service:order-service                  |
  |            AND timestamp:[13:45 TO 14:00]                            |
  |     -> Top error: "connection refused: payment-service:8080"         |
  |     -> 4,500 occurrences in 15 minutes                               |
  |     -> Correlation: all from payment-service dependency              |
  |                                                                      |
  |  3. PIVOT TO PAYMENT SERVICE METRICS                                |
  |     -> payment-service pods: 0/5 running (CrashLoopBackOff)         |
  |     -> Last restart: 13:46 UTC                                       |
  |     -> Deployment: v2.4.1 deployed at 13:45 UTC                     |
  |                                                                      |
  |  4. CHECK TRACES (1 minute) - "Which requests are affected?"        |
  |     Query: service:order-service AND status:ERROR                    |
  |     -> Trace waterfall shows: order-service -> payment-service FAIL  |
  |     -> All spans to payment-service have status: UNAVAILABLE         |
  |     -> Retry spans visible (3 retries, all failed)                   |
  |                                                                      |
  |  5. ROOT CAUSE (2 minutes)                                           |
  |     payment-service logs (pre-crash):                                |
  |     -> "FATAL: OOM Killed. Memory usage 4.2GB exceeded 4GB limit"   |
  |     -> v2.4.1 introduced memory leak in connection pool              |
  |                                                                      |
  |  6. RESOLUTION                                                       |
  |     -> Rollback payment-service to v2.4.0                            |
  |     -> Pods recover, error rate drops to normal                      |
  |     -> Total time to resolution: ~5 minutes                          |
  |                                                                      |
  +----------------------------------------------------------------------+

  Key insight: The three pillars work together:
    Metrics -> DETECT (something is wrong)
    Logs    -> DIAGNOSE (what is wrong)
    Traces  -> LOCALIZE (where in the request flow)
```

### 14.3 GDPR Compliance for Logging

```
  GDPR requirements for log data:
  +----------------------------------------------------------------------+
  |                                                                      |
  |  1. PII IDENTIFICATION                                               |
  |     Log fields that may contain PII:                                 |
  |     - message body (may contain emails, names, IPs)                  |
  |     - HTTP request URLs (may contain query params with PII)          |
  |     - User-Agent (fingerprinting)                                    |
  |     - Source IP addresses (EU considers IPs as PII)                  |
  |     - Custom attributes (payment details, addresses)                 |
  |                                                                      |
  |  2. PII REDACTION PIPELINE                                           |
  |     Implemented in the processing layer (before storage):            |
  |                                                                      |
  |     Input:  "User alice@example.com failed login from 10.0.0.1"     |
  |     Output: "User [REDACTED_EMAIL] failed login from [REDACTED_IP]" |
  |                                                                      |
  |     Techniques:                                                      |
  |     - Regex patterns for emails, SSNs, credit cards                  |
  |     - Named entity recognition for names and addresses               |
  |     - IP anonymization (zero last octet: 10.0.0.0)                  |
  |     - Tokenization (replace PII with reversible token for            |
  |       authorized access)                                             |
  |                                                                      |
  |  3. RIGHT TO BE FORGOTTEN                                            |
  |     Challenge: Logs are append-only, deletion is expensive           |
  |     Solutions:                                                       |
  |     a) Pseudonymization: Replace user_id with hash(user_id + salt)  |
  |        -> To "forget": rotate the salt (all hashes become unlinkable)|
  |     b) Crypto-shredding: Encrypt PII fields with per-user key       |
  |        -> To "forget": delete the encryption key                     |
  |     c) Retention limits: Delete all logs after N days automatically  |
  |                                                                      |
  |  4. DATA RESIDENCY                                                   |
  |     - EU user logs must stay in EU regions                           |
  |     - Routing decision at collection agent level                     |
  |     - Separate Kafka clusters per region                             |
  |     - Cross-region queries use federation (not replication)          |
  |                                                                      |
  |  5. AUDIT TRAIL                                                      |
  |     - Log every query made to the logging system                     |
  |     - Who accessed what data, when, and why                          |
  |     - Tamper-proof audit log (append-only, separate storage)         |
  |                                                                      |
  +----------------------------------------------------------------------+
```

### 14.4 Real-Time Anomaly Detection

```
  Approaches to anomaly detection in observability:

  1. STATISTICAL (simple, effective for most cases):
  +----------------------------------------------------------------------+
  |                                                                      |
  |  Moving average + standard deviation:                                |
  |                                                                      |
  |  baseline = exponential_moving_average(metric, window=1h)            |
  |  stddev = rolling_stddev(metric, window=1h)                          |
  |  anomaly = abs(current - baseline) > 3 * stddev                     |
  |                                                                      |
  |  Seasonality-aware (for metrics with daily/weekly patterns):         |
  |  expected = average_of_same_time_last_4_weeks(metric)                |
  |  deviation = (current - expected) / historical_stddev                |
  |  anomaly = abs(deviation) > threshold                                |
  |                                                                      |
  +----------------------------------------------------------------------+

  2. ML-BASED (for complex patterns):
  +----------------------------------------------------------------------+
  |                                                                      |
  |  Isolation Forest:                                                   |
  |  - Unsupervised, good for multivariate anomalies                    |
  |  - Train on normal data, flag outliers                               |
  |  - Works well for infrastructure metrics                             |
  |                                                                      |
  |  LSTM Autoencoders:                                                  |
  |  - Learns temporal patterns in time series                           |
  |  - Reconstruction error indicates anomaly                            |
  |  - Good for complex seasonality                                      |
  |                                                                      |
  |  Log clustering (drain algorithm):                                   |
  |  - Parse log templates automatically                                 |
  |  - Detect new/rare log patterns as anomalies                        |
  |  - "This error message has never appeared before"                    |
  |                                                                      |
  +----------------------------------------------------------------------+

  3. PRACTICAL IMPLEMENTATION:
  +----------------------------------------------------------------------+
  |                                                                      |
  |  For interviews, recommend the hybrid approach:                      |
  |                                                                      |
  |  a) Simple threshold alerts for known failure modes                  |
  |     (error rate > 5%, latency > 2s, disk > 90%)                     |
  |                                                                      |
  |  b) Statistical anomaly detection for drift                          |
  |     (3-sigma deviation from 4-week baseline)                         |
  |                                                                      |
  |  c) ML-based detection for complex multi-signal correlations         |
  |     (only if team has ML expertise)                                  |
  |                                                                      |
  |  Key trade-off: Sensitivity vs false positives                       |
  |  - Too sensitive: alert fatigue, team ignores alerts                 |
  |  - Too conservative: miss real incidents                             |
  |  - Solution: tune per-metric, review monthly                         |
  |                                                                      |
  +----------------------------------------------------------------------+
```

### 14.5 Additional Follow-up Questions

```
Q: How do you handle multi-tenancy?
A: - Tenant ID (org_id) on every log/metric/trace
   - Kafka topics per tenant (or partition key = org_id)
   - Elasticsearch: separate indices per tenant, or index-level RBAC
   - Query-time filtering: always append org_id filter
   - Rate limiting per tenant to prevent noisy neighbor
   - Storage quotas per tenant with overage billing

Q: How do you correlate logs, metrics, and traces?
A: - trace_id links logs to traces (inject trace_id into every log)
   - service + timestamp links metrics to logs (same 5-minute window)
   - Exemplars: metrics carry sample trace_ids for drill-down
   - UI: click a metric spike -> see corresponding traces -> see logs

Q: What happens when Elasticsearch is down?
A: - Kafka buffers all logs (24h retention)
   - Alerting engine queries metrics (separate ClickHouse), not ES
   - ES recovery: consumers replay from Kafka offset
   - No data loss as long as Kafka retention > ES recovery time
   - Meta-monitoring (monitoring the monitoring) uses a separate,
     simpler system (e.g., Prometheus + Alertmanager on separate infra)

Q: How do you handle schema evolution in logs?
A: - Use Elasticsearch "flattened" type for dynamic fields
   - Schema registry for critical fields (severity, service, trace_id)
   - Processing pipeline normalizes old formats to current schema
   - Breaking changes: write to new index, alias points to both
   - Never delete fields; deprecate and stop populating

Q: How do you ensure exactly-once processing?
A: - Kafka consumer offsets + idempotent writes
   - Each log event has an ingestion_id (hash of content + timestamp)
   - Elasticsearch: use ingestion_id as document _id (upsert semantics)
   - ClickHouse: ReplacingMergeTree deduplicates on insert
   - Trade-off: exactly-once is expensive; at-least-once with
     deduplication is more practical at scale

Q: How do you handle log search across multiple data centers?
A: - Option 1: Query federation (fan-out query to each region's ES)
     Pros: Data stays local, GDPR-friendly
     Cons: Slower (cross-region latency), harder to implement
   - Option 2: Replicate all data to central cluster
     Pros: Fast queries, simple implementation
     Cons: Expensive, GDPR issues for EU data
   - Option 3: Hybrid (metadata centralized, raw data stays local)
     Query metadata index first, then fetch raw logs from source region
     Best balance of speed, cost, and compliance
```

---

## Summary: Interview Strategy

When designing a distributed logging and monitoring system in an interview, structure your answer around these key decisions:

```
  1. SCOPE: What signals? (logs, metrics, traces, or all three?)
  2. SCALE: How much data? (back-of-envelope estimation is critical)
  3. INGEST: How to collect? (agents -> queue -> process -> store)
  4. STORE: Where to put it? (hot/warm/cold tiering, TSDB vs search index)
  5. QUERY: How to search? (full-text vs label-based, latency requirements)
  6. ALERT: How to notify? (threshold vs anomaly, escalation, fatigue)
  7. COST: How to afford it? (sampling, compression, tiering, build vs buy)

  Time allocation in a 45-minute interview:
    Requirements + Scale:     8 minutes
    High-level architecture:  7 minutes
    Deep dive (pick 2-3):    20 minutes
    Trade-offs + follow-ups: 10 minutes
```
