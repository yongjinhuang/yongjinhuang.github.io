# MySQL Deep Dive

MySQL is the world's most popular open-source database. It powers most of the internet -- Wikipedia, Facebook (Meta), Twitter (X), Uber, Airbnb. Despite PostgreSQL's rise, MySQL remains dominant in production, especially in high-throughput read-heavy workloads. Understanding InnoDB internals is essential for backend engineer interviews.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [InnoDB Storage Engine](#innodb-storage-engine)
3. [Buffer Pool](#buffer-pool)
4. [Redo Log and Undo Log](#redo-log-and-undo-log)
5. [Locking and MVCC](#locking-and-mvcc)
6. [Replication](#replication)
7. [MySQL 8.0+ Features](#mysql-80-features)
8. [Performance Tuning](#performance-tuning)
9. [MySQL vs PostgreSQL](#mysql-vs-postgresql)
10. [Common Interview Questions](#common-interview-questions)

---

## Architecture Overview

```
Client Connections
       |
       v
+------------------+
| Connection Pool  |  <-- Thread-per-connection (not process-per-connection like PG)
+------------------+
       |
       v
+------------------+
| SQL Layer        |  Parser -> Optimizer -> Executor
+------------------+
       |
       v
+------------------+     +------------------+     +------------------+
| InnoDB           |     | MyISAM           |     | Memory           |
| (default engine) |     | (legacy, no txn) |     | (temp tables)    |
+------------------+     +------------------+     +------------------+
       |
       v
+------------------+
| Tablespace Files |  (.ibd files, one per table by default)
+------------------+
```

**Key difference from PostgreSQL:** MySQL uses a **thread-per-connection** model, not a process-per-connection model. Threads share memory and are lighter weight. However, you still need connection pooling at scale (MySQL's native connection handling caps around 5000-10000).

---

## InnoDB Storage Engine

InnoDB is the default and only production-worthy engine. Always use it.

### Clustered Index

InnoDB stores data **sorted by the primary key** in a B+tree (the "clustered index"). The leaf nodes of the primary key index contain the actual row data.

```
Primary Key B+tree (Clustered Index)
+--------+--------+--------+
| PK=1   | PK=5   | PK=10  |  <-- Internal nodes
+--------+--------+--------+
    |         |         |
    v         v         v
+--------+ +--------+ +--------+
| PK=1   | | PK=5   | | PK=10  |  <-- Leaf nodes contain FULL ROW DATA
| name=A | | name=C | | name=E |
| age=25 | | age=30 | | age=35 |
+--------+ +--------+ +--------+

Secondary Index B+tree
+--------+--------+--------+
| name=A | name=C | name=E |  <-- Leaf nodes contain PRIMARY KEY value
| -> PK1 | -> PK5 | -> PK10|
+--------+--------+--------+
```

**Implications:**

- Secondary index lookups require two B+tree traversals (secondary -> PK -> row data)
- Sequential inserts by PK are fast (append to end of B+tree)
- Random inserts cause page splits (use auto-increment or UUID v7)
- `SELECT *` is expensive with secondary indexes (has to go back to clustered index)

### Page Structure

InnoDB stores data in 16 KB pages. Rows are stored within pages. Minimum row size in a page is ~8 KB, so at least 2 rows per page. If a row is too large, overflow pages are used (for TEXT/BLOB columns).

---

## Buffer Pool

The buffer pool is InnoDB's most important memory structure. It caches data and index pages in memory to avoid disk I/O.

```
+----------------------------------------------------------+
|                     Buffer Pool                           |
|  +--------------------------------------------------+    |
|  | Young Sublist (5/8)  | Old Sublist (3/8)          |   |
|  | (frequently accessed)| (recently loaded)           |   |
|  +--------------------------------------------------+    |
|                                                           |
|  Modified (dirty) pages are flushed to disk               |
|  by the page cleaner threads                              |
+----------------------------------------------------------+
```

### Key Parameters

| Parameter                             | Default | Recommendation                 |
| ------------------------------------- | ------- | ------------------------------ |
| `innodb_buffer_pool_size`             | 128 MB  | 70-80% of total RAM            |
| `innodb_buffer_pool_instances`        | 8       | 1 per GB of buffer pool        |
| `innodb_buffer_pool_dump_at_shutdown` | ON      | Warm up buffer pool on restart |
| `innodb_buffer_pool_load_at_startup`  | ON      | Load saved buffer pool         |

### Buffer Pool Hit Ratio

```sql
SHOW GLOBAL STATUS LIKE 'Innodb_buffer_pool_read%';
-- Hit ratio = 1 - (Innodb_buffer_pool_reads / Innodb_buffer_pool_read_requests)
-- Should be > 99%
```

---

## Redo Log and Undo Log

### Redo Log (WAL equivalent)

Ensures durability. Changes are written to redo log before data files.

```
Transaction writes
       |
       v
+------------------+     +------------------+
| Log Buffer       | --> | Redo Log Files   |  (ib_logfile0, ib_logfile1)
+------------------+     +------------------+
                                |
                                v (checkpoint)
                         +------------------+
                         | Tablespace Files |
                         +------------------+
```

| Parameter                        | Default | Purpose                    |
| -------------------------------- | ------- | -------------------------- |
| `innodb_log_file_size`           | 48 MB   | Size of each redo log file |
| `innodb_log_files_in_group`      | 2       | Number of redo log files   |
| `innodb_flush_log_at_trx_commit` | 1       | When to flush redo log     |

**`innodb_flush_log_at_trx_commit`:**

- `1` -- Flush to disk on every commit (safest, ACID compliant)
- `2` -- Write to OS cache on commit, flush every second (lose 1s on OS crash)
- `0` -- Write and flush every second (lose 1s on MySQL crash)

### Undo Log

Used for MVCC and rollback. Stores previous versions of modified rows.

```
Before UPDATE: Row(id=1, name='Alice', trx_id=100)
After UPDATE:  Row(id=1, name='Bob',   trx_id=200)

Undo log stores: (id=1, name='Alice') so trx_id < 200 can still see 'Alice'
```

Unlike PostgreSQL (which stores old versions in the heap), MySQL stores undo data separately. This means:

- No table bloat from updates (big advantage over PostgreSQL)
- Undo log can grow if long-running transactions hold old snapshots
- Purge thread cleans up undo log (equivalent to VACUUM)

---

## Locking and MVCC

### Lock Types

| Lock                       | Scope                     | Example                                         |
| -------------------------- | ------------------------- | ----------------------------------------------- |
| **Row lock (record lock)** | Single index record       | `SELECT ... FOR UPDATE WHERE id = 1`            |
| **Gap lock**               | Gap between index records | Prevents phantom reads in REPEATABLE READ       |
| **Next-key lock**          | Record + gap before it    | Default for REPEATABLE READ (prevents phantoms) |
| **Intention lock**         | Table level               | Signals row-level lock intention (IS, IX)       |

### Gap Locks (Unique to MySQL/InnoDB)

```sql
-- In REPEATABLE READ, this locks the gap (3, 7) if no row with id=5 exists
SELECT * FROM t WHERE id = 5 FOR UPDATE;

-- Range scan locks gaps too
SELECT * FROM t WHERE id BETWEEN 3 AND 7 FOR UPDATE;
-- Locks: record 3, gap (3,7), record 7, gap (7, next_record)
```

**Gap locks are the #1 cause of unexpected deadlocks in MySQL.** They do not exist in PostgreSQL's REPEATABLE READ (which uses SSI instead).

### Deadlock Detection

InnoDB has automatic deadlock detection. When detected, it rolls back the transaction with the fewest undo log records. You can monitor with:

```sql
SHOW ENGINE INNODB STATUS\G
-- Look for "LATEST DETECTED DEADLOCK" section
```

---

## Replication

### Binary Log (Binlog)

All replication in MySQL is based on the binary log, which records all changes.

```
Source (Primary)                Replica
+------------------+           +------------------+
| SQL Thread       |           | I/O Thread       |  <-- Fetches binlog events
| writes binlog    | --------> | writes relay log  |
+------------------+           +------------------+
                                       |
                                       v
                               +------------------+
                               | SQL Thread       |  <-- Replays relay log
                               | applies changes  |
                               +------------------+
```

### Binlog Formats

| Format        | How                                   | Pros                | Cons                                              |
| ------------- | ------------------------------------- | ------------------- | ------------------------------------------------- |
| **STATEMENT** | Logs SQL statements                   | Small log size      | Non-deterministic functions break (NOW(), RAND()) |
| **ROW**       | Logs actual row changes               | Deterministic, safe | Large log size for bulk updates                   |
| **MIXED**     | Statement by default, row when needed | Best of both        | Complex behavior                                  |

**Best practice:** Use ROW format. It is deterministic and safe. The extra disk space is worth the reliability.

### GTID Replication (MySQL 5.6+)

Global Transaction Identifiers give every transaction a unique ID: `source_uuid:transaction_id`.

```
Benefits:
- Easy failover: replica knows exactly which transactions it has
- No need to track binlog file + position
- Automatic transaction consistency checking
```

### Semi-Synchronous Replication

```
Source writes binlog -> at least one replica acknowledges -> source commits
```

Reduces data loss risk compared to async replication. With `rpl_semi_sync_source_wait_for_slave_count = 1`, the source waits for at least one replica to confirm receipt before returning to the client.

### Group Replication (MySQL 8.0)

Built-in Paxos-based multi-source replication. All nodes can accept writes (multi-primary) or one node is primary (single-primary). Conflict detection at row level.

---

## MySQL 8.0+ Features

| Feature                | Description                                                   |
| ---------------------- | ------------------------------------------------------------- |
| **Window functions**   | ROW_NUMBER, RANK, LAG, LEAD, etc.                             |
| **CTEs**               | WITH RECURSIVE support                                        |
| **JSON improvements**  | JSON_TABLE, multi-valued indexes, partial updates             |
| **Instant ADD COLUMN** | Adding column at end is instant (no table rebuild)            |
| **Invisible indexes**  | Test impact of dropping an index without actually dropping it |
| **Descending indexes** | B+tree can be sorted descending natively                      |
| **Roles**              | Named privilege sets for easier access management             |
| **Data dictionary**    | Transactional metadata (no more .frm files)                   |
| **Hash join**          | For equi-joins without usable indexes (was nested loop only)  |

---

## Performance Tuning

### Query Optimization

```sql
-- Check slow query log
SET GLOBAL slow_query_log = 'ON';
SET GLOBAL long_query_time = 1;  -- queries longer than 1 second

-- EXPLAIN format
EXPLAIN FORMAT=TREE SELECT ...;  -- MySQL 8.0 tree format
EXPLAIN ANALYZE SELECT ...;      -- Actually executes (8.0.18+)

-- Check index usage
SELECT * FROM sys.schema_unused_indexes;
SELECT * FROM sys.schema_redundant_indexes;
```

### Key Tuning Parameters

| Parameter                        | Recommendation       | Why                       |
| -------------------------------- | -------------------- | ------------------------- |
| `innodb_buffer_pool_size`        | 70-80% of RAM        | Most critical parameter   |
| `innodb_flush_log_at_trx_commit` | 1 (safe) or 2 (fast) | Durability vs performance |
| `innodb_io_capacity`             | Match your disk IOPS | Flushing dirty pages      |
| `innodb_read_io_threads`         | 4-8                  | Read-ahead threads        |
| `innodb_write_io_threads`        | 4-8                  | Write threads             |
| `max_connections`                | 500-1000             | Use connection pooling    |
| `thread_cache_size`              | 100                  | Reuse threads             |
| `table_open_cache`               | 4000                 | Cached table descriptors  |

---

## MySQL vs PostgreSQL

| Aspect               | MySQL (InnoDB)                       | PostgreSQL                                    |
| -------------------- | ------------------------------------ | --------------------------------------------- |
| **MVCC**             | Undo log (no heap bloat)             | Heap-based (needs VACUUM)                     |
| **Connections**      | Thread-per-connection                | Process-per-connection                        |
| **Updates**          | In-place (clustered index)           | DELETE + INSERT (HOT optimizes)               |
| **Replication**      | Binlog-based (mature)                | WAL-based streaming + logical                 |
| **JSON**             | JSON type + functions                | JSONB with GIN indexing (better)              |
| **Extensions**       | Limited plugin system                | Rich extension ecosystem                      |
| **Full-text search** | Basic (InnoDB FTS)                   | Advanced (tsvector, ranking)                  |
| **Geospatial**       | Basic                                | PostGIS (industry standard)                   |
| **Gap locks**        | Yes (complex deadlocks)              | No (uses SSI instead)                         |
| **Community**        | Oracle-controlled                    | Community-driven                              |
| **Cloud options**    | RDS MySQL, Aurora MySQL, PlanetScale | RDS Postgres, Aurora Postgres, Supabase, Neon |

---

## Common Interview Questions

1. **Explain InnoDB's clustered index.** Data is stored sorted by primary key in a B+tree. Secondary indexes store the PK value as a pointer. This means PK lookups are fast (one B+tree traversal) but secondary index lookups need two traversals.

2. **What is the difference between redo log and undo log?** Redo log ensures durability (replays committed changes after crash). Undo log enables MVCC (provides old row versions) and rollback.

3. **Why does MySQL not need VACUUM like PostgreSQL?** MySQL stores old row versions in the undo log (separate from data pages). PostgreSQL stores old versions in the heap table itself, causing bloat.

4. **What causes deadlocks in MySQL?** Gap locks in REPEATABLE READ are the most common cause. Two transactions locking overlapping gaps in different order.

5. **Explain `innodb_flush_log_at_trx_commit` settings.** 1 = flush on every commit (safe). 2 = write to OS cache, flush every second. 0 = write and flush every second. Value 1 is required for ACID compliance.

6. **How does MySQL replication work?** Source writes changes to binlog. Replica I/O thread fetches binlog events to relay log. Replica SQL thread replays relay log. Can be async, semi-sync, or group replication.

7. **When would you choose MySQL over PostgreSQL?** Simple read-heavy workloads, existing MySQL ecosystem, Aurora MySQL for cloud, simpler operational model (no VACUUM), better out-of-box replication.

8. **What is an invisible index?** MySQL 8.0 feature that makes an index invisible to the optimizer without dropping it. Useful for testing whether an index is needed before permanently removing it.
