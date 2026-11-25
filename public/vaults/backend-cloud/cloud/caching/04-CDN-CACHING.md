# CDN & HTTP Caching

HTTP caching is the first layer of caching that most users interact with. Understanding Cache-Control headers, ETag/Last-Modified, and CDN behavior is essential for building fast web applications.

---

## Table of Contents

1. [HTTP Caching Headers](#http-caching-headers)
2. [Conditional Requests](#conditional-requests)
3. [CDN Architecture](#cdn-architecture)
4. [Edge Caching Strategies](#edge-caching-strategies)
5. [CDN Comparison](#cdn-comparison)
6. [Common Interview Questions](#common-interview-questions)

---

## HTTP Caching Headers

### Cache-Control

The most important caching header. Controls behavior for both browser and CDN caches.

```
Cache-Control Directives:

PUBLIC CACHING:
  Cache-Control: public, max-age=3600
  -> Browser AND CDN cache for 1 hour

PRIVATE CACHING:
  Cache-Control: private, max-age=3600
  -> Browser caches for 1 hour, CDN does NOT cache
  -> Use for user-specific data (profile, cart)

NO CACHING:
  Cache-Control: no-store
  -> Nobody caches (not browser, not CDN)
  -> Use for sensitive data (banking, passwords)

REVALIDATION:
  Cache-Control: no-cache
  -> Cache stores response but MUST revalidate with origin before using
  -> NOT the same as no-store!

  Cache-Control: must-revalidate
  -> Once stale, MUST revalidate (don't serve stale on error)

SEPARATE BROWSER/CDN TTL:
  Cache-Control: public, max-age=300, s-maxage=86400
  -> Browser: 5 minutes, CDN: 24 hours
  -> s-maxage overrides max-age for shared caches (CDN)

STALE WHILE REVALIDATE:
  Cache-Control: public, max-age=3600, stale-while-revalidate=60
  -> Cache for 1 hour
  -> After expiry, serve stale for 60 more seconds while revalidating in background
  -> Users never wait for origin response
```

### Directive Cheat Sheet

| Directive | Browser | CDN | Effect |
| --------- | ------- | --- | ------ |
| `public` | Yes | Yes | Anyone can cache |
| `private` | Yes | No | Only browser caches |
| `no-store` | No | No | Never cache |
| `no-cache` | Stores | Stores | Must revalidate every time |
| `max-age=N` | N seconds | N seconds | Cache for N seconds |
| `s-maxage=N` | Ignored | N seconds | CDN-specific TTL |
| `stale-while-revalidate=N` | Varies | Yes | Serve stale while refreshing |
| `must-revalidate` | Yes | Yes | Don't serve stale on error |
| `immutable` | Yes | Yes | Never revalidate (versioned assets) |

### Vary Header

Tells caches that responses vary by certain request headers.

```
Vary: Accept-Encoding
  -> Cache separate versions for gzip, br, identity

Vary: Accept-Language
  -> Cache separate versions per language

Vary: Cookie
  -> DON'T do this! Creates a unique cache entry per cookie value
  -> Effectively disables caching
```

---

## Conditional Requests

Avoid re-downloading unchanged resources.

### ETag

```
First request:
  GET /api/user/123
  Response: { "name": "Alice" }
  ETag: "abc123"

Second request:
  GET /api/user/123
  If-None-Match: "abc123"

  Response (unchanged): 304 Not Modified (no body, fast!)
  Response (changed):   200 OK with new data and new ETag
```

### Last-Modified

```
First request:
  GET /styles.css
  Response: .body { color: blue }
  Last-Modified: Wed, 15 Jan 2025 08:30:00 GMT

Second request:
  GET /styles.css
  If-Modified-Since: Wed, 15 Jan 2025 08:30:00 GMT

  Response (unchanged): 304 Not Modified
  Response (changed):   200 OK with new content
```

### ETag vs Last-Modified

| Feature | ETag | Last-Modified |
| ------- | ---- | ------------- |
| **Precision** | Exact (hash of content) | 1-second granularity |
| **Comparison** | String equality | Date comparison |
| **Generation** | Hash content or version | File modification time |
| **Weak/Strong** | Weak (`W/"abc"`) or strong (`"abc"`) | Always weak (time-based) |
| **Use** | API responses, dynamic content | Static files |

---

## CDN Architecture

```
User (Tokyo) -> CDN Edge PoP (Tokyo) -> [HIT] -> Return cached response
                                     -> [MISS] -> Origin (US) -> Cache + return

Multi-Tier:
  User -> Edge (L1, 300+ PoPs) -> Regional Shield (L2, ~10 locations) -> Origin
  L1 miss -> check L2 before going to origin
  Reduces origin load dramatically
```

### Cache Warming

```
Problem: After deploy or purge, cache is cold -> all requests hit origin

Solutions:
  1. Pre-warm: Script that fetches popular URLs after deploy
  2. Stale-while-revalidate: Serve old content while fetching new
  3. Origin Shield: Regional cache reduces origin hits even on cold edge
  4. Soft purge: Mark as stale (serve stale) instead of hard delete
```

---

## Edge Caching Strategies

### Static Assets (Always Cache)

```
Cache-Control: public, max-age=31536000, immutable
Content-Type: application/javascript

URL: /assets/bundle.a1b2c3.js  (content hash in filename)
-> Cache forever. New content = new URL. No invalidation needed.
```

### HTML Pages (Short Cache + Revalidate)

```
Cache-Control: public, max-age=0, must-revalidate
ETag: "page-v42"

-> CDN caches but revalidates every request
-> If unchanged: 304 (fast, no body transfer)
-> If changed: 200 with new content
```

### API Responses (Selective Caching)

```
Public API (product catalog):
  Cache-Control: public, s-maxage=300, stale-while-revalidate=60
  -> CDN caches for 5 min, serves stale for 1 min while refreshing

Private API (user data):
  Cache-Control: private, max-age=60
  -> Only browser caches, CDN passes through

Real-time API (stock prices):
  Cache-Control: no-store
  -> Never cache
```

---

## CDN Comparison

| Feature | Cloudflare | CloudFront | Fastly | Akamai |
| ------- | ---------- | ---------- | ------ | ------ |
| **PoPs** | 300+ | 600+ | 80+ | 4,000+ |
| **Routing** | Anycast | DNS-based | Anycast | DNS-based |
| **Edge compute** | Workers (V8) | Lambda@Edge | Compute@Edge (Wasm) | EdgeWorkers |
| **Purge speed** | <30s global | ~60s | ~150ms (instant purge!) | ~5s |
| **DDoS** | Free, unlimited | Shield Standard (free) | Limited | Advanced |
| **Pricing** | Flat plans | Per-request + egress | Per-request + egress | Custom/enterprise |
| **Free tier** | Yes (generous) | 1TB/month free | No | No |
| **Best for** | All-in-one (CDN+security+compute) | AWS ecosystem | Real-time purge, programmable | Enterprise, largest network |

---

## Common Interview Questions

1. **What is the difference between `no-cache` and `no-store`?** `no-cache`: response CAN be stored but must revalidate with origin every time. `no-store`: response must NOT be stored anywhere.

2. **How does stale-while-revalidate work?** After max-age expires, the cache serves the stale response immediately while fetching a fresh copy from origin in the background. The user gets a fast response (stale), and the next user gets the fresh response.

3. **What is the Vary header and when is it dangerous?** Vary tells caches to store separate versions based on request headers. `Vary: Accept-Encoding` is fine (gzip vs brotli). `Vary: Cookie` is dangerous -- creates a unique cache entry per user, effectively disabling caching.

4. **How do you cache static assets effectively?** Use content-hashed filenames (`bundle.a1b2c3.js`), set `Cache-Control: public, max-age=31536000, immutable`. When content changes, the filename changes, so no invalidation is needed.

5. **How does a CDN handle cache invalidation?** Purge by URL, tag, prefix, or everything. Fastly has near-instant purge (~150ms). Cloudflare purges in <30s. CloudFront takes ~60s. Use surrogate keys/cache tags for targeted invalidation.

6. **What is an origin shield?** A mid-tier cache between edge PoPs and your origin. Edge misses check the shield before going to origin. Collapses multiple edge requests into one origin request, dramatically reducing origin load.
