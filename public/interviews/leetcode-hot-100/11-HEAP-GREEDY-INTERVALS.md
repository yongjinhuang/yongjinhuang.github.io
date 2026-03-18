# Heap, Greedy & Intervals

## Core Concepts

### Heap Operations in Python (`heapq`)

Python's `heapq` module provides a **min-heap** implementation backed by a list. There is no built-in max-heap; negate values to simulate one.

```python
import heapq

nums = [3, 1, 4, 1, 5]
heapq.heapify(nums)          # O(n) - transform list in-place
heapq.heappush(nums, 2)      # O(log n) - push element
smallest = heapq.heappop(nums)  # O(log n) - pop smallest
top_k = heapq.nlargest(3, nums) # O(n log k) - k largest
bot_k = heapq.nsmallest(3, nums) # O(n log k) - k smallest

# Max-heap trick: negate values
max_heap: list[int] = []
heapq.heappush(max_heap, -val)
largest = -heapq.heappop(max_heap)
```

### Greedy Strategy

Make the locally optimal choice at each step, trusting it leads to a global optimum. Works when:
- The problem has **optimal substructure** (optimal solution contains optimal sub-solutions)
- The problem has the **greedy choice property** (local optimum leads to global optimum)

Common greedy patterns: sort by end time, sort by start time, always pick the largest/smallest available.

### Interval Patterns

Most interval problems follow one of these templates:
1. **Sort by start** then merge/process left to right (merge intervals)
2. **Sort by end** then greedily pick non-overlapping (max non-overlapping)
3. **Sweep line** using a heap to track active intervals (meeting rooms)

Two intervals `[a, b]` and `[c, d]` overlap when `a < d and c < b`.

---

## Problem 1. Merge Intervals (LC #56) - Medium

**Problem**: Given an array of intervals `[start, end]`, merge all overlapping intervals and return the non-overlapping result.

**Pattern**: Sort by start + linear merge

### Approach

Sort intervals by start time. Iterate through and maintain the current merged interval. If the next interval's start is less than or equal to the current end, extend the current end. Otherwise, the current interval is complete; start a new one.

### Solution

```python
def merge(intervals: list[list[int]]) -> list[list[int]]:
    intervals.sort(key=lambda x: x[0])
    merged: list[list[int]] = [intervals[0]]

    for start, end in intervals[1:]:
        if start <= merged[-1][1]:
            merged[-1] = [merged[-1][0], max(merged[-1][1], end)]
        else:
            merged.append([start, end])

    return merged
```

**Time**: O(n log n) for sorting
**Space**: O(n) for the output list
**Edge Cases**:
- Single interval returns itself
- All intervals overlap into one
- Already sorted and non-overlapping (no merges)
- Intervals where one fully contains another, e.g. `[1,10], [2,3]`

---

## Problem 2. Insert Interval (LC #57) - Medium

**Problem**: Given a sorted list of non-overlapping intervals, insert a new interval and merge if necessary. Return the result sorted and non-overlapping.

**Pattern**: Three-phase linear scan

### Approach

Split processing into three phases:
1. Add all intervals that end before the new interval starts (no overlap on the left).
2. Merge all intervals that overlap with the new interval by updating its start/end.
3. Add all remaining intervals that start after the new interval ends.

### Solution

```python
def insert(
    intervals: list[list[int]], new_interval: list[int]
) -> list[list[int]]:
    result: list[list[int]] = []
    i = 0
    n = len(intervals)

    # Phase 1: intervals entirely before new_interval
    while i < n and intervals[i][1] < new_interval[0]:
        result.append(intervals[i])
        i += 1

    # Phase 2: merge overlapping intervals
    while i < n and intervals[i][0] <= new_interval[1]:
        new_interval = [
            min(new_interval[0], intervals[i][0]),
            max(new_interval[1], intervals[i][1]),
        ]
        i += 1
    result.append(new_interval)

    # Phase 3: intervals entirely after new_interval
    while i < n:
        result.append(intervals[i])
        i += 1

    return result
```

**Time**: O(n) single pass
**Space**: O(n) for the output list
**Edge Cases**:
- Empty intervals list: return `[new_interval]`
- New interval before all existing intervals
- New interval after all existing intervals
- New interval merges all existing intervals into one

