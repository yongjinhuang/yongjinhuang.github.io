# Design a URL Shortener (TinyURL / bit.ly)

A URL shortener maps a long URL to a short, unique alias (e.g., `https://tinyurl.com/abc123`)
that redirects users to the original URL. This is one of the most frequently asked system design
questions because it touches on hashing, databases, caching, scaling, and analytics -- all in a
deceptively simple product.

---

## 1. Requirements Clarification

### 1.1 Functional Requirements

| #   | Requirement         | Details                                                   |
| --- | ------------------- | --------------------------------------------------------- |
| F1  | Shorten a URL       | Given a long URL, generate a unique short alias           |
| F2  | Redirect            | Visiting the short URL redirects to the original long URL |
| F3  | Custom aliases      | Users can optionally pick a custom short key              |
| F4  | Expiration          | URLs can have an optional time-to-live (TTL)              |
| F5  | Analytics           | Track click count, referrer, geo, device (stretch goal)   |
| F6  | Delete / deactivate | Owner can remove a short URL                              |

### 1.2 Non-Functional Requirements

| #   | Requirement          | Target                                        |
| --- | -------------------- | --------------------------------------------- |
| NF1 | High availability    | 99.99% uptime (< 52 min downtime/year)        |
| NF2 | Low latency redirect | p99 < 100 ms for redirect                     |
| NF3 | Not guessable        | Short URLs should not be easily enumerable    |
| NF4 | Durability           | Once created, a URL mapping must not be lost  |
| NF5 | Scalability          | Handle billions of URLs, massive read traffic |
| NF6 | Fault tolerance      | No single point of failure                    |

### 1.3 Capacity Estimation

**Assumptions:**

```
New URLs created per day    : 100 M (100,000,000)
Read-to-write ratio         : 100 : 1
Retention period            : 5 years
Average long URL size       : 500 bytes
Short URL key length        : 7 characters (Base62)
```

**Writes (URL creation):**

```
100 M / day
= 100,000,000 / 86,400 sec
~ 1,160 writes/sec

Peak (2x average)
~ 2,320 writes/sec
```

**Reads (redirects):**

```
100 : 1 ratio
= 100 * 1,160
~ 116,000 reads/sec

Peak (2x)
~ 232,000 reads/sec
```

**Storage over 5 years:**

```
Total URLs = 100 M/day * 365 days * 5 years
           = 182.5 billion URLs
           ~ 183 B records

Storage per record:
  short_url (7 chars)     :     7 bytes
  long_url (avg)          :   500 bytes
  created_at (timestamp)  :     8 bytes
  expires_at (timestamp)  :     8 bytes
  user_id                 :     8 bytes
  overhead (indexes, etc.):   ~77 bytes
  ----------------------------------
  Total per record        :  ~608 bytes
  Round up to             :  ~700 bytes

Total storage = 183 B * 700 bytes
              = 128.1 TB
              ~ 130 TB
```

**Bandwidth:**

```
Incoming (writes): 1,160 req/s * 700 bytes ~ 0.8 MB/s
Outgoing (reads) : 116,000 req/s * 700 bytes ~ 81 MB/s
```

**Cache (80/20 rule -- 20% of URLs generate 80% of traffic):**

```
Requests per day  = 116,000 * 86,400 ~ 10 B/day
Cache 20% of daily URLs:
  0.20 * 10 B * 700 bytes ~ 1.4 TB

In practice, cache the top ~100 M hot URLs:
  100 M * 700 bytes = 70 GB  (fits in a Redis cluster easily)
```

**Short URL key space check:**

```
Base62 characters: [a-z, A-Z, 0-9] = 62 characters

Key length 6: 62^6 =  56.8 billion  (not enough for 183 B)
Key length 7: 62^7 =   3.5 trillion (plenty of room)

7-character keys give us ~3.5 trillion unique URLs.
183 B URLs uses only ~5.2% of the key space.
```

**Summary Table:**

```
+------------------------+-------------------+
| Metric                 | Value             |
+------------------------+-------------------+
| Write throughput       | ~1,200 req/s      |
| Read throughput        | ~120,000 req/s    |
| Peak read throughput   | ~240,000 req/s    |
| Total URLs (5 years)   | ~183 billion      |
| Total storage          | ~130 TB           |
| Cache size             | ~70 GB            |
| Short key length       | 7 characters      |
| Key space              | 3.5 trillion      |
+------------------------+-------------------+
```

---

## 2. API Design

### 2.1 Create Short URL

```
POST /api/v1/shorten
Authorization: Bearer <api_key>
Content-Type: application/json

Request Body:
{
  "long_url": "https://www.example.com/very/long/path?param=value",
  "custom_alias": "my-link",       // optional
  "expires_at": "2027-01-01T00:00:00Z"  // optional
}

Response 201 Created:
{
  "short_url": "https://tinyurl.com/abc1234",
  "short_key": "abc1234",
  "long_url": "https://www.example.com/very/long/path?param=value",
  "created_at": "2026-03-01T12:00:00Z",
  "expires_at": "2027-01-01T00:00:00Z"
}

Error 409 Conflict (custom alias taken):
{
  "error": "ALIAS_TAKEN",
  "message": "The custom alias 'my-link' is already in use."
}

Error 400 Bad Request:
{
  "error": "INVALID_URL",
  "message": "The provided URL is not valid."
}
```

### 2.2 Redirect

