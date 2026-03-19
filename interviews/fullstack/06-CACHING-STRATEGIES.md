# Caching Strategies

## Overview

Caching is one of the most impactful performance optimizations in full-stack engineering. A well-designed caching strategy can reduce response times from seconds to milliseconds, cut database load by orders of magnitude, and save significant infrastructure costs. For full-stack engineers, caching knowledge spans every layer: browser caching, CDN configuration, application-level caching with Redis, HTTP caching headers, and database query caching.

In interviews, caching questions test your ability to reason about trade-offs, particularly around consistency versus performance. They also reveal whether you understand the infamous "two hard things in computer science" -- one of which is cache invalidation.

---

## Core Concepts

### Cache Levels

Caching happens at multiple layers of the stack. Each layer has different characteristics:

```
User -> Browser Cache -> CDN -> Load Balancer -> App Cache -> Database Cache -> Database
```

**Browser cache:**

- Closest to the user, fastest possible response
- Controlled by HTTP headers (Cache-Control, ETag, Last-Modified)
- Stores static assets (JS, CSS, images, fonts)
- No server round-trip when cache is valid

**CDN (Content Delivery Network):**

- Geographically distributed edge servers
- Caches static assets and sometimes dynamic content
- Reduces latency by serving from the nearest edge location
- Examples: CloudFront, Cloudflare, Fastly, Vercel Edge

**Application cache (e.g., Redis, Memcached):**

- Caches computed results, database query results, session data
- Shared across application instances
- Sub-millisecond reads for in-memory stores
- Supports complex data structures (Redis)

**Database cache:**

- Query result cache (MySQL query cache, PostgreSQL shared buffers)
- Connection pooling (PgBouncer, ProxySQL)
- Materialized views for expensive aggregations
- Read replicas as a caching layer

### Redis

Redis is an in-memory data store used as a cache, message broker, and session store.

**Key data structures:**

- **String**: Simple key-value pairs, counters, serialized objects
- **Hash**: Field-value maps (like a row in a database)
- **List**: Ordered collections (queues, recent items)
- **Set**: Unique unordered collections (tags, unique visitors)
- **Sorted Set**: Ordered by score (leaderboards, rate limiting)
- **Stream**: Append-only log (event streams, activity feeds)

**TTL (Time to Live):**

- Set expiration on keys: `SET key value EX 3600` (1 hour)
- After TTL expires, the key is automatically deleted
- Use TTL to prevent stale data and control memory usage

**Eviction policies (when memory is full):**

- `noeviction`: Return errors when memory is full
- `allkeys-lru`: Evict least recently used keys across all keys
- `volatile-lru`: Evict least recently used keys with TTL set
- `allkeys-lfu`: Evict least frequently used keys
- `volatile-ttl`: Evict keys with shortest TTL first
- `allkeys-random`: Evict random keys

**Choosing an eviction policy:**

- Use `allkeys-lru` for general caching (most common)
- Use `volatile-lru` when mixing cached and persistent data
- Use `volatile-ttl` when shorter-lived keys should be evicted first

### Cache Patterns

**Cache-aside (lazy loading):**

1. Application checks cache first
2. On cache miss, query the database
3. Store the result in cache
4. Return the result

Pros: Only caches data that is actually requested. Simple to implement.
Cons: First request is always a cache miss. Data can become stale.

**Write-through:**

1. Application writes to cache and database simultaneously
2. Every write updates both stores
3. Reads always hit the cache

Pros: Cache is always consistent with database. No stale reads.
Cons: Higher write latency (two writes). Caches data that may never be read.

**Write-behind (write-back):**

1. Application writes to cache only
2. Cache asynchronously writes to database in batches
3. Reads are served from cache

Pros: Very fast writes. Batching reduces database load.
Cons: Risk of data loss if cache crashes before flushing. Complex to implement.

**Read-through:**

1. Application reads from cache
2. On cache miss, the cache itself loads from the database
3. Cache returns the result to the application

Pros: Application logic is simpler (cache handles loading). Consistent read path.
Cons: Cache implementation is more complex.

### Cache Invalidation Strategies

Cache invalidation is the process of removing or updating stale cache entries.

**Time-based expiration (TTL):**

