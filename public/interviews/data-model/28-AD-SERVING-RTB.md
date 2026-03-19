# Data Model: Ad Serving & Real-Time Bidding

An ad serving platform matches advertisers' ads with publisher inventory in real time, typically within 100ms. The data model spans the full lifecycle: campaign configuration, real-time auction mechanics, event tracking (impressions, clicks, conversions), and budget enforcement. Hot-path data (user profiles, budget counters) lives in Redis, while event analytics uses a columnar store like ClickHouse for fast aggregation over billions of rows.

---

## Table Responsibilities

| Table                 | Purpose                          | Storage    | Why It Exists                                                                                 |
| --------------------- | -------------------------------- | ---------- | --------------------------------------------------------------------------------------------- |
| **advertisers**       | Advertiser accounts              | Postgres   | Top-level entity for billing and access control                                               |
| **campaigns**         | Budget and schedule management   | Postgres   | Controls spend pacing and bidding strategy                                                    |
| **ad_groups**         | Targeting and frequency caps     | Postgres   | Groups ads by audience; enables granular targeting without duplicating targeting rules per ad |
| **ads**               | Individual ad units with scoring | Postgres   | Links creative to targeting; carries quality/CTR predictions for auction ranking              |
| **creatives**         | Ad creative assets               | Postgres   | Separates creative from targeting; one creative can be reused across multiple ads             |
| **impression_events** | Impression logging               | ClickHouse | High-volume event stream; write-optimized columnar storage                                    |
| **click_events**      | Click tracking                   | ClickHouse | Separate from impressions for different retention and query patterns                          |
| **conversion_events** | Conversion attribution           | ClickHouse | Tracks post-click/post-view conversions for ROI measurement                                   |
| **user_profiles**     | Real-time user data              | Redis      | Sub-millisecond reads during auction; stores segments and freq caps                           |
| **budget_counters**   | Real-time spend tracking         | Redis      | Atomic increments prevent budget overspend during concurrent auctions                         |

---

## Detailed Field Descriptions

### advertisers

| Field         | Type      | Description                    |
| ------------- | --------- | ------------------------------ |
| advertiser_id | UUID (PK) | Unique advertiser identifier   |
| name          | VARCHAR   | Company or brand name          |
| status        | ENUM      | active, paused, suspended      |
| billing_type  | ENUM      | prepaid, postpaid, credit_line |

### campaigns

| Field            | Type      | Description                                                       |
| ---------------- | --------- | ----------------------------------------------------------------- |
| campaign_id      | UUID (PK) | Unique campaign identifier                                        |
| advertiser_id    | UUID (FK) | Parent advertiser                                                 |
| name             | VARCHAR   | Campaign name                                                     |
| status           | ENUM      | draft, active, paused, completed, exhausted                       |
| budget_daily     | DECIMAL   | Maximum daily spend in dollars                                    |
| budget_total     | DECIMAL   | Lifetime budget cap                                               |
| spend_today      | DECIMAL   | Running daily spend (synced from Redis periodically)              |
| spend_total      | DECIMAL   | Running lifetime spend                                            |
| start_date       | DATE      | Campaign start date                                               |
| end_date         | DATE      | Campaign end date                                                 |
| bidding_strategy | ENUM      | cpm (cost per mille), cpc (cost per click), cpa (cost per action) |
| target_bid       | DECIMAL   | Target bid amount in the chosen strategy's unit                   |

**Why both budget_daily and budget_total?** Daily budgets prevent a campaign from burning its entire budget in one hour during a traffic spike. Total budget caps lifetime spend. Both are needed for proper pacing.

**Why spend_today in both Postgres and Redis?** Redis holds the real-time authoritative counter (atomic increments per auction). Postgres is periodically synced for dashboards and reporting. This separation keeps the auction hot path off the relational database.

### ad_groups

