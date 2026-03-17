# System Design: High-Traffic Deals & Promotions Platform

> ShopBack's deals page is a major traffic driver, especially during events like 11.11, Black Friday, and Cyber Monday.

## 1. Requirements

### Functional
- Merchants create deals/promotions with cashback rates, validity periods, and terms
- Users browse, search, and filter deals by category, merchant, and market
- Featured/flash deals with countdown timers and limited quantities
- Personalized deal recommendations
- Push notifications for deal alerts

### Non-Functional
- **Low latency**: Deal pages load < 200ms (API response)
- **High availability**: 99.99% during sale events
- **Scale**: 100K+ concurrent users during flash sales (10x normal)
- **Consistency**: Deal inventory (limited quantities) must be accurate
- **Freshness**: New deals visible within 30 seconds

### Out of Scope
- Cashback tracking (separate system)
- Payment processing

---

## 2. High-Level Architecture

```
┌─────────┐     ┌──────────┐     ┌──────────────┐     ┌──────────┐
│Merchant │────→│  Admin   │────→│   Deal       │────→│  Event   │
│ Portal  │     │  API     │     │   Service    │     │  Bus     │
└─────────┘     └──────────┘     └──────┬───────┘     └────┬─────┘
                                        │                   │
                                        ▼                   ▼
                                 ┌────────────┐     ┌────────────┐
                                 │  Deal DB   │     │ Cache      │
                                 │ (Postgres) │     │ Invalidator│
                                 └────────────┘     └─────┬──────┘
                                                          │
┌─────────┐     ┌──────────┐     ┌──────────────┐        │
│  User   │────→│  CDN /   │────→│   Deal       │◄───────┘
│ App/Web │     │  Gateway │     │   Read API   │
└─────────┘     └──────────┘     └──────┬───────┘
                                        │
                              ┌─────────┼─────────┐
                              ▼         ▼         ▼
                        ┌────────┐ ┌────────┐ ┌────────┐
                        │ Redis  │ │ Search │ │ Reco   │
                        │ Cache  │ │ (ES)   │ │ Engine │
                        └────────┘ └────────┘ └────────┘
```

---

## 3. Core Components

### 3.1 Data Model

```sql
-- Merchants
CREATE TABLE merchants (
    merchant_id     SERIAL PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    slug            VARCHAR(255) UNIQUE NOT NULL,
    logo_url        TEXT,
    base_cashback   DECIMAL(5,2) DEFAULT 0,  -- Default cashback %
    markets         VARCHAR(2)[] NOT NULL,     -- ['sg', 'my', 'id']
    status          VARCHAR(20) DEFAULT 'active',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Deals / Promotions
CREATE TABLE deals (
    deal_id         SERIAL PRIMARY KEY,
    merchant_id     INT REFERENCES merchants(merchant_id),
    title           VARCHAR(500) NOT NULL,
    description     TEXT,
    deal_type       VARCHAR(20) NOT NULL,
      -- 'cashback_boost', 'coupon', 'flash_sale', 'exclusive'
    cashback_rate   DECIMAL(5,2),            -- Boosted cashback %
    coupon_code     VARCHAR(50),
    discount_value  DECIMAL(10,2),
    discount_type   VARCHAR(10),             -- 'percentage', 'fixed'
    min_spend       DECIMAL(10,2) DEFAULT 0,
    max_discount    DECIMAL(10,2),

    -- Inventory (for flash sales)
    total_quantity  INT,                     -- NULL = unlimited
    claimed_count   INT DEFAULT 0,

    -- Targeting
    markets         VARCHAR(2)[] NOT NULL,
    categories      VARCHAR(50)[] DEFAULT '{}',

    -- Scheduling
    starts_at       TIMESTAMPTZ NOT NULL,
    ends_at         TIMESTAMPTZ NOT NULL,
    featured        BOOLEAN DEFAULT FALSE,
    priority        INT DEFAULT 0,           -- Higher = more prominent

    -- Status
    status          VARCHAR(20) DEFAULT 'draft',
      -- draft → scheduled → active → expired / sold_out

    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_deals_active ON deals (status, markets, starts_at, ends_at)
    WHERE status = 'active';
CREATE INDEX idx_deals_merchant ON deals (merchant_id, status);
CREATE INDEX idx_deals_featured ON deals (featured, priority DESC)
    WHERE featured = TRUE AND status = 'active';

-- Deal Categories (for browsing)
CREATE TABLE categories (
    category_id     SERIAL PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    slug            VARCHAR(100) UNIQUE NOT NULL,
    parent_id       INT REFERENCES categories(category_id),
    display_order   INT DEFAULT 0
);
```

### 3.2 Deal Read API