```
GET /{shortKey}
(e.g., GET /abc1234)

Response 302 Found:
Location: https://www.example.com/very/long/path?param=value

Error 404 Not Found:
{
  "error": "NOT_FOUND",
  "message": "Short URL not found or has expired."
}
```

### 2.3 Get URL Info

```
GET /api/v1/urls/{shortKey}
Authorization: Bearer <api_key>

Response 200 OK:
{
  "short_key": "abc1234",
  "short_url": "https://tinyurl.com/abc1234",
  "long_url": "https://www.example.com/very/long/path?param=value",
  "created_at": "2026-03-01T12:00:00Z",
  "expires_at": "2027-01-01T00:00:00Z",
  "click_count": 15482
}
```

### 2.4 Delete Short URL

```
DELETE /api/v1/urls/{shortKey}
Authorization: Bearer <api_key>

Response 204 No Content

Error 403 Forbidden:
{
  "error": "FORBIDDEN",
  "message": "You do not own this short URL."
}
```

### 2.5 Rate Limiting Headers

Every response includes:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 97
X-RateLimit-Reset: 1709312400
```

---

## 3. Data Model

### 3.1 SQL Schema

```sql
-- Main URL mapping table
CREATE TABLE urls (
    id              BIGINT          PRIMARY KEY AUTO_INCREMENT,
    short_key       VARCHAR(16)     NOT NULL UNIQUE,
    long_url        VARCHAR(2048)   NOT NULL,
    long_url_hash   VARCHAR(64)     NOT NULL,          -- SHA-256 of long_url for dedup
    user_id         BIGINT          DEFAULT NULL,
    created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at      TIMESTAMP       DEFAULT NULL,
    is_active       BOOLEAN         NOT NULL DEFAULT TRUE,

    INDEX idx_short_key (short_key),                   -- Primary lookup
    INDEX idx_long_url_hash (long_url_hash),           -- Deduplication
    INDEX idx_user_id (user_id),                       -- User's URLs
    INDEX idx_expires_at (expires_at)                   -- Expiration cleanup
);

