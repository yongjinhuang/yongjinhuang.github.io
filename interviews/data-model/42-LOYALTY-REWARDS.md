# Data Model: Loyalty & Rewards (Starbucks/Airlines)

A loyalty program must track points earning, redemption, expiration, and tier qualification while maintaining financial-grade accuracy -- loyalty points are a liability on the company's balance sheet. The data model uses an append-only ledger for audit compliance, FIFO lot-based expiration for fair point aging, and a tier system with qualification windows. The central challenge is that points are effectively a currency: they must never be double-spent, lost, or miscounted.

---

## Table Responsibilities

| Table | Purpose | Why It Exists |
|-------|---------|---------------|
| **members** | Loyalty program membership with tier tracking | Links a user to the loyalty program with lifetime aggregates and current tier status |
| **points_balances** | Real-time point balance by type | Provides instant balance lookups with optimistic locking to prevent race conditions on concurrent transactions |
| **points_ledger** | Append-only record of every point movement | Immutable audit trail; the source of truth for all point operations; analogous to a financial ledger |
| **point_lots** | Individual batches of earned points with expiration dates | Enables FIFO expiration and redemption -- oldest points are used/expired first |
| **tiers** | Tier definitions with thresholds and benefits | Defines the tier structure (bronze through platinum) with qualification rules and multipliers |
| **tier_history** | Records every tier change | Audit trail for tier upgrades, downgrades, and renewals; enables dispute resolution |
| **earning_rules** | Configurable rules for how points are earned | Decouples earning logic from code; enables marketing to launch campaigns without engineering changes |
| **rewards** | Catalog of redeemable items | What members can spend points on; includes inventory tracking and tier-gating |
| **redemptions** | Records of point-for-reward exchanges | Tracks the full lifecycle of a redemption from hold through fulfillment or cancellation |

---

## Detailed Field Descriptions

### members

| Field | Type | Description |
|-------|------|-------------|
| member_id | PK, UUID | Unique loyalty member identifier |
| user_id | FK → users | Links to the user account; a user may have one loyalty membership |
| enrollment_status | ENUM | active, suspended, closed; suspended members cannot earn or redeem |
| current_tier_id | FK → tiers | Current tier level; determines earn multiplier and reward eligibility |
| tier_qualified_until | DATE | When current tier status expires; if not re-qualified, member is downgraded |
| lifetime_earned | BIGINT | Total points ever earned; used for lifetime tier qualification and analytics |
| lifetime_redeemed | BIGINT | Total points ever redeemed; part of the liability calculation |
| lifetime_expired | BIGINT | Total points that expired unused; important for financial reporting |
| joined_at | TIMESTAMP | When the member enrolled in the loyalty program |

### points_balances

| Field | Type | Description |
|-------|------|-------------|
| member_id | FK, composite PK | Which member's balance |
| point_type | VARCHAR, composite PK | base, bonus, promotional; different types may have different expiration rules |
| balance | BIGINT | Current available point balance |
| held_amount | BIGINT | Points currently held (reserved) for pending redemptions; cannot be spent or expired |
| version | INT | Optimistic locking; prevents race conditions when two transactions try to deduct simultaneously |

### points_ledger (append-only, immutable)

| Field | Type | Description |
|-------|------|-------------|
| entry_id | PK, UUID | Unique ledger entry identifier |
| member_id | FK → members | Which member this entry affects |
| point_type | VARCHAR | base, bonus, promotional; matches points_balances.point_type |
| operation | ENUM | earn, redeem, expire, adjust, hold, release; every point movement has a named operation |
| amount | BIGINT | Positive for earn/release, negative for redeem/expire/hold; signed amount |
| running_balance | BIGINT | Balance after this operation; enables point-in-time balance reconstruction |
| reference_id | UUID | Links to the source (transaction_id, redemption_id, earning_rule_id); enables tracing |
| idempotency_key | VARCHAR, UNIQUE | Prevents double-crediting from retried events |
| created_at | TIMESTAMP | When this entry was recorded; immutable |

### point_lots (FIFO expiration)

