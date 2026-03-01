# Design an Ad Serving & Real-Time Bidding System (Google Ads / Meta Ads)

---

## 1. Requirements Clarification

### Functional Requirements

| # | Requirement | Description |
|---|-------------|-------------|
| 1 | Ad Request Serving | Publishers send ad requests; system returns the winning ad creative within latency budget |
| 2 | Real-Time Bidding (RTB) | Run OpenRTB auction among DSPs in < 80ms, select winning bid, serve creative |
| 3 | Ad Targeting | Match ads to users via contextual, behavioral, demographic, retargeting, and lookalike signals |
| 4 | CTR Prediction | Predict click-through rate for each candidate ad using ML models |
| 5 | Auction Engine | Support first-price and second-price auctions; enforce floors and reserve prices |
| 6 | Frequency Capping | Limit impressions per user per ad/campaign within rolling time windows |
| 7 | Budget Pacing | Distribute advertiser spend evenly over campaign flight dates; prevent over-spend |
| 8 | Click & Impression Tracking | Record impressions and clicks with zero loss; support viewability measurement |
| 9 | Attribution | Attribute conversions to ad touchpoints (last-click, first-click, multi-touch, view-through) |
| 10 | Fraud Detection | Detect and filter click fraud, bot traffic, and invalid traffic (IVT) in real time |
| 11 | Privacy Compliance | Enforce GDPR consent signals, CCPA opt-out, and Apple ATT opt-in before targeting |
| 12 | Reporting & Analytics | Near-real-time spend, impression, click, and conversion dashboards for advertisers |
| 13 | Ad Creative Management | Upload, review, and serve display, video, and native creatives via CDN |
| 14 | Campaign Management | CRUD for campaigns, ad groups, ads, budgets, targeting rules, and bid strategies |

### Non-Functional Requirements

| # | Requirement | Target |
|---|-------------|--------|
| 1 | Ad serving latency | < 100ms end-to-end (p99) |
| 2 | RTB auction latency | < 80ms (leaving headroom for creative serving) |
| 3 | Availability | 99.99% (< 52 minutes downtime/year) |
| 4 | Throughput | 1M+ ad requests/sec at peak |
| 5 | Click tracking durability | Zero loss — at-least-once delivery with dedup |
| 6 | Consistency for budget | Eventual consistency acceptable (< 1% over-spend tolerated) |
| 7 | Fraud filtering latency | < 10ms inline in the serving path |
| 8 | Attribution pipeline lag | < 15 minutes for near-real-time, < 24h for finalized |
| 9 | Data retention | Raw events 90 days hot, 7 years cold archive |
| 10 | Privacy | No PII stored without valid consent; data anonymized post-30 days |

### Scale Estimation

```
Ad Requests:          10,000,000,000 (10B) / day
Requests per second:  10B / 86,400 = ~115,000 req/s average
Peak (3x average):    ~350,000 req/s
Absolute peak:        1,000,000 req/s (holiday campaigns)

RTB Auctions:         ~60% of requests go to open RTB = 6B auctions/day
DSPs per auction:     ~50 average
Bid responses:        6B * 50 = 300B bid responses/day — most filtered at DSP timeout

Impressions:          10B/day
Clicks:               ~0.1% CTR avg = 10M clicks/day = 116 clicks/sec
Conversions:          ~2% of clicks = 200K conversions/day

Clickstream storage:
  Impression event:   ~500 bytes
  Click event:        ~200 bytes
  10B impressions:    10B * 500B = 5 TB/day raw events
  With replicas:      ~15 TB/day ingested
  500 TB/day budget   covers raw + processed + aggregated layers

User profiles (behavioral):
  1B users * 10 KB profile = 10 PB total
  Hot working set (30-day active):  ~100M users * 10 KB = 1 TB in-memory
  Profile update rate:  100M events/min → ~1.7M writes/sec

Creative assets:
  10M publisher pages, 1M advertisers
  ~50M active creatives
  Average size: 50 KB display, 5 MB video thumbnail
  Total creative storage: ~50M * 50KB = 2.5 TB (display); video at CDN edge

Ad metadata (campaigns, targeting rules):
  1M advertisers * 100 campaigns avg = 100M campaign records
  Each record ~5 KB → 500 GB total campaign metadata
```

---

## 2. Ad Tech Ecosystem

### Participants and Roles

```
+------------------+         +------------------+         +------------------+
|   ADVERTISER     |         |    AD EXCHANGE   |         |    PUBLISHER     |
|                  |         |                  |         |                  |
| Wants to show    |         | Marketplace that |         | Website/App that |
| ads to users     |         | runs RTB auction |         | sells ad space   |
|                  |         |                  |         |                  |
| Uses DSP to bid  |         | Connects DSPs    |         | Uses SSP to sell |
+--------+---------+         | and SSPs         |         +--------+---------+
         |                   +--------+---------+                  |
         |                            |                            |
         v                            |                            v
+--------+---------+         +--------+---------+         +--------+---------+
|       DSP        |         |       DMP        |         |       SSP        |
| (Demand-Side     |         | (Data Management |         | (Supply-Side     |
|  Platform)       |         |  Platform)       |         |  Platform)       |
|                  |         |                  |         |                  |
| Places bids on   |         | Aggregates user  |         | Manages inventory|
| behalf of        |         | data, segments,  |         | yield for        |
| advertisers      |         | lookalike models |         | publishers       |
+------------------+         +------------------+         +------------------+
```

### Full RTB Flow

```
  Publisher Page                                          Advertiser
       |                                                       |
       | 1. Ad slot loads                                      |
       v                                                       |
  [SSP / Ad Tag]                                              |
       |                                                       |
       | 2. Bid request (OpenRTB)                             |
       v                                                       |
  [Ad Exchange]                                               |
       |  3. Fan out to N DSPs (parallel, < 80ms timeout)     |
       |-----------------------------------------------------> |
       |                                                  [DSP]|
       |                                                       |
       |  4. Bid responses (or no-bid)                        |
       |<----------------------------------------------------- |
       |                                                       |
       | 5. Run auction (select winner)                        |
       |                                                       |
       | 6. Win notice to winning DSP                         |
       |-----------------------------------------------------> |
       |                                                       |
       | 7. Creative URL / markup returned to publisher        |
       v                                                       |
  [Browser renders ad]                                        |
       |                                                       |
       | 8. Impression beacon fired                           |
       | 9. Click tracked if user clicks                      |
       | 10. Conversion tracked on advertiser site            |
```

---

## 3. API Design

### Publisher Ad Request API

```
POST /v1/ad/request
Content-Type: application/json

Request:
{
  "request_id": "req_abc123",
  "publisher_id": "pub_789",
  "page_url": "https://example.com/article/tech",
  "page_categories": ["IAB19", "IAB19-3"],
  "ad_slots": [
    {
      "slot_id": "div-slot-1",
      "width": 728,
      "height": 90,
      "position": "above_fold",
      "floor_price_cpm": 0.50
    }
  ],
  "user": {
    "id": "user_hashed_id",
    "ip": "203.0.113.x",
    "user_agent": "Mozilla/5.0...",
    "consent": { "gdpr": true, "ccpa_opt_out": false }
  },
  "geo": { "country": "US", "region": "CA", "dma": "807" },
  "device": { "type": "desktop", "os": "macOS", "browser": "Chrome" }
}

Response (200 OK):
{
  "request_id": "req_abc123",
  "ads": [
    {
      "slot_id": "div-slot-1",
      "ad_id": "ad_xyz456",
      "creative_url": "https://cdn.adserver.com/creatives/ad_xyz456.html",
      "impression_url": "https://track.adserver.com/imp?id=imp_789&token=...",
      "click_url": "https://track.adserver.com/clk?id=imp_789&token=...",
      "width": 728,
      "height": 90,
      "ad_type": "display"
    }
  ],
  "latency_ms": 47
}
```

