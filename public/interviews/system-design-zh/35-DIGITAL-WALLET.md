# 设计数字钱包与账本系统 (PayPal / Venmo / Apple Pay)

---

## 1. 需求澄清

### 功能需求

| # | 需求 | 描述 |
|---|------|------|
| 1 | 钱包创建 | 每个用户注册时获得一个钱包；支持个人和商户账户 |
| 2 | 充值/存款 | 从关联银行 (ACH)、借记卡推送或电汇为钱包充值 |
| 3 | P2P 转账 | 通过邮箱/手机号/用户名即时向另一个钱包用户转账 |
| 4 | 提现 | 从钱包提取资金到关联银行账户 (ACH 或电汇) |
| 5 | 支付 | 向商户付款；钱包扣款，商户钱包或银行入账 |
| 6 | 交易历史 | 分页、可筛选的所有钱包事件账本 |
| 7 | 余额查询 | 实时可用余额及待处理/冻结金额 |
| 8 | 退款与撤销 | 撤销或部分退款已完成的交易 |
| 9 | 多币种 | 持有和兑换不同货币；以用户偏好的货币显示 |
| 10 | 定期支付 | 安排定期转账和长期委托 |
| 11 | 托管 | 为市场交易持有托管资金，满足条件后释放 |
| 12 | 通知 | 每个钱包事件的推送/邮件/短信提醒 |

### 非功能需求

| # | 需求 | 目标 |
|---|------|------|
| 1 | 转账延迟 | P2P 端到端 < 500ms (p99) |
| 2 | 余额准确性 | 100% — 零容错 |
| 3 | 可用性 | 99.999% (每年 < 5.26 分钟停机) |
| 4 | 吞吐量 | 持续 5,000 TPS；峰值 20,000 TPS |
| 5 | 持久性 | 零交易丢失 — write-ahead log + 同步复制 |
| 6 | 审计 | 每次状态变更的完整、不可篡改的历史记录 |
| 7 | 一致性 | 所有余额变更的强一致性 |
| 8 | 幂等性 | 每个操作的 exactly-once 语义 |
| 9 | 合规性 | KYC/AML、PCI-DSS、SOX 审计追踪、GDPR |
| 10 | 加密 | 所有 PII 和金融数据在静态和传输中加密 |

### 规模估算

```
钱包数:               100,000,000 (1亿用户)
每日活跃钱包:          20,000,000 (20% DAU)
每日交易量:            50,000,000 (5千万)
每日交易额:           $10,000,000,000 ($100亿)
平均交易金额:          $200

峰值 TPS (8小时工作日, 3倍平均值):
  50M / 86,400s = ~578 TPS 平均
  峰值 (3x)     = ~1,734 TPS
  闪购活动      = ~20,000 TPS (发薪日, 黑色星期五)

账本条目 (每笔交易2条 — 借记 + 贷记):
  50M * 2 = 每日1亿条账本记录

存储:
  钱包记录:       ~500 bytes  → 100M * 500B = 50 GB
  交易记录:       ~2 KB       → 50M/天 * 2KB = 100 GB/天
  账本条目:       ~500 bytes  → 100M/天 * 500B = 50 GB/天
  审计日志:       ~1 KB       → 200M/天 * 1KB = 200 GB/天

  5年保留:    (100 + 50 + 200) GB * 365 * 5 = ~632 TB 原始数据
  压缩后:     ~150 TB (结构化数据 4:1 压缩)

缓存 (热门钱包):
  前100万钱包 * 200 bytes = 200 MB — 单个 Redis 节点即可容纳
  余额缓存 TTL: 1 秒 (近实时读取)
```

---

## 2. API 设计

### 钱包 API

```
GET    /v1/wallets/me                           获取我的钱包信息和余额
GET    /v1/wallets/{walletId}                   通过 ID 获取钱包 (管理员 / KYC 服务)
POST   /v1/wallets                              创建钱包 (用户注册时内部调用)
PATCH  /v1/wallets/{walletId}/status            冻结/解冻钱包 (合规)
```

**GET /v1/wallets/me 响应:**
```json
{
  "walletId": "wlt_a1b2c3d4",
  "userId": "usr_x9y8z7w6",
  "status": "active",
  "balances": [
    {
      "currency": "USD",
      "available": "1250.00",
      "pending": "50.00",
      "reserved": "0.00",
      "total": "1300.00"
    }
  ],
  "kycTier": 2,
  "dailyLimits": {
    "send": { "limit": "10000.00", "used": "200.00", "currency": "USD" },
    "withdraw": { "limit": "5000.00", "used": "0.00", "currency": "USD" }
  },
  "createdAt": "2023-01-15T10:00:00Z"
}
```

### 转账 API

```
POST   /v1/transfers                            发起 P2P 转账
GET    /v1/transfers/{transferId}               获取转账状态
POST   /v1/transfers/{transferId}/cancel        取消待处理的转账
POST   /v1/transfers/{transferId}/reverse       撤销已完成的转账
```

**POST /v1/transfers 请求:**
```json
{
  "idempotencyKey": "idem_550e8400-e29b-41d4-a716-446655440000",
  "fromWalletId": "wlt_a1b2c3d4",
  "toWalletId": "wlt_e5f6g7h8",
  "amount": "50.00",
  "currency": "USD",
  "description": "Dinner split",
  "metadata": {
    "note": "Thai food last night",
    "tags": ["food", "split"]
  }
}
```

**POST /v1/transfers 响应 (201 Created):**
```json
{
  "transferId": "txn_7a8b9c0d",
  "status": "completed",
  "fromWalletId": "wlt_a1b2c3d4",
  "toWalletId": "wlt_e5f6g7h8",
  "amount": "50.00",
  "currency": "USD",
  "ledgerEntries": [
    { "entryId": "led_001", "accountId": "wlt_a1b2c3d4", "type": "debit", "amount": "50.00" },
    { "entryId": "led_002", "accountId": "wlt_e5f6g7h8", "type": "credit", "amount": "50.00" }
  ],
  "completedAt": "2024-03-01T14:23:01.234Z",
  "idempotencyKey": "idem_550e8400-e29b-41d4-a716-446655440000"
}
```

### 充值与提现 API

```
POST   /v1/topups                               从银行或卡充值钱包
GET    /v1/topups/{topupId}                     获取充值状态
POST   /v1/withdrawals                          提现到关联银行
GET    /v1/withdrawals/{withdrawalId}           获取提现状态
```

**POST /v1/topups 请求:**
```json
{
  "idempotencyKey": "idem_abc123",
  "walletId": "wlt_a1b2c3d4",
  "amount": "500.00",
  "currency": "USD",
  "fundingSource": {
    "type": "debit_card",
    "paymentMethodId": "pm_visa_4242"
  }
}
```

### 账本 API

```
GET    /v1/ledger?walletId=&currency=&from=&to=&page=&limit=
GET    /v1/ledger/{entryId}
```

**GET /v1/ledger 响应:**
```json
{
  "entries": [
    {
      "entryId": "led_001",
      "transactionId": "txn_7a8b9c0d",
      "walletId": "wlt_a1b2c3d4",
      "type": "debit",
      "amount": "50.00",
      "currency": "USD",
      "balanceBefore": "1300.00",
      "balanceAfter": "1250.00",
      "description": "P2P transfer to @alice",
      "createdAt": "2024-03-01T14:23:01.234Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 1450 }
}
```

