# Modern JavaScript/TypeScript Runtimes

## Introduction

The JavaScript runtime landscape has fractured in the best possible way. For over a decade, Node.js was the only serious server-side JavaScript runtime. In 2026, engineers must understand three production-grade runtimes -- Node.js, Bun, and Deno -- each with distinct architectures, philosophies, and sweet spots.

This is not about picking a "winner." It is about understanding the engineering trade-offs so deeply that you can justify your choice for any given workload.

## Architecture Overview

```
+------------------------------------------------------------------+
|                    RUNTIME ARCHITECTURE COMPARISON                |
+------------------------------------------------------------------+
|                                                                  |
|  NODE.JS 22+              BUN 1.x              DENO 2.0         |
|  +-----------+         +-----------+         +-----------+       |
|  |  Your JS  |         |  Your JS  |         |  Your TS  |       |
|  +-----------+         +-----------+         +-----------+       |
|  | V8 Engine |         | JSCore    |         | V8 Engine |       |
|  +-----------+         +-----------+         +-----------+       |
|  | libuv     |         | Custom IO |         | Tokio     |       |
|  | (C/C++)   |         | (Zig)     |         | (Rust)    |       |
|  +-----------+         +-----------+         +-----------+       |
|  | OpenSSL   |         | BoringSSL |         | rustls    |       |
|  +-----------+         +-----------+         +-----------+       |
|                                                                  |
|  Event Loop: libuv     Event Loop: custom    Event Loop: Tokio   |
|  Language: C/C++       Language: Zig/C++     Language: Rust      |
|  Package: npm          Package: npm+bun      Package: npm+jsr    |
|  TS: via transpiler    TS: native            TS: native          |
|                                                                  |
+------------------------------------------------------------------+
```

---

## Node.js 22+ (LTS)

### What Changed in Node.js 22

Node.js 22 (LTS from October 2024) represents the most significant modernization push in Node's history. The core team addressed years of developer friction points without breaking backward compatibility.

### Permission Model

Node.js now includes a permission model inspired by Deno's security-first approach. This is critical for running untrusted code and for defense-in-depth in production.

```bash
# Run with restricted permissions
node --experimental-permission \
  --allow-fs-read=/app/data \
  --allow-fs-write=/app/logs \
  --allow-child-process \
  app.js
```

```
+------------------------------------------+
|           NODE.JS PERMISSION MODEL       |
+------------------------------------------+
|                                          |
|  --allow-fs-read=<path>     File read    |
|  --allow-fs-write=<path>    File write   |
|  --allow-child-process      Spawn procs  |
|  --allow-worker             Worker thrds |
|  --allow-wasi               WASI access  |
|                                          |
|  Default: ALL DENIED when flag is set    |
|  Without flag: ALL ALLOWED (legacy)      |
|                                          |
+------------------------------------------+
```

**Interview insight**: The permission model is opt-in, not opt-out. This was a deliberate decision to avoid breaking the entire npm ecosystem. Deno chose opt-out (deny by default), which caused significant friction with npm packages.

### Single Executable Applications (SEA)

Node.js can now compile your application into a single executable binary. This eliminates the need to install Node.js on the target machine.

```bash
# 1. Create SEA configuration
echo '{ "main": "app.js", "output": "sea-prep.blob" }' > sea-config.json

# 2. Generate the blob
node --experimental-sea-config sea-config.json

# 3. Copy Node binary and inject blob
cp $(command -v node) my-app
npx postject my-app NODE_SEA_BLOB sea-prep.blob \
  --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2

# 4. Run your single binary
./my-app
```

**Trade-off**: SEA binaries are ~80-100MB because they embed the entire V8 engine. Bun's `bun build --compile` produces ~50MB binaries. Go and Rust still produce much smaller binaries (5-20MB).

### Native Test Runner

No more installing Jest, Vitest, or Mocha for simple projects. Node.js 22 ships a stable, built-in test runner.

