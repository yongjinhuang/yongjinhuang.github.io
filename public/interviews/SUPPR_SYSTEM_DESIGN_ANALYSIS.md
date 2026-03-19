# Suppr System Design Analysis

## 1. System Architecture Overview

Suppr is an **AI-powered academic research platform** built on Spring Boot 3.5.3 (Java 21). It provides three core AI services: **LLM-based document search**, **multi-language file translation**, and **deep research report generation**.

### 1.1 Deployment Topology

```
                    ┌──────────────┐
                    │   Clients    │
                    │ (Web/WeChat) │
                    └──────┬───────┘
                           │
              ┌────────────┴────────────┐
              │      K8s Ingress        │
              └────────────┬────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                                   ▼
  ┌──────────────┐                   ┌──────────────┐
  │  API Profile │ (Undertow, 64    │   Consumer   │ (Kafka listeners,
  │  (REST + SSE)│  worker threads)  │   Profile    │  3 concurrency/node)
  └──────┬───────┘                   └──────┬───────┘
         │                                  │
         │    ┌─────────────────────────┐   │
         ├───▶│         Kafka           │◀──┤
         │    │ (3 topics, manual ACK)  │   │
         │    └─────────────────────────┘   │
         │                                  │
    ┌────┴──────────────────────────────────┴────┐
    │              Shared Data Layer              │
    ├────────────┬───────────┬──────────┬────────┤
    │   MySQL    │  MongoDB  │  Redis   │ MinIO  │
    │ (HikariCP │ (articles,│ (JWT,    │ (S3    │
    │  pool=2)  │  caches)  │  pub/sub │  files)│
    │           │           │  locks)  │        │
    └───────────┴───────────┴──────────┴────────┘
```

### 1.2 External Service Dependencies

| Service                   | Purpose                                     | Protocol       | Timeout  |
| ------------------------- | ------------------------------------------- | -------------- | -------- |
| **LLM Service**           | Doc search, summarization, query rewriting  | HTTP/REST      | 30 min   |
| **Translation Service**   | File translation (Word/Excel/PDF/PPT)       | HTTP/SSE       | 24 hours |
| **Deep Research Service** | Research report generation                  | HTTP/SSE       | 30 min   |
| **Gotenberg**             | PDF conversion via LibreOffice/Chromium     | HTTP/Multipart | 30 min   |
| **PubMed/NCBI**           | Academic article metadata & citations       | HTTP/REST      | 30 min   |
| **WeChat MP + Mini-app**  | OAuth login, notifications                  | HTTPS          | Default  |
| **Wilddata Pay**          | Payment gateway (WeChat Pay, Alipay)        | HTTP/REST      | 30 min   |
| **Strapi CMS**            | Content management for sharing              | HTTP/REST      | 5 min    |
| **File Download Proxy**   | External file retrieval with fallback chain | HTTP           | 30s      |

### 1.3 Key Design Decisions

- **API/Consumer profile split**: Same codebase, different Spring profiles. API handles HTTP requests; Consumer handles Kafka messages. Deployed as separate K8s workloads for independent scaling.
- **Kafka for async task processing**: Long-running tasks (translation up to 24h, research up to 30min) are queued via Kafka with manual ACK for at-least-once delivery.
- **SSE + Redis pub/sub for real-time progress**: Clients connect via SSE to the API pod; Consumer publishes events to Redis pub/sub; API pod relays them to clients.
- **Three-stage point system**: Points go through `award → freeze → consume/rollback → expire`. Freezing prevents overselling during long-running async tasks. Rollback restores points on failure.
- **TransactionSynchronization for Kafka**: Kafka messages are sent only after DB transaction commits, preventing orphan messages.

---

## 2. Core Business Flows

### 2.1 File Translation Flow

```
User Upload → Pre-translate (extract metadata, calculate cost)
           → Freeze Points
           → DB Commit + Kafka Send (TransactionSynchronization)
           → Consumer picks up message
           → Concurrency check (3 for members, 1 for free users via Redis)
           → Health check on Translation Service
           → Stream translation via external service
           → Upload result to MinIO
           → Update session status → ACK Kafka
           → On failure: rollback points, set ERROR status, no ACK (Kafka retries)
```

### 2.2 Deep Research Flow

```
User Query → Create session → Freeze estimated points (~1000)
          → Send to Kafka DEEP_RESEARCH_TOPIC
          → Consumer calls external Deep Research Service
          → Events streamed via Redis pub/sub channel
          → API pod relays events to client via SSE
          → On completion: generate markdown/docx, save to MinIO
          → Consume actual points, unfreeze remainder
```

### 2.3 Payment Flow

