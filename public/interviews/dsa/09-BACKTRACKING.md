# Backtracking

Backtracking is a systematic way to explore all possible solutions by building candidates
incrementally and abandoning ("backtracking" from) candidates as soon as they cannot lead
to a valid solution. Think of it as DFS on a decision tree. The key to efficiency is
**pruning** -- eliminating branches early.

---

## 1. Core Concepts

### 1.1 Backtracking Framework

Every backtracking problem follows this template:

```python
def backtrack(candidate, state):
    # 1. Base case: is the candidate a complete solution?
    if is_solution(candidate):
        result.append(candidate.copy())  # IMPORTANT: copy!
        return

    # 2. Try each choice
    for choice in get_choices(state):
        # 3. Pruning: skip invalid choices
        if not is_valid(choice, state):
            continue

        # 4. Make the choice
        candidate.append(choice)
        update_state(state, choice)

        # 5. Recurse
        backtrack(candidate, state)

        # 6. Undo the choice (backtrack)
        candidate.pop()
        undo_state(state, choice)
```

### 1.2 Key Principles

1. **Choose**: Select an option from available choices
2. **Explore**: Recurse with the updated state
3. **Unchoose**: Undo the selection and try the next option

### 1.3 Pruning Techniques

Pruning eliminates branches that cannot lead to valid solutions:

- **Skip duplicates**: Sort the input and skip consecutive equal elements
- **Early termination**: Stop if remaining elements cannot satisfy constraints
- **Constraint checking**: Validate before recursing, not after
- **Bound checking**: For optimization problems, skip if current path cannot beat best

### 1.4 Common Backtracking Categories

| Category | Example | Choices at Each Step |
|----------|---------|---------------------|
| Subsets | Power set | Include or exclude each element |
| Permutations | All orderings | Pick any unused element |
| Combinations | Choose k from n | Pick elements in order |
| Partitioning | Palindrome partition | Cut at each valid position |
| Grid search | Word search | Move in 4 directions |
| Constraint satisfaction | N-Queens, Sudoku | Place in valid position |

---

## 2. Classic Problems

### 2.1 Subsets

**Problem:** Given an integer array of unique elements, return all possible subsets.

**Approach:** For each element, choose to include it or not.

```python
def subsets(nums: list[int]) -> list[list[int]]:
    """
    Generate all subsets (power set).

    Time:  O(n * 2^n) -- 2^n subsets, each takes O(n) to copy
    Space: O(n) -- recursion depth (excluding output)
    """
    result = []

    def backtrack(start: int, current: list[int]):
        result.append(current[:])  # copy current subset

        for i in range(start, len(nums)):
            current.append(nums[i])
            backtrack(i + 1, current)
            current.pop()

    backtrack(0, [])
    return result
```

### Subsets II (with duplicates)

```python
def subsets_with_dup(nums: list[int]) -> list[list[int]]:
    """
    Subsets from an array that may contain duplicates.

    Time:  O(n * 2^n)
    Space: O(n)
    """
    nums.sort()  # sort to group duplicates
    result = []

    def backtrack(start: int, current: list[int]):
        result.append(current[:])

        for i in range(start, len(nums)):
            # Skip duplicates at the same level
            if i > start and nums[i] == nums[i - 1]:
                continue
            current.append(nums[i])
            backtrack(i + 1, current)
            current.pop()

    backtrack(0, [])
    return result
```

---

### 2.2 Permutations

**Problem:** Given an array of distinct integers, return all permutations.

```python
def permute(nums: list[int]) -> list[list[int]]:
    """
    Generate all permutations.

    Time:  O(n * n!) -- n! permutations, each takes O(n) to copy
    Space: O(n)
    """
    result = []

    def backtrack(current: list[int], remaining: set):
        if not remaining:
            result.append(current[:])
            return

        for num in list(remaining):
            current.append(num)
            remaining.remove(num)
            backtrack(current, remaining)
            remaining.add(num)
            current.pop()

    backtrack([], set(nums))
    return result
```