```javascript
// test/math.test.js
import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { add, fetchUser } from '../src/math.js';

describe('Math utilities', () => {
  it('adds two numbers', () => {
    assert.strictEqual(add(2, 3), 5);
  });

  it('handles negative numbers', () => {
    assert.strictEqual(add(-1, 1), 0);
  });
});

describe('User fetching', () => {
  it('returns user data', async () => {
    // Built-in mocking
    const mockFetch = mock.fn(async () => ({
      json: async () => ({ id: 1, name: 'Alice' }),
    }));

    mock.method(globalThis, 'fetch', mockFetch);

    const user = await fetchUser(1);
    assert.deepStrictEqual(user, { id: 1, name: 'Alice' });
    assert.strictEqual(mockFetch.mock.calls.length, 1);
  });
});
```

```bash
# Run tests with various reporters
node --test                           # Default TAP output
node --test --test-reporter=spec      # Human-readable output
node --test --test-reporter=dot       # Minimal dot output
node --test --test-concurrency=4      # Parallel execution
node --test --experimental-test-coverage  # Coverage reporting
```

### Watch Mode

```bash
# Restart on file changes (replaces nodemon)
node --watch app.js

# Watch mode for tests
node --test --watch
```

### Built-in .env Support

```bash
# Load .env file automatically
node --env-file=.env app.js

# Multiple env files with precedence
node --env-file=.env --env-file=.env.local app.js
```

### Native WebSocket Client

```javascript
// No more installing 'ws' package for client-side WebSocket
const ws = new WebSocket('ws://localhost:8080');

ws.addEventListener('open', () => {
  ws.send(JSON.stringify({ type: 'subscribe', channel: 'updates' }));
});

ws.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  // Process message...
});
```

### Performance Improvements in Node 22

- **Maglev compiler** in V8: JIT compilation improvements yield 5-15% throughput gains
- **require(esm)** now works: Synchronous require() of ES modules eliminates dual-package hazard
- **WebStreams performance**: 2-3x improvement in stream processing throughput
- **Startup time**: ~30% faster with V8 snapshot improvements

---

## Bun

### Architecture Deep Dive

Bun's key architectural decision was choosing JavaScriptCore (JSC) over V8. This single choice cascades into nearly every performance characteristic.

```
+------------------------------------------------------------------+
|                    BUN INTERNAL ARCHITECTURE                     |
+------------------------------------------------------------------+
|                                                                  |
|  +-----------------------------------------------------------+  |
|  |                    JavaScript Code                         |  |
|  +-----------------------------------------------------------+  |
|  |              JavaScriptCore (WebKit Engine)                |  |
|  |  +--------+  +--------+  +--------+  +--------+           |  |
|  |  |  LLInt |->|Baseline|->|  DFG   |->|  FTL   |           |  |
|  |  |Interp. |  |  JIT   |  |  JIT   |  |  JIT   |           |  |
|  |  +--------+  +--------+  +--------+  +--------+           |  |
|  |  (Interpret)  (Fast     (Optimized)  (LLVM-backed          |  |
|  |               compile)              max optimize)          |  |
|  +-----------------------------------------------------------+  |
|  |                    Bun Native Layer (Zig)                  |  |
|  |  +----------+  +----------+  +----------+  +----------+   |  |
|  |  | HTTP     |  | File I/O |  | Bundler  |  | Package  |   |  |
|  |  | Server   |  | (io_uring|  | (native) |  | Manager  |   |  |
|  |  | (uSock.) |  |  /kqueue)|  |          |  | (native) |   |  |
|  |  +----------+  +----------+  +----------+  +----------+   |  |
|  +-----------------------------------------------------------+  |
|                                                                  |
+------------------------------------------------------------------+
```

**Why JavaScriptCore?**

- JSC has a 4-tier JIT compilation pipeline (LLInt -> Baseline -> DFG -> FTL)
- The FTL tier uses LLVM backend for maximum optimization
- JSC has faster startup than V8 because the interpreter tier (LLInt) is lighter
- V8's 2-tier pipeline (Sparkplug -> TurboFan) optimizes differently -- better peak throughput for long-running code, but slower to reach peak performance

