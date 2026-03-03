# Synchronization Primitives Deep Dive

Every synchronization primitive exists to solve a specific coordination problem. This guide
covers ALL major primitives with their internal mechanics, use cases, and interview-ready
implementations in Python.

---

## Table of Contents

1. [Mutex / Lock](#1-mutex--lock)
2. [RLock (Reentrant Lock)](#2-rlock-reentrant-lock)
3. [Semaphore](#3-semaphore)
4. [Condition Variables](#4-condition-variables)
5. [Barriers](#5-barriers)
6. [Events](#6-events)
7. [ReadWriteLock](#7-readwritelock)
8. [Spinlock vs Mutex](#8-spinlock-vs-mutex)
9. [Optimistic vs Pessimistic Locking](#9-optimistic-vs-pessimistic-locking)
10. [Compare-And-Swap (CAS)](#10-compare-and-swap-cas)
11. [Common Interview Questions](#11-common-interview-questions)
12. [Gotchas](#12-gotchas)
13. [Quick Reference](#13-quick-reference)

---

## 1. Mutex / Lock

A mutex (mutual exclusion) ensures that only one thread can execute a critical section at a
time. It is the most fundamental synchronization primitive.

### How It Works Internally

```
Mutex Internal State:
+-----------------------------------+
| locked: bool = False              |
| owner: Thread = None              |
| wait_queue: Queue[Thread] = []    |
+-----------------------------------+

acquire():
  if not locked:
    locked = True
    owner = current_thread
  else:
    wait_queue.append(current_thread)
    suspend current_thread           # Thread sleeps

release():
  if wait_queue is not empty:
    next_thread = wait_queue.popleft()
    owner = next_thread
    wake up next_thread              # Thread wakes
  else:
    locked = False
    owner = None
```

### Thread Interaction Diagram

```
Time -->

Thread A: [acquire]--[critical section]--[release]
                                              |
Thread B: [acquire]---[BLOCKED]...............[wake]--[critical section]--[release]
                                                                              |
Thread C: [acquire]---[BLOCKED]...............................................[wake]--[cs]--[release]
```

### Python Lock with Error Handling

```python
import threading
from typing import Any


class SafeResource:
    """Demonstrates proper mutex usage with context manager pattern."""

    def __init__(self):
        self._data: dict[str, Any] = {}
        self._lock = threading.Lock()

    def update(self, key: str, value: Any) -> None:
        """Always use 'with' statement -- guarantees release even on exception."""
        with self._lock:
            # Only one thread can be here at a time
            self._data = {**self._data, key: value}

    def get(self, key: str) -> Any:
        """Reads also need the lock if writes are not atomic."""
        with self._lock:
            return self._data.get(key)

    def update_manual(self, key: str, value: Any) -> None:
        """Manual acquire/release -- only if you cannot use 'with'."""
        self._lock.acquire()
        try:
            self._data = {**self._data, key: value}
        finally:
            self._lock.release()  # ALWAYS in finally block

    def try_update(self, key: str, value: Any, timeout: float = 1.0) -> bool:
        """Non-blocking attempt to acquire lock with timeout."""
        acquired = self._lock.acquire(timeout=timeout)
        if not acquired:
            return False
        try:
            self._data = {**self._data, key: value}
            return True
        finally:
            self._lock.release()
```

---

## 2. RLock (Reentrant Lock)

An RLock can be acquired multiple times by the **same thread** without deadlocking. It
tracks the owning thread and a recursion count.

### Why RLock Exists

```python
# PROBLEM: Regular Lock deadlocks if same thread acquires twice
lock = threading.Lock()

def outer():
    with lock:       # Acquires lock
        inner()      # Tries to acquire SAME lock --> DEADLOCK!

def inner():
    with lock:       # Blocked forever (lock already held)
        pass
```

### How RLock Works Internally

```
RLock Internal State:
+-----------------------------------+
| locked: bool = False              |
| owner: Thread = None              |
| recursion_count: int = 0          |
| wait_queue: Queue[Thread] = []    |
+-----------------------------------+

acquire():
  if owner == current_thread:
    recursion_count += 1             # Same thread: just increment
  elif not locked:
    locked = True
    owner = current_thread
    recursion_count = 1
  else:
    wait_queue.append(current_thread)
    suspend current_thread

release():
  assert owner == current_thread
  recursion_count -= 1
  if recursion_count == 0:           # Fully released
    locked = False
    owner = None
    if wait_queue:
      wake up next thread
```

### When to Use RLock

```python
import threading


class FileSystem:
    """RLock allows methods to call each other safely."""

    def __init__(self):
        self._files: dict[str, str] = {}
        self._lock = threading.RLock()  # Reentrant!

    def write(self, path: str, content: str) -> None:
        with self._lock:
            self._files = {**self._files, path: content}

    def read(self, path: str) -> str:
        with self._lock:
            return self._files.get(path, "")

    def copy(self, src: str, dest: str) -> None:
        with self._lock:           # First acquisition
            content = self.read(src)   # Second acquisition (same thread) -- OK!
            self.write(dest, content)  # Third acquisition (same thread) -- OK!

    def move(self, src: str, dest: str) -> None:
        with self._lock:           # First acquisition
            self.copy(src, dest)       # Nests deeper -- still OK with RLock
            # Remove source
            new_files = {k: v for k, v in self._files.items() if k != src}
            self._files = new_files
```

---

## 3. Semaphore

A semaphore maintains a counter. `acquire()` decrements the counter (blocking if zero).
`release()` increments it. Unlike a mutex, a semaphore does not track ownership.

### Binary Semaphore vs Counting Semaphore

```
Binary Semaphore (count = 0 or 1):
  Functionally similar to a mutex, but NO ownership tracking.
  Any thread can release it, not just the one that acquired it.

Counting Semaphore (count = N):
  Allows up to N threads to enter the critical section simultaneously.
  Used for resource pools (connections, file handles, etc).
```

### How Counting Semaphore Works

```
Semaphore(3):

Thread A: acquire() --> count: 3->2, enters
Thread B: acquire() --> count: 2->1, enters
Thread C: acquire() --> count: 1->0, enters
Thread D: acquire() --> count: 0, BLOCKED (waits)
Thread E: acquire() --> count: 0, BLOCKED (waits)

Thread A: release() --> count: 0->1, Thread D wakes
Thread D: (already decremented) enters
```

### Rate Limiter with Semaphore

```python
import threading
import time
from concurrent.futures import ThreadPoolExecutor


class RateLimiter:
    """Limit concurrent access to an external API."""

    def __init__(self, max_concurrent: int):
        self._semaphore = threading.Semaphore(max_concurrent)

    def call_api(self, request_id: int) -> dict:
        """At most max_concurrent threads can be inside this method."""
        with self._semaphore:
            # Simulate API call
            time.sleep(0.5)
            return {"request_id": request_id, "status": "success"}


def demonstrate_rate_limiter():
    limiter = RateLimiter(max_concurrent=3)

    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(limiter.call_api, i) for i in range(10)]
        # Only 3 API calls happen at a time, even with 10 threads
        results = [f.result() for f in futures]
    return results
```

### BoundedSemaphore

A `BoundedSemaphore` prevents calling `release()` more times than `acquire()`. This catches
bugs where a thread releases without acquiring.

```python
# Regular Semaphore: release without acquire silently increases count
sem = threading.Semaphore(2)
sem.release()  # count becomes 3 -- BUG but no error!

# BoundedSemaphore: raises ValueError if released too many times
bounded = threading.BoundedSemaphore(2)
bounded.release()  # ValueError: Semaphore released too many times
```

---

## 4. Condition Variables

A condition variable lets threads wait until a specific condition becomes true. It is always
used with a lock. The key insight: `wait()` atomically releases the lock and suspends the
thread, and re-acquires the lock when woken.

### How Condition Variables Work

```
Condition Variable Operations:

wait():
  1. RELEASE the associated lock        (atomically)
  2. SUSPEND the current thread          (atomically)
  3. [... thread sleeps until notified ...]
  4. RE-ACQUIRE the lock                 (when woken)
  5. Return (thread continues with lock held)

notify():
  Wake up ONE waiting thread (thread moves to ready queue,
  but must still acquire the lock before continuing)

notify_all():
  Wake up ALL waiting threads (they all compete for the lock)
```

### Why Use While Loop with wait()

```python
# WRONG: using 'if' instead of 'while'
with condition:
    if not ready:          # BUG: spurious wakeup can occur!
        condition.wait()
    process()

# CORRECT: always use 'while' loop
with condition:
    while not ready:       # Re-check condition after every wakeup
        condition.wait()
    process()
```

**Spurious wakeups** are allowed by the POSIX specification. The OS may wake a thread
without anyone calling `notify()`. The `while` loop re-checks the condition and goes back
to sleep if it is still not satisfied.

### Blocking Queue with Condition Variables

```python
import threading
from typing import TypeVar, Generic

T = TypeVar("T")


class BlockingQueue(Generic[T]):
    """Thread-safe bounded queue built from condition variables.

    This is a common interview question: 'Implement a blocking queue.'
    """

    def __init__(self, capacity: int):
        self._buffer: list[T] = []
        self._capacity = capacity
        self._lock = threading.Lock()
        self._not_full = threading.Condition(self._lock)
        self._not_empty = threading.Condition(self._lock)

    def put(self, item: T) -> None:
        """Block until space is available, then add item."""
        with self._not_full:
            while len(self._buffer) >= self._capacity:
                self._not_full.wait()  # Release lock, sleep until space
            self._buffer = [*self._buffer, item]
            self._not_empty.notify()   # Wake one consumer

    def get(self) -> T:
        """Block until an item is available, then remove and return it."""
        with self._not_empty:
            while len(self._buffer) == 0:
                self._not_empty.wait()  # Release lock, sleep until item
            item = self._buffer[0]
            self._buffer = self._buffer[1:]
            self._not_full.notify()     # Wake one producer
            return item

    def size(self) -> int:
        with self._lock:
            return len(self._buffer)
```

### Multi-Condition Coordination: Traffic Light

```python
import threading
import time


class TrafficLight:
    """Condition variable to coordinate traffic directions.

    Demonstrates using notify_all() to wake multiple waiters.
    """

    def __init__(self):
        self._lock = threading.Lock()
        self._condition = threading.Condition(self._lock)
        self._direction = "north_south"  # Current green direction

    def switch(self) -> None:
        """Switch the traffic light direction."""
        with self._condition:
            self._direction = (
                "east_west" if self._direction == "north_south"
                else "north_south"
            )
            self._condition.notify_all()  # Wake ALL waiting cars

    def wait_for_green(self, car_direction: str) -> None:
        """Car waits until the light is green for its direction."""
        with self._condition:
            while self._direction != car_direction:
                self._condition.wait()
            # Light is green for this direction
```

---

## 5. Barriers

A barrier blocks all threads until a specified number of threads have reached it. Then all
threads are released simultaneously. Useful for phased computation.

### How Barriers Work

```
Barrier(parties=3):

Thread A: [compute phase 1]--[BARRIER: wait]................[compute phase 2]
Thread B: [compute phase 1]------[BARRIER: wait]............[compute phase 2]
Thread C: [compute phase 1]----------[BARRIER: wait/RELEASE][compute phase 2]
                                      ^
                                      All 3 arrived, all released at once
```

### Python Barrier Example

```python
import threading
import time
import random


class ParallelMatrixMultiply:
    """Use barriers to synchronize phases of parallel computation."""

    def __init__(self, num_workers: int):
        self._barrier = threading.Barrier(num_workers)
        self._num_workers = num_workers
        self._partial_results: list[float] = [0.0] * num_workers
        self._final_result: float = 0.0

    def worker(self, worker_id: int) -> None:
        # Phase 1: Each worker computes its portion
        result = self._compute_partial(worker_id)
        self._partial_results[worker_id] = result

        # Barrier: wait until all workers finish Phase 1
        self._barrier.wait()

        # Phase 2: All workers can now see all partial results
        # Worker 0 aggregates (only one thread does aggregation)
        if worker_id == 0:
            self._final_result = sum(self._partial_results)

    def _compute_partial(self, worker_id: int) -> float:
        time.sleep(random.uniform(0.1, 0.5))  # Simulate computation
        return float(worker_id * 10)

    def run(self) -> float:
        threads = [
            threading.Thread(target=self.worker, args=(i,))
            for i in range(self._num_workers)
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        return self._final_result
```

### Barrier with Action

```python
def barrier_with_action():
    """The barrier can execute a callback when all threads arrive."""

    def on_all_arrived():
        print("All threads arrived! Starting next phase.")

    barrier = threading.Barrier(3, action=on_all_arrived)

    def worker(name: str) -> None:
        print(f"{name}: phase 1 complete")
        barrier.wait()  # on_all_arrived() runs once here
        print(f"{name}: phase 2 starting")

    threads = [
        threading.Thread(target=worker, args=(f"Worker-{i}",))
        for i in range(3)
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
```

---

## 6. Events

An Event is a simple flag that threads can wait on. One thread sets the event, and all
waiting threads are released. Events are one-shot signals (or can be reset).

### Event vs Condition Variable

```
Event:      Simple flag. "Something happened." No associated data.
Condition:  Associated with a lock and a predicate. "State changed, check if ready."

Use Event when:   You just need a signal (initialization done, shutdown requested)
Use Condition when: You need to check a complex condition with shared state
```

### Event for Service Initialization

```python
import threading
import time


class DatabaseConnection:
    """Event ensures no queries run before the connection is established."""

    def __init__(self):
        self._ready = threading.Event()
        self._connection = None

    def connect(self) -> None:
        """Called once during startup."""
        time.sleep(2)  # Simulate slow connection handshake
        self._connection = {"status": "connected", "pool_size": 10}
        self._ready.set()  # Signal all waiting threads

    def query(self, sql: str, timeout: float = 5.0) -> dict:
        """Called by many threads. Blocks until connection is ready."""
        if not self._ready.wait(timeout=timeout):
            raise TimeoutError("Database connection not ready")
        # Connection is guaranteed to be initialized here
        return {"sql": sql, "result": "data"}

    def shutdown(self) -> None:
        """Reset event if connection needs to be re-established."""
        self._ready.clear()  # Threads will block again on query()
        self._connection = None


def demonstrate_event():
    db = DatabaseConnection()

    # Start connection in background
    connector = threading.Thread(target=db.connect, daemon=True)
    connector.start()

    # Worker threads immediately start querying
    def worker(query_id: int):
        result = db.query(f"SELECT * FROM users WHERE id = {query_id}")
        return result

    threads = [
        threading.Thread(target=worker, args=(i,))
        for i in range(5)
    ]
    for t in threads:
        t.start()  # These will block until db.connect() calls set()
    for t in threads:
        t.join()
```

### Graceful Shutdown with Event

```python
import threading
import time


class GracefulWorker:
    """Use Event for cooperative shutdown signaling."""

    def __init__(self):
        self._shutdown_event = threading.Event()

    def run(self) -> None:
        """Main worker loop. Checks shutdown event periodically."""
        while not self._shutdown_event.is_set():
            # Do work
            self._process_next_item()
            # Wait with timeout allows checking shutdown flag
            self._shutdown_event.wait(timeout=0.1)

        # Cleanup after shutdown signal
        self._cleanup()

    def shutdown(self) -> None:
        """Signal the worker to stop gracefully."""
        self._shutdown_event.set()

    def _process_next_item(self) -> None:
        time.sleep(0.05)

    def _cleanup(self) -> None:
        pass
```

---

## 7. ReadWriteLock

A ReadWriteLock allows multiple concurrent readers OR a single exclusive writer. This
optimizes read-heavy workloads where writes are rare.

### Writer-Preference ReadWriteLock

The basic implementation in the LLD file has writer starvation. Here is a writer-preference
version that prevents writers from starving.

```python
import threading


class WriterPreferenceRWLock:
    """ReadWriteLock that gives priority to writers.

    When a writer is waiting, new readers are blocked. This prevents
    writer starvation but may starve readers under heavy write load.
    """

    def __init__(self):
        self._lock = threading.Lock()
        self._readers_ok = threading.Condition(self._lock)
        self._writers_ok = threading.Condition(self._lock)
        self._active_readers = 0
        self._active_writers = 0
        self._waiting_writers = 0

    def acquire_read(self) -> None:
        with self._readers_ok:
            # Block if a writer is active OR writers are waiting
            while self._active_writers > 0 or self._waiting_writers > 0:
                self._readers_ok.wait()
            self._active_readers += 1

    def release_read(self) -> None:
        with self._lock:
            self._active_readers -= 1
            if self._active_readers == 0 and self._waiting_writers > 0:
                self._writers_ok.notify()  # Wake one waiting writer

    def acquire_write(self) -> None:
        with self._writers_ok:
            self._waiting_writers += 1
            while self._active_readers > 0 or self._active_writers > 0:
                self._writers_ok.wait()
            self._waiting_writers -= 1
            self._active_writers += 1

    def release_write(self) -> None:
        with self._lock:
            self._active_writers -= 1
            if self._waiting_writers > 0:
                self._writers_ok.notify()      # Prefer writers
            else:
                self._readers_ok.notify_all()  # No writers waiting, wake readers


class ReadWriteLockContext:
    """Context manager wrappers for clean syntax."""

    def __init__(self, rw_lock: WriterPreferenceRWLock, mode: str):
        self._rw_lock = rw_lock
        self._mode = mode

    def __enter__(self):
        if self._mode == "read":
            self._rw_lock.acquire_read()
        else:
            self._rw_lock.acquire_write()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self._mode == "read":
            self._rw_lock.release_read()
        else:
            self._rw_lock.release_write()


class ConcurrentCache:
    """Cache using writer-preference RWLock. Many reads, few writes."""

    def __init__(self):
        self._data: dict[str, str] = {}
        self._rw_lock = WriterPreferenceRWLock()

    def get(self, key: str) -> str | None:
        with ReadWriteLockContext(self._rw_lock, "read"):
            return self._data.get(key)

    def put(self, key: str, value: str) -> None:
        with ReadWriteLockContext(self._rw_lock, "write"):
            self._data = {**self._data, key: value}

    def get_all(self) -> dict[str, str]:
        with ReadWriteLockContext(self._rw_lock, "read"):
            return dict(self._data)  # Return copy
```

---

## 8. Spinlock vs Mutex

### Spinlock

A spinlock does NOT put the thread to sleep when the lock is unavailable. Instead, it
**busy-waits** (spins in a loop) checking the lock repeatedly.

```
Spinlock Behavior:
Thread A: [acquire: locked=True]---[critical section]---[release]
Thread B: [spin][spin][spin][spin][spin][spin][spin]----[acquire]---[cs]

Mutex Behavior:
Thread A: [acquire]---[critical section]---[release]
Thread B: [acquire: BLOCKED, sleeping].....[wake up]---[cs]

Spinlock: burns CPU cycles while waiting
Mutex: thread sleeps, no CPU used while waiting
```

### When to Use Each

```
+-------------------+----------------------------+----------------------------+
| Factor            | Spinlock                   | Mutex                      |
+-------------------+----------------------------+----------------------------+
| Wait time         | Very short (nanoseconds)   | Longer (microseconds+)     |
| CPU usage         | Burns CPU while waiting    | Thread sleeps, no CPU      |
| Context switch    | None (stays on core)       | Yes (sleep/wake syscalls)  |
| Best for          | Lock held for < 1us        | Lock held for > 10us       |
| Multicore?        | Required (spinning on one  | Works on single core too   |
|                   | core while other releases) |                            |
| Kernel code?      | Often used in OS kernels   | Used in user space         |
+-------------------+----------------------------+----------------------------+
```

### Python Spinlock Implementation (Conceptual)

```python
import threading
import time


class SpinLock:
    """Conceptual spinlock. In practice, Python's GIL makes this less useful.

    Real spinlocks use hardware atomic instructions (test-and-set, CAS).
    This implementation demonstrates the concept.
    """

    def __init__(self):
        self._locked = False
        self._internal_lock = threading.Lock()  # Used for atomicity

    def acquire(self) -> None:
        while True:
            with self._internal_lock:
                if not self._locked:
                    self._locked = True
                    return
            # Spin: keep checking without sleeping
            # In real code: use atomic CAS instruction here

    def release(self) -> None:
        with self._internal_lock:
            self._locked = False

    def __enter__(self):
        self.acquire()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.release()
```

### Adaptive Spinlock

Modern implementations combine both: spin briefly, then fall back to sleeping.

```
Adaptive Spinlock:
1. Spin for N iterations (e.g., 100)
2. If lock not acquired, yield to OS
3. If still not acquired, sleep (become mutex)

This combines the benefits:
- Low latency for short critical sections (no syscall)
- No CPU waste for long critical sections (sleeps)
```

---

## 9. Optimistic vs Pessimistic Locking

### Pessimistic Locking

Assumes conflicts are likely. Lock BEFORE reading/modifying data.

```
Pessimistic (Lock First, Ask Questions Later):

Thread A: [LOCK]---[read data]---[modify]---[write]---[UNLOCK]
Thread B: --------[LOCK attempt: BLOCKED]...............[LOCK]---[read]---[modify]---[write]---[UNLOCK]
```

```python
import threading


class PessimisticAccount:
    """Always lock before any operation. Safe but potentially slow."""

    def __init__(self, account_id: str, balance: float):
        self.account_id = account_id
        self._balance = balance
        self._lock = threading.Lock()

    def transfer_to(self, other: "PessimisticAccount", amount: float) -> bool:
        # Lock ordering to prevent deadlock
        first, second = sorted(
            [self, other], key=lambda a: a.account_id
        )

        with first._lock:
            with second._lock:
                if self._balance >= amount:
                    self._balance -= amount
                    other._balance += amount
                    return True
                return False
```

### Optimistic Locking

Assumes conflicts are rare. Read data, do work, then check if anyone else modified it
before committing. Retry if conflict detected.

```
Optimistic (Try and Verify):

Thread A: [read v=1]---[modify]---[CAS(v=1->2): SUCCESS]
Thread B: [read v=1]---[modify]---[CAS(v=1->2): FAIL! v is now 2]---[retry: read v=2]---[modify]---[CAS(v=2->3): SUCCESS]

No locking during read/modify. Only check at commit time.
```

```python
import threading
import time


class OptimisticAccount:
    """Use version numbers instead of locks. Retry on conflict."""

    def __init__(self, account_id: str, balance: float):
        self.account_id = account_id
        self._balance = balance
        self._version = 0
        self._lock = threading.Lock()  # Only held briefly for CAS

    def get_balance_and_version(self) -> tuple[float, int]:
        """Read without locking (optimistic)."""
        return self._balance, self._version

    def compare_and_set_balance(
        self, expected_version: int, new_balance: float
    ) -> bool:
        """Atomic compare-and-swap. Returns True if successful."""
        with self._lock:  # Very brief lock, just for the CAS
            if self._version == expected_version:
                self._balance = new_balance
                self._version += 1
                return True
            return False  # Conflict detected

    def withdraw(self, amount: float, max_retries: int = 3) -> bool:
        """Optimistic withdrawal with retry loop."""
        for attempt in range(max_retries):
            balance, version = self.get_balance_and_version()
            if balance < amount:
                return False

            new_balance = balance - amount

            if self.compare_and_set_balance(version, new_balance):
                return True  # Success!

            # Conflict: another thread modified the balance.
            # Retry with fresh data.
            time.sleep(0.001 * (attempt + 1))  # Brief backoff

        return False  # Exhausted retries
```

### When to Use Each

```
+---------------------+----------------------------+----------------------------+
| Factor              | Pessimistic                | Optimistic                 |
+---------------------+----------------------------+----------------------------+
| Conflict frequency  | High (many writes)         | Low (mostly reads)         |
| Read/write ratio    | Write-heavy                | Read-heavy                 |
| Lock duration       | Entire transaction         | Brief (CAS only)           |
| Throughput          | Lower (blocking)           | Higher (no blocking)       |
| Starvation risk     | Lower                      | Higher (retries may fail)  |
| Complexity          | Simple (just lock)         | Higher (retry logic)       |
| Database analogy    | SELECT FOR UPDATE          | WHERE version = N          |
+---------------------+----------------------------+----------------------------+
```

---

## 10. Compare-And-Swap (CAS)

CAS is the hardware primitive that enables lock-free programming. It is an atomic
instruction that compares a memory location to an expected value and, if they match,
swaps in a new value.

### How CAS Works

```
CAS(address, expected, new_value):
  ATOMICALLY:
    if memory[address] == expected:
      memory[address] = new_value
      return True
    else:
      return False

This is a SINGLE atomic CPU instruction (e.g., CMPXCHG on x86).
No thread can see an intermediate state.
```

### CAS-Based Counter (Lock-Free)

```python
import threading


class CASCounter:
    """Lock-free counter using compare-and-swap pattern.

    In real systems, this uses hardware atomic instructions.
    Python's GIL makes a true lock-free implementation moot,
    but this demonstrates the concept for interviews.
    """

    def __init__(self):
        self._value = 0
        self._cas_lock = threading.Lock()  # Simulates atomic CAS

    def _cas(self, expected: int, new_value: int) -> bool:
        """Simulate atomic compare-and-swap."""
        with self._cas_lock:
            if self._value == expected:
                self._value = new_value
                return True
            return False

    def increment(self) -> int:
        """Lock-free increment using CAS retry loop."""
        while True:
            current = self._value
            if self._cas(current, current + 1):
                return current + 1
            # CAS failed: another thread changed the value. Retry.

    def get(self) -> int:
        return self._value
```

### The ABA Problem

```
The ABA Problem:
Thread 1: reads value A
Thread 2: changes A -> B -> A  (value is A again!)
Thread 1: CAS succeeds (sees A, expects A), but state has changed

Example:
  Lock-free stack: Thread 1 reads top = A -> B -> C
  Thread 2 pops A, pops B, pushes A back:  top = A -> C
  Thread 1: CAS(top, A, new_node) succeeds, but B is gone!

Solutions:
  1. Double-width CAS with version counter (ABA counter)
  2. Hazard pointers
  3. Tagged pointers (use unused bits for version)
```

---

## 11. Common Interview Questions

1. **What is the difference between a mutex and a semaphore?**
   A mutex has ownership (only the acquiring thread can release), count is 0/1.
   A semaphore has no ownership (any thread can release), count can be 0..N.

2. **When would you use a Condition variable vs an Event?**
   Event for simple one-time signals. Condition when you need to check a complex predicate
   with associated shared state under a lock.

3. **Why must you use a while loop with condition.wait()?**
   Spurious wakeups can occur (POSIX allows it). The while loop re-checks the condition.
   Also, notify() may wake a thread whose condition is not yet satisfied if multiple
   conditions share one Condition object.

4. **Implement a thread-safe bounded buffer using only condition variables.**
   Use two conditions (not_full, not_empty) sharing one lock. Put blocks on not_full, get
   blocks on not_empty.

5. **What is the ABA problem and how do you solve it?**
   CAS succeeds even though the value was changed and changed back. Solved with version
   counters or tagged pointers.

6. **When should you prefer a spinlock over a mutex?**
   When the critical section is very short (nanoseconds), on a multi-core system, and you
   cannot afford the overhead of a context switch.

---

## 12. Gotchas

- **Forgetting to release a lock.** Always use `with` statement or try/finally. If an
  exception occurs inside a critical section without proper cleanup, the lock stays held
  forever.

- **Using Lock when you need RLock.** If a method that holds a lock calls another method
  that needs the same lock, use RLock. Otherwise, the thread deadlocks itself.

- **Semaphore does not protect critical sections.** A semaphore limits concurrency but does
  not guarantee mutual exclusion for shared data. If two threads both enter (count=2), they
  can still race on shared variables.

- **notify() vs notify_all().** Using `notify()` when you need `notify_all()` can cause
  threads to remain blocked indefinitely. Use `notify_all()` when multiple threads might be
  waiting for different conditions on the same Condition object.

- **Holding locks during I/O.** Never hold a lock while performing network calls or disk I/O.
  This serializes your I/O operations and kills concurrency.

- **Optimistic locking under high contention.** If conflicts are frequent, optimistic locking
  degrades to repeated retries, wasting CPU. Switch to pessimistic locking.

- **Reader-writer lock misconception.** An RWLock only helps if reads vastly outnumber writes
  AND the critical section is long enough to amortize the overhead of the more complex lock.
  For short critical sections, a simple mutex is often faster.

---

## 13. Quick Reference

```
+---------------------+-----------------+------------------------------------+
| Primitive           | Key Method      | Use Case                           |
+---------------------+-----------------+------------------------------------+
| Lock (Mutex)        | acquire/release | Protect any shared mutable state   |
| RLock               | acquire/release | Same thread needs lock recursively |
| Semaphore(N)        | acquire/release | Limit to N concurrent accessors    |
| BoundedSemaphore(N) | acquire/release | Same + prevents over-release       |
| Condition           | wait/notify     | Wait for complex state predicate   |
| Barrier(N)          | wait            | Sync N threads at a rendezvous     |
| Event               | set/wait/clear  | One-shot signal between threads    |
+---------------------+-----------------+------------------------------------+

Choosing the Right Primitive:
+-------------------------------------------+-------------------+
| Problem                                   | Primitive         |
+-------------------------------------------+-------------------+
| Only one thread in critical section       | Lock / Mutex      |
| Same thread re-enters critical section    | RLock             |
| Limit concurrent access to pool           | Semaphore         |
| Wait until buffer has space/items         | Condition         |
| Wait until all workers finish a phase     | Barrier           |
| Signal that initialization is complete    | Event             |
| Many readers, few writers                 | ReadWriteLock     |
| Very short critical section, multi-core   | Spinlock          |
| Read-heavy, rare conflicts                | Optimistic (CAS)  |
| Write-heavy, frequent conflicts           | Pessimistic (Lock)|
+-------------------------------------------+-------------------+

Complexity Ladder (simple to complex):
  Event < Lock < RLock < Semaphore < Condition < Barrier < RWLock < CAS
```
