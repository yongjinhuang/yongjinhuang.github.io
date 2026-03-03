# Intervals & Greedy

Interval problems and greedy algorithms share a common trait: sorting the input unlocks
efficient solutions. Interval problems typically involve merging, inserting, or counting
overlapping ranges. Greedy algorithms make the locally optimal choice at each step, and
for certain problems, this leads to the globally optimal solution.

---

## 1. Core Concepts

### 1.1 Interval Fundamentals

An interval is a pair `[start, end]`. Two intervals overlap if one starts before the other
ends:

```python
def overlaps(a: list[int], b: list[int]) -> bool:
    """Check if two intervals overlap."""
    return a[0] < b[1] and b[0] < a[1]
```

**Key sorting strategies:**
- **Sort by start time**: Default for most merge/insert problems
- **Sort by end time**: Optimal for "maximum non-overlapping" or scheduling problems

### 1.2 Greedy Algorithm Criteria

A greedy approach works when:
1. **Greedy choice property**: A locally optimal choice leads to a globally optimal solution
2. **Optimal substructure**: An optimal solution contains optimal solutions to subproblems

If you cannot prove these properties, the problem likely requires DP instead.

### 1.3 Common Interval Patterns

| Pattern | Sort By | Key Idea |
|---------|---------|----------|
| Merge intervals | Start time | Extend or start new interval |
| Non-overlapping count | End time | Pick earliest-ending intervals |
| Meeting rooms (max overlap) | Start/end events | Sweep line with events |
| Insert interval | Already sorted | Find insertion point |

---

## 2. Interval Problems

### 2.1 Merge Intervals

**Problem:** Given a collection of intervals, merge all overlapping intervals.

**Approach:** Sort by start time. Iterate and either extend the current interval or start a
new one.

```python
def merge(intervals: list[list[int]]) -> list[list[int]]:
    """
    Merge overlapping intervals.

    Time:  O(n log n) -- dominated by sorting
    Space: O(n) -- output (O(log n) for sorting)
    """
    intervals.sort(key=lambda x: x[0])
    merged = [intervals[0]]

    for start, end in intervals[1:]:
        if start <= merged[-1][1]:
            # Overlapping: extend the current interval
            merged[-1][1] = max(merged[-1][1], end)
        else:
            # Non-overlapping: start a new interval
            merged.append([start, end])

    return merged
```

---

### 2.2 Insert Interval

**Problem:** Given a sorted list of non-overlapping intervals, insert a new interval and
merge if necessary.

**Approach:** Three phases: collect intervals before the new one, merge overlapping ones,
collect intervals after.

```python
def insert(
    intervals: list[list[int]], new_interval: list[int]
) -> list[list[int]]:
    """
    Insert and merge a new interval into sorted non-overlapping intervals.

    Time:  O(n)
    Space: O(n) -- output
    """
    result = []
    i = 0
    n = len(intervals)

    # Phase 1: Add all intervals that end before new_interval starts
    while i < n and intervals[i][1] < new_interval[0]:
        result.append(intervals[i])
        i += 1

    # Phase 2: Merge overlapping intervals
    while i < n and intervals[i][0] <= new_interval[1]:
        new_interval = [
            min(new_interval[0], intervals[i][0]),
            max(new_interval[1], intervals[i][1])
        ]
        i += 1
    result.append(new_interval)

    # Phase 3: Add remaining intervals
    while i < n:
        result.append(intervals[i])
        i += 1

    return result
```

---

### 2.3 Non-Overlapping Intervals

**Problem:** Given intervals, find the minimum number of intervals to remove so the remaining
intervals don't overlap.

**Approach:** Sort by end time. Greedily keep intervals with the earliest end time (they
leave the most room for subsequent intervals).

```python
def erase_overlap_intervals(intervals: list[list[int]]) -> int:
    """
    Minimum intervals to remove for no overlap.

    Time:  O(n log n)
    Space: O(1)
    """
    intervals.sort(key=lambda x: x[1])  # sort by END time
    count = 0
    prev_end = float('-inf')

    for start, end in intervals:
        if start >= prev_end:
            # No overlap: keep this interval
            prev_end = end
        else:
            # Overlap: remove this interval (count it)
            count += 1

    return count
```

**Why sort by end time?** Picking the interval with the earliest end time is the classic
interval scheduling greedy strategy -- it maximizes the number of non-overlapping intervals.

---

### 2.4 Meeting Rooms I

**Problem:** Given meeting time intervals, determine if a person can attend all meetings (no
overlaps).

```python
def can_attend_meetings(intervals: list[list[int]]) -> bool:
    """
    Check if any meetings overlap.

    Time:  O(n log n)
    Space: O(1)
    """
    intervals.sort(key=lambda x: x[0])

    for i in range(1, len(intervals)):
        if intervals[i][0] < intervals[i - 1][1]:
            return False

    return True
```

---

### 2.5 Meeting Rooms II

**Problem:** Given meeting time intervals, find the minimum number of conference rooms
required.

**Approach:** Sweep line / event-based. Treat each start as +1 room and each end as -1 room.
The peak is the answer.

