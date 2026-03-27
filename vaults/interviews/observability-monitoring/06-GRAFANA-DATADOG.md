# Grafana & Datadog

A comprehensive guide to the two dominant observability platforms. Covers Grafana's LGTM
stack, dashboard design, and alerting alongside Datadog's APM, infrastructure monitoring,
log management, RUM, and Synthetics.

---

## Table of Contents

1. [Grafana Overview](#1-grafana-overview)
2. [Grafana Dashboards](#2-grafana-dashboards)
3. [LGTM Stack](#3-lgtm-stack)
4. [Grafana Alerting](#4-grafana-alerting)
5. [Datadog Overview](#5-datadog-overview)
6. [Datadog APM](#6-datadog-apm)
7. [Datadog Infrastructure & Logs](#7-datadog-infrastructure--logs)
8. [Datadog RUM & Synthetics](#8-datadog-rum--synthetics)
9. [Tagging Strategy](#9-tagging-strategy)
10. [Grafana vs Datadog](#10-grafana-vs-datadog)
11. [Common Interview Questions](#11-common-interview-questions)
12. [Quick Reference](#12-quick-reference)

---

## 1. Grafana Overview

Grafana is an **open-source visualization platform** that connects to any data source.
It doesn't store data -- it queries and visualizes data from Prometheus, Loki, Tempo,
Elasticsearch, CloudWatch, Datadog, and 100+ other sources.

**Key strengths:**
- Data source agnostic (mix sources in one dashboard)
- Rich visualization library
- Open-source with commercial cloud offering
- Foundation of the LGTM stack

---

## 2. Grafana Dashboards

### Panel Types

| Panel | Use Case |
|-------|----------|
| **Time series** | Metrics over time (the most common) |
| **Stat** | Single value with sparkline |
| **Gauge** | Value within a range (CPU usage) |
| **Bar chart** | Comparisons across categories |
| **Table** | Tabular data |
| **Heatmap** | Distribution over time (latency buckets) |
| **Logs** | Log viewer with filtering |
| **Traces** | Trace waterfall visualization |

### Variables & Templating

```
Dashboard variables enable dynamic, reusable dashboards:

Variable: $service  (query: label_values(service))
Variable: $env      (custom: prod, staging, dev)

Panel query: rate(http_requests_total{service="$service", env="$env"}[5m])
```

Users select values from dropdowns, and all panels update. Enables one dashboard for all services.

### Dashboard-as-Code (Provisioning)

```yaml
# provisioning/dashboards.yaml
apiVersion: 1
providers:
  - name: 'default'
    folder: 'Production'
    type: file
    options:
      path: /etc/grafana/dashboards
      foldersFromFilesStructure: true
```

Store dashboard JSON in Git → deploy via CI/CD → consistent dashboards across environments.

### Annotations

Mark events on dashboards (deployments, incidents, config changes):

```
POST /api/annotations
{
  "text": "Deploy v2.3.0",
  "tags": ["deploy", "production"],
  "time": 1705312025000
}
```

---

## 3. LGTM Stack

```
┌────────────────────────────────────────────────────┐
│                GRAFANA LGTM STACK                   │
│                                                     │
│  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐   │
│  │  Loki  │  │Grafana │  │ Tempo  │  │ Mimir  │   │
│  │ (Logs) │  │ (Viz)  │  │(Traces)│  │(Metrics│   │
│  └───┬────┘  └───┬────┘  └───┬────┘  └───┬────┘   │
│      │           │           │           │          │
│      └───────────┼───────────┼───────────┘          │
│                  │                                   │
│            Unified Querying                           │
│         Trace → Logs → Metrics                       │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │          OpenTelemetry Collector              │   │
│  │    (receives traces, metrics, logs via OTLP)  │   │
│  └──────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────┘
```

| Component | Purpose | Query Language |
|-----------|---------|---------------|
| **Loki** | Log aggregation | LogQL |
| **Grafana** | Visualization & alerting | N/A (UI) |
| **Tempo** | Distributed tracing | TraceQL |
| **Mimir** | Long-term metrics storage | PromQL |

### Correlation Flow

1. See a metric spike in Grafana
2. Click exemplar → opens trace in Tempo
3. Click span → view correlated logs in Loki
4. All in one UI, no context switching

---

## 4. Grafana Alerting

### Unified Alerting (Grafana 9+)

```yaml
# Alert rule
apiVersion: 1
groups:
  - orgId: 1
    name: http-alerts
    rules:
      - uid: high-error-rate
        title: High Error Rate
        condition: C
        data:
          - refId: A
            queryType: range
            expr: sum(rate(http_errors_total[5m])) by (service)
          - refId: B
            queryType: range
            expr: sum(rate(http_requests_total[5m])) by (service)
          - refId: C
            queryType: math
            expr: $A / $B > 0.05
        for: 5m
        labels:
          severity: critical
```

### Components

| Component | Purpose |
|-----------|---------|
| **Alert Rules** | Define conditions and thresholds |
| **Contact Points** | Where to send (Slack, PagerDuty, email, webhook) |
| **Notification Policies** | Routing, grouping, timing |
| **Silences** | Temporary muting |
| **Mute Timings** | Recurring mute windows (maintenance) |

---

## 5. Datadog Overview

Datadog is a **commercial SaaS observability platform** providing metrics, traces, logs,
RUM, Synthetics, and security in a single product.

### Architecture

```
┌────────────────────────────────────────────────────┐
│               DATADOG PLATFORM                      │
│                                                     │
│  ┌──────────┐                                       │
│  │ Datadog  │  Installed on every host/container    │
│  │ Agent    │  Collects metrics, traces, logs        │
│  │ (host)   │  Forwards to Datadog backend           │
│  └────┬─────┘                                       │
│       │                                              │
│       ▼                                              │
│  ┌──────────────────────────────────────────────┐   │
│  │           DATADOG BACKEND (SaaS)              │   │
│  │                                                │   │
│  │  ┌─────────┐ ┌────────┐ ┌─────────┐          │   │
│  │  │ Metrics │ │  APM   │ │  Logs   │          │   │
│  │  │Infra Mon│ │Tracing │ │Pipeline │          │   │
│  │  └─────────┘ └────────┘ └─────────┘          │   │
│  │  ┌─────────┐ ┌────────┐ ┌─────────┐          │   │
│  │  │   RUM   │ │Syntheti│ │Security │          │   │
│  │  │Browser  │ │cs Tests│ │Scanning │          │   │
│  │  └─────────┘ └────────┘ └─────────┘          │   │
│  │                                                │   │
│  │  ┌──────────────────────────────────────┐     │   │
│  │  │  Watchdog (AI anomaly detection)     │     │   │
│  │  └──────────────────────────────────────┘     │   │
│  └──────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────┘
```

---

## 6. Datadog APM

### Features

- **Distributed tracing**: End-to-end request tracking across services
- **Service map**: Auto-generated topology of service dependencies
- **Flame graphs**: Visualize where time is spent in a request
- **Error tracking**: Group and triage errors by type/service
- **Profiling**: Continuous production profiling (CPU, memory, I/O)
- **Deployment tracking**: Correlate performance changes with deploys

### Service Map

```
         ┌─────────┐     ┌─────────┐
         │  Web    │────>│  API    │
         │ Frontend│     │ Gateway │
         └─────────┘     └────┬────┘
                              │
                    ┌─────────┼─────────┐
                    ▼         ▼         ▼
              ┌─────────┐ ┌─────┐ ┌─────────┐
              │ Auth    │ │Order│ │ Payment │
              │ Service │ │ Svc │ │ Service │
              └─────────┘ └──┬──┘ └─────────┘
                             │
                        ┌────┴────┐
                        │PostgreSQL│
                        └─────────┘

Auto-generated from trace data. Shows: request rates,
error rates, latency between services.
```

---

## 7. Datadog Infrastructure & Logs

### Infrastructure Monitoring

- **Host Map**: Visual grid of all hosts with health indicators
- **Container Monitoring**: Docker/K8s container metrics
- **Kubernetes**: Pod/node/deployment metrics via kube-state-metrics
- **Cloud Integrations**: AWS, GCP, Azure native metrics
- **Process Monitoring**: Individual process CPU/memory

### Log Management

```
┌──────────┐    ┌──────────────┐    ┌──────────┐
│ Log      │───>│ Log Pipeline │───>│ Indexes  │
│ Sources  │    │              │    │          │
│ (agents, │    │ ┌──────────┐│    │ Hot/Warm │
│  APIs,   │    │ │ Parsing  ││    │ Cold     │
│  Lambda) │    │ │ rules    ││    │ Archive  │
│          │    │ ├──────────┤│    │          │
│          │    │ │ Enrichment│    │          │
│          │    │ ├──────────┤│    │          │
│          │    │ │ Filtering││    │          │
│          │    │ └──────────┘│    │          │
└──────────┘    └──────────────┘    └──────────┘
```

### Log Pipeline

Pipelines process logs before indexing:
1. **Grok Parser**: Extract structured fields from unstructured logs
2. **Remapper**: Remap attributes (e.g., rename `msg` to `message`)
3. **Category Processor**: Categorize logs (e.g., error types)
4. **GeoIP Enrichment**: Add location data from IP addresses

---

## 8. Datadog RUM & Synthetics

### Real User Monitoring (RUM)

Monitors actual user browser sessions:
- Page load times, Core Web Vitals (LCP, FID, CLS)
- JavaScript errors with stack traces
- User journeys and session replays
- Resource loading waterfall

### Synthetics

Automated testing of endpoints and user flows:

| Type | What It Tests | Use Case |
|------|--------------|----------|
| **API Test** | HTTP endpoints, SSL, DNS | Uptime monitoring |
| **Browser Test** | User flows via headless Chrome | Critical path testing |
| **Multistep API** | Chained API requests | Complex API workflows |

---

## 9. Tagging Strategy

### Unified Tagging (Datadog Best Practice)

Three **reserved tags** that should be on everything:

```
env:production        # Environment
service:api-gateway   # Service name (matches APM)
version:2.3.0         # Deployment version
```

### Additional Tags

```
team:platform         # Ownership
cost-center:eng-123   # Cost allocation
region:us-east-1      # Geographic
tier:critical         # Business priority
```

### Rules

1. **Consistent naming**: `snake_case`, no spaces, lowercase
2. **Low cardinality**: Avoid user IDs, request IDs as tags
3. **Everywhere**: Same tags on metrics, traces, logs, infrastructure
4. **Automated**: Inject via agent config, not manually per service

---

## 10. Grafana vs Datadog

| Aspect | Grafana (LGTM) | Datadog |
|--------|----------------|---------|
| **Type** | Open-source + Cloud | Commercial SaaS |
| **Cost Model** | Self-hosted (free) or Cloud ($) | Per-host + per-feature pricing |
| **Hosting** | Self-managed or Grafana Cloud | Fully managed SaaS |
| **Data Sources** | 100+ (any backend) | Datadog backend only |
| **Flexibility** | Maximum (mix any data sources) | Integrated but locked-in |
| **Setup** | More complex (many components) | Simple (one agent) |
| **Learning Curve** | Steeper (PromQL, LogQL, TraceQL) | Gentler (unified UI) |
| **Alerting** | Unified alerting | Monitors + Watchdog AI |
| **APM** | Via Tempo + OTel | Native, rich features |
| **RUM** | Grafana Faro (newer) | Mature, session replay |
| **Synthetics** | Grafana k6 (load testing) | API + Browser tests |
| **AI Features** | Limited | Watchdog anomaly detection |
| **Vendor Lock-in** | None (open formats) | Moderate (Datadog APIs) |
| **Best For** | Cost-sensitive, open-source, multi-backend | All-in-one, enterprise, ease of use |

### Cost Comparison (Rough)

| Scale | Grafana (self-hosted) | Datadog |
|-------|----------------------|---------|
| Small (10 hosts) | ~$0 (infra cost only) | ~$200-500/mo |
| Medium (100 hosts) | ~$500-2K/mo (infra) | ~$5K-15K/mo |
| Large (1000 hosts) | ~$5K-15K/mo (infra + team) | ~$50K-150K/mo |

---

## 11. Common Interview Questions

**Q: When would you choose Grafana over Datadog?**
Grafana for: cost-sensitive environments, multi-backend querying, avoiding vendor lock-in, existing Prometheus/Loki setup. Datadog for: ease of setup, all-in-one platform, enterprise support, AI-powered insights, rich APM/RUM out-of-the-box.

**Q: What is the LGTM stack?**
Loki (logs), Grafana (visualization), Tempo (traces), Mimir (long-term metrics). An open-source observability stack where all data flows through OpenTelemetry Collector and is visualized in Grafana with cross-signal correlation.

**Q: How does Datadog's tagging strategy work?**
Three reserved tags (env, service, version) on everything. Additional tags for ownership, cost, region. Consistent naming (snake_case), low cardinality, automated injection. Enables filtering, grouping, and cost allocation across all signals.

**Q: How would you design dashboards for a new service?**
Start with the RED method: Rate (requests/sec), Errors (error rate %), Duration (P50/P95/P99 latency). Add infrastructure metrics (CPU, memory, disk). Include deployment annotations. Use variables for environment/service selection.

**Q: What is Watchdog in Datadog?**
AI-powered anomaly detection that automatically identifies unusual patterns in metrics, APM, and logs without manual threshold configuration. Useful for catching issues that static alerting rules would miss.

---

## 12. Quick Reference

### Dashboard Design Checklist

- [ ] RED metrics (Rate, Errors, Duration) for each service
- [ ] Infrastructure metrics (CPU, memory, disk, network)
- [ ] Variables for env/service/region selection
- [ ] Deployment annotations
- [ ] SLO tracking panels
- [ ] Links to related dashboards, traces, logs

### Grafana Data Source Priorities

| Signal | Backend | Query Language |
|--------|---------|---------------|
| Metrics | Prometheus/Mimir | PromQL |
| Logs | Loki | LogQL |
| Traces | Tempo | TraceQL |
| Alerts | Grafana Alerting | N/A |
