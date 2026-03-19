# Redis Deep Dive

Redis is the most popular in-memory data store, used as a cache, database, message broker, and more. It powers real-time features at Twitter, GitHub, Snapchat, and StackOverflow. As a backend engineer, Redis is likely in every system you build.

---

## Table of Contents

1. [Data Structures](#data-structures)
2. [Persistence](#persistence)
3. [Redis Cluster](#redis-cluster)
4. [Redis Sentinel](#redis-sentinel)
5. [Pub/Sub](#pubsub)
6. [Lua Scripting](#lua-scripting)
7. [Pipelining](#pipelining)
8. [Memory Optimization](#memory-optimization)
9. [Common Patterns](#common-patterns)
10. [Common Interview Questions](#common-interview-questions)

---

## Data Structures

Redis is not just a key-value store -- it supports rich data structures.

| Type | Commands | Use Case |
| ---- | -------- | -------- |
| **String** | GET, SET, INCR, DECR, MGET | Cache, counters, simple values |
| **Hash** | HGET, HSET, HGETALL, HINCRBY | Objects (user profiles, settings) |
| **List** | LPUSH, RPUSH, LPOP, RPOP, LRANGE | Queues, recent items, timelines |
| **Set** | SADD, SREM, SMEMBERS, SINTER, SUNION | Tags, unique visitors, set operations |
| **Sorted Set** | ZADD, ZRANGE, ZREVRANGE, ZRANK, ZSCORE | Leaderboards, priority queues, rate limiting |
| **Stream** | XADD, XREAD, XREADGROUP, XACK | Event streaming, message queues |
| **HyperLogLog** | PFADD, PFCOUNT, PFMERGE | Approximate unique counting (12 KB per counter) |
| **Bitmap** | SETBIT, GETBIT, BITCOUNT, BITOP | Feature flags, daily active users |
| **Geo** | GEOADD, GEODIST, GEORADIUS | Nearby search, location-based features |

### Sorted Set Examples

```redis
-- Leaderboard
ZADD leaderboard 1500 "alice"
ZADD leaderboard 2000 "bob"
ZADD leaderboard 1800 "carol"

ZREVRANGE leaderboard 0 2 WITHSCORES
-- 1) "bob" 2) "2000"  3) "carol" 4) "1800"  5) "alice" 6) "1500"

ZRANK leaderboard "carol"    -- 1 (0-indexed rank in ascending order)
ZREVRANK leaderboard "carol" -- 1 (rank in descending order)

-- Sliding window rate limiter
ZADD rate:user:123 <now_ms> <request_id>
ZREMRANGEBYSCORE rate:user:123 0 <now_ms - window_ms>
ZCARD rate:user:123
-- If count > limit -> reject
```

### HyperLogLog

```redis
-- Count unique visitors (approximate, 0.81% error, 12 KB per counter)
PFADD visitors:2024-01-15 "user-123"
PFADD visitors:2024-01-15 "user-456"
PFADD visitors:2024-01-15 "user-123"  -- duplicate, not counted

PFCOUNT visitors:2024-01-15  -- 2

-- Merge multiple days
PFMERGE visitors:week visitors:2024-01-15 visitors:2024-01-16 visitors:2024-01-17
PFCOUNT visitors:week  -- unique across all three days
```

---

## Persistence

### RDB (Snapshots)

```
Point-in-time snapshot written to disk periodically.

redis.conf:
  save 900 1      -- snapshot if 1+ key changed in 900 seconds
  save 300 10     -- snapshot if 10+ keys changed in 300 seconds
  save 60 10000   -- snapshot if 10000+ keys changed in 60 seconds
```

| Pros | Cons |
| ---- | ---- |
| Compact single file (good for backups) | Data loss between snapshots |
| Fast restart (load single file) | Fork can be slow on large datasets |
| Good for disaster recovery | Not suitable for minimal data loss |

### AOF (Append-Only File)

```
Logs every write operation. On restart, replays the log.

appendfsync always     -- fsync every write (safest, slowest)
appendfsync everysec   -- fsync every second (good balance)
appendfsync no         -- OS decides when to flush (fastest, riskiest)
```

| Pros | Cons |
| ---- | ---- |
| Minimal data loss (1 second with everysec) | Larger file than RDB |
| Append-only (no corruption risk) | Slower restart (replay all operations) |
| AOF rewrite compacts the file | Slightly slower writes |

### Best Practice: RDB + AOF

Use both: AOF for durability (minimal data loss), RDB for fast backups and disaster recovery.

---

## Redis Cluster

Horizontally scaled Redis with automatic sharding across multiple nodes.

```
+--Cluster------------------------------------------+
| Slot range: 0-16383                                |
|                                                     |
| Node A: slots 0-5460        (+ replica A')         |
| Node B: slots 5461-10922    (+ replica B')         |
| Node C: slots 10923-16383   (+ replica C')         |
+-----------------------------------------------------+

Key "user:123" -> CRC16("user:123") % 16384 = slot 7231 -> Node B
```

### Key Properties

| Property | Details |
| -------- | ------- |
| **Sharding** | 16,384 hash slots distributed across nodes |
| **Replication** | Each master has 1+ replicas for failover |
| **Failover** | Automatic (replica promoted if master fails) |
| **Multi-key ops** | Only if all keys in same slot (use hash tags: `{user}:123`) |
| **Min nodes** | 3 masters + 3 replicas = 6 nodes |

### Hash Tags

```redis
-- Force keys to same slot
SET {user:123}:profile "..."
SET {user:123}:settings "..."
-- Both map to slot for "user:123" -> same node
-- Now you can use MGET, transactions across these keys
```

### Resharding

```
Adding a node:
  1. Add Node D to cluster
  2. Migrate slots from A, B, C to D (online, no downtime)
  3. Clients automatically redirect (MOVED/ASK responses)
```

---

## Redis Sentinel

High availability for non-clustered Redis (single master + replicas).

```
+----------+     +----------+     +----------+
| Sentinel |     | Sentinel |     | Sentinel |
+----------+     +----------+     +----------+
     |                |                |
     v                v                v
+----------+     +----------+     +----------+
| Master   | --> | Replica  | --> | Replica  |
| (R/W)    |     | (R/O)    |     | (R/O)    |
+----------+     +----------+     +----------+

Master fails:
  1. Sentinels detect failure (quorum agrees)
  2. Sentinel promotes a replica to master
  3. Other replicas reconfigure to new master
  4. Clients notified of new master address
```

### Sentinel vs Cluster

| Feature | Sentinel | Cluster |
| ------- | -------- | ------- |
| **Sharding** | No (single master) | Yes (hash slots) |
| **Scale** | Vertical only | Horizontal |
| **Max data** | Single node memory | Sum of all nodes |
| **Multi-key** | All keys on one node | Only within same hash slot |
| **Complexity** | Simpler | More complex |
| **Use when** | Data fits on one machine | Data exceeds one machine |

---

## Pub/Sub

```redis
-- Subscriber
SUBSCRIBE chat:room:123
-- Blocks, receives: { channel: "chat:room:123", message: "Hello!" }

-- Publisher
PUBLISH chat:room:123 "Hello!"
-- Returns: number of subscribers who received it

-- Pattern subscribe
PSUBSCRIBE chat:room:*
-- Receives messages from ALL chat rooms
```

**Limitation:** Fire-and-forget. If no subscriber is listening, the message is lost. No persistence, no replay. For persistent messaging, use Redis Streams.

---

## Lua Scripting

Execute atomic operations server-side.

```redis
-- Rate limiter (atomic check + increment)
EVAL "
  local current = redis.call('GET', KEYS[1])
  if current and tonumber(current) >= tonumber(ARGV[1]) then
    return 0  -- rate limited
  end
  redis.call('INCR', KEYS[1])
  if not current then
    redis.call('EXPIRE', KEYS[1], ARGV[2])
  end
  return 1  -- allowed
" 1 rate:user:123 100 60
-- Args: key, limit (100 requests), window (60 seconds)
```

**Why Lua?** All commands in a script execute atomically. No race conditions. The script runs on the Redis server, eliminating network round-trips for multi-step operations.

---

## Pipelining

Send multiple commands in one network round-trip.

```
Without pipelining:
  Client: SET key1 val1 -> Server: OK -> Client: SET key2 val2 -> Server: OK
  2 round-trips

With pipelining:
  Client: SET key1 val1, SET key2 val2, SET key3 val3 -> Server: OK, OK, OK
  1 round-trip (3x faster for network-bound operations)
```

---

## Memory Optimization

| Technique | How | Savings |
| --------- | --- | ------- |
| **Use hashes for small objects** | Store small objects as hash fields (ziplist encoding) | 10x vs individual keys |
| **Short key names** | `u:123:p` instead of `user:123:profile` | Proportional to key length |
| **Integer values** | Redis stores small integers in shared pool | 8 bytes vs string overhead |
| **Expiration** | Set TTL on all cache keys | Prevents unbounded growth |
| **Compression** | Compress values before storing (gzip, snappy) | 50-90% for JSON/text |
| **maxmemory-policy** | Set eviction policy when memory limit reached | Prevents OOM |

---

## Common Patterns

### Distributed Lock (Redlock)

```redis
-- Acquire lock
SET lock:resource "owner-id" NX EX 30
-- NX: only if not exists, EX: 30 second TTL

-- Release lock (Lua for atomicity)
EVAL "
  if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
  end
  return 0
" 1 lock:resource "owner-id"
```

### Session Store

```redis
SET session:abc123 '{"user_id": 1, "role": "admin"}' EX 3600
GET session:abc123
```

### Leaderboard

```redis
ZADD game:leaderboard 1500 "player-1"
ZINCRBY game:leaderboard 100 "player-1"  -- add 100 points
ZREVRANGE game:leaderboard 0 9 WITHSCORES  -- top 10
ZREVRANK game:leaderboard "player-1"  -- player's rank
```

---

## Common Interview Questions

1. **Why is Redis fast?** In-memory (no disk I/O for reads), single-threaded event loop (no context switching or locking), efficient data structures (ziplist, skiplist), I/O multiplexing (epoll).

2. **Redis is single-threaded. How does it handle concurrent requests?** Event-driven I/O multiplexing (epoll/kqueue). One thread processes commands sequentially, but I/O is non-blocking. Network I/O threads handle reading/writing (Redis 6+). CPU-bound operations are the bottleneck, not I/O.

3. **RDB vs AOF?** RDB: point-in-time snapshots, compact, fast recovery, data loss between snapshots. AOF: log every write, minimal data loss, larger file, slower recovery. Use both in production.

4. **How does Redis Cluster shard data?** 16,384 hash slots. CRC16(key) % 16384 = slot number. Each master owns a range of slots. Multi-key operations only work within the same slot (use hash tags `{tag}:key`).

5. **What is the thundering herd problem with Redis?** A hot key expires, many concurrent requests miss cache simultaneously, all hit DB. Solutions: mutex lock, early refresh, never-expire with background refresh.

6. **How would you implement a rate limiter with Redis?** Sorted set: add timestamped entries, remove entries outside window, count remaining. Or: simple counter with INCR and TTL. Or: Lua script for atomic check-and-increment.

7. **When would you use Memcached instead of Redis?** Pure key-value caching with high concurrency (Memcached is multi-threaded). When you don't need Redis data structures, persistence, or pub/sub. Memcached is simpler and uses less memory per key.
