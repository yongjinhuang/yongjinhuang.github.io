# 设计订阅与计费系统（Stripe Billing / Chargebee / Recurly）

订阅与计费系统管理周期性收入的完整生命周期：套餐创建、订阅管理、用量计量、账单生成、支付收取、失败支付的 dunning 处理以及收入确认。它必须保证财务准确性、PCI 合规性，并优雅地处理复杂的计费场景，如 proration、周期内变更套餐以及混合定价模型。

---

## 目录

1. [需求澄清](#1-需求澄清)
2. [API 设计](#2-api-设计)
3. [数据模型](#3-数据模型)
4. [高层架构](#4-高层架构)
5. [深入探讨：订阅生命周期](#5-深入探讨订阅生命周期)
6. [深入探讨：计费模型](#6-深入探讨计费模型)
7. [深入探讨：Proration](#7-深入探讨proration)
8. [深入探讨：账单生成](#8-深入探讨账单生成)
9. [深入探讨：支付处理](#9-深入探讨支付处理)
10. [深入探讨：Dunning 与重试](#10-深入探讨dunning-与重试)
11. [深入探讨：基于用量的计费](#11-深入探讨基于用量的计费)
12. [深入探讨：收入确认](#12-深入探讨收入确认)
13. [扩展策略](#13-扩展策略)
14. [部署架构](#14-部署架构)
15. [常见面试追问](#15-常见面试追问)
16. [总结](#16-总结)

---

## 1. 需求澄清

### 功能性需求

| # | 需求 | 描述 |
|---|------|------|
| 1 | 套餐管理 | 创建、更新、归档定价套餐，支持多种计费周期（月付、季付、年付）和多种货币 |
| 2 | 订阅生命周期 | 创建、升级、降级、暂停、恢复、取消订阅，支持可配置的试用期 |
| 3 | 基于用量的计费 | 实时摄取使用事件，按计量维度聚合，并根据消耗量计费 |
| 4 | 账单生成 | 在计费周期边界自动生成账单，包含行项目、税费、折扣和抵扣 |
| 5 | 支付处理 | 通过支付网关集成对客户支付方式（银行卡、ACH、电子钱包）进行收费，支持 idempotent 重试 |
| 6 | Proration | 计算周期内套餐变更（升级、降级、数量变更）的按比例收费和抵扣 |
| 7 | Dunning 与重试 | 自动重试失败支付，支持可配置的调度计划、宽限期和升级策略（邮件、降级、取消） |
| 8 | 优惠券与折扣 | 在订阅、账单或行项目级别应用百分比或固定金额折扣，支持兑换限制 |
| 9 | Webhook 与事件 | 向商户端点发送生命周期事件（subscription.created、invoice.paid、payment.failed），保证可靠投递 |
| 10 | 多币种 | 以多种货币为套餐定价，在开具账单时进行货币转换，以商户的结算货币进行支付 |
| 11 | 税费计算 | 集成税务引擎（Avalara、TaxJar）对每个行项目进行基于司法管辖区的税费计算 |
| 12 | 客户自助门户 | 自助服务界面，供客户管理订阅、查看账单、更新支付方式 |

### 非功能性需求

| # | 需求 | 目标 |
|---|------|------|
| 1 | 账单准确性 | 100% — 对计费错误零容忍 |
| 2 | 支付 idempotency | 精确一次收费；在任何故障模式下不重复扣款 |
| 3 | 可用性 | 支付处理路径 99.99%（每年停机 < 52 分钟） |
| 4 | PCI DSS 合规 | Level 1；卡号数据永远不在我们的系统中存储或传输（通过网关 tokenization） |
| 5 | 可审计性 | 对订阅、账单和支付的每次状态变更保留不可变的审计日志 |
| 6 | 一致性 | 计费变更操作强一致性；分析查询可接受最终一致性 |
| 7 | Webhook 投递 | 至少一次投递并带重试；p99 投递延迟 < 30 秒 |
| 8 | 使用事件摄取 | 峰值 100K 事件/秒时确认延迟 < 500ms |
| 9 | 账单生成延迟 | 一个计费周期的所有账单在 1 小时窗口内生成完毕 |
| 10 | 数据保留 | 财务记录保留 7 年（SOX、税务合规） |

### 容量估算

```
租户（商户）：              10,000 活跃商户
订阅总量：                 50,000,000（5000万，所有商户合计）
活跃订阅：                 30,000,000（3000万 — 60% 活跃）
月度计费周期：              25,000,000（大部分为月付）
年度计费周期：               5,000,000

每月生成账单：              25,000,000（2500万）
每日账单（均匀分布）：        ~833,000
每小时账单（计费窗口）：      25M / 1 小时 = ~6,944/秒 峰值（批量计费运行）

每月支付次数：              25,000,000
每月支付重试：               5,000,000（~20% 首次尝试失败）
每月总支付尝试：            30,000,000

使用事件：
  平均：     50,000 事件/秒
  峰值：    100,000 事件/秒（计费周期末尾的数据冲刷）
  每日：     50K * 86,400 = ~43亿 事件/天
  事件大小：  ~200 字节

存储：
  订阅记录：                ~1 KB    -> 50M * 1 KB = 50 GB
  账单记录 + 行项目：        ~5 KB    -> 25M/月 * 5 KB = 125 GB/月
  支付记录：                ~1 KB    -> 30M/月 * 1 KB = 30 GB/月
  使用事件：                ~200 B   -> 43亿/天 * 200 B = 860 GB/天
  使用聚合：                ~100 B   -> 50M 订阅 * 100 B = 5 GB/天
  审计日志：                ~500 B   -> ~2亿 条目/月 * 500 B = 100 GB/月

  年度存储（不含使用事件）：
    (125 + 30 + 100) GB/月 * 12 = ~3 TB/年
  使用事件（原始数据，90天热存储）：
    860 GB/天 * 90 = ~77 TB 热存储
  使用事件（冷存储，7年）：
    860 GB/天 * 365 * 7 = ~2.2 PB（5:1 压缩后约 400 TB）

网络：
  使用事件摄取：100K/秒 * 200 B = 20 MB/秒 入站
  支付网关调用：平均 ~12 TPS，峰值 ~350 TPS（批量计费）
```

---

## 2. API 设计

### 套餐 API

```
POST   /v1/plans                                创建新的定价套餐
GET    /v1/plans                                列出所有套餐（支持过滤）
GET    /v1/plans/{planId}                       获取套餐详情
PATCH  /v1/plans/{planId}                       更新套餐元数据（不影响活跃订阅的定价）
POST   /v1/plans/{planId}/archive               归档套餐（不再接受新订阅）
```

**POST /v1/plans 请求：**
```json
{
  "name": "Pro Monthly",
  "code": "pro_monthly",
  "description": "Professional plan billed monthly",
  "currency": "USD",
  "billingInterval": "month",
  "billingIntervalCount": 1,
  "trialPeriodDays": 14,
  "prices": [
    {
      "type": "flat",
      "amount": 4900,
      "currency": "USD"
    },
    {
      "type": "per_seat",
      "amount": 1200,
      "currency": "USD",
      "unitLabel": "user"
    },
    {
      "type": "metered",
      "meterId": "api_calls",
      "tiers": [
        { "upTo": 10000, "unitAmount": 0 },
        { "upTo": 100000, "unitAmount": 5 },
        { "upTo": null, "unitAmount": 3 }
      ],
      "tierMode": "graduated"
    }
  ],
  "metadata": {
    "features": ["advanced_analytics", "priority_support"]
  }
}
```

**POST /v1/plans 响应（201 Created）：**
```json
{
  "planId": "plan_a1b2c3d4",
  "name": "Pro Monthly",
  "code": "pro_monthly",
  "status": "active",
  "currency": "USD",
  "billingInterval": "month",
  "billingIntervalCount": 1,
  "trialPeriodDays": 14,
  "prices": [ "..." ],
  "createdAt": "2024-06-01T00:00:00Z",
  "updatedAt": "2024-06-01T00:00:00Z"
}
```

### 订阅 API

```
POST   /v1/subscriptions                        创建新订阅
GET    /v1/subscriptions/{subId}                获取订阅详情
PATCH  /v1/subscriptions/{subId}                更新订阅（变更套餐、数量）
POST   /v1/subscriptions/{subId}/cancel         取消订阅
POST   /v1/subscriptions/{subId}/pause          暂停订阅
POST   /v1/subscriptions/{subId}/resume         恢复已暂停的订阅
GET    /v1/subscriptions?customerId={id}&status= 列出客户订阅
```

**POST /v1/subscriptions 请求：**
```json
{
  "idempotencyKey": "idem_sub_550e8400",
  "customerId": "cus_x9y8z7",
  "planId": "plan_a1b2c3d4",
  "quantity": 5,
  "paymentMethodId": "pm_card_visa_4242",
  "trialEnd": "2024-06-15T00:00:00Z",
  "couponCode": "LAUNCH20",
  "metadata": {
    "referralSource": "partner_abc"
  }
}
```

**POST /v1/subscriptions 响应（201 Created）：**
```json
{
  "subscriptionId": "sub_7a8b9c0d",
  "customerId": "cus_x9y8z7",
  "planId": "plan_a1b2c3d4",
  "status": "trialing",
  "quantity": 5,
  "currentPeriodStart": "2024-06-01T00:00:00Z",
  "currentPeriodEnd": "2024-06-15T00:00:00Z",
  "trialStart": "2024-06-01T00:00:00Z",
  "trialEnd": "2024-06-15T00:00:00Z",
  "cancelAtPeriodEnd": false,
  "coupon": {
    "code": "LAUNCH20",
    "percentOff": 20,
    "duration": "repeating",
    "durationMonths": 3
  },
  "createdAt": "2024-06-01T00:00:00Z"
}
```

**PATCH /v1/subscriptions/{subId} 请求（周期内升级）：**
```json
{
  "idempotencyKey": "idem_upgrade_abc123",
  "planId": "plan_enterprise_monthly",
  "quantity": 10,
  "prorationBehavior": "create_prorations",
  "billingCycleAnchor": "unchanged"
}
```

### 账单 API

```
GET    /v1/invoices                              列出账单（支持过滤）
GET    /v1/invoices/{invoiceId}                  获取账单详情
POST   /v1/invoices/{invoiceId}/pay              尝试支付未付账单
POST   /v1/invoices/{invoiceId}/void             作废未支付账单
POST   /v1/invoices/{invoiceId}/finalize         确认草稿账单
GET    /v1/invoices/{invoiceId}/pdf              下载账单 PDF
GET    /v1/invoices/upcoming?subscriptionId={id} 预览即将生成的账单
```

**GET /v1/invoices/{invoiceId} 响应：**
```json
{
  "invoiceId": "inv_e5f6g7h8",
  "customerId": "cus_x9y8z7",
  "subscriptionId": "sub_7a8b9c0d",
  "status": "paid",
  "currency": "USD",
  "periodStart": "2024-07-01T00:00:00Z",
  "periodEnd": "2024-08-01T00:00:00Z",
  "lineItems": [
    {
      "description": "Pro Monthly (5 seats)",
      "type": "subscription",
      "quantity": 5,
      "unitAmount": 1200,
      "amount": 6000,
      "periodStart": "2024-07-01T00:00:00Z",
      "periodEnd": "2024-08-01T00:00:00Z"
    },
    {
      "description": "Platform fee (flat)",
      "type": "subscription",
      "quantity": 1,
      "unitAmount": 4900,
      "amount": 4900
    },
    {
      "description": "API calls: 75,000 (10K free + 65K @ $0.05)",
      "type": "metered",
      "quantity": 65000,
      "unitAmount": 5,
      "amount": 3250
    },
    {
      "description": "Coupon LAUNCH20 (-20%)",
      "type": "discount",
      "amount": -2830
    }
  ],
  "subtotal": 14150,
  "discount": -2830,
  "preTaxTotal": 11320,
  "tax": 1019,
  "taxRate": "9.0%",
  "total": 12339,
  "amountPaid": 12339,
  "amountDue": 0,
  "paidAt": "2024-07-01T00:05:23Z",
  "paymentId": "pay_m1n2o3p4",
  "createdAt": "2024-07-01T00:00:01Z"
}
```

### 使用事件 API

```
POST   /v1/usage_events                         上报单条使用事件
POST   /v1/usage_events/batch                   批量上报使用事件
GET    /v1/usage_events/summary?subscriptionId={id}&meterId={id}&periodStart=&periodEnd=
                                                 获取某时段的聚合用量
```

**POST /v1/usage_events/batch 请求：**
```json
{
  "events": [
    {
      "idempotencyKey": "evt_2024070112000001",
      "subscriptionId": "sub_7a8b9c0d",
      "meterId": "api_calls",
      "quantity": 150,
      "timestamp": "2024-07-01T12:00:00Z",
      "properties": {
        "endpoint": "/v1/search",
        "statusCode": 200
      }
    },
    {
      "idempotencyKey": "evt_2024070112000002",
      "subscriptionId": "sub_7a8b9c0d",
      "meterId": "api_calls",
      "quantity": 75,
      "timestamp": "2024-07-01T12:01:00Z",
      "properties": {
        "endpoint": "/v1/embed",
        "statusCode": 200
      }
    }
  ]
}
```

**POST /v1/usage_events/batch 响应（202 Accepted）：**
```json
{
  "accepted": 2,
  "rejected": 0,
  "errors": []
}
```

### Webhook API

```
POST   /v1/webhook_endpoints                    注册 webhook 端点
GET    /v1/webhook_endpoints                    列出 webhook 端点
DELETE /v1/webhook_endpoints/{endpointId}       删除 webhook 端点
GET    /v1/events                               列出事件（轮询回退方案）
GET    /v1/events/{eventId}                     获取事件详情
```

---

## 3. 数据模型

### 套餐表

```sql
CREATE TABLE plans (
    plan_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,                -- 拥有此套餐的商户
    name                VARCHAR(255) NOT NULL,
    code                VARCHAR(100) NOT NULL,
    description         TEXT,
    status              VARCHAR(20) NOT NULL DEFAULT 'active',
                        -- 'active', 'archived', 'draft'
    currency            CHAR(3) NOT NULL,             -- ISO 4217
    billing_interval    VARCHAR(20) NOT NULL,         -- 'day','week','month','year'
    billing_interval_count SMALLINT NOT NULL DEFAULT 1,
    trial_period_days   SMALLINT NOT NULL DEFAULT 0,
    metadata            JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_plan_code_tenant UNIQUE (tenant_id, code),
    CONSTRAINT valid_interval CHECK (
        billing_interval IN ('day', 'week', 'month', 'year')
    ),
    CONSTRAINT valid_status CHECK (
        status IN ('active', 'archived', 'draft')
    )
);

CREATE INDEX idx_plans_tenant ON plans(tenant_id, status);
```

### 套餐价格表

```sql
CREATE TABLE plan_prices (
    price_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id             UUID NOT NULL REFERENCES plans(plan_id),
    price_type          VARCHAR(20) NOT NULL,
                        -- 'flat', 'per_seat', 'metered', 'tiered_flat'
    amount              BIGINT,                       -- 最小货币单位（分）
    currency            CHAR(3) NOT NULL,
    meter_id            VARCHAR(100),                 -- 用于计量价格
    tier_mode           VARCHAR(20),                  -- 'graduated', 'volume'
    unit_label          VARCHAR(50),                  -- 'user', 'API call', 'GB'
    transform_quantity  JSONB,                        -- { "divide_by": 1000, "round": "up" }
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_price_type CHECK (
        price_type IN ('flat', 'per_seat', 'metered', 'tiered_flat')
    )
);

CREATE INDEX idx_plan_prices_plan ON plan_prices(plan_id);
```

### 价格层级表

```sql
CREATE TABLE price_tiers (
    tier_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    price_id            UUID NOT NULL REFERENCES plan_prices(price_id),
    up_to               BIGINT,                       -- NULL 表示无上限
    unit_amount          BIGINT NOT NULL,              -- 每单位价格（分）
    flat_amount         BIGINT NOT NULL DEFAULT 0,    -- 该层级的固定费用
    sort_order          SMALLINT NOT NULL,

    CONSTRAINT valid_unit_amount CHECK (unit_amount >= 0)
);

CREATE INDEX idx_price_tiers_price ON price_tiers(price_id, sort_order);
```

### 订阅表

```sql
CREATE TABLE subscriptions (
    subscription_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL,
    customer_id             UUID NOT NULL,
    plan_id                 UUID NOT NULL REFERENCES plans(plan_id),
    status                  VARCHAR(20) NOT NULL DEFAULT 'trialing',
                            -- 'trialing','active','past_due','paused',
                            -- 'canceled','expired','incomplete'
    quantity                INTEGER NOT NULL DEFAULT 1,
    payment_method_id       VARCHAR(255),             -- tokenized 引用
    current_period_start    TIMESTAMPTZ NOT NULL,
    current_period_end      TIMESTAMPTZ NOT NULL,
    trial_start             TIMESTAMPTZ,
    trial_end               TIMESTAMPTZ,
    canceled_at             TIMESTAMPTZ,
    cancel_at_period_end    BOOLEAN NOT NULL DEFAULT FALSE,
    pause_start             TIMESTAMPTZ,
    pause_resume_at         TIMESTAMPTZ,
    billing_cycle_anchor    TIMESTAMPTZ NOT NULL,     -- 月内账单锚定日
    coupon_id               UUID,
    idempotency_key         VARCHAR(255) UNIQUE,
    metadata                JSONB,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version                 BIGINT NOT NULL DEFAULT 0,  -- 乐观锁

    CONSTRAINT valid_status CHECK (
        status IN ('trialing','active','past_due','paused',
                   'canceled','expired','incomplete')
    ),
    CONSTRAINT valid_quantity CHECK (quantity > 0)
);

CREATE INDEX idx_subs_tenant_customer ON subscriptions(tenant_id, customer_id);
CREATE INDEX idx_subs_status ON subscriptions(status);
CREATE INDEX idx_subs_period_end ON subscriptions(current_period_end)
    WHERE status IN ('trialing', 'active', 'past_due');
CREATE INDEX idx_subs_idempotency ON subscriptions(idempotency_key);
```

### 账单表

```sql
CREATE TABLE invoices (
    invoice_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL,
    customer_id             UUID NOT NULL,
    subscription_id         UUID REFERENCES subscriptions(subscription_id),
    invoice_number          VARCHAR(50) NOT NULL,     -- 人类可读的顺序编号
    status                  VARCHAR(20) NOT NULL DEFAULT 'draft',
                            -- 'draft','open','paid','void','uncollectible'
    currency                CHAR(3) NOT NULL,
    period_start            TIMESTAMPTZ,
    period_end              TIMESTAMPTZ,
    subtotal                BIGINT NOT NULL DEFAULT 0,
    discount_total          BIGINT NOT NULL DEFAULT 0,
    tax_total               BIGINT NOT NULL DEFAULT 0,
    total                   BIGINT NOT NULL DEFAULT 0,
    amount_paid             BIGINT NOT NULL DEFAULT 0,
    amount_due              BIGINT NOT NULL DEFAULT 0,
    credit_applied          BIGINT NOT NULL DEFAULT 0,
    due_date                TIMESTAMPTZ NOT NULL,
    paid_at                 TIMESTAMPTZ,
    voided_at               TIMESTAMPTZ,
    finalized_at            TIMESTAMPTZ,
    idempotency_key         VARCHAR(255) UNIQUE,
    metadata                JSONB,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_invoice_status CHECK (
        status IN ('draft','open','paid','void','uncollectible')
    ),
    CONSTRAINT amount_consistency CHECK (
        total = subtotal + discount_total + tax_total
        AND amount_due = total - amount_paid - credit_applied
    )
);

CREATE INDEX idx_invoices_tenant_customer ON invoices(tenant_id, customer_id);
CREATE INDEX idx_invoices_subscription ON invoices(subscription_id);
CREATE INDEX idx_invoices_status ON invoices(status) WHERE status IN ('open', 'draft');
CREATE INDEX idx_invoices_due_date ON invoices(due_date) WHERE status = 'open';
```

### 账单行项目表

```sql
CREATE TABLE invoice_line_items (
    line_item_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id              UUID NOT NULL REFERENCES invoices(invoice_id),
    subscription_id         UUID REFERENCES subscriptions(subscription_id),
    description             TEXT NOT NULL,
    type                    VARCHAR(30) NOT NULL,
                            -- 'subscription','metered','proration','discount',
                            -- 'tax','one_time','credit'
    quantity                BIGINT NOT NULL DEFAULT 1,
    unit_amount             BIGINT NOT NULL DEFAULT 0,  -- 分
    amount                  BIGINT NOT NULL,            -- quantity * unit_amount（或覆盖值）
    currency                CHAR(3) NOT NULL,
    period_start            TIMESTAMPTZ,
    period_end              TIMESTAMPTZ,
    meter_id                VARCHAR(100),               -- 用于计量行项目
    proration_details       JSONB,                      -- 用于 proration 行项目
    metadata                JSONB,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_line_type CHECK (
        type IN ('subscription','metered','proration','discount',
                 'tax','one_time','credit')
    )
);

CREATE INDEX idx_line_items_invoice ON invoice_line_items(invoice_id);
```

### 支付表

```sql
CREATE TABLE payments (
    payment_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL,
    customer_id             UUID NOT NULL,
    invoice_id              UUID REFERENCES invoices(invoice_id),
    status                  VARCHAR(20) NOT NULL DEFAULT 'pending',
                            -- 'pending','processing','succeeded','failed','refunded'
    amount                  BIGINT NOT NULL,
    currency                CHAR(3) NOT NULL,
    payment_method_type     VARCHAR(30),              -- 'card','ach','wallet'
    payment_method_id       VARCHAR(255),             -- tokenized
    gateway_payment_id      VARCHAR(255),             -- 外部网关引用
    gateway_response        JSONB,                    -- 原始网关响应
    failure_code            VARCHAR(50),
    failure_message         TEXT,
    refunded_amount         BIGINT NOT NULL DEFAULT 0,
    attempt_number          SMALLINT NOT NULL DEFAULT 1,
    idempotency_key         VARCHAR(255) NOT NULL UNIQUE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_payment_status CHECK (
        status IN ('pending','processing','succeeded','failed','refunded')
    ),
    CONSTRAINT valid_amount CHECK (amount > 0)
);

CREATE INDEX idx_payments_invoice ON payments(invoice_id);
CREATE INDEX idx_payments_tenant_customer ON payments(tenant_id, customer_id);
CREATE INDEX idx_payments_gateway ON payments(gateway_payment_id);
CREATE INDEX idx_payments_idempotency ON payments(idempotency_key);
```

### 使用事件表

```sql
CREATE TABLE usage_events (
    event_id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL,
    subscription_id         UUID NOT NULL,
    meter_id                VARCHAR(100) NOT NULL,
    quantity                BIGINT NOT NULL,
    timestamp               TIMESTAMPTZ NOT NULL,
    idempotency_key         VARCHAR(255) NOT NULL,
    properties              JSONB,
    ingested_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_usage_event_idempotency UNIQUE (tenant_id, idempotency_key),
    CONSTRAINT valid_quantity CHECK (quantity > 0)
) PARTITION BY RANGE (timestamp);

-- 按月分区，便于高效查询和归档
CREATE TABLE usage_events_2024_07 PARTITION OF usage_events
    FOR VALUES FROM ('2024-07-01') TO ('2024-08-01');
CREATE TABLE usage_events_2024_08 PARTITION OF usage_events
    FOR VALUES FROM ('2024-08-01') TO ('2024-09-01');

CREATE INDEX idx_usage_sub_meter_time ON usage_events(subscription_id, meter_id, timestamp);
```

### 使用聚合表

```sql
CREATE TABLE usage_aggregates (
    aggregate_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL,
    subscription_id         UUID NOT NULL,
    meter_id                VARCHAR(100) NOT NULL,
    period_start            TIMESTAMPTZ NOT NULL,
    period_end              TIMESTAMPTZ NOT NULL,
    total_quantity          BIGINT NOT NULL DEFAULT 0,
    last_event_at           TIMESTAMPTZ,
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_usage_agg UNIQUE (subscription_id, meter_id, period_start)
);

CREATE INDEX idx_usage_agg_lookup ON usage_aggregates(subscription_id, meter_id, period_start);
```

### 订阅事件（审计日志）表

```sql
CREATE TABLE subscription_events (
    event_id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL,
    subscription_id         UUID NOT NULL,
    event_type              VARCHAR(50) NOT NULL,
                            -- 'subscription.created','subscription.activated',
                            -- 'subscription.upgraded','subscription.canceled',
                            -- 'invoice.created','invoice.paid','payment.failed'
    previous_state          JSONB,
    new_state               JSONB,
    actor                   VARCHAR(100),             -- 'system','api','customer_portal'
    metadata                JSONB,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 不可变：不允许 UPDATE 或 DELETE（通过数据库触发器强制执行）
CREATE INDEX idx_sub_events_sub ON subscription_events(subscription_id, created_at DESC);
CREATE INDEX idx_sub_events_type ON subscription_events(event_type, created_at DESC);
```

### 实体关系概览

```
plans  1---*  plan_prices  1---*  price_tiers
  |
  | 1
  |
  * many
subscriptions  1---*  invoices  1---*  invoice_line_items
  |                      |
  |                      | 1
  |                      |
  |                      * many
  |                   payments
  |
  * many
usage_events
  |
  * aggregated into
usage_aggregates

subscriptions  1---*  subscription_events (audit log)
```

---

## 4. 高层架构

```
                           ┌─────────────────────────────┐
                           │      Load Balancer / CDN     │
                           └──────────────┬──────────────┘
                                          │
                           ┌──────────────▼──────────────┐
                           │        API Gateway           │
                           │  (Auth, Rate Limit, Routing) │
                           └──┬───┬───┬───┬───┬───┬──────┘
                              │   │   │   │   │   │
          ┌───────────────────┘   │   │   │   │   └───────────────────┐
          │                       │   │   │   │                       │
          ▼                       ▼   │   ▼   │                       ▼
  ┌───────────────┐   ┌──────────────┐│ ┌─────────────┐   ┌──────────────────┐
  │  Plan Service │   │ Subscription ││ │   Invoice    │   │  Webhook Service │
  │               │   │   Service    ││ │  Generator   │   │                  │
  │ CRUD plans,   │   │              ││ │              │   │ Deliver events   │
  │ prices, tiers │   │ Lifecycle    ││ │ Line items,  │   │ to merchant      │
  │               │   │ management   ││ │ tax, discount│   │ endpoints        │
  └───────┬───────┘   └──────┬───────┘│ └──────┬──────┘   └────────┬─────────┘
          │                  │        │        │                    │
          │                  │        │        │                    │
          │           ┌──────▼────┐   │  ┌─────▼──────┐            │
          │           │  Billing  │   │  │  Payment   │            │
          │           │  Engine   │◄──┘  │  Gateway   │            │
          │           │           │      │  Adapter   │            │
          │           │ Proration,│      │            │            │
          │           │ metering  │      │ Stripe,    │            │
          │           │ calc      │      │ Adyen,     │            │
          │           └─────┬─────┘      │ Braintree  │            │
          │                 │            └─────┬──────┘            │
          │           ┌─────▼─────┐            │                   │
          │           │  Dunning  │            │                   │
          │           │  Engine   │◄───────────┘                   │
          │           │           │  (payment failed callback)     │
          │           │ Retry     │                                │
          │           │ schedule, │                                │
          │           │ grace     │                                │
          │           │ periods   │                                │
          │           └───────────┘                                │
          │                                                        │
          │    ┌────────────────┐                                   │
          │    │ Usage Metering │                                   │
          │    │    Service     │                                   │
          │    │                │                                   │
          │    │ Ingest events, │                                   │
          │    │ aggregate,     │                                   │
          │    │ deduplicate    │                                   │
          │    └───────┬────────┘                                   │
          │            │                                            │
    ┌─────▼────────────▼────────────────────────────────────────────▼──┐
    │                        Message Bus (Kafka)                       │
    │                                                                  │
    │  Topics: subscription.events, invoice.events, payment.events,    │
    │          usage.events, webhook.delivery, dunning.schedule         │
    └──────────────────────────┬───────────────────────────────────────┘
                               │
    ┌──────────────────────────▼───────────────────────────────────────┐
    │                         Data Layer                                │
    │                                                                  │
    │  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌────────────────┐  │
    │  │PostgreSQL │  │   Redis   │  │ ClickHouse│  │  Object Store │  │
    │  │(Primary)  │  │  (Cache,  │  │ (Usage    │  │  (S3: Invoice │  │
    │  │           │  │  Locks,   │  │  Events,  │  │   PDFs, Cold  │  │
    │  │ Plans,    │  │  Idempot- │  │  Aggre-   │  │   Archive)    │  │
    │  │ Subs,     │  │  ency)    │  │  gates)   │  │               │  │
    │  │ Invoices, │  │           │  │           │  │               │  │
    │  │ Payments  │  │           │  │           │  │               │  │
    │  └──────────┘  └───────────┘  └──────────┘  └────────────────┘  │
    └─────────────────────────────────────────────────────────────────┘
```

### 组件职责

| 组件 | 职责 |
|------|------|
| API Gateway | 认证、限流、请求路由、TLS 终结 |
| Plan Service | 定价套餐、价格和层级的 CRUD；套餐版本控制 |
| Subscription Service | 生命周期管理：创建、升级、降级、暂停、取消 |
| Billing Engine | Proration 计算、计量用量定价、折扣应用 |
| Invoice Generator | 根据订阅状态、用量聚合和抵扣组装账单 |
| Payment Gateway Adapter | 外部支付网关的抽象层；tokenization、收费、退款 |
| Dunning Engine | 编排失败支付的重试调度和升级策略 |
| Usage Metering Service | 摄取使用事件，去重，按计费周期聚合 |
| Webhook Service | 向商户端点可靠投递事件，支持重试和签名 |
| Kafka | 解耦服务；提供至少一次投递保证 |
| PostgreSQL | 所有事务数据的真实来源 |
| Redis | 缓存、分布式锁、idempotency key 存储、限流 |
| ClickHouse | 列式存储，用于高吞吐量使用事件和分析查询 |
| S3 | 账单 PDF、已归档使用事件和审计日志的冷存储 |

---

## 5. 深入探讨：订阅生命周期

### 状态机

```
                         create (with trial)
                    ┌──────────────────────────┐
                    │                          ▼
                    │                    ┌───────────┐
                    │                    │  TRIALING  │
                    │                    └─────┬─────┘
                    │                          │
                    │              trial ends   │   trial ends
                    │            + payment OK   │   + payment fails
                    │                 │         │        │
          create    │                 ▼         │        ▼
        (no trial)  │           ┌──────────┐   │  ┌────────────┐
           ─────────┘           │  ACTIVE   │   │  │ INCOMPLETE │
                                └────┬─────┘   │  └──────┬─────┘
                                     │         │         │
                       ┌─────────────┤         │   payment succeeds
                       │             │         │         │
             payment   │   cancel    │         │         ▼
              fails    │  (immediate)│         │    ┌──────────┐
                       │             │         └───►│  ACTIVE   │
                       ▼             │              └──────────┘
                 ┌──────────┐        │
                 │ PAST_DUE │        │         pause
                 └────┬─────┘        │     ┌──────────┐
                      │              │     │  PAUSED   │◄──── pause from ACTIVE
           payment    │              │     └─────┬────┘
           succeeds   │              │           │
              │       │              │     resume │
              ▼       │              │           ▼
         ┌──────────┐ │              │     ┌──────────┐
         │  ACTIVE   │ │              │     │  ACTIVE   │
         └──────────┘ │              │     └──────────┘
                      │              │
           grace      │              │
           period     │              │
           expires    │              │
              │       │              │
              ▼       ▼              ▼
         ┌──────────────────────────────┐
         │          CANCELED            │
         └──────────────┬───────────────┘
                        │
                        │  period end reached
                        ▼
                  ┌───────────┐
                  │  EXPIRED   │
                  └───────────┘
```

### 状态转换规则

| 从 | 到 | 触发条件 | 操作 |
|----|----|----------|------|
| （无） | trialing | 创建订阅时包含试用期 | 设置 trial_start、trial_end；不收费 |
| （无） | active | 创建订阅时无试用期 | 立即收费；生成首张账单 |
| （无） | incomplete | 首次支付失败 | 标记为 incomplete；开始 dunning |
| trialing | active | 试用结束 + 支付成功 | 生成账单；向客户收费 |
| trialing | incomplete | 试用结束 + 支付失败 | 账单保持 open 状态；开始 dunning |
| trialing | canceled | 客户在试用期内取消 | 不收费；立即取消 |
| active | past_due | 续费支付失败 | 账单保持 open 状态；开始 dunning |
| active | paused | 客户请求暂停 | 停止计费；可选设置恢复日期 |
| active | canceled | 客户取消（立即生效） | 生成包含 proration 抵扣的最终账单 |
| active | canceled | 客户取消（周期结束时生效） | 设置 cancel_at_period_end；在 period_end 前保持活跃 |
| past_due | active | 重试支付成功 | 账单标记为已支付；订阅恢复 |
| past_due | canceled | 宽限期到期或达到最大重试次数 | 标记为已取消；发送 webhook |
| paused | active | 客户恢复或自动恢复日期到达 | 从恢复日期重新开始计费 |
| canceled | expired | 当前周期结束 | 终态；无需进一步操作 |
| incomplete | active | 在窗口期内支付成功 | 账单已支付；订阅激活 |
| incomplete | expired | 支付窗口过期（48小时） | 终态 |

### 生命周期处理（伪代码）

```python
def process_subscription_lifecycle(subscription_id: str):
    sub = db.subscriptions.get(subscription_id)
    now = datetime.utcnow()

    if sub.status == "trialing" and now >= sub.trial_end:
        invoice = invoice_generator.create_invoice(sub)
        payment_result = payment_service.charge(invoice)

        if payment_result.success:
            return transition(sub, "active",
                current_period_start=sub.trial_end,
                current_period_end=calculate_next_period(sub))
        else:
            return transition(sub, "incomplete",
                failure_reason=payment_result.error)

    if sub.status == "active" and now >= sub.current_period_end:
        invoice = invoice_generator.create_renewal_invoice(sub)
        payment_result = payment_service.charge(invoice)

        if payment_result.success:
            return transition(sub, "active",
                current_period_start=sub.current_period_end,
                current_period_end=calculate_next_period(sub))
        else:
            return transition(sub, "past_due")

    if sub.status == "active" and sub.cancel_at_period_end and now >= sub.current_period_end:
        return transition(sub, "canceled",
            canceled_at=now)

    if sub.status == "past_due":
        dunning_engine.evaluate(sub)

    if sub.status == "canceled" and now >= sub.current_period_end:
        return transition(sub, "expired")


def transition(sub, new_status, **kwargs):
    previous_state = snapshot(sub)
    updated_sub = {**sub, "status": new_status, **kwargs,
                   "updated_at": datetime.utcnow(),
                   "version": sub.version + 1}

    rows_affected = db.subscriptions.update(
        subscription_id=sub.subscription_id,
        version=sub.version,  # optimistic lock
        new_values=updated_sub
    )
    if rows_affected == 0:
        raise ConcurrentModificationError("Retry required")

    db.subscription_events.insert(
        subscription_id=sub.subscription_id,
        event_type=f"subscription.{new_status}",
        previous_state=previous_state,
        new_state=snapshot(updated_sub)
    )

    kafka.publish("subscription.events", {
        "type": f"subscription.{new_status}",
        "subscription": updated_sub
    })

    return updated_sub
```

---

## 6. 深入探讨：计费模型

### 模型概览

| 模型 | 描述 | 示例 | 计算方式 |
|------|------|------|----------|
| 固定费率 | 每个计费周期固定价格 | $49/月 | `total = flat_price` |
| 按席位 | 按单位（用户、许可证）计价 | $12/用户/月 | `total = price_per_seat * quantity` |
| 基于用量 | 按实际使用量付费 | $0.05/API 调用 | `total = sum(tier_price * units_in_tier)` |
| 阶梯式（累进） | 不同层级不同价格，费用累加 | 前 10K 免费，后 90K 按 $0.05 | `total = sum(units_in_tier * tier_rate)` |
| 阶梯式（总量） | 根据总量所在层级确定单一价格 | 0-10K：$0.10，10K-100K：$0.07 | `total = total_units * tier_rate` |
| 混合 | 固定费 + 按席位 + 计量的组合 | $49 基础费 + $12/用户 + 计量 API | `total = flat + seats + metered` |

### 累进阶梯定价计算

```
套餐：API 调用定价
  层级 1：0 - 10,000         @ $0.00/调用（免费层级）
  层级 2：10,001 - 100,000   @ $0.05/调用
  层级 3：100,001+           @ $0.03/调用

客户本月使用量：150,000 次 API 调用

计算方式（累进 — 每个层级独立计费）：
  层级 1：min(150000, 10000) = 10,000 次 * $0.00 = $0.00
  层级 2：min(150000 - 10000, 90000) = 90,000 次 * $0.05 = $4,500.00
  层级 3：150000 - 100000 = 50,000 次 * $0.03 = $1,500.00

  总计 = $0.00 + $4,500.00 + $1,500.00 = $6,000.00
```

### 总量阶梯定价计算

```
套餐：API 调用定价（总量模式）
  层级 1：0 - 10,000         @ $0.10/调用
  层级 2：10,001 - 100,000   @ $0.07/调用
  层级 3：100,001+           @ $0.04/调用

客户本月使用量：150,000 次 API 调用

计算方式（总量 — 根据总量确定单一费率）：
  总单位数：150,000 落在层级 3
  总计 = 150,000 * $0.04 = $6,000.00
```

### 混合定价计算

```
套餐：企业版
  组成部分 1（固定费）：      $499/月 基础费
  组成部分 2（按席位）：      $29/用户/月
  组成部分 3（计量）：        API 调用（上述累进阶梯）

客户：25 个用户，150,000 次 API 调用

  固定费：                 $499.00
  按席位：25 * $29 =        $725.00
  计量（累进）：           $6,000.00
  ─────────────────────────────
  小计：                  $7,224.00
  优惠券（八折）：        -$1,444.80
  ─────────────────────────────
  税前：                  $5,779.20
  税费（9%）：              $520.13
  ─────────────────────────────
  总计：                  $6,299.33
```

### 定价引擎（伪代码）

```python
def calculate_price(plan_prices: list, usage: dict, quantity: int) -> int:
    """Returns total amount in cents."""
    total_cents = 0

    for price in plan_prices:
        if price.price_type == "flat":
            total_cents += price.amount

        elif price.price_type == "per_seat":
            total_cents += price.amount * quantity

        elif price.price_type == "metered":
            meter_usage = usage.get(price.meter_id, 0)
            if price.transform_quantity:
                meter_usage = apply_transform(meter_usage, price.transform_quantity)
            total_cents += calculate_tiered_price(
                meter_usage, price.tiers, price.tier_mode
            )

    return total_cents


def calculate_tiered_price(units: int, tiers: list, mode: str) -> int:
    """Calculate tiered pricing based on mode."""
    if mode == "graduated":
        return calculate_graduated(units, tiers)
    elif mode == "volume":
        return calculate_volume(units, tiers)
    raise ValueError(f"Unknown tier mode: {mode}")


def calculate_graduated(units: int, tiers: list) -> int:
    total = 0
    remaining = units
    previous_upper = 0

    for tier in sorted(tiers, key=lambda t: t.sort_order):
        tier_upper = tier.up_to if tier.up_to else float('inf')
        tier_size = tier_upper - previous_upper
        units_in_tier = min(remaining, tier_size)

        total += units_in_tier * tier.unit_amount + tier.flat_amount
        remaining -= units_in_tier
        previous_upper = tier_upper

        if remaining <= 0:
            break

    return total


def calculate_volume(units: int, tiers: list) -> int:
    applicable_tier = None
    previous_upper = 0

    for tier in sorted(tiers, key=lambda t: t.sort_order):
        tier_upper = tier.up_to if tier.up_to else float('inf')
        if units <= tier_upper:
            applicable_tier = tier
            break
        previous_upper = tier_upper

    return units * applicable_tier.unit_amount + applicable_tier.flat_amount
```

---

## 7. 深入探讨：Proration

### 何时触发 Proration

当订阅在周期内发生变更时会触发 proration：

1. **升级**：客户切换到更贵的套餐
2. **降级**：客户切换到更便宜的套餐
3. **数量变更**：增加或减少席位
4. **周期内取消**：未使用时间的抵扣

### Proration 公式

```
周期内剩余天数：
  days_remaining = (current_period_end - change_date) / total_period_days

旧套餐未使用部分的抵扣：
  credit = old_plan_price * (days_remaining / total_period_days)

新套餐剩余天数的收费：
  charge = new_plan_price * (days_remaining / total_period_days)

净 proration：
  proration_amount = charge - credit
  （正数 = 客户需补缴，负数 = 客户获得抵扣）
```

### Proration 示例：周期内升级

```
场景：
  旧套餐：Basic（$49/月）
  新套餐：Pro（$99/月）
  计费周期：7月1日 - 7月31日（31天）
  变更日期：7月16日

计算：
  旧套餐已使用天数：  15天（7月1日-15日）
  剩余天数：          16天（7月16日-31日）
  周期总天数：        31天

  Basic 未使用部分的抵扣：
    $49.00 * (16 / 31) = $25.29 抵扣

  Pro 剩余时间的收费：
    $99.00 * (16 / 31) = $51.10 收费

  净 proration：
    $51.10 - $25.29 = $25.81 立即欠款

账单行项目：
  1. "Basic 未使用时间（7月16日-31日）"         -$25.29
  2. "Pro 剩余时间（7月16日-31日）"              +$51.10
  ─────────────────────────────────────────────
  净收费：                                       $25.81

下次完整账单（8月1日）：
  "Pro Monthly"                                  $99.00
```

### Proration 示例：增加席位

```
场景：
  套餐：Pro，$12/席位/月
  当前席位：10
  新席位：15（增加5个）
  计费周期：7月1日 - 7月31日（31天）
  变更日期：7月21日

计算：
  剩余天数：10天（7月21日-31日）
  新增席位：5

  5个新席位的按比例收费：
    $12.00 * 5 席位 * (10 / 31) = $19.35

账单行项目：
  1. "Pro 新增 5 个席位（7月21日-31日）"          +$19.35

下次完整账单（8月1日）：
  "Pro Monthly（15 席位 @ $12）"                 $180.00
```

### Proration 行为

| 行为 | 描述 | ��用场景 |
|------|------|----------|
| `create_prorations` | 在下一张账单上生成 proration 行项目 | 默认值；最常用 |
| `always_invoice` | 立即生成并收取 proration 账单 | 用于重大升级 |
| `none` | 不做 proration；新价格从下个周期开始 | 更简单；仅用于降级 |

### Proration 计算（伪代码）

```python
def calculate_proration(
    old_plan_price: int,
    new_plan_price: int,
    old_quantity: int,
    new_quantity: int,
    period_start: datetime,
    period_end: datetime,
    change_date: datetime
) -> list:
    total_seconds = (period_end - period_start).total_seconds()
    remaining_seconds = (period_end - change_date).total_seconds()
    proration_ratio = remaining_seconds / total_seconds

    line_items = []

    # Credit for unused time on old plan
    old_total = old_plan_price * old_quantity
    credit_amount = round(old_total * proration_ratio)
    if credit_amount > 0:
        line_items.append({
            "description": f"Unused time on old plan ({change_date.date()} - {period_end.date()})",
            "type": "proration",
            "amount": -credit_amount,
            "proration_details": {
                "plan_price": old_plan_price,
                "quantity": old_quantity,
                "ratio": proration_ratio,
                "direction": "credit"
            }
        })

    # Charge for remaining time on new plan
    new_total = new_plan_price * new_quantity
    charge_amount = round(new_total * proration_ratio)
    if charge_amount > 0:
        line_items.append({
            "description": f"Remaining time on new plan ({change_date.date()} - {period_end.date()})",
            "type": "proration",
            "amount": charge_amount,
            "proration_details": {
                "plan_price": new_plan_price,
                "quantity": new_quantity,
                "ratio": proration_ratio,
                "direction": "charge"
            }
        })

    return line_items
```

---

## 8. 深入探讨：账单生成

### 账单生成流水线

```
 ┌──────────────────────────────────────────────────────────────────┐
 │                     Invoice Generation Pipeline                  │
 └──────────────────────────────────────────────────────────────────┘

  Step 1            Step 2           Step 3           Step 4
 ┌──────────┐    ┌────────────┐   ┌────────────┐   ┌────────────┐
 │ Identify  │───►│ Calculate  │──►│ Apply      │──►│ Calculate  │
 │ billable  │    │ line items │   │ discounts  │   │ tax        │
 │ subs      │    │            │   │ & credits  │   │            │
 └──────────┘    └────────────┘   └────────────┘   └─────┬──────┘
                                                         │
  Step 8            Step 7           Step 6           Step 5
 ┌──────────┐    ┌────────────┐   ┌────────────┐   ┌────────────┐
 │ Emit     │◄───│ Attempt    │◄──│ Finalize   │◄──│ Generate   │
 │ webhook  │    │ payment    │   │ invoice    │   │ PDF        │
 │ event    │    │            │   │            │   │            │
 └──────────┘    └────────────┘   └────────────┘   └────────────┘
```

### 账单逐步生成过程

```python
def generate_invoice(subscription_id: str) -> Invoice:
    sub = db.subscriptions.get(subscription_id)
    plan = db.plans.get(sub.plan_id)
    prices = db.plan_prices.list(plan_id=plan.plan_id)

    # 步骤 1：创建草稿账单
    invoice = db.invoices.create(
        tenant_id=sub.tenant_id,
        customer_id=sub.customer_id,
        subscription_id=sub.subscription_id,
        invoice_number=generate_invoice_number(sub.tenant_id),
        status="draft",
        currency=plan.currency,
        period_start=sub.current_period_start,
        period_end=sub.current_period_end,
        due_date=sub.current_period_end
    )

    line_items = []

    # 步骤 2：计算行项目
    for price in prices:
        if price.price_type == "flat":
            line_items.append(create_line_item(
                invoice_id=invoice.invoice_id,
                description=f"{plan.name} — base fee",
                type="subscription",
                quantity=1,
                unit_amount=price.amount,
                amount=price.amount
            ))

        elif price.price_type == "per_seat":
            amount = price.amount * sub.quantity
            line_items.append(create_line_item(
                invoice_id=invoice.invoice_id,
                description=f"{plan.name} ({sub.quantity} {price.unit_label}s @ ${price.amount / 100:.2f})",
                type="subscription",
                quantity=sub.quantity,
                unit_amount=price.amount,
                amount=amount
            ))

        elif price.price_type == "metered":
            usage_agg = db.usage_aggregates.get(
                subscription_id=sub.subscription_id,
                meter_id=price.meter_id,
                period_start=sub.current_period_start
            )
            metered_amount = calculate_tiered_price(
                usage_agg.total_quantity,
                db.price_tiers.list(price_id=price.price_id),
                price.tier_mode
            )
            line_items.append(create_line_item(
                invoice_id=invoice.invoice_id,
                description=f"{price.unit_label}: {usage_agg.total_quantity:,} units",
                type="metered",
                quantity=usage_agg.total_quantity,
                unit_amount=0,  # varies by tier
                amount=metered_amount,
                meter_id=price.meter_id
            ))

    # 添加待处理的 proration 行项目
    pending_prorations = db.pending_prorations.list(
        subscription_id=sub.subscription_id, applied=False
    )
    for proration in pending_prorations:
        line_items.append(create_line_item(
            invoice_id=invoice.invoice_id,
            description=proration.description,
            type="proration",
            amount=proration.amount,
            proration_details=proration.details
        ))
        db.pending_prorations.mark_applied(proration.id)

    # 步骤 3：应用折扣
    subtotal = sum(li.amount for li in line_items)
    discount_amount = 0

    if sub.coupon_id:
        coupon = db.coupons.get(sub.coupon_id)
        if coupon.is_valid():
            if coupon.type == "percent_off":
                discount_amount = -round(subtotal * coupon.percent_off / 100)
            elif coupon.type == "amount_off":
                discount_amount = -min(coupon.amount_off, subtotal)

            line_items.append(create_line_item(
                invoice_id=invoice.invoice_id,
                description=f"Coupon {coupon.code} ({coupon.display()})",
                type="discount",
                amount=discount_amount
            ))

    # 应用客户信用余额
    customer_credit = db.customer_credits.get_balance(sub.customer_id, plan.currency)
    credit_to_apply = 0
    pre_credit_total = subtotal + discount_amount
    if customer_credit > 0 and pre_credit_total > 0:
        credit_to_apply = min(customer_credit, pre_credit_total)
        db.customer_credits.deduct(sub.customer_id, plan.currency, credit_to_apply)
        line_items.append(create_line_item(
            invoice_id=invoice.invoice_id,
            description="Credit balance applied",
            type="credit",
            amount=-credit_to_apply
        ))

    # 步骤 4：计算税费
    taxable_amount = subtotal + discount_amount
    tax_result = tax_engine.calculate(
        customer_id=sub.customer_id,
        amount=taxable_amount,
        currency=plan.currency
    )
    if tax_result.tax_amount > 0:
        line_items.append(create_line_item(
            invoice_id=invoice.invoice_id,
            description=f"Tax ({tax_result.rate}%)",
            type="tax",
            amount=tax_result.tax_amount
        ))

    # 步骤 5：确认账单
    total = subtotal + discount_amount + tax_result.tax_amount
    amount_due = total - credit_to_apply

    db.invoices.update(invoice.invoice_id,
        subtotal=subtotal,
        discount_total=discount_amount,
        tax_total=tax_result.tax_amount,
        total=total,
        credit_applied=credit_to_apply,
        amount_paid=0,
        amount_due=max(0, amount_due),
        status="open",
        finalized_at=datetime.utcnow()
    )

    # 步骤 6：异步生成 PDF
    kafka.publish("invoice.pdf_generation", {
        "invoice_id": invoice.invoice_id
    })

    return invoice
```

### 批量账单生成（定时任务）

```python
def billing_cycle_job():
    """
    每小时运行一次。查找 current_period_end 在下一小时窗口内的订阅
    并生成账单。
    """
    now = datetime.utcnow()
    window_end = now + timedelta(hours=1)

    subscriptions = db.subscriptions.find(
        status__in=["active", "trialing"],
        current_period_end__gte=now,
        current_period_end__lt=window_end
    )

    # 按租户分区以便并行处理
    by_tenant = group_by(subscriptions, key=lambda s: s.tenant_id)

    for tenant_id, tenant_subs in by_tenant.items():
        for sub in tenant_subs:
            kafka.publish("billing.generate_invoice", {
                "subscription_id": sub.subscription_id,
                "idempotency_key": f"inv_{sub.subscription_id}_{sub.current_period_end.isoformat()}"
            })
```

---

## 9. 深入探讨：支付处理

### 支付流程

```
Invoice finalized
       │
       ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Check         │     │ Create       │     │ Call Payment  │
│ idempotency  │────►│ payment      │────►│ Gateway      │
│ key          │     │ record       │     │ (Stripe,     │
└──────────────┘     │ (status:     │     │  Adyen)      │
  (duplicate?        │  pending)    │     └──────┬───────┘
   return cached     └──────────────┘            │
   result)                                       │
                              ┌───────────────────┤
                              │                   │
                         Success              Failure
                              │                   │
                              ▼                   ▼
                    ┌──────────────┐     ┌──────────────┐
                    │ Mark payment │     │ Mark payment │
                    │ succeeded    │     │ failed       │
                    │              │     │              │
                    │ Mark invoice │     │ Enqueue      │
                    │ paid         │     │ dunning      │
                    │              │     │ retry        │
                    │ Advance sub  │     │              │
                    │ period       │     │ Mark sub     │
                    └──────┬───────┘     │ past_due     │
                           │             └──────┬───────┘
                           │                    │
                           ▼                    ▼
                    ┌──────────────┐     ┌──────────────┐
                    │ Emit webhook │     │ Emit webhook │
                    │ invoice.paid │     │ payment      │
                    │              │     │ .failed      │
                    └──────────────┘     └──────────────┘
```

### Idempotent 支付处理

```python
def process_payment(invoice_id: str, idempotency_key: str) -> Payment:
    # 检查 idempotency — 防止重复扣款
    existing = redis.get(f"idem:pay:{idempotency_key}")
    if existing:
        return db.payments.get(existing)

    # 也检查数据库（Redis 可能已驱逐）
    existing_db = db.payments.find_by_idempotency_key(idempotency_key)
    if existing_db:
        redis.setex(f"idem:pay:{idempotency_key}", 86400, existing_db.payment_id)
        return existing_db

    invoice = db.invoices.get(invoice_id)
    if invoice.status != "open":
        raise InvalidStateError(f"Invoice {invoice_id} is {invoice.status}, expected open")

    sub = db.subscriptions.get(invoice.subscription_id)
    payment_method = resolve_payment_method(sub)

    # 在调用网关之前创建支付记录
    payment = db.payments.create(
        tenant_id=invoice.tenant_id,
        customer_id=invoice.customer_id,
        invoice_id=invoice.invoice_id,
        status="processing",
        amount=invoice.amount_due,
        currency=invoice.currency,
        payment_method_type=payment_method.type,
        payment_method_id=payment_method.id,
        idempotency_key=idempotency_key
    )

    # 立即存储 idempotency 映射
    redis.setex(f"idem:pay:{idempotency_key}", 86400, payment.payment_id)

    try:
        # 调用外部支付网关，使用网关级别的 idempotency
        gateway_result = payment_gateway.charge(
            amount=invoice.amount_due,
            currency=invoice.currency,
            payment_method_token=payment_method.token,
            idempotency_key=f"gw_{idempotency_key}",
            metadata={
                "invoice_id": str(invoice.invoice_id),
                "tenant_id": str(invoice.tenant_id)
            }
        )

        if gateway_result.status == "succeeded":
            db.payments.update(payment.payment_id,
                status="succeeded",
                gateway_payment_id=gateway_result.id,
                gateway_response=gateway_result.raw
            )
            db.invoices.update(invoice.invoice_id,
                status="paid",
                amount_paid=invoice.amount_due,
                amount_due=0,
                paid_at=datetime.utcnow()
            )

            kafka.publish("payment.events", {
                "type": "payment.succeeded",
                "payment_id": payment.payment_id,
                "invoice_id": invoice.invoice_id
            })

            return db.payments.get(payment.payment_id)

        else:
            db.payments.update(payment.payment_id,
                status="failed",
                gateway_payment_id=gateway_result.id,
                failure_code=gateway_result.decline_code,
                failure_message=gateway_result.message,
                gateway_response=gateway_result.raw
            )

            kafka.publish("payment.events", {
                "type": "payment.failed",
                "payment_id": payment.payment_id,
                "invoice_id": invoice.invoice_id,
                "failure_code": gateway_result.decline_code
            })

            return db.payments.get(payment.payment_id)

    except GatewayTimeoutError:
        # 状态未知 — 查询网关进行对账
        kafka.publish("payment.reconciliation", {
            "payment_id": payment.payment_id,
            "gateway_idempotency_key": f"gw_{idempotency_key}"
        })
        return db.payments.get(payment.payment_id)
```

### PCI 合规架构

```
Customer Browser                Our System              Payment Gateway
      │                             │                        │
      │  Card number: 4242...       │                        │
      │─────────────────────────────┼───────────────────────►│
      │  (Direct to gateway via     │                        │
      │   client-side SDK /         │                        │
      │   Stripe.js / iframe)       │                        │
      │                             │                        │
      │◄──── Token: tok_abc123 ─────┼────────────────────────│
      │                             │                        │
      │  Send token to our API      │                        │
      │────────────────────────────►│                        │
      │                             │                        │
      │                             │  Charge with token     │
      │                             │───────────────────────���│
      │                             │                        │
      │                             │◄── Charge result ──────│
      │                             │                        │

核心原则：原始卡号永远不经过我们的服务器。
  - 通过网关的 JavaScript SDK 在客户端进行 tokenization
  - 我们的系统只处理 token（tok_xxx、pm_xxx）
  - 将 PCI 范围从 SAQ-D 降低到 SAQ-A
  - 支付方式 token 作为不透明字符串存储
```

---

## 10. 深入探讨：Dunning 与重试

### Dunning 概述

Dunning 是恢复失败支付的过程。一个设计良好的 dunning 系统可以减少非自愿流失（因支付失败而非主动意愿离开的客户）。

### 重试调度

```
支付失败时间线：
─────────────────────────────────────────────────────────────►
Day 0      Day 1     Day 3      Day 5      Day 7     Day 14
  │          │         │          │          │          │
  ▼          ▼         ▼          ▼          ▼          ▼
Fail     Retry 1   Retry 2    Retry 3    Retry 4   Final
         +Email    +Email     +In-app    +Email     Retry
         notice    warning    banner     urgent     +Cancel
                                                    warning

  ├──────── Grace Period (14 days) ────────────────────┤
                                                        │
                                                        ▼
                                                   Cancel sub
                                                   (involuntary
                                                    churn)
```

### 智能重试策略

```python
RETRY_SCHEDULE = [
    {"delay_hours": 24,  "attempt": 1},
    {"delay_hours": 72,  "attempt": 2},
    {"delay_hours": 120, "attempt": 3},
    {"delay_hours": 168, "attempt": 4},
    {"delay_hours": 336, "attempt": 5},  # day 14
]

# 智能重试时间：在支付更可能成功的时间段重试
OPTIMAL_RETRY_HOURS = [10, 14, 17]  # 当地时间上午10点、下午2点、下午5点

DECLINE_CODE_STRATEGY = {
    # 硬拒绝 — 不重试
    "stolen_card":         {"retry": False, "action": "cancel_immediately"},
    "fraudulent":          {"retry": False, "action": "cancel_immediately"},
    "card_not_supported":  {"retry": False, "action": "request_new_method"},

    # 软拒绝 — 退避重试
    "insufficient_funds":  {"retry": True,  "action": "retry_with_backoff"},
    "processing_error":    {"retry": True,  "action": "retry_soon"},
    "expired_card":        {"retry": False, "action": "request_new_method"},
    "generic_decline":     {"retry": True,  "action": "retry_with_backoff"},

    # 发卡行临时故障
    "issuer_not_available":{"retry": True,  "action": "retry_soon"},
    "try_again_later":     {"retry": True,  "action": "retry_soon"},
}


def evaluate_dunning(subscription_id: str):
    sub = db.subscriptions.get(subscription_id)
    invoice = db.invoices.find_open(subscription_id=sub.subscription_id)
    if not invoice:
        return

    last_payment = db.payments.find_latest(invoice_id=invoice.invoice_id)
    decline_strategy = DECLINE_CODE_STRATEGY.get(
        last_payment.failure_code, {"retry": True, "action": "retry_with_backoff"}
    )

    if not decline_strategy["retry"]:
        handle_hard_decline(sub, invoice, decline_strategy["action"])
        return

    attempt_count = db.payments.count(invoice_id=invoice.invoice_id)
    if attempt_count >= len(RETRY_SCHEDULE):
        # 已达最大重试次数
        cancel_subscription(sub, reason="max_dunning_retries_exhausted")
        mark_invoice_uncollectible(invoice)
        return

    # 检查宽限期
    first_failure = db.payments.find_first_failure(invoice_id=invoice.invoice_id)
    grace_period_end = first_failure.created_at + timedelta(days=14)
    if datetime.utcnow() > grace_period_end:
        cancel_subscription(sub, reason="grace_period_expired")
        mark_invoice_uncollectible(invoice)
        return

    # 调度下次重试
    schedule = RETRY_SCHEDULE[attempt_count]
    next_retry_at = last_payment.created_at + timedelta(hours=schedule["delay_hours"])

    # 根据客户时区调整到最优重试时间
    customer_tz = get_customer_timezone(sub.customer_id)
    next_retry_at = adjust_to_optimal_hour(next_retry_at, customer_tz)

    kafka.publish("dunning.schedule", {
        "subscription_id": sub.subscription_id,
        "invoice_id": invoice.invoice_id,
        "attempt_number": attempt_count + 1,
        "retry_at": next_retry_at.isoformat(),
        "idempotency_key": f"retry_{invoice.invoice_id}_{attempt_count + 1}"
    })

    # 发送相应的通知
    send_dunning_notification(sub, invoice, attempt_count)


def send_dunning_notification(sub, invoice, attempt_count):
    notifications = {
        0: {"channel": "email", "template": "payment_failed_notice"},
        1: {"channel": "email", "template": "payment_retry_warning"},
        2: {"channel": "email+in_app", "template": "update_payment_method"},
        3: {"channel": "email", "template": "urgent_payment_required"},
        4: {"channel": "email", "template": "final_cancellation_warning"},
    }
    config = notifications.get(attempt_count, notifications[4])
    notification_service.send(
        customer_id=sub.customer_id,
        channel=config["channel"],
        template=config["template"],
        data={
            "invoice_amount": invoice.amount_due,
            "update_payment_url": generate_payment_update_url(sub),
            "grace_period_end": calculate_grace_end(invoice)
        }
    )
```

### Dunning 指标

| 指标 | 目标 | 描述 |
|------|------|------|
| 恢复率 | > 70% | 最初失败的支付最终成功恢复的百分比 |
| 平均恢复时间 | < 5 天 | 从首次失败到支付成功的平均天数 |
| 非自愿流失率 | < 2% | 每月因支付失败而流失的活跃订阅百分比 |
| 智能重试成功率 | > 40% | 智能定时重试成功的百分比 |

---

## 11. 深入探讨：基于用量的计费

### 事件摄取架构

```
                          ┌─────────────────────┐
   Client SDKs ──────────►│   Ingestion API      │
   (HTTP POST)            │   (Stateless)        │
                          │                      │
                          │  - Validate schema   │
                          │  - Check idempotency │
                          │  - Return 202        │
                          └──────────┬───────────┘
                                     │
                              ┌──────▼──────┐
                              │    Kafka     │
                              │ usage.events │
                              │ (partitioned │
                              │  by sub_id)  │
                              └──────┬───────┘
                                     │
                    ┌────────────────┤────────────────┐
                    │                │                 │
           ┌────────▼───────┐ ┌─────▼──────┐  ┌──────▼──────┐
           │ Deduplication  │ │ Aggregation │  │  Cold Store  │
           │ Worker         │ │ Worker      │  │  Writer      │
           │                │ │             │  │              │
           │ Bloom filter + │ │ Increment   │  │ Batch write  │
           │ idempotency    │ │ usage_agg   │  │ to ClickHouse│
           │ table check    │ │ per sub +   │  │ / S3 Parquet │
           │                │ │ meter +     │  │              │
           │                │ │ period      │  │              │
           └────────────────┘ └─────────────┘  └─────────────┘
```

### Idempotent 事件处理

```python
class UsageEventProcessor:
    def __init__(self):
        self.bloom_filter = ScalableBloomFilter(
            initial_capacity=10_000_000,
            error_rate=0.001
        )

    def process_event(self, event: dict) -> bool:
        idem_key = f"{event['tenant_id']}:{event['idempotency_key']}"

        # 快速路径：Bloom filter 检查（概率性，无漏报）
        if idem_key in self.bloom_filter:
            # 可能是重复 — 对照数据库验证
            if db.usage_events.exists(
                tenant_id=event["tenant_id"],
                idempotency_key=event["idempotency_key"]
            ):
                return False  # 确认重复，跳过

        # 非重复 — 处理
        db.usage_events.insert(
            tenant_id=event["tenant_id"],
            subscription_id=event["subscription_id"],
            meter_id=event["meter_id"],
            quantity=event["quantity"],
            timestamp=event["timestamp"],
            idempotency_key=event["idempotency_key"],
            properties=event.get("properties")
        )

        # 更新运行聚合（原子递增）
        period_start = get_billing_period_start(
            event["subscription_id"], event["timestamp"]
        )
        db.usage_aggregates.upsert(
            subscription_id=event["subscription_id"],
            meter_id=event["meter_id"],
            period_start=period_start,
            increment_quantity=event["quantity"],
            last_event_at=event["timestamp"]
        )

        # 添加到 bloom filter
        self.bloom_filter.add(idem_key)

        return True
```

### 聚合策略

```
原始事件 → 小时级预聚合 → 周期聚合 → 账单行项目

示例：
  订阅：sub_7a8b9c0d
  计量器：api_calls
  计费周期：7月1日 - 7月31日

  小时聚合（存储在 ClickHouse 中）：
    2024-07-01 00:00  →  1,250 次调用
    2024-07-01 01:00  →    890 次调用
    2024-07-01 02:00  →    340 次调用
    ...
    2024-07-31 23:00  →  1,100 次调用

  周期聚合（存储在 PostgreSQL 中）：
    周期：2024-07-01 至 2024-07-31
    total_quantity：2,450,000 次调用

  账单生成时：
    获取周期聚合 → 应用阶梯定价 → 生成行项目
```

### 实时用量仪表板查询

```sql
-- 某订阅当前周期的用量
SELECT
    m.meter_id,
    m.display_name,
    ua.total_quantity,
    ua.period_start,
    ua.period_end,
    ua.updated_at AS last_updated
FROM usage_aggregates ua
JOIN meters m ON m.meter_id = ua.meter_id
WHERE ua.subscription_id = $1
  AND ua.period_start = $2
ORDER BY m.display_name;

-- 小时级明细（从 ClickHouse 查询，适用于高基数查询）
SELECT
    toStartOfHour(timestamp) AS hour,
    meter_id,
    sum(quantity) AS total
FROM usage_events
WHERE subscription_id = $1
  AND timestamp >= $2
  AND timestamp < $3
GROUP BY hour, meter_id
ORDER BY hour;
```

---

## 12. 深入探讨：收入确认

### ASC 606 五步模型

订阅业务的收入确认遵循 ASC 606（国际上对应 IFRS 15）：

```
步骤 1：识别合同
  → 商户与客户之间的订阅协议

步骤 2：识别履约义务
  → 每个计费周期是一个独立的履约义务
  → 基于用量的部分在消费时确认

步骤 3：确定交易价格
  → 账单总额（包含折扣，不含税费）

步骤 4：将价格分配到履约义务
  → 月度订阅：全额分配到当月
  → 年度订阅：按比例分配到 12 个月
  → 设置费：分摊到预期合同期限内

步骤 5：在履约义务满足时确认收入
  → 随时间推移：在服务期间按比例确认
  → 基于用量：在消费发生时确认
```

### 收入确认会计分录

```
场景：年度套餐 $1,200/年，1月1日预付

1月1日（收到款项）：
  借方：现金                     $1,200
  贷方：递延收入                 $1,200

1月31日（交付一个月的服务）：
  借方：递延收入                   $100
  贷方：已确认收入                 $100

2月28日：
  借方：递延收入                   $100
  贷方：已确认收入                 $100

...（每月重复直到12月）

3月31日资产负债表：
  递延收入：$1,200 - (3 * $100) = $900
  已确认收入（第一季度）：$300
```

### 收入确认数据模型

```sql
CREATE TABLE revenue_schedule (
    schedule_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    invoice_id          UUID NOT NULL REFERENCES invoices(invoice_id),
    line_item_id        UUID NOT NULL REFERENCES invoice_line_items(line_item_id),
    recognition_date    DATE NOT NULL,
    amount              BIGINT NOT NULL,           -- 待确认金额（分）
    recognized          BOOLEAN NOT NULL DEFAULT FALSE,
    recognized_at       TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_rev_schedule UNIQUE (line_item_id, recognition_date)
);

CREATE INDEX idx_rev_schedule_date ON revenue_schedule(recognition_date)
    WHERE recognized = FALSE;
CREATE INDEX idx_rev_schedule_tenant ON revenue_schedule(tenant_id, recognition_date);
```

### 收入调度生成

```python
def generate_revenue_schedule(invoice: Invoice, line_items: list):
    schedules = []

    for item in line_items:
        if item.type in ("tax", "discount", "credit"):
            continue  # 税费和折扣不属于收入

        if item.period_start and item.period_end:
            # 将收入分摊到服务期间
            total_days = (item.period_end - item.period_start).days
            daily_amount = item.amount / total_days

            current_date = item.period_start.date()
            end_date = item.period_end.date()
            remaining = item.amount

            while current_date < end_date:
                month_end = min(
                    end_date,
                    (current_date.replace(day=1) + timedelta(days=32)).replace(day=1)
                )
                days_in_chunk = (month_end - current_date).days
                chunk_amount = round(daily_amount * days_in_chunk)

                # 调整最后一段以避免舍入误差
                if month_end == end_date:
                    chunk_amount = remaining

                schedules.append({
                    "invoice_id": invoice.invoice_id,
                    "line_item_id": item.line_item_id,
                    "recognition_date": current_date,
                    "amount": chunk_amount
                })

                remaining -= chunk_amount
                current_date = month_end

    db.revenue_schedule.bulk_insert(schedules)
```

---

## 13. 扩展策略

### 数据库分片

```
分片策略：按 tenant_id（商户）分片

理由：
  - 订阅的所有查询都包含 tenant_id
  - 账单、支付、使用事件都关联到租户
  - 避免跨分片 JOIN（所有商户数据共置）
  - 支持租户隔离以满足合规要求

分片布局：
  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
  │  Shard 0     │  │  Shard 1     │  │  Shard 2     │
  │              │  │              │  │              │
  │ tenant_id    │  │ tenant_id    │  │ tenant_id    │
  │ hash % 64   │  │ hash % 64   │  │ hash % 64   │
  │ = 0..15     │  │ = 16..31    │  │ = 32..47    │
  │              │  │              │  │              │
  │ ~2,500      │  │ ~2,500      │  │ ~2,500      │
  │ tenants     │  │ tenants     │  │ tenants     │
  └──────────────┘  └──────────────┘  └──────────────┘
                                      ...（4 个物理分片对应 64 个虚拟槽位）

虚拟分片：64 个虚拟分片初始映射到 4 个物理分片。
  通过拆分虚拟分片范围扩展到 8 个物理分片。

大租户：为拥有 > 100万订阅的租户分配专用分片。
  防止嘈杂邻居问题。
```

### 大规模事件处理

```
使用事件吞吐量：峰值 100K 事件/秒

架构：
  Kafka 集群：3 个 broker，副本因子 3
  usage.events topic：128 个分区（按 subscription_id hash 分区）
  消费者组：32 个 worker（每台物理主机 4 个，共 8 台主机）

  每个 worker 处理约 3,125 事件/秒
  每事件处理时间：约 1ms（验证 + 去重 + 聚合）

扩展手段：
  1. 增加分区 + 消费者（线性水平扩展）
  2. 批量聚合写入（每 100 个事件一次数据库写入）
  3. 消费者本地聚合（每 5 秒刷新一次）
  4. ClickHouse 用于原始事件存储（列式，压缩）

背压处理：
  - 通过 Kafka 消费者组指标监控消费延迟
  - 如果延迟 > 100万事件：自动扩展消费者组
  - 如果延迟 > 1000万事件：告警 + 限流摄取 API（429）
```

### 只读副本与缓存

```
写入路径（强一致性）：
  API → PostgreSQL 主节点（按分片）
  用途：订阅变更、账单确认、支付记录

读取路径（最终一致性）：
  API → Redis 缓存 → PostgreSQL 只读副本
  用途：订阅详情、账单历史、用量仪表板

缓存策略：
  订阅详情：         缓存 60 秒（变更时失效）
  套餐详情：         缓存 5 分钟（很少变更）
  账单（已确认）：    永久缓存（支付后不可变）
  用量聚合：         缓存 30 秒（频繁更新）
  客户信用余额：     不缓存（始终从主节点读取）

只读副本配置：
  每分片 2 个同步副本（零 RPO）
  流复制延迟：通常 < 100ms
  故障切换：通过 Patroni 自动提升
```

### 热点缓解

```
问题：大租户拥有 500万订阅，全部在每月1号续费
  → 500万张账单 + 500万次支付尝试在一个计费窗口内

解决方案：
  1. 计费周期抖动：将计费锚点分散到整个月
     - 新订阅锚点 = 注册日（而非每月1号）
     - 现有订阅：通过 proration 逐步迁移

  2. 限速计费队列：
     - 将所有账单任务发布到 Kafka
     - 按租户以受控速率消费（如 1K 账单/秒）
     - 防止数据库写入尖峰

  3. 大租户专用分片：
     - 为 > 100万订阅的租户分配独立数据库
     - 计算和存储独立扩展

  4. 预计算：
     - 在计费日期前 24 小时计算账单金额
     - 存储为"草稿账单" — 在计费时确认并收费
     - 将计费窗口计算负载降低 80%
```

---

## 14. 部署架构

```
                        ┌─────────────────────────────────────────────┐
                        │               Kubernetes Cluster             │
                        │                                              │
                        │  ┌─────────────────────────────────────────┐ │
                        │  │           Ingress Controller             │ │
                        │  │       (NGINX / AWS ALB Controller)       │ │
                        │  └────────────────────┬────────────────────┘ │
                        │                       │                      │
                        │  ┌────────────────────▼────────────────────┐ │
                        │  │              API Gateway Pod             │ │
                        │  │  (Kong / custom, 3-10 replicas, HPA)    │ │
                        │  └───┬────┬────┬────┬────┬────┬───────────┘ │
                        │      │    │    │    │    │    │              │
                        │  ┌───▼──┐┌▼───┐┌▼───┐┌──▼──┐┌▼───┐┌──▼──┐ │
                        │  │Plan  ││Sub  ││Inv  ││Pay  ││Use ││Web  │ │
                        │  │Svc   ││Svc  ││Gen  ││Svc  ││Mtr ││hook │ │
                        │  │      ││     ││     ││     ││Svc ││Svc  │ │
                        │  │2 rep ││5 rep││3 rep││3 rep││4rep││3rep │ │
                        │  └──────┘└─────┘└─────┘└─────┘└────┘└─────┘ │
                        │                                              │
                        │  ┌─────────────────────────────────────────┐ │
                        │  │         Background Workers               │ │
                        │  │                                          │ │
                        │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ │ │
                        │  │  │ Billing  │ │ Dunning  │ │ Usage    │ │ │
                        │  │  │ Cycle    │ │ Retry    │ │ Agg      │ │ │
                        │  │  │ Worker   │ │ Worker   │ │ Worker   │ │ │
                        │  │  │ (3 rep)  │ │ (2 rep)  │ │ (8 rep)  │ │ │
                        │  │  └──────────┘ └──────────┘ └──────────┘ │ │
                        │  │                                          │ │
                        │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ │ │
                        │  │  │ Webhook  │ │ PDF      │ │ Revenue  │ │ │
                        │  │  │ Delivery │ │ Generator│ │ Recog    │ │ │
                        │  │  │ Worker   │ │ Worker   │ │ Worker   │ │ │
                        │  │  │ (3 rep)  │ │ (2 rep)  │ │ (1 rep)  │ │ │
                        │  │  └──────────┘ └──────────┘ └──────────┘ │ │
                        │  └─────────────────────────────────────────┘ │
                        │                                              │
                        │  ┌─────────────────────────────────────────┐ │
                        │  │            CronJobs                      │ │
                        │  │                                          │ │
                        │  │  billing-cycle-scanner  (every 15 min)   │ │
                        │  │  dunning-evaluator      (every 1 hour)   │ │
                        │  │  usage-reconciliation   (daily 02:00)    │ │
                        │  │  revenue-recognition    (daily 03:00)    │ │
                        │  │  invoice-archival       (weekly)         │ │
                        │  │  stale-draft-cleanup    (daily 04:00)    │ │
                        │  └─────────────────────────────────────────┘ │
                        └──────────────────────────────────────────────┘

外部依赖：
  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
  │ PostgreSQL   │  │    Redis     │  │    Kafka     │  │  ClickHouse  │
  │ (RDS / self- │  │  (Elasticache│  │  (MSK /      │  │  (Usage      │
  │  managed,    │  │   / self-    │  │   Confluent) │  │   events,    │
  │  multi-AZ)   │  │   managed)   │  │              │  │   analytics) │
  │              │  │              │  │  3 brokers,  │  │              │
  │  Primary +   │  │  3-node     │  │  128 part.   │  │  3-node      │
  │  2 replicas  │  │  cluster    │  │              │  │  cluster     │
  │  per shard   │  │              │  │              │  │              │
  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘

  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
  │  S3          │  │  Payment     │  │  Tax Engine  │
  │  (Invoice    │  │  Gateways    │  │  (Avalara /  │
  │   PDFs,      │  │  (Stripe,    │  │   TaxJar)    │
  │   archives,  │  │   Adyen,     │  │              │
  │   cold data) │  │   Braintree) │  │              │
  └──────────────┘  └──────────────┘  └──────────────┘
```

### 部署策略

| 组件 | 策略 | 原因 |
|------|------|------|
| API 服务 | 滚动更新（maxUnavailable：25%） | API 消费者零停机 |
| 计费 Worker | 蓝绿部署 | 确保同一时间只有一个计费处理器活跃 |
| 用量聚合 | 滚动更新 | Kafka 消费者组再平衡处理过渡 |
| CronJobs | 通过 Redis 锁进行 Leader 选举 | 防止跨副本重复执行定时任务 |
| 数据库迁移 | 先扩展后收缩 | 先添加新列/表；回填数据；然后移除旧的 |

---

## 15. 常见面试追问

**问：当支付调用超时时，如何防止重复扣款？**

答：三层 idempotency 保护。首先，API 层使用客户端提供的 idempotency key 进行去重，存储在 Redis（24小时 TTL）和 PostgreSQL（永久保存）中。如果收到重复请求，返回缓存的结果。其次，在调用外部网关之前，我们在数据库中创建状态为 "processing" 的支付记录 — 这样即使系统崩溃，我们也知道曾尝试过收费。第三，支付网关本身接收我们的 idempotency key，并在其端保证至多一次处理。如果我们收到超时，对账 worker 会使用 idempotency key 查询网关以确定收费是否成功，并相应更新我们的记录。

**问：如何处理从月付到年付的周期内套餐变更？**

答：我们将其视为带 proration 的套餐变更。首先，我们为客户当前月度周期未使用的部分发放抵扣。然后立即收取全年费用。计费周期锚点重置为变更日期，下次续费设定为一年后。例如，如果月付 $49 套餐的客户在 30 天周期的第 16 天升级为年付 $468（相当于月付 $39），他们将获得 $49 * (14/30) = $22.87 的月度未使用时间抵扣，并被收取 $468 的年费。净收费：$468 - $22.87 = $445.13。Proration 行项目记录在账单上，提供完整的审计轨迹。

**问：如何确保使用事件不丢失且不重复计数？**

答：使用事件通过持久化管道流转。摄取 API 验证后立即发布到 Kafka（通过副本机制提供持久性）。消费者以 idempotent 方式处理事件：每个事件携带客户端提供的 idempotency key。Bloom filter 提供快速的概率性重复检查（无漏报），数据库的 (tenant_id, idempotency_key) 唯一性约束提供最终保证。消费者仅在原始事件插入和聚合递增都在单个数据库事务中提交后，才确认 Kafka offset。如果消费者在确认前崩溃，Kafka 重新投递事件，idempotency 检查防止重复计数。

**问：如何处理客户在单个计费周期内先升级、再降级、又升级的场景？**

答：每次套餐变更都会生成 proration 行项目，作为"待处理 proration"累积在订阅上。在开具账单时，所有待处理的 proration 被收集并作为单独的行项目添加。例如：7月1日客户使用 Basic（$49/月），7月10日升级到 Pro（$99），7月20日降级回 Basic，然后7月25日再次升级到 Pro。每次变更都会为旧套餐的未使用时间创建抵扣，并为新套餐的剩余时间创建收费。最终账单有六个 proration 行项目（三个抵扣、三个收费）加上续费金额。这种方法完全可审计，因为每次变更都可以单独追踪。

**问：如果计费系统在计费周期窗口期间宕机会怎样？**

答：计费系统被设计为可崩溃恢复。计费周期扫描器是一个定时任务，识别到期续费的订阅并将 idempotent 任务发布到 Kafka。如果扫描器崩溃，它只需在下一个间隔再次运行并重新发现任何未处理的订阅（current_period_end 已过但没有对应账单的订阅）。由于账单生成使用从 subscription_id 和 period_end 派生的 idempotency key，重复的 Kafka 消息至多产生一张账单。Kafka topic 保留消息 7 天，提供了远超任何实际停机时间的缓冲。恢复后，系统以受控速率处理积压，避免压垮支付网关。

**问：如何处理多币种定价和结算？**

答：套餐以特定货币定价（一个套餐可以有 USD、EUR、GBP 的价格变体）。当客户订阅时，账单以套餐的货币生成。如果商户的结算货币与账单货币不同，货币转换发生在结算时（而非计费时），使用支付日的汇率。我们永久存储原始账单货币和金额 — 转换是一个独立的财务事件。对于希望以客户当地货币定价的商户，我们支持每个套餐的多个价格点（例如 $49 USD、EUR 45、GBP 39），每个都明确设定以避免汇率风险。

**问：如何实现免费增值模式并在用量阈值时自动升级？**

答：免费增值层级被建模为带有免费层级计量价格的常规套餐（例如 0-1000 次 API 调用 @ $0.00）。当用量超过免费层级时，超额部分按计量费率在下一张账单上计费。对于自动套餐升级，配置用量阈值触发器：用量聚合 worker 在每次递增后检查运行总量与阈值的对比。当超过阈值时，发布事件到 Kafka。订阅升级 worker 消费此事件，发起向付费层级的套餐变更（带 proration），并发送 webhook 通知商户。客户通过邮件收到通知，其中包含管理订阅的链接。商户可以配置升级是自动的还是需要客户确认。

**问：如何测试计费逻辑以确保正确性？**

答：计费逻辑需要多层次的全面测试。单元测试覆盖每种定价模型（固定费率、按席位、累进阶梯、总量阶梯、混合）及边界情况（零用量、恰好在层级边界、最大值、舍入）。基于属性的测试验证 proration 抵扣加收费无论时间如何总是等于正确的总额。集成测试对测试数据库运行完整的账单生成流水线，使用已知的固定数据并验证每个行项目金额。我们维护一个包含 200 多个真实场景的"计费场景测试套件"（周期内升级、多币种、优惠券叠加 proration、不完整月份、闰年）。计费引擎的每次代码变更都必须通过此测试套件。在生产环境中，对账任务每天运行，将生成的账单总额与独立计算的预期金额进行比较，并在出现差异时发出告警。

**问：如何处理跨司法管辖区的税费计算？**

答：税费计算委托给专业的税务引擎（如 Avalara 或 TaxJar），在账单确认期间通过同步 API 调用完成。我们传递客户的账单地址、行项目金额和产品税务代码。税务引擎根据司法管辖区（美国的州、县、市；欧盟的 VAT）返回每个行项目的适用税率和金额。税额作为单独的行项目存储在账单上以确保透明度。为提高性能，我们按司法管辖区缓存税率，TTL 为 24 小时（税率变化不频繁）。对于欧盟客户，我们通过 VAT ID 验证检测 B2B 交易来处理反向收取 VAT。税费永远不是订阅价格的一部分 — 它始终在开具账单时计算和应用。

---

## 16. 总结

### 关键架构决策

| 决策 | 选择的方案 | 替代方案 | 原因 |
|------|-----------|----------|------|
| 订阅状态管理 | 带乐观锁的状态机 | 简单状态字段 | 状态机强制执行有效转换；乐观锁防止竞态条件 |
| 账单生成 | 批量定时任务 + Kafka worker | 订阅续费时实时生成 | 解耦；在受控窗口内处理数百万张账单；通过 idempotent 任务实现崩溃恢复 |
| 使用事件存储 | Kafka + ClickHouse（热）+ S3 Parquet（冷） | 仅 PostgreSQL | 100K 事件/秒超出 RDBMS 写入能力；列式存储最适合聚合查询 |
| 使用去重 | Bloom filter + 数据库唯一约束 | 仅数据库唯一约束 | Bloom filter 在 100K 事件/秒时吸收 99.9% 的重复检查，无需数据库往返 |
| Proration | 按秒计算 + 累积待处理项 | 按天计算 | 按秒计算避免天边界的边界情况；待处理项支持多次周期内变更 |
| 支付 idempotency | Redis（快速）+ PostgreSQL（持久）+ 网关级别 | 仅 Redis | 在 Redis 故障时仍可存续；网关级 idempotency 即使在我们的系统重放时也防止重复扣款 |
| Dunning 重试时机 | 智能重试（客户时区 + 拒绝码分析） | 固定间隔 | 在客户可能有资金的时间重试，恢复率提高 15-30% |
| 多租户数据隔离 | 按 tenant_id 逻辑分片，大租户专用分片 | 单一数据库 | 共置所有租户数据；避免跨分片 JOIN；大租户获得嘈杂邻居隔离 |
| 收入确认 | 预计算调度表 | 从账单按需计算 | 调度表实现高效的月度结账；支持 ASC 606 审计要求 |
| 税费计算 | 外部税务引擎（Avalara）+ 缓存 | 内置税率表 | 税法在 10,000+ 个司法管辖区中不断变化；外部引擎由专业人员维护 |

### 权衡分析

```
一致性 vs. 可用性：
  - 计费变更操作：强一致性（CAP 中的 CP）
    → 计费错误比短暂不可用更严重
  - 用量仪表板：最终一致性（CAP 中的 AP）
    → 可接受显示过时的用量；不需要实时

复杂性 vs. 正确性：
  - Proration 引擎：高复杂性，但财务准确性不可妥协
  - 收入确认：为合规要求增加的复杂性
  - 权衡：投资于正确性；计费错误会侵蚀信任

延迟 vs. 吞吐量：
  - 支付处理：优化延迟（端到端 < 2 秒）
  - 账单生成：优化吞吐量（每小时批量处理数百万张）
  - 使用摄取：优化吞吐量（100K 事件/秒，异步）

自建 vs. 购买：
  - 支付网关：购买（Stripe、Adyen）— 仅 PCI 合规就足以证明
  - 税务引擎：购买（Avalara）— 税法专业知识不是我们的核心竞争力
  - 计费引擎：自建 — 核心差异化能力；对定价模型的完全控制
  - 使用计量：自建 — 自定义聚合逻辑与计费紧密耦合
```

---

*涵盖：订阅状态机、计费模型（固定费率/按席位/计量/阶梯/混合）、proration 计算、账单流水线、idempotent 支付处理、PCI 合规、dunning 与智能重试、大规模基于用量的计费、收入确认（ASC 606）、基于租户的分片、事件驱动架构。*