```python
def min_meeting_rooms(intervals: list[list[int]]) -> int:
    """
    Minimum conference rooms needed.

    Time:  O(n log n)
    Space: O(n)
    """
    events = []
    for start, end in intervals:
        events.append((start, 1))   # meeting starts: need a room
        events.append((end, -1))    # meeting ends: free a room

    events.sort()

    rooms = 0
    max_rooms = 0
    for _, delta in events:
        rooms += delta
        max_rooms = max(max_rooms, rooms)

    return max_rooms
```

**Alternative using a min-heap:**

```python
import heapq

def min_meeting_rooms_heap(intervals: list[list[int]]) -> int:
    """
    Using a min-heap to track room end times.

    Time:  O(n log n)
    Space: O(n)
    """
    if not intervals:
        return 0

    intervals.sort(key=lambda x: x[0])
    heap = []  # end times of ongoing meetings

    for start, end in intervals:
        # If the earliest-ending meeting is done, reuse that room
        if heap and heap[0] <= start:
            heapq.heapreplace(heap, end)
        else:
            heapq.heappush(heap, end)

    return len(heap)
```

---

## 3. Greedy Problems

### 3.1 Jump Game

**Problem:** Given an array where `nums[i]` is the max jump length from position `i`,
determine if you can reach the last index.

```python
def can_jump(nums: list[int]) -> bool:
    """
    Can you reach the last index?

    Time:  O(n)
    Space: O(1)
    """
    max_reach = 0

    for i in range(len(nums)):
        if i > max_reach:
            return False
        max_reach = max(max_reach, i + nums[i])

    return True
```

### Jump Game II (minimum jumps)

```python
def jump(nums: list[int]) -> int:
    """
    Minimum jumps to reach the last index.

    Time:  O(n)
    Space: O(1)
    """
    jumps = 0
    current_end = 0
    farthest = 0

    for i in range(len(nums) - 1):
        farthest = max(farthest, i + nums[i])

        if i == current_end:
            jumps += 1
            current_end = farthest

    return jumps
```

**Key insight:** BFS-style greedy. Each "level" represents all positions reachable in the
same number of jumps. When you reach the end of the current level, jump.

---

### 3.2 Gas Station

**Problem:** There are n gas stations in a circle. `gas[i]` is the gas at station i,
`cost[i]` is the cost to travel to station i+1. Find the starting station to complete the
circuit, or -1 if impossible.

```python
def can_complete_circuit(gas: list[int], cost: list[int]) -> int:
    """
    Find starting gas station for a circular trip.

    Time:  O(n)
    Space: O(1)
    """
    # If total gas < total cost, impossible
    if sum(gas) < sum(cost):
        return -1

    tank = 0
    start = 0

    for i in range(len(gas)):
        tank += gas[i] - cost[i]
        if tank < 0:
            # Can't reach station i+1 from current start
            # Try starting from i+1
            start = i + 1
            tank = 0

    return start
```

**Why does this work?** If total gas >= total cost, a solution exists. If starting from
station `s` fails at station `i`, then no station between `s` and `i` can be a valid start
(they all have a net deficit). So we try `i + 1`.

---

### 3.3 Hand of Straights / Divide Array in Groups

**Problem:** Given a hand of cards, determine if they can be divided into groups of `groupSize`
where each group consists of consecutive cards.

```python
from collections import Counter

def is_n_straight_hand(hand: list[int], group_size: int) -> bool:
    """
    Can cards be divided into groups of consecutive cards?

    Time:  O(n log n)
    Space: O(n)
    """
    if len(hand) % group_size != 0:
        return False

    count = Counter(hand)

    for card in sorted(count):
        if count[card] > 0:
            freq = count[card]
            for i in range(group_size):
                if count[card + i] < freq:
                    return False
                count[card + i] -= freq

    return True
```

---

### 3.4 Partition Labels

**Problem:** Partition a string into as many parts as possible so that each letter appears
in at most one part.

```python
def partition_labels(s: str) -> list[int]:
    """
    Partition string so each char appears in exactly one part.

    Time:  O(n)
    Space: O(1) -- at most 26 characters
    """
    # Record last occurrence of each character
    last = {c: i for i, c in enumerate(s)}

    result = []
    start = 0
    end = 0

    for i, c in enumerate(s):
        end = max(end, last[c])
        if i == end:
            result.append(end - start + 1)
            start = i + 1

    return result
```

---

### 3.5 Valid Parenthesis String

**Problem:** Given a string with `(`, `)`, and `*` (can be `(`, `)`, or empty), determine
if the string is valid.

```python
def check_valid_string(s: str) -> bool:
    """
    Check if parenthesis string with wildcards is valid.

    Time:  O(n)
    Space: O(1)
    """
    # Track range of possible open parentheses counts
    low = 0   # minimum possible open count
    high = 0  # maximum possible open count

    for c in s:
        if c == '(':
            low += 1
            high += 1
        elif c == ')':
            low -= 1
            high -= 1
        else:  # '*'
            low -= 1   # treat as ')'
            high += 1  # treat as '('

        if high < 0:
            return False  # too many closing brackets
        low = max(low, 0)  # open count can't be negative

    return low == 0
```