### OpenRTB Bid Request (Ad Exchange → DSP)

```
POST /rtb/bid
Content-Type: application/json

{
  "id": "auction_abc123",
  "imp": [
    {
      "id": "1",
      "banner": { "w": 728, "h": 90, "pos": 1 },
      "bidfloor": 0.50,
      "bidfloorcur": "USD"
    }
  ],
  "site": {
    "id": "site_789",
    "page": "https://example.com/article/tech",
    "cat": ["IAB19"],
    "publisher": { "id": "pub_789" }
  },
  "user": {
    "id": "user_hashed_id",
    "buyeruid": "buyer_specific_uid",
    "data": [{ "id": "dmp_segment", "segment": [{ "id": "seg_tech_enthusiast" }] }]
  },
  "device": {
    "ip": "203.0.113.x",
    "ua": "Mozilla/5.0...",
    "devicetype": 2,
    "os": "macOS"
  },
  "tmax": 80,
  "cur": ["USD"]
}
```

### OpenRTB Bid Response (DSP → Ad Exchange)

```
{
  "id": "auction_abc123",
  "seatbid": [
    {
      "bid": [
        {
          "id": "bid_dsp_001",
          "impid": "1",
          "price": 2.35,
          "adid": "creative_567",
          "adm": "<div>...</div>",
          "adomain": ["advertiser.com"],
          "crid": "creative_567",
          "w": 728,
          "h": 90
        }
      ],
      "seat": "dsp_buyer_001"
    }
  ],
  "cur": "USD"
}
```

### Campaign Management API

```
POST   /v1/campaigns                        Create campaign
GET    /v1/campaigns/{id}                   Get campaign details
PUT    /v1/campaigns/{id}                   Update campaign
DELETE /v1/campaigns/{id}                   Pause/archive campaign

POST   /v1/campaigns/{id}/ad-groups         Create ad group with targeting
GET    /v1/campaigns/{id}/ad-groups
PUT    /v1/campaigns/{id}/ad-groups/{agId}

POST   /v1/ad-groups/{id}/ads               Create ad creative
GET    /v1/ad-groups/{id}/ads

POST   /v1/campaigns/{id}/budgets           Set/update budget
GET    /v1/advertisers/{id}/spend?date=     Query current spend
```

### Tracking & Attribution API

```
GET  /imp?id={imp_id}&token={token}         Impression beacon (1x1 pixel or redirect)
GET  /clk?id={imp_id}&token={token}         Click redirect and tracking
POST /v1/conversions                        Server-side conversion postback

POST /v1/attributions/query                 Query attribution report
     Body: { advertiser_id, date_range, model: "last_click" | "linear" | "time_decay" }

GET  /v1/reports/campaigns/{id}?metrics=impressions,clicks,spend,conversions&granularity=hourly
```

---

## 4. Data Model

### Campaign and Ad Hierarchy

```sql
CREATE TABLE advertisers (
    advertiser_id   BIGINT PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    status          ENUM('active','paused','suspended') DEFAULT 'active',
    billing_type    ENUM('prepaid','postpaid'),
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE campaigns (
    campaign_id     BIGINT PRIMARY KEY,
    advertiser_id   BIGINT NOT NULL REFERENCES advertisers(advertiser_id),
    name            VARCHAR(255) NOT NULL,
    status          ENUM('draft','active','paused','completed','archived') DEFAULT 'draft',
    campaign_type   ENUM('display','video','native','search'),
    budget_daily    DECIMAL(18,6),               -- USD
    budget_total    DECIMAL(18,6),
    spend_today     DECIMAL(18,6) DEFAULT 0,
    spend_total     DECIMAL(18,6) DEFAULT 0,
    start_date      DATE NOT NULL,
    end_date        DATE,
    bidding_strategy ENUM('cpm','cpc','cpa','target_roas'),
    target_bid      DECIMAL(10,6),
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE ad_groups (
    ad_group_id     BIGINT PRIMARY KEY,
    campaign_id     BIGINT NOT NULL REFERENCES campaigns(campaign_id),
    name            VARCHAR(255),
    status          ENUM('active','paused','archived'),
    -- Targeting
    geo_targets     JSON,                        -- [{"country":"US","region":"CA"}]
    device_targets  JSON,                        -- ["desktop","mobile"]
    age_targets     JSON,                        -- [{"min":25,"max":34}]
    gender_targets  JSON,                        -- ["M","F","U"]
    interest_segments JSON,                      -- DMP segment IDs
    keyword_targets JSON,                        -- Contextual keywords
    retargeting_list_id BIGINT,
    -- Frequency cap
    freq_cap_impressions INT DEFAULT 10,
    freq_cap_window     ENUM('hour','day','week','lifetime') DEFAULT 'day',
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE ads (
    ad_id           BIGINT PRIMARY KEY,
    ad_group_id     BIGINT NOT NULL REFERENCES ad_groups(ad_group_id),
    creative_id     BIGINT NOT NULL REFERENCES creatives(creative_id),
    status          ENUM('pending_review','active','paused','rejected','archived'),
    bid_override    DECIMAL(10,6),               -- Overrides ad group bid if set
    quality_score   DECIMAL(4,3),                -- 0.000-1.000, updated daily
    predicted_ctr   DECIMAL(6,5),                -- 0.00000-0.99999
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE creatives (
    creative_id     BIGINT PRIMARY KEY,
    advertiser_id   BIGINT NOT NULL,
    name            VARCHAR(255),
    creative_type   ENUM('display','video','native','html5'),
    width           INT,
    height          INT,
    asset_url       VARCHAR(2048),               -- CDN URL
    click_through_url VARCHAR(2048),
    duration_sec    INT,                         -- For video
    status          ENUM('pending_review','approved','rejected'),
    review_notes    TEXT,
    created_at      TIMESTAMP DEFAULT NOW()
);
```

### Impression and Click Events (Clickhouse / columnar)

