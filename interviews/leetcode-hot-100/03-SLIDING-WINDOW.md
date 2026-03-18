# Sliding Window

## Pattern Overview

The **Sliding Window** pattern maintains a window (subarray/substring) over a sequence and slides it to find an optimal result. It converts brute-force O(n^2) or O(n^3) solutions into O(n) by reusing computation from the previous window position.

There are two main variants:

### Fixed-Size Window

```python
for i in range(len(nums)):
    # Expand: add nums[i] to window
    window_sum += nums[i]
    # Shrink: once window exceeds size k
    if i >= k:
        window_sum -= nums[i - k]
    # Update answer once window is valid
    if i >= k - 1:
        result = max(result, window_sum)
```

### Variable-Size (Expand/Contract) Template

```python
def sliding_window(s: str) -> int:
    left = 0
    result = 0
    window: dict[str, int] = {}

    for right in range(len(s)):
        # 1. EXPAND: add s[right] into the window
        window[s[right]] = window.get(s[right], 0) + 1

        # 2. CONTRACT: shrink window while it violates the constraint
        while window_is_invalid():
            window[s[left]] -= 1
            if window[s[left]] == 0:
                del window[s[left]]
            left += 1

        # 3. UPDATE: record the best answer from the current valid window
        result = max(result, right - left + 1)

    return result
```

**When to use Sliding Window:**
- Find min/max subarray or substring satisfying a condition
- Contiguous sequence problems
- String permutation or anagram matching
- Problems mentioning "consecutive" or "contiguous"

**Key decisions:**
- What data structure tracks the window state? (hashmap, counter, variable)
- When is the window invalid? (determines the shrink condition)
- When do you update the answer? (after shrink, or inside the loop)

---

## Problem 1. Best Time to Buy and Sell Stock (LC #121) - Easy

**Problem**: Given an array `prices` where `prices[i]` is the price of a stock on day `i`, find the maximum profit from one buy-sell transaction. You must buy before you sell.

**Pattern**: Sliding window / one-pass minimum tracking. Track the minimum price seen so far (left boundary) and compute profit at each step (right boundary).

### Approach

Iterate through prices while maintaining the minimum price seen so far. At each day, the maximum profit ending at that day is `price - min_price_so_far`. This is equivalent to a sliding window where the left boundary jumps to a new minimum whenever one is found.

### Solution

```python
def max_profit(prices: list[int]) -> int:
    min_price = float('inf')
    max_profit = 0

    for price in prices:
        min_price = min(min_price, price)
        max_profit = max(max_profit, price - min_price)

    return max_profit
```

**Time**: O(n) -- single pass through the array.
**Space**: O(1) -- only two variables.
**Edge Cases**:
- Prices in strictly decreasing order -- profit is 0 (never sell).
- Array of length 1 -- profit is 0.
- All prices equal -- profit is 0.
- Minimum price is on the last day -- profit is 0.

---

## Problem 2. Longest Substring Without Repeating Characters (LC #3) - Medium

**Problem**: Given a string `s`, find the length of the longest substring without repeating characters.

**Pattern**: Variable-size sliding window with a set/hashmap tracking characters in the current window.

### Approach

Expand the right pointer one character at a time. If the character already exists in the window, contract from the left until the duplicate is removed. The window always contains unique characters, so update the result at each step.

### Solution

```python
def length_of_longest_substring(s: str) -> int:
    char_index: dict[str, int] = {}
    left = 0
    result = 0

    for right, char in enumerate(s):
        if char in char_index and char_index[char] >= left:
            left = char_index[char] + 1
        char_index[char] = right
        result = max(result, right - left + 1)

    return result
```

**Time**: O(n) -- each character is visited at most twice.
**Space**: O(min(n, m)) -- where m is the size of the character set.
**Edge Cases**:
- Empty string -- return 0.
- All identical characters (e.g., "aaaa") -- return 1.
- All unique characters -- return len(s).
- String of length 1 -- return 1.

---

## Problem 3. Longest Repeating Character Replacement (LC #424) - Medium

**Problem**: Given a string `s` and an integer `k`, you can change at most `k` characters in `s`. Find the length of the longest substring containing the same letter after performing at most `k` replacements.

**Pattern**: Variable-size sliding window. The window is valid when `window_size - max_frequency <= k` (the number of characters to replace is within budget).

