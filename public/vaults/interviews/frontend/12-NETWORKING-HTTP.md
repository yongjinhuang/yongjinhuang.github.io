# Networking & HTTP

## Overview

Networking and HTTP knowledge is foundational for frontend engineers. Every user interaction that touches a server -- fetching data, submitting forms, loading assets -- relies on HTTP. Interviewers test this area to gauge whether you understand what happens between a button click and the rendered response: protocol mechanics, caching strategies, security headers, API design, and real-time communication. Mastery here separates engineers who can debug production issues from those who only know how to call `fetch`.

---

## Core Concepts

### HTTP Protocol Versions

**HTTP/1.1** (1997)

- Text-based protocol with one request per TCP connection (or pipelining, rarely used).
- Head-of-line (HOL) blocking: the second request must wait for the first response.
- Workarounds: domain sharding, sprite sheets, bundling files.

```
GET /api/users HTTP/1.1
Host: example.com
Connection: keep-alive
```

**HTTP/2** (2015)

- Binary framing layer over a single TCP connection.
- Multiplexing: multiple streams in parallel without HOL blocking at the application layer.
- Header compression (HPACK).
- Server push: server can send resources before the client requests them.
- Still suffers from TCP-level HOL blocking when a packet is lost.

**HTTP/3** (2022)

- Built on QUIC (UDP-based transport).
- Eliminates TCP HOL blocking entirely -- each stream is independent.
- Faster connection setup (0-RTT resumption).
- Built-in encryption (TLS 1.3 is mandatory).
- Connection migration: survives network changes (e.g., Wi-Fi to cellular).

### Request / Response Lifecycle

1. **DNS resolution** -- domain name to IP address.
2. **TCP handshake** -- SYN, SYN-ACK, ACK (skipped in HTTP/3 QUIC).
3. **TLS handshake** -- certificate exchange, key agreement.
4. **HTTP request** -- method, URL, headers, body.
5. **Server processing** -- routing, business logic, database.
6. **HTTP response** -- status code, headers, body.
7. **Rendering** -- browser parses HTML, fetches sub-resources, paints.

### Important Headers

**Caching Headers**

| Header              | Purpose                               | Example                         |
| ------------------- | ------------------------------------- | ------------------------------- |
| `Cache-Control`     | Directives for caching                | `max-age=3600, public`          |
| `ETag`              | Content fingerprint for validation    | `"abc123"`                      |
| `Last-Modified`     | Timestamp of last change              | `Wed, 01 Mar 2026 00:00:00 GMT` |
| `If-None-Match`     | Client sends ETag back for validation | `"abc123"`                      |
| `If-Modified-Since` | Client sends timestamp for validation | `Wed, 01 Mar 2026 00:00:00 GMT` |

Cache-Control directives:

- `no-store` -- never cache.
- `no-cache` -- cache but always revalidate.
- `max-age=N` -- fresh for N seconds.
- `immutable` -- never revalidate (good for hashed assets).
- `stale-while-revalidate=N` -- serve stale while fetching fresh copy.

**CORS Headers**

| Header                             | Direction | Purpose                          |
| ---------------------------------- | --------- | -------------------------------- |
| `Origin`                           | Request   | Identifies the requesting origin |
| `Access-Control-Allow-Origin`      | Response  | Which origins are allowed        |
| `Access-Control-Allow-Methods`     | Response  | Allowed HTTP methods             |
| `Access-Control-Allow-Headers`     | Response  | Allowed request headers          |
| `Access-Control-Allow-Credentials` | Response  | Whether cookies are sent         |
| `Access-Control-Max-Age`           | Response  | How long preflight is cached     |

**Security Headers**

| Header                      | Purpose                   |
| --------------------------- | ------------------------- |
| `Strict-Transport-Security` | Force HTTPS               |
| `Content-Security-Policy`   | Restrict resource origins |
| `X-Content-Type-Options`    | Prevent MIME sniffing     |
| `X-Frame-Options`           | Prevent clickjacking      |

### HTTP Status Codes

| Range | Category      | Key Codes                                                                                                                                  |
| ----- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1xx   | Informational | `101 Switching Protocols` (WebSocket upgrade)                                                                                              |
| 2xx   | Success       | `200 OK`, `201 Created`, `204 No Content`                                                                                                  |
| 3xx   | Redirection   | `301 Moved Permanently`, `302 Found`, `304 Not Modified`                                                                                   |
| 4xx   | Client Error  | `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`, `405 Method Not Allowed`, `409 Conflict`, `429 Too Many Requests` |
| 5xx   | Server Error  | `500 Internal Server Error`, `502 Bad Gateway`, `503 Service Unavailable`, `504 Gateway Timeout`                                           |

