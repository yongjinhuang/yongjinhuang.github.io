# Caching Overview for Backend Engineers

Caching is the single most impactful performance optimization in backend systems. A well-designed cache can reduce database load by 90%+, cut response times from hundreds of milliseconds to single digits, and absorb traffic spikes that would otherwise take down your system.

---

## Caching Landscape

### In-Memory Data Stores

| System | One-Liner | Best For |
| ------ | --------- | -------- |
| **Redis** | Swiss army knife: data structures, caching, pub/sub, streams | Most caching use cases, sessions, rate limiting |
| **Memcached** | Simple, multi-threaded key-value cache | Pure caching with high concurrency |
| **KeyDB** | Multi-threaded Redis fork | Redis workloads needing multi-threading |

### CDN / HTTP Caching

| System | One-Liner | Best For |
| ------ | --------- | -------- |
| **Cloudflare** | Edge CDN with smart caching (Anycast) | Static assets, API response caching |
| **CloudFront** | AWS CDN with Lambda@Edge | AWS-integrated content delivery |
| **Fastly** | Programmable CDN (VCL/Wasm) | Custom cache logic at the edge |
| **Varnish** | HTTP reverse proxy cache | Self-hosted HTTP caching |

### Application-Level

| Library | Language | Best For |
| ------- | -------- | -------- |
| **Caffeine** | Java | In-process cache (JVM) |
| **node-cache** | Node.js | In-process cache (Node) |
| **lru-cache** | Node.js | LRU eviction in-process |
| **Django cache** | Python | Django framework caching |

---

## Caching Patterns at a Glance

| Pattern | Write Path | Read Path | Consistency | Use Case |
| ------- | ---------- | --------- | ----------- | -------- |
| **Cache-Aside** | App writes to DB only | App checks cache, falls back to DB | Eventual | Most common |
| **Read-Through** | N/A | Cache fetches from DB on miss | Eventual | Simplified cache-aside |
| **Write-Through** | App writes to cache, cache writes to DB | From cache | Strong(er) | Write-heavy, consistency matters |
| **Write-Behind** | App writes to cache, cache async writes to DB | From cache | Eventual | High write throughput |
| **Write-Around** | App writes to DB only, cache invalidated | From cache (may miss) | Eventual | Write-once, read-many |

---

## Table of Contents

| # | File | Topic | Key Concepts |
| - | ---- | ----- | ------------ |
| 1 | [01-CACHING-FUNDAMENTALS.md](01-CACHING-FUNDAMENTALS.md) | Fundamentals | Patterns, eviction, stampede, consistent hashing |
| 2 | [02-REDIS.md](02-REDIS.md) | Redis | Data structures, persistence, cluster, Lua scripting |
| 3 | [03-MEMCACHED.md](03-MEMCACHED.md) | Memcached | Slab allocator, multi-threading, vs Redis |
| 4 | [04-CDN-CACHING.md](04-CDN-CACHING.md) | CDN & HTTP | Cache-Control, ETag, edge caching, CDN comparison |
| 5 | [05-APPLICATION-CACHING.md](05-APPLICATION-CACHING.md) | Application Caching | Local caches, cache key design, session caching |
| 6 | [06-CACHING-AT-SCALE.md](06-CACHING-AT-SCALE.md) | Caching at Scale | Multi-tier, hot keys, consistency, capacity planning |
