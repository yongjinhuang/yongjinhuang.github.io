# Cloudflare D1 Database

D1 is Cloudflare's serverless SQLite database, designed to run at the edge alongside Workers. It provides a familiar SQL interface with automatic replication and zero configuration. Think of it as "SQLite as a managed service at the edge."

---

## Table of Contents

1. [What Is D1?](#what-is-d1)
2. [Architecture](#architecture)
3. [Usage with Workers](#usage-with-workers)
4. [Replication and Consistency](#replication-and-consistency)
5. [Limitations](#limitations)
6. [When to Use D1](#when-to-use-d1)
7. [Comparison with Other Databases](#comparison-with-other-databases)
8. [Common Interview Questions](#common-interview-questions)

---

## What Is D1?

D1 takes SQLite -- the most deployed database in the world -- and makes it available as a managed service in Cloudflare's edge network.

```
Traditional database:
  Worker (edge, Tokyo) ----network----> PostgreSQL (us-east-1)
  Latency: 150-300ms per query

D1:
  Worker (edge, Tokyo) ----local----> D1 read replica (Tokyo)
  Latency: <5ms for reads
```

### Key Properties

| Property | Details |
| -------- | ------- |
| **Engine** | SQLite (full SQL support) |
| **API** | SQL via Workers binding |
| **Read latency** | <5ms (from edge read replica) |
| **Write latency** | Higher (must reach primary) |
| **Max DB size** | 10 GB |
| **Max databases** | 50,000 per account |
| **Pricing** | Free tier: 5M reads/day, 100K writes/day |
| **Backups** | Automatic, point-in-time recovery |

---

## Architecture

```
+----------------------------------------------------------+
|                    D1 Database                             |
|                                                           |
|  Primary (single region - auto-selected)                  |
|  +------------------+                                     |
|  | SQLite Primary   |  <-- All writes go here             |
|  | (durable, WAL)   |                                     |
|  +------------------+                                     |
|         |                                                  |
|         v (async replication)                              |
|  Read Replicas (global, at edge)                          |
|  +--------+  +--------+  +--------+  +--------+          |
|  | Tokyo  |  | London |  | NYC    |  | Sydney |          |
|  | replica|  | replica|  | replica|  | replica|          |
|  +--------+  +--------+  +--------+  +--------+          |
|                                                           |
+----------------------------------------------------------+
```

### Write Path

```
Worker (Tokyo) -> Write request -> D1 Primary (auto-region)
                                   -> WAL commit
                                   -> Async replicate to edge
                                   -> Return result to Worker
```

### Read Path

```
Worker (Tokyo) -> Read request -> D1 Read Replica (Tokyo)
                                   -> Local SQLite query
                                   -> Return result (<5ms)
```

---

## Usage with Workers

```javascript
export default {
  async fetch(request, env) {
    // Simple query
    const { results } = await env.DB.prepare(
      "SELECT * FROM users WHERE id = ?"
    ).bind(1).all();

    // Insert
    await env.DB.prepare(
      "INSERT INTO users (name, email) VALUES (?, ?)"
    ).bind("Alice", "alice@example.com").run();

    // Batch (multiple statements in one round-trip)
    const results = await env.DB.batch([
      env.DB.prepare("INSERT INTO orders (user_id, total) VALUES (?, ?)").bind(1, 99.99),
      env.DB.prepare("UPDATE users SET order_count = order_count + 1 WHERE id = ?").bind(1),
    ]);

    // First result
    const user = await env.DB.prepare(
      "SELECT * FROM users WHERE email = ?"
    ).bind("alice@example.com").first();

    // Raw (multiple statements, no bindings -- use with caution)
    const raw = await env.DB.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `);

    return Response.json(results);
  },
};
```

### Query Methods

| Method | Returns | Use Case |
| ------ | ------- | -------- |
| `.all()` | `{ results, meta }` | Multiple rows |
| `.first()` | Single object or null | Single row lookup |
| `.run()` | `{ meta }` (no results) | INSERT/UPDATE/DELETE |
| `.raw()` | Array of arrays | Raw column values |
| `.batch([])` | Array of results | Multiple queries in one round-trip |

---

## Replication and Consistency

| Operation | Consistency | Latency |
| --------- | ----------- | ------- |
| **Read** | Eventually consistent (from nearest replica) | <5ms |
| **Write** | Strongly consistent (at primary) | 50-200ms |
| **Read-after-write** | Session consistent (same Worker invocation) | <5ms |
| **Batch** | Atomic (all-or-nothing at primary) | 50-200ms |

**Session consistency:** Within the same Worker request, reads after writes will see the written data. Across different requests, there may be replication lag.

---

## Limitations

| Limitation | Details |
| ---------- | ------- |
| **Max DB size** | 10 GB |
| **Max row size** | 1 MB (SQLite limit) |
| **Max rows per query** | 5,000 (configurable) |
| **Concurrent writes** | Serialized at primary (SQLite WAL mode) |
| **No JOINs across DBs** | Each D1 database is independent |
| **No stored procedures** | SQLite does not support stored procedures |
| **No extensions** | Cannot load SQLite extensions (e.g., FTS5 is built-in) |
| **No streaming results** | Entire result set loaded into memory |

### SQLite-Specific Considerations

- **Type affinity** -- SQLite is dynamically typed (columns suggest types but don't enforce)
- **No ENUM type** -- Use CHECK constraints instead
- **No ALTER COLUMN** -- Must recreate table to change column type
- **Single-writer** -- SQLite allows one writer at a time (WAL mode improves concurrency for reads)

---

## When to Use D1

### Good Fit

| Use Case | Why |
| -------- | --- |
| **Edge-first applications** | Low-latency reads from nearest PoP |
| **Small-medium datasets** | <10 GB fits well |
| **Read-heavy workloads** | Replicas at every edge PoP |
| **Simple schemas** | Standard SQL, familiar to everyone |
| **Serverless full-stack** | Pairs naturally with Workers + R2 |
| **Multi-tenant** | One D1 database per tenant (up to 50K DBs) |

### Poor Fit

| Use Case | Use Instead |
| -------- | ----------- |
| **Large datasets (>10 GB)** | PostgreSQL, MySQL |
| **Write-heavy workloads** | PostgreSQL (concurrent writers) |
| **Complex queries/JOINs** | PostgreSQL |
| **Full-text search** | Elasticsearch (D1 has basic FTS5) |
| **Global strong consistency** | Spanner, CockroachDB |
| **Real-time updates** | Durable Objects |

---

## Comparison with Other Databases

| Feature | D1 | Supabase (Postgres) | PlanetScale (MySQL) | DynamoDB |
| ------- | -- | ------------------- | ------------------- | -------- |
| **Engine** | SQLite | PostgreSQL | MySQL (Vitess) | NoSQL |
| **Max size** | 10 GB | 8 GB (free) - 500 GB | 5 GB (free) - unlimited | Unlimited |
| **Edge reads** | Yes (replicas at edge) | No (single region) | No (single region) | No (single region) |
| **Consistency** | Eventual reads, strong writes | Strong | Strong | Eventual or strong |
| **Pricing** | Free tier generous | Free tier, then per-usage | Free tier, then per-row | Per RCU/WCU |
| **SQL** | SQLite SQL | Full PostgreSQL | MySQL | No (DynamoDB API) |
| **Workers integration** | Native binding | HTTP/TCP (Hyperdrive) | HTTP | HTTP |
| **Serverless** | Yes | Yes | Yes | Yes |

---

## Common Interview Questions

1. **What is D1 and how does it differ from a traditional database?** D1 is managed SQLite at the edge. Reads come from replicas at each Cloudflare PoP (<5ms). Writes go to a single primary. Unlike traditional databases, there's no connection management -- Workers access D1 via a direct binding.

2. **When would you use D1 vs Hyperdrive?** D1 for new databases that fit in 10 GB and are read-heavy. Hyperdrive for existing PostgreSQL/MySQL databases that you can't migrate -- it provides connection pooling and query caching at the edge.

3. **What are D1's consistency guarantees?** Reads are eventually consistent (served from nearest replica). Writes are strongly consistent (serialized at primary). Within the same Worker request, reads after writes are session-consistent.

4. **Can D1 replace PostgreSQL?** For small, read-heavy workloads at the edge, yes. For large datasets, write-heavy workloads, complex queries, or when you need PostgreSQL extensions (PostGIS, pgvector), no.

5. **How does D1 handle concurrent writes?** SQLite uses WAL (Write-Ahead Logging) mode with a single writer. Writes are serialized at the primary. This is fine for moderate write volumes but becomes a bottleneck for write-heavy workloads.