---

### 3.6 Task Scheduler (Greedy Variant)

```python
from collections import Counter

def least_interval(tasks: list[str], n: int) -> int:
    """
    Minimum time to execute all tasks with cooldown n.
    Greedy mathematical approach.

    Time:  O(T) where T = len(tasks)
    Space: O(1) -- at most 26 task types
    """
    count = Counter(tasks)
    max_freq = max(count.values())
    max_count = sum(1 for freq in count.values() if freq == max_freq)

    # Frame: (max_freq - 1) blocks of size (n + 1), plus max_count for the last partial block
    result = (max_freq - 1) * (n + 1) + max_count

    # But we need at least len(tasks) time slots
    return max(result, len(tasks))
```

---

## 4. Common Interview Questions

| # | Problem | Difficulty | Pattern | Key Insight |
|---|---------|-----------|---------|-------------|
| 1 | Merge Intervals | Medium | Sort by start | Extend or start new |
| 2 | Insert Interval | Medium | Three-phase scan | Before, merge, after |
| 3 | Non-Overlapping Intervals | Medium | Sort by end time | Greedy: keep earliest end |
| 4 | Meeting Rooms | Easy | Sort + scan | Check consecutive overlaps |
| 5 | Meeting Rooms II | Medium | Sweep line / heap | Peak concurrent meetings |
| 6 | Jump Game | Medium | Greedy max-reach | Track farthest reachable |
| 7 | Jump Game II | Medium | BFS-style greedy | Level-by-level expansion |
| 8 | Gas Station | Medium | Greedy reset | If total works, solution exists |
| 9 | Partition Labels | Medium | Last occurrence map | Extend partition to cover all chars |
| 10 | Hand of Straights | Medium | Greedy + counter | Start from smallest card |
| 11 | Valid Parenthesis String | Medium | Range tracking | Track min/max open count |

---

## 5. Gotchas

### 5.1 Interval Gotchas
- **Sort direction matters**: Merge intervals -> sort by start. Non-overlapping intervals ->
  sort by end. Using the wrong sort order gives incorrect results.
- **Overlap condition**: `[1,3]` and `[3,5]` overlap if the problem uses inclusive endpoints.
  Check whether the problem treats boundaries as inclusive or exclusive.
- **Mutability**: Be careful with `merged[-1][1] = max(...)`. This modifies the list in place.
  If you need the original intervals unchanged, work with copies.
- **Empty input**: Always handle `len(intervals) == 0`.

### 5.2 Greedy Gotchas
- **Greedy does NOT always work**: If you can't prove the greedy choice property, consider DP.
  Example: Coin change with arbitrary denominations requires DP, not greedy.
- **Local vs global optimum**: Greedy works for "activity selection" (intervals) and "fractional
  knapsack" but NOT for "0/1 knapsack" or "coin change with general coins."
- **Proof technique**: To verify greedy correctness, use "exchange argument" -- show that
  swapping any non-greedy choice with the greedy choice doesn't worsen the solution.

### 5.3 Meeting Rooms II Gotchas
- **Event sorting with ties**: When a meeting ends at the same time another starts (e.g.,
  `[1,5]` and `[5,10]`), the end event should be processed first (they can share a room).
  Sorting by `(time, delta)` handles this since -1 < 1.
- **Heap approach**: `heapreplace` vs `heappush + heappop`. Use `heapreplace` only when
  you're sure the room can be reused.

### 5.4 Jump Game Gotchas
- **Jump Game I vs II**: Jump Game I asks "can you reach the end?" (boolean). Jump Game II
  asks "minimum jumps to reach the end" (count).
- **Iterate to `n-2`** in Jump Game II (not `n-1`), because you don't need to jump FROM the
  last index.

### 5.5 Gas Station Gotchas
- **Uniqueness**: The problem guarantees at most one valid starting station.
- **Circular trip**: The total gas must be >= total cost. If not, return -1 immediately.
- **Reset logic**: When tank goes negative, reset start to `i + 1` and tank to 0.

---

## 6. Quick Reference

| Pattern | When to Use | Sort By | Time | Key Detail |
|---------|-------------|---------|------|------------|
| Merge intervals | Combine overlapping ranges | Start time | O(n log n) | Extend current or start new |
| Insert interval | Add to sorted intervals | Already sorted | O(n) | Three-phase: before, merge, after |
| Interval scheduling | Max non-overlapping | End time | O(n log n) | Pick earliest-ending |
| Sweep line | Count max overlap | Events by time | O(n log n) | +1 for start, -1 for end |
| Min-heap rooms | Meeting rooms | Start time | O(n log n) | Heap of end times |
| Greedy max-reach | Reachability (jump game) | None (ordered) | O(n) | Track farthest reachable index |
| Greedy BFS | Min jumps | None (ordered) | O(n) | Level = current jump range |
| Total sum check | Circular trip (gas station) | None (ordered) | O(n) | If total >= 0, solution exists |
| Last occurrence | Partition labels | None | O(n) | Extend partition to last char |
