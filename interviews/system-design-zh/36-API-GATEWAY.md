# 设计 API Gateway 与 Service Mesh（Kong / Envoy / Istio）

---

## 1. 需求澄清

### 功能需求

| # | 需求 | 描述 |
|---|------|------|
| 1 | Request Routing | 根据路径、主机名、请求头或查询参数将传入请求路由到正确的上游服务 |
| 2 | Authentication & Authorization | 在网关层转发请求前验证 API Key、JWT token 和 OAuth2/OIDC token |
| 3 | Rate Limiting | 使用滑动窗口计数器实施按客户端、按端点和全局的速率限制 |
| 4 | Load Balancing | 使用可配置的算法将流量分发到多个服务实例 |
| 5 | Request/Response Transformation | 添加、删除或重写请求头；在 REST 和 gRPC 之间转换；重塑请求载荷 |
| 6 | Circuit Breaker | 检测上游服务故障，打开熔断器，快速失败以防止级联故障 |
| 7 | Retry & Timeout | 应用带有指数退避的重试预算和按请求的截止时间传播 |
| 8 | TLS Termination | 终止入站 TLS；可选择对上游重新加密（service mesh 中的 mTLS） |
| 9 | Service Discovery | 通过 DNS 或服务注册中心（Consul、etcd）动态解析上游地址 |
| 10 | Observability | 输出分布式追踪、指标（延迟、错误率、饱和度）和结构化访问日志 |
| 11 | API Versioning | 支持 URL 路径版本化（`/v1/`、`/v2/`）和基于请求头的版本化（`Accept: application/vnd.api+json;version=2`） |
| 12 | Plugin / Middleware 架构 | 可组合的过滤器链，使团队无需修改服务即可添加横切关注点 |
| 13 | Canary & Traffic Splitting | 逐步将一定比例的流量切换到新的服务版本 |
| 14 | Service Mesh Sidecar | 向每个 Pod 注入 Envoy sidecar proxy；从中央 control plane（Istio）管理 data plane |
| 15 | 服务间 mTLS | 为每个工作负载签发短期 X.509 证书；对所有东西向流量强制执行 mutual TLS |

### 非功能需求

| # | 需求 | 目标 |
|---|------|------|
| 1 | 附加延迟（网关开销） | < 5ms p99 |
| 2 | 吞吐量 | 持续 1,000,000+ req/sec |
| 3 | 可用性 | 99.999%（每年 < 5.26 分钟停机） |
| 4 | 水平可扩展性 | 线性扩展，无单点瓶颈 |
| 5 | 配置传播 | 从 control plane 到所有 data plane 节点 < 1 秒 |
| 6 | 证书轮换 | 自动轮换；零停机；轮换周期 < 24 小时 |
| 7 | 可观测性覆盖率 | 100% 的请求被追踪和度量 |
| 8 | 安全性 | 零信任：每个服务间调用都经过认证和授权 |
| 9 | 故障隔离 | 单个服务故障不得级联到其他服务 |
| 10 | 多区域 | 至少 3 个地理区域的主主架构 |

### 规模估算

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

## 2. API 设计

### 网关管理 API

```
GET    /admin/v1/services                  列出所有已注册的上游服务
POST   /admin/v1/services                  注册新的上游服务
PUT    /admin/v1/services/{serviceId}      更新服务配置
DELETE /admin/v1/services/{serviceId}      注销服务

GET    /admin/v1/routes                    列出所有路由
POST   /admin/v1/routes                    创建新路由（路径/主机名/请求头匹配规则）
PUT    /admin/v1/routes/{routeId}          更新路由
DELETE /admin/v1/routes/{routeId}          删除路由

GET    /admin/v1/plugins                   列出所有活跃插件
POST   /admin/v1/plugins                   将插件附加到服务或路由
DELETE /admin/v1/plugins/{pluginId}        分离插件

GET    /admin/v1/consumers                 列出 API 消费者
POST   /admin/v1/consumers                 创建消费者（客户端身份）
POST   /admin/v1/consumers/{id}/key-auth   为消费者签发 API Key
POST   /admin/v1/consumers/{id}/jwt        为消费者添加 JWT 凭证

GET    /admin/v1/upstreams/{name}/health   所有目标的健康检查状态
POST   /admin/v1/upstreams/{name}/targets  向上游添加目标（host:port）
DELETE /admin/v1/upstreams/{name}/targets/{targetId}  移除目标
```

**POST /admin/v1/routes 请求体：**
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

**POST /admin/v1/services 请求体：**
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

### 健康检查与可观测性端点

```
GET  /status                  网关节点健康状态（存活探针）
GET  /ready                   网关节点就绪状态（就绪探针）
GET  /metrics                 Prometheus 指标端点
GET  /debug/pprof             Go pprof 性能分析端点（仅管理员）
```

**GET /metrics（Prometheus 文本格式摘录）：**
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

## 3. 数据模型

### 路由配置模式

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

### Rate Limit 计数器模式（Redis）

```
# 滑动窗口计数器键
Key pattern:  rl:{consumer_id}:{route_id}:{window_start_unix}
Type:         String (integer)
TTL:          window_size * 2

# Token bucket 键
Key pattern:  tb:{consumer_id}:{endpoint_hash}
Type:         Hash  { tokens: 950, last_refill: 1709500800 }

# Circuit breaker 状态键
Key pattern:  cb:{service_id}:{instance}
Type:         Hash  { state: "open", failures: 5, opened_at: 1709500800, half_open_at: 1709500860 }
TTL:          cooldown_period (e.g., 60 seconds)

# 配置重载的分布式锁
Key pattern:  lock:config:{node_id}
Type:         String
TTL:          5 seconds
```

### xDS 配置快照（Control Plane -- 存储在 etcd 中）

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

## 4. 高层架构

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

### 请求经过网关的流程

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

典型耗时预算（p99 < 5ms 网关开销）：
  TLS resume:           ~0.1ms (session ticket)
  Plugin chain:         ~1.0ms (auth + rate limit)
  Route match:          ~0.1ms (trie)
  Upstream connect:     ~0.2ms (connection pool, reuse)
  Response processing:  ~0.1ms
  Total overhead:       ~1.5ms p50 / ~4ms p99
```

---

## 5. 深入解析：API Gateway 基础

API Gateway 是所有外部流量的唯一入口点。它统一执行横切关注点，无需每个服务独立实现。

### 网关处理的横切关注点

```
无网关：                         有网关：

Client --> Service A  [AuthN]       Client --> Gateway [AuthN, RateLimit,
Client --> Service B  [AuthN]                          Transform, Trace]
Client --> Service C  [AuthN]                 --> Service A
                                              --> Service B