---

## 3. 数据模型

### 钱包表

```sql
CREATE TABLE wallets (
    wallet_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL UNIQUE,
    wallet_type     VARCHAR(20) NOT NULL,  -- 'personal','business','escrow','platform','fee_pool'
    status          VARCHAR(20) NOT NULL DEFAULT 'active',
                    -- 'active','frozen','suspended','closed'
    kyc_tier        SMALLINT NOT NULL DEFAULT 0,  -- 0=未验证, 1=基础, 2=标准, 3=增强
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_wallet_type CHECK (
        wallet_type IN ('personal','business','escrow','platform','fee_pool')
    )
);

CREATE INDEX idx_wallets_user_id ON wallets(user_id);
CREATE INDEX idx_wallets_status  ON wallets(status);
```

### 钱包余额表 (物化视图, 追加更新)

```sql
CREATE TABLE wallet_balances (
    balance_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id       UUID NOT NULL REFERENCES wallets(wallet_id),
    currency        CHAR(3) NOT NULL,           -- ISO 4217 例如 'USD','EUR'
    available       NUMERIC(20, 8) NOT NULL DEFAULT 0,
    pending         NUMERIC(20, 8) NOT NULL DEFAULT 0,
    reserved        NUMERIC(20, 8) NOT NULL DEFAULT 0,
    version         BIGINT NOT NULL DEFAULT 0,  -- 乐观锁版本号
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_wallet_balance UNIQUE (wallet_id, currency),
    CONSTRAINT non_negative_available CHECK (available >= 0),
    CONSTRAINT non_negative_pending   CHECK (pending >= 0),
    CONSTRAINT non_negative_reserved  CHECK (reserved >= 0)
);

CREATE INDEX idx_wallet_balances_wallet ON wallet_balances(wallet_id);
```

### 交易表

```sql
CREATE TABLE transactions (
    transaction_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key     VARCHAR(255) NOT NULL UNIQUE,
    transaction_type    VARCHAR(30) NOT NULL,
                        -- 'p2p_transfer','topup','withdrawal','payment','refund','reversal','fee'
    status              VARCHAR(20) NOT NULL DEFAULT 'initiated',
                        -- 'initiated','pending','authorized','settled','completed','failed','reversed'
    from_wallet_id      UUID REFERENCES wallets(wallet_id),
    to_wallet_id        UUID REFERENCES wallets(wallet_id),
    amount              NUMERIC(20, 8) NOT NULL,
    currency            CHAR(3) NOT NULL,
    exchange_rate       NUMERIC(20, 8),          -- 跨币种时使用
    base_currency       CHAR(3),                 -- 外汇转换前的原始货币
    base_amount         NUMERIC(20, 8),          -- 外汇转换前的原始金额
    fee_amount          NUMERIC(20, 8) NOT NULL DEFAULT 0,
    description         TEXT,
    reference_id        UUID,                    -- 关联交易 (撤销指向原始交易)
    failure_reason      TEXT,
    metadata            JSONB,
    risk_score          SMALLINT,                -- 0-100, 来自欺诈引擎
    initiated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    authorized_at       TIMESTAMPTZ,
    settled_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    failed_at           TIMESTAMPTZ,
    expires_at          TIMESTAMPTZ,             -- 待处理授权的过期时间

    CONSTRAINT valid_amount CHECK (amount > 0),
    CONSTRAINT valid_fee    CHECK (fee_amount >= 0)
);

CREATE INDEX idx_txn_idempotency    ON transactions(idempotency_key);
CREATE INDEX idx_txn_from_wallet    ON transactions(from_wallet_id, initiated_at DESC);
CREATE INDEX idx_txn_to_wallet      ON transactions(to_wallet_id, initiated_at DESC);
CREATE INDEX idx_txn_status         ON transactions(status) WHERE status NOT IN ('completed','failed');
CREATE INDEX idx_txn_reference      ON transactions(reference_id);
```

### 账本条目表 (Double-Entry Bookkeeping)

```sql
CREATE TABLE ledger_entries (
    entry_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id      UUID NOT NULL REFERENCES transactions(transaction_id),
    wallet_id           UUID NOT NULL REFERENCES wallets(wallet_id),
    account_type        VARCHAR(30) NOT NULL,   -- 'wallet','escrow','fee_pool','platform'
    entry_type          VARCHAR(10) NOT NULL,   -- 'debit' 或 'credit'
    amount              NUMERIC(20, 8) NOT NULL,
    currency            CHAR(3) NOT NULL,
    balance_before      NUMERIC(20, 8) NOT NULL,
    balance_after       NUMERIC(20, 8) NOT NULL,
    description         TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_entry_type CHECK (entry_type IN ('debit','credit')),
    CONSTRAINT valid_amount     CHECK (amount > 0),
    CONSTRAINT balance_after_check CHECK (
        (entry_type = 'debit'  AND balance_after = balance_before - amount) OR
        (entry_type = 'credit' AND balance_after = balance_before + amount)
    )
);

-- 不可变: 不允许 UPDATE 或 DELETE (通过数据库触发器或行级策略强制执行)
CREATE INDEX idx_ledger_transaction ON ledger_entries(transaction_id);
CREATE INDEX idx_ledger_wallet_time ON ledger_entries(wallet_id, created_at DESC);
CREATE INDEX idx_ledger_currency    ON ledger_entries(currency, created_at DESC);
```

### 幂等键表

```sql
CREATE TABLE idempotency_keys (
    idempotency_key     VARCHAR(255) PRIMARY KEY,
    user_id             UUID NOT NULL,
    endpoint            VARCHAR(100) NOT NULL,
    request_hash        CHAR(64) NOT NULL,      -- 请求体的 SHA-256
    response_status     SMALLINT,
    response_body       JSONB,
    transaction_id      UUID,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at          TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours'
);

CREATE INDEX idx_idem_user ON idempotency_keys(user_id);
```

### 审计日志表 (不可变、仅追加)

```sql
CREATE TABLE audit_log (
    log_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type     VARCHAR(50) NOT NULL,   -- 'transaction','wallet','ledger_entry','user'
    entity_id       UUID NOT NULL,
    action          VARCHAR(50) NOT NULL,   -- 'created','status_changed','frozen','reversed'
    actor_id        UUID,                   -- 触发操作的用户或服务
    actor_type      VARCHAR(20),            -- 'user','service','admin','compliance'
    old_state       JSONB,
    new_state       JSONB,
    ip_address      INET,
    user_agent      TEXT,
    request_id      UUID,
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 按月分区以便管理保留策略
CREATE INDEX idx_audit_entity    ON audit_log(entity_type, entity_id, occurred_at DESC);
CREATE INDEX idx_audit_actor     ON audit_log(actor_id, occurred_at DESC);
CREATE INDEX idx_audit_occurred  ON audit_log(occurred_at DESC);
```

### 支付方式表 (银行关联、银行卡)