**Alternative using index swapping:**

```python
def permute_swap(nums: list[int]) -> list[list[int]]:
    """
    Permutations using in-place swapping.

    Time:  O(n * n!)
    Space: O(n) -- recursion depth
    """
    result = []

    def backtrack(start: int):
        if start == len(nums):
            result.append(nums[:])
            return

        for i in range(start, len(nums)):
            nums[start], nums[i] = nums[i], nums[start]
            backtrack(start + 1)
            nums[start], nums[i] = nums[i], nums[start]  # undo swap

    backtrack(0)
    return result
```

### Permutations II (with duplicates)

```python
from collections import Counter

def permute_unique(nums: list[int]) -> list[list[int]]:
    """
    Permutations of an array that may contain duplicates.

    Time:  O(n * n!)
    Space: O(n)
    """
    result = []
    count = Counter(nums)

    def backtrack(current: list[int]):
        if len(current) == len(nums):
            result.append(current[:])
            return

        for num in count:
            if count[num] > 0:
                current.append(num)
                count[num] -= 1
                backtrack(current)
                count[num] += 1
                current.pop()

    backtrack([])
    return result
```

---

### 2.3 Combination Sum

**Problem:** Given candidates and a target, find all unique combinations where candidates
sum to target. Each number may be used unlimited times.

```python
def combination_sum(
    candidates: list[int], target: int
) -> list[list[int]]:
    """
    Find all combinations summing to target (unlimited use).

    Time:  O(n^(T/M)) where T = target, M = min candidate
    Space: O(T/M) -- max recursion depth
    """
    result = []

    def backtrack(start: int, current: list[int], remaining: int):
        if remaining == 0:
            result.append(current[:])
            return

        for i in range(start, len(candidates)):
            if candidates[i] > remaining:
                break  # pruning (requires sorted input)

            current.append(candidates[i])
            # i (not i+1) because we can reuse the same element
            backtrack(i, current, remaining - candidates[i])
            current.pop()

    candidates.sort()  # sort for pruning
    backtrack(0, [], target)
    return result
```

### Combination Sum II (each number used once)

```python
def combination_sum2(
    candidates: list[int], target: int
) -> list[list[int]]:
    """
    Combinations summing to target, each number used at most once.

    Time:  O(2^n)
    Space: O(n)
    """
    result = []
    candidates.sort()

    def backtrack(start: int, current: list[int], remaining: int):
        if remaining == 0:
            result.append(current[:])
            return

        for i in range(start, len(candidates)):
            if candidates[i] > remaining:
                break

            # Skip duplicates at the same level
            if i > start and candidates[i] == candidates[i - 1]:
                continue

            current.append(candidates[i])
            backtrack(i + 1, current, remaining - candidates[i])
            current.pop()

    backtrack(0, [], target)
    return result
```

---

### 2.4 N-Queens

**Problem:** Place n queens on an n x n chessboard so that no two queens attack each other.

**Approach:** Place queens row by row. For each row, try each column. Use sets to track
occupied columns and diagonals.

```python
def solve_n_queens(n: int) -> list[list[str]]:
    """
    Find all valid N-Queens configurations.

    Time:  O(n!) -- at most n choices for first row, n-1 for second, etc.
    Space: O(n) -- board state
    """
    result = []
    # Track occupied columns and diagonals
    cols = set()
    pos_diag = set()  # row + col (constant along / diagonals)
    neg_diag = set()  # row - col (constant along \\ diagonals)

    board = [["." for _ in range(n)] for _ in range(n)]

    def backtrack(row: int):
        if row == n:
            result.append(["".join(r) for r in board])
            return

        for col in range(n):
            if col in cols or (row + col) in pos_diag or (row - col) in neg_diag:
                continue

            # Place queen
            board[row][col] = "Q"
            cols.add(col)
            pos_diag.add(row + col)
            neg_diag.add(row - col)

            backtrack(row + 1)

            # Remove queen
            board[row][col] = "."
            cols.remove(col)
            pos_diag.remove(row + col)
            neg_diag.remove(row - col)

    backtrack(0)
    return result
```

