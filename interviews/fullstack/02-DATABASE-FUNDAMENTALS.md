# Database Fundamentals

## Overview

Databases are the foundation of nearly every application. In full-stack interviews, your database knowledge signals whether you can design systems that are correct, performant, and maintainable. Interviewers want to see that you can choose the right storage technology, model data effectively, write efficient queries, and understand the trade-offs between different approaches.

Full-stack engineers need to know enough about databases to make informed architectural decisions, even if they do not configure replication or tune kernel parameters. The questions in this guide cover what you are most likely to encounter in interviews: schema design, query optimization, choosing between SQL and NoSQL, and working with ORMs.

---

## Core Concepts

### Relational Databases (SQL)

#### ACID Properties

```
Atomicity:
  A transaction is all-or-nothing. If any part fails,
  the entire transaction is rolled back.

  BEGIN;
    UPDATE accounts SET balance = balance - 100 WHERE id = 1;
    UPDATE accounts SET balance = balance + 100 WHERE id = 2;
  COMMIT;
  -- Either both updates happen or neither does.

Consistency:
  A transaction brings the database from one valid state
  to another. Constraints (foreign keys, checks, unique)
  are enforced at commit time.

Isolation:
  Concurrent transactions do not interfere with each other.
  The isolation level determines how strictly this is enforced.

  Isolation levels (from weakest to strongest):
  ├── Read Uncommitted  → Can read uncommitted data (dirty reads)
  ├── Read Committed    → Only reads committed data (PostgreSQL default)
  ├── Repeatable Read   → Same query returns same results within a txn
  └── Serializable      → Transactions execute as if they were sequential

Durability:
  Once committed, data survives crashes. Writes go to the
  write-ahead log (WAL) before being acknowledged.
```

#### Normalization

```
1NF (First Normal Form):
  - Each column contains atomic (indivisible) values
  - No repeating groups

  BAD:  | id | name  | phones              |
        | 1  | Alice | 555-1234, 555-5678  |

  GOOD: | id | name  |    | user_id | phone    |
        | 1  | Alice |    | 1       | 555-1234 |
                           | 1       | 555-5678 |

2NF (Second Normal Form):
  - Is in 1NF
  - Every non-key column depends on the ENTIRE primary key
  - Relevant for composite primary keys

  BAD:  | student_id | course_id | course_name | grade |
        (course_name depends only on course_id, not the full key)

  GOOD: Separate into students, courses, and enrollments tables

3NF (Third Normal Form):
  - Is in 2NF
  - No transitive dependencies (non-key depends on non-key)

  BAD:  | id | name  | zip   | city     |
        (city depends on zip, not directly on id)

  GOOD: | id | name  | zip   |    | zip   | city     |

When to denormalize:
  - Read-heavy workloads where joins are expensive
  - Reporting/analytics tables
  - Caching layers (materialized views)
  - When you need sub-millisecond read latency
```

#### Joins

```sql
-- Sample tables
-- users: id, name, email
-- orders: id, user_id, total, status
-- products: id, name, price
-- order_items: order_id, product_id, quantity

-- INNER JOIN: Only matching rows from both tables
SELECT u.name, o.id AS order_id, o.total
FROM users u
INNER JOIN orders o ON u.id = o.user_id;

-- LEFT JOIN: All rows from left table, matching from right
-- Users without orders will have NULL for order columns
SELECT u.name, COUNT(o.id) AS order_count
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
GROUP BY u.id, u.name;

-- RIGHT JOIN: All rows from right table, matching from left
-- Rarely used; equivalent to swapping tables in LEFT JOIN

-- FULL OUTER JOIN: All rows from both tables
-- NULLs where there is no match on either side
SELECT u.name, o.id
FROM users u
FULL OUTER JOIN orders o ON u.id = o.user_id;

-- CROSS JOIN: Cartesian product (every row paired with every row)
-- Useful for generating combinations
SELECT s.size, c.color
FROM sizes s
CROSS JOIN colors c;

-- Self JOIN: Table joined with itself
-- Example: Find employees and their managers
SELECT e.name AS employee, m.name AS manager
FROM employees e
LEFT JOIN employees m ON e.manager_id = m.id;

-- Multi-table JOIN
SELECT u.name, o.id AS order_id, p.name AS product, oi.quantity
FROM users u
JOIN orders o ON u.id = o.user_id
JOIN order_items oi ON o.id = oi.order_id
JOIN products p ON oi.product_id = p.id
WHERE o.status = 'completed'
ORDER BY o.created_at DESC;
```

#### Indexes

```sql
-- B-tree index (default, most common)
-- Good for: equality, range queries, sorting
CREATE INDEX idx_users_email ON users(email);

-- Unique index (also enforces constraint)
CREATE UNIQUE INDEX idx_users_email_unique ON users(email);

-- Composite index (multi-column)
-- Column order matters! Follows leftmost prefix rule.
CREATE INDEX idx_orders_user_status ON orders(user_id, status);

-- This index supports:
--   WHERE user_id = 1                    (uses index)
--   WHERE user_id = 1 AND status = 'active' (uses index)
--   WHERE status = 'active'              (does NOT use index)

-- Partial index (index subset of rows)
CREATE INDEX idx_orders_pending ON orders(created_at)
WHERE status = 'pending';
-- Smaller index, faster queries for pending orders

-- Expression index
CREATE INDEX idx_users_lower_email ON users(LOWER(email));
-- Supports: WHERE LOWER(email) = 'john@example.com'

-- GIN index (for full-text search, JSONB, arrays)
CREATE INDEX idx_products_tags ON products USING GIN(tags);
-- Supports: WHERE tags @> '{"electronics"}'

-- Covering index (INCLUDE columns to avoid table lookups)
CREATE INDEX idx_orders_user_status_cover ON orders(user_id, status)
INCLUDE (total, created_at);
-- Index-only scan: no need to fetch from table

-- When NOT to add indexes:
-- - Tables with very few rows (full scan is fast enough)
-- - Columns with low cardinality (e.g., boolean status)
-- - Write-heavy tables (indexes slow down INSERTs and UPDATEs)
-- - Columns rarely used in WHERE, JOIN, or ORDER BY
```

