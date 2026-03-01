# Design an API Gateway & Service Mesh (Kong / Envoy / Istio)

---

## 1. Requirements Clarification

### Functional Requirements

| # | Requirement | Description |
|---|-------------|-------------|
| 1 | Request Routing | Route incoming requests to the correct upstream service based on path, host, headers, or query parameters |
| 2 | Authentication & Authorization | Validate API keys, JWT tokens, and OAuth2/OIDC tokens at the gateway before forwarding requests |
| 3 | Rate Limiting | Enforce per-client, per-endpoint, and global rate limits using sliding window counters |
| 4 | Load Balancing | Distribute traffic across service instances using configurable algorithms |
| 5 | Request/Response Transformation | Add, remove, or rewrite headers; translate between REST and gRPC; reshape payloads |
| 6 | Circuit Breaker | Detect upstream failures, open the circuit, and fail fast to prevent cascade failures |
| 7 | Retry & Timeout | Apply retry budgets with exponential backoff and per-request deadline propagation |
| 8 | TLS Termination | Terminate inbound TLS; optionally re-encrypt to upstream (mTLS in service mesh) |
| 9 | Service Discovery | Dynamically resolve upstream addresses via DNS or a service registry (Consul, etcd) |
| 10 | Observability | Emit distributed traces, metrics (latency, error rate, saturation), and structured access logs |
| 11 | API Versioning | Support URL-path versioning (`/v1/`, `/v2/`) and header-based versioning (`Accept: application/vnd.api+json;version=2`) |
| 12 | Plugin / Middleware Architecture | Composable filter chain so teams can add cross-cutting concerns without modifying services |
| 13 | Canary & Traffic Splitting | Progressively shift a percentage of traffic to a new service version |
| 14 | Service Mesh Sidecar | Inject Envoy sidecar proxies into every pod; manage the data plane from a central control plane (Istio) |
| 15 | mTLS Between Services | Issue short-lived X.509 certificates to every workload; enforce mutual TLS for all east-west traffic |

### Non-Functional Requirements

| # | Requirement | Target |
|---|-------------|--------|
| 1 | Added latency (gateway overhead) | < 5ms p99 |
| 2 | Throughput | 1,000,000+ req/sec sustained |
| 3 | Availability | 99.999% (< 5.26 min downtime/year) |
| 4 | Horizontal scalability | Linear scale-out with no single bottleneck |
| 5 | Configuration propagation | < 1 second from control plane to all data plane nodes |
| 6 | Certificate rotation | Automatic rotation; zero-downtime; rotation < 24 hours |
| 7 | Observability coverage | 100% of requests traced and metered |
| 8 | Security | Zero-trust: every service-to-service call authenticated and authorized |
| 9 | Fault isolation | One service failure must not cascade to others |
| 10 | Multi-region | Active-active across at least 3 geographic regions |

### Scale Estimation

```
Traffic:
  Peak requests/sec:      1,000,000 (1M RPS)
  Average request size:   2 KB (headers + small JSON body)
  Average response size:  5 KB
  Inbound bandwidth:      1M * 2 KB  = 2 GB/s
  Outbound bandwidth:     1M * 5 KB  = 5 GB/s
  Total bandwidth:        ~7 GB/s at gateway layer

Services & Endpoints:
  Microservices:          500
  Endpoints (routes):     10,000
  Service instances:      500 services * ~20 replicas = 10,000 pods
  Sidecars (mesh):        10,000 Envoy sidecar proxies

Gateway Nodes:
  Each gateway node handles ~100K RPS (NGINX/Kong benchmarks)
  Nodes needed:           1M / 100K = 10 nodes (minimum)
  With 3x headroom:       30 nodes across 3 regions (10 per region)
  CPU per node:           32 vCPUs (non-blocking event loop)
  RAM per node:           64 GB (connection table + route cache)

Rate Limit Store (Redis):
  Counters per client/endpoint pair:   10,000 endpoints * 100K clients = 1B counters
  Each counter:                        ~50 bytes
  Hot counters (active in 1-min window): ~10M active
  Redis memory:           10M * 50 bytes = 500 MB — fits in single Redis cluster node
  Redis ops/sec:          2 ops per request (read+increment) = 2M ops/sec
  Redis cluster shards:   6 shards * 500K ops each

Config / xDS (Control Plane):
  Route table:            10,000 routes * 1 KB = 10 MB
  xDS push to 10K sidecars: 10 MB * 10,000 = 100 GB (full state, rare)
  Incremental xDS delta:  ~1 KB per change * 10,000 = 10 MB (routine)
  Push latency target:    < 1 second

Certificates (mTLS):
  Workloads:              10,000
  Certificate size:       2 KB each
  Rotation every 24h:     10,000 certs/day = ~7 certs/sec (easily handled by Vault/SPIRE)

Access Log Storage:
  Log entry:              ~1 KB
  1M RPS * 1 KB = 1 GB/sec raw logs
  With sampling (1:100):  10 MB/sec
  Daily at 1:100 sample:  10 MB * 86,400 = ~864 GB/day
  Full logs (short TTL 7 days, sampled after): ~864 GB * 7 = ~6 TB
```

---

## 2. API Design

### Gateway Management API

```
GET    /admin/v1/services                  List all registered upstream services
POST   /admin/v1/services                  Register a new upstream service
PUT    /admin/v1/services/{serviceId}      Update service configuration
DELETE /admin/v1/services/{serviceId}      Deregister a service

GET    /admin/v1/routes                    List all routes
POST   /admin/v1/routes                    Create a new route (path/host/header matching rules)
PUT    /admin/v1/routes/{routeId}          Update a route
DELETE /admin/v1/routes/{routeId}          Delete a route

GET    /admin/v1/plugins                   List all active plugins
POST   /admin/v1/plugins                   Attach a plugin to a service or route
DELETE /admin/v1/plugins/{pluginId}        Detach a plugin

GET    /admin/v1/consumers                 List API consumers
POST   /admin/v1/consumers                 Create a consumer (client identity)
POST   /admin/v1/consumers/{id}/key-auth   Issue an API key for a consumer
POST   /admin/v1/consumers/{id}/jwt        Add a JWT credential for a consumer

GET    /admin/v1/upstreams/{name}/health   Health check status for all targets
POST   /admin/v1/upstreams/{name}/targets  Add a target (host:port) to an upstream
DELETE /admin/v1/upstreams/{name}/targets/{targetId}  Remove a target
```

**POST /admin/v1/routes Request:**
```json
{
  "name": "orders-v2-route",
  "service": { "id": "svc_orders" },
  "protocols": ["https"],
  "methods": ["GET", "POST", "PUT"],
  "paths": ["/v2/orders", "/v2/orders/.*"],
  "headers": {
    "X-Feature-Flag": ["orders-v2"]
  },
  "strip_path": false,
  "preserve_host": true,
  "plugins": [
    { "name": "rate-limiting", "config": { "minute": 1000, "policy": "redis" } },
    { "name": "jwt", "config": { "secret_is_base64": false } }
  ]
}
```

**POST /admin/v1/services Request:**
```json
{
  "name": "orders-service",
  "protocol": "http",
  "host": "orders.internal.svc.cluster.local",
  "port": 8080,
  "path": "/",
  "connect_timeout": 5000,
  "read_timeout": 30000,
  "write_timeout": 30000,
  "retries": 3,
  "health_checks": {
    "active": {
      "http_path": "/healthz",
      "interval": 10,
      "healthy": { "successes": 2 },
      "unhealthy": { "http_failures": 3, "interval": 5 }
    }
  }
}
```

### Health & Observability Endpoints

```
GET  /status                  Gateway node health (liveness probe)
GET  /ready                   Gateway node readiness (readiness probe)
GET  /metrics                 Prometheus metrics endpoint
GET  /debug/pprof             Go pprof profiling endpoint (admin only)
```

**GET /metrics (Prometheus text format excerpt):**
```
# HELP gateway_requests_total Total number of requests proxied
# TYPE gateway_requests_total counter
gateway_requests_total{service="orders",route="orders-v2-route",status="200"} 1482903

# HELP gateway_request_duration_seconds Request latency histogram
# TYPE gateway_request_duration_seconds histogram
gateway_request_duration_seconds_bucket{service="orders",le="0.005"} 1200000
gateway_request_duration_seconds_bucket{service="orders",le="0.01"} 1400000
gateway_request_duration_seconds_bucket{service="orders",le="0.025"} 1480000
gateway_request_duration_seconds_bucket{service="orders",le="+Inf"} 1482903

# HELP gateway_upstream_health Upstream target health (1=healthy, 0=unhealthy)
# TYPE gateway_upstream_health gauge
gateway_upstream_health{service="orders",target="10.0.1.5:8080"} 1
gateway_upstream_health{service="orders",target="10.0.1.6:8080"} 0
```

---

## 3. Data Model

### Route Configuration Schema

