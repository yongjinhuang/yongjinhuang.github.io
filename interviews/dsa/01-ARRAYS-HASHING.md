# Arrays & Hashing

Arrays and hash maps are the foundation of nearly every coding interview. Mastering these
patterns -- two pointers, sliding window, prefix sums, and hash maps -- will let you solve
the majority of array-based problems efficiently.

---

## 1. Core Concepts

### 1.1 Hash Maps (Dictionaries)

A hash map provides O(1) average-case lookup, insert, and delete. In Python, `dict` and
`collections.defaultdict` are your primary tools.

**When to use a hash map:**

- You need to count frequencies
- You need to check membership quickly
- You need to map one value to another
- You need to find pairs/groups with a target property

```python
from collections import defaultdict, Counter

# Frequency counting
nums = [1, 2, 2, 3, 3, 3]
freq = Counter(nums)  # Counter({3: 3, 2: 2, 1: 1})

# Grouping by key
groups = defaultdict(list)
for word in ["eat", "tea", "tan", "ate", "nat", "bat"]:
    key = tuple(sorted(word))
    groups[key].append(word)
```

### 1.2 Two Pointers

Use two pointers when the input is sorted (or can be sorted) and you need to find pairs or
subarrays satisfying a condition.

**Patterns:**

- **Opposite ends**: Left starts at 0, right starts at end. Move inward.
- **Same direction**: Both start at 0 (or same side). Fast pointer advances; slow pointer follows.
- **Partition**: Rearrange elements in-place based on a condition.

### 1.3 Sliding Window

A sliding window maintains a "window" (contiguous subarray) that expands or contracts.
Use this when the problem asks about contiguous subarrays or substrings.

**Template:**

```python
def sliding_window(arr):
    left = 0
    window_state = {}  # or a counter, sum, etc.
    result = 0

    for right in range(len(arr)):
        # 1. Expand: add arr[right] to window state
        # ...

        # 2. Contract: while window is invalid, shrink from left
        while window_is_invalid(window_state):
            # remove arr[left] from window state
            left += 1

        # 3. Update result
        result = max(result, right - left + 1)

    return result
```

### 1.4 Prefix Sums

A prefix sum array stores cumulative sums, enabling O(1) range sum queries after O(n)
preprocessing.

```python
# Build prefix sum
nums = [1, 2, 3, 4, 5]
prefix = [0] * (len(nums) + 1)
for i in range(len(nums)):
    prefix[i + 1] = prefix[i] + nums[i]
# prefix = [0, 1, 3, 6, 10, 15]

# Sum of nums[i..j] inclusive = prefix[j+1] - prefix[i]
# Sum of nums[1..3] = prefix[4] - prefix[1] = 10 - 1 = 9
```

---

## 2. Classic Problems

### 2.1 Two Sum

**Problem:** Given an array of integers and a target, return indices of two numbers that add
up to the target. Exactly one solution exists.

**Approach:** Use a hash map to store each number's index as you iterate. For each number,
check if `target - num` already exists in the map.

```python
def two_sum(nums: list[int], target: int) -> list[int]:
    """
    Find two indices whose values sum to target.

    Time:  O(n) -- single pass through the array
    Space: O(n) -- hash map stores up to n entries
    """
    seen = {}  # value -> index

    for i, num in enumerate(nums):
        complement = target - num
        if complement in seen:
            return [seen[complement], i]
        seen[num] = i

    return []  # problem guarantees a solution exists
```

**Why not sort + two pointers?** Sorting loses original indices. You would need to store
(value, index) pairs, adding complexity. The hash map approach is cleaner.

---

### 2.2 Container With Most Water

**Problem:** Given heights `height[0..n-1]`, find two lines that together with the x-axis
form a container holding the most water.

**Approach:** Two pointers at opposite ends. The area is `min(height[left], height[right]) *
(right - left)`. Move the shorter line inward -- keeping the shorter line can never increase
the area.

