# Design a Content Delivery Network (Cloudflare / CloudFront)

## 1. Requirements Clarification

### Functional Requirements

| #   | Requirement          | Description                                                                       |
| --- | -------------------- | --------------------------------------------------------------------------------- |
| 1   | Content Delivery     | Serve static assets (images, JS, CSS, video) from edge locations close to users   |
| 2   | Origin Fetching      | Pull content from origin on cache miss; push content proactively for known assets |
| 3   | Cache Management     | Store, serve, and expire cached content at edge nodes                             |
| 4   | Cache Invalidation   | Support TTL expiry, manual purge by URL/tag, and stale-while-revalidate           |
| 5   | DNS-based Routing    | Route clients to the nearest/fastest edge POP via GeoDNS or anycast               |
| 6   | TLS Termination      | Terminate HTTPS at the edge with managed certificates                             |
| 7   | Edge Compute         | Execute lightweight logic (A/B testing, auth, rewrites) at edge nodes             |
| 8   | Analytics            | Provide per-POP metrics: cache hit ratio, bandwidth, error rates, latency         |
| 9   | Multi-origin Support | Route different URL paths to different origin servers                             |
| 10  | DDoS / WAF           | Rate limiting, bot detection, and web application firewall at edge                |

### Non-Functional Requirements

| #   | Requirement       | Target                                                      |
| --- | ----------------- | ----------------------------------------------------------- |
| 1   | Latency           | < 50ms to nearest edge for 99th percentile (globally)       |
| 2   | Cache Hit Ratio   | > 95% for static content                                    |
| 3   | Availability      | 99.999% (< 5 min downtime/year)                             |
| 4   | Throughput        | Millions of requests/second globally across all POPs        |
| 5   | Purge Propagation | < 5 seconds globally after purge request                    |
| 6   | Durability        | Cached content available until TTL expiry or explicit purge |
| 7   | Scalability       | Auto-scale per-POP capacity horizontally                    |
| 8   | Security          | TLS 1.3, OCSP stapling, HSTS, certificate auto-renewal      |
| 9   | Consistency       | Eventual consistency for cache invalidation across POPs     |
| 10  | Observability     | Real-time metrics, per-request logs, distributed tracing    |

### Scale Estimation

```
Traffic:
  - 10 billion requests/day globally
  - 10B / 86,400s = ~115,000 requests/second average
  - Peak: 5x average = ~575,000 requests/second

Cache Hit Ratio: 95%
  - Cache hits:  10B * 0.95  = 9.5B requests served from edge
  - Origin hits: 10B * 0.05  = 500M requests forwarded to origin

Bandwidth:
  - Average response size: 200 KB
  - Total data served: 10B * 200 KB = 2,000 TB/day = ~2 EB/day (egress)
  - Origin fetches: 500M * 200 KB = 100 TB/day (origin egress)
  - CDN saves origin: 95% of bandwidth = 1,900 TB/day

Storage (Edge Cache):
  - Unique cacheable objects: ~100M
  - Average object size: 200 KB
  - Total: 100M * 200 KB = 20 TB
  - Distributed across ~300 POPs: ~67 GB hot cache per POP (L1 SSD)

POPs (Points of Presence):
  - ~300 global POPs (similar to Cloudflare)
  - Each POP: 50-500 servers depending on traffic region

Purge Propagation:
  - 300 POPs must receive purge signal in < 5 seconds
  - Gossip or fan-out pub/sub message to all POPs
```

---

## 2. API Design

### 2.1 Content Management API

```
# Upload / Register content (Push CDN model)
POST /v1/cdn/content
Body: {
  "url": "https://cdn.example.com/assets/logo.png",
  "ttl": 86400,
  "cache_control": "public, max-age=86400",
  "tags": ["assets", "images"],
  "origin_url": "https://origin.example.com/assets/logo.png"
}
Response: {
  "cdn_url": "https://cdn.example.com/assets/logo.png",
  "edge_locations": ["us-east", "eu-west", "ap-south"],
  "cached_until": "2026-03-02T00:00:00Z"
}

# Get content metadata
GET /v1/cdn/content?url=https://cdn.example.com/assets/logo.png
Response: {
  "url": "...",
  "ttl": 86400,
  "cache_status": "HIT",
  "edge_hits": 4200000,
  "origin_hits": 210000,
  "last_fetched": "2026-03-01T10:00:00Z",
  "tags": ["assets", "images"]
}
```

### 2.2 Cache Purge / Invalidation API

```
# Purge single URL
DELETE /v1/cdn/cache
Body: {
  "urls": ["https://cdn.example.com/assets/logo.png"]
}
Response: {
  "purge_id": "purge-uuid-1234",
  "estimated_propagation_ms": 3000,
  "affected_pops": 297
}

# Purge by tag
DELETE /v1/cdn/cache/tags
Body: {
  "tags": ["images", "assets"]
}
Response: {
  "purge_id": "purge-uuid-5678",
  "estimated_objects_purged": 450000,
  "estimated_propagation_ms": 4500
}

# Purge by prefix
DELETE /v1/cdn/cache/prefix
Body: {
  "prefix": "https://cdn.example.com/assets/"
}

# Check purge status
GET /v1/cdn/purge/{purge_id}
Response: {
  "purge_id": "purge-uuid-1234",
  "status": "completed",           // pending | in_progress | completed
  "pops_confirmed": 297,
  "pops_pending": 3,
  "started_at": "2026-03-01T12:00:00Z",
  "completed_at": "2026-03-01T12:00:04Z"
}
```

### 2.3 Analytics API

```
# Real-time metrics per POP
GET /v1/cdn/analytics/realtime?pop=us-east-1&window=60s
Response: {
  "pop": "us-east-1",
  "requests_per_second": 12400,
  "cache_hit_ratio": 0.967,
  "bandwidth_gbps": 42.3,
  "error_rate": 0.0012,
  "latency_p50_ms": 8,
  "latency_p99_ms": 45
}

# Historical metrics (time series)
GET /v1/cdn/analytics/timeseries
Query: ?metric=cache_hit_ratio&granularity=1h&from=2026-03-01&to=2026-03-02&pop=all
Response: {
  "metric": "cache_hit_ratio",
  "data_points": [
    { "timestamp": "2026-03-01T00:00:00Z", "value": 0.952 },
    { "timestamp": "2026-03-01T01:00:00Z", "value": 0.961 },
    ...
  ]
}

# Top cached URLs
GET /v1/cdn/analytics/top-urls?limit=100&sort=requests
Response: {
  "urls": [
    { "url": "https://cdn.example.com/assets/main.js", "requests": 8400000, "cache_hit_ratio": 0.99 },
    ...
  ]
}
```

---

## 3. Data Model

### 3.1 Content Metadata