```sql
-- Stored in Clickhouse (columnar) for analytics
CREATE TABLE impression_events (
    impression_id   UUID,
    request_id      String,
    ad_id           Int64,
    campaign_id     Int64,
    advertiser_id   Int64,
    publisher_id    Int64,
    slot_id         String,
    user_id         String,              -- hashed/pseudonymous
    auction_price   Decimal(10,6),       -- clearing price in CPM
    bid_price       Decimal(10,6),
    ecpm            Decimal(10,6),
    page_url        String,
    page_categories Array(String),
    geo_country     String,
    geo_region      String,
    device_type     LowCardinality(String),
    os              LowCardinality(String),
    browser         LowCardinality(String),
    is_viewable     UInt8 DEFAULT 0,     -- set by viewability beacon
    is_fraud        UInt8 DEFAULT 0,
    event_time      DateTime,
    date            Date MATERIALIZED toDate(event_time)
) ENGINE = MergeTree()
  PARTITION BY date
  ORDER BY (advertiser_id, campaign_id, event_time)
  TTL date + INTERVAL 90 DAY;

CREATE TABLE click_events (
    click_id        UUID,
    impression_id   UUID,
    ad_id           Int64,
    campaign_id     Int64,
    advertiser_id   Int64,
    user_id         String,
    publisher_id    Int64,
    click_url       String,
    landing_url     String,
    is_fraud        UInt8 DEFAULT 0,
    time_to_click_sec Float32,
    event_time      DateTime,
    date            Date MATERIALIZED toDate(event_time)
) ENGINE = MergeTree()
  PARTITION BY date
  ORDER BY (advertiser_id, campaign_id, event_time);

CREATE TABLE conversion_events (
    conversion_id   UUID,
    click_id        UUID,              -- linked to click for last-click
    impression_id   UUID,              -- for view-through
    advertiser_id   Int64,
    campaign_id     Int64,
    conversion_type String,            -- 'purchase', 'signup', 'lead'
    revenue         Decimal(18,6),
    currency        FixedString(3),
    event_time      DateTime,
    date            Date MATERIALIZED toDate(event_time)
) ENGINE = MergeTree()
  PARTITION BY date
  ORDER BY (advertiser_id, campaign_id, event_time);
```

### User Profile Store (Redis / Aerospike)

```
Key:   user:{user_id}:profile
Value: {
  "segments":    ["seg_tech", "seg_auto_intender", "seg_18-34"],
  "interests":   ["electronics", "travel", "sports"],
  "retarget_ads": ["adv_123:campaign_456"],       -- ads seen in last 30 days
  "freq_caps":   {
    "campaign_789": { "day": 3, "week": 10 },
    "campaign_012": { "day": 1, "week": 5 }
  },
  "last_seen":   1706745600,
  "consent":     { "gdpr": true, "ccpa_opt_out": false }
}
TTL: 30 days (rolling)
```

### Budget Pacing State (Redis)

```
Key:   budget:campaign:{campaign_id}:day:{YYYYMMDD}
Value: { "spend": 4523.45, "impressions": 1200000, "updated_at": ... }
TTL:   48 hours

Key:   budget:campaign:{campaign_id}:total
Value: { "spend": 98234.12, "impressions": 25000000 }
```

---

## 5. High-Level Architecture

```
                         +-----------------------+
                         |   Publisher / Browser |
                         +-----------+-----------+
                                     |
                              Ad Request (HTTP)
                                     |
                         +-----------v-----------+
                         |    Load Balancer /    |
                         |    Edge (Anycast)     |
                         +-----------+-----------+
                                     |
                  +------------------+------------------+
                  |                                     |
      +-----------v-----------+           +------------v-----------+
      |   Ad Serving API      |           |  RTB Gateway           |
      |   (Stateless)         |           |  (Fan-out to DSPs)     |
      |   - Auth, consent     |           |  - OpenRTB protocol    |
      |   - Rate limiting     |           |  - Timeout: 80ms       |
      +----+----------+-------+           +------------+-----------+
           |          |                                |
           |          |                    +-----------v-----------+
           |          |                    |   Auction Engine      |
           |          |                    |   - 1st / 2nd price  |
           |          |                    |   - Floor enforcement |
           |          |                    +----------+------------+
           |          |                               |
  +--------v---+  +---v--------+           +----------v-----------+
  | Targeting  |  | CTR/Rank   |           |  Win Notice Service  |
  | Service    |  | Predictor  |           |  - Billing event     |
  |            |  |            |           |  - Creative URL      |
  | - Segment  |  | - ML model |           +----------+-----------+
  |   lookup   |  | - Feature  |                      |
  | - Freq cap |  |   eng.     |             [Winning DSP]
  | - Consent  |  +------------+
  +--------+---+
           |
  +--------v---+
  | Candidate  |
  | Ad Fetcher |
  | (Index)    |
  +------------+

Shared Services:
  +--------------------+     +--------------------+     +--------------------+
  |  User Profile      |     |  Budget Pacing     |     |  Creative CDN      |
  |  Store (Aerospike) |     |  Service (Redis)   |     |  (CloudFront/S3)   |
  +--------------------+     +--------------------+     +--------------------+

Tracking Pipeline:
  +--------------------+     +--------------------+     +--------------------+
  |  Impression /      |     |  Kafka             |     |  Clickhouse        |
  |  Click Tracker     +---->|  (Event Bus)       +---->|  (Analytics DB)    |
  +--------------------+     +--------------------+     +--------------------+
                                        |
                              +---------v---------+
                              |  Attribution &    |
                              |  Fraud Pipeline   |
                              |  (Flink/Spark)    |
                              +-------------------+
```

---

## 6. Deep Dive: Ad Serving Pipeline

### End-to-End Request Flow (< 100ms budget)

```
t=0ms    Publisher sends ad request
          |
t=1ms    Edge PoP receives request, TLS terminates locally
          |
t=2ms    Auth + consent check (Redis lookup)
          |
t=5ms    User profile enrichment (Aerospike: segments, freq caps)
          |
t=8ms    Candidate ad retrieval from inverted index
          | - Filter by: geo, device, IAB category, budget active
          | - ~1000 candidates fetched in < 5ms
          |
t=15ms   Frequency cap filter (Redis bitfield check)
          | - Drop ads that exceeded cap
          | - ~500 candidates remain
          |
t=20ms   CTR prediction (batch inference on 500 candidates)
          | - Feature vector assembly
          | - Model inference (ONNX runtime, GPU batch)
          | - ~200ms would be too slow → pre-cached scores + delta
          |
t=30ms   eCPM ranking
          | eCPM = bid * predicted_CTR * quality_score
          | Select top-K ads (K=5 for fallback)
          |
t=35ms   Budget pacing check
          | - Is campaign within pacing budget? (probabilistic check)
          | - Throttle probability = remaining_budget / expected_remaining_spend
          |
t=40ms   Direct-sold ad auction (if applicable)
          |
t=50ms   RTB auction starts (parallel to direct check)
         [See RTB Deep Dive]
          |
t=120ms  ** RISK: RTB can push past 100ms **
         Solution: RTB timeout at 80ms; fallback to house ad if no winner
          |
t=85ms   Winner selected, creative URL assembled
          |
t=95ms   Response returned to publisher
          |
t=100ms  Browser begins rendering creative
```

### Ad Candidate Index

The candidate retrieval step uses an **inverted index** (similar to a search engine) that maps targeting criteria to ad IDs:

```
+-------------------------+      +--------------------------+
|  Ad Index (in-memory)   |      |   Targeting Dimensions   |
|                         |      |                          |
| geo:US:CA -> [ad1, ad5] |      | geo, device, os,         |
| cat:IAB19 -> [ad2, ad5] |      | browser, IAB category,   |
| dev:mobile -> [ad3, ad5]|      | age, gender, language,   |
| seg:tech  -> [ad2, ad4] |      | keyword (contextual),    |
|   ...                   |      | retargeting list         |
+-------------------------+      +--------------------------+
```

The index is partitioned by publisher and rebuilt from database every 5 minutes. Hot data fits in ~100 GB RAM per serving node.

---

## 7. Deep Dive: Real-Time Bidding (RTB)

### OpenRTB Protocol Overview

The **OpenRTB** spec (IAB Tech Lab) standardizes the bid request/response format between ad exchanges and DSPs. Version 2.6 is the current standard.

