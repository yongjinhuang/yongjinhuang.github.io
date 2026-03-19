# Memcached

Memcached is the original distributed caching system, created by Brad Fitzpatrick for LiveJournal in 2003. It does one thing and does it well: high-performance, multi-threaded, in-memory key-value caching. Facebook (Meta) runs the world's largest Memcached deployment.

---

## Table of Contents

1. [Architecture](#architecture)
2. [Slab Allocator](#slab-allocator)
3. [Consistent Hashing](#consistent-hashing)
4. [Multi-Threaded Model](#multi-threaded-model)
5. [Memcached vs Redis](#memcached-vs-redis)
6. [Common Interview Questions](#common-interview-questions)

---

## Architecture

```
+--Client Library--+
| Consistent hash  |  <-- Client decides which server to talk to
| ring             |
+--+-------+-------+
   |       |       |
   v       v       v
+------+ +------+ +------+
|Server| |Server| |Server|  <-- Servers don't communicate with each other
| 1    | | 2    | | 3    |      Each is independent
+------+ +------+ +------+
```

**Key insight:** Memcached servers are completely independent. There is no replication, no clustering protocol, no inter-node communication. The client library handles all distribution via consistent hashing.

### Basic Operations

```
SET key 0 3600 5\r\nvalue\r\n    -- store "value" with 3600s TTL
GET key\r\n                       -- retrieve value
DELETE key\r\n                    -- remove key
INCR counter 1\r\n                -- atomic increment
APPEND key more_data\r\n          -- append to existing value
```

---

## Slab Allocator

Memcached pre-allocates memory in slabs to avoid fragmentation.

```
Slab Class 1: 96 bytes per chunk    [chunk][chunk][chunk]...
Slab Class 2: 120 bytes per chunk   [chunk][chunk][chunk]...
Slab Class 3: 152 bytes per chunk   [chunk][chunk][chunk]...
...
Slab Class N: 1 MB per chunk        [chunk]...

Item "user:123" (80 bytes) -> stored in Slab Class 1 (96 byte chunks)
  Wasted: 16 bytes (internal fragmentation)

Item "post:456" (130 bytes) -> stored in Slab Class 3 (152 byte chunks)
  Wasted: 22 bytes
```

### Slab Properties

| Property | Details |
| -------- | ------- |
| **Growth factor** | 1.25x by default (each class is 25% larger than previous) |
| **Page size** | 1 MB (each slab class allocates in 1 MB pages) |
| **Max item size** | 1 MB (default, configurable) |
| **LRU eviction** | Per slab class (not global) |

### Slab Calcification Problem

```
Problem: Over time, traffic patterns change.
  Initially: many small items -> many small slab pages allocated
  Later: more large items -> no large slab pages available

  Large items get evicted even though small slab classes have free space.

Solutions:
  - slab_reassign: Move pages between slab classes
  - slab_automove: Automatic rebalancing (Memcached 1.4.11+)
  - Restart with new configuration
```

---

## Consistent Hashing

Since Memcached servers don't talk to each other, the client library handles distribution.

```
Client library consistent hash ring:

     Server A (weight: 100 virtual nodes)
    /
   Ring
    \
     Server B (weight: 100 virtual nodes)
      \
       Server C (weight: 100 virtual nodes)

Key "user:123" -> hash -> position on ring -> nearest server clockwise

Adding Server D:
  - Only ~25% of keys remap (1/4 of ring redistributed)
  - Without consistent hashing: nearly all keys would remap
```

### Client Libraries

| Library | Language | Features |
| ------- | -------- | -------- |
| **libmemcached** | C/C++ | Reference implementation |
| **pymemcache** | Python | By Pinterest, consistent hashing |
| **memcached** | Node.js | Connection pooling, consistent hashing |
| **spymemcached** | Java | Async, consistent hashing |
| **Xmemcached** | Java | NIO-based, high performance |

---

## Multi-Threaded Model

```
Memcached:
  Main thread: accepts connections
  Worker threads (N): process commands in parallel
  Each thread: event-driven (libevent)

Redis:
  Single thread: processes ALL commands sequentially
  I/O threads (Redis 6+): handle network read/write only

Result:
  Memcached: Better multi-core utilization for simple operations
  Redis: No lock contention, simpler atomic operations
```

### Thread Scaling

```
-t 4    -- use 4 worker threads (default: 4)
-c 1024 -- max connections (default: 1024)

Typical: 1 thread per CPU core
Modern Memcached: handles 1M+ requests/sec per server
```

---

## Memcached vs Redis

| Feature | Memcached | Redis |
| ------- | --------- | ----- |
| **Data structures** | Strings only | Strings, lists, sets, sorted sets, hashes, streams, etc. |
| **Threading** | Multi-threaded | Single-threaded (I/O threads in Redis 6+) |
| **Persistence** | None | RDB + AOF |
| **Replication** | None (client-side) | Master-replica |
| **Pub/Sub** | No | Yes |
| **Scripting** | No | Lua scripting |
| **Transactions** | No | MULTI/EXEC |
| **Max item size** | 1 MB (default) | 512 MB |
| **Memory efficiency** | Better for simple KV (slab allocator) | More overhead per key |
| **Cluster** | Client-side (consistent hashing) | Server-side (Redis Cluster) |
| **Multi-core** | Native multi-threading | Requires multiple instances |
| **Use case** | Pure caching | Caching + data structures + messaging |

### When to Choose Memcached

- Pure key-value caching (no complex data structures needed)
- Multi-threaded performance is critical
- Simple operational model (no persistence, no replication)
- Memory efficiency for large number of small values
- Legacy systems already using Memcached

### When to Choose Redis

- Need data structures (sorted sets, lists, hashes)
- Need persistence (durability)
- Need pub/sub or streams
- Need atomic operations (Lua scripting)
- Need replication and high availability
- Almost always the better choice for new projects

---

## Common Interview Questions

1. **How does Memcached distribute keys across servers?** Client-side consistent hashing. The client library hashes the key to a position on a hash ring and routes to the nearest server. Servers have no knowledge of each other.

2. **What is the slab allocator?** Memcached pre-allocates memory in slab classes of increasing sizes. Items are stored in the smallest slab class that fits. This prevents memory fragmentation but causes internal fragmentation (wasted space within chunks).

3. **How does Memcached handle a server failure?** Keys on the failed server are lost. The client library remaps those keys to remaining servers (consistent hashing minimizes remapping). There is no automatic failover or replication.

4. **Why is Memcached multi-threaded while Redis is single-threaded?** Memcached's simple key-value operations are easily parallelized. Redis's complex data structures (sorted sets, lists) would require fine-grained locking, making multi-threading complex and potentially slower. Redis chose simplicity and atomicity.

5. **When would you use Memcached over Redis?** When you only need simple key-value caching and want multi-threaded performance. When memory efficiency for many small values matters. When you don't need persistence, replication, or complex data structures.

6. **What is slab calcification?** Over time, memory gets allocated to slab classes that matched early traffic patterns. When traffic changes, you may not have enough memory in the right slab classes. Use slab_automove to rebalance.
