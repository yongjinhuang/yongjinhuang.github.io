# BigQuery

BigQuery is GCP's serverless data warehouse -- the gold standard for analytical queries at scale. It separates storage and compute, uses columnar format, and can scan petabytes in seconds. No indexes, no tuning, no cluster management.

---

## Table of Contents

1. [Architecture](#architecture)
2. [Key Features](#key-features)
3. [Partitioning and Clustering](#partitioning-and-clustering)
4. [Cost Optimization](#cost-optimization)
5. [Streaming vs Batch](#streaming-vs-batch)
6. [Comparison with Redshift and Snowflake](#comparison)
7. [Common Interview Questions](#common-interview-questions)

---

## Architecture

```
+----------------------------------------------------------+
|                    BigQuery                                |
|                                                           |
|  +--Dremel (Query Engine)----+   +--Colossus (Storage)--+|
|  | Slot 1 | Slot 2 | Slot N |   | Capacitor (columnar) ||
|  | (vCPU) | (vCPU) | (vCPU) |   | files on distributed ||
|  +------------------------+  |   | filesystem           ||
|                           |  |   +----------------------+|
|  Slots process query      |  |                            |
|  in parallel              +--+-- Storage and compute      |
|                                   are SEPARATE            |
+----------------------------------------------------------+
```

### Key Architecture Decisions

| Decision | Implication |
| -------- | ----------- |
| **Separate storage/compute** | Pay for storage and queries independently |
| **Columnar (Capacitor)** | Only reads columns you SELECT (massive I/O savings) |
| **Dremel execution** | Query broken into stages, distributed across slots |
| **No indexes** | Full column scans (columnar format makes this fast) |
| **Serverless** | No cluster to manage, auto-scales |

---

## Key Features

| Feature | Details |
| ------- | ------- |
| **Storage** | $0.02/GB/month (active), $0.01/GB/month (long-term >90 days) |
| **Queries** | $6.25/TB scanned (on-demand) or flat-rate slots |
| **Streaming** | Real-time inserts via streaming API |
| **ML** | BigQuery ML (train models with SQL) |
| **GIS** | Geospatial functions (ST_DISTANCE, etc.) |
| **BI Engine** | In-memory cache for sub-second dashboards |
| **Materialized views** | Auto-refreshed, query-optimized views |
| **Search index** | Full-text search on string columns |
| **Change data capture** | CDC for streaming updates to tables |
| **Max columns** | 10,000 per table |
| **Max row size** | 100 MB |

---

## Partitioning and Clustering

### Partitioning

Divide a table into segments for targeted queries.

```sql
CREATE TABLE my_dataset.events (
  event_id STRING,
  event_type STRING,
  user_id STRING,
  event_time TIMESTAMP,
  payload JSON
)
PARTITION BY DATE(event_time)
CLUSTER BY event_type, user_id;

-- Query only scans the partition for 2024-01-15:
SELECT * FROM my_dataset.events
WHERE DATE(event_time) = '2024-01-15';
-- Without partitioning: scans entire table (expensive!)
```

| Partition Type | How | Use Case |
| -------------- | --- | -------- |
| **Time-based** | Daily, hourly, monthly, yearly | Time-series data (most common) |
| **Integer range** | Range of integer values | Customer IDs, zipcode ranges |
| **Ingestion time** | When data was loaded | When source has no date column |

### Clustering

Sort data within partitions by specified columns.

```
Partition: 2024-01-15
  Cluster by event_type:
    Block 1: [event_type = "click", ...]
    Block 2: [event_type = "purchase", ...]
    Block 3: [event_type = "view", ...]

Query: WHERE event_type = "purchase"
  -> Only reads Block 2 (skips others)
```

| Feature | Partitioning | Clustering |
| ------- | ------------ | ---------- |
| **Cost savings** | Reduces data scanned (billed) | Reduces data scanned |
| **Limit** | 1 column, 4000 partitions | Up to 4 columns |
| **Pruning** | Hard (skip entire partitions) | Soft (skip blocks within partitions) |
| **Best on** | Date/timestamp columns | High-cardinality filter columns |

---

## Cost Optimization

### On-Demand vs Flat-Rate

| Pricing | How | Best For |
| ------- | --- | -------- |
| **On-demand** | $6.25 per TB scanned | Ad-hoc queries, low/variable usage |
| **Flat-rate (editions)** | Reserved slots ($0.04/slot/hour) | Predictable, high-volume workloads |

### Cost Reduction Strategies

```
1. Partition by date (scan only relevant dates)
2. Cluster by frequently filtered columns
3. SELECT specific columns (not SELECT *)
4. Use materialized views for repeated queries
5. Set table expiration for temporary data
6. Use long-term storage pricing (auto after 90 days)
7. Preview queries before running (dry_run = true)
8. Use LIMIT with caution (LIMIT doesn't reduce scan cost for full queries)
```

### Important: LIMIT Doesn't Save Money

```sql
-- Both scan the SAME amount of data (and cost the same!):
SELECT * FROM big_table;
SELECT * FROM big_table LIMIT 10;

-- To actually reduce scanned data:
SELECT specific_column FROM big_table WHERE partition_date = '2024-01-15';
```

---

## Streaming vs Batch

### Batch Loading (Free)

```
gcloud bq load --source_format=CSV my_dataset.my_table gs://bucket/data.csv

Methods: Cloud Storage load, BigQuery API, scheduled queries
Cost: Free (you pay for storage only)
Latency: Minutes
```

### Streaming Inserts

```python
from google.cloud import bigquery
client = bigquery.Client()

rows = [
    {"event_id": "123", "event_type": "click", "timestamp": "2024-01-15T08:30:00Z"},
    {"event_id": "124", "event_type": "purchase", "timestamp": "2024-01-15T08:31:00Z"},
]

errors = client.insert_rows_json("my_dataset.events", rows)
```

| Feature | Batch | Streaming |
| ------- | ----- | --------- |
| **Cost** | Free | $0.05/GB |
| **Latency** | Minutes | Seconds |
| **Deduplication** | Automatic | Best-effort (use insertId) |
| **Availability** | Immediate | ~seconds in buffer |
| **Use case** | ETL, scheduled loads | Real-time dashboards, event tracking |

### BigQuery Storage Write API (Recommended)

Newer, faster, cheaper than legacy streaming API:
- Exactly-once semantics
- Lower cost ($0.025/GB vs $0.05/GB for streaming)
- Higher throughput
- Schema validation

---

## Comparison

| Feature | BigQuery | Redshift | Snowflake |
| ------- | -------- | -------- | --------- |
| **Model** | Serverless | Provisioned clusters | Virtual warehouses |
| **Storage/Compute** | Separate | Combined (RA3 separates) | Separate |
| **Scaling** | Automatic | Manual resize | Auto-suspend/resume |
| **Pricing** | Per TB scanned or slots | Per node/hour | Per credit (compute) |
| **Concurrency** | High (auto-scale slots) | Limited (WLM queues) | Configurable warehouses |
| **Semi-structured** | JSON, STRUCT, ARRAY | JSON (SUPER type) | VARIANT type |
| **ML** | BigQuery ML (SQL) | Redshift ML | Snowpark |
| **Streaming** | Yes (streaming API) | Kinesis integration | Snowpipe |
| **Multi-cloud** | BigQuery Omni (limited) | No | Yes (native) |
| **Free tier** | 1 TB queries + 10 GB storage/month | 2-month trial | $400 credit trial |

---

## Common Interview Questions

1. **How does BigQuery achieve fast queries without indexes?** Columnar storage (only reads needed columns), Dremel distributed execution (parallel processing across thousands of slots), Capacitor format (compressed, optimized for full scans). Full column scans are fast when you skip irrelevant columns.

2. **How do you optimize BigQuery costs?** Partition by date, cluster by filter columns, select only needed columns (never SELECT *), use materialized views, set table expiration, preview queries with dry_run, and consider flat-rate pricing for high-volume usage.

3. **Does LIMIT reduce BigQuery costs?** No! LIMIT only limits the output rows. BigQuery still scans all matching data. To reduce scanned data (and cost), use partitioning, clustering, and column selection.

4. **BigQuery vs Redshift?** BigQuery is serverless (no cluster management), charges per TB scanned, and auto-scales. Redshift requires provisioning clusters, charges per node/hour, and needs manual scaling. BigQuery is simpler; Redshift gives more control.

5. **What is the difference between partitioning and clustering?** Partitioning physically divides a table (hard pruning -- entire partitions skipped). Clustering sorts data within partitions (soft pruning -- blocks skipped). Use both: partition by date, cluster by frequently filtered columns.

6. **How do you handle real-time data in BigQuery?** Use the Storage Write API (recommended) or legacy streaming inserts. Data available within seconds. For sub-second dashboards, enable BI Engine (in-memory caching layer).
