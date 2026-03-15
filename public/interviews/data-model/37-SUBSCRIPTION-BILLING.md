# Data Model: Subscription & Billing (Stripe Billing)

A subscription billing system must handle recurring charges, usage-based metering, prorations when plans change mid-cycle, and dunning (retry logic for failed payments). The data model separates the catalog (plans and prices) from the subscription lifecycle (subscriptions, invoices, payments) to support flexible pricing models while keeping billing logic deterministic and auditable.

---

## Table Responsibilities

| Table | Purpose | Why It Exists |
|-------|---------|---------------|
| **plans** | Product catalog entries | Represents what the customer is buying; separated from pricing to support multiple price points per plan |
| **plan_prices** | Pricing configurations per plan | Decouples price from plan so one plan can have monthly/annual pricing, different currencies, and different pricing models |
| **price_tiers** | Graduated/volume pricing tiers | Enables per-unit pricing that changes at volume breakpoints (e.g., first 100 API calls at $0.01, next 1000 at $0.005) |
| **subscriptions** | Active customer subscriptions | Tracks the lifecycle of a customer's relationship with a plan, including trials, pausing, and cancellation |
| **invoices** | Billing documents for each period | The financial record of what is owed; supports partial payments, credits, and tax calculations |
| **invoice_line_items** | Individual charges on an invoice | Breaks down the invoice into components (base subscription, metered usage, prorations, discounts, tax) for transparency |
| **payments** | Payment attempts against invoices | Tracks each attempt to collect payment, enabling retry logic with exponential backoff |
| **usage_events** | Raw metered usage data points | Captures granular usage events that are aggregated at billing time into invoice line items |

---

## Detailed Field Descriptions

### plans

| Field | Type | Description |
|-------|------|-------------|
| plan_id | PK, UUID | Unique plan identifier |
| name | VARCHAR | Display name (e.g., "Starter", "Professional", "Enterprise") |
| description | TEXT | Plan description shown to customers |
| is_active | BOOLEAN | Whether new subscriptions can select this plan; inactive plans still serve existing subscribers |

### plan_prices

| Field | Type | Description |
|-------|------|-------------|
| price_id | PK, UUID | Unique price identifier; this is what the subscription actually references |
| plan_id | FK → plans | Which plan this price belongs to |
| billing_interval | ENUM | month or year; determines the billing cycle length |
| pricing_model | ENUM | flat (fixed price), per_seat (quantity-based), metered (usage-based), tiered (graduated pricing) |
| unit_amount_cents | INT | Price per unit in the smallest currency unit (cents); for flat pricing, this is the total |
| currency | VARCHAR(3) | ISO 4217 currency code |
| meter_name | VARCHAR | For metered pricing, identifies which usage_events meter to aggregate; null for non-metered |

### price_tiers

| Field | Type | Description |
|-------|------|-------------|
| price_id | FK, composite PK | Which price these tiers belong to |
| tier_start | INT, composite PK | Start of this tier's range (inclusive) |
| tier_end | INT | End of this tier's range (inclusive); null for the final "unlimited" tier |
| unit_amount | INT | Per-unit price in this tier (cents) |
| flat_amount | INT | Fixed fee added when this tier is reached; enables "platform fee + per-unit" pricing |

### subscriptions

| Field | Type | Description |
|-------|------|-------------|
| subscription_id | PK, UUID | Unique subscription identifier |
| customer_id | FK → customers | Who is subscribed |
| plan_id | FK → plans | Which plan they chose |
| price_id | FK → plan_prices | Which specific price configuration applies |
| status | ENUM | trialing, active, past_due, paused, canceled; drives billing behavior |
| quantity | INT | Number of seats/units for per_seat pricing; defaults to 1 for flat pricing |
| trial_end | TIMESTAMP | When the trial period ends; null if no trial |
| current_period_start | TIMESTAMP | Start of the current billing period |
| current_period_end | TIMESTAMP | End of the current billing period; this is when the next invoice is generated |
| billing_anchor_day | INT | Day of month for billing (1-28); ensures consistent billing dates across months |
| coupon_id | FK → coupons | Applied discount; null if none |
| cancel_at_period_end | BOOLEAN | If true, subscription will cancel when current_period_end is reached rather than renewing |

### invoices

| Field | Type | Description |
|-------|------|-------------|
| invoice_id | PK, UUID | Unique invoice identifier |
| subscription_id | FK → subscriptions | Which subscription this invoice is for |
| customer_id | FK → customers | Bill-to customer (denormalized for query convenience) |
| status | ENUM | draft (being built), open (finalized, awaiting payment), paid, void (canceled), uncollectible (gave up) |
| subtotal | INT | Sum of line items before discount and tax (cents) |
| discount | INT | Discount amount from coupon (cents) |
| tax | INT | Calculated tax amount (cents) |
| total | INT | subtotal - discount + tax (cents) |
| amount_due | INT | total minus any credits applied (cents); this is what the payment must cover |
| amount_paid | INT | Amount actually collected (cents); may differ from amount_due for partial payments |
| due_date | TIMESTAMP | Payment deadline; overdue invoices trigger dunning |
| paid_at | TIMESTAMP | When payment succeeded; null until paid |

