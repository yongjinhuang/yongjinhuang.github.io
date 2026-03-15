# Data Model: Digital Wallet & Ledger (PayPal/Venmo)

A digital wallet system must guarantee that money never appears or disappears -- every debit has a matching credit. The data model is built around double-entry bookkeeping with an append-only ledger, idempotency for safe retries, and optimistic locking to prevent race conditions on balance updates. This is the backbone of any fintech product handling real money.

---

## Table Responsibilities

| Table | Purpose | Why It Exists |
|-------|---------|---------------|
| **wallets** | Represents a money container for a user or system entity | Separates the concept of "who holds money" from the user account; supports multiple wallet types (personal, business, escrow) |
| **wallet_balances** | Current balance per wallet per currency | Separates balance tracking from wallet metadata; composite PK enables multi-currency support |
| **transactions** | Records each money movement as a business event | The user-facing record of what happened; links sender and receiver wallets |
| **ledger_entries** | Append-only double-entry bookkeeping records | The source of truth for all money movement; immutable for audit compliance; every transaction produces balanced debit/credit pairs |
| **payment_methods** | External funding sources (bank accounts, cards) | Links wallets to the outside financial system for top-ups and withdrawals |
| **idempotency_keys** | Prevents duplicate transaction processing | Critical for distributed systems where retries are inevitable; guarantees exactly-once semantics |
| **audit_log** | Append-only record of all state changes | Regulatory requirement for financial systems; enables forensic investigation |

---

## Detailed Field Descriptions

### wallets

| Field | Type | Description |
|-------|------|-------------|
| wallet_id | PK, UUID | Unique wallet identifier |
| user_id | FK → users | The owner of this wallet |
| wallet_type | ENUM | personal, business, escrow, fee_pool; escrow holds funds during disputes, fee_pool collects platform fees |
| status | ENUM | active, frozen, closed; frozen wallets block all transactions (fraud response) |
| kyc_tier | INT | 0=unverified, 1=email, 2=ID verified, 3=enhanced due diligence; higher tiers unlock higher transaction limits |
| currency | VARCHAR(3) | Primary currency (ISO 4217); determines default display currency |
| created_at | TIMESTAMP | Wallet creation time |

### wallet_balances

| Field | Type | Description |
|-------|------|-------------|
| wallet_id | FK, composite PK | Which wallet this balance belongs to |
| currency | VARCHAR(3), composite PK | ISO 4217 currency code; composite PK with wallet_id enables multi-currency |
| available_amount | DECIMAL(19,4) | Funds available for immediate use; this is what the user sees |
| pending_amount | DECIMAL(19,4) | Funds in transit (e.g., incoming bank transfer not yet cleared) |
| reserved_amount | DECIMAL(19,4) | Funds held for pending transactions (e.g., authorized but not captured payments) |
| version | INT | Optimistic locking version; UPDATE fails if version changed since read, preventing race conditions |

### transactions

| Field | Type | Description |
|-------|------|-------------|
| transaction_id | PK, UUID | Unique transaction identifier |
| type | ENUM | p2p_transfer, topup, withdrawal, payment, refund, reversal; categorizes the business intent |
| sender_wallet_id | FK → wallets | Source of funds; null for top-ups from external sources |
| receiver_wallet_id | FK → wallets | Destination of funds; null for withdrawals to external accounts |
| amount | DECIMAL(19,4) | Transaction amount in source currency |
| currency | VARCHAR(3) | Transaction currency |
| fx_rate | DECIMAL(12,8) | Foreign exchange rate if cross-currency; null for same-currency transactions |
| status | ENUM | pending, completed, failed, reversed; reversed links to a new reversal transaction |
| idempotency_key | VARCHAR, UNIQUE | Client-provided key ensuring the same request is not processed twice |
| metadata_json | JSONB | Flexible field for notes, merchant info, or integration-specific data |
| created_at | TIMESTAMP | When the transaction was initiated |

### ledger_entries

