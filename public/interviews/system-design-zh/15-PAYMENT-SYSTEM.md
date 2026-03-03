# 设计支付系统 (Stripe)

## 1. 需求澄清

### 功能性需求

- **处理支付**：接受信用卡/借记卡、银行转账 (ACH) 和数字钱包 (Apple Pay、Google Pay)
- **退款**：支持全额和部分退款，并记录退款原因
- **周期性计费**：支持多种计费周期的订阅（按月、按年、按用量）
- **多币种**：支持 135+ 种货币的实时汇率
- **商户仪表盘**：实时交易监控、分析和报表
- **Webhooks**：支付生命周期事件的事件驱动通知
- **结算付款**：按可配置的时间表向商户银行账户结算资金
- **争议管理**：处理 chargebacks 和申诉

### 非功能性需求

- **精确一次处理**：不重复收费，不丢失支付
- **低延迟**：支付授权 < 500ms (p99)
- **高可用性**：99.999% 正常运行时间（每年停机 5.26 分钟）
- **PCI DSS 合规**：处理卡片数据的 Level 1 合规
- **审计追踪**：每笔支付每个操作的不可变日志
- **强一致性**：支付状态在所有读取中必须保持一致
- **持久性**：金融交易零数据丢失

### 规模估算

- **商户**：100 万活跃商户
- **交易**：每天 1000 万笔交易
- **日处理量**：每天处理 10 亿美元
- **平均交易额**：约 100 美元

### 粗略估算

```
Transactions per second (TPS):
  10M / 86,400s = ~116 TPS (average)
  Peak (10x average) = ~1,160 TPS
  Black Friday peak (50x) = ~5,800 TPS

Storage per transaction:
  Payment record: ~2 KB
  Ledger entries (2 per payment): ~500 bytes
  Audit log entries (~5 per payment): ~2.5 KB
  Total per transaction: ~5 KB

Daily storage:
  10M x 5 KB = 50 GB/day
  Annual: 50 GB x 365 = ~18 TB/year

Network bandwidth:
  Request size: ~1 KB, Response: ~2 KB
  Peak: 5,800 x 3 KB = ~17 MB/s (manageable)

Database writes:
  Each payment: ~8 writes (payment, ledger, audit, idempotency, etc.)
  Peak: 5,800 x 8 = ~46,400 writes/sec
```

---

## 2. 支付流程概览

### 支付生命周期

每笔卡片支付都经历三个不同的阶段：

```
Authorization          Capture              Settlement
    |                    |                     |
    v                    v                     v
"Can this card    "Actually charge     "Move money from
 be charged?"      the card now"        bank to bank"
    |                    |                     |
  Real-time          Real-time            Batch (T+1/T+2)
  (< 500ms)          (< 500ms)           (end of day)
```

### 参与方

```
+----------+     +-----------+     +----------+     +----------+
| Customer |     | Merchant  |     | Acquiring|     |  Card    |
| (Payer)  |     | (Payee)   |     |   Bank   |     | Network  |
+----+-----+     +-----+-----+     +----+-----+     +----+-----+
     |                 |                 |                 |
     |   Enters card   |                 |                 |
     +---------------->|                 |                 |
     |                 |  Payment Req    |                 |
     |                 +---------------->|                 |
     |                 |                 |  Authorization  |
     |                 |                 +---------------->|
     |                 |                 |                 |
     |                 |                 |           +-----+------+
     |                 |                 |           |  Issuing   |
     |                 |                 |           |    Bank    |
     |                 |                 |           +-----+------+
     |                 |                 |                 |
     |                 |                 |<-- Approved ----+
     |                 |<-- Approved ----+                 |
     |<-- Confirmed ---+                 |                 |
     |                 |                 |                 |
```

### 单次支付流程

```
Customer         Merchant App       Our System        Payment Processor
   |                  |                  |                    |
   | 1. Enter card    |                  |                    |
   +----------------->|                  |                    |
   |                  | 2. Create        |                    |
   |                  |  PaymentIntent   |                    |
   |                  +----------------->|                    |
   |                  |                  | 3. Tokenize card   |
   |                  |                  |    (PCI vault)     |
   |                  |                  |                    |
   |                  | 4. Return        |                    |
   |                  |  client_secret   |                    |
   |                  |<-----------------+                    |
   |                  |                  |                    |
   | 5. Confirm with  |                  |                    |
   |    client SDK    |                  |                    |
   +------------------------------------>|                    |
   |                  |                  | 6. Authorize       |
   |                  |                  +------------------->|
   |                  |                  |                    |
   |                  |                  | 7. Auth response   |
   |                  |                  |<-------------------+
   |                  |                  |                    |
   |                  |                  | 8. Capture         |
   |                  |                  +------------------->|
   |                  |                  |                    |
   |                  | 9. Webhook:      |                    |
   |                  |  payment.success |                    |
   |                  |<-----------------+                    |
   |                  |                  |                    |
   | 10. Show receipt |                  |                    |
   |<-----------------+                  |                    |
```

### 订阅 / 周期性支付流程

```
1. Merchant creates subscription plan
2. Customer subscribes (first payment authorized immediately)
3. System stores payment method token
4. Billing engine triggers on schedule:
   - Generate invoice
   - Attempt charge using stored token
   - If failed: retry with exponential backoff (day 1, 3, 5, 7)
   - If all retries fail: mark subscription past_due
   - After grace period: cancel subscription
5. Send webhook for each event
```

### 退款流程

```
Merchant             Our System           Payment Processor     Issuing Bank
   |                     |                       |                   |
   | 1. POST /refunds    |                       |                   |
   +-------------------->|                       |                   |
   |                     | 2. Validate           |                   |
   |                     |   (amount <= captured) |                   |
   |                     |                       |                   |
   |                     | 3. Create refund      |                   |
   |                     |    record + ledger    |                   |
   |                     |                       |                   |
   |                     | 4. Send refund req    |                   |
   |                     +---------------------->|                   |
   |                     |                       | 5. Process refund |
   |                     |                       +------------------>|
   |                     |                       |                   |
   |                     | 6. Refund confirmed   |                   |
   |                     |<----------------------+                   |
   |                     |                       |                   |
   | 7. Webhook:         |                       |                   |
   |  refund.succeeded   |                       |                   |
   |<--------------------+                       |                   |
   |                     |                       |                   |
   |            (Customer sees refund in 5-10 business days)         |
```

---

## 3. API 设计

### 认证

所有 API 请求需要通过 Bearer token 提供密钥 API key：

```
Authorization: Bearer sk_live_abc123...
```

### 幂等性

所有写操作接受 `Idempotency-Key` 头部以防止重复处理：

```
Idempotency-Key: a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

### 创建支付意图

```
POST /v1/payments
Idempotency-Key: {uuid}

Request:
{
  "amount": 5000,              // in smallest currency unit (cents)
  "currency": "usd",
  "payment_method": "pm_card_visa",
  "merchant_id": "merch_abc123",
  "capture_method": "automatic",  // or "manual"
  "description": "Order #1234",
  "metadata": {
    "order_id": "ord_abc123"
  },
  "return_url": "https://merchant.com/complete"
}

Response (201 Created):
{
  "id": "pay_1234567890",
  "object": "payment_intent",
  "status": "requires_confirmation",
  "amount": 5000,
  "currency": "usd",
  "client_secret": "pay_1234567890_secret_xyz",
  "created_at": "2024-01-15T10:30:00Z"
}
```

### 确认支付

```
POST /v1/payments/{id}/confirm
Idempotency-Key: {uuid}

Request:
{
  "payment_method": "pm_card_visa",
  "return_url": "https://merchant.com/return"
}

