# Binary Search - LeetCode Hot 100

## Templates and Patterns

Binary search is deceptively simple but notoriously tricky to implement correctly. The key decisions are: **what is the search space**, **when do we shrink it**, and **what invariant do we maintain**. Below are four essential templates.

### Template 1: Standard Binary Search

Find an exact target in a sorted array. Returns the index or -1.

```python
def binary_search(nums: list[int], target: int) -> int:
    lo, hi = 0, len(nums) - 1
    while lo <= hi:
        mid = lo + (hi - lo) // 2
        if nums[mid] == target:
            return mid
        elif nums[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1
```

**Invariant**: `lo <= hi` means there is still a candidate. When `lo > hi`, no candidate remains.

### Template 2: Left-Bound (First Occurrence)

Find the first position where a condition becomes true. After the loop, `lo` is the leftmost index satisfying the condition.

```python
def left_bound(nums: list[int], target: int) -> int:
    lo, hi = 0, len(nums) - 1
    while lo <= hi:
        mid = lo + (hi - lo) // 2
        if nums[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return lo  # first index where nums[i] >= target
```

### Template 3: Right-Bound (Last Occurrence)

Find the last position where a condition is true. After the loop, `hi` is the rightmost index satisfying the condition.

```python
def right_bound(nums: list[int], target: int) -> int:
    lo, hi = 0, len(nums) - 1
    while lo <= hi:
        mid = lo + (hi - lo) // 2
        if nums[mid] <= target:
            lo = mid + 1
        else:
            hi = mid - 1
    return hi  # last index where nums[i] <= target
```

### Template 4: Search on Answer (Minimization / Maximization)

Binary search does not require a sorted array -- it requires a **monotonic predicate** over a search space. If the answer space is `[lo, hi]` and there exists a function `feasible(x)` that flips from `False` to `True` at some threshold, we can binary search for that threshold.

```python
def search_on_answer(lo: int, hi: int) -> int:
    while lo < hi:
        mid = lo + (hi - lo) // 2
        if feasible(mid):
            hi = mid        # mid might be the answer, keep it
        else:
            lo = mid + 1    # mid is not feasible, discard it
    return lo  # smallest feasible value
```

**When to use which**:
| Pattern | Use Case | Loop Condition | Return |
|---------|----------|----------------|--------|
| Standard | Exact match | `lo <= hi` | `mid` or `-1` |
| Left-bound | First occurrence / lower bound | `lo <= hi` | `lo` |
| Right-bound | Last occurrence / upper bound | `lo <= hi` | `hi` |
| Search on answer | Min/max satisfying a condition | `lo < hi` | `lo` |

---

## Problem 1. Binary Search (LC #704) - Easy

**Problem**: Given a sorted array of integers `nums` and an integer `target`, return the index of `target` if it exists, otherwise return `-1`. The array has distinct elements.

**Pattern**: Standard binary search (Template 1).

### Approach

This is the textbook binary search. Maintain two pointers `lo` and `hi` representing the current search window. Compute `mid`, compare `nums[mid]` with `target`, and shrink the window accordingly. The loop runs while `lo <= hi` because a single-element window is still valid.

### Solution

```python
class Solution:
    def search(self, nums: list[int], target: int) -> int:
        lo, hi = 0, len(nums) - 1

        while lo <= hi:
            mid = lo + (hi - lo) // 2
            if nums[mid] == target:
                return mid
            elif nums[mid] < target:
                lo = mid + 1
            else:
                hi = mid - 1

        return -1
```

**Time**: O(log n)
**Space**: O(1)
**Edge Cases**:
- Single element array -- the loop executes once, handles correctly.
- Target smaller than all elements -- `lo` moves past `hi` immediately at the left end.
- Target larger than all elements -- `hi` moves past `lo` at the right end.

---

## Problem 2. Search a 2D Matrix (LC #74) - Medium