Key distinction: `401` means "not authenticated" (who are you?), while `403` means "not authorized" (you lack permission).

### REST API Design

REST (Representational State Transfer) principles:

- **Resources** identified by URLs: `/users/123`.
- **HTTP methods** as verbs: GET (read), POST (create), PUT (replace), PATCH (partial update), DELETE (remove).
- **Stateless**: each request carries all needed context.
- **HATEOAS**: responses include links to related actions (rarely implemented fully).

```
GET    /api/users          -- list users
GET    /api/users/123      -- get user 123
POST   /api/users          -- create user
PUT    /api/users/123      -- replace user 123
PATCH  /api/users/123      -- update fields of user 123
DELETE /api/users/123      -- delete user 123
```

Good practices:

- Use plural nouns (`/users`, not `/user`).
- Nest for relationships: `/users/123/posts`.
- Use query params for filtering: `/users?role=admin&page=2`.
- Version your API: `/v1/users`.
- Return appropriate status codes.

### GraphQL Basics

GraphQL is a query language where the client specifies the exact shape of data needed.

```graphql
query {
  user(id: "123") {
    name
    email
    posts(limit: 5) {
      title
      createdAt
    }
  }
}
```

| Aspect         | REST                          | GraphQL                                   |
| -------------- | ----------------------------- | ----------------------------------------- |
| Endpoints      | Multiple (`/users`, `/posts`) | Single (`/graphql`)                       |
| Over-fetching  | Common                        | Avoided (client picks fields)             |
| Under-fetching | Common (multiple round trips) | Avoided (nested queries)                  |
| Caching        | HTTP caching works naturally  | Requires client-side cache (Apollo, urql) |
| File uploads   | Native support                | Requires multipart spec                   |
| Learning curve | Lower                         | Higher                                    |

### Real-Time Communication

**WebSocket**

- Full-duplex, persistent connection.
- Client and server can send messages at any time.
- Starts as HTTP upgrade (`101 Switching Protocols`).

```javascript
const ws = new WebSocket('wss://example.com/socket');

ws.onopen = () =>
  ws.send(JSON.stringify({ type: 'subscribe', channel: 'chat' }));
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // handle incoming message
};
ws.onclose = (event) => {
  // reconnection logic
};
```

**Server-Sent Events (SSE)**

- Unidirectional: server to client only.
- Built on HTTP -- works with existing infrastructure (proxies, load balancers).
- Automatic reconnection built in.
- Text-based (`text/event-stream`).

```javascript
const source = new EventSource('/api/events');

source.onmessage = (event) => {
  const data = JSON.parse(event.data);
};

source.onerror = () => {
  // EventSource auto-reconnects
};
```

| Feature      | WebSocket                  | SSE                            |
| ------------ | -------------------------- | ------------------------------ |
| Direction    | Bidirectional              | Server to client               |
| Protocol     | Custom over TCP            | HTTP                           |
| Reconnection | Manual                     | Automatic                      |
| Binary data  | Yes                        | No (text only)                 |
| Use cases    | Chat, games, collaboration | Notifications, feeds, progress |

### The Fetch API

```javascript
// Basic GET
const response = await fetch('/api/users');
const data = await response.json();

// POST with JSON body
const response = await fetch('/api/users', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Alice', email: 'alice@example.com' }),
});

// With credentials (cookies)
const response = await fetch('/api/profile', {
  credentials: 'include',
});

// With AbortController for cancellation
const controller = new AbortController();

setTimeout(() => controller.abort(), 5000); // 5-second timeout

try {
  const response = await fetch('/api/slow-endpoint', {
    signal: controller.signal,
  });
  const data = await response.json();
} catch (error) {
  if (error.name === 'AbortError') {
    // request was cancelled
  }
}
```

### Streaming Responses

```javascript
async function streamResponse(url) {
  const response = await fetch(url);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    // process chunk incrementally
  }
}
```

### CORS Deep Dive

**Same-Origin Policy**: browsers block requests from one origin to a different origin unless the server explicitly allows it.

An origin is: `protocol + host + port`. So `https://app.example.com:443` differs from `http://app.example.com:80`.

**Simple requests** (no preflight):

- Methods: GET, HEAD, POST.
- Headers: only safe-listed (Accept, Content-Type with form values, etc.).
- Content-Type: `application/x-www-form-urlencoded`, `multipart/form-data`, `text/plain`.

**Preflighted requests**: anything else triggers an `OPTIONS` preflight.

