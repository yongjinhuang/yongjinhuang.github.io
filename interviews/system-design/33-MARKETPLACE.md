# Design a Marketplace Platform (Airbnb / Etsy / eBay)

---

## 1. Requirements Clarification

### Functional Requirements

| # | Requirement | Description |
|---|-------------|-------------|
| 1 | Listing Management | Sellers create, update, and deactivate listings with photos, descriptions, pricing, and inventory |
| 2 | Search and Discovery | Buyers search and browse listings by keyword, category, location, price range, and filters |
| 3 | Buyer-Seller Messaging | Direct communication between buyer and seller before/after purchase |
| 4 | Transaction Flow | Buyer pays → funds held in escrow → seller ships → buyer confirms → funds released |
| 5 | Reviews and Ratings | Bilateral post-transaction reviews; buyer rates seller and seller rates buyer |
| 6 | Trust and Safety | Identity verification, fraud detection, and content moderation |
| 7 | Dispute Resolution | Buyer/seller protection policies, mediation workflow, chargebacks |
| 8 | Commission and Fees | Platform take rate deducted at transaction settlement |
| 9 | Seller Analytics | Dashboard with views, clicks, conversion rate, and revenue metrics |
| 10 | Notifications | Order updates, messages, review requests, payout confirmations |
| 11 | Multi-Currency | Support cross-border transactions with currency conversion |
| 12 | Cold Start | Bootstrap supply and demand in new categories or geographies |

### Non-Functional Requirements

| # | Requirement | Target |
|---|-------------|--------|
| 1 | Search latency | < 200ms (p95) |
| 2 | Transaction processing | < 1 second end-to-end |
| 3 | Availability | 99.99% (< 53 minutes downtime/year) |
| 4 | Double-charge rate | Zero (idempotent payments) |
| 5 | Listing write latency | < 500ms for create/update |
| 6 | Message delivery latency | < 2 seconds |
| 7 | Fraud detection latency | < 500ms (inline, pre-auth) |
| 8 | Consistency | Strong for transactions; eventual for analytics and search index |
| 9 | Durability | Zero lost orders (at-least-once processing with idempotency) |
| 10 | Data retention | 7 years for financial records; 90 days for message logs |

### Scale Estimates

```
Listings:                  50,000,000 active listings
Buyers:                    20,000,000 registered buyers
Sellers:                   2,000,000 registered sellers
Daily transactions:        1,000,000 transactions/day
Peak transactions:         ~50 transactions/sec (10x baseline during sales)
Search queries:            50,000,000 queries/day = ~580 QPS average; 3,000 QPS peak
Messages:                  5,000,000 messages/day
Reviews:                   500,000 new reviews/day
```

### Back-of-Envelope Calculations

**Transaction Write Throughput:**
```
1M transactions/day / 86,400 sec = ~12 transactions/sec baseline
Peak factor: 5x = ~60 transactions/sec
Each transaction: ~8 state transitions (CREATED → PAID → ESCROWED → SHIPPED → DELIVERED → RELEASED)
Total writes: ~480 state writes/sec at peak
```

**Storage Estimates:**
```
Listing record:            ~5 KB (text fields, metadata)
Listing photos:            ~10 photos * 500 KB (compressed) = 5 MB per listing
50M listings text:         50M * 5 KB = 250 GB (relational DB)
50M listings photos:       50M * 5 MB = 250 TB (object storage, CDN-served)
Transaction record:        ~2 KB
1M tx/day * 2 KB:          ~2 GB/day; 730 GB/year
Message record:            ~500 bytes
5M msgs/day * 500 B:       ~2.5 GB/day
Review record:             ~1 KB
500K reviews/day * 1 KB:   ~500 MB/day
```

**Search Index:**
```
50M listings * 5 KB text = 250 GB raw
Inverted index (3x amplification) = ~750 GB in Elasticsearch
Index updates: 200K listing changes/day = ~2 writes/sec
```

**Bandwidth:**
```
Search response (50 results * 500 bytes): 25 KB/response
580 QPS * 25 KB = ~14.5 MB/sec outbound from search service
Image serving via CDN: 1M sessions/day * 50 image views * 50 KB = ~2.5 TB/day served by CDN
```

---

## 2. API Design

### Listing API

```
POST   /v1/listings
       Body: { title, description, price, currency, categoryId, condition, quantity,
               location: { country, city, postalCode }, attributes: { key: value },
               shippingOptions: [{ carrier, method, price, estimatedDays }] }
       Response: { listingId, status: "draft", qualityScore, createdAt }

PATCH  /v1/listings/{listingId}
       Body: { price?, title?, description?, quantity?, status? }
       Response: { listingId, updatedAt, qualityScore }

GET    /v1/listings/{listingId}
       Response: { id, title, description, price, currency, seller: { id, displayName,
                   rating, reviewCount }, images: [url], attributes, shippingOptions,
                   views, watchlistCount, status, createdAt }

DELETE /v1/listings/{listingId}
       Response: 204 No Content

POST   /v1/listings/{listingId}/images
       Body: multipart/form-data with image files
       Response: { images: [{ id, url, order }] }
```

### Search API

```
GET    /v1/search?q=&category=&minPrice=&maxPrice=&condition=&location=&radius=
              &sortBy=relevance|price_asc|price_desc|newest&page=&limit=
       Response: {
         total: 124500,
         page: 1,
         limit: 48,
         results: [{
           listingId, title, price, currency, thumbnailUrl, condition,
           sellerRating, location, shippingOptions, isPromoted
         }],
         facets: {
           categories: [{ id, name, count }],
           priceRanges: [{ min, max, count }],
           conditions: [{ value, count }]
         }
       }

GET    /v1/recommendations?userId=&context=homepage|listing|cart&limit=
       Response: { recommendations: [{ listingId, title, price, thumbnailUrl, reason }] }
```

### Transaction API

```
POST   /v1/orders
       Body: { listingId, quantity, shippingOptionId, buyerAddressId, paymentMethodId,
               promoCode?, idempotencyKey }
       Response: { orderId, status: "PENDING_PAYMENT", totalAmount, breakdown: {
                    itemPrice, shippingFee, tax, platformFee, total }, paymentIntentId }

GET    /v1/orders/{orderId}
       Response: { orderId, status, listing, buyer, seller, amounts, timeline: [
                   { status, timestamp, actor }], trackingNumber?, estimatedDelivery? }

POST   /v1/orders/{orderId}/confirm-receipt
       Body: { satisfied: true, notes? }
       Response: { orderId, status: "COMPLETED", payoutScheduled: true }

POST   /v1/orders/{orderId}/dispute
       Body: { reason: "ITEM_NOT_RECEIVED|NOT_AS_DESCRIBED|OTHER", description,
               evidenceUrls: [] }
       Response: { disputeId, status: "OPEN", resolutionDeadline }
```

