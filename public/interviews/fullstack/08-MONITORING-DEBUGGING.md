# Monitoring & Debugging

## Overview

In a full-stack role, you are responsible for code that runs across browsers, servers, databases, and third-party services. When something goes wrong -- and it will -- you need the instrumentation to detect it, the tooling to diagnose it, and the process to resolve it quickly. Interviewers ask about monitoring and debugging because they reveal whether you can operate what you build. Writing features is half the job; keeping them running in production is the other half.

This guide covers structured logging, distributed tracing, metrics collection, APM tools, error tracking, health checks, alerting strategies, and performance profiling across both frontend and backend.

---

## Core Concepts

### 1. Structured Logging

Structured logging means emitting log entries as key-value data (typically JSON) rather than free-form text. This makes logs machine-parseable, searchable, and aggregatable.

**Log Levels and When to Use Them:**

| Level | Purpose | Example |
|-------|---------|---------|
| `FATAL` | Application cannot continue | Database connection pool exhausted, OOM |
| `ERROR` | A request or operation failed | Unhandled exception, external API returned 500 |
| `WARN` | Something unexpected but recoverable | Retry succeeded on second attempt, deprecated API call |
| `INFO` | Normal business events | User registered, order placed, deployment completed |
| `DEBUG` | Detailed diagnostic info | SQL queries, cache hits/misses, request payloads |
| `TRACE` | Extremely fine-grained flow | Entering/exiting functions, loop iterations |

**Production Rule:** Log at `INFO` and above in production. Enable `DEBUG` temporarily via a feature flag or log-level endpoint when investigating issues.

**What to Include in Every Log Entry:**

- Timestamp (ISO 8601 with timezone)
- Log level
- Service name and version
- Request ID / correlation ID
- User ID (if authenticated)
- The message
- Relevant context (order_id, payment_id, etc.)

**What Never to Log:**

- Passwords, tokens, API keys
- Full credit card numbers, SSNs
- Personal health information
- Raw request bodies containing sensitive data

### 2. Distributed Tracing

In a microservices or multi-tier architecture, a single user request may touch 5-10 services. Distributed tracing follows that request across service boundaries by propagating a trace ID.

**Key Concepts:**

- **Trace**: The entire journey of a request through the system
- **Span**: A single unit of work within a trace (e.g., one HTTP call, one database query)
- **Trace ID**: A globally unique identifier propagated across all services
- **Span ID**: Identifies a specific span within the trace
- **Parent Span ID**: Links child spans to their parent, forming a tree

**How It Works:**

1. The first service (or API gateway) generates a trace ID
2. Each service creates a span for its work, recording start time, duration, and metadata
3. The trace ID is propagated via HTTP headers (`traceparent`, `X-Request-ID`) or message metadata
4. All spans are sent to a collector (Jaeger, Zipkin, or an APM backend)
5. The collector assembles spans into a trace timeline

**OpenTelemetry** is the industry standard for instrumentation. It provides vendor-neutral SDKs for traces, metrics, and logs across all major languages.

### 3. Metrics

Metrics are numerical measurements collected over time. Unlike logs (which record individual events), metrics track aggregates and trends.

**The Four Golden Signals (from Google SRE):**

| Signal | What It Measures | Example |
|--------|-----------------|---------|
| **Latency** | Time to serve a request | P50 = 80ms, P95 = 300ms, P99 = 1200ms |
| **Traffic** | Demand on the system | 2,000 requests/second |
| **Errors** | Rate of failed requests | 0.3% of requests return 5xx |
| **Saturation** | How full a resource is | CPU at 75%, memory at 60%, disk at 85% |

**Metric Types (Prometheus model):**

- **Counter**: Monotonically increasing value (total requests served, total errors)
- **Gauge**: Value that can go up or down (current active connections, queue depth)
- **Histogram**: Distribution of values (request latency buckets)
- **Summary**: Similar to histogram but calculates quantiles client-side

### 4. Application Performance Monitoring (APM)