#### Transactions

```sql
-- Basic transaction
BEGIN;
  INSERT INTO orders (user_id, total) VALUES (1, 99.99);
  INSERT INTO order_items (order_id, product_id, quantity)
    VALUES (currval('orders_id_seq'), 42, 2);
  UPDATE products SET stock = stock - 2 WHERE id = 42;
COMMIT;

-- Transaction with error handling (PL/pgSQL)
DO $$
BEGIN
  -- Transfer money between accounts
  UPDATE accounts SET balance = balance - 100 WHERE id = 1;

  -- Check for negative balance
  IF (SELECT balance FROM accounts WHERE id = 1) < 0 THEN
    RAISE EXCEPTION 'Insufficient funds';
  END IF;

  UPDATE accounts SET balance = balance + 100 WHERE id = 2;

EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Transaction failed: %', SQLERRM;
  -- Transaction is automatically rolled back
END $$;

-- Savepoints (partial rollback)
BEGIN;
  INSERT INTO orders (user_id, total) VALUES (1, 50.00);
  SAVEPOINT order_items_save;
  INSERT INTO order_items (order_id, product_id, quantity) VALUES (1, 99, 1);
  -- Oops, product 99 does not exist
  ROLLBACK TO order_items_save;
  -- Order is still created, only order_item is rolled back
  INSERT INTO order_items (order_id, product_id, quantity) VALUES (1, 42, 1);
COMMIT;

-- Advisory locks (application-level locks)
SELECT pg_advisory_lock(123);  -- Lock with key 123
-- Do exclusive work
SELECT pg_advisory_unlock(123);

-- Row-level locking
SELECT * FROM products WHERE id = 42 FOR UPDATE;
-- This row is locked until the transaction ends
-- Other transactions trying to update this row will wait
```

### Query Optimization

#### EXPLAIN and EXPLAIN ANALYZE

```sql
-- EXPLAIN shows the query plan WITHOUT executing
EXPLAIN
SELECT u.name, COUNT(o.id)
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE u.created_at > '2025-01-01'
GROUP BY u.id, u.name;

-- Output:
-- HashAggregate  (cost=45.32..47.32 rows=200 width=40)
--   Group Key: u.id, u.name
--   ->  Hash Left Join  (cost=12.50..42.82 rows=500 width=36)
--         Hash Cond: (u.id = o.user_id)
--         ->  Seq Scan on users u  (cost=0.00..25.00 rows=200 width=36)
--               Filter: (created_at > '2025-01-01')
--         ->  Hash  (cost=10.00..10.00 rows=500 width=8)
--               ->  Seq Scan on orders o  (cost=0.00..10.00 rows=500 width=8)

-- EXPLAIN ANALYZE executes the query and shows actual times
EXPLAIN ANALYZE
SELECT * FROM products WHERE category = 'electronics' ORDER BY price;

-- Output includes actual time, rows, and loops

-- Key things to look for:
-- 1. Seq Scan on large tables → May need an index
-- 2. Nested Loop with large outer table → Consider Hash Join
-- 3. Sort with high cost → Add index on sort column
-- 4. Large difference between estimated and actual rows → Stale statistics
--    Fix: ANALYZE table_name;
```

#### Common Optimization Patterns

```sql
-- SLOW: Using functions on indexed columns
SELECT * FROM users WHERE UPPER(email) = 'JOHN@EXAMPLE.COM';
-- Fix: Create expression index or store normalized data

-- SLOW: SELECT * when you only need specific columns
SELECT * FROM orders WHERE user_id = 1;
-- Fix: Select only needed columns
SELECT id, total, status FROM orders WHERE user_id = 1;

-- SLOW: OR conditions that prevent index usage
SELECT * FROM products WHERE category = 'A' OR price < 10;
-- Fix: Use UNION
SELECT * FROM products WHERE category = 'A'
UNION ALL
SELECT * FROM products WHERE price < 10 AND category != 'A';

-- SLOW: Correlated subquery (runs once per row)
SELECT name, (SELECT COUNT(*) FROM orders WHERE user_id = users.id) AS order_count
FROM users;
-- Fix: Use JOIN with aggregation
SELECT u.name, COUNT(o.id) AS order_count
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
GROUP BY u.id, u.name;

-- SLOW: LIKE with leading wildcard
SELECT * FROM products WHERE name LIKE '%phone%';
-- Fix: Use full-text search
SELECT * FROM products WHERE to_tsvector('english', name) @@ to_tsquery('phone');

-- Pagination optimization: Avoid OFFSET on large tables
-- SLOW (scans and discards rows):
SELECT * FROM posts ORDER BY created_at DESC LIMIT 20 OFFSET 10000;

-- FAST (keyset/cursor pagination):
SELECT * FROM posts
WHERE created_at < '2025-06-15T10:30:00Z'
ORDER BY created_at DESC
LIMIT 20;
```

