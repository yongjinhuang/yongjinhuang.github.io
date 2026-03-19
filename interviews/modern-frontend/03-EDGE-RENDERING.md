# Edge Rendering & Partial Prerendering

## Overview

Edge computing has transformed frontend deployment. Instead of running your application on a single origin server or a fleet of serverless functions in one region, edge platforms execute your code at hundreds of locations worldwide -- physically close to your users. This means lower latency, faster time to first byte (TTFB), and architectures that were impossible five years ago.

In 2025-2026, the edge is no longer experimental. Vercel Edge Functions, Cloudflare Workers, Deno Deploy, and AWS Lambda@Edge are production-ready. Next.js introduced Partial Prerendering (PPR), which combines static and dynamic content at the edge. Understanding when and how to leverage edge rendering is a key differentiator in senior frontend interviews.

---

## Core Concepts

### What Is Edge Computing?

Edge computing moves computation from centralized data centers to distributed locations closer to end users. For frontend applications, this means:

```
Traditional Server:
  User (Tokyo) ---> Origin Server (US-East) ---> Response
  Round trip: ~200ms

Edge:
  User (Tokyo) ---> Edge Node (Tokyo) ---> Response
  Round trip: ~20ms
```

Edge nodes are typically small, lightweight runtimes that execute your code at CDN points of presence (PoPs). They have constraints (limited CPU time, no persistent filesystem, restricted APIs) but offer dramatically lower latency for dynamic content.

### Edge Platforms Comparison

**Cloudflare Workers:**

```javascript
// Cloudflare Worker -- runs at 300+ edge locations
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/user') {
      // Access KV store (globally distributed key-value)
      const user = await env.USER_KV.get('current-user', 'json');

      return new Response(JSON.stringify(user), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Fetch from origin for uncached content
    return fetch(request);
  },
};
```

**Vercel Edge Functions:**

```typescript
// middleware.ts or API route with edge runtime
export const config = { runtime: 'edge' };

export default async function handler(request: Request) {
  const country = request.headers.get('x-vercel-ip-country');
  const city = request.headers.get('x-vercel-ip-city');

  // Personalize based on geolocation
  const content = await getLocalizedContent(country);

  return new Response(JSON.stringify(content), {
    headers: { 'Content-Type': 'application/json' },
  });
}
```

**Deno Deploy:**

```typescript
// Deno Deploy -- built on Deno runtime, V8 isolates
Deno.serve(async (request: Request) => {
  const url = new URL(request.url);

  if (url.pathname === '/api/time') {
    return new Response(JSON.stringify({ time: new Date().toISOString() }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Serve static files from edge
  return new Response('Not found', { status: 404 });
});
```

**AWS Lambda@Edge / CloudFront Functions:**

```javascript
// CloudFront Function (lightweight, <1ms execution)
function handler(event) {
  const request = event.request;
  const headers = request.headers;

  // A/B testing at the edge
  if (!headers.cookie || !headers.cookie.value.includes('ab-test')) {
    const variant = Math.random() < 0.5 ? 'a' : 'b';
    request.headers['x-ab-variant'] = { value: variant };
  }

  return request;
}
```

### Edge vs Serverless vs Traditional Server

```
+-------------------------------------------------------------------+
|                    DEPLOYMENT ARCHITECTURES                        |
+-------------------------------------------------------------------+

Traditional Server (Origin)
+------------------+
| Single server    |  - Full Node.js runtime
| or server fleet  |  - Persistent connections (WebSockets, DB pools)
| in one region    |  - Full filesystem access
|                  |  - No cold start (always running)
+------------------+  - High latency for distant users
        |
        v
    Response: 50-300ms (depends on user distance)

Serverless (Regional Functions)
+--------+ +--------+ +--------+
| us-east| | eu-west| | ap-east|    - Full Node.js runtime
|  fn()  | |  fn()  | |  fn()  |    - Cold starts (100-500ms)
+--------+ +--------+ +--------+    - Scales to zero
        |                           - Pay per invocation
        v                           - 1-3 regions typical
    Response: 50-150ms + cold start

Edge (Global V8 Isolates)
+--+ +--+ +--+ +--+ +--+ +--+
|NY| |SF| |LN| |TK| |SY| |SP|     - V8 isolate (not full Node.js)
+--+ +--+ +--+ +--+ +--+ +--+     - Near-zero cold start (<5ms)
 |    |    |    |    |    |        - 100-300+ locations
 v    v    v    v    v    v        - Limited CPU/memory
    Response: 5-50ms               - Restricted APIs
```