APM tools combine traces, metrics, and logs into a unified platform. They automatically instrument frameworks, databases, and HTTP clients to provide end-to-end visibility.

**Popular APM Tools:**

| Tool | Strengths | Pricing Model |
|------|-----------|---------------|
| **Datadog** | Broad integrations, unified platform, strong dashboards | Per host + ingestion volume |
| **New Relic** | Full-stack observability, generous free tier | Per GB ingested |
| **Grafana Stack** | Open-source, composable (Loki + Tempo + Mimir) | Self-hosted free, cloud paid |
| **Elastic APM** | Integrates with ELK stack, strong search | Self-hosted free, cloud paid |
| **AWS X-Ray** | Native AWS integration | Per trace recorded |

### 5. Error Tracking

Error tracking tools (Sentry, Bugsnag, Rollbar) capture exceptions with full context: stack traces, request data, user info, breadcrumbs of events leading up to the error, and source maps for minified frontend code.

**Key capabilities:**

- Grouping duplicate errors into issues
- Tracking error frequency and regression
- Alerting on new or spiking errors
- Source map support for frontend errors
- Release tracking (which deploy introduced the bug?)

### 6. Health Checks

Health check endpoints let load balancers, orchestrators (Kubernetes), and monitoring systems verify a service is operational.

**Two levels:**

- **Liveness**: "Is the process alive?" Returns 200 if the server can respond. Used by Kubernetes to restart crashed containers.
- **Readiness**: "Can this instance handle traffic?" Checks database connectivity, cache availability, downstream dependencies. Used by Kubernetes to route traffic.

### 7. Alerting Strategies

Good alerting is about signal-to-noise ratio. Too many alerts cause alert fatigue; too few mean you miss real incidents.

**Alert on symptoms, not causes:**

- Good: "Error rate > 5% for 5 minutes" (symptom -- users are affected)
- Bad: "CPU > 80%" (cause -- might be normal during a batch job)

**Severity levels:**

| Severity | Response | Example |
|----------|----------|---------|
| P1 - Critical | Page on-call immediately | Site is down, data loss |
| P2 - High | Respond within 30 minutes | Feature degraded, error rate elevated |
| P3 - Medium | Respond during business hours | Non-critical feature broken |
| P4 - Low | Address in next sprint | Cosmetic issue, minor inefficiency |

### 8. Performance Profiling

**Backend profiling:**

- CPU profiling: Where is computation time spent? (Go `pprof`, Python `cProfile`, Node.js `--prof`)
- Memory profiling: Where are allocations happening? Detecting leaks
- Database query profiling: `EXPLAIN ANALYZE`, slow query logs
- I/O profiling: Network calls, file system operations

**Frontend profiling:**

- Chrome DevTools Performance tab: Flame charts, main thread activity
- Lighthouse: Core Web Vitals (LCP, FID/INP, CLS)
- React Profiler: Component render times, unnecessary re-renders
- Network waterfall: Request timing, bundle sizes, lazy loading effectiveness
- Memory snapshots: Detached DOM nodes, growing heap

---

## Practical Scenarios

### Scenario 1: Diagnosing a Latency Spike

**Situation:** Dashboard shows P95 latency jumped from 300ms to 2 seconds at 2:15 PM.

**Investigation Steps:**

1. Check metrics dashboard: Is it all endpoints or specific ones?
2. Correlate with deployment timeline: Was there a deploy at 2:15?
3. Check downstream dependencies: Are database queries slower? External API latency?
4. Pull distributed traces for slow requests: Where is the time being spent?
5. Check resource metrics: CPU, memory, connection pools, thread pools
6. Review recent code changes if correlated with a deploy

**Root Cause Found:** A new feature added an N+1 query. Each order listing was making one query per order item instead of a single JOIN.

### Scenario 2: Intermittent 500 Errors

**Situation:** Error tracking shows sporadic 500 errors on the checkout endpoint. Rate is 0.5% -- low but consistent.

**Investigation Steps:**