每个服务需实现：                               --> Service C
  - 认证
  - 限流                         服务只需实现：
  - 日志                           - 业务逻辑
  - 追踪
  - SSL
  = 代码重复、配置漂移、
    不一致
```

### Gateway 与 Service Mesh：互补角色

```
+-----------------------------------------------------+
|                   职责矩阵                           |
+------------------------+------------+---------------+
| 关注点                 | API Gateway| Service Mesh  |
+------------------------+------------+---------------+
| 南北向流量             |     YES    |      no       |
| （外部 → 内部）        |            |               |
+------------------------+------------+---------------+
| 东西向流量             |     no     |      YES      |
| （服务 → 服务）        |            |               |
+------------------------+------------+---------------+
| AuthN（外部）          |     YES    |      no       |
| mTLS（内部）           |     no     |      YES      |
+------------------------+------------+---------------+
| Rate limiting（客户端）|     YES    |    partial    |
+------------------------+------------+---------------+
| Load balancing（外部） |     YES    |      YES      |
+------------------------+------------+---------------+
| Circuit breaker        |     YES    |      YES      |
+------------------------+------------+---------------+
| Request routing        |     YES    |      YES      |
+------------------------+------------+---------------+
| Canary deployments     |     YES    |      YES      |
+------------------------+------------+---------------+
| Observability          |     YES    |      YES      |
+------------------------+------------+---------------+
| 开发者门户             |     YES    |      no       |
+------------------------+------------+---------------+
```

---

## 6. 深入解析：Request Routing

### 路由匹配算法

网关使用**基于 trie 的路由器**实现 O(k) 路径匹配（k = 路径段数）。路由按特异性排序，最具体的匹配优先。

```
Routing Trie 示例：

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

优先级（从高到低）：
  1. 精确路径 + 精确方法 + 请求头匹配
  2. 精确路径 + 精确方法
  3. 精确路径（任意方法）
  4. 前缀路径 + 精确方法
  5. 前缀路径（任意方法）
  6. 正则路径（最慢，最后评估）
```

### 基于路径的路由

```yaml
# 将所有 /v1/orders/* 路由到 orders service
routes:
  - name: orders-v1
    paths: ["/v1/orders", "/v1/orders/.*"]
    service: orders-service-v1
    strip_path: false
    methods: [GET, POST, PUT, DELETE]

  # 转发前重写路径
  - name: legacy-compat
    paths: ["/api/(.*)"]
    service: modern-service
    path_handling: v1
    # /api/users/123 -> /users/123 (strip prefix)
```

### 基于请求头的路由

```yaml
routes:
  # 基于自定义请求头路由（功能标志、A/B 测试）
  - name: orders-v2-beta
    paths: ["/v1/orders"]
    headers:
      X-Beta-User: ["true"]
      X-Version: ["2"]
    service: orders-service-v2
    priority: 100   # 更高优先级胜出

  # 基于主机名的路由（多租户）
  - name: tenant-a
    hosts: ["tenant-a.api.example.com"]
    service: tenant-a-service

  # 基于消费者的路由
  - name: partner-route
    paths: ["/v1/data"]
    headers:
      X-Consumer-Groups: ["partners"]
    service: partner-data-service
```

### Canary 部署（流量分割）

```
流量分割策略：

1. 加权（基于百分比）：
   +--------+          +------------------+     80%   +-----------+
   | Client +--------->+ Gateway          +---------->+ v1 Service|
   +--------+          |                  |           +-----------+
                       | weight: v1=80%   |     20%   +-----------+
                       |         v2=20%   +---------->+ v2 Service|
                       +------------------+           +-----------+

2. 基于请求头（显式选择）：
   带有 X-Canary: true 的请求  -->  v2 (100%)
   不带该请求头的请求  -->  v1 (100%)

3. 基于 Cookie（粘性会话）：
   设置了 Cookie canary=v2  -->  始终 v2
   没有 Cookie              -->  v1（可能随机为 5% 的流量设置 cookie）

4. 渐进式发布（自动化）：
   Day 0:  1% -> v2
   Day 1:  5% -> v2  (if error rate < 0.1%)
   Day 2: 20% -> v2
   Day 3: 50% -> v2
   Day 5:100% -> v2  (decommission v1)

Kong 配置：
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

## 7. 深入解析：网关层认证

### 认证策略

```
+---------------------------------------------------------------------+
|                   认证决策树                                         |
+---------------------------------------------------------------------+
|                                                                     |
|  传入请求                                                            |
|        |                                                            |
|        v                                                            |
|  有 Authorization 请求头？                                           |
|  +--- NO ---> 有 API Key 请求头/参数？ ---> YES --> [API Key Auth]  |
|  |                    |                                             |
|  |                    NO --> 返回 401 Unauthorized                  |
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

### API Key 认证

```
请求流程：
  Client                Gateway                Redis/DB
    |                      |                      |
    |-- GET /v1/orders      |                      |
    |   X-Api-Key: abc123 ->|                      |
    |                      |-- HGET api_keys:abc123|
    |                      |<- {consumer_id, ttl} -|
    |                      |                      |
    |                      | 验证：               |
    |                      |  - Key 是否存在？     |
    |                      |  - 是否未被撤销？     |
    |                      |  - 是否未过期？       |
    |                      |                      |
    |                      | 设置上下文：          |
    |                      |  X-Consumer-ID       |
    |                      |  X-Consumer-Username |
    |                      |  X-Credential-ID     |
    |                      |                      |
    |                      |--- 转发请求 -------->|
    |                      |  （附带消费者上下文）  |

API Key 存储：
  - Key 以 PBKDF2 哈希存储在数据库中（绝不存明文）
  - 前 8 个字符（前缀）以明文存储用于 UI 展示
  - 完整 Key 经哈希后存储用于查询
  - Redis 缓存：5 分钟 TTL，避免每次请求都查数据库
```

### JWT 验证

```
JWT 验证流水线：

1. 从 Authorization: Bearer <token> 中提取 token
2. Base64 解码头部：{ "alg": "RS256", "kid": "key-2024-01" }
3. 通过 kid 从 JWKS 端点查找公钥（已缓存）
4. 使用公钥验证签名
5. 验证标准声明：
   - exp：未过期
   - nbf：未早于
   - iss：匹配允许的发行者
   - aud：匹配当前网关/服务
6. 提取自定义声明：
   - sub：消费��标识
   - roles: ["admin", "user"]
   - tenant: "acme-corp"
7. 注入上游请求头：
   X-JWT-Sub: user_12345
   X-JWT-Roles: admin,user
   X-JWT-Tenant: acme-corp

