# System Design: Cashback Tracking & Attribution System

> This is ShopBack's **core business**. Highest probability system design question.

## 1. Requirements

### Functional

- Track user clicks on merchant affiliate links
- Attribute purchases back to the originating click
- Calculate correct cashback based on merchant commission rates
- Handle cashback lifecycle: Pending → Confirmed → Paid
- Support multiple attribution models (last-click, first-click)

### Non-Functional

- **Accuracy**: > 99.5% attribution accuracy (money is involved)
- **Latency**: Click tracking < 50ms (must not slow down redirect)
- **Scale**: 10M+ clicks/day, 500K+ transactions/day
- **Availability**: 99.9% uptime
- **Durability**: Zero data loss on financial transactions

### Out of Scope

- Payment processing (separate system)
- Merchant onboarding
- User authentication

---

## 2. High-Level Architecture

```
┌──────────┐   Click    ┌──────────────┐   Redirect   ┌──────────┐
│   User   │──────────→│ Click Tracker │────────────→│ Merchant │
│ Browser/ │           │   Service     │              │ Website  │
│   App    │           └──────┬────────┘              └────┬─────┘
└──────────┘                  │                            │
                              │ Store Click Event          │ Purchase
                              ▼                            │ Callback
                     ┌────────────────┐                    │
                     │  Event Bus     │                    │
                     │  (Kafka)       │◄───────────────────┘
                     └───────┬────────┘         (S2S Postback)
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
     ┌────────────┐  ┌────────────┐  ┌────────────┐
     │Attribution │  │ Cashback   │  │ Analytics  │
     │  Engine    │  │ Calculator │  │  Service   │
     └─────┬──────┘  └─────┬──────┘  └────────────┘
           │               │
           ▼               ▼
     ┌────────────────────────┐
     │   Cashback Database    │
     │   (Aurora PostgreSQL)  │
     └────────────────────────┘
```

---

## 3. Core Components

### 3.1 Click Tracker Service

Captures every user click on an affiliate link.

```
GET /redirect?merchant_id=123&offer_id=456&user_id=789

Response: 302 Redirect to merchant URL with tracking params
```

**Data Model - Click Event:**

```sql
CREATE TABLE click_events (
    click_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         BIGINT NOT NULL,
    merchant_id     INT NOT NULL,
    offer_id        INT,
    market          VARCHAR(2) NOT NULL,  -- 'sg', 'my', etc.
    source          VARCHAR(20),          -- 'web', 'app', 'extension'
    device_type     VARCHAR(10),          -- 'mobile', 'desktop'
    ip_address      INET,
    user_agent      TEXT,
    referrer_url    TEXT,
    redirect_url    TEXT NOT NULL,
    sub_id          VARCHAR(255),         -- Publisher sub-tracking
    clicked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL  -- Attribution window end
);

-- Partition by month for performance
-- Index on (user_id, merchant_id, clicked_at) for attribution lookups
CREATE INDEX idx_click_attribution
    ON click_events (user_id, merchant_id, clicked_at DESC);
```

**Design Decisions:**

- Write to Kafka first, respond with redirect immediately (< 50ms)
- Async consumer writes to database
- UUID click_id embedded in affiliate URL for direct attribution
- TTL-based expiry (typically 7-30 days depending on merchant)

### 3.2 Purchase Callback Handler

Receives purchase notifications from merchants/affiliate networks.

**Two ingestion methods:**

#### Method A: Server-to-Server (S2S) Postback

```
POST /api/v1/conversions
{
    "click_id": "uuid-from-redirect",
    "merchant_id": 123,
    "order_id": "M-ORD-456789",
    "order_amount": 150.00,
    "currency": "SGD",
    "commission_amount": 7.50,
    "items": [
        {"sku": "ABC123", "name": "Headphones", "price": 150.00, "quantity": 1}
    ],
    "timestamp": "2026-03-16T10:30:00Z"
}
```

#### Method B: Affiliate Network Batch

```
// Daily/hourly batch files from impact.com, Rakuten, etc.
// CSV/JSON format with transaction details
// Processed by batch ingestion pipeline
```

### 3.3 Attribution Engine

Matches purchases to clicks using multiple strategies:

```
┌─────────────────────────────────────────────────┐
│              Attribution Priority                │
│                                                  │
│  1. Direct Match (click_id in postback)    ◄ Best│
│  2. User + Merchant + Time Window                │
│  3. Device Fingerprint + Merchant + Time         │
│  4. Cookie-based (fallback, declining)     ◄ Worst│
└─────────────────────────────────────────────────┘
```

