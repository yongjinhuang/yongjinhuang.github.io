# Stacks & Queues

Stacks and queues are fundamental data structures that appear in a wide range of interview
problems. The key advanced pattern here is the **monotonic stack** -- a stack that maintains
elements in sorted order. For queues, the primary interview pattern is **BFS** and using a
deque for sliding window problems.

---

## 1. Core Concepts

### 1.1 Stack (LIFO)

Last-In, First-Out. In Python, use a regular `list` with `append()` and `pop()`.

```python
stack = []
stack.append(1)   # push
stack.append(2)
top = stack[-1]   # peek: 2
val = stack.pop() # pop: 2
```

**When to use a stack:**

- Matching parentheses/brackets
- Nearest smaller/larger element (monotonic stack)
- Expression evaluation (postfix, infix)
- DFS (explicit stack instead of recursion)
- Undo operations

### 1.2 Queue (FIFO)

First-In, First-Out. In Python, use `collections.deque` for O(1) operations on both ends.

```python
from collections import deque

queue = deque()
queue.append(1)     # enqueue (right)
queue.append(2)
val = queue.popleft()  # dequeue (left): 1
```

**Never use `list` as a queue.** `list.pop(0)` is O(n) because it shifts all elements.

**When to use a queue:**

- BFS (level-order traversal)
- Sliding window maximum (deque)
- Task scheduling (round-robin)
- Stream processing

### 1.3 Monotonic Stack

A stack where elements are maintained in monotonically increasing or decreasing order.
When you push a new element, you pop all elements that violate the monotonic property.

**Monotonic decreasing stack** (most common): elements decrease from bottom to top.
Used to find the **next greater element**.

```python
def next_greater_template(nums):
    """Template: find next greater element for each position."""
    n = len(nums)
    result = [-1] * n
    stack = []  # stores indices

    for i in range(n):
        # Pop elements smaller than current (they found their next greater)
        while stack and nums[stack[-1]] < nums[i]:
            idx = stack.pop()
            result[idx] = nums[i]
        stack.append(i)

    return result
```

---

## 2. Classic Problems

### 2.1 Valid Parentheses

**Problem:** Given a string containing `()[]{}`, determine if the input is valid.

**Approach:** Push opening brackets onto the stack. For each closing bracket, check that
the stack is not empty and the top matches.

```python
def is_valid(s: str) -> bool:
    """
    Check if parentheses string is valid.

    Time:  O(n)
    Space: O(n) -- stack can hold up to n/2 opening brackets
    """
    matching = {')': '(', ']': '[', '}': '{'}
    stack = []

    for char in s:
        if char in matching:
            # Closing bracket
            if not stack or stack[-1] != matching[char]:
                return False
            stack.pop()
        else:
            # Opening bracket
            stack.append(char)

    return len(stack) == 0
```

---

### 2.2 Min Stack

**Problem:** Design a stack that supports push, pop, top, and retrieving the minimum element,
all in O(1) time.

**Approach:** Maintain a parallel stack that tracks the minimum at each level. When you push,
also push `min(val, current_min)` onto the min stack.

```python
class MinStack:
    """
    Stack with O(1) minimum retrieval.

    All operations: O(1) time
    Space: O(n)
    """

    def __init__(self):
        self.stack = []
        self.min_stack = []

    def push(self, val: int) -> None:
        self.stack.append(val)
        current_min = min(val, self.min_stack[-1] if self.min_stack else val)
        self.min_stack.append(current_min)

    def pop(self) -> None:
        self.stack.pop()
        self.min_stack.pop()

    def top(self) -> int:
        return self.stack[-1]

    def get_min(self) -> int:
        return self.min_stack[-1]
```

**Space optimization:** Instead of storing the min at every level, you can store only when
the min changes. But the standard approach above is cleaner and preferred in interviews.

---

### 2.3 Daily Temperatures

**Problem:** Given daily temperatures, for each day find how many days you have to wait for
a warmer temperature. If no warmer day exists, put 0.

**Approach:** Monotonic decreasing stack. Iterate through temperatures; for each one, pop all
stack entries with lower temperatures (they found their answer).

```python
def daily_temperatures(temperatures: list[int]) -> list[int]:
    """
    Days until warmer temperature for each day.

    Time:  O(n) -- each index pushed and popped at most once
    Space: O(n) -- stack
    """
    n = len(temperatures)
    result = [0] * n
    stack = []  # stores indices of days waiting for a warmer day

    for i in range(n):
        while stack and temperatures[stack[-1]] < temperatures[i]:
            prev_day = stack.pop()
            result[prev_day] = i - prev_day
        stack.append(i)

    return result
```

---

### 2.4 Next Greater Element

**Problem:** For each element in `nums1` (a subset of `nums2`), find the next greater element
in `nums2`.

