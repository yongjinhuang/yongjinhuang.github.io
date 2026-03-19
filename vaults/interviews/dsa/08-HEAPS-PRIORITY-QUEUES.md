# Heaps & Priority Queues

A heap (priority queue) gives O(1) access to the min or max element and O(log n) insertion
and removal. In interviews, heaps appear in top-K problems, merging sorted structures, and
stream-based problems where you continuously need the extreme element.

---

## 1. Core Concepts

### 1.1 Python's heapq Module

Python's `heapq` implements a **min-heap** only. Key operations:

```python
import heapq

# Create a heap from a list
nums = [5, 3, 8, 1, 2]
heapq.heapify(nums)  # O(n) -- in-place

# Push and pop
heapq.heappush(nums, 4)   # O(log n)
smallest = heapq.heappop(nums)  # O(log n) -- removes and returns smallest

# Push then pop (more efficient than separate push + pop)
result = heapq.heappushpop(nums, 6)  # push 6, pop smallest

# Pop then push (more efficient than separate pop + push)
result = heapq.heapreplace(nums, 6)  # pop smallest, push 6

# Get n smallest/largest (no heap modification)
heapq.nsmallest(3, nums)  # O(n log k)
heapq.nlargest(3, nums)   # O(n log k)
```

### 1.2 Max-Heap Trick

Python only has min-heap. For max-heap, **negate the values**:

```python
import heapq

# Max-heap simulation
max_heap = []
heapq.heappush(max_heap, -5)
heapq.heappush(max_heap, -3)
heapq.heappush(max_heap, -8)

largest = -heapq.heappop(max_heap)  # 8
```

### 1.3 Heap with Custom Comparison

Use tuples -- Python compares tuples element by element:

```python
import heapq

# Priority queue with (priority, item)
pq = []
heapq.heappush(pq, (3, "low priority"))
heapq.heappush(pq, (1, "high priority"))
heapq.heappush(pq, (2, "medium priority"))

priority, item = heapq.heappop(pq)  # (1, "high priority")
```

**Tie-breaking:** If priorities are equal, Python compares the next element. If items aren't
comparable, add a unique counter:

```python
counter = 0
heapq.heappush(pq, (priority, counter, item))
counter += 1
```

### 1.4 When to Use a Heap

| Scenario                 | Why Heap?                      |
| ------------------------ | ------------------------------ |
| Top K elements           | Keep a heap of size K          |
| Kth largest/smallest     | Min/max heap of size K         |
| Merge K sorted lists     | Min-heap of K heads            |
| Continuous median        | Two heaps (max + min)          |
| Scheduling / ordering    | Process by priority            |
| Shortest path (Dijkstra) | Min-heap for next closest node |

---

## 2. Classic Problems

### 2.1 Kth Largest Element in an Array

**Problem:** Find the kth largest element in an unsorted array.

**Approach 1: Min-heap of size K.** The root of a min-heap of size K is the Kth largest.

```python
import heapq

def find_kth_largest(nums: list[int], k: int) -> int:
    """
    Kth largest using a min-heap of size k.

    Time:  O(n log k)
    Space: O(k)
    """
    heap = nums[:k]
    heapq.heapify(heap)

    for num in nums[k:]:
        if num > heap[0]:
            heapq.heapreplace(heap, num)

    return heap[0]
```

**Approach 2: Quickselect (average O(n))**

```python
import random

def find_kth_largest_quickselect(nums: list[int], k: int) -> int:
    """
    Quickselect -- average O(n), worst O(n^2).

    Time:  O(n) average
    Space: O(1)
    """
    target = len(nums) - k

    def quickselect(left, right):
        pivot_idx = random.randint(left, right)
        nums[pivot_idx], nums[right] = nums[right], nums[pivot_idx]
        pivot = nums[right]

        store = left
        for i in range(left, right):
            if nums[i] < pivot:
                nums[store], nums[i] = nums[i], nums[store]
                store += 1
        nums[store], nums[right] = nums[right], nums[store]

        if store == target:
            return nums[store]
        elif store < target:
            return quickselect(store + 1, right)
        else:
            return quickselect(left, store - 1)

    return quickselect(0, len(nums) - 1)
```