```
Key fields in Bid Request:
  imp[]        - impression objects (size, floor, ad type)
  site/app     - publisher context
  user         - user signals (hashed ID, segments, consent)
  device       - device signals (IP, UA, OS)
  tmax         - max response time in ms (e.g., 80)

Key fields in Bid Response:
  seatbid[].bid[].price   - CPM bid in USD
  seatbid[].bid[].adm     - ad markup (HTML/VAST)
  seatbid[].bid[].adomain - advertiser domain (for brand safety)
  seatbid[].bid[].crid    - creative ID for dedup
```

### RTB Auction Architecture

```
   Ad Exchange
        |
        | Fan-out (parallel HTTP/2 to all registered DSPs)
        |
   +----+----+----+----+----+
   |    |    |    |    |    |
  DSP  DSP  DSP  DSP  DSP  ...  (50-200 DSPs)
   |    |    |    |    |    |
   +----+----+----+----+----+
        |
        | Collect responses (80ms hard timeout)
        |
   +----v----+
   | Auction |   <- Filter: floor price, brand safety, ad quality
   | Engine  |   <- Select winner (1st or 2nd price)
   +----+----+
        |
   +----+--------+----------+
   |             |          |
   v             v          v
Win Notice  Loss Notice  Billing
(to winner) (optional,   Event
            to losers)
```

### Timeout Handling

DSPs that do not respond within `tmax` (80ms) are treated as no-bid. The exchange must handle:

1. **Partial timeouts**: Some DSPs respond, others time out. Proceed with available bids.
2. **Total timeout**: No DSP responds. Serve house ad or direct-sold fallback.
3. **Invalid responses**: Malformed JSON, bid below floor, prohibited creative. Discard silently.

### Auction Types

**Second-Price Auction (Vickrey):**
```
Bids: [DSP-A: $3.00, DSP-B: $2.50, DSP-C: $1.80]
Winner: DSP-A
Clearing price: $2.50 + $0.01 = $2.51  (second-highest + $0.01)

Properties:
  - Truthful: optimal strategy is to bid true value
  - Publisher revenue < highest bid
  - Dominated programmatic advertising until ~2019
```

**First-Price Auction:**
```
Bids: [DSP-A: $3.00, DSP-B: $2.50, DSP-C: $1.80]
Winner: DSP-A
Clearing price: $3.00  (winner pays their exact bid)

Properties:
  - DSPs shade bids (bid below true value to maximize surplus)
  - Publisher revenue = highest bid (before bid shading)
  - Now dominant in programmatic (Google moved to 1st price in 2019)
  - Requires DSPs to use bid shading algorithms
```

**Header Bidding:**

Header bidding allows publishers to offer inventory to multiple ad exchanges simultaneously (outside the traditional waterfall), increasing competition.

```
Browser
  |
  | 1. Publisher JS (Prebid.js) calls all SSPs simultaneously
  |
  +--SSP-A: bids $2.10
  +--SSP-B: bids $1.80
  +--SSP-C: bids $2.45  <- Winner
  |
  | 2. Best header bid ($2.45) competes against direct-sold floor
  |
  | 3. If header bid > floor, header bid wins
  | 4. If direct-sold exists, direct-sold typically wins
  |
  v
Ad served
```

---

## 8. Deep Dive: Ad Targeting

### Targeting Types

```
+-------------------------+------------------------------------------+
|  Targeting Type         |  Implementation                          |
+-------------------------+------------------------------------------+
| Contextual              | Classify page content (IAB taxonomy)     |
|                         | Match keywords in page text              |
|                         | No user data needed (privacy-safe)       |
+-------------------------+------------------------------------------+
| Behavioral              | User interest segments from browsing     |
|                         | history (cookies / device IDs)           |
|                         | Stored in DMP, refreshed daily          |
+-------------------------+------------------------------------------+
| Demographic             | Age, gender, income (inferred or         |
|                         | declared on social platforms)            |
+-------------------------+------------------------------------------+
| Retargeting             | Users who visited advertiser site        |
|                         | Pixel fires → user added to list         |
|                         | Show follow-up ads on other sites        |
+-------------------------+------------------------------------------+
| Lookalike Audiences     | Find users similar to advertiser's       |
|                         | best customers (ML embedding similarity) |
+-------------------------+------------------------------------------+
| Geolocation             | Country, DMA, city, postal code, radius  |
|                         | IP geolocation or GPS (mobile)           |
+-------------------------+------------------------------------------+
| Device / Browser        | OS, browser, device type, carrier       |
+-------------------------+------------------------------------------+
| Time of Day             | Dayparting (only show ads 9am-5pm)      |
+-------------------------+------------------------------------------+
```

### Retargeting Pixel Flow

```
  Advertiser Website               Ad Server
        |                               |
  [User visits /checkout]               |
        |                               |
  [Retargeting pixel fires]            |
  GET https://px.adserver.com/         |
      pixel?adv=123&page=checkout       |
                                        |
                               [Ad Server] adds user_id
                               to retargeting list 123
                               (Redis SET with TTL 30d)
                                        |
  [User visits publisher site]          |
        |                               |
  [Ad request sent]                    |
        |-----------------------------> |
                               [Check retargeting lists]
                               user IS in list 123 → eligible
                               for advertiser 123's retarget ads
```

### Lookalike Audience Algorithm

```
1. Seed Audience:
   - Advertiser provides "best customer" user list (email hashes)
   - DMP maps to internal user IDs

2. Feature Extraction:
   - For each seed user: extract interest vector (embedding)
   - Dimensions: ~1000 interest features from browsing behavior
   - Normalize to unit sphere

3. Similarity Search (ANN):
   - Use FAISS or ScaNN to find nearest neighbors in embedding space
   - Retrieve top-N% of all users most similar to seed audience
   - N% is configurable by advertiser (1%-20% of addressable audience)

4. Exclusion:
   - Remove seed users from lookalike (no redundant targeting)
   - Remove opted-out users (GDPR/CCPA)
```

---

## 9. Deep Dive: CTR Prediction

### Importance of CTR Prediction

The ad ranking formula is:

```
eCPM = bid_price_cpm * predicted_CTR * quality_score

Where:
  bid_price_cpm   = advertiser's max bid (CPM or derived from CPC)
  predicted_CTR   = P(click | impression context, ad, user)
  quality_score   = relevance/landing page quality (0-1)

Example:
  Ad A: bid=$5.00 CPM, predicted_CTR=0.01, QS=0.8 → eCPM = $0.04
  Ad B: bid=$2.00 CPM, predicted_CTR=0.05, QS=0.9 → eCPM = $0.09
  Ad B wins despite lower bid because higher predicted CTR
```

### Feature Engineering

```
User Features:
  - Demographic: age bucket, gender, income (inferred)
  - Interest segments: [0, 1, 1, 0, ...] (binary, 500 dims)
  - Historical CTR on this ad format
  - Recency of last click
  - Device type, OS, browser

Ad Features:
  - Ad creative ID embedding
  - Historical CTR (base rate)
  - Advertiser domain quality score
  - Creative size and format
  - Landing page quality score

Context Features:
  - Publisher site / app category
  - Page topic embedding
  - Position on page (above_fold, below_fold)
  - Time of day, day of week
  - Ad-User affinity score (user visited advertiser site?)

Cross Features:
  - (user_segment, ad_category) interaction
  - (device_type, ad_format) interaction
  - (time_of_day, user_segment)
```

### Model Architecture

