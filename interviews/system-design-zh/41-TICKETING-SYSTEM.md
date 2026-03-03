# 设计客户支持工单系统 (Zendesk / Intercom / Freshdesk)

客户支持工单系统是企业客户服务运营的核心骨干。它从多个渠道（邮件、聊天、Web 表单、API）接收请求，将其路由到合适的客服人员，执行 SLA 承诺，并提供分析数据以优化支持运营。核心挑战在于构建一个实时、多租户系统，该系统每天处理数百万工单，同时保持严格的 SLA 保证并实现客服人员之间的无缝协作。

## 目录

1. [需求澄清](#需求澄清)
2. [API 设计](#api-设计)
3. [数据模型](#数据模型)
4. [高层架构](#高层架构)
5. [深入探讨：工单生命周期](#深入探讨工单生命周期)
6. [深入探讨：路由与分配](#深入探讨路由与分配)
7. [深入探讨：SLA 管理](#深入探讨sla-管理)
8. [深入探讨：多渠道接入](#深入探讨多渠道接入)
9. [深入探讨：实时协作](#深入探讨实时协作)
10. [深入探讨：知识库与自助服务](#深入探讨知识库与自助服务)
11. [深入探讨：AI/ML 集成](#深入探讨aiml-集成)
12. [深入探讨：报表与分析](#深入探讨报表与分析)
13. [扩展策略](#扩展策略)
14. [部署架构](#部署架构)
15. [权衡取舍](#权衡取舍)
16. [常见面试追问](#常见面试追问)
17. [总结](#总结)

---

## 需求澄清

### 需要提出的澄清问题

- 系统需要服务多少客服人员？（中小企业为十人级别 vs. 企业级为万人级别）
- 首次上线需要支持哪些渠道？（邮件、聊天、Web 表单、API、社交媒体、电话）
- 我们需要支持 SaaS 产品的多租户还是内部使用的单租户？
- SLA 等级有哪些？（首次响应时间、解决时间、工作时间 vs. 7x24 小时）
- 是否需要实时协作功能（冲突检测、内部备注）？
- 是否需要客户自助门户？
- 存在哪些合规要求？（GDPR、HIPAA、SOC 2、数据驻留）
- 是否需要 AI 功能（自动分类、建议回复、聊天机器人分流）？

### 功能需求

| # | 需求 | 描述 |
|---|------|------|
| 1 | 工单 CRUD | 创建、读取、更新、关闭工单，支持丰富的元数据（优先级、分类、标签、自定义字段） |
| 2 | 多渠道接入 | 从邮件、实时聊天、Web 表单、REST API 和社交媒体渠道接收工单 |
| 3 | 分配与路由 | 根据规则、技能和工作负载自动将工单路由到正确的团队/客服人员 |
| 4 | SLA 跟踪 | 定义包含首次响应和解决时间目标的 SLA 策略；��时跟踪合规情况 |
| 5 | 客服工作台 | 统一收件箱，支持过滤、视图、批量操作和键盘快捷键，提升客服生产力 |
| 6 | 内部协作 | 内部备注、@提及、工单关注者、并发编辑冲突检测 |
| 7 | 客户门户 | 自助服务门户，客户可在此提交、跟踪和回复工单 |
| 8 | 知识库 | 文章管理系统，支持搜索、分类和 AI 驱动的建议 |
| 9 | 宏与模板 | 预构建的回复模板和多步骤自动化宏，用于常见场景 |
| 10 | 自动化规则 | 基于触发器的规则（创建时、更新时、基于时间），自动化工单工作流 |
| 11 | 报表与分析 | 客服绩效、SLA 合规率、CSAT 评分、队列健康度和自定义仪表板 |
| 12 | AI 功能 | 自动分类、情感分析、建议回复、聊天机器人交接 |
| 13 | 审计追踪 | 每个工单上每个操作的完整历史记录，用于合规和调试 |

### 非功能需求

| # | 需求 | 目标 |
|---|------|------|
| 1 | 实时更新延迟 | 工单变更对所有查看者可见 < 500ms |
| 2 | 可用性 | 99.99%（< 52 分钟停机时间/年） |
| 3 | 搜索延迟 | 全文工单搜索 < 200ms |
| 4 | 工单创建吞吐量 | 峰值 50,000 工单/分钟 |
| 5 | API 响应延迟 | 读取 p95 < 100ms，写入 p95 < 300ms |
| 6 | 数据保留 | 审计合规 7 年 |
| 7 | 多租户 | 100,000+ 租户，严格的数据隔离 |
| 8 | SLA 计时器精度 | < 1 秒偏差 |
| 9 | 邮件处理延迟 | 从收到到创建工单 < 30 秒 |
| 10 | 水平可扩展性 | 线性扩展，无单点瓶颈 |

### 规模估算

```
租户与用户：
  总租户（组织）：              100,000
  每租户客服人员（平均）：       20（范围：1 到 50,000）
  总客服人员：                  2,000,000
  终端客户：                    500,000,000（所有租户合计）

工单量：
  每日创建工单：                10,000,000（1000 万）
  峰值工单/秒：                ~500 TPS（平均 115 TPS，4 倍峰值）
  每工单评论数（平均）：         5
  每日评论数：                  50,000,000
  每日工单更新数：              100,000,000（状态变更、分配、标签）

数据大小：
  工单记录：                    ~2 KB（元数据 + 字段）
  评论记录：                    ~1 KB（文本 + 元数据）
  附件平均大小：                500 KB
  每工单附件数：                0.5 平均

  每日工单存储：                10M * 2 KB = 20 GB/天
  每日评论存储：                50M * 1 KB = 50 GB/天
  每日附件存储：                5M * 500 KB = 2.5 TB/天
  年工单 + 评论：              ~25 TB/年
  年附件：                     ~900 TB/年

搜索索引：
  可搜索工单总数：              30 亿（7 年保留）
  索引大小（Elasticsearch）：   ~30 TB（含副本）
  搜索 QPS：                   10,000 查询/秒

实时事件：
  WebSocket 连接数：            500,000 并发客服
  每秒事件数：                  200,000（工单更新广播）

邮件量：
  每日入站邮件：                5,000,000
  邮件解析吞吐量：             ~60 封/秒 平均，250 封/秒 峰值
  邮件大小（平均）：            50 KB（含头部）
  每日邮件入站流量：            5M * 50 KB = 250 GB/天
```

---

## API 设计

### 工单端点

```
POST   /api/v1/tickets                          创建新工单
GET    /api/v1/tickets                          列出工单（支持过滤、分页）
GET    /api/v1/tickets/{ticketId}               获取工单详情
PATCH  /api/v1/tickets/{ticketId}               更新工单字段
DELETE /api/v1/tickets/{ticketId}               软删除工单

POST   /api/v1/tickets/{ticketId}/comments      添加评论（公开或内部）
GET    /api/v1/tickets/{ticketId}/comments      列出工单评论
PUT    /api/v1/tickets/{ticketId}/comments/{id} 编辑评论

POST   /api/v1/tickets/{ticketId}/tags          为工单添加标签
DELETE /api/v1/tickets/{ticketId}/tags/{tag}    移除标签

POST   /api/v1/tickets/{ticketId}/followers     添加关注者
DELETE /api/v1/tickets/{ticketId}/followers/{id} 移除关注者

POST   /api/v1/tickets/{ticketId}/merge         将另一个工单合并到此工单
POST   /api/v1/tickets/{ticketId}/split         将工单拆分为多个工单

GET    /api/v1/tickets/{ticketId}/audit-log     获取完整审计追踪
GET    /api/v1/tickets/{ticketId}/sla           获取 SLA 状态和截止时间
```

### 客服人员与团队端点

```
GET    /api/v1/agents                           列出客服人员
GET    /api/v1/agents/{agentId}                 获取客服人员详情
PATCH  /api/v1/agents/{agentId}                 更新客服人员资料/状态
GET    /api/v1/agents/{agentId}/tickets         获取客服人员的已分配工单
PUT    /api/v1/agents/{agentId}/availability    设置可用状态（在线/离开/离线）

GET    /api/v1/teams                            列出团队
POST   /api/v1/teams                            创建团队
GET    /api/v1/teams/{teamId}/members           列出团队成员
POST   /api/v1/teams/{teamId}/members           添加成员到团队
```

### 队列与路由端点

```
GET    /api/v1/queues                           列出工单队列（视图）
POST   /api/v1/queues                           创建自定义队列
GET    /api/v1/queues/{queueId}/tickets         获取队列中的工单
POST   /api/v1/queues/{queueId}/next            从队列拉取下一个工单（轮询分配）

GET    /api/v1/routing-rules                    列出路由规则
POST   /api/v1/routing-rules                    创建路由规则
PUT    /api/v1/routing-rules/{ruleId}           更新路由规则
PUT    /api/v1/routing-rules/reorder            重新排序规则执行优先级
```

### SLA 策略端点

```
GET    /api/v1/sla-policies                     列出 SLA 策略
POST   /api/v1/sla-policies                     创建 SLA 策略
PUT    /api/v1/sla-policies/{policyId}          更新 SLA 策略
DELETE /api/v1/sla-policies/{policyId}          删除 SLA 策略

GET    /api/v1/sla-policies/{policyId}/breaches 列出策略的 SLA 违规记录
GET    /api/v1/sla/dashboard                    获取 SLA 合规概览
```

### 知识库端点

```
GET    /api/v1/articles                         列出知识库文章
POST   /api/v1/articles                         创建文章
PUT    /api/v1/articles/{articleId}             更新文章
DELETE /api/v1/articles/{articleId}             归档文章
GET    /api/v1/articles/search?q={query}        搜索文章

POST   /api/v1/articles/{articleId}/feedback    提交文章有用性反馈
GET    /api/v1/articles/suggestions?ticketId={id} 获取工单的 AI 推荐文章
```

### 宏与自动化端点

```
GET    /api/v1/macros                           列出宏
POST   /api/v1/macros                           创建宏
POST   /api/v1/macros/{macroId}/apply           将宏应用到工单
PUT    /api/v1/macros/{macroId}                 更新宏

GET    /api/v1/automations                      列出自动化规则
POST   /api/v1/automations                      创建自动化规则
PUT    /api/v1/automations/{ruleId}             更新自动化规则
PUT    /api/v1/automations/{ruleId}/toggle      启用/禁用自动化规则
```

### 示例：创建工单请求

```json
POST /api/v1/tickets
{
  "subject": "Cannot access my account after password reset",
  "description": "I reset my password 2 hours ago and still cannot login.",
  "channel": "web_form",
  "priority": "high",
  "category": "account_access",
  "requester": {
    "email": "customer@example.com",
    "name": "Jane Doe"
  },
  "custom_fields": {
    "product": "enterprise_plan",
    "browser": "Chrome 120"
  },
  "tags": ["login", "password-reset"],
  "attachments": ["upload://abc123"]
}
```

### 示例：创建工单响应

```json
{
  "id": "tkt_01HQ3K5M7XNPJ",
  "subject": "Cannot access my account after password reset",
  "status": "new",
  "priority": "high",
  "category": "account_access",
  "channel": "web_form",
  "requester_id": "usr_01HQ3K5M7X",
  "assignee_id": null,
  "team_id": null,
  "sla": {
    "policy_id": "sla_high_priority",
    "first_response_due": "2026-03-03T15:00:00Z",
    "resolution_due": "2026-03-04T09:00:00Z",
    "business_hours": true
  },
  "tags": ["login", "password-reset"],
  "custom_fields": {
    "product": "enterprise_plan",
    "browser": "Chrome 120"
  },
  "created_at": "2026-03-03T14:00:00Z",
  "updated_at": "2026-03-03T14:00:00Z"
}
```

---

## 数据模型

### 核心表

```sql
-- 多租户组织
CREATE TABLE organizations (
    id              BIGINT PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    subdomain       VARCHAR(63) UNIQUE NOT NULL,
    plan            VARCHAR(50) NOT NULL DEFAULT 'free',
    timezone        VARCHAR(50) NOT NULL DEFAULT 'UTC',
    business_hours  JSONB NOT NULL DEFAULT '{}',
    settings        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 客服人员
CREATE TABLE agents (
    id              BIGINT PRIMARY KEY,
    org_id          BIGINT NOT NULL REFERENCES organizations(id),
    email           VARCHAR(255) NOT NULL,
    name            VARCHAR(255) NOT NULL,
    role            VARCHAR(50) NOT NULL DEFAULT 'agent',  -- admin, agent, light_agent
    status          VARCHAR(20) NOT NULL DEFAULT 'offline', -- online, away, offline
    skills          TEXT[] NOT NULL DEFAULT '{}',
    max_capacity    INT NOT NULL DEFAULT 20,
    current_load    INT NOT NULL DEFAULT 0,
    signature       TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(org_id, email)
);

-- 团队 / 分组
CREATE TABLE teams (
    id              BIGINT PRIMARY KEY,
    org_id          BIGINT NOT NULL REFERENCES organizations(id),
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    assignment_mode VARCHAR(50) NOT NULL DEFAULT 'round_robin',
    -- round_robin, load_balanced, manual, skill_based
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE team_members (
    team_id         BIGINT NOT NULL REFERENCES teams(id),
    agent_id        BIGINT NOT NULL REFERENCES agents(id),
    is_lead         BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (team_id, agent_id)
);

-- 工单（核心实体）
CREATE TABLE tickets (
    id              BIGINT PRIMARY KEY,
    org_id          BIGINT NOT NULL REFERENCES organizations(id),
    external_id     VARCHAR(255),            -- 面向客户的工单编号
    subject         VARCHAR(500) NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'new',
    -- new, open, pending, on_hold, solved, closed
    priority        VARCHAR(20) NOT NULL DEFAULT 'normal',
    -- urgent, high, normal, low
    category        VARCHAR(100),
    subcategory     VARCHAR(100),
    channel         VARCHAR(50) NOT NULL,    -- email, chat, web_form, api, phone
    source_ref      VARCHAR(500),            -- 原始邮件 message-id、聊天会话 id

    requester_id    BIGINT NOT NULL,          -- 提交的客户
    assignee_id     BIGINT REFERENCES agents(id),
    team_id         BIGINT REFERENCES teams(id),

    -- SLA 跟踪
    sla_policy_id   BIGINT REFERENCES sla_policies(id),
    first_response_at    TIMESTAMPTZ,
    resolved_at          TIMESTAMPTZ,
    first_response_due   TIMESTAMPTZ,
    resolution_due       TIMESTAMPTZ,
    sla_paused_at        TIMESTAMPTZ,        -- 当状态 = pending 时设置
    sla_paused_duration  INTERVAL DEFAULT '0',

    -- AI 增强
    ai_sentiment    VARCHAR(20),              -- positive, neutral, negative, angry
    ai_confidence   FLOAT,
    ai_category     VARCHAR(100),
    ai_summary      TEXT,

    -- 元数据
    tags            TEXT[] NOT NULL DEFAULT '{}',
    custom_fields   JSONB NOT NULL DEFAULT '{}',
    satisfaction    VARCHAR(20),               -- good, bad (CSAT)

    merged_into_id  BIGINT REFERENCES tickets(id),
    is_deleted      BOOLEAN NOT NULL DEFAULT false,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    INDEX idx_tickets_org_status (org_id, status),
    INDEX idx_tickets_assignee (assignee_id, status),
    INDEX idx_tickets_team (team_id, status),
    INDEX idx_tickets_sla_due (org_id, first_response_due),
    INDEX idx_tickets_created (org_id, created_at DESC)
);

-- 工单上的评论 / 回复
CREATE TABLE comments (
    id              BIGINT PRIMARY KEY,
    ticket_id       BIGINT NOT NULL REFERENCES tickets(id),
    author_id       BIGINT NOT NULL,          -- agent_id 或 requester_id
    author_type     VARCHAR(20) NOT NULL,     -- agent, customer, system
    body            TEXT NOT NULL,
    body_html       TEXT,
    is_internal     BOOLEAN NOT NULL DEFAULT false,  -- 内部备注 vs 公开回复
    channel         VARCHAR(50),              -- 回复发送的渠道

    -- 用于邮件线程
    message_id      VARCHAR(500),
    in_reply_to     VARCHAR(500),

    attachments     JSONB NOT NULL DEFAULT '[]',
    mentions        BIGINT[] DEFAULT '{}',    -- @提及的客服人员 ID

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    INDEX idx_comments_ticket (ticket_id, created_at)
);

-- SLA 策略定义
CREATE TABLE sla_policies (
    id                      BIGINT PRIMARY KEY,
    org_id                  BIGINT NOT NULL REFERENCES organizations(id),
    name                    VARCHAR(255) NOT NULL,
    description             TEXT,
    priority                INT NOT NULL DEFAULT 0,  -- 越高 = 越先匹配

    -- 条件：此 SLA 适用于哪些工单
    conditions              JSONB NOT NULL,
    -- 例如 {"priority": ["urgent","high"], "channel": ["email"]}

    -- 目标（分钟）
    first_response_urgent   INT,    -- 例如 30 分钟
    first_response_high     INT,    -- 例如 60 分钟
    first_response_normal   INT,    -- 例如 240 分钟
    first_response_low      INT,    -- 例如 480 分钟

    resolution_urgent       INT,    -- 例如 240 分钟
    resolution_high         INT,    -- 例如 480 分钟
    resolution_normal       INT,    -- 例如 1440 分钟
    resolution_low          INT,    -- 例如 2880 分钟

    -- 工作时间
    use_business_hours      BOOLEAN NOT NULL DEFAULT true,
    business_hours_id       BIGINT,

    is_active               BOOLEAN NOT NULL DEFAULT true,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- SLA 违规记录
CREATE TABLE sla_breaches (
    id              BIGINT PRIMARY KEY,
    ticket_id       BIGINT NOT NULL REFERENCES tickets(id),
    org_id          BIGINT NOT NULL,
    policy_id       BIGINT NOT NULL REFERENCES sla_policies(id),
    breach_type     VARCHAR(30) NOT NULL,  -- first_response, resolution
    target_minutes  INT NOT NULL,
    actual_minutes  INT NOT NULL,
    breached_at     TIMESTAMPTZ NOT NULL,

    INDEX idx_breaches_org (org_id, breached_at DESC)
);

-- 每个工单操作的审计日志
CREATE TABLE ticket_audit_logs (
    id              BIGINT PRIMARY KEY,
    ticket_id       BIGINT NOT NULL REFERENCES tickets(id),
    org_id          BIGINT NOT NULL,
    actor_id        BIGINT NOT NULL,
    actor_type      VARCHAR(20) NOT NULL,    -- agent, customer, system, automation
    action          VARCHAR(50) NOT NULL,
    -- created, status_changed, assigned, priority_changed,
    -- comment_added, tag_added, merged, sla_breached 等
    changes         JSONB NOT NULL,          -- {"field": "status", "from": "new", "to": "open"}
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    INDEX idx_audit_ticket (ticket_id, created_at)
);

-- 标签（反规范化到 tickets.tags[] 但也单独存储用于管理）
CREATE TABLE tags (
    id              BIGINT PRIMARY KEY,
    org_id          BIGINT NOT NULL REFERENCES organizations(id),
    name            VARCHAR(100) NOT NULL,
    color           VARCHAR(7),
    ticket_count    INT NOT NULL DEFAULT 0,
    UNIQUE(org_id, name)
);

-- 每个组织的自定义字段定义
CREATE TABLE custom_field_definitions (
    id              BIGINT PRIMARY KEY,
    org_id          BIGINT NOT NULL REFERENCES organizations(id),
    name            VARCHAR(100) NOT NULL,
    field_key       VARCHAR(100) NOT NULL,
    field_type      VARCHAR(30) NOT NULL,   -- text, number, dropdown, checkbox, date
    options         JSONB,                   -- 下拉选项: ["option1", "option2"]
    is_required     BOOLEAN NOT NULL DEFAULT false,
    is_visible_to_customer BOOLEAN NOT NULL DEFAULT false,
    display_order   INT NOT NULL DEFAULT 0,
    UNIQUE(org_id, field_key)
);

-- 宏（保存的回复模板 + 操作）
CREATE TABLE macros (
    id              BIGINT PRIMARY KEY,
    org_id          BIGINT NOT NULL REFERENCES organizations(id),
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    actions         JSONB NOT NULL,
    -- [
    --   {"type": "set_field", "field": "status", "value": "solved"},
    --   {"type": "set_field", "field": "priority", "value": "low"},
    --   {"type": "add_comment", "body": "Thanks for contacting us...", "is_internal": false}
    -- ]
    scope           VARCHAR(20) NOT NULL DEFAULT 'personal',  -- personal, team, global
    created_by      BIGINT NOT NULL REFERENCES agents(id),
    usage_count     INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 自动化规则（基于触发器）
CREATE TABLE automation_rules (
    id              BIGINT PRIMARY KEY,
    org_id          BIGINT NOT NULL REFERENCES organizations(id),
    name            VARCHAR(255) NOT NULL,
    trigger_event   VARCHAR(50) NOT NULL,    -- on_create, on_update, time_based
    conditions      JSONB NOT NULL,
    actions         JSONB NOT NULL,
    execution_order INT NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    last_run_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 客户 / 请求者记录
CREATE TABLE customers (
    id              BIGINT PRIMARY KEY,
    org_id          BIGINT NOT NULL REFERENCES organizations(id),
    email           VARCHAR(255),
    name            VARCHAR(255),
    phone           VARCHAR(50),
    external_id     VARCHAR(255),            -- 客户系统中的客户 ID
    metadata        JSONB NOT NULL DEFAULT '{}',
    ticket_count    INT NOT NULL DEFAULT 0,
    last_ticket_at  TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(org_id, email)
);

-- 知识库文章
CREATE TABLE articles (
    id              BIGINT PRIMARY KEY,
    org_id          BIGINT NOT NULL REFERENCES organizations(id),
    title           VARCHAR(500) NOT NULL,
    body            TEXT NOT NULL,
    body_html       TEXT NOT NULL,
    category_id     BIGINT,
    status          VARCHAR(20) NOT NULL DEFAULT 'draft',  -- draft, published, archived
    locale          VARCHAR(10) NOT NULL DEFAULT 'en',
    author_id       BIGINT NOT NULL REFERENCES agents(id),
    view_count      INT NOT NULL DEFAULT 0,
    helpful_count   INT NOT NULL DEFAULT 0,
    not_helpful_count INT NOT NULL DEFAULT 0,
    embedding       VECTOR(1536),            -- 用于语义搜索
    published_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 实体关系图

```
+------------------+       +------------------+       +------------------+
| organizations    |       | agents           |       | teams            |
|------------------|       |------------------|       |------------------|
| id (PK)          |<------| org_id (FK)      |       | id (PK)          |
| name             |       | email            |   +-->| org_id (FK)      |
| subdomain        |       | name             |   |   | name             |
| plan             |       | role             |   |   | assignment_mode  |
| timezone         |       | status           |   |   +------------------+
| business_hours   |       | skills[]         |   |          |
+------------------+       | max_capacity     |   |   +------+-------+
        |                  +------------------+   |   | team_members   |
        |                         |               |   |----------------|
        v                         v               |   | team_id (FK)   |
+------------------+       +------------------+   |   | agent_id (FK)  |
| sla_policies     |       | tickets          |   |   +----------------+
|------------------|       |------------------|   |
| id (PK)          |<------| sla_policy_id    |   |
| org_id (FK)      |       | org_id (FK)      |---+
| conditions       |       | subject          |
| first_resp_*     |       | status           |
| resolution_*     |       | priority         |
+------------------+       | requester_id (FK)|----->+------------------+
                           | assignee_id (FK) |----->| customers        |
                           | team_id (FK)     |      |------------------|
                           | channel          |      | id (PK)          |
                           | tags[]           |      | org_id (FK)      |
                           | custom_fields    |      | email            |
                           +------------------+      +------------------+
                                  |
                    +-------------+-------------+
                    |             |             |
             +------+---+  +-----+------+  +---+--------+
             | comments  |  | audit_logs |  | sla_breaches|
             |-----------|  |------------|  |-------------|
             | ticket_id |  | ticket_id  |  | ticket_id   |
             | author_id |  | actor_id   |  | breach_type |
             | body      |  | action     |  | target_min  |
             | is_internal| | changes    |  | actual_min  |
             +-----------+  +------------+  +-------------+
```

---

## 高层架构

```
                         ┌──────────────────────────────────────────────────┐
                         │              全渠道接入                          │
                         │                                                  │
                         │  ┌─────┐ ┌──────┐ ┌───────┐ ┌─────┐ ┌───────┐ │
                         │  │邮件 │ │ 聊天 │ │Web    │ │ API │ │社交   │ │
                         │  │     │ │      │ │表单   │ │     │ │媒体   │ │
                         │  └──┬──┘ └──┬───┘ └──┬────┘ └──┬──┘ └──┬────┘ │
                         └─────┼───────┼────────┼─────────┼───────┼──────┘
                               │       │        │         │       │
                               v       v        v         v       v
                         ┌──────────────────────────────────────────────────┐
                         │              API 网关 / 负载均衡器               │
                         │         （限流、认证、租户 ID）                  │
                         └──────────────────────┬───────────────────────────┘
                                                │
                    ┌───────────────────────────┼───────────────────────────┐
                    │                           │                           │
                    v                           v                           v
          ┌─────────────────┐      ┌─────────────────────┐    ┌────────────────────┐
          │  工单服务        │      │  评论服务            │    │  客户服务           │
          │                  │      │                      │    │                     │
          │ - CRUD           │      │ - 添加/编辑评论      │    │ - 客户档案          │
          │ - 状态管理       │      │ - 内部备注           │    │ - 联系人合并        │
          │ - 字段更新       │      │ - 附件               │    │ - 历史查询          │
          └───────┬──────────┘      └──────────┬───────────┘    └────────────────────┘
                  │                             │
                  v                             v
          ┌──────────────────────────────────────────────┐
          │              事件总线 (Kafka)                 │
          │   ticket.created | ticket.updated |          │
          │   comment.added  | sla.breached   |          │
          └───┬───────┬──────────┬──────────┬────────────┘
              │       │          │          │
              v       v          v          v
    ┌──────────┐ ┌─────────┐ ┌──────────┐ ┌───────────────┐
    │ 路由     │ │  SLA    │ │通知      │ │  搜索         │
    │ 引擎     │ │ 监控器  │ │服务      │ │  索引器       │
    │          │ │         │ │          │ │               │
    │ - 规则   │ │ - 计时  │ │ - 邮件   │ │ - Elastic-    │
    │ - 技能   │ │ - 违规  │ │ - 推送   │ │   search      │
    │ - 负载   │ │ - 暂停  │ │ - WS     │ │ - 全文        │
    │   均衡   │ │ - 升级  │ │ - Slack  │ │ - 分面        │
    └──────────┘ └─────────┘ └──────────┘ └───────────────┘
              │       │          │
              v       v          v
    ┌──────────┐ ┌─────────┐ ┌──────────┐ ┌───────────────┐
    │自动化    │ │AI / ML  │ │分析      │ │ 知识          │
    │引擎      │ │服务     │ │服务      │ │ 库            │
    │          │ │         │ │          │ │               │
    │ - 触发器 │ │ - 分类  │ │ - CSAT   │ │ - 文章        │
    │ - 定时   │ │ - 情感  │ │ - 客服   │ │ - 搜索        │
    │   任务   │ │ - 建议  │ │   绩效   │ │ - 建议        │
    │ - 规则   │ │ - 机器人│ │ - SLA    │ │ - 分流        │
    └──────────┘ └─────────┘ └──────────┘ └───────────────┘
              │       │          │              │
              v       v          v              v
    ┌────────────────────────────────────────────────────────┐
    │                    数据层                               │
    │                                                        │
    │  ┌──────────┐  ┌───────────┐  ┌──────┐  ┌──────────┐ │
    │  │PostgreSQL│  │Elastic-   │  │Redis │  │对象      │ │
    │  │(分片)    │  │search     │  │缓存  │  │存储      │ │
    │  │          │  │集群       │  │      │  │(S3)      │ │
    │  │- 工单    │  │- 全文     │  │- 热  │  │- 附件    │ │
    │  │- 评论    │  │  搜索     │  │  数据│  │- 导出    │ │
    │  │- 客服    │  │- 分析     │  │- WS  │  │          │ │
    │  │- SLA     │  │- 建议     │  │  发布│  │          │ │
    │  │- 审计    │  │           │  │  /订阅│  │          │ │
    │  └──────────┘  └───────────┘  └──────┘  └──────────┘ │
    └────────────────────────────────────────────────────────┘
```

---

## 深入探讨：工单生命周期

### 状态机

```
                          ┌─────────────────────────┐
                          │    工单生命周期           │
                          │      状态机              │
                          └─────────────────────────┘

    ┌───────┐    客服接手           ┌───────┐
    │  新建  │ ──────────────────>   │ 处理中│
    │       │    或自动分配         │       │
    └───┬───┘                       └───┬───┘
        │                               │
        │  自动路由                      │  客服回复，等待
        │  （无可用客服）                │  客户响应
        │                               │
        │         ┌─────────────────────v───────┐
        │         │         等待中               │
        │         │  （SLA 计时器已暂停）        │
        │         └────────────┬────────────────┘
        │                      │
        │                      │  客户响应
        │                      │  （SLA 计时器恢复）
        │                      │
        │         ┌────────────v────────────────┐
        │         │         处理中               │
        │         │  （返回客服）                │◄─────────────────┐
        │         └────────────┬────────────────┘                  │
        │                      │                                    │
        │         ┌────────────v────────────────┐                  │
        │         │        暂挂                  │                  │
        │         │  （等待第三方）              │                  │
        │         │  （SLA 计时器已暂停）        │──────────────────┘
        │         └─────────────────────────────┘   第三方响应
        │
        │         ┌─────────────────────────────┐
        └────────>│        已解决                │
                  │  （客服标记为已解决）         │
                  └────────────┬────────────────┘
                               │
                               │  X 天后自动关闭
                               │  （可配置）
                               │
                  ┌────────────v────────────────┐
                  │        已关闭                │
                  │  （最终状态，不可变）         │
                  └─────────────────────────────┘

    重新打开规则：
    ──────────────────
    已解决 → 处理中  ：客户在自动关闭窗口内回复
    已关闭 → 新建    ：创建后续工单（关联原工单）
    任意   → 处理中  ：客服手动重新打开（记录审计日志）
```

### 状态转换规则（代码中强制执行）

```python
VALID_TRANSITIONS = {
    "new":      ["open", "pending", "solved"],
    "open":     ["pending", "on_hold", "solved"],
    "pending":  ["open", "solved"],
    "on_hold":  ["open", "solved"],
    "solved":   ["open", "closed"],
    "closed":   [],   # 终态 -- 不允许转出
}

def transition_ticket(ticket, new_status, actor):
    """验证后将工单转换到新状态。"""
    if new_status not in VALID_TRANSITIONS[ticket.status]:
        raise InvalidTransitionError(
            f"Cannot transition from {ticket.status} to {new_status}"
        )

    old_status = ticket.status

    # 处理 SLA 计时器暂停/恢复
    if new_status in ("pending", "on_hold") and old_status in ("new", "open"):
        sla_pause(ticket)
    elif new_status == "open" and old_status in ("pending", "on_hold"):
        sla_resume(ticket)
    elif new_status == "solved":
        record_resolution_time(ticket)

    # 创建新的工单状态（不可变模式）
    updated_ticket = {
        **ticket,
        "status": new_status,
        "updated_at": now(),
    }

    # 持久化并发出事件
    save_ticket(updated_ticket)
    emit_event("ticket.status_changed", {
        "ticket_id": ticket.id,
        "from": old_status,
        "to": new_status,
        "actor_id": actor.id,
        "actor_type": actor.type,
        "timestamp": now(),
    })

    return updated_ticket
```

### 自动关闭逻辑

```python
# 作为定时任务每 5 分钟运行一次
def auto_close_solved_tickets(org_id):
    """关闭已处于'已解决'状态超过自动关闭窗口期的工单。"""
    auto_close_days = get_org_setting(org_id, "auto_close_days", default=7)
    cutoff = now() - timedelta(days=auto_close_days)

    solved_tickets = query(
        "SELECT id FROM tickets WHERE org_id = %s AND status = 'solved' "
        "AND updated_at < %s LIMIT 1000",
        [org_id, cutoff]
    )

    for ticket in solved_tickets:
        transition_ticket(ticket, "closed", actor=SYSTEM_ACTOR)

# 客户回复时重新打开
def handle_customer_reply(ticket, comment):
    """当客户回复时重新打开已解决的工单。"""
    if ticket.status == "solved":
        transition_ticket(ticket, "open", actor=comment.author)
    elif ticket.status == "closed":
        follow_up = create_follow_up_ticket(ticket, comment)
        return follow_up
    return ticket
```

---

## 深入探讨：路由与分配

### 路由架构

```
                    新工单创建
                          │
                          v
                ┌─────────────────────┐
                │  路由引擎           │
                └─────────┬───────────┘
                          │
              ┌───────────┼───────────────┐
              │           │               │
              v           v               v
     ┌──────────────┐ ┌────────────┐ ┌─────────────┐
     │ 基于规则的   │ │ 基于技能的 │ │ AI 预测     │
     │ 路由         │ │ 匹配       │ │ 路由         │
     │              │ │            │ │              │
     │ IF category= │ │ 将工单     │ │ ML 模型     │
     │ "billing"    │ │ 技能与     │ │ 从内容      │
     │ THEN team=   │ │ 客服技能   │ │ 预测最佳    │
     │ "billing"    │ │ 匹配       │ │ 团队        │
     │              │ │            │ │              │
     └──────┬───────┘ └─────┬──────┘ └──────┬──────┘
            │               │               │
            └───────────────┼───────────────┘
                            │
                            v
                 ┌──────────────────────┐
                 │  分配引擎            │
                 └──────────┬───────────┘
                            │
              ┌─────────────┼────────────────┐
              │             │                │
              v             v                v
     ┌──────────────┐ ┌─────────────┐ ┌──────────────┐
     │ 轮询分配     │ │ 负载均衡    │ │ 优先级       │
     │              │ │             │ │ 队列         │
     │ 在可用       │ │ 分配给      │ │              │
     │ 客服间       │ │ 当前负载    │ │ 紧急优先     │
     │ 循环轮转     │ │ 最低的      │ │ 同优先级     │
     │              │ │ 客服        │ │ 内 FIFO      │
     └──────────────┘ └─────────────┘ └──────────────┘
```

### 路由规则评估

```python
def evaluate_routing_rules(ticket, org_rules):
    """按优先级顺序评估路由规则。第一个匹配的规则生效。"""
    sorted_rules = sorted(org_rules, key=lambda r: r.execution_order)

    for rule in sorted_rules:
        if not rule.is_active:
            continue
        if matches_conditions(ticket, rule.conditions):
            return apply_routing_actions(ticket, rule.actions)

    # 兜底：分配到默认队列
    return assign_to_default_queue(ticket)

def matches_conditions(ticket, conditions):
    """检查工单是否满足所有规则条件。"""
    for condition in conditions:
        field_value = get_field(ticket, condition["field"])
        operator = condition["operator"]
        target = condition["value"]

        if operator == "equals" and field_value != target:
            return False
        elif operator == "contains" and target not in field_value:
            return False
        elif operator == "in" and field_value not in target:
            return False
        elif operator == "regex" and not re.match(target, field_value):
            return False

    return True  # 所有条件满足
```

### 使用 Redis 的轮询分配

```python
ROUND_ROBIN_KEY = "rr:{org_id}:{team_id}"

def assign_round_robin(ticket, team_id):
    """使用 Redis 支持的轮询将工单分配给下一个可用客服。"""
    available_agents = get_available_agents(team_id)

    if not available_agents:
        return None  # 工单留在队列中未分配

    agent_ids = [a.id for a in available_agents]

    # 原子递增获取下一个客服索引
    idx = redis.incr(ROUND_ROBIN_KEY.format(
        org_id=ticket.org_id, team_id=team_id
    ))

    selected_idx = idx % len(agent_ids)
    selected_agent = available_agents[selected_idx]

    # 检查容量
    if selected_agent.current_load >= selected_agent.max_capacity:
        # 尝试下一个客服直到找到有容量的
        for offset in range(1, len(agent_ids)):
            candidate_idx = (selected_idx + offset) % len(agent_ids)
            candidate = available_agents[candidate_idx]
            if candidate.current_load < candidate.max_capacity:
                return assign_to_agent(ticket, candidate)
        return None  # 所有客服已满载

    return assign_to_agent(ticket, selected_agent)

def get_available_agents(team_id):
    """获取在线且未达到最大容量的客服。"""
    return query(
        "SELECT * FROM agents a "
        "JOIN team_members tm ON tm.agent_id = a.id "
        "WHERE tm.team_id = %s AND a.status = 'online' "
        "AND a.current_load < a.max_capacity "
        "ORDER BY a.current_load ASC",
        [team_id]
    )
```

### 基于技能的路由

```python
def skill_based_assignment(ticket, team_id):
    """将工单分配给技能匹配度最高的客服。"""
    required_skills = infer_required_skills(ticket)
    agents = get_available_agents(team_id)

    scored_agents = []
    for agent in agents:
        # 计算技能匹配分数
        matched = set(agent.skills) & set(required_skills)
        skill_score = len(matched) / len(required_skills) if required_skills else 0

        # 考虑当前负载（偏好较空闲的客服）
        load_score = 1 - (agent.current_load / agent.max_capacity)

        # 综合评分：70% 技能匹配，30% 可用性
        composite = (0.7 * skill_score) + (0.3 * load_score)
        scored_agents.append((agent, composite))

    scored_agents.sort(key=lambda x: x[1], reverse=True)

    if scored_agents and scored_agents[0][1] > 0.3:
        return assign_to_agent(ticket, scored_agents[0][0])

    # 无良好技能匹配时回退到轮询分配
    return assign_round_robin(ticket, team_id)

def infer_required_skills(ticket):
    """从工单元数据和内容推导所需技能。"""
    skills = []

    if ticket.category:
        skills.append(ticket.category)
    if ticket.channel == "chat":
        skills.append("live_chat")
    if ticket.custom_fields.get("product"):
        skills.append(ticket.custom_fields["product"])
    if ticket.priority == "urgent":
        skills.append("escalation_handling")

    # 从工单内容进行 AI 预测的技能
    ai_skills = ml_service.predict_skills(ticket.subject, ticket.description)
    skills.extend(ai_skills)

    return list(set(skills))
```

### 升级规则

```
升级矩阵：
+----------------------------+------------------+------------------+-------------------+
| 条件                       | 升级级别         | 操作             | 通知              |
+----------------------------+------------------+------------------+-------------------+
| SLA 已过 50%，             | 级别 1           | 将优先级提升     | 通过推送 + 邮件   |
| 无首次响应                 |                  | 至"高"           | 通知分配的客服    |
+----------------------------+------------------+------------------+-------------------+
| SLA 已过 75%，             | 级别 2           | 重新分配给       | 通过 Slack + 推送 |
| 无首次响应                 |                  | 团队负责人       | 通知团队负责人    |
+----------------------------+------------------+------------------+-------------------+
| SLA 已违规（100%），       | 级别 3           | 分配给           | 通过 PagerDuty    |
| 首次响应                   |                  | 经理             | 通知经理          |
+----------------------------+------------------+------------------+-------------------+
| SLA 已过 50%，             | 级别 1           | 在客服仪表板     | 分配的客服        |
| 未解决                     |                  | 中高亮显示       |                   |
+----------------------------+------------------+------------------+-------------------+
| SLA 已违规，               | 级别 3           | 升级给           | 通过 PagerDuty    |
| 解决时间（紧急工单）       |                  | 高级工程师       | 通知 VP           |
+----------------------------+------------------+------------------+-------------------+
| 客户回复 3+ 次，           | 挫败感           | 自动提升         | 团队负责人        |
| 无客服响应                 | 升级             | 优先级           |                   |
+----------------------------+------------------+------------------+-------------------+
```

---

## 深入探讨：SLA 管理

### SLA 策略匹配

```python
def match_sla_policy(ticket, org_policies):
    """将工单匹配到优先级最高的适用 SLA 策略。"""
    sorted_policies = sorted(org_policies, key=lambda p: p.priority, reverse=True)

    for policy in sorted_policies:
        if not policy.is_active:
            continue
        if sla_conditions_match(ticket, policy.conditions):
            return policy

    return None  # 无适用 SLA（如存在则使用组织默认值）

def sla_conditions_match(ticket, conditions):
    """检查工单是否匹配 SLA 策略条件。"""
    # conditions: {"priority": ["urgent", "high"], "channel": ["email"], "tags": ["vip"]}
    for field, values in conditions.items():
        ticket_value = getattr(ticket, field, None)
        if ticket_value is None:
            return False
        # 处理数组字段（标签）
        if isinstance(ticket_value, list):
            if not set(values) & set(ticket_value):
                return False
        elif ticket_value not in values:
            return False
    return True
```

### 工作时间计算

```python
def calculate_due_time(start_time, target_minutes, business_hours_config):
    """
    计算遵守工作时间的 SLA 截止时间。

    business_hours_config 示例：
    {
        "timezone": "America/New_York",
        "schedule": {
            "monday":    {"start": "09:00", "end": "17:00"},
            "tuesday":   {"start": "09:00", "end": "17:00"},
            "wednesday": {"start": "09:00", "end": "17:00"},
            "thursday":  {"start": "09:00", "end": "17:00"},
            "friday":    {"start": "09:00", "end": "17:00"},
            "saturday":  null,
            "sunday":    null
        },
        "holidays": ["2026-01-01", "2026-12-25"]
    }
    """
    tz = pytz.timezone(business_hours_config["timezone"])
    current = start_time.astimezone(tz)
    remaining_minutes = target_minutes

    while remaining_minutes > 0:
        day_name = current.strftime("%A").lower()
        schedule = business_hours_config["schedule"].get(day_name)
        date_str = current.strftime("%Y-%m-%d")

        # 跳过假日和非工作日
        if schedule is None or date_str in business_hours_config.get("holidays", []):
            current = next_business_day_start(current, business_hours_config)
            continue

        biz_start = parse_time(schedule["start"], current.date(), tz)
        biz_end = parse_time(schedule["end"], current.date(), tz)

        # 如果在工作时间之前，跳到开始时间
        if current < biz_start:
            current = biz_start

        # 如果在工作时间之后，跳到下一天
        if current >= biz_end:
            current = next_business_day_start(current, business_hours_config)
            continue

        # 计算今天的可用分钟数
        available = (biz_end - current).total_seconds() / 60

        if remaining_minutes <= available:
            return current + timedelta(minutes=remaining_minutes)

        remaining_minutes -= available
        current = next_business_day_start(current, business_hours_config)

    return current
```

### SLA 计时器暂停/恢复

```python
def sla_pause(ticket):
    """当工单进入等待中或暂挂状态时暂停 SLA 计时器。"""
    return {
        **ticket,
        "sla_paused_at": now(),
    }

def sla_resume(ticket):
    """当工单返回处理中状态时恢复 SLA 计时器。"""
    if ticket.sla_paused_at is None:
        return ticket

    paused_duration = now() - ticket.sla_paused_at
    total_paused = ticket.sla_paused_duration + paused_duration

    # 按暂停时长延长截止时间
    updated = {
        **ticket,
        "sla_paused_at": None,
        "sla_paused_duration": total_paused,
    }

    if ticket.first_response_due and not ticket.first_response_at:
        updated["first_response_due"] = ticket.first_response_due + paused_duration

    if ticket.resolution_due:
        updated["resolution_due"] = ticket.resolution_due + paused_duration

    return updated
```

### SLA 监控服务

```python
# 持续运行，检查 SLA 截止时间
class SLAMonitor:
    """
    轮询即将到期或已超期的 SLA 截止时间的工单。
    每 30 秒运行一次以确保 < 1 分钟的检测延迟。
    """

    def check_approaching_breaches(self):
        """查找即将违反 SLA 的工单（在升级阈值范围内）。"""
        thresholds = [
            (0.50, "sla_50_percent"),
            (0.75, "sla_75_percent"),
            (1.00, "sla_breached"),
        ]

        for fraction, event_type in thresholds:
            # 首次响应 SLA
            at_risk_tickets = query("""
                SELECT t.* FROM tickets t
                WHERE t.status IN ('new', 'open')
                  AND t.first_response_at IS NULL
                  AND t.first_response_due IS NOT NULL
                  AND t.sla_paused_at IS NULL
                  AND t.first_response_due - (
                      (t.first_response_due - t.created_at) * (1 - %s)
                  ) <= NOW()
                  AND NOT EXISTS (
                      SELECT 1 FROM sla_escalations se
                      WHERE se.ticket_id = t.id AND se.threshold = %s
                  )
                LIMIT 500
            """, [fraction, event_type])

            for ticket in at_risk_tickets:
                self.handle_escalation(ticket, "first_response", fraction, event_type)

    def handle_escalation(self, ticket, sla_type, fraction, event_type):
        """根据阈值应用升级操作。"""
        if fraction >= 1.0:
            # SLA 已违规 -- 记录违规
            create_sla_breach(ticket, sla_type)
            emit_event("sla.breached", {
                "ticket_id": ticket.id,
                "breach_type": sla_type,
                "org_id": ticket.org_id,
            })

        # 记录已处理此阈值（防止重复告警）
        record_escalation(ticket.id, event_type)

        # 从组织配置执行升级操作
        escalation_config = get_escalation_config(ticket.org_id, fraction)
        for action in escalation_config.actions:
            execute_escalation_action(ticket, action)
```

### SLA 仪表板数据

```
SLA 合规仪表板：
+------------------------------------------------------+
|  SLA 合规率 - 最近 30 天                              |
+------------------------------------------------------+
|                                                      |
|  首次响应 SLA                                        |
|  ┌────────────────────────────────────────────────┐  |
|  │ ████████████████████████████████████░░░░ 91.2% │  |
|  └────────────────────────────────────────────────┘  |
|  目标: 95%  |  违规: 879 / 10,000                    |
|                                                      |
|  解决时间 SLA                                        |
|  ┌────────────────────────────────────────────────┐  |
|  │ ██████████████████████████████████████░░ 94.5%  │  |
|  └────────────────────────────────────────────────┘  |
|  目标: 90%  |  违规: 550 / 10,000                    |
|                                                      |
|  按优先级：                                          |
|  +----------+--------+-----------+--------+          |
|  | 优先级   | 目标   | 实际      | 状态   |          |
|  +----------+--------+-----------+--------+          |
|  | 紧急     | 30 min | 28 min    | 通过   |          |
|  | 高       | 1 hr   | 52 min    | 通过   |          |
|  | 普通     | 4 hr   | 4.2 hr    | 未达标 |          |
|  | 低       | 8 hr   | 5.1 hr    | 通过   |          |
|  +----------+--------+-----------+--------+          |
+------------------------------------------------------+
```

---

## 深入探讨：多渠道接入

### 渠道架构

```
┌──────────────────────────────────────────────────────────────────┐
│                    多渠道接入                                     │
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │  邮件    │  │   聊天   │  │ Web 表单 │  │   API    │       │
│  │          │  │          │  │          │  │          │       │
│  │ SMTP/    │  │ WebSocket│  │ REST     │  │ REST/    │       │
│  │ IMAP     │  │ 会话     │  │ POST     │  │ Webhook  │       │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘       │
│       │             │             │             │              │
│       v             v             v             v              │
│  ┌──────────────────────────────────────────────────────┐      │
│  │           渠道归一化器                                │      │
│  │                                                      │      │
│  │  - 提取主题、正文、发件人、附件                       │      │
│  │  - 检测语言                                          │      │
│  │  - 映射到统一工单模式                                │      │
│  │  - 去重（邮件 Message-ID、幂等键）                   │      │
│  │  - 匹配到现有工单（线程）                            │      │
│  └──────────────────────┬───────────────────────────────┘      │
│                         │                                       │
│                         v                                       │
│              ┌─────────────────────┐                           │
│              │  工单服务            │                           │
│              │  （创建或更新）      │                           │
│              └─────────────────────┘                           │
└──────────────────────────────────────────────────────────────────┘
```

### 邮件转工单处理

```python
class EmailProcessor:
    """
    将入站邮件处理为工单。

    邮件路由：每个租户获得一个支持地址，如
    support@{subdomain}.ticketsystem.com
    入站邮件通过邮件提供商的 webhook 接收
    （SendGrid、Mailgun、AWS SES）。
    """

    def process_inbound_email(self, raw_email):
        """解析原始邮件并创建或更新工单。"""
        parsed = self.parse_email(raw_email)

        # 从收件人地址确定租户
        org = self.resolve_org(parsed.to_address)
        if org is None:
            return  # 退回或忽略

        # 检查是否是对现有工单的回复
        existing_ticket = self.find_existing_ticket(parsed, org.id)

        if existing_ticket:
            return self.add_reply_to_ticket(existing_ticket, parsed)

        return self.create_ticket_from_email(org, parsed)

    def parse_email(self, raw_email):
        """从原始邮件中提取结构化数据。"""
        return {
            "message_id": extract_header("Message-ID"),
            "in_reply_to": extract_header("In-Reply-To"),
            "references": extract_header("References"),
            "from_address": extract_header("From"),
            "from_name": extract_name("From"),
            "to_address": extract_header("To"),
            "subject": extract_header("Subject"),
            "body_text": extract_text_body(raw_email),
            "body_html": extract_html_body(raw_email),
            "attachments": extract_attachments(raw_email),
            "received_at": now(),
        }

    def find_existing_ticket(self, parsed, org_id):
        """通过 Message-ID 引用将邮件线程化到现有工单。"""
        # 检查 In-Reply-To 头部
        if parsed["in_reply_to"]:
            ticket = find_ticket_by_message_id(org_id, parsed["in_reply_to"])
            if ticket:
                return ticket

        # 检查 References 头部链
        if parsed["references"]:
            for ref in reversed(parsed["references"].split()):
                ticket = find_ticket_by_message_id(org_id, ref.strip())
                if ticket:
                    return ticket

        # 兜底：检查主题行中的工单 ID 模式 [#12345]
        ticket_id_match = re.search(r'\[#(\d+)\]', parsed["subject"])
        if ticket_id_match:
            return find_ticket_by_external_id(org_id, ticket_id_match.group(1))

        return None

    def create_ticket_from_email(self, org, parsed):
        """从入站邮件创建新工单。"""
        customer = find_or_create_customer(org.id, parsed["from_address"], parsed["from_name"])

        attachments = []
        for att in parsed["attachments"]:
            url = upload_to_object_storage(att["filename"], att["content"], att["content_type"])
            attachments.append({
                "filename": att["filename"],
                "url": url,
                "size": len(att["content"]),
                "content_type": att["content_type"],
            })

        ticket = create_ticket({
            "org_id": org.id,
            "subject": strip_re_fwd(parsed["subject"]),
            "channel": "email",
            "source_ref": parsed["message_id"],
            "requester_id": customer.id,
            "priority": "normal",  # 可能被自动化规则覆盖
        })

        add_comment({
            "ticket_id": ticket.id,
            "author_id": customer.id,
            "author_type": "customer",
            "body": parsed["body_text"],
            "body_html": parsed["body_html"],
            "message_id": parsed["message_id"],
            "attachments": attachments,
            "is_internal": False,
        })

        return ticket
```

### 聊天转工单

```python
def convert_chat_to_ticket(chat_session):
    """
    将已完成的聊天会话转换为工单以进行后续跟进。
    在以下情况调用：
    1. 聊天客服无法实时解决
    2. 聊天会话结束但未解决
    3. 客户请求邮件跟进
    """
    transcript = build_chat_transcript(chat_session.messages)

    ticket = create_ticket({
        "org_id": chat_session.org_id,
        "subject": chat_session.topic or f"Chat conversation on {chat_session.started_at}",
        "channel": "chat",
        "source_ref": chat_session.id,
        "requester_id": chat_session.customer_id,
        "assignee_id": chat_session.agent_id,  # 保持同一客服
        "priority": "normal",
    })

    # 将完整对话记录作为第一条评论添加
    add_comment({
        "ticket_id": ticket.id,
        "author_type": "system",
        "body": transcript,
        "is_internal": False,
    })

    # 添加包含聊天元数据的内部备注
    add_comment({
        "ticket_id": ticket.id,
        "author_type": "system",
        "body": (
            f"Converted from chat session {chat_session.id}.\n"
            f"Duration: {chat_session.duration_minutes} min\n"
            f"Messages exchanged: {len(chat_session.messages)}\n"
            f"Customer sentiment: {chat_session.sentiment}"
        ),
        "is_internal": True,
    })

    return ticket
```

### 渠道统一规则

```
渠道统一：
+------------------+---------------------+----------------------------+
| 渠道             | 工单创建            | 线程化                      |
+------------------+---------------------+----------------------------+
| 邮件             | 收到新入站邮件时    | In-Reply-To / References    |
|                  | 自动创建            | 头部；主题中的 [#ID]        |
+------------------+---------------------+----------------------------+
| 聊天             | 客服转换，或        | 聊天会话 ID 关联            |
|                  | 超时自动转换        | 到工单 source_ref           |
+------------------+---------------------+----------------------------+
| Web 表单         | 提交时立即          | 使用客户邮箱                |
|                  | 创建                | 关联到现有客户              |
+------------------+---------------------+----------------------------+
| API              | POST /api/v1/tickets| 幂等键防止                  |
|                  | 从客户端系统        | 重复；external_id           |
+------------------+---------------------+----------------------------+
| 社交媒体         | 从社交监控          | 平台线程 ID                 |
| (Twitter, FB)    | 的 Webhook          | 跟踪对话                   |
+------------------+---------------------+----------------------------+

去重策略：
  1. 邮件：Message-ID 全局唯一 → 存储在 comments.message_id
  2. API：客户端发送 Idempotency-Key 头部 → 存储在 Redis（TTL 24 小时）
  3. Web 表单：按客户邮箱限流（最多 5 次/分钟）
  4. 聊天：每个聊天会话 ID 一个工单
```

---

## 深入探讨：实时协作

### 客服冲突检测

```
问题：两个客服同时打开同一个工单。
     双方都在输入回复。一个覆盖了另一个的工作。

解决方案：实时在线状态 + 乐观锁

┌──────────────┐                    ┌──────────────┐
│   客服 A     │                    │   客服 B     │
│   (Chrome)   │                    │   (Firefox)  │
└──────┬───────┘                    └──────┬───────┘
       │                                    │
       │  打开工单 #123                     │
       │  ─────────────────>                │
       │                     WebSocket      │
       │  <── 在线状态: "客服 A 正在查看"   │
       │                                    │
       │                          打开工单 #123
       │                          ─────────────────>
       │                                    │
       │  <── 在线状态: "客服 B 正在查看"   │
       │  ┌──────────────────────┐          │
       │  │ ⚠ 客服 B 也在       │          │
       │  │ 查看此工单           │          │
       │  └──────────────────────┘          │
       │                                    │
       │  开始输入回复                      │
       │  ─────────────────>                │
       │                                    │
       │  <── "客服 A 正在输入..."          │
       │                          ┌─────────────────────┐
       │                          │ ⚠ 客服 A 正在输入  │
       │                          │   回复...           │
       │                          └─────────────────────┘
```

### WebSocket 事件系统

```python
# 用于实时协作的 WebSocket 事件类型
EVENTS = {
    # 工单更新（广播给所有查看者）
    "ticket.updated":       "工单字段已更改",
    "ticket.status_changed": "状态转换",
    "ticket.assigned":       "新的分配人",

    # 评论事件
    "comment.added":        "工单上的新评论",
    "comment.edited":       "评论文本已修改",

    # 在线状态事件（按工单）
    "presence.viewing":     "客服打开了此工单",
    "presence.left":        "客服关闭了此工单",
    "presence.typing":      "客服正在撰写回复",
    "presence.stopped_typing": "客服停止输入",

    # SLA 事件
    "sla.warning":          "SLA 即将违规",
    "sla.breached":         "SLA 已违规",

    # 队列事件
    "queue.new_ticket":     "客服队列中的新工单",
    "queue.ticket_removed": "工单已从队列中移除",
}

class TicketWebSocketManager:
    """管理工单协作的实时事件。"""

    def __init__(self):
        self.redis_pubsub = Redis()

    def subscribe_to_ticket(self, agent_id, ticket_id, ws_connection):
        """将客服订阅到工单的实时更新。"""
        channel = f"ticket:{ticket_id}"

        # 发布在线状态事件
        self.redis_pubsub.publish(channel, json.dumps({
            "type": "presence.viewing",
            "agent_id": agent_id,
            "agent_name": get_agent_name(agent_id),
            "timestamp": now().isoformat(),
        }))

        # 在 Redis 有序集合中跟踪活跃查看者（分数 = 时间戳）
        self.redis_pubsub.zadd(
            f"viewers:{ticket_id}",
            {str(agent_id): time.time()}
        )

        # 将连接订阅到频道
        self.redis_pubsub.subscribe(channel, callback=ws_connection.send)

    def broadcast_ticket_update(self, ticket_id, event_type, payload):
        """向所有正在查看工单的客服广播事件。"""
        channel = f"ticket:{ticket_id}"
        self.redis_pubsub.publish(channel, json.dumps({
            "type": event_type,
            **payload,
            "timestamp": now().isoformat(),
        }))

    def get_active_viewers(self, ticket_id):
        """获取当前正在查看工单的客服列表。"""
        cutoff = time.time() - 300  # 5 分钟心跳超时
        return self.redis_pubsub.zrangebyscore(
            f"viewers:{ticket_id}", cutoff, "+inf"
        )
```

### 内部备注和 @提及

```python
def add_comment_with_mentions(ticket_id, author_id, body, is_internal):
    """添加评论，提取 @提及，并通知被提及的客服。"""
    # 从评论正文中提取 @提及
    mentions = extract_mentions(body)  # 返回客服 ID 列表

    comment = add_comment({
        "ticket_id": ticket_id,
        "author_id": author_id,
        "author_type": "agent",
        "body": body,
        "is_internal": is_internal,
        "mentions": mentions,
    })

    # 通知被提及的客服
    for agent_id in mentions:
        send_notification(agent_id, {
            "type": "mention",
            "message": f"You were mentioned in ticket #{ticket_id}",
            "ticket_id": ticket_id,
            "comment_id": comment.id,
            "mentioned_by": author_id,
        })

        # 自动添加为关注者
        add_follower(ticket_id, agent_id)

    # 通知工单的所有关注者
    followers = get_followers(ticket_id)
    for follower_id in followers:
        if follower_id != author_id:
            send_notification(follower_id, {
                "type": "new_comment",
                "ticket_id": ticket_id,
                "comment_id": comment.id,
                "is_internal": is_internal,
            })

    return comment

def extract_mentions(body):
    """从评论文本中提取 @提及的客服。"""
    # 模式: @[Agent Name](agent:123)
    pattern = r'@\[([^\]]+)\]\(agent:(\d+)\)'
    matches = re.findall(pattern, body)
    return [int(agent_id) for _, agent_id in matches]
```

---

## 深入探讨：知识库与自助服务

### 知识库架构

```
┌──────────────────────────────────────────────────────────┐
│                 客户门户                                  │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ 搜索栏       │  │  文章        │  │  提交         │  │
│  │              │  │  浏览器      │  │  工单         │  │
│  │ "如何重置    │  │              │  │              │  │
│  │  我的密码？" │  │ 分类：       │  │  （仅在文章   │  │
│  │              │  │ - 入门指南   │  │  无法解决     │  │
│  │              │  │ - 计费       │  │  问题时显示） │  │
│  │              │  │ - API 文档   │  │              │  │
│  └──────┬───────┘  └──────────────┘  └───────────────┘  │
│         │                                                │
│         v                                                │
│  ┌──────────────────────────────────────────────────┐    │
│  │         AI 驱动的搜索与建议                       │    │
│  │                                                  │    │
│  │  1. 关键词搜索（Elasticsearch）                  │    │
│  │  2. 语义搜索（向量嵌入）                         │    │
│  │  3. 按相关性 + 浏览量 + 有用性排名               │    │
│  │  4. 跟踪分流（客户查看文章后                     │    │
│  │     未提交工单）                                  │    │
│  └──────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
```

### 为客服推荐文章

```python
def suggest_articles_for_ticket(ticket):
    """
    为打开的工单推荐相关的知识库文章。
    客服用于快速找到解决方案，客户门户
    用于在提交前分流工单。
    """
    # 从工单内容构建搜索查询
    query_text = f"{ticket.subject} {ticket.description}"

    # 混合搜索：关键词 + 语义
    keyword_results = elasticsearch.search(
        index=f"articles_{ticket.org_id}",
        query={
            "bool": {
                "must": [
                    {"multi_match": {
                        "query": query_text,
                        "fields": ["title^3", "body"],
                        "type": "best_fields"
                    }},
                    {"term": {"status": "published"}}
                ]
            }
        },
        size=10
    )

    # 使用嵌入进行语义搜索
    query_embedding = embedding_model.encode(query_text)
    vector_results = pgvector.query(
        "SELECT id, title, 1 - (embedding <=> %s) AS similarity "
        "FROM articles WHERE org_id = %s AND status = 'published' "
        "ORDER BY embedding <=> %s LIMIT 10",
        [query_embedding, ticket.org_id, query_embedding]
    )

    # 合并并重新排名结果
    combined = merge_results(keyword_results, vector_results)
    reranked = rerank_by_helpfulness(combined)

    return reranked[:5]

def track_deflection(customer_id, article_id, org_id):
    """
    跟踪客户查看文章后未提交工单的情况。
    当客户离开帮助中心而未创建工单时调用。
    """
    record_event("article.deflection", {
        "customer_id": customer_id,
        "article_id": article_id,
        "org_id": org_id,
        "timestamp": now(),
    })

    increment_counter(f"article:{article_id}:deflections")
```

### 分流指标

```
知识库效果：
+------------------------------------------------------+
|  分流率: 34.2%（目标: 30%）                          |
|  ──────────────────────────────────────              |
|                                                      |
|  本月最佳分流文章：                                  |
|  +----+-------------------------------+--------+----+
|  | #  | 文章标题                      | 浏览量 | 分流|
|  +----+-------------------------------+--------+----+
|  | 1  | 如何重置密码                  | 12,400 | 62% |
|  | 2  | 计费常见问题                  |  8,200 | 48% |
|  | 3  | API 限流说明                  |  5,100 | 55% |
|  | 4  | 连接你的邮箱账户              |  4,800 | 41% |
|  | 5  | 登录问题排查                  |  4,200 | 37% |
|  +----+-------------------------------+--------+----+
|                                                      |
|  需要改进的文章（低有用性）：                        |
|  +----+-------------------------------+--------+----+
|  | #  | 文章标题                      | 有用   | 分流|
|  +----+-------------------------------+--------+----+
|  | 1  | 设置 SSO                      |   22%  | 11% |
|  | 2  | 数据导出指南                  |   31%  | 15% |
|  | 3  | Webhook 配置                  |   28%  | 13% |
|  +----+-------------------------------+--------+----+
+------------------------------------------------------+
```

---

## 深入探讨：AI/ML 集成

### 工单处理的 AI 流水线

```
                    新工单
                        │
                        v
              ┌─────────────────────┐
              │  AI 增强             │
              │  流水线              │
              └─────────┬───────────┘
                        │
          ┌─────────────┼─────────────────┐
          │             │                 │
          v             v                 v
   ┌────────────┐ ┌──────────────┐ ┌────────────────┐
   │ 分类器     │ │  情感        │ │  语言          │
   │            │ │  分析器      │ │  检测器        │
   │ 优先级：   │ │              │ │                │
   │  urgent/   │ │  positive/   │ │  en/es/fr/     │
   │  high/     │ │  neutral/    │ │  de/ja/zh/...  │
   │  normal/   │ │  negative/   │ │                │
   │  low       │ │  angry       │ │                │
   │            │ │              │ │                │
   │ 类别：     │ │  置信度：    │ │                │
   │  billing/  │ │  0.0 - 1.0   │ │                │
   │  technical/│ │              │ │                │
   │  account/  │ │              │ │                │
   │  feature/  │ │              │ │                │
   └──────┬─────┘ └──────┬───────┘ └───────┬────────┘
          │              │                  │
          v              v                  v
   ┌────────────────────────────────────────────────┐
   │          建议回复引擎                           │
   │                                                │
   │  1. 检索类似的已解决工单                       │
   │  2. 匹配知识库文章                             │
   │  3. 通过 LLM 生成草稿回复                     │
   │  4. 客服审核后发送（人在回路中）               │
   └────────────────────────────────────────────────┘
```

### 自动分类

```python
class TicketClassifier:
    """
    使用微调模型按优先级和类别对工单进行分类。
    基于客服分配标签的历史工单数据训练。
    """

    def classify(self, ticket):
        """对工单的优先级和类别进行分类。"""
        text = f"{ticket.subject}\n\n{ticket.description}"

        # 优先级分类
        priority_result = self.priority_model.predict(text)
        # 类别分类
        category_result = self.category_model.predict(text)

        return {
            "ai_priority": priority_result.label,
            "ai_priority_confidence": priority_result.confidence,
            "ai_category": category_result.label,
            "ai_category_confidence": category_result.confidence,
        }

    def auto_apply(self, ticket, classification):
        """
        仅当置信度超过阈值时自动应用分类。
        否则，向客服建议。
        """
        updates = {}

        if classification["ai_priority_confidence"] > 0.85:
            updates["priority"] = classification["ai_priority"]

        if classification["ai_category_confidence"] > 0.80:
            updates["category"] = classification["ai_category"]

        if updates:
            update_ticket(ticket.id, updates)
            log_audit("ai_auto_classified", ticket.id, updates)

        return updates
```

### 使用 LLM 的建议回复

```python
def generate_suggested_response(ticket, comments):
    """
    使用 LLM 为客服生成草稿回复。
    客服必须审核并批准后才能发送。
    """
    # 检索上下文
    similar_tickets = find_similar_resolved_tickets(ticket, limit=3)
    relevant_articles = suggest_articles_for_ticket(ticket)

    # 构建提示词
    prompt = f"""You are a customer support agent for {ticket.org_name}.

Customer Ticket:
Subject: {ticket.subject}
Description: {ticket.description}
Priority: {ticket.priority}
Category: {ticket.category}

Conversation History:
{format_comments(comments)}

Similar Resolved Tickets:
{format_similar_tickets(similar_tickets)}

Relevant Knowledge Base Articles:
{format_articles(relevant_articles)}

Draft a helpful, professional response to the customer.
Be empathetic, concise, and provide actionable next steps.
Do not make up information not found in the knowledge base or ticket history.
"""

    response = llm.generate(
        prompt=prompt,
        max_tokens=500,
        temperature=0.3,  # 低温度以保持一致性
    )

    return {
        "suggested_response": response.text,
        "sources": {
            "similar_tickets": [t.id for t in similar_tickets],
            "articles": [a.id for a in relevant_articles],
        },
        "confidence": response.confidence,
    }
```

### 聊天机器人交接给客服

```python
def chatbot_handoff_decision(conversation):
    """
    决定聊天机器人是否应交接给人工客服。

    交接触发条件：
    1. 客户明确要求与人工对话
    2. 情感转为负面（检测到愤怒/沮丧）
    3. 聊天机器人置信度连续 2+ 轮低于阈值
    4. 对话超过最大轮次仍未解决
    5. 话题在"始终交接"列表中（账单争议、法律问题）
    """
    reasons = []

    # 检查明确请求
    last_message = conversation.messages[-1].text.lower()
    human_keywords = ["speak to a human", "real person", "agent", "representative"]
    if any(kw in last_message for kw in human_keywords):
        reasons.append("customer_requested_human")

    # 检查情感
    sentiment = analyze_sentiment(last_message)
    if sentiment.label in ("angry", "frustrated") and sentiment.confidence > 0.7:
        reasons.append("negative_sentiment")

    # 检查机器人置信度
    low_confidence_turns = sum(
        1 for m in conversation.messages[-3:]
        if m.author_type == "bot" and m.confidence < 0.5
    )
    if low_confidence_turns >= 2:
        reasons.append("low_bot_confidence")

    # 检查轮次数
    if len(conversation.messages) > 10:
        reasons.append("max_turns_exceeded")

    # 检查始终交接话题
    always_handoff = ["billing_dispute", "account_cancellation", "legal"]
    if conversation.detected_topic in always_handoff:
        reasons.append("mandatory_handoff_topic")

    should_handoff = len(reasons) > 0

    if should_handoff:
        ticket = convert_chat_to_ticket(conversation)
        notify_agent_of_handoff(ticket, reasons)

    return {"handoff": should_handoff, "reasons": reasons}
```

---

## 深入探讨：报表与分析

### 核心指标

```
客服绩效仪表板：
+----------------------------------------------------------------------+
|                                                                      |
|  客服: Sarah Chen    |    时间段: 最近 7 天    |    团队: 计费        |
|                                                                      |
|  ┌─────────────────────┐  ┌─────────────────────┐                   |
|  │ 已解决工单          │  │ 首次响应时间        │                   |
|  │       142           │  │     23 min（平均）   │                   |
|  │  ▲ 较上周 +12%      │  │  ▼ 较上周 -15%      │                   |
|  └─────────────────────┘  └─────────────────────┘                   |
|                                                                      |
|  ┌─────────────────────┐  ┌─────────────────────┐                   |
|  │ CSAT 评分           │  │ SLA 合规率          │                   |
|  │     4.6 / 5.0       │  │       97.2%          │                   |
|  │  ████████████████░░  │  │  ████████████████░░  │                   |
|  └─────────────────────┘  └─────────────────────┘                   |
|                                                                      |
|  解决时间分布：                                                      |
|  < 1 hr  ████████████████████  45%                                   |
|  1-4 hr  ████████████         28%                                    |
|  4-8 hr  ██████               15%                                    |
|  8-24 hr ███                   8%                                    |
|  > 24 hr ██                    4%                                    |
|                                                                      |
+----------------------------------------------------------------------+
```

### CSAT 调查系统

```python
def send_csat_survey(ticket):
    """
    在工单解决后发送 CSAT 调查。
    当工单转换到'已解决'状态时触发。
    """
    # 不为内部工单或已合并工单发送
    if ticket.merged_into_id or ticket.channel == "internal":
        return

    # 限流：每个客户每 7 天最多 1 次调查
    recent_survey = find_recent_survey(ticket.requester_id, days=7)
    if recent_survey:
        return

    survey = create_survey({
        "ticket_id": ticket.id,
        "org_id": ticket.org_id,
        "requester_id": ticket.requester_id,
        "assignee_id": ticket.assignee_id,
        "question": "How would you rate the support you received?",
        "scale": "good_bad",  # 简单的好/差或 1-5 分制
        "sent_at": now(),
        "expires_at": now() + timedelta(days=7),
    })

    send_notification(ticket.requester_id, {
        "type": "csat_survey",
        "channel": ticket.channel,
        "survey_id": survey.id,
        "ticket_id": ticket.id,
    })

def record_csat_response(survey_id, rating, comment):
    """记录 CSAT 回复并更新工单和客服指标。"""
    survey = get_survey(survey_id)

    if survey.expires_at < now():
        raise SurveyExpiredError()

    update_survey(survey_id, {
        "rating": rating,
        "comment": comment,
        "responded_at": now(),
    })

    # 更新工单满意度字段
    satisfaction = "good" if rating >= 4 else "bad"
    update_ticket(survey.ticket_id, {"satisfaction": satisfaction})

    # 更新客服滚动 CSAT 评分
    update_agent_csat(survey.assignee_id, rating)

    # 如果是负面评价，触发团队负责人告警
    if rating <= 2:
        alert_team_lead(survey.assignee_id, survey.ticket_id, rating, comment)
```

### 队列健康监控

```
队列健康仪表板：
+----------------------------------------------------------------------+
|                                                                      |
|  队列概览（实时）                                                    |
|                                                                      |
|  +------------------+--------+--------+--------+---------+---------+ |
|  | 队列             | 处理中 | 新建   | 平均   | SLA 风险| 在线    | |
|  |                  | 工单   | (1小时)| 等待   |         | 客服    | |
|  +------------------+--------+--------+--------+---------+---------+ |
|  | 计费             |   45   |   12   | 18 min |    3    |   8/12  | |
|  | 技术             |   89   |   23   | 42 min |   11    |  15/20  | |
|  | 账户访问         |   23   |    8   |  8 min |    0    |   5/6   | |
|  | 企业             |   12   |    2   |  5 min |    0    |   4/4   | |
|  | 通用             |   67   |   18   | 35 min |    7    |  10/15  | |
|  +------------------+--------+--------+--------+---------+---------+ |
|  | 合计             |  236   |   63   | 28 min |   21    |  42/57  | |
|  +------------------+--------+--------+--------+---------+---------+ |
|                                                                      |
|  告警：                                                              |
|  🔴 技术队列：11 个工单存在 SLA 风险（需要增加 5 名客服）           |
|  🟡 通用队列：平均等待时间超过 30 分钟阈值                          |
|  🟢 企业队列：所有 SLA 均在正常范围内                                |
|                                                                      |
+----------------------------------------------------------------------+
```

### 分析查询模式

```sql
-- 按团队的 SLA 合规率（最近 30 天）
SELECT
    t2.name AS team_name,
    COUNT(*) AS total_tickets,
    COUNT(CASE WHEN tk.first_response_at <= tk.first_response_due
               THEN 1 END) AS first_response_met,
    COUNT(CASE WHEN tk.resolved_at <= tk.resolution_due
               THEN 1 END) AS resolution_met,
    ROUND(
        COUNT(CASE WHEN tk.first_response_at <= tk.first_response_due
                   THEN 1 END)::NUMERIC / COUNT(*) * 100, 1
    ) AS first_response_pct,
    ROUND(
        COUNT(CASE WHEN tk.resolved_at <= tk.resolution_due
                   THEN 1 END)::NUMERIC / COUNT(*) * 100, 1
    ) AS resolution_pct
FROM tickets tk
JOIN teams t2 ON t2.id = tk.team_id
WHERE tk.org_id = :org_id
  AND tk.created_at >= NOW() - INTERVAL '30 days'
  AND tk.status IN ('solved', 'closed')
GROUP BY t2.name
ORDER BY first_response_pct ASC;

-- 客服排行榜（已解决工单数、CSAT、响应时间）
SELECT
    a.name AS agent_name,
    COUNT(tk.id) AS tickets_resolved,
    AVG(EXTRACT(EPOCH FROM (tk.first_response_at - tk.created_at)) / 60)
        AS avg_first_response_min,
    AVG(EXTRACT(EPOCH FROM (tk.resolved_at - tk.created_at)) / 60)
        AS avg_resolution_min,
    AVG(s.rating) AS avg_csat,
    COUNT(CASE WHEN tk.first_response_at <= tk.first_response_due
               THEN 1 END)::NUMERIC / NULLIF(COUNT(*), 0) * 100
        AS sla_compliance_pct
FROM agents a
JOIN tickets tk ON tk.assignee_id = a.id
LEFT JOIN surveys s ON s.ticket_id = tk.id AND s.rating IS NOT NULL
WHERE a.org_id = :org_id
  AND tk.resolved_at >= NOW() - INTERVAL '7 days'
GROUP BY a.id, a.name
ORDER BY tickets_resolved DESC;

-- 工单量趋势（按小时，用于容量规划）
SELECT
    DATE_TRUNC('hour', created_at) AS hour,
    COUNT(*) AS ticket_count,
    COUNT(CASE WHEN priority = 'urgent' THEN 1 END) AS urgent_count,
    COUNT(CASE WHEN channel = 'email' THEN 1 END) AS email_count,
    COUNT(CASE WHEN channel = 'chat' THEN 1 END) AS chat_count
FROM tickets
WHERE org_id = :org_id
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE_TRUNC('hour', created_at)
ORDER BY hour;
```

---

## 扩展策略

### 多租户架构

```
租户隔离策略：
+-------------------------------------------------------------------+
|                                                                   |
|  选项 1：共享数据库，共享模式（为规模而选择）                      |
|  ──────────────────────────────────────────                       |
|  所有租户在同一数据库中，每张表都有 org_id 列。                    |
|  在数据库层面强制执行行级安全策略（RLS）。                         |
|                                                                   |
|  优点：运维简单，资源利用高效，迁移容易                            |
|  缺点：嘈杂邻居风险，单数据库故障影响全部                          |
|                                                                   |
|  缓解：对大租户按 org_id 范围分片                                  |
|                                                                   |
|  ┌─────────────────────────────────────────────────────────┐     |
|  │  PostgreSQL 集群（Citus / Vitess 分片）                 │     |
|  │                                                         │     |
|  │  分片 1: org_id 1-10,000       （小租户）               │     |
|  │  分片 2: org_id 10,001-20,000  （小租户）               │     |
|  │  ...                                                     │     |
|  │  分片 N: org_id 99,001-100,000 （小租户）               │     |
|  │                                                         │     |
|  │  专用分片: org_id 500001  （企业租户 A）                 │     |
|  │  专用分片: org_id 500002  （企业租户 B）                 │     |
|  └─────────────────────────────────────────────────────────┘     |
|                                                                   |
|  选项 2：共享数据库，独立模式（中间方案）                          |
|  ──────────────────────────────────────────                       |
|  每个租户获得自己的 schema。隔离性好，运维更复杂。                  |
|                                                                   |
|  选项 3：每租户独立数据库（仅企业级）                              |
|  ──────────────────────────────────────────                       |
|  最大化隔离。用于合规要求高的客户。                                |
+-------------------------------------------------------------------+

选定方案：混合模式
  - 中小租户：共享模式，按 org_id 哈希分片
  - 企业租户：专用分片（同一基础设施，数据隔离）
  - 受监管租户：特定区域的专用数据库
```

### 搜索索引策略

```
Elasticsearch 集群设计：
+-------------------------------------------------------------------+
|                                                                   |
|  索引策略：大租户使用独立索引                                      |
|            小租户使用带路由的共享索引                               |
|                                                                   |
|  小租户（< 100K 工单）：                                          |
|    索引: tickets_shared_shard_01                                  |
|    路由键: org_id（同一组织的所有文档在同一分片上）                |
|    优点：高效查询，管理更简单                                     |
|                                                                   |
|  大租户（> 100K 工单）：                                          |
|    索引: tickets_org_500001                                       |
|    带有自定义分片数的专用索引                                     |
|    优点：独立扩展，无嘈杂邻居问题                                 |
|                                                                   |
|  索引映射：                                                       |
|  {                                                                |
|    "ticket_id":     keyword,                                      |
|    "org_id":        keyword (routing),                            |
|    "subject":       text (analyzed),                              |
|    "description":   text (analyzed),                              |
|    "comments":      nested [{ body: text, author: keyword }],     |
|    "status":        keyword,                                      |
|    "priority":      keyword,                                      |
|    "category":      keyword,                                      |
|    "tags":          keyword[],                                    |
|    "assignee_id":   keyword,                                      |
|    "requester_email": keyword,                                    |
|    "custom_fields": object (dynamic),                             |
|    "created_at":    date,                                         |
|    "updated_at":    date                                          |
|  }                                                                |
|                                                                   |
|  集群: 9 节点（3 主节点，6 数据节点）                             |
|  副本: 每个分片 1 个副本                                          |
|  刷新间隔: 1 秒（近实时）                                         |
|  保留: 热（30 天 SSD）→ 温（1 年 HDD）→ 冷（S3）                |
+-------------------------------------------------------------------+
```

### 实时事件流

```
Kafka Topic 设计：
+-------------------------------------------------------------------+
|                                                                   |
|  Topic: ticket.events                                             |
|    分区: 64（按 org_id 作为键以保证每租户内有序）                  |
|    保留: 7 天                                                     |
|    消费者:                                                        |
|      - search-indexer（Elasticsearch 同步）                       |
|      - sla-monitor（SLA 截止时间检查）                            |
|      - notification-service（邮件、推送、Slack）                  |
|      - analytics-aggregator（实时仪表板）                         |
|      - automation-engine（基于触发器的规则）                      |
|      - ai-enrichment（分类、情感分析）                            |
|      - audit-log-writer（合规日志）                               |
|                                                                   |
|  Topic: agent.events                                              |
|    分区: 16                                                       |
|    事件: status_changed, capacity_updated, logged_in/out          |
|                                                                   |
|  Topic: email.inbound                                             |
|    分区: 32                                                       |
|    事件: 从 SMTP 中继接收的原始邮件                               |
|    消费者: email-processor 服务                                   |
|                                                                   |
|  事件模式（Avro）：                                               |
|  {                                                                |
|    "event_id":    "evt_01HQ...",                                  |
|    "event_type":  "ticket.created",                               |
|    "org_id":      12345,                                          |
|    "entity_id":   "tkt_01HQ...",                                  |
|    "actor":       { "id": 67890, "type": "agent" },              |
|    "payload":     { ... },                                        |
|    "timestamp":   "2026-03-03T14:00:00.000Z",                    |
|    "version":     1                                               |
|  }                                                                |
|                                                                   |
|  消费者组延迟监控:                                                |
|    任何消费者组落后超过 10,000 条消息时告警                        |
|    SLA monitor 消费者：落后超过 100 条消息时告警                   |
+-------------------------------------------------------------------+
```

### 缓存策略

```
缓存层：
+-------------------------------------------------------------------+
|                                                                   |
|  第 1 层：CDN（Cloudflare）                                       |
|    - 知识库文章（公开）                                           |
|    - 静态资源（客户门户）                                         |
|    - TTL: 5 分钟                                                  |
|                                                                   |
|  第 2 层：Redis（应用缓存）                                       |
|    - 客服会话数据: agent:{id} → {status, capacity, teams}         |
|      TTL: 10 分钟，心跳时刷新                                     |
|    - 工单热数据: ticket:{id}:summary → {status, assignee}         |
|      TTL: 1 分钟，更新时失效                                      |
|    - 组织设置: org:{id}:settings → {sla, routing, 等}             |
|      TTL: 5 分钟，配置变更时失效                                   |
|    - SLA 策略缓存: org:{id}:sla_policies → [policies]             |
|      TTL: 5 分钟                                                  |
|    - 轮询计数器: rr:{org}:{team} → integer                        |
|      无 TTL（持久计数器）                                          |
|    - WebSocket 在线状态: viewers:{ticket_id} → sorted set          |
|      TTL: 5 分钟无心跳自动过期成员                                 |
|                                                                   |
|  第 3 层：连接池（PgBouncer）                                     |
|    - 每个分片一个池，每池最大 100 连接                              |
|    - 事务级别池化                                                  |
|                                                                   |
|  缓存失效策略：                                                    |
|    - 关键数据（工单状态、SLA）使用写穿透                           |
|    - 通过 Kafka 消费者进行事件驱动失效                             |
|    - 非关键数据（设置、档案）使用 TTL 过期                         |
+-------------------------------------------------------------------+
```

---

## 部署架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        部署架构                                         │
│                                                                        │
│  区域: 美东                          区域: 欧西                        │
│  ┌────────────────────────────────┐   ┌────────────────────────────┐  │
│  │         Cloudflare CDN         │   │       Cloudflare CDN       │  │
│  └──────────────┬─────────────────┘   └──────────────┬─────────────┘  │
│                 │                                     │                │
│  ┌──────────────v─────────────────┐   ┌──────────────v─────────────┐  │
│  │     ALB（应用负载均衡器）       │   │     ALB（应用负载均衡器）  │  │
│  └──────────────┬─────────────────┘   └──────────────┬─────────────┘  │
│                 │                                     │                │
│  ┌──────────────v─────────────────┐   ┌──────────────v─────────────┐  │
│  │   Kubernetes 集群 (EKS)        │   │   Kubernetes 集群 (EKS)    │  │
│  │                                │   │                            │  │
│  │  ┌───────────────────────────┐ │   │  ┌───────────────────────┐ │  │
│  │  │ API 网关 (Kong)           │ │   │  │ API 网关 (Kong)       │ │  │
│  │  │ - 认证、限流              │ │   │  │ - 认证、限流          │ │  │
│  │  │ - 租户识别                │ │   │  │ - 租户识别            │ │  │
│  │  └───────────┬───────────────┘ │   │  └───────────┬───────────┘ │  │
│  │              │                  │   │              │              │  │
│  │  ┌───────────v───────────────┐ │   │  （与美东相同的                │
│  │  │ 微服务                    │ │   │   服务拓扑）                   │
│  │  │                           │ │   │                            │  │
│  │  │ ticket-service   (6 pods) │ │   └────────────────────────────┘  │
│  │  │ comment-service  (4 pods) │ │                                   │
│  │  │ routing-engine   (3 pods) │ │   共享服务:                       │
│  │  │ sla-monitor      (2 pods) │ │   ┌────────────────────────────┐  │
│  │  │ notification-svc (4 pods) │ │   │  Kafka 集群                │  │
│  │  │ search-indexer   (3 pods) │ │   │  （3 broker，跨区域）      │  │
│  │  │ email-processor  (4 pods) │ │   └────────────────────────────┘  │
│  │  │ ai-service       (3 pods) │ │                                   │
│  │  │ analytics-svc    (2 pods) │ │   ┌────────────────────────────┐  │
│  │  │ automation-engine(2 pods) │ │   │  对象存储 (S3)             │  │
│  │  │ websocket-gw     (4 pods) │ │   │  （附件、导出）            │  │
│  │  └───────────────────────────┘ │   └────────────────────────────┘  │
│  │                                │                                   │
│  │  数据层:                       │                                   │
│  │  ┌───────────────────────────┐ │                                   │
│  │  │ PostgreSQL (Citus)        │ │                                   │
│  │  │ - 1 协调器 + 8 工作节点   │ │                                   │
│  │  │ - 只读副本 (2x)           │ │                                   │
│  │  │                           │ │                                   │
│  │  │ Redis 集群（6 节点）      │ │                                   │
│  │  │ - 缓存 + Pub/Sub + 队列  │ │                                   │
│  │  │                           │ │                                   │
│  │  │ Elasticsearch（9 节点）   │ │                                   │
│  │  │ - 3 主节点 + 6 数据节点   │ │                                   │
│  │  └───────────────────────────┘ │                                   │
│  └────────────────────────────────┘                                   │
│                                                                        │
│  监控:                                                                 │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Datadog（指标 + 链路追踪）| PagerDuty（告警）| Sentry（错误）   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 权衡取舍

### 推送 vs. 拉取客服队列

| 维度 | 推送（自动分配） | 拉取（客服从队列中选取） |
|------|-----------------|--------------------------|
| 客服自主性 | 低 - 系统决定 | 高 - 客服选择 |
| 公平性 | 保证均匀分配 | 部分客服挑选简单工单 |
| 响应时间 | 更快（立即分配） | 更慢（取决于客服主动性） |
| 客服满意度 | 较低（被"投喂"的感觉） | 较高（控制感） |
| SLA 合规 | 更好（系统为 SLA 优化） | 风险更高（困难工单被忽略） |

**决定：混合模式 -- 紧急/高优先级工单自动分配；让客服从队列中拉取普通/低优先级工单**

### 关系型数据库 vs. NoSQL 用于工单

| 维度 | PostgreSQL（选定） | MongoDB / DynamoDB |
|------|--------------------|--------------------|
| 模式灵活性 | 中等（JSONB 用于自定义字段） | 高（无模式） |
| 复杂查询 | 优秀（SQL 连接、聚合） | 有限（反规范化读取） |
| 事务 | 完整 ACID | 有限 / 最终一致性 |
| 多租户分区 | 行级安全 + 分片 | 按集合分租户或分区键 |
| 报表 | 原生 SQL 分析 | 需要 ETL 到分析数据库 |
| 运维成熟度 | 非常高 | 高 |

**决定：PostgreSQL 配合 JSONB 用于自定义字段 -- 对于多租户工单系统来说，在结构化和灵活性之间取得最佳平衡**

### 同步 vs. 异步处理

| 维度 | 同步 | 异步（事件驱动） |
|------|------|------------------|
| 延迟 | 简单操作更低 | 更高（队列处理） |
| 可靠性 | 耦合的故障模式 | 解耦，弹性更强 |
| 吞吐量 | 受最慢步骤限制 | 每个服务独立扩展 |
| 一致性 | 强一致性 | 最终一致性 |
| 复杂度 | 简单 | 更高（事件排序、幂等性） |

**决定：工单 CRUD 使用同步（用户期望即时反馈）；SLA 监控、搜索索引、通知、AI 增强使用异步**

---

## 常见面试追问

**问：如何处理一个发送比平均多 100 倍工单的嘈杂租户？**

在 API 网关层实施每租户限流。每个租户有基于层级的限流（免费：100 工单/小时，专业版：10,000/小时，企业版：自定义）。超出限流后，在 Kafka 消费者中使用公平调度：按 org_id 分区并应用加权公平排队，这样一个租户的突发流量不会饿死其他租户。对于真正极端的情况，大租户获得专用分片和专用消费者组实例。实时监控每租户的 QPS 并对异常告警。

**问：如何从单体架构迁移到这种微服务架构？**

绞杀者模式（Strangler Fig Pattern）。从单体处理所有事务开始。一次提取一个服务，从耦合度最低的开始（例如通知服务，然后搜索索引器）。使用事件总线（Kafka）作为集成层。新旧路径并行运行，使用影子模式（新服务处理事件但结果被丢弃，与单体输出对比）。一次切换一个服务。工单服务（核心 CRUD）最后迁移，因为所有东西都依赖它。

**问：如何确保 SLA 违规检测的精确一次处理？**

使用幂等事件处理。每次 SLA 检查产生一条具有复合键的升级记录：(ticket_id, threshold_level, sla_type)。在创建违规记录之前，检查该键是否已存在（INSERT ... ON CONFLICT DO NOTHING）。SLA 监控器使用至少一次交付从 Kafka 处理事件，但数据库层的去重确保每次违规只记录一次。消费者偏移量仅在成功处理后才提交。

**问：如何处理数据驻留要求（GDPR、数据主权）？**

部署区域集群（美国、欧盟、亚太）。每个组织在注册时根据其位置或明确选择被分配到一个主区域。所有工单数据保留在该区域的数据库和搜索集群中。Kafka topic 按区域隔离（PII 不跨区域复制）。全局服务（认证、计费）仅存储非 PII 元数据。对于需要特定国家级驻留的客户，在所需国家提供专用数据库实例。将数据导出（GDPR 第 20 条）和删除权（第 17 条）实现为自动化工作流，在所有存储中清除数据：PostgreSQL、Elasticsearch、Redis、S3 附件和 Kafka 墓碑记录。

**问：SLA 监控服务宕机时会发生什么？**

SLA 监控器是无状态的，从数据库拉取工作，因此可以简单重启。但在宕机期间，SLA 违规可能不会被立即检测到。缓解措施：(1) 至少运行 2 个副本，通过领导者选举执行轮询循环；(2) SLA 检查时间戳被持久化，因此重启时服务通过扫描从上次检查时间到现在之间所有有 SLA 截止时间的工单来追赶；(3) SLA 截止时间存储在工单本身上（first_response_due、resolution_due），因此一个简单查询就能找到所有当前已违规的工单。最大检测延迟等于轮询间隔（30 秒）加上重启时间。

**问：如何实现工单合并功能？**

工单合并是一个软操作。当工单 B 合并到工单 A 时：(1) 将 B 的所有评论复制到 A（保留时间戳和作者信息）；(2) 设置 B.merged_into_id = A.id；(3) 将 B.status 设为 'closed'，并添加系统评论说明合并；(4) 将 B 的所有关注者移动到 A；(5) 更新客户的工单引用；(6) 将未来发送到 B 线程的邮件重定向到 A。原始工单 B 为审计目的保留但在默认视图中隐藏。这被包装在数据库事务中以确保原子性。发出 ticket.merged 事件以便搜索索引和分析相应更新。

**问：如何处理故障期间的工单量激增（例如服务宕机，10,000 个客户报告问题）？**

多种策略：(1) 重复检测：使用 NLP 相似度对关于同一问题的工单进行分组，并将它们关联到单个"事件"工单；(2) 自动回复：当声明事件时，自动向匹配事件模式的新工单回复状态更新和知识库文章；(3) 主动沟通：触发状态页面更新和向受影响客户的群发邮件，减少入站量；(4) 批量解决：当事件解决时，批量更新所有关联工单的解决方案并关闭它们。路由引擎临时暂停事件相关工单的正常分配，将其路由到专用的事件队列。

**问：如何构建一个为 50,000+ 并发客服显示队列指标的实时仪表板？**

仪表板不直接查询数据库。替代方案：(1) Kafka Streams 或 Flink 作业持续将工单事件聚合到物化视图（每队列工单数、平均等待时间、SLA 风险计数）；(2) 这些聚合作为预计算计数器每秒更新存储在 Redis 中；(3) 仪表板 WebSocket 服务订阅这些聚合更新的 Redis Pub/Sub；(4) 每个客服的浏览器维护一个 WebSocket 连接，仅接收他们关心的队列（服务端过滤）；(5) 客户端将更新应用到本地状态来渲染仪表板，无需完整重新获取。此设计在每连接大约每秒 1 次更新的频率下处理 50,000 个并发连接。

---

## 总结

### 关键架构决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 主数据库 | PostgreSQL（Citus 分片） | ACID 事务、复杂查询、JSONB 用于自定义字段、成熟的生态系统 |
| 多租户 | 共享模式 + org_id + RLS | 运维简单；企业租户使用专用分片 |
| 事件流 | Apache Kafka | 解耦服务、支持异步处理、可靠的事件溯源 |
| 搜索 | Elasticsearch | 全文搜索、分面过滤、近实时索引 |
| 缓存 | Redis 集群 | 会话数据、WebSocket 的 pub/sub、轮询计数器、热工单缓存 |
| 实时 | 通过 Redis Pub/Sub 的 WebSocket | 客服协作、实时工单更新、在线状态检测 |
| SLA 监控 | 基于轮询 + 追赶机制 | 简单、可靠、亚分钟级检测；无复杂计时器调度 |
| AI 集成 | 通过 Kafka 的异步流水线 | 非阻塞增强；回复采用人在回路模式 |
| 邮件处理 | 基于 Webhook（SendGrid/SES） | 无需管理 SMTP 服务器；可靠交付 + 重试 |
| 附件存储 | S3（对象存储） | 成本效益高、持久、CDN 友好 |
| 部署 | 多区域 Kubernetes | 区域数据驻留、灾难恢复、低延迟 |
| 路由 | 基于规则 + 基于技能的混合模式 | 灵活满足多样化组织需求；高级租户可使用 AI 辅助 |

### 关键权衡总结

```
+------------------------------------------------------------------+
| 权衡取舍光谱                                                      |
+------------------------------------------------------------------+
|                                                                  |
| 一致性 ◄──────────────────────────────────► 可用性               |
|     ■■■■■■■■■■░░░░░                                             |
|     工单写入使用强一致性；                                        |
|     搜索/分析使用最终一致性                                       |
|                                                                  |
| 简单性 ◄───────────────────────────────────► 灵活性              |
|          ■■■■■■■■■■■■■░░░                                       |
|     微服务增加复杂度但支持                                        |
|     独立扩展和部署                                                |
|                                                                  |
| 延迟 ◄─────────────────────────────────────► 吞吐量              |
|       ■■■■■■■■■■░░░░░                                           |
|     面向用户的 CRUD 使用同步；                                    |
|     后台处理使用异步                                              |
|                                                                  |
| 隔离性 ◄────────────────────────────────────► 效率               |
|          ■■■■■■■■■■■░░░░                                        |
|     共享基础设施降低成本；                                        |
|     企业租户使用专用资源                                          |
|                                                                  |
+------------------------------------------------------------------+
```