---

### 2.2 Top K Frequent Elements

**Problem:** Return the k most frequent elements.

```python
import heapq
from collections import Counter

def top_k_frequent(nums: list[int], k: int) -> list[int]:
    """
    Top K frequent elements using min-heap.

    Time:  O(n log k)
    Space: O(n)
    """
    count = Counter(nums)
    # Min-heap of size k based on frequency
    return heapq.nlargest(k, count.keys(), key=count.get)
```

**Alternative using heap manually:**

```python
def top_k_frequent_heap(nums: list[int], k: int) -> list[int]:
    """
    Time:  O(n log k)
    Space: O(n + k)
    """
    count = Counter(nums)
    heap = []

    for num, freq in count.items():
        heapq.heappush(heap, (freq, num))
        if len(heap) > k:
            heapq.heappop(heap)

    return [num for freq, num in heap]
```

---

### 2.3 Merge K Sorted Lists

**Problem:** Merge k sorted linked lists into one sorted list.

**Approach:** Use a min-heap to always pick the smallest head among all lists.

```python
import heapq

class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

def merge_k_lists(lists: list[ListNode | None]) -> ListNode | None:
    """
    Merge k sorted linked lists using a min-heap.

    Time:  O(N log k) where N = total nodes, k = number of lists
    Space: O(k) -- heap holds at most k nodes
    """
    heap = []
    # Use counter for tie-breaking since ListNode is not comparable
    for i, head in enumerate(lists):
        if head:
            heapq.heappush(heap, (head.val, i, head))

    dummy = ListNode(0)
    current = dummy

    while heap:
        val, idx, node = heapq.heappop(heap)
        current.next = node
        current = current.next

        if node.next:
            heapq.heappush(heap, (node.next.val, idx, node.next))

    return dummy.next
```

---

### 2.4 Find Median from Data Stream (Two Heaps)

**Problem:** Design a data structure that supports adding integers and finding the median.

**Approach:** Maintain two heaps:

- **Max-heap** (`small`): stores the smaller half
- **Min-heap** (`large`): stores the larger half

The median is either the max of `small`, the min of `large`, or their average.

```python
import heapq

class MedianFinder:
    """
    Find median from a data stream using two heaps.

    addNum: O(log n)
    findMedian: O(1)
    Space: O(n)
    """

    def __init__(self):
        self.small = []  # max-heap (negate values)
        self.large = []  # min-heap

    def add_num(self, num: int) -> None:
        # Always add to max-heap first
        heapq.heappush(self.small, -num)

        # Ensure max of small <= min of large
        if self.small and self.large and (-self.small[0] > self.large[0]):
            val = -heapq.heappop(self.small)
            heapq.heappush(self.large, val)

        # Balance sizes: small can have at most 1 more element
        if len(self.small) > len(self.large) + 1:
            val = -heapq.heappop(self.small)
            heapq.heappush(self.large, val)
        elif len(self.large) > len(self.small):
            val = heapq.heappop(self.large)
            heapq.heappush(self.small, -val)

    def find_median(self) -> float:
        if len(self.small) > len(self.large):
            return -self.small[0]
        return (-self.small[0] + self.large[0]) / 2
```

---

### 2.5 Task Scheduler

**Problem:** Given tasks with a cooldown period `n`, find the minimum time to execute all
tasks. Same tasks must be separated by at least `n` intervals.

**Approach:** Use a max-heap (most frequent tasks first) and a cooldown queue.