```sql
CREATE TABLE payment_methods (
    method_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL,
    method_type     VARCHAR(20) NOT NULL,  -- 'bank_account','debit_card','credit_card'
    status          VARCHAR(20) NOT NULL DEFAULT 'pending_verification',
    token           VARCHAR(255) NOT NULL UNIQUE,  -- vault token, 永远不存储原始卡号
    last_four       CHAR(4),
    bank_name       VARCHAR(100),
    routing_number  VARCHAR(9),            -- 静态加密存储
    is_default      BOOLEAN NOT NULL DEFAULT FALSE,
    verified_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pm_user ON payment_methods(user_id);
```

---

## 4. 高层架构

```
+------------------+     +------------------+     +------------------+
|   移动端应用      |     |   Web 客户端      |     |  商户 SDK         |
+--------+---------+     +--------+---------+     +--------+---------+
         |                        |                        |
         +------------------------+------------------------+
                                  |
                          +-------v--------+
                          |  API Gateway   |
                          | (认证, TLS,     |
                          |  限流)          |
                          +-------+--------+
                                  |
              +-------------------+-------------------+
              |                   |                   |
    +---------v------+  +---------v------+  +---------v------+
    | 钱包服务        |  | 转账服务        |  | 充值/提现       |
    | (余额读取,      |  | (P2P, 支付)    |  |    服务         |
    |  KYC 检查)      |  |                |  | (ACH, 银行卡)   |
    +--------+-------+  +--------+-------+  +--------+-------+
             |                   |                   |
             +-------------------+-------------------+
                                  |
                     +------------v-----------+
                     |    账本服务             |
                     | (double-entry 写入,     |
                     |  余额变更,              |
                     |  幂等性检查)            |
                     +------------+-----------+
                                  |
               +------------------+------------------+
               |                  |                  |
     +---------v------+  +--------v-------+  +-------v--------+
     |  主数据库       |  |   只读副本      |  |  账本归档       |
     | (PostgreSQL,   |  | (PostgreSQL    |  |  (冷存储,       |
     |  同步复制)      |  |  流式副本)      |  |  S3/Parquet,   |
     |                |  |                |  |  7年保留)       |
     +----------------+  +----------------+  +----------------+
                                  |
               +------------------+------------------+
               |                  |                  |
     +---------v------+  +--------v-------+  +-------v--------+
     |  Redis 集群    |  |  Kafka 集群    |  |  欺诈引擎       |
     | (余额缓存,     |  | (事件流:       |  | (ML 评分,       |
     |  幂等性,       |  |  交易事件,      |  |  速率检查,      |
     |  限流)         |  |  审计流)        |  |  设备指纹)      |
     +----------------+  +----------------+  +----------------+
                                  |
               +------------------+------------------+
               |                  |                  |
     +---------v------+  +--------v-------+  +-------v--------+
     | 通知服务        |  | 对账服务        |  |  合规服务       |
     | (推送/邮件/     |  | (每日批处理,    |  |  (KYC,         |
     |  短信)          |  |  银行对账单)    |  |  AML, SAR      |
     |                |  |                |  |  报告)          |
     +----------------+  +----------------+  +----------------+
```

### 转账流程时序图

```
Client              API Gateway         Transfer Svc        Ledger Svc          DB
  |                      |                   |                   |               |
  |-- POST /transfers --> |                   |                   |               |
  |                      |-- 认证 + 限流 ---->|                   |               |
  |                      |                   |-- 幂等性检查 ------>|               |
  |                      |                   |                   |-- SELECT key ->|
  |                      |                   |                   |<-- 未找到 ------|
  |                      |                   |-- 欺诈评分 ------> Fraud Engine    |
  |                      |                   |<-- 评分: 12 ----|                   |
  |                      |                   |-- 开始事务 ------->|               |
  |                      |                   |                   |-- BEGIN ------>|
  |                      |                   |                   |-- 锁定 from_wallet (SELECT FOR UPDATE)
  |                      |                   |                   |-- 锁定 to_wallet (SELECT FOR UPDATE)
  |                      |                   |                   |-- 检查余额     |
  |                      |                   |                   |-- INSERT 交易 --|
  |                      |                   |                   |-- INSERT 2条账本条目
  |                      |                   |                   |-- UPDATE from_balance
  |                      |                   |                   |-- UPDATE to_balance
  |                      |                   |                   |-- INSERT 幂等键
  |                      |                   |                   |-- INSERT 审计日志
  |                      |                   |                   |-- COMMIT ------>|
  |                      |                   |<-- 已提交 -------- |               |
  |                      |                   |-- 发布事件 ------> Kafka           |
  |<-- 201 响应 --------- |<-- 响应 ----------|                   |               |
  |                      |                   |                   通知服务          |
  |                      |                   |                   (异步, 推送)     |
```

---

## 5. 深入探讨: Double-Entry Bookkeeping

每笔金融变动都会创建恰好两条账本条目：一条借记和一条等额的贷记。系统始终保持平衡 — 所有账户的借记总额等于贷记总额。

```
账户类型和正常余额:
+------------------+----------------+---------------------------+
| 账户类型          | 正常余额        | 示例                       |
+------------------+----------------+---------------------------+
| 用户钱包          | 贷方 (资产)     | Alice 的 $1,000 余额        |
| 商户钱包          | 贷方 (资产)     | 商店的 $5,000 余额           |
| 托管账户          | 贷方 (资产)     | 市场持有 $200                |
| 平台收入          | 贷方 (负债)     | 平台收益 $50K               |
| 手续费池          | 贷方 (负债)     | 已收手续费 $2K              |
| 暂记账户          | 贷方 (负债)     | 未匹配项目 $0               |
+------------------+----------------+---------------------------+

P2P 转账: Alice 向 Bob 发送 $50
+-----+------------------+--------+--------+
| 序号 | 账户              | 借记    | 贷记    |
+-----+------------------+--------+--------+
|  1  | Alice 的钱包      | $50.00 |        |  <- 借记减少资产
|  2  | Bob 的钱包        |        | $50.00 |  <- 贷记增加资产
+-----+------------------+--------+--------+
     借记总额 = 贷记总额 = $50 (平衡)

带手续费的转账: Alice 向商户支付 $100, $1.50 手续费
+-----+-------------------+---------+---------+
| 序号 | 账户               | 借记     | 贷记     |
+-----+-------------------+---------+---------+
|  1  | Alice 的钱包       | $101.50 |         |
|  2  | 商户钱包            |         | $100.00 |
|  3  | 手续费池            |         |   $1.50 |
+-----+-------------------+---------+---------+
     借记总额 = $101.50  贷记总额 = $101.50 (平衡)
```

### 账本完整性不变量

```sql
-- 不变量: 每笔交易必须平衡 (由对账任务检查)
SELECT
    transaction_id,
    SUM(CASE WHEN entry_type = 'debit'  THEN amount ELSE 0 END) AS total_debits,
    SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE 0 END) AS total_credits,
    SUM(CASE WHEN entry_type = 'debit'  THEN amount ELSE 0 END) -
    SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE 0 END) AS imbalance
FROM ledger_entries
GROUP BY transaction_id
HAVING SUM(CASE WHEN entry_type = 'debit'  THEN amount ELSE 0 END) <>
       SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE 0 END);
-- 预期结果: 零行 (没有不平衡的交易)
```

---

## 6. 深入探讨: 余额模型 — 存储型 vs. 计算型

