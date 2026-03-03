# Concurrency Patterns for LLD Interviews

Concurrency is one of the most commonly asked follow-up topics in LLD interviews. "How would you
make this thread-safe?" is a question that separates candidates who can write clean code from
those who can write production-ready code. This guide covers the essential concurrency patterns
with Python examples.

---

## Table of Contents

1. [Why Concurrency Matters](#1-why-concurrency-matters)
2. [Thread Safety Fundamentals](#2-thread-safety-fundamentals)
3. [Mutexes and Locks](#3-mutexes-and-locks)
4. [Producer-Consumer Pattern](#4-producer-consumer-pattern)
5. [Reader-Writer Locks](#5-reader-writer-locks)
6. [Thread Pools](#6-thread-pools)
7. [Python's GIL and Workarounds](#7-pythons-gil-and-workarounds)
8. [Async/Await Patterns](#8-asyncawait-patterns)
9. [Go-Style Concurrency in Python](#9-go-style-concurrency-in-python)
10. [Deadlock Prevention](#10-deadlock-prevention)
11. [Race Conditions](#11-race-conditions)
12. [Interview Tips](#12-interview-tips)
13. [Gotchas](#13-gotchas)
14. [Quick Reference](#14-quick-reference)

---

## 1. Why Concurrency Matters

```
Sequential:      [Task A 5s] [Task B 5s] [Task C 5s]  = 15s total
Concurrent:      [Task A 5s]
                 [Task B 5s]                           = 5s total
                 [Task C 5s]
```

Concurrency is essential when:
- Handling multiple client requests simultaneously (web servers)
- Performing I/O-bound operations (database queries, API calls)
- Utilizing multiple CPU cores for computation (data processing)
- Running background tasks (scheduling, monitoring)

---

## 2. Thread Safety Fundamentals

A piece of code is **thread-safe** if it behaves correctly when accessed by multiple threads
simultaneously. The three main concerns are:

### Race Condition

Two threads read-modify-write the same data, and the final state depends on timing.

```python
# NOT THREAD-SAFE: Race condition
class Counter:
    def __init__(self):
        self.count = 0

    def increment(self):
        # This is actually three operations:
        # 1. Read self.count
        # 2. Add 1
        # 3. Write back
        self.count += 1  # Race condition!
```

### Deadlock

Two threads each hold a lock the other needs, so both wait forever.

### Starvation

A thread never gets to run because other threads always have priority.

---

## 3. Mutexes and Locks

### Basic Lock (Mutex)

```python
import threading


class ThreadSafeCounter:
    def __init__(self):
        self._count = 0
        self._lock = threading.Lock()

    def increment(self) -> None:
        with self._lock:  # Acquires lock, releases automatically
            self._count += 1

    def get(self) -> int:
        with self._lock:
            return self._count
```

### RLock (Reentrant Lock)

Allows the same thread to acquire the lock multiple times without deadlocking.

```python
class BankAccount:
    def __init__(self, balance: float = 0.0):
        self._balance = balance
        self._lock = threading.RLock()  # Reentrant!

    def deposit(self, amount: float) -> None:
        with self._lock:
            self._balance += amount

    def withdraw(self, amount: float) -> None:
        with self._lock:
            if amount > self._balance:
                raise ValueError("Insufficient funds")
            self._balance -= amount

    def transfer_to(self, other: "BankAccount", amount: float) -> None:
        with self._lock:  # First acquisition
            self.withdraw(amount)  # Second acquisition (same thread) -- OK with RLock!
            other.deposit(amount)

    @property
    def balance(self) -> float:
        with self._lock:
            return self._balance
```

### Condition Variables

Used when threads need to wait for a specific condition to be true.

```python
class BoundedBuffer:
    """Thread-safe bounded buffer using condition variables."""

    def __init__(self, capacity: int):
        self._buffer: list = []
        self._capacity = capacity
        self._lock = threading.Lock()
        self._not_full = threading.Condition(self._lock)
        self._not_empty = threading.Condition(self._lock)

    def put(self, item) -> None:
        with self._not_full:
            while len(self._buffer) >= self._capacity:
                self._not_full.wait()  # Release lock and wait
            self._buffer = [*self._buffer, item]
            self._not_empty.notify()  # Wake up a waiting consumer

    def get(self):
        with self._not_empty:
            while not self._buffer:
                self._not_empty.wait()  # Release lock and wait
            item = self._buffer[0]
            self._buffer = self._buffer[1:]
            self._not_full.notify()  # Wake up a waiting producer
            return item
```

### Semaphore

Limits the number of concurrent accesses to a resource.

```python
class ConnectionPool:
    """Limit concurrent database connections."""

    def __init__(self, max_connections: int = 5):
        self._semaphore = threading.Semaphore(max_connections)
        self._connections: list = []
        self._lock = threading.Lock()

    def acquire_connection(self):
        self._semaphore.acquire()  # Block if max connections reached
        with self._lock:
            conn = self._create_connection()
            self._connections = [*self._connections, conn]
            return conn

    def release_connection(self, conn) -> None:
        with self._lock:
            self._connections = [c for c in self._connections if c is not conn]
        self._semaphore.release()

    def _create_connection(self):
        return {"id": threading.current_thread().name}
```

---

## 4. Producer-Consumer Pattern

The most common concurrency pattern. Producers generate work items, consumers process them,
connected by a thread-safe queue.

```python
import queue
import threading
import time
from dataclasses import dataclass


@dataclass
class WorkItem:
    task_id: int
    data: str


class Producer(threading.Thread):
    def __init__(self, work_queue: queue.Queue, num_items: int):
        super().__init__(daemon=True)
        self._queue = work_queue
        self._num_items = num_items

    def run(self) -> None:
        for i in range(self._num_items):
            item = WorkItem(task_id=i, data=f"task-{i}")
            self._queue.put(item)
            time.sleep(0.01)  # Simulate work
        self._queue.put(None)  # Sentinel to signal completion


class Consumer(threading.Thread):
    def __init__(self, work_queue: queue.Queue, name: str):
        super().__init__(daemon=True, name=name)
        self._queue = work_queue
        self.processed: list[WorkItem] = []

    def run(self) -> None:
        while True:
            item = self._queue.get()
            if item is None:
                self._queue.put(None)  # Re-post sentinel for other consumers
                break
            self._process(item)
            self._queue.task_done()

    def _process(self, item: WorkItem) -> None:
        time.sleep(0.02)  # Simulate processing
        self.processed.append(item)


# Usage: 1 producer, 3 consumers
def run_producer_consumer():
    work_queue: queue.Queue[WorkItem | None] = queue.Queue(maxsize=10)

    producer = Producer(work_queue, num_items=20)
    consumers = [Consumer(work_queue, name=f"Consumer-{i}") for i in range(3)]

    producer.start()
    for c in consumers:
        c.start()

    producer.join()
    for c in consumers:
        c.join()

    total_processed = sum(len(c.processed) for c in consumers)
    print(f"Total processed: {total_processed}")
```

---

## 5. Reader-Writer Locks

Allow multiple concurrent readers OR a single exclusive writer. Optimized for read-heavy
workloads.

```python
class ReadWriteLock:
    """Custom reader-writer lock implementation."""

    def __init__(self):
        self._readers = 0
        self._lock = threading.Lock()
        self._write_lock = threading.Lock()

    def acquire_read(self) -> None:
        with self._lock:
            self._readers += 1
            if self._readers == 1:
                self._write_lock.acquire()  # First reader blocks writers

    def release_read(self) -> None:
        with self._lock:
            self._readers -= 1
            if self._readers == 0:
                self._write_lock.release()  # Last reader unblocks writers

    def acquire_write(self) -> None:
        self._write_lock.acquire()

    def release_write(self) -> None:
        self._write_lock.release()


class ThreadSafeConfig:
    """Configuration store with many reads, few writes."""

    def __init__(self):
        self._data: dict[str, str] = {}
        self._rw_lock = ReadWriteLock()

    def get(self, key: str) -> str | None:
        self._rw_lock.acquire_read()
        try:
            return self._data.get(key)
        finally:
            self._rw_lock.release_read()

    def set(self, key: str, value: str) -> None:
        self._rw_lock.acquire_write()
        try:
            self._data = {**self._data, key: value}
        finally:
            self._rw_lock.release_write()

    def get_all(self) -> dict[str, str]:
        self._rw_lock.acquire_read()
        try:
            return dict(self._data)
        finally:
            self._rw_lock.release_read()
```

---

## 6. Thread Pools

Reuse a fixed number of threads to process many tasks, avoiding the overhead of thread
creation/destruction.

```python
from concurrent.futures import ThreadPoolExecutor, as_completed
import time


def fetch_url(url: str) -> dict:
    """Simulate fetching a URL."""
    time.sleep(0.5)  # Simulate network latency
    return {"url": url, "status": 200, "size": len(url) * 100}


def parallel_fetch(urls: list[str], max_workers: int = 5) -> list[dict]:
    """Fetch multiple URLs concurrently using a thread pool."""
    results = []

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # Submit all tasks
        future_to_url = {
            executor.submit(fetch_url, url): url
            for url in urls
        }

        # Collect results as they complete
        for future in as_completed(future_to_url):
            url = future_to_url[future]
            try:
                result = future.result(timeout=5)
                results.append(result)
            except TimeoutError:
                results.append({"url": url, "error": "timeout"})
            except Exception as e:
                results.append({"url": url, "error": str(e)})

    return results


# Usage
urls = [f"https://example.com/page/{i}" for i in range(20)]
results = parallel_fetch(urls, max_workers=5)
# 20 URLs fetched in ~2 seconds instead of ~10 seconds
```

---

## 7. Python's GIL and Workarounds

### What is the GIL?

The Global Interpreter Lock is a mutex in CPython that allows only one thread to execute
Python bytecode at a time. This means:

```
CPU-BOUND WORK:
  Thread 1: [COMPUTE]----[WAIT]----[COMPUTE]----[WAIT]
  Thread 2: ----[WAIT]----[COMPUTE]----[WAIT]----[COMPUTE]
  ^ No speedup! Only one thread runs at a time.

I/O-BOUND WORK:
  Thread 1: [WORK]-[I/O WAIT: GIL released]----[WORK]
  Thread 2: ----[WORK]-[I/O WAIT: GIL released]
  ^ Speedup! GIL is released during I/O waits.
```

### Workaround 1: multiprocessing (for CPU-bound)

```python
from multiprocessing import Pool


def cpu_intensive_task(n: int) -> int:
    """Compute the sum of squares up to n."""
    return sum(i * i for i in range(n))


def parallel_compute(tasks: list[int]) -> list[int]:
    """Use multiple processes to bypass the GIL."""
    with Pool(processes=4) as pool:
        results = pool.map(cpu_intensive_task, tasks)
    return results


# Each process has its own Python interpreter and GIL
results = parallel_compute([10_000_000, 20_000_000, 30_000_000, 40_000_000])
```

### Workaround 2: asyncio (for I/O-bound)

```python
import asyncio


async def fetch_data(url: str) -> dict:
    """Simulate async HTTP fetch."""
    await asyncio.sleep(0.5)  # Non-blocking sleep
    return {"url": url, "data": "..."}


async def fetch_all(urls: list[str]) -> list[dict]:
    """Fetch all URLs concurrently with asyncio."""
    tasks = [fetch_data(url) for url in urls]
    return await asyncio.gather(*tasks)


# Usage
urls = [f"https://api.example.com/{i}" for i in range(100)]
results = asyncio.run(fetch_all(urls))
# 100 requests in ~0.5 seconds (all run concurrently)
```

### When to Use What

```
+---------------------+------------------+-------------------+
| Scenario            | Use              | Why               |
+---------------------+------------------+-------------------+
| CPU-bound (compute) | multiprocessing  | Bypasses GIL      |
| I/O-bound (network) | asyncio or       | GIL released      |
|                     | threading        | during I/O        |
| Mixed workload      | ProcessPool +    | Best of both      |
|                     | async in each    |                   |
| Simple parallel I/O | ThreadPoolExecutor| Easy API          |
+---------------------+------------------+-------------------+
```

---

## 8. Async/Await Patterns

### Async Context Manager

```python
import asyncio


class AsyncConnectionPool:
    def __init__(self, max_size: int = 10):
        self._semaphore = asyncio.Semaphore(max_size)
        self._connections: list = []

    async def acquire(self):
        await self._semaphore.acquire()
        conn = await self._create_connection()
        return conn

    async def release(self, conn) -> None:
        await self._close_connection(conn)
        self._semaphore.release()

    async def _create_connection(self):
        await asyncio.sleep(0.01)  # Simulate connection setup
        return {"id": id(asyncio.current_task())}

    async def _close_connection(self, conn) -> None:
        await asyncio.sleep(0.01)


class AsyncConnectionContext:
    def __init__(self, pool: AsyncConnectionPool):
        self._pool = pool
        self._conn = None

    async def __aenter__(self):
        self._conn = await self._pool.acquire()
        return self._conn

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self._conn:
            await self._pool.release(self._conn)
```

### Async Producer-Consumer

```python
async def async_producer(q: asyncio.Queue, num_items: int) -> None:
    for i in range(num_items):
        await q.put(f"item-{i}")
        await asyncio.sleep(0.01)
    await q.put(None)  # Sentinel


async def async_consumer(q: asyncio.Queue, name: str) -> list[str]:
    processed = []
    while True:
        item = await q.get()
        if item is None:
            await q.put(None)  # Re-post for other consumers
            break
        await asyncio.sleep(0.02)  # Simulate processing
        processed.append(item)
    return processed


async def run_async_pipeline():
    q: asyncio.Queue = asyncio.Queue(maxsize=10)

    producer = asyncio.create_task(async_producer(q, 20))
    consumers = [
        asyncio.create_task(async_consumer(q, f"consumer-{i}"))
        for i in range(3)
    ]

    await producer
    results = await asyncio.gather(*consumers)
    total = sum(len(r) for r in results)
    print(f"Total processed: {total}")
```

### Timeout and Cancellation

```python
async def risky_operation() -> str:
    await asyncio.sleep(10)  # Simulates long operation
    return "done"


async def with_timeout():
    try:
        result = await asyncio.wait_for(risky_operation(), timeout=2.0)
        return result
    except asyncio.TimeoutError:
        print("Operation timed out after 2 seconds")
        return None
```

---

## 9. Go-Style Concurrency in Python

Go uses goroutines and channels. Python can approximate this with `asyncio.Queue` as channels.

### Channel-Like Communication

```python
async def channel_example():
    """Simulate Go's channel pattern in Python."""
    channel: asyncio.Queue[int] = asyncio.Queue()

    async def sender(ch: asyncio.Queue, values: list[int]) -> None:
        for v in values:
            await ch.put(v)
        await ch.put(-1)  # Signal completion

    async def receiver(ch: asyncio.Queue) -> list[int]:
        received = []
        while True:
            val = await ch.get()
            if val == -1:
                break
            received.append(val * 2)  # Process: double each value
        return received

    # Launch concurrently
    sender_task = asyncio.create_task(sender(channel, [1, 2, 3, 4, 5]))
    result = await receiver(channel)
    await sender_task
    print(f"Received: {result}")  # [2, 4, 6, 8, 10]


### Fan-Out / Fan-In

async def fan_out_fan_in():
    """Distribute work across multiple workers, collect results."""
    work_queue: asyncio.Queue = asyncio.Queue()
    result_queue: asyncio.Queue = asyncio.Queue()

    async def worker(wq: asyncio.Queue, rq: asyncio.Queue, name: str):
        while True:
            item = await wq.get()
            if item is None:
                break
            result = item ** 2  # Process
            await rq.put((name, result))

    # Fan out: distribute work to 3 workers
    for i in range(9):
        await work_queue.put(i)
    for _ in range(3):
        await work_queue.put(None)  # Sentinel per worker

    workers = [
        asyncio.create_task(worker(work_queue, result_queue, f"W{i}"))
        for i in range(3)
    ]

    await asyncio.gather(*workers)

    # Fan in: collect results
    results = []
    while not result_queue.empty():
        results.append(await result_queue.get())
    print(f"Results: {results}")
```

---

## 10. Deadlock Prevention

### Classic Deadlock Scenario

```python
# DEADLOCK: Thread 1 holds lock_a, waits for lock_b
#           Thread 2 holds lock_b, waits for lock_a

lock_a = threading.Lock()
lock_b = threading.Lock()

def thread_1():
    with lock_a:
        time.sleep(0.1)
        with lock_b:  # Waits forever!
            pass

def thread_2():
    with lock_b:
        time.sleep(0.1)
        with lock_a:  # Waits forever!
            pass
```

### Prevention Strategy 1: Lock Ordering

Always acquire locks in the same global order.

```python
def transfer(account_a: BankAccount, account_b: BankAccount, amount: float):
    """Transfer money between accounts without deadlock."""
    # Always lock in order of account ID (consistent global ordering)
    first, second = sorted([account_a, account_b], key=lambda a: id(a))

    with first._lock:
        with second._lock:
            account_a.withdraw(amount)
            account_b.deposit(amount)
```

### Prevention Strategy 2: Timeout

```python
def safe_transfer(account_a, account_b, amount, timeout=1.0):
    """Try to acquire both locks with timeout."""
    acquired_a = account_a._lock.acquire(timeout=timeout)
    if not acquired_a:
        raise TimeoutError("Could not acquire lock on account A")

    try:
        acquired_b = account_b._lock.acquire(timeout=timeout)
        if not acquired_b:
            raise TimeoutError("Could not acquire lock on account B")
        try:
            account_a.withdraw(amount)
            account_b.deposit(amount)
        finally:
            account_b._lock.release()
    finally:
        account_a._lock.release()
```

### Prevention Strategy 3: Single Lock

```python
class TransferService:
    """Use a single lock for all transfers to prevent deadlock."""

    def __init__(self):
        self._transfer_lock = threading.Lock()

    def transfer(self, from_account, to_account, amount):
        with self._transfer_lock:
            from_account.withdraw(amount)
            to_account.deposit(amount)
```

---

## 11. Race Conditions

### Classic TOCTOU (Time-of-Check to Time-of-Use)

```python
# BAD: Race condition between check and use
class Inventory:
    def __init__(self):
        self._stock: dict[str, int] = {}

    def purchase(self, item_id: str, quantity: int) -> bool:
        if self._stock.get(item_id, 0) >= quantity:  # CHECK
            # Another thread could modify stock here!
            self._stock[item_id] -= quantity  # USE
            return True
        return False


# GOOD: Atomic check-and-update
class SafeInventory:
    def __init__(self):
        self._stock: dict[str, int] = {}
        self._lock = threading.Lock()

    def purchase(self, item_id: str, quantity: int) -> bool:
        with self._lock:  # Atomic: check and update together
            if self._stock.get(item_id, 0) >= quantity:
                self._stock[item_id] = self._stock[item_id] - quantity
                return True
            return False
```

### Using `threading.Event` for Coordination

```python
class InitializableService:
    """Service that must be initialized before use."""

    def __init__(self):
        self._ready = threading.Event()
        self._data = None

    def initialize(self) -> None:
        """Called by setup thread."""
        time.sleep(2)  # Simulate slow initialization
        self._data = {"config": "loaded"}
        self._ready.set()  # Signal that initialization is complete

    def get_data(self, timeout: float = 5.0) -> dict:
        """Called by worker threads. Blocks until ready."""
        if not self._ready.wait(timeout=timeout):
            raise TimeoutError("Service not initialized in time")
        return self._data
```

---

## 12. Interview Tips

1. **Always mention thread safety when asked "what about concurrent access?"** Show you know
   the difference between thread-safe and non-thread-safe code.

2. **Know the GIL.** If the interviewer asks about Python concurrency, mention the GIL
   immediately. Then explain: threading for I/O, multiprocessing for CPU, asyncio for async I/O.

3. **Lock granularity matters.** A single global lock is safe but slow (no concurrency).
   Fine-grained locks are fast but complex. Mention this trade-off.

4. **Prefer `with` statement for locks.** It guarantees the lock is released even if an
   exception occurs. Never use bare `acquire/release` without try/finally.

5. **asyncio is the modern answer.** For I/O-bound Python services, `asyncio` is generally
   preferred over threads because it avoids context switching overhead and is easier to reason about.

---

## 13. Gotchas

- **The GIL does not protect your data structures.** Even though only one thread runs at a
  time, operations like `list.append()` are atomic but `count += 1` is not (it is three
  bytecode operations: LOAD, ADD, STORE).

- **Deadlock is silent.** Your program just hangs. No error, no exception. Add timeouts to
  locks in production code so deadlocks become errors instead of hangs.

- **Daemon threads die when main exits.** If you set `daemon=True`, the thread is killed when
  the main thread exits. This can corrupt data if the thread was mid-write.

- **asyncio and threads do not mix easily.** If you need to call an async function from a
  thread, use `asyncio.run_coroutine_threadsafe()`. If you need to call a blocking function
  from async code, use `loop.run_in_executor()`.

- **Reader-writer lock has writer starvation.** If readers keep arriving, the writer never
  gets the lock. Add a "writer priority" flag to fix this.

- **`queue.Queue` is already thread-safe.** Do not wrap it with your own lock -- that would
  be redundant and could cause deadlocks.

---

## 14. Quick Reference

```
+---------------------------+------------------------------------------+
| Pattern                   | When to Use                              |
+---------------------------+------------------------------------------+
| Lock (Mutex)              | Protect shared mutable state             |
| RLock                     | When same thread needs lock twice        |
| Semaphore                 | Limit concurrent access (connection pool)|
| Condition Variable        | Wait for specific state (buffer not full)|
| Event                     | One-time signal (initialization done)    |
| Producer-Consumer         | Decouple work generation from processing |
| Reader-Writer Lock        | Many readers, few writers                |
| Thread Pool               | Reuse threads for many small tasks       |
| asyncio                   | I/O-bound concurrent operations          |
| multiprocessing           | CPU-bound parallel computation           |
+---------------------------+------------------------------------------+

Deadlock Prevention:
  1. Lock ordering:  Always acquire locks in a consistent global order
  2. Timeout:        Use lock.acquire(timeout=N) instead of blocking forever
  3. Single lock:    One lock for the entire critical section (simple but slow)
  4. Lock-free:      Use atomic operations or immutable data structures

Python Concurrency Decision Tree:
  Is it CPU-bound?
    YES -> multiprocessing (bypass GIL)
    NO  -> Is it I/O-bound?
      YES -> asyncio (modern, efficient) or threading (simpler)
      NO  -> Do you need true parallelism?
        YES -> multiprocessing
        NO  -> Single thread is fine
```
