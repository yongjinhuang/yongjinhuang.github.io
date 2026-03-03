# Dynamic Programming

Dynamic programming (DP) is one of the hardest topics for interviews, but it becomes manageable
once you recognize the patterns. The key insight: DP is just recursion with caching. Every DP
problem has **overlapping subproblems** and **optimal substructure**. Learn to identify the
state, write the recurrence, and choose between top-down (memoization) and bottom-up (tabulation).

---

## 1. Core Concepts

### 1.1 How to Identify a DP Problem

A problem is likely DP if:
1. It asks for the **optimum** (min, max, longest, shortest) or **count** of ways
2. You can break it into **overlapping subproblems**
3. A greedy approach does not work (local optimum != global optimum)
4. The problem has **choices** at each step (take/skip, include/exclude)

### 1.2 Top-Down (Memoization) vs Bottom-Up (Tabulation)

| Aspect | Top-Down | Bottom-Up |
|--------|----------|-----------|
| Approach | Recursion + cache | Iterative, fill table |
| Ease of writing | More intuitive | Requires careful ordering |
| Space optimization | Harder | Easier to reduce |
| Stack overflow risk | Yes (deep recursion) | No |
| Subproblems computed | Only what's needed | All subproblems |

**Top-down template:**

```python
from functools import lru_cache

@lru_cache(maxsize=None)
def solve(state):
    if base_case(state):
        return base_value

    result = initial_value
    for choice in choices(state):
        result = combine(result, solve(next_state(state, choice)))
    return result
```

**Bottom-up template:**

```python
def solve(n):
    dp = [initial_value] * (n + 1)
    dp[base] = base_value

    for i in range(start, n + 1):
        for choice in choices(i):
            dp[i] = combine(dp[i], dp[previous_state(i, choice)])

    return dp[n]
```

### 1.3 State Transition Pattern

1. **Define the state**: What variables uniquely identify a subproblem?
2. **Write the recurrence**: How does the current state relate to smaller states?
3. **Identify base cases**: What are the trivial subproblems?
4. **Determine iteration order**: Ensure dependencies are computed first.

---

## 2. 1D Dynamic Programming

### 2.1 Climbing Stairs

**Problem:** You can climb 1 or 2 steps at a time. How many distinct ways to reach the top?

**State:** `dp[i]` = number of ways to reach step `i`.
**Recurrence:** `dp[i] = dp[i-1] + dp[i-2]` (you came from step i-1 or i-2).

```python
def climb_stairs(n: int) -> int:
    """
    Count distinct ways to climb n stairs.

    Time:  O(n)
    Space: O(1) -- only need last two values
    """
    if n <= 2:
        return n

    prev2, prev1 = 1, 2
    for _ in range(3, n + 1):
        prev2, prev1 = prev1, prev2 + prev1

    return prev1
```

---

### 2.2 House Robber

**Problem:** Rob houses along a street. You cannot rob two adjacent houses. Maximize the
total amount.

**State:** `dp[i]` = max amount robbing from houses `0..i`.
**Recurrence:** `dp[i] = max(dp[i-1], dp[i-2] + nums[i])` (skip house i, or rob house i).

```python
def rob(nums: list[int]) -> int:
    """
    Maximum robbery amount without adjacent houses.

    Time:  O(n)
    Space: O(1)
    """
    if not nums:
        return 0
    if len(nums) == 1:
        return nums[0]

    prev2, prev1 = 0, 0
    for num in nums:
        prev2, prev1 = prev1, max(prev1, prev2 + num)

    return prev1
```

**House Robber II (circular):** First and last houses are adjacent. Run House Robber twice:
once excluding the first house, once excluding the last. Return the max.

```python
def rob_circular(nums: list[int]) -> int:
    """
    Time:  O(n)
    Space: O(1)
    """
    if len(nums) == 1:
        return nums[0]

    def rob_linear(houses):
        prev2, prev1 = 0, 0
        for h in houses:
            prev2, prev1 = prev1, max(prev1, prev2 + h)
        return prev1

    return max(rob_linear(nums[1:]), rob_linear(nums[:-1]))
```

---

### 2.3 Coin Change

**Problem:** Given coin denominations and a target amount, find the minimum number of coins
needed. Return -1 if impossible.

**State:** `dp[amount]` = minimum coins to make `amount`.
**Recurrence:** `dp[amount] = min(dp[amount - coin] + 1)` for each coin.

