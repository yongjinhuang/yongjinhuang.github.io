# Application-Level Caching

Beyond Redis and CDNs, there are caching strategies within your application itself -- local in-process caches, cache key design, session caching, and API response caching. These patterns reduce external dependencies and further improve performance.

---

## Table of Contents

1. [Local In-Process Caches](#local-in-process-caches)
2. [Cache Key Design](#cache-key-design)
3. [Session Caching](#session-caching)
4. [API Response Caching](#api-response-caching)
5. [ORM / Query Caching](#orm--query-caching)
6. [Common Interview Questions](#common-interview-questions)

---

## Local In-Process Caches

Cache data within the application process -- no network hop, microsecond access.

```
Request -> Local Cache (in-process, <1μs) -> [HIT] -> Return
                                           -> [MISS] -> Redis (<1ms) -> [HIT] -> Return
                                                                      -> [MISS] -> DB (~5ms)
```

### Libraries

| Library | Language | Eviction | Notes |
| ------- | -------- | -------- | ----- |
| **Caffeine** | Java | W-TinyLFU (near-optimal) | Industry standard for JVM |
| **Guava Cache** | Java | LRU + size/time | Older, Caffeine is faster |
| **lru-cache** | Node.js | LRU | Simple, lightweight |
| **node-cache** | Node.js | TTL-based | In-memory with TTL |
| **cachetools** | Python | LRU, LFU, TTL | Standard library style |
| **Ristretto** | Go | TinyLFU | High performance, concurrent |

### Caffeine Example (Java)

```java
Cache<String, User> cache = Caffeine.newBuilder()
    .maximumSize(10_000)              // max entries
    .expireAfterWrite(10, TimeUnit.MINUTES)  // TTL
    .refreshAfterWrite(5, TimeUnit.MINUTES)  // async refresh
    .recordStats()                     // hit/miss metrics
    .build(key -> fetchFromDb(key));   // loader function

User user = cache.get("user:123");  // loads from DB on miss
```

### Trade-offs of Local Caches

| Pros | Cons |
| ---- | ---- |
| No network hop (microseconds) | Each instance has its own cache (no sharing) |
| No external dependency | Memory pressure on app server |
| Simple implementation | Cache invalidation across instances is hard |
| No serialization overhead | Cold start on new instances |

### Cache Invalidation Across Instances

```
Problem: 3 app instances, each with local cache
  Instance A caches user:123
  Instance B updates user:123 in DB
  Instance A still has stale cached version

Solutions:
  1. Short TTL (let it expire, accept staleness)
  2. Pub/Sub invalidation (Redis pub/sub or Kafka event)
  3. Use local cache only for truly immutable data (config, enums)
  4. Two-tier: Local L1 (short TTL) + Redis L2 (source of truth)
```

---

## Cache Key Design

Good cache keys are: deterministic, unique, and compact.

### Naming Conventions

```
Pattern: {entity}:{id}:{field}
  user:123:profile
  order:456:items
  product:789:price

Pattern: {entity}:{id}:{version}
  user:123:v5
  -- New version = new key, old naturally expires

Pattern: {query}:{hash}
  search:sha256("category=electronics&sort=price&page=2")
  -- For complex query caching
```

### Key Design Rules

| Rule | Example | Why |
| ---- | ------- | --- |
| Include all parameters that affect the result | `products:electronics:price_asc:page_2` | Different parameters = different cache entry |
| Use namespaces | `v2:user:123` | Invalidate entire namespace by changing prefix |
| Keep keys short | `u:123:p` not `user_profile_data:user_id_123` | Memory savings at scale |
| Avoid user input in keys | Hash user input | Prevent cache key injection |
| Include version | `api:v3:users:123` | API version changes = different cached response |

### Cache Key Injection

```
BAD:
  key = `user:${req.params.id}:profile`
  If id = "123:admin" -> key = "user:123:admin:profile" (WRONG KEY!)

GOOD:
  key = `user:${encodeURIComponent(req.params.id)}:profile`
  Or: validate id is numeric before using in key
```

---

## Session Caching

### Redis Session Store

```javascript
// Express.js with Redis sessions
import session from "express-session";
import RedisStore from "connect-redis";

app.use(session({
  store: new RedisStore({ client: redisClient }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },
}));
```

### JWT vs Server-Side Sessions

| Aspect | JWT (Stateless) | Redis Sessions (Stateful) |
| ------ | --------------- | ------------------------- |
| **Storage** | Client (cookie/header) | Redis (server) |
| **Scalability** | No server state | Requires shared Redis |
| **Revocation** | Hard (need blocklist) | Easy (delete from Redis) |
| **Size** | Grows with claims | Fixed session ID |
| **Security** | Token theft = full access until expiry | Can be invalidated instantly |
| **Best for** | Microservices, APIs | Traditional web apps |

---

## API Response Caching

### Response-Level Cache

```javascript
// Express middleware for API response caching
async function cacheMiddleware(req, res, next) {
  if (req.method !== "GET") return next();

  const key = `api:${req.originalUrl}`;
  const cached = await redis.get(key);

  if (cached) {
    res.set("X-Cache", "HIT");
    return res.json(JSON.parse(cached));
  }

  // Intercept res.json to cache the response
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    redis.set(key, JSON.stringify(body), "EX", 300);
    res.set("X-Cache", "MISS");
    return originalJson(body);
  };

  next();
}
```

### GraphQL Caching

```
Challenges:
  - POST requests (not cacheable by CDN by default)
  - Dynamic queries (infinite combinations)
  - Nested resolvers

Solutions:
  1. Persisted queries: Client sends query ID, not full query -> GET cacheable
  2. Response caching: Cache full response by query hash
  3. Field-level caching: Cache individual resolver results
  4. DataLoader: Batch + cache within a single request (prevents N+1)
```

### DataLoader Pattern

```javascript
// Without DataLoader: N+1 problem
// 10 orders -> 10 separate user queries

// With DataLoader: batch + cache
const userLoader = new DataLoader(async (userIds) => {
  const users = await db.query(
    "SELECT * FROM users WHERE id = ANY($1)", [userIds]
  );
  return userIds.map(id => users.find(u => u.id === id));
});

// Multiple calls in same request are batched
await userLoader.load(1);  // queued
await userLoader.load(2);  // queued
await userLoader.load(1);  // cached (same request)
// One query: SELECT * FROM users WHERE id IN (1, 2)
```

---

## ORM / Query Caching

### Query Result Caching

```javascript
async function getActiveProducts(category) {
  const cacheKey = `products:active:${category}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const products = await db.query(
    "SELECT * FROM products WHERE category = $1 AND active = true",
    [category]
  );

  await redis.set(cacheKey, JSON.stringify(products), "EX", 600);
  return products;
}
```

### Cache Warming

```javascript
// Pre-populate cache on application startup
async function warmCache() {
  const popularCategories = ["electronics", "clothing", "books"];
  await Promise.all(
    popularCategories.map(cat => getActiveProducts(cat))
  );
}
```

---

## Common Interview Questions

1. **When should you use a local in-process cache vs Redis?** Local cache for: frequently accessed, rarely changing data (config, feature flags, static lookups). Redis for: shared state across instances, data that changes more frequently, when consistency across instances matters.

2. **How do you design good cache keys?** Include all parameters that affect the result, use namespaces for easy invalidation, keep keys short, avoid user input directly (validate/hash), and include version identifiers.

3. **How do you handle cache invalidation across multiple application instances?** Use Redis pub/sub to broadcast invalidation events. Or use short TTLs on local caches. Or use a two-tier approach: local L1 with very short TTL + Redis L2 as source of truth.

4. **JWT vs server-side sessions?** JWTs are stateless (no server storage, harder to revoke). Server sessions (Redis) are stateful (easy to revoke, requires shared storage). JWTs for APIs/microservices; sessions for web apps needing instant revocation.

5. **How do you cache GraphQL responses?** Use persisted queries (query ID instead of full query), cache full responses by query hash, use DataLoader for per-request batching and caching, and implement field-level caching for expensive resolvers.

6. **What is the DataLoader pattern?** Batches multiple individual loads into a single database query within the same request. Also caches results within the request scope. Solves the N+1 problem in GraphQL and ORM contexts.
