# Design an Analytics Platform (Mixpanel / Amplitude / Google Analytics)

## Table of Contents

1. [Requirements Clarification](#1-requirements-clarification)
2. [API Design](#2-api-design)
3. [Data Model](#3-data-model)
4. [High-Level Architecture](#4-high-level-architecture)
5. [Event Ingestion Pipeline](#5-event-ingestion-pipeline)
6. [Event Schema Design](#6-event-schema-design)
7. [User Identity Resolution](#7-user-identity-resolution)
8. [Funnel Analysis](#8-funnel-analysis)
9. [Cohort Analysis](#9-cohort-analysis)
10. [Retention Analysis](#10-retention-analysis)
11. [Real-Time Dashboards](#11-real-time-dashboards)
12. [Session Reconstruction](#12-session-reconstruction)
13. [OLAP Storage Engine](#13-olap-storage-engine)
14. [Query Engine](#14-query-engine)
15. [A/B Testing Integration](#15-ab-testing-integration)
16. [Data Sampling](#16-data-sampling)
17. [Privacy and Consent](#17-privacy-and-consent)
18. [Client SDK Design](#18-client-sdk-design)
19. [Data Pipeline Stages](#19-data-pipeline-stages)
20. [Scaling Strategy](#20-scaling-strategy)
21. [Trade-offs](#21-trade-offs)
22. [Comparison: Analytics Platforms](#22-comparison-analytics-platforms)
23. [Common Interview Follow-ups](#23-common-interview-follow-ups)

---

## 1. Requirements Clarification

### Functional Requirements

| Category | Requirements |
|----------|-------------|
| **Event Tracking** | Ingest arbitrary user events with custom properties; track page views, clicks, form submissions, purchases; support server-side and client-side events; identify users across devices |
| **User Analytics** | User profiles with event history; anonymous-to-identified user stitching; cross-device identity resolution; user segmentation by properties and behaviors |
| **Funnel Analysis** | Define multi-step conversion funnels; calculate step-by-step conversion rates; time-windowed funnels (e.g., convert within 7 days); drop-off analysis with user lists |
| **Cohort Analysis** | Retention cohorts by first-seen date; behavioral cohorts by any event; cohort comparison across time periods; exportable cohort user lists |
| **Retention Analysis** | Day-N retention (Day 1, 7, 14, 30); rolling retention; unbounded retention; N-day retention curves with cohort breakdown |
| **Dashboards** | Real-time and historical charts; event counts, unique users, conversion rates; custom date ranges; shareable and embeddable dashboards |
| **Segmentation** | Filter any report by arbitrary user/event properties; AND/OR condition builder; saved segments for reuse |
| **A/B Testing** | Experiment assignment tracking; conversion rate by variant; statistical significance calculation; sample size calculator |
| **Data Export** | Raw event export via API; warehouse sync (BigQuery, Snowflake, Redshift); CSV download for cohort lists |

### Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| Event ingestion latency | < 5 seconds end-to-end (SDK send to queryable) |
| Dashboard query latency | < 3 seconds for 30-day date ranges |
| Availability | 99.9% uptime for ingestion; 99.95% for query |
| Ingestion throughput | 2M+ events/second sustained peak |
| Data durability | Zero event loss (at-least-once delivery with deduplication) |
| Hot data retention | 30 days in fast query tier |
| Scalability | Linear horizontal scaling; no single points of failure |
| Multi-tenancy | Strict data isolation per project/organization |
| Security | TLS in transit; AES-256 at rest; RBAC; SOC 2 Type II |

### Scale Estimates

```
Daily active users (DAU):       100M unique users
Events per user per day:        1,000 events/user/day (avg)
Total events per day:           100M * 1,000 = 100B events/day

Events per second (peak 2x avg):
  Average:                      100B / 86,400 = ~1.16M events/sec
  Peak (2x):                    ~2.3M events/sec  (target: 2M+ sustained)

Event payload size:
  Average event JSON:           500 bytes (uncompressed)
  With Snappy compression:      ~200 bytes
  Ingestion bandwidth:          2M * 200 B = 400 MB/sec compressed

Daily storage:
  Raw events:                   100B * 500 B = 50 TB/day (uncompressed)
  Columnar + compressed (10:1): ~5 TB/day in ClickHouse/Druid
  30-day hot tier:              5 TB * 30 = 150 TB
  1-year cold tier:             5 TB * 365 = ~1.8 PB

Kafka throughput:
  Partitions needed:            2M events/sec / 50K events/partition = 40 partitions
  Replication factor:           3  (across AZs)
  Kafka cluster:                20 brokers * 2 disks @ 10K MB/s each

Pre-computed aggregations:
  Event types per project:      ~500 unique events
  Properties per event:         ~20 dimensions
  Daily aggregation rows:       500 * 20 * 1,440 minutes = 14.4M rows/day/project
  For 10K projects:             ~144B aggregation rows/day

Query load:
  Concurrent dashboard users:   50K
  Queries per hour:             10K complex queries/hour
  p99 query target:             < 3 seconds for 30-day range
```

### Back-of-Envelope Summary

```
+--------------------------------+-----------------------+-------------------+
| Metric                         | Value                 | Notes             |
+--------------------------------+-----------------------+-------------------+
| Events per day                 | 100 Billion           | 100M users        |
| Peak ingestion rate            | 2M+ events/sec        | 2x daily avg      |
| Ingestion bandwidth            | ~400 MB/sec           | compressed        |
| Raw storage per day            | 50 TB                 | uncompressed      |
| Columnar storage per day       | 5 TB                  | 10:1 compression  |
| 30-day hot storage             | 150 TB                | ClickHouse/Druid  |
| Query throughput               | 10K queries/hour      | p99 < 3 seconds   |
| Unique users                   | 100M                  | identity graph    |
+--------------------------------+-----------------------+-------------------+
```

---

## 2. API Design

### 2.1 Event Ingestion API

```
POST /api/v1/track
Content-Type: application/json
Authorization: Bearer <project-api-key>

Request Body (batch):
{
  "batch": [
    {
      "event": "Purchase Completed",
      "distinct_id": "user_abc123",
      "anonymous_id": "anon_xyz789",
      "session_id": "sess_001",
      "timestamp": "2026-03-01T12:00:00.123Z",
      "properties": {
        "product_id": "prod_456",
        "price": 49.99,
        "currency": "USD",
        "category": "Electronics",
        "referrer": "google",
        "utm_campaign": "spring_sale"
      },
      "context": {
        "device": {
          "type": "mobile",
          "os": "iOS",
          "os_version": "17.2",
          "model": "iPhone 15"
        },
        "app": {
          "version": "3.4.1",
          "build": "341"
        },
        "network": {
          "wifi": true,
          "carrier": "AT&T"
        },
        "screen": {
          "width": 390,
          "height": 844,
          "density": 3.0
        },
        "locale": "en-US",
        "timezone": "America/New_York",
        "ip": "203.0.113.45",
        "library": {
          "name": "analytics-ios",
          "version": "4.2.0"
        }
      },
      "insert_id": "evt_dedup_key_unique_abc123"
    }
  ],
  "sent_at": "2026-03-01T12:00:01.000Z"
}

Response: 200 OK
{
  "status": "success",
  "accepted": 1,
  "rejected": 0
}
```

### 2.2 User Identification API

```
POST /api/v1/identify
Authorization: Bearer <project-api-key>

Request Body:
{
  "distinct_id": "user_abc123",
  "anonymous_id": "anon_xyz789",
  "timestamp": "2026-03-01T12:00:00Z",
  "traits": {
    "email": "alice@example.com",
    "name": "Alice Johnson",
    "plan": "pro",
    "company": "Acme Corp",
    "created_at": "2024-01-15T08:00:00Z",
    "age": 30,
    "country": "US"
  }
}

Response: 200 OK
{
  "status": "success",
  "merged_profile_id": "user_abc123"
}
```

### 2.3 Funnel Query API

```
POST /api/v1/query/funnels
Authorization: Bearer <project-api-key>

Request Body:
{
  "steps": [
    { "event": "Page Viewed", "filters": [{ "property": "page_name", "op": "equals", "value": "Pricing" }] },
    { "event": "Sign Up Clicked" },
    { "event": "Account Created" },
    { "event": "Purchase Completed" }
  ],
  "conversion_window": { "value": 7, "unit": "days" },
  "time_range": { "from": "2026-02-01T00:00:00Z", "to": "2026-03-01T00:00:00Z" },
  "group_by": "country",
  "filters": [
    { "property": "plan", "op": "equals", "value": "pro" }
  ]
}

Response: 200 OK
{
  "steps": [
    { "name": "Page Viewed",       "count": 1000000, "conversion_from_prev": null,   "conversion_from_first": 1.0  },
    { "name": "Sign Up Clicked",   "count": 350000,  "conversion_from_prev": 0.35,   "conversion_from_first": 0.35 },
    { "name": "Account Created",   "count": 280000,  "conversion_from_prev": 0.80,   "conversion_from_first": 0.28 },
    { "name": "Purchase Completed","count": 42000,   "conversion_from_prev": 0.15,   "conversion_from_first": 0.042}
  ],
  "median_time_between_steps": [null, "PT2H30M", "PT0H15M", "P2DT4H"],
  "query_time_ms": 1240
}
```

### 2.4 Retention Query API

```
POST /api/v1/query/retention
Authorization: Bearer <project-api-key>

Request Body:
{
  "cohort_event": "Account Created",
  "retention_event": "Session Started",
  "retention_type": "day_n",
  "time_range": { "from": "2026-01-01T00:00:00Z", "to": "2026-03-01T00:00:00Z" },
  "intervals": [0, 1, 7, 14, 30, 60, 90]
}

Response: 200 OK
{
  "cohorts": [
    {
      "cohort_date": "2026-01-01",
      "cohort_size": 12500,
      "retention": {
        "day_0":  1.000,
        "day_1":  0.420,
        "day_7":  0.230,
        "day_14": 0.180,
        "day_30": 0.120,
        "day_60": 0.085,
        "day_90": 0.062
      }
    }
  ],
  "query_time_ms": 890
}
```

### 2.5 Segment Export API

```
POST /api/v1/segments/export
Authorization: Bearer <project-api-key>

Request Body:
{
  "segment": {
    "conditions": [
      { "type": "event", "event": "Purchase Completed", "op": "at_least", "value": 2,
        "time_range": { "from": "2026-02-01T00:00:00Z", "to": "2026-03-01T00:00:00Z" } },
      { "type": "user_property", "property": "country", "op": "equals", "value": "US" }
    ],
    "operator": "AND"
  },
  "output": {
    "fields": ["distinct_id", "email", "created_at"],
    "format": "csv"
  }
}

Response: 202 Accepted
{
  "export_id": "exp_abc123",
  "status": "processing",
  "estimated_rows": 45000,
  "download_url": null
}
```

---

## 3. Data Model

### 3.1 Raw Events Table (ClickHouse)

```sql
CREATE TABLE events (
    -- Identity
    project_id       UInt32,
    distinct_id      String,          -- identified user ID
    anonymous_id     String,          -- pre-identification ID
    device_id        String,          -- stable device identifier
    session_id       String,

    -- Event core
    event_name       String,
    insert_id        String,          -- client-provided dedup key
    event_time       DateTime64(3),   -- millisecond precision
    received_time    DateTime64(3),   -- server ingestion time
    processed_time   DateTime64(3),

    -- Properties (nested/dynamic)
    properties       Map(String, String),   -- string-encoded values
    properties_json  String,               -- raw JSON blob

    -- Context
    ip               String,
    country          LowCardinality(String),
    region           String,
    city             String,
    device_type      LowCardinality(String),
    os               LowCardinality(String),
    os_version       String,
    browser          LowCardinality(String),
    browser_version  String,
    app_version      String,
    sdk_name         LowCardinality(String),
    sdk_version      String,

    -- UTM / Attribution
    utm_source       String,
    utm_medium       String,
    utm_campaign     String,
    utm_content      String,
    utm_term         String,
    referrer         String,

    -- Experiment
    experiment_id    String,
    variant_id       String,

    -- Partitioning
    date             Date MATERIALIZED toDate(event_time)
)
ENGINE = MergeTree()
PARTITION BY (project_id, date)
ORDER BY (project_id, event_name, distinct_id, event_time)
SETTINGS index_granularity = 8192;
```

### 3.2 User Profiles Table

```sql
CREATE TABLE user_profiles (
    project_id       UInt32,
    distinct_id      String,
    anonymous_ids    Array(String),    -- all linked anon IDs
    device_ids       Array(String),    -- all linked device IDs
    traits           Map(String, String),
    created_at       DateTime64(3),
    updated_at       DateTime64(3),
    first_seen_at    DateTime64(3),
    last_seen_at     DateTime64(3),
    first_event      String,
    total_events     UInt64,
    is_identified    UInt8             -- 0=anonymous, 1=identified
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (project_id, distinct_id);
```

### 3.3 Pre-Aggregated Counts Table

```sql
CREATE TABLE event_counts_minutely (
    project_id    UInt32,
    event_name    String,
    minute_bucket DateTime,           -- truncated to minute
    count         UInt64,
    unique_users  AggregateFunction(uniqHLL12, String)  -- HyperLogLog
)
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(minute_bucket)
ORDER BY (project_id, event_name, minute_bucket);
```

### 3.4 Identity Graph (Redis / Key-Value)

```
Schema:
  anon:{project_id}:{anonymous_id}    -> distinct_id     (string)
  device:{project_id}:{device_id}     -> distinct_id     (string)
  user:{project_id}:{distinct_id}     -> {
      anonymous_ids: [anon_1, anon_2],
      device_ids:    [dev_1, dev_2],
      merged_into:   null | distinct_id   (for merged users)
  }

Identity resolution lookup:
  1. Client sends anonymous_id="anon_xyz", distinct_id="user_abc"
  2. GET anon:{pid}:anon_xyz  -> "user_abc" (already linked, no-op)
     OR
  2. SET anon:{pid}:anon_xyz -> "user_abc"  (new link)
  3. SADD user:{pid}:user_abc:anon_ids "anon_xyz"
```

### 3.5 Experiment Assignment Table

```sql
CREATE TABLE experiment_assignments (
    project_id      UInt32,
    experiment_id   String,
    variant_id      String,
    distinct_id     String,
    assigned_at     DateTime64(3),
    first_event_at  DateTime64(3),
    converted       UInt8,
    converted_at    DateTime64(3)
)
ENGINE = ReplacingMergeTree(assigned_at)
ORDER BY (project_id, experiment_id, distinct_id);
```

---

## 4. High-Level Architecture

```
+------------------+     +------------------+     +------------------+
|   Web Browser    |     |   Mobile App     |     |   Server-Side    |
|   (JS SDK)       |     |  (iOS/Android)   |     |   (HTTP API)     |
+--------+---------+     +--------+---------+     +--------+---------+
         |                        |                        |
         +------------------------+------------------------+
                                  |
                          HTTPS / TLS 1.3
                                  |
                    +-------------v--------------+
                    |     Load Balancer (L7)     |
                    |   (AWS ALB / Nginx/Envoy)  |
                    +-------------+--------------+
                                  |
              +-------------------+-------------------+
              |                   |                   |
   +----------v-----+  +----------v-----+  +----------v-----+
   | Collector Pod  |  | Collector Pod  |  | Collector Pod  |
   | (Stateless)    |  | (Stateless)    |  | (Stateless)    |
   |                |  |                |  |                |
   | - Auth/validate|  | - Auth/validate|  | - Auth/validate|
   | - Decompress   |  | - Decompress   |  | - Decompress   |
   | - Basic enrich |  | - Basic enrich |  | - Basic enrich |
   | - Geo-IP lookup|  | - Geo-IP lookup|  | - Geo-IP lookup|
   +-------+--------+  +-------+--------+  +-------+--------+
           |                   |                   |
           +-------------------+-------------------+
                               |
                    +----------v-----------+
                    |    Apache Kafka      |
                    |  (raw-events topic)  |
                    |  40+ partitions      |
                    |  3x replication      |
                    +-----+----------+-----+
                          |          |
            +-------------+          +------------------+
            |                                           |
   +--------v---------+                      +---------v--------+
   |  Stream Processor|                      | Stream Processor |
   |  (Flink / Spark  |                      | (Identity Join)  |
   |   Streaming)     |                      |                  |
   |                  |                      | - Anon->User map |
   | - Sessionize     |                      | - Cross-device   |
   | - Deduplicate    |                      | - Merge profiles |
   | - Enrich         |                      +---------+--------+
   | - Schema valid.  |                                |
   +--------+---------+                      +---------v--------+
            |                                | Identity Graph   |
            |                                | (Redis Cluster)  |
            |                                +------------------+
            |
   +--------v------------------------------------------+
   |              Kafka (enriched-events topic)         |
   +-----+-------------------+------------------+-------+
         |                   |                  |
+--------v------+  +---------v-----+  +--------v-------+
| ClickHouse    |  | Real-Time     |  | Data Warehouse |
| Cluster       |  | Aggregator    |  | Sync (Spark)   |
| (Hot: 30 days)|  | (Druid /      |  |                |
|               |  |  Redis)       |  | - BigQuery     |
| - Raw events  |  |               |  | - Snowflake    |
| - Materialized|  | - Minute-lvl  |  | - Redshift     |
|   views       |  |   counters    |  +----------------+
| - OLAP queries|  | - Live charts |
+--------+------+  +---------+-----+
         |                   |
         +--------+----------+
                  |
         +--------v---------+
         |   Query Service  |
         | (Go / Java API)  |
         |                  |
         | - Funnel engine  |
         | - Retention calc |
         | - Cohort builder |
         | - Segment eval   |
         +--------+---------+
                  |
         +--------v---------+
         |   Cache Layer    |
         |   (Redis / CDN)  |
         +--------+---------+
                  |
         +--------v---------+
         |   Dashboard UI   |
         | (React frontend) |
         +------------------+
```

---

## 5. Event Ingestion Pipeline

### 5.1 Pipeline Stages Overview

```
Client SDK
    |
    | (1) Batch + compress + retry
    v
Collector Service (stateless, horizontally scaled)
    |
    | (2) Auth check, payload validation, geo-IP enrichment
    v
Kafka "raw-events" Topic
    |
    | (3) Flink stream processor reads partitions
    v
Flink Processing Layer
    |-- (3a) Deduplication (Bloom filter / exact Redis set)
    |-- (3b) Schema validation & coercion
    |-- (3c) Identity join (anon_id -> user_id via Redis lookup)
    |-- (3d) Session assignment
    |-- (3e) UTM attribution propagation
    v
Kafka "enriched-events" Topic
    |
    +-------> ClickHouse Writer (batch inserts, 10-sec windows)
    |
    +-------> Real-Time Aggregator (Druid / custom Redis counters)
    |
    +-------> Warehouse Sync (Spark streaming -> Parquet on S3)
```

### 5.2 Collector Service Design

```
+-----------------------------------------------------------+
| Collector Service (single request lifecycle)              |
|                                                           |
| 1. Parse HTTP request body (JSON / gzip+JSON / protobuf)  |
| 2. Authenticate: validate API key against project DB      |
| 3. Rate limit check: token bucket per project_id          |
| 4. Validate top-level schema (required fields present)    |
| 5. Enrich each event:                                     |
|      - Parse IP -> geo (country, region, city)            |
|      - Parse User-Agent -> device, browser, OS            |
|      - Stamp server received_time                         |
|      - Assign insert_id if missing (UUID v7)              |
| 6. Serialize to Avro (schema registry)                    |
| 7. Publish to Kafka partition by (project_id, distinct_id)|
| 8. Return 200 immediately (async processing)              |
+-----------------------------------------------------------+

Capacity:
  - 8 vCPU, 16 GB RAM per pod
  - 50K events/sec per pod (after geo-IP warm cache)
  - 40 pods needed for 2M events/sec peak
  - Geo-IP DB: MaxMind GeoIP2 loaded in memory (~100 MB)
```

### 5.3 Deduplication Strategy

```
Problem: Client retries cause duplicate events
Solution: Multi-layer deduplication

Layer 1: Bloom Filter (Flink in-memory)
  - Check insert_id against per-shard Bloom filter
  - False positive rate: 0.1% (acceptable)
  - Memory: 2^24 bits per shard = 2 MB per shard
  - TTL: rotate hourly (events dedup within 1 hour window)

Layer 2: Redis Exact Dedup (for high-value events)
  - SET dedup:{project_id}:{insert_id} 1 EX 3600
  - Only for "Purchase", "Subscription" event types
  - Cost: ~50 bytes * 2M events/hr = 100 GB Redis RAM (acceptable)

Layer 3: ClickHouse ReplacingMergeTree
  - insert_id is part of unique key
  - FINAL keyword on reads collapses duplicates at query time
```

---

## 6. Event Schema Design

### 6.1 Canonical Event Structure

```json
{
  "schema_version":  "1.0",
  "project_id":      "proj_abc123",

  // Identity fields
  "distinct_id":     "user_42",           // identified user (post-login)
  "anonymous_id":    "anon_device_xyz",   // anonymous identifier (pre-login)
  "device_id":       "dev_iphone_001",    // stable hardware ID (IDFV on iOS)
  "session_id":      "sess_20260301_001", // session-scoped grouping

  // Event core
  "event_name":      "Purchase Completed",
  "insert_id":       "evt_unique_abc123", // idempotency key
  "event_time":      "2026-03-01T12:00:00.123Z",  // client timestamp
  "received_time":   "2026-03-01T12:00:00.512Z",  // server stamp

  // Custom properties (free-form)
  "properties": {
    "product_id":    "prod_456",
    "price":         49.99,
    "currency":      "USD",
    "category":      "Electronics",
    "quantity":      2,
    "coupon_code":   "SPRING10"
  },

  // Auto-collected context
  "context": {
    "ip":            "203.0.113.45",
    "country":       "US",           // geo-enriched server-side
    "region":        "NY",
    "city":          "New York",
    "device_type":   "mobile",
    "os":            "iOS",
    "os_version":    "17.2",
    "browser":       null,
    "app_version":   "3.4.1",
    "screen_width":  390,
    "screen_height": 844,
    "locale":        "en-US",
    "timezone":      "America/New_York"
  },

  // Attribution
  "utm_source":      "google",
  "utm_medium":      "cpc",
  "utm_campaign":    "spring_sale_2026",
  "referrer":        "https://google.com/search?q=..."
}
```

### 6.2 Property Type System

```
String properties:   stored as LowCardinality(String) for high-freq values
Numeric properties:  stored as Float64 / Int64
Boolean properties:  stored as UInt8 (0/1)
Array properties:    stored as Array(String) - serialized
Object properties:   stored as JSON blob, queryable via JSONExtract()

Type coercion rules:
  "true" -> true (Boolean)
  "123"  -> 123  (Number if parseable, else String)
  null   -> omitted (not stored)
  {}     -> skipped (empty object)
```

---

## 7. User Identity Resolution

### 7.1 Anonymous-to-Identified Stitching

```
Timeline of a user's journey:

Day 1: Visit website anonymously
  anonymous_id = "anon_browser_abc"  (stored in localStorage)
  Events: Page Viewed, Sign Up Button Clicked

Day 2: Create account
  Client calls identify("user_42", anonymous_id="anon_browser_abc")
  Server:
    1. Create link: anon_browser_abc -> user_42
    2. Retroactively re-attribute past anon events to user_42
    3. Merge anonymous profile into user_42 profile

Result: All events before + after login attributed to user_42

+------------------+     identify()     +------------------+
| anon_browser_abc |  ===============>  |    user_42       |
| (3 events)       |                    | (3 + N events)   |
+------------------+                    +------------------+
```

### 7.2 Cross-Device Identity Graph

```
Device A (iPhone):  device_id = "dev_iphone_001"
Device B (MacBook): device_id = "dev_mac_002"
Device C (iPad):    device_id = "dev_ipad_003"

User logs in on all three devices with user_42:

+---------------+     +---------------+     +---------------+
| dev_iphone_001|     | dev_mac_002   |     | dev_ipad_003  |
+-------+-------+     +-------+-------+     +-------+-------+
        |                     |                     |
        +---------------------+---------------------+
                              |
                        +-----v------+
                        |  user_42   |  (canonical identity)
                        +------------+
                        | Properties |
                        | History    |
                        | Cohorts    |
                        +------------+

Identity Graph Storage (Redis):
  device:proj1:dev_iphone_001 -> "user_42"
  device:proj1:dev_mac_002    -> "user_42"
  device:proj1:dev_ipad_003   -> "user_42"
  user:proj1:user_42:devices  -> {"dev_iphone_001", "dev_mac_002", "dev_ipad_003"}

Query time resolution:
  Given device_id, look up canonical user_id in O(1)
  Cross-device funnel: union all device events by resolved user_id
```

### 7.3 User Merge (Alias)

```
Scenario: User creates account on phone (user_phone_99)
          then logs in on web where old account exists (user_web_55)
          These are the same person -> merge

POST /api/v1/alias
{
  "alias":     "user_phone_99",
  "distinct_id": "user_web_55"
}

Resolution:
  1. Mark user_phone_99 as "merged_into: user_web_55"
  2. All future events from user_phone_99 routed to user_web_55
  3. Historical events re-attributed (async backfill job)
  4. Properties merged: user_web_55 properties win on conflict

Merge is NOT bidirectional - canonical ID wins
```

---

## 8. Funnel Analysis

### 8.1 Ordered Step Conversion Algorithm

```
Funnel: [Step A] -> [Step B] -> [Step C]
Conversion window: 7 days

Naive SQL approach (ClickHouse):

WITH
  a_events AS (
    SELECT distinct_id, min(event_time) AS step_a_time
    FROM events
    WHERE event_name = 'Page Viewed' AND project_id = 123
      AND event_time BETWEEN '2026-02-01' AND '2026-03-01'
    GROUP BY distinct_id
  ),
  b_events AS (
    SELECT e.distinct_id, min(e.event_time) AS step_b_time
    FROM events e
    JOIN a_events a ON e.distinct_id = a.distinct_id
    WHERE e.event_name = 'Sign Up Clicked'
      AND e.event_time > a.step_a_time
      AND e.event_time <= a.step_a_time + INTERVAL 7 DAY
    GROUP BY e.distinct_id
  ),
  c_events AS (
    SELECT e.distinct_id, min(e.event_time) AS step_c_time
    FROM events e
    JOIN b_events b ON e.distinct_id = b.distinct_id
    WHERE e.event_name = 'Account Created'
      AND e.event_time > b.step_b_time
      AND e.event_time <= b.step_b_time + INTERVAL 7 DAY
    GROUP BY e.distinct_id
  )
SELECT
  (SELECT count(*) FROM a_events)              AS step_a_count,
  (SELECT count(*) FROM b_events)              AS step_b_count,
  (SELECT count(*) FROM c_events)              AS step_c_count;

Performance optimization:
  - Read only distinct_id, event_name, event_time from columnar store
  - Filter partition by date range first
  - Use bitmap intersections for large-scale funnels
  - Pre-compute user-event occurrence timestamps in posting lists
```

### 8.2 Time-Windowed Funnels

```
Window types:

1. Session window: All steps must occur within same session
   - Strict: steps in exact order within session
   - Any order: all steps occur in session regardless of order

2. Day window: Convert within N calendar days
   - Window resets at midnight
   - Example: Step A on Monday, Step B must be by next Monday

3. Sliding window: N days from Step A completion
   - Example: Step A at 3pm Tuesday, window closes 3pm next Tuesday

4. Unordered funnel: All steps completed regardless of order
   - Used for feature adoption analysis

+------ 7-Day Conversion Window ------+
|                                      |
| Day 0: [Step A]                      |
| Day 1: ...                           |
| Day 3: [Step B]                      |
| Day 7: [Step C]  <- last day allowed |
| Day 8: too late!                     |
+--------------------------------------+
```

### 8.3 Drop-Off Analysis

```
After computing funnel counts:
  Step A: 1,000,000 users
  Step B:   350,000 users  (650,000 dropped after A)
  Step C:   280,000 users  ( 70,000 dropped after B)
  Step D:    42,000 users  (238,000 dropped after C)

Drop-off analysis features:
  1. Who dropped: Export user list for each drop-off segment
  2. Why they dropped: Common properties of dropped users vs converters
     - "US users convert 2x better than EU users at Step B"
     - "iOS users drop at Step C 30% more than Android"
  3. When they dropped: Time distribution histogram
     - Most drop within first hour, or spike at 3-7 days
  4. Where they went: Next events after dropping
     - 40% of Step B drop-offs viewed competitor page
```

---

## 9. Cohort Analysis

### 9.1 Retention Cohorts

```
Retention Cohort Table (Day-N format):

Cohort     | Size   | Day 0 | Day 1 | Day 7 | Day 14 | Day 30
-----------+--------+-------+-------+-------+--------+--------
Jan Week 1 | 12,500 | 100%  | 42%   | 23%   | 18%    | 12%
Jan Week 2 | 11,800 | 100%  | 44%   | 25%   | 19%    | 13%
Jan Week 3 | 10,200 | 100%  | 38%   | 20%   | 15%    | 10%
Feb Week 1 | 13,100 | 100%  | 46%   | 27%   | 21%    | N/A

Color coding: >30% green, 20-30% yellow, <20% red
Helps spot product changes that impacted retention
```

### 9.2 Behavioral Cohorts

```
Behavioral cohort: Users grouped by action they DID or DID NOT take

Examples:
  - "Users who completed onboarding tutorial within Day 1"
  - "Users who invited >= 3 friends within 7 days of signup"
  - "Users who never enabled notifications"
  - "Power users: >= 10 sessions in first 30 days"

Cohort builder:
  Cohort = {
    name: "Tutorial Completers",
    criteria: [
      { event: "Tutorial Completed", time_from_signup: "0d", time_to_signup: "1d" }
    ]
  }

Cohort computation (ClickHouse):
  CREATE MATERIALIZED VIEW cohort_tutorial_completers
  AS SELECT DISTINCT distinct_id
  FROM events
  WHERE event_name = 'Tutorial Completed'
    AND event_time <= (
      SELECT first_seen_at + INTERVAL 1 DAY
      FROM user_profiles WHERE distinct_id = events.distinct_id
    );

Then compare retention of tutorial_completers vs others:
  Tutorial Completers Day-30 retention: 24%
  Non-completers Day-30 retention:       8%
  -> Tutorial completion is 3x retention predictor
```

### 9.3 Cohort Comparison

```
Compare multiple cohorts side-by-side:

              Day 1  Day 7  Day 14  Day 30
Tutorial:     62%    35%    28%     24%
No Tutorial:  38%    18%    12%      8%
Invited User: 71%    45%    38%     31%
Paid Plan:    80%    60%    52%     45%

Visualized as overlapping line charts
Statistical significance: chi-squared test between cohorts
Export: CSV download of user_ids per cohort for retargeting
```

---

## 10. Retention Analysis

### 10.1 Day-N Retention

```
Definition: % of users from cohort who performed return_event exactly N days
after their cohort_event date (calendar day difference).

Computation:
  cohort_date = date(first "Account Created" event)
  return_date = date(any "Session Started" event)
  N = return_date - cohort_date

  Day-7 retention = count(users with N=7) / cohort_size

ClickHouse query:
  SELECT
    cohort_date,
    cohort_size,
    countIf(day_diff = 1)  / cohort_size AS day_1,
    countIf(day_diff = 7)  / cohort_size AS day_7,
    countIf(day_diff = 30) / cohort_size AS day_30
  FROM (
    SELECT
      p.distinct_id,
      toDate(p.first_seen_at)                             AS cohort_date,
      count() OVER (PARTITION BY toDate(p.first_seen_at)) AS cohort_size,
      dateDiff('day', p.first_seen_at, e.event_time)      AS day_diff
    FROM user_profiles p
    JOIN events e ON p.distinct_id = e.distinct_id
    WHERE e.event_name = 'Session Started'
  )
  GROUP BY cohort_date, cohort_size
  ORDER BY cohort_date;
```

### 10.2 Rolling Retention

```
Definition: % of users who performed the return_event on day N OR ANY day after N.
This answers: "Are they still active 30+ days in?"

Rolling Day-30 = count(users with at least one event on day >= 30) / cohort_size

More forgiving than Day-N: user might skip Day 30 but come back Day 32

Rolling vs Day-N comparison:
  Day-N  retention at Day 30: 12% (came back exactly on day 30)
  Rolling retention at Day 30: 35% (active at any point after day 30)
```

### 10.3 Unbounded Retention

```
Definition: % of the original cohort who have ever returned after N days,
with no upper bound on the return window.

Useful for measuring long-term product value:
  "Of users who signed up in Jan 2024, what % ever came back after 1 year?"

Unbounded Day-365 = 8% for most consumer apps (healthy: 15-20%)

Implementation:
  Pre-compute per user: last_active_date
  JOIN with cohort date, compute days_since_cohort for last_active
  Unbounded Day-N = count(last_active_days_since_cohort >= N) / cohort_size
```

---

## 11. Real-Time Dashboards

### 11.1 Streaming Aggregation Architecture

```
Kafka enriched-events topic
          |
          | (consume at 2M events/sec)
          v
+----------------------------+
|   Flink Streaming Job      |
|                            |
|   Window: 1-minute tumbling|
|   Key by: (project, event) |
|                            |
|   Aggregates:              |
|   - count()                |
|   - approx_count_distinct()|  <- HyperLogLog for unique users
|   - sum(numeric_property)  |
|   - p50/p95/p99 (t-digest) |
+----------+-----------------+
           |
           | (every 60 seconds, emit aggregated rows)
           v
+----------------------------+      +----------------------------+
|   Redis Time Series        |      |  ClickHouse               |
|   (real-time: last 24h)    |      |  (historical: 30+ days)   |
|                            |      |                            |
|   Key: {proj}:{event}      |      |  Table: event_counts_1min  |
|   Value: (count, uniq_hll) |      |  Partition: by month       |
+----------------------------+      +----------------------------+
           |                                   |
           +-----------------------------------+
                         |
                +--------v--------+
                |  Query Service  |
                |                 |
                | last 1h  -> Redis (< 10ms)
                | last 24h -> Redis (< 50ms)
                | last 30d -> ClickHouse (< 3s)
                +-----------------+
```

### 11.2 Pre-Computed vs On-Demand Queries

```
+-----------------------------+---------------------------+
| Pre-Computed (Materialized) | On-Demand (Ad Hoc)        |
+-----------------------------+---------------------------+
| Simple event counts         | Complex multi-step funnels|
| Unique user counts (HLL)    | Arbitrary property filters|
| Time series per event       | Cohort comparisons        |
| Top property values         | Custom formula metrics    |
| Retention day-N grids       | Cross-project analytics   |
+-----------------------------+---------------------------+
| Response: < 100ms           | Response: 1-10 seconds    |
| Storage: high (many rows)   | Storage: raw events only  |
| Freshness: 60-second lag    | Freshness: real-time      |
+-----------------------------+---------------------------+

Decision: pre-compute standard reports, on-demand for ad-hoc

Pre-computation schedule:
  Minutely: event counts, unique users (HLL)
  Hourly:   top property breakdowns, funnel macro stats
  Daily:    retention cohort matrices, full user segments
  Weekly:   executive summary reports, A/B test results
```

---

## 12. Session Reconstruction

### 12.1 Sessionization Algorithm

```
Problem: Client events have no session boundaries.
         Need to group events into sessions.

Algorithm: 30-minute inactivity timeout (industry standard)

Flink Stateful Sessionization:
  State: per (project_id, distinct_id) -> {
    current_session_id: String,
    last_event_time: Timestamp
  }

  For each incoming event (ordered by event_time):
    gap = event_time - last_event_time

    IF gap > 30 minutes OR no previous session:
      session_id = generate_session_id()  // UUID v7
      session_start = event_time
    ELSE:
      session_id = current_session_id

    Annotate event with session_id
    Update state: {current_session_id, last_event_time = event_time}

  Session timeout: Flink session window or TTL on state

Edge cases:
  - Background app events: don't extend session
  - Timezone changes: use UTC throughout
  - Clock skew: accept events up to 5 min in future, 24h in past
```

### 12.2 Page Flow (Sankey Diagram)

```
Session reconstruction enables page flow analysis:

Session 1 (user_42):
  /home -> /pricing -> /signup -> /onboarding -> /dashboard

Session 2 (user_43):
  /home -> /pricing -> (30 min gap) new session -> /pricing -> exit

Page flow Sankey:
  /home (100K) ---60%---> /pricing (60K) ---30%---> /signup (18K)
               ---25%---> /features (25K)
               ---15%---> exit (15K)

Computation:
  SELECT
    page_from,
    page_to,
    count() AS transitions
  FROM (
    SELECT
      event_name AS page_from,
      leadInFrame(event_name) OVER (
        PARTITION BY session_id ORDER BY event_time
      ) AS page_to
    FROM events
    WHERE project_id = 123 AND event_name = 'Page Viewed'
  )
  WHERE page_to IS NOT NULL
  GROUP BY page_from, page_to
  ORDER BY transitions DESC;
```

### 12.3 Session Metrics

```
Session-level aggregates (computed post-sessionization):

CREATE TABLE sessions AS
SELECT
  project_id,
  distinct_id,
  session_id,
  min(event_time)                    AS session_start,
  max(event_time)                    AS session_end,
  dateDiff('second', min(event_time), max(event_time)) AS duration_seconds,
  count()                            AS event_count,
  countIf(event_name = 'Page Viewed') AS page_views,
  any(country)                       AS country,
  any(device_type)                   AS device_type,
  any(utm_source)                    AS utm_source
FROM events
GROUP BY project_id, distinct_id, session_id;

Typical session metrics:
  Avg session duration:  4m 32s
  Avg pages per session: 3.8
  Bounce rate (1 page):  38%
  Sessions per user/day: 2.1
```

---

## 13. OLAP Storage Engine

### 13.1 ClickHouse Architecture

```
Why ClickHouse for analytics:
  - Columnar storage: reads only needed columns (10-100x speedup)
  - Vectorized query execution: SIMD operations on column batches
  - MergeTree engine: sorted primary key for range scans
  - LZ4/ZSTD compression: 10:1 ratio on event data
  - Horizontal sharding via Distributed tables
  - Async materialized views for pre-aggregation

ClickHouse cluster layout:
  +---------------+     +---------------+     +---------------+
  |   Shard 1     |     |   Shard 2     |     |   Shard 3     |
  |               |     |               |     |               |
  | Replica 1 (R) |     | Replica 1 (R) |     | Replica 1 (R) |
  | Replica 2 (R) |     | Replica 2 (R) |     | Replica 2 (R) |
  +-------+-------+     +-------+-------+     +-------+-------+
          |                     |                     |
          +---------------------+---------------------+
                                |
                    +-----------v-----------+
                    |   ClickHouse Keeper   |
                    |   (ZooKeeper API,     |
                    |    native ClickHouse) |
                    +-----------------------+

Sharding key: cityHash64(project_id, distinct_id)
Replication: async via ReplicatedMergeTree (per shard, 2 replicas)
Reads: Distributed table fans out to all shards, merges results
```

### 13.2 Star Schema Design

```
Fact Table: events (columnar, 100B rows/day)
  - event_time, project_id, distinct_id, event_name
  - All properties (dynamic columns or JSON)

Dimension Tables (small, cached):
  - dim_projects  (project_id -> api_key, name, settings)
  - dim_users     (distinct_id -> traits, cohort memberships)
  - dim_events    (event_name -> schema definition, display name)

Pre-aggregated Fact Tables:
  - event_counts_1min     (project, event, minute -> count, hll)
  - event_counts_1hour    (project, event, hour -> count, hll)
  - event_counts_1day     (project, event, day -> count, hll)
  - property_breakdown_1d (project, event, property, value, day -> count)
  - funnel_daily          (project, funnel_id, date -> step counts)
  - retention_grid        (project, cohort_date, N -> retained_count)

Data flow:
  raw events -> 1min aggregates (Flink) -> 1h rollup (scheduled) -> 1d rollup
```

### 13.3 Druid for Real-Time OLAP

```
Apache Druid excels at sub-second analytics on streaming data:

Druid ingestion:
  Kafka -> Druid Real-Time Tasks (indexing in memory)
              -> Publish to Historical Nodes (every 10 min)

Druid segment layout:
  Segment = time chunk (1 hour) * shard by dimension
  Each segment: columnar, compressed, with bitmap indexes

Druid vs ClickHouse:
  ClickHouse: better for complex SQL, large batch queries
  Druid:      better for real-time ingestion, sub-second slice-and-dice

Hybrid approach:
  Real-time (< 1 hour):  Druid (< 500ms response)
  Historical (> 1 hour): ClickHouse (< 3s for 30 days)
  Query router: checks time range, routes accordingly
```

---

## 14. Query Engine

### 14.1 Dimensional Roll-Up

```
Roll-up hierarchy: minute -> hour -> day -> week -> month

Query planner chooses pre-aggregated table based on:
  - Time range requested
  - Granularity requested
  - Presence of dimension filters

Example: "Show page views per day for last 30 days, grouped by country"
  -> Use event_counts_1day table (not raw events)
  -> 30 rows * 200 countries = 6,000 rows scanned (vs 100B raw events)
  -> Response time: 50ms vs 30 seconds

Roll-up table selection logic:
  time_range > 7 days  AND granularity = day   -> use event_counts_1day
  time_range > 1 day   AND granularity = hour  -> use event_counts_1hour
  time_range > 1 hour  AND granularity = min   -> use event_counts_1min
  time_range < 1 hour  OR  custom filters      -> use raw events table
```

### 14.2 Time Series Bucketing

```
ClickHouse time bucketing functions:
  toStartOfMinute(event_time)    -- minute buckets
  toStartOfHour(event_time)      -- hour buckets
  toStartOfDay(event_time)       -- day buckets
  toStartOfWeek(event_time)      -- ISO week buckets
  toStartOfMonth(event_time)     -- month buckets

Example query (events per hour for last 7 days):
  SELECT
    toStartOfHour(event_time) AS hour,
    count()                   AS events,
    uniqHLL12(distinct_id)    AS unique_users
  FROM events
  WHERE project_id = 123
    AND event_name = 'Page Viewed'
    AND event_time >= now() - INTERVAL 7 DAY
  GROUP BY hour
  ORDER BY hour;

Gap filling for missing time buckets:
  Use WITH FILL ... STEP INTERVAL 1 HOUR in ORDER BY
  to ensure every hour appears even with zero events
```

### 14.3 Approximate Counting (HyperLogLog)

```
Problem: COUNT(DISTINCT user_id) for 100B events is slow and memory-intensive

Solution: HyperLogLog (HLL) - probabilistic cardinality estimator

Properties:
  Error rate:    0.81% / sqrt(m) where m = register count
  Memory:        12 KB for 2^14 registers (standard HLL)
  Accuracy:      ~1-2% error with 16KB state
  Mergeability:  HLL sketches can be combined (union = OR)

ClickHouse implementation:
  -- Store HLL sketch during pre-aggregation:
  INSERT INTO event_counts_1min
  SELECT
    project_id,
    event_name,
    toStartOfMinute(event_time),
    count()                         AS event_count,
    uniqHLL12State(distinct_id)     AS unique_users_hll
  FROM events
  GROUP BY 1, 2, 3;

  -- Query: merge HLL sketches across time buckets:
  SELECT
    event_name,
    sum(event_count)                       AS total_events,
    uniqHLL12Merge(unique_users_hll)       AS unique_users
  FROM event_counts_1min
  WHERE event_time BETWEEN '2026-02-01' AND '2026-03-01'
  GROUP BY event_name;

  -- Merge HLL for 10K minute buckets = microseconds vs 100B row scan
```

---

## 15. A/B Testing Integration

### 15.1 Experiment Assignment

```
Assignment flow:
  1. User makes request to your product
  2. Experiment service called: GET /assign?user_id=42&experiment=exp_123
  3. Deterministic hash: bucket = murmurhash(user_id + exp_id) % 100
     bucket 0-49  -> control   (variant_a)
     bucket 50-99 -> treatment (variant_b)
  4. Assignment logged: track("Experiment Viewed", { experiment_id, variant_id })
  5. Assignment cached: Redis TTL 30 days (sticky assignment)

+---------------+    hash(user+exp)    +------------------+
| Experiment    | ===================> | Variant          |
| Service       |      % 100           | Assignment       |
|               |                      | (deterministic)  |
+---------------+                      +------------------+
        |                                      |
        v                                      v
  Log "Experiment                      Cache in Redis
   Viewed" event                       (sticky sessions)
```

### 15.2 Statistical Significance

```
Experiment results table:
  Variant A (Control):  50,000 users, 2,500 conversions (5.0%)
  Variant B (Treatment): 50,200 users, 3,014 conversions (6.0%)

Statistical test: Two-proportion Z-test
  p_A = 2500 / 50000 = 0.050
  p_B = 3014 / 50200 = 0.060
  p_pool = (2500 + 3014) / (50000 + 50200) = 0.0551

  SE = sqrt(p_pool * (1 - p_pool) * (1/n_A + 1/n_B))
     = sqrt(0.0551 * 0.9449 * (1/50000 + 1/50200))
     = 0.00145

  Z = (p_B - p_A) / SE = (0.060 - 0.050) / 0.00145 = 6.90

  p-value < 0.0001  (threshold: 0.05)
  Confidence: 99.99%  -> Statistically significant!

  Relative lift: (6.0 - 5.0) / 5.0 = 20% improvement

Bayesian alternative (Amplitude's approach):
  Model conversion as Beta distribution
  P(variant_B > variant_A) computed as integral
  More intuitive: "91% probability treatment is better"
  No fixed sample size needed; monitor continuously
```

### 15.3 Sample Size Calculator

```
Given:
  Baseline conversion rate: p = 5%
  Minimum detectable effect: 10% relative (0.5% absolute)
  Statistical power: 80%  (beta = 0.20)
  Significance level: 5%  (alpha = 0.05)

Formula:
  n = 2 * (z_alpha + z_beta)^2 * p * (1 - p) / (delta^2)
    = 2 * (1.96 + 0.84)^2 * 0.05 * 0.95 / (0.005)^2
    = 2 * 7.84 * 0.0475 / 0.000025
    = ~29,800 per variant

  Total users needed: ~60,000
  At 1000 exposures/day: ~60 days to reach significance

API:
  POST /api/v1/experiments/sample-size
  {
    "baseline_rate": 0.05,
    "minimum_detectable_effect": 0.10,
    "power": 0.80,
    "significance": 0.05,
    "daily_traffic": 1000
  }

  Response:
  {
    "sample_size_per_variant": 29800,
    "total_sample_size": 59600,
    "days_to_significance": 60
  }
```

---

## 16. Data Sampling

### 16.1 Progressive Sampling for UI Responsiveness

```
Problem: User queries 12 months of data. Full scan = 30 seconds.
Goal:    Return approximate result in < 2 seconds.

Progressive sampling strategy:
  1. Run query on 1% sample first (< 200ms)
     Show result immediately with "~1% sample" indicator
  2. Simultaneously run query on 10% sample (< 1s)
     Update result with tighter confidence interval
  3. Run on 100% sample in background (3-30s)
     Final update removes sampling indicator

ClickHouse SAMPLE clause:
  SELECT count() * 100 AS estimated_count    -- scale by sample factor
  FROM events SAMPLE 0.01                     -- 1% random sample
  WHERE project_id = 123
    AND event_name = 'Purchase Completed'
    AND event_time >= '2025-01-01'

Confidence interval display:
  Estimated: 4,230,000 ± 42,000 (99% CI at 1% sample)
  Show progress bar while full query runs
```

### 16.2 Stratified Sampling

```
Problem: Random sampling misses rare events (conversion rate 0.1%)
Solution: Stratified sampling preserves distribution

Stratify by:
  - Event type: ensure rare events sampled proportionally
  - User segment: ensure small cohorts represented
  - Time bucket: ensure each time period represented equally

Implementation in ClickHouse:
  SELECT *
  FROM events
  WHERE project_id = 123
    AND (
      event_name = 'Purchase Completed'   -- 100% sample rare conversions
      OR (
        event_name != 'Purchase Completed'
        AND cityHash64(distinct_id) % 100 < 10  -- 10% sample common events
      )
    )

Weighted aggregation:
  SELECT
    event_name,
    sum(CASE WHEN event_name = 'Purchase Completed' THEN 1 ELSE 10 END) AS weighted_count
  FROM sampled_events
  GROUP BY event_name;
```

---

## 17. Privacy and Consent

### 17.1 Cookie-Less Tracking

```
Traditional: Third-party cookies for cross-site tracking
             -> Blocked by Safari ITP, Firefox ETP, Chrome CHIPS

Cookie-less alternatives:

1. First-party device fingerprint:
   - Canvas fingerprint + screen resolution + fonts
   - User-Agent + timezone + language
   - Deterministic hash -> pseudonymous device_id
   - Limitation: ~5% collision rate, changes with browser updates

2. Server-side session ID:
   - Set HttpOnly, SameSite=Strict first-party cookie
   - Rotated every session for privacy
   - Works within same domain; not cross-site

3. Client hints (browser API):
   - Accept-CH header requests Sec-CH-UA-* headers
   - More stable than User-Agent sniffing
   - Privacy preserving by design

4. PPID (Publisher-Provided ID):
   - User logs in -> hash(email) -> stable cross-session ID
   - No PII stored; deterministic hash is irreversible

Recommendation: Combine (2) + (4) for authenticated users,
               (1) for anonymous users with consent.
```

### 17.2 Server-Side Events

```
Problem: Ad blockers block client SDK calls to analytics domains

Solution: Proxy via first-party domain (same origin as product)

Architecture:
  Browser -> POST /analytics/collect (your domain, not analytics vendor)
                |
                v (server-side, hidden from ad blocker)
            Your Server -> Analytics Collector

Implementation:
  // Nginx reverse proxy
  location /analytics/collect {
    proxy_pass https://api.your-analytics.com/v1/track;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_hide_header X-Analytics-*;
  }

Benefits:
  - Bypasses browser-level ad blockers
  - IP is your server's IP (privacy benefit for users)
  - No cross-origin request issues

Server-side enrichment:
  Can add server-validated properties (e.g., user tier from auth service)
  Cannot be spoofed by client (unlike client-side properties)
```

### 17.3 GDPR Data Deletion

```
GDPR Right to Erasure: Delete all user data within 30 days of request

Challenge: Event data is stored in immutable columnar tables.
           Cannot delete individual rows efficiently.

Strategy: Pseudonymization + Key Rotation

1. All events store pseudonymous_id (not real user_id)
   Map: real_user_id -> pseudonymous_id (stored in separate table)

2. On deletion request:
   DELETE FROM identity_map WHERE user_id = 'user_42'
   -> pseudonymous_id becomes orphaned, unresolvable to any person
   -> Events remain but are no longer linkable to the user

3. For truly PII properties (email in event payload):
   Run async deletion job:
     UPDATE events SET properties = mapDelete(properties, 'email')
     WHERE distinct_id IN (
       SELECT pseudonymous_id FROM deleted_users
       WHERE deleted_at > now() - INTERVAL 30 DAY
     )
   ClickHouse supports mutations (ALTER TABLE ... DELETE/UPDATE)
   Schedule for off-peak hours (expensive operation)

4. Consent management:
   Track consent per user per purpose:
   { user_id, purpose: "analytics", consented: true, timestamp }
   Reject ingestion for users who revoked consent

5. Data retention enforcement:
   TTL on raw events table:
   ALTER TABLE events MODIFY TTL date + INTERVAL 365 DAY;
   ClickHouse automatically drops expired partitions.
```

---

## 18. Client SDK Design

### 18.1 SDK Architecture

```
+--------------------------------------------------+
|              Analytics Client SDK                |
|                                                  |
|  +------------+    +----------+    +----------+  |
|  | Public API |    | Batcher  |    | Storage  |  |
|  | track()    | -> | Queue    | -> | (disk)   |  |
|  | identify() |    | (memory) |    | Offline  |  |
|  | page()     |    +----+-----+    | Queue    |  |
|  +------------+         |         +----------+  |
|                    +----v-----+                  |
|                    | Flusher  |                  |
|                    |          |                  |
|                    | Batch up |                  |
|                    | to 100   |                  |
|                    | events   |                  |
|                    | or 5 sec |                  |
|                    +----+-----+                  |
|                         |                        |
|                    +----v-----+                  |
|                    | HTTP     |                  |
|                    | Client   |                  |
|                    |          |                  |
|                    | Compress |                  |
|                    | Retry    |                  |
|                    | Backoff  |                  |
|                    +----------+                  |
+--------------------------------------------------+
```

### 18.2 Batching Strategy

```
Flush triggers (whichever comes first):
  1. Batch size >= 100 events
  2. Time elapsed >= 5 seconds since last flush
  3. App goes to background (iOS UIApplicationWillResignActive)
  4. SDK.flush() called explicitly (e.g., before logout)

Batch payload construction:
  {
    "batch": [ event1, event2, ..., event100 ],
    "sent_at": "2026-03-01T12:00:01.000Z"
  }
  Gzip compressed -> ~80% size reduction
  Content-Encoding: gzip header

Memory queue capacity: 500 events max
  If queue full: drop oldest event, log warning
  Alternative: write to disk (more expensive)
```

### 18.3 Retry with Exponential Backoff

```
Retry policy:
  Attempt 1: immediate
  Attempt 2: 1 second delay
  Attempt 3: 2 seconds delay
  Attempt 4: 4 seconds delay
  Attempt 5: 8 seconds delay
  Max attempts: 5
  Max delay: 30 seconds

  delay = min(base * 2^attempt + jitter, max_delay)
  jitter = random(0, 1000ms)  -- prevent thundering herd

Retry conditions:
  Retry on:    5xx errors, network timeout, DNS failure
  Do NOT retry: 4xx errors (auth failure, bad payload - client bug)

Code pattern (TypeScript):
  async function sendWithRetry(batch: Event[], attempt = 0): Promise<void> {
    try {
      await httpClient.post('/v1/track', batch, { timeout: 10000 })
    } catch (error) {
      if (attempt >= MAX_RETRIES || !isRetryable(error)) {
        persistToOfflineQueue(batch)
        return
      }
      const delay = Math.min(BASE_DELAY * Math.pow(2, attempt) + jitter(), MAX_DELAY)
      await sleep(delay)
      await sendWithRetry(batch, attempt + 1)
    }
  }
```

### 18.4 Offline Queue

```
Mobile use case: user loses connectivity, events must not be lost

Offline queue implementation:
  Storage: SQLite on device (iOS/Android)
  Schema:
    CREATE TABLE offline_queue (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      payload    TEXT NOT NULL,         -- JSON encoded event batch
      created_at INTEGER NOT NULL,      -- Unix timestamp
      attempts   INTEGER DEFAULT 0
    );

  On network offline:  write batch to SQLite instead of HTTP
  On network restored: read from SQLite, send in order, delete on success
  Max offline storage: 100,000 events (configurable)
  Eviction policy: drop oldest when limit exceeded

  iOS lifecycle integration:
    - Listen to Reachability changes (SCNetworkReachability)
    - Flush on WillResignActive (app background)
    - Process queue on DidBecomeActive (app foreground)
```

### 18.5 Payload Compression

```
Before sending:
  Raw JSON payload: 50,000 bytes (100 events * 500 bytes)
  After Gzip:       ~10,000 bytes (80% reduction)
  After Snappy:     ~15,000 bytes (70% reduction, faster)

Browser SDK:
  fetch('/v1/track', {
    method: 'POST',
    headers: { 'Content-Encoding': 'gzip', 'Content-Type': 'application/json' },
    body: await compress(JSON.stringify(payload))  // CompressionStream API
  })

Mobile SDK:
  NSData *compressed = [NSData dataWithBytes:... length:...];  // zlib
  request.HTTPBody = [payload compressedDataUsingAlgorithm:LZFSE];

Server-side decompression:
  Collector auto-detects Content-Encoding header
  Supported: gzip, deflate, br (Brotli), zstd
```

---

## 19. Data Pipeline Stages

### 19.1 Pipeline Overview

```
Stage 1: RAW
  - Events as received from client SDK
  - Minimal validation (required fields present)
  - Stored in Kafka indefinitely (configurable retention)
  - Schema: as-is from client, no transformation

Stage 2: CLEANED
  - Invalid events filtered (malformed JSON, missing project_id)
  - PII fields redacted (email, phone -> hashed or removed)
  - Timestamps normalized to UTC
  - insert_id deduplication applied
  - Schema: same as raw + server stamps

Stage 3: ENRICHED
  - Identity resolution applied (anon -> user)
  - Geo-IP lookup completed (country, city)
  - User-Agent parsed (device, browser, OS)
  - Session ID assigned
  - UTM attribution propagated (first-touch / last-touch)
  - Schema: raw + identity_resolved_distinct_id, session_id, geo_*, device_*

Stage 4: AGGREGATED
  - Rolled up to time buckets (1min, 1hr, 1day)
  - HyperLogLog sketches computed for unique users
  - Property value distributions computed
  - Funnel step completion counts
  - Retention grid updates
  - Schema: dimensional aggregates, not individual events
```

### 19.2 Schema-on-Read vs Schema-on-Write

```
+-----------------------+---------------------------+
| Schema-on-Write       | Schema-on-Read            |
+-----------------------+---------------------------+
| Define columns ahead  | Store JSON blob raw       |
| Strict type checking  | Parse at query time       |
| Fast reads            | Flexible schema evolution |
| Less storage (typed)  | More storage (verbose)    |
| Harder to add fields  | No migration needed       |
+-----------------------+---------------------------+

Analytics platform approach: HYBRID

Core fields: Schema-on-Write (event_name, distinct_id, timestamp)
  - Indexed, strongly typed, fast queries

Custom properties: Schema-on-Read (properties JSON blob)
  - Flexible: customers define their own event schemas
  - JSONExtract at query time: JSONExtractString(properties, 'product_id')
  - ClickHouse supports JSON path pushdown for performance

Property schema registry (optional):
  Customers can define schemas per event type
  Enables: type validation at ingestion, autocomplete in UI
  Storage: registered schemas in PostgreSQL
```

---

## 20. Scaling Strategy

### 20.1 Ingestion Layer Scaling

```
Collector service:
  - Stateless; scale horizontally with HPA (Kubernetes)
  - Target: 50K events/pod/sec
  - At 2M events/sec: 40 pods * 2 for HA = 80 pods
  - Auto-scale trigger: CPU > 60% or queue depth > 10K

Kafka scaling:
  - Add partitions to raw-events topic as throughput grows
  - Partition count = max_throughput / throughput_per_partition
  - At 2M events/sec / 50K per partition = 40 partitions
  - Brokers: 20 brokers for 40 partitions with replication factor 3
  - Tiered storage: Kafka -> S3 for infinite retention

Flink scaling:
  - Parallelism = partition count (40 task slots)
  - State backend: RocksDB (spills to disk, handles large state)
  - Checkpointing: every 30 seconds to S3 for fault tolerance
```

### 20.2 Storage Layer Scaling

```
ClickHouse scaling strategy:

Vertical scaling (per node):
  - More RAM: larger caches, faster GROUP BY
  - More CPU: faster vectorized computation
  - NVMe SSD: faster MergeTree compaction

Horizontal sharding:
  - Shard by project_id (tenant isolation)
  - Each shard has 2 replicas (fault tolerance)
  - Distributed table: fan-out reads across all shards
  - Add shards as storage grows: linear scale

Hot/Warm/Cold tiering:
  Hot (0-30 days):   Local NVMe SSD, ClickHouse cluster
  Warm (30-90 days): Attached EBS volumes, query on-demand
  Cold (90+ days):   Parquet on S3, query via ClickHouse S3 engine
  Archive (2+ years): Glacier, restored on request

Query caching:
  Redis: cache dashboard queries (TTL 60 seconds)
  Query hash: MD5(project_id + query_params + time_range_bucket)
  Hit rate target: 70%+ for standard dashboard queries
```

### 20.3 Multi-Tenancy Isolation

```
Tenant isolation strategies:

1. Shared cluster, logical isolation (default):
   - All tenants in same ClickHouse cluster
   - project_id in every WHERE clause
   - Partitioned by (project_id, date)
   - Row-level security via query middleware
   - Cost: cheap; Risk: noisy neighbor

2. Dedicated cluster per large tenant:
   - Enterprise customers with high query volume
   - Dedicated Kafka topic, ClickHouse shard
   - Complete data isolation
   - Cost: expensive; Risk: over-provisioned

3. Resource quotas (middle ground):
   - ClickHouse user quotas per project_id
   - Max concurrent queries: 10 per project
   - Max memory per query: 16 GB
   - Max query duration: 60 seconds
   - Rate limit on Collector API: per API key
```

---

## 21. Trade-offs

### 21.1 Key Design Trade-offs

| Decision | Option A | Option B | Choice | Reasoning |
|----------|----------|----------|--------|-----------|
| Query engine | ClickHouse | BigQuery | ClickHouse | Lower latency (<3s vs 5-30s), self-hosted, cost-controlled |
| Streaming | Kafka + Flink | Kinesis + Lambda | Kafka + Flink | Higher throughput, stateful processing, no per-event cost |
| Identity resolution | Synchronous (in-request) | Asynchronous (post-ingestion) | Async | Collector stays fast (<10ms); identity join offline |
| Unique user counting | Exact COUNT DISTINCT | HyperLogLog | HLL | 1-2% error acceptable; 100x memory savings |
| Funnel computation | Pre-computed | On-demand | Hybrid | Pre-compute common funnels; on-demand for ad-hoc |
| Session boundaries | Client-side | Server-side | Server-side | Consistent sessionization; clients can't be trusted |
| Schema | Fixed schema | Dynamic JSON | Hybrid | Core fields fixed; custom properties in JSON blob |
| Sampling | No sampling | Progressive sampling | Progressive | UX: show result in 200ms vs 30s; accuracy on-demand |

### 21.2 Consistency vs Availability

```
Analytics platform favors AVAILABILITY over CONSISTENCY (AP in CAP):

Reasons:
  - Losing an event is worse than showing slightly stale counts
  - Dashboard reads can tolerate 60-second staleness
  - Real-time exact counts less important than fast response

Accepted inconsistencies:
  - Dashboard event counts may lag by 1-2 minutes
  - Unique user counts are approximate (HLL ~1% error)
  - Funnel results computed on eventual-consistent snapshot
  - Deleted users may appear in reports for up to 24 hours

Guaranteed consistency:
  - Event ingestion: at-least-once (Kafka acks)
  - Deduplication: eventual via insert_id
  - Identity merges: eventually propagated to all queries
```

---

## 22. Comparison: Analytics Platforms

| Feature | Mixpanel | Amplitude | Google Analytics 4 | PostHog |
|---------|---------|-----------|-------------------|---------|
| **Primary Focus** | User behavior analytics | Product analytics | Web/app traffic | Open-source product analytics |
| **Funnel Analysis** | Excellent (best-in-class) | Excellent | Basic | Good |
| **Cohort Analysis** | Good | Excellent (Journeys) | Limited | Good |
| **Session Analysis** | Limited | Limited | Excellent | Good |
| **Real-Time** | Yes (< 1 min) | Yes (< 1 min) | Yes (streaming) | Yes (< 1 min) |
| **A/B Testing** | Via Experiments | Yes (built-in) | Google Optimize (deprecated) | Feature Flags + Experiments |
| **SQL Access** | No (proprietary query) | Yes (Amplitude SQL) | BigQuery export | Yes (PostHog SQL) |
| **Data Ownership** | Vendor holds data | Vendor holds data | Google holds data | Self-hosted option |
| **Privacy / GDPR** | EU data residency | EU data residency | Data retention limits | Full control (self-hosted) |
| **Sampling** | No sampling (<=1B events/mo) | Sampling above quota | Heavy sampling (GA4) | No sampling |
| **Warehouse Sync** | Yes (Mixpanel -> BQ) | Yes (Amplitude -> BQ/Snowflake) | Native BigQuery | Yes (PostHog -> BQ/Snowflake) |
| **Pricing Model** | MTU-based | Monthly Tracked Users | Free + 360 (enterprise) | Events-based (generous free tier) |
| **SDK Support** | JS, iOS, Android, server | JS, iOS, Android, server | gtag.js, Firebase | JS, iOS, Android, 15+ SDKs |
| **Offline Support** | Client SDK queues | Client SDK queues | Basic buffering | Client SDK queues |
| **Storage Architecture** | Proprietary columnar | Snowflake-based | BigQuery | ClickHouse |
| **Best For** | Startups, B2C apps | Enterprise product teams | Marketing/SEO teams | Privacy-conscious, open-source |

### 22.1 Query Language Comparison

```
Mixpanel (JQL - JavaScript Query Language):
  function main() {
    return Events({
      from_date: '2026-02-01',
      to_date: '2026-03-01',
      event_selectors: [{ event: 'Purchase Completed' }]
    }).groupByUser(['properties.country'], mixpanel.reducer.count());
  }

Amplitude (Amplitude SQL / Chart UI):
  SELECT user_id, count(*) as purchases
  FROM events
  WHERE event_type = 'Purchase Completed'
    AND event_time BETWEEN '2026-02-01' AND '2026-03-01'
  GROUP BY user_id
  HAVING purchases >= 2;

Google Analytics 4 (BigQuery SQL):
  SELECT event_name, COUNT(*) as count
  FROM `myproject.analytics_123456789.events_*`
  WHERE _TABLE_SUFFIX BETWEEN '20260201' AND '20260301'
    AND event_name = 'purchase'
  GROUP BY event_name;

PostHog (HogQL - ClickHouse-compatible SQL):
  SELECT properties.country, count() as events
  FROM events
  WHERE event = 'Purchase Completed'
    AND toDate(timestamp) BETWEEN '2026-02-01' AND '2026-03-01'
  GROUP BY properties.country
  ORDER BY events DESC;
```

---

## 23. Common Interview Follow-ups

**Q: How do you handle events that arrive out of order or late?**

A: Accept events with timestamps up to 24 hours in the past (configurable per project). Flink uses event-time processing with a watermark strategy: advance watermark to `max(event_time) - 5 minutes`. Events within the watermark window are processed normally; late events beyond the watermark are sent to a side output for delayed processing. ClickHouse partitions by event date, so late events insert into the correct partition. Pre-aggregated materialized views are re-computed for affected time buckets via a delayed refresh job.

---

**Q: How does the identity graph scale to 100M users?**

A: The identity graph is a key-value store (Redis Cluster) with 3 shard keys: `anon:{project}:{anon_id}`, `device:{project}:{device_id}`, and `user:{project}:{user_id}`. At 100M users with 2 devices average each, we have 300M keys. Each key is ~100 bytes -> 30 GB total, easily fits in Redis (3 nodes * 64 GB). For very large enterprises, we use a persistent graph store (Apache TinkerPop / Amazon Neptune) for complex multi-hop queries, with Redis as a fast lookup cache.

---

**Q: How do you compute funnels efficiently at scale?**

A: Three strategies depending on funnel complexity. For simple 3-step funnels with common events, use pre-computed materialized views updated every hour. For ad-hoc funnels, use ClickHouse window functions with `windowFunnel()` built-in: `SELECT windowFunnel(604800)(event_time, event='A', event='B', event='C') FROM events WHERE project_id=123 GROUP BY distinct_id`. This processes events per-user in a single table scan. For very large datasets (>30 day ranges), use approximate bitmaps: represent each step's user set as RoaringBitmap, compute intersection for conversion count. Bitmap intersection on 100M bits is microseconds.

---

**Q: How do you prevent one noisy tenant from affecting others?**

A: Multi-layer isolation: (1) Rate limiting at the Collector using a token bucket per API key (configurable per plan tier). (2) Kafka topics partitioned by project_id with dedicated consumer groups per large tenant. (3) ClickHouse query quotas per user: max_concurrent_queries=10, max_memory_usage=16GB, max_execution_time=60s. (4) Query queuing: large tenants get their own query queue, small tenants share a pool. (5) For enterprise SLA customers, dedicated ClickHouse shards with no sharing.

---

**Q: How does GDPR deletion work without breaking pre-aggregated data?**

A: Deletion operates at two levels. For raw events: we use pseudonymous IDs in the event store; deleting the identity map entry makes the user's events unresolvable to PII without destroying the aggregate data. For pre-aggregated counts: counts do not contain PII, so they are retained. The count may be off by ±1 user after deletion, which is acceptable. For user profiles with PII traits: hard delete from the user_profiles table and identity graph within 24 hours. For large-scale deletion requests (e.g., company-wide data purge), ClickHouse ALTER TABLE DETACH PARTITION for the user's date partitions, then DROP.

---

**Q: How do you ensure exactly-once event processing?**

A: True exactly-once is expensive; we use at-least-once with idempotent deduplication. Clients include a unique `insert_id` per event (UUID v7, client-generated). Flink deduplicates using a Bloom filter (layer 1) and Redis SETNX (layer 2) within a 24-hour window. ClickHouse ReplacingMergeTree ensures the final stored copy is unique by `(project_id, insert_id)` - though multiple copies may exist briefly and are collapsed at merge time. Queries use `FINAL` modifier or `SELECT DISTINCT insert_id` for exact dedup at read time.

---

**Q: How do you design the SDK to minimize impact on app performance?**

A: The SDK runs on a background thread/queue to never block the main thread. JavaScript SDK uses a Web Worker or requestIdleCallback for batching. Events are enqueued in memory (O(1) operation from the caller's perspective) and flushed asynchronously. Payload is Gzip-compressed before sending (80% size reduction). Retry logic has exponential backoff with jitter to avoid thundering herd. The in-memory queue is capped at 500 events; if full, old events are dropped. Disk-based offline queue is used only for mobile apps, not web. Total SDK footprint: <15 KB gzipped for JS, <500 KB binary for iOS/Android.

---

**Q: What is your strategy for hot vs cold data?**

A: Three-tier storage: Hot (0-30 days) in ClickHouse on NVMe SSDs for sub-3-second queries; Warm (30-90 days) in ClickHouse on cheaper EBS volumes with slightly slower queries (5-15 seconds); Cold (90+ days) as Parquet files on S3 queryable via ClickHouse's S3 engine or Trino/Athena for one-off historical analyses. TTL rules in ClickHouse automatically move partitions between tiers based on data age. Users are shown query time estimates before running cold queries ("This query covers cold storage and may take 30-60 seconds"). For self-serve warehouse export, we sync raw Parquet to the customer's BigQuery/Snowflake at no query cost.

---

**Q: How do you handle A/B test assignment consistency across devices?**

A: Assignment is deterministic based on `hash(user_id + experiment_id) % 100`. Any device logged into the same user account gets the same variant. For anonymous users (pre-login), assignment is based on `hash(anonymous_id + experiment_id) % 100` and cached in localStorage/cookie. On login (identity resolution), if the user was previously assigned in another device/session, we check for conflict: if same experiment, no-op (same bucket). If they were in control on web and treatment on mobile (rare), we keep the oldest assignment. Assignments are stored server-side in Redis with TTL 30 days; after TTL, re-assign deterministically (same result for same user_id).