```python
def coin_change(coins: list[int], amount: int) -> int:
    """
    Minimum coins to make amount.

    Time:  O(amount * len(coins))
    Space: O(amount)
    """
    dp = [float('inf')] * (amount + 1)
    dp[0] = 0  # base case: 0 coins for amount 0

    for a in range(1, amount + 1):
        for coin in coins:
            if coin <= a and dp[a - coin] != float('inf'):
                dp[a] = min(dp[a], dp[a - coin] + 1)

    return dp[amount] if dp[amount] != float('inf') else -1
```

---

### 2.4 Longest Increasing Subsequence (LIS)

**Problem:** Find the length of the longest strictly increasing subsequence.

**Approach 1 -- O(n^2) DP:**

**State:** `dp[i]` = length of LIS ending at index `i`.

```python
def length_of_lis_dp(nums: list[int]) -> int:
    """
    Time:  O(n^2)
    Space: O(n)
    """
    n = len(nums)
    dp = [1] * n

    for i in range(1, n):
        for j in range(i):
            if nums[j] < nums[i]:
                dp[i] = max(dp[i], dp[j] + 1)

    return max(dp)
```

**Approach 2 -- O(n log n) with binary search:**

Maintain a list `tails` where `tails[i]` is the smallest tail element of any increasing
subsequence of length `i+1`.

```python
import bisect

def length_of_lis(nums: list[int]) -> int:
    """
    Patience sorting approach.

    Time:  O(n log n)
    Space: O(n)
    """
    tails = []

    for num in nums:
        pos = bisect.bisect_left(tails, num)
        if pos == len(tails):
            tails.append(num)
        else:
            tails[pos] = num

    return len(tails)
```

**Key insight:** `tails` is always sorted. We use binary search to find where to place each
number. This does NOT give the actual subsequence, just the length.

---

### 2.5 Word Break

```python
def word_break(s: str, word_dict: list[str]) -> bool:
    """
    Can s be segmented into dictionary words?

    Time:  O(n^2 * m) where n = len(s), m = avg word length
    Space: O(n)
    """
    words = set(word_dict)
    dp = [False] * (len(s) + 1)
    dp[0] = True  # empty string

    for i in range(1, len(s) + 1):
        for j in range(i):
            if dp[j] and s[j:i] in words:
                dp[i] = True
                break

    return dp[len(s)]
```

### 2.6 Decode Ways

```python
def num_decodings(s: str) -> int:
    """
    Count ways to decode a digit string (1-26 -> A-Z).

    Time:  O(n)
    Space: O(1)
    """
    if not s or s[0] == '0':
        return 0

    prev2, prev1 = 1, 1  # dp[0], dp[1]

    for i in range(1, len(s)):
        current = 0
        # Single digit decode
        if s[i] != '0':
            current += prev1
        # Two digit decode
        two_digit = int(s[i - 1:i + 1])
        if 10 <= two_digit <= 26:
            current += prev2

        prev2, prev1 = prev1, current

    return prev1
```

---

## 3. 2D Dynamic Programming

### 3.1 Unique Paths

**Problem:** Robot at top-left of m x n grid. Can only move right or down. Count paths to
bottom-right.

**State:** `dp[r][c]` = number of paths to reach `(r, c)`.
**Recurrence:** `dp[r][c] = dp[r-1][c] + dp[r][c-1]`.

```python
def unique_paths(m: int, n: int) -> int:
    """
    Time:  O(m * n)
    Space: O(n) -- optimized to single row
    """
    dp = [1] * n

    for _ in range(1, m):
        for c in range(1, n):
            dp[c] += dp[c - 1]

    return dp[n - 1]
```

---

### 3.2 Longest Common Subsequence (LCS)

**Problem:** Given two strings, find the length of their longest common subsequence.

**State:** `dp[i][j]` = LCS length of `text1[0..i-1]` and `text2[0..j-1]`.
**Recurrence:**
- If `text1[i-1] == text2[j-1]`: `dp[i][j] = dp[i-1][j-1] + 1`
- Else: `dp[i][j] = max(dp[i-1][j], dp[i][j-1])`