1. Group errors in Sentry by exception type and stack trace
2. Look for patterns: specific users, specific products, specific times?
3. Check the trace for a failing request: which span failed?
4. Review the error context: what was the request payload?
5. Reproduce locally with the same payload

**Root Cause Found:** A race condition in inventory reservation. When two users purchased the last item simultaneously, the second request threw an unhandled exception from the database constraint violation.

### Scenario 3: Memory Leak in Production

**Situation:** A Node.js service restarts every 6 hours due to OOM kills. Memory usage grows linearly.

**Investigation Steps:**

1. Confirm the pattern via memory metrics over 24 hours
2. Take heap snapshots at intervals (1 hour apart)
3. Compare snapshots: what objects are growing?
4. Check for common leak patterns: event listeners not removed, closures holding references, growing caches without eviction
5. Review recent changes to the service

**Root Cause Found:** An in-memory cache for user sessions had no TTL or size limit. Every authenticated request added an entry that was never evicted.

### Scenario 4: Frontend Performance Degradation

**Situation:** Core Web Vitals scores dropped. LCP went from 1.8s to 4.2s after a release.

**Investigation Steps:**

1. Run Lighthouse on the affected pages
2. Check the Network waterfall: is there a new large resource?
3. Check the main thread: is there a long task blocking rendering?
4. Compare the JavaScript bundle sizes before and after the release
5. Check if third-party scripts were added

**Root Cause Found:** A new analytics library was imported synchronously in the main bundle, adding 180KB of JavaScript and blocking rendering.

---

## Interview Questions

### Question 1: How would you implement structured logging in a Node.js application?

**Answer:**

Use a logging library like `pino` or `winston` that outputs JSON. Create a logger factory that attaches common context (service name, version, environment) to every log entry. Use middleware to attach request-scoped context (request ID, user ID) using AsyncLocalStorage.

```typescript
// logger.ts
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  base: {
    service: 'order-service',
    version: process.env.APP_VERSION,
    env: process.env.NODE_ENV,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: ['req.headers.authorization', 'req.body.password', 'req.body.creditCard'],
});

export default logger;
```

```typescript
// request-context.ts
import { AsyncLocalStorage } from 'node:async_hooks';

interface RequestContext {
  requestId: string;
  userId?: string;
  traceId?: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext | undefined {
  return requestContext.getStore();
}
```

```typescript
// middleware/logging.ts
import { randomUUID } from 'node:crypto';
import logger from '../logger';
import { requestContext } from '../request-context';

export function requestLoggingMiddleware(req, res, next) {
  const requestId = req.headers['x-request-id'] || randomUUID();
  const ctx = { requestId, userId: req.user?.id, traceId: req.headers['traceparent'] };

  requestContext.run(ctx, () => {
    const startTime = process.hrtime.bigint();

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startTime) / 1_000_000;
      logger.info({
        ...ctx,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Math.round(durationMs),
        userAgent: req.headers['user-agent'],
      }, 'Request completed');
    });

    next();
  });
}
```

### Question 2: Explain the difference between logs, metrics, and traces. When would you use each?

**Answer:**

These are the three pillars of observability, each serving a different purpose:

**Logs** record discrete events with full context. Use them when you need to understand *what happened* for a specific request or operation. They are high-cardinality (every request generates entries) and high-volume.

**Metrics** record numerical measurements over time in aggregate. Use them to understand *trends and patterns* -- is latency increasing? Is the error rate spiking? They are low-cardinality and efficient to store.

**Traces** record the journey of a request across services. Use them to understand *where time is spent* in a distributed system and to pinpoint which service or operation is the bottleneck.

In practice: metrics tell you *something is wrong*, traces tell you *where it is wrong*, and logs tell you *why it is wrong*.

### Question 3: How do you set up effective alerting without causing alert fatigue?

**Answer:**

Five principles:

1. **Alert on symptoms, not causes.** Alert on "error rate > 5%" rather than "CPU > 80%." Users care about symptoms.

2. **Use multiple severity levels.** Not every alert needs to page someone at 3 AM. P1 pages immediately; P3 creates a ticket for business hours.

