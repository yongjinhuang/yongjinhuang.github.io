# Observability Fundamentals

Observability is the ability to understand the internal state of a system by examining its external outputs. Unlike traditional monitoring, which tells you *when* something is broken, observability helps you understand *why* it is broken -- even for failure modes you have never seen before. This guide covers the foundational concepts every engineer should know, from the three pillars to SLIs/SLOs/SLAs, cardinality challenges, and the economics of observability.

---

## Table of Contents

1. [What Is Observability?](#1-what-is-observability)
2. [Observability vs Monitoring](#2-observability-vs-monitoring)
3. [The Three Pillars and Beyond](#3-the-three-pillars-and-beyond)
4. [Service Level Indicators (SLIs)](#4-service-level-indicators-slis)
5. [Service Level Objectives (SLOs)](#5-service-level-objectives-slos)
6. [Service Level Agreements (SLAs)](#6-service-level-agreements-slas)
7. [SLI / SLO / SLA Relationship](#7-sli--slo--sla-relationship)
8. [Observability Maturity Model](#8-observability-maturity-model)
9. [Cardinality and Dimensionality](#9-cardinality-and-dimensionality)
10. [Observability-Driven Development](#10-observability-driven-development)
11. [Cost of Observability](#11-cost-of-observability)
12. [Common Interview Questions](#12-common-interview-questions)
13. [Quick Reference](#13-quick-reference)

---

## 1. What Is Observability?

Observability originates from control theory: a system is *observable* if you can determine its internal state entirely from its external outputs. In software engineering, this translates to instrumenting systems so that operators can ask arbitrary questions about system behavior without deploying new code.

### Key Properties of Observable Systems

- **High-cardinality data**: ability to drill down by specific user ID, request ID, or session
- **High-dimensionality data**: many attributes (tags, labels) per event
- **Explorability**: ad-hoc querying without predefined dashboards
- **Correlation**: connecting signals across logs, metrics, and traces

```
+----------------------------------------------------+
|               Observable System                     |
|                                                     |
|  +-----------+  +-----------+  +-----------+        |
|  |  Metrics  |  |   Logs    |  |  Traces   |        |
|  +-----------+  +-----------+  +-----------+        |
|        |              |              |               |
|        v              v              v               |
|  +---------------------------------------------+   |
|  |        Correlation & Context Layer           |   |
|  +---------------------------------------------+   |
|        |                                             |
|        v                                             |
|  +---------------------------------------------+   |
|  |       Ad-hoc Querying & Exploration          |   |
|  +---------------------------------------------+   |
+----------------------------------------------------+
```

### The Shift from "Known Unknowns" to "Unknown Unknowns"

Traditional monitoring handles **known unknowns** -- things you expect might fail, like CPU usage spiking. Observability addresses **unknown unknowns** -- novel failure modes that emerge from complex distributed systems where emergent behavior cannot be fully predicted.

---

## 2. Observability vs Monitoring

| Aspect | Monitoring | Observability |
|--------|-----------|---------------|
| **Question type** | "Is the system healthy?" | "Why is it unhealthy?" |
| **Approach** | Predefined dashboards, thresholds | Ad-hoc queries, exploration |
| **Data model** | Aggregated metrics | High-cardinality events |
| **Failure modes** | Known unknowns | Unknown unknowns |
| **Setup** | Configure alerts for known issues | Instrument code to emit rich telemetry |
| **Scalability** | Scales well (aggregated data) | Requires careful cost management |
| **Debugging** | Tells you WHAT is broken | Tells you WHY it is broken |

### Monitoring Is a Subset of Observability

Monitoring is not replaced by observability; it is subsumed by it. A mature observability practice includes monitoring (dashboards, alerts) but extends beyond it with rich telemetry that enables root cause analysis.

```
+------------------------------------------+
|            Observability                  |
|                                          |
|  +------------------+                    |
|  |   Monitoring     |   + Exploration    |
|  |  (Dashboards,    |   + Correlation    |
|  |   Alerts,        |   + High-cardinality|
|  |   Thresholds)    |   + Ad-hoc queries |
|  +------------------+                    |
+------------------------------------------+
```

---

## 3. The Three Pillars and Beyond

### Pillar 1: Logs

Logs are timestamped, immutable records of discrete events. They provide the most granular view of what happened in a system.

```json
{
  "timestamp": "2025-03-15T10:23:45.123Z",
  "level": "ERROR",
  "service": "payment-service",
  "trace_id": "abc123def456",
  "span_id": "span789",
  "message": "Payment processing failed",
  "error_code": "INSUFFICIENT_FUNDS",
  "user_id": "user_42",
  "amount": 150.00,
  "currency": "USD"
}
```

**Strengths**: Rich context, human-readable, good for debugging specific events.
**Weaknesses**: High volume, expensive to store and index, hard to aggregate.

### Pillar 2: Metrics

Metrics are numerical measurements collected at regular intervals. They are efficient for aggregation and trend analysis.

```
# Prometheus metric example
http_requests_total{method="POST", endpoint="/api/payments", status="500"} 47
http_request_duration_seconds_bucket{le="0.1"} 24054
http_request_duration_seconds_bucket{le="0.5"} 33421
http_request_duration_seconds_bucket{le="1.0"} 34001
```

**Strengths**: Compact, cheap to store, efficient for dashboards and alerts.
**Weaknesses**: Low cardinality, information loss through aggregation.

### Pillar 3: Traces

Traces follow a request as it traverses multiple services, capturing the timing and relationships between operations.

```
Trace ID: abc123def456
|
+-- [Span] API Gateway (12ms)
    |
    +-- [Span] Auth Service (3ms)
    |
    +-- [Span] Payment Service (45ms)
    |   |
    |   +-- [Span] Database Query (8ms)
    |   |
    |   +-- [Span] External Payment API (32ms)
    |
    +-- [Span] Notification Service (5ms)
```

**Strengths**: End-to-end visibility, shows causality, identifies bottlenecks.
**Weaknesses**: Complex to implement, sampling required at scale, storage-intensive.

### Beyond the Three Pillars

Modern observability extends beyond logs, metrics, and traces:

| Signal | Description |
|--------|-------------|
| **Profiles** | Continuous profiling (CPU, memory, heap) -- e.g., Pyroscope, Parca |
| **Events** | Structured business or system events (deployments, config changes) |
| **Exceptions** | Dedicated error tracking with stack traces (Sentry, Bugsnag) |
| **Real User Monitoring (RUM)** | Frontend performance from real users |
| **Synthetic Monitoring** | Simulated user transactions to detect issues proactively |
| **Session Replay** | Recorded user sessions for debugging UX issues |

```
+-----------------------------------------------------------+
|                  Modern Observability                      |
|                                                           |
|  +-------+  +-------+  +-------+  +----------+           |
|  | Logs  |  |Metrics|  |Traces |  | Profiles |           |
|  +-------+  +-------+  +-------+  +----------+           |
|                                                           |
|  +-------+  +-------+  +----------+  +---------+         |
|  |Events |  |Errors |  |  RUM     |  |Synthetic|         |
|  +-------+  +-------+  +----------+  +---------+         |
+-----------------------------------------------------------+
```

---

## 4. Service Level Indicators (SLIs)

An SLI is a quantitative measure of some aspect of the service level. It is the raw measurement that feeds into SLOs.

### Types of SLIs

#### Availability SLI

The proportion of requests that succeed.

```
Availability = (Total Requests - Error Requests) / Total Requests

Example:
  Total requests in 1 hour: 100,000
  5xx errors: 50
  Availability = (100,000 - 50) / 100,000 = 99.95%
```

#### Latency SLI

The proportion of requests served faster than a threshold.

```
Latency SLI = Requests < threshold / Total Requests

Example:
  Total requests: 100,000
  Requests under 200ms: 95,000
  Latency SLI (p95 < 200ms) = 95,000 / 100,000 = 95%
```

#### Throughput SLI

The rate at which the system processes work.

```
Throughput = Successful operations / Time period

Example:
  Messages processed per second: 15,000 msg/s
  Batch jobs completed per hour: 240 jobs/hr
```

#### Error Rate SLI

The proportion of requests that result in errors.

```
Error Rate = Error Requests / Total Requests

Example:
  Total requests: 100,000
  Errors (4xx + 5xx): 200
  Error Rate = 200 / 100,000 = 0.2%
```

### SLI Best Practices

1. **Measure from the user's perspective** -- use load balancer metrics, not internal service metrics
2. **Choose percentiles over averages** -- p99 latency reveals tail behavior
3. **Separate SLIs by criticality** -- payment endpoints need different SLIs than health checks
4. **Use request-based, not time-based windows** -- more statistically meaningful

```
+-------------------+        +-----------+        +---------+
|  Load Balancer    | -----> |  SLI      | -----> |  SLO    |
|  (measurement     |        |  (ratio   |        | (target)|
|   point)          |        |   0-100%) |        |         |
+-------------------+        +-----------+        +---------+
```

---

## 5. Service Level Objectives (SLOs)

An SLO is a target value or range for an SLI. It defines the reliability target your team commits to internally.

### Setting SLO Targets

```
Example SLOs:
  - 99.9% of requests return successfully (availability)
  - 95% of requests complete within 200ms (latency p95)
  - 99% of requests complete within 1s (latency p99)
  - Error rate < 0.1% over 30-day window
```

### Error Budget

The error budget is the complement of the SLO -- the amount of unreliability you can tolerate.

```
Error Budget = 1 - SLO

Example (99.9% availability SLO, 30-day window):
  Error budget = 1 - 0.999 = 0.001 = 0.1%
  Total minutes in 30 days = 43,200
  Allowed downtime = 43,200 * 0.001 = 43.2 minutes

Common SLOs and their error budgets:
  +--------+---------------+---------------------------+
  | SLO    | Error Budget  | Allowed Downtime (30 days)|
  +--------+---------------+---------------------------+
  | 99%    | 1%            | 432 minutes (7.2 hours)   |
  | 99.5%  | 0.5%          | 216 minutes (3.6 hours)   |
  | 99.9%  | 0.1%          | 43.2 minutes              |
  | 99.95% | 0.05%         | 21.6 minutes              |
  | 99.99% | 0.01%         | 4.32 minutes              |
  +--------+---------------+---------------------------+
```

### Burn Rate

Burn rate measures how fast the error budget is being consumed relative to the SLO window.

```
Burn Rate = Observed Error Rate / Allowed Error Rate

Example:
  SLO: 99.9% (0.1% error budget over 30 days)
  Current error rate: 0.5%
  Burn rate = 0.5% / 0.1% = 5x

  At 5x burn rate, the 30-day error budget will be
  exhausted in 30 / 5 = 6 days.
```

### Multi-Window, Multi-Burn-Rate Alerting

Google SRE recommends alerting on multiple burn rates and time windows:

```
+-----------+-----------+------------------+------------------+
| Severity  | Burn Rate | Long Window      | Short Window     |
+-----------+-----------+------------------+------------------+
| Page      | 14.4x     | 1 hour           | 5 minutes        |
| Page      | 6x        | 6 hours          | 30 minutes       |
| Ticket    | 3x        | 1 day            | 2 hours          |
| Ticket    | 1x        | 3 days           | 6 hours          |
+-----------+-----------+------------------+------------------+

Both windows must fire for the alert to trigger, reducing
false positives while maintaining detection speed.
```

### SLO Implementation Example (Prometheus)

```yaml
# Recording rule: Calculate error ratio over 5m window
groups:
  - name: slo_rules
    rules:
      - record: slo:http_error_ratio:rate5m
        expr: |
          sum(rate(http_requests_total{status=~"5.."}[5m]))
          /
          sum(rate(http_requests_total[5m]))

      # Burn rate over 1h
      - record: slo:burn_rate:1h
        expr: |
          slo:http_error_ratio:rate5m / 0.001

# Alerting rule: Page if burning 14.4x over 1h
      - alert: SLOBurnRateHigh
        expr: |
          slo:burn_rate:1h > 14.4
          and
          slo:burn_rate:5m > 14.4
        for: 2m
        labels:
          severity: page
        annotations:
          summary: "Error budget burn rate is 14.4x"
```

---

## 6. Service Level Agreements (SLAs)

An SLA is a contractual agreement between a service provider and a customer that defines the expected level of service and consequences for failing to meet it.

### SLA vs SLO

```
+---------+--------------------+----------------------------+
| Aspect  | SLO                | SLA                        |
+---------+--------------------+----------------------------+
| Scope   | Internal target    | External contract          |
| Owner   | Engineering team   | Business/Legal team        |
| Penalty | Engineering action | Financial credits/rebates  |
| Buffer  | Tighter            | Looser (SLO > SLA)         |
| Example | 99.95% uptime      | 99.9% uptime               |
+---------+--------------------+----------------------------+

Best practice: SLO should be stricter than SLA.
If your SLA promises 99.9%, set your SLO to 99.95%.
This gives you a buffer before contractual penalties apply.
```

### Example SLA Tiers

```
+------------------+----------+----------------------------+
| Tier             | Uptime   | Credit if Breached         |
+------------------+----------+----------------------------+
| Standard         | 99.9%    | 10% monthly credit         |
| Premium          | 99.95%   | 25% monthly credit         |
| Enterprise       | 99.99%   | 50% monthly credit         |
+------------------+----------+----------------------------+
```

### SLA Exclusions (Typical)

- Scheduled maintenance windows
- Force majeure events
- Customer-caused incidents
- Beta or preview features
- Third-party service outages

---

## 7. SLI / SLO / SLA Relationship

```
                    Stricter
                       |
   SLI (measurement)   |   "We measure 99.97% availability"
        |               |
        v               |
   SLO (target)        |   "We target 99.95% availability"
        |               |
        v               |
   SLA (contract)       |   "We promise 99.9% availability"
                       |
                    Looser

   SLI >= SLO >= SLA  (ideally)

   If SLI drops below SLO -> engineering action (freeze releases)
   If SLI drops below SLA -> contractual penalties (credits)
```

---

## 8. Observability Maturity Model

### Level 0: Reactive / Ad-hoc

- No centralized logging
- SSH into servers to read log files
- Alerts based on basic infrastructure metrics (CPU, disk)
- Debugging by intuition and experience

### Level 1: Basic Monitoring

- Centralized log aggregation
- Infrastructure dashboards (Grafana, CloudWatch)
- Basic application metrics (request rate, error rate)
- Threshold-based alerting
- Limited correlation between signals

### Level 2: Proactive Observability

- Structured logging with correlation IDs
- Distributed tracing across services
- SLIs and SLOs defined for critical services
- Dashboards reflect user experience, not just infrastructure
- Error budgets inform release decisions

### Level 3: Advanced Observability

- Full OpenTelemetry instrumentation
- Automated anomaly detection
- Trace-driven debugging workflows
- Continuous profiling
- Cost-optimized telemetry pipelines
- Observability-as-code (Terraform, Crossplane)

### Level 4: Observability-Driven Culture

- Observability integrated into CI/CD
- SLO-driven development prioritization
- Automated remediation (self-healing)
- Chaos engineering informed by observability
- Blameless postmortem culture
- Business metrics connected to technical signals

```
Level 4  +-----------------------------------------+
         |  Observability-Driven Culture           |
Level 3  +-----------------------------------------+
         |  Advanced Observability                 |
Level 2  +-----------------------------------------+
         |  Proactive Observability                |
Level 1  +-----------------------------------------+
         |  Basic Monitoring                       |
Level 0  +-----------------------------------------+
         |  Reactive / Ad-hoc                      |
         +-----------------------------------------+
```

---

## 9. Cardinality and Dimensionality

### What Is Cardinality?

Cardinality is the number of unique time series created by a metric. High cardinality occurs when label values have many unique entries.

```
Low cardinality (safe):
  http_requests_total{method="GET"}       # ~5 methods
  http_requests_total{status="200"}       # ~50 status codes

High cardinality (dangerous):
  http_requests_total{user_id="abc123"}   # millions of users
  http_requests_total{request_id="..."}   # infinite values
```

### Cardinality Explosion

```
Total time series = label_1_values * label_2_values * ... * label_n_values

Example:
  method: 5 values
  endpoint: 100 values
  status: 20 values
  region: 5 values
  instance: 50 values
  ---
  Total: 5 * 100 * 20 * 5 * 50 = 2,500,000 time series

Adding user_id (1M users): 2.5 trillion time series!
```

### Dimensionality

Dimensionality is the number of labels (dimensions) attached to a metric. Each additional dimension multiplies potential cardinality.

### Managing Cardinality

| Strategy | Description |
|----------|-------------|
| **Label allowlisting** | Only permit known label values |
| **Aggregation** | Pre-aggregate at the source |
| **Sampling** | Sample high-volume telemetry |
| **Bucketing** | Replace high-cardinality values with buckets (e.g., latency ranges) |
| **Separate storage** | Use logs/traces for high-cardinality data, metrics for low-cardinality |
| **Metric relabeling** | Drop or rename labels in Prometheus pipelines |

```yaml
# Prometheus relabel config to drop high-cardinality labels
metric_relabel_configs:
  - source_labels: [user_id]
    action: labeldrop
  - source_labels: [request_id]
    action: labeldrop
```

---

## 10. Observability-Driven Development

Observability-Driven Development (ODD) integrates observability into the software development lifecycle from the start, rather than bolting it on after the fact.

### Principles

1. **Instrument before shipping** -- add telemetry as part of feature development
2. **Test in production** -- use canary deployments with real-time observability
3. **Define SLOs before launch** -- agree on reliability targets upfront
4. **Use traces for debugging** -- replace log-centric debugging with trace-first approaches
5. **Make observability a first-class citizen** -- treat telemetry code with the same rigor as business logic

### Development Workflow

```
+----------+     +-----------+     +-------------+
|  Write   |---->|  Add      |---->|  Define     |
|  Code    |     | Telemetry |     |  SLOs       |
+----------+     +-----------+     +-------------+
                                         |
                                         v
+----------+     +-----------+     +-------------+
|  Ship    |<----|  Verify   |<----|  Write      |
|  Feature |     | in Staging|     |  Dashboards |
+----------+     +-----------+     +-------------+
      |
      v
+----------+     +-----------+
|  Monitor |---->|  Iterate  |
|  in Prod |     |           |
+----------+     +-----------+
```

### Observability in CI/CD

```yaml
# Example: CI pipeline with observability checks
stages:
  - build
  - test
  - deploy-canary
  - observe           # NEW: observe canary behavior
  - promote-or-rollback

observe:
  script:
    - ./check-slo-compliance.sh --canary --window 15m
    - ./check-error-budget.sh --threshold 5x-burn-rate
  on_failure:
    - ./rollback-canary.sh
```

---

## 11. Cost of Observability

Observability costs can become a significant portion of cloud spend. Understanding cost drivers is essential.

### Cost Drivers

```
+--------------------+----------------------------+
| Cost Driver        | Impact                     |
+--------------------+----------------------------+
| Data ingestion     | Volume of logs/metrics/    |
|                    | traces sent to backend     |
| Data storage       | Retention period and       |
|                    | storage tier               |
| Data querying      | Frequency and complexity   |
|                    | of queries                 |
| Cardinality        | Number of unique time      |
|                    | series (metrics)           |
| Network transfer   | Cross-region/cross-cloud   |
|                    | egress charges             |
+--------------------+----------------------------+
```

### Cost Optimization Strategies

| Strategy | Savings | Trade-off |
|----------|---------|-----------|
| **Sampling traces** (e.g., 10%) | 90% trace cost reduction | May miss rare errors |
| **Tail-based sampling** | 70-90% reduction | Higher collector resource usage |
| **Log level reduction** (INFO -> WARN in prod) | 50-80% log reduction | Less debugging detail |
| **Metric aggregation** | 60-80% metric reduction | Less granularity |
| **Tiered storage** (hot/warm/cold) | 40-60% storage reduction | Slower queries for old data |
| **Drop noisy logs** | Variable | Potential blind spots |
| **Use open-source backends** (Loki, Tempo, Mimir) | 50-90% vs SaaS | Operational overhead |

### Cost Estimation Formula

```
Monthly Cost (approximate) =
  (Log GB/day * 30 * $0.50/GB ingestion) +
  (Metric series * $0.10/1000 series) +
  (Trace spans/day * 30 * $0.0001/span) +
  (Storage GB * $0.03/GB/month) +
  (Egress GB * $0.09/GB)

Example (medium-sized platform):
  Logs: 100 GB/day * 30 * $0.50    = $1,500/mo
  Metrics: 500K series * $0.10/1K  = $50/mo
  Traces: 10M spans/day * 30 * $0.0001 = $30/mo
  Storage: 5 TB * $0.03            = $150/mo
  Egress: 500 GB * $0.09           = $45/mo
  ---
  Total: ~$1,775/mo
```

---

## 12. Common Interview Questions

### Conceptual Questions

**Q1: What is observability, and how does it differ from monitoring?**

Observability is the ability to infer internal system state from external outputs. Monitoring is a subset focused on predefined metrics and dashboards for known failure modes. Observability extends monitoring by supporting ad-hoc querying of high-cardinality, high-dimensionality data to debug novel issues.

**Q2: Explain the three pillars of observability.**

Logs (discrete events), metrics (numerical time series), and traces (request flows across services). Each pillar has different strengths: logs provide detail, metrics provide efficiency, traces provide causality. Modern observability correlates all three for full visibility.

**Q3: What is an SLI, SLO, and SLA? How do they relate?**

An SLI is a quantitative measurement (e.g., "99.97% of requests succeed"). An SLO is the target for that measurement (e.g., "we aim for 99.95%"). An SLA is a contractual commitment with penalties (e.g., "we guarantee 99.9%"). SLOs should be stricter than SLAs to provide a buffer.

**Q4: What is an error budget, and how do you use it?**

An error budget is the tolerable amount of unreliability (1 - SLO). If SLO is 99.9%, the error budget is 0.1% over the SLO window. When error budget is nearly exhausted, teams should freeze feature releases and focus on reliability. When error budget is healthy, teams can ship faster and take more risks.

**Q5: What is burn rate, and why is it useful for alerting?**

Burn rate measures how fast the error budget is being consumed. A burn rate of 1x means the budget will be exhausted exactly at the end of the window. A burn rate of 10x means it will be exhausted in 1/10th of the window. Multi-burn-rate alerting (14.4x/1h, 6x/6h, etc.) provides both fast detection and low false-positive rates.

**Q6: How do you handle cardinality explosions?**

Avoid adding high-cardinality labels (user IDs, request IDs) to metrics. Use logs and traces for high-cardinality data instead. Apply label relabeling rules to drop or bucket labels. Pre-aggregate metrics at the source. Monitor cardinality continuously with tools like Prometheus TSDB status endpoint.

**Q7: What are the costs of observability, and how do you optimize them?**

Major costs include data ingestion, storage, querying, and network egress. Optimization strategies include sampling (head-based and tail-based for traces), reducing log levels in production, aggregating metrics, using tiered storage, and choosing open-source backends over SaaS vendors where operational expertise exists.

### Scenario-Based Questions

**Q8: Your team is launching a new microservice. How do you set up observability for it?**

1. Instrument with OpenTelemetry SDK (traces, metrics, logs).
2. Define SLIs based on the service's purpose (availability, latency, throughput).
3. Set SLOs with the product team based on user expectations and dependencies.
4. Create dashboards showing SLI compliance, error budget burn rate, and key metrics.
5. Configure multi-burn-rate alerts on SLO violations.
6. Add correlation (trace IDs in logs, exemplars in metrics).
7. Write runbooks for common failure scenarios.

**Q9: Your observability costs have doubled in the past quarter. How do you investigate and reduce them?**

1. Identify the top cost contributors (usually logs by volume).
2. Audit log levels -- reduce DEBUG/INFO in production for noisy services.
3. Check for cardinality explosions in metrics (new labels, unbounded values).
4. Implement sampling for traces (start with 10% head-based, then move to tail-based).
5. Review retention policies -- move old data to cold storage.
6. Check for duplicate telemetry (multiple agents, redundant exporters).
7. Evaluate whether SaaS vendor pricing is competitive vs self-hosted alternatives.

**Q10: How do you correlate logs, metrics, and traces for a single request?**

Use a shared trace ID propagated via W3C Trace Context headers. Inject the trace ID into structured log entries. Use exemplars in Prometheus metrics to link specific metric data points to trace IDs. In the observability backend, clicking a trace should show associated logs, and clicking a metric spike should show exemplar traces.

---

## 13. Quick Reference

```
Observability = Understanding WHY systems behave the way they do

Three Pillars:
  Logs    -> Events (high detail, high volume)
  Metrics -> Numbers (low cost, aggregated)
  Traces  -> Flows  (end-to-end, causal)

SLI -> Measurement   (e.g., 99.97% availability)
SLO -> Target        (e.g., 99.95% availability)
SLA -> Contract      (e.g., 99.9% with penalties)

Error Budget = 1 - SLO
  99.9% SLO = 43.2 min downtime / 30 days

Burn Rate = Observed Error Rate / Allowed Error Rate
  >1x = consuming budget faster than planned

Cardinality = unique time series count
  Keep labels low-cardinality (method, status, region)
  Use logs/traces for high-cardinality (user_id, request_id)

Cost Optimization:
  Sample traces (10-50%)
  Reduce log levels in prod
  Drop noisy labels
  Tiered storage (hot/warm/cold)
  Open-source backends (Loki, Tempo, Mimir)

Maturity Levels:
  L0: SSH + intuition
  L1: Centralized logs + dashboards
  L2: SLOs + distributed tracing
  L3: Full OTel + anomaly detection
  L4: Observability-driven culture
```
