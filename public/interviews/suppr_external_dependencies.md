# External Dependencies — Deep Dive for Interviews & Real-Life Debugging

> Companion to `suppr_interview_keywords.md`. Focuses on **MySQL**, **S3 (MinIO)**, **Kafka**, **MongoDB**, **Redis**, and other infrastructure dependencies used in the Suppr platform.

---

## 1. MySQL (via HikariCP)

### Architecture in Suppr

- Primary relational store for users, orders, payments, point ledgers, file metadata
- HikariCP connection pool (currently max=2, should be 20–30)
- MyBatis SQL mapper with XML result maps
- No migration tool (Flyway/Liquibase missing — known weakness)

### Top Interview Questions

#### Q1: How does HikariCP manage connections, and why is pool sizing critical?

HikariCP maintains a fixed-size pool of reusable JDBC connections. Key parameters:

| Parameter                | Purpose                                 | Suppr Value | Recommended                       |
| ------------------------ | --------------------------------------- | ----------- | --------------------------------- |
| `maximumPoolSize`        | Max concurrent connections              | 2           | 20–30                             |
| `minimumIdle`            | Idle connections kept warm              | —           | Same as max                       |
| `maxLifetime`            | Connection recycled after this          | 30min       | 25–28min (< MySQL `wait_timeout`) |
| `connectionTimeout`      | How long to wait for a connection       | 30s         | 5–10s                             |
| `leakDetectionThreshold` | Log warning if connection held too long | 0 (off)     | 60s                               |

**Why pool=2 is dangerous**: With 2 connections, a single slow query blocks all other requests. Under load, threads queue up waiting for a connection, causing cascading timeouts.

**Formula**: `pool_size = Tn × (Cm − 1) + 1` where Tn = max concurrent threads, Cm = max simultaneous connections per thread. A simpler rule of thumb: `connections = (2 × CPU cores) + effective_spindle_count`.

#### Q2: Explain MySQL index types and when each is used.

| Index Type       | Use Case                                | Example                                                                   |
| ---------------- | --------------------------------------- | ------------------------------------------------------------------------- |
| B+Tree (default) | Range queries, sorting, prefix matching | `WHERE created_at > '2024-01-01'`                                         |
| Hash             | Exact match only (Memory engine)        | `WHERE api_key = 'abc123'`                                                |
| Composite        | Multi-column filtering                  | `INDEX(user_id, status, created_at)`                                      |
| Covering         | Query answered entirely from index      | `SELECT status FROM orders WHERE user_id=1` with `INDEX(user_id, status)` |
| Prefix           | Long text columns                       | `INDEX(email(20))`                                                        |

**Leftmost prefix rule**: Composite index `(A, B, C)` serves queries on `(A)`, `(A, B)`, `(A, B, C)` but NOT `(B, C)` alone.

#### Q3: How do you diagnose and fix slow queries?

**Step-by-step debugging**:

```sql
-- 1. Enable slow query log
SET GLOBAL slow_query_log = 'ON';
SET GLOBAL long_query_time = 1;  -- queries > 1s

-- 2. Analyze with EXPLAIN
EXPLAIN ANALYZE SELECT * FROM point_records
WHERE user_id = 123 AND status = 'ACTIVE'
ORDER BY expire_at ASC;

-- Look for:
--   type: ALL (full table scan — bad)
--   type: ref / range / const (good)
--   Extra: Using filesort (bad for large results)
--   Extra: Using index (covering index — good)

-- 3. Check index usage
SHOW INDEX FROM point_records;

-- 4. Add missing index
ALTER TABLE point_records ADD INDEX idx_user_status_expire (user_id, status, expire_at);
```

#### Q4: How does InnoDB handle transactions and what isolation levels matter?

| Isolation Level                     | Dirty Read | Non-Repeatable Read | Phantom Read | Performance |
| ----------------------------------- | ---------- | ------------------- | ------------ | ----------- |
| READ UNCOMMITTED                    | Yes        | Yes                 | Yes          | Fastest     |
| READ COMMITTED                      | No         | Yes                 | Yes          | Fast        |
| **REPEATABLE READ** (MySQL default) | No         | No                  | Possible\*   | Good        |
| SERIALIZABLE                        | No         | No                  | No           | Slowest     |

\*InnoDB uses **gap locking** to mostly prevent phantom reads even at REPEATABLE READ.

