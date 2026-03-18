# Arrays & Hashing - LeetCode Hot 100

Core idea: use hash maps / sets for O(1) lookups to reduce brute-force O(n^2) solutions down to O(n).

---

## Problem 1. Two Sum (LC #1) - Easy

**Problem**: Given an array of integers `nums` and an integer `target`, return the indices of the two numbers that add up to `target`. Each input has exactly one solution, and you may not use the same element twice.

**Pattern**: Hash map complement lookup

### Approach

Iterate through the array once. For each number, compute `complement = target - num`. If the complement already exists in a hash map, return both indices. Otherwise, store the current number and its index in the map.

### Solution

```python
class Solution:
    def twoSum(self, nums: list[int], target: int) -> list[int]:
        seen: dict[int, int] = {}  # value -> index

        for i, num in enumerate(nums):
            complement = target - num
            if complement in seen:
                return [seen[complement], i]
            seen[num] = i

        # Problem guarantees exactly one solution
        return []
```

**Time**: O(n) - single pass through the array
**Space**: O(n) - hash map stores up to n elements
**Edge Cases**:
- Negative numbers (complement logic still works)
- Duplicate values (e.g., `[3, 3]` with target 6 - works because we check before inserting)
- Array of length 2 (minimum valid input)

---

## Problem 2. Contains Duplicate (LC #217) - Easy

**Problem**: Given an integer array `nums`, return `true` if any value appears at least twice, and `false` if every element is distinct.

**Pattern**: Hash set for seen-element tracking

### Approach

Add elements to a set one by one. If an element is already in the set, we found a duplicate. Alternatively, compare the set size with the array length.

### Solution

```python
class Solution:
    def containsDuplicate(self, nums: list[int]) -> bool:
        seen: set[int] = set()

        for num in nums:
            if num in seen:
                return True
            seen.add(num)

        return False
```

**Time**: O(n) - single pass, O(1) average set lookup
**Space**: O(n) - set stores up to n elements
**Edge Cases**:
- Empty array or single element (no duplicates possible)
- All elements identical (return `True` immediately on second element)
- Very large values (hash set handles arbitrary integers)

---

## Problem 3. Valid Anagram (LC #242) - Easy

**Problem**: Given two strings `s` and `t`, return `true` if `t` is an anagram of `s` (same characters, same frequencies, rearranged).

**Pattern**: Frequency counting with hash map

### Approach

Count character frequencies in both strings and compare. Use `Counter` for concise code. An early exit on length mismatch avoids unnecessary work.

### Solution

```python
from collections import Counter


class Solution:
    def isAnagram(self, s: str, t: str) -> bool:
        if len(s) != len(t):
            return False

        return Counter(s) == Counter(t)
```

**Time**: O(n) - where n is the length of the strings
**Space**: O(1) - at most 26 lowercase English letters in the counter
**Edge Cases**:
- Different lengths (immediately `False`)
- Empty strings (both empty is `True`)
- Single character strings
- Unicode follow-up: use the same approach; space becomes O(k) where k is the character set size

---

## Problem 4. Group Anagrams (LC #49) - Medium

**Problem**: Given an array of strings `strs`, group the anagrams together. You can return the answer in any order.

**Pattern**: Hash map with canonical key (sorted string or character count tuple)

### Approach

Two strings are anagrams if they produce the same key when sorted. Use the sorted string as a hash map key, and collect all strings sharing the same key into a list.

### Solution

```python
from collections import defaultdict


class Solution:
    def groupAnagrams(self, strs: list[str]) -> list[list[str]]:
        groups: dict[str, list[str]] = defaultdict(list)

        for s in strs:
            key = "".join(sorted(s))
            groups[key].append(s)

        return list(groups.values())
```

Alternative using character count tuple as key (avoids sorting per string):

```python
from collections import defaultdict


class Solution:
    def groupAnagrams(self, strs: list[str]) -> list[list[str]]:
        groups: dict[tuple[int, ...], list[str]] = defaultdict(list)

        for s in strs:
            count = [0] * 26
            for ch in s:
                count[ord(ch) - ord("a")] += 1
            groups[tuple(count)].append(s)

        return list(groups.values())
```

**Time**: O(n * k log k) for sorted-key approach, O(n * k) for count-tuple approach - where n is the number of strings and k is the max string length
**Space**: O(n * k) - storing all strings in the hash map
**Edge Cases**:
- Empty string `""` (valid anagram group by itself)
- Single-character strings
- All strings are the same
- All strings are unique (each forms its own group)

---

## Problem 5. Top K Frequent Elements (LC #347) - Medium

**Problem**: Given an integer array `nums` and an integer `k`, return the `k` most frequent elements. Answer may be returned in any order. Guaranteed to be unique.

**Pattern**: Bucket sort by frequency (O(n)) or heap (O(n log k))

### Approach

Use bucket sort: create an array of buckets where index = frequency. Count element frequencies first, then place elements into the bucket matching their frequency. Walk buckets from highest to lowest, collecting elements until we have k.

### Solution

```python
from collections import Counter


class Solution:
    def topKFrequent(self, nums: list[int], k: int) -> list[int]:
        count = Counter(nums)

        # Bucket sort: index = frequency, value = list of elements with that frequency
        # Max possible frequency is len(nums)
        buckets: list[list[int]] = [[] for _ in range(len(nums) + 1)]
        for num, freq in count.items():
            buckets[freq].append(num)

        result: list[int] = []
        for freq in range(len(buckets) - 1, 0, -1):
            for num in buckets[freq]:
                result.append(num)
                if len(result) == k:
                    return result

        return result
```

