# Data Model: Marketplace (Airbnb/Etsy/eBay)

A two-sided marketplace connects buyers and sellers, earning revenue by facilitating transactions. The data model must handle the full lifecycle: seller onboarding with KYC verification, hierarchical product categorization, listing management with quality scoring, payment escrow for trust, bilateral reviews, and dispute resolution. The core design challenge is building trust between strangers through escrow, reviews, and seller tiers.

---

## Table Responsibilities

| Table                | Purpose                           | Why It Exists                                                                      |
| -------------------- | --------------------------------- | ---------------------------------------------------------------------------------- |
| **users**            | Universal user identity           | Single identity table for both buyers and sellers with KYC tracking                |
| **seller_profiles**  | Seller-specific business data     | Separates seller business attributes from user identity; not all users are sellers |
| **categories**       | Hierarchical product taxonomy     | Self-referencing tree for browsing navigation and attribute inheritance            |
| **listings**         | Items for sale                    | Core marketplace entity with quality scoring for search ranking                    |
| **listing_images**   | Product photography               | Separated for ordered, CDN-served images with display control                      |
| **shipping_options** | Delivery methods and costs        | Per-listing shipping configuration with carrier and destination support            |
| **orders**           | Transaction lifecycle with escrow | Tracks the full buy flow from payment through escrow to seller payout              |
| **reviews**          | Bilateral reputation system       | Both buyers and sellers review each other; builds marketplace trust                |
| **disputes**         | Conflict resolution workflow      | Structured mediation process with evidence collection                              |

---

## Detailed Field Descriptions

### users

| Field        | Type             | Description                                                    |
| ------------ | ---------------- | -------------------------------------------------------------- |
| user_id      | UUID (PK)        | Unique user identifier                                         |
| email        | VARCHAR (UNIQUE) | Primary email address                                          |
| display_name | VARCHAR          | Public-facing name                                             |
| role         | ENUM             | buyer, seller, both                                            |
| status       | ENUM             | active, suspended, deactivated                                 |
| kyc_status   | ENUM             | none, pending, verified, rejected                              |
| kyc_level    | INT              | Verification level (1=email, 2=ID, 3=address, 4=business docs) |
| country      | VARCHAR          | ISO country code; determines tax and regulatory requirements   |

**Why a single users table instead of separate buyer/seller tables?** Most marketplace users start as buyers and later become sellers. A single identity avoids duplicate accounts, simplifies login, and enables a user to buy and sell simultaneously. The `role` field tracks capability, not identity.

**Why kyc_level as a tiered integer?** Different selling thresholds require different verification levels. Level 1 (email verified) might allow selling items under $50. Level 3 (address verified) allows up to $5,000. Level 4 (business documents) allows unlimited. This progressive verification reduces friction for casual sellers while protecting against fraud at scale.

### seller_profiles

| Field             | Type          | Description                                                          |
| ----------------- | ------------- | -------------------------------------------------------------------- |
| user_id           | UUID (PK, FK) | One-to-one with users; only sellers have this record                 |
| shop_name         | VARCHAR       | Seller's shop/store name                                             |
| shop_description  | TEXT          | About the shop                                                       |
| policies_json     | JSONB         | Return policy, shipping policy, custom policies                      |
| avg_rating        | DECIMAL       | Running average review rating                                        |
| review_count      | INT           | Total number of reviews received                                     |
| total_sales       | INT           | Lifetime number of completed orders                                  |
| gmv               | DECIMAL       | Gross merchandise volume (lifetime revenue)                          |
| response_rate     | DECIMAL       | Percentage of buyer messages responded to within 24h                 |
| tier              | ENUM          | standard, top_rated, power                                           |
| payout_account_id | VARCHAR       | Reference to payment processor payout account (e.g., Stripe Connect) |

**Why track gmv separately from total_sales?** GMV measures marketplace health and is a key business metric. Total_sales is count-based. A seller with 100 sales at $10 (GMV=$1,000) is very different from one with 100 sales at $1,000 (GMV=$100,000) for platform economics.

**Why seller tiers?** Tiers incentivize good behavior. Top-rated sellers get search ranking boosts, lower commission rates, and priority support. Tier criteria include: rating > 4.7, response_rate > 95%, completion_rate > 98%, minimum GMV. This creates a flywheel: better sellers get more visibility, earn more, and stay on the platform.

