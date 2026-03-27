# OpenTelemetry

OpenTelemetry (OTel) is a vendor-neutral, open-source observability framework for generating, collecting, and exporting telemetry data (traces, metrics, and logs). It is the second most active CNCF project after Kubernetes and has become the industry standard for instrumenting cloud-native applications. This guide covers OTel's architecture, API/SDK design, instrumentation patterns, the Collector, and practical code examples across multiple languages.

---

## Table of Contents

1. [What Is OpenTelemetry?](#1-what-is-opentelemetry)
2. [History: OpenTracing + OpenCensus](#2-history-opentracing--opencensus)
3. [Architecture Overview](#3-architecture-overview)
4. [OTel API](#4-otel-api)
5. [OTel SDK](#5-otel-sdk)
6. [Auto-Instrumentation vs Manual Instrumentation](#6-auto-instrumentation-vs-manual-instrumentation)
7. [Traces](#7-traces)
8. [Metrics](#8-metrics)
9. [Logs](#9-logs)
10. [OTLP Protocol](#10-otlp-protocol)
11. [OpenTelemetry Collector](#11-opentelemetry-collector)
12. [Semantic Conventions](#12-semantic-conventions)
13. [Resource Attributes](#13-resource-attributes)
14. [Baggage](#14-baggage)
15. [Context Propagation](#15-context-propagation)
16. [Sampling](#16-sampling)
17. [Code Examples](#17-code-examples)
18. [Common Interview Questions](#18-common-interview-questions)
19. [Quick Reference](#19-quick-reference)

---

## 1. What Is OpenTelemetry?

OpenTelemetry provides a single set of APIs, SDKs, and tools to instrument, generate, collect, and export telemetry data. It does not provide a backend for storage or visualization -- instead, it sends data to backends like Jaeger, Prometheus, Grafana Tempo, Datadog, or any OTLP-compatible system.

### Key Goals

- **Vendor neutrality**: Instrument once, export to any backend
- **Unified standard**: One framework for traces, metrics, and logs
- **Language support**: SDKs for Go, Java, Python, JavaScript, .NET, Rust, C++, and more
- **Low overhead**: Designed for production use with minimal performance impact
- **Extensibility**: Plugin architecture for custom exporters, processors, and propagators

---

## 2. History: OpenTracing + OpenCensus

```
2016-2019                          2019                    2019+
+-----------------+     +--------------------+     +------------------+
| OpenTracing     |     |                    |     |                  |
| (CNCF)          |---->|      Merger        |---->| OpenTelemetry    |
| - Tracing API   |     |                    |     | - Traces         |
| - Vendor neutral|     +--------------------+     | - Metrics        |
+-----------------+            ^                   | - Logs           |
                               |                   | - CNCF Incubating|
+-----------------+            |                   +------------------+
| OpenCensus      |------------+
| (Google)        |
| - Traces +      |
|   Metrics       |
| - Auto-collect  |
+-----------------+

OpenTracing: API-only, no collection/export
OpenCensus:  Full pipeline but Google-centric
OpenTelemetry: Best of both worlds
```

---

## 3. Architecture Overview

```
+------------------------------------------------------------------+
|                        Application                                |
|                                                                   |
|  +------------------+  +------------------+  +------------------+ |
|  |  OTel API        |  |  OTel SDK        |  | Auto-instrument  | |
|  |  (Interface)     |  |  (Implementation)|  | (Libraries)      | |
|  +------------------+  +------------------+  +------------------+ |
|           |                     |                     |            |
|           +---------------------+---------------------+            |
|                                 |                                  |
|                          OTLP Export                               |
+------------------------------------------------------------------+
                                  |
                                  v
+------------------------------------------------------------------+
|                    OTel Collector (optional)                       |
|  +------------+    +-------------+    +-------------+             |
|  | Receivers  |--->| Processors  |--->| Exporters   |             |
|  +------------+    +-------------+    +-------------+             |
+------------------------------------------------------------------+
                                  |
                    +-------------+-------------+
                    |             |             |
                    v             v             v
              +---------+  +---------+  +-----------+
              | Jaeger  |  |Prometheus|  | Datadog   |
              | Tempo   |  |  Mimir  |  | New Relic |
              | Zipkin  |  |         |  | Splunk    |
              +---------+  +---------+  +-----------+
```

---

## 4. OTel API

The API is the language-agnostic interface that library authors and application developers use. It defines the contract without implementation details.

### Key Properties

- **No-op by default**: If no SDK is configured, API calls do nothing (zero overhead)
- **Safe for libraries**: Libraries can depend on the API without pulling in vendor-specific code
- **Stable**: API surface is stable and backward-compatible

### API Components

| Component | Purpose |
|-----------|---------|
| `TracerProvider` | Factory for creating `Tracer` instances |
| `Tracer` | Creates spans |
| `MeterProvider` | Factory for creating `Meter` instances |
| `Meter` | Creates instruments (counters, histograms, etc.) |
| `LoggerProvider` | Factory for creating `Logger` instances |
| `Logger` | Emits log records |
| `Propagator` | Injects/extracts context across process boundaries |
| `Baggage` | Key-value pairs propagated across services |

---

## 5. OTel SDK

The SDK is the implementation of the API. It handles configuration, processing, and export of telemetry data.

### TracerProvider

```
TracerProvider
  |
  +-- Resource (service.name, service.version, etc.)
  |
  +-- Sampler (TraceIDRatioBased, ParentBased, AlwaysOn, etc.)
  |
  +-- SpanProcessor(s)
       |
       +-- SimpleSpanProcessor (sync, for testing)
       |
       +-- BatchSpanProcessor (async, for production)
            |
            +-- SpanExporter
                 |
                 +-- OTLPSpanExporter (gRPC or HTTP)
                 +-- ConsoleSpanExporter
                 +-- JaegerExporter
```

### MeterProvider

```
MeterProvider
  |
  +-- Resource
  |
  +-- MetricReader(s)
       |
       +-- PeriodicExportingMetricReader
       |    |
       |    +-- MetricExporter
       |         |
       |         +-- OTLPMetricExporter
       |         +-- PrometheusExporter
       |         +-- ConsoleMetricExporter
       |
       +-- PrometheusMetricReader (pull-based)
```

### LoggerProvider

```
LoggerProvider
  |
  +-- Resource
  |
  +-- LogRecordProcessor(s)
       |
       +-- SimpleLogRecordProcessor
       |
       +-- BatchLogRecordProcessor
            |
            +-- LogRecordExporter
                 |
                 +-- OTLPLogExporter
                 +-- ConsoleLogExporter
```

---

## 6. Auto-Instrumentation vs Manual Instrumentation

### Auto-Instrumentation

Automatically captures telemetry from popular frameworks and libraries without code changes.

```
+---------------------------------------------------+
|  Application Code (unchanged)                      |
+---------------------------------------------------+
|  Auto-instrumentation Agent/Library                |
|  - HTTP client/server (Express, Flask, Spring)     |
|  - Database drivers (pg, mysql, MongoDB)           |
|  - Message queues (Kafka, RabbitMQ)                |
|  - gRPC, GraphQL, Redis, etc.                      |
+---------------------------------------------------+
```

| Language | Mechanism |
|----------|-----------|
| Java | Java agent (bytecode manipulation) |
| Python | `opentelemetry-instrument` CLI wrapper |
| Node.js | `@opentelemetry/auto-instrumentations-node` |
| .NET | .NET agent or `System.Diagnostics` bridge |
| Go | Compile-time instrumentation (limited auto) |

### Manual Instrumentation

Adding telemetry explicitly in application code for business-specific spans, metrics, and attributes.

```python
# Manual span creation
with tracer.start_as_current_span("process-payment") as span:
    span.set_attribute("payment.amount", 150.00)
    span.set_attribute("payment.currency", "USD")
    span.set_attribute("payment.user_id", user_id)
    result = process_payment(user_id, amount)
    span.set_attribute("payment.status", result.status)
```

### When to Use Each

| Scenario | Recommendation |
|----------|---------------|
| Getting started quickly | Auto-instrumentation |
| Framework-level visibility | Auto-instrumentation |
| Business logic visibility | Manual instrumentation |
| Custom metrics | Manual instrumentation |
| Production-ready setup | Both combined |

---

## 7. Traces

### Spans

A span represents a single operation within a trace. It has a start time, duration, attributes, events, links, and status.

```
Span Structure:
+-----------------------------------------------+
| Span                                          |
|  - Name: "HTTP GET /api/users"                |
|  - Trace ID: abc123...                        |
|  - Span ID: def456...                         |
|  - Parent Span ID: ghi789...                  |
|  - Start Time: 2025-03-15T10:00:00.000Z       |
|  - End Time:   2025-03-15T10:00:00.045Z       |
|  - Status: OK | ERROR | UNSET                |
|  - Kind: CLIENT | SERVER | PRODUCER |          |
|          CONSUMER | INTERNAL                  |
|  - Attributes: {key: value, ...}              |
|  - Events: [{name, timestamp, attrs}, ...]    |
|  - Links: [{SpanContext, attrs}, ...]         |
+-----------------------------------------------+
```

### Span Kinds

| Kind | Description | Example |
|------|-------------|---------|
| `CLIENT` | Outgoing remote call | HTTP client, gRPC client |
| `SERVER` | Incoming remote call | HTTP handler, gRPC handler |
| `PRODUCER` | Async message creation | Kafka producer, SQS send |
| `CONSUMER` | Async message processing | Kafka consumer, SQS receive |
| `INTERNAL` | Internal operation | Business logic, utility functions |

### Span Attributes

Key-value pairs that provide context about the operation.

```python
span.set_attribute("http.method", "POST")
span.set_attribute("http.url", "https://api.example.com/payments")
span.set_attribute("http.status_code", 200)
span.set_attribute("db.system", "postgresql")
span.set_attribute("db.statement", "SELECT * FROM users WHERE id = ?")
```

### Span Events

Timestamped annotations within a span's lifetime.

```python
span.add_event("cache_miss", {
    "cache.key": "user:42",
    "cache.backend": "redis"
})

span.add_event("retry_attempt", {
    "retry.count": 2,
    "retry.reason": "connection_timeout"
})
```

### Span Links

Links connect spans that are causally related but not parent-child.

```python
# Link a processing span to the originating request span
link = trace.Link(
    context=originating_span.get_span_context(),
    attributes={"link.type": "triggered_by"}
)
with tracer.start_as_current_span("batch-process", links=[link]):
    process_batch()
```

### SpanContext

The immutable context that identifies a span and is propagated across process boundaries.

```
SpanContext:
  - Trace ID:    128-bit (32 hex chars)
  - Span ID:      64-bit (16 hex chars)
  - Trace Flags:   8-bit (sampled flag)
  - Trace State:  vendor-specific key-value pairs
```

### W3C Trace Context

```
HTTP Headers:
  traceparent: 00-<trace-id>-<span-id>-<trace-flags>
  tracestate:  vendor1=value1,vendor2=value2

Example:
  traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
  tracestate:  congo=lZWRzIHRoNQKI,rojo=00f067aa0ba902b7
```

---

## 8. Metrics

### Instrument Types

| Instrument | Sync/Async | Monotonic | Example |
|-----------|-----------|-----------|---------|
| Counter | Sync | Yes | `requests_total` |
| UpDownCounter | Sync | No | `active_connections` |
| Histogram | Sync | N/A | `request_duration` |
| Gauge | Async | N/A | `cpu_temperature` |
| ObservableCounter | Async | Yes | `page_faults` |
| ObservableUpDownCounter | Async | No | `queue_size` |
| ObservableGauge | Async | N/A | `memory_usage` |

### Counter

Monotonically increasing value. Only supports `add()` with non-negative values.

```python
counter = meter.create_counter(
    name="http.requests",
    description="Total HTTP requests",
    unit="1"
)
counter.add(1, {"method": "GET", "status": 200})
```

### UpDownCounter

Can increase or decrease. Good for tracking things like active connections.

```python
active = meter.create_up_down_counter(
    name="http.active_requests",
    description="Currently active HTTP requests"
)
active.add(1)   # request started
active.add(-1)  # request completed
```

### Histogram

Records the distribution of values. Automatically bucketized.

```python
histogram = meter.create_histogram(
    name="http.request.duration",
    description="HTTP request duration",
    unit="ms"
)
histogram.record(45.2, {"method": "POST", "endpoint": "/api/users"})
```

### Gauge (Async)

Reports the current value via a callback.

```python
def get_cpu_usage(options):
    options.observe(psutil.cpu_percent(), {})

meter.create_observable_gauge(
    name="system.cpu.utilization",
    callbacks=[get_cpu_usage],
    description="CPU utilization percentage"
)
```

---

## 9. Logs

### LogRecord Structure

```
LogRecord:
  - Timestamp:       2025-03-15T10:23:45.123Z
  - ObservedTimestamp: 2025-03-15T10:23:45.124Z
  - SeverityNumber:  17 (ERROR)
  - SeverityText:    "ERROR"
  - Body:            "Payment processing failed"
  - Attributes:      {user_id: "42", error_code: "INSUFFICIENT_FUNDS"}
  - Resource:        {service.name: "payment-service"}
  - TraceId:         abc123...
  - SpanId:          def456...
  - TraceFlags:      01
```

### Severity Levels

| Number Range | Severity | Description |
|-------------|----------|-------------|
| 1-4 | TRACE | Fine-grained debugging |
| 5-8 | DEBUG | Debugging information |
| 9-12 | INFO | Informational messages |
| 13-16 | WARN | Warning conditions |
| 17-20 | ERROR | Error conditions |
| 21-24 | FATAL | Critical/fatal conditions |

### Log Bridge API

OTel Logs are designed as a bridge -- connecting existing logging libraries (log4j, winston, Python logging) to OTel's pipeline rather than replacing them.

```python
# Python: Bridge existing logging to OTel
from opentelemetry._logs import set_logger_provider
from opentelemetry.sdk._logs import LoggerProvider
from opentelemetry.sdk._logs.export import BatchLogRecordProcessor

logger_provider = LoggerProvider(resource=resource)
logger_provider.add_log_record_processor(
    BatchLogRecordProcessor(OTLPLogExporter())
)
set_logger_provider(logger_provider)

# Existing logging calls automatically bridged
import logging
handler = LoggingHandler(logger_provider=logger_provider)
logging.getLogger().addHandler(handler)
```

---

## 10. OTLP Protocol

OTLP (OpenTelemetry Protocol) is the native protocol for transmitting telemetry data.

### Transport Options

| Transport | Port (default) | Pros | Cons |
|-----------|---------------|------|------|
| gRPC | 4317 | Efficient, streaming, bidirectional | Requires HTTP/2, complex load balancing |
| HTTP/protobuf | 4318 | Simpler infrastructure, proxy-friendly | Slightly higher overhead |
| HTTP/JSON | 4318 | Human-readable, easy debugging | Largest payload size |

### OTLP Endpoints

```
gRPC:
  Traces:  grpc://collector:4317
  Metrics: grpc://collector:4317
  Logs:    grpc://collector:4317

HTTP:
  Traces:  http://collector:4318/v1/traces
  Metrics: http://collector:4318/v1/metrics
  Logs:    http://collector:4318/v1/logs
```

### Configuration via Environment Variables

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT="http://collector:4318"
export OTEL_EXPORTER_OTLP_PROTOCOL="http/protobuf"
export OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer token123"
export OTEL_EXPORTER_OTLP_COMPRESSION="gzip"
export OTEL_EXPORTER_OTLP_TIMEOUT="10000"
```

---

## 11. OpenTelemetry Collector

The Collector is a vendor-agnostic proxy that receives, processes, and exports telemetry data.

### Architecture

```
                    +------------------------------------------+
                    |         OTel Collector                    |
                    |                                          |
Telemetry  ------->|  +-----------+    +-------------+         |
Sources            |  | Receivers |    | Processors  |         |
                   |  |           |--->|             |---+      |
  - OTel SDK       |  | - otlp    |    | - batch     |   |     |
  - Jaeger         |  | - jaeger  |    | - memory    |   |     |
  - Prometheus     |  | - prom    |    |   limiter   |   |     |
  - Zipkin         |  | - zipkin  |    | - filter    |   |     |
  - Fluent         |  | - filelog |    | - transform |   |     |
                   |  +-----------+    | - tail      |   |     |
                   |                   |   sampling  |   |     |
                   |                   +-------------+   |     |
                   |                                     |     |
                   |                   +-------------+   |     |
                   |                   | Exporters   |<--+     |
                   |                   |             |         |
                   |                   | - otlp      |-------->|  Backends
                   |                   | - prometheus|         |
                   |                   | - jaeger    |         |
                   |                   | - loki      |         |
                   |                   | - datadog   |         |
                   |                   +-------------+         |
                   +------------------------------------------+
```

### Pipeline Configuration

```yaml
# otel-collector-config.yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318
  prometheus:
    config:
      scrape_configs:
        - job_name: 'app-metrics'
          scrape_interval: 15s
          static_configs:
            - targets: ['app:8080']

processors:
  batch:
    timeout: 5s
    send_batch_size: 1024
  memory_limiter:
    check_interval: 1s
    limit_mib: 512
    spike_limit_mib: 128
  attributes:
    actions:
      - key: environment
        value: production
        action: upsert
  filter:
    traces:
      span:
        - 'attributes["http.target"] == "/health"'

exporters:
  otlp/tempo:
    endpoint: tempo:4317
    tls:
      insecure: true
  otlp/mimir:
    endpoint: mimir:4317
  loki:
    endpoint: http://loki:3100/loki/api/v1/push

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch, filter]
      exporters: [otlp/tempo]
    metrics:
      receivers: [otlp, prometheus]
      processors: [memory_limiter, batch]
      exporters: [otlp/mimir]
    logs:
      receivers: [otlp]
      processors: [memory_limiter, batch, attributes]
      exporters: [loki]
```

### Deployment Patterns

```
Pattern 1: Agent mode (sidecar/daemonset)
+-------------+     +-----------+     +---------+
| Application |---->| Collector |---->| Backend |
|             |     | (Agent)   |     |         |
+-------------+     +-----------+     +---------+
  Each pod/host has its own collector instance.

Pattern 2: Gateway mode (centralized)
+-------------+
| App 1       |---+
+-------------+   |   +----------------+     +---------+
+-------------+   +-->| Collector      |---->| Backend |
| App 2       |------>| (Gateway)      |     |         |
+-------------+   +-->|                |     +---------+
+-------------+   |   +----------------+
| App 3       |---+
+-------------+

Pattern 3: Agent + Gateway (recommended for production)
+-------------+     +-----------+     +------------+     +---------+
| Application |---->| Collector |---->| Collector  |---->| Backend |
|             |     | (Agent)   |     | (Gateway)  |     |         |
+-------------+     +-----------+     +------------+     +---------+
  Agent handles local buffering; Gateway handles routing/processing.
```

---

## 12. Semantic Conventions

Semantic conventions define standard attribute names and values for common operations, ensuring consistency across languages and libraries.

### Common Semantic Conventions

```
HTTP:
  http.request.method      = "GET"
  http.response.status_code = 200
  url.full                 = "https://api.example.com/users"
  server.address           = "api.example.com"
  server.port              = 443

Database:
  db.system                = "postgresql"
  db.namespace             = "mydb"
  db.operation.name        = "SELECT"
  db.query.text            = "SELECT * FROM users WHERE id = ?"

Messaging:
  messaging.system         = "kafka"
  messaging.destination.name = "orders-topic"
  messaging.operation.type = "publish"

RPC:
  rpc.system               = "grpc"
  rpc.service              = "UserService"
  rpc.method               = "GetUser"
  rpc.grpc.status_code     = 0
```

---

## 13. Resource Attributes

Resource attributes describe the entity producing telemetry. They are set once per SDK instance and attached to all telemetry.

```python
from opentelemetry.sdk.resources import Resource

resource = Resource.create({
    "service.name": "payment-service",
    "service.version": "1.4.2",
    "service.namespace": "checkout",
    "deployment.environment.name": "production",
    "host.name": "ip-10-0-1-42",
    "cloud.provider": "aws",
    "cloud.region": "us-east-1",
    "k8s.pod.name": "payment-service-7d4f8b6c9-x2k4p",
    "k8s.namespace.name": "checkout"
})
```

---

## 14. Baggage

Baggage is a set of key-value pairs propagated across all services in a trace. Unlike span attributes, baggage is not automatically exported -- it must be explicitly read and used.

```python
from opentelemetry import baggage, context

# Set baggage
ctx = baggage.set_baggage("tenant.id", "acme-corp")
ctx = baggage.set_baggage("feature.flag", "new-checkout", context=ctx)

# Read baggage (in any downstream service)
tenant_id = baggage.get_baggage("tenant.id")
```

### Use Cases

- Multi-tenant routing
- Feature flag propagation
- A/B test group assignment
- Cost attribution (tag spans with team/product)

### Caution

Baggage is sent in every request header, so keep it small. Do not put sensitive data in baggage (it is visible in plain text in HTTP headers).

---

## 15. Context Propagation

Context propagation is the mechanism that ties together distributed operations by passing trace context (and baggage) across process boundaries.

```
Service A                    Service B                    Service C
+-----------+                +-----------+                +-----------+
| Create    |  HTTP/gRPC     | Extract   |  HTTP/gRPC     | Extract   |
| Span A    |  traceparent   | Context   |  traceparent   | Context   |
|           |--------------->| Create    |--------------->| Create    |
| Inject    |                | Span B    |                | Span C    |
| Context   |                | (child of |                | (child of |
+-----------+                |  Span A)  |                |  Span B)  |
                             | Inject    |                |           |
                             | Context   |                |           |
                             +-----------+                +-----------+
```

### Propagation Formats

| Format | Header | Example |
|--------|--------|---------|
| W3C Trace Context | `traceparent`, `tracestate` | `00-abc123-def456-01` |
| B3 (Zipkin) | `X-B3-TraceId`, `X-B3-SpanId`, etc. | Single or multi-header |
| Jaeger | `uber-trace-id` | `abc123:def456:0:1` |
| AWS X-Ray | `X-Amzn-Trace-Id` | `Root=1-abc;Parent=def;Sampled=1` |

---

## 16. Sampling

Sampling reduces telemetry volume by only recording a subset of traces. This is critical for cost management at scale.

### Head-Based Sampling

Sampling decision made at trace creation (root span).

```
AlwaysOn          -> Record 100% (testing/dev)
AlwaysOff         -> Record 0%
TraceIDRatioBased -> Record X% based on trace ID hash
                     Deterministic: same trace ID = same decision
ParentBased       -> Inherit parent's sampling decision
                     Ensures consistent sampling within a trace
```

```python
from opentelemetry.sdk.trace.sampling import TraceIdRatioBased, ParentBased

# Sample 10% of traces, but respect parent's decision
sampler = ParentBased(root=TraceIdRatioBased(0.1))

provider = TracerProvider(
    resource=resource,
    sampler=sampler
)
```

### Tail-Based Sampling

Sampling decision made after the trace is complete, based on observed characteristics.

```
+--------+     +------------------+     +---------+
| Spans  |---->| Collector with   |---->| Backend |
| (all)  |     | tail-based       |     | (only   |
|        |     | sampling         |     |  sampled)|
+--------+     +------------------+     +---------+

Decision policies:
  - Always sample errors (status_code >= 400)
  - Always sample slow requests (duration > 5s)
  - Sample 5% of successful requests
  - Always sample specific user IDs
```

```yaml
# Collector config for tail-based sampling
processors:
  tail_sampling:
    decision_wait: 10s
    num_traces: 100000
    policies:
      - name: errors
        type: status_code
        status_code: {status_codes: [ERROR]}
      - name: slow-requests
        type: latency
        latency: {threshold_ms: 5000}
      - name: probabilistic
        type: probabilistic
        probabilistic: {sampling_percentage: 5}
```

---

## 17. Code Examples

### Python

```python
from opentelemetry import trace, metrics
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.sdk.resources import Resource
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import OTLPMetricExporter

# Setup resource
resource = Resource.create({
    "service.name": "order-service",
    "service.version": "2.1.0"
})

# Setup tracing
tracer_provider = TracerProvider(resource=resource)
tracer_provider.add_span_processor(
    BatchSpanProcessor(OTLPSpanExporter(endpoint="http://collector:4317"))
)
trace.set_tracer_provider(tracer_provider)
tracer = trace.get_tracer(__name__)

# Setup metrics
metric_reader = PeriodicExportingMetricReader(
    OTLPMetricExporter(endpoint="http://collector:4317"),
    export_interval_millis=60000
)
meter_provider = MeterProvider(resource=resource, metric_readers=[metric_reader])
metrics.set_meter_provider(meter_provider)
meter = metrics.get_meter(__name__)

# Create instruments
request_counter = meter.create_counter("http.requests.total")
request_duration = meter.create_histogram("http.request.duration", unit="ms")

# Use in application code
def handle_request(method, path):
    with tracer.start_as_current_span("handle_request") as span:
        span.set_attribute("http.method", method)
        span.set_attribute("http.path", path)
        start = time.time()
        try:
            result = process(method, path)
            span.set_status(trace.StatusCode.OK)
            request_counter.add(1, {"method": method, "status": 200})
            return result
        except Exception as e:
            span.set_status(trace.StatusCode.ERROR, str(e))
            span.record_exception(e)
            request_counter.add(1, {"method": method, "status": 500})
            raise
        finally:
            duration = (time.time() - start) * 1000
            request_duration.record(duration, {"method": method})
```

### Node.js

```javascript
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-grpc');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-grpc');
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { Resource } = require('@opentelemetry/resources');

const sdk = new NodeSDK({
  resource: new Resource({
    'service.name': 'order-service',
    'service.version': '2.1.0',
  }),
  traceExporter: new OTLPTraceExporter({
    url: 'http://collector:4317',
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: 'http://collector:4317',
    }),
    exportIntervalMillis: 60000,
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

// Manual instrumentation
const { trace, metrics } = require('@opentelemetry/api');
const tracer = trace.getTracer('order-service');
const meter = metrics.getMeter('order-service');

const orderCounter = meter.createCounter('orders.created.total');

async function createOrder(orderData) {
  return tracer.startActiveSpan('createOrder', async (span) => {
    try {
      span.setAttribute('order.item_count', orderData.items.length);
      const order = await db.orders.create(orderData);
      span.setAttribute('order.id', order.id);
      orderCounter.add(1, { status: 'success' });
      span.setStatus({ code: trace.SpanStatusCode.OK });
      return order;
    } catch (error) {
      span.setStatus({ code: trace.SpanStatusCode.ERROR, message: error.message });
      span.recordException(error);
      orderCounter.add(1, { status: 'error' });
      throw error;
    } finally {
      span.end();
    }
  });
}
```

### Go

```go
package main

import (
    "context"
    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/attribute"
    "go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
    "go.opentelemetry.io/otel/sdk/resource"
    sdktrace "go.opentelemetry.io/otel/sdk/trace"
    semconv "go.opentelemetry.io/otel/semconv/v1.24.0"
    "go.opentelemetry.io/otel/trace"
)

func initTracer(ctx context.Context) (*sdktrace.TracerProvider, error) {
    exporter, err := otlptracegrpc.New(ctx,
        otlptracegrpc.WithEndpoint("collector:4317"),
        otlptracegrpc.WithInsecure(),
    )
    if err != nil {
        return nil, err
    }

    res, err := resource.New(ctx,
        resource.WithAttributes(
            semconv.ServiceName("order-service"),
            semconv.ServiceVersion("2.1.0"),
        ),
    )
    if err != nil {
        return nil, err
    }

    tp := sdktrace.NewTracerProvider(
        sdktrace.WithBatcher(exporter),
        sdktrace.WithResource(res),
        sdktrace.WithSampler(sdktrace.ParentBased(
            sdktrace.TraceIDRatioBased(0.1),
        )),
    )
    otel.SetTracerProvider(tp)
    return tp, nil
}

func processOrder(ctx context.Context, orderID string) error {
    tracer := otel.Tracer("order-service")
    ctx, span := tracer.Start(ctx, "processOrder",
        trace.WithAttributes(
            attribute.String("order.id", orderID),
        ),
    )
    defer span.End()

    // Business logic here
    span.AddEvent("order.validated")
    span.SetAttributes(attribute.String("order.status", "completed"))
    return nil
}
```

### Java

```java
import io.opentelemetry.api.OpenTelemetry;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.Tracer;
import io.opentelemetry.api.trace.StatusCode;
import io.opentelemetry.sdk.autoconfigure.AutoConfiguredOpenTelemetrySdk;

public class OrderService {
    private static final OpenTelemetry otel =
        AutoConfiguredOpenTelemetrySdk.initialize().getOpenTelemetrySdk();

    private static final Tracer tracer =
        otel.getTracer("order-service", "2.1.0");

    public Order createOrder(OrderRequest request) {
        Span span = tracer.spanBuilder("createOrder")
            .setAttribute("order.item_count", request.getItems().size())
            .startSpan();

        try (var scope = span.makeCurrent()) {
            Order order = orderRepository.save(request.toOrder());
            span.setAttribute("order.id", order.getId());
            span.setStatus(StatusCode.OK);
            return order;
        } catch (Exception e) {
            span.setStatus(StatusCode.ERROR, e.getMessage());
            span.recordException(e);
            throw e;
        } finally {
            span.end();
        }
    }
}
```

---

## 18. Common Interview Questions

**Q1: What is OpenTelemetry, and why is it important?**

OpenTelemetry is a vendor-neutral, open-source observability framework that provides a single set of APIs, SDKs, and tools for generating and collecting telemetry data (traces, metrics, logs). It is important because it decouples instrumentation from backend choice, reducing vendor lock-in. It is the CNCF's second most active project and has become the de facto standard for cloud-native observability.

**Q2: Explain the difference between the OTel API and SDK.**

The API defines the interface (TracerProvider, Tracer, MeterProvider, etc.) and is a no-op by default. Libraries depend on the API. The SDK implements the API with actual telemetry generation, processing, sampling, and export. Applications configure the SDK. This separation means libraries can be instrumented without forcing specific SDK dependencies on consumers.

**Q3: What are the different span kinds, and when would you use each?**

CLIENT (outgoing calls), SERVER (incoming calls), PRODUCER (async message creation), CONSUMER (async message processing), and INTERNAL (local operations). Use CLIENT/SERVER for synchronous request/response. Use PRODUCER/CONSUMER for async messaging. Use INTERNAL for significant business logic that does not cross process boundaries.

**Q4: How does context propagation work in OpenTelemetry?**

Context propagation passes trace context (trace ID, span ID, trace flags, trace state) across process boundaries via protocol-specific carriers. For HTTP, the W3C Trace Context standard uses `traceparent` and `tracestate` headers. Propagators inject context on the sending side and extract it on the receiving side, allowing child spans in downstream services to be linked to parent spans.

**Q5: Compare head-based and tail-based sampling.**

Head-based sampling decides at trace creation (cheap, consistent, but blind to outcomes). Tail-based sampling decides after trace completion (can prioritize errors and slow requests, but requires buffering all spans and more collector resources). Best practice is to combine both: head-based for baseline reduction, tail-based in the collector for intelligent retention.

**Q6: What is the OpenTelemetry Collector, and why would you use it?**

The Collector is a standalone service that receives, processes, and exports telemetry. Benefits include: decoupling applications from backends, centralized processing (batching, filtering, enrichment), protocol translation (Jaeger to OTLP), tail-based sampling, and reduced application overhead. Deploy in agent mode (per-host) and/or gateway mode (centralized).

**Q7: What are semantic conventions, and why do they matter?**

Semantic conventions are standardized attribute names and values for common operations (HTTP, database, messaging, etc.). They ensure consistency across languages, libraries, and organizations, enabling backends to provide meaningful default dashboards and correlations without custom configuration.

**Q8: How do you instrument a service that uses both HTTP and Kafka?**

Use auto-instrumentation for HTTP framework (Express, Flask, Spring) and Kafka client libraries. Add manual instrumentation for business logic spans. The Kafka producer span (PRODUCER kind) will propagate context via message headers. The Kafka consumer span (CONSUMER kind) extracts context and links to the producer span, maintaining the distributed trace across async boundaries.

---

## 19. Quick Reference

```
OpenTelemetry Components:
  API   -> Interface (no-op by default)
  SDK   -> Implementation (TracerProvider, MeterProvider, LoggerProvider)
  Collector -> Receive, process, export pipeline

Signals:
  Traces  -> Spans with context propagation
  Metrics -> Counter, UpDownCounter, Histogram, Gauge
  Logs    -> LogRecord with severity, body, attributes

Span Kinds: CLIENT | SERVER | PRODUCER | CONSUMER | INTERNAL

OTLP Ports:
  gRPC: 4317
  HTTP: 4318

Propagation: W3C Trace Context (traceparent + tracestate)

Sampling:
  Head-based: AlwaysOn, AlwaysOff, TraceIDRatioBased, ParentBased
  Tail-based: Error-based, latency-based, probabilistic (in Collector)

Collector Modes:
  Agent   -> Sidecar/DaemonSet (local buffering)
  Gateway -> Centralized (routing/processing)

Environment Variables:
  OTEL_SERVICE_NAME
  OTEL_EXPORTER_OTLP_ENDPOINT
  OTEL_EXPORTER_OTLP_PROTOCOL
  OTEL_TRACES_SAMPLER
  OTEL_TRACES_SAMPLER_ARG
  OTEL_RESOURCE_ATTRIBUTES
  OTEL_LOG_LEVEL
```