```sql
CREATE TABLE services (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(256) UNIQUE NOT NULL,
    protocol    VARCHAR(16) NOT NULL DEFAULT 'http',
    host        VARCHAR(512) NOT NULL,
    port        INTEGER NOT NULL,
    path        VARCHAR(1024) DEFAULT '/',
    connect_timeout_ms  INTEGER DEFAULT 5000,
    read_timeout_ms     INTEGER DEFAULT 30000,
    write_timeout_ms    INTEGER DEFAULT 30000,
    retries     INTEGER DEFAULT 3,
    tags        TEXT[],
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE routes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(256) UNIQUE NOT NULL,
    service_id  UUID REFERENCES services(id) ON DELETE CASCADE,
    protocols   TEXT[] DEFAULT ARRAY['https'],
    methods     TEXT[],
    hosts       TEXT[],
    paths       TEXT[],
    headers     JSONB,           -- { "header-name": ["value1"] }
    strip_path  BOOLEAN DEFAULT FALSE,
    preserve_host BOOLEAN DEFAULT FALSE,
    priority    INTEGER DEFAULT 0,
    tags        TEXT[],
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE consumers (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username    VARCHAR(256) UNIQUE NOT NULL,
    custom_id   VARCHAR(256),
    tags        TEXT[],
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE api_keys (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consumer_id UUID REFERENCES consumers(id) ON DELETE CASCADE,
    key         VARCHAR(256) UNIQUE NOT NULL,
    key_prefix  VARCHAR(16),     -- first 8 chars, shown in UI
    ttl         INTEGER,         -- NULL = never expires
    created_at  TIMESTAMPTZ DEFAULT now(),
    last_used   TIMESTAMPTZ,
    enabled     BOOLEAN DEFAULT TRUE
);

CREATE TABLE jwt_credentials (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consumer_id UUID REFERENCES consumers(id) ON DELETE CASCADE,
    algorithm   VARCHAR(16) DEFAULT 'RS256',
    key         TEXT NOT NULL,   -- kid / issuer
    secret      TEXT,            -- HMAC secret or RSA public key PEM
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE plugins (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(128) NOT NULL,
    service_id  UUID REFERENCES services(id) ON DELETE CASCADE,
    route_id    UUID REFERENCES routes(id) ON DELETE CASCADE,
    consumer_id UUID REFERENCES consumers(id) ON DELETE CASCADE,
    config      JSONB NOT NULL DEFAULT '{}',
    enabled     BOOLEAN DEFAULT TRUE,
    protocols   TEXT[] DEFAULT ARRAY['http','https'],
    created_at  TIMESTAMPTZ DEFAULT now(),
    -- Exactly one scope must be set
    CONSTRAINT plugin_scope CHECK (
        (service_id IS NOT NULL)::INT +
        (route_id IS NOT NULL)::INT +
        (consumer_id IS NOT NULL)::INT >= 0
    )
);

CREATE TABLE upstreams (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(256) UNIQUE NOT NULL,  -- used as DNS name
    algorithm   VARCHAR(32) DEFAULT 'round-robin',
    hash_on     VARCHAR(32),     -- 'header', 'cookie', 'ip', 'consumer'
    hash_on_header VARCHAR(256),
    slots       INTEGER DEFAULT 1000,
    healthchecks JSONB,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE targets (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upstream_id UUID REFERENCES upstreams(id) ON DELETE CASCADE,
    target      VARCHAR(512) NOT NULL,  -- host:port
    weight      INTEGER DEFAULT 100,
    created_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE(upstream_id, target)
);
```

### Rate Limit Counter Schema (Redis)

```
# Sliding window counter keys
Key pattern:  rl:{consumer_id}:{route_id}:{window_start_unix}
Type:         String (integer)
TTL:          window_size * 2

# Token bucket keys
Key pattern:  tb:{consumer_id}:{endpoint_hash}
Type:         Hash  { tokens: 950, last_refill: 1709500800 }

# Circuit breaker state keys
Key pattern:  cb:{service_id}:{instance}
Type:         Hash  { state: "open", failures: 5, opened_at: 1709500800, half_open_at: 1709500860 }
TTL:          cooldown_period (e.g., 60 seconds)

# Distributed lock for config reload
Key pattern:  lock:config:{node_id}
Type:         String
TTL:          5 seconds
```

### xDS Configuration Snapshot (Control Plane — stored in etcd)

```json
{
  "version": "2024-03-01T00:00:00Z-abc123",
  "listener_discovery_service": {
    "listeners": [
      {
        "name": "ingress_https",
        "address": "0.0.0.0:443",
        "filter_chains": [
          {
            "tls": { "cert": "...", "key": "..." },
            "filters": [
              { "name": "envoy.filters.network.http_connection_manager" }
            ]
          }
        ]
      }
    ]
  },
  "route_discovery_service": {
    "virtual_hosts": [
      {
        "name": "orders",
        "domains": ["api.example.com"],
        "routes": [
          {
            "match": { "prefix": "/v2/orders" },
            "route": { "cluster": "orders-v2", "timeout": "30s" }
          }
        ]
      }
    ]
  },
  "cluster_discovery_service": {
    "clusters": [
      {
        "name": "orders-v2",
        "lb_policy": "LEAST_REQUEST",
        "load_assignment": {
          "endpoints": [
            { "address": "10.0.1.5", "port": 8080, "health": "HEALTHY" },
            { "address": "10.0.1.6", "port": 8080, "health": "HEALTHY" }
          ]
        },
        "circuit_breakers": {
          "max_connections": 1024,
          "max_pending_requests": 1024,
          "max_requests": 1024,
          "max_retries": 3
        }
      }
    ]
  }
}
```

---

## 4. High-Level Architecture

```
+------------------+         +------------------+         +------------------+
|   Client Apps    |         |   Partner APIs   |         |  Internal Tools  |
| (Web/Mobile/CLI) |         | (3rd Party OAuth)|         |  (Admin Portal)  |
+--------+---------+         +--------+---------+         +--------+---------+
         |                            |                            |
         |    HTTPS / WebSocket       |    HTTPS                   |  HTTPS
         +----------------------------+----------------------------+
                                      |
              +------------------------+------------------------+
              |       Global Load Balancer / Anycast DNS        |
              |     (AWS Route 53 / Cloudflare / GeoDNS)        |
              +------------------------+------------------------+
                                       |
         +-----------------------------+-----------------------------+
         |                             |                             |
+--------+--------+          +---------+-------+          +---------+-------+
|  API Gateway    |          |  API Gateway    |          |  API Gateway    |
|  Region US-E    |          |  Region EU-W    |          |  Region AP-SE   |
|  (Kong/Nginx)   |          |  (Kong/Nginx)   |          |  (Kong/Nginx)   |
|  10 nodes       |          |  10 nodes       |          |  10 nodes       |
+--------+--------+          +---------+-------+          +---------+-------+
         |                             |                             |
         |  Plugin Chain per Request   |                             |
         |  [AuthN] --> [AuthZ]        |                             |
         |  --> [RateLimit]            |                             |
         |  --> [Transform]            |                             |
         |  --> [Route]                |                             |
         |  --> [LoadBalance]          |                             |
         +-----------------------------+-----------------------------+
                                       |
              +------------------------+------------------------+
              |         Internal Service Mesh (Istio)           |
              |         Data Plane: Envoy Sidecars              |
              +---+-----------+-----------+-----------+---------+
                  |           |           |           |
         +--------+--+ +------+----+ +----+------+ +--+--------+
         | Orders    | | Payments  | | Users     | | Catalog   |
         | Service   | | Service   | | Service   | | Service   |
         | [Envoy]   | | [Envoy]   | | [Envoy]   | | [Envoy]   |
         | [App :80] | | [App :80] | | [App :80] | | [App :80] |
         +-----------+ +-----------+ +-----------+ +-----------+
                  |           |           |           |
              +---+-----------+-----------+-----------+---------+
              |          Shared Infrastructure                   |
              |                                                  |
         +----+----+   +----------+   +---------+   +---------+ |
         |  Redis  |   |PostgreSQL|   |  Kafka  |   |  SPIRE  | |
         | Cluster |   | (Config) |   |(Events) |   |(Certs)  | |
         +---------+   +----------+   +---------+   +---------+ |
              +---------------------------------------------------+

Control Plane (separate cluster):
+--------------------------------------------------+
|  Istio Control Plane                            |
|  +-----------+  +----------+  +------------+   |
|  |  Pilot    |  |  Citadel |  |  Galley    |   |
|  | (xDS/LDS/ |  | (mTLS    |  | (Config    |   |
|  |  RDS/CDS) |  |  certs)  |  |  Validate) |   |
|  +-----------+  +----------+  +------------+   |
|                                                  |
|  Kong Control Plane                             |
|  +-----------+  +----------+  +------------+   |
|  |  Manager  |  |  Portal  |  |  Analytics |   |
|  | (Admin    |  | (Dev     |  | (Vitals)   |   |
|  |  API)     |  |  Portal) |  |            |   |
|  +-----------+  +----------+  +------------+   |
+--------------------------------------------------+
```

### Request Flow Through Gateway

```
Client                Gateway Node             Upstream Service
  |                        |                         |
  |--- HTTPS request ------>|                         |
  |                        |                         |
  |                   [1] TLS Termination             |
  |                   [2] Connection Pooling          |
  |                   [3] Request Parsing             |
  |                        |                         |
  |                   +----+----+                    |
  |                   | Plugin  |                    |
  |                   |  Chain  |                    |
  |                   +----+----+                    |
  |                        |                         |
  |               [4] AuthN (API Key / JWT)           |
  |                        |                         |
  |               [5] Rate Limit Check               |
  |                   (Redis INCR + TTL)             |
  |                        |                         |
  |               [6] Request Transform              |
  |                   (Add headers, rewrite)         |
  |                        |                         |
  |               [7] Route Matching                 |
  |                   (Trie lookup O(k))             |
  |                        |                         |
  |               [8] Load Balance                   |
  |                   (pick target)                  |
  |                        |                         |
  |               [9] Circuit Breaker Check          |
  |                        |                         |
  |                        |--- HTTP/2 + mTLS ------->|
  |                        |                         |
  |                        |<-- Response ------------|
  |                        |                         |
  |              [10] Response Transform             |
  |              [11] Metrics Emit                   |
  |              [12] Trace Span Close               |
  |                        |                         |
  |<--- HTTPS response -----|                         |
  |                        |                         |

Typical timing budget (p99 < 5ms gateway overhead):
  TLS resume:           ~0.1ms (session ticket)
  Plugin chain:         ~1.0ms (auth + rate limit)
  Route match:          ~0.1ms (trie)
  Upstream connect:     ~0.2ms (connection pool, reuse)
  Response processing:  ~0.1ms
  Total overhead:       ~1.5ms p50 / ~4ms p99
```

