# MongoDB Deep Dive

MongoDB is the most popular document database, used by companies like Google, eBay, Adobe, and Forbes. As a backend engineer, you need to understand when MongoDB is the right choice, how sharding works, and how to model data in a document-oriented way.

---

## Table of Contents

1. [Document Model](#document-model)
2. [Architecture](#architecture)
3. [Indexing](#indexing)
4. [Aggregation Pipeline](#aggregation-pipeline)
5. [Replica Sets](#replica-sets)
6. [Sharding](#sharding)
7. [Transactions](#transactions)
8. [WiredTiger Storage Engine](#wiredtiger-storage-engine)
9. [Change Streams](#change-streams)
10. [Schema Design Patterns](#schema-design-patterns)
11. [Common Interview Questions](#common-interview-questions)

---

## Document Model

MongoDB stores data as BSON (Binary JSON) documents in collections (analogous to tables).

```json
{
  "_id": ObjectId("507f1f77bcf86cd799439011"),
  "name": "Alice",
  "email": "alice@example.com",
  "address": {
    "street": "123 Main St",
    "city": "Portland",
    "state": "OR"
  },
  "orders": [
    { "product": "Widget", "qty": 2, "price": 9.99 },
    { "product": "Gadget", "qty": 1, "price": 29.99 }
  ],
  "tags": ["premium", "active"],
  "created_at": ISODate("2024-01-15T08:30:00Z")
}
```

### Embedding vs Referencing

| Strategy      | When to Use                                                          | Example                  |
| ------------- | -------------------------------------------------------------------- | ------------------------ |
| **Embed**     | Data accessed together, 1:1 or 1:few, rarely changes                 | Address in user doc      |
| **Reference** | Data accessed independently, 1:many or many:many, frequently updated | Order references user_id |

**Rule of thumb:** If you always need the related data when you fetch the parent, embed it. If you need it independently or it grows unbounded, reference it.

---

## Architecture

```
+------------------+
| mongos           |  <-- Query router (sharded clusters only)
+------------------+
       |
       v
+------------------+     +------------------+     +------------------+
| Shard 1          |     | Shard 2          |     | Shard 3          |
| (Replica Set)    |     | (Replica Set)    |     | (Replica Set)    |
| P - S - S        |     | P - S - S        |     | P - S - S        |
+------------------+     +------------------+     +------------------+
       |
       v
+------------------+
| Config Servers   |  <-- Stores metadata and shard key ranges
| (Replica Set)    |
+------------------+
```

---

## Indexing

### Index Types

| Type             | Example                                 | Use Case                                         |
| ---------------- | --------------------------------------- | ------------------------------------------------ |
| **Single field** | `{email: 1}`                            | Equality and range queries on one field          |
| **Compound**     | `{status: 1, created_at: -1}`           | Multi-field queries (leftmost prefix rule)       |
| **Multikey**     | `{tags: 1}`                             | Array fields (one index entry per array element) |
| **Text**         | `{title: "text", body: "text"}`         | Full-text search                                 |
| **Geospatial**   | `{location: "2dsphere"}`                | Geo queries (near, within)                       |
| **Hashed**       | `{user_id: "hashed"}`                   | Hash-based sharding                              |
| **Wildcard**     | `{"data.$**": 1}`                       | Arbitrary nested fields in schema-less data      |
| **TTL**          | `{expireAt: 1}` with expireAfterSeconds | Auto-delete documents after time                 |

### ESR Rule (Equality, Sort, Range)

For compound indexes, order fields as:

1. **Equality** fields first (exact match)
2. **Sort** fields next
3. **Range** fields last

```javascript
// Query: find active users in age range, sorted by name
db.users
  .find({ status: 'active', age: { $gte: 18, $lte: 65 } })
  .sort({ name: 1 });

// Optimal index (ESR rule)
db.users.createIndex({ status: 1, name: 1, age: 1 });
//                      Equality    Sort     Range
```

### Explain

```javascript
db.users.find({ email: 'alice@example.com' }).explain('executionStats');
// Look for:
// - "stage": "IXSCAN" (good) vs "COLLSCAN" (bad -- full scan)
// - "totalKeysExamined" vs "totalDocsExamined" vs "nReturned"
// - Ideal: keysExamined ≈ docsExamined ≈ nReturned
```

---

## Aggregation Pipeline

The aggregation pipeline is MongoDB's most powerful query tool -- a sequence of stages that transform documents.

```javascript
db.orders.aggregate([
  // Stage 1: Filter
  {
    $match: {
      status: 'completed',
      created_at: { $gte: ISODate('2024-01-01') },
    },
  },

  // Stage 2: Join with users collection
  {
    $lookup: {
      from: 'users',
      localField: 'user_id',
      foreignField: '_id',
      as: 'user',
    },
  },

  // Stage 3: Unwind array (one doc per user)
  { $unwind: '$user' },

  // Stage 4: Group and aggregate
  {
    $group: {
      _id: '$user.country',
      total_revenue: { $sum: '$total' },
      order_count: { $sum: 1 },
      avg_order_value: { $avg: '$total' },
    },
  },

  // Stage 5: Sort
  { $sort: { total_revenue: -1 } },

  // Stage 6: Limit
  { $limit: 10 },

  // Stage 7: Reshape output
  {
    $project: {
      country: '$_id',
      total_revenue: { $round: ['$total_revenue', 2] },
      order_count: 1,
      avg_order_value: { $round: ['$avg_order_value', 2] },
      _id: 0,
    },
  },
]);
```

### Key Pipeline Stages

| Stage              | Purpose                                            |
| ------------------ | -------------------------------------------------- |
| `$match`           | Filter documents (use early for performance)       |
| `$group`           | Aggregate by key (SUM, AVG, COUNT, etc.)           |
| `$project`         | Reshape documents (include/exclude/compute fields) |
| `$sort`            | Sort documents                                     |
| `$limit` / `$skip` | Pagination                                         |
| `$lookup`          | Left outer join with another collection            |
| `$unwind`          | Deconstruct array field into multiple documents    |
| `$facet`           | Run multiple pipelines in parallel on same input   |
| `$bucket`          | Group into custom ranges                           |
| `$graphLookup`     | Recursive graph traversal                          |
| `$merge` / `$out`  | Write results to a collection                      |

---

## Replica Sets

A replica set is a group of `mongod` instances that maintain the same data.

```
+------------------+
| Primary          |  <-- All writes go here
| (read + write)   |
+--------+---------+
         |  oplog replication
    +----+----+
    v         v
+--------+ +--------+
| Secondary| Secondary|
| (read)  | (read)   |
+--------+ +--------+
```

### Key Concepts

| Concept             | Description                                                                           |
| ------------------- | ------------------------------------------------------------------------------------- |
| **Oplog**           | Capped collection of all write operations, replicated to secondaries                  |
| **Election**        | If primary fails, secondaries vote for a new primary (takes 10-12s)                   |
| **Write concern**   | `w: 1` (primary only), `w: "majority"` (majority of nodes), `w: 0` (fire-and-forget)  |
| **Read preference** | `primary` (default), `primaryPreferred`, `secondary`, `secondaryPreferred`, `nearest` |
| **Priority**        | Higher-priority members preferred as primary (set to 0 for analytics replicas)        |

### Write Concern

```javascript
// Acknowledged by primary only (default)
db.orders.insertOne({ ... }, { writeConcern: { w: 1 } })

// Acknowledged by majority (safe for critical data)
db.orders.insertOne({ ... }, { writeConcern: { w: "majority" } })

// With journal acknowledgement
db.orders.insertOne({ ... }, { writeConcern: { w: "majority", j: true } })
```

---

## Sharding

Sharding distributes data across multiple machines for horizontal scalability.

### Shard Key Selection

The shard key determines how data is distributed. **This is the most critical decision** in a sharded MongoDB deployment and cannot be changed after creation (before MongoDB 5.0).

| Shard Key Type | Distribution      | Example                    | Pros                    | Cons                            |
| -------------- | ----------------- | -------------------------- | ----------------------- | ------------------------------- |
| **Hashed**     | Even distribution | `{ _id: "hashed" }`        | No hotspots             | Cannot do range queries         |
| **Ranged**     | By value ranges   | `{ created_at: 1 }`        | Range queries efficient | Time-based keys cause hot shard |
| **Compound**   | Targeted queries  | `{ tenant_id: 1, _id: 1 }` | Targeted + distributed  | More complex                    |

### Good vs Bad Shard Keys

```
Good shard key properties:
  ✓ High cardinality (many distinct values)
  ✓ Low frequency (values evenly distributed)
  ✓ Non-monotonically increasing (avoids hot shard)
  ✓ Matches query patterns (enables targeted queries)

Bad shard keys:
  ✗ { status: 1 }           -- low cardinality (only a few values)
  ✗ { created_at: 1 }       -- monotonically increasing (all writes to one shard)
  ✗ { country: 1 }          -- skewed distribution (US shard much larger)
```

### Chunk Migration

```
Shard 1: [minKey, "m")     Shard 2: ["m", maxKey)
+--------+--------+        +--------+--------+
| chunk1 | chunk2 |        | chunk3 | chunk4 |
+--------+--------+        +--------+--------+

When a shard has too many chunks, the balancer migrates chunks
to maintain even distribution.
```

---

## Transactions

MongoDB supports multi-document transactions since v4.0 (replica sets) and v4.2 (sharded clusters).

```javascript
const session = client.startSession();
try {
  session.startTransaction({
    readConcern: { level: 'snapshot' },
    writeConcern: { w: 'majority' },
  });

  await accounts.updateOne(
    { _id: fromAccount },
    { $inc: { balance: -amount } },
    { session }
  );

  await accounts.updateOne(
    { _id: toAccount },
    { $inc: { balance: amount } },
    { session }
  );

  await session.commitTransaction();
} catch (error) {
  await session.abortTransaction();
  throw error;
} finally {
  session.endSession();
}
```

**Transactions have a 60-second default timeout** and hold locks. Design your schema to minimize the need for transactions -- good document modeling often eliminates them.

---

## WiredTiger Storage Engine

WiredTiger is MongoDB's default storage engine since 3.2.

| Feature         | Details                                                      |
| --------------- | ------------------------------------------------------------ |
| **Compression** | Snappy (default), zlib, zstd -- typically 60-80% compression |
| **Concurrency** | Document-level locking (not collection-level)                |
| **Cache**       | Default: 50% of (RAM - 1 GB) or 256 MB, whichever is larger  |
| **Journaling**  | WAL with 50ms checkpoint intervals                           |
| **MVCC**        | Snapshot isolation for reads                                 |

---

## Change Streams

Watch for real-time changes to collections, databases, or deployments.

```javascript
const pipeline = [
  { $match: { operationType: { $in: ['insert', 'update'] } } },
  { $match: { 'fullDocument.status': 'critical' } },
];

const changeStream = db.collection('alerts').watch(pipeline, {
  fullDocument: 'updateLookup', // Include full document on updates
});

changeStream.on('change', (event) => {
  console.log('Change detected:', event.operationType, event.fullDocument);
});
```

Use cases: real-time dashboards, event-driven microservices, cache invalidation, audit logs.

---

## Schema Design Patterns

| Pattern                | Description                                         | Use Case                                 |
| ---------------------- | --------------------------------------------------- | ---------------------------------------- |
| **Attribute**          | Dynamic key-value pairs in a sub-document           | Product attributes that vary by category |
| **Bucket**             | Group related data into fixed-size buckets          | Time-series data (IoT sensor readings)   |
| **Computed**           | Pre-compute and store derived fields                | Running totals, averages                 |
| **Extended Reference** | Copy frequently-accessed fields from referenced doc | User name in order doc (avoid lookup)    |
| **Outlier**            | Handle documents that exceed normal patterns        | Popular items with thousands of comments |
| **Subset**             | Store most-accessed subset in main doc              | Recent 10 reviews in product doc         |
| **Schema versioning**  | Version field to handle schema evolution            | `{ schema_version: 2, ... }`             |

---

## Common Interview Questions

1. **When would you choose MongoDB over PostgreSQL?** Schema-less or rapidly evolving schema, document-oriented access patterns (read whole document at once), need for horizontal scaling, embedded data models that reduce JOINs.

2. **What is a good shard key?** High cardinality, even distribution, matches query patterns. Compound keys like `{tenant_id: 1, _id: 1}` are often ideal for multi-tenant apps.

3. **Explain embedding vs referencing.** Embed for 1:1 or 1:few relationships accessed together. Reference for 1:many, many:many, or independently accessed data.

4. **How does MongoDB handle consistency?** Tunable via read/write concern. `w: "majority"` + `readConcern: "majority"` gives causal consistency. Transactions provide snapshot isolation.

5. **What happens during a replica set election?** Primary becomes unavailable, secondaries call an election (Raft-like protocol), highest-priority eligible member wins, takes 10-12 seconds. Writes fail during election.

6. **How would you migrate from MongoDB to PostgreSQL?** (Or vice versa) Map documents to tables, flatten embedded documents, handle arrays with junction tables, use Change Streams for live migration, run dual-writes during cutover.

7. **What is the oplog?** A capped collection on the primary that records all write operations. Secondaries tail the oplog to replicate changes. If a secondary falls too far behind, it needs a full resync.

8. **How do you handle schema migrations in MongoDB?** Schema versioning pattern (add `schema_version` field), lazy migration (update documents on read), or batch migration scripts.