```python
def next_greater_element(
    nums1: list[int], nums2: list[int]
) -> list[int]:
    """
    Find next greater element for elements of nums1 in nums2.

    Time:  O(n + m) where n = len(nums1), m = len(nums2)
    Space: O(m)
    """
    # Build next-greater map for all elements in nums2
    next_greater = {}
    stack = []

    for num in nums2:
        while stack and stack[-1] < num:
            next_greater[stack.pop()] = num
        stack.append(num)

    return [next_greater.get(num, -1) for num in nums1]
```

---

### 2.5 Largest Rectangle in Histogram

**Problem:** Given an array of bar heights, find the area of the largest rectangle that can
be formed in the histogram.

**Approach:** For each bar, find how far it can extend to the left and right (bounded by
shorter bars). Use a monotonic increasing stack: when a bar is shorter than the stack top,
the popped bar's right boundary is the current index and left boundary is the new stack top.

```python
def largest_rectangle_area(heights: list[int]) -> int:
    """
    Largest rectangle in histogram.

    Time:  O(n) -- each bar pushed and popped at most once
    Space: O(n)
    """
    stack = []  # stores indices; heights in stack are monotonically increasing
    max_area = 0

    for i, h in enumerate(heights):
        start = i
        while stack and stack[-1][1] > h:
            idx, height = stack.pop()
            max_area = max(max_area, height * (i - idx))
            start = idx  # current bar can extend back to popped bar's position
        stack.append((start, h))

    # Process remaining bars (they extend to the end)
    for idx, height in stack:
        max_area = max(max_area, height * (len(heights) - idx))

    return max_area
```

**Alternative approach (with sentinel):**

```python
def largest_rectangle_area_sentinel(heights: list[int]) -> int:
    """
    Using sentinel values to avoid post-loop processing.

    Time:  O(n)
    Space: O(n)
    """
    heights = [0] + heights + [0]  # add sentinels
    stack = [0]  # stack of indices
    max_area = 0

    for i in range(1, len(heights)):
        while heights[i] < heights[stack[-1]]:
            h = heights[stack.pop()]
            w = i - stack[-1] - 1
            max_area = max(max_area, h * w)
        stack.append(i)

    return max_area
```

---

### 2.6 Sliding Window Maximum

**Problem:** Given an array and window size `k`, return the maximum element in each window
as the window slides from left to right.

**Approach:** Use a monotonic decreasing deque. The front of the deque always holds the
index of the current window's maximum. Remove elements that fall outside the window and
elements smaller than the incoming element.

```python
from collections import deque

def max_sliding_window(nums: list[int], k: int) -> list[int]:
    """
    Maximum element in each sliding window of size k.

    Time:  O(n) -- each element added and removed from deque at most once
    Space: O(k) -- deque holds at most k elements
    """
    dq = deque()  # stores indices; values are monotonically decreasing
    result = []

    for i in range(len(nums)):
        # Remove elements outside the window
        while dq and dq[0] < i - k + 1:
            dq.popleft()

        # Remove elements smaller than current (they can never be the max)
        while dq and nums[dq[-1]] < nums[i]:
            dq.pop()

        dq.append(i)

        # Window is fully formed starting at index k-1
        if i >= k - 1:
            result.append(nums[dq[0]])

    return result
```

**Why deque, not heap?** A heap gives O(n log k) because removing arbitrary elements is
expensive. The deque approach is O(n) because each element enters and exits at most once.

---

## 3. Additional Important Problems

### 3.1 Evaluate Reverse Polish Notation

```python
def eval_rpn(tokens: list[str]) -> int:
    """
    Evaluate expression in Reverse Polish Notation.

    Time:  O(n)
    Space: O(n)
    """
    stack = []
    ops = {
        '+': lambda a, b: a + b,
        '-': lambda a, b: a - b,
        '*': lambda a, b: a * b,
        '/': lambda a, b: int(a / b),  # truncate toward zero
    }

    for token in tokens:
        if token in ops:
            b = stack.pop()
            a = stack.pop()
            stack.append(ops[token](a, b))
        else:
            stack.append(int(token))

    return stack[0]
```

### 3.2 Generate Parentheses

```python
def generate_parenthesis(n: int) -> list[str]:
    """
    Generate all valid combinations of n pairs of parentheses.

    Time:  O(4^n / sqrt(n)) -- Catalan number
    Space: O(n) -- recursion depth
    """
    result = []

    def backtrack(current: list[str], open_count: int, close_count: int):
        if len(current) == 2 * n:
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

### 3.3 Implement Queue Using Stacks

```python
class MyQueue:
    """
    Queue implemented with two stacks.
    Amortized O(1) per operation.
    """

    def __init__(self):
        self.in_stack = []   # for push
        self.out_stack = []  # for pop/peek

    def push(self, x: int) -> None:
        self.in_stack.append(x)

    def pop(self) -> int:
        self._transfer()
        return self.out_stack.pop()

    def peek(self) -> int:
        self._transfer()
        return self.out_stack[-1]

    def empty(self) -> bool:
        return not self.in_stack and not self.out_stack

    def _transfer(self) -> None:
        if not self.out_stack:
            while self.in_stack:
                self.out_stack.append(self.in_stack.pop())