---

## Problem 3. Non-overlapping Intervals (LC #435) - Medium

**Problem**: Given an array of intervals, find the minimum number of intervals to remove so the rest are non-overlapping.

**Pattern**: Greedy — sort by end time, maximize kept intervals

### Approach

Sort by end time. Greedily keep intervals that don't overlap with the last kept interval (i.e., whose start is >= the last kept end). The answer is `total - kept`. Sorting by end time is key: it gives the most room for future intervals.

### Solution

```python
def erase_overlap_intervals(intervals: list[list[int]]) -> int:
    intervals.sort(key=lambda x: x[1])
    kept = 1
    prev_end = intervals[0][1]

    for start, end in intervals[1:]:
        if start >= prev_end:
            kept += 1
            prev_end = end

    return len(intervals) - kept
```

**Time**: O(n log n) for sorting
**Space**: O(1) ignoring sort space
**Edge Cases**:
- No overlaps: return 0
- All intervals identical: remove all but one
- One interval: return 0
- Intervals where one is fully contained in another

---

## Problem 4. Meeting Rooms (LC #252) - Easy

**Problem**: Given an array of meeting time intervals `[start, end]`, determine if a person could attend all meetings (i.e., no two meetings overlap).

**Pattern**: Sort + adjacent comparison

### Approach

Sort by start time. If any meeting starts before the previous one ends, there's a conflict.

### Solution

```python
def can_attend_meetings(intervals: list[list[int]]) -> bool:
    intervals.sort(key=lambda x: x[0])

    for i in range(1, len(intervals)):
        if intervals[i][0] < intervals[i - 1][1]:
            return False

    return True
```

**Time**: O(n log n) for sorting
**Space**: O(1) ignoring sort space
**Edge Cases**:
- Empty list or single meeting: return `True`
- Two meetings where one ends exactly when the next starts (`[1,5], [5,10]`): no overlap, return `True`
- All meetings at the same time

---

## Problem 5. Meeting Rooms II (LC #253) - Medium

**Problem**: Given an array of meeting time intervals, find the minimum number of conference rooms required.

**Pattern**: Sweep line with min-heap (or sorted start/end arrays)

### Approach

Sort meetings by start time. Use a min-heap to track end times of ongoing meetings. For each new meeting, if it starts after or at the earliest ending meeting, reuse that room (pop from heap). Always push the new meeting's end time. The heap size at any point is the number of rooms in use.

### Solution

```python
import heapq


def min_meeting_rooms(intervals: list[list[int]]) -> int:
    intervals.sort(key=lambda x: x[0])
    heap: list[int] = []  # end times of active meetings

    for start, end in intervals:
        if heap and heap[0] <= start:
            heapq.heappop(heap)
        heapq.heappush(heap, end)

    return len(heap)
```

**Alternative approach** using sorted start/end arrays:

```python
def min_meeting_rooms_sweep(intervals: list[list[int]]) -> int:
    starts = sorted(iv[0] for iv in intervals)
    ends = sorted(iv[1] for iv in intervals)
    rooms = 0
    end_ptr = 0

    for start in starts:
        if start < ends[end_ptr]:
            rooms += 1
        else:
            end_ptr += 1

    return rooms
```

**Time**: O(n log n) for sorting
**Space**: O(n) for the heap
**Edge Cases**:
- Empty list: return 0
- No overlaps: return 1
- All meetings overlap: return `n`
- Meetings that end exactly when another starts (share room)

---

## Problem 6. Top K Frequent Elements (LC #347) - Medium

**Problem**: Given an integer array and an integer `k`, return the `k` most frequent elements. Answer may be in any order.

**Pattern**: Frequency counting + min-heap of size k

### Approach

Count frequencies with a dictionary. Maintain a min-heap of size `k` — push each `(frequency, element)` pair. If the heap exceeds size `k`, pop the smallest frequency. The remaining `k` elements are the answer.

### Solution

```python
import heapq
from collections import Counter


def top_k_frequent(nums: list[int], k: int) -> list[int]:
    counts = Counter(nums)
    return heapq.nlargest(k, counts.keys(), key=counts.get)  # type: ignore[arg-type]
```

