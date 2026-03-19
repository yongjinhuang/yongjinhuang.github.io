# Concurrency Interview Questions

30 curated questions organized by difficulty. For each question: the question itself, key
points to cover in your answer, common follow-ups the interviewer may ask, and code
skeletons where applicable.

---

## Table of Contents

1. [Easy Questions (1-10)](#easy-questions)
2. [Medium Questions (11-20)](#medium-questions)
3. [Hard Questions (21-30)](#hard-questions)
4. [Quick Reference: Answer Frameworks](#quick-reference)

---

## Easy Questions

### Q1: What is a race condition? Give an example.

**Key Points:**

- A race condition occurs when the outcome depends on the timing/ordering of thread execution
- Happens when multiple threads access shared data and at least one writes
- The result is non-deterministic

**Answer Framework:**

```python
# Classic race condition: check-then-act
class BrokenCounter:
    def __init__(self):
        self.count = 0

    def increment(self):
        # Three bytecode operations: LOAD, ADD, STORE
        self.count += 1  # NOT atomic!

# Thread A reads count=5, Thread B reads count=5
# Thread A writes count=6, Thread B writes count=6
# Expected: 7, Got: 6 (one increment lost)
```

**Follow-ups:**

- How do you fix it? (Lock, atomic operations)
- Is `list.append()` in Python thread-safe? (Yes, due to GIL, but do not rely on it)
- What is a TOCTOU race condition? (Time-of-check to time-of-use)

---

### Q2: What is the difference between a process and a thread?

**Key Points:**

- Process: separate memory space, heavier, isolated
- Thread: shared memory space within a process, lighter, needs synchronization
- Processes communicate via IPC, threads via shared memory

**Follow-ups:**

- When would you use processes over threads? (CPU-bound in Python, need isolation)
- What is a daemon thread? (Killed when main thread exits)

---

### Q3: What is a mutex and when do you use one?

**Key Points:**

- Mutual exclusion lock: only one thread can hold it at a time
- Protects critical sections (shared mutable state)
- Always use with context manager (`with lock:`) for safety

**Answer Framework:**

```python
import threading

lock = threading.Lock()
shared_data = []

def safe_append(item):
    with lock:
        shared_data.append(item)
```

**Follow-ups:**

- What is the difference between a mutex and a semaphore? (Ownership, count)
- What is a reentrant lock? (Same thread can acquire multiple times)

---

### Q4: What is the GIL in Python?

**Key Points:**

- Global Interpreter Lock in CPython allows only one thread to execute Python bytecode
- Exists because CPython's memory management is not thread-safe
- Threads still useful for I/O-bound work (GIL released during I/O)
- Bypass with multiprocessing, C extensions, or asyncio

**Follow-ups:**

- Does the GIL mean Python threads are useless? (No, I/O-bound work benefits)
- How does Go avoid this problem? (No GIL, goroutines are truly parallel)
- Will the GIL be removed? (PEP 703 is working on a free-threaded Python)

---

### Q5: What is the difference between concurrency and parallelism?

**Key Points:**

- Concurrency: dealing with multiple things at once (structure)
- Parallelism: doing multiple things at once (execution)
- You can have concurrency without parallelism (single core)
- Rob Pike: "Concurrency is about dealing with lots of things. Parallelism is about doing."

**Follow-ups:**

- Give an example of concurrency without parallelism (single-core multitasking)
- Give an example of parallelism without concurrency (SIMD instructions)

---

### Q6: What is a deadlock?

**Key Points:**

- Two or more threads are blocked forever, each waiting for the other to release a resource
- Requires all four Coffman conditions: mutual exclusion, hold-and-wait, no preemption,
  circular wait

**Answer Framework:**

```python
# Deadlock: Thread 1 holds A, waits for B
#           Thread 2 holds B, waits for A

lock_a, lock_b = threading.Lock(), threading.Lock()

def thread_1():
    with lock_a:
        with lock_b:  # Waits forever
            pass

def thread_2():
    with lock_b:
        with lock_a:  # Waits forever
            pass
```

**Follow-ups:**

- How do you prevent deadlock? (Lock ordering, timeout, all-or-nothing)
- How do you detect deadlock? (Wait-for graph, cycle detection)

---

### Q7: What is a semaphore?

**Key Points:**

- Counter-based synchronization primitive
- Binary semaphore (0/1): similar to mutex but no ownership
- Counting semaphore (0..N): limits concurrent access to N

**Answer Framework:**

```python
# Limit to 5 concurrent database connections
semaphore = threading.Semaphore(5)

def query_db():
    with semaphore:  # At most 5 threads in this block
        execute_query()
```

**Follow-ups:**

- Difference between semaphore and mutex? (Ownership, count)
- What is a BoundedSemaphore? (Prevents over-release)

---

### Q8: What is the difference between `notify()` and `notify_all()`?

**Key Points:**

- `notify()`: wakes ONE waiting thread (arbitrary)
- `notify_all()`: wakes ALL waiting threads
- Use `notify_all()` when multiple threads wait for different conditions on the same
  Condition object
- Use `notify()` when any one waiter can handle the event (slightly more efficient)

**Follow-ups:**

- Why must you use a while loop with `wait()`? (Spurious wakeups)
- When is `notify()` safe vs. `notify_all()`?

---

### Q9: What is a condition variable?

**Key Points:**

- Allows threads to wait for a specific condition to become true
- Always used with a lock
- `wait()` atomically releases the lock and suspends the thread
- `notify()` wakes waiting threads, which then re-acquire the lock

**Answer Framework:**

```python
condition = threading.Condition()
queue = []

def consumer():
    with condition:
        while not queue:        # Always while, not if
            condition.wait()    # Release lock, sleep
        item = queue.pop(0)     # Lock is re-acquired

def producer(item):
    with condition:
        queue.append(item)
        condition.notify()      # Wake one consumer
```

**Follow-ups:**

- Why `while` instead of `if`? (Spurious wakeups, multiple waiters)
- How does this relate to the producer-consumer pattern?

---

### Q10: What is thread-local storage?

**Key Points:**

- Each thread gets its own copy of a variable
- No synchronization needed (each copy is independent)
- Used for per-thread state: database connections, request context

**Answer Framework:**

```python
import threading

local_data = threading.local()

def worker():
    local_data.connection = create_connection()  # Each thread has its own
    use_connection(local_data.connection)
```

**Follow-ups:**

- When would you use thread-local vs. passing context explicitly?
- How does this work with async code? (contextvars module in Python)

---

## Medium Questions

### Q11: Implement a thread-safe singleton.

**Key Points:**

- Naive check-then-create has a race condition
- Double-checked locking: check without lock, then with lock
- In Python, module-level instance is simplest (import lock is thread-safe)

**Code Skeleton:**

```python
import threading

class Singleton:
    _instance = None
    _lock = threading.Lock()

    @classmethod
    def get_instance(cls):
        if cls._instance is None:          # First check (fast path)
            with cls._lock:
                if cls._instance is None:  # Second check (synchronized)
                    cls._instance = cls()
        return cls._instance
```

**Follow-ups:**

- Why is double-checked locking broken in Java without volatile?
- What is the Pythonic way? (Module-level instance, `__new__` override)

---

### Q12: Design a thread-safe blocking queue.

**Key Points:**

- `put()` blocks when full, `get()` blocks when empty
- Use two condition variables: not_full, not_empty
- Always use while loop for condition checks

**Code Skeleton:**

```python
class BlockingQueue:
    def __init__(self, capacity):
        self._buffer = []
        self._capacity = capacity
        self._lock = threading.Lock()
        self._not_full = threading.Condition(self._lock)
        self._not_empty = threading.Condition(self._lock)

    def put(self, item):
        with self._not_full:
            while len(self._buffer) >= self._capacity:
                self._not_full.wait()
            self._buffer.append(item)
            self._not_empty.notify()

    def get(self):
        with self._not_empty:
            while not self._buffer:
                self._not_empty.wait()
            item = self._buffer.pop(0)
            self._not_full.notify()
            return item
```

**Follow-ups:**

- How would you add timeout support?
- How would you add a `close()` method for graceful shutdown?

---

### Q13: What causes deadlock and how do you prevent it?

**Key Points:**

- Four Coffman conditions (all required): mutual exclusion, hold-and-wait, no preemption,
  circular wait
- Prevention: break any one condition
  - Lock ordering (break circular wait)
  - Try-lock with timeout (break no preemption)
  - Request all locks at once (break hold-and-wait)
- Detection: wait-for graph with cycle detection

**Follow-ups:**

- What is the difference between deadlock prevention and avoidance?
- Explain the Banker's Algorithm
- How do databases handle deadlocks? (Detect + abort victim)

---

### Q14: Explain the difference between optimistic and pessimistic locking.

**Key Points:**

- Pessimistic: lock before reading (SELECT FOR UPDATE), safe but slow
- Optimistic: read freely, check version at write time, retry on conflict
- Pessimistic for high contention, optimistic for low contention

**Follow-ups:**

- How do you implement optimistic locking in a REST API? (ETags, If-Match)
- What happens under high contention with optimistic locking? (Many retries, livelock risk)

---

### Q15: What is the async/await pattern and how does it work?

**Key Points:**

- `async def` declares a coroutine, `await` yields control to the event loop
- Event loop uses OS I/O multiplexing (epoll/kqueue) to monitor many sockets with one thread
- Cooperative multitasking: coroutines explicitly yield at await points
- Blocking calls (time.sleep, synchronous I/O) freeze the event loop

**Follow-ups:**

- How is asyncio different from threading? (Single thread, cooperative vs preemptive)
- What is structured concurrency? (TaskGroup, tasks cannot outlive their scope)
- How do you call blocking code from async? (run_in_executor)

---

### Q16: Explain Go's goroutines and channels.

**Key Points:**

- Goroutines: lightweight threads (2KB stack), M:N scheduled by Go runtime
- Channels: typed conduits for communication between goroutines
- Unbuffered channel: synchronous handshake (sender blocks until receiver ready)
- Buffered channel: asynchronous up to buffer size
- Philosophy: "Share memory by communicating"

**Follow-ups:**

- What is the select statement? (Multiplex channel operations)
- How do you prevent goroutine leaks? (Context cancellation)
- What is the difference between sync.Mutex and channels? (When to use each)

---

### Q17: What is priority inversion and how do you fix it?

**Key Points:**

- High-priority thread blocked by low-priority thread, while medium-priority thread runs
- Effectively inverts the priority ordering
- Fix 1: Priority inheritance (boost low-priority thread's priority)
- Fix 2: Priority ceiling (lock has ceiling priority equal to highest user)
- Real-world: Mars Pathfinder bug (1997)

**Follow-ups:**

- Can priority inversion happen in user-space schedulers?
- What is the priority ceiling protocol?

---

### Q18: How does the event loop handle I/O internally?

**Key Points:**

- Uses OS-level I/O multiplexing: epoll (Linux), kqueue (macOS), IOCP (Windows)
- One thread can monitor thousands of file descriptors simultaneously
- When I/O completes, the corresponding coroutine is moved to the ready queue
- No thread per connection, very low memory overhead

**Follow-ups:**

- What is the C10K problem? (Handling 10K concurrent connections)
- Why can a single-threaded event loop outperform multithreaded servers for I/O?

---

### Q19: What is a livelock?

**Key Points:**

- Threads are not blocked but cannot make progress
- They repeatedly respond to each other (like two people in a hallway stepping aside
  in sync)
- Unlike deadlock: CPU usage is high, threads are running
- Fix: random backoff to desynchronize

**Code Skeleton:**

```python
# Livelock: both threads keep yielding to each other
def thread_1():
    while True:
        lock_a.acquire()
        if lock_b.acquire(blocking=False):
            break
        lock_a.release()  # "Politely" release, retry -- in lockstep!

# Fix: add random sleep before retry
        time.sleep(random.uniform(0.001, 0.01))
```

**Follow-ups:**

- How is livelock different from starvation?
- How do you detect livelock? (Monitor forward progress, not just thread state)

---

### Q20: Implement a reader-writer lock.

**Key Points:**

- Multiple concurrent readers OR single exclusive writer
- Basic version has writer starvation (readers keep arriving)
- Writer-preference version blocks new readers when writer is waiting

**Code Skeleton:**

```python
class ReadWriteLock:
    def __init__(self):
        self._lock = threading.Lock()
        self._write_lock = threading.Lock()
        self._readers = 0

    def acquire_read(self):
        with self._lock:
            self._readers += 1
            if self._readers == 1:
                self._write_lock.acquire()

    def release_read(self):
        with self._lock:
            self._readers -= 1
            if self._readers == 0:
                self._write_lock.release()

    def acquire_write(self):
        self._write_lock.acquire()

    def release_write(self):
        self._write_lock.release()
```

**Follow-ups:**

- How do you prevent writer starvation? (Writer-preference: block new readers when writer waits)
- When is a RWLock worse than a plain mutex? (Short critical sections, write-heavy workloads)

---

## Hard Questions

### Q21: Design a thread pool from scratch.

**Key Points:**

- Fixed number of worker threads
- Shared task queue (blocking queue)
- Workers pull tasks from queue and execute them
- Support graceful shutdown (drain queue, stop workers)
- Return results via Futures

**Code Skeleton:**

```python
import threading
import queue
from typing import Callable, Any


class Future:
    def __init__(self):
        self._result = None
        self._exception = None
        self._done = threading.Event()

    def set_result(self, result):
        self._result = result
        self._done.set()

    def set_exception(self, exc):
        self._exception = exc
        self._done.set()

    def result(self, timeout=None):
        self._done.wait(timeout)
        if self._exception:
            raise self._exception
        return self._result


class ThreadPool:
    def __init__(self, num_workers: int):
        self._task_queue = queue.Queue()
        self._workers = []
        self._shutdown = False

        for _ in range(num_workers):
            worker = threading.Thread(target=self._worker_loop, daemon=True)
            worker.start()
            self._workers.append(worker)

    def _worker_loop(self):
        while True:
            task = self._task_queue.get()
            if task is None:
                break
            func, args, future = task
            try:
                result = func(*args)
                future.set_result(result)
            except Exception as e:
                future.set_exception(e)

    def submit(self, func: Callable, *args) -> Future:
        future = Future()
        self._task_queue.put((func, args, future))
        return future

    def shutdown(self):
        for _ in self._workers:
            self._task_queue.put(None)
        for worker in self._workers:
            worker.join()
```

**Follow-ups:**

- How do you handle task timeouts?
- How do you implement a dynamic thread pool (auto-scaling)?
- What is the difference between your implementation and Java's ExecutorService?

---

### Q22: Implement a read-write lock with writer preference AND no starvation.

**Key Points:**

- Writers have priority over new readers
- But readers already inside the critical section are not preempted
- Use waiting_writers counter to block new readers
- Fair version: use a FIFO queue for ordering

**Follow-ups:**

- What is the performance implication of writer preference under read-heavy load?
- How would you implement this in Go? (sync.RWMutex already provides this)

---

### Q23: Design a rate limiter using concurrency primitives.

**Key Points:**

- Token bucket: bucket holds N tokens, refilled at rate R
- Sliding window: count requests in recent time window
- Semaphore-based: simple concurrent request limiter
- For distributed: Redis-based with Lua script

**Code Skeleton:**

```python
import threading
import time


class TokenBucketRateLimiter:
    def __init__(self, rate: float, capacity: int):
        self._rate = rate          # Tokens per second
        self._capacity = capacity
        self._tokens = float(capacity)
        self._last_refill = time.time()
        self._lock = threading.Lock()

    def allow(self) -> bool:
        with self._lock:
            now = time.time()
            elapsed = now - self._last_refill
            self._tokens = min(
                self._capacity,
                self._tokens + elapsed * self._rate,
            )
            self._last_refill = now

            if self._tokens >= 1.0:
                self._tokens -= 1.0
                return True
            return False
```

**Follow-ups:**

- How do you make this distributed? (Redis + Lua for atomic token operations)
- Token bucket vs leaky bucket vs sliding window?
- How do you rate limit per user in a multi-threaded server?

---

### Q24: Implement a concurrent web crawler.

**Key Points:**

- Maintain a set of visited URLs (thread-safe)
- Worker pool fetches URLs, extracts links, adds unvisited to queue
- Respect robots.txt and rate limits
- Graceful shutdown with max depth or max pages

**Code Skeleton:**

```python
import threading
import queue
from dataclasses import dataclass


@dataclass
class CrawlTask:
    url: str
    depth: int


class ConcurrentCrawler:
    def __init__(self, max_workers: int, max_depth: int):
        self._task_queue = queue.Queue()
        self._visited: set[str] = set()
        self._visited_lock = threading.Lock()
        self._max_workers = max_workers
        self._max_depth = max_depth
        self._results: list[dict] = []
        self._results_lock = threading.Lock()

    def crawl(self, start_url: str) -> list[dict]:
        self._task_queue.put(CrawlTask(start_url, 0))
        workers = []
        for _ in range(self._max_workers):
            w = threading.Thread(target=self._worker, daemon=True)
            w.start()
            workers.append(w)
        self._task_queue.join()
        return list(self._results)

    def _worker(self):
        while True:
            try:
                task = self._task_queue.get(timeout=2)
            except queue.Empty:
                return
            try:
                self._process(task)
            finally:
                self._task_queue.task_done()

    def _process(self, task: CrawlTask):
        with self._visited_lock:
            if task.url in self._visited:
                return
            self._visited = self._visited | {task.url}

        page = self._fetch(task.url)
        with self._results_lock:
            self._results = [*self._results, page]

        if task.depth < self._max_depth:
            for link in page.get("links", []):
                self._task_queue.put(CrawlTask(link, task.depth + 1))

    def _fetch(self, url: str) -> dict:
        import time
        time.sleep(0.05)
        return {"url": url, "links": [f"{url}/child1", f"{url}/child2"]}
```

**Follow-ups:**

- How would you implement this with asyncio instead of threads?
- How do you handle politeness (rate limiting per domain)?
- How would you distribute this across multiple machines?

---

### Q25: Design a task scheduler with dependency resolution.

**Key Points:**

- Tasks have dependencies (DAG: directed acyclic graph)
- A task can only run when ALL its dependencies have completed
- Maximize parallelism: run independent tasks concurrently
- Detect cycles (invalid dependency graph)

**Code Skeleton:**

```python
import threading
from collections import defaultdict, deque


class TaskScheduler:
    def __init__(self, num_workers: int):
        self._num_workers = num_workers
        self._tasks: dict[str, callable] = {}
        self._dependencies: dict[str, set[str]] = defaultdict(set)
        self._dependents: dict[str, set[str]] = defaultdict(set)

    def add_task(self, name: str, func: callable, depends_on: list[str] = None):
        self._tasks[name] = func
        for dep in (depends_on or []):
            self._dependencies[name].add(dep)
            self._dependents[dep].add(name)

    def run(self) -> dict[str, any]:
        # Topological sort to find initial ready tasks
        in_degree = {t: len(self._dependencies[t]) for t in self._tasks}
        ready = deque([t for t, d in in_degree.items() if d == 0])

        results = {}
        lock = threading.Lock()
        completed = threading.Event()
        remaining = len(self._tasks)

        sem = threading.Semaphore(self._num_workers)

        def execute(task_name):
            nonlocal remaining
            try:
                result = self._tasks[task_name]()
                with lock:
                    results[task_name] = result
                    # Unblock dependents
                    for dep in self._dependents[task_name]:
                        in_degree[dep] -= 1
                        if in_degree[dep] == 0:
                            ready.append(dep)
                    remaining -= 1
                    if remaining == 0:
                        completed.set()
            finally:
                sem.release()

        while not completed.is_set():
            while ready:
                task_name = ready.popleft()
                sem.acquire()
                threading.Thread(target=execute, args=(task_name,)).start()
            if not completed.is_set():
                completed.wait(timeout=0.1)

        return results
```

**Follow-ups:**

- How do you detect cycles in the dependency graph?
- How do you handle task failures (retry, skip dependents)?
- How would you implement this in a distributed system?

---

### Q26: Implement a distributed lock with fencing tokens.

**Key Points:**

- Basic distributed locks have a flaw: client A gets lock, pauses (GC), lock expires,
  client B gets lock, client A resumes and thinks it still has the lock
- Fencing token: monotonically increasing number issued with each lock acquisition
- Resource server rejects requests with stale (lower) fencing tokens

**Follow-ups:**

- Why is TTL alone not sufficient for distributed locks?
- How does ZooKeeper solve this? (Sequential ephemeral nodes provide ordering)

---

### Q27: Design a concurrent LRU cache with bounded concurrency.

**Key Points:**

- O(1) get and put (OrderedDict or HashMap + doubly-linked list)
- Thread-safe with lock
- For higher concurrency: shard the cache (N independent LRU caches)
- Each shard has its own lock

**Follow-ups:**

- How does sharding affect the global LRU ordering?
- How would you implement cache warming in a multi-threaded environment?
- What is the thundering herd problem and how do you prevent it? (Single-flight pattern)

---

### Q28: Explain and implement the producer-consumer pattern with multiple producers and consumers.

**Key Points:**

- Thread-safe bounded queue connects producers to consumers
- Multiple producers submit work, multiple consumers process it
- Graceful shutdown: poison pill / sentinel value / close signal
- Handle backpressure (bounded queue size)

**Follow-ups:**

- How do you ensure each item is processed exactly once?
- How do you handle consumer failures?
- How does this pattern scale to distributed systems? (Kafka, RabbitMQ)

---

### Q29: How would you debug a concurrency bug in production?

**Key Points:**

- Concurrency bugs are non-deterministic and hard to reproduce
- Tools: thread dumps, logging with thread IDs, race detectors (Go: `-race`, Python: TSan)
- Strategies: add logging at lock acquire/release, use timeout on all locks, thread-safe
  metrics
- Prevention: code review for lock ordering, use higher-level abstractions (queues, actors),
  minimize shared mutable state

**Follow-ups:**

- How do you reproduce a Heisenbug? (Stress testing, thread sanitizers, fuzzing)
- What is a Heisenbug? (Bug that changes behavior when you try to observe it)
- How do you add observability to concurrent systems?

---

### Q30: Design a thread-safe task queue with task priorities, retries, and dead-letter queue.

**Key Points:**

- Priority queue with thread-safe access
- Retry logic: exponential backoff, max retries
- Dead-letter queue: after max retries, move to DLQ for manual inspection
- Metrics: queue depth, processing latency, error rate

**Code Skeleton:**

```python
import threading
import heapq
import time
from dataclasses import dataclass, field
from typing import Callable


@dataclass(order=True)
class Task:
    priority: int
    created_at: float = field(compare=False)
    func: Callable = field(compare=False)
    args: tuple = field(compare=False, default=())
    max_retries: int = field(compare=False, default=3)
    attempt: int = field(compare=False, default=0)


class RobustTaskQueue:
    def __init__(self, num_workers: int):
        self._heap: list[Task] = []
        self._lock = threading.Lock()
        self._not_empty = threading.Condition(self._lock)
        self._dlq: list[Task] = []
        self._dlq_lock = threading.Lock()
        self._workers = []
        self._shutdown = False

        for _ in range(num_workers):
            w = threading.Thread(target=self._worker, daemon=True)
            w.start()
            self._workers.append(w)

    def submit(self, func: Callable, priority: int = 0, **kwargs):
        task = Task(
            priority=priority,
            created_at=time.time(),
            func=func,
            **kwargs,
        )
        with self._not_empty:
            heapq.heappush(self._heap, task)
            self._not_empty.notify()

    def _worker(self):
        while not self._shutdown:
            with self._not_empty:
                while not self._heap and not self._shutdown:
                    self._not_empty.wait(timeout=1)
                if self._shutdown:
                    return
                task = heapq.heappop(self._heap)

            try:
                task.func(*task.args)
            except Exception:
                task = Task(
                    priority=task.priority,
                    created_at=task.created_at,
                    func=task.func,
                    args=task.args,
                    max_retries=task.max_retries,
                    attempt=task.attempt + 1,
                )
                if task.attempt < task.max_retries:
                    time.sleep(0.1 * (2 ** task.attempt))
                    with self._not_empty:
                        heapq.heappush(self._heap, task)
                        self._not_empty.notify()
                else:
                    with self._dlq_lock:
                        self._dlq.append(task)

    def get_dlq(self) -> list[Task]:
        with self._dlq_lock:
            return list(self._dlq)
```

**Follow-ups:**

- How do you persist tasks across restarts?
- How do you ensure at-least-once vs at-most-once processing?
- How does this compare to Celery or RabbitMQ?

---

## Quick Reference

### Answer Framework for Any Concurrency Question

```
1. STATE THE PROBLEM
   "The core challenge here is [concurrent access / ordering / coordination]."

2. IDENTIFY THE INVARIANTS
   "The invariant we must maintain is [exactly one writer / ordered execution / etc]."

3. CHOOSE THE PRIMITIVE
   "I would use [Lock / Condition / Semaphore / Channel / etc] because..."

4. WRITE THE SOLUTION
   Show code. Use context managers. Explain each synchronization point.

5. VERIFY CORRECTNESS
   "This prevents [deadlock / race condition / starvation] because..."
   - No deadlock: [no circular wait / timeout / ordering]
   - No race: [lock protects all shared state]
   - No starvation: [fair lock / bounded waiting]

6. DISCUSS TRADE-OFFS
   "The trade-off is [throughput vs. correctness / complexity vs. safety]."
   "For higher concurrency, we could use [fine-grained locking / CAS / sharding]."
```

### Difficulty Mapping to Interview Level

```
+-----------+-------------------+-------------------------------------+
| Level     | Question Range    | What Interviewers Expect            |
+-----------+-------------------+-------------------------------------+
| Junior    | Easy (Q1-Q10)     | Know definitions, basic mutex usage |
| Mid       | Medium (Q11-Q20)  | Implement primitives, explain trade |
|           |                   | offs, know async/await              |
| Senior    | Hard (Q21-Q30)    | Design thread-safe systems, handle  |
|           |                   | distributed concurrency, debug      |
| Staff     | Hard + follow-ups | Lead architecture discussions,      |
|           |                   | distributed systems concurrency     |
+-----------+-------------------+-------------------------------------+
```

### Top 5 Most-Asked Questions (by frequency)

```
1. "What is a race condition and how do you prevent it?"      (Q1)
2. "Design a thread-safe [queue / cache / counter]."          (Q12, Q27)
3. "What causes deadlock and how do you prevent it?"          (Q6, Q13)
4. "Explain the difference between processes and threads."    (Q2)
5. "How do you handle concurrency in [your language]?"        (Q4, Q15, Q16)
```