### NoSQL Databases

#### Types and Use Cases

```
Document Stores (MongoDB, CouchDB):
├── Store JSON-like documents
├── Flexible schema within a collection
├── Good for: Content management, user profiles, catalogs
├── Example document:
│   {
│     "_id": "abc123",
│     "name": "John",
│     "addresses": [
│       { "type": "home", "city": "NYC" },
│       { "type": "work", "city": "SF" }
│     ],
│     "orders": [...]
│   }
└── Trade-off: No joins; must denormalize or do application-level joins

Key-Value Stores (Redis, DynamoDB, Memcached):
├── Simple key → value mapping
├── Extremely fast reads and writes
├── Good for: Caching, sessions, rate limiting, leaderboards
├── Example:
│   SET user:123:session "eyJhbG..." EX 3600
│   GET user:123:session
└── Trade-off: No complex queries; must know the key

Column-Family Stores (Cassandra, HBase, ScyllaDB):
├── Optimized for write-heavy workloads
├── Data organized by column families
├── Good for: Time-series data, IoT, event logging
├── Designed for: High write throughput, linear scalability
└── Trade-off: Limited query patterns; must design around partition key

Graph Databases (Neo4j, Amazon Neptune):
├── Store nodes and relationships
├── Optimized for traversing relationships
├── Good for: Social networks, recommendation engines, fraud detection
├── Example query (Cypher):
│   MATCH (user:User)-[:FOLLOWS]->(friend:User)-[:PURCHASED]->(product:Product)
│   WHERE user.id = 123
│   RETURN DISTINCT product
└── Trade-off: Overhead for simple CRUD; not ideal for tabular data
```

#### Redis Data Structures

```
Strings:
  SET key value [EX seconds]
  GET key
  INCR counter                    → Atomic increment
  MGET key1 key2 key3             → Get multiple keys

  Use cases: Caching, counters, rate limiting, distributed locks

Lists:
  LPUSH queue "task1"             → Push to left (head)
  RPUSH queue "task2"             → Push to right (tail)
  LPOP queue                      → Pop from left
  RPOP queue                      → Pop from right
  LRANGE queue 0 -1               → Get all elements
  LLEN queue                      → Length

  Use cases: Message queues, activity feeds, recent items

Sets:
  SADD online_users "user:1"      → Add member
  SREM online_users "user:1"      → Remove member
  SISMEMBER online_users "user:1" → Check membership (O(1))
  SMEMBERS online_users           → All members
  SINTER set1 set2                → Intersection
  SUNION set1 set2                → Union

  Use cases: Tags, unique visitors, social graph (friends)

Sorted Sets:
  ZADD leaderboard 100 "alice"    → Add with score
  ZADD leaderboard 85 "bob"
  ZRANK leaderboard "alice"       → Rank (0-based)
  ZREVRANGE leaderboard 0 9      → Top 10 (descending)
  ZRANGEBYSCORE leaderboard 80 100 → Members with score 80-100

  Use cases: Leaderboards, priority queues, time-series indexes

Hashes:
  HSET user:1 name "Alice" age 30 → Set fields
  HGET user:1 name                → Get one field
  HGETALL user:1                  → Get all fields
  HINCRBY user:1 login_count 1    → Increment field

  Use cases: Object storage, user sessions, configuration

Streams (append-only log):
  XADD events * type "click" page "/home"  → Add entry
  XREAD COUNT 10 STREAMS events 0          → Read entries
  XRANGE events - +                        → Read all entries

  Use cases: Event sourcing, activity logs, message streaming
```

#### MongoDB Patterns

```javascript
// Schema design: Embedding vs Referencing

// Embedding (denormalized): Data accessed together
// Good when: Related data is always read with parent
{
  _id: ObjectId("..."),
  title: "My Blog Post",
  content: "...",
  comments: [
    { author: "Alice", text: "Great post!", createdAt: ISODate("...") },
    { author: "Bob", text: "Thanks!", createdAt: ISODate("...") }
  ]
}

// Referencing (normalized): Data accessed independently
// Good when: Related data grows unboundedly or is shared
{
  _id: ObjectId("..."),
  title: "My Blog Post",
  content: "...",
  authorId: ObjectId("...")  // Reference to users collection
}

// Aggregation pipeline (powerful query framework)
db.orders.aggregate([
  // Stage 1: Filter
  { $match: { status: "completed", createdAt: { $gte: ISODate("2025-01-01") } } },

  // Stage 2: Lookup (like SQL JOIN)
  { $lookup: {
      from: "users",
      localField: "userId",
      foreignField: "_id",
      as: "user"
    }
  },

  // Stage 3: Unwind (flatten array from lookup)
  { $unwind: "$user" },

  // Stage 4: Group (like SQL GROUP BY)
  { $group: {
      _id: "$user.name",
      totalSpent: { $sum: "$total" },
      orderCount: { $sum: 1 },
      avgOrderValue: { $avg: "$total" }
    }
  },

  // Stage 5: Sort
  { $sort: { totalSpent: -1 } },

  // Stage 6: Limit
  { $limit: 10 }
]);

// Indexes in MongoDB
db.users.createIndex({ email: 1 }, { unique: true });
db.orders.createIndex({ userId: 1, status: 1 });
db.products.createIndex({ name: "text", description: "text" }); // Full-text
db.events.createIndex({ createdAt: 1 }, { expireAfterSeconds: 86400 }); // TTL index
```