---

## 5. Deep Dive: API Gateway Fundamentals

The API Gateway is the single entry point for all external traffic. It enforces cross-cutting concerns uniformly without requiring every service to implement them independently.

### Cross-Cutting Concerns Handled at Gateway

```
Without Gateway:                    With Gateway:

Client --> Service A  [AuthN]       Client --> Gateway [AuthN, RateLimit,
Client --> Service B  [AuthN]                          Transform, Trace]
Client --> Service C  [AuthN]                 --> Service A
                                              --> Service B
Each service implements:                      --> Service C
  - Authentication
  - Rate limiting               Services implement only:
  - Logging                       - Business logic
  - Tracing
  - SSL
  = Code duplication, drift,
    inconsistency
```

### Gateway vs. Service Mesh: Complementary Roles

```
+-----------------------------------------------------+
|                 Responsibility Matrix               |
+------------------------+------------+---------------+
| Concern                | API Gateway| Service Mesh  |
+------------------------+------------+---------------+
| North-South traffic    |     YES    |      no       |
| (external → internal)  |            |               |
+------------------------+------------+---------------+
| East-West traffic      |     no     |      YES      |
| (service → service)    |            |               |
+------------------------+------------+---------------+
| AuthN (external)       |     YES    |      no       |
| mTLS (internal)        |     no     |      YES      |
+------------------------+------------+---------------+
| Rate limiting (client) |     YES    |    partial    |
+------------------------+------------+---------------+
| Load balancing (ext)   |     YES    |      YES      |
+------------------------+------------+---------------+
| Circuit breaker        |     YES    |      YES      |
+------------------------+------------+---------------+
| Request routing        |     YES    |      YES      |
+------------------------+------------+---------------+
| Canary deployments     |     YES    |      YES      |
+------------------------+------------+---------------+
| Observability          |     YES    |      YES      |
+------------------------+------------+---------------+
| Developer portal       |     YES    |      no       |
+------------------------+------------+---------------+
```

---

## 6. Deep Dive: Request Routing

### Route Matching Algorithm

The gateway uses a **trie-based router** for O(k) path matching (k = path segments). Routes are ordered by specificity, and the most specific match wins.

```
Routing Trie Example:

/
├── v1/
│   ├── users/
│   │   ├── :id          -> users-service (GET, PUT, DELETE)
│   │   └── :id/orders   -> orders-service (GET, POST)
│   ├── orders/
│   │   ├── (exact)      -> orders-service (GET, POST)
│   │   └── :id          -> orders-service (GET, PUT, DELETE)
│   └── products/
│       └── :id          -> catalog-service
└── v2/
    └── orders/          -> orders-v2-service (canary: 20%)
        └── :id          -> orders-v2-service

Priority (highest first):
  1. Exact path + exact method + header match
  2. Exact path + exact method
  3. Exact path (any method)
  4. Prefix path + exact method
  5. Prefix path (any method)
  6. Regex path (slowest, evaluated last)
```

### Path-Based Routing

```yaml
# Route all /v1/orders/* to orders service
routes:
  - name: orders-v1
    paths: ["/v1/orders", "/v1/orders/.*"]
    service: orders-service-v1
    strip_path: false
    methods: [GET, POST, PUT, DELETE]

  # Rewrite path before forwarding
  - name: legacy-compat
    paths: ["/api/(.*)"]
    service: modern-service
    path_handling: v1
    # /api/users/123 -> /users/123 (strip prefix)
```

### Header-Based Routing

```yaml
routes:
  # Route based on custom header (feature flags, A/B test)
  - name: orders-v2-beta
    paths: ["/v1/orders"]
    headers:
      X-Beta-User: ["true"]
      X-Version: ["2"]
    service: orders-service-v2
    priority: 100   # Higher priority wins

  # Hostname-based routing (multi-tenant)
  - name: tenant-a
    hosts: ["tenant-a.api.example.com"]
    service: tenant-a-service

  # Consumer-specific routing
  - name: partner-route
    paths: ["/v1/data"]
    headers:
      X-Consumer-Groups: ["partners"]
    service: partner-data-service
```

### Canary Deployments (Traffic Splitting)

```
Traffic Splitting Strategies:

1. Weighted (percentage-based):
   +--------+          +------------------+     80%   +-----------+
   | Client +--------->+ Gateway          +---------->+ v1 Service|
   +--------+          |                  |           +-----------+
                       | weight: v1=80%   |     20%   +-----------+
                       |         v2=20%   +---------->+ v2 Service|
                       +------------------+           +-----------+

2. Header-based (explicit opt-in):
   Request with X-Canary: true  -->  v2 (100%)
   Request without header  -->  v1 (100%)

3. Cookie-based (sticky sessions):
   Cookie canary=v2 set  -->  always v2
   No cookie             -->  v1 (may set cookie randomly for 5% of traffic)

4. Progressive rollout (automated):
   Day 0:  1% -> v2
   Day 1:  5% -> v2  (if error rate < 0.1%)
   Day 2: 20% -> v2
   Day 3: 50% -> v2
   Day 5:100% -> v2  (decommission v1)

Kong configuration:
plugins:
  - name: traffic-split
    config:
      upstreams:
        - weight: 80
          upstream: orders-v1
        - weight: 20
          upstream: orders-v2
```

---

## 7. Deep Dive: Authentication at the Gateway

### Authentication Strategies

```
+---------------------------------------------------------------------+
|                   Authentication Decision Tree                      |
+---------------------------------------------------------------------+
|                                                                     |
|  Incoming Request                                                   |
|        |                                                            |
|        v                                                            |
|  Has Authorization header?                                          |
|  +--- NO ---> Has API Key header/param? ---> YES --> [API Key Auth] |
|  |                    |                                             |
|  |                    NO --> Return 401 Unauthorized                |
|  |                                                                  |
|  YES                                                                |
|   |                                                                 |
|   +-- Bearer token? --> [JWT Validation]                           |
|   |                                                                 |
|   +-- Basic auth?   --> [API Key or User Auth]                     |
|   |                                                                 |
|   +-- OAuth2 token? --> [OAuth2 Introspection]                     |
|                                                                     |
+---------------------------------------------------------------------+
```

### API Key Authentication

```
Request Flow:
  Client                Gateway                Redis/DB
    |                      |                      |
    |-- GET /v1/orders      |                      |
    |   X-Api-Key: abc123 ->|                      |
    |                      |-- HGET api_keys:abc123|
    |                      |<- {consumer_id, ttl} -|
    |                      |                      |
    |                      | Validate:            |
    |                      |  - Key exists?       |
    |                      |  - Not revoked?      |
    |                      |  - Not expired?      |
    |                      |                      |
    |                      | Set context:         |
    |                      |  X-Consumer-ID       |
    |                      |  X-Consumer-Username |
    |                      |  X-Credential-ID     |
    |                      |                      |
    |                      |--- Forward request -->|
    |                      |   (with consumer ctx) |

API Key Storage:
  - Keys stored as PBKDF2 hash in DB (never plaintext)
  - First 8 chars (prefix) stored plaintext for UI display
  - Full key hashed and stored for lookup
  - Redis cache: 5-minute TTL to avoid DB on every request
```

### JWT Validation

```
JWT Validation Pipeline:

1. Extract token from Authorization: Bearer <token>
2. Base64-decode header: { "alg": "RS256", "kid": "key-2024-01" }
3. Lookup public key by kid from JWKS endpoint (cached)
4. Verify signature using public key
5. Validate standard claims:
   - exp: not expired
   - nbf: not before
   - iss: matches allowed issuers
   - aud: matches this gateway/service
6. Extract custom claims:
   - sub: consumer identifier
   - roles: ["admin", "user"]
   - tenant: "acme-corp"
7. Inject into upstream headers:
   X-JWT-Sub: user_12345
   X-JWT-Roles: admin,user
   X-JWT-Tenant: acme-corp

JWKS Caching Strategy:
  - Cache JWKS for 1 hour (refresh in background)
  - Rotate keys: keep 2 active (current + previous)
  - New key appears in JWKS 24h before old key expires
  - kid in JWT determines which key to use

JWT vs. API Key Trade-offs:
  JWT:
    + Self-contained (no DB lookup for claims)
    + Stateless validation
    + Carries authorization info (roles, tenant)
    - Cannot revoke before expiry (need short TTL + refresh token)
    - Larger payload
  API Key:
    + Simple to issue and revoke instantly
    + Works for server-to-server
    - Requires DB/cache lookup per request
    - No embedded claims (must lookup separately)
```

### OAuth2 Token Introspection

