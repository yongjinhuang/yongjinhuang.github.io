# Metrics & Prometheus

A comprehensive guide to metrics-based monitoring with Prometheus. Covers metric types,
PromQL, alerting, service discovery, long-term storage solutions, and instrumentation
best practices using the USE and RED methods.

---

## Table of Contents

1. [What Are Metrics](#1-what-are-metrics)
2. [Metric Types](#2-metric-types)
3. [Prometheus Architecture](#3-prometheus-architecture)
4. [PromQL](#4-promql)
5. [Recording & Alerting Rules](#5-recording--alerting-rules)
6. [Alertmanager](#6-alertmanager)
7. [Service Discovery](#7-service-discovery)
8. [Long-Term Storage](#8-long-term-storage)
9. [Best Practices](#9-best-practices)
10. [Common Interview Questions](#10-common-interview-questions)
11. [Quick Reference](#11-quick-reference)

---

## 1. What Are Metrics

Metrics are **numerical measurements collected at regular intervals** (time series data).

```
A time series:  metric_name{label1="value1", label2="value2"}

  Value
   │
   │      *
   │    *   *
   │  *       *     *
   │ *          * *    *
   │*                    *
   └──────────────────────── Time
   t1  t2  t3  t4  t5  t6
```

**Dimensions/Labels**: Key-value pairs that add context (e.g., `method="GET"`, `status="200"`).
**Cardinality**: Number of unique label combinations. High cardinality = more storage/memory.

---

## 2. Metric Types

| Type | Behavior | Use Case | Example |
|------|----------|----------|---------|
| **Counter** | Monotonically increasing | Total requests, errors | `http_requests_total` |
| **Gauge** | Can go up or down | Temperature, queue size | `node_memory_available_bytes` |
| **Histogram** | Distribution in buckets | Latency, request size | `http_request_duration_seconds` |
| **Summary** | Pre-calculated quantiles | Latency (client-side) | `rpc_duration_seconds` |

### Histogram vs Summary

| Aspect | Histogram | Summary |
|--------|-----------|---------|
| **Aggregatable** | Yes (server-side quantiles) | No (pre-calculated on client) |
| **Accuracy** | Approximation (bucket boundaries) | Exact for single instance |
| **Performance** | Cheaper to collect | More CPU on client |
| **Recommendation** | Preferred for most cases | Legacy or specific needs |

---

## 3. Prometheus Architecture

```
┌──────────────────────────────────────────────────────┐
│                   PROMETHEUS                          │
│                                                       │
│  ┌──────────┐  scrape   ┌──────────┐                 │
│  │ Targets  │──────────>│Prometheus│                  │
│  │(app:9090)│  /metrics │ Server   │                  │
│  │(node:9100│           │┌────────┐│                  │
│  │(k8s:...) │           ││  TSDB  ││  Time Series DB  │
│  └──────────┘           │└────────┘│                  │
│                         │┌────────┐│                  │
│  ┌──────────┐           ││ Rules  ││  Recording +     │
│  │ Service  │           ││ Engine ││  Alerting rules  │
│  │Discovery │──────────>│└────────┘│                  │
│  │(K8s, DNS)│           └─────┬────┘                  │
│  └──────────┘                 │                        │
│                    ┌──────────┤                        │
│                    ▼          ▼                        │
│              ┌──────────┐ ┌──────────┐                │
│              │Alertmgr  │ │ Grafana  │                │
│              │(routing,  │ │(dashboards│               │
│              │ grouping) │ │ queries) │                │
│              └──────────┘ └──────────┘                │
└──────────────────────────────────────────────────────┘
```

**Pull-based model**: Prometheus scrapes targets at configured intervals (default 15s).
Targets expose metrics on an HTTP endpoint (typically `/metrics`).

---

## 4. PromQL

### Selectors & Label Matchers

```promql
# Exact match
http_requests_total{method="GET", status="200"}

# Regex match
http_requests_total{method=~"GET|POST"}

# Negative match
http_requests_total{status!="500"}

# Range vector (last 5 minutes of data points)
http_requests_total{method="GET"}[5m]
```

### Essential Functions

```promql
# Rate: per-second rate of increase (for counters)
rate(http_requests_total[5m])

# irate: instant rate (last two data points -- more volatile)
irate(http_requests_total[5m])

# increase: total increase over time range
increase(http_requests_total[1h])

# histogram_quantile: calculate percentile from histogram
histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))

# Aggregations
sum(rate(http_requests_total[5m])) by (service)
avg(node_cpu_seconds_total) by (instance)
topk(5, rate(http_requests_total[5m]))
```

### Practical Queries

```promql
# Request rate per service
sum(rate(http_requests_total[5m])) by (service)

# Error rate percentage
sum(rate(http_requests_total{status=~"5.."}[5m]))
/ sum(rate(http_requests_total[5m])) * 100

# P99 latency
histogram_quantile(0.99,
  sum(rate(http_request_duration_seconds_bucket[5m])) by (le, service)
)

# Memory usage percentage
(node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes)
/ node_memory_MemTotal_bytes * 100

# CPU usage percentage
100 - (avg by (instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)
```

### rate() vs irate()

| Function | Calculation | Behavior | Use Case |
|----------|-----------|----------|----------|
| `rate()` | Average over full range | Smooth, stable | Alerting, dashboards |
| `irate()` | Last two data points | Spiky, responsive | Real-time debugging |

---

## 5. Recording & Alerting Rules

### Recording Rules

Pre-compute expensive queries and save as new time series:

```yaml
groups:
  - name: http_rules
    rules:
      - record: job:http_requests:rate5m
        expr: sum(rate(http_requests_total[5m])) by (job)

      - record: job:http_errors:rate5m
        expr: sum(rate(http_requests_total{status=~"5.."}[5m])) by (job)
```

**Naming convention**: `level:metric:operations` (e.g., `job:http_requests:rate5m`)

### Alerting Rules

```yaml
groups:
  - name: http_alerts
    rules:
      - alert: HighErrorRate
        expr: |
          sum(rate(http_requests_total{status=~"5.."}[5m])) by (service)
          / sum(rate(http_requests_total[5m])) by (service) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate on {{ $labels.service }}"
          description: "Error rate is {{ $value | humanizePercentage }}"
```

---

## 6. Alertmanager

### Routing Tree

```yaml
route:
  receiver: 'default-slack'
  group_by: ['alertname', 'service']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  routes:
    - match:
        severity: critical
      receiver: 'pagerduty-critical'
    - match:
        severity: warning
      receiver: 'slack-warnings'

receivers:
  - name: 'pagerduty-critical'
    pagerduty_configs:
      - service_key: '<key>'
  - name: 'slack-warnings'
    slack_configs:
      - channel: '#alerts'
  - name: 'default-slack'
    slack_configs:
      - channel: '#monitoring'
```

### Key Features

| Feature | Description |
|---------|-------------|
| **Grouping** | Combine related alerts into single notification |
| **Inhibition** | Suppress alerts when related alert is firing |
| **Silences** | Temporarily mute alerts (maintenance windows) |
| **Deduplication** | Avoid duplicate notifications |

---

## 7. Service Discovery

| Method | Use Case |
|--------|----------|
| `static_configs` | Fixed, known targets |
| `kubernetes_sd_configs` | Kubernetes pods/services/endpoints |
| `consul_sd_configs` | Consul service registry |
| `dns_sd_configs` | DNS-based discovery |
| `file_sd_configs` | File-based (JSON/YAML) |
| `ec2_sd_configs` | AWS EC2 instances |

---

## 8. Long-Term Storage

Prometheus TSDB retains ~15 days by default. For longer retention:

| Solution | Architecture | Query | Best For |
|----------|-------------|-------|----------|
| **Thanos** | Sidecar + object storage | Global PromQL | Multi-cluster, HA |
| **Cortex/Mimir** | Horizontally-scaled ingesters | Compatible PromQL | Large-scale SaaS |
| **VictoriaMetrics** | Fork-optimized TSDB | MetricsQL (superset) | Performance, cost |

### Remote Write

```yaml
# prometheus.yml
remote_write:
  - url: "http://mimir:9009/api/v1/push"
    queue_config:
      max_samples_per_send: 5000
```

---

## 9. Best Practices

### USE Method (Infrastructure)

| Signal | What to Monitor |
|--------|----------------|
| **U**tilization | % of resource capacity used (CPU, memory, disk) |
| **S**aturation | Queue depth, backlog, waiting work |
| **E**rrors | Error counts, failed operations |

### RED Method (Services)

| Signal | What to Monitor |
|--------|----------------|
| **R**ate | Requests per second |
| **E**rrors | Error rate (% of requests failing) |
| **D**uration | Latency distribution (P50, P95, P99) |

### Naming Conventions

```
# Pattern: <namespace>_<subsystem>_<name>_<unit>
http_server_requests_total          # Counter (use _total suffix)
http_server_request_duration_seconds # Histogram (use base unit)
node_memory_available_bytes         # Gauge (use base unit)
```

### Cardinality Management

- Avoid high-cardinality labels (user IDs, request IDs, UUIDs)
- Target <10 values per label for most labels
- Use recording rules to pre-aggregate
- Monitor cardinality with `prometheus_tsdb_head_series`

---

## 10. Common Interview Questions

**Q: What is the difference between rate() and irate()?**
`rate()` calculates the average per-second increase over the full range vector (smooth, stable -- use for alerting). `irate()` uses only the last two data points (spiky, responsive -- use for real-time debugging).

**Q: Explain histogram_quantile.**
Calculates estimated percentile from histogram bucket boundaries. `histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))` gives P99 latency. It interpolates within buckets, so accuracy depends on bucket boundaries.

**Q: How does Prometheus service discovery work?**
Prometheus discovers targets dynamically (Kubernetes pods, Consul services, DNS, etc.) and applies relabeling rules to filter and configure scrape targets. No manual target configuration needed.

**Q: What is the difference between recording rules and alerting rules?**
Recording rules pre-compute expressions and save as new time series (performance optimization). Alerting rules evaluate expressions and fire alerts when conditions are met (operational response).

**Q: How would you handle Prometheus long-term storage?**
Use remote write to send data to a long-term storage solution (Thanos for multi-cluster HA, Mimir for large-scale, VictoriaMetrics for cost-efficiency). Prometheus retains short-term (15 days), long-term backend retains months/years.

**Q: Explain the USE and RED methods.**
USE (infrastructure): Utilization, Saturation, Errors -- for monitoring resources. RED (services): Rate, Errors, Duration -- for monitoring request-handling services. USE tells you if infrastructure is healthy; RED tells you if services are healthy.

---

## 11. Quick Reference

### Essential PromQL

```promql
rate(counter[5m])                                    # Per-second rate
sum(metric) by (label)                               # Aggregate by label
histogram_quantile(0.99, rate(histo_bucket[5m]))     # P99
increase(counter[1h])                                # Total increase
absent(metric)                                       # Alert if metric missing
```

### Metric Naming

| Suffix | Type | Example |
|--------|------|---------|
| `_total` | Counter | `http_requests_total` |
| `_seconds` | Duration | `request_duration_seconds` |
| `_bytes` | Size | `memory_usage_bytes` |
| `_info` | Info gauge | `build_info` |
| `_bucket` | Histogram | `duration_seconds_bucket` |
