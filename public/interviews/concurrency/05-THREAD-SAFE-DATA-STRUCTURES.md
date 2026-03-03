# Thread-Safe Data Structures

Building thread-safe data structures is one of the most common interview topics. This file
covers seven essential data structures with multiple implementation strategies, from
coarse-grained locking to lock-free designs.

---

## Table of Contents

1. [Thread-Safe Blocking Queue](#1-thread-safe-blocking-queue)
2. [Thread-Safe Hash Map](#2-thread-safe-hash-map)
3. [Thread-Safe Counter (Atomic Operations)](#3-thread-safe-counter)
4. [Thread-Safe Singleton](#4-thread-safe-singleton)
5. [Copy-on-Write Collections](#5-copy-on-write-collections)
6. [Lock-Free Stack (CAS-Based)](#6-lock-free-stack)
7. [Concurrent LRU Cache](#7-concurrent-lru-cache)
8. [Coarse-Grained vs Fine-Grained Locking](#8-coarse-grained-vs-fine-grained-locking)
9. [Common Interview Questions](#9-common-interview-questions)
10. [Gotchas](#10-gotchas)
11. [Quick Reference](#11-quick-reference)

---

## 1. Thread-Safe Blocking Queue

A blocking queue is the backbone of producer-consumer systems. `put()` blocks when full,
`get()` blocks when empty.

### Implementation with Condition Variables

```python
import threading
from typing import TypeVar, Generic

T = TypeVar("T")


class BlockingQueue(Generic[T]):
    """Thread-safe bounded blocking queue.

    Time complexity: O(1) for put and get (amortized)
    Space complexity: O(capacity)
    """

    def __init__(self, capacity: int):
        self._capacity = capacity
        self._queue: list[T] = []
        self._lock = threading.Lock()
        self._not_full = threading.Condition(self._lock)
        self._not_empty = threading.Condition(self._lock)
        self._closed = False

    def put(self, item: T, timeout: float | None = None) -> bool:
        """Add item to queue. Blocks if full. Returns False if closed."""
        with self._not_full:
            if self._closed:
                return False

            while len(self._queue) >= self._capacity:
                if self._closed:
                    return False
                if not self._not_full.wait(timeout=timeout):
                    return False  # Timeout

            self._queue = [*self._queue, item]
            self._not_empty.notify()
            return True

    def get(self, timeout: float | None = None) -> T | None:
        """Remove and return item. Blocks if empty. Returns None if closed."""
        with self._not_empty:
            while len(self._queue) == 0:
                if self._closed:
                    return None
                if not self._not_empty.wait(timeout=timeout):
                    return None  # Timeout

            item = self._queue[0]
            self._queue = self._queue[1:]
            self._not_full.notify()
            return item

    def close(self) -> None:
        """Signal that no more items will be added. Wake all waiters."""
        with self._lock:
            self._closed = True
            self._not_full.notify_all()
            self._not_empty.notify_all()

    def size(self) -> int:
        with self._lock:
            return len(self._queue)

    def is_empty(self) -> bool:
        with self._lock:
            return len(self._queue) == 0
```

### Priority Blocking Queue

```python
import threading
import heapq
from typing import TypeVar, Generic
from dataclasses import dataclass, field

T = TypeVar("T")


@dataclass(order=True)
class PriorityItem:
    priority: int
    sequence: int  # Tie-breaker for FIFO order within same priority
    item: object = field(compare=False)


class PriorityBlockingQueue:
    """Thread-safe priority queue. Lowest priority number = highest priority."""

    def __init__(self, capacity: int):
        self._capacity = capacity
        self._heap: list[PriorityItem] = []
        self._sequence = 0
        self._lock = threading.Lock()
        self._not_full = threading.Condition(self._lock)
        self._not_empty = threading.Condition(self._lock)

    def put(self, item: object, priority: int) -> None:
        with self._not_full:
            while len(self._heap) >= self._capacity:
                self._not_full.wait()

            entry = PriorityItem(
                priority=priority,
                sequence=self._sequence,
                item=item,
            )
            self._sequence += 1
            heapq.heappush(self._heap, entry)
            self._not_empty.notify()

    def get(self) -> object:
        with self._not_empty:
            while len(self._heap) == 0:
                self._not_empty.wait()

            entry = heapq.heappop(self._heap)
            self._not_full.notify()
            return entry.item
```

---

## 2. Thread-Safe Hash Map

### Approach 1: Coarse-Grained (Single Lock)

```python
import threading
from typing import TypeVar

K = TypeVar("K")
V = TypeVar("V")


class CoarseGrainedHashMap:
    """Single lock for entire map. Simple but limited concurrency.

    Reads and writes serialize behind one lock.
    """

    def __init__(self):
        self._data: dict = {}
        self._lock = threading.Lock()

    def get(self, key):
        with self._lock:
            return self._data.get(key)

    def put(self, key, value) -> None:
        with self._lock:
            self._data = {**self._data, key: value}

    def remove(self, key) -> None:
        with self._lock:
            self._data = {k: v for k, v in self._data.items() if k != key}

    def size(self) -> int:
        with self._lock:
            return len(self._data)
```

### Approach 2: Striped Locking (Fine-Grained)

```python
import threading


class StripedHashMap:
    """Fine-grained locking: divide the map into stripes, each with its own lock.

    Threads accessing different stripes can proceed in parallel.
    Number of stripes determines max concurrency level.
    """

    def __init__(self, num_stripes: int = 16, initial_capacity: int = 64):
        self._num_stripes = num_stripes
        self._locks = [threading.Lock() for _ in range(num_stripes)]
        self._buckets: list[list[tuple]] = [[] for _ in range(initial_capacity)]
        self._size = 0
        self._size_lock = threading.Lock()

    def _stripe_index(self, key) -> int:
        """Map a key to a stripe (lock index)."""
        return hash(key) % self._num_stripes

    def _bucket_index(self, key) -> int:
        """Map a key to a bucket."""
        return hash(key) % len(self._buckets)

    def get(self, key):
        """O(1) average lookup with stripe-level locking."""
        stripe = self._stripe_index(key)
        with self._locks[stripe]:
            bucket_idx = self._bucket_index(key)
            for k, v in self._buckets[bucket_idx]:
                if k == key:
                    return v
            return None

    def put(self, key, value) -> None:
        """O(1) average insert with stripe-level locking."""
        stripe = self._stripe_index(key)
        with self._locks[stripe]:
            bucket_idx = self._bucket_index(key)
            bucket = self._buckets[bucket_idx]

            # Update existing key
            for i, (k, v) in enumerate(bucket):
                if k == key:
                    # Create new bucket list (immutability)
                    new_bucket = [*bucket[:i], (key, value), *bucket[i+1:]]
                    self._buckets[bucket_idx] = new_bucket
                    return

            # Insert new key
            self._buckets[bucket_idx] = [*bucket, (key, value)]
            with self._size_lock:
                self._size += 1

    def remove(self, key) -> bool:
        """O(1) average removal with stripe-level locking."""
        stripe = self._stripe_index(key)
        with self._locks[stripe]:
            bucket_idx = self._bucket_index(key)
            bucket = self._buckets[bucket_idx]

            new_bucket = [(k, v) for k, v in bucket if k != key]
            if len(new_bucket) < len(bucket):
                self._buckets[bucket_idx] = new_bucket
                with self._size_lock:
                    self._size -= 1
                return True
            return False

    def size(self) -> int:
        with self._size_lock:
            return self._size
```

### Approach 3: ReadWriteLock HashMap

```python
import threading


class RWLockHashMap:
    """HashMap with ReadWriteLock: concurrent reads, exclusive writes.

    Best for read-heavy workloads.
    """

    def __init__(self):
        self._data: dict = {}
        self._lock = threading.Lock()
        self._rw_lock = threading.Lock()
        self._readers = 0

    def _acquire_read(self) -> None:
        with self._lock:
            self._readers += 1
            if self._readers == 1:
                self._rw_lock.acquire()

    def _release_read(self) -> None:
        with self._lock:
            self._readers -= 1
            if self._readers == 0:
                self._rw_lock.release()

    def get(self, key):
        """Multiple threads can read concurrently."""
        self._acquire_read()
        try:
            return self._data.get(key)
        finally:
            self._release_read()

    def put(self, key, value) -> None:
        """Write requires exclusive access."""
        self._rw_lock.acquire()
        try:
            self._data = {**self._data, key: value}
        finally:
            self._rw_lock.release()
```

---

## 3. Thread-Safe Counter

### Simple Lock-Based Counter

```python
import threading


class ThreadSafeCounter:
    """Basic thread-safe counter using a lock."""

    def __init__(self, initial: int = 0):
        self._value = initial
        self._lock = threading.Lock()

    def increment(self, amount: int = 1) -> int:
        with self._lock:
            self._value += amount
            return self._value

    def decrement(self, amount: int = 1) -> int:
        with self._lock:
            self._value -= amount
            return self._value

    def get(self) -> int:
        with self._lock:
            return self._value
```

### CAS-Based Counter (Lock-Free Concept)

```python
import threading


class CASCounter:
    """Compare-and-swap counter. Demonstrates lock-free increment pattern.

    In languages with true atomics (Go, Java, C++), this needs no lock at all.
    The CAS is implemented via a hardware instruction.
    """

    def __init__(self, initial: int = 0):
        self._value = initial
        self._cas_lock = threading.Lock()  # Simulates hardware CAS

    def _compare_and_swap(self, expected: int, new_value: int) -> bool:
        with self._cas_lock:
            if self._value == expected:
                self._value = new_value
                return True
            return False

    def increment(self) -> int:
        while True:
            current = self._value
            new_val = current + 1
            if self._compare_and_swap(current, new_val):
                return new_val

    def get(self) -> int:
        return self._value
```

### Striped Counter (High Contention)

```python
import threading


class StripedCounter:
    """Reduces contention by spreading updates across multiple cells.

    Each thread increments a different cell based on its thread ID.
    get() sums all cells. Optimized for high-write, low-read workloads.

    Inspired by Java's LongAdder.
    """

    def __init__(self, num_stripes: int = 16):
        self._cells = [0] * num_stripes
        self._locks = [threading.Lock() for _ in range(num_stripes)]
        self._num_stripes = num_stripes

    def increment(self, amount: int = 1) -> None:
        stripe = hash(threading.current_thread().ident) % self._num_stripes
        with self._locks[stripe]:
            self._cells[stripe] += amount

    def get(self) -> int:
        """Sums all cells. Not perfectly accurate under concurrent writes."""
        total = 0
        for i in range(self._num_stripes):
            with self._locks[i]:
                total += self._cells[i]
        return total
```

---

## 4. Thread-Safe Singleton

### Naive Singleton (NOT Thread-Safe)

```python
# BUG: Two threads can both see _instance as None and create two instances.
class SingletonBroken:
    _instance = None

    @classmethod
    def get_instance(cls):
        if cls._instance is None:       # Thread A checks: None
            # Thread B also checks: None (before A creates it)
            cls._instance = cls()        # Both create instances!
        return cls._instance
```

### Double-Checked Locking

```python
import threading


class SingletonDCL:
    """Double-checked locking: check once without lock, then with lock.

    The first check avoids lock acquisition in the common case (already
    initialized). The second check inside the lock prevents double creation.
    """
    _instance = None
    _lock = threading.Lock()

    @classmethod
    def get_instance(cls):
        if cls._instance is None:           # First check (no lock)
            with cls._lock:
                if cls._instance is None:   # Second check (with lock)
                    cls._instance = cls()
        return cls._instance
```

### Problems with Double-Checked Locking

```
In languages without memory ordering guarantees (C++, Java before volatile),
the compiler/CPU can reorder instructions:

  1. Allocate memory for object
  2. Assign pointer to _instance   <-- Other thread sees non-None!
  3. Call __init__                  <-- Object not yet initialized!

A thread could see a partially constructed _instance.

In Python, the GIL makes this less of a concern, but it is critical
to understand for Java/C++ interviews.
```

### Better Alternative: Module-Level Initialization

```python
class Singleton:
    """Python's import system is thread-safe. Module-level singletons are safe.

    This is the Pythonic way to create singletons.
    """
    def __init__(self):
        self.data = {}


# Module-level instance. Created once when module is first imported.
# Python's import lock prevents double creation.
_singleton = Singleton()


def get_singleton() -> Singleton:
    return _singleton
```

### Thread-Safe Singleton with __new__

```python
import threading


class ThreadSafeSingleton:
    """Singleton using __new__ with lock."""
    _instance = None
    _lock = threading.Lock()

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    instance = super().__new__(cls)
                    cls._instance = instance
        return cls._instance

    def __init__(self):
        # __init__ may be called multiple times, so guard initialization
        if not hasattr(self, "_initialized"):
            self._initialized = True
            self.data: dict = {}
```

### threading.local() for Thread-Local Singletons

```python
import threading


class ThreadLocalSingleton:
    """Each thread gets its own instance. Useful for database connections."""
    _local = threading.local()

    @classmethod
    def get_instance(cls):
        if not hasattr(cls._local, "instance"):
            cls._local.instance = cls()
        return cls._local.instance

    def __init__(self):
        self.thread_name = threading.current_thread().name
```

---

## 5. Copy-on-Write Collections

Copy-on-write (COW) creates a new copy of the underlying data on every mutation. Readers
never block and always see a consistent snapshot.

```
Copy-on-Write:

Read:  Return reference to current data (no lock needed)
Write: 1. Acquire lock
       2. Copy entire data structure
       3. Modify the copy
       4. Atomically swap the reference
       5. Release lock

Trade-off: Reads are O(1) and lock-free
           Writes are O(n) due to copying
```

### Copy-on-Write List

```python
import threading
from typing import TypeVar, Generic, Iterator

T = TypeVar("T")


class CopyOnWriteList(Generic[T]):
    """Thread-safe list optimized for read-heavy workloads.

    Reads are lock-free. Writes copy the entire list.
    Time: Read O(1), Write O(n)
    Space: O(n) extra during write
    """

    def __init__(self, initial: list[T] | None = None):
        self._data: tuple[T, ...] = tuple(initial) if initial else ()
        self._write_lock = threading.Lock()

    def get(self, index: int) -> T:
        """Lock-free read. Always sees a consistent snapshot."""
        return self._data[index]

    def __iter__(self) -> Iterator[T]:
        """Lock-free iteration. Snapshot semantics: iterates over a
        consistent view even if writes happen during iteration."""
        snapshot = self._data  # Atomic reference read
        return iter(snapshot)

    def __len__(self) -> int:
        return len(self._data)

    def append(self, item: T) -> None:
        """Write: copy + append + swap."""
        with self._write_lock:
            self._data = (*self._data, item)

    def remove(self, item: T) -> None:
        """Write: copy without item + swap."""
        with self._write_lock:
            self._data = tuple(x for x in self._data if x != item)

    def replace(self, index: int, item: T) -> None:
        """Write: copy with replacement + swap."""
        with self._write_lock:
            data_list = list(self._data)
            data_list[index] = item
            self._data = tuple(data_list)

    def to_list(self) -> list[T]:
        """Lock-free snapshot as a list."""
        return list(self._data)
```

### When to Use Copy-on-Write

```
+------------------------+----------------------------+
| Use COW When           | Avoid COW When             |
+------------------------+----------------------------+
| Reads vastly outnumber | Writes are frequent        |
| writes (>100:1)        |                            |
+------------------------+----------------------------+
| Collection is small    | Collection is large (MB+)  |
| (hundreds of items)    | (copy cost is prohibitive) |
+------------------------+----------------------------+
| Iteration must be safe | Memory is constrained      |
| during concurrent mods | (COW doubles memory usage) |
+------------------------+----------------------------+
| Examples: config, ACL, | Examples: message queues,  |
| feature flags, routes  | counters, leaderboards     |
+------------------------+----------------------------+
```

---

## 6. Lock-Free Stack

A lock-free stack uses CAS (compare-and-swap) to push and pop without locks. This is a
foundational lock-free data structure concept.

### Conceptual Design

```
Lock-Free Stack (Treiber Stack):

Push(new_node):
  loop:
    old_top = top
    new_node.next = old_top
    if CAS(&top, old_top, new_node):
      return  # Success
    # CAS failed (another thread changed top). Retry.

Pop():
  loop:
    old_top = top
    if old_top is None:
      return None  # Empty
    new_top = old_top.next
    if CAS(&top, old_top, new_top):
      return old_top.value  # Success
    # CAS failed. Retry.
```

### Python Implementation (Simulated CAS)

```python
import threading
from dataclasses import dataclass
from typing import TypeVar, Generic

T = TypeVar("T")


@dataclass
class StackNode(Generic[T]):
    value: T
    next_node: "StackNode[T] | None" = None


class LockFreeStack(Generic[T]):
    """Lock-free stack using CAS (Treiber Stack).

    In real systems, CAS is a hardware atomic instruction.
    Python's GIL makes true lock-free unnecessary, but this
    demonstrates the concept for interviews.
    """

    def __init__(self):
        self._top: StackNode[T] | None = None
        self._cas_lock = threading.Lock()  # Simulates atomic CAS

    def _cas_top(
        self, expected: StackNode[T] | None, new_val: StackNode[T] | None
    ) -> bool:
        """Simulated atomic compare-and-swap on top pointer."""
        with self._cas_lock:
            if self._top is expected:
                self._top = new_val
                return True
            return False

    def push(self, value: T) -> None:
        """Lock-free push. O(1) amortized."""
        new_node = StackNode(value=value)
        while True:
            old_top = self._top
            new_node.next_node = old_top
            if self._cas_top(old_top, new_node):
                return

    def pop(self) -> T | None:
        """Lock-free pop. O(1) amortized."""
        while True:
            old_top = self._top
            if old_top is None:
                return None
            new_top = old_top.next_node
            if self._cas_top(old_top, new_top):
                return old_top.value

    def peek(self) -> T | None:
        top = self._top
        return top.value if top is not None else None

    def is_empty(self) -> bool:
        return self._top is None
```

### Lock-Free vs Lock-Based Trade-offs

```
+---------------------+----------------------------+----------------------------+
| Property            | Lock-Free (CAS)            | Lock-Based                 |
+---------------------+----------------------------+----------------------------+
| Progress guarantee  | At least one thread makes  | No guarantee (deadlock     |
|                     | progress (lock-free)       | possible)                  |
+---------------------+----------------------------+----------------------------+
| Throughput          | Higher under contention    | Higher under low contention|
+---------------------+----------------------------+----------------------------+
| Complexity          | Much harder to implement   | Straightforward            |
+---------------------+----------------------------+----------------------------+
| ABA problem         | Must handle (see 02 file)  | N/A                        |
+---------------------+----------------------------+----------------------------+
| Memory reclamation  | Complex (hazard pointers)  | Trivial (GC or free)       |
+---------------------+----------------------------+----------------------------+
| Debugging           | Very hard                  | Hard                       |
+---------------------+----------------------------+----------------------------+
```

---

## 7. Concurrent LRU Cache

An LRU (Least Recently Used) cache that supports concurrent access. This is a very
common interview question: "Design a thread-safe LRU cache."

### Implementation: Lock + OrderedDict

```python
import threading
from collections import OrderedDict
from typing import TypeVar

K = TypeVar("K")
V = TypeVar("V")


class ConcurrentLRUCache:
    """Thread-safe LRU cache.

    Time complexity: O(1) for get and put
    Space complexity: O(capacity)

    Uses OrderedDict for O(1) move-to-end and popitem.
    Single lock for simplicity. Fine for moderate contention.
    """

    def __init__(self, capacity: int):
        self._capacity = capacity
        self._cache: OrderedDict = OrderedDict()
        self._lock = threading.Lock()
        self._hits = 0
        self._misses = 0

    def get(self, key) -> object | None:
        """Get value and mark as recently used. O(1)."""
        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)  # Mark as most recently used
                self._hits += 1
                return self._cache[key]
            self._misses += 1
            return None

    def put(self, key, value) -> None:
        """Add or update entry. Evicts LRU if at capacity. O(1)."""
        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)
                self._cache[key] = value
            else:
                if len(self._cache) >= self._capacity:
                    self._cache.popitem(last=False)  # Evict LRU (first item)
                self._cache[key] = value

    def remove(self, key) -> bool:
        """Remove entry. O(1)."""
        with self._lock:
            if key in self._cache:
                del self._cache[key]
                return True
            return False

    def size(self) -> int:
        with self._lock:
            return len(self._cache)

    def hit_rate(self) -> float:
        with self._lock:
            total = self._hits + self._misses
            return self._hits / total if total > 0 else 0.0
```

### Implementation: Sharded LRU Cache (Higher Concurrency)

```python
import threading
from collections import OrderedDict


class ShardedLRUCache:
    """LRU cache sharded across multiple locks for higher concurrency.

    Each shard is an independent LRU cache with its own lock.
    Keys are distributed across shards by hash.

    N shards = N threads can operate in parallel on different keys.
    """

    def __init__(self, capacity: int, num_shards: int = 16):
        self._num_shards = num_shards
        shard_capacity = max(1, capacity // num_shards)
        self._shards = [
            self._Shard(shard_capacity) for _ in range(num_shards)
        ]

    class _Shard:
        def __init__(self, capacity: int):
            self.capacity = capacity
            self.cache: OrderedDict = OrderedDict()
            self.lock = threading.Lock()

    def _get_shard(self, key) -> "_Shard":
        return self._shards[hash(key) % self._num_shards]

    def get(self, key) -> object | None:
        shard = self._get_shard(key)
        with shard.lock:
            if key in shard.cache:
                shard.cache.move_to_end(key)
                return shard.cache[key]
            return None

    def put(self, key, value) -> None:
        shard = self._get_shard(key)
        with shard.lock:
            if key in shard.cache:
                shard.cache.move_to_end(key)
                shard.cache[key] = value
            else:
                if len(shard.cache) >= shard.capacity:
                    shard.cache.popitem(last=False)
                shard.cache[key] = value

    def remove(self, key) -> bool:
        shard = self._get_shard(key)
        with shard.lock:
            if key in shard.cache:
                del shard.cache[key]
                return True
            return False

    def size(self) -> int:
        total = 0
        for shard in self._shards:
            with shard.lock:
                total += len(shard.cache)
        return total
```

---

## 8. Coarse-Grained vs Fine-Grained Locking

```
Coarse-Grained:
+---------------------------------------------------+
| One lock protects the ENTIRE data structure       |
| Simple, correct, but all operations serialize     |
+---------------------------------------------------+
Thread A: [LOCK]---[operation]---[UNLOCK]
Thread B: ----------[LOCK WAIT]----------[LOCK]---[operation]---[UNLOCK]
Thread C: ----------[LOCK WAIT]-------------------------------[LOCK]---[op]

Fine-Grained:
+---------------------------------------------------+
| Multiple locks protect PARTS of the data structure|
| Complex, concurrent, higher throughput            |
+---------------------------------------------------+
Thread A: [Lock-1]---[op on bucket 1]---[Unlock-1]
Thread B: [Lock-7]---[op on bucket 7]---[Unlock-7]    (parallel!)
Thread C: [Lock-3]---[op on bucket 3]---[Unlock-3]    (parallel!)
```

### Comparison

```
+----------------------+----------------------------+----------------------------+
| Factor               | Coarse-Grained             | Fine-Grained               |
+----------------------+----------------------------+----------------------------+
| Implementation       | Very simple                | Complex                    |
| Correctness          | Easy to verify             | Hard (more lock ordering)  |
| Throughput (low      | Good (lock overhead small) | Slightly worse (more       |
| contention)          |                            | lock overhead)             |
| Throughput (high     | Poor (serialized)          | Much better (parallel)     |
| contention)          |                            |                            |
| Deadlock risk        | Low (one lock)             | Higher (multiple locks)    |
| Memory overhead      | One lock                   | Many locks                 |
| Best for             | Prototyping, low contention| High contention, read-heavy|
+----------------------+----------------------------+----------------------------+

Rule of thumb:
  Start with coarse-grained. Profile. Switch to fine-grained only if contention
  is measured as a bottleneck. Premature optimization of locking is a common mistake.
```

---

## 9. Common Interview Questions

1. **Design a thread-safe LRU cache.**
   Use OrderedDict for O(1) operations + a lock. Discuss sharding for higher concurrency.
   Mention eviction happens in `put()` when capacity is exceeded.

2. **What is the difference between a blocking queue and a regular queue?**
   A blocking queue's `get()` blocks when empty and `put()` blocks when full. A regular
   queue raises an exception or returns None.

3. **How would you implement a thread-safe singleton?**
   Double-checked locking, module-level instance, or `__new__` with lock. In Python,
   module-level is the most Pythonic. For Java interviews, use enum singleton or
   double-checked volatile.

4. **What is copy-on-write and when is it useful?**
   Create a new copy on every write, swap the reference atomically. Reads are lock-free.
   Useful when reads vastly outnumber writes (config, ACLs, feature flags).

5. **Explain striped locking.**
   Divide the data structure into N stripes, each with its own lock. Operations on different
   stripes proceed in parallel. Hash the key to determine which stripe.

6. **What is a lock-free data structure?**
   Uses CAS instead of locks. At least one thread makes progress even if others are delayed.
   Harder to implement but avoids deadlock and priority inversion.

---

## 10. Gotchas

- **OrderedDict operations are NOT atomic.** In CPython, `dict[key]` is atomic due to the
  GIL, but `move_to_end()` followed by a read is not. Always use a lock for multi-step
  operations.

- **Sharded caches have imperfect LRU.** Each shard maintains its own LRU order. A globally
  least-recently-used item in shard 5 survives eviction if shard 5 is not full, even though
  shard 3 just evicted a more recently used item. This is an acceptable trade-off.

- **Double-checked locking is broken in Java < 5 without volatile.** The JVM can reorder
  writes so another thread sees a non-null but uninitialized instance. In Python, the GIL
  prevents this specific issue.

- **Lock-free does not mean wait-free.** Lock-free guarantees at least one thread progresses.
  Wait-free guarantees EVERY thread progresses within bounded steps. Wait-free is much harder.

- **Copy-on-write and iteration.** Iteration sees a snapshot. Items added during iteration
  are invisible to the iterator. This is usually the desired behavior, but document it.

- **Blocking queue close() semantics.** When you close a queue, you must wake ALL waiting
  threads so they can check the closed flag and exit. Using `notify_all()` is essential.

---

## 11. Quick Reference

```
+----------------------------+----------+-----------+----------------------------+
| Data Structure             | Read     | Write     | Best For                   |
+----------------------------+----------+-----------+----------------------------+
| Coarse-grained HashMap    | O(1) + L | O(1) + L  | Low contention, simplicity |
| Striped HashMap           | O(1) + l | O(1) + l  | High contention            |
| RWLock HashMap            | O(1) || | O(1) + L  | Read-heavy workloads       |
| Copy-on-Write List        | O(1)     | O(n) + L  | Extremely read-heavy       |
| Blocking Queue            | O(1) + L | O(1) + L  | Producer-consumer          |
| CAS Counter               | O(1)     | O(1)*     | High-frequency counting    |
| Concurrent LRU Cache      | O(1) + L | O(1) + L  | Caching with eviction      |
| Sharded LRU Cache         | O(1) + l | O(1) + l  | High-concurrency caching   |
| Lock-Free Stack           | O(1)*    | O(1)*     | Maximum throughput         |
+----------------------------+----------+-----------+----------------------------+

Legend:
  L = global lock (serialized)
  l = stripe lock (partially concurrent)
  || = fully concurrent (readers parallel)
  * = amortized (CAS retry loop)

Locking Strategy Decision Tree:
  Is contention measured as a bottleneck?
    NO  --> Coarse-grained lock (simple, correct)
    YES --> What is the read/write ratio?
      Read-heavy (>10:1) --> ReadWriteLock or Copy-on-Write
      Balanced            --> Striped locking
      Write-heavy         --> Striped locking or lock-free
```
