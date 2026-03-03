# Design a Subscription & Billing System (Stripe Billing / Chargebee / Recurly)

A subscription and billing system manages the full lifecycle of recurring revenue: plan creation, subscription management, usage metering, invoice generation, payment collection, dunning for failed payments, and revenue recognition. It must guarantee financial accuracy, PCI compliance, and graceful handling of complex billing scenarios like proration, mid-cycle plan changes, and hybrid pricing models.

---

## Table of Contents

1. [Requirements Clarification](#1-requirements-clarification)
2. [API Design](#2-api-design)
3. [Data Model](#3-data-model)
4. [High-Level Architecture](#4-high-level-architecture)
5. [Deep Dive: Subscription Lifecycle](#5-deep-dive-subscription-lifecycle)
6. [Deep Dive: Billing Models](#6-deep-dive-billing-models)
7. [Deep Dive: Proration](#7-deep-dive-proration)
8. [Deep Dive: Invoice Generation](#8-deep-dive-invoice-generation)
9. [Deep Dive: Payment Processing](#9-deep-dive-payment-processing)
10. [Deep Dive: Dunning & Retry](#10-deep-dive-dunning--retry)
11. [Deep Dive: Usage-Based Billing](#11-deep-dive-usage-based-billing)
12. [Deep Dive: Revenue Recognition](#12-deep-dive-revenue-recognition)
13. [Scaling Strategy](#13-scaling-strategy)
14. [Deployment Architecture](#14-deployment-architecture)
15. [Common Interview Follow-ups](#15-common-interview-follow-ups)
16. [Summary](#16-summary)

---

## 1. Requirements Clarification

### Functional Requirements

| # | Requirement | Description |
|---|-------------|-------------|
| 1 | Plan Management | Create, update, archive pricing plans with multiple billing intervals (monthly, quarterly, annual) and currencies |
| 2 | Subscription Lifecycle | Create, upgrade, downgrade, pause, resume, cancel subscriptions with configurable trial periods |
| 3 | Usage-Based Billing | Ingest usage events in real time, aggregate by metered dimensions, and bill based on consumption |
| 4 | Invoice Generation | Automatically generate invoices at billing cycle boundaries with line items, taxes, discounts, and credits |
| 5 | Payment Processing | Charge customer payment methods (cards, ACH, wallets) via payment gateway integration with idempotent retries |
| 6 | Proration | Calculate prorated charges and credits for mid-cycle plan changes (upgrades, downgrades, quantity changes) |
| 7 | Dunning & Retry | Automatically retry failed payments with configurable schedules, grace periods, and escalation (email, downgrade, cancel) |
| 8 | Coupons & Discounts | Apply percentage or fixed-amount discounts at the subscription, invoice, or line-item level with redemption limits |
| 9 | Webhooks & Events | Emit lifecycle events (subscription.created, invoice.paid, payment.failed) to merchant endpoints with guaranteed delivery |
| 10 | Multi-Currency | Price plans in multiple currencies, convert at invoice time, settle to merchant in their payout currency |
| 11 | Tax Calculation | Integrate with tax engines (Avalara, TaxJar) for jurisdiction-aware tax computation on each line item |
| 12 | Customer Portal | Self-service UI for customers to manage subscriptions, view invoices, update payment methods |

### Non-Functional Requirements

| # | Requirement | Target |
|---|-------------|--------|
| 1 | Invoice accuracy | 100% — zero tolerance for billing errors |
| 2 | Payment idempotency | Exactly-once charging; no double-billing under any failure mode |
| 3 | Availability | 99.99% for payment processing path (< 52 min downtime/year) |
| 4 | PCI DSS Compliance | Level 1; card data never stored or transmitted in our systems (tokenization via gateway) |
| 5 | Auditability | Immutable audit log for every state change on subscriptions, invoices, and payments |
| 6 | Consistency | Strong consistency for billing mutations; eventual consistency acceptable for analytics |
| 7 | Webhook delivery | At-least-once with retry; < 30 second p99 delivery latency |
| 8 | Usage event ingestion | < 500ms acknowledgment at 100K events/sec peak |
| 9 | Invoice generation latency | All invoices for a billing cycle generated within 1 hour window |
| 10 | Data retention | 7-year retention for financial records (SOX, tax compliance) |

### Capacity Estimation

```
Tenants (Merchants):           10,000 active merchants
Subscriptions:                 50,000,000 (50M total across all merchants)
Active subscriptions:          30,000,000 (30M — 60% active)
Monthly billing cycles:        25,000,000 (most are monthly)
Annual billing cycles:          5,000,000

Invoices generated/month:      25,000,000 (25M)
Invoices/day (uniform):        ~833,000
Invoices/hour (billing window): 25M / 1 hour = ~6,944/sec peak (batch billing runs)

Payments/month:                25,000,000
Payment retries/month:          5,000,000 (~20% fail on first attempt)
Total payment attempts/month:  30,000,000

Usage events:
  Average:     50,000 events/sec
  Peak:       100,000 events/sec (end of billing cycle flush)
  Daily:       50K * 86,400 = ~4.3B events/day
  Event size:  ~200 bytes

Storage:
  Subscription record:          ~1 KB    -> 50M * 1 KB = 50 GB
  Invoice record + line items:  ~5 KB    -> 25M/month * 5 KB = 125 GB/month
  Payment record:               ~1 KB    -> 30M/month * 1 KB = 30 GB/month
  Usage events:                 ~200 B   -> 4.3B/day * 200 B = 860 GB/day
  Usage aggregates:             ~100 B   -> 50M subs * 100 B = 5 GB/day
  Audit log:                    ~500 B   -> ~200M entries/month * 500 B = 100 GB/month

  Annual storage (excluding usage events):
    (125 + 30 + 100) GB/month * 12 = ~3 TB/year
  Usage events (raw, 90-day hot):
    860 GB/day * 90 = ~77 TB hot storage
  Usage events (cold, 7-year):
    860 GB/day * 365 * 7 = ~2.2 PB (compressed ~400 TB at 5:1)

Network:
  Usage event ingestion: 100K/sec * 200 B = 20 MB/sec inbound
  Payment gateway calls: ~12 TPS average, ~350 TPS peak (batch billing)
```

---

## 2. API Design

### Plans API

```
POST   /v1/plans                                Create a new pricing plan
GET    /v1/plans                                List all plans (with filters)
GET    /v1/plans/{planId}                       Get plan details
PATCH  /v1/plans/{planId}                       Update plan metadata (not pricing for active subs)
POST   /v1/plans/{planId}/archive               Archive plan (no new subscriptions)
```

**POST /v1/plans Request:**
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

**POST /v1/plans Response (201 Created):**
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

### Subscriptions API

```
POST   /v1/subscriptions                        Create a new subscription
GET    /v1/subscriptions/{subId}                Get subscription details
PATCH  /v1/subscriptions/{subId}                Update subscription (change plan, quantity)
POST   /v1/subscriptions/{subId}/cancel         Cancel subscription
POST   /v1/subscriptions/{subId}/pause          Pause subscription
POST   /v1/subscriptions/{subId}/resume         Resume paused subscription
GET    /v1/subscriptions?customerId={id}&status= List customer subscriptions
```

**POST /v1/subscriptions Request:**
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

**POST /v1/subscriptions Response (201 Created):**
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

**PATCH /v1/subscriptions/{subId} Request (Mid-Cycle Upgrade):**
```json
{
  "idempotencyKey": "idem_upgrade_abc123",
  "planId": "plan_enterprise_monthly",
  "quantity": 10,
  "prorationBehavior": "create_prorations",
  "billingCycleAnchor": "unchanged"
}
```

### Invoices API

```
GET    /v1/invoices                              List invoices (with filters)
GET    /v1/invoices/{invoiceId}                  Get invoice details
POST   /v1/invoices/{invoiceId}/pay              Attempt to pay an open invoice
POST   /v1/invoices/{invoiceId}/void             Void an unpaid invoice
POST   /v1/invoices/{invoiceId}/finalize         Finalize a draft invoice
GET    /v1/invoices/{invoiceId}/pdf              Download invoice PDF
GET    /v1/invoices/upcoming?subscriptionId={id} Preview upcoming invoice
```

**GET /v1/invoices/{invoiceId} Response:**
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

### Usage Events API

```
POST   /v1/usage_events                         Report a single usage event
POST   /v1/usage_events/batch                   Report a batch of usage events
GET    /v1/usage_events/summary?subscriptionId={id}&meterId={id}&periodStart=&periodEnd=
                                                 Get aggregated usage for a period
```

**POST /v1/usage_events/batch Request:**
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

**POST /v1/usage_events/batch Response (202 Accepted):**
```json
{
  "accepted": 2,
  "rejected": 0,
  "errors": []
}
```

### Webhooks API

```
POST   /v1/webhook_endpoints                    Register a webhook endpoint
GET    /v1/webhook_endpoints                    List webhook endpoints
DELETE /v1/webhook_endpoints/{endpointId}       Delete a webhook endpoint
GET    /v1/events                               List events (for polling fallback)
GET    /v1/events/{eventId}                     Get event details
```

---

## 3. Data Model

### Plans Table

```sql
CREATE TABLE plans (
    plan_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,                -- merchant who owns this plan
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

### Plan Prices Table

```sql
CREATE TABLE plan_prices (
    price_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id             UUID NOT NULL REFERENCES plans(plan_id),
    price_type          VARCHAR(20) NOT NULL,
                        -- 'flat', 'per_seat', 'metered', 'tiered_flat'
    amount              BIGINT,                       -- in smallest currency unit (cents)
    currency            CHAR(3) NOT NULL,
    meter_id            VARCHAR(100),                 -- for metered prices
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

### Price Tiers Table

```sql
CREATE TABLE price_tiers (
    tier_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    price_id            UUID NOT NULL REFERENCES plan_prices(price_id),
    up_to               BIGINT,                       -- NULL means unlimited
    unit_amount          BIGINT NOT NULL,              -- price per unit in cents
    flat_amount         BIGINT NOT NULL DEFAULT 0,    -- flat fee for this tier
    sort_order          SMALLINT NOT NULL,

    CONSTRAINT valid_unit_amount CHECK (unit_amount >= 0)
);

CREATE INDEX idx_price_tiers_price ON price_tiers(price_id, sort_order);
```

### Subscriptions Table

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
    payment_method_id       VARCHAR(255),             -- tokenized reference
    current_period_start    TIMESTAMPTZ NOT NULL,
    current_period_end      TIMESTAMPTZ NOT NULL,
    trial_start             TIMESTAMPTZ,
    trial_end               TIMESTAMPTZ,
    canceled_at             TIMESTAMPTZ,
    cancel_at_period_end    BOOLEAN NOT NULL DEFAULT FALSE,
    pause_start             TIMESTAMPTZ,
    pause_resume_at         TIMESTAMPTZ,
    billing_cycle_anchor    TIMESTAMPTZ NOT NULL,     -- day-of-month anchor
    coupon_id               UUID,
    idempotency_key         VARCHAR(255) UNIQUE,
    metadata                JSONB,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version                 BIGINT NOT NULL DEFAULT 0,  -- optimistic locking

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

### Invoices Table

```sql
CREATE TABLE invoices (
    invoice_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL,
    customer_id             UUID NOT NULL,
    subscription_id         UUID REFERENCES subscriptions(subscription_id),
    invoice_number          VARCHAR(50) NOT NULL,     -- human-readable sequential
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

### Invoice Line Items Table

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
    unit_amount             BIGINT NOT NULL DEFAULT 0,  -- cents
    amount                  BIGINT NOT NULL,            -- quantity * unit_amount (or override)
    currency                CHAR(3) NOT NULL,
    period_start            TIMESTAMPTZ,
    period_end              TIMESTAMPTZ,
    meter_id                VARCHAR(100),               -- for metered line items
    proration_details       JSONB,                      -- for proration line items
    metadata                JSONB,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_line_type CHECK (
        type IN ('subscription','metered','proration','discount',
                 'tax','one_time','credit')
    )
);

CREATE INDEX idx_line_items_invoice ON invoice_line_items(invoice_id);
```

### Payments Table

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
    gateway_payment_id      VARCHAR(255),             -- external gateway reference
    gateway_response        JSONB,                    -- raw gateway response
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

### Usage Events Table

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

-- Monthly partitions for efficient querying and archival
CREATE TABLE usage_events_2024_07 PARTITION OF usage_events
    FOR VALUES FROM ('2024-07-01') TO ('2024-08-01');
CREATE TABLE usage_events_2024_08 PARTITION OF usage_events
    FOR VALUES FROM ('2024-08-01') TO ('2024-09-01');

CREATE INDEX idx_usage_sub_meter_time ON usage_events(subscription_id, meter_id, timestamp);
```

### Usage Aggregates Table

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

### Subscription Events (Audit Log) Table

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

-- Immutable: no UPDATE or DELETE allowed (enforced by DB trigger)
CREATE INDEX idx_sub_events_sub ON subscription_events(subscription_id, created_at DESC);
CREATE INDEX idx_sub_events_type ON subscription_events(event_type, created_at DESC);
```

### Entity Relationship Overview

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

## 4. High-Level Architecture

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

### Component Responsibilities

| Component | Responsibility |
|-----------|---------------|
| API Gateway | Authentication, rate limiting, request routing, TLS termination |
| Plan Service | CRUD for pricing plans, prices, and tiers; plan versioning |
| Subscription Service | Lifecycle management: create, upgrade, downgrade, pause, cancel |
| Billing Engine | Proration calculation, metered usage pricing, discount application |
| Invoice Generator | Assembles invoices from subscription state, usage aggregates, and credits |
| Payment Gateway Adapter | Abstraction over external payment gateways; tokenization, charge, refund |
| Dunning Engine | Orchestrates retry schedules for failed payments, escalation policies |
| Usage Metering Service | Ingests usage events, deduplicates, aggregates per billing period |
| Webhook Service | Reliable event delivery to merchant endpoints with retry and signing |
| Kafka | Decouples services; provides at-least-once delivery guarantees |
| PostgreSQL | Source of truth for all transactional data |
| Redis | Caching, distributed locks, idempotency key store, rate limiting |
| ClickHouse | Columnar store for high-volume usage events and analytics queries |
| S3 | Invoice PDFs, cold storage for archived usage events and audit logs |

---

## 5. Deep Dive: Subscription Lifecycle

### State Machine

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

### State Transition Rules

| From | To | Trigger | Action |
|------|----|---------|--------|
| (none) | trialing | Subscription created with trial | Set trial_start, trial_end; no charge |
| (none) | active | Subscription created without trial | Charge immediately; generate first invoice |
| (none) | incomplete | First payment fails | Mark incomplete; dunning begins |
| trialing | active | Trial ends + payment succeeds | Generate invoice; charge customer |
| trialing | incomplete | Trial ends + payment fails | Invoice open; dunning begins |
| trialing | canceled | Customer cancels during trial | No charge; immediate cancellation |
| active | past_due | Renewal payment fails | Invoice remains open; dunning begins |
| active | paused | Customer requests pause | Stop billing; optionally set resume date |
| active | canceled | Customer cancels (immediate) | Generate final invoice with proration credits |
| active | canceled | Customer cancels (at period end) | Set cancel_at_period_end; active until period_end |
| past_due | active | Retry payment succeeds | Invoice marked paid; subscription restored |
| past_due | canceled | Grace period expires or max retries | Mark canceled; emit webhook |
| paused | active | Customer resumes or auto-resume date | Restart billing from resume date |
| canceled | expired | Current period end reached | Terminal state; no further action |
| incomplete | active | Payment succeeds within window | Invoice paid; subscription activated |
| incomplete | expired | Payment window expires (48h) | Terminal state |

### Lifecycle Processing (Pseudocode)

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

## 6. Deep Dive: Billing Models

### Model Overview

| Model | Description | Example | Calculation |
|-------|-------------|---------|-------------|
| Flat-rate | Fixed price per billing period | $49/month | `total = flat_price` |
| Per-seat | Price per unit (users, licenses) | $12/user/month | `total = price_per_seat * quantity` |
| Usage-based | Pay for what you use | $0.05/API call | `total = sum(tier_price * units_in_tier)` |
| Tiered (Graduated) | Different price per tier, charges accumulate | First 10K free, next 90K at $0.05 | `total = sum(units_in_tier * tier_rate)` |
| Tiered (Volume) | Single price based on total volume tier | 0-10K: $0.10, 10K-100K: $0.07 | `total = total_units * tier_rate` |
| Hybrid | Combination of flat + per-seat + metered | $49 base + $12/user + metered API | `total = flat + seats + metered` |

### Graduated Tiered Pricing Calculation

```
Plan: API calls pricing
  Tier 1:  0 - 10,000     @ $0.00/call  (free tier)
  Tier 2:  10,001 - 100,000  @ $0.05/call
  Tier 3:  100,001+        @ $0.03/call

Customer used: 150,000 API calls this month

Calculation (Graduated — each tier charged independently):
  Tier 1: min(150000, 10000) = 10,000 calls * $0.00 = $0.00
  Tier 2: min(150000 - 10000, 90000) = 90,000 calls * $0.05 = $4,500.00
  Tier 3: 150000 - 100000 = 50,000 calls * $0.03 = $1,500.00

  Total = $0.00 + $4,500.00 + $1,500.00 = $6,000.00
```

### Volume Tiered Pricing Calculation

```
Plan: API calls pricing (Volume)
  Tier 1:  0 - 10,000        @ $0.10/call
  Tier 2:  10,001 - 100,000  @ $0.07/call
  Tier 3:  100,001+          @ $0.04/call

Customer used: 150,000 API calls this month

Calculation (Volume — single rate based on total volume):
  Total units: 150,000 falls in Tier 3
  Total = 150,000 * $0.04 = $6,000.00
```

### Hybrid Pricing Calculation

```
Plan: Enterprise Plan
  Component 1 (flat):     $499/month base fee
  Component 2 (per-seat): $29/user/month
  Component 3 (metered):  API calls (graduated tiers above)

Customer: 25 users, 150,000 API calls

  Flat fee:              $499.00
  Per-seat: 25 * $29 =   $725.00
  Metered (graduated):  $6,000.00
  ─────────────────────────────
  Subtotal:             $7,224.00
  Coupon (20% off):    -$1,444.80
  ─────────────────────────────
  Pre-tax:              $5,779.20
  Tax (9%):               $520.13
  ─────────────────────────────
  Total:                $6,299.33
```

### Pricing Engine (Pseudocode)

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

## 7. Deep Dive: Proration

### When Proration Occurs

Proration is triggered whenever a subscription changes mid-cycle:

1. **Upgrade**: Customer moves to a more expensive plan
2. **Downgrade**: Customer moves to a less expensive plan
3. **Quantity change**: Adding or removing seats
4. **Mid-cycle cancellation**: Credit for unused time

### Proration Formula

```
Days remaining in period:
  days_remaining = (current_period_end - change_date) / total_period_days

Credit for unused old plan:
  credit = old_plan_price * (days_remaining / total_period_days)

Charge for new plan (remaining days):
  charge = new_plan_price * (days_remaining / total_period_days)

Net proration:
  proration_amount = charge - credit
  (positive = customer owes more, negative = customer gets credit)
```

### Proration Example: Mid-Cycle Upgrade

```
Scenario:
  Old plan: Basic ($49/month)
  New plan: Pro ($99/month)
  Billing cycle: July 1 - July 31 (31 days)
  Change date: July 16

Calculations:
  Days used on old plan:     15 days (July 1-15)
  Days remaining:            16 days (July 16-31)
  Total days in period:      31 days

  Credit for unused Basic:
    $49.00 * (16 / 31) = $25.29 credit

  Charge for Pro (remaining):
    $99.00 * (16 / 31) = $51.10 charge

  Net proration:
    $51.10 - $25.29 = $25.81 owed immediately

Invoice line items:
  1. "Unused time on Basic (Jul 16-31)"         -$25.29
  2. "Remaining time on Pro (Jul 16-31)"         +$51.10
  ─────────────────────────────────────────────
  Net charge:                                     $25.81

Next full invoice (Aug 1):
  "Pro Monthly"                                  $99.00
```

### Proration Example: Seat Addition

```
Scenario:
  Plan: Pro at $12/seat/month
  Current seats: 10
  New seats: 15 (adding 5)
  Billing cycle: July 1 - July 31 (31 days)
  Change date: July 21

Calculations:
  Days remaining: 10 days (July 21-31)
  Additional seats: 5

  Prorated charge for 5 new seats:
    $12.00 * 5 seats * (10 / 31) = $19.35

Invoice line item:
  1. "5 additional seats on Pro (Jul 21-31)"     +$19.35

Next full invoice (Aug 1):
  "Pro Monthly (15 seats @ $12)"                $180.00
```

### Proration Behaviors

| Behavior | Description | Use Case |
|----------|-------------|----------|
| `create_prorations` | Generate proration line items on next invoice | Default; most common |
| `always_invoice` | Generate and immediately charge a proration invoice | For significant upgrades |
| `none` | No proration; new price starts next cycle | Simpler; for downgrades only |

### Proration Calculation (Pseudocode)

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

## 8. Deep Dive: Invoice Generation

### Invoice Pipeline

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

### Step-by-Step Invoice Generation

```python
def generate_invoice(subscription_id: str) -> Invoice:
    sub = db.subscriptions.get(subscription_id)
    plan = db.plans.get(sub.plan_id)
    prices = db.plan_prices.list(plan_id=plan.plan_id)

    # Step 1: Create draft invoice
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

    # Step 2: Calculate line items
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

    # Add any pending proration line items
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

    # Step 3: Apply discounts
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

    # Apply customer credit balance
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

    # Step 4: Calculate tax
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

    # Step 5: Finalize invoice
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

    # Step 6: Generate PDF asynchronously
    kafka.publish("invoice.pdf_generation", {
        "invoice_id": invoice.invoice_id
    })

    return invoice
```

### Batch Invoice Generation (Cron Job)

```python
def billing_cycle_job():
    """
    Runs every hour. Finds subscriptions whose current_period_end
    falls within the next hour window and generates invoices.
    """
    now = datetime.utcnow()
    window_end = now + timedelta(hours=1)

    subscriptions = db.subscriptions.find(
        status__in=["active", "trialing"],
        current_period_end__gte=now,
        current_period_end__lt=window_end
    )

    # Partition by tenant for parallel processing
    by_tenant = group_by(subscriptions, key=lambda s: s.tenant_id)

    for tenant_id, tenant_subs in by_tenant.items():
        for sub in tenant_subs:
            kafka.publish("billing.generate_invoice", {
                "subscription_id": sub.subscription_id,
                "idempotency_key": f"inv_{sub.subscription_id}_{sub.current_period_end.isoformat()}"
            })
```

---

## 9. Deep Dive: Payment Processing

### Payment Flow

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

### Idempotent Payment Processing

```python
def process_payment(invoice_id: str, idempotency_key: str) -> Payment:
    # Check idempotency — prevent double charges
    existing = redis.get(f"idem:pay:{idempotency_key}")
    if existing:
        return db.payments.get(existing)

    # Also check DB (Redis may have evicted)
    existing_db = db.payments.find_by_idempotency_key(idempotency_key)
    if existing_db:
        redis.setex(f"idem:pay:{idempotency_key}", 86400, existing_db.payment_id)
        return existing_db

    invoice = db.invoices.get(invoice_id)
    if invoice.status != "open":
        raise InvalidStateError(f"Invoice {invoice_id} is {invoice.status}, expected open")

    sub = db.subscriptions.get(invoice.subscription_id)
    payment_method = resolve_payment_method(sub)

    # Create payment record before calling gateway
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

    # Store idempotency mapping immediately
    redis.setex(f"idem:pay:{idempotency_key}", 86400, payment.payment_id)

    try:
        # Call external payment gateway with gateway-level idempotency
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
        # Unknown state — query gateway to reconcile
        kafka.publish("payment.reconciliation", {
            "payment_id": payment.payment_id,
            "gateway_idempotency_key": f"gw_{idempotency_key}"
        })
        return db.payments.get(payment.payment_id)
```

### PCI Compliance Architecture

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
      │                             │───────────────────────►│
      │                             │                        │
      │                             │◄── Charge result ──────│
      │                             │                        │

Key principle: Raw card numbers NEVER touch our servers.
  - Client-side tokenization via gateway's JavaScript SDK
  - Our system only handles tokens (tok_xxx, pm_xxx)
  - Reduces PCI scope from SAQ-D to SAQ-A
  - Payment method tokens stored as opaque strings
```

---

## 10. Deep Dive: Dunning & Retry

### Dunning Overview

Dunning is the process of recovering failed payments. A well-designed dunning system reduces involuntary churn (customers who leave because of payment failures, not because they want to).

### Retry Schedule

```
Payment Failure Timeline:
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

### Smart Retry Strategy

```python
RETRY_SCHEDULE = [
    {"delay_hours": 24,  "attempt": 1},
    {"delay_hours": 72,  "attempt": 2},
    {"delay_hours": 120, "attempt": 3},
    {"delay_hours": 168, "attempt": 4},
    {"delay_hours": 336, "attempt": 5},  # day 14
]

# Smart retry timing: retry at times when payments are more likely to succeed
OPTIMAL_RETRY_HOURS = [10, 14, 17]  # 10am, 2pm, 5pm local time

DECLINE_CODE_STRATEGY = {
    # Hard declines — do not retry
    "stolen_card":         {"retry": False, "action": "cancel_immediately"},
    "fraudulent":          {"retry": False, "action": "cancel_immediately"},
    "card_not_supported":  {"retry": False, "action": "request_new_method"},

    # Soft declines — retry with backoff
    "insufficient_funds":  {"retry": True,  "action": "retry_with_backoff"},
    "processing_error":    {"retry": True,  "action": "retry_soon"},
    "expired_card":        {"retry": False, "action": "request_new_method"},
    "generic_decline":     {"retry": True,  "action": "retry_with_backoff"},

    # Issuer temporary failures
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
        # Max retries exhausted
        cancel_subscription(sub, reason="max_dunning_retries_exhausted")
        mark_invoice_uncollectible(invoice)
        return

    # Check grace period
    first_failure = db.payments.find_first_failure(invoice_id=invoice.invoice_id)
    grace_period_end = first_failure.created_at + timedelta(days=14)
    if datetime.utcnow() > grace_period_end:
        cancel_subscription(sub, reason="grace_period_expired")
        mark_invoice_uncollectible(invoice)
        return

    # Schedule next retry
    schedule = RETRY_SCHEDULE[attempt_count]
    next_retry_at = last_payment.created_at + timedelta(hours=schedule["delay_hours"])

    # Adjust to optimal retry hour in customer's timezone
    customer_tz = get_customer_timezone(sub.customer_id)
    next_retry_at = adjust_to_optimal_hour(next_retry_at, customer_tz)

    kafka.publish("dunning.schedule", {
        "subscription_id": sub.subscription_id,
        "invoice_id": invoice.invoice_id,
        "attempt_number": attempt_count + 1,
        "retry_at": next_retry_at.isoformat(),
        "idempotency_key": f"retry_{invoice.invoice_id}_{attempt_count + 1}"
    })

    # Send appropriate notification
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

### Dunning Metrics

| Metric | Target | Description |
|--------|--------|-------------|
| Recovery rate | > 70% | Percentage of initially failed payments eventually recovered |
| Avg recovery time | < 5 days | Average days from first failure to successful payment |
| Involuntary churn rate | < 2% | Percentage of active subscriptions lost to payment failure per month |
| Smart retry success rate | > 40% | Percentage of smart-timed retries that succeed |

---

## 11. Deep Dive: Usage-Based Billing

### Event Ingestion Architecture

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

### Idempotent Event Processing

```python
class UsageEventProcessor:
    def __init__(self):
        self.bloom_filter = ScalableBloomFilter(
            initial_capacity=10_000_000,
            error_rate=0.001
        )

    def process_event(self, event: dict) -> bool:
        idem_key = f"{event['tenant_id']}:{event['idempotency_key']}"

        # Fast path: Bloom filter check (probabilistic, no false negatives)
        if idem_key in self.bloom_filter:
            # Possible duplicate — verify against DB
            if db.usage_events.exists(
                tenant_id=event["tenant_id"],
                idempotency_key=event["idempotency_key"]
            ):
                return False  # confirmed duplicate, skip

        # Not a duplicate — process
        db.usage_events.insert(
            tenant_id=event["tenant_id"],
            subscription_id=event["subscription_id"],
            meter_id=event["meter_id"],
            quantity=event["quantity"],
            timestamp=event["timestamp"],
            idempotency_key=event["idempotency_key"],
            properties=event.get("properties")
        )

        # Update running aggregate (atomic increment)
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

        # Add to bloom filter
        self.bloom_filter.add(idem_key)

        return True
```

### Aggregation Strategy

```
Raw Events → Hourly Pre-aggregates → Period Aggregates → Invoice Line Item

Example:
  Subscription: sub_7a8b9c0d
  Meter: api_calls
  Billing period: July 1 - July 31

  Hourly aggregates (stored in ClickHouse):
    2024-07-01 00:00  →  1,250 calls
    2024-07-01 01:00  →    890 calls
    2024-07-01 02:00  →    340 calls
    ...
    2024-07-31 23:00  →  1,100 calls

  Period aggregate (stored in PostgreSQL):
    period: 2024-07-01 to 2024-07-31
    total_quantity: 2,450,000 calls

  At invoice time:
    Fetch period aggregate → Apply tiered pricing → Generate line item
```

### Real-Time Usage Dashboard Query

```sql
-- Current period usage for a subscription
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

-- Hourly breakdown (from ClickHouse for high-cardinality queries)
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

## 12. Deep Dive: Revenue Recognition

### ASC 606 Five-Step Model

Revenue recognition for subscription businesses follows ASC 606 (IFRS 15 internationally):

```
Step 1: Identify the contract
  → Subscription agreement between merchant and customer

Step 2: Identify performance obligations
  → Each billing period is a separate performance obligation
  → Usage-based components recognized as consumed

Step 3: Determine transaction price
  → Invoice total (including discounts, excluding tax)

Step 4: Allocate price to performance obligations
  → Monthly subscriptions: full amount allocated to the month
  → Annual subscriptions: allocated proportionally across 12 months
  → Setup fees: spread over expected contract duration

Step 5: Recognize revenue when obligation is satisfied
  → Over time: ratably across the service period
  → Usage-based: as consumption occurs
```

### Revenue Recognition Entries

```
Scenario: Annual plan at $1,200/year, paid upfront on Jan 1

January 1 (Payment received):
  Debit:  Cash                     $1,200
  Credit: Deferred Revenue         $1,200

January 31 (One month of service delivered):
  Debit:  Deferred Revenue           $100
  Credit: Recognized Revenue         $100

February 28:
  Debit:  Deferred Revenue           $100
  Credit: Recognized Revenue         $100

... (repeated monthly through December)

Balance sheet at March 31:
  Deferred Revenue: $1,200 - (3 * $100) = $900
  Recognized Revenue (Q1): $300
```

### Revenue Recognition Data Model

```sql
CREATE TABLE revenue_schedule (
    schedule_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    invoice_id          UUID NOT NULL REFERENCES invoices(invoice_id),
    line_item_id        UUID NOT NULL REFERENCES invoice_line_items(line_item_id),
    recognition_date    DATE NOT NULL,
    amount              BIGINT NOT NULL,           -- cents to recognize
    recognized          BOOLEAN NOT NULL DEFAULT FALSE,
    recognized_at       TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_rev_schedule UNIQUE (line_item_id, recognition_date)
);

CREATE INDEX idx_rev_schedule_date ON revenue_schedule(recognition_date)
    WHERE recognized = FALSE;
CREATE INDEX idx_rev_schedule_tenant ON revenue_schedule(tenant_id, recognition_date);
```

### Revenue Schedule Generation

```python
def generate_revenue_schedule(invoice: Invoice, line_items: list):
    schedules = []

    for item in line_items:
        if item.type in ("tax", "discount", "credit"):
            continue  # Tax and discounts are not revenue

        if item.period_start and item.period_end:
            # Spread revenue across the service period
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

                # Adjust last chunk to avoid rounding drift
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

## 13. Scaling Strategy

### Database Sharding

```
Sharding Strategy: Shard by tenant_id (merchant)

Rationale:
  - All queries for a subscription include tenant_id
  - Invoices, payments, usage events all tied to a tenant
  - Avoids cross-shard joins (all merchant data co-located)
  - Supports tenant isolation for compliance

Shard Layout:
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
                                      ... (4 shards for 64 virtual slots)

Virtual sharding: 64 virtual shards mapped to 4 physical shards initially.
  Scale to 8 physical shards by splitting virtual shard ranges.

Large tenants: Dedicated shard for tenants with > 1M subscriptions.
  Prevents noisy neighbor problems.
```

### Event Processing at Scale

```
Usage Event Throughput: 100K events/sec peak

Architecture:
  Kafka cluster: 3 brokers, replication factor 3
  usage.events topic: 128 partitions (partitioned by subscription_id hash)
  Consumer group: 32 workers (4 per physical host, 8 hosts)

  Each worker processes ~3,125 events/sec
  Processing time per event: ~1ms (validate + deduplicate + aggregate)

Scaling levers:
  1. Add partitions + consumers (linear horizontal scale)
  2. Batch aggregation writes (100 events per DB write)
  3. Local aggregation in consumer (flush every 5 seconds)
  4. ClickHouse for raw event storage (columnar, compressed)

Backpressure:
  - Consumer lag monitored via Kafka consumer group metrics
  - If lag > 1M events: auto-scale consumer group
  - If lag > 10M events: alert + throttle ingestion API (429)
```

### Read Replicas and Caching

```
Write Path (strong consistency):
  API → PostgreSQL Primary (per shard)
  Used for: subscription mutations, invoice finalization, payment recording

Read Path (eventual consistency):
  API → Redis Cache → PostgreSQL Read Replica
  Used for: subscription details, invoice history, usage dashboards

Cache Strategy:
  Subscription details:     Cache for 60 seconds (invalidate on change)
  Plan details:             Cache for 5 minutes (rarely change)
  Invoice (finalized):      Cache indefinitely (immutable once paid)
  Usage aggregates:         Cache for 30 seconds (frequently updated)
  Customer credit balance:  No cache (always read from primary)

Read Replica Configuration:
  2 synchronous replicas per shard (zero RPO)
  Streaming replication lag: < 100ms typical
  Failover: automatic promotion via Patroni
```

### Hot Spot Mitigation

```
Problem: Large tenant with 5M subscriptions, all renewing on the 1st of month
  → 5M invoices + 5M payment attempts in one billing window

Solutions:
  1. Billing cycle jitter: Spread billing anchors across the month
     - New subscriptions get anchor = signup_day (not 1st)
     - Existing: migrate gradually with proration

  2. Rate-limited billing queue:
     - Produce all invoice jobs to Kafka
     - Consume at controlled rate per tenant (e.g., 1K invoices/sec)
     - Prevents database write spikes

  3. Dedicated shard for large tenants:
     - Isolated DB for tenants > 1M subscriptions
     - Independent scaling of compute and storage

  4. Pre-computation:
     - Calculate invoice amounts 24 hours before billing date
     - Store as "draft invoices" — finalize and charge at billing time
     - Reduces billing window computation load by 80%
```

---

## 14. Deployment Architecture

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

External Dependencies:
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

### Deployment Strategies

| Component | Strategy | Reason |
|-----------|----------|--------|
| API Services | Rolling update (maxUnavailable: 25%) | Zero-downtime for API consumers |
| Billing Workers | Blue-green | Ensure exactly one billing processor active at a time |
| Usage Aggregation | Rolling update | Kafka consumer group rebalancing handles transitions |
| CronJobs | Leader election via Redis lock | Prevent duplicate cron execution across replicas |
| Database migrations | Expand-then-contract | Add new columns/tables first; backfill; then remove old |

---

## 15. Common Interview Follow-ups

**Q: How do you prevent double-billing when a payment call times out?**

A: Three-layer idempotency protection. First, the API layer deduplicates using the client-provided idempotency key stored in Redis (with 24-hour TTL) and PostgreSQL (permanent). If a duplicate request arrives, we return the cached result. Second, we create the payment record in our database with status "processing" before calling the external gateway — so even if we crash, we know a charge was attempted. Third, the payment gateway itself receives our idempotency key and guarantees at-most-once processing on their side. If we get a timeout, a reconciliation worker queries the gateway using the idempotency key to determine whether the charge succeeded or not, and updates our records accordingly.

**Q: How do you handle a mid-cycle plan change from monthly to annual billing?**

A: We treat it as a plan change with proration. First, we credit the customer for the unused portion of the current monthly cycle. Then we charge the full annual price immediately. The billing cycle anchor resets to the change date, and the next renewal is set to one year from now. For example, if a customer on a $49/month plan upgrades to $468/year ($39/month equivalent) on day 16 of a 30-day cycle, they get a credit of $49 * (14/30) = $22.87 for the unused monthly time, and are charged $468 for the year. Net charge: $468 - $22.87 = $445.13. The proration line items are recorded on the invoice for full audit trail.

**Q: How do you ensure usage events are not lost and not double-counted?**

A: Usage events flow through a durable pipeline. The ingestion API validates and immediately publishes to Kafka (which provides durability via replication). Consumers process events with idempotency: each event carries a client-provided idempotency key. A Bloom filter provides a fast probabilistic check for duplicates (no false negatives), and a database uniqueness constraint on (tenant_id, idempotency_key) provides the definitive guarantee. The consumer acknowledges the Kafka offset only after both the raw event insert and the aggregate increment have been committed in a single database transaction. If the consumer crashes before acknowledgment, Kafka redelivers the event, and the idempotency check prevents double-counting.

**Q: How do you handle billing for a customer who upgrades, downgrades, and upgrades again within a single billing period?**

A: Each plan change generates proration line items that are accumulated as "pending prorations" on the subscription. At invoice time, all pending prorations are collected and added as individual line items. For example: on July 1 the customer starts on Basic ($49/month), upgrades to Pro ($99) on July 10, downgrades to Basic on July 20, then upgrades back to Pro on July 25. Each change creates a credit for unused time on the old plan and a charge for remaining time on the new plan. The final invoice has six proration line items (three credits, three charges) plus the renewal charge. This approach is fully auditable because every change is individually traceable.

**Q: What happens if your billing system goes down during the billing cycle window?**

A: The billing system is designed for crash recovery. The billing cycle scanner is a cron job that identifies subscriptions due for renewal and publishes idempotent jobs to Kafka. If the scanner crashes, it simply runs again at the next interval and re-discovers any unprocessed subscriptions (subscriptions whose current_period_end has passed but have no corresponding invoice). Since invoice generation uses an idempotency key derived from subscription_id and period_end, duplicate Kafka messages produce at most one invoice. The Kafka topic retains messages for 7 days, providing a buffer far exceeding any realistic outage. After recovery, the system processes the backlog at a controlled rate to avoid overwhelming the payment gateways.

**Q: How do you handle multi-currency pricing and settlement?**

A: Plans are priced in specific currencies (a plan can have price variants for USD, EUR, GBP). When a customer subscribes, the invoice is generated in the plan's currency. If the merchant's payout currency differs from the invoice currency, currency conversion happens at settlement time (not billing time) using the exchange rate on the payout date. We store the original invoice currency and amount permanently — the conversion is a separate financial event. For merchants who want to price in the customer's local currency, we support multiple price points per plan (e.g., $49 USD, EUR 45, GBP 39), each set explicitly to avoid exchange rate risk.

**Q: How would you implement a freemium model with automatic upgrade on usage threshold?**

A: The freemium tier is modeled as a regular plan with a metered price that has a free tier (e.g., 0-1000 API calls at $0.00). When usage exceeds the free tier, the overage is billed at the metered rate on the next invoice. For automatic plan upgrade, a usage threshold trigger is configured: the usage aggregation worker checks the running total against the threshold after each increment. When the threshold is crossed, it publishes an event to Kafka. A subscription upgrade worker consumes this event, initiates a plan change to the paid tier (with proration), and emits a webhook notifying the merchant. The customer is notified via email with a link to manage their subscription. The merchant can configure whether the upgrade is automatic or requires customer confirmation.

**Q: How do you test billing logic to ensure correctness?**

A: Billing logic requires exhaustive testing at multiple levels. Unit tests cover every pricing model (flat, per-seat, graduated tiered, volume tiered, hybrid) with edge cases (zero usage, exactly-at-tier-boundary, maximum values, rounding). Property-based tests verify that proration credits plus charges always equal the correct total regardless of timing. Integration tests run the full invoice generation pipeline against a test database with known fixture data and verify every line item amount. We maintain a "billing scenario suite" of 200+ real-world scenarios (mid-cycle upgrades, multi-currency, coupons stacked with prorations, partial months, leap years). Every code change to the billing engine must pass this suite. In production, a reconciliation job runs daily comparing generated invoice totals against independently computed expected amounts and alerts on any discrepancy.

**Q: How do you handle tax calculation across jurisdictions?**

A: Tax calculation is delegated to a specialized tax engine (such as Avalara or TaxJar) via a synchronous API call during invoice finalization. We pass the customer's billing address, the line item amounts, and product tax codes. The tax engine returns the applicable tax rate and amount for each line item based on the jurisdiction (state, county, city for US; VAT for EU). Tax amounts are stored as separate line items on the invoice for transparency. For performance, we cache tax rates by jurisdiction with a 24-hour TTL (tax rates change infrequently). For EU customers, we handle reverse-charge VAT by detecting B2B transactions via VAT ID validation. Tax is never part of the subscription price itself — it is always computed and applied at invoice time.

---

## 16. Summary

### Key Architecture Decisions

| Decision | Chosen Approach | Alternative | Reason |
|----------|----------------|-------------|--------|
| Subscription state management | State machine with optimistic locking | Simple status field | State machine enforces valid transitions; optimistic lock prevents race conditions |
| Invoice generation | Batch cron + Kafka workers | Real-time on subscription renewal | Decoupled; handles millions of invoices in a controlled window; crash recovery via idempotent jobs |
| Usage event storage | Kafka + ClickHouse (hot) + S3 Parquet (cold) | PostgreSQL only | 100K events/sec exceeds RDBMS write capacity; columnar store optimal for aggregation queries |
| Usage deduplication | Bloom filter + DB unique constraint | DB unique constraint only | Bloom filter absorbs 99.9% of duplicate checks without DB round-trip at 100K events/sec |
| Proration | Per-second calculation with accumulated pending items | Per-day calculation | Per-second avoids edge cases at day boundaries; pending items allow multiple mid-cycle changes |
| Payment idempotency | Redis (fast) + PostgreSQL (durable) + gateway-level | Redis only | Survives Redis failures; gateway-level idempotency prevents double charges even if our system replays |
| Dunning retry timing | Smart retry (customer timezone + decline code analysis) | Fixed interval | 15-30% higher recovery rate by retrying when customer is likely to have funds |
| Multi-tenant data isolation | Logical sharding by tenant_id, dedicated shards for large tenants | Single database | Co-locates all tenant data; avoids cross-shard joins; large tenants get noisy-neighbor isolation |
| Revenue recognition | Pre-computed schedule table | Computed on-demand from invoices | Schedule table enables efficient monthly close; supports ASC 606 audit requirements |
| Tax calculation | External tax engine (Avalara) with caching | Built-in tax tables | Tax law changes constantly across 10,000+ jurisdictions; external engine maintained by specialists |

### Trade-Off Analysis

```
Consistency vs. Availability:
  - Billing mutations: Strong consistency (CP in CAP)
    → Incorrect billing is worse than brief unavailability
  - Usage dashboards: Eventual consistency (AP in CAP)
    → Stale usage display acceptable; real-time not required

Complexity vs. Correctness:
  - Proration engine: High complexity, but financial accuracy is non-negotiable
  - Revenue recognition: Added complexity for regulatory compliance
  - Trade-off: invest in correctness; billing errors erode trust

Latency vs. Throughput:
  - Payment processing: Optimized for latency (< 2 sec end-to-end)
  - Invoice generation: Optimized for throughput (batch millions per hour)
  - Usage ingestion: Optimized for throughput (100K events/sec, async)

Build vs. Buy:
  - Payment gateway: Buy (Stripe, Adyen) — PCI compliance alone justifies
  - Tax engine: Buy (Avalara) — tax law expertise not our core competency
  - Billing engine: Build — core differentiator; full control over pricing models
  - Usage metering: Build — custom aggregation logic tightly coupled to billing
```

---

*Covers: subscription state machine, billing models (flat/per-seat/metered/tiered/hybrid), proration calculation, invoice pipeline, idempotent payment processing, PCI compliance, dunning & smart retry, usage-based billing at scale, revenue recognition (ASC 606), tenant-based sharding, event-driven architecture.*