```
Logistic Regression (fast, interpretable):
  - Feature hashing trick (2^24 buckets)
  - Online learning via FTRL-Proximal optimizer
  - Update model every 5 minutes with recent click data
  - Inference latency: ~1ms per ad (can score 500 ads in 2ms with vectorization)

Deep Learning (higher accuracy, higher latency):
  - Architecture: Wide & Deep (Google, 2016), or DLRM (Meta, 2019)
  - Wide: memorization via crossed sparse features (logistic regression)
  - Deep: generalization via embedding layers + MLP
  - Embedding dims: 32-64 per categorical feature
  - Inference: ONNX Runtime + GPU batch scoring → ~10ms for 500 ads

Production Strategy:
  - Use LR model for initial scoring and top-K selection (~1000 → 100)
  - Use DL model for final reranking (100 → top-5)
  - Two-stage reduces DL inference from 500 → 100 candidates (5x savings)
```

### Training Pipeline

```
Raw clickstream (Kafka)
        |
        v
Feature Store (offline)
  - Join impression events with click labels (delayed: 24h window)
  - Negative sampling: sample 1 non-clicked per 1 clicked (1:1 ratio)
  - Feature extraction and vectorization
        |
        v
Training (daily batch)
  - Train on last 7 days of data
  - Validate on held-out day
  - A/B shadow model before promotion
        |
        v
Model Registry (MLflow)
        |
        v
Model Serving (TorchServe / ONNX Runtime)
  - Blue/green deployment (traffic split)
  - Rollback on AUC degradation
```

---

## 10. Deep Dive: Frequency Capping

### Problem Statement

Without frequency caps, a user might see the same ad hundreds of times per day, causing:
- Ad fatigue and negative brand association
- Wasted advertiser budget on incremental exposures
- Poor user experience

### Distributed Frequency Cap Architecture

```
Frequency cap config:  "Campaign 789: max 5 impressions/day/user"

Per ad request:
  1. Look up user's impression count for campaign in Redis
  2. If count >= cap, exclude campaign from auction
  3. If count < cap, include, and atomically increment after impression

Redis data structure:
  Key:   fc:{user_id}:{campaign_id}:{YYYYMMDD}
  Type:  String (integer)
  Cmd:   INCR fc:user123:camp789:20250301
         Returns new count; if > cap, discard impression (but count already incremented)
  TTL:   48 hours (covers current day + next day)

Better approach (atomic check-and-increment):
  Use Lua script for atomicity:

  local key = KEYS[1]
  local cap = tonumber(ARGV[1])
  local current = redis.call('GET', key)
  if current == false then
    redis.call('SET', key, 1, 'EX', 172800)
    return 1  -- allowed, first impression
  elseif tonumber(current) < cap then
    return redis.call('INCR', key)  -- allowed
  else
    return -1  -- capped, reject
  end
```

### Sliding Window Frequency Cap

For "10 impressions per hour" style caps, use Redis sorted sets:

```
Key:   fc_sw:{user_id}:{campaign_id}
Type:  Sorted Set
Score: Unix timestamp in ms
Value: impression_id

Algorithm per impression:
  1. ZADD key {timestamp_ms} {impression_id}
  2. ZREMRANGEBYSCORE key 0 {timestamp_ms - window_ms}  -- evict old
  3. ZCARD key  -- count in window
  4. If count > cap: reject (and ZREM the just-added entry)

Cleanup: Key expires 2 * window duration
```

### Approximate Counting at Scale

For 1B users with 100K campaigns: exact Redis per-user counters are too expensive (1B * 100K = 100T keys). Use tiered approach:

```
Tier 1 (exact, hot users):
  - Store in Redis for users active in last 24h (~100M users)
  - ~100M * (avg 5 campaigns) * 8 bytes = 4 GB per Redis cluster

Tier 2 (probabilistic, all users):
  - Count-Min Sketch per (campaign, time_window)
  - False positive rate ~1% (shows ad when capped) — acceptable
  - Memory: O(campaigns * sketch_width * sketch_depth)
  - For 100K campaigns: 100K * 5000 * 4 bytes = 2 GB
```

---

## 11. Deep Dive: Budget Pacing

### Problem Statement

An advertiser sets a $10,000/day budget. If we serve all budget in the first 2 hours, the campaign is dark for 22 hours, causing poor reach metrics and missed conversions in peak evening hours.

### Pacing Algorithms

**Throttling (Probabilistic Pacing):**

```
Expected hourly spend = daily_budget / 24 hours
Current hour spend tracked in Redis

At each ad request (for this campaign):
  pace_ratio = remaining_budget / expected_remaining_budget

  if pace_ratio >= 1.0:
    always_serve (underpacing, spend faster)
  elif pace_ratio >= 0.8:
    serve with probability = pace_ratio
  else:
    throttle aggressively: serve with probability = pace_ratio^2

Example:
  Budget: $1000/day
  Current time: 12:00 noon (50% of day elapsed)
  Expected spend at noon: $500
  Actual spend: $800 (overpacing)
  pace_ratio = ($1000-$800) / ($1000-$500) = $200/$500 = 0.40
  Serve probability = 0.40^2 = 0.16 (throttle to 16% of requests)
```

**Feedback Control (PID Controller):**

```
Target: spend $X/minute to exhaust budget at end_date
Actual: track actual spend rate (rolling 5-min window)

Error = target_rate - actual_rate

throttle_adjustment = Kp * error + Ki * integral_error + Kd * derivative_error

Where Kp, Ki, Kd are tuned constants.

Advantages: Smooth convergence, handles burst traffic patterns
```

### Budget Pacing Service Architecture

```
+------------------+       +------------------+       +------------------+
|  Ad Serving API  |       |  Pacing Service  |       |   Redis Cluster  |
|                  |       |                  |       |                  |
|  Before auction: +------>| check_pacing(    |<----->| budget:camp:1234 |
|  should_serve =  |       |   campaign_id)   |       | { spend: 4523.45 |
|  pacing.check()  |       |                  |       |   limit: 10000   |
|                  |       | Returns: True/   |       |   pace_ratio: .9 |
|  After win:      |       |   False + ratio  |       |   updated: now } |
|  pacing.record(  +------>|                  |       +------------------+
|   campaign_id,   |       | record_spend(    |
|   clearing_price)|       |   campaign_id,   |
|                  |       |   price)         |
+------------------+       +------------------+
                                    |
                            [Background Job]
                            Every 1 minute:
                            - Compute pace_ratio
                            - Update Redis
                            - Pause campaigns over budget
                            - Alert on anomalies
```

---

## 12. Deep Dive: Attribution Models

### Attribution Touchpoints

```
Day 1        Day 3        Day 5        Day 7 (Conversion)
  |            |            |            |
[View]      [Click]     [View ad]    [Purchase]
Display      Search      Retarget      $99.00
  ad           ad           ad

Last-click attribution:  100% credit to Search ad (Day 3 click)
First-click attribution: 100% credit to Display ad (Day 1 view)
Linear attribution:      33.3% to each touchpoint
Time-decay attribution:  Day 7: 40%, Day 5: 30%, Day 3: 20%, Day 1: 10%
Position-based (U-shape): 40% first, 40% last, 20% split among middle
View-through:             Conversion credited to View ad if no click in window
```

### Attribution Pipeline