```python
def max_area(height: list[int]) -> int:
    """
    Find maximum water container area.

    Time:  O(n) -- each pointer moves at most n times
    Space: O(1) -- only two pointers
    """
    left, right = 0, len(height) - 1
    best = 0

    while left < right:
        width = right - left
        h = min(height[left], height[right])
        best = max(best, width * h)

        # Move the shorter side inward
        if height[left] < height[right]:
            left += 1
        else:
            right -= 1

    return best
```

**Why move the shorter side?** Moving the taller side can only decrease or maintain the
height constraint (since area is limited by the shorter side), and the width always decreases.
Moving the shorter side at least gives a chance of finding a taller line.

---

### 2.3 Group Anagrams

**Problem:** Given an array of strings, group anagrams together.

**Approach:** Two strings are anagrams if they have the same character frequency. Use a
sorted tuple (or character count tuple) as the hash map key.

```python
from collections import defaultdict

def group_anagrams(strs: list[str]) -> list[list[str]]:
    """
    Group strings that are anagrams of each other.

    Time:  O(n * k log k) where k is max string length (due to sorting)
    Space: O(n * k) -- storing all strings in groups
    """
    groups = defaultdict(list)

    for s in strs:
        key = tuple(sorted(s))
        groups[key].append(s)

    return list(groups.values())


def group_anagrams_optimal(strs: list[str]) -> list[list[str]]:
    """
    Optimal version using character count as key.

    Time:  O(n * k) where k is max string length
    Space: O(n * k)
    """
    groups = defaultdict(list)

    for s in strs:
        count = [0] * 26
        for c in s:
            count[ord(c) - ord('a')] += 1
        groups[tuple(count)].append(s)

    return list(groups.values())
```

---

### 2.4 Longest Consecutive Sequence

**Problem:** Given an unsorted array of integers, find the length of the longest consecutive
elements sequence. Must run in O(n) time.

**Approach:** Put all numbers in a set. For each number that is the _start_ of a sequence
(i.e., `num - 1` not in set), count how far the sequence extends.

```python
def longest_consecutive(nums: list[int]) -> int:
    """
    Find length of longest consecutive sequence.

    Time:  O(n) -- each number is visited at most twice
    Space: O(n) -- the set
    """
    num_set = set(nums)
    best = 0

    for num in num_set:
        # Only start counting from the beginning of a sequence
        if num - 1 not in num_set:
            current = num
            length = 1

            while current + 1 in num_set:
                current += 1
                length += 1

            best = max(best, length)

    return best
```

**Key insight:** The `if num - 1 not in num_set` check ensures we only start counting from
sequence beginnings, preventing redundant work and keeping total time at O(n).

---

### 2.5 Product of Array Except Self

**Problem:** Given an integer array `nums`, return an array where `answer[i]` is the product
of all elements except `nums[i]`. You must not use division.

**Approach:** Build prefix products from the left and suffix products from the right. The
answer at index `i` is `left_product[i] * right_product[i]`.

```python
def product_except_self(nums: list[int]) -> list[int]:
    """
    Product of array except self without division.

    Time:  O(n) -- two passes
    Space: O(1) -- output array doesn't count as extra space
    """
    n = len(nums)
    answer = [1] * n

    # Pass 1: left products
    left_product = 1
    for i in range(n):
        answer[i] = left_product
        left_product *= nums[i]

    # Pass 2: right products
    right_product = 1
    for i in range(n - 1, -1, -1):
        answer[i] *= right_product
        right_product *= nums[i]

    return answer
```

**Why not use division?** The problem explicitly forbids it. Even if it didn't, division
fails when zeros are present.

---

### 2.6 Minimum Window Substring

**Problem:** Given strings `s` and `t`, find the minimum window substring of `s` that
contains all characters of `t`. If no such window exists, return "".

**Approach:** Sliding window with a character frequency map. Expand right to include
characters; contract left when all characters of `t` are covered.