```sql
-- Stored in origin / control plane database
TABLE content_objects (
  id             UUID          PRIMARY KEY,
  cdn_url        VARCHAR(2048) NOT NULL UNIQUE,
  origin_url     VARCHAR(2048) NOT NULL,
  content_type   VARCHAR(256),
  ttl_seconds    INT           DEFAULT 86400,
  cache_control  VARCHAR(512),
  vary_headers   VARCHAR(512),          -- e.g. "Accept-Encoding, Accept"
  tags           TEXT[],                -- for tag-based purge
  size_bytes     BIGINT,
  etag           VARCHAR(256),
  last_modified  TIMESTAMP,
  created_at     TIMESTAMP     DEFAULT NOW(),
  updated_at     TIMESTAMP     DEFAULT NOW()
);

-- Per-edge cache state (stored at edge, eventually consistent)
TABLE edge_cache_entries (
  cache_key      VARCHAR(4096) PRIMARY KEY,  -- composed key
  cdn_url        VARCHAR(2048),
  pop_id         VARCHAR(64),
  cached_at      TIMESTAMP,
  expires_at     TIMESTAMP,
  hit_count      BIGINT DEFAULT 0,
  size_bytes     BIGINT,
  etag           VARCHAR(256),
  stale          BOOLEAN DEFAULT FALSE,
  purge_version  BIGINT DEFAULT 0           -- compare against global purge counter
);
```

### 3.2 Edge Location Config

```sql
TABLE edge_pops (
  pop_id         VARCHAR(64)   PRIMARY KEY,  -- e.g. "us-east-1-iad"
  region         VARCHAR(64),                -- e.g. "us-east"
  city           VARCHAR(128),
  country        VARCHAR(64),
  latitude       DECIMAL(9,6),
  longitude      DECIMAL(9,6),
  anycast_prefix VARCHAR(64),               -- BGP anycast IP block
  capacity_gbps  INT,
  is_active      BOOLEAN DEFAULT TRUE,
  tier           ENUM('L1_EDGE', 'L2_REGIONAL', 'ORIGIN_SHIELD'),
  parent_pop_id  VARCHAR(64) REFERENCES edge_pops(pop_id)
);

TABLE pop_server_pool (
  server_id      UUID          PRIMARY KEY,
  pop_id         VARCHAR(64)   REFERENCES edge_pops(pop_id),
  ip_address     INET,
  capacity_rps   INT,
  cache_size_gb  INT,
  is_healthy     BOOLEAN DEFAULT TRUE,
  last_heartbeat TIMESTAMP
);
```

### 3.3 Routing Rules

```sql
TABLE routing_rules (
  id             UUID          PRIMARY KEY,
  customer_id    UUID,
  priority       INT,
  match_host     VARCHAR(256),
  match_path     VARCHAR(1024),            -- prefix or regex
  match_method   VARCHAR(64) DEFAULT '*',
  action         ENUM('cache', 'pass_through', 'redirect', 'edge_function'),
  ttl_override   INT,
  origin_id      UUID REFERENCES origins(id),
  edge_function  VARCHAR(256),
  cache_key_rules JSONB,                  -- which headers/cookies/params to include
  created_at     TIMESTAMP DEFAULT NOW()
);

TABLE origins (
  id             UUID          PRIMARY KEY,
  customer_id    UUID,
  name           VARCHAR(256),
  url            VARCHAR(2048),
  health_check_path VARCHAR(512) DEFAULT '/',
  timeout_ms     INT DEFAULT 30000,
  retry_attempts INT DEFAULT 2,
  is_healthy     BOOLEAN DEFAULT TRUE
);
```

---

## 4. High-Level Architecture

### 4.1 Overall CDN Architecture

```
+------------------+     DNS Query      +------------------------+
|                  | -----------------> |  Authoritative DNS     |
|   End Client     |                    |  (GeoDNS / Anycast)    |
|  (Browser/App)   | <----------------- |                        |
+------------------+  IP of nearest POP +------------------------+
         |
         | HTTPS Request
         v
+----------------------------------+
|        Edge POP (L1)             |
|  +----------------------------+  |
|  |   TLS Termination          |  |
|  |   HTTP/2 or HTTP/3 (QUIC)  |  |
|  +----------------------------+  |
|  |   WAF / DDoS Filter        |  |
|  +----------------------------+  |
|  |   Edge Compute (Workers)   |  |
|  +----------------------------+  |
|  |   L1 Cache (SSD, hot)      |  |  Cache HIT -> Return response
|  |   ~67 GB per POP           |  |
|  +----------------------------+  |
+----------------------------------+
         |  Cache MISS
         v
+----------------------------------+
|     Regional POP (L2)            |
|  +----------------------------+  |
|  |   L2 Cache (SSD, warm)     |  |  Cache HIT -> Return + populate L1
|  |   ~500 GB per region       |  |
|  +----------------------------+  |
+----------------------------------+
         |  Cache MISS
         v
+----------------------------------+
|       Origin Shield              |
|  +----------------------------+  |
|  |   Large Cache (HDD/SSD)    |  |  Cache HIT -> Return + populate L2
|  |   ~5 TB per shield node    |  |
|  +----------------------------+  |
+----------------------------------+
         |  Cache MISS
         v
+----------------------------------+
|          Origin Server           |
|  (Customer's Web Server / S3)    |
+----------------------------------+
```

### 4.2 Control Plane Architecture

```
+------------------+      API Calls      +------------------------+
|  Customer Portal |  ----------------> |   CDN Control Plane    |
|  (Dashboard/CLI) |                    |   (REST API Gateway)   |
+------------------+                    +------------------------+
                                                   |
                    +------------------------------+------------------------------+
                    |                              |                             |
                    v                              v                             v
         +-------------------+        +-------------------+        +-------------------+
         |  Config Service   |        |  Purge Service    |        |  Analytics Service|
         |  (routing rules,  |        |  (invalidation,   |        |  (metrics, logs,  |
         |   cache policies) |        |   propagation)    |        |   dashboards)     |
         +-------------------+        +-------------------+        +-------------------+
                    |                              |                             |
                    v                              v                             v
         +-------------------+        +-------------------+        +-------------------+
         |  Config Store     |        |  Message Broker   |        |  Time Series DB   |
         |  (distributed KV) |        |  (Kafka / NATS)   |        |  (ClickHouse /    |
         |                   |        |                   |        |   InfluxDB)       |
         +-------------------+        +-------------------+        +-------------------+
                    |                              |
                    v                              v
         +------------------------------------------------------+
         |              All Edge POPs (300+ globally)            |
         |  Config sync via pull (polling or push via stream)   |
         |  Purge signals via pub/sub fan-out                   |
         +------------------------------------------------------+
```

---

## 5. Deep Dive Sections

