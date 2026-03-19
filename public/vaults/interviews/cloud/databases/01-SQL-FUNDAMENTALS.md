# SQL Fundamentals for Backend Engineers

SQL is the lingua franca of data. Even if you work with ORMs daily, interviews will test your ability to write raw SQL, optimize queries, and reason about execution plans. This guide covers what you need beyond `SELECT * FROM`.

---

## Table of Contents

1. [Joins](#joins)
2. [Subqueries and CTEs](#subqueries-and-ctes)
3. [Window Functions](#window-functions)
4. [Aggregation and Grouping](#aggregation-and-grouping)
5. [Indexing Strategies](#indexing-strategies)
6. [EXPLAIN and Query Optimization](#explain-and-query-optimization)
7. [Normalization](#normalization)
8. [ACID Properties](#acid-properties)
9. [Transactions and Isolation Levels](#transactions-and-isolation-levels)
10. [Common Interview Questions](#common-interview-questions)

---

## Joins

```
INNER JOIN       LEFT JOIN        RIGHT JOIN       FULL OUTER JOIN    CROSS JOIN
+---------+      +---------+      +---------+      +---------+        Every row in A
| A ∩ B   |      | A + A∩B |      | A∩B + B |      | A + A∩B + B|     × every row in B
+---------+      +---------+      +---------+      +---------+
```

### Join Types

```sql
-- INNER JOIN: only matching rows
SELECT o.id, c.name
FROM orders o
INNER JOIN customers c ON o.customer_id = c.id;

-- LEFT JOIN: all from left + matches from right (NULL if no match)
SELECT c.name, COUNT(o.id) AS order_count
FROM customers c
LEFT JOIN orders o ON c.id = o.customer_id
GROUP BY c.name;

-- SELF JOIN: table joined to itself (e.g., employee-manager)
SELECT e.name AS employee, m.name AS manager
FROM employees e
LEFT JOIN employees m ON e.manager_id = m.id;

-- CROSS JOIN: cartesian product (use for generating combinations)
SELECT s.size, c.color
FROM sizes s
CROSS JOIN colors c;
```

### Join Performance

| Pattern                      | Risk                                  | Fix                            |
| ---------------------------- | ------------------------------------- | ------------------------------ |
| JOIN on non-indexed column   | Full table scan                       | Add index on join column       |
| JOIN returning too many rows | Memory pressure                       | Add WHERE filters before JOIN  |
| Multiple JOINs in chain      | Exponential row explosion             | Check cardinality at each step |
| Implicit join (WHERE clause) | Hard to read, easy to miss conditions | Use explicit JOIN syntax       |

---

## Subqueries and CTEs

### Subqueries

```sql
-- Scalar subquery (returns single value)
SELECT name, salary,
       (SELECT AVG(salary) FROM employees) AS avg_salary
FROM employees;

-- IN subquery
SELECT * FROM orders
WHERE customer_id IN (
    SELECT id FROM customers WHERE country = 'US'
);

-- EXISTS (usually faster than IN for large sets)
SELECT * FROM customers c
WHERE EXISTS (
    SELECT 1 FROM orders o WHERE o.customer_id = c.id
);

-- Correlated subquery (runs once per outer row -- expensive!)
SELECT e.name, e.salary,
       (SELECT COUNT(*) FROM employees e2 WHERE e2.salary > e.salary) AS rank
FROM employees e;
```

### Common Table Expressions (CTEs)

CTEs make complex queries readable and composable.

```sql
-- Basic CTE
WITH active_customers AS (
    SELECT customer_id, COUNT(*) AS order_count
    FROM orders
    WHERE created_at > NOW() - INTERVAL '30 days'
    GROUP BY customer_id
)
SELECT c.name, ac.order_count
FROM customers c
JOIN active_customers ac ON c.id = ac.customer_id
WHERE ac.order_count > 5;

-- Recursive CTE (org chart traversal)
WITH RECURSIVE org_tree AS (
    -- Base case: top-level managers
    SELECT id, name, manager_id, 1 AS depth
    FROM employees
    WHERE manager_id IS NULL

    UNION ALL

    -- Recursive case: employees under current level
    SELECT e.id, e.name, e.manager_id, ot.depth + 1
    FROM employees e
    JOIN org_tree ot ON e.manager_id = ot.id
)
SELECT * FROM org_tree ORDER BY depth, name;
```

**CTE vs Subquery:** CTEs are not always faster -- in PostgreSQL, CTEs before v12 were optimization fences (materialized by default). From v12+, the optimizer can inline them. In MySQL 8.0+, CTEs can be inlined. Always check the execution plan.

---

## Window Functions

Window functions compute values across rows related to the current row without collapsing them (unlike GROUP BY).

```sql
-- Syntax
function_name() OVER (
    [PARTITION BY column]
    [ORDER BY column]
    [ROWS/RANGE frame_spec]
)
```

### Essential Window Functions

```sql
-- ROW_NUMBER: unique sequential number per partition
SELECT name, department, salary,
       ROW_NUMBER() OVER (PARTITION BY department ORDER BY salary DESC) AS rank
FROM employees;

-- RANK vs DENSE_RANK
-- RANK: 1, 2, 2, 4 (gaps after ties)
-- DENSE_RANK: 1, 2, 2, 3 (no gaps)

-- LAG / LEAD: access previous/next row
SELECT date, revenue,
       revenue - LAG(revenue) OVER (ORDER BY date) AS day_over_day_change
FROM daily_metrics;

-- Running total
SELECT date, amount,
       SUM(amount) OVER (ORDER BY date ROWS UNBOUNDED PRECEDING) AS running_total
FROM transactions;

-- Moving average (last 7 rows)
SELECT date, value,
       AVG(value) OVER (ORDER BY date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS moving_avg_7d
FROM metrics;

-- Percentile / distribution
SELECT name, salary,
       PERCENT_RANK() OVER (ORDER BY salary) AS percentile,
       NTILE(4) OVER (ORDER BY salary) AS quartile
FROM employees;
```

### Frame Specification

```
ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW    -- default for ORDER BY
ROWS BETWEEN 3 PRECEDING AND 3 FOLLOWING             -- sliding window of 7
ROWS BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING      -- current to end
RANGE BETWEEN INTERVAL '7 days' PRECEDING AND CURRENT ROW  -- time-based window
```

---

## Aggregation and Grouping

```sql
-- HAVING: filter after aggregation
SELECT department, AVG(salary) AS avg_salary
FROM employees
GROUP BY department
HAVING AVG(salary) > 100000;

-- GROUPING SETS: multiple groupings in one query
SELECT department, job_title, COUNT(*)
FROM employees
GROUP BY GROUPING SETS (
    (department, job_title),  -- group by both
    (department),             -- subtotal by department
    ()                        -- grand total
);

-- ROLLUP: hierarchical subtotals
SELECT year, quarter, SUM(revenue)
FROM sales
GROUP BY ROLLUP (year, quarter);
-- Produces: (year, quarter), (year), ()

-- CUBE: all combinations
SELECT department, location, COUNT(*)
FROM employees
GROUP BY CUBE (department, location);
```

---

## Indexing Strategies

### Index Types

| Type       | Structure               | Best For                                  | Example                                           |
| ---------- | ----------------------- | ----------------------------------------- | ------------------------------------------------- |
| **B-tree** | Balanced tree           | Equality, range, ORDER BY, LIKE 'prefix%' | `CREATE INDEX idx ON users(email)`                |
| **Hash**   | Hash table              | Equality only                             | `CREATE INDEX idx ON users USING hash(id)`        |
| **GIN**    | Generalized Inverted    | Arrays, JSONB, full-text                  | `CREATE INDEX idx ON docs USING gin(tags)`        |
| **GiST**   | Generalized Search Tree | Geometric, range types, nearest-neighbor  | `CREATE INDEX idx ON places USING gist(location)` |
| **BRIN**   | Block Range             | Large sorted tables (timestamps)          | `CREATE INDEX idx ON logs USING brin(created_at)` |

### Composite Index Rules

```sql
-- Index on (a, b, c) can satisfy:
-- WHERE a = 1                      ✓ (leftmost prefix)
-- WHERE a = 1 AND b = 2            ✓
-- WHERE a = 1 AND b = 2 AND c = 3  ✓
-- WHERE b = 2                      ✗ (skips leftmost)
-- WHERE a = 1 AND c = 3            △ (uses a, skips to c)

-- The "leftmost prefix" rule
CREATE INDEX idx_composite ON orders(customer_id, status, created_at);
```

### Index Anti-Patterns

```sql
-- Function on indexed column defeats index
WHERE LOWER(email) = 'user@example.com'  -- ✗ full scan
WHERE email = 'user@example.com'         -- ✓ uses index

-- Fix: functional index
CREATE INDEX idx_email_lower ON users(LOWER(email));

-- OR conditions may not use index efficiently
WHERE status = 'active' OR status = 'pending'  -- may not use index
WHERE status IN ('active', 'pending')          -- better, can use index

-- Negation often skips index
WHERE status != 'deleted'  -- may scan entire index
WHERE status IN ('active', 'pending', 'completed')  -- explicit list
```

### Covering Index (Index-Only Scan)

```sql
-- If the index contains all columns needed, DB skips the table lookup
CREATE INDEX idx_covering ON orders(customer_id, status) INCLUDE (total);

-- This query can be satisfied entirely from the index:
SELECT status, total FROM orders WHERE customer_id = 123;
```

---

## EXPLAIN and Query Optimization

### Reading EXPLAIN Output

```sql
EXPLAIN ANALYZE
SELECT c.name, COUNT(o.id)
FROM customers c
JOIN orders o ON c.id = o.customer_id
WHERE o.created_at > '2024-01-01'
GROUP BY c.name;
```

Key metrics to watch:

| Metric              | What It Means                  | Red Flag                            |
| ------------------- | ------------------------------ | ----------------------------------- |
| **Seq Scan**        | Full table scan                | On large tables without filter      |
| **Index Scan**      | Using index to find rows       | Good                                |
| **Index Only Scan** | Answered entirely from index   | Best                                |
| **Nested Loop**     | For each outer row, scan inner | Fine for small outer, bad for large |
| **Hash Join**       | Build hash of smaller table    | Good for equality joins             |
| **Merge Join**      | Both sides sorted, merge       | Good for pre-sorted data            |
| **Sort**            | Sorting rows                   | Check if index can avoid it         |
| **Rows**            | Estimated vs actual            | Large discrepancy = stale stats     |

### Optimization Checklist

1. **Check indexes exist** on WHERE, JOIN, and ORDER BY columns
2. **Check cardinality estimates** -- run `ANALYZE` if estimates are wrong
3. **Avoid SELECT \*** -- fetch only columns you need
4. **Push filters down** -- filter early, join late
5. **Avoid correlated subqueries** -- rewrite as JOIN or CTE
6. **Check for implicit type casting** -- `WHERE id = '123'` may skip index if `id` is integer
7. **Limit result sets** -- use `LIMIT` and pagination
8. **Consider materialized views** for expensive aggregations

---

## Normalization

| Normal Form | Rule                                           | Violation Example                                |
| ----------- | ---------------------------------------------- | ------------------------------------------------ |
| **1NF**     | Atomic values, no repeating groups             | `tags: "a,b,c"` in one column                    |
| **2NF**     | 1NF + no partial dependencies on composite key | Non-key column depends on part of composite key  |
| **3NF**     | 2NF + no transitive dependencies               | `zip_code -> city` (city depends on zip, not PK) |
| **BCNF**    | Every determinant is a candidate key           | Rare edge cases of 3NF violations                |
| **4NF**     | No multi-valued dependencies                   | Independent many-to-many in one table            |

**Interview tip:** Most production systems are in 3NF. Denormalization (intentionally violating NF for performance) is common in read-heavy systems -- but you should be able to articulate the trade-off.

---

## ACID Properties

| Property        | Guarantee                       | Implementation                           |
| --------------- | ------------------------------- | ---------------------------------------- |
| **Atomicity**   | All or nothing                  | Write-ahead log (WAL), undo log          |
| **Consistency** | Data satisfies all constraints  | Constraints, triggers, application logic |
| **Isolation**   | Concurrent txns don't interfere | Locks, MVCC                              |
| **Durability**  | Committed data survives crashes | WAL flushed to disk, replication         |

---

## Transactions and Isolation Levels

```
+---------------------+------------+------------------+----------------+
| Isolation Level     | Dirty Read | Non-Repeatable   | Phantom Read   |
|                     |            | Read             |                |
+---------------------+------------+------------------+----------------+
| READ UNCOMMITTED    | Possible   | Possible         | Possible       |
| READ COMMITTED      | No         | Possible         | Possible       |
| REPEATABLE READ     | No         | No               | Possible*      |
| SERIALIZABLE        | No         | No               | No             |
+---------------------+------------+------------------+----------------+
* PostgreSQL's REPEATABLE READ also prevents phantoms (uses SSI)
```

```sql
-- Set isolation level
BEGIN;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;

-- Your queries here

COMMIT;
```

### Common Concurrency Issues

```
Dirty Read:     T1 writes, T2 reads uncommitted data, T1 rolls back
Non-Repeatable: T1 reads row, T2 updates row, T1 re-reads and gets different value
Phantom Read:   T1 reads set of rows, T2 inserts new row matching criteria, T1 re-reads and sees new row
Lost Update:    T1 reads value, T2 reads same value, both update, one is lost
Write Skew:     T1 and T2 read overlapping data, make decisions, write non-overlapping data (violates constraint)
```

### Deadlock Prevention

```sql
-- Always acquire locks in consistent order
-- Bad: T1 locks A then B, T2 locks B then A
-- Good: Both lock A first, then B

-- Use SELECT FOR UPDATE wisely
SELECT * FROM accounts WHERE id = 123 FOR UPDATE;
-- This locks the row until transaction completes

-- Set lock timeout
SET lock_timeout = '5s';
```

---

## Common Interview Questions

1. **Write a query to find the second-highest salary per department.**

   ```sql
   WITH ranked AS (
       SELECT name, department, salary,
              DENSE_RANK() OVER (PARTITION BY department ORDER BY salary DESC) AS rk
       FROM employees
   )
   SELECT name, department, salary FROM ranked WHERE rk = 2;
   ```

2. **Find customers who placed orders in every month of 2024.**

   ```sql
   SELECT customer_id
   FROM orders
   WHERE created_at >= '2024-01-01' AND created_at < '2025-01-01'
   GROUP BY customer_id
   HAVING COUNT(DISTINCT DATE_TRUNC('month', created_at)) = 12;
   ```

3. **Explain the difference between WHERE and HAVING.** WHERE filters rows before aggregation. HAVING filters groups after aggregation.

4. **When would you denormalize?** Read-heavy workloads, reporting/analytics, reducing expensive JOINs. Trade-off: data duplication, update anomalies.

5. **What is the N+1 query problem?** Fetching a list (1 query) then fetching related data per item (N queries). Fix: use JOIN, subquery, or batch loading.

6. **How do you handle pagination on large tables?** Offset-based (`LIMIT/OFFSET`) is slow for large offsets. Use keyset/cursor pagination: `WHERE id > last_seen_id ORDER BY id LIMIT 20`.

7. **Explain optimistic vs pessimistic locking.**

   - Pessimistic: `SELECT FOR UPDATE` -- lock row, prevent others from reading/writing
   - Optimistic: Add `version` column, check version on update, retry on conflict

8. **What happens when you add an index to a production table?** In PostgreSQL, `CREATE INDEX CONCURRENTLY` avoids locking writes (but takes longer). Regular `CREATE INDEX` locks the table. In MySQL, online DDL allows concurrent reads/writes for most index operations.
