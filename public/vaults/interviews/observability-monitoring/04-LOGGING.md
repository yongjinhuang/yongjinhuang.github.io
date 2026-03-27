# Logging

A comprehensive guide to logging in distributed systems. Covers structured logging,
the ELK stack, Grafana Loki, log aggregation patterns, and best practices for
security, retention, and correlation.

---

## Table of Contents

1. [Logging Fundamentals](#1-logging-fundamentals)
2. [Structured Logging](#2-structured-logging)
3. [ELK Stack](#3-elk-stack)
4. [Grafana Loki](#4-grafana-loki)
5. [Log Aggregation Patterns](#5-log-aggregation-patterns)
6. [Log Retention & Lifecycle](#6-log-retention--lifecycle)
7. [Security & PII](#7-security--pii)
8. [Best Practices](#8-best-practices)
9. [Common Interview Questions](#9-common-interview-questions)
10. [Quick Reference](#10-quick-reference)

---

## 1. Logging Fundamentals

### Log Levels

| Level | When to Use | Example |
|-------|-------------|---------|
| **TRACE** | Finest-grained detail | Method entry/exit, variable values |
| **DEBUG** | Diagnostic information | SQL queries, cache hits/misses |
| **INFO** | Normal operations | Request completed, service started |
| **WARN** | Potentially harmful | Retry attempt, deprecated API used |
| **ERROR** | Failure requiring attention | Exception caught, external service down |
| **FATAL** | System cannot continue | Out of memory, critical config missing |

**Production default**: INFO. Enable DEBUG/TRACE only for troubleshooting.

### Structured vs Unstructured

```
UNSTRUCTURED (hard to parse):
2024-01-15 10:23:45 ERROR Failed to process order 12345 for user john@example.com

STRUCTURED (machine-parseable):
{
  "timestamp": "2024-01-15T10:23:45Z",
  "level": "ERROR",
  "message": "Failed to process order",
  "order_id": 12345,
  "user_id": "usr_abc123",
  "trace_id": "abc123def456",
  "service": "order-service",
  "error": "PaymentGatewayTimeout"
}
```

---

## 2. Structured Logging

### Code Examples

**Node.js (Pino):**
```javascript
const pino = require('pino');
const logger = pino({ level: 'info' });

logger.info({ orderId: 12345, userId: 'usr_abc' }, 'Order processed');
// {"level":30,"time":1705312025000,"orderId":12345,"userId":"usr_abc","msg":"Order processed"}
```

**Python (structlog):**
```python
import structlog

logger = structlog.get_logger()
logger.info("order_processed", order_id=12345, user_id="usr_abc")
# {"event": "order_processed", "order_id": 12345, "user_id": "usr_abc", "timestamp": "..."}
```

**Go (zerolog):**
```go
log.Info().
    Int("order_id", 12345).
    Str("user_id", "usr_abc").
    Msg("Order processed")
```

### Correlation IDs

Pass a unique ID through all services in a request chain:

```
Service A → Service B → Service C
   │            │            │
   └── trace_id: "abc123" ──┘

All logs from this request have trace_id: "abc123"
→ Search by trace_id to see the full request journey
```

---

## 3. ELK Stack

### Architecture

```
┌──────────────────────────────────────────────────┐
│                   ELK STACK                       │
│                                                   │
│  ┌──────────┐                                     │
│  │ Filebeat │  Lightweight log shipper             │
│  │ (on each │  Tails log files, ships to Logstash  │
│  │  host)   │                                     │
│  └────┬─────┘                                     │
│       │                                            │
│       ▼                                            │
│  ┌──────────────────────┐                          │
│  │      LOGSTASH         │  Processing pipeline    │
│  │ ┌──────┬──────┬─────┐│                          │
│  │ │Input │Filter│Output││  Parse, enrich, route   │
│  │ │(beats│(grok │(ES)  ││                          │
│  │ │ kafka│ mutate│      ││                          │
│  │ │ file)│ date)│      ││                          │
│  │ └──────┴──────┴─────┘│                          │
│  └──────────┬───────────┘                          │
│             ▼                                      │
│  ┌──────────────────────┐                          │
│  │   ELASTICSEARCH       │  Search & storage       │
│  │ ┌──────────────────┐ │                          │
│  │ │ Index: logs-2024 │ │  Shards + replicas       │
│  │ │ ┌─────┐ ┌─────┐  │ │  Inverted index          │
│  │ │ │Shard│ │Shard│  │ │                          │
│  │ │ │  1  │ │  2  │  │ │                          │
│  │ │ └─────┘ └─────┘  │ │                          │
│  │ └──────────────────┘ │                          │
│  └──────────┬───────────┘                          │
│             ▼                                      │
│  ┌──────────────────────┐                          │
│  │      KIBANA           │  Visualization           │
│  │ Discover | Visualize  │  Dashboards              │
│  │ Dashboard | Alerting  │  Full-text search        │
│  └──────────────────────┘                          │
└──────────────────────────────────────────────────┘
```

### Elasticsearch Concepts

| Concept | Description |
|---------|-------------|
| **Index** | Collection of documents (like a database table) |
| **Shard** | Horizontal partition of an index |
| **Replica** | Copy of a shard for HA and read scaling |
| **Inverted Index** | Maps terms → documents (fast full-text search) |
| **Mapping** | Schema defining field types |

### Logstash Pipeline

```ruby
input {
  beats { port => 5044 }
}

filter {
  grok {
    match => { "message" => "%{TIMESTAMP_ISO8601:timestamp} %{LOGLEVEL:level} %{GREEDYDATA:msg}" }
  }
  date {
    match => [ "timestamp", "ISO8601" ]
  }
  mutate {
    remove_field => [ "message" ]
  }
}

output {
  elasticsearch {
    hosts => ["http://elasticsearch:9200"]
    index => "logs-%{+YYYY.MM.dd}"
  }
}
```

---

## 4. Grafana Loki

### Architecture

```
┌──────────────────────────────────────────┐
│              GRAFANA LOKI                 │
│                                           │
│  ┌───────────┐   ┌───────────────────┐   │
│  │Distributor│──>│    Ingester       │   │
│  │(receives  │   │(builds chunks,    │   │
│  │ pushes)   │   │ flushes to store) │   │
│  └───────────┘   └───────────────────┘   │
│                           │               │
│                           ▼               │
│                  ┌────────────────┐       │
│                  │ Object Storage │       │
│                  │ (S3/GCS/Azure) │       │
│                  └────────────────┘       │
│                           │               │
│  ┌───────────┐           │               │
│  │  Querier  │───────────┘               │
│  │(executes  │                            │
│  │ LogQL)    │                            │
│  └───────────┘                            │
└──────────────────────────────────────────┘
```

**Key difference from Elasticsearch**: Loki indexes only **labels** (metadata), not log content. This makes it much cheaper to operate but requires labels for efficient querying.

### LogQL

```logql
# Filter by labels
{service="api-gateway", env="production"}

# Filter by content
{service="api-gateway"} |= "error"
{service="api-gateway"} !~ "health_check"

# Parse and extract
{service="api-gateway"} | json | status >= 500

# Metrics from logs
count_over_time({service="api-gateway"} |= "error" [5m])
rate({service="api-gateway"}[5m])
```

### Loki vs Elasticsearch

| Aspect | Loki | Elasticsearch |
|--------|------|---------------|
| **Indexing** | Labels only | Full-text content |
| **Storage Cost** | Much lower | Higher |
| **Query Speed** | Label queries fast; content grep slower | Fast full-text search |
| **Complexity** | Simpler to operate | More complex |
| **Integration** | Native Grafana | Kibana |
| **Best For** | Cost-effective log aggregation | Full-text search, analytics |

---

## 5. Log Aggregation Patterns

### Sidecar Pattern (Kubernetes)

```
┌────────────────────────┐
│         POD             │
│ ┌──────────┐ ┌────────┐│
│ │   App    │ │Sidecar ││
│ │Container │ │(Fluent ││
│ │          │→│ Bit)   ││──> Log Backend
│ │ stdout/  │ │        ││
│ │ files    │ │        ││
│ └──────────┘ └────────┘│
└────────────────────────┘
```

### DaemonSet Pattern (Recommended for K8s)

```
┌──────────── Node ──────────────┐
│  ┌─────┐ ┌─────┐ ┌─────┐      │
│  │Pod 1│ │Pod 2│ │Pod 3│      │
│  │→stdout│→stdout│→stdout      │
│  └──┬──┘ └──┬──┘ └──┬──┘      │
│     └────────┼───────┘         │
│              ▼                  │
│     ┌──────────────┐           │
│     │  DaemonSet   │           │──> Log Backend
│     │ (Fluent Bit) │           │
│     └──────────────┘           │
└────────────────────────────────┘
```

### Fluentd vs Fluent Bit

| Aspect | Fluentd | Fluent Bit |
|--------|---------|-----------|
| **Memory** | ~40MB | ~1MB |
| **Plugins** | 1000+ | 100+ |
| **Language** | Ruby + C | C |
| **Use Case** | Aggregator | Edge collector |
| **Recommendation** | Log aggregation tier | DaemonSet on every node |

---

## 6. Log Retention & Lifecycle

### Hot/Warm/Cold Tiers

| Tier | Storage | Retention | Query Speed | Cost |
|------|---------|-----------|-------------|------|
| **Hot** | SSD | 1-7 days | Fastest | Highest |
| **Warm** | HDD | 7-30 days | Medium | Medium |
| **Cold** | Object storage | 30-365 days | Slowest | Lowest |
| **Frozen** | Archive (S3 Glacier) | 1-7 years | Very slow | Minimal |

### Index Lifecycle Management (Elasticsearch)

```json
{
  "policy": {
    "phases": {
      "hot":   { "actions": { "rollover": { "max_size": "50GB", "max_age": "1d" } } },
      "warm":  { "min_age": "7d",  "actions": { "forcemerge": { "max_num_segments": 1 } } },
      "cold":  { "min_age": "30d", "actions": { "freeze": {} } },
      "delete": { "min_age": "90d", "actions": { "delete": {} } }
    }
  }
}
```

---

## 7. Security & PII

### What NOT to Log

- Passwords, API keys, tokens
- Credit card numbers, SSNs
- Personal health information (PHI)
- Full email addresses (hash or truncate)
- Session tokens

### Redaction Patterns

```python
import re

def redact_pii(log_message):
    log_message = re.sub(r'\b\d{16}\b', '[REDACTED_CC]', log_message)
    log_message = re.sub(r'[\w.-]+@[\w.-]+\.\w+', '[REDACTED_EMAIL]', log_message)
    log_message = re.sub(r'Bearer\s+[\w.-]+', 'Bearer [REDACTED]', log_message)
    return log_message
```

---

## 8. Best Practices

1. **Always use structured logging** -- JSON format, consistent fields
2. **Include correlation IDs** -- trace_id in every log line
3. **Log at the right level** -- ERROR for failures, INFO for normal ops
4. **Don't log PII** -- Redact before logging, not after
5. **Use labels wisely (Loki)** -- Low cardinality only (service, env, level)
6. **Set retention policies** -- Don't keep logs forever; tier appropriately
7. **Sample high-volume logs** -- Log 10% of health checks, 100% of errors
8. **Include context** -- request_id, user_id, service, operation

---

## 9. Common Interview Questions

**Q: Why structured logging over unstructured?**
Structured (JSON) is machine-parseable, enabling automated filtering, aggregation, and alerting. Unstructured requires regex parsing (fragile, slow). Structured enables consistent fields across services for cross-service correlation.

**Q: How does Loki differ from Elasticsearch?**
Loki indexes labels only (not content), making it much cheaper to operate. Elasticsearch provides full-text indexing for fast content search. Choose Loki for cost-effective aggregation; Elasticsearch when you need powerful search/analytics.

**Q: What are correlation IDs and why do they matter?**
A unique ID (typically trace_id from distributed tracing) passed through all services in a request chain. Every log includes this ID, allowing you to search and see the entire request journey across services.

**Q: How do you handle high-volume logging without overwhelming storage?**
Log sampling (100% errors, 10% success), tiered retention (hot/warm/cold), structured logging with selective fields, label-based filtering, setting appropriate log levels in production.

---

## 10. Quick Reference

### LogQL Cheat Sheet

```logql
{app="myapp"}                           # Label filter
{app="myapp"} |= "error"               # Contains "error"
{app="myapp"} != "healthcheck"          # Excludes "healthcheck"
{app="myapp"} | json | status >= 500    # Parse JSON, filter
count_over_time({app="myapp"}[5m])      # Count per 5 min
rate({app="myapp"} |= "error"[1m])      # Error rate per second
```