**Suppr relevance**: Point freeze/consume pattern relies on transaction isolation. Without `SELECT ... FOR UPDATE` (pessimistic) or version column (optimistic), concurrent mutations can cause double-spending.

#### Q5: How do deadlocks happen and how do you resolve them?

**Common deadlock pattern**:

```
Transaction A: UPDATE points SET amount=90 WHERE id=1  -- locks row 1
Transaction B: UPDATE points SET amount=80 WHERE id=2  -- locks row 2
Transaction A: UPDATE points SET amount=70 WHERE id=2  -- waits for row 2 (held by B)
Transaction B: UPDATE points SET amount=60 WHERE id=1  -- waits for row 1 (held by A) → DEADLOCK
```

**Solutions**:

1. **Consistent lock ordering** — Always lock rows in the same order (e.g., ascending ID)
2. **Shorter transactions** — Minimize time between lock acquisition and commit
3. **Retry logic** — Catch `DeadlockLoserDataAccessException`, retry 2–3 times
4. **Use `SHOW ENGINE INNODB STATUS`** to inspect latest deadlock details

### Real-Life Debugging Scenarios

#### Scenario 1: Connection pool exhaustion

**Symptom**: `HikariPool-1 - Connection is not available, request timed out after 30000ms`

**Root cause checklist**:

1. Pool too small (Suppr: max=2)
2. Long-running queries holding connections
3. Missing `@Transactional` timeout — transaction never closes
4. Connection leak — code path doesn't return connection to pool

**Fix**:

```yaml
spring:
  datasource:
    hikari:
      maximum-pool-size: 20
      leak-detection-threshold: 60000 # warn after 60s
      connection-timeout: 5000
```

#### Scenario 2: Replication lag causing stale reads

**Symptom**: User creates an order but immediately sees "no orders found"

**Root cause**: Write goes to primary, read hits replica with lag

**Fix**: Use `@Transactional(readOnly = false)` or `AbstractRoutingDataSource` to force reads to primary after writes within the same business flow.

#### Scenario 3: Table lock during ALTER TABLE

**Symptom**: All queries to `point_records` hang during deployment

**Root cause**: `ALTER TABLE` on large table acquires metadata lock

**Fix**: Use `pt-online-schema-change` (Percona) or MySQL 8.0+ instant DDL:

```sql
ALTER TABLE point_records ADD COLUMN memo VARCHAR(255), ALGORITHM=INSTANT;
```

---

## 2. S3 / MinIO (Object Storage)

### Architecture in Suppr

- MinIO (S3-compatible) with private + public buckets
- Pre-signed URLs for secure temporary access (24h validity)
- 2GB max file size
- Stores uploaded documents, translated PDFs, generated files

### Top Interview Questions

#### Q1: How do pre-signed URLs work and why use them?

**Flow**:

```
Client → API Server: "I want to upload/download file X"
API Server → MinIO: GeneratePresignedUrl(bucket, key, expiry=24h, method=PUT/GET)
API Server → Client: Returns pre-signed URL
Client → MinIO: Direct upload/download (bypasses API server)
```

**Benefits**:

- API server doesn't proxy large files — reduces bandwidth and memory pressure
- Fine-grained access control without exposing credentials
- Time-limited — URL expires after configured duration
- Method-specific — PUT URL can't be used for GET

**Security considerations**:

- Never set expiry > 7 days (S3 hard limit)
- Use separate URLs for upload vs download
- Validate file type/size on the server side after upload via S3 event notification

#### Q2: How do you handle multipart uploads for large files?

```
1. InitiateMultipartUpload → get uploadId
2. Upload parts (5MB–5GB each) in parallel → get ETag per part
3. CompleteMultipartUpload(uploadId, part list) → assembles final object
```

**Why it matters**:

- Retryable — failed parts don't restart entire upload
- Parallelizable — multiple parts upload concurrently
- Required for files > 5GB

**Cleanup pitfall**: Incomplete multipart uploads consume storage. Configure lifecycle rule:

```xml
<AbortIncompleteMultipartUpload>
  <DaysAfterInitiation>7</DaysAfterInitiation>
</AbortIncompleteMultipartUpload>
```

#### Q3: How does S3 consistency model work?

As of December 2020, S3 provides **strong read-after-write consistency** for all operations:

- PUT new object → immediately readable
- PUT overwrite → immediately returns new version
- DELETE → immediately reflected

