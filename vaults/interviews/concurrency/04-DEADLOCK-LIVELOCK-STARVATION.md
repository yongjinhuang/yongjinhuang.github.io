# Deadlock, Livelock & Starvation

These are the three failure modes of concurrent programs. Interviewers expect you to define
each precisely, demonstrate with code, and propose solutions. This file goes far beyond the
basics covered in the LLD concurrency file.

---

## Table of Contents

1. [Coffman Conditions for Deadlock](#1-coffman-conditions-for-deadlock)
2. [Deadlock Detection](#2-deadlock-detection)
3. [Deadlock Prevention Strategies](#3-deadlock-prevention-strategies)
4. [Deadlock Avoidance: Banker's Algorithm](#4-deadlock-avoidance-bankers-algorithm)
5. [Livelock](#5-livelock)
6. [Starvation and Fairness](#6-starvation-and-fairness)
7. [Priority Inversion](#7-priority-inversion)
8. [Real-World Deadlock Examples](#8-real-world-deadlock-examples)
9. [Common Interview Questions](#9-common-interview-questions)
10. [Gotchas](#10-gotchas)
11. [Quick Reference](#11-quick-reference)

---

## 1. Coffman Conditions for Deadlock

Deadlock occurs if and only if ALL four of the following conditions hold simultaneously.
Breaking ANY one condition prevents deadlock.

```
+-----------------------------------------------------------------------+
| COFFMAN CONDITIONS (all 4 required for deadlock)                      |
+-----------------------------------------------------------------------+
|                                                                       |
| 1. MUTUAL EXCLUSION                                                   |
|    At least one resource must be held in a non-sharable mode.         |
|    Only one thread can use the resource at a time.                    |
|                                                                       |
| 2. HOLD AND WAIT                                                      |
|    A thread holding at least one resource is waiting to acquire       |
|    additional resources held by other threads.                        |
|                                                                       |
| 3. NO PREEMPTION                                                      |
|    Resources cannot be forcibly taken from a thread. They can only    |
|    be released voluntarily by the thread holding them.                |
|                                                                       |
| 4. CIRCULAR WAIT                                                      |
|    A circular chain of threads exists where each thread holds a       |
|    resource that the next thread in the chain is waiting for.         |
|                                                                       |
|    T1 --> R1 (held by T2)                                             |
|    T2 --> R2 (held by T3)                                             |
|    T3 --> R3 (held by T1)     <-- circular!                          |
|                                                                       |
+-----------------------------------------------------------------------+
```

### Demonstrating Each Condition

```python
import threading
import time


def deadlock_demonstration():
    """All 4 Coffman conditions present = DEADLOCK."""

    lock_a = threading.Lock()
    lock_b = threading.Lock()

    def thread_1():
        lock_a.acquire()       # Condition 1: Mutual exclusion (lock is exclusive)
        time.sleep(0.1)        # Condition 2: Hold lock_a, wait for lock_b
        lock_b.acquire()       # Condition 3: Cannot preempt lock_b from thread_2
        lock_b.release()       # Condition 4: T1->lock_b->T2->lock_a->T1 (circular)
        lock_a.release()

    def thread_2():
        lock_b.acquire()
        time.sleep(0.1)
        lock_a.acquire()       # Deadlock: T2 holds lock_b, waits for lock_a
        lock_a.release()
        lock_b.release()

    t1 = threading.Thread(target=thread_1)
    t2 = threading.Thread(target=thread_2)
    t1.start()
    t2.start()
    # t1.join() and t2.join() will hang forever
```

---

## 2. Deadlock Detection

### Wait-For Graph

Build a directed graph where an edge from T_i to T_j means "thread i is waiting for a
resource held by thread j." Deadlock exists if and only if there is a cycle in this graph.

```
Wait-For Graph (no deadlock):
T1 --> T2 --> T3
              (no cycle)

Wait-For Graph (deadlock):
T1 --> T2 --> T3 --> T1
       ^             |
       +-------------+
       (cycle detected = DEADLOCK)
```

### Cycle Detection Implementation

```python
from collections import defaultdict


class DeadlockDetector:
    """Detect deadlock by finding cycles in the wait-for graph.

    This is the algorithm used by database systems to detect deadlocks
    among transactions.
    """

    def __init__(self):
        # thread_id -> set of thread_ids it is waiting for
        self._wait_for: dict[str, set[str]] = defaultdict(set)

    def add_wait(self, waiter: str, holder: str) -> None:
        """Record that 'waiter' is waiting for a resource held by 'holder'."""
        self._wait_for[waiter] = {*self._wait_for[waiter], holder}

    def remove_wait(self, waiter: str, holder: str) -> None:
        """Remove a wait edge (resource was acquired or waiter gave up)."""
        if waiter in self._wait_for:
            self._wait_for[waiter] = self._wait_for[waiter] - {holder}
            if not self._wait_for[waiter]:
                del self._wait_for[waiter]

    def detect_deadlock(self) -> list[str] | None:
        """Return a deadlock cycle if one exists, or None.

        Uses DFS with coloring:
          WHITE = unvisited
          GRAY  = in current DFS path (cycle detection)
          BLACK = fully explored
        """
        white, gray, black = 0, 1, 2
        color: dict[str, int] = {}
        parent: dict[str, str | None] = {}

        # Initialize all nodes
        all_nodes: set[str] = set()
        for waiter, holders in self._wait_for.items():
            all_nodes.add(waiter)
            all_nodes = all_nodes | holders
        for node in all_nodes:
            color[node] = white

        def dfs(node: str) -> list[str] | None:
            color[node] = gray

            for neighbor in self._wait_for.get(node, set()):
                if color.get(neighbor, white) == gray:
                    # Found cycle! Reconstruct it.
                    cycle = [neighbor, node]
                    current = node
                    while parent.get(current) != neighbor:
                        current = parent.get(current, "")
                        if current:
                            cycle.append(current)
                    return list(reversed(cycle))

                if color.get(neighbor, white) == white:
                    parent[neighbor] = node
                    result = dfs(neighbor)
                    if result is not None:
                        return result

            color[node] = black
            return None

        for node in all_nodes:
            if color[node] == white:
                result = dfs(node)
                if result is not None:
                    return result

        return None


def test_deadlock_detection():
    detector = DeadlockDetector()

    # No deadlock
    detector.add_wait("T1", "T2")
    detector.add_wait("T2", "T3")
    assert detector.detect_deadlock() is None

    # Add circular wait -> deadlock
    detector.add_wait("T3", "T1")
    cycle = detector.detect_deadlock()
    assert cycle is not None  # ["T1", "T2", "T3", "T1"] or similar
```

### Periodic Detection Strategy

```
Deadlock Detection Strategy:
+-------------------------------------------------------+
| 1. Run detector periodically (e.g., every 5 seconds)  |
| 2. When cycle found, choose a VICTIM thread            |
| 3. Abort the victim (rollback its transaction)         |
| 4. Release the victim's resources                      |
| 5. Other threads in the cycle can proceed              |
+-------------------------------------------------------+

Victim Selection Criteria:
  - Thread with least work done (minimize rollback cost)
  - Thread holding fewest resources
  - Thread with lowest priority
  - Thread that is youngest (timestamp-based)
```

---

## 3. Deadlock Prevention Strategies

Each strategy breaks one of the four Coffman conditions.

### Strategy 1: Break Mutual Exclusion

Use lock-free data structures or read-only shared data. Not always possible (some resources
are inherently exclusive, like a printer or file write lock).

### Strategy 2: Break Hold and Wait

Require threads to request ALL resources at once, atomically. If any resource is unavailable,
release all and retry.

```python
import threading
import time
import random


class AllOrNothingLock:
    """Break Hold-and-Wait: acquire all locks or none."""

    def __init__(self):
        self._meta_lock = threading.Lock()

    def acquire_all(
        self, locks: list[threading.Lock], timeout: float = 1.0
    ) -> bool:
        """Attempt to acquire all locks atomically. Release all on failure."""
        with self._meta_lock:
            acquired: list[threading.Lock] = []
            for lock in locks:
                if lock.acquire(blocking=False):
                    acquired.append(lock)
                else:
                    # Cannot get this lock. Release everything.
                    for acq in acquired:
                        acq.release()
                    return False
            return True

    def release_all(self, locks: list[threading.Lock]) -> None:
        for lock in locks:
            lock.release()


def transfer_all_or_nothing(
    locker: AllOrNothingLock,
    accounts: list,
    locks: list[threading.Lock],
    from_idx: int,
    to_idx: int,
    amount: float,
) -> bool:
    """Transfer money using all-or-nothing lock acquisition."""
    needed_locks = [locks[from_idx], locks[to_idx]]

    for attempt in range(5):
        if locker.acquire_all(needed_locks):
            try:
                if accounts[from_idx] >= amount:
                    accounts[from_idx] -= amount
                    accounts[to_idx] += amount
                    return True
                return False
            finally:
                locker.release_all(needed_locks)
        # Back off before retry
        time.sleep(random.uniform(0.001, 0.01))

    return False
```

### Strategy 3: Break No Preemption (Try-Lock with Timeout)

If a thread cannot acquire a lock within a timeout, it releases all held locks and retries.

```python
import threading
import time
import random


def transfer_with_timeout(
    account_a: dict,
    account_b: dict,
    lock_a: threading.Lock,
    lock_b: threading.Lock,
    amount: float,
    max_retries: int = 5,
) -> bool:
    """Break No-Preemption: give up locks if we cannot get all of them."""
    for attempt in range(max_retries):
        acquired_a = lock_a.acquire(timeout=0.1)
        if not acquired_a:
            continue  # Could not get lock_a, retry

        acquired_b = lock_b.acquire(timeout=0.1)
        if not acquired_b:
            lock_a.release()  # Preempt: release lock_a
            # Random backoff to break synchronization
            time.sleep(random.uniform(0.001, 0.01 * (attempt + 1)))
            continue  # Retry both

        try:
            # Got both locks
            if account_a["balance"] >= amount:
                account_a["balance"] -= amount
                account_b["balance"] += amount
                return True
            return False
        finally:
            lock_b.release()
            lock_a.release()

    return False  # Exhausted retries
```

### Strategy 4: Break Circular Wait (Lock Ordering)

Assign a total order to all locks. Always acquire locks in ascending order. This makes
circular wait impossible.

```python
import threading


class OrderedLockManager:
    """Break Circular Wait: enforce a global lock ordering.

    Each lock is assigned a unique ID. Threads must acquire locks in
    ascending ID order. This prevents circular wait.
    """

    _next_id = 0
    _id_lock = threading.Lock()

    @classmethod
    def _get_next_id(cls) -> int:
        with cls._id_lock:
            current = cls._next_id
            cls._next_id += 1
            return current

    def __init__(self):
        self.lock = threading.Lock()
        self.lock_id = OrderedLockManager._get_next_id()

    @staticmethod
    def acquire_ordered(*locks: "OrderedLockManager") -> list["OrderedLockManager"]:
        """Acquire multiple locks in order of their IDs."""
        ordered = sorted(locks, key=lambda l: l.lock_id)
        for lock in ordered:
            lock.lock.acquire()
        return ordered

    @staticmethod
    def release_all(locks: list["OrderedLockManager"]) -> None:
        """Release locks in reverse order (good practice, not strictly required)."""
        for lock in reversed(locks):
            lock.lock.release()


def safe_transfer_ordered():
    """Deadlock-free transfer using lock ordering."""
    lock_a = OrderedLockManager()
    lock_b = OrderedLockManager()

    account_a = {"balance": 1000}
    account_b = {"balance": 500}

    # No matter which thread calls this, locks are always acquired in the same order
    ordered = OrderedLockManager.acquire_ordered(lock_a, lock_b)
    try:
        if account_a["balance"] >= 100:
            account_a["balance"] -= 100
            account_b["balance"] += 100
    finally:
        OrderedLockManager.release_all(ordered)
```

---

## 4. Deadlock Avoidance: Banker's Algorithm

The Banker's Algorithm determines whether granting a resource request leaves the system in a
**safe state** (can complete all threads without deadlock). Used in OS resource management.

### Concept

```
Safe State: There exists at least one sequence of thread completions that allows
ALL threads to finish without deadlock.

Unsafe State: No such sequence exists. Deadlock MAY occur (not guaranteed).

Banker's Algorithm: Before granting a resource request, simulate the allocation.
If the resulting state is safe, grant. If unsafe, deny (make thread wait).
```

### Implementation

```python
class BankersAlgorithm:
    """Deadlock avoidance using the Banker's Algorithm.

    Determines if granting a resource request is safe.
    """

    def __init__(self, num_threads: int, num_resources: int):
        self._num_threads = num_threads
        self._num_resources = num_resources

        # Available[j] = number of available instances of resource j
        self._available = [0] * num_resources

        # Max[i][j] = max demand of thread i for resource j
        self._max_demand = [[0] * num_resources for _ in range(num_threads)]

        # Allocation[i][j] = currently allocated to thread i of resource j
        self._allocation = [[0] * num_resources for _ in range(num_threads)]

    def set_available(self, available: list[int]) -> None:
        self._available = list(available)

    def set_max_demand(self, thread_id: int, demand: list[int]) -> None:
        self._max_demand[thread_id] = list(demand)

    def set_allocation(self, thread_id: int, alloc: list[int]) -> None:
        self._allocation[thread_id] = list(alloc)

    def _need(self, thread_id: int) -> list[int]:
        """Need[i] = Max[i] - Allocation[i]."""
        return [
            self._max_demand[thread_id][j] - self._allocation[thread_id][j]
            for j in range(self._num_resources)
        ]

    def is_safe_state(self) -> tuple[bool, list[int]]:
        """Check if current state is safe. Returns (is_safe, safe_sequence)."""
        work = list(self._available)
        finish = [False] * self._num_threads
        safe_sequence: list[int] = []

        while True:
            found = False
            for i in range(self._num_threads):
                if finish[i]:
                    continue

                need_i = self._need(i)
                # Can thread i finish with available resources?
                if all(need_i[j] <= work[j] for j in range(self._num_resources)):
                    # Thread i can finish. Release its resources.
                    work = [
                        work[j] + self._allocation[i][j]
                        for j in range(self._num_resources)
                    ]
                    finish[i] = True
                    safe_sequence.append(i)
                    found = True

            if not found:
                break

        is_safe = all(finish)
        return is_safe, safe_sequence

    def request_resources(
        self, thread_id: int, request: list[int]
    ) -> bool:
        """Try to grant a resource request. Returns True if safe to grant."""
        need = self._need(thread_id)

        # Check if request exceeds max need
        if any(request[j] > need[j] for j in range(self._num_resources)):
            return False  # Error: exceeds declared max

        # Check if request exceeds available
        if any(request[j] > self._available[j] for j in range(self._num_resources)):
            return False  # Must wait

        # Simulate granting the request
        old_available = list(self._available)
        old_allocation = list(self._allocation[thread_id])

        self._available = [
            self._available[j] - request[j]
            for j in range(self._num_resources)
        ]
        self._allocation[thread_id] = [
            self._allocation[thread_id][j] + request[j]
            for j in range(self._num_resources)
        ]

        # Check if resulting state is safe
        is_safe, _ = self.is_safe_state()

        if not is_safe:
            # Rollback
            self._available = old_available
            self._allocation[thread_id] = old_allocation
            return False

        return True


def test_bankers():
    """Example: 5 threads, 3 resource types."""
    banker = BankersAlgorithm(num_threads=5, num_resources=3)

    banker.set_available([3, 3, 2])

    # Max demand for each thread
    banker.set_max_demand(0, [7, 5, 3])
    banker.set_max_demand(1, [3, 2, 2])
    banker.set_max_demand(2, [9, 0, 2])
    banker.set_max_demand(3, [2, 2, 2])
    banker.set_max_demand(4, [4, 3, 3])

    # Current allocation
    banker.set_allocation(0, [0, 1, 0])
    banker.set_allocation(1, [2, 0, 0])
    banker.set_allocation(2, [3, 0, 2])
    banker.set_allocation(3, [2, 1, 1])
    banker.set_allocation(4, [0, 0, 2])

    is_safe, sequence = banker.is_safe_state()
    assert is_safe  # Safe sequence exists: [1, 3, 4, 0, 2]

    # Thread 1 requests [1, 0, 2]
    granted = banker.request_resources(1, [1, 0, 2])
    assert granted  # Safe to grant
```

---

## 5. Livelock

A livelock occurs when threads are not blocked but are unable to make progress because they
keep responding to each other. Unlike deadlock, the threads are actively running.

### Classic Example: Hallway Collision

```
Livelock (two people in a hallway):

Person A: steps left --> sees B on left --> steps right
Person B: steps right --> sees A on right --> steps left
Person A: steps left --> sees B on left --> steps right
Person B: steps right --> sees A on right --> steps left
... forever (both are moving but neither passes)
```

### Code Example: Polite Lock Acquisition

```python
import threading
import time
import random


def livelock_demonstration():
    """BUG: Both threads keep yielding to each other, no progress."""
    lock_a = threading.Lock()
    lock_b = threading.Lock()
    count = {"transfers": 0}

    def polite_transfer_1():
        for _ in range(100):
            while True:
                lock_a.acquire()
                if lock_b.acquire(blocking=False):
                    # Got both locks
                    count["transfers"] += 1
                    lock_b.release()
                    lock_a.release()
                    break
                else:
                    # Be "polite": release lock_a so other thread can use it
                    lock_a.release()
                    # BUG: No randomness! Both threads retry in lockstep

    def polite_transfer_2():
        for _ in range(100):
            while True:
                lock_b.acquire()
                if lock_a.acquire(blocking=False):
                    count["transfers"] += 1
                    lock_a.release()
                    lock_b.release()
                    break
                else:
                    lock_b.release()
                    # BUG: Same timing, retries are synchronized

    t1 = threading.Thread(target=polite_transfer_1)
    t2 = threading.Thread(target=polite_transfer_2)
    t1.start()
    t2.start()
    # May run for a very long time or never complete
```

### Fix: Random Backoff

```python
import threading
import time
import random


def livelock_fix():
    """FIX: Random backoff breaks the synchronized retry pattern."""
    lock_a = threading.Lock()
    lock_b = threading.Lock()
    count = {"transfers": 0}

    def transfer_with_backoff(
        first_lock: threading.Lock,
        second_lock: threading.Lock,
        num_transfers: int,
    ) -> None:
        for _ in range(num_transfers):
            while True:
                first_lock.acquire()
                if second_lock.acquire(blocking=False):
                    count["transfers"] += 1
                    second_lock.release()
                    first_lock.release()
                    break
                else:
                    first_lock.release()
                    # FIX: Random backoff desynchronizes the threads
                    time.sleep(random.uniform(0.001, 0.01))

    t1 = threading.Thread(
        target=transfer_with_backoff, args=(lock_a, lock_b, 100)
    )
    t2 = threading.Thread(
        target=transfer_with_backoff, args=(lock_b, lock_a, 100)
    )
    t1.start()
    t2.start()
    t1.join()
    t2.join()
    assert count["transfers"] == 200
```

### Exponential Backoff

```python
import random
import time


def exponential_backoff(
    attempt: int, base_delay: float = 0.001, max_delay: float = 1.0
) -> None:
    """Exponential backoff with jitter. Used in networking, databases, etc."""
    delay = min(base_delay * (2 ** attempt), max_delay)
    jitter = random.uniform(0, delay)
    time.sleep(jitter)
```

---

## 6. Starvation and Fairness

Starvation occurs when a thread is perpetually denied access to a resource because other
threads always have priority.

### Reader-Writer Starvation

```
Writer Starvation (reader-preference lock):

Reader 1: [acquire_read]---[reading]---[release_read]
Reader 2:     [acquire_read]---[reading]---[release_read]
Reader 3:         [acquire_read]---[reading]---[release_read]
Reader 4:             [acquire_read]---[reading]---[release_read]
Writer:   [acquire_write: BLOCKED forever because readers keep arriving]

If readers keep arriving before all current readers finish,
the writer NEVER gets the lock. This is starvation.
```

### Fair Lock Implementation

```python
import threading
from collections import deque


class FairLock:
    """FIFO lock that prevents starvation. Threads are served in arrival order."""

    def __init__(self):
        self._lock = threading.Lock()
        self._queue: deque[threading.Event] = deque()
        self._locked = False

    def acquire(self) -> None:
        event = threading.Event()

        with self._lock:
            if not self._locked and len(self._queue) == 0:
                self._locked = True
                return
            self._queue.append(event)

        # Wait for our turn (FIFO order)
        event.wait()

    def release(self) -> None:
        with self._lock:
            if self._queue:
                next_event = self._queue.popleft()
                next_event.set()  # Wake the next thread in line
            else:
                self._locked = False

    def __enter__(self):
        self.acquire()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.release()
```

### Fair ReadWriteLock

```python
import threading


class FairReadWriteLock:
    """RWLock that prevents both reader and writer starvation.

    Uses a turnstile: when a writer is waiting, new readers are blocked
    behind it. This ensures bounded waiting for writers.
    """

    def __init__(self):
        self._lock = threading.Lock()
        self._readers_ok = threading.Condition(self._lock)
        self._writers_ok = threading.Condition(self._lock)
        self._active_readers = 0
        self._active_writers = 0
        self._waiting_writers = 0
        self._waiting_readers = 0
        self._writer_sequence = 0  # Fairness counter

    def acquire_read(self) -> None:
        with self._lock:
            self._waiting_readers += 1
            while self._active_writers > 0 or self._waiting_writers > 0:
                self._readers_ok.wait()
            self._waiting_readers -= 1
            self._active_readers += 1

    def release_read(self) -> None:
        with self._lock:
            self._active_readers -= 1
            if self._active_readers == 0:
                self._writers_ok.notify()

    def acquire_write(self) -> None:
        with self._lock:
            self._waiting_writers += 1
            while self._active_readers > 0 or self._active_writers > 0:
                self._writers_ok.wait()
            self._waiting_writers -= 1
            self._active_writers += 1

    def release_write(self) -> None:
        with self._lock:
            self._active_writers -= 1
            if self._waiting_writers > 0:
                self._writers_ok.notify()
            else:
                self._readers_ok.notify_all()
```

---

## 7. Priority Inversion

Priority inversion occurs when a high-priority thread is blocked by a low-priority thread,
but a medium-priority thread runs instead, effectively inverting the priority ordering.

### The Problem

```
Priority Inversion:

High Priority (H):   [needs Lock L]---[BLOCKED waiting for L]..........
Medium Priority (M): .............[RUNNING (does not need L)]..........
Low Priority (L):    [holds Lock L]---[PREEMPTED by M]---[WAITING]....

Timeline:
1. L acquires Lock L
2. H arrives, needs Lock L, blocks (waiting for L to release)
3. M arrives, preempts L (M > L priority)
4. M runs to completion
5. L finally runs again, releases Lock L
6. H can proceed

H is effectively running at L's priority -- INVERTED.
This caused the Mars Pathfinder reboot bug in 1997.
```

### Solution 1: Priority Inheritance

Temporarily boost the low-priority thread's priority to match the highest-priority thread
waiting for its resource.

```python
import threading
import time
from dataclasses import dataclass, field


@dataclass
class PriorityThread:
    name: str
    base_priority: int
    effective_priority: int = 0
    held_locks: list = field(default_factory=list)

    def __post_init__(self):
        self.effective_priority = self.base_priority


class PriorityInheritanceLock:
    """Lock that implements priority inheritance protocol.

    When a high-priority thread blocks on this lock, the holder's
    effective priority is boosted.
    """

    def __init__(self):
        self._lock = threading.Lock()
        self._holder: PriorityThread | None = None
        self._waiters: list[PriorityThread] = []
        self._internal = threading.Lock()

    def acquire(self, thread: PriorityThread) -> None:
        with self._internal:
            if self._holder is None:
                self._holder = thread
                thread.held_locks.append(self)
                return

            # Priority inheritance: boost holder's priority
            if thread.effective_priority > self._holder.effective_priority:
                self._holder.effective_priority = thread.effective_priority

            self._waiters.append(thread)

        # Wait for lock (simplified -- real implementation uses OS primitives)
        while True:
            with self._internal:
                if self._holder is None:
                    self._holder = thread
                    self._waiters = [w for w in self._waiters if w != thread]
                    thread.held_locks.append(self)
                    return
            time.sleep(0.001)

    def release(self, thread: PriorityThread) -> None:
        with self._internal:
            assert self._holder == thread
            self._holder = None
            thread.held_locks = [l for l in thread.held_locks if l != self]

            # Restore priority: max of base priority and priority inherited
            # from any other locks still held
            thread.effective_priority = thread.base_priority
            for held_lock in thread.held_locks:
                for waiter in held_lock._waiters:
                    if waiter.effective_priority > thread.effective_priority:
                        thread.effective_priority = waiter.effective_priority
```

### Solution 2: Priority Ceiling

Each lock is assigned a "ceiling priority" equal to the highest priority of any thread that
might use it. When a thread acquires the lock, its priority is immediately boosted to the
ceiling. This prevents priority inversion entirely.

```
Priority Ceiling Protocol:
Lock L has ceiling = max priority of all threads that use L

Thread L (low, priority=1) acquires Lock L:
  L's effective priority = ceiling(L) = 10 (highest possible)
  M (priority=5) cannot preempt L (because L runs at priority 10)
  H (priority=10) does not need to wait long

Benefit: Prevents unbounded priority inversion
Drawback: Thread runs at high priority even when no high-priority thread is waiting
```

---

## 8. Real-World Deadlock Examples

### Database Deadlock

```
Transaction T1:                    Transaction T2:
UPDATE accounts SET balance=900    UPDATE accounts SET balance=400
  WHERE id=1;                        WHERE id=2;
  -- Holds row lock on id=1          -- Holds row lock on id=2

UPDATE accounts SET balance=600    UPDATE accounts SET balance=700
  WHERE id=2;                        WHERE id=1;
  -- Waits for row lock on id=2!     -- Waits for row lock on id=1!

DEADLOCK! Database detects cycle, aborts one transaction.
```

### Distributed System Deadlock

```
Service A                          Service B
  calls B.transfer() -->             calls A.getBalance() -->
  holds connection to B              holds connection to A
  waiting for B to respond           waiting for A to respond
  DEADLOCK (circular RPC dependency)

Solution: Timeout on RPC calls + retry with backoff
```

### Python `import` Lock Deadlock

```python
# module_a.py
import module_b  # Acquires import lock, triggers module_b import

# module_b.py
import module_a  # Tries to acquire import lock -- DEADLOCK!

# Solution: restructure to avoid circular imports
# or use lazy imports (import inside function)
```

---

## 9. Common Interview Questions

1. **What are the four Coffman conditions?**
   Mutual exclusion, hold and wait, no preemption, circular wait. All four must hold for
   deadlock. Breaking any one prevents deadlock.

2. **How do you detect a deadlock?**
   Build a wait-for graph (thread -> resource -> thread edges). Run cycle detection (DFS).
   If a cycle exists, deadlock exists. Databases do this automatically.

3. **What is the difference between deadlock prevention and deadlock avoidance?**
   Prevention ensures deadlock is structurally impossible (break a Coffman condition).
   Avoidance dynamically checks each resource request (Banker's Algorithm) and denies
   unsafe requests. Prevention is simpler; avoidance allows more concurrency.

4. **How is livelock different from deadlock?**
   In deadlock, threads are blocked and do nothing. In livelock, threads are running but
   making no progress (continually reacting to each other). Fix livelock with random backoff.

5. **What is priority inversion and how do you fix it?**
   A high-priority thread is blocked by a low-priority thread while a medium-priority thread
   runs. Fix with priority inheritance (boost holder's priority) or priority ceiling protocol.

6. **How does a database handle deadlocks?**
   Periodic deadlock detection via wait-for graph. When cycle found, one transaction is
   chosen as victim and rolled back. The victim is usually the youngest or cheapest to abort.

7. **Explain the Banker's Algorithm.**
   Before granting a resource request, simulate the allocation and check if the resulting
   state is safe (all threads can complete). If safe, grant. If unsafe, deny and wait.

---

## 10. Gotchas

- **Deadlock is not the same as indefinite blocking.** A thread waiting on a lock held by
  a running thread is NOT deadlocked. Deadlock requires a CYCLE.

- **Lock ordering must be GLOBAL.** If module A orders locks (1, 2) but module B orders them
  (2, 1), you still get deadlock. The ordering must be consistent across the entire codebase.

- **Timeout does not prevent deadlock, it recovers from it.** The deadlock still occurs
  momentarily. Timeout is a detection/recovery strategy, not prevention.

- **Banker's Algorithm is impractical for most applications.** It requires knowing maximum
  resource demand in advance, which is rarely possible in general-purpose software. It is
  used in embedded systems and OS resource management.

- **Livelock is harder to detect than deadlock.** CPU usage is high (threads are running),
  no error is thrown, and progress metrics may look normal. Monitor for lack of forward
  progress, not just thread state.

- **Priority inversion can happen in user-space schedulers too.** If your async event loop
  or goroutine scheduler does not account for task priority, you can get the same problem.

---

## 11. Quick Reference

```
+--------------------+---------------------------+-------------------------------+
| Failure Mode       | Symptom                   | Fix                           |
+--------------------+---------------------------+-------------------------------+
| Deadlock           | Threads blocked, no CPU   | Lock ordering, timeout,       |
|                    | usage, no progress        | all-or-nothing, detection     |
+--------------------+---------------------------+-------------------------------+
| Livelock           | Threads running, high CPU | Random backoff, exponential   |
|                    | but no progress           | backoff with jitter           |
+--------------------+---------------------------+-------------------------------+
| Starvation         | Some threads run, others  | Fair locks (FIFO), fair       |
|                    | never get scheduled       | RWLock, bounded waiting       |
+--------------------+---------------------------+-------------------------------+
| Priority Inversion | High-priority thread      | Priority inheritance,         |
|                    | blocked by low-priority   | priority ceiling protocol     |
+--------------------+---------------------------+-------------------------------+

Coffman Conditions & How to Break Them:
+--------------------+-------------------------------+
| Condition          | Prevention Strategy           |
+--------------------+-------------------------------+
| Mutual Exclusion   | Lock-free algorithms, CAS     |
| Hold and Wait      | All-or-nothing acquisition    |
| No Preemption      | Try-lock with timeout         |
| Circular Wait      | Global lock ordering          |
+--------------------+-------------------------------+

Detection vs Prevention vs Avoidance:
+--------------------+-------------------------------------------+
| Approach           | Description                               |
+--------------------+-------------------------------------------+
| Prevention         | Structurally impossible (design-time)     |
| Avoidance          | Dynamically deny unsafe requests (runtime)|
| Detection+Recovery | Allow deadlock, detect and abort victim   |
+--------------------+-------------------------------------------+
```