```
Conversion Event (pixel / server postback)
        |
        v
Kafka topic: conversions
        |
        v
Attribution Service (Flink streaming job)
  - Look back window: 30 days for clicks, 7 days for view-through
  - Join conversion to impression/click log in S3/Hive
  - Apply selected attribution model
  - Emit attribution_credit events
        |
        +---> Kafka: attribution_credits
                  |
                  v
          Campaign Stats Updater
          - Update conversions, CPA, ROAS in Clickhouse
          - Near-real-time: 15-minute lag (micro-batch)
          - Finalized: 24h after conversion (allow delayed beacons)

Cross-device attribution:
  - Deterministic: Same login (user_id known)
  - Probabilistic: Device fingerprint similarity + IP matching
  - Identity graph: Third-party data (LiveRamp) linking devices
```

---

## 13. Deep Dive: Fraud Detection

### Types of Ad Fraud

```
+-------------------------+------------------------------------------+
|  Fraud Type             |  Description                             |
+-------------------------+------------------------------------------+
| Click Fraud             | Competitors or publishers clicking own   |
|                         | ads to drain advertiser budget           |
+-------------------------+------------------------------------------+
| Bot Traffic             | Automated bots simulating page views     |
|                         | and ad impressions (no real users)       |
+-------------------------+------------------------------------------+
| Click Farm              | Low-cost human workers clicking ads      |
|                         | (hard to distinguish from real traffic)  |
+-------------------------+------------------------------------------+
| Domain Spoofing         | Fake publisher claims premium site ID   |
|                         | in bid request (OpenRTB fraud)           |
+-------------------------+------------------------------------------+
| Ad Stacking             | Multiple ads stacked, only top visible  |
|                         | but all count as "impressions"           |
+-------------------------+------------------------------------------+
| Pixel Stuffing          | 1x1 pixel ads count as impression,      |
|                         | never visible to user                    |
+-------------------------+------------------------------------------+
| View Fraud (SIVT)       | Sophisticated Invalid Traffic:           |
|                         | GIVT = General IVT (known bot lists)    |
+-------------------------+------------------------------------------+
```

### Fraud Detection System

```
Two phases: inline (< 10ms) and async (post-serving)

INLINE (Real-time, blocking):
  1. IP blacklist check (known bot networks, data centers)
     - Bloom filter in memory: ~1B IPs, ~1 GB RAM
  2. User-Agent analysis (known bot UA strings)
  3. Consent signal validation (GDPR/CCPA)
  4. Publisher allowlist/blocklist (IAB ads.txt verification)
  5. Click interval check: if same user clicked same ad < 1s ago, reject

ASYNC (Post-serving, 5-minute lag):
  1. Click pattern analysis:
     - Click rate per IP > 100/min → flag as bot
     - Click-to-conversion rate anomalies
     - Geographic inconsistency (US ad, Malaysian IP)
  2. Session analysis:
     - Mouse movement patterns (JS signal)
     - Session length, scroll behavior
  3. Device fingerprint clustering:
     - Many IPs sharing same fingerprint → bot farm
  4. Publisher anomaly detection:
     - CTR spike on publisher > 10x baseline → investigate
     - Sudden new publisher with high volume → hold payment

OUTPUTS:
  - is_fraud flag on impression/click record
  - Automatic refund credits to advertiser account
  - Publisher payment hold pending investigation
```

---

## 14. Deep Dive: Privacy & User Identity

### Privacy Regulations Impact

```
+------------------+----------------------------------------------+
|  Regulation      |  Ad Tech Impact                              |
+------------------+----------------------------------------------+
| GDPR (EU)        | Consent required before behavioral tracking |
|                  | Right to erasure: delete user from DMP       |
|                  | Data minimization: only collect what needed  |
|                  | Consent string in bid request (IAB TCF 2.0)  |
+------------------+----------------------------------------------+
| CCPA (California)| Opt-out of "sale" of personal information   |
|                  | us_privacy string in OpenRTB                 |
|                  | Honor opt-out within 15 business days        |
+------------------+----------------------------------------------+
| ATT (iOS 14.5+)  | App Tracking Transparency: explicit opt-in  |
|                  | IDFA (device ID) unavailable without consent |
|                  | SKAdNetwork for aggregated attribution       |
+------------------+----------------------------------------------+
| 3P Cookie Deprec.| Chrome blocking 3rd-party cookies (2024+)  |
|                  | Privacy Sandbox: Topics API, Protected       |
|                  | Audience API (FLEDGE) replace cookie-based  |
+------------------+----------------------------------------------+
```

### Privacy-Preserving Targeting Alternatives

**Topics API (Chrome Privacy Sandbox):**

```
Browser observes user's browsing history locally
Assigns user to weekly "topics" (e.g., "Technology > Software")
Taxonomy: 350 topics

On ad request:
  - Browser JS API returns 3 topics (current week + 2 past weeks)
  - No user ID shared across sites
  - Noise added: 5% probability of random topic

Publisher page calls:
  document.browsingTopics().then(topics => {
    // topics = [{ topic: 142, version: "1:2" }]  // "Technology"
    // Pass to ad server via URL param, not third-party cookie
  })
```

**FLEDGE / Protected Audience API:**

```
Retargeting without third-party cookies:

1. Advertiser joins user to interest group (browser-local):
   navigator.joinAdInterestGroup({
     owner: 'https://advertiser.com',
     name: 'checkout_abandoner',
     biddingLogicUrl: 'https://dsp.com/bid.js',
     ads: [{ renderUrl: 'https://cdn.com/ad.html' }]
   }, 30 * 24 * 3600)  // 30-day membership

2. On publisher page, auction runs in isolated "worklet":
   navigator.runAdAuction({
     seller: 'https://adexchange.com',
     decisionLogicUrl: 'https://adexchange.com/score.js',
     interestGroupBuyers: ['https://advertiser.com'],
   })
   // Auction happens client-side; winning ad rendered in fenced frame
   // No cross-site user data leaves browser
```

### Consent Enforcement Architecture

```
Ad Request (with consent string)
        |
        v
+-------+-------+
| Consent Gate  |
|               |
| Parse IAB TCF |  No consent for behavioral?
| consent string+----------------------> Contextual-only mode:
|               |                        - No user segments
| Check CCPA    |                        - No retargeting
| us_privacy    |                        - No frequency cap
|               |                          (can't identify user)
| Check ATT     |                        - Contextual targeting only
| (mobile)      |
+-------+-------+
        |
  Consent given for all purposes?
        |
        v
Full behavioral targeting pipeline
```

---

## 15. Deep Dive: Impression Tracking & Viewability

### Impression Tracking Methods

```
METHOD 1: 1x1 Tracking Pixel (Standard)
  Ad HTML contains: <img src="https://track.adserver.com/imp?id=..." width=1 height=1>
  When browser loads ad, pixel request fires automatically
  Issues: Ad blockers, pre-fetch without render

METHOD 2: JavaScript Beacon
  Ad JS calls: new Image().src = "https://track.adserver.com/imp?..."
  More reliable than pixels; can include viewability checks

METHOD 3: Server-to-Server (S2S)
  Publisher server pings ad server after rendering (programmatic)
  Higher fidelity; not susceptible to browser-side blocking

VIDEO TRACKING (VAST/VPAID):
  VAST (Video Ad Serving Template): XML descriptor for video ads
  <Tracking event="start">   <![CDATA[https://track.../start]]>
  <Tracking event="firstQuartile">   ...
  <Tracking event="midpoint">   ...
  <Tracking event="thirdQuartile">   ...
  <Tracking event="complete">   ...
  <Tracking event="impression">   ...
```