| Field                | Type      | Description                                               |
| -------------------- | --------- | --------------------------------------------------------- |
| ad_group_id          | UUID (PK) | Unique ad group identifier                                |
| campaign_id          | UUID (FK) | Parent campaign                                           |
| geo_targets          | VARCHAR[] | Targeted countries/regions/cities                         |
| device_targets       | VARCHAR[] | desktop, mobile, tablet                                   |
| age_targets          | INT4RANGE | Age range targeting (e.g., [18, 35))                      |
| interest_segments    | VARCHAR[] | Targeted interest segments (e.g., "sports", "technology") |
| freq_cap_impressions | INT       | Max impressions per user within the frequency window      |
| freq_cap_window      | INTERVAL  | Time window for frequency capping (e.g., 24 hours)        |

**Why ad_groups between campaigns and ads?** Without ad groups, targeting rules would be duplicated on every ad. Ad groups let you define "show to 25-34 year old mobile users in the US" once, then attach multiple ad creatives to test which performs best.

### ads

| Field         | Type      | Description                                                            |
| ------------- | --------- | ---------------------------------------------------------------------- |
| ad_id         | UUID (PK) | Unique ad identifier                                                   |
| ad_group_id   | UUID (FK) | Parent ad group (inherits targeting)                                   |
| creative_id   | UUID (FK) | The creative asset to display                                          |
| status        | ENUM      | active, paused, rejected                                               |
| bid_override  | DECIMAL   | Optional per-ad bid override (overrides campaign target_bid)           |
| quality_score | FLOAT     | Platform-assigned quality score (0-10) based on historical performance |
| predicted_ctr | FLOAT     | ML-predicted click-through rate; updated periodically                  |

**Why predicted_ctr on the ad?** The auction ranking formula is typically `predicted_ctr x bid`. This ensures that a high-quality ad with a low bid can beat a low-quality ad with a high bid, improving user experience while maximizing platform revenue (eCPM).

### creatives

| Field             | Type      | Description                                                 |
| ----------------- | --------- | ----------------------------------------------------------- |
| creative_id       | UUID (PK) | Unique creative identifier                                  |
| advertiser_id     | UUID (FK) | Owner advertiser                                            |
| creative_type     | ENUM      | display, video, native                                      |
| width             | INT       | Creative width in pixels                                    |
| height            | INT       | Creative height in pixels                                   |
| asset_url         | VARCHAR   | URL to the creative asset (image, video, or native payload) |
| click_through_url | VARCHAR   | Landing page URL when the ad is clicked                     |

### impression_events (ClickHouse)

| Field         | Type     | Description                                           |
| ------------- | -------- | ----------------------------------------------------- |
| impression_id | UUID     | Unique impression identifier                          |
| ad_id         | UUID     | Which ad was shown                                    |
| campaign_id   | UUID     | Denormalized for fast aggregation without joins       |
| user_id_hash  | VARCHAR  | Hashed user identifier (privacy-safe)                 |
| auction_price | DECIMAL  | The price actually paid (second-price auction result) |
| bid_price     | DECIMAL  | The winning bid amount                                |
| geo           | VARCHAR  | User's geographic location                            |
| device        | VARCHAR  | Device type                                           |
| timestamp     | DATETIME | When the impression occurred                          |

**Why denormalize campaign_id?** ClickHouse queries aggregate billions of rows. Joins are expensive. Denormalizing campaign_id into every impression avoids joining with the campaigns table for the most common query ("show me impressions by campaign").

### click_events (ClickHouse)

| Field         | Type     | Description                  |
| ------------- | -------- | ---------------------------- |
| click_id      | UUID     | Unique click identifier      |
| impression_id | UUID     | Which impression was clicked |
| ad_id         | UUID     | Denormalized for aggregation |
| campaign_id   | UUID     | Denormalized for aggregation |
| user_id_hash  | VARCHAR  | Hashed user identifier       |
| timestamp     | DATETIME | When the click occurred      |

### conversion_events (ClickHouse)

| Field           | Type     | Description                                                    |
| --------------- | -------- | -------------------------------------------------------------- |
| conversion_id   | UUID     | Unique conversion identifier                                   |
| click_id        | UUID     | Which click led to this conversion (nullable for view-through) |
| impression_id   | UUID     | Which impression led to this conversion                        |
| campaign_id     | UUID     | Denormalized for aggregation                                   |
| conversion_type | VARCHAR  | purchase, signup, app_install, etc.                            |
| revenue         | DECIMAL  | Revenue attributed to this conversion                          |
| timestamp       | DATETIME | When the conversion occurred                                   |