| Field | Type | Description |
|-------|------|-------------|
| lot_id | PK, UUID | Unique lot identifier |
| member_id | FK → members | Which member earned this lot |
| earned_amount | BIGINT | Original points in this lot; never changes after creation |
| remaining_amount | BIGINT | Points still available in this lot; decremented on redemption or expiration |
| earned_at | TIMESTAMP | When these points were earned; determines FIFO order |
| expires_at | TIMESTAMP | When these points expire if not used; typically 12-24 months after earning |
| source_rule_id | FK → earning_rules | Which rule generated these points; useful for analytics and dispute resolution |

### tiers

| Field | Type | Description |
|-------|------|-------------|
| tier_id | PK, UUID | Unique tier identifier |
| name | ENUM | bronze, silver, gold, platinum; display name and sort order |
| qualification_threshold | BIGINT | Points required to qualify for this tier within the qualification window |
| retention_threshold | BIGINT | Points required to retain this tier at renewal; typically lower than qualification |
| earn_multiplier | DECIMAL | Multiplier applied to base earning (e.g., gold = 1.5x, platinum = 2x) |
| benefits_json | JSONB | Tier-specific perks (free shipping, priority support, exclusive access) |

### tier_history

| Field | Type | Description |
|-------|------|-------------|
| member_id | FK → members | Which member changed tier |
| old_tier_id | FK → tiers | Previous tier; null for initial enrollment |
| new_tier_id | FK → tiers | New tier after the change |
| change_type | ENUM | upgrade, downgrade, renewal; categorizes the reason for the change |
| qualifying_points | BIGINT | Points accumulated during the qualification window; evidence for the tier decision |
| qualification_window_start | DATE | Start of the evaluation period |
| qualification_window_end | DATE | End of the evaluation period |
| changed_at | TIMESTAMP | When the tier change took effect |

### earning_rules

| Field | Type | Description |
|-------|------|-------------|
| rule_id | PK, UUID | Unique rule identifier |
| name | VARCHAR | Human-readable rule name (e.g., "Standard Purchase", "Double Points Weekend") |
| rule_type | ENUM | spend (per dollar), activity (per action), partner (partner transactions), campaign (promotional) |
| points_per_unit | INT | Base points earned per unit (e.g., 1 point per dollar spent) |
| tier_multiplier_json | JSONB | Tier-specific multipliers: `{"bronze": 1, "silver": 1.25, "gold": 1.5, "platinum": 2}` |
| daily_cap | INT | Maximum points earnable per day under this rule; prevents gaming and limits liability |
| effective_from | TIMESTAMP | When this rule becomes active; enables scheduling promotional campaigns |
| effective_until | TIMESTAMP | When this rule expires; null for permanent rules |

### rewards

| Field | Type | Description |
|-------|------|-------------|
| reward_id | PK, UUID | Unique reward identifier |
| name | VARCHAR | Reward display name (e.g., "Free Coffee", "$10 Voucher", "Lounge Access") |
| description | TEXT | Detailed reward description |
| points_cost | BIGINT | How many points this reward costs to redeem |
| reward_type | ENUM | product (physical item), voucher (discount code), experience (event/lounge), partner (third-party reward) |
| inventory_count | INT | Available quantity; null for unlimited digital rewards |
| daily_limit | INT | Maximum redemptions per day across all members; prevents stock-outs from bot attacks |
| tier_eligibility | ARRAY | Which tiers can redeem this reward (e.g., ["gold", "platinum"] for exclusive rewards) |

### redemptions

| Field | Type | Description |
|-------|------|-------------|
| redemption_id | PK, UUID | Unique redemption identifier |
| member_id | FK → members | Who redeemed |
| reward_id | FK → rewards | What was redeemed |
| points_spent | BIGINT | Points deducted for this redemption |
| status | ENUM | held (points reserved), confirmed (order placed), fulfilled (delivered), cancelled (points returned) |
| hold_id | UUID | References the points_ledger hold entry; used to release points if cancelled |
| voucher_code | VARCHAR | Generated voucher/discount code; null for physical rewards |
| fulfilled_at | TIMESTAMP | When the reward was delivered; null until fulfilled |

---

## ER Diagram

