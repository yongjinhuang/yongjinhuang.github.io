# 设计多租户 SaaS 平台

多租户 SaaS 平台从共享基础设施为多个客户组织（租户）提供服务，同时保证数据隔离、性能隔离和每租户定制化。像 Salesforce、Slack 和 Notion 这样的系统必须处理数千到数百万个租户，这些租户具有不同的使用模式、合规要求和配置需求——所有这些都运行在共享的计算、存储和网络资源上。

---

## 目录

1. [需求澄清](#1-需求澄清)
2. [API 设计](#2-api-设计)
3. [数据模型](#3-数据模型)
4. [高层架构](#4-高层架构)
5. [深入探讨：租户隔离策略](#5-深入探讨租户隔离策略)
6. [深入探讨：行级安全](#6-深入探讨行级安全)
7. [深入探讨：请求路由](#7-深入探讨请求路由)
8. [深入探讨：资源配额与限流](#8-深入探讨资源配额与限流)
9. [深入探讨：配置与定制化](#9-深入探讨配置与定制化)
10. [深入探讨：数据迁移与租户生命周期](#10-深入探讨数据迁移与租户生命周期)
11. [深入探讨：计费集成](#11-深入探讨计费集成)
12. [扩展策略](#12-扩展策略)
13. [部署架构](#13-部署架构)
14. [常见面试追问](#14-常见面试追问)
15. [总结](#15-总结)

---

## 1. 需求澄清

### 功能需求

| # | 需求 | 详情 |
|---|------|------|
| FR1 | 租户入驻 | 自助注册，工作空间在数秒内完成配置 |
| FR2 | 用户管理 | 邀请用户、角色（所有者/管理员/成员/访客）、SSO 集成 |
| FR3 | 数据隔离 | 租户 A 在任何情况下都不能看到或访问租户 B 的数据 |
| FR4 | 自定义配置 | 每租户品牌、功能开关、工作流定制 |
| FR5 | 使用量跟踪 | 跟踪每租户的 API 调用、存储、席位用于计费 |
| FR6 | 多工作空间 | 一个用户可以属于多个租户工作空间 |
| FR7 | 管理控制台 | 平台级管理，用于租户管理和健康监控 |
| FR8 | API 访问 | 每租户 API 密钥，具有范围化权限 |
| FR9 | 数据导出 | 租户可以导出所有数据（GDPR 数据可移植性） |
| FR10 | 审计日志 | 跟踪每租户所有数据访问和修改 |

### 非功能需求

| # | 需求 | 目标 |
|---|------|------|
| NFR1 | 数据隔离 | 租户之间零数据泄露 |
| NFR2 | 性能隔离 | 一个租户的负载峰值不能降低其他租户的性能 |
| NFR3 | 可用性 | 99.99% 正常运行时间（< 52 分钟停机/年） |
| NFR4 | 延迟 | p99 API 响应 < 200ms |
| NFR5 | 可扩展性 | 支持 100K+ 租户，10M+ 用户 |
| NFR6 | 合规性 | SOC 2、GDPR、HIPAA（企业版） |
| NFR7 | 数据驻留 | 将数据存储在租户指定的区域 |
| NFR8 | 弹性 | 处理每租户 10 倍流量峰值 |
| NFR9 | 租户删除 | 30 天内完成全部数据清除（GDPR） |
| NFR10 | 向后兼容性 | API 版本管理，不影响现有租户 |

### 容量估算

```
租户数量                 : 100,000
每租户用户数（平均）      : 100（范围：1 - 500,000）
总用户数                 : 10,000,000
每日 API 请求数           : 50 亿（平均每用户每天 500 次请求）
峰值 QPS                 : ~115,000（工作时间为平均值的 2 倍）
每租户存储（平均）        : 5 GB（范围：10 MB - 50 TB）
总存储                   : ~500 TB
每日事件数               : 20 亿（使用量跟踪、审计）
```

---

## 2. API 设计

### 租户标识

每个 API 请求必须携带租户上下文。三种常见方式：

```
# 方式 A：子域名（推荐用于 Web 应用）
GET https://acme.app.example.com/api/v1/projects

# 方式 B：请求头（推荐用于 API 优先架构）
GET https://api.example.com/v1/projects
X-Tenant-ID: tenant_abc123

# 方式 C：JWT 声明（从认证令牌中提取）
GET https://api.example.com/v1/projects
Authorization: Bearer eyJ...  # 包含 tenant_id 声明
```

### 核心端点

```
# 租户管理（平台管理员）
POST   /platform/v1/tenants                  # 创建租户
GET    /platform/v1/tenants/:id              # 获取租户详情
PATCH  /platform/v1/tenants/:id              # 更新租户配置
DELETE /platform/v1/tenants/:id              # 安排租户删除
GET    /platform/v1/tenants/:id/usage        # 获取使用量指标

# 用户管理（租户范围内）
POST   /api/v1/users/invite                  # 邀请用户
GET    /api/v1/users                          # 列出租户内用户
PATCH  /api/v1/users/:id/role                # 修改角色
DELETE /api/v1/users/:id                      # 移除用户

# 应用资源（租户范围内）
POST   /api/v1/projects                      # 创建项目
GET    /api/v1/projects                      # 列出项目
GET    /api/v1/projects/:id                  # 获取项目
PUT    /api/v1/projects/:id                  # 更新项目
DELETE /api/v1/projects/:id                  # 删除项目

# 配置
GET    /api/v1/settings                      # 获取租户设置
PATCH  /api/v1/settings                      # 更新设置
GET    /api/v1/features                      # 获取已启用功能

# 数据导出（GDPR）
POST   /api/v1/exports                       # 请求数据导出
GET    /api/v1/exports/:id                   # 检查导出状态
GET    /api/v1/exports/:id/download          # 下载导出
```

---

## 3. 数据模型

### 策略 A：共享数据库，共享模式（行级隔离）

所有租户共享相同的表。每行都有一个 `tenant_id` 列。

```sql
-- 核心租户表
CREATE TABLE tenants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    slug            VARCHAR(63) UNIQUE NOT NULL,       -- 子域名
    plan            VARCHAR(50) NOT NULL DEFAULT 'free',
    status          VARCHAR(20) NOT NULL DEFAULT 'active',
    settings        JSONB NOT NULL DEFAULT '{}',
    data_region     VARCHAR(20) NOT NULL DEFAULT 'us-east-1',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 用户通过成员关系属于租户
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    name            VARCHAR(255) NOT NULL,
    avatar_url      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    user_id         UUID NOT NULL REFERENCES users(id),
    role            VARCHAR(20) NOT NULL DEFAULT 'member',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, user_id)
);

-- 每张表都带有 tenant_id 的应用数据
CREATE TABLE projects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    created_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_projects_tenant ON projects(tenant_id);

-- 使用量跟踪
CREATE TABLE usage_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    event_type      VARCHAR(50) NOT NULL,
    quantity        BIGINT NOT NULL DEFAULT 1,
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
) PARTITION BY RANGE (recorded_at);

-- 审计日志
CREATE TABLE audit_logs (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       UUID NOT NULL,
    user_id         UUID,
    action          VARCHAR(50) NOT NULL,
    resource_type   VARCHAR(50) NOT NULL,
    resource_id     UUID,
    details         JSONB,
    ip_address      INET,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);
```

### 策略 B：共享数据库，独立 Schema

每个租户在同一数据库中获得自己的 PostgreSQL schema。

```sql
-- 为每个租户创建 schema
CREATE SCHEMA tenant_acme;

-- 表存在于租户特定的 schema 中
CREATE TABLE tenant_acme.projects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    created_by      UUID NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- 不需要 tenant_id 列——schema 提供隔离

-- 每个请求切换 schema
SET search_path TO tenant_acme, public;
SELECT * FROM projects;  -- 查询 tenant_acme.projects
```

### 策略 C：每租户独立数据库

每个租户获得专用的数据库实例。

```
tenant_acme_db  -->  PostgreSQL Instance 1 (us-east-1)
tenant_globex_db --> PostgreSQL Instance 2 (eu-west-1)
tenant_initech_db -> PostgreSQL Instance 3 (us-east-1)
```

---

## 4. 高层架构

```
+------------------------------------------------------------------+
|                         客户端                                     |
|  [Web 应用]    [移动应用]    [API 客户端]    [管理控制台]           |
+----------|-----------|-------------|----------------|-------------+
           |           |             |                |
           v           v             v                v
+------------------------------------------------------------------+
|                    API 网关 / 负载均衡器                            |
|  - TLS 终止                                                       |
|  - 租户标识（子域名 / 请求头 / JWT）                                |
|  - 限流（每租户）                                                  |
|  - 请求路由                                                       |
+------------------------------------------------------------------+
           |
           v
+------------------------------------------------------------------+
|                     租户上下文中间件                                 |
|  - 从请求中提取 tenant_id                                          |
|  - 验证租户状态（活跃 / 已暂停）                                    |
|  - 设置数据库连接 / schema                                         |
|  - 将租户上下文注入请求                                             |
+------------------------------------------------------------------+
           |
           +------------------+------------------+
           |                  |                  |
           v                  v                  v
+------------------+ +------------------+ +------------------+
|   认证服务       | |   应用服务       | |  配置服务        |
| - JWT 签发       | | - 业务逻辑       | | - 功能开关       |
| - SSO / SAML     | | - CRUD 操作      | | - 品牌定制       |
| - RBAC           | | - 领域逻辑       | | - 套餐限制       |
| - 会话管理       | | - Webhooks       | | - 自定义字段     |
+------------------+ +------------------+ +------------------+
           |                  |                  |
           v                  v                  v
+------------------------------------------------------------------+
|                      数据访问层                                     |
|  - 租户感知查询构建器（自动注入 tenant_id）                         |
|  - 连接池管理（每租户或共享）                                       |
|  - 读副本路由                                                      |
+------------------------------------------------------------------+
           |                  |                  |
           v                  v                  v
+------------------+ +------------------+ +------------------+
|   PostgreSQL     | |     Redis        | |  Elasticsearch   |
| （租户数据）      | | （缓存、会话）    | | （搜索、日志）    |
+------------------+ +------------------+ +------------------+
           |
           v
+------------------------------------------------------------------+
|                      事件总线 (Kafka)                               |
+------------------------------------------------------------------+
     |              |               |              |
     v              v               v              v
+-----------+ +------------+ +------------+ +-------------+
| 使用量    | | 审计日志   | | Webhook    | | 分析        |
| 计量      | | 处理器     | | 分发器     | | 管道        |
+-----------+ +------------+ +------------+ +-------------+
```

---

## 5. 深入探讨：租户隔离策略

### 对比矩阵

| 维度 | 共享 Schema（行级） | 独立 Schema | 独立数据库 |
|------|---------------------|-------------|-----------|
| **数据隔离** | 逻辑隔离（WHERE 子句） | 逻辑隔离（schema 边界） | 物理隔离 |
| **入驻速度** | 即时（插入行） | 秒级（CREATE SCHEMA） | 分钟级（配置数据库） |
| **最大租户数** | 1M+ | ~10,000（schema 限制） | ~1,000（运维限制） |
| **跨租户查询** | 简单（平台管理员） | 中等（跨 schema 查询） | 困难（联邦查询） |
| **迁移复杂度** | 低（共享迁移） | 中（每 schema 迁移） | 高（每数据库迁移） |
| **嘈杂邻居风险** | 高（共享索引） | 中（共享缓冲池） | 低（专用资源） |
| **合规性（HIPAA）** | 较难认证 | 中等 | 最容易认证 |
| **每租户成本** | 最低 | 低-中 | 最高 |
| **备份/恢复** | 全部或无 | 可按 schema | 按租户轻松实现 |
| **数据驻留** | 困难（同一数据库） | 困难（同一数据库） | 简单（每区域一个数据库） |

### 决策矩阵

```
                    免费/入门版       专业版            企业版
                    (< 100 用户)     (100-10K 用户)    (> 10K 用户)
                    ┌───────────┐    ┌──────────────┐  ┌────────────┐
隔离                │ 共享      │    │ 共享 Schema  │  │ 专用       │
策略                │ Schema    │    │ + RLS        │  │ 数据库     │
                    │ (行级     │    │              │  │            │
                    │  安全)    │    │              │  │            │
                    └───────────┘    └──────────────┘  └────────────┘

预期租户数           100,000          5,000              200
每租户收入           $0-50/月         $200-2000/月       $10K-100K/月
SLA                 99.9%            99.95%             99.99%
数据驻留             无               可选               必需
```

### 混合方案（推荐）

```python
def get_tenant_data_source(tenant: Tenant) -> DataSource:
    """Route tenant to appropriate data source based on plan."""
    if tenant.plan == 'enterprise' and tenant.dedicated_db:
        # Dedicated database for enterprise tenants
        return DedicatedDatabase(
            host=tenant.dedicated_db.host,
            database=tenant.dedicated_db.name
        )
    elif tenant.plan in ('professional', 'enterprise'):
        # Separate schema within shared database
        return SharedDatabase(
            pool=get_regional_pool(tenant.data_region),
            schema=f'tenant_{tenant.id}'
        )
    else:
        # Shared schema with row-level security
        return SharedDatabase(
            pool=get_regional_pool(tenant.data_region),
            schema='public',
            tenant_filter=tenant.id
        )
```

---

## 6. 深入探讨：行级安全

### PostgreSQL RLS 策略

```sql
-- Enable RLS on all tenant-scoped tables
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Policy: tenants can only see their own data
CREATE POLICY tenant_isolation ON projects
    USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- Policy: allow inserts only for the current tenant
CREATE POLICY tenant_insert ON projects
    FOR INSERT
    WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- Platform admin bypass (for admin console)
CREATE POLICY admin_bypass ON projects
    USING (current_setting('app.is_platform_admin', true)::BOOLEAN = true);
```

### 中间件模式（租户上下文传播）

```python
class TenantMiddleware:
    """Set tenant context on every request."""

    async def __call__(self, request, call_next):
        tenant_id = self._extract_tenant_id(request)

        if not tenant_id:
            return Response(status=401, body='Tenant not identified')

        tenant = await self.tenant_cache.get(tenant_id)
        if not tenant or tenant.status != 'active':
            return Response(status=403, body='Tenant inactive')

        # Set tenant context for the request lifecycle
        request.state.tenant = tenant

        # Set PostgreSQL session variable for RLS
        async with db.connection() as conn:
            await conn.execute(
                "SET app.current_tenant_id = %s", [str(tenant_id)]
            )
            request.state.db = conn
            response = await call_next(request)

        return response

    def _extract_tenant_id(self, request) -> str | None:
        # Priority: JWT claim > Header > Subdomain
        if token := request.headers.get('Authorization'):
            claims = decode_jwt(token)
            return claims.get('tenant_id')

        if tenant_id := request.headers.get('X-Tenant-ID'):
            return tenant_id

        host = request.headers.get('Host', '')
        subdomain = host.split('.')[0]
        return self.slug_to_id_cache.get(subdomain)
```

### 查询构建器（纵深防御）

```python
class TenantAwareRepository:
    """Even with RLS, always include tenant_id in queries."""

    def __init__(self, db, tenant_id: str):
        self.db = db
        self.tenant_id = tenant_id

    async def find_all(self, filters: dict = None) -> list:
        query = "SELECT * FROM projects WHERE tenant_id = $1"
        params = [self.tenant_id]

        if filters:
            for key, value in filters.items():
                query += f" AND {key} = ${len(params) + 1}"
                params.append(value)

        return await self.db.fetch(query, *params)

    async def create(self, data: dict) -> dict:
        # Always set tenant_id, never trust client input
        data['tenant_id'] = self.tenant_id
        # ... insert logic
```

---

## 7. 深入探讨：请求路由

### 租户标识流程

```
请求到达
       |
       v
+------+--------+
| 提取租户      |
| 标识符        |
+------+---------+
       |
       +-------- 子域名? ---> acme.app.com --> 查找 slug "acme"
       |
       +-------- JWT 声明? ---> 解码令牌 --> 提取 tenant_id
       |
       +-------- 请求头? ------> X-Tenant-ID --> 验证格式
       |
       v
+------+---------+
| 查找租户      |  <-- Redis 缓存（TTL: 5 分钟）
| 元数据        |  <-- 降级：PostgreSQL
+------+---------+
       |
       v
+------+---------+
| 验证           |
| - 状态=活跃    |
| - 套餐限制     |
| - 区域匹配     |
+------+---------+
       |
       v
+------+---------+
| 路由到数据     |
| 源             |
+------+---------+
       |
       +----> 共享池（免费/入门版）
       +----> Schema 特定池（专业版）
       +----> 专用连接（企业版）
```

### 连接池管理

```python
class TenantConnectionManager:
    """Manage database connections per isolation strategy."""

    def __init__(self):
        # Shared pools per region
        self.shared_pools: dict[str, Pool] = {}
        # Dedicated pools per enterprise tenant
        self.dedicated_pools: dict[str, Pool] = {}
        # Pool limits
        self.max_shared_connections = 500
        self.max_dedicated_connections = 50

    async def get_connection(self, tenant: Tenant):
        if tenant.isolation == 'dedicated':
            pool = self.dedicated_pools.get(tenant.id)
            if not pool:
                pool = await create_pool(
                    dsn=tenant.database_url,
                    min_size=5,
                    max_size=self.max_dedicated_connections
                )
                self.dedicated_pools[tenant.id] = pool
            conn = await pool.acquire()
            return conn

        # Shared pool with schema routing
        region = tenant.data_region
        pool = self.shared_pools.get(region)
        conn = await pool.acquire()

        if tenant.isolation == 'schema':
            await conn.execute(
                f"SET search_path TO tenant_{tenant.id}, public"
            )
        else:
            await conn.execute(
                "SET app.current_tenant_id = %s", [str(tenant.id)]
            )

        return conn
```

---

## 8. 深入探讨：资源配额与限流

### 每租户限制

| 资源 | 免费版 | 专业版 | 企业版 |
|------|--------|--------|--------|
| API 调用/月 | 10,000 | 1,000,000 | 无限 |
| 存储 | 1 GB | 100 GB | 自定义 |
| 用户数 | 5 | 500 | 无限 |
| 项目数 | 3 | 无限 | 无限 |
| Webhooks | 1 | 10 | 100 |
| API 速率限制 | 10 请求/秒 | 100 请求/秒 | 1,000 请求/秒 |
| 导出大小 | 100 MB | 10 GB | 无限 |
| 数据保留 | 90 天 | 1 年 | 自定义 |

### 限流实现

```python
class TenantRateLimiter:
    """Sliding window rate limiter per tenant."""

    def __init__(self, redis: Redis):
        self.redis = redis

    async def check_rate_limit(
        self, tenant_id: str, plan_limits: dict
    ) -> tuple[bool, dict]:
        key = f"rate:{tenant_id}:{current_minute()}"
        limit = plan_limits['api_rate_per_second']

        pipe = self.redis.pipeline()
        pipe.incr(key)
        pipe.expire(key, 120)  # 2 min TTL
        count, _ = await pipe.execute()

        remaining = max(0, limit - count)
        allowed = count <= limit

        headers = {
            'X-RateLimit-Limit': str(limit),
            'X-RateLimit-Remaining': str(remaining),
            'X-RateLimit-Reset': str(next_minute_epoch()),
        }

        if not allowed:
            headers['Retry-After'] = str(seconds_until_reset())

        return allowed, headers
```

### 嘈杂邻居预防

```
+-------------------------------------------------------+
|              公平调度架构                               |
+-------------------------------------------------------+
|                                                        |
|  请求队列（���租户）                                     |
|  ┌──────────┐ ┌──────────┐ ┌──────────┐              |
|  │ 租户 A   │ │ 租户 B   │ │ 租户 C   │  ...          |
|  │ ████░░░░ │ │ ██░░░░░░ │ │ ██████░░ │              |
|  └────┬─────┘ └────┬─────┘ └────┬─────┘              |
|       │             │             │                    |
|       v             v             v                    |
|  +------------------------------------------+         |
|  │     加权公平队列 (WFQ)                    │         |
|  │     免费=1x  专业=5x  企业=20x            │         |
|  +------------------------------------------+         |
|       │                                               |
|       v                                               |
|  +------------------------------------------+         |
|  │     工作线程池（自动扩展）                  │         |
|  │     每租户并发限制                         │         |
|  +------------------------------------------+         |
|                                                        |
|  熔断器：如果租户 X 消耗 > 30% 共享资源                 |
|  超过 60 秒，则限流至套餐限制                           |
+-------------------------------------------------------+
```

---

## 9. 深入探讨：配置与定制化

### 每租户功能开关

```sql
CREATE TABLE tenant_features (
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    feature_key     VARCHAR(100) NOT NULL,
    enabled         BOOLEAN NOT NULL DEFAULT false,
    config          JSONB DEFAULT '{}',
    PRIMARY KEY (tenant_id, feature_key)
);

-- 基于套餐的默认值
CREATE TABLE plan_features (
    plan            VARCHAR(50) NOT NULL,
    feature_key     VARCHAR(100) NOT NULL,
    enabled         BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (plan, feature_key)
);
```

```python
class FeatureService:
    """Resolve features: tenant override > plan default > global default."""

    async def is_enabled(self, tenant: Tenant, feature: str) -> bool:
        # Check tenant-specific override
        override = await self.cache.get(
            f"feature:{tenant.id}:{feature}"
        )
        if override is not None:
            return override

        # Check plan defaults
        plan_default = await self.cache.get(
            f"plan_feature:{tenant.plan}:{feature}"
        )
        if plan_default is not None:
            return plan_default

        # Global default
        return False
```

### 自定义品牌

```sql
CREATE TABLE tenant_branding (
    tenant_id       UUID PRIMARY KEY REFERENCES tenants(id),
    logo_url        TEXT,
    favicon_url     TEXT,
    primary_color   VARCHAR(7),     -- #hex
    accent_color    VARCHAR(7),
    custom_domain   VARCHAR(255),
    email_from_name VARCHAR(100),
    email_from_addr VARCHAR(255),
    custom_css      TEXT,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 自定义字段（可扩展数据模型）

```sql
CREATE TABLE custom_field_definitions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    entity_type     VARCHAR(50) NOT NULL,    -- 'project', 'task', etc.
    field_name      VARCHAR(100) NOT NULL,
    field_type      VARCHAR(20) NOT NULL,    -- 'text', 'number', 'date', 'select'
    options         JSONB,                    -- for select: ["High","Medium","Low"]
    required        BOOLEAN DEFAULT false,
    position        INTEGER DEFAULT 0,
    UNIQUE(tenant_id, entity_type, field_name)
);

-- Store custom field values in JSONB on the entity
-- projects.custom_fields JSONB: {"priority": "High", "budget": 50000}

-- Or use a separate EAV table for complex querying
CREATE TABLE custom_field_values (
    entity_type     VARCHAR(50) NOT NULL,
    entity_id       UUID NOT NULL,
    tenant_id       UUID NOT NULL,
    field_id        UUID NOT NULL REFERENCES custom_field_definitions(id),
    value_text      TEXT,
    value_number    DOUBLE PRECISION,
    value_date      DATE,
    PRIMARY KEY (entity_id, field_id)
);

CREATE INDEX idx_cfv_tenant_field ON custom_field_values(tenant_id, field_id);
```

---

## 10. 深入探讨：数据迁移与租户生命周期

### 租户配置流程

```
注册请求
       |
       v
+------+---------+
| 创建租户      |  --> PostgreSQL: INSERT INTO tenants
| 记录          |
+------+---------+
       |
       v
+------+---------+
| 配置          |  --> 免费版：无需操作（共享 schema + RLS）
| 数据层        |  --> 专业版：CREATE SCHEMA tenant_xxx
|               |  --> 企业版：配置专用数据库
+------+---------+
       |
       v
+------+---------+
| 初始化默认    |  --> 默认设置、角色、模板
| 配置          |
+------+---------+
       |
       v
+------+---------+
| 创建管理员    |  --> 第一个用户获得"所有者"角色
| 用户          |
+------+---------+
       |
       v
+------+---------+
| 发送欢迎      |  --> 包含入门指南的邮件
| 通知          |
+------+---------+
       |
       v
  租户就绪（免费/专业版 < 5 秒，企业版 < 2 分钟）
```

### 租户删除（GDPR 合规）

```python
async def delete_tenant(tenant_id: str):
    """GDPR Article 17: Right to erasure."""

    tenant = await get_tenant(tenant_id)

    # Phase 1: Soft delete (immediate)
    await db.execute("""
        UPDATE tenants SET status = 'pending_deletion',
        deletion_scheduled_at = now() + INTERVAL '30 days'
        WHERE id = $1
    """, tenant_id)

    # Block all API access immediately
    await redis.set(f"tenant:blocked:{tenant_id}", "1")
    await invalidate_all_sessions(tenant_id)

    # Phase 2: Hard delete (after 30-day grace period)
    # Runs via scheduled job
    async def hard_delete():
        if tenant.isolation == 'dedicated':
            await drop_database(tenant.database_name)
        elif tenant.isolation == 'schema':
            await db.execute(f"DROP SCHEMA tenant_{tenant_id} CASCADE")
        else:
            # Shared schema: delete all rows
            for table in TENANT_TABLES:
                await db.execute(
                    f"DELETE FROM {table} WHERE tenant_id = $1",
                    tenant_id
                )

        # Delete from object storage
        await s3.delete_prefix(f"tenants/{tenant_id}/")

        # Delete from search index
        await elasticsearch.delete_by_query(
            index="*", body={"query": {"term": {"tenant_id": tenant_id}}}
        )

        # Delete from cache
        await redis.delete_pattern(f"*:{tenant_id}:*")

        # Final: remove tenant record
        await db.execute("DELETE FROM tenants WHERE id = $1", tenant_id)

        # Audit: log deletion completion
        await audit_log.record(
            action='tenant_deleted',
            tenant_id=tenant_id,
            details={'deletion_type': 'gdpr_erasure'}
        )
```

### 数据导入/导出

```python
class TenantDataExporter:
    """Export all tenant data as a portable archive."""

    async def export(self, tenant_id: str) -> str:
        export_id = str(uuid4())

        # Export structured data as JSON
        for table in TENANT_TABLES:
            rows = await db.fetch(
                f"SELECT * FROM {table} WHERE tenant_id = $1",
                tenant_id
            )
            await s3.put(
                f"exports/{export_id}/{table}.json",
                json.dumps(rows, default=str)
            )

        # Export files/attachments
        files = await s3.list_objects(f"tenants/{tenant_id}/")
        for file in files:
            await s3.copy(
                file.key,
                f"exports/{export_id}/files/{file.name}"
            )

        # Create downloadable archive
        archive_url = await create_signed_url(
            f"exports/{export_id}/", expires_in=86400
        )

        return archive_url
```

---

## 11. 深入探讨：计费集成

### 使用量计量管道

```
应用服务
    |
    | （发送事件）
    v
+----------+     +----------+     +---------------+
|  Kafka   | --> | Flink /  | --> | usage_daily   |
| （事件）  |     | Consumer |     | （已聚合）     |
+----------+     +----------+     +---------------+
                                         |
                                         v
                                  +---------------+
                                  | 计费          |
                                  | 服务          |
                                  | （月度        |
                                  |  账单）       |
                                  +---------------+
```

```sql
-- Daily aggregated usage
CREATE TABLE usage_daily (
    tenant_id       UUID NOT NULL,
    date            DATE NOT NULL,
    metric          VARCHAR(50) NOT NULL,  -- 'api_calls', 'storage_bytes', 'seats'
    value           BIGINT NOT NULL,
    PRIMARY KEY (tenant_id, date, metric)
);

-- Plan enforcement check
CREATE OR REPLACE FUNCTION check_plan_limit(
    p_tenant_id UUID,
    p_metric VARCHAR,
    p_increment BIGINT
) RETURNS BOOLEAN AS $$
DECLARE
    current_usage BIGINT;
    plan_limit BIGINT;
BEGIN
    SELECT value INTO current_usage
    FROM usage_daily
    WHERE tenant_id = p_tenant_id
      AND date = CURRENT_DATE
      AND metric = p_metric;

    SELECT limits->>p_metric INTO plan_limit
    FROM tenants t JOIN plans p ON t.plan = p.name
    WHERE t.id = p_tenant_id;

    RETURN COALESCE(current_usage, 0) + p_increment <= plan_limit;
END;
$$ LANGUAGE plpgsql;
```

### 超额处理

```python
class UsageEnforcer:
    """Enforce plan limits with soft and hard caps."""

    async def check_and_enforce(
        self, tenant: Tenant, metric: str, increment: int = 1
    ) -> EnforcementResult:
        usage = await self.get_current_usage(tenant.id, metric)
        limit = tenant.plan_limits[metric]

        ratio = (usage + increment) / limit

        if ratio <= 1.0:
            return EnforcementResult(allowed=True)
        elif ratio <= 1.1:  # 10% soft overage
            await self.notify_approaching_limit(tenant, metric, usage, limit)
            return EnforcementResult(allowed=True, warning=True)
        elif tenant.plan_allows_overage:
            # Bill overage at the end of the cycle
            await self.record_overage(tenant.id, metric, increment)
            return EnforcementResult(allowed=True, overage=True)
        else:
            # Hard limit reached
            return EnforcementResult(
                allowed=False,
                error=f'Plan limit exceeded: {metric} ({usage}/{limit})'
            )
```

---

## 12. 扩展策略

### 数据库扩展

| 层级 | 策略 | 详情 |
|------|------|------|
| **免费版** | 共享表，共享池 | RLS，所有免费租户共享 500 个连接 |
| **专业版** | 共享数据库，独立 schema | 专用 schema，每区域共享连接池 |
| **企业版** | 每租户专用数据库 | 完全隔离，专用连接池，自定义区域 |

### 连接池（PgBouncer）

```
100K 免费租户 ─────┐
                    │    PgBouncer（事务模式）
5K 专业租户 ────────┼──> 最大 500 连接 ──> PostgreSQL 主库
                    │                      PostgreSQL 副本 x3
200 企业租户 ───────┘    （每区域）
```

### 缓存策略

```
第 1 层：应用缓存（进程内，100ms TTL）
  └─ 租户配置、功能开关、套餐限制

第 2 层：Redis（分布式，5 分钟 TTL）
  ├─ 租户元数据：tenant:{id} -> {plan, status, config}
  ├─ 用户会话：session:{token} -> {user_id, tenant_id, role}
  ├─ 速率计数器：rate:{tenant_id}:{minute} -> count
  └─ 功能开关：feature:{tenant_id}:{key} -> enabled

第 3 层：读副本（每区域）
  └─ 应用数据读取、搜索查询、分析

第 4 层：CDN（静态资源）
  └─ 租户 Logo、自定义 CSS、文件附件
```

### 热点租户处理

```python
class HotTenantDetector:
    """Detect and mitigate tenants causing disproportionate load."""

    async def monitor(self):
        while True:
            # Check per-tenant resource consumption
            for tenant_id, metrics in await self.get_tenant_metrics():
                cpu_share = metrics.cpu_percent
                db_share = metrics.db_query_percent
                cache_hit_rate = metrics.cache_hit_rate

                if cpu_share > 20 or db_share > 15:
                    await self.escalate(tenant_id, metrics)

    async def escalate(self, tenant_id: str, metrics):
        tenant = await self.get_tenant(tenant_id)

        if tenant.plan == 'free':
            # Throttle aggressively
            await self.apply_throttle(tenant_id, rate=5)
        elif tenant.plan == 'professional':
            # Suggest upgrade, mild throttle
            await self.notify_upgrade(tenant_id)
            await self.apply_throttle(tenant_id, rate=50)
        else:
            # Enterprise: scale dedicated resources
            await self.auto_scale_tenant(tenant_id)
```

---

## 13. 部署架构

```
+------------------------------------------------------------------+
|                    多区域部署                                       |
+------------------------------------------------------------------+
|                                                                    |
|  区域：US-East-1（主要）                                           |
|  ┌──────────────────────────────────────────────────────────────┐ |
|  │  Kubernetes 集群                                              │ |
|  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │ |
|  │  │ API 网关 │ │ 应用 Pod │ │ 认证 Pod │ │ 配置     │      │ |
|  │  │ (Nginx)  │ │ (x20)   │ │ (x5)    │ │ Pod (x3) │      │ |
|  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘      │ |
|  │  ┌──────────┐ ┌──────────┐ ┌──────────┐                    │ |
|  │  │ 工作线程 │ │ 计费     │ │ 导出     │                    │ |
|  │  │ Pod(x10) │ │ Pod (x3) │ │ Pod(x3)  │                    │ |
|  │  └──────────┘ └──────────┘ └──────────┘                    │ |
|  └──────────────────────────────────────────────────────────────┘ |
|  ┌──────────────────────────────────────────────────────────────┐ |
|  │  数据层                                                      │ |
|  │  ┌──────────────┐ ┌──────────┐ ┌───────────┐ ┌──────────┐ │ |
|  │  │ PostgreSQL   │ │ Redis    │ │ Elastic-  │ │ Kafka    │ │ |
|  │  │ 主库 +       │ │ 集群     │ │ search    │ │ 集群     │ │ |
|  │  │ 3 副本       │ │ (6 节点) │ │ (3 节点)  │ │ (6 节点) │ │ |
|  │  └──────────────┘ └──────────┘ └───────────┘ └──────────┘ │ |
|  └──────────────────────────────────────────────────────────────┘ |
|                                                                    |
|  区域：EU-West-1（数据驻留）                                       |
|  ┌──────────────────────────────────────────────────────────────┐ |
|  │  为欧盟租户提供相同拓扑（GDPR 数据驻留）                       │ |
|  │  仅平台级数据进行跨区域复制                                    │ |
|  └──────────────────────────────────────────────────────────────┘ |
|                                                                    |
|  企业租户（专用）                                                  |
|  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐             |
|  │ 租户 A       │ │ 租户 B       │ │ 租户 C       │             |
|  │ 专用数据库   │ │ 专用数据库   │ │ 专用数据库   │             |
|  │ (us-east-1)  │ │ (eu-west-1)  │ │ (ap-south-1) │             |
|  └──────────────┘ └──────────────┘ └──────────────┘             |
+------------------------------------------------------------------+
```

---

## 14. 常见面试追问

**问：如何防止租户之间的数据泄露？**

通过 4 层纵深防御：
1. **API 网关**：在每个请求上提取并验证租户上下文
2. **中间件**：设置 PostgreSQL 会话变量（`app.current_tenant_id`）
3. **行级安全（RLS）**：数据库自动强制执行 tenant_id 过滤
4. **查询构建器**：应用代码始终包含 `WHERE tenant_id = ?` 作为安全网
此外，运行自动化渗透测试，尝试跨租户数据访问。

---

**问：如何处理消耗过多资源的"嘈杂邻居"租户？**

1. **检测**：通过带标签的指标监控每租户的 CPU、数据库查询、缓存使用
2. **短期**：应用每租户的限流和连接限制
3. **中期**：将租户迁移到专用分片或 schema
4. **长期**：提供升级到专用基础设施（企业版套餐）
5. **预防**：加权公平队列确保没有单个租户获得超出其份额的资源

---

**问：如何在 100K 租户间运行数据库迁移？**

对于共享 schema（行级）：标准迁移一次性应用于所有租户。
对于独立 schema：使用迁移编排器遍历各 schema：
```python
for schema in get_all_tenant_schemas():
    await run_migration(schema, migration_file)
    # Rate limit: 10 schemas/second to avoid overloading DB
```
对于专用数据库：使用金丝雀发布的滚动部署——先迁移 1% 的数据库，验证，然后继续。

---

**问：如何支持数据驻留要求？**

1. 根据 `data_region` 字段将租户路由到特定区域的数据库集群
2. 将文件存储在特定区域的 S3 存储桶中
3. 确保 Kafka 主题和 Elasticsearch 索引是区域范围的
4. 平台元数据（租户目录）全球复制，但租户数据保留在区域内
5. 使用 GeoDNS 或全局负载均衡器将 API 请求路由到最近的区域集群

---

**问：如何在不分叉代码库的情况下处理租户特定定制？**

1. **功能开关**：无需代码更改即可按租户启用/禁用功能
2. **配置**：将租户偏好存储在 JSONB 中（`settings` 列）
3. **自定义字段**：EAV 或 JSONB 模式用于实体上的用户自定义字段
4. **Webhooks**：允许租户用自己的系统响应事件
5. **插件系统**：定义扩展点，租户可以注入自定义逻辑（例如，以基于 JSON 的 DSL 存储的自定义验证规则）
永远不要分叉代码库——所有租户运行相同版本。

---

**问：如何为企业租户实现 SSO？**

1. 每个企业租户配置其身份提供商（IdP）——Okta、Azure AD 等
2. 在 `tenant_sso_configs` 表中存储每租户的 SAML/OIDC 元数据
3. 登录流程：用户输入邮箱 -> 从邮箱域名检测租户 -> 重定向到租户的 IdP -> 验证 SAML 断言 -> 创建/更新本地用户 -> 签发会话
4. 支持 SP 发起和 IdP 发起的 SSO 流程
5. 允许降级到基于密码的认证作为紧急备用方案

---

**问：当租户订阅过期时会发生什么？**

1. **宽限期**（7 天）：完全访问，通过催款重试付款
2. **受限模式**（30 天）：只读访问，��能创建新数据
3. **已暂停**（60 天）：所有访问被阻止，数据保留
4. **计划删除**（90 天）：通知租户，然后清除所有数据
在每个阶段发送逐步升级的通知。付款后允许立即重新激活。

---

**问：如何为多租户扩展搜索（Elasticsearch）？**

两种策略：
1. **每租户独立索引**（企业版）：完全隔离，易于删除，但限制在约 1000 个租户
2. **使用路由的共享索引**（免费/专业版）：使用 `_routing=tenant_id` 实现查询隔离和分片本地性。在每个查询中对 `tenant_id` 应用 `term` 过滤。设置 `index.routing.allocation.total_shards_per_node` 以防止热点。

对企业租户使用带有租户特定设置（分析器、字段限制）的索引模板。

---

## 15. 总结

### 关键架构决策

| 决策 | 选择 | 替代方案 | 理由 |
|------|------|----------|------|
| 隔离策略 | 混合（3 层） | 单一策略 | 平衡小租户的成本和大租户的隔离 |
| 租户标识 | JWT 声明 + 子域名 | 仅 API 密钥 | 同时支持 Web 应用和 API 客户端 |
| 数据隔离（免费版） | 行级安全（RLS） | 应用级过滤 | 数据库强制执行，防止开发者失误 |
| 数据隔离（企业版） | 专用数据库 | 带加密的共享 | 最强隔离，最易合规认证 |
| 元数据缓存 | Redis，5 分钟 TTL | 仅进程内缓存 | 跨 Pod 共享，一致性好，快速失效 |
| 连接池 | PgBouncer（事务模式） | 应用级连接池 | 以有限的数据库连接处理 100K+ 租户 |
| 使用量计量 | Kafka + Flink 聚合 | 同步计数 | 解耦，处理突发流量，精确一次处理 |
| 自定义字段 | 实体上的 JSONB + EAV 表 | 每租户动态 DDL | 运行时无 DDL，灵活查询，schema 安全 |
| 功能开关 | 每租户覆盖 > 套餐默认 | 仅全局开关 | 允许渐进式发布和租户特定启用 |
| 搜索 | 带路由的共享 Elasticsearch | 每租户独立索引 | 扩展到 100K 租户而不会索引爆炸 |
| 计费 | 事件溯源的使用量计量 | 同步配额检查 | 准确、可审计、无事件丢失 |
| 多区域 | 每租户区域路由 | 单区域 | GDPR 数据驻留合规 |

### 权衡取舍

| 权衡 | 方案 A | ���案 B | 我们的选择 |
|------|--------|--------|-----------|
| 隔离 vs. 成本 | 专用数据库（安全，昂贵） | 共享表（便宜，风险更高） | 混合：基于层级 |
| 入驻速度 vs. 隔离 | 即时（共享） | 分钟级（配置） | 免费版快速，企业版配置 |
| 定制化 vs. 复杂度 | 一切可配置 | 固定默认值 | 常见需求用配置，边缘场景用 Webhooks |
| 一致性 vs. 性能 | 每次写入强一致性 | 最终一致性 + 缓存 | 写入强一致性，读取缓存 5 分钟 TTL |
| 迁移简单性 vs. 灵活性 | 单 schema（一次迁移） | 每租户 schema（N 次迁移） | 大多数共享，仅在需要时使用独立 schema |