- Simplest strategy: set TTL on every cached entry
- Data can be stale for up to TTL duration
- Good for data that changes infrequently

**Event-based invalidation:**

- Invalidate cache when the underlying data changes
- Triggered by database change events, application events, or pub/sub
- Provides better consistency than TTL alone

**Version-based invalidation:**

- Include a version number in the cache key
- When data changes, increment the version
- Old cache entries expire naturally via TTL
- Avoids explicit deletion

**Tag-based invalidation:**

- Associate cache entries with tags (e.g., `user:123`, `product:456`)
- Invalidate all entries with a given tag when related data changes
- Useful for complex dependency graphs

**Patterns to avoid:**

- Deleting all cache entries on any change (defeats the purpose)
- Never invalidating (data becomes permanently stale)
- Manual cache clearing in production (error-prone, not scalable)

### CDN Configuration

CDNs cache content at edge servers close to users.

**What to cache on a CDN:**

- Static assets (JavaScript, CSS, images, fonts)
- Pre-rendered HTML pages
- API responses that are the same for all users (public data)
- Media files (videos, documents)

**What NOT to cache on a CDN:**

- Personalized content (user dashboards, account pages)
- Responses with authentication headers
- Real-time data (stock prices, chat messages)
- POST/PUT/DELETE responses

**CDN cache key strategies:**

- URL-based (default): same URL = same cache entry
- Query string handling: include, exclude, or sort query parameters
- Header-based: vary cache by Accept-Language, Accept-Encoding
- Cookie-based: vary cache by session or user type

### HTTP Caching Headers

HTTP caching is controlled by response headers that tell browsers and proxies how to cache responses.

**Cache-Control:**

```
Cache-Control: public, max-age=31536000, immutable
```

- `public`: Can be cached by any intermediate proxy
- `private`: Only the browser can cache (not CDNs or proxies)
- `max-age=N`: Cache is valid for N seconds
- `s-maxage=N`: Shared cache (CDN) max age, overrides max-age
- `no-cache`: Must revalidate with server before using cached copy
- `no-store`: Do not cache at all (sensitive data)
- `immutable`: Content will never change (used with fingerprinted assets)
- `stale-while-revalidate=N`: Serve stale content while revalidating in background

**ETag (Entity Tag):**

```
ETag: "abc123"
```

- A unique identifier for a specific version of a resource
- Server generates ETag from content hash or version number
- Client sends `If-None-Match: "abc123"` on subsequent requests
- Server returns `304 Not Modified` if ETag matches (no body sent)

**Last-Modified:**

```
Last-Modified: Wed, 01 Jan 2025 00:00:00 GMT
```

- Timestamp of the last modification
- Client sends `If-Modified-Since` on subsequent requests
- Server returns `304 Not Modified` if unchanged
- Less precise than ETag (second-level granularity)

**Common caching strategies:**

| Resource Type                        | Cache-Control                              | Why                                           |
| ------------------------------------ | ------------------------------------------ | --------------------------------------------- |
| Fingerprinted assets (app.abc123.js) | `public, max-age=31536000, immutable`      | Content hash in filename; changes get new URL |
| HTML pages                           | `no-cache` or `max-age=0, must-revalidate` | Always check for latest version               |
| API responses (public)               | `public, max-age=60, s-maxage=300`         | Short browser cache, longer CDN cache         |
| API responses (private)              | `private, max-age=0, no-store`             | Sensitive data, never cache                   |
| Images/fonts                         | `public, max-age=604800`                   | Change infrequently (1 week)                  |

### Cache Warming

Cache warming is the practice of pre-populating the cache before it is needed.

**When to warm the cache:**

- After a deployment (cache was cleared or invalidated)
- Before a traffic spike (marketing campaign, product launch)
- When migrating to a new cache cluster

**Strategies:**

- Run a script that queries the most popular endpoints
- Use access logs to identify the top N most-requested resources
- Pre-compute and cache expensive aggregations during off-peak hours
- Use a background job to iterate over critical data and populate the cache

### Distributed Caching

When your application runs on multiple servers, caching becomes a distributed systems problem.

**Consistent hashing:**

- Distributes keys evenly across cache nodes
- When a node is added or removed, only a fraction of keys need to be remapped
- Used by Redis Cluster, Memcached