### Review API

```
POST   /v1/reviews
       Body: { orderId, targetType: "BUYER|SELLER", rating: 1-5, comment,
               aspects: { communication: 1-5, accuracy: 1-5, shipping: 1-5 } }
       Response: { reviewId, status: "PENDING_PUBLICATION", publishAt }

GET    /v1/users/{userId}/reviews?role=seller|buyer&page=&limit=
       Response: { averageRating, totalCount, reviews: [{ id, rating, comment,
                   reviewer: { id, displayName }, createdAt, aspects }] }
```

### Messaging API

```
POST   /v1/conversations
       Body: { listingId, recipientId, message }
       Response: { conversationId, messageId, createdAt }

POST   /v1/conversations/{conversationId}/messages
       Body: { content, attachments?: [{ type, url }] }
       Response: { messageId, createdAt, redactedContent }

GET    /v1/conversations?page=&limit=
       Response: { conversations: [{ id, listing, participant, lastMessage,
                   unreadCount, updatedAt }] }

GET    /v1/conversations/{conversationId}/messages?page=&limit=
       Response: { messages: [{ id, senderId, content, attachments, sentAt, readAt }] }
```

### Seller Analytics API

```
GET    /v1/seller/analytics/summary?period=7d|30d|90d
       Response: { views: 12400, clicks: 3200, orders: 145, revenue: 8750.00,
                   conversionRate: 0.045, avgOrderValue: 60.34,
                   topListings: [{ listingId, title, revenue, orders }] }

GET    /v1/seller/analytics/listings/{listingId}?period=
       Response: { views, watchlists, orders, revenue, viewsByDay: [...],
                   searchImpressions, searchClickRate }
```

---

## 3. Data Model

### Core Tables