```python
def longest_common_subsequence(text1: str, text2: str) -> int:
    """
    Time:  O(m * n)
    Space: O(min(m, n)) -- optimized with two rows
    """
    # Ensure text1 is shorter for space optimization
    if len(text1) > len(text2):
        text1, text2 = text2, text1

    m, n = len(text1), len(text2)
    prev = [0] * (m + 1)

    for j in range(1, n + 1):
        curr = [0] * (m + 1)
        for i in range(1, m + 1):
            if text1[i - 1] == text2[j - 1]:
                curr[i] = prev[i - 1] + 1
            else:
                curr[i] = max(prev[i], curr[i - 1])
        prev = curr

    return prev[m]
```

---

### 3.3 Edit Distance

**Problem:** Given two words, find the minimum number of operations (insert, delete, replace)
to transform word1 into word2.

**State:** `dp[i][j]` = edit distance between `word1[0..i-1]` and `word2[0..j-1]`.

```python
def min_distance(word1: str, word2: str) -> int:
    """
    Minimum edit distance (Levenshtein distance).

    Time:  O(m * n)
    Space: O(n) -- optimized to single row
    """
    m, n = len(word1), len(word2)

    prev = list(range(n + 1))

    for i in range(1, m + 1):
        curr = [i] + [0] * n
        for j in range(1, n + 1):
            if word1[i - 1] == word2[j - 1]:
                curr[j] = prev[j - 1]
            else:
                curr[j] = 1 + min(
                    prev[j],      # delete from word1
                    curr[j - 1],  # insert into word1
                    prev[j - 1]   # replace
                )
        prev = curr

    return prev[n]
```

---

### 3.4 0/1 Knapsack

**Problem:** Given items with weights and values, and a capacity W, maximize value without
exceeding capacity. Each item can be used at most once.

**State:** `dp[i][w]` = max value using items `0..i-1` with capacity `w`.
**Recurrence:** `dp[i][w] = max(dp[i-1][w], dp[i-1][w-weight[i]] + value[i])`.

```python
def knapsack_01(weights: list[int], values: list[int], capacity: int) -> int:
    """
    0/1 Knapsack -- each item used at most once.

    Time:  O(n * W) where n = items, W = capacity
    Space: O(W) -- optimized to 1D
    """
    dp = [0] * (capacity + 1)

    for i in range(len(weights)):
        # Iterate backward to avoid using same item twice
        for w in range(capacity, weights[i] - 1, -1):
            dp[w] = max(dp[w], dp[w - weights[i]] + values[i])

    return dp[capacity]
```

**Key insight:** Iterating backward ensures each item is only used once. For unbounded
knapsack (unlimited items), iterate forward.

---

## 4. Interval DP

### 4.1 Burst Balloons

**Problem:** Given balloons with numbers, burst them to maximize coins. Bursting balloon `i`
earns `nums[left] * nums[i] * nums[right]` where left and right are adjacent remaining
balloons.

**State:** `dp[i][j]` = max coins from bursting all balloons in range `(i, j)` exclusive.

```python
def max_coins(nums: list[int]) -> int:
    """
    Maximum coins from bursting balloons.

    Time:  O(n^3)
    Space: O(n^2)
    """
    # Add boundary balloons with value 1
    balloons = [1] + nums + [1]
    n = len(balloons)
    dp = [[0] * n for _ in range(n)]

    # Iterate over increasing interval lengths
    for length in range(2, n):
        for left in range(0, n - length):
            right = left + length
            for k in range(left + 1, right):
                # k is the LAST balloon to burst in (left, right)
                coins = (
                    balloons[left] * balloons[k] * balloons[right]
                    + dp[left][k] + dp[k][right]
                )
                dp[left][right] = max(dp[left][right], coins)

    return dp[0][n - 1]
```

**Key insight:** Think of `k` as the **last** balloon to burst in the interval, not the
first. This makes the subproblems independent.

### 4.2 Matrix Chain Multiplication

```python
def matrix_chain_order(dimensions: list[int]) -> int:
    """
    Minimum multiplications for matrix chain A1 * A2 * ... * An.
    dimensions[i-1] x dimensions[i] defines matrix Ai.

    Time:  O(n^3)
    Space: O(n^2)
    """
    n = len(dimensions) - 1
    dp = [[0] * n for _ in range(n)]

    for length in range(2, n + 1):
        for i in range(n - length + 1):
            j = i + length - 1
            dp[i][j] = float('inf')
            for k in range(i, j):
                cost = (
                    dp[i][k] + dp[k + 1][j]
                    + dimensions[i] * dimensions[k + 1] * dimensions[j + 1]
                )
                dp[i][j] = min(dp[i][j], cost)

    return dp[0][n - 1]
```

