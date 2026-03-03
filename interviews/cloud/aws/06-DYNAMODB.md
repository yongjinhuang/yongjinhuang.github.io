# Amazon DynamoDB

DynamoDB is a fully managed NoSQL key-value and document database that delivers single-digit millisecond performance at any scale. There are no servers to provision, no storage to manage, no replication to configure. You create a table, define a primary key, and start writing items. DynamoDB handles partitioning, replication (3 AZs by default), and scaling automatically. It is the default choice for serverless architectures, gaming leaderboards, session stores, IoT telemetry, and any workload where you need predictable latency regardless of table size.

---

## Data Model

### Tables, Items, and Attributes

```
Table: Users
+-----------------------------------------------------+
| Item (row)                                           |
| {                                                    |
|   "userId": "u-123",        <-- Partition key        |
|   "email": "alice@acme.com",                         |
|   "name": "Alice",                                   |
|   "roles": ["admin", "dev"],  <-- List attribute     |
|   "address": {                 <-- Map (nested)      |
|     "city": "Seattle",                               |
|     "zip": "98101"                                   |
|   }                                                  |
| }                                                    |
+-----------------------------------------------------+
```

- **Table**: Collection of items. No fixed schema beyond the primary key.
- **Item**: A single record. Max size: **400 KB**.
- **Attribute**: A name-value pair. Supports strings, numbers, binary, booleans, lists, maps, sets, and null.

Items in the same table can have completely different attributes (schema-less). Only the primary key attributes are required.

---

## Primary Key Design

The most important decision you make with DynamoDB. Get it wrong and you will hit hot partitions and need to redesign.

### Partition Key Only (Simple Primary Key)

```
Table: Users
Partition Key: userId

userId (PK) | email              | name
u-123       | alice@acme.com     | Alice
u-456       | bob@acme.com       | Bob
```

Each item is uniquely identified by the partition key. DynamoDB hashes the partition key to determine which physical partition stores the item.

### Partition Key + Sort Key (Composite Primary Key)

```
Table: Orders
Partition Key: customerId
Sort Key: orderDate

customerId (PK) | orderDate (SK)        | total  | status
c-100            | 2024-01-15T10:30:00Z  | 59.99  | shipped
c-100            | 2024-03-22T14:00:00Z  | 124.50 | delivered
c-200            | 2024-02-10T09:15:00Z  | 30.00  | pending
```

The combination of partition key + sort key must be unique. The sort key enables **range queries** within a partition: give me all orders for customer c-100 between January and March.

---

## Capacity Modes

### On-Demand

- Pay per request (read and write)
- No capacity planning
- Instantly accommodates traffic spikes
- ~6x more expensive than provisioned at steady-state
- Best for: unpredictable workloads, new tables, dev/test

### Provisioned (with Auto-Scaling)

- You set Read Capacity Units (RCU) and Write Capacity Units (WCU)
- Auto-scaling adjusts based on utilization (target tracking)
- Cheapest option for predictable workloads
- Can use **reserved capacity** for further savings

### RCU / WCU Calculations

| Operation | Capacity | Unit |
|-----------|----------|------|
| One strongly consistent read, up to 4 KB | 1 RCU | Per second |
| One eventually consistent read, up to 4 KB | 0.5 RCU | Per second |
| One write, up to 1 KB | 1 WCU | Per second |
| One transactional read, up to 4 KB | 2 RCU | Per second |
| One transactional write, up to 1 KB | 2 WCU | Per second |

**Example**: Read 10 items/sec, each 8 KB, strongly consistent:

```
Each read = ceil(8 KB / 4 KB) = 2 RCU
Total = 10 * 2 = 20 RCU
```

**Example**: Write 50 items/sec, each 2.5 KB:

```
Each write = ceil(2.5 KB / 1 KB) = 3 WCU
Total = 50 * 3 = 150 WCU
```

---

## Secondary Indexes

Indexes let you query the table on attributes other than the primary key.

### Global Secondary Index (GSI)

- **Different** partition key and optional sort key from the base table
- Has its own provisioned throughput (separate RCU/WCU)
- **Eventually consistent** reads only
- Can be created or deleted at any time
- Max 20 GSIs per table
- Projects a subset of attributes (you choose: ALL, KEYS_ONLY, or INCLUDE specific attributes)

```
Base Table: Orders (PK: customerId, SK: orderDate)

GSI: StatusIndex (PK: status, SK: orderDate)
--> Query: "Give me all 'pending' orders sorted by date"
```

### Local Secondary Index (LSI)

- **Same** partition key as the base table, different sort key
- Shares throughput with the base table
- Supports strongly consistent reads
- Must be created at table creation time (cannot add later)
- Max 5 LSIs per table
- Item collection limit: 10 GB per partition key value

```
Base Table: Orders (PK: customerId, SK: orderDate)

LSI: AmountIndex (PK: customerId, SK: totalAmount)
--> Query: "Give me customer c-100's orders sorted by amount"
```