```sql
-- Sellers and buyers share the users table
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  display_name  VARCHAR(100) NOT NULL,
  avatar_url    TEXT,
  role          VARCHAR(20) NOT NULL DEFAULT 'BUYER', -- BUYER, SELLER, BOTH, ADMIN
  status        VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, SUSPENDED, BANNED
  kyc_status    VARCHAR(20) NOT NULL DEFAULT 'UNVERIFIED', -- UNVERIFIED, PENDING, VERIFIED
  kyc_level     SMALLINT NOT NULL DEFAULT 0, -- 0=none, 1=email, 2=phone, 3=id_doc
  country_code  CHAR(2),
  timezone      VARCHAR(50),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE seller_profiles (
  user_id           UUID PRIMARY KEY REFERENCES users(id),
  shop_name         VARCHAR(150) UNIQUE NOT NULL,
  shop_description  TEXT,
  policies          JSONB,             -- return policy, shipping policy
  avg_rating        NUMERIC(3,2),
  review_count      INT DEFAULT 0,
  total_sales       INT DEFAULT 0,
  gmv               NUMERIC(14,2) DEFAULT 0,
  response_rate     NUMERIC(5,2),      -- % of messages replied within 24h
  ship_on_time_rate NUMERIC(5,2),
  tier              VARCHAR(20) DEFAULT 'STANDARD', -- STANDARD, TOP_RATED, POWER
  payout_account_id UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE categories (
  id          INT PRIMARY KEY,
  parent_id   INT REFERENCES categories(id),
  name        VARCHAR(100) NOT NULL,
  slug        VARCHAR(100) UNIQUE NOT NULL,
  path        TEXT NOT NULL,           -- e.g. /electronics/phones/smartphones
  depth       SMALLINT NOT NULL,
  is_leaf     BOOLEAN NOT NULL DEFAULT FALSE,
  attributes  JSONB                    -- allowed attributes for this category
);

CREATE TABLE listings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id       UUID NOT NULL REFERENCES users(id),
  category_id     INT NOT NULL REFERENCES categories(id),
  title           VARCHAR(200) NOT NULL,
  description     TEXT,
  condition       VARCHAR(20) NOT NULL, -- NEW, LIKE_NEW, GOOD, FAIR, POOR
  price           NUMERIC(12,2) NOT NULL,
  currency        CHAR(3) NOT NULL DEFAULT 'USD',
  quantity        INT NOT NULL DEFAULT 1,
  quantity_sold   INT NOT NULL DEFAULT 0,
  status          VARCHAR(20) NOT NULL DEFAULT 'DRAFT', -- DRAFT, ACTIVE, PAUSED, SOLD, DELETED
  quality_score   NUMERIC(5,2),        -- 0-100, computed by listing quality service
  is_promoted     BOOLEAN DEFAULT FALSE,
  location_country CHAR(2),
  location_city    VARCHAR(100),
  location_postal  VARCHAR(20),
  attributes      JSONB,               -- category-specific attributes
  view_count      INT DEFAULT 0,
  watchlist_count INT DEFAULT 0,
  search_rank     NUMERIC(10,4),       -- precomputed for sorting
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at    TIMESTAMPTZ
);

CREATE INDEX idx_listings_seller ON listings(seller_id);
CREATE INDEX idx_listings_category ON listings(category_id);
CREATE INDEX idx_listings_status ON listings(status);
CREATE INDEX idx_listings_price ON listings(price);
CREATE INDEX idx_listings_created ON listings(created_at DESC);

CREATE TABLE listing_images (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id  UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  cdn_url     TEXT,
  display_order SMALLINT NOT NULL DEFAULT 0,
  width       INT,
  height      INT,
  size_bytes  INT,
  is_primary  BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE shipping_options (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id      UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  carrier         VARCHAR(50),
  method          VARCHAR(50) NOT NULL, -- STANDARD, EXPEDITED, OVERNIGHT, FREE
  price           NUMERIC(8,2) NOT NULL,
  estimated_days_min SMALLINT,
  estimated_days_max SMALLINT,
  ships_from_country CHAR(2),
  ships_to_countries TEXT[]            -- NULL means worldwide
);

-- Orders / Transactions
CREATE TABLE orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id          UUID NOT NULL REFERENCES users(id),
  seller_id         UUID NOT NULL REFERENCES users(id),
  listing_id        UUID NOT NULL REFERENCES listings(id),
  quantity          INT NOT NULL DEFAULT 1,
  item_price        NUMERIC(12,2) NOT NULL,
  shipping_fee      NUMERIC(8,2) NOT NULL DEFAULT 0,
  tax_amount        NUMERIC(8,2) NOT NULL DEFAULT 0,
  platform_fee      NUMERIC(8,2) NOT NULL,
  total_amount      NUMERIC(12,2) NOT NULL,
  seller_payout     NUMERIC(12,2) NOT NULL,
  currency          CHAR(3) NOT NULL,
  exchange_rate     NUMERIC(10,6) DEFAULT 1.0,
  status            VARCHAR(30) NOT NULL DEFAULT 'CREATED',
  -- CREATED, PENDING_PAYMENT, PAID, ESCROWED, SHIPPED,
  -- DELIVERED, COMPLETED, DISPUTED, REFUNDED, CANCELLED
  shipping_option_id UUID REFERENCES shipping_options(id),
  buyer_address_id   UUID,
  tracking_number    VARCHAR(100),
  carrier            VARCHAR(50),
  shipped_at         TIMESTAMPTZ,
  delivered_at       TIMESTAMPTZ,
  receipt_confirmed_at TIMESTAMPTZ,
  auto_release_at    TIMESTAMPTZ,      -- auto-release escrow after N days
  payment_intent_id  TEXT UNIQUE,      -- Stripe / payment gateway reference
  idempotency_key    TEXT UNIQUE,
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_buyer ON orders(buyer_id);
CREATE INDEX idx_orders_seller ON orders(seller_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_listing ON orders(listing_id);

CREATE TABLE order_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES orders(id),
  status      VARCHAR(30) NOT NULL,
  actor_id    UUID,
  actor_type  VARCHAR(20), -- BUYER, SELLER, SYSTEM, SUPPORT
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Escrow / Payouts
CREATE TABLE escrow_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID UNIQUE NOT NULL REFERENCES orders(id),
  amount          NUMERIC(12,2) NOT NULL,
  currency        CHAR(3) NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'HOLDING',
  -- HOLDING, RELEASED, REFUNDED, PARTIALLY_REFUNDED
  held_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  release_at      TIMESTAMPTZ,
  released_amount NUMERIC(12,2),
  provider_ref    TEXT             -- payment provider escrow reference
);

CREATE TABLE payouts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id         UUID NOT NULL REFERENCES users(id),
  amount            NUMERIC(12,2) NOT NULL,
  currency          CHAR(3) NOT NULL,
  status            VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  -- PENDING, PROCESSING, COMPLETED, FAILED
  source_order_ids  UUID[],
  payout_account_id UUID,
  provider_ref      TEXT,
  scheduled_at      TIMESTAMPTZ,
  processed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Reviews
CREATE TABLE reviews (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES orders(id),
  reviewer_id   UUID NOT NULL REFERENCES users(id),
  reviewee_id   UUID NOT NULL REFERENCES users(id),
  reviewee_type VARCHAR(10) NOT NULL, -- SELLER, BUYER
  rating        SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment       TEXT,
  aspects       JSONB,               -- { communication, accuracy, shipping }
  status        VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  -- PENDING, PUBLISHED, HIDDEN, FLAGGED
  fraud_score   NUMERIC(5,2),
  published_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id, reviewer_id)
);

CREATE INDEX idx_reviews_reviewee ON reviews(reviewee_id, status);

-- Disputes
CREATE TABLE disputes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            UUID NOT NULL REFERENCES orders(id),
  claimant_id         UUID NOT NULL REFERENCES users(id),
  respondent_id       UUID NOT NULL REFERENCES users(id),
  reason              VARCHAR(50) NOT NULL,
  description         TEXT NOT NULL,
  evidence_urls       TEXT[],
  status              VARCHAR(30) NOT NULL DEFAULT 'OPEN',
  -- OPEN, AWAITING_SELLER_RESPONSE, UNDER_REVIEW, RESOLVED_BUYER,
  -- RESOLVED_SELLER, ESCALATED, CLOSED
  resolution          VARCHAR(30),
  resolution_notes    TEXT,
  assigned_agent_id   UUID,
  response_deadline   TIMESTAMPTZ NOT NULL,
  resolved_at         TIMESTAMPTZ,
  refund_amount       NUMERIC(12,2),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Messaging
CREATE TABLE conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id      UUID REFERENCES listings(id),
  order_id        UUID REFERENCES orders(id),
  participant_ids UUID[] NOT NULL,
  last_message_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   UUID NOT NULL REFERENCES conversations(id),
  sender_id         UUID NOT NULL REFERENCES users(id),
  content           TEXT NOT NULL,
  redacted_content  TEXT,             -- PII-redacted version for audit logs
  attachments       JSONB,
  is_redacted       BOOLEAN DEFAULT FALSE,
  sent_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at           TIMESTAMPTZ
);
```

---

## 4. High-Level Architecture

```
+-------------------------------------------------------------------+
|                        Client Layer                               |
|  +------------+   +----------------+   +----------------------+  |
|  | Web (Next) |   | iOS / Android  |   | Seller Dashboard     |  |
|  +-----+------+   +-------+--------+   +-----------+----------+  |
+--------|------------------|-------------------------|-------------+
         |                  |                         |
         v                  v                         v
+-------------------------------------------------------------------+
|                     CDN / API Gateway                             |
|    (Cloudflare / AWS CloudFront + API Gateway)                   |
|    - TLS termination, DDoS protection, rate limiting             |
|    - Auth token validation (JWT), request routing                 |
+-------------------------------------------------------------------+
         |
         v
+-------------------------------------------------------------------+
|                    Load Balancer (Layer 7)                        |
+----------+----------+----------+----------+----------+-----------+
           |          |          |          |          |
+----------v-+  +-----v----+  +-v--------+ +v--------+ +v---------+
| Listing    |  | Search   |  |Transaction| |Messaging| |User/Auth |
| Service    |  | Service  |  | Service   | |Service  | |Service   |
+----------+-+  +-----+----+  +-+--------+ +---------+ +----------+
           |          |          |
           |          |          |
+----------v----------v----------v---------------------------------+
|                     Message Bus (Kafka)                          |
|  Topics: listing-events, order-events, review-events,           |
|          payment-events, fraud-signals, analytics-events         |
+------------------------------------------------------------------+
     |          |          |          |          |
     v          v          v          v          v
+--------+ +-------+ +--------+ +--------+ +----------+
|Listing | |Search | |Payment | |Fraud   | |Analytics |
|Worker  | |Indexer| |Service | |Service | |Processor |
+---+----+ +---+---+ +---+----+ +--------+ +----------+
    |           |         |
+---v---+   +---v---+  +--v----------+
|Listing|   |Elastic|  |Stripe /     |
|DB     |   |search |  |Payment GW   |
|(Postgres) +-------+  +-------------+
+-------+
```