```
Create Order (OrderTab, status=WAITING)
  → Call Wilddata Pay to create payment
  → Return payment URL to client
  → User pays via WeChat/Alipay
  → Payment gateway sends callback
  → Idempotency check (skip if already SUCCESS)
  → Conditional update: WAITING → SUCCESS
  → Allocate benefits (points / membership / API credits)
  → On refund: reverse callback → withdraw benefits (FIFO)
```

### 2.4 Points Lifecycle

```
AWARD (purchase/membership/free/earned)
  → FREEZE (reserve for pending operation)
  → CONSUME (deduct after success) or ROLLBACK (restore on failure)
  → EXPIRE (hourly cron via ShedLock, soft delete)
```

---

## 3. Current Issues

### 3.1 Critical

#### MySQL connection pool size = 2

HikariCP max pool is set to 2. Under any concurrent load, requests will queue for a DB connection, causing latency spikes and timeouts. With 64 Undertow worker threads, 62 could be blocked waiting for a connection.

#### No circuit breakers on external services

6+ external HTTP dependencies (LLM, Translation, Gotenberg, PubMed, Payment, Strapi) have no circuit breaker or fallback. If the LLM service goes down, all requests to it will hang for up to 30 minutes, exhausting thread pools and cascading failures to unrelated endpoints.

#### Point system race conditions

Recent git history shows a bug fix for "double refund consumer points". The point operations lack pessimistic locking (`SELECT ... FOR UPDATE`) or optimistic locking (version fields). Concurrent requests on the same user's points can produce inconsistent balances.

### 3.2 High

#### No distributed tracing or metrics

No Micrometer/Prometheus metrics, no SkyWalking/OpenTelemetry tracing. In a multi-pod K8s deployment with async Kafka flows, diagnosing latency or failures across API → Kafka → Consumer → External Service is essentially guesswork.

#### SSE memory leak risk

SSE emitters are stored in a `ConcurrentHashMap` with a 50-minute timeout. If clients disconnect abnormally (network drop, browser close), callbacks may not fire, leaving stale emitters in memory. No periodic cleanup or eviction policy exists.

#### Redis as single point of failure for real-time features

SSE event relay, JWT validation, active task counting, and stop signals all depend on a single Redis instance. Redis downtime breaks all real-time features simultaneously.

#### Kafka consumer concurrency mismatch

Consumer concurrency is 3 per node, but the thread pool executor allows up to 50 threads. Non-premium users are limited to 1 concurrent task — excess tasks poll Redis every 2 seconds indefinitely, wasting consumer threads.

### 3.3 Medium

#### No database migration tool

No Flyway or Liquibase detected. Schema changes are manual, making deployments error-prone and hard to roll back.

#### God classes

`FileTranslationServiceImpl` is 1,003 lines; `AdminController` is 1,095 lines. These violate single responsibility and are hard to test/maintain.

#### Inconsistent thread pool rejection policies

Some pools use `AbortPolicy` (throw exception), others use `CallerRunsPolicy` (block caller). This creates unpredictable behavior under load.

---

## 4. What's Done Well

### 4.1 Transactional Safety: Deferred Kafka Send

Kafka messages are sent **only after the DB transaction commits** using `TransactionSynchronizationManager`. This prevents a critical failure mode: if the transaction rolls back, no orphan Kafka message is produced. Without this, a consumer could process a message for data that never got persisted.

```java
// FileTranslationServiceImpl.java:421
TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
    @Override
    public void afterCommit() {
        fileTranslateTaskProducer.sendTranslateTask(uid, fileTranslationSessionId);
    }
});
```

This pattern is used consistently across file translation, deep research, and payment notification flows.

### 4.2 Three-Stage Point Lifecycle (Freeze → Consume → Rollback)

The point system solves a hard problem: how to bill users for async operations that may take hours and may fail. The solution is a **reservation pattern**:

1. **Freeze** — Reserve estimated points before starting the task. Points that expire soonest are frozen first (FIFO fairness). This prevents overselling if the user starts multiple tasks concurrently.
2. **Consume** — Deduct from frozen points after the task succeeds. Each deduction is recorded in `UserConsumedPointTab` with an audit trail linking back to the source pool.
3. **Rollback** — If the task fails, restore frozen points to their original pools and create a reversal record. The `uprid` (point record ID) links the entire chain for traceability.

This design ensures **no points are lost** regardless of whether the async task succeeds, fails, or times out.

### 4.3 Kafka Manual ACK with Point Rollback on Failure

Consumers use **manual acknowledgment** (`enable-auto-commit: false`, `ack-mode: manual`). The consumer offloads long-running work to a thread pool and ACKs immediately, keeping the Kafka poller unblocked. On task failure, the error handler:

1. Sets session status to `ERROR`
2. Rolls back consumed points via `pointService.rollbackPointRecord()`
3. Cleans up Redis stop signals and active task counters
4. Logs the error for debugging

This guarantees **no silent point loss** — every failure path restores the user's balance.

### 4.4 Redis-Based Concurrency Control with Stop Signals

File translation enforces per-user concurrency limits (3 for members, 1 for free users) via Redis atomic counters:

- `file_translation:active_tasks:{uid}` — Incremented on task start, decremented on completion, with a 24-hour TTL to prevent leaks.
- `file_translation:stop:{sessionId}` — A Redis key that acts as a cancellation flag. The consumer checks this key periodically, allowing users to cancel long-running tasks gracefully.

The stop signal is checked both **while waiting for a slot** and **during translation processing**, so cancellation is responsive regardless of where the task is in its lifecycle.

### 4.5 File Translation Deduplication

Two levels of deduplication avoid redundant work:

1. **Pre-translation cache**: If a file URL has been analyzed before (token count, language detection), the cached `FilePreTranslateInfoTab` is returned instead of re-calling the external service.
2. **Translation result reuse**: If the same file has been translated with the same target language and options, a new session is created pointing to the **existing translated file** — no Kafka message, no external service call. The user gets instant results.

This saves both compute cost and user wait time for popular documents.

### 4.6 Idempotent Payment Callbacks

Payment callbacks from WeChat/Alipay can arrive multiple times (network retries, webhook replays). The system handles this with:

1. **Conditional DB update**: `UPDATE ... SET status = SUCCESS WHERE status = WAITING`. If the row was already `SUCCESS`, the update affects 0 rows and the callback is silently ignored.
2. **Distributed lock + double-check**: The payment notification system acquires a Redis lock, then re-reads `notifyTimes` from the DB. If another request already processed the notification, it skips execution.
3. **Audit log**: Every callback attempt is recorded in `PayNotifyLogDO` regardless of whether it was a duplicate.

This ensures **exactly-once benefit allocation** (points/membership) even under concurrent callbacks.

### 4.7 Profile-Based Deployment for Independent Scaling

The same codebase runs in two modes via Spring profiles:

- `api` profile: Activates controllers, interceptors, SSE emitters. Deployed behind K8s Ingress. Scales based on HTTP request load.
- `consumer` profile: Activates `@KafkaListener` beans (annotated with `@Profile("consumer")`). Deployed as a separate K8s workload. Scales based on Kafka partition count and consumer lag.

This means a spike in translation jobs doesn't affect API response times, and a burst of API traffic doesn't starve Kafka consumers. Each workload has its own Helm chart with independent replica counts and resource limits.

### 4.8 Domain-Organized Exception Hierarchy

The exception system maps cleanly from code to HTTP response:

- `BusinessException` base class carries an `IResultCode` (code + message).
- Domain subclasses (`UserException`, `PaymentException`, `FileException`) provide factory methods like `UserException.userNotFound()`.
- `GlobalExceptionHandler` maps error code ranges to HTTP statuses automatically: 1000-1999 → 401, 2000-3999 → 400, 5000-5999 → 402, 100-199 → 502.
- Business exceptions log at `WARN` (expected), system exceptions at `ERROR` (unexpected).

This gives every API response a consistent `R<T>` shape with a domain-specific error code, making client-side error handling predictable.

### 4.9 @CurrentUid Annotation for Clean Controller Signatures

A custom `@CurrentUid` annotation with a `HandlerMethodArgumentResolver` injects the authenticated user ID directly into controller method parameters. Controllers never need to manually extract the user from the request or JWT token:

```java
@PostMapping("/start-translate")
public R<FileStartTranslateResp> startTranslate(@CurrentUid String uid, @RequestBody FileStartTranslationReq req) {
    return R.data(fileTranslationService.startTranslate(uid, req));
}
```

This eliminates boilerplate across all 26 controllers and ensures consistent user extraction.

### 4.10 Health Check Before Processing

Before starting a translation task, the consumer calls `/health-check` on the Translation Service with a 2-second timeout. If unhealthy, it retries every 5 seconds (logging every 30 seconds to avoid spam). The task also checks for stop signals while waiting, so users can cancel even during the health-check wait. This prevents wasting points on tasks that would immediately fail due to a downstream outage.

### 4.11 ShedLock for Distributed Cron Jobs

All scheduled jobs use **ShedLock** with JDBC-backed locking to prevent duplicate execution across K8s pods. Lock timing is externalized to properties (`lockAtMostFor`, `lockAtLeastFor`), allowing tuning without code changes. The `pullLatestDocs` job is additionally gated by `AppEnv.PROD`, preventing accidental execution in dev/staging environments.