### Connection Pooling

```typescript
// Why connection pooling matters:
// Without pooling: Each request opens a new TCP connection to the database
// - TCP handshake (~1ms local, ~50ms remote)
// - TLS handshake (~30ms)
// - Authentication (~5ms)
// - Total overhead: ~35-85ms PER REQUEST

// With pooling: Reuse existing connections
// - Connection already established
// - Just grab from pool and use
// - Total overhead: ~0.1ms

// Node.js with pg (PostgreSQL)
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // Maximum connections in pool
  min: 5, // Minimum idle connections
  idleTimeoutMillis: 30000, // Close idle connections after 30s
  connectionTimeoutMillis: 5000, // Error if no connection available in 5s
  maxUses: 7500, // Close after 7500 queries (prevent memory leaks)
});

// Use pool directly (automatically manages connections)
async function getUser(id: string) {
  const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return result.rows[0] || null;
}

// Use a client for transactions (holds one connection)
async function transferMoney(fromId: string, toId: string, amount: number) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'UPDATE accounts SET balance = balance - $1 WHERE id = $2',
      [amount, fromId]
    );
    await client.query(
      'UPDATE accounts SET balance = balance + $1 WHERE id = $2',
      [amount, toId]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release(); // Return connection to pool
  }
}

// Monitor pool health
pool.on('error', (err) => {
  console.error('Unexpected pool error:', err);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await pool.end();
  process.exit(0);
});
```

### Migrations

```typescript
// Migration file naming convention:
// 001_create_users.sql
// 002_create_orders.sql
// 003_add_email_index.sql

// Migration with Knex.js
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table.string('name', 255).notNullable();
    table.string('email', 255).notNullable().unique();
    table.string('password_hash', 255).notNullable();
    table.enum('role', ['user', 'admin']).defaultTo('user');
    table.timestamps(true, true); // created_at, updated_at
  });

  await knex.schema.createTable('orders', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.decimal('total', 10, 2).notNullable();
    table
      .enum('status', ['pending', 'paid', 'shipped', 'delivered', 'cancelled'])
      .defaultTo('pending');
    table.timestamps(true, true);
    table.index(['user_id', 'status']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('orders');
  await knex.schema.dropTableIfExists('users');
}

// Migration best practices:
// 1. Always write both up() and down() functions
// 2. Never modify a migration that has been run in production
// 3. Create a new migration for changes
// 4. Test migrations against a copy of production data
// 5. Use transactions within migrations when possible
// 6. Be careful with large table alterations (can lock table)
//    - Use CREATE INDEX CONCURRENTLY in PostgreSQL
//    - Add columns as nullable first, backfill, then add NOT NULL
```

### ORMs

#### Prisma (TypeScript)

```typescript
// schema.prisma
// datasource db {
//   provider = "postgresql"
//   url      = env("DATABASE_URL")
// }
//
// model User {
//   id        String   @id @default(uuid())
//   name      String
//   email     String   @unique
//   posts     Post[]
//   createdAt DateTime @default(now())
// }
//
// model Post {
//   id        String   @id @default(uuid())
//   title     String
//   content   String
//   published Boolean  @default(false)
//   author    User     @relation(fields: [authorId], references: [id])
//   authorId  String
//   tags      Tag[]
//   createdAt DateTime @default(now())
// }

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Create with relation
async function createPost(authorId: string, title: string, content: string) {
  return prisma.post.create({
    data: {
      title,
      content,
      author: { connect: { id: authorId } },
    },
    include: { author: true },
  });
}

// Query with filtering, pagination, and includes
async function getPosts(page: number, limit: number, published?: boolean) {
  const where = published !== undefined ? { published } : {};

  const [posts, total] = await Promise.all([
    prisma.post.findMany({
      where,
      include: {
        author: { select: { id: true, name: true } },
        tags: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.post.count({ where }),
  ]);

  return { posts, total, page, limit };
}

// Transaction
async function publishPost(postId: string) {
  return prisma.$transaction(async (tx) => {
    const post = await tx.post.update({
      where: { id: postId },
      data: { published: true },
    });

    await tx.notification.create({
      data: {
        userId: post.authorId,
        message: `Your post "${post.title}" is now published`,
      },
    });

    return post;
  });
}
```

#### SQLAlchemy (Python)

