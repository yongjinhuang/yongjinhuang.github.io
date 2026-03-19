# Specialized Databases: Search, Time-Series, and Graph

Not every problem fits a general-purpose database. Specialized databases are optimized for specific access patterns -- full-text search, time-series analytics, and graph traversal. As a backend engineer, knowing when to reach for these tools (and when not to) is a key interview differentiator.

---

## Table of Contents

1. [Elasticsearch / OpenSearch](#elasticsearch--opensearch)
2. [ClickHouse](#clickhouse)
3. [TimescaleDB](#timescaledb)
4. [Neo4j](#neo4j)
5. [Decision Matrix](#decision-matrix)
6. [Common Interview Questions](#common-interview-questions)

---

## Elasticsearch / OpenSearch

Elasticsearch is the dominant full-text search and analytics engine, built on Apache Lucene. OpenSearch is the AWS-forked open-source alternative (after Elastic changed its license).

### Architecture

```
+----------------------------------------------------------+
|                    Elasticsearch Cluster                   |
|  +--------+     +--------+     +--------+                 |
|  | Node 1 |     | Node 2 |     | Node 3 |                 |
|  | Master |     | Data   |     | Data   |                 |
|  | + Data |     |        |     |        |                 |
|  +--------+     +--------+     +--------+                 |
|                                                           |
|  Index: "products" (5 primary shards, 1 replica each)     |
|  +---+---+---+---+---+                                    |
|  | P0| P1| P2| P3| P4|  Primary shards                    |
|  +---+---+---+---+---+                                    |
|  | R0| R1| R2| R3| R4|  Replica shards                    |
|  +---+---+---+---+---+                                    |
+----------------------------------------------------------+
```

### Core Concepts

| Concept | Description | SQL Equivalent |
| ------- | ----------- | -------------- |
| **Index** | Collection of documents | Database / Table |
| **Document** | JSON object | Row |
| **Field** | Key-value in document | Column |
| **Mapping** | Schema definition | CREATE TABLE |
| **Shard** | Horizontal partition of an index | Table partition |
| **Replica** | Copy of a shard for HA | Read replica |

### Inverted Index

The secret behind fast full-text search:

```
Documents:
  doc1: "The quick brown fox"
  doc2: "The quick brown dog"
  doc3: "The lazy brown dog"

Inverted Index:
  "the"   -> [doc1, doc2, doc3]
  "quick" -> [doc1, doc2]
  "brown" -> [doc1, doc2, doc3]
  "fox"   -> [doc1]
  "dog"   -> [doc2, doc3]
  "lazy"  -> [doc3]

Search "quick dog" -> intersect [doc1, doc2] ∩ [doc2, doc3] = [doc2]
```

### Key Operations

```json
// Index a document
PUT /products/_doc/1
{
  "name": "Wireless Mouse",
  "description": "Ergonomic wireless mouse with USB-C receiver",
  "price": 29.99,
  "categories": ["electronics", "accessories"],
  "created_at": "2024-01-15"
}

// Full-text search with relevance scoring
GET /products/_search
{
  "query": {
    "bool": {
      "must": [
        { "match": { "description": "wireless mouse" } }
      ],
      "filter": [
        { "range": { "price": { "lte": 50 } } },
        { "term": { "categories": "electronics" } }
      ]
    }
  },
  "sort": [{ "_score": "desc" }, { "created_at": "desc" }],
  "highlight": {
    "fields": { "description": {} }
  }
}

// Aggregations (analytics)
GET /products/_search
{
  "size": 0,
  "aggs": {
    "avg_price_by_category": {
      "terms": { "field": "categories" },
      "aggs": {
        "avg_price": { "avg": { "field": "price" } }
      }
    }
  }
}
```

### When to Use Elasticsearch

| Use For | Don't Use For |
| ------- | ------------- |
| Full-text search | Primary data store (no ACID) |
| Log analytics (ELK stack) | Frequently updated documents |
| Auto-complete / suggestions | Transactions |
| Faceted search (e-commerce) | Strong consistency requirements |
| Metric aggregations | Small datasets (overkill) |

---

## ClickHouse

ClickHouse is a columnar OLAP database designed for real-time analytical queries on massive datasets. Created by Yandex, used by Cloudflare, Uber, eBay.

### Why Columnar?

```
Row-oriented (PostgreSQL):
+----+--------+-----+--------+
| id | name   | age | salary |
+----+--------+-----+--------+
| 1  | Alice  | 30  | 90000  |   All columns stored together
| 2  | Bob    | 25  | 80000  |
| 3  | Carol  | 35  | 95000  |
+----+--------+-----+--------+

Columnar (ClickHouse):
id:     [1, 2, 3]         -- stored together, compressed well
name:   [Alice, Bob, Carol]
age:    [30, 25, 35]
salary: [90000, 80000, 95000]

SELECT AVG(salary) FROM employees;
-- Row-oriented: reads ALL columns (wasted I/O)
-- Columnar: reads ONLY salary column (minimal I/O)
```

### Key Features

| Feature | Details |
| ------- | ------- |
| **Compression** | 10-40x compression ratio (similar values compress well) |
| **Vectorized execution** | Processes data in batches using SIMD instructions |
| **Merge tree engine** | LSM-tree variant optimized for append-heavy workloads |
| **Materialized views** | Pre-compute aggregations on insert |
| **Approximate queries** | HyperLogLog, quantiles, sampling for fast approximations |
| **Performance** | Billions of rows per second on single node |

### Example Queries

```sql
-- Create table with MergeTree engine
CREATE TABLE events (
    event_date Date,
    event_time DateTime,
    user_id UInt64,
    event_type String,
    properties Map(String, String)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(event_date)
ORDER BY (event_type, user_id, event_time);

-- Real-time analytics
SELECT
    toStartOfHour(event_time) AS hour,
    event_type,
    count() AS cnt,
    uniqExact(user_id) AS unique_users
FROM events
WHERE event_date = today()
GROUP BY hour, event_type
ORDER BY hour DESC;

-- Funnel analysis
SELECT
    level,
    count() AS users
FROM (
    SELECT user_id, windowFunnel(3600)(event_time, event_type = 'view', event_type = 'add_to_cart', event_type = 'purchase') AS level
    FROM events
    WHERE event_date >= today() - 7
    GROUP BY user_id
)
GROUP BY level;
```

### When to Use ClickHouse

| Use For | Don't Use For |
| ------- | ------------- |
| Real-time analytics dashboards | OLTP workloads (many small updates) |
| Log/event storage and analysis | Transactions |
| Time-series aggregations | Point lookups by primary key |
| Ad-hoc analytical queries | Frequently updated rows |
| A/B test result analysis | Small datasets (< 1M rows) |

---

## TimescaleDB

TimescaleDB is a PostgreSQL extension that optimizes it for time-series data. You get full PostgreSQL compatibility + time-series superpowers.

### Hypertables

```
Regular PostgreSQL Table          TimescaleDB Hypertable
+-------------------------+       +-------------------------+
| sensor_id | time | val  |       | Chunk 1 (Jan 2024)     |
|     ...millions of rows |       | +---+------+-----+     |
+-------------------------+       | | id| time | val |     |
                                  | +---+------+-----+     |
                                  +-------------------------+
                                  | Chunk 2 (Feb 2024)     |
                                  | +---+------+-----+     |
                                  | | id| time | val |     |
                                  | +---+------+-----+     |
                                  +-------------------------+
                                  Automatic time-based partitioning
```

### Key Features

```sql
-- Create hypertable
CREATE TABLE metrics (
    time        TIMESTAMPTZ NOT NULL,
    sensor_id   INTEGER NOT NULL,
    temperature DOUBLE PRECISION,
    humidity    DOUBLE PRECISION
);
SELECT create_hypertable('metrics', 'time');

-- Continuous aggregates (materialized views that auto-update)
CREATE MATERIALIZED VIEW metrics_hourly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) AS bucket,
    sensor_id,
    AVG(temperature) AS avg_temp,
    MAX(temperature) AS max_temp,
    MIN(temperature) AS min_temp
FROM metrics
GROUP BY bucket, sensor_id;

-- Data retention policies
SELECT add_retention_policy('metrics', INTERVAL '90 days');

-- Compression (reduces storage 90%+)
ALTER TABLE metrics SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'sensor_id'
);
SELECT add_compression_policy('metrics', INTERVAL '7 days');
```

### TimescaleDB vs ClickHouse

| Feature | TimescaleDB | ClickHouse |
| ------- | ----------- | ---------- |
| **Base** | PostgreSQL extension | Standalone system |
| **SQL** | Full PostgreSQL SQL | ClickHouse SQL (similar but different) |
| **JOINs** | Full support | Limited (hash joins, no nested loop) |
| **Updates/Deletes** | Full support | Async mutations (eventually applied) |
| **Transactions** | Full ACID | No |
| **Best scale** | Millions-billions of rows | Billions-trillions of rows |
| **Compression** | Good (90%+) | Excellent (95%+) |
| **Ecosystem** | PostgreSQL tools, extensions | Own ecosystem |

---

## Neo4j

Neo4j is the most popular graph database, designed for highly connected data.

### When Graphs Win

```
SQL approach (3 JOINs for "friends of friends who like X"):
SELECT DISTINCT u3.name
FROM users u1
JOIN friendships f1 ON u1.id = f1.user_id
JOIN friendships f2 ON f1.friend_id = f2.user_id
JOIN users u3 ON f2.friend_id = u3.id
JOIN likes l ON u3.id = l.user_id
WHERE u1.name = 'Alice' AND l.product_id = 123;
-- Performance degrades with depth (each JOIN = full scan or index lookup)

Cypher (Neo4j):
MATCH (alice:User {name: 'Alice'})-[:FRIEND]->()-[:FRIEND]->(fof:User)-[:LIKES]->(p:Product {id: 123})
RETURN DISTINCT fof.name
-- Performance depends on local neighborhood size, not total data size
```

### Core Concepts

| Concept | Description |
| ------- | ----------- |
| **Node** | Entity (like a row) with labels and properties |
| **Relationship** | Directed connection between nodes with type and properties |
| **Label** | Category for nodes (like a table name) |
| **Property** | Key-value pair on nodes or relationships |
| **Cypher** | Neo4j's query language |

### Use Cases

| Good For | Not Good For |
| -------- | ------------ |
| Social networks | Tabular data / simple CRUD |
| Recommendation engines | Time-series data |
| Fraud detection | Full-text search |
| Knowledge graphs | Heavy aggregations |
| Network/IT infrastructure | Simple key-value lookups |
| Access control (RBAC) | Write-heavy workloads |

---

## Decision Matrix

| Need | Best Choice | Why |
| ---- | ----------- | --- |
| Full-text search | Elasticsearch | Inverted index, relevance scoring, facets |
| Log analytics | Elasticsearch or ClickHouse | ELK stack for logs, ClickHouse for volume |
| Real-time analytics | ClickHouse | Columnar, vectorized, fastest aggregations |
| Time-series with SQL | TimescaleDB | PostgreSQL compatibility, continuous aggregates |
| Time-series at massive scale | ClickHouse | Better compression and query speed at 100B+ rows |
| Graph traversal | Neo4j | Index-free adjacency, Cypher query language |
| IoT sensor data | TimescaleDB | Time-partitioning, compression, retention policies |
| E-commerce search | Elasticsearch | Faceted search, auto-complete, relevance |
| General analytics | ClickHouse or PostgreSQL | ClickHouse for speed, PG for simplicity |

---

## Common Interview Questions

1. **When would you add Elasticsearch alongside PostgreSQL?** When you need full-text search with relevance scoring, auto-complete, or faceted filtering. PostgreSQL's `tsvector` works for simple cases but Elasticsearch excels at complex search UX.

2. **How does an inverted index work?** Maps each term to the list of documents containing it. Search finds documents by looking up terms and intersecting/unioning document lists. Scoring (TF-IDF, BM25) ranks results by relevance.

3. **Why is ClickHouse fast for analytics?** Columnar storage reads only needed columns. Compression reduces I/O (similar values compress well). Vectorized execution uses CPU SIMD instructions. MergeTree engine optimizes for append-heavy, read-heavy workloads.

4. **Compare ClickHouse vs Elasticsearch for analytics.** ClickHouse: SQL, faster for aggregations, better compression, cheaper at scale. Elasticsearch: better for full-text search, nested objects, document-oriented queries. ClickHouse for analytics, Elasticsearch for search.

5. **What is a graph database good at that SQL is not?** Traversing relationships of arbitrary depth efficiently. SQL JOINs scale poorly with depth (each level = another JOIN). Graph databases use index-free adjacency -- traversal time depends on local neighborhood, not total data size.

6. **How would you handle time-series data in PostgreSQL?** Use TimescaleDB extension for automatic partitioning, continuous aggregates, and compression. Without TimescaleDB: use range partitioning by time, BRIN indexes, and batch archival.

7. **What is the ELK stack?** Elasticsearch (search/analytics) + Logstash (data ingestion/transformation) + Kibana (visualization). Modern alternative: Elasticsearch + Filebeat (lightweight shipper) + Kibana.
