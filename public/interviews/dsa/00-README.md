# Data Structures & Algorithms Interview Preparation Guide

## Overview

This directory contains comprehensive DSA interview preparation materials covering **12 core topics** with Python implementations, complexity analysis, and problem-solving strategies. Each guide includes deep explanations, well-commented code, classic interview problems, common gotchas, and quick reference tables.

## How to Use

1. **Start with the Cheatsheet** -- Skim `12-PATTERNS-CHEATSHEET.md` to understand the landscape of patterns.
2. **Study by Priority Tier** -- Focus on Tier 1 topics first; they appear in nearly every technical interview.
3. **Solve Problems Alongside** -- Each file references LeetCode problems. Solve them as you read.
4. **Understand, Don't Memorize** -- Focus on _why_ each approach works, not just the code.
5. **Track Complexity** -- Every solution includes time and space analysis. Know these cold.

## Table of Contents

### Tier 1: Must Know (Asked in 90%+ of interviews)

| #   | File                                                   | Topic               | Key Concepts                                           |
| --- | ------------------------------------------------------ | ------------------- | ------------------------------------------------------ |
| 1   | [01-ARRAYS-HASHING.md](01-ARRAYS-HASHING.md)           | Arrays & Hashing    | Two pointers, sliding window, prefix sums, hash maps   |
| 2   | [02-LINKED-LISTS.md](02-LINKED-LISTS.md)               | Linked Lists        | Reversal, cycle detection, merge, dummy node technique |
| 3   | [04-TREES.md](04-TREES.md)                             | Trees & BST         | Traversals, validation, LCA, serialize/deserialize     |
| 4   | [05-GRAPHS.md](05-GRAPHS.md)                           | Graphs              | BFS, DFS, topological sort, shortest path, union-find  |
| 5   | [06-DYNAMIC-PROGRAMMING.md](06-DYNAMIC-PROGRAMMING.md) | Dynamic Programming | Memoization, tabulation, 1D/2D DP, interval DP         |
| 6   | [07-BINARY-SEARCH.md](07-BINARY-SEARCH.md)             | Binary Search       | Sorted arrays, rotated arrays, search on answer        |

### Tier 2: Frequently Asked (Asked in 60-80% of interviews)

| #   | File                                                       | Topic                   | Key Concepts                                      |
| --- | ---------------------------------------------------------- | ----------------------- | ------------------------------------------------- |
| 7   | [03-STACKS-QUEUES.md](03-STACKS-QUEUES.md)                 | Stacks & Queues         | Monotonic stack, BFS patterns, sliding window max |
| 8   | [08-HEAPS-PRIORITY-QUEUES.md](08-HEAPS-PRIORITY-QUEUES.md) | Heaps & Priority Queues | Top-K, merge K lists, two-heap median             |
| 9   | [09-BACKTRACKING.md](09-BACKTRACKING.md)                   | Backtracking            | Subsets, permutations, N-Queens, pruning          |
| 10  | [11-INTERVALS-GREEDY.md](11-INTERVALS-GREEDY.md)           | Intervals & Greedy      | Merge intervals, meeting rooms, jump game         |

### Tier 3: Good to Know (Asked in 30-50% of interviews)

| #   | File                                                   | Topic                    | Key Concepts                             |
| --- | ------------------------------------------------------ | ------------------------ | ---------------------------------------- |
| 11  | [10-TRIES-ADVANCED.md](10-TRIES-ADVANCED.md)           | Tries & Bit Manipulation | Trie operations, word search, bit tricks |
| 12  | [12-PATTERNS-CHEATSHEET.md](12-PATTERNS-CHEATSHEET.md) | Patterns & Cheat Sheet   | All patterns, Big-O table, Python tips   |

## Study Plan

### Week 1: Foundations (15-20 hours)

| Day | Topic             | Focus                                  |
| --- | ----------------- | -------------------------------------- |
| Mon | Arrays & Hashing  | Two pointers, hash map patterns        |
| Tue | Arrays & Hashing  | Sliding window, prefix sums            |
| Wed | Linked Lists      | Reversal, fast-slow pointers           |
| Thu | Stacks & Queues   | Monotonic stack, BFS with queue        |
| Fri | Binary Search     | Templates, rotated array               |
| Sat | Trees             | Traversals, recursive patterns         |
| Sun | Review + Practice | Solve 5-10 problems from Week 1 topics |

### Week 2: Intermediate (15-20 hours)

| Day | Topic               | Focus                                  |
| --- | ------------------- | -------------------------------------- |
| Mon | Trees (continued)   | BST validation, LCA, serialize         |
| Tue | Graphs              | BFS, DFS, connected components         |
| Wed | Graphs (continued)  | Topological sort, shortest path        |
| Thu | Heaps               | Top-K, merge K sorted, two heaps       |
| Fri | Dynamic Programming | 1D DP: stairs, robber, coins           |
| Sat | Dynamic Programming | 2D DP: paths, LCS, edit distance       |
| Sun | Review + Practice   | Solve 5-10 problems from Week 2 topics |

### Week 3: Advanced (15-20 hours)

| Day     | Topic                    | Focus                                  |
| ------- | ------------------------ | -------------------------------------- |
| Mon     | Backtracking             | Subsets, permutations, combination sum |
| Tue     | Backtracking             | N-Queens, word search, pruning         |
| Wed     | Intervals & Greedy       | Merge/insert intervals, meeting rooms  |
| Thu     | Tries & Bit Manipulation | Trie implementation, bit tricks        |
| Fri     | Patterns Cheatsheet      | Review all patterns, Python tips       |
| Sat-Sun | Mock Interviews          | Time yourself: 45 min per problem      |

## Difficulty Legend

Throughout the guides, problems are rated:

| Rating | Meaning                      | Target Time |
| ------ | ---------------------------- | ----------- |
| Easy   | Warm-up, pattern recognition | 10-15 min   |
| Medium | Standard interview question  | 20-30 min   |
| Hard   | Stretch goal, senior-level   | 30-45 min   |

## Python-Specific Notes

- All solutions use **Python 3.10+** syntax
- We use `collections` module extensively (`defaultdict`, `Counter`, `deque`)
- `heapq` is a min-heap; for max-heap, negate values
- `bisect` module for binary search on sorted lists
- Type hints are included for clarity
- All code follows PEP 8 conventions