```python
from sqlalchemy import create_engine, Column, String, Boolean, DateTime, ForeignKey, func
from sqlalchemy.orm import declarative_base, relationship, sessionmaker, joinedload
from datetime import datetime
import uuid

Base = declarative_base()

class User(Base):
    __tablename__ = 'users'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    posts = relationship('Post', back_populates='author', lazy='dynamic')
    created_at = Column(DateTime, default=datetime.utcnow)

class Post(Base):
    __tablename__ = 'posts'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String(255), nullable=False)
    content = Column(String, nullable=False)
    published = Column(Boolean, default=False)
    author_id = Column(String, ForeignKey('users.id'), nullable=False)
    author = relationship('User', back_populates='posts')
    created_at = Column(DateTime, default=datetime.utcnow)

# Query with eager loading (avoids N+1)
def get_posts(session, page=1, limit=20, published=None):
    query = session.query(Post).options(joinedload(Post.author))

    if published is not None:
        query = query.filter(Post.published == published)

    total = query.count()
    posts = query.order_by(Post.created_at.desc()) \
                 .offset((page - 1) * limit) \
                 .limit(limit) \
                 .all()

    return {"posts": posts, "total": total, "page": page, "limit": limit}

# Transaction
def publish_post(session, post_id):
    try:
        post = session.query(Post).filter(Post.id == post_id).first()
        if not post:
            raise ValueError("Post not found")

        post.published = True
        session.commit()
        return post
    except Exception:
        session.rollback()
        raise
```

---

## Practical Scenarios

### Scenario 1: Designing a Schema for a Multi-Tenant SaaS

```sql
-- Approach: Shared database with tenant_id on every table
-- Use Row-Level Security (RLS) in PostgreSQL for safety

CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    plan VARCHAR(50) DEFAULT 'free',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'member',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, email)  -- Email unique per tenant
);

CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    name VARCHAR(255) NOT NULL,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row-Level Security
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON projects
    USING (tenant_id = current_setting('app.tenant_id')::UUID);

-- Set tenant context at the beginning of each request
-- SET LOCAL app.tenant_id = 'tenant-uuid-here';

-- All queries automatically filtered:
-- SELECT * FROM projects; -- Only returns current tenant's projects

-- Index strategy for multi-tenant
CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_projects_tenant ON projects(tenant_id);
CREATE INDEX idx_projects_tenant_created ON projects(tenant_id, created_at DESC);
```

### Scenario 2: Handling High-Write Throughput

```
Problem: An analytics system needs to record 10,000 events per second.

Approach 1: Write-Optimized PostgreSQL
├── Use COPY or batch INSERTs (not individual INSERTs)
├── Partition tables by time range
├── Use UNLOGGED tables for staging data
├── Disable indexes during bulk loads, rebuild after

Approach 2: Write to Redis first, flush to PostgreSQL
├── Buffer events in Redis list (RPUSH)
├── Background worker batch-reads from Redis (RPOP)
├── Worker bulk-inserts into PostgreSQL every N seconds
├── Provides backpressure and burst handling

Approach 3: Use a time-series optimized store
├── TimescaleDB (PostgreSQL extension)
├── ClickHouse (column-oriented, very fast analytics)
├── InfluxDB (purpose-built for time-series)
```

```sql
-- PostgreSQL table partitioning for time-series data
CREATE TABLE events (
    id BIGINT GENERATED ALWAYS AS IDENTITY,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- Create monthly partitions
CREATE TABLE events_2025_01 PARTITION OF events
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

CREATE TABLE events_2025_02 PARTITION OF events
    FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');

-- Queries automatically target the right partition:
SELECT * FROM events
WHERE created_at >= '2025-01-15' AND created_at < '2025-01-16';
-- Only scans events_2025_01, not the entire table

-- Batch INSERT for performance
INSERT INTO events (event_type, payload, created_at) VALUES
  ('page_view', '{"page": "/home"}', '2025-01-15 10:00:00'),
  ('page_view', '{"page": "/about"}', '2025-01-15 10:00:01'),
  ('click', '{"element": "cta-button"}', '2025-01-15 10:00:02');
-- Batch of 1000 rows: ~10ms
-- 1000 individual INSERTs: ~500ms
```

### Scenario 3: Choosing Between PostgreSQL and MongoDB

```
Choose PostgreSQL when:
├── Data has clear relationships (users, orders, products)
├── You need complex queries (joins, aggregations, window functions)
├── ACID transactions are critical (financial data)
├── You need full-text search (built-in tsvector)
├── You want JSONB for flexible fields AND relational for structured
├── Your team knows SQL
└── You want a battle-tested, single database solution

Choose MongoDB when:
├── Schema changes frequently (rapid prototyping)
├── Data is naturally document-shaped (CMS, product catalogs)
├── You need to store deeply nested or variable structures
├── Horizontal scaling (sharding) is needed from day one
├── Your team prefers working with objects over SQL
└── Write-heavy workloads with eventual consistency acceptable

Hybrid approach (common in practice):
├── PostgreSQL for transactional data (users, orders, payments)
├── MongoDB for content (articles, product descriptions)
├── Redis for caching and sessions
└── Elasticsearch for search
```

---

## Interview Questions

### Q1: "Explain the difference between a clustered and non-clustered index."

```
Clustered Index:
- Determines the physical order of data on disk
- Only ONE per table (because data can only be sorted one way)
- In PostgreSQL, the primary key is effectively the clustered index
- Very fast for range queries on the clustered column
- Example: Primary key on an auto-incrementing ID
  - Rows are physically stored in ID order
  - SELECT * FROM orders WHERE id BETWEEN 100 AND 200
    → Sequential disk read (very fast)

Non-Clustered Index:
- A separate structure that points to data locations
- Multiple non-clustered indexes per table
- Contains: indexed column values + pointers to actual rows
- Extra lookup needed: index → pointer → data (called a "bookmark lookup")
- Example: Index on email column
  - Index stores (email, row_pointer) sorted by email
  - Finding by email: search index → follow pointer → read row

Covering Index (optimization):
- A non-clustered index that includes all columns needed by a query
- Eliminates the bookmark lookup entirely
- CREATE INDEX idx_cover ON orders(user_id) INCLUDE (total, status)
- Query: SELECT total, status FROM orders WHERE user_id = 1
  → Answered entirely from the index (index-only scan)
```

