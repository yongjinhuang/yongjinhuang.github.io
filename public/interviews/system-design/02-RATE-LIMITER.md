# Design a Rate Limiter

A rate limiter controls the rate of traffic sent by a client or service. When the
number of requests exceeds a threshold within a time window, excess requests are
throttled or dropped. Rate limiting is critical for protecting services from abuse,
preventing resource starvation, and managing costs.

---

## 1. Requirements Clarification

### Functional Requirements

| # | Requirement | Details |
|---|-------------|---------|
| FR1 | Limit requests per time window | e.g., 100 requests per minute per user |
| FR2 | Different rules per API endpoint | e.g., `/login` = 5/min, `/search` = 30/min |
| FR3 | Different rules per user tier | Free = 100/hr, Premium = 10,000/hr |
| FR4 | Inform clients of limit status | Return remaining quota in response headers |
| FR5 | Return 429 when limit exceeded | Standard HTTP 429 Too Many Requests |
| FR6 | Configurable rules | Rules can be updated without redeployment |

### Non-Functional Requirements

| # | Requirement | Target |
|---|-------------|--------|
| NFR1 | Low latency | < 1ms overhead per request |
| NFR2 | High availability | 99.99% uptime |
| NFR3 | Distributed | Work across multiple servers/regions |
| NFR4 | Fault tolerant | Degrade gracefully on failure |
| NFR5 | Memory efficient | Minimal per-client storage |
| NFR6 | Accurate | Minimal over-counting or under-counting |

### Where to Place the Rate Limiter

```
Option A: Client-Side
+--------+     +-----------+     +--------+
| Client |---->| Rate Limiter |-->| Server |
| (SDK)  |     | (in-client)   | | (API)  |
+--------+     +-----------+     +--------+
  * Easy to implement, but unreliable (clients can bypass)

Option B: Server-Side
+--------+     +--------+     +-----------+
| Client |---->| Server |---->| Rate      |
|        |     | (API)  |     | Limiter   |
+--------+     +--------+     +-----------+
  * Reliable, but adds latency and couples to app code

Option C: Middleware / API Gateway (Recommended)
+--------+     +-------------+     +--------+
| Client |---->| API Gateway |---->| Server |
|        |     | (Rate Limit)|     | (API)  |
+--------+     +-------------+     +--------+
  * Decoupled, centralized, easy to manage
  * Cloud providers: AWS API Gateway, Kong, Nginx, Envoy
```

**Recommendation**: Use middleware/API gateway for most scenarios. It decouples
rate limiting logic from business logic and provides a single enforcement point.

### Back-of-the-Envelope Estimation

Assumptions:
- 10 million active users
- Average 10 requests/user/minute at peak
- 100 million requests/minute peak
- Each rate limit record: ~50 bytes (key + counter + timestamp)
- Storage: 10M users x 50 bytes = ~500 MB (fits in a single Redis instance)

---

## 2. Rate Limiting Algorithms

### 2.1 Token Bucket

**How it works**: A bucket holds tokens up to a maximum capacity. Tokens are added
at a fixed refill rate. Each request consumes one token. If no tokens remain, the
request is rejected.

```
Token Bucket Visualization (capacity=4, refill=1/sec)
======================================================

Time 0s: [T][T][T][T]  capacity=4, tokens=4
           Request arrives -> consume 1 token
Time 0s: [T][T][T][ ]  tokens=3

           3 requests arrive rapidly
Time 0s: [ ][ ][ ][ ]  tokens=0

           Request arrives -> REJECTED (no tokens)
Time 0s: [ ][ ][ ][ ]  tokens=0, 429 returned

           1 second passes, 1 token refilled
Time 1s: [T][ ][ ][ ]  tokens=1

           Request arrives -> consume 1 token
Time 1s: [ ][ ][ ][ ]  tokens=0
```

**Pseudocode**:

```python
class TokenBucket:
    def __init__(self, capacity, refill_rate):
        self.capacity = capacity          # Max tokens
        self.refill_rate = refill_rate    # Tokens added per second
        self.tokens = capacity            # Current tokens
        self.last_refill = now()          # Last refill timestamp

    def allow_request(self):
        self._refill()
        if self.tokens >= 1:
            self.tokens -= 1
            return True
        return False

    def _refill(self):
        elapsed = now() - self.last_refill
        new_tokens = elapsed * self.refill_rate
        self.tokens = min(self.capacity, self.tokens + new_tokens)
        self.last_refill = now()
```

**Redis Implementation**:

```lua
-- Token Bucket Lua Script (atomic operation)
-- KEYS[1] = rate limit key
-- ARGV[1] = capacity
-- ARGV[2] = refill_rate (tokens per second)
-- ARGV[3] = current timestamp (seconds, float)
-- ARGV[4] = tokens to consume (usually 1)

local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local requested = tonumber(ARGV[4])

local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
local tokens = tonumber(bucket[1]) or capacity
local last_refill = tonumber(bucket[2]) or now

-- Calculate refill
local elapsed = now - last_refill
local new_tokens = elapsed * refill_rate
tokens = math.min(capacity, tokens + new_tokens)

-- Check and consume
local allowed = 0
if tokens >= requested then
    tokens = tokens - requested
    allowed = 1
end

-- Update state
redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
redis.call('EXPIRE', key, math.ceil(capacity / refill_rate) * 2)

return { allowed, math.floor(tokens) }
```

| Pros | Cons |
|------|------|
| Allows burst traffic up to bucket size | Two parameters to tune (capacity + rate) |
| Memory efficient (just 2 values per key) | Burst at bucket boundaries possible |
| Smooth rate limiting | Slightly more complex than fixed window |
| Used by AWS, Stripe, and most API providers | - |

---

### 2.2 Leaking Bucket

**How it works**: Requests are placed into a FIFO queue (the bucket). Requests leak
(are processed) from the queue at a fixed rate. If the queue is full, new requests
are discarded.

```
Leaking Bucket Visualization (queue_size=4, leak_rate=1/sec)
=============================================================

     Incoming Requests          Queue           Outgoing (fixed rate)
     ==================    ===============      ====================

     R1 arrives          -> [R1][ ][ ][ ]   ->
     R2 arrives          -> [R1][R2][ ][ ]  ->
     R3 arrives          -> [R1][R2][R3][ ] ->
     R4 arrives          -> [R1][R2][R3][R4] ->

     1 sec: R1 leaks out    [R2][R3][R4][ ] ->  R1 processed
     R5 arrives          -> [R2][R3][R4][R5] ->

     R6 arrives          -> QUEUE FULL!         R6 REJECTED (429)

     1 sec: R2 leaks out    [R3][R4][R5][ ] ->  R2 processed
     R6 retries          -> [R3][R4][R5][R6] ->  Accepted!
```

**Pseudocode**:

```python
class LeakingBucket:
    def __init__(self, capacity, leak_rate):
        self.capacity = capacity      # Max queue size
        self.leak_rate = leak_rate    # Requests processed per second
        self.water = 0                # Current queue size
        self.last_leak = now()        # Last time we leaked

    def allow_request(self):
        self._leak()
        if self.water < self.capacity:
            self.water += 1
            return True
        return False

    def _leak(self):
        elapsed = now() - self.last_leak
        leaked = elapsed * self.leak_rate
        self.water = max(0, self.water - leaked)
        self.last_leak = now()
```

| Pros | Cons |
|------|------|
| Smooth output rate (no bursts) | Burst of traffic fills queue; new requests dropped |
| Memory efficient | Does not guarantee processing of recent requests |
| Predictable processing rate | Old requests may starve recent ones |
| Used by Shopify | Not suitable when bursts are acceptable |

---

### 2.3 Fixed Window Counter

**How it works**: Time is divided into fixed windows (e.g., every minute). A counter
tracks requests in the current window. When the counter exceeds the threshold, requests
are rejected until the next window starts.

```
Fixed Window Counter (limit=5, window=1 min)
============================================

Timeline (each block = 1 minute window)

|--- Window 1 ---|--- Window 2 ---|--- Window 3 ---|
|  00:00-00:59   |  01:00-01:59   |  02:00-02:59   |

Window 1: R R R R R          count=5 (at limit)
          R                  count=5 -> REJECTED!

Window 2: R R R              count=3 (under limit)
          R R                count=5 (at limit)
          R                  count=5 -> REJECTED!

Edge case (boundary burst problem):
|--- Window 1 ---|--- Window 2 ---|
     ^5 requests at 0:59
                  ^5 requests at 1:00
     |<-- 1 sec-->|
     10 requests in 1 second! (2x the intended rate)
```

**Pseudocode**:

```python
class FixedWindowCounter:
    def __init__(self, limit, window_size_sec):
        self.limit = limit
        self.window_size = window_size_sec

    def allow_request(self, user_id):
        window_key = self._get_window_key(user_id)
        count = redis.incr(window_key)
        if count == 1:
            redis.expire(window_key, self.window_size)
        return count <= self.limit

    def _get_window_key(self, user_id):
        window = int(now() / self.window_size)
        return f"rate:{user_id}:{window}"
```

**Redis Commands**:

```redis
-- Simple Redis implementation (non-atomic, for illustration)
INCR   rate:user123:1700000000     -- Increment counter for current window
EXPIRE rate:user123:1700000000 60  -- Expire after window duration

-- Atomic version using Lua:
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])

local count = redis.call('INCR', key)
if count == 1 then
    redis.call('EXPIRE', key, window)
end

if count > limit then
    return { 0, 0 }  -- rejected, 0 remaining
end
return { 1, limit - count }  -- allowed, remaining
```

| Pros | Cons |
|------|------|
| Very simple to implement | Boundary burst problem (2x rate at edges) |
| Memory efficient (1 counter per window) | Not smooth; resets suddenly |
| Easy to understand | Spikes at window boundaries |
| Fast O(1) operations | Unfair to users who arrive late in window |

---

### 2.4 Sliding Window Log

**How it works**: Store a timestamp for every request in a sorted set. When a new
request arrives, remove all timestamps older than the window. Count remaining
entries. If count exceeds limit, reject.

```
Sliding Window Log (limit=5, window=60s)
========================================

Current time: T=75s, Window = [15s, 75s]

Sorted Set of timestamps:
  { 10, 20, 30, 55, 60, 65, 70 }
    ^    ^                          <- Outside window, REMOVE
         |
  After cleanup: { 30, 55, 60, 65, 70 }
  Count = 5 (at limit)

  New request at T=75s:
  Count would be 6 > 5 -> REJECTED!

  At T=90s, window = [30s, 90s]:
  After cleanup: { 30, 55, 60, 65, 70 }
  Still count=5. New request at T=90:
    { 30, 55, 60, 65, 70 } -> remove 30 (expired at T=90)
    { 55, 60, 65, 70 } -> count=4 -> ALLOWED!
    { 55, 60, 65, 70, 90 }
```

**Pseudocode**:

```python
class SlidingWindowLog:
    def __init__(self, limit, window_size_sec):
        self.limit = limit
        self.window_size = window_size_sec

    def allow_request(self, user_id):
        current_time = now()
        window_start = current_time - self.window_size
        key = f"rate:{user_id}"

        # Atomic operation via pipeline
        pipe = redis.pipeline()
        pipe.zremrangebyscore(key, 0, window_start)      # Remove expired
        pipe.zadd(key, {str(current_time): current_time}) # Add current
        pipe.zcard(key)                                    # Count
        pipe.expire(key, self.window_size)                 # TTL
        results = pipe.execute()

        count = results[2]
        if count > self.limit:
            # Remove the just-added entry (over limit)
            redis.zrem(key, str(current_time))
            return False
        return True
```

**Redis Lua Script**:

```lua
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local window_start = now - window

-- Remove expired entries
redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)

-- Count current entries
local count = redis.call('ZCARD', key)

if count < limit then
    redis.call('ZADD', key, now, now .. ':' .. math.random(1000000))
    redis.call('EXPIRE', key, window)
    return { 1, limit - count - 1 }  -- allowed, remaining
end

return { 0, 0 }  -- rejected
```

| Pros | Cons |
|------|------|
| Very accurate, no boundary issues | High memory usage (stores every timestamp) |
| Smooth sliding window | O(N) cleanup per request |
| Precise per-user tracking | Not suitable for high-volume endpoints |
| No burst at boundaries | Storage grows with request volume |

---

### 2.5 Sliding Window Counter

**How it works**: Combines fixed window counter with sliding window accuracy. Uses
counters from the current and previous windows, weighting the previous window's
count by the overlap percentage.

```
Sliding Window Counter (limit=10, window=1 min)
================================================

Previous Window         Current Window
[  00:00 - 00:59  ]    [  01:00 - 01:59  ]
   count_prev = 8         count_curr = 3

Current time: 01:15 (25% into current window)
Window of interest: [00:15 - 01:15]

Weighted count = count_prev * (1 - elapsed%) + count_curr
               = 8 * (1 - 0.25) + 3
               = 8 * 0.75 + 3
               = 6 + 3
               = 9

9 < 10 -> ALLOWED

  |<-------- Previous Window -------->|<---- Current Window ------>|
  |                                   |                            |
  00:00                             01:00         01:15          02:00
  |===================================|============|              |
  |         prev_count = 8            | curr = 3   |              |
  |                    |<--- sliding window ------->|              |
  |                    |  75% of prev |  25% curr   |              |
  |                    |  0.75 * 8    |  + 3        |              |
  |                    |  = 6         |  = 9 total  |              |
```

**Pseudocode**:

```python
class SlidingWindowCounter:
    def __init__(self, limit, window_size_sec):
        self.limit = limit
        self.window_size = window_size_sec

    def allow_request(self, user_id):
        current_time = now()
        current_window = int(current_time / self.window_size)
        previous_window = current_window - 1

        # How far into the current window (0.0 to 1.0)
        elapsed_ratio = (current_time % self.window_size) / self.window_size

        curr_key = f"rate:{user_id}:{current_window}"
        prev_key = f"rate:{user_id}:{previous_window}"

        prev_count = int(redis.get(prev_key) or 0)
        curr_count = int(redis.get(curr_key) or 0)

        # Weighted estimate
        estimated = prev_count * (1 - elapsed_ratio) + curr_count

        if estimated >= self.limit:
            return False

        # Increment current window
        pipe = redis.pipeline()
        pipe.incr(curr_key)
        pipe.expire(curr_key, self.window_size * 2)
        pipe.execute()
        return True
```

| Pros | Cons |
|------|------|
| Memory efficient (2 counters per key) | Only an approximation (not exact) |
| Smooths boundary spikes | Slightly more complex than fixed window |
| Good balance of accuracy and performance | Weighted count is an estimate |
| Recommended by Cloudflare | Rare edge cases may slightly exceed limit |

---

### 2.6 Algorithm Comparison Table

```
+----------------------+----------+-----------+----------+----------+---------+
| Algorithm            | Memory   | Accuracy  | Burst    | Latency  | Complexity|
|                      |          |           | Handling |          |         |
+======================+==========+===========+==========+==========+=========+
| Token Bucket         | Low      | High      | Allows   | O(1)     | Medium  |
|                      | (2 vals) |           | bursts   |          |         |
+----------------------+----------+-----------+----------+----------+---------+
| Leaking Bucket       | Low      | High      | Smooths  | O(1)     | Medium  |
|                      | (2 vals) |           | output   |          |         |
+----------------------+----------+-----------+----------+----------+---------+
| Fixed Window Counter | Very Low | Low       | 2x burst | O(1)     | Low     |
|                      | (1 val)  |           | at edges |          |         |
+----------------------+----------+-----------+----------+----------+---------+
| Sliding Window Log   | High     | Exact     | None     | O(N)     | Medium  |
|                      | (N vals) |           |          |          |         |
+----------------------+----------+-----------+----------+----------+---------+
| Sliding Window       | Low      | High      | Minimal  | O(1)     | Medium  |
| Counter              | (2 vals) | (approx)  |          |          |         |
+----------------------+----------+-----------+----------+----------+---------+

Recommendation by Use Case:
  - API rate limiting (general):     Token Bucket or Sliding Window Counter
  - Strict no-burst required:        Leaking Bucket
  - Simple implementation:           Fixed Window Counter
  - Exact accuracy required:         Sliding Window Log
  - High-volume with good accuracy:  Sliding Window Counter
```

---

## 3. High-Level Architecture

```
                           High-Level Architecture
+--------+     +---------------------------------------------------+
|        |     |              API Gateway / LB                      |
| Client +---->+  +--------------------------------------------+   |
|  (App) |     |  |           Rate Limiter Middleware           |   |
|        |     |  |                                            |   |
+--------+     |  |  1. Extract client ID (user, IP, API key)  |   |
               |  |  2. Fetch rules from Rules Engine          |   |
               |  |  3. Check counter in Redis                 |   |
               |  |  4. Allow or reject (429)                  |   |
               |  |  5. Set response headers                   |   |
               |  +-----+------------------+-------------------+   |
               |        |                  |                       |
               +--------+------------------+-----------------------+
                        |                  |
                 +------v------+    +------v------+
                 |             |    |             |
                 |   Redis     |    |   Rules     |
                 |   Cluster   |    |   Engine    |
                 |             |    |   (Config)  |
                 | - Counters  |    | - YAML/JSON |
                 | - Timestamps|    | - Per-API   |
                 | - Buckets   |    | - Per-tier  |
                 +-------------+    +-------------+
                        |
               +--------v---------+
               |                  |
               |   App Servers    |
               |   (Backend)      |
               |                  |
               +------------------+

Request Flow:
=============
  1. Client sends request to API Gateway
  2. Rate Limiter middleware intercepts
  3. Extracts identifier (user ID, IP, API key)
  4. Looks up applicable rules from Rules Engine
  5. Checks/updates counter in Redis (atomic Lua script)
  6. If allowed: forward to App Server, set headers
  7. If rejected: return 429 with Retry-After header
```

### Component Responsibilities

| Component | Responsibility |
|-----------|---------------|
| API Gateway | Entry point, routing, TLS termination |
| Rate Limiter | Enforce rate limits, set headers |
| Redis Cluster | Store counters/tokens, atomic operations |
| Rules Engine | Store and serve rate limit configurations |
| App Servers | Handle business logic (only receives allowed requests) |

---

## 4. Data Model

### 4.1 Redis Data Structures by Algorithm

```
Token Bucket:
  Key:   rate_limit:{user_id}:{endpoint}
  Type:  Hash
  Fields:
    tokens      -> float  (current token count)
    last_refill -> float  (epoch timestamp of last refill)
  TTL:   2 * (capacity / refill_rate)

  Example:
    HSET rate_limit:user123:/api/search tokens 7.5 last_refill 1700000000.123
    EXPIRE rate_limit:user123:/api/search 120


Fixed Window Counter:
  Key:   rate_limit:{user_id}:{endpoint}:{window_id}
  Type:  String (integer counter)
  TTL:   window_size

  Example:
    SET rate_limit:user123:/api/search:28333333 0
    INCR rate_limit:user123:/api/search:28333333
    EXPIRE rate_limit:user123:/api/search:28333333 60


Sliding Window Log:
  Key:   rate_limit:{user_id}:{endpoint}
  Type:  Sorted Set (score = timestamp, member = unique request ID)
  TTL:   window_size

  Example:
    ZADD rate_limit:user123:/api/search 1700000000.123 "req_abc123"
    ZREMRANGEBYSCORE rate_limit:user123:/api/search -inf 1699999940.0
    ZCARD rate_limit:user123:/api/search


Sliding Window Counter:
  Key:   rate_limit:{user_id}:{endpoint}:{window_id}
  Type:  String (integer counter)
  TTL:   2 * window_size  (need previous + current window)

  Example:
    INCR rate_limit:user123:/api/search:28333333
    GET  rate_limit:user123:/api/search:28333332   -- previous window
```

### 4.2 Rate Limiting Rules Schema