```
OPTIONS /api/users HTTP/1.1
Origin: https://app.example.com
Access-Control-Request-Method: DELETE
Access-Control-Request-Headers: Authorization

HTTP/1.1 204 No Content
Access-Control-Allow-Origin: https://app.example.com
Access-Control-Allow-Methods: GET, POST, DELETE
Access-Control-Allow-Headers: Authorization
Access-Control-Max-Age: 86400
```

**Credentialed requests** (cookies, auth headers):

- Client: `credentials: 'include'` in fetch.
- Server: `Access-Control-Allow-Credentials: true`.
- Server: `Access-Control-Allow-Origin` must be a specific origin, NOT `*`.

### Token Storage: Cookies vs localStorage vs sessionStorage

| Aspect             | httpOnly Cookie                   | localStorage       | sessionStorage     |
| ------------------ | --------------------------------- | ------------------ | ------------------ |
| Accessible via JS  | No                                | Yes                | Yes                |
| Sent automatically | Yes (with requests to the domain) | No (manual header) | No (manual header) |
| Capacity           | ~4KB                              | ~5-10MB            | ~5-10MB            |
| Expiration         | Configurable                      | Never              | Tab close          |
| XSS vulnerable     | No (httpOnly)                     | Yes                | Yes                |
| CSRF vulnerable    | Yes                               | No                 | No                 |

**Recommendation**: Store auth tokens in httpOnly, Secure, SameSite=Strict cookies when possible. This protects against XSS (JavaScript cannot read the token) while CSRF can be mitigated with SameSite and anti-CSRF tokens. If you must use localStorage (e.g., SPAs with third-party APIs), pair it with short-lived tokens and aggressive XSS prevention.

---

## Common Interview Questions

### Q1: What are the key differences between HTTP/1.1, HTTP/2, and HTTP/3?

**Answer**: HTTP/1.1 is text-based and processes one request per connection at a time, leading to head-of-line blocking. Developers work around this with domain sharding and asset bundling. HTTP/2 introduces binary framing, multiplexing multiple streams over a single TCP connection, header compression via HPACK, and server push. However, a lost TCP packet still blocks all streams (TCP-level HOL blocking). HTTP/3 replaces TCP with QUIC (over UDP), giving each stream its own flow control so a lost packet only blocks its own stream. QUIC also enables 0-RTT connection resumption and seamless connection migration between networks.

### Q2: Explain how browser caching works with ETag and Cache-Control.

**Answer**: When a server responds, it may include `Cache-Control: max-age=3600` (fresh for one hour) and `ETag: "abc123"` (content fingerprint). On subsequent requests within the max-age window, the browser serves the cached version without contacting the server. After max-age expires, the browser sends a conditional request with `If-None-Match: "abc123"`. If the content is unchanged, the server returns `304 Not Modified` with no body, saving bandwidth. If changed, it returns `200` with the new content and a new ETag. For immutable assets (hashed filenames like `main.a1b2c3.js`), use `Cache-Control: max-age=31536000, immutable` to prevent revalidation entirely.

### Q3: What is a CORS preflight request and when does it occur?

**Answer**: A preflight is an `OPTIONS` request the browser sends automatically before the actual request when the request is not "simple." This happens when using methods other than GET/HEAD/POST, when sending custom headers like `Authorization`, or when the Content-Type is `application/json`. The preflight asks the server "will you accept this cross-origin request?" The server responds with allowed origins, methods, and headers. Only if the preflight succeeds does the browser send the actual request. The preflight result can be cached using `Access-Control-Max-Age` to avoid repeated OPTIONS requests.

### Q4: How would you implement request cancellation in a React component?

**Answer**: Use `AbortController` tied to the component lifecycle. Create the controller, pass its signal to fetch, and abort in the cleanup function. This prevents state updates on unmounted components and cancels in-flight requests when dependencies change.

