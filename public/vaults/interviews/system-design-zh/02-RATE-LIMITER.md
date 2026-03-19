# 设计 Rate Limiter

Rate Limiter 控制客户端或服务发送的流量速率。当请求数量在时间窗口内超过阈值时，多余的请求会被限流或丢弃。Rate Limiting 对于保护服务免受滥用、防止资源饥饿和管理成本至关重要。

---

## 1. 需求澄清

### 功能需求

| #   | 需求                     | 详情                                       |
| --- | ------------------------ | ------------------------------------------ |
| FR1 | 限制每个时间窗口的请求数 | 例如，每用户每分钟 100 个请求              |
| FR2 | 不同 API 端点的不同规则  | 例如，`/login` = 5/min，`/search` = 30/min |
| FR3 | 不同用户等级的不同规则   | Free = 100/hr，Premium = 10,000/hr         |
| FR4 | 通知客户端限流状态       | 在响应头中返回剩余配额                     |
| FR5 | 超出限制时返回 429       | 标准 HTTP 429 Too Many Requests            |
| FR6 | 可配置规则               | 规则可以无需重新部署即可更新               |

### 非功能需求

| #    | 需求     | 目标                |
| ---- | -------- | ------------------- |
| NFR1 | 低延迟   | 每个请求 < 1ms 开销 |
| NFR2 | 高可用性 | 99.99% 正常运行时间 |
| NFR3 | 分布式   | 跨多服务器/区域工作 |
| NFR4 | 容错性   | 故障时优雅降级      |
| NFR5 | 内存高效 | 最小化每客户端存储  |
| NFR6 | 准确性   | 最小化多计或少计    |

### Rate Limiter 的放置位置

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

**建议**：在大多数场景中使用 Middleware/API Gateway。它将限流逻辑与业务逻辑解耦，并提供单一的执行点。

### 粗略估算

假设：

- 1000 万活跃用户
- 高峰期平均每用户每分钟 10 个请求
- 高峰期每分钟 1 亿请求
- 每个限流记录：约 50 字节（key + counter + timestamp）
- 存储：1000 万用户 x 50 字节 = 约 500 MB（可放入单个 Redis 实例）

---

## 2. Rate Limiting 算法

### 2.1 Token Bucket

**工作原理**：一个桶持有最多到最大容量的 Token。Token 以固定的补充速率添加。每个请求消耗一个 Token。如果没有剩余 Token，请求将被拒绝。

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

**伪代码**：

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

**Redis 实现**：

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

| 优点                                   | 缺点                                |
| -------------------------------------- | ----------------------------------- |
| 允许突发流量，最多到桶的大小           | 需要调整两个参数（capacity + rate） |
| 内存高效（每个 key 仅 2 个值）         | 桶边界处可能出现突发                |
| 平滑的限流                             | 比 Fixed Window 稍复杂              |
| 被 AWS、Stripe 和大多数 API 提供商使用 | -                                   |

---

### 2.2 Leaking Bucket

**工作原理**：请求被放入 FIFO 队列（桶）中。请求以固定速率从队列中泄出（被处理）。如果队列已满，新请求将被丢弃。

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

**伪代码**：

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

| 优点                     | 缺点                           |
| ------------------------ | ------------------------------ |
| 平滑的输出速率（无突发） | 突发流量填满队列；新请求被丢弃 |
| 内存高效                 | 不保证处理最近的请求           |
| 可预测的处理速率         | 旧请求可能饿死新请求           |
| 被 Shopify 使用          | 当突发是可接受的时候不适用     |

---

### 2.3 Fixed Window Counter

**工作原理**：时间被分成固定窗口（例如，每分钟）。一个计数器跟踪当前窗口中的请求。当计数器超过阈值时，请求将被拒绝，直到下一个窗口开始。

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

**伪代码**：

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

**Redis 命令**：

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

| 优点                            | 缺点                            |
| ------------------------------- | ------------------------------- |
| 实现非常简单                    | 边界突发问题（边缘处 2 倍速率） |
| 内存高效（每个窗口 1 个计数器） | 不平滑；突然重置                |
| 易于理解                        | 窗口边界处出现尖峰              |
| 快速 O(1) 操作                  | 对窗口后期到达的用户不公平      |

---

### 2.4 Sliding Window Log

**工作原理**：在有序集合中存储每个请求的时间戳。当新请求到达时，移除所有超出窗口的旧时间戳。统计剩余条目数。如果计数超过限制，则拒绝。

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