| Field | Type | Description |
|-------|------|-------------|
| entry_id | PK, UUID | Unique ledger entry identifier |
| transaction_id | FK → transactions | Links this entry to its parent transaction; every transaction has exactly 2+ entries |
| wallet_id | FK → wallets | Which wallet this entry affects |
| entry_type | ENUM | debit or credit; debits decrease balance, credits increase balance |
| amount | DECIMAL(19,4) | Always positive; the direction is determined by entry_type |
| running_balance | DECIMAL(19,4) | Balance after this entry; enables point-in-time balance queries without scanning |
| created_at | TIMESTAMP | Immutable timestamp; append-only table means no updates or deletes ever |

### payment_methods

| Field | Type | Description |
|-------|------|-------------|
| id | PK, UUID | Unique payment method identifier |
| wallet_id | FK → wallets | Which wallet this payment method is attached to |
| type | ENUM | bank_account, card; determines the processing flow for top-ups and withdrawals |
| token | VARCHAR | Tokenized reference from payment processor; raw PAN/account numbers are never stored (PCI compliance) |
| is_default | BOOLEAN | Whether this is the default funding source for the wallet |
| last_four | VARCHAR(4) | Last four digits of card/account for display purposes only |
| brand | VARCHAR | Card brand (visa, mastercard) or bank name for display |

### idempotency_keys

| Field | Type | Description |
|-------|------|-------------|
| key | PK, VARCHAR | Client-provided idempotency key; primary key for fast lookup |
| transaction_id | FK → transactions | The transaction that was created for this key |
| response_json | JSONB | Cached response body; returned on duplicate requests without re-processing |
| created_at | TIMESTAMP | When the key was first seen |
| expires_at | TIMESTAMP | 24-hour TTL; keys are cleaned up after expiration to prevent unbounded table growth |

### audit_log

| Field | Type | Description |
|-------|------|-------------|
| id | PK, UUID | Unique audit entry identifier |
| entity_type | VARCHAR | What type of entity changed (wallet, transaction, payment_method) |
| entity_id | UUID | The ID of the changed entity |
| action | VARCHAR | What happened (create, update, freeze, close) |
| actor_id | UUID | Who performed the action (user, system, admin) |
| old_state_json | JSONB | Entity state before the change; null for creates |
| new_state_json | JSONB | Entity state after the change; null for deletes |
| ip_address | INET | IP address of the actor; used for fraud investigation |
| created_at | TIMESTAMP | Immutable; append-only table |

---

## ER Diagram

```
+------------------+        +-------------------+        +------------------+
|     wallets      |        |   transactions    |        | payment_methods  |
|------------------|        |-------------------|        |------------------|
| wallet_id (PK)   |<──┐    | transaction_id(PK)|        | id (PK)          |
| user_id (FK)     |   |    | type              |        | wallet_id (FK)───|──┐
| wallet_type      |   |    | sender_wallet_id  |───┐    | type             |  |
| status           |   |    |  (FK)             |   |    | token            |  |
| kyc_tier         |   |    | receiver_wallet_id|───┤    | is_default       |  |
| currency         |   |    |  (FK)             |   |    | last_four        |  |
| created_at       |   |    | amount            |   |    | brand            |  |
+------------------+   |    | currency          |   |    +------------------+  |
        |              |    | fx_rate           |   |                          |
        | 1            |    | status            |   |                          |
        |              |    | idempotency_key   |   |                          |
        |──* wallet_   |    | metadata_json     |   |                          |
        |   balances   |    | created_at        |   |                          |
        |              |    +-------------------+   |                          |
        |              |            |               |                          |
+-------+----------+  |            | 1              |                          |
| wallet_balances  |  |            |                |                          |
|------------------|  |            |──* ledger_     |                          |
| wallet_id (FK,PK)|──┘            |   entries      |                          |
| currency (PK)    |               |                |                          |
| available_amount |    +----------+--------+       |                          |
| pending_amount   |    |  ledger_entries   |       |                          |
| reserved_amount  |    |   (append-only)   |       |                          |
| version          |    |-------------------|       |                          |
+------------------+    | entry_id (PK)     |       |                          |
                        | transaction_id(FK)|       |                          |
                        | wallet_id (FK)────|───────┘                          |
                        | entry_type        |                                  |
                        | amount            |    +-------------------+         |
                        | running_balance   |    | idempotency_keys  |         |
                        | created_at        |    |-------------------|         |
                        +-------------------+    | key (PK)          |         |
                                                 | transaction_id(FK)|         |
                        +-------------------+    | response_json     |         |
                        |    audit_log      |    | created_at        |         |
                        |   (append-only)   |    | expires_at        |         |
                        |-------------------|    +-------------------+         |
                        | id (PK)           |                                  |
                        | entity_type       |    wallets 1───* payment_methods─┘
                        | entity_id         |
                        | action            |
                        | actor_id          |
                        | old_state_json    |
                        | new_state_json    |
                        | ip_address        |
                        | created_at        |
                        +-------------------+

Relationships:
  wallets 1───* wallet_balances    (one wallet, multiple currencies)
  wallets 1───* transactions       (as sender or receiver)
  wallets 1───* ledger_entries     (all entries affecting this wallet)
  wallets 1───* payment_methods    (multiple funding sources)
  transactions 1───* ledger_entries (each transaction has 2+ entries)
  transactions 1───1 idempotency_keys (one key per transaction)
  audit_log: standalone            (references entities by type+id, not FK)
```

