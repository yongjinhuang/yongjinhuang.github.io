# Patterns & Cheat Sheet

This is the master reference for DSA interviews. It summarizes every major pattern, when to
use each data structure, Big-O complexities, and Python-specific tips. Keep this open during
practice sessions and review it before interviews.

---

## 1. Pattern Recognition Guide

### 1.1 Sliding Window

**Trigger words:** "contiguous subarray," "substring," "window of size k," "longest/shortest
subarray satisfying..."

**Template:**

```python
def sliding_window(arr, condition):
    left = 0
    window_state = {}
    result = 0

    for right in range(len(arr)):
        # Expand: add arr[right] to window
        update(window_state, arr[right])

        # Contract: while window is invalid
        while not condition(window_state):
            remove(window_state, arr[left])
            left += 1

        # Update result
        result = max(result, right - left + 1)

    return result
```

**Variants:**

- Fixed window size: no contraction needed, slide of size k
- Variable window: expand/contract
- Minimum window: shrink while valid, track minimum

| Problem                          | Window Type    | Time |
| -------------------------------- | -------------- | ---- |
| Max sum subarray of size k       | Fixed          | O(n) |
| Longest substring without repeat | Variable       | O(n) |
| Minimum window substring         | Variable (min) | O(n) |
| Sliding window maximum           | Fixed + deque  | O(n) |

---

### 1.2 Two Pointers

**Trigger words:** "sorted array," "pair with target sum," "remove duplicates," "container,"
"palindrome."

**Patterns:**

```python
# Opposite ends (sorted input)
left, right = 0, len(arr) - 1
while left < right:
    if condition_met:
        return result
    elif need_larger:
        left += 1
    else:
        right -= 1

# Same direction (fast-slow)
slow = 0
for fast in range(len(arr)):
    if condition:
        arr[slow] = arr[fast]
        slow += 1
```

| Problem                   | Pointer Type   | Time   |
| ------------------------- | -------------- | ------ |
| Two Sum (sorted)          | Opposite       | O(n)   |
| Container With Most Water | Opposite       | O(n)   |
| Remove Duplicates         | Same direction | O(n)   |
| Palindrome Check          | Opposite       | O(n)   |
| Merge Sorted Arrays       | Same direction | O(n+m) |

---

### 1.3 Fast-Slow Pointers

**Trigger words:** "cycle detection," "middle of linked list," "palindrome linked list."

```python
slow = fast = head
while fast and fast.next:
    slow = slow.next
    fast = fast.next.next
    # If they meet: cycle exists
```

| Problem          | Usage                         | Time     |
| ---------------- | ----------------------------- | -------- |
| Detect cycle     | Meet = cycle                  | O(n)     |
| Find cycle start | Reset to head after meeting   | O(n)     |
| Find middle      | When fast ends, slow = middle | O(n)     |
| Happy number     | Cycle in digit sum sequence   | O(log n) |

---

### 1.4 Merge Intervals

**Trigger words:** "overlapping intervals," "merge," "insert interval," "meeting rooms."

```python
intervals.sort(key=lambda x: x[0])
merged = [intervals[0]]

for start, end in intervals[1:]:
    if start <= merged[-1][1]:
        merged[-1][1] = max(merged[-1][1], end)
    else:
        merged.append([start, end])
```

---

### 1.5 Cyclic Sort

**Trigger words:** "numbers in range [0, n]," "missing number," "duplicate in [1, n]."

```python
def cyclic_sort(nums):
    i = 0
    while i < len(nums):
        correct_idx = nums[i]  # where nums[i] should go
        if nums[i] != nums[correct_idx]:
            nums[i], nums[correct_idx] = nums[correct_idx], nums[i]
        else:
            i += 1
```

| Problem          | Find                         | Time |
| ---------------- | ---------------------------- | ---- |
| Missing Number   | `nums[i] != i` after sort    | O(n) |
| Find Duplicate   | `nums[i] != i` during sort   | O(n) |
| Find All Missing | All `i` where `nums[i] != i` | O(n) |