### 5.1 CDN Fundamentals: Why CDN, Latency Reduction, Bandwidth Savings

A CDN is a geographically distributed network of proxy servers that caches content closer to end users. Without a CDN, every request travels from client to a single origin data center, incurring:

- **Network latency**: TCP round-trip time across continents (e.g. 200ms US to Asia)
- **Bandwidth costs**: All traffic exits from origin data center
- **Origin overload**: Every request hits origin servers directly

With a CDN:

- A user in Tokyo hits a POP in Tokyo (< 5ms network hop) instead of origin in Virginia (150ms+)
- 95%+ of requests are served from cache, origin only sees 5% of traffic
- Bandwidth costs shift from expensive origin egress to cheaper CDN bulk pricing

```
Without CDN:
  Client (Tokyo) ---[150ms RTT]---> Origin (Virginia)

With CDN:
  Client (Tokyo) ---[5ms RTT]---> POP (Tokyo) ---[cache HIT]---> response
                                              ---[cache MISS]---> Origin (Virginia) [once]
```

### 5.2 Push vs Pull CDN Models

```
+----------------------------------------------------------------------+
|                   Push CDN vs Pull CDN                                |
+---------------------------+------------------------------------------+
| Feature                   | Push CDN          | Pull CDN             |
+---------------------------+-------------------+----------------------+
| Content loading           | Customer uploads  | CDN fetches on miss  |
| Initial latency on miss   | None (pre-loaded) | First request slow   |
| Storage used              | All uploaded      | Only popular content |
| Control over eviction     | Full control      | CDN decides          |
| Best for                  | Static, known     | Dynamic, long-tail   |
| Examples                  | Software releases | News sites, blogs    |
| Origin load               | Zero after push   | On cache miss        |
| Complexity                | Higher (CI/CD)    | Lower (automatic)    |
+---------------------------+-------------------+----------------------+
```

**When to use Push CDN:**

- Software distribution (OS updates, game patches) - content is known ahead of time
- Marketing campaigns - ensure content is pre-warmed before launch
- Video content where you control encoding and upload pipeline

**When to use Pull CDN:**

- Websites with millions of URLs (news, e-commerce) - impractical to push all
- Dynamic content that changes frequently
- Long-tail content where only some URLs get traffic

**Hybrid approach** (most production CDNs): Pull by default, push for critical/predictable assets.

### 5.3 DNS-Based Routing: GeoDNS, Anycast, Latency-Based Routing

#### GeoDNS

```
DNS Resolution Flow:

Client (Tokyo)
    |
    | 1. DNS query for cdn.example.com
    v
Recursive Resolver (ISP)
    |
    | 2. Query authoritative DNS
    v
Authoritative DNS (GeoDNS)
    |  - Detects client IP geolocation: Japan
    |  - Looks up nearest POP for Japan: Tokyo POP
    |
    | 3. Returns A record: 203.0.113.10 (Tokyo POP IP)
    v
Client sends HTTPS request to 203.0.113.10
    |
    v
Tokyo Edge POP
```

GeoDNS maps client IP ranges to POP IPs using a GeoIP database. TTL is typically 60-300 seconds to allow for fast failover.

#### Anycast Routing

```
Anycast: Multiple POPs advertise the SAME IP address via BGP.
BGP routing automatically selects the topologically nearest POP.

                    [IP: 1.1.1.1]
                         |
          +--------------+--------------+
          |              |              |
    [POP: NY]       [POP: London]  [POP: Tokyo]
    BGP AS 1234     BGP AS 1234    BGP AS 1234
    Announces       Announces      Announces
    1.1.1.1/32      1.1.1.1/32     1.1.1.1/32

Client in Europe -> Internet routing -> London POP (shortest BGP path)
Client in US     -> Internet routing -> NY POP
Client in Asia   -> Internet routing -> Tokyo POP

Advantage: No DNS-level routing needed, works at network layer.
Used by: Cloudflare, Google (8.8.8.8), Fastly
```

#### Latency-Based Routing

DNS resolver measures actual RTT to each POP and returns the IP of the lowest-latency POP for that resolver. More accurate than pure geo-IP but requires active probing infrastructure.

### 5.4 Cache Hierarchy: L1 Edge -> L2 Regional -> Origin Shield -> Origin

```
Request flow with cache hierarchy:

Client Request
     |
     v
+--------------------+
|  L1 Edge Cache     |  (SSD, ~67 GB, hot data, <5ms local)
|  e.g. Tokyo POP    |
+--------------------+
     | HIT: return immediately
     | MISS: check parent
     v
+--------------------+
|  L2 Regional Cache |  (SSD/NVMe, ~500 GB, warm data, one per region)
|  e.g. AP-Northeast |
+--------------------+
     | HIT: return + populate L1
     | MISS: check Origin Shield
     v
+--------------------+
|  Origin Shield     |  (Large SSD/HDD, ~5 TB, collapse all POPs)
|  (single location) |
+--------------------+
     | HIT: return + populate L2 + L1
     | MISS: fetch from origin
     v
+--------------------+
|  Origin Server     |  (Customer infrastructure)
+--------------------+
     | Returns content
     | Populate Shield -> L2 -> L1

Cache hit ratios per tier (example):
  L1 Edge:      85% of total requests
  L2 Regional:  7%  of total requests (arrive after L1 miss)
  Origin Shield: 3%  of total requests (arrive after L2 miss)
  Origin:        5%  of total requests
```

Benefits of tiered cache:

- L1 provides sub-millisecond cache lookups for hot content
- L2 reduces duplicate fetches from multiple L1 POPs in same region
- Origin Shield ensures origin only sees a single request per unique cache miss globally

### 5.5 Cache Key Design

The cache key determines what counts as a "unique" cacheable object.

```
Default cache key:
  scheme + host + path + query_string
  e.g. https://cdn.example.com/image.jpg?size=large&format=webp

Cache key components:

+------------------+------------------------------------------+-------------------+
| Component        | Include in cache key?                    | Example           |
+------------------+------------------------------------------+-------------------+
| URL (path)       | Always                                   | /assets/logo.png  |
| Query params     | Configurable (whitelist/blacklist)       | ?version=3        |
| Cookie           | Usually NO (would fragment cache badly)  | session_id        |
| Accept-Encoding  | YES via Vary header                      | gzip, br          |
| Accept           | YES for content negotiation              | image/webp        |
| User-Agent       | NO (too many variants, bad hit ratio)   |                   |
| X-Country-Code   | YES for geo-personalized content         | US                |
| Authorization    | NO for public CDN; private content only |                   |
+------------------+------------------------------------------+-------------------+

Vary header:
  Origin responds with: Vary: Accept-Encoding, Accept
  CDN stores separate cache entries per combination of these headers.

Cache key normalization:
  - Sort query params alphabetically (a=1&b=2 == b=2&a=1)
  - Lowercase scheme and host
  - Remove tracking params (utm_source, fbclid) from cache key but not from URL

Consistent hashing within a POP:
  Within a POP, multiple cache servers use consistent hashing on cache key
  to distribute objects and avoid thundering herd on miss.

  +--------+  +--------+  +--------+  +--------+
  | Cache0 |  | Cache1 |  | Cache2 |  | Cache3 |
  | hash   |  | hash   |  | hash   |  | hash   |
  | 0-90   |  | 91-180 |  | 181-270|  | 271-360|
  +--------+  +--------+  +--------+  +--------+

  hash("/assets/logo.png") = 142 -> Cache1 handles this object
```

