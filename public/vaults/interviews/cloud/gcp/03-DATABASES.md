# GCP Database Services

GCP's database portfolio includes Cloud SQL for managed PostgreSQL/MySQL, Spanner for globally distributed SQL, Firestore for serverless documents, and Bigtable for wide-column analytics. Spanner is GCP's crown jewel -- the only production-grade globally consistent SQL database.

---

## Table of Contents

1. [Cloud SQL](#cloud-sql)
2. [Cloud Spanner](#cloud-spanner)
3. [Firestore](#firestore)
4. [Cloud Bigtable](#cloud-bigtable)
5. [AlloyDB](#alloydb)
6. [Comparison](#comparison)
7. [Common Interview Questions](#common-interview-questions)

---

## Cloud SQL

Managed PostgreSQL, MySQL, and SQL Server.

| Feature | Details | AWS Equivalent |
| ------- | ------- | -------------- |
| **Engines** | PostgreSQL, MySQL, SQL Server | RDS |
| **Max storage** | 64 TB | 64 TB (RDS) |
| **Read replicas** | Up to 10 (cross-region supported) | Up to 15 |
| **HA** | Regional (automatic failover, 2 zones) | Multi-AZ |
| **Backups** | Automated daily + on-demand + PITR | Same |
| **Connectivity** | Private IP (VPC), Cloud SQL Auth Proxy | VPC, RDS Proxy |
| **IAM auth** | IAM database authentication | IAM DB auth |

### Cloud SQL Auth Proxy

```
App -> Cloud SQL Auth Proxy (sidecar) -> Cloud SQL instance
  - Handles SSL/TLS automatically
  - IAM-based authentication
  - No need to manage SSL certificates
  - Works from GKE, Cloud Run, Compute Engine
```

---

## Cloud Spanner

Globally distributed, strongly consistent SQL database. The only database that provides external consistency (linearizability) at global scale.

### TrueTime

```
GPS receivers + atomic clocks in every GCP data center
  -> Bounded clock uncertainty (~7ms)
  -> Spanner waits for uncertainty to pass before confirming commit
  -> Guarantees: if T1 commits before T2 starts, T2 sees T1's writes

No other cloud provider has this capability.
```

### Architecture

```
+--Spanner Instance--+
| Node 1  Node 2  Node 3  (compute, can scale independently)
+-----+-----+-----+------+
      |     |     |
+-----v-----v-----v------+
| Colossus (distributed  |  (Google's distributed filesystem)
| storage)               |
+-------------------------+

Splits (partitions):
  Data split by primary key range
  Each split replicated across zones/regions via Paxos
  Splits auto-merge/split based on size and load
```

### Key Features

| Feature | Details |
| ------- | ------- |
| **Consistency** | External consistency (strongest possible) |
| **SQL** | Full ANSI SQL with JOINs, indexes, secondary indexes |
| **Availability** | 99.999% SLA (regional + multi-region) |
| **Scale** | Linear scale by adding nodes (no resharding) |
| **Interleaved tables** | Co-locate parent-child rows for locality |
| **Change streams** | Real-time change data capture |
| **Pricing** | $0.90/node/hour (min 1 node), $0.30/GB/month storage |

### Interleaved Tables

```sql
CREATE TABLE Users (
  UserId INT64 NOT NULL,
  Name STRING(100),
) PRIMARY KEY (UserId);

CREATE TABLE Orders (
  UserId INT64 NOT NULL,
  OrderId INT64 NOT NULL,
  Total NUMERIC,
) PRIMARY KEY (UserId, OrderId),
  INTERLEAVE IN PARENT Users ON DELETE CASCADE;

-- Orders for a user are physically co-located with the user row
-- JOIN between Users and Orders is local (no network hop)
```

### When to Use Spanner

| Use Spanner | Don't Use Spanner |
| ----------- | ----------------- |
| Global strong consistency required | Small single-region app (use Cloud SQL) |
| Data > single machine (10+ TB) | Cost-sensitive projects ($0.90/node/hr) |
| Financial transactions across regions | Need full PostgreSQL compatibility |
| 99.999% availability required | Simple CRUD with low traffic |

---

## Firestore

Serverless, scalable document database with real-time sync.

| Feature | Details | AWS Equivalent |
| ------- | ------- | -------------- |
| **Data model** | Document-collection hierarchy | DynamoDB (loosely) |
| **Consistency** | Strong (single region), eventual (multi-region reads) | DynamoDB (configurable) |
| **Real-time** | Built-in real-time listeners (onSnapshot) | DynamoDB Streams + custom |
| **Offline** | Built-in offline persistence (mobile/web) | AppSync (GraphQL) |
| **Scaling** | Automatic (serverless) | Automatic (serverless) |
| **Queries** | Composite indexes, collection group queries | GSI/LSI |
| **Transactions** | Multi-document ACID transactions | DynamoDB transactions |
| **Max document** | 1 MB | 400 KB (DynamoDB) |

### Firestore vs Realtime Database

| Feature | Firestore | Realtime Database |
| ------- | --------- | ----------------- |
| **Data model** | Documents + collections | Single JSON tree |
| **Queries** | Composite, inequality, array-contains | Limited (no compound) |
| **Scaling** | Automatic | Manual sharding |
| **Offline** | Yes (mobile + web) | Yes (mobile) |
| **Pricing** | Per operation | Per bandwidth + storage |
| **Recommendation** | New projects | Legacy or very simple real-time |

---

## Cloud Bigtable

Wide-column NoSQL for analytical and operational workloads at petabyte scale.

| Feature | Details |
| ------- | ------- |
| **Data model** | Wide-column (row key + column families + timestamps) |
| **Scale** | Petabytes, millions of QPS |
| **Latency** | Single-digit milliseconds |
| **API** | HBase-compatible |
| **Use cases** | Time-series, IoT, analytics, ad-tech, financial data |

### Row Key Design

```
Good row keys:
  "device#12345#2024-01-15T08:30:00"  (entity + timestamp)
  -- Enables range scans for a device's data over time

Bad row keys:
  "2024-01-15T08:30:00#device#12345"  (timestamp first)
  -- All writes go to same region (hot spotting)
  -- Prefix timestamp causes sequential writes to one node

  Sequential integers: 1, 2, 3, ...
  -- Same problem: all writes to one region
```

---

## AlloyDB

PostgreSQL-compatible database with Spanner-grade HA and 100x faster analytical queries.

| Feature | Details |
| ------- | ------- |
| **Compatibility** | Full PostgreSQL (wire protocol, extensions) |
| **HA** | 99.99% SLA, cross-zone replication |
| **Performance** | 4x faster transactional, 100x faster analytical vs standard PG |
| **Columnar engine** | Auto-built columnar cache for analytical queries |
| **AI** | Built-in vector search (pgvector) with hardware acceleration |
| **Pricing** | Higher than Cloud SQL, lower than Spanner |

**When to use:** Need PostgreSQL compatibility with better performance and HA than Cloud SQL, but don't need Spanner's global distribution.

---

## Comparison

| Feature | Cloud SQL | Spanner | Firestore | Bigtable | AlloyDB |
| ------- | --------- | ------- | --------- | -------- | ------- |
| **Type** | RDBMS | Distributed SQL | Document | Wide-column | RDBMS |
| **SQL** | Full PG/MySQL | Google SQL | No (document API) | No (HBase API) | Full PG |
| **Consistency** | Strong | External (global) | Strong (regional) | Strong (row-level) | Strong |
| **Scale** | Vertical | Horizontal (add nodes) | Automatic | Horizontal (add nodes) | Vertical + read replicas |
| **Max size** | 64 TB | Unlimited | 1 MB/doc | Unlimited | 64 TB |
| **Serverless** | No | No | Yes | No | No |
| **SLA** | 99.95% | 99.999% | 99.999% | 99.999% | 99.99% |
| **Best for** | Traditional apps | Global apps, finance | Mobile, web, real-time | Analytics, IoT, time-series | PG apps needing better perf |

---

## Common Interview Questions

1. **What makes Spanner unique?** TrueTime (GPS + atomic clocks) provides globally bounded clock uncertainty, enabling external consistency. No other database offers this. Combined with automatic sharding, linear scaling, and 99.999% SLA.

2. **When would you use Spanner vs Cloud SQL?** Spanner for global distribution, strong consistency across regions, and horizontal scaling. Cloud SQL for single-region apps that fit on one machine, full PostgreSQL/MySQL compatibility, and lower cost.

3. **How does Firestore differ from DynamoDB?** Firestore has built-in real-time listeners, offline persistence, and a document-collection hierarchy. DynamoDB has more flexible pricing (on-demand vs provisioned), single-table design patterns, and DAX caching. Firestore is better for mobile/web; DynamoDB for backend services.

4. **What is Bigtable's row key design best practice?** Avoid monotonically increasing keys (hot spotting). Use composite keys with entity ID first, then timestamp. Reverse timestamps for recent-first queries. Design keys to distribute writes evenly across nodes.

5. **What is AlloyDB?** PostgreSQL-compatible database with better performance (4x transactional, 100x analytical) and higher HA (99.99%) than Cloud SQL. Has a columnar engine for analytics and built-in vector search. More expensive than Cloud SQL, less capable than Spanner.
