# 设计忠诚度与奖励系统

忠诚度与奖励系统通过为购买和活动奖励积分来激励客户重复消费行为，将会员组织到具有递增权益的等级中，并允许积分兑换奖励。类似 Starbucks Rewards、航空常旅客计划或信用卡积分系统。核心挑战在于构建一个保证不会双重消费的积分账本，同时支持跨合作伙伴网络的高吞吐量赚取和兑换。

---

## 目录

1. [需求澄清](#1-需求澄清)
2. [API 设计](#2-api-设计)
3. [数据模型](#3-数据模型)
4. [高层架构](#4-高层架构)
5. [深入探讨：积分账本](#5-深入探讨积分账本)
6. [深入探讨：赚取规则引擎](#6-深入探讨赚取规则引擎)
7. [深入探讨：等级计算](#7-深入探讨等级计算)
8. [深入探讨：兑换流程](#8-深入探讨兑换流程)
9. [深入探讨：积分过期](#9-深入探讨积分过期)
10. [深入探讨：欺诈防范](#10-深入探讨欺诈防范)
11. [深入探讨：合作伙伴集成](#11-深入探讨合作伙伴集成)
12. [扩展策略](#12-扩展策略)
13. [部署架构](#13-部署架构)
14. [常见面试追问](#14-常见面试追问)
15. [总结](#15-总结)

---

## 1. 需求澄清

### 功能需求

| # | 需求 | 描述 |
|---|------|------|
| 1 | 积分赚取 | 对符合条件的购买和活动奖励积分；支持基础赚取率、倍率和促销奖励 |
| 2 | 积分兑换 | 从目录中兑换奖励（产品、折扣、礼品卡、体验）；支持部分兑换 |
| 3 | 等级管理 | 根据滚动窗口内的符合条件活动将会员分类为等级（如 Silver、Gold、Platinum）；自动升级和降级 |
| 4 | 奖励目录 | 维护一个可兑换奖励目录，包含积分成本、库存、可用时间窗口和资格规则 |
| 5 | 交易历史 | 为会员提供完整的、分页的赚取/兑换/过期/调整事件账本 |
| 6 | 合作伙伴集成 | 与合作商户赚取和消费积分；支持忠诚度计划之间的积分转移 |
| 7 | 积分过期 | 基于可配置策略使未使用的积分过期；在过期前通知会员；在符合条件的活动后延长过期时间 |
| 8 | 余额查询 | 实时积分余额，按积分类型（基础、奖励、促销）和过期日期细分 |
| 9 | 奖励活动 | 限时促销（双倍积分周末、生日奖励、注册奖励） |
| 10 | 账户关联 | 将忠诚度账户关联到支付方式、合作伙伴账户和家庭/家族共享 |

### 非功能需求

| # | 需求 | 目标 |
|---|------|------|
| 1 | 积分��致性 | 零双重消费；余额永远不能为负 |
| 2 | 可用性 | 99.99% 正常运行时间（< 1 小时停机时间/年） |
| 3 | 赚取延迟 | 交易后积分入账 < 500ms（p99） |
| 4 | 兑换延迟 | 兑换确认 < 300ms（p99） |
| 5 | 欺诈防范 | 对每个赚取/兑换事件进行实时欺诈评分 |
| 6 | 可审计性 | 对每次积分变动保持完整、不可变的审计轨迹 |
| 7 | 幂等性 | 重复交易提交不得重复奖励积分 |
| 8 | 可扩展性 | 支持 2 亿会员、每天 5 亿赚取事件、每天 5000 万兑换 |
| 9 | 过期准确性 | 积分必须在正确日期过期，永不提前，最多延迟 1 小时 |
| 10 | 合作伙伴结算 | 与合作伙伴系统每日对账；差异在 24 小时内标记 |

### 容量估算

```
会员数:               200,000,000 (2亿)
每日活跃会员:          40,000,000 (20% DAU)
每日赚取事件:         500,000,000 (5亿) — 包含微赚取（扫描、签到）
每日兑换:              50,000,000 (5000万)
合作伙伴赚取事件:     100,000,000 (每天1亿，跨所有合作伙伴)

TPS（平均）:
  赚取:     500M / 86,400s = ~5,787 TPS
  兑换:      50M / 86,400s = ~579 TPS
  余额:     200M / 86,400s = ~2,315 TPS（余额查询）
  总计:     ~8,700 TPS 平均

峰值 TPS（3倍平均值，集中在8小时窗口）:
  总计: ~26,000 TPS
  闪促活动: ~80,000 TPS（双倍积分日）

存储:
  会员记录:          ~500 bytes  -> 200M * 500B = 100 GB
  积分账本条目:      ~300 bytes  -> 600M/天 * 300B = 180 GB/天
  等级历史记录:      ~200 bytes  -> 10M变更/月 * 200B = 2 GB/月
  奖励目录:          ~2 KB       -> 100K奖励 * 2KB = 200 MB
  合作伙伴交易:      ~400 bytes  -> 100M/天 * 400B = 40 GB/天

  每日写入量: ~220 GB/天
  年度存储:   ~80 TB/年（压缩前）
  压缩后:     ~20 TB/年（结构化数据 4:1 压缩比）

  5年保留: ~100 TB 压缩后

缓存（热数据）:
  活跃会员余额: 40M * 200 bytes = 8 GB — 适合 Redis 集群
  赚取规则:     ~10 MB（内存中）
  等级阈值:     ~1 MB（内存中）
```

---

## 2. API 设计

### 积分赚取 API

```
POST   /v1/earn                                 为交易奖励积分
GET    /v1/earn/preview                         购买前预览积分
```

**POST /v1/earn 请求：**
```json
{
  "idempotencyKey": "earn_550e8400-e29b-41d4-a716-446655440000",
  "memberId": "mbr_a1b2c3d4",
  "transactionId": "txn_x9y8z7w6",
  "partnerId": "ptr_starbucks",
  "amount": "45.50",
  "currency": "USD",
  "category": "food_and_beverage",
  "channel": "in_store",
  "metadata": {
    "storeId": "store_1234",
    "receiptNumber": "R-2024-98765"
  }
}
```

**POST /v1/earn 响应 (201 Created)：**
```json
{
  "earnId": "ern_7a8b9c0d",
  "memberId": "mbr_a1b2c3d4",
  "pointsAwarded": [
    { "type": "base", "points": 91, "rule": "2x_per_dollar_food" },
    { "type": "bonus", "points": 45, "rule": "gold_tier_50pct_bonus" },
    { "type": "promotional", "points": 100, "rule": "happy_hour_2024" }
  ],
  "totalPoints": 236,
  "newBalance": 12480,
  "tierProgress": {
    "currentTier": "gold",
    "qualifyingPoints": 8200,
    "nextTier": "platinum",
    "pointsToNextTier": 1800
  },
  "idempotencyKey": "earn_550e8400-e29b-41d4-a716-446655440000",
  "createdAt": "2024-03-15T14:23:01.234Z"
}
```

### 积分兑换 API

```
POST   /v1/redemptions                          兑换积分换取奖励
POST   /v1/redemptions/hold                     对积分进行临时冻结
POST   /v1/redemptions/{holdId}/confirm         确认冻结的兑换
POST   /v1/redemptions/{holdId}/release         释放冻结的兑换
POST   /v1/redemptions/{redemptionId}/refund    退还兑换（返回积分）
GET    /v1/redemptions/{redemptionId}           获取兑换状态
```

**POST /v1/redemptions 请求：**
```json
{
  "idempotencyKey": "rdm_660e9400-f29c-51e4-b826-557766551111",
  "memberId": "mbr_a1b2c3d4",
  "rewardId": "rwd_coffee_free",
  "pointsCost": 400,
  "quantity": 1,
  "deliveryMethod": "digital_voucher",
  "metadata": {
    "storeId": "store_1234"
  }
}
```

**POST /v1/redemptions 响应 (201 Created)：**
```json
{
  "redemptionId": "red_4e5f6g7h",
  "memberId": "mbr_a1b2c3d4",
  "rewardId": "rwd_coffee_free",
  "pointsDeducted": 400,
  "pointsBreakdown": [
    { "ledgerEntryId": "led_oldest_001", "points": 200, "expiresAt": "2024-06-01" },
    { "ledgerEntryId": "led_oldest_002", "points": 200, "expiresAt": "2024-09-01" }
  ],
  "newBalance": 12080,
  "voucher": {
    "code": "FREE-COFFEE-XK9M2",
    "expiresAt": "2024-04-15T23:59:59Z"
  },
  "status": "confirmed",
  "createdAt": "2024-03-15T14:30:00.000Z"
}
```

### 余额与等级 API

```
GET    /v1/members/{memberId}/balance            获取积分余额及细分
GET    /v1/members/{memberId}/tier               获取当前等级和进度
GET    /v1/members/{memberId}/balance/expiring    获取即将过期的积分
```

**GET /v1/members/{memberId}/balance 响应：**
```json
{
  "memberId": "mbr_a1b2c3d4",
  "totalBalance": 12080,
  "breakdown": {
    "base": 8500,
    "bonus": 2580,
    "promotional": 1000
  },
  "expiringNext30Days": 1200,
  "expiringNext90Days": 3400,
  "lifetimeEarned": 98500,
  "lifetimeRedeemed": 86420,
  "lifetimeExpired": 0,
  "lastActivityAt": "2024-03-15T14:30:00.000Z"
}
```

**GET /v1/members/{memberId}/tier 响应：**
```json
{
  "memberId": "mbr_a1b2c3d4",
  "currentTier": "gold",
  "tierSince": "2024-01-15T00:00:00Z",
  "qualifyingPoints": 8200,
  "qualifyingWindow": {
    "start": "2023-03-15",
    "end": "2024-03-15"
  },
  "nextTier": {
    "name": "platinum",
    "threshold": 10000,
    "pointsNeeded": 1800
  },
  "retainCurrentTier": {
    "threshold": 5000,
    "qualified": true
  },
  "benefits": [
    "50% bonus on all earning",
    "free birthday reward",
    "priority customer support",
    "early access to promotions"
  ],
  "gracePeriodEnd": null
}
```

### 奖励目录 API

```
GET    /v1/rewards?category=&tier=&points_min=&points_max=&page=&limit=
GET    /v1/rewards/{rewardId}
GET    /v1/rewards/{rewardId}/availability
POST   /v1/rewards                              （管理员：创建奖励）
PATCH  /v1/rewards/{rewardId}                   （管理员：更新奖励）
```

**GET /v1/rewards 响应：**
```json
{
  "rewards": [
    {
      "rewardId": "rwd_coffee_free",
      "name": "Free Handcrafted Beverage",
      "category": "food_and_beverage",
      "pointsCost": 400,
      "retailValue": "$7.00",
      "minimumTier": "green",
      "inventory": "unlimited",
      "availability": {
        "startDate": "2024-01-01",
        "endDate": null,
        "dayOfWeek": null,
        "storeIds": null
      },
      "imageUrl": "https://cdn.rewards.com/coffee.png"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 450 }
}
```

### 交易历史 API

```
GET    /v1/members/{memberId}/transactions?type=&from=&to=&page=&limit=
GET    /v1/transactions/{transactionId}
```

**GET /v1/members/{memberId}/transactions 响应：**
```json
{
  "transactions": [
    {
      "transactionId": "led_7a8b9c0d",
      "type": "earn",
      "points": 236,
      "balanceAfter": 12480,
      "description": "Purchase at Starbucks Store #1234",
      "partnerId": "ptr_starbucks",
      "breakdown": [
        { "type": "base", "points": 91 },
        { "type": "bonus", "points": 45 },
        { "type": "promotional", "points": 100 }
      ],
      "createdAt": "2024-03-15T14:23:01.234Z"
    },
    {
      "transactionId": "led_4e5f6g7h",
      "type": "redeem",
      "points": -400,
      "balanceAfter": 12080,
      "description": "Free Handcrafted Beverage",
      "rewardId": "rwd_coffee_free",
      "createdAt": "2024-03-15T14:30:00.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 342 }
}
```

### 合作伙伴 API

```
POST   /v1/partners/earn                        合作伙伴提交赚取事件
POST   /v1/partners/burn                        合作伙伴代表会员兑换
POST   /v1/transfers                            在计划之间转移积分
GET    /v1/partners/{partnerId}/settlement       获取结算摘要
```

---

## 3. 数据模型

### 会员表

```sql
CREATE TABLE members (
    member_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL UNIQUE,
    enrollment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status          VARCHAR(20) NOT NULL DEFAULT 'active',
                    -- 'active','suspended','closed','pending_verification'
    current_tier    VARCHAR(20) NOT NULL DEFAULT 'green',
    tier_since      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    tier_expires    TIMESTAMPTZ,                         -- end of qualification window
    lifetime_earned BIGINT NOT NULL DEFAULT 0,
    lifetime_redeemed BIGINT NOT NULL DEFAULT 0,
    lifetime_expired  BIGINT NOT NULL DEFAULT 0,
    last_activity_at  TIMESTAMPTZ,
    metadata        JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_status CHECK (
        status IN ('active','suspended','closed','pending_verification')
    )
);

CREATE INDEX idx_members_user_id   ON members(user_id);
CREATE INDEX idx_members_tier      ON members(current_tier);
CREATE INDEX idx_members_status    ON members(status);
CREATE INDEX idx_members_activity  ON members(last_activity_at DESC);
```

### 积分余额表（物化汇总）

```sql
CREATE TABLE points_balances (
    balance_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id       UUID NOT NULL REFERENCES members(member_id),
    point_type      VARCHAR(20) NOT NULL,      -- 'base','bonus','promotional'
    available       BIGINT NOT NULL DEFAULT 0,
    held            BIGINT NOT NULL DEFAULT 0,  -- 兑换冻结期间保留的积分
    version         BIGINT NOT NULL DEFAULT 0,  -- 乐观并发控制
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_member_point_type UNIQUE (member_id, point_type),
    CONSTRAINT non_negative_available CHECK (available >= 0),
    CONSTRAINT non_negative_held     CHECK (held >= 0)
);

CREATE INDEX idx_balances_member ON points_balances(member_id);
```

### 积分账本表（double-entry，不可变）

```sql
CREATE TABLE points_ledger (
    entry_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id           UUID NOT NULL REFERENCES members(member_id),
    idempotency_key     VARCHAR(255) NOT NULL,
    entry_type          VARCHAR(20) NOT NULL,
                        -- 'earn','redeem','expire','adjust','transfer_in',
                        -- 'transfer_out','hold','release','refund'
    point_type          VARCHAR(20) NOT NULL,  -- 'base','bonus','promotional'
    points              BIGINT NOT NULL,       -- 正数为贷记，负数为借记
    balance_before      BIGINT NOT NULL,
    balance_after       BIGINT NOT NULL,
    source_type         VARCHAR(30),           -- 'purchase','activity','partner','campaign','admin'
    source_id           VARCHAR(255),          -- transaction_id, campaign_id 等
    partner_id          UUID,
    earning_rule_id     UUID,
    reward_id           UUID,
    expires_at          TIMESTAMPTZ,           -- 这些赚取的积分何时过期
    description         TEXT,
    metadata            JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_entry_type CHECK (
        entry_type IN ('earn','redeem','expire','adjust',
                       'transfer_in','transfer_out','hold','release','refund')
    ),
    CONSTRAINT balance_consistency CHECK (balance_after = balance_before + points)
);

-- 不可变：不允许 UPDATE 或 DELETE（由数据库触发器强制执行）
CREATE UNIQUE INDEX idx_ledger_idempotency ON points_ledger(idempotency_key);
CREATE INDEX idx_ledger_member_time        ON points_ledger(member_id, created_at DESC);
CREATE INDEX idx_ledger_member_type        ON points_ledger(member_id, entry_type);
CREATE INDEX idx_ledger_expiration         ON points_ledger(expires_at)
    WHERE entry_type = 'earn' AND expires_at IS NOT NULL;
CREATE INDEX idx_ledger_partner            ON points_ledger(partner_id, created_at DESC);
CREATE INDEX idx_ledger_source             ON points_ledger(source_type, source_id);
```

### 积分批次表（FIFO 过期跟踪）

```sql
CREATE TABLE point_lots (
    lot_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id       UUID NOT NULL REFERENCES members(member_id),
    ledger_entry_id UUID NOT NULL REFERENCES points_ledger(entry_id),
    point_type      VARCHAR(20) NOT NULL,
    original_points BIGINT NOT NULL,
    remaining_points BIGINT NOT NULL,
    earned_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ,              -- NULL 表示永不过期
    status          VARCHAR(20) NOT NULL DEFAULT 'active',
                    -- 'active','partially_used','fully_used','expired'
    version         BIGINT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT non_negative_remaining CHECK (remaining_points >= 0),
    CONSTRAINT remaining_le_original  CHECK (remaining_points <= original_points)
);

CREATE INDEX idx_lots_member_active  ON point_lots(member_id, expires_at ASC)
    WHERE status IN ('active','partially_used');
CREATE INDEX idx_lots_expiring       ON point_lots(expires_at)
    WHERE status IN ('active','partially_used') AND expires_at IS NOT NULL;
CREATE INDEX idx_lots_member_type    ON point_lots(member_id, point_type);
```

### 等级表

```sql
CREATE TABLE tiers (
    tier_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tier_name       VARCHAR(50) NOT NULL UNIQUE,  -- 'green','silver','gold','platinum'
    tier_level      SMALLINT NOT NULL UNIQUE,      -- 0, 1, 2, 3（用于排序）
    qualification_threshold BIGINT NOT NULL,        -- 所需的资格积分
    retention_threshold     BIGINT NOT NULL,        -- 续期时保留等级所需的积分
    earning_multiplier      NUMERIC(4,2) NOT NULL DEFAULT 1.00,
    benefits        JSONB NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 种子数据
INSERT INTO tiers (tier_name, tier_level, qualification_threshold, retention_threshold, earning_multiplier, benefits) VALUES
('green',    0,     0,     0, 1.00, '["basic_rewards","birthday_treat"]'),
('silver',   1,  2000,  1500, 1.25, '["25%_bonus_earning","free_drink_upgrade","monthly_double_points_day"]'),
('gold',     2,  5000,  4000, 1.50, '["50%_bonus_earning","free_birthday_reward","priority_support","early_promos"]'),
('platinum', 3, 10000,  8000, 2.00, '["100%_bonus_earning","concierge_service","partner_lounge_access","annual_gift"]');
```

### 等级历史表

```sql
CREATE TABLE tier_history (
    history_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id       UUID NOT NULL REFERENCES members(member_id),
    previous_tier   VARCHAR(20) NOT NULL,
    new_tier        VARCHAR(20) NOT NULL,
    change_type     VARCHAR(20) NOT NULL,      -- 'upgrade','downgrade','renewal','grace'
    qualifying_points BIGINT NOT NULL,
    window_start    DATE NOT NULL,
    window_end      DATE NOT NULL,
    reason          TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tier_history_member ON tier_history(member_id, created_at DESC);
```

### 赚取规则表

```sql
CREATE TABLE earning_rules (
    rule_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_name       VARCHAR(100) NOT NULL,
    rule_type       VARCHAR(30) NOT NULL,
                    -- 'spend_based','activity_based','partner','campaign','signup'
    partner_id      UUID,
    category        VARCHAR(50),               -- 购买类别过滤
    channel         VARCHAR(30),               -- 'in_store','online','app','partner'
    base_rate       NUMERIC(10,4) NOT NULL,    -- 每单位积分（例如每 $1 2 积分）
    rate_unit       VARCHAR(20) NOT NULL,      -- 'per_dollar','per_transaction','flat'
    min_transaction NUMERIC(10,2),             -- 最低符合条件金额
    max_points_per_txn BIGINT,                 -- 每笔交易上限
    max_points_per_day BIGINT,                 -- 每日上限
    point_type      VARCHAR(20) NOT NULL DEFAULT 'base',
    tier_multipliers JSONB,                    -- {"silver":1.25,"gold":1.5,"platinum":2.0}
    priority        SMALLINT NOT NULL DEFAULT 100,
    is_stackable    BOOLEAN NOT NULL DEFAULT true,
    effective_from  TIMESTAMPTZ NOT NULL,
    effective_to    TIMESTAMPTZ,               -- NULL 表示无结束日期
    status          VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_rule_type CHECK (
        rule_type IN ('spend_based','activity_based','partner','campaign','signup')
    )
);

CREATE INDEX idx_rules_active ON earning_rules(status, effective_from, effective_to)
    WHERE status = 'active';
CREATE INDEX idx_rules_partner ON earning_rules(partner_id)
    WHERE partner_id IS NOT NULL;
CREATE INDEX idx_rules_category ON earning_rules(category);
```

### 奖励表

```sql
CREATE TABLE rewards (
    reward_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    category        VARCHAR(50) NOT NULL,
    points_cost     BIGINT NOT NULL,
    retail_value    NUMERIC(10,2),
    minimum_tier    VARCHAR(20) NOT NULL DEFAULT 'green',
    inventory_type  VARCHAR(20) NOT NULL,     -- 'unlimited','limited','daily_limited'
    total_inventory BIGINT,                   -- 无限制时为 NULL
    remaining_inventory BIGINT,
    daily_limit     BIGINT,                   -- 每位会员每日兑换限制
    delivery_method VARCHAR(30) NOT NULL,     -- 'digital_voucher','physical','discount','experience'
    partner_id      UUID,
    image_url       TEXT,
    available_from  TIMESTAMPTZ NOT NULL,
    available_to    TIMESTAMPTZ,
    status          VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT positive_cost CHECK (points_cost > 0)
);

CREATE INDEX idx_rewards_active ON rewards(status, available_from, available_to)
    WHERE status = 'active';
CREATE INDEX idx_rewards_category ON rewards(category, points_cost);
CREATE INDEX idx_rewards_tier ON rewards(minimum_tier);
```

### 兑换表

```sql
CREATE TABLE redemptions (
    redemption_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key VARCHAR(255) NOT NULL UNIQUE,
    member_id       UUID NOT NULL REFERENCES members(member_id),
    reward_id       UUID NOT NULL REFERENCES rewards(reward_id),
    points_cost     BIGINT NOT NULL,
    quantity        SMALLINT NOT NULL DEFAULT 1,
    status          VARCHAR(20) NOT NULL DEFAULT 'pending',
                    -- 'pending','held','confirmed','fulfilled','refunded','cancelled','expired'
    hold_expires_at TIMESTAMPTZ,              -- 用于两阶段兑换
    voucher_code    VARCHAR(50),
    fulfillment_data JSONB,
    refund_reason   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmed_at    TIMESTAMPTZ,
    fulfilled_at    TIMESTAMPTZ,
    refunded_at     TIMESTAMPTZ,

    CONSTRAINT positive_quantity CHECK (quantity > 0)
);

CREATE INDEX idx_redemptions_member ON redemptions(member_id, created_at DESC);
CREATE INDEX idx_redemptions_status ON redemptions(status)
    WHERE status IN ('pending','held','confirmed');
CREATE INDEX idx_redemptions_hold   ON redemptions(hold_expires_at)
    WHERE status = 'held';
```

### 合作伙伴表

```sql
CREATE TABLE partners (
    partner_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_name    VARCHAR(200) NOT NULL,
    partner_type    VARCHAR(30) NOT NULL,      -- 'earn','burn','earn_and_burn','transfer'
    api_key_hash    VARCHAR(128) NOT NULL,
    webhook_url     TEXT,
    earn_rate       NUMERIC(10,4),             -- 在合作伙伴消费每美元赚取的积分
    burn_rate       NUMERIC(10,4),             -- 合作伙伴消费每积分的美元价值
    conversion_rate NUMERIC(10,6),             -- 用于计划之间积分转移
    settlement_frequency VARCHAR(20) NOT NULL DEFAULT 'daily',
    status          VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_partners_status ON partners(status);
```

### 合作伙伴结算表

```sql
CREATE TABLE partner_settlements (
    settlement_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id      UUID NOT NULL REFERENCES partners(partner_id),
    period_start    DATE NOT NULL,
    period_end      DATE NOT NULL,
    total_earn_points   BIGINT NOT NULL DEFAULT 0,
    total_burn_points   BIGINT NOT NULL DEFAULT 0,
    total_earn_amount   NUMERIC(20,2) NOT NULL DEFAULT 0,
    total_burn_amount   NUMERIC(20,2) NOT NULL DEFAULT 0,
    net_settlement      NUMERIC(20,2) NOT NULL DEFAULT 0,
    transaction_count   BIGINT NOT NULL DEFAULT 0,
    status          VARCHAR(20) NOT NULL DEFAULT 'pending',
                    -- 'pending','reconciled','disputed','settled'
    reconciled_at   TIMESTAMPTZ,
    settled_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_partner_period UNIQUE (partner_id, period_start, period_end)
);

CREATE INDEX idx_settlements_partner ON partner_settlements(partner_id, period_start DESC);
CREATE INDEX idx_settlements_status  ON partner_settlements(status)
    WHERE status != 'settled';
```

### 幂等键表

```sql
CREATE TABLE idempotency_keys (
    idempotency_key VARCHAR(255) PRIMARY KEY,
    member_id       UUID NOT NULL,
    endpoint        VARCHAR(100) NOT NULL,
    request_hash    CHAR(64) NOT NULL,         -- 请求体的 SHA-256
    response_status SMALLINT,
    response_body   JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours'
);

CREATE INDEX idx_idem_member ON idempotency_keys(member_id);
CREATE INDEX idx_idem_expiry ON idempotency_keys(expires_at);
```

---

## 4. 高层架构

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              客户端层                                            │
│   移动应用    │    Web 应用    │   POS 终端    │   合作伙伴系统                    │
└────────┬────────┴───────┬───────┴────────┬─────────┴──────────┬─────────────────┘
         │                │                │                    │
         ▼                ▼                ▼                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            API 网关                                              │
│   限流        │  认证 (JWT/API Key)  │  请求路由    │  幂等性                      │
└────────┬────────┬───────┬───────┬───────┬────────┬──────────┬───────────────────┘
         │        │       │       │       │        │          │
         ▼        │       ▼       │       ▼        │          ▼
┌────────────┐    │ ┌──────────┐  │ ┌──────────┐   │  ┌──────────────┐
│   积分     │    │ │   等级   │  │ │ 奖励     │   │  │   合作伙伴   │
│   引擎     │    │ │   引擎   │  │ │ 目录     │   │  │   网关       │
│            │    │ │          │  │ │ 服务     │   │  │              │
│ - 赚取     │    │ │ - 计算   │  │ │ - 浏览   │   │  │ - 赚取/消费  │
│ - 兑换     │    │ │ - 升/降  │  │ │ - 可用性 │   │  │ - 转移       │
│ - 余额     │    │ │ - 宽限   │  │ │ - 库存   │   │  │ - 结算       │
│ - 过期     │    │ │ - 状态   │  │ │          │   │  │              │
└─────┬──────┘    │ └────┬─────┘  │ └────┬─────┘   │  └──────┬───────┘
      │           │      │        │      │         │         │
      ▼           ▼      ▼        ▼      ▼         ▼         ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          事件总线 (Kafka)                                         │
│  points.earned │ points.redeemed │ points.expired │ tier.changed │ partner.txn   │
└────────┬────────┬───────┬────────┬───────┬────────┬─────────┬───────────────────┘
         │        │       │        │       │        │         │
         ▼        │       ▼        │       ▼        │         ▼
┌────────────┐    │ ┌──────────┐   │ ┌──────────┐   │  ┌──────────────┐
│   欺诈     │    │ │ 通知     │   │ │  结算    │   │  │  赚取        │
│   检测     │    │ │ 服务     │   │ │  引擎    │   │  │  规则        │
│   服务     │    │ │          │   │ │          │   │  │  引擎        │
└────────────┘    │ └──────────┘   │ └──────────┘   │  └──────────────┘
                  │                │                │
                  ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          数据层                                                  │
│  PostgreSQL     │    Redis        │    S3            │   Elasticsearch           │
│  (积分账本      │  (余额,         │  (审计归档,       │  (交易搜索,               │
│   等级, 规则)   │   规则缓存,     │   账本归档)       │   奖励目录搜索)            │
│                 │   会话)         │                  │                           │
└─────────────────┴─────────────────┴──────────────────┴───────────────────────────┘
```

### 服务职责

| 服务 | 职责 | 数据存储 |
|------|------|----------|
| 积分引擎 | 核心赚取/兑换/余额操作，账本写入 | PostgreSQL（主库），Redis（余额缓存） |
| 等级引擎 | 计算等级资格，升级/降级 | PostgreSQL，Redis（等级缓存） |
| 奖励目录服务 | 管理奖励库存、资格 | PostgreSQL，Elasticsearch（搜索） |
| 赚取规则引擎 | 评估规则，计算每笔交易积分 | PostgreSQL，Redis（规则缓存） |
| 合作伙伴网关 | 合作伙伴 API 转换、汇率转换、认证 | PostgreSQL（合作伙伴配置） |
| 欺诈检测服务 | 实时评分、速率检查 | Redis（计数器），ML 模型服务 |
| 结算引擎 | 每日对账、净结算计算 | PostgreSQL（结算表） |
| 通知服务 | 赚取/兑换/过期事件的推送、邮件、短信 | Kafka 消费者，推送网关 |

---

## 5. 深入探讨：积分账本

### 积分的 double-entry 记账法

每次积分变动都记录为一条不可变的账本条目。账本是真实来源；`points_balances` 表是用于快速读取的物化视图。

```
┌──────────────────────────────────────────────────────────────────────┐
│                    积分账本模型                                        │
│                                                                      │
│  每条记录:  balance_after = balance_before + points                   │
│                                                                      │
│  EARN:    points > 0   （贷记给会员）                                  │
│  REDEEM:  points < 0   （从会员借记）                                  │
│  EXPIRE:  points < 0   （从会员借记，source_type='expiration'）         │
│  ADJUST:  points > 0 或 < 0（管理员修正，需要审批）                     │
│  HOLD:    points < 0   （待兑换的临时保留）                             │
│  RELEASE: points > 0   （取消冻结，返还积分）                           │
│  REFUND:  points > 0   （撤销一次兑换）                                │
│                                                                      │
│  不变量: 会员的 SUM(points) = 当前可用余额                              │
│          （不包括冻结金额）                                             │
└──────────────────────────────────────────────────────────────────────┘
```

### 赚取交易流程

```python
def earn_points(member_id, transaction, earning_rules):
    """Award points for a qualifying transaction. Idempotency key prevents double-awarding."""
    # 1. Check idempotency — return cached response if already processed
    existing = db.query(
        "SELECT response_body FROM idempotency_keys WHERE idempotency_key = %s",
        [transaction.idempotency_key]
    )
    if existing:
        return existing.response_body

    # 2. Evaluate earning rules -> [{"type":"base","points":91,"rule_id":"rule_001"}, ...]
    points_awards = rules_engine.evaluate(member_id, transaction.amount,
        transaction.category, transaction.channel, transaction.partner_id)

    # 3. Fraud check (synchronous, < 50ms)
    fraud_score = fraud_service.score_earn(member_id, transaction, points_awards)
    if fraud_score > FRAUD_THRESHOLD:
        raise FraudRejectedException(f"Earn rejected: score={fraud_score}")

    # 4. Write ledger + balances + lots in single DB transaction
    with db.transaction(isolation='SERIALIZABLE'):
        entries = []
        for award in points_awards:
            balance = db.query(
                "SELECT available, version FROM points_balances WHERE member_id=%s AND point_type=%s FOR UPDATE",
                [member_id, award["type"]])
            expiry = compute_expiry(award["type"])  # e.g., 12 months from now

            # Insert immutable ledger entry
            entry_id = db.execute(
                """INSERT INTO points_ledger (member_id, idempotency_key, entry_type, point_type,
                   points, balance_before, balance_after, source_type, source_id,
                   partner_id, earning_rule_id, expires_at)
                   VALUES (%s,%s,'earn',%s,%s,%s,%s,'purchase',%s,%s,%s,%s) RETURNING entry_id""",
                [member_id, f"{transaction.idempotency_key}_{award['type']}",
                 award["type"], award["points"], balance.available,
                 balance.available + award["points"], transaction.transaction_id,
                 transaction.partner_id, award["rule_id"], expiry])

            # Create point lot for FIFO expiration tracking
            db.execute("INSERT INTO point_lots (member_id, ledger_entry_id, point_type, "
                       "original_points, remaining_points, expires_at) VALUES (%s,%s,%s,%s,%s,%s)",
                       [member_id, entry_id, award["type"], award["points"], award["points"], expiry])

            # Update materialized balance (optimistic lock on version)
            rows = db.execute(
                """UPDATE points_balances SET available = available + %s, version = version + 1
                   WHERE member_id=%s AND point_type=%s AND version=%s""",
                [award["points"], member_id, award["type"], balance.version])
            if rows == 0:
                raise OptimisticLockException("Concurrent balance modification")

            entries.append({"entry_id": entry_id, "type": award["type"], "points": award["points"]})

        total_earned = sum(a["points"] for a in points_awards)
        db.execute("UPDATE members SET lifetime_earned=lifetime_earned+%s, last_activity_at=NOW() WHERE member_id=%s",
                   [total_earned, member_id])

        # Store idempotency response for dedup on retry
        response = build_earn_response(member_id, entries, points_awards)
        db.execute("INSERT INTO idempotency_keys (idempotency_key,member_id,endpoint,request_hash,response_status,response_body) "
                   "VALUES (%s,%s,'earn',%s,201,%s)",
                   [transaction.idempotency_key, member_id, hash_request(transaction), json.dumps(response)])

    # 5. Async: publish event, invalidate cache
    kafka.publish("points.earned", {"member_id": member_id, "total_points": total_earned})
    redis.delete(f"balance:{member_id}")
    return response
```

### 余额计算策略

```
┌──────────────────────────────────────────────────────────────┐
│                 余额读取策略                                    │
│                                                              │
│  热路径（99% 的读取）:                                         │
│    1. 检查 Redis 缓存: balance:{member_id}                    │
│    2. 命中 + TTL 有效 -> 返回缓存余额                          │
│    3. 未命中 -> 从 points_balances 表读取                      │
│    4. 填充缓存（TTL = 5 秒）                                   │
│                                                              │
│  权威路径（用于兑换）:                                          │
│    1. SELECT ... FROM points_balances FOR UPDATE              │
│    2. 始终从主库读取，从不使用缓存                               │
│                                                              │
│  对账（每夜）:                                                 │
│    1. SUM(points) FROM points_ledger GROUP BY member_id       │
│    2. 与 points_balances.available 比较                        │
│    3. 对任何差异 > 0 发出警报                                   │
│    4. 如果在阈值范围内，使用 'adjust' 条目自动修正               │
└──────────────────────────────────────────────────────────────┘
```

### 每夜对账查询

```sql
-- 查找账本总和与物化余额之间的差异
WITH lt AS (
    SELECT member_id, point_type,
        SUM(CASE WHEN entry_type NOT IN ('hold','release') THEN points ELSE 0 END) AS ledger_bal,
        SUM(CASE WHEN entry_type='hold' THEN ABS(points) ELSE 0 END)
          - SUM(CASE WHEN entry_type='release' THEN points ELSE 0 END) AS held_bal
    FROM points_ledger GROUP BY member_id, point_type
)
SELECT lt.member_id, lt.point_type,
    lt.ledger_bal - lt.held_bal - pb.available AS available_drift,
    lt.held_bal - pb.held AS held_drift
FROM lt JOIN points_balances pb ON lt.member_id = pb.member_id AND lt.point_type = pb.point_type
WHERE ABS(lt.ledger_bal - lt.held_bal - pb.available) > 0 OR ABS(lt.held_bal - pb.held) > 0;
```

---

## 6. 深入探讨：赚取规则引擎

### 规则评估管道

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│ 传入     │     │  筛选    │     │ 计算     │     │  应用    │     │  应用    │
│ 交易     │────>│ 符合条件 │────>│ 基础     │────>│ 等级     │────>│ 上限 &  │
│          │     │ 规则     │     │ 积分     │     │ 倍率     │     │ 限制    │
└──────────┘     └──────────┘     └──────────┘     └──────────┘     └──────────┘
                                                                         │
                 ┌──────────┐     ┌──────────┐     ┌──────────┐         │
                 │ 输出     │<────│ 合并     │<────│ 添加     │<────────┘
                 │ 奖励     │     │ 奖励     │     │ 促销     │
                 │          │     │          │     │ 奖励     │
                 └──────────┘     └──────────┘     └──────────┘
```

### 规则评估逻辑

```python
class EarningRulesEngine:
    def __init__(self, rules_cache):
        self.rules_cache = rules_cache  # Redis-backed, refreshed every 60s

    def evaluate(self, member_id, amount, category, channel, partner_id):
        """Evaluate all applicable rules, return list of point awards."""
        member = self._get_member(member_id)
        eligible_rules = [r for r in self._get_active_rules()
                          if self._is_eligible(r, amount, category, channel, partner_id)]
        eligible_rules.sort(key=lambda r: r.priority)  # lower = higher priority

        awards = []
        daily_points_used = self._get_daily_points(member_id)

        for rule in eligible_rules:
            base_points = self._calculate_base(rule, amount)
            if base_points == 0:
                continue

            # Apply per-transaction and daily caps
            if rule.max_points_per_txn:
                base_points = min(base_points, rule.max_points_per_txn)
            if rule.max_points_per_day:
                remaining = rule.max_points_per_day - daily_points_used
                if remaining <= 0: continue
                base_points = min(base_points, remaining)

            awards.append({"type": rule.point_type, "points": base_points,
                           "rule_id": rule.rule_id, "rule_name": rule.rule_name})

            # Tier multiplier -> separate bonus entry
            if rule.tier_multipliers and member.current_tier in rule.tier_multipliers:
                multiplier = rule.tier_multipliers[member.current_tier]
                bonus = int(base_points * (multiplier - 1))
                if bonus > 0:
                    awards.append({"type": "bonus", "points": bonus,
                                   "rule_id": rule.rule_id,
                                   "rule_name": f"{member.current_tier}_tier_bonus"})

            daily_points_used += base_points
            if not rule.is_stackable:
                break  # non-stackable rule stops further evaluation

        awards.extend(self._evaluate_promotions(member_id, amount, category))
        return awards

    def _calculate_base(self, rule, amount):
        if rule.rate_unit == 'per_dollar': return int(amount * rule.base_rate)
        if rule.rate_unit in ('per_transaction', 'flat'): return int(rule.base_rate)
        return 0

    def _is_eligible(self, rule, amount, category, channel, partner_id):
        now = datetime.utcnow()
        if rule.min_transaction and amount < rule.min_transaction: return False
        if rule.category and rule.category != category: return False
        if rule.channel and rule.channel != channel: return False
        if rule.partner_id and rule.partner_id != partner_id: return False
        if now < rule.effective_from: return False
        if rule.effective_to and now > rule.effective_to: return False
        return True
```

### 赚取规则配置示例

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ 规则: "基础赚取"                                                                  │
│ 类型: spend_based | 费率: 2 pts/$1 | 渠道: 全部 | 类别: 全部                      │
│ 等级倍率: silver=1.25x, gold=1.5x, platinum=2.0x                                │
│ 可叠加: 是 | 优先级: 100                                                         │
├──────────────────────────────────────────────────────────────────────────────────┤
│ 规则: "餐饮奖励"                                                                  │
│ 类型: spend_based | 费率: 3 pts/$1 | 渠道: 全部 | 类别: food_and_beverage         │
│ 可叠加: 否（替代此类别的基础赚取） | 优先级: 50                                    │
├──────────────────────────────────────────────────────────────────────────────────┤
│ 规则: "合作伙伴 - 航空"                                                           │
│ 类型: partner | 费率: 1 pt/$1 | 合作伙伴: ptr_airline_001                        │
│ 最低交易: $25 | 每笔上限: 5000 | 可叠加: 是 | 优先级: 100                         │
├──────────────────────────────────────────────────────────────────────────────────┤
│ 规则: "欢乐时光活动"                                                              │
│ 类型: campaign | 费率: 100 pts（固定） | 类别: food_and_beverage                  │
│ 渠道: in_store | 有效期: 2024年3月15-17日, 14:00-17:00                            │
│ 积分类型: promotional | 每日上限: 200 | 可叠加: 是 | 优先级: 200                   │
├──────────────────────────────────────────────────────────────────────────────────┤
│ 规则: "注册奖励"                                                                  │
│ 类型: signup | 费率: 500 pts（固定） | 每位会员一次                                │
│ 积分类型: promotional | 过期: 90 天 | 优先级: 10                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 赚取计算示例

```
交易: 在 Starbucks 消费 $45.50（food_and_beverage, in_store）
会员等级: Gold（1.5x 倍率）
当前活动: 欢乐时光（100 奖励积分）

第 1 步 - 筛选规则:
  ✗ "基础赚取" — 符合条件但优先级低于餐饮奖励
  ✓ "餐饮奖励" — 匹配类别，优先级=50，不可叠加
  ✗ "合作伙伴航空" — 合作伙伴不匹配
  ✓ "欢乐时光活动" — 匹配类别+渠道+时间，可叠加

第 2 步 - 计算:
  餐饮奖励: $45.50 × 3 pts/$1 = 136 pts（基础）
  （基础赚取被跳过：餐饮奖励不可叠加，优先级更高）

第 3 步 - 餐饮的等级倍率:
  Gold 奖励: 136 × (1.5 - 1) = 68 pts（奖励）

第 4 步 - 促销:
  欢乐时光: 100 pts（促销，固定）

第 5 步 - 总奖励:
  base=136 + bonus=68 + promotional=100 = 304 积分
```

---

## 7. 深入探讨：等级计算

### 等级资格模型

```
┌───────────────────────────────────────────────────────────────────────┐
│                    等级资格窗口                                         │
│                                                                       │
│  从注册周年日起的滚动 12 个月窗口                                       │
│                                                                       │
│  资格积分 = SUM(窗口内赚取的 base + bonus)                              │
│  注意: promotional 积分不计入等���资格                                    │
│  注意: 已兑换的积分仍然计入（基于赚取，而非基于余额）                      │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐     │
│  │ 2023年3月                                     2024年3月      │     │
│  │ ├──────────────────── 12 个月 ──────────────────┤            │     │
│  │ │  资格活动:  已赚取 8,200 积分                   │            │     │
│  │ │  当前等级: Gold（阈值: 5,000）                  │            │     │
│  │ │  下一等级: Platinum（阈值: 10,000）             │            │     │
│  │ │  距 Platinum: 1,800                           │            │     │
│  │ ├──────────────────────────────────────────────────┤         │     │
│  └──────────────────────────────────────────────────────────────┘     │
└───────────────────────────────────────────────────────────────────────┘
```

### 等级评估逻辑

```python
class TierEngine:
    def evaluate_tier(self, member_id):
        """Called after every earn event and on a nightly batch schedule."""
        member = db.query("SELECT * FROM members WHERE member_id = %s", [member_id])
        tiers = self._get_tiers_ordered()  # ordered by tier_level DESC

        # Calculate qualifying points in rolling 12-month window
        window_start = member.enrollment_date.replace(year=datetime.utcnow().year - 1)
        qualifying_points = db.query(
            """SELECT COALESCE(SUM(points), 0) FROM points_ledger
               WHERE member_id=%s AND entry_type='earn' AND point_type IN ('base','bonus')
               AND created_at BETWEEN %s AND NOW()""",
            [member_id, window_start])

        # Determine highest qualifying tier
        new_tier = tiers[-1]  # default: lowest
        for tier in tiers:
            if qualifying_points >= tier.qualification_threshold:
                new_tier = tier
                break

        if new_tier.tier_level > self._get_tier_level(member.current_tier):
            return self._upgrade_member(member, new_tier, qualifying_points)
        if new_tier.tier_level < self._get_tier_level(member.current_tier):
            return self._evaluate_downgrade(member, new_tier, qualifying_points)
        return {"tier": member.current_tier, "qualifying_points": qualifying_points, "changed": False}

    def _upgrade_member(self, member, new_tier, qualifying_points):
        with db.transaction():
            db.execute("UPDATE members SET current_tier=%s, tier_since=NOW(), tier_expires=%s WHERE member_id=%s",
                       [new_tier.tier_name, datetime.utcnow() + timedelta(days=365), member.member_id])
            db.execute("INSERT INTO tier_history (member_id,previous_tier,new_tier,change_type,qualifying_points,window_start,window_end) "
                       "VALUES (%s,%s,%s,'upgrade',%s,%s,%s)",
                       [member.member_id, member.current_tier, new_tier.tier_name,
                        qualifying_points, window_start, datetime.utcnow()])
        kafka.publish("tier.changed", {"member_id": member.member_id, "new_tier": new_tier.tier_name})
        redis.delete(f"tier:{member.member_id}")
        return {"tier": new_tier.tier_name, "changed": True, "change_type": "upgrade"}

    def _evaluate_downgrade(self, member, new_tier, qualifying_points):
        """Downgrade only at tier expiration + grace period (90 days)."""
        if datetime.utcnow() < member.tier_expires:
            return {"tier": member.current_tier, "changed": False,
                    "warning": "Below threshold, tier expires at window end"}

        grace_end = member.tier_expires + timedelta(days=90)
        if datetime.utcnow() < grace_end:
            current_config = self._get_tier_by_name(member.current_tier)
            if qualifying_points >= current_config.retention_threshold:
                return self._renew_tier(member, qualifying_points)
            return {"tier": member.current_tier, "changed": False,
                    "grace_period_end": grace_end.isoformat()}

        # Grace expired — downgrade
        return self._downgrade_member(member, new_tier, qualifying_points)
```

### 等级状态机

```
                    ┌──────────────────┐
         ┌─────────│     GREEN        │
         │         │  (0 pts)         │
         │         └────────┬─────────┘
         │                  │ 资格 >= 2,000 pts
         │                  ▼
         │         ┌──────────────────┐
         │  ┌──────│     SILVER       │──────┐
         │  │      │  (2,000 pts)     │      │
         │  │      └────────┬─────────┘      │
         │  │               │ 资格 >= 5,000  │ 保留 < 1,500
         │  │               ▼                │ （宽限期后）
         │  │      ┌──────────────────┐      │
         │  │ ┌────│      GOLD        │────┐ │
         │  │ │    │  (5,000 pts)     │    │ │
         │  │ │    └────────┬─────────┘    │ │
         │  │ │             │ >= 10,000    │ │ 保留 < 4,000
         │  │ │             ▼              │ │ （宽限期后）
         │  │ │    ┌──────────────────┐    │ │
         │  │ │    │   PLATINUM       │    │ │
         │  │ │    │  (10,000 pts)    │    │ │
         │  │ │    └──────────────────┘    │ │
         │  │ │             │              │ │
         │  │ │             │ 保留         │ │
         │  │ │             │ < 8,000      │ │
         │  │ │             │ （宽限期后）  │ │
         │  │ │             ▼              │ │
         │  │ │        降级               │ │
         │  │ │      至最高              │ │
         │  │ │     符合条件等级 ◄──────┘ │
         │  │ └──────────────────────────────┘
         │  │             │
         │  └──── 降级至 Green
         │                │
         └────────────────┘
```

### 等级权益应用

```
┌──────────────┬───────────┬───────────┬───────────┬───────────┐
│ 权益         │   Green   │  Silver   │   Gold    │ Platinum  │
├──────────────┼───────────┼───────────┼───────────┼───────────┤
│ 赚取倍率     │ 1x 基础   │ 1.25x    │ 1.5x     │ 2.0x      │
│ 生日礼物     │ 基础      │ 高级      │ 高级      │ 超级      │
│ 免费续杯     │ 否        │ 否        │ 是        │ 是        │
│ 优先服务     │ 否        │ 否        │ 是        │ 是        │
│ 贵宾厅       │ 否        │ 否        │ 否        │ 是        │
│ 年度礼物     │ 否        │ 否        │ 否        │ 是        │
│ 双倍积分日   │ 0/月      │ 1/月      │ 2/月      │ 无限制    │
│ 宽限期       │ 不适用    │ 60 天     │ 90 天     │ 90 天     │
└──────────────┴───────────┴───────────┴───────────┴───────────┘
```

---

## 8. 深入探讨：兑换流程

### 两阶段兑换（冻结和确认）

对于高价值或实物奖励，使用两阶段兑换来防止竞态条件并处理履约失败。

```
会员                  积分引擎                  奖励服务              履约
  │                        │                          │                      │
  │  1. 请求兑换           │                          │                      │
  ├───────────────────────>│                          │                      │
  │                        │  2. 检查余额             │                      │
  │                        │     (SELECT FOR UPDATE)  │                      │
  │                        │                          │                      │
  │                        │  3. 检查奖励可用性       │                      │
  │                        ├─────────────────────────>│                      │
  │                        │  4. 奖励可用             │                      │
  │                        │<─────────────────────────┤                      │
  │                        │                          │                      │
  │                        │  5. 冻结积分             │                      │
  │                        │  （从可用借记,           │                      │
  │                        │   贷记至冻结）           │                      │
  │                        │                          │                      │
  │  6. 冻结已确认         │                          │                      │
  │  (holdId, expiresAt)   │                          │                      │
  │<───────────────────────┤                          │                      │
  │                        │                          │                      │
  │  7. 确认兑换           │                          │                      │
  ├───────────────────────>│                          │                      │
  │                        │  8. 将冻结               │                      │
  │                        │     转为已确认           │                      │
  │                        │                          │                      │
  │                        │  9. 触发履约             │                      │
  │                        ├──────────────────────────┼─────────────────────>│
  │                        │                          │                      │
  │                        │  10. 履约完成            │                      │
  │                        │<─────────────────────────┼──────────────────────┤
  │                        │                          │                      │
  │  11. 兑换完成          │                          │                      │
  │  （优惠券/追踪号）     │                          │                      │
  │<───────────────────────┤                          │                      │
```

### FIFO 积分消费（最旧积分优先）

```python
def consume_points_fifo(member_id, points_needed):
    """
    Consume points using FIFO: oldest lots expire first, so use them first.
    Returns list of lot deductions.
    """
    # Get active lots ordered by expiration (soonest first, NULL last)
    lots = db.query(
        """SELECT lot_id, remaining_points, expires_at, version
           FROM point_lots
           WHERE member_id = %s
             AND status IN ('active', 'partially_used')
             AND (expires_at IS NULL OR expires_at > NOW())
           ORDER BY expires_at ASC NULLS LAST, earned_at ASC
           FOR UPDATE""",
        [member_id]
    )

    remaining = points_needed
    deductions = []

    for lot in lots:
        if remaining <= 0:
            break

        deduct = min(remaining, lot.remaining_points)
        new_remaining = lot.remaining_points - deduct
        new_status = 'fully_used' if new_remaining == 0 else 'partially_used'

        rows = db.execute(
            """UPDATE point_lots
               SET remaining_points = %s,
                   status = %s,
                   version = version + 1,
                   updated_at = NOW()
               WHERE lot_id = %s AND version = %s""",
            [new_remaining, new_status, lot.lot_id, lot.version]
        )
        if rows == 0:
            raise OptimisticLockException("Lot modified concurrently")

        deductions.append({
            "lot_id": lot.lot_id,
            "points": deduct,
            "expires_at": lot.expires_at
        })
        remaining -= deduct

    if remaining > 0:
        raise InsufficientPointsException(
            f"Need {points_needed} but only {points_needed - remaining} available"
        )

    return deductions
```

### 退款/撤销处理

```python
def refund_redemption(redemption_id, reason):
    """Refund a redemption: return points to member, recreate lots with original expiry."""
    redemption = db.query("SELECT * FROM redemptions WHERE redemption_id = %s", [redemption_id])
    if redemption.status not in ('confirmed', 'fulfilled'):
        raise InvalidStateException(f"Cannot refund {redemption.status} redemption")

    deduction_entries = db.query(
        "SELECT * FROM points_ledger WHERE source_id = %s AND entry_type = 'redeem'",
        [redemption_id]
    )

    with db.transaction():
        total_refunded = 0
        for entry in deduction_entries:
            refund_points = abs(entry.points)
            balance = db.query(
                "SELECT available, version FROM points_balances WHERE member_id=%s AND point_type=%s FOR UPDATE",
                [redemption.member_id, entry.point_type]
            )
            # 1. Insert refund ledger entry (positive points = credit back)
            refund_entry_id = db.execute(
                """INSERT INTO points_ledger (member_id, idempotency_key, entry_type, point_type,
                   points, balance_before, balance_after, source_type, source_id, description)
                   VALUES (%s, %s, 'refund', %s, %s, %s, %s, 'refund', %s, %s) RETURNING entry_id""",
                [redemption.member_id, f"refund_{redemption_id}_{entry.point_type}",
                 entry.point_type, refund_points, balance.available,
                 balance.available + refund_points, redemption_id, reason]
            )
            # 2. Recreate lot with original expiration date
            db.execute(
                """INSERT INTO point_lots (member_id, ledger_entry_id, point_type,
                   original_points, remaining_points, expires_at)
                   VALUES (%s, %s, %s, %s, %s, %s)""",
                [redemption.member_id, refund_entry_id, entry.point_type,
                 refund_points, refund_points, entry.expires_at]
            )
            # 3. Update materialized balance
            db.execute(
                """UPDATE points_balances SET available = available + %s, version = version + 1
                   WHERE member_id = %s AND point_type = %s AND version = %s""",
                [refund_points, redemption.member_id, entry.point_type, balance.version]
            )
            total_refunded += refund_points

        db.execute("UPDATE redemptions SET status='refunded', refund_reason=%s, refunded_at=NOW() WHERE redemption_id=%s",
                   [reason, redemption_id])
        db.execute("UPDATE members SET lifetime_redeemed = lifetime_redeemed - %s WHERE member_id=%s",
                   [total_refunded, redemption.member_id])

    redis.delete(f"balance:{redemption.member_id}")
    kafka.publish("points.refunded", {"member_id": redemption.member_id,
        "redemption_id": redemption_id, "points_refunded": total_refunded})
```

---

## 9. 深入探讨：积分过期

### 过期策略模型

```
┌───────────────────────────────────────────────────────────────────────┐
│                     过期策略                                           │
│                                                                       │
│  策略 1: 基于时间                                                     │
│    基础积分在赚取后 12 个月过期                                        │
│    奖励积分在赚取后 12 个月过期                                        │
│    促销积分在赚取后 90 天过期                                          │
│                                                                       │
│  策略 2: 基于活动的延期                                               │
│    任何符合条件的活动（赚取或兑换）将所有                                │
│    非促销积分从活动日期起延长 12 个月                                    │
│    "用它或失去它" — 保持活跃以保持积分有效                              │
│                                                                       │
│  策略 3: 基于等级的覆盖                                               │
│    Platinum 会员: 等级有效期间积分永不过期                              │
│    Gold 会员: 18 个月过期（而不是 12 个月）                             │
│                                                                       │
│  策略 4: 通知计划                                                     │
│    过期前 30 天: 邮件 + 推送通知                                       │
│    过期前 7 天: 邮件 + 推送 + 短信                                     │
│    过期前 1 天: 最终推送通知                                           │
└───────────────────────────────────────────────────────────────────────┘
```

### 批量过期处理

```python
class ExpirationProcessor:
    """Scheduled job (hourly). Processes expired point lots in batches."""

    def run_expiration_batch(self):
        batch_size = 1000
        while True:
            lots = db.query(
                """SELECT pl.lot_id, pl.member_id, pl.point_type, pl.remaining_points, pl.version
                   FROM point_lots pl JOIN members m ON pl.member_id = m.member_id
                   WHERE pl.status IN ('active','partially_used') AND pl.expires_at <= NOW()
                     AND pl.expires_at IS NOT NULL AND m.current_tier != 'platinum'
                   ORDER BY pl.expires_at ASC LIMIT %s FOR UPDATE SKIP LOCKED""",
                [batch_size])
            if not lots: break

            for lot in lots:
                self._expire_lot(lot)
            db.commit()

    def _expire_lot(self, lot):
        # Check activity-based extension: any earn/redeem in last 12 months extends expiry
        last_activity = db.query(
            "SELECT MAX(created_at) FROM points_ledger WHERE member_id=%s AND entry_type IN ('earn','redeem')",
            [lot.member_id])
        if last_activity and last_activity > lot.expires_at - timedelta(days=365):
            db.execute("UPDATE point_lots SET expires_at=%s, version=version+1 WHERE lot_id=%s",
                       [last_activity + timedelta(days=365), lot.lot_id])
            return

        if lot.remaining_points == 0:
            db.execute("UPDATE point_lots SET status='fully_used' WHERE lot_id=%s", [lot.lot_id])
            return

        balance = db.query(
            "SELECT available, version FROM points_balances WHERE member_id=%s AND point_type=%s FOR UPDATE",
            [lot.member_id, lot.point_type])

        # 1. Ledger entry (negative points = debit)
        db.execute("""INSERT INTO points_ledger (member_id, idempotency_key, entry_type, point_type,
                      points, balance_before, balance_after, source_type, source_id)
                      VALUES (%s,%s,'expire',%s,%s,%s,%s,'expiration',%s)""",
                   [lot.member_id, f"expire_{lot.lot_id}", lot.point_type,
                    -lot.remaining_points, balance.available,
                    balance.available - lot.remaining_points, lot.lot_id])
        # 2. Mark lot expired
        db.execute("UPDATE point_lots SET remaining_points=0, status='expired', version=version+1 WHERE lot_id=%s AND version=%s",
                   [lot.lot_id, lot.version])
        # 3. Update balance
        db.execute("UPDATE points_balances SET available=available-%s, version=version+1 WHERE member_id=%s AND point_type=%s AND version=%s",
                   [lot.remaining_points, lot.member_id, lot.point_type, balance.version])
        # 4. Update lifetime stats
        db.execute("UPDATE members SET lifetime_expired=lifetime_expired+%s WHERE member_id=%s",
                   [lot.remaining_points, lot.member_id])

        kafka.publish("points.expired", {"member_id": lot.member_id, "points_expired": lot.remaining_points})
        redis.delete(f"balance:{lot.member_id}")
```

### 过期通知管道

```
定时扫描器（每小时） -> 过期评估器 -> 通知服务 -> 邮件/推送/短信

通知计划:
  - 30 天前:  "1,200 积分将于 4 月 15 日过期。立即兑换！"
  - 7 天前:   "1,200 积分将在 7 天内过期。不要错过！"
  - 1 天前:   "最后机会：1,200 积分明天过期！"
```

```sql
-- 查找未来 30 天内有积分过期的会员
SELECT m.member_id, SUM(pl.remaining_points) AS expiring_points, MIN(pl.expires_at) AS earliest
FROM point_lots pl JOIN members m ON pl.member_id = m.member_id
WHERE pl.status IN ('active','partially_used')
  AND pl.expires_at BETWEEN NOW() AND NOW() + INTERVAL '30 days'
  AND m.current_tier != 'platinum'
GROUP BY m.member_id HAVING SUM(pl.remaining_points) > 0
ORDER BY earliest ASC;
```

---

## 10. 深入探讨：欺诈防范

### 欺诈信号与检测

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     欺诈检测层级                                          │
│                                                                          │
│  第 1 层: 速率检查（实时，在 Redis 中）                                    │
│    - 每位会员每小时赚取事件（阈值: 20）                                    │
│    - 每位会员每天赚取事件（阈值: 100）                                     │
│    - 每位会员每天赚取积分（阈值: 50,000）                                  │
│    - 每位会员每小时兑换次数（阈值: 5）                                     │
│    - 每位会员每天兑换次数（阈值: 20）                                      │
│    - 相同设备/IP 每小时赚取事件（阈值: 50）                                │
│                                                                          │
│  第 2 层: 模式检测（ML 模型，< 50ms 推理）                                │
│    - 异常赚取模式（时间、地点、金额）                                      │
│    - 赚取后立即兑换模式                                                   │
│    - 账户年龄与赚取速率不匹配                                             │
│    - 地理异常（在东京赚取，1 小时内在纽约兑换）                             │
│    - 多个账户关联到相同设备/支付方式                                       │
│                                                                          │
│  第 3 层: 合作伙伴欺诈（批量，每日对账）                                   │
│    - 合作伙伴提交虚高交易金额                                             │
│    - 虚假交易（POS 无匹配购买）                                           │
│    - 异常的合作伙伴对会员赚取模式                                         │
│    - 拆分交易以最大化每笔交易奖励                                         │
│                                                                          │
│  第 4 层: 账户接管（实时）                                                │
│    - 从新设备登录 + 立即高价值兑换                                        │
│    - 密码更改 + 24 小时内兑换                                             │
│    - 多次认证失败后成功兑换                                               │
│    - 收货地址更改 + 实物奖励兑换                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 实时欺诈评分

```python
class FraudDetectionService:
    FRAUD_THRESHOLD = 80   # 0-100 score; >= 80 = reject, 60-79 = hold for review

    def score_earn(self, member_id, transaction, awards):
        score = 0
        # Velocity checks via Redis sliding-window counters
        checks = [
            (f"fraud:earn:hourly:{member_id}", 3600, 20, 40),    # > 20 earns/hour
            (f"fraud:earn:daily:{member_id}", 86400, 100, 30),   # > 100 earns/day
        ]
        for key, ttl, threshold, penalty in checks:
            count = redis.incr(key)
            redis.expire(key, ttl)
            if count > threshold:
                score += penalty

        # Daily points cap check
        daily_pts = redis.incrby(f"fraud:points:daily:{member_id}", sum(a["points"] for a in awards))
        redis.expire(f"fraud:points:daily:{member_id}", 86400)
        if daily_pts > 50000: score += 35

        # Device velocity (same device earning across multiple accounts)
        device_id = transaction.metadata.get('device_id', 'unknown')
        device_count = redis.incr(f"fraud:device:hourly:{device_id}")
        redis.expire(f"fraud:device:hourly:{device_id}", 3600)
        if device_count > 50: score += 50

        # ML model inference (< 50ms) — considers account age, amount patterns, geo
        ml_score = self.ml_model.predict({"member_id": member_id, "amount": transaction.amount,
            "category": transaction.category, "account_age_days": self._get_account_age(member_id)})
        score = max(score, ml_score)

        if score >= 60:
            kafka.publish("fraud.signals", {"member_id": member_id, "score": score,
                "action": "reject" if score >= 80 else "hold_for_review"})
        return score

    def score_redeem(self, member_id, redemption):
        score = 0
        # Earn-then-immediately-redeem pattern
        recent_earn = int(redis.get(f"fraud:recent_earn:{member_id}") or 0)
        if recent_earn > redemption.points_cost * 0.8: score += 45
        # Account takeover signals
        if redis.get(f"fraud:pwd_change:{member_id}"): score += 60
        if redis.get(f"fraud:new_device:{member_id}"): score += 30
        if redemption.points_cost > 10000: score += 15
        return score
```

### 欺诈防范总结

```
┌────────────────────┬────────────────────────┬─────────────────────────┐
│ 欺诈类型           │ 检测方法               │ 响应措施                │
├────────────────────┼────────────────────────┼─────────────────────────┤
│ 虚假消费           │ 速率检查               │ 阻止赚取，标记审核      │
│ 积分薅羊毛         │ 模式 ML 模型           │ 暂停赚取                │
│ 账户接管           │ 设备/IP + 行为分析     │ 冻结 + MFA 挑战         │
│ 兑换欺诈           │ 赚取-兑换模式          │ 暂停兑换                │
│ 合作伙伴勾结       │ 结算对账               │ 暂停合作伙伴            │
│ 拆分交易           │ 时间/距离规则          │ 合并 + 设上限           │
│ 多账户             │ 设备指纹               │ 关联 + 合并账户         │
│ 虚假收据           │ POS 对账               │ 撤销 + 调查             │
└────────────────────┴────────────────────────┴─────────────────────────┘
```

---

## 11. 深入探讨：合作伙伴集成

### 合作伙伴赚取/消费流程

```
合作伙伴 POS/API -> 合作伙伴网关 -> 积分引擎 -> 积分账本

赚取: 合作伙伴通过 POST /v1/partners/earn 提交购买（API key 认证）。
  网关验证，映射类别，应用合作伙伴赚取费率。
  积分引擎写入带合作伙伴归属的账本。事件 -> 结算。

消费: 会员在合作伙伴处出示 ID。合作伙伴调用 POST /v1/partners/burn。
  网关认证，积分引擎执行 FIFO 兑换。
  合作伙伴收到确认 + 结算追踪 ID。
```

### 计划间积分转移

```python
def transfer_points(source_member_id, target_program_id, points_amount):
    """Transfer points to partner program. Applies conversion rate, records settlement."""
    partner = db.query(
        "SELECT * FROM partners WHERE partner_id=%s AND partner_type IN ('transfer','earn_and_burn')",
        [target_program_id])
    if not partner: raise PartnerNotFoundException(target_program_id)

    converted_points = int(points_amount * partner.conversion_rate)  # e.g., 1000 pts * 0.5 = 500 miles

    with db.transaction():
        deductions = consume_points_fifo(source_member_id, points_amount)
        balance = db.query(
            "SELECT available, version FROM points_balances WHERE member_id=%s AND point_type='base' FOR UPDATE",
            [source_member_id])

        db.execute("""INSERT INTO points_ledger (member_id, idempotency_key, entry_type, point_type,
                      points, balance_before, balance_after, source_type, partner_id)
                      VALUES (%s,%s,'transfer_out','base',%s,%s,%s,'transfer',%s)""",
                   [source_member_id, f"transfer_{source_member_id}_{target_program_id}_{datetime.utcnow().isoformat()}",
                    -points_amount, balance.available, balance.available - points_amount, target_program_id])
        db.execute("UPDATE points_balances SET available=available-%s, version=version+1 WHERE member_id=%s AND point_type='base' AND version=%s",
                   [points_amount, source_member_id, balance.version])

    # Call partner API to credit converted points
    partner_response = partner_gateway.credit_partner(target_program_id, source_member_id, converted_points)

    # Upsert daily settlement record
    db.execute("""INSERT INTO partner_settlements (partner_id, period_start, period_end,
                  total_burn_points, total_burn_amount, transaction_count, status)
                  VALUES (%s, CURRENT_DATE, CURRENT_DATE, %s, %s, 1, 'pending')
                  ON CONFLICT (partner_id, period_start, period_end) DO UPDATE SET
                    total_burn_points = partner_settlements.total_burn_points + EXCLUDED.total_burn_points,
                    total_burn_amount = partner_settlements.total_burn_amount + EXCLUDED.total_burn_amount,
                    transaction_count = partner_settlements.transaction_count + 1""",
               [target_program_id, points_amount, points_amount * 0.01])

    redis.delete(f"balance:{source_member_id}")
    return {"transferred": points_amount, "converted": converted_points,
            "partner": partner.partner_name, "confirmation": partner_response.confirmation_id}
```

### 每日结算对账

```sql
-- 净结算: 正数 = 合作伙伴欠我们, 负数 = 我们欠合作伙伴
SELECT
    COALESCE(SUM(CASE WHEN entry_type='earn' THEN points END), 0)          AS earn_points,
    COALESCE(SUM(CASE WHEN entry_type='earn' THEN points * 0.01 END), 0)   AS earn_cost,
    COALESCE(SUM(CASE WHEN entry_type='redeem' THEN ABS(points) END), 0)   AS burn_points,
    COALESCE(SUM(CASE WHEN entry_type='redeem' THEN ABS(points)*0.008 END),0) AS burn_revenue,
    COALESCE(SUM(CASE WHEN entry_type='earn' THEN points*0.01 END),0)
      - COALESCE(SUM(CASE WHEN entry_type='redeem' THEN ABS(points)*0.008 END),0) AS net_settlement
FROM points_ledger
WHERE partner_id = $1 AND entry_type IN ('earn','redeem')
  AND created_at >= CURRENT_DATE AND created_at < CURRENT_DATE + INTERVAL '1 day';
```

### 合作伙伴集成架构

```
合作伙伴网关组件:
  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │ 合作伙伴 │  │  费率    │  │ 适配器   │  │ 请求     │  │ 对账     │
  │  认证     │->│ 转换器   │->│ 注册表   │->│ 验证器   │  │ 引擎     │
  │(API Key) │  │(每合作伙 │  │(每合作伙 │  │          │  │(每日)    │
  └──────────┘  │伴)       │  │伴映射)   │  └──────────┘  └──────────┘
                └──────────┘  └──────────┘
适配器模式: 每个合作伙伴都有一个专用适配器，负责在其 API 格式
和我们的内部格式之间进行转换。新增合作伙伴只需要一个新的适配器
实现 — 无需修改核心服务。
```

---

## 12. 扩展策略

### 按会员分片

```
分片键: member_id（一致性哈希），16 个数据库节点上 64 个分片（每节点 4 个）
路由:   shard_id = consistent_hash(member_id) % 64

为什么选择 member_id？
  - 所有核心操作（赚取、兑换、余额）都是会员范围的 — 无跨会员 join
  - 基于 UUID 的 ID 确保均匀分布
  - 账本、余额、批次全部共同定位在同一分片上

每分片表: points_ledger, points_balances, point_lots, members
全局表（复制，不分片）: tiers, earning_rules, rewards, partners

跨分片操作:
  - 会员之间积分转移: Saga 模式
  - 结算聚合: 从所有分片扇出/扇入
  - 对账: 每分片并行处理，合并结果
```

### 处理闪促活动（80K TPS 突发）

```
问题: 双倍积分日导致 3-4 倍正常流量
解决方案: 多层缓冲

L1: API 网关限流（每会员: 10/秒，全局: 100K/秒）
L2: 通过 Kafka 异步赚取（同步接受，异步处理，"pending" -> 在 <5s 内确认）
L3: 预扩展基础设施（已知促销: 预扩展数据库连接，自动扩展消费者）
L4: 写后缓存（Redis 余额乐观更新，数据库写入批量处理）

  API 网关 (100K/s) -> Kafka 缓冲 -> 积分引擎 (30K/s) -> 数据库分片
                           延迟: 平均 <5s, 最大 <30s
```

### 读密集型余额查询

```
余额读取: ~每天 2 亿次（读写比 ~300:1）。多级缓存:

  L1: 客户端缓存（移动端）     TTL 30s，赚取/兑换后通过推送失效
  L2: CDN / API 网关          TTL 10s，缓存键: member_id + ETag（60% 命中率）
  L3: Redis                   TTL 5s，写入时失效（L2 未命中的 95% 命中率）
  L4: 只读副本 (PG)           < 100ms 延迟，用于交易历史和非关键读取
  L5: 主库                    权威: 仅用于兑换和余额写入

有效数据库负载: 200M * (1 - 0.60) * (1 - 0.95) = 400万次读取/天 = ~46 读取/秒
```

---

## 13. 部署架构

```
区域: US-EAST-1（主区域）
═══════════════════════════
    ALB (TLS, WAF) -> API 网关 (Kong: 限流, 认证, 路由, 幂等)
                        │
        ┌───────────────┼───────────────┬───────────────┬───────────────┐
        ▼               ▼               ▼               ▼               ▼
   积分引擎        等级引擎       奖励目录       合作伙伴网关     欺诈检测
     (6 pods)       (3 pods)       (3 pods)         (3 pods)         (3 pods)
        │               │               │               │               │
        └───────────────┴───────────────┴───────────────┴───────────────┘
                                        │
                              KAFKA (3 brokers)
                   points.earned (64p) │ points.redeemed (64p)
                   points.expired (32p)│ tier.changed (16p)
                   partner.txn (32p)   │ fraud.signals (16p)
                                        │
        ┌───────────────────────────────┴──────────────────────────────┐
        │                         数据层                                │
        │  PostgreSQL: 64 分片, 16 节点（每个主库 + 2 副本）            │
        │  Redis: 6 节点 (3P + 3R)                                    │
        │    键: balance:{id}, tier:{id}, rules:active, fraud:*        │
        │  Elasticsearch: 3 节点（交易搜索，目录搜索）                   │
        │  S3: 账本归档 (Parquet), 审计日志, 结算报告                   │
        └─────────────────────────────────────────────────────────────┘

批量作业:
  过期处理器（每小时）     │  等级评估器（每夜）
  结算对账器（每日）       │  账本归档器（每日）
  通知调度器（每小时）

区域: US-WEST-2（灾备）
═══════════════════════
  异步复制（< 1 秒延迟）: PG streaming, Kafka MirrorMaker 2, Redis sentinel
  故障切换: RTO < 10 分钟, RPO < 1 秒
```

---

## 14. 常见面试追问

**问：如何在并发兑换中防止积分双重消费？**

答：积分余额使用带 `version` 列的乐观并发控制。处理兑换时，我们对会员的余额行执行 `SELECT ... FOR UPDATE`，获取行级锁。`UPDATE points_balances SET available = available - 400 WHERE member_id = ? AND available >= 400 AND version = ?` 确保了原子性。如果两个并发兑换竞争，第一个提交并递增版本。第二个发现版本不匹配（0 行更新），重试，然后要么成功（如果余额充足），要么因余额不足而失败。`CHECK (available >= 0)` 约束是数据库层面的最终安全网。

**问：如何处理积分已赚取后购买被退款的情况？**

答：我们将购买退款处理为积分回收。当合作伙伴或 POS 通知我们退款时（使用原始交易 ID 作为幂等性引用），我们在积分账本中为该交易赚取的确切积分创建一个负数的 `adjust` 条目。赚取条目的 `source_id` 链接回原始交易，因此我们可以计算需要撤销的确切积分（包括任何适用的等级奖励）。如果会员已经兑换了这些积分且其余额将变为负数，我们暂时允许负余额，并在下次赚取事件时恢复，或者根据业务策略在 90 天后注销该债务。

**问：如果过期批处理作业中途失败会怎样？**

答：过期处理器使用 `FOR UPDATE SKIP LOCKED` 按批次获取批次。每个批次在其自己的迷你事务中过期（批次更新 + 账本条目 + 余额更新），因此中途失败会使一些批次过期而其他批次保持不变。在下次运行时（每小时），剩余批次会被拾取，因为它们仍然满足 `expires_at <= NOW()`。`SKIP LOCKED` 确保多个处理器实例可以并行运行而不会在相同行上竞争。幂等键（`expire_{lot_id}`）防止批次被部分处理时的双重过期。

**问：如何确保赚取规则的变更正确生效而不影响进行中的交易？**

答：赚取规则是有版本的，缓存在 Redis 中，TTL 为 60 秒。当数据库中的规则更新时，缓存被失效。已加载旧规则的进行中交易将使用这些规则完成（赚取事件记录所使用的 `earning_rule_id`）。规则具有 `effective_from` 和 `effective_to` 时间戳，因此新规则可以提前安排。我们从不修改现有规则；而是停用旧规则并创建新版本。审计轨迹始终显示每个赚取事件使用了哪个规则版本。

**问：如何支持"状态匹配"，即来自竞争计划的会员获得等效等级状态？**

答：状态匹配通过等级引擎作为管理员操作实现。管理员创建一个 `change_type = 'status_match'` 的 `tier_history` 条目，将会员升级到匹配的等级。状态匹配有一个有限的资格窗口（通常为 90 天），在此期间会员必须赚取足够的资格积分来自然保留该等级。我们在 `tier_history.reason` 字段中存储状态匹配元数据（来源计划、证明文件 ID）。如果会员在窗口内未达标，则降级到其实际资格积分支持的等级。这由等级引擎中相同的宽限期逻辑处理。

**问：如何处理两个会员之间的积分转移（如家庭积分池）？**

答：跨会员转移是跨分片操作，因为两个会员可能在不同的数据库分片上。我们使用 Saga 模式：(1) 从源会员扣除积分（在分片 A 上写账本条目 + 更新余额），(2) 向 Kafka 发布 `transfer.initiated` 事件，(3) 给目标会员贷记积分（在分片 B 上写账本条目 + 更新余额），(4) 发布 `transfer.completed` 事件。如果步骤 3 失败，补偿步骤将退还源会员。双方都使用从转移 ID 派生的幂等键，因此重试是安全的。家庭账户有一个共享的 `household_id` 和可配置的每月转移限额以防止滥用。

**问：积分系统背后的财务会计模型是什么？**

答：积分代表公司资产负债表上的递延收入负债。当积分被赚取时，我们确认一项负债（每积分成本，通常为 $0.005-$0.02，取决于计划）。当积分被兑换时，负债减少并确认奖励成本。当积分过期时，负债作为"破损收入"释放。积分账本直接支持此会计：每个 `earn` 条目增加负债，每个 `redeem` 减少负债，每个 `expire` 释放负债。结算引擎生成每日日记账分录，输入到总账（GL）系统。我们维护一个每积分成本费率表，将积分类型映射到美元值用于财务报告。

**问：如何为 2 亿会员扩展等级评估？**

答：实时等级评估仅在赚取事件时运行（搭载在赚取交易上）。这可以即时处理升级。对于降级和续期，每夜批处理作业跨所有分片并行运行。每个分片独立处理其会员（等级评估不需要跨分片协调）。批处理作业使用 `(member_id, entry_type, point_type, created_at)` 上的覆盖索引查询 `points_ledger` 来高效计算资格积分。窗口未到期的会员被完全跳过。实际上，任何给定的夜晚只有约 5% 的会员（1000 万）需要等级重新评估。在 64 个分片上每个分片每秒 1,000 次评估，整个批处理在 3 分钟内完成。

**问：如何确保合作伙伴结算的准确性？**

答：结算准确性通过三步对账流程保证。(1) 我们的系统从 `points_ledger`（按 `partner_id` 过滤）为每个合作伙伴生成每日结算报告。(2) 合作伙伴通过文件传输或 API 提供他们对同一天交易的视图。(3) 对账引擎通过幂等键（或交易 ID + 时间戳）匹配记录。差异被分类为"我方缺失"、"对方缺失"或"金额不匹配"。低于阈值（$100/天）的差异在下一个结算周期自动解决。超过阈值的差异被标记为人工调查。每个合作伙伴结算都有一个争议窗口（通常为 7 天），之后通过 ACH 或电汇最终完成财务结算。

---

## 15. 总结

### 关键架构决策

| 决策 | 选定方案 | 替代方案 | 原因 |
|------|----------|----------|------|
| 积分账本 | 不可变的 append-only 日志 + 物化余额 | 读取时从账本计算余额 | 在 8K+ TPS 下 O(1) 余额读取；每夜对账捕获偏差 |
| FIFO 过期 | 积分批次表跟踪每次赚取批次的剩余 | 单一余额加最早过期指针 | 批次级跟踪支持精确的 FIFO 消费和部分过期 |
| 等级评估 | 赚取时实时 + 每夜批处理降级 | 纯批处理（每夜） | 即时升级满足感；批处理足以处理降级（非时间敏感） |
| 赚取规则 | 可配置的规则引擎，支持优先级 + 叠加 | 硬编码赚取费率 | 业务需要频繁更改规则（活动、合作伙伴交易）而无需代码部署 |
| 分片键 | member_id | partner_id 或组合键 | 所有核心操作都是会员范围的；避免赚取/兑换的跨分片事务 |
| 兑换模型 | 两阶段（冻结 + 确认） | 直接扣除 | 支持履约失败、实物奖励和合作伙伴消费确认 |
| 欺诈检测 | 赚取/兑换时同步评分（< 50ms） | 异步交易后分析 | 防止欺诈积分进入系统；异步分析用于模式检测 |
| 合作伙伴集成 | 每个合作伙伴的适配器模式 | 通用 API | 合作伙伴有不同的格式、认证、类别；适配器隔离转换逻辑 |
| 过期处理 | 每小时批处理加 SKIP LOCKED | 余额读取时实时处理 | 批处理更节约成本；每小时粒度可接受（非功能需求：最多延迟 1 小时） |
| 余额缓存 | 多级（客户端、CDN、Redis、副本、主库） | 仅 Redis | CDN 层减少 60% Redis 负载；5 秒陈旧度对显示可接受 |
| 跨会员转移 | Saga 模式 | 2PC | Saga 优雅地容忍部分失败；2PC 会跨分片阻塞 |
| 结算 | 每日批量对账加争议窗口 | 实时结算 | 每日批处理更简单，与财务报告周期对齐，容忍临时差异 |

### 关键权衡

```
一致性 vs. 性能:     写入强一致（赚取/兑换），读取最终一致（缓存）
简单性 vs. 灵活性:   规则引擎 + FIFO 批次增加复杂度但实现业务敏捷性
成本 vs. 延迟:       多级缓存 + 异步闪促处理以陈旧度换取规模
可用性 vs. 准确性:   99.99% 可用性加每夜对账作为安全网
```

---

*涵盖：double-entry 积分账本、带批次跟踪的 FIFO 过期、可配置赚取规则引擎、带滚动窗口的等级资格、两阶段兑换、欺诈检测管道、带结算对账的合作伙伴集成、按会员水平分片、闪促缓冲、多级余额缓存。*