```typescript
interface AttributionResult {
  clickId: string;
  userId: number;
  merchantId: number;
  confidence: 'high' | 'medium' | 'low';
  method: 'direct' | 'user_merchant' | 'fingerprint' | 'cookie';
}

// Attribution logic pseudocode:
// 1. If click_id present → direct match (confidence: high)
// 2. Find clicks WHERE user_id = X AND merchant_id = Y
//    AND clicked_at BETWEEN (purchase_time - window) AND purchase_time
//    ORDER BY clicked_at DESC LIMIT 1
// 3. Disputed attributions go to manual review queue
```

### 3.4 Cashback Calculator

```sql
CREATE TABLE cashback_transactions (
    txn_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         BIGINT NOT NULL,
    click_id        UUID REFERENCES click_events(click_id),
    merchant_id     INT NOT NULL,
    order_id        VARCHAR(255) NOT NULL,
    order_amount    DECIMAL(12,2) NOT NULL,
    commission_rate DECIMAL(5,4) NOT NULL,   -- e.g., 0.0500 = 5%
    commission_amt  DECIMAL(12,2) NOT NULL,
    cashback_rate   DECIMAL(5,4) NOT NULL,   -- ShopBack's share split
    cashback_amt    DECIMAL(12,2) NOT NULL,
    currency        VARCHAR(3) NOT NULL,
    market          VARCHAR(2) NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'pending',
      -- pending → confirmed → redeemable → paid
      -- pending → rejected (merchant cancelled order)
    status_history  JSONB DEFAULT '[]',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmed_at    TIMESTAMPTZ,
    paid_at         TIMESTAMPTZ,

    CONSTRAINT unique_order UNIQUE (merchant_id, order_id)
);

CREATE INDEX idx_cashback_user ON cashback_transactions (user_id, status);
CREATE INDEX idx_cashback_status ON cashback_transactions (status, created_at);
```

**Cashback Lifecycle:**

```
Click → Purchase Detected → Pending (shown to user)
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
              Confirmed                 Rejected
           (merchant validated)     (order cancelled/returned)
                    │
                    ▼
              Redeemable
           (waiting period passed)
                    │
                    ▼
                  Paid
           (transferred to user wallet)
```

**Typical timelines:**

- Pending → Confirmed: 30-90 days (merchant validation period)
- Confirmed → Redeemable: Immediate
- Redeemable → Paid: On user withdrawal request

---

## 4. Scaling Considerations

### Read-Heavy Pattern

- Clicks: 10M writes/day, minimal reads
- Cashback status: 500K writes/day, millions of reads (users checking status)
- **Solution**: Write to primary DB, read from replicas. Cache active cashback in Redis.

```
┌──────────┐   Write   ┌──────────┐   Replicate   ┌──────────┐
│  Click   │─────────→│ Primary  │──────────────→│ Replica  │◄── Read
│ Service  │          │   DB     │               │   DB     │
└──────────┘          └──────────┘               └──────────┘
                                                       │
                                                  ┌────┴────┐
                                                  │  Redis  │◄── Hot data
                                                  │  Cache  │
                                                  └─────────┘
```

### Multi-Market

- Partition data by market for isolation
- Regional read replicas near users
- Currency conversion handled at display layer

### Idempotency

- Critical: Same purchase callback received twice must not create double cashback
- Use `(merchant_id, order_id)` as idempotency key
- Kafka consumer uses exactly-once semantics where possible

### Failure Handling

- Click tracking: Fire-and-forget to Kafka (buffered locally if Kafka down)
- Attribution: Retry with exponential backoff, DLQ for manual review
- Cashback calculation: Saga pattern with compensating transactions

---

## 5. Key Trade-offs to Discuss

| Decision           | Option A                    | Option B          | ShopBack Likely Choice                          |
| ------------------ | --------------------------- | ----------------- | ----------------------------------------------- |
| Attribution window | Short (7 days)              | Long (30 days)    | Per-merchant config                             |
| Click storage      | Hot only (30 days)          | Archive all       | Hot + S3 archive                                |
| Consistency model  | Strong (no double cashback) | Eventual (faster) | Strong for cashback, eventual for analytics     |
| S2S vs Cookie      | Server-to-server            | Cookie-based      | S2S preferred (privacy changes)                 |
| Real-time vs Batch | Stream processing           | Batch jobs        | Hybrid: stream for S2S, batch for network files |

---

## 6. Monitoring & Alerts

| Metric                  | Alert Threshold | Why                         |
| ----------------------- | --------------- | --------------------------- |
| Attribution rate        | < 95%           | Tracking may be broken      |
| Click latency p99       | > 100ms         | User experience degradation |
| Duplicate cashback rate | > 0.1%          | Financial loss              |
| Pending cashback age    | > 120 days      | Merchant integration issue  |
| DLQ depth               | > 1000          | Processing failures         |