Response (200 OK):
{
  "id": "pay_1234567890",
  "status": "processing",
  "next_action": null
}
```

### 捕获支付（用于手动捕获）

```
POST /v1/payments/{id}/capture
Idempotency-Key: {uuid}

Request:
{
  "amount_to_capture": 5000  // optional, for partial capture
}

Response (200 OK):
{
  "id": "pay_1234567890",
  "status": "captured",
  "amount_captured": 5000
}
```

### 创建退款

```
POST /v1/refunds
Idempotency-Key: {uuid}

Request:
{
  "payment_id": "pay_1234567890",
  "amount": 2500,             // partial refund (optional, defaults to full)
  "reason": "customer_request" // or "duplicate", "fraudulent"
}

Response (201 Created):
{
  "id": "ref_abc123",
  "payment_id": "pay_1234567890",
  "amount": 2500,
  "status": "pending",
  "created_at": "2024-01-16T08:00:00Z"
}
```

### 创建订阅

```
POST /v1/subscriptions
Idempotency-Key: {uuid}

Request:
{
  "customer_id": "cus_abc123",
  "plan_id": "plan_monthly_pro",
  "payment_method": "pm_card_visa",
  "billing_cycle_anchor": "2024-02-01T00:00:00Z",
  "trial_period_days": 14,
  "metadata": {
    "feature_tier": "pro"
  }
}

Response (201 Created):
{
  "id": "sub_xyz789",
  "status": "trialing",
  "current_period_start": "2024-01-15T00:00:00Z",
  "current_period_end": "2024-01-29T00:00:00Z",
  "plan": { "id": "plan_monthly_pro", "amount": 2999 },
  "created_at": "2024-01-15T10:00:00Z"
}
```

### Webhook 事件

事件通过 HTTP POST 发送到商户配置的端点：

```
POST https://merchant.com/webhooks

Headers:
  Stripe-Signature: t=1234567890,v1=abc123hash...
  Content-Type: application/json

Body:
{
  "id": "evt_abc123",
  "type": "payment_intent.succeeded",
  "created": 1705312200,
  "data": {
    "object": {
      "id": "pay_1234567890",
      "amount": 5000,
      "currency": "usd",
      "status": "succeeded"
    }
  }
}

Key event types:
  - payment_intent.created
  - payment_intent.succeeded
  - payment_intent.payment_failed
  - charge.captured
  - charge.refunded
  - invoice.paid
  - invoice.payment_failed
  - customer.subscription.created
  - customer.subscription.updated
  - customer.subscription.deleted
```

---

## 4. 高层架构

```
                            +------------------+
                            |   Client SDKs    |
                            | (JS, iOS, Android)|
                            +--------+---------+
                                     |
                                     | HTTPS
                                     v
                            +------------------+
                            |   API Gateway    |
                            | (Rate Limit,Auth,|
                            |  TLS Termination)|
                            +--------+---------+
                                     |
              +----------------------+----------------------+
              |                      |                      |
              v                      v                      v
     +--------+-------+    +--------+-------+    +---------+------+
     | Payment Service|    |Subscription Svc|    | Merchant Svc   |
     | (Core payment  |    |(Billing engine, |    |(Onboarding,    |
     |  orchestration)|    | invoicing)      |    | config, keys)  |
     +--------+-------+    +--------+-------+    +----------------+
              |                      |
              v                      |
     +--------+-------+             |
     | Payment State  |<------------+
     |   Machine      |
     +---+----+---+---+
         |    |   |
         |    |   +------------------------+
         |    |                            |
         v    v                            v
  +------+--+ +--------+--------+  +------+--------+
  | Ledger  | | Risk / Fraud    |  | Notification  |
  | Service | | Detection Svc   |  | Service       |
  | (Double | | (Rules + ML)    |  | (Webhooks,    |
  | Entry)  | +-----------------+  |  email, SMS)  |
  +---------+                      +---------------+
         |
         v
  +------+--------+     +-------------------+
  | Reconciliation|     | Payment Processor |
  | Service       |     | Adapter           |
  | (Daily batch) |     | (Visa, MC, etc.)  |
  +---------------+     +--------+----------+
                                 |
                    +------------+------------+
                    |            |            |
                    v            v            v
               +--------+  +--------+  +---------+
               |  Visa  |  |  MC    |  |  ACH    |
               | Network|  | Network|  | Network |
               +--------+  +--------+  +---------+

  Async Infrastructure:
  +------------------+     +------------------+
  |   Kafka /        |     | Dead Letter      |
  |   Message Bus    |---->| Queue (DLQ)      |
  +------------------+     +------------------+

  Data Stores:
  +------------------+  +------------------+  +------------------+
  | PostgreSQL       |  | Redis            |  | S3 / Blob        |
  | (Payments,       |  | (Idempotency,    |  | (Audit logs,     |
  |  Ledger, etc.)   |  |  Rate limiting,  |  |  Reconciliation  |
  |                  |  |  Sessions)       |  |  reports)        |
  +------------------+  +------------------+  +------------------+