### categories

| Field                   | Type                | Description                                                                    |
| ----------------------- | ------------------- | ------------------------------------------------------------------------------ |
| category_id             | UUID (PK)           | Unique category identifier                                                     |
| parent_id               | UUID (FK, self-ref) | Parent category; NULL for root categories                                      |
| name                    | VARCHAR             | Category display name (e.g., "Electronics", "Laptops", "Gaming Laptops")       |
| slug                    | VARCHAR             | URL-friendly name (e.g., "gaming-laptops")                                     |
| depth                   | INT                 | Level in the hierarchy (0=root, 1=sub, 2=sub-sub)                              |
| is_leaf                 | BOOLEAN             | Whether this category has no children (only leaf categories can have listings) |
| allowed_attributes_json | JSONB               | Category-specific attributes: color, size, brand, condition, etc.              |

**Why self-referencing hierarchy?** Categories are naturally hierarchical: Electronics > Computers > Laptops > Gaming Laptops. A self-referencing foreign key models this cleanly. The `depth` field enables efficient queries ("show all top-level categories" = WHERE depth=0).

**Why allowed_attributes_json per category?** A "Clothing" category needs size and color. An "Electronics" category needs brand and condition. A "Furniture" category needs dimensions and material. Category-specific attributes enable structured filtering without a one-size-fits-all schema.

**Why is_leaf flag?** Only leaf categories should have listings. A listing in "Electronics" (non-leaf) is too vague. Forcing listings into leaf categories (e.g., "Gaming Laptops") ensures proper categorization and enables meaningful filtering.

### listings

| Field           | Type      | Description                                                                                          |
| --------------- | --------- | ---------------------------------------------------------------------------------------------------- |
| listing_id      | UUID (PK) | Unique listing identifier                                                                            |
| seller_id       | UUID (FK) | The seller who created this listing                                                                  |
| category_id     | UUID (FK) | Leaf category this listing belongs to                                                                |
| title           | VARCHAR   | Listing title (searchable)                                                                           |
| description     | TEXT      | Detailed item description                                                                            |
| condition       | ENUM      | new, like_new, good, fair, for_parts                                                                 |
| price           | DECIMAL   | Listing price                                                                                        |
| currency        | VARCHAR   | ISO currency code (USD, EUR, GBP)                                                                    |
| quantity        | INT       | Available quantity                                                                                   |
| quantity_sold   | INT       | Number of units sold (for social proof)                                                              |
| status          | ENUM      | draft, active, paused, sold, removed                                                                 |
| quality_score   | DECIMAL   | Platform-computed listing quality (0-100) based on photos, description length, price competitiveness |
| attributes_json | JSONB     | Category-specific attributes (validated against categories.allowed_attributes_json)                  |
| view_count      | INT       | Total views (for popularity ranking)                                                                 |

**Why quality_score?** Search ranking should surface the best listings, not just the cheapest. Quality_score considers: number of photos (more is better), description completeness, competitive pricing, seller rating, and past conversion rate. This improves buyer experience and incentivizes sellers to create better listings.

**Why quantity_sold visible?** Social proof. "423 sold" signals to buyers that this is a trusted listing. It also helps with search ranking -- high-selling listings are likely good matches.

### listing_images

| Field         | Type      | Description                                      |
| ------------- | --------- | ------------------------------------------------ |
| listing_id    | UUID (FK) | Parent listing                                   |
| url           | VARCHAR   | Original uploaded image URL                      |
| cdn_url       | VARCHAR   | CDN-served URL (resized, optimized)              |
| display_order | INT       | Position in the image carousel (1=first)         |
| is_primary    | BOOLEAN   | The main image shown in search results and cards |

**Why a separate table?** Listings have 1-20 images with ordering. An array in the listings table would make reordering awkward and prevent indexing on individual images. A separate table supports efficient queries like "all primary images for search results."

### shipping_options

