# Database Systems Overview for Backend Engineers

Databases are the backbone of every backend system. As a backend engineer, you need to understand not just SQL syntax, but storage engines, replication, sharding, and when to pick which database. This guide covers the databases you will encounter in production and in interviews.

---

## Database Landscape

### Relational (SQL)

| Database          | One-Liner                                             |
| ----------------- | ----------------------------------------------------- |
| **PostgreSQL**    | The "Swiss Army knife" -- extensible, ACID, JSON, GIS |
| **MySQL**         | Most deployed RDBMS -- simple, fast, battle-tested    |
| **Cloud SQL**     | Managed Postgres/MySQL on GCP                         |
| **Aurora**        | AWS-managed MySQL/Postgres with storage auto-scaling  |
| **Cloud Spanner** | Google's globally-distributed strongly-consistent SQL |

### NoSQL -- Document

| Database      | One-Liner                                              |
| ------------- | ------------------------------------------------------ |
| **MongoDB**   | Flexible schema, horizontal scaling, aggregation       |
| **Firestore** | Serverless document DB with real-time sync             |
| **DynamoDB**  | AWS serverless key-value/document with single-digit ms |

### NoSQL -- Key-Value / Wide-Column

| Database      | One-Liner                                      |
| ------------- | ---------------------------------------------- |
| **Redis**     | In-memory data structure store (cache + more)  |
| **Cassandra** | Wide-column, AP, linear write scalability      |
| **Bigtable**  | Google's wide-column for analytics/time-series |

### Specialized

| Database          | One-Liner                                     |
| ----------------- | --------------------------------------------- |
| **Elasticsearch** | Full-text search and log analytics            |
| **ClickHouse**    | Columnar OLAP, blazing-fast aggregations      |
| **TimescaleDB**   | Time-series on top of PostgreSQL              |
| **Neo4j**         | Graph database for relationship-heavy queries |

---

## Decision Framework

```
                    Need ACID transactions?
                    /                     \
                  Yes                      No
                  /                         \
          Need global distribution?    Need flexible schema?
          /              \              /              \
        Yes              No           Yes              No
        |                |             |                |
    Spanner/         PostgreSQL     MongoDB        Need low-latency
    CockroachDB      MySQL                        key-value?
                                                   /        \
                                                 Yes         No
                                                  |           |
                                               Redis/      Elasticsearch
                                               DynamoDB    ClickHouse
                                                           (analytics)
```

---

## CAP Theorem in Practice

| Database       | Category | Consistency        | Availability         | Partition Tolerance |
| -------------- | -------- | ------------------ | -------------------- | ------------------- |
| PostgreSQL     | CP       | Strong             | Single-node risk     | N/A (single node)   |
| MySQL (InnoDB) | CP       | Strong             | Single-node risk     | N/A (single node)   |
| MongoDB        | CP       | Strong (default)   | Reduced on partition | Yes                 |
| DynamoDB       | AP/CP    | Eventual or strong | High                 | Yes                 |
| Cassandra      | AP       | Tunable            | High                 | Yes                 |
| Spanner        | CP       | Strong (global)    | 99.999% SLA          | Yes                 |
| Redis          | AP       | Eventual (cluster) | High                 | Yes                 |

**Reality check:** CAP is a theorem about network partitions. In practice, you are choosing between consistency and latency (PACELC theorem) far more often than between consistency and availability.

---

## Table of Contents

| #   | File                                                 | Topic             | Key Concepts                                                    |
| --- | ---------------------------------------------------- | ----------------- | --------------------------------------------------------------- |
| 1   | [01-SQL-FUNDAMENTALS.md](01-SQL-FUNDAMENTALS.md)     | SQL Deep Dive     | Joins, window functions, CTEs, indexing, EXPLAIN, normalization |
| 2   | [02-POSTGRESQL.md](02-POSTGRESQL.md)                 | PostgreSQL        | MVCC, WAL, vacuum, partitioning, JSONB, replication             |
| 3   | [03-MYSQL.md](03-MYSQL.md)                           | MySQL             | InnoDB, buffer pool, binlog, GTID replication, MySQL 8 features |
| 4   | [04-NOSQL-MONGODB.md](04-NOSQL-MONGODB.md)           | MongoDB           | Document model, sharding, replica sets, aggregation pipeline    |
| 5   | [05-NOSQL-DYNAMODB.md](05-NOSQL-DYNAMODB.md)         | DynamoDB          | Partition keys, GSI/LSI, single-table design, DAX, streams      |
| 6   | [06-NEWSQL-DISTRIBUTED.md](06-NEWSQL-DISTRIBUTED.md) | Distributed SQL   | CockroachDB, Spanner, Raft, distributed transactions, TrueTime  |
| 7   | [07-TIME-SERIES-SEARCH.md](07-TIME-SERIES-SEARCH.md) | Specialized DBs   | Elasticsearch, ClickHouse, TimescaleDB, Neo4j                   |
| 8   | [08-DATABASE-PATTERNS.md](08-DATABASE-PATTERNS.md)   | Database Patterns | Connection pooling, sharding, CQRS, CDC, migrations             |

---

## Common Cross-Cutting Interview Questions

1. **When would you choose PostgreSQL over MySQL?** (extensibility, JSONB, advanced types, PostGIS)
2. **When would you choose a NoSQL database over SQL?** (flexible schema, horizontal scale, specific access patterns)
3. **Explain the CAP theorem with a real example.** (network partition between replicas, choose consistency or availability)
4. **How do you handle database migrations in production?** (blue-green, expand-contract, backward-compatible changes)
5. **What is the N+1 query problem and how do you fix it?** (eager loading, JOINs, DataLoader pattern)