### Viewability Standard (MRC)

```
Display ads: >= 50% of pixels visible for >= 1 continuous second
Video ads:   >= 50% of pixels visible for >= 2 continuous seconds

Measurement: Intersection Observer API
  const observer = new IntersectionObserver(
    (entries) => {
      const entry = entries[0]
      if (entry.intersectionRatio >= 0.5) {
        viewableStartTime = Date.now()
      } else if (viewableStartTime) {
        const duration = Date.now() - viewableStartTime
        if (duration >= 1000) {
          fireViewabilityBeacon(impression_id)
        }
      }
    },
    { threshold: 0.5 }
  )
  observer.observe(adElement)
```

### Click Tracking Pipeline

```
User clicks on ad
        |
        | Click URL: https://track.adserver.com/clk?id=imp_789&token=...
        v
Click Tracker Service (edge, Anycast)
  - Parse impression ID + HMAC token (prevent click stuffing)
  - Write to Kafka: topic=clicks (async, non-blocking)
  - Immediately 302 redirect to landing page (< 5ms)
        |
        | Kafka consumer
        v
Click Processor (Flink)
  - Dedup: check click_id in Redis (TTL 24h) — prevent double counting
  - Fraud check: rate limit per IP, per impression
  - Join with impression record for enrichment
  - Write to Clickhouse clicks table
  - Emit to attribution pipeline
        |
        v
Real-time reporting update (< 1 minute lag)
```

---

## 16. Deep Dive: Ad Serving at Edge

### CDN Architecture for Creatives

```
Creative Upload Flow:
  Advertiser uploads creative (image/HTML/video)
        |
  Creative Review Service (ML + human moderation)
        |  Approved
        v
  Origin Storage (S3)
        |
  CDN Invalidation / Pre-warming
        |
  Edge PoP Caches (CloudFront / Fastly / Akamai)
  - 200+ PoPs globally
  - Display creative: ~50 KB → serves from cache in < 5ms
  - Cache TTL: 24h (creative rarely changes)
  - Cache key: {creative_id}:{width}x{height}

Ad Serving at Edge:
  - Ad decision logic runs at PoP (not origin)
  - User profile cache at edge: 1-hop Redis per PoP region
  - CTR model cached at edge (updated every 30 min)
  - Frequency cap reads: edge Redis → 2ms vs cross-region 50ms

Latency breakdown (edge-optimized):
  TLS handshake (resumed):   5ms
  Routing + load balance:    2ms
  Consent + fraud check:     3ms
  User profile lookup:       2ms  (edge Redis)
  Candidate retrieval:       5ms  (edge index)
  CTR scoring (LR model):    2ms
  Budget pacing check:       2ms
  Response assembly:         1ms
  Network RTT (edge→client): 10ms
  ----------------------------------
  Total:                   ~32ms   (well within 100ms budget)
```

### Edge Ad Server Architecture

```
                    +-----------+     +-----------+     +-----------+
                    |  US-East  |     |  EU-West  |     | AP-South  |
                    |  PoP      |     |  PoP      |     |  PoP      |
                    |           |     |           |     |           |
                    | Ad Engine |     | Ad Engine |     | Ad Engine |
                    | CTR Model |     | CTR Model |     | CTR Model |
                    | Ad Index  |     | Ad Index  |     | Ad Index  |
                    | Edge Redis|     | Edge Redis|     | Edge Redis|
                    +-----+-----+     +-----+-----+     +-----+-----+
                          |                 |                 |
                          |   Sync every 5 minutes            |
                          |   (campaign data, budgets)        |
                          |                 |                 |
                    +-----v-----------------v-----------------v-----+
                    |               Control Plane                   |
                    |  Campaign DB  |  Budget Service  |  ML Models |
                    +-----------------------------------------------+

RTB goes to central exchange (latency-sensitive, DSPs are centralized)
Direct-sold ads fully served at edge (no RTB needed)
```

---

## 17. Scaling Strategy

### Horizontal Scaling per Component

```
+----------------------------+--------------+---------------------------+
| Component                  | Scaling Unit | Strategy                  |
+----------------------------+--------------+---------------------------+
| Ad Serving API             | Stateless    | Auto-scale on CPU/RPS     |
|                            |              | Target 1M req/s: ~500 pods |
+----------------------------+--------------+---------------------------+
| RTB Gateway                | Stateless    | Scale with auction volume  |
|                            |              | Async HTTP/2 fan-out       |
+----------------------------+--------------+---------------------------+
| User Profile Store         | Partitioned  | Aerospike cluster          |
|                            |              | Shard by user_id hash      |
|                            |              | 100 nodes, 1TB+ RAM total  |
+----------------------------+--------------+---------------------------+
| Frequency Cap Redis        | Partitioned  | Redis Cluster, 32 shards  |
|                            |              | Consistent hash by user_id |
+----------------------------+--------------+---------------------------+
| Kafka (Event Bus)          | Partitioned  | 200 partitions per topic  |
|                            |              | 3x replication factor      |
+----------------------------+--------------+---------------------------+
| Clickhouse (Analytics)     | Sharded      | Shard by advertiser_id    |
|                            |              | MergeTree + ReplicatedMT   |
+----------------------------+--------------+---------------------------+
| CTR Model Serving          | Stateless    | GPU pods, auto-scale       |
|                            |              | TorchServe batch inference |
+----------------------------+--------------+---------------------------+
| Budget Pacing Service      | Semi-stateful| One primary per campaign   |
|                            |              | Redis-backed state         |
+----------------------------+--------------+---------------------------+
| Fraud Detection            | Stateless    | Stream processing (Flink)  |
|                            |              | Bloom filter replicated    |
+----------------------------+--------------+---------------------------+
```

### Data Tier Scaling

```
Campaign Metadata (MySQL/PostgreSQL):
  - Read replicas for serving path (ad candidate lookup)
  - Primary for writes (campaign CRUD, budget updates)
  - Caching layer: Redis with 5-min TTL for active campaigns
  - Targeting rules cached in-process at each serving node (refreshed every minute)

User Profiles (Aerospike):
  - In-memory + SSD hybrid storage
  - 100M hot profiles in RAM: ~1 TB cluster-wide
  - Sub-millisecond reads (< 1ms p99 within AZ)
  - Cross-region replication: async, 2 replicas per region

Clickstream (Kafka → Clickhouse):
  - Kafka: 500 TB/day ingestion across 10 brokers
  - Clickhouse: columnar compression 10:1 → 50 TB/day stored
  - Tiered storage: NVMe SSD for hot (30d), S3-backed for cold
  - Query latency: < 5s for ad-hoc, < 100ms for pre-aggregated dashboards
```

### Global Distribution

```
Ad serving: Multi-region active-active (US, EU, APAC, LATAM)
  - Anycast DNS routes requests to nearest PoP
  - Each region serves its local traffic
  - No cross-region calls in hot path

RTB: Centralized per geo-cluster (US, EU, APAC)
  - DSPs connect to regional exchange endpoints
  - Bid processing colocated with DSP infrastructure

Data sync:
  - Campaign state: async replication lag < 5s acceptable
  - Budget state: shared global Redis with optimistic concurrency
    (over-spend allowed up to 1% with reconciliation)
  - User profiles: regional isolation by default, cross-region for
    deterministic cross-device (hashed email match)
```