MinIO also provides strong consistency since it's built on top of erasure coding.

**Pre-2020 gotcha** (still asked in interviews): Previously, S3 had eventual consistency for overwrites and deletes. Interviewers may test if you know the current model.

#### Q4: Private vs public bucket — when to use each?

| Aspect   | Private Bucket                             | Public Bucket                   |
| -------- | ------------------------------------------ | ------------------------------- |
| Access   | Pre-signed URLs only                       | Direct URL                      |
| Use case | User uploads, translated docs              | Static assets, shared templates |
| Security | Time-limited, per-object                   | Open read, write-protected      |
| CDN      | Pre-signed URL + CloudFront signed cookies | CloudFront direct               |

### Real-Life Debugging Scenarios

#### Scenario 1: Pre-signed URL returns 403 Forbidden

**Checklist**:

1. URL expired (check `X-Amz-Expires` parameter)
2. Clock skew > 15 minutes between server and S3 (use NTP)
3. Bucket policy denies access despite valid signature
4. Wrong region in endpoint URL
5. Object key contains special characters not properly URL-encoded

#### Scenario 2: Upload succeeds but download returns corrupted file

**Root cause checklist**:

1. Missing `Content-Type` header during upload — browser can't interpret
2. Middleware/proxy truncated the response (check `Content-Length` header)
3. Multipart upload — parts assembled in wrong order
4. Client used gzip encoding but S3 returned raw bytes

**Fix**: Always set `Content-Type` and `Content-Disposition` during upload:

```java
PutObjectArgs.builder()
    .bucket("private")
    .object(key)
    .contentType("application/pdf")
    .headers(Map.of("Content-Disposition", "attachment; filename=\"report.pdf\""))
    .stream(inputStream, size, -1)
    .build();
```

#### Scenario 3: MinIO disk full — all uploads fail

**Symptom**: `XMinioStorageFull: Storage backend has reached its minimum free drive threshold`

**Immediate fix**: Clear incomplete multipart uploads and expired objects:

```bash
mc rm --recursive --force --incomplete myminio/private
mc ilm rule list myminio/private  # check lifecycle rules
```

---

## 3. Kafka (Message Queue)

### Architecture in Suppr

- Decouples API servers from long-running translation consumers
- Manual ACK (`enable-auto-commit: false`) — at-least-once delivery
- 12-hour `max.poll.interval.ms` for long translation tasks
- Consumer concurrency configured per node
- **Known weakness**: No dead letter queue — failed messages silently dropped

### Top Interview Questions

#### Q1: Explain Kafka's architecture — brokers, topics, partitions, consumer groups.

```
Producer → Topic (logical channel)
              ├── Partition 0 → [msg0, msg3, msg6, ...]
              ├── Partition 1 → [msg1, msg4, msg7, ...]
              └── Partition 2 → [msg2, msg5, msg8, ...]

Consumer Group "translation-workers":
  Consumer A ← Partition 0
  Consumer B ← Partition 1, Partition 2
```

**Key rules**:

- Each partition is consumed by exactly ONE consumer in a group
- Adding consumers > partitions = idle consumers
- Messages within a partition are strictly ordered
- Cross-partition ordering is NOT guaranteed

#### Q2: What's the difference between at-most-once, at-least-once, and exactly-once?

| Guarantee                 | How                                                | Trade-off               |
| ------------------------- | -------------------------------------------------- | ----------------------- |
| At-most-once              | Auto-commit offset before processing               | Fast, may lose messages |
| **At-least-once** (Suppr) | Commit offset after successful processing          | Safe, may duplicate     |
| Exactly-once              | Transactional producer + consumer `read_committed` | Slowest, most complex   |

**Suppr approach**: Manual ACK after processing + idempotent consumers. If a translation task fails mid-way, the message is redelivered and the consumer checks if work was already done (via DB status check).

#### Q3: How do you handle consumer lag and slow consumers?

**Monitoring**:

```bash
kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --describe --group translation-workers
# Shows: CURRENT-OFFSET, LOG-END-OFFSET, LAG per partition
```

**Solutions for high lag**:

1. **Scale horizontally** — Add consumers (up to partition count)
2. **Increase partitions** — Allows more parallel consumers
3. **Optimize processing** — Profile the consumer's bottleneck
4. **Backpressure** — Semaphore-based concurrency limiter per consumer
5. **Separate fast/slow topics** — Route quick tasks and heavy tasks to different topics