### 5.6 Cache Invalidation Strategies

```
+----------------------+------------------+--------------------+-------------------+
| Strategy             | Propagation Time | Use Case           | Complexity        |
+----------------------+------------------+--------------------+-------------------+
| TTL Expiry           | Automatic        | General purpose    | Low               |
| URL Purge            | < 5 seconds      | Immediate update   | Medium            |
| Tag-based Purge      | < 5 seconds      | Bulk invalidation  | Medium            |
| Prefix Purge         | < 5 seconds      | Directory clear    | Medium            |
| stale-while-revalidate| Immediate serve | High-traffic assets| Low               |
| stale-if-error       | Immediate serve  | Error resilience   | Low               |
| Versioned URLs       | Never needed     | Immutable assets   | Low (deploy-time) |
+----------------------+------------------+--------------------+-------------------+
```

**TTL Expiry:**

```
Cache-Control: public, max-age=86400
# After 86400 seconds, CDN re-fetches from origin on next request
```

**stale-while-revalidate:**

```
Cache-Control: max-age=60, stale-while-revalidate=600
# Serve stale content for up to 660 seconds
# Revalidate in background when content is between 60-660 seconds old
# No latency penalty for revalidation

Timeline:
  t=0    -> Cache fresh, serve from cache
  t=60   -> Cache stale, serve stale immediately, trigger background fetch
  t=660  -> Cache expired, must wait for origin fetch
```

**Tag-based Purge (most powerful):**

```
1. Content is tagged at response time via CDN-Cache-Tag header:
   CDN-Cache-Tag: product-123, category-shoes, homepage

2. When product-123 updates, purge by tag:
   DELETE /v1/cdn/cache/tags  { "tags": ["product-123"] }

3. CDN purges all objects tagged with "product-123" across all POPs
   - Could affect: product page, related carousel, category page, etc.
```

**Purge propagation mechanism:**

```
Purge Service
     |
     | Publish purge event to message broker
     v
+-------------+
|  Kafka Topic |   (purge-events)
+-------------+
     |
     | Fan-out to all POP consumers
     +----+----+----+----+----+
     v    v    v    v    v    v
  POP1 POP2 POP3 POP4 POP5 ... (300 POPs)
  Each POP has a consumer that:
    1. Receives purge event
    2. Marks cached objects as stale/deleted
    3. Acknowledges back to Purge Service
```

### 5.7 Origin Shield: Reducing Origin Load

```
Without Origin Shield:
  300 POPs all suffer cache miss simultaneously -> 300 requests to origin
  (thundering herd during traffic spike or after purge)

With Origin Shield:
  300 POPs miss -> all 300 route to single Origin Shield POP
  Origin Shield collapses 300 concurrent requests into 1 origin fetch
  (request coalescing / request collapsing)

  +------+  +------+  +------+
  | POP1 |  | POP2 |  | POP3 |  (all miss L1 and L2)
  +------+  +------+  +------+
      \          |        /
       \         |       /
        v        v      v
     +------------------------+
     |    Origin Shield       |
     |  (request coalescing)  |
     |  3 requests -> 1 fetch |
     +------------------------+
              |
              | Single fetch
              v
     +------------------+
     |   Origin Server  |
     +------------------+

Origin Shield placement:
  - Select POP geographically close to origin for low shield-to-origin latency
  - Often in same cloud region as origin (e.g. us-east-1 for AWS us-east-1 origin)

Request coalescing algorithm:
  1. First request for URL arrives at Shield -> forward to origin, register as "in-flight"
  2. Subsequent requests for same URL arrive -> wait on in-flight response
  3. Origin responds -> Shield caches it, returns to all waiting requests
  4. Future requests -> served from Shield cache
```

### 5.8 TLS Termination at Edge

```
TLS Handshake at Edge:

Client (Tokyo)
    |
    | ClientHello (TLS 1.3)
    v
Tokyo Edge POP
    | - Has TLS certificate for cdn.example.com
    | - Stored in edge memory (no disk I/O for certs)
    |
    | ServerHello + Certificate + Finished (TLS 1.3 1-RTT)
    v
Client (encrypted session established)
    |
    | HTTP/2 GET /assets/logo.png
    v
Tokyo Edge POP (serves from cache or fetches origin)
    |
    | Note: Origin connection uses separate TLS or internal network
    | Edge to Origin Shield: mTLS for authentication
    v
Response encrypted back to client

TLS features at CDN edge:
  - TLS 1.3: reduces handshake to 1-RTT (vs 2-RTT for TLS 1.2)
  - 0-RTT (TLS 1.3 early data): resumption with 0-RTT for repeat visitors
    * Trade-off: replay attack risk, typically used for GET requests only
  - OCSP Stapling: edge includes OCSP response in handshake
    * Client doesn't need separate OCSP request to CA (saves RTT)
  - Session Resumption: TLS session tickets stored at edge
  - Certificate Management:
    * Automated via ACME protocol (Let's Encrypt or DigiCert)
    * Wildcard certs for customer subdomains
    * Certificates distributed to all POPs via control plane
    * Auto-renewal 30 days before expiry
  - SNI (Server Name Indication): allows multiple certs per IP
```

### 5.9 HTTP/2 and HTTP/3 (QUIC)

```
HTTP/1.1 Problems:
  - Head-of-line blocking: requests queue behind slow requests
  - No multiplexing: need multiple TCP connections
  - High overhead per request (verbose headers)

HTTP/2 Solutions:
  - Multiplexing: multiple streams over single TCP connection
  - Header compression (HPACK)
  - Server push (push resources before browser requests them)
  Problem: TCP head-of-line blocking still exists at transport layer

HTTP/3 (QUIC) Solutions:
  - Built on UDP instead of TCP
  - Per-stream flow control: packet loss only blocks affected stream
  - 0-RTT connection establishment for repeat visitors
  - Connection migration: client IP change doesn't break connection
    (important for mobile clients switching WiFi <-> cellular)

HTTP/3 at CDN edge:
+---------------------------+    QUIC/UDP    +------------------+
|    Client (browser)       | <-----------> | Edge POP         |
|  Supports HTTP/3?  Y/N    |               | Terminates QUIC  |
|  HTTP/3 via Alt-Svc:      |               | Internally uses  |
|  h3="cdn.example.com:443" |               | HTTP/2 to origin |
+---------------------------+               +------------------+

Connection migration example (mobile):
  Client on 4G connects to POP (connection ID: abc123)
  Client switches to WiFi (IP changes)
  HTTP/3: connection persists via connection ID abc123
  HTTP/2: connection drops, new TCP handshake needed (200ms penalty)

0-RTT Connection:
  First visit:  1-RTT QUIC handshake  (similar to TLS 1.3)
  Return visit: 0-RTT resumption, first packet carries application data
  Trade-off:    Replay vulnerability, limit to idempotent requests
```