```
Flow (active token validation):

Client App       Gateway           Auth Server         Upstream
   |                |                   |                  |
   |-- API request  |                   |                  |
   |  Bearer: xyz ->|                   |                  |
   |                |-- POST /introspect |                  |
   |                |  token=xyz ------->|                  |
   |                |<- { active: true, |                  |
   |                |    sub: u123,     |                  |
   |                |    scope: "read", |                  |
   |                |    exp: 1709504400}                   |
   |                |                   |                  |
   |                | Cache result for  |                  |
   |                | min(TTL, 30s)     |                  |
   |                |                   |                  |
   |                |--- Forward + ctx headers ------------>|
   |<-------------------------------------------response---|

Cache key: hash(token)  TTL: min(token_exp - now, 30s)
```

---

## 8. Deep Dive: Rate Limiting

### Sliding Window Algorithm with Redis

```
Sliding Window Counter Algorithm:

Window size: 60 seconds
Limit: 1000 requests per consumer per minute

At time T = 100.5s, incoming request from consumer C:

Current window: [60, 120)  → key = "rl:C:60"
Previous window: [0, 60)   → key = "rl:C:0"

Current window count:   current_count  = GET rl:C:60  = 600
Previous window count:  previous_count = GET rl:C:0   = 800

Elapsed in current window: 100.5 - 60 = 40.5s
Previous window weight: (60 - 40.5) / 60 = 0.325

Estimated count = previous_count * 0.325 + current_count
                = 800 * 0.325 + 600
                = 260 + 600
                = 860

860 < 1000 → ALLOW

Redis Lua script (atomic):
  local key = KEYS[1]              -- rl:{consumer}:{window_start}
  local limit = tonumber(ARGV[1])
  local window = tonumber(ARGV[2])
  local now = tonumber(ARGV[3])
  local prev_key = KEYS[2]         -- previous window key

  local cur = tonumber(redis.call('GET', key) or 0)
  local prev = tonumber(redis.call('GET', prev_key) or 0)
  local elapsed = now % window
  local estimated = math.floor(prev * (window - elapsed) / window) + cur

  if estimated >= limit then
    return { 0, estimated, limit }  -- REJECT
  end

  redis.call('INCR', key)
  redis.call('EXPIRE', key, window * 2)
  return { 1, estimated + 1, limit }  -- ALLOW
```

### Rate Limit Tiers and Responses

```
Rate Limit Headers:
  X-RateLimit-Limit: 1000          -- configured limit
  X-RateLimit-Remaining: 140       -- remaining in current window
  X-RateLimit-Reset: 1709500860    -- unix epoch when window resets
  Retry-After: 42                  -- seconds until retry (only on 429)

Status Codes:
  200 OK          -- within limit
  429 Too Many Requests -- hard limit exceeded, full rejection
  503 Service Unavailable -- global overload (shed load)

Multi-Dimensional Rate Limiting:
  Tier 1 (most granular):  per consumer + per endpoint
    "consumer X can call GET /v1/orders 100/min"
  Tier 2:                  per consumer + per service
    "consumer X can call orders-service 500/min total"
  Tier 3 (least granular): per consumer (global)
    "consumer X can make 2000 req/min across all services"
  Tier 4:                  per IP (DDoS protection)
    "IP 1.2.3.4 can make 5000 req/min"

All tiers evaluated; first breach triggers 429.

Rate Limit Policy Matrix:
+------------------+----------+----------+-----------+
| Consumer Tier    | /min     | /hr      | /day      |
+------------------+----------+----------+-----------+
| Free             |     100  |   1,000  |   10,000  |
| Developer        |   1,000  |  20,000  |  100,000  |
| Business         |  10,000  | 200,000  | 1,000,000 |
| Enterprise       | Unlimited| Unlimited| Custom    |
+------------------+----------+----------+-----------+
```

---

## 9. Deep Dive: Request/Response Transformation

### Header Manipulation

```yaml
# Plugin configuration for request transformation
plugins:
  - name: request-transformer
    config:
      add:
        headers:
          - "X-Consumer-ID: $(consumer.id)"
          - "X-Forwarded-For: $(client.ip)"
          - "X-Request-ID: $(uuid())"
          - "X-Trace-ID: $(trace.id)"
        querystring: []
        body: []
      remove:
        headers:
          - "Authorization"          # Strip credentials before forwarding
          - "X-Internal-Debug"       # Remove debug headers from external requests
      replace:
        headers:
          - "Host: internal.orders.svc"
      rename:
        headers:
          - "X-Legacy-Auth: X-Service-Token"

  - name: response-transformer
    config:
      add:
        headers:
          - "X-Kong-Upstream-Latency: $(upstream_response_time)"
          - "X-Kong-Proxy-Latency: $(proxy_latency)"
      remove:
        headers:
          - "Server"                 # Hide upstream server identity
          - "X-Powered-By"
          - "Via"
```

### Protocol Translation: REST to gRPC

```
REST → gRPC Translation Layer:

Client (REST)          Gateway              gRPC Service
  |                       |                      |
  |-- POST /v1/users       |                      |
  |   Content-Type:        |                      |
  |   application/json  -->|                      |
  |   { "name": "Alice",   |                      |
  |     "email": "a@b.c" } |                      |
  |                        |                      |
  |                    Transcode:                  |
  |                    1. Parse JSON body         |
  |                    2. Map to proto message     |
  |                       CreateUserRequest {     |
  |                         name = "Alice"        |
  |                         email = "a@b.c"       |
  |                       }                       |
  |                    3. Serialize to protobuf   |
  |                    4. Set gRPC metadata:      |
  |                       :method POST            |
  |                       content-type:           |
  |                         application/grpc      |
  |                        |                      |
  |                        |-- gRPC CreateUser -->|
  |                        |   (HTTP/2 + proto)   |
  |                        |                      |
  |                        |<-- CreateUserResp ----|
  |                        |   { user_id: "u123" } |
  |                        |                      |
  |                    Transcode back:            |
  |                    1. Deserialize proto       |
  |                    2. Marshal to JSON         |
  |                    3. Set Content-Type:       |
  |                       application/json        |
  |                    4. Map gRPC status to HTTP |
  |                       OK(0) → 200             |
  |                       NOT_FOUND(5) → 404      |
  |                       INVALID_ARG(3) → 400    |
  |<-- 201 Created --------|                      |
  |   { "userId": "u123" } |                      |

gRPC Status → HTTP Status Mapping:
  OK              → 200
  CANCELLED       → 499
  INVALID_ARGUMENT→ 400
  NOT_FOUND       → 404
  ALREADY_EXISTS  → 409
  PERMISSION_DENIED→403
  UNAUTHENTICATED → 401
  RESOURCE_EXHAUSTED→429
  INTERNAL        → 500
  UNAVAILABLE     → 503
  DEADLINE_EXCEEDED→504
```

---

## 10. Deep Dive: Circuit Breaker

### State Machine

```
Circuit Breaker State Machine:

       All requests pass through
            (monitoring)
+-----------------------------------+
|                                   |
|           CLOSED                  |
|     (Normal Operation)            |
|                                   |
+-----------------------------------+
          |           ^
          |           |
   failure_threshold  | success in
   exceeded           | HALF_OPEN
          |           |
          v           |
+-----------------------------------+
|                                   |
|            OPEN                   |
|  (Fail Fast - reject all          |
|   requests immediately)           |
|                                   |
+-----------------------------------+
          |
          | reset_timeout elapsed
          | (e.g., 30 seconds)
          |
          v
+-----------------------------------+
|                                   |
|          HALF-OPEN                |
|  (Allow 1 probe request;          |
|   success → CLOSED                |
|   failure → OPEN again)           |
|                                   |
+-----------------------------------+

Configuration Parameters:
  failure_threshold: 50%      -- error rate to open
  min_requests:      20       -- minimum requests before checking
  evaluation_window: 10s      -- rolling window for error rate
  open_duration:     30s      -- how long to stay open
  half_open_probes:  3        -- requests to allow in half-open

Circuit Breaker per Target:
  service: orders
  instances:
    10.0.1.5:8080  → CLOSED  (errors: 2/100 = 2%)
    10.0.1.6:8080  → OPEN    (errors: 60/100 = 60%) ← isolated!
    10.0.1.7:8080  → CLOSED  (errors: 1/100 = 1%)

When target is OPEN:
  → Remove from load balancer pool
  → Route to remaining healthy instances
  → Probe every 30s
  → Re-add on success

Bulkhead Pattern (companion to circuit breaker):
  Limit concurrent connections per upstream:
    orders-service: max 500 concurrent requests
    payments-service: max 100 concurrent requests
  If limit exceeded: return 503 immediately (fail fast)
  Prevents one slow service from exhausting all gateway threads
```

---

## 11. Deep Dive: Load Balancing Algorithms

### Comparison of Algorithms

```
Round Robin (default):
  Requests: 1  2  3  4  5  6
  Target A: 1     3     5
  Target B:    2     4     6

  Pro: Simple, even distribution (if all targets are equal)
  Con: Ignores target capacity/latency

Weighted Round Robin:
  Weights: A=3, B=1
  Requests: 1  2  3  4  5  6  7  8
  Target A: 1  2  3     5  6  7
  Target B:          4           8

  Use case: A has 3x the resources of B

Least Connections:
  Current connections: A=42, B=18, C=31
  New request → goes to B (fewest connections)

  Pro: Respects actual server load
  Con: Requires connection count state; slightly more overhead

Least Response Time (Envoy: LEAST_REQUEST with p2c):
  Pick 2 random targets, send to the one with fewer active requests
  Uses Power of Two Choices (p2c) for O(1) selection

  Pro: Approximates least connections without global state
  Con: Approximate, not exact

Consistent Hashing (for stateful services):
  Hash key: client IP, user ID, session cookie
  Maps to a position on a virtual ring
  Target owning that ring position handles the request

  +------+------+------+------+------+------+
  | A    |  B   |  C   |  A   |  B   |  C   |
  +------+------+------+------+------+------+
  0     60     120    180    240    300    360

  hash(client_ip) mod 360 → find target

  On target add/remove: only ~1/N keys remap

  Use case: session affinity, cache warming, sharding

IP Hash (simpler sticky session):
  hash(client_ip) mod N → target index
  Problem: doesn't rebalance on failover
  Better: consistent hashing

Random with Two Choices (p2c):
  Select 2 random targets → forward to less loaded one
  Approaches optimal distribution in O(log log N) time
```