```

### 关键设计决策

1. **独立的支付状态机**：将复杂的状态转换逻辑与业务逻辑分离
2. **Double-Entry Ledger**：独立服务确保财务完整性
3. **支付处理器适配器**：抽象接口允许在不更改核心逻辑的情况下切换处理器
4. **事件驱动架构**：Kafka 解耦服务并实现 exactly-once 语义
5. **DLQ 处理失败支付**：失败的支付处理尝试通过异步方式重试

---

## 5. 数据模型

### SQL Schema

```sql
-- Merchants / Accounts
CREATE TABLE merchants (
    id              VARCHAR(32) PRIMARY KEY,    -- merch_abc123
    name            VARCHAR(255) NOT NULL,
    email           VARCHAR(255) NOT NULL,
    country         VARCHAR(2) NOT NULL,
    default_currency VARCHAR(3) NOT NULL DEFAULT 'usd',
    payout_schedule VARCHAR(20) DEFAULT 'daily', -- daily, weekly, monthly
    status          VARCHAR(20) NOT NULL DEFAULT 'active',
    api_key_hash    VARCHAR(128) NOT NULL,
    webhook_url     TEXT,
    webhook_secret  VARCHAR(128),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_merchants_email ON merchants(email);
CREATE INDEX idx_merchants_status ON merchants(status);

-- Payment Methods (tokenized, no raw card data)
CREATE TABLE payment_methods (
    id              VARCHAR(32) PRIMARY KEY,    -- pm_abc123
    customer_id     VARCHAR(32) NOT NULL,
    merchant_id     VARCHAR(32) NOT NULL REFERENCES merchants(id),
    type            VARCHAR(20) NOT NULL,       -- card, bank_account, wallet
    card_brand      VARCHAR(20),                -- visa, mastercard, amex
    card_last4      VARCHAR(4),
    card_exp_month  SMALLINT,
    card_exp_year   SMALLINT,
    card_fingerprint VARCHAR(64),               -- for duplicate detection
    token           VARCHAR(255) NOT NULL,      -- processor token
    is_default      BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pm_customer ON payment_methods(customer_id);
CREATE INDEX idx_pm_fingerprint ON payment_methods(card_fingerprint);

-- Payments (core table with state machine)
CREATE TABLE payments (
    id              VARCHAR(32) PRIMARY KEY,    -- pay_abc123
    merchant_id     VARCHAR(32) NOT NULL REFERENCES merchants(id),
    customer_id     VARCHAR(32),
    payment_method_id VARCHAR(32) REFERENCES payment_methods(id),
    amount          BIGINT NOT NULL,            -- in smallest currency unit
    currency        VARCHAR(3) NOT NULL,
    status          VARCHAR(20) NOT NULL,       -- see state machine below
    capture_method  VARCHAR(10) DEFAULT 'automatic',
    description     TEXT,
    failure_code    VARCHAR(50),
    failure_message TEXT,
    processor_id    VARCHAR(64),                -- external processor ref
    processor_response JSONB,
    metadata        JSONB DEFAULT '{}',
    idempotency_key VARCHAR(64),
    client_secret   VARCHAR(128),
    amount_captured BIGINT DEFAULT 0,
    amount_refunded BIGINT DEFAULT 0,
    captured_at     TIMESTAMPTZ,
    canceled_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version         INTEGER NOT NULL DEFAULT 1  -- optimistic locking
);

CREATE INDEX idx_payments_merchant ON payments(merchant_id);
CREATE INDEX idx_payments_customer ON payments(customer_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_created ON payments(created_at);
CREATE UNIQUE INDEX idx_payments_idempotency
    ON payments(merchant_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- Ledger Entries (double-entry bookkeeping, append-only)
CREATE TABLE ledger_entries (
    id              BIGSERIAL PRIMARY KEY,
    transaction_id  VARCHAR(32) NOT NULL,       -- groups debit + credit
    payment_id      VARCHAR(32) NOT NULL REFERENCES payments(id),
    account_id      VARCHAR(64) NOT NULL,       -- e.g., "merchant:merch_abc123"
    account_type    VARCHAR(20) NOT NULL,       -- asset, liability, revenue, expense
    entry_type      VARCHAR(10) NOT NULL,       -- debit or credit
    amount          BIGINT NOT NULL,            -- always positive
    currency        VARCHAR(3) NOT NULL,
    description     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ledger_payment ON ledger_entries(payment_id);
CREATE INDEX idx_ledger_account ON ledger_entries(account_id);
CREATE INDEX idx_ledger_txn ON ledger_entries(transaction_id);
CREATE INDEX idx_ledger_created ON ledger_entries(created_at);

-- Subscriptions
CREATE TABLE subscriptions (
    id                    VARCHAR(32) PRIMARY KEY,
    merchant_id           VARCHAR(32) NOT NULL REFERENCES merchants(id),
    customer_id           VARCHAR(32) NOT NULL,
    plan_id               VARCHAR(32) NOT NULL,
    payment_method_id     VARCHAR(32) REFERENCES payment_methods(id),
    status                VARCHAR(20) NOT NULL,  -- trialing, active, past_due,
                                                 -- canceled, unpaid
    current_period_start  TIMESTAMPTZ NOT NULL,
    current_period_end    TIMESTAMPTZ NOT NULL,
    trial_end             TIMESTAMPTZ,
    cancel_at_period_end  BOOLEAN DEFAULT FALSE,
    canceled_at           TIMESTAMPTZ,
    retry_count           SMALLINT DEFAULT 0,
    next_retry_at         TIMESTAMPTZ,
    metadata              JSONB DEFAULT '{}',
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sub_merchant ON subscriptions(merchant_id);
CREATE INDEX idx_sub_customer ON subscriptions(customer_id);
CREATE INDEX idx_sub_status ON subscriptions(status);
CREATE INDEX idx_sub_period_end ON subscriptions(current_period_end);

-- Refunds
CREATE TABLE refunds (
    id              VARCHAR(32) PRIMARY KEY,
    payment_id      VARCHAR(32) NOT NULL REFERENCES payments(id),
    merchant_id     VARCHAR(32) NOT NULL REFERENCES merchants(id),
    amount          BIGINT NOT NULL,
    currency        VARCHAR(3) NOT NULL,
    status          VARCHAR(20) NOT NULL,       -- pending, succeeded, failed
    reason          VARCHAR(50),
    processor_id    VARCHAR(64),
    failure_reason  TEXT,
    idempotency_key VARCHAR(64),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refunds_payment ON refunds(payment_id);
CREATE INDEX idx_refunds_merchant ON refunds(merchant_id);

-- Webhook Events
CREATE TABLE webhook_events (
    id              VARCHAR(32) PRIMARY KEY,
    merchant_id     VARCHAR(32) NOT NULL REFERENCES merchants(id),
    type            VARCHAR(64) NOT NULL,
    payload         JSONB NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'pending',
    attempts        SMALLINT DEFAULT 0,
    max_attempts    SMALLINT DEFAULT 5,
    next_retry_at   TIMESTAMPTZ,
    last_error      TEXT,
    delivered_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_merchant ON webhook_events(merchant_id);
CREATE INDEX idx_webhook_status ON webhook_events(status)
    WHERE status = 'pending';
CREATE INDEX idx_webhook_retry ON webhook_events(next_retry_at)
    WHERE status = 'pending';

-- Idempotency Keys
CREATE TABLE idempotency_keys (
    key             VARCHAR(64) NOT NULL,
    merchant_id     VARCHAR(32) NOT NULL REFERENCES merchants(id),
    request_path    VARCHAR(255) NOT NULL,
    request_hash    VARCHAR(64) NOT NULL,       -- hash of request body
    response_code   SMALLINT,
    response_body   JSONB,
    locked_at       TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL,       -- TTL: 24 hours
    PRIMARY KEY (merchant_id, key)
);

CREATE INDEX idx_idempotency_expires ON idempotency_keys(expires_at);

-- Audit Log (append-only, immutable)
CREATE TABLE audit_log (
    id              BIGSERIAL PRIMARY KEY,
    entity_type     VARCHAR(32) NOT NULL,       -- payment, refund, subscription
    entity_id       VARCHAR(32) NOT NULL,
    action          VARCHAR(32) NOT NULL,       -- created, status_changed, etc.
    actor_type      VARCHAR(20) NOT NULL,       -- system, merchant, admin
    actor_id        VARCHAR(32),
    old_value       JSONB,
    new_value       JSONB,
    ip_address      INET,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_created ON audit_log(created_at);
```

---

## 6. 支付状态机

### 状态图

```
                          +-------------------+
                          |                   |
                          v                   |
    +----------+    +-----------+    +--------+---+
    |          |    |           |    |            |
    | created  +--->| processing+--->| authorized |
    |          |    |           |    |            |
    +----+-----+    +-----+-----+    +---+---+----+
         |               |              |   |
         |               |              |   |  (manual capture)
         v               v              |   v
    +----+-----+    +----+-----+     |  +----+-----+
    |          |    |          |     |  |          |
    | canceled |    |  failed  |     |  | captured |
    |          |    |          |     |  |          |
    +----------+    +----+-----+     |  +----+-----+
                         |           |       |
                         |           |       v
                         |           |  +----+-----+
                         |           |  |          |
                         |           +->| settled  |
                         |              |          |
                         |              +----+-----+
                         |                   |
                         v                   v
                    +----+-----+    +--------+---+
                    | requires |    |            |
                    |  action  |    |  refunded  |
                    | (3DS)    |    | (full or   |
                    +----------+    |  partial)  |
                                    +------------+
```

### 状态转换

| 起始状态 | 目标状态 | 触发条件 | 副作用 |
|---|---|---|---|
| `created` | `processing` | 确认支付 | 锁定 idempotency key |
| `created` | `canceled` | 商户取消 | 释放冻结资金 |
| `processing` | `authorized` | 处理器批准 | 记录授权码 |
| `processing` | `failed` | 处理器拒绝 | 记录失败原因 |
| `processing` | `requires_action` | 需要 3DS 验证 | 返回 next_action URL |
| `requires_action` | `processing` | 客户完成 3DS 验证 | 重新提交到处理器 |
| `authorized` | `captured` | 自动或手动捕获 | 创建 ledger 条目 |
| `authorized` | `canceled` | 授权作废 | 向处理器发送作废请求 |
| `captured` | `settled` | 日终结算 | 更新 ledger |
| `captured` | `refunded` | 退款处理完成 | 创建退款 ledger 条目 |
| `settled` | `refunded` | 结算后退款 | 创建退款 + 付款调整 |

### 超时处理

```
State             Timeout        Action
-----------       ---------      ----------------------
processing        30 seconds     Mark failed, notify merchant
authorized        7 days         Auto-void authorization
requires_action   15 minutes     Mark failed, notify merchant
pending_capture   7 days         Auto-capture or void (configurable)
```

### 回滚 / 补偿

每个状态转换都有对应的补偿操作：

```
Forward Action              Compensating Action
-----------------           ----------------------
Authorize                   Void authorization
Capture                     Refund
Settle                      Reverse settlement + Refund
Debit ledger                Credit ledger (reversal entry)
Send webhook                Send correction webhook
```

---

## 7. 精确一次支付处理

### 重复扣费问题

重复扣费发生在以下情况：

1. **网络超时**：客户端在超时后重试，但第一个请求已经成功
2. **服务器崩溃**：服务器处理了支付但在响应前崩溃
3. **重复提交**：用户多次点击"支付"按钮

### Idempotency Key 实现

```
Client                    API Server                   Database
  |                          |                            |
  | POST /v1/payments        |                            |
  | Idempotency-Key: abc123  |                            |
  +------------------------->|                            |
  |                          | 1. Check idempotency       |
  |                          |    table for key            |
  |                          +--------------------------->|
  |                          |                            |
  |                          | 2a. Key not found:         |
  |                          |   - Insert key (locked)    |
  |                          |   - Process payment        |
  |                          |   - Store response         |
  |                          |   - Return response        |
  |                          |                            |
  |                          | 2b. Key found + response:  |
  |                          |   - Return stored response |
  |                          |   (no reprocessing)        |
  |                          |                            |
  |                          | 2c. Key found + locked:    |
  |                          |   - Return 409 Conflict    |
  |                          |   (processing in progress) |
  |<-------------------------+                            |
```

```
Pseudocode for idempotent payment processing:

function processPayment(request, idempotencyKey):
    // Step 1: Check idempotency key
    existing = db.findIdempotencyKey(merchantId, idempotencyKey)

    if existing AND existing.response:
        return existing.response              // Already processed

    if existing AND existing.lockedAt:
        if existing.lockedAt > now() - 30s:
            return 409 Conflict               // In progress
        else:
            // Lock expired, allow retry
            db.releaseLock(existing)

    // Step 2: Acquire lock
    try:
        db.insertIdempotencyKey(merchantId, idempotencyKey, lockedAt=now())
    catch DuplicateKeyError:
        return 409 Conflict

    // Step 3: Process payment within a transaction
    try:
        BEGIN TRANSACTION
            payment = createPaymentRecord(request)
            result = callProcessor(payment)
            updatePaymentStatus(payment, result)
            createLedgerEntries(payment, result)
            storeIdempotencyResponse(idempotencyKey, result)
        COMMIT

        emitEvent("payment.completed", payment)
        return result
    catch error:
        ROLLBACK
        releaseIdempotencyLock(idempotencyKey)
        throw error
```

### At-Least-Once 投递 + 幂等接收方

系统通过以下组合保证 exactly-once 语义：

1. **At-least-once 投递**：消息持续重试直到被确认
2. **幂等接收方**：每个接收方可以安全地多次处理同一消息

```
Producer           Message Queue            Consumer
   |                    |                      |
   | Publish message    |                      |
   +------------------>>|                      |
   |                    | Deliver message       |
   |                    +--------------------->|
   |                    |                      | Process (idempotently)
   |                    |                      |
   |                    |      ACK             |
   |                    |<---------------------+
   |                    |                      |
   |  (if no ACK within timeout, redeliver)    |
   |                    +--------------------->|
   |                    |                      | Detect duplicate
   |                    |                      | (skip processing)
   |                    |      ACK             |
   |                    |<---------------------+
```

### 多步骤支付的 Saga 模式

一笔支付涉及多个服务。Saga 模式通过补偿事务来协调它们：

```
+-------------------------------------------------------------------+
|                     Payment Saga Orchestrator                      |
+-------------------------------------------------------------------+

Step 1: Reserve Funds
  +----> Fraud Check Service  -----> PASS ----+
  |                                           |
  |      (compensate: release hold)           v
  |                                  Step 2: Authorize
  |                           +----> Payment Processor ---> APPROVED --+
  |                           |                                        |
  |      (compensate: void auth)                                       v
  |                                                          Step 3: Capture
  |                                                   +----> Processor ---> OK --+
  |                                                   |                          |
  |      (compensate: refund)                                                    v
  |                                                                    Step 4: Ledger
  |                                                             +----> Create Entries --+
  |                                                             |                       |
  |      (compensate: reversal entries)                                                 v
  |                                                                           Step 5: Notify
  |                                                                    +----> Send Webhook
  |                                                                    |
  +--------------------------------------------------------------------+
         If ANY step fails, execute compensating transactions
         in REVERSE order from the last successful step
```

**Saga 补偿示例（步骤 3 失败）：**

```
Forward path:      Fraud OK -> Auth OK -> Capture FAILED!
                                              |
Compensation:      Void Auth <----------------+
                       |
                   Release Hold
                       |
                   Payment marked FAILED
                       |
                   Webhook: payment_intent.payment_failed
```

---

## 8. Double-Entry Ledger

### 什么是复式记账法？

每笔金融交易都记录为两个条目：
- 一笔**借方**（资金流入某账户）
- 一笔**贷方**（资金流出某账户）

基本规则：**借方总额 = 贷方总额**（始终成立）。

这提供了一个自平衡系统，其中错误可以被立即发现。

### 账户类型

```
Account Type     Debit Increases     Credit Increases
-----------      ---------------     ----------------
Asset            Yes                 No
Liability        No                  Yes
Revenue          No                  Yes
Expense          Yes                 No
```

### 系统中的关键账户

```
Account                          Type          Purpose
-------------------------------  -----------   ---------------------------
cash_clearing                    Asset         Money in transit
merchant:{id}:balance            Liability     Owed to merchant
platform:fees                    Revenue       Our platform fees
processor:{name}:payable         Liability     Owed to processor
customer:{id}:refundable         Liability     Potential refund liability
settlement:pending               Asset         Awaiting settlement
```

### 示例：100 美元支付，费率 2.9% + 0.30 美元

```
Transaction: pay_abc123 ($100.00 payment)

Entry 1 - Customer charge:
  +----+----------------+--------------------------+--------+--------+
  | #  | Transaction ID | Account                  | Debit  | Credit |
  +----+----------------+--------------------------+--------+--------+
  | 1  | txn_001        | cash_clearing            | $100.00|        |
  | 2  | txn_001        | merchant:merch_abc:balance|        | $96.80 |
  | 3  | txn_001        | platform:fees            |        |  $2.90 |
  | 4  | txn_001        | processor:visa:payable   |        |  $0.30 |
  +----+----------------+--------------------------+--------+--------+
  Total:                                            $100.00  $100.00
                                                    =======  =======

Verification: Debits ($100.00) = Credits ($96.80 + $2.90 + $0.30 = $100.00)
```

### 示例：对上述支付进行 50 美元部分退款

```
Entry 2 - Partial refund:
  +----+----------------+--------------------------+--------+--------+
  | #  | Transaction ID | Account                  | Debit  | Credit |
  +----+----------------+--------------------------+--------+--------+
  | 5  | txn_002        | merchant:merch_abc:balance| $48.40 |        |
  | 6  | txn_002        | platform:fees            |  $1.45 |        |
  | 7  | txn_002        | processor:visa:payable   |  $0.15 |        |
  | 8  | txn_002        | cash_clearing            |        | $50.00 |
  +----+----------------+--------------------------+--------+--------+
  Total:                                            $50.00   $50.00
                                                    ======   ======

Note: Fees are refunded proportionally.
```

### 不可变的 Append-Only 设计

Ledger **永远不会**被修改。更正通过添加冲销条目完成：

```
Rules:
1. INSERT only, never UPDATE or DELETE
2. Every entry has a created_at timestamp
3. Corrections create new reversal entries (not modifications)
4. Running balance = SUM(debits) - SUM(credits) per account
5. Audit trail is automatic (full history preserved)
6. Ledger entries reference the source payment_id for traceability
```

### Ledger 对账查询

```sql
-- Verify all transactions balance (debits = credits)
SELECT
    transaction_id,
    SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE 0 END) as total_debit,
    SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE 0 END) as total_credit
FROM ledger_entries
GROUP BY transaction_id
HAVING SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE 0 END)
    != SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE 0 END);

-- Result should ALWAYS be empty. Any rows = critical error.
```

---

## 9. 欺诈检测

### 多层欺诈检���架构

```
Payment Request
       |
       v
+------+--------+     +------------------+
| Layer 1:       |     |                  |
| Pre-Auth Rules |---->| Block / Allow /  |
| (Real-time,    |     | Challenge (3DS)  |
|  < 10ms)       |     |                  |
+------+---------+     +--------+---------+
       |                        |
       v                        |
+------+---------+              |
| Layer 2:       |              |
| ML Fraud Score |              |
| (Real-time,    +--------------+
|  < 50ms)       |
+------+---------+
       |
       v
+------+---------+
| Layer 3:       |
| Post-Auth      |
| Batch Analysis |
| (Async, hourly)|
+----------------+
```

### 基于规则的检测（第 1 层）

```
Rule Category          Examples
-----------------      ----------------------------------------
Velocity checks        - > 5 transactions in 1 minute from same card
                       - > 10 failed attempts from same IP in 1 hour
                       - > $10,000 total from same card in 24 hours

Amount limits          - Single transaction > $5,000 (for new merchants)
                       - Transaction > 3x merchant average

Geo-mismatch           - Card issued in US, transaction from Nigeria
                       - 2 transactions from different countries within 1 hour

Card testing           - Multiple small transactions ($0.50-$1.00)
                       - Sequential card numbers
                       - Same BIN, different card numbers

Device/behavioral      - Tor/VPN detected
                       - Known bad device fingerprint
                       - Automated behavior (no mouse movement)
```

### 基于 ML 的欺诈评分（第 2 层）

```
Features used in the model:
  - Transaction amount and currency
  - Time of day / day of week
  - Card country vs IP country
  - Merchant category code (MCC)
  - Customer transaction history
  - Device fingerprint
  - Shipping vs billing address mismatch
  - Historical fraud rate for BIN range

Output: Risk score 0-100
  0-30:   Low risk    -> Auto-approve
  31-70:  Medium risk -> Apply additional checks / 3DS
  71-100: High risk   -> Block and flag for review
```

### 3D Secure (3DS) 认证

```
Customer        Merchant         Our System       Card Network    Issuing Bank
   |               |                 |                 |               |
   | Pay           |                 |                 |               |
   +-------------->|                 |                 |               |
   |               | Process         |                 |               |
   |               +---------------->|                 |               |
   |               |                 | Risk score: 55  |               |
   |               |                 | -> Trigger 3DS  |               |
   |               |                 +---------------->|               |
   |               |                 |                 +-------------->|
   |               |                 |                 |  Challenge    |
   |               |                 |                 |<--------------+
   |               |                 |<----------------+               |
   |               |<----------------+                 |               |
   |  3DS modal    |                 |                 |               |
   |<--------------+                 |                 |               |
   |               |                 |                 |               |
   | Enter OTP     |                 |                 |               |
   +----------------------------------+---------------+-------------->|
   |               |                 |                 |               |
   |               |                 |                 |   Verified    |
   |               |                 |<----------------+<--------------+
   |               |                 |                 |               |
   |               |                 | Continue auth   |               |
   |               |                 | (liability shift|               |
   |               |                 |  to issuer)     |               |
```

### 实时与批量欺诈检测

| 方面 | 实时 | 批量 |
|---|---|---|
| 延迟 | < 50ms | 数小时 |
| 范围 | 单笔交易 | 跨商户模式 |
| 数据 | 交易特征 | 聚合统计 |
| 操作 | 拦截/放行/3DS | 标记审查，更新模型 |
| 示例 | 速率检查，地理位置 | 团伙欺诈，商户串通 |

---

## 10. 对账

### 为什么对账至关重要

支付系统有多个事实来源（我们的数据库、处理器记录、银行对账单）。差异来自于：

- 处理过程中的网络故障
- 我们确认后处理器端的故障
- 结算时间差异
- 货币转换差异
- 直接向银行发起的 chargebacks

### 对账类型

```
+-----------------------------------------------------------+
|                    Reconciliation Types                     |
+-----------------------------------------------------------+
|                                                            |
|  1. Internal Reconciliation (continuous)                   |
|     Our payment records <-> Our ledger entries             |
|     - Every payment must have matching ledger entries      |
|     - Sum of ledger must balance                           |
|                                                            |
|  2. Processor Reconciliation (daily)                       |
|     Our records <-> Payment processor settlement files     |
|     - Match each transaction by processor reference ID     |
|     - Verify amounts match                                 |
|                                                            |
|  3. Bank Reconciliation (daily)                            |
|     Our settlement records <-> Bank account statements     |
|     - Verify deposits match expected settlements           |
|     - Flag missing or unexpected deposits                  |
|                                                            |
+-----------------------------------------------------------+
```

### 每日批量对账流程

```
   02:00 UTC                    04:00 UTC                  06:00 UTC
      |                            |                          |
      v                            v                          v
+------------+            +----------------+          +--------------+
| 1. Fetch   |            | 3. Compare     |          | 5. Generate  |
| processor  |            | records using  |          | report and   |
| settlement |            | fuzzy matching |          | alert on     |
| files      |            | (amount, date, |          | discrepancies|
+-----+------+            | reference)     |          +------+-------+
      |                   +-------+--------+                 |
      v                           |                          v
+-----+------+                    v                  +-------+-------+
| 2. Load    |            +------+--------+          | 6. Auto-      |
| into       |            | 4. Categorize |          | resolve known |
| staging    |            | discrepancies |          | patterns,     |
| tables     |            |  - Missing    |          | escalate      |
+------------+            |  - Amount diff|          | unknowns      |
                          |  - Extra txns |          +---------------+
                          +---------------+
```

### 差异处理

```
Discrepancy Type        Auto-Resolution                   Escalation
-----------------       ---------------------------       ---------------
Timing difference       Wait 24h, re-reconcile            If persists > 48h
Amount mismatch < $1    Log and accept (rounding)         If > $1
Missing in processor    Re-query processor API            If still missing
Missing in our system   Create reconciliation entry       Always escalate
Duplicate in processor  Verify idempotency, dedup         If amounts differ
Currency mismatch       Apply exchange rate at txn time   If rate diff > 1%
```

---

## 11. 可靠性和容错

### 外部处理器的 Circuit Breaker

```
                    +---------------------------+
                    |      Circuit Breaker       |
                    |                            |
                    |   States:                  |
                    |   CLOSED -> OPEN -> HALF_OPEN
                    |                            |
                    +---------------------------+

CLOSED (normal):
  - All requests pass through to processor
  - Track failure rate in sliding window (e.g., last 60 seconds)
  - If failure rate > 50% AND > 10 failures: -> OPEN

OPEN (circuit tripped):
  - All requests immediately fail (no call to processor)
  - Return cached error response
  - After timeout (30 seconds): -> HALF_OPEN

HALF_OPEN (testing):
  - Allow 1 request through to test processor
  - If success: -> CLOSED
  - If failure: -> OPEN (reset timeout)

Implementation per payment processor:

Processor          Circuit Breaker Config
-----------        -----------------------------------------------
Visa               Failure threshold: 50%, Window: 60s, Timeout: 30s
Mastercard         Failure threshold: 50%, Window: 60s, Timeout: 30s
ACH                Failure threshold: 30%, Window: 120s, Timeout: 60s
```

### 指数退避重试

```
Attempt    Delay         Total Wait
-------    -----         ----------
1          0             0
2          1s            1s
3          2s            3s
4          4s            7s
5          8s            15s
(max 5 attempts for real-time, with jitter)

Retry policy per error type:
  - Network timeout:      Retry (safe, processor may not have received)
  - 5xx server error:     Retry (transient processor issue)
  - 4xx client error:     Do NOT retry (our request is malformed)
  - Card declined:        Do NOT retry (customer issue)
  - Rate limited (429):   Retry after Retry-After header
```

### 备用支付处理器

```
Primary Processor            Fallback Processor
-----------------            ------------------
Processor A (Visa)    -----> Processor B (Visa)
Processor A (MC)      -----> Processor C (MC)

Routing logic:
  1. Try primary processor
  2. If circuit breaker OPEN, immediately try fallback
  3. If primary fails with retriable error, try fallback
  4. If fallback also fails, enqueue to DLQ
  5. Log processor performance for routing optimization
```

### Dead Letter Queue (DLQ)

```
Normal Queue              DLQ                    Resolution
   |                       |                        |
   | Payment fails         |                        |
   | after all retries     |                        |
   +--------------------->|                        |
   |                       | Monitored by ops       |
   |                       | team + automated       |
   |                       | retry (every 1 hour)   |
   |                       +---------------------->|
   |                       |                        | Manual review
   |                       |                        | if auto-retry
   |                       |                        | fails 3 times
   |                       |                        |
   |                       |  Alert after 24 hours  |
   |                       |  without resolution    |

DLQ contains:
  - Original payment request
  - All retry attempts with timestamps
  - Error details from each attempt
  - Processor responses
  - Current payment state
```

### Event Sourcing 方法

```
Instead of storing only current state, store all events:

Event Store for payment pay_abc123:
+----+---------------------------+-------------------+------------------+
| #  | Event Type                | Timestamp         | Data             |
+----+---------------------------+-------------------+------------------+
| 1  | PaymentCreated            | 2024-01-15 10:00  | amount=5000,     |
|    |                           |                   | currency=usd     |
| 2  | PaymentProcessingStarted  | 2024-01-15 10:00  | processor=visa   |
| 3  | PaymentAuthorized         | 2024-01-15 10:00  | auth_code=ABC123 |
| 4  | PaymentCaptured           | 2024-01-15 10:00  | amount=5000      |
| 5  | PaymentSettled            | 2024-01-16 02:00  | batch=SET_001    |
+----+---------------------------+-------------------+------------------+

Benefits:
  - Complete audit trail (built in)
  - Can rebuild current state from events
  - Can replay events for debugging
  - Supports temporal queries ("what was the state at time T?")
  - Natural fit for payment systems where history matters
```

---

## 12. 安全与合规

### PCI DSS 合规概览

PCI DSS（支付卡行业数据安全标准）有 12 项要求：

```
Requirement Area              Key Actions
--------------------------    -----------------------------------------
1. Network security           Firewalls, DMZ, network segmentation
2. Default passwords          Change all vendor defaults
3. Protect stored data        Encrypt cardholder data, tokenize
4. Encrypt transmission       TLS 1.2+ for all data in transit
5. Anti-malware               Deploy on all systems
6. Secure development         Secure SDLC, code reviews, OWASP top 10
7. Access control             Need-to-know basis, RBAC
8. Authentication             MFA for all admin access, unique IDs
9. Physical security          Restrict datacenter access
10. Logging & monitoring      Track all access to network and data
11. Regular testing           Quarterly vulnerability scans, annual pentest
12. Security policy           Documented and enforced
```

### 卡片数据 Tokenization

```
Customer enters:           Our system stores:
+------------------+       +------------------+
| 4242424242424242 |       | tok_abc123       |
| 12/25            | ----> | last4: 4242      |
| 123              |       | brand: visa      |
+------------------+       | exp: 12/25       |
                           +------------------+

Raw card data NEVER touches our servers.
Client SDK sends card data directly to PCI-compliant vault.
Vault returns a token. We only store and use tokens.

+----------+     +----------+     +----------+
| Client   |---->| PCI Vault|     | Our API  |
| (Browser)|     | (Token   |---->| (Only    |
|          |     |  Service)|     |  sees    |
|          |     |          |     |  tokens) |
+----------+     +----------+     +----------+
     |                                  |
     | Card data                        | Token
     | (encrypted, direct               | (non-sensitive,
     |  to vault via iframe)            |  safe to store)
```

### 加密

```
Data at Rest:
  - AES-256 encryption for all sensitive fields
  - Database-level encryption (TDE)
  - Encrypted backups
  - Key rotation every 90 days
  - HSM (Hardware Security Module) for key management

Data in Transit:
  - TLS 1.3 for all external communication
  - mTLS (mutual TLS) for internal service-to-service
  - Certificate pinning in mobile SDKs
  - HSTS headers enforced
```

### 网络隔离

```
+------------------------------------------------------+
|                    Public Zone                        |
|  +------------+  +------------+                      |
|  | CDN/WAF    |  | API Gateway|                      |
|  +------+-----+  +------+-----+                      |
+---------+---------------+----------------------------+
          |               |
+---------+---------------+----------------------------+
|                   DMZ (Application Zone)              |
|  +------------+  +------------+  +------------+      |
|  | Payment    |  | Merchant   |  | Webhook    |      |
|  | Service    |  | Service    |  | Service    |      |
|  +------+-----+  +------+-----+  +------+-----+     |
+---------+---------------+---------------+------------+
          |               |               |
+---------+---------------+---------------+------------+
|              Restricted Zone (CDE)                    |
|  +------------+  +------------+  +------------+      |
|  | Token Vault|  | HSM        |  | PCI DB     |      |
|  +------------+  +------------+  +------------+      |
|                                                       |
|  (Only PCI-scoped services can access this zone)     |
+------------------------------------------------------+
```

### 审计日志

每个操作都会记录以下信息：

```
{
  "timestamp": "2024-01-15T10:30:00.123Z",
  "event": "payment.status_changed",
  "actor": {
    "type": "system",
    "service": "payment-service",
    "instance": "pay-svc-3a2b"
  },
  "resource": {
    "type": "payment",
    "id": "pay_abc123"
  },
  "changes": {
    "status": {
      "old": "processing",
      "new": "authorized"
    }
  },
  "context": {
    "ip": "203.0.113.45",
    "request_id": "req_xyz789",
    "idempotency_key": "idem_123"
  }
}

Audit logs are:
  - Append-only (immutable)
  - Shipped to separate storage (cannot be tampered with)
  - Retained for 7 years (regulatory requirement)
  - Searchable and queryable for investigations
```

### 速率限制

```
Endpoint                      Limit                   Window
--------------------------    ----------------------  --------
POST /v1/payments             100 req/sec/merchant    1 second
POST /v1/payments/confirm     50 req/sec/merchant     1 second
GET  /v1/payments             500 req/sec/merchant    1 second
POST /v1/refunds              20 req/sec/merchant     1 second
Any endpoint (global)         10,000 req/sec          1 second

Implementation: Token bucket algorithm per merchant API key
Stored in Redis for distributed rate limiting

Response when limited:
  HTTP 429 Too Many Requests
  Retry-After: 1
  {
    "error": {
      "type": "rate_limit_error",
      "message": "Too many requests. Please retry after 1 second."
    }
  }
```

---

## 13. 扩展性

### 按 merchant_id 进行数据库分片

```
Shard assignment: hash(merchant_id) % num_shards

Shard 0             Shard 1             Shard 2             Shard 3
+-----------+       +-----------+       +-----------+       +-----------+
| Merchants |       | Merchants |       | Merchants |       | Merchants |
| A, E, I   |       | B, F, J   |       | C, G, K   |       | D, H, L   |
| Payments  |       | Payments  |       | Payments  |       | Payments  |
| Ledger    |       | Ledger    |       | Ledger    |       | Ledger    |
+-----------+       +-----------+       +-----------+       +-----------+

Why merchant_id?
  - All payment data for a merchant is co-located
  - Most queries are scoped to a single merchant
  - Avoids cross-shard joins for merchant dashboard
  - Even distribution (hash-based)
  - Supports merchant isolation for compliance

Cross-shard queries (rare):
  - Global analytics: Use read replicas with CDC to data warehouse
  - Reconciliation: Run per-shard, then aggregate
```

### 只读副本

```
Write Path (strong consistency):
  Client -> API -> Primary DB (sharded)

Read Path (eventual consistency OK):
  Dashboard/Reports -> Read Replica
  Analytics -> Data Warehouse (via CDC)

                 +------------------+
                 |   Primary DB     |
                 |   (Writes)       |
                 +--------+---------+
                          |
              +-----------+-----------+
              |                       |
     +--------v---------+   +--------v---------+
     | Read Replica 1   |   | Read Replica 2   |
     | (Dashboard)      |   | (API reads)      |
     +------------------+   +------------------+
              |
     +--------v---------+
     | CDC -> Kafka ->   |
     | Data Warehouse    |
     | (Analytics,       |
     |  Reporting)       |
     +------------------+
```

### 异步处理

```
Synchronous (latency-critical):
  - Payment authorization (< 500ms)
  - Payment confirmation
  - Idempotency checks

Asynchronous (throughput-critical):
  - Settlement processing (batch, end-of-day)
  - Webhook delivery (with retries)
  - Reconciliation (daily batch)
  - Fraud analysis (batch ML scoring)
  - Payout generation
  - Report generation
  - Audit log shipping
```

### 基于 Kafka 的事件驱动架构

```
+------------------+          +-------------------+
| Payment Service  |---+      |                   |
+------------------+   |      |                   |
                       +----->| Kafka Cluster     |
+------------------+   |      |                   |
| Subscription Svc |---+      | Topics:           |
+------------------+          |  payments.events  |
                              |  refunds.events   |
                              |  subscriptions    |
                              |  webhooks.outbox  |
                              |  settlements      |
                              |  audit.log        |
                              |                   |
                              +---+---+---+---+---+
                                  |   |   |   |
            +---------------------+   |   |   +------------------+
            |                         |   |                      |
            v                         v   v                      v
    +-------+--------+    +----------+---+--------+    +--------+------+
    | Webhook        |    | Ledger   | Fraud      |    | Reconciliation|
    | Delivery Svc   |    | Service  | Detection  |    | Service       |
    +----------------+    +----------+-------------+   +---------------+

Kafka guarantees:
  - Ordered within partition (partition by payment_id)
  - At-least-once delivery
  - Durable (replicated across brokers)
  - Replayable (configurable retention: 7 days)
```

### 缓存策略

```
Cache Layer          Data Cached               TTL        Invalidation
-----------          -----------------------   --------   ----------------
L1 (In-process)      Merchant config           5 min      Event-driven
L2 (Redis)           Idempotency keys          24 hours   TTL expiry
L2 (Redis)           Rate limit counters       1-60 sec   TTL expiry
L2 (Redis)           Session tokens            30 min     On logout
L2 (Redis)           Fraud rules               10 min     On rule update

NOT cached (always read from DB):
  - Payment state (consistency critical)
  - Ledger entries (audit requirement)
  - Account balances (accuracy critical)
```

---

## 14. 部署架构

### 生产部署

```
                        +------------------+
                        |   Global DNS     |
                        |   (Route 53)     |
                        +--------+---------+
                                 |
                   +-------------+-------------+
                   |                           |
          +--------v---------+        +--------v---------+
          |   Region: US-East|        |   Region: EU-West|
          |   (Primary)      |        |   (DR / EU data) |
          +--------+---------+        +--------+---------+
                   |                           |
          +--------v---------+        +--------v---------+
          |    CloudFront    |        |    CloudFront    |
          |    + WAF         |        |    + WAF         |
          +--------+---------+        +--------+---------+
                   |                           |
          +--------v---------+        +--------v---------+
          |   ALB (Layer 7)  |        |   ALB (Layer 7)  |
          +--------+---------+        +--------+---------+
                   |                           |
     +-------------+-------------+             |
     |             |             |             |
+----v----+  +----v----+  +----v----+   +----v----+
| Payment |  | Payment |  | Payment |   | Payment |
| Svc x6  |  | SubsSvc |  | Webhook |   | Svc x4  |
| (ECS)   |  | x3(ECS) |  | x4(ECS)|   | (ECS)   |
+---------+  +---------+  +---------+   +---------+
     |             |             |             |
+----v-------------v-------------v----+  +----v----+
|         Kafka Cluster (MSK)        |  | Kafka   |
|         (3 brokers, RF=3)          |  | (DR)    |
+----+-------------------------------+  +---------+
     |
+----v-------------------------------+
|     PostgreSQL (RDS Multi-AZ)      |
|     Primary: us-east-1a            |
|     Standby: us-east-1b            |
|     Read Replicas: us-east-1c x2   |
+------------------------------------+
     |
     | Cross-region replication (async)
     v
+----+-------------------------------+
|     PostgreSQL (RDS) - EU-West     |
|     (Read replica / DR standby)    |
+------------------------------------+

Supporting Infrastructure:
+------------------+  +------------------+  +------------------+
| Redis Cluster    |  | ElasticSearch    |  | S3               |
| (ElastiCache)    |  | (Audit search)  |  | (Reconciliation  |
| 6 nodes          |  | 3 nodes         |  |  files, backups) |
+------------------+  +------------------+  +------------------+
```

### 支付处理的 Active-Passive 模式

```
Why NOT active-active for payments?

Problem: If both regions process the same payment simultaneously,
         you get a double charge.

Solution: Active-Passive with fast failover

  US-East (ACTIVE)           EU-West (PASSIVE)
  +----------------+         +----------------+
  | Processes all  |         | Warm standby   |
  | payments       |         | Receives       |
  | Writes to DB   |         | replication    |
  +-------+--------+         +-------+--------+
          |                          |
          | Async replication        |
          +------------------------->|
          |                          |
          | Health check fails       |
          | (> 30s unresponsive)     |
          |                          |
          |    DNS failover          |
          |    (Route 53, 60s TTL)   |
          +------------------------->|
                                     |
                            +--------v--------+
                            | EU-West becomes  |
                            | ACTIVE           |
                            | Promotes replica |
                            | to primary DB    |
                            +-----------------+

Failover time: ~2-3 minutes (DNS propagation + DB promotion)

During failover:
  - New payments queue in the client SDK (retry logic)
  - In-flight payments may need manual reconciliation
  - No double charges (only one region processes at a time)
```

### 欧盟数据驻留 (GDPR)

```
EU customer data must stay in EU:

Request routing:
  1. API Gateway inspects merchant country / customer IP
  2. EU merchants -> EU-West region
  3. US merchants -> US-East region
  4. Payment processing still routes to active region
  5. PII stored only in the designated region
```

---

## 15. 常见面试追问

### 如何处理部分退款？

```
1. Validate: refund_amount <= (captured_amount - already_refunded_amount)
2. Create refund record with partial amount
3. Update payment.amount_refunded += refund_amount
4. Create proportional ledger entries (fees refunded proportionally)
5. Send refund to processor
6. If total_refunded == captured_amount, mark payment as "fully_refunded"
7. Send webhook: charge.refunded

Key consideration: Platform fees may or may not be refunded
  - Stripe refunds fees; some platforms keep fees on refunds
  - This is a business decision encoded in the ledger logic
```

### 如何实现多币种支持？

```
Three approaches:

1. Presentment currency (what customer sees):
   - Customer pays in their local currency (JPY)
   - We convert to merchant settlement currency (USD) at capture time
   - Exchange rate locked at authorization

2. Settlement currency (what merchant receives):
   - Merchant configures their payout currency
   - All conversions happen before settlement

3. Multi-currency accounts:
   - Merchant holds balances in multiple currencies
   - Avoids conversion fees
   - More complex ledger (per-currency accounts)

Exchange rate handling:
  - Lock rate at authorization time (store in payment record)
  - Use rate from trusted provider (e.g., ECB, Open Exchange Rates)
  - Add FX markup (typically 1-2%)
  - Reconcile FX gains/losses in separate ledger account

Ledger impact:
  Debit: customer_funds (JPY 15,000)
  Credit: merchant_balance (USD 100.00) -- at locked rate
  Credit: fx_revenue (USD 1.50)         -- FX markup
  Credit: platform_fees (USD 2.90)      -- processing fee
```

### 如何应对支付处理器宕机？

```
Multi-layered strategy:

1. Circuit Breaker (immediate):
   - Detect failure rate > threshold
   - Stop sending to failed processor
   - Automatic (< 1 second to activate)

2. Processor Failover (seconds):
   - Route to backup processor for same card network
   - Transparent to merchant
   - May have different fee structure (handle in ledger)

3. Queue and Retry (minutes):
   - For non-urgent payments (e.g., subscription renewals)
   - Queue in Kafka, retry when processor recovers
   - Exponential backoff: 1m, 5m, 15m, 1h

4. Merchant Notification (immediate):
   - Webhook: payment_intent.processing_error
   - Dashboard alert with estimated recovery time
   - Suggest alternative payment methods to customer

5. Manual Intervention (hours):
   - Ops team monitors DLQ
   - Can manually re-route or resolve stuck payments
   - Runbook for common processor outage scenarios
```

### 如何实现带按比例计费的订阅计费？

```
Scenario: Customer upgrades from $10/month to $20/month mid-cycle

Current period: Jan 1 - Jan 31
Upgrade date: Jan 16 (15 days remaining)

Proration calculation:
  Unused time on old plan: 15/31 * $10 = $4.84 (credit)
  Remaining time on new plan: 15/31 * $20 = $9.68 (charge)
  Net charge: $9.68 - $4.84 = $4.84

Implementation:
  1. Calculate proration amount
  2. Create invoice line items:
     - Credit: "Unused time on Basic plan" -$4.84
     - Charge: "Remaining time on Pro plan" +$9.68
  3. Net the invoice: $4.84
  4. Charge immediately or add to next invoice (configurable)
  5. Update subscription plan and period
  6. Webhook: invoice.created, customer.subscription.updated

Edge cases:
  - Downgrade: credit exceeds charge -> apply credit to next invoice
  - Upgrade on last day: minimal proration -> charge full new price
  - Trial to paid: no proration, first full charge
  - Multiple changes in one period: recalculate from each change point
```

### 如何在分布式系统中防止重复扣费？

```
Defense in depth (5 layers):

Layer 1: Client-side
  - Disable "Pay" button after click
  - Generate idempotency key on first click, reuse on retries

Layer 2: API Gateway
  - Idempotency key check (Redis, < 1ms)
  - Reject duplicate requests within 24-hour window

Layer 3: Payment Service
  - Database-level unique constraint on (merchant_id, idempotency_key)
  - Optimistic locking with version column on payment record
  - State machine prevents invalid transitions (e.g., captured -> authorized)

Layer 4: Processor Adapter
  - Include our payment_id as processor reference
  - Processor deduplicates on their side using this reference
  - Verify processor response matches our records

Layer 5: Reconciliation
  - Daily batch comparison catches any duplicates that slipped through
  - Alert and auto-refund duplicates found in reconciliation

Combined guarantee:
  Even if layers 1-3 fail simultaneously (extremely unlikely),
  layers 4-5 catch and correct any double charges within 24 hours.
```

### 如何设计商户付款系统？

```
Payout lifecycle:

1. Accumulate: Track merchant balance from captured payments
2. Schedule: Based on merchant's payout schedule (daily/weekly/monthly)
3. Calculate: Sum available balance minus pending refunds and reserves
4. Execute: Initiate bank transfer (ACH/wire)
5. Reconcile: Verify bank confirms receipt

Architecture:

  +------------------+     +------------------+     +-----------------+
  | Payout Scheduler |---->| Payout Calculator|---->| Payout Executor |
  | (Cron: daily)    |     | (Per merchant)   |     | (ACH/Wire)      |
  +------------------+     +------------------+     +-----------------+
                                    |
                                    v
                           +------------------+
                           | Payout Record    |
                           | + Ledger Entries |
                           +------------------+

Balance calculation:
  available_balance = SUM(captured payments)
                    - SUM(refunds)
                    - SUM(chargebacks)
                    - SUM(platform fees)
                    - SUM(pending payouts)
                    - reserve_amount (fraud buffer, typically 5-10%)

Payout states: scheduled -> processing -> paid -> (failed)

Risk controls:
  - Minimum payout threshold ($25)
  - Hold period for new merchants (7-14 days)
  - Fraud reserve percentage (configurable per merchant)
  - Velocity limit on payout frequency changes
  - Manual review for payouts > $50,000
```

---

## 总结速查表

```
+----------------------------+-------------------------------------------+
| Concern                    | Solution                                  |
+----------------------------+-------------------------------------------+
| Exactly-once payments      | Idempotency keys + at-least-once + dedup  |
| Financial accuracy         | Double-entry ledger (append-only)          |
| Payment orchestration      | State machine + saga pattern              |
| Fraud prevention           | Rules + ML scoring + 3DS                  |
| Data integrity             | Event sourcing + reconciliation           |
| High availability          | Multi-AZ + active-passive + circuit break |
| Security                   | PCI DSS + tokenization + encryption       |
| Scale                      | Sharding + Kafka + async processing       |
| Processor resilience       | Circuit breaker + failover + DLQ          |
| Multi-currency             | Lock FX at auth + per-currency ledger     |
| Compliance                 | Audit logs + data residency + RBAC        |
+----------------------------+-------------------------------------------+
```