JWKS 缓存策略：
  - 缓存 JWKS 1 小时（后台刷新）
  - 密钥轮换：保留 2 个活跃密钥（当前 + 上一个）
  - 新密钥在旧密钥过期前 24 小时出现在 JWKS 中
  - JWT 中的 kid 决定使用哪个密钥

JWT 与 API Key 的权衡：
  JWT：
    + 自包含（无需查数据库获取声明）
    + 无状态验证
    + 携带授权信息（角色、租户）
    - 过期前无法撤销（需要短 TTL + refresh token）
    - 载荷更大
  API Key：
    + 签发和即时撤销简单
    + 适用于服务间调用
    - 每次请求需要查数据库/缓存
    - 无内嵌声明（需额外查询）
```

### OAuth2 Token Introspection

```
流程（活跃 token 验证）：

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
   |                | 缓存结果          |                  |
   |                | min(TTL, 30s)     |                  |
   |                |                   |                  |
   |                |--- 转发 + 上下文请求头 -------------->|
   |<-------------------------------------------response---|

缓存键：hash(token)  TTL：min(token_exp - now, 30s)
```

---

## 8. 深入解析：Rate Limiting

### 基于 Redis 的滑动窗口算法

```
滑动窗口计数器算法：

窗口大小：60 秒
限制：每个消费者每分钟 1000 个请求

在时间 T = 100.5s，来自消费者 C 的请求：

当前窗口：[60, 120)  → key = "rl:C:60"
上一窗口：[0, 60)    → key = "rl:C:0"

当前窗口计数：  current_count  = GET rl:C:60  = 600
上一窗口计数：  previous_count = GET rl:C:0   = 800

当前窗口已过时间：100.5 - 60 = 40.5s
上一窗口权重：(60 - 40.5) / 60 = 0.325

估算计数 = previous_count * 0.325 + current_count
          = 800 * 0.325 + 600
          = 260 + 600
          = 860

860 < 1000 → 允许

Redis Lua 脚本（原子操作）：
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

### Rate Limit 层级与响应

```
Rate Limit 响应头：
  X-RateLimit-Limit: 1000          -- 配置的限制
  X-RateLimit-Remaining: 140       -- 当前窗口剩余
  X-RateLimit-Reset: 1709500860    -- 窗口重置的 Unix 时间戳
  Retry-After: 42                  -- 重试前等待秒数（仅在 429 时）

状态码：
  200 OK          -- 在限制内
  429 Too Many Requests -- 硬限制超出，完全拒绝
  503 Service Unavailable -- 全局过载（负载卸载）

多维度 Rate Limiting：
  层级 1（最细粒度）：按消费者 + 按端点
    "消费者 X 每分钟可调用 GET /v1/orders 100 次"
  层级 2：            按消费者 + 按服务
    "消费者 X 每分钟可调用 orders-service 共 500 次"
  层级 3（最粗粒度）：按消费者（全局）
    "消费者 X 跨所有服务每分钟可发出 2000 个请求"
  层级 4：            按 IP（DDoS 防护）
    "IP 1.2.3.4 每分钟可发出 5000 个请求"

所有层级均评估；首次违规触发 429。

Rate Limit 策略矩阵：
+------------------+----------+----------+-----------+
| 消费者层级       | /min     | /hr      | /day      |
+------------------+----------+----------+-----------+
| Free             |     100  |   1,000  |   10,000  |
| Developer        |   1,000  |  20,000  |  100,000  |
| Business         |  10,000  | 200,000  | 1,000,000 |
| Enterprise       | Unlimited| Unlimited| Custom    |
+------------------+----------+----------+-----------+
```

---

## 9. 深入解析：Request/Response Transformation

### 请求头操作

```yaml
# 请求转换插件配置
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
          - "Authorization"          # 转发前剥离凭证
          - "X-Internal-Debug"       # 移除外部请求的调试头
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
          - "Server"                 # 隐藏上游服务器身份
          - "X-Powered-By"
          - "Via"
```

### 协议转换：REST 到 gRPC

```
REST → gRPC 转换层：

Client (REST)          Gateway              gRPC Service
  |                       |                      |
  |-- POST /v1/users       |                      |
  |   Content-Type:        |                      |
  |   application/json  -->|                      |
  |   { "name": "Alice",   |                      |
  |     "email": "a@b.c" } |                      |
  |                        |                      |
  |                    转码：                      |
  |                    1. 解析 JSON body           |
  |                    2. 映射到 proto message     |
  |                       CreateUserRequest {     |
  |                         name = "Alice"        |
  |                         email = "a@b.c"       |
  |                       }                       |
  |                    3. 序列化为 protobuf        |
  |                    4. 设置 gRPC metadata：     |
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
  |                    反向转码：                   |
  |                    1. 反序列化 proto           |
  |                    2. 编组为 JSON             |
  |                    3. 设置 Content-Type：      |
  |                       application/json        |
  |                    4. 映射 gRPC 状态到 HTTP    |
  |                       OK(0) → 200             |
  |                       NOT_FOUND(5) → 404      |
  |                       INVALID_ARG(3) → 400    |
  |<-- 201 Created --------|                      |
  |   { "userId": "u123" } |                      |

gRPC Status → HTTP Status 映射：
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

## 10. 深入解析：Circuit Breaker

### 状态机

```
Circuit Breaker 状态机：

       所有请求通过
            （监控中）
+-----------------------------------+
|                                   |
|           CLOSED                  |
|     （正常运行）                   |
|                                   |
+-----------------------------------+
          |           ^
          |           |
   failure_threshold  | 在 HALF_OPEN
   超出               | 中成功
          |           |
          v           |
+-----------------------------------+
|                                   |
|            OPEN                   |
|  （快速失败 - 立即拒绝            |
|   所有请求）                       |
|                                   |
+-----------------------------------+
          |
          | reset_timeout 已过
          | （例如 30 秒）
          |
          v
+-----------------------------------+
|                                   |
|          HALF-OPEN                |
|  （允许 1 个探测请求；            |
|   成功 → CLOSED                  |
|   失败 → 再次 OPEN）             |
|                                   |
+-----------------------------------+

配置参数：
  failure_threshold: 50%      -- 触发打开的错误率
  min_requests:      20       -- 检查前的最小请求数
  evaluation_window: 10s      -- 错误率的滚动窗口
  open_duration:     30s      -- 保持打开的时长
  half_open_probes:  3        -- 半开状态允许的请求数

每个目标的 Circuit Breaker：
  service: orders
  instances:
    10.0.1.5:8080  → CLOSED  (errors: 2/100 = 2%)
    10.0.1.6:8080  → OPEN    (errors: 60/100 = 60%) ← 已隔离！
    10.0.1.7:8080  → CLOSED  (errors: 1/100 = 1%)

当目标处于 OPEN 状态：
  → 从负载均衡器池中移除
  → 将请求路由到剩余健康实例
  → 每 30 秒探测一次
  → 成功后重新加入