### Approach

Maintain a frequency count of characters in the window. The key insight: a window of size `right - left + 1` is valid if `(right - left + 1) - max_freq <= k`. If invalid, shrink from the left. We do not need to decrease `max_freq` when shrinking because the window size only matters when it exceeds a previous best -- so a stale `max_freq` never produces a wrong answer, it just prevents the window from growing until a genuinely better frequency is found.

### Solution

```python
def character_replacement(s: str, k: int) -> int:
    freq: dict[str, int] = {}
    left = 0
    max_freq = 0
    result = 0

    for right, char in enumerate(s):
        freq[char] = freq.get(char, 0) + 1
        max_freq = max(max_freq, freq[char])

        # Window is invalid: characters to replace exceed k
        if (right - left + 1) - max_freq > k:
            freq[s[left]] -= 1
            left += 1

        result = max(result, right - left + 1)

    return result
```

**Time**: O(n) -- single pass; left pointer moves at most n times.
**Space**: O(1) -- frequency map has at most 26 entries.
**Edge Cases**:
- k >= len(s) -- entire string is the answer.
- k == 0 -- find longest run of a single character.
- String of length 1 -- return 1.
- All same characters -- return len(s).

---

## Problem 4. Permutation in String (LC #567) - Medium

**Problem**: Given two strings `s1` and `s2`, return `True` if `s2` contains a permutation of `s1` (i.e., a substring of `s2` is an anagram of `s1`).

**Pattern**: Fixed-size sliding window of length `len(s1)` over `s2`, comparing character frequency counts.

### Approach

Build a frequency count of `s1`. Slide a window of size `len(s1)` over `s2`, maintaining a frequency count of the window. Track how many distinct characters have matching frequencies between the window and `s1`. When all characters match, return True.

### Solution

```python
from collections import Counter


def check_inclusion(s1: str, s2: str) -> bool:
    if len(s1) > len(s2):
        return False

    s1_count = Counter(s1)
    window_count: dict[str, int] = {}
    matches = 0
    target_keys = set(s1_count.keys())

    # Count how many keys have matching counts (initially both are 0 for non-s1 chars)
    # We only track characters that appear in s1
    for right in range(len(s2)):
        # Expand: add s2[right]
        char = s2[right]
        window_count[char] = window_count.get(char, 0) + 1
        if char in target_keys:
            if window_count[char] == s1_count[char]:
                matches += 1
            elif window_count[char] == s1_count[char] + 1:
                matches -= 1

        # Shrink: remove leftmost when window exceeds s1 length
        if right >= len(s1):
            left_char = s2[right - len(s1)]
            if left_char in target_keys:
                if window_count[left_char] == s1_count[left_char]:
                    matches += 1  # Will become under-count, but we subtract below
                    # Actually: before removal it matched, after removal it won't
                    matches -= 1
                    # Let's re-think: check before decrement
            window_count[left_char] -= 1
            if left_char in target_keys:
                # Recompute: we need to check transitions
                pass

        if matches == len(target_keys):
            return True

    return False
```

The above gets complicated with transition tracking. Here is a cleaner version:

```python
from collections import Counter


def check_inclusion(s1: str, s2: str) -> bool:
    if len(s1) > len(s2):
        return False

    s1_count = Counter(s1)
    window_count = Counter(s2[: len(s1)])

    if s1_count == window_count:
        return True

    for right in range(len(s1), len(s2)):
        # Add new character on the right
        window_count[s2[right]] += 1

        # Remove character leaving on the left
        left_char = s2[right - len(s1)]
        window_count[left_char] -= 1
        if window_count[left_char] == 0:
            del window_count[left_char]

        if s1_count == window_count:
            return True

    return False
```

**Time**: O(n) -- where n = len(s2). Counter comparison is O(26) = O(1) for lowercase letters.
**Space**: O(1) -- counters hold at most 26 keys.
**Edge Cases**:
- s1 longer than s2 -- return False.
- s1 and s2 are identical -- return True.
- s1 is a single character -- check if it exists in s2.
- s2 contains no characters from s1 -- return False.

---

## Problem 5. Minimum Window Substring (LC #76) - Hard

**Problem**: Given strings `s` and `t`, find the minimum window substring of `s` that contains all characters of `t` (including duplicates). Return `""` if no such window exists.