### Service Interaction for a Purchase Flow

```
Buyer           API Gateway       Transaction Svc    Payment Svc     Escrow Svc
  |                 |                   |                 |               |
  |-- POST /orders->|                   |                 |               |
  |                 |--- validate ------>|                 |               |
  |                 |                   |-- check fraud-->|               |
  |                 |                   |<- fraud OK -----|               |
  |                 |                   |-- create order->|               |
  |                 |                   |                 |-- charge --->( )
  |                 |                   |                 |<- success ---|
  |                 |                   |-- escrow hold ----------------->|
  |                 |                   |<- held ------------------------|
  |                 |<-- 200 orderId ----|                 |               |
  |<-- order resp --|                   |                 |               |
  |                 |                   |--publish order-event to Kafka-->|
```

---

## 5. Deep Dive: Two-Sided Marketplace Fundamentals

### Chicken-and-Egg Problem

The defining challenge of a marketplace: buyers come for supply, sellers come for demand. Neither side has reason to join without the other.

```
+-------------------------------------------+
|         Marketplace Network Effects       |
|                                           |
|  More Sellers --> Better Selection       |
|      |                   |               |
|      v                   v               |
|  More Buyers --> More Sales for Sellers  |
|                                           |
|  Liquidity Threshold: The point at which |
|  the marketplace becomes self-sustaining |
+-------------------------------------------+
```

**Bootstrapping strategies:**

```
Strategy 1: Supply First (Airbnb model)
  - Subsidize early sellers with free listings, waived fees
  - Guarantee minimum earnings for first N transactions
  - Build supply concentrated in high-demand areas/categories

Strategy 2: Demand First (eBay model)
  - Aggregate buyers via SEO, paid acquisition
  - Show "out of stock" listings to measure demand signals
  - Launch with existing supply from another channel

Strategy 3: Single-Player Utility
  - Provide value to one side without the other
  - Etsy: let sellers use it as a portfolio/storefront
  - Offer free analytics tools to sellers before marketplace launch

Strategy 4: Geographic/Vertical Concentration
  - Launch in one city or one niche category
  - Achieve liquidity locally before expanding
  - Portland handmade crafts before national expansion
```

### Liquidity Metrics

```
Liquidity Score = (Successful Transactions) / (Search Sessions with Intent)

Target metrics:
  - Search-to-Transaction Rate:  > 5%
  - Listing Response Rate:       > 80% within 24h
  - Time-to-First-Sale (seller): < 30 days
  - Buyer Return Rate (30d):     > 40%
```

### Network Effect Types

| Type | Description | Example |
|------|-------------|---------|
| Same-side | More buyers attract more buyers (social proof) | Trending listings |
| Cross-side | More sellers attract more buyers and vice versa | Core marketplace effect |
| Data network | More transactions improve recommendations | Personalized search |
| Geographic | Density in a region improves liquidity locally | Hyperlocal search radius |

---

## 6. Deep Dive: Listing Management

### Listing Quality Score

A listing quality score (0-100) determines search ranking and seller tier. It is recomputed asynchronously on every update.

```
Quality Score Components:
+-----------------------------------------------+
|  Factor                   | Weight | Max Points|
|---------------------------|--------|-----------|
|  Title completeness       |  15%   |    15     |
|  Description length/rich  |  15%   |    15     |
|  Photo count (min 3)      |  20%   |    20     |
|  Photo resolution quality |  10%   |    10     |
|  Price competitiveness    |  10%   |    10     |
|  Category attributes fill |  10%   |    10     |
|  Shipping options count   |  10%   |    10     |
|  Seller rating            |  10%   |    10     |
+-----------------------------------------------+
```

**Listing lifecycle state machine:**

```
            +--------+
  Seller    | DRAFT  |
  creates   +---+----+
                |  publish()
                v
           +--------+    out_of_stock()    +---------+
           | ACTIVE +-------------------->| PAUSED  |
           +---+----+                     +----+----+
               |  sold out / manual            |  restock()
               |                               |
               v                               v
           +--------+                     +--------+
           |  SOLD  |                     | ACTIVE |
           +--------+                     +--------+
               |
               | admin_remove() / seller_delete()
               v
           +---------+
           | DELETED |
           +---------+
```

**Listing creation pipeline:**

```
Seller submits listing
        |
        v
  Input Validation (zod schema: title len, price range, category exists)
        |
        v
  Image Processing Service
    - Virus scan on upload
    - Resize to multiple resolutions (thumbnail 150px, medium 600px, full 1200px)
    - CDN upload (S3 + CloudFront)
    - NSFW image classifier (async)
        |
        v
  Content Moderation (async, NLP)
    - Prohibited items check (weapons, counterfeits)
    - Spam/keyword-stuffing detection
    - PII detection in description (phone numbers, emails)
        |
        v
  Quality Score Computation (async worker)
        |
        v
  Search Index Update (async, Elasticsearch)
        |
        v
  Listing ACTIVE in DB
```

---

## 7. Deep Dive: Search and Discovery

### Search Architecture

```
+-------------------------------+
|       Search Query            |
+-------------+-----------------+
              |
              v
+-------------+------------------+
|       Query Parser             |
|  - Tokenization                |
|  - Spell correction            |
|  - Synonym expansion           |
|  - Intent classification       |
|    (navigational vs exploratory)|
+-------------+------------------+
              |
     +--------+--------+
     |                 |
     v                 v
+----+------+    +-----+------+
| Keyword   |    | Semantic   |
| Search    |    | Search     |
|(BM25 in   |    |(Embedding  |
|Elasticsearch)  |vectors ANN)|
+----+------+    +-----+------+
     |                 |
     +--------+--------+
              |
              v
+-------------+------------------+
|       Ranking / Scoring        |
|  base_score = BM25 + semantic  |
|  * quality_score_boost         |
|  * seller_reputation_boost     |
|  * recency_decay               |
|  * personalization_boost       |
|  * promoted_listing_boost      |
+-------------+------------------+
              |
              v
+-------------+------------------+
|     Post-Filter / Faceting     |
|  - Price range                 |
|  - Category                    |
|  - Condition                   |
|  - Shipping: free / fast       |
|  - Location / radius           |
+-------------+------------------+
              |
              v
           Results
```

### Ranking Algorithm