**Redis Cluster:**

- Automatic data sharding across multiple nodes
- 16,384 hash slots distributed across nodes
- Automatic failover with replica promotion
- Client-side routing to the correct shard

**Redis Sentinel:**

- Monitoring: watches Redis instances for availability
- Notification: alerts when instances fail
- Automatic failover: promotes a replica to primary
- Configuration provider: clients discover the current primary

### Cache Stampede Prevention

A cache stampede (thundering herd) occurs when many requests simultaneously find a cache miss and all query the database at once.

**Lock-based approach:**

- When a cache miss occurs, acquire a lock
- Only the lock holder queries the database and populates the cache
- Other requests wait for the cache to be populated
- Use Redis `SET key value NX EX 30` for distributed locking

**Probabilistic early expiration:**

- Before the TTL expires, randomly decide to recompute
- Spreads recomputation over time instead of all at once
- Each request has a small chance of refreshing the cache early

**Stale-while-revalidate:**

- Serve the stale cached value immediately
- Trigger an asynchronous cache refresh in the background
- Users get fast responses while the cache is being updated

---

## Practical Scenarios

### Scenario 1: Caching an E-commerce Product Catalog

You have a product catalog with 100,000 products. Product pages are the most visited pages.

**Approach:**

1. Cache individual product data in Redis with a 1-hour TTL
2. Use cache-aside pattern: check Redis first, fall back to database
3. Invalidate the specific product cache when it is updated via admin panel
4. Cache the product listing pages on CDN with `s-maxage=300` (5 minutes)
5. Use fingerprinted URLs for product images: cache forever on CDN
6. Warm the cache for the top 1,000 most-viewed products after deployment

### Scenario 2: Caching User Session Data

Your application needs to check user permissions on every API request.

**Approach:**

1. Store session data in Redis with a 30-minute sliding TTL
2. Use Redis Hash to store user profile, roles, and permissions
3. On every request, read from Redis (sub-millisecond)
4. Refresh TTL on every read to implement sliding expiration
5. Invalidate the session cache when the user updates their profile or when permissions change
6. Use write-through pattern: update Redis when updating the database

### Scenario 3: Dealing with a Cache Stampede

Your homepage makes an expensive aggregation query that takes 5 seconds. It is cached for 5 minutes. When the cache expires, 1,000 concurrent users all trigger the expensive query.

**Approach:**

1. Implement distributed locking: only one request computes the result
2. Other requests wait for the lock holder to populate the cache
3. Set a lock timeout (10 seconds) to prevent deadlocks
4. Implement stale-while-revalidate: serve the old value while recomputing
5. Add probabilistic early expiration so the cache refreshes before it expires
6. Consider a background job that refreshes this cache proactively

### Scenario 4: Migrating from Local Cache to Distributed Cache

Your application caches data in process memory (Node.js Map). It works on a single server but fails with multiple servers because each has its own cache.

**Approach:**

1. Set up a Redis cluster accessible from all application servers
2. Replace in-memory Map with Redis client calls
3. Use JSON serialization for cached objects
4. Set appropriate TTLs (previously unlimited in memory)
5. Add connection pooling and error handling for Redis failures
6. Implement a fallback strategy: if Redis is down, bypass cache and query database directly
7. Monitor cache hit rates and Redis memory usage

---

## Interview Questions

### Q1: Explain the different levels of caching in a web application.

**Answer:**

Caching occurs at every layer of the stack, each with different trade-offs:

**Browser cache** is the closest to the user. Controlled by HTTP headers like Cache-Control and ETag, it eliminates network round-trips entirely for cached resources. Static assets with fingerprinted filenames can be cached indefinitely.

**CDN cache** sits at edge servers around the world. It reduces latency by serving content from the geographically nearest location. Ideal for static assets, pre-rendered pages, and public API responses. Configured via Cache-Control headers and CDN-specific rules.

**Application cache** (typically Redis or Memcached) stores computed results in memory. It eliminates expensive database queries and computation. Shared across all application instances. Sub-millisecond reads.

**Database cache** includes the database's own query cache, buffer pool (pages cached in memory), connection pooling, and materialized views. These are transparent to the application.