### Key Constraints of Edge Runtimes

| Constraint         | Edge                  | Serverless   | Origin            |
| ------------------ | --------------------- | ------------ | ----------------- |
| **Runtime**        | V8 isolate (Web APIs) | Full Node.js | Full Node.js      |
| **Cold start**     | <5ms                  | 100-500ms    | N/A (always warm) |
| **Max execution**  | 10-30s typical        | 5-15 min     | Unlimited         |
| **Memory**         | 128MB typical         | 128MB-10GB   | Unlimited         |
| **File system**    | None                  | /tmp only    | Full              |
| **Native modules** | No (C++ addons)       | Yes          | Yes               |
| **WebSocket**      | Limited               | Yes          | Yes               |
| **Database**       | HTTP-based only       | Any          | Any               |
| **NPM packages**   | Web-compatible only   | All          | All               |

### What Works at the Edge

```
GOOD for Edge:                       BAD for Edge:
+---------------------------+        +---------------------------+
| Authentication/JWT verify |        | Heavy image processing    |
| Geolocation routing       |        | PDF generation           |
| A/B testing               |        | Machine learning inference|
| Personalization           |        | Long-running computations|
| Request/response transform|        | WebSocket servers        |
| Feature flags             |        | Database migrations      |
| Bot detection             |        | Full ORM queries         |
| Redirects & rewrites      |        | Native module deps       |
| HTML streaming            |        | Large file operations    |
| Cache orchestration       |        | Complex data pipelines   |
+---------------------------+        +---------------------------+
```

### Partial Prerendering (PPR) in Next.js

PPR is the most significant architectural innovation for edge rendering. It combines static and dynamic content in a single response:

```
Traditional SSR:
  Request --> Render ENTIRE page --> Send HTML
  (Page is as slow as the slowest data fetch)

PPR:
  Request --> Send static shell INSTANTLY from CDN
          --> Stream dynamic parts as they resolve
  (Static parts are instant, dynamic parts stream in)
```

```tsx
// app/product/[id]/page.tsx

import { Suspense } from 'react';

// This component is static -- prerendered at build time
function ProductHeader({ product }) {
  return (
    <div>
      <h1>{product.name}</h1>
      <p>{product.description}</p>
      <img src={product.image} alt={product.name} />
    </div>
  );
}

// This component is dynamic -- rendered at request time
async function ProductReviews({ productId }) {
  const reviews = await fetchReviews(productId);
  return (
    <div>
      <h2>Reviews ({reviews.length})</h2>
      {reviews.map((r) => (
        <div key={r.id}>
          <p>{r.text}</p>
          <span>{r.rating}/5</span>
        </div>
      ))}
    </div>
  );
}

// This component is dynamic -- depends on request headers
async function PersonalizedRecommendations({ productId }) {
  const recs = await fetchRecommendations(productId, cookies());
  return (
    <div>
      <h2>Recommended for You</h2>
      {recs.map((r) => (
        <ProductCard key={r.id} product={r} />
      ))}
    </div>
  );
}

export default async function ProductPage({ params }) {
  const { id } = await params;
  const product = await fetchProduct(id);

  return (
    <div>
      {/* Static: served instantly from CDN */}
      <ProductHeader product={product} />

      {/* Dynamic: streams in when data is ready */}
      <Suspense fallback={<ReviewsSkeleton />}>
        <ProductReviews productId={id} />
      </Suspense>

      {/* Dynamic: personalized, streams independently */}
      <Suspense fallback={<RecommendationsSkeleton />}>
        <PersonalizedRecommendations productId={id} />
      </Suspense>
    </div>
  );
}
```

**How PPR works:**

1. At build time, Next.js renders the static parts of the page and stores them as a static HTML shell
2. The shell includes Suspense fallbacks where dynamic content will go
3. When a request arrives, the CDN/edge serves the static shell immediately
4. The server renders the dynamic parts and streams them to the client
5. The client replaces fallbacks with real content as chunks arrive

### Streaming SSR from the Edge

Even without PPR, streaming SSR from the edge provides significant performance benefits:

```tsx
// Next.js Edge Runtime page
export const runtime = 'edge';

export default async function DashboardPage() {
  return (
    <div>
      <h1>Dashboard</h1>

      {/* Each Suspense boundary is a stream boundary */}
      <Suspense fallback={<Skeleton type="stats" />}>
        <StatsCards />
      </Suspense>

      <div className="grid grid-cols-2 gap-4">
        <Suspense fallback={<Skeleton type="chart" />}>
          <RevenueChart />
        </Suspense>

        <Suspense fallback={<Skeleton type="table" />}>
          <RecentOrders />
        </Suspense>
      </div>
    </div>
  );
}
```

