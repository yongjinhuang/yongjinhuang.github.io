# Design a Multi-Tenant SaaS Platform

A multi-tenant SaaS platform serves multiple customer organizations (tenants) from a shared infrastructure while guaranteeing data isolation, performance isolation, and per-tenant customization. Systems like Salesforce, Slack, and Notion must handle thousands to millions of tenants with varying usage patterns, compliance requirements, and configuration needs -- all on shared compute, storage, and networking resources.

---

## Table of Contents

1. [Requirements Clarification](#1-requirements-clarification)
2. [API Design](#2-api-design)
3. [Data Model](#3-data-model)
4. [High-Level Architecture](#4-high-level-architecture)
5. [Deep Dive: Tenant Isolation Strategies](#5-deep-dive-tenant-isolation-strategies)
6. [Deep Dive: Row-Level Security](#6-deep-dive-row-level-security)
7. [Deep Dive: Request Routing](#7-deep-dive-request-routing)
8. [Deep Dive: Resource Quotas & Rate Limiting](#8-deep-dive-resource-quotas--rate-limiting)
9. [Deep Dive: Configuration & Customization](#9-deep-dive-configuration--customization)
10. [Deep Dive: Data Migration & Tenant Lifecycle](#10-deep-dive-data-migration--tenant-lifecycle)
11. [Deep Dive: Billing Integration](#11-deep-dive-billing-integration)
12. [Scaling Strategy](#12-scaling-strategy)
13. [Deployment Architecture](#13-deployment-architecture)
14. [Common Interview Follow-ups](#14-common-interview-follow-ups)
15. [Summary](#15-summary)

---

## 1. Requirements Clarification

### Functional Requirements

| # | Requirement | Details |
|---|-------------|---------|
| FR1 | Tenant onboarding | Self-service signup, workspace provisioning within seconds |
| FR2 | User management | Invite users, roles (owner/admin/member/guest), SSO integration |
| FR3 | Data isolation | Tenant A cannot see or access Tenant B's data under any circumstance |
| FR4 | Custom configuration | Per-tenant branding, feature flags, workflow customization |
| FR5 | Usage tracking | Track API calls, storage, seats per tenant for billing |
| FR6 | Multi-workspace | A user can belong to multiple tenant workspaces |
| FR7 | Admin console | Platform-level admin for tenant management, health monitoring |
| FR8 | API access | Per-tenant API keys with scoped permissions |
| FR9 | Data export | Tenants can export all their data (GDPR portability) |
| FR10 | Audit logging | Track all data access and modifications per tenant |

### Non-Functional Requirements

| # | Requirement | Target |
|---|-------------|--------|
| NFR1 | Data isolation | Zero data leakage between tenants |
| NFR2 | Performance isolation | One tenant's load spike must not degrade others |
| NFR3 | Availability | 99.99% uptime (< 52 min downtime/year) |
| NFR4 | Latency | p99 API response < 200ms |
| NFR5 | Scalability | Support 100K+ tenants, 10M+ users |
| NFR6 | Compliance | SOC 2, GDPR, HIPAA (for enterprise tier) |
| NFR7 | Data residency | Store data in tenant-specified region |
| NFR8 | Elasticity | Handle 10x traffic spikes per tenant |
| NFR9 | Tenant deletion | Full data purge within 30 days (GDPR) |
| NFR10 | Backward compatibility | API versioning without breaking existing tenants |

### Capacity Estimation

```
Tenants                  : 100,000
Users per tenant (avg)   : 100 (range: 1 - 500,000)
Total users              : 10,000,000
API requests/day         : 5 billion (avg 500 req/user/day)
Peak QPS                 : ~115,000 (2x avg during business hours)
Storage per tenant (avg) : 5 GB (range: 10 MB - 50 TB)
Total storage            : ~500 TB
Events per day           : 2 billion (usage tracking, audit)
```

---

## 2. API Design

### Tenant Identification

Every API request must carry tenant context. Three common approaches:

```
# Option A: Subdomain (recommended for web apps)
GET https://acme.app.example.com/api/v1/projects

# Option B: Header (recommended for API-first)
GET https://api.example.com/v1/projects
X-Tenant-ID: tenant_abc123

# Option C: JWT claim (extracted from auth token)
GET https://api.example.com/v1/projects
Authorization: Bearer eyJ...  # contains tenant_id claim
```

### Core Endpoints

```
# Tenant Management (Platform Admin)
POST   /platform/v1/tenants                  # Create tenant
GET    /platform/v1/tenants/:id              # Get tenant details
PATCH  /platform/v1/tenants/:id              # Update tenant config
DELETE /platform/v1/tenants/:id              # Schedule tenant deletion
GET    /platform/v1/tenants/:id/usage        # Get usage metrics

# User Management (Tenant Scoped)
POST   /api/v1/users/invite                  # Invite user
GET    /api/v1/users                          # List users in tenant
PATCH  /api/v1/users/:id/role                # Change role
DELETE /api/v1/users/:id                      # Remove user

# Application Resources (Tenant Scoped)
POST   /api/v1/projects                      # Create project
GET    /api/v1/projects                      # List projects
GET    /api/v1/projects/:id                  # Get project
PUT    /api/v1/projects/:id                  # Update project
DELETE /api/v1/projects/:id                  # Delete project

# Configuration
GET    /api/v1/settings                      # Get tenant settings
PATCH  /api/v1/settings                      # Update settings
GET    /api/v1/features                      # Get enabled features

# Data Export (GDPR)
POST   /api/v1/exports                       # Request data export
GET    /api/v1/exports/:id                   # Check export status
GET    /api/v1/exports/:id/download          # Download export
```

---

## 3. Data Model

### Strategy A: Shared Database, Shared Schema (Row-Level Isolation)

All tenants share the same tables. Every row has a `tenant_id` column.

```sql
-- Core tenant table
CREATE TABLE tenants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    slug            VARCHAR(63) UNIQUE NOT NULL,       -- subdomain
    plan            VARCHAR(50) NOT NULL DEFAULT 'free',
    status          VARCHAR(20) NOT NULL DEFAULT 'active',
    settings        JSONB NOT NULL DEFAULT '{}',
    data_region     VARCHAR(20) NOT NULL DEFAULT 'us-east-1',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Users belong to tenants via memberships
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

-- Application data with tenant_id on every table
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

-- Usage tracking
CREATE TABLE usage_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    event_type      VARCHAR(50) NOT NULL,
    quantity        BIGINT NOT NULL DEFAULT 1,
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
) PARTITION BY RANGE (recorded_at);

-- Audit log
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

### Strategy B: Shared Database, Separate Schema

Each tenant gets its own PostgreSQL schema within the same database.

```sql
-- Create schema per tenant
CREATE SCHEMA tenant_acme;

-- Tables live in tenant-specific schema
CREATE TABLE tenant_acme.projects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    created_by      UUID NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- No tenant_id column needed -- schema provides isolation

-- Switch schema per request
SET search_path TO tenant_acme, public;
SELECT * FROM projects;  -- queries tenant_acme.projects
```

### Strategy C: Separate Database Per Tenant

Each tenant gets a dedicated database instance.

```
tenant_acme_db  -->  PostgreSQL Instance 1 (us-east-1)
tenant_globex_db --> PostgreSQL Instance 2 (eu-west-1)
tenant_initech_db -> PostgreSQL Instance 3 (us-east-1)
```

---

## 4. High-Level Architecture

```
+------------------------------------------------------------------+
|                         CLIENTS                                    |
|  [Web App]    [Mobile App]    [API Clients]    [Admin Console]    |
+----------|-----------|-------------|----------------|-------------+
           |           |             |                |
           v           v             v                v
+------------------------------------------------------------------+
|                    API GATEWAY / LOAD BALANCER                     |
|  - TLS termination                                                |
|  - Tenant identification (subdomain / header / JWT)               |
|  - Rate limiting (per-tenant)                                     |
|  - Request routing                                                |
+------------------------------------------------------------------+
           |
           v
+------------------------------------------------------------------+
|                     TENANT CONTEXT MIDDLEWARE                      |
|  - Extract tenant_id from request                                 |
|  - Validate tenant status (active / suspended)                    |
|  - Set database connection / schema                               |
|  - Inject tenant context into request                             |
+------------------------------------------------------------------+
           |
           +------------------+------------------+
           |                  |                  |
           v                  v                  v
+------------------+ +------------------+ +------------------+
|   AUTH SERVICE   | |   APP SERVICES   | |  CONFIG SERVICE  |
| - JWT issuance   | | - Business logic | | - Feature flags  |
| - SSO / SAML     | | - CRUD ops       | | - Branding       |
| - RBAC           | | - Domain logic   | | - Plan limits    |
| - Session mgmt   | | - Webhooks       | | - Custom fields  |
+------------------+ +------------------+ +------------------+
           |                  |                  |
           v                  v                  v
+------------------------------------------------------------------+
|                      DATA ACCESS LAYER                            |
|  - Tenant-aware query builder (auto-inject tenant_id)            |
|  - Connection pool management (per-tenant or shared)              |
|  - Read replica routing                                           |
+------------------------------------------------------------------+
           |                  |                  |
           v                  v                  v
+------------------+ +------------------+ +------------------+
|   PostgreSQL     | |     Redis        | |  Elasticsearch   |
| (tenant data)    | | (cache, sessions)| | (search, logs)   |
+------------------+ +------------------+ +------------------+
           |
           v
+------------------------------------------------------------------+
|                      EVENT BUS (Kafka)                            |
+------------------------------------------------------------------+
     |              |               |              |
     v              v               v              v
+-----------+ +------------+ +------------+ +-------------+
| Usage     | | Audit Log  | | Webhook    | | Analytics   |
| Metering  | | Processor  | | Dispatcher | | Pipeline    |
+-----------+ +------------+ +------------+ +-------------+
```

---

## 5. Deep Dive: Tenant Isolation Strategies

### Comparison Matrix

| Dimension | Shared Schema (Row-Level) | Separate Schema | Separate Database |
|-----------|--------------------------|-----------------|-------------------|
| **Data isolation** | Logical (WHERE clause) | Logical (schema boundary) | Physical |
| **Onboarding speed** | Instant (insert row) | Seconds (CREATE SCHEMA) | Minutes (provision DB) |
| **Max tenants** | 1M+ | ~10,000 (schema limit) | ~1,000 (operational limit) |
| **Cross-tenant queries** | Easy (platform admin) | Moderate (query across schemas) | Hard (federated queries) |
| **Migration complexity** | Low (shared migrations) | Medium (per-schema migration) | High (per-DB migration) |
| **Noisy neighbor risk** | High (shared indexes) | Medium (shared buffer pool) | Low (dedicated resources) |
| **Compliance (HIPAA)** | Harder to certify | Moderate | Easiest to certify |
| **Cost per tenant** | Lowest | Low-Medium | Highest |
| **Backup/restore** | All-or-nothing | Per-schema possible | Per-tenant trivial |
| **Data residency** | Hard (same DB) | Hard (same DB) | Easy (DB per region) |

### Decision Matrix

```
                    Free/Starter     Professional      Enterprise
                    (< 100 users)    (100-10K users)   (> 10K users)
                    ┌───────────┐    ┌──────────────┐  ┌────────────┐
Isolation           │ Shared    │    │ Shared Schema│  │ Dedicated  │
Strategy            │ Schema    │    │ + RLS        │  │ Database   │
                    │ (Row-Level│    │              │  │            │
                    │  Security)│    │              │  │            │
                    └───────────┘    └──────────────┘  └────────────┘

Tenants Expected    100,000          5,000              200
Revenue/Tenant      $0-50/mo         $200-2000/mo       $10K-100K/mo
SLA                 99.9%            99.95%             99.99%
Data Residency      No               Optional           Required
```

### Hybrid Approach (Recommended)

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

## 6. Deep Dive: Row-Level Security

### PostgreSQL RLS Policies

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

### Middleware Pattern (Tenant Context Propagation)

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

### Query Builder (Defense in Depth)

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

## 7. Deep Dive: Request Routing

### Tenant Identification Flow

```
Request arrives
       |
       v
+------+--------+
| Extract tenant |
| identifier     |
+------+---------+
       |
       +-------- Subdomain? ---> acme.app.com --> lookup slug "acme"
       |
       +-------- JWT claim? ---> decode token --> extract tenant_id
       |
       +-------- Header? ------> X-Tenant-ID --> validate format
       |
       v
+------+---------+
| Lookup tenant  |  <-- Redis cache (TTL: 5 min)
| metadata       |  <-- Fallback: PostgreSQL
+------+---------+
       |
       v
+------+---------+
| Validate       |
| - Status=active|
| - Plan limits  |
| - Region match |
+------+---------+
       |
       v
+------+---------+
| Route to data  |
| source         |
+------+---------+
       |
       +----> Shared pool (free/starter)
       +----> Schema-specific pool (professional)
       +----> Dedicated connection (enterprise)
```

### Connection Pool Management

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

## 8. Deep Dive: Resource Quotas & Rate Limiting

### Per-Tenant Limits

| Resource | Free | Professional | Enterprise |
|----------|------|-------------|------------|
| API calls/month | 10,000 | 1,000,000 | Unlimited |
| Storage | 1 GB | 100 GB | Custom |
| Users | 5 | 500 | Unlimited |
| Projects | 3 | Unlimited | Unlimited |
| Webhooks | 1 | 10 | 100 |
| API rate limit | 10 req/s | 100 req/s | 1,000 req/s |
| Export size | 100 MB | 10 GB | Unlimited |
| Retention | 90 days | 1 year | Custom |

### Rate Limiting Implementation

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

### Noisy Neighbor Prevention

```
+-------------------------------------------------------+
|              FAIR SCHEDULING ARCHITECTURE              |
+-------------------------------------------------------+
|                                                        |
|  Request Queue (per tenant)                            |
|  ┌──────────┐ ┌──────────┐ ┌──────────┐              |
|  │ Tenant A │ │ Tenant B │ │ Tenant C │  ...          |
|  │ ████░░░░ │ │ ██░░░░░░ │ │ ██████░░ │              |
|  └────┬─────┘ └────┬─────┘ └────┬─────┘              |
|       │             │             │                    |
|       v             v             v                    |
|  +------------------------------------------+         |
|  │     Weighted Fair Queue (WFQ)            │         |
|  │     Free=1x  Pro=5x  Enterprise=20x     │         |
|  +------------------------------------------+         |
|       │                                               |
|       v                                               |
|  +------------------------------------------+         |
|  │     Worker Pool (auto-scaling)           │         |
|  │     Concurrency limit per tenant         │         |
|  +------------------------------------------+         |
|                                                        |
|  Circuit Breaker: If Tenant X consumes > 30% of       |
|  shared resources for > 60s, throttle to plan limit   |
+-------------------------------------------------------+
```

---

## 9. Deep Dive: Configuration & Customization

### Per-Tenant Feature Flags

```sql
CREATE TABLE tenant_features (
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    feature_key     VARCHAR(100) NOT NULL,
    enabled         BOOLEAN NOT NULL DEFAULT false,
    config          JSONB DEFAULT '{}',
    PRIMARY KEY (tenant_id, feature_key)
);

-- Plan-based defaults
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

### Custom Branding

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

### Custom Fields (Extensible Data Model)

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

## 10. Deep Dive: Data Migration & Tenant Lifecycle

### Tenant Provisioning Flow

```
Signup Request
       |
       v
+------+---------+
| Create tenant  |  --> PostgreSQL: INSERT INTO tenants
| record         |
+------+---------+
       |
       v
+------+---------+
| Provision      |  --> Free: nothing (shared schema + RLS)
| data layer     |  --> Pro: CREATE SCHEMA tenant_xxx
|                |  --> Enterprise: provision dedicated DB
+------+---------+
       |
       v
+------+---------+
| Seed default   |  --> Default settings, roles, templates
| configuration  |
+------+---------+
       |
       v
+------+---------+
| Create admin   |  --> First user gets 'owner' role
| user           |
+------+---------+
       |
       v
+------+---------+
| Send welcome   |  --> Email with getting-started guide
| notification   |
+------+---------+
       |
       v
  Tenant Ready (< 5 seconds for free/pro, < 2 min for enterprise)
```

### Tenant Deletion (GDPR Compliance)

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

### Data Import/Export

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

## 11. Deep Dive: Billing Integration

### Usage Metering Pipeline

```
App Services
    |
    | (emit events)
    v
+----------+     +----------+     +---------------+
|  Kafka   | --> | Flink /  | --> | usage_daily   |
| (events) |     | Consumer |     | (aggregated)  |
+----------+     +----------+     +---------------+
                                         |
                                         v
                                  +---------------+
                                  | Billing       |
                                  | Service       |
                                  | (monthly      |
                                  |  invoice)     |
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

### Overage Handling

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

## 12. Scaling Strategy

### Database Scaling

| Tier | Strategy | Details |
|------|----------|---------|
| **Free** | Shared tables, shared pool | RLS, 500 connections shared across all free tenants |
| **Professional** | Shared DB, separate schema | Dedicated schema, shared connection pool per region |
| **Enterprise** | Dedicated DB per tenant | Full isolation, dedicated connection pool, custom region |

### Connection Pooling (PgBouncer)

```
100K free tenants ─────┐
                        │    PgBouncer (transaction mode)
5K pro tenants ─────────┼──> max 500 connections ──> PostgreSQL Primary
                        │                            PostgreSQL Replica x3
200 enterprise tenants ─┘    (per region)
```

### Caching Strategy

```
Layer 1: Application Cache (in-process, 100ms TTL)
  └─ Tenant config, feature flags, plan limits

Layer 2: Redis (distributed, 5 min TTL)
  ├─ Tenant metadata: tenant:{id} -> {plan, status, config}
  ├─ User sessions: session:{token} -> {user_id, tenant_id, role}
  ├─ Rate counters: rate:{tenant_id}:{minute} -> count
  └─ Feature flags: feature:{tenant_id}:{key} -> enabled

Layer 3: Read Replicas (per region)
  └─ Application data reads, search queries, analytics

Layer 4: CDN (static assets)
  └─ Tenant logos, custom CSS, file attachments
```

### Hot Tenant Handling

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

## 13. Deployment Architecture

```
+------------------------------------------------------------------+
|                    MULTI-REGION DEPLOYMENT                         |
+------------------------------------------------------------------+
|                                                                    |
|  Region: US-East-1 (Primary)                                      |
|  ┌──────────────────────────────────────────────────────────────┐ |
|  │  Kubernetes Cluster                                          │ |
|  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │ |
|  │  │ API GW   │ │ App Pods │ │ Auth Pods│ │ Config   │      │ |
|  │  │ (Nginx)  │ │ (x20)   │ │ (x5)    │ │ Pods (x3)│      │ |
|  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘      │ |
|  │  ┌──────────┐ ┌──────────┐ ┌──────────┐                    │ |
|  │  │ Worker   │ │ Billing  │ │ Export   │                    │ |
|  │  │ Pods(x10)│ │ Pods (x3)│ │ Pods(x3) │                    │ |
|  │  └──────────┘ └──────────┘ └──────────┘                    │ |
|  └──────────────────────────────────────────────────────────────┘ |
|  ┌──────────────────────────────────────────────────────────────┐ |
|  │  Data Layer                                                  │ |
|  │  ┌──────────────┐ ┌──────────┐ ┌───────────┐ ┌──────────┐ │ |
|  │  │ PostgreSQL   │ │ Redis    │ │ Elastic-  │ │ Kafka    │ │ |
|  │  │ Primary +    │ │ Cluster  │ │ search    │ │ Cluster  │ │ |
|  │  │ 3 Replicas   │ │ (6 nodes)│ │ (3 nodes) │ │ (6 nodes)│ │ |
|  │  └──────────────┘ └──────────┘ └───────────┘ └──────────┘ │ |
|  └──────────────────────────────────────────────────────────────┘ |
|                                                                    |
|  Region: EU-West-1 (Data Residency)                               |
|  ┌──────────────────────────────────────────────────────────────┐ |
|  │  Same topology for EU tenants (GDPR data residency)          │ |
|  │  Cross-region replication for platform-level data only       │ |
|  └──────────────────────────────────────────────────────────────┘ |
|                                                                    |
|  Enterprise Tenants (Dedicated)                                    |
|  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐             |
|  │ Tenant A     │ │ Tenant B     │ │ Tenant C     │             |
|  │ Dedicated DB │ │ Dedicated DB │ │ Dedicated DB │             |
|  │ (us-east-1)  │ │ (eu-west-1)  │ │ (ap-south-1) │             |
|  └──────────────┘ └──────────────┘ └──────────────┘             |
+------------------------------------------------------------------+
```

---

## 14. Common Interview Follow-ups

**Q: How do you prevent data leakage between tenants?**

Defense in depth with 4 layers:
1. **API Gateway**: Extract and validate tenant context on every request
2. **Middleware**: Set PostgreSQL session variable (`app.current_tenant_id`)
3. **Row-Level Security**: Database enforces tenant_id filter automatically
4. **Query Builder**: Application code always includes `WHERE tenant_id = ?` as a safety net
Additionally, run automated penetration tests that attempt cross-tenant data access.

---

**Q: How do you handle a "noisy neighbor" tenant consuming excessive resources?**

1. **Detection**: Monitor per-tenant CPU, DB queries, cache usage via tagged metrics
2. **Short-term**: Apply per-tenant rate limiting and connection limits
3. **Medium-term**: Move the tenant to a dedicated shard or schema
4. **Long-term**: Offer upgrade to dedicated infrastructure (enterprise plan)
5. **Prevention**: Weighted fair queuing ensures no single tenant gets more than their share

---

**Q: How do you run database migrations across 100K tenants?**

For shared schema (row-level): Standard migrations apply to all tenants at once.
For separate schemas: Use a migration orchestrator that iterates through schemas:
```python
for schema in get_all_tenant_schemas():
    await run_migration(schema, migration_file)
    # Rate limit: 10 schemas/second to avoid overloading DB
```
For dedicated databases: Rolling deployment with canary -- migrate 1% of DBs, validate, then proceed.

---

**Q: How do you support data residency requirements?**

1. Route tenants to region-specific database clusters based on `data_region` field
2. Store files in region-specific S3 buckets
3. Ensure Kafka topics and Elasticsearch indices are region-scoped
4. Platform metadata (tenant directory) is replicated globally, but tenant data stays in-region
5. Use GeoDNS or a global load balancer to route API requests to the nearest regional cluster

---

**Q: How do you handle tenant-specific customizations without forking the codebase?**

1. **Feature flags**: Enable/disable capabilities per tenant without code changes
2. **Configuration**: Store tenant preferences in JSONB (`settings` column)
3. **Custom fields**: EAV or JSONB pattern for user-defined fields on entities
4. **Webhooks**: Allow tenants to react to events with their own systems
5. **Plugin system**: Define extension points where tenants can inject custom logic (e.g., custom validation rules stored as JSON-based DSL)
Never fork the codebase -- all tenants run the same version.

---

**Q: How do you implement SSO for enterprise tenants?**

1. Each enterprise tenant configures their Identity Provider (IdP) -- Okta, Azure AD, etc.
2. Store SAML/OIDC metadata per tenant in `tenant_sso_configs` table
3. Login flow: user enters email -> detect tenant from email domain -> redirect to tenant's IdP -> validate SAML assertion -> create/update local user -> issue session
4. Support both SP-initiated and IdP-initiated SSO flows
5. Allow fallback to password-based auth for break-glass scenarios

---

**Q: What happens when a tenant's subscription expires?**

1. **Grace period** (7 days): Full access, payment retry via dunning
2. **Restricted mode** (30 days): Read-only access, no new data creation
3. **Suspended** (60 days): All access blocked, data preserved
4. **Scheduled deletion** (90 days): Notify tenant, then purge all data
At each stage, send escalating notifications. Allow instant reactivation upon payment.

---

**Q: How do you scale search (Elasticsearch) for multi-tenant?**

Two strategies:
1. **Index-per-tenant** (enterprise): Full isolation, easy to delete, but limited to ~1000 tenants
2. **Shared index with routing** (free/pro): Use `_routing=tenant_id` for query isolation and shard locality. Apply a `term` filter on `tenant_id` in every query. Set `index.routing.allocation.total_shards_per_node` to prevent hot spots.

Use index templates with tenant-specific settings (analyzers, field limits) for enterprise tenants.

---

## 15. Summary

### Key Architecture Decisions

| Decision | Choice | Alternative | Reasoning |
|----------|--------|-------------|-----------|
| Isolation strategy | Hybrid (3-tier) | Single strategy | Balances cost for small tenants and isolation for large ones |
| Tenant identification | JWT claim + subdomain | API key only | Supports both web apps and API clients |
| Data isolation (free) | Row-Level Security (RLS) | Application-level filtering | Database-enforced, prevents developer mistakes |
| Data isolation (enterprise) | Dedicated database | Shared with encryption | Strongest isolation, easiest compliance certification |
| Metadata cache | Redis with 5-min TTL | In-process cache only | Shared across pods, consistent, fast invalidation |
| Connection pooling | PgBouncer (transaction mode) | Application-level pooling | Handles 100K+ tenants with limited DB connections |
| Usage metering | Kafka + Flink aggregation | Synchronous counting | Decoupled, handles burst traffic, exactly-once processing |
| Custom fields | JSONB on entity + EAV table | Dynamic DDL per tenant | No DDL at runtime, flexible querying, schema-safe |
| Feature flags | Per-tenant override > plan default | Global flags only | Allows gradual rollout and tenant-specific enablement |
| Search | Shared Elasticsearch with routing | Index-per-tenant | Scales to 100K tenants without index explosion |
| Billing | Event-sourced usage metering | Synchronous quota check | Accurate, auditable, no lost events |
| Multi-region | Region-per-tenant routing | Single region | GDPR data residency compliance |

### Trade-offs

| Trade-off | Option A | Option B | Our Choice |
|-----------|----------|----------|------------|
| Isolation vs. cost | Dedicated DB (safe, expensive) | Shared tables (cheap, riskier) | Hybrid: tier-based |
| Onboarding speed vs. isolation | Instant (shared) | Minutes (provisioned) | Fast for free, provisioned for enterprise |
| Customization vs. complexity | Everything configurable | Opinionated defaults | Config for common needs, webhooks for edge cases |
| Consistency vs. performance | Strong consistency per write | Eventual consistency + cache | Strong writes, cached reads with 5-min TTL |
| Migration simplicity vs. flexibility | Single schema (one migration) | Per-tenant schemas (N migrations) | Shared for most, per-schema only when needed |