### user_profiles (Redis)

| Field         | Type | Description                                          |
| ------------- | ---- | ---------------------------------------------------- |
| user_id       | KEY  | Redis key                                            |
| segments      | SET  | User's interest segments for targeting               |
| interests     | SET  | Inferred interests from browsing behavior            |
| freq_caps     | HASH | campaign_id → impression count within current window |
| consent_flags | HASH | GDPR/CCPA consent state per purpose                  |

**Why Redis for user profiles?** The auction happens in under 100ms. Loading user segments and frequency caps from a relational database would add 5-20ms of latency. Redis provides sub-millisecond reads with hash and set operations.

### budget_counters (Redis)

| Field       | Type    | Description                                            |
| ----------- | ------- | ------------------------------------------------------ |
| key         | STRING  | campaign_id + date (e.g., "budget:camp123:2024-01-15") |
| spend       | DECIMAL | Atomic counter incremented on each auction win         |
| impressions | INT     | Atomic counter of impressions served                   |
| TTL         | 48h     | Auto-expires after 48 hours                            |

**Why Redis atomic counters?** In a system serving 100K+ auctions per second, checking and updating budget in Postgres would create massive contention. Redis INCRBYFLOAT is atomic, lock-free, and sub-millisecond. The 48h TTL auto-cleans old counters.

---

## ER Diagram

```
+------------------+
|   advertisers    |
+------------------+
| advertiser_id(PK)|
| name             |
| status           |
| billing_type     |
+--------+---------+
         |
         | 1
         |
         +------------------+
         |                  |
         *                  *
+--------+---------+ +------+----------+
|    campaigns     | |   creatives     |
+------------------+ +-----------------+
| campaign_id (PK) | | creative_id(PK) |
| advertiser_id(FK)| | advertiser_id   |
| name             | | creative_type   |
| status           | | width, height   |
| budget_daily     | | asset_url       |
| budget_total     | | click_through   |
| spend_today      | +------+----------+
| spend_total      |        |
| start/end_date   |        |
| bidding_strategy |        |
| target_bid       |        |
+--------+---------+        |
         |                  |
         | 1                | 1
         |                  |
         *                  |
+--------+---------+        |
|    ad_groups     |        |
+------------------+        |
| ad_group_id (PK) |        |
| campaign_id (FK) |        |
| geo_targets[]    |        |
| device_targets[] |        |
| age_targets      |        |
| interest_segments|        |
| freq_cap_*       |        |
+--------+---------+        |
         |                  |
         | 1                |
         |                  |
         *                  |
+--------+---------+        |
|      ads         |--------+
+------------------+
| ad_id (PK)       |
| ad_group_id (FK) |
| creative_id (FK) |
| status           |
| bid_override     |
| quality_score    |
| predicted_ctr    |
+--------+---------+
         |
         | 1
         |
         *                             (Redis)
+--------+------------+     +------------------------+
| impression_events   |     |    user_profiles       |
| (ClickHouse)        |     +------------------------+
+---------------------+     | user_id (KEY)          |
| impression_id       |     | segments (SET)         |
| ad_id               |     | interests (SET)        |
| campaign_id         |     | freq_caps (HASH)       |
| user_id_hash        |     | consent_flags (HASH)   |
| auction/bid_price   |     +------------------------+
| geo, device         |
| timestamp           |     +------------------------+
+---------+-----------+     |   budget_counters      |
          |                 +------------------------+
          | 1               | campaign_id+day (KEY)  |
          |                 | spend (FLOAT)          |
          *                 | impressions (INT)      |
+---------+-----------+     | TTL: 48h               |
|   click_events      |     +------------------------+
|   (ClickHouse)      |
+---------------------+
| click_id            |
| impression_id       |
| ad_id, campaign_id  |
| user_id_hash        |
| timestamp           |
+---------+-----------+
          |
          | 1
          |
          *
+---------+-----------+
| conversion_events   |
| (ClickHouse)        |
+---------------------+
| conversion_id       |
| click_id            |
| impression_id       |
| campaign_id         |
| conversion_type     |
| revenue             |
| timestamp           |
+---------------------+
```