-- User accounts table
CREATE TABLE users (
    id              BIGINT          PRIMARY KEY AUTO_INCREMENT,
    email           VARCHAR(255)    NOT NULL UNIQUE,
    api_key         VARCHAR(64)     NOT NULL UNIQUE,
    tier            ENUM('free', 'pro', 'enterprise') DEFAULT 'free',
    rate_limit      INT             NOT NULL DEFAULT 100,    -- requests per minute
    created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Click analytics table (append-only, high-write)
CREATE TABLE clicks (
    id              BIGINT          PRIMARY KEY AUTO_INCREMENT,
    short_key       VARCHAR(16)     NOT NULL,
    clicked_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ip_address      VARCHAR(45),
    user_agent      VARCHAR(512),
    referrer        VARCHAR(2048),
    country         VARCHAR(2),
    device_type     ENUM('desktop', 'mobile', 'tablet', 'bot'),

    INDEX idx_short_key_clicked (short_key, clicked_at)
);
```

### 3.2 Index Strategy

| Index                    | Purpose           | Lookup Pattern                                       |
| ------------------------ | ----------------- | ---------------------------------------------------- |
| `idx_short_key` (UNIQUE) | Redirect lookup   | `WHERE short_key = ?`                                |
| `idx_long_url_hash`      | Deduplication     | `WHERE long_url_hash = ?`                            |
| `idx_user_id`            | User dashboard    | `WHERE user_id = ?`                                  |
| `idx_expires_at`         | Cleanup cron      | `WHERE expires_at < NOW()`                           |
| `idx_short_key_clicked`  | Analytics per URL | `WHERE short_key = ? AND clicked_at BETWEEN ? AND ?` |

### 3.3 SQL vs NoSQL

| Factor         | SQL (MySQL/PostgreSQL)              | NoSQL (DynamoDB/Cassandra)         |
| -------------- | ----------------------------------- | ---------------------------------- |
| Schema         | Fixed schema, strong types          | Flexible schema                    |
| Reads          | Fast with proper indexes            | Fast at scale with partition keys  |
| Writes         | Good, may need sharding             | Excellent horizontal write scaling |
| Joins          | Supported natively                  | Not supported                      |
| ACID           | Full transactions                   | Eventual consistency (tunable)     |
| Scaling        | Vertical + read replicas + sharding | Horizontal out of the box          |
| Dedup          | Easy with unique constraints        | Requires conditional writes        |
| Ops complexity | Moderate                            | Lower at extreme scale             |

**Recommendation: Start with SQL (PostgreSQL), migrate hot path to NoSQL at scale.**

- The URL mapping is essentially a key-value store (short_key -> long_url), making it a
  natural fit for NoSQL at very large scale.
- However, SQL gives us strong consistency, unique constraints for deduplication, and
  simpler initial development.
- At massive scale (100B+ records), consider DynamoDB with `short_key` as the partition
  key for the redirect path, keeping PostgreSQL for user management and analytics.

---

## 4. High-Level Architecture

```
                                    +------------------+
                                    |   Monitoring     |
                                    |  (Prometheus +   |
                                    |   Grafana)       |
                                    +--------+---------+
                                             |
                                             v
+----------+     +-----------+     +-------------------+     +-------------+
|          |     |           |     |                   |     |             |
|  Client  +---->+    DNS    +---->+  Load Balancer    +---->+  App Server |
| (Browser)|     | (Route53) |     |  (Nginx / ALB)    |     |  (Cluster)  |
|          |     |           |     |                   |     |             |
+----------+     +-----------+     +-------------------+     +------+------+
                                                                    |
                                          +-------------------------+----------+
                                          |                         |          |
                                          v                         v          v
                                   +------+------+          +------+---+ +----+------+
                                   |             |          |          | |           |
                                   |    Cache    |          | Database | | Analytics |
                                   |   (Redis    |          | (Primary | | (Kafka +  |
                                   |   Cluster)  |          | + Replicas| | ClickHouse|
                                   |             |          |          | |           |
                                   +-------------+          +----------+ +-----------+
```

### Component Responsibilities

| Component               | Role                                                                            |
| ----------------------- | ------------------------------------------------------------------------------- |
| **DNS (Route53)**       | Resolves `tinyurl.com` to nearest load balancer; geo-routing                    |
| **Load Balancer**       | Distributes traffic across app servers; health checks; SSL termination          |
| **App Servers**         | Stateless services handling shorten + redirect logic; horizontally scalable     |
| **Cache (Redis)**       | Stores hot URL mappings; ~70 GB for top 100M URLs; sub-millisecond lookups      |
| **Database (Primary)**  | Source of truth for all URL mappings; handles writes                            |
| **Database (Replicas)** | Read replicas for redirect lookups on cache miss                                |
| **Analytics (Kafka)**   | Async event pipeline for click tracking; decouples analytics from redirect path |
| **Monitoring**          | Tracks latency, error rates, throughput, cache hit ratio                        |

---

## 5. Core Algorithm Deep Dive

The central challenge: given a long URL, generate a unique 7-character short key.

### Approach 1: Hash + Collision Resolution

**How it works:**

1. Compute a hash of the long URL (e.g., MD5, SHA-256).
2. Take the first 43 bits (enough for 7 Base62 characters).
3. Encode those bits as Base62.
4. If collision occurs, append an incrementing counter and rehash.

```
Long URL: "https://www.example.com/very/long/path"
    |
    v
MD5: "e4d909c290d0fb1ca068ffaddf22cbd0"
    |
    v
Take first 7 chars of Base62-encoded hash: "kF3a9Bx"
    |
    v
Check DB: does "kF3a9Bx" exist?
  - No  -> store it
  - Yes -> append counter, rehash: MD5("https://...long/path" + "1") -> new key
```

**Pseudocode:**

```python
import hashlib
import base62

def shorten_with_hash(long_url):
    for attempt in range(MAX_RETRIES):
        url_to_hash = long_url if attempt == 0 else f"{long_url}{attempt}"
        hash_hex = hashlib.md5(url_to_hash.encode()).hexdigest()
        hash_int = int(hash_hex[:11], 16)  # 44 bits
        short_key = base62_encode(hash_int)[:7]

        if not db.exists(short_key):
            db.insert(short_key, long_url)
            return short_key

    raise Exception("Failed to generate unique key after retries")
```

**Pros:** Deterministic -- same URL always produces the same hash (good for dedup).
**Cons:** Collisions require retries; retries add latency under high load.

---

### Approach 2: Base62 Conversion with Auto-Increment ID

**How it works:**

1. Insert the long URL into the database; get back an auto-increment ID.
2. Convert the numeric ID to Base62.
3. That Base62 string is the short key.

```
Long URL inserted -> DB assigns id = 123456789
    |
    v
Base62(123456789) = "8m0Kx"
    |
    v
Short URL: https://tinyurl.com/8m0Kx
```

**Base62 Encoding Implementation:**

```python
CHARSET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"

def base62_encode(num):
    if num == 0:
        return CHARSET[0]
    result = []
    while num > 0:
        result.append(CHARSET[num % 62])
        num //= 62
    return ''.join(reversed(result))

def base62_decode(s):
    num = 0
    for char in s:
        num = num * 62 + CHARSET.index(char)
    return num

# Examples:
# base62_encode(1)          -> "1"
# base62_encode(62)         -> "10"
# base62_encode(123456789)  -> "8m0Kx"
# base62_encode(3500000000000) -> "zzzzzz" (max 6-char)
```

**Pros:** Zero collisions; simple; fast.
**Cons:** Sequential IDs are guessable/enumerable; single-point-of-failure if using one
DB sequence; hard to distribute across multiple data centers.

**Mitigation for guessability:** Add random offset or use a Feistel cipher to scramble IDs.

---

### Approach 3: Pre-generated Key Service (KGS)

**How it works:**

1. A background service pre-generates millions of unique 7-char Base62 keys.
2. Keys are stored in a `key_pool` table with a `used` flag.
3. When an app server needs a key, it fetches a batch (e.g., 1000 keys) from the pool.
4. The fetched keys are marked as `used` atomically.

```
+------------+         +-----------+         +------------+
|            |  batch  |           |  fetch   |            |
|    KGS     +-------->+ Key Pool  +--------->+ App Server |
| (Generator)|  insert | (DB Table)|  1000    | (in-memory |
|            |         |           |  keys    |   buffer)  |
+------------+         +-----------+         +------------+
                                                   |
                                                   v
                                            Assign next key
                                            from local buffer
```

**Key Pool Schema:**

```sql
CREATE TABLE key_pool (
    short_key   VARCHAR(7)  PRIMARY KEY,
    is_used     BOOLEAN     NOT NULL DEFAULT FALSE,
    assigned_to VARCHAR(64) DEFAULT NULL,  -- server instance ID
    assigned_at TIMESTAMP   DEFAULT NULL
);
```

**Pros:** No collisions; no runtime computation; constant O(1) key assignment.
**Cons:** Requires a separate service; keys wasted if server crashes before using them;
adds operational complexity.

---

### Comparison Table

```
+-------------------+------------------+------------------+------------------+
| Factor            | Hash + Collision | Auto-Increment   | KGS (Pre-gen)    |
+-------------------+------------------+------------------+------------------+
| Collision risk    | Yes (retries)    | None             | None             |
| Guessable         | No               | Yes (sequential) | No               |
| Distributed       | Easy             | Hard (single seq)| Easy             |
| Dedup built-in    | Yes (same hash)  | No               | No               |
| Latency           | Variable         | Low              | Very low (O(1))  |
| Complexity        | Medium           | Low              | High             |
| Scalability       | Good             | Limited          | Excellent        |
| Fault tolerance   | Good             | DB dependency    | Good (buffer)    |
+-------------------+------------------+------------------+------------------+
```

**Recommended approach for production:** **KGS (Approach 3)** for the write path, combined
with **deduplication via long_url_hash** to avoid creating multiple short URLs for the
same long URL.

---

## 6. Detailed Design

### 6.1 URL Shortening Flow

```
Client                App Server              Cache           Database          KGS
  |                       |                     |                |               |
  |  POST /api/v1/shorten |                     |                |               |
  |---------------------> |                     |                |               |
  |                       |                     |                |               |
  |                       | Validate long_url   |                |               |
  |                       |--+                  |                |               |
  |                       |  | (format, length, |                |               |
  |                       |  |  blocklist check)|                |               |
  |                       |<-+                  |                |               |
  |                       |                     |                |               |
  |                       | Check dedup: lookup by long_url_hash |               |
  |                       |------------------------------------>|               |
  |                       |                     |                |               |
  |                       |  (If exists, return existing short_key)              |
  |                       |<------------------------------------|               |
  |                       |                     |                |               |
  |                       | If new: get next key from local buffer               |
  |                       |--+                  |                |               |
  |                       |  | (if buffer empty)|                |               |
  |                       |  |  fetch batch ----|----------------|------>|       |
  |                       |  |  <---------------|----------------|-------|       |
  |                       |<-+                  |                |               |
  |                       |                     |                |               |
  |                       | INSERT into urls    |                |               |
  |                       |------------------------------------>|               |
  |                       |                     |                |               |
  |                       | Write to cache      |                |               |
  |                       |-------------------->|                |               |
  |                       |                     |                |               |
  |  201 Created          |                     |                |               |
  |<--------------------- |                     |                |               |
```

**Step-by-step:**

1. **Validate input** -- Check URL format, length (max 2048), and against blocklist
   (malware, phishing).
2. **Deduplication check** -- Hash the long URL with SHA-256, query DB for existing mapping.
   If found, return the existing short URL instead of creating a new one.
3. **Acquire a short key** -- Pop the next key from the app server's in-memory buffer
   (pre-fetched from KGS). If the buffer is low, asynchronously request a new batch.
4. **Store the mapping** -- Insert `(short_key, long_url, long_url_hash, user_id, timestamps)`
   into the database.
5. **Populate cache** -- Write the mapping to Redis so subsequent redirects are fast.
6. **Return response** -- Send the full short URL back to the client.

---

### 6.2 URL Redirect Flow

```
Client                App Server              Cache           Database
  |                       |                     |                |
  |  GET /abc1234         |                     |                |
  |---------------------> |                     |                |
  |                       |                     |                |
  |                       | Lookup in cache     |                |
  |                       |-------------------->|                |
  |                       |                     |                |
  |                       |    (cache hit?)     |                |
  |                       |<--------------------|                |
  |                       |                     |                |
  |                       | If miss: query DB   |                |
  |                       |------------------------------------>|
  |                       |                     |                |
  |                       |   long_url          |                |
  |                       |<------------------------------------|
  |                       |                     |                |
  |                       | Populate cache      |                |
  |                       |-------------------->|                |
  |                       |                     |                |
  |                       | Emit click event to Kafka (async)   |
  |                       |--+                  |                |
  |                       |  |                  |                |
  |  302 Found            |<-+                  |                |
  |  Location: long_url   |                     |                |
  |<--------------------- |                     |                |
```

**Step-by-step:**

1. **Cache lookup** -- Check Redis for `short_key -> long_url`. Expected cache hit rate: 80-90%.
2. **Database fallback** -- On cache miss, query the database. Check `is_active = TRUE`
   and `(expires_at IS NULL OR expires_at > NOW())`.
3. **Populate cache** -- Write the result back to Redis with a TTL matching the URL's expiration.
4. **Async analytics** -- Publish a click event to Kafka (non-blocking). The event includes
   short_key, timestamp, IP, user-agent, and referrer.
5. **Redirect** -- Return an HTTP redirect to the long URL.

### 6.3 301 vs 302 Redirect

```
+--------+---------------------------+------------------------------+
| Code   | 301 Moved Permanently     | 302 Found (Temporary)        |
+--------+---------------------------+------------------------------+
| Cache  | Browser caches redirect   | Browser does NOT cache       |
|        | (fewer server hits)       | (every click hits server)    |
+--------+---------------------------+------------------------------+
| SEO    | Passes link juice to      | Link juice stays with        |
|        | destination URL           | short URL                    |
+--------+---------------------------+------------------------------+
| Analytics | Lose visibility --     | Full visibility -- every     |
|        | cached redirects bypass   | redirect goes through server |
|        | the server                |                              |
+--------+---------------------------+------------------------------+
| Use    | Permanent short links     | When analytics matter        |
| Case   | where analytics are not   | (bit.ly, marketing links)    |
|        | critical                  |                              |
+--------+---------------------------+------------------------------+
```

**Recommendation:** Use **302** by default (most URL shorteners need analytics).
Offer 301 as an option for users who prefer maximum performance and SEO pass-through.

---

### 6.4 Cache Strategy

**Pattern: Cache-Aside (Lazy Loading)**

```
Read path:
  1. Check cache
  2. If HIT -> return cached value
  3. If MISS -> query DB -> write to cache -> return

Write path:
  1. Write to DB
  2. Write to cache (write-through)
```

**Cache Configuration:**

```
Cache Engine     : Redis Cluster (6+ nodes)
Max Memory       : 70 GB (top 100M URLs)
Eviction Policy  : allkeys-lfu (Least Frequently Used)
Default TTL      : 24 hours (refreshed on access)
Serialization    : MessagePack (smaller than JSON)

Key format       : url:{short_key}
Value format     : {long_url, expires_at, is_active}
```

**Why LFU over LRU?**
URL shorteners have a power-law distribution: a small number of URLs receive the vast
majority of clicks. LFU keeps the most popular URLs in cache, while LRU would evict them
if a burst of unique URLs temporarily fills the cache.

**Cache Warming:**
On server startup, pre-load the top 10,000 URLs by click count into the local cache
to avoid a cold-start thundering herd.

---

### 6.5 Rate Limiting

**Strategy: Token Bucket per API Key**

```
+------------------+-------------------+
| Tier             | Rate Limit        |
+------------------+-------------------+
| Free             | 100 req/min       |
| Pro              | 1,000 req/min     |
| Enterprise       | 10,000 req/min    |
| Redirect (no key)| 1,000 req/min/IP  |
+------------------+-------------------+
```

**Implementation with Redis:**

```python
def is_rate_limited(api_key, limit, window_seconds=60):
    key = f"rate:{api_key}"
    current = redis.incr(key)
    if current == 1:
        redis.expire(key, window_seconds)
    return current > limit
```

Rate limiting is applied at the load balancer level for redirects (per IP)
and at the application level for API calls (per API key).

---

## 7. Scaling

### 7.1 Database Sharding

At 183 billion records, a single database cannot handle the load. We shard the `urls`
table across multiple database instances.

**Sharding Strategy: Consistent Hashing on short_key**

```
short_key = "abc1234"
shard_id  = hash("abc1234") % NUM_SHARDS

Example with 256 shards:
  hash("abc1234") = 0x7A3F...
  0x7A3F % 256 = 63
  -> Route to shard-63
```

**Why hash-based over range-based?**

- Hash-based distributes data uniformly (no hot shards from alphabetical clustering).
- The short_key is the primary lookup key for redirects, making it the ideal shard key.

```
                        +-------------------+
                        |  Shard Router     |
                        |  (hash % N)      |
                        +---+---+---+---+---+
                            |   |   |   |
              +-------------+   |   |   +-------------+
              |                 |   |                 |
         +----+----+      +----+----+           +----+----+
         | Shard 0 |      | Shard 1 |    ...    | Shard N |
         | Primary |      | Primary |           | Primary |
         +----+----+      +----+----+           +----+----+
              |                 |                     |
         +----+----+      +----+----+           +----+----+
         | Replica |      | Replica |           | Replica |
         +---------+      +---------+           +---------+
```

**Shard Count Planning:**

```
Total data: 130 TB
Target per shard: ~500 GB (manageable, fast backups)
Shards needed: 130 TB / 500 GB = 260 shards
Round to: 256 (power of 2, simpler modulo)
```

---

### 7.2 Read Replicas

Each shard has 2-3 read replicas:

```
Write path:  App Server -> Shard Primary (synchronous)
Read path:   App Server -> Shard Replica (from any replica)
```

- **Replication lag:** Typically < 100ms with semi-synchronous replication.
- **Stale reads:** Acceptable for redirects (a URL created 100ms ago is rarely accessed
  immediately). For creation confirmation, read from primary.

---

### 7.3 Cache Layer Scaling

```
Redis Cluster Topology:

  +----------+  +----------+  +----------+
  | Master 1 |  | Master 2 |  | Master 3 |
  | 0-5460   |  | 5461-10922| |10923-16383|  (hash slots)
  +----+-----+  +----+-----+  +----+-----+
       |              |              |
  +----+-----+  +----+-----+  +----+-----+
  | Replica 1|  | Replica 2|  | Replica 3|
  +----------+  +----------+  +----------+

Total: 6 nodes, ~70 GB distributed across 3 masters
Each master: ~23 GB
```

**Redis Cluster** uses 16384 hash slots distributed across master nodes. Adding more masters
is seamless -- Redis rebalances slots automatically.

---

### 7.4 Analytics Pipeline

Click tracking must not add latency to the redirect path.

```
App Server                Kafka               Consumer           ClickHouse
    |                       |                     |                  |
    | Publish click event   |                     |                  |
    | (fire-and-forget)     |                     |                  |
    |---------------------->|                     |                  |
    |                       |  Consume batch      |                  |
    |                       |-------------------->|                  |
    |                       |                     | Batch insert     |
    |                       |                     |----------------->|
    |                       |                     |                  |
    |                       |                     | (every 5 sec or  |
    |                       |                     |  1000 events)    |
```

**Pipeline Details:**

| Component  | Purpose         | Config                                       |
| ---------- | --------------- | -------------------------------------------- |
| Kafka      | Event buffer    | 3 brokers, 12 partitions, 7-day retention    |
| Consumer   | Batch processor | 3 consumers in a group, batch size 1000      |
| ClickHouse | Analytics DB    | Columnar storage, optimized for aggregations |

**Click Event Schema (Kafka message):**

```json
{
  "short_key": "abc1234",
  "timestamp": "2026-03-01T12:34:56Z",
  "ip": "203.0.113.42",
  "user_agent": "Mozilla/5.0...",
  "referrer": "https://twitter.com/...",
  "country": "US",
  "device": "mobile"
}
```

**Why ClickHouse for analytics?**

- Columnar storage compresses click data 10-20x.
- Aggregation queries (clicks per day, top countries) run in milliseconds over billions of rows.
- Handles 100K+ inserts/sec easily.

---

## 8. Deployment Architecture

### 8.1 Multi-Region Deployment

```
                           +------------------+
                           |   Global DNS     |
                           |   (Route53 /     |
                           |    Cloudflare)   |
                           +--------+---------+
                                    |
                          +---------+---------+
                          |                   |
                   +------+------+     +------+------+
                   |  CDN Edge   |     |  CDN Edge   |
                   | (US-East)   |     | (EU-West)   |
                   +------+------+     +------+------+
                          |                   |
              +-----------+-----------+       |
              |                       |       |
      +-------+--------+   +---------+-------+--------+
      |  US-East-1     |   |  EU-West-1               |
      |  Data Center   |   |  Data Center              |
      |                |   |                           |
      | +------------+ |   | +------------+            |
      | | LB (ALB)   | |   | | LB (ALB)   |           |
      | +-----+------+ |   | +-----+------+           |
      |       |         |   |       |                  |
      | +-----+------+ |   | +-----+------+           |
      | | App Servers | |   | | App Servers |          |
      | | (ECS/K8s)  | |   | | (ECS/K8s)  |          |
      | | 10 instances| |   | | 10 instances|          |
      | +-----+------+ |   | +-----+------+           |
      |       |         |   |       |                  |
      | +-----+------+ |   | +-----+------+           |
      | | Redis      | |   | | Redis      |           |
      | | Cluster    | |   | | Cluster    |           |
      | +-----+------+ |   | +-----+------+           |
      |       |         |   |       |                  |
      | +-----+------+ |   | +-----+------+           |
      | | DB Primary | |   | | DB Replica |           |
      | | + Replicas | |   | | (read-only)|           |
      | +------------+ |   | +------------+           |
      +----------------+   +--------------------------+
              |                        |
              +----------+-------------+
                         |
                  +------+------+
                  | Cross-Region|
                  | Replication |
                  +-------------+
```

### 8.2 Deployment Strategy

| Layer         | Technology                         | Scaling                                        |
| ------------- | ---------------------------------- | ---------------------------------------------- |
| DNS           | Route53 with latency-based routing | Automatic                                      |
| CDN           | CloudFront / Cloudflare            | Edge caching for 301 redirects                 |
| Load Balancer | AWS ALB                            | Auto-scaling target groups                     |
| App Servers   | ECS Fargate or Kubernetes          | HPA: scale on CPU > 60% or RPS > 5000/instance |
| Cache         | ElastiCache Redis Cluster          | Add shards for capacity                        |
| Database      | Aurora PostgreSQL (Multi-AZ)       | Read replicas per region                       |
| Analytics     | MSK (Kafka) + ClickHouse           | Partition-based scaling                        |

### 8.3 Write Routing in Multi-Region

**All writes go to the primary region (US-East-1).** Other regions are read-only replicas.

```
User in EU creates short URL:
  EU App Server -> Cross-region call to US-East DB Primary -> Write
  Replication lag to EU Replica: ~50-100ms

User in EU clicks short URL:
  EU App Server -> EU Redis Cache (or EU DB Replica) -> Redirect
  Latency: ~10-20ms
```

For true multi-region writes, use conflict-free replicated data types (CRDTs) or
a distributed database like CockroachDB. But this adds significant complexity and is
rarely needed for a URL shortener since write latency is less critical than redirect latency.

---

## 9. Trade-offs & Alternatives

### 9.1 Consistency vs Availability (CAP Theorem)

```
+---------------------+-----------------------------------+
| Choice              | Implication                       |
+---------------------+-----------------------------------+
| Strong consistency  | Every read sees the latest write. |
| (CP)                | May reject requests during        |
|                     | network partitions.               |
+---------------------+-----------------------------------+
| High availability   | Always accepts reads/writes.      |
| (AP)                | May serve stale data briefly      |
|                     | after a write.                    |
+---------------------+-----------------------------------+
```

**Our choice: AP (Availability + Partition Tolerance)**

Rationale:

- A redirect serving a slightly stale mapping is acceptable (URLs rarely change).
- A 404 for a URL created 100ms ago is tolerable vs. the system being unavailable.
- Eventual consistency (replication lag < 200ms) is fine for this use case.
- Availability is critical: a URL shortener that is down breaks every link ever created.

---

### 9.2 SQL vs NoSQL Decision Matrix

```
+------------------+----------------------------------+----------------------------------+
| Criterion        | SQL (PostgreSQL)                 | NoSQL (DynamoDB)                 |
+------------------+----------------------------------+----------------------------------+
| Data model       | Relational (URLs, users, clicks) | Key-value (short_key -> long_url)|
| Consistency      | Strong (ACID)                    | Eventual (tunable)               |
| Write scale      | Vertical + sharding              | Horizontal (unlimited)           |
| Read scale       | Replicas (good)                  | Replicas (excellent)             |
| Deduplication    | UNIQUE constraint                | Conditional writes (complex)     |
| Schema changes   | Migrations required              | Schemaless (flexible)            |
| Cost at scale    | Higher (managed instances)       | Lower (pay-per-request)          |
| Operational      | Moderate (backups, replication)  | Low (fully managed)              |
+------------------+----------------------------------+----------------------------------+
```

**Hybrid approach recommended:**

- **PostgreSQL** for the write path (creation, dedup, user management).
- **DynamoDB / Redis** for the read path (redirects). Cache the entire hot dataset.
- **ClickHouse** for analytics.

---

### 9.3 Hash vs Counter vs KGS

| Scenario                    | Best Approach              | Why                                    |
| --------------------------- | -------------------------- | -------------------------------------- |
| Single-region, simple       | Auto-increment + Base62    | Simplest, no extra service             |
| Multi-region, high scale    | KGS (Pre-generated)        | No coordination needed between regions |
| Dedup is critical           | Hash-based                 | Same URL always produces same key      |
| Non-guessable keys required | KGS with random generation | Keys have no pattern                   |
| Low operational overhead    | Hash-based                 | No background service to maintain      |

---

## 10. Common Interview Follow-ups

### 10.1 How to Handle Hot URLs?

A viral tweet linking to a short URL could generate millions of redirects per second
to a single key.

**Solutions:**

1. **Local in-memory cache on each app server** -- Cache the top 1000 URLs locally
   (HashMap with TTL). This eliminates Redis network round-trips for the hottest URLs.

2. **Redis read replicas** -- For a single hot key, Redis can serve ~100K reads/sec
   per replica. With 5 replicas reading from the hot key, that is 500K reads/sec.

3. **CDN caching** -- If using 301 redirects, CDN edge nodes cache the redirect.
   A hot URL would be served entirely from CDN without hitting the origin.

4. **Consistent hashing with virtual nodes** -- Spread hot keys across multiple
   cache nodes using virtual nodes, preventing any single node from being overwhelmed.

```
Hot URL mitigation stack:

  Client -> CDN (if 301) -> Local App Cache -> Redis Replica -> DB Replica
            ~1ms            ~0.1ms             ~1ms             ~5ms

  Each layer absorbs a significant portion of traffic.
  With all layers: can handle millions of RPS for a single URL.
```

---

### 10.2 How to Implement Analytics?

**Real-time analytics pipeline:**

```
Click event -> Kafka topic "clicks"
                    |
            +-------+-------+
            |               |
     Stream processor    Batch processor
     (Flink / Kafka     (Spark, hourly)
      Streams)                |
            |                 v
            v           Data warehouse
     Real-time           (aggregated)
     dashboard
     (last 5 min)
```

**Analytics data model in ClickHouse:**

```sql
CREATE TABLE click_events (
    short_key     String,
    clicked_at    DateTime,
    country       LowCardinality(String),
    device_type   LowCardinality(String),
    referrer      String,
    browser       LowCardinality(String)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(clicked_at)
ORDER BY (short_key, clicked_at);

-- Materialized view for real-time aggregation
CREATE MATERIALIZED VIEW clicks_per_day
ENGINE = SummingMergeTree()
ORDER BY (short_key, day)
AS SELECT
    short_key,
    toDate(clicked_at) AS day,
    count() AS clicks,
    uniqHLL12(country) AS unique_countries
FROM click_events
GROUP BY short_key, day;
```

**Dashboard queries:**

```sql
-- Clicks per day for a URL
SELECT day, clicks FROM clicks_per_day
WHERE short_key = 'abc1234'
ORDER BY day;

-- Top 10 URLs in the last hour
SELECT short_key, count() as clicks
FROM click_events
WHERE clicked_at > now() - INTERVAL 1 HOUR
GROUP BY short_key
ORDER BY clicks DESC
LIMIT 10;
```

---

### 10.3 How to Handle URL Expiration?

**Two-pronged approach:**

1. **Lazy expiration (on read):**
   When a redirect request comes in, check `expires_at`. If expired, return 404
   and optionally delete from cache.

   ```python
   def redirect(short_key):
       url = cache.get(short_key) or db.get(short_key)
       if url is None:
           return 404
       if url.expires_at and url.expires_at < now():
           cache.delete(short_key)
           return 404  # "This link has expired"
       return redirect_302(url.long_url)
   ```

2. **Active cleanup (background job):**
   A cron job runs every hour to hard-delete expired URLs and free up key space.

   ```sql
   -- Run every hour
   DELETE FROM urls
   WHERE expires_at IS NOT NULL
     AND expires_at < NOW() - INTERVAL 1 DAY  -- grace period
   LIMIT 10000;  -- batch to avoid long locks
   ```

   Deleted short keys can be returned to the KGS key pool for reuse.

**Cache TTL alignment:**
When caching a URL with an expiration, set the Redis TTL to match:

```python
ttl = max(1, int((url.expires_at - now()).total_seconds()))
redis.setex(f"url:{short_key}", ttl, url.long_url)
```

---

### 10.4 How to Prevent Abuse?

**Multiple defense layers:**

```
+-------------------+----------------------------------------------+
| Layer             | Protection                                   |
+-------------------+----------------------------------------------+
| Rate Limiting     | Token bucket per API key and per IP          |
| URL Validation    | Reject malformed URLs, check against         |
|                   | blocklists (Google Safe Browsing API)         |
| CAPTCHA           | Require CAPTCHA after N anonymous creates     |
| Spam Detection    | ML model scoring URL patterns                |
| Abuse Reporting   | Allow users to report malicious short URLs   |
| Account Bans      | Disable API keys of abusive accounts         |
| Link Preview      | Show destination URL before redirecting      |
| Content Scanning  | Periodic crawl of destinations for malware   |
+-------------------+----------------------------------------------+
```

**Implementation of Safe Browsing check:**

```python
def is_url_safe(long_url):
    # Check against Google Safe Browsing API
    response = safe_browsing_client.lookup(long_url)
    if response.is_threat:
        raise ValueError(f"URL flagged as {response.threat_type}")

    # Check against internal blocklist
    domain = extract_domain(long_url)
    if domain in BLOCKED_DOMAINS:
        raise ValueError("Domain is blocked")

    return True
```

**Monitoring for abuse:**

```sql
-- Detect accounts creating URLs at abnormal rates
SELECT user_id, COUNT(*) as url_count
FROM urls
WHERE created_at > NOW() - INTERVAL 1 HOUR
GROUP BY user_id
HAVING url_count > 1000
ORDER BY url_count DESC;

-- Detect URLs with abnormally high click rates (potential phishing)
SELECT short_key, COUNT(*) as clicks
FROM click_events
WHERE clicked_at > NOW() - INTERVAL 10 MINUTE
GROUP BY short_key
HAVING clicks > 10000
ORDER BY clicks DESC;
```

---

## Appendix A: Full System Summary

```
+-------------------------------------------------------------------+
|                     URL SHORTENER ARCHITECTURE                     |
+-------------------------------------------------------------------+
|                                                                   |
|  WRITE PATH (1,200 req/s)                                        |
|  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~                                     |
|  Client -> LB -> App Server -> Validate URL                      |
|                             -> Check dedup (SHA-256 hash)         |
|                             -> Get key from KGS buffer            |
|                             -> INSERT into DB (sharded)           |
|                             -> SET in Redis cache                 |
|                             <- Return short URL                   |
|                                                                   |
|  READ PATH (120,000 req/s)                                       |
|  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~                                     |
|  Client -> CDN (301 only) -> LB -> App Server                    |
|                                  -> GET from Redis (80-90% hit)   |
|                                  -> GET from DB replica (fallback)|
|                                  -> Publish click to Kafka        |
|                                  <- 302 Redirect                  |
|                                                                   |
|  ANALYTICS PATH (async)                                           |
|  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~                                     |
|  Kafka -> Consumer -> Batch INSERT into ClickHouse                |
|                    -> Real-time aggregation (materialized views)   |
|                                                                   |
|  CLEANUP (periodic)                                               |
|  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~                                     |
|  Cron -> DELETE expired URLs -> Return keys to KGS pool           |
|                                                                   |
+-------------------------------------------------------------------+
```

## Appendix B: Key Metrics to Monitor

```
+---------------------------+------------------+------------------+
| Metric                    | Alert Threshold  | Dashboard        |
+---------------------------+------------------+------------------+
| Redirect p99 latency     | > 100ms          | Real-time graph  |
| Cache hit ratio           | < 80%            | Gauge            |
| DB write latency          | > 50ms           | Real-time graph  |
| KGS key pool remaining    | < 100K keys      | Gauge + alert    |
| Error rate (5xx)          | > 0.1%           | Counter          |
| Kafka consumer lag        | > 100K events    | Gauge + alert    |
| Disk usage per shard      | > 80%            | Gauge + alert    |
| Rate limit rejections     | > 1000/min       | Counter          |
| Expired URL cleanup rate  | N/A              | Counter          |
| URLs created per minute   | > 2x baseline    | Graph + anomaly  |
+---------------------------+------------------+------------------+
```

## Appendix C: Interview Time Management

For a 45-minute system design interview, allocate time as follows:

```
+---------------------------+----------+
| Section                   | Minutes  |
+---------------------------+----------+
| Requirements & estimation | 5-7      |
| API design                | 3-5      |
| Data model                | 3-5      |
| High-level architecture   | 5-7      |
| Core algorithm deep dive  | 8-10     |
| Detailed design           | 5-7      |
| Scaling & deployment      | 5-7      |
| Follow-up questions       | 5-7      |
+---------------------------+----------+
| Total                     | ~45 min  |
+---------------------------+----------+
```

**Tips:**

- Start with requirements; do NOT jump to solutions.
- Draw the high-level diagram early; interviewers love visual thinkers.
- Mention trade-offs proactively (301 vs 302, SQL vs NoSQL, hash vs counter).
- Use concrete numbers from your capacity estimation throughout the discussion.
- If the interviewer asks about a specific area, go deep rather than broad.
- End with monitoring and operational concerns to show production maturity.