**Manual heap approach** for clarity:

```python
import heapq
from collections import Counter


def top_k_frequent_heap(nums: list[int], k: int) -> list[int]:
    counts = Counter(nums)
    heap: list[tuple[int, int]] = []

    for num, freq in counts.items():
        heapq.heappush(heap, (freq, num))
        if len(heap) > k:
            heapq.heappop(heap)

    return [num for _, num in heap]
```

**Bucket sort approach** (O(n) time):

```python
from collections import Counter


def top_k_frequent_bucket(nums: list[int], k: int) -> list[int]:
    counts = Counter(nums)
    buckets: list[list[int]] = [[] for _ in range(len(nums) + 1)]

    for num, freq in counts.items():
        buckets[freq].append(num)

    result: list[int] = []
    for freq in range(len(buckets) - 1, -1, -1):
        for num in buckets[freq]:
            result.append(num)
            if len(result) == k:
                return result

    return result
```

**Time**: O(n log k) for the heap approach, O(n) for bucket sort
**Space**: O(n) for frequency map
**Edge Cases**:
- `k` equals the number of distinct elements (return all)
- All elements are the same (`k=1`)
- Array of length 1

---

## Problem 7. Kth Largest Element in an Array (LC #215) - Medium

**Problem**: Given an integer array and `k`, return the `k`th largest element (not the `k`th distinct element).

**Pattern**: Min-heap of size k / Quickselect

### Approach

**Heap approach**: Maintain a min-heap of size `k`. The root is always the `k`th largest. Push each element; if the heap exceeds size `k`, pop the smallest.

**Quickselect approach**: Partition around a random pivot. If the pivot lands at index `n-k`, we found it. Otherwise recurse on the correct side. Average O(n) time.

### Solution

```python
import heapq


def find_kth_largest(nums: list[int], k: int) -> int:
    heap: list[int] = []

    for num in nums:
        heapq.heappush(heap, num)
        if len(heap) > k:
            heapq.heappop(heap)

    return heap[0]
```

**Quickselect approach**:

```python
import random


def find_kth_largest_quickselect(nums: list[int], k: int) -> int:
    target = len(nums) - k

    def quickselect(left: int, right: int) -> int:
        pivot_idx = random.randint(left, right)
        pivot = nums[pivot_idx]
        # Move pivot to end
        nums[pivot_idx], nums[right] = nums[right], nums[pivot_idx]
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

**Time**: O(n log k) heap, O(n) average quickselect (O(n^2) worst case)
**Space**: O(k) heap, O(1) quickselect (ignoring recursion stack)
**Edge Cases**:
- `k = 1` (find maximum)
- `k = n` (find minimum)
- All elements identical
- Array with negative numbers

---

## Problem 8. Task Scheduler (LC #621) - Medium

**Problem**: Given tasks represented as characters and a cooldown interval `n`, find the minimum number of intervals the CPU needs to complete all tasks. The CPU can be idle.

**Pattern**: Greedy — schedule most frequent tasks first

### Approach

The most frequent task dictates the minimum time. Place the most frequent task with `n` gaps between each occurrence, then fill gaps with other tasks. The formula is:

```
slots = (max_freq - 1) * (n + 1) + count_of_tasks_with_max_freq
```

The answer is `max(slots, total_tasks)` because if there are enough distinct tasks, no idle time is needed.

### Solution

```python
from collections import Counter


def least_interval(tasks: list[str], n: int) -> int:
    counts = Counter(tasks)
    max_freq = max(counts.values())
    max_freq_count = sum(1 for freq in counts.values() if freq == max_freq)

    slots = (max_freq - 1) * (n + 1) + max_freq_count
    return max(slots, len(tasks))
```

**Heap simulation approach** (useful for understanding scheduling order):

```python
import heapq
from collections import Counter, deque


def least_interval_heap(tasks: list[str], n: int) -> int:
    counts = Counter(tasks)
    max_heap = [-freq for freq in counts.values()]
    heapq.heapify(max_heap)

    time = 0
    cooldown: deque[tuple[int, int]] = deque()  # (-remaining_count, available_at)

    while max_heap or cooldown:
        time += 1

        if max_heap:
            remaining = heapq.heappop(max_heap) + 1  # +1 because negated
            if remaining != 0:
                cooldown.append((remaining, time + n))

        if cooldown and cooldown[0][1] == time:
            heapq.heappush(max_heap, cooldown.popleft()[0])

    return time