```
方案 A: 存储型余额 (物化)
+------------------------------------+   +------------------------------------+
|  wallet_balances 行                 |   | + 快速 O(1) 余额读取               |
|  wallet_id | currency | available  |   | + 支持高 TPS                       |
|  wlt_001   | USD      | 1250.00   |   | - 必须与条目原子性更新               |
+------------------------------------+   | - 如果更新有 bug 可能产生漂移        |
                                         | - 需要乐观锁                        |
                                         +------------------------------------+

方案 B: 计算型余额 (账本汇总)
+------------------------------------+   +------------------------------------+
|  SELECT SUM(credit) - SUM(debit)   |   | + 始终权威                          |
|  FROM ledger_entries               |   | + 不可能产生漂移                     |
|  WHERE wallet_id = 'wlt_001'       |   | - O(n) 扫描 — 大规模下太慢          |
+------------------------------------+   | - 难以分片                          |
                                         | - 无法支持 5K TPS 读取              |
                                         +------------------------------------+

选择的方案: 混合型 (存储 + 定期验证)
+------------------------------------------------------------------+
| 运行时: 使用存储型余额进行读写                                       |
|   - 原子更新: UPDATE wallet_balances ... WHERE version = n        |
|   - 如果版本不匹配 -> 重试 (乐观锁)                                 |
|                                                                  |
| 每夜: 将存储型余额与账本汇总进行对账                                  |
|   - SELECT wallet_id, SUM() FROM ledger_entries GROUP BY wallet  |
|   - 与 wallet_balances.available 比较                              |
|   - 对差异发出告警并自动修正 (绝不静默修复)                           |
+------------------------------------------------------------------+
```

---

## 7. 深入探讨: 交易生命周期

```
                         INITIATED (已发起)
                             |
                      fraud_score < 阈值?
                     /                        \
                   是                          否
                    |                           |
                PENDING (待处理)            FAILED (失败)
                    |                       (fraud_reject)
          余额充足?
         /                   \
       是                     否
        |                      |
   AUTHORIZED (已授权)       FAILED (失败)
        |                  (insufficient_funds)
   支付方式
    已确认?
   /          \
 是            否
  |             |
SETTLED       FAILED (失败)
(已结算)      (auth_declined)
  |
所有方已清算?
  /         \
是           否
 |            |
COMPLETED    PENDING (待处理)
(已完成)     (ACH_delay)
              |
         银行确认?
        /            \
      是              否
       |                |
   COMPLETED          FAILED (失败)
   (已完成)           (bank_reject)

状态机转换 (有效路径):
initiated   -> pending, authorized, failed
pending     -> authorized, failed
authorized  -> settled, failed
settled     -> completed, reversed
completed   -> reversed (在撤销窗口期内)
reversed    -> (终态)
failed      -> (终态, 重试会创建新交易)
```

---

## 8. 深入探讨: P2P 转账与资金来源

### 即时余额转账 (双方钱包均有资金)

```
Alice (有余额的钱包) ---[$50]--> Bob (钱包)

步骤 (单个数据库事务, < 100ms):
1. 锁定 Alice 的 wallet_balance 行 (SELECT FOR UPDATE)
2. 锁定 Bob 的 wallet_balance 行 (SELECT FOR UPDATE) [始终先锁定较小的 wallet_id 以防止死锁]
3. 检查 Alice.available >= 50.00
4. INSERT 交易记录 (status='authorized')
5. INSERT 账本条目: Alice DEBIT $50, 记录 balance_before/after
6. INSERT 账本条目: Bob CREDIT $50, 记录 balance_before/after
7. UPDATE Alice.available = available - 50, version++
8. UPDATE Bob.available = available + 50, version++
9. UPDATE 交易状态 = 'completed'
10. COMMIT

总耗时: ~50ms 数据库往返
```

### ACH 资金转账 (银行 -> 钱包 -> 收款人)

```
Alice (余额不足) + 银行账户 ---[$500]--> Bob

第0天:
  Alice 发起 $500 转账
  系统创建 ACH 拉取请求, 从 Alice 的银行拉取 $500
  Alice 的 wallet.pending += $500 (已预留, 不可用)
  转账状态为 status='pending'
  Bob 在动态中看到 "待处理 $500"

第2天 (ACH 结算):
  银行确认 $500 已清算
  Alice 的 wallet.pending -= $500, available += $500 (短暂过渡)
  原子转账: Alice -$500, Bob +$500
  状态 = 'completed'

ACH 时间线:
  标准: 2-3 个工作日
  当日 ACH (NACHA): 东部时间下午5点前
  通过借记卡推送即时到账 (Visa Direct / MC Send): < 30 分钟
```

---

## 9. 深入探讨: 充值与提现

### 充值流程

```
1. 借记卡推送 (Visa Direct / MC Send) — 最快
   客户选择借记卡 -> API 对卡进行 tokenize -> Vault 返回 token
   Transfer Service -> 卡处理器 (收单) -> 发卡行授权
   成功后: wallet.available += amount, 创建账本条目
   到账时间: < 30 分钟
   手续费: ~1.5% 交换费

2. ACH 银行转账 (拉取) — 标准
   用户关联银行 (Plaid OAuth 或小额存款验证)
   通过银行通道 (FedACH / NACHA) 发起 ACH 拉取
   资金在结算前保存在暂记账户中
   第0天: wallet.pending += amount
   第2天: ACH 结算, 从暂记账户转入 wallet.available
   时间: 2-3 个工作日
   手续费: ~$0.25-1.00 固定费用

3. 电汇 — 大额
   银行发起电汇到我们的银行账户
   资金团队通过参考号将入账电汇匹配到钱包
   手动或通过参考代码自动匹配
   时间: 当日 (国内), 1-2 天 (国际 SWIFT)
   手续费: $15-30 固定费用

充值状态流:
  CREATED -> PROCESSING -> PENDING -> SETTLED -> COMPLETED
                       \-> FAILED (余额不足, 拒绝, 银行错误)
```

### 提现流程

```
提现: 钱包 -> 银行 (ACH Push)
  用户请求提现
  欺诈检查: 异常金额、新银行、频率
  冻结资金: wallet.available -= amount, reserved += amount
  将 ACH 推送排队到用户的银行 (发起存款金融机构)
  状态: PENDING -> PROCESSING -> SETTLED -> COMPLETED
  失败时 (无效路由号): 将资金退回 available

当日 vs 标准:
  标准 ACH 推送: T+1 到 T+2 个工作日
  当日 ACH: 在东部时间下午 2:45 截止前提交, 下午5点前入账
  手续费: 对用户免费 (平台成本: ~$0.25)

银行账户关联验证:
  方案 A: 小额存款 (1-3 天)
    平台发送 2 笔小额存款 ($0.01-$0.99)
    用户确认两笔金额
    银行账户状态: 已验证

  方案 B: Plaid OAuth 即时验证
    用户通过应用内 OAuth 登录银行
    Plaid 在获得授权后返回账户/路由号
    即时 — 无需小额存款
    手续费: 每次关联 ~$0.50-2.00
```

---

## 10. 深入探讨: 幂等性与 Exactly-Once 语义

