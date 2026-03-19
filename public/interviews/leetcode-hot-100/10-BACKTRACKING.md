# Backtracking

## Overview

Backtracking is a systematic way to explore all possible solutions by building candidates incrementally and abandoning ("backtracking") a candidate as soon as it is determined to be invalid. It is essentially a depth-first search on the solution space tree.

### How to Identify Backtracking Problems

- The problem asks for **all** combinations, permutations, subsets, or partitions.
- You need to explore multiple choices at each step.
- Constraints allow pruning branches early.
- Keywords: "generate all", "find all", "all possible", "enumerate".

### The Backtracking Template

```python
def backtrack(state: list, start: int, ...) -> None:
    # 1. Base case: record a valid solution
    if is_solution(state):
        result.append(state[:])  # copy the current state
        return

    # 2. Iterate over candidates
    for i in range(start, len(candidates)):
        # 3. Pruning (optional)
        if not is_valid(candidates[i]):
            continue

        # 4. Make a choice
        state.append(candidates[i])

        # 5. Recurse
        backtrack(state, i + 1, ...)  # i+1 for combinations, i for reuse, 0 for permutations

        # 6. Undo the choice (backtrack)
        state.pop()
```

### Key Variations

| Pattern                 | Next start index            | Skip duplicates?             |
| ----------------------- | --------------------------- | ---------------------------- |
| Subsets / Combinations  | `i + 1`                     | No                           |
| Subsets with duplicates | `i + 1`                     | Yes (`nums[i] == nums[i-1]`) |
| Combination with reuse  | `i` (same element reusable) | No                           |
| Permutations            | `0` (use visited set)       | No                           |

---

## Problem 1. Subsets (LC #78) - Medium

**Problem**: Given an integer array `nums` of unique elements, return all possible subsets (the power set). The solution must not contain duplicate subsets.

**Pattern**: Standard subset enumeration via backtracking.

### Approach

Start with an empty path and at each recursive call, add the current path to the result. Then iterate from the current index forward, appending each element and recursing with the next index. Since every node in the recursion tree is a valid subset, we collect results at every level rather than only at leaves.

### Solution

```python
def subsets(nums: list[int]) -> list[list[int]]:
    result: list[list[int]] = []

    def backtrack(start: int, path: list[int]) -> None:
        result.append(path[:])
        for i in range(start, len(nums)):
            path.append(nums[i])
            backtrack(i + 1, path)
            path.pop()

    backtrack(0, [])
    return result
```

**Time**: O(n _ 2^n) -- 2^n subsets, each copied in O(n).
**Space**: O(n) recursion depth, O(n _ 2^n) for output.
**Edge Cases**: Empty input returns `[[]]`. Single element returns `[[], [x]]`.

---

## Problem 2. Subsets II (LC #90) - Medium

**Problem**: Given an integer array `nums` that may contain duplicates, return all possible subsets. The solution must not contain duplicate subsets.

**Pattern**: Subset enumeration with duplicate skipping.

### Approach

Sort the array first so duplicates are adjacent. During backtracking, if the current element equals the previous element at the same recursion level (i.e., `i > start` and `nums[i] == nums[i - 1]`), skip it. This ensures each unique combination is generated exactly once.

### Solution

```python
def subsets_with_dup(nums: list[int]) -> list[list[int]]:
    nums.sort()
    result: list[list[int]] = []

    def backtrack(start: int, path: list[int]) -> None:
        result.append(path[:])
        for i in range(start, len(nums)):
            if i > start and nums[i] == nums[i - 1]:
                continue
            path.append(nums[i])
            backtrack(i + 1, path)
            path.pop()

    backtrack(0, [])
    return result
```

**Time**: O(n _ 2^n) worst case.
**Space**: O(n) recursion depth, O(n _ 2^n) for output.
**Edge Cases**: All elements identical (e.g., `[1,1,1]`) produces subsets of lengths 0 through n only.

---

## Problem 3. Combination Sum (LC #39) - Medium

**Problem**: Given an array of distinct integers `candidates` and a target integer `target`, return all unique combinations where the chosen numbers sum to `target`. The same number may be chosen an unlimited number of times.

**Pattern**: Subset enumeration with element reuse (start index stays at `i` instead of `i + 1`).

### Approach

Sort candidates for early termination. At each step, try adding the current candidate and recurse with the same index (allowing reuse). If the remaining target drops below zero, prune. When the target reaches zero, record the combination.

### Solution

```python
def combination_sum(candidates: list[int], target: int) -> list[list[int]]:
    candidates.sort()
    result: list[list[int]] = []

    def backtrack(start: int, remaining: int, path: list[int]) -> None:
        if remaining == 0:
            result.append(path[:])
            return
        for i in range(start, len(candidates)):
            if candidates[i] > remaining:
                break
            path.append(candidates[i])
            backtrack(i, remaining - candidates[i], path)
            path.pop()

    backtrack(0, target, [])
    return result
```

