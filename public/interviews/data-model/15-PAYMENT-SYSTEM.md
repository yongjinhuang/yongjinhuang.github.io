# Data Model: Payment System (Stripe)

A payment system processes financial transactions between customers and merchants. The data model must guarantee correctness above all else: every cent must be accounted for via double-entry bookkeeping, every operation must be idempotent to handle retries safely, and the system must maintain a complete audit trail. Financial regulations (PCI-DSS, SOX) impose strict requirements on data handling, encryption, and retention.

## Table Responsibilities

| Table               | Purpose                                 | Storage                  | Key Characteristic                                         |
| ------------------- | --------------------------------------- | ------------------------ | ---------------------------------------------------------- |
| **merchants**       | Business accounts that receive payments | PostgreSQL               | Onboarding, KYC status, payout configuration               |
| **payment_methods** | Tokenized customer payment instruments  | PostgreSQL (encrypted)   | PCI-compliant token storage, never stores raw card numbers |
| **payments**        | Core transaction records                | PostgreSQL               | Idempotent, state-machine driven lifecycle                 |
| **ledger_entries**  | Double-entry bookkeeping log            | PostgreSQL (append-only) | Immutable audit trail, every debit has a matching credit   |
| **refunds**         | Partial or full reversal of payments    | PostgreSQL               | Linked to original payment, creates reverse ledger entries |
| **webhook_events**  | Asynchronous merchant notifications     | PostgreSQL + Redis queue | At-least-once delivery with retry backoff                  |

## Detailed Field Descriptions

### merchants

| Field           | Type                                                               | Description                                                                                                                                                    |
| --------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id              | BIGINT, PK                                                         | Unique merchant identifier.                                                                                                                                    |
| name            | VARCHAR(255), NOT NULL                                             | Business legal name. Used in payment receipts and regulatory filings.                                                                                          |
| email           | VARCHAR(255), UNIQUE                                               | Primary contact email. Used for payout notifications and account recovery.                                                                                     |
| country         | VARCHAR(2)                                                         | ISO country code. Determines applicable tax rules, currency restrictions, and regulatory requirements.                                                         |
| currency        | VARCHAR(3)                                                         | Default settlement currency (e.g., "USD", "EUR"). Payouts are converted to this currency.                                                                      |
| payout_schedule | VARCHAR(20)                                                        | How often the merchant receives payouts ("daily", "weekly", "monthly"). Drives the settlement batch job.                                                       |
| status          | ENUM('pending_verification', 'active', 'suspended', 'deactivated') | KYC/onboarding status. Only `active` merchants can process payments. Suspended merchants' funds are held until review completes.                               |
| api_key_hash    | VARCHAR(128)                                                       | Bcrypt hash of the merchant's API key. The raw key is shown once at creation and never stored. Hashing prevents key theft even if the database is compromised. |

**Why hash the API key instead of encrypting it?** Encryption is reversible; if the encryption key is compromised, all API keys are exposed. Hashing is one-way: we can verify an incoming API key by hashing it and comparing, but we can never recover the original. This follows the same principle as password storage.

### payment_methods

| Field       | Type                                   | Description                                                                                                                                                        |
| ----------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| id          | BIGINT, PK                             | Unique payment method identifier.                                                                                                                                  |
| customer_id | BIGINT, FK -> customers, INDEX         | Which customer owns this payment method. A customer can have multiple cards/bank accounts.                                                                         |
| type        | ENUM('card', 'bank_account', 'wallet') | Payment instrument type. Determines which processor flow to use (card networks vs ACH vs wallet APIs).                                                             |
| token       | VARCHAR(255), UNIQUE                   | Processor-generated token representing the payment method. Replaces the actual card number, enabling charges without handling raw card data (PCI scope reduction). |
| is_default  | BOOLEAN                                | Whether this is the customer's default payment method. Only one per customer should be true.                                                                       |
| last_four   | VARCHAR(4)                             | Last four digits of card/account. Safe to store (not considered sensitive data) and used for display ("Visa ending in 4242").                                      |
| brand       | VARCHAR(20)                            | Card network (Visa, Mastercard, Amex). Determines interchange fees and supported features.                                                                         |
| exp_month   | SMALLINT                               | Card expiration month. Used to proactively notify customers before their card expires, reducing failed payments.                                                   |
| exp_year    | SMALLINT                               | Card expiration year. Combined with exp_month for expiration checks.                                                                                               |