```yaml
# rate_limit_rules.yaml
rules:
  - id: "global-default"
    description: "Default rate limit for all endpoints"
    match:
      scope: "global"
    limit: 1000
    window: 60          # seconds
    algorithm: "sliding_window_counter"
    action: "reject"    # reject | queue | throttle

  - id: "auth-strict"
    description: "Strict limit on authentication endpoints"
    match:
      endpoints:
        - "/api/v1/login"
        - "/api/v1/register"
        - "/api/v1/password-reset"
      scope: "per_ip"
    limit: 5
    window: 60
    algorithm: "sliding_window_log"
    action: "reject"
    response:
      status: 429
      message: "Too many authentication attempts. Please try again later."

  - id: "search-api"
    description: "Search endpoint rate limit"
    match:
      endpoints:
        - "/api/v1/search"
      scope: "per_user"
    limit: 30
    window: 60
    algorithm: "token_bucket"
    token_bucket:
      capacity: 30
      refill_rate: 0.5   # tokens per second
    action: "reject"

  - id: "premium-tier"
    description: "Higher limits for premium users"
    match:
      user_tier: "premium"
      scope: "per_user"
    limit: 10000
    window: 3600        # 1 hour
    algorithm: "sliding_window_counter"
    priority: 10        # Higher priority overrides lower

  - id: "free-tier"
    description: "Standard limits for free users"
    match:
      user_tier: "free"
      scope: "per_user"
    limit: 100
    window: 3600
    algorithm: "sliding_window_counter"
    priority: 5
```

### 4.3 Example JSON Configuration

```json
{
  "rate_limits": {
    "tiers": {
      "free": {
        "requests_per_minute": 60,
        "requests_per_hour": 1000,
        "requests_per_day": 10000,
        "burst_capacity": 10
      },
      "basic": {
        "requests_per_minute": 300,
        "requests_per_hour": 10000,
        "requests_per_day": 100000,
        "burst_capacity": 50
      },
      "premium": {
        "requests_per_minute": 1000,
        "requests_per_hour": 50000,
        "requests_per_day": 500000,
        "burst_capacity": 200
      },
      "enterprise": {
        "requests_per_minute": 5000,
        "requests_per_hour": 200000,
        "requests_per_day": 2000000,
        "burst_capacity": 1000
      }
    },
    "endpoint_overrides": {
      "/api/v1/login": {
        "limit": 5,
        "window": 60,
        "scope": "per_ip",
        "algorithm": "sliding_window_log"
      },
      "/api/v1/upload": {
        "limit": 10,
        "window": 60,
        "scope": "per_user",
        "algorithm": "token_bucket",
        "capacity": 10,
        "refill_rate": 0.17
      }
    },
    "global": {
      "max_requests_per_second": 100000,
      "algorithm": "token_bucket",
      "capacity": 100000,
      "refill_rate": 100000
    }
  }
}
```

---

## 5. Detailed Design

### 5.1 Rate Limiter Middleware Flow

```
                    Rate Limiter Middleware Flow
                    ===========================

  Incoming Request
        |
        v
  +-----+------+
  | Extract ID  |  (User ID from JWT, API Key, or IP address)
  | & Endpoint  |
  +-----+------+
        |
        v
  +-----+------+
  | Lookup      |  Check rules engine for applicable rules
  | Rules       |  (most specific match wins: endpoint > tier > global)
  +-----+------+
        |
        v
  +-----+------+       +-------------+
  | Check Rate  +------>|   Redis     |
  | Limit       |<------+   Cluster   |
  | (Lua Script)|       +-------------+
  +-----+------+
        |
        +------+------+
        |             |
   [ALLOWED]     [REJECTED]
        |             |
        v             v
  +-----+------+ +----+-------+
  | Set Headers| | Return 429 |
  | Forward to | | Set Headers|
  | App Server | | Retry-After|
  +-----+------+ +----+-------+
        |             |
        v             v
  +-----+------+ +----+-------+
  | App Server | | Client     |
  | Processes  | | Receives   |
  | Request    | | Error      |
  +------------+ +------------+
```

### 5.2 HTTP Response Headers

Rate limiters communicate quota information through standard HTTP headers:

```
Successful Request (200 OK):
-----------------------------
HTTP/1.1 200 OK
X-Ratelimit-Limit: 100          # Max requests allowed in window
X-Ratelimit-Remaining: 73       # Requests remaining in current window
X-Ratelimit-Reset: 1700000060   # Unix timestamp when window resets
X-Ratelimit-Policy: 100;w=60    # Policy: 100 requests per 60 seconds

Rate Limited Request (429):
-----------------------------
HTTP/1.1 429 Too Many Requests
X-Ratelimit-Limit: 100
X-Ratelimit-Remaining: 0
X-Ratelimit-Reset: 1700000060
Retry-After: 23                  # Seconds until client should retry
Content-Type: application/json

{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded. Please retry after 23 seconds.",
    "retry_after": 23,
    "limit": 100,
    "window": 60
  }
}
```

### 5.3 Middleware Implementation (Node.js / Express Example)

```typescript
interface RateLimitResult {
  allowed: boolean
  limit: number
  remaining: number
  resetAt: number
  retryAfter: number
}

async function rateLimiterMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const clientId = extractClientId(req)  // user ID, API key, or IP
  const endpoint = req.path
  const rule = await getRuleForRequest(clientId, endpoint)

  const result: RateLimitResult = await checkRateLimit(clientId, endpoint, rule)

  // Always set rate limit headers
  res.set({
    'X-Ratelimit-Limit': String(result.limit),
    'X-Ratelimit-Remaining': String(Math.max(0, result.remaining)),
    'X-Ratelimit-Reset': String(result.resetAt),
  })

  if (!result.allowed) {
    res.set('Retry-After', String(result.retryAfter))
    res.status(429).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Rate limit exceeded. Retry after ${result.retryAfter} seconds.`,
        retry_after: result.retryAfter,
        limit: result.limit,
        window: rule.window,
      },
    })
    return
  }

  next()
}

function extractClientId(req: Request): string {
  // Priority: API Key > User ID (JWT) > IP Address
  if (req.headers['x-api-key']) {
    return `apikey:${req.headers['x-api-key']}`
  }
  if (req.user?.id) {
    return `user:${req.user.id}`
  }
  return `ip:${req.ip}`
}
```

### 5.4 Race Conditions in Distributed Environments

**Problem**: Multiple rate limiter instances reading and writing to Redis
concurrently can produce incorrect counts.

```
Race Condition (Read-Then-Write):
=================================

  Rate Limiter 1                    Rate Limiter 2
  ===============                   ===============
  GET counter -> 9                  GET counter -> 9
  9 < 10, ALLOW                    9 < 10, ALLOW
  SET counter = 10                 SET counter = 10  (should be 11!)

  Result: Both requests allowed, but actual count = 11 > limit of 10
```

**Solution**: Use Redis Lua scripts for atomic read-check-increment operations.

```lua
-- Atomic sliding window counter (no race condition)
-- KEYS[1] = current window key
-- KEYS[2] = previous window key
-- ARGV[1] = limit
-- ARGV[2] = window size in seconds
-- ARGV[3] = current timestamp

local curr_key = KEYS[1]
local prev_key = KEYS[2]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

local curr_count = tonumber(redis.call('GET', curr_key) or '0')
local prev_count = tonumber(redis.call('GET', prev_key) or '0')