#### Q4: What happens during consumer group rebalancing?

**Triggers**: Consumer joins/leaves group, new partition added, consumer heartbeat timeout

**Stop-the-world rebalancing** (default):

1. All consumers stop fetching
2. Group coordinator revokes all partitions
3. Reassigns partitions using configured strategy
4. Consumers resume — processing paused during rebalance

**Solutions**:

- **Cooperative sticky assignor** — Incremental rebalancing, only moves affected partitions
- **Static group membership** — `group.instance.id` prevents rebalance on transient disconnects
- Tune `session.timeout.ms` (default 45s) and `heartbeat.interval.ms` (default 3s)

#### Q5: How do you implement a Dead Letter Queue (DLQ)?

```java
@KafkaListener(topics = "file-translation")
public void consume(ConsumerRecord<String, String> record, Acknowledgment ack) {
    try {
        processTranslation(record.value());
        ack.acknowledge();
    } catch (RetryableException e) {
        // Don't ack — message will be redelivered
        throw e;
    } catch (NonRetryableException e) {
        // Send to DLQ, then ack original
        kafkaTemplate.send("file-translation.DLT", record.key(), record.value());
        ack.acknowledge();
        log.error("Sent to DLQ: key={}", record.key(), e);
    }
}
```

**Spring Kafka built-in**: Use `DefaultErrorHandler` with `DeadLetterPublishingRecoverer` for automatic DLQ routing after N retries.

#### Q6: How does Kafka guarantee ordering, and when does it break?

**Ordering guaranteed within a single partition**. Breaks when:

1. Producer retries with `max.in.flight.requests.per.connection > 1` (out-of-order delivery)
2. Messages for same entity sent to different partitions (missing/wrong partition key)
3. Consumer processes messages from multiple partitions in parallel

**Suppr fix**: Use `userId` or `sessionId` as partition key so all messages for one user go to the same partition.

### Real-Life Debugging Scenarios

#### Scenario 1: Consumer stops processing, no errors in log

**Symptom**: Consumer is alive but no messages consumed, lag keeps growing

**Checklist**:

1. `max.poll.interval.ms` exceeded — consumer kicked from group silently
2. Consumer stuck in long processing (Suppr: 12h timeout helps but verify)
3. Rebalancing loop — consumer keeps joining and leaving
4. All partitions assigned to a different consumer instance

**Debug**:

```bash
kafka-consumer-groups.sh --describe --group translation-workers
# Check: Is this consumer listed? Does it have assigned partitions?
```

#### Scenario 2: Duplicate message processing

**Symptom**: Same file translated twice, user charged double points

**Root cause**: At-least-once delivery + non-idempotent consumer

**Fix**:

```java
// Idempotent consumer pattern
public void processTranslation(TranslationMessage msg) {
    int updated = db.update(
        "UPDATE translation_tasks SET status='PROCESSING' WHERE id=? AND status='PENDING'",
        msg.getTaskId()
    );
    if (updated == 0) {
        log.info("Task already processed or in progress: {}", msg.getTaskId());
        return;  // skip duplicate
    }
    // ... proceed with translation
}
```

#### Scenario 3: Producer sends succeed but consumer never receives

**Checklist**:

1. Topic name mismatch (typo, case sensitivity)
2. Consumer subscribed to wrong topic
3. Message serialization error on consumer side (check `value.deserializer`)
4. Consumer group already committed past offset — new messages from before the offset won't be seen
5. `auto.offset.reset=latest` and consumer started after producer sent messages

#### Scenario 4: Kafka broker OOM / disk full

**Symptom**: `NotEnoughReplicasException` or broker crashes

**Immediate actions**:

1. Check disk: `kafka-log-dirs.sh --describe` — find largest topics
2. Reduce retention: `kafka-configs.sh --alter --topic big-topic --add-config retention.ms=86400000`
3. Delete old segments: `kafka-delete-records.sh`
4. Add brokers and rebalance partitions

---

## 4. MongoDB (Document Store)

### Architecture in Suppr

- Stores document content, search indexes, translation records
- `MongoRepository` for basic CRUD
- Aggregation pipelines for complex queries
- `$set` for partial updates (avoids full document replacement)

### Top Interview Questions

#### Q1: When should you use MongoDB vs MySQL?

