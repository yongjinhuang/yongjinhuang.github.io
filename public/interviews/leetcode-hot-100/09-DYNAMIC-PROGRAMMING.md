# Dynamic Programming - LeetCode Hot 100

## Overview

Dynamic Programming (DP) solves problems by breaking them into overlapping subproblems and caching results to avoid redundant computation.

### Top-Down vs Bottom-Up

| Approach | Description | Pros | Cons |
|----------|-------------|------|------|
| **Top-Down (Memoization)** | Recursive with cache; start from the original problem and break down | Intuitive; only computes needed states | Recursion overhead; stack depth limits |
| **Bottom-Up (Tabulation)** | Iterative; build solutions from smallest subproblems up | No recursion overhead; often space-optimizable | Must determine computation order; may compute unneeded states |

### State Definition Checklist

1. **What decision am I making at each step?** This determines the recurrence.
2. **What information do I need to make that decision?** This determines the state dimensions.
3. **What is the base case?** The smallest subproblem with a known answer.
4. **What is the transition?** How does a state relate to smaller states?
5. **Can I reduce space?** If `dp[i]` only depends on `dp[i-1]` (or a fixed window), use rolling variables.

### Common DP Patterns

- **Linear DP**: `dp[i]` depends on previous elements in a 1D sequence (Climbing Stairs, House Robber, LIS)
- **Kadane's Algorithm**: Special case of linear DP tracking max subarray ending at each index
- **Knapsack / Subset Sum**: Choose items with constraints (Coin Change, Partition Equal Subset Sum)
- **String DP**: 2D table over string indices (Edit Distance, Palindromic Substring, Word Break)
- **Grid DP**: 2D table over grid coordinates (Unique Paths)
- **Greedy-DP Hybrid**: DP insight enables a greedy scan (Jump Game)

---

## Problem 1. Climbing Stairs (LC #70) - Easy

**Problem**: You are climbing a staircase with `n` steps. Each time you can climb 1 or 2 steps. Return the number of distinct ways to reach the top.

**Pattern**: Linear DP (Fibonacci variant)

### Approach

- **State**: `dp[i]` = number of ways to reach step `i`.
- **Recurrence**: `dp[i] = dp[i - 1] + dp[i - 2]` because you arrive from one step below or two steps below.
- **Base cases**: `dp[0] = 1` (one way to stand at ground), `dp[1] = 1`.
- Since each state depends only on the previous two, we can reduce to two rolling variables.

### Solution

```python
def climbStairs(n: int) -> int:
    if n <= 2:
        return n

    prev2, prev1 = 1, 2
    for _ in range(3, n + 1):
        prev2, prev1 = prev1, prev2 + prev1

    return prev1
```

**Time**: O(n)
**Space**: O(1)
**Edge Cases**:
- `n = 1` -> 1
- `n = 2` -> 2

---

## Problem 2. House Robber (LC #198) - Medium

**Problem**: Given an array `nums` where `nums[i]` is the money at house `i`, return the maximum amount you can rob without robbing two adjacent houses.

**Pattern**: Linear DP (include/exclude)

### Approach

- **State**: `dp[i]` = max money robbing from houses `0..i`.
- **Recurrence**: At house `i`, either skip it (`dp[i-1]`) or rob it (`nums[i] + dp[i-2]`).
  - `dp[i] = max(dp[i - 1], nums[i] + dp[i - 2])`
- **Base cases**: `dp[0] = nums[0]`, `dp[1] = max(nums[0], nums[1])`.
- Only two previous values needed, so O(1) space.

### Solution

```python
def rob(nums: list[int]) -> int:
    if len(nums) == 1:
        return nums[0]

    prev2, prev1 = nums[0], max(nums[0], nums[1])
    for i in range(2, len(nums)):
        prev2, prev1 = prev1, max(prev1, nums[i] + prev2)

    return prev1
```

**Time**: O(n)
**Space**: O(1)
**Edge Cases**:
- Single house -> return its value
- Two houses -> return max of the two
- All zeros -> 0

---

## Problem 3. House Robber II (LC #213) - Medium

**Problem**: Same as House Robber, but houses are arranged in a circle (first and last are adjacent).

**Pattern**: Linear DP with circular constraint decomposition