### Q2: "How would you handle the N+1 query problem?"

```
The N+1 problem: Fetching a list requires 1 query for the list,
then N additional queries for each item's related data.

Example:
  # 1 query to get all users
  users = User.findAll()

  # N queries to get each user's posts
  for user in users:
      posts = Post.findByUserId(user.id)  # One query per user

Solutions by layer:

ORM level:
  Prisma:  include: { posts: true }      → Generates JOIN or IN query
  Django:  User.objects.prefetch_related('posts')  → 2 queries total
  SQLAlchemy: joinedload(User.posts)     → JOIN query

SQL level:
  -- JOIN approach (1 query, may return duplicate user data)
  SELECT u.*, p.* FROM users u LEFT JOIN posts p ON u.id = p.user_id

  -- Subquery approach (2 queries, cleaner data)
  SELECT * FROM users
  SELECT * FROM posts WHERE user_id IN (1, 2, 3, ..., 20)

GraphQL level:
  DataLoader batches individual loads into a single batch query.
  See the API Design guide for DataLoader implementation.

Detection:
  - Enable query logging in development
  - Use tools like pgBadger or query analyzers
  - Look for repeated queries with different parameters
  - Set up alerts for endpoints that exceed N queries
```

### Q3: "When would you denormalize your database?"

```
Denormalize when:
1. Read performance is critical and joins are expensive
   - Dashboard showing user stats from 5 tables
   - Denormalize into a materialized view or summary table

2. Data is read far more often than written
   - Product catalog with category names
   - Store category_name directly on product instead of joining

3. Reporting and analytics
   - Star schema / snowflake schema for data warehouses
   - Pre-computed aggregates for dashboards

4. Reducing query complexity
   - Storing a user's display_name on comments
   - Avoids joining users table for every comment list

How to denormalize safely:
1. Use materialized views (PostgreSQL)
   CREATE MATERIALIZED VIEW order_summary AS
   SELECT u.name, COUNT(o.id) as order_count, SUM(o.total) as total_spent
   FROM users u LEFT JOIN orders o ON u.id = o.user_id
   GROUP BY u.id, u.name;

   REFRESH MATERIALIZED VIEW CONCURRENTLY order_summary;

2. Use application-level sync
   - When order is created, update user's order_count and total_spent
   - Use database triggers or application events
   - Accept that denormalized data may be slightly stale

3. Use a read replica or CQRS pattern
   - Writes go to normalized database
   - Reads come from denormalized read store
   - Sync via change data capture (Debezium) or events

Risks of denormalization:
- Data inconsistency (main risk)
- More complex write logic
- Harder to maintain
- Storage overhead
```

### Q4: "Explain database sharding and when you would use it."

```
Sharding: Splitting data across multiple database servers.
Each shard holds a subset of the data.

When to consider sharding:
- Single database cannot handle the write volume
- Dataset exceeds single server storage capacity
- Need to reduce query latency by keeping data close to users
- Typically needed above 1-10 TB of data or thousands of writes/sec

Sharding strategies:

1. Range-based sharding:
   Shard 1: user_id 1-1,000,000
   Shard 2: user_id 1,000,001-2,000,000
   Pro: Simple to implement
   Con: Hotspots (new users all go to latest shard)

2. Hash-based sharding:
   shard = hash(user_id) % num_shards
   Pro: Even distribution
   Con: Hard to add/remove shards (requires resharding)

3. Geographic sharding:
   Shard US: Users in North America
   Shard EU: Users in Europe
   Pro: Lower latency for users
   Con: Cross-region queries are expensive

4. Directory-based sharding:
   Lookup table maps each entity to its shard
   Pro: Flexible, easy to rebalance
   Con: Lookup table is a single point of failure

Challenges:
├── Cross-shard queries (joins across shards)
├── Distributed transactions
├── Rebalancing when adding shards
├── Maintaining referential integrity
├── Operational complexity (backups, migrations)

Before sharding, try:
├── Read replicas (for read scaling)
├── Caching (Redis, Memcached)
├── Query optimization (indexes, query rewriting)
├── Vertical scaling (bigger server)
├── Table partitioning (within single server)
└── Connection pooling (PgBouncer)
```

### Q5: "How do you choose between SQL and NoSQL for a new project?"

```
Decision framework:

1. What does the data look like?
   ├── Clear entities with relationships → SQL
   ├── Deeply nested, variable structure → Document DB
   ├── Simple key-value lookups → Key-value store
   ├── Highly connected data → Graph DB
   └── Time-series/event data → Time-series DB

2. What are the consistency requirements?
   ├── Strong consistency needed (finance) → SQL
   ├── Eventual consistency acceptable → NoSQL (usually faster writes)
   └── Mix of both → SQL for critical data, NoSQL for others

3. What are the scale requirements?
   ├── Moderate scale (<1TB, <10k req/sec) → SQL handles this fine
   ├── Massive scale, mostly reads → SQL with read replicas + cache
   ├── Massive write scale → NoSQL (Cassandra, DynamoDB)
   └── Unpredictable scale → DynamoDB (auto-scaling)

4. What does the team know?
   ├── Team knows SQL → Use SQL (productivity > performance)
   ├── Team is polyglot → Choose based on data characteristics
   └── Team is small → Minimize databases (operational burden)

5. How flexible must the schema be?
   ├── Schema is well-defined → SQL
   ├── Schema evolves frequently → Document DB
   ├── Mix → SQL with JSONB columns (PostgreSQL)
   └── Unknown at start → Start with PostgreSQL (JSONB is powerful)

Real-world answer:
"For most applications, PostgreSQL is the right default choice.
It handles relational data, has JSONB for flexible data, supports
full-text search, and scales well to millions of rows. I would add
Redis for caching and sessions. I would only introduce MongoDB or
other NoSQL databases when there is a specific use case that
PostgreSQL does not serve well."
```

