# Matrix, Math & Bit Manipulation - LeetCode Hot 100

## Overview

This section covers three distinct but frequently tested categories: matrix traversal, mathematical reasoning, and bit manipulation. Mastering the underlying patterns makes most problems in these categories straightforward.

---

## Matrix Traversal Patterns

**Spiral Traversal**: Maintain four boundaries (top, bottom, left, right) and shrink them inward after traversing each edge.

**In-Place Marking**: Use the matrix itself as storage (e.g., mark rows/columns with a sentinel value) to achieve O(1) extra space.

**Layer-by-Layer Rotation**: For an N x N matrix, rotate elements in concentric rings from the outermost layer inward.

**Direction Vectors**: Encode movement as `[(0,1),(1,0),(0,-1),(-1,0)]` for right, down, left, up traversal.

---

## Common Math Tricks

**Cycle Detection**: Use Floyd's tortoise-and-hare algorithm to detect cycles in number sequences.

**Digit Extraction**: Use `n % 10` to get the last digit and `n // 10` to remove it.

**Fast Exponentiation**: Compute `x^n` in O(log n) by squaring the base and halving the exponent each step.

**Gauss Sum**: The sum of `0..n` is `n*(n+1)//2`, useful for finding missing elements.

---

## Common Bit Manipulation Tricks

| Operation               | Expression         | Purpose                       |
| ----------------------- | ------------------ | ----------------------------- |
| Check if bit `i` is set | `n & (1 << i)`     | Bit testing                   |
| Set bit `i`             | `n \| (1 << i)`    | Bit setting                   |
| Clear bit `i`           | `n & ~(1 << i)`    | Bit clearing                  |
| Toggle bit `i`          | `n ^ (1 << i)`     | Bit flipping                  |
| Clear lowest set bit    | `n & (n - 1)`      | Count bits, power-of-2 check  |
| Isolate lowest set bit  | `n & (-n)`         | Fenwick trees, LSB extraction |
| Check power of 2        | `n & (n - 1) == 0` | Single bit check              |
| XOR cancel              | `a ^ a == 0`       | Find unique element           |

**Key insight**: XOR is its own inverse. XORing all elements cancels duplicates, leaving the unique value.

---

## Problem 1. Set Matrix Zeroes (LC #73) - Medium

**Problem**: Given an `m x n` integer matrix, if an element is 0, set its entire row and column to 0. Do it in-place.

**Pattern**: In-place marking using first row/column as flags.

### Approach

Use the first row and first column of the matrix itself as markers. If `matrix[i][j] == 0`, set `matrix[i][0] = 0` and `matrix[0][j] = 0`. Then iterate again to zero out marked rows and columns. Handle the first row and first column separately with dedicated boolean flags to avoid overwriting markers.

### Solution

```python
def set_zeroes(matrix: list[list[int]]) -> None:
    m, n = len(matrix), len(matrix[0])
    first_row_zero = any(matrix[0][j] == 0 for j in range(n))
    first_col_zero = any(matrix[i][0] == 0 for i in range(m))

    # Mark zeros in first row/col
    for i in range(1, m):
        for j in range(1, n):
            if matrix[i][j] == 0:
                matrix[i][0] = 0
                matrix[0][j] = 0

    # Zero out cells based on markers
    for i in range(1, m):
        for j in range(1, n):
            if matrix[i][0] == 0 or matrix[0][j] == 0:
                matrix[i][j] = 0

    # Handle first row
    if first_row_zero:
        for j in range(n):
            matrix[0][j] = 0

    # Handle first column
    if first_col_zero:
        for i in range(m):
            matrix[i][0] = 0
```

**Time**: O(m \* n)
**Space**: O(1)
**Edge Cases**: Single row or column matrix; matrix with all zeros; no zeros at all.

---

## Problem 2. Spiral Matrix (LC #54) - Medium

**Problem**: Given an `m x n` matrix, return all elements in spiral order (clockwise from the outside in).

**Pattern**: Boundary shrinking with four pointers.

### Approach

Maintain four boundaries: `top`, `bottom`, `left`, `right`. Traverse the top row left-to-right, the right column top-to-bottom, the bottom row right-to-left, and the left column bottom-to-top. After each traversal, shrink the corresponding boundary. Stop when boundaries cross.

### Solution

```python
def spiral_order(matrix: list[list[int]]) -> list[int]:
    result: list[int] = []
    top, bottom = 0, len(matrix) - 1
    left, right = 0, len(matrix[0]) - 1

    while top <= bottom and left <= right:
        # Traverse right
        for col in range(left, right + 1):
            result.append(matrix[top][col])
        top += 1

        # Traverse down
        for row in range(top, bottom + 1):
            result.append(matrix[row][right])
        right -= 1

        # Traverse left
        if top <= bottom:
            for col in range(right, left - 1, -1):
                result.append(matrix[bottom][col])
            bottom -= 1

        # Traverse up
        if left <= right:
            for row in range(bottom, top - 1, -1):
                result.append(matrix[row][left])
            left += 1

    return result
```

**Time**: O(m \* n)
**Space**: O(1) excluding the output list
**Edge Cases**: Single element matrix; single row; single column; tall narrow matrix.