```

### 3.4 Car Fleet

```python
def car_fleet(target: int, position: list[int], speed: list[int]) -> int:
    """
    Count number of car fleets arriving at target.

    Time:  O(n log n) -- sorting
    Space: O(n)
    """
    # Sort by position descending (car closest to target first)
    cars = sorted(zip(position, speed), reverse=True)
    stack = []  # stack of arrival times

    for pos, spd in cars:
        arrival_time = (target - pos) / spd
        # If this car arrives later than the car ahead, it forms a new fleet
        if not stack or arrival_time > stack[-1]:
            stack.append(arrival_time)

    return len(stack)
```

---

## 4. Common Interview Questions

| #   | Problem                        | Difficulty | Pattern                         | Key Insight                   |
| --- | ------------------------------ | ---------- | ------------------------------- | ----------------------------- |
| 1   | Valid Parentheses              | Easy       | Stack matching                  | Push open, match close        |
| 2   | Min Stack                      | Medium     | Auxiliary stack                 | Track min at each level       |
| 3   | Evaluate Reverse Polish        | Medium     | Operand stack                   | Pop two, compute, push result |
| 4   | Daily Temperatures             | Medium     | Monotonic decreasing stack      | Pop when warmer day found     |
| 5   | Next Greater Element           | Medium     | Monotonic stack + hash map      | Build next-greater map        |
| 6   | Car Fleet                      | Medium     | Stack of arrival times          | Sort by position descending   |
| 7   | Generate Parentheses           | Medium     | Backtracking with stack concept | Track open/close counts       |
| 8   | Sliding Window Maximum         | Hard       | Monotonic decreasing deque      | Front = current max           |
| 9   | Largest Rectangle in Histogram | Hard       | Monotonic increasing stack      | Width = right - left boundary |
| 10  | Trapping Rain Water            | Hard       | Stack or two pointers           | See Arrays chapter            |

---

## 5. Gotchas

### 5.1 Stack Gotchas

- **Empty stack check**: Always check `if stack` before `stack[-1]` or `stack.pop()`.
- **Monotonic stack direction**: For "next greater," use decreasing stack. For "next smaller,"
  use increasing stack. Getting this backward is the most common mistake.
- **Store indices, not values**: In monotonic stack problems, store indices so you can
  compute distances (like in daily temperatures).

### 5.2 Queue Gotchas

- **Never use `list.pop(0)`**: It is O(n). Always use `collections.deque.popleft()`.
- **Deque is not a queue-only structure**: `deque` supports O(1) operations on both ends.
  Don't confuse it with a strict queue.
- **BFS level tracking**: Use `for _ in range(len(queue))` to process one level at a time.

### 5.3 Monotonic Stack Gotchas

- **When to use decreasing vs increasing:**
  - Next **greater** element: decreasing stack (pop smaller elements)
  - Next **smaller** element: increasing stack (pop larger elements)
- **Circular arrays**: For problems like "Next Greater Element II" (circular), iterate
  through the array twice: `for i in range(2 * n)` with `i % n`.
- **Post-processing**: Don't forget elements remaining in the stack after the loop.
  They have no next greater/smaller element (result stays at default, usually -1).

### 5.4 Sliding Window Deque Gotchas

- **Window boundary**: Remove from front when `dq[0] < i - k + 1`, not `i - k`.
- **Window fully formed**: Results start at index `k - 1`, not `k`.
- **Don't confuse with sliding window sum**: The deque pattern is specifically for
  max/min in window. For sum, use prefix sums or a running sum.

---

## 6. Quick Reference

| Pattern                    | When to Use                 | Time    | Space | Key Steps                                   |
| -------------------------- | --------------------------- | ------- | ----- | ------------------------------------------- |
| Stack matching             | Parentheses, brackets, tags | O(n)    | O(n)  | Push open, check close against top          |
| Monotonic decreasing stack | Next greater element        | O(n)    | O(n)  | Pop smaller, record answer for popped       |
| Monotonic increasing stack | Next smaller element        | O(n)    | O(n)  | Pop larger, record answer for popped        |
| Min stack                  | O(1) min retrieval          | O(1)/op | O(n)  | Parallel min stack tracking current min     |
| Deque sliding window       | Max/min in fixed window     | O(n)    | O(k)  | Remove out-of-window, remove dominated      |
| Two stacks as queue        | Queue with stack operations | O(1)\*  | O(n)  | In-stack for push, out-stack for pop        |
| Stack for expression eval  | Postfix/infix evaluation    | O(n)    | O(n)  | Numbers on stack, operators trigger compute |
| Histogram stack            | Largest rectangle           | O(n)    | O(n)  | Increasing stack, width = right - left      |

\*Amortized O(1)