**Trade-off**: JSC has less investment in certain V8-specific optimizations like TurboFan's speculative optimization. For very long-running server processes, V8 can sometimes produce faster hot-path code. Bun compensates by implementing hot paths (HTTP, file I/O) in native Zig instead of JavaScript.

### Bun as an All-in-One Toolkit

```
+------------------------------------------------------------------+
|                    BUN'S INTEGRATED TOOLCHAIN                    |
+------------------------------------------------------------------+
|                                                                  |
|  TRADITIONAL STACK              BUN EQUIVALENT                   |
|  ----------------              ---------------                   |
|                                                                  |
|  node (runtime)        --->    bun (runtime)                     |
|  npm/yarn/pnpm         --->    bun install                       |
|  tsc/swc/esbuild       --->    bun (native TS)                   |
|  webpack/vite          --->    bun build (bundler)                |
|  jest/vitest           --->    bun test                           |
|  nodemon               --->    bun --watch                        |
|  dotenv                --->    built-in .env                      |
|  better-sqlite3        --->    bun:sqlite                        |
|  cross-env             --->    bun (cross-platform)               |
|                                                                  |
+------------------------------------------------------------------+
```

### Bun.serve() HTTP Server

```typescript
// High-performance HTTP server
const server = Bun.serve({
  port: 3000,

  // Handles ~150k req/s on a single core
  fetch(req: Request): Response | Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === '/api/users') {
      return Response.json([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ]);
    }

    if (url.pathname === '/stream') {
      // Streaming response
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue('Hello ');
          controller.enqueue('World');
          controller.close();
        },
      });
      return new Response(stream);
    }

    return new Response('Not Found', { status: 404 });
  },

  // WebSocket support built-in
  websocket: {
    open(ws) {
      ws.subscribe('chat');
    },
    message(ws, message) {
      ws.publish('chat', message);
    },
    close(ws) {
      ws.unsubscribe('chat');
    },
  },

  // TLS configuration
  tls: {
    cert: Bun.file('./cert.pem'),
    key: Bun.file('./key.pem'),
  },
});

console.log(`Server running on ${server.url}`);
```

### Built-in SQLite

```typescript
import { Database } from 'bun:sqlite';

const db = new Database('app.db');

// WAL mode for better concurrent read performance
db.run('PRAGMA journal_mode = WAL');
db.run('PRAGMA synchronous = NORMAL');

// Create tables
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

// Prepared statements (compiled once, executed many times)
const insertUser = db.prepare(
  'INSERT INTO users (email, name) VALUES ($email, $name) RETURNING *'
);

const getUser = db.prepare('SELECT * FROM users WHERE id = ?');

// Transaction support
const createUsers = db.transaction(
  (users: Array<{ email: string; name: string }>) => {
    const results = users.map((user) =>
      insertUser.get({ $email: user.email, $name: user.name })
    );
    return results;
  }
);

const newUsers = createUsers([
  { email: 'alice@example.com', name: 'Alice' },
  { email: 'bob@example.com', name: 'Bob' },
]);
```

### Shell Scripting with Bun

```typescript
import { $ } from 'bun';

// Shell commands with template literals
const branch = await $`git branch --show-current`.text();

// Piping
const count = await $`find src -name "*.ts" | wc -l`.text();

// Error handling
try {
  await $`npm test`;
} catch (err) {
  console.error(`Tests failed with exit code ${err.exitCode}`);
  console.error(err.stderr.toString());
}

// Environment variables
const result = await $`echo $HOME`.env({ HOME: '/custom/home' }).text();

// Quiet mode (suppress stdout)
await $`npm install`.quiet();
```

### Built-in S3 Client