Bulkhead Pattern（circuit breaker 的配套模式）：
  限制每个上游的并发连接数：
    orders-service：最大 500 个并发请求
    payments-service：最大 100 个并发请求
  如果超出限制：立即返回 503（快速失败）
  防止一个慢服务耗尽所有网关线程
```

---

## 11. 深入解析：Load Balancing 算法

### 算法比较

```
Round Robin（默认）：
  Requests: 1  2  3  4  5  6
  Target A: 1     3     5
  Target B:    2     4     6

  优点：简单、均匀分布（如果所有目标相同）
  缺点：忽略目标容量/延迟

Weighted Round Robin：
  Weights: A=3, B=1
  Requests: 1  2  3  4  5  6  7  8
  Target A: 1  2  3     5  6  7
  Target B:          4           8

  使用场景：A 的资源是 B 的 3 倍

Least Connections：
  当前连接数：A=42, B=18, C=31
  新请求 → 发往 B（连接最少）

  优点：考虑实际服务器负载
  缺点：需要连接计数状态；开销略大

Least Response Time（Envoy：LEAST_REQUEST 配合 p2c）：
  随机选择 2 个目标，发送到活跃请求更少的那个
  使用 Power of Two Choices（p2c）实现 O(1) 选择

  优点：近似 least connections 但无需全局状态
  缺点：近似而非精确

Consistent Hashing（用于有状态服务）：
  哈希键：客户端 IP、用户 ID、会话 cookie
  映射到虚拟环上的位置
  拥有该环位置的目标处理请求

  +------+------+------+------+------+------+
  | A    |  B   |  C   |  A   |  B   |  C   |
  +------+------+------+------+------+------+
  0     60     120    180    240    300    360

  hash(client_ip) mod 360 → 找到目标

  添加/移除目标时：仅约 1/N 的键需要重映射

  使用场景：会话亲和性、缓存预热、分片

IP Hash（更简单的粘性会话）：
  hash(client_ip) mod N → 目标索引
  问题：故障转移时不会重新平衡
  更好的选择：consistent hashing

Random with Two Choices（p2c）：
  选择 2 个随机目标 → 转发到负载更低的那个
  在 O(log log N) 时间内接近最优分布
```

### 健康检查与负载均衡器的集成

```
主动健康检查：
  网关每 10 秒探测 /healthz
  连续 2 次成功 → 标记为 HEALTHY → 加入池
  连续 3 次失败 → 标记为 UNHEALTHY → 从池中移除

被动（circuit breaker）健康检查：
  监控实际流量错误
  HTTP 5xx 比率 > 50%（10 秒内）→ 标记为 UNHEALTHY

健康检查优先级：
  1. 被动（即时，基于真实流量）
  2. 主动（周期性，用于恢复检测）

负载均衡器 + 健康检查集成：
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
  正常服务     被动 CB       正常服务
               打开了它
```

---

## 12. 深入解析：Retry 与 Timeout 策略

### Retry Budget

```
朴素重试的问题：
  10 个服务，每个重试 3 次
  单个慢调用触发：
    10 个服务 * 3 次重试 = 最多 30 个上游调用
  → 重试风暴放大了已过载服务的负担

Retry Budget 解决方案：
  每个服务有一个重试预算：最多 10% 的请求可以是重试

  budget_remaining = budget_size - retry_count_in_window
  if budget_remaining <= 0:
    快速失败，不重试

  预算随时间补充（token bucket）
  防止级联重试风暴

Retry 配置：
retries:
  num_retries: 3
  retry_on:
    - connect-failure
    - retriable-4xx    # 429 Too Many Requests
    - 5xx              # 上游返回的任何 5xx
    - gateway-error    # 502, 503, 504
    - reset            # TCP reset
  per_try_timeout: 5s
  retry_back_off:
    base_interval: 100ms
    max_interval:  2s
    # 实际延迟：min(base * 2^attempt + jitter, max)
    # Attempt 0: 100ms + rand(0,100ms) ~= 150ms
    # Attempt 1: 200ms + rand(0,200ms) ~= 300ms
    # Attempt 2: 400ms + rand(0,400ms) ~= 600ms
  retry_budget:
    budget_percent: 10   # 最多 10% 的请求可以是重试
    min_retry_concurrency: 3

不应重试的情况：
  - POST, PUT, PATCH（非幂等，除非服务保证幂等性）
  - 401, 403（认证失败 — 重试无济于事）
  - 400（请求错误 — 重试无济于事）
  - 请求体已部分发送
```

### Deadline 传播

```
Deadline 传播（防止部分成功）：

客户端设置截止时间：总请求时间 500ms

+--------+  deadline: 500ms   +----------+  remaining: 480ms  +---------+
| Client +-------------------->| Gateway  +------------------->| Service |
|        |                     |          |                    |    A    |
|        |                     | elapsed: |                    |         |
|        |                     | ~20ms    |  remaining: 400ms  +---------+
|        |                     |          +------------------->| Service |
|        |                     |          |                    |    B    |
|        |                     |          |                    +---------+
|        |<-- 504 Gateway      |          |
|        |    Timeout ---------|          | 截止时间到达
+--------+                     +----------+

传播使用的请求头：
  grpc-timeout: 480m       (gRPC 原生)
  X-Envoy-Expected-RQ-Timeout-Ms: 480   (Envoy)
  X-Request-Deadline: 2024-03-01T00:00:00.480Z (自定义)

Service B 必须：
  1. 从请求头读取剩余截止时间
  2. 相应地设置自己的内部超时
  3. 如果超过截止时间则取消进行中的工作
  4. 返回 DEADLINE_EXCEEDED (gRPC) 或 504 (HTTP)

  这防止了"孤儿"工作：后端为客户端已放弃的请求
  做昂贵的计算。
```

---

## 13. 深入解析：Service Discovery

### 基于 DNS 的发现

```
基于 DNS 的 Service Discovery：

Kubernetes CoreDNS：
  服务名称：orders-service
  DNS 记录：  orders-service.default.svc.cluster.local
  解析为：    ClusterIP（虚拟 IP → kube-proxy → 实际 Pod）

  Headless service（直接 Pod IP）：
  DNS 记录：orders-service.default.svc.cluster.local
  返回：    所有 Pod IP 的 A 记录
            10.0.1.5, 10.0.1.6, 10.0.1.7

  客户端负载均衡：
    网关解析 DNS → 获取多个 IP → 应用 LB 算法
    DNS TTL：5 秒（快速故障转移）

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
|         Pod1   Pod2   Pod3   (新 Pod 自动添加)
+------------+
```

### 基于注册中心的发现（Consul / etcd）

```
Consul Service Discovery：

