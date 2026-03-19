# Logging & Monitoring

## What Is It?

Logging is recording what your application does — every request handled, every error thrown, every important action taken. Monitoring is watching those logs and metrics in real-time to detect problems before users notice them. Together, they're your eyes and ears in production. When something breaks at 3am, logging tells you what happened, and monitoring is what woke you up to fix it.

## Why Should You Care?

You can't debug production by attaching a debugger. You can't ask users to reproduce the issue on their machine. All you have is logs and metrics. If your logging is bad (too little, too noisy, or unstructured), you're flying blind. If your monitoring has no alerts, you only find out about problems when users complain. As a developer, the quality of your logging directly determines how fast you can diagnose and fix production issues.

## How It Works (The Business Flow)

### Application Logging

Your application writes log entries for important events:

```
[2026-03-01T10:30:15Z] INFO  request_id=abc123 method=POST path=/api/orders status=201 duration_ms=145 user_id=user456
[2026-03-01T10:30:16Z] ERROR request_id=def789 method=POST path=/api/payments error="Card declined" user_id=user456 payment_id=pay_xyz
[2026-03-01T10:30:17Z] WARN  request_id=ghi012 message="Rate limit approaching" client_id=client_a remaining=5
```

### Log Levels

| Level     | When to Use                                   | Example                                                       |
| --------- | --------------------------------------------- | ------------------------------------------------------------- |
| **ERROR** | Something failed that shouldn't have          | Payment processing failed, database connection lost           |
| **WARN**  | Something unusual that might become a problem | Rate limit approaching, disk space running low                |
| **INFO**  | Normal operations worth recording             | User signed up, order placed, deployment completed            |
| **DEBUG** | Detailed info for troubleshooting             | SQL query executed, cache hit/miss, request/response payloads |

In production, you typically log INFO and above. DEBUG is too verbose for production but invaluable during troubleshooting.

### Structured Logging

The difference between useless and useful logs:

```
// USELESS: Unstructured
"Error processing payment for user"

// USEFUL: Structured
{
  "level": "error",
  "message": "Payment processing failed",
  "user_id": "user456",
  "payment_id": "pay_xyz",
  "amount": 4999,
  "error": "Card declined",
  "error_code": "card_declined",
  "timestamp": "2026-03-01T10:30:16Z",
  "request_id": "def789"
}
```

Structured logs (JSON) can be searched, filtered, and aggregated. Unstructured text logs can only be grep'd.

### Metrics

While logs record individual events, metrics track aggregate measurements over time:

- **Request rate**: 500 requests/second (is this normal or a traffic spike?)
- **Error rate**: 0.5% of requests return errors (is this increasing?)
- **Latency**: P50 = 100ms, P95 = 500ms, P99 = 2000ms (are things getting slower?)
- **Resource usage**: CPU at 70%, memory at 4GB, disk at 80%
- **Business metrics**: Sign-ups per hour, orders per minute, revenue per day

### Alerting

Monitoring without alerting is just looking at dashboards and hoping someone notices. Alerts trigger when metrics cross thresholds:

1. Define alert rules: "If error rate > 5% for 5 minutes, alert on-call"
2. Alert fires → notification sent (PagerDuty, Slack, email, SMS)
3. On-call engineer acknowledges the alert
4. Engineer investigates using logs, metrics, and traces
5. Issue is resolved (or escalated)
6. Post-incident review: what happened, why, how to prevent it

### Distributed Tracing

In a microservices architecture, a single user request might touch 5+ services. Tracing follows the request through every service:

```
User Request → API Gateway → Auth Service → Order Service → Payment Service → Email Service
```

Each service adds its span to the trace. You can see the complete request journey, including where time was spent and where errors occurred.

## Key Terms You'll Hear

| Term                           | What It Means                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| **Log Aggregation**            | Collecting logs from all servers into one searchable system (ELK, Datadog, Splunk)                                 |
| **ELK Stack**                  | Elasticsearch + Logstash + Kibana — a popular open-source logging stack                                            |
| **APM**                        | Application Performance Monitoring — tracks request latency, errors, dependencies (Datadog, New Relic)             |
| **Trace**                      | A record of a request's journey through multiple services                                                          |
| **Span**                       | A single operation within a trace (e.g., "database query took 50ms")                                               |
| **P50 / P95 / P99**            | Percentile latencies. P99 = 99% of requests are faster than this value                                             |
| **SLA**                        | Service Level Agreement — contractual guarantee (99.9% uptime)                                                     |
| **SLO**                        | Service Level Objective — internal target (99.95% uptime, P99 latency < 500ms)                                     |
| **SLI**                        | Service Level Indicator — the actual measured metric                                                               |
| **Error Budget**               | How much downtime is "allowed" before violating the SLO. Spent error budget = freeze new features, fix reliability |
| **On-Call**                    | Engineer designated to respond to production alerts during a rotation period                                       |
| **Incident**                   | A production issue that affects users. Tracked and reviewed formally                                               |
| **Postmortem / Retrospective** | After-incident review: what happened, timeline, root cause, action items. Blameless                                |
| **MTTD**                       | Mean Time To Detect — how quickly you notice a problem                                                             |
| **MTTR**                       | Mean Time To Recover — how quickly you fix a problem                                                               |
| **Dashboard**                  | A visual display of key metrics (Grafana, Datadog dashboards)                                                      |
| **Runbook**                    | Step-by-step instructions for responding to a specific alert                                                       |