-- Calculate elapsed ratio in current window
local curr_window_start = math.floor(now / window) * window
local elapsed_ratio = (now - curr_window_start) / window

-- Weighted count
local estimated = prev_count * (1 - elapsed_ratio) + curr_count

if estimated >= limit then
    return { 0, 0, math.ceil(curr_window_start + window - now) }
end

-- Atomically increment
local new_count = redis.call('INCR', curr_key)
if new_count == 1 then
    redis.call('EXPIRE', curr_key, window * 2)
end

local remaining = math.max(0, math.floor(limit - (prev_count * (1 - elapsed_ratio) + new_count)))
local reset_at = curr_window_start + window

return { 1, remaining, math.ceil(reset_at - now) }
```

---

## 6. Distributed Rate Limiting

### 6.1 The Challenge

```
The Distributed Rate Limiting Problem
======================================

  User sends 100 requests. Limit = 100/min.
  With N rate limiter instances and no coordination:

  +--------+     +------------------+     +---------+
  | Client |---->| Load Balancer    |---->| RL-1    |  sees 33 reqs
  |        |     |                  |---->| RL-2    |  sees 33 reqs
  |        |     |                  |---->| RL-3    |  sees 34 reqs
  +--------+     +------------------+     +---------+

  Each instance thinks user is under limit!
  Actual: 100 requests allowed (should be limited after 100)
  Worst case with local counters: N * limit requests could pass through
```

### 6.2 Solution 1: Centralized Data Store (Redis)

**The primary and recommended solution.**

```
Centralized Redis Solution
===========================

  +--------+     +------------------+     +---------+
  | Client |---->| Load Balancer    |---->| RL-1    |---+
  |        |     |                  |---->| RL-2    |---+---> Redis Cluster
  |        |     |                  |---->| RL-3    |---+     (single source
  +--------+     +------------------+     +---------+         of truth)

  All instances atomically read/write the same counter in Redis.
  Lua scripts ensure no race conditions.
```

**Advantages**:
- Single source of truth
- Atomic operations via Lua scripts
- Simple to reason about

**Disadvantages**:
- Redis becomes a single point of failure (mitigated by Redis Cluster)
- Network latency to Redis on every request (~0.5ms)
- Redis throughput limits (~100K ops/sec per shard)

### 6.3 Solution 2: Sticky Sessions

```
Sticky Sessions (Session Affinity)
====================================

  +--------+     +------------------+     +---------+
  | User A |---->|                  |---->| RL-1    |  All of User A's
  |        |     |  Load Balancer   |     |         |  requests go here
  +--------+     |  (hash by user)  |     +---------+
                 |                  |
  +--------+     |                  |     +---------+
  | User B |---->|                  |---->| RL-2    |  All of User B's
  |        |     |                  |     |         |  requests go here
  +--------+     +------------------+     +---------+

  Each rate limiter maintains local counters.
  Hash(user_id) % N determines which instance handles the user.
```

**Advantages**:
- No external dependency (no Redis needed)
- Very low latency (local memory)

**Disadvantages**:
- Uneven load distribution
- Fails when instances scale up/down (rehashing)
- Loses counts on instance restart

### 6.4 Solution 3: Eventual Consistency with Synchronization

```
Eventual Consistency Model
============================

  +---------+         +---------+         +---------+
  |  RL-1   |<------->|  RL-2   |<------->|  RL-3   |
  | local:5 |  sync   | local:3 |  sync   | local:7 |
  |         |  every  |         |  every  |         |
  |         |  100ms  |         |  100ms  |         |
  +---------+         +---------+         +---------+

  Each instance:
  1. Maintains a local counter
  2. Periodically broadcasts delta to peers
  3. Applies received deltas
  4. Uses local estimate for decisions

  Trade-off: May slightly exceed limits during sync gaps
             but eliminates external dependency
```

**Advantages**:
- No single point of failure
- Very low latency (local decisions)
- Tolerates network partitions

**Disadvantages**:
- May exceed rate limits during sync intervals
- More complex implementation
- Eventually consistent (not strongly consistent)

### 6.5 Race Condition Handling with Redis Lua Scripts

All Redis operations for rate limiting MUST be atomic. The standard pattern:

```lua
-- Complete atomic token bucket implementation
-- Handles all race conditions by executing as a single Redis command

local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local requested = tonumber(ARGV[4])

-- Get current state (atomic read)
local data = redis.call('HMGET', key, 'tokens', 'last_refill')
local tokens = tonumber(data[1])
local last_refill = tonumber(data[2])

-- Initialize if first request
if tokens == nil then
    tokens = capacity
    last_refill = now
end

-- Refill tokens based on elapsed time
local elapsed = math.max(0, now - last_refill)
tokens = math.min(capacity, tokens + (elapsed * refill_rate))

-- Attempt to consume tokens
local allowed = 0
local remaining = tokens

if tokens >= requested then
    tokens = tokens - requested
    allowed = 1
    remaining = tokens
end

-- Write updated state (atomic write)
redis.call('HMSET', key,
    'tokens', tostring(tokens),
    'last_refill', tostring(now)
)

-- Set expiry to auto-cleanup (2x the time to fully refill)
local ttl = math.ceil((capacity / refill_rate) * 2)
redis.call('EXPIRE', key, ttl)

-- Return: [allowed (0/1), remaining tokens, retry_after seconds]
local retry_after = 0
if allowed == 0 then
    retry_after = math.ceil((requested - tokens) / refill_rate)
end

return { allowed, math.floor(remaining), retry_after }
```

**Why Lua scripts solve race conditions**:
1. Redis executes Lua scripts atomically (single-threaded)
2. No other command can interleave during execution
3. Read-check-update happens as one indivisible operation
4. No need for distributed locks or transactions

---

## 7. Scaling and Performance

### 7.1 Redis Cluster for High Availability

```
Redis Cluster Setup (3 masters + 3 replicas)
=============================================

  +------------------+     +------------------+     +------------------+
  |   Master 1       |     |   Master 2       |     |   Master 3       |
  |   Slots 0-5460   |     |   Slots 5461-    |     |   Slots 10923-   |
  |                  |     |   10922          |     |   16383          |
  +--------+---------+     +--------+---------+     +--------+---------+
           |                        |                        |
           v                        v                        v
  +--------+---------+     +--------+---------+     +--------+---------+
  |   Replica 1      |     |   Replica 2      |     |   Replica 3      |
  |   (failover)     |     |   (failover)     |     |   (failover)     |
  +------------------+     +------------------+     +------------------+

  Key Distribution:
    rate_limit:user123  -> hash("user123") % 16384 -> slot 7832 -> Master 2
    rate_limit:user456  -> hash("user456") % 16384 -> slot 2100 -> Master 1

  Failover:
    If Master 2 fails -> Replica 2 promoted to Master automatically
    Brief interruption (~1-2 seconds), then service resumes