**The key insight** is that each layer reduces load on the layers below it. A request served from the browser cache never hits the CDN. A response served from the CDN never reaches your application server. A result served from Redis never queries the database.

### Q2: What is the cache-aside pattern and when would you use it?

**Answer:**

Cache-aside (also called lazy loading) is the most common caching pattern:

1. Application receives a request
2. Check the cache for the requested data
3. If found (cache hit), return the cached data
4. If not found (cache miss), query the database
5. Store the result in the cache with a TTL
6. Return the result

**When to use it:**

- Read-heavy workloads where data does not change frequently
- When it is acceptable for data to be stale for a short period
- When you want to cache only data that is actually requested (as opposed to caching everything)

**Trade-offs:**

- First request is always a cache miss (cold start)
- Data can be stale until TTL expires or explicit invalidation
- Application must handle cache failures gracefully (fall back to database)

**When to use alternatives:**

- Write-through when consistency is critical
- Write-behind when write performance is critical
- Read-through when you want the cache to manage its own loading logic

### Q3: How do you handle cache invalidation?

**Answer:**

Cache invalidation is the hardest part of caching. There are several strategies, and the right choice depends on consistency requirements:

**TTL-based expiration** is the simplest. Set a TTL on every cached entry. Data can be stale for up to TTL duration, but staleness is bounded. Good for data where slight staleness is acceptable (product listings, leaderboards, article content).

**Event-based invalidation** provides tighter consistency. When the underlying data changes, explicitly invalidate or update the cache. This can be done synchronously (in the same transaction) or asynchronously (via events or message queues). Good for data where staleness is unacceptable (user permissions, account balances).

**Version-based cache keys** avoid explicit invalidation. Include a version number or content hash in the cache key. When data changes, the new version gets a new cache key. Old entries expire naturally. Good for static assets with fingerprinted URLs.

**My approach in practice:**

- Start with TTL-based expiration (simplest)
- Add event-based invalidation for data that must be consistent
- Use short TTLs (30-60 seconds) as a safety net even with event-based invalidation
- Monitor cache hit rates and stale data incidents to tune the strategy

### Q4: Explain the difference between Cache-Control headers: no-cache, no-store, and must-revalidate.

**Answer:**

These are commonly confused but have distinct meanings:

**`no-store`**: Do not cache the response at all. Not in the browser, not in any proxy, not on the CDN. Use for sensitive data like banking information, personal health records, or authentication tokens. The response must be fetched fresh every time.

**`no-cache`**: The response CAN be cached, but the cache must revalidate with the server before serving it. The server checks ETag or Last-Modified and returns 304 Not Modified if the content has not changed. Despite the name, `no-cache` does not mean "do not cache" -- it means "do not serve from cache without revalidating."

**`must-revalidate`**: Once the cached response becomes stale (max-age expires), the cache must revalidate with the server before serving it. Without this header, caches might serve stale content when the server is unreachable.

**Common combinations:**

- `Cache-Control: no-store` -- Never cache (sensitive data)
- `Cache-Control: no-cache` -- Cache but always revalidate (HTML pages)
- `Cache-Control: public, max-age=3600, must-revalidate` -- Cache for 1 hour, then revalidate
- `Cache-Control: public, max-age=31536000, immutable` -- Cache forever (fingerprinted assets)

### Q5: How would you prevent a cache stampede?

**Answer:**

A cache stampede happens when a popular cache entry expires and hundreds or thousands of concurrent requests all experience a cache miss simultaneously. They all query the database, overwhelming it.

**Solution 1: Distributed locking**
When a cache miss occurs, try to acquire a lock (using Redis `SET NX EX`). Only the request that acquires the lock queries the database and repopulates the cache. Other requests either wait briefly and retry the cache, or return a stale value if available.

**Solution 2: Probabilistic early expiration**
Before the TTL expires, each request has a small probability of refreshing the cache early. This spreads recomputation over time. The formula is: `currentTime - (TTL * beta * ln(random()))`. With enough traffic, the cache is refreshed before it expires.