## Common Patterns

### Pattern 1: Centralized Logging (ELK / Cloud Logging)

All services send logs to a central system where they can be searched and analyzed.

```
App Servers → Log Collector (Fluentd/Filebeat) → Elasticsearch → Kibana (dashboards + search)
```

**When it's used:** Any app beyond a single server. Essential for distributed systems.

**Trade-off:** Infrastructure cost grows with log volume. Set retention policies to manage costs.

### Pattern 2: Metrics + Alerts (Prometheus/Grafana or Datadog)

Application exposes metrics. Monitoring system scrapes them. Dashboards visualize. Alerts fire on thresholds.

```
App exposes /metrics → Prometheus scrapes → Grafana visualizes → AlertManager sends alerts
```

**When it's used:** Every production system should have this.

**Trade-off:** Requires defining what to measure and what thresholds matter. Too many alerts = alert fatigue.

### Pattern 3: Observability Stack (Logs + Metrics + Traces)

The "three pillars of observability" working together:

- **Logs**: What happened (detailed event records)
- **Metrics**: How the system is performing (aggregate numbers)
- **Traces**: How a request flowed through the system (distributed path)

**When it's used:** Microservices architectures. Complex distributed systems.

**Trade-off:** Full observability stacks are expensive. Prioritize what matters for your scale.

### Pattern 4: Error Tracking (Sentry / Bugsnag)

Dedicated service that captures application errors with full context (stack trace, user, browser, request data).

**When it's used:** Every web application should use one. Catches errors you didn't know were happening.

**Trade-off:** Can be noisy. Group similar errors and prioritize by impact.

## Gotchas & Edge Cases

- **Log too little**: "Error occurred" tells you nothing. Include context: which user, which request, what was the input, what was the expected vs actual result.
- **Log too much**: Logging every database query in production can generate terabytes and make real issues hard to find. Use appropriate log levels.
- **PII in logs**: User emails, addresses, and credit card numbers often end up in log messages accidentally. Scrub sensitive data before logging. This is also a GDPR issue.
- **Alert fatigue**: If your team gets 50 alerts a day and most are noise, they'll start ignoring alerts. Then a real incident gets missed. Tune alert thresholds aggressively. Every alert must be actionable.
- **Correlation IDs**: Without a request ID that flows through all services, you can't correlate logs from different services for the same request. Generate a request ID at the entry point and pass it through.
- **Log retention costs**: Cloud logging services charge per GB ingested and stored. A high-traffic app can generate hundreds of GB of logs per day. Set retention policies and archive old logs.
- **Sampling at scale**: At very high scale, you can't log or trace every request. Sample (trace 1% of requests) to keep costs manageable while still catching issues.
- **Dashboards nobody watches**: A dashboard is only useful if someone looks at it. Pair dashboards with alerts. The dashboard is for investigation after an alert fires, not for passive monitoring.
- **Missing the business perspective**: Technical metrics (CPU, memory, latency) matter, but business metrics matter more. Track sign-ups, purchases, and errors-per-user-action alongside system metrics.

## Quick Reference

| What to Monitor      | Alert Threshold          | Why                             |
| -------------------- | ------------------------ | ------------------------------- |
| Error rate           | > 1% for 5 min           | Something is broken             |
| P99 latency          | > 2s for 5 min           | Users are experiencing slowness |
| CPU usage            | > 80% for 10 min         | Server is overloaded            |
| Disk usage           | > 85%                    | Disk full = crash               |
| Queue depth          | Growing for 15 min       | Workers can't keep up           |
| Failed logins per IP | > 20 in 5 min            | Possible brute force attack     |
| Deployment health    | Error spike after deploy | New code introduced a bug       |

| Tool                 | Category            | Use Case                            |
| -------------------- | ------------------- | ----------------------------------- |
| Datadog              | All-in-one          | Logs + metrics + traces + APM       |
| Grafana + Prometheus | Open source         | Metrics + dashboards + alerting     |
| ELK Stack            | Open source         | Log aggregation + search            |
| Sentry               | Error tracking      | Capture + triage application errors |
| PagerDuty            | Incident management | Alert routing + on-call scheduling  |
| Jaeger / Zipkin      | Open source         | Distributed tracing                 |