| Criteria     | MongoDB                         | MySQL                        |
| ------------ | ------------------------------- | ---------------------------- |
| Schema       | Flexible, evolving              | Strict, relational           |
| Queries      | Document-oriented, nested       | SQL joins, complex relations |
| Transactions | Multi-doc ACID (4.0+)           | Full ACID                    |
| Scaling      | Horizontal (sharding)           | Vertical (read replicas)     |
| Best for     | Content, logs, catalogs, search | Orders, payments, ledgers    |

**Suppr choice**: MySQL for transactional data (payments, points), MongoDB for document content and search indexes — correct separation of concerns.

#### Q2: How do you design MongoDB schemas — embedding vs referencing?

**Embed when**:

- Data is always accessed together (1:1 or 1:few)
- Child data doesn't make sense without parent
- Example: Translation task with its sentence-level results

**Reference when**:

- Data is accessed independently
- Many-to-many relationships
- Child documents are large or frequently updated
- Example: User ↔ Translation tasks (reference user by `userId`)

**Anti-pattern**: Unbounded arrays. Never embed an ever-growing list:

```javascript
// BAD: Array grows forever
{ userId: 1, translations: [{...}, {...}, /* thousands */] }

// GOOD: Separate collection with reference
{ userId: 1, taskId: "abc", result: {...} }
```

#### Q3: How do MongoDB indexes work and what types are there?

| Index Type   | Use Case               | Example                                           |
| ------------ | ---------------------- | ------------------------------------------------- |
| Single field | Basic lookups          | `{ userId: 1 }`                                   |
| Compound     | Multi-field queries    | `{ userId: 1, createdAt: -1 }`                    |
| Text         | Full-text search       | `{ content: "text" }`                             |
| TTL          | Auto-expire documents  | `{ createdAt: 1 }, { expireAfterSeconds: 86400 }` |
| Hashed       | Shard key distribution | `{ userId: "hashed" }`                            |
| Wildcard     | Dynamic schema fields  | `{ "metadata.$**": 1 }`                           |

**Important**: MongoDB uses only ONE index per query (except `$or` which can use index per clause). Use `explain()` to verify.

#### Q4: Explain the aggregation pipeline.

```javascript
db.translations.aggregate([
  { $match: { userId: ObjectId('...'), status: 'COMPLETED' } }, // filter early
  {
    $lookup: {
      // join
      from: 'users',
      localField: 'userId',
      foreignField: '_id',
      as: 'user',
    },
  },
  { $unwind: '$user' }, // flatten array
  {
    $group: {
      // aggregate
      _id: '$user.plan',
      totalPages: { $sum: '$pageCount' },
      avgDuration: { $avg: '$durationMs' },
    },
  },
  { $sort: { totalPages: -1 } }, // sort
]);
```

**Performance rules**:

1. `$match` and `$sort` first — uses indexes
2. `$project` early to reduce document size in pipeline
3. `$lookup` is expensive — equivalent to SQL JOIN
4. Pipeline stages are processed left to right, documents flow one-by-one

### Real-Life Debugging Scenarios

#### Scenario 1: Slow aggregation query

**Symptom**: Aggregation takes 30s+, high CPU

**Debug**:

```javascript
db.translations.aggregate([...]).explain("executionStats")
// Check: "stage": "COLLSCAN" means no index hit
```

**Fixes**:

1. Add index matching `$match` + `$sort` fields
2. Move `$match` to first stage
3. Add `$project` to drop unneeded fields
4. Consider `allowDiskUse: true` for large sorts (but fix root cause)

#### Scenario 2: Write conflicts with concurrent updates

**Symptom**: `WriteConflict` errors under load

**Root cause**: Two threads updating the same document simultaneously

**Fix**: Use atomic operators instead of read-modify-write:

```javascript
// BAD: Read-modify-write (race condition)
doc = db.tasks.findOne({ _id: taskId });
doc.retryCount += 1;
db.tasks.replaceOne({ _id: taskId }, doc);

// GOOD: Atomic update
db.tasks.updateOne(
  { _id: taskId },
  { $inc: { retryCount: 1 }, $set: { lastRetry: new Date() } }
);
```

#### Scenario 3: MongoDB eating all RAM

**Symptom**: Server OOM, MongoDB using 90%+ memory

**Explanation**: MongoDB's WiredTiger cache defaults to `(RAM - 1GB) / 2`. This is by design — the OS page cache handles the rest.

**Actual problems**:

1. Too many open connections (each uses ~1MB stack)
2. Large `sort()` without index — in-memory sort exceeds 100MB limit
3. Unbounded queries returning millions of documents

**Fix**:

```yaml
# mongod.conf
storage:
  wiredTiger:
    engineConfig:
      cacheSizeGB: 4 # explicit limit
net:
  maxIncomingConnections: 200
```

---

## 5. Redis (Cache + Coordination)

### Architecture in Suppr

- **Caching**: `@Cacheable` with JSON serialization (search results, pre-translation metadata)
- **Pub/Sub relay**: Consumer → Redis channel → API pod → SSE client
- **Distributed locks**: Payment dedup, ShedLock for cron jobs
- **Atomic counters**: `INCR`/`DECR` for active task counting (24h TTL)
- **Stop signals**: `file_translation:stop:{sessionId}` key as cancellation flag
- **Rate limiting**: Token bucket implementation

### Top Interview Questions

#### Q1: Explain Redis data structures and when to use each.

| Structure  | Commands                      | Use Case in Suppr                              |
| ---------- | ----------------------------- | ---------------------------------------------- |
| String     | `GET`, `SET`, `INCR`, `SETNX` | Counters, locks, stop signals, cache values    |
| Hash       | `HGET`, `HSET`, `HGETALL`     | Structured cache (user profiles, session data) |
| List       | `LPUSH`, `RPOP`, `LRANGE`     | Task queues (though Kafka is primary)          |
| Set        | `SADD`, `SISMEMBER`, `SINTER` | Unique collections, dedup sets                 |
| Sorted Set | `ZADD`, `ZRANGEBYSCORE`       | Leaderboards, rate limiting sliding windows    |
| Stream     | `XADD`, `XREADGROUP`          | Event sourcing, SSE improvement over pub/sub   |
| Pub/Sub    | `PUBLISH`, `SUBSCRIBE`        | Real-time SSE relay (current Suppr approach)   |

#### Q2: How do you implement a distributed lock in Redis?

**Simple lock (Suppr approach)**:

```java
// Acquire
Boolean acquired = redisTemplate.opsForValue()
    .setIfAbsent("lock:payment:" + orderId, instanceId, Duration.ofSeconds(30));

// Release (only if you own it — use Lua for atomicity)
String script = """
    if redis.call('get', KEYS[1]) == ARGV[1] then
        return redis.call('del', KEYS[1])
    else
        return 0
    end
    """;
redisTemplate.execute(new DefaultRedisScript<>(script, Long.class),
    List.of("lock:payment:" + orderId), instanceId);
```

**Why Lua script for release?** Without it, between GET and DEL another process could acquire the lock — and you'd delete their lock.

**Redlock (multi-node)**: Acquire lock on N/2+1 independent Redis nodes. Needed when a single Redis is not acceptable for safety. Controversial — see Martin Kleppmann vs Salvatore Sanfilippo debate.

#### Q3: Redis persistence — RDB vs AOF.

| Aspect         | RDB (Snapshotting)                  | AOF (Append-Only File)                  |
| -------------- | ----------------------------------- | --------------------------------------- |
| How            | Point-in-time snapshot via `fork()` | Log every write command                 |
| Data loss      | Up to last snapshot interval        | Up to last `fsync` (1s with `everysec`) |
| Recovery speed | Fast (load binary)                  | Slower (replay commands)                |
| Disk usage     | Compact                             | Grows, needs rewrite                    |
| CPU impact     | Spike during `BGSAVE`               | Steady with `everysec`                  |

**Best practice**: Use both. RDB for fast restarts, AOF for minimal data loss. In Suppr, if Redis is purely a cache (not source of truth), RDB alone is sufficient.

#### Q4: What happens when Redis runs out of memory?

Controlled by `maxmemory-policy`:

| Policy         | Behavior                      | When to Use                   |
| -------------- | ----------------------------- | ----------------------------- |
| `noeviction`   | Return error on writes        | Data must not be lost         |
| `allkeys-lru`  | Evict least recently used     | General cache                 |
| `volatile-lru` | Evict LRU among keys with TTL | Mix of cache + permanent data |
| `allkeys-lfu`  | Evict least frequently used   | Hot/cold access patterns      |
| `volatile-ttl` | Evict keys closest to expiry  | TTL-based cache               |

**Suppr recommendation**: `allkeys-lru` for cache workload, but ensure counters and locks have TTLs to prevent unbounded growth.