### Approach

- The circular constraint means we cannot rob both house `0` and house `n-1`.
- Decompose into two linear subproblems:
  1. Rob from house `0` to house `n-2` (exclude last).
  2. Rob from house `1` to house `n-1` (exclude first).
- Answer is the max of these two.
- Each subproblem is solved with the same House Robber logic.

### Solution

```python
def rob(nums: list[int]) -> int:
    if len(nums) <= 2:
        return max(nums)

    def rob_linear(houses: list[int]) -> int:
        prev2, prev1 = houses[0], max(houses[0], houses[1])
        for i in range(2, len(houses)):
            prev2, prev1 = prev1, max(prev1, houses[i] + prev2)
        return prev1

    return max(rob_linear(nums[:-1]), rob_linear(nums[1:]))
```

**Time**: O(n)
**Space**: O(1) (excluding the slices; use index bounds to avoid slicing if needed)
**Edge Cases**:
- Single house -> return its value
- Two houses -> return max of the two
- Three houses -> can only rob one, return max

---

## Problem 4. Longest Palindromic Substring (LC #5) - Medium

**Problem**: Given a string `s`, return the longest palindromic substring.

**Pattern**: String DP / Expand Around Center

### Approach

**Expand Around Center** (preferred for O(1) space):
- A palindrome mirrors around its center. There are `2n - 1` possible centers (each character, and each gap between characters).
- For each center, expand outward while characters match.
- Track the longest palindrome found.

**DP alternative**:
- `dp[i][j] = True` if `s[i..j]` is a palindrome.
- `dp[i][j] = (s[i] == s[j]) and dp[i+1][j-1]` for `j - i >= 2`.
- O(n^2) time and space.

### Solution

```python
def longestPalindrome(s: str) -> str:
    start, max_len = 0, 1

    def expand(left: int, right: int) -> None:
        nonlocal start, max_len
        while left >= 0 and right < len(s) and s[left] == s[right]:
            if right - left + 1 > max_len:
                start = left
                max_len = right - left + 1
            left -= 1
            right += 1

    for i in range(len(s)):
        expand(i, i)      # odd-length palindromes
        expand(i, i + 1)  # even-length palindromes

    return s[start : start + max_len]
```

**Time**: O(n^2) -- each expansion is O(n), done for O(n) centers
**Space**: O(1)
**Edge Cases**:
- Single character -> itself
- All identical characters -> entire string
- No palindrome longer than 1 -> return first character

---

## Problem 5. Coin Change (LC #322) - Medium

**Problem**: Given coin denominations `coins` and a target `amount`, return the fewest coins needed to make that amount, or `-1` if impossible.

**Pattern**: Unbounded Knapsack / Linear DP

### Approach

- **State**: `dp[a]` = minimum coins to make amount `a`.
- **Recurrence**: For each amount `a`, try every coin `c`:
  - `dp[a] = min(dp[a], dp[a - c] + 1)` for each `c` in `coins` where `a - c >= 0`.
