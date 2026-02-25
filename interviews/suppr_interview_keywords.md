# Interview Checklist — Suppr Tech Stack Quick Review

## 1. Core Framework

- [ ] **Spring Boot 3.5.3** — Auto-configuration, dependency injection, profile-based deployment
- [ ] **Java 21** — Virtual threads, record classes, pattern matching, sealed classes
- [ ] **Undertow** — Non-blocking IO, 64 worker threads, replaces Tomcat for async/streaming workloads
- [ ] **MyBatis** — SQL mapper, XML-based result maps, camelCase ↔ snake_case auto-mapping
- [ ] **Lombok** — `@Builder`, `@Getter`, `@Slf4j`, reduces boilerplate

## 2. Databases

- [ ] **MySQL + HikariCP** — Connection pooling, leak detection, validation query, max-lifetime
- [ ] **MongoDB** — Document storage, `MongoRepository`, aggregation pipelines, `$set` partial updates
- [ ] **Redis (Lettuce)** — RESP2 protocol, `StringRedisTemplate`, pub/sub, distributed counters, TTL-based expiry

## 3. Message Queue

- [ ] **Kafka** — Topics, partitions, consumer groups, manual ACK (`enable-auto-commit: false`)
- [ ] **At-least-once delivery** — Manual `acknowledgment.acknowledge()` only after success
- [ ] **Long-poll interval** — 12-hour `max.poll.interval.ms` for long-running translation tasks
- [ ] **Consumer concurrency** — `concurrency-per-node` config, one listener per partition

## 4. Real-Time Streaming

- [ ] **SSE (Server-Sent Events)** — `SseEmitter`, `text/event-stream`, 50-min timeout
- [ ] **Redis pub/sub relay** — Consumer publishes events → Redis channel → API pod → SSE client
- [ ] **Client reconnection** — `last_event_id` header, `ConcurrentHashMap<drid, Map<clientId, emitter>>`
- [ ] **Reactive streams** — `Flux<ServerSentEvent<String>>` from WebClient for upstream SSE consumption

## 5. Async Processing

- [ ] **`@Async` + Virtual threads** — `newVirtualThreadPerTaskExecutor()`, fire-and-forget tasks
- [ ] **Custom thread pools** — `fileTranslationExecutor` (core=30, max=50), `AbortPolicy` vs `CallerRunsPolicy`
- [ ] **`CompletableFuture`** — Non-blocking composition, `.runAsync()`, `.completeExceptionally()`
- [ ] **`TransactionSynchronizationManager`** — Defer side effects (Kafka send) until after DB commit

## 6. Authentication & Security

- [ ] **JWT (JJWT)** — HS256 symmetric signing, `X-Auth-Token` header, 30-day expiry, auto-refresh < 12h
- [ ] **Separate admin JWT** — Different signing key, `X-Admin-Auth-Token`, WeChat QR login
- [ ] **API key auth** — Hash-based storage, scope-based access control (`FILE_TRANSLATION`, `DOC_SEARCH`)
- [ ] **`@CurrentUid`** — Custom annotation + `HandlerMethodArgumentResolver` for user ID injection
- [ ] **Rate limiting** — `@RateLimit` annotation, Redis-backed token bucket, per-IP and per-endpoint

## 7. Payment

- [ ] **WeChat Pay / Alipay** — Order creation → payment URL → async callback → benefit allocation
- [ ] **Idempotent callbacks** — Conditional update `WHERE status = WAITING`, distributed lock + double-check
- [ ] **Refund flow** — Reverse callback → withdraw benefits FIFO (newest points first)

## 8. Points / Credits System

- [ ] **Three-stage lifecycle** — Award → Freeze → Consume / Rollback → Expire
- [ ] **Freeze pattern** — Reserve before async task, prevents overselling
- [ ] **FIFO consumption** — Points expiring soonest are consumed first
- [ ] **Rollback** — Restore to original pools on failure, reversal record with `uprid` chain
- [ ] **Expiration** — Hourly cron, soft delete, ShedLock distributed lock

## 9. File Storage

- [ ] **MinIO (S3-compatible)** — Private + public buckets, pre-signed URLs (24h validity), 2GB max
- [ ] **Gotenberg** — LibreOffice/Chromium-based PDF conversion, dual-file concatenation (source + target)
- [ ] **Apache POI / PDFBox / Tika** — Office document parsing, PDF processing, MIME type detection

## 10. External Service Integration

- [ ] **Spring `@HttpExchange`** — Declarative HTTP clients (newer than Feign), interface-based
- [ ] **WebClient (WebFlux)** — Non-blocking HTTP, SSE consumption, configurable buffer size (50MB)
- [ ] **Retry** — `RetryTemplate` (3 attempts, 1s fixed backoff), `@Retryable` on specific methods
- [ ] **Health check** — Pre-emptive `/health-check` call before starting translation, 2s timeout, 5s retry
- [ ] **Fallback download chain** — Remote service → SOCKS5/HTTP proxy → direct download
- [ ] **User-agent rotation** — 6 browser user-agents for external file downloads