**Pattern**: Variable-size sliding window with expand/contract. Expand to satisfy the constraint, then contract to minimize.

### Approach

Use a frequency map for `t`. Expand the right pointer, adding characters to the window. Track `formed` -- the number of unique characters in `t` whose required frequency is met in the window. Once `formed == required`, contract from the left to find the smallest valid window, updating the answer each time.

### Solution

```python
from collections import Counter


def min_window(s: str, t: str) -> str:
    if not s or not t or len(s) < len(t):
        return ""

    t_count = Counter(t)
    required = len(t_count)

    window_count: dict[str, int] = {}
    formed = 0
    left = 0
    best: tuple[int, int, int] = (float('inf'), 0, 0)  # (length, left, right)

    for right, char in enumerate(s):
        # Expand
        window_count[char] = window_count.get(char, 0) + 1

        if char in t_count and window_count[char] == t_count[char]:
            formed += 1

        # Contract
        while formed == required:
            window_len = right - left + 1
            if window_len < best[0]:
                best = (window_len, left, right)

            left_char = s[left]
            window_count[left_char] -= 1
            if left_char in t_count and window_count[left_char] < t_count[left_char]:
                formed -= 1
            left += 1

    return "" if best[0] == float('inf') else s[best[1] : best[2] + 1]
```

**Time**: O(n + m) -- where n = len(s), m = len(t). Each character in s is visited at most twice (once by right, once by left).
**Space**: O(n + m) -- window_count can have up to n keys, t_count has up to m keys. In practice O(1) if charset is fixed (e.g., 128 ASCII).
**Edge Cases**:
- t is longer than s -- return "".
- s equals t -- return s.
- t has duplicate characters (e.g., t = "AA") -- window must contain at least 2 A's.
- No valid window exists -- return "".
- Minimum window is the entire string s.

---

## Problem 6. Sliding Window Maximum (LC #239) - Hard

**Problem**: Given an array `nums` and a sliding window of size `k`, return the max value in each window as the window moves from left to right.

**Pattern**: Monotonic deque. Maintain a deque of indices where values are in decreasing order. The front of the deque is always the maximum of the current window.

### Approach

Use a deque that stores indices. For each new element:
1. Remove indices from the back while the deque's back value is less than or equal to the current value (they can never be the max).
2. Add the current index to the back.
3. Remove the front if it falls outside the current window.
4. Once the window has reached size k, the front of the deque is the maximum.

### Solution

```python
from collections import deque


def max_sliding_window(nums: list[int], k: int) -> list[int]:
    dq: deque[int] = deque()  # stores indices, values are decreasing
    result: list[int] = []

    for i, num in enumerate(nums):
        # Remove elements smaller than current from the back
        while dq and nums[dq[-1]] <= num:
            dq.pop()

        dq.append(i)

        # Remove front if outside window
        if dq[0] <= i - k:
            dq.popleft()

        # Window has reached size k: record the max
        if i >= k - 1:
            result.append(nums[dq[0]])

    return result
```

**Time**: O(n) -- each element is pushed and popped from the deque at most once.
**Space**: O(k) -- the deque holds at most k indices.
**Edge Cases**:
- k == 1 -- return the original array.
- k == len(nums) -- return a single-element list with the global max.
- All elements equal -- every window max is that value.
- Array in strictly decreasing order -- deque always has only the front element surviving.
- Array in strictly increasing order -- deque is cleared on every insertion.

---

## Summary Table

| # | Problem | Difficulty | Window Type | Key Data Structure | Time | Space |
|---|---------|-----------|-------------|-------------------|------|-------|
| 121 | Best Time to Buy and Sell Stock | Easy | Variable (implicit) | Min tracker | O(n) | O(1) |
| 3 | Longest Substring Without Repeating | Medium | Variable | HashMap (char -> index) | O(n) | O(min(n,m)) |
| 424 | Longest Repeating Character Replacement | Medium | Variable | Frequency map | O(n) | O(1) |
| 567 | Permutation in String | Medium | Fixed | Counter / frequency map | O(n) | O(1) |
| 76 | Minimum Window Substring | Hard | Variable (contract) | Counter + formed count | O(n+m) | O(n+m) |
| 239 | Sliding Window Maximum | Hard | Fixed | Monotonic deque | O(n) | O(k) |