注册（服务启动时）：
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

发现（由网关执行）：
  GET http://consul:8500/v1/health/service/orders?passing=true
  Response: [
    { "Service": { "Address": "10.0.1.5", "Port": 8080 }, "Checks": [...PASSING...] },
    { "Service": { "Address": "10.0.1.7", "Port": 8080 }, "Checks": [...PASSING...] }
    # 10.0.1.6 因健康检查失败而被省略
  ]

阻塞查询（长轮询变更通知）：
  GET /v1/health/service/orders?passing=true&index=12345&wait=30s
  当 index 变化时立即返回（新实例、健康状态变化）
  网关在毫秒内更新其池

网关 Consul 集成：
+-------------+    register    +----------+    poll changes   +------------+
| Service Pod +-------------->+  Consul  +<------------------+ Gateway    |
| (startup)   |               | Registry |                   | (watches)  |
+------+------+               +-----+----+                   +------+-----+
       |                            |                                |
       | deregister                 |  notify                        |
       | (shutdown)                 |  (index bump)                  |
       +--------------------------->+-------------------------------->|
                                                              更新 LB 池
```

---

## 14. 深入解析：Service Mesh（Envoy Sidecar）

### Data Plane 与 Control Plane

```
Service Mesh 架构：

+======================================================================+
|                         CONTROL PLANE                               |
|                                                                      |
|  +----------------+  +------------------+  +--------------------+   |
|  | Pilot (xDS)    |  | Citadel (certs)  |  | Galley (config)    |   |
|  |                |  |                  |  |                    |   |
|  | 推送：          |  | 向每个工作负载   |  | 从 k8s API         |   |
|  |  - LDS         |  | 签发 SVID        |  | 验证并摄取配置     |   |
|  |  - RDS         |  | (SPIFFE certs)   |  |                    |   |
|  |  - CDS         |  |                  |  |                    |   |
|  |  - EDS         |  |                  |  |                    |   |
|  +-------+--------+  +--------+---------+  +--------------------+   |
|          | xDS over gRPC      | cert push                           |
+======================================================================+
           |                    |
           | xDS stream         | 证书下发 (SDS)
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

流量拦截（iptables）：
  所有出站流量重定向到 Envoy :15001
  所有入站流量重定向到 Envoy :15006
  Envoy 在转发到应用前应用策略
  应用永远不会直接接触网络
```

### Envoy xDS API

```
xDS (x Discovery Service) 协议：

LDS - Listener Discovery Service：
  定义 Envoy 监听哪些端口
  每个 listener 有一个过滤器链（HTTP、TCP、TLS）

RDS - Route Discovery Service：
  虚拟主机到集群的路由规则
  Canary 权重、请求头匹配

CDS - Cluster Discovery Service：
  上游集群定义
  LB 策略、circuit breaker 阈值

EDS - Endpoint Discovery Service：
  每个集群成员的实际 IP:port
  区域感知的负载均衡提示

SDS - Secret Discovery Service：
  TLS 证书和私钥
  动态推送到 sidecar（轮换无需重启）

xDS 推送流程：
  1. 运维人员创建 VirtualService（Istio CRD）
  2. Galley 验证并存储到 etcd
  3. Pilot 监视 etcd，检测变更
  4. Pilot 转换为 xDS protobuf
  5. Pilot 将增量推送到所有受影响的 sidecar 流
  6. Sidecar 应用新配置（原子交换，零停机）

  从 CRD 应用到 sidecar 生效的总时间：< 1 秒
```

---

## 15. 深入解析：mTLS 与零信任

### 证书生命周期

```
SPIFFE / SPIRE 架构：

SPIFFE Identity：
  格式：spiffe://<trust-domain>/<workload-path>
  示例：spiffe://example.com/ns/default/sa/orders-service

证书签发：
  +----------+                +----------+              +--------+
  | SPIRE    |                | SPIRE    |              | Envoy  |
  | Server   |                | Agent    |              | Sidecar|
  |(Control  |                |(Node-    |              |(Pod)   |
  | plane)   |                | level)   |              |        |
  +----+-----+                +----+-----+              +---+----+
       |                           |                        |
       |  <-- 证实 agent           |                        |
       |      (TPM / k8s token)    |                        |
       |                           |                        |
       |  --> Agent SVID           |                        |
       |      （短期有效）          |<-- 证实 workload      |
       |                           |    (k8s pod SA token)  |
       |                           |                        |
       |  <----- 签发 workload SVID (SPIFFE cert) -------->|
       |                                                     |
       |  每 1 小时自动轮换                                   |
       |  （到期前 30 分钟静默续期）                           |

服务间 mTLS 握手：
  Service A（客户端）             Service B（服务端）
       |                               |
       |-- ClientHello (TLS 1.3) ----->|
       |<-- ServerHello                |
       |<-- Certificate (SVID B) ------|
       |<-- CertificateRequest --------|  ← 双向：服务端要求客户端证书
       |-- Certificate (SVID A) ------>|
       |-- CertificateVerify --------->|
       |<-- Finished (session keys) ---|
       |-- Finished ------------------->|
       |                               |
       | 验证：                        | 验证：
       | - B 的证书由                  | - A 的证书由
       |   受信任的 CA 签发？          |   受信任的 CA 签发？
       | - B 的 SPIFFE ID             | - A 的 SPIFFE ID 在
       |   匹配预期服务？              |   授权列表中？
                                       |   (AuthorizationPolicy)

零信任授权（Istio AuthorizationPolicy）：
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
    # 其他来源 → 拒绝（默认拒绝）
```

---

## 16. 深入解析：Observability（追踪、指标、日志）

### 分布式追踪

```
W3C Trace Context 传播：

Client          Gateway            Service A         Service B
  |                |                    |                  |
  |-- Request ----->|                   |                  |
  |                | 生成：              |                  |
  |                | traceparent:       |                  |
  |                | 00-4bf92f3577-     |                  |
  |                | b7ad6b7169203331-01|                  |
  |                |                   |                  |
  |                |-- 转发 + 请求头 --->                  |
  |                |                   |-- 调用 Service B  |
  |                |                   |  （传播请求头）     |
  |                |                   |                  |
  |                |                   |<-- Response ------|
  |                |<-- Response -------|                  |
  |<-- Response ----|                  |                  |

Trace：每个请求一个（端到端）
Span：每个服务跳转一个

traceparent 请求头格式：
  00-{trace-id-16bytes}-{parent-span-id-8bytes}-{flags}
  00-4bf92f3577b3b43b-b7ad6b7169203331-01
      ^trace ID 128-bit ^span ID 64-bit  ^sampled