### Health Check Integration with Load Balancer

```
Active Health Check:
  Gateway probes /healthz every 10s
  2 consecutive successes → mark HEALTHY → add to pool
  3 consecutive failures  → mark UNHEALTHY → remove from pool

Passive (circuit breaker) Health Check:
  Monitor actual traffic errors
  HTTP 5xx rate > 50% over 10s → mark UNHEALTHY

Health Check Priority:
  1. Passive (immediate, based on real traffic)
  2. Active (periodic, for recovery detection)

Load Balancer + Health Check integration:
+-------------+    healthy targets    +---------------+
| Health      +--------------------->+ Load Balancer |
| Checker     |                      | Pool          |
+------+------+                      +-------+-------+
       |                                     |
       | active probes                       | select target
       v                                     v
  +----+----+  +----+----+  +----+----+  +--+------+
  | A:8080  |  | B:8080  |  | C:8080  |  | Request |
  | HEALTHY |  |UNHEALTHY|  | HEALTHY |  |         |
  +----+----+  +----+----+  +----+----+  +---------+
       |            |            |
  serving OK   passive CB    serving OK
               opened it
```

---

## 12. Deep Dive: Retry and Timeout Policies

### Retry Budget

```
Naive Retry Problem:
  10 services, each retries 3x
  A single slow call triggers:
    10 services * 3 retries = up to 30 upstream calls
  → Retry storm amplifies load on already-overloaded service

Retry Budget Solution:
  Each service has a retry budget: max 10% of requests can be retries

  budget_remaining = budget_size - retry_count_in_window
  if budget_remaining <= 0:
    FAIL FAST, do not retry

  Budget replenishes over time (token bucket)
  Prevents cascading retry storms

Retry Configuration:
retries:
  num_retries: 3
  retry_on:
    - connect-failure
    - retriable-4xx    # 429 Too Many Requests
    - 5xx              # Any 5xx from upstream
    - gateway-error    # 502, 503, 504
    - reset            # TCP reset
  per_try_timeout: 5s
  retry_back_off:
    base_interval: 100ms
    max_interval:  2s
    # Actual delay: min(base * 2^attempt + jitter, max)
    # Attempt 0: 100ms + rand(0,100ms) ~= 150ms
    # Attempt 1: 200ms + rand(0,200ms) ~= 300ms
    # Attempt 2: 400ms + rand(0,400ms) ~= 600ms
  retry_budget:
    budget_percent: 10   # Max 10% of requests can be retries
    min_retry_concurrency: 3

Do NOT retry on:
  - POST, PUT, PATCH (non-idempotent, unless service guarantees idempotency)
  - 401, 403 (auth failures — retrying won't help)
  - 400 (bad request — retrying won't help)
  - Request body already partially sent
```

### Deadline Propagation

```
Deadline Propagation (Prevents partial success):

Client sets deadline: 500ms total request time

+--------+  deadline: 500ms   +----------+  remaining: 480ms  +---------+
| Client +-------------------->| Gateway  +------------------->| Service |
|        |                     |          |                    |    A    |
|        |                     | elapsed: |                    |         |
|        |                     | ~20ms    |  remaining: 400ms  +---------+
|        |                     |          +------------------->| Service |
|        |                     |          |                    |    B    |
|        |                     |          |                    +---------+
|        |<-- 504 Gateway      |          |
|        |    Timeout ---------|          | deadline reached
+--------+                     +----------+

Headers for propagation:
  grpc-timeout: 480m       (gRPC native)
  X-Envoy-Expected-RQ-Timeout-Ms: 480   (Envoy)
  X-Request-Deadline: 2024-03-01T00:00:00.480Z (custom)

Service B MUST:
  1. Read remaining deadline from header
  2. Set its own internal timeout accordingly
  3. Cancel in-flight work if deadline exceeded
  4. Return DEADLINE_EXCEEDED (gRPC) or 504 (HTTP)

  This prevents "orphaned" work: a backend doing expensive computation
  for a request the client already gave up on.
```

---

## 13. Deep Dive: Service Discovery

### DNS-Based Discovery

```
DNS-Based Service Discovery:

Kubernetes CoreDNS:
  Service name: orders-service
  DNS record:   orders-service.default.svc.cluster.local
  Resolves to:  ClusterIP (virtual IP → kube-proxy → actual pods)

  Headless service (direct pod IPs):
  DNS record: orders-service.default.svc.cluster.local
  Returns:    A records for all pod IPs
              10.0.1.5, 10.0.1.6, 10.0.1.7

  Client-side load balancing:
    Gateway resolves DNS → gets multiple IPs → applies LB algorithm
    DNS TTL: 5 seconds (fast failover)

+------------+       DNS query         +-----------+
| Gateway    +----------------------->| CoreDNS   |
| Node       |                        | (Kube DNS)|
|            |<-- [10.0.1.5,          +-----------+
|            |     10.0.1.6,
|            |     10.0.1.7]
|            |
|            | Round-robin / LB
|            +------+------+------+
|            |      |      |      |
|         Pod1   Pod2   Pod3   (new pod added automatically)
+------------+
```

### Registry-Based Discovery (Consul / etcd)

```
Consul Service Discovery:

Registration (at service startup):
  POST http://consul:8500/v1/agent/service/register
  {
    "ID": "orders-10.0.1.5-8080",
    "Name": "orders",
    "Address": "10.0.1.5",
    "Port": 8080,
    "Tags": ["v2", "canary"],
    "Check": {
      "HTTP": "http://10.0.1.5:8080/healthz",
      "Interval": "10s",
      "DeregisterCriticalServiceAfter": "30s"
    }
  }

Discovery (by gateway):
  GET http://consul:8500/v1/health/service/orders?passing=true
  Response: [
    { "Service": { "Address": "10.0.1.5", "Port": 8080 }, "Checks": [...PASSING...] },
    { "Service": { "Address": "10.0.1.7", "Port": 8080 }, "Checks": [...PASSING...] }
    # 10.0.1.6 omitted because health check is failing
  ]

Blocking queries (long-poll for change notification):
  GET /v1/health/service/orders?passing=true&index=12345&wait=30s
  Returns immediately when index changes (new instance, health change)
  Gateway updates its pool within milliseconds

Gateway Consul Integration:
+-------------+    register    +----------+    poll changes   +------------+
| Service Pod +-------------->+  Consul  +<------------------+ Gateway    |
| (startup)   |               | Registry |                   | (watches)  |
+------+------+               +-----+----+                   +------+-----+
       |                            |                                |
       | deregister                 |  notify                        |
       | (shutdown)                 |  (index bump)                  |
       +--------------------------->+-------------------------------->|
                                                              Update LB pool
```

---

## 14. Deep Dive: Service Mesh (Envoy Sidecar)

### Data Plane vs. Control Plane

```
Service Mesh Architecture:

+======================================================================+
|                         CONTROL PLANE                               |
|                                                                      |
|  +----------------+  +------------------+  +--------------------+   |
|  | Pilot (xDS)    |  | Citadel (certs)  |  | Galley (config)    |   |
|  |                |  |                  |  |                    |   |
|  | Pushes:        |  | Issues SVID      |  | Validates and      |   |
|  |  - LDS         |  | (SPIFFE certs)   |  | ingests config     |   |
|  |  - RDS         |  | to every         |  | from k8s API       |   |
|  |  - CDS         |  | workload         |  |                    |   |
|  |  - EDS         |  |                  |  |                    |   |
|  +-------+--------+  +--------+---------+  +--------------------+   |
|          | xDS over gRPC      | cert push                           |
+======================================================================+
           |                    |
           | xDS stream         | cert delivery (SDS)
           |                    |
+======================================================================+
|                          DATA PLANE                                 |
|                                                                      |
|  Pod A                         Pod B                                |
|  +-------------------------+   +-------------------------+          |
|  |  +-------------------+  |   |  +-------------------+  |          |
|  |  |   App Container   |  |   |  |   App Container   |  |          |
|  |  |   :8080           |  |   |  |   :8080           |  |          |
|  |  +---+--+------------+  |   |  +---+--+------------+  |          |
|  |      |  ^               |   |      |  ^               |          |
|  |  loopback (iptables     |   |  loopback (iptables     |          |
|  |  redirects all traffic) |   |  redirects all traffic) |          |
|  |      |  |               |   |      |  |               |          |
|  |  +---v--+------------+  |   |  +---v--+------------+  |          |
|  |  | Envoy Sidecar     |  |   |  | Envoy Sidecar     |  |          |
|  |  | :15001 (outbound) |  |   |  | :15001 (outbound) |  |          |
|  |  | :15006 (inbound)  |  |   |  | :15006 (inbound)  |  |          |
|  |  | :15090 (metrics)  |  |   |  | :15090 (metrics)  |  |          |
|  |  +---+---------------+  |   |  +---+---------------+  |          |
|  +------|------------------+   +------|------------------+          |
|         |  mTLS (SPIFFE)              |                             |
|         +-----------------------------+                             |
+======================================================================+

Traffic interception (iptables):
  All outbound traffic redirected to Envoy :15001
  All inbound traffic redirected to Envoy :15006
  Envoy applies policy BEFORE forwarding to app
  App never touches the network directly
```