**Solution 3: Stale-while-revalidate**
Store the value with a longer TTL than needed. When the "logical" TTL expires, serve the stale value but trigger an asynchronous refresh. The `stale-while-revalidate` HTTP header implements this at the browser/CDN level. For application caches, implement it manually with two TTLs: a soft TTL (trigger refresh) and a hard TTL (actually expire).

**Solution 4: Background refresh**
A background job proactively refreshes cache entries for high-traffic keys before they expire. The cache never actually expires for end users.

**In practice**, I combine locking with stale-while-revalidate. Users always get a fast response (stale or fresh), and only one process refreshes the cache.

### Q6: When would you use Redis versus Memcached?

**Answer:**

**Choose Redis when:**

- You need data structures beyond simple key-value (lists, sets, sorted sets, hashes)
- You need persistence (data survives restarts)
- You need pub/sub messaging
- You need atomic operations (INCR, DECR, LPUSH)
- You need Lua scripting for complex operations
- You need cluster mode with automatic sharding

**Choose Memcached when:**

- You only need simple key-value caching
- You want multi-threaded performance (Memcached is multi-threaded; Redis is single-threaded)
- Memory efficiency is critical (Memcached has lower per-key overhead)
- You do not need persistence

**In practice**, Redis is chosen in the vast majority of cases because its feature set is a superset of Memcached, and the single-threaded limitation is mitigated by running multiple instances or using Redis Cluster.

### Q7: How do you decide what TTL to set for cached data?

**Answer:**

TTL selection depends on three factors: data volatility, consistency requirements, and the cost of a cache miss.

**Framework for choosing TTLs:**

| Data Type                     | TTL Range                 | Reasoning                                            |
| ----------------------------- | ------------------------- | ---------------------------------------------------- |
| Static assets                 | Infinite (immutable URLs) | Content hash in filename                             |
| Configuration / feature flags | 1-5 minutes               | Changes are rare but should propagate quickly        |
| Product catalog               | 5-60 minutes              | Changes occasionally, slight staleness is fine       |
| User profile                  | 5-15 minutes              | Changes infrequently, but should not be too stale    |
| Session data                  | 30 min sliding            | Security requirement: sessions must expire           |
| Real-time data (prices)       | 1-10 seconds              | Staleness is costly                                  |
| Search results                | 5-30 minutes              | Expensive to compute, slight staleness is acceptable |

**General principles:**

- Start with a conservative (short) TTL and increase it based on observed hit rates
- Use shorter TTLs for data that changes frequently
- Use longer TTLs for expensive-to-compute data
- Add event-based invalidation for data where TTL-based staleness is unacceptable
- Monitor cache hit rates: if below 80%, the TTL may be too short

### Q8: Explain how you would implement caching for a REST API.

**Answer:**

**Layer 1: HTTP caching headers**
Set appropriate Cache-Control headers on every response:

- Public, read-only endpoints: `Cache-Control: public, max-age=60, s-maxage=300`
- Authenticated endpoints: `Cache-Control: private, no-cache`
- Static resources: `Cache-Control: public, max-age=31536000, immutable`
- Use ETag for conditional requests on dynamic content

**Layer 2: CDN caching**
Put a CDN in front of the API for public endpoints. Configure the CDN to respect Cache-Control headers or set CDN-specific rules. Vary cache by necessary headers (Accept-Language, Authorization).

**Layer 3: Application-level caching (Redis)**
Cache expensive database queries and computed results:

- Use the endpoint + query parameters as the cache key
- Serialize the response body in Redis
- Set TTL based on data volatility
- Invalidate on writes (POST, PUT, DELETE to related resources)

**Layer 4: Database query caching**
Use materialized views for expensive aggregations. Configure the database buffer pool appropriately. Use read replicas for read-heavy endpoints.

**Cache key design:**

```
cache:api:v1:products:list:page=1&sort=price&category=electronics
cache:api:v1:products:detail:prod-123
cache:api:v1:users:user-456:profile
```

Include the API version in the key so cache is automatically invalidated on API changes.

---

## Code Examples

### Cache-Aside Pattern (Node.js + Redis)