```javascript
function useUserData(userId) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchUser() {
      try {
        const res = await fetch(`/api/users/${userId}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        setData(json);
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err);
        }
      }
    }

    fetchUser();
    return () => controller.abort();
  }, [userId]);

  return { data, error };
}
```

### Q5: When would you choose WebSocket over SSE, and vice versa?

**Answer**: Choose WebSocket when you need bidirectional communication -- chat applications, collaborative editing, multiplayer games, or any scenario where the client frequently sends data to the server. Choose SSE when data flows primarily from server to client -- live dashboards, notification feeds, stock tickers, or build progress. SSE has simpler infrastructure requirements (works with standard HTTP, proxies, and load balancers), automatic reconnection, and event ID tracking for resuming after disconnection. WebSocket requires sticky sessions or a pub/sub layer for horizontal scaling.

### Q6: Explain the difference between 401 and 403 status codes.

**Answer**: 401 Unauthorized really means "unauthenticated" -- the server does not know who you are. The client should authenticate (e.g., provide a valid token) and retry. 403 Forbidden means the server knows who you are but you lack permission for the requested resource. Re-authenticating will not help; you need different permissions. A practical example: accessing `/admin/dashboard` without logging in returns 401; logging in as a regular user and accessing the same URL returns 403.

### Q7: How do streaming responses work and what are their use cases?

**Answer**: The Fetch API exposes `response.body` as a `ReadableStream`. You obtain a reader via `getReader()` and read chunks incrementally. Each `read()` returns `{ done, value }` where value is a `Uint8Array`. This enables processing data before the entire response arrives, which is essential for LLM token streaming, large file downloads with progress indicators, real-time log tailing, and server-sent events parsed manually. The key advantage is lower time-to-first-byte perceived by users and reduced memory usage since you process chunks instead of buffering the entire response.

### Q8: Design a REST API for a blog platform. What endpoints would you create?

**Answer**:

```
# Posts
GET    /api/v1/posts                  -- list posts (supports ?page=1&limit=20&tag=react)
GET    /api/v1/posts/:id              -- get single post
POST   /api/v1/posts                  -- create post (authenticated)
PATCH  /api/v1/posts/:id              -- update post (author only)
DELETE /api/v1/posts/:id              -- delete post (author or admin)

# Comments (nested under posts)
GET    /api/v1/posts/:id/comments     -- list comments for a post
POST   /api/v1/posts/:id/comments     -- add comment (authenticated)
DELETE /api/v1/posts/:id/comments/:cid -- delete comment (author or admin)

# Users
GET    /api/v1/users/:id              -- get user profile
PATCH  /api/v1/users/:id              -- update profile (self only)

