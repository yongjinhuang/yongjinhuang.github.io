# Data Model: Analytics Platform (Mixpanel/Amplitude)

A product analytics platform ingests billions of user events, resolves user identities across devices, and enables querying patterns like funnels, retention, and cohort analysis. The data model is optimized for append-heavy writes with ClickHouse's columnar engine, uses Redis for real-time identity resolution, and pre-aggregates common metrics to serve dashboards without scanning raw events. The core challenge is linking anonymous activity (before login) to identified users (after login) across multiple devices.

---

## Table Responsibilities

| Table                      | Purpose                          | Storage                           | Why It Exists                                                                 |
| -------------------------- | -------------------------------- | --------------------------------- | ----------------------------------------------------------------------------- |
| **events**                 | Raw event stream                 | ClickHouse                        | The atomic unit of analytics; every user action is an event with properties   |
| **user_profiles**          | Merged user identity with traits | ClickHouse (ReplacingMergeTree)   | Deduplicated user records; last-write-wins for profile properties             |
| **event_counts_minutely**  | Pre-aggregated event metrics     | ClickHouse (AggregatingMergeTree) | Avoids scanning billions of raw events for simple count/unique queries        |
| **identity_graph**         | Cross-device identity resolution | Redis                             | Real-time mapping of anonymous_id and device_id to canonical distinct_id      |
| **experiment_assignments** | A/B test variant tracking        | ClickHouse                        | Links users to experiment variants for statistical analysis of feature impact |

---

## Detailed Field Descriptions

### events (ClickHouse)

| Field           | Type     | Description                                                                 |
| --------------- | -------- | --------------------------------------------------------------------------- |
| project_id      | UUID     | Multi-tenant isolation; all queries are scoped by project                   |
| distinct_id     | STRING   | Canonical user identifier (resolved from anonymous_id after identification) |
| anonymous_id    | STRING   | Client-generated ID before user identifies (e.g., UUID stored in cookie)    |
| device_id       | STRING   | Device fingerprint or hardware ID for cross-device linking                  |
| session_id      | STRING   | Groups events into sessions (based on 30-min inactivity timeout)            |
| event_name      | STRING   | What happened: page_view, button_click, purchase, signup                    |
| insert_id       | STRING   | Client-generated unique ID for deduplication (idempotent ingestion)         |
| event_time      | DATETIME | When the event actually occurred (client time, adjusted for clock skew)     |
| properties_json | STRING   | Event-specific properties: page_url, button_name, product_id, revenue       |
| ip              | STRING   | Client IP for geo enrichment                                                |
| geo             | OBJECT   | Derived: country, region, city (from IP lookup)                             |
| device_info     | OBJECT   | Derived: os, os_version, browser, browser_version, device_type              |
| utm_params      | OBJECT   | Marketing attribution: utm_source, utm_medium, utm_campaign, utm_content    |
| experiment_id   | STRING   | Which experiment was active when this event fired                           |
| variant_id      | STRING   | Which variant the user was assigned to                                      |

**Why distinct_id vs anonymous_id?** Before a user logs in, the SDK generates an anonymous_id (stored in a cookie). After login, the user is "identified" with a distinct_id (e.g., user_id from your database). The identity_graph links these, so pre-login and post-login activity is attributed to the same person.

**Why insert_id for deduplication?** Mobile SDKs retry failed event sends. Without deduplication, a retry would double-count events. The insert_id is generated client-side; the ingestion pipeline deduplicates on (project_id, insert_id) using ClickHouse's ReplacingMergeTree or stream-level dedup in Kafka.

**Why store event_time (not just insertion time)?** Events may arrive out of order due to network delays, offline mode, or batch uploads. event_time reflects when the user actually performed the action, which is what funnel and retention analyses need. The ingestion pipeline adjusts for obvious clock skew (e.g., events claiming to be from the future).

### user_profiles (ClickHouse ReplacingMergeTree)

| Field         | Type     | Description                                                          |
| ------------- | -------- | -------------------------------------------------------------------- |
| project_id    | UUID     | Multi-tenant isolation                                               |
| distinct_id   | STRING   | Canonical user identifier (primary key with project_id)              |
| anonymous_ids | STRING[] | All anonymous IDs that have been linked to this user                 |
| traits_json   | STRING   | User properties: name, email, plan, company, custom attributes       |
| first_seen_at | DATETIME | When this user first appeared (earliest event_time)                  |
| last_seen_at  | DATETIME | Most recent event_time                                               |
| total_events  | INT      | Lifetime event count                                                 |
| is_identified | BOOLEAN  | Whether the user has been explicitly identified (vs still anonymous) |

**Why ReplacingMergeTree?** User profiles are updated frequently (last_seen_at changes on every event, traits change on profile updates). ReplacingMergeTree deduplicates rows with the same primary key during background merges, keeping only the latest version. This provides last-write-wins semantics without explicit UPDATE operations.

