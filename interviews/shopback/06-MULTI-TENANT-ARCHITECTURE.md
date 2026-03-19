# System Design: Multi-Tenant Architecture for 13 Markets

> ShopBack is actively migrating from per-market stacks to a multi-tenant architecture. This was a major BREW (Better Engineering Weeks) initiative.

## 1. Background & Problem

### Before: Per-Market Stacks

```
┌──────────┐  ┌──────────┐  ┌──────────┐     ┌──────────┐
│ SG Stack │  │ MY Stack │  │ ID Stack │ ... │ US Stack │
│          │  │          │  │          │     │          │
│ ┌──────┐ │  │ ┌──────┐ │  │ ┌──────┐ │     │ ┌──────┐ │
│ │ API  │ │  │ │ API  │ │  │ │ API  │ │     │ │ API  │ │
│ │ DB   │ │  │ │ DB   │ │  │ │ DB   │ │     │ │ DB   │ │
│ │ Cache│ │  │ │ Cache│ │  │ │ Cache│ │     │ │ Cache│ │
│ │ Queue│ │  │ │ Queue│ │  │ │ Queue│ │     │ │ Queue│ │
│ └──────┘ │  │ └──────┘ │  │ └──────┘ │     │ └──────┘ │
└──────────┘  └──────────┘  └──────────┘     └──────────┘
 AWS ap-se-1   AWS ap-se-1   AWS ap-se-3      AWS us-east-1
```

**Problems:**

- 11 independent stacks across 5 AWS regions
- Each market needed separate infrastructure provisioning
- Launching a new market took weeks/months
- Feature rollout was sequential (deploy to each market separately)
- Each service needed resource headroom for its own traffic spikes
- No shared learnings or configurations between markets
- 200+ engineers maintaining fragmented tooling

### After: Multi-Tenant Architecture

```
                    ┌─────────────────────────────┐
                    │     Global Control Plane     │
                    │  (Config, Feature Flags,     │
                    │   Tenant Management)         │
                    └──────────────┬───────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              ▼                    ▼                    ▼
     ┌────────────────┐  ┌────────────────┐  ┌────────────────┐
     │  APAC Region   │  │  APAC Region   │  │   US Region    │
     │  (ap-se-1)     │  │  (ap-se-3)     │  │  (us-east-1)   │
     │                │  │                │  │                │
     │ SG, MY, PH, TH│  │    ID, VN      │  │      US        │
     │ TW, AU, KR     │  │                │  │                │
     └────────────────┘  └────────────────┘  └────────────────┘
```

---

## 2. Requirements

### Functional

- Single codebase serves all 13 markets
- Per-market configuration (currency, language, merchants, features)
- Market-specific data isolation (users, transactions)
- New market onboarding in days, not months
- Feature flags for gradual market rollout

### Non-Functional

- **Noisy neighbor prevention**: One market's spike doesn't affect others
- **Data residency**: Some markets require in-region data storage
- **Latency**: < 100ms for market-local requests
- **Availability**: Market-level fault isolation
- **Compliance**: Per-market regulatory requirements

---

## 3. Tenancy Models Comparison

| Model                          | Data Isolation | Operational Cost | Customization | ShopBack Fit                |
| ------------------------------ | -------------- | ---------------- | ------------- | --------------------------- |
| **Separate DB per tenant**     | Highest        | Highest          | Highest       | Too expensive at 13 markets |
| **Shared DB, separate schema** | High           | Medium           | Medium        | Good for regulated markets  |
| **Shared DB, shared schema**   | Medium         | Lowest           | Lowest        | Good for most markets       |
| **Hybrid**                     | Configurable   | Medium           | High          | **Best fit**                |

### ShopBack's Hybrid Approach

```
┌─────────────────────────────────────────────────┐
│                Shared Services                   │
│  (Authentication, Merchant Catalog, Analytics)   │
└──────────────────────┬──────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │ Shared   │  │ Regional │  │ Isolated │
  │ Schema   │  │ Schema   │  │ Database │
  │          │  │          │  │          │
  │ SG,MY,PH │  │ ID (data │  │ KR (data│
  │ TH,TW,AU │  │ residency│  │ residency│
  │          │  │ required)│  │ required)│
  └──────────┘  └──────────┘  └──────────┘
```

---

## 4. Architecture Deep Dive

### 4.1 Tenant-Aware Request Flow

```
┌──────┐    ┌──────────┐    ┌────────────┐    ┌──────────┐
│User  │───→│API       │───→│ Tenant     │───→│ Service  │
│sg.app│    │Gateway   │    │ Resolver   │    │ Layer    │
└──────┘    └──────────┘    └────────────┘    └─────┬────┘
                                                     │
                                                     ▼
                                              ┌────────────┐
                                              │ Tenant-    │
                                              │ Aware DB   │
                                              │ Router     │
                                              └────────────┘
```

**Tenant Resolution:**

```typescript
interface TenantContext {
  tenantId: string; // 'sg', 'my', 'id', etc.
  currency: string; // 'SGD', 'MYR', 'IDR'
  locale: string; // 'en-SG', 'ms-MY', 'id-ID'
  timezone: string; // 'Asia/Singapore'
  region: string; // 'ap-southeast-1'
  features: string[]; // enabled feature flags
  dataResidency: string; // 'shared' | 'regional' | 'isolated'
}

// Resolved from:
// 1. Domain: sg.shopback.com → tenant: 'sg'
// 2. Header: X-Market-Id: sg
// 3. Path: /api/v1/sg/deals
// 4. JWT claim: { market: 'sg' }
```

### 4.2 Database Design (Shared Schema)