**伪代码**：

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

**Redis Lua 脚本**：

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

| 优点                 | 缺点                         |
| -------------------- | ---------------------------- |
| 非常准确，无边界问题 | 高内存使用（存储每个时间戳） |
| 平滑的滑动窗口       | 每个请求 O(N) 的清理开销     |
| 精确的每用户跟踪     | 不适合高流量端点             |
| 边界处无突发         | 存储随请求量增长             |

---

### 2.5 Sliding Window Counter

**工作原理**：将 Fixed Window Counter 与 Sliding Window 的准确性相结合。使用当前和前一个窗口的计数器，按重叠百分比对前一个窗口的计数进行加权。

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

**伪代码**：

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

| 优点                            | 缺点                           |
| ------------------------------- | ------------------------------ |
| 内存高效（每个 key 2 个计数器） | 只是近似值（不精确）           |
| 平滑边界尖峰                    | 比 Fixed Window 稍复杂         |
| 准确性和性能的良好平衡          | 加权计数是估算值               |
| 被 Cloudflare 推荐              | 极少数边缘情况可能略微超出限制 |

---

### 2.6 算法对比表

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

按用例推荐：
  - API 限流（通用）：               Token Bucket 或 Sliding Window Counter
  - 严格无突发需求：                 Leaking Bucket
  - 简单实现：                       Fixed Window Counter
  - 需要精确准确性：                 Sliding Window Log
  - 高流量且需要良好准确性：         Sliding Window Counter
```

---

## 3. 高层架构

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

### 组件职责

| 组件          | 职责                               |
| ------------- | ---------------------------------- |
| API Gateway   | 入口点、路由、TLS 终止             |
| Rate Limiter  | 执行限流、设置响应头               |
| Redis Cluster | 存储计数器/Token、原子操作         |
| Rules Engine  | 存储和提供限流配置                 |
| App Servers   | 处理业务逻辑（仅接收被允许的请求） |

---

## 4. 数据模型

### 4.1 按算法分类的 Redis 数据结构

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

### 4.2 Rate Limiting 规则 Schema

```yaml
# rate_limit_rules.yaml
rules:
  - id: 'global-default'
    description: 'Default rate limit for all endpoints'
    match:
      scope: 'global'
    limit: 1000
    window: 60 # seconds
    algorithm: 'sliding_window_counter'
    action: 'reject' # reject | queue | throttle

  - id: 'auth-strict'
    description: 'Strict limit on authentication endpoints'
    match:
      endpoints:
        - '/api/v1/login'
        - '/api/v1/register'
        - '/api/v1/password-reset'
      scope: 'per_ip'
    limit: 5
    window: 60
    algorithm: 'sliding_window_log'
    action: 'reject'
    response:
      status: 429
      message: 'Too many authentication attempts. Please try again later.'

  - id: 'search-api'
    description: 'Search endpoint rate limit'
    match:
      endpoints:
        - '/api/v1/search'
      scope: 'per_user'
    limit: 30
    window: 60
    algorithm: 'token_bucket'
    token_bucket:
      capacity: 30
      refill_rate: 0.5 # tokens per second
    action: 'reject'

  - id: 'premium-tier'
    description: 'Higher limits for premium users'
    match:
      user_tier: 'premium'
      scope: 'per_user'
    limit: 10000
    window: 3600 # 1 hour
    algorithm: 'sliding_window_counter'
    priority: 10 # Higher priority overrides lower

  - id: 'free-tier'
    description: 'Standard limits for free users'
    match:
      user_tier: 'free'
      scope: 'per_user'
    limit: 100
    window: 3600
    algorithm: 'sliding_window_counter'
    priority: 5
```

### 4.3 JSON 配置示例

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

## 5. 详细设计

### 5.1 Rate Limiter 中间件流程

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

### 5.2 HTTP 响应头

Rate Limiter 通过标准 HTTP 头传达配额信息：

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

### 5.3 中间件实现（Node.js / Express 示例）

```typescript
interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfter: number;
}