**Why anonymous_ids as an array?** A single user might visit on multiple browsers before identifying, creating multiple anonymous_ids. Storing all of them enables retroactive attribution: when user X identifies on browser B, all events from anonymous_id_B are now attributed to user X.

### event_counts_minutely (ClickHouse AggregatingMergeTree)

| Field         | Type                                 | Description                                          |
| ------------- | ------------------------------------ | ---------------------------------------------------- |
| project_id    | UUID                                 | Multi-tenant isolation                               |
| event_name    | STRING                               | Event name being aggregated                          |
| minute_bucket | DATETIME                             | Truncated to the minute                              |
| count         | AggregateFunction(count)             | Total event count for this event_name in this minute |
| unique_users  | AggregateFunction(uniq, distinct_id) | Approximate unique user count (HyperLogLog)          |

**Why pre-aggregate?** A dashboard showing "page views in the last 24 hours" would scan 1440 minutes x N events per minute of raw data. The pre-aggregated table has at most 1440 rows to scan. For hourly/daily views, further rollups are trivial.

**Why HyperLogLog for unique users?** Exact unique counts require storing all distinct_ids in memory. HyperLogLog provides ~2% error with only 12 KB of memory per counter. For analytics dashboards, this trade-off is acceptable. HyperLogLog sketches are also mergeable: you can combine minute-level sketches into hour-level unique counts without re-scanning raw data.

### identity_graph (Redis)

| Field        | Type  | Description                            |
| ------------ | ----- | -------------------------------------- |
| anonymous_id | KEY   | Maps to the canonical distinct_id      |
| device_id    | KEY   | Maps to the canonical distinct_id      |
| distinct_id  | VALUE | The resolved canonical user identifier |

**Why Redis for identity resolution?** Identity lookups happen on every incoming event (to resolve anonymous_id to distinct_id). At 100K events/second, this must be sub-millisecond. Redis hash lookups provide O(1) performance. The identity graph is relatively small (one entry per anonymous_id or device_id, not per event).

**How does cross-device linking work?** When a user logs in on device A, the SDK calls `identify(anonymous_id_A, user_123)`. Redis stores `anonymous_id_A → user_123` and `device_id_A → user_123`. When the same user logs in on device B, `anonymous_id_B → user_123` and `device_id_B → user_123` are added. Now events from both devices are attributed to user_123.

### experiment_assignments (ClickHouse)

| Field         | Type     | Description                                               |
| ------------- | -------- | --------------------------------------------------------- |
| project_id    | UUID     | Multi-tenant isolation                                    |
| experiment_id | STRING   | Which experiment (e.g., "new_checkout_flow")              |
| variant_id    | STRING   | Which variant (e.g., "control", "variant_a", "variant_b") |
| distinct_id   | STRING   | Which user was assigned                                   |
| assigned_at   | DATETIME | When the assignment was made                              |
| converted     | BOOLEAN  | Whether the user completed the conversion goal            |
| converted_at  | DATETIME | When the conversion happened                              |

**Why a separate table instead of embedding in events?** Experiment analysis requires comparing conversion rates between variants. A dedicated table makes this query simple: group by (experiment_id, variant_id), compute conversion_rate = SUM(converted) / COUNT(\*). Embedding this in the events table would require complex filtering and joining.

---

## ER Diagram

```
                    (Redis)
              +-----------------+
              | identity_graph  |
              +-----------------+
              | anonymous_id    |
              |   → distinct_id |
              | device_id       |
              |   → distinct_id |
              +--------+--------+
                       |
                       | resolves identity for
                       |
                       v
+----------------------+-----------------------------+
|                    events                          |
|                (ClickHouse)                        |
+----------------------------------------------------+
| project_id | distinct_id | anonymous_id | device_id|
| session_id | event_name  | insert_id    |          |
| event_time | properties_json | ip | geo | device   |
| utm_params | experiment_id | variant_id            |
+--------+-----+-----------+------------------------+
         |     |           |
         |     |           |
         |     |           +-------- Aggregated into
         |     |                     |
         |     |           +---------+----------+
         |     |           | event_counts_      |
         |     |           | minutely           |
         |     |           | (AggregatingMerge) |
         |     |           +--------------------+
         |     |           | project_id         |
         |     |           | event_name         |
         |     |           | minute_bucket      |
         |     |           | count (aggregate)  |
         |     |           | unique_users (HLL) |
         |     |           +--------------------+
         |     |
         |     +---------- Profiles built from
         |                 |
         |     +-----------+----------+
         |     | user_profiles        |
         |     | (ReplacingMergeTree) |
         |     +----------------------+
         |     | project_id           |
         |     | distinct_id          |
         |     | anonymous_ids[]      |
         |     | traits_json          |
         |     | first/last_seen_at   |
         |     | total_events         |
         |     | is_identified        |
         |     +----------------------+
         |
         +------------- Experiments linked via
                        |
              +---------+----------------+
              | experiment_assignments   |
              | (ClickHouse)             |
              +--------------------------+
              | project_id               |
              | experiment_id            |
              | variant_id               |
              | distinct_id              |
              | assigned_at              |
              | converted                |
              | converted_at             |
              +--------------------------+
```