```typescript
// Native S3 operations without aws-sdk
const file = Bun.s3('my-bucket/data.json', {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: 'us-east-1',
});

// Write
await file.write(JSON.stringify({ key: 'value' }));

// Read
const data = await file.json();

// Stream large files
const stream = file.stream();
```

---

## Deno 2.0

### Philosophy Shift

Deno 2.0 represents a pragmatic pivot. Deno 1.x was idealistic -- no npm, no package.json, URL imports only. Deno 2.0 embraces the npm ecosystem while retaining its security-first architecture.

```
+------------------------------------------------------------------+
|                    DENO 2.0 ARCHITECTURE                         |
+------------------------------------------------------------------+
|                                                                  |
|  +-----------------------------------------------------------+  |
|  |                    TypeScript Code                         |  |
|  |                (Native TS, no tsc needed)                  |  |
|  +-----------------------------------------------------------+  |
|  |                    V8 JavaScript Engine                    |  |
|  +-----------------------------------------------------------+  |
|  |              Deno Core (Rust + Tokio runtime)              |  |
|  |  +----------+  +----------+  +----------+  +----------+   |  |
|  |  |Permission |  |  npm     |  |  JSR     |  |  Deno    |   |  |
|  |  |  System   |  | Compat   |  | Registry |  |  KV      |   |  |
|  |  +----------+  +----------+  +----------+  +----------+   |  |
|  +-----------------------------------------------------------+  |
|  |                Tokio Async Runtime (Rust)                  |  |
|  |             (Multi-threaded async executor)                |  |
|  +-----------------------------------------------------------+  |
|                                                                  |
+------------------------------------------------------------------+
```

### Node/npm Compatibility

```typescript
// deno.json - Enable Node compatibility
{
  "nodeModulesDir": "auto",
  "imports": {
    "express": "npm:express@4",
    "lodash": "npm:lodash-es@4"
  }
}
```

```typescript
// Use npm packages directly
import express from 'npm:express@4';
import { z } from 'npm:zod';

const app = express();

const UserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});

app.post('/users', (req, res) => {
  const result = UserSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ errors: result.error.issues });
  }
  res.json({ user: result.data });
});

app.listen(3000);
```

### Permission Model (Production-Grade)

```bash
# Granular permissions
deno run \
  --allow-net=api.example.com,localhost:3000 \
  --allow-read=./data,./config \
  --allow-write=./logs \
  --allow-env=DATABASE_URL,API_KEY \
  --deny-net=evil.com \
  server.ts
```

```
+------------------------------------------+
|       DENO PERMISSION CATEGORIES         |
+------------------------------------------+
|                                          |
|  --allow-read       File system read     |
|  --allow-write      File system write    |
|  --allow-net        Network access       |
|  --allow-env        Env variables        |
|  --allow-run        Subprocess exec      |
|  --allow-ffi        Foreign functions    |
|  --allow-sys        System info          |
|  --allow-all / -A   Everything (dev)     |
|                                          |
|  --deny-*           Explicit deny        |
|  (deny overrides allow)                  |
|                                          |
+------------------------------------------+
```

**Interview insight**: Deno's permission model is the most mature. Node's is experimental. Bun has no permission model. For security-critical applications (fintech, healthcare), Deno's permissions are a genuine differentiator.

### JSR Registry

JSR (JavaScript Registry) is Deno's answer to npm's problems: native TypeScript publishing, no build step required, cross-runtime compatibility.

```typescript
// Publishing to JSR
// deno.json
{
  "name": "@myorg/utils",
  "version": "1.0.0",
  "exports": "./mod.ts"
}

// Publish directly -- TypeScript source, no compilation needed
// deno publish

// Consuming from JSR (works in Deno, Node, and Bun)
import { slugify } from 'jsr:@std/text/slugify';
```

### Deno KV (Built-in Key-Value Store)