async function rateLimiterMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const clientId = extractClientId(req); // user ID, API key, or IP
  const endpoint = req.path;
  const rule = await getRuleForRequest(clientId, endpoint);

  const result: RateLimitResult = await checkRateLimit(
    clientId,
    endpoint,
    rule
  );

  // Always set rate limit headers
  res.set({
    'X-Ratelimit-Limit': String(result.limit),
    'X-Ratelimit-Remaining': String(Math.max(0, result.remaining)),
    'X-Ratelimit-Reset': String(result.resetAt),
  });

  if (!result.allowed) {
    res.set('Retry-After', String(result.retryAfter));
    res.status(429).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Rate limit exceeded. Retry after ${result.retryAfter} seconds.`,
        retry_after: result.retryAfter,
        limit: result.limit,
        window: rule.window,
      },
    });
    return;
  }

  next();
}

function extractClientId(req: Request): string {
  // Priority: API Key > User ID (JWT) > IP Address
  if (req.headers['x-api-key']) {
    return `apikey:${req.headers['x-api-key']}`;
  }
  if (req.user?.id) {
    return `user:${req.user.id}`;
  }
  return `ip:${req.ip}`;
}
```

### 5.4 分布式环境中的竞态条件

**问题**：多个 Rate Limiter 实例并发读写 Redis 可能产生不正确的计数。

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

**解决方案**：使用 Redis Lua 脚本实现原子的读取-检查-递增操作。

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

## 6. 分布式 Rate Limiting

### 6.1 挑战

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

### 6.2 方案 1：集中式数据存储（Redis）

**首选且推荐的方案。**

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

**优势**：

- 单一数据源
- 通过 Lua 脚本实现原子操作
- 易于理解和推理

**劣势**：

- Redis 成为单点故障（通过 Redis Cluster 缓解）
- 每次请求的 Redis 网络延迟（约 0.5ms）
- Redis 吞吐量限制（每个分片约 100K ops/sec）

### 6.3 方案 2：Sticky Sessions

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

**优势**：

- 无外部依赖（不需要 Redis）
- 非常低的延迟（本地内存）

**劣势**：

- 负载分布不均匀
- 实例扩缩容时失效（需要重新哈希）
- 实例重启时丢失计数

### 6.4 方案 3：最终一致性与同步

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

**优势**：

- 无单点故障
- 非常低的延迟（本地决策）
- 可容忍网络分区

**劣势**：

- 在同步间隔期间可能超出限流限制
- 实现更复杂
- 最终一致性（非强一致性）

### 6.5 使用 Redis Lua 脚本处理竞态条件

所有 Redis 的限流操作必须是原子的。标准模式：

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

**为什么 Lua 脚本能解决竞态条件**：

1. Redis 以原子方式执行 Lua 脚本（单线程）
2. 在执行期间没有其他命令可以交错
3. 读取-检查-更新作为一个不可分割的操作发生
4. 不需要分布式锁或事务

---

## 7. 扩展与性能

### 7.1 Redis Cluster 实现高可用

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

### 7.2 本地缓存 + 同步方案

对于超低延迟（亚微秒级），使用带有周期性同步的本地缓存：

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

**权衡取舍**：

| 方面     | 本地缓存             | 直接 Redis       |
| -------- | -------------------- | ---------------- |
| 延迟     | 约 1 微秒            | 约 0.5 毫秒      |
| 准确性   | 近似��在同步间隔内） | 精确             |
| 故障模式 | 使用本地数据继续运行 | Redis 宕机则失败 |
| 内存     | 使用实例内存         | 集中式           |
| 一致性   | 最终一致性           | 强一致性         |

### 7.3 监控与告警

需要跟踪的关键指标：

```yaml
metrics:
  counters:
    - rate_limit_requests_total # Total requests checked
    - rate_limit_rejected_total # Total 429 responses
    - rate_limit_allowed_total # Total allowed requests
    - rate_limit_errors_total # Errors in rate limiter

  histograms:
    - rate_limit_check_duration_seconds # Time to check rate limit
    - rate_limit_redis_latency_seconds # Redis operation latency

  gauges:
    - rate_limit_current_usage_ratio # Current usage as % of limit
    - rate_limit_redis_connection_pool # Active Redis connections

alerts:
  - name: HighRejectionRate
    condition: rate(rate_limit_rejected_total[5m]) / rate(rate_limit_requests_total[5m]) > 0.1
    severity: warning
    message: 'More than 10% of requests are being rate limited'

  - name: RedisLatencyHigh
    condition: histogram_quantile(0.99, rate_limit_redis_latency_seconds) > 0.005
    severity: critical
    message: 'Redis p99 latency exceeds 5ms'

  - name: RateLimiterErrors
    condition: rate(rate_limit_errors_total[1m]) > 0
    severity: critical
    message: 'Rate limiter encountering errors'
```

---

## 8. 部署架构

### 8.1 多区域部署

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

跨区域同步选项：
  选项 A：每个区域独立限制（更简单）
    - 每个区域执行自己的限制
    - 总容量 = N * 每区域限制
    - 简单，但跨区域旅行的用户在每个区域获得完整配额

  选项 B：通过跨区域同步实现全局限制（更严格）
    - 区域间周期性同步计数器（每 1-5 秒）
    - 最终一致的全局视图
    - 更复杂，但实现真正的全局限流

  选项 C：单一全局 Redis（最严格）
    - 所有区域指向一个 Redis 集群
    - 非本地区域延迟更高
    - 最简单的正确性模型
```

### 8.2 故障转移策略

**关键决策：当 Rate Limiter 或 Redis 宕机时会发生什么？**

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

**推荐实现**：

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

## 9. 权衡取舍

### 9.1 硬限流 vs 软限流

```
硬限流：
  - 严格执行：一旦达到限制，所有超出的请求都被拒绝
  - 适用于：计费、安全、合规
  - 示例："每分钟恰好 100 个请求，无例外"

软限流：
  - 允许临时超出限制的突发
  - 适用于：通用 API 保护、用户体验
  - 示例："通常 100/min，但允许短暂突发到 120/min"

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

### 9.2 Rate Limiting 维度

```
  按用户限流：
    Key: rate_limit:user:{user_id}:{endpoint}
    优点：公平的每用户分配，防止个人滥用
    缺点：需要认证，不能防御 DDoS

  按 IP 限流：
    Key: rate_limit:ip:{ip_address}:{endpoint}
    优点：无需认证即可工作，防止未认证的滥用
    缺点：NAT/代理可共享 IP（不公平），易通过 IP 轮换绕过

  按 API Key 限流：
    Key: rate_limit:apikey:{api_key}:{endpoint}
    优点：与计费绑定，适用于机器对机器通信
    缺点：需要 API Key 管理

  组合方式（推荐）：
    同时应用多个维度：
    1. 全局：100K req/sec 总量（保护基础设施）
    2. 按 IP：100 req/min（防止匿名滥用）
    3. 按用户：基于等级（公平使用执行）
    4. 按端点：每个 API 自定义（保护昂贵操作）

    请求必须通过所有适用的限制。
```

### 9.3 准确性 vs 性能

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

  建议：
    - 从 Redis Lua 开始以确保正确性
    - 如果 Redis 延迟成为瓶颈，添加本地缓存
    - 仅对极高流量、非关键的限流使用概率方法
```

---

## 10. 常见面试追问

### Q1：如何按不同维度（用户、IP、API）进行限流？

**回答**：将限流作为一系列检查的链条应用。请求必须通过所有适用的限制。

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

### Q2：如何处理分布式时钟偏差？

**回答**：服务器之间的时钟偏差可能导致窗口边界不一致。

```
问题：
  Server A clock: 12:00:00.000
  Server B clock: 12:00:00.150 (150ms ahead)

  At Server A's 12:00:59.900:
    Server A: current window = [12:00:00, 12:01:00)
    Server B: current window = [12:01:00, 12:02:00)  (already in next window!)

解决方案：

  1. 使用 Redis 服务器时间（推荐）：
     - 所有 Lua 脚本使用 redis.call('TIME') 而非客户端时间戳
     - 单一时间源消除偏差
     - 增加的开销可忽略不计

  2. NTP 同步：
     - 通过 NTP 保持所有服务器同步（典型偏差 < 10ms）
     - 对大多数用例可接受
     - 使用远大于 NTP 偏差的窗口大小（60s 窗口，10ms 偏差 = 可忽略）

  3. 逻辑时间戳：
     - 使用基于 Redis INCR 的逻辑时钟
     - 无墙钟依赖
     - 更复杂但免疫时钟偏差
```

```lua
-- Using Redis server time in Lua script (Solution 1)
local time = redis.call('TIME')
local now = tonumber(time[1]) + tonumber(time[2]) / 1000000  -- seconds.microseconds
-- Use 'now' for all window calculations
```

### Q3：如何实现分级限流（免费 vs 高级）？

**回答**：将等级信息与用户一起存储，并动态查找限制。

```
分级限流架构
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

### Q4：如何优雅降级？

**回答**：实现多层回退。

```
优雅降级级联
==============================

  Level 0：正常运行
  +---------------------------------------------------+
  |  Redis Cluster 健康                                |
  |  完全准确，所有功能启用                             |
  |  延迟：约 0.5ms                                    |
  +---------------------------------------------------+
                    |
                    | Redis 延迟 > 5ms 或错误率 > 1%
                    v
  Level 1：本地缓存模式
  +---------------------------------------------------+
  |  切换到本地内存计数器                               |
  |  每 500ms 同步到 Redis（如果可用）                  |
  |  准确性：近似（可能超出同步间隔量）                 |
  |  延迟：约 0.001ms                                  |
  +---------------------------------------------------+
                    |
                    | Redis 完全不可达
                    v
  Level 2：宽松限制
  +---------------------------------------------------+
  |  仅使用本地计数器，无同步                           |
  |  应用 2 倍正常限制（考虑 N 个节点）                |
  |  每个节点执行 limit/N 作为其份额                    |
  |  延迟：约 0.001ms                                  |
  +---------------------------------------------------+
                    |
                    | 本地限流器崩溃
                    v
  Level 3：Fail Open（最后手段）
  +---------------------------------------------------+
  |  无限流，所有请求通过                               |
  |  依赖下游熔断器                                    |
  |  立即告警运维团队                                  |
  |  延迟：0ms                                         |
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

### Q5：如何为 WebSocket 或流式 API 实现限流？

**回答**：对于持久连接，按消息而非连接进行限流。

```
WebSocket Rate Limiting
========================

  连接级限制：
    - 每用户最多 N 个并发连接
    - 连接速率：每分钟最多 M 个新连接

  消息级限制：
    - 每连接每秒最多 P 条消息
    - 每连接每秒最多 Q 字节

  实现：
    1. 建立连接时：检查连接速率限制
    2. 每条消息时：检查消息速率限制
    3. 超出限制时：发送警告帧，若持续则关闭连接

  Token Bucket 在此非常理想：
    - Capacity = 突发大小（例如，20 条消息）
    - Refill rate = 持续速率（例如，5 条消息/秒）
    - 允许短暂的聊天消息突发，同时防止洪水攻击
```

### Q6：如何防止 API Key 共享/滥用？

```
检测 API Key 共享
===========================

  API Key 可能被共享的信号：
  1. 来自许多不同 IP 的请求（超过阈值）
  2. 同时来自多个地理区域的请求
  3. 请求模式与单用户行为不一致
  4. User-Agent 多样性超出正常范围

  应对措施：
  1. 跟踪每个 API Key 的唯一 IP：SET rate_limit:ips:{api_key} {ip}
  2. 如果 SCARD rate_limit:ips:{api_key} > 阈值：标记审查
  3. 对每个 IP-Key 组合应用更严格的限制
  4. 通知账户所有者
```

### Q7：如何处理 API 版本控制下的限流？

```
API 版本感知的 Rate Limiting
=================================

  选项 A：跨版本共享限制
    Key: rate_limit:user:{user_id}:/api/search
    所有版本的 /search 共享相同的限制

  选项 B：每个版本独立限制
    Key: rate_limit:user:{user_id}:/api/v1/search
    Key: rate_limit:user:{user_id}:/api/v2/search
    每个版本有自己的限制

  选项 C：共享并带有版本特定覆盖
    默认：rate_limit:user:{user_id}:/api/search (100/min)
    覆盖：/api/v2/search 获得 200/min（更高效的版本）

  建议：选项 C - 默认共享，对具有不同性能特征的版本
  使用覆盖。
```

---

## 总结

```
Rate Limiter 面试设计检查清单
=============================================

  [x] 澄清需求（功能 + 非功能）
  [x] 选择算法（推荐 Token Bucket 或 Sliding Window Counter）
  [x] 设计数据模型（Redis key、规则 schema）
  [x] 处理分布式环境（集中式 Redis + Lua 脚本）
  [x] 设置合适的 HTTP 头（X-Ratelimit-*、Retry-After）
  [x] 解决竞态条件（原子 Lua 脚本）
  [x] 规划故障转移策略（Fail Open vs Fail Closed）
  [x] 设计监控和告警
  [x] 考虑多区域部署
  [x] 讨论权衡取舍（准确性 vs 性能，硬限流 vs 软限流）
  [x] 回答追问问题（分级、时钟偏差、降级）

关键要点：
  1. Token Bucket 和 Sliding Window Counter 是最实用的算法
  2. Redis + Lua 脚本同时解决存储和原子性问题
  3. 除非安全关键，否则始终选择 Fail Open
  4. 按多个维度进行限流（用户 + IP + 端点）
  5. 设置合适的 HTTP 头，让客户端能够自我调节
  6. 监控拒绝率并对异常进行告警
```