```
final_score(listing) =
    alpha * text_relevance(query, listing)
  + beta  * quality_score(listing) / 100
  + gamma * seller_score(listing.seller)
  + delta * recency_decay(listing.published_at)
  + epsilon * personalization_boost(user, listing)
  + is_promoted(listing) * promotion_multiplier

Where:
  alpha   = 0.35  (text relevance dominates)
  beta    = 0.20  (listing quality)
  gamma   = 0.15  (seller reputation)
  delta   = 0.10  (freshness)
  epsilon = 0.20  (personalization)
  promotion_multiplier = 1.5 (paid promotions, capped at position 3)

recency_decay(t) = e^(-lambda * days_since_published)
  lambda = 0.05 for most categories
  lambda = 0.20 for fast-moving categories (e.g., electronics)
```

### Location-Based Search

```
For physical goods with location-aware shipping:
  1. User geo-IP detection or browser location API
  2. Listings tagged with ships_from_country
  3. Boost listings that ship domestically (lower estimated_days)
  4. For local pickup: Geohash index on listing.location
     - Geohash precision 6 = ~1.2km * 0.6km cells
     - Query: listings WHERE geohash LIKE 'prefix%'

For services/local items (Craigslist model):
  1. Elasticsearch geo_distance filter
  2. Radius search: default 50km, adjustable
  3. Sort by distance when relevance is similar
```

### Search Index Update Pipeline

```
Listing Event (Kafka)
        |
        v
  Indexer Consumer (reads listing_events topic)
        |
  +-----+-------+
  |             |
  v             v
 Full         Delta
 Index        Update
 (new         (price, qty,
 listing)     status change)
  |             |
  +-----+-------+
        |
        v
  Elasticsearch bulk API
  (batch 100 docs, flush every 200ms)
        |
        v
  Index available for search
  (eventual consistency ~500ms lag)
```

---

## 8. Deep Dive: Trust and Safety

### Identity Verification (KYC) Tiers

```
+----------------------------------------------------+
| KYC Level 0: Email only                            |
|   Limits: max $500/month transactions              |
|   Can: browse, message, buy low-value items        |
+----------------------------------------------------+
| KYC Level 1: Email + Phone verified                |
|   Limits: max $5,000/month                        |
|   Can: sell, post listings                         |
+----------------------------------------------------+
| KYC Level 2: Government ID (OCR + selfie match)    |
|   Limits: max $50,000/month                       |
|   Required for: payouts > $1,000/month             |
+----------------------------------------------------+
| KYC Level 3: Business verification (for merchants) |
|   Limits: unlimited                                |
|   Provides: enhanced dispute protection            |
+----------------------------------------------------+
```

**KYC flow:**

```
User submits ID document + selfie
        |
        v
  Document OCR extraction (AWS Rekognition / Stripe Identity)
        |
        v
  Liveness detection (anti-spoofing)
        |
        v
  Face match: selfie vs. document photo (similarity > 0.95)
        |
        v
  Sanctions screening (OFAC, PEP lists)
        |
        v
  Manual review queue (if confidence < threshold)
        |
        v
  KYC status updated; user notified
```

### Fraud Detection Pipeline

```
Transaction Request
        |
        v
+-------+-----------------------------------+
|     Real-Time Fraud Signals (<100ms)     |
|  - Device fingerprint (new device flag)  |
|  - IP reputation (VPN, Tor, proxy)       |
|  - Velocity: N orders in M minutes       |
|  - Billing/shipping address mismatch     |
|  - Card BIN country vs IP country        |
|  - User account age                      |
+-------+-----------------------------------+
        |
        v
+-------+-----------------------------------+
|     ML Fraud Score (XGBoost model)       |
|  - Feature vector: 50+ signals           |
|  - Trained on historical fraud labels    |
|  - Output: fraud probability 0.0-1.0     |
+-------+-----------------------------------+
        |
   +----+----+-----+
   |         |     |
   v         v     v
score<0.1  0.1-  0.8+
  ALLOW    0.8   BLOCK
           STEP-UP
           (3DS /
           OTP)
```

**Seller fraud patterns:**

| Pattern | Detection Signal | Action |
|---------|-----------------|--------|
| Shill bidding | Buyer-seller network graph cycles | Suspend accounts |
| Counterfeit goods | Image similarity to known brands | Remove listing + notify brand |
| Fee avoidance | Off-platform payment requests in messages | Message filter + warning |
| Account takeover | Login from new geo + new device | Force 2FA reauthentication |
| Review manipulation | Review cluster analysis (same device, IP, timing) | Remove reviews + penalize |

---

## 9. Deep Dive: Review and Rating System

### Bilateral Review Flow

Both buyer and seller can leave a review. To prevent retaliatory reviews, reviews are revealed only after both parties have submitted, or after the window expires.

```
Order Completed
        |
        v
  Review invitation sent to both buyer and seller (async, email + push)
        |
        v
  +-----+-----+
  |           |
  v           v
Buyer       Seller
writes      writes
review      review
  |           |
  +-----+-----+
        |
  Window expires (14 days) OR both submitted
        |
        v
  Both reviews published simultaneously
  (neither party saw the other's review while writing)
```

### Review Storage and Aggregation

```
Review submitted
        |
        v
  Fraud classifier (ML model)
    - Similarity score vs. reviewer's past reviews
    - Review velocity check (same user, many reviews in short window)
    - IP/device fingerprint overlap with reviewee
    - Text sentiment analysis (detects paid review patterns)
        |
   fraud_score > threshold?
   YES -> status = FLAGGED, human review queue
   NO  -> status = PENDING_PUBLICATION
        |
        v
  Publication at T=0 (simultaneous reveal)
        |
        v
  Rating Aggregation Job (runs every 5 minutes)
    UPDATE seller_profiles
    SET avg_rating = (
      SELECT AVG(rating) FROM reviews
      WHERE reviewee_id = seller_id
        AND reviewee_type = 'SELLER'
        AND status = 'PUBLISHED'
        AND created_at > NOW() - INTERVAL '12 months'
    ),
    review_count = COUNT(...)
```

### Fake Review Detection

```
Signals used in fraud_score:
  1. Reviewer account age < 7 days
  2. Reviewer has 0 prior purchases on platform
  3. Reviewer and reviewee share device fingerprint
  4. Review text identical or near-identical to another review
  5. Burst of 5-star reviews within 24h of listing going live
  6. Reviewer IP in same subnet as seller
  7. NLP: generic positive language without specifics ("great product!")

Ensemble model:
  - Rule-based flags (fast, deterministic)
  - Text embedding similarity (TF-IDF + cosine sim)
  - Graph-based: reviewer-reviewee connections (Neo4j)
  - Anomaly detection on rating distribution shifts
```

---

## 10. Deep Dive: Transaction Flow (Escrow)

### Full Transaction State Machine