```
GET /api/v1/deals?market=sg&category=electronics&sort=popular&page=1

Response:
{
  "deals": [...],
  "meta": { "total": 1250, "page": 1, "limit": 20 }
}
```

**Caching Strategy (Critical for Performance):**

```
Request Flow:
                                    ┌─────────┐
User ──→ CDN (static assets) ──→   │ API     │
                                    │ Gateway │
                                    └────┬────┘
                                         │
                                    ┌────┴────┐
                              Yes   │ Redis   │  No (cache miss)
                           ◄────── │ Cache?  │ ──────────────→ Database
                                    └─────────┘
                                                   │
                                              Write to Redis
                                              (TTL: 30s for deal lists)
                                              (TTL: 5min for deal details)
```

**Cache Keys:**
```
deals:sg:electronics:popular:1  → Paginated deal list
deal:12345                      → Individual deal detail
deals:sg:featured               → Featured deals for market
deals:sg:flash:active           → Active flash sales
merchant:123:deals              → All deals for a merchant
```

### 3.3 Flash Sale Handling

Flash sales require special handling due to limited inventory and traffic spikes.

```
┌─────────┐   Claim    ┌──────────────┐   Decrement   ┌─────────┐
│  User   │──────────→│  Flash Sale  │─────────────→│  Redis  │
│         │           │  Service     │               │ Counter │
│         │◄──────────│              │◄─────────────│         │
└─────────┘  Result   └──────┬───────┘   Remaining  └─────────┘
                              │
                         Async write
                              │
                              ▼
                       ┌────────────┐
                       │  Database  │  (source of truth)
                       └────────────┘
```

**Atomic Counter in Redis:**
```
-- Claim a flash deal
DECR flash:deal:12345:remaining
-- If result >= 0: claim successful
-- If result < 0: sold out (INCR to restore, return error)
```

**Race Condition Prevention:**
```lua
-- Redis Lua script for atomic claim
local remaining = redis.call('GET', KEYS[1])
if tonumber(remaining) > 0 then
    redis.call('DECR', KEYS[1])
    return 1  -- success
else
    return 0  -- sold out
end
```

### 3.4 Search & Discovery

```
┌─────────┐   Query    ┌──────────────┐
│  User   │──────────→│ Elasticsearch│
│         │◄──────────│              │
└─────────┘  Results  └──────────────┘

Index: deals
{
  "title": "text",
  "description": "text",
  "merchant_name": "keyword",
  "categories": "keyword[]",
  "markets": "keyword[]",
  "cashback_rate": "float",
  "starts_at": "date",
  "ends_at": "date",
  "popularity_score": "float",
  "featured": "boolean"
}
```

**Relevance scoring** combines:
- Text match score
- Cashback rate (higher = better)
- Popularity (click-through rate)
- Recency
- Featured boost

---

## 4. Scaling for Peak Events

### 11.11 / Black Friday Architecture

```
Normal:   100K requests/min
Peak:     1M+ requests/min (10x)

Strategy:
┌─────────────────────────────────────────────┐
│  1. Pre-warm caches 1 hour before event     │
│  2. Auto-scale API pods (HPA in k8s)        │
│  3. CDN caching for deal listing pages      │
│  4. Rate limit per user (10 claims/min)     │
│  5. Queue flash sale claims (no direct DB)  │
│  6. Read replicas for non-critical queries  │
│  7. Circuit breaker on recommendation API   │
└─────────────────────────────────────────────┘
```

### Traffic Shaping
- **Countdown page**: Absorbs early traffic with static content
- **Staggered start**: Different categories start at different times
- **Waiting room**: Queue users when capacity is reached (virtual queue)

---

## 5. Multi-Market Considerations

```
Deal created by merchant for markets: ['sg', 'my', 'th']

Processing:
1. Store deal with market array
2. Convert prices per market currency
3. Sync to regional Redis clusters
4. Index in Elasticsearch with market filter
5. Send notifications per market timezone
```

| Aspect | Approach |
|--------|----------|
| Currency | Store in merchant currency, display in user currency |
| Timezone | Schedule in UTC, display in local time |
| Language | Deal titles stored per locale in JSONB field |
| Regulations | Market-specific terms and conditions |

---

## 6. Key Trade-offs

| Decision | Trade-off |
|----------|-----------|
| Redis counter vs DB lock | Speed vs durability (use both: Redis for speed, DB as source of truth) |
| Elasticsearch vs DB queries | Flexibility vs operational complexity |
| CDN caching deal pages | Freshness vs latency (30s TTL is acceptable) |
| Pre-computed vs real-time ranking | Stale recommendations vs compute cost |
| Single vs per-market DB | Simplicity vs data isolation |