---

## Problem 3. Rotate Image (LC #48) - Medium

**Problem**: Rotate an `n x n` matrix 90 degrees clockwise in-place.

**Pattern**: Transpose then reverse rows (or layer-by-layer four-way swap).

### Approach

A 90-degree clockwise rotation is equivalent to transposing the matrix (swap `matrix[i][j]` with `matrix[j][i]`) and then reversing each row. This is simpler and less error-prone than the four-way swap approach.

### Solution

```python
def rotate(matrix: list[list[int]]) -> None:
    n = len(matrix)

    # Transpose
    for i in range(n):
        for j in range(i + 1, n):
            matrix[i][j], matrix[j][i] = matrix[j][i], matrix[i][j]

    # Reverse each row
    for row in matrix:
        row.reverse()
```

**Time**: O(n^2)
**Space**: O(1)
**Edge Cases**: 1x1 matrix (no-op); 2x2 matrix (simplest non-trivial case).

---

## Problem 4. Happy Number (LC #202) - Easy

**Problem**: A happy number is defined by the process of replacing it with the sum of the squares of its digits, repeating until the number equals 1 (happy) or loops endlessly in a cycle (not happy). Determine whether `n` is happy.

**Pattern**: Floyd's cycle detection (tortoise and hare).

### Approach

Use two pointers: a slow pointer that computes the digit-square sum once per step and a fast pointer that computes it twice. If they meet at 1, the number is happy. If they meet at any other value, there is a cycle and the number is not happy.

### Solution

```python
def is_happy(n: int) -> bool:
    def digit_square_sum(num: int) -> int:
        total = 0
        while num:
            num, digit = divmod(num, 10)
            total += digit * digit
        return total

    slow, fast = n, digit_square_sum(n)
    while fast != 1 and slow != fast:
        slow = digit_square_sum(slow)
        fast = digit_square_sum(digit_square_sum(fast))

    return fast == 1
```

**Time**: O(log n) -- the digit-square sum rapidly shrinks large numbers
**Space**: O(1)
**Edge Cases**: n = 1 (immediately happy); n = 2 (enters a cycle); very large n.

---

## Problem 5. Plus One (LC #66) - Easy

**Problem**: Given a large integer represented as an array of digits (most significant digit first), increment it by one and return the resulting array.

**Pattern**: Right-to-left digit processing with carry propagation.

### Approach

Walk from the least significant digit to the most significant. If a digit is less than 9, increment it and return immediately (no carry). If it is 9, set it to 0 and continue carrying. If the loop completes, all digits were 9 so prepend a 1.

### Solution

```python
def plus_one(digits: list[int]) -> list[int]:
    for i in range(len(digits) - 1, -1, -1):
        if digits[i] < 9:
            return digits[:i] + [digits[i] + 1] + digits[i + 1:]
        digits = digits[:i] + [0] + digits[i + 1:]

    return [1] + digits
```

**Time**: O(n)
**Space**: O(n) due to new list creation (immutable approach)
**Edge Cases**: `[9, 9, 9]` becomes `[1, 0, 0, 0]`; single digit `[0]` becomes `[1]`.

---

## Problem 6. Pow(x, n) (LC #50) - Medium

**Problem**: Implement `pow(x, n)`, computing `x` raised to the power `n`.

**Pattern**: Binary exponentiation (exponentiation by squaring).

### Approach

If `n` is negative, compute `pow(1/x, -n)`. Use iterative fast exponentiation: if the current bit of `n` is set, multiply the result by the current base. Square the base and halve the exponent each iteration.

### Solution

```python
def my_pow(x: float, n: int) -> float:
    if n < 0:
        x = 1 / x
        n = -n

    result = 1.0
    current_product = x

    while n > 0:
        if n & 1:
            result *= current_product
        current_product *= current_product
        n >>= 1

    return result
```

**Time**: O(log n)
**Space**: O(1)
**Edge Cases**: n = 0 (result is 1); x = 0 and n > 0; n = -2^31 (handle overflow by converting to positive carefully); x = 1 (always 1 regardless of n).

---

## Problem 7. Single Number (LC #136) - Easy

**Problem**: Given a non-empty array of integers where every element appears twice except for one, find that single one. Must run in linear time with constant extra space.

**Pattern**: XOR cancellation.

### Approach

XOR all elements together. Since `a ^ a = 0` and `a ^ 0 = a`, all duplicates cancel out and the unique element remains.

### Solution

```python
from functools import reduce
from operator import xor

def single_number(nums: list[int]) -> int:
    return reduce(xor, nums)
```