3. **Set meaningful thresholds with appropriate windows.** "Error rate > 5% for 5 minutes" prevents alerts from one-off spikes. Use burn-rate based alerting for SLO violations.

4. **Every alert must be actionable.** If the on-call engineer cannot do anything about it, it should not page. Include a runbook link in every alert.

5. **Review and prune regularly.** Track alert frequency. If an alert fires weekly and is always ignored, either fix the underlying issue or remove the alert.

### Question 4: A service is throwing 500 errors intermittently. Walk me through your debugging process.

**Answer:**

1. **Quantify:** Check error rate in metrics. Is it 0.1% or 10%? Is it increasing?
2. **Identify patterns:** Check error tracking (Sentry). Are errors grouped by one root cause or many? Is it specific endpoints, specific users, or random?
3. **Read the traces:** Pull a distributed trace for a failing request. Identify which span failed and what the error message was.
4. **Read the logs:** Find the correlated log entries using the request ID. Look at the full error stack trace and the request context.
5. **Form a hypothesis:** Based on the error, context, and patterns, hypothesize the cause.
6. **Reproduce:** Try to reproduce the issue locally or in staging with the same inputs.
7. **Fix and verify:** Deploy the fix. Watch the error rate return to baseline. Confirm in error tracking that no new occurrences appear.

### Question 5: How would you implement health checks for a microservice?

**Answer:**

Implement two endpoints:

```typescript
// health.ts - Express example
import { Router } from 'express';
import { Pool } from 'pg';
import { createClient } from 'redis';

const router = Router();

// Liveness: Is the process alive and responsive?
router.get('/health/live', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Readiness: Can this instance serve traffic?
router.get('/health/ready', async (req, res) => {
  const checks = {
    database: await checkDatabase(),
    cache: await checkCache(),
    diskSpace: checkDiskSpace(),
  };

  const allHealthy = Object.values(checks).every(c => c.status === 'ok');

  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'ok' : 'degraded',
    checks,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

async function checkDatabase(): Promise<HealthCheck> {
  try {
    const start = Date.now();
    await pool.query('SELECT 1');
    return { status: 'ok', responseTimeMs: Date.now() - start };
  } catch (error) {
    return { status: 'fail', error: error.message };
  }
}

async function checkCache(): Promise<HealthCheck> {
  try {
    const start = Date.now();
    await redisClient.ping();
    return { status: 'ok', responseTimeMs: Date.now() - start };
  } catch (error) {
    return { status: 'fail', error: error.message };
  }
}

function checkDiskSpace(): HealthCheck {
  // Check available disk space
  const freePercent = getFreeSpacePercent();
  return freePercent > 10
    ? { status: 'ok', freePercent }
    : { status: 'warn', freePercent };
}

interface HealthCheck {
  status: 'ok' | 'warn' | 'fail';
  responseTimeMs?: number;
  error?: string;
  [key: string]: unknown;
}

export default router;
```

In Kubernetes, configure these as probes:

```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 15
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /health/ready
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 10
  failureThreshold: 2
```

### Question 6: How do you profile a slow React application?

**Answer:**

1. **Measure first:** Run Lighthouse to get baseline Core Web Vitals scores (LCP, INP, CLS).

2. **Check the bundle:** Use `webpack-bundle-analyzer` or `next build --analyze` to identify large dependencies. Look for libraries that can be replaced with smaller alternatives or lazy loaded.

3. **Profile rendering:** Use React DevTools Profiler to record a session. Look for:
   - Components re-rendering unnecessarily (missing `memo`, unstable props)
   - Expensive computations in render (should be in `useMemo`)
   - Large component trees rendering on every state change

4. **Check the network waterfall:** In Chrome DevTools Network tab, look for:
   - Render-blocking resources
   - Large images without lazy loading
   - Uncompressed assets
   - Sequential API calls that could be parallelized

5. **Profile the main thread:** In Chrome DevTools Performance tab, record a session and look for long tasks (> 50ms) that block interactivity.