### Relationship Summary

```
advertisers    1───* campaigns            (one advertiser has many campaigns)
advertisers    1───* creatives            (one advertiser owns many creatives)
campaigns      1───* ad_groups            (one campaign has many ad groups)
ad_groups      1───* ads                  (one ad group has many ads)
creatives      1───* ads                  (one creative used by many ads)
ads            1───* impression_events    (one ad generates many impressions)
impression     1───* click_events         (one impression may have clicks)
click          1───* conversion_events    (one click may lead to conversions)
```

---

## Data Flow

1. **Publisher sends ad request** -- A user loads a webpage. The publisher's ad server sends a bid request to the ad exchange with the ad slot dimensions, user_id_hash, page URL, and user consent flags.

2. **Load user profile** -- The system reads the `user_profiles` from Redis to get the user's interest segments, behavioral data, and current frequency cap counters.

3. **Filter eligible campaigns** -- Query campaigns where status=active, date range includes today, and budget is not exhausted. Check `budget_counters` in Redis to verify daily spend has not exceeded budget_daily.

4. **Apply targeting** -- For eligible campaigns, check ad_groups targeting rules: does the user's geo, device, and age match? Are they in the required interest segments? Has the frequency cap been reached (check freq_caps in user_profiles)?

5. **Run auction** -- For all eligible ads, compute the ranking score: `predicted_ctr x effective_bid`. The highest score wins. In a second-price auction, the winner pays just enough to beat the second-highest bid.

6. **Serve creative** -- The winning ad's creative is returned to the publisher. A tracking pixel URL is embedded for impression confirmation.

7. **Log impression** -- When the tracking pixel fires, an `impression_events` row is written to ClickHouse. The `budget_counters` in Redis are atomically incremented (spend += auction_price, impressions += 1). The user's freq_caps in user_profiles are updated.

8. **Track clicks** -- If the user clicks the ad, a redirect through the ad server logs a `click_events` row before forwarding to the click_through_url.

9. **Track conversions** -- A conversion pixel or server-to-server callback fires when the user completes an action (purchase, signup). A `conversion_events` row is written, attributed to the original impression and click.

10. **Budget sync** -- Periodically (every few minutes), Redis budget_counters are synced back to campaigns.spend_today and spend_total in Postgres. If spend_total >= budget_total, the campaign status is set to exhausted.

11. **Reporting** -- Dashboards query ClickHouse to aggregate impression, click, and conversion events by campaign, ad_group, ad, date, geo, and device. CTR, CPC, CPA, and ROAS are computed on the fly.

---

## Interview Discussion Points

**Q: Why separate ClickHouse and Postgres?**
Postgres handles the relational campaign configuration (hundreds of rows, complex relationships). ClickHouse handles billions of event rows with columnar compression and fast aggregations. Using Postgres for events would collapse under the write volume; using ClickHouse for campaign config would be awkward for transactional updates.

**Q: Why second-price auction instead of first-price?**
Second-price auctions encourage bidders to bid their true value (it is the dominant strategy). First-price auctions incentivize bid shading, which is harder to optimize. Google and most exchanges have moved to first-price auctions for transparency, but the data model supports both -- it is the auction logic, not the schema, that determines pricing.

**Q: How do you prevent budget overspend?**
Redis atomic counters are checked before each auction. If incrementing spend would exceed the daily budget, the campaign is excluded from the auction. Because Redis operations are atomic, concurrent auctions cannot both read "under budget" and both increment past the limit. A small overspend margin (e.g., 1%) is acceptable in practice.

**Q: How do you handle frequency capping at scale?**
Each user's freq_caps in Redis is a hash map of campaign_id to impression count. The frequency window is enforced by TTL on the hash field or by including a time bucket in the key. At 100K auctions/second, this must be sub-millisecond, which is why Redis (not a database) is essential.