The edge node starts streaming HTML immediately. As each async component resolves, its HTML is streamed to the client. The user sees content progressively, with the fastest data appearing first regardless of its position on the page.

### Edge-First Architecture Patterns

**Pattern 1: Edge Gateway with Origin Fallback**

```
                    +-------------+
  User Request ---> | Edge Node   |
                    |             |
                    | 1. Check    |     +--------+
                    |    cache    |---->| Origin |
                    | 2. Auth     |     | Server |
                    | 3. A/B test |     +--------+
                    | 4. Transform|
                    +-------------+
                         |
                    Personalized
                    Response
```

```typescript
// middleware.ts -- runs at the edge for every request
import { NextResponse } from 'next/server';

export function middleware(request) {
  const response = NextResponse.next();

  // Feature flags at the edge
  const flags = getFeatureFlags(request.cookies);
  response.headers.set('x-feature-flags', JSON.stringify(flags));

  // Geolocation-based routing
  const country = request.geo?.country || 'US';
  if (country === 'CN' && !request.nextUrl.pathname.startsWith('/zh')) {
    return NextResponse.redirect(
      new URL('/zh' + request.nextUrl.pathname, request.url)
    );
  }

  // Bot detection
  const ua = request.headers.get('user-agent') || '';
  if (isBot(ua)) {
    response.headers.set('x-is-bot', 'true');
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

**Pattern 2: Edge Data with Global Stores**

```
+------+     +------+     +------+
| Edge |     | Edge |     | Edge |
| Node |     | Node |     | Node |
+--+---+     +--+---+     +--+---+
   |            |            |
   v            v            v
+-------------------------------+
|    Globally Distributed DB    |
|  (Cloudflare KV, Turso,      |
|   PlanetScale, Neon)          |
+-------------------------------+
```

```typescript
// Using Turso (SQLite at the edge) with Drizzle ORM
import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const db = drizzle(client);

// This runs at the edge with <10ms DB latency
export async function getProduct(id: string) {
  const result = await db
    .select()
    .from(products)
    .where(eq(products.id, id))
    .limit(1);

  return result[0] || null;
}
```

**Pattern 3: Hybrid Rendering**

```typescript
// next.config.ts -- different rendering strategies per route
const nextConfig = {
  experimental: {
    ppr: true, // Enable Partial Prerendering
  },
};

// Static pages: served from CDN
// app/about/page.tsx -- no dynamic data, fully prerendered

// Edge-rendered pages: low latency, no cold start
// app/dashboard/page.tsx
export const runtime = 'edge';

// Serverless pages: full Node.js for heavy computation
// app/api/generate-report/route.ts
export const runtime = 'nodejs';
export const maxDuration = 60; // 60 second timeout
```

### Cold Start Comparison

```
Cold Start Times (approximate, varies by provider/config):

Cloudflare Workers:    |== 0-5ms
Deno Deploy:           |=== 0-10ms
Vercel Edge Functions: |==== 5-15ms
AWS Lambda@Edge:       |============== 50-200ms
AWS Lambda (Node.js):  |=========================== 100-500ms
AWS Lambda (Java):     |==================================================== 500-5000ms

