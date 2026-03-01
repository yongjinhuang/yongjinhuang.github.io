# Design a Distributed Task Scheduler (Temporal / Airflow)

## Table of Contents

1. [Requirements Clarification](#1-requirements-clarification)
2. [API Design](#2-api-design)
3. [Data Model](#3-data-model)
4. [High-Level Architecture](#4-high-level-architecture)
5. [DAG Execution Engine](#5-dag-execution-engine)
6. [Task Queue Architecture](#6-task-queue-architecture)
7. [Exactly-Once Execution](#7-exactly-once-execution)
8. [Retry Strategies](#8-retry-strategies)
9. [Cron Scheduling](#9-cron-scheduling)
10. [Worker Heartbeat and Failure Detection](#10-worker-heartbeat-and-failure-detection)
11. [Task State Machine](#11-task-state-machine)
12. [Durable Execution (Temporal)](#12-durable-execution-temporal)
13. [Saga Pattern for Distributed Transactions](#13-saga-pattern-for-distributed-transactions)
14. [Rate Limiting and Backpressure](#14-rate-limiting-and-backpressure)
15. [Multi-Tenancy and Fair Scheduling](#15-multi-tenancy-and-fair-scheduling)
16. [Scaling Strategy](#16-scaling-strategy)
17. [Comparison: Build vs Buy](#17-comparison-build-vs-buy)
18. [Trade-offs](#18-trade-offs)
19. [Common Interview Follow-ups](#19-common-interview-follow-ups)

---

## 1. Requirements Clarification

### Functional Requirements

| Category | Requirements |
|----------|-------------|
| **Workflow Definition** | Define workflows as code (Temporal) or DAG configs (Airflow); support sequential, parallel, and conditional task execution; version workflows |
| **Task Scheduling** | One-time tasks, cron-based recurring tasks, event-triggered tasks, dependency-based triggers |
| **Task Execution** | Execute arbitrary code units (Python, Go, Java, etc.); pass inputs/outputs between tasks; support task timeouts |
| **Dependency Resolution** | DAG-based dependency graph; tasks wait for upstream tasks to complete; fan-out and fan-in patterns |
| **Retry & Error Handling** | Configurable retry policies (fixed, exponential backoff, jitter); dead letter queue for permanently failed tasks |
| **Monitoring & Observability** | Real-time task status; workflow execution history; task logs; alerting on failures |
| **Workflow Control** | Pause, resume, cancel, and manually retry workflows; backfill historical runs |
| **Multi-tenancy** | Namespace/tenant isolation; resource quotas per tenant; RBAC |

### Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| Throughput | 10,000+ tasks/minute (167 tasks/sec) |
| Schedule-to-dispatch latency | < 1 second |
| Availability | 99.99% (52 minutes downtime/year) |
| Durability | Zero task loss; all state persisted before execution |
| Exactly-once semantics | Critical workflows must not execute twice |
| Scalability | Horizontal scaling of workers; 10K concurrent workflows |
| Task execution latency | < 100ms overhead added by scheduler |
| Audit trail | Immutable history of all workflow/task state transitions |

### Scale Estimates

```
Workflows:             10,000 concurrent active workflows
Tasks per workflow:    avg 20 tasks (range: 1-1000)
Task execution time:   avg 30 seconds (range: 100ms to 24 hours)
Total active tasks:    10,000 * 20 = 200,000 concurrent tasks

Task throughput:
  1M tasks/day / 86,400 sec = 11.6 tasks/sec avg
  Peak (10x):                  116 tasks/sec
  Burst (100x):                1,160 tasks/sec

Workflow definitions:   50,000 unique workflow types
Workers:                5,000 worker nodes (avg 40 concurrent tasks each)
Cron schedules:         100,000 active cron schedules
```

### Back-of-Envelope Calculations

```
+------------------------------+-------------------+---------------------+
| Metric                       | Average           | Peak                |
+------------------------------+-------------------+---------------------+
| Tasks dispatched/sec         | 11.6              | 116                 |
| Concurrent workflows         | 10,000            | 50,000              |
| Task state transitions/sec   | ~50               | 500                 |
| Heartbeats/sec (5K workers)  | 5,000 (1/sec ea.) | 5,000               |
| DB writes/sec (state changes)| 100               | 1,000               |
| Storage per workflow run     | ~10 KB            | --                  |
| Daily storage                | 1M * 10 KB = 10 GB| --                  |
| Retention (90 days)          | 900 GB            | --                  |
+------------------------------+-------------------+---------------------+
```

---

## 2. API Design

### Workflow Management

```
POST   /api/v1/namespaces/{namespace}/workflows
       Start a new workflow execution

GET    /api/v1/namespaces/{namespace}/workflows/{workflow_id}
       Get workflow execution details and current status

DELETE /api/v1/namespaces/{namespace}/workflows/{workflow_id}
       Cancel a running workflow

POST   /api/v1/namespaces/{namespace}/workflows/{workflow_id}/signal
       Send a signal event to a running workflow

POST   /api/v1/namespaces/{namespace}/workflows/{workflow_id}/query
       Query current state of a running workflow

GET    /api/v1/namespaces/{namespace}/workflows
       List workflows with filters (status, type, time range)

POST   /api/v1/namespaces/{namespace}/workflows/{workflow_id}/retry
       Retry a failed workflow from the point of failure
```

### Task Management

```
GET    /api/v1/namespaces/{namespace}/workflows/{workflow_id}/tasks
       List all tasks within a workflow execution

GET    /api/v1/namespaces/{namespace}/workflows/{workflow_id}/tasks/{task_id}
       Get task details, inputs, outputs, and logs

POST   /api/v1/namespaces/{namespace}/workflows/{workflow_id}/tasks/{task_id}/retry
       Manually retry a specific failed task

POST   /api/v1/namespaces/{namespace}/tasks/poll
       Worker polls for available tasks (long-polling, 20s timeout)

POST   /api/v1/namespaces/{namespace}/tasks/{task_token}/complete
       Worker reports task completion with output payload

POST   /api/v1/namespaces/{namespace}/tasks/{task_token}/fail
       Worker reports task failure with error details

POST   /api/v1/namespaces/{namespace}/tasks/{task_token}/heartbeat
       Worker sends heartbeat to indicate task is still running
```

### Schedule Management

```
POST   /api/v1/namespaces/{namespace}/schedules
       Create a cron schedule for a workflow

GET    /api/v1/namespaces/{namespace}/schedules/{schedule_id}
       Get schedule configuration and next run times

PUT    /api/v1/namespaces/{namespace}/schedules/{schedule_id}
       Update schedule (cron expression, workflow inputs, policy)

DELETE /api/v1/namespaces/{namespace}/schedules/{schedule_id}
       Pause or delete a schedule

POST   /api/v1/namespaces/{namespace}/schedules/{schedule_id}/trigger
       Manually trigger a scheduled workflow immediately

GET    /api/v1/namespaces/{namespace}/schedules/{schedule_id}/history
       List recent executions triggered by this schedule
```

### Request / Response Examples

```json
// POST /api/v1/namespaces/prod/workflows
// Request
{
  "workflow_type": "order-fulfillment",
  "workflow_id": "order-12345",      // idempotency key
  "task_queue": "fulfillment-workers",
  "input": {
    "order_id": "12345",
    "customer_id": "cust-789",
    "items": [{"sku": "ABC", "qty": 2}]
  },
  "execution_timeout": "PT24H",       // ISO 8601 duration
  "retry_policy": {
    "max_attempts": 3,
    "initial_interval": "PT5S",
    "backoff_coefficient": 2.0,
    "max_interval": "PT5M"
  },
  "memo": {"priority": "high"}
}

// Response
{
  "workflow_id": "order-12345",
  "run_id": "run-a1b2c3d4",
  "status": "RUNNING",
  "started_at": "2026-03-01T10:00:00Z",
  "namespace": "prod"
}
```

---

## 3. Data Model

### Workflow Definition Table

```sql
CREATE TABLE workflow_definitions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace_id  UUID NOT NULL REFERENCES namespaces(id),
  workflow_type VARCHAR(255) NOT NULL,
  version       INT NOT NULL DEFAULT 1,
  definition    JSONB NOT NULL,       -- DAG structure or code reference
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  created_by    VARCHAR(255),

  UNIQUE(namespace_id, workflow_type, version)
);
```

### Workflow Execution Table

```sql
CREATE TABLE workflow_executions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace_id         UUID NOT NULL REFERENCES namespaces(id),
  workflow_id          VARCHAR(255) NOT NULL,  -- user-provided idempotency key
  run_id               UUID NOT NULL UNIQUE,
  workflow_type        VARCHAR(255) NOT NULL,
  task_queue           VARCHAR(255) NOT NULL,
  status               VARCHAR(50) NOT NULL,   -- RUNNING, COMPLETED, FAILED, CANCELLED, TIMED_OUT
  input                JSONB,
  result               JSONB,
  error                TEXT,
  memo                 JSONB,
  search_attributes    JSONB,
  execution_timeout    INTERVAL,
  started_at           TIMESTAMPTZ DEFAULT NOW(),
  closed_at            TIMESTAMPTZ,
  parent_workflow_id   UUID REFERENCES workflow_executions(id),

  INDEX idx_namespace_status (namespace_id, status),
  INDEX idx_workflow_id (namespace_id, workflow_id),
  INDEX idx_task_queue (task_queue, status),
  INDEX idx_started_at (started_at),
  UNIQUE(namespace_id, workflow_id)               -- enforce one active run per workflow_id
);
```

### Task / Activity Table

```sql
CREATE TABLE tasks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_run_id   UUID NOT NULL REFERENCES workflow_executions(id),
  task_type         VARCHAR(255) NOT NULL,
  task_queue        VARCHAR(255) NOT NULL,
  sequence_number   INT NOT NULL,           -- position in workflow history
  status            VARCHAR(50) NOT NULL,   -- PENDING, SCHEDULED, RUNNING, SUCCESS, FAILED, TIMED_OUT
  priority          INT DEFAULT 0,          -- higher = more urgent
  input             JSONB,
  output            JSONB,
  error             TEXT,
  attempt           INT DEFAULT 1,
  max_attempts      INT DEFAULT 3,
  retry_policy      JSONB,
  scheduled_at      TIMESTAMPTZ,
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  timeout           INTERVAL DEFAULT '30 minutes',
  worker_id         VARCHAR(255),           -- which worker is executing
  task_token        VARCHAR(512) UNIQUE,    -- opaque token for worker callbacks
  heartbeat_at      TIMESTAMPTZ,

  INDEX idx_workflow_run (workflow_run_id),
  INDEX idx_task_queue_status (task_queue, status, priority DESC),
  INDEX idx_scheduled_at (status, scheduled_at),
  INDEX idx_heartbeat (status, heartbeat_at)
);
```

### Workflow Event History Table

```sql
-- Temporal-style: append-only event log for durable execution
CREATE TABLE workflow_events (
  id              BIGSERIAL PRIMARY KEY,
  workflow_run_id UUID NOT NULL REFERENCES workflow_executions(id),
  sequence_number INT NOT NULL,
  event_type      VARCHAR(100) NOT NULL,    -- WORKFLOW_STARTED, TASK_SCHEDULED, TASK_STARTED, etc.
  attributes      JSONB NOT NULL,           -- event-specific payload
  timestamp       TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(workflow_run_id, sequence_number),
  INDEX idx_workflow_events (workflow_run_id, sequence_number)
);
```

### Schedule Table

```sql
CREATE TABLE schedules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace_id      UUID NOT NULL REFERENCES namespaces(id),
  name              VARCHAR(255) NOT NULL,
  workflow_type     VARCHAR(255) NOT NULL,
  task_queue        VARCHAR(255) NOT NULL,
  cron_expression   VARCHAR(100),           -- "0 9 * * MON-FRI"
  timezone          VARCHAR(100) DEFAULT 'UTC',
  workflow_input    JSONB,
  retry_policy      JSONB,
  overlap_policy    VARCHAR(50) DEFAULT 'SKIP',  -- SKIP, ALLOW, BUFFER, CANCEL_OTHER
  catchup_window    INTERVAL DEFAULT '1 hour',
  is_paused         BOOLEAN DEFAULT FALSE,
  last_triggered_at TIMESTAMPTZ,
  next_trigger_at   TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(namespace_id, name),
  INDEX idx_next_trigger (is_paused, next_trigger_at)
);
```

### Namespace / Tenant Table

```sql
CREATE TABLE namespaces (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name               VARCHAR(255) UNIQUE NOT NULL,
  description        TEXT,
  retention_days     INT DEFAULT 90,
  max_concurrent_wf  INT DEFAULT 10000,       -- quota: max concurrent workflows
  max_tasks_per_sec  INT DEFAULT 1000,        -- quota: rate limit
  global_search      BOOLEAN DEFAULT FALSE,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 4. High-Level Architecture

```
+------------------------------------------------------------------------------------------------------------------+
|                                         DISTRIBUTED TASK SCHEDULER                                               |
+------------------------------------------------------------------------------------------------------------------+

  CLIENT LAYER
  +----------------+   +----------------+   +----------------+   +----------------+
  |   Web UI       |   |  CLI / SDK     |   |  REST API      |   |  gRPC API      |
  | (Dashboard)    |   | (Python/Go/JS) |   |  Clients       |   |  Clients       |
  +-------+--------+   +-------+--------+   +-------+--------+   +-------+--------+
          |                    |                     |                    |
          +--------------------+---------------------+--------------------+
                                         |
                                         v
  API GATEWAY / LOAD BALANCER
  +------------------------------------------------------------------+
  |                        API Gateway                               |
  |   Auth (JWT/OIDC) | Rate Limiting | Routing | Namespace Dispatch |
  +--------+------------------------------------+--------------------+
           |                                    |
           v                                    v
  +------------------+               +--------------------+
  |  Frontend Service|               | Backend Service    |
  |  (workflow CRUD, |               | (worker polling,   |
  |   schedule mgmt) |               |  task dispatch)    |
  +--------+---------+               +----------+---------+
           |                                    |
           +------------------------------------+
                          |
                          v
  SCHEDULER CORE
  +------------------------------------------------------------------+
  |                    Scheduler Service (HA cluster)                 |
  |  +------------------+  +--------------------+  +--------------+  |
  |  | Cron Trigger     |  | Dependency Resolver|  |Leader Elector|  |
  |  | (parse & fire)   |  | (DAG evaluator)    |  |(etcd-based)  |  |
  |  +------------------+  +--------------------+  +--------------+  |
  |  +------------------+  +--------------------+                    |
  |  | Timeout Monitor  |  | Heartbeat Monitor  |                    |
  |  | (detect expired) |  | (detect dead wkrs) |                    |
  |  +------------------+  +--------------------+                    |
  +------------------------------------------------------------------+
                          |
          +---------------+---------------+
          |               |               |
          v               v               v
  TASK QUEUES (per task type / priority)
  +----------------+  +----------------+  +----------------+
  |  High Priority |  | Normal Queue   |  |  Low Priority  |
  |  Queue         |  |                |  |  Queue         |
  | (Redis/Kafka)  |  | (Redis/Kafka)  |  | (Redis/Kafka)  |
  +-------+--------+  +-------+--------+  +-------+--------+
          |                   |                    |
          +-------------------+--------------------+
                              |
              +---------------+---------------+
              |               |               |
              v               v               v
  WORKER POOLS
  +----------------+  +----------------+  +----------------+
  | Worker Pool A  |  | Worker Pool B  |  | Worker Pool C  |
  | (Python tasks) |  | (Go tasks)     |  | (Java tasks)   |
  | [W1][W2][W3]   |  | [W4][W5][W6]   |  | [W7][W8][W9]  |
  +----------------+  +----------------+  +----------------+
              |               |               |
              +---------------+---------------+
                              |
                              v
  PERSISTENCE LAYER
  +------------------------------------------------------------------+
  |  +------------------+  +------------------+  +--------------+   |
  |  | PostgreSQL       |  |  Redis           |  | Object Store |   |
  |  | (workflow state, |  |  (task queues,   |  | (S3/GCS)     |   |
  |  |  event history,  |  |   cache, locks,  |  | (large I/O   |   |
  |  |  schedules)      |  |   rate limits)   |  |  payloads)   |   |
  |  +------------------+  +------------------+  +--------------+   |
  |  +------------------+                                            |
  |  |  Elasticsearch   |                                            |
  |  | (workflow search,|                                            |
  |  |  visibility)     |                                            |
  |  +------------------+                                            |
  +------------------------------------------------------------------+
                              |
                              v
  OBSERVABILITY
  +------------------------------------------------------------------+
  |  Prometheus (metrics)  |  Jaeger (traces)  |  Grafana (dashboards) |
  +------------------------------------------------------------------+
```

### Scheduler Service HA with Leader Election

```
+-------------------+     etcd heartbeat      +-------------------+
|  Scheduler Node 1 |<----------------------->|  Scheduler Node 2 |
|  (LEADER)         |                         |  (STANDBY)        |
|                   |    etcd distributed     |                   |
|  - runs cron loop |         lock            |  - watches leader |
|  - dispatches     |<----------------------->|  - ready to take  |
|    tasks          |                         |    over in < 5s   |
|  - monitors       |                         |                   |
+-------------------+     +----------+        +-------------------+
                           |   etcd   |
                           | cluster  |
                           +----------+
```

---

## 5. DAG Execution Engine

### DAG Structure and Topological Sort

A workflow is modeled as a Directed Acyclic Graph (DAG) where:
- **Nodes** = individual tasks/activities
- **Edges** = dependencies (A -> B means B depends on A)

```
Example: Order Fulfillment DAG

     +----------------+
     | validate_order |  (no dependencies)
     +-------+--------+
             |
      +-------+-------+
      |               |
      v               v
+----------+    +------------+
|charge_   |    |reserve_    |
|customer  |    |inventory   |
+----+-----+    +-----+------+
     |                |
     +------+  +------+
            |  |
            v  v
       +----------+
       | ship_    |
       | order    |
       +----+-----+
            |
     +------+------+
     |             |
     v             v
+--------+   +----------+
|send_   |   |update_   |
|confirm |   |analytics |
|email   |   |          |
+--------+   +----------+
```

### Topological Sort Algorithm (Kahn's Algorithm)

```python
from collections import defaultdict, deque
from typing import List, Dict, Set

class DAGExecutionEngine:
    def __init__(self, tasks: List[dict], dependencies: List[tuple]):
        # tasks: [{"id": "A", "type": "validate_order"}, ...]
        # dependencies: [("A", "B"), ...] means B depends on A
        self.tasks = {t["id"]: t for t in tasks}
        self.dependents = defaultdict(set)    # A -> {B, C} (who depends on A)
        self.prerequisites = defaultdict(set) # B -> {A} (what B needs)
        self.in_degree = defaultdict(int)

        for (upstream, downstream) in dependencies:
            self.dependents[upstream].add(downstream)
            self.prerequisites[downstream].add(upstream)
            self.in_degree[downstream] += 1

        # Initialize with tasks that have no prerequisites
        for task_id in self.tasks:
            if self.in_degree[task_id] == 0:
                self.in_degree[task_id] = 0  # ensure key exists

    def get_runnable_tasks(self, completed: Set[str]) -> List[str]:
        """Return all tasks whose prerequisites are satisfied."""
        runnable = []
        for task_id in self.tasks:
            prereqs = self.prerequisites[task_id]
            if prereqs.issubset(completed) and task_id not in completed:
                runnable.append(task_id)
        return runnable

    def topological_order(self) -> List[str]:
        """Returns one valid execution order via Kahn's algorithm."""
        in_degree = dict(self.in_degree)
        queue = deque([t for t in self.tasks if in_degree[t] == 0])
        order = []

        while queue:
            task = queue.popleft()
            order.append(task)
            for dependent in self.dependents[task]:
                in_degree[dependent] -= 1
                if in_degree[dependent] == 0:
                    queue.append(dependent)

        if len(order) != len(self.tasks):
            raise ValueError("Cycle detected in DAG!")
        return order

    def on_task_complete(self, task_id: str, completed: Set[str]) -> List[str]:
        """Called when a task finishes. Returns newly runnable tasks."""
        completed.add(task_id)
        newly_runnable = []
        for dependent in self.dependents[task_id]:
            if self.prerequisites[dependent].issubset(completed):
                newly_runnable.append(dependent)
        return newly_runnable
```

### Parallel Execution Model

```
Time  0s:  [validate_order]                          <- depth 0 (no deps)
Time  5s:  [charge_customer] [reserve_inventory]     <- depth 1 (parallel)
Time 15s:  [ship_order]                              <- depth 2 (fan-in: waits for both)
Time 25s:  [send_confirm_email] [update_analytics]   <- depth 3 (parallel)

Total wall-clock time: 25s (vs ~50s sequential)
```

### Framework Comparison: Temporal vs Airflow vs Celery

| Feature | Temporal | Apache Airflow | Celery |
|---------|----------|---------------|--------|
| **Paradigm** | Workflow-as-code (durable execution) | DAG-as-config (Python) | Task queue with chains |
| **Workflow definition** | Code (Go, Python, Java, TS) | Python DAG files | Python decorators |
| **State management** | Event sourcing (replay) | DB-backed (task instances) | Stateless (results in Redis/DB) |
| **Durability** | Built-in (event history) | Requires careful DB setup | Best-effort unless configured |
| **Exactly-once** | Yes (via idempotent SDK) | Partial (idempotency not automatic) | No (at-least-once by default) |
| **Long-running workflows** | Excellent (months/years) | Poor (scheduler loop restarts) | Poor (task timeouts) |
| **Dynamic task generation** | Native (dynamic activities) | Limited (dynamic task mapping in 2.3+) | Yes (chains, chords) |
| **Visibility/UI** | Temporal Web | Airflow Web UI | Flower (basic) |
| **Versioning** | Built-in workflow versioning | Limited | None |
| **Scale (tasks/sec)** | 10K+ | ~100-500 | 10K+ (with proper broker) |
| **Operational complexity** | Medium (managed: Temporal Cloud) | High (scheduler, workers, DB) | Low-Medium |
| **Best for** | Microservice orchestration, long-running business processes | Batch ETL pipelines, data engineering | Simple async task processing |

### Workflow-as-Code (Temporal) vs DAG-as-Config (Airflow)

```python
# ===== TEMPORAL: Workflow-as-Code =====
# Looks like regular code; Temporal handles durability via event replay

@workflow.defn
class OrderFulfillmentWorkflow:
    @workflow.run
    async def run(self, order: OrderInput) -> OrderResult:
        # Each activity call is automatically retried and durable
        validated = await workflow.execute_activity(
            validate_order,
            order,
            start_to_close_timeout=timedelta(seconds=30)
        )

        # True parallel execution - just use asyncio
        charge_result, reserve_result = await asyncio.gather(
            workflow.execute_activity(charge_customer, validated),
            workflow.execute_activity(reserve_inventory, validated)
        )

        # Conditional logic is just Python
        if charge_result.success and reserve_result.success:
            await workflow.execute_activity(ship_order, order)
            await asyncio.gather(
                workflow.execute_activity(send_confirmation, order),
                workflow.execute_activity(update_analytics, order)
            )
        else:
            await workflow.execute_activity(issue_refund, charge_result)

        return OrderResult(status="completed")
```

```python
# ===== AIRFLOW: DAG-as-Config =====
# Declarative graph structure; scheduler evaluates it periodically

from airflow import DAG
from airflow.operators.python import PythonOperator
from datetime import datetime, timedelta

with DAG(
    dag_id="order_fulfillment",
    schedule_interval="@daily",
    start_date=datetime(2026, 1, 1),
    catchup=False,
    default_args={"retries": 3, "retry_delay": timedelta(minutes=5)}
) as dag:

    validate   = PythonOperator(task_id="validate_order",    python_callable=validate_fn)
    charge     = PythonOperator(task_id="charge_customer",   python_callable=charge_fn)
    reserve    = PythonOperator(task_id="reserve_inventory", python_callable=reserve_fn)
    ship       = PythonOperator(task_id="ship_order",        python_callable=ship_fn)
    email      = PythonOperator(task_id="send_email",        python_callable=email_fn)
    analytics  = PythonOperator(task_id="update_analytics",  python_callable=analytics_fn)

    # Define dependency graph
    validate >> [charge, reserve]     # fan-out: parallel
    [charge, reserve] >> ship         # fan-in: wait for both
    ship >> [email, analytics]        # fan-out: parallel
```

---

## 6. Task Queue Architecture

### Queue Design

```
+-----------------------------------------------------------------------+
|                    TASK QUEUE SYSTEM                                   |
+-----------------------------------------------------------------------+

  Scheduler
     |
     | enqueue(task, priority, delay)
     v
+--------------------+
|   Queue Router     |  -- routes by task_type, tenant, priority
+----+---+---+-------+
     |   |   |
     v   v   v
+--------+ +--------+ +--------+
|Priority| |Priority| |Priority|
| HIGH   | | NORMAL | | LOW    |
| Queue  | | Queue  | | Queue  |
+--------+ +--------+ +--------+
  Redis ZSET (score = priority + timestamp)

  +-- Delayed Task Queue (Redis ZSET, score = execute_at epoch) --+
  |  Tasks with future execute_at sit here until time arrives     |
  +------+--------------------------------------------------------+
         |
         | (moved to main queue when score <= now())
         v
+-------------------+
|  Scheduler Loop   |  -- polls delayed queue every 100ms
+-------------------+
```

### Redis-backed Priority Queue

```python
import redis
import json
import time
from dataclasses import dataclass

class TaskQueue:
    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client
        self.QUEUE_KEY = "tasks:{task_queue}:{priority}"
        self.DELAYED_KEY = "tasks:delayed"
        self.INFLIGHT_KEY = "tasks:inflight"

    def enqueue(self, task: dict, queue: str, priority: int = 0,
                delay_seconds: float = 0) -> str:
        task_json = json.dumps(task)
        if delay_seconds > 0:
            execute_at = time.time() + delay_seconds
            self.redis.zadd(self.DELAYED_KEY, {task_json: execute_at})
        else:
            # Score = -priority so highest priority is dequeued first
            score = -priority * 1e12 + time.time()
            key = self.QUEUE_KEY.format(task_queue=queue, priority=priority)
            self.redis.zadd(key, {task_json: score})
        return task["id"]

    def dequeue(self, queue: str, worker_id: str) -> dict | None:
        # Try high priority first, then normal, then low
        for priority in ["high", "normal", "low"]:
            key = self.QUEUE_KEY.format(task_queue=queue, priority=priority)
            # Atomic pop-and-track with Lua script for exactly-once dequeue
            result = self.redis.zpopmin(key, 1)
            if result:
                task_json, _ = result[0]
                task = json.loads(task_json)
                # Track in-flight with expiry (heartbeat timeout)
                inflight_key = f"{self.INFLIGHT_KEY}:{task['id']}"
                self.redis.setex(inflight_key, 60, json.dumps({
                    "task": task,
                    "worker_id": worker_id,
                    "claimed_at": time.time()
                }))
                return task
        return None

    def process_delayed_queue(self):
        """Move eligible delayed tasks to main queue. Run every 100ms."""
        now = time.time()
        # Fetch all tasks with score <= now
        tasks = self.redis.zrangebyscore(self.DELAYED_KEY, 0, now, withscores=False)
        for task_json in tasks:
            task = json.loads(task_json)
            # Atomic: remove from delayed, add to main queue
            pipe = self.redis.pipeline()
            pipe.zrem(self.DELAYED_KEY, task_json)
            pipe.zadd(
                self.QUEUE_KEY.format(task_queue=task["queue"], priority="normal"),
                {task_json: time.time()}
            )
            pipe.execute()
```

### Worker Pool Architecture

```
+------------------------------------------------------------------+
|                        WORKER POOL                                |
+------------------------------------------------------------------+

  +------------+   poll (long-poll, 20s)   +------------------+
  |  Worker 1  |<------------------------->|   Task Queue     |
  |            |                           |   (Redis/Kafka)  |
  |  Goroutine |   heartbeat every 10s     |                  |
  |  pool: 40  |-------------------------->|                  |
  |  slots     |                           +------------------+
  +------------+
  +------------+
  |  Worker 2  |   auto-scale via          +------------------+
  |            |   HPA (k8s) or            |  Scheduler       |
  |  slots: 40 |   queue depth metric ---->|  (monitors queue |
  +------------+                           |  depth, scales   |
  +------------+                           |  workers)        |
  |  Worker N  |                           +------------------+
  |            |
  +------------+

  Worker Registration:
  - On startup: register in Redis with {worker_id, capabilities, capacity}
  - Continuous: send heartbeat every 10s with current load
  - On shutdown: graceful drain (finish in-flight, stop polling)
```

---

## 7. Exactly-Once Execution

### The Challenge

```
+-------------------+
|   Scheduler       |
|                   |  (1) Enqueue task
|  Task dispatched  +---------------------> Queue
|                   |
+-------------------+
         |
         | (2) Worker dequeues, starts executing
         v
+-------------------+
|   Worker          |
|                   |
|  Executes task    |
|                   |
+-------------------+
         |
         |  CRASH happens here!
         |
         v
  Task ran but completion was not recorded.
  Scheduler thinks task still running.
  After timeout, reschedules --> DOUBLE EXECUTION!
```

### Idempotency Token Strategy

```python
class IdempotentTaskExecutor:
    def __init__(self, db, redis):
        self.db = db
        self.redis = redis

    def execute(self, task_token: str, task_fn, inputs: dict) -> dict:
        # 1. Check if already completed (idempotency check)
        cache_key = f"task:result:{task_token}"
        cached = self.redis.get(cache_key)
        if cached:
            return json.loads(cached)  # Return previously computed result

        # 2. Check DB for completed record
        existing = self.db.query(
            "SELECT output FROM tasks WHERE task_token = $1 AND status = 'SUCCESS'",
            task_token
        )
        if existing:
            result = existing[0]["output"]
            self.redis.setex(cache_key, 3600, json.dumps(result))
            return result

        # 3. Execute the task
        result = task_fn(**inputs)

        # 4. Persist result atomically BEFORE returning to caller
        self.db.execute("""
            UPDATE tasks
            SET status = 'SUCCESS', output = $1, completed_at = NOW()
            WHERE task_token = $2 AND status = 'RUNNING'
        """, json.dumps(result), task_token)

        # 5. Cache result for fast deduplication
        self.redis.setex(cache_key, 3600, json.dumps(result))
        return result
```

### Deduplication via Workflow ID Uniqueness

```sql
-- Enforce: only one active execution per workflow_id per namespace
-- The UNIQUE constraint prevents concurrent duplicate starts

INSERT INTO workflow_executions (namespace_id, workflow_id, run_id, status, ...)
VALUES ($1, $2, gen_random_uuid(), 'RUNNING', ...)
ON CONFLICT (namespace_id, workflow_id) DO NOTHING
RETURNING id;

-- If no row returned, a workflow with this ID already exists.
-- Caller should fetch the existing execution and return its run_id.
```

---

## 8. Retry Strategies

### Strategy Comparison

```
FIXED RETRY (naive):
  Attempt 1 at t=0
  Attempt 2 at t=5s
  Attempt 3 at t=5s     -- thundering herd if many tasks fail simultaneously

EXPONENTIAL BACKOFF:
  Attempt 1 at t=0
  Attempt 2 at t=2s      (base=2, multiplier=2^0 * 2 = 2)
  Attempt 3 at t=6s      (2 + 2^1 * 2 = 6)
  Attempt 4 at t=14s     (6 + 2^2 * 2 = 14)
  Attempt 5 at t=30s     (14 + 2^3 * 2 = 30)
  ... capped at max_interval

EXPONENTIAL BACKOFF + JITTER (recommended):
  Attempt N waits: min(max_interval, base * 2^(n-1)) * random(0.5, 1.5)
  Spreads retries across time to avoid thundering herd

TIMELINE:
t=0s    [TASK]--FAIL
t=2.3s  [TASK]--FAIL    (2s * jitter 1.15)
t=7.8s  [TASK]--FAIL    (4s + 2.3s * jitter 0.88)
t=19.2s [TASK]--FAIL    (8s + 7.8s * jitter 1.42)
t=MAX   [TASK]--FAIL --> DLQ (Dead Letter Queue)
```

### Retry Policy Implementation

```python
import random
import math

@dataclass
class RetryPolicy:
    max_attempts: int = 3
    initial_interval_sec: float = 1.0
    backoff_coefficient: float = 2.0
    max_interval_sec: float = 300.0   # 5 minutes
    jitter_factor: float = 0.2        # +/- 20% jitter
    non_retryable_errors: list = None  # error types that bypass retry

class RetryScheduler:
    def compute_next_retry_delay(self, policy: RetryPolicy, attempt: int) -> float:
        """Returns delay in seconds before next retry attempt."""
        if attempt >= policy.max_attempts:
            return None  # No more retries; send to DLQ

        # Exponential backoff
        backoff = policy.initial_interval_sec * (policy.backoff_coefficient ** (attempt - 1))

        # Cap at max interval
        backoff = min(backoff, policy.max_interval_sec)

        # Add jitter: uniform random in [backoff*(1-jitter), backoff*(1+jitter)]
        jitter = backoff * policy.jitter_factor
        final_delay = backoff + random.uniform(-jitter, jitter)

        return max(0, final_delay)  # ensure non-negative

    def should_retry(self, policy: RetryPolicy, error: Exception, attempt: int) -> bool:
        if attempt >= policy.max_attempts:
            return False
        if policy.non_retryable_errors:
            for err_type in policy.non_retryable_errors:
                if isinstance(error, err_type):
                    return False
        return True
```

### Dead Letter Queue (DLQ)

```
Task fails after max_attempts
         |
         v
  +---------------+
  |      DLQ      |  -- persisted in DB with full error context
  |               |
  | - task_id     |
  | - workflow_id |
  | - error log   |
  | - attempt #   |
  | - inputs      |
  +-------+-------+
          |
          +---> Alert ops team (PagerDuty / Slack)
          |
          +---> Manual retry interface (admin UI)
          |
          +---> Auto-analysis: categorize error type,
                track DLQ growth rate per task type
```

---

## 9. Cron Scheduling

### Cron Expression Parsing

```
Standard 5-field cron:
  * * * * *
  | | | | |
  | | | | +--- Day of week (0=Sun, 6=Sat)
  | | | +----- Month (1-12)
  | | +------- Day of month (1-31)
  | +--------- Hour (0-23)
  +----------- Minute (0-59)

Examples:
  "0 9 * * MON-FRI"    -- 9:00 AM Mon-Fri
  "*/15 * * * *"       -- every 15 minutes
  "0 0 1 * *"          -- midnight on 1st of each month
  "@daily"             -- alias for "0 0 * * *"
  "@hourly"            -- alias for "0 * * * *"
```

### Scheduler Loop (Airflow-style)

```python
class CronScheduler:
    def __init__(self, db, workflow_service, check_interval_sec=5):
        self.db = db
        self.workflow_service = workflow_service
        self.check_interval = check_interval_sec

    async def scheduler_loop(self):
        """Main scheduler loop: runs on leader node only."""
        while True:
            now = datetime.utcnow()

            # 1. Fetch all schedules due for execution
            due_schedules = await self.db.query("""
                SELECT * FROM schedules
                WHERE is_paused = FALSE
                  AND next_trigger_at <= $1
                ORDER BY next_trigger_at ASC
                LIMIT 1000
            """, now)

            for schedule in due_schedules:
                await self.trigger_schedule(schedule, now)

            # 2. Sleep until next check
            await asyncio.sleep(self.check_interval)

    async def trigger_schedule(self, schedule: dict, now: datetime):
        # Handle overlap policy
        if schedule["overlap_policy"] == "SKIP":
            running = await self.check_running_instance(schedule["id"])
            if running:
                # Skip this run; advance next_trigger_at anyway
                await self.advance_next_trigger(schedule, now)
                return

        # Start workflow
        await self.workflow_service.start_workflow(
            workflow_type=schedule["workflow_type"],
            workflow_id=f"{schedule['id']}-{now.isoformat()}",
            task_queue=schedule["task_queue"],
            input=schedule["workflow_input"],
        )

        # Advance next trigger time
        await self.advance_next_trigger(schedule, now)

    async def advance_next_trigger(self, schedule: dict, fired_at: datetime):
        next_run = compute_next_run(
            schedule["cron_expression"],
            schedule["timezone"],
            after=fired_at
        )
        await self.db.execute("""
            UPDATE schedules
            SET last_triggered_at = $1,
                next_trigger_at = $2
            WHERE id = $3
        """, fired_at, next_run, schedule["id"])
```

### Timezone Handling

```python
from zoneinfo import ZoneInfo
from croniter import croniter
from datetime import datetime

def compute_next_run(cron_expr: str, timezone: str, after: datetime) -> datetime:
    tz = ZoneInfo(timezone)

    # Convert 'after' to local timezone for croniter (handles DST correctly)
    after_local = after.astimezone(tz)

    cron = croniter(cron_expr, after_local)
    next_run_local = cron.get_next(datetime)

    # Convert back to UTC for storage
    return next_run_local.astimezone(ZoneInfo("UTC"))
```

### Missed Schedule Catch-up

```
Scenario: Scheduler was down for 2 hours. 8 hourly cron runs were missed.

Overlap Policy options:
  SKIP:          Fire only the latest missed run once (most common for ETL)
  BUFFER:        Queue all 8 missed runs (dangerous for long jobs)
  ALLOW:         Fire all missed runs immediately (true backfill)
  CANCEL_OTHER:  Cancel any current run, fire latest missed

Catch-up Window:
  - configurable per schedule (default: 1 hour)
  - only backfill runs within the catch-up window
  - runs older than catch-up window are silently skipped

Implementation:
  On scheduler restart:
    1. For each schedule with last_triggered_at < now:
    2. Compute all missed trigger times between last_triggered_at and now
    3. Apply overlap_policy to determine which to fire
    4. Fire the determined set (respecting catchup_window)
    5. Advance next_trigger_at to the correct future time
```

---

## 10. Worker Heartbeat and Failure Detection

### Heartbeat Protocol

```
Worker lifecycle:

  STARTUP                    RUNNING                    SHUTDOWN
     |                          |                           |
     v                          v                           v
  Register              Send heartbeat             Deregister + drain
  {worker_id,           every T seconds:           in-flight tasks
   capabilities,        {worker_id,
   max_concurrency,      in_flight_tasks,
   task_types}           current_load,
  to Redis               timestamp}
     |                          |
     |                  If heartbeat missed
     |                  for 3*T seconds:
     |                     -> Worker declared DEAD
     |                     -> In-flight tasks reclaimed
     |                     -> Tasks re-enqueued
```

### Failure Detection and Task Reclamation

```python
class HeartbeatMonitor:
    HEARTBEAT_INTERVAL = 10    # workers send every 10s
    TIMEOUT_MULTIPLIER = 3     # declare dead after 30s of silence

    def __init__(self, redis, db):
        self.redis = redis
        self.db = db

    async def monitor_loop(self):
        """Run continuously on scheduler node."""
        while True:
            await self.detect_failed_workers()
            await asyncio.sleep(5)   # check every 5 seconds

    async def detect_failed_workers(self):
        now = time.time()
        deadline = now - (self.HEARTBEAT_INTERVAL * self.TIMEOUT_MULTIPLIER)

        # Get all workers whose last heartbeat is older than deadline
        failed_workers = self.redis.zrangebyscore(
            "worker:heartbeats",
            0,
            deadline
        )

        for worker_id_bytes in failed_workers:
            worker_id = worker_id_bytes.decode()
            await self.reclaim_worker_tasks(worker_id)
            self.redis.zrem("worker:heartbeats", worker_id)

    async def reclaim_worker_tasks(self, worker_id: str):
        # Find all tasks assigned to this worker that are still RUNNING
        stuck_tasks = await self.db.query("""
            SELECT id, workflow_run_id, task_queue, attempt, retry_policy
            FROM tasks
            WHERE worker_id = $1
              AND status = 'RUNNING'
        """, worker_id)

        for task in stuck_tasks:
            # Decide: retry or fail
            retry_policy = task["retry_policy"]
            if task["attempt"] < retry_policy.get("max_attempts", 3):
                # Re-enqueue for retry
                delay = compute_retry_delay(retry_policy, task["attempt"])
                await self.enqueue_task(task, delay)
                await self.db.execute("""
                    UPDATE tasks SET status = 'SCHEDULED', worker_id = NULL,
                    attempt = attempt + 1 WHERE id = $1
                """, task["id"])
            else:
                # Max attempts reached, move to DLQ
                await self.db.execute("""
                    UPDATE tasks SET status = 'FAILED',
                    error = 'Worker died: max retries exceeded'
                    WHERE id = $1
                """, task["id"])
                await self.mark_workflow_failed(task["workflow_run_id"], task["id"])
```

---

## 11. Task State Machine

### State Transitions

```
                        +----------------------------+
                        |         PENDING            |
                        | (created, waiting for deps)|
                        +-----------+----------------+
                                    |
                         all prerequisites met
                                    |
                                    v
                        +----------------------------+
                        |        SCHEDULED           |
                        | (enqueued in task queue)   |
                        +-----------+----------------+
                                    |
                            worker polls task
                                    |
                                    v
                   +------------------------------+
                   |          RUNNING              |
                   |  (worker executing, sending   |
                   |   heartbeats)                 |
                   +---+-------+----------+--------+
                       |       |          |
           task success |  task failure  | heartbeat timeout
                        |       |        | or worker crash
                        v       v        |
             +---------+   +--------+   |
             | SUCCESS |   | FAILED |   |
             +---------+   +----+---+   |
                                |       |
                      +---------v-------v---+
                      |    TIMED_OUT /       |
                      |    FAILED            |
                      +----------+-----------+
                                 |
                    attempt < max_attempts?
                    /                       \
                  YES                        NO
                   |                          |
                   v                          v
          +----------------+        +-------------------+
          |   SCHEDULED    |        |  DEAD_LETTER_QUEUE |
          | (retry with    |        |  (terminal state,  |
          |  backoff delay)|        |   alerts fired)    |
          +----------------+        +-------------------+

Special states:
  CANCELLED   -- workflow was manually cancelled
  SKIPPED     -- conditional branch not taken (Airflow-style)
  DEFERRED    -- task waiting for external signal/approval
```

### State Machine Implementation

```python
from enum import Enum
from typing import Set

class TaskStatus(Enum):
    PENDING    = "PENDING"
    SCHEDULED  = "SCHEDULED"
    RUNNING    = "RUNNING"
    SUCCESS    = "SUCCESS"
    FAILED     = "FAILED"
    TIMED_OUT  = "TIMED_OUT"
    CANCELLED  = "CANCELLED"
    DEFERRED   = "DEFERRED"

# Valid transitions: (from, to)
VALID_TRANSITIONS: Set[tuple] = {
    (TaskStatus.PENDING,    TaskStatus.SCHEDULED),
    (TaskStatus.PENDING,    TaskStatus.CANCELLED),
    (TaskStatus.SCHEDULED,  TaskStatus.RUNNING),
    (TaskStatus.SCHEDULED,  TaskStatus.CANCELLED),
    (TaskStatus.RUNNING,    TaskStatus.SUCCESS),
    (TaskStatus.RUNNING,    TaskStatus.FAILED),
    (TaskStatus.RUNNING,    TaskStatus.TIMED_OUT),
    (TaskStatus.RUNNING,    TaskStatus.CANCELLED),
    (TaskStatus.RUNNING,    TaskStatus.DEFERRED),
    (TaskStatus.FAILED,     TaskStatus.SCHEDULED),  # retry
    (TaskStatus.TIMED_OUT,  TaskStatus.SCHEDULED),  # retry
    (TaskStatus.DEFERRED,   TaskStatus.SCHEDULED),  # signal received
}

def transition(current: TaskStatus, next_state: TaskStatus) -> TaskStatus:
    if (current, next_state) not in VALID_TRANSITIONS:
        raise ValueError(
            f"Invalid transition: {current.value} -> {next_state.value}"
        )
    return next_state
```

---

## 12. Durable Execution (Temporal)

### Event Sourcing Model

Temporal's core innovation: workflows are reconstructed by **replaying their event history**. No workflow state is stored directly -- only the append-only sequence of events.

```
Workflow Event History for order-12345:

Seq  | Event Type              | Attributes
-----|-------------------------|------------------------------------
  1  | WORKFLOW_STARTED        | {input: {order_id: "12345"}}
  2  | TASK_SCHEDULED          | {task_type: "validate_order"}
  3  | TASK_STARTED            | {worker_id: "worker-7", attempt: 1}
  4  | TASK_COMPLETED          | {output: {valid: true}}
  5  | TASK_SCHEDULED          | {task_type: "charge_customer"}
  6  | TASK_SCHEDULED          | {task_type: "reserve_inventory"}
  7  | TASK_STARTED            | {worker_id: "worker-2", attempt: 1}
  8  | TASK_STARTED            | {worker_id: "worker-9", attempt: 1}
  9  | TASK_COMPLETED          | {output: {charge_id: "ch_abc"}}
 10  | TASK_COMPLETED          | {output: {reservation_id: "res_xyz"}}
 11  | TASK_SCHEDULED          | {task_type: "ship_order"}
 ...
```

### Workflow Replay Mechanism

```
Worker crashes at event 8 (reserve_inventory running):

  1. New worker starts for workflow order-12345
  2. Temporal fetches complete event history (events 1-10)
  3. Worker REPLAYS the history:
     - Re-executes workflow code deterministically
     - When code hits "await execute_activity(validate_order)":
       --> History shows TASK_COMPLETED at seq 4 --> returns cached output
     - When code hits "await gather(charge_customer, reserve_inventory)":
       --> History shows both COMPLETED (seq 9, 10) --> returns cached outputs
     - When code hits "await execute_activity(ship_order)":
       --> No completion in history --> actually schedules new task
  4. Execution continues from where it left off

CRITICAL CONSTRAINT: Workflow code must be DETERMINISTIC
  - No random numbers directly
  - No direct time.now() calls (use workflow.now() which uses event timestamp)
  - No external calls outside of activities
  - Non-determinism = replay diverges = broken workflow
```

### Workflow Versioning for Code Changes

```python
# Problem: Deployed workflows cannot have their code changed mid-execution
# Solution: Use workflow.get_version() to branch safely

@workflow.defn
class OrderFulfillmentWorkflow:
    @workflow.run
    async def run(self, order: OrderInput) -> OrderResult:
        # v1 code always used validate_order_v1
        # v2 added a fraud check step

        version = workflow.get_version(
            "add-fraud-check",        # change ID (immutable label)
            min_supported=1,
            max_supported=2
        )

        if version == 1:
            # Old code path (for workflows started before this deployment)
            validated = await workflow.execute_activity(validate_order_v1, order)
        else:
            # New code path (version 2+)
            await workflow.execute_activity(fraud_check, order)
            validated = await workflow.execute_activity(validate_order_v2, order)

        # Continue with rest of workflow...
```

---

## 13. Saga Pattern for Distributed Transactions

### Problem: Multi-service workflows without 2PC

```
Order requires:
  1. Charge payment service    (external)
  2. Reserve inventory service (external)
  3. Book shipping service     (external)

If step 3 fails, we must UNDO steps 1 and 2.
Two-phase commit won't work across microservices.
Solution: SAGA with compensating transactions.
```

### Choreography-based Saga

```
  OrderService          PaymentService        InventoryService       ShippingService
      |                       |                      |                     |
      |--order.created------->|                      |                     |
      |                       |--payment.processed-->|                     |
      |                       |                      |--inventory.reserved>|
      |                       |                      |                  FAIL
      |                       |                      |<-shipping.failed----|
      |                       |<--inventory.released-|
      |                       |<--payment.refunded---|
      |<---order.failed-------|
```

### Orchestration-based Saga (Recommended with Temporal)

```python
@workflow.defn
class OrderSagaWorkflow:
    @workflow.run
    async def run(self, order: OrderInput) -> OrderResult:
        # Track completed steps for compensation
        completed_steps = []

        try:
            # Step 1: Charge payment
            charge = await workflow.execute_activity(
                charge_customer,
                order,
                start_to_close_timeout=timedelta(seconds=30)
            )
            completed_steps.append(("charge", charge))

            # Step 2: Reserve inventory
            reservation = await workflow.execute_activity(
                reserve_inventory,
                order,
                start_to_close_timeout=timedelta(seconds=30)
            )
            completed_steps.append(("reservation", reservation))

            # Step 3: Book shipping
            shipping = await workflow.execute_activity(
                book_shipping,
                order,
                start_to_close_timeout=timedelta(seconds=30)
            )
            completed_steps.append(("shipping", shipping))

            return OrderResult(status="completed", shipping=shipping)

        except Exception as e:
            # Run compensating transactions in REVERSE order
            await self.compensate(completed_steps, order)
            raise

    async def compensate(self, completed_steps: list, order: OrderInput):
        for step_name, step_result in reversed(completed_steps):
            if step_name == "shipping":
                await workflow.execute_activity(
                    cancel_shipping, step_result,
                    retry_policy=RetryPolicy(max_attempts=10)  # must succeed
                )
            elif step_name == "reservation":
                await workflow.execute_activity(
                    release_inventory, step_result,
                    retry_policy=RetryPolicy(max_attempts=10)
                )
            elif step_name == "charge":
                await workflow.execute_activity(
                    refund_payment, step_result,
                    retry_policy=RetryPolicy(max_attempts=10)
                )
```

---

## 14. Rate Limiting and Backpressure

### Task Execution Rate Limiting

```
+-----------------------------------------------------------------------+
|                    RATE LIMITING LAYERS                                |
+-----------------------------------------------------------------------+

Layer 1: Namespace-level (global quota per tenant)
  - Max tasks/sec per namespace (configured in namespace table)
  - Enforced at API Gateway with token bucket algorithm

Layer 2: Task Queue level
  - Max concurrent tasks per queue (prevents queue starvation)
  - Queue depth threshold triggers worker auto-scaling

Layer 3: Worker level
  - Max concurrent goroutines/threads per worker
  - Back-pressure: worker stops polling when at capacity

Layer 4: Downstream dependency
  - Activity workers rate-limit calls to external APIs
  - E.g., Stripe API: 100 req/sec per account
```

### Token Bucket Rate Limiter (per Namespace)

```python
class NamespaceRateLimiter:
    def __init__(self, redis, namespace_id: str, max_tasks_per_sec: int):
        self.redis = redis
        self.key = f"ratelimit:{namespace_id}"
        self.max_per_sec = max_tasks_per_sec

    def allow_task(self) -> bool:
        """Returns True if task is allowed, False if rate limited."""
        now = time.time()
        window_start = int(now)  # 1-second sliding window

        pipe = self.redis.pipeline()
        pipe.zadd(self.key, {f"{now}:{random.random()}": now})
        pipe.zremrangebyscore(self.key, 0, now - 1)  # remove old entries
        pipe.zcard(self.key)
        pipe.expire(self.key, 2)
        results = pipe.execute()

        count = results[2]
        return count <= self.max_per_sec
```

### Backpressure via Queue Depth Monitoring

```
Queue Depth  |  Action
-------------|--------------------------------------------------
0-100        |  Normal: workers poll freely
101-500      |  Warning: trigger worker scale-up
501-1000     |  High: reject new task submissions with 429
1001+        |  Critical: circuit breaker engaged, alert ops
             |  New workflows queued in overflow buffer

auto-scaler watches metrics:
  queue_depth > 200 for 60s  --> scale workers up by 25%
  queue_depth < 10 for 300s  --> scale workers down by 10%
  (with min=2, max=100 workers per queue)
```

---

## 15. Multi-Tenancy and Fair Scheduling

### Namespace Isolation

```
+------------------------------------------------------------------+
|                     MULTI-TENANT SCHEDULER                        |
+------------------------------------------------------------------+

  Namespace A (prod)          Namespace B (staging)       Namespace C (batch)
  max_tasks/sec: 1000         max_tasks/sec: 100           max_tasks/sec: 500
  max_concurrent_wf: 10000    max_concurrent_wf: 1000      max_concurrent_wf: 5000
  |                           |                             |
  v                           v                             v
+----------------+         +----------------+           +----------------+
|  Task Queue A  |         |  Task Queue B  |           |  Task Queue C  |
|  (dedicated)   |         |  (dedicated)   |           |  (dedicated)   |
+----------------+         +----------------+           +----------------+
  |                           |                             |
  +---------------------------+-----------------------------+
                              |
                   +---------------------+
                   |  Fair Scheduler     |
                   |  (weighted round-   |
                   |   robin per ns)     |
                   +---------------------+
                              |
                   +---------------------+
                   |   Shared Worker     |
                   |   Pool (economy)    |
                   +---------------------+
```

### Fair Scheduling Algorithm (Weighted Fair Queuing)

```python
class FairScheduler:
    """
    Weighted Fair Queuing across namespaces.
    Prevents one noisy tenant from starving others.
    """
    def __init__(self, namespaces: list[dict]):
        # namespace: {id, name, weight, max_tasks_per_sec}
        self.queues = {ns["id"]: [] for ns in namespaces}
        self.weights = {ns["id"]: ns["weight"] for ns in namespaces}
        self.virtual_time = {ns["id"]: 0.0 for ns in namespaces}

    def enqueue(self, namespace_id: str, task: dict):
        """Add task to namespace queue with virtual finish time."""
        w = self.weights[namespace_id]
        # Virtual finish time = virtual_start + task_size / weight
        vft = self.virtual_time[namespace_id] + (1.0 / w)
        self.queues[namespace_id].append((vft, task))
        self.virtual_time[namespace_id] = vft

    def dequeue(self) -> dict | None:
        """
        Pick the task with the smallest virtual finish time
        across all non-empty namespace queues.
        """
        candidates = []
        for ns_id, queue in self.queues.items():
            if queue:
                candidates.append((queue[0][0], ns_id))  # (vft, ns_id)

        if not candidates:
            return None

        # Select namespace with minimum virtual finish time
        _, chosen_ns = min(candidates)
        _, task = self.queues[chosen_ns].pop(0)
        return task
```

---

## 16. Scaling Strategy

### Partition Strategy

```
+------------------------------------------------------------------+
|                    HORIZONTAL SCALING                             |
+------------------------------------------------------------------+

Scheduler Service:
  - Scale: 3-5 nodes (active-standby HA via leader election)
  - Partition: leader handles all scheduling; standbys are hot standby
  - Alternative: partition by namespace_id hash for active-active

Task Queues (Redis Cluster):
  - Partition: one queue per {namespace, task_type}
  - Redis Cluster with 6 shards (3 primary + 3 replica)
  - Each shard handles subset of queues (consistent hashing)

Workers:
  - Scale: horizontally per task queue
  - k8s HPA: scale based on queue_depth metric (custom metric via KEDA)
  - Target: keep queue_depth < 100 per worker
  - Spot instances for non-critical batch workloads

Database (PostgreSQL):
  - Primary: handles all writes
  - Read replicas: serve status queries (eventually consistent OK)
  - Partition workflow_executions and tasks tables by (namespace_id, started_at)
  - Archive old completed runs to cold storage (S3) after retention period

Event History (Temporal model):
  - Shard by workflow_id (128 shards default in Temporal Server)
  - Each shard owns a subset of workflows and their event histories
  - Cassandra or CockroachDB for multi-region history storage
```

### Worker Auto-Scaling with KEDA

```yaml
# k8s KEDA ScaledObject for worker auto-scaling
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: order-fulfillment-workers
spec:
  scaleTargetRef:
    name: order-fulfillment-worker
  minReplicaCount: 2
  maxReplicaCount: 50
  cooldownPeriod: 60
  triggers:
  - type: redis
    metadata:
      address: redis-cluster:6379
      listName: "tasks:order-fulfillment:normal"
      listLength: "10"        # scale up when > 10 tasks per replica
```

### Database Partitioning

```sql
-- Partition workflow_executions by month for efficient archival
CREATE TABLE workflow_executions_2026_03
  PARTITION OF workflow_executions
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

-- Auto-archive completed runs older than retention_days
CREATE OR REPLACE PROCEDURE archive_old_executions()
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO workflow_executions_archive
  SELECT we.* FROM workflow_executions we
  JOIN namespaces n ON we.namespace_id = n.id
  WHERE we.status IN ('SUCCESS', 'FAILED', 'CANCELLED')
    AND we.closed_at < NOW() - (n.retention_days || ' days')::interval;

  DELETE FROM workflow_executions we
  USING namespaces n
  WHERE we.namespace_id = n.id
    AND we.status IN ('SUCCESS', 'FAILED', 'CANCELLED')
    AND we.closed_at < NOW() - (n.retention_days || ' days')::interval;
END;
$$;
```

---

## 17. Comparison: Build vs Buy

| Dimension | Build Custom | Temporal (managed) | Airflow (self-hosted) | Celery |
|-----------|-------------|-------------------|----------------------|--------|
| **Setup time** | 6-12 months | Hours (Temporal Cloud) | 1-2 weeks | Days |
| **Operational cost** | High (infra team) | Medium (SaaS fees) | High (infra + ops) | Low-Medium |
| **Exactly-once** | Must build yourself | Built-in | Manual effort | No |
| **Durable execution** | Complex to implement | Core feature | Not supported | No |
| **Long-running workflows** | Possible | Excellent (years) | Poor | Poor |
| **Visibility** | Custom build | Temporal Web UI | Airflow UI | Flower |
| **Cost at scale** | High initially, lower long-term | ~$0.25/1M workflow actions | Infra cost | Very low |
| **DAG/ETL workflows** | Custom | Possible but verbose | Excellent | Limited |
| **Microservice orchestration** | Custom | Excellent | Awkward | Limited |
| **Multi-language workers** | Custom | Go, Java, Python, TS, .NET, PHP | Python-only | Python-only |
| **When to choose** | Unique requirements, full control | Microservice workflows, reliability | Batch ETL, data pipelines | Simple async tasks |

---

## 18. Trade-offs

### Database-backed vs Queue-backed Scheduling

```
+----------------------------------+------------------------------------+
|  DATABASE-BACKED (polling)       |  QUEUE-BACKED (push)              |
+----------------------------------+------------------------------------+
|  Pros:                           |  Pros:                             |
|  - Strong consistency            |  - Low latency dispatch            |
|  - Easy to query/audit           |  - High throughput                 |
|  - Exactly-once via DB locks     |  - Decoupled from DB               |
|  - Simpler architecture          |  - Natural backpressure            |
+----------------------------------+------------------------------------+
|  Cons:                           |  Cons:                             |
|  - DB polling adds load          |  - Harder exactly-once guarantee   |
|  - Latency: poll interval        |  - Message loss if broker fails    |
|  - Bottleneck at high scale      |  - Complex dead letter handling    |
+----------------------------------+------------------------------------+
|  Best for: < 1K tasks/sec,       |  Best for: > 1K tasks/sec,        |
|  strong consistency needed       |  latency-sensitive                 |
+----------------------------------+------------------------------------+
```

### Workflow-as-Code vs DAG-as-Config

| Aspect | Workflow-as-Code (Temporal) | DAG-as-Config (Airflow) |
|--------|---------------------------|------------------------|
| **Flexibility** | Full programming language power | Limited to DAG operators |
| **Testing** | Unit test with standard tools | Harder to unit test |
| **Learning curve** | Higher (new programming model) | Lower (Python config) |
| **Dynamic workflows** | Native (loops, conditionals, recursion) | Limited |
| **Versioning** | Built-in workflow versioning API | Manual (DAG file management) |
| **Determinism requirement** | Strict (replay-based) | None |

### Key Design Trade-offs

| Decision | Option A | Option B | Recommendation |
|----------|----------|----------|----------------|
| Task queue backend | Redis (lower latency) | Kafka (higher durability) | Redis for tasks < 1MB; Kafka for event-driven triggers |
| Scheduler HA | Single leader (simple) | Active-active with sharding | Single leader + fast failover for < 100K schedules |
| State storage | PostgreSQL (ACID) | Cassandra (scale) | PostgreSQL up to 50K concurrent workflows; Cassandra beyond |
| Worker polling | Short poll (1s) | Long poll (20s) | Long poll: reduces DB load by 20x |
| History storage | Relational DB | Append-only log (Kafka/S3) | Append-only log for Temporal-style replay |

---

## 19. Common Interview Follow-ups

### Q: How do you prevent duplicate task execution?

**A:** Three layers of defense:
1. **Idempotency keys**: Every task has a unique `task_token`. Workers check for existing `SUCCESS` records before executing.
2. **Database constraints**: `UNIQUE(namespace_id, workflow_id)` prevents duplicate workflow starts.
3. **Optimistic locking**: Update task status atomically: `UPDATE tasks SET status='RUNNING' WHERE id=$1 AND status='SCHEDULED'`. If 0 rows updated, another worker claimed it.

### Q: How does Temporal handle workflow versioning when you need to change workflow code?

**A:** Temporal provides `workflow.get_version(changeId, minSupported, maxSupported)`. Running workflows are replaying their history -- you can't change the code path mid-replay. The versioning API lets you branch: old in-flight workflows follow the old code path (version 1), new workflows follow the new code path (version 2). After all v1 workflows complete, remove the v1 branch.

### Q: How do you handle a task that takes longer than expected?

**A:** Three mechanisms:
1. **Heartbeat extension**: Worker sends periodic heartbeats to extend the task deadline. If heartbeats stop, the task is timed out after `heartbeat_timeout`.
2. **Execution timeout**: Hard cap on total execution time; task is killed and retried or failed.
3. **Async tasks**: For very long operations, use async task pattern -- worker returns immediately with a callback URL, external system calls back when done (Temporal's `wait_for_signal`).

### Q: How do you scale to 100K tasks/sec?

**A:**
- **Partition task queues** by `(task_type, namespace)` -- each queue scales independently.
- **Shard the scheduler** by workflow namespace or ID hash range.
- **Use Kafka instead of Redis** for task queues at this scale (Kafka partition consumers = dedicated worker groups).
- **Separate hot and cold paths**: short-lived tasks use in-memory queues; long-running workflows use DB-backed state.
- **Horizontally scale workers** using KEDA based on queue depth metrics.

### Q: How do you implement workflow search/visibility?

**A:** Dual-write pattern:
1. All workflow state changes write to **PostgreSQL** (source of truth).
2. An async stream (Debezium CDC) indexes workflow attributes into **Elasticsearch**.
3. Search API queries Elasticsearch for filters like `status = FAILED AND started_at > 7d ago`.
4. For Temporal Cloud: they use Elasticsearch natively for workflow visibility.
5. Add `search_attributes` JSONB column to workflow_executions for custom per-workflow tags (e.g., `{"order_id": "12345", "customer_tier": "premium"}`).

### Q: How do you handle the Airflow scheduler being a single point of failure?

**A:**
- **Airflow 2.6+ High Availability**: Multiple scheduler processes using distributed locks (Postgres advisory locks or database row locking) to coordinate without stepping on each other.
- **Leader election**: Each scheduler tries to acquire a lock on each DAG. First to acquire runs the scheduling loop for that DAG.
- **Database as coordination layer**: Since Airflow's scheduler loop queries the DB to find tasks to run, multiple schedulers can run simultaneously -- they use `SELECT FOR UPDATE SKIP LOCKED` to claim DagRuns without double-processing.
- **Failover time**: < 30 seconds (next DB poll cycle of the standby picks up the work).

### Q: What's the difference between Temporal's workflow history and a traditional event log?

**A:** Temporal's history is a **deterministic replay log** -- not just an audit log. Key differences:
- It's the **ground truth for workflow state** (not a secondary audit log).
- It enables **exact replay**: given the history, you can reconstruct the exact workflow state at any point.
- It captures **both commands and responses**: `TASK_SCHEDULED`, `TASK_STARTED`, `TASK_COMPLETED` with full inputs/outputs.
- It supports **time travel debugging**: replay history up to event N to debug what happened.
- Size concern: large histories (>50K events) slow down replay. Use `continueAsNew` to reset history periodically for long-running workflows.

### Q: How do you implement fair scheduling across tenants without starvation?

**A:** **Weighted Fair Queuing (WFQ)**:
- Each namespace has a `weight` proportional to their SLA tier (e.g., paid=10, free=1).
- Track `virtual finish time` per namespace: `vft += task_cost / weight`.
- Always pick the task with the smallest `vft` across all namespaces.
- This mathematically guarantees: over any interval, each namespace gets tasks proportional to its weight, and no namespace ever starves (even low-weight free tier always makes progress).
- Additionally, enforce hard rate limits (token bucket per namespace) as a ceiling.

### Q: How does Celery compare to Temporal for microservice orchestration?

**A:** Celery is a task queue, not a workflow orchestrator:
- **Celery**: Enqueue individual tasks; use `chains` and `chords` for simple sequencing. No native saga support, no durable execution, best-effort delivery unless configured carefully with `acks_late=True` and idempotent tasks.
- **Temporal**: Workflow-centric; handles multi-step orchestration, error propagation, compensation, and long-running state natively.
- For microservice orchestration with distributed transactions, Temporal is far superior. Celery shines for simple fire-and-forget async tasks like sending emails or generating thumbnails.

### Q: How would you implement a distributed cron that doesn't fire duplicate runs?

**A:**
1. **Leader election**: Only the leader node fires cron triggers. Standbys are idle but ready to take over within 5-10 seconds via etcd watch.
2. **Idempotent trigger records**: Before starting a workflow, insert a record into a `schedule_runs` table with `UNIQUE(schedule_id, scheduled_at)`. If insert fails (duplicate), skip.
3. **Workflow ID includes timestamp**: `workflow_id = f"{schedule_id}-{scheduled_at_epoch}"`. Since `workflow_id` is unique per namespace, attempting to start a duplicate is a no-op.
4. **Distributed lock**: Use Redis `SET NX EX` (set if not exists, with expiry) as a per-trigger mutex. Only the process that acquires the lock fires the trigger.