**Rule of thumb**: Use GSIs almost exclusively. Use LSIs only when you need strongly consistent reads on an alternate sort key and can live with the 10 GB partition limit.

---

## Query vs Scan

### Query

- Retrieves items by **primary key** (partition key required, sort key optional with conditions)
- Efficient: reads only the items that match
- Supports `KeyConditionExpression` for sort key range queries
- Returns up to 1 MB per call (paginate with `LastEvaluatedKey`)

```bash
aws dynamodb query \
  --table-name Orders \
  --key-condition-expression "customerId = :cid AND orderDate BETWEEN :start AND :end" \
  --expression-attribute-values '{
    ":cid": {"S": "c-100"},
    ":start": {"S": "2024-01-01"},
    ":end": {"S": "2024-12-31"}
  }'
```

### Scan

- Reads **every item** in the table, then optionally filters
- Consumes RCU for the entire table, not just the filtered results
- Extremely expensive at scale

**Never Scan in production** unless you are doing a one-time data migration or backfill, and even then use parallel scan with rate limiting.

```bash
# If you absolutely must scan, use parallel scan with a segment
aws dynamodb scan \
  --table-name Orders \
  --total-segments 4 \
  --segment 0 \
  --filter-expression "total > :min" \
  --expression-attribute-values '{":min": {"N": "100"}}'
```

---

## Single-Table Design

The DynamoDB-native approach to data modeling. Instead of one table per entity (like relational databases), you store multiple entity types in a single table using carefully designed partition and sort keys.

### Why Single-Table?

- DynamoDB charges per table (provisioned mode) or per request
- Joins do not exist -- if you need related data together, store it together
- A single Query call can return an order and all its line items

### Example: E-Commerce

```
PK              | SK                | Type     | Data...
CUSTOMER#c-100  | PROFILE           | Customer | name, email
CUSTOMER#c-100  | ORDER#2024-01-15  | Order    | total, status
CUSTOMER#c-100  | ORDER#2024-03-22  | Order    | total, status
PRODUCT#p-500   | METADATA          | Product  | name, price
PRODUCT#p-500   | REVIEW#r-001      | Review   | rating, text
```

One query with `PK = CUSTOMER#c-100` returns the customer profile and all their orders.

### Access Pattern Driven

1. List all access patterns first
2. Design the key schema to satisfy them
3. Add GSIs for patterns that do not fit the base table
4. Do NOT model first, query second -- that is relational thinking

---

## DynamoDB Streams

Change Data Capture (CDC) for DynamoDB. Every write (insert, update, delete) is recorded in a time-ordered stream.

| View Type | What You Get |
|-----------|-------------|
| KEYS_ONLY | Only the key attributes of modified items |
| NEW_IMAGE | The entire item after modification |
| OLD_IMAGE | The entire item before modification |
| NEW_AND_OLD_IMAGES | Both before and after |

**Use cases:**
- Trigger Lambda on item changes (event-driven)
- Replicate data to Elasticsearch/OpenSearch for full-text search
- Maintain materialized views or aggregates
- Cross-region replication (used internally by Global Tables)

```bash
aws dynamodb update-table \
  --table-name Orders \
  --stream-specification StreamEnabled=true,StreamViewType=NEW_AND_OLD_IMAGES
```

---

## Transactions

DynamoDB supports ACID transactions across multiple items and tables within a single AWS account and Region.

```bash
aws dynamodb transact-write-items --transact-items '[
  {
    "Put": {
      "TableName": "Orders",
      "Item": {"customerId": {"S": "c-100"}, "orderDate": {"S": "2024-06-01"}, "total": {"N": "99.99"}},
      "ConditionExpression": "attribute_not_exists(customerId)"
    }
  },
  {
    "Update": {
      "TableName": "Inventory",
      "Key": {"productId": {"S": "p-500"}},
      "UpdateExpression": "SET stock = stock - :qty",
      "ConditionExpression": "stock >= :qty",
      "ExpressionAttributeValues": {":qty": {"N": "1"}}
    }
  }
]'
```

- **TransactWriteItems**: Up to 100 items, all-or-nothing
- **TransactGetItems**: Up to 100 items, consistent snapshot read
- Cost: 2x the normal RCU/WCU (transactional overhead)

---

## TTL (Time to Live)

Automatically deletes expired items at no cost. You designate an attribute that holds a Unix epoch timestamp. DynamoDB deletes items within ~48 hours of expiration (not instant, but free).

```bash
aws dynamodb update-time-to-live \
  --table-name Sessions \
  --time-to-live-specification Enabled=true,AttributeName=expiresAt
```

Use cases: session stores, temporary tokens, event logs with retention policies.

---

## DAX (DynamoDB Accelerator)

An in-memory cache that sits in front of DynamoDB. Fully managed, API-compatible -- you change the endpoint in your application, and reads go through DAX.