# Auth
POST   /api/v1/auth/login             -- login, returns token
POST   /api/v1/auth/register          -- register
POST   /api/v1/auth/refresh           -- refresh access token
POST   /api/v1/auth/logout            -- invalidate token
```

Response format for list endpoints includes pagination metadata:

```json
{
  "data": [...],
  "meta": { "total": 142, "page": 1, "limit": 20, "totalPages": 8 }
}
```

---

## Code Examples

### Robust Fetch Wrapper with Retry and Timeout

```javascript
async function fetchWithRetry(url, options = {}) {
  const {
    retries = 3,
    retryDelay = 1000,
    timeout = 10000,
    ...fetchOptions
  } = options;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status >= 500 && attempt < retries) {
          await new Promise((r) => setTimeout(r, retryDelay * (attempt + 1)));
          continue;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms`);
      }

      if (attempt === retries) throw error;
      await new Promise((r) => setTimeout(r, retryDelay * (attempt + 1)));
    }
  }
}

// Usage
const response = await fetchWithRetry('/api/data', {
  retries: 3,
  timeout: 5000,
  headers: { Authorization: 'Bearer token123' },
});
const data = await response.json();
```

### SSE Client with Reconnection

```javascript
function createSSEClient(url, handlers) {
  let eventSource = null;
  let reconnectAttempt = 0;
  const maxReconnectDelay = 30000;

  function connect() {
    eventSource = new EventSource(url);

    eventSource.onopen = () => {
      reconnectAttempt = 0;
      handlers.onOpen?.();
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handlers.onMessage(data);
      } catch (error) {
        handlers.onError?.(new Error('Failed to parse SSE message'));
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      const delay = Math.min(
        1000 * Math.pow(2, reconnectAttempt),
        maxReconnectDelay
      );
      reconnectAttempt++;
      handlers.onReconnecting?.(delay);
      setTimeout(connect, delay);
    };
  }

  connect();

  return {
    close() {
      eventSource?.close();
    },
  };
}

// Usage
const client = createSSEClient('/api/events', {
  onMessage: (data) => updateUI(data),
  onReconnecting: (delay) => showReconnectingBanner(delay),
});
```

### Streaming Fetch with Progress

```javascript
async function fetchWithProgress(url, onProgress) {
  const response = await fetch(url);

  const contentLength = response.headers.get('Content-Length');
  const total = contentLength ? parseInt(contentLength, 10) : null;
  let loaded = 0;

  const reader = response.body.getReader();
  const chunks = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    chunks.push(value);
    loaded += value.length;

    onProgress({
      loaded,
      total,
      percentage: total ? Math.round((loaded / total) * 100) : null,
    });
  }

  const allChunks = new Uint8Array(loaded);
  let position = 0;
  for (const chunk of chunks) {
    allChunks.set(chunk, position);
    position += chunk.length;
  }

  return new TextDecoder().decode(allChunks);
}
```

### GraphQL Request Helper

```javascript
async function graphqlRequest(endpoint, query, variables = {}) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });

  const result = await response.json();

  if (result.errors) {
    const messages = result.errors.map((e) => e.message).join('; ');
    throw new Error(`GraphQL Error: ${messages}`);
  }

  return result.data;
}

// Usage
const data = await graphqlRequest(
  '/graphql',
  `
  query GetUser($id: ID!) {
    user(id: $id) {
      name
      email
      posts { title }
    }
  }
`,
  { id: '123' }
);
```

---

## Gotchas & Edge Cases

1. **fetch does not reject on HTTP errors**. A `404` or `500` response resolves the promise successfully. You must check `response.ok` or `response.status` manually. This surprises developers coming from axios, which throws on non-2xx responses.

2. **CORS is enforced by the browser, not the server**. The server sets the headers, but it is the browser that blocks the response. Server-to-server requests and tools like curl are never affected by CORS. This means a request can succeed on the server side but the browser discards the response.

3. **Cookies require matching domain and path**. Setting `credentials: 'include'` is not enough -- the cookie's Domain, Path, Secure, and SameSite attributes must all align. SameSite=Lax (the default) does not send cookies on cross-site POST requests.

4. **WebSocket connections bypass CORS** but have their own origin checking. The server receives the `Origin` header and must validate it manually. Failing to check the origin enables cross-site WebSocket hijacking.

5. **HTTP/2 server push is being removed** from Chrome and many servers. Do not rely on it for optimization. Use `<link rel="preload">` or 103 Early Hints instead.

6. **`304 Not Modified` with credentials**. If you cache API responses that depend on the authenticated user, make sure caching headers include `Vary: Authorization` or `Cache-Control: private`, otherwise a shared cache may serve one user's data to another.

7. **AbortController signal is one-time use**. Once aborted, a signal cannot be reused. Create a new controller for each request or request chain.

8. **Content-Type mismatch**. Sending `application/json` with `body: formData` or vice versa causes silent failures. Ensure the Content-Type header matches the body format. When using FormData, do NOT set Content-Type manually -- the browser sets the correct multipart boundary.

9. **localStorage is synchronous** and blocks the main thread. Storing large payloads (e.g., caching API responses) in localStorage can cause jank. For larger data, use IndexedDB.

10. **SSE has a browser limit of 6 concurrent connections** per domain over HTTP/1.1. This can be exhausted by multiple tabs. HTTP/2 multiplexing solves this, but ensure your server supports it.

---

## Quick Reference

| Topic             | Key Points                                                                     |
| ----------------- | ------------------------------------------------------------------------------ |
| HTTP/1.1          | Text-based, one request per connection, HOL blocking                           |
| HTTP/2            | Binary, multiplexed streams, HPACK compression, single TCP connection          |
| HTTP/3            | QUIC (UDP), no TCP HOL blocking, 0-RTT, connection migration                   |
| Cache-Control     | `no-store`, `no-cache`, `max-age`, `immutable`, `stale-while-revalidate`       |
| ETag flow         | Server sends ETag -> Client sends If-None-Match -> 304 or 200                  |
| CORS preflight    | OPTIONS request for non-simple methods/headers, cached via Max-Age             |
| Credentials       | `credentials: 'include'` + specific Allow-Origin + Allow-Credentials: true     |
| Status 301 vs 302 | 301 = permanent (cached), 302 = temporary (not cached)                         |
| Status 401 vs 403 | 401 = unauthenticated, 403 = unauthorized (has identity, lacks permission)     |
| REST verbs        | GET (read), POST (create), PUT (replace), PATCH (update), DELETE (remove)      |
| GraphQL           | Single endpoint, client specifies fields, avoids over/under-fetching           |
| WebSocket         | Bidirectional, persistent, manual reconnection                                 |
| SSE               | Server-to-client, HTTP-based, auto reconnection, 6-connection limit (HTTP/1.1) |
| fetch gotcha      | Does not throw on 4xx/5xx -- check `response.ok`                               |
| Token storage     | httpOnly cookie (best for XSS protection) > localStorage (XSS vulnerable)      |
| AbortController   | Pass `signal` to fetch, call `controller.abort()` to cancel                    |
| Streaming         | `response.body.getReader()` for incremental chunk processing                   |
