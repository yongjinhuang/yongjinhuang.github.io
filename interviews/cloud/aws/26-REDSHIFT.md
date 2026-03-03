# Redshift (Data Warehouse)

Redshift is a fully managed, petabyte-scale columnar data warehouse built for online analytical processing (OLAP). It uses massively parallel processing (MPP) to execute complex queries across large datasets in seconds. Under the hood, Redshift stores data in columns rather than rows, which dramatically reduces I/O for analytical queries that scan a small number of columns across billions of rows. It is not a replacement for RDS or DynamoDB -- Redshift is purpose-built for analytics, reporting, and BI workloads, not transactional (OLTP) operations.

---

## 1. Architecture

Redshift uses a leader-compute node architecture:

```
Client (SQL / JDBC / ODBC)
        |
   Leader Node          -- Parses SQL, builds query plan, coordinates execution
        |
  +-----------+-----------+
  |           |           |
Compute     Compute     Compute    -- Execute query fragments in parallel
Node 0      Node 1      Node 2
  |           |           |
Slices      Slices      Slices     -- Each node has 2-16 slices (sub-units of parallelism)
```

- **Leader node**: Receives client connections, parses SQL, generates optimized query plans, distributes work to compute nodes, and aggregates results. Does not store user data.
- **Compute nodes**: Store data in columnar format and execute query fragments in parallel. Each node is divided into **slices**, where each slice processes a portion of the data independently.
- **Slices**: The unit of parallelism. A node with 16 slices can process 16 data partitions concurrently. Distribution keys determine which slice owns which rows.

---

## 2. Node Types

| Node Type | Storage | Best For | Notes |
|-----------|---------|----------|-------|
| **RA3** | Managed storage (S3-backed with local SSD cache) | Most workloads | Decouple compute from storage, scale independently |
| **DC2** | Local NVMe SSD | Small datasets needing low latency | Fixed storage per node, cost-effective under ~1 TB |
| **DS2** | Local HDD | Legacy only | Deprecated in favor of RA3, do not use for new clusters |

**Decision rule:** Use RA3 for new clusters. RA3 nodes cache hot data on local SSD and spill cold data to S3, giving you effectively unlimited storage without managing disk capacity. DC2 is only worth it for small, latency-sensitive workloads where you want everything on local SSD.

---

## 3. Redshift Serverless

Serverless eliminates cluster management entirely. You create a **namespace** (database, schemas, users) and a **workgroup** (compute capacity in RPUs).

```bash
# Create a namespace (storage layer)
aws redshift-serverless create-namespace \
  --namespace-name analytics \
  --admin-username admin \
  --admin-user-password 'SecurePass123!' \
  --db-name warehouse

# Create a workgroup (compute layer)
aws redshift-serverless create-workgroup \
  --workgroup-name analytics-wg \
  --namespace-name analytics \
  --base-capacity 32
```

| Feature | Provisioned | Serverless |
|---------|------------|------------|
| **Pricing** | Per-node per-hour | Per RPU-hour (only when queries run) |
| **Scaling** | Manual or elastic resize | Automatic |
| **Management** | You manage nodes, WLM, VACUUM | AWS manages everything |
| **Use case** | Predictable, sustained workloads | Bursty, intermittent, or getting started |

Serverless is ideal when you do not want to tune cluster sizing, or when query volume is unpredictable. For steady, high-throughput pipelines, provisioned clusters with reserved instances are cheaper.

---

## 4. Distribution Styles

Distribution determines how rows are spread across compute nodes. Getting this wrong causes expensive data redistribution during joins.

| Style | How It Works | When to Use |
|-------|-------------|-------------|
| **AUTO** | Redshift chooses (starts as ALL for small tables, switches to EVEN or KEY as table grows) | Default, good starting point |
| **KEY** | Rows with the same key value go to the same node | Large fact tables joined on a specific column (e.g., `customer_id`) |
| **EVEN** | Round-robin across all slices | Tables not joined with others, or when no good key exists |
| **ALL** | Full copy on every node | Small dimension tables (< ~5M rows) frequently joined with large tables |

```sql
-- KEY distribution on the join column
CREATE TABLE orders (
  order_id    BIGINT,
  customer_id BIGINT,
  order_date  DATE,
  total       DECIMAL(12,2)
)
DISTKEY(customer_id)
SORTKEY(order_date);

-- ALL distribution for a small dimension table
CREATE TABLE regions (
  region_id   INT,
  region_name VARCHAR(100)
)
DISTSTYLE ALL;
```

**Key principle:** Co-locate rows that are frequently joined together on the same node to avoid network shuffles. Distribute large fact tables by the most common join key.

---

## 5. Sort Keys