---

### 1.6 Top-K Elements

**Trigger words:** "k largest," "k most frequent," "k closest."

```python
import heapq

# K largest: use min-heap of size k
def top_k(nums, k):
    return heapq.nlargest(k, nums)

# K smallest: use max-heap of size k (negate)
# K most frequent: heap on frequency
```

---

### 1.7 Modified Binary Search

**Trigger words:** "sorted," "rotated sorted," "search for boundary," "minimum that satisfies."

```python
# Standard: left <= right, return mid
# Boundary: left < right, shrink to boundary
# On answer: binary search over solution space
```

---

### 1.8 BFS / DFS Patterns

**Use BFS for:** shortest path (unweighted), level-order, nearest neighbor.
**Use DFS for:** exhaustive search, cycle detection, topological sort, path finding.

```python
# BFS template
from collections import deque
queue = deque([start])
visited = {start}
while queue:
    node = queue.popleft()
    for neighbor in graph[node]:
        if neighbor not in visited:
            visited.add(neighbor)
            queue.append(neighbor)

# DFS template (recursive)
def dfs(node, visited):
    visited.add(node)
    for neighbor in graph[node]:
        if neighbor not in visited:
            dfs(neighbor, visited)
```

---

### 1.9 Subsets / Backtracking

**Trigger words:** "all subsets," "all permutations," "all combinations," "generate all."

```python
def backtrack(start, current):
    result.append(current[:])
    for i in range(start, len(nums)):
        current.append(nums[i])
        backtrack(i + 1, current)
        current.pop()
```

---

### 1.10 Dynamic Programming Identification

**Trigger words:** "minimum cost," "maximum profit," "number of ways," "can you achieve,"
"longest/shortest sequence."

**Decision framework:**

```
Can you make a greedy choice?
  YES -> Greedy (prove exchange argument)
  NO  -> Does it have overlapping subproblems?
    YES -> DP
    NO  -> Divide and conquer / backtracking
```

---

## 2. Data Structure Selection Guide

### When to Use Each Data Structure

| Data Structure     | Use When                              | Python                | Operations                      |
| ------------------ | ------------------------------------- | --------------------- | ------------------------------- |
| Array/List         | Ordered collection, index access      | `list`                | O(1) access, O(n) insert/delete |
| Hash Map           | Key-value lookup, counting            | `dict`, `defaultdict` | O(1) avg lookup/insert          |
| Hash Set           | Membership testing, uniqueness        | `set`                 | O(1) avg lookup/insert          |
| Stack              | LIFO, matching, monotonic problems    | `list`                | O(1) push/pop                   |
| Queue              | FIFO, BFS                             | `deque`               | O(1) append/popleft             |
| Heap               | Top-K, priority scheduling            | `heapq`               | O(log n) push/pop, O(1) peek    |
| Linked List        | Frequent insert/delete at head        | Custom class          | O(1) head insert, O(n) access   |
| Binary Search Tree | Sorted data with dynamic updates      | `sortedcontainers`    | O(log n) ops                    |
| Trie               | Prefix matching, autocomplete         | Custom class          | O(m) per operation              |
| Union-Find         | Connected components, cycle detection | Custom class          | O(alpha(n)) per op              |
| Deque              | Sliding window max/min                | `deque`               | O(1) both ends                  |

---

## 3. Big-O Complexity Reference

### 3.1 Time Complexity Comparison

| Complexity | Name         | Example             | n=1000               |
| ---------- | ------------ | ------------------- | -------------------- |
| O(1)       | Constant     | Hash lookup         | 1                    |
| O(log n)   | Logarithmic  | Binary search       | 10                   |
| O(n)       | Linear       | Single pass         | 1,000                |
| O(n log n) | Linearithmic | Merge sort          | 10,000               |
| O(n^2)     | Quadratic    | Nested loops        | 1,000,000            |
| O(n^3)     | Cubic        | Triple nested loops | 1,000,000,000        |
| O(2^n)     | Exponential  | Subsets             | 10^301               |
| O(n!)      | Factorial    | Permutations        | Astronomically large |

