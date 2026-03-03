# Binary Search

Binary search is deceptively simple but notoriously tricky to get right. Off-by-one errors
in boundary conditions are the most common source of bugs. Master the templates here and
you will handle any binary search variant with confidence. Beyond sorted arrays, binary search
applies to any monotonic function -- this includes "search on answer" problems.

---

## 1. Core Concepts

### 1.1 Standard Binary Search

Divide the search space in half each iteration. Requires a **sorted** or **monotonic** input.

**Time:** O(log n)
**Space:** O(1)

### 1.2 Three Templates

**Template 1: Find exact target**

```python
def binary_search(nums: list[int], target: int) -> int:
    """Returns index of target, or -1 if not found."""
    left, right = 0, len(nums) - 1

    while left <= right:
        mid = left + (right - left) // 2
        if nums[mid] == target:
            return mid
        elif nums[mid] < target:
            left = mid + 1
        else:
            right = mid - 1

    return -1
```

**Template 2: Find left boundary (first occurrence)**

```python
def search_left(nums: list[int], target: int) -> int:
    """
    Returns index of first element >= target.
    Equivalent to bisect.bisect_left.
    """
    left, right = 0, len(nums)

    while left < right:
        mid = left + (right - left) // 2
        if nums[mid] < target:
            left = mid + 1
        else:
            right = mid

    return left
```

**Template 3: Find right boundary (last occurrence)**

```python
def search_right(nums: list[int], target: int) -> int:
    """
    Returns index of first element > target.
    Equivalent to bisect.bisect_right.
    """
    left, right = 0, len(nums)

    while left < right:
        mid = left + (right - left) // 2
        if nums[mid] <= target:
            left = mid + 1
        else:
            right = mid

    return left
```

### 1.3 When to Use Each Template

| Goal | Template | Condition | Returns |
|------|----------|-----------|---------|
| Find exact match | `left <= right` | `== target` | Index or -1 |
| First element >= target | `left < right` | `< target -> left = mid+1` | Insertion point |
| Last element <= target | `left < right` | `<= target -> left = mid+1` | `left - 1` |
| Minimize x where f(x) is True | `left < right` | `not f(mid) -> left = mid+1` | First True |

### 1.4 Python's bisect Module

```python
import bisect

nums = [1, 3, 5, 5, 5, 7, 9]

bisect.bisect_left(nums, 5)   # 2 -- first index where 5 could be inserted
bisect.bisect_right(nums, 5)  # 5 -- last index where 5 could be inserted
bisect.insort(nums, 6)        # insert 6 in sorted position
```

---

## 2. Classic Problems

### 2.1 Search in Rotated Sorted Array

**Problem:** A sorted array is rotated at an unknown pivot. Find the target's index in
O(log n).

**Approach:** At each step, one half is always sorted. Determine which half is sorted and
whether the target lies within it.

```python
def search_rotated(nums: list[int], target: int) -> int:
    """
    Search in rotated sorted array (no duplicates).

    Time:  O(log n)
    Space: O(1)
    """
    left, right = 0, len(nums) - 1

    while left <= right:
        mid = left + (right - left) // 2

        if nums[mid] == target:
            return mid

        # Left half is sorted
        if nums[left] <= nums[mid]:
            if nums[left] <= target < nums[mid]:
                right = mid - 1
            else:
                left = mid + 1
        # Right half is sorted
        else:
            if nums[mid] < target <= nums[right]:
                left = mid + 1
            else:
                right = mid - 1

    return -1
```

**With duplicates:** When `nums[left] == nums[mid]`, we can't determine which half is sorted.
Shrink: `left += 1`. Worst case becomes O(n).

```python
def search_rotated_dupes(nums: list[int], target: int) -> bool:
    """
    Search in rotated sorted array WITH duplicates.

    Time:  O(log n) average, O(n) worst case
    Space: O(1)
    """
    left, right = 0, len(nums) - 1

    while left <= right:
        mid = left + (right - left) // 2

        if nums[mid] == target:
            return True

        # Handle duplicates: can't determine sorted half
        if nums[left] == nums[mid]:
            left += 1
            continue

        if nums[left] <= nums[mid]:
            if nums[left] <= target < nums[mid]:
                right = mid - 1
            else:
                left = mid + 1
        else:
            if nums[mid] < target <= nums[right]:
                left = mid + 1
            else:
                right = mid - 1

    return False
```

---

### 2.2 Find Minimum in Rotated Sorted Array

**Problem:** Find the minimum element in a rotated sorted array (no duplicates).

**Approach:** Binary search for the inflection point where the sorted order breaks.

```python
def find_min(nums: list[int]) -> int:
    """
    Find minimum in rotated sorted array.

    Time:  O(log n)
    Space: O(1)
    """
    left, right = 0, len(nums) - 1

    while left < right:
        mid = left + (right - left) // 2

        if nums[mid] > nums[right]:
            # Minimum is in the right half
            left = mid + 1
        else:
            # Minimum is in the left half (including mid)
            right = mid

    return nums[left]
```