```
+------------------+       +------------------+
|     members      |       |      tiers       |
|------------------|       |------------------|
| member_id (PK)   |       | tier_id (PK)     |
| user_id (FK)     |       | name             |
| enrollment_status|       | qualification_   |
| current_tier_id  |───────|  threshold       |
|  (FK)            |       | retention_       |
| tier_qualified_  |       |  threshold       |
|  until           |       | earn_multiplier  |
| lifetime_earned  |       | benefits_json    |
| lifetime_redeemed|       +------------------+
| lifetime_expired |              |
| joined_at        |              |
+------------------+              |
   |    |    |    |               |
   |    |    |    |               |
   |    |    |    +──* tier_history
   |    |    |    |
   |    |    |    |    +------------------+
   |    |    |    |    |  tier_history    |
   |    |    |    |    |------------------|
   |    |    |    └────| member_id (FK)   |
   |    |    |         | old_tier_id (FK) |
   |    |    |         | new_tier_id (FK) |
   |    |    |         | change_type      |
   |    |    |         | qualifying_points|
   |    |    |         | qual_window_     |
   |    |    |         |  start/end       |
   |    |    |         | changed_at       |
   |    |    |         +------------------+
   |    |    |
   |    |    +──────────* points_ledger
   |    |    |
   |    |    |    +---------------------+
   |    |    |    | points_ledger       |
   |    |    |    |  (append-only)      |
   |    |    |    |---------------------|
   |    |    └────| member_id (FK)      |
   |    |         | entry_id (PK)       |
   |    |         | point_type          |
   |    |         | operation           |
   |    |         | amount              |
   |    |         | running_balance     |
   |    |         | reference_id        |
   |    |         | idempotency_key     |
   |    |         | created_at          |
   |    |         +---------------------+
   |    |
   |    +─────────────* points_balances
   |    |
   |    |    +---------------------+
   |    |    | points_balances     |
   |    |    |---------------------|
   |    └────| member_id (FK, PK)  |
   |         | point_type (PK)     |
   |         | balance             |
   |         | held_amount         |
   |         | version             |
   |         +---------------------+
   |
   +──────────────────* point_lots
   |         |
   |    +----+-------------+
   |    |    point_lots     |
   |    |   (FIFO expiry)   |
   |    |-------------------|
   |    | lot_id (PK)       |
   |    | member_id (FK)    |
   |    | earned_amount     |
   |    | remaining_amount  |
   |    | earned_at         |
   |    | expires_at        |
   |    | source_rule_id(FK)|───────┐
   |    +-------------------+       |
   |                                |
   +──────────────* redemptions     |
                  |                 |
   +--------------+---+    +-------+----------+
   |   redemptions    |    |  earning_rules   |
   |------------------|    |------------------|
   | redemption_id(PK)|    | rule_id (PK)     |
   | member_id (FK)   |    | name             |
   | reward_id (FK)───|──┐ | rule_type        |
   | points_spent     |  | | points_per_unit  |
   | status           |  | | tier_multiplier_ |
   | hold_id          |  | |  json            |
   | voucher_code     |  | | daily_cap        |
   | fulfilled_at     |  | | effective_from   |
   +-----------------+   | | effective_until  |
                         | +------------------+
                  +------+-------+
                  |    rewards   |
                  |--------------|
                  | reward_id(PK)|
                  | name         |
                  | description  |
                  | points_cost  |
                  | reward_type  |
                  | inventory_   |
                  |  count       |
                  | daily_limit  |
                  | tier_        |
                  |  eligibility |
                  +--------------+

Relationships:
  members *───1 tiers              (current tier)
  members 1───* points_balances    (one per point type)
  members 1───* points_ledger      (all point operations)
  members 1───* point_lots         (all earned batches)
  members 1───* tier_history       (all tier changes)
  members 1───* redemptions        (all redemptions)
  redemptions *───1 rewards        (which reward was redeemed)
  point_lots *───1 earning_rules   (which rule generated the lot)
  tier_history *───1 tiers         (old and new tier references)
```

---

## Data Flow

1. **Transaction Event**: A purchase or qualifying activity event arrives (from POS, app, or partner API).