**Time**: O(n)
**Space**: O(1)
**Edge Cases**: Array with a single element; negative numbers (XOR works on two's complement).

---

## Problem 8. Number of 1 Bits (LC #191) - Easy

**Problem**: Given a positive integer, return the number of set bits (1s) in its binary representation (also known as Hamming weight).

**Pattern**: Brian Kernighan's bit clearing trick.

### Approach

The expression `n & (n - 1)` clears the lowest set bit. Count how many times this can be applied before `n` becomes 0.

### Solution

```python
def hamming_weight(n: int) -> int:
    count = 0
    while n:
        n &= n - 1
        count += 1
    return count
```

**Time**: O(k) where k is the number of set bits
**Space**: O(1)
**Edge Cases**: n = 0 (returns 0); n = 2^31 - 1 (all bits set, returns 31).

---

## Problem 9. Counting Bits (LC #338) - Easy

**Problem**: Given an integer `n`, return an array of length `n + 1` where `ans[i]` is the number of 1s in the binary representation of `i`.

**Pattern**: Dynamic programming using `i & (i - 1)`.

### Approach

For any number `i`, clearing its lowest set bit gives a smaller number `i & (i - 1)` whose bit count is already computed. So `dp[i] = dp[i & (i - 1)] + 1`.

### Solution

```python
def count_bits(n: int) -> list[int]:
    dp = [0] * (n + 1)
    for i in range(1, n + 1):
        dp[i] = dp[i & (i - 1)] + 1
    return dp
```

**Time**: O(n)
**Space**: O(n) for the output array
**Edge Cases**: n = 0 (returns `[0]`); n = 1 (returns `[0, 1]`).

---

## Problem 10. Missing Number (LC #268) - Easy

**Problem**: Given an array containing `n` distinct numbers in the range `[0, n]`, return the one number that is missing.

**Pattern**: XOR with indices or Gauss summation.

### Approach

XOR all numbers from `0` to `n` with all array elements. Since every number except the missing one appears in both the range and the array, they cancel out, leaving the missing number. Alternatively, use `expected_sum - actual_sum`.

### Solution

```python
def missing_number(nums: list[int]) -> int:
    n = len(nums)
    expected = n * (n + 1) // 2
    return expected - sum(nums)
```

**Alternative (XOR approach)**:

```python
from functools import reduce
from operator import xor

def missing_number_xor(nums: list[int]) -> int:
    n = len(nums)
    return reduce(xor, range(n + 1)) ^ reduce(xor, nums)
```

**Time**: O(n)
**Space**: O(1)
**Edge Cases**: Missing number is 0; missing number is n (the largest); array of length 1.

---

## Problem 11. Reverse Bits (LC #190) - Easy

**Problem**: Reverse the bits of a given 32-bit unsigned integer.

**Pattern**: Bit-by-bit extraction and placement.

### Approach

Extract the lowest bit of `n`, place it in the correct reversed position in the result, then shift `n` right. Repeat for all 32 bits.

### Solution

```python
def reverse_bits(n: int) -> int:
    result = 0
    for _ in range(32):
        result = (result << 1) | (n & 1)
        n >>= 1
    return result
```

**Time**: O(1) -- always 32 iterations
**Space**: O(1)
**Edge Cases**: n = 0 (returns 0); n = 2^32 - 1 (all bits set, returns same value); single bit set.

---

## Problem 12. Palindrome Number (LC #9) - Easy

**Problem**: Determine whether an integer is a palindrome. An integer is a palindrome when it reads the same backward as forward.

**Pattern**: Reverse half the digits and compare.

### Approach

Negative numbers and numbers ending in 0 (except 0 itself) are not palindromes. Reverse only the second half of the number by repeatedly extracting the last digit of `x` and building the reversed half. Stop when the reversed half is greater than or equal to the remaining `x`. Compare the two halves, accounting for odd-length numbers by dividing the reversed half by 10.

### Solution

```python
def is_palindrome(x: int) -> bool:
    if x < 0 or (x % 10 == 0 and x != 0):
        return False

    reversed_half = 0
    while x > reversed_half:
        reversed_half = reversed_half * 10 + x % 10
        x //= 10

    return x == reversed_half or x == reversed_half // 10
```

**Time**: O(log n) -- processes half the digits
**Space**: O(1)
**Edge Cases**: x = 0 (palindrome); negative numbers (not palindrome); single digit numbers (always palindrome); numbers ending in 0 like 10, 100.

---

## Quick Reference

| #   | Problem           | Difficulty | Key Technique           | Time     |
| --- | ----------------- | ---------- | ----------------------- | -------- |
| 73  | Set Matrix Zeroes | Medium     | First row/col as flags  | O(mn)    |
| 54  | Spiral Matrix     | Medium     | Boundary shrinking      | O(mn)    |
| 48  | Rotate Image      | Medium     | Transpose + reverse     | O(n^2)   |
| 202 | Happy Number      | Easy       | Floyd's cycle detection | O(log n) |
| 66  | Plus One          | Easy       | Carry propagation       | O(n)     |
| 50  | Pow(x, n)         | Medium     | Binary exponentiation   | O(log n) |
| 136 | Single Number     | Easy       | XOR cancellation        | O(n)     |
| 191 | Number of 1 Bits  | Easy       | Kernighan's trick       | O(k)     |
| 338 | Counting Bits     | Easy       | DP with bit clearing    | O(n)     |
| 268 | Missing Number    | Easy       | Gauss sum / XOR         | O(n)     |
| 190 | Reverse Bits      | Easy       | Bit-by-bit reversal     | O(1)     |
| 9   | Palindrome Number | Easy       | Reverse half digits     | O(log n) |