---

## 18. Trade-offs

### Auction Mechanics

```
Trade-off: First-price vs Second-price auction

Second-price:
  + Truthful bidding (optimal strategy is bid = true value)
  + Simple for DSPs to implement
  - Lower publisher revenue (pay second-highest, not true value)
  - Market: standard before 2019

First-price:
  + Higher publisher revenue
  + Transparent (winner pays what they bid)
  - DSPs need sophisticated bid shading to avoid overpaying
  - Increases DSP complexity
  - Market: standard in 2024

Decision: First-price is now industry standard; implement with
floor prices to prevent race to the bottom.
```

### CTR Model Latency vs Accuracy

```
Trade-off: Deep learning vs logistic regression for CTR prediction

Logistic Regression:
  + 1ms inference per 500 candidates
  + No GPU needed
  + Interpretable, easy to debug
  - Lower AUC (0.72 typical)

Deep Learning (Wide & Deep, DLRM):
  + Higher AUC (0.76-0.80)
  + Better on sparse feature interactions
  - 10-50ms inference (GPU) or 200ms (CPU)
  - GPU cost, operational complexity

Decision: Two-stage pipeline:
  Stage 1: LR model scores 1000 candidates → top 100 (1ms)
  Stage 2: DL model reranks top 100 → top 5 (10ms GPU)
  Net saving: DL scores 100 (not 1000) → 10x cheaper inference
```

### Real-time vs Batch Attribution

```
Trade-off: How quickly to attribute conversions?

Real-time (< 1 minute):
  + Advertisers see conversions immediately
  + Faster feedback loop for budget decisions
  - Misses delayed beacons (mobile app can report hours later)
  - Double-counting risk before dedup completes
  - Requires complex streaming joins

Batch (24-hour finalized):
  + Accurate: collects all delayed events
  + Simpler to implement (SQL batch jobs)
  - Advertiser can't see today's performance until tomorrow

Decision: Dual pipeline:
  - Streaming (Flink): near-real-time (~15 min lag, preliminary)
  - Batch (Spark): daily finalization (gold standard numbers)
  - Reports show both "preliminary" and "final" counts
```

### Frequency Cap Precision vs Cost

```
Trade-off: Exact counting vs approximate counting for frequency caps

Exact (Redis per-user per-campaign):
  + Zero false positives (never show ad when capped)
  - Memory: 1B users * 100K campaigns * 8 bytes = too large
  - Only feasible for hot active users (~100M)

Approximate (Count-Min Sketch or HyperLogLog):
  + Dramatically lower memory (2 GB for all users and campaigns)
  - ~1% false positive rate: occasionally show ad when capped
  - 1% error = 1% wasted spend = tolerable for most advertisers

Decision: Hybrid:
  - Redis exact for top 100M active users (hot path)
  - Count-Min Sketch for long-tail users (rarely active)
  - On eviction from Redis: merge approximate count into CMS
```

---

## 19. Common Interview Follow-ups

**Q: How do you handle the 100ms latency budget if RTB takes 80ms?**

The 80ms is a hard timeout on the RTB fan-out. In parallel, we run direct-sold ad selection (takes ~30ms). If RTB completes within 80ms, we compare RTB winner vs direct-sold winner and pick the higher eCPM. If RTB times out, we immediately fall back to direct-sold or house ad. The key is that the 80ms RTB step runs in parallel with other processing, not sequentially.

**Q: How do you prevent over-spend on campaign budgets?**

We use probabilistic pacing with a Redis-backed spend counter updated on every impression. The pacing service reads current spend and computes a serve probability. We allow up to 1% over-spend due to eventual consistency (multiple PoPs may serve simultaneously before the counter syncs). At campaign end, we reconcile and credit any over-spend back to the advertiser.

**Q: How do you handle DSPs that consistently time out?**

We track per-DSP response time percentiles in a circuit breaker. If a DSP's p95 latency exceeds 70ms, we reduce the timeout we give them to 60ms. If >20% of their requests timeout, we open the circuit breaker and skip that DSP for 60 seconds, then retry. This prevents one slow DSP from degrading the overall auction.

**Q: What happens when a user deletes their cookies or uses a new device?**

We lose the ability to identify the user (by design, for privacy). The user effectively becomes a new anonymous user. Frequency caps reset, retargeting lists can't be matched, and behavioral targeting falls back to contextual only. This is acceptable; our systems degrade gracefully to contextual-only mode.

**Q: How do you detect and handle click fraud at scale?**

Three layers:
1. Real-time (inline, < 5ms): IP blacklist bloom filter, UA bot detection, click interval check (same impression clicked twice).
2. Near-real-time (Flink, < 5min): Click rate anomalies per IP, per publisher. Geographic IP inconsistency.
3. Batch (daily): Publisher-level CTR anomaly detection vs baseline. Hold suspicious publishers' payments pending investigation.
Credits issued to advertisers automatically for confirmed IVT.

**Q: How does the system handle sudden traffic spikes (e.g., Super Bowl ads)?**

We auto-scale the stateless ad serving tier using Kubernetes HPA based on CPU and request queue depth. We pre-warm capacity 30 minutes before known events (we can predict this from campaign flight dates and geographic targeting). Kafka absorbs burst for the tracking pipeline. Budget pacing naturally throttles campaigns that exhaust their daily budget quickly.

**Q: How do you ensure click tracking zero loss?**

The click tracker immediately writes to Kafka (durable, replicated log) before redirecting the user. Kafka guarantees at-least-once delivery to consumers. The Flink consumer performs dedup using click_id in Redis (TTL 24h). The combination of Kafka durability + consumer dedup achieves at-least-once with exactly-once semantics for counting.

**Q: How would you implement server-side ad insertion (SSAI) for streaming video?**

SSAI stitches ad creatives into the video stream server-side, making them indistinguishable from content at the network level (defeating ad blockers). The ad decision and transcoding happen before delivery:
1. Video player requests stream from CDN origin.
2. Origin calls ad decision service with content context + user signals.
3. Ad decision returns creative URL.
4. Manifest manipulator (server) stitches creative segments into HLS/DASH manifest.
5. Player plays seamlessly without knowing where content ends and ad begins.
6. Impressions tracked via manifest request timing, not client-side beacons.

**Q: How does Google's Privacy Sandbox replace third-party cookies for retargeting?**

The Protected Audience API (formerly FLEDGE) moves retargeting logic into the browser. Advertisers call `navigator.joinAdInterestGroup()` on their site to enroll users in interest groups (stored locally). When a user visits a publisher, the browser runs an on-device auction in a sandboxed "worklet." DSP bidding logic (JS) runs in this worklet with access only to local interest groups—never sending the user's identity to any server. The winning ad renders in a Fenced Frame, which cannot communicate with the surrounding page. This achieves retargeting without cross-site tracking.

**Q: What database would you use for campaign metadata vs clickstream data?**

Campaign metadata (campaigns, ad groups, creatives): PostgreSQL or MySQL. Low write rate, complex relational queries, strong consistency needed for billing. Add a Redis cache layer for the serving path.

Clickstream (impressions, clicks, conversions): Clickhouse (columnar OLAP). Designed for append-only high-throughput writes and fast aggregate queries over billions of rows. Partitioned by date, sharded by advertiser. Alternative: Apache Druid for sub-second rollup queries, or Pinot for real-time analytics.

---

*End of Design: Ad Serving & Real-Time Bidding System*