### 3.2 Sorting Algorithms

| Algorithm                | Best        | Average     | Worst       | Space    | Stable |
| ------------------------ | ----------- | ----------- | ----------- | -------- | ------ |
| Timsort (Python default) | O(n)        | O(n log n)  | O(n log n)  | O(n)     | Yes    |
| Merge Sort               | O(n log n)  | O(n log n)  | O(n log n)  | O(n)     | Yes    |
| Quick Sort               | O(n log n)  | O(n log n)  | O(n^2)      | O(log n) | No     |
| Heap Sort                | O(n log n)  | O(n log n)  | O(n log n)  | O(1)     | No     |
| Counting Sort            | O(n+k)      | O(n+k)      | O(n+k)      | O(k)     | Yes    |
| Radix Sort               | O(d\*(n+k)) | O(d\*(n+k)) | O(d\*(n+k)) | O(n+k)   | Yes    |
| Bucket Sort              | O(n+k)      | O(n+k)      | O(n^2)      | O(n)     | Yes    |

### 3.3 Data Structure Operations

| Structure      | Access   | Search   | Insert   | Delete   |
| -------------- | -------- | -------- | -------- | -------- |
| Array          | O(1)     | O(n)     | O(n)     | O(n)     |
| Linked List    | O(n)     | O(n)     | O(1)\*   | O(1)\*   |
| Hash Table     | N/A      | O(1) avg | O(1) avg | O(1) avg |
| BST (balanced) | O(log n) | O(log n) | O(log n) | O(log n) |
| Heap           | N/A      | O(n)     | O(log n) | O(log n) |
| Trie           | N/A      | O(m)     | O(m)     | O(m)     |

\*Given a reference to the node

### 3.4 Graph Algorithms

| Algorithm              | Time               | Space  | Use Case                          |
| ---------------------- | ------------------ | ------ | --------------------------------- |
| BFS                    | O(V+E)             | O(V)   | Shortest path (unweighted)        |
| DFS                    | O(V+E)             | O(V)   | Cycle detection, topo sort        |
| Dijkstra (binary heap) | O((V+E) log V)     | O(V)   | Shortest path (weighted, non-neg) |
| Bellman-Ford           | O(V\*E)            | O(V)   | Shortest path (negative edges)    |
| Floyd-Warshall         | O(V^3)             | O(V^2) | All-pairs shortest path           |
| Kruskal (MST)          | O(E log E)         | O(V)   | Minimum spanning tree             |
| Prim (MST)             | O((V+E) log V)     | O(V)   | Minimum spanning tree (dense)     |
| Topological Sort       | O(V+E)             | O(V)   | Dependency ordering               |
| Union-Find             | O(alpha(n)) per op | O(V)   | Connected components              |

---

## 4. Python-Specific Tips

### 4.1 Collections Module

```python
from collections import (
    defaultdict,   # dict with default factory
    Counter,       # frequency counting
    deque,         # double-ended queue
    OrderedDict,   # dict that remembers insertion order
)

# defaultdict: auto-initialize missing keys
graph = defaultdict(list)
graph['a'].append('b')  # no KeyError

# Counter: frequency counting powerhouse
nums = [1, 2, 2, 3, 3, 3]
count = Counter(nums)           # Counter({3: 3, 2: 2, 1: 1})
count.most_common(2)            # [(3, 3), (2, 2)]
count['missing']                # 0 (not KeyError)
Counter('abc') + Counter('bcd') # Counter({'b': 2, 'c': 2, 'a': 1, 'd': 1})

# deque: O(1) operations on both ends
dq = deque([1, 2, 3])
dq.appendleft(0)  # [0, 1, 2, 3]
dq.popleft()       # 0
dq.rotate(1)       # [3, 1, 2] -- rotate right
dq.rotate(-1)      # [1, 2, 3] -- rotate left
```