**Why compare with right, not left?** Comparing with `nums[left]` fails for the non-rotated
case (sorted array). Comparing with `nums[right]` works in all cases.

---

### 2.3 Search a 2D Matrix

**Problem:** Search for a target in an m x n matrix where each row is sorted and the first
element of each row is greater than the last element of the previous row.

**Approach:** Treat the 2D matrix as a 1D sorted array. Map index `mid` to `(mid // n, mid % n)`.

```python
def search_matrix(matrix: list[list[int]], target: int) -> bool:
    """
    Binary search on a sorted 2D matrix.

    Time:  O(log(m * n))
    Space: O(1)
    """
    if not matrix or not matrix[0]:
        return False

    m, n = len(matrix), len(matrix[0])
    left, right = 0, m * n - 1

    while left <= right:
        mid = left + (right - left) // 2
        val = matrix[mid // n][mid % n]

        if val == target:
            return True
        elif val < target:
            left = mid + 1
        else:
            right = mid - 1

    return False
```

---

### 2.4 Koko Eating Bananas (Binary Search on Answer)

**Problem:** Koko has `n` piles of bananas. She has `h` hours. Find the minimum eating speed
`k` (bananas/hour) to eat all bananas within `h` hours.

**Approach:** Binary search on the answer `k`. For each candidate speed, check if Koko can
finish in time. The search space is `[1, max(piles)]`.

```python
import math

def min_eating_speed(piles: list[int], h: int) -> int:
    """
    Minimum speed to eat all bananas in h hours.

    Time:  O(n * log(max(piles))) where n = len(piles)
    Space: O(1)
    """
    def can_finish(speed: int) -> bool:
        hours_needed = sum(math.ceil(pile / speed) for pile in piles)
        return hours_needed <= h

    left, right = 1, max(piles)

    while left < right:
        mid = left + (right - left) // 2
        if can_finish(mid):
            right = mid  # try slower speed
        else:
            left = mid + 1  # need faster speed

    return left
```

**Pattern recognition:** "Find the minimum/maximum value that satisfies a condition" almost
always maps to binary search on the answer.

---

### 2.5 Median of Two Sorted Arrays

**Problem:** Given two sorted arrays, find the median of the merged array in O(log(min(m,n))).

**Approach:** Binary search on the shorter array to find the correct partition point.

```python
def find_median_sorted_arrays(
    nums1: list[int], nums2: list[int]
) -> float:
    """
    Find median of two sorted arrays.

    Time:  O(log(min(m, n)))
    Space: O(1)
    """
    # Ensure nums1 is the shorter array
    if len(nums1) > len(nums2):
        nums1, nums2 = nums2, nums1

    m, n = len(nums1), len(nums2)
    half = (m + n + 1) // 2

    left, right = 0, m

    while left <= right:
        i = left + (right - left) // 2  # partition in nums1
        j = half - i                     # partition in nums2

        # Edge cases: partition at the boundary
        left1 = nums1[i - 1] if i > 0 else float('-inf')
        right1 = nums1[i] if i < m else float('inf')
        left2 = nums2[j - 1] if j > 0 else float('-inf')
        right2 = nums2[j] if j < n else float('inf')

        if left1 <= right2 and left2 <= right1:
            # Correct partition found
            if (m + n) % 2 == 1:
                return max(left1, left2)
            return (max(left1, left2) + min(right1, right2)) / 2
        elif left1 > right2:
            right = i - 1
        else:
            left = i + 1
```

**Key insight:** We partition both arrays such that all elements on the left side are less
than or equal to all elements on the right side. The partition in one array determines the
partition in the other.

---

## 3. Additional Important Problems

### 3.1 First Bad Version

```python
def first_bad_version(n: int) -> int:
    """
    Find first bad version using binary search.
    Time:  O(log n)
    Space: O(1)
    """
    left, right = 1, n
    while left < right:
        mid = left + (right - left) // 2
        if is_bad_version(mid):
            right = mid
        else:
            left = mid + 1
    return left
```

### 3.2 Find Peak Element

```python
def find_peak_element(nums: list[int]) -> int:
    """
    Find any peak element (greater than neighbors).
    Time:  O(log n)
    Space: O(1)
    """
    left, right = 0, len(nums) - 1

    while left < right:
        mid = left + (right - left) // 2
        if nums[mid] < nums[mid + 1]:
            left = mid + 1  # peak is on the right
        else:
            right = mid  # peak is on the left (or at mid)

    return left
```

### 3.3 Time Based Key-Value Store