```typescript
// cache/redis-cache.ts
import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
  maxRetriesPerRequest: 3,
});

interface CacheOptions {
  readonly ttlSeconds: number;
}

export const cacheGet = async <T>(key: string): Promise<T | null> => {
  try {
    const cached = await redis.get(key);
    if (cached === null) {
      return null;
    }
    return JSON.parse(cached) as T;
  } catch (error) {
    console.error(`Cache read error for key ${key}:`, error);
    return null;
  }
};

export const cacheSet = async <T>(
  key: string,
  value: T,
  options: CacheOptions
): Promise<void> => {
  try {
    await redis.set(key, JSON.stringify(value), 'EX', options.ttlSeconds);
  } catch (error) {
    console.error(`Cache write error for key ${key}:`, error);
  }
};

export const cacheDelete = async (key: string): Promise<void> => {
  try {
    await redis.del(key);
  } catch (error) {
    console.error(`Cache delete error for key ${key}:`, error);
  }
};

export const cacheDeletePattern = async (pattern: string): Promise<void> => {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (error) {
    console.error(`Cache pattern delete error for ${pattern}:`, error);
  }
};
```

```typescript
// services/product-service.ts
import {
  cacheGet,
  cacheSet,
  cacheDelete,
  cacheDeletePattern,
} from '../cache/redis-cache';
import { db } from '../database';

interface Product {
  readonly id: string;
  readonly name: string;
  readonly price: number;
  readonly category: string;
}

const PRODUCT_CACHE_TTL = 3600; // 1 hour

const productCacheKey = (id: string): string => `cache:products:${id}`;
const productListCacheKey = (category: string, page: number): string =>
  `cache:products:list:${category}:page-${page}`;

export const getProduct = async (id: string): Promise<Product | null> => {
  // Check cache first
  const cached = await cacheGet<Product>(productCacheKey(id));
  if (cached !== null) {
    return cached;
  }

  // Cache miss: query database
  const product = await db('products').where({ id }).first();

  if (product) {
    // Populate cache for future requests
    await cacheSet(productCacheKey(id), product, {
      ttlSeconds: PRODUCT_CACHE_TTL,
    });
  }

  return product ?? null;
};

export const updateProduct = async (
  id: string,
  updates: Partial<Pick<Product, 'name' | 'price' | 'category'>>
): Promise<Product> => {
  const [updated] = await db('products')
    .where({ id })
    .update(updates)
    .returning('*');

  // Invalidate caches
  await cacheDelete(productCacheKey(id));
  await cacheDeletePattern('cache:products:list:*');

  return updated;
};
```

### Cache Stampede Prevention with Locking

```typescript
// cache/stampede-protection.ts
import Redis from 'ioredis';

const redis = new Redis();

interface StampedeOptions {
  readonly cacheKey: string;
  readonly lockKey: string;
  readonly ttlSeconds: number;
  readonly lockTimeoutSeconds: number;
  readonly retryDelayMs: number;
  readonly maxRetries: number;
}

export const getWithStampedeProtection = async <T>(
  options: StampedeOptions,
  computeFn: () => Promise<T>
): Promise<T> => {
  // Try cache first
  const cached = await redis.get(options.cacheKey);
  if (cached !== null) {
    return JSON.parse(cached) as T;
  }

  // Try to acquire lock
  const lockAcquired = await redis.set(
    options.lockKey,
    '1',
    'EX',
    options.lockTimeoutSeconds,
    'NX'
  );

  if (lockAcquired === 'OK') {
    try {
      // We won the lock: compute and cache the value
      const value = await computeFn();
      await redis.set(
        options.cacheKey,
        JSON.stringify(value),
        'EX',
        options.ttlSeconds
      );
      return value;
    } finally {
      // Release the lock
      await redis.del(options.lockKey);
    }
  }

  // Another process holds the lock: wait and retry
  for (let i = 0; i < options.maxRetries; i++) {
    await new Promise((resolve) => setTimeout(resolve, options.retryDelayMs));

    const retryResult = await redis.get(options.cacheKey);
    if (retryResult !== null) {
      return JSON.parse(retryResult) as T;
    }
  }

  // All retries exhausted: compute directly (fallback)
  return computeFn();
};
```