| Field              | Type      | Description                                    |
| ------------------ | --------- | ---------------------------------------------- |
| listing_id         | UUID (FK) | Parent listing                                 |
| carrier            | VARCHAR   | Shipping carrier (USPS, FedEx, DHL, etc.)      |
| method             | VARCHAR   | Shipping method (standard, express, overnight) |
| price              | DECIMAL   | Shipping cost                                  |
| estimated_days_min | INT       | Minimum estimated delivery days                |
| estimated_days_max | INT       | Maximum estimated delivery days                |
| ships_from         | VARCHAR   | Origin country/region                          |
| ships_to           | VARCHAR[] | Array of destination countries/regions         |

**Why ships_to as an array?** A seller may ship to US, Canada, and UK but not to other countries. The array enables filtering: "show me listings that ship to Germany." Without this, international buyers would discover shipping restrictions only at checkout.

### orders

| Field             | Type          | Description                                                                |
| ----------------- | ------------- | -------------------------------------------------------------------------- |
| order_id          | UUID (PK)     | Unique order identifier                                                    |
| buyer_id          | UUID (FK)     | The buying user                                                            |
| seller_id         | UUID (FK)     | The selling user                                                           |
| listing_id        | UUID (FK)     | Which listing was purchased                                                |
| quantity          | INT           | Number of units ordered                                                    |
| item_price        | DECIMAL       | Price per unit at time of purchase                                         |
| shipping_fee      | DECIMAL       | Shipping cost                                                              |
| platform_fee      | DECIMAL       | Platform's commission (calculated from seller's commission rate)           |
| total_amount      | DECIMAL       | Grand total charged to buyer (item_price x quantity + shipping_fee)        |
| seller_payout     | DECIMAL       | Amount the seller receives (total_amount - platform_fee)                   |
| status            | ENUM          | created, paid, escrowed, shipped, delivered, completed, disputed, refunded |
| tracking_number   | VARCHAR       | Shipping tracking number (set by seller)                                   |
| payment_intent_id | VARCHAR       | Reference to payment processor                                             |
| idempotency_key   | UUID (UNIQUE) | Prevents duplicate orders from retried requests                            |

**Why escrow (status=escrowed)?** In a marketplace, buyer and seller do not trust each other. Escrow holds the buyer's payment until delivery is confirmed. Without escrow, buyers risk paying and never receiving the item, or sellers risk shipping and never getting paid. Escrow is the foundation of marketplace trust.

**Why pre-compute seller_payout and platform_fee?** These amounts are locked at order time. If the platform later changes its commission rate, existing orders should not be affected. Storing computed values makes payout processing simple and auditable.

### reviews

| Field           | Type      | Description                                                     |
| --------------- | --------- | --------------------------------------------------------------- |
| review_id       | UUID (PK) | Unique review identifier                                        |
| order_id        | UUID (FK) | Which order this review is for                                  |
| reviewer_id     | UUID (FK) | Who wrote the review                                            |
| reviewee_id     | UUID (FK) | Who is being reviewed                                           |
| rating          | INT       | Rating from 1 to 5                                              |
| text            | TEXT      | Review text                                                     |
| photos          | VARCHAR[] | Review photo URLs                                               |
| is_buyer_review | BOOLEAN   | True if buyer reviewing seller; false if seller reviewing buyer |
| created_at      | TIMESTAMP | When the review was submitted                                   |

