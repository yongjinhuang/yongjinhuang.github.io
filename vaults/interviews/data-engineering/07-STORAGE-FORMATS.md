# Data Storage & Formats

A comprehensive guide to data storage systems, file formats, and open table formats.
Covers warehouses, lakes, lakehouses, Parquet, ORC, Delta Lake, Apache Iceberg, Apache Hudi,
and partitioning strategies -- essential knowledge for data engineering interviews.

---

## Table of Contents

1. [Storage Paradigms](#1-storage-paradigms)
2. [Cloud Data Warehouses](#2-cloud-data-warehouses)
3. [File Formats](#3-file-formats)
4. [Columnar vs Row-Based](#4-columnar-vs-row-based)
5. [Delta Lake](#5-delta-lake)
6. [Apache Iceberg](#6-apache-iceberg)
7. [Apache Hudi](#7-apache-hudi)
8. [Lakehouse Format Comparison](#8-lakehouse-format-comparison)
9. [Partitioning Strategies](#9-partitioning-strategies)
10. [Common Interview Questions](#10-common-interview-questions)
11. [Quick Reference](#11-quick-reference)

---

## 1. Storage Paradigms

```
EVOLUTION OF DATA STORAGE

 Data Warehouse          Data Lake             Data Lakehouse
 (2000s)                 (2010s)               (2020s)
 ┌──────────┐           ┌──────────┐          ┌──────────────┐
 │Structured│           │ Raw data │          │ Open formats │
 │Schema on │           │Schema on │          │ ACID txns    │
 │ write    │           │  read    │          │ Schema enforce│
 │ SQL only │           │ Any format│         │ SQL + ML + BI│
 │ $$$      │           │ Cheap $  │          │ Governance   │
 └──────────┘           └──────────┘          └──────────────┘
  Snowflake              S3 + Spark            Delta Lake
  BigQuery               HDFS + Hive           Iceberg
  Redshift               GCS                   Hudi
```

| Aspect | Warehouse | Lake | Lakehouse |
|--------|-----------|------|-----------|
| **Schema** | On write | On read | On write (enforced) |
| **ACID** | Yes | No | Yes |
| **Data Types** | Structured | All | All |
| **Query** | SQL | Spark/custom | SQL + Spark + ML |
| **Cost** | High | Low | Medium |
| **Governance** | Built-in | Limited | Via table format |
| **Time Travel** | Some | No | Yes |
| **Use Case** | BI, reporting | Raw storage, ML | Unified analytics |

---

## 2. Cloud Data Warehouses

### Snowflake

```
┌──────────────────────────────────────┐
│          CLOUD SERVICES              │
│  (Authentication, metadata, optimizer)│
├──────────────────────────────────────┤
│       VIRTUAL WAREHOUSES             │
│  ┌────────┐ ┌────────┐ ┌────────┐   │
│  │  XS    │ │  M     │ │  XL    │   │
│  │compute │ │compute │ │compute │   │
│  └────────┘ └────────┘ └────────┘   │
│  (independent, auto-scale)           │
├──────────────────────────────────────┤
│       CENTRALIZED STORAGE            │
│  (S3/Azure Blob/GCS, micro-partitions│
│   columnar, compressed, encrypted)   │
└──────────────────────────────────────┘
```

Key: **Compute-storage separation**. Scale independently. Pay for compute only when running.

### BigQuery

- **Serverless**: No infrastructure to manage
- **Slots**: Unit of compute (auto-allocated or reserved)
- **Columnar**: Dremel execution engine, Capacitor storage format
- **BI Engine**: In-memory acceleration for dashboards
- **Pricing**: On-demand ($5/TB scanned) or flat-rate (reserved slots)

### Redshift

- **Leader + Compute Nodes**: Leader parses/plans, compute nodes execute
- **Distribution styles**: KEY, EVEN, ALL, AUTO
- **Redshift Serverless**: Auto-scaling alternative to provisioned clusters

---

## 3. File Formats

### Comparison

| Format | Type | Compression | Schema Evolution | Read Speed | Write Speed | Best For |
|--------|------|-------------|-----------------|-----------|------------|----------|
| **Parquet** | Columnar | Excellent | Good | Fast (analytics) | Medium | OLAP, analytics |
| **ORC** | Columnar | Excellent | Good | Fast | Medium | Hive ecosystem |
| **Avro** | Row-based | Good | Excellent | Fast (full rows) | Fast | Streaming, Kafka |
| **JSON** | Row-based | Poor | Flexible | Slow | Fast | APIs, logs |
| **CSV** | Row-based | Poor | None | Slow | Fast | Simple interchange |

### Apache Parquet

```
PARQUET FILE STRUCTURE
┌────────────────────────┐
│     Row Group 1        │
│  ┌──────┬──────┬────┐  │
│  │Col A │Col B │ColC│  │
│  │chunk │chunk │chnk│  │
│  │┌────┐│┌────┐│┌──┐│  │
│  ││Page│││Page│││Pg││  │
│  │├────┤│├────┤│├──┤│  │
│  ││Page│││Page│││Pg││  │
│  │└────┘│└────┘│└──┘│  │
│  └──────┴──────┴────┘  │
├────────────────────────┤
│     Row Group 2        │
│  (same structure)      │
├────────────────────────┤
│     FOOTER             │
│  (schema, statistics,  │
│   row group metadata)  │
└────────────────────────┘
```

**Key features:**
- Column chunks enable reading only needed columns
- Pages support predicate pushdown (min/max stats)
- Dictionary encoding for low-cardinality columns
- Snappy/ZSTD/Gzip compression per column

### Apache ORC

- **Stripes** (~250MB): Header + index + data + footer
- **Built-in indexes**: Row-level and stripe-level statistics
- **Bloom filters**: Fast negative lookups
- **ACID support**: For Hive-managed tables

### Apache Avro

- **Row-based**: Fast for full-row reads and writes
- **Schema in file header**: Self-describing
- **Schema evolution**: Add/remove fields with defaults
- **Common in Kafka**: Schema Registry manages Avro schemas

---

## 4. Columnar vs Row-Based

```
ROW-BASED (Avro, CSV, JSON)         COLUMNAR (Parquet, ORC)
┌──────┬──────┬──────┐              ┌──────┬──────┬──────┐
│ id=1 │name=A│age=25│              │ id=1 │ id=2 │ id=3 │ ← Col 1
├──────┼──────┼──────┤              ├──────┼──────┼──────┤
│ id=2 │name=B│age=30│              │name=A│name=B│name=C│ ← Col 2
├──────┼──────┼──────┤              ├──────┼──────┼──────┤
│ id=3 │name=C│age=35│              │age=25│age=30│age=35│ ← Col 3
└──────┴──────┴──────┘              └──────┴──────┴──────┘

Best for OLTP:                      Best for OLAP:
- INSERT/UPDATE/DELETE              - SELECT specific columns
- Full row reads                   - Aggregations (SUM, AVG)
- Transaction processing           - Analytics, reporting
```

| Aspect | Row-Based | Columnar |
|--------|-----------|----------|
| **Read pattern** | Full rows | Specific columns |
| **Compression** | Lower ratio | Higher (similar values) |
| **Write speed** | Faster | Slower |
| **OLTP** | Excellent | Poor |
| **OLAP** | Poor | Excellent |

---

## 5. Delta Lake

Developed by Databricks. Extends Parquet with a transactional storage layer.

### Key Features

- **ACID Transactions**: Serializable isolation via optimistic concurrency
- **Transaction Log** (`_delta_log/`): Append-only JSON + Parquet checkpoints
- **Time Travel**: Query any historical version
- **Schema Enforcement**: Reject writes that don't match schema
- **Schema Evolution**: Add columns, change types safely
- **Z-Ordering**: Multi-dimensional clustering for query optimization
- **Delta UniForm**: Read Delta tables as Iceberg or Hudi

### Transaction Log

```
my_table/
├── _delta_log/
│   ├── 00000000000000000000.json   # Version 0
│   ├── 00000000000000000001.json   # Version 1
│   ├── ...
│   └── 00000000000000000010.checkpoint.parquet  # Checkpoint
├── part-00000-*.parquet            # Data files
└── part-00001-*.parquet
```

### Operations

```sql
-- Time travel
SELECT * FROM my_table VERSION AS OF 5;
SELECT * FROM my_table TIMESTAMP AS OF '2024-01-01';

-- Optimize (compact small files + Z-order)
OPTIMIZE my_table ZORDER BY (date, user_id);

-- Vacuum (delete old files)
VACUUM my_table RETAIN 168 HOURS;
```

---

## 6. Apache Iceberg

Developed by Netflix, donated to Apache. High-performance format for large analytic tables.

### Metadata Architecture

```
┌─────────────────────────────────┐
│           CATALOG               │  (Hive Metastore, AWS Glue,
│   (table location pointer)      │   Nessie, REST catalog)
├─────────────────────────────────┤
│       METADATA FILE             │  (schema, partition spec,
│   (current snapshot pointer)    │   snapshot history)
├─────────────────────────────────┤
│       MANIFEST LIST             │  (list of manifest files
│   (snapshot → manifests)        │   for this snapshot)
├─────────────────────────────────┤
│       MANIFEST FILES            │  (list of data files with
│   (data file locations +        │   column-level stats:
│    partition values +           │   min, max, null count)
│    column statistics)           │
├─────────────────────────────────┤
│       DATA FILES                │  (Parquet / ORC / Avro)
└─────────────────────────────────┘
```

### Key Features

- **Hidden Partitioning**: Users don't specify partition filters in queries
- **Partition Evolution**: Change partitioning without rewriting data
- **Schema Evolution**: Add, rename, reorder, widen columns
- **Time Travel**: Query by snapshot ID or timestamp
- **Snapshot Isolation**: Concurrent reads/writes without locks

### Hidden Partitioning

```sql
-- Create table with hidden partitioning
CREATE TABLE events (
    event_id BIGINT,
    event_time TIMESTAMP,
    user_id BIGINT
) USING iceberg
PARTITIONED BY (days(event_time), bucket(16, user_id));

-- Query WITHOUT specifying partition -- Iceberg handles pruning
SELECT * FROM events WHERE event_time > '2024-01-01';
```

### Partition Evolution

```sql
-- Change from monthly to daily partitioning -- no data rewrite
ALTER TABLE events SET PARTITION SPEC (days(event_time));
```

New data uses daily partitions; old data retains monthly. Iceberg handles both transparently.

---

## 7. Apache Hudi

Developed at Uber. Excels at incremental processing and CDC (Change Data Capture).

### Storage Types

| Type | Storage | Read Speed | Write Speed | Use Case |
|------|---------|-----------|-------------|----------|
| **Copy-on-Write (CoW)** | Parquet only | Fast (no merge) | Slow (rewrite files) | Read-heavy |
| **Merge-on-Read (MoR)** | Parquet + Avro logs | Slower (merge at read) | Fast (append logs) | Write-heavy/streaming |

### Timeline

Hudi maintains a timeline of all actions (commits, cleans, compactions) for:
- Time travel queries
- Incremental queries (only changed data since last read)
- Rollback to previous state

### Compaction (MoR)

Log files periodically compacted into Parquet base files to maintain read performance.

---

## 8. Lakehouse Format Comparison

| Feature | Delta Lake | Apache Iceberg | Apache Hudi |
|---------|-----------|----------------|-------------|
| **Origin** | Databricks | Netflix | Uber |
| **License** | Apache 2.0 | Apache 2.0 | Apache 2.0 |
| **ACID** | Yes | Yes | Yes |
| **Time Travel** | Yes | Yes | Yes |
| **Schema Evolution** | Yes | Yes (most flexible) | Yes |
| **Hidden Partitioning** | No | Yes | No |
| **Partition Evolution** | No (rewrite needed) | Yes (no rewrite) | Limited |
| **File Formats** | Parquet only | Parquet, ORC, Avro | Parquet + Avro |
| **Engine Support** | Spark-centric | Multi-engine | Multi-engine |
| **CDC/Incremental** | CDC support | Snapshot-based | Native (best) |
| **Compaction** | OPTIMIZE command | Background | Built-in (MoR) |
| **Interoperability** | Delta UniForm | Native multi-engine | Limited |
| **Best For** | Databricks/Spark shops | Vendor-neutral lakehouse | CDC, streaming ingest |
| **Adoption Trend** | Strong in Databricks | Fastest growing | Steady |

**Industry trend**: Convergence. Delta UniForm enables reading Delta as Iceberg/Hudi.
Snowflake adopted native Iceberg tables. All three are approaching feature parity.

---

## 9. Partitioning Strategies

### Hive-Style Partitioning

```
data/
├── year=2024/
│   ├── month=01/
│   │   ├── day=01/
│   │   │   └── part-00000.parquet
│   │   └── day=02/
│   └── month=02/
└── year=2025/
```

### Avoiding Common Mistakes

| Problem | Cause | Solution |
|---------|-------|----------|
| Too many small files | Over-partitioning | Fewer partition columns, wider partitions |
| Full table scans | Under-partitioning | Add partition on common filter columns |
| Skewed partitions | Uneven data distribution | Add bucketing, composite keys |

### Z-Ordering

Multi-dimensional clustering that co-locates related data for faster multi-column filters:

```sql
-- Delta Lake
OPTIMIZE my_table ZORDER BY (date, user_id);

-- Iceberg (sort orders)
ALTER TABLE my_table WRITE ORDERED BY (date, bucket(16, user_id));
```

### Bucketing

Hash-based partitioning for join optimization:

```sql
-- Spark
df.write.bucketBy(16, "user_id").sortBy("user_id").saveAsTable("users_bucketed")
```

---

## 10. Common Interview Questions

**Q: When would you choose a lakehouse over a warehouse?**
Lakehouses are preferred when: you need to support both SQL analytics AND ML/data science workloads, you want to avoid vendor lock-in with open formats, cost optimization is important, or you need flexible schema evolution. Warehouses are still better for pure BI/reporting with complex SQL.

**Q: Compare Parquet vs ORC.**
Both are columnar. Parquet is the industry standard (wider engine support, better for Spark). ORC is optimized for Hive/HDFS with built-in indexes and bloom filters. For new projects, default to Parquet.

**Q: What is hidden partitioning in Iceberg?**
Unlike Hive-style partitioning where users must know partition columns, Iceberg derives partitions from column transforms (days, hours, bucket, truncate). Users query without partition filters -- Iceberg handles pruning automatically via metadata.

**Q: Explain Copy-on-Write vs Merge-on-Read in Hudi.**
CoW rewrites entire Parquet files on updates (slow writes, fast reads). MoR appends changes to log files and merges at read time (fast writes, slower reads). Use CoW for read-heavy; MoR for write-heavy/streaming.

**Q: What is Delta Lake's transaction log?**
An append-only series of JSON files in `_delta_log/` recording every change. Enables ACID transactions via optimistic concurrency, time travel via version tracking, and efficient metadata queries via periodic Parquet checkpoints.

**Q: How does partition evolution work in Iceberg?**
You can change the partitioning scheme without rewriting existing data. New data uses the new scheme; old data retains the old one. Iceberg's metadata handles both transparently during query planning.

---

## 11. Quick Reference

| Format | Type | Best For |
|--------|------|----------|
| Parquet | File format (columnar) | Analytics, OLAP |
| ORC | File format (columnar) | Hive ecosystem |
| Avro | File format (row-based) | Streaming, Kafka |
| Delta Lake | Table format | Databricks/Spark shops |
| Iceberg | Table format | Vendor-neutral lakehouse |
| Hudi | Table format | CDC, streaming ingest |
| Snowflake | Cloud warehouse | BI, complex SQL |
| BigQuery | Cloud warehouse (serverless) | Ad-hoc analytics |
| Redshift | Cloud warehouse | AWS ecosystem |