```typescript
// Usage
const getPopularProducts = async (): Promise<Product[]> => {
  return getWithStampedeProtection(
    {
      cacheKey: 'cache:products:popular',
      lockKey: 'lock:products:popular',
      ttlSeconds: 300,
      lockTimeoutSeconds: 10,
      retryDelayMs: 100,
      maxRetries: 50,
    },
    async () => {
      // Expensive query
      return db('products').orderBy('view_count', 'desc').limit(100);
    }
  );
};
```

### HTTP Caching Middleware (Express)

```typescript
// middleware/cache-headers.ts
import { Request, Response, NextFunction } from 'express';

interface CacheConfig {
  readonly public: boolean;
  readonly maxAge: number;
  readonly sMaxAge?: number;
  readonly staleWhileRevalidate?: number;
  readonly immutable?: boolean;
}

export const setCacheHeaders = (config: CacheConfig) => {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const directives: string[] = [];

    directives.push(config.public ? 'public' : 'private');
    directives.push(`max-age=${config.maxAge}`);

    if (config.sMaxAge !== undefined) {
      directives.push(`s-maxage=${config.sMaxAge}`);
    }

    if (config.staleWhileRevalidate !== undefined) {
      directives.push(`stale-while-revalidate=${config.staleWhileRevalidate}`);
    }

    if (config.immutable) {
      directives.push('immutable');
    }

    res.set('Cache-Control', directives.join(', '));
    next();
  };
};

export const noCache = (
  _req: Request,
  res: Response,
  next: NextFunction
): void => {
  res.set('Cache-Control', 'no-store');
  next();
};

// Usage in routes
// app.get('/api/products', setCacheHeaders({
//   public: true,
//   maxAge: 60,
//   sMaxAge: 300,
//   staleWhileRevalidate: 60,
// }), productController.list);
//
// app.get('/api/users/me', noCache, userController.getProfile);
```

### ETag Implementation

```typescript
// middleware/etag.ts
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

export const generateETag = (content: string): string => {
  return crypto.createHash('md5').update(content).digest('hex');
};

export const conditionalResponse = (
  req: Request,
  res: Response,
  body: Record<string, unknown>
): void => {
  const content = JSON.stringify(body);
  const etag = `"${generateETag(content)}"`;

  res.set('ETag', etag);

  const clientETag = req.get('If-None-Match');

  if (clientETag === etag) {
    res.status(304).end();
    return;
  }

  res.json(body);
};
```

### Python Redis Caching Decorator

```python
# cache/decorators.py
import json
import functools
import hashlib
from typing import Callable, Any
import redis

redis_client = redis.Redis(host="localhost", port=6379, decode_responses=True)


def cached(ttl_seconds: int = 3600, prefix: str = "cache"):
    """Decorator that caches function results in Redis."""

    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def wrapper(*args, **kwargs) -> Any:
            # Build cache key from function name and arguments
            key_data = json.dumps(
                {"args": args, "kwargs": kwargs},
                sort_keys=True,
                default=str,
            )
            key_hash = hashlib.md5(key_data.encode()).hexdigest()
            cache_key = f"{prefix}:{func.__name__}:{key_hash}"

            # Check cache
            cached_result = redis_client.get(cache_key)
            if cached_result is not None:
                return json.loads(cached_result)

            # Compute result
            result = await func(*args, **kwargs)

            # Store in cache
            redis_client.set(
                cache_key,
                json.dumps(result, default=str),
                ex=ttl_seconds,
            )

            return result

        return wrapper

    return decorator


def invalidate_cache(prefix: str, func_name: str) -> None:
    """Invalidate all cached results for a function."""
    pattern = f"{prefix}:{func_name}:*"
    keys = redis_client.keys(pattern)
    if keys:
        redis_client.delete(*keys)
```

```python
# Usage
@cached(ttl_seconds=300, prefix="api")
async def get_product_recommendations(user_id: str, limit: int = 10):
    """Expensive ML-based recommendation query."""
    return await recommendation_engine.get_recommendations(user_id, limit)
```

### Go Caching with Generics