**Problem**: Given an `m x n` matrix where each row is sorted left-to-right and the first element of each row is greater than the last element of the previous row, determine if a target value exists in the matrix.

**Pattern**: Standard binary search on a virtual 1D array.

### Approach

Because the rows are contiguous in sorted order, the entire matrix can be treated as a single sorted array of length `m * n`. Index `k` in this virtual array maps to row `k // n` and column `k % n`. Run a standard binary search over indices `[0, m*n - 1]`.

### Solution

```python
class Solution:
    def searchMatrix(self, matrix: list[list[int]], target: int) -> bool:
        m, n = len(matrix), len(matrix[0])
        lo, hi = 0, m * n - 1

        while lo <= hi:
            mid = lo + (hi - lo) // 2
            val = matrix[mid // n][mid % n]
            if val == target:
                return True
            elif val < target:
                lo = mid + 1
            else:
                hi = mid - 1

        return False
```

**Time**: O(log(m * n))
**Space**: O(1)
**Edge Cases**:
- Single row or single column matrix -- the index math still works correctly.
- Target smaller than `matrix[0][0]` or larger than `matrix[m-1][n-1]` -- exits immediately.
- 1x1 matrix -- single comparison.

---

## Problem 3. Koko Eating Bananas (LC #875) - Medium

**Problem**: Koko has `n` piles of bananas. She can eat at most `k` bananas per hour from a single pile (if a pile has fewer than `k`, she finishes it and waits). Guards return in `h` hours. Find the minimum integer `k` such that she can eat all bananas within `h` hours.

**Pattern**: Search on answer (Template 4). Binary search on the eating speed.

### Approach

The answer space for `k` is `[1, max(piles)]`. For a given speed `k`, the total hours needed is `sum(ceil(p / k) for p in piles)`. This total hours function is monotonically decreasing as `k` increases. We want the smallest `k` where `total_hours <= h`. This is a classic "minimize the answer" binary search.

We compute `ceil(p / k)` as `(p + k - 1) // k` to avoid floating point.

### Solution

```python
class Solution:
    def minEatingSpeed(self, piles: list[int], h: int) -> int:
        lo, hi = 1, max(piles)

        while lo < hi:
            mid = lo + (hi - lo) // 2
            hours = sum((p + mid - 1) // mid for p in piles)
            if hours <= h:
                hi = mid       # mid speed is feasible, try slower
            else:
                lo = mid + 1   # mid speed is too slow

        return lo
```

**Time**: O(n * log(max(piles))), where `n` is the number of piles.
**Space**: O(1)
**Edge Cases**:
- `h == len(piles)` -- she must eat each pile in one hour, so answer is `max(piles)`.
- All piles have size 1 -- answer is 1.
- Single pile -- answer is `ceil(piles[0] / h)`.

---

## Problem 4. Find Minimum in Rotated Sorted Array (LC #153) - Medium

**Problem**: A sorted array of unique elements has been rotated between 1 and `n` times. Find the minimum element. Must run in O(log n) time.

**Pattern**: Modified binary search -- compare `mid` with `hi` to determine which half contains the minimum.

### Approach

In a rotated sorted array, one half is always properly sorted. The minimum lives at the "rotation point" where the array wraps around.

- If `nums[mid] > nums[hi]`, the rotation point (and thus the minimum) is in the right half. Set `lo = mid + 1`.
- If `nums[mid] <= nums[hi]`, the right half is sorted and the minimum is at `mid` or to its left. Set `hi = mid`.

We compare with `nums[hi]` rather than `nums[lo]` because it cleanly handles the case where the array is not rotated at all.

### Solution

```python
class Solution:
    def findMin(self, nums: list[int]) -> int:
        lo, hi = 0, len(nums) - 1

        while lo < hi:
            mid = lo + (hi - lo) // 2
            if nums[mid] > nums[hi]:
                lo = mid + 1   # min is in right half
            else:
                hi = mid       # min is at mid or left of mid

        return nums[lo]
```