```python
import heapq
from collections import Counter, deque

def least_interval(tasks: list[str], n: int) -> int:
    """
    Minimum intervals to finish all tasks with cooldown n.

    Time:  O(T * n) where T = total tasks (each task processed once)
    Space: O(26) = O(1) -- at most 26 distinct tasks
    """
    count = Counter(tasks)
    # Max-heap of remaining counts (negate for max-heap)
    heap = [-cnt for cnt in count.values()]
    heapq.heapify(heap)

    time = 0
    cooldown = deque()  # (available_time, remaining_count)

    while heap or cooldown:
        time += 1

        if heap:
            remaining = 1 + heapq.heappop(heap)  # +1 because negated, -1 for execution
            if remaining != 0:
                cooldown.append((time + n, remaining))

        if cooldown and cooldown[0][0] == time:
            _, cnt = cooldown.popleft()
            heapq.heappush(heap, cnt)

    return time
```

**Math approach (O(n) time):**

```python
def least_interval_math(tasks: list[str], n: int) -> int:
    """
    Formula-based approach.

    Time:  O(n) where n = len(tasks)
    Space: O(1)
    """
    count = Counter(tasks)
    max_freq = max(count.values())
    max_count = sum(1 for freq in count.values() if freq == max_freq)

    # Minimum slots = (max_freq - 1) * (n + 1) + max_count
    # But we need at least len(tasks) slots
    return max(len(tasks), (max_freq - 1) * (n + 1) + max_count)
```

---

### 2.6 Reorganize String

**Problem:** Rearrange a string so that no two adjacent characters are the same. Return ""
if impossible.

```python
import heapq
from collections import Counter

def reorganize_string(s: str) -> str:
    """
    Rearrange string so no two adjacent chars are the same.

    Time:  O(n log 26) = O(n)
    Space: O(26) = O(1)
    """
    count = Counter(s)

    # Check if possible: no char should appear more than (n+1)/2 times
    max_freq = max(count.values())
    if max_freq > (len(s) + 1) // 2:
        return ""

    # Max-heap by frequency
    heap = [(-freq, char) for char, freq in count.items()]
    heapq.heapify(heap)

    result = []
    prev_freq, prev_char = 0, ''

    while heap:
        freq, char = heapq.heappop(heap)
        result.append(char)

        # Push previous character back (if it still has remaining count)
        if prev_freq < 0:
            heapq.heappush(heap, (prev_freq, prev_char))

        prev_freq = freq + 1  # +1 because freq is negative (used one)
        prev_char = char

    return "".join(result)
```

---

## 3. Additional Important Problems

### 3.1 K Closest Points to Origin

```python
import heapq

def k_closest(points: list[list[int]], k: int) -> list[list[int]]:
    """
    K closest points to origin using max-heap of size k.

    Time:  O(n log k)
    Space: O(k)
    """
    heap = []
    for x, y in points:
        dist = x * x + y * y  # no need for sqrt
        if len(heap) < k:
            heapq.heappush(heap, (-dist, x, y))
        elif -dist > heap[0][0]:
            heapq.heapreplace(heap, (-dist, x, y))

    return [[x, y] for _, x, y in heap]
```

### 3.2 Sort Characters By Frequency

```python
import heapq
from collections import Counter

def frequency_sort(s: str) -> str:
    """
    Sort characters by frequency (most frequent first).
    Time:  O(n log k) where k = distinct chars
    Space: O(n)
    """
    count = Counter(s)
    heap = [(-freq, char) for char, freq in count.items()]
    heapq.heapify(heap)

    result = []
    while heap:
        freq, char = heapq.heappop(heap)
        result.append(char * (-freq))

    return "".join(result)
```

### 3.3 Kth Smallest in Sorted Matrix

```python
import heapq

def kth_smallest_matrix(matrix: list[list[int]], k: int) -> int:
    """
    Kth smallest element in row/col sorted matrix.
    Time:  O(k log n) where n = len(matrix)
    Space: O(n)
    """
    n = len(matrix)
    heap = [(matrix[r][0], r, 0) for r in range(n)]
    heapq.heapify(heap)

    for _ in range(k):
        val, r, c = heapq.heappop(heap)
        if c + 1 < n:
            heapq.heappush(heap, (matrix[r][c + 1], r, c + 1))

    return val
```