### Relationship Summary

```
identity_graph  ────> events           (resolves anonymous_id to distinct_id on ingestion)
events          ────> user_profiles    (profiles are materialized from event stream)
events          ────> event_counts     (pre-aggregated from raw events)
events          *───1 experiment_assignments  (events reference experiment context)
user_profiles   1───* events           (one user produces many events)
```

---

## Data Flow

1. **Client SDK sends event** -- The SDK (web, iOS, Android) captures a user action and sends it to the collector endpoint with anonymous_id, device_id, event_name, properties, and a client-generated insert_id. Events are batched and sent every 10-30 seconds.

2. **Collector validates and enriches** -- The collector server:

   - Validates the event schema (required fields, types)
   - Performs geo-IP lookup to derive country/region/city
   - Parses user agent for device_info
   - Adjusts event_time for obvious clock skew (rejects events from the future)
   - Writes the event to Kafka for downstream processing

3. **Identity resolution** -- The stream processor queries the `identity_graph` in Redis:

   - If anonymous_id has a mapping, set distinct_id to the mapped value
   - If no mapping exists, use anonymous_id as a temporary distinct_id
   - When an `identify` call arrives (linking anonymous_id to a known user), update Redis and retroactively update recent events

4. **Sessionization** -- The stream processor groups events into sessions:

   - Events from the same distinct_id within 30 minutes of inactivity are assigned the same session_id
   - A gap of >30 minutes starts a new session
   - This is computed in the stream processor, not in the database

5. **Deduplication** -- Events with duplicate (project_id, insert_id) are dropped. This handles SDK retries. ClickHouse's ReplacingMergeTree provides eventual deduplication during compaction as a safety net.

6. **Write to ClickHouse** -- Deduplicated, enriched events are batch-inserted into the `events` table. ClickHouse handles millions of inserts per second with columnar compression.

7. **User profile update** -- The stream processor updates `user_profiles`:

   - Update last_seen_at and total_events
   - Merge new traits from `identify` or `set_profile` calls
   - Add newly discovered anonymous_ids to the array
   - ClickHouse ReplacingMergeTree handles deduplication on (project_id, distinct_id)

8. **Pre-aggregation** -- Materialized views in ClickHouse continuously aggregate new events into `event_counts_minutely`:

   - Group by (project_id, event_name, minute_bucket)
   - Increment count
   - Merge into unique_users HyperLogLog sketch
   - AggregatingMergeTree merges partial aggregates during background compaction

9. **Experiment tracking** -- When a user is assigned to an experiment variant, an `experiment_assignments` row is written. When the user completes the conversion goal (detected from events), converted=true and converted_at are set.

10. **Query service** -- Analysts and dashboards query the data:
    - **Simple metrics** (event counts, unique users): query event_counts_minutely
    - **Funnels** (step 1 → step 2 → step 3 conversion): query raw events, window-function by distinct_id
    - **Retention** (% of users who return in week 2, 3, 4): query events grouped by first_seen cohort
    - **Cohort analysis**: query user_profiles for trait-based segments, then join with events
    - **Experiment results**: query experiment_assignments, compute conversion rate per variant, run statistical significance test

---

## Interview Discussion Points

**Q: Why ClickHouse instead of Postgres or BigQuery?**
ClickHouse is purpose-built for analytics: columnar storage compresses 10-100x, vectorized query execution scans billions of rows in seconds, and MergeTree engines handle millions of inserts per second without write amplification. Postgres would collapse under this write volume. BigQuery works but has query latency (seconds, not milliseconds) and cost-per-query pricing that becomes expensive for interactive dashboards.

**Q: How does identity resolution handle merging two identified users?**
If user_123 and user_456 turn out to be the same person (e.g., same email detected), you perform an identity merge: choose a canonical ID, update all identity_graph mappings, and asynchronously update historical events. This is the hardest part of identity resolution and can create cascading merges.

**Q: Why HyperLogLog instead of exact unique counts?**
For a query like "unique users who viewed the homepage in the last 30 days," exact counting requires holding all distinct_ids in memory (potentially millions). HLL provides ~2% accuracy with 12 KB. For dashboard-level analytics, this is more than sufficient. When exact counts are needed (e.g., billing), use exact COUNT(DISTINCT) on smaller result sets.

**Q: How do you handle late-arriving events?**
Events can arrive hours or days late (mobile app in offline mode). The event_time (client timestamp) is used for analytics queries, not the insertion time. Pre-aggregated tables need to handle re-aggregation: when a late event arrives for a past minute_bucket, the aggregate is updated. AggregatingMergeTree handles this naturally by merging partial aggregates.

**Q: How do you ensure data freshness for dashboards?**
The pipeline is real-time: events flow through Kafka → stream processor → ClickHouse with end-to-end latency of 1-5 seconds. Pre-aggregated tables are updated continuously via materialized views. Dashboard queries hit pre-aggregated tables for <100ms response times.
