# Two Pointers

The **Two Pointers** pattern uses two references that traverse a data structure in a coordinated way. This eliminates the need for nested loops, reducing O(n^2) brute force to O(n) in many cases.

---

## When to Use Two Pointers

- Sorted array or string problems
- Finding pairs or triplets that satisfy a condition
- Comparing elements from both ends
- Partitioning or rearranging elements in-place
- Problems involving palindromes or symmetric structures

## Common Templates

### Opposite-Direction Pointers (Converging)

Used when you need to compare or combine elements from both ends of a sorted array.

```python
def two_pointer_converging(arr: list[int]) -> None:
    left, right = 0, len(arr) - 1
    while left < right:
        if condition(arr[left], arr[right]):
            left += 1
        else:
            right -= 1
```

### Same-Direction Pointers (Fast/Slow)

Used for partitioning, removing duplicates, or cycle detection.

```python
def two_pointer_same_direction(arr: list[int]) -> int:
    slow = 0
    for fast in range(len(arr)):
        if condition(arr[fast]):
            arr[slow] = arr[fast]
            slow += 1
    return slow
```

### Shrinking Window for Optimization

Used when you want to maximize/minimize some quantity by choosing where to shrink.

```python
def shrinking_window(arr: list[int]) -> int:
    left, right = 0, len(arr) - 1
    result = 0
    while left < right:
        result = max(result, compute(arr, left, right))
        if arr[left] < arr[right]:
            left += 1
        else:
            right -= 1
    return result
```

---

## Problem 1. Valid Palindrome (LC #125) - Easy

**Problem**: Given a string `s`, return `true` if it is a palindrome after converting all uppercase letters to lowercase and removing all non-alphanumeric characters.

**Pattern**: Opposite-direction (converging) pointers

### Approach

Place one pointer at the start and one at the end. Skip non-alphanumeric characters. Compare the lowercase versions of the characters at each pointer. If they ever differ, the string is not a palindrome.

### Solution

```python
class Solution:
    def isPalindrome(self, s: str) -> bool:
        left, right = 0, len(s) - 1

        while left < right:
            while left < right and not s[left].isalnum():
                left += 1
            while left < right and not s[right].isalnum():
                right -= 1

            if s[left].lower() != s[right].lower():
                return False

            left += 1
            right -= 1

        return True
```

**Time**: O(n) - single pass through the string
**Space**: O(1) - no extra space used
**Edge Cases**:

- Empty string or single character returns `True`
- String with only non-alphanumeric characters (e.g., `" "`) returns `True`
- Mixed case: `"Aa"` is a palindrome
- Strings with numbers: `"0P"` is not a palindrome

---

## Problem 2. Two Sum II - Input Array Is Sorted (LC #167) - Medium

**Problem**: Given a 1-indexed sorted array `numbers`, find two numbers that add up to `target`. Return their 1-indexed positions as `[index1, index2]`. Exactly one solution is guaranteed.

**Pattern**: Opposite-direction (converging) pointers on a sorted array

### Approach

Start with pointers at both ends. If the sum is too large, move the right pointer left to decrease it. If the sum is too small, move the left pointer right to increase it. The sorted order guarantees convergence to the answer.

### Solution

```python
class Solution:
    def twoSum(self, numbers: list[int], target: int) -> list[int]:
        left, right = 0, len(numbers) - 1

        while left < right:
            current_sum = numbers[left] + numbers[right]

            if current_sum == target:
                return [left + 1, right + 1]
            elif current_sum < target:
                left += 1
            else:
                right -= 1

        return []  # unreachable given problem constraints
```

**Time**: O(n) - each pointer moves at most n times
**Space**: O(1) - constant extra space
**Edge Cases**:

- Minimum array length of 2
- Negative numbers in the array
- Duplicate values (e.g., `[1, 1, 2]`, target `2`)
- Target requires the first and last elements

---

## Problem 3. 3Sum (LC #15) - Medium

**Problem**: Given an integer array `nums`, return all unique triplets `[nums[i], nums[j], nums[k]]` such that `i != j != k` and `nums[i] + nums[j] + nums[k] == 0`.

**Pattern**: Sort + fix one element + two-pointer search for the remaining pair

### Approach

Sort the array first. For each element `nums[i]`, use two pointers on the remaining subarray to find pairs that sum to `-nums[i]`. Skip duplicates at every level to avoid repeated triplets.

### Solution

```python
class Solution:
    def threeSum(self, nums: list[int]) -> list[list[int]]:
        nums.sort()
        result: list[list[int]] = []

        for i in range(len(nums) - 2):
            # Skip duplicate values for the first element
            if i > 0 and nums[i] == nums[i - 1]:
                continue

            # Early termination: smallest possible sum is too large
            if nums[i] > 0:
                break

            left, right = i + 1, len(nums) - 1
            target = -nums[i]

            while left < right:
                current_sum = nums[left] + nums[right]

                if current_sum == target:
                    result.append([nums[i], nums[left], nums[right]])

                    # Skip duplicates for the second element
                    while left < right and nums[left] == nums[left + 1]:
                        left += 1
                    # Skip duplicates for the third element
                    while left < right and nums[right] == nums[right - 1]:
                        right -= 1

                    left += 1
                    right -= 1
                elif current_sum < target:
                    left += 1
                else:
                    right -= 1

        return result
```

