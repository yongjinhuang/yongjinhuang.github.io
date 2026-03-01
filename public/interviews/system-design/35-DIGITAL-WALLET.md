# Design a Digital Wallet & Ledger System (PayPal / Venmo / Apple Pay)

---

## 1. Requirements Clarification

### Functional Requirements

| # | Requirement | Description |
|---|-------------|-------------|
| 1 | Wallet Creation | Every user gets a wallet on registration; supports personal and business accounts |
| 2 | Top-up / Deposit | Fund wallet from linked bank (ACH), debit card push, or wire transfer |
| 3 | P2P Transfer | Send money instantly to another wallet user by email/phone/username |
| 4 | Withdraw | Pull funds from wallet to linked bank account (ACH or wire) |
| 5 | Payment | Pay merchants; wallet is debited, merchant wallet or bank is credited |
| 6 | Transaction History | Paginated, filterable ledger of all wallet events |
| 7 | Balance Inquiry | Real-time available balance and pending/reserved amounts |
| 8 | Refunds & Reversals | Reverse or partially refund completed transactions |
| 9 | Multi-currency | Hold and convert between currencies; display in user's preferred currency |
| 10 | Recurring Payments | Schedule recurring transfers and standing orders |
| 11 | Escrow | Hold funds in escrow for marketplace transactions, release on condition |
| 12 | Notifications | Push/email/SMS alerts for every wallet event |

### Non-Functional Requirements

| # | Requirement | Target |
|---|-------------|--------|
| 1 | Transfer latency | < 500ms end-to-end for P2P (p99) |
| 2 | Balance accuracy | 100% — zero tolerance for errors |
| 3 | Availability | 99.999% (< 5.26 minutes downtime/year) |
| 4 | Throughput | 5,000 TPS sustained; 20,000 TPS peak |
| 5 | Durability | Zero transaction loss — write-ahead log + synchronous replication |
| 6 | Audit | Complete, immutable history for every state change |
| 7 | Consistency | Strong consistency for all balance mutations |
| 8 | Idempotency | Exactly-once semantics for every operation |
| 9 | Compliance | KYC/AML, PCI-DSS, SOX audit trail, GDPR |
| 10 | Encryption | All PII and financial data encrypted at rest and in transit |

### Scale Estimation

```
Wallets:               100,000,000 (100M users)
Active wallets/day:     20,000,000 (20% DAU)
Transactions/day:       50,000,000 (50M)
Daily volume:          $10,000,000,000 ($10B)
Average transaction:   $200

Peak TPS (8-hour day, 3x average):
  50M / 86,400s = ~578 TPS average
  Peak (3x)     = ~1,734 TPS
  Flash events  = ~20,000 TPS (PayDay, Black Friday)

Ledger entries (2 per transaction — debit + credit):
  50M * 2 = 100M ledger rows/day

Storage:
  Wallet record:       ~500 bytes  → 100M * 500B = 50 GB
  Transaction record:  ~2 KB       → 50M/day * 2KB = 100 GB/day
  Ledger entry:        ~500 bytes  → 100M/day * 500B = 50 GB/day
  Audit log:           ~1 KB       → 200M/day * 1KB = 200 GB/day

  5-year retention:    (100 + 50 + 200) GB * 365 * 5 = ~632 TB raw
  After compression:   ~150 TB (4:1 compression on structured data)

Cache (hot wallets):
  Top 1M wallets * 200 bytes = 200 MB — fits in single Redis node
  Balance cache TTL: 1 second (near-real-time reads)
```

---

## 2. API Design

### Wallet API

```
GET    /v1/wallets/me                           Get my wallet info and balances
GET    /v1/wallets/{walletId}                   Get wallet by ID (admin / KYC service)
POST   /v1/wallets                              Create wallet (called internally on user registration)
PATCH  /v1/wallets/{walletId}/status            Freeze / unfreeze wallet (compliance)
```

**GET /v1/wallets/me Response:**
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

### Transfer API

```
POST   /v1/transfers                            Initiate P2P transfer
GET    /v1/transfers/{transferId}               Get transfer status
POST   /v1/transfers/{transferId}/cancel        Cancel pending transfer
POST   /v1/transfers/{transferId}/reverse       Reverse completed transfer
```

**POST /v1/transfers Request:**
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

**POST /v1/transfers Response (201 Created):**
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

### Top-up and Withdrawal API

```
POST   /v1/topups                               Fund wallet from bank or card
GET    /v1/topups/{topupId}                     Get top-up status
POST   /v1/withdrawals                          Withdraw to linked bank
GET    /v1/withdrawals/{withdrawalId}           Get withdrawal status
```

**POST /v1/topups Request:**
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

### Ledger API

```
GET    /v1/ledger?walletId=&currency=&from=&to=&page=&limit=
GET    /v1/ledger/{entryId}
```

**GET /v1/ledger Response:**
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

## 3. Data Model

### Wallets Table

```sql
CREATE TABLE wallets (
    wallet_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL UNIQUE,
    wallet_type     VARCHAR(20) NOT NULL,  -- 'personal','business','escrow','platform','fee_pool'
    status          VARCHAR(20) NOT NULL DEFAULT 'active',
                    -- 'active','frozen','suspended','closed'
    kyc_tier        SMALLINT NOT NULL DEFAULT 0,  -- 0=unverified, 1=basic, 2=standard, 3=enhanced
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_wallet_type CHECK (
        wallet_type IN ('personal','business','escrow','platform','fee_pool')
    )
);

CREATE INDEX idx_wallets_user_id ON wallets(user_id);
CREATE INDEX idx_wallets_status  ON wallets(status);
```

### Wallet Balances Table (Materialized, Append-Only Updates)

```sql
CREATE TABLE wallet_balances (
    balance_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id       UUID NOT NULL REFERENCES wallets(wallet_id),
    currency        CHAR(3) NOT NULL,           -- ISO 4217 e.g. 'USD','EUR'
    available       NUMERIC(20, 8) NOT NULL DEFAULT 0,
    pending         NUMERIC(20, 8) NOT NULL DEFAULT 0,
    reserved        NUMERIC(20, 8) NOT NULL DEFAULT 0,
    version         BIGINT NOT NULL DEFAULT 0,  -- optimistic lock version
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_wallet_balance UNIQUE (wallet_id, currency),
    CONSTRAINT non_negative_available CHECK (available >= 0),
    CONSTRAINT non_negative_pending   CHECK (pending >= 0),
    CONSTRAINT non_negative_reserved  CHECK (reserved >= 0)
);

CREATE INDEX idx_wallet_balances_wallet ON wallet_balances(wallet_id);
```