```

### 7.2 Local Cache + Sync Approach

For ultra-low latency (sub-microsecond), use a local cache with periodic sync:

```
Local Cache + Redis Sync
=========================

  Rate Limiter Instance
  +--------------------------------------------+
  |                                            |
  |  +------------------+                     |
  |  | Local Cache      |  <-- Check first    |
  |  | (in-memory map)  |      (~1 microsecond)|
  |  | user123 -> 42    |                     |
  |  | user456 -> 7     |                     |
  |  +--------+---------+                     |
  |           |                                |
  |           | Sync every 100ms               |
  |           |                                |
  |  +--------v---------+                     |
  |  | Sync Worker      |                     |
  |  | - Batch flush    |-----> Redis Cluster  |
  |  | - Pull updates   |<----- (source of truth)
  |  +------------------+                     |
  |                                            |
  +--------------------------------------------+

  Flow:
  1. Request arrives
  2. Check local cache (fast path, ~1us)
  3. If under limit -> allow, increment local counter
  4. Background: every 100ms, flush local deltas to Redis
  5. Background: every 100ms, pull global counts from Redis
  6. If local cache missing -> query Redis (slow path, ~0.5ms)
```

**Trade-offs**:

| Aspect | Local Cache | Direct Redis |
|--------|-------------|--------------|
| Latency | ~1 microsecond | ~0.5 millisecond |
| Accuracy | Approximate (within sync interval) | Exact |
| Failure mode | Continues with local data | Fails if Redis down |
| Memory | Uses instance memory | Centralized |
| Consistency | Eventually consistent | Strongly consistent |

### 7.3 Monitoring and Alerting

Key metrics to track:

```yaml
metrics:
  counters:
    - rate_limit_requests_total          # Total requests checked
    - rate_limit_rejected_total          # Total 429 responses
    - rate_limit_allowed_total           # Total allowed requests
    - rate_limit_errors_total            # Errors in rate limiter

  histograms:
    - rate_limit_check_duration_seconds  # Time to check rate limit
    - rate_limit_redis_latency_seconds   # Redis operation latency

  gauges:
    - rate_limit_current_usage_ratio     # Current usage as % of limit
    - rate_limit_redis_connection_pool   # Active Redis connections

alerts:
  - name: HighRejectionRate
    condition: rate(rate_limit_rejected_total[5m]) / rate(rate_limit_requests_total[5m]) > 0.1
    severity: warning
    message: "More than 10% of requests are being rate limited"

  - name: RedisLatencyHigh
    condition: histogram_quantile(0.99, rate_limit_redis_latency_seconds) > 0.005
    severity: critical
    message: "Redis p99 latency exceeds 5ms"

  - name: RateLimiterErrors
    condition: rate(rate_limit_errors_total[1m]) > 0
    severity: critical
    message: "Rate limiter encountering errors"
```

---

## 8. Deployment Architecture

### 8.1 Multi-Region Setup

```
Multi-Region Deployment Architecture
======================================

                    +-------------------+
                    |   Global DNS      |
                    |   (Route 53 /     |
                    |    Cloudflare)    |
                    +--------+----------+
                             |
              +--------------+--------------+
              |                             |
    +---------v----------+       +----------v---------+
    |   Region: US-East  |       |   Region: EU-West  |
    |                    |       |                     |
    | +----------------+ |       | +----------------+  |
    | | Load Balancer  | |       | | Load Balancer  |  |
    | +-------+--------+ |       | +-------+--------+  |
    |         |          |       |         |           |
    | +-------v--------+ |       | +-------v--------+  |
    | | Rate Limiter   | |       | | Rate Limiter   |  |
    | | Instances (3)  | |       | | Instances (3)  |  |
    | +-------+--------+ |       | +-------+--------+  |
    |         |          |       |         |           |
    | +-------v--------+ |       | +-------v--------+  |
    | | Redis Cluster  |<-------->| Redis Cluster  |  |
    | | (Primary)      | | cross | | (Primary)      |  |
    | | 3M + 3R        | | region| | 3M + 3R        |  |
    | +-------+--------+ | sync  | +-------+--------+  |
    |         |          |       |         |           |
    | +-------v--------+ |       | +-------v--------+  |
    | | App Servers    | |       | | App Servers    |  |
    | | (Auto-scaling) | |       | | (Auto-scaling) |  |
    | +----------------+ |       | +----------------+  |
    +--------------------+       +---------------------+

Cross-Region Sync Options:
  Option A: Independent limits per region (simpler)
    - Each region enforces its own limits
    - Total capacity = N * per-region limit
    - Simple, but user traveling between regions gets full quota per region

  Option B: Global limits via cross-region sync (stricter)
    - Periodic sync of counters between regions (every 1-5 seconds)
    - Eventually consistent global view
    - More complex, but true global rate limiting

  Option C: Single global Redis (strictest)
    - All regions point to one Redis cluster
    - Higher latency for non-local regions
    - Simplest correctness model
```

### 8.2 Failover Strategy

**Critical decision: What happens when the rate limiter or Redis is down?**

```
Failover Decision Matrix
=========================

  +-----------+-------------+------------------------------------------+
  | Strategy  | When to Use | Behavior                                 |
  +===========+=============+==========================================+
  | Fail Open | Most APIs   | If rate limiter fails, ALLOW all requests |
  | (allow)   |             | Risk: Temporary spike in traffic          |
  |           |             | Benefit: No service disruption            |
  +-----------+-------------+------------------------------------------+
  | Fail      | Security-   | If rate limiter fails, DENY all requests  |
  | Closed    | critical    | Risk: Service disruption                  |
  | (deny)    | endpoints   | Benefit: Protection maintained            |
  +-----------+-------------+------------------------------------------+
  | Fail with | Balanced    | Use local in-memory fallback with         |
  | Fallback  | approach    | relaxed limits. Switch back when Redis    |
  |           |             | recovers.                                 |
  +-----------+-------------+------------------------------------------+
```

**Recommended implementation**:

```python
async def check_rate_limit(client_id, endpoint, rule):
    try:
        result = await redis_check(client_id, endpoint, rule)
        return result
    except RedisConnectionError:
        # Log the failure
        metrics.increment('rate_limit_redis_failure')

        if rule.fail_strategy == 'closed':
            # Security-critical: deny on failure
            return RateLimitResult(allowed=False, remaining=0)

        elif rule.fail_strategy == 'fallback':
            # Use local in-memory counter with relaxed limits
            return local_fallback_check(client_id, endpoint, rule)

        else:
            # Default: fail open
            return RateLimitResult(allowed=True, remaining=-1)
```

---

## 9. Trade-offs

### 9.1 Hard vs Soft Rate Limiting

```
Hard Rate Limiting:
  - Strict enforcement: once limit is hit, ALL excess requests rejected
  - Use for: billing, security, compliance
  - Example: "Exactly 100 requests per minute, no exceptions"