**Time**: O(log n)
**Space**: O(1)
**Edge Cases**:
- Array is not rotated (already sorted) -- `nums[mid] <= nums[hi]` always, `hi` converges to 0.
- Array has only one element -- loop does not execute, returns `nums[0]`.
- Array rotated by 1 -- minimum is the last element; binary search converges to it.

---

## Problem 5. Search in Rotated Sorted Array (LC #33) - Medium

**Problem**: Given a rotated sorted array of distinct integers, search for a target value. Return its index or `-1`. Must run in O(log n).

**Pattern**: Modified binary search -- determine which half is sorted, then decide which half to search.

### Approach

At each step, at least one of the two halves `[lo..mid]` or `[mid..hi]` is sorted. We can identify the sorted half and check if the target falls within its range:

1. If `nums[lo] <= nums[mid]`, the left half is sorted.
   - If `nums[lo] <= target < nums[mid]`, search left: `hi = mid - 1`.
   - Otherwise, search right: `lo = mid + 1`.
2. Else, the right half is sorted.
   - If `nums[mid] < target <= nums[hi]`, search right: `lo = mid + 1`.
   - Otherwise, search left: `hi = mid - 1`.

### Solution

```python
class Solution:
    def search(self, nums: list[int], target: int) -> int:
        lo, hi = 0, len(nums) - 1

        while lo <= hi:
            mid = lo + (hi - lo) // 2
            if nums[mid] == target:
                return mid

            # Left half is sorted
            if nums[lo] <= nums[mid]:
                if nums[lo] <= target < nums[mid]:
                    hi = mid - 1
                else:
                    lo = mid + 1
            # Right half is sorted
            else:
                if nums[mid] < target <= nums[hi]:
                    lo = mid + 1
                else:
                    hi = mid - 1

        return -1
```

**Time**: O(log n)
**Space**: O(1)
**Edge Cases**:
- Target is at the rotation point -- handled by the `nums[mid] == target` check.
- No rotation -- degenerates to standard binary search since the left half is always sorted.
- Two-element array -- one iteration determines the answer.
- Target does not exist -- `lo` crosses `hi` and we return `-1`.

---

## Problem 6. Find First and Last Position of Element in Sorted Array (LC #34) - Medium

**Problem**: Given a sorted array of integers, find the starting and ending position of a given target value. If the target is not found, return `[-1, -1]`. Must run in O(log n).

**Pattern**: Two binary searches -- left-bound (Template 2) + right-bound (Template 3).

### Approach

Run two separate binary searches:

1. **Find leftmost**: Search for the first index where `nums[i] >= target`. If `nums[lo] != target`, the target does not exist.
2. **Find rightmost**: Search for the last index where `nums[i] <= target`.

Each search is O(log n), so the overall complexity is O(log n).

### Solution

```python
class Solution:
    def searchRange(self, nums: list[int], target: int) -> list[int]:
        if not nums:
            return [-1, -1]

        # Find leftmost occurrence
        lo, hi = 0, len(nums) - 1
        while lo <= hi:
            mid = lo + (hi - lo) // 2
            if nums[mid] < target:
                lo = mid + 1
            else:
                hi = mid - 1
        left = lo

        # Check if target exists
        if left >= len(nums) or nums[left] != target:
            return [-1, -1]

        # Find rightmost occurrence
        lo, hi = left, len(nums) - 1
        while lo <= hi:
            mid = lo + (hi - lo) // 2
            if nums[mid] <= target:
                lo = mid + 1
            else:
                hi = mid - 1
        right = hi

        return [left, right]
```

**Time**: O(log n)
**Space**: O(1)
**Edge Cases**:
- Empty array -- return `[-1, -1]` immediately.
- Target appears once -- `left == right`.
- All elements are the target -- returns `[0, n-1]`.
- Target not present -- `left` lands out of bounds or on a different value.

