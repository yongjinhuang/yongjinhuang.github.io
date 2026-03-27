# dbt (Data Build Tool)

A comprehensive guide to dbt, the transformation tool that enables analytics engineers to
transform data in their warehouse using SQL and software engineering best practices. Covers
models, materializations, tests, snapshots, incremental models, Jinja, and the dbt ecosystem.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Project Structure](#2-project-structure)
3. [Models & Materializations](#3-models--materializations)
4. [Layered Modeling](#4-layered-modeling)
5. [Tests](#5-tests)
6. [Snapshots](#6-snapshots)
7. [Incremental Models](#7-incremental-models)
8. [Jinja & Macros](#8-jinja--macros)
9. [Packages & Ecosystem](#9-packages--ecosystem)
10. [dbt Core vs dbt Cloud](#10-dbt-core-vs-dbt-cloud)
11. [Best Practices](#11-best-practices)
12. [Common Interview Questions](#12-common-interview-questions)
13. [Quick Reference](#13-quick-reference)

---

## 1. Overview

dbt (data build tool) transforms raw data in your warehouse into trusted, well-tested
datasets using SQL. It operates in the **ELT paradigm** -- data is loaded raw, then
dbt handles the **T** (Transform) step.

```
              ELT PIPELINE
┌──────────┐  ┌──────────┐  ┌──────────────────────┐
│ EXTRACT  │─>│   LOAD   │─>│    TRANSFORM (dbt)   │
│          │  │          │  │                        │
│ Fivetran │  │ Raw      │  │ SQL models            │
│ Airbyte  │  │ tables   │  │ Tests                 │
│ Stitch   │  │ in       │  │ Documentation         │
│ Custom   │  │ warehouse│  │ Lineage               │
└──────────┘  └──────────┘  └──────────────────────┘
```

**What dbt does:**
- Compiles SQL models into DDL/DML statements
- Manages dependencies via `ref()` and builds a DAG
- Runs data quality tests
- Generates documentation
- Handles schema changes and incremental processing

**What dbt does NOT do:**
- Extract or load data (use Fivetran, Airbyte, etc.)
- Orchestrate pipelines (use Airflow, Dagster, etc.)

---

## 2. Project Structure

```
my_dbt_project/
├── dbt_project.yml          # Project configuration
├── profiles.yml             # Connection profiles (local only)
├── packages.yml             # Package dependencies
├── models/
│   ├── staging/             # 1:1 with source tables
│   │   ├── stg_orders.sql
│   │   └── _stg_models.yml # Schema + tests
│   ├── intermediate/        # Business logic joins
│   │   └── int_orders_enriched.sql
│   └── marts/               # Final business tables
│       ├── fct_orders.sql
│       └── dim_customers.sql
├── tests/                   # Singular (custom) tests
├── macros/                  # Reusable Jinja macros
├── snapshots/               # SCD Type 2 snapshots
├── seeds/                   # CSV files loaded as tables
└── analyses/                # Ad-hoc SQL (not materialized)
```

---

## 3. Models & Materializations

A **model** is a SQL SELECT statement that dbt materializes in your warehouse.

### Materialization Comparison

| Type | What It Creates | Rebuild | Best For |
|------|----------------|---------|----------|
| **view** | SQL view | Every query | Light transforms, always-fresh |
| **table** | Physical table | Every `dbt run` | Heavy joins/aggs, fast queries |
| **incremental** | Table + append/merge | Only new data | Large/event tables |
| **ephemeral** | CTE (no DB object) | Inline in consumers | Lightweight reusable logic |

### Configuration

```sql
-- In the model file
{{ config(materialized='table') }}

SELECT
    order_id,
    customer_id,
    order_date,
    amount
FROM {{ ref('stg_orders') }}
```

```yaml
# In dbt_project.yml (applies to all models in path)
models:
  my_project:
    staging:
      +materialized: view
    marts:
      +materialized: table
```

### ref() Function

`ref()` is the cornerstone of dbt -- it references other models and builds the DAG:

```sql
SELECT * FROM {{ ref('stg_orders') }}
-- Compiles to: SELECT * FROM schema.stg_orders
```

### Sources

```yaml
# models/staging/_sources.yml
sources:
  - name: raw
    database: raw_db
    schema: public
    tables:
      - name: orders
        loaded_at_field: _etl_loaded_at
        freshness:
          warn_after: {count: 12, period: hour}
          error_after: {count: 24, period: hour}
```

```sql
SELECT * FROM {{ source('raw', 'orders') }}
```

Run `dbt source freshness` to check data freshness.

---

## 4. Layered Modeling

```
┌─────────────────────────────────────────────────────┐
│                  MEDALLION / LAYERED MODEL           │
│                                                      │
│  SOURCES        STAGING         INTERMEDIATE  MARTS  │
│  ┌──────┐      ┌──────┐       ┌──────┐     ┌──────┐│
│  │raw_  │─────>│stg_  │──────>│int_  │────>│fct_  ││
│  │orders│      │orders│       │orders│     │orders││
│  └──────┘      └──────┘       │_enri-│     └──────┘│
│  ┌──────┐      ┌──────┐       │ched  │     ┌──────┐│
│  │raw_  │─────>│stg_  │──────>│      │────>│dim_  ││
│  │users │      │users │       └──────┘     │custo-││
│  └──────┘      └──────┘                    │mers  ││
│                                             └──────┘│
│  1:1 mapping   Rename, cast   Join, filter  Business│
│  source()      Clean, type    Enrich        metrics │
└─────────────────────────────────────────────────────┘
```

| Layer | Prefix | Materialization | Purpose |
|-------|--------|-----------------|---------|
| **Staging** | `stg_` | View | 1:1 with source, rename, cast, clean |
| **Intermediate** | `int_` | Ephemeral/View | Combine staging models, enrich |
| **Marts** | `fct_`/`dim_` | Table/Incremental | Business-level facts and dimensions |

---

## 5. Tests

### Generic Tests (Built-in)

```yaml
models:
  - name: stg_orders
    columns:
      - name: order_id
        tests:
          - unique
          - not_null
      - name: status
        tests:
          - accepted_values:
              values: ['placed', 'shipped', 'completed', 'returned']
      - name: customer_id
        tests:
          - relationships:
              to: ref('stg_customers')
              field: customer_id
```

### Singular Tests

Custom SQL in `tests/` directory. If query returns rows, test **fails**.

```sql
-- tests/assert_positive_amounts.sql
SELECT order_id, amount
FROM {{ ref('fct_orders') }}
WHERE amount < 0
```

### Custom Generic Tests

```sql
-- macros/test_is_positive.sql
{% test is_positive(model, column_name) %}
SELECT {{ column_name }}
FROM {{ model }}
WHERE {{ column_name }} < 0
{% endtest %}
```

```yaml
columns:
  - name: amount
    tests:
      - is_positive
```

---

## 6. Snapshots

Track changes over time (SCD Type 2):

```sql
-- snapshots/snap_orders.sql
{% snapshot snap_orders %}
{{ config(
    target_schema='snapshots',
    unique_key='order_id',
    strategy='timestamp',
    updated_at='updated_at'
) }}

SELECT * FROM {{ source('raw', 'orders') }}

{% endsnapshot %}
```

**Strategies:**
- `timestamp`: Compare `updated_at` column (faster, requires timestamp)
- `check`: Compare specified columns (works without timestamp, slower)

**Generated columns:** `dbt_valid_from`, `dbt_valid_to`, `dbt_scd_id`, `dbt_updated_at`

---

## 7. Incremental Models

Only process new/changed data:

```sql
{{ config(
    materialized='incremental',
    unique_key='event_id',
    incremental_strategy='merge'
) }}

SELECT
    event_id,
    user_id,
    event_type,
    created_at
FROM {{ source('raw', 'events') }}

{% if is_incremental() %}
WHERE created_at > (SELECT max(created_at) FROM {{ this }})
{% endif %}
```

### Incremental Strategies

| Strategy | How It Works | Best For |
|----------|-------------|----------|
| `append` | Insert only, no dedup | Immutable event logs |
| `merge` | Upsert on unique_key | Mutable data with updates |
| `delete+insert` | Delete matching, then insert | Warehouse without MERGE support |
| `insert_overwrite` | Replace entire partitions | Partitioned tables |

### Full Refresh

```bash
dbt run --full-refresh     # Rebuild all incremental models from scratch
dbt run -s my_model --full-refresh  # Rebuild specific model
```

---

## 8. Jinja & Macros

### Key Functions

| Function | Purpose | Example |
|----------|---------|---------|
| `ref('model')` | Reference another model | `{{ ref('stg_orders') }}` |
| `source('src', 'tbl')` | Reference source table | `{{ source('raw', 'orders') }}` |
| `config(...)` | Model configuration | `{{ config(materialized='table') }}` |
| `var('name')` | Project variable | `{{ var('start_date') }}` |
| `env_var('NAME')` | Environment variable | `{{ env_var('DB_SCHEMA') }}` |
| `this` | Current model reference | `SELECT max(id) FROM {{ this }}` |

### Control Flow

```sql
SELECT
    order_id,
    {% if target.name == 'prod' %}
        customer_email,
    {% else %}
        md5(customer_email) as customer_email,  -- Mask in dev
    {% endif %}
    amount
FROM {{ ref('stg_orders') }}
```

### Macros

```sql
-- macros/cents_to_dollars.sql
{% macro cents_to_dollars(column_name, precision=2) %}
    ROUND({{ column_name }} / 100.0, {{ precision }})
{% endmacro %}
```

```sql
-- Usage in model
SELECT
    order_id,
    {{ cents_to_dollars('amount_cents') }} as amount_dollars
FROM {{ ref('stg_orders') }}
```

---

## 9. Packages & Ecosystem

### packages.yml

```yaml
packages:
  - package: dbt-labs/dbt_utils
    version: [">=1.0.0", "<2.0.0"]
  - package: calogica/dbt_expectations
    version: [">=0.8.0", "<1.0.0"]
  - git: https://github.com/company/internal-macros.git
    revision: v1.0.0
```

```bash
dbt deps  # Install packages
```

### Essential Packages

| Package | Purpose |
|---------|---------|
| `dbt-utils` | generate_surrogate_key, union_relations, pivot, date_spine |
| `dbt-expectations` | Great Expectations-style tests (row count, distribution) |
| `dbt-codegen` | Generate YAML schema files from models |
| `dbt-audit-helper` | Compare model versions during refactoring |

---

## 10. dbt Core vs dbt Cloud

| Aspect | dbt Core | dbt Cloud |
|--------|----------|-----------|
| **Cost** | Free, open-source | Free tier / $100+/seat/mo |
| **Execution** | CLI (`dbt run`) | Web IDE + CLI + API |
| **Scheduling** | External (Airflow, cron) | Built-in scheduler |
| **CI/CD** | Manual setup | Built-in PR checks |
| **Documentation** | Local hosting | Hosted, auto-generated |
| **Collaboration** | Git-based | RBAC, SSO, audit logging |
| **Semantic Layer** | MetricFlow (OSS) | Hosted + BI integrations |

---

## 11. Best Practices

### Naming Conventions

| Layer | Prefix | Example |
|-------|--------|---------|
| Staging | `stg_` | `stg_stripe__payments` |
| Intermediate | `int_` | `int_payments_enriched` |
| Fact | `fct_` | `fct_orders` |
| Dimension | `dim_` | `dim_customers` |

### Testing Strategy

- **Every model**: `unique` + `not_null` on primary key
- **Every source**: Freshness checks
- **Business rules**: Custom tests for invariants
- **CI/CD**: Run `dbt test` on every PR

### Performance

- Use `incremental` for tables >1M rows
- Avoid Jinja loops that generate enormous SQL
- Leverage warehouse features (clustering, partitioning)
- Use `ephemeral` sparingly (complexity compounds when chained)

---

## 12. Common Interview Questions

**Q: What is dbt and what problem does it solve?**
dbt is a transformation tool for the ELT paradigm. It lets analytics engineers write SQL SELECT statements that become materialized tables/views in the warehouse, with testing, documentation, and dependency management built in.

**Q: What are the four materializations?**
View (SQL view, always fresh), Table (physical, rebuilt each run), Incremental (append/merge new data only), Ephemeral (CTE, no DB object).

**Q: How does ref() work and why is it important?**
`ref()` references other dbt models by name, enabling dbt to build a dependency DAG. It resolves to the correct schema/table name and ensures models run in the right order.

**Q: Explain the staging/intermediate/marts pattern.**
Staging: 1:1 with sources, light cleaning. Intermediate: join/enrich staging models. Marts: business-level facts and dimensions consumed by BI tools.

**Q: How do incremental models work?**
On first run, builds the full table. On subsequent runs, `is_incremental()` is true, and the WHERE clause filters to only new/updated data. `unique_key` enables merge (upsert) behavior.

**Q: What are snapshots and when would you use them?**
Snapshots implement SCD Type 2, tracking row changes over time with `dbt_valid_from` and `dbt_valid_to` columns. Use when you need historical record of how data changed.

**Q: How do you test data quality in dbt?**
Generic tests (unique, not_null, accepted_values, relationships) in YAML, singular tests (custom SQL returning failures), custom generic tests (reusable macros), and packages like dbt-expectations.

---

## 13. Quick Reference

```bash
dbt run                     # Run all models
dbt run -s my_model+        # Run model and downstream
dbt run -s +my_model        # Run model and upstream
dbt test                    # Run all tests
dbt test -s my_model        # Test specific model
dbt build                   # Run + test in DAG order
dbt source freshness        # Check source freshness
dbt docs generate           # Generate documentation
dbt docs serve              # Serve docs locally
dbt deps                    # Install packages
dbt run --full-refresh      # Rebuild incremental models
dbt compile                 # Compile SQL without executing
```
