# LeetCode Hot 100 - Python Solutions

The **LeetCode Hot 100** is the most popular problem set for coding interviews. This guide contains complete Python solutions with detailed explanations, time/space complexity analysis, and pattern recognition tips.

---

## How to Use

1. **Study by category** - Problems are grouped by pattern/data structure
2. **Understand the pattern first** - Read the approach before looking at code
3. **Code it yourself** - Try solving before reading the solution
4. **Analyze complexity** - Every solution includes Big-O analysis
5. **Review edge cases** - Each problem notes common pitfalls

## Table of Contents

| # | File | Category | Problems |
|---|------|----------|----------|
| 1 | [01-ARRAYS-HASHING.md](01-ARRAYS-HASHING.md) | Arrays & Hashing | Two Sum, Group Anagrams, Top K Frequent, Valid Anagram, Product of Array Except Self, Longest Consecutive Sequence, Encode/Decode Strings, Contains Duplicate |
| 2 | [02-TWO-POINTERS.md](02-TWO-POINTERS.md) | Two Pointers | 3Sum, Container With Most Water, Trapping Rain Water, Two Sum II, Valid Palindrome, Move Zeroes |
| 3 | [03-SLIDING-WINDOW.md](03-SLIDING-WINDOW.md) | Sliding Window | Longest Substring Without Repeating Characters, Minimum Window Substring, Sliding Window Maximum, Longest Repeating Character Replacement, Permutation in String, Minimum Size Subarray Sum |
| 4 | [04-STACK.md](04-STACK.md) | Stack | Valid Parentheses, Min Stack, Evaluate Reverse Polish Notation, Daily Temperatures, Largest Rectangle in Histogram, Car Fleet, Generate Parentheses |
| 5 | [05-BINARY-SEARCH.md](05-BINARY-SEARCH.md) | Binary Search | Search in Rotated Sorted Array, Find Minimum in Rotated Sorted Array, Binary Search, Koko Eating Bananas, Search a 2D Matrix, Median of Two Sorted Arrays, Find First and Last Position |
| 6 | [06-LINKED-LIST.md](06-LINKED-LIST.md) | Linked List | Reverse Linked List, Merge Two Sorted Lists, Linked List Cycle, Remove Nth Node From End, Reorder List, Add Two Numbers, LRU Cache, Merge K Sorted Lists, Copy List with Random Pointer |
| 7 | [07-TREES.md](07-TREES.md) | Trees | Invert Binary Tree, Maximum Depth, Same Tree, Subtree of Another Tree, Lowest Common Ancestor, Binary Tree Level Order Traversal, Validate BST, Kth Smallest Element in BST, Construct Binary Tree, Binary Tree Right Side View, Serialize and Deserialize, Diameter of Binary Tree |
| 8 | [08-GRAPHS.md](08-GRAPHS.md) | Graphs | Number of Islands, Clone Graph, Pacific Atlantic Water Flow, Course Schedule, Course Schedule II, Graph Valid Tree, Number of Connected Components, Rotting Oranges, Word Ladder |
| 9 | [09-DYNAMIC-PROGRAMMING.md](09-DYNAMIC-PROGRAMMING.md) | Dynamic Programming | Climbing Stairs, House Robber, House Robber II, Longest Palindromic Substring, Coin Change, Word Break, Longest Increasing Subsequence, Unique Paths, Decode Ways, Jump Game, Maximum Subarray, Partition Equal Subset Sum, Edit Distance |
| 10 | [10-BACKTRACKING.md](10-BACKTRACKING.md) | Backtracking | Subsets, Combination Sum, Permutations, Word Search, Palindrome Partitioning, Letter Combinations of Phone Number, N-Queens, Subsets II, Combination Sum II |
| 11 | [11-HEAP-GREEDY-INTERVALS.md](11-HEAP-GREEDY-INTERVALS.md) | Heap, Greedy & Intervals | Merge Intervals, Insert Interval, Non-overlapping Intervals, Meeting Rooms II, Top K Frequent Elements, Find Median from Data Stream, Task Scheduler, Kth Largest Element, Jump Game II |
| 12 | [12-MATRIX-MATH-BIT.md](12-MATRIX-MATH-BIT.md) | Matrix, Math & Bit Manipulation | Set Matrix Zeroes, Spiral Matrix, Rotate Image, Word Search, Happy Number, Plus One, Pow(x,n), Counting Bits, Single Number, Number of 1 Bits, Missing Number, Reverse Bits |

## Difficulty Distribution

| Difficulty | Count | Percentage |
|------------|-------|------------|
| Easy | ~25 | 25% |
| Medium | ~55 | 55% |
| Hard | ~20 | 20% |

## Quick Reference: Top Patterns

| Pattern | When to Use | Example Problems |
|---------|-------------|------------------|
| Hash Map | Need O(1) lookup, counting, grouping | Two Sum, Group Anagrams |
| Two Pointers | Sorted array, pair finding | 3Sum, Container With Most Water |
| Sliding Window | Contiguous subarray/substring | Longest Substring, Min Window |
| Monotonic Stack | Next greater/smaller element | Daily Temperatures, Largest Rectangle |
| BFS/DFS | Tree/graph traversal | Number of Islands, Level Order |
| Binary Search | Sorted data, search on answer | Search Rotated, Koko Bananas |
| Dynamic Programming | Optimal substructure + overlapping subproblems | Coin Change, House Robber |
| Backtracking | Generate all combinations/permutations | Subsets, Permutations |
| Union-Find | Connected components, cycle detection | Number of Islands, Graph Valid Tree |
| Heap | Top-K, running median | Find Median, Top K Frequent |

## Python Tips for Interviews

```python
# Useful imports
from collections import defaultdict, Counter, deque
from heapq import heappush, heappop, heapify
from bisect import bisect_left, bisect_right
from itertools import accumulate
from functools import lru_cache
from typing import List, Optional

# Max/min heap
import heapq
heapq.heappush(heap, val)       # min-heap
heapq.heappush(heap, -val)      # max-heap trick

# Infinity
float('inf'), float('-inf')

# Default dict patterns
graph = defaultdict(list)
freq = Counter(nums)

# Sorting with key
intervals.sort(key=lambda x: x[0])

# Binary search
from bisect import bisect_left
idx = bisect_left(arr, target)
```