```python
from collections import defaultdict
import bisect

class TimeMap:
    """
    Key-value store with timestamps. Get returns value at or before given time.

    set:  O(1)
    get:  O(log n)
    """

    def __init__(self):
        self.store = defaultdict(list)  # key -> [(timestamp, value)]

    def set(self, key: str, value: str, timestamp: int) -> None:
        self.store[key].append((timestamp, value))

    def get(self, key: str, timestamp: int) -> str:
        values = self.store[key]
        if not values:
            return ""

        # Binary search for largest timestamp <= given timestamp
        idx = bisect.bisect_right(values, (timestamp, chr(127))) - 1
        return values[idx][1] if idx >= 0 else ""
```

### 3.4 Split Array Largest Sum (Binary Search on Answer)

```python
def split_array(nums: list[int], k: int) -> int:
    """
    Minimize the largest sum among k subarrays.

    Time:  O(n * log(sum(nums)))
    Space: O(1)
    """
    def can_split(max_sum: int) -> bool:
        splits = 1
        current_sum = 0
        for num in nums:
            current_sum += num
            if current_sum > max_sum:
                splits += 1
                current_sum = num
                if splits > k:
                    return False
        return True

    left, right = max(nums), sum(nums)

    while left < right:
        mid = left + (right - left) // 2
        if can_split(mid):
            right = mid
        else:
            left = mid + 1

    return left
```

---

## 4. Common Interview Questions

| # | Problem | Difficulty | Variant | Key Insight |
|---|---------|-----------|---------|-------------|
| 1 | Binary Search | Easy | Standard | `left <= right`, shrink by 1 |
| 2 | First Bad Version | Easy | Left boundary | Find first True |
| 3 | Search Insert Position | Easy | Left boundary | `bisect_left` equivalent |
| 4 | Find Peak Element | Medium | Modified search | Compare `mid` with `mid+1` |
| 5 | Search Rotated Array | Medium | Two-phase | Identify sorted half |
| 6 | Find Min in Rotated Array | Medium | Inflection point | Compare `mid` with `right` |
| 7 | Search a 2D Matrix | Medium | Flatten matrix | `mid // n, mid % n` |
| 8 | Koko Eating Bananas | Medium | Search on answer | Binary search on speed |
| 9 | Time Based Key-Value Store | Medium | bisect_right | Largest timestamp <= target |
| 10 | Split Array Largest Sum | Hard | Search on answer | Binary search on max sum |
| 11 | Median of Two Sorted Arrays | Hard | Partition | Binary search on shorter array |

---

## 5. Gotchas

### 5.1 Off-by-One Errors
- **`left <= right` vs `left < right`**: Use `<=` when searching for exact match. Use `<` when
  searching for a boundary (left/right template).
- **`right = mid` vs `right = mid - 1`**: With `left < right`, use `right = mid`. With
  `left <= right`, use `right = mid - 1`.
- **Integer overflow**: `mid = left + (right - left) // 2` avoids overflow. Python handles big
  integers natively, but this is critical in Java/C++.

### 5.2 Infinite Loops
- If `left = mid` (not `mid + 1`) with `while left < right`, you risk infinite loops when
  `left == right - 1` and the condition keeps choosing `left = mid`.
- **Fix**: Use `mid = left + (right - left + 1) // 2` (ceiling division) when `left = mid`.

### 5.3 Rotated Array Gotchas
- **Duplicates change complexity**: With duplicates, worst case is O(n) because you can't
  determine the sorted half.
- **Compare with right, not left**: For `findMin`, comparing `nums[mid]` with `nums[right]`
  handles the non-rotated case correctly.

### 5.4 Binary Search on Answer Gotchas
- **Search space**: Make sure `left` and `right` cover all possible answers.
- **Monotonic condition**: The condition must be monotonic (once True, stays True; or once
  False, stays False). Otherwise binary search doesn't work.
- **Feasibility function**: Implement it correctly. This is where most bugs are.

### 5.5 Python-Specific
- `//` is floor division (rounds toward negative infinity). For positive numbers, same as
  truncation. For negative, `-7 // 2 = -4` (not -3).
- `bisect_left` and `bisect_right` assume the list is sorted. They return insertion points.
- `math.ceil(a / b)` can also be written as `(a + b - 1) // b` for integers.

---

## 6. Quick Reference

| Pattern | When to Use | Time | Template | Key Decision |
|---------|-------------|------|----------|-------------|
| Standard search | Find exact target | O(log n) | `left <= right` | `== target` returns |
| Left boundary | First occurrence / insert position | O(log n) | `left < right` | `nums[mid] < target -> left = mid+1` |
| Right boundary | Last occurrence | O(log n) | `left < right` | `nums[mid] <= target -> left = mid+1` |
| Rotated array | Search in rotated sorted | O(log n) | `left <= right` | Identify sorted half |
| Find minimum | Min in rotated array | O(log n) | `left < right` | Compare mid with right |
| Search on answer | Min/max satisfying condition | O(n * log range) | `left < right` | Feasibility check function |
| 2D matrix search | Sorted matrix | O(log(m*n)) | `left <= right` | `mid // n, mid % n` |
| Median of two arrays | Two sorted arrays | O(log min(m,n)) | Partition-based | Binary search on partition |