```

**Time**: O(n) for the formula approach, O(total * log 26) for heap simulation
**Space**: O(1) for formula (26 letters max), O(26) for heap
**Edge Cases**:
- `n = 0`: answer is simply `len(tasks)`
- All tasks are the same character
- Many distinct tasks with low frequency (no idle needed)
- Single task

---

## Problem 9. Find Median from Data Stream (LC #295) - Hard

**Problem**: Design a data structure that supports adding integers from a stream and finding the median of all elements seen so far.

**Pattern**: Two heaps — max-heap for lower half, min-heap for upper half

### Approach

Maintain two heaps:
- `lo` (max-heap via negation): stores the smaller half of numbers
- `hi` (min-heap): stores the larger half of numbers

Invariant: `len(lo)` is always equal to or one more than `len(hi)`.

To add a number: push to `lo`, then move `lo`'s max to `hi`, then rebalance if `hi` grows larger. The median is `lo`'s top (odd count) or the average of both tops (even count).

### Solution

```python
import heapq


class MedianFinder:
    def __init__(self) -> None:
        self.lo: list[int] = []  # max-heap (negated)
        self.hi: list[int] = []  # min-heap

    def add_num(self, num: int) -> None:
        heapq.heappush(self.lo, -num)
        heapq.heappush(self.hi, -heapq.heappop(self.lo))

        if len(self.hi) > len(self.lo):
            heapq.heappush(self.lo, -heapq.heappop(self.hi))

    def find_median(self) -> float:
        if len(self.lo) > len(self.hi):
            return -self.lo[0]
        return (-self.lo[0] + self.hi[0]) / 2.0
```

**Time**: O(log n) per `add_num`, O(1) per `find_median`
**Space**: O(n) for storing all elements
**Edge Cases**:
- Single element: median is that element
- Two elements: median is their average
- All identical elements
- Stream of sorted ascending/descending values
- Negative numbers and zero

---

## Problem 10. Jump Game II (LC #45) - Medium

**Problem**: Given an array where `nums[i]` is the maximum jump length from position `i`, return the minimum number of jumps to reach the last index. You are guaranteed to be able to reach the end.

**Pattern**: Greedy — BFS-like level traversal

### Approach

Think of it as BFS where each "level" is the range of indices reachable with a given number of jumps. Track the current level's farthest reach and the next level's farthest reach. When the current index passes the current level boundary, increment jumps and extend the boundary.

### Solution

```python
def jump(nums: list[int]) -> int:
    jumps = 0
    current_end = 0
    farthest = 0

    for i in range(len(nums) - 1):
        farthest = max(farthest, i + nums[i])

        if i == current_end:
            jumps += 1
            current_end = farthest

            if current_end >= len(nums) - 1:
                break

    return jumps
```

**Time**: O(n) single pass
**Space**: O(1)
**Edge Cases**:
- Array of length 1: already at the end, return 0
- First element can reach the end: return 1
- Array of all 1s: return `n - 1`
- Large jumps early that skip most of the array

---

## Summary Table

| # | Problem | Pattern | Time | Space |
|---|---------|---------|------|-------|
| 56 | Merge Intervals | Sort + merge | O(n log n) | O(n) |
| 57 | Insert Interval | Three-phase scan | O(n) | O(n) |
| 435 | Non-overlapping Intervals | Greedy (sort by end) | O(n log n) | O(1) |
| 252 | Meeting Rooms | Sort + check | O(n log n) | O(1) |
| 253 | Meeting Rooms II | Sweep line + heap | O(n log n) | O(n) |
| 347 | Top K Frequent Elements | Frequency + heap | O(n log k) | O(n) |
| 215 | Kth Largest Element | Min-heap of size k | O(n log k) | O(k) |
| 621 | Task Scheduler | Greedy formula | O(n) | O(1) |
| 295 | Find Median from Data Stream | Two heaps | O(log n) add | O(n) |
| 45 | Jump Game II | Greedy BFS | O(n) | O(1) |
