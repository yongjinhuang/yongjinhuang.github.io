# Caching Fundamentals

Understanding caching patterns, eviction policies, and failure modes is essential for system design interviews. This guide covers the theory behind caching before diving into specific technologies.

---

## Table of Contents

1. [Caching Patterns](#caching-patterns)
2. [Eviction Policies](#eviction-policies)
3. [Cache Failure Modes](#cache-failure-modes)
4. [Consistent Hashing](#consistent-hashing)
5. [Cache Invalidation](#cache-invalidation)
6. [Common Interview Questions](#common-interview-questions)

---

## Caching Patterns

### Cache-Aside (Lazy Loading)

The most common pattern. Application manages the cache directly.

```
Read:
  1. Check cache -> HIT? return cached value
  2. MISS? query database
  3. Store result in cache (with TTL)
  4. Return result

Write:
  1. Write to database
  2. Invalidate cache (delete key)
  -- Next read will populate cache from DB
```

```javascript
async function getUser(userId) {
  // 1. Check cache
  const cached = await redis.get(`user:${userId}`);
  if (cached) return JSON.parse(cached);

  // 2. Cache miss -> query DB
  const user = await db.query("SELECT * FROM users WHERE id = $1", [userId]);

  // 3. Populate cache
  await redis.set(`user:${userId}`, JSON.stringify(user), "EX", 3600);

  return user;
}
```

**Pros:** Simple, only caches what's needed, cache failures don't break reads.
**Cons:** Cache miss = slow (DB query), stale data possible, cold start problem.

### Read-Through

Cache itself fetches from the database on miss. Application only talks to cache.

```
Read:
  1. App requests from cache
  2. Cache HIT? return value
  3. Cache MISS? cache queries DB, stores result, returns to app
```

**Pros:** Simpler application code (cache handles fetching).
**Cons:** Cache must know how to query DB. Cache library/proxy dependent.

### Write-Through

Every write goes through the cache to the database.

```
Write:
  1. App writes to cache
  2. Cache synchronously writes to DB
  3. Confirm to app

Read:
  1. Always from cache (always up-to-date)
```

**Pros:** Cache always consistent with DB. No stale reads.
**Cons:** Write latency increased (cache + DB). Writes to rarely-read data waste cache space.

### Write-Behind (Write-Back)

Cache absorbs writes and asynchronously flushes to database.

```
Write:
  1. App writes to cache -> immediate ACK to app
  2. Cache buffers writes
  3. Async batch write to DB (e.g., every 5 seconds)

Read:
  1. Always from cache
```

**Pros:** Fastest writes. Batching reduces DB load. Absorbs write spikes.
**Cons:** Data loss risk (cache crash before flush). Complexity. Consistency issues.

### Write-Around

Writes go directly to DB, cache is not updated. Cache entries are invalidated or left to expire.

```
Write:
  1. App writes to DB
  2. Optionally invalidate cache

Read:
  1. Check cache -> MISS? -> fetch from DB -> populate cache
```

**Pros:** Write-once data doesn't pollute cache. Good for infrequently read data.
**Cons:** First read after write is always a miss.

---

## Eviction Policies

When cache is full, which entry to remove?

| Policy | How | Pros | Cons |
| ------ | --- | ---- | ---- |
| **LRU** (Least Recently Used) | Evict least recently accessed | Good general-purpose | Scan/flood resistance poor |
| **LFU** (Least Frequently Used) | Evict least frequently accessed | Keeps popular items | Slow to adapt to changing patterns |
| **FIFO** | Evict oldest entry | Simple | Ignores access patterns |
| **TTL** | Evict after time-to-live expires | Predictable freshness | Not space-aware |
| **Random** | Evict random entry | O(1), no tracking overhead | Unpredictable |
| **W-TinyLFU** (Caffeine) | Window + frequency + recency | Near-optimal hit rate | Complex implementation |

### Redis Eviction Policies

```
maxmemory-policy:
  noeviction       -- Return error on writes when full
  allkeys-lru      -- Evict any key, LRU (most common)
  allkeys-lfu      -- Evict any key, LFU
  allkeys-random   -- Evict any key, random
  volatile-lru     -- Evict only keys with TTL, LRU
  volatile-lfu     -- Evict only keys with TTL, LFU
  volatile-ttl     -- Evict keys with nearest TTL expiry
  volatile-random  -- Evict random key with TTL
```

---

## Cache Failure Modes

### Cache Stampede (Thundering Herd)

```
Scenario: Popular cache key expires
  -> 1000 concurrent requests all get cache MISS
  -> 1000 identical DB queries simultaneously
  -> Database overloaded

Solutions:
  1. Mutex/lock: First request acquires lock, others wait
  2. Early expiration: Refresh before TTL expires (stale-while-revalidate)
  3. Background refresh: Async job refreshes cache before expiry
```

```javascript
// Mutex solution
async function getWithMutex(key) {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  // Try to acquire lock
  const locked = await redis.set(`lock:${key}`, "1", "NX", "EX", 10);
  if (locked) {
    const data = await db.query(/* ... */);
    await redis.set(key, JSON.stringify(data), "EX", 3600);
    await redis.del(`lock:${key}`);
    return data;
  }

  // Another request has the lock, wait and retry
  await sleep(50);
  return getWithMutex(key);
}
```

### Cache Penetration

```
Scenario: Requests for keys that DON'T EXIST in DB
  -> Every request is a cache miss (key never gets cached)
  -> All requests hit DB

Solutions:
  1. Cache null values: cache "key: null" with short TTL
  2. Bloom filter: Check bloom filter before DB (filter says "definitely not in DB")
```

### Cache Breakdown

```
Scenario: A single hot key expires
  -> All traffic for that key hits DB simultaneously
  -> Similar to stampede but for one specific key

Solutions:
  1. Never expire hot keys (refresh in background)
  2. Mutex (same as stampede solution)
```

### Cache Avalanche

```
Scenario: Many cache keys expire at the same time
  -> Massive cache miss storm
  -> Database overwhelmed

Solutions:
  1. Jitter: Add random offset to TTL (TTL + random(0, 300))
  2. Staggered expiration: Different TTLs for different key types
  3. Circuit breaker: Stop DB queries when error rate is high
```

---

## Consistent Hashing

Distributing cache keys across multiple cache nodes.

### Problem with Simple Hashing

```
hash(key) % N = node

With 3 nodes: hash("user:123") % 3 = node 1
Add a 4th node: hash("user:123") % 4 = node 0  (DIFFERENT!)

Adding or removing a node remaps almost ALL keys -> massive cache miss storm
```

### Consistent Hashing Solution

```
Hash ring: 0 to 2^32

     Node A (position 100)
    /
   0 -------- 2^32
    \
     Node B (position 200)
      \
       Node C (position 300)

Key "user:123" hashes to position 150 -> assigned to next node clockwise (Node B)

Add Node D at position 250:
  - Only keys between 200-250 move (from Node C to Node D)
  - ~1/N of keys remapped (not all of them)
```

### Virtual Nodes

```
Problem: 3 physical nodes may not distribute evenly on the ring

Solution: Each physical node gets 100-200 virtual positions on the ring
  Node A: positions [100, 500, 900, 1300, ...]
  Node B: positions [200, 600, 1000, 1400, ...]
  Node C: positions [300, 700, 1100, 1500, ...]

Result: Much more even distribution
```

---

## Cache Invalidation

> "There are only two hard things in Computer Science: cache invalidation and naming things." -- Phil Karlton

### Strategies

| Strategy | How | Consistency | Complexity |
| -------- | --- | ----------- | ---------- |
| **TTL-based** | Set expiration time | Eventual (stale until TTL) | Simple |
| **Event-based** | Invalidate on write event | Near real-time | Moderate |
| **Write-through** | Update cache on every write | Strong | Moderate |
| **Version-based** | Include version in cache key | Strong for reads | Simple |

### Event-Based Invalidation

```
Service A writes to DB
  -> DB CDC (Debezium) -> Kafka -> Cache Invalidation Service -> redis.del(key)

Or:
Service A writes to DB
  -> Service A publishes event -> Cache subscriber -> redis.del(key)
```

### Version-Based Cache Keys

```
Instead of: cache.get("user:123")
Use:        cache.get("user:123:v5")

When user is updated, increment version in DB:
  user.cache_version = 6
  New reads: cache.get("user:123:v6") -> miss -> populate

Old versions expire naturally via TTL.
No explicit invalidation needed.
```

---

## Common Interview Questions

1. **Explain cache-aside pattern.** Application checks cache first. On miss, queries DB, stores result in cache. On write, updates DB and invalidates cache. Most common pattern because it's simple and the cache only stores actively used data.

2. **How do you handle cache stampede?** Use a mutex/lock so only one request fetches from DB on cache miss. Others wait for the lock holder to populate cache. Alternative: proactively refresh cache before TTL expires.

3. **What is cache penetration and how do you prevent it?** Queries for non-existent data bypass cache every time. Solutions: cache null results with short TTL, use a bloom filter to reject queries for non-existent keys before hitting DB.

4. **How do you choose between LRU and LFU?** LRU is better for workloads with temporal locality (recent = likely accessed again). LFU is better when some items are consistently popular regardless of recency. W-TinyLFU (Caffeine) combines both.

5. **Explain consistent hashing.** Maps cache nodes and keys to a hash ring. Each key is assigned to the next node clockwise. Adding/removing a node only remaps ~1/N of keys (vs all keys with modular hashing). Virtual nodes ensure even distribution.

6. **How do you invalidate cache when data changes?** Options: TTL-based (simple, stale data possible), event-based (CDC or application events invalidate specific keys), write-through (cache always updated on write), version-based keys (new version = new key).

7. **What is cache avalanche?** Many keys expire simultaneously, causing a flood of DB queries. Prevent with: TTL jitter (random offset), staggered expiration, circuit breakers, or never-expire + background refresh for hot keys.