采样策略：
  头部采样（在网关层）：1% 的流量
  尾部采样（收集器）：100% 的出错或高延迟请求

  优先级：错误 > 高延迟（>1s）> 随机采样

Jaeger / Zipkin 集成：
  +----------+    spans    +-------------------+    store   +----------+
  | Envoy    +------------>| OpenTelemetry     +----------->| Jaeger   |
  | Sidecar  |             | Collector         |            | Backend  |
  | (发出    |             | （批处理、采样、   |            |          |
  |  spans)  |             |  路由到存储）      |            +----+-----+
  +----------+             +-------------------+                 |
                                                           +-----------+
                                                           | Jaeger UI |
                                                           | （查询、  |
                                                           |  追踪     |
                                                           |  浏览器） |
                                                           +-----------+
```

### 指标（RED 方法）

```
每个服务的 RED 方法：
  R - Rate：每秒请求数
  E - Errors：错误率（4xx、5xx）
  D - Duration：延迟分布（p50、p95、p99）

关键 Prometheus 指标：
  # Rate
  envoy_cluster_upstream_rq_total
  envoy_cluster_upstream_rq_completed

  # Errors
  envoy_cluster_upstream_rq_5xx
  envoy_cluster_upstream_rq_4xx
  envoy_cluster_upstream_rq_retry
  envoy_cluster_upstream_rq_retry_overflow  ← circuit breaker 拒绝

  # Duration
  envoy_cluster_upstream_rq_time_bucket  ← histogram

  # Saturation
  envoy_cluster_upstream_cx_active         ← 活跃连接数
  envoy_cluster_upstream_rq_pending_active ← 排队请求数
  envoy_cluster_upstream_cx_overflow       ← 连接池耗尽

告警规则：
  - 错误率 > 1% 持续 5 分钟 → PagerDuty P2
  - 错误率 > 5% 持续 2 分钟 → PagerDuty P1
  - p99 延迟 > 1 秒          → PagerDuty P2
  - 任何服务的 Circuit breaker OPEN → PagerDuty P1
  - Rate limit 拒绝 > 1000/min → Slack 警告
```

### 结构化访问日志

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

## 17. 深入解析：API Versioning

### URL 路径版本化（推荐）

```
URL 路径版本化：
  /v1/orders      → orders-service-v1
  /v2/orders      → orders-service-v2（新契约）

  优点：
    + 明确，在日志和书签中可见
    + 在网关层通过精确路径匹配容易路由
    + 容易废弃：网关为 /v0/ 返回 410 Gone
    + 缓存友好（不同 URL = 不同缓存键）

  缺点：
    - URL "污染"
    - 客户端需要更新 URL

  废弃策略：
    版本发布：2024 年 1 月 1 日
    版本废弃：2024 年 7 月 1 日（6 个月通知）
    添加响应头：Deprecation: true, Sunset: Sat, 01 Jan 2025 00:00:00 GMT
    版本下线：2025 年 1 月 1 日 → 网关返回 410 Gone

网关废弃配置：
  - name: v1-sunset
    paths: ["/v1/.*"]
    response_transformer:
      add_headers:
        Deprecation: "true"
        Sunset: "Sat, 01 Jan 2025 00:00:00 GMT"
        Link: '</v2/orders>; rel="successor-version"'
```

### 基于请求头的版本化

```
基于请求头的版本化：
  GET /orders
  Accept: application/vnd.example.orders+json; version=2

  优点：
    + URL 整洁
    + 语义正确（版本化内容类型）

  缺点：
    - 浏览器地址栏中不可见
    - 测试更困难（需要设置请求头）
    - 缓存需要 Vary: Accept 请求头

网关基于 Accept 请求头路由：
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

## 18. 深入解析：Plugin/Middleware 架构

### Filter Chain（Kong / Envoy）

```
Envoy HTTP Filter Chain：

入站请求：
  +--------------------------------------------------------------------+
  | [1] JWT Auth Filter          解析 + 验证 JWT，提取声明            |
  +--------------------------------------------------------------------+
  | [2] RBAC Filter              根据策略检查声明                      |
  +--------------------------------------------------------------------+
  | [3] Rate Limit Filter        检查 Redis 计数器，更新               |
  +--------------------------------------------------------------------+
  | [4] Header Manipulation      添加 X-Consumer-ID，剥离 auth 请求头 |
  +--------------------------------------------------------------------+
  | [5] gRPC-JSON Transcoder     如果上游使用 gRPC 则 REST → gRPC     |
  +--------------------------------------------------------------------+
  | [6] Router Filter            路由到上游集群（最后执行）            |
  +--------------------------------------------------------------------+
                 |
           上游服务

出站响应（反序执行）：
  +--------------------------------------------------------------------+
  | [6] Router                  返回上游的响应                         |
  +--------------------------------------------------------------------+
  | [5] gRPC-JSON Transcoder    gRPC → REST 响应体                    |
  +--------------------------------------------------------------------+
  | [4] Header Manipulation     移除内部请求头                         |
  +--------------------------------------------------------------------+
  | [3] Rate Limit              添加 X-RateLimit-Remaining 请求头      |
  +--------------------------------------------------------------------+
  | [2] RBAC                    响应时无操作                           |
  +--------------------------------------------------------------------+
  | [1] JWT Auth                响应时无操作                           |
  +--------------------------------------------------------------------+
                 |
           客户端响应

Kong Plugin 阶段（Lua/Go 插件）：
  - init_worker  ：每个 nginx worker 启动时执行一次
  - certificate  ：在 TLS 握手期间
  - rewrite      ：路由前（路径重写）
  - access       ：路由后（认证、限流）
  - header_filter：收到上游响应后
  - body_filter  ：流式传输响应体
  - log          ：响应发送后异步执行（非阻塞）

Plugin 生命周期（每个请求）：
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

### 自定义 Plugin 开发（Kong Go Plugin）

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

## 19. 深入解析：Kong vs Envoy vs Nginx vs AWS API Gateway vs Istio 对比

### 功能对比矩阵

```
+-----------------------------+--------+--------+--------+--------+--------+
| 功能                        |  Kong  | Envoy  | Nginx  | AWS GW | Istio  |
+-----------------------------+--------+--------+--------+--------+--------+
| 主要角色                    |Gateway |  Proxy |  Web/  |Gateway | Mesh   |
|                             |        | /Mesh  | Proxy  |        |        |
+-----------------------------+--------+--------+--------+--------+--------+
| 配置方式                    |  DB /  |  xDS   | Config |Console/| CRDs   |
|                             |  API   |  API   |  File  |  TF    |        |
+-----------------------------+--------+--------+--------+--------+--------+
| 插件/扩展                   | Lua/Go |  Wasm  |  Lua   |Lambda/ |  Wasm  |
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
| 分布式追踪                  |  YES   |  YES   |partial |  YES   |  YES   |
+-----------------------------+--------+--------+--------+--------+--------+
| 开发者门户                  |  YES   |  NO    |  NO    |  YES   |  NO    |
+-----------------------------+--------+--------+--------+--------+--------+
| 东西向（service mesh）      | limited|  YES   |  NO    |  NO    |  YES   |
+-----------------------------+--------+--------+--------+--------+--------+
| 性能（RPS/节点）            | ~100K  | ~200K  | ~300K  |managed | ~200K  |
+-----------------------------+--------+--------+--------+--------+--------+
| 附加延迟（p99）             | ~2ms   | ~1ms   | ~0.5ms |~5-10ms | ~2ms   |
+-----------------------------+--------+--------+--------+--------+--------+
| 运维复杂度                  | Medium | High   |  Low   |  Low   |  High  |
+-----------------------------+--------+--------+--------+--------+--------+
| 成本模式                    | OSS/   |  OSS   |  OSS/  |  Pay/  | OSS/   |
|                             | Ent.   |        | Plus   |  req   | Ent.   |
+-----------------------------+--------+--------+--------+--------+--------+
| 最适合                      |API 管理|高性能  | 简单   |Serverl-|完整    |
|                             |+ 开发者| 代理   |代理    |ess/AWS |mesh    |
+-----------------------------+--------+--------+--------+--------+--------+
```

### 选型指南

```
选择 Kong 的场景：
  - 需要完整的 API 管理平台（开发者门户、分析）
  - 非技术团队需要通过 UI 管理路由和插件
  - 丰富的插件生态系统（100+ 插件）开箱即用
  - 混合部署（本地 + 云端）