### Envoy xDS API

```
xDS (x Discovery Service) Protocol:

LDS - Listener Discovery Service:
  Defines what ports Envoy listens on
  Each listener has a filter chain (HTTP, TCP, TLS)

RDS - Route Discovery Service:
  Virtual host to cluster routing rules
  Canary weights, header matching

CDS - Cluster Discovery Service:
  Upstream cluster definitions
  LB policy, circuit breaker thresholds

EDS - Endpoint Discovery Service:
  Actual IP:port for each cluster member
  Zone-aware load balancing hints

SDS - Secret Discovery Service:
  TLS certificates and private keys
  Pushed to sidecars dynamically (no restarts for rotation)

xDS Push Flow:
  1. Operator creates VirtualService (Istio CRD)
  2. Galley validates and stores in etcd
  3. Pilot watches etcd, detects change
  4. Pilot translates to xDS protobuf
  5. Pilot pushes delta to all affected sidecar streams
  6. Sidecar applies new config (atomic swap, zero downtime)

  Total time from CRD apply to sidecar effect: < 1 second
```

---

## 15. Deep Dive: mTLS and Zero-Trust

### Certificate Lifecycle

```
SPIFFE / SPIRE Architecture:

SPIFFE Identity:
  Format: spiffe://<trust-domain>/<workload-path>
  Example: spiffe://example.com/ns/default/sa/orders-service

Certificate Issuance:
  +----------+                +----------+              +--------+
  | SPIRE    |                | SPIRE    |              | Envoy  |
  | Server   |                | Agent    |              | Sidecar|
  |(Control  |                |(Node-    |              |(Pod)   |
  | plane)   |                | level)   |              |        |
  +----+-----+                +----+-----+              +---+----+
       |                           |                        |
       |  <-- Attest agent         |                        |
       |      (TPM / k8s token)    |                        |
       |                           |                        |
       |  --> Agent SVID           |                        |
       |      (short-lived)        |<-- Attest workload     |
       |                           |    (k8s pod SA token)  |
       |                           |                        |
       |  <----- Issue workload SVID (SPIFFE cert) -------->|
       |                                                     |
       |  Auto-rotation every 1 hour                        |
       |  (30 min before expiry, renew silently)            |

mTLS Handshake between services:
  Service A (client)              Service B (server)
       |                               |
       |-- ClientHello (TLS 1.3) ----->|
       |<-- ServerHello                |
       |<-- Certificate (SVID B) ------|
       |<-- CertificateRequest --------|  ← mutual: server demands client cert
       |-- Certificate (SVID A) ------>|
       |-- CertificateVerify --------->|
       |<-- Finished (session keys) ---|
       |-- Finished ------------------->|
       |                               |
       | Verify:                       | Verify:
       | - B's cert signed by          | - A's cert signed by
       |   trusted CA?                 |   trusted CA?
       | - B's SPIFFE ID               | - A's SPIFFE ID in
       |   matches expected service?   |   authorized list?
                                       |   (AuthorizationPolicy)

Zero-Trust Authorization (Istio AuthorizationPolicy):
  apiVersion: security.istio.io/v1beta1
  kind: AuthorizationPolicy
  metadata:
    name: orders-authz
  spec:
    selector:
      matchLabels:
        app: orders
    rules:
    - from:
      - source:
          principals:
          - "cluster.local/ns/default/sa/api-gateway"
          - "cluster.local/ns/default/sa/checkout-service"
      to:
      - operation:
          methods: ["GET", "POST"]
          paths: ["/v1/orders", "/v1/orders/*"]
    # Any other source → DENIED (default deny)
```

---

## 16. Deep Dive: Observability (Tracing, Metrics, Logs)

### Distributed Tracing

```
W3C Trace Context Propagation:

Client          Gateway            Service A         Service B
  |                |                    |                  |
  |-- Request ----->|                   |                  |
  |                | Generate:          |                  |
  |                | traceparent:       |                  |
  |                | 00-4bf92f3577-     |                  |
  |                | b7ad6b7169203331-01|                  |
  |                |                   |                  |
  |                |-- Forward + header->                  |
  |                |                   |-- Call Service B  |
  |                |                   |  (propagate header)|
  |                |                   |                  |
  |                |                   |<-- Response ------|
  |                |<-- Response -------|                  |
  |<-- Response ----|                  |                  |

Trace: One per request (end-to-end)
Span:  One per service hop

traceparent header format:
  00-{trace-id-16bytes}-{parent-span-id-8bytes}-{flags}
  00-4bf92f3577b3b43b-b7ad6b7169203331-01
      ^trace ID 128-bit ^span ID 64-bit  ^sampled

Sampling Strategy:
  Head-based sampling (at gateway): 1% of traffic
  Tail-based sampling (collector): 100% of requests with errors or high latency

  Priority: error > high latency (>1s) > random sample

Jaeger / Zipkin Integration:
  +----------+    spans    +-------------------+    store   +----------+
  | Envoy    +------------>| OpenTelemetry     +----------->| Jaeger   |
  | Sidecar  |             | Collector         |            | Backend  |
  | (emits   |             | (batches, samples,|            |          |
  |  spans)  |             |  routes to stores)|            +----+-----+
  +----------+             +-------------------+                 |
                                                           +-----------+
                                                           | Jaeger UI |
                                                           | (query,   |
                                                           |  trace    |
                                                           |  explorer)|
                                                           +-----------+
```

### Metrics (RED Method)

```
RED Method per Service:
  R - Rate:   Requests per second
  E - Errors: Error rate (4xx, 5xx)
  D - Duration: Latency distribution (p50, p95, p99)

Key Prometheus Metrics:
  # Rate
  envoy_cluster_upstream_rq_total
  envoy_cluster_upstream_rq_completed

  # Errors
  envoy_cluster_upstream_rq_5xx
  envoy_cluster_upstream_rq_4xx
  envoy_cluster_upstream_rq_retry
  envoy_cluster_upstream_rq_retry_overflow  ← circuit breaker rejections

  # Duration
  envoy_cluster_upstream_rq_time_bucket  ← histogram

  # Saturation
  envoy_cluster_upstream_cx_active         ← active connections
  envoy_cluster_upstream_rq_pending_active ← queued requests
  envoy_cluster_upstream_cx_overflow       ← connection pool exhausted

Alerting Rules:
  - Error rate > 1% for 5 minutes → PagerDuty P2
  - Error rate > 5% for 2 minutes → PagerDuty P1
  - p99 latency > 1 second       → PagerDuty P2
  - Circuit breaker OPEN on any service → PagerDuty P1
  - Rate limit rejections > 1000/min → Slack warning
```

### Structured Access Logs

```json
{
  "timestamp": "2024-03-01T12:00:00.123Z",
  "trace_id": "4bf92f3577b3b43b",
  "span_id": "b7ad6b7169203331",
  "request": {
    "method": "POST",
    "path": "/v1/orders",
    "host": "api.example.com",
    "size_bytes": 1024,
    "user_agent": "MyApp/2.1"
  },
  "response": {
    "status_code": 201,
    "size_bytes": 512
  },
  "upstream": {
    "service": "orders-service",
    "cluster": "orders-v2",
    "host": "10.0.1.5:8080",
    "latency_ms": 42
  },
  "gateway": {
    "node": "kong-us-east-1-03",
    "latency_ms": 3,
    "route": "orders-post-route"
  },
  "auth": {
    "consumer_id": "cns_abc123",
    "consumer_username": "partner-app",
    "credential_type": "jwt"
  },
  "rate_limit": {
    "limit": 1000,
    "remaining": 847,
    "window": "minute"
  }
}
```

---

## 17. Deep Dive: API Versioning

### URL Path Versioning (Recommended)

```
URL Path Versioning:
  /v1/orders      → orders-service-v1
  /v2/orders      → orders-service-v2 (new contract)

  Pros:
    + Explicit, visible in logs and bookmarks
    + Easy to route at gateway with exact path match
    + Easy to deprecate: gateway returns 410 Gone for /v0/
    + Cache-friendly (different URLs = different cache keys)

  Cons:
    - URL "pollution"
    - Clients must update URLs

  Deprecation Policy:
    Version announced: Jan 1, 2024
    Version deprecated: Jul 1, 2024 (6 months notice)
    Response header added: Deprecation: true, Sunset: Sat, 01 Jan 2025 00:00:00 GMT
    Version sunset: Jan 1, 2025 → gateway returns 410 Gone

Gateway config for deprecation:
  - name: v1-sunset
    paths: ["/v1/.*"]
    response_transformer:
      add_headers:
        Deprecation: "true"
        Sunset: "Sat, 01 Jan 2025 00:00:00 GMT"
        Link: '</v2/orders>; rel="successor-version"'
```

### Header-Based Versioning

```
Header-Based Versioning:
  GET /orders
  Accept: application/vnd.example.orders+json; version=2

  Pros:
    + Clean URLs
    + Semantically correct (versioning content type)

  Cons:
    - Not visible in browser address bar
    - Harder to test (need to set headers)
    - Caching requires Vary: Accept header

Gateway routing by Accept header:
  routes:
    - name: orders-v2-accept
      paths: ["/orders"]
      headers:
        Accept: ["application/vnd.example.orders+json; version=2"]
      service: orders-v2
      priority: 100

    - name: orders-v1-default
      paths: ["/orders"]
      service: orders-v1
      priority: 0
```