Legend: Each = represents ~10ms
```

### Performance Implications

**Time to First Byte (TTFB):**

```
Architecture               TTFB (US user, US origin)  TTFB (Japan user, US origin)
---------------------      -------------------------  ----------------------------
Static CDN                 ~20ms                      ~30ms
Edge-rendered              ~30ms                      ~40ms
Serverless (US-East)       ~60ms                      ~200ms
Origin server (US-East)    ~50ms                      ~200ms
PPR (static shell)         ~20ms                      ~30ms
PPR (dynamic streams)      ~100ms (progressive)       ~150ms (progressive)
```

**When Edge Makes Sense:**

- Your users are globally distributed
- Low TTFB is critical (e-commerce, media)
- Content is personalized but computation is light
- You need authentication/authorization on every request
- A/B testing or feature flags per request

**When Edge Does NOT Make Sense:**

- Heavy computation (image processing, ML inference)
- Database-heavy workloads with non-edge-compatible databases
- Your users are all in one region (use regional serverless)
- You need WebSocket connections
- You depend on Node.js-specific APIs or native modules

---

## Common Interview Questions

### Q1: Explain the difference between edge functions, serverless functions, and traditional servers.

**Answer:** Traditional servers are long-running processes in a specific data center. They handle all requests, maintain persistent connections (database pools, WebSockets), and have full access to the operating system. The downside is fixed cost (running even when idle) and high latency for geographically distant users.

Serverless functions (AWS Lambda, Vercel Serverless Functions) are ephemeral compute instances that spin up on demand and scale to zero. They run a full Node.js runtime but have cold starts (100-500ms) and are typically deployed to 1-3 regions. They are cost-effective for sporadic traffic but add latency from cold starts and geographic distance.

Edge functions run on V8 isolates at CDN points of presence worldwide (100-300+ locations). They have near-zero cold starts (<5ms) and sub-50ms latency for global users. The tradeoff is a restricted runtime: no file system, no native modules, limited execution time, and only Web-standard APIs. They are ideal for request transformation, authentication, personalization, and light rendering -- not for heavy computation.

### Q2: What is Partial Prerendering and why is it significant?

**Answer:** Partial Prerendering (PPR) combines static and dynamic rendering in a single page response. The static parts of a page (header, navigation, layout, product images) are prerendered at build time and served instantly from the CDN. The dynamic parts (user-specific recommendations, real-time prices, personalized content) are rendered at request time and streamed to the client.

This is significant because it eliminates the traditional static-vs-dynamic tradeoff. Previously, you had to choose: SSG for speed (but stale data) or SSR for freshness (but slow TTFB). PPR gives you both -- instant static shell with progressive dynamic content.

The technical mechanism uses React Suspense boundaries. Everything outside a Suspense boundary is static; everything inside is dynamic. The static shell is cached at the CDN edge, and when a request arrives, the edge serves the shell immediately while the server renders the dynamic parts in parallel.

### Q3: When would you choose to deploy an application to the edge vs a regional serverless function?

**Answer:** I would choose edge for applications with global users where low latency matters: e-commerce product pages, media sites, marketing pages with personalization, and any application where TTFB directly impacts conversion rates. Edge is also ideal for middleware-type work: authentication, A/B testing, geolocation routing, and request transformation.

I would choose regional serverless for applications with compute-heavy request handling: API endpoints that process data, generate reports, or interact with regional databases. If most of your users are in one geography, the latency benefit of edge is minimal and the runtime constraints are a cost without benefit.

A hybrid approach is often best: edge middleware for auth and routing, edge rendering for the HTML shell, and regional serverless for heavy API endpoints. Next.js supports this with per-route runtime selection.

### Q4: What are the database options for edge applications?

**Answer:** Traditional databases like PostgreSQL and MySQL cannot be accessed directly from edge functions because they use TCP connections, which are not available in V8 isolates. Edge-compatible database options include:

HTTP-based database access: PlanetScale (MySQL-compatible, HTTP API), Neon (Postgres with serverless driver), Supabase (Postgres via REST/GraphQL). These work from edge functions but add HTTP overhead to each query.

Globally distributed databases: Cloudflare D1 (SQLite at the edge), Turso (libSQL/SQLite with global replication), CockroachDB (distributed Postgres-compatible), DynamoDB Global Tables. These provide both edge compatibility and low-latency data access by replicating data to edge locations.

Key-value stores: Cloudflare KV, Vercel KV (Redis-compatible), Upstash Redis. These are fast for simple lookups but limited for complex queries.

The general pattern is: use a globally distributed or HTTP-based database for reads, and route writes to a primary region to avoid consistency issues.

### Q5: How does streaming SSR differ from traditional SSR?

**Answer:** Traditional SSR waits for the entire page to render before sending any HTML. If the page has three data fetches taking 50ms, 200ms, and 500ms, the user waits 500ms for any content. The entire HTML document is sent as one response.

Streaming SSR sends HTML progressively as it becomes available. The server sends the HTML shell and the results of fast data fetches immediately. Slow sections show skeleton fallbacks that are replaced by real content as it streams in. The user sees meaningful content in 50ms, more content at 200ms, and the final section at 500ms.

Under the hood, streaming SSR uses HTTP chunked transfer encoding. React's `renderToPipeableStream` (Node.js) or `renderToReadableStream` (Edge/Web) produce a stream that the server writes to incrementally. Each Suspense boundary is a potential chunk boundary.

The combination of streaming SSR and edge deployment is particularly powerful: the edge node is close to the user (low latency for each chunk), and streaming means the user does not wait for the slowest data source.

---

## Gotchas & Edge Cases

1. **Edge functions have size limits.** Cloudflare Workers have a 1MB compressed limit for the worker bundle. Vercel Edge Functions have a 4MB limit. Large dependencies (ORMs, heavy SDKs) may not fit. Tree-shaking and bundle optimization are critical.

2. **No persistent state at the edge.** Each request may hit a different edge node. You cannot store state in memory between requests. Use external stores (KV, databases) for any state that needs to persist.

3. **Edge caching is not automatic.** Just because your function runs at the edge does not mean responses are cached. You need explicit `Cache-Control` headers or platform-specific caching APIs (`caches.open()` in Cloudflare Workers, `cache()` in Next.js).

4. **Globally distributed writes are hard.** Reading from edge replicas is fast, but writes must propagate to all replicas. Eventual consistency means a user might write data and not see it immediately if the next request hits a different replica. Use "read your own writes" patterns or route writes to the primary region.

5. **Environment variable availability.** Some edge platforms do not support `process.env`. Cloudflare uses `env` parameter bindings, Vercel Edge uses `process.env`, and Deno Deploy uses `Deno.env`. Abstraction layers like environment variable bindings are platform-specific.

6. **Date and timezone handling.** Edge functions run in UTC by default and may not have access to the full IANA timezone database. If your application needs timezone-aware date formatting, you may need to include timezone data in your bundle or use the Intl API carefully.

7. **Streaming and error handling.** Once you start streaming HTML to the client, you cannot change the HTTP status code. If a Suspense boundary resolves to an error after the 200 status and headers have been sent, you must handle the error in the HTML stream (error boundaries) rather than returning a 500 status.

8. **PPR and caching interaction.** The static shell in PPR is cached, but the dynamic parts are not (by default). If a dynamic part is slow, it blocks that stream but not the rest of the page. However, if you cache a dynamic part, stale data may appear in the stream. Understanding the caching layer is essential.

9. **CORS at the edge.** If your edge function serves API responses, you need to handle CORS headers explicitly. The edge runtime does not automatically add CORS headers, and forgetting them causes confusing client-side errors.

10. **Cost model differences.** Edge execution is typically billed per request with CPU time limits. Heavy computation at the edge is not just slow -- it can be expensive. A function that takes 50ms of CPU at 300 edge locations costs more per request than a single serverless function taking 50ms.

---

## Quick Reference

| Platform                 | Runtime           | Locations | Cold Start | Max Execution | Max Bundle     |
| ------------------------ | ----------------- | --------- | ---------- | ------------- | -------------- |
| Cloudflare Workers       | V8 isolate        | 300+      | <5ms       | 30s (paid)    | 1MB compressed |
| Vercel Edge Functions    | V8 isolate        | 30+       | <15ms      | 30s           | 4MB            |
| Deno Deploy              | V8 isolate (Deno) | 35+       | <10ms      | 50s           | 20MB           |
| AWS Lambda@Edge          | Node.js/Python    | 200+      | 50-200ms   | 30s           | 50MB           |
| AWS CloudFront Functions | Lightweight JS    | 400+      | <1ms       | 1ms           | 10KB           |
| Netlify Edge Functions   | Deno              | 30+       | <10ms      | 50s           | 20MB           |

| Next.js Rendering Strategy | When to Use                  | TTFB            | Freshness                   |
| -------------------------- | ---------------------------- | --------------- | --------------------------- |
| Static (SSG)               | Content rarely changes       | Instant (CDN)   | Stale until rebuild         |
| ISR                        | Content changes periodically | Instant (CDN)   | Stale within window         |
| SSR (Node.js)              | Complex computation needed   | Medium          | Always fresh                |
| SSR (Edge)                 | Needs global low latency     | Low             | Always fresh                |
| PPR                        | Mix of static + dynamic      | Instant (shell) | Shell cached, dynamic fresh |

| Edge Database   | Type     | Global Replication  | Best For               |
| --------------- | -------- | ------------------- | ---------------------- |
| Cloudflare D1   | SQLite   | Yes (read replicas) | Simple queries at edge |
| Turso / libSQL  | SQLite   | Yes                 | Full SQL at edge       |
| PlanetScale     | MySQL    | Yes                 | MySQL workloads        |
| Neon            | Postgres | Regional            | Postgres with HTTP     |
| Upstash Redis   | KV/Redis | Yes                 | Cache, sessions        |
| Cloudflare KV   | KV       | Yes (eventual)      | Config, feature flags  |
| DynamoDB Global | NoSQL    | Yes                 | High-throughput reads  |
