# Cloudflare Workers & Edge Compute

Cloudflare Workers is a serverless platform that runs JavaScript/TypeScript/Wasm at the edge in 300+ cities worldwide. Unlike AWS Lambda (which runs in containers in a few regions), Workers use **V8 isolates** -- the same runtime that powers Chrome -- giving them near-zero cold starts and global distribution by default.

---

## Table of Contents

1. [V8 Isolates vs Containers](#v8-isolates-vs-containers)
2. [Workers Runtime](#workers-runtime)
3. [Workers KV](#workers-kv)
4. [Durable Objects](#durable-objects)
5. [Hyperdrive](#hyperdrive)
6. [Runtime Limits](#runtime-limits)
7. [Architecture Patterns](#architecture-patterns)
8. [Common Interview Questions](#common-interview-questions)

---

## V8 Isolates vs Containers

```
AWS Lambda (Container-based)                 Cloudflare Workers (V8 Isolate-based)
+----------------------------------+         +----------------------------------+
| VM                               |         | V8 Engine Process                |
| +------------------------------+ |         | +--------+ +--------+ +--------+|
| | Container                    | |         | |Isolate | |Isolate | |Isolate ||
| | +-------+ +-------+         | |         | |Worker A| |Worker B| |Worker C||
| | | Node  | | Your  |         | |         | +--------+ +--------+ +--------+|
| | |Runtime| | Code  |         | |         | Shared memory, separate heaps    |
| | +-------+ +-------+         | |         +----------------------------------+
| +------------------------------+ |
+----------------------------------+

Cold start: 100-500ms                        Cold start: <5ms
Memory: 128MB-10GB per function              Memory: 128MB shared
Deploy: specific regions                     Deploy: 300+ cities globally
```

### Why Isolates Are Faster

| Aspect | Container (Lambda) | V8 Isolate (Workers) |
| ------ | ------------------ | -------------------- |
| **Cold start** | 100-500ms (provision container, load runtime) | <5ms (create isolate in existing V8 process) |
| **Memory overhead** | ~35MB base (Node.js runtime) | <1MB per isolate |
| **Isolation** | OS-level (full process isolation) | V8 sandbox (memory isolation, shared CPU) |
| **Startup** | Pull image, boot OS, load runtime, init code | Instantiate isolate, compile code |
| **Global deploy** | Must configure per-region | Automatic in all 300+ PoPs |

### Trade-offs

- **No filesystem access** -- Workers have no `/tmp` or local disk
- **No native modules** -- Cannot use Node.js native addons (C++ modules)
- **Limited APIs** -- Not full Node.js; uses Web Standards APIs (fetch, Request, Response, crypto, etc.)
- **CPU limits** -- 10ms (free) or 30s (paid) CPU time per request
- **Memory limits** -- 128MB per isolate

---

## Workers Runtime

### Basic Worker

```javascript
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/hello") {
      return new Response(JSON.stringify({ message: "Hello from the edge!" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Proxy to origin
    return fetch(request);
  },

  // Scheduled (cron) handler
  async scheduled(event, env, ctx) {
    // Runs on a cron schedule
    await env.MY_KV.put("last_cron", new Date().toISOString());
  },

  // Queue consumer
  async queue(batch, env) {
    for (const message of batch.messages) {
      console.log(message.body);
      message.ack();
    }
  },
};
```

### Request Lifecycle

```
User in Tokyo
     |
     v (nearest PoP)
+------------------+
| Cloudflare Tokyo |
| +--------+       |
| | Worker |       |  <-- Your code runs HERE (edge)
| +--------+       |
+------------------+
     |
     v (if needed)
+------------------+
| Origin Server    |  <-- Your backend (optional with Workers)
| (us-east-1)     |
+------------------+
```

### Environment Bindings

Workers access services through `env` bindings (like dependency injection):

```javascript
// wrangler.toml
// [[kv_namespaces]]
// binding = "MY_KV"
// id = "abc123"
//
// [[r2_buckets]]
// binding = "MY_BUCKET"
// bucket_name = "my-bucket"
//
// [[d1_databases]]
// binding = "MY_DB"
// database_id = "def456"

export default {
  async fetch(request, env) {
    // KV
    const value = await env.MY_KV.get("key");

    // R2
    const object = await env.MY_BUCKET.get("file.jpg");

    // D1
    const results = await env.MY_DB.prepare("SELECT * FROM users WHERE id = ?")
      .bind(1)
      .all();

    // Durable Object
    const id = env.MY_DO.idFromName("room-123");
    const stub = env.MY_DO.get(id);
    const response = await stub.fetch(request);
  },
};
```

---

## Workers KV

A global, low-latency key-value store optimized for **read-heavy workloads**.

```
Write in us-east-1
     |
     v
+------------------+
| Central Store    |  <-- Writes go to central
+------------------+
     |
     v (async replication, <60s)
+--------+  +--------+  +--------+
| Tokyo  |  | London |  | Sydney |  <-- Reads from nearest PoP
| cache  |  | cache  |  | cache  |
+--------+  +--------+  +--------+
```

### Characteristics

| Feature | Details |
| ------- | ------- |
| **Consistency** | Eventually consistent (writes propagate in <60s globally) |
| **Latency** | <10ms reads from edge cache |
| **Max key size** | 512 bytes |
| **Max value size** | 25 MB |
| **Max keys** | Unlimited |
| **Operations** | get, put, delete, list |
| **TTL** | Optional expiration per key |

### When to Use KV

| Good For | Bad For |
| -------- | ------- |
| Configuration/feature flags | Strong consistency requirements |
| Static content (HTML/CSS/JS) | Counters or frequently updated data |
| Cached API responses | Multi-key transactions |
| User session data | Data with <60s freshness needs |

---

## Durable Objects

Durable Objects provide **strong consistency** and **stateful compute** at the edge. Each Durable Object is a single-threaded actor with its own storage.

```
+----------------------------------------------------------+
| Durable Object: ChatRoom "room-123"                       |
| +------------------------------------------------------+ |
| | JavaScript class instance (single-threaded)          | |
| | - In-memory state (this.connections, this.messages)  | |
| | - Transactional SQLite storage (this.ctx.storage)    | |
| | - WebSocket connections                              | |
| +------------------------------------------------------+ |
| Location: auto-selected based on first request            |
+----------------------------------------------------------+
```

### How They Work

```javascript
export class ChatRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.sessions = [];
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") === "websocket") {
      const [client, server] = Object.values(new WebSocketPair());
      server.accept();
      this.sessions.push(server);

      server.addEventListener("message", (event) => {
        // Broadcast to all connected clients
        for (const session of this.sessions) {
          session.send(event.data);
        }
      });

      return new Response(null, { status: 101, webSocket: client });
    }

    // Transactional storage
    const count = (await this.ctx.storage.get("message_count")) || 0;
    await this.ctx.storage.put("message_count", count + 1);

    return new Response(JSON.stringify({ count: count + 1 }));
  }
}
```

### Key Properties

| Property | Details |
| -------- | ------- |
| **Consistency** | Strong (single-threaded, one instance globally) |
| **Location** | Auto-placed near first request, or hint with locationHint |
| **Storage** | Transactional key-value + SQLite (durable, replicated) |
| **WebSockets** | Native support for real-time connections |
| **Concurrency** | Single-threaded per object (no race conditions) |
| **Billing** | Per-request + wall-clock duration + storage |

### Use Cases

| Pattern | Example |
| ------- | ------- |
| **Collaborative editing** | Google Docs-like real-time editing |
| **Chat rooms** | Each room is a Durable Object |
| **Rate limiting** | Per-user counters with strong consistency |
| **Game state** | Multiplayer game sessions |
| **Distributed locks** | Coordination between Workers |
| **Shopping carts** | Per-user stateful sessions |

---

## Hyperdrive

Connection pooling and caching proxy for external databases (PostgreSQL, MySQL).

```
Worker (Tokyo)                    Without Hyperdrive           With Hyperdrive
     |                            Worker -> DB (us-east)       Worker -> Hyperdrive (edge)
     |                            TCP + TLS + Auth = ~200ms    Pooled conn = ~20ms
     v                                                         |
+------------------+                                           v
| Hyperdrive       |                                    +------------------+
| (connection pool |                                    | PostgreSQL       |
|  at edge)        | --------------------------------> | (us-east-1)     |
+------------------+                                    +------------------+
```

| Feature | Details |
| ------- | ------- |
| **Connection pooling** | Maintains warm connections to your database |
| **Query caching** | Caches read queries at the edge (configurable) |
| **Supported DBs** | PostgreSQL, MySQL (any that support standard protocols) |
| **Latency reduction** | Eliminates TCP/TLS handshake on every request |

---

## Runtime Limits

| Limit | Free Plan | Paid Plan (Workers Paid) |
| ----- | --------- | ------------------------ |
| **CPU time** | 10ms per request | 30 seconds per request |
| **Memory** | 128 MB | 128 MB |
| **Request size** | 100 MB | 100 MB |
| **Response size** | Unlimited (streaming) | Unlimited (streaming) |
| **Subrequests (fetch)** | 50 per request | 1,000 per request |
| **KV reads** | 100,000/day | Unlimited |
| **KV writes** | 1,000/day | Unlimited |
| **Environment vars** | 64 per Worker | 128 per Worker |
| **Worker size** | 1 MB | 10 MB (after compression) |

**CPU time vs wall-clock time:** CPU time is the actual time your code uses the CPU. Waiting for I/O (fetch, KV.get) does not count. A Worker that makes 3 sequential fetch calls taking 500ms each but only uses 2ms of CPU time uses 2ms of CPU time.

---

## Architecture Patterns

### Full-Stack at the Edge

```
Client
  |
  v
+--Workers-----------+
| Router (fetch)     |
| +--API Routes------+
| | /api/users  -> D1 query    |
| | /api/upload -> R2 put      |
| | /api/config -> KV get      |
| | /api/chat   -> Durable Obj |
| +--------------------------- +
| Static: Pages or KV          |
+-----------------------------+
```

### Workers as API Gateway

```
Client -> Worker (edge) -> Origin API (data center)
              |
              +-- Rate limiting (Durable Objects)
              +-- Auth validation (JWT verify)
              +-- Response caching (Cache API)
              +-- Request transformation
              +-- A/B testing (KV flags)
```

---

## Common Interview Questions

1. **How do V8 isolates differ from containers?** Isolates share a V8 engine process but have separate heaps. No cold start (unlike containers that need OS boot + runtime init). Trade-off: less isolation (shared process) and limited APIs (no filesystem, no native modules).

2. **What is the consistency model of Workers KV?** Eventually consistent. Writes propagate globally within ~60 seconds. Not suitable for data requiring strong consistency (use Durable Objects instead).

3. **When would you use Durable Objects vs KV?** KV: read-heavy, eventually consistent, simple key-value. Durable Objects: strong consistency, stateful compute, WebSockets, coordination between requests.

4. **What are the limitations of Workers?** 128MB memory, 10ms/30s CPU time, no filesystem, no native Node.js modules, limited to Web Standards APIs. Worker script size limited to 1-10MB.

5. **How does Cloudflare's edge differ from AWS Lambda@Edge?** Workers run in 300+ cities (vs Lambda@Edge in ~30 CloudFront PoPs). Workers have <5ms cold starts (vs 100ms+ for Lambda@Edge). Workers have richer storage primitives (KV, DO, D1, R2).

6. **How would you build a real-time chat application on Cloudflare?** Use Durable Objects as chat room actors with WebSocket support. Each room is a single-threaded DO instance. Messages broadcast to all connected clients. Message history stored in DO's transactional storage.

7. **What is Hyperdrive and why is it needed?** Workers run at the edge, far from databases. Each request would need TCP+TLS+auth handshake (~200ms). Hyperdrive maintains a connection pool at the edge, reducing latency to ~20ms. Also caches read queries.