### 5.10 Edge Compute: Workers, Lambda@Edge, WebAssembly

```
Traditional CDN:
  Request -> Cache Check -> Cache HIT/MISS -> Response
  (no custom logic at edge)

Edge Compute:
  Request -> Edge Function -> Cache Check -> Response
  (arbitrary code runs at edge, < 2ms overhead)

Edge Compute Architecture:

+------------------------------------------+
|           Edge POP                        |
|                                          |
|  +----------+     +-----------------+   |
|  | Incoming |---->| Edge Function   |   |
|  | Request  |     | (Isolate / WASM)|   |
|  +----------+     +-----------------+   |
|                           |             |
|                   +-------+-------+     |
|                   |       |       |     |
|               Serve   Cache   Forward   |
|               custom  lookup  to origin |
|               response                  |
+------------------------------------------+

Cloudflare Workers: V8 Isolates (not VMs, not containers)
  - Cold start: < 0ms (isolates share V8 heap, no process fork)
  - Memory: 128 MB per isolate
  - CPU: 50ms CPU time per request
  - Language: JavaScript, TypeScript, WASM

Lambda@Edge: Node.js / Python Lambda functions at CloudFront POPs
  - Cold start: 100-300ms (Lambda container spin-up)
  - Triggers: viewer-request, origin-request, origin-response, viewer-response

WebAssembly at edge:
  - Run compiled Rust/C++/Go code at edge in WASM sandbox
  - Near-native performance for compute-intensive operations

Common edge compute use cases:
  1. A/B Testing:    Route 10% traffic to B variant without origin logic
  2. Auth at edge:   Validate JWT/session before hitting origin
  3. URL rewrites:   Rewrite /old-path -> /new-path at edge
  4. Geo-blocking:   Block requests from specific countries
  5. Bot detection:  Challenge suspicious patterns
  6. Image resizing: Resize/optimize images at edge via WASM
  7. API aggregation: Combine multiple origin responses at edge

Edge KV Store (Cloudflare KV, CloudFront Functions + DynamoDB):
  - Globally replicated key-value store
  - Used by edge functions to read config, feature flags, rate limits
  - Eventually consistent (writes propagate in ~60 seconds)
```

### 5.11 Video Delivery: HLS/DASH, Adaptive Bitrate, Chunked Transfer

```
Video Delivery Architecture:

+-------------+    Upload     +------------+    Transcode   +------------+
|  Content    | -----------> | Ingest     | ------------> | Encoding   |
|  Creator    |              | Service    |               | Farm       |
+-------------+              +------------+               +------------+
                                                                |
                                          Store segments to S3/origin
                                                                |
                                                                v
+------------------------------------------------------------------+
|                          CDN                                      |
|                                                                  |
|  Origin (S3):                                                    |
|    /video/abc/manifest.m3u8        (HLS master playlist)        |
|    /video/abc/720p/seg001.ts       (2-second segments)          |
|    /video/abc/720p/seg002.ts                                     |
|    /video/abc/1080p/seg001.ts                                    |
|    /video/abc/1080p/seg002.ts                                    |
|                                                                  |
|  Edge Cache:                                                     |
|    manifest.m3u8: TTL 5s  (updated frequently)                  |
|    seg*.ts files: TTL 365d (immutable once created)             |
+------------------------------------------------------------------+
                    |
              Client (browser/app)
              Adaptive Bitrate Player (HLS.js / Shaka Player)

Adaptive Bitrate (ABR) Algorithm:
  Player monitors network bandwidth continuously
  Network good (10 Mbps) -> request 1080p segments
  Network degrades (2 Mbps) -> switch to 720p segments
  Network poor (500 Kbps) -> switch to 360p segments

  Player decision: estimated_bandwidth * 0.8 < chosen_bitrate

HLS vs DASH:
  HLS:  Apple standard, .m3u8 playlist, .ts segments
  DASH: MPEG standard, .mpd manifest, .mp4 segments (CMAF)
  Both supported at CDN edge with format negotiation

Cache strategy for video:
  - Segments (immutable): Cache-Control: public, max-age=31536000, immutable
  - Manifests (live): Cache-Control: public, max-age=2, stale-while-revalidate=60
  - For live streams: use short TTL + stale-while-revalidate

Chunked transfer for large files:
  CDN uses Range requests and chunked encoding:
  1. Client requests /video/seg001.ts with Range: bytes=0-1048575
  2. CDN checks if it has segment cached
  3. On miss, CDN fetches from origin using Range requests
  4. CDN can begin streaming to client before full segment is cached
     (byte-range caching + streaming)
```

### 5.12 DDoS Protection at CDN Edge

```
DDoS Protection Layers:

Layer 3/4 (Network Layer):
  - Anycast absorbs volumetric attacks (each POP absorbs traffic)
  - BGP blackholing for extreme attacks (null-route at ISP level)
  - Rate limiting by IP at packet level (iptables/XDP/eBPF)

Layer 7 (Application Layer):
  - WAF (Web Application Firewall): OWASP rules, custom rules
  - Rate limiting by IP, ASN, country, user agent
  - Challenge pages (Captcha, JS challenge) for suspicious traffic
  - Bot fingerprinting: TLS fingerprint, browser fingerprint

+----------------------------+
|  Incoming Request          |
+----------------------------+
          |
          v
+----------------------------+
|  IP Reputation Check       |  Block known malicious IPs
+----------------------------+
          |
          v
+----------------------------+
|  Rate Limiter              |  10,000 req/min per IP sliding window
+----------------------------+
          |
          v
+----------------------------+
|  WAF Rules                 |  SQL injection, XSS, RCE patterns
+----------------------------+
          |
          v
+----------------------------+
|  Bot Detection             |  JS challenge, Captcha, TLS fingerprint
+----------------------------+
          |
          v
+----------------------------+
|  Edge Cache / Origin       |  Only legitimate traffic reaches here
+----------------------------+

Anycast DDoS absorption:
  Attack generates 10 Tbps of traffic
  Traffic is distributed across 300 POPs via anycast
  Each POP handles 10 Tbps / 300 = ~33 Gbps (within capacity)
  Volumetric attack is absorbed; no single POP is overwhelmed

Rate limiting algorithms:
  - Token bucket: allows bursting, good for API rate limits
  - Sliding window: smooth rate enforcement
  - Fixed window: simple, cheaper but allows burst at boundaries
```

