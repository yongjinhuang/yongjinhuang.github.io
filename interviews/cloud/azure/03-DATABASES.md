# Azure Database Services

Azure's database crown jewel is Cosmos DB -- a globally distributed, multi-model database with five tunable consistency levels. Understanding Cosmos DB's consistency model is one of the most frequently asked interview topics.

---

## Table of Contents

1. [Azure SQL](#azure-sql)
2. [Cosmos DB](#cosmos-db)
3. [Cosmos DB Consistency Levels](#consistency-levels)
4. [Azure Cache for Redis](#azure-cache-for-redis)
5. [Comparison](#comparison)
6. [Common Interview Questions](#common-interview-questions)

---

## Azure SQL

Managed SQL Server database.

| Feature | Details | AWS Equivalent |
| ------- | ------- | -------------- |
| **Engine** | SQL Server (Microsoft) | RDS SQL Server |
| **Deployment** | Single database, elastic pool, managed instance | RDS, Aurora |
| **Serverless** | Auto-pause, auto-scale compute | Aurora Serverless |
| **Max size** | 100 TB (Hyperscale) | 64 TB (RDS) |
| **Read replicas** | Up to 4 | Up to 15 |
| **Geo-replication** | Active geo-replication (async) | Cross-region read replicas |

### Purchasing Models

| Model | How | Best For |
| ----- | --- | -------- |
| **DTU** | Bundled compute/storage/IO units | Simple, predictable workloads |
| **vCore** | Choose vCPUs and memory independently | Flexible, hybrid benefit |
| **Serverless** | Auto-scale compute, auto-pause | Variable/intermittent workloads |
| **Hyperscale** | Distributed architecture, up to 100 TB | Large databases, fast scaling |

---

## Cosmos DB

Multi-model globally distributed database with tunable consistency.

### Architecture

```
+--Cosmos DB Account--+
| +--Database--------+|
| | +--Container----+||
| | | Partitions:   |||
| | | +---+ +---+   |||
| | | |P1 | |P2 |   |||  <-- Data partitioned by partition key
| | | +---+ +---+   |||
| | +---------------+||
| +-------------------+|
+----------------------+

Global Distribution:
  Write Region (US East) -> replicate to -> Read Region (EU West)
                                          -> Read Region (Asia East)
  Multi-write: All regions accept writes (conflict resolution)
```

### Key Features

| Feature | Details |
| ------- | ------- |
| **APIs** | NoSQL (document), MongoDB, Cassandra, Gremlin (graph), Table |
| **Distribution** | Multi-region, multi-write |
| **Consistency** | 5 tunable levels (Strong to Eventual) |
| **SLA** | 99.999% availability (multi-region) |
| **Partitioning** | Automatic, based on partition key |
| **Pricing** | Request Units (RU/s) + storage |
| **Throughput** | Provisioned RU/s or serverless (auto-scale) |
| **Max item** | 2 MB |
| **Change feed** | Real-time change stream |
| **TTL** | Per-item or per-container |

### Request Units (RU)

```
1 RU = cost of a point read of a 1 KB item by ID

Examples:
  Point read (1 KB):     1 RU
  Point read (10 KB):    ~3 RUs
  Insert (1 KB):         ~5 RUs
  Query (returns 5 items): ~10-50 RUs (depends on complexity)
  Cross-partition query:   Higher RUs (avoid in hot path)

Provisioned: Set RU/s (e.g., 400 RU/s = $23/month)
Autoscale: Set max RU/s, scales down to 10% when idle
Serverless: Pay per RU consumed (good for dev/test)
```

### Partition Key Selection

```
Good partition keys:
  /userId       -- even distribution, queries usually filter by user
  /tenantId     -- multi-tenant isolation
  /deviceId     -- IoT data per device

Bad partition keys:
  /status       -- few distinct values (hot partition)
  /country      -- skewed distribution (US partition overloaded)
  /timestamp    -- monotonically increasing (all writes to one partition)

Rule: Choose a key with high cardinality that matches your primary query pattern.
```

---

## Consistency Levels

Cosmos DB's unique feature: five tunable consistency levels between strong and eventual.

```
Stronger ←————————————————————————————→ Weaker
Strong | Bounded | Session | Consistent | Eventual
       | Staleness|        | Prefix     |

Latency:  Higher ←————————————————————→ Lower
Cost:     Higher ←————————————————————→ Lower
```

### The Five Levels

| Level | Guarantee | Analogy |
| ----- | --------- | ------- |
| **Strong** | Linearizable reads (always latest write) | Single-node SQL |
| **Bounded Staleness** | Reads lag by at most K versions or T seconds | "Almost strong, with a window" |
| **Session** | Within a session: read-your-writes, monotonic reads | Default. Most apps need this |
| **Consistent Prefix** | Reads see writes in order (no gaps) but may be stale | "In order, but delayed" |
| **Eventual** | No ordering guarantee; reads may be stale | Redis replication |

### When to Use Each

| Level | Use Case | RU Cost |
| ----- | -------- | ------- |
| **Strong** | Financial transactions, inventory counts | 2x reads |
| **Bounded Staleness** | Leaderboards (near real-time, ordered) | 2x reads |
| **Session** | User profiles, shopping carts (default) | 1x reads |
| **Consistent Prefix** | Social feeds, status updates | 1x reads |
| **Eventual** | View counters, analytics, non-critical data | 1x reads |

### Multi-Region with Strong Consistency

```
Strong consistency + multi-region:
  - Write to primary region
  - Wait for ALL replicas to acknowledge
  - Increases latency (cross-region round-trip)
  - RU cost doubles for reads

Session consistency (recommended default):
  - Write to primary region
  - Async replicate to other regions
  - Within same session: read-your-writes guaranteed
  - Other sessions: may see slightly stale data
```

---

## Azure Cache for Redis

Managed Redis service.

| Feature | Details | ElastiCache Equivalent |
| ------- | ------- | ---------------------- |
| **Tiers** | Basic, Standard, Premium, Enterprise, Enterprise Flash | Node types |
| **Clustering** | Supported (Premium, Enterprise) | Redis Cluster |
| **Geo-replication** | Active-active (Enterprise), passive (Premium) | Global Datastore |
| **Persistence** | RDB + AOF (Premium+) | RDB + AOF |
| **TLS** | Always on | Optional |
| **VNet** | Premium+ | Yes |

### Enterprise Tier (Redis Enterprise)

```
Features beyond open-source Redis:
  - Active-active geo-replication (write anywhere)
  - RediSearch (full-text search)
  - RedisJSON (native JSON support)
  - RedisTimeSeries (time-series data)
  - RedisBloom (probabilistic data structures)
  - Flash tier (SSDs extend memory, lower cost for large datasets)
```

---

## Comparison

| Feature | Azure SQL | Cosmos DB | Azure Cache for Redis |
| ------- | --------- | --------- | --------------------- |
| **Type** | Relational (SQL Server) | Multi-model (document, graph, etc.) | In-memory cache |
| **Consistency** | Strong (ACID) | 5 tunable levels | Eventual (replication) |
| **Scale** | Vertical + read replicas | Horizontal (partition key) | Vertical + clustering |
| **Global** | Active geo-replication | Multi-region, multi-write | Active-active (Enterprise) |
| **Pricing** | DTU, vCore, or serverless | RU/s + storage | Tier-based |
| **Best for** | SQL Server workloads, relational data | Global apps, flexible schema | Caching, sessions, real-time |

---

## Common Interview Questions

1. **Explain Cosmos DB's five consistency levels.** Strong: always latest. Bounded Staleness: lag by K versions or T seconds. Session: read-your-writes within session (default). Consistent Prefix: in-order but may be stale. Eventual: no guarantees.

2. **When would you use Session vs Strong consistency?** Session for most apps (shopping cart, user profile -- user sees their own writes, others may be slightly stale). Strong for financial transactions or inventory where stale reads are unacceptable (costs 2x RUs).

3. **What are Request Units (RUs)?** Cosmos DB's throughput currency. 1 RU = one point read of a 1 KB item. Writes cost ~5x more than reads. Cross-partition queries cost more. You provision RU/s per container or use serverless.

4. **How do you choose a Cosmos DB partition key?** High cardinality (many distinct values), matches primary query pattern, even distribution. Bad: status fields (few values), timestamps (all writes to one partition). Good: userId, tenantId, deviceId.

5. **Cosmos DB vs DynamoDB?** Cosmos DB: 5 consistency levels, multi-model (document, graph, Cassandra), multi-write across regions. DynamoDB: simpler (strong or eventual), single model (key-value/document), single-write region (Global Tables for multi-region). Cosmos DB is more flexible; DynamoDB is simpler.

6. **What is Cosmos DB's change feed?** An ordered log of changes to a container, similar to DynamoDB Streams or Kafka topics. Use for: event-driven processing, maintaining materialized views, real-time analytics, and triggering Azure Functions.