### Q6: "Walk me through how you would debug a slow database query."

```
Step-by-step debugging process:

1. Identify the slow query
   - Check slow query log (PostgreSQL: log_min_duration_statement)
   - Check application performance monitoring (APM)
   - Use pg_stat_statements to find frequently slow queries

2. Run EXPLAIN ANALYZE
   EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
   SELECT ... (your slow query here);

3. Look for red flags in the plan:
   ├── Seq Scan on large table → Missing index
   ├── Nested Loop with large outer → Try Hash Join
   ├── Sort with high cost → Index on sort column
   ├── Bitmap Heap Scan with many recheck → Increase work_mem
   ├── High actual rows vs estimated → Run ANALYZE
   └── Temp files written → Increase work_mem

4. Check index usage:
   SELECT * FROM pg_stat_user_indexes
   WHERE relname = 'your_table'
   ORDER BY idx_scan;
   -- If idx_scan is 0, the index is never used

5. Common fixes:
   a. Add missing index
   b. Rewrite query to use existing indexes
   c. Add LIMIT for pagination
   d. Replace correlated subquery with JOIN
   e. Use partial index for frequently filtered subsets
   f. Materialize expensive joins into a view

6. After fixing:
   - Verify with EXPLAIN ANALYZE again
   - Compare execution time before and after
   - Test with production-like data volume
   - Monitor in production after deployment
```

---

## Code Examples

### Full Database Setup with TypeScript (Prisma)

```typescript
// prisma/schema.prisma
// generator client {
//   provider = "prisma-client-js"
// }
//
// datasource db {
//   provider = "postgresql"
//   url      = env("DATABASE_URL")
// }
//
// model User {
//   id        String   @id @default(uuid())
//   email     String   @unique
//   name      String
//   role      Role     @default(USER)
//   posts     Post[]
//   comments  Comment[]
//   createdAt DateTime @default(now())
//   updatedAt DateTime @updatedAt
//
//   @@index([email])
//   @@index([createdAt])
// }
//
// model Post {
//   id          String    @id @default(uuid())
//   title       String
//   content     String
//   slug        String    @unique
//   published   Boolean   @default(false)
//   publishedAt DateTime?
//   author      User      @relation(fields: [authorId], references: [id])
//   authorId    String
//   comments    Comment[]
//   tags        Tag[]
//   createdAt   DateTime  @default(now())
//   updatedAt   DateTime  @updatedAt
//
//   @@index([slug])
//   @@index([authorId, published])
//   @@index([createdAt])
// }
//
// model Comment {
//   id        String   @id @default(uuid())
//   content   String
//   author    User     @relation(fields: [authorId], references: [id])
//   authorId  String
//   post      Post     @relation(fields: [postId], references: [id], onDelete: Cascade)
//   postId    String
//   createdAt DateTime @default(now())
//
//   @@index([postId, createdAt])
// }
//
// model Tag {
//   id    String @id @default(uuid())
//   name  String @unique
//   posts Post[]
// }
//
// enum Role {
//   USER
//   ADMIN
// }

// Repository pattern with Prisma
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient({
  log:
    process.env.NODE_ENV === 'development'
      ? ['query', 'error', 'warn']
      : ['error'],
});

interface PostFilters {
  published?: boolean;
  authorId?: string;
  tag?: string;
  search?: string;
}

interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

async function findPosts(filters: PostFilters, pagination: PaginationParams) {
  const where: Prisma.PostWhereInput = {};

  if (filters.published !== undefined) {
    where.published = filters.published;
  }

  if (filters.authorId) {
    where.authorId = filters.authorId;
  }

  if (filters.tag) {
    where.tags = { some: { name: filters.tag } };
  }

  if (filters.search) {
    where.OR = [
      { title: { contains: filters.search, mode: 'insensitive' } },
      { content: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  const orderBy: Prisma.PostOrderByWithRelationInput = {};
  const sortField = pagination.sortBy || 'createdAt';
  const sortDir = pagination.sortOrder || 'desc';
  orderBy[sortField as keyof Prisma.PostOrderByWithRelationInput] = sortDir;

  const [posts, total] = await Promise.all([
    prisma.post.findMany({
      where,
      include: {
        author: { select: { id: true, name: true } },
        tags: { select: { id: true, name: true } },
        _count: { select: { comments: true } },
      },
      orderBy,
      skip: (pagination.page - 1) * pagination.limit,
      take: pagination.limit,
    }),
    prisma.post.count({ where }),
  ]);

  return {
    data: posts,
    meta: {
      total,
      page: pagination.page,
      limit: pagination.limit,
      totalPages: Math.ceil(total / pagination.limit),
    },
  };
}
```