**Diagonal key insight:**
- Positive diagonal (`/`): All cells on the same diagonal have the same `row + col`.
- Negative diagonal (`\`): All cells on the same diagonal have the same `row - col`.

---

### 2.5 Word Search

**Problem:** Given a 2D board of characters, determine if a word exists by following
adjacent cells (no cell reused).

```python
def exist(board: list[list[str]], word: str) -> bool:
    """
    Search for a word in a 2D grid via backtracking.

    Time:  O(m * n * 4^L) where L = word length
    Space: O(L) -- recursion depth
    """
    rows, cols = len(board), len(board[0])

    def backtrack(r: int, c: int, idx: int) -> bool:
        if idx == len(word):
            return True

        if (r < 0 or r >= rows or c < 0 or c >= cols
                or board[r][c] != word[idx]):
            return False

        # Mark as visited
        temp = board[r][c]
        board[r][c] = '#'

        # Explore 4 directions
        found = (
            backtrack(r + 1, c, idx + 1) or
            backtrack(r - 1, c, idx + 1) or
            backtrack(r, c + 1, idx + 1) or
            backtrack(r, c - 1, idx + 1)
        )

        # Restore
        board[r][c] = temp
        return found

    for r in range(rows):
        for c in range(cols):
            if backtrack(r, c, 0):
                return True

    return False
```

---

### 2.6 Palindrome Partitioning

**Problem:** Partition a string such that every substring is a palindrome.

```python
def partition(s: str) -> list[list[str]]:
    """
    Find all palindrome partitions.

    Time:  O(n * 2^n) -- 2^n partitions, O(n) palindrome check
    Space: O(n)
    """
    result = []

    def is_palindrome(sub: str) -> bool:
        return sub == sub[::-1]

    def backtrack(start: int, current: list[str]):
        if start == len(s):
            result.append(current[:])
            return

        for end in range(start + 1, len(s) + 1):
            substring = s[start:end]
            if is_palindrome(substring):
                current.append(substring)
                backtrack(end, current)
                current.pop()

    backtrack(0, [])
    return result
```

---

### 2.7 Sudoku Solver

```python
def solve_sudoku(board: list[list[str]]) -> None:
    """
    Solve a 9x9 Sudoku puzzle in-place.

    Time:  O(9^(empty cells)) worst case, much less with pruning
    Space: O(81) = O(1)
    """
    rows = [set() for _ in range(9)]
    cols = [set() for _ in range(9)]
    boxes = [set() for _ in range(9)]

    # Initialize existing numbers
    empty = []
    for r in range(9):
        for c in range(9):
            if board[r][c] != '.':
                num = board[r][c]
                rows[r].add(num)
                cols[c].add(num)
                boxes[(r // 3) * 3 + c // 3].add(num)
            else:
                empty.append((r, c))

    def backtrack(idx: int) -> bool:
        if idx == len(empty):
            return True

        r, c = empty[idx]
        box_idx = (r // 3) * 3 + c // 3

        for num in '123456789':
            if num in rows[r] or num in cols[c] or num in boxes[box_idx]:
                continue

            board[r][c] = num
            rows[r].add(num)
            cols[c].add(num)
            boxes[box_idx].add(num)

            if backtrack(idx + 1):
                return True

            board[r][c] = '.'
            rows[r].remove(num)
            cols[c].remove(num)
            boxes[box_idx].remove(num)

        return False

    backtrack(0)
```

---

## 3. Time Complexity Analysis

| Problem | # of Solutions | Time Complexity | Why |
|---------|---------------|----------------|-----|
| Subsets | 2^n | O(n * 2^n) | Include/exclude each element |
| Permutations | n! | O(n * n!) | n choices, then n-1, then n-2... |
| Combinations (k from n) | C(n,k) | O(k * C(n,k)) | Choosing k elements |
| Combination Sum | Varies | O(n^(T/M)) | Depends on target and min value |
| N-Queens | ~n! | O(n!) | Constrained placement |
| Word Search | 4^L | O(m*n * 4^L) | 4 choices per cell, L depth |
| Palindrome Partition | 2^n | O(n * 2^n) | Cut or don't cut at each position |
| Sudoku | 9^empty | O(9^E) | 9 choices per empty cell (with pruning much less) |

---

## 4. Common Interview Questions

| # | Problem | Difficulty | Category | Key Pruning |
|---|---------|-----------|----------|-------------|
| 1 | Subsets | Medium | Subsets | Start index prevents duplicates |
| 2 | Subsets II | Medium | Subsets | Sort + skip same-level duplicates |
| 3 | Permutations | Medium | Permutations | Used set or swap |
| 4 | Permutations II | Medium | Permutations | Counter to avoid duplicates |
| 5 | Combination Sum | Medium | Combinations | Sort + break when too large |
| 6 | Combination Sum II | Medium | Combinations | Skip same-level duplicates |
| 7 | Palindrome Partitioning | Medium | Partitioning | Only cut at palindromes |
| 8 | Word Search | Medium | Grid search | Bounds + visited check |
| 9 | N-Queens | Hard | Constraint | Column + diagonal sets |
| 10 | Sudoku Solver | Hard | Constraint | Row/col/box sets |
| 11 | Letter Combinations of Phone | Medium | Combinations | Digit-to-letter mapping |

---

## 5. Gotchas

### 5.1 Copy vs Reference
- **Always copy the current path** when adding to results: `result.append(current[:])` or
  `result.append(list(current))`. Without copying, all entries in `result` will reference the
  same (eventually empty) list.

### 5.2 Duplicate Handling
- **Sort first**, then skip duplicates at the same decision level: `if i > start and nums[i] == nums[i-1]: continue`.
- The `i > start` condition (not `i > 0`) ensures we only skip at the same recursion level.
- For permutations with duplicates, use a Counter approach instead of a used-set approach.

### 5.3 Start Index
- **Subsets/Combinations**: Pass `start` index to avoid revisiting earlier elements.
- **Permutations**: No start index needed -- any element can go at any position.
- **Combination Sum (unlimited use)**: Use `start = i` (same element can be reused).
- **Combination Sum II (single use)**: Use `start = i + 1`.

### 5.4 Backtrack Step
- Every mutation you make before recursing must be undone after recursing.
- Common mutations: `append/pop`, `add/remove`, `board[r][c] = 'Q'/'.'`, `visited.add/remove`.
- If using `board[r][c] = '#'` to mark visited cells, restore the original value.

### 5.5 Pruning Effectiveness
- Sorting the input enables early termination: `if candidates[i] > remaining: break`.
- For N-Queens, using sets for columns/diagonals makes each check O(1) instead of O(n).
- Always prune BEFORE recursing, not after. This avoids unnecessary function calls.

---

## 6. Quick Reference

| Pattern | When to Use | Template | Time | Key Detail |
|---------|-------------|----------|------|------------|
| Subsets | Generate power set | `for i in range(start, n)` | O(n * 2^n) | Start index prevents reuse |
| Permutations | All orderings | `for num in remaining` | O(n * n!) | Track used elements |
| Combinations | Choose k from n | `for i in range(start, n)` | O(k * C(n,k)) | Stop when `len == k` |
| Combination Sum | Target sum, reuse allowed | `backtrack(i, ...)` | O(n^(T/M)) | Same index for reuse |
| Combination Sum II | Target sum, no reuse | `backtrack(i+1, ...)` | O(2^n) | Skip same-level duplicates |
| Grid search | Find path in 2D | `for dr,dc in directions` | O(4^L) | Mark/unmark visited |
| Constraint satisfaction | Place items under rules | Check constraints before placing | Varies | Use sets for fast validation |
| Partitioning | Split string/array | `for end in range(start+1, n+1)` | O(n * 2^n) | Validate each partition |