### invoice_line_items

| Field | Type | Description |
|-------|------|-------------|
| line_id | PK, UUID | Unique line item identifier |
| invoice_id | FK → invoices | Which invoice this line belongs to |
| type | ENUM | subscription (base charge), metered (usage charge), proration (mid-cycle change adjustment), discount, tax |
| description | TEXT | Human-readable description (e.g., "Professional plan - March 2026") |
| quantity | INT | Number of units (seats, API calls, etc.) |
| unit_amount | INT | Price per unit (cents) |
| amount | INT | Total for this line item: quantity * unit_amount (cents) |

### payments

| Field | Type | Description |
|-------|------|-------------|
| payment_id | PK, UUID | Unique payment identifier |
| invoice_id | FK → invoices | Which invoice this payment is for |
| amount | INT | Amount charged (cents) |
| status | ENUM | pending, succeeded, failed; drives retry logic |
| payment_method_id | FK → payment_methods | Which card/bank account was charged |
| idempotency_key | VARCHAR, UNIQUE | Prevents double-charging on retries |
| attempt_number | INT | Which attempt this is (1, 2, 3...); used for exponential backoff calculation |
| next_retry_at | TIMESTAMP | When to retry if this attempt failed; null on success |

### usage_events

| Field | Type | Description |
|-------|------|-------------|
| event_id | PK, UUID | Unique event identifier |
| subscription_id | FK → subscriptions | Which subscription generated this usage |
| meter_name | VARCHAR | What was metered (e.g., api_calls, storage_gb, emails_sent); matches plan_prices.meter_name |
| quantity | INT | How many units were consumed in this event |
| timestamp | TIMESTAMP | When the usage occurred; used for period-based aggregation |
| idempotency_key | VARCHAR, UNIQUE | Prevents double-counting usage from retried API calls |

---

## ER Diagram

```
+----------------+       +------------------+       +----------------+
|     plans      |       |   plan_prices    |       |  price_tiers   |
|----------------|       |------------------|       |----------------|
| plan_id (PK)   |<──┐   | price_id (PK)    |<──┐   | price_id (FK,  |
| name           |   |   | plan_id (FK)─────|───┘   |   PK)          |
| description    |   |   | billing_interval |   ┌───| tier_start(PK) |
| is_active      |   |   | pricing_model    |   |   | tier_end       |
+----------------+   |   | unit_amount_cents|   |   | unit_amount    |
                     |   | currency         |   |   | flat_amount    |
                     |   | meter_name       |   |   +----------------+
                     |   +------------------+   |
                     |          |               |
                     |          | 1             |
                     |          |               |
                     |   +------+-----------+   |
                     |   |  subscriptions   |   |
                     |   |------------------|   |
                     └───| plan_id (FK)     |   |
                         | price_id (FK)────|───┘
                         | subscription_id  |
                         |  (PK)            |
                         | customer_id (FK) |
                         | status           |
                         | quantity          |
                         | trial_end        |
                         | current_period_  |
                         |  start/end       |
                         | billing_anchor_  |
                         |  day             |
                         | coupon_id        |
                         | cancel_at_       |
                         |  period_end      |
                         +------------------+
                           |             |
                           | 1           | 1
                           |             |
                  +--------+------+   +--+---------------+
                  |   invoices    |   |  usage_events    |
                  |---------------|   |------------------|
                  | invoice_id(PK)|   | event_id (PK)    |
                  | subscription_ |   | subscription_    |
                  |  id (FK)      |   |  id (FK)         |
                  | customer_id   |   | meter_name       |
                  | status        |   | quantity          |
                  | subtotal      |   | timestamp         |
                  | discount      |   | idempotency_key   |
                  | tax           |   +------------------+
                  | total         |
                  | amount_due    |
                  | amount_paid   |
                  | due_date      |
                  | paid_at       |
                  +---------------+
                    |           |
                    | 1         | 1
                    |           |
          +---------+----+  +--+--------------+
          | invoice_     |  |   payments      |
          | line_items   |  |-----------------|
          |--------------|  | payment_id (PK) |
          | line_id (PK) |  | invoice_id (FK) |
          | invoice_id   |  | amount          |
          |  (FK)        |  | status          |
          | type         |  | payment_method_ |
          | description  |  |  id             |
          | quantity     |  | idempotency_key |
          | unit_amount  |  | attempt_number  |
          | amount       |  | next_retry_at   |
          +--------------+  +-----------------+

Relationships:
  plans 1───* plan_prices        (one plan, multiple price configurations)
  plan_prices 1───* price_tiers  (one price, multiple graduated tiers)
  plans 1───* subscriptions      (one plan, many subscribers)
  plan_prices 1───* subscriptions (one price, many subscriptions)
  subscriptions 1───* invoices   (one subscription, invoice per billing period)
  subscriptions 1───* usage_events (one subscription, many usage data points)
  invoices 1───* invoice_line_items (one invoice, multiple charge components)
  invoices 1───* payments        (one invoice, multiple payment attempts)
```