### 5.13 Cache Hit Ratio Optimization

```
Target: > 95% cache hit ratio for static content

Factors reducing cache hit ratio:
  1. Query string proliferation: /img.jpg?ts=1234567890 (unique per request)
  2. Cookie-keyed cache: each user session = unique cache entry
  3. Low TTL: too short TTL causes frequent origin fetches
  4. Low popularity: long-tail content misses frequently
  5. Cache eviction: LRU eviction removes content before it's requested again

Optimization techniques:

1. Query parameter normalization and stripping:
   - Identify tracking params: utm_*, fbclid, gclid
   - Strip from cache key (but forward to origin for analytics)
   - Sort remaining params alphabetically: b=2&a=1 -> a=1&b=2

2. Cache warming (pre-population):
   - Before deploying new content, CDN proactively fetches it
   - Use sitemap.xml to discover URLs to pre-warm
   - Especially important for launch events or marketing campaigns

3. Prefetching:
   - Analyze access patterns: if /page/1 is requested, prefetch /page/2
   - Edge function can trigger async prefetch on cache hit

4. Long-tail content strategies:
   - Long-tail: 80% of URLs get < 1% of traffic
   - Strategy: Don't try to cache all long-tail, focus on top 20%
   - Use larger L2/Shield caches to handle long-tail with fewer origin hits

5. Cache key tuning:
   - Reduce Vary header fields to minimum necessary
   - Use Accept-Encoding in cache key but normalize (gzip vs br -> two entries)

6. Monitoring and alerting:
   - Alert if cache hit ratio drops below 90% (possible query string attack)
   - Monitor by content type (images should be near 99%, HTML near 80%)

Expected hit ratios by content type:
  Static images (immutable with hash): 99%+
  CSS/JS (versioned):                  99%+
  HTML pages:                          70-85%
  API responses:                       20-60%
  Personalized content:                0% (not cached)
```

### 5.14 Multi-CDN Strategy

```
Multi-CDN Architecture:

+---------------------------+
|   Traffic Controller      |
|   (DNS-based steering)    |
+---------------------------+
     |         |        |
     v         v        v
+---------+ +--------+ +-------+
| CDN A   | | CDN B  | | CDN C |
|(Primary)| |(Failover|(Low    |
|Cloudflare| |Fastly) | |cost)  |
|         | |        | |AWS CF |
+---------+ +--------+ +-------+

Traffic steering decisions:
  - Health check: if CDN A has high error rate -> switch to CDN B
  - Cost: route low-priority traffic to cheapest CDN
  - Geographic: CDN A for US, CDN B for EU, CDN C for AP
  - Performance: real-user-monitoring (RUM) selects lowest latency CDN

RUM-based steering:
  1. Client loads page, reports CDN latency to analytics
  2. Analytics aggregates by region, ISP, CDN
  3. Traffic controller updates DNS weights every minute
  4. Clients directed to best-performing CDN for their context

Failover flow:
  CDN A health check fails (status > 5% error rate)
  -> Traffic controller updates DNS TTL=0 (or uses anycast switch)
  -> CDN B begins receiving traffic
  -> Alert sent to operations team
  -> CDN A recovers -> gradual traffic shift back (canary: 10% -> 50% -> 100%)

Benefits:
  - Redundancy: CDN outage doesn't take down service
  - Cost: leverage multiple CDN pricing models
  - Coverage: different CDNs may have better coverage in specific regions
  - Negotiation: leverage competition between CDN vendors
```

### 5.15 Real-Time Analytics: Per-POP Metrics, Cache Hit Ratios, Bandwidth

```
Analytics Pipeline:

Edge POP (Tokyo)
  |  Every request generates a log event:
  |  {
  |    "timestamp": 1709250000,
  |    "pop": "nrt-01",
  |    "cache_status": "HIT",
  |    "method": "GET",
  |    "url": "/assets/logo.png",
  |    "response_code": 200,
  |    "bytes_sent": 45230,
  |    "ttfb_ms": 4,
  |    "client_ip_hash": "sha256(ip)",
  |    "country": "JP",
  |    "user_agent_class": "browser"
  |  }
  |
  | Streaming log shipping (Kafka Producer at edge)
  v
+------------------+
|  Kafka Cluster   |  (regional Kafka clusters, replicated globally)
+------------------+
  |
  | Consumers:
  +---> Real-time stream processor (Flink / Spark Streaming)
  |       - Compute 1-minute rollups per POP
  |       - Detect anomalies (traffic spike, error rate spike)
  |       - Write to time-series DB
  |
  +---> Raw log storage (S3 / GCS)
  |       - Long-term retention for billing, debugging
  |
  +---> Alerting consumer
          - PagerDuty alerts on SLO breach

Time-series DB (ClickHouse):
  - Optimized for analytical queries on time-series data
  - Columnar storage: fast aggregations on bandwidth, request counts
  - TTL policies: high-resolution data (1s) kept 7 days, hourly kept 1 year

Key metrics tracked:
  - Requests per second (total, by POP, by status code)
  - Cache hit ratio (by content type, by POP)
  - Bandwidth (ingress/egress per POP)
  - Origin fetch rate
  - TTFB (time to first byte) percentiles
  - Error rate (4xx, 5xx)
  - Purge propagation time
  - Edge function execution time

Dashboard refresh:
  - Real-time: 1-second granularity via WebSocket streaming
  - Operational: 1-minute aggregates
  - Billing: hourly/daily rollups
```

---

## 6. Scaling Strategy

### Horizontal Scaling Within a POP

```
Load Balancer (L4)
     |
     +------+------+------+
     |      |      |      |
  Server1 Server2 Server3 ...ServerN

Servers are stateless (cache is shared via consistent hashing).
Add servers as traffic grows; consistent hashing minimizes cache churn.
```

### Adding New POPs

```
Process for adding a new POP:
  1. Provision physical servers in new data center
  2. Install CDN edge software
  3. Register POP in control plane (config, routing rules)
  4. BGP peer with local ISPs (anycast routing takes effect)
  5. Configure parent POP (L2 regional or Origin Shield)
  6. POP starts receiving traffic (warm-up period: L1 cache fills)
  7. Monitor cache hit ratio, latency, error rate

POP placement strategy:
  - Tier 1: Major metropolitan areas (NYC, London, Tokyo, Singapore, Frankfurt)
  - Tier 2: Secondary cities (Atlanta, Amsterdam, Sydney, Mumbai)
  - Tier 3: ISP-specific (inside major ISP networks = eyeball POPs)
  - Dense presence in high-traffic regions reduces latency to < 10ms
```