---

## Data Flow

1. **Initiate Transfer**: User requests a P2P transfer. The client includes an `idempotency_key` with the request.

2. **Idempotency Check**: The system checks `idempotency_keys` for the provided key. If found, the cached `response_json` is returned immediately without processing. This prevents double-charges from network retries.

3. **Fraud Scoring**: The transaction details are evaluated against fraud rules (velocity checks, amount thresholds, device fingerprint). If flagged, the transaction is blocked before any money moves.

4. **Create Transaction**: A `transactions` row is created with status = `pending`. The `idempotency_keys` row is created atomically in the same database transaction.

5. **Double-Entry Ledger**: Two `ledger_entries` are created atomically: a **debit** on the sender's wallet and a **credit** on the receiver's wallet. The amounts are always equal. The `running_balance` on each entry is calculated from the previous entry's running_balance.

6. **Update Balances**: `wallet_balances.available_amount` is decremented for the sender and incremented for the receiver. The `version` column is used for optimistic locking -- if another transaction modified the balance concurrently, the UPDATE fails (version mismatch) and the operation retries.

7. **Complete Transaction**: The `transactions.status` is updated to `completed`. All of steps 5-7 happen within a single database transaction to maintain consistency.

8. **Event Publishing**: A Kafka event is published for downstream consumers (notifications, analytics, tax reporting). The event is published after the DB transaction commits to avoid notifying about uncommitted changes.

9. **Notifications**: Notification service consumes the event and sends push/email to both sender and receiver.

10. **Daily Reconciliation**: A batch job verifies that the sum of all `ledger_entries` across all wallets equals zero (total debits = total credits). Any discrepancy triggers an alert for immediate investigation.

---

## Key Design Decisions for Interviews

- **Why double-entry bookkeeping (ledger_entries)?** Single-entry systems (just updating balances) make it impossible to trace where money went when something goes wrong. Double-entry ensures every debit has a matching credit, and the system can be fully reconstructed from the ledger alone.

- **Why is ledger_entries append-only?** Financial records must be immutable for regulatory compliance. If a mistake is made, a new correcting entry is created (reversal), never an update. This also enables simple point-in-time balance queries using running_balance.

- **Why optimistic locking on wallet_balances?** Pessimistic locks (SELECT FOR UPDATE) create contention hotspots on popular wallets. Optimistic locking with a version column allows concurrent reads and only fails on write conflicts, which are retried. This scales much better for high-volume wallets.

- **Why separate available/pending/reserved amounts?** A single balance field would be ambiguous. Available is what can be spent now. Pending is incoming money not yet confirmed. Reserved is committed to in-flight transactions. The invariant is: actual_balance = available + pending + reserved.

- **Why idempotency_keys as a separate table?** Idempotency is not optional in financial systems -- network failures, timeouts, and retries are guaranteed to happen. A dedicated table with TTL keeps the main transaction table clean while guaranteeing exactly-once processing.

- **Why DECIMAL(19,4) for amounts?** Floating-point arithmetic causes rounding errors that are unacceptable in finance. DECIMAL provides exact precision. 19 digits handle amounts up to quadrillions; 4 decimal places handle sub-cent calculations for FX and fee splitting.

- **Why escrow and fee_pool wallet types?** Platform fees and disputed funds need to be held somewhere accountable. Dedicated system wallets make the money flow visible in the ledger rather than hidden in application logic.