```
问题: 数据库提交后网络超时
  客户端发送 POST /transfers
  服务器处理, 提交到数据库, 发送响应
  网络在客户端收到响应前断开
  客户端重试 -> 重复转账?

解决方案: Idempotency Key

请求头: Idempotency-Key: idem_550e8400-e29b-41d4-a716-446655440000

服务器算法:
+------------------------------------------------------------------------+
| 1. 从请求头提取 idempotency key                                         |
| 2. 计算请求体的 SHA-256                                                  |
| 3. SELECT * FROM idempotency_keys WHERE key = ?                        |
|    a. 未找到: 继续处理 (先 INSERT key, in_flight)                        |
|    b. 找到 + 相同 body hash + 已完成: 返回缓存的响应                      |
|    c. 找到 + 不同 body hash: 返回 422 (请求冲突)                         |
|    d. 找到 + in_flight: 返回 409 (请求处理中, 稍后重试)                   |
| 4. 处理交易                                                              |
| 5. UPDATE idempotency_keys SET response = ?, status = 'completed'     |
|    WHERE key = ?                                                        |
+------------------------------------------------------------------------+

关键特性:
  - 键按用户范围限定 (user_id + key = 唯一对)
  - 键在 24 小时后过期
  - in-flight 保护防止并发重复请求
  - 每个键的响应只缓存一次

基于 Redis 的 in-flight 保护锁:
  SET "idem:{key}" "processing" EX 30 NX
  如果 SET 返回 nil -> 另一个请求正在处理此键
  提交后 -> 更新 Postgres + 释放 Redis 锁
```

---

## 11. 深入探讨: 并发控制

### 乐观锁用于余额更新

```sql
-- 读取余额和版本号
SELECT available, version
FROM wallet_balances
WHERE wallet_id = 'wlt_001' AND currency = 'USD';
-- 返回: available=1000.00, version=42

-- 带版本检查的更新 (乐观锁)
UPDATE wallet_balances
SET
    available = available - 50.00,
    version   = version + 1,
    updated_at = NOW()
WHERE
    wallet_id = 'wlt_001'
    AND currency = 'USD'
    AND version = 42              -- 如果版本已变更, UPDATE 影响 0 行
    AND available >= 50.00;       -- 防止变为负数

-- 检查受影响的行数
-- 1 行: 成功
-- 0 行: 冲突 (最多重试 3 次, 指数退避)
```

### 悲观锁 (SELECT FOR UPDATE) — 用于 P2P

```sql
-- 在转账服务中, 可序列化事务内:
BEGIN;

-- 按确定性顺序锁定两个钱包 (较小的 UUID 优先) 以防止死锁
SELECT available, version
FROM wallet_balances
WHERE wallet_id IN ('wlt_001', 'wlt_002') AND currency = 'USD'
ORDER BY wallet_id
FOR UPDATE;                 -- 已获取行级锁

-- 验证
-- ... 各种检查 ...

-- 在同一事务中写入两者
UPDATE wallet_balances SET available = available - 50 WHERE wallet_id = 'wlt_001';
UPDATE wallet_balances SET available = available + 50 WHERE wallet_id = 'wlt_002';

COMMIT;
```

### 死锁预防

```
规则: 始终按 wallet_id 升序获取钱包锁
  转账 A: wlt_001 -> wlt_002 先获取 wlt_001 的锁, 然后 wlt_002
  转账 B: wlt_002 -> wlt_001 先获取 wlt_001 的锁 (阻塞), 然后 wlt_002
  没有循环等待 -> 没有死锁

数据库隔离级别: REPEATABLE READ (PostgreSQL 默认)
对于关键转账: SERIALIZABLE 隔离级别
  - 检测 REPEATABLE READ 遗漏的写-写冲突
  - 序列化失败 -> 应用程序使用新事务重试
```

---

## 12. 深入探讨: 分布式事务 (跨分片)

### 问题

```
Alice 的钱包在分片 A 上 (按 user_id 分区)
Bob 的钱包在分片 B 上

单个 ACID 事务无法跨越两个数据库分片。
选项:
  1. Two-Phase Commit (2PC) — 强一致性, 低可用性
  2. Saga Pattern — 最终一致性, 高可用性
  3. 单分片路由 — 将两者放在同一分片上
```

### 方案 1: Two-Phase Commit (2PC)

```
Coordinator          Shard A (Alice)      Shard B (Bob)
     |                     |                   |
     |-- PREPARE --------> |                   |
     |-- PREPARE -----------------------> |    |
     |<-- PREPARED -------- |                  |
     |<-- PREPARED ---------------------- |    |
     |-- COMMIT ---------> |                   |
     |-- COMMIT -----------------------> |    |
     |<-- ACK ------------ |                  |
     |<-- ACK ---------------------- |        |

问题:
  - 协调者是单点故障 (阻塞协议)
  - 如果协调者在 PREPARE 之后、COMMIT 之前崩溃: 分片无限期阻塞
  - 高延迟: 最少 2 次网络往返
  - 大多数水平扩展数据库不支持
```

### 方案 2: Saga Pattern (选择的方案)

```
基于编排的 Saga 用于 P2P 转账:

步骤 1: 扣款 Alice (分片 A)
  BEGIN 在分片 A
    锁定 Alice 的余额
    检查资金充足
    扣款 Alice: available -= 50
    INSERT saga_step: {txn_id, step='debit_sender', status='completed'}
  COMMIT 分片 A

  发布事件: "sender_debited" 到 Kafka

步骤 2: 入账 Bob (分片 B) — 由 Kafka 消费者触发
  BEGIN 在分片 B
    入账 Bob: available += 50
    INSERT saga_step: {txn_id, step='credit_receiver', status='completed'}
  COMMIT 分片 B

  发布事件: "transfer_completed"

补偿 (如果步骤 2 在步骤 1 之后失败):
  消费 "credit_failed" 事件
  BEGIN 在分片 A
    退款 Alice: available += 50
    UPDATE saga_step: step='debit_sender', status='compensated'
  COMMIT 分片 A
  将交易标记为 FAILED 并说明原因

+-------------------------------------------------------------+
| Saga 步骤表                                                  |
| saga_id | txn_id | step             | status | created_at  |
| uuid    | uuid   | 'debit_sender'   | done   | 2024-...    |
| uuid    | uuid   | 'credit_receiver'| done   | 2024-...    |
+-------------------------------------------------------------+
```

### 避免跨分片 (平台级钱包)

```
Saga 的替代方案: 通过平台钱包路由所有转账

Alice (分片 A)  ->  平台钱包 (分片 P)  ->  Bob (分片 B)

步骤 1: BEGIN 在分片 A — 扣款 Alice $50, 入账平台 $50。COMMIT。
步骤 2: BEGIN 在分片 B — 扣款平台 $50, 入账 Bob $50。COMMIT。

平台钱包 = 内部清算账户
  - 每步都是单分片 (简单 ACID)
  - 平台钱包余额保持接近零 (借贷相等)
  - 步骤 2 失败时平台钱包有 +$50, 通过退款给 Alice 补偿
  - 比 Saga 简单, 但引入平台作为中间方
```

---

## 13. 深入探讨: 对账