---

## Data Flow

1. **Catalog Setup**: Admin creates a `plan` and one or more `plan_prices`. For tiered pricing, `price_tiers` are added to the price. The plan/price separation means the same "Professional" plan can have a $29/month price and a $290/year price.

2. **Subscription Creation**: Customer subscribes, creating a `subscriptions` record with status = `trialing` (if trial configured) or `active`. The `current_period_start` and `current_period_end` are set based on `billing_interval`. The `billing_anchor_day` locks the billing date (e.g., always on the 15th).

3. **Usage Tracking**: For metered plans, the application sends `usage_events` throughout the billing period. Each event includes an `idempotency_key` to prevent double-counting from retried API calls. Events are stored raw and aggregated only at invoicing time.

4. **Invoice Generation**: At `current_period_end`, a billing job creates an `invoice` with status = `draft`. It generates `invoice_line_items` for: the base subscription charge, aggregated metered usage (matched by `meter_name`), any prorations from mid-cycle plan changes, applicable discounts, and calculated tax.

5. **Invoice Finalization**: The invoice status moves to `open`, the `amount_due` is calculated, and the invoice becomes immutable. This separation between draft and open ensures all line items are finalized before charging.

6. **Payment Attempt**: A `payments` record is created with `attempt_number = 1`. The payment processor charges the customer's payment method. On success, the invoice status moves to `paid` and `paid_at` is set.

7. **Dunning (Failed Payment)**: If payment fails, the `payments` record is marked `failed` and `next_retry_at` is set using exponential backoff (e.g., 1 day, 3 days, 7 days). The subscription status moves to `past_due`. A new `payments` record is created for each retry.

8. **Dunning Escalation**: After maximum retries (typically 3-4 attempts over 2-3 weeks), the invoice status moves to `uncollectible` and the subscription is canceled. The customer is notified at each stage.

9. **Subscription Renewal**: On successful payment, `current_period_start` and `current_period_end` advance by one billing_interval. The cycle repeats from step 3.

10. **Mid-Cycle Changes**: If a customer upgrades or downgrades mid-cycle, proration `invoice_line_items` are calculated: a credit for the unused portion of the old plan and a charge for the remaining portion of the new plan.

---

## Key Design Decisions for Interviews

- **Why separate plans from plan_prices?** A single plan like "Professional" may have monthly ($29/mo) and annual ($290/yr) pricing, different currencies, and different pricing models (flat for small teams, per-seat for enterprises). Separating them avoids plan duplication.

- **Why price_tiers as a separate table?** Graduated pricing is inherently tabular (ranges with rates). Embedding tiers as JSON in plan_prices would make it hard to query and validate. A normalized table with composite PK (price_id + tier_start) enforces non-overlapping ranges at the schema level.

- **Why billing_anchor_day on subscriptions?** Without it, a customer who subscribes on March 31 would have inconsistent billing dates (no Feb 31, Apr 31). The anchor day (capped at 28) ensures predictable billing. This also enables prorating correctly when customers change plans.

- **Why store raw usage_events instead of pre-aggregating?** Raw events provide auditability -- customers can dispute charges and see exactly what generated them. Pre-aggregation would be lossy. Aggregation happens once at invoice time and the result is stored in invoice_line_items.

- **Why idempotency_key on both payments and usage_events?** Network failures cause retries. Without idempotency, a retry could double-charge a customer (payments) or double-count their usage (usage_events). The UNIQUE constraint guarantees exactly-once processing.

- **Why attempt_number and next_retry_at on payments?** Dunning requires exponential backoff -- hammering a declined card every hour annoys the bank and the customer. Tracking attempt_number enables calculating the next retry interval (e.g., 2^attempt_number days). This is a business-critical recovery mechanism since most failed payments eventually succeed with retries.

- **Why invoice status draft before open?** Complex invoices (metered usage + prorations + tax) may take time to assemble. The draft state prevents premature payment attempts on incomplete invoices. Once finalized as open, the invoice is immutable.