### Transactions Table

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
    exchange_rate       NUMERIC(20, 8),          -- if cross-currency
    base_currency       CHAR(3),                 -- original currency before FX
    base_amount         NUMERIC(20, 8),          -- original amount before FX
    fee_amount          NUMERIC(20, 8) NOT NULL DEFAULT 0,
    description         TEXT,
    reference_id        UUID,                    -- linked transaction (reversal points to original)
    failure_reason      TEXT,
    metadata            JSONB,
    risk_score          SMALLINT,                -- 0-100, from fraud engine
    initiated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    authorized_at       TIMESTAMPTZ,
    settled_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    failed_at           TIMESTAMPTZ,
    expires_at          TIMESTAMPTZ,             -- for pending authorizations

    CONSTRAINT valid_amount CHECK (amount > 0),
    CONSTRAINT valid_fee    CHECK (fee_amount >= 0)
);

CREATE INDEX idx_txn_idempotency    ON transactions(idempotency_key);
CREATE INDEX idx_txn_from_wallet    ON transactions(from_wallet_id, initiated_at DESC);
CREATE INDEX idx_txn_to_wallet      ON transactions(to_wallet_id, initiated_at DESC);
CREATE INDEX idx_txn_status         ON transactions(status) WHERE status NOT IN ('completed','failed');
CREATE INDEX idx_txn_reference      ON transactions(reference_id);
```

### Ledger Entries Table (Double-Entry Bookkeeping)

```sql
CREATE TABLE ledger_entries (
    entry_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id      UUID NOT NULL REFERENCES transactions(transaction_id),
    wallet_id           UUID NOT NULL REFERENCES wallets(wallet_id),
    account_type        VARCHAR(30) NOT NULL,   -- 'wallet','escrow','fee_pool','platform'
    entry_type          VARCHAR(10) NOT NULL,   -- 'debit' or 'credit'
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

-- Immutable: no UPDATE or DELETE allowed (enforced by DB trigger or row-level policy)
CREATE INDEX idx_ledger_transaction ON ledger_entries(transaction_id);
CREATE INDEX idx_ledger_wallet_time ON ledger_entries(wallet_id, created_at DESC);
CREATE INDEX idx_ledger_currency    ON ledger_entries(currency, created_at DESC);
```

### Idempotency Keys Table

```sql
CREATE TABLE idempotency_keys (
    idempotency_key     VARCHAR(255) PRIMARY KEY,
    user_id             UUID NOT NULL,
    endpoint            VARCHAR(100) NOT NULL,
    request_hash        CHAR(64) NOT NULL,      -- SHA-256 of request body
    response_status     SMALLINT,
    response_body       JSONB,
    transaction_id      UUID,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at          TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours'
);

CREATE INDEX idx_idem_user ON idempotency_keys(user_id);
```

### Audit Log Table (Immutable Append-Only)

```sql
CREATE TABLE audit_log (
    log_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type     VARCHAR(50) NOT NULL,   -- 'transaction','wallet','ledger_entry','user'
    entity_id       UUID NOT NULL,
    action          VARCHAR(50) NOT NULL,   -- 'created','status_changed','frozen','reversed'
    actor_id        UUID,                   -- user or service that triggered
    actor_type      VARCHAR(20),            -- 'user','service','admin','compliance'
    old_state       JSONB,
    new_state       JSONB,
    ip_address      INET,
    user_agent      TEXT,
    request_id      UUID,
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partition by month for retention management
CREATE INDEX idx_audit_entity    ON audit_log(entity_type, entity_id, occurred_at DESC);
CREATE INDEX idx_audit_actor     ON audit_log(actor_id, occurred_at DESC);
CREATE INDEX idx_audit_occurred  ON audit_log(occurred_at DESC);
```

### Payment Methods Table (Bank Links, Cards)

```sql
CREATE TABLE payment_methods (
    method_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL,
    method_type     VARCHAR(20) NOT NULL,  -- 'bank_account','debit_card','credit_card'
    status          VARCHAR(20) NOT NULL DEFAULT 'pending_verification',
    token           VARCHAR(255) NOT NULL UNIQUE,  -- vault token, never raw PAN
    last_four       CHAR(4),
    bank_name       VARCHAR(100),
    routing_number  VARCHAR(9),            -- encrypted at rest
    is_default      BOOLEAN NOT NULL DEFAULT FALSE,
    verified_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pm_user ON payment_methods(user_id);
```

---

## 4. High-Level Architecture

```
+------------------+     +------------------+     +------------------+
|   Mobile App     |     |   Web Client     |     |  Merchant SDK    |
+--------+---------+     +--------+---------+     +--------+---------+
         |                        |                        |
         +------------------------+------------------------+
                                  |
                          +-------v--------+
                          |  API Gateway   |
                          | (Auth, TLS,    |
                          |  Rate Limit)   |
                          +-------+--------+
                                  |
              +-------------------+-------------------+
              |                   |                   |
    +---------v------+  +---------v------+  +---------v------+
    | Wallet Service |  |Transfer Service|  |  Topup/Withdraw|
    | (balance read, |  |(P2P, payments) |  |    Service     |
    |  KYC checks)   |  |                |  | (ACH, cards)   |
    +--------+-------+  +--------+-------+  +--------+-------+
             |                   |                   |
             +-------------------+-------------------+
                                  |
                     +------------v-----------+
                     |    Ledger Service      |
                     | (double-entry writes,  |
                     |  balance mutations,    |
                     |  idempotency check)    |
                     +------------+-----------+
                                  |
               +------------------+------------------+
               |                  |                  |
     +---------v------+  +--------v-------+  +-------v--------+
     |  Primary DB    |  |   Read Replica |  |  Ledger Archive|
     | (PostgreSQL,   |  | (PostgreSQL    |  |  (Cold store,  |
     |  synchronous   |  |  streaming     |  |  S3/Parquet,   |
     |  replication)  |  |  replica)      |  |  7-year retain)|
     +----------------+  +----------------+  +----------------+
                                  |
               +------------------+------------------+
               |                  |                  |
     +---------v------+  +--------v-------+  +-------v--------+
     |  Redis Cluster |  |  Kafka Cluster |  |  Fraud Engine  |
     | (balance cache,|  | (event stream: |  | (ML scoring,   |
     |  idempotency,  |  |  txn events,   |  |  velocity chk, |
     |  rate limits)  |  |  audit stream) |  |  device fp)    |
     +----------------+  +----------------+  +----------------+
                                  |
               +------------------+------------------+
               |                  |                  |
     +---------v------+  +--------v-------+  +-------v--------+
     | Notification   |  | Reconciliation |  |  Compliance    |
     | Service        |  | Service (daily |  |  Service (KYC, |
     | (push/email/   |  |  batch, bank   |  |  AML, SAR      |
     |  SMS)          |  |  statement)    |  |  reporting)    |
     +----------------+  +----------------+  +----------------+
```

### Transfer Flow Sequence

```
Client              API Gateway         Transfer Svc        Ledger Svc          DB
  |                      |                   |                   |               |
  |-- POST /transfers --> |                   |                   |               |
  |                      |-- auth + rate lim->|                   |               |
  |                      |                   |-- idempotency chk->|               |
  |                      |                   |                   |-- SELECT key ->|
  |                      |                   |                   |<-- not found --|
  |                      |                   |-- fraud score ---> Fraud Engine    |
  |                      |                   |<-- score: 12 --|                   |
  |                      |                   |-- begin txn ------>|               |
  |                      |                   |                   |-- BEGIN ------>|
  |                      |                   |                   |-- lock from_wallet (SELECT FOR UPDATE)
  |                      |                   |                   |-- lock to_wallet (SELECT FOR UPDATE)
  |                      |                   |                   |-- check balance|
  |                      |                   |                   |-- INSERT txn --|
  |                      |                   |                   |-- INSERT 2 ledger entries
  |                      |                   |                   |-- UPDATE from_balance
  |                      |                   |                   |-- UPDATE to_balance
  |                      |                   |                   |-- INSERT idempotency key
  |                      |                   |                   |-- INSERT audit_log
  |                      |                   |                   |-- COMMIT ------>|
  |                      |                   |<-- committed ---- |               |
  |                      |                   |-- publish event -> Kafka           |
  |<-- 201 response ---- |<-- response ------|                   |               |
  |                      |                   |                   Notification Svc|
  |                      |                   |                   (async, push)   |
```

---

## 5. Deep Dive: Double-Entry Bookkeeping

Every financial movement creates exactly two ledger entries: one debit and one credit of equal magnitude. The system is always balanced — the sum of all debits equals the sum of all credits across all accounts.

```
Account Types and Normal Balances:
+------------------+----------------+---------------------------+
| Account Type     | Normal Balance | Example                   |
+------------------+----------------+---------------------------+
| User Wallet      | Credit (asset) | Alice's $1,000 balance    |
| Merchant Wallet  | Credit (asset) | Shop's $5,000 balance     |
| Escrow Account   | Credit (asset) | Marketplace hold $200     |
| Platform Revenue | Credit (liab)  | Platform earnings $50K    |
| Fee Pool         | Credit (liab)  | Collected fees $2K        |
| Suspense         | Credit (liab)  | Unmatched items $0        |
+------------------+----------------+---------------------------+

P2P Transfer: Alice sends $50 to Bob
+-----+------------------+--------+--------+
| Seq | Account          | Debit  | Credit |
+-----+------------------+--------+--------+
|  1  | Alice's Wallet   | $50.00 |        |  <- debit reduces asset
|  2  | Bob's Wallet     |        | $50.00 |  <- credit increases asset
+-----+------------------+--------+--------+
     Sum of Debits = Sum of Credits = $50 (BALANCED)

Transfer with Fee: Alice pays $100 to merchant, $1.50 fee
+-----+-------------------+---------+---------+
| Seq | Account           | Debit   | Credit  |
+-----+-------------------+---------+---------+
|  1  | Alice's Wallet    | $101.50 |         |
|  2  | Merchant Wallet   |         | $100.00 |
|  3  | Fee Pool          |         |   $1.50 |
+-----+-------------------+---------+---------+
     Sum Debits = $101.50  Sum Credits = $101.50 (BALANCED)
```

### Ledger Integrity Invariants

```sql
-- Invariant: every transaction must balance (checked by reconciliation job)
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
-- Expected result: ZERO rows (no imbalanced transactions)
```

---

## 6. Deep Dive: Balance Model — Stored vs. Computed

```
Option A: Stored Balance (Materialized)
+------------------------------------+   +------------------------------------+
|  wallet_balances row               |   | + Fast O(1) balance reads          |
|  wallet_id | currency | available  |   | + Supports high TPS                |
|  wlt_001   | USD      | 1250.00   |   | - Must update atomically with entry |
+------------------------------------+   | - Risk of drift if bug in update   |
                                         | - Requires optimistic locking       |
                                         +------------------------------------+

Option B: Computed Balance (Sum of Ledger)
+------------------------------------+   +------------------------------------+
|  SELECT SUM(credit) - SUM(debit)   |   | + Always authoritative             |
|  FROM ledger_entries               |   | + No drift possible                |
|  WHERE wallet_id = 'wlt_001'       |   | - O(n) scan — too slow at scale    |
+------------------------------------+   | - Cannot shard easily              |
                                         | - Cannot support 5K TPS reads      |
                                         +------------------------------------+

Chosen Approach: Hybrid (Stored + Periodic Verification)
+------------------------------------------------------------------+
| Runtime: Use stored balance for reads and writes                 |
|   - Atomic update: UPDATE wallet_balances ... WHERE version = n  |
|   - If version mismatch -> retry (optimistic lock)               |
|                                                                  |
| Nightly: Reconcile stored balance against ledger sum             |
|   - SELECT wallet_id, SUM() FROM ledger_entries GROUP BY wallet  |
|   - Compare against wallet_balances.available                    |
|   - Alert and auto-correct discrepancies (never silently fix)    |
+------------------------------------------------------------------+
```

---

## 7. Deep Dive: Transaction Lifecycle

```
                         INITIATED
                             |
                      fraud_score < threshold?
                     /                        \
                   YES                         NO
                    |                           |
                PENDING                      FAILED
                    |                       (fraud_reject)
          sufficient balance?
         /                   \
       YES                    NO
        |                      |
   AUTHORIZED               FAILED
        |                  (insufficient_funds)
   payment_method
    confirmed?
   /          \
 YES           NO
  |             |
SETTLED       FAILED
  |          (auth_declined)
  |
all_parties_cleared?
  /         \
YES          NO
 |            |
COMPLETED    PENDING
             (ACH_delay)
              |
         bank_confirms?
        /            \
      YES              NO
       |                |
   COMPLETED          FAILED
                    (bank_reject)

State Machine transitions (valid paths):
initiated   -> pending, authorized, failed
pending     -> authorized, failed
authorized  -> settled, failed
settled     -> completed, reversed
completed   -> reversed (within reversal window)
reversed    -> (terminal)
failed      -> (terminal, retry creates new transaction)
```

---

## 8. Deep Dive: P2P Transfers and Funding Sources

### Instant Balance Transfer (Both Wallets Funded)

```
Alice (funded wallet) ---[$50]--> Bob (wallet)

Steps (single DB transaction, < 100ms):
1. Lock Alice's wallet_balance row (SELECT FOR UPDATE)
2. Lock Bob's wallet_balance row (SELECT FOR UPDATE) [always lock lower wallet_id first to prevent deadlock]
3. Check Alice.available >= 50.00
4. INSERT transaction record (status='authorized')
5. INSERT ledger_entry: Alice DEBIT $50, balance_before/after captured
6. INSERT ledger_entry: Bob CREDIT $50, balance_before/after captured
7. UPDATE Alice.available = available - 50, version++
8. UPDATE Bob.available = available + 50, version++
9. UPDATE transaction status = 'completed'
10. COMMIT

Total time: ~50ms for DB round trips
```

### ACH-Funded Transfer (Bank → Wallet → Recipient)

```
Alice (low balance) + Bank Account ---[$500]--> Bob

Day 0:
  Alice initiates $500 transfer
  System creates ACH pull request for $500 from Alice's bank
  Alice's wallet.pending += $500 (reserved, not available)
  Transfer sits in status='pending'
  Bob sees "pending $500" in his feed

Day 2 (ACH settles):
  Bank confirms $500 cleared
  Alice's wallet.pending -= $500, available += $500 (briefly)
  Atomic transfer: Alice -$500, Bob +$500
  Status = 'completed'

ACH Timeline:
  Standard: 2-3 business days
  Same-day ACH (NACHA): by 5pm ET
  Instant via debit card push (Visa Direct / MC Send): < 30 minutes
```

---

## 9. Deep Dive: Top-up and Withdrawal

### Top-up Flow

```
1. Debit Card Push (Visa Direct / MC Send) — Fastest
   Client selects debit card -> API tokenizes card -> Vault returns token
   Transfer Service -> Card Processor (acquire) -> Issuer authorization
   On success: wallet.available += amount, create ledger entries
   Time to fund: < 30 minutes
   Fee: ~1.5% interchange

2. ACH Bank Transfer (Pull) — Standard
   User links bank (Plaid OAuth or micro-deposits)
   ACH pull initiated via banking rails (FedACH / NACHA)
   Funds held in suspense account until settlement
   Day 0: wallet.pending += amount
   Day 2: ACH settles, move from suspense to wallet.available
   Time: 2-3 business days
   Fee: ~$0.25-1.00 flat

3. Wire Transfer — Large Amounts
   Bank initiates wire to our bank account
   Treasury team matches incoming wire to wallet (reference number)
   Manual or automated matching via reference code
   Time: same day (domestic), 1-2 days (international SWIFT)
   Fee: $15-30 flat

Top-up State Flow:
  CREATED -> PROCESSING -> PENDING -> SETTLED -> COMPLETED
                       \-> FAILED (NSF, declined, bank error)
```

### Withdrawal Flow

```
Withdrawal: Wallet -> Bank (ACH Push)
  User requests withdrawal
  Fraud check: unusual amount, new bank, velocity
  Hold funds: wallet.available -= amount, reserved += amount
  Queue ACH push to user's bank (Originating Depository Financial Institution)
  Status: PENDING -> PROCESSING -> SETTLED -> COMPLETED
  On failure (invalid routing): return funds to available

Same-day vs standard:
  Standard ACH push: T+1 to T+2 business days
  Same-day ACH: submitted before 2:45 PM ET cutoff, credited by 5 PM
  Fee: free to user (cost to platform: ~$0.25)

Bank Account Linking Verification:
  Option A: Micro-deposits (1-3 days)
    Platform sends 2 small deposits ($0.01-$0.99)
    User confirms both amounts
    Bank account status: verified

  Option B: Plaid OAuth instant verification
    User logs into bank via OAuth in-app
    Plaid returns account/routing after consent
    Instant — no micro-deposits
    Fee: ~$0.50-2.00 per link
```

---

## 10. Deep Dive: Idempotency and Exactly-Once Semantics

```
The Problem: Network timeout after DB commit
  Client sends POST /transfers
  Server processes, commits to DB, sends response
  Network drops response before client receives it
  Client retries -> duplicate transfer?

Solution: Idempotency Key

Request Header: Idempotency-Key: idem_550e8400-e29b-41d4-a716-446655440000

Server Algorithm:
+------------------------------------------------------------------------+
| 1. Extract idempotency key from header                                 |
| 2. Compute SHA-256 of request body                                     |
| 3. SELECT * FROM idempotency_keys WHERE key = ?                        |
|    a. NOT FOUND: proceed with processing (INSERT key first, in_flight) |
|    b. FOUND + same body hash + completed: return cached response       |
|    c. FOUND + different body hash: return 422 (conflicting request)    |
|    d. FOUND + in_flight: return 409 (request in progress, retry later) |
| 4. Process transaction                                                  |
| 5. UPDATE idempotency_keys SET response = ?, status = 'completed'     |
|    WHERE key = ?                                                        |
+------------------------------------------------------------------------+

Key properties:
  - Keys are scoped per user (user_id + key = unique pair)
  - Keys expire after 24 hours
  - In-flight protection prevents concurrent duplicate requests
  - Response is cached exactly once per key

Redis-based lock for in-flight protection:
  SET "idem:{key}" "processing" EX 30 NX
  If SET returns nil -> another request is processing this key
  After commit -> update Postgres + release Redis lock
```

---

## 11. Deep Dive: Concurrency Control

### Optimistic Locking for Balance Updates

```sql
-- Read balance with version
SELECT available, version
FROM wallet_balances
WHERE wallet_id = 'wlt_001' AND currency = 'USD';
-- Returns: available=1000.00, version=42

-- Update with version check (optimistic lock)
UPDATE wallet_balances
SET
    available = available - 50.00,
    version   = version + 1,
    updated_at = NOW()
WHERE
    wallet_id = 'wlt_001'
    AND currency = 'USD'
    AND version = 42              -- if version changed, UPDATE affects 0 rows
    AND available >= 50.00;       -- prevent going negative

-- Check rows affected
-- 1 row: success
-- 0 rows: conflict (retry up to 3x with exponential backoff)
```

### Pessimistic Locking (SELECT FOR UPDATE) — Used for P2P

```sql
-- In transfer service, inside serializable transaction:
BEGIN;

-- Lock both wallets in deterministic order (lower UUID first) to prevent deadlock
SELECT available, version
FROM wallet_balances
WHERE wallet_id IN ('wlt_001', 'wlt_002') AND currency = 'USD'
ORDER BY wallet_id
FOR UPDATE;                 -- row-level locks acquired

-- Validate
-- ... checks ...

-- Write both in same transaction
UPDATE wallet_balances SET available = available - 50 WHERE wallet_id = 'wlt_001';
UPDATE wallet_balances SET available = available + 50 WHERE wallet_id = 'wlt_002';

COMMIT;
```

### Deadlock Prevention

```
Rule: Always acquire wallet locks in ascending wallet_id order
  Transfer A: wlt_001 -> wlt_002 acquires lock on wlt_001 first, then wlt_002
  Transfer B: wlt_002 -> wlt_001 acquires lock on wlt_001 first (blocks), then wlt_002
  No circular wait -> no deadlock

Database isolation level: REPEATABLE READ (default for PostgreSQL)
For critical transfers: SERIALIZABLE isolation
  - Detects write-write conflicts that REPEATABLE READ misses
  - Serialization failure -> application retries with new transaction
```

---

## 12. Deep Dive: Distributed Transactions (Cross-Shard)

### The Problem

```
Alice's wallet is on Shard A (partitioned by user_id)
Bob's wallet is on Shard B

A single ACID transaction cannot span two database shards.
Options:
  1. Two-Phase Commit (2PC) — strong consistency, low availability
  2. Saga Pattern — eventual consistency, high availability
  3. Single-shard routing — put both on same shard
```

### Option 1: Two-Phase Commit (2PC)

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

Problems:
  - Coordinator is SPOF (blocking protocol)
  - If coordinator crashes after PREPARE but before COMMIT: shards block indefinitely
  - High latency: 2 network round trips minimum
  - Not supported by most horizontally scalable DBs
```

### Option 2: Saga Pattern (Chosen Approach)

```
Choreography-based Saga for P2P Transfer:

Step 1: Debit Alice (Shard A)
  BEGIN on Shard A
    Lock Alice's balance
    Check sufficient funds
    Debit Alice: available -= 50
    INSERT saga_step: {txn_id, step='debit_sender', status='completed'}
  COMMIT Shard A

  Publish event: "sender_debited" to Kafka

Step 2: Credit Bob (Shard B) — triggered by Kafka consumer
  BEGIN on Shard B
    Credit Bob: available += 50
    INSERT saga_step: {txn_id, step='credit_receiver', status='completed'}
  COMMIT Shard B

  Publish event: "transfer_completed"

Compensation (if Step 2 fails after Step 1):
  Consume "credit_failed" event
  BEGIN on Shard A
    Refund Alice: available += 50
    UPDATE saga_step: step='debit_sender', status='compensated'
  COMMIT Shard A
  Mark transaction FAILED with reason

+-------------------------------------------------------------+
| Saga Steps Table                                            |
| saga_id | txn_id | step             | status | created_at  |
| uuid    | uuid   | 'debit_sender'   | done   | 2024-...    |
| uuid    | uuid   | 'credit_receiver'| done   | 2024-...    |
+-------------------------------------------------------------+
```

### Avoiding Cross-Shard (Platform-Level Wallet)

```
Alternative to saga: route all transfers through platform wallet

Alice (Shard A)  ->  Platform Wallet (Shard P)  ->  Bob (Shard B)

Step 1: BEGIN on Shard A — debit Alice $50, credit Platform $50. COMMIT.
Step 2: BEGIN on Shard B — debit Platform $50, credit Bob $50. COMMIT.

Platform wallet = internal clearing account
  - Each step is single-shard (simple ACID)
  - Platform wallet balance stays near zero (equal debits and credits)
  - Failure of Step 2 leaves Platform wallet with +$50, compensate by refunding Alice
  - Simpler than Saga but introduces platform as intermediary
```

---

## 13. Deep Dive: Reconciliation

```
Reconciliation runs nightly at 02:00 UTC

Internal Ledger Reconciliation:
+------------------------------------------------------------------+
| For each wallet:                                                 |
|   computed_balance = SELECT SUM(credit_amount) - SUM(debit_amt) |
|                      FROM ledger_entries WHERE wallet_id = ?    |
|   stored_balance = SELECT available FROM wallet_balances WHERE  |
|                    wallet_id = ?                                |
|   if abs(computed - stored) > $0.01:                            |
|     INSERT discrepancy_report                                    |
|     alert on-call engineer                                      |
|     DO NOT auto-correct (requires human review)                 |
+------------------------------------------------------------------+

Bank Statement Reconciliation:
+------------------------------------------------------------------+
| Bank sends MT940 / BAI2 statement daily                         |
| Reconciliation service:                                          |
|   1. Parse bank file, extract all credits/debits                |
|   2. Match each bank line to internal ACH record                |
|   3. For matched: mark settlement = confirmed                   |
|   4. For unmatched internal records:                            |
|      -> bank hasn't settled yet (check next day)               |
|      -> after 3 days: flag as EXCEPTION, escalate              |
|   5. For unmatched bank items:                                  |
|      -> unexpected credit: park in suspense account            |
|      -> unexpected debit: possible unauthorized, freeze + alert|
+------------------------------------------------------------------+

Reconciliation Report Schema:
  - run_id, run_date, status
  - total_wallets_checked, discrepancies_found
  - bank_credits_matched, bank_credits_unmatched
  - bank_debits_matched, bank_debits_unmatched
  - exception_list (wallet_id, expected, actual, delta)
```

---

## 14. Deep Dive: Fraud Detection

```
Multi-Layer Fraud Defense:

Layer 1: Rule-Based (Synchronous, < 10ms)
+-------------------------------------------+
| Velocity checks (Redis counters):          |
|   - Transactions in last 1 hour > 10      |
|   - Amount in last 24 hours > $5,000      |
|   - Failed login attempts > 5             |
|   - Unique recipients in last day > 20    |
|                                            |
| Hard Rules (instant reject):               |
|   - Sanctioned country IP                 |
|   - Known fraudulent device fingerprint   |
|   - Transaction to own wallet             |
|   - Duplicate amount + recipient < 10s    |
+-------------------------------------------+

Layer 2: ML Scoring (Synchronous, < 50ms)
+-------------------------------------------+
| Features:                                  |
|   - User behavior graph (graph embedding) |
|   - Transaction amount vs. user history   |
|   - Geo-velocity (NYC to London in 30min?)|
|   - Device trust score                    |
|   - Time-of-day anomaly                   |
|   - Network analysis (fraud ring detect)  |
|                                            |
| Model: Gradient boosting + neural net     |
| Score: 0-100 (100 = highest risk)         |
|   0-30:   AUTO APPROVE                    |
|  30-70:   STEP-UP AUTH (2FA, selfie)      |
|  70-90:   MANUAL REVIEW                   |
|  90-100:  AUTO REJECT                     |
+-------------------------------------------+

Layer 3: Post-Transaction (Async, ongoing)
+-------------------------------------------+
| Stream transaction events to Flink job     |
| Pattern detection:                         |
|   - Structuring (multiple txns just below |
|     $10K threshold -> SAR trigger)        |
|   - Rapid transfer chains (layering)      |
|   - Smurfing (splitting among accounts)   |
| Actions: freeze wallet, escalate to AML   |
+-------------------------------------------+

Device Fingerprinting:
  Browser: canvas fingerprint, font enumeration, WebGL
  Mobile: device ID, hardware attestation (SafetyNet/DeviceCheck)
  Signals: screen resolution, timezone, installed apps (subset)
  Stored: FingerprintJS hash -> device trust score in Redis
```

---

## 15. Deep Dive: KYC/AML Compliance

```
KYC Tiers and Limits:

+--------+------------------------+----------------+-------------------------+
| Tier   | Requirements           | Daily Send     | Annual Volume           |
+--------+------------------------+----------------+-------------------------+
| 0      | Email verified only    | $500           | $3,000                  |
| 1      | Name + DOB + address   | $2,500         | $15,000                 |
| 2      | + Government ID scan   | $10,000        | $50,000                 |
| 3      | + Selfie liveness      | $50,000        | Unlimited               |
| Biz    | + EIN + articles       | $250,000       | Unlimited               |
+--------+------------------------+----------------+-------------------------+

KYC Flow:
  User submits ID (front/back photo) + selfie
  -> OCR extract: name, DOB, ID number, expiry
  -> Liveness check (anti-spoofing, blink/turn detection)
  -> OFAC / Sanctions list check (PEP, SDN)
  -> Identity verification vendor (Jumio, Onfido, Persona)
  -> Risk classification (low/medium/high)
  -> Update kyc_tier in wallet

AML Transaction Monitoring:
  CTR: Currency Transaction Report (>$10,000 cash equivalent)
  SAR: Suspicious Activity Report
    - Structuring patterns
    - Unusual geography
    - High-risk counterparties
    - Rapid fund movement

  SAR filing workflow:
    ML model flags transaction -> compliance queue
    Compliance officer reviews (5-business-day window)
    If confirmed suspicious: file SAR with FinCEN within 30 days
    Tipping off prohibition: cannot tell customer about SAR

Regulatory Holds:
  types: 'suspicious_activity', 'court_order', 'ofac_match', 'chargebacks'
  wallet.status -> 'frozen'
  All outbound transactions rejected
  Inbound transactions accepted but held
  Release: compliance officer action or court order lift
```

---

## 16. Deep Dive: Multi-Currency Support

```
Currency Architecture:

+------------------------------------------------------------------+
|  Wallet can hold multiple currency sub-balances                  |
|  wallet_balances: (wallet_id='wlt_001', currency='USD', ...)    |
|  wallet_balances: (wallet_id='wlt_001', currency='EUR', ...)    |
|  wallet_balances: (wallet_id='wlt_001', currency='GBP', ...)    |
+------------------------------------------------------------------+

Exchange Rate Service:
  - Fetches rates from multiple providers (ECB, Bloomberg, XE)
  - Aggregates and normalizes to USD base
  - Publishes to Redis with TTL = 60 seconds
  - Rates stored in exchange_rates table with timestamp
  - For historical transactions: rate locked at transaction_time

FX Conversion at Transaction Time:
  User sends 50 EUR to user who holds USD

  1. Fetch EUR/USD rate: 1.08 (spread included: 1.08 * 0.995 = 1.074)
  2. Convert: 50 EUR * 1.074 = $53.70 USD
  3. Ledger entry:
     Debit  Alice EUR wallet:  50.00 EUR
     Credit Bob   USD wallet: $53.70 USD
     Credit Platform FX margin: $0.27 (the 0.5% spread)
  4. Store exchange_rate, base_currency, base_amount in transaction

FX Margin as Revenue:
  Platform applies 0.5-2.5% spread on top of mid-market rate
  This appears as credit to fee_pool account in ledger
  Fully transparent in user receipt (optional disclosure)

Currency-specific precision:
  USD: 2 decimal places (cents)
  JPY: 0 decimal places (no subunit)
  BTC: 8 decimal places (satoshis)
  Store all amounts as NUMERIC(20,8) to handle crypto
```

---

## 17. Deep Dive: Encryption and Tokenization

```
Data Security Layers:

1. PAN Tokenization (Card Numbers)
   Raw PAN (4111 1111 1111 1111) is NEVER stored in our DB
   On capture:
     Raw PAN -> PCI Vault (external: Stripe, Braintree, or in-house HSM)
     Vault returns: Token (pm_abc123xyz)
     We store token; vault handles PAN

   Benefits:
     - DB breach doesn't expose card numbers
     - Token is useless outside vault context
     - Reduces PCI-DSS scope

2. Database Encryption (At Rest)
   AES-256 for sensitive columns (SSN, bank account number, DOB)
   Column-level encryption with separate key per tenant
   Keys stored in HSM (Hardware Security Module)
   Key rotation: annually, without re-encryption (envelope encryption)

   Envelope encryption:
     Data Encryption Key (DEK) encrypts the data
     Key Encryption Key (KEK) in HSM encrypts the DEK
     Rotate KEK without changing DEK: just re-encrypt DEK with new KEK

3. Transport Security (In Transit)
   TLS 1.3 everywhere (client->API, service->service, service->DB)
   Certificate pinning in mobile apps
   mTLS between internal services

4. HSM Key Management
   +------------------------------------------+
   | HSM (FIPS 140-2 Level 3 certified)       |
   |   - Root CA keys                          |
   |   - KEK keys (never leave HSM)            |
   |   - Signing keys (audit log integrity)    |
   +------------------------------------------+

   HSM cluster: active-active with hardware failover
   Audit log of all key operations

5. Audit Log Integrity
   Each audit entry includes HMAC-SHA256
   Key: per-day HMAC key derived from root key in HSM
   Verification: nightly job checks all entries of previous day
   Tamper evidence: any modification invalidates HMAC chain
```

---

## 18. Deep Dive: Audit Trail

```
Immutable Audit Requirements:
  Who: actor_id, actor_type (user/service/admin)
  What: action, entity_type, entity_id, old_state, new_state
  When: occurred_at (microsecond precision)
  Where: ip_address, user_agent, request_id
  Why: linked to compliance event or user action

Implementation:
  1. Application writes to audit_log table (append-only)
  2. DB trigger prevents UPDATE/DELETE on audit_log:

     CREATE OR REPLACE FUNCTION prevent_audit_modification()
     RETURNS TRIGGER AS $$
     BEGIN
       RAISE EXCEPTION 'audit_log is immutable';
     END;
     $$ LANGUAGE plpgsql;

     CREATE TRIGGER immutable_audit
     BEFORE UPDATE OR DELETE ON audit_log
     FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

  3. Kafka stream: audit events also published to "audit" topic
  4. S3 archive: Kafka consumer writes to S3 (Parquet) every hour
  5. WORM storage: S3 Object Lock (compliance mode, 7-year retention)
  6. HMAC chain: each S3 file's hash included in next file header

Audit for Every Transaction State Change:
  initiated   -> audit: {action:'txn_created', new_state:{status:'initiated', amount:50}}
  authorized  -> audit: {action:'txn_authorized', old:{status:'initiated'}, new:{status:'authorized'}}
  completed   -> audit: {action:'txn_completed', old:{status:'authorized'}, new:{status:'completed'}}
  reversed    -> audit: {action:'txn_reversed', old:{status:'completed'}, new:{status:'reversed'}, actor_type:'user'}

Regulatory Reporting (SAR/CTR):
  FinCEN BSA E-Filing: automated XML generation from audit events
  Retention: 5 years minimum (FINCEN), 7 years (IRS)
  eDiscovery: audit log queryable by entity_id, actor_id, date range
```

---

## 19. Scaling Strategy

### Database Sharding

```
Sharding by wallet_id (consistent hashing):
  32 logical shards -> 4 physical shard groups (8 logical each)
  Each shard group: 1 primary + 2 synchronous replicas

  Shard selection: shard_id = consistent_hash(wallet_id) % 32

  Challenge: P2P transfer touches 2 shards
  Solution: Saga pattern (see Section 12)

  Cross-shard queries (balance reporting, reconciliation):
  - Scatter-gather: query all shards in parallel, aggregate
  - Or: dedicated OLAP replica (real-time CDC to columnar store)

Shard Map:
  +----------+-------------+-------------+
  | Shard    | Range       | DB Cluster  |
  +----------+-------------+-------------+
  | 0-7      | 0x00-0x1F   | Cluster A   |
  | 8-15     | 0x20-0x3F   | Cluster B   |
  | 16-23    | 0x40-0x5F   | Cluster C   |
  | 24-31    | 0x60-0x7F   | Cluster D   |
  +----------+-------------+-------------+
```

### Caching Strategy

```
Redis Cluster (3 masters, 3 replicas):

  Balance Cache:
    Key:   balance:{wallet_id}:{currency}
    Value: {available, pending, reserved, version}
    TTL:   1 second (aggressive invalidation)
    Write-through: update cache + DB in same request
    On cache miss: read DB, populate cache

  Idempotency Cache:
    Key:   idem:{idempotency_key}
    Value: response body (gzip compressed)
    TTL:   24 hours (matches DB expiry)

  Fraud/Rate Limit Counters:
    Key:   velocity:{user_id}:{window}
    Type:  Redis sorted set (sliding window)
    TTL:   1 hour for per-hour counters

  Exchange Rates:
    Key:   rate:{from}:{to}
    Value: rate, spread, timestamp
    TTL:   60 seconds
```

### Message Queue (Kafka)

```
Topics:
  wallet.transactions      (partitioned by from_wallet_id, 64 partitions)
  wallet.ledger-entries    (partitioned by wallet_id, 64 partitions)
  wallet.audit-events      (partitioned by entity_id, 32 partitions)
  wallet.notifications     (partitioned by user_id, 32 partitions)
  wallet.reconciliation    (single partition, ordered)
  wallet.fraud-signals     (partitioned by user_id)

Consumer Groups:
  notification-service     -> wallet.transactions (send push/email)
  fraud-engine             -> wallet.transactions (real-time scoring)
  audit-archiver           -> wallet.audit-events (write to S3)
  reconciliation-svc       -> wallet.ledger-entries (daily reconcile)
  analytics-pipeline       -> all topics -> Flink -> OLAP
```

### Read Scaling

```
Read Replicas:
  - 2 synchronous replicas per shard (RPO = 0)
  - Balance reads: prefer primary (strong consistency) or
    cached value (< 1 second stale acceptable for display)
  - Transaction history reads: replicas OK (eventual consistency)
  - Compliance reads: always primary (no stale data allowed)

CQRS Pattern:
  Commands (writes): routed to primary DB
  Queries (reads): routed to read replica or cache

  Read model: denormalized view for transaction history
    - Maintained by Kafka consumer
    - Stored in read-optimized store (Elasticsearch for search,
      PostgreSQL replica for structured queries)
```

---

## 20. Trade-offs

| Decision | Chosen Approach | Alternative | Reason |
|----------|-----------------|-------------|--------|
| Balance model | Stored + nightly verification | Computed from ledger | O(1) reads at 5K TPS; drift caught by reconciliation |
| Cross-shard transfers | Saga pattern | 2PC | Saga: higher availability, tolerate coordinator failure; 2PC blocks on failure |
| Concurrency control | Optimistic locking (OCC) + SELECT FOR UPDATE for P2P | Pure OCC | P2P must be atomic across two rows; OCC for single-row updates (top-up) |
| Idempotency store | Postgres table + Redis in-flight | Redis only | Postgres survives Redis restart; Redis prevents in-flight duplicates |
| Ledger storage | Relational (PostgreSQL) | Event store (EventStoreDB) | SQL native for double-entry constraint checking; event sourcing adds complexity |
| Fraud scoring | Synchronous ML (< 50ms) | Async post-transaction | Reject fraud before funds move; async scoring misses real-time window |
| Exchange rates | Cached in Redis (60s TTL) | Real-time per-call | 60s stale acceptable; per-call adds latency and cost at 5K TPS |
| Bank linking | Plaid OAuth + micro-deposits fallback | Direct routing number entry | Plaid instant and secure; micro-deposits = fallback for Plaid unsupported banks |
| Audit storage | Postgres table + S3 WORM | Immutable ledger DB (Immudb) | Postgres familiar, triggers enforce immutability; S3 WORM satisfies regulatory retention |
| Shard key | wallet_id | user_id | Same thing in this model; wallet_id groups all a user's currency balances together |

---

## 21. Common Interview Follow-ups

**Q: How do you ensure the ledger always balances?**

A: Double-entry bookkeeping enforces that every transaction creates equal debits and credits atomically in one DB transaction. A nightly reconciliation job independently sums all debit and credit entries per transaction and alerts on any imbalance. The DB-level `balance_after_check` constraint on `ledger_entries` also catches arithmetic errors at write time. The ledger is append-only (enforced by DB trigger), so entries cannot be silently modified.

**Q: What happens if the system crashes mid-transfer?**

A: The transfer is executed inside a single DB transaction. If the process crashes before `COMMIT`, the transaction is automatically rolled back — no partial state. If it crashes after `COMMIT` but before responding to the client, the client retries with the same idempotency key, finds the completed transaction in the `idempotency_keys` table, and receives the cached response. No duplicate transfer occurs.

**Q: How do you handle the case where Alice's bank ACH fails after her wallet was debited?**

A: The wallet debit and ACH initiation are decoupled. Alice's wallet.pending increases when the ACH is initiated (funds not available to spend). Only after ACH confirms settlement does pending convert to available. If ACH fails (NSF, account closed), the pending amount is released back and the top-up is marked failed. Alice is notified. If funds were already spent (funded via provisional credit — a risk decision by the platform), the platform eats the loss and may freeze Alice's account pending recovery.

**Q: How do you scale to 20,000 TPS during peak events?**

A: Several mechanisms in combination: (1) Redis balance cache reduces DB reads — most balance checks hit cache, not DB. (2) Database connection pooling via PgBouncer limits connection overhead. (3) Horizontal shard scaling — add shard groups to distribute write load. (4) CQRS: write to primary, read from replicas or cache. (5) Queue-based smoothing: ingest at 20K TPS into Kafka, process at 5K TPS from queue — user sees transaction "pending" during processing spike. (6) Pre-warming: for known events (PayDay), scale out DB connections and Redis replicas proactively.

**Q: How do you prevent a user from spending money they don't have in a race condition?**

A: The `UPDATE wallet_balances SET available = available - 50 WHERE available >= 50` constraint runs atomically in the DB. If two concurrent requests both read balance=100 and both try to debit 75, only one will succeed — the other will see 0 rows updated (100-75=25, second: 25-75=-50 which violates the CHECK constraint or fails the WHERE clause). The application retries and returns an insufficient funds error.

**Q: How does multi-currency work when the sender and receiver hold different currencies?**

A: At transaction time, we fetch the current exchange rate from Redis (sourced from rate providers, refreshed every 60 seconds). We debit the sender in their currency, apply the FX rate (including our spread margin), and credit the receiver in their currency. Both amounts, the exchange rate used, and the margin are permanently recorded in the transaction. The margin is credited to the platform fee_pool in the ledger as a separate entry, maintaining double-entry balance.

**Q: How do you handle regulatory compliance across different countries?**

A: Each wallet is tagged with its jurisdiction. Limits, KYC tier requirements, and transaction monitoring rules are loaded from a jurisdiction-specific rule engine. OFAC sanctions screening runs synchronously on every transaction (< 5ms via preloaded in-memory list). Country-specific reports (SAR for FinCEN in US, STR for FCA in UK) are generated by the compliance service from the audit stream. For GDPR, PII is stored separately from transaction data with its own deletion schedule — transaction records reference user_id (pseudonymized) and PII is stored in the identity service.

**Q: How do you implement escrow for a marketplace?**

A: Marketplace escrow uses a dedicated escrow wallet (account type = 'escrow'). When a buyer purchases from a seller, the buyer's wallet is debited and the escrow wallet is credited (funds held). The ledger entry references both the buyer transaction and the seller transaction. On delivery confirmation (by buyer or timeout), the escrow wallet is debited and the seller's wallet is credited (minus the platform fee). On dispute or refund, escrow is debited and buyer is refunded. Escrow release is idempotent and audited.

**Q: What's your disaster recovery strategy?**

A: RTO < 5 minutes, RPO = 0 seconds (zero data loss). Architecture: synchronous replication to two replicas in the same region (any commit requires acknowledgment from one replica before returning to application). Cross-region async replication to DR region (< 1 second lag). Kafka topics replicated across regions. Failover: promote replica in same region (seconds), or failover to DR region (minutes). Ledger entries also archived to S3 (Parquet) every hour — worst case, restore from S3 snapshot plus Kafka replay. Balance is recomputed from ledger if stored balance is suspect.

---

*Covers: double-entry bookkeeping, saga pattern, idempotency, optimistic locking, AML/KYC, fraud detection, multi-currency, reconciliation, HSM encryption, audit trail, horizontal sharding.*