Sort keys determine the physical order of data on disk. Redshift uses zone maps (min/max metadata per 1 MB block) to skip blocks that cannot contain matching rows.

| Type | Behavior | Best For |
|------|----------|----------|
| **Compound** | Data sorted by columns in order (col1, then col2 within col1, etc.) | Range-restricted queries on a leading column (e.g., `WHERE date BETWEEN ...`) |
| **Interleaved** | Equal weight to each column in the key | Queries that filter on different columns unpredictably |

```sql
-- Compound sort key: queries filtering on event_date benefit most
CREATE TABLE events (
  event_id   BIGINT,
  event_date DATE,
  user_id    BIGINT,
  event_type VARCHAR(50)
)
SORTKEY(event_date, user_id);

-- Interleaved sort key: queries filter on any of these columns
CREATE TABLE logs (
  log_id     BIGINT,
  log_date   DATE,
  severity   VARCHAR(10),
  service    VARCHAR(50)
)
INTERLEAVED SORTKEY(log_date, severity, service);
```

**Practical advice:** Use compound sort keys in most cases. Interleaved keys have higher maintenance cost (VACUUM REINDEX is expensive) and are rarely worth the trade-off unless you genuinely have unpredictable filter patterns across multiple columns.

---

## 6. Columnar Storage and Compression

Redshift stores data by column, not by row. A query like `SELECT AVG(price) FROM orders` reads only the `price` column, skipping all others entirely.

Each column can have a compression encoding:

| Encoding | Description | Good For |
|----------|-------------|----------|
| **AZ64** | Amazon's proprietary encoding for numeric/date types | Default for numeric types, excellent compression |
| **LZO** | General-purpose compression | VARCHAR columns with varied content |
| **ZSTD** | High compression ratio | Large VARCHAR, general use |
| **BYTEDICT** | Dictionary encoding | Columns with fewer than ~256 distinct values |
| **RUNLENGTH** | Run-length encoding | Columns with many consecutive repeated values (e.g., sorted columns) |
| **RAW** | No compression | Columns used in SORTKEY (sometimes recommended) |

```sql
-- Specify encodings explicitly
CREATE TABLE sales (
  sale_id    BIGINT ENCODE AZ64,
  product    VARCHAR(200) ENCODE ZSTD,
  category   VARCHAR(50) ENCODE BYTEDICT,
  amount     DECIMAL(12,2) ENCODE AZ64,
  sale_date  DATE ENCODE AZ64
);

-- Let Redshift recommend encodings for an existing table
ANALYZE COMPRESSION sales;
```

---

## 7. COPY Command (Bulk Loading)

COPY is the primary mechanism for loading data into Redshift. It reads from S3, DynamoDB, EMR, or remote hosts in parallel across all slices.

```sql
-- Load from S3 (Parquet, auto-detect compression)
COPY orders
FROM 's3://my-bucket/data/orders/'
IAM_ROLE 'arn:aws:iam::123456789012:role/redshift-s3-role'
FORMAT AS PARQUET;

-- Load CSV with options
COPY orders
FROM 's3://my-bucket/data/orders.csv.gz'
IAM_ROLE 'arn:aws:iam::123456789012:role/redshift-s3-role'
CSV
GZIP
IGNOREHEADER 1
DATEFORMAT 'auto'
TIMEFORMAT 'auto'
MAXERROR 100;

-- Load from DynamoDB
COPY users
FROM 'dynamodb://UserTable'
IAM_ROLE 'arn:aws:iam::123456789012:role/redshift-dynamo-role'
READRATIO 50;
```

**Performance tips for COPY:**
- Split input files so the number of files is a multiple of the number of slices (e.g., 16 slices = 16, 32, 48 files).
- Use compressed files (GZIP, LZO, ZSTD, BZIP2).
- Prefer columnar formats (Parquet, ORC) over CSV for large loads.
- Use a manifest file to explicitly list files and avoid loading stale data.
- Run `ANALYZE` after every significant load to update statistics.

---

## 8. UNLOAD (Exporting to S3)

```sql
-- Export query results to S3 as Parquet
UNLOAD ('SELECT * FROM orders WHERE order_date >= ''2025-01-01''')
TO 's3://my-bucket/exports/orders/'
IAM_ROLE 'arn:aws:iam::123456789012:role/redshift-s3-role'
FORMAT AS PARQUET
PARTITION BY (order_date);

-- Export as compressed CSV
UNLOAD ('SELECT * FROM orders')
TO 's3://my-bucket/exports/orders_csv/'
IAM_ROLE 'arn:aws:iam::123456789012:role/redshift-s3-role'
CSV
GZIP
HEADER
PARALLEL ON;
```

UNLOAD writes in parallel across all slices, producing multiple files. Use `PARALLEL OFF` only if you need a single output file (slower).