**Time**: O(n) - counting is O(n), bucket sort is O(n)
**Space**: O(n) - counter and buckets
**Edge Cases**:
- k equals the number of distinct elements (return all)
- k = 1 (return the single most frequent)
- All elements have the same frequency
- Array with one element

---

## Problem 6. Product of Array Except Self (LC #238) - Medium

**Problem**: Given an integer array `nums`, return an array `answer` such that `answer[i]` is the product of all elements except `nums[i]`. Must run in O(n) time. **Cannot use division.**

**Pattern**: Prefix and suffix products

### Approach

Build the result in two passes. First pass (left to right): store the running prefix product for each position. Second pass (right to left): multiply each position by the running suffix product. Each position ends up with the product of everything to its left times everything to its right.

### Solution

```python
class Solution:
    def productExceptSelf(self, nums: list[int]) -> list[int]:
        n = len(nums)
        result = [1] * n

        # Left pass: result[i] = product of all elements to the left of i
        prefix = 1
        for i in range(n):
            result[i] = prefix
            prefix *= nums[i]

        # Right pass: multiply by product of all elements to the right of i
        suffix = 1
        for i in range(n - 1, -1, -1):
            result[i] *= suffix
            suffix *= nums[i]

        return result
```

**Time**: O(n) - two linear passes
**Space**: O(1) - output array does not count as extra space per problem statement
**Edge Cases**:
- Array contains zero (products involving zero are handled naturally)
- Array contains multiple zeros (all products become 0 except none)
- Negative numbers (signs cancel correctly via multiplication)
- Array of length 2

---

## Problem 7. Longest Consecutive Sequence (LC #128) - Medium

**Problem**: Given an unsorted array of integers `nums`, return the length of the longest consecutive elements sequence. Must run in O(n) time.

**Pattern**: Hash set with sequence-start detection

### Approach

Put all numbers in a set. For each number, check if it is the start of a sequence (i.e., `num - 1` is not in the set). If it is a start, count how far the consecutive run extends. This ensures each element is visited at most twice total.

### Solution

```python
class Solution:
    def longestConsecutive(self, nums: list[int]) -> int:
        num_set = set(nums)
        longest = 0

        for num in num_set:
            # Only start counting from the beginning of a sequence
            if num - 1 not in num_set:
                current = num
                length = 1

                while current + 1 in num_set:
                    current += 1
                    length += 1

                longest = max(longest, length)

        return longest
```

**Time**: O(n) - each number is visited at most twice (once in the outer loop, once in a while-loop extension)
**Space**: O(n) - hash set
**Edge Cases**:
- Empty array (return 0)
- Duplicates (set deduplicates them; `[1, 1, 2]` has longest = 2)
- Single element (longest = 1)
- Negative numbers (consecutive means -3, -2, -1, 0, ...)
- Already sorted or reverse sorted (still O(n))

---

## Problem 8. Encode and Decode Strings (LC #271) - Medium

**Problem**: Design an algorithm to encode a list of strings into a single string, and decode that single string back into the original list. The strings can contain any possible characters including delimiters.

**Pattern**: Length-prefix encoding

### Approach

Encode each string as `<length>#<string>`. The length prefix tells the decoder exactly how many characters to read, so no delimiter conflicts are possible regardless of string content.

### Solution

```python
class Codec:
    def encode(self, strs: list[str]) -> str:
        """Encodes a list of strings to a single string."""
        return "".join(f"{len(s)}#{s}" for s in strs)

    def decode(self, s: str) -> list[str]:
        """Decodes a single string to a list of strings."""
        result: list[str] = []
        i = 0

        while i < len(s):
            # Find the '#' delimiter that separates length from content
            j = s.index("#", i)
            length = int(s[i:j])
            # Extract exactly 'length' characters after the '#'
            result.append(s[j + 1 : j + 1 + length])
            i = j + 1 + length

        return result
```

**Time**: O(n) - where n is the total number of characters across all strings
**Space**: O(1) - extra space beyond the output (the encoded/decoded result itself is required output)
**Edge Cases**:
- Empty list `[]` (encode returns `""`, decode returns `[]`)
- List containing empty strings `["", ""]` (encoded as `"0#0#"`)
- Strings containing `#` characters (length prefix prevents ambiguity)
- Strings containing digits (length prefix parsing stops at `#`)
- Strings with newlines, spaces, or any special characters

---

## Summary Table

| # | Problem | Difficulty | Key Technique | Time | Space |
|---|---------|-----------|---------------|------|-------|
| 1 | Two Sum | Easy | Hash map complement | O(n) | O(n) |
| 217 | Contains Duplicate | Easy | Hash set | O(n) | O(n) |
| 242 | Valid Anagram | Easy | Frequency count | O(n) | O(1) |
| 49 | Group Anagrams | Medium | Sorted key / count tuple | O(nk log k) | O(nk) |
| 347 | Top K Frequent | Medium | Bucket sort | O(n) | O(n) |
| 238 | Product Except Self | Medium | Prefix + suffix product | O(n) | O(1) |
| 128 | Longest Consecutive | Medium | Set + sequence start | O(n) | O(n) |
| 271 | Encode/Decode Strings | Medium | Length-prefix encoding | O(n) | O(1) |