**Why tokenization instead of storing card numbers?** PCI-DSS compliance requires that any system storing card numbers undergoes annual audits costing $50K-$500K. By tokenizing via a PCI-compliant processor (Stripe, Adyen), the card number never touches our database, dramatically reducing compliance scope and cost.

### payments

| Field           | Type                                                                                               | Description                                                                                                                                                                |
| --------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id              | BIGINT, PK                                                                                         | Unique payment identifier.                                                                                                                                                 |
| merchant_id     | BIGINT, FK -> merchants, INDEX                                                                     | Which merchant receives this payment. Indexed for merchant dashboard queries.                                                                                              |
| customer_id     | BIGINT, FK -> customers, INDEX                                                                     | Which customer is paying. Indexed for customer transaction history.                                                                                                        |
| amount          | BIGINT, NOT NULL                                                                                   | Payment amount in the smallest currency unit (cents for USD, yen for JPY). Using integers avoids floating-point rounding errors that would cause accounting discrepancies. |
| currency        | VARCHAR(3), NOT NULL                                                                               | ISO currency code. Stored per-payment because a merchant may accept multiple currencies.                                                                                   |
| status          | ENUM('pending', 'authorized', 'captured', 'refunded', 'partially_refunded', 'failed', 'cancelled') | Payment lifecycle state. Each transition is validated by a state machine (e.g., only `authorized` can transition to `captured`).                                           |
| idempotency_key | VARCHAR(64), UNIQUE                                                                                | Client-provided key to prevent duplicate charges. If a network timeout causes a retry, the same idempotency_key ensures the payment is processed only once.                |
| processor_id    | VARCHAR(255)                                                                                       | Transaction ID from the external payment processor. Used for reconciliation and dispute resolution.                                                                        |
| amount_captured | BIGINT, DEFAULT 0                                                                                  | How much has been captured (may be less than authorized amount for partial captures).                                                                                      |
| amount_refunded | BIGINT, DEFAULT 0                                                                                  | How much has been refunded. Constraint: `amount_refunded <= amount_captured`.                                                                                              |

**Why store amounts as integers (cents)?** Floating-point arithmetic is inherently imprecise: `0.1 + 0.2 = 0.30000000000000004` in most languages. In a payment system, a rounding error of even one cent across millions of transactions creates real financial discrepancies. Integer arithmetic in the smallest currency unit is exact.

**Why `idempotency_key`?** Network failures are common. If a client sends a payment request and the response is lost, the client retries. Without idempotency, the customer would be charged twice. The unique idempotency_key ensures the second request returns the result of the first without re-processing.

### ledger_entries

| Field         | Type                          | Description                                                                                                                                    |
| ------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| id            | BIGINT, PK                    | Unique ledger entry identifier.                                                                                                                |
| payment_id    | BIGINT, FK -> payments, INDEX | Which payment this entry relates to. A single payment generates multiple ledger entries (debit + credit).                                      |
| account_id    | VARCHAR(64), INDEX            | The ledger account being affected (e.g., "customer:12345:liability", "merchant:678:receivable", "platform:fees"). Indexed for balance queries. |
| entry_type    | ENUM('debit', 'credit')       | Whether this entry increases or decreases the account balance. Every transaction must have balanced debits and credits.                        |
| amount        | BIGINT, NOT NULL              | Entry amount in smallest currency unit. Always positive; the entry_type indicates direction.                                                   |
| balance_after | BIGINT                        | Account balance after this entry. Pre-computed to avoid summing all historical entries for balance queries.                                    |
| created_at    | TIMESTAMP, NOT NULL           | When the entry was created. Immutable: ledger entries are never updated or deleted, only new correcting entries are appended.                  |

