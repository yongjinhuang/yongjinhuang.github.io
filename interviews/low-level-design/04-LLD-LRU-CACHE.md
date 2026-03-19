# Design an LRU Cache

The LRU (Least Recently Used) cache is one of the most popular LLD interview questions because
it tests data structure design thinking at a fundamental level. The interviewer wants to see
you combine a hash map with a doubly linked list to achieve O(1) for both get and put operations.

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Data Structure Design](#2-data-structure-design)
3. [LRU Cache Implementation](#3-lru-cache-implementation)
4. [LFU Cache Implementation](#4-lfu-cache-implementation)
5. [TTL-Based Cache](#5-ttl-based-cache)
6. [Thread-Safe Cache](#6-thread-safe-cache)
7. [Interview Walkthrough](#7-interview-walkthrough)
8. [Common Follow-Up Questions](#8-common-follow-up-questions)
9. [Gotchas](#9-gotchas)
10. [Quick Reference](#10-quick-reference)

---

## 1. Problem Statement

Design a cache that supports:

- `get(key)` -- Return the value if the key exists, otherwise return -1.
- `put(key, value)` -- Insert or update the key-value pair. If the cache is at capacity,
  evict the **least recently used** item before inserting.

Both operations must run in **O(1)** time.

### Requirements

| #   | Requirement    | Constraint                                 |
| --- | -------------- | ------------------------------------------ |
| R1  | O(1) get       | Must not scan the entire cache             |
| R2  | O(1) put       | Must not scan to find eviction target      |
| R3  | Fixed capacity | Evict LRU item when full                   |
| R4  | Track recency  | Every get/put makes the item "most recent" |

### Why Not Just Use a Dict?

A Python dict preserves insertion order (since 3.7), but it does not efficiently move an
existing key to the "most recently used" position on access. You would need to delete and
re-insert, which is O(n) in the worst case for maintaining order semantics.

---

## 2. Data Structure Design

The key insight: combine **two data structures** where each compensates for the other's weakness.

```
+------------------------------------------------------------------+
|                     LRU CACHE INTERNALS                          |
+------------------------------------------------------------------+
|                                                                  |
|  HASH MAP: O(1) key lookup                                       |
|  +----------+----------+----------+----------+                   |
|  | key: "A" | key: "B" | key: "C" | key: "D" |                  |
|  | val: --> | val: --> | val: --> | val: --> |                   |
|  +----+-----+----+-----+----+-----+----+-----+                  |
|       |          |          |          |                          |
|       v          v          v          v                          |
|  DOUBLY LINKED LIST: O(1) add/remove, tracks order               |
|                                                                  |
|  HEAD <-> [A] <-> [B] <-> [C] <-> [D] <-> TAIL                  |
|  (MRU)                                    (LRU)                  |
|                                                                  |
|  On get("B"):  move [B] to head                                  |
|  HEAD <-> [B] <-> [A] <-> [C] <-> [D] <-> TAIL                  |
|                                                                  |
|  On put("E") when full: remove [D] from tail, add [E] at head   |
|  HEAD <-> [E] <-> [B] <-> [A] <-> [C] <-> TAIL                  |
|                                                                  |
+------------------------------------------------------------------+
```

**Hash map** gives O(1) lookup by key.
**Doubly linked list** gives O(1) move-to-front and remove-from-tail.
The hash map stores pointers to linked list nodes, bridging the two structures.

---

## 3. LRU Cache Implementation

### Node Class

```python
class Node:
    """Doubly linked list node."""

    __slots__ = ("key", "value", "prev", "next")

    def __init__(self, key: int = 0, value: int = 0):
        self.key = key
        self.value = value
        self.prev: Node | None = None
        self.next: Node | None = None
```

### LRU Cache

```python
class LRUCache:
    def __init__(self, capacity: int):
        if capacity <= 0:
            raise ValueError("Capacity must be positive")
        self._capacity = capacity
        self._cache: dict[int, Node] = {}

        # Sentinel nodes simplify edge cases (no null checks)
        self._head = Node()  # Dummy head (MRU side)
        self._tail = Node()  # Dummy tail (LRU side)
        self._head.next = self._tail
        self._tail.prev = self._head

    def get(self, key: int) -> int:
        if key not in self._cache:
            return -1
        node = self._cache[key]
        self._move_to_front(node)
        return node.value

    def put(self, key: int, value: int) -> None:
        if key in self._cache:
            node = self._cache[key]
            node.value = value
            self._move_to_front(node)
            return

        if len(self._cache) >= self._capacity:
            self._evict_lru()

        new_node = Node(key, value)
        self._cache[key] = new_node
        self._add_to_front(new_node)

    def _add_to_front(self, node: Node) -> None:
        """Insert node right after head sentinel."""
        node.prev = self._head
        node.next = self._head.next
        self._head.next.prev = node
        self._head.next = node

    def _remove_node(self, node: Node) -> None:
        """Remove node from its current position in the list."""
        node.prev.next = node.next
        node.next.prev = node.prev

    def _move_to_front(self, node: Node) -> None:
        """Move existing node to front (most recently used)."""
        self._remove_node(node)
        self._add_to_front(node)

    def _evict_lru(self) -> None:
        """Remove the least recently used item (node before tail sentinel)."""
        lru_node = self._tail.prev
        self._remove_node(lru_node)
        del self._cache[lru_node.key]

    def __len__(self) -> int:
        return len(self._cache)

    def __repr__(self) -> str:
        items = []
        current = self._head.next
        while current is not self._tail:
            items.append(f"{current.key}:{current.value}")
            current = current.next
        return f"LRUCache([{', '.join(items)}], cap={self._capacity})"
```

### Usage Example

```python
cache = LRUCache(3)
cache.put(1, 10)
cache.put(2, 20)
cache.put(3, 30)
print(cache)       # LRUCache([3:30, 2:20, 1:10], cap=3)

cache.get(1)       # Returns 10, moves key 1 to front
print(cache)       # LRUCache([1:10, 3:30, 2:20], cap=3)

cache.put(4, 40)   # Evicts key 2 (LRU), adds key 4
print(cache)       # LRUCache([4:40, 1:10, 3:30], cap=3)

cache.get(2)       # Returns -1 (evicted)
```

---

## 4. LFU Cache Implementation

LFU (Least Frequently Used) evicts the item with the lowest access count. On ties, evict
the least recently used among them.

```
+------------------------------------------------------------------+
|                     LFU CACHE INTERNALS                          |
+------------------------------------------------------------------+
|                                                                  |
|  HASH MAP 1: key -> (value, frequency)                           |
|  HASH MAP 2: frequency -> OrderedDict of keys                   |
|                                                                  |
|  freq=1: { "C": val_c }                                         |
|  freq=2: { "A": val_a, "B": val_b }                             |
|  freq=5: { "D": val_d }                                         |
|                                                                  |
|  min_freq pointer: 1 (evict from here on capacity overflow)      |
|                                                                  |
+------------------------------------------------------------------+
```

```python
from collections import OrderedDict, defaultdict


class LFUCache:
    def __init__(self, capacity: int):
        self._capacity = capacity
        self._min_freq = 0
        self._key_to_val: dict[int, int] = {}
        self._key_to_freq: dict[int, int] = {}
        self._freq_to_keys: dict[int, OrderedDict] = defaultdict(OrderedDict)

    def get(self, key: int) -> int:
        if key not in self._key_to_val:
            return -1
        self._increment_freq(key)
        return self._key_to_val[key]

    def put(self, key: int, value: int) -> None:
        if self._capacity <= 0:
            return

        if key in self._key_to_val:
            self._key_to_val[key] = value
            self._increment_freq(key)
            return

        if len(self._key_to_val) >= self._capacity:
            self._evict()

        self._key_to_val[key] = value
        self._key_to_freq[key] = 1
        self._freq_to_keys[1][key] = None  # OrderedDict as ordered set
        self._min_freq = 1

    def _increment_freq(self, key: int) -> None:
        freq = self._key_to_freq[key]
        self._key_to_freq[key] = freq + 1

        # Remove from current frequency bucket
        del self._freq_to_keys[freq][key]
        if not self._freq_to_keys[freq]:
            del self._freq_to_keys[freq]
            if self._min_freq == freq:
                self._min_freq = freq + 1

        # Add to next frequency bucket
        self._freq_to_keys[freq + 1][key] = None

    def _evict(self) -> None:
        # Pop first (oldest) key from lowest frequency bucket
        keys_at_min = self._freq_to_keys[self._min_freq]
        evict_key, _ = keys_at_min.popitem(last=False)

        if not keys_at_min:
            del self._freq_to_keys[self._min_freq]

        del self._key_to_val[evict_key]
        del self._key_to_freq[evict_key]
```

---

## 5. TTL-Based Cache

A cache where entries expire after a configurable time-to-live.

```python
import time
import threading


class TTLCache:
    def __init__(self, capacity: int, default_ttl: float = 60.0):
        self._capacity = capacity
        self._default_ttl = default_ttl
        self._cache: dict[str, tuple[any, float]] = {}  # key -> (value, expire_at)
        self._lock = threading.Lock()

    def get(self, key: str) -> any:
        with self._lock:
            if key not in self._cache:
                return None
            value, expire_at = self._cache[key]
            if time.time() > expire_at:
                del self._cache[key]
                return None
            return value

    def put(self, key: str, value: any, ttl: float | None = None) -> None:
        with self._lock:
            self._cleanup_expired()
            if len(self._cache) >= self._capacity and key not in self._cache:
                # Evict oldest expiring entry
                oldest_key = min(self._cache, key=lambda k: self._cache[k][1])
                del self._cache[oldest_key]

            expire_at = time.time() + (ttl if ttl is not None else self._default_ttl)
            self._cache[key] = (value, expire_at)

    def delete(self, key: str) -> bool:
        with self._lock:
            if key in self._cache:
                del self._cache[key]
                return True
            return False

    def _cleanup_expired(self) -> None:
        """Lazy cleanup of expired entries."""
        now = time.time()
        expired_keys = [k for k, (_, exp) in self._cache.items() if now > exp]
        for key in expired_keys:
            del self._cache[key]

    def __len__(self) -> int:
        with self._lock:
            self._cleanup_expired()
            return len(self._cache)
```

---

## 6. Thread-Safe Cache

Wrapping our LRU Cache with proper locking for concurrent access.

```python
import threading
from typing import TypeVar, Generic

V = TypeVar("V")


class ThreadSafeLRUCache(Generic[V]):
    """LRU Cache safe for concurrent read/write access."""

    def __init__(self, capacity: int):
        self._capacity = capacity
        self._cache: dict[str, Node] = {}
        self._head = Node()
        self._tail = Node()
        self._head.next = self._tail
        self._tail.prev = self._head
        self._lock = threading.RLock()  # Reentrant lock for nested calls

    def get(self, key: str) -> V | None:
        with self._lock:
            if key not in self._cache:
                return None
            node = self._cache[key]
            self._move_to_front(node)
            return node.value

    def put(self, key: str, value: V) -> None:
        with self._lock:
            if key in self._cache:
                node = self._cache[key]
                node.value = value
                self._move_to_front(node)
                return

            if len(self._cache) >= self._capacity:
                lru = self._tail.prev
                self._remove_node(lru)
                del self._cache[lru.key]

            new_node = Node(key, value)
            self._cache[key] = new_node
            self._add_to_front(new_node)

    def _add_to_front(self, node: Node) -> None:
        node.prev = self._head
        node.next = self._head.next
        self._head.next.prev = node
        self._head.next = node

    def _remove_node(self, node: Node) -> None:
        node.prev.next = node.next
        node.next.prev = node.prev

    def _move_to_front(self, node: Node) -> None:
        self._remove_node(node)
        self._add_to_front(node)
```

### Why RLock Instead of Lock?

A `threading.RLock` (reentrant lock) allows the same thread to acquire the lock multiple
times without deadlocking. This is useful if `put()` internally calls another method that
also acquires the lock. A regular `Lock` would deadlock in that case.

---

## 7. Interview Walkthrough

The interviewer says: "Design an LRU Cache with O(1) get and put."

### Step 1: Clarify (2 minutes)

- "What are the key and value types?" (Integers for LeetCode-style, strings for real-world)
- "Should it be thread-safe?" (Mention it, implement if asked)
- "Is there a TTL?" (Not for basic, mention as extension)

### Step 2: Design the Data Structure (3 minutes)

Draw the hash map + doubly linked list diagram. Explain:

- Hash map gives O(1) lookup by key
- Doubly linked list gives O(1) removal and insertion
- Sentinel nodes eliminate null-check edge cases

### Step 3: Implement (15-20 minutes)

Write the Node class first, then LRUCache. Start with `_add_to_front` and `_remove_node`
helpers -- they are the building blocks for everything else.

### Step 4: Test with Examples (5 minutes)

Walk through: put(1,1), put(2,2), get(1), put(3,3), get(2)=-1.

---

## 8. Common Follow-Up Questions

### "What about an LFU cache?"

Use two hash maps: one for key-to-value/frequency, one for frequency-to-OrderedDict-of-keys.
Track `min_freq` for O(1) eviction. (See Section 4 above.)

### "How would you add TTL?"

Store `(value, expire_at)` tuples. On `get()`, check expiration. Use lazy cleanup or a
background thread for proactive cleanup.

### "How would you make this distributed?"

Consistent hashing to shard keys across cache nodes. Each node runs a local LRU cache.
Use a cache-aside or write-through pattern. Mention Redis as a real-world example.

### "What eviction policies besides LRU and LFU exist?"

| Policy | Description                  | When to Use                          |
| ------ | ---------------------------- | ------------------------------------ |
| LRU    | Evict least recently used    | General purpose, temporal locality   |
| LFU    | Evict least frequently used  | Frequency matters more than recency  |
| FIFO   | Evict first inserted         | Simple, predictable                  |
| Random | Evict random entry           | Surprisingly effective, low overhead |
| ARC    | Adaptive between LRU and LFU | Self-tuning, used in databases       |

---

## 9. Gotchas

- **Sentinel nodes are essential.** Without them, `_add_to_front` and `_remove_node` need
  special cases for empty list, single element, etc. Sentinels eliminate all edge cases.

- **Node stores the key.** When evicting from the tail, you need the key to delete from the
  hash map. If the node does not store the key, you cannot do this in O(1).

- **`__slots__` matters.** For high-performance caches, `__slots__` on Node reduces memory
  usage by ~40% and speeds up attribute access.

- **OrderedDict is not LRU.** Python's `OrderedDict` has `move_to_end()` which makes it
  tempting to use as an LRU cache. It works but the interviewer usually wants to see the
  underlying data structure implementation.

- **dict is ordered in Python 3.7+** but does not have O(1) `move_to_end`. Do not confuse
  insertion order with access order.

---

## 10. Quick Reference

```
+-------------------+----------------+-------+--------+
| Operation         | Data Structure | Time  | Space  |
+-------------------+----------------+-------+--------+
| LRU get           | HashMap + DLL  | O(1)  | O(n)   |
| LRU put           | HashMap + DLL  | O(1)  | O(n)   |
| LRU evict         | DLL tail       | O(1)  |        |
| LFU get           | 2 HashMaps     | O(1)  | O(n)   |
| LFU put           | 2 HashMaps     | O(1)  | O(n)   |
| LFU evict         | min_freq map   | O(1)  |        |
| TTL cleanup lazy  | On access      | O(1)  |        |
| TTL cleanup eager | Background     | O(n)  |        |
+-------------------+----------------+-------+--------+

Key insight: HashMap gives O(1) lookup.
            DLL gives O(1) positional update.
            Together they give O(1) for everything.

Sentinel nodes: HEAD <-> [data nodes] <-> TAIL
  - Eliminates null checks in add/remove
  - HEAD.next = MRU, TAIL.prev = LRU
  - Empty cache: HEAD <-> TAIL
```