---

## Problem 7. Median of Two Sorted Arrays (LC #4) - Hard

**Problem**: Given two sorted arrays `nums1` (size `m`) and `nums2` (size `n`), return the median of the combined sorted array. Must run in O(log(min(m, n))).

**Pattern**: Binary search on partition position of the smaller array.

### Approach

The median splits the merged array into two equal halves. Instead of actually merging, we binary search for the correct partition.

Let `A` be the smaller array (length `m`) and `B` be the larger (length `n`). We need to place `i` elements from `A` and `j = (m + n + 1) // 2 - i` elements from `B` into the left half.

A valid partition satisfies:
- `A[i-1] <= B[j]` (everything in left-A is <= everything in right-B)
- `B[j-1] <= A[i]` (everything in left-B is <= everything in right-A)

We binary search `i` in `[0, m]`:
- If `A[i-1] > B[j]`: `i` is too large, move left.
- If `B[j-1] > A[i]`: `i` is too small, move right.
- Otherwise: valid partition found.

The median is computed from the boundary elements of the partition.

### Solution

```python
class Solution:
    def findMedianSortedArrays(
        self, nums1: list[int], nums2: list[int]
    ) -> float:
        # Ensure A is the smaller array
        if len(nums1) > len(nums2):
            return self.findMedianSortedArrays(nums2, nums1)

        a, b = nums1, nums2
        m, n = len(a), len(b)
        half = (m + n + 1) // 2

        lo, hi = 0, m

        while lo <= hi:
            i = lo + (hi - lo) // 2   # elements from A in left half
            j = half - i               # elements from B in left half

            a_left = a[i - 1] if i > 0 else float("-inf")
            a_right = a[i] if i < m else float("inf")
            b_left = b[j - 1] if j > 0 else float("-inf")
            b_right = b[j] if j < n else float("inf")

            if a_left > b_right:
                hi = i - 1   # too many from A, move left
            elif b_left > a_right:
                lo = i + 1   # too few from A, move right
            else:
                # Valid partition found
                left_max = max(a_left, b_left)
                if (m + n) % 2 == 1:
                    return float(left_max)
                right_min = min(a_right, b_right)
                return (left_max + right_min) / 2.0

        return 0.0  # unreachable for valid input
```

**Time**: O(log(min(m, n)))
**Space**: O(1)
**Edge Cases**:
- One array is empty -- all elements come from the other array. The boundary sentinels (`-inf` / `inf`) handle this.
- Arrays of length 1 each -- single iteration determines the partition.
- All elements of one array are smaller than all elements of the other -- `i` goes to 0 or `m`.
- Even vs odd total length -- handled by the `(m + n) % 2` check.
- Identical elements in both arrays -- the `<=` comparisons handle ties correctly.

---

## Summary

| # | Problem | Difficulty | Pattern | Time |
|---|---------|-----------|---------|------|
| 704 | Binary Search | Easy | Standard | O(log n) |
| 74 | Search a 2D Matrix | Medium | Standard (virtual 1D) | O(log(mn)) |
| 875 | Koko Eating Bananas | Medium | Search on answer | O(n log max) |
| 153 | Find Min in Rotated Array | Medium | Modified (compare with hi) | O(log n) |
| 33 | Search in Rotated Array | Medium | Modified (identify sorted half) | O(log n) |
| 34 | First and Last Position | Medium | Left-bound + Right-bound | O(log n) |
| 4 | Median of Two Sorted Arrays | Hard | Partition binary search | O(log min(m,n)) |

**Key takeaways**:
- Problems 704, 74, 34 use the array directly as the search space.
- Problem 875 uses the answer value as the search space (search on answer).
- Problems 153 and 33 adapt binary search for rotated arrays by identifying the sorted half.
- Problem 4 uses binary search on the partition boundary -- the hardest template to internalize but extremely powerful.
