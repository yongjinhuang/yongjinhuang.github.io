# Distributed Tracing

A comprehensive guide to distributed tracing -- tracking requests as they flow through
microservices. Covers trace anatomy, context propagation, sampling strategies, trace
backends (Jaeger, Tempo), and correlation with logs and metrics.

---

## Table of Contents

1. [Why Distributed Tracing](#1-why-distributed-tracing)
2. [Anatomy of a Trace](#2-anatomy-of-a-trace)
3. [Context Propagation](#3-context-propagation)
4. [Sampling Strategies](#4-sampling-strategies)
5. [Trace Backends](#5-trace-backends)
6. [Correlating Signals](#6-correlating-signals)
7. [Instrumentation Patterns](#7-instrumentation-patterns)
8. [Best Practices](#8-best-practices)
9. [Common Interview Questions](#9-common-interview-questions)
10. [Quick Reference](#10-quick-reference)

---

## 1. Why Distributed Tracing

In microservices, a single user request may traverse 10+ services. When something goes
wrong, you need to know: **which service**, **how long**, and **what failed**.

```
User Request → API Gateway → Auth Service → Order Service → Payment Service → DB
                                    ↓
                              Inventory Service → Warehouse API

Without tracing: "Something is slow. Somewhere."
With tracing:    "Payment Service P99 is 2.3s due to DB connection pool exhaustion."
```

---

## 2. Anatomy of a Trace

### Trace Structure

```
Trace ID: abc-123-def-456
│
├── Span A: API Gateway (0ms - 250ms)
│   │
│   ├── Span B: Auth Service (10ms - 50ms)
│   │
│   └── Span C: Order Service (55ms - 240ms)
│       │
│       ├── Span D: Inventory Check (60ms - 100ms)
│       │
│       └── Span E: Payment Service (105ms - 230ms)
│           │
│           └── Span F: Database Query (110ms - 225ms)  ← Bottleneck!
│
Timeline:
0ms────50ms────100ms────150ms────200ms────250ms
|--A-----------------------------------------|
  |B--|
       |--------C-----------------------------|
       |-D----|
              |----------E--------------------|
               |-----------F-----------------|
```

### Span Components

| Component | Description |
|-----------|-------------|
| **Trace ID** | Unique identifier for the entire request journey |
| **Span ID** | Unique identifier for this specific operation |
| **Parent Span ID** | Links to the parent span (builds the tree) |
| **Operation Name** | What this span represents (`GET /api/orders`) |
| **Start/End Time** | Duration of the operation |
| **Attributes** | Key-value metadata (`http.method=GET`, `http.status_code=200`) |
| **Events** | Timestamped annotations within the span (`exception thrown`) |
| **Links** | Causal relationships to other traces (e.g., batch processing) |
| **Status** | OK, ERROR, or UNSET |

---

## 3. Context Propagation

### W3C Trace Context (Standard)

```
HTTP Headers:
traceparent: 00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01
             ──  ────────────────────────────────  ────────────────  ──
             ver         trace-id                     parent-id     flags

tracestate: vendor1=value1,vendor2=value2
```

### Propagation Mechanisms

| Protocol | How Context is Propagated |
|----------|--------------------------|
| **HTTP** | `traceparent` / `tracestate` headers |
| **gRPC** | Metadata key-value pairs |
| **Kafka** | Message headers |
| **AMQP** | Message properties |

### B3 Format (Legacy, Zipkin)

```
X-B3-TraceId: 80f198ee56343ba864fe8b2a57d3eff7
X-B3-SpanId: e457b5a2e4d86bd1
X-B3-ParentSpanId: 05e3ac9a4f6e3b90
X-B3-Sampled: 1
```

---

## 4. Sampling Strategies

### Head-Based Sampling

Decision made at the **start** of a trace (before any data is collected):

| Strategy | How It Works | Pros | Cons |
|----------|-------------|------|------|
| **Always On** | Sample 100% of traces | Complete visibility | Expensive at scale |
| **Probabilistic** | Sample X% (e.g., 10%) | Simple, predictable cost | Miss rare errors |
| **Rate Limiting** | Max N traces/second | Predictable cost | Bias toward bursty periods |

### Tail-Based Sampling

Decision made at the **end** of a trace (after all data is collected):

| Strategy | How It Works | Pros | Cons |
|----------|-------------|------|------|
| **Error-Based** | Keep all traces with errors | Never miss errors | Requires buffering |
| **Latency-Based** | Keep slow traces (P99+) | Find performance issues | Requires buffering |
| **Composite** | Combine multiple strategies | Best coverage | Most complex |

```
HEAD-BASED                      TAIL-BASED
┌──────────┐                   ┌──────────────────────┐
│ Request   │                   │ Collect full trace    │
│ arrives   │                   │ in buffer             │
│     │     │                   │        │              │
│     ▼     │                   │        ▼              │
│ Sample?   │                   │ Error? Slow? Interest?│
│ Yes → Keep│                   │ Yes → Keep            │
│ No → Drop │                   │ No → Drop             │
└──────────┘                   └──────────────────────┘
Simple, cheap                   Complete, expensive
```

### OpenTelemetry Collector Tail Sampling

```yaml
processors:
  tail_sampling:
    decision_wait: 10s
    policies:
      - name: errors-policy
        type: status_code
        status_code: { status_codes: [ERROR] }
      - name: slow-traces
        type: latency
        latency: { threshold_ms: 1000 }
      - name: probabilistic
        type: probabilistic
        probabilistic: { sampling_percentage: 10 }
```

---

## 5. Trace Backends

### Jaeger

```
┌──────────────────────────────────────┐
│              JAEGER                    │
│                                       │
│  App ──> Agent ──> Collector ──> DB   │
│  (SDK)   (UDP)    (process)   (Cassandra│
│                               Elasticsearch│
│                               Kafka)   │
│                    ┌──────────────┐    │
│                    │ Query Service│    │
│                    │ (Jaeger UI)  │    │
│                    └──────────────┘    │
└──────────────────────────────────────┘
```

### Grafana Tempo

- **Object-storage backend**: S3/GCS/Azure (very cost-effective)
- **No indexing**: Searches by trace ID directly
- **TraceQL**: Query language for traces
- **Integration**: Native Grafana integration (trace → logs → metrics)

### Comparison

| Aspect | Jaeger | Tempo | AWS X-Ray | Zipkin |
|--------|--------|-------|-----------|--------|
| **Storage** | Cassandra/ES/Kafka | Object storage | AWS managed | In-memory/ES |
| **Cost** | Moderate | Low | Pay per trace | Low |
| **Query** | Trace ID, tags | TraceQL | AWS console | Trace ID, tags |
| **Integration** | Standalone | Grafana native | AWS native | Standalone |
| **Best For** | Self-hosted, flexible | Cost-effective, Grafana stack | AWS ecosystem | Simple setup |

---

## 6. Correlating Signals

### The Three Pillars Connected

```
         METRICS                 TRACES                LOGS
     ┌────────────┐         ┌────────────┐       ┌────────────┐
     │ Error rate │         │ Span with  │       │ Log entry  │
     │ spike at   │────────>│ trace_id   │<──────│ with same  │
     │ 10:23 AM   │exemplar │ shows slow │trace_id│ trace_id  │
     │            │         │ DB query   │       │ has stack  │
     └────────────┘         └────────────┘       │ trace      │
                                                  └────────────┘
```

### Exemplars

Link a metric data point to a specific trace:

```promql
# Query with exemplars in Grafana
histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))
# Click on a data point → jump to the trace that caused it
```

### Trace-to-Log Correlation

Include `trace_id` in every log line:

```json
{
  "message": "Payment failed",
  "trace_id": "abc123def456",
  "span_id": "789ghi",
  "service": "payment-service"
}
```

In Grafana: click a trace span → "View logs" filters by trace_id automatically.

---

## 7. Instrumentation Patterns

### Auto-Instrumentation (Recommended Start)

```bash
# Node.js: zero-code instrumentation
npm install @opentelemetry/auto-instrumentations-node
node --require @opentelemetry/auto-instrumentations-node/register app.js

# Python: zero-code instrumentation
pip install opentelemetry-distro opentelemetry-exporter-otlp
opentelemetry-instrument python app.py

# Java: agent-based
java -javaagent:opentelemetry-javaagent.jar -jar myapp.jar
```

### Manual Instrumentation (When Needed)

```python
from opentelemetry import trace

tracer = trace.get_tracer("my-service")

with tracer.start_as_current_span("process_order") as span:
    span.set_attribute("order.id", order_id)
    span.set_attribute("order.amount", amount)

    try:
        result = process_payment(order_id)
        span.set_status(StatusCode.OK)
    except Exception as e:
        span.set_status(StatusCode.ERROR, str(e))
        span.record_exception(e)
        raise
```

---

## 8. Best Practices

1. **Start with auto-instrumentation** -- Get basic traces immediately
2. **Add manual spans** for business logic not covered by auto-instrumentation
3. **Use meaningful span names** -- `GET /api/orders/{id}` not `HTTP request`
4. **Keep spans focused** -- One span per logical operation
5. **Propagate context everywhere** -- HTTP, gRPC, message queues, async workers
6. **Sample wisely** -- 100% in staging, tail-based in production
7. **Add business attributes** -- `order.amount`, `user.tier`, `region`
8. **Correlate with logs and metrics** -- Include trace_id everywhere

---

## 9. Common Interview Questions

**Q: What is a trace and how is it structured?**
A trace represents a request's journey through a distributed system. It's a tree of spans, each representing one operation. Spans have: trace ID (shared), span ID (unique), parent span ID (links to parent), timestamps, attributes, and status.

**Q: Explain the difference between head-based and tail-based sampling.**
Head-based decides at trace start (simple, cheap, misses rare events). Tail-based decides at trace end after seeing all data (captures errors/slow traces, requires buffering). Use head-based for cost control; tail-based for error capture.

**Q: How does context propagation work?**
Parent service injects trace context (trace_id, span_id) into outgoing request headers (W3C traceparent standard). Child service extracts context and creates a child span linked to the parent. This builds the trace tree across service boundaries.

**Q: How do you correlate traces with logs and metrics?**
Include trace_id in every log line (structured logging). Use exemplars to link metric data points to specific traces. In Grafana, click a metric spike → see exemplar trace → click span → see correlated logs.

**Q: When would you choose Tempo over Jaeger?**
Tempo for: Grafana stack, cost-sensitive (object storage), TraceQL queries. Jaeger for: standalone deployment, flexible storage backends (Cassandra/ES), mature ecosystem.

---

## 10. Quick Reference

### W3C Trace Context

```
traceparent: 00-{trace-id}-{parent-id}-{flags}
             ver 32 hex chars 16 hex chars  01=sampled
```

### Sampling Decision Tree

```
High traffic, cost-sensitive → Head-based probabilistic (1-10%)
Must catch all errors       → Tail-based error sampling
Performance investigation   → Tail-based latency sampling
Staging/development         → Always-on (100%)
Best of all worlds          → Composite tail-based
```