- **Base case**: `dp[0] = 0` (zero coins for zero amount).
- Initialize all other entries to `amount + 1` (a value that's impossible, acting as infinity).

### Solution

```python
def coinChange(coins: list[int], amount: int) -> int:
    dp = [amount + 1] * (amount + 1)
    dp[0] = 0

    for a in range(1, amount + 1):
        for c in coins:
            if c <= a:
                dp[a] = min(dp[a], dp[a - c] + 1)

    return dp[amount] if dp[amount] <= amount else -1
```

**Time**: O(amount * len(coins))
**Space**: O(amount)
**Edge Cases**:
- `amount = 0` -> 0
- No valid combination -> -1
- Single coin that divides amount evenly

---

## Problem 6. Word Break (LC #139) - Medium

**Problem**: Given a string `s` and a dictionary `wordDict`, return `True` if `s` can be segmented into a space-separated sequence of dictionary words.

**Pattern**: String DP / Substring Matching

### Approach

- **State**: `dp[i]` = `True` if `s[0..i-1]` (first `i` characters) can be segmented.
- **Recurrence**: `dp[i] = any(dp[j] and s[j:i] in word_set for j in range(i))`.
- **Base case**: `dp[0] = True` (empty string is trivially segmented).
- Optimization: only check `j` values where `i - j` is a valid word length, or iterate over words instead of all `j`.

### Solution

```python
def wordBreak(s: str, wordDict: list[str]) -> bool:
    word_set = set(wordDict)
    max_word_len = max(len(w) for w in wordDict)

    dp = [False] * (len(s) + 1)
    dp[0] = True

    for i in range(1, len(s) + 1):
        for j in range(max(0, i - max_word_len), i):
            if dp[j] and s[j:i] in word_set:
                dp[i] = True
                break

    return dp[len(s)]
```

**Time**: O(n * m) where `n = len(s)` and `m = max_word_len`
**Space**: O(n)
**Edge Cases**:
- `s` is exactly one word in dict -> True
- Single character string
- Dictionary words overlap (e.g., "sand" and "and" for "sanand")
- Empty `wordDict` -> False (unless `s` is empty)

---

## Problem 7. Longest Increasing Subsequence (LC #300) - Medium

**Problem**: Given an integer array `nums`, return the length of the longest strictly increasing subsequence.

**Pattern**: Linear DP / Patience Sorting (binary search optimization)

### Approach

**O(n^2) DP**:
- `dp[i]` = length of LIS ending at index `i`.
- `dp[i] = max(dp[j] + 1)` for all `j < i` where `nums[j] < nums[i]`.
- Answer: `max(dp)`.

**O(n log n) with Binary Search** (preferred):
- Maintain a list `tails` where `tails[k]` is the smallest tail element of all increasing subsequences of length `k + 1`.
- For each number, binary search for its position in `tails`:
  - If larger than all tails, append (extends longest subsequence).
  - Otherwise, replace the first tail >= current number (keeps tails as small as possible).
- Length of `tails` is the LIS length.

### Solution

```python
from bisect import bisect_left


def lengthOfLIS(nums: list[int]) -> int:
    tails: list[int] = []

    for num in nums:
        pos = bisect_left(tails, num)
        if pos == len(tails):
            tails.append(num)
        else:
            tails[pos] = num

    return len(tails)
```

**Time**: O(n log n)
**Space**: O(n)
**Edge Cases**:
- Already sorted ascending -> length of array
- Already sorted descending -> 1
- All elements equal -> 1
- Single element -> 1

---

## Problem 8. Unique Paths (LC #62) - Medium

**Problem**: A robot starts at the top-left corner of an `m x n` grid and can only move right or down. Return the number of unique paths to the bottom-right corner.

**Pattern**: Grid DP

### Approach

- **State**: `dp[i][j]` = number of unique paths to cell `(i, j)`.
- **Recurrence**: `dp[i][j] = dp[i-1][j] + dp[i][j-1]` (arrive from above or from left).
- **Base cases**: First row and first column are all 1 (only one way to reach any cell in them).
- Space optimization: since each row only depends on the previous row, use a single 1D array.

### Solution

```python
def uniquePaths(m: int, n: int) -> int:
    dp = [1] * n

    for _ in range(1, m):
        for j in range(1, n):
            dp[j] += dp[j - 1]

    return dp[n - 1]
```

**Time**: O(m * n)
**Space**: O(n)
**Edge Cases**:
- `m = 1` or `n = 1` -> 1 (only one straight path)
- `m = n = 1` -> 1

**Math Alternative**: The answer is `C(m + n - 2, m - 1)` since you make exactly `m - 1` down moves and `n - 1` right moves in any order.

---

## Problem 9. Maximum Subarray (LC #53) - Medium

**Problem**: Given an integer array `nums`, find the contiguous subarray with the largest sum and return that sum.

**Pattern**: Kadane's Algorithm (Linear DP)

### Approach

- **State**: `current_sum` = maximum subarray sum ending at the current index.
- **Recurrence**: At each element, either extend the previous subarray or start a new one:
  - `current_sum = max(nums[i], current_sum + nums[i])`
- Track the global maximum across all positions.
- This is DP where `dp[i] = max(nums[i], dp[i-1] + nums[i])`, compressed to a single variable.

### Solution

```python
def maxSubArray(nums: list[int]) -> int:
    current_sum = nums[0]
    max_sum = nums[0]

    for num in nums[1:]:
        current_sum = max(num, current_sum + num)
        max_sum = max(max_sum, current_sum)

    return max_sum
```

**Time**: O(n)
**Space**: O(1)
**Edge Cases**:
- All negative numbers -> returns the least negative (max single element)
- Single element -> return it
- All positive -> sum of entire array

---

## Problem 10. Jump Game (LC #55) - Medium

**Problem**: Given an array `nums` where `nums[i]` is the max jump length from index `i`, return `True` if you can reach the last index starting from index 0.

**Pattern**: Greedy (DP-inspired)

### Approach

- Track the farthest index reachable so far.
- Iterate through the array. At each index `i`:
  - If `i > farthest`, we cannot reach this index -> return `False`.
  - Update `farthest = max(farthest, i + nums[i])`.
  - If `farthest >= n - 1`, return `True` early.
- This is a greedy simplification of the DP where `dp[i] = can we reach index i?`.

### Solution

```python
def canJump(nums: list[int]) -> bool:
    farthest = 0

    for i, jump in enumerate(nums):
        if i > farthest:
            return False
        farthest = max(farthest, i + jump)
        if farthest >= len(nums) - 1:
            return True

    return True
```

**Time**: O(n)
**Space**: O(1)
**Edge Cases**:
- Single element -> always True (already at last index)
- `nums[0] = 0` with `n > 1` -> False (stuck at start)
- All ones -> always reachable
- Last element is 0 -> fine, we just need to reach it

---

## Problem 11. Decode Ways (LC #91) - Medium

**Problem**: A message encoded with `'A' = 1, 'B' = 2, ..., 'Z' = 26`. Given a digit string `s`, return the number of ways to decode it.

**Pattern**: Linear DP (Fibonacci-like with constraints)

### Approach

- **State**: `dp[i]` = number of ways to decode `s[0..i-1]`.
- **Recurrence**:
  - If `s[i-1] != '0'`, single-digit decode is valid: `dp[i] += dp[i-1]`.
  - If `s[i-2:i]` forms a number between 10 and 26, two-digit decode is valid: `dp[i] += dp[i-2]`.
- **Base cases**: `dp[0] = 1` (empty prefix), `dp[1] = 0 if s[0] == '0' else 1`.
- Leading zeros and embedded zeros require careful handling.

### Solution

```python
def numDecodings(s: str) -> int:
    if s[0] == "0":
        return 0

    prev2, prev1 = 1, 1  # dp[0], dp[1]

    for i in range(2, len(s) + 1):
        current = 0
        if s[i - 1] != "0":
            current += prev1
        two_digit = int(s[i - 2 : i])
        if 10 <= two_digit <= 26:
            current += prev2
        prev2, prev1 = prev1, current

    return prev1
```

**Time**: O(n)
**Space**: O(1)
**Edge Cases**:
- Leading zero `"0..."` -> 0
- Contains `"00"` -> 0 (no valid decoding for consecutive zeros)
- `"10"` -> 1 (only "J")
- `"27"` -> 1 (only "2","7" since 27 > 26)
- Single digit -> 1 if non-zero, else 0

---

## Problem 12. Partition Equal Subset Sum (LC #416) - Medium

**Problem**: Given an integer array `nums`, return `True` if the array can be partitioned into two subsets with equal sum.

**Pattern**: 0/1 Knapsack / Subset Sum

### Approach

- If total sum is odd, return `False` immediately.
- Target = `total_sum // 2`. Problem reduces to: can we find a subset that sums to `target`?
- **State**: `dp[j]` = `True` if a subset summing to `j` exists.
- **Recurrence**: For each number `num`, iterate `j` from `target` down to `num`:
  - `dp[j] = dp[j] or dp[j - num]`
- Iterate backwards to avoid using the same element twice (0/1 knapsack trick).
- **Base case**: `dp[0] = True`.

### Solution

```python
def canPartition(nums: list[int]) -> bool:
    total = sum(nums)
    if total % 2 != 0:
        return False

    target = total // 2
    dp = [False] * (target + 1)
    dp[0] = True

    for num in nums:
        for j in range(target, num - 1, -1):
            dp[j] = dp[j] or dp[j - num]
        if dp[target]:
            return True

    return dp[target]
```

**Time**: O(n * target) where `target = sum(nums) / 2`
**Space**: O(target)
**Edge Cases**:
- Odd total sum -> False
- Single element -> False
- Two equal elements -> True
- Contains a zero -> does not affect partitioning
- Element equals half the sum -> True

---

## Problem 13. Edit Distance (LC #72) - Medium

**Problem**: Given two strings `word1` and `word2`, return the minimum number of operations (insert, delete, replace) to convert `word1` into `word2`.

**Pattern**: 2D String DP (classic)

### Approach

- **State**: `dp[i][j]` = edit distance between `word1[0..i-1]` and `word2[0..j-1]`.
- **Recurrence**:
  - If `word1[i-1] == word2[j-1]`: `dp[i][j] = dp[i-1][j-1]` (no operation needed).
  - Otherwise: `dp[i][j] = 1 + min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])` corresponding to delete, insert, replace.
- **Base cases**: `dp[i][0] = i` (delete all), `dp[0][j] = j` (insert all).
- Space optimization: only need the previous row, so O(min(m, n)) space.

### Solution

```python
def minDistance(word1: str, word2: str) -> int:
    m, n = len(word1), len(word2)

    # Ensure word2 is the shorter one for space optimization
    if m < n:
        return minDistance(word2, word1)

    prev = list(range(n + 1))
    curr = [0] * (n + 1)

    for i in range(1, m + 1):
        curr[0] = i
        for j in range(1, n + 1):
            if word1[i - 1] == word2[j - 1]:
                curr[j] = prev[j - 1]
            else:
                curr[j] = 1 + min(prev[j], curr[j - 1], prev[j - 1])
        prev, curr = curr, prev

    return prev[n]
```

**Time**: O(m * n)
**Space**: O(min(m, n))
**Edge Cases**:
- One or both strings empty -> length of the other string
- Identical strings -> 0
- Completely different strings of same length -> length (all replacements)
- One string is a subsequence of the other

---

## Summary Table

| # | Problem | Difficulty | Pattern | Time | Space |
|---|---------|-----------|---------|------|-------|
| 70 | Climbing Stairs | Easy | Linear DP (Fibonacci) | O(n) | O(1) |
| 198 | House Robber | Medium | Linear DP (include/exclude) | O(n) | O(1) |
| 213 | House Robber II | Medium | Circular -> two linear | O(n) | O(1) |
| 5 | Longest Palindromic Substring | Medium | Expand Around Center | O(n^2) | O(1) |
| 322 | Coin Change | Medium | Unbounded Knapsack | O(amount * coins) | O(amount) |
| 139 | Word Break | Medium | String DP | O(n * m) | O(n) |
| 300 | Longest Increasing Subsequence | Medium | Patience Sort + Binary Search | O(n log n) | O(n) |
| 62 | Unique Paths | Medium | Grid DP | O(m * n) | O(n) |
| 53 | Maximum Subarray | Medium | Kadane's Algorithm | O(n) | O(1) |
| 55 | Jump Game | Medium | Greedy | O(n) | O(1) |
| 91 | Decode Ways | Medium | Linear DP | O(n) | O(1) |
| 416 | Partition Equal Subset Sum | Medium | 0/1 Knapsack | O(n * target) | O(target) |
| 72 | Edit Distance | Medium | 2D String DP | O(m * n) | O(min(m,n)) |

## Key Takeaways

1. **Space optimization is almost always possible**: When `dp[i]` only depends on `dp[i-1]` (and possibly `dp[i-2]`), compress to rolling variables. For 2D DP where each row depends only on the previous row, use two 1D arrays.

2. **Identify the pattern first**: Most DP problems fall into a few categories (linear, knapsack, string, grid). Recognizing the pattern immediately narrows down the state definition.

3. **State definition is the hardest part**: Once you define what `dp[i]` (or `dp[i][j]`) represents and establish the recurrence, implementation is mechanical.

4. **Greedy can replace DP**: Some problems (Jump Game) have a DP formulation but admit a simpler greedy solution. Always check if the DP structure allows greedy simplification.

5. **0/1 vs Unbounded Knapsack**: Iterate backwards through the capacity dimension for 0/1 knapsack (each item used once). Iterate forwards for unbounded knapsack (unlimited use).
