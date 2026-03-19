# Distributed SQL (NewSQL) Deep Dive

NewSQL databases combine the scalability of NoSQL with the ACID guarantees and SQL interface of traditional relational databases. They solve the fundamental problem: how do you get strong consistency across geographically distributed nodes?

---

## Table of Contents

1. [Why Distributed SQL?](#why-distributed-sql)
2. [CAP and PACELC](#cap-and-pacelc)
3. [Consensus Protocols](#consensus-protocols)
4. [Google Spanner](#google-spanner)
5. [CockroachDB](#cockroachdb)
6. [TiDB](#tidb)
7. [YugabyteDB](#yugabytedb)
8. [Comparison Table](#comparison-table)
9. [When to Use Distributed SQL](#when-to-use-distributed-sql)
10. [Common Interview Questions](#common-interview-questions)

---

## Why Distributed SQL?

```
Traditional SQL (PostgreSQL/MySQL)
+------------------+
| Single Node      |  Scale up: bigger machine
| (or primary +    |  Replication: read replicas (eventual consistency for reads)
|  read replicas)  |  Sharding: manual, application-managed
+------------------+

Distributed SQL (Spanner/CockroachDB)
+--------+  +--------+  +--------+
| Node 1 |  | Node 2 |  | Node 3 |   Scale out: add nodes
| (R/W)  |  | (R/W)  |  | (R/W)  |   Automatic sharding and rebalancing
+--------+  +--------+  +--------+   Strong consistency everywhere
    |            |            |
    +--- Consensus (Raft/Paxos) ---+
```

**The core trade-off:** Distributed SQL adds latency (consensus requires network round-trips) in exchange for automatic horizontal scaling with strong consistency.

---

## CAP and PACELC

### CAP Theorem

In a network partition, you must choose between Consistency and Availability.

```
            Consistency
              /    \
            CP      CA (impossible with partitions)
           /          \
    Partition         Availability
    Tolerance           \
           \           AP
            +---------+
```

### PACELC (More Practical)

If there is a **P**artition, choose **A**vailability or **C**onsistency. **E**lse (no partition), choose **L**atency or **C**onsistency.

| Database    | Partition: A or C | Else: L or C               |
| ----------- | ----------------- | -------------------------- |
| PostgreSQL  | N/A (single node) | C                          |
| DynamoDB    | A                 | L (eventual) or C (strong) |
| Cassandra   | A                 | L                          |
| Spanner     | C                 | C (higher latency)         |
| CockroachDB | C                 | C (higher latency)         |

---

## Consensus Protocols

### Raft (Used by CockroachDB, TiDB, YugabyteDB)

```
Leader Election:
+--------+     +--------+     +--------+
| Node A |     | Node B |     | Node C |
| Leader | --> | Follower| --> | Follower|
+--------+     +--------+     +--------+
    |               |               |
    |-- Append ---> |               |
    |-- Append ----------------------> |
    |               |               |
    |<-- ACK -------|               |
    |<-- ACK -------------------------------|
    |               |               |
    | Committed (majority = 2 of 3) |
```

Key properties:

- Leader-based: one leader per Raft group, all writes go through leader
- Majority quorum: commit when majority (N/2 + 1) acknowledges
- Leader election: if leader fails, followers elect a new one (~seconds)
- Log replication: leader replicates entries to followers in order

### Paxos (Used by Google Spanner)

More general than Raft, allows multiple proposers. More complex to implement. Google's Spanner uses Multi-Paxos for leader-based replication within each shard.

---

## Google Spanner

The first globally distributed database with strong consistency + SQL.

### TrueTime

Spanner's secret weapon: GPS + atomic clocks in every data center provide globally synchronized time with bounded uncertainty.

```
TrueTime API:
  TT.now() returns [earliest, latest]    -- bounded uncertainty interval
  TT.after(t) returns true if t has definitely passed
  TT.before(t) returns true if t has definitely not passed

Typical uncertainty: ε ≈ 7ms (varies with clock synchronization)
```

**How Spanner uses TrueTime for consistency:**

1. Transaction T1 commits at timestamp t1
2. Spanner waits for TrueTime uncertainty to pass ("commit wait")
3. Any subsequent transaction T2 is guaranteed to have t2 > t1
4. This provides external consistency (linearizability) globally

### Architecture

```
+----------------------------------------------------------+
|                    Spanner Instance                        |
|  +----------------------------------------------------+   |
|  | Zone A           | Zone B           | Zone C        |  |
|  | +-------+        | +-------+        | +-------+     |  |
|  | | Node  |        | | Node  |        | | Node  |     |  |
|  | | (Paxos|        | | (Paxos|        | | (Paxos|     |  |
|  | | Leader)|       | | Follower)|     | | Follower)|  |  |
|  | +-------+        | +-------+        | +-------+     |  |
|  +----------------------------------------------------+   |
+----------------------------------------------------------+
```

| Feature          | Details                                          |
| ---------------- | ------------------------------------------------ |
| **Consistency**  | External consistency (strongest possible)        |
| **SQL**          | Full SQL with joins, indexes, interleaved tables |
| **Scale**        | Petabytes, millions of QPS                       |
| **Availability** | 99.999% SLA (regional: 99.99%)                   |
| **Replication**  | Multi-region, synchronous                        |
| **Pricing**      | Expensive ($0.90/node/hr minimum 3 nodes)        |

### Interleaved Tables

Spanner co-locates parent and child rows on the same split for locality:

```sql
CREATE TABLE Users (
  UserId INT64 NOT NULL,
  Name STRING(100)
) PRIMARY KEY (UserId);

CREATE TABLE Orders (
  UserId INT64 NOT NULL,
  OrderId INT64 NOT NULL,
  Total NUMERIC
) PRIMARY KEY (UserId, OrderId),
  INTERLEAVE IN PARENT Users ON DELETE CASCADE;

-- User and their orders are stored together physically
-- JOINs between Users and Orders are local (no network hop)
```

---

## CockroachDB

Open-source distributed SQL inspired by Spanner, but without TrueTime.

### How It Works Without TrueTime

CockroachDB uses **Hybrid Logical Clocks (HLC)** instead of TrueTime:

- Combines physical clock + logical counter
- Cannot bound uncertainty as tightly as TrueTime
- Uses "clock skew" parameter (default 500ms) for uncertainty window
- Transactions may need to retry if they hit clock skew issues

### Architecture

```
+------------------+     +------------------+     +------------------+
| Node 1           |     | Node 2           |     | Node 3           |
| +--------+       |     | +--------+       |     | +--------+       |
| | SQL    |       |     | | SQL    |       |     | | SQL    |       |
| | Layer  |       |     | | Layer  |       |     | | Layer  |       |
| +--------+       |     | +--------+       |     | +--------+       |
| | Txn    |       |     | | Txn    |       |     | | Txn    |       |
| | Layer  |       |     | | Layer  |       |     | | Layer  |       |
| +--------+       |     | +--------+       |     | +--------+       |
| | Raft   |       |     | | Raft   |       |     | | Raft   |       |
| | Layer  |       |     | | Layer  |       |     | | Layer  |       |
| +--------+       |     | +--------+       |     | +--------+       |
| | Storage|       |     | | Storage|       |     | | Storage|       |
| | (Pebble)|      |     | | (Pebble)|      |     | | (Pebble)|      |
| +--------+       |     | +--------+       |     | +--------+       |
+------------------+     +------------------+     +------------------+
```

| Feature              | Details                                            |
| -------------------- | -------------------------------------------------- |
| **Compatibility**    | PostgreSQL wire protocol (use pg drivers)          |
| **Consistency**      | Serializable isolation (strongest)                 |
| **Sharding**         | Automatic range-based sharding                     |
| **Rebalancing**      | Automatic when nodes added/removed                 |
| **Geo-partitioning** | Pin data to specific regions (compliance)          |
| **License**          | BSL (source-available, not open-source since 2024) |

---

## TiDB

Distributed SQL database compatible with MySQL protocol. Popular in Asia (PingCAP, Chinese origin).

```
+------------------+     +------------------+
| TiDB Server      |     | TiDB Server      |  <-- Stateless SQL layer (MySQL compatible)
+------------------+     +------------------+
         |                         |
         v                         v
+------------------+     +------------------+     +------------------+
| TiKV Store       |     | TiKV Store       |     | TiKV Store       |
| (Raft groups)    |     | (Raft groups)    |     | (Raft groups)    |
+------------------+     +------------------+     +------------------+
                              |
                              v
                    +------------------+
                    | PD (Placement    |  <-- Cluster metadata, timestamp oracle
                    | Driver)          |
                    +------------------+

Optional:
+------------------+
| TiFlash          |  <-- Columnar replica for OLAP queries
+------------------+
```

| Feature           | Details                                                   |
| ----------------- | --------------------------------------------------------- |
| **Compatibility** | MySQL 5.7/8.0 wire protocol                               |
| **HTAP**          | TiKV (row) + TiFlash (columnar) for mixed workloads       |
| **Consistency**   | Snapshot isolation (default), can enable pessimistic txns |
| **Scaling**       | Separate compute (TiDB) and storage (TiKV) scaling        |

---

## YugabyteDB

Open-source distributed SQL with both PostgreSQL and Cassandra-compatible APIs.

| Feature              | Details                        |
| -------------------- | ------------------------------ |
| **SQL API**          | YSQL (PostgreSQL compatible)   |
| **NoSQL API**        | YCQL (Cassandra compatible)    |
| **Consensus**        | Raft per tablet                |
| **Storage**          | DocDB (modified RocksDB)       |
| **Consistency**      | Strong by default              |
| **Geo-distribution** | Multi-region, geo-partitioning |

---

## Comparison Table

| Feature         | Spanner                   | CockroachDB                | TiDB                  | YugabyteDB             |
| --------------- | ------------------------- | -------------------------- | --------------------- | ---------------------- |
| **SQL Compat**  | Google SQL                | PostgreSQL                 | MySQL                 | PostgreSQL + Cassandra |
| **Consensus**   | Multi-Paxos               | Raft                       | Raft                  | Raft                   |
| **Clock**       | TrueTime (GPS+atomic)     | HLC                        | TSO (centralized)     | HLC                    |
| **Consistency** | External                  | Serializable               | Snapshot              | Strong                 |
| **HTAP**        | No                        | No                         | Yes (TiFlash)         | No                     |
| **Managed**     | GCP only                  | CockroachDB Cloud          | TiDB Cloud            | YugabyteDB Managed     |
| **Self-hosted** | No                        | Yes                        | Yes                   | Yes                    |
| **Pricing**     | Expensive                 | Moderate                   | Free (self-hosted)    | Free (self-hosted)     |
| **Best for**    | Google shops, global apps | PG migration, multi-region | MySQL migration, HTAP | PG + Cassandra users   |

---

## When to Use Distributed SQL

### Use When

- You need strong consistency across multiple regions
- Your dataset exceeds single-node capacity (> 10 TB)
- You need automatic failover without data loss
- Compliance requires data to stay in specific regions (geo-partitioning)
- You need horizontal write scaling

### Don't Use When

- Single-region deployment (use PostgreSQL/MySQL -- simpler, faster)
- Dataset fits on one machine (< 1 TB)
- You need sub-millisecond latency (consensus adds latency)
- You need complex PostgreSQL extensions (PostGIS, pgvector)
- Cost is a concern (distributed = more nodes = more cost)

---

## Common Interview Questions

1. **How does Spanner achieve global strong consistency?** TrueTime provides globally bounded clock uncertainty. After commit, Spanner waits for the uncertainty interval to pass (commit-wait), guaranteeing that any subsequent transaction sees the commit.

2. **What is the Raft consensus protocol?** A leader-based consensus protocol. Leader replicates log entries to followers. An entry is committed when a majority acknowledges it. If the leader fails, followers elect a new leader.

3. **How does CockroachDB work without TrueTime?** It uses Hybrid Logical Clocks (HLC) with a configurable clock skew tolerance (default 500ms). Transactions may need to retry if they encounter clock uncertainty. Less precise than TrueTime but works on commodity hardware.

4. **Compare distributed SQL vs sharded PostgreSQL.** Distributed SQL: automatic sharding, rebalancing, distributed transactions, global consistency. Sharded Postgres: manual shard management, cross-shard transactions are complex, but simpler per-node and more feature-rich.

5. **What is the performance overhead of distributed SQL?** Consensus adds 1-2 network round-trips per write. Cross-region writes add latency proportional to distance (~50ms US coast-to-coast). Reads from the leader are fast; follower reads can serve stale data to reduce latency.

6. **What is TiDB's HTAP advantage?** TiDB replicates row data from TiKV to columnar format in TiFlash. OLTP queries hit TiKV, OLAP queries hit TiFlash, without maintaining a separate analytics database.

7. **How would you migrate from PostgreSQL to CockroachDB?** CockroachDB supports the PostgreSQL wire protocol. Steps: test application against CockroachDB, handle unsupported features (some PG extensions), use IMPORT or CDC for data migration, cut over.