### Redis Caching Layer

```typescript
// lib/cache.ts
import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

interface CacheOptions {
  ttl?: number; // Time to live in seconds
  prefix?: string;
}

async function cacheGet<T>(
  key: string,
  options: CacheOptions = {}
): Promise<T | null> {
  const fullKey = options.prefix ? `${options.prefix}:${key}` : key;
  const cached = await redis.get(fullKey);

  if (cached === null) {
    return null;
  }

  try {
    return JSON.parse(cached) as T;
  } catch {
    return null;
  }
}

async function cacheSet<T>(
  key: string,
  value: T,
  options: CacheOptions = {}
): Promise<void> {
  const fullKey = options.prefix ? `${options.prefix}:${key}` : key;
  const serialized = JSON.stringify(value);
  const ttl = options.ttl || 300; // Default 5 minutes

  await redis.set(fullKey, serialized, 'EX', ttl);
}

async function cacheDelete(
  key: string,
  options: CacheOptions = {}
): Promise<void> {
  const fullKey = options.prefix ? `${options.prefix}:${key}` : key;
  await redis.del(fullKey);
}

async function cacheDeletePattern(pattern: string): Promise<void> {
  const keys = await redis.keys(pattern);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

// Cache-aside pattern (most common)
async function getWithCache<T>(
  key: string,
  fetchFn: () => Promise<T>,
  options: CacheOptions = {}
): Promise<T> {
  // Try cache first
  const cached = await cacheGet<T>(key, options);
  if (cached !== null) {
    return cached;
  }

  // Cache miss: fetch from source
  const data = await fetchFn();

  // Store in cache
  await cacheSet(key, data, options);

  return data;
}

// Usage in API route
async function getPost(postId: string) {
  return getWithCache(
    `post:${postId}`,
    async () => {
      const post = await prisma.post.findUnique({
        where: { id: postId },
        include: { author: true, tags: true },
      });

      if (!post) {
        throw new Error('Post not found');
      }

      return post;
    },
    { ttl: 600, prefix: 'cache' }
  );
}

// Cache invalidation on write
async function updatePost(postId: string, data: UpdatePostInput) {
  const post = await prisma.post.update({
    where: { id: postId },
    data,
  });

  // Invalidate specific cache entry
  await cacheDelete(`post:${postId}`, { prefix: 'cache' });

  // Invalidate list caches that might contain this post
  await cacheDeletePattern('cache:posts:*');

  return post;
}
```

---

## Quick Reference

### SQL Cheat Sheet

```sql
-- Aggregations
SELECT status, COUNT(*), AVG(total), SUM(total), MIN(total), MAX(total)
FROM orders GROUP BY status HAVING COUNT(*) > 10;

-- Window functions
SELECT name, salary,
  RANK() OVER (ORDER BY salary DESC) as rank,
  salary - LAG(salary) OVER (ORDER BY salary DESC) as diff_from_prev,
  SUM(salary) OVER () as total_salary,
  ROUND(salary * 100.0 / SUM(salary) OVER (), 2) as pct_of_total
FROM employees;

-- Common Table Expressions (CTE)
WITH monthly_revenue AS (
  SELECT DATE_TRUNC('month', created_at) AS month, SUM(total) AS revenue
  FROM orders WHERE status = 'paid'
  GROUP BY DATE_TRUNC('month', created_at)
)
SELECT month, revenue,
  revenue - LAG(revenue) OVER (ORDER BY month) AS growth
FROM monthly_revenue;

-- Upsert (INSERT ... ON CONFLICT)
INSERT INTO users (email, name) VALUES ('john@example.com', 'John')
ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name;

-- JSONB queries (PostgreSQL)
SELECT * FROM products WHERE metadata->>'color' = 'red';
SELECT * FROM products WHERE metadata @> '{"tags": ["sale"]}';
```

### Database Selection Guide

```
Workload Type          → Best Choice
─────────────────────────────────────
CRUD app               → PostgreSQL
E-commerce             → PostgreSQL
CMS / Blog             → PostgreSQL or MongoDB
Real-time analytics    → ClickHouse, TimescaleDB
Session storage        → Redis
Job queue              → Redis, PostgreSQL
Full-text search       → Elasticsearch, PostgreSQL
Social graph           → Neo4j, PostgreSQL
IoT / time-series      → TimescaleDB, InfluxDB
Cache                  → Redis, Memcached
File metadata          → PostgreSQL, MongoDB
Chat / messaging       → Cassandra, ScyllaDB
Config / feature flags → Redis, PostgreSQL
```

### Index Strategy Guide

```
Query Pattern                    → Index Type
─────────────────────────────────────────────
WHERE col = value                → B-tree (default)
WHERE col > value                → B-tree
WHERE col LIKE 'prefix%'        → B-tree
WHERE col LIKE '%suffix'        → GIN (trigram) or full-text
WHERE col IN (...)               → B-tree
WHERE col @> '{value}'          → GIN (array/JSONB)
WHERE to_tsvector(...) @@ ...   → GIN (full-text search)
ORDER BY col                     → B-tree on sort column
GROUP BY col                     → B-tree (may help)
WHERE col1 = ? AND col2 = ?     → Composite B-tree (col1, col2)
Point-in-radius geospatial      → GiST or SP-GiST
```