6. **Fix in priority order:** Largest impact first. Often the top three issues account for 80% of the slowness.

### Question 7: What is OpenTelemetry and why does it matter?

**Answer:**

OpenTelemetry (OTel) is a vendor-neutral, open-source observability framework for generating, collecting, and exporting telemetry data (traces, metrics, logs). It is the merger of OpenTracing and OpenCensus and is now the CNCF standard.

**Why it matters:**

- **Vendor neutrality:** Instrument once, export to any backend (Datadog, Jaeger, Prometheus, Grafana Cloud). No vendor lock-in.
- **Automatic instrumentation:** SDKs auto-instrument popular frameworks (Express, Django, Gin, Spring) and libraries (HTTP clients, database drivers, message queues).
- **Correlation:** Traces, metrics, and logs share context (trace ID), enabling you to jump from a metric spike to the relevant traces to the specific logs.
- **Industry standard:** Supported by all major observability vendors. Skills are transferable.

### Question 8: How do you handle logging in a frontend application?

**Answer:**

Frontend logging is different from backend because logs are generated in the user's browser, not on your servers. You need to send them somewhere.

**Approach:**

1. **Capture errors automatically:** Use `window.onerror` and `window.onunhandledrejection` to catch uncaught exceptions.
2. **Use an error tracking service:** Sentry, Bugsnag, or LogRocket. These capture errors with stack traces, source maps, session replay, and breadcrumbs.
3. **Log meaningful user actions as breadcrumbs:** Page navigations, button clicks, API calls. When an error occurs, you have context about what the user was doing.
4. **Respect performance:** Buffer and batch log submissions. Do not send an HTTP request for every log statement.
5. **Respect privacy:** Do not log PII. Scrub sensitive data before sending.

```typescript
// error-boundary.tsx
import { Component, ErrorInfo, ReactNode } from 'react';
import * as Sentry from '@sentry/react';

interface Props {
  children: ReactNode;
  fallback: ReactNode;
}

interface State {
  hasError: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    Sentry.captureException(error, {
      extra: {
        componentStack: errorInfo.componentStack,
      },
    });
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
```

---

## Code Examples

### Example 1: Prometheus Metrics in a Node.js Service

```typescript
// metrics.ts
import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

const registry = new Registry();

collectDefaultMetrics({ register: registry });

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status_code'] as const,
  registers: [registry],
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

export const activeConnections = new Gauge({
  name: 'active_connections',
  help: 'Number of active connections',
  registers: [registry],
});

export { registry };
```

```typescript
// middleware/metrics.ts
import { httpRequestsTotal, httpRequestDuration, activeConnections } from '../metrics';

export function metricsMiddleware(req, res, next) {
  activeConnections.inc();
  const end = httpRequestDuration.startTimer({ method: req.method, path: req.route?.path || req.path });

  res.on('finish', () => {
    end();
    activeConnections.dec();
    httpRequestsTotal.inc({
      method: req.method,
      path: req.route?.path || req.path,
      status_code: res.statusCode.toString(),
    });
  });

  next();
}
```

```typescript
// routes/metrics.ts -- Expose metrics endpoint for Prometheus scraping
import { Router } from 'express';
import { registry } from '../metrics';

const router = Router();

router.get('/metrics', async (req, res) => {
  res.set('Content-Type', registry.contentType);
  res.end(await registry.metrics());
});

export default router;
```

### Example 2: OpenTelemetry Setup

```typescript
// tracing.ts -- Initialize before importing any other modules
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';

const sdk = new NodeSDK({
  resource: new Resource({
    [ATTR_SERVICE_NAME]: 'order-service',
    [ATTR_SERVICE_VERSION]: process.env.APP_VERSION || '0.0.0',
  }),
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/metrics',
    }),
    exportIntervalMillis: 30000,
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-http': { enabled: true },
      '@opentelemetry/instrumentation-express': { enabled: true },
      '@opentelemetry/instrumentation-pg': { enabled: true },
      '@opentelemetry/instrumentation-redis': { enabled: true },
    }),
  ],
});

sdk.start();

process.on('SIGTERM', () => {
  sdk.shutdown().then(
    () => process.exit(0),
    (err) => {
      console.error('OTel shutdown error', err);
      process.exit(1);
    }
  );
});
```

