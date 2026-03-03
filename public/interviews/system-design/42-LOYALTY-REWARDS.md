# Design a Loyalty & Rewards System

A loyalty and rewards system incentivizes repeat customer behavior by awarding points for purchases and activities, organizing members into tiers with escalating benefits, and allowing redemption of points for rewards. Think Starbucks Rewards, airline frequent-flyer programs, or credit card points systems. The core challenge is building a points ledger that guarantees no double-spend while supporting high-throughput earning and redemption across a network of partners.

---

## Table of Contents

1. [Requirements Clarification](#1-requirements-clarification)
2. [API Design](#2-api-design)
3. [Data Model](#3-data-model)
4. [High-Level Architecture](#4-high-level-architecture)
5. [Deep Dive: Points Ledger](#5-deep-dive-points-ledger)
6. [Deep Dive: Earning Rules Engine](#6-deep-dive-earning-rules-engine)
7. [Deep Dive: Tier Calculation](#7-deep-dive-tier-calculation)
8. [Deep Dive: Redemption Flow](#8-deep-dive-redemption-flow)
9. [Deep Dive: Points Expiration](#9-deep-dive-points-expiration)
10. [Deep Dive: Fraud Prevention](#10-deep-dive-fraud-prevention)
11. [Deep Dive: Partner Integration](#11-deep-dive-partner-integration)
12. [Scaling Strategy](#12-scaling-strategy)
13. [Deployment Architecture](#13-deployment-architecture)
14. [Common Interview Follow-ups](#14-common-interview-follow-ups)
15. [Summary](#15-summary)

---

## 1. Requirements Clarification

### Functional Requirements

| # | Requirement | Description |
|---|-------------|-------------|
| 1 | Points Earning | Award points on qualifying purchases and activities; support base earn rates, multipliers, and promotional bonuses |
| 2 | Points Redemption | Redeem points for rewards from a catalog (products, discounts, gift cards, experiences); support partial redemption |
| 3 | Tier Management | Classify members into tiers (e.g., Silver, Gold, Platinum) based on qualifying activity over a rolling window; auto-upgrade and downgrade |
| 4 | Rewards Catalog | Maintain a catalog of redeemable rewards with point costs, inventory, availability windows, and eligibility rules |
| 5 | Transaction History | Provide members with a complete, paginated ledger of all earn/redeem/expire/adjust events |
| 6 | Partner Integrations | Earn and burn points with partner merchants; support points transfer between loyalty programs |
| 7 | Points Expiration | Expire unused points based on configurable policies; notify members before expiry; extend expiration on qualifying activity |
| 8 | Balance Inquiry | Real-time points balance with breakdown by point type (base, bonus, promotional) and expiration date |
| 9 | Bonus Campaigns | Time-limited promotions (2x points weekends, birthday bonuses, sign-up bonuses) |
| 10 | Account Linking | Link loyalty accounts to payment methods, partner accounts, and household/family sharing |

### Non-Functional Requirements

| # | Requirement | Target |
|---|-------------|--------|
| 1 | Points consistency | Zero double-spend; balance must never go negative |
| 2 | Availability | 99.99% uptime (< 1 hour downtime/year) |
| 3 | Earning latency | < 500ms for points posting after transaction (p99) |
| 4 | Redemption latency | < 300ms for redemption confirmation (p99) |
| 5 | Fraud prevention | Real-time fraud scoring on every earn/redeem event |
| 6 | Auditability | Complete, immutable audit trail for every points movement |
| 7 | Idempotency | Duplicate transaction submissions must not double-award points |
| 8 | Scalability | Support 200M members, 500M earn events/day, 50M redemptions/day |
| 9 | Expiration accuracy | Points must expire on the correct date, never early, at-most 1 hour late |
| 10 | Partner settlement | Daily reconciliation with partner systems; discrepancies flagged within 24 hours |

### Capacity Estimation

```
Members:              200,000,000 (200M)
Active members/day:    40,000,000 (20% DAU)
Earn events/day:      500,000,000 (500M) — includes micro-earns (scans, check-ins)
Redemptions/day:       50,000,000 (50M)
Partner earn events:  100,000,000 (100M/day across all partners)

TPS (average):
  Earn:     500M / 86,400s = ~5,787 TPS
  Redeem:    50M / 86,400s = ~579 TPS
  Balance:  200M / 86,400s = ~2,315 TPS (balance checks)
  Total:    ~8,700 TPS average

Peak TPS (3x average, concentrated in 8-hour window):
  Total: ~26,000 TPS
  Flash promotions: ~80,000 TPS (double-points day)

Storage:
  Member record:        ~500 bytes  -> 200M * 500B = 100 GB
  Points ledger entry:  ~300 bytes  -> 600M/day * 300B = 180 GB/day
  Tier history record:  ~200 bytes  -> 10M changes/month * 200B = 2 GB/month
  Reward catalog:       ~2 KB       -> 100K rewards * 2KB = 200 MB
  Partner transactions: ~400 bytes  -> 100M/day * 400B = 40 GB/day

  Daily write volume: ~220 GB/day
  Annual storage:     ~80 TB/year (before compression)
  After compression:  ~20 TB/year (4:1 on structured data)

  5-year retention: ~100 TB compressed

Cache (hot data):
  Active member balances: 40M * 200 bytes = 8 GB — fits in Redis cluster
  Earning rules:          ~10 MB (in-memory)
  Tier thresholds:        ~1 MB (in-memory)
```

---

## 2. API Design

### Points Earning API

```
POST   /v1/earn                                 Award points for a transaction
GET    /v1/earn/preview                         Preview points before purchase
```

**POST /v1/earn Request:**
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

**POST /v1/earn Response (201 Created):**
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

### Points Redemption API

```
POST   /v1/redemptions                          Redeem points for a reward
POST   /v1/redemptions/hold                     Place a temporary hold on points
POST   /v1/redemptions/{holdId}/confirm         Confirm a held redemption
POST   /v1/redemptions/{holdId}/release         Release a held redemption
POST   /v1/redemptions/{redemptionId}/refund    Refund a redemption (return points)
GET    /v1/redemptions/{redemptionId}           Get redemption status
```

**POST /v1/redemptions Request:**
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

**POST /v1/redemptions Response (201 Created):**
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

### Balance & Tier API

```
GET    /v1/members/{memberId}/balance            Get points balance with breakdown
GET    /v1/members/{memberId}/tier               Get current tier and progress
GET    /v1/members/{memberId}/balance/expiring    Get points expiring soon
```

**GET /v1/members/{memberId}/balance Response:**
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

**GET /v1/members/{memberId}/tier Response:**
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

### Rewards Catalog API

```
GET    /v1/rewards?category=&tier=&points_min=&points_max=&page=&limit=
GET    /v1/rewards/{rewardId}
GET    /v1/rewards/{rewardId}/availability
POST   /v1/rewards                              (admin: create reward)
PATCH  /v1/rewards/{rewardId}                   (admin: update reward)
```

**GET /v1/rewards Response:**
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

### Transaction History API

```
GET    /v1/members/{memberId}/transactions?type=&from=&to=&page=&limit=
GET    /v1/transactions/{transactionId}
```

**GET /v1/members/{memberId}/transactions Response:**
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

### Partner API

```
POST   /v1/partners/earn                        Partner submits an earn event
POST   /v1/partners/burn                        Partner redeems on behalf of member
POST   /v1/transfers                            Transfer points between programs
GET    /v1/partners/{partnerId}/settlement       Get settlement summary
```

---

## 3. Data Model

### Members Table

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

### Points Balances Table (Materialized Summary)

```sql
CREATE TABLE points_balances (
    balance_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id       UUID NOT NULL REFERENCES members(member_id),
    point_type      VARCHAR(20) NOT NULL,      -- 'base','bonus','promotional'
    available       BIGINT NOT NULL DEFAULT 0,
    held            BIGINT NOT NULL DEFAULT 0,  -- reserved during redemption hold
    version         BIGINT NOT NULL DEFAULT 0,  -- optimistic concurrency control
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_member_point_type UNIQUE (member_id, point_type),
    CONSTRAINT non_negative_available CHECK (available >= 0),
    CONSTRAINT non_negative_held     CHECK (held >= 0)
);

CREATE INDEX idx_balances_member ON points_balances(member_id);
```

### Points Ledger Table (Double-Entry, Immutable)

```sql
CREATE TABLE points_ledger (
    entry_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id           UUID NOT NULL REFERENCES members(member_id),
    idempotency_key     VARCHAR(255) NOT NULL,
    entry_type          VARCHAR(20) NOT NULL,
                        -- 'earn','redeem','expire','adjust','transfer_in',
                        -- 'transfer_out','hold','release','refund'
    point_type          VARCHAR(20) NOT NULL,  -- 'base','bonus','promotional'
    points              BIGINT NOT NULL,       -- positive for credit, negative for debit
    balance_before      BIGINT NOT NULL,
    balance_after       BIGINT NOT NULL,
    source_type         VARCHAR(30),           -- 'purchase','activity','partner','campaign','admin'
    source_id           VARCHAR(255),          -- transaction_id, campaign_id, etc.
    partner_id          UUID,
    earning_rule_id     UUID,
    reward_id           UUID,
    expires_at          TIMESTAMPTZ,           -- when these earned points expire
    description         TEXT,
    metadata            JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_entry_type CHECK (
        entry_type IN ('earn','redeem','expire','adjust',
                       'transfer_in','transfer_out','hold','release','refund')
    ),
    CONSTRAINT balance_consistency CHECK (balance_after = balance_before + points)
);

-- Immutable: no UPDATE or DELETE allowed (enforced by DB trigger)
CREATE UNIQUE INDEX idx_ledger_idempotency ON points_ledger(idempotency_key);
CREATE INDEX idx_ledger_member_time        ON points_ledger(member_id, created_at DESC);
CREATE INDEX idx_ledger_member_type        ON points_ledger(member_id, entry_type);
CREATE INDEX idx_ledger_expiration         ON points_ledger(expires_at)
    WHERE entry_type = 'earn' AND expires_at IS NOT NULL;
CREATE INDEX idx_ledger_partner            ON points_ledger(partner_id, created_at DESC);
CREATE INDEX idx_ledger_source             ON points_ledger(source_type, source_id);
```

### Point Lots Table (FIFO Expiration Tracking)

```sql
CREATE TABLE point_lots (
    lot_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id       UUID NOT NULL REFERENCES members(member_id),
    ledger_entry_id UUID NOT NULL REFERENCES points_ledger(entry_id),
    point_type      VARCHAR(20) NOT NULL,
    original_points BIGINT NOT NULL,
    remaining_points BIGINT NOT NULL,
    earned_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ,              -- NULL means never expires
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

### Tiers Table

```sql
CREATE TABLE tiers (
    tier_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tier_name       VARCHAR(50) NOT NULL UNIQUE,  -- 'green','silver','gold','platinum'
    tier_level      SMALLINT NOT NULL UNIQUE,      -- 0, 1, 2, 3 (for ordering)
    qualification_threshold BIGINT NOT NULL,        -- qualifying points needed
    retention_threshold     BIGINT NOT NULL,        -- points to retain tier at renewal
    earning_multiplier      NUMERIC(4,2) NOT NULL DEFAULT 1.00,
    benefits        JSONB NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed data
INSERT INTO tiers (tier_name, tier_level, qualification_threshold, retention_threshold, earning_multiplier, benefits) VALUES
('green',    0,     0,     0, 1.00, '["basic_rewards","birthday_treat"]'),
('silver',   1,  2000,  1500, 1.25, '["25%_bonus_earning","free_drink_upgrade","monthly_double_points_day"]'),
('gold',     2,  5000,  4000, 1.50, '["50%_bonus_earning","free_birthday_reward","priority_support","early_promos"]'),
('platinum', 3, 10000,  8000, 2.00, '["100%_bonus_earning","concierge_service","partner_lounge_access","annual_gift"]');
```

### Tier History Table

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

### Earning Rules Table

```sql
CREATE TABLE earning_rules (
    rule_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_name       VARCHAR(100) NOT NULL,
    rule_type       VARCHAR(30) NOT NULL,
                    -- 'spend_based','activity_based','partner','campaign','signup'
    partner_id      UUID,
    category        VARCHAR(50),               -- purchase category filter
    channel         VARCHAR(30),               -- 'in_store','online','app','partner'
    base_rate       NUMERIC(10,4) NOT NULL,    -- points per unit (e.g., 2 pts per $1)
    rate_unit       VARCHAR(20) NOT NULL,      -- 'per_dollar','per_transaction','flat'
    min_transaction NUMERIC(10,2),             -- minimum qualifying amount
    max_points_per_txn BIGINT,                 -- cap per transaction
    max_points_per_day BIGINT,                 -- daily cap
    point_type      VARCHAR(20) NOT NULL DEFAULT 'base',
    tier_multipliers JSONB,                    -- {"silver":1.25,"gold":1.5,"platinum":2.0}
    priority        SMALLINT NOT NULL DEFAULT 100,
    is_stackable    BOOLEAN NOT NULL DEFAULT true,
    effective_from  TIMESTAMPTZ NOT NULL,
    effective_to    TIMESTAMPTZ,               -- NULL means no end date
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

### Rewards Table

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
    total_inventory BIGINT,                   -- NULL if unlimited
    remaining_inventory BIGINT,
    daily_limit     BIGINT,                   -- per-member daily redemption limit
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

### Redemptions Table

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
    hold_expires_at TIMESTAMPTZ,              -- for two-phase redemption
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

### Partners Table

```sql
CREATE TABLE partners (
    partner_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_name    VARCHAR(200) NOT NULL,
    partner_type    VARCHAR(30) NOT NULL,      -- 'earn','burn','earn_and_burn','transfer'
    api_key_hash    VARCHAR(128) NOT NULL,
    webhook_url     TEXT,
    earn_rate       NUMERIC(10,4),             -- points per dollar spent at partner
    burn_rate       NUMERIC(10,4),             -- dollar value per point for partner burns
    conversion_rate NUMERIC(10,6),             -- for points transfer between programs
    settlement_frequency VARCHAR(20) NOT NULL DEFAULT 'daily',
    status          VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_partners_status ON partners(status);
```

### Partner Settlement Table

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

### Idempotency Keys Table

```sql
CREATE TABLE idempotency_keys (
    idempotency_key VARCHAR(255) PRIMARY KEY,
    member_id       UUID NOT NULL,
    endpoint        VARCHAR(100) NOT NULL,
    request_hash    CHAR(64) NOT NULL,         -- SHA-256 of request body
    response_status SMALLINT,
    response_body   JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours'
);

CREATE INDEX idx_idem_member ON idempotency_keys(member_id);
CREATE INDEX idx_idem_expiry ON idempotency_keys(expires_at);
```

---

## 4. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                       │
│   Mobile App    │    Web App    │   POS Terminal   │   Partner System            │
└────────┬────────┴───────┬───────┴────────┬─────────┴──────────┬─────────────────┘
         │                │                │                    │
         ▼                ▼                ▼                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            API GATEWAY                                          │
│   Rate Limiting  │  Auth (JWT/API Key)  │  Request Routing  │  Idempotency      │
└────────┬────────┬───────┬───────┬───────┬────────┬──────────┬───────────────────┘
         │        │       │       │       │        │          │
         ▼        │       ▼       │       ▼        │          ▼
┌────────────┐    │ ┌──────────┐  │ ┌──────────┐   │  ┌──────────────┐
│   Points   │    │ │   Tier   │  │ │ Rewards  │   │  │   Partner    │
│   Engine   │    │ │  Engine  │  │ │ Catalog  │   │  │   Gateway    │
│            │    │ │          │  │ │ Service  │   │  │              │
│ - Earn     │    │ │ - Calc   │  │ │ - Browse │   │  │ - Earn/Burn  │
│ - Redeem   │    │ │ - Up/Down│  │ │ - Avail  │   │  │ - Transfer   │
│ - Balance  │    │ │ - Grace  │  │ │ - Invent │   │  │ - Settlement │
│ - Expire   │    │ │ - Status │  │ │          │   │  │              │
└─────┬──────┘    │ └────┬─────┘  │ └────┬─────┘   │  └──────┬───────┘
      │           │      │        │      │         │         │
      ▼           ▼      ▼        ▼      ▼         ▼         ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          EVENT BUS (Kafka)                                       │
│  points.earned │ points.redeemed │ points.expired │ tier.changed │ partner.txn   │
└────────┬────────┬───────┬────────┬───────┬────────┬─────────┬───────────────────┘
         │        │       │        │       │        │         │
         ▼        │       ▼        │       ▼        │         ▼
┌────────────┐    │ ┌──────────┐   │ ┌──────────┐   │  ┌──────────────┐
│   Fraud    │    │ │Notifica- │   │ │Settlement│   │  │  Earning     │
│ Detection  │    │ │  tion    │   │ │  Engine  │   │  │  Rules       │
│  Service   │    │ │ Service  │   │ │          │   │  │  Engine      │
└────────────┘    │ └──────────┘   │ └──────────┘   │  └──────────────┘
                  │                │                │
                  ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          DATA LAYER                                             │
│  PostgreSQL     │    Redis        │    S3            │   Elasticsearch           │
│  (Points Ledger │  (Balances,     │  (Audit Archive, │  (Transaction Search,     │
│   Tiers, Rules) │   Rules Cache,  │   Ledger Archive)│   Reward Catalog Search)  │
│                 │   Session)      │                  │                           │
└─────────────────┴─────────────────┴──────────────────┴───────────────────────────┘
```

### Service Responsibilities

| Service | Responsibility | Data Store |
|---------|---------------|------------|
| Points Engine | Core earn/redeem/balance operations, ledger writes | PostgreSQL (primary), Redis (balance cache) |
| Tier Engine | Calculate tier qualification, upgrade/downgrade | PostgreSQL, Redis (tier cache) |
| Rewards Catalog Service | Manage reward inventory, eligibility | PostgreSQL, Elasticsearch (search) |
| Earning Rules Engine | Evaluate rules, calculate points per transaction | PostgreSQL, Redis (rules cache) |
| Partner Gateway | Partner API translation, rate conversion, auth | PostgreSQL (partner config) |
| Fraud Detection Service | Real-time scoring, velocity checks | Redis (counters), ML model serving |
| Settlement Engine | Daily reconciliation, net settlement calculation | PostgreSQL (settlement tables) |
| Notification Service | Push, email, SMS for earn/redeem/expire events | Kafka consumer, push gateway |

---

## 5. Deep Dive: Points Ledger

### Double-Entry Bookkeeping for Points

Every points movement is recorded as an immutable ledger entry. The ledger is the source of truth; the `points_balances` table is a materialized view for fast reads.

```
┌──────────────────────────────────────────────────────────────────────┐
│                    POINTS LEDGER MODEL                               │
│                                                                      │
│  Every entry:  balance_after = balance_before + points               │
│                                                                      │
│  EARN:    points > 0   (credit to member)                            │
│  REDEEM:  points < 0   (debit from member)                           │
│  EXPIRE:  points < 0   (debit from member, source_type='expiration') │
│  ADJUST:  points > 0 or < 0 (admin correction, requires approval)   │
│  HOLD:    points < 0   (temporary reservation for pending redeem)    │
│  RELEASE: points > 0   (cancel the hold, return points)             │
│  REFUND:  points > 0   (reverse a redemption)                        │
│                                                                      │
│  Invariant: SUM(points) for member = current available balance       │
│             (excluding held amounts)                                 │
└──────────────────────────────────────────────────────────────────────┘
```

### Earn Transaction Flow

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

### Balance Calculation Strategy

```
┌──────────────────────────────────────────────────────────────┐
│                 BALANCE READ STRATEGY                         │
│                                                              │
│  HOT PATH (99% of reads):                                    │
│    1. Check Redis cache: balance:{member_id}                 │
│    2. If hit + TTL valid -> return cached balance             │
│    3. If miss -> read from points_balances table              │
│    4. Populate cache (TTL = 5 seconds)                       │
│                                                              │
│  AUTHORITATIVE (for redemptions):                            │
│    1. SELECT ... FROM points_balances FOR UPDATE             │
│    2. Always reads from primary DB, never cache              │
│                                                              │
│  RECONCILIATION (nightly):                                   │
│    1. SUM(points) FROM points_ledger GROUP BY member_id      │
│    2. Compare with points_balances.available                 │
│    3. Alert on any discrepancy > 0                           │
│    4. Auto-correct with 'adjust' entry if within threshold   │
└──────────────────────────────────────────────────────────────┘
```

### Nightly Reconciliation Query

```sql
-- Find discrepancies between ledger sum and materialized balance
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

## 6. Deep Dive: Earning Rules Engine

### Rule Evaluation Pipeline

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│ Incoming │     │  Filter  │     │ Calculate│     │  Apply   │     │  Apply   │
│ Txn      │────>│ Eligible │────>│ Base     │────>│ Tier     │────>│ Caps &   │
│          │     │ Rules    │     │ Points   │     │ Multiplier│    │ Limits   │
└──────────┘     └──────────┘     └──────────┘     └──────────┘     └──────────┘
                                                                         │
                 ┌──────────┐     ┌──────────┐     ┌──────────┐         │
                 │ Output   │<────│ Combine  │<────│ Add      │<────────┘
                 │ Awards   │     │ Awards   │     │ Promo    │
                 │          │     │          │     │ Bonuses  │
                 └──────────┘     └──────────┘     └──────────┘
```

### Rule Evaluation Logic

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

### Example Earning Rules Configuration

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ Rule: "Base Earn"                                                                │
│ Type: spend_based | Rate: 2 pts/$1 | Channel: all | Category: all               │
│ Tier Multipliers: silver=1.25x, gold=1.5x, platinum=2.0x                        │
│ Stackable: yes | Priority: 100                                                  │
├──────────────────────────────────────────────────────────────────────────────────┤
│ Rule: "Food & Beverage Bonus"                                                    │
│ Type: spend_based | Rate: 3 pts/$1 | Channel: all | Category: food_and_beverage │
│ Stackable: no (replaces base earn for this category) | Priority: 50             │
├──────────────────────────────────────────────────────────────────────────────────┤
│ Rule: "Partner - Airlines"                                                       │
│ Type: partner | Rate: 1 pt/$1 | Partner: ptr_airline_001                        │
│ Min Transaction: $25 | Max/txn: 5000 | Stackable: yes | Priority: 100          │
├──────────────────────────────────────────────────────────────────────────────────┤
│ Rule: "Happy Hour Campaign"                                                      │
│ Type: campaign | Rate: 100 pts (flat) | Category: food_and_beverage             │
│ Channel: in_store | Effective: Mar 15-17 2024, 14:00-17:00                      │
│ Point Type: promotional | Max/day: 200 | Stackable: yes | Priority: 200        │
├──────────────────────────────────────────────────────────────────────────────────┤
│ Rule: "Sign-up Bonus"                                                            │
│ Type: signup | Rate: 500 pts (flat) | One-time per member                       │
│ Point Type: promotional | Expires: 90 days | Priority: 10                       │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### Earning Calculation Example

```
Transaction: $45.50 at Starbucks (food_and_beverage, in_store)
Member Tier: Gold (1.5x multiplier)
Active Campaign: Happy Hour (100 bonus pts)

Step 1 - Filter Rules:
  ✗ "Base Earn" — eligible but lower priority than F&B Bonus
  ✓ "Food & Beverage Bonus" — matches category, priority=50, NOT stackable
  ✗ "Partner Airlines" — wrong partner
  ✓ "Happy Hour Campaign" — matches category+channel+time, stackable

Step 2 - Calculate:
  F&B Bonus: $45.50 × 3 pts/$1 = 136 pts (base)
  (Base Earn skipped: F&B Bonus is non-stackable, higher priority)

Step 3 - Tier Multiplier on F&B:
  Gold bonus: 136 × (1.5 - 1) = 68 pts (bonus)

Step 4 - Promotional:
  Happy Hour: 100 pts (promotional, flat)

Step 5 - Total Award:
  base=136 + bonus=68 + promotional=100 = 304 points
```

---

## 7. Deep Dive: Tier Calculation

### Tier Qualification Model

```
┌───────────────────────────────────────────────────────────────────────┐
│                    TIER QUALIFICATION WINDOW                          │
│                                                                       │
│  Rolling 12-month window from enrollment anniversary date             │
│                                                                       │
│  Qualifying points = SUM(base + bonus earned in window)               │
│  NOTE: Promotional points do NOT count toward tier qualification      │
│  NOTE: Redeemed points DO count (earn-based, not balance-based)       │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐     │
│  │ Mar 2023                                        Mar 2024    │     │
│  │ ├──────────────────── 12 months ──────────────────┤         │     │
│  │ │  Qualifying Activity:  8,200 pts earned         │         │     │
│  │ │  Current Tier: Gold (threshold: 5,000)          │         │     │
│  │ │  Next Tier: Platinum (threshold: 10,000)        │         │     │
│  │ │  Points to Platinum: 1,800                      │         │     │
│  │ ├──────────────────────────────────────────────────┤         │     │
│  └──────────────────────────────────────────────────────────────┘     │
└───────────────────────────────────────────────────────────────────────┘
```

### Tier Evaluation Logic

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

### Tier State Machine

```
                    ┌──────────────────┐
         ┌─────────│     GREEN        │
         │         │  (0 pts)         │
         │         └────────┬─────────┘
         │                  │ qualify >= 2,000 pts
         │                  ▼
         │         ┌──────────────────┐
         │  ┌──────│     SILVER       │──────┐
         │  │      │  (2,000 pts)     │      │
         │  │      └────────┬─────────┘      │
         │  │               │ qualify >= 5,000│ retention < 1,500
         │  │               ▼                │ (after grace)
         │  │      ┌──────────────────┐      │
         │  │ ┌────│      GOLD        │────┐ │
         │  │ │    │  (5,000 pts)     │    │ │
         │  │ │    └────────┬─────────┘    │ │
         │  │ │             │ >= 10,000    │ │ retention < 4,000
         │  │ │             ▼              │ │ (after grace)
         │  │ │    ┌──────────────────┐    │ │
         │  │ │    │   PLATINUM       │    │ │
         │  │ │    │  (10,000 pts)    │    │ │
         │  │ │    └──────────────────┘    │ │
         │  │ │             │              │ │
         │  │ │             │ retention    │ │
         │  │ │             │ < 8,000      │ │
         │  │ │             │ (after grace)│ │
         │  │ │             ▼              │ │
         │  │ │        DOWNGRADE           │ │
         │  │ │      to highest            │ │
         │  │ │     qualifying tier ◄──────┘ │
         │  │ └──────────────────────────────┘
         │  │             │
         │  └──── DOWNGRADE to Green
         │                │
         └────────────────┘
```

### Tier Benefits Application

```
┌──────────────┬───────────┬───────────┬───────────┬───────────┐
│ Benefit      │   Green   │  Silver   │   Gold    │ Platinum  │
├──────────────┼───────────┼───────────┼───────────┼───────────┤
│ Earn Rate    │ 1x base   │ 1.25x    │ 1.5x     │ 2.0x      │
│ Birthday     │ Basic     │ Premium   │ Premium   │ Ultra     │
│ Free Refill  │ No        │ No        │ Yes       │ Yes       │
│ Priority     │ No        │ No        │ Yes       │ Yes       │
│ Lounge       │ No        │ No        │ No        │ Yes       │
│ Annual Gift  │ No        │ No        │ No        │ Yes       │
│ Double Days  │ 0/month   │ 1/month   │ 2/month   │ Unlimited │
│ Grace Period │ N/A       │ 60 days   │ 90 days   │ 90 days   │
└──────────────┴───────────┴───────────┴───────────┴───────────┘
```

---

## 8. Deep Dive: Redemption Flow

### Two-Phase Redemption (Hold and Confirm)

For high-value or physical rewards, use a two-phase redemption to prevent race conditions and handle fulfillment failures.

```
Member                Points Engine              Rewards Service          Fulfillment
  │                        │                          │                      │
  │  1. Request Redeem     │                          │                      │
  ├───────────────────────>│                          │                      │
  │                        │  2. Check balance        │                      │
  │                        │     (SELECT FOR UPDATE)  │                      │
  │                        │                          │                      │
  │                        │  3. Check reward avail   │                      │
  │                        ├─────────────────────────>│                      │
  │                        │  4. Reward available     │                      │
  │                        │<─────────────────────────┤                      │
  │                        │                          │                      │
  │                        │  5. Place HOLD on points │                      │
  │                        │  (debit available,       │                      │
  │                        │   credit held)           │                      │
  │                        │                          │                      │
  │  6. Hold confirmed     │                          │                      │
  │  (holdId, expiresAt)   │                          │                      │
  │<───────────────────────┤                          │                      │
  │                        │                          │                      │
  │  7. Confirm redemption │                          │                      │
  ├───────────────────────>│                          │                      │
  │                        │  8. Convert hold         │                      │
  │                        │     to confirmed         │                      │
  │                        │                          │                      │
  │                        │  9. Trigger fulfillment  │                      │
  │                        ├──────────────────────────┼─────────────────────>│
  │                        │                          │                      │
  │                        │  10. Fulfillment done    │                      │
  │                        │<─────────────────────────┼──────────────────────┤
  │                        │                          │                      │
  │  11. Redemption complete│                         │                      │
  │  (voucher/tracking)    │                          │                      │
  │<───────────────────────┤                          │                      │
```

### FIFO Point Consumption (Oldest Points First)

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

### Refund / Reversal Handling

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

## 9. Deep Dive: Points Expiration

### Expiration Policy Model

```
┌───────────────────────────────────────────────────────────────────────┐
│                     EXPIRATION POLICIES                               │
│                                                                       │
│  Policy 1: TIME-BASED                                                │
│    Base points expire 12 months after earning                        │
│    Bonus points expire 12 months after earning                       │
│    Promotional points expire 90 days after earning                   │
│                                                                       │
│  Policy 2: ACTIVITY-BASED EXTENSION                                  │
│    Any qualifying activity (earn or redeem) extends ALL              │
│    non-promotional points by 12 months from activity date            │
│    "Use it or lose it" — stay active to keep points alive            │
│                                                                       │
│  Policy 3: TIER-BASED OVERRIDE                                       │
│    Platinum members: points never expire while tier is active        │
│    Gold members: 18-month expiration (instead of 12)                 │
│                                                                       │
│  Policy 4: NOTIFICATION SCHEDULE                                     │
│    30 days before expiry: email + push notification                  │
│    7 days before expiry: email + push + SMS                          │
│    1 day before expiry: final push notification                      │
└───────────────────────────────────────────────────────────────────────┘
```

### Batch Expiration Processing

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

### Expiration Notification Pipeline

```
Scheduled Scanner (hourly) -> Expiration Evaluator -> Notification Service -> Email/Push/SMS

Notification Schedule:
  - 30 days before:  "1,200 points expiring Apr 15. Redeem now!"
  - 7 days before:   "1,200 points expire in 7 days. Don't lose them!"
  - 1 day before:    "LAST CHANCE: 1,200 points expire tomorrow!"
```

```sql
-- Find members with points expiring in next 30 days
SELECT m.member_id, SUM(pl.remaining_points) AS expiring_points, MIN(pl.expires_at) AS earliest
FROM point_lots pl JOIN members m ON pl.member_id = m.member_id
WHERE pl.status IN ('active','partially_used')
  AND pl.expires_at BETWEEN NOW() AND NOW() + INTERVAL '30 days'
  AND m.current_tier != 'platinum'
GROUP BY m.member_id HAVING SUM(pl.remaining_points) > 0
ORDER BY earliest ASC;
```

---

## 10. Deep Dive: Fraud Prevention

### Fraud Signals and Detection

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     FRAUD DETECTION LAYERS                               │
│                                                                          │
│  Layer 1: VELOCITY CHECKS (real-time, in Redis)                         │
│    - Earn events per member per hour (threshold: 20)                    │
│    - Earn events per member per day (threshold: 100)                    │
│    - Points earned per member per day (threshold: 50,000)               │
│    - Redemptions per member per hour (threshold: 5)                     │
│    - Redemptions per member per day (threshold: 20)                     │
│    - Earn events from same device/IP per hour (threshold: 50)           │
│                                                                          │
│  Layer 2: PATTERN DETECTION (ML model, < 50ms inference)                │
│    - Unusual earning patterns (time, location, amount)                  │
│    - Earn-then-immediately-redeem pattern                               │
│    - Account age vs. earning velocity mismatch                          │
│    - Geographic anomalies (earn in Tokyo, redeem in NYC within 1 hour)  │
│    - Multiple accounts linked to same device/payment method             │
│                                                                          │
│  Layer 3: PARTNER FRAUD (batch, daily reconciliation)                   │
│    - Partner submitting inflated transaction amounts                    │
│    - Phantom transactions (no matching purchase at POS)                 │
│    - Unusual partner-to-member earning patterns                         │
│    - Split transactions to maximize per-transaction bonuses             │
│                                                                          │
│  Layer 4: ACCOUNT TAKEOVER (real-time)                                  │
│    - Login from new device + immediate high-value redemption            │
│    - Password change + redemption within 24 hours                       │
│    - Multiple failed auth attempts followed by successful redeem        │
│    - Shipping address change + physical reward redemption               │
└──────────────────────────────────────────────────────────────────────────┘
```

### Real-Time Fraud Scoring

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

### Fraud Prevention Summary

```
┌────────────────────┬────────────────────────┬─────────────────────────┐
│ Fraud Type         │ Detection Method       │ Response Action         │
├────────────────────┼────────────────────────┼─────────────────────────┤
│ Manufactured spend │ Velocity checks        │ Block earn, flag review │
│ Point farming      │ Pattern ML model       │ Suspend earning         │
│ Account takeover   │ Device/IP + behavior   │ Freeze + MFA challenge  │
│ Redemption fraud   │ Earn-redeem pattern    │ Hold redemption         │
│ Partner collusion  │ Settlement reconcile   │ Suspend partner         │
│ Split transactions │ Proximity/time rules   │ Merge + cap             │
│ Multi-account      │ Device fingerprint     │ Link + merge accounts   │
│ Phantom receipts   │ POS reconciliation     │ Reverse + investigate   │
└────────────────────┴────────────────────────┴─────────────────────────┘
```

---

## 11. Deep Dive: Partner Integration

### Partner Earn/Burn Flow

```
Partner POS/API -> Partner Gateway -> Points Engine -> Points Ledger

Earn: Partner submits purchase via POST /v1/partners/earn (API key auth).
  Gateway validates, maps categories, applies partner earn rate.
  Points Engine writes ledger with partner attribution. Event -> settlement.

Burn: Member presents ID at partner. Partner calls POST /v1/partners/burn.
  Gateway authenticates, Points Engine executes FIFO redemption.
  Partner receives confirmation + settlement tracking ID.
```

### Points Transfer Between Programs

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

### Daily Settlement Reconciliation

```sql
-- Net settlement: positive = partner owes us, negative = we owe partner
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

### Partner Integration Architecture

```
Partner Gateway Components:
  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │ Partner  │  │  Rate    │  │ Adapter  │  │ Request  │  │ Reconcile│
  │  Auth    │->│Converter │->│ Registry │->│Validator │  │  Engine  │
  │(API Key) │  │(per ptnr)│  │(per-ptnr │  │          │  │(daily)   │
  └──────────┘  └──────────┘  │ mappings)│  └──────────┘  └──────────┘
                              └──────────┘
Adapter Pattern: each partner gets a dedicated adapter that translates
between their API format and our internal format. New partners require
only a new adapter implementation — no core service changes.
```

---

## 12. Scaling Strategy

### Sharding by Member

```
Shard Key: member_id (consistent hashing), 64 shards across 16 DB nodes (4/node)
Routing:   shard_id = consistent_hash(member_id) % 64

Why member_id?
  - All core ops (earn, redeem, balance) are member-scoped — no cross-member joins
  - UUID-based IDs ensure even distribution
  - Ledger, balances, lots all co-located on same shard

Per-shard tables: points_ledger, points_balances, point_lots, members
Global tables (replicated, not sharded): tiers, earning_rules, rewards, partners

Cross-shard operations:
  - Points transfer between members: Saga pattern
  - Settlement aggregation: fan-out/fan-in from all shards
  - Reconciliation: parallel per-shard, merge results
```

### Handling Flash Promotions (80K TPS Bursts)

```
Problem: Double-points day causes 3-4x normal traffic
Solution: Multi-layer buffering

L1: API Gateway rate limiting (per-member: 10/sec, global: 100K/sec)
L2: Async earn via Kafka (accept sync, process async, "pending" -> confirmed in <5s)
L3: Pre-scaled infra (known promos: pre-scale DB connections, auto-scale consumers)
L4: Write-behind cache (Redis balance updated optimistically, DB writes batched)

  API Gateway (100K/s) -> Kafka buffer -> Points Engine (30K/s) -> DB Shards
                           Lag: avg <5s, max <30s
```

### Read-Heavy Balance Queries

```
Balance reads: ~200M/day (R:W ratio ~300:1). Multi-level caching:

  L1: Client cache (mobile)     TTL 30s, invalidated on push after earn/redeem
  L2: CDN / API Gateway         TTL 10s, cache key: member_id + ETag (60% hit)
  L3: Redis                     TTL 5s, invalidated on write (95% hit of L2 misses)
  L4: Read replica (PG)         < 100ms lag, for txn history and non-critical reads
  L5: Primary DB                Authoritative: redemptions and balance writes only

Effective DB load: 200M * (1 - 0.60) * (1 - 0.95) = 4M reads/day = ~46 reads/sec
```

---

## 13. Deployment Architecture

```
REGION: US-EAST-1 (Primary)
═══════════════════════════
    ALB (TLS, WAF) -> API Gateway (Kong: rate limit, auth, routing, idempotency)
                        │
        ┌───────────────┼───────────────┬───────────────┬───────────────┐
        ▼               ▼               ▼               ▼               ▼
   Points Engine   Tier Engine    Rewards Catalog  Partner Gateway  Fraud Detection
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
        │                         DATA LAYER                           │
        │  PostgreSQL: 64 shards, 16 nodes (each primary + 2 replicas)│
        │  Redis: 6 nodes (3P + 3R)                                   │
        │    Keys: balance:{id}, tier:{id}, rules:active, fraud:*     │
        │  Elasticsearch: 3 nodes (txn search, catalog search)        │
        │  S3: ledger archive (Parquet), audit logs, settlement rpts  │
        └─────────────────────────────────────────────────────────────┘

BATCH JOBS:
  Expiration Processor (hourly)  │  Tier Evaluator (nightly)
  Settlement Reconciler (daily)  │  Ledger Archiver (daily)
  Notification Scheduler (hourly)

REGION: US-WEST-2 (DR)
═══════════════════════
  Async replication (<1 sec lag): PG streaming, Kafka MirrorMaker 2, Redis sentinel
  Failover: RTO < 10 min, RPO < 1 sec
```

---

## 14. Common Interview Follow-ups

**Q: How do you prevent double-spending of points in concurrent redemptions?**

A: The points balance uses optimistic concurrency control with a `version` column. When processing a redemption, we `SELECT ... FOR UPDATE` on the member's balance row, which acquires a row-level lock. The `UPDATE points_balances SET available = available - 400 WHERE member_id = ? AND available >= 400 AND version = ?` ensures atomicity. If two concurrent redemptions race, the first commits and increments the version. The second finds a version mismatch (0 rows updated), retries, and either succeeds (if sufficient balance remains) or fails with an insufficient-balance error. The `CHECK (available >= 0)` constraint is the final safety net at the database level.

**Q: How do you handle the case where a purchase is refunded after points were already earned?**

A: We process purchase refunds as point clawbacks. When the partner or POS notifies us of a refund (using the original transaction ID as the idempotency reference), we create a negative `adjust` entry in the points ledger for the exact points that were earned on that transaction. The earn entry's `source_id` links back to the original transaction, so we can compute the exact points to reverse (including any tier bonuses that applied). If the member has already redeemed those points and their balance would go negative, we allow a negative balance temporarily and recover on the next earn event, or the debt is written off per business policy after 90 days.

**Q: What happens if the expiration batch job fails midway?**

A: The expiration processor uses `FOR UPDATE SKIP LOCKED` to claim lots in batches. Each lot is expired in its own mini-transaction (lot update + ledger entry + balance update), so a failure mid-batch leaves some lots expired and others untouched. On the next run (hourly), the remaining lots are picked up because they still have `expires_at <= NOW()`. The `SKIP LOCKED` ensures multiple processor instances can run in parallel without contending on the same rows. The idempotency key (`expire_{lot_id}`) prevents double-expiration if a lot is partially processed.

**Q: How do you ensure earning rules changes take effect correctly without affecting in-flight transactions?**

A: Earning rules are versioned and cached in Redis with a 60-second TTL. When rules are updated in the database, the cache is invalidated. In-flight transactions that already loaded the old rules will complete with those rules (the earn event records the `earning_rule_id` used). Rules have `effective_from` and `effective_to` timestamps, so new rules can be scheduled in advance. We never mutate an existing rule; instead we deactivate the old one and create a new version. The audit trail always shows which rule version was used for each earn event.

**Q: How would you support a "status match" where a member from a competing program gets equivalent tier status?**

A: Status matching is implemented as an admin operation through the Tier Engine. An admin creates a `tier_history` entry with `change_type = 'status_match'` that upgrades the member to the matched tier. The status match has a limited qualification window (typically 90 days) during which the member must earn enough qualifying points to retain the tier organically. We store the status match metadata (source program, proof document ID) in the `tier_history.reason` field. If the member does not qualify within the window, they downgrade to whatever tier their actual qualifying points support. This is handled by the same grace-period logic in the tier engine.

**Q: How do you handle points transfers between two members (e.g., family pooling)?**

A: Cross-member transfers are a cross-shard operation since the two members may live on different database shards. We use a Saga pattern: (1) Deduct points from source member (write ledger entry + update balance on shard A), (2) Publish a `transfer.initiated` event to Kafka, (3) Credit points to target member (write ledger entry + update balance on shard B), (4) Publish `transfer.completed` event. If step 3 fails, a compensation step refunds the source member. Both sides use idempotency keys derived from the transfer ID so retries are safe. Family accounts have a shared `household_id` and configurable monthly transfer limits to prevent abuse.

**Q: What is the financial accounting model behind the points system?**

A: Points represent a deferred revenue liability on the company's balance sheet. When points are earned, we recognize a liability (cost per point, typically $0.005-$0.02 depending on the program). When points are redeemed, the liability is reduced and the cost of the reward is recognized. When points expire, the liability is released as "breakage revenue." The points ledger directly supports this accounting: every `earn` entry increases the liability, every `redeem` decreases it, and every `expire` releases it. The settlement engine generates daily journal entries that feed into the general ledger (GL) system. We maintain a cost-per-point rate table that maps point types to dollar values for financial reporting.

**Q: How do you scale the tier evaluation for 200M members?**

A: Real-time tier evaluation runs only on earn events (piggybacks on the earn transaction). This handles upgrades instantly. For downgrades and renewals, a nightly batch job runs across all shards in parallel. Each shard processes its members independently (no cross-shard coordination needed for tier evaluation). The batch job queries the `points_ledger` with a covering index on `(member_id, entry_type, point_type, created_at)` to compute qualifying points efficiently. Members whose window is not expiring are skipped entirely. In practice, only ~5% of members (10M) need tier re-evaluation on any given night. At 1,000 evaluations/sec per shard across 64 shards, the entire batch completes in under 3 minutes.

**Q: How do you ensure partner settlement accuracy?**

A: Settlement accuracy is ensured through a three-step reconciliation process. (1) Our system generates a daily settlement report for each partner from the `points_ledger` (filtered by `partner_id`). (2) The partner provides their view of the same day's transactions via a file drop or API. (3) A reconciliation engine matches records by idempotency key (or transaction ID + timestamp). Discrepancies are categorized as "missing on our side," "missing on their side," or "amount mismatch." Discrepancies below a threshold ($100/day) are auto-resolved in the next settlement cycle. Above the threshold, they are flagged for manual investigation. Each partner settlement has a dispute window (typically 7 days) before financial settlement is finalized via ACH or wire transfer.

---

## 15. Summary

### Key Architecture Decisions

| Decision | Chosen Approach | Alternative | Reason |
|----------|-----------------|-------------|--------|
| Points ledger | Immutable append-only log + materialized balance | Compute balance from ledger on read | O(1) balance reads at 8K+ TPS; nightly reconciliation catches drift |
| FIFO expiration | Point lots table tracking remaining per-earn-batch | Single balance with earliest-expire pointer | Lot-level tracking enables precise FIFO consumption and partial expiration |
| Tier evaluation | Real-time on earn + nightly batch for downgrades | Purely batch (nightly) | Instant upgrade gratification; batch is sufficient for downgrades (not time-sensitive) |
| Earning rules | Configurable rule engine with priority + stacking | Hardcoded earn rates | Business needs frequent rule changes (campaigns, partner deals) without code deploys |
| Shard key | member_id | partner_id or composite | All core operations are member-scoped; avoids cross-shard transactions for earn/redeem |
| Redemption model | Two-phase (hold + confirm) | Direct deduction | Supports fulfillment failures, physical rewards, and partner burn confirmation |
| Fraud detection | Synchronous scoring (< 50ms) on earn/redeem | Async post-transaction analysis | Prevents fraudulent points from entering the system; async analysis for pattern detection |
| Partner integration | Adapter pattern per partner | Universal API | Partners have different formats, auth, categories; adapters isolate translation logic |
| Expiration processing | Hourly batch with SKIP LOCKED | Real-time on balance read | Batch is cheaper; hourly granularity is acceptable (NFR: at-most 1 hour late) |
| Balance caching | Multi-level (client, CDN, Redis, replica, primary) | Redis only | Reduces Redis load by 60% with CDN layer; 5-second staleness acceptable for display |
| Cross-member transfer | Saga pattern | 2PC | Saga tolerates partial failures gracefully; 2PC would block across shards |
| Settlement | Daily batch reconciliation with dispute window | Real-time settlement | Daily batch is simpler, aligns with financial reporting cycles, tolerates temporary discrepancies |

### Key Trade-offs

```
Consistency vs. Performance:   Strong for writes (earn/redeem), eventual for reads (cached)
Simplicity vs. Flexibility:    Rules engine + FIFO lots add complexity but enable business agility
Cost vs. Latency:              Multi-level cache + async flash processing trade staleness for scale
Availability vs. Accuracy:     99.99% availability with nightly reconciliation as safety net
```

---

*Covers: double-entry points ledger, FIFO expiration with lot tracking, configurable earning rules engine, tier qualification with rolling windows, two-phase redemption, fraud detection pipeline, partner integration with settlement reconciliation, horizontal sharding by member, flash promotion buffering, multi-level balance caching.*
