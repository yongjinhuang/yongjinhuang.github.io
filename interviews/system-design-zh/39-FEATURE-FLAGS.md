# 设计功能开关系统

功能开关系统（也称为 feature toggles）允许工程团队将代码部署与功能发布解耦，通过将新功能包装在运行时可配置的开关后面实现。LaunchDarkly、Unleash 和 Flagsmith 等系统提供集中化的开关管理、用户定向投放、百分比灰度发布、A/B 实验以及向服务端和客户端 SDK 的实时传播能力，从而支持渐进式交付、canary 发布和无需重新部署的即时熔断开关。

---

## 目录

1. [需求澄清](#1-需求澄清)
2. [API 设计](#2-api-设计)
3. [数据模型](#3-数据模型)
4. [高层架构](#4-高层架构)
5. [深入探讨：开关评估引擎](#5-深入探讨开关评估引擎)
6. [深入探讨：定向投放规则](#6-深入探讨定向投放规则)
7. [深入探讨：SDK 架构](#7-深入探讨sdk-架构)
8. [深入探讨：实时开关更新](#8-深入探讨实时开关更新)
9. [深入探讨：实验与 A/B Testing](#9-深入探讨实验与-ab-testing)
10. [深入探讨：开关生命周期管理](#10-深入探讨开关生命周期管理)
11. [深入探讨：多环境支持](#11-深入探讨多环境支持)
12. [扩展策略](#12-扩展策略)
13. [部署架构](#13-部署架构)
14. [常见面试追问](#14-常见面试追问)
15. [总结](#15-总结)

---

## 1. 需求澄清

### 功能性需求

| # | 需求 | 描述 |
|---|------|------|
| 1 | 开关创建与管理 | 创建 boolean、string、number 和 JSON 多变体开关，每个环境设置默认值 |
| 2 | 定向投放规则 | 根据用户属性（email、国家、套餐、自定义属性）结合 AND/OR 条件评估开关 |
| 3 | 百分比灰度发布 | 将开关逐步灰度发布给一定百分比的用户，保证分配一致性（同一用户始终看到相同值） |
| 4 | A/B Testing / 实验 | 将用户分配到实验变体中，追踪事件，计算统计显著性 |
| 5 | 熔断开关 | 在数秒内跨所有环境和 SDK 全局禁用某个开关 |
| 6 | 审计日志 | 不可变的记录，包含每次开关变更、操作者、时间和变更前的值 |
| 7 | 用户分组 | 定义可复用的用户组（如 "Beta 测试用户"、"企业客户"）并将开关定向到分组 |
| 8 | 定时发布 | 安排开关状态在未来某个日期/时间变更（如午夜上线） |
| 9 | 开关依赖 | 定义前置开关——开关 B 仅在开关 A 启用时才会评估 |
| 10 | Webhooks 与集成 | 当开关变更时通知外部系统（Slack、Datadog、CI/CD） |
| 11 | SDK 支持 | 提供服务端 SDK（Node、Python、Go、Java）和客户端 SDK（JavaScript、React、iOS、Android） |
| 12 | 多环境 | 开发、预发布和生产环境各自独立的开关配置 |

### 非功能性需求

| # | 需求 | 目标 |
|---|------|------|
| 1 | 开关评估延迟（服务端 SDK） | < 1ms（本地评估，无网络调用） |
| 2 | 开关评估延迟（客户端 SDK） | < 10ms（从缓存启动，后续通过流式更新） |
| 3 | 开关更新传播 | 从保存到所有已连接 SDK < 500ms |
| 4 | 可用性 | 99.99%（每年停机 < 52.6 分钟） |
| 5 | SDK 弹性 | 当服务不可达时优雅降级到缓存/默认值 |
| 6 | 一致性 | 在给定开关配置下，同一用户始终获得相同的开关值（sticky bucketing） |
| 7 | 可扩展性 | 100K 个已连接 SDK，每天 10 亿次开关评估 |
| 8 | 审计保留 | 热存储 2 年，冷存储 7 年 |
| 9 | 安全性 | 项目/环境级 RBAC，API key 作用域限定，开关规则中不含 PII |
| 10 | 多租户 | 每个团队隔离的项目，各自拥有独立的 API key 和权限 |

### 容量估算

```
开关配置：
  组织数量：              10,000
  每个组织的项目数：      5（平均）
  每个项目的环境数：      3（dev、staging、prod）
  每个项目的开关数：      200（平均）
  总开关配置数：          10K * 5 * 3 * 200 = 3000 万个 开关-环境对
  平均配置大小：          2 KB（开关 + 规则 + 分组）
  总配置存储：            3000 万 * 2 KB = 60 GB

SDK 连接：
  服务端 SDK：            50,000 个已连接实例（长连接）
  客户端 SDK：            500,000 个并发浏览器/移动端会话
  总连接数：              550,000 个持久 SSE/WebSocket 连接

开关评估：
  服务端：                每天 5 亿次评估（本地评估，无网络开销）
  客户端：                每天 5 亿次评估（启动后本地评估）
  总计：                  每天 10 亿次评估
  注意：评估在 SDK 本地进行——对服务器零负载

API 流量（管理 + 流式）：
  开关配置拉取：          每小时 55 万次初始引导（SDK 重启、新会话）
  SSE 连接：              55 万个持久连接
  管理 API：              每天 1 万次开关变更（写入）
  Webhook 投递：          每天 1 万 * 3 个集成 = 每天 3 万次

流式基础设施：
  每个节点的 SSE 连接数： 50K（使用 epoll/kqueue）
  所需节点数：            55 万 / 5 万 = 11 个节点（最少）
  3 倍冗余：              跨 3 个区域共 33 个节点

事件收集（实验）：
  实验事件：              每天 1 亿个事件
  事件大小：              200 bytes
  每日摄入：              1 亿 * 200B = 每天 20 GB
  每月存储：              每月 600 GB

审计日志：
  每天开关变更数：        1 万
  审计条目大小：          1 KB（包含变更前后快照）
  每天：                  10 MB
  每年：                  3.6 GB（数据量小——存在 PostgreSQL 中即可）
```

---

## 2. API 设计

### 开关管理 API

```
POST   /api/v1/projects/{projectId}/flags                创建新开关
GET    /api/v1/projects/{projectId}/flags                列出开关（支持分页、搜索、标签）
GET    /api/v1/projects/{projectId}/flags/{flagKey}      获取开关详情
PUT    /api/v1/projects/{projectId}/flags/{flagKey}      更新开关元数据
DELETE /api/v1/projects/{projectId}/flags/{flagKey}      归档开关（软删除）

PATCH  /api/v1/projects/{projectId}/flags/{flagKey}/environments/{envKey}
       更新特定环境的开关配置（规则、灰度、启用状态）

POST   /api/v1/projects/{projectId}/flags/{flagKey}/environments/{envKey}/toggle
       切换开关开/关（熔断开关）

GET    /api/v1/projects/{projectId}/flags/{flagKey}/audit
       获取开关的审计历史
```

**POST /api/v1/projects/{projectId}/flags 请求：**
```json
{
  "key": "new-checkout-flow",
  "name": "New Checkout Flow",
  "description": "Redesigned checkout with single-page experience",
  "tags": ["checkout", "q1-2026"],
  "flagType": "boolean",
  "variations": [
    { "value": true, "name": "Enabled", "description": "Show new checkout" },
    { "value": false, "name": "Disabled", "description": "Show legacy checkout" }
  ],
  "defaults": {
    "onVariation": 0,
    "offVariation": 1
  },
  "temporary": true
}
```

**PATCH /api/v1/projects/{projectId}/flags/{flagKey}/environments/{envKey} 请求：**
```json
{
  "enabled": true,
  "rules": [
    {
      "description": "Beta testers get new checkout",
      "clauses": [
        {
          "attribute": "segment",
          "op": "segmentMatch",
          "values": ["beta-testers"]
        }
      ],
      "rollout": {
        "variations": [
          { "variation": 0, "weight": 100000 }
        ]
      }
    },
    {
      "description": "10% rollout to all users",
      "clauses": [],
      "rollout": {
        "variations": [
          { "variation": 0, "weight": 10000 },
          { "variation": 1, "weight": 90000 }
        ],
        "bucketBy": "userId"
      }
    }
  ],
  "fallthrough": {
    "variation": 1
  },
  "offVariation": 1
}
```

### 用户分组管理 API

```
POST   /api/v1/projects/{projectId}/segments            创建分组
GET    /api/v1/projects/{projectId}/segments            列出分组
PUT    /api/v1/projects/{projectId}/segments/{segKey}   更新分组
DELETE /api/v1/projects/{projectId}/segments/{segKey}   删除分组
```

**POST /api/v1/projects/{projectId}/segments 请求：**
```json
{
  "key": "beta-testers",
  "name": "Beta Testers",
  "description": "Users who opted into the beta program",
  "rules": [
    {
      "clauses": [
        { "attribute": "email", "op": "endsWith", "values": ["@company.com"] }
      ]
    },
    {
      "clauses": [
        { "attribute": "plan", "op": "in", "values": ["enterprise", "business"] },
        { "attribute": "betaOptIn", "op": "eq", "values": [true] }
      ]
    }
  ],
  "included": ["user-123", "user-456"],
  "excluded": ["user-789"]
}
```

### 服务端 SDK 接口

```
GET    /sdk/v1/flags/{envKey}
       获取某个环境的所有开关配置
       Headers: Authorization: sdk-key-{envKey}
       响应：用于本地评估的完整开关规则集

GET    /sdk/v1/flags/{envKey}/stream
       开关配置变更的 SSE 流
       Headers: Authorization: sdk-key-{envKey}
       响应：包含增量更新的 text/event-stream

POST   /sdk/v1/events/bulk
       批量提交评估和分析事件
       Headers: Authorization: sdk-key-{envKey}
```

### 客户端 SDK 接口

```
GET    /sdk/v1/evaluate/{envClientId}?user={base64UserContext}
       为给定用户上下文评估所有开关（服务端评估）
       返回：预计算的开关值（不暴露规则给客户端）

GET    /sdk/v1/evaluate/{envClientId}/stream?user={base64UserContext}
       为用户提供评估后开关值的 SSE 流
       返回：当配置变更时推送更新后的开关值

POST   /sdk/v1/events/client
       提交客户端事件（曝光、目标转化）
```

**GET /sdk/v1/flags/{envKey} 响应：**
```json
{
  "flags": {
    "new-checkout-flow": {
      "key": "new-checkout-flow",
      "version": 42,
      "enabled": true,
      "variations": [true, false],
      "rules": [
        {
          "clauses": [
            { "attribute": "segment", "op": "segmentMatch", "values": ["beta-testers"] }
          ],
          "rollout": { "variations": [{ "variation": 0, "weight": 100000 }] }
        },
        {
          "clauses": [],
          "rollout": {
            "variations": [
              { "variation": 0, "weight": 10000 },
              { "variation": 1, "weight": 90000 }
            ],
            "bucketBy": "userId"
          }
        }
      ],
      "fallthrough": { "variation": 1 },
      "offVariation": 1
    }
  },
  "segments": {
    "beta-testers": {
      "key": "beta-testers",
      "version": 7,
      "included": ["user-123", "user-456"],
      "excluded": ["user-789"],
      "rules": [
        {
          "clauses": [
            { "attribute": "email", "op": "endsWith", "values": ["@company.com"] }
          ]
        }
      ]
    }
  }
}
```

---

## 3. 数据模型

### PostgreSQL Schema

```sql
-- 组织和项目
CREATE TABLE organizations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(256) NOT NULL,
    slug        VARCHAR(128) UNIQUE NOT NULL,
    plan        VARCHAR(32) DEFAULT 'free',
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE projects (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID REFERENCES organizations(id) ON DELETE CASCADE,
    name        VARCHAR(256) NOT NULL,
    slug        VARCHAR(128) NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE(org_id, slug)
);

-- 环境（dev、staging、production）
CREATE TABLE environments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID REFERENCES projects(id) ON DELETE CASCADE,
    name            VARCHAR(128) NOT NULL,
    key             VARCHAR(64) NOT NULL,        -- "production", "staging", "development"
    color           VARCHAR(7),                  -- UI 用的十六进制颜色
    require_approval BOOLEAN DEFAULT FALSE,      -- 变更是否需要审批
    sdk_key         VARCHAR(256) UNIQUE NOT NULL, -- 服务端 SDK key
    client_id       VARCHAR(256) UNIQUE NOT NULL, -- 客户端 SDK 标识符
    created_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE(project_id, key)
);

-- 功能开关
CREATE TABLE flags (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID REFERENCES projects(id) ON DELETE CASCADE,
    key             VARCHAR(256) NOT NULL,       -- "new-checkout-flow"
    name            VARCHAR(512) NOT NULL,       -- "New Checkout Flow"
    description     TEXT,
    flag_type       VARCHAR(16) NOT NULL,        -- 'boolean', 'string', 'number', 'json'
    variations      JSONB NOT NULL,              -- [{"value": true}, {"value": false}]
    tags            TEXT[],
    temporary       BOOLEAN DEFAULT FALSE,       -- 标记为最终需要清理的开关
    archived        BOOLEAN DEFAULT FALSE,
    created_by      UUID NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE(project_id, key)
);

CREATE INDEX idx_flags_project_archived ON flags(project_id, archived);
CREATE INDEX idx_flags_tags ON flags USING GIN(tags);

-- 每个环境的开关配置
CREATE TABLE flag_environments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flag_id         UUID REFERENCES flags(id) ON DELETE CASCADE,
    environment_id  UUID REFERENCES environments(id) ON DELETE CASCADE,
    enabled         BOOLEAN DEFAULT FALSE,
    version         INTEGER DEFAULT 1,           -- 每次变更递增
    rules           JSONB DEFAULT '[]',          -- 有序的定向投放规则数组
    fallthrough     JSONB NOT NULL,              -- 无规则匹配时的默认规则
    off_variation   INTEGER NOT NULL,            -- 开关禁用时返回的变体索引
    prerequisites   JSONB DEFAULT '[]',          -- 前置开关条件
    scheduled_changes JSONB DEFAULT '[]',        -- 定时变更
    updated_at      TIMESTAMPTZ DEFAULT now(),
    updated_by      UUID,
    UNIQUE(flag_id, environment_id)
);

CREATE INDEX idx_flag_env_environment ON flag_environments(environment_id);
CREATE INDEX idx_flag_env_version ON flag_environments(environment_id, version);

-- 用户分组
CREATE TABLE segments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID REFERENCES projects(id) ON DELETE CASCADE,
    key             VARCHAR(256) NOT NULL,
    name            VARCHAR(512) NOT NULL,
    description     TEXT,
    rules           JSONB DEFAULT '[]',          -- 分组匹配规则
    included_users  TEXT[] DEFAULT '{}',          -- 显式包含的用户 key
    excluded_users  TEXT[] DEFAULT '{}',          -- 显式排除的用户 key
    version         INTEGER DEFAULT 1,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE(project_id, key)
);

-- 审计日志（仅追加）
CREATE TABLE audit_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL,
    project_id      UUID,
    environment_id  UUID,
    flag_key        VARCHAR(256),
    action          VARCHAR(64) NOT NULL,        -- 'flag.created', 'flag.updated', 'flag.toggled' 等
    actor_id        UUID NOT NULL,
    actor_email     VARCHAR(256),
    before_value    JSONB,                       -- 变更前快照
    after_value     JSONB,                       -- 变更后快照
    comment         TEXT,
    ip_address      INET,
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_audit_org_created ON audit_log(org_id, created_at DESC);
CREATE INDEX idx_audit_flag ON audit_log(flag_key, created_at DESC);
CREATE INDEX idx_audit_actor ON audit_log(actor_id, created_at DESC);

-- 实验
CREATE TABLE experiments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flag_id         UUID REFERENCES flags(id) ON DELETE CASCADE,
    environment_id  UUID REFERENCES environments(id) ON DELETE CASCADE,
    name            VARCHAR(512) NOT NULL,
    hypothesis      TEXT,
    metric_keys     TEXT[] NOT NULL,              -- ["checkout_conversion", "revenue_per_user"]
    status          VARCHAR(32) DEFAULT 'draft',  -- 'draft', 'running', 'paused', 'completed'
    start_date      TIMESTAMPTZ,
    end_date        TIMESTAMPTZ,
    winner_variation INTEGER,
    results         JSONB,                       -- 统计结果
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- API key 和 RBAC
CREATE TABLE api_keys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID REFERENCES organizations(id) ON DELETE CASCADE,
    name            VARCHAR(256) NOT NULL,
    key_hash        VARCHAR(256) NOT NULL,       -- API key 的 bcrypt 哈希
    key_prefix      VARCHAR(16) NOT NULL,        -- 前 8 个字符用于识别
    role            VARCHAR(32) NOT NULL,        -- 'admin', 'writer', 'reader'
    scoped_projects UUID[],                      -- NULL = 所有项目
    last_used_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now()
);
```

### Redis Schema（缓存与流式推送）

```
# 每个环境的完整开关配置缓存（用于 SDK 引导）
Key:     config:{env_sdk_key}
Type:    String（压缩后的 JSON）
TTL:     无（每次开关变更时更新）
Size:    每个环境约 50-200 KB

# 开关配置版本计数器
Key:     version:{env_sdk_key}
Type:    String（整数）
Use:     SDK 轮询版本号；如有变化则重新拉取配置

# 用于实时开关更新的 Pub/Sub 频道
Channel: flag_updates:{env_sdk_key}
Payload: {"flagKey": "new-checkout", "version": 43, "action": "update"}

# 客户端按用户评估的开关缓存
Key:     eval:{env_client_id}:{user_hash}
Type:    String（评估后开关值的 JSON）
TTL:     5 分钟
Size:    每个用户上下文约 5-20 KB

# 已连接 SDK 追踪
Key:     sdk_connections:{env_sdk_key}
Type:    Sorted Set（member = instanceId，score = last_heartbeat）
TTL:     无（通过 score 清理过期条目）
```

### 开关规则 JSON 结构（存储在 `flag_environments.rules` 中）

```json
[
  {
    "id": "rule-001",
    "description": "Internal employees",
    "clauses": [
      {
        "attribute": "email",
        "op": "endsWith",
        "values": ["@company.com"],
        "negate": false
      }
    ],
    "rollout": {
      "variations": [
        { "variation": 0, "weight": 100000 }
      ]
    }
  },
  {
    "id": "rule-002",
    "description": "Gradual rollout to paid users",
    "clauses": [
      {
        "attribute": "plan",
        "op": "in",
        "values": ["pro", "enterprise"]
      }
    ],
    "rollout": {
      "variations": [
        { "variation": 0, "weight": 25000 },
        { "variation": 1, "weight": 75000 }
      ],
      "bucketBy": "userId",
      "seed": 12345
    }
  }
]
```

---

## 4. 高层架构

```
                                   ┌──────────────────────┐
                                   │   Management Web UI  │
                                   │  (React Dashboard)   │
                                   └──────────┬───────────┘
                                              │ REST API
                                              ▼
                  ┌────────────────────────────────────────────────────┐
                  │              API Gateway / Load Balancer           │
                  └──────────┬───────────────────────┬────────────────┘
                             │                       │
                   ┌─────────▼──────────┐  ┌────────▼─────────────┐
                   │   Flag Management  │  │   SDK Service        │
                   │   Service          │  │   (Evaluation +      │
                   │   (CRUD, Rules,    │  │    Streaming)        │
                   │    Segments)       │  │                      │
                   └────────┬───────────┘  └───┬──────────┬───────┘
                            │                  │          │
                   ┌────────▼──────────────────▼──┐      │
                   │        PostgreSQL             │      │
                   │   (Flags, Rules, Segments,    │      │
                   │    Audit Log, Experiments)    │      │
                   └──────────────────────────┬────┘      │
                                              │           │
                   ┌──────────────────────────▼───────────▼───────┐
                   │              Redis Cluster                    │
                   │  (Config Cache, Pub/Sub, Eval Cache)         │
                   └──────┬──────────────────────┬───────────────┘
                          │                      │
            ┌─────────────▼────┐     ┌───────────▼──────────┐
            │  SSE/Streaming   │     │   Event Collector    │
            │  Gateway         │     │   Service            │
            │  (Flag Updates)  │     │   (Batch Ingest)     │
            └──┬─────────┬────┘     └──────────┬───────────┘
               │         │                     │
    ┌──────────▼──┐  ┌───▼──────────┐   ┌─────▼─────────────┐
    │ Server SDK  │  │ Client SDK   │   │  Analytics /       │
    │ (Node, Go,  │  │ (JS, React,  │   │  ClickHouse        │
    │  Python,    │  │  iOS,        │   │  (Experiment       │
    │  Java)      │  │  Android)    │   │   Results)         │
    │             │  │              │   └────────────────────┘
    │ ┌─────────┐ │  │ ┌─────────┐ │
    │ │ Local   │ │  │ │ Local   │ │
    │ │ Rule    │ │  │ │ Flag    │ │
    │ │ Engine  │ │  │ │ Cache   │ │
    │ └─────────┘ │  │ └─────────┘ │
    └─────────────┘  └─────────────┘
```

### 数据流

```
开关创建/更新流程：
┌────────┐    ┌──────────┐    ┌──────────┐    ┌───────┐    ┌───────────┐
│  UI /  │───▶│  Flag    │───▶│PostgreSQL│───▶│ Redis │───▶│SSE Gateway│
│  API   │    │  Service │    │  (write) │    │Pub/Sub│    │(broadcast)│
└────────┘    └──────────┘    └──────────┘    └───────┘    └─────┬─────┘
                    │                                            │
                    ▼                                            ▼
              ┌──────────┐                              ┌──────────────┐
              │Audit Log │                              │ Connected    │
              │  (write) │                              │ SDKs receive │
              └──────────┘                              │ update       │
                                                        └──────────────┘

开关评估流程（服务端 SDK）：
┌──────────────────────────────────────────────────────────┐
│                Server-Side SDK (in-process)              │
│                                                          │
│  evaluate("new-checkout", user) ──▶ Local Rule Engine    │
│                                     │                    │
│                                     ├─ Check prereqs     │
│                                     ├─ Match rules       │
│                                     ├─ Evaluate clauses  │
│                                     ├─ Hash for rollout  │
│                                     └─ Return variation  │
│                                                          │
│  无网络调用——亚毫秒级评估                                  │
└──────────────────────────────────────────────────────────┘
```

---

## 5. 深入探讨：开关评估引擎

### 评估算法

开关评估引擎是整个系统的核心。它在每个 SDK 内部本地运行，实现亚毫秒级评估且无需网络调用。

```
evaluate(flagKey, userContext):
  1. 从本地存储中查找开关配置
  2. 如果开关未找到 → 返回默认值
  3. 如果 flag.enabled == false → 返回 offVariation
  4. 检查前置条件（如果任何前置条件不满足 → 返回 offVariation）
  5. 检查个体用户定向（显式包含/排除列表）
  6. 按顺序评估规则（第一个匹配的规则生效）：
     a. 对于每条规则，评估所有子句（AND 逻辑）
     b. 如果所有子句都匹配 → 应用规则的灰度/变体
     c. 如果是灰度发布 → 对用户进行哈希分桶，按权重选择变体
  7. 如果没有规则匹配 → 应用 fallthrough 规则
  8. 记录评估事件（异步，批量处理）
```

### 伪代码实现

```python
class FlagEvaluator:
    def evaluate(self, flag_key: str, user: UserContext) -> EvalResult:
        flag = self.store.get_flag(flag_key)
        if flag is None:
            return EvalResult(
                value=self.defaults.get(flag_key),
                reason="FLAG_NOT_FOUND"
            )

        if not flag.enabled:
            return EvalResult(
                value=flag.variations[flag.off_variation],
                reason="FLAG_DISABLED"
            )

        # 检查前置条件
        for prereq in flag.prerequisites:
            prereq_result = self.evaluate(prereq.flag_key, user)
            if prereq_result.variation_index != prereq.variation:
                return EvalResult(
                    value=flag.variations[flag.off_variation],
                    reason="PREREQUISITE_FAILED"
                )

        # 检查个体定向（显式用户列表）
        for target in flag.targets:
            if user.key in target.values:
                return EvalResult(
                    value=flag.variations[target.variation],
                    reason="TARGET_MATCH"
                )

        # 按顺序评估规则
        for rule in flag.rules:
            if self._match_rule(rule, user):
                variation_index = self._apply_rollout(
                    rule.rollout, user, flag_key, rule.id
                )
                return EvalResult(
                    value=flag.variations[variation_index],
                    reason="RULE_MATCH",
                    rule_id=rule.id
                )

        # Fallthrough
        variation_index = self._apply_rollout(
            flag.fallthrough, user, flag_key, "fallthrough"
        )
        return EvalResult(
            value=flag.variations[variation_index],
            reason="FALLTHROUGH"
        )

    def _match_rule(self, rule: Rule, user: UserContext) -> bool:
        """所有子句必须匹配（AND 逻辑）。"""
        return all(
            self._match_clause(clause, user)
            for clause in rule.clauses
        )

    def _match_clause(self, clause: Clause, user: UserContext) -> bool:
        user_value = user.get_attribute(clause.attribute)
        if user_value is None:
            return False

        result = False
        if clause.op == "in":
            result = user_value in clause.values
        elif clause.op == "endsWith":
            result = any(user_value.endswith(v) for v in clause.values)
        elif clause.op == "startsWith":
            result = any(user_value.startswith(v) for v in clause.values)
        elif clause.op == "contains":
            result = any(v in user_value for v in clause.values)
        elif clause.op == "greaterThan":
            result = user_value > clause.values[0]
        elif clause.op == "lessThan":
            result = user_value < clause.values[0]
        elif clause.op == "semVerGreaterThan":
            result = parse_semver(user_value) > parse_semver(clause.values[0])
        elif clause.op == "segmentMatch":
            result = any(
                self._user_in_segment(seg_key, user)
                for seg_key in clause.values
            )
        elif clause.op == "regex":
            result = any(re.match(v, user_value) for v in clause.values)

        return (not result) if clause.negate else result
```

### 百分比灰度的 Consistent Hashing

Sticky bucketing 确保同一用户在给定开关配置下始终获得相同的变体。这使用 consistent hashing 而非随机分配。

```python
import hashlib

def _apply_rollout(
    self,
    rollout: Rollout,
    user: UserContext,
    flag_key: str,
    salt: str
) -> int:
    """根据百分比灰度确定用户获得哪个变体。"""
    if len(rollout.variations) == 1:
        return rollout.variations[0].variation

    # 确定分桶的 key
    bucket_by = rollout.bucket_by or "key"
    bucket_value = user.get_attribute(bucket_by)
    if bucket_value is None:
        return rollout.variations[-1].variation

    # 创建确定性哈希
    seed = rollout.seed or 0
    hash_input = f"{flag_key}.{salt}.{bucket_value}.{seed}"
    hash_bytes = hashlib.sha1(hash_input.encode()).digest()

    # 将前 4 个字节转换为整数，映射到 0-99999 范围
    hash_int = int.from_bytes(hash_bytes[:4], byteorder='big')
    bucket = hash_int % 100000  # 100,000 个桶，精度为 0.001%

    # 遍历变体权重找到匹配的桶
    cumulative = 0
    for weighted_var in rollout.variations:
        cumulative += weighted_var.weight
        if bucket < cumulative:
            return weighted_var.variation

    # 兜底返回最后一个变体
    return rollout.variations[-1].variation
```

### 分桶分布可视化

```
开关："new-checkout-flow"
灰度：30% 变体 A（新版），70% 变体 B（旧版）

哈希空间（0 - 99,999）：

|<---------- 30,000 ----------->|<--------------- 70,000 ----------------->|
|        Variation A             |            Variation B                   |
|        (new checkout)          |            (old checkout)                |
0                             30,000                                   99,999

用户 "alice" → SHA1("new-checkout-flow.rule-002.alice.0")
             → hash_int = 0x3A2B1C0D → 23847
             → 桶 23847 < 30000 → Variation A ✓

用户 "bob"   → SHA1("new-checkout-flow.rule-002.bob.0")
             → hash_int = 0x8F1E2D3C → 72341
             → 桶 72341 >= 30000 → Variation B ✓

关键特性：将灰度从 30% → 50% 只会新增用户。
          原本在 A 中的用户继续留在 A。没有人会从 A 切换到 B。
```

### 评估原因码

| 原因 | 描述 |
|------|------|
| `FLAG_NOT_FOUND` | 配置中不存在该开关 key |
| `FLAG_DISABLED` | 开关已关闭；返回 off variation |
| `PREREQUISITE_FAILED` | 某个前置开关未匹配期望的变体 |
| `TARGET_MATCH` | 用户命中了个体定向列表 |
| `RULE_MATCH` | 用户命中了定向投放规则 |
| `FALLTHROUGH` | 没有规则匹配；使用默认变体 |
| `ERROR` | 评估出错；返回应用默认值 |

---

## 6. 深入探讨：定向投放规则

### 规则评估顺序

```
┌─────────────────────────────────────────────────────────────┐
│                    开关评估流水线                              │
│                                                             │
│  1. 开关禁用？ ──是──▶ 返回 offVariation                     │
│         │ 否                                                │
│         ▼                                                   │
│  2. 前置条件满足？ ──否──▶ 返回 offVariation                  │
│         │ 是                                                │
│         ▼                                                   │
│  3. 个体定向                                                 │
│     用户在显式包含列表中？ ──是──▶ 返回目标变体                 │
│         │ 否                                                │
│         ▼                                                   │
│  4. 规则 1（最高优先级）                                      │
│     所有子句匹配？ ──是──▶ 应用灰度 ──▶ 返回                  │
│         │ 否                                                │
│         ▼                                                   │
│  5. 规则 2                                                   │
│     所有子句匹配？ ──是──▶ 应用灰度 ──▶ 返回                  │
│         │ 否                                                │
│         ▼                                                   │
│  6. ...（剩余规则）                                           │
│         │                                                   │
│         ▼                                                   │
│  7. Fallthrough ──▶ 应用默认灰度 ──▶ 返回                    │
└─────────────────────────────────────────────────────────────┘
```

### 支持的运算符

| 运算符 | 类型 | 描述 | 示例 |
|--------|------|------|------|
| `in` | String, Number | 精确匹配列表 | `country in ["US", "CA"]` |
| `notIn` | String, Number | 不在列表中 | `plan notIn ["free"]` |
| `endsWith` | String | 字符串后缀匹配 | `email endsWith ["@company.com"]` |
| `startsWith` | String | 字符串前缀匹配 | `email startsWith ["admin"]` |
| `contains` | String | 子字符串匹配 | `userAgent contains ["Mobile"]` |
| `regex` | String | 正则表达式 | `email regex ["^test.*@example"]` |
| `greaterThan` | Number | 数值比较 | `age greaterThan 18` |
| `lessThan` | Number | 数值比较 | `loginCount lessThan 5` |
| `before` | Date | 日期比较 | `signupDate before "2026-01-01"` |
| `after` | Date | 日期比较 | `signupDate after "2025-06-01"` |
| `semVerEqual` | SemVer | 语义化版本相等 | `appVersion semVerEqual "2.1.0"` |
| `semVerGreaterThan` | SemVer | 语义化版本大于 | `appVersion semVerGreaterThan "2.0.0"` |
| `segmentMatch` | Segment | 用户在分组中 | `segment segmentMatch ["beta-testers"]` |

### 基于分组的定向投放

分组是可复用的用户组，可以在多个开关中引用。

```
分组："enterprise-customers"
┌──────────────────────────────────────────────┐
│  包含用户：[user-ceo-1, user-ceo-2]          │  ← 始终包含
│                                              │
│  规则 1（与规则 2 为 OR 关系）：                │
│    plan == "enterprise"                      │
│                                              │
│  规则 2：                                     │
│    company_size > 500 AND plan == "business"  │
│                                              │
│  排除用户：[user-test-1]                      │  ← 始终排除
└──────────────────────────────────────────────┘

评估逻辑：
1. 如果用户在排除列表中 → 不在分组中
2. 如果用户在包含列表中 → 在分组中
3. 如果任何规则匹配 → 在分组中
4. 否则 → 不在分组中
```

### 百分比灰度策略

**简单百分比灰度：**
```json
{
  "description": "Gradual rollout to 25% of users",
  "clauses": [],
  "rollout": {
    "variations": [
      { "variation": 0, "weight": 25000 },
      { "variation": 1, "weight": 75000 }
    ],
    "bucketBy": "userId"
  }
}
```

**定向百分比灰度：**
```json
{
  "description": "50% of enterprise users get new feature",
  "clauses": [
    { "attribute": "plan", "op": "in", "values": ["enterprise"] }
  ],
  "rollout": {
    "variations": [
      { "variation": 0, "weight": 50000 },
      { "variation": 1, "weight": 50000 }
    ],
    "bucketBy": "orgId"
  }
}
```

**Canary 发布模式（多规则）：**
```json
{
  "rules": [
    {
      "description": "Step 1: Internal dogfood (always on)",
      "clauses": [
        { "attribute": "email", "op": "endsWith", "values": ["@company.com"] }
      ],
      "rollout": {
        "variations": [{ "variation": 0, "weight": 100000 }]
      }
    },
    {
      "description": "Step 2: 5% canary to pro users",
      "clauses": [
        { "attribute": "plan", "op": "in", "values": ["pro"] }
      ],
      "rollout": {
        "variations": [
          { "variation": 0, "weight": 5000 },
          { "variation": 1, "weight": 95000 }
        ],
        "bucketBy": "userId"
      }
    },
    {
      "description": "Step 3: 1% canary to everyone else",
      "clauses": [],
      "rollout": {
        "variations": [
          { "variation": 0, "weight": 1000 },
          { "variation": 1, "weight": 99000 }
        ],
        "bucketBy": "userId"
      }
    }
  ]
}
```

### 渐进式灰度时间线

```
Day 1    Day 3    Day 5    Day 7    Day 10   Day 14
  │        │        │        │        │        │
  ▼        ▼        ▼        ▼        ▼        ▼
┌────┐  ┌────┐  ┌─────┐  ┌──────┐ ┌───────┐ ┌──────────┐
│ 1% │  │ 5% │  │ 10% │  │ 25%  │ │  50%  │ │  100%    │
└────┘  └────┘  └─────┘  └──────┘ └───────┘ └──────────┘
  │        │        │        │        │        │
  └── 监控错误率、延迟、支持工单 ──┘
       如果检测到异常 → 自动回滚到 0%
```

---

## 7. 深入探讨：SDK 架构

### 服务端 SDK（Node.js 示例）

```
┌─────────────────────────────────────────────────────────┐
│              服务端 SDK 架构                               │
│                                                         │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────┐ │
│  │  Flag Store   │    │  Rule Engine  │    │  Event    │ │
│  │  (in-memory)  │◀──│  (evaluator)  │    │  Buffer   │ │
│  └──────┬───────┘    └──────────────┘    └─────┬─────┘ │
│         │                                      │       │
│  ┌──────▼────────┐                      ┌──────▼─────┐ │
│  │  Update       │                      │  Event     │ │
│  │  Processor    │                      │  Sender    │ │
│  │  (SSE stream) │                      │  (batch)   │ │
│  └──────┬────────┘                      └──────┬─────┘ │
│         │                                      │       │
└─────────┼──────────────────────────────────────┼───────┘
          │ SSE connection                       │ POST /events/bulk
          ▼                                      ▼
   ┌──────────────┐                     ┌──────────────┐
   │ Flag Service  │                     │Event Collector│
   └──────────────┘                     └──────────────┘
```

```typescript
// 服务端 SDK 使用方式
import { FeatureFlagClient } from '@flags/node-sdk';

const client = FeatureFlagClient.init({
  sdkKey: 'sdk-prod-xxxx',
  baseUrl: 'https://flags.example.com',
  updateMode: 'streaming',       // 'streaming' | 'polling'
  pollingInterval: 30_000,       // 回退轮询间隔（ms）
  connectTimeout: 5_000,
  flushInterval: 5_000,          // 事件刷新间隔（ms）
  flushBatchSize: 500,
  offlineMode: false,
});

// 等待初始开关数据加载完成
await client.waitForInitialization();

// 评估开关（本地，亚毫秒级）
const user = {
  key: 'user-123',
  email: 'alice@example.com',
  plan: 'enterprise',
  country: 'US',
  custom: {
    signupDate: '2025-03-15',
    betaOptIn: true,
  },
};

const showNewCheckout = client.boolVariation(
  'new-checkout-flow',
  user,
  false  // 开关未找到时的默认值
);

// 获取评估详情用于调试
const detail = client.boolVariationDetail(
  'new-checkout-flow',
  user,
  false
);
// detail = {
//   value: true,
//   variationIndex: 0,
//   reason: { kind: 'RULE_MATCH', ruleIndex: 0, ruleId: 'rule-001' }
// }

// 追踪转化事件用于实验
client.track('checkout_completed', user, {
  revenue: 49.99,
  currency: 'USD',
});

// 优雅关闭
process.on('SIGTERM', async () => {
  await client.close();  // 刷新待发送事件，关闭 SSE
});
```

### 客户端 SDK（React 示例）

```
┌─────────────────────────────────────────────────────────┐
│              客户端 SDK 架构                               │
│                                                         │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────┐ │
│  │  Flag Values  │    │  React       │    │  Event    │ │
│  │  (in-memory)  │    │  Hooks       │    │  Buffer   │ │
│  └──────┬───────┘    └──────────────┘    └─────┬─────┘ │
│         │                                      │       │
│  ┌──────▼────────┐                      ┌──────▼─────┐ │
│  │  SSE Stream   │                      │  Event     │ │
│  │  (evaluated   │                      │  Beacon    │ │
│  │   values)     │                      │  (sendBcn) │ │
│  └──────┬────────┘                      └──────┬─────┘ │
│         │                                      │       │
└─────────┼──────────────────────────────────────┼───────┘
          │ SSE（仅评估后的值）                     │ POST /events/client
          ▼                                      ▼
   ┌──────────────┐                     ┌──────────────┐
   │ SDK Service   │                     │Event Collector│
   │（在服务端     │                     └──────────────┘
   │ 进行评估）    │
   └──────────────┘
```

关键区别：客户端 SDK 接收的是**预计算的值**，而不是原始规则。这避免了将定向逻辑、用户分组和灰度百分比暴露给浏览器。

```tsx
// 客户端 SDK 使用方式（React）
import { FlagProvider, useFlag, useFlags } from '@flags/react-sdk';

function App() {
  const userContext = {
    key: 'user-123',
    email: 'alice@example.com',
    plan: 'enterprise',
  };

  return (
    <FlagProvider
      clientId="client-prod-xxxx"
      user={userContext}
      options={{
        bootstrap: 'localStorage',  // 加载时使用缓存值
        streaming: true,
      }}
    >
      <CheckoutPage />
    </FlagProvider>
  );
}

function CheckoutPage() {
  const showNewCheckout = useFlag('new-checkout-flow', false);
  const { flags, loading } = useFlags();

  if (loading) return <Skeleton />;

  return showNewCheckout
    ? <NewCheckoutFlow />
    : <LegacyCheckoutFlow />;
}
```

### 本地评估 vs. 远程评估

| 方面 | 本地评估（服务端 SDK） | 远程评估（客户端 SDK） |
|------|----------------------|----------------------|
| 规则执行位置 | 进程内（SDK） | 在开关服务上 |
| 发送到 SDK 的数据 | 完整规则集 + 分组 | 仅预计算的值 |
| 延迟 | < 1ms | 网络 RTT + 评估时间 |
| 安全性 | 规则在进程内存中可见 | 规则从不离开服务器 |
| 网络依赖 | 仅用于更新 | 每次评估都需要（或使用缓存） |
| 使用场景 | 后端服务 | 浏览器、移动应用 |
| 离线支持 | 完全支持（使用缓存的规则） | 部分支持（使用缓存的值） |

### 缓存策略

```
服务端 SDK 缓存：
┌─────────────────────────────────────────────────┐
│ 第 1 层：内存存储                                 │
│   初始化时加载完整开关配置                         │
│   通过 SSE 流实时更新                             │
│   评估：每个开关 O(rules)，约微秒级                │
├─────────────────────────────────────────────────┤
│ 第 2 层：持久化缓存（可选）                        │
│   基于文件或 Redis 缓存                           │
│   用于快速启动（跳过网络引导）                      │
│   每次配置更新时写入                               │
├─────────────────────────────────────────────────┤
│ 第 3 层：应用默认值                                │
│   SDK 初始化时硬编码的默认值                       │
│   在开关未找到或 SDK 未就绪时使用                   │
└─────────────────────────────────────────────────┘

客户端 SDK 缓存：
┌─────────────────────────────────────────────────┐
│ 第 1 层：内存（当前会话）                          │
│   评估后的开关值                                   │
│   通过 SSE 流更新                                 │
├─────────────────────────────────────────────────┤
│ 第 2 层：localStorage / AsyncStorage              │
│   跨页面加载/应用重启持久化                        │
│   从缓存引导 → 即时显示内容                        │
│   SSE 连接后用新值替换                             │
├─────────────────────────────────────────────────┤
│ 第 3 层：应用默认值                                │
│   无缓存且无连接时的兜底                           │
└─────────────────────────────────────────────────┘
```

---

## 8. 深入探讨：实时开关更新

### 流式架构（SSE）

```
┌──────────────┐     ┌──────────────┐     ┌───────────────────────────────┐
│ Flag Service │────▶│    Redis     │────▶│    SSE Gateway Cluster         │
│ (writes)     │     │   Pub/Sub   │     │                               │
└──────────────┘     └──────────────┘     │  Node 1: 50K connections     │
                                          │  Node 2: 50K connections     │
                                          │  Node 3: 50K connections     │
                                          │  ...                          │
                                          │  Node N: 50K connections     │
                                          └──────┬──────┬──────┬─────────┘
                                                 │      │      │
                                           ┌─────▼──┐ ┌─▼────┐ │
                                           │SDK A   │ │SDK B │ │...
                                           └────────┘ └──────┘
```

### 更新传播流程

```python
# Flag Service：开关更新时
async def update_flag(flag_key: str, env_key: str, changes: dict) -> None:
    # 1. 写入 PostgreSQL
    new_version = await db.update_flag_environment(flag_key, env_key, changes)

    # 2. 写入审计日志
    await db.insert_audit_log(
        flag_key=flag_key,
        action="flag.updated",
        before_value=old_config,
        after_value=new_config,
    )

    # 3. 更新 Redis 缓存
    config = await db.get_full_environment_config(env_key)
    await redis.set(f"config:{env_sdk_key}", compress(json.dumps(config)))
    await redis.set(f"version:{env_sdk_key}", new_version)

    # 4. 通过 Redis Pub/Sub 发布更新事件
    await redis.publish(f"flag_updates:{env_sdk_key}", json.dumps({
        "type": "flag_update",
        "flagKey": flag_key,
        "version": new_version,
        "timestamp": now_ms(),
    }))

    # 5. 异步触发 webhooks
    await webhook_queue.enqueue(
        event="flag.updated",
        payload={"flagKey": flag_key, "environment": env_key},
    )
```

```python
# SSE Gateway：向已连接的 SDK 广播更新
class SSEGateway:
    def __init__(self):
        self.connections: dict[str, list[SSEConnection]] = {}

    async def handle_connection(self, request) -> StreamingResponse:
        env_sdk_key = authenticate(request)
        conn = SSEConnection(env_sdk_key)
        self.connections.setdefault(env_sdk_key, []).append(conn)

        # 发送初始配置
        config = await redis.get(f"config:{env_sdk_key}")
        await conn.send_event("put", config)

        # 订阅该环境的 Redis Pub/Sub
        async for message in redis.subscribe(f"flag_updates:{env_sdk_key}"):
            update = json.loads(message)
            # 向 SDK 发送增量补丁
            flag_config = await redis.hget(
                f"config:{env_sdk_key}", update["flagKey"]
            )
            await conn.send_event("patch", json.dumps({
                "path": f"/flags/{update['flagKey']}",
                "data": flag_config,
            }))

    async def on_disconnect(self, conn: SSEConnection) -> None:
        self.connections[conn.env_key].remove(conn)
```

### SSE 事件格式

```
服务端 SDK SSE 事件：

# 初始完整配置
event: put
data: {"flags": {...}, "segments": {...}}

# 增量开关更新
event: patch
data: {"path": "/flags/new-checkout-flow", "data": {"key": "new-checkout-flow", "version": 43, ...}}

# 开关删除
event: delete
data: {"path": "/flags/old-flag-key", "version": 44}

# 心跳（每 30 秒）
:heartbeat


客户端 SDK SSE 事件：

# 初始评估值
event: put
data: {"new-checkout-flow": true, "pricing-tier-v2": "control", "max-upload-mb": 100}

# 单个开关值变更
event: patch
data: {"key": "new-checkout-flow", "value": false}

# 心跳
:heartbeat
```

### 轮询回退

当 SSE 连接失败时（防火墙、代理、企业网络），SDK 回退到轮询模式。

```typescript
class UpdateProcessor {
  private mode: 'streaming' | 'polling' = 'streaming';
  private pollInterval: number = 30_000;
  private consecutiveFailures: number = 0;

  async start(): Promise<void> {
    try {
      await this.connectSSE();
    } catch {
      this.fallbackToPolling();
    }
  }

  private async connectSSE(): Promise<void> {
    const eventSource = new EventSource(
      `${this.baseUrl}/sdk/v1/flags/${this.envKey}/stream`,
      { headers: { Authorization: this.sdkKey } }
    );

    eventSource.onmessage = (event) => {
      this.consecutiveFailures = 0;
      this.processUpdate(event);
    };

    eventSource.onerror = () => {
      this.consecutiveFailures++;
      if (this.consecutiveFailures > 3) {
        eventSource.close();
        this.fallbackToPolling();
      }
    };
  }

  private fallbackToPolling(): void {
    this.mode = 'polling';
    setInterval(async () => {
      const currentVersion = this.store.getVersion();
      const serverVersion = await this.fetchVersion();
      if (serverVersion > currentVersion) {
        const config = await this.fetchFullConfig();
        this.store.replaceAll(config);
      }
    }, this.pollInterval);

    // 定期尝试重新连接 SSE
    setInterval(() => this.connectSSE(), 60_000);
  }
}
```

### 一致性保证

| 保证 | 机制 |
|------|------|
| 顺序性 | 单调递增的版本号；SDK 拒绝版本号 <= 当前版本的更新 |
| 原子性 | 完整开关配置作为单个 JSON 文档更新；不存在部分状态 |
| 可靠投递 | SSE 自动重连 + 轮询回退 |
| 最终收敛 | 基于版本号：SDK 检测到版本间隙时拉取完整配置 |
| 一致性窗口 | 典型 < 500ms（Redis Pub/Sub + SSE）；最差情况 < 30s（轮询） |

---

## 9. 深入探讨：实验与 A/B Testing

### 实验生命周期

```
┌─────────┐    ┌──────────┐    ┌──────────┐    ┌───────────┐    ┌───────────┐
│  草稿    │──▶│  运行中   │──▶│  样本量   │──▶│  分析     │──▶│  决策     │
│          │    │           │    │  充足     │    │  结果     │    │           │
│  定义    │    │  将用户   │    │          │    │           │    │  上线或   │
│  指标    │    │  分配到   │    │          │    │  统计     │    │  回滚     │
│  和假设  │    │  变体     │    │          │    │  显著性   │    │           │
└─────────┘    └──────────┘    └──────────┘    └───────────┘    └───────────┘
```

### 变体分配

实验使用与百分比灰度相同的 consistent hashing 机制，但具有特定的实验语义：

```python
class ExperimentEvaluator:
    def assign_variant(
        self,
        experiment: Experiment,
        user: UserContext,
        flag_key: str,
    ) -> VariantAssignment:
        """
        将用户分配到实验变体。
        使用与灰度相同的哈希机制以保证一致性。
        """
        # 检查互斥组
        if experiment.exclusion_group:
            group = self.get_exclusion_group(experiment.exclusion_group)
            # 对用户进行哈希分配到组的槽位
            slot = self._hash_to_slot(
                user.key,
                f"exclusion:{group.key}",
                group.total_slots,
            )
            # 检查该实验是否拥有该槽位
            if not group.owns_slot(experiment.id, slot):
                return VariantAssignment(
                    variant=None,
                    reason="EXCLUDED_BY_MUTUAL_EXCLUSION",
                )

        # 使用与灰度相同的机制将用户哈希到变体
        bucket = self._hash_bucket(user.key, flag_key, experiment.salt)

        cumulative = 0
        for variant in experiment.variants:
            cumulative += variant.weight
            if bucket < cumulative:
                return VariantAssignment(
                    variant=variant,
                    reason="EXPERIMENT_ASSIGNED",
                    experiment_id=experiment.id,
                )

        return VariantAssignment(
            variant=experiment.variants[-1],
            reason="EXPERIMENT_FALLTHROUGH",
        )

    def _hash_bucket(
        self, user_key: str, flag_key: str, salt: int
    ) -> int:
        hash_input = f"{flag_key}.{salt}.{user_key}"
        hash_bytes = hashlib.sha1(hash_input.encode()).digest()
        return int.from_bytes(hash_bytes[:4], byteorder='big') % 100000
```

### 多变体开关用于 A/B/C Testing

```json
{
  "key": "checkout-button-color",
  "flagType": "string",
  "variations": [
    { "value": "blue", "name": "Control" },
    { "value": "green", "name": "Variant A" },
    { "value": "orange", "name": "Variant B" }
  ],
  "rules": [
    {
      "description": "A/B/C test on checkout button",
      "clauses": [],
      "rollout": {
        "variations": [
          { "variation": 0, "weight": 34000 },
          { "variation": 1, "weight": 33000 },
          { "variation": 2, "weight": 33000 }
        ],
        "bucketBy": "userId",
        "seed": 98765
      }
    }
  ]
}
```

### 事件收集与分析流水线

```
┌──────────┐     ┌──────────────┐     ┌───────────┐     ┌─────────────┐
│  SDKs    │────▶│   Event      │────▶│   Kafka   │────▶│ ClickHouse  │
│ (track)  │     │   Collector  │     │           │     │ (analytics) │
└──────────┘     └──────────────┘     └───────────┘     └──────┬──────┘
                                                               │
                                                        ┌──────▼──────┐
                                                        │  Results    │
                                                        │  Calculator │
                                                        │  (Bayesian/ │
                                                        │   Frequen.) │
                                                        └──────┬──────┘
                                                               │
                                                        ┌──────▼──────┐
                                                        │  Dashboard  │
                                                        │  (results)  │
                                                        └─────────────┘
```

### 事件 Schema

```json
{
  "kind": "feature",
  "timestamp": 1709500800000,
  "flagKey": "checkout-button-color",
  "userKey": "user-123",
  "variation": 1,
  "value": "green",
  "reason": "RULE_MATCH",
  "experimentId": "exp-checkout-btn-001"
}

{
  "kind": "custom",
  "timestamp": 1709500850000,
  "key": "checkout_completed",
  "userKey": "user-123",
  "data": {
    "revenue": 49.99,
    "currency": "USD",
    "items": 3
  }
}
```

### 统计显著性计算

```python
from scipy import stats
import math

class ExperimentAnalyzer:
    def analyze_conversion(
        self,
        control_conversions: int,
        control_total: int,
        variant_conversions: int,
        variant_total: int,
        confidence_level: float = 0.95,
    ) -> ExperimentResult:
        control_rate = control_conversions / control_total
        variant_rate = variant_conversions / variant_total
        lift = (variant_rate - control_rate) / control_rate

        # 双比例 z 检验
        pooled_rate = (
            (control_conversions + variant_conversions)
            / (control_total + variant_total)
        )
        se = math.sqrt(
            pooled_rate * (1 - pooled_rate)
            * (1 / control_total + 1 / variant_total)
        )
        z_score = (variant_rate - control_rate) / se
        p_value = 2 * (1 - stats.norm.cdf(abs(z_score)))

        return ExperimentResult(
            control_rate=control_rate,
            variant_rate=variant_rate,
            lift=lift,
            p_value=p_value,
            significant=p_value < (1 - confidence_level),
            confidence=confidence_level,
            sample_size_sufficient=(
                control_total >= self.min_sample_size(control_rate)
            ),
        )

    def min_sample_size(
        self,
        baseline_rate: float,
        mde: float = 0.05,          # 最小可检测效应
        alpha: float = 0.05,
        power: float = 0.8,
    ) -> int:
        """计算每个变体的最小样本量。"""
        z_alpha = stats.norm.ppf(1 - alpha / 2)
        z_beta = stats.norm.ppf(power)
        p1 = baseline_rate
        p2 = baseline_rate * (1 + mde)
        n = (
            (z_alpha * math.sqrt(2 * p1 * (1 - p1))
             + z_beta * math.sqrt(p1 * (1 - p1) + p2 * (1 - p2)))
            ** 2
            / (p2 - p1) ** 2
        )
        return math.ceil(n)
```

### 互斥组

互斥组确保一个用户在同一组内同一时间只能参与一个实验。

```
互斥组："checkout-experiments"
总槽位数：100,000

┌──────────────────────────────────────────────────────────────┐
│ 槽位：0          25,000       50,000        75,000  100,000 │
│        │            │            │              │         │  │
│        ├────────────┤            │              │         │  │
│        │ Experiment │            │              │         │  │
│        │ A (25%)    │            │              │         │  │
│        │            ├────────────┤              │         │  │
│        │            │ Experiment │              │         │  │
│        │            │ B (25%)    │              │         │  │
│        │            │            ├──────────────┤         │  │
│        │            │            │ Experiment   │         │  │
│        │            │            │ C (25%)      │         │  │
│        │            │            │              ├─────────┤  │
│        │            │            │              │ Reserve │  │
│        │            │            │              │ (25%)   │  │
└──────────────────────────────────────────────────────────────┘

用户 "alice" → hash("checkout-experiments.alice") = 12,345
            → 槽位 12,345 属于 Experiment A
            → alice 仅参与 Experiment A
```

---

## 10. 深入探讨：开关生命周期管理

### 开关状态

```
┌──────────┐    ┌──────────┐    ┌───────────┐    ┌──────────┐
│  草稿    │───▶│  活跃     │───▶│  过期     │───▶│  归档    │
│          │    │           │    │           │    │          │
│  已创建  │    │  在 ≥1   │    │  90+ 天   │    │  软删除  │
│  尚未    │    │  个环境中 │    │  无变更    │    │  规则    │
│  启用    │    │  被评估   │    │           │    │  已移除  │
└──────────┘    └──────────┘    └───────────┘    └──────────┘
                     │                                 │
                     │          ┌──────────┐           │
                     └─────────▶│  永久    │           │
                                │          │           │
                                │  标记为  │           │
                                │  非临时  │           │
                                └──────────┘           │
                                                       ▼
                                                ┌──────────┐
                                                │  清除    │
                                                │          │
                                                │  代码引用│
                                                │  已移除  │
                                                └──────────┘
```

### 过期开关检测

```python
class StaleFlagDetector:
    STALE_THRESHOLD_DAYS = 90
    WARNING_THRESHOLD_DAYS = 60

    async def detect_stale_flags(self, project_id: str) -> list[StaleFlag]:
        stale_flags = []

        flags = await self.db.get_flags(project_id, archived=False)
        for flag in flags:
            if not flag.temporary:
                continue  # 仅检查临时开关

            days_since_change = (now() - flag.updated_at).days
            last_evaluation = await self.analytics.get_last_evaluation(
                flag.key, project_id
            )
            days_since_eval = (
                (now() - last_evaluation).days
                if last_evaluation
                else days_since_change
            )

            # 检查开关是否已完全灰度（100% 到某个变体）
            is_fully_rolled_out = await self._is_fully_rolled_out(flag)

            if days_since_change > self.STALE_THRESHOLD_DAYS:
                stale_flags.append(StaleFlag(
                    flag=flag,
                    reason="NO_CHANGES",
                    days_stale=days_since_change,
                    recommendation=(
                        "REMOVE" if is_fully_rolled_out else "REVIEW"
                    ),
                ))
            elif (
                is_fully_rolled_out
                and days_since_change > self.WARNING_THRESHOLD_DAYS
            ):
                stale_flags.append(StaleFlag(
                    flag=flag,
                    reason="FULLY_ROLLED_OUT",
                    days_stale=days_since_change,
                    recommendation="REMOVE",
                ))

        return stale_flags

    async def _is_fully_rolled_out(self, flag) -> bool:
        """检查开关是否在所有环境中 100% 开启某个变体。"""
        envs = await self.db.get_flag_environments(flag.id)
        return all(
            env.enabled
            and len(env.rules) == 0
            and env.fallthrough.get("variation") is not None
            for env in envs
        )
```

### 开关退役流程

```
步骤 1：识别过期开关
  └─ 自动扫描发现 "new-checkout-flow" 已 100% 开启 45 天

步骤 2：通知负责人
  └─ Slack："@alice：开关 'new-checkout-flow' 已全量开启
            45 天。是否准备移除？"

步骤 3：代码搜索
  └─ 查找所有代码引用：
     grep -r "new-checkout-flow" src/
       src/checkout/CheckoutPage.tsx:12
       src/checkout/CheckoutPage.tsx:45
       src/api/routes/checkout.ts:28
       tests/checkout.test.ts:15

步骤 4：创建清理 PR
  └─ 移除开关检查，保留"开启"的代码路径，
     删除"关闭"的代码路径

步骤 5：归档开关
  └─ POST /api/v1/projects/{id}/flags/new-checkout-flow
     { "archived": true }

步骤 6：代码引用移除
  └─ 验证代码库中不再有残留引用
```

### 技术债务追踪看板

```
┌────────────────────────────────────────────────────────────┐
│              功能开关健康度看板                                │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  总开关数：187    活跃：142    过期：31    废弃：14          │
│                                                            │
│  ⚠ 过期开关（60+ 天无变更）：                               │
│  ┌──────────────────────┬────────┬───────────┬──────────┐ │
│  │ 开关 Key             │ 天数   │ 状态      │ 操作     │ │
│  ├──────────────────────┼────────┼───────────┼──────────┤ │
│  │ new-checkout-flow    │ 92     │ 100% 开启 │ 移除     │ │
│  │ dark-mode-v2         │ 78     │ 100% 开启 │ 移除     │ │
│  │ experiment-pricing   │ 65     │ 50/50     │ 审查     │ │
│  │ legacy-api-compat    │ 120    │ 永久      │ 正常     │ │
│  └──────────────────────┴────────┴───────────┴──────────┘ │
│                                                            │
│  技术债务评分：23/100（良好）                                │
│  建议：移除 2 个开关可将评分改善至 18/100                    │
└───────────────────────────────────────────────────────────��┘
```

### 开关依赖

```json
{
  "key": "new-checkout-payment",
  "prerequisites": [
    {
      "flagKey": "new-checkout-flow",
      "variation": 0
    }
  ]
}
```

```
依赖关系图：

new-checkout-flow（父开关）
├── new-checkout-payment（要求父开关 = variation 0）
├── new-checkout-address-autocomplete（要求父开关 = variation 0）
└── checkout-analytics-v2（要求父开关 = variation 0）

评估逻辑：如果 "new-checkout-flow" 关闭或评估为 variation 1，
          所有依赖的开关均返回其 offVariation。
```

---

## 11. 深入探讨：多环境支持

### 环境层级

```
┌──────────────────────────────────────────────────────┐
│                     项目                              │
│                  "E-Commerce App"                    │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │ Development  │  │  Staging    │  │ Production  │ │
│  │             │  │             │  │             │ │
│  │ SDK Key:    │  │ SDK Key:    │  │ SDK Key:    │ │
│  │ sdk-dev-... │  │ sdk-stg-... │  │ sdk-prod-...│ │
│  │             │  │             │  │             │ │
│  │ 开关：      │  │ 开关：      │  │ 开关：      │ │
│  │ 全部启用    │  │ 与生产相同  │  │ 受控灰度    │ │
│  │ 用于测试    │  │ 配置       │  │ 发布       │ │
│  │             │  │ （镜像）    │  │             │ │
│  │ 审批：      │  │ 审批：      │  │ 审批：      │ │
│  │ 无需        │  │ 无需        │  │ 需要        │ │
│  └─────────────┘  └─────────────┘  └─────────────┘ │
└──────────────────────────────────────────────────────┘
```

### 环境特定配置

每个开关在每个环境中拥有独立的配置：

```
开关："new-checkout-flow"

Development 环境：
  enabled: true
  rules: []（无定向——所有人都能看到）
  fallthrough: variation 0 (true)

Staging 环境：
  enabled: true
  rules:
    - QA 团队分组 → variation 0
  fallthrough: variation 1 (false)

Production 环境：
  enabled: true
  rules:
    - Beta 测试用户 → variation 0 (100%)
    - 所有用户 → 10% variation 0, 90% variation 1
  fallthrough: variation 1 (false)
  approval_required: true
```

### 环境推进

```python
async def promote_flag_config(
    flag_key: str,
    source_env: str,
    target_env: str,
    actor_id: str,
) -> PromotionResult:
    """将开关配置从一个环境复制到另一个环境。"""
    source_config = await db.get_flag_environment(flag_key, source_env)
    target_config = await db.get_flag_environment(flag_key, target_env)

    # 检查目标环境是否需要审批
    target_env_settings = await db.get_environment(target_env)
    if target_env_settings.require_approval:
        return await create_approval_request(
            flag_key=flag_key,
            source_env=source_env,
            target_env=target_env,
            proposed_config=source_config,
            requester=actor_id,
        )

    # 应用推进
    new_config = {
        **target_config,
        "enabled": source_config.enabled,
        "rules": source_config.rules,
        "fallthrough": source_config.fallthrough,
        "version": target_config.version + 1,
        "updated_by": actor_id,
    }

    await db.update_flag_environment(flag_key, target_env, new_config)

    await audit_log.record(
        action="flag.promoted",
        flag_key=flag_key,
        before_value=target_config,
        after_value=new_config,
        actor_id=actor_id,
        comment=f"Promoted from {source_env} to {target_env}",
    )

    await notify_connected_sdks(target_env, flag_key)

    return PromotionResult(success=True, new_version=new_config["version"])
```

### 配置继承

```
默认模板（可选）：
┌─────────────────────────────────┐
│  flag_type: boolean             │
│  variations: [true, false]      │
│  off_variation: 1               │
│  fallthrough: variation 1       │
│  enabled: false                 │
└───────────┬─────────────────────┘
            │ 继承（覆盖）
    ┌───────┼───────────────┐
    ▼       ▼               ▼
┌───────┐ ┌───────┐  ┌──────────┐
│  Dev  │ │ Stage │  │  Prod    │
│       │ │       │  │          │
│enable:│ │enable:│  │ enable:  │
│ true  │ │ true  │  │ true     │
│       │ │       │  │ rules:   │
│       │ │       │  │ [10%     │
│       │ │       │  │  rollout]│
└───────┘ └───────┘  └──────────┘

每个环境覆盖模板中的值。
未覆盖的字段从模板继承。
```

---

## 12. 扩展策略

### 边缘评估架构

为了实现全球低延迟的开关评估，将开关配置推送到边缘节点。

```
┌────────────────────────────────────────────────────────────────────┐
│                      边缘评估                                       │
│                                                                    │
│  ┌────────────┐    ┌────────────┐    ┌────────────┐               │
│  │ Edge PoP   │    │ Edge PoP   │    │ Edge PoP   │               │
│  │ US-East    │    │ EU-West    │    │ AP-South   │               │
│  │            │    │            │    │            │               │
│  │ ┌────────┐ │    │ ┌────────┐ │    │ ┌────────┐ │               │
│  │ │Flag    │ │    │ │Flag    │ │    │ │Flag    │ │               │
│  │ │Config  │ │    │ │Config  │ │    │ │Config  │ │               │
│  │ │Cache   │ │    │ │Cache   │ │    │ │Cache   │ │               │
│  │ └────────┘ │    │ └────────┘ │    │ └────────┘ │               │
│  │            │    │            │    │            │               │
│  │ ┌────────┐ │    │ ┌────────┐ │    │ ┌────────┐ │               │
│  │ │Rule    │ │    │ │Rule    │ │    │ │Rule    │ │               │
│  │ │Engine  │ │    │ │Engine  │ │    │ │Engine  │ │               │
│  │ └────────┘ │    │ └────────┘ │    │ └────────┘ │               │
│  └──────┬─────┘    └──────┬─────┘    └──────┬─────┘               │
│         │                 │                 │                      │
│         └────────────┬────┴────────────────┘                      │
│                      │ SSE / 配置同步                               │
│                      ▼                                             │
│              ┌──────────────┐                                      │
│              │ Origin Flag  │                                      │
│              │ Service      │                                      │
│              └──────────────┘                                      │
└────────────────────────────────────────────────────────────────────┘
```

### 客户端评估的 CDN 缓存

```
客户端评估缓存：

Browser/App ──▶ CDN Edge ──▶ SDK Service ──▶ Redis ──▶ PostgreSQL

缓存头：
  GET /sdk/v1/evaluate/{envClientId}?user={hash}

  响应头：
    Cache-Control: public, max-age=60, stale-while-revalidate=300
    ETag: "v42-{user_hash}"
    Vary: Authorization

  CDN 按用户上下文哈希缓存评估结果。
  TTL：60 秒（新鲜），300 秒（stale-while-revalidate）。
  缓存失效：更新时按开关 key 前缀清除。

  权衡：最多 60 秒的过期延迟 vs. 大幅减少源站流量。
  大多数场景可以接受非关键开关 60 秒的延迟。
```

### 读密集型优化

```
读写比：~100,000:1
  读取：每天 10 亿次评估（SDK 本地，服务器零负载）
  读取：每小时 55 万次配置拉取（SDK 引导）
  写入：每天 1 万次开关变更

优化策略：

1. 服务端 SDK：引导后对服务器零读取负载
   - 初始拉取：GET /sdk/v1/flags/{env}（启动时一次）
   - 更新：SSE 流（持久连接，推送模式）
   - 评估：本地、进程内、亚毫秒级

2. 客户端 SDK：通过缓存实现最小读取负载
   - 从 localStorage 引导（零网络）
   - SSE 流用于更新（持久连接）
   - CDN 缓存用于新会话（60 秒 TTL）

3. 配置缓存层级：
   ┌──────────────────────────────┐
   │ L1: SDK 内存 (< 1ms)        │  ← 所有评估
   ├──────────────────────────────┤
   │ L2: Redis (< 5ms)           │  ← SDK 引导
   ├──────────────────────────────┤
   │ L3: CDN 边缘 (< 20ms)      │  ← 客户端引导
   ├──────────────────────────────┤
   │ L4: PostgreSQL (< 50ms)     │  ← 缓存未命中、写入
   └──────────────────────────────┘

4. 写放大管理：
   一次开关变更 → 1 次 PostgreSQL 写入
                → 1 次 Redis 缓存更新
                → 1 次 Redis Pub/Sub 发布
                → N 次 SSE 广播（在 SSE Gateway 扇出）
   总写放大：O(已连接 SDK 数)
   由 SSE Gateway 集群处理，而非开关服务本身。
```

### 水平扩展方案

| 组件 | 扩展策略 | 实例数 |
|------|---------|--------|
| 开关管理 API | 无状态，负载均衡后 | 每区域 3-6 个 |
| SDK Service | 无状态，负载均衡后 | 每区域 6-12 个 |
| SSE Gateway | 有状态（连接），按环境 key 分片 | 每区域 10-15 个 |
| PostgreSQL | 主节点 + 只读副本 | 1 主 + 2 副本 |
| Redis Cluster | 按环境 key 分片 | 6 个分片，每个 3 副本 |
| Event Collector | 无状态，自动扩缩 | 每区域 3-10 个 |
| ClickHouse | 按时间分片 | 3 节点集群 |

---

## 13. 部署架构

```
┌────────────────────��────────────────────────────────────────────────┐
│                          区域：US-East                               │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    Kubernetes Cluster                          │  │
│  │                                                               │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────┐ │  │
│  │  │ Ingress /   │  │ Management  │  │  SDK Service          │ │  │
│  │  │ API Gateway │  │ API         │  │  (bootstrap +         │ │  │
│  │  │ (NGINX)     │──│ (3 pods)    │  │   client eval)        │ │  │
│  │  │             │  │             │  │  (6 pods)             │ │  │
│  │  │  Rate limit │  └──────┬──────┘  └──────────┬───────────┘ │  │
│  │  │  TLS term   │         │                    │             │  │
│  │  │  Auth       │         │                    │             │  │
│  │  └──────┬──────┘         │                    │             │  │
│  │         │                │                    │             │  │
│  │  ┌──────▼──────────────────────────────────────────────────┐ │  │
│  │  │                SSE Gateway (StatefulSet)                 │ │  │
│  │  │                                                         │ │  │
│  │  │  Pod 1         Pod 2         Pod 3        Pod 4         │ │  │
│  │  │  50K conns     50K conns     50K conns    50K conns     │ │  │
│  │  │                                                         │ │  │
│  │  │  按环境 SDK key 分片（consistent hashing）                │ │  │
│  │  └──────────────────────┬──────────────────────────────────┘ │  │
│  │                         │                                    │  │
│  │  ┌──────────────────────▼──────────────────────────────────┐ │  │
│  │  │                Redis Cluster                             │ │  │
│  │  │  Shard 1    Shard 2    Shard 3    （每个 3 副本）         │ │  │
│  │  │  Config     Config     Pub/Sub                          │ │  │
│  │  │  Cache      Cache      Channels                         │ │  │
│  │  └─────────────────────────────────────────────────────────┘ │  │
│  │                                                               │  │
│  │  ┌──────────────────────┐  ┌────────────────────────────┐    │  │
│  │  │   PostgreSQL         │  │  事件流水线                  │    │  │
│  │  │   Primary            │  │                             │    │  │
│  │  │   + 2 只读副本       │  │  Event Collector → Kafka    │    │  │
│  │  │                      │  │  → ClickHouse               │    │  │
│  │  │   Flags, Rules,      │  │                             │    │  │
│  │  │   Segments, Audit    │  │  实验结果、                  │    │  │
│  │  │                      │  │  开关使用分析               │    │  │
│  │  └──────────────────────┘  └────────────────────────────┘    │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │              CDN (CloudFront / Fastly)                         │  │
│  │                                                               │  │
│  │  边缘缓存客户端 SDK 引导响应                                    │  │
│  │  缓存 key：env_client_id + user_context_hash                  │  │
│  │  TTL: 60s, stale-while-revalidate: 300s                      │  │
│  │  开关更新时清除缓存（通过 API）                                  │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                          区域：EU-West                               │
│                    （相同架构，已复制）                                 │
│                                                                     │
│  PostgreSQL：只读副本（从 US-East 主节点异步复制）                      │
│  Redis：独立集群（通过开关服务在写入时同步）                             │
│  SSE Gateway：独立集群（订阅本地 Redis）                               │
│  SDK 连接：通过 GeoDNS 路由到最近区域                                  │
└─────────────────────────────────────────────────────────────────────┘
```

### 灾难恢复

```
故障模式                │ 影响                      │ 恢复方案
────────────────────────┼───────────────────────────┼─────────────────────────
PostgreSQL 主节点宕机    │ 无法变更开关               │ 提升副本；SDK 继续
                        │ SDK 不受影响（使用缓存）    │ 使用缓存配置运行
────────────────────────┼───────────────────────────┼─────────────────────────
Redis 集群宕机          │ SDK 引导变慢               │ 回退到 PostgreSQL
                        │ SSE 更新延迟               │ 直接读取；轮询模式
────────────────────────┼───────────────────────────┼─────────────────────────
SSE Gateway 宕机        │ 无实时更新                 │ SDK 回退到轮询
                        │ SDK 使用缓存配置           │（30 秒间隔）
────────────────────────┼───────────────────────────┼─────────────────────────
整个区域故障            │ 区域内 SDK 暂时             │ GeoDNS 故障转移到
                        │ 离线                       │ 备用区域；SDK 使用
                        │                           │ 本地缓存直到重连
────────────────────────┼───────────────────────────┼─────────────────────────
SDK 进程重启            │ 短暂只有默认值可用          │ 从持久化缓存引导
                        │                           │ 或从 SDK Service 拉取
```

---

## 14. 常见面试追问

**问：如何确保用户始终看到相同的开关值（sticky bucketing）？**

关键在于确定性哈希。我们计算 `SHA1(flagKey + salt + userId)` 并将结果映射到 [0, 99999] 范围内的桶。这个哈希是纯函数——相同输入始终产生相同输出。无需为每个用户存储状态。当灰度百分比从 30% 增加到 50% 时，桶 0-29999 中的用户原本就在实验组中，他们保持不变。桶 30000-49999 中的用户是新增的。没有现有用户会从实验组切换到对照组。`seed` 参数允许在相同用户上运行独立灰度：改变 seed 会重新打乱桶分配，这在你希望两个开关拥有独立灰度人群时非常有用。

---

**问：系统如何处理需要在 1 秒内传播的熔断开关？**

熔断开关是最高优先级操作。当开关被关闭时：(1) PostgreSQL 更新 `enabled = false`。(2) Redis 缓存立即更新。(3) Redis Pub/Sub 将更新发布到所有 SSE Gateway 节点。(4) SSE Gateway 向所有已连接的 SDK 广播 SSE `patch` 事件。关键路径是 Redis Pub/Sub 到 SSE 广播——这在单个区域内低于 100ms。对于使用轮询的客户端 SDK，我们还会更新 CDN 缓存并发起缓存清除。轮询客户端的最差情况是一个轮询间隔（30 秒），但对于 SSE 连接的客户端，传播通常在 500ms 以内。管理界面还会显示实时指标，表明有多少 SDK 实例已确认收到更新。

---

**问：当开关服务完全宕机且一个 SDK 启动时会发生什么？**

SDK 拥有多层弹性策略。(1) 启动时，首先检查本地持久化缓存（磁盘文件或 localStorage）。如果之前的实例写入了配置文件，新实例立即使用——零网络依赖。(2) 如果没有持久化缓存，SDK 使用应用提供的每个开关的默认值。(3) SDK 在后台持续尝试连接开关服务，使用指数退避。(4) 一旦连接成功，拉取完整配置并开始正常运行。核心设计原则：开关评估永远不能阻塞在网络调用上，永远不能抛出异常。它始终返回一个值——基于当前状态的最佳可用值。

---

**问：如何防止不同环境之间的开关配置不一致？**

我们使用环境特定配置（而非共享全局状态）来防止跨环境干扰。每个环境拥有自己的 SDK key、自己的规则集和自己的版本计数器。开发环境中的开关变更不会意外影响生产环境。为了保持环境间一致性，我们提供了显式的"推进"工作流——将配置从预发布复制到生产——生产环境需要审批。审计日志记录每次推进的变更前后快照。我们还提供"比较环境"视图，高亮显示预发布和生产之间的配置差异，帮助团队发现意外的差别。

---

**问：如何在百分比灰度中进行实验而不引入选择偏差？**

选择偏差是主要的统计风险。我们通过以下方式缓解：(1) Consistent hashing 确保确定性分配——用户每次都在相同的变体中，消除了处理切换偏差。(2) 哈希函数为每个实验使用唯一的 `seed`，因此实验 A 的分配与实验 B 相互独立。(3) 互斥组防止用户同时参与两个冲突的实验。(4) 我们要求在宣布结果显著之前，使用功效分析计算出的最小样本量。(5) 我们使用序贯检验（而非仅固定期限检验）来允许提前终止而不增加假阳性率。(6) 系统追踪"曝光事件"——只有当开关在用户的代码路径中被实际评估时，用户才被计入实验，而不是仅仅被分配了变体。

---

**问：如何将 SSE 连接扩展到百万级并发客户端？**

SSE Gateway 是扩展瓶颈。每个节点使用异步 I/O（Linux 上的 epoll，macOS 上的 kqueue）处理约 50K 个并发 SSE 连接。扩展方式：(1) 按环境 SDK key 分片连接——同一环境的所有 SDK 连接到相同的 Gateway 节点子集，最小化 Pub/Sub 扇出。(2) 使用 Redis Pub/Sub 进行节点间通信——当开关变更时，开关服务向 Redis 发布一次，只有服务该环境的 Gateway 节点收到消息。(3) 对于超大规模部署（百万级连接），我们引入边缘层，使用 Cloudflare Workers 或 AWS Lambda@Edge 作为 SSE 代理，在边缘位置缓存事件流并在本地向客户端扇出。(4) 客户端 SDK 也可以使用 long-polling 作为回退方案，这对 CDN 更友好，可以从单个缓存响应服务多个客户端。

---

**问：如何管理积累的功能开关带来的技术债务？**

如果不加管理，功能开关是一种技术债务。我们的方法：(1) 每个开关在创建时标记为 `temporary` 或 `permanent`。临时开关有预期的移除日期。(2) 自动过期开关检测每周运行——如果临时开关已 100% 灰度超过 90 天，则被标记为需要清理。(3) 我们通过静态分析与代码仓库集成：CI 任务扫描代码中的开关 key 引用，并与开关服务交叉对比。零代码引用的开关是删除候选。(4) 管理看板显示基于过期开关数量、年龄分布和无负责人开关的"技术债务评分"。(5) 我们向开关负责人发送每周 Slack 摘要，列出其过期开关。自动化与社会压力的结合使开关数量保持可控。

---

**问：如何支持服务端渲染（SSR）的功能开关？**

SSR 要求在服务器渲染过程中同步获取开关值。服务端 SDK 天然支持这一点：它将完整的开关配置保存在内存中，本地评估仅需微秒级。挑战在于 hydration 不匹配——服务器用一组开关值渲染，客户端在 hydration 时必须渲染完全相同的结果。我们的方案：(1) 服务器在 SSR 期间为用户评估所有开关，并将结果序列化到 HTML 中的 `<script>` 标签（bootstrap 数据）。(2) 客户端 SDK 从这个 bootstrap 数据初始化，而非发起网络请求。(3) 这保证了首次渲染时服务端和客户端看到完全相同的开关值。(4) Hydration 完成后，客户端 SDK 连接 SSE 流获取实时更新。初始渲染后的开关变更触发 React 状态更新，引起使用新值的重新渲染。

---

**问：如何处理没有稳定用户 ID 的匿名用户的开关评估？**

匿名用户需要稳定标识符来保证一致的分桶。方案：(1) 首次访问时，客户端 SDK 生成一个随机 UUID 并存储在第一方 cookie 或 localStorage 中。这成为用户进行开关评估的 `key`。(2) 哈希函数使用此匿名 key 进行百分比灰度，因此用户在各会话中看到一致的开关值（只要 cookie 持续存在）。(3) 当用户注册或登录时，SDK 提供"alias"或"identify"调用，将匿名 key 与认证后的用户 ID 关联。(4) 对于服务端 SDK，应用必须提供某种标识符——如果没有用户 ID，SDK 回退到请求 IP 或会话 ID。(5) 分析流水线追踪匿名到已知身份的映射，使实验结果能够正确归因用户旅程中匿名和认证两个阶段的转化。

---

## 15. 总结

### 关键架构决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 评估位置 | 服务端本地（SDK 内）；客户端由服务器评估 | 亚毫秒级延迟；热路径无网络依赖 |
| 更新传播 | SSE 流式推送，轮询回退 | 实时更新（< 500ms）；可穿透防火墙 |
| 一致性模型 | 确定性哈希（无存储状态） | 同一用户始终获得相同值；无需按用户存储；O(1) 评估 |
| 规则存储 | PostgreSQL 中的 JSON | 规则 schema 灵活；开关变更具备 ACID；写入量可承受 |
| 缓存 | Redis 用于配置 + CDN 用于客户端引导 | 配置可放入内存；CDN 分流客户端流量 |
| 事件流水线 | Kafka + ClickHouse | 高吞吐事件摄入；实验结果的快速分析查询 |
| 多环境 | 每个环境独立配置，共享开关定义 | 隔离防止跨环境事故；推进工作流保证一致性 |
| 客户端安全 | 仅提供服务端评估后的值（不暴露规则） | 防止暴露定向逻辑、分组和灰度百分比 |

### 权衡取舍

| 决策 | 方案 A | 方案 B | 建议 |
|------|--------|--------|------|
| 本地 vs. 远程评估 | 本地（SDK 中包含完整规则） | 远程（服务器逐请求评估） | 服务端 SDK 用本地评估（性能）；客户端 SDK 用远程评估（安全） |
| SSE vs. WebSocket | SSE（单向，基于 HTTP） | WebSocket（双向） | SSE——更简单，可穿透 HTTP 代理/CDN，单向对开关更新足够 |
| 轮询间隔 | 短（5 秒）——更快更新 | 长（60 秒）——更少服务器负载 | 默认 30 秒，SSE 为主要方式；轮询仅作回退 |
| 开关存储格式 | 关系型（规范化表） | 文档型（每个开关一个 JSON blob） | 混合——关系型用于元数据/搜索，JSON 用于规则（灵活 schema） |
| 灰度变更时的一致性 | 重新分配所有用户 | 仅单调扩展 | 单调扩展——增加灰度百分比永远不会将用户移出实验组 |
| 客户端引导 | 网络拉取 | localStorage 缓存 | localStorage 优先（即时），然后 SSE 流更新（避免内容闪烁） |
| 实验分配 | 实时（评估时） | 预计算（批处理） | 实时——不依赖批处理作业；确定性哈希为 O(1) |
| 过期开关清理 | 手动 | 自动移除 | 半自动——自动检测并通知，需人工审批后移除 |
| 多区域配置 | 单主节点，异步复制 | 多主节点，冲突解决 | 单主节点——开关变更量低；避免冲突解决的复杂性 |
| 审计日志存储 | 同一数据库（PostgreSQL） | 独立的仅追加存储 | 每天变更量低于 1 万时用同一数据库；合规归档用独立存储（如 S3 + Athena） |