```
CREATED
   |
   | Payment initiated (Stripe PaymentIntent created)
   v
PENDING_PAYMENT
   |
   | Payment confirmed (webhook from Stripe)
   v
PAID
   |
   | Funds moved to platform escrow account
   v
ESCROWED -----> DISPUTED (buyer opens dispute)
   |                 |
   | Seller ships    | Mediator resolves
   v                 |
SHIPPED            RESOLVED_BUYER or RESOLVED_SELLER
   |
   | Carrier confirms delivery (webhook)
   v
DELIVERED
   |
   | Buyer confirms receipt (or auto-release after 3 days)
   v
COMPLETED
   |
   | Payout job runs (daily batch or instant)
   v
FUNDS_RELEASED --> Seller payout
```

### Escrow Implementation

```
Platform does NOT hold money in a literal escrow bank account for each order.
Instead, it uses a virtual ledger backed by a pooled merchant account.

Ledger Entries for a $100 order (10% platform fee):
  T+0 (payment):
    DR  buyer_payment_account   $100
    CR  platform_pooled_escrow  $100

  T+shipping_confirmation:
    (no movement, just status update)

  T+delivery_confirmed:
    DR  platform_pooled_escrow  $100
    CR  platform_revenue           $10  (commission)
    CR  seller_pending_payout      $90

  T+payout_batch:
    DR  seller_pending_payout   $90
    CR  seller_bank_account     $90  (ACH / bank transfer)
```

### Idempotency in Payments

```
Every payment mutation carries a client idempotency_key (UUID).
If the same key is submitted twice, the second call returns the
cached first response without re-charging.

DB enforcement:
  orders.idempotency_key  TEXT UNIQUE

Application enforcement:
  Redis SET NX idempotency:{key} {orderId} EX 86400
  If exists: return cached order
  Else: proceed with charge and SET the key
```

---

## 11. Deep Dive: Commission and Fees

### Take Rate Model

```
+------------------------------------------------------+
| Tiered Commission Structure                         |
|                                                      |
| Revenue Tier (last 12 months) | Platform Take Rate  |
|-------------------------------|---------------------|
| $0 - $1,000                   | 12%                 |
| $1,001 - $10,000              | 10%                 |
| $10,001 - $50,000             | 8%                  |
| $50,001+                      | 6%                  |
|                                                      |
| Plus per-transaction fee: $0.30 + 2.9% (payment     |
| processing, passed through from Stripe)              |
+------------------------------------------------------+
```

### Fee Calculation

```
Order total breakdown for a $85 item + $10 shipping:

  Item price:          $85.00
  Shipping fee:        $10.00
  ---------------------
  Subtotal:            $95.00
  Tax (8.5%):           $8.08
  ---------------------
  Buyer pays:         $103.08

  Platform commission: $85.00 * 10% = $8.50
  Payment processing:  $103.08 * 2.9% + $0.30 = $3.29
  ---------------------
  Total fees:          $11.79
  Seller receives:     $95.00 - $8.50 - $3.29 = $83.21
  Platform net:        $8.50 (after payment processing cost)
```

### Fee Calculation Service

```
calculateFees(order):
  sellerTier   = getTierForSeller(order.seller_id)
  takeRate     = TIER_RATES[sellerTier]
  platformFee  = order.item_price * takeRate
  processingFee = (order.total_amount * STRIPE_RATE) + STRIPE_FIXED
  sellerPayout = order.item_price + order.shipping_fee - platformFee - processingFee
  return { platformFee, processingFee, sellerPayout }
```

---

## 12. Deep Dive: Dispute Resolution

### Dispute Workflow

```
Buyer opens dispute (within 30 days of purchase)
        |
        v
  Dispute record created; seller notified
        |
        v
  Seller response window: 3 business days
        |
  +-----+-----+
  |           |
Seller      No response
responds    (default: buyer wins)
  |
  v
Support agent reviews evidence
  (photos, messages, tracking data)
        |
        v
  Agent decision: RESOLVE_FOR_BUYER or RESOLVE_FOR_SELLER
        |
   +----+----+
   |         |
   v         v
Refund    Release
to buyer  to seller
   |
   v
  Escrow service executes refund
  Platform absorbs loss if seller has no funds
```

### Buyer Protection Policy Engine

```
Auto-resolve conditions (no human needed):
  1. Order status = DELIVERED + tracking confirms delivery
     + buyer claims "item not received"
     -> Reject claim automatically (seller wins)

  2. Order status = SHIPPED but carrier shows "lost"
     -> Auto-refund buyer + charge back seller

  3. Seller no response within 3 days
     -> Auto-resolve in buyer's favor

Escalation triggers:
  - Dispute value > $500
  - Buyer/seller both submit contradicting photos
  - Repeat claimant (>2 disputes in 90 days)
  - Seller dispute rate > 5% of orders
```

---

## 13. Deep Dive: Messaging System

### Architecture

```
+------------------+      WebSocket       +------------------+
|   Buyer Client   |<------------------->|  Messaging       |
+------------------+                     |  Service         |
                                         |  (Node.js)       |
+------------------+      WebSocket       +--------+---------+
|  Seller Client   |<------------------->|        |          |
+------------------+                     |  Redis Pub/Sub   |
                                         |  (fan-out per    |
                                         |   conversation)  |
                                         +--------+---------+
                                                  |
                                          +-------v-------+
                                          | Messages DB   |
                                          | (PostgreSQL)  |
                                          +---------------+
                                                  |
                                          +-------v-------+
                                          | PII Redaction |
                                          | Service       |
                                          +---------------+
```

### PII Redaction

Messages are scanned before storage to prevent buyers and sellers from exchanging contact info and completing transactions off-platform (fee avoidance).

```
Redaction patterns (regex + NLP):
  - Phone numbers: \+?[0-9]{7,15}  -> [PHONE REDACTED]
  - Email addresses: standard email regex -> [EMAIL REDACTED]
  - Social handles: @username patterns (context-aware)
  - Venmo/PayPal/Zelle references -> [PAYMENT INFO REDACTED]
  - URLs to competitor platforms

Implementation:
  1. Message submitted by client
  2. Scan against redaction rules (< 5ms, synchronous)
  3. Original stored in messages.content (encrypted at rest)
  4. Redacted version stored in messages.redacted_content
  5. Client receives redacted version
  6. Support agents can view original (audit log required)
```

---

## 14. Deep Dive: Seller Analytics

### Analytics Architecture

