# Caching Strategies

## What Is It?

Caching is storing a copy of data in a faster location so you don't have to fetch it from the original source every time. Instead of hitting the database for every request, you keep frequently accessed data in memory. Instead of re-downloading images on every page load, the browser stores them locally. Caching exists at every layer of a web application — browser, CDN, application server, database. It's the single most effective way to make things fast.

## Why Should You Care?

Caching can turn a 500ms database query into a 1ms cache hit. It can turn an expensive API call into instant data. It can reduce your server load by 90%. But caching done wrong creates bugs that are maddening to debug — stale data, inconsistencies, cache stampedes, and the classic "Have you tried clearing your cache?" As a developer, understanding when to cache, what to cache, and how to invalidate is a fundamental skill.

## How It Works (The Business Flow)

### The Caching Layers

```
User's Browser ← CDN ← Application Server ← Cache (Redis/Memcached) ← Database
```

Each layer is faster and closer to the user. Data flows backward (from database to user), and caching happens at every step.

### Browser Cache

1. User requests a page. Server responds with the page + cache headers
2. Browser stores the response locally
3. Next time the user visits, browser checks: "Is my cached version still valid?"
4. If valid → use cached version (instant, no network request)
5. If expired → request from server again

Controlled by HTTP headers:
- `Cache-Control: max-age=3600` — Cache for 1 hour
- `Cache-Control: no-cache` — Always check with server before using cache
- `Cache-Control: no-store` — Never cache (for sensitive data)
- `ETag` — A fingerprint of the content. Server can say "it hasn't changed, use your cache"

### CDN Cache

1. CDN has servers worldwide (edge locations)
2. First request: CDN fetches from your origin server, stores a copy
3. Subsequent requests from nearby users: served from CDN edge (fast, no origin hit)
4. CDN respects your `Cache-Control` headers or has its own TTL settings
5. When content changes: you purge the CDN cache or wait for TTL to expire

### Application Cache (Redis/Memcached)

1. Application needs data (e.g., user's profile)
2. Check cache first: `cache.get("user:123")`
3. **Cache hit**: Data found in cache → return immediately
4. **Cache miss**: Not in cache → fetch from database → store in cache → return
5. Cache entries have a TTL (Time To Live) — they expire automatically

### Database Query Cache

Some databases cache query results internally. PostgreSQL caches recent query plans. MySQL has a query cache (though it's often disabled in production because invalidation is too aggressive). This is usually the database's job, not yours.

## Key Terms You'll Hear

| Term | What It Means |
|------|---------------|
| **Cache Hit** | Requested data is found in cache. Fast |
| **Cache Miss** | Data not in cache. Must fetch from the source. Slow |
| **Hit Rate** | Percentage of requests served from cache. Higher = better (aim for 90%+) |
| **TTL (Time To Live)** | How long cached data is valid before it expires |
| **Cache Invalidation** | Removing or updating cached data when the source changes. "The hardest problem in CS" |
| **Stale Data** | Cached data that's no longer current. The source has changed but the cache hasn't been updated |
| **Cache-Through** | Application reads from cache; on miss, cache fetches from source and stores it |
| **Write-Through** | Every write goes to both cache and source simultaneously |
| **Write-Behind** | Write to cache immediately, sync to source asynchronously (risky — data can be lost) |
| **Cache Stampede** | When a popular cache entry expires and hundreds of requests hit the database simultaneously |
| **Cache Warming** | Pre-loading cache with data you expect to be needed (before a traffic spike, during deployment) |
| **Eviction Policy** | How the cache decides what to remove when it's full (LRU, LFU, FIFO) |
| **LRU** | Least Recently Used — evicts data that hasn't been accessed in the longest time. Most common policy |
| **Redis** | An in-memory data store commonly used for application caching |
| **CDN** | Content Delivery Network — caches static and sometimes dynamic content at edge locations globally |

## Common Patterns

### Pattern 1: Cache-Aside (Lazy Loading)

Application checks cache first. On miss, fetches from database and stores in cache.

```
Read:
1. Try cache → hit? Return.
2. Miss → query database → store in cache → return.

Write:
1. Update database → delete from cache (or update cache).
```

**When it's used:** Most common caching pattern. Works for any read-heavy workload.

**Trade-off:** First request after expiry is slow (cache miss). Risk of stale data between writes and cache invalidation.

### Pattern 2: Write-Through

Every write updates both cache and database simultaneously.

**When it's used:** When you need cache and database to be consistent at all times.

**Trade-off:** Writes are slower (two writes instead of one). But reads are always fresh.

### Pattern 3: Read-Through

Cache itself is responsible for loading data from the source on a miss. Application only talks to the cache.

**When it's used:** When you want to simplify application code. The cache acts as a data access layer.

**Trade-off:** Requires a cache that supports this pattern (or a caching library). Less control over what's cached.

### Pattern 4: Cache with Revalidation (Stale-While-Revalidate)

Serve stale data immediately, then refresh the cache in the background.

```
Cache-Control: max-age=60, stale-while-revalidate=300
```

This means: "Cache for 60 seconds. After 60 seconds, serve stale while fetching fresh in background. After 300 seconds, must revalidate before serving."

**When it's used:** Content that should be fast but eventually consistent (news feeds, dashboards, product listings).

**Trade-off:** Users might see slightly stale data. But no loading delay.

## Gotchas & Edge Cases

- **Cache invalidation is genuinely hard**: Phil Karlton famously said "There are only two hard things in Computer Science: cache invalidation and naming things." When your data changes, you must update or remove all cached copies. Miss one and you have stale data.
- **Cache stampede**: A popular cache key expires → 1,000 concurrent requests all miss → 1,000 database queries fire simultaneously → database crashes. Solution: use locking (only one request fetches from DB, others wait) or stale-while-revalidate.
- **Dogpile effect**: Similar to stampede. When cache is being rebuilt, all requests pile up waiting. Use probabilistic early expiration — randomly refresh before TTL to spread the load.
- **Cache key design**: Bad keys lead to low hit rates. Include all relevant parameters: `user:123:profile:v2` not just `user`. But don't make keys so specific that nothing ever matches.
- **Cached errors**: If a database query fails and you cache the error response, every subsequent request gets the cached error. Don't cache failures.
- **Memory limits**: Caches have finite memory. If you cache everything, the cache evicts important entries. Cache selectively — hot data, expensive queries, frequent reads.
- **Serialization overhead**: Storing complex objects in Redis requires serialization (JSON, MessagePack). Large objects might be slower to serialize/deserialize than just querying the database.
- **Multi-region caching**: If your app runs in multiple regions, each region has its own cache. A write in US-East doesn't invalidate the cache in EU-West. Cross-region cache invalidation is complex.

## Quick Reference

| What to Cache | Where | TTL | Invalidation |
|--------------|-------|-----|-------------|
| Static assets (CSS, JS, images) | CDN + Browser | Long (1 year) | Filename hashing (new deploy = new filename) |
| API responses (read-heavy) | Redis/Memcached | 5 min - 1 hour | Invalidate on write |
| User sessions | Redis | Session duration | Delete on logout |
| Database query results | Redis | 1 min - 15 min | Invalidate when underlying data changes |
| HTML pages | CDN | 1 min - 1 hour | Purge on content update |
| Configuration | Application memory | Until restart | Restart or hot reload |

| Problem | Solution |
|---------|----------|
| Stale data | Shorter TTL or event-driven invalidation |
| Cache stampede | Locking or stale-while-revalidate |
| Cache miss overhead | Cache warming before traffic spikes |
| Memory pressure | LRU eviction, selective caching |
| Inconsistency across regions | Event-based invalidation via message queue |