---

## 18. Deep Dive: Plugin/Middleware Architecture

### Filter Chain (Kong / Envoy)

```
Envoy HTTP Filter Chain:

Inbound Request:
  +--------------------------------------------------------------------+
  | [1] JWT Auth Filter          parse + verify JWT, extract claims   |
  +--------------------------------------------------------------------+
  | [2] RBAC Filter              check claims vs. policy              |
  +--------------------------------------------------------------------+
  | [3] Rate Limit Filter        check Redis counter, update          |
  +--------------------------------------------------------------------+
  | [4] Header Manipulation      add X-Consumer-ID, strip auth header |
  +--------------------------------------------------------------------+
  | [5] gRPC-JSON Transcoder     REST → gRPC if upstream uses gRPC    |
  +--------------------------------------------------------------------+
  | [6] Router Filter            route to upstream cluster (LAST)     |
  +--------------------------------------------------------------------+
                 |
           Upstream service

Outbound Response (reverse order):
  +--------------------------------------------------------------------+
  | [6] Router                  return response from upstream         |
  +--------------------------------------------------------------------+
  | [5] gRPC-JSON Transcoder    gRPC → REST response body             |
  +--------------------------------------------------------------------+
  | [4] Header Manipulation     remove internal headers               |
  +--------------------------------------------------------------------+
  | [3] Rate Limit              add X-RateLimit-Remaining headers     |
  +--------------------------------------------------------------------+
  | [2] RBAC                    no-op on response                     |
  +--------------------------------------------------------------------+
  | [1] JWT Auth                no-op on response                     |
  +--------------------------------------------------------------------+
                 |
           Client response

Kong Plugin Phases (Lua/Go plugins):
  - init_worker  : once per nginx worker start
  - certificate  : during TLS handshake
  - rewrite      : before routing (path rewrite)
  - access       : after routing (auth, rate limit)
  - header_filter: after upstream response received
  - body_filter  : stream response body
  - log          : async after response sent (non-blocking)

Plugin Lifecycle (per request):
  +------------+   +------------+   +------------+   +------------+
  | rewrite    +-->| access     +-->| proxy_pass +-->|header_filter|
  | phase      |   | phase      |   | upstream   |   | phase      |
  | (path fix) |   | (auth, RL) |   |            |   | (add hdrs) |
  +------------+   +------------+   +------------+   +----+-------+
                                                           |
                                                     +-----v------+
                                                     | body_filter|
                                                     | (stream)   |
                                                     +-----+------+
                                                           |
                                                     +-----v------+
                                                     |  log phase |
                                                     | (async)    |
                                                     +------------+
```

### Custom Plugin Development (Kong Go Plugin)

```go
// Example: Custom Request ID Plugin
package main

import (
    "github.com/Kong/go-pdk"
    "github.com/google/uuid"
)

type Config struct {
    HeaderName string `json:"header_name"`
}

func New() interface{} {
    return &Config{HeaderName: "X-Request-ID"}
}

func (c *Config) Access(kong *pdk.PDK) {
    // Check if request already has an ID (from client)
    existingID, _ := kong.Request.GetHeader(c.HeaderName)
    if existingID != "" {
        // Validate format, then pass through
        kong.ServiceRequest.SetHeader(c.HeaderName, existingID)
        return
    }
    // Generate new ID and inject into upstream request
    newID := uuid.New().String()
    kong.ServiceRequest.SetHeader(c.HeaderName, newID)
}

func (c *Config) HeaderFilter(kong *pdk.PDK) {
    // Echo the ID back to client in response
    id, _ := kong.ServiceRequest.GetHeader(c.HeaderName)
    kong.Response.SetHeader(c.HeaderName, id)
}
```

---

## 19. Deep Dive: Comparison — Kong vs Envoy vs Nginx vs AWS API Gateway vs Istio

### Feature Comparison Matrix

```
+-----------------------------+--------+--------+--------+--------+--------+
| Feature                     |  Kong  | Envoy  | Nginx  | AWS GW | Istio  |
+-----------------------------+--------+--------+--------+--------+--------+
| Primary role                |Gateway |  Proxy |  Web/  |Gateway | Mesh   |
|                             |        | /Mesh  | Proxy  |        |        |
+-----------------------------+--------+--------+--------+--------+--------+
| Configuration               |  DB /  |  xDS   | Config |Console/| CRDs   |
|                             |  API   |  API   |  File  |  TF    |        |
+-----------------------------+--------+--------+--------+--------+--------+
| Plugin / extension          | Lua/Go |  Wasm  |  Lua   |Lambda/ |  Wasm  |
|                             |plugins |filters |modules | Custom |filters |
+-----------------------------+--------+--------+--------+--------+--------+
| Load balancing              |  YES   |  YES   |  YES   |  YES   |  YES   |
+-----------------------------+--------+--------+--------+--------+--------+
| Circuit breaker             |  YES   |  YES   |  NO    |  YES   |  YES   |
+-----------------------------+--------+--------+--------+--------+--------+
| Rate limiting               |  YES   |  YES   | partial|  YES   | partial|
+-----------------------------+--------+--------+--------+--------+--------+
| Auth (JWT/API Key/OAuth)    |  YES   |partial |partial |  YES   |partial |
+-----------------------------+--------+--------+--------+--------+--------+
| mTLS                        |  YES   |  YES   |  YES   |  NO    |  YES   |
+-----------------------------+--------+--------+--------+--------+--------+
| gRPC / WebSocket            |  YES   |  YES   |  YES   |  YES   |  YES   |
+-----------------------------+--------+--------+--------+--------+--------+
| Service discovery           | Consul | xDS/   |  DNS   |  AWS   |  xDS   |
|                             | / DNS  | Consul |        |  ECS   |        |
+-----------------------------+--------+--------+--------+--------+--------+
| Distributed tracing         |  YES   |  YES   |partial |  YES   |  YES   |
+-----------------------------+--------+--------+--------+--------+--------+
| Developer portal            |  YES   |  NO    |  NO    |  YES   |  NO    |
+-----------------------------+--------+--------+--------+--------+--------+
| East-West (service mesh)    | limited|  YES   |  NO    |  NO    |  YES   |
+-----------------------------+--------+--------+--------+--------+--------+
| Performance (RPS/node)      | ~100K  | ~200K  | ~300K  |managed | ~200K  |
+-----------------------------+--------+--------+--------+--------+--------+
| Latency added (p99)         | ~2ms   | ~1ms   | ~0.5ms |~5-10ms | ~2ms   |
+-----------------------------+--------+--------+--------+--------+--------+
| Operational complexity      | Medium | High   |  Low   |  Low   |  High  |
+-----------------------------+--------+--------+--------+--------+--------+
| Cost model                  | OSS/   |  OSS   |  OSS/  |  Pay/  | OSS/   |
|                             | Ent.   |        | Plus   |  req   | Ent.   |
+-----------------------------+--------+--------+--------+--------+--------+
| Best for                    |API Mgt |High-   | Simple |Serverl-|Full    |
|                             |+ Devs  | perf   |proxy   |ess/AWS |mesh    |
+-----------------------------+--------+--------+--------+--------+--------+
```

### Decision Guide

```
Choose Kong when:
  - You need a full API management platform (developer portal, analytics)
  - Non-technical teams need to manage routes and plugins via UI
  - Rich plugin ecosystem (100+ plugins) out of the box
  - Hybrid deployment (on-prem + cloud)

Choose Envoy when:
  - Maximum performance and extensibility (Wasm filters)
  - Building a custom control plane
  - Used as the data plane of a service mesh (Istio uses Envoy)
  - Deep gRPC/HTTP2 support required

Choose Nginx when:
  - Simple reverse proxy / static file serving
  - Highest raw throughput
  - Minimal infrastructure (no control plane needed)
  - Legacy integration (modules, config familiarity)

Choose AWS API Gateway when:
  - Full AWS stack (Lambda, Cognito, WAF integration)
  - No operational overhead desired (fully managed)
  - Low to medium traffic (cost scales per request)
  - Rapid prototyping

Choose Istio when:
  - Kubernetes-native service mesh required
  - Complete east-west traffic control (mTLS, RBAC, retries)
  - Multi-cluster / multi-cloud mesh
  - Advanced traffic management (canary, fault injection for chaos testing)
  - Zero-trust security model mandatory

Common combination:
  Kong (north-south) + Istio (east-west)
  = Best of both worlds: rich API management + service mesh
```

---

## 20. Scaling Strategy

### Horizontal Scaling of Gateway Nodes

```
Scaling Architecture:

Stateless Gateway Nodes:
  - All route/plugin config served from shared DB (PostgreSQL) or cache
  - Rate limit state in shared Redis cluster
  - No session affinity needed (each node is identical)

  Scale out: add nodes, update load balancer target group
  Scale in:  drain connections (let in-flight complete), remove from LB

Auto-scaling Policy (Kubernetes HPA):
  apiVersion: autoscaling/v2
  kind: HorizontalPodAutoscaler
  spec:
    scaleTargetRef: { name: kong-gateway }
    minReplicas: 10
    maxReplicas: 100
    metrics:
      - type: Resource
        resource:
          name: cpu
          target: { type: Utilization, averageUtilization: 60 }
      - type: Pods
        pods:
          metric: { name: kong_rps_per_pod }
          target: { type: AverageValue, averageValue: "80k" }

  Scale-up trigger:  CPU > 60% for 2 minutes
  Scale-down trigger: CPU < 30% for 10 minutes (conservative)

Multi-Region Active-Active:
  +----------+       +-----------+       +----------+
  | US-East  |       |  EU-West  |       | AP-South |
  | 10 nodes |       |  10 nodes |       | 10 nodes |
  | PostgreSQL       | PostgreSQL        | PostgreSQL
  | (primary)|<----->| (replica) |<----->| (replica)|
  | Redis    |       | Redis     |       | Redis    |
  +----------+       +-----------+       +----------+
        ^                   ^                  ^
        |     Anycast DNS (GeoDNS)             |
        +------------------+-------------------+

Config Replication:
  Primary DB in US-East → async replication to EU-West and AP-South
  Read latency: local reads from replica
  Write latency: writes go to primary (cross-region ~100ms)
  Config changes are infrequent (acceptable cross-region write latency)
  Rate limit counters: regional Redis (no cross-region sync needed)
    → Consequence: burst limit can be exceeded globally by up to N regions * limit
    → Acceptable trade-off for performance vs. strict global limiting
```