```
Event Sources:
  - Listing viewed         (page impression)
  - Listing clicked        (from search)
  - Add to watchlist
  - Message sent to seller
  - Order placed
  - Order completed
  - Review left

Event flow:
  Client SDK
      |
      v
  Kafka (analytics-events topic)
      |
      v
  Flink streaming processor
  - Sessionization (30-min window)
  - Funnel computation
  - Real-time aggregation
      |
      +---> ClickHouse (OLAP, raw events + pre-aggregated)
      +---> Redis (real-time counters: views/hour)
      |
      v
  Seller Dashboard API
  (reads from ClickHouse for historical, Redis for real-time)
```

### Key Metrics Computation

```sql
-- Conversion funnel for seller
SELECT
  listing_id,
  COUNT(CASE WHEN event_type = 'VIEWED'         THEN 1 END) AS views,
  COUNT(CASE WHEN event_type = 'CLICKED'        THEN 1 END) AS clicks,
  COUNT(CASE WHEN event_type = 'WATCHLISTED'    THEN 1 END) AS watchlists,
  COUNT(CASE WHEN event_type = 'ORDER_PLACED'   THEN 1 END) AS orders,
  ROUND(COUNT(CASE WHEN event_type = 'ORDER_PLACED' THEN 1 END)::numeric
      / NULLIF(COUNT(CASE WHEN event_type = 'VIEWED' THEN 1 END), 0) * 100, 2)
    AS conversion_rate_pct
FROM listing_events
WHERE seller_id = $1
  AND event_time >= NOW() - INTERVAL '30 days'
GROUP BY listing_id
ORDER BY views DESC;
```

---

## 15. Deep Dive: Multi-Currency and Cross-Border

### Architecture

```
Currency flows:
  Buyer pays in USD
  Seller receives in EUR

  Exchange rate source: European Central Bank daily rates
                        (updated at 00:00 UTC)
  Platform uses mid-market rate + 0.5% FX spread

  Orders table stores:
    currency     = 'USD'    (buyer's currency)
    exchange_rate = 1.08200  (at time of payment)
    item_price   = 100.00   (in USD)
    seller_payout = 82.90    (net USD amount)

  Payout service:
    - Converts seller_payout to seller's preferred currency
    - Uses Stripe multi-currency payouts or Wise for international ACH
    - Locks exchange rate at order creation (rate risk held by platform)
```

### Cross-Border Compliance

```
Requirements per transaction:
  1. Export controls: check HS code of item category against
     destination country export restrictions (ECCN list)
  2. Import duty estimation: provide buyer estimated duty at checkout
     using Avalara / TaxJar API
  3. VAT/GST: collect and remit for EU (OSS scheme), UK (VAT MOSS)
  4. Sanctions screening: check buyer + seller against OFAC, EU, UN lists

Implementation:
  TaxService.calculateDuties(listingId, buyerCountry, sellerCountry)
    -> { estimatedDuty, vatAmount, requiresCustomsDeclaration }
  Displayed as informational at checkout; buyer assumes duty responsibility
```

---

## 16. Deep Dive: Cold Start Problem

### Supply Bootstrapping

```
Phase 1: Seed Supply (Month 0-3)
  - Scrape/import listings from partner platforms (with consent)
  - Invite existing sellers from adjacent platforms (eBay exporters)
  - Zero seller fees for first 90 days
  - White-glove onboarding for top-50 sellers in target category
  - Guaranteed minimum: platform buys back unsold inventory

Phase 2: Organic Growth (Month 3-12)
  - SEO: each listing page is a Google-indexable URL
    /listings/{id}/{slug} -> drives organic discovery
  - Referral program: existing sellers earn 5% of referred seller GMV
  - Category expansion: prioritize categories with highest search volume
    but lowest competition on existing platforms

Phase 3: Network Effects (Month 12+)
  - Seller analytics drives reinvestment (data advantage)
  - Cross-sell: buyers become sellers (user-generated supply)
  - Brand partnerships: exclusive inventory on platform
```

### Demand Bootstrapping

```
Tactics:
  1. Paid search (Google Shopping): high intent, measurable CPA
  2. Price comparison: list on Google Shopping, PriceGrabber
  3. Social proof: curated collections, editorial content, buyer guides
  4. Influencer seeding: send products to micro-influencers in niche
  5. Price-match guarantee for first purchase: absorb margin to hook buyer

Cold Start for New Category:
  - Temporarily lower quality thresholds to allow more supply in
  - Run category-specific promotions (free shipping in category)
  - Show "coming soon" waitlist for high-demand items not yet listed
  - Partner with 1-2 anchor brands for exclusive launches
```

---

## 17. Scaling Strategy

### Service-Level Scaling

```
+------------------------------------------+
| Service        | Scaling Approach         |
|----------------|--------------------------|
| Search         | Elasticsearch cluster    |
|                | 3 master + 12 data nodes |
|                | Read replicas per shard  |
|                | Redis cache for hot queries|
|----------------|--------------------------|
| Listing writes | PostgreSQL primary-replica|
|                | Read replicas for reads  |
|                | Connection pooling PgBouncer|
|----------------|--------------------------|
| Transaction    | Strong consistency:       |
|                | Single-region write       |
|                | Multi-region read replicas|
|                | Saga pattern for rollback |
|----------------|--------------------------|
| Messaging      | Redis cluster (Pub/Sub)   |
|                | WebSocket servers autoscale|
|                | Message DB sharded by     |
|                | conversation_id hash      |
|----------------|--------------------------|
| Analytics      | Kafka + Flink stream     |
|                | ClickHouse cluster        |
|                | Pre-aggregated daily views|
+------------------------------------------+
```

### Caching Strategy

```
Layer 1: CDN (CloudFront)
  - Listing detail pages (static HTML, cache 5 min)
  - Product images (cache 30 days, cache-busted on update)
  - Category tree (cache 1 hour)

Layer 2: Application Cache (Redis)
  - Search results for popular queries: TTL 60s
  - User session data: TTL 24h
  - Seller profile: TTL 10 min
  - Exchange rates: TTL 1 hour
  - Listing view counters: Increment in Redis, flush to DB every 1 min

Layer 3: DB Read Replicas
  - Non-critical reads routed to replicas
  - Lag tolerance: < 100ms for listing reads; 0ms for payments
```

### Database Sharding Plan

```
Phase 1 (0-50M listings): Single PostgreSQL primary + read replicas
Phase 2 (50M-500M listings):
  - Shard listings table by category_id % N_SHARDS
  - Hot categories get dedicated shards
  - Cross-shard search queries routed via Elasticsearch (never direct DB)

Phase 3 (500M+ listings):
  - Separate OLTP (PostgreSQL, sharded) from OLAP (ClickHouse)
  - Event sourcing for orders: append-only order_events table
  - CQRS: separate read models for seller analytics
```

