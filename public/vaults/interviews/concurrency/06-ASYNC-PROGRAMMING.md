# Async Programming Deep Dive

This file goes far beyond the basic asyncio patterns covered in the LLD concurrency file.
It covers event loop internals, structured concurrency, backpressure, error handling with
exception groups, and production-ready async patterns.

---

## Table of Contents

1. [Event Loop Internals](#1-event-loop-internals)
2. [Coroutines vs Threads vs Processes Decision Tree](#2-decision-tree)
3. [asyncio Patterns](#3-asyncio-patterns)
4. [Structured Concurrency](#4-structured-concurrency)
5. [Error Handling in Async Code](#5-error-handling-in-async-code)
6. [Async Generators and Context Managers](#6-async-generators-and-context-managers)
7. [Common Pitfalls](#7-common-pitfalls)
8. [Backpressure Handling](#8-backpressure-handling)
9. [Complete Examples](#9-complete-examples)
10. [Common Interview Questions](#10-common-interview-questions)
11. [Gotchas](#11-gotchas)
12. [Quick Reference](#12-quick-reference)

---

## 1. Event Loop Internals

The event loop is the engine that drives all async execution. Understanding its internals
separates juniors from seniors in interviews.

### How the Event Loop Works

```
Event Loop Architecture:

+-----------------------------------------------------------+
|                      EVENT LOOP                            |
|                                                            |
|  1. Check ready queue for runnable coroutines              |
|  2. Run the next coroutine until it hits an 'await'        |
|  3. Register the awaited I/O with the OS (epoll/kqueue)   |
|  4. Check for completed I/O events                        |
|  5. Move completed coroutines back to the ready queue     |
|  6. Repeat from step 1                                    |
|                                                            |
|  +----------+     +-----------+     +------------------+  |
|  | Ready    | --> | Running   | --> | Waiting for I/O  |  |
|  | Queue    |     | Coroutine |     | (OS multiplexer) |  |
|  +----------+     +-----------+     +------------------+  |
|       ^                                     |              |
|       |           I/O complete              |              |
|       +-------------------------------------+              |
+-----------------------------------------------------------+
```

### Under the Hood: OS I/O Multiplexing

```
The event loop uses OS-level I/O multiplexing:
  Linux:   epoll    (efficient for thousands of connections)
  macOS:   kqueue   (BSD-style I/O event notification)
  Windows: IOCP     (I/O Completion Ports)

These allow ONE thread to monitor THOUSANDS of sockets:

Traditional (one thread per connection):
  Thread 1: [wait for socket 1]  (blocked, using 8MB stack)
  Thread 2: [wait for socket 2]  (blocked, using 8MB stack)
  Thread 3: [wait for socket 3]  (blocked, using 8MB stack)
  10000 connections = 10000 threads = 80GB memory

Event loop (one thread, many connections):
  Thread 1: epoll_wait([socket_1, socket_2, ... socket_10000])
            --> socket_42 is ready! Run its coroutine.
            --> socket_7 is ready! Run its coroutine.
  10000 connections = 1 thread = ~10MB memory
```

### Event Loop Single Iteration

```python
import asyncio
import selectors


def simplified_event_loop():
    """Conceptual event loop (simplified for understanding).

    Real asyncio is much more complex, but this captures the core idea.
    """
    ready_queue = []        # Coroutines ready to run
    io_waiters = {}         # fd -> coroutine mapping
    selector = selectors.DefaultSelector()

    while ready_queue or io_waiters:
        # Step 1: Run all ready coroutines
        while ready_queue:
            coroutine = ready_queue.pop(0)
            try:
                # Run until next await point
                awaited_fd = coroutine.send(None)
                if awaited_fd is not None:
                    # Coroutine is waiting for I/O
                    io_waiters[awaited_fd] = coroutine
                    selector.register(awaited_fd, selectors.EVENT_READ)
            except StopIteration:
                pass  # Coroutine finished

        # Step 2: Wait for I/O events (blocks if nothing is ready)
        timeout = 0 if ready_queue else None
        events = selector.select(timeout=timeout)

        # Step 3: Move completed I/O coroutines to ready queue
        for key, mask in events:
            fd = key.fileobj
            if fd in io_waiters:
                coroutine = io_waiters.pop(fd)
                selector.unregister(fd)
                ready_queue.append(coroutine)
```

---

## 2. Decision Tree

```
Choosing Between Coroutines, Threads, and Processes:

Is the work CPU-bound?
|
+-- YES --> Use multiprocessing (or ProcessPoolExecutor)
|           Python's GIL prevents thread-level CPU parallelism
|
+-- NO (I/O-bound) -->
    |
    How many concurrent connections/operations?
    |
    +-- < 100 --> threading is fine (simpler, good library support)
    |
    +-- 100 - 10,000 --> asyncio is better (less memory, no context switch)
    |
    +-- > 10,000 --> asyncio is required (threads cannot scale this far)
    |
    Do all your libraries support async?
    |
    +-- YES --> asyncio
    |
    +-- NO (some libraries are sync-only) -->
        |
        Use asyncio + loop.run_in_executor() for sync libraries
        Or use threading if most work is sync

Mixed CPU + I/O workloads:
  Use ProcessPoolExecutor for CPU work
  Use asyncio for I/O coordination
  Bridge with loop.run_in_executor(process_pool, cpu_func)
```

---

## 3. asyncio Patterns

### gather: Run Multiple Coroutines Concurrently

```python
import asyncio


async def fetch_user(user_id: int) -> dict:
    await asyncio.sleep(0.1)  # Simulate API call
    return {"id": user_id, "name": f"User {user_id}"}


async def gather_example():
    """Run multiple coroutines concurrently and collect all results."""
    # All three fetches run concurrently (~0.1s total, not ~0.3s)
    results = await asyncio.gather(
        fetch_user(1),
        fetch_user(2),
        fetch_user(3),
    )
    return results  # [{"id": 1, ...}, {"id": 2, ...}, {"id": 3, ...}]


async def gather_with_error_handling():
    """return_exceptions=True prevents one failure from cancelling others."""
    results = await asyncio.gather(
        fetch_user(1),
        fetch_user(2),
        fetch_user(3),
        return_exceptions=True,  # Errors returned as values, not raised
    )
    successes = [r for r in results if not isinstance(r, Exception)]
    failures = [r for r in results if isinstance(r, Exception)]
    return successes, failures
```

### wait: Fine-Grained Control

```python
import asyncio


async def wait_example():
    """wait() gives you more control than gather()."""
    tasks = [
        asyncio.create_task(fetch_user(i))
        for i in range(5)
    ]

    # Wait for first completion
    done, pending = await asyncio.wait(
        tasks, return_when=asyncio.FIRST_COMPLETED
    )
    first_result = done.pop().result()

    # Wait for all with timeout
    done, pending = await asyncio.wait(
        pending, timeout=2.0
    )

    # Cancel any remaining tasks
    for task in pending:
        task.cancel()
```

### as_completed: Process Results as They Arrive

```python
import asyncio


async def as_completed_example():
    """Process results in completion order, not submission order."""
    tasks = [
        asyncio.create_task(fetch_user(i))
        for i in range(10)
    ]

    results = []
    for coro in asyncio.as_completed(tasks):
        result = await coro  # Gets next completed result
        results.append(result)
        # Can start processing immediately, don't wait for all
    return results
```

### Semaphore for Rate Limiting

```python
import asyncio


async def rate_limited_fetcher():
    """Limit concurrent requests using an asyncio Semaphore."""
    semaphore = asyncio.Semaphore(5)  # Max 5 concurrent requests

    async def fetch_with_limit(url: str) -> dict:
        async with semaphore:
            # At most 5 coroutines are in this block at once
            await asyncio.sleep(0.1)
            return {"url": url, "status": 200}

    urls = [f"https://api.example.com/item/{i}" for i in range(100)]
    tasks = [fetch_with_limit(url) for url in urls]
    results = await asyncio.gather(*tasks)
    return results
```

---

## 4. Structured Concurrency

Structured concurrency ensures that child tasks cannot outlive their parent scope. This
prevents "fire-and-forget" task leaks.

### Python 3.11+ TaskGroup

```python
import asyncio


async def structured_concurrency_example():
    """TaskGroup: all tasks are guaranteed to complete or be cancelled
    before the 'async with' block exits.

    If ANY task raises an exception, ALL other tasks are cancelled.
    """
    results = []

    async with asyncio.TaskGroup() as tg:
        task1 = tg.create_task(fetch_user(1))
        task2 = tg.create_task(fetch_user(2))
        task3 = tg.create_task(fetch_user(3))
        # When this block exits, ALL tasks are done or cancelled

    # Safe to access results here -- all tasks are complete
    results = [task1.result(), task2.result(), task3.result()]
    return results


async def taskgroup_error_handling():
    """TaskGroup wraps exceptions in ExceptionGroup (Python 3.11+)."""
    try:
        async with asyncio.TaskGroup() as tg:
            tg.create_task(fetch_user(1))         # Succeeds
            tg.create_task(failing_task())          # Fails
            tg.create_task(fetch_user(3))          # Gets cancelled
    except* ValueError as eg:
        # except* handles ExceptionGroup
        for exc in eg.exceptions:
            print(f"Caught: {exc}")
    except* TypeError as eg:
        for exc in eg.exceptions:
            print(f"Type error: {exc}")


async def failing_task():
    await asyncio.sleep(0.05)
    raise ValueError("Something went wrong")
```

### Comparison: gather vs TaskGroup

```
+-------------------+-----------------------------------+-----------------------------------+
| Feature           | asyncio.gather()                  | asyncio.TaskGroup()               |
+-------------------+-----------------------------------+-----------------------------------+
| Error handling    | return_exceptions=True hides them | Cancels siblings, raises          |
|                   | return_exceptions=False cancels   | ExceptionGroup                    |
+-------------------+-----------------------------------+-----------------------------------+
| Task lifecycle    | Tasks can outlive gather call     | Tasks cannot outlive the scope    |
+-------------------+-----------------------------------+-----------------------------------+
| Cancellation      | Manual cancellation of pending    | Automatic cancellation on error   |
+-------------------+-----------------------------------+-----------------------------------+
| Recommended       | Simple fan-out where all tasks    | Production code where cleanup     |
|                   | are independent                   | and error handling matter         |
+-------------------+-----------------------------------+-----------------------------------+
```

---

## 5. Error Handling in Async Code

### Exception Groups (Python 3.11+)

```python
import asyncio


async def multiple_failures_example():
    """Handle multiple concurrent failures with ExceptionGroup."""

    async def task_a():
        await asyncio.sleep(0.1)
        raise ValueError("Task A failed")

    async def task_b():
        await asyncio.sleep(0.2)
        raise TypeError("Task B failed")

    async def task_c():
        await asyncio.sleep(0.05)
        return "Task C succeeded"

    try:
        async with asyncio.TaskGroup() as tg:
            tg.create_task(task_a())
            tg.create_task(task_b())
            tg.create_task(task_c())
    except* ValueError as eg:
        print(f"ValueError group: {eg.exceptions}")
    except* TypeError as eg:
        print(f"TypeError group: {eg.exceptions}")


async def retry_with_backoff(
    coro_factory,
    max_retries: int = 3,
    base_delay: float = 0.1,
):
    """Retry an async operation with exponential backoff."""
    last_exception = None

    for attempt in range(max_retries):
        try:
            return await coro_factory()
        except Exception as e:
            last_exception = e
            if attempt < max_retries - 1:
                delay = base_delay * (2 ** attempt)
                await asyncio.sleep(delay)

    raise last_exception
```

### Task Cancellation

```python
import asyncio


async def cancellation_example():
    """Properly handle task cancellation."""

    async def long_running_task():
        try:
            while True:
                await asyncio.sleep(1)
                # Do periodic work
        except asyncio.CancelledError:
            # Cleanup: close connections, flush buffers, etc.
            print("Task cancelled, cleaning up...")
            raise  # Always re-raise CancelledError

    task = asyncio.create_task(long_running_task())
    await asyncio.sleep(3)
    task.cancel()

    try:
        await task
    except asyncio.CancelledError:
        print("Task was cancelled")


async def shielded_operation():
    """Shield a critical operation from cancellation."""

    async def critical_write():
        """This must not be cancelled mid-operation."""
        await asyncio.sleep(0.5)
        return "data saved"

    # asyncio.shield prevents the inner coroutine from being cancelled
    # even if the outer task is cancelled
    try:
        result = await asyncio.shield(critical_write())
    except asyncio.CancelledError:
        # The shield was cancelled, but critical_write may still be running
        print("Outer cancelled, but write may still complete")
        raise
```

---

## 6. Async Generators and Context Managers

### Async Generators

```python
import asyncio
from typing import AsyncIterator


async def paginated_fetch(url: str, total_pages: int) -> AsyncIterator[dict]:
    """Async generator: fetches pages lazily, one at a time."""
    for page in range(1, total_pages + 1):
        await asyncio.sleep(0.1)  # Simulate API call
        yield {
            "page": page,
            "data": [f"item_{page}_{i}" for i in range(10)],
        }


async def consume_pages():
    """Consume async generator with async for loop."""
    async for page_data in paginated_fetch("https://api.example.com", 5):
        items = page_data["data"]
        # Process each page as it arrives
        # No need to wait for all pages before starting processing
```

### Async Context Managers

```python
import asyncio
from contextlib import asynccontextmanager


class AsyncDatabasePool:
    """Async context manager for database connection pool."""

    def __init__(self, dsn: str, pool_size: int):
        self._dsn = dsn
        self._pool_size = pool_size
        self._semaphore = asyncio.Semaphore(pool_size)
        self._connections: list = []

    async def __aenter__(self):
        """Initialize the connection pool."""
        for _ in range(self._pool_size):
            conn = await self._create_connection()
            self._connections.append(conn)
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Close all connections in the pool."""
        for conn in self._connections:
            await self._close_connection(conn)
        self._connections = []

    async def acquire(self):
        await self._semaphore.acquire()
        return self._connections[0]  # Simplified

    async def release(self, conn):
        self._semaphore.release()

    async def _create_connection(self):
        await asyncio.sleep(0.01)
        return {"status": "connected"}

    async def _close_connection(self, conn):
        await asyncio.sleep(0.01)


@asynccontextmanager
async def managed_connection(pool: AsyncDatabasePool):
    """Async context manager for individual connections."""
    conn = await pool.acquire()
    try:
        yield conn
    finally:
        await pool.release(conn)


async def use_pool():
    async with AsyncDatabasePool("postgres://localhost/db", 5) as pool:
        async with managed_connection(pool) as conn:
            # Use connection here
            pass
        # Connection automatically released
    # Pool automatically closed
```

---

## 7. Common Pitfalls

### Pitfall 1: Blocking the Event Loop

```python
import asyncio
import time


# WRONG: Blocking call in async function freezes the entire event loop
async def bad_async():
    time.sleep(5)  # BLOCKS the event loop for 5 seconds!
    # NO other coroutine can run during this time


# CORRECT: Use non-blocking await
async def good_async():
    await asyncio.sleep(5)  # Event loop can run other coroutines


# CORRECT: Run blocking code in executor
async def good_async_with_blocking_lib():
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,  # Default ThreadPoolExecutor
        time.sleep, 5  # Blocking call runs in a thread
    )
```

### Pitfall 2: Forgetting to Await

```python
import asyncio


async def fetch_data():
    await asyncio.sleep(0.1)
    return {"data": "value"}


# WRONG: Missing await. result is a coroutine object, not the data!
async def bad_caller():
    result = fetch_data()  # result is <coroutine object>, not dict!
    print(result)  # <coroutine object fetch_data at 0x...>
    # Python will warn: "coroutine was never awaited"


# CORRECT: Await the coroutine
async def good_caller():
    result = await fetch_data()
    print(result)  # {"data": "value"}
```

### Pitfall 3: Creating Tasks That Nobody Awaits

```python
import asyncio


# WRONG: Fire-and-forget task. If it fails, the exception is silently lost.
async def fire_and_forget():
    asyncio.create_task(risky_operation())  # Task runs, but who checks it?
    # If risky_operation raises, you get:
    # "Task exception was never retrieved"


# CORRECT: Track and await all tasks
async def tracked_tasks():
    tasks = []
    tasks.append(asyncio.create_task(risky_operation()))
    tasks.append(asyncio.create_task(risky_operation()))

    results = await asyncio.gather(*tasks, return_exceptions=True)
    for result in results:
        if isinstance(result, Exception):
            print(f"Task failed: {result}")


async def risky_operation():
    await asyncio.sleep(0.1)
    raise RuntimeError("Something broke")
```

### Pitfall 4: Mixing asyncio and threading

```python
import asyncio
import threading


# Calling async from sync thread (e.g., a Flask route handler)
def sync_function():
    # WRONG: asyncio.run() creates a new event loop. Cannot nest event loops.
    # If already inside an event loop, this will raise RuntimeError.

    # CORRECT: Use asyncio.run_coroutine_threadsafe() for cross-thread calls
    loop = asyncio.get_event_loop()
    future = asyncio.run_coroutine_threadsafe(
        fetch_data(), loop
    )
    result = future.result(timeout=5)  # Blocks until coroutine completes


# Calling sync blocking code from async
async def async_function():
    loop = asyncio.get_event_loop()

    # Run blocking I/O in a thread pool
    result = await loop.run_in_executor(None, blocking_io_function)

    # Run CPU-bound work in a process pool
    from concurrent.futures import ProcessPoolExecutor
    with ProcessPoolExecutor() as pool:
        result = await loop.run_in_executor(pool, cpu_bound_function)


def blocking_io_function():
    time.sleep(1)
    return "done"


def cpu_bound_function():
    return sum(i * i for i in range(10_000_000))
```

---

## 8. Backpressure Handling

Backpressure occurs when a producer generates data faster than the consumer can process it.
Without backpressure handling, memory grows unbounded.

### Bounded Queue for Backpressure

```python
import asyncio


async def backpressure_pipeline():
    """Bounded queue naturally applies backpressure.

    When the queue is full, the producer's put() blocks,
    slowing down production to match consumption speed.
    """
    queue: asyncio.Queue[str | None] = asyncio.Queue(maxsize=10)  # Bounded!

    async def producer():
        for i in range(1000):
            # put() blocks when queue is full (backpressure)
            await queue.put(f"item-{i}")
        await queue.put(None)  # Sentinel

    async def consumer():
        while True:
            item = await queue.get()
            if item is None:
                break
            await asyncio.sleep(0.01)  # Slow consumer

    # Producer is fast, consumer is slow.
    # Queue limits memory to 10 items max.
    await asyncio.gather(producer(), consumer())
```

### Semaphore-Based Rate Control

```python
import asyncio


async def rate_controlled_pipeline():
    """Use semaphore to control how many items are 'in-flight'."""
    max_in_flight = 20
    semaphore = asyncio.Semaphore(max_in_flight)

    async def process_item(item: int) -> dict:
        async with semaphore:
            await asyncio.sleep(0.05)  # Simulate processing
            return {"item": item, "status": "processed"}

    # Even though we create 1000 tasks, only 20 run at a time
    tasks = [
        asyncio.create_task(process_item(i))
        for i in range(1000)
    ]
    results = await asyncio.gather(*tasks)
    return results
```

---

## 9. Complete Examples

### Async Web Scraper with Rate Limiting

```python
import asyncio
from dataclasses import dataclass


@dataclass
class ScrapeResult:
    url: str
    status: int
    content_length: int
    error: str | None = None


class AsyncScraper:
    """Production-style async web scraper with rate limiting and retries."""

    def __init__(self, max_concurrent: int = 10, max_retries: int = 3):
        self._semaphore = asyncio.Semaphore(max_concurrent)
        self._max_retries = max_retries

    async def scrape_url(self, url: str) -> ScrapeResult:
        """Scrape a single URL with rate limiting and retry."""
        async with self._semaphore:
            for attempt in range(self._max_retries):
                try:
                    result = await self._fetch(url)
                    return result
                except Exception as e:
                    if attempt == self._max_retries - 1:
                        return ScrapeResult(
                            url=url, status=0, content_length=0,
                            error=str(e)
                        )
                    await asyncio.sleep(0.5 * (2 ** attempt))

        return ScrapeResult(url=url, status=0, content_length=0, error="unreachable")

    async def _fetch(self, url: str) -> ScrapeResult:
        """Simulate HTTP fetch."""
        await asyncio.sleep(0.1)
        return ScrapeResult(url=url, status=200, content_length=1024)

    async def scrape_all(self, urls: list[str]) -> list[ScrapeResult]:
        """Scrape all URLs concurrently with bounded concurrency."""
        async with asyncio.TaskGroup() as tg:
            tasks = [tg.create_task(self.scrape_url(url)) for url in urls]
        return [task.result() for task in tasks]


async def run_scraper():
    scraper = AsyncScraper(max_concurrent=5, max_retries=3)
    urls = [f"https://example.com/page/{i}" for i in range(50)]
    results = await scraper.scrape_all(urls)
    successful = [r for r in results if r.error is None]
    failed = [r for r in results if r.error is not None]
    return successful, failed
```

### Async Pipeline: ETL

```python
import asyncio
from typing import AsyncIterator


async def extract(source: str, batch_size: int = 10) -> AsyncIterator[list[dict]]:
    """Extract data in batches from a source."""
    total_records = 100
    for offset in range(0, total_records, batch_size):
        await asyncio.sleep(0.05)  # Simulate DB query
        batch = [
            {"id": i, "raw_data": f"data-{i}"}
            for i in range(offset, min(offset + batch_size, total_records))
        ]
        yield batch


async def transform(batch: list[dict]) -> list[dict]:
    """Transform a batch of records."""
    await asyncio.sleep(0.02)  # Simulate CPU work
    return [
        {**record, "processed": True, "value": record["id"] * 2}
        for record in batch
    ]


async def load(batch: list[dict], destination: str) -> int:
    """Load a batch into the destination."""
    await asyncio.sleep(0.03)  # Simulate write
    return len(batch)


async def etl_pipeline():
    """Async ETL pipeline with backpressure via bounded queue."""
    transform_queue: asyncio.Queue = asyncio.Queue(maxsize=5)
    load_queue: asyncio.Queue = asyncio.Queue(maxsize=5)
    total_loaded = 0

    async def extract_stage():
        async for batch in extract("database", batch_size=10):
            await transform_queue.put(batch)
        await transform_queue.put(None)

    async def transform_stage():
        while True:
            batch = await transform_queue.get()
            if batch is None:
                await load_queue.put(None)
                break
            transformed = await transform(batch)
            await load_queue.put(transformed)

    async def load_stage():
        nonlocal total_loaded
        while True:
            batch = await load_queue.get()
            if batch is None:
                break
            count = await load(batch, "data_warehouse")
            total_loaded += count

    await asyncio.gather(
        extract_stage(),
        transform_stage(),
        load_stage(),
    )
    return total_loaded
```

---

## 10. Common Interview Questions

1. **How does an event loop work?**
   It runs coroutines until they hit an `await`, registers pending I/O with the OS
   multiplexer (epoll/kqueue), waits for I/O completion, then resumes the appropriate
   coroutine. Single-threaded, no context switching.

2. **What happens if you call a blocking function in async code?**
   It blocks the event loop. NO other coroutine can run. Use `run_in_executor()` to
   offload blocking calls to a thread pool.

3. **What is structured concurrency and why does it matter?**
   Child tasks cannot outlive their parent scope. This prevents orphaned tasks, ensures
   cleanup, and propagates errors properly. Python 3.11+ TaskGroup implements this.

4. **How do you handle backpressure in async pipelines?**
   Use bounded queues (maxsize parameter). When the queue is full, the producer's `put()`
   blocks, naturally slowing production to match consumption.

5. **What is the difference between asyncio.gather and asyncio.TaskGroup?**
   gather returns exceptions as values (return_exceptions=True) or cancels on first error.
   TaskGroup always cancels siblings on error and raises ExceptionGroup. TaskGroup provides
   structured concurrency.

6. **How do you rate-limit async operations?**
   Use `asyncio.Semaphore(N)`. Each operation acquires the semaphore before starting,
   limiting concurrent operations to N.

---

## 11. Gotchas

- **asyncio.run() cannot be nested.** Calling `asyncio.run()` inside an already-running
  event loop raises RuntimeError. Use `await` instead, or `run_coroutine_threadsafe()` from
  a different thread.

- **Task exceptions are silently swallowed.** If you create a task with `create_task()` and
  never await it, exceptions are logged but never raised. Always await or gather your tasks.

- **asyncio.Queue is NOT thread-safe.** It is only safe for use within a single event loop
  (single thread). For thread-to-async communication, use `janus` library or
  `loop.call_soon_threadsafe()`.

- **Cancellation is cooperative.** `task.cancel()` sends CancelledError to the coroutine,
  but if the coroutine catches it and does not re-raise, cancellation fails. Always re-raise.

- **Async generators must be explicitly closed.** If you break out of an `async for` loop
  early, the generator may not clean up. Use `async with aclosing(gen)` for guaranteed cleanup.

- **CPU-bound work in async code kills throughput.** A single CPU-intensive coroutine that
  runs for 100ms without an `await` blocks all other coroutines for 100ms. Always offload.

---

## 12. Quick Reference

```
+---------------------------+----------------------------------------------+
| Pattern                   | When to Use                                  |
+---------------------------+----------------------------------------------+
| asyncio.gather()          | Run N coroutines, collect all results        |
| asyncio.wait()            | Need first-completed or timeout semantics    |
| asyncio.as_completed()    | Process results in completion order          |
| asyncio.TaskGroup()       | Structured concurrency with error handling   |
| asyncio.Semaphore(N)      | Rate limit to N concurrent operations        |
| asyncio.Queue(maxsize=N)  | Backpressure in producer-consumer pipelines  |
| loop.run_in_executor()    | Bridge blocking code into async              |
| asyncio.shield()          | Protect critical operation from cancellation |
| asyncio.wait_for(timeout) | Add timeout to any awaitable                 |
+---------------------------+----------------------------------------------+

Error Handling Strategy:
  gather(return_exceptions=True) --> Tolerant (collect all errors)
  TaskGroup                      --> Strict (cancel on first error)
  retry_with_backoff             --> Resilient (retry transient failures)

Backpressure Checklist:
  [ ] All queues have maxsize set
  [ ] Semaphores limit concurrent operations
  [ ] Producers block when consumers are slow
  [ ] No unbounded task creation

Performance Rules:
  1. Never block the event loop (no time.sleep, no CPU work)
  2. Use run_in_executor for blocking libraries
  3. Limit concurrency with semaphores (don't create 1M tasks)
  4. Use bounded queues for pipeline stages
  5. Cancel tasks you no longer need
```