### 4.2 heapq Module

```python
import heapq

# Min-heap operations
heap = [3, 1, 4, 1, 5]
heapq.heapify(heap)          # O(n) -- in-place
heapq.heappush(heap, 2)      # O(log n)
smallest = heapq.heappop(heap)  # O(log n)

# Max-heap: negate values
max_heap = [-x for x in [3, 1, 4]]
heapq.heapify(max_heap)
largest = -heapq.heappop(max_heap)  # 4

# Top-K
heapq.nlargest(3, iterable)   # 3 largest
heapq.nsmallest(3, iterable)  # 3 smallest
```

### 4.3 bisect Module

```python
import bisect

# Sorted list operations
arr = [1, 3, 5, 5, 5, 7, 9]

bisect.bisect_left(arr, 5)    # 2 -- leftmost position for 5
bisect.bisect_right(arr, 5)   # 5 -- rightmost position for 5
bisect.bisect(arr, 5)         # 5 -- same as bisect_right

bisect.insort_left(arr, 4)    # insert 4 at position 2
bisect.insort_right(arr, 6)   # insert 6 at position 6
```

### 4.4 itertools Module

```python
from itertools import (
    combinations,    # C(n, k) combinations
    permutations,    # P(n, k) permutations
    product,         # Cartesian product
    accumulate,      # prefix sums
    chain,           # flatten iterables
    groupby,         # group consecutive equal elements
)

list(combinations([1,2,3], 2))  # [(1,2), (1,3), (2,3)]
list(permutations([1,2,3], 2))  # [(1,2), (1,3), (2,1), (2,3), (3,1), (3,2)]
list(accumulate([1,2,3,4]))     # [1, 3, 6, 10] -- prefix sums
```

### 4.5 Useful Builtins and Tricks

```python
# Infinity
float('inf'), float('-inf')

# Divmod
quotient, remainder = divmod(17, 5)  # (3, 2)

# Enumerate with start index
for i, val in enumerate(arr, start=1):
    pass

# Zip for parallel iteration
for a, b in zip(list1, list2):
    pass

# Sorted with key
sorted(arr, key=lambda x: x[1])           # sort by second element
sorted(arr, key=lambda x: (-x[0], x[1]))  # sort by first desc, second asc

# List comprehension with condition
evens = [x for x in range(10) if x % 2 == 0]

# Dictionary comprehension
squares = {x: x*x for x in range(5)}

# Set operations
a = {1, 2, 3}
b = {2, 3, 4}
a & b  # intersection: {2, 3}
a | b  # union: {1, 2, 3, 4}
a - b  # difference: {1}
a ^ b  # symmetric difference: {1, 4}

# String methods
'abc'.isalpha()     # True
'123'.isdigit()     # True
'abc'.isalnum()     # True
'abc def'.split()   # ['abc', 'def']
','.join(['a','b']) # 'a,b'
'abc'[::-1]         # 'cba' -- reverse string

# Default values with get
val = d.get(key, default_value)

# Swap without temp
a, b = b, a

# Min/max with default
min(arr, default=0)

# All/any
all(x > 0 for x in arr)  # True if all positive
any(x > 0 for x in arr)  # True if any positive
```

### 4.6 Recursion Tips

```python
import sys
sys.setrecursionlimit(10000)  # increase for deep recursion

from functools import lru_cache

@lru_cache(maxsize=None)
def fib(n):
    if n <= 1:
        return n
    return fib(n - 1) + fib(n - 2)

# Clear cache when needed
fib.cache_clear()
```

---

## 5. Problem-Solving Framework

### Step 1: Understand the Problem (2-3 minutes)

- Restate the problem in your own words
- Clarify edge cases: empty input, single element, duplicates, negative numbers
- Ask about constraints: input size, value range, time/space requirements

### Step 2: Identify the Pattern (2-3 minutes)

- What data structure fits naturally?
- What pattern does the problem match?
- Can I reduce it to a known problem?