Soft Rate Limiting:
  - Allows temporary bursts above the limit
  - Use for: general API protection, user experience
  - Example: "Usually 100/min, but allow up to 120/min in short bursts"

  +-------------+------------------+-------------------+
  | Aspect      | Hard Limiting    | Soft Limiting     |
  +=============+==================+===================+
  | Enforcement | Strict cutoff    | Gradual degradation|
  | User Impact | Abrupt rejection | Graceful handling |
  | Use Case    | Security, billing| General APIs      |
  | Algorithm   | Fixed Window,    | Token Bucket,     |
  |             | Sliding Window   | Leaking Bucket    |
  | Overshoot   | 0%               | 10-20% allowed    |
  +-------------+------------------+-------------------+
```

### 9.2 Rate Limiting Dimensions

```
  Per-User Rate Limiting:
    Key: rate_limit:user:{user_id}:{endpoint}
    Pros: Fair per-user allocation, prevents abuse by individuals
    Cons: Requires authentication, doesn't protect against DDoS

  Per-IP Rate Limiting:
    Key: rate_limit:ip:{ip_address}:{endpoint}
    Pros: Works without auth, protects against unauthenticated abuse
    Cons: NAT/proxy can share IPs (unfair), easy to bypass with IP rotation

  Per-API-Key Rate Limiting:
    Key: rate_limit:apikey:{api_key}:{endpoint}
    Pros: Tied to billing, works for machine-to-machine
    Cons: Requires API key management

  Combined (Recommended):
    Apply multiple dimensions simultaneously:
    1. Global: 100K req/sec total (protect infrastructure)
    2. Per-IP: 100 req/min (prevent anonymous abuse)
    3. Per-User: Based on tier (fair usage enforcement)
    4. Per-Endpoint: Custom per API (protect expensive operations)

    Request must pass ALL applicable limits.
```

### 9.3 Accuracy vs Performance

```
  +---------------------+------------------+--------------------+
  | Approach            | Accuracy         | Performance        |
  +=====================+==================+====================+
  | Redis Lua (every    | Exact            | ~0.5ms per request |
  | request)            |                  |                    |
  +---------------------+------------------+--------------------+
  | Local cache +       | Approximate      | ~1us per request   |
  | periodic sync       | (within sync     | + periodic sync    |
  |                     | interval)        | overhead           |
  +---------------------+------------------+--------------------+
  | Probabilistic       | Statistical      | ~1us per request   |
  | (sampling)          | (check 1 in N    | N times less Redis |
  |                     | requests)        | load               |
  +---------------------+------------------+--------------------+
  | Client-side with    | Best effort      | Zero server cost   |
  | honor system        | (not enforced)   |                    |
  +---------------------+------------------+--------------------+

  Recommendation:
    - Start with Redis Lua for correctness
    - Add local cache if Redis latency becomes a bottleneck
    - Use probabilistic approach only for extremely high-volume,
      non-critical rate limits
```

---

## 10. Common Interview Follow-ups

### Q1: How to rate limit by different dimensions (user, IP, API)?

**Answer**: Apply rate limits as a chain of checks. The request must pass ALL
applicable limits.

```python
async def multi_dimension_check(request):
    checks = []

    # 1. Global rate limit (protect entire system)
    checks.append(check_limit(
        key=f"global",
        limit=100000,
        window=1
    ))

    # 2. Per-IP rate limit (anonymous abuse prevention)
    checks.append(check_limit(
        key=f"ip:{request.ip}",
        limit=100,
        window=60
    ))

    # 3. Per-user rate limit (if authenticated)
    if request.user:
        tier_limit = get_tier_limit(request.user.tier)
        checks.append(check_limit(
            key=f"user:{request.user.id}",
            limit=tier_limit,
            window=3600
        ))

    # 4. Per-endpoint rate limit
    endpoint_limit = get_endpoint_limit(request.path)
    if endpoint_limit:
        checks.append(check_limit(
            key=f"endpoint:{request.user.id}:{request.path}",
            limit=endpoint_limit.limit,
            window=endpoint_limit.window
        ))

    # Execute all checks in parallel via Redis pipeline
    results = await asyncio.gather(*checks)

    # Request is allowed only if ALL checks pass
    for result in results:
        if not result.allowed:
            return result  # Return the most restrictive failure

    # Return the result with the lowest remaining quota
    return min(results, key=lambda r: r.remaining)
```

### Q2: How to handle distributed clock skew?

**Answer**: Clock skew between servers can cause inconsistent window boundaries.

```
Problem:
  Server A clock: 12:00:00.000
  Server B clock: 12:00:00.150 (150ms ahead)

  At Server A's 12:00:59.900:
    Server A: current window = [12:00:00, 12:01:00)
    Server B: current window = [12:01:00, 12:02:00)  (already in next window!)

Solutions:

  1. Use Redis server time (RECOMMENDED):
     - All Lua scripts use redis.call('TIME') instead of client timestamps
     - Single time source eliminates skew
     - Adds negligible overhead

  2. NTP synchronization:
     - Keep all servers synced via NTP (typical skew < 10ms)
     - Acceptable for most use cases
     - Use window sizes >> NTP skew (60s window, 10ms skew = negligible)

  3. Logical timestamps:
     - Use Redis INCR-based logical clocks
     - No wall-clock dependency
     - More complex but skew-immune
```

```lua
-- Using Redis server time in Lua script (Solution 1)
local time = redis.call('TIME')
local now = tonumber(time[1]) + tonumber(time[2]) / 1000000  -- seconds.microseconds
-- Use 'now' for all window calculations
```

### Q3: How to implement tiered rate limiting (free vs premium)?

**Answer**: Store tier information with the user and look up limits dynamically.

```
Tiered Rate Limiting Architecture
===================================

  +--------+     +-------------+     +-----------+     +-------+
  | Client |---->| Rate Limiter|---->| Rules     |---->| Redis |
  |        |     |             |     | Engine    |     |       |
  +--------+     +------+------+     +-----+-----+     +---+---+
                        |                  |                |
                        |   1. Extract     |                |
                        |   user ID        |                |
                        |                  |                |
                        |   2. Lookup tier +                |
                        |   from JWT/cache |                |
                        |                  |                |
                        |   3. Get limits  |                |
                        |   for tier       |                |
                        |                  |                |
                        |   4. Check Redis +--------------->|
                        |   counter        |                |
                        |                  |                |
                        +------------------+                |

  Implementation:

  tier_limits = {
      "free":       { "rpm": 60,    "rph": 1000,   "rpd": 10000   },
      "basic":      { "rpm": 300,   "rph": 10000,  "rpd": 100000  },
      "premium":    { "rpm": 1000,  "rph": 50000,  "rpd": 500000  },
      "enterprise": { "rpm": 5000,  "rph": 200000, "rpd": 2000000 },
  }

  # Multiple windows checked simultaneously:
  # rate_limit:user123:minute:28333333  -> per-minute counter
  # rate_limit:user123:hour:472222      -> per-hour counter
  # rate_limit:user123:day:19675        -> per-day counter