选择 Envoy 的场景：
  - 需要最大性能和可扩展性（Wasm filters）
  - 构建自定义 control plane
  - 作为 service mesh 的 data plane（Istio 使用 Envoy）
  - 需要深度 gRPC/HTTP2 支持

选择 Nginx 的场景：
  - 简单的反向代理 / 静态文件服务
  - 最高原始吞吐量
  - 最少基础设施（无需 control plane）
  - 遗留系统集成（模块、熟悉的配置）

选择 AWS API Gateway 的场景：
  - 全 AWS 技术栈（Lambda、Cognito、WAF 集成）
  - 不想承担运维开销（完全托管）
  - 低到中等流量（按请求收费）
  - 快速原型开发

选择 Istio 的场景：
  - 需要 Kubernetes 原生 service mesh
  - 完整的东西向流量控制（mTLS、RBAC、重试）
  - 多集群 / 多云网格
  - 高级流量管理（canary、用于混沌测试的故障注入）
  - 零信任安全模型为强制要求

常见组合：
  Kong（南北向）+ Istio（东西向）
  = 两全其美：丰富的 API 管理 + service mesh
```

---

## 20. 扩展策略

### 网关节点水平扩展

```
扩展架构：

无状态网关节点：
  - 所有路由/插件配置来自共享数据库（PostgreSQL）或缓存
  - Rate limit 状态在共享 Redis 集群中
  - 无需会话亲和性（每个节点完全相同）

  扩容：添加节点，更新负载均衡器目标组
  缩容：排空连接（让进行中的请求完成），从 LB 中移除

自动扩缩策略（Kubernetes HPA）：
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

  扩容触发条件：CPU > 60% 持续 2 分钟
  缩容触发条件：CPU < 30% 持续 10 分钟（保守策略）

多区域主主架构：
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

配置复制：
  US-East 的主数据库 → 异步复制到 EU-West 和 AP-South
  读延迟：从本地副本读取
  写延迟：写入发往主库（跨区域 ~100ms）
  配置变更不频繁（跨区域写延迟可接受）
  Rate limit 计数器：区域 Redis（无需跨区域同步）
    → 后果：全局突发限制最多可超出 N 个区域 * 限制值
    → 在性能与严格全局限制之间可接受的权衡
```

### 用于 Rate Limiting 的 Redis 集群

```
Redis 集群拓扑（6 个分片，3 主 + 3 从）：

  Shard 1 (Primary)  <-->  Shard 1 (Replica)
  hash slots: 0-5460

  Shard 2 (Primary)  <-->  Shard 2 (Replica)
  hash slots: 5461-10922

  Shard 3 (Primary)  <-->  Shard 3 (Replica)
  hash slots: 10923-16383

键的哈希分布：
  rl:{consumer_id}:{route_id}:{window}
  Hash tag {consumer_id} → 同一消费者的键落入同一槽位

  消费者 X 的所有 rate limit 键 → 同一分片
  （避免跨分片 Lua 脚本问题）

吞吐量：
  每个 Redis 主节点：~500K ops/sec
  3 个主节点：~1.5M ops/sec
  每个请求 2 次操作（读 + 递增）：可处理 750K RPS
  添加分片以进一步扩展
```

### Control Plane 高可用

```
Control Plane（Kubernetes）：

etcd 集群：            3 个节点（法定人数 = 2）
Istiod (Pilot)：       3 个副本（主主模式，写操作通过 leader 选举）
Kong Manager：         3 个副本（主主模式，数据库支持）
SPIRE Server：         3 个副本（主备模式用于证书签名）

故障场景：
  1 个 etcd 节点失败   → 集群继续运行（2/3 法定人数）
  1 个 Istiod 失败     → sidecar 继续使用最后已知的良好配置
                         新推送由剩余 2 个副本处理
  所有 control plane 宕机 → data plane（sidecar）使用
                           缓存配置无限期继续运行（高弹性！）
  Redis 节点失败       → Redis Cluster 约 10 秒自动故障转移
                         rate limiting 短暂不可用 → 失败开放