**Time**: O(n^2) - sorting is O(n log n), two-pointer loop inside a for loop is O(n^2)
**Space**: O(1) - excluding the output array (sort is in-place)
**Edge Cases**:

- Array with fewer than 3 elements returns `[]`
- All zeros: `[0, 0, 0]` returns `[[0, 0, 0]]`
- No valid triplet exists
- Many duplicate values (e.g., `[-1, -1, -1, 2, 2, 2]`)

---

## Problem 4. Container With Most Water (LC #11) - Medium

**Problem**: Given `n` non-negative integers `height[0..n-1]` where each represents a vertical line at position `i`, find two lines that together with the x-axis form a container holding the most water.

**Pattern**: Opposite-direction (converging) pointers with greedy shrinking

### Approach

Start with the widest container (pointers at both ends). The area is `min(height[left], height[right]) * (right - left)`. Always move the pointer pointing to the shorter line inward, because keeping the shorter line and shrinking width can never increase area. Moving the taller line inward would only decrease or maintain the height constraint while reducing width.

### Solution

```python
class Solution:
    def maxArea(self, height: list[int]) -> int:
        left, right = 0, len(height) - 1
        max_water = 0

        while left < right:
            width = right - left
            water = min(height[left], height[right]) * width
            max_water = max(max_water, water)

            if height[left] <= height[right]:
                left += 1
            else:
                right -= 1

        return max_water
```

**Time**: O(n) - each pointer moves at most n times
**Space**: O(1) - constant extra space
**Edge Cases**:

- Two elements: area is `min(h[0], h[1]) * 1`
- All heights equal: first iteration gives the max area
- Strictly increasing or decreasing heights
- One height is 0: that side contributes zero area

---

## Problem 5. Move Zeroes (LC #283) - Easy

**Problem**: Given an integer array `nums`, move all `0`s to the end while maintaining the relative order of the non-zero elements. Must be done in-place.

**Pattern**: Same-direction (fast/slow) pointers for partitioning

### Approach

Use a slow pointer to track where the next non-zero element should be placed. The fast pointer scans through the array. When the fast pointer finds a non-zero element, swap it with the position at the slow pointer and advance both. This preserves relative order of non-zero elements and pushes zeros to the end.

### Solution

```python
class Solution:
    def moveZeroes(self, nums: list[int]) -> None:
        slow = 0

        for fast in range(len(nums)):
            if nums[fast] != 0:
                nums[slow], nums[fast] = nums[fast], nums[slow]
                slow += 1
```

**Time**: O(n) - single pass through the array
**Space**: O(1) - in-place swaps
**Edge Cases**:

- No zeros in the array (no swaps happen, order preserved)
- All zeros (slow pointer never advances)
- Single element array
- Zeros only at the beginning: `[0, 0, 1]` becomes `[1, 0, 0]`

---

## Problem 6. Trapping Rain Water (LC #42) - Hard

**Problem**: Given `n` non-negative integers representing an elevation map where the width of each bar is 1, compute how much water it can trap after raining.

**Pattern**: Opposite-direction pointers tracking running max heights from each side

### Approach

Water above each bar is determined by `min(max_left, max_right) - height[i]`. Instead of precomputing both arrays, use two pointers from each end. Track `left_max` and `right_max` as the pointers converge. Process whichever side has the smaller max, because we know the other side has a wall at least as tall, so the water level at that position is determined by the smaller side.

### Solution

```python
class Solution:
    def trap(self, height: list[int]) -> int:
        if len(height) < 3:
            return 0

        left, right = 0, len(height) - 1
        left_max, right_max = height[left], height[right]
        water = 0

        while left < right:
            if left_max <= right_max:
                left += 1
                left_max = max(left_max, height[left])
                water += left_max - height[left]
            else:
                right -= 1
                right_max = max(right_max, height[right])
                water += right_max - height[right]

        return water
```

**Time**: O(n) - single pass with converging pointers
**Space**: O(1) - only tracking two max values
**Edge Cases**:

- Fewer than 3 bars: impossible to trap water
- Flat elevation (all same height): no water trapped
- Strictly ascending or descending: no water trapped
- Single peak (mountain shape): water fills both sides
- Valley shape `[3, 0, 3]`: traps 3 units

---

## Summary

| #   | Problem                   | Difficulty | Pattern                       | Time   | Space |
| --- | ------------------------- | ---------- | ----------------------------- | ------ | ----- |
| 125 | Valid Palindrome          | Easy       | Converging pointers           | O(n)   | O(1)  |
| 167 | Two Sum II                | Medium     | Converging on sorted array    | O(n)   | O(1)  |
| 15  | 3Sum                      | Medium     | Sort + fix one + two pointers | O(n^2) | O(1)  |
| 11  | Container With Most Water | Medium     | Greedy converging             | O(n)   | O(1)  |
| 283 | Move Zeroes               | Easy       | Fast/slow partitioning        | O(n)   | O(1)  |
| 42  | Trapping Rain Water       | Hard       | Converging with running max   | O(n)   | O(1)  |