- **Microsecond** read latency (vs. single-digit millisecond for DynamoDB)
- Write-through cache: writes go to DynamoDB and cache simultaneously
- Ideal for read-heavy, latency-sensitive workloads (e.g., gaming leaderboards)
- Not useful if your workload is write-heavy or if you always need strongly consistent reads (DAX only supports eventually consistent reads)

---

## Global Tables

Multi-Region, fully replicated tables with active-active read/write in every Region.

- Built on DynamoDB Streams
- Conflict resolution: last-writer-wins (based on timestamp)
- All replica tables have the same table name
- Adds latency for cross-region replication (~1 second typical)

```bash
# Add a replica to an existing table
aws dynamodb update-table \
  --table-name Users \
  --replica-updates '[{"Create": {"RegionName": "eu-west-1"}}]'
```

Use cases: globally distributed applications, disaster recovery, low-latency reads for users worldwide.

---

## Common CLI Commands

```bash
# Create a table
aws dynamodb create-table \
  --table-name Orders \
  --attribute-definitions \
    AttributeName=customerId,AttributeType=S \
    AttributeName=orderDate,AttributeType=S \
  --key-schema \
    AttributeName=customerId,KeyType=HASH \
    AttributeName=orderDate,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST

# Put an item
aws dynamodb put-item \
  --table-name Orders \
  --item '{
    "customerId": {"S": "c-100"},
    "orderDate": {"S": "2024-06-01"},
    "total": {"N": "149.99"},
    "status": {"S": "pending"}
  }'

# Get an item
aws dynamodb get-item \
  --table-name Orders \
  --key '{"customerId": {"S": "c-100"}, "orderDate": {"S": "2024-06-01"}}' \
  --consistent-read

# Query by partition key with sort key condition
aws dynamodb query \
  --table-name Orders \
  --key-condition-expression "customerId = :cid AND orderDate >= :d" \
  --expression-attribute-values '{":cid": {"S": "c-100"}, ":d": {"S": "2024-01-01"}}'

# Update an item
aws dynamodb update-item \
  --table-name Orders \
  --key '{"customerId": {"S": "c-100"}, "orderDate": {"S": "2024-06-01"}}' \
  --update-expression "SET #s = :status" \
  --expression-attribute-names '{"#s": "status"}' \
  --expression-attribute-values '{":status": {"S": "shipped"}}'

# Delete an item
aws dynamodb delete-item \
  --table-name Orders \
  --key '{"customerId": {"S": "c-100"}, "orderDate": {"S": "2024-06-01"}}'

# Describe a table
aws dynamodb describe-table --table-name Orders

# List all tables
aws dynamodb list-tables

# Create a GSI on an existing table
aws dynamodb update-table \
  --table-name Orders \
  --attribute-definitions AttributeName=status,AttributeType=S \
  --global-secondary-index-updates '[{
    "Create": {
      "IndexName": "StatusIndex",
      "KeySchema": [
        {"AttributeName": "status", "KeyType": "HASH"},
        {"AttributeName": "orderDate", "KeyType": "RANGE"}
      ],
      "Projection": {"ProjectionType": "ALL"}
    }
  }]'
```

---

## Common Gotchas

| Gotcha | Detail |
|--------|--------|
| **Hot partition problem** | If one partition key value gets disproportionate traffic, that partition throttles even if overall table capacity is sufficient. Design keys for uniform distribution. |
| **400 KB item size limit** | If your items approach this, rethink your model. Store large blobs in S3 and keep a reference in DynamoDB. |
| **GSIs are eventually consistent** | You cannot do strongly consistent reads on a GSI. If you need consistency, query the base table. |
| **1 MB query result limit** | A single Query or Scan call returns at most 1 MB. Paginate using `LastEvaluatedKey`. |
| **FilterExpression runs AFTER read** | Filtering does not reduce RCU consumption. DynamoDB reads the data, charges you, then filters. Design your keys so the `KeyConditionExpression` does the heavy lifting. |
| **LSIs cannot be added after table creation** | Plan your LSIs upfront or just use GSIs. |
| **GSI backfill takes time** | Creating a GSI on a large table can take hours. It consumes read capacity from the base table. |
| **No cross-table joins** | This is not SQL. Model your data for your access patterns, not for normalization. |
| **Provisioned mode throttling** | If you exceed provisioned RCU/WCU, requests get throttled (HTTP 400 ProvisionedThroughputExceededException). Auto-scaling reacts in minutes, not seconds. |
| **Transactions are 2x cost** | Transactional reads cost 2 RCU per 4 KB; transactional writes cost 2 WCU per 1 KB. Use transactions only when you need atomicity. |
| **TTL deletion is not instant** | Items may persist up to 48 hours past their TTL. Do not rely on TTL for hard security boundaries -- add a filter condition in your queries. |
| **On-demand can still throttle** | On-demand mode doubles the previous peak throughput within 30 minutes. If traffic spikes from zero to millions instantly, you can still be throttled. Pre-warm with provisioned mode for known spikes (e.g., product launches). |