### Cache Storage Scaling

```
SSD tiering:
  Hot data:  NVMe SSD  (fast, expensive, ~10 TB/node)
  Warm data: SATA SSD  (medium, larger, ~100 TB/node)
  Cold data: HDD       (slow, cheap, ~1 PB/node)

Cache eviction:
  LRU (Least Recently Used) for each tier
  Objects promoted: HDD -> SSD on access
  Objects demoted: SSD -> HDD when SSD is full
```

---

## 7. Cost Model

### Bandwidth Pricing

```
CDN bandwidth costs (typical):
  - CDN egress to clients: $0.008/GB (bulk pricing, ~80% cheaper than cloud egress)
  - Origin egress to CDN: $0.09/GB (cloud provider pricing, e.g. AWS S3)
  - Between CDN POPs: Near-free (internal CDN network)

Cost calculation for our scale:
  Total egress: 2,000 TB/day = 2,000,000 GB/day
  CDN cost:     2,000,000 GB * $0.008 = $16,000/day = $480,000/month

  Without CDN (origin egress):
  Total egress: 2,000 TB/day at $0.09/GB = $180,000/day = $5,400,000/month

  Savings: $5,400,000 - $480,000 = $4,920,000/month (91% savings)

  Origin fetch egress (5% of traffic):
  100 TB/day * $0.09/GB = $9,000/day = $270,000/month
```

### Request Pricing

```
CDN request pricing (typical):
  HTTP requests:  $0.0075 per 10,000 requests
  HTTPS requests: $0.010  per 10,000 requests

Request cost:
  10B requests/day = 1,000,000 batches of 10,000
  Cost: 1,000,000 * $0.010 = $10,000/day = $300,000/month

Edge compute (Cloudflare Workers pricing):
  First 100K requests/day: Free
  Additional: $0.50 per 1M requests

Total estimated monthly CDN cost:
  Bandwidth:      $480,000
  Requests:       $300,000
  Edge compute:   $50,000
  Overhead:       $50,000
  Total:          ~$880,000/month

vs. Origin serving without CDN: ~$5,400,000/month
Net savings: ~$4,520,000/month (84% savings)
```

---

## 8. Trade-offs

```
+------------------------------------------+-----------------------------+-----------------------------+
| Decision                                 | Option A                    | Option B                    |
+------------------------------------------+-----------------------------+-----------------------------+
| Cache consistency vs availability        | Short TTL (strong consist.) | Long TTL + purge API        |
|                                          | + frequent origin fetches   | + stale risk if purge fails |
+------------------------------------------+-----------------------------+-----------------------------+
| Anycast vs GeoDNS routing               | Anycast (network-layer)     | GeoDNS (DNS-layer)          |
|                                          | + automatic, no DNS TTL     | + more control, simpler     |
|                                          | - requires BGP peering       | - DNS TTL limits failover   |
+------------------------------------------+-----------------------------+-----------------------------+
| Push vs Pull CDN                         | Push: pre-populated          | Pull: on-demand             |
|                                          | + no cold miss latency       | + simpler deployment        |
|                                          | - requires CI/CD integration | - first-request latency     |
+------------------------------------------+-----------------------------+-----------------------------+
| Origin Shield: single vs multi-region    | Single origin shield        | Multi-region shield         |
|                                          | + maximum collapse          | + lower shield-origin RTT   |
|                                          | - single point of failure   | - more complexity           |
+------------------------------------------+-----------------------------+-----------------------------+
| Cache key: include/exclude query params  | Include all params          | Whitelist only known params |
|                                          | + correct per-variant cache | + better hit ratio          |
|                                          | - poor hit ratio (long-tail)| - risk of wrong content     |
+------------------------------------------+-----------------------------+-----------------------------+
| TLS termination: edge vs passthrough     | Edge TLS termination        | SSL passthrough to origin   |
|                                          | + CDN can read/cache HTTP   | + E2E encryption            |
|                                          | + cert management at CDN    | - CDN can't cache           |
+------------------------------------------+-----------------------------+-----------------------------+
| Edge compute: V8 Isolates vs containers  | V8 Isolates (cold: 0ms)     | Containers (cold: 100ms+)   |
|                                          | + no cold start              | + full runtime, any language|
|                                          | - JS/WASM only              | - latency on cold start     |
+------------------------------------------+-----------------------------+-----------------------------+
```

---

## 9. Common Interview Follow-ups

**Q: How do you handle cache stampede (thundering herd)?**

```
Problem: 10,000 clients request same URL at same time, all get cache miss,
         all 10,000 requests hit origin simultaneously.

Solutions:
1. Request coalescing (locking):
   - First request acquires lock for that cache key
   - Subsequent requests wait on lock
   - Origin receives exactly 1 request
   - All waiters receive cached response

2. Probabilistic early revalidation:
   - When cache TTL is within 10% of expiry, randomly revalidate
   - Avoids synchronized expiry

3. Jitter on TTL:
   - Instead of TTL=3600, use TTL = 3600 + random(0, 600)
   - Spreads expiry across time window

4. Origin Shield:
   - All 300 POPs coalesce at Shield, Shield sends single request to origin
```

**Q: How do you implement real-time purge propagation in < 5 seconds?**

```
Architecture:
1. Purge API receives request
2. Write purge event to Kafka (low latency: < 1ms)
3. Each POP has dedicated Kafka consumer
4. Consumer receives event, marks objects stale: < 100ms
5. Total: 1ms + consumer lag + network RTT

Kafka consumer at each POP:
  - Dedicated consumer group per POP
  - Topic partitioned for parallelism
  - At-least-once delivery (idempotent purge operations)

Fallback: polling
  If Kafka consumer is down, POP polls purge API every 30 seconds
  (eventual consistency, but bounded to 30s window)
```

**Q: How do you handle private/authenticated content on CDN?**

```
Options:
1. Signed URLs:
   - Origin generates URL with HMAC signature + expiry
   - CDN validates signature at edge (edge function)
   - URL: /protected/video.mp4?expires=1709250000&sig=abc123
   - CDN caches content under signed-URL cache key
   - Separate cache for each user? No -> cache under unsigned key,
     validate signature separately

2. Edge-side auth:
   - Edge function validates JWT/session token
   - On valid token: serve cached (shared) content
   - On invalid token: return 401

3. Vary on Authorization (bad):
   - CDN stores separate cache entry per Authorization header
   - Cache hit ratio approaches 0% (unique per user)
   - Never use this for high-traffic content
```

**Q: How does CDN interact with service workers?**