**Why bilateral reviews?** Sellers need to know if a buyer is reliable (pays promptly, does not file false disputes). Buyers need to know if a seller ships quality items on time. Bilateral reviews build a complete trust picture. To prevent retaliation, both reviews are revealed simultaneously (like eBay's system).

**Why one review per order per direction?** The composite constraint (order_id + reviewer_id) ensures a buyer cannot review the same order twice. The is_buyer_review flag distinguishes direction without needing separate tables.

### disputes

| Field         | Type      | Description                                                               |
| ------------- | --------- | ------------------------------------------------------------------------- |
| dispute_id    | UUID (PK) | Unique dispute identifier                                                 |
| order_id      | UUID (FK) | Which order is disputed                                                   |
| initiator_id  | UUID (FK) | Who opened the dispute (buyer or seller)                                  |
| reason        | ENUM      | item_not_received, item_not_as_described, damaged, counterfeit, other     |
| status        | ENUM      | open, mediation, resolved, escalated                                      |
| resolution    | ENUM      | full_refund, partial_refund, replacement, dismissed, NULL (if unresolved) |
| evidence_json | JSONB     | Structured evidence: messages, photos, tracking info, timestamps          |

**Why structured evidence_json?** Dispute resolution requires reviewing evidence from both parties. Structured JSON (not free text) enables displaying a timeline: buyer's claim with photos, seller's response with tracking proof, mediator's notes. This makes the resolution process efficient and auditable.

---

## ER Diagram

```
+------------------+          +-------------------+
|     users        |          |  categories       |
+------------------+          +-------------------+
| user_id (PK)     |          | category_id (PK)  |
| email            |          | parent_id (FK)----+----> self
| display_name     |          | name              |
| role             |          | slug              |
| status           |          | depth             |
| kyc_status       |          | is_leaf           |
| kyc_level        |          | allowed_attrs     |
| country          |          +--------+----------+
+---+----+---------+                   |
    |    |                             |
    |    | 1-to-1                      | 1
    |    |                             |
    |  +-+----------------+            *
    |  | seller_profiles  |   +--------+----------+
    |  +------------------+   |    listings       |
    |  | user_id(PK)(FK)  |   +-------------------+
    |  | shop_name        |   | listing_id (PK)   |
    |  | shop_description |   | seller_id (FK)    |
    |  | policies_json    |   | category_id (FK)  |
    |  | avg_rating       |   | title, description|
    |  | review_count     |   | condition         |
    |  | total_sales      |   | price, currency   |
    |  | gmv              |   | quantity           |
    |  | response_rate    |   | quantity_sold      |
    |  | tier             |   | status            |
    |  | payout_account   |   | quality_score     |
    |  +------------------+   | attributes_json   |
    |          |              | view_count        |
    |          | 1            +--+-----+-----+----+
    |          |                 |     |     |
    |          *                 | 1   | 1   | 1
    |   +------+------+         |     |     |
    |   |   orders    |         *     *     *
    |   +-------------+   +-----++ +--+-------+ +--+-----------+
    |   |order_id(PK) |   |list- | |listing_  | |shipping_     |
    |   |buyer_id(FK) |   |ing_  | |images    | |options       |
    |   |seller_id(FK)|   |      | +----------+ +--------------+
    |   |listing_id   |   |      | |listing_id| |listing_id(FK)|
    |   |quantity     |   |      | |url       | |carrier       |
    |   |item_price   |   |      | |cdn_url   | |method        |
    |   |shipping_fee |   |      | |display_  | |price         |
    |   |platform_fee |   |      | | order    | |est_days_*    |
    |   |total_amount |   |      | |is_primary| |ships_from    |
    |   |seller_payout|   |      | +----------+ |ships_to[]    |
    |   |status       |   |      |              +--------------+
    |   |tracking_num |   +------+
    |   |payment_id   |
    |   |idempotency  |
    |   +--+------+---+
    |      |      |
    |      | 1    | 1
    |      |      |
    |      *      *
    |  +---+----+ +---+------+
    |  |reviews | | disputes |
    |  +--------+ +----------+
    |  |review_ | |dispute_  |
    |  | id(PK) | | id (PK)  |
    |  |order_id| |order_id  |
    *  |reviewer| |initiator |
  users| _id   | |reason    |
    |  |reviewee| |status    |
    |  | _id   | |resolution|
    |  |rating  | |evidence  |
    |  |text    | +----------+
    |  |photos[]|
    |  |is_buyer|
    |  | review |
    |  +--------+
    |
    +-- users referenced by: orders(buyer_id, seller_id),
        reviews(reviewer_id, reviewee_id), disputes(initiator_id)
```

### Relationship Summary

```
users           1───1 seller_profiles     (a seller has one profile)
users           1───* orders (as buyer)   (one buyer places many orders)
users           1───* orders (as seller)  (one seller receives many orders)
categories      1───* listings            (one leaf category has many listings)
categories      1───* categories          (self-referencing hierarchy)
seller_profiles 1───* listings            (one seller has many listings)
listings        1───* listing_images      (one listing has many photos)
listings        1───* shipping_options    (one listing has many shipping methods)
listings        1───* orders              (one listing can be ordered many times)
orders          1───* reviews             (one order generates up to 2 reviews)
orders          1───1 disputes            (one order can have one active dispute)
```

---

## Data Flow

1. **Seller onboarding** -- User registers and requests seller access. KYC verification progresses through levels: email verification (level 1), government ID upload (level 2), address verification (level 3), business documentation (level 4). Each level unlocks higher selling limits. A `seller_profiles` row is created.

2. **Listing creation** -- Seller selects a leaf category, which determines the available attributes (from allowed_attributes_json). They fill in title, description, condition, price, and category-specific attributes. Photos are uploaded and assigned display_order. Shipping options are configured. The listing starts as draft, then published to active.

3. **Quality scoring** -- The platform computes quality_score based on: number of photos (min 3 for high score), description word count (>100 words), price competitiveness (compared to similar listings), seller rating, and historical conversion rate. Quality_score influences search ranking.

4. **Discovery** -- Buyers browse by category tree or search by keywords. Results are ranked by a combination of quality_score, relevance, seller tier, view_count, and quantity_sold. Filters apply on category attributes, price range, condition, shipping destination, and seller rating.

5. **Purchase** -- Buyer selects a listing and shipping option. Payment is authorized through the payment processor. An `orders` row is created with status=paid. The platform_fee and seller_payout are calculated and locked. Listing quantity is decremented.

6. **Escrow** -- Payment funds are held in escrow (status=escrowed). The seller is notified to ship. This is the critical trust mechanism: the buyer's money is held by the platform, not sent to the seller.

7. **Shipping** -- Seller ships the item and enters the tracking_number. Order status changes to shipped. The buyer can track delivery.

8. **Delivery confirmation** -- When tracking shows delivered, or the buyer confirms receipt, status changes to delivered. A grace period (e.g., 3 days) begins for the buyer to inspect the item.

9. **Escrow release** -- After the grace period without dispute, status changes to completed. Escrow is released: seller_payout is transferred to the seller's payout_account_id. Platform retains platform_fee as revenue.

10. **Bilateral reviews** -- Both buyer and seller are prompted to leave reviews. Reviews are held until both parties submit (or the review window closes), then revealed simultaneously. Seller's avg_rating and review_count are updated. Tier re-evaluation may occur.

11. **Dispute flow** -- If the buyer is unhappy (item not received, not as described, damaged):
    - Buyer opens a dispute (status=open) with reason and evidence (photos, messages)
    - Seller responds with counter-evidence (tracking proof, listing photos)
    - If unresolved, status changes to mediation and platform staff reviews
    - Resolution options: full_refund (escrow returned to buyer), partial_refund, replacement (seller ships new item), dismissed (escrow released to seller)
    - If either party disagrees, dispute can be escalated

---

## Interview Discussion Points

**Q: Why escrow instead of direct payment to sellers?**
Without escrow, the marketplace has no leverage over the transaction. If a buyer pays a seller directly and the item never arrives, the platform cannot intervene. Escrow gives the platform control: funds are released only after successful delivery. This is what makes strangers willing to transact.

**Q: How do you prevent review manipulation?**
Several mechanisms: (1) Reviews require a completed order (no fake reviews without a purchase). (2) Bilateral reveal prevents retaliation. (3) Anomaly detection flags suspicious patterns (many 5-star reviews from new accounts). (4) Review text is checked for incentivized language ("seller offered me a discount for 5 stars").

**Q: How does the category hierarchy scale?**
The self-referencing tree with depth and is_leaf flags supports any depth. For performance, the full category tree is cached (it changes infrequently). Breadcrumb navigation (Electronics > Computers > Laptops > Gaming) is computed by walking parent_id up to root. Category-specific attributes enable structured filtering without schema changes.

**Q: How do you handle multi-currency?**
Each listing has its own currency. At checkout, the platform converts to the buyer's preferred currency using current exchange rates. The order stores the original listing currency and price for the seller, plus the converted amount for the buyer. Exchange rate risk is managed by the platform.

**Q: Why seller tiers instead of just ratings?**
Ratings alone do not capture the full picture. A seller with a 4.8 rating but 3 sales is very different from one with 4.7 and 10,000 sales. Tiers combine multiple signals (rating, volume, response rate, dispute rate) into a single, actionable badge that buyers understand. Tiers also give the platform levers to incentivize desired behavior (lower fees for top-rated sellers).