### Example 3: Custom Span for Business Logic

```typescript
// services/order-service.ts
import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('order-service');

export async function createOrder(userId: string, items: OrderItem[]): Promise<Order> {
  return tracer.startActiveSpan('createOrder', async (span) => {
    try {
      span.setAttribute('user.id', userId);
      span.setAttribute('order.item_count', items.length);

      const inventory = await tracer.startActiveSpan('checkInventory', async (inventorySpan) => {
        const result = await inventoryService.checkAvailability(items);
        inventorySpan.setAttribute('inventory.all_available', result.allAvailable);
        inventorySpan.end();
        return result;
      });

      if (!inventory.allAvailable) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'Items out of stock' });
        throw new Error('Items out of stock');
      }

      const order = await tracer.startActiveSpan('persistOrder', async (dbSpan) => {
        const result = await orderRepository.create({ userId, items });
        dbSpan.setAttribute('order.id', result.id);
        dbSpan.end();
        return result;
      });

      span.setAttribute('order.id', order.id);
      span.setStatus({ code: SpanStatusCode.OK });
      return order;
    } catch (error) {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      throw error;
    } finally {
      span.end();
    }
  });
}
```

### Example 4: Grafana Dashboard Configuration (as JSON model)

```json
{
  "title": "Service Overview",
  "panels": [
    {
      "title": "Request Rate",
      "type": "timeseries",
      "targets": [
        {
          "expr": "rate(http_requests_total{service=\"order-service\"}[5m])",
          "legendFormat": "{{method}} {{path}} {{status_code}}"
        }
      ]
    },
    {
      "title": "P95 Latency",
      "type": "timeseries",
      "targets": [
        {
          "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{service=\"order-service\"}[5m]))",
          "legendFormat": "{{path}}"
        }
      ]
    },
    {
      "title": "Error Rate",
      "type": "stat",
      "targets": [
        {
          "expr": "sum(rate(http_requests_total{status_code=~\"5..\"}[5m])) / sum(rate(http_requests_total[5m])) * 100",
          "legendFormat": "Error %"
        }
      ]
    },
    {
      "title": "Active Connections",
      "type": "gauge",
      "targets": [
        {
          "expr": "active_connections{service=\"order-service\"}"
        }
      ]
    }
  ]
}
```

### Example 5: Frontend Performance Monitoring

```typescript
// web-vitals.ts
import { onCLS, onINP, onLCP, onFCP, onTTFB } from 'web-vitals';

interface VitalMetric {
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  id: string;
}

function sendToAnalytics(metric: VitalMetric) {
  const body = JSON.stringify({
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    id: metric.id,
    url: window.location.href,
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString(),
  });

  // Use sendBeacon for reliability (survives page unload)
  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/vitals', body);
  } else {
    fetch('/api/vitals', { method: 'POST', body, keepalive: true });
  }
}

export function initWebVitals() {
  onCLS(sendToAnalytics);
  onINP(sendToAnalytics);
  onLCP(sendToAnalytics);
  onFCP(sendToAnalytics);
  onTTFB(sendToAnalytics);
}
```

### Example 6: Alerting Rules (Prometheus Alertmanager)

```yaml
# alert-rules.yaml
groups:
  - name: service-alerts
    rules:
      - alert: HighErrorRate
        expr: |
          sum(rate(http_requests_total{status_code=~"5.."}[5m]))
          / sum(rate(http_requests_total[5m])) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value | humanizePercentage }} (threshold: 5%)"
          runbook: "https://wiki.internal/runbooks/high-error-rate"

      - alert: HighLatency
        expr: |
          histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 2
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "P95 latency above 2 seconds"
          description: "P95 latency is {{ $value }}s"

      - alert: ServiceDown
        expr: up{job="order-service"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Service is down"
          description: "{{ $labels.instance }} has been down for more than 1 minute"

      - alert: MemoryUsageHigh
        expr: |
          process_resident_memory_bytes / (1024 * 1024 * 1024) > 1.5
        for: 15m
        labels:
          severity: warning
        annotations:
          summary: "Memory usage above 1.5GB for 15 minutes"
          description: "Current memory: {{ $value | humanize }}GB. Possible memory leak."
```

