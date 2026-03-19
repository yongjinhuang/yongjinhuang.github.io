# Stack - LeetCode Hot 100

Stack problems are among the most versatile in coding interviews. The key insight is recognizing when a problem has a **last-in, first-out (LIFO)** dependency structure.

---

## Core Stack Patterns

### 1. Matching / Balancing

Use a stack to match opening and closing delimiters. Push openers, pop on closers, and validate the match.

### 2. Monotonic Stack

Maintain a stack where elements are in strictly increasing or decreasing order. This efficiently solves "next greater/smaller element" problems in O(n) time instead of O(n^2).

- **Monotonic Decreasing Stack**: Find the _next greater_ element. Pop when current > top.
- **Monotonic Increasing Stack**: Find the _next smaller_ element. Pop when current < top.

### 3. Simulation / Evaluation

Use a stack to simulate processes that require backtracking or deferred evaluation (e.g., RPN, calculators).

### 4. Generation / Backtracking

Use a stack (or recursion, which is an implicit stack) to generate valid combinations by tracking state.

---

## Problem 1. Valid Parentheses (LC #20) - Easy

**Problem**: Given a string `s` containing only `()[]{}`, determine if the input string is valid. Every open bracket must be closed by the same type in the correct order.

**Pattern**: Matching / Balancing

### Approach

Push every opening bracket onto the stack. When encountering a closing bracket, check that the stack is non-empty and the top matches. At the end, the stack must be empty.

A hash map from closing to opening brackets keeps the matching logic clean.

### Solution

```python
def is_valid(s: str) -> bool:
    stack: list[str] = []
    match = {")": "(", "]": "[", "}": "{"}

    for ch in s:
        if ch in match:
            if not stack or stack[-1] != match[ch]:
                return False
            stack.pop()
        else:
            stack.append(ch)

    return len(stack) == 0
```

**Time**: O(n) - single pass through the string
**Space**: O(n) - stack can hold up to n/2 openers
**Edge Cases**:

- Empty string -> True
- Single character -> False
- Only openers `"((("` -> False
- Correct types but wrong order `"([)]"` -> False
- Nested valid `"{[()]}"` -> True

---

## Problem 2. Min Stack (LC #155) - Medium

**Problem**: Design a stack that supports `push`, `pop`, `top`, and `getMin` -- all in O(1) time.

**Pattern**: Auxiliary stack / paired values

### Approach

Maintain a second stack (or pair each value with its running minimum) that tracks the minimum at every level. When we push, we also push the new minimum. When we pop, we pop from both. `getMin` simply reads the top of the min stack.

Storing `(value, current_min)` tuples in a single stack is the cleanest approach.

### Solution

```python
class MinStack:
    def __init__(self) -> None:
        self._stack: list[tuple[int, int]] = []

    def push(self, val: int) -> None:
        current_min = min(val, self._stack[-1][1]) if self._stack else val
        self._stack.append((val, current_min))

    def pop(self) -> None:
        self._stack.pop()

    def top(self) -> int:
        return self._stack[-1][0]

    def get_min(self) -> int:
        return self._stack[-1][1]
```

**Time**: O(1) for all operations
**Space**: O(n) - each element stores a tuple
**Edge Cases**:

- Push a single element then `getMin` -> returns that element
- All elements the same -> min never changes
- Push decreasing values then pop them -> min updates correctly on pop
- Push `[2, 0, 3]`, pop `3`, `getMin` still returns `0`

---

## Problem 3. Evaluate Reverse Polish Notation (LC #150) - Medium

**Problem**: Evaluate an arithmetic expression in Reverse Polish Notation. Valid operators are `+`, `-`, `*`, `/`. Each operand is an integer. Division truncates toward zero.

**Pattern**: Simulation / Evaluation

### Approach

Walk through the tokens. If it is a number, push it. If it is an operator, pop two operands (the second popped is the _left_ operand), apply the operator, and push the result. The final answer is the single value left on the stack.

Python's `//` rounds toward negative infinity, but the problem requires truncation toward zero, so use `int(a / b)` instead.

### Solution