```go
// cache/cache.go
package cache

import (
    "context"
    "encoding/json"
    "fmt"
    "time"

    "github.com/redis/go-redis/v9"
)

type Cache struct {
    client *redis.Client
}

func New(addr string) *Cache {
    return &Cache{
        client: redis.NewClient(&redis.Options{
            Addr: addr,
        }),
    }
}

func Get[T any](ctx context.Context, c *Cache, key string) (*T, error) {
    val, err := c.client.Get(ctx, key).Result()
    if err == redis.Nil {
        return nil, nil
    }
    if err != nil {
        return nil, fmt.Errorf("cache get failed: %w", err)
    }

    var result T
    if err := json.Unmarshal([]byte(val), &result); err != nil {
        return nil, fmt.Errorf("cache unmarshal failed: %w", err)
    }

    return &result, nil
}

func Set[T any](ctx context.Context, c *Cache, key string, value T, ttl time.Duration) error {
    data, err := json.Marshal(value)
    if err != nil {
        return fmt.Errorf("cache marshal failed: %w", err)
    }

    return c.client.Set(ctx, key, data, ttl).Err()
}

func GetOrSet[T any](
    ctx context.Context,
    c *Cache,
    key string,
    ttl time.Duration,
    computeFn func() (*T, error),
) (*T, error) {
    // Try cache first
    cached, err := Get[T](ctx, c, key)
    if err != nil {
        return nil, err
    }
    if cached != nil {
        return cached, nil
    }

    // Cache miss: compute value
    value, err := computeFn()
    if err != nil {
        return nil, err
    }

    // Store in cache (fire and forget)
    _ = Set(ctx, c, key, *value, ttl)

    return value, nil
}
```

---

## Quick Reference

### Cache Pattern Comparison

| Pattern       | Read Perf         | Write Perf        | Consistency | Complexity |
| ------------- | ----------------- | ----------------- | ----------- | ---------- |
| Cache-aside   | Fast (after warm) | Normal            | Eventual    | Low        |
| Write-through | Fast              | Slower (2 writes) | Strong      | Medium     |
| Write-behind  | Fast              | Fast              | Eventual    | High       |
| Read-through  | Fast (after warm) | Normal            | Eventual    | Medium     |

### Redis Data Structure Cheat Sheet

```
SET key value EX 3600          # String with 1h TTL
GET key                        # Read string
INCR counter                   # Atomic increment
HSET user:123 name "Alice"     # Hash field
HGETALL user:123               # Get all hash fields
LPUSH queue task1              # Push to list head
RPOP queue                     # Pop from list tail
SADD tags:post1 "go" "redis"  # Add to set
SMEMBERS tags:post1            # Get all set members
ZADD leaderboard 100 "alice"  # Add to sorted set
ZRANGE leaderboard 0 9        # Top 10 by score
DEL key                        # Delete key
TTL key                        # Check remaining TTL
KEYS pattern*                  # Find keys (avoid in prod)
SCAN 0 MATCH pattern* COUNT 100  # Safe key iteration
```

### HTTP Cache Headers Cheat Sheet

```
# Immutable static assets (fingerprinted filenames)
Cache-Control: public, max-age=31536000, immutable

# HTML pages (always revalidate)
Cache-Control: no-cache
ETag: "abc123"

# API responses (short cache, longer CDN)
Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=60

# Private user data (no caching)
Cache-Control: private, no-store

# Images and fonts (1 week)
Cache-Control: public, max-age=604800
```

### Cache Key Design Principles

```
# Include namespace, entity type, and identifier
cache:products:prod-123
cache:users:user-456:profile
cache:api:v2:products:list:category=shoes:page=1

# Include version for breaking changes
cache:v2:products:prod-123

# Include locale for localized content
cache:products:prod-123:en-US
```

### Common TTL Values

| Data Type              | TTL            | Rationale               |
| ---------------------- | -------------- | ----------------------- |
| Static assets          | Infinite       | Fingerprinted URLs      |
| Feature flags          | 60s            | Need quick propagation  |
| Product listings       | 300s (5 min)   | Acceptable staleness    |
| User sessions          | 1800s (30 min) | Security sliding window |
| API rate limits        | 60s            | Per-minute windows      |
| Search results         | 600s (10 min)  | Expensive to compute    |
| Dashboard aggregations | 300s (5 min)   | Balance freshness/cost  |

### Cache Monitoring Metrics

```
- Hit rate (target: > 90%)
- Miss rate
- Eviction rate
- Memory usage
- Key count
- Latency (P50, P99)
- Connection count
- Error rate
```