```python
from collections import Counter

def min_window(s: str, t: str) -> str:
    """
    Find minimum window in s containing all characters of t.

    Time:  O(|s| + |t|) -- each character visited at most twice
    Space: O(|s| + |t|) -- frequency maps
    """
    if not t or not s:
        return ""

    t_count = Counter(t)
    required = len(t_count)  # number of unique chars in t

    # Current window character counts
    window_counts = {}
    formed = 0  # number of unique chars in window with desired frequency

    # Result: (window length, left, right)
    result = (float("inf"), 0, 0)

    left = 0
    for right in range(len(s)):
        # Expand window
        char = s[right]
        window_counts[char] = window_counts.get(char, 0) + 1

        # Check if current char satisfies the frequency requirement
        if char in t_count and window_counts[char] == t_count[char]:
            formed += 1

        # Contract window while all requirements are met
        while formed == required and left <= right:
            # Update result if this window is smaller
            window_len = right - left + 1
            if window_len < result[0]:
                result = (window_len, left, right)

            # Remove leftmost character
            leaving = s[left]
            window_counts[leaving] -= 1
            if leaving in t_count and window_counts[leaving] < t_count[leaving]:
                formed -= 1
            left += 1

    return "" if result[0] == float("inf") else s[result[1]:result[2] + 1]
```

**Optimization note:** You can filter `s` to only include characters present in `t` for
a speedup when `|s| >> |t|` and `s` has many irrelevant characters.

---

## 3. Additional Important Problems

### 3.1 Valid Anagram

```python
def is_anagram(s: str, t: str) -> bool:
    """
    Time:  O(n)
    Space: O(1) -- at most 26 characters
    """
    return Counter(s) == Counter(t)
```

### 3.2 Contains Duplicate

```python
def contains_duplicate(nums: list[int]) -> bool:
    """
    Time:  O(n)
    Space: O(n)
    """
    return len(nums) != len(set(nums))
```

### 3.3 Top K Frequent Elements

```python
from collections import Counter

def top_k_frequent(nums: list[int], k: int) -> list[int]:
    """
    Bucket sort approach -- O(n) time.

    Time:  O(n)
    Space: O(n)
    """
    count = Counter(nums)
    # Bucket: index = frequency, value = list of numbers with that frequency
    buckets = [[] for _ in range(len(nums) + 1)]

    for num, freq in count.items():
        buckets[freq].append(num)

    result = []
    for freq in range(len(buckets) - 1, -1, -1):
        for num in buckets[freq]:
            result.append(num)
            if len(result) == k:
                return result

    return result
```

### 3.4 Encode and Decode Strings

```python
def encode(strs: list[str]) -> str:
    """Encode a list of strings to a single string."""
    return "".join(f"{len(s)}#{s}" for s in strs)

def decode(s: str) -> list[str]:
    """Decode a single string back to a list of strings."""
    result = []
    i = 0
    while i < len(s):
        j = s.index("#", i)
        length = int(s[i:j])
        result.append(s[j + 1:j + 1 + length])
        i = j + 1 + length
    return result
```

### 3.5 Subarray Sum Equals K

```python
def subarray_sum(nums: list[int], k: int) -> int:
    """
    Count subarrays with sum equal to k using prefix sum + hash map.

    Time:  O(n)
    Space: O(n)
    """
    count = 0
    prefix_sum = 0
    prefix_counts = {0: 1}  # base case: empty prefix

    for num in nums:
        prefix_sum += num
        # If (prefix_sum - k) was seen before, those subarrays sum to k
        count += prefix_counts.get(prefix_sum - k, 0)
        prefix_counts[prefix_sum] = prefix_counts.get(prefix_sum, 0) + 1

    return count
```

---

## 4. Common Interview Questions

