# PostgreSQL Deep Dive

PostgreSQL is the most advanced open-source relational database. It powers everything from startups to enterprises (Apple, Instagram, Spotify). As a backend engineer, PostgreSQL is likely your primary datastore -- understanding its internals gives you an edge in interviews and production debugging.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [MVCC -- Multi-Version Concurrency Control](#mvcc)
3. [Write-Ahead Log (WAL)](#write-ahead-log)
4. [Vacuum and Autovacuum](#vacuum-and-autovacuum)
5. [Connection Management](#connection-management)
6. [Partitioning](#partitioning)
7. [JSONB](#jsonb)
8. [Full-Text Search](#full-text-search)
9. [Replication](#replication)
10. [Extensions](#extensions)
11. [Performance Tuning](#performance-tuning)
12. [Common Interview Questions](#common-interview-questions)

---

## Architecture Overview

```
Client Connections
       |
       v
+------------------+
| Postmaster       |  <-- Main process, spawns backends
+------------------+
       |
       v (fork per connection)
+------------------+     +------------------+     +------------------+
| Backend Process  |     | Backend Process  |     | Backend Process  |
| (per connection) |     | (per connection) |     | (per connection) |
+------------------+     +------------------+     +------------------+
       |                        |                        |
       v                        v                        v
+----------------------------------------------------------------+
|                    Shared Memory                                |
|  +-------------------+  +-----------------+  +---------------+ |
|  | Shared Buffers    |  | WAL Buffers     |  | Lock Table    | |
|  | (page cache)      |  | (write-ahead)   |  | (row locks)   | |
|  +-------------------+  +-----------------+  +---------------+ |
+----------------------------------------------------------------+
       |                        |
       v                        v
+------------------+     +------------------+
| Data Files       |     | WAL Files        |
| (heap, index)    |     | (pg_wal/)        |
+------------------+     +------------------+
```

PostgreSQL uses a **process-per-connection** model (not threads). Each connection gets its own backend process. This is simple and safe but means connections are expensive (~10 MB each). This is why connection pooling is critical.

---

## MVCC

Multi-Version Concurrency Control allows readers and writers to not block each other. Instead of locking rows, PostgreSQL keeps multiple versions of each row.

### How It Works

Every row has hidden system columns:

| Column | Purpose                                                           |
| ------ | ----------------------------------------------------------------- |
| `xmin` | Transaction ID that inserted this row version                     |
| `xmax` | Transaction ID that deleted/updated this row version (0 if alive) |
| `ctid` | Physical location (page, offset) -- changes on UPDATE             |

```
UPDATE users SET name = 'Bob' WHERE id = 1;

Before: Row(id=1, name='Alice', xmin=100, xmax=0)
After:  Row(id=1, name='Alice', xmin=100, xmax=200)  -- old version, marked dead
        Row(id=1, name='Bob',   xmin=200, xmax=0)    -- new version
```

**Key insight:** UPDATE in PostgreSQL is DELETE + INSERT. The old row stays on disk until VACUUM cleans it up. This is why:

- UPDATEs are more expensive than in MySQL (which updates in-place)
- Tables grow over time (bloat) without regular vacuuming
- HOT updates (Heap-Only Tuples) optimize this when no indexed column changes

### Visibility Rules

A row version is visible to transaction T if:

1. `xmin` is committed and `xmin < T`'s snapshot
2. `xmax` is either 0 (not deleted), not committed, or committed after T's snapshot

---

## Write-Ahead Log

The WAL ensures durability. Every change is written to the WAL before it is applied to data files.

```
Transaction COMMIT
       |
       v
+------------------+     +------------------+
| WAL Buffer       | --> | WAL Files        |  (sequential write, fast)
+------------------+     +------------------+
       |                         |
       v                         v
+------------------+     +------------------+
| Shared Buffers   | --> | Data Files       |  (random write, slow -- done by checkpointer)
+------------------+     +------------------+
```

### Key WAL Parameters

| Parameter            | Default   | Purpose                                            |
| -------------------- | --------- | -------------------------------------------------- |
| `wal_level`          | `replica` | How much info to write (minimal, replica, logical) |
| `max_wal_size`       | 1 GB      | Triggers checkpoint when WAL grows beyond this     |
| `checkpoint_timeout` | 5 min     | Maximum time between checkpoints                   |
| `synchronous_commit` | on        | Wait for WAL flush before reporting commit success |
| `archive_mode`       | off       | Archive WAL segments for PITR                      |

**synchronous_commit = off:** Trades durability for performance. Committed transactions may be lost in a crash (up to 3x `wal_writer_delay`, default 600ms of data). Useful for high-throughput, loss-tolerant workloads.

---

## Vacuum and Autovacuum

Because MVCC leaves dead rows behind, VACUUM is essential.

### What VACUUM Does

1. **Marks dead tuples as reusable** -- space can be reused by future inserts
2. **Updates the visibility map** -- allows index-only scans
3. **Updates the free space map** -- tells Postgres where to insert new rows
4. **Freezes old transaction IDs** -- prevents wraparound (critical!)

### VACUUM vs VACUUM FULL

| Operation   | Locks Table?           | Reclaims Disk Space?      | Speed |
| ----------- | ---------------------- | ------------------------- | ----- |
| VACUUM      | No (runs concurrently) | No (marks space reusable) | Fast  |
| VACUUM FULL | Yes (exclusive lock!)  | Yes (rewrites table)      | Slow  |

**Never run VACUUM FULL on production** without planning downtime. Use `pg_repack` for online table compaction instead.

### Autovacuum Tuning

```
Key parameters:
  autovacuum_vacuum_threshold = 50           -- min dead tuples before vacuum
  autovacuum_vacuum_scale_factor = 0.2       -- fraction of table size
  -- Vacuum triggers when: dead_tuples > threshold + scale_factor * table_size

  autovacuum_vacuum_cost_delay = 2ms         -- pause between I/O operations
  autovacuum_vacuum_cost_limit = 200         -- I/O budget per round
```

**For high-churn tables:** Lower the scale_factor (e.g., 0.01) per table:

```sql
ALTER TABLE events SET (autovacuum_vacuum_scale_factor = 0.01);
```

### Transaction ID Wraparound

PostgreSQL uses 32-bit transaction IDs (~4 billion). When they wrap around, old data becomes "in the future" and invisible. The `autovacuum` "freezes" old txids to prevent this. If autovacuum falls behind, PostgreSQL will **refuse new transactions** to prevent data loss.

```sql
-- Monitor wraparound risk
SELECT datname, age(datfrozenxid) AS xid_age,
       2^31 - age(datfrozenxid) AS remaining
FROM pg_database ORDER BY xid_age DESC;
-- If remaining < 10 million, you have an urgent problem
```

---

## Connection Management

### The Problem

Each connection = one OS process (~10 MB). 500 connections = 5 GB just for connection overhead. Active queries also consume CPU for context switching.

### PgBouncer

```
Application (1000 connections)
       |
       v
+------------------+
| PgBouncer        |  <-- Lightweight connection pooler
| (50 connections) |
+------------------+
       |
       v
+------------------+
| PostgreSQL       |  <-- Only sees 50 connections
| (50 backends)    |
+------------------+
```

| Pool Mode       | Behavior                               | Limitations                                      |
| --------------- | -------------------------------------- | ------------------------------------------------ |
| **session**     | Connection assigned for entire session | Least efficient, most compatible                 |
| **transaction** | Connection assigned per transaction    | Cannot use session-level features (PREPARE, SET) |
| **statement**   | Connection assigned per statement      | Cannot use transactions (very rare use case)     |

**Best practice:** Use `transaction` mode. If you need prepared statements, use PgBouncer 1.21+ with `DEALLOCATE ALL` or switch to session mode for those connections.

---

## Partitioning

### Declarative Partitioning (v10+)

```sql
-- Range partitioning (most common: time-series data)
CREATE TABLE events (
    id BIGSERIAL,
    event_time TIMESTAMPTZ NOT NULL,
    payload JSONB
) PARTITION BY RANGE (event_time);

CREATE TABLE events_2024_q1 PARTITION OF events
    FOR VALUES FROM ('2024-01-01') TO ('2024-04-01');
CREATE TABLE events_2024_q2 PARTITION OF events
    FOR VALUES FROM ('2024-04-01') TO ('2024-07-01');

-- List partitioning
CREATE TABLE orders (
    id BIGSERIAL,
    region TEXT NOT NULL,
    total NUMERIC
) PARTITION BY LIST (region);

CREATE TABLE orders_us PARTITION OF orders FOR VALUES IN ('us-east', 'us-west');
CREATE TABLE orders_eu PARTITION OF orders FOR VALUES IN ('eu-west', 'eu-central');

-- Hash partitioning (distribute evenly)
CREATE TABLE sessions PARTITION BY HASH (user_id);
CREATE TABLE sessions_0 PARTITION OF sessions FOR VALUES WITH (MODULUS 4, REMAINDER 0);
CREATE TABLE sessions_1 PARTITION OF sessions FOR VALUES WITH (MODULUS 4, REMAINDER 1);
```

### When to Partition

- Tables > 100 GB
- Time-series data with retention policies (drop old partitions)
- Multi-tenant with per-tenant queries
- Parallel query execution across partitions

**Gotcha:** Indexes are per-partition. A unique constraint must include the partition key.

---

## JSONB

PostgreSQL's JSONB stores JSON in a binary format with indexing support -- a compelling alternative to MongoDB for many use cases.

```sql
-- Store and query JSONB
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    data JSONB NOT NULL
);

INSERT INTO products (data) VALUES ('{"name": "Widget", "price": 9.99, "tags": ["sale", "new"]}');

-- Access operators
SELECT data->>'name' AS name,              -- text extraction
       data->'price' AS price,              -- JSONB extraction
       data#>'{tags,0}' AS first_tag        -- nested path
FROM products;

-- Containment queries (uses GIN index)
SELECT * FROM products WHERE data @> '{"tags": ["sale"]}';

-- Existence
SELECT * FROM products WHERE data ? 'price';

-- JSONB path queries (v12+)
SELECT * FROM products WHERE data @? '$.tags[*] ? (@ == "sale")';

-- GIN index for all keys/values
CREATE INDEX idx_products_data ON products USING gin(data);

-- GIN index on specific path
CREATE INDEX idx_products_tags ON products USING gin((data->'tags'));
```

### JSONB vs JSON

| Feature     | JSON                                   | JSONB                    |
| ----------- | -------------------------------------- | ------------------------ |
| Storage     | Text (preserves whitespace, key order) | Binary (decomposed)      |
| Write speed | Faster (no parsing)                    | Slower (parses on write) |
| Read speed  | Slower (re-parse each query)           | Faster (pre-parsed)      |
| Indexing    | No                                     | Yes (GIN, GiST)          |
| Use case    | Audit logs, preserve format            | Everything else          |

---

## Full-Text Search

PostgreSQL has built-in full-text search, eliminating the need for Elasticsearch in many cases.

```sql
-- Create tsvector column
ALTER TABLE articles ADD COLUMN search_vector tsvector;
UPDATE articles SET search_vector = to_tsvector('english', title || ' ' || body);

-- GIN index for fast search
CREATE INDEX idx_search ON articles USING gin(search_vector);

-- Search
SELECT title, ts_rank(search_vector, query) AS rank
FROM articles, to_tsquery('english', 'database & optimization') AS query
WHERE search_vector @@ query
ORDER BY rank DESC;

-- Auto-update with trigger
CREATE TRIGGER update_search_vector
    BEFORE INSERT OR UPDATE ON articles
    FOR EACH ROW EXECUTE FUNCTION
    tsvector_update_trigger(search_vector, 'pg_catalog.english', title, body);
```

---

## Replication

### Streaming Replication (Physical)

```
Primary                    Replica
+----------+     WAL      +----------+
| Write    | -----------> | Read     |
| (R/W)    |   stream     | (R/O)    |
+----------+              +----------+
```

- Byte-for-byte copy of WAL
- Replica is identical to primary
- Cannot replicate a subset of tables
- Synchronous or asynchronous

### Logical Replication (v10+)

```sql
-- On publisher
CREATE PUBLICATION my_pub FOR TABLE users, orders;

-- On subscriber
CREATE SUBSCRIPTION my_sub
    CONNECTION 'host=primary dbname=mydb'
    PUBLICATION my_pub;
```

- Replicates at logical level (row changes)
- Can replicate subset of tables
- Can replicate between different PostgreSQL versions
- Supports different indexes/schemas on subscriber
- Used for: zero-downtime migrations, data integration, multi-region

---

## Extensions

| Extension              | Purpose                        | Example Use                        |
| ---------------------- | ------------------------------ | ---------------------------------- |
| **PostGIS**            | Geospatial queries             | `ST_Distance`, `ST_Within`         |
| **pg_trgm**            | Fuzzy text matching            | `SIMILARITY('kitten', 'sitting')`  |
| **pg_stat_statements** | Query performance tracking     | Top slow queries                   |
| **pgcrypto**           | Encryption functions           | `crypt()`, `gen_random_uuid()`     |
| **pg_partman**         | Automated partition management | Auto-create monthly partitions     |
| **timescaledb**        | Time-series optimizations      | Hypertables, continuous aggregates |
| **pgvector**           | Vector similarity search       | AI embeddings, semantic search     |
| **citus**              | Distributed PostgreSQL         | Sharding across nodes              |

---

## Performance Tuning

### Key Parameters

| Parameter                         | Default | Recommendation           | Why                                   |
| --------------------------------- | ------- | ------------------------ | ------------------------------------- |
| `shared_buffers`                  | 128 MB  | 25% of RAM               | Page cache inside PostgreSQL          |
| `effective_cache_size`            | 4 GB    | 75% of RAM               | Hint to planner about OS cache        |
| `work_mem`                        | 4 MB    | 256 MB / max_connections | Memory per sort/hash operation        |
| `maintenance_work_mem`            | 64 MB   | 1-2 GB                   | Memory for VACUUM, CREATE INDEX       |
| `random_page_cost`                | 4.0     | 1.1 (SSD)                | Planner's estimate of random I/O cost |
| `max_connections`                 | 100     | 50-200 (use pooler)      | Each connection = process + memory    |
| `max_parallel_workers_per_gather` | 2       | 2-4                      | Parallel query workers                |

### Monitoring Queries

```sql
-- Slow queries (requires pg_stat_statements)
SELECT query, calls, mean_exec_time, total_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC LIMIT 20;

-- Table bloat estimate
SELECT schemaname, relname, n_dead_tup, n_live_tup,
       ROUND(n_dead_tup::numeric / GREATEST(n_live_tup, 1) * 100, 1) AS dead_pct
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC LIMIT 20;

-- Cache hit ratio (should be > 99%)
SELECT SUM(heap_blks_hit) / (SUM(heap_blks_hit) + SUM(heap_blks_read)) AS ratio
FROM pg_statio_user_tables;

-- Long-running queries
SELECT pid, age(clock_timestamp(), query_start), usename, query
FROM pg_stat_activity
WHERE state != 'idle' AND query NOT ILIKE '%pg_stat_activity%'
ORDER BY query_start;
```

---

## Common Interview Questions

1. **How does MVCC work in PostgreSQL?** Each row version has xmin/xmax. Readers see a snapshot. Writers create new versions. Dead versions cleaned by VACUUM.

2. **What happens if autovacuum is not running?** Table bloat grows, query performance degrades, and eventually transaction ID wraparound forces PostgreSQL to shut down.

3. **Why use PgBouncer?** PostgreSQL forks a process per connection (~10 MB each). PgBouncer multiplexes many app connections onto few database connections.

4. **When would you use JSONB vs a separate table?** JSONB for semi-structured data that varies per row and is queried as a unit. Separate tables for structured data with relationships and individual column queries.

5. **How do you handle a slow query in production?** Check `pg_stat_statements`, run `EXPLAIN ANALYZE`, look for sequential scans on large tables, check indexes, check autovacuum status, check connection count.

6. **Explain logical vs physical replication.** Physical: byte-for-byte WAL copy, entire cluster. Logical: row-level changes, specific tables, can differ in schema/version.

7. **What is HOT update?** When an UPDATE changes only non-indexed columns and there is space on the same page, PostgreSQL avoids creating a new index entry. Dramatically reduces index bloat for frequently updated tables.

8. **How do you do zero-downtime schema migrations?** Use logical replication to replicate to a new schema, or use `ALTER TABLE ... ADD COLUMN` (instant for nullable columns without defaults in v11+), and `CREATE INDEX CONCURRENTLY`.