```
对账在每天 UTC 02:00 运行

内部账本对账:
+------------------------------------------------------------------+
| 对于每个钱包:                                                      |
|   computed_balance = SELECT SUM(credit_amount) - SUM(debit_amt)  |
|                      FROM ledger_entries WHERE wallet_id = ?     |
|   stored_balance = SELECT available FROM wallet_balances WHERE   |
|                    wallet_id = ?                                 |
|   if abs(computed - stored) > $0.01:                             |
|     INSERT discrepancy_report                                     |
|     告警值班工程师                                                  |
|     不自动修正 (需要人工审核)                                        |
+------------------------------------------------------------------+

银行对账单对账:
+------------------------------------------------------------------+
| 银行每日发送 MT940 / BAI2 对账单                                    |
| 对账服务:                                                          |
|   1. 解析银行文件, 提取所有贷记/借记                                  |
|   2. 将每条银行记录与内部 ACH 记录匹配                                |
|   3. 已匹配的: 标记 settlement = confirmed                         |
|   4. 未匹配的内部记录:                                              |
|      -> 银行尚未结算 (次日检查)                                      |
|      -> 3 天后: 标记为 EXCEPTION, 升级处理                           |
|   5. 未匹配的银行项目:                                              |
|      -> 意外贷记: 存入暂记账户                                       |
|      -> 意外借记: 可能未授权, 冻结 + 告警                             |
+------------------------------------------------------------------+

对账报告模式:
  - run_id, run_date, status
  - total_wallets_checked, discrepancies_found
  - bank_credits_matched, bank_credits_unmatched
  - bank_debits_matched, bank_debits_unmatched
  - exception_list (wallet_id, expected, actual, delta)
```

---

## 14. 深入探讨: 欺诈检测

```
多层欺诈防御:

第 1 层: 基于规则 (同步, < 10ms)
+-------------------------------------------+
| 速率检查 (Redis 计数器):                    |
|   - 过去 1 小时交易量 > 10                  |
|   - 过去 24 小时金额 > $5,000              |
|   - 登录失败次数 > 5                       |
|   - 过去一天唯一收款人 > 20                 |
|                                            |
| 硬性规则 (即时拒绝):                        |
|   - 被制裁国家 IP                           |
|   - 已知欺诈设备指纹                        |
|   - 向自己的钱包转账                        |
|   - 相同金额 + 收款人 < 10秒               |
+-------------------------------------------+

第 2 层: ML 评分 (同步, < 50ms)
+-------------------------------------------+
| 特征:                                      |
|   - 用户行为图谱 (图嵌入)                   |
|   - 交易金额 vs. 用户历史                   |
|   - 地理速率 (30分钟内纽约到伦敦?)          |
|   - 设备信任评分                            |
|   - 时间异常                               |
|   - 网络分析 (欺诈团伙检测)                 |
|                                            |
| 模型: Gradient boosting + 神经网络          |
| 评分: 0-100 (100 = 最高风险)               |
|   0-30:   自动通过                         |
|  30-70:   升级认证 (2FA, 自拍)              |
|  70-90:   人工审核                         |
|  90-100:  自动拒绝                         |
+-------------------------------------------+

第 3 层: 交易后 (异步, 持续)
+-------------------------------------------+
| 将交易事件流式传输到 Flink 任务              |
| 模式检测:                                   |
|   - 结构化拆分 (多笔刚好低于                 |
|     $10K 阈值的交易 -> SAR 触发)            |
|   - 快速转账链 (分层)                       |
|   - 拆分转账 (在多个账户间分散)              |
| 操作: 冻结钱包, 升级到 AML                  |
+-------------------------------------------+

设备指纹:
  浏览器: canvas 指纹, 字体枚举, WebGL
  移动端: 设备 ID, 硬件认证 (SafetyNet/DeviceCheck)
  信号: 屏幕分辨率, 时区, 已安装应用 (子集)
  存储: FingerprintJS hash -> Redis 中的设备信任评分
```

---

## 15. 深入探讨: KYC/AML 合规

```
KYC 等级和限额:

+--------+------------------------+----------------+-------------------------+
| 等级    | 要求                    | 每日发送限额    | 年度交易量                 |
+--------+------------------------+----------------+-------------------------+
| 0      | 仅邮箱验证              | $500           | $3,000                  |
| 1      | 姓名 + 出生日期 + 地址   | $2,500         | $15,000                 |
| 2      | + 政府 ID 扫描          | $10,000        | $50,000                 |
| 3      | + 自拍活体检测           | $50,000        | 无限制                   |
| 商户   | + EIN + 公司章程         | $250,000       | 无限制                   |
+--------+------------------------+----------------+-------------------------+

KYC 流程:
  用户提交证件 (正反面照片) + 自拍
  -> OCR 提取: 姓名, 出生日期, 证件号, 有效期
  -> 活体检测 (防欺骗, 眨眼/转头检测)
  -> OFAC / 制裁名单检查 (PEP, SDN)
  -> 身份验证供应商 (Jumio, Onfido, Persona)
  -> 风险分类 (低/中/高)
  -> 更新钱包中的 kyc_tier

AML 交易监控:
  CTR: 货币交易报告 (>$10,000 等价现金)
  SAR: 可疑活动报告
    - 结构化拆分模式
    - 异常地理位置
    - 高风险交易对手
    - 快速资金流动

  SAR 申报工作流:
    ML 模型标记交易 -> 合规队列
    合规官审核 (5个工作日窗口)
    如确认可疑: 30 天内向 FinCEN 提交 SAR
    通知禁令: 不能告知客户关于 SAR 的信息

监管冻结:
  类型: 'suspicious_activity', 'court_order', 'ofac_match', 'chargebacks'
  wallet.status -> 'frozen'
  所有出站交易被拒绝
  入站交易被接受但冻结
  解除: 合规官操作或法院令解除
```

---

## 16. 深入探讨: 多币种支持

```
货币架构:

+------------------------------------------------------------------+
|  钱包可以持有多个货币子余额                                         |
|  wallet_balances: (wallet_id='wlt_001', currency='USD', ...)     |
|  wallet_balances: (wallet_id='wlt_001', currency='EUR', ...)     |
|  wallet_balances: (wallet_id='wlt_001', currency='GBP', ...)     |
+------------------------------------------------------------------+

汇率服务:
  - 从多个供应商获取汇率 (ECB, Bloomberg, XE)
  - 汇总并标准化为美元基准
  - 发布到 Redis, TTL = 60 秒
  - 汇率存储在 exchange_rates 表中, 带时间戳
  - 历史交易: 汇率在 transaction_time 时锁定

交易时外汇转换:
  用户发送 50 EUR 给持有 USD 的用户

  1. 获取 EUR/USD 汇率: 1.08 (含点差: 1.08 * 0.995 = 1.074)
  2. 转换: 50 EUR * 1.074 = $53.70 USD
  3. 账本条目:
     借记  Alice EUR 钱包:  50.00 EUR
     贷记  Bob   USD 钱包: $53.70 USD
     贷记  平台 FX 利润: $0.27 (0.5% 点差)
  4. 在交易中存储 exchange_rate, base_currency, base_amount

外汇利润作为收入:
  平台在中间市场汇率基础上加 0.5-2.5% 点差
  这在账本中以贷记到 fee_pool 账户的形式体现
  在用户收据中完全透明 (可选披露)

货币特定精度:
  USD: 2 位小数 (美分)
  JPY: 0 位小数 (无子单位)
  BTC: 8 位小数 (聪)
  所有金额存储为 NUMERIC(20,8) 以处理加密货币
```