```

```python
async def tiered_rate_limit(user_id, user_tier):
    limits = TIER_LIMITS[user_tier]
    current_time = time.time()

    # Build all keys for parallel check
    minute_window = int(current_time / 60)
    hour_window = int(current_time / 3600)
    day_window = int(current_time / 86400)

    keys_and_limits = [
        (f"rate:{user_id}:min:{minute_window}", limits["rpm"], 120),
        (f"rate:{user_id}:hr:{hour_window}", limits["rph"], 7200),
        (f"rate:{user_id}:day:{day_window}", limits["rpd"], 172800),
    ]

    # Check all windows atomically in a single Lua script
    results = await redis.eval(MULTI_WINDOW_LUA, keys_and_limits)

    # Return most restrictive result
    for result in results:
        if not result["allowed"]:
            return result

    return {"allowed": True, "tier": user_tier, "limits": limits}
```

### Q4: How to gracefully degrade?

**Answer**: Implement multiple fallback layers.

```
Graceful Degradation Cascade
==============================

  Level 0: Normal Operation
  +---------------------------------------------------+
  |  Redis Cluster healthy                             |
  |  Full accuracy, all features enabled               |
  |  Latency: ~0.5ms                                   |
  +---------------------------------------------------+
                    |
                    | Redis latency > 5ms or errors > 1%
                    v
  Level 1: Local Cache Mode
  +---------------------------------------------------+
  |  Switch to local in-memory counters                |
  |  Sync to Redis every 500ms (if available)          |
  |  Accuracy: approximate (may exceed by sync_interval)|
  |  Latency: ~0.001ms                                 |
  +---------------------------------------------------+
                    |
                    | Redis completely unreachable
                    v
  Level 2: Relaxed Limits
  +---------------------------------------------------+
  |  Local counters only, no sync                      |
  |  Apply 2x the normal limits (to account for N nodes)|
  |  Each node enforces limit/N as its share           |
  |  Latency: ~0.001ms                                 |
  +---------------------------------------------------+
                    |
                    | Local rate limiter crashes
                    v
  Level 3: Fail Open (last resort)
  +---------------------------------------------------+
  |  No rate limiting, all requests pass through       |
  |  Rely on downstream circuit breakers               |
  |  Alert ops team immediately                        |
  |  Latency: 0ms                                      |
  +---------------------------------------------------+
```

```python
class ResilientRateLimiter:
    def __init__(self, redis_client, config):
        self.redis = redis_client
        self.config = config
        self.local_counters = {}       # In-memory fallback
        self.degradation_level = 0
        self.consecutive_failures = 0

    async def check(self, key, limit, window):
        # Level 0: Try Redis first
        if self.degradation_level == 0:
            try:
                result = await asyncio.wait_for(
                    self._redis_check(key, limit, window),
                    timeout=0.005  # 5ms timeout
                )
                self.consecutive_failures = 0
                return result
            except (RedisError, asyncio.TimeoutError):
                self.consecutive_failures += 1
                if self.consecutive_failures > 3:
                    self.degradation_level = 1
                    log.warning("Degrading to Level 1: local cache mode")

        # Level 1: Local cache with periodic sync
        if self.degradation_level <= 1:
            try:
                return self._local_check(key, limit, window)
            except Exception:
                self.degradation_level = 2
                log.warning("Degrading to Level 2: relaxed limits")

        # Level 2: Relaxed limits (share among N nodes)
        if self.degradation_level == 2:
            relaxed_limit = limit * 2  # More permissive
            return self._local_check(key, relaxed_limit, window)

        # Level 3: Fail open
        log.error("Rate limiter fully degraded: failing open")
        return RateLimitResult(allowed=True, remaining=-1)
```

### Q5: How would you implement rate limiting for a WebSocket or streaming API?

**Answer**: For persistent connections, rate limit on messages rather than connections.

```
WebSocket Rate Limiting
========================

  Connection-level limits:
    - Max N concurrent connections per user
    - Connection rate: max M new connections per minute

  Message-level limits:
    - Max P messages per second per connection
    - Max Q bytes per second per connection

  Implementation:
    1. On connection: check connection rate limit
    2. On each message: check message rate limit
    3. If limit exceeded: send warning frame, then close if persistent

  Token bucket is ideal here:
    - Capacity = burst size (e.g., 20 messages)
    - Refill rate = sustained rate (e.g., 5 messages/sec)
    - Allows short bursts of chat messages while preventing flood
```

### Q6: How do you prevent API key sharing/abuse?

```
Detecting API Key Sharing
===========================

  Signals that an API key might be shared:
  1. Requests from many distinct IPs (> threshold)
  2. Requests from multiple geographic regions simultaneously
  3. Request patterns inconsistent with single-user behavior
  4. User-Agent diversity beyond normal

  Response:
  1. Track unique IPs per API key: SET rate_limit:ips:{api_key} {ip}
  2. If SCARD rate_limit:ips:{api_key} > threshold: flag for review
  3. Apply stricter per-IP-per-key limits
  4. Notify account owner
```

### Q7: How to handle rate limiting with API versioning?

```
API Version-Aware Rate Limiting
=================================

  Option A: Shared limits across versions
    Key: rate_limit:user:{user_id}:/api/search
    All versions of /search share the same limit

  Option B: Independent limits per version
    Key: rate_limit:user:{user_id}:/api/v1/search
    Key: rate_limit:user:{user_id}:/api/v2/search
    Each version has its own limit

  Option C: Shared with version-specific overrides
    Default: rate_limit:user:{user_id}:/api/search (100/min)
    Override: /api/v2/search gets 200/min (more efficient version)

  Recommendation: Option C - shared by default with overrides for
  versions that have different performance characteristics.
```

---

## Summary

```
Design Checklist for Rate Limiter Interview
=============================================

  [x] Clarify requirements (functional + non-functional)
  [x] Choose algorithm (Token Bucket or Sliding Window Counter recommended)
  [x] Design data model (Redis keys, rules schema)
  [x] Handle distributed environment (centralized Redis + Lua scripts)
  [x] Set proper HTTP headers (X-Ratelimit-*, Retry-After)
  [x] Address race conditions (atomic Lua scripts)
  [x] Plan failover strategy (fail open vs fail closed)
  [x] Design monitoring and alerting
  [x] Consider multi-region deployment
  [x] Discuss trade-offs (accuracy vs performance, hard vs soft)
  [x] Address follow-up questions (tiered, clock skew, degradation)

Key Takeaways:
  1. Token Bucket and Sliding Window Counter are the most practical algorithms
  2. Redis + Lua scripts solve both storage and atomicity
  3. Always fail open unless security-critical
  4. Rate limit by multiple dimensions (user + IP + endpoint)
  5. Set proper HTTP headers so clients can self-regulate
  6. Monitor rejection rates and alert on anomalies
```