**Time**: O(n^(target/min_candidate)) -- bounded by the maximum depth of recursion.
**Space**: O(target/min_candidate) recursion depth.
**Edge Cases**: Target is 0 returns `[[]]`. Single candidate equal to target returns `[[candidate]]`. No valid combination returns `[]`.

---

## Problem 4. Combination Sum II (LC #40) - Medium

**Problem**: Given a collection of candidate numbers (which may contain duplicates) and a target number, find all unique combinations that sum to the target. Each number may only be used once.

**Pattern**: Combination with duplicate skipping (combines Subsets II logic with target sum constraint).

### Approach

Sort the array. Use backtracking with `i + 1` to avoid reusing the same index. Skip duplicates at the same level using the `i > start and nums[i] == nums[i-1]` guard. Prune when the current candidate exceeds the remaining target.

### Solution

```python
def combination_sum2(candidates: list[int], target: int) -> list[list[int]]:
    candidates.sort()
    result: list[list[int]] = []

    def backtrack(start: int, remaining: int, path: list[int]) -> None:
        if remaining == 0:
            result.append(path[:])
            return
        for i in range(start, len(candidates)):
            if candidates[i] > remaining:
                break
            if i > start and candidates[i] == candidates[i - 1]:
                continue
            path.append(candidates[i])
            backtrack(i + 1, remaining - candidates[i], path)
            path.pop()

    backtrack(0, target, [])
    return result
```

**Time**: O(2^n) in the worst case.
**Space**: O(n) recursion depth.
**Edge Cases**: All candidates larger than target returns `[]`. Duplicate candidates that together meet the target (e.g., `[1,1,1], target=2`).

---

## Problem 5. Permutations (LC #46) - Medium

**Problem**: Given an array of distinct integers `nums`, return all possible permutations in any order.

**Pattern**: Permutation via backtracking with a visited set.

### Approach

Unlike subsets, permutations consider all elements at every level. Use a boolean visited array to track which elements are currently in the path. When the path length equals the input length, record the permutation.

### Solution

```python
def permute(nums: list[int]) -> list[list[int]]:
    result: list[list[int]] = []
    visited = [False] * len(nums)

    def backtrack(path: list[int]) -> None:
        if len(path) == len(nums):
            result.append(path[:])
            return
        for i in range(len(nums)):
            if visited[i]:
                continue
            visited[i] = True
            path.append(nums[i])
            backtrack(path)
            path.pop()
            visited[i] = False

    backtrack([])
    return result
```

**Time**: O(n \* n!) -- n! permutations, each copied in O(n).
**Space**: O(n) for recursion depth and visited array.
**Edge Cases**: Single element returns `[[x]]`. Two elements returns both orderings.

---

## Problem 6. Word Search (LC #79) - Medium

**Problem**: Given an `m x n` grid of characters and a string `word`, return `True` if the word exists in the grid. The word can be constructed from letters of sequentially adjacent cells (horizontal or vertical), and each cell may be used at most once per path.

**Pattern**: Grid-based backtracking with in-place visited marking.

### Approach

Iterate over every cell as a starting point. From each cell, perform DFS in four directions. Mark visited cells by temporarily replacing their value (avoids extra space for a visited set). If the current index matches the word length, we found the word. Prune early when the character does not match.

### Solution

```python
def exist(board: list[list[str]], word: str) -> bool:
    rows, cols = len(board), len(board[0])

    def backtrack(r: int, c: int, idx: int) -> bool:
        if idx == len(word):
            return True
        if r < 0 or r >= rows or c < 0 or c >= cols or board[r][c] != word[idx]:
            return False

        original = board[r][c]
        board[r][c] = "#"  # mark visited

        for dr, dc in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            if backtrack(r + dr, c + dc, idx + 1):
                board[r][c] = original
                return True

        board[r][c] = original  # restore
        return False

    for r in range(rows):
        for c in range(cols):
            if backtrack(r, c, 0):
                return True
    return False
```

**Time**: O(m _ n _ 3^L) where L is the word length. Each cell branches to at most 3 neighbors (excluding where we came from).
**Space**: O(L) recursion depth.
**Edge Cases**: Single-character word. Word longer than total grid cells. Grid is 1x1.

---

## Problem 7. Palindrome Partitioning (LC #131) - Medium

**Problem**: Given a string `s`, partition it such that every substring in the partition is a palindrome. Return all possible palindrome partitions.

**Pattern**: Backtracking with substring validation at each step.

### Approach

At each recursive call, try every possible prefix of the remaining string. If the prefix is a palindrome, add it to the current partition and recurse on the rest. When the start index reaches the end of the string, the current partition is valid.

### Solution