---

## 17. 深入探讨: 加密与 Tokenization

```
数据安全层:

1. PAN Tokenization (卡号)
   原始 PAN (4111 1111 1111 1111) 永远不存储在我们的数据库中
   采集时:
     原始 PAN -> PCI Vault (外部: Stripe, Braintree, 或内部 HSM)
     Vault 返回: Token (pm_abc123xyz)
     我们存储 token; vault 处理 PAN

   优点:
     - 数据库泄露不会暴露卡号
     - Token 在 vault 上下文之外无用
     - 减少 PCI-DSS 合规范围

2. 数据库加密 (静态)
   AES-256 用于敏感列 (SSN, 银行账号, 出生日期)
   列级加密, 每个租户单独的密钥
   密钥存储在 HSM (硬件安全模块) 中
   密钥轮换: 每年一次, 无需重新加密 (信封加密)

   信封加密:
     数据加密密钥 (DEK) 加密数据
     密钥加密密钥 (KEK) 在 HSM 中加密 DEK
     轮换 KEK 无需更改 DEK: 只需用新 KEK 重新加密 DEK

3. 传输安全 (传输中)
   TLS 1.3 全面覆盖 (客户端->API, 服务->服务, 服务->数据库)
   移动应用中的证书固定
   内部服务间的 mTLS

4. HSM 密钥管理
   +------------------------------------------+
   | HSM (FIPS 140-2 Level 3 认证)             |
   |   - 根 CA 密钥                            |
   |   - KEK 密钥 (永不离开 HSM)               |
   |   - 签名密钥 (审计日志完整性)              |
   +------------------------------------------+

   HSM 集群: active-active 带硬件故障转移
   所有密钥操作的审计日志

5. 审计日志完整性
   每条审计条目包含 HMAC-SHA256
   密钥: 从 HSM 中根密钥派生的每日 HMAC 密钥
   验证: 每夜任务检查前一天的所有条目
   篡改证据: 任何修改都会使 HMAC 链失效
```

---

## 18. 深入探讨: 审计追踪

```
不可变审计要求:
  谁: actor_id, actor_type (用户/服务/管理员)
  什么: action, entity_type, entity_id, old_state, new_state
  何时: occurred_at (微秒精度)
  何处: ip_address, user_agent, request_id
  为何: 关联到合规事件或用户操作

实现:
  1. 应用程序写入 audit_log 表 (仅追加)
  2. 数据库触发器阻止对 audit_log 的 UPDATE/DELETE:

     CREATE OR REPLACE FUNCTION prevent_audit_modification()
     RETURNS TRIGGER AS $$
     BEGIN
       RAISE EXCEPTION 'audit_log is immutable';
     END;
     $$ LANGUAGE plpgsql;

     CREATE TRIGGER immutable_audit
     BEFORE UPDATE OR DELETE ON audit_log
     FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

  3. Kafka 流: 审计事件也发布到 "audit" topic
  4. S3 归档: Kafka 消费者每小时写入 S3 (Parquet)
  5. WORM 存储: S3 Object Lock (合规模式, 7年保留)
  6. HMAC 链: 每个 S3 文件的哈希包含在下一个文件的头部中

每次交易状态变更的审计:
  initiated   -> 审计: {action:'txn_created', new_state:{status:'initiated', amount:50}}
  authorized  -> 审计: {action:'txn_authorized', old:{status:'initiated'}, new:{status:'authorized'}}
  completed   -> 审计: {action:'txn_completed', old:{status:'authorized'}, new:{status:'completed'}}
  reversed    -> 审计: {action:'txn_reversed', old:{status:'completed'}, new:{status:'reversed'}, actor_type:'user'}

监管报告 (SAR/CTR):
  FinCEN BSA E-Filing: 从审计事件自动生成 XML
  保留期: 最少 5 年 (FINCEN), 7 年 (IRS)
  电子发现: 审计日志可按 entity_id, actor_id, 日期范围查询
```

---

## 19. 扩展策略

### 数据库分片

```
按 wallet_id 分片 (一致性哈希):
  32 个逻辑分片 -> 4 个物理分片组 (每组 8 个逻辑分片)
  每个分片组: 1 主 + 2 同步副本

  分片选择: shard_id = consistent_hash(wallet_id) % 32

  挑战: P2P 转账涉及 2 个分片
  解决方案: Saga pattern (见第 12 节)

  跨分片查询 (余额报告, 对账):
  - 分散-聚合: 并行查询所有分片, 聚合
  - 或: 专用 OLAP 副本 (实时 CDC 到列式存储)

分片映射:
  +----------+-------------+-------------+
  | 分片      | 范围         | 数据库集群   |
  +----------+-------------+-------------+
  | 0-7      | 0x00-0x1F   | Cluster A   |
  | 8-15     | 0x20-0x3F   | Cluster B   |
  | 16-23    | 0x40-0x5F   | Cluster C   |
  | 24-31    | 0x60-0x7F   | Cluster D   |
  +----------+-------------+-------------+
```

### 缓存策略

```
Redis 集群 (3 主, 3 副本):

  余额缓存:
    Key:   balance:{wallet_id}:{currency}
    Value: {available, pending, reserved, version}
    TTL:   1 秒 (激进失效)
    Write-through: 在同一请求中更新缓存 + 数据库
    缓存未命中时: 读取数据库, 填充缓存

  幂等性缓存:
    Key:   idem:{idempotency_key}
    Value: 响应体 (gzip 压缩)
    TTL:   24 小时 (与数据库过期一致)

  欺诈/限流计数器:
    Key:   velocity:{user_id}:{window}
    Type:  Redis sorted set (滑动窗口)
    TTL:   1 小时 (每小时计数器)

  汇率:
    Key:   rate:{from}:{to}
    Value: rate, spread, timestamp
    TTL:   60 秒
```

### 消息队列 (Kafka)

```
Topics:
  wallet.transactions      (按 from_wallet_id 分区, 64 个分区)
  wallet.ledger-entries    (按 wallet_id 分区, 64 个分区)
  wallet.audit-events      (按 entity_id 分区, 32 个分区)
  wallet.notifications     (按 user_id 分区, 32 个分区)
  wallet.reconciliation    (单分区, 有序)
  wallet.fraud-signals     (按 user_id 分区)

消费者组:
  notification-service     -> wallet.transactions (发送推送/邮件)
  fraud-engine             -> wallet.transactions (实时评分)
  audit-archiver           -> wallet.audit-events (写入 S3)
  reconciliation-svc       -> wallet.ledger-entries (每日对账)
  analytics-pipeline       -> 所有 topics -> Flink -> OLAP
```

### 读取扩展