2. **Rule Matching**: The system evaluates `earning_rules` to find applicable rules based on rule_type, effective dates, and the transaction context. Multiple rules can match (e.g., base spend rule + promotional campaign).

3. **Points Calculation**: For each matching rule, points are calculated: `transaction_amount * points_per_unit * tier_multiplier`. The member's current tier determines the multiplier from `tier_multiplier_json`. The `daily_cap` is checked to prevent exceeding maximum earnings.

4. **Idempotency Check**: The `idempotency_key` (derived from the transaction ID) is checked against `points_ledger`. If it exists, the operation is a duplicate and is skipped.

5. **Ledger Entry**: An `earn` entry is appended to `points_ledger` with the calculated amount and running_balance. This is immutable.

6. **Balance Update**: `points_balances.balance` is incremented using optimistic locking (version check). If the version changed since read, the operation retries.

7. **Lot Creation**: A `point_lots` record is created with `earned_amount = remaining_amount`, `earned_at = now`, and `expires_at` calculated from the earning rule's expiration policy (typically 12-24 months).

8. **Tier Recalculation**: The system checks if the member's qualifying points (earned within the qualification window) now exceed the next tier's `qualification_threshold`. If so, a `tier_history` record is created with change_type = `upgrade`, the member's `current_tier_id` is updated, and `tier_qualified_until` is extended.

9. **Point Expiration (Batch Job)**: A daily batch job scans `point_lots` for rows where `expires_at < now` and `remaining_amount > 0`. For each expired lot: `remaining_amount` is zeroed, a points_ledger `expire` entry is created, and `points_balances.balance` is decremented. `members.lifetime_expired` is incremented.

10. **Redemption Flow**:
    - Member selects a reward → Check tier_eligibility → Check inventory_count → Check daily_limit
    - **Hold**: Create a `hold` entry in points_ledger, increment `points_balances.held_amount`, create redemption with status = `held`
    - **Confirm**: Deduct from oldest `point_lots` first (FIFO), create a `redeem` entry in points_ledger, update status to `confirmed`
    - **Fulfill**: Deliver the reward (ship product, generate voucher_code), update status to `fulfilled`
    - **Cancel** (if needed): Create a `release` entry in points_ledger, restore `points_balances.balance`, update status to `cancelled`

---

## Key Design Decisions for Interviews

- **Why point_lots for FIFO expiration?** Without lot tracking, there is no way to know which points expire first. Points earned on January 1 should expire before points earned on March 1. Lot-based tracking enables fair, first-in-first-out expiration and ensures that the oldest points are consumed first during redemption. This is a legal and financial requirement in many jurisdictions.

- **Why an append-only points_ledger?** Loyalty points are a financial liability on the company's balance sheet. Auditors need to reconstruct any member's balance at any point in time. An append-only ledger with running_balance makes this trivial. Mistakes are corrected with `adjust` entries, never by modifying existing rows.

- **Why separate points_balances from points_ledger?** The ledger is the source of truth but is append-only and grows unboundedly. Computing the current balance from the ledger would require scanning all entries. The denormalized `points_balances` table provides O(1) balance lookups, while the ledger provides auditability.

- **Why hold/release operations for redemptions?** A two-phase redemption (hold then confirm) prevents a race condition where a member starts a redemption but the reward goes out of stock before fulfillment. During the hold, the points are reserved (moved to held_amount) and cannot be spent or expired. If the redemption fails, the hold is released.

- **Why daily_cap on earning_rules?** Without caps, a bug or malicious actor could generate unlimited points. Daily caps limit liability exposure and make fraudulent earning patterns easier to detect. Caps also enable marketing to offer generous promotions (10x points weekend) without unbounded risk.

- **Why separate qualification_threshold from retention_threshold on tiers?** It should be harder to reach a tier than to keep it. A member who earned gold status through loyal behavior should not be punished by a slightly off year. The retention threshold (typically 60-80% of qualification) provides a buffer that rewards loyalty.

- **Why tier_multiplier_json on earning_rules instead of a flat multiplier on tiers?** Different earning rules may have different tier multiplier structures. A partner earning rule might not offer any tier bonus, while the core spend rule offers 2x for platinum members. Per-rule multipliers provide this flexibility.
