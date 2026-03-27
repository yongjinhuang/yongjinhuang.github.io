# Pipeline Orchestration

A comprehensive guide to data pipeline orchestration -- coordinating task execution across
complex workflows. Covers Apache Airflow, Dagster, Prefect, DAG design patterns, and
operational best practices for reliable data pipelines.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Apache Airflow](#2-apache-airflow)
3. [Dagster](#3-dagster)
4. [Prefect](#4-prefect)
5. [Comparison](#5-comparison)
6. [DAG Design Patterns](#6-dag-design-patterns)
7. [Best Practices](#7-best-practices)
8. [Common Interview Questions](#8-common-interview-questions)
9. [Quick Reference](#9-quick-reference)

---

## 1. Overview

**Orchestration** coordinates the execution of data pipeline tasks, ensuring they run in
the right order, handle failures gracefully, and complete within SLAs.

```
         ORCHESTRATOR (Airflow / Dagster / Prefect)
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
  ┌──────────┐    ┌──────────┐    ┌──────────┐
  │ Extract  │───>│Transform │───>│   Load   │
  │ (API)    │    │ (Spark)  │    │ (DW)     │
  └──────────┘    └──────────┘    └──────────┘
        │                │                │
        ▼                ▼                ▼
  ┌──────────┐    ┌──────────┐    ┌──────────┐
  │  Test    │    │  Test    │    │  Test    │
  │  Data    │    │  Quality │    │  Schema  │
  └──────────┘    └──────────┘    └──────────┘
```

**Core concept: DAG** (Directed Acyclic Graph) -- tasks with dependencies, no cycles.

---

## 2. Apache Airflow

The de facto standard for data pipeline orchestration, created at Airbnb in 2014.

### Architecture

```
┌──────────────────────────────────────────────────┐
│                  AIRFLOW                          │
│                                                   │
│  ┌────────────┐   ┌────────────┐                  │
│  │ Web Server │   │ Scheduler  │                  │
│  │ (Flask UI) │   │ (triggers  │                  │
│  │            │   │  DAG runs) │                  │
│  └─────┬──────┘   └─────┬──────┘                  │
│        │                │                          │
│        └───────┬────────┘                          │
│                ▼                                   │
│  ┌──────────────────────┐                          │
│  │   Metadata Database  │  (PostgreSQL/MySQL)      │
│  │   (DAG state, task   │                          │
│  │    history, configs) │                          │
│  └──────────────────────┘                          │
│                │                                   │
│        ┌───────┴───────┐                           │
│        ▼               ▼                           │
│  ┌──────────┐   ┌──────────┐                       │
│  │ Executor │   │ Executor │  (Celery/K8s/Local)   │
│  │ Worker 1 │   │ Worker 2 │                       │
│  └──────────┘   └──────────┘                       │
└──────────────────────────────────────────────────┘
```

### DAG Definition

```python
from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.providers.common.sql.operators.sql import SQLExecuteQueryOperator
from airflow.sensors.filesystem import FileSensor
from datetime import datetime, timedelta

default_args = {
    'owner': 'data-team',
    'retries': 3,
    'retry_delay': timedelta(minutes=5),
    'email_on_failure': True,
}

with DAG(
    dag_id='daily_etl',
    default_args=default_args,
    schedule_interval='@daily',
    start_date=datetime(2024, 1, 1),
    catchup=False,
    tags=['etl', 'production'],
) as dag:

    wait_for_file = FileSensor(
        task_id='wait_for_file',
        filepath='/data/input/{{ ds }}.csv',
        poke_interval=300,
        timeout=3600,
    )

    extract = PythonOperator(
        task_id='extract',
        python_callable=extract_data,
    )

    transform = PythonOperator(
        task_id='transform',
        python_callable=transform_data,
    )

    load = SQLExecuteQueryOperator(
        task_id='load',
        conn_id='warehouse',
        sql='sql/load_data.sql',
    )

    wait_for_file >> extract >> transform >> load
```

### Key Concepts

| Concept | Description |
|---------|-------------|
| **DAG** | Directed Acyclic Graph defining task dependencies |
| **Operator** | Template for a task (PythonOperator, BashOperator, etc.) |
| **Sensor** | Waits for an external condition (file, API, time) |
| **XCom** | Cross-communication between tasks (small data only) |
| **Connection** | Stored credentials for external systems |
| **Pool** | Limit concurrent tasks (e.g., max 5 DB connections) |
| **TaskFlow API** | Decorator-based DAG definition (`@task`) |

### TaskFlow API (Modern Style)

```python
from airflow.decorators import dag, task

@dag(schedule_interval='@daily', start_date=datetime(2024, 1, 1))
def daily_etl():

    @task
    def extract():
        return {"data": [1, 2, 3]}

    @task
    def transform(data):
        return [x * 2 for x in data["data"]]

    @task
    def load(data):
        print(f"Loading {len(data)} records")

    raw = extract()
    transformed = transform(raw)
    load(transformed)

daily_etl()
```

### Executors

| Executor | Scalability | Use Case |
|----------|------------|----------|
| **LocalExecutor** | Single machine | Dev, small workloads |
| **CeleryExecutor** | Multi-machine | Production distributed |
| **KubernetesExecutor** | Auto-scaling pods | Cloud-native, isolation |

---

## 3. Dagster

**Asset-centric** orchestrator focused on data lineage and software engineering practices.

### Core Concepts

```python
from dagster import asset, Definitions, AssetIn

@asset
def raw_orders():
    """Load raw orders from source."""
    return pd.read_csv("s3://bucket/orders.csv")

@asset(ins={"raw_orders": AssetIn()})
def clean_orders(raw_orders):
    """Clean and validate orders."""
    return raw_orders.dropna(subset=["order_id"]).drop_duplicates()

@asset(ins={"clean_orders": AssetIn()})
def order_metrics(clean_orders):
    """Compute daily order metrics."""
    return clean_orders.groupby("date").agg(
        total_orders=("order_id", "count"),
        total_revenue=("amount", "sum"),
    )

defs = Definitions(assets=[raw_orders, clean_orders, order_metrics])
```

### Key Features

| Feature | Description |
|---------|-------------|
| **Software-Defined Assets** | Declare what data should exist, not how to run it |
| **Asset Lineage** | Automatic dependency graph from asset definitions |
| **Resources** | Injectable dependencies (DB connections, API clients) |
| **IO Managers** | Abstract how assets are stored/loaded |
| **Partitions** | Built-in time/category partitioning |
| **Sensors** | React to external events |
| **Schedules** | Cron-based execution |

### Why Dagster Over Airflow

- **Asset-centric** vs task-centric: focus on data produced, not tasks run
- **Type system**: Assets have types, enabling validation
- **Local development**: First-class local testing with `dagster dev`
- **Integrated data quality**: Built-in checks on assets

---

## 4. Prefect

**Flow-centric** orchestrator emphasizing simplicity and Python-native workflows.

```python
from prefect import flow, task
from prefect.tasks import task_input_hash
from datetime import timedelta

@task(retries=3, cache_key_fn=task_input_hash, cache_expiration=timedelta(hours=1))
def extract(url: str) -> dict:
    response = httpx.get(url)
    return response.json()

@task
def transform(data: dict) -> pd.DataFrame:
    return pd.DataFrame(data["results"])

@task
def load(df: pd.DataFrame, table: str):
    df.to_sql(table, engine, if_exists="replace")

@flow(name="ETL Pipeline", log_prints=True)
def etl_pipeline(url: str, table: str):
    data = extract(url)
    df = transform(data)
    load(df, table)
    print(f"Loaded {len(df)} rows into {table}")

# Run locally
etl_pipeline("https://api.example.com/data", "analytics.events")
```

### Key Features

- **Pure Python**: Decorate any function as a flow/task
- **Caching**: Task-level result caching
- **Dynamic flows**: Generate tasks at runtime
- **Work pools**: Route flows to different execution environments
- **Blocks**: Reusable config for external systems

---

## 5. Comparison

| Aspect | Airflow | Dagster | Prefect |
|--------|---------|---------|---------|
| **Philosophy** | Task-centric | Asset-centric | Flow-centric |
| **Core Abstraction** | DAG of operators | Software-defined assets | Python flows/tasks |
| **Maturity** | Most mature (2014) | Growing fast (2019) | Modern (2018) |
| **Ecosystem** | Largest (1000+ providers) | Growing | Smaller |
| **Learning Curve** | Moderate | Moderate | Gentle |
| **Local Dev** | Difficult | Excellent (`dagster dev`) | Easy (just Python) |
| **Testing** | Manual | Built-in | Built-in |
| **UI** | Web UI (Flask) | Dagit (React) | Prefect Cloud/Server |
| **Scheduling** | Cron + sensors | Cron + sensors | Cron + triggers |
| **Dynamic DAGs** | Limited | Supported | Native |
| **Data Quality** | External (Great Expectations) | Built-in asset checks | External |
| **Best For** | Large-scale batch ETL | Data-asset-focused teams | Python-native, dynamic |
| **2025 Update** | Airflow 3.0 (event-driven) | Components framework | Python 3.10+, Incidents |

---

## 6. DAG Design Patterns

### Idempotency

Every task should produce the same result when run multiple times:

```python
# BAD: Appends duplicates
INSERT INTO target SELECT * FROM source

# GOOD: Idempotent merge
MERGE INTO target USING source
ON target.id = source.id
WHEN MATCHED THEN UPDATE SET ...
WHEN NOT MATCHED THEN INSERT ...
```

### Backfilling

Re-run historical data processing:

```bash
# Airflow
airflow dags backfill -s 2024-01-01 -e 2024-01-31 daily_etl

# Dagster
dagster asset materialize --partition-range 2024-01-01...2024-01-31
```

### Branching

```python
from airflow.operators.python import BranchPythonOperator

def choose_branch(**context):
    if context['params']['source'] == 'api':
        return 'extract_api'
    return 'extract_file'

branch = BranchPythonOperator(
    task_id='branch',
    python_callable=choose_branch,
)
```

### SLAs

```python
with DAG(
    dag_id='critical_etl',
    sla_miss_callback=alert_oncall,
) as dag:
    task = PythonOperator(
        task_id='transform',
        python_callable=transform,
        sla=timedelta(hours=2),  # Must complete within 2 hours
    )
```

---

## 7. Best Practices

1. **Idempotent tasks**: Every task safe to re-run
2. **Atomic tasks**: Each task does one thing well
3. **No side effects between tasks**: Use XCom/IO managers, not shared files
4. **Parameterize everything**: Dates, paths, configs -- no hardcoded values
5. **Test DAGs**: Unit test task logic, integration test full pipelines
6. **Monitor**: Alert on SLA misses, task failures, data quality issues
7. **Version control**: DAGs in Git with CI/CD
8. **Separate concerns**: Extract/transform/load in different tasks
9. **Retry with backoff**: Transient failures are common
10. **Document**: DAG descriptions, task docstrings, runbooks

---

## 8. Common Interview Questions

**Q: What is the difference between Airflow, Dagster, and Prefect?**
Airflow is task-centric (define what to run). Dagster is asset-centric (define what data to produce). Prefect is flow-centric (decorate Python functions). Airflow has the largest ecosystem; Dagster has the best local dev experience; Prefect is the most Pythonic.

**Q: What is idempotency and why does it matter in orchestration?**
A task is idempotent if running it multiple times produces the same result. Essential for: retries after failures, backfilling historical data, manual re-runs. Use MERGE/upsert instead of INSERT.

**Q: How does Airflow handle dependencies?**
Through the DAG (Directed Acyclic Graph). Tasks declare upstream dependencies with `>>` operator or `set_upstream()`/`set_downstream()`. The scheduler respects this ordering.

**Q: What are sensors in Airflow?**
Sensors wait for external conditions (file exists, partition ready, API available) before proceeding. They "poke" at regular intervals. Use `mode='reschedule'` to avoid occupying worker slots while waiting.

**Q: How would you handle a failed task in production?**
1. Check logs for error details. 2. Fix root cause. 3. Clear the failed task instance. 4. Re-run (idempotent design makes this safe). 5. If intermittent, configure retries with exponential backoff.

**Q: What are XComs in Airflow?**
Cross-communication mechanism for passing small data between tasks. Stored in metadata DB. Not for large datasets -- use intermediate storage (S3, warehouse) for that.

---

## 9. Quick Reference

### Airflow CLI

```bash
airflow dags list                    # List DAGs
airflow dags trigger daily_etl       # Trigger DAG
airflow tasks test daily_etl extract 2024-01-01  # Test task
airflow dags backfill -s 2024-01-01 -e 2024-01-31 daily_etl
```

### Dagster CLI

```bash
dagster dev                          # Start local UI
dagster asset materialize            # Materialize assets
dagster job execute                  # Execute job
```

### Prefect CLI

```bash
prefect server start                 # Start local server
prefect deployment run etl/daily     # Run deployment
prefect flow-run inspect <id>        # Inspect run
```