```typescript
// Built-in KV store -- no external database needed
const kv = await Deno.openKv();

// Set a value
await kv.set(['users', 'user-123'], {
  name: 'Alice',
  email: 'alice@example.com',
  createdAt: new Date(),
});

// Get a value
const entry = await kv.get(['users', 'user-123']);
console.log(entry.value); // { name: 'Alice', ... }
console.log(entry.versionstamp); // Optimistic concurrency control

// Atomic operations (compare-and-swap)
const current = await kv.get(['counter']);
await kv
  .atomic()
  .check(current) // Fails if versionstamp changed
  .set(['counter'], (current.value ?? 0) + 1)
  .commit();

// List with prefix
const users = kv.list({ prefix: ['users'] });
for await (const entry of users) {
  console.log(entry.key, entry.value);
}

// Secondary indexes
async function createUser(user: { id: string; email: string; name: string }) {
  await kv
    .atomic()
    .set(['users', user.id], user)
    .set(['users_by_email', user.email], user.id)
    .commit();
}

// Enqueue (built-in message queue)
await kv.enqueue({ type: 'send_email', to: 'alice@example.com' });

kv.listenQueue(async (msg) => {
  if (msg.type === 'send_email') {
    await sendEmail(msg.to);
  }
});
```

---

## Runtime Comparison Table

```
+-------------------+------------------+------------------+------------------+
| Feature           | Node.js 22+      | Bun 1.x          | Deno 2.0         |
+-------------------+------------------+------------------+------------------+
| JS Engine         | V8               | JavaScriptCore   | V8               |
| Implementation    | C/C++            | Zig              | Rust             |
| TypeScript        | Via transpiler   | Native           | Native           |
| Startup Time      | ~40ms            | ~7ms             | ~25ms            |
| HTTP Throughput   | ~80k req/s       | ~150k req/s      | ~110k req/s      |
| npm Compatibility | 100%             | ~98%             | ~95%             |
| Package Manager   | npm/yarn/pnpm    | bun install      | deno add (+ npm) |
| Test Runner       | Built-in (stable)| Built-in         | Built-in         |
| Bundler           | No (use esbuild) | Built-in         | No (use esbuild) |
| Permission Model  | Experimental     | None             | Stable           |
| Windows Support   | Excellent        | Good             | Good             |
| Docker Image Size | ~180MB (alpine)  | ~150MB (alpine)  | ~130MB (alpine)  |
| Maturity          | 15+ years        | ~3 years         | ~6 years         |
| Enterprise Use    | Ubiquitous       | Growing          | Moderate         |
| Edge Runtime      | No               | No               | Deno Deploy      |
| Built-in DB       | No               | SQLite           | KV Store         |
+-------------------+------------------+------------------+------------------+
```

## When to Use Which Runtime

### Choose Node.js When:

- **Enterprise environments** with strict compatibility requirements
- **Existing large codebases** that rely on Node-specific APIs
- **Maximum npm compatibility** is non-negotiable
- **Team familiarity** -- most backend developers know Node
- **Mature tooling needed** -- debuggers, profilers, APM agents all support Node
- **Native addons** -- N-API ecosystem is most mature in Node

### Choose Bun When:

- **Startup time matters** -- CLI tools, serverless functions, development scripts
- **All-in-one toolkit desired** -- bundler, test runner, package manager in one
- **SQLite workloads** -- built-in SQLite is faster than any npm SQLite binding
- **Performance-sensitive APIs** -- HTTP server throughput is best-in-class
- **Developer experience** -- `bun install` is 10-25x faster than `npm install`
- **Monorepo tooling** -- Bun workspaces are fast and simple

### Choose Deno When:

- **Security is paramount** -- fintech, healthcare, multi-tenant platforms
- **TypeScript-first teams** -- zero config TS support, no tsconfig.json needed
- **Edge deployment** -- Deno Deploy provides global edge runtime
- **New projects** without legacy npm baggage
- **Standard library quality** -- Deno's std lib is well-designed and maintained
- **KV store workloads** -- built-in distributed KV eliminates Redis for simple cases

---

## Migration Strategies

### Node.js to Bun

