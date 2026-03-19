# Design a Distributed Cache (Redis / Memcached)

## Table of Contents

1. [Requirements Clarification](#1-requirements-clarification)
2. [Cache Strategies (Deep Dive)](#2-cache-strategies-deep-dive)
3. [High-Level Architecture](#3-high-level-architecture)
4. [Data Partitioning](#4-data-partitioning)
5. [Data Model & Storage](#5-data-model--storage)
6. [Replication & High Availability](#6-replication--high-availability)
7. [Persistence](#7-persistence)
8. [Cache Invalidation](#8-cache-invalidation)
9. [Consistency](#9-consistency)
10. [Scaling](#10-scaling)
11. [Deployment Architecture](#11-deployment-architecture)
12. [Common Interview Follow-ups](#12-common-interview-follow-ups)

---

## 1. Requirements Clarification

### Functional Requirements

| Requirement              | Description                                                    |
| ------------------------ | -------------------------------------------------------------- |
| **Get / Set / Delete**   | Basic key-value operations with O(1) average time complexity   |
| **TTL (Time-To-Live)**   | Per-key expiration; keys are automatically removed after TTL   |
| **Eviction Policies**    | LRU, LFU, FIFO, Random, TTL-based eviction when memory is full |
| **Rich Data Structures** | String, Hash, List, Set, Sorted Set, Bitmap, HyperLogLog       |
| **Atomic Operations**    | INCR/DECR, CAS (Compare-And-Swap), MULTI/EXEC transactions     |
| **Pub/Sub**              | Publish and subscribe to channels for real-time messaging      |
| **Distributed Locking**  | Support distributed mutual exclusion across clients            |
| **Scan / Iteration**     | Non-blocking iteration over keyspace                           |

### Non-Functional Requirements

| Requirement         | Target                                                        |
| ------------------- | ------------------------------------------------------------- |
| **Latency**         | Sub-millisecond for single-key operations (p99 < 1 ms)        |
| **Throughput**      | 100K+ operations/second per node                              |
| **Availability**    | 99.99% uptime; automatic failover within seconds              |
| **Durability**      | Configurable — from pure in-memory to fully persistent        |
| **Consistency**     | Eventual consistency across replicas; strong within a shard   |
| **Scalability**     | Linear horizontal scaling; support 100+ nodes                 |
| **Fault Tolerance** | Survive node failures, network partitions, datacenter outages |

### Scale Estimation

```
Assumptions:
  - Total data volume:       100 TB across cluster
  - Memory per node:         64 GB usable
  - Nodes needed:            100 TB / 64 GB ≈ 1,600 nodes (data only)
  - With replication (3x):   ~4,800 node instances
  - Requests per second:     10 million ops/sec globally
  - Ops per node:            10M / 1,600 ≈ 6,250 ops/sec (well within limits)
  - Average key size:        64 bytes
  - Average value size:      1 KB
  - Keys per node:           64 GB / (64 B + 1 KB) ≈ 60 million keys/node
  - Total keys:              60M * 1,600 ≈ 96 billion keys

Network bandwidth per node:
  - Read-heavy (80/20 split):  6,250 * 0.8 * 1 KB = ~5 MB/s reads
                                6,250 * 0.2 * 1 KB = ~1.25 MB/s writes
  - Replication traffic:        1.25 MB/s * 2 replicas = ~2.5 MB/s
  - Total per node:            ~8.75 MB/s (very manageable on 10 Gbps NIC)
```

---

## 2. Cache Strategies (Deep Dive)

### 2.1 Cache-Aside (Lazy Loading)

The application is responsible for reading from and writing to the cache.

**How It Works:**

1. Application checks the cache for data.
2. On cache hit, return data.
3. On cache miss, query the database.
4. Write the result back into the cache.
5. On write, update the database and invalidate/delete the cache entry.

```
  ┌────────────┐          ┌────────────┐          ┌────────────┐
  │            │  1. GET   │            │          │            │
  │   Client   │ -------> │   Cache    │          │  Database  │
  │            │ <------- │            │          │            │
  │            │  2. HIT   │            │          │            │
  └────────────┘          └────────────┘          └────────────┘

          --- Cache Miss Flow ---

  ┌────────────┐          ┌────────────┐          ┌────────────┐
  │            │  1. GET   │            │          │            │
  │   Client   │ -------> │   Cache    │          │  Database  │
  │            │ <------- │  (MISS)    │          │            │
  │            │          └────────────┘          │            │
  │            │  3. Query                        │            │
  │            │ ------------------------------> │            │
  │            │ <------------------------------ │            │
  │            │  4. Result                       │            │
  │            │          ┌────────────┐          │            │
  │            │  5. SET   │            │          │            │
  │            │ -------> │   Cache    │          │            │
  └────────────┘          └────────────┘          └────────────┘
```

**When to Use:**

- General-purpose caching where reads dominate writes.
- Applications that can tolerate stale data for short periods.
- Situations where not all data needs to be cached.

**Pros:**

- Only requested data is cached (no wasted memory).
- Cache failure does not break the system (graceful degradation).
- Simple to implement.

**Cons:**

- Cache miss penalty — three round trips on a miss.
- Stale data possible if the DB is updated without cache invalidation.
- "Cache stampede" risk on cold start or after eviction.

**Redis Example:**

```python
def get_user(user_id):
    # 1. Check cache
    cached = redis.get(f"user:{user_id}")
    if cached:
        return json.loads(cached)

    # 2. Cache miss — query DB
    user = db.query("SELECT * FROM users WHERE id = %s", user_id)

    # 3. Populate cache with TTL
    redis.setex(f"user:{user_id}", 3600, json.dumps(user))

    return user
```

---

### 2.2 Read-Through

The cache sits between the application and the database. The cache itself handles fetching from the database on a miss.

**How It Works:**

1. Application always reads from the cache.
2. On hit, cache returns data.
3. On miss, the cache loads data from DB, stores it, and returns it to the application.

```
  ┌────────────┐          ┌────────────────┐          ┌────────────┐
  │            │  1. GET   │                │  2. Load  │            │
  │   Client   │ -------> │  Cache Layer   │ -------> │  Database  │
  │            │          │  (with loader) │ <------- │            │
  │            │ <------- │                │  3. Data  │            │
  │            │  4. Data  │   (stores it)  │          │            │
  └────────────┘          └────────────────┘          └────────────┘
```

**When to Use:**

- When you want the cache to own the data-loading logic.
- Libraries like Guava Cache, Caffeine, or frameworks that support loaders.

**Pros:**

- Application code is simpler (no cache miss handling).
- Data loading is centralized in the cache layer.

**Cons:**

- First request for each key is always slow (cold miss).
- Tight coupling between cache and data source.
- More complex cache implementation.

---

### 2.3 Write-Through

Every write goes to the cache first, and the cache synchronously writes to the database before acknowledging.

**How It Works:**

1. Application writes to the cache.
2. Cache synchronously writes to the database.
3. Both are updated before returning success.

```
  ┌────────────┐          ┌────────────┐          ┌────────────┐
  │            │  1. SET   │            │  2. Write │            │
  │   Client   │ -------> │   Cache    │ -------> │  Database  │
  │            │          │            │ <------- │            │
  │            │ <------- │            │  3. ACK   │            │
  │            │  4. ACK   │            │          │            │
  └────────────┘          └────────────┘          └────────────┘
```

**When to Use:**

- When data consistency between cache and DB is critical.
- Often paired with Read-Through for a complete solution.

**Pros:**

- Cache and DB are always in sync.
- No data loss on cache eviction (data is in DB).

**Cons:**

- Higher write latency (two writes on every operation).
- Every write goes through the cache, even for rarely-read data.

---

### 2.4 Write-Behind (Write-Back)

The application writes to the cache, and the cache asynchronously flushes to the database in batches.

**How It Works:**

1. Application writes to the cache.
2. Cache immediately acknowledges.
3. Cache asynchronously writes to the database (batched, delayed).

```
  ┌────────────┐          ┌────────────┐   async   ┌────────────┐
  │            │  1. SET   │            │  ......>  │            │
  │   Client   │ -------> │   Cache    │  3. Batch │  Database  │
  │            │ <------- │  (buffer)  │  write    │            │
  │            │  2. ACK   │            │  ......>  │            │
  │            │ (instant) │            │           │            │
  └────────────┘          └────────────┘           └────────────┘
```

**When to Use:**

- High write throughput requirements.
- Applications that can tolerate some data loss risk.
- Write-heavy workloads (e.g., analytics counters, session stores).

**Pros:**

- Very low write latency.
- Batching reduces DB load significantly.
- Absorbs write spikes.

**Cons:**

- Risk of data loss if the cache node crashes before flushing.
- Complex failure recovery.
- Eventual consistency between cache and DB.

---

### 2.5 Refresh-Ahead

The cache proactively refreshes entries before they expire, based on predicted access patterns.

**How It Works:**

1. Cache tracks access frequency for each key.
2. Before a key's TTL expires, if it was recently accessed, the cache refreshes it from the DB in the background.
3. Clients always get fresh data from cache without miss penalty.

```
  ┌────────────┐          ┌────────────┐          ┌────────────┐
  │            │   GET     │            │          │            │
  │   Client   │ -------> │   Cache    │          │  Database  │
  │            │ <------- │            │          │            │
  │            │  (fast!)  │            │          │            │
  └────────────┘          │            │          │            │
                          │  TTL at    │ refresh  │            │
                          │  80%?      │ -------> │            │
                          │  Recently  │ <------- │            │
                          │  accessed? │          │            │
                          └────────────┘          └────────────┘
```

**When to Use:**

- Predictable access patterns.
- When cache miss latency is unacceptable.
- High-traffic keys where staleness must be minimized.

**Pros:**

- Near-zero cache miss rate for hot keys.
- Reduced latency for frequently accessed data.

**Cons:**

- Wastes resources refreshing data that may not be requested again.
- Complex to implement; requires prediction of access patterns.

---

### 2.6 Strategy Comparison Table

| Strategy      | Read Latency | Write Latency | Consistency | Data Loss Risk | Complexity | Best For                     |
| ------------- | ------------ | ------------- | ----------- | -------------- | ---------- | ---------------------------- |
| Cache-Aside   | Miss: High   | Low (DB only) | Eventual    | None           | Low        | General purpose              |
| Read-Through  | Miss: High   | N/A           | Eventual    | None           | Medium     | Simplified read path         |
| Write-Through | Hit: Low     | High          | Strong      | None           | Medium     | Consistency-critical writes  |
| Write-Behind  | Hit: Low     | Very Low      | Eventual    | **High**       | High       | Write-heavy workloads        |
| Refresh-Ahead | Very Low     | N/A           | Near-real   | None           | High       | Hot keys, predictable access |

---

## 3. High-Level Architecture

```
                              ┌─────────────────────────┐
                              │     Coordination        │
                              │   Service (etcd /       │
                              │    ZooKeeper)           │
                              │                         │
                              │  - Cluster topology     │
                              │  - Leader election      │
                              │  - Config management    │
                              └────────┬────────────────┘
                                       │ watches/updates
        ┌──────────────────────────────┼──────────────────────────────┐
        │                              │                              │
  ┌─────▼──────┐               ┌──────▼─────┐               ┌───────▼────┐
  │   Client   │               │   Client   │               │   Client   │
  │  Library   │               │  Library   │               │  Library   │
  │ (Jedis /   │               │ (Jedis /   │               │ (Jedis /   │
  │  Lettuce)  │               │  Lettuce)  │               │  Lettuce)  │
  └─────┬──────┘               └──────┬─────┘               └──────┬─────┘
        │                              │                            │
        │         Consistent Hashing / Hash Slot Routing            │
        │                              │                            │
  ┌─────▼──────────────────────────────▼────────────────────────────▼─────┐
  │                         Cache Cluster                                 │
  │                                                                       │
  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐              │
  │  │  Shard 0    │    │  Shard 1    │    │  Shard 2    │   ...        │
  │  │             │    │             │    │             │              │
  │  │  ┌───────┐  │    │  ┌───────┐  │    │  ┌───────┐  │              │
  │  │  │Master │  │    │  │Master │  │    │  │Master │  │              │
  │  │  │ Node  │  │    │  │ Node  │  │    │  │ Node  │  │              │
  │  │  └───┬───┘  │    │  └───┬───┘  │    │  └───┬───┘  │              │
  │  │      │      │    │      │      │    │      │      │              │
  │  │  ┌───▼───┐  │    │  ┌───▼───┐  │    │  ┌───▼───┐  │              │
  │  │  │Replica│  │    │  │Replica│  │    │  │Replica│  │              │
  │  │  │  (1)  │  │    │  │  (1)  │  │    │  │  (1)  │  │              │
  │  │  └───────┘  │    │  └───────┘  │    │  └───────┘  │              │
  │  │  ┌───────┐  │    │  ┌───────┐  │    │  ┌───────┐  │              │
  │  │  │Replica│  │    │  │Replica│  │    │  │Replica│  │              │
  │  │  │  (2)  │  │    │  │  (2)  │  │    │  │  (2)  │  │              │
  │  │  └───────┘  │    │  └───────┘  │    │  └───────┘  │              │
  │  └─────────────┘    └─────────────┘    └─────────────┘              │
  │                                                                       │
  │  Hash Slots: 0-5460       5461-10922      10923-16383               │
  └───────────────────────────────────────────────────────────────────────┘
```

### Key Architectural Components

| Component               | Responsibility                                             |
| ----------------------- | ---------------------------------------------------------- |
| **Client Library**      | Connection pooling, routing, serialization, retry logic    |
| **Cache Node (Master)** | Serves reads/writes for its shard; replicates to replicas  |
| **Replica Node**        | Serves reads (optionally); takes over on master failure    |
| **Coordination Svc**    | Cluster membership, leader election, topology changes      |
| **Hash Slot Map**       | Maps 16,384 hash slots to shards for deterministic routing |

---

## 4. Data Partitioning

### 4.1 Hash-Based Partitioning

The simplest approach: `node = hash(key) % N` where N is the number of nodes.

**Problem:** When N changes (add/remove node), almost all keys are remapped.

```
Before (3 nodes):   hash("user:1") % 3 = 1  -->  Node 1
After  (4 nodes):   hash("user:1") % 4 = 2  -->  Node 2  (MOVED!)

Approximately (N-1)/N keys are remapped on resize.
Adding 1 node to 3: ~67% of keys must move.
```

### 4.2 Consistent Hashing (Deep Dive)

Consistent hashing maps both keys and nodes onto a circular hash space (ring). Each key is assigned to the first node encountered clockwise on the ring.

```
            Hash Ring (0 to 2^32 - 1)

                    0 / 2^32
                      │
                ┌─────┴─────┐
               ╱              ╲
              │   Node A       │
              │   (pos: 30°)   │
             ╱                  ╲
            │                    │
   270° ────┤                    ├──── 90°
            │    key:"user:7"    │
            │    (pos: 200°)     │
             ╲                  ╱
              │   Node C       │
              │   (pos: 150°)  │
               ╲              ╱
                └─────┬─────┘
                      │
                    180°
                  Node B
                  (pos: 180°)

  Key "user:7" at 200° --> walks clockwise --> hits Node A at 30°?
  No! It hits Node C? Let's be precise:

  Clockwise from 200°:  270° (nothing), 360°/0° (nothing), 30° = Node A

  So "user:7" maps to Node A.
```

**When a Node is Added:**

```
  Before:  A(30°), B(180°), C(150°)
  Add D at 220°:

  Only keys between 180° and 220° move from A to D.
  All other keys stay on their current nodes.

  Impact: Only K/N keys move on average (K = total keys, N = nodes).
```

**When a Node is Removed:**

```
  Remove B(180°):
  Keys that were on B (between 150° and 180°) now go to A (next clockwise).
  Only B's keys are redistributed.
```

### 4.3 Virtual Nodes (VNodes)

With few physical nodes, the key distribution is uneven. Virtual nodes solve this by mapping each physical node to many positions on the ring.

```
  Physical Node A  -->  VNode A-0 (30°), A-1 (120°), A-2 (250°), A-3 (340°)
  Physical Node B  -->  VNode B-0 (60°), B-1 (170°), B-2 (280°), B-3 (50°)
  Physical Node C  -->  VNode C-0 (100°), C-1 (210°), C-2 (310°), C-3 (150°)

  Ring with virtual nodes:

  0°───30°(A)──50°(B)──60°(B)──100°(C)──120°(A)──150°(C)──170°(B)──
  ──210°(C)──250°(A)──280°(B)──310°(C)──340°(A)───360°/0°

  Result: Much more uniform distribution.
  Typical: 100-200 virtual nodes per physical node.
```

**Benefits:**

- Even data distribution across heterogeneous hardware.
- Assign more virtual nodes to more powerful machines.
- Smoother redistribution when nodes join or leave.

### 4.4 Redis Cluster: Hash Slot Approach

Redis Cluster uses a fixed 16,384 hash slots (not a traditional consistent hash ring):

```
  slot = CRC16(key) % 16384

  Node A: slots 0 - 5460
  Node B: slots 5461 - 10922
  Node C: slots 10923 - 16383
```

**Advantages over pure consistent hashing:**

- Deterministic slot assignment; no ring ambiguity.
- Resharding moves specific slot ranges, not random keys.
- Clients cache the slot-to-node mapping for direct routing.

### 4.5 Hot Key Problem and Solutions

A "hot key" is a single key receiving disproportionate traffic (e.g., a viral post, a celebrity's profile).

| Solution                | Description                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| **Key splitting**       | Split `hot_key` into `hot_key:0`, `hot_key:1`, ..., `hot_key:N`. Client reads from random shard. |
| **Local caching**       | Cache hot keys in application memory (L1 cache) with short TTL.                                  |
| **Read replicas**       | Route reads for hot keys to replicas to distribute load.                                         |
| **Proxy-layer caching** | Let the proxy detect and locally cache hot keys.                                                 |
| **Key tracking**        | Redis `CLIENT TRACKING` + `REDIRECT` for server-assisted invalidation.                           |

```
  Hot Key Splitting Example:

  Original:  GET celebrity:123         -->  Always hits Node B
  Split:     GET celebrity:123:{0..9}  -->  Distributed across nodes

  Write:
    for i in range(10):
        redis.set(f"celebrity:123:{i}", data)

  Read:
    shard = random.randint(0, 9)
    redis.get(f"celebrity:123:{shard}")
```

---

## 5. Data Model & Storage

### 5.1 In-Memory Data Structures (Redis)

| Data Type       | Underlying Structure                     | Example Commands                  |
| --------------- | ---------------------------------------- | --------------------------------- |
| **String**      | Simple Dynamic String (SDS)              | `SET`, `GET`, `INCR`, `APPEND`    |
| **Hash**        | Ziplist (small) / Hash Table (large)     | `HSET`, `HGET`, `HGETALL`         |
| **List**        | Quicklist (linked list of ziplists)      | `LPUSH`, `RPOP`, `LRANGE`         |
| **Set**         | Intset (small ints) / Hash Table         | `SADD`, `SMEMBERS`, `SINTER`      |
| **Sorted Set**  | Ziplist (small) / Skip List + Hash Table | `ZADD`, `ZRANGE`, `ZRANGEBYSCORE` |
| **Bitmap**      | String (bit operations)                  | `SETBIT`, `GETBIT`, `BITCOUNT`    |
| **HyperLogLog** | Sparse/Dense HLL representation          | `PFADD`, `PFCOUNT`, `PFMERGE`     |
| **Stream**      | Radix tree of listpack entries           | `XADD`, `XREAD`, `XRANGE`         |

### 5.2 Hash Table Implementation

Redis uses a hash table with incremental rehashing:

```
  ┌──────────────────────────────────────────────┐
  │              Redis Dict (Hash Table)          │
  │                                               │
  │  ht[0] (current table)    ht[1] (rehash tgt) │
  │  ┌──────────────────┐     ┌────────────────┐  │
  │  │ bucket[0] -> E1  │     │ (empty until   │  │
  │  │ bucket[1] -> E2->E5    │  rehash starts)│  │
  │  │ bucket[2] -> E3  │     │                │  │
  │  │ bucket[3] -> nil │     │                │  │
  │  │ bucket[4] -> E4  │     │                │  │
  │  └──────────────────┘     └────────────────┘  │
  │                                               │
  │  rehashidx: -1  (not rehashing)               │
  │  load_factor = used / size                    │
  │  Rehash triggers when load_factor > 1         │
  └──────────────────────────────────────────────┘

  Incremental Rehash:
  - When rehash starts, ht[1] is allocated (2x size).
  - On every operation, move 1 bucket from ht[0] to ht[1].
  - During rehash, reads check both tables; writes go to ht[1].
  - When all buckets moved, swap ht[0] and ht[1], free old table.
  - Avoids O(N) blocking rehash.
```

### 5.3 Memory Management

```
Key Memory Overhead (Redis):
  - Each key-value pair: ~70 bytes overhead (dictEntry + redisObject + SDS header)
  - 1 million keys with 64-byte values: ~130 MB
  - Use MEMORY USAGE <key> to inspect individual keys

Memory Optimization Techniques:
  - Use hashes to group related small keys (hash-max-ziplist-entries)
  - Prefer integer keys/values (uses less memory)
  - Set maxmemory and maxmemory-policy
  - Use short key names for high-cardinality data
  - Enable LZF compression for large values (application-level)
```

### 5.4 Eviction Policies (Deep Dive)

When `maxmemory` is reached, Redis must evict keys to make room.

| Policy            | Description                                   |
| ----------------- | --------------------------------------------- |
| `noeviction`      | Return error on writes; reads still work      |
| `allkeys-lru`     | Evict least recently used key from all keys   |
| `volatile-lru`    | Evict LRU key from keys with TTL set          |
| `allkeys-lfu`     | Evict least frequently used key from all keys |
| `volatile-lfu`    | Evict LFU key from keys with TTL set          |
| `allkeys-random`  | Evict a random key                            |
| `volatile-random` | Evict a random key with TTL set               |
| `volatile-ttl`    | Evict key with nearest expiration time        |

**Redis configuration:**

```
CONFIG SET maxmemory 4gb
CONFIG SET maxmemory-policy allkeys-lru
```

### 5.5 LRU Implementation: Doubly-Linked List + Hash Map

The classic LRU cache uses a hash map for O(1) lookup and a doubly-linked list for O(1) eviction ordering.

```
  Hash Map                         Doubly-Linked List
  ┌───────────┐                    (most recent)           (least recent)
  │ key1 -> ──┼──────────────>  ┌────┐   ┌────┐   ┌────┐   ┌────┐
  │ key2 -> ──┼────────────>    │ D  │<->│ A  │<->│ C  │<->│ B  │
  │ key3 -> ──┼──────────>      │    │   │    │   │    │   │    │
  │ key4 -> ──┼────────>        └────┘   └────┘   └────┘   └────┘
  └───────────┘                   HEAD                        TAIL
                                  (MRU)                       (LRU)

  GET key "A":
    1. HashMap lookup: O(1) -> find node
    2. Move node to HEAD of list: O(1)
    3. Return value

  SET new key (cache full):
    1. Remove TAIL node (LRU victim): O(1)
    2. Remove from HashMap: O(1)
    3. Insert new node at HEAD: O(1)
    4. Add to HashMap: O(1)
```

**Pseudocode:**

```python
class LRUCache:
    def __init__(self, capacity):
        self.capacity = capacity
        self.cache = {}          # key -> Node
        self.head = Node(0, 0)   # dummy head (MRU side)
        self.tail = Node(0, 0)   # dummy tail (LRU side)
        self.head.next = self.tail
        self.tail.prev = self.head

    def get(self, key):
        if key not in self.cache:
            return -1
        node = self.cache[key]
        self._move_to_head(node)
        return node.value

    def put(self, key, value):
        if key in self.cache:
            node = self.cache[key]
            node.value = value
            self._move_to_head(node)
        else:
            if len(self.cache) >= self.capacity:
                # Evict LRU (tail.prev)
                lru = self.tail.prev
                self._remove(lru)
                del self.cache[lru.key]

            new_node = Node(key, value)
            self.cache[key] = new_node
            self._add_to_head(new_node)

    def _add_to_head(self, node):
        node.prev = self.head
        node.next = self.head.next
        self.head.next.prev = node
        self.head.next = node

    def _remove(self, node):
        node.prev.next = node.next
        node.next.prev = node.prev

    def _move_to_head(self, node):
        self._remove(node)
        self._add_to_head(node)


class Node:
    def __init__(self, key, value):
        self.key = key
        self.value = value
        self.prev = None
        self.next = None
```

**Note:** Redis does NOT use a true LRU. It uses an **approximated LRU** — it samples `maxmemory-samples` (default 5) random keys and evicts the one with the oldest access time. This trades a small accuracy loss for significant memory savings (no linked list overhead per key).

### 5.6 LFU (Least Frequently Used) Implementation

Redis LFU uses a logarithmic frequency counter stored in 8 bits of the LRU field:

```
  redisObject.lru field (24 bits):
  ┌────────────────────┬──────────┐
  │  Last decrement    │ Log freq │
  │  time (16 bits)    │ (8 bits) │
  └────────────────────┴──────────┘

  Frequency counter (0-255) uses logarithmic increment:
    - P(increment) = 1 / (old_counter * lfu_log_factor + 1)
    - Default lfu_log_factor = 10
    - Counter of 255 represents ~1M accesses

  Decay: counter is halved every lfu_decay_time minutes.
  This ensures keys that were hot in the past but are cold now get evicted.
```

---

## 6. Replication & High Availability

### 6.1 Master-Replica Replication

```
  ┌──────────┐       Replication Stream       ┌──────────┐
  │  Master  │ ──────────────────────────────> │ Replica 1│
  │          │                                 │ (read)   │
  │  Writes  │       Replication Stream       ┌──────────┐
  │  + Reads │ ──────────────────────────────> │ Replica 2│
  │          │                                 │ (read)   │
  └──────────┘                                 └──────────┘

  Initial Sync (Full Resynchronization):
  1. Replica sends PSYNC to master.
  2. Master starts BGSAVE (fork + snapshot).
  3. Master sends RDB file to replica.
  4. Master sends buffered writes that occurred during BGSAVE.
  5. Replica loads RDB and applies buffered writes.

  Ongoing Sync (Partial Resynchronization):
  - Master maintains a replication backlog (circular buffer).
  - Each replica tracks its replication offset.
  - On reconnect, replica sends its offset.
  - If offset is in the backlog, master sends just the delta.
  - Otherwise, full resync is required.
```

### 6.2 Async vs Sync Replication Trade-offs

| Aspect            | Asynchronous                        | Synchronous                       |
| ----------------- | ----------------------------------- | --------------------------------- |
| **Write Latency** | Low (master returns immediately)    | High (waits for replica ACK)      |
| **Data Safety**   | Risk of data loss on master failure | No data loss                      |
| **Throughput**    | Higher                              | Lower                             |
| **Availability**  | Higher (replica lag is OK)          | Lower (replica must be reachable) |
| **Redis Default** | Yes (async)                         | No (`WAIT` command for semi-sync) |

**Semi-synchronous with WAIT:**

```
# Write data
SET user:1 "Alice"

# Wait for at least 1 replica to acknowledge, timeout 100ms
WAIT 1 100
# Returns: number of replicas that acknowledged
```

### 6.3 Sentinel Pattern for Failover

Redis Sentinel provides automatic failover and monitoring.

```
  ┌──────────┐    ┌──────────┐    ┌──────────┐
  │Sentinel 1│    │Sentinel 2│    │Sentinel 3│
  │          │<-->│          │<-->│          │
  └────┬─────┘    └────┬─────┘    └────┬─────┘
       │               │               │
       │  monitors     │  monitors     │  monitors
       │               │               │
  ┌────▼─────┐    ┌────▼─────┐    ┌────▼─────┐
  │  Master  │───>│ Replica 1│    │ Replica 2│
  │  (6379)  │───>│  (6380)  │    │  (6381)  │
  └──────────┘    └──────────┘    └──────────┘

  Failover Process:
  ─────────────────────────────────────────────────────

  1. Sentinel detects master is down (SDOWN - subjective down).
  2. Multiple Sentinels agree (ODOWN - objective down, quorum reached).
  3. One Sentinel is elected leader (Raft-like consensus).
  4. Leader selects best replica:
     - Highest priority (lowest replica-priority)
     - Most data replicated (highest replication offset)
     - Smallest runid (tiebreaker)
  5. Elected replica is promoted to master (REPLICAOF NO ONE).
  6. Other replicas are reconfigured to replicate from new master.
  7. Sentinels update their config. Clients are notified.

  Timeline:
  [0s] Master fails
  [5s] Sentinel SDOWN (after down-after-milliseconds)
  [6s] ODOWN consensus reached
  [7s] Sentinel leader elected
  [8s] New master promoted
  [9s] Clients redirected
  Total: ~10 seconds typical failover time
```

### 6.4 Redis Cluster Mode Architecture

```
  ┌──────────────────────────────────────────────────────┐
  │                Redis Cluster (6 nodes)               │
  │                                                      │
  │   Node A (master)        Node D (replica of A)       │
  │   Slots: 0-5460          Slots: 0-5460 (copy)        │
  │                                                      │
  │   Node B (master)        Node E (replica of B)       │
  │   Slots: 5461-10922      Slots: 5461-10922 (copy)    │
  │                                                      │
  │   Node C (master)        Node F (replica of C)       │
  │   Slots: 10923-16383     Slots: 10923-16383 (copy)   │
  │                                                      │
  │   Gossip Protocol:                                   │
  │   - Every node pings random nodes every second       │
  │   - Shares cluster state, slot ownership, health     │
  │   - Failure detection via gossip (no external svc)   │
  └──────────────────────────────────────────────────────┘

  MOVED Redirection:
  Client -> Node A: GET user:500  (slot 7231)
  Node A -> Client: -MOVED 7231 10.0.0.2:6379
  Client -> Node B: GET user:500  (correct node)
  Client caches: slot 7231 -> Node B
```

### 6.5 Split-Brain Problem

Split-brain occurs when network partitions cause multiple nodes to believe they are master.

```
  Partition Scenario:

  ┌──────────────────┐      NETWORK      ┌──────────────────┐
  │  Datacenter 1    │     PARTITION      │  Datacenter 2    │
  │                  │    ──── X ────     │                  │
  │  Master (old)    │                    │  Replica         │
  │  Sentinel 1      │                    │  Sentinel 2      │
  │                  │                    │  Sentinel 3      │
  └──────────────────┘                    └──────────────────┘

  DC2 promotes replica to new master (quorum met in DC2).
  DC1's old master still accepts writes (clients in DC1 can reach it).
  TWO MASTERS! Data divergence!
```

**Solutions:**

| Solution                            | How It Works                                                                                   |
| ----------------------------------- | ---------------------------------------------------------------------------------------------- |
| `min-replicas-to-write`             | Master rejects writes if fewer than N replicas are connected.                                  |
| `min-replicas-max-lag`              | Master rejects writes if replica lag exceeds N seconds.                                        |
| **Quorum-based writes**             | Require majority acknowledgment before confirming writes.                                      |
| **Fencing tokens**                  | New master gets a monotonically increasing token; old master's writes are rejected by storage. |
| **NODE_TIMEOUT + cluster settings** | Tune cluster-node-timeout to balance between false positives and detection speed.              |

**Configuration:**

```
# Require at least 1 replica with lag < 10 seconds
CONFIG SET min-replicas-to-write 1
CONFIG SET min-replicas-max-lag 10
```

---

## 7. Persistence

### 7.1 Snapshotting (RDB)

RDB creates point-in-time snapshots of the dataset.

```
  ┌──────────┐    fork()     ┌──────────────┐
  │  Redis   │ ──────────>   │ Child Process │
  │  Master  │               │              │
  │ (serves  │               │  Writes RDB  │
  │  traffic)│               │  file to disk│
  └──────────┘               └──────┬───────┘
       │                            │
       │ Copy-on-Write (COW)        │
       │ pages shared until         │
       │ modified                   ▼
       │                      ┌──────────┐
       │                      │ dump.rdb │
       │                      │ (binary) │
       │                      └──────────┘
       │
  Timeline:
  [T0] BGSAVE triggered (manual or by save rule)
  [T0] fork() — near-instant (COW, no data copy)
  [T0-T1] Child serializes all data to temp file
  [T1] Rename temp file to dump.rdb (atomic)
  [T1] Child exits
```

**Configuration:**

```
save 900 1       # Snapshot if 1+ key changed in 900 seconds
save 300 10      # Snapshot if 10+ keys changed in 300 seconds
save 60 10000    # Snapshot if 10000+ keys changed in 60 seconds

rdbcompression yes
rdbchecksum yes
dbfilename dump.rdb
dir /var/lib/redis
```

**Pros:**

- Compact single-file backup, easy to transfer.
- Fast restart (load binary file).
- Minimal performance impact (child process does the work).

**Cons:**

- Data loss between snapshots (could be minutes).
- fork() can be slow with large datasets (memory page table copy).
- Memory spike: COW can double memory usage under heavy writes during BGSAVE.

### 7.2 Append-Only File (AOF)

AOF logs every write operation.

```
  ┌──────────┐   every write    ┌───────────────┐
  │  Redis   │ ──────────────>  │  AOF Buffer   │
  │  Master  │                  └───────┬───────┘
  └──────────┘                          │
                                        │ fsync policy
                              ┌─────────▼─────────┐
                              │   appendonly.aof   │
                              │                    │
                              │ *3\r\n             │
                              │ $3\r\n             │
                              │ SET\r\n            │
                              │ $5\r\n             │
                              │ user1\r\n          │
                              │ $5\r\n             │
                              │ Alice\r\n          │
                              │ *3\r\n             │
                              │ $3\r\n             │
                              │ SET\r\n            │
                              │ ...                │
                              └────────────────────┘

  fsync Policies:
  ┌─────────────┬──────────────────────────────────────────┐
  │ always      │ fsync after every write. Safest, slowest.│
  │ everysec    │ fsync once per second. Good trade-off.   │
  │ no          │ Let OS decide. Fastest, least safe.      │
  └─────────────┴──────────────────────────────────────────┘
```

**AOF Rewrite (Compaction):**

```
  Original AOF:          Rewritten AOF:
  SET x 1                SET x 3
  SET x 2                SET y "hello"
  SET x 3
  SET y "hello"
  DEL z
  SET z "world"
  DEL z

  Rewrite collapses history to current state.
  Triggered when AOF size > auto-aof-rewrite-percentage of last rewrite size.
```

**Configuration:**

```
appendonly yes
appendfsync everysec
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb
```

### 7.3 Hybrid Approach (RDB + AOF)

Redis 4.0+ supports a hybrid persistence mode:

```
  ┌────────────────────────────────────────┐
  │            Hybrid AOF File             │
  │                                        │
  │  ┌──────────────────────────────────┐  │
  │  │  RDB Preamble (binary snapshot)  │  │
  │  │  - Full state at rewrite time    │  │
  │  │  - Fast to load                  │  │
  │  └──────────────────────────────────┘  │
  │  ┌──────────────────────────────────┐  │
  │  │  AOF Tail (text commands)        │  │
  │  │  - Commands since snapshot       │  │
  │  │  - Keeps durability of AOF       │  │
  │  └──────────────────────────────────┘  │
  └────────────────────────────────────────┘

  Benefits:
  - Fast restart (load RDB preamble)
  - Minimal data loss (AOF tail has recent commands)
  - Best of both worlds
```

**Configuration:**

```
aof-use-rdb-preamble yes
```

### 7.4 Persistence Trade-offs

| Aspect            | RDB                | AOF (everysec)       | Hybrid (RDB + AOF) |
| ----------------- | ------------------ | -------------------- | ------------------ |
| **Data Loss**     | Minutes of data    | ~1 second of data    | ~1 second of data  |
| **Restart Speed** | Fast (binary load) | Slow (replay log)    | Fast               |
| **Disk Usage**    | Compact            | Larger (grows fast)  | Medium             |
| **Write Perf**    | Minimal impact     | Slight impact        | Slight impact      |
| **Backup**        | Easy (single file) | Harder (growing log) | Medium             |
| **Recommended**   | Caching only       | Data store           | Production default |

---

## 8. Cache Invalidation

### 8.1 TTL-Based Expiration

```
# Set key with TTL
SET session:abc "data" EX 3600        # expires in 1 hour
SET temp:key "data" PX 500            # expires in 500ms
SETEX user:cache:1 300 "profile"      # expires in 5 minutes

# Check remaining TTL
TTL session:abc                        # returns seconds
PTTL session:abc                       # returns milliseconds

# Remove expiration
PERSIST session:abc                    # key lives forever now
```

### 8.2 Active vs Passive Expiration

```
  Passive (Lazy) Expiration:
  ┌──────────┐   GET key   ┌──────────┐
  │  Client   │ ──────────> │  Redis   │
  │           │             │          │
  │           │             │ Is TTL   │
  │           │             │ expired? │
  │           │  (nil)      │ Yes ->   │
  │           │ <────────── │ Delete & │
  └──────────┘             │ return   │
                           │ nil      │
                           └──────────┘
  Problem: Keys that are never accessed stay in memory!

  Active Expiration (Redis background task):
  ┌─────────────────────────────────────────────┐
  │  Every 100ms:                                │
  │  1. Sample 20 random keys with TTL set       │
  │  2. Delete all expired keys in the sample    │
  │  3. If > 25% were expired, repeat from step 1│
  │     (loop until < 25% expired or time limit) │
  │                                              │
  │  This probabilistically reclaims memory      │
  │  without scanning all keys.                  │
  └─────────────────────────────────────────────┘
```

### 8.3 Event-Driven Invalidation

```
  ┌──────────┐  update   ┌──────────┐  invalidate  ┌──────────┐
  │  Service  │ ──────>  │ Database │ ───event───> │  Cache   │
  │    A      │          │          │              │          │
  └──────────┘          └──────────┘              └──────────┘

  Implementation Options:
  1. Database triggers -> Message queue -> Cache delete
  2. CDC (Change Data Capture) via Debezium/Maxwell -> Cache delete
  3. Application-level pub/sub (Redis PUBLISH)
  4. Redis Keyspace Notifications

  Redis Keyspace Notifications:
    CONFIG SET notify-keyspace-events KEA

    SUBSCRIBE __keyevent@0__:set
    SUBSCRIBE __keyevent@0__:expired
    SUBSCRIBE __keyevent@0__:del
```

### 8.4 Cache Stampede Problem and Solutions

A cache stampede (thundering herd) occurs when a popular key expires and many concurrent requests all miss the cache and hit the database simultaneously.

```
  Normal:      Key expires -> 1 request rebuilds cache

  Stampede:    Key expires -> 1000 requests all miss ->
               1000 DB queries -> DB overloaded!

  ┌──────────┐
  │ Request 1│──┐
  ├──────────┤  │         ┌──────────┐
  │ Request 2│──┤ Cache   │          │    1000 simultaneous
  ├──────────┤  │ MISS!   │ Database │ <── queries!
  │ Request 3│──┤ ──────> │          │    DB OVERLOADED
  ├──────────┤  │         │          │
  │  ...     │──┤         └──────────┘
  ├──────────┤  │
  │Request N │──┘
  └──────────┘
```

**Solution 1: Mutex / Distributed Lock**

```python
def get_with_lock(key):
    value = redis.get(key)
    if value is not None:
        return value

    lock_key = f"lock:{key}"
    if redis.set(lock_key, "1", nx=True, ex=10):  # acquired lock
        try:
            value = db.query(key)
            redis.setex(key, 3600, value)
            return value
        finally:
            redis.delete(lock_key)
    else:
        # Another thread is rebuilding; wait and retry
        time.sleep(0.05)
        return get_with_lock(key)
```

**Solution 2: Early / Probabilistic Expiration**

```python
def get_with_early_expiry(key):
    data = redis.get(key)  # returns {value, ttl_set_at, actual_ttl}
    if data is None:
        return rebuild_and_cache(key)

    parsed = json.loads(data)
    remaining_ttl = parsed["actual_ttl"] - (time.time() - parsed["ttl_set_at"])
    # Probabilistically refresh before expiry
    # probability increases as TTL decreases
    beta = 1  # tuning parameter
    if remaining_ttl - beta * math.log(random.random()) <= 0:
        return rebuild_and_cache(key)

    return parsed["value"]
```

**Solution 3: Background Refresh**

```python
# Separate worker process
def cache_refresh_worker():
    while True:
        keys_near_expiry = get_keys_expiring_soon(threshold=60)
        for key in keys_near_expiry:
            value = db.query(key)
            redis.setex(key, 3600, value)
        time.sleep(10)
```

---

## 9. Consistency

### 9.1 Eventual Consistency Model

Distributed caches are inherently eventually consistent. Replicas lag behind the master.

```
  Timeline:

  Master:   SET x=1  ──>  SET x=2  ──>  SET x=3
                  \            \             \
                   \            \             \
  Replica:  x=0 ──> x=1 ──────> x=2 ──────> x=3
                     ^           ^
                     │           │
                 Replication  Replication
                    lag          lag

  During the lag window, reads from replica see stale data.
  Typical lag: < 1ms (same DC), 10-100ms (cross DC).
```

### 9.2 Read-Your-Writes Consistency

Ensures a client always sees its own writes.

```
  Approach 1: Sticky reads
    - After a write, read from master for a short window.
    - Client tracks "last write timestamp."
    - If replica's offset < client's write offset, read from master.

  Approach 2: WAIT command
    - After SET, issue WAIT 1 0 (wait for 1 replica, no timeout).
    - Guarantees at least 1 replica has the data before reading.

  Approach 3: Version-based
    - Each write returns a version/offset.
    - Client sends version with read request.
    - Replica rejects read if its version is behind; client falls back to master.
```

### 9.3 Cache-Database Consistency Patterns

The fundamental challenge: keeping cache and DB in sync during concurrent operations.

**Problem Scenario (Cache-Aside):**

```
  Thread A (read):              Thread B (write):
  1. Cache MISS for key X
                                2. UPDATE DB: X = "new"
                                3. DELETE cache key X
  4. Read DB: X = "new"? NO!
     (Read old value if DB
      read started before
      Thread B's commit)
  5. SET cache X = "old"        (stale!)
```

### 9.4 Double-Delete Strategy

```
  Write Path with Double Delete:

  1. DELETE cache key
  2. UPDATE database
  3. Sleep for a short delay (e.g., 500ms — slightly longer than read DB latency)
  4. DELETE cache key again (catches stale reads from step 1-2 window)

  def update_with_double_delete(key, new_value):
      redis.delete(key)                        # first delete
      db.update(key, new_value)                # update DB
      schedule_delayed(500, redis.delete, key) # second delete after delay
```

```
  Thread A (read):              Thread B (write):
  1. Cache MISS for key X
                                2. DELETE cache X  (1st delete)
                                3. UPDATE DB: X = "new"
  4. Read DB: X = "old"
     (stale read!)
  5. SET cache X = "old"
                                6. (500ms later) DELETE cache X  (2nd delete)
  7. Next read: Cache MISS
  8. Read DB: X = "new" (correct!)
  9. SET cache X = "new"

  The second delete ensures the stale value from step 5 is cleaned up.
```

**Alternative: Delay + Delete via Message Queue**

```
  ┌────────┐ 1.Delete ┌───────┐ 2.Update ┌────────┐
  │ Service│ ───────> │ Cache │          │   DB   │
  │        │ ──────────────────────────> │        │
  │        │ 3.Publish delayed delete    │        │
  │        │ ───────> ┌─────────────┐    │        │
  └────────┘          │ Message     │    └────────┘
                      │ Queue       │
                      │ (500ms      │    ┌───────┐
                      │  delay)     │──> │ Cache │
                      └─────────────┘    │DELETE │
                                         └───────┘
```

---

## 10. Scaling

### 10.1 Horizontal Scaling with Consistent Hashing

```
  Adding a New Node:

  Before (3 masters):
  ┌─────────┐  ┌─────────┐  ┌─────────┐
  │ Node A  │  │ Node B  │  │ Node C  │
  │ 0-5460  │  │5461-10922│ │10923-16383│
  └─────────┘  └─────────┘  └─────────┘

  Add Node D — reshard slots:
  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐
  │ Node A  │  │ Node B  │  │ Node C  │  │ Node D  │
  │ 0-4095  │  │4096-8191│  │8192-12287│ │12288-16383│
  └─────────┘  └─────────┘  └─────────┘  └─────────┘

  Migration is live:
  - Slots migrate one at a time.
  - During migration, ASK redirect guides clients to the new owner.
  - No downtime.
```

**Redis Cluster commands:**

```
# Add a new node to the cluster
redis-cli --cluster add-node new_host:6379 existing_host:6379

# Reshard slots
redis-cli --cluster reshard existing_host:6379

# Check cluster health
redis-cli --cluster check host:6379
```

### 10.2 Sharding Approaches

```
  1. Client-Side Sharding
  ┌──────────┐
  │  Client  │──── hash(key) ──> route to correct node
  │ (smart)  │
  └──────────┘
  Pros: No proxy overhead, lowest latency.
  Cons: Client must know topology; harder to manage.

  2. Proxy-Based Sharding
  ┌──────────┐    ┌───────────┐    ┌──────────┐
  │  Client  │──> │  Proxy    │──> │ Cache    │
  │ (simple) │    │ (twemproxy│    │ Nodes    │
  └──────────┘    │  / envoy) │    └──────────┘
                  └───────────┘
  Pros: Clients are simple; topology changes in proxy only.
  Cons: Extra hop adds latency; proxy is a bottleneck/SPOF.

  3. Cluster Mode (Redis Cluster)
  ┌──────────┐    ┌──────────┐
  │  Client  │──> │ Any Node │──> MOVED/ASK redirect
  │ (cluster │    │ in       │    if wrong node
  │  aware)  │    │ cluster  │
  └──────────┘    └──────────┘
  Pros: No proxy; nodes coordinate among themselves.
  Cons: Multi-key operations limited to same slot.
```

**Comparison:**

| Aspect            | Client-Side          | Proxy-Based       | Cluster Mode     |
| ----------------- | -------------------- | ----------------- | ---------------- |
| Latency           | Lowest               | +1 hop            | +redirect (rare) |
| Client Complexity | High                 | Low               | Medium           |
| Topology Changes  | Client update needed | Proxy update only | Automatic        |
| Multi-key ops     | Limited              | Limited           | Same-slot only   |
| Scalability       | Good                 | Proxy bottleneck  | Excellent        |

### 10.3 Connection Pooling

```
  Without pooling:                      With pooling:
  ┌────────┐  new conn   ┌──────┐      ┌────────┐          ┌──────┐
  │Request │────────────>│Redis │      │Request │          │Redis │
  │  1     │<────────────│      │      │  1     │──┐       │      │
  └────────┘  close      └──────┘      └────────┘  │  get  │      │
  ┌────────┐  new conn   ┌──────┐      ┌────────┐  ├──────>│      │
  │Request │────────────>│Redis │      │  ...   │  │return │      │
  │  2     │<────────────│      │      └────────┘  │       │      │
  └────────┘  close      └──────┘      ┌────────┐  │       │      │
                                       │Request │──┘       │      │
  TCP handshake per request!           │  N     │          │      │
  ~0.5ms overhead each time.           └────────┘          └──────┘
                                       Connection Pool (10-50 conns)
                                       Reuses existing connections.
```

**Configuration (Jedis example):**

```java
JedisPoolConfig config = new JedisPoolConfig();
config.setMaxTotal(50);           // max connections in pool
config.setMaxIdle(20);            // max idle connections
config.setMinIdle(5);             // maintain at least 5 connections
config.setTestOnBorrow(true);     // validate before use
config.setMaxWaitMillis(2000);    // wait 2s for a connection

JedisPool pool = new JedisPool(config, "redis-host", 6379);
```

### 10.4 Pipeline and Batch Operations

```
  Without Pipeline:                With Pipeline:
  Client         Redis             Client         Redis
    │  SET a 1  ──>│                 │  SET a 1  ──>│
    │  <── OK      │                 │  SET b 2  ──>│
    │  SET b 2  ──>│                 │  GET a    ──>│
    │  <── OK      │                 │  GET b    ──>│
    │  GET a    ──>│                 │              │
    │  <── "1"     │                 │  <── OK      │
    │  GET b    ──>│                 │  <── OK      │
    │  <── "2"     │                 │  <── "1"     │
                                     │  <── "2"     │
  4 round trips                    1 round trip
  ~4ms total (1ms RTT each)       ~1ms total
```

**Redis Pipeline Example:**

```python
pipe = redis.pipeline(transaction=False)
pipe.set("key1", "value1")
pipe.set("key2", "value2")
pipe.get("key1")
pipe.get("key2")
results = pipe.execute()
# results = [True, True, "value1", "value2"]
```

**MGET/MSET (native batch):**

```
MSET user:1:name "Alice" user:1:age "30" user:1:city "NYC"
MGET user:1:name user:1:age user:1:city
```

---

## 11. Deployment Architecture

### 11.1 Single-Region Production Deployment

```
  ┌─────────────────────────────────────────────────────────────────────┐
  │                        Load Balancer / DNS                         │
  └─────────────────────────┬───────────────────────────────────────────┘
                            │
  ┌─────────────────────────▼───────────────────────────────────────────┐
  │                    Application Tier                                 │
  │                                                                     │
  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
  │  │ App Svc  │  │ App Svc  │  │ App Svc  │  │ App Svc  │           │
  │  │ + L1     │  │ + L1     │  │ + L1     │  │ + L1     │           │
  │  │ (local   │  │ (local   │  │ (local   │  │ (local   │           │
  │  │  cache)  │  │  cache)  │  │  cache)  │  │  cache)  │           │
  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘           │
  │       │              │              │              │                │
  └───────┼──────────────┼──────────────┼──────────────┼────────────────┘
          │              │              │              │
  ┌───────▼──────────────▼──────────────▼──────────────▼────────────────┐
  │                      Redis Cluster (L2 Cache)                       │
  │                                                                     │
  │  AZ-1                    AZ-2                    AZ-3               │
  │  ┌────────────┐          ┌────────────┐          ┌────────────┐    │
  │  │ Master A   │          │ Master B   │          │ Master C   │    │
  │  │ Replica B' │          │ Replica C' │          │ Replica A' │    │
  │  └────────────┘          └────────────┘          └────────────┘    │
  │                                                                     │
  │  Cross-AZ replication ensures HA even if one AZ fails.             │
  │  Masters and their replicas are in DIFFERENT AZs.                  │
  └─────────────────────────────────────────────────────────────────────┘
          │
  ┌───────▼─────────────────────────────────────────────────────────────┐
  │                      Database Tier (Source of Truth)                 │
  │  ┌──────────┐  ┌──────────┐  ┌──────────┐                         │
  │  │ Primary  │  │ Replica  │  │ Replica  │                         │
  │  │   DB     │  │   DB     │  │   DB     │                         │
  │  └──────────┘  └──────────┘  └──────────┘                         │
  └─────────────────────────────────────────────────────────────────────┘
```

### 11.2 Multi-Region Deployment

```
  ┌────────────────────────────────────────────────────────────────────┐
  │                      Region: US-East                               │
  │                                                                    │
  │  ┌─────────────┐         ┌──────────────────────────┐             │
  │  │ App Servers │────────>│  Local Redis Cluster     │             │
  │  │ + L1 Cache  │         │  (Masters + Replicas)    │             │
  │  └─────────────┘         └────────────┬─────────────┘             │
  │                                        │                          │
  └────────────────────────────────────────┼──────────────────────────┘
                                           │ Cross-region
                                           │ replication
                                           │ (async)
  ┌────────────────────────────────────────┼──────────────────────────┐
  │                      Region: EU-West   │                          │
  │                                        │                          │
  │  ┌─────────────┐         ┌─────────────▼────────────┐             │
  │  │ App Servers │────────>│  Local Redis Cluster     │             │
  │  │ + L1 Cache  │         │  (Read replicas of       │             │
  │  └─────────────┘         │   US-East masters)       │             │
  │                          └──────────────────────────┘             │
  └────────────────────────────────────────────────────────────────────┘

                                           │
  ┌────────────────────────────────────────┼──────────────────────────┐
  │                      Region: AP-South  │                          │
  │                                        │                          │
  │  ┌─────────────┐         ┌─────────────▼────────────┐             │
  │  │ App Servers │────────>│  Local Redis Cluster     │             │
  │  │ + L1 Cache  │         │  (Read replicas of       │             │
  │  └─────────────┘         │   US-East masters)       │             │
  │                          └──────────────────────────┘             │
  └────────────────────────────────────────────────────────────────────┘

  Active-Active Alternative:
  - Each region has independent masters.
  - CRDT-based conflict resolution (Redis Enterprise Active-Active).
  - Writes go to local master; synced bidirectionally.
  - Last-write-wins or custom merge functions for conflicts.
```

### 11.3 Multi-Tier Caching

```
  Request Flow:

  ┌──────────┐
  │ Client   │
  └────┬─────┘
       │
  ┌────▼─────────────────────────────┐
  │  L1: In-Process Cache            │
  │  (Caffeine / Guava / dict)       │
  │  - Latency: ~100 nanoseconds    │
  │  - Size: 100 MB per instance     │
  │  - TTL: 10-60 seconds           │
  │  - Hit rate: ~80%               │
  └────┬─────────────────────────────┘
       │ L1 Miss
  ┌────▼─────────────────────────────┐
  │  L2: Distributed Cache (Redis)   │
  │  - Latency: ~0.5 milliseconds   │
  │  - Size: TBs across cluster     │
  │  - TTL: minutes to hours        │
  │  - Hit rate: ~95% (after L1)    │
  └────┬─────────────────────────────┘
       │ L2 Miss
  ┌────▼─────────────────────────────┐
  │  L3: CDN / Edge Cache            │
  │  (For static/semi-static data)   │
  │  - Latency: 1-50 ms             │
  │  - Geographically distributed   │
  └────┬─────────────────────────────┘
       │ L3 Miss
  ┌────▼─────────────────────────────┐
  │  Database (Source of Truth)       │
  │  - Latency: 5-50 milliseconds   │
  │  - Always consistent            │
  └──────────────────────────────────┘

  Overall cache hit rate: 1 - (1-0.80) * (1-0.95) = 99%
  Only 1% of requests reach the database.
```

---

## 12. Common Interview Follow-ups

### 12.1 How to Handle Cache Avalanche?

**Problem:** Many keys expire at the same time, causing a surge of DB requests.

```
  Normal:     Keys expire gradually -> DB load is smooth
  Avalanche:  Bulk expiration -> ALL requests hit DB -> DB crashes

  Timeline:
  ┌──────────────────────────────────────────────┐
  │  t=0: 1M keys cached with TTL=3600           │
  │  t=3600: ALL 1M keys expire simultaneously!  │
  │  → 1M cache misses                           │
  │  → 1M DB queries                             │
  │  → DB overloaded                             │
  └──────────────────────────────────────────────┘
```

**Solutions:**

| Solution                     | Implementation                                          |
| ---------------------------- | ------------------------------------------------------- |
| **Random TTL jitter**        | `TTL = base_ttl + random(0, jitter_range)`              |
| **Staggered warm-up**        | Pre-load cache in batches during cold start             |
| **Circuit breaker**          | Stop DB queries when error rate exceeds threshold       |
| **Rate limiting on DB**      | Cap the number of concurrent DB queries                 |
| **Fallback / degraded mode** | Return stale data or default values during avalanche    |
| **Multi-tier cache**         | L1 (local) absorbs some load even if L2 (Redis) is cold |

```python
import random

def set_with_jitter(key, value, base_ttl=3600, jitter=300):
    ttl = base_ttl + random.randint(0, jitter)
    redis.setex(key, ttl, value)
```

---

### 12.2 How to Handle Cache Penetration?

**Problem:** Requests for non-existent keys always miss the cache and hit the DB. Malicious actors can exploit this.

```
  Attacker sends: GET user:-999999 (non-existent user)
  1. Cache MISS (key does not exist)
  2. DB MISS (user does not exist)
  3. Nothing cached (there is no data to cache!)
  4. Repeat: every request hits the DB

  This bypasses the cache entirely.
```

**Solutions:**

| Solution               | Description                                                   |
| ---------------------- | ------------------------------------------------------------- |
| **Cache null results** | Store `NULL` / empty marker with short TTL for known misses   |
| **Bloom filter**       | Check membership before querying — if not in filter, skip DB  |
| **Input validation**   | Reject obviously invalid keys (negative IDs, invalid formats) |
| **Rate limiting**      | Limit requests per client/IP to prevent abuse                 |

**Bloom Filter Approach:**

```
  ┌──────────┐   key in    ┌──────────┐   yes   ┌──────────┐
  │  Client  │ ──────────> │  Bloom   │ ──────> │  Cache   │
  │          │             │  Filter  │         │          │
  └──────────┘             └──────────┘         └──────────┘
                               │ no
                               ▼
                           Return 404
                         (skip DB entirely)

  Bloom Filter Properties:
  - False positives possible (key might not exist but filter says yes)
  - False negatives impossible (if filter says no, key definitely does not exist)
  - Space efficient: ~1.2 bytes per element for 1% false positive rate
  - 1 billion keys: ~1.2 GB of memory for the filter
```

```python
from pybloom_live import BloomFilter

bf = BloomFilter(capacity=100_000_000, error_rate=0.01)

# Populate during startup
for key in db.get_all_keys():
    bf.add(key)

def get_with_bloom_filter(key):
    if key not in bf:
        return None  # definitely does not exist

    cached = redis.get(key)
    if cached is not None:
        return cached

    value = db.query(key)
    if value is None:
        # Cache the null to prevent repeated DB queries
        redis.setex(key, 60, "NULL_MARKER")
        return None

    redis.setex(key, 3600, value)
    return value
```

---

### 12.3 How to Handle Hot Keys?

**Problem:** A single key receives extremely high traffic, overwhelming the node that owns it.

**Detailed Solutions:**

```
  Solution 1: Read replicas for hot keys

  Client ──> random(Master, Replica1, Replica2) ──> GET hot_key
  Spreads read load across 3 nodes instead of 1.

  Solution 2: Local caching (L1) with short TTL

  ┌──────────────────────────────┐
  │  Application Server          │
  │  ┌────────────────────────┐  │
  │  │ Local Cache (L1)       │  │
  │  │ hot_key -> value       │  │
  │  │ TTL: 1 second          │  │
  │  └────────────────────────┘  │
  └──────────────────────────────┘
  99% of requests served from L1. Only 1 request/second hits Redis.

  Solution 3: Key replication / sharding

  hot_key:0  ->  Node A
  hot_key:1  ->  Node B
  hot_key:2  ->  Node C

  Client reads from hot_key:{random(0,2)}
  Writes must update all N copies.

  Solution 4: Redis CLIENT TRACKING (server-assisted client caching)

  CLIENT TRACKING ON REDIRECT <client-id>
  - Redis tracks which keys a client has cached locally.
  - When the key changes, Redis sends an invalidation message.
  - Client invalidates its local copy.
  - Dramatically reduces load on Redis for hot keys.
```

---

### 12.4 How to Implement Distributed Locking?

**Simple approach (SET NX with expiration):**

```python
def acquire_lock(lock_name, ttl=10):
    token = str(uuid.uuid4())
    acquired = redis.set(
        f"lock:{lock_name}",
        token,
        nx=True,   # only set if not exists
        ex=ttl     # auto-expire to prevent deadlocks
    )
    return token if acquired else None

def release_lock(lock_name, token):
    # Lua script for atomic check-and-delete
    script = """
    if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("DEL", KEYS[1])
    else
        return 0
    end
    """
    redis.eval(script, 1, f"lock:{lock_name}", token)
```

**Redlock Algorithm (Distributed, fault-tolerant):**

```
  Redlock uses N independent Redis masters (typically 5):

  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
  │ Redis 1 │ │ Redis 2 │ │ Redis 3 │ │ Redis 4 │ │ Redis 5 │
  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘

  Algorithm:
  1. Get current time T1.
  2. Try to acquire lock on ALL N instances with same key and random value.
     Use short timeout per instance (5-50ms).
  3. Lock is acquired if:
     - Acquired on majority (N/2 + 1 = 3) of instances.
     - Total time elapsed (T2 - T1) < lock TTL.
  4. Effective lock TTL = original TTL - elapsed time.
  5. If lock acquisition fails, release on ALL instances.

  Safety Properties:
  - Mutual exclusion: Only one client holds the lock.
  - Fault tolerance: Works even if 2 of 5 instances are down.
  - Deadlock-free: Locks auto-expire.

  Controversy (Martin Kleppmann's critique):
  - Clock drift can cause safety violations.
  - GC pauses can cause a client to use an expired lock.
  - Fencing tokens are safer for correctness-critical applications.
```

**Fencing Token Approach:**

```
  ┌──────────┐   acquire    ┌──────────┐   token=33  ┌──────────┐
  │ Client A │ ──────────>  │  Lock    │ ──────────> │ Storage  │
  │          │              │  Service │             │          │
  └──────────┘              └──────────┘             │ Accepts  │
                                                     │ token≥33 │
  ┌──────────┐   acquire    ┌──────────┐   token=34  │          │
  │ Client B │ ──────────>  │  Lock    │ ──────────> │ Accepts  │
  │          │              │  Service │             │ token≥34 │
  └──────────┘              └──────────┘             └──────────┘

  If Client A tries to use token=33 after Client B got token=34,
  storage rejects the write. Safety guaranteed.
```

---

### 12.5 How to Implement Pub/Sub with Cache?

**Redis Pub/Sub:**

```
  ┌──────────┐  PUBLISH ch1 "msg"  ┌──────────┐
  │Publisher │ ──────────────────> │  Redis   │
  └──────────┘                     │          │
                                   │  Routes  │
                                   │  message │
                                   │  to all  │
                                   │  subs    │
                                   └────┬─────┘
                            ┌───────────┼───────────┐
                            ▼           ▼           ▼
                      ┌──────────┐ ┌──────────┐ ┌──────────┐
                      │ Sub 1   │ │ Sub 2   │ │ Sub 3   │
                      │SUBSCRIBE│ │SUBSCRIBE│ │SUBSCRIBE│
                      │ ch1     │ │ ch1     │ │ ch1     │
                      └──────────┘ └──────────┘ └──────────┘
```

**Commands:**

```
# Publisher
PUBLISH notifications "New order received"

# Subscriber
SUBSCRIBE notifications
PSUBSCRIBE user:*:events    # pattern-based subscription
```

**Redis Streams (persistent, consumer groups):**

```
  ┌──────────┐  XADD stream  ┌────────────────────────────┐
  │Producer │ ──────────────> │  Redis Stream              │
  └──────────┘                │                            │
                              │  ID: 1678901234567-0       │
                              │  {"event":"order","id":42} │
                              │                            │
                              │  ID: 1678901234568-0       │
                              │  {"event":"payment","ok":1}│
                              └───────────┬────────────────┘
                                          │
                     ┌────────────────────┼────────────────────┐
                     ▼                    ▼                    ▼
              ┌────────────┐       ┌────────────┐       ┌────────────┐
              │ Consumer   │       │ Consumer   │       │ Consumer   │
              │ Group A    │       │ Group A    │       │ Group B    │
              │ Worker 1   │       │ Worker 2   │       │ Worker 1   │
              └────────────┘       └────────────┘       └────────────┘

  Key Differences from Pub/Sub:
  - Messages are persisted (survives restarts).
  - Consumer groups enable work distribution (each msg processed once per group).
  - Acknowledgment (XACK) ensures at-least-once delivery.
  - Can replay messages from any point in time.
```

**Redis Streams Commands:**

```
# Producer
XADD mystream * event "order_created" order_id "42"

# Create consumer group
XGROUP CREATE mystream mygroup $ MKSTREAM

# Consumer reads (blocking)
XREADGROUP GROUP mygroup worker1 COUNT 10 BLOCK 5000 STREAMS mystream >

# Acknowledge processing
XACK mystream mygroup 1678901234567-0
```

---

## Quick Reference: Redis Commands Cheat Sheet

```
  ┌───────────────────────────────────────────────────────────────────┐
  │  DATA TYPES                                                       │
  │  String:  SET k v | GET k | INCR k | MSET k1 v1 k2 v2           │
  │  Hash:    HSET h f v | HGET h f | HGETALL h | HDEL h f          │
  │  List:    LPUSH l v | RPOP l | LRANGE l 0 -1 | LLEN l           │
  │  Set:     SADD s v | SMEMBERS s | SINTER s1 s2 | SCARD s        │
  │  ZSet:    ZADD z score v | ZRANGE z 0 -1 | ZRANGEBYSCORE z 0 10 │
  │                                                                   │
  │  TTL / EXPIRATION                                                 │
  │  EXPIRE k 60 | TTL k | PERSIST k | SETEX k 60 v                 │
  │                                                                   │
  │  TRANSACTIONS                                                     │
  │  MULTI | SET k1 v1 | SET k2 v2 | EXEC                           │
  │  WATCH k | MULTI | ... | EXEC (optimistic locking)              │
  │                                                                   │
  │  CLUSTER                                                          │
  │  CLUSTER INFO | CLUSTER NODES | CLUSTER SLOTS                   │
  │  CLUSTER KEYSLOT key | CLUSTER SETSLOT                          │
  │                                                                   │
  │  MONITORING                                                       │
  │  INFO all | SLOWLOG GET 10 | CLIENT LIST                        │
  │  MEMORY USAGE key | DBSIZE | MONITOR (debug only!)              │
  └───────────────────────────────────────────────────────────────────┘
```

---

## Summary Decision Framework

```
  Interview Question                          Key Points to Mention
  ─────────────────────────────────────────────────────────────────────
  "Design a cache system"                     → Cache strategies, LRU,
                                                consistent hashing, replication

  "How would you scale it?"                   → Sharding (hash slots),
                                                horizontal scaling, connection
                                                pooling, pipeline

  "How to ensure consistency?"                → Cache-aside + double-delete,
                                                eventual consistency, WAIT cmd

  "What about availability?"                  → Replication, Sentinel failover,
                                                cross-AZ placement, split-brain
                                                mitigation

  "What about persistence?"                   → RDB + AOF hybrid, trade-offs
                                                between durability and perf

  "How to handle failures?"                   → Cache avalanche (jitter),
                                                penetration (bloom filter),
                                                stampede (mutex/early-expire)

  "Distributed locking?"                      → SET NX + EX, Lua for release,
                                                Redlock for multi-node,
                                                fencing tokens

  "Real-time features?"                       → Pub/Sub for fire-and-forget,
                                                Streams for persistent messaging
                                                with consumer groups
```