#### Q5: How does Redis pub/sub differ from Kafka, and what are its limitations?

| Aspect           | Redis Pub/Sub                      | Kafka                            |
| ---------------- | ---------------------------------- | -------------------------------- |
| Persistence      | None — fire-and-forget             | Persisted on disk                |
| Delivery         | At-most-once                       | At-least-once / exactly-once     |
| Consumer offline | Messages lost                      | Consumer catches up from offset  |
| Throughput       | Very high (~1M msg/s)              | High (~100K msg/s per partition) |
| Use case         | Real-time notifications, SSE relay | Durable event processing         |

**Suppr risk**: If an API pod restarts, all pub/sub messages during downtime are lost. SSE clients must reconnect and replay from `last_event_id`. Better alternative: **Redis Streams** (`XADD`/`XREADGROUP`) which persist messages and support consumer groups.

#### Q6: How does Redis-backed rate limiting work?

**Token bucket (Suppr's `@RateLimit`)**:

```lua
-- Lua script for atomic token bucket
local key = KEYS[1]
local max_tokens = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])  -- tokens per second
local now = tonumber(ARGV[3])

local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
local tokens = tonumber(bucket[1]) or max_tokens
local last_refill = tonumber(bucket[2]) or now

-- Refill tokens based on elapsed time
local elapsed = now - last_refill
tokens = math.min(max_tokens, tokens + elapsed * refill_rate)

if tokens >= 1 then
    tokens = tokens - 1
    redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
    redis.call('EXPIRE', key, max_tokens / refill_rate * 2)
    return 1  -- allowed
else
    redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
    redis.call('EXPIRE', key, max_tokens / refill_rate * 2)
    return 0  -- rejected
end
```

**Sliding window alternative**: Use sorted set with timestamp scores — `ZADD key <timestamp> <request_id>`, then `ZRANGEBYSCORE` to count requests in the window.

### Real-Life Debugging Scenarios

#### Scenario 1: Redis pub/sub messages not reaching SSE clients

**Symptom**: Consumer publishes translation progress but client SSE stream is silent

**Checklist**:

1. Channel name mismatch (check dynamic channel naming pattern)
2. API pod subscribed after message was published (race condition)
3. Redis connection dropped and Lettuce didn't auto-reconnect
4. `SseEmitter` already timed out (Suppr: 50-min timeout)

**Debug**:

```bash
redis-cli SUBSCRIBE "translation:progress:*"
# Manually verify messages are being published
redis-cli PUBSUB CHANNELS "translation:*"
# List active channels
```

#### Scenario 2: Redis counter leak — task count never reaches zero

**Symptom**: User sees "max concurrent tasks reached" but no tasks are running

**Root cause**: `INCR` executed but `DECR` skipped due to exception before reaching the decrement code

**Fix pattern**:

```java
try {
    redis.opsForValue().increment(counterKey);
    redis.expire(counterKey, Duration.ofHours(24));  // TTL leak prevention
    doTranslation();
} finally {
    redis.opsForValue().decrement(counterKey);  // ALWAYS decrement
}
```

**Additional safety**: Periodic reconciliation job that compares counter value with actual active tasks in DB.

#### Scenario 3: Cache stampede after TTL expiry

**Symptom**: Spike in DB queries every time a popular cache key expires

**Solutions**:

1. **Lock-based rebuild**: Only one thread rebuilds; others wait or return stale
2. **Probabilistic early expiry**: Randomly refresh before TTL hits
3. **Background refresh**: Separate thread refreshes cache before expiry
4. **Never-expire + async update**: Cache never expires; background job keeps it fresh

```java
// Lock-based rebuild
public SearchResult getSearchResults(String query) {
    String cached = redis.get("search:" + query);
    if (cached != null) return deserialize(cached);

    String lockKey = "lock:search:" + query;
    if (redis.setIfAbsent(lockKey, "1", Duration.ofSeconds(10))) {
        try {
            SearchResult result = db.search(query);
            redis.set("search:" + query, serialize(result), Duration.ofMinutes(30));
            return result;
        } finally {
            redis.delete(lockKey);
        }
    }
    // Another thread is rebuilding — wait briefly and retry, or return stale
    Thread.sleep(100);
    return getSearchResults(query);
}
```

#### Scenario 4: Hot key problem

**Symptom**: Single Redis node CPU at 100%, others idle

**Root cause**: One key (e.g., popular search result) receiving millions of reads

**Solutions**:

1. **Local cache (L1)**: Caffeine in-memory cache with short TTL (5–30s)
2. **Key replication**: Replicate hot key across `key:1`, `key:2`, ..., `key:N`, randomly read
3. **Read replicas**: Route reads to Redis replicas
4. **Redis Cluster**: Doesn't help for hot keys (single slot = single node)

---

## 6. Other External Dependencies

### Gotenberg (Document Conversion)

**What**: LibreOffice/Chromium-based PDF conversion service

**Interview Q**: How do you handle conversion failures?

- Timeout configuration (conversion can take minutes for large files)
- Health check before submitting jobs
- Retry with backoff for transient failures
- Fallback: Queue for manual processing if automated conversion fails

**Debugging**: Large files cause OOM in Gotenberg container. Set memory limits and max concurrent conversions.

### External Translation Services

**Interview Q**: How do you handle third-party API failures?

- **RetryTemplate**: 3 attempts, 1s fixed backoff
- **Health gate**: Check `/health-check` before starting work
- **Fallback chain**: Primary service → Proxy → Direct download
- **Circuit breaker** (recommended): Resilience4j to prevent hammering a down service

**Debugging**: User-agent rotation for downloads — some services block non-browser agents. Rotate through 6 browser user-agents.

### ShedLock (Distributed Cron)

**What**: JDBC-backed distributed lock ensuring cron jobs run on exactly one node

```java
@Scheduled(cron = "0 0 * * * *")  // every hour
@SchedulerLock(name = "expirePoints", lockAtMostFor = "50m", lockAtLeastFor = "5m")
public void expirePoints() {
    // Only one node executes this
}
```

**Debugging**: If cron never runs, check:

1. `shedlock` table exists with correct schema
2. Clock skew between nodes (> `lockAtLeastFor` causes missed executions)
3. Previous execution still holds lock (check `locked_until` column)

---

## 7. Cross-Cutting Concerns

### Dependency Failure Matrix

| Dependency Down | Impact                                     | Mitigation                                           |
| --------------- | ------------------------------------------ | ---------------------------------------------------- |
| MySQL           | Total outage — core data unavailable       | Read replica failover, connection pool retry         |
| Redis           | Cache miss storm, no locks, no SSE relay   | Caffeine L1 fallback, graceful degradation           |
| Kafka           | No async processing, translations queue up | In-memory queue fallback, retry on reconnect         |
| MongoDB         | Search/document features unavailable       | Cached results, feature flag to disable              |
| MinIO           | File upload/download fails                 | Pre-signed URL retry, fallback to local temp storage |
| Gotenberg       | PDF conversion fails                       | Queue for retry, notify user                         |

### Observability Checklist (What Suppr Needs)

```
┌─────────────┐     ┌────────────┐     ┌─────────┐
│ Application │────→│ Micrometer │────→│Prometheus│────→ Grafana dashboards
│  (metrics)  │     └────────────┘     └─────────┘
└─────────────┘
┌─────────────┐     ┌──────────────┐     ┌──────┐
│ Application │────→│OpenTelemetry │────→│Jaeger │────→ Distributed traces
│  (traces)   │     └──────────────┘     └──────┘
└─────────────┘
┌─────────────┐     ┌────────┐     ┌───────────────┐
│ Application │────→│Logback │────→│ELK / Loki     │────→ Centralized logs
│   (logs)    │     └────────┘     └───────────────┘
└─────────────┘
```

**Key metrics to track**:

- HikariCP: active connections, pending threads, connection wait time
- Redis: connected clients, memory usage, hit rate, command latency
- Kafka: consumer lag, produce rate, rebalance count
- MongoDB: active connections, slow queries, replication lag
- MinIO: request rate, error rate, disk usage

### Capacity Planning Rules of Thumb

| Resource                 | Sizing Guideline                                                       |
| ------------------------ | ---------------------------------------------------------------------- |
| MySQL connections        | `(2 × CPU) + spindle_count` per node, typically 20–30                  |
| Redis memory             | Data size × 2 (fragmentation) + 30% headroom                           |
| Kafka partitions         | Target throughput / per-partition throughput, minimum = consumer count |
| MongoDB WiredTiger cache | 50% of RAM (default), tune per workload                                |
| MinIO storage            | Current usage × growth rate × retention period + 30% buffer            |
