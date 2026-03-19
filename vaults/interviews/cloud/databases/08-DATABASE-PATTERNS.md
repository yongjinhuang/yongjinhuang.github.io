# Database Patterns for Backend Engineers

This guide covers the architectural patterns that come up in system design interviews and production work: how to scale databases, keep them consistent, and evolve schemas safely.

---

## Table of Contents

1. [Connection Pooling](#connection-pooling)
2. [Read Replicas](#read-replicas)
3. [Sharding](#sharding)
4. [CQRS](#cqrs)
5. [Event Sourcing](#event-sourcing)
6. [Change Data Capture (CDC)](#change-data-capture)
7. [Database Migrations](#database-migrations)
8. [Common Interview Questions](#common-interview-questions)

---

## Connection Pooling

### The Problem

Opening a database connection is expensive (TCP handshake, TLS, authentication, memory allocation). Without pooling, every request creates and destroys a connection.

```
Without Pooling:
  Request 1 --> Open Connection --> Query --> Close Connection
  Request 2 --> Open Connection --> Query --> Close Connection
  Request 3 --> Open Connection --> Query --> Close Connection

With Pooling:
  Pool: [Conn1, Conn2, Conn3]
  Request 1 --> Borrow Conn1 --> Query --> Return Conn1
  Request 2 --> Borrow Conn2 --> Query --> Return Conn2
  Request 3 --> Borrow Conn1 --> Query --> Return Conn1  (reused!)
```

### Pool Sizing

**Formula (from HikariCP):**
```
connections = (core_count * 2) + effective_spindle_count

For SSD: spindle_count ≈ 0
Typical: 4 cores = (4 * 2) + 0 = 8 connections
```

**Key insight:** More connections ≠ better performance. Beyond the optimal point, context switching and lock contention degrade throughput. A pool of 10-20 connections often outperforms 100.

### Pooling Solutions

| Tool | Language | Notes |
| ---- | -------- | ----- |
| **PgBouncer** | Any (external) | Lightweight, production standard for PostgreSQL |
| **pgpool-II** | Any (external) | Pooling + load balancing + replication |
| **HikariCP** | Java | Fastest JVM pool |
| **node-postgres pool** | Node.js | Built-in pooling |
| **ProxySQL** | Any (external) | MySQL connection pooler + query routing |

---

## Read Replicas

### Architecture

```
+------------------+     Replication     +------------------+
| Primary          | ------------------> | Read Replica 1   |
| (reads + writes) |                     | (reads only)     |
+------------------+                     +------------------+
        |                                         ^
        |            Replication          +------------------+
        +------------------------------> | Read Replica 2   |
                                         | (reads only)     |
                                         +------------------+

Application Routes:
  Writes -> Primary
  Reads  -> Replicas (load balanced)
```

### Replication Lag

The time between a write on the primary and the same data appearing on the replica.

```
Timeline:
  t=0ms   User writes to primary
  t=1ms   Write committed on primary
  t=50ms  WAL record sent to replica
  t=55ms  Replica applies the write

  Replication lag = 55ms - 1ms = 54ms
```

### Read-After-Write Consistency

```
Problem:
  1. User updates profile (goes to primary)
  2. User refreshes page (reads from replica)
  3. Old data appears (replica hasn't caught up yet)

Solutions:
  1. Read from primary for recently-written data
  2. Track write timestamp, read from primary if within lag window
  3. Use session-sticky routing (same user -> same replica)
  4. Use synchronous replication (higher latency but consistent)
```

---

## Sharding

### Strategies

```
Horizontal Sharding (by rows):
  Shard 1: users A-M
  Shard 2: users N-Z

Vertical Sharding (by columns/tables):
  Shard 1: users table, auth table
  Shard 2: orders table, payments table

Directory-Based Sharding:
  Lookup table maps key -> shard
  Flexible but adds a hop
```

### Shard Key Selection

| Strategy | How | Pros | Cons |
| -------- | --- | ---- | ---- |
| **Hash-based** | `shard = hash(key) % N` | Even distribution | Cross-shard queries hard, resharding painful |
| **Range-based** | `shard = range(key)` | Range queries efficient | Hotspots on popular ranges |
| **Directory-based** | Lookup table | Flexible | Single point of failure, extra hop |
| **Geo-based** | By region | Data locality, compliance | Uneven load per region |

### Cross-Shard Queries

The hardest part of sharding. A query that touches multiple shards requires scatter-gather:

```
SELECT * FROM orders WHERE total > 100 ORDER BY created_at LIMIT 10;

Without sharding: single query
With sharding:
  1. Send query to all N shards
  2. Each shard returns its top 10
  3. Coordinator merges N × 10 results
  4. Return global top 10

This is why you should design your shard key to match your primary access patterns.
```

### Resharding

Adding or removing shards is operationally complex:

```
Before: 4 shards (hash % 4)
After:  8 shards (hash % 8)

Consistent hashing minimizes data movement:
  - Only ~1/N of keys need to move when adding a shard
  - Use virtual nodes for better distribution
```

---

## CQRS

Command Query Responsibility Segregation: separate the read model from the write model.

```
+-------------------+     Command      +-------------------+
| API / Application | --------------> | Write Model       |
|                   |                  | (normalized,      |
|                   |                  |  optimized for    |
|                   |                  |  writes)          |
|                   |                  +-------------------+
|                   |                          |
|                   |                    Events/CDC
|                   |                          |
|                   |                          v
|                   |     Query        +-------------------+
|                   | <-------------- | Read Model        |
+-------------------+                  | (denormalized,    |
                                       |  optimized for    |
                                       |  reads)           |
                                       +-------------------+
```

### When to Use CQRS

- Read and write patterns are very different
- Read model needs different schema/DB (e.g., Elasticsearch for search, Redis for leaderboards)
- Massive read-to-write ratio (100:1+)
- Complex domain logic on writes, simple reads

### When NOT to Use CQRS

- Simple CRUD applications
- Read and write models are similar
- Strong consistency is required (CQRS introduces eventual consistency)
- Small team (operational complexity not worth it)

---

## Event Sourcing

Instead of storing current state, store a sequence of events that led to the current state.

```
Traditional (state-based):
  Account { id: 1, balance: 150 }

Event Sourcing:
  Event 1: AccountCreated { id: 1, balance: 0 }
  Event 2: MoneyDeposited { id: 1, amount: 200 }
  Event 3: MoneyWithdrawn { id: 1, amount: 50 }

  Current state = replay all events = 0 + 200 - 50 = 150
```

### Benefits

- Complete audit trail (every change is recorded)
- Can rebuild state at any point in time (temporal queries)
- Natural fit for event-driven architectures
- Easy to add new read models (replay events into new projection)

### Challenges

- Event schema evolution (events are immutable)
- Replay performance (millions of events = slow rebuild)
- Snapshots needed for performance (save state periodically)
- Eventually consistent read models
- Complexity for simple CRUD

### Snapshot Pattern

```
Events: E1, E2, ..., E1000, [SNAPSHOT at E1000], E1001, E1002, ...

To rebuild state:
  1. Load most recent snapshot (state at E1000)
  2. Replay only E1001, E1002, ... (not all 1000+ events)
```

---

## Change Data Capture (CDC)

Capture row-level changes from a database and stream them to other systems.

```
+------------------+     CDC           +------------------+
| PostgreSQL       | ----------------> | Kafka            |
| (source of truth)|   (Debezium)      | (event stream)   |
+------------------+                   +------------------+
                                              |
                        +---------------------+---------------------+
                        |                     |                     |
                        v                     v                     v
                +------------------+  +------------------+  +------------------+
                | Elasticsearch    |  | Redis Cache      |  | Analytics DW     |
                | (search index)   |  | (invalidation)   |  | (reporting)      |
                +------------------+  +------------------+  +------------------+
```

### How CDC Works

| Method | How | Pros | Cons |
| ------ | --- | ---- | ---- |
| **Log-based** (WAL/binlog) | Read database's replication log | No overhead on source DB, captures all changes | DB-specific, complex setup |
| **Trigger-based** | Database triggers write to change table | Works with any DB | Performance overhead, trigger complexity |
| **Polling** | Periodically query for changes | Simple | Misses deletes, high latency, load on source |
| **Timestamp-based** | Query WHERE updated_at > last_check | Simple | Misses deletes, clock skew issues |

### Debezium

The most popular CDC tool. Reads PostgreSQL WAL or MySQL binlog and streams changes to Kafka.

```json
// Debezium change event
{
  "op": "u",          // c=create, u=update, d=delete
  "before": { "id": 1, "name": "Alice", "email": "old@co.com" },
  "after":  { "id": 1, "name": "Alice", "email": "new@co.com" },
  "source": {
    "connector": "postgresql",
    "db": "mydb",
    "table": "users",
    "lsn": 12345678
  },
  "ts_ms": 1705312200000
}
```

### Transactional Outbox Pattern

Solves: "How do I atomically update the database AND publish an event?"

```
Problem:
  1. Update database (succeeds)
  2. Publish to Kafka (fails)
  Result: inconsistency

Solution (Outbox):
  1. In the SAME transaction:
     - Update the users table
     - INSERT into outbox table: { event_type: "UserUpdated", payload: {...} }
  2. CDC (Debezium) reads outbox table changes
  3. Publishes to Kafka
  4. Marks outbox row as published

Both steps happen in one DB transaction = atomic guarantee
```

---

## Database Migrations

### The Expand-Contract Pattern

Safely change schemas in production without downtime:

```
Phase 1: EXPAND
  - Add new column (nullable or with default)
  - Deploy code that writes to BOTH old and new columns
  - Backfill new column

Phase 2: MIGRATE
  - Deploy code that reads from new column
  - Verify data consistency

Phase 3: CONTRACT
  - Remove old column
  - Remove dual-write code

Example: Renaming a column
  1. ADD new_name column (nullable)
  2. Deploy: write to both old_name and new_name
  3. Backfill: UPDATE SET new_name = old_name WHERE new_name IS NULL
  4. Deploy: read from new_name
  5. DROP old_name column
```

### Migration Best Practices

| Do | Don't |
| -- | ----- |
| Use expand-contract for breaking changes | Drop columns in one step |
| Add columns as nullable or with defaults | Add NOT NULL column without default |
| Create indexes concurrently | Lock table with regular CREATE INDEX |
| Run migrations in transactions (if supported) | Mix DDL and DML in one migration |
| Test migrations on production-size data | Assume dev data reflects production |
| Have a rollback plan | Deploy without rollback path |

### Tools

| Tool | Language | Notes |
| ---- | -------- | ----- |
| **Flyway** | Java | Version-based, SQL or Java migrations |
| **Liquibase** | Java | XML/YAML/JSON/SQL changeset format |
| **Alembic** | Python | SQLAlchemy-based |
| **golang-migrate** | Go | SQL-based, multiple DB support |
| **Prisma Migrate** | Node.js | Schema-first, generates SQL |
| **pg_dump / pg_restore** | Any | PostgreSQL native backup/restore |

---

## Common Interview Questions

1. **How do you handle database connection pooling?** Use an external pooler (PgBouncer for PostgreSQL, ProxySQL for MySQL) or application-level pool (HikariCP for Java). Pool size should be small (formula: cores * 2). Transaction-mode pooling is most efficient.

2. **How do you scale a database that is hitting its limits?** First: optimize queries, add indexes, connection pooling. Then: add read replicas for read scaling. Then: vertical scaling (bigger machine). Finally: horizontal sharding for write scaling. Each step adds complexity.

3. **Explain the transactional outbox pattern.** Write the event to an outbox table in the same database transaction as the business change. A CDC tool (Debezium) reads the outbox and publishes to Kafka. This guarantees atomicity between DB write and event publication.

4. **How do you do zero-downtime database migrations?** Use expand-contract pattern. Never remove columns directly. Add new column (nullable), dual-write, backfill, switch reads, then remove old column. Create indexes concurrently.

5. **What is CQRS and when would you use it?** Separate read and write models. Use when read/write patterns differ significantly, when you need different databases for different access patterns, or when read-to-write ratio is very high.

6. **How does CDC work?** Log-based CDC reads the database's replication log (WAL/binlog) and streams changes to a message broker. No impact on source database performance. Debezium is the most popular tool.

7. **What is the hot partition problem in sharding?** When one shard key value receives disproportionate traffic (celebrity user, popular product). Solutions: add random suffix (write sharding), use composite shard key, or use consistent hashing with virtual nodes.

8. **Explain event sourcing vs traditional CRUD.** CRUD stores current state (UPDATE overwrites). Event sourcing stores the sequence of events that produced the state. Benefits: complete audit trail, temporal queries, replay into new projections. Cost: complexity, eventual consistency, schema evolution.