### Step 3: Plan the Approach (3-5 minutes)

- Write pseudocode or explain the algorithm
- Identify the time and space complexity
- Discuss trade-offs if multiple approaches exist

### Step 4: Code (15-20 minutes)

- Write clean, readable code
- Use meaningful variable names
- Handle edge cases
- Add brief comments for non-obvious logic

### Step 5: Test (3-5 minutes)

- Walk through with a small example
- Test edge cases: empty, single, large
- Verify time and space complexity claims

---

## 6. Decision Tree for Common Problems

```
Problem asks for...

SHORTEST PATH / MINIMUM STEPS?
├── Unweighted graph → BFS
├── Weighted (non-negative) → Dijkstra
├── Weighted (negative ok) → Bellman-Ford
└── All pairs → Floyd-Warshall

FIND/COUNT SUBARRAYS?
├── Contiguous subarray → Sliding Window
├── Sum equals K → Prefix Sum + Hash Map
└── All subarrays → Consider O(n^2) or DP

FIND PAIRS/TRIPLETS?
├── Sorted → Two Pointers
├── Unsorted → Hash Map
└── Sum target → Sort + Two Pointers or Hash Map

OPTIMIZATION (min/max/count)?
├── Greedy choice works → Greedy
├── Overlapping subproblems → DP
└── All possibilities → Backtracking

STRING MATCHING?
├── Exact match → Hash Map or Two Pointers
├── Prefix/autocomplete → Trie
├── Wildcard → Trie + DFS
└── Subsequence → DP (LCS)

SORTED DATA?
├── Search → Binary Search
├── Insert/delete dynamically → BST/SortedList
└── Merge K sorted → Heap

TOP-K / KTH ELEMENT?
├── Static array → Quickselect O(n) avg
├── Stream → Heap of size K
└── Frequency-based → Counter + Heap

CONNECTED COMPONENTS / UNION?
├── Static → Union-Find
├── Dynamic → Union-Find
└── With traversal → BFS/DFS

DEPENDENCY ORDERING?
└── Topological Sort (Kahn's BFS or DFS postorder)

GENERATE ALL POSSIBILITIES?
├── Subsets → Backtracking (include/exclude)
├── Permutations → Backtracking (swap/used set)
├── Combinations → Backtracking (start index)
└── Constraint satisfaction → Backtracking + pruning
```

---

## 7. Quick Complexity Reference

### Interview Constraint Guidelines

| Input Size (n)  | Expected Complexity                   | Common Patterns                        |
| --------------- | ------------------------------------- | -------------------------------------- |
| n <= 10         | O(n!), O(2^n)                         | Backtracking, brute force              |
| n <= 20         | O(2^n), O(n \* 2^n)                   | Bitmask DP, backtracking               |
| n <= 100        | O(n^3)                                | Floyd-Warshall, interval DP            |
| n <= 1,000      | O(n^2)                                | DP, nested loops                       |
| n <= 10,000     | O(n^2) possible, O(n log n) preferred | Sort-based, DP                         |
| n <= 100,000    | O(n log n)                            | Sort, binary search, heap              |
| n <= 1,000,000  | O(n) or O(n log n)                    | Hash map, two pointers, sliding window |
| n <= 10,000,000 | O(n)                                  | Linear scan, counting sort             |
| n > 10^8        | O(log n), O(1)                        | Math, binary search on answer          |

### Space Complexity Guidelines

| Approach              | Space           | Notes                   |
| --------------------- | --------------- | ----------------------- |
| In-place modification | O(1)            | Modify input directly   |
| Two pointers          | O(1)            | Constant extra space    |
| Hash set/map          | O(n)            | Trading space for time  |
| Recursion             | O(h) or O(n)    | Call stack depth        |
| DP table              | O(n) or O(n\*m) | Often reducible to O(n) |
| BFS queue             | O(w) or O(n)    | Width of tree/graph     |
| Sorting (Timsort)     | O(n)            | Python's built-in sort  |