### Redis Cluster for Rate Limiting

```
Redis Cluster Topology (6 shards, 3 primaries + 3 replicas):

  Shard 1 (Primary)  <-->  Shard 1 (Replica)
  hash slots: 0-5460

  Shard 2 (Primary)  <-->  Shard 2 (Replica)
  hash slots: 5461-10922

  Shard 3 (Primary)  <-->  Shard 3 (Replica)
  hash slots: 10923-16383

Key distribution by hash:
  rl:{consumer_id}:{route_id}:{window}
  Hash tag {consumer_id} → consistent slot for same consumer

  All rate limit keys for consumer X → same shard
  (avoids cross-shard Lua script issues)

Throughput:
  Each Redis primary: ~500K ops/sec
  3 primaries: ~1.5M ops/sec
  With 2 ops per request (read + increment): handles 750K RPS
  Add shards to scale further
```

### Control Plane High Availability

```
Control Plane (Kubernetes):

etcd cluster:         3 nodes (quorum = 2)
Istiod (Pilot):       3 replicas (active-active with leader election for writes)
Kong Manager:         3 replicas (active-active, DB-backed)
SPIRE Server:         3 replicas (active-passive for cert signing)

Failure scenarios:
  1 etcd node fails    → cluster continues (2/3 quorum)
  1 Istiod dies        → sidecars continue with last-known-good config
                         new pushes handled by remaining 2 replicas
  All control plane down → data plane (sidecars) continue indefinitely
                           with cached config (resilient!)
  Redis node fails     → Redis Cluster auto-failover in ~10 seconds
                         rate limiting briefly unavailable → fail open
```

---

## 21. Trade-offs

| Decision | Option A | Option B | Recommendation |
|----------|----------|----------|----------------|
| Auth token validation | Per-request DB lookup | JWT self-validation | JWT with short TTL (15 min) + refresh tokens; use JWT for stateless validation, introspection only for high-value ops |
| Rate limit granularity | Global per consumer | Per consumer per endpoint | Per endpoint (more precise) but more Redis keys; use hierarchical limits (both) |
| Rate limit on reject | Fail open (allow) | Fail closed (deny) | Fail open for Redis outage; prevents taking down entire API over infra failure |
| Config storage | PostgreSQL (ACID) | etcd (distributed) | PostgreSQL for Kong (full relational model); etcd for Istio/Envoy xDS (designed for it) |
| Canary routing | Header-based | Weight-based | Weight-based for gradual rollouts; header-based for internal testing / QA |
| mTLS everywhere | Strict mode | Permissive mode | Start permissive (log only), migrate service by service to strict; sudden strict breaks unaware services |
| Plugin execution | Inline (synchronous) | Async (event-driven) | Synchronous for auth/rate limit (must block), async for logging/analytics (non-blocking) |
| Cross-region rate limits | Strict global | Regional buckets | Regional buckets (better latency); accept up to 3x burst in worst case (multiple regions simultaneously) |
| Sidecar vs. SDK | Sidecar proxy (mesh) | Client library | Sidecar for language-agnostic policy enforcement; SDK for performance-critical paths where sub-millisecond matters |
| Gateway scaling | Vertical (bigger nodes) | Horizontal (more nodes) | Horizontal always; gateway is stateless and designed for horizontal scale |

---

## 22. Common Interview Follow-ups

**Q: How do you prevent a DDoS attack at the API Gateway?**

Multiple layers: (1) Global rate limiting at edge (Cloudflare/AWS Shield) before reaching gateway — blocks volumetric attacks. (2) Per-IP rate limiting at gateway (e.g., 5K req/min per IP). (3) Per-consumer rate limiting. (4) Connection limiting per IP (TCP level). (5) Request size limits. (6) WAF rules for common attack patterns (SQLi, XSS). (7) CAPTCHA challenge for suspicious IPs. The key is defense in depth — don't rely on any single layer.

---

**Q: How does the gateway handle a Redis failure (rate limiting store is down)?**

Fail-open policy: when Redis is unreachable, the rate limit plugin returns `allow` for all requests. This is the correct default — it's better to allow potentially excess traffic than to take down your entire API because a rate limit store failed. Log the Redis failure, alert on-call, and the service degrades gracefully (no rate limiting during outage window). Alternatively, fall back to an in-process counter (loses accuracy across nodes) for a short window.

---

**Q: How do you handle JWT revocation before expiry?**

Options: (1) Short TTL (5–15 min) + refresh tokens — revoke is eventual (up to TTL). (2) Maintain a token revocation list (JWT jti claim blacklist) in Redis; gateway checks on every request. (3) Use OAuth introspection for high-value operations (payment, admin). In practice: use short JWTs for most traffic + Redis blacklist for immediate revocation of known-compromised tokens. The blacklist only needs to store tokens until their natural expiry — the set is bounded.

---

**Q: How do you do zero-downtime certificate rotation in the service mesh?**

SPIRE/Citadel issues new certificates 30 minutes before expiry. During the overlap window, both old and new certificates are valid (dual-trust). Each sidecar receives the new cert via SDS (Secret Discovery Service) push — no restart needed. The trust bundle includes both the old and new CA until all workloads have rotated. Rotation is invisible to application code. The gateway similarly handles JWKS key rotation: new `kid` appears in JWKS 24h before old key expires.

---

**Q: Why use a service mesh if we already have an API gateway?**

The gateway handles north-south traffic (external clients → internal services). The mesh handles east-west traffic (service A → service B). Without a mesh, services call each other over plain HTTP with no authentication, no retry policies, no circuit breakers, and no observability. The mesh applies all these uniformly to east-west calls without changing application code. The gateway and mesh are complementary; most production Kubernetes systems run both.

---

**Q: How do you implement canary deployments safely?**

Step 1: Deploy v2 alongside v1 (same Kubernetes namespace, different label). Step 2: Configure gateway weight: 99% → v1, 1% → v2. Step 3: Monitor error rate and p99 latency for v2 in Grafana. Step 4: If metrics are healthy after 30 minutes, promote to 5%, then 20%, then 50%, then 100%. Step 5: Key metric thresholds: if v2 error rate > 0.5% or p99 latency > 2× v1, automated rollback (shift weight back to 0%). Use Argo Rollouts or Flagger to automate steps 3–5. Duration between steps: 15–30 minutes minimum to accumulate statistical significance.

---

**Q: How does the gateway achieve < 5ms added latency at 1M RPS?**

Key techniques: (1) Event-driven, non-blocking I/O (NGINX/Envoy use epoll — no thread per connection). (2) Connection pooling to upstreams — reuse HTTP/2 connections, avoid TCP handshake overhead. (3) JWT validation is in-process (crypto operations, ~0.1ms); no network calls for cached tokens. (4) Rate limit Redis call is pipelined (1 round-trip ~0.5ms local network). (5) Route matching uses a trie (O(k) where k = path depth). (6) TLS session resumption (session tickets) avoids full handshake. (7) Plugin chain is synchronous Lua/Go code, no I/O. Result: 1.5ms p50, 3–4ms p99.

---

**Q: How do you handle websocket connections at the API gateway?**

WebSockets start as HTTP/1.1 upgrade requests. The gateway proxies the upgrade, then becomes a transparent TCP tunnel for the bidirectional byte stream. Challenges: (1) No per-request rate limiting after upgrade (rate limit the initial upgrade). (2) Session affinity required — route to the same upstream for the connection lifetime (use consistent hashing on connection ID or cookie). (3) Health checks must not tear down live WebSocket connections. (4) Timeout policies differ: no request timeout, but idle timeout (e.g., 5 minutes of no frames). Kong and Envoy both support WebSocket proxying transparently.

---

**Q: What happens if the control plane (Istiod) goes down?**

The data plane (Envoy sidecars) continues to operate with the last-known-good configuration. All existing traffic flows continue. No new configuration changes take effect (cannot deploy new VirtualServices, cannot update AuthorizationPolicies). Certificate renewal may fail if SPIRE/Citadel is also down, but existing certs remain valid for their remaining lifetime (typically hours). This is the key resilience property of the Istio architecture: data plane is independent of control plane for steady-state operation.

---

**Q: How do you version the gateway's own Admin API without breaking clients?**

The Admin API itself follows the same versioning principles: URL path versioning (`/admin/v1/`, `/admin/v2/`). Breaking changes require a new version. The old version is maintained for at least 6 months after the new version is released. In practice, Kong uses a declarative configuration format (deck YAML) which is versioned separately from the Admin API, and clients (CI/CD pipelines) apply declarative state rather than calling the Admin API directly — reducing coupling to API version.