---

## 4. Common Interview Questions

| #   | Problem                      | Difficulty | Pattern                   | Key Insight                    |
| --- | ---------------------------- | ---------- | ------------------------- | ------------------------------ |
| 1   | Kth Largest Element          | Medium     | Min-heap of size K        | Root = Kth largest             |
| 2   | Top K Frequent Elements      | Medium     | Min-heap of size K        | Frequency as priority          |
| 3   | K Closest Points to Origin   | Medium     | Max-heap of size K        | Negate distance for max-heap   |
| 4   | Sort Characters By Frequency | Medium     | Max-heap                  | Frequency sorting              |
| 5   | Task Scheduler               | Medium     | Max-heap + cooldown       | Most frequent task first       |
| 6   | Reorganize String            | Medium     | Max-heap + prev tracking  | Alternate most frequent chars  |
| 7   | Merge K Sorted Lists         | Hard       | Min-heap of K heads       | Counter for tie-breaking       |
| 8   | Find Median from Data Stream | Hard       | Two heaps                 | Max-heap small, min-heap large |
| 9   | Sliding Window Median        | Hard       | Two heaps + lazy deletion | Extension of median finder     |

---

## 5. Gotchas

### 5.1 Python heapq Gotchas

- **Min-heap only**: Always negate values for max-heap behavior. This is the number one
  source of bugs.
- **No decrease-key**: Python's heapq doesn't support decrease-key. Use lazy deletion
  (mark entries as invalid, skip them when popped) instead.
- **Tuple comparison**: Tuples are compared element by element. If the first elements are
  equal, the second must be comparable. Use a counter to break ties with non-comparable items.
- **heapify is O(n)**: Building a heap from a list is O(n), not O(n log n). Use it instead
  of pushing n elements one by one.

### 5.2 Two-Heap Gotchas

- **Balance invariant**: The two heaps must differ in size by at most 1. Always rebalance
  after adding an element.
- **Cross-heap ordering**: The max of the small heap must be <= the min of the large heap.
  After pushing to one heap, check and fix this invariant.
- **Median calculation**: When heaps have equal size, median = average of both tops. When
  sizes differ, median = top of the larger heap.

### 5.3 Top-K Gotchas

- **Min-heap, not max-heap** for "top K largest": A min-heap of size K lets the smallest
  of the K largest elements bubble to the top for easy comparison.
- **Max-heap, not min-heap** for "top K smallest": Same logic, inverted.
- **K could be 0**: Handle edge case where K = 0 (return empty).

### 5.4 Merge K Lists Gotchas

- **Empty lists**: Filter out None heads before building the initial heap.
- **Tie-breaking**: ListNode objects are not comparable. Add a counter as the second element
  in the heap tuple.

---

## 6. Quick Reference

| Pattern                  | When to Use                  | Time         | Space | Key Detail                      |
| ------------------------ | ---------------------------- | ------------ | ----- | ------------------------------- |
| Min-heap of size K       | Kth largest, top K largest   | O(n log k)   | O(k)  | Root = Kth largest              |
| Max-heap of size K       | Kth smallest, top K smallest | O(n log k)   | O(k)  | Negate values                   |
| Merge K sorted           | Combine K sorted sequences   | O(N log k)   | O(k)  | Pop min head, push next         |
| Two heaps (median)       | Running median               | O(log n)/add | O(n)  | Max-heap small + min-heap large |
| Max-heap + cooldown      | Task scheduling              | O(T)         | O(k)  | Process most frequent first     |
| Heap + lazy deletion     | Dynamic priority changes     | O(n log n)   | O(n)  | Skip invalid entries            |
| heapq.nsmallest/nlargest | Quick top-K (no heap mgmt)   | O(n log k)   | O(k)  | Convenience API                 |
