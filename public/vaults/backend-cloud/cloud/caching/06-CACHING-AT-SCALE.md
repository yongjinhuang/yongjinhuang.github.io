# Caching at Scale

Operating caches in production at scale introduces challenges around consistency, hot keys, multi-tier architectures, and capacity planning. This guide covers the patterns that separate senior engineers from mid-level in system design interviews.

---

## Table of Contents

1. [Multi-Tier Caching](#multi-tier-caching)
2. [Hot Key Problem](#hot-key-problem)
3. [Cache Consistency in Distributed Systems](#cache-consistency)
4. [Cache Sharding](#cache-sharding)
5. [Monitoring and Capacity Planning](#monitoring-and-capacity-planning)
6. [Common Interview Questions](#common-interview-questions)

---

## Multi-Tier Caching

```
L0: Browser Cache (Cache-Control headers)
  -> Local to user, fastest, limited control
     |
     v (miss)
L1: CDN Edge Cache (Cloudflare, CloudFront)
  -> 300+ PoPs globally, milliseconds
     |
     v (miss)
L2: Application Local Cache (Caffeine, lru-cache)
  -> In-process, microseconds, per-instance
     |
     v (miss)
L3: Distributed Cache (Redis, Memcached)
  -> Shared across instances, sub-millisecond
     |
     v (miss)
L4: Database
  -> Source of truth, milliseconds to seconds
```

### TTL Strategy Across Tiers

```
L0 Browser:  max-age=60        (1 minute)
L1 CDN:      s-maxage=300      (5 minutes)
L2 Local:    TTL=30s           (30 seconds)
L3 Redis:    TTL=3600          (1 hour)

Principle: shorter TTL at higher tiers (closer to user)
  -> Fresher data at the expense of more cache misses
  -> Each tier absorbs misses for the next
```

### Cascading Invalidation

```
Data changes in DB:
  1. Invalidate L3 (Redis) via event/CDC
  2. L2 (local cache) expires via short TTL or pub/sub
  3. L1 (CDN) purged via API or cache tags
  4. L0 (browser) expires via max-age or stale-while-revalidate
```

---

## Hot Key Problem

```
Problem: One cache key receives disproportionate traffic
  "trending_post:123" -> 100,000 requests/sec -> single Redis node

Redis Cluster: key routes to ONE node
  -> That node becomes bottleneck
  -> Other nodes are idle
```

### Solutions

| Solution | How | Trade-off |
| -------- | --- | --------- |
| **Local cache** | Cache hot keys in-process (L2) | Stale data risk, memory per instance |
| **Key replication** | Store copies: `hot_key:1`, `hot_key:2`, ... `hot_key:N` | Read from random replica, write to all |
| **Read replicas** | Redis replicas serve reads | Extra memory, replication lag |
| **Client-side caching** | Redis 6+ server-assisted client caching | Complex, invalidation messages |

### Key Replication Pattern

```javascript
const REPLICAS = 5;

async function getHotKey(key) {
  const replica = Math.floor(Math.random() * REPLICAS);
  return redis.get(`${key}:${replica}`);
}

async function setHotKey(key, value, ttl) {
  const pipeline = redis.pipeline();
  for (let i = 0; i < REPLICAS; i++) {
    pipeline.set(`${key}:${i}`, value, "EX", ttl);
  }
  await pipeline.exec();
}
```

---

## Cache Consistency

### Cache-Aside Inconsistency Window

```
Thread A: UPDATE user SET name='Bob'  (DB updated)
Thread B: SELECT user WHERE id=1      (reads 'Bob' from DB)
Thread B: SET cache user:1 'Bob'       (cache updated)
Thread A: DEL cache user:1             (cache invalidated!)

Result: Cache has 'Bob', but was just deleted by Thread A
  -> Next read hits DB, gets 'Bob', caches it. OK in this case.

Worse scenario:
Thread A: UPDATE user SET name='Bob'
Thread A: DEL cache user:1
Thread B: SELECT user WHERE id=1      (reads 'Bob' from DB... or 'Alice' if read replica lag!)
Thread B: SET cache user:1 'Alice'     (stale value cached!)

Result: Cache has 'Alice' until TTL expires. INCONSISTENT.
```

### Consistency Strategies

| Strategy | Consistency | Complexity | Use Case |
| -------- | ----------- | ---------- | -------- |
| **TTL expiry** | Eventual (up to TTL) | Simple | Most applications |
| **Delete on write** | Eventual (brief window) | Simple | Cache-aside pattern |
| **Double delete** | Better eventual | Moderate | Reduce stale window |
| **Write-through** | Strong | Moderate | When consistency matters |
| **CDC invalidation** | Near real-time | Complex | Event-driven systems |
| **Version-based keys** | Strong for reads | Simple | Immutable cache entries |

### Double Delete Pattern

```
1. Delete cache
2. Update database
3. Wait (e.g., 500ms for replication lag)
4. Delete cache again (catches stale writes from read replicas)

async function updateUser(userId, data) {
  await redis.del(`user:${userId}`);
  await db.update("users", userId, data);
  setTimeout(() => redis.del(`user:${userId}`), 500);
}
```

---

## Cache Sharding

### Redis Cluster (Server-Side)

```
16,384 hash slots distributed across N masters
  Key -> CRC16(key) % 16384 -> slot -> node

Scaling:
  Add node -> migrate slots from existing nodes
  Remove node -> migrate slots to remaining nodes
```

### Client-Side Sharding (Memcached)

```
Consistent hashing in client library
  Key -> hash ring -> server

Scaling:
  Add server -> ~1/N keys remap
  Remove server -> ~1/N keys remap
  No data migration (cold miss on remapped keys)
```

### Sharding Considerations

| Factor | Guidance |
| ------ | -------- |
| **Data size** | Ensure data fits across all shards with headroom |
| **Hot keys** | Sharding doesn't help if one key is hot (see hot key solutions) |
| **Cross-shard ops** | Avoid multi-key operations across shards |
| **Rebalancing** | Plan for adding/removing nodes without downtime |
| **Monitoring** | Monitor per-shard metrics (memory, CPU, connections) |

---

## Monitoring and Capacity Planning

### Key Metrics

| Metric | Target | Alert |
| ------ | ------ | ----- |
| **Hit ratio** | >95% (ideally >99%) | <90% |
| **Latency (p99)** | <1ms (Redis), <5ms (with network) | >10ms |
| **Memory usage** | <75% of max | >85% |
| **Evictions** | Near zero (ideally) | Sustained evictions |
| **Connections** | <80% of max | >90% |
| **CPU** | <50% (Redis is single-threaded) | >70% |
| **Replication lag** | <1 second | >5 seconds |

### Hit Ratio Analysis

```
Hit ratio = hits / (hits + misses)

99% hit ratio: 1 in 100 requests hits DB
95% hit ratio: 5 in 100 requests hits DB (5x more DB load!)
90% hit ratio: 10 in 100 requests hits DB (10x more!)

Small changes in hit ratio = large changes in DB load.

Low hit ratio causes:
  - Cache too small (evictions before TTL)
  - TTL too short (expires before reuse)
  - Poor cache key design (many unique keys)
  - Working set larger than cache
  - Cache stampede after restart
```

### Capacity Planning

```
Memory required = (average_value_size + key_overhead) * unique_keys * (1 + overhead_factor)

Example:
  Average value: 500 bytes
  Key overhead: ~100 bytes (key string + Redis metadata)
  Unique keys: 10 million
  Redis overhead: 1.5x (fragmentation, data structures)

  Memory = (500 + 100) * 10M * 1.5 = 9 GB
  Recommendation: 12 GB instance (33% headroom)
```

### Cache Warming Strategy

```
Cold start problem: new instance has empty cache -> all requests hit DB

Warming approaches:
  1. Gradual: Let traffic naturally warm cache (risky for traffic spikes)
  2. Pre-warm: Script fetches popular keys before routing traffic
  3. Snapshot restore: Load RDB snapshot from previous instance
  4. Follower promotion: Promote a warm read replica to primary
```

---

## Common Interview Questions

1. **How would you design a multi-tier caching system?** L0: Browser (Cache-Control). L1: CDN edge. L2: In-process local cache. L3: Redis/Memcached. L4: Database. Shorter TTL at higher tiers. Invalidate from bottom up (DB change -> Redis -> local -> CDN).

2. **How do you handle hot keys in Redis Cluster?** Local in-process caching of hot keys, key replication (random suffix for reads), Redis read replicas, or client-side caching (Redis 6+). Monitor key access patterns to detect hot keys early.

3. **How do you ensure cache consistency with the database?** Delete-on-write (cache-aside) with short TTLs for acceptable staleness. Double-delete for reduced stale window. CDC-based invalidation for near real-time. Write-through for strong consistency at the cost of write latency.

4. **What happens when your cache goes down?** All traffic hits the database (potentially overwhelming it). Mitigate with: circuit breakers (fail fast, don't queue DB requests), local cache fallback, cache cluster HA (Redis Sentinel/Cluster), and database read replicas.

5. **How do you size a Redis cluster?** Calculate memory needed: (value_size + overhead) * keys * overhead_factor. Add 25-33% headroom. Monitor evictions and hit ratio. Scale up (bigger nodes) or out (more shards) based on metrics.

6. **How do you handle cache warming after deployment?** Pre-warm by fetching popular keys before routing traffic. Use RDB snapshots from previous instances. Promote warm replicas. Or use stale-while-revalidate to serve slightly old data while warming.

7. **What metrics would you monitor for a cache?** Hit ratio (>95%), latency p99 (<1ms), memory usage (<75%), eviction rate (near zero), connections, and replication lag. Small drops in hit ratio cause large increases in DB load.