---

## 5. Common Interview Questions

| # | Problem | Difficulty | Category | State Definition |
|---|---------|-----------|----------|------------------|
| 1 | Climbing Stairs | Easy | 1D | `dp[i]` = ways to reach step i |
| 2 | House Robber | Medium | 1D | `dp[i]` = max rob from 0..i |
| 3 | Coin Change | Medium | 1D | `dp[a]` = min coins for amount a |
| 4 | Longest Increasing Subsequence | Medium | 1D | `dp[i]` = LIS ending at i |
| 5 | Word Break | Medium | 1D | `dp[i]` = can segment s[0..i-1] |
| 6 | Unique Paths | Medium | 2D | `dp[r][c]` = paths to (r,c) |
| 7 | Longest Common Subsequence | Medium | 2D | `dp[i][j]` = LCS of prefixes |
| 8 | Edit Distance | Medium | 2D | `dp[i][j]` = min ops for prefixes |
| 9 | 0/1 Knapsack | Medium | 2D | `dp[i][w]` = max value with capacity w |
| 10 | House Robber II | Medium | 1D | Circular: run twice excluding endpoints |
| 11 | Decode Ways | Medium | 1D | `dp[i]` = decodings of s[0..i-1] |
| 12 | Burst Balloons | Hard | Interval | `dp[l][r]` = max coins in (l,r) |

---

## 6. Gotchas

### 6.1 Identifying DP vs Greedy
- DP: "minimum number of coins to make amount" (coin change) -- greedy fails for [1,3,4] target=6
- Greedy: "minimum number of intervals to remove for no overlap" -- greedy works
- **Test:** If the locally optimal choice doesn't guarantee globally optimal, use DP.

### 6.2 State Definition Mistakes
- Missing a dimension: if the answer depends on index AND remaining capacity, you need 2D.
- Overcounting: ensure states are unique and non-overlapping.
- Wrong base case: double-check what `dp[0]` represents.

### 6.3 Iteration Order
- Bottom-up: ensure all dependencies are computed before the current cell.
- 0/1 knapsack: iterate **backward** over capacity to prevent using an item twice.
- Unbounded knapsack: iterate **forward** over capacity.
- 2D: typically left-to-right, top-to-bottom.

### 6.4 Space Optimization
- Most 2D DP only depends on the previous row: reduce to O(n) with two rows.
- Some 1D DP only depends on the last 2 values: reduce to O(1).
- Beware: space optimization makes backtracking (recovering the actual solution) harder.

### 6.5 Python-Specific
- `@lru_cache(maxsize=None)` for memoization. Remember to call `.cache_clear()` if needed.
- `float('inf')` for initialization (not `sys.maxsize` -- avoids overflow in comparisons).
- For large DP tables, consider using `array` module or numpy for memory efficiency.
- Python recursion limit: `sys.setrecursionlimit(10000)` for deep top-down DP.

---

## 7. Quick Reference

| Pattern | When to Use | State | Recurrence Shape | Space |
|---------|-------------|-------|-----------------|-------|
| Fibonacci-style | Sequential decisions | `dp[i]` | `dp[i] = f(dp[i-1], dp[i-2])` | O(1) |
| Coin change | Unbounded choices | `dp[amount]` | `dp[a] = min(dp[a-coin]+1)` | O(amount) |
| 0/1 Knapsack | Take/skip with constraint | `dp[i][w]` | `max(skip, take)` | O(n*W) or O(W) |
| LCS | Two sequences | `dp[i][j]` | Match or skip | O(m*n) or O(n) |
| Edit distance | String transformation | `dp[i][j]` | `min(ins, del, rep)` | O(m*n) or O(n) |
| LIS | Longest subsequence | `dp[i]` or tails array | `max(dp[j]+1)` or bisect | O(n^2) or O(nlogn) |
| Grid paths | 2D grid traversal | `dp[r][c]` | `dp[r-1][c] + dp[r][c-1]` | O(m*n) or O(n) |
| Interval DP | Ranges, merge cost | `dp[l][r]` | `dp[l][k] + dp[k][r] + cost` | O(n^2) |
| Bitmask DP | Subsets, permutations | `dp[mask]` | `dp[mask \| (1<<i)]` | O(2^n) |