```python
def partition(s: str) -> list[list[str]]:
    result: list[list[str]] = []

    def is_palindrome(sub: str) -> bool:
        return sub == sub[::-1]

    def backtrack(start: int, path: list[str]) -> None:
        if start == len(s):
            result.append(path[:])
            return
        for end in range(start + 1, len(s) + 1):
            substring = s[start:end]
            if is_palindrome(substring):
                path.append(substring)
                backtrack(end, path)
                path.pop()

    backtrack(0, [])
    return result
```

**Time**: O(n \* 2^n) -- up to 2^n partitions, palindrome check is O(n).
**Space**: O(n) recursion depth.
**Edge Cases**: Single character (always a palindrome). All identical characters (e.g., `"aaa"` has many valid partitions). Empty string returns `[[]]`.

---

## Problem 8. Letter Combinations of a Phone Number (LC #17) - Medium

**Problem**: Given a string containing digits from 2-9, return all possible letter combinations that the number could represent (using the telephone keypad mapping).

**Pattern**: Backtracking over a fixed mapping, building combinations character by character.

### Approach

Map each digit to its letters. At each recursion level, iterate over the letters for the current digit and recurse to the next digit. When the path length equals the input length, record the combination.

### Solution

```python
def letter_combinations(digits: str) -> list[str]:
    if not digits:
        return []

    phone_map: dict[str, str] = {
        "2": "abc", "3": "def", "4": "ghi", "5": "jkl",
        "6": "mno", "7": "pqrs", "8": "tuv", "9": "wxyz",
    }
    result: list[str] = []

    def backtrack(idx: int, path: list[str]) -> None:
        if idx == len(digits):
            result.append("".join(path))
            return
        for ch in phone_map[digits[idx]]:
            path.append(ch)
            backtrack(idx + 1, path)
            path.pop()

    backtrack(0, [])
    return result
```

**Time**: O(4^n \* n) where n is the number of digits. At most 4 letters per digit, and joining takes O(n).
**Space**: O(n) recursion depth.
**Edge Cases**: Empty input returns `[]`. Single digit returns its mapped letters individually. Digits with 4 letters (7, 9) increase branching factor.

---

## Problem 9. N-Queens (LC #51) - Hard

**Problem**: Place `n` queens on an `n x n` chessboard so that no two queens threaten each other (no two share the same row, column, or diagonal). Return all distinct solutions.

**Pattern**: Row-by-row backtracking with constraint sets for columns and diagonals.

### Approach

Place queens one row at a time. For each row, try every column. Use three sets to track attacked columns, main diagonals (`row - col`), and anti-diagonals (`row + col`). If a column is safe on all three constraints, place the queen and recurse to the next row. When all rows are filled, build the board string representation.

### Solution

```python
def solve_n_queens(n: int) -> list[list[str]]:
    result: list[list[str]] = []
    cols: set[int] = set()
    diag: set[int] = set()       # row - col
    anti_diag: set[int] = set()  # row + col
    queens: list[int] = []       # queens[row] = col

    def backtrack(row: int) -> None:
        if row == n:
            board = []
            for q_col in queens:
                board.append("." * q_col + "Q" + "." * (n - q_col - 1))
            result.append(board)
            return

        for col in range(n):
            if col in cols or (row - col) in diag or (row + col) in anti_diag:
                continue

            cols.add(col)
            diag.add(row - col)
            anti_diag.add(row + col)
            queens.append(col)

            backtrack(row + 1)

            queens.pop()
            cols.discard(col)
            diag.discard(row - col)
            anti_diag.discard(row + col)

    backtrack(0)
    return result
```

**Time**: O(n!) -- upper bound on valid placements per row decreases at each level.
**Space**: O(n) for the constraint sets and recursion depth.
**Edge Cases**: `n = 1` returns `[["Q"]]`. `n = 2` and `n = 3` return `[]` (no valid placements). `n = 4` has 2 solutions.

---

## Summary Table

| #   | Problem                 | Difficulty | Key Technique                             |
| --- | ----------------------- | ---------- | ----------------------------------------- |
| 78  | Subsets                 | Medium     | Basic backtracking, collect at every node |
| 90  | Subsets II              | Medium     | Sort + skip duplicates                    |
| 39  | Combination Sum         | Medium     | Reuse elements (start at `i`)             |
| 40  | Combination Sum II      | Medium     | No reuse + skip duplicates                |
| 46  | Permutations            | Medium     | Visited array, iterate all indices        |
| 79  | Word Search             | Medium     | Grid DFS, in-place marking                |
| 131 | Palindrome Partitioning | Medium     | Partition string, validate palindromes    |
| 17  | Letter Combinations     | Medium     | Fixed mapping, digit-by-digit             |
| 51  | N-Queens                | Hard       | Row-by-row, constraint sets               |