```
+------------------------------------------------------------------+
|              NODE.JS -> BUN MIGRATION CHECKLIST                  |
+------------------------------------------------------------------+
|                                                                  |
|  Phase 1: Drop-in Replacement (Day 1)                            |
|  [x] Replace 'node' with 'bun' in scripts                       |
|  [x] Replace 'npm install' with 'bun install'                   |
|  [x] Run test suite with 'bun test'                              |
|  [x] Verify all npm packages work                                |
|                                                                  |
|  Phase 2: Adopt Bun APIs (Week 1-2)                              |
|  [ ] Replace Express/Fastify with Bun.serve()                    |
|  [ ] Replace better-sqlite3 with bun:sqlite                     |
|  [ ] Replace dotenv with built-in .env support                   |
|  [ ] Replace shell scripts with Bun.$``                          |
|                                                                  |
|  Phase 3: Optimize (Week 3-4)                                    |
|  [ ] Use Bun.file() for optimized file I/O                       |
|  [ ] Use Bun.write() for optimized writes                        |
|  [ ] Replace webpack/vite with bun build                         |
|  [ ] Profile and optimize hot paths                              |
|                                                                  |
|  Blockers to check:                                              |
|  - Native addons (N-API) -- may not work in Bun                  |
|  - Node-specific APIs (vm, cluster, worker_threads edge cases)   |
|  - Crypto compatibility (subtle differences exist)               |
|                                                                  |
+------------------------------------------------------------------+
```

### Node.js to Deno

```typescript
// Before (Node.js)
const fs = require('fs');
const path = require('path');
const data = fs.readFileSync(path.join(__dirname, 'data.json'), 'utf-8');

// After (Deno)
const data = await Deno.readTextFile(new URL('./data.json', import.meta.url));

// Or use Node compat layer
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const data2 = readFileSync(join(__dirname, 'data.json'), 'utf-8');
```

---

## Code Examples: HTTP Server in Each Runtime

### Node.js 22

```javascript
import { createServer } from 'node:http';

const server = createServer((req, res) => {
  if (req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({ status: 'ok', runtime: 'node', pid: process.pid })
    );
    return;
  }

  if (req.url === '/api/users' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ])
    );
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

server.listen(3000, () => {
  console.log('Node.js server listening on port 3000');
});
```

### Bun

```typescript
Bun.serve({
  port: 3000,
  fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === '/api/health') {
      return Response.json({
        status: 'ok',
        runtime: 'bun',
        pid: process.pid,
      });
    }

    if (url.pathname === '/api/users' && req.method === 'GET') {
      return Response.json([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ]);
    }

    return new Response('Not Found', { status: 404 });
  },
});

console.log('Bun server listening on port 3000');
```

### Deno

```typescript
Deno.serve({ port: 3000 }, (req) => {
  const url = new URL(req.url);

  if (url.pathname === '/api/health') {
    return Response.json({
      status: 'ok',
      runtime: 'deno',
      pid: Deno.pid,
    });
  }

  if (url.pathname === '/api/users' && req.method === 'GET') {
    return Response.json([
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ]);
  }

  return new Response('Not Found', { status: 404 });
});

console.log('Deno server listening on port 3000');
```

**Interview insight**: Notice how Bun and Deno both use the Web Standard `Request`/`Response` APIs (WinterCG standard), while Node.js uses its own `IncomingMessage`/`ServerResponse`. This matters for portability -- code written with Web Standard APIs can run on edge platforms (Cloudflare Workers, Deno Deploy) without modification.

---

## Testing in Each Runtime

### Node.js Native Test Runner

```javascript
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

describe('UserService', () => {
  it('creates a user with valid input', async () => {
    const mockDb = {
      insert: mock.fn(() => ({ id: 1, name: 'Alice' })),
    };

    const service = new UserService(mockDb);
    const user = await service.create({ name: 'Alice' });

    assert.deepStrictEqual(user, { id: 1, name: 'Alice' });
    assert.strictEqual(mockDb.insert.mock.calls.length, 1);
  });
});
```