**Why double-entry bookkeeping?** Single-entry systems ("subtract from customer, add to merchant") can silently lose money if one side fails. Double-entry ensures every debit has a corresponding credit. If the sum of all debits does not equal the sum of all credits, something went wrong and the system can detect it immediately. This is the foundation of all accounting systems.

**Why `balance_after`?** Computing a balance by summing all historical entries is O(N) where N grows forever. Storing the running balance enables O(1) balance lookups. The trade-off is that `balance_after` must be updated atomically with each new entry, which requires row-level locking on the latest entry.

### refunds

| Field        | Type                                                 | Description                                                                                                                               |
| ------------ | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| id           | BIGINT, PK                                           | Unique refund identifier.                                                                                                                 |
| payment_id   | BIGINT, FK -> payments, INDEX                        | Which payment is being refunded. A payment can have multiple partial refunds as long as total refunded <= amount captured.                |
| amount       | BIGINT, NOT NULL                                     | Refund amount in smallest currency unit. Can be less than the original payment amount (partial refund).                                   |
| status       | ENUM('pending', 'processing', 'succeeded', 'failed') | Refund lifecycle state. Refunds to cards take 5-10 business days; the status tracks this asynchronous process.                            |
| reason       | VARCHAR(255)                                         | Why the refund was issued (e.g., "customer_request", "duplicate", "fraudulent"). Used for fraud analysis and merchant dispute resolution. |
| processor_id | VARCHAR(255)                                         | Refund transaction ID from the payment processor. Used for reconciliation.                                                                |

**Why a separate refunds table instead of negative payments?** Refunds have their own lifecycle (pending -> processing -> succeeded), different from payments. They also need to reference the original payment for validation (total refunds cannot exceed captured amount). A separate table makes this relationship explicit and the state machine independent.

### webhook_events

| Field         | Type                              | Description                                                                                                                    |
| ------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| id            | BIGINT, PK                        | Unique event identifier.                                                                                                       |
| merchant_id   | BIGINT, FK -> merchants, INDEX    | Which merchant should receive this webhook.                                                                                    |
| event_type    | VARCHAR(100), INDEX               | Event category (e.g., "payment.captured", "refund.succeeded", "dispute.created"). Merchants subscribe to specific event types. |
| payload_json  | JSONB                             | Full event payload. JSONB for flexibility since different event types have different payloads.                                 |
| status        | ENUM('pending', 'sent', 'failed') | Delivery status. `failed` means all retry attempts exhausted.                                                                  |
| attempts      | INT, DEFAULT 0                    | Number of delivery attempts. Used with exponential backoff (retry at 1min, 5min, 30min, 2hr, 24hr).                            |
| next_retry_at | TIMESTAMP, NULLABLE               | When to retry delivery. Null if status is `sent` or if max retries exceeded. Indexed for the retry worker to find due events.  |

**Why at-least-once delivery with retries?** Merchants depend on webhooks to update their systems (e.g., ship an order after payment.captured). If a webhook fails due to a temporary network issue, the merchant would miss the notification. Retries with exponential backoff ensure delivery while avoiding overwhelming a struggling merchant server.

## ER Diagram