## 11. Distributed Coordination

- [ ] **ShedLock** — JDBC-backed distributed lock for cron jobs, `lockAtMostFor` / `lockAtLeastFor`
- [ ] **Redis distributed lock** — Payment notification dedup, `notifyLockCoreRedisDAO.lock()`
- [ ] **Redis atomic counters** — `INCR` / `DECR` for active task counting, 24h TTL leak prevention
- [ ] **Redis stop signals** — `file_translation:stop:{sessionId}` key as cancellation flag

## 12. Exception Handling

- [ ] **Exception hierarchy** — `BusinessException` → `UserException`, `PaymentException`, `FileException`
- [ ] **`ResultCode` enum** — Domain-organized error codes (0-999 system, 1000-1999 auth, 2000-2999 user, ...)
- [ ] **`GlobalExceptionHandler`** — Auto HTTP status mapping by code range (401, 400, 402, 502)
- [ ] **`R<T>` response wrapper** — `{ code, data, msg }`, factory methods `R.data()`, `R.fail()`

## 13. Caching

- [ ] **Spring `@Cacheable`** — Redis-backed, JSON serialization via Jackson
- [ ] **Cache targets** — PubMed ID conversion, search pages, pre-translation metadata
- [ ] **File dedup** — `FilePreTranslateInfoTab` caches analysis results by fileId/fileUrl
- [ ] **Translation dedup** — Reuse translated files by articleUrl + targetLang + options

## 14. Deployment & Infrastructure

- [ ] **Docker multi-stage build** — Maven build stage → JRE runtime (eclipse-temurin:21-jre)
- [ ] **JVM tuning** — G1GC, 75% RAM, compressed OOPs, transparent huge pages
- [ ] **Kubernetes** — Separate Helm charts for API and Consumer workloads
- [ ] **Profile activation** — `SPRING_PROFILES_ACTIVE=api` or `=consumer` via env var
- [ ] **Graceful shutdown** — 10s grace for API, 30s for Consumer (long-running tasks)

## 15. Patterns to Talk About in Interview

| Pattern              | Where It's Used            | One-Liner                                                          |
| -------------------- | -------------------------- | ------------------------------------------------------------------ |
| Reservation pattern  | Point freeze/consume       | Reserve before async work, consume on success, rollback on failure |
| Deferred side effect | TransactionSynchronization | Send Kafka message only after DB commit                            |
| Manual ACK           | Kafka consumers            | No message loss — ACK only after processing                        |
| Idempotent webhook   | Payment callbacks          | Conditional update + distributed lock prevents double processing   |
| Profile-based split  | API vs Consumer            | Same code, independent scaling and failure isolation               |
| Pub/sub relay        | SSE streaming              | Consumer → Redis → API pod → client, decouples producer from SSE   |
| Concurrency limiter  | Redis counters             | Per-user task limits with graceful queuing                         |
| Cancellation flag    | Redis stop signal          | Cooperative cancellation checked at multiple lifecycle points      |
| Health gate          | Translation consumer       | Don't start work if downstream is unhealthy                        |
| Deduplication        | File translation           | Cache analysis results + reuse translated files across users       |

## 16. Known Weaknesses (Be Ready to Discuss)

- [ ] **Connection pool undersized** — HikariCP max=2, should be 20-30
- [ ] **No circuit breakers** — 6+ external deps with no Resilience4j, cascading failure risk
- [ ] **No distributed tracing** — Missing Micrometer/OpenTelemetry, hard to debug async flows
- [ ] **Point race conditions** — No optimistic/pessimistic locking, concurrent mutations possible
- [ ] **SSE memory leak** — No periodic cleanup of stale emitters
- [ ] **No dead letter queue** — Failed Kafka messages silently dropped
- [ ] **No DB migration tool** — No Flyway/Liquibase, manual schema changes

## 17. Improvement Keywords (Show You Know the Fix)

| Problem               | Solution Keywords                                                                        |
| --------------------- | ---------------------------------------------------------------------------------------- |
| Cascading failures    | **Resilience4j**, circuit breaker, bulkhead, fallback, half-open state                   |
| Connection starvation | **HikariCP tuning**, read replica, `AbstractRoutingDataSource`                           |
| Point race conditions | **Optimistic locking** (version column), `SELECT ... FOR UPDATE`, Redis distributed lock |
| No observability      | **Micrometer** → Prometheus → Grafana, **OpenTelemetry** → Jaeger                        |
| SSE scaling           | **Redis Streams**, heartbeat ping, periodic emitter cleanup, shorter timeout             |
| Kafka reliability     | **Dead Letter Topic**, consumer lag monitoring, semaphore-based backpressure             |
| Cache misses          | **Caffeine L1** + Redis L2, explicit TTL, write-through invalidation                     |
| Monolith growth       | **Service decomposition** — extract Point Service, Translation Orchestrator              |