---

## 5. How to Improve

### 5.1 Resilience: Circuit Breakers + Bulkheads

Add **Resilience4j** to wrap all external service calls:

```
External Call → Circuit Breaker → Timeout → Retry → Bulkhead → Service
```

- **Circuit breaker**: Open after 5 consecutive failures, half-open after 30s. Prevents thread exhaustion when a dependency is down.
- **Bulkhead**: Limit concurrent calls per external service (e.g., 10 for LLM, 5 for PubMed). Isolates failures so a slow PubMed API doesn't consume all threads.
- **Fallback**: Return cached results or graceful degradation messages instead of 500 errors.

### 5.2 Database: Connection Pool + Read Replicas

- Increase HikariCP pool to **20-30** connections (rule of thumb: `connections = (2 * CPU cores) + disk spindles`).
- Add a **MySQL read replica** for query-heavy operations (admin dashboard, point balance checks, session listings) via Spring's `AbstractRoutingDataSource`.
- Add **Flyway** for versioned schema migrations.

### 5.3 Point System: Idempotency + Locking

- Add **optimistic locking** (version column) on `UserAvailablePointTab`. Every update checks `WHERE version = ?` and increments it.
- Make point operations **idempotent** using a deduplication key (e.g., `operationId + operationType`). If the same freeze/consume/rollback is called twice, the second call is a no-op.
- Alternatively, use **Redis distributed lock** per user ID for point mutations to serialize concurrent requests.

### 5.4 Observability: Metrics + Tracing + Alerting

```
Application → Micrometer → Prometheus → Grafana (dashboards + alerts)
           → OpenTelemetry → Jaeger (distributed tracing)
```

Key metrics to expose:

- HTTP request latency (p50, p95, p99) per endpoint
- Kafka consumer lag per topic/partition
- Thread pool utilization (active/queued/rejected)
- External service call latency and error rate (via Resilience4j metrics)
- SSE active connections count
- Point balance anomalies

### 5.5 SSE: Heartbeat + Cleanup + Scaling

- **Heartbeat**: Send a `:ping` comment every 15 seconds to detect dead connections early.
- **Periodic cleanup**: Schedule a task every 60 seconds to evict emitters older than their expected TTL.
- **Reduce timeout**: 50 minutes is too long. Use 5-minute timeout with client-side auto-reconnect via `last_event_id`.
- **Scale-out**: Replace the in-memory emitter map with Redis Streams. Any API pod can serve any client, because events are distributed through Redis rather than held in local memory.

### 5.6 Kafka: Dead Letter Queue + Monitoring

- Add a **Dead Letter Topic (DLT)** for messages that fail after N retries. Currently, failed messages are silently dropped or retried indefinitely.
- Add **Kafka consumer lag monitoring** via Micrometer's Kafka metrics. Alert when lag exceeds a threshold (e.g., 100 messages or 5 minutes).
- Implement **backpressure**: Instead of polling Redis every 2 seconds for concurrency slots, use a semaphore-based approach within the consumer or partition assignment strategy.

### 5.7 Caching: Multi-Level + Invalidation

- Add **local cache (Caffeine)** as L1 in front of Redis (L2) for hot read paths like point balance lookups, user profiles, and product catalogs. This reduces Redis RTTs significantly.
- Define explicit **TTLs** for all `@Cacheable` entries (currently using default Redis TTL).
- Add **cache invalidation** on writes — currently caches are set-and-forget with no explicit invalidation strategy.

### 5.8 Service Decomposition (Long-term)

If the system continues to grow, consider extracting:

- **Point Service** → standalone microservice with its own DB (it already has a clear API boundary and handles financial data that needs strict consistency).
- **File Translation Orchestrator** → separate service that owns the Kafka consumer, translation state machine, and external service integration.
- **Notification Service** → centralize WeChat notifications, email, and SSE push into one service.

This reduces blast radius: a bug in file translation won't affect point operations or payment callbacks.

---

## 6. Summary

> Suppr is an AI research platform with a Spring Boot backend split into API and Consumer profiles, deployed on Kubernetes. It uses Kafka for async processing of long-running AI tasks (translation, research), SSE + Redis pub/sub for real-time progress streaming, and a three-stage point system (freeze → consume → rollback) for billing reliability. The main architectural gaps are: undersized connection pools, missing circuit breakers on 6+ external dependencies, no distributed tracing, and race conditions in the point system. Key improvements would be adding Resilience4j for fault isolation, increasing the DB pool, adding optimistic locking for points, and implementing observability with Micrometer + OpenTelemetry.