---

## Quick Reference

### Observability at a Glance

```
Metrics  --> "Something is wrong"     --> Dashboards, Alerts
Traces   --> "Where is it wrong"      --> Distributed trace view
Logs     --> "Why is it wrong"        --> Log search, context
```

### Log Level Decision Tree

```
Did the request/operation FAIL?
  Yes --> Is it unexpected?
    Yes --> ERROR
    No  --> WARN (expected failure, e.g., validation)
  No  --> Is it a normal business event?
    Yes --> INFO
    No  --> Is it useful for debugging?
      Yes --> DEBUG
      No  --> Don't log it
```

### The Four Golden Signals

| Signal | What to Track | Alert Threshold Example |
|--------|--------------|------------------------|
| Latency | P50, P95, P99 response time | P95 > 2s for 10 min |
| Traffic | Requests per second | > 2x normal for 5 min |
| Errors | 5xx rate, exception rate | > 5% for 5 min |
| Saturation | CPU, memory, disk, connections | > 90% for 15 min |

### Debugging Checklist

```
1. [ ] Reproduce: Can I reproduce it? (locally, staging, specific request)
2. [ ] Quantify: What percentage of requests are affected?
3. [ ] Identify patterns: Time-based? User-based? Input-based?
4. [ ] Read traces: Where does the request spend time?
5. [ ] Read logs: What is the error message and stack trace?
6. [ ] Check recent changes: Was there a recent deploy?
7. [ ] Check dependencies: Are downstream services healthy?
8. [ ] Form hypothesis and verify
9. [ ] Fix, deploy, monitor
10. [ ] Write postmortem if warranted
```

### Common Monitoring Stack Combinations

| Stack | Components |
|-------|------------|
| **Grafana Stack** (OSS) | Prometheus (metrics) + Loki (logs) + Tempo (traces) + Grafana (dashboards) |
| **ELK Stack** (OSS) | Elasticsearch (search) + Logstash (ingest) + Kibana (dashboards) + Elastic APM |
| **AWS Native** | CloudWatch (metrics/logs) + X-Ray (traces) + SNS (alerts) |
| **Datadog** (SaaS) | Unified platform: metrics, logs, traces, RUM, synthetics |

### Essential Prometheus Queries (PromQL)

```promql
# Request rate
rate(http_requests_total[5m])

# Error rate percentage
sum(rate(http_requests_total{status_code=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) * 100

# P95 latency
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# Top 5 slowest endpoints
topk(5, histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])))

# Memory usage trend
rate(process_resident_memory_bytes[1h])
```

### Core Web Vitals Thresholds

| Metric | Good | Needs Improvement | Poor |
|--------|------|-------------------|------|
| LCP (Largest Contentful Paint) | < 2.5s | 2.5s - 4.0s | > 4.0s |
| INP (Interaction to Next Paint) | < 200ms | 200ms - 500ms | > 500ms |
| CLS (Cumulative Layout Shift) | < 0.1 | 0.1 - 0.25 | > 0.25 |

### Key Takeaways

1. **Instrument before you need it.** Adding observability after an outage is too late.
2. **Structured logging is non-negotiable.** JSON logs with correlation IDs save hours of debugging.
3. **Alert on symptoms, not causes.** Users experience symptoms.
4. **Distributed tracing is essential** once you have more than one service.
5. **Frontend performance matters.** Core Web Vitals affect user experience and SEO.
6. **Health checks are infrastructure.** They enable zero-downtime deployments and auto-healing.
7. **Postmortems prevent repeat incidents.** Track root causes and follow up on action items.