```python
def eval_rpn(tokens: list[str]) -> int:
    stack: list[int] = []
    operators = {"+", "-", "*", "/"}

    for token in tokens:
        if token in operators:
            b = stack.pop()
            a = stack.pop()
            if token == "+":
                stack.append(a + b)
            elif token == "-":
                stack.append(a - b)
            elif token == "*":
                stack.append(a * b)
            else:
                stack.append(int(a / b))
        else:
            stack.append(int(token))

    return stack[0]
```

**Time**: O(n) - single pass through tokens
**Space**: O(n) - stack holds intermediate results
**Edge Cases**:

- Single number `["42"]` -> returns `42`
- Negative numbers `["-3", "4", "+"]` -> returns `1`
- Division truncation toward zero: `7 / -2` = `-3`, not `-4`
- Large expressions with many nested operations

---

## Problem 4. Generate Parentheses (LC #22) - Medium

**Problem**: Given `n` pairs of parentheses, generate all combinations of well-formed parentheses.

**Pattern**: Generation / Backtracking (implicit stack via recursion)

### Approach

Use backtracking with two counters: `open_count` and `close_count`. At each step:

- If `open_count < n`, we can add `(`.
- If `close_count < open_count`, we can add `)`.
- If `open_count == close_count == n`, we have a valid combination.

This naturally prunes invalid states so we never generate malformed strings.

### Solution

```python
def generate_parenthesis(n: int) -> list[str]:
    result: list[str] = []

    def backtrack(current: list[str], open_count: int, close_count: int) -> None:
        if open_count == close_count == n:
            result.append("".join(current))
            return

        if open_count < n:
            current.append("(")
            backtrack(current, open_count + 1, close_count)
            current.pop()

        if close_count < open_count:
            current.append(")")
            backtrack(current, open_count, close_count + 1)
            current.pop()

    backtrack([], 0, 0)
    return result
```

**Time**: O(4^n / sqrt(n)) - the nth Catalan number bounds the valid combinations
**Space**: O(n) - recursion depth is 2n, and each path builds a string of length 2n
**Edge Cases**:

- `n = 0` -> `[]`
- `n = 1` -> `["()"]`
- `n = 2` -> `["(())", "()()"]`
- `n = 3` -> 5 combinations (Catalan number C3 = 5)

---

## Problem 5. Daily Temperatures (LC #739) - Medium

**Problem**: Given an array of daily temperatures, return an array where `answer[i]` is the number of days you have to wait after day `i` to get a warmer temperature. If no future day is warmer, set it to `0`.

**Pattern**: Monotonic Decreasing Stack

### Approach

Iterate through temperatures while maintaining a stack of indices whose answers we have not yet determined. The stack stores indices in decreasing order of temperature. When the current temperature is warmer than the temperature at the top index, we have found the answer for that index: the distance is `current_index - top_index`. Pop and repeat until the stack top is no longer colder.

### Solution

```python
def daily_temperatures(temperatures: list[int]) -> list[int]:
    n = len(temperatures)
    answer = [0] * n
    stack: list[int] = []  # indices, decreasing by temperature

    for i, temp in enumerate(temperatures):
        while stack and temperatures[stack[-1]] < temp:
            prev_idx = stack.pop()
            answer[prev_idx] = i - prev_idx
        stack.append(i)

    return answer
```

**Time**: O(n) - each index is pushed and popped at most once
**Space**: O(n) - stack can hold all indices in the worst case (descending input)
**Edge Cases**:

- Strictly decreasing temperatures -> all zeros
- Strictly increasing temperatures -> all ones except last (which is zero)
- All temperatures identical -> all zeros
- Single element -> `[0]`

---

## Problem 6. Car Fleet (LC #853) - Medium

**Problem**: There are `n` cars heading to a `target` destination. Car `i` starts at `position[i]` with speed `speed[i]`. A car can never pass another car; it slows down to match. When two cars meet, they form a fleet. Return the number of fleets arriving at the target.

**Pattern**: Monotonic Stack (sort + merge from the front)

### Approach

1. Pair each car's position and speed, then sort by position descending (closest to target first).
2. Calculate each car's time to reach the target: `(target - position) / speed`.
3. A car behind a slower car (higher arrival time) will catch up and merge into the fleet. A car behind a faster car (lower arrival time) will never catch up and forms its own fleet.
4. Iterate through sorted arrival times. If the current car's time exceeds the time of the fleet in front, it cannot merge -- it starts a new fleet.