| #   | Problem                      | Difficulty | Pattern          | Key Insight             |
| --- | ---------------------------- | ---------- | ---------------- | ----------------------- |
| 1   | Two Sum                      | Easy       | Hash map         | Complement lookup       |
| 2   | Valid Anagram                | Easy       | Hash map         | Character frequency     |
| 3   | Contains Duplicate           | Easy       | Hash set         | Set size comparison     |
| 4   | Group Anagrams               | Medium     | Hash map         | Sorted string as key    |
| 5   | Top K Frequent Elements      | Medium     | Bucket sort      | Frequency buckets       |
| 6   | Product of Array Except Self | Medium     | Prefix/suffix    | Left-right product      |
| 7   | Longest Consecutive Sequence | Medium     | Hash set         | Start-of-sequence check |
| 8   | Container With Most Water    | Medium     | Two pointers     | Move shorter side       |
| 9   | Subarray Sum Equals K        | Medium     | Prefix sum + map | Prefix difference       |
| 10  | Minimum Window Substring     | Hard       | Sliding window   | Expand/contract         |

---

## 5. Gotchas

### 5.1 Hash Map Key Gotchas

- **Lists are not hashable** in Python. Convert to `tuple` before using as dict keys.
- `defaultdict(int)` returns 0 for missing keys, not `None`.
- `Counter` supports subtraction: `Counter(a) - Counter(b)` removes zero/negative counts.

### 5.2 Two Pointers Gotchas

- **Sorted input required** for the opposite-ends pattern. If unsorted, sort first (adds
  O(n log n)) or use a hash map instead.
- Off-by-one errors: be clear whether boundaries are inclusive or exclusive.
- Duplicate handling: when the problem says "unique pairs," skip duplicate values.

### 5.3 Sliding Window Gotchas

- Only works for **contiguous** subarrays/substrings.
- **Fixed-size** window: no contraction needed, just slide.
- **Variable-size** window: contract only when the window becomes invalid.
- Don't forget to update the window state when contracting (removing left element).

### 5.4 Prefix Sum Gotchas

- Initialize with `prefix[0] = 0` (empty prefix) to handle subarrays starting at index 0.
- For the "count subarrays with sum k" pattern, the hash map must start with `{0: 1}`.
- Prefix sums work for addition; for multiplication, use prefix products (watch for zeros).

### 5.5 Python-Specific Gotchas

- `list.sort()` sorts in-place and returns `None`. `sorted()` returns a new list.
- Negative indexing: `nums[-1]` is the last element.
- `range(n-1, -1, -1)` iterates from `n-1` down to `0` inclusive.
- Integer overflow is not an issue in Python (arbitrary precision), but it matters in other languages.

---

## 6. Quick Reference

| Pattern                   | When to Use                                   | Time    | Space   | Template                                            |
| ------------------------- | --------------------------------------------- | ------- | ------- | --------------------------------------------------- |
| Hash map lookup           | Find pairs, count frequency, check membership | O(n)    | O(n)    | `seen = {}; for x: check complement`                |
| Two pointers (opposite)   | Sorted array, find pair with target sum       | O(n)    | O(1)    | `left=0, right=n-1; move based on sum`              |
| Two pointers (same dir)   | Remove duplicates, partition                  | O(n)    | O(1)    | `slow=0; for fast: conditionally advance slow`      |
| Sliding window (variable) | Longest/shortest subarray with condition      | O(n)    | O(k)    | `left=0; for right: expand, contract while invalid` |
| Sliding window (fixed)    | Subarray of exact size k                      | O(n)    | O(1)    | `for right: add right, remove left when size > k`   |
| Prefix sum                | Range sum queries, subarray sum = k           | O(n)    | O(n)    | `prefix[i+1] = prefix[i] + nums[i]`                 |
| Bucket sort               | Top-K frequency                               | O(n)    | O(n)    | `buckets[freq].append(val)`                         |
| Character count key       | Group by anagram/permutation                  | O(n\*k) | O(n\*k) | `tuple(sorted(s))` or count array as key            |
