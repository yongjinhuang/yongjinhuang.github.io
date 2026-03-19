# Design a Task Scheduler

A task scheduler is a system that manages the execution of jobs based on schedules, priorities,
and dependencies. This problem tests your knowledge of priority queues, directed acyclic graphs
(DAGs), threading, and retry logic. It appears frequently in interviews for backend and
infrastructure roles.

---

## Table of Contents

1. [Requirements](#1-requirements)
2. [Class Diagram](#2-class-diagram)
3. [Core Implementation](#3-core-implementation)
4. [Cron-Like Scheduling](#4-cron-like-scheduling)
5. [Task Dependencies (DAG)](#5-task-dependencies-dag)
6. [Retry Logic and Dead Letter Queue](#6-retry-logic-and-dead-letter-queue)
7. [Threaded Executor](#7-threaded-executor)
8. [Interview Walkthrough](#8-interview-walkthrough)
9. [Common Follow-Up Questions](#9-common-follow-up-questions)
10. [Gotchas](#10-gotchas)
11. [Quick Reference](#11-quick-reference)

---

## 1. Requirements

### Functional Requirements

| #   | Requirement         | Details                                               |
| --- | ------------------- | ----------------------------------------------------- |
| F1  | Submit tasks        | Submit a callable with priority and schedule          |
| F2  | Priority execution  | Higher priority tasks execute first                   |
| F3  | Scheduled execution | Run tasks at specific times or intervals              |
| F4  | Task dependencies   | Task B runs only after Task A completes               |
| F5  | Retry on failure    | Configurable retry count with backoff                 |
| F6  | Dead letter queue   | Failed tasks (after retries) go to DLQ for inspection |
| F7  | Cancel tasks        | Cancel pending or scheduled tasks                     |

### Non-Functional Requirements

| #   | Requirement                                |
| --- | ------------------------------------------ |
| NF1 | Thread-safe execution                      |
| NF2 | Concurrent task execution (thread pool)    |
| NF3 | No task executed before its scheduled time |
| NF4 | Dependencies respected (topological order) |

---

## 2. Class Diagram

```
+-------------------+       +---------------------+
|   TaskStatus      |       |   TaskPriority      |
|   (Enum)          |       |   (Enum)            |
|-------------------|       |---------------------|
| PENDING           |       | LOW = 0             |
| SCHEDULED         |       | MEDIUM = 1          |
| RUNNING           |       | HIGH = 2            |
| COMPLETED         |       | CRITICAL = 3        |
| FAILED            |       +---------------------+
| CANCELLED         |
| DEAD_LETTERED     |       +---------------------+
+-------------------+       |   RetryPolicy       |
                            |---------------------|
+-------------------+       | max_retries         |
|   Task            |       | backoff_base        |
|-------------------|       | backoff_max         |
| id                |       +---------------------+
| name              |
| callable          |       +---------------------+
| priority          |       |   CronSchedule      |
| status            |       |---------------------|
| scheduled_at      |       | expression          |
| retry_policy      |       | next_run_time()     |
| dependencies      |       +---------------------+
| result            |
| error             |       +---------------------+
+-------------------+       |   TaskScheduler     |
                            |---------------------|
+-------------------+       | task_queue (heap)   |
|   DAGExecutor     |       | workers (pool)      |
|-------------------|       | dead_letter_queue   |
| graph             |       |---------------------|
| in_degree         |       | submit(task)        |
|-------------------|       | schedule(task, cron)|
| add_dependency()  |       | cancel(task_id)     |
| execute()         |       | start()             |
| topological_sort()|       | shutdown()          |
+-------------------+       +---------------------+
```

---

## 3. Core Implementation

### Enums and Data Classes

```python
from enum import Enum
from dataclasses import dataclass, field
from typing import Callable, Any
import uuid
import time


class TaskStatus(Enum):
    PENDING = "pending"
    SCHEDULED = "scheduled"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    DEAD_LETTERED = "dead_lettered"


class TaskPriority(Enum):
    LOW = 0
    MEDIUM = 1
    HIGH = 2
    CRITICAL = 3


@dataclass
class RetryPolicy:
    max_retries: int = 3
    backoff_base: float = 1.0    # seconds
    backoff_max: float = 60.0    # max backoff cap

    def get_delay(self, attempt: int) -> float:
        """Exponential backoff: base * 2^attempt, capped at max."""
        delay = self.backoff_base * (2 ** attempt)
        return min(delay, self.backoff_max)
```

### Task Class

```python
@dataclass
class Task:
    name: str
    func: Callable[[], Any]
    priority: TaskPriority = TaskPriority.MEDIUM
    retry_policy: RetryPolicy = field(default_factory=RetryPolicy)
    scheduled_at: float | None = None  # Unix timestamp, None = immediate
    dependencies: list[str] = field(default_factory=list)  # Task IDs
    task_id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    status: TaskStatus = TaskStatus.PENDING
    result: Any = None
    error: str | None = None
    attempt: int = 0
    created_at: float = field(default_factory=time.time)

    def __lt__(self, other: "Task") -> bool:
        """Priority queue ordering: higher priority first, then earlier scheduled."""
        if self.priority != other.priority:
            return self.priority.value > other.priority.value
        scheduled_self = self.scheduled_at or 0
        scheduled_other = other.scheduled_at or 0
        return scheduled_self < scheduled_other

    def is_ready(self) -> bool:
        """Check if the task is ready to execute (scheduled time passed)."""
        if self.scheduled_at is None:
            return True
        return time.time() >= self.scheduled_at
```

---

## 4. Cron-Like Scheduling

A simplified cron expression parser for recurring tasks.

```python
from datetime import datetime, timedelta


class CronSchedule:
    """
    Simplified cron: supports interval-based scheduling.
    Real cron parsing is complex; this covers the interview case.
    """

    def __init__(self, interval_seconds: int | None = None,
                 run_at_hour: int | None = None,
                 run_at_minute: int | None = None):
        self._interval = interval_seconds
        self._run_at_hour = run_at_hour
        self._run_at_minute = run_at_minute
        self._last_run: float | None = None

    def next_run_time(self) -> float:
        """Calculate the next run time as a unix timestamp."""
        now = time.time()

        if self._interval is not None:
            if self._last_run is None:
                return now
            return self._last_run + self._interval

        # Daily at specific time
        if self._run_at_hour is not None:
            today = datetime.now().replace(
                hour=self._run_at_hour,
                minute=self._run_at_minute or 0,
                second=0,
                microsecond=0,
            )
            if today.timestamp() <= now:
                today += timedelta(days=1)
            return today.timestamp()

        return now

    def mark_executed(self) -> None:
        self._last_run = time.time()


# Usage examples:
# Every 5 minutes
every_5min = CronSchedule(interval_seconds=300)

# Daily at 2:30 AM
daily_2_30am = CronSchedule(run_at_hour=2, run_at_minute=30)
```

---

## 5. Task Dependencies (DAG)

When tasks have dependencies, they form a Directed Acyclic Graph. We use topological sort
to determine execution order.

```python
from collections import defaultdict, deque


class DAGExecutor:
    """Manages task dependencies using topological sort."""

    def __init__(self):
        self._graph: dict[str, list[str]] = defaultdict(list)  # task -> dependents
        self._in_degree: dict[str, int] = defaultdict(int)
        self._tasks: dict[str, Task] = {}

    def add_task(self, task: Task) -> None:
        self._tasks[task.task_id] = task
        if task.task_id not in self._in_degree:
            self._in_degree[task.task_id] = 0

        for dep_id in task.dependencies:
            self._graph[dep_id].append(task.task_id)
            self._in_degree[task.task_id] += 1

    def get_ready_tasks(self, completed_ids: set[str]) -> list[Task]:
        """Return tasks whose dependencies are all completed."""
        ready = []
        for task_id, task in self._tasks.items():
            if task.status != TaskStatus.PENDING:
                continue
            deps_met = all(dep in completed_ids for dep in task.dependencies)
            if deps_met:
                ready.append(task)
        return ready

    def topological_sort(self) -> list[str]:
        """Return task IDs in valid execution order. Raises if cycle detected."""
        in_degree = dict(self._in_degree)
        queue = deque([tid for tid, deg in in_degree.items() if deg == 0])
        order = []

        while queue:
            task_id = queue.popleft()
            order.append(task_id)
            for dependent in self._graph[task_id]:
                in_degree[dependent] -= 1
                if in_degree[dependent] == 0:
                    queue.append(dependent)

        if len(order) != len(self._tasks):
            raise ValueError("Circular dependency detected!")

        return order

    def has_cycle(self) -> bool:
        try:
            self.topological_sort()
            return False
        except ValueError:
            return True
```

### DAG Visualization

```
Task A (no deps)      Task B (no deps)
   \                    /
    \                  /
     v                v
      Task C (depends on A, B)
           |
           v
      Task D (depends on C)
```

```python
# Building the DAG
dag = DAGExecutor()

task_a = Task("Fetch Data", lambda: "data_a", task_id="A")
task_b = Task("Fetch Config", lambda: "config_b", task_id="B")
task_c = Task("Process", lambda: "processed", dependencies=["A", "B"], task_id="C")
task_d = Task("Upload", lambda: "uploaded", dependencies=["C"], task_id="D")

dag.add_task(task_a)
dag.add_task(task_b)
dag.add_task(task_c)
dag.add_task(task_d)

order = dag.topological_sort()  # ["A", "B", "C", "D"] or ["B", "A", "C", "D"]
```

---

## 6. Retry Logic and Dead Letter Queue

```python
class DeadLetterQueue:
    """Stores tasks that failed after all retries for manual inspection."""

    def __init__(self):
        self._queue: list[Task] = []

    def add(self, task: Task) -> None:
        self._queue = [*self._queue, task]

    def get_all(self) -> list[Task]:
        return list(self._queue)

    def retry(self, task_id: str) -> Task | None:
        """Pull a task out of DLQ for manual retry."""
        for i, task in enumerate(self._queue):
            if task.task_id == task_id:
                self._queue = [*self._queue[:i], *self._queue[i + 1:]]
                task.status = TaskStatus.PENDING
                task.attempt = 0
                task.error = None
                return task
        return None

    def __len__(self) -> int:
        return len(self._queue)


class TaskRunner:
    """Executes a single task with retry logic."""

    def __init__(self, dlq: DeadLetterQueue):
        self._dlq = dlq

    def run(self, task: Task) -> Task:
        """Execute a task, retrying on failure according to its retry policy."""
        while task.attempt <= task.retry_policy.max_retries:
            task.status = TaskStatus.RUNNING
            try:
                task.result = task.func()
                task.status = TaskStatus.COMPLETED
                return task
            except Exception as e:
                task.attempt += 1
                task.error = str(e)

                if task.attempt > task.retry_policy.max_retries:
                    task.status = TaskStatus.DEAD_LETTERED
                    self._dlq.add(task)
                    return task

                # Wait before retry (exponential backoff)
                delay = task.retry_policy.get_delay(task.attempt - 1)
                time.sleep(delay)

        return task
```

---

## 7. Threaded Executor

Putting it all together with a thread pool for concurrent execution.

```python
import heapq
import threading
from concurrent.futures import ThreadPoolExecutor, Future


class TaskScheduler:
    def __init__(self, max_workers: int = 4):
        self._task_queue: list[Task] = []  # Min-heap (priority queue)
        self._tasks: dict[str, Task] = {}
        self._dlq = DeadLetterQueue()
        self._runner = TaskRunner(self._dlq)
        self._pool = ThreadPoolExecutor(max_workers=max_workers)
        self._lock = threading.Lock()
        self._running = False
        self._scheduler_thread: threading.Thread | None = None
        self._recurring: dict[str, CronSchedule] = {}

    def submit(self, task: Task) -> str:
        """Submit a task for execution."""
        with self._lock:
            self._tasks[task.task_id] = task
            heapq.heappush(self._task_queue, task)
        return task.task_id

    def schedule(self, task: Task, cron: CronSchedule) -> str:
        """Schedule a recurring task."""
        task.scheduled_at = cron.next_run_time()
        self._recurring[task.task_id] = cron
        return self.submit(task)

    def cancel(self, task_id: str) -> bool:
        """Cancel a pending task."""
        with self._lock:
            if task_id in self._tasks:
                task = self._tasks[task_id]
                if task.status == TaskStatus.PENDING:
                    task.status = TaskStatus.CANCELLED
                    return True
            return False

    def start(self) -> None:
        """Start the scheduler loop in a background thread."""
        self._running = True
        self._scheduler_thread = threading.Thread(target=self._run_loop, daemon=True)
        self._scheduler_thread.start()

    def shutdown(self, wait: bool = True) -> None:
        """Stop the scheduler and wait for running tasks."""
        self._running = False
        if self._scheduler_thread:
            self._scheduler_thread.join(timeout=5)
        self._pool.shutdown(wait=wait)

    def get_task_status(self, task_id: str) -> TaskStatus | None:
        task = self._tasks.get(task_id)
        return task.status if task else None

    def get_dlq(self) -> list[Task]:
        return self._dlq.get_all()

    def _run_loop(self) -> None:
        """Main scheduler loop: poll queue and dispatch ready tasks."""
        while self._running:
            with self._lock:
                ready_tasks = self._get_ready_tasks()

            for task in ready_tasks:
                self._pool.submit(self._execute_task, task)

            time.sleep(0.1)  # Polling interval

    def _get_ready_tasks(self) -> list[Task]:
        """Extract tasks that are ready to run from the priority queue."""
        ready = []
        temp = []

        while self._task_queue:
            task = heapq.heappop(self._task_queue)

            if task.status == TaskStatus.CANCELLED:
                continue

            if task.is_ready() and task.status == TaskStatus.PENDING:
                ready.append(task)
            else:
                temp.append(task)

        for task in temp:
            heapq.heappush(self._task_queue, task)

        return ready

    def _execute_task(self, task: Task) -> None:
        """Execute a task and handle recurring rescheduling."""
        result_task = self._runner.run(task)

        # Reschedule recurring tasks
        if result_task.task_id in self._recurring and result_task.status == TaskStatus.COMPLETED:
            cron = self._recurring[result_task.task_id]
            cron.mark_executed()

            new_task = Task(
                name=result_task.name,
                func=result_task.func,
                priority=result_task.priority,
                retry_policy=result_task.retry_policy,
                scheduled_at=cron.next_run_time(),
                task_id=result_task.task_id + "-next",
            )
            self._recurring[new_task.task_id] = cron
            del self._recurring[result_task.task_id]
            self.submit(new_task)
```

### Usage Demo

```python
scheduler = TaskScheduler(max_workers=4)

# One-time task
task1 = Task("Send Email", lambda: print("Email sent!"), priority=TaskPriority.HIGH)
scheduler.submit(task1)

# Scheduled task (run in 5 seconds)
task2 = Task("Generate Report", lambda: print("Report generated!"),
             scheduled_at=time.time() + 5)
scheduler.submit(task2)

# Recurring task (every 60 seconds)
task3 = Task("Health Check", lambda: print("System healthy!"))
scheduler.schedule(task3, CronSchedule(interval_seconds=60))

# Task with retry
flaky_task = Task(
    "Call External API",
    lambda: (_ for _ in ()).throw(ConnectionError("Timeout")),
    retry_policy=RetryPolicy(max_retries=3, backoff_base=1.0),
)
scheduler.submit(flaky_task)

scheduler.start()
time.sleep(10)
scheduler.shutdown()

# Check DLQ
for dead_task in scheduler.get_dlq():
    print(f"DLQ: {dead_task.name} - {dead_task.error}")
```

---

## 8. Interview Walkthrough

### Step 1: Clarify (3 min)

- "What types of tasks?" (Any callable -- Python functions)
- "How are priorities handled?" (Priority queue -- higher priority first)
- "Do tasks have dependencies?" (Yes, DAG-based execution order)
- "What happens on failure?" (Retry with backoff, then dead letter queue)

### Step 2: Core Design (5 min)

Identify three key components:

1. **Task** -- the unit of work with metadata
2. **TaskScheduler** -- priority queue + thread pool
3. **DAGExecutor** -- dependency resolution

### Step 3: Implement (20-25 min)

Start with Task dataclass, then the priority queue-based scheduler, then add retry logic.

### Step 4: Extend (5 min)

Discuss: distributed scheduler (multiple workers across machines), task persistence
(store in database), monitoring dashboards.

---

## 9. Common Follow-Up Questions

### "How would you make this distributed?"

Use a shared task queue (Redis, RabbitMQ). Workers poll from the queue. Use distributed
locks for deduplication. Store task state in a database (PostgreSQL).

### "How would you handle task timeout?"

Add a `timeout` field to Task. Use `concurrent.futures.Future.result(timeout=N)`.
If it times out, cancel the future and mark the task for retry.

### "How would you persist tasks across restarts?"

Serialize tasks to a database before execution. On startup, reload pending and scheduled
tasks. Use a `task_runs` table to track execution history.

### "What about idempotency?"

Tasks should be designed to be safely re-executed. Use unique execution IDs and check
"has this already been done?" before running. Critical for retry scenarios.

---

## 10. Gotchas

- **Priority inversion:** A CRITICAL task waiting for a LOW task in the DAG. The LOW task
  should inherit the higher priority. Mention this edge case.

- **Heap reordering:** Python's `heapq` does not support re-prioritizing an existing item.
  If you need to change priority, mark the old entry as cancelled and insert a new one.

- **Thread safety in the queue:** Multiple threads calling `submit()` and `_get_ready_tasks()`
  simultaneously can corrupt the heap. Always use a lock.

- **Starvation:** Low-priority tasks never run if high-priority tasks keep arriving. Add an
  aging mechanism: increase priority over time for tasks waiting too long.

- **Cron drift:** If a task takes longer than its interval, the next run should be scheduled
  from the _intended_ time, not from completion time. Otherwise, intervals slowly drift.

---

## 11. Quick Reference

```
+----------------------------+----------------------------------------+
| Component                  | Key Responsibility                     |
+----------------------------+----------------------------------------+
| Task                       | Unit of work + metadata (priority, etc)|
| TaskScheduler              | Priority queue + thread pool dispatch   |
| CronSchedule               | Recurring schedule calculation          |
| DAGExecutor                | Dependency resolution via topo sort     |
| TaskRunner                 | Execute with retry + exponential backoff|
| DeadLetterQueue            | Store permanently failed tasks          |
+----------------------------+----------------------------------------+

Data Structures:
- Priority Queue (min-heap) -> O(log n) insert, O(log n) extract-min
- DAG (adjacency list)      -> O(V + E) topological sort
- Thread Pool               -> Bounded concurrency

Retry Strategy:
  Attempt 1: immediate
  Attempt 2: wait 1s   (backoff_base * 2^0)
  Attempt 3: wait 2s   (backoff_base * 2^1)
  Attempt 4: wait 4s   (backoff_base * 2^2)
  ... capped at backoff_max
  After max_retries: -> Dead Letter Queue
```