---

## 18. Trade-offs

| Decision | Option A | Option B | Choice | Reason |
|----------|----------|----------|--------|--------|
| Search consistency | Strong (DB read) | Eventual (Elasticsearch) | Eventual | 500ms lag acceptable; ES provides better full-text and ranking |
| Escrow model | Bank escrow account per order | Virtual ledger (pooled account) | Virtual ledger | Cheaper, faster; real bank escrow is slow and costly |
| Review reveal | Immediate publish | Simultaneous bilateral reveal | Bilateral reveal | Prevents retaliation; Airbnb research shows higher quality reviews |
| Payment gateway | Build in-house | Third-party (Stripe) | Third-party | PCI DSS compliance burden; time-to-market; Stripe handles 3DS, fraud |
| Messaging storage | Kafka (event log) | PostgreSQL (relational) | PostgreSQL | Low message volume; conversation threading easier with relational model |
| Fraud detection | Rules-only | ML model + rules | ML + rules | Rules handle known patterns fast; ML catches novel fraud patterns |
| Search ranking | Pure relevance | Relevance + business metrics | Hybrid | Pure relevance ignores listing quality; pure business metrics kills UX |
| Multi-currency FX rate lock | At payment time | At order creation | At payment time | Rate locked when money moves; avoids rate staleness window |

---

## 19. Common Interview Follow-ups

**Q: How do you prevent a seller from accepting the same order twice (double-sell)?**

A: For fixed-quantity listings, use optimistic locking on the inventory field:

```sql
UPDATE listings
SET quantity = quantity - :requested_qty,
    updated_at = NOW()
WHERE id = :listing_id
  AND quantity >= :requested_qty  -- guard
  AND status = 'ACTIVE'
RETURNING id;
-- If 0 rows updated: inventory gone, reject order
```

For auctions or high-contention items: use Redis `DECRBY listings:qty:{id} 1` atomically as a fast check before DB write.

---

**Q: How do you handle a payment succeeding but order creation failing (partial failure)?**

A: Use idempotency keys and the saga pattern:

```
1. Generate idempotency_key (UUID) on client before payment
2. Create order record with status=CREATED first
3. Initiate payment with idempotency_key
4. On payment webhook success: update order to PAID
5. If step 2 or 4 fails: compensating transaction refunds payment

Saga compensation:
  - If DB write fails after payment: schedule async refund job
  - Idempotency key stored in Redis prevents double-charge on retry
  - Dead letter queue for failed compensations; ops alert + manual review
```

---

**Q: How do you handle the cold start problem for recommendations?**

A: Use a tiered fallback strategy:

```
New user (0 purchases):
  -> Trending listings in their browsed category (popularity-based)
  -> Geographically relevant listings (IP-based)

Warm user (1-5 purchases):
  -> Item-based collaborative filtering on purchase history
  -> "Customers also bought" from same sellers

Mature user (5+ purchases):
  -> User-item matrix factorization (ALS or two-tower neural model)
  -> Personalized re-ranking of search results
  -> Serendipity injection: 10% explore budget for novel categories
```

---

**Q: How do you scale the messaging system to millions of concurrent connections?**

A: Use a horizontally scalable WebSocket tier backed by Redis Pub/Sub:

```
WebSocket servers (stateless, 10K connections each):
  - Each server subscribes to Redis channels for connected users
  - When a message is sent: publish to Redis channel conversation:{id}
  - All WebSocket servers subscribed to that channel forward to client
  - Redis Cluster handles Pub/Sub fan-out (N servers subscribe)

Scalability:
  - 10M active users / 10K connections per server = 1,000 WS servers
  - Redis Pub/Sub throughput: ~100K messages/sec per cluster
  - At 5M msgs/day = ~58 msgs/sec: well within single Redis cluster
```

---

**Q: How do you detect and handle listing price manipulation (e.g., seller raises price after order)?**

A: Price is snapshotted at order creation:

```sql
orders.item_price  -- price at time of purchase (immutable after PAID)
orders.listing_id  -- reference to listing (listing price may change)
```

The order price is locked when the buyer initiates checkout. The listing's current price is irrelevant once an order is created. Price history is tracked in a `listing_price_history` table for audit purposes.

---

**Q: How do you handle tax collection across 50 US states and international?**

A: Integrate a dedicated tax engine (Avalara TaxJar):

```
1. At checkout: call TaxService.calculate(buyerAddress, sellerAddress, items)
   -> Returns { taxAmount, jurisdictions: [...], breakdown }
2. Tax collected from buyer, held separately in tax escrow
3. Monthly batch: TaxService.remit(period) -> file returns with each jurisdiction
4. EU VAT: register for OSS (One-Stop-Shop) scheme, collect VAT at point of sale
5. Store tax_line_items table with each order for 7-year retention (audit)
```

---

**Q: How would you design the promoted listings auction system?**

A: Use a second-price auction (Vickrey auction) with quality score adjustment:

```
Effective CPM bid = seller_bid * quality_score

Seller A bids $2.00, quality = 0.9 -> effective = $1.80
Seller B bids $1.50, quality = 1.0 -> effective = $1.50
Seller C bids $1.80, quality = 0.8 -> effective = $1.44

Winner: Seller A (effective $1.80)
Price charged: second-price = $1.50 (Seller B's bid) + $0.01

Implementation:
  - Bids stored in Redis sorted set: ZADD promoted:cat:{id} score sellerListingId
  - Top-K extraction: ZREVRANGE promoted:cat:{id} 0 2
  - Auction runs at query time (<5ms) using pre-indexed effective scores
  - Scores recomputed when seller updates bid or quality score changes
```

---

**Q: What happens when the platform goes down during an active transaction?**

A: Design for at-least-once delivery with idempotency at every step:

```
Failure modes and recovery:
  1. Client timeout after POST /orders (no response)
     -> Client retries with same idempotency_key
     -> Server returns cached response if order was created
     -> Server creates fresh order if key not found

  2. Payment webhook missed
     -> Stripe retries webhooks with exponential backoff (72h window)
     -> Platform also polls Stripe for unresolved PaymentIntents (hourly job)

  3. Escrow service down after payment
     -> Payment succeeded but escrow not created
     -> Reconciliation job: for every PAID order with no escrow record,
        create escrow record (idempotent insert with payment_intent_id)

  4. Payout service down
     -> Payout record stays in PENDING state
     -> Retry job processes PENDING payouts on recovery
     -> Seller sees "payout delayed" status in dashboard
```