---

## 9. Concurrency Scaling

When query queues are full, Redshift can automatically spin up additional transient clusters to handle burst read traffic. You get one hour of free concurrency scaling credits per cluster per day.

- Kicks in when queries start queuing in a concurrency-scaling-enabled WLM queue
- Additional clusters are read-only replicas of your data
- Applies only to **read queries** -- write operations (INSERT, COPY, DELETE) always run on the main cluster
- Beyond free credits, you pay the per-second on-demand rate

---

## 10. Workload Management (WLM)

WLM controls how queries are queued and allocated memory. You define queues with different concurrency levels and memory allocation.

| WLM Mode | Description |
|----------|-------------|
| **Automatic WLM** | Redshift manages concurrency and memory per queue (recommended) |
| **Manual WLM** | You set concurrency slots and memory percentage per queue |

```sql
-- Check current WLM configuration
SELECT * FROM stv_wlm_service_class_config;

-- See which queries are running in which queue
SELECT * FROM stv_wlm_query_state;

-- Route a query to a specific queue via query group
SET query_group TO 'etl-jobs';
SELECT COUNT(*) FROM large_fact_table;
RESET query_group;
```

Use **automatic WLM** unless you have a specific reason to manually tune. Assign query groups or user groups to route queries to specific queues for workload isolation (e.g., separate ETL pipelines from BI dashboards).

---

## 11. Redshift Spectrum

Spectrum lets you query data in S3 directly using external tables, without loading it into Redshift. It uses a shared pool of compute resources independent of your cluster.

```sql
-- Create an external schema pointing to a Glue Data Catalog database
CREATE EXTERNAL SCHEMA spectrum_schema
FROM DATA CATALOG
DATABASE 'my_datalake'
IAM_ROLE 'arn:aws:iam::123456789012:role/redshift-spectrum-role'
CREATE EXTERNAL DATABASE IF NOT EXISTS;

-- Create an external table
CREATE EXTERNAL TABLE spectrum_schema.web_logs (
  request_time TIMESTAMP,
  url          VARCHAR(1000),
  status_code  INT,
  user_agent   VARCHAR(500)
)
STORED AS PARQUET
LOCATION 's3://my-datalake/web-logs/';

-- Query external data joined with local Redshift data
SELECT o.customer_id, COUNT(w.url)
FROM orders o
JOIN spectrum_schema.web_logs w ON o.customer_id = w.user_id
WHERE o.order_date >= '2025-01-01'
GROUP BY o.customer_id;
```

**Spectrum pricing:** $5 per TB of data scanned in S3. Use columnar formats (Parquet/ORC) and partition your data to minimize scan volume. Spectrum requires a Glue Data Catalog -- your IAM role needs both S3 and Glue permissions.

---

## 12. Materialized Views

Materialized views precompute and store query results. Redshift can automatically rewrite incoming queries to use materialized views when possible.

```sql
-- Create a materialized view
CREATE MATERIALIZED VIEW daily_sales AS
SELECT order_date, product_id, SUM(amount) AS total_sales, COUNT(*) AS order_count
FROM orders
GROUP BY order_date, product_id;

-- Refresh manually
REFRESH MATERIALIZED VIEW daily_sales;

-- Auto-refresh when base tables change
CREATE MATERIALIZED VIEW daily_sales
AUTO REFRESH YES
AS
SELECT order_date, product_id, SUM(amount) AS total_sales
FROM orders
GROUP BY order_date, product_id;
```

---

## 13. Data Sharing

Data sharing allows read-only access to live data across Redshift clusters without copying. Works across provisioned clusters, serverless workgroups, and even across AWS accounts.

```sql
-- On the producer cluster
CREATE DATASHARE sales_share;
ALTER DATASHARE sales_share ADD SCHEMA public;
ALTER DATASHARE sales_share ADD TABLE public.orders;
ALTER DATASHARE sales_share ADD TABLE public.customers;

-- Grant access to a consumer cluster namespace
GRANT USAGE ON DATASHARE sales_share TO NAMESPACE 'consumer-namespace-guid';

-- On the consumer cluster
CREATE DATABASE shared_sales FROM DATASHARE sales_share
OF NAMESPACE 'producer-namespace-guid';

-- Query shared data (read-only)
SELECT * FROM shared_sales.public.orders LIMIT 10;
```

---

## 14. Common CLI Commands