```sql
-- Every table includes market column for tenant isolation
CREATE TABLE users (
    user_id     BIGINT GENERATED ALWAYS AS IDENTITY,
    market      VARCHAR(2) NOT NULL,
    email       VARCHAR(255) NOT NULL,
    name        VARCHAR(255),
    created_at  TIMESTAMPTZ DEFAULT NOW(),

    PRIMARY KEY (market, user_id),
    UNIQUE (market, email)
);

-- Row-Level Security for tenant isolation
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON users
    USING (market = current_setting('app.current_market'));

-- Before each request:
SET app.current_market = 'sg';
-- Now all queries automatically filtered to 'sg' data
```

**Partitioning by Market:**

```sql
-- Partition large tables by market for performance
CREATE TABLE transactions (
    txn_id      UUID DEFAULT gen_random_uuid(),
    market      VARCHAR(2) NOT NULL,
    user_id     BIGINT NOT NULL,
    amount      DECIMAL(12,2) NOT NULL,
    currency    VARCHAR(3) NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
) PARTITION BY LIST (market);

CREATE TABLE transactions_sg PARTITION OF transactions FOR VALUES IN ('sg');
CREATE TABLE transactions_my PARTITION OF transactions FOR VALUES IN ('my');
CREATE TABLE transactions_id PARTITION OF transactions FOR VALUES IN ('id');
-- ... etc for each market
```

### 4.3 Configuration Management

```yaml
# Per-tenant configuration stored in central config service
tenants:
  sg:
    name: 'ShopBack Singapore'
    currency: 'SGD'
    locale: 'en-SG'
    timezone: 'Asia/Singapore'
    features:
      - shopback_pay
      - flash_deals
      - travel
    cashback:
      min_withdrawal: 10.00
      max_cashback_rate: 50
    data_residency: 'shared'

  id:
    name: 'ShopBack Indonesia'
    currency: 'IDR'
    locale: 'id-ID'
    timezone: 'Asia/Jakarta'
    features:
      - flash_deals
    cashback:
      min_withdrawal: 50000
      max_cashback_rate: 30
    data_residency: 'regional' # Data must stay in ap-southeast-3
```

### 4.4 Feature Flags

```
┌────────────────────────────────────────────┐
│          Feature Flag Evaluation           │
│                                            │
│  Input: (feature_name, tenant, user)       │
│                                            │
│  Checks:                                   │
│  1. Is feature enabled globally?           │
│  2. Is feature enabled for this market?    │
│  3. Is user in rollout percentage?         │
│  4. Does user match targeting rules?       │
│                                            │
│  Output: enabled/disabled                  │
└────────────────────────────────────────────┘
```

**Rollout Strategy:**

```
Feature: "shopback_pay_v2"
- SG: 100% (launched)
- MY: 50% (canary)
- ID: 10% (beta)
- TH: 0% (not started)
- US: 0% (not applicable)
```

---

## 5. Noisy Neighbor Prevention

### Problem

Singapore's 11.11 traffic spike shouldn't slow down Malaysia's normal operations.

### Solutions

```
┌─────────────────────────────────────────────┐
│            Resource Isolation                │
│                                             │
│  Level 1: Rate limiting per tenant          │
│  Level 2: Separate thread pools per tenant  │
│  Level 3: Resource quotas (CPU, memory)     │
│  Level 4: Separate compute for high-traffic │
│           tenants during events             │
└─────────────────────────────────────────────┘
```

**Rate Limiting:**

```
Per-tenant limits:
  sg: 10,000 req/s (highest traffic market)
  my: 5,000 req/s
  id: 8,000 req/s
  ...

During events:
  sg: 50,000 req/s (auto-scaled)
  others: unchanged
```

**Database Connection Pooling:**

```
Total pool: 200 connections

Allocation:
  sg: 50 connections (25%)
  my: 30 connections (15%)
  id: 40 connections (20%)
  reserved: 30 connections (15%) -- burst capacity
  others: 50 connections (25%) -- shared among remaining markets
```

---

## 6. Migration Strategy

### Phase 1: Shared Services (Low Risk)

- Migrate read-only services first (merchant catalog, deal listing)
- Both old and new stacks read from same data
- Feature flag controls routing

### Phase 2: Write Path Migration

- Dual-write period: writes go to both old and new systems
- Verify data consistency
- Gradually shift read traffic to new system

### Phase 3: Full Cutover

- Stop writes to old system
- Final data sync
- DNS switch
- Keep old system in standby for 30 days

```
Timeline:
Month 1-2:  Shared read services (merchant, deals)
Month 3-4:  User service migration
Month 5-6:  Transaction service migration
Month 7-8:  Full cutover per market (SG first, then others)
Month 9+:   Decommission old stacks
```

---

## 7. Key Trade-offs

| Decision                                  | Consideration                                      |
| ----------------------------------------- | -------------------------------------------------- |
| Shared vs separate DB                     | Shared for cost, separate for regulated markets    |
| Row-level security vs app-level filtering | RLS is safer but adds query overhead               |
| Partitioning by market                    | Better query performance, harder migrations        |
| Central vs distributed config             | Central for consistency, cache locally for latency |
| Feature flags complexity                  | More flexibility but operational overhead          |

---

## 8. Benefits Achieved

| Before (Per-Market)        | After (Multi-Tenant)      |
| -------------------------- | ------------------------- |
| Weeks to launch new market | Days to launch new market |
| N deploys for N markets    | 1 deploy for all markets  |
| N × resource headroom      | Shared resource pool      |
| Inconsistent features      | Feature parity with flags |
| Siloed teams               | Shared platform team      |
| 5 AWS regions, 11 stacks   | 3 regions, 1 platform     |
