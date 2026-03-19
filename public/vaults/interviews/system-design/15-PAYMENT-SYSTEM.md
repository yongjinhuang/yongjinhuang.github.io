# Design a Payment System (Stripe)

## 1. Requirements Clarification

### Functional Requirements

- **Process payments**: Accept credit/debit cards, bank transfers (ACH), and digital wallets (Apple Pay, Google Pay)
- **Refunds**: Full and partial refunds with reason tracking
- **Recurring billing**: Subscriptions with various billing cycles (monthly, annual, usage-based)
- **Multi-currency**: Support 135+ currencies with real-time exchange rates
- **Merchant dashboard**: Real-time transaction monitoring, analytics, and reporting
- **Webhooks**: Event-driven notifications for payment lifecycle events
- **Payouts**: Settle funds to merchant bank accounts on a configurable schedule
- **Dispute management**: Handle chargebacks and representment

### Non-Functional Requirements

- **Exactly-once processing**: No double charges, no lost payments
- **Low latency**: < 500ms for payment authorization (p99)
- **High availability**: 99.999% uptime (5.26 minutes downtime/year)
- **PCI DSS compliance**: Level 1 compliance for handling card data
- **Audit trail**: Immutable log of every action on every payment
- **Strong consistency**: Payment state must be consistent across reads
- **Durability**: Zero data loss for financial transactions

### Scale Estimates

- **Merchants**: 1M active merchants
- **Transactions**: 10M transactions/day
- **Daily volume**: $1B processed daily
- **Average transaction**: ~$100

### Back-of-Envelope Calculations

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

## 2. Payment Flow Overview

### Payment Lifecycle

Every card payment goes through three distinct phases:

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

### Parties Involved

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

### One-Time Payment Flow

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

### Subscription / Recurring Payment Flow

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

### Refund Flow

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

## 3. API Design

### Authentication

All API requests require a secret API key via Bearer token:

```
Authorization: Bearer sk_live_abc123...
```

### Idempotency

All write operations accept an `Idempotency-Key` header to prevent duplicate processing:

```
Idempotency-Key: a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

### Create Payment Intent

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

### Confirm Payment

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

### Capture Payment (for manual capture)

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

### Create Refund

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

### Create Subscription

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

### Webhook Events

Events are delivered via HTTP POST to merchant-configured endpoints:

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

## 4. High-Level Architecture

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

### Key Design Decisions

1. **Separate Payment State Machine**: Isolates the complex state transition logic from business logic
2. **Double-Entry Ledger**: Separate service ensures financial integrity
3. **Payment Processor Adapter**: Abstract interface allows swapping processors without changing core logic
4. **Event-Driven Architecture**: Kafka decouples services and enables exactly-once semantics
5. **DLQ for failed payments**: Failed payment processing attempts are retried asynchronously

---

## 5. Data Model

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

## 6. Payment State Machine

### State Diagram

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

### State Transitions

| From State        | To State          | Trigger                 | Side Effects                      |
| ----------------- | ----------------- | ----------------------- | --------------------------------- |
| `created`         | `processing`      | Confirm payment         | Lock idempotency key              |
| `created`         | `canceled`        | Cancel by merchant      | Release held funds                |
| `processing`      | `authorized`      | Processor approves      | Record auth code                  |
| `processing`      | `failed`          | Processor declines      | Record failure reason             |
| `processing`      | `requires_action` | 3DS required            | Return next_action URL            |
| `requires_action` | `processing`      | Customer completes 3DS  | Re-submit to processor            |
| `authorized`      | `captured`        | Auto or manual capture  | Create ledger entries             |
| `authorized`      | `canceled`        | Auth voided             | Void with processor               |
| `captured`        | `settled`         | End-of-day settlement   | Update ledger                     |
| `captured`        | `refunded`        | Refund processed        | Create refund ledger entries      |
| `settled`         | `refunded`        | Refund after settlement | Create refund + payout adjustment |

### Timeout Handling

```
State             Timeout        Action
-----------       ---------      ----------------------
processing        30 seconds     Mark failed, notify merchant
authorized        7 days         Auto-void authorization
requires_action   15 minutes     Mark failed, notify merchant
pending_capture   7 days         Auto-capture or void (configurable)
```

### Rollback / Compensation

Each state transition has a compensating action:

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

## 7. Exactly-Once Payment Processing

### The Double-Charge Problem

Double charges occur when:

1. **Network timeout**: Client retries after timeout, but first request succeeded
2. **Server crash**: Server processes payment but crashes before responding
3. **Duplicate submission**: User clicks "Pay" button multiple times

### Idempotency Key Implementation

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

### At-Least-Once Delivery + Idempotent Receiver

The system guarantees exactly-once semantics by combining:

1. **At-least-once delivery**: Messages are retried until acknowledged
2. **Idempotent receiver**: Each receiver can safely process the same message multiple times

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

### Saga Pattern for Multi-Step Payment

A payment involves multiple services. The Saga pattern coordinates them with compensating transactions:

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

**Saga compensation example (Step 3 fails):**

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

### What is Double-Entry Bookkeeping?

Every financial transaction is recorded as two entries:

- A **debit** (money coming in to an account)
- A **credit** (money going out of an account)

The fundamental rule: **Total Debits = Total Credits** (always).

This provides a self-balancing system where errors are immediately detectable.

### Account Types

```
Account Type     Debit Increases     Credit Increases
-----------      ---------------     ----------------
Asset            Yes                 No
Liability        No                  Yes
Revenue          No                  Yes
Expense          Yes                 No
```

### Key Accounts in Our System

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

### Example: $100 Payment with 2.9% + $0.30 Fee

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

### Example: $50 Partial Refund on the Above Payment

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

### Immutable Append-Only Design

The ledger is **never** modified. Corrections are made by adding reversal entries:

```
Rules:
1. INSERT only, never UPDATE or DELETE
2. Every entry has a created_at timestamp
3. Corrections create new reversal entries (not modifications)
4. Running balance = SUM(debits) - SUM(credits) per account
5. Audit trail is automatic (full history preserved)
6. Ledger entries reference the source payment_id for traceability
```

### Ledger Reconciliation Query

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

## 9. Fraud Detection

### Multi-Layer Fraud Detection Architecture

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

### Rule-Based Detection (Layer 1)

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

### ML-Based Fraud Scoring (Layer 2)

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

### 3D Secure (3DS) Authentication

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

### Real-time vs Batch Fraud Detection

| Aspect   | Real-time              | Batch                          |
| -------- | ---------------------- | ------------------------------ |
| Latency  | < 50ms                 | Hours                          |
| Scope    | Individual transaction | Cross-merchant patterns        |
| Data     | Transaction features   | Aggregate statistics           |
| Actions  | Block/allow/3DS        | Flag for review, update models |
| Examples | Velocity checks, geo   | Ring fraud, merchant collusion |

---

## 10. Reconciliation

### Why Reconciliation is Critical

Payment systems have multiple sources of truth (our database, processor records, bank statements). Discrepancies arise from:

- Network failures during processing
- Processor-side failures after our confirmation
- Settlement timing differences
- Currency conversion discrepancies
- Chargebacks initiated directly with banks

### Types of Reconciliation

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

### Daily Batch Reconciliation Process

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

### Handling Discrepancies

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

## 11. Reliability and Fault Tolerance

### Circuit Breaker for External Processors

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

### Retry with Exponential Backoff

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

### Fallback Payment Processors

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

### Event Sourcing Approach

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

## 12. Security and Compliance

### PCI DSS Compliance Overview

PCI DSS (Payment Card Industry Data Security Standard) has 12 requirements:

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

### Tokenization of Card Data

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

### Encryption

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

### Network Segmentation

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

### Audit Logging

Every action is logged with:

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

### Rate Limiting

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

## 13. Scaling

### Database Sharding by merchant_id

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

### Read Replicas

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

### Async Processing

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

### Event-Driven Architecture with Kafka

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

### Caching Strategy

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

## 14. Deployment Architecture

### Production Deployment

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

### Active-Passive for Payment Processing

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

### Data Residency for EU (GDPR)

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

## 15. Common Interview Follow-ups

### How to handle partial refunds?

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

### How to implement multi-currency support?

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

### How to handle payment processor outages?

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

### How to implement subscription billing with proration?

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

### How to prevent double-charging in distributed systems?

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

### How to design a payout system for merchants?

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

## Summary Cheat Sheet

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