### Bun Test

```typescript
import { describe, it, expect, mock } from 'bun:test';

describe('UserService', () => {
  it('creates a user with valid input', async () => {
    const mockDb = {
      insert: mock(() => ({ id: 1, name: 'Alice' })),
    };

    const service = new UserService(mockDb);
    const user = await service.create({ name: 'Alice' });

    expect(user).toEqual({ id: 1, name: 'Alice' });
    expect(mockDb.insert).toHaveBeenCalledTimes(1);
  });
});
```

### Deno Test

```typescript
import { assertEquals } from 'jsr:@std/assert';

Deno.test('UserService creates a user with valid input', async () => {
  const mockDb = {
    insert: () => ({ id: 1, name: 'Alice' }),
  };

  const service = new UserService(mockDb);
  const user = await service.create({ name: 'Alice' });

  assertEquals(user, { id: 1, name: 'Alice' });
});

// With permissions
Deno.test({
  name: 'reads config file',
  permissions: { read: ['./config'] },
  fn: async () => {
    const config = await Deno.readTextFile('./config/app.json');
    const parsed = JSON.parse(config);
    assertEquals(parsed.port, 3000);
  },
});
```

---

## Common Interview Questions

### Q: Why would a company migrate from Node.js to Bun?

**Strong answer**: The primary motivation is developer productivity, not just raw performance. Bun eliminates the need for 5-7 separate tools (package manager, bundler, transpiler, test runner, env loader, file watcher, task runner) with a single binary. For a team of 20 engineers, reducing `npm install` from 30 seconds to 2 seconds saves hours per week across CI pipelines. The HTTP throughput improvement (80k to 150k req/s) matters less than the 6x faster startup time for serverless workloads, where cold starts directly impact user experience. However, the migration risk is real: Bun's npm compatibility is ~98%, not 100%, and native addons may not work. A phased migration starting with development tooling (install, test, dev server) before production runtime is the safest path.

### Q: How does Deno's permission model prevent supply chain attacks?

**Strong answer**: Supply chain attacks exploit the fact that any imported npm package can access the file system, network, and environment variables. Deno's permission model creates a security boundary: if you run `deno run --allow-net=api.stripe.com server.ts`, a compromised dependency cannot exfiltrate data to `evil.com` because network access is restricted. The `--deny-*` flags add defense-in-depth. However, the limitation is granularity: permissions are process-wide, not per-module. A malicious package with `--allow-read` permission can read any allowed path, not just its own files. Deno is working on per-module permissions, but this is not yet production-ready.

### Q: What is the WinterCG standard and why does it matter?

**Strong answer**: WinterCG (Web-interoperable Runtimes Community Group) is a standardization effort to define a common API surface for server-side JavaScript runtimes. By standardizing on Web APIs (fetch, Request, Response, ReadableStream, crypto.subtle), code becomes portable across Node.js, Bun, Deno, Cloudflare Workers, and Vercel Edge Functions. This matters because it decouples application code from runtime choice. You can develop on Bun locally, test on Node.js in CI, and deploy to Cloudflare Workers in production -- all using the same fetch handler. The practical impact: frameworks like Hono achieve true runtime portability because they build on WinterCG-compatible APIs.

### Q: When is Node.js still the best choice in 2026?

**Strong answer**: Node.js remains the best choice when you need maximum ecosystem compatibility (native addons, legacy packages), enterprise support (commercial vendors like NodeSource and Red Hat provide LTS support), and battle-tested reliability for mission-critical systems. Banks, healthcare companies, and large enterprises that cannot tolerate runtime-level bugs choose Node.js because its V8 engine and libuv event loop have 15+ years of production hardening. The tooling ecosystem (profilers like 0x, APM agents like Datadog/New Relic, debuggers) is also most mature for Node.js. Additionally, Node.js 22's native test runner, watch mode, and .env support have closed many of the DX gaps that Bun and Deno exploited.
