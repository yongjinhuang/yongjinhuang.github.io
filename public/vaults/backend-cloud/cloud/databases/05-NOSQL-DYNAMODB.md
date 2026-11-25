# DynamoDB Deep Dive

DynamoDB is AWS's fully managed NoSQL database offering single-digit millisecond latency at any scale. It powers Amazon.com's shopping cart, Lyft's ride tracking, and Duolingo's user data. As a backend engineer, understanding DynamoDB's data modeling constraints is essential -- it forces you to think about access patterns upfront.

---

## Table of Contents

1. [Core Concepts](#core-concepts)
2. [Primary Key Design](#primary-key-design)
3. [Secondary Indexes](#secondary-indexes)
4. [Capacity Modes](#capacity-modes)
5. [Single-Table Design](#single-table-design)
6. [Queries and Scans](#queries-and-scans)
7. [DynamoDB Streams](#dynamodb-streams)
8. [DAX (Accelerator)](#dax)
9. [Transactions](#transactions)
10. [Best Practices and Anti-Patterns](#best-practices-and-anti-patterns)
11. [Common Interview Questions](#common-interview-questions)

---

## Core Concepts

```
+----------------------------------------------------------+
|                    DynamoDB Table                          |
|  +------------------------------------------------------+|
|  | Partition Key (PK) | Sort Key (SK) | Attributes      ||
|  +------------------------------------------------------+|
|  | USER#123           | PROFILE       | name, email     ||
|  | USER#123           | ORDER#001     | total, status   ||
|  | USER#123           | ORDER#002     | total, status   ||
|  | USER#456           | PROFILE       | name, email     ||
|  | USER#456           | ORDER#001     | total, status   ||
|  +------------------------------------------------------+|
+----------------------------------------------------------+
```

| Concept                | Description                                             |
| ---------------------- | ------------------------------------------------------- |
| **Table**              | Collection of items (no fixed schema beyond keys)       |
| **Item**               | A single record (like a row), max 400 KB                |
| **Attribute**          | A field on an item (like a column)                      |
| **Partition Key (PK)** | Hash key -- determines which partition stores the item  |
| **Sort Key (SK)**      | Range key -- enables ordered queries within a partition |
| **Item Collection**    | All items with the same partition key                   |

---

## Primary Key Design

### Simple Primary Key (Partition Key Only)

```
PK = user_id
Each item uniquely identified by user_id alone
Good for: simple key-value lookups
```

### Composite Primary Key (Partition Key + Sort Key)

```
PK = user_id, SK = order_id
Multiple items per partition key, sorted by sort key
Good for: 1-to-many relationships, time-ordered data
```

### Partition Key Selection

The partition key determines data distribution across physical partitions.

| Good Partition Key           | Bad Partition Key                        |
| ---------------------------- | ---------------------------------------- |
| `user_id` (high cardinality) | `status` (few values = hot partition)    |
| `device_id`                  | `date` (all writes to today's partition) |
| `tenant_id` + write sharding | `country` (US partition much larger)     |

### Hot Partition Problem

```
Partition 1: user_id = "celebrity_user"     -- 100,000 requests/sec
Partition 2: user_id = "regular_user_123"   -- 10 requests/sec
Partition 3: user_id = "regular_user_456"   -- 5 requests/sec

Solution: Write sharding
PK = "celebrity_user#" + random(0-9)   -- splits across 10 partitions
Read: scatter-gather across all 10 shards
```

---

## Secondary Indexes

### Global Secondary Index (GSI)

```
Base Table:  PK = user_id,  SK = order_id
GSI:         PK = status,   SK = created_at

-- Query: "Find all pending orders sorted by date"
-- Without GSI: full table scan
-- With GSI: efficient query on GSI
```

| Feature       | GSI                       | LSI                        |
| ------------- | ------------------------- | -------------------------- |
| Partition key | Different from base table | Same as base table         |
| Sort key      | Different from base table | Different from base table  |
| Created       | Any time                  | At table creation only     |
| Capacity      | Own provisioned capacity  | Shares base table capacity |
| Size limit    | None                      | 10 GB per partition key    |
| Consistency   | Eventual only             | Strong or eventual         |
| Projections   | Choose which attributes   | Choose which attributes    |

### GSI Overloading

In single-table design, GSIs are "overloaded" to serve multiple access patterns:

```
Base Table:
PK          | SK           | GSI1-PK      | GSI1-SK
USER#123    | PROFILE      | alice@co.com  | USER#123
USER#123    | ORDER#001    | PENDING       | 2024-01-15
PRODUCT#789 | INFO         | Electronics   | PRODUCT#789

GSI1 serves:
- "Find user by email" (GSI1-PK = email)
- "Find orders by status sorted by date" (GSI1-PK = status, GSI1-SK = date)
- "Find products by category" (GSI1-PK = category)
```

---

## Capacity Modes

| Mode                           | How                  | Best For                          | Cost                                                |
| ------------------------------ | -------------------- | --------------------------------- | --------------------------------------------------- |
| **On-Demand**                  | Pay per request      | Unpredictable traffic, new tables | ~5x more expensive than provisioned at steady state |
| **Provisioned**                | Set RCU/WCU          | Predictable traffic               | Cheaper at steady state                             |
| **Provisioned + Auto-scaling** | Scales within bounds | Most production workloads         | Cost-effective with safety                          |

### Read/Write Capacity Units

```
1 RCU = 1 strongly consistent read/sec for items up to 4 KB
        2 eventually consistent reads/sec for items up to 4 KB

1 WCU = 1 write/sec for items up to 1 KB

Example: Read a 10 KB item with strong consistency
  = ceil(10/4) = 3 RCUs per read

Example: Write a 3 KB item
  = ceil(3/1) = 3 WCUs per write
```

---

## Single-Table Design

The flagship DynamoDB pattern: store all entities in one table, using prefixed keys.

```
PK              | SK              | Type    | Data attributes
----------------|-----------------|---------|------------------
USER#u1         | METADATA        | User    | name, email
USER#u1         | ORDER#o1        | Order   | total, status
USER#u1         | ORDER#o2        | Order   | total, status
ORDER#o1        | METADATA        | Order   | user_id, total
ORDER#o1        | ITEM#i1         | Item    | product, qty
ORDER#o1        | ITEM#i2         | Item    | product, qty
PRODUCT#p1      | METADATA        | Product | name, price
PRODUCT#p1      | REVIEW#r1       | Review  | rating, text
```

### Access Patterns Served

| Access Pattern      | Query                                       |
| ------------------- | ------------------------------------------- |
| Get user profile    | PK = `USER#u1`, SK = `METADATA`             |
| Get user's orders   | PK = `USER#u1`, SK begins_with `ORDER#`     |
| Get order details   | PK = `ORDER#o1`, SK = `METADATA`            |
| Get order items     | PK = `ORDER#o1`, SK begins_with `ITEM#`     |
| Get product reviews | PK = `PRODUCT#p1`, SK begins_with `REVIEW#` |

### When NOT to Use Single-Table Design

- You don't know your access patterns yet
- Your team finds it too complex to maintain
- You have many ad-hoc query requirements
- You need complex aggregations (use a relational DB or warehouse)

---

## Queries and Scans

### Query (Efficient)

```javascript
// Query: uses partition key + optional sort key condition
const result = await dynamodb.query({
  TableName: 'MyTable',
  KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
  ExpressionAttributeValues: {
    ':pk': 'USER#123',
    ':prefix': 'ORDER#',
  },
  ScanIndexForward: false, // descending order
  Limit: 10,
});
```

### Scan (Expensive)

```javascript
// Scan: reads ENTIRE table, then filters -- avoid in production
const result = await dynamodb.scan({
  TableName: 'MyTable',
  FilterExpression: '#status = :status',
  ExpressionAttributeNames: { '#status': 'status' },
  ExpressionAttributeValues: { ':status': 'active' },
});
// FilterExpression is applied AFTER reading -- you still pay for full scan RCUs!
```

### Pagination

DynamoDB returns max 1 MB per query. Use `LastEvaluatedKey` for pagination:

```javascript
let lastKey = undefined;
do {
  const result = await dynamodb.query({
    TableName: 'MyTable',
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: { ':pk': 'USER#123' },
    ExclusiveStartKey: lastKey,
  });
  // Process result.Items
  lastKey = result.LastEvaluatedKey;
} while (lastKey);
```

---

## DynamoDB Streams

Capture item-level changes (insert, update, delete) as an ordered stream of events.

```
DynamoDB Table
       |
       v (stream records)
+------------------+
| DynamoDB Streams  |  <-- 24-hour retention
+------------------+
       |
       v
+------------------+     +------------------+     +------------------+
| Lambda trigger   |     | Kinesis adapter  |     | Custom consumer  |
+------------------+     +------------------+     +------------------+
```

| Stream View Type     | What's Captured                              |
| -------------------- | -------------------------------------------- |
| `KEYS_ONLY`          | Only the key attributes of the modified item |
| `NEW_IMAGE`          | The entire item after modification           |
| `OLD_IMAGE`          | The entire item before modification          |
| `NEW_AND_OLD_IMAGES` | Both before and after (most useful)          |

Use cases: replication to Elasticsearch, cache invalidation, event-driven microservices, audit trail.

---

## DAX

DynamoDB Accelerator (DAX) is an in-memory cache that sits in front of DynamoDB.

```
Application --> DAX Cluster --> DynamoDB
                (microsecond    (millisecond
                 reads)          reads)
```

| Feature       | Details                                                                     |
| ------------- | --------------------------------------------------------------------------- |
| Read latency  | Microseconds (vs milliseconds for DynamoDB)                                 |
| Write-through | Writes go to both DAX and DynamoDB                                          |
| Item cache    | Caches individual GetItem/BatchGetItem results                              |
| Query cache   | Caches Query/Scan results                                                   |
| TTL           | Default 5 minutes (configurable)                                            |
| Consistency   | Eventually consistent only (DAX does not support strongly consistent reads) |

**When to use:** Read-heavy workloads (10:1 or higher read-to-write ratio), microsecond latency requirements, hot key mitigation.

---

## Transactions

```javascript
await dynamodb.transactWriteItems({
  TransactItems: [
    {
      Update: {
        TableName: 'Accounts',
        Key: { PK: 'ACCOUNT#from' },
        UpdateExpression: 'SET balance = balance - :amount',
        ConditionExpression: 'balance >= :amount',
        ExpressionAttributeValues: { ':amount': 100 },
      },
    },
    {
      Update: {
        TableName: 'Accounts',
        Key: { PK: 'ACCOUNT#to' },
        UpdateExpression: 'SET balance = balance + :amount',
        ExpressionAttributeValues: { ':amount': 100 },
      },
    },
  ],
});
```

- Max 100 items per transaction
- 2x the cost of non-transactional operations
- Items can span multiple tables
- Serializable isolation

---

## Best Practices and Anti-Patterns

### Do

- Design for your access patterns first, then model data
- Use composite sort keys for hierarchical data (`ORDER#2024-01-15#001`)
- Use sparse indexes (GSI on attributes that only some items have)
- Use TTL for automatic data expiration
- Use batch operations (`BatchGetItem`, `BatchWriteItem`) to reduce API calls

### Don't

- Don't use Scan in production (unless you need to process ALL items)
- Don't store large items (keep under 400 KB, use S3 for large objects)
- Don't use monotonically increasing partition keys (causes hot partitions)
- Don't create too many GSIs (max 20, each costs additional WCUs)
- Don't use FilterExpression for primary access patterns (it filters AFTER reading)

---

## Common Interview Questions

1. **How does DynamoDB partition data?** Items are hashed by partition key and distributed across partitions. Each partition handles ~3000 RCUs or 1000 WCUs and stores up to 10 GB.

2. **Explain the hot partition problem.** When one partition key receives disproportionate traffic. Solutions: write sharding (add random suffix), use composite keys, or redesign access patterns.

3. **When would you use single-table design?** When you have well-defined access patterns, need to minimize API calls, and want to fetch related entities in a single query. Not suitable for ad-hoc queries or when access patterns are unknown.

4. **GSI vs LSI?** GSI: different partition key, created anytime, eventual consistency, own capacity. LSI: same partition key, created at table creation, supports strong consistency, shares table capacity.

5. **How do you handle pagination in DynamoDB?** Use `LastEvaluatedKey` from the response as `ExclusiveStartKey` in the next request. There is no offset-based pagination.

6. **What is the maximum item size?** 400 KB. For larger data, store a reference (S3 key) in DynamoDB and the actual data in S3.

7. **How do DynamoDB transactions work?** TransactWriteItems and TransactGetItems provide ACID transactions across up to 100 items and multiple tables. They cost 2x normal operations and provide serializable isolation.

8. **Compare DynamoDB with MongoDB.** DynamoDB: fully managed, extreme scale, rigid access patterns, AWS-only. MongoDB: self-hosted or Atlas, flexible queries/aggregation, portable, richer query language.