### Solution

```python
def car_fleet(target: int, position: list[int], speed: list[int]) -> int:
    cars = sorted(zip(position, speed), reverse=True)
    fleets = 0
    current_slowest = 0.0

    for pos, spd in cars:
        arrival_time = (target - pos) / spd
        if arrival_time > current_slowest:
            fleets += 1
            current_slowest = arrival_time

    return fleets
```

**Time**: O(n log n) - dominated by the sort
**Space**: O(n) - for the sorted pairs
**Edge Cases**:

- Single car -> 1 fleet
- All cars at same position with same speed -> 1 fleet
- All cars at different positions with same speed -> n fleets (no car catches another)
- Car at target already (position == target) -> arrival time is 0, may be merged into
- Two cars, slower one is ahead -> they merge into 1 fleet

---

## Problem 7. Largest Rectangle in Histogram (LC #84) - Hard

**Problem**: Given an array of integers `heights` representing a histogram bar chart where each bar has width 1, find the area of the largest rectangle that fits entirely within the histogram.

**Pattern**: Monotonic Increasing Stack

### Approach

The key insight: for each bar, the largest rectangle using that bar's height extends left and right until hitting a shorter bar. We need to efficiently find the nearest shorter bar on each side.

Use a monotonic increasing stack of indices. When we encounter a bar shorter than the stack top, we pop and calculate the area using the popped bar's height. The width extends from the new stack top (left boundary) to the current index (right boundary).

A sentinel value of `0` appended to the end forces all remaining bars to be processed.

### Solution

```python
def largest_rectangle_area(heights: list[int]) -> int:
    stack: list[int] = [-1]  # sentinel index for left boundary
    max_area = 0

    for i, h in enumerate(heights):
        while stack[-1] != -1 and heights[stack[-1]] >= h:
            height = heights[stack.pop()]
            width = i - stack[-1] - 1
            max_area = max(max_area, height * width)
        stack.append(i)

    # process remaining bars in the stack
    while stack[-1] != -1:
        height = heights[stack.pop()]
        width = len(heights) - stack[-1] - 1
        max_area = max(max_area, height * width)

    return max_area
```

**Time**: O(n) - each bar is pushed and popped at most once
**Space**: O(n) - stack space
**Edge Cases**:

- Single bar `[5]` -> area is `5`
- All bars same height `[3, 3, 3]` -> area is `3 * 3 = 9`
- Strictly increasing `[1, 2, 3]` -> area is `4` (middle two bars)
- Strictly decreasing `[3, 2, 1]` -> area is `4` (first two bars)
- Contains zero-height bars -> these act as barriers
- Very large histogram values -> no overflow issues in Python

---

## Summary Table

| #   | Problem              | Difficulty | Pattern         | Time           | Space |
| --- | -------------------- | ---------- | --------------- | -------------- | ----- |
| 20  | Valid Parentheses    | Easy       | Matching        | O(n)           | O(n)  |
| 155 | Min Stack            | Medium     | Auxiliary Stack | O(1)           | O(n)  |
| 150 | Evaluate RPN         | Medium     | Simulation      | O(n)           | O(n)  |
| 22  | Generate Parentheses | Medium     | Backtracking    | O(4^n/sqrt(n)) | O(n)  |
| 739 | Daily Temperatures   | Medium     | Monotonic Stack | O(n)           | O(n)  |
| 853 | Car Fleet            | Medium     | Sort + Stack    | O(n log n)     | O(n)  |
| 84  | Largest Rectangle    | Hard       | Monotonic Stack | O(n)           | O(n)  |

## Key Takeaways

1. **Monotonic stack** is the most important stack pattern for interviews. If you see "next greater/smaller element" or "extend until shorter/taller," think monotonic stack.
2. **Matching problems** are the easiest stack problems. Push openers, pop on closers, validate.
3. **Sentinel values** (like `-1` as a base index) simplify boundary handling and eliminate special cases.
4. **Sort first** when position/order matters but the natural order is not the processing order (Car Fleet).
5. **Python division gotcha**: `//` floors toward negative infinity. Use `int(a / b)` for truncation toward zero.