```

---

## 21. 权衡取舍

| 决策 | 选项 A | 选项 B | 建议 |
|------|--------|--------|------|
| Auth token 验证 | 每次请求查数据库 | JWT 自验证 | JWT 短 TTL（15 分钟）+ refresh token；使用 JWT 进行无状态验证，仅对高价值操作使用 introspection |
| Rate limit 粒度 | 按消费者全局 | 按消费者按端点 | 按端点（更精确）但更多 Redis 键；使用层级限制（两者兼用） |
| Rate limit 拒绝时 | 失败开放（允许） | 失败关闭（拒绝） | Redis 故障时失败开放；防止因基础设施故障导致整个 API 宕机 |
| 配置存储 | PostgreSQL（ACID） | etcd（分布式） | Kong 使用 PostgreSQL（完整关系模型）；Istio/Envoy xDS 使用 etcd（专为此设计） |
| Canary 路由 | 基于请求头 | 基于权重 | 渐进式发布用基于权重；内部测试/QA 用基于请求头 |
| 全面 mTLS | Strict 模式 | Permissive 模式 | 先使用 permissive（仅记录日志），逐服务迁移到 strict；突然切换 strict 会影响未感知的服务 |
| Plugin 执行 | 内联（同步） | 异步（事件驱动） | 认证/限流用同步（必须阻塞），日志/分析用异步（非阻塞） |
| 跨区域 rate limits | 严格全局 | 区域独立桶 | 区域独立桶（更低延迟）；最坏情况下接受最多 3 倍突发（多区域同时） |
| Sidecar vs. SDK | Sidecar proxy（mesh） | 客户端库 | Sidecar 用于语言无关的策略执行；SDK 用于亚毫秒级要求的性能关键路径 |
| 网关扩展 | 垂直（更大节点） | 水平（更多节点） | 始终水平扩展；网关是无状态的，天然适合水平扩展 |

---

## 22. 常见面试追问

**问：如何在 API Gateway 层防御 DDoS 攻击？**

多层防御：(1) 在到达网关之前，在边缘进行全局限流（Cloudflare/AWS Shield）-- 阻止容量型攻击。(2) 网关层按 IP 限流（例如每个 IP 5K req/min）。(3) 按消费者限流。(4) 按 IP 限制连接数（TCP 层）。(5) 请求大小限制。(6) WAF 规则防御常见攻击模式（SQLi、XSS）。(7) 对可疑 IP 发起 CAPTCHA 挑战。关键是纵深防御 -- 不依赖任何单一层。

---

**问：网关如何处理 Redis 故障（rate limiting 存储不可用）？**

失败开放策略：当 Redis 不可达时，rate limit 插件对所有请求返回 `allow`。这是正确的默认行为 -- 允许可能超量的流量，好过因限流存储故障导致整个 API 宕机。记录 Redis 故障日志，通知值班人员，服务优雅降级（故障期间无限流）。或者可以回退到进程内计数器（跨节点精度降低），维持短暂窗口。

---

**问：如何在 JWT 过期前进行撤销？**

方案：(1) 短 TTL（5-15 分钟）+ refresh token -- 撤销是最终一致的（最多等待 TTL）。(2) 在 Redis 中维护 token 撤销列表（JWT jti 声明黑名单）；网关每次请求都检查。(3) 对高价值操作（支付、管理员）使用 OAuth introspection。实践中：大部分流量使用短期 JWT + Redis 黑名单用于已知被泄露 token 的即时撤销。黑名单只需存储 token 直到其自然过期 -- 集合是有界的。

---

**问：如何在 service mesh 中实现零停机证书轮换？**

SPIRE/Citadel 在到期前 30 分钟签发新证书。在重叠窗口期间，新旧证书同时有效（双重信任）。每个 sidecar 通过 SDS（Secret Discovery Service）推送接收新证书 -- 无需重启。信任包同时包含新旧 CA，直到所有工作负载完成轮换。轮换对应用代码透明。网关类似地处理 JWKS 密钥轮换：新的 `kid` 在旧密钥过期前 24 小时出现在 JWKS 中。

---

**问：如果已经有 API Gateway 了，为什么还需要 service mesh？**

网关处理南北向流量（外部客户端 → 内部服务）。网格处理东西向流量（服务 A → 服务 B）。没有网格，服务之间通过明文 HTTP 调用，没有认证、没有重试策略、没有 circuit breaker、没有可观测性。网格将这些统一应用到东西向调用，无需修改应用代码。网关和网格是互补的；大多数生产 Kubernetes 系统同时运行两者。

---

**问：如何安全地实现 canary 部署？**

步骤 1：将 v2 部署在 v1 旁边（相同 Kubernetes namespace，不同 label）。步骤 2：配置网关权重：99% → v1，1% → v2。步骤 3：在 Grafana 中监控 v2 的错误率和 p99 延迟。步骤 4：如果指标健康持续 30 分钟，提升到 5%，然后 20%，然后 50%，最后 100%。步骤 5：关键指标阈值：如果 v2 错误率 > 0.5% 或 p99 延迟 > v1 的 2 倍，自动回滚（将权重切回 0%）。使用 Argo Rollouts 或 Flagger 自动化步骤 3-5。步骤间隔时间：至少 15-30 分钟以积累统计显著性。

---

**问：网关如何在 1M RPS 下实现 < 5ms 的附加延迟？**

关键技术：(1) 事件驱动、非阻塞 I/O（NGINX/Envoy 使用 epoll -- 无需每连接一个线程）。(2) 上游连接池 -- 复用 HTTP/2 连接，避免 TCP 握手开销。(3) JWT 验证在进程内（加密操作约 0.1ms）；缓存的 token 无需网络调用。(4) Rate limit Redis 调用使用 pipeline（1 次往返约 0.5ms 本地网络）。(5) 路由匹配使用 trie（O(k)，k = 路径深度）。(6) TLS session resumption（session tickets）避免完整握手。(7) Plugin chain 是同步 Lua/Go 代码，无 I/O。结果：1.5ms p50，3-4ms p99。

---

**问：网关如何处理 WebSocket 连接？**

WebSocket 以 HTTP/1.1 upgrade 请求开始。网关代理 upgrade，然后变为双向字节流的透明 TCP 隧道。挑战：(1) upgrade 后无法按请求限流（在初始 upgrade 时限流）。(2) 需要会话亲和性 -- 在连接生命周期内路由到同一上游（使用基于连接 ID 或 cookie 的 consistent hashing）。(3) 健康检查不得断开活跃的 WebSocket 连接。(4) 超时策略不同：无请求超时，但有空闲超时（例如 5 分钟无帧数据）。Kong 和 Envoy 都透明支持 WebSocket 代理。

---

**问：如果 control plane（Istiod）���机会发生什么？**

Data plane（Envoy sidecar）使用最后已知的良好配置继续运行。所有现有流量流继续正常。新的配置变更不会生效（无法部署新的 VirtualService，无法更新 AuthorizationPolicy）。如果 SPIRE/Citadel 也宕机，证书续期可能失败，但现有证书在剩余有效期内（通常数小时）仍然有效。这是 Istio 架构的关键弹性特性：在稳态运行时，data plane 独立于 control plane。

---

**问：如何在不破坏客户端的情况下对网关自身的 Admin API 进行版本化？**

Admin API 本身遵循相同的版本化原则：URL 路径版本化（`/admin/v1/`、`/admin/v2/`）。破坏性变更需要新版本。新版本发布后，旧版本至少维护 6 个月。实践中，Kong 使用声明式配置格式（deck YAML），其版本独立于 Admin API，客户端（CI/CD 流水线）应用声明式状态而非直接调用 Admin API -- 减少了对 API 版本的耦合。