```
只读副本:
  - 每个分片 2 个同步副本 (RPO = 0)
  - 余额读取: 优先主库 (强一致性) 或
    缓存值 (< 1 秒过期对于显示可接受)
  - 交易历史读取: 副本可用 (最终一致性)
  - 合规读取: 始终主库 (不允许过期数据)

CQRS 模式:
  命令 (写): 路由到主数据库
  查询 (读): 路由到只读副本或缓存

  读取模型: 交易历史的反规范化视图
    - 由 Kafka 消费者维护
    - 存储在读取优化的存储中 (Elasticsearch 用于搜索,
      PostgreSQL 副本用于结构化查询)
```

---

## 20. 权衡取舍

| 决策 | 选择的方案 | 替代方案 | 原因 |
|------|-----------|---------|------|
| 余额模型 | 存储型 + 每夜验证 | 从账本计算 | O(1) 读取在 5K TPS 下；漂移由对账捕获 |
| 跨分片转账 | Saga pattern | 2PC | Saga: 更高可用性, 容忍协调者故障; 2PC 在故障时阻塞 |
| 并发控制 | 乐观锁 (OCC) + SELECT FOR UPDATE 用于 P2P | 纯 OCC | P2P 必须跨两行原子操作; OCC 用于单行更新 (充值) |
| 幂等性存储 | Postgres 表 + Redis in-flight | 仅 Redis | Postgres 在 Redis 重启后仍然存在; Redis 防止 in-flight 重复 |
| 账本存储 | 关系型 (PostgreSQL) | Event store (EventStoreDB) | SQL 原生支持 double-entry 约束检查; event sourcing 增加复杂性 |
| 欺诈评分 | 同步 ML (< 50ms) | 异步交易后 | 在资金转移前拒绝欺诈; 异步评分错过实时窗口 |
| 汇率 | Redis 缓存 (60s TTL) | 每次调用实时获取 | 60 秒过期可接受; 每次调用在 5K TPS 下增加延迟和成本 |
| 银行关联 | Plaid OAuth + 小额存款兜底 | 直接输入路由号 | Plaid 即时且安全; 小额存款 = Plaid 不支持的银行的兜底方案 |
| 审计存储 | Postgres 表 + S3 WORM | 不可变账本数据库 (Immudb) | Postgres 熟悉, 触发器强制不可变性; S3 WORM 满足监管保留要求 |
| 分片键 | wallet_id | user_id | 在此模型中相同; wallet_id 将用户的所有货币余额分组在一起 |

---

## 21. 常见面试追问

**问: 你如何确保账本始终保持平衡?**

答: Double-entry bookkeeping 确保每笔交易在一个数据库事务中原子性地创建等额的借记和贷记。每夜对账任务独立地对每笔交易的所有借记和贷记条目求和, 并对任何不平衡发出告警。数据库级别的 `balance_after_check` 约束在写入时也能捕获算术错误。账本是仅追加的 (由数据库触发器强制执行), 因此条目不能被静默修改。

**问: 如果系统在转账过程中崩溃会怎样?**

答: 转账在单个数据库事务内执行。如果进程在 `COMMIT` 之前崩溃, 事务会自动回滚 — 没有部分状态。如果在 `COMMIT` 之后但在响应客户端之前崩溃, 客户端使用相同的 idempotency key 重试, 在 `idempotency_keys` 表中找到已完成的交易, 并收到缓存的响应。不会发生重复转账。

**问: 如果 Alice 的银行 ACH 在她的钱包已扣款后失败, 你如何处理?**

答: 钱包扣款和 ACH 发起是解耦的。当 ACH 发起时, Alice 的 wallet.pending 增加 (资金不可用于消费)。只有在 ACH 确认结算后, pending 才转换为 available。如果 ACH 失败 (余额不足、账户已关闭), pending 金额被释放, 充值被标记为失败。Alice 会收到通知。如果资金已被消费 (通过临时信用额度提供 — 这是平台的风险决策), 平台承担损失, 并可能冻结 Alice 的账户等待追回。

**问: 你如何在峰值事件中扩展到 20,000 TPS?**

答: 多种机制组合使用: (1) Redis 余额缓存减少数据库读取 — 大多数余额检查命中缓存而非数据库。(2) 通过 PgBouncer 进行数据库连接池化, 限制连接开销。(3) 水平分片扩展 — 添加分片组以分配写入负载。(4) CQRS: 写入主库, 从副本或缓存读取。(5) 基于队列的平滑: 以 20K TPS 摄入到 Kafka, 以 5K TPS 从队列处理 — 处理峰值期间用户看到交易 "pending"。(6) 预热: 对于已知事件 (发薪日), 主动扩展数据库连接和 Redis 副本。

**问: 你如何在竞态条件中防止用户花费超出其余额的金额?**

答: `UPDATE wallet_balances SET available = available - 50 WHERE available >= 50` 约束在数据库中原子执行。如果两个并发请求都读取 balance=100 并都尝试扣除 75, 只有一个会成功 — 另一个会看到 0 行被更新 (100-75=25, 第二个: 25-75=-50 违反 CHECK 约束或 WHERE 子句失败)。应用程序重试并返回余额不足错误。

**问: 当发送方和接收方持有不同货币时, 多币种如何工作?**

答: 在交易时, 我们从 Redis 获取当前汇率 (来源于汇率供应商, 每 60 秒刷新)。我们以发送方的货币扣款, 应用外汇汇率 (包括我们的点差利润), 并以接收方的货币入账。两个金额、使用的汇率和利润都永久记录在交易中。利润作为单独的条目贷记到平台 fee_pool 的账本中, 保持 double-entry 平衡。

**问: 你如何处理不同国家的监管合规?**

答: 每个钱包都标记了其管辖区域。限额、KYC 等级要求和交易监控规则从特定管辖区的规则引擎加载。OFAC 制裁筛查在每笔交易上同步运行 (通过预加载的内存列表 < 5ms)。特定国家的报告 (美国 FinCEN 的 SAR, 英国 FCA 的 STR) 由合规服务从审计流生成。对于 GDPR, PII 与交易数据分开存储, 有自己的删除计划 — 交易记录引用 user_id (假名化), PII 存储在身份服务中。

**问: 你如何为市场实现托管?**

答: 市场托管使用专用的 escrow 钱包 (account type = 'escrow')。当买家从卖家购买时, 买家的钱包被扣款, escrow 钱包被入账 (资金被持有)。账本条目同时引用买家交易和卖家交易。在交付确认时 (由买家确认或超时), escrow 钱包被扣款, 卖家的钱包被入账 (减去平台手续费)。在争议或退款时, escrow 被扣款, 买家获得退款。Escrow 释放是幂等的并经过审计。

**问: 你的灾难恢复策略是什么?**

答: RTO < 5 分钟, RPO = 0 秒 (零数据丢失)。架构: 同步复制到同一区域的两个副本 (任何提交在返回应用程序之前需要一个副本的确认)。跨区域异步复制到灾备区域 (< 1 秒延迟)。Kafka topics 跨区域复制。故障转移: 提升同一区域的副本 (秒级), 或故障转移到灾备区域 (分钟级)。账本条目也每小时归档到 S3 (Parquet) — 最坏情况下, 从 S3 快照加上 Kafka 回放恢复。如果存储型余额可疑, 则从账本重新计算余额。

---

*涵盖: double-entry bookkeeping、saga pattern、幂等性、乐观锁、AML/KYC、欺诈检测、多币种、对账、HSM 加密、审计追踪、水平分片。*