```
┌──────────────────────┐       ┌──────────────────────┐
│     merchants         │       │   webhook_events      │
│──────────────────────│       │──────────────────────│
│ id (PK)               │       │ id (PK)               │
│ name                  │       │ merchant_id (FK)      │
│ email                 │  1    │ event_type            │
│ country               │──────►│ payload_json          │
│ currency              │  *    │ status                │
│ payout_schedule       │       │ attempts              │
│ status                │       │ next_retry_at         │
│ api_key_hash          │       └──────────────────────┘
└──────────────────────┘
          │
          │ 1
          │
          │ *
┌──────────────────────┐       ┌──────────────────────┐
│      payments         │       │  payment_methods      │
│──────────────────────│       │──────────────────────│
│ id (PK)               │       │ id (PK)               │
│ merchant_id (FK)      │       │ customer_id (FK)      │
│ customer_id (FK)      │       │ type                  │
│ amount                │       │ token                 │
│ currency              │       │ is_default            │
│ status                │       │ last_four             │
│ idempotency_key       │       │ brand                 │
│ processor_id          │       │ exp_month             │
│ amount_captured       │       │ exp_year              │
│ amount_refunded       │       └──────────────────────┘
└──────────────────────┘
     │              │
     │ 1            │ 1
     │              │
     │ *            │ *
┌────────────┐  ┌──────────────────────┐
│  refunds    │  │   ledger_entries      │
│────────────│  │──────────────────────│
│ id (PK)     │  │ id (PK)               │
│ payment_id  │  │ payment_id (FK)       │
│ amount      │  │ account_id            │
│ status      │  │ entry_type            │
│ reason      │  │ amount                │
│ processor_id│  │ balance_after         │
└────────────┘  │ created_at            │
                 └──────────────────────┘

Relationships:
  merchants 1───* payments         (one merchant receives many payments)
  merchants 1───* webhook_events   (one merchant receives many webhooks)
  payments  1───* ledger_entries   (one payment creates multiple debit/credit entries)
  payments  1───* refunds          (one payment can have multiple partial refunds)
  customers 1───* payment_methods  (one customer has many payment methods)
```

## Data Flow

### Processing a Payment (Write Path)

```
1. Client creates PaymentIntent with idempotency_key
         │
         ▼
2. Check idempotency_key in payments table
         │
    ┌────┴──────┐
    │Duplicate? │
    ├─Yes───────┤──► Return existing payment result (idempotent)
    │ No        │
    └────┬──────┘
         ▼
3. Validate merchant (status = active) and payment_method (token valid)
         │
         ▼
4. INSERT payment record (status = 'pending')
         │
         ▼
5. Send authorization request to payment processor
         │
    ┌────┴──────┐
    │Approved?  │
    ├─No────────┤──► Update status = 'failed', fire webhook
    │ Yes       │
    └────┬──────┘
         ▼
6. Update payment status = 'authorized', store processor_id
         │
         ▼
7. Capture payment (can be immediate or deferred):
   Update status = 'captured', amount_captured = amount
         │
         ▼
8. Create ledger_entries (atomic transaction):
   - DEBIT  customer liability account   (amount)
   - CREDIT merchant receivable account  (amount - platform_fee)
   - CREDIT platform fee account         (platform_fee)
         │
         ▼
9. Fire webhook_events: "payment.captured" to merchant
         │
         ▼
10. Merchant fulfills order based on webhook
```

### Processing a Refund

```
1. Merchant requests refund for payment_id with amount
         │
         ▼
2. Validate: payment.status = 'captured'
   and (amount_refunded + refund_amount) <= amount_captured
         │
         ▼
3. INSERT refund record (status = 'pending')
         │
         ▼
4. Send refund request to payment processor
         │
         ▼
5. On processor confirmation:
   Update refund status = 'succeeded'
   Update payment: amount_refunded += refund_amount
         │
         ▼
6. Create reverse ledger_entries (atomic):
   - CREDIT customer liability account   (refund_amount)
   - DEBIT  merchant receivable account  (refund_amount - fee_reversal)
   - DEBIT  platform fee account         (fee_reversal)
         │
         ▼
7. Fire webhook_events: "refund.succeeded" to merchant
```

**Why separate authorize and capture?** Hotels and car rentals authorize a hold amount at booking but capture a different amount at checkout (longer stay, damage, etc.). Separating these steps enables this common business pattern. For simple e-commerce, authorization and capture can happen in a single step.

**Why create ledger entries atomically in a database transaction?** If the debit succeeds but the credit fails (e.g., due to a crash), money disappears. Wrapping all ledger entries in a single database transaction ensures atomicity: either all entries are written or none are. This is the most critical invariant in the entire system.