```
Client-side caching vs CDN caching:
  Service Worker (client): browser-side cache, offline support
  CDN (network): shared cache, all users benefit

  Request flow with both:
  Browser Request
    -> Service Worker cache (hit: return, miss: continue)
    -> CDN edge cache (hit: return, miss: continue)
    -> Origin

  CDN cache-control must be compatible with service worker strategy.
  Use Vary: Accept-Encoding but not Vary: Cookie for CDN-cached assets.
```

**Q: How do you handle cache key collisions or cache poisoning?**

```
Cache poisoning attack:
  Attacker sends: GET /page HTTP/1.1
                  Host: cdn.example.com
                  X-Forwarded-Host: evil.com

  If CDN includes X-Forwarded-Host in cache key and response:
  Next user's response contains evil.com in content.

Prevention:
1. Strip dangerous headers before caching (X-Forwarded-Host, X-Original-URL)
2. Validate that cache key headers are allowlisted
3. Do not reflect request headers in cached response body
4. Use strict cache key definitions (only URL + whitelisted headers)

Web Cache Deception:
  Attacker tricks user to request: /account?/style.css
  CDN caches it as a static CSS file (based on .css extension)
  Other users receive victim's account data.

Prevention:
1. Check Content-Type of response, not URL extension
2. Only cache responses with cacheable Content-Type (image/*, text/css, etc.)
3. Validate that response Cache-Control allows caching before storing
```

**Q: How do you implement geo-restriction at CDN edge?**

```
Edge function (Cloudflare Workers example):

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const country = request.cf.country  // Cloudflare provides geo-IP
  const blockedCountries = ['CN', 'RU', 'KP']  // from KV store

  if (blockedCountries.includes(country)) {
    return new Response('Content not available in your region', {
      status: 451,  // HTTP 451: Unavailable For Legal Reasons
      headers: { 'Content-Type': 'text/plain' }
    })
  }

  return fetch(request)  // forward to cache/origin
}
```

**Q: How do you measure and optimize Time to First Byte (TTFB) at CDN?**

```
TTFB components:
  1. DNS resolution:      5-50ms (GeoDNS lookup)
  2. TCP connect:         1-20ms (nearby POP)
  3. TLS handshake:       5-20ms (TLS 1.3 1-RTT)
  4. HTTP request:        1-5ms
  5. Cache lookup:        < 1ms (SSD)
  6. Response transmission: dependent on object size

Optimization:
  - Preconnect: hint browser to preconnect to CDN domain
    <link rel="preconnect" href="https://cdn.example.com">
  - HTTP/2 server push: CDN pushes critical resources
  - TLS 0-RTT: eliminate TLS handshake for returning clients
  - Keep-alive: reuse TCP connections for multiple requests
  - HTTP/3: eliminate TCP handshake entirely for UDP

Target TTFB breakdown:
  DNS:        20ms  (cached after first request)
  TCP+TLS:    15ms  (with session resumption: 0ms)
  Request:     2ms
  Cache lookup: 1ms
  Total:      ~38ms (well under 50ms SLA for cache hits)
```

**Q: Explain how CDN handles WebSockets and Server-Sent Events.**

```
Standard CDN caching doesn't apply to WebSockets (stateful, bidirectional).

WebSocket at CDN:
  - CDN acts as a transparent TCP proxy
  - Upgrades from HTTP to WebSocket (101 Switching Protocols)
  - Maintains long-lived TCP connection to origin
  - CDN adds value: TLS termination, DDoS protection, load balancing
  - No caching occurs

Server-Sent Events (SSE):
  - Unidirectional streaming from server to client
  - Content-Type: text/event-stream
  - CDN forwards stream but cannot cache (streaming response)
  - Some CDNs support Edge SSE: events generated at edge from KV/Pub-Sub
    (e.g. Cloudflare Durable Objects)

Recommendation:
  - For real-time data: use SSE or WebSocket through CDN as proxy
  - For pub/sub at edge scale: Cloudflare Durable Objects / Fastly Fanout
  - Cache what can be cached (static assets), stream what must be streamed
```

---

## 10. Summary Architecture Diagram

```
+==============================================================================+
|                    Content Delivery Network (CDN)                            |
+==============================================================================+

  CLIENTS                    EDGE NETWORK               ORIGIN INFRASTRUCTURE
  -------                    ------------               ----------------------

+----------+   DNS    +---------------+
|  Browser |--------> | GeoDNS /      |
|  Mobile  |          | Anycast DNS   |
|  IoT     |<-------- | Returns POP   |
+----------+   IP     +---------------+
     |
     | HTTPS (HTTP/3 QUIC or HTTP/2)
     |
     v
+----------------------------------+       +----------------------------------+
|          L1 Edge POP             |       |        Control Plane             |
|  +----------------------------+  |       |  +----------------------------+  |
|  | WAF / DDoS / Rate Limiter  |  |       |  | Config Service             |  |
|  +----------------------------+  |       |  | Purge Service              |  |
|  | TLS Termination (TLS 1.3)  |  | <---> |  | Analytics Service         |  |
|  | OCSP Stapling              |  | sync  |  | Certificate Manager       |  |
|  +----------------------------+  |       |  +----------------------------+  |
|  | Edge Compute (V8 Isolates) |  |       +----------------------------------+
|  | A/B test, auth, rewrites   |  |
|  +----------------------------+  |
|  | L1 Cache (NVMe SSD)        |  |---> CACHE HIT: Return to client
|  | ~67 GB, hot data           |  |
|  +----------------------------+  |
|  | Cache Miss Handler         |  |---> CACHE MISS: fetch from L2
+----------------------------------+

     |  L1 Cache Miss
     v
+----------------------------------+
|       L2 Regional Cache POP      |
|  +----------------------------+  |
|  | L2 Cache (SATA SSD)        |  |---> CACHE HIT: Return, populate L1
|  | ~500 GB, warm data         |  |
|  +----------------------------+  |
+----------------------------------+

     |  L2 Cache Miss
     v
+----------------------------------+       +----------------------------------+
|         Origin Shield            |       |           Origin Server          |
|  +----------------------------+  |       |  +----------------------------+  |
|  | Request Coalescing         |  |       |  | Web Server / S3 / CDN Src  |  |
|  | Large Cache (HDD+SSD)      |  | ----> |  | Customer Infrastructure    |  |
|  | ~5 TB, all unique objects  |  |       |  +----------------------------+  |
|  +----------------------------+  |       +----------------------------------+
+----------------------------------+

ANALYTICS PIPELINE:
  Every POP -> Kafka -> Stream Processor -> ClickHouse -> Dashboard
  Every POP -> Kafka -> Raw Logs -> S3 (long-term retention, billing)

PURGE PROPAGATION:
  Customer API -> Purge Service -> Kafka -> 300 POP consumers -> < 5 seconds

+==============================================================================+
```