```bash
# Create a provisioned cluster
aws redshift create-cluster \
  --cluster-identifier analytics-cluster \
  --node-type ra3.xlplus \
  --number-of-nodes 3 \
  --master-username admin \
  --master-user-password 'SecurePass123!' \
  --db-name warehouse \
  --iam-roles 'arn:aws:iam::123456789012:role/redshift-role'

# Describe cluster status
aws redshift describe-clusters \
  --cluster-identifier analytics-cluster \
  --query 'Clusters[0].{Status:ClusterStatus,Endpoint:Endpoint.Address,Nodes:NumberOfNodes}'

# Resize cluster (elastic resize for quick node count changes)
aws redshift resize-cluster \
  --cluster-identifier analytics-cluster \
  --cluster-type multi-node \
  --node-type ra3.xlplus \
  --number-of-nodes 6

# Pause cluster (stop billing for compute)
aws redshift pause-cluster --cluster-identifier analytics-cluster

# Resume a paused cluster
aws redshift resume-cluster --cluster-identifier analytics-cluster

# Create a manual snapshot
aws redshift create-cluster-snapshot \
  --cluster-identifier analytics-cluster \
  --snapshot-identifier analytics-snap-20250301

# Execute SQL via Data API (no JDBC connection needed)
aws redshift-data execute-statement \
  --cluster-identifier analytics-cluster \
  --database warehouse \
  --db-user admin \
  --sql "SELECT COUNT(*) FROM orders WHERE order_date = '2025-03-01'"

# Check statement status
aws redshift-data describe-statement --id <statement-id>

# Get results from a completed statement
aws redshift-data get-statement-result --id <statement-id>

# Delete a cluster
aws redshift delete-cluster \
  --cluster-identifier analytics-cluster \
  --skip-final-cluster-snapshot
```

---

## 15. VACUUM and ANALYZE

After bulk operations (COPY, DELETE, UPDATE), Redshift does not automatically reclaim disk space or update statistics. You must run these maintenance commands.

```sql
-- VACUUM: reclaim space and re-sort rows
VACUUM FULL orders;           -- Re-sort and reclaim space
VACUUM DELETE ONLY orders;    -- Reclaim space only (faster)
VACUUM SORT ONLY orders;      -- Re-sort only
VACUUM REINDEX orders;        -- Rebuild interleaved sort key index (expensive)

-- ANALYZE: update table statistics for the query optimizer
ANALYZE orders;
ANALYZE PREDICATE COLUMNS orders;  -- Only analyze columns used in predicates

-- Check table health: storage, skew, unsorted percentage
SELECT "table", size, pct_used, unsorted, skew_rows
FROM svv_table_info
WHERE "table" = 'orders';
```

**Run ANALYZE after every significant COPY or bulk operation.** Without current statistics, the query planner makes poor decisions (wrong join strategies, bad distribution choices).

---

## 16. Common Gotchas

| Gotcha | Details |
|--------|---------|
| **Leader-node-only functions** | Some functions (e.g., certain system catalog queries, `CURRENT_SCHEMA`) run only on the leader node. If used in a query against large datasets, the leader becomes a bottleneck. |
| **VACUUM and ANALYZE are not automatic** | Unlike PostgreSQL with autovacuum, Redshift requires you to schedule VACUUM and ANALYZE. Skipping them degrades query performance over time. |
| **Commit queue contention** | Redshift serializes commits. Lots of small single-row INSERTs cause commit queue bottlenecks. Batch writes with COPY instead. |
| **Not for OLTP** | Single-row lookups, frequent small updates, and high-concurrency short transactions are anti-patterns. Use RDS/Aurora/DynamoDB for OLTP. |
| **Cross-AZ data transfer costs** | Multi-AZ deployments or Spectrum queries across AZs incur data transfer charges. |
| **Concurrency limits** | Default concurrency is low (5-50 queries depending on WLM config). Design dashboards to cache results rather than hit Redshift directly. |
| **Resize downtime** | Classic resize copies data to a new cluster (hours of downtime). Use elastic resize for faster node count changes (minutes), but it only supports same node type. |
| **Sort key maintenance** | Interleaved sort keys require expensive VACUUM REINDEX operations. Compound sort keys are much cheaper to maintain. |
| **Distribution key changes** | You cannot ALTER a distribution key. Changing it requires recreating the table via deep copy (`CREATE TABLE new AS SELECT ... FROM old`). |
| **Distribution key skew** | A low-cardinality DISTKEY puts most data on one node, making queries sequential. Check `svv_table_info.skew_rows` and choose high-cardinality columns. |
| **Result caching** | Redshift caches results for identical queries. Great for dashboards, but can mask performance problems during development. Disable with `SET enable_result_cache_for_session TO off;`. |
| **Spectrum scan costs** | Spectrum charges $5 per TB scanned from S3. Use columnar formats (Parquet/ORC) and partition data to minimize scan volume. |
| **Disk space at 100%** | When disk usage exceeds ~80%, queries may fail. Monitor `PercentageDiskSpaceUsed` in CloudWatch. RA3 nodes avoid this by spilling to S3. |
