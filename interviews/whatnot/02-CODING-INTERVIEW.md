# Round 2: Technical Assessment - Live Coding

## Format
- **Duration**: 1 hour on HackerRank (live, with interviewer)
- **Difficulty**: LeetCode Medium to Medium-Hard (rated 3.2/5.0)
- **Language**: Your choice (Python recommended given Whatnot's main backend)
- **Style**: 1-2 problems, solve while explaining your thought process
- **Focus**: Correctness over optimization — clean working solutions matter most

## Strategy for the Interview

### Time Management (60 minutes)
```
0-5 min   → Read problem, ask clarifying questions
5-10 min  → Discuss approach with interviewer
10-40 min → Implement solution
40-50 min → Test with edge cases
50-60 min → Optimize if needed, discuss complexity
```

### Communication Tips
- **Think aloud**: Explain your reasoning as you code
- **Ask clarifications**: Input size? Edge cases? Can I use built-in methods?
- **Start simple**: Brute force first, then optimize
- **Test your code**: Walk through examples line by line

---

## Reported Questions from Whatnot

### 1. Group Anagrams

**Problem**: Given an array of strings, group the anagrams together.

```python
def group_anagrams(strs: list[str]) -> list[list[str]]:
    groups = {}
    for s in strs:
        key = ''.join(sorted(s))
        if key not in groups:
            groups[key] = []
        groups[key].append(s)
    return list(groups.values())

# Alternative: Use character count as key (O(n*k) vs O(n*k*log(k)))
def group_anagrams_optimal(strs: list[str]) -> list[list[str]]:
    groups = {}
    for s in strs:
        count = [0] * 26
        for c in s:
            count[ord(c) - ord('a')] += 1
        key = tuple(count)
        if key not in groups:
            groups[key] = []
        groups[key].append(s)
    return list(groups.values())
```

**Key Insight**: Sort each string as key, or use character frequency tuple for O(n*k).

**LeetCode**: [49. Group Anagrams](https://leetcode.com/problems/group-anagrams/)

---

### 2. Word Search

**Problem**: Given an m x n grid of characters and a string word, return true if word exists in the grid (adjacent cells, no reuse).

```python
def exist(board: list[list[str]], word: str) -> bool:
    rows, cols = len(board), len(board[0])

    def dfs(r: int, c: int, i: int) -> bool:
        if i == len(word):
            return True
        if (r < 0 or r >= rows or c < 0 or c >= cols
                or board[r][c] != word[i]):
            return False

        # Mark as visited
        temp = board[r][c]
        board[r][c] = '#'

        found = (dfs(r + 1, c, i + 1) or dfs(r - 1, c, i + 1)
                 or dfs(r, c + 1, i + 1) or dfs(r, c - 1, i + 1))

        # Restore
        board[r][c] = temp
        return found

    for r in range(rows):
        for c in range(cols):
            if dfs(r, c, 0):
                return True
    return False
```

**Key Insight**: Backtracking DFS with in-place visited marking. Time: O(m*n*4^L).

**LeetCode**: [79. Word Search](https://leetcode.com/problems/word-search/)

---

### 3. Number of Islands

**Problem**: Given an m x n 2D binary grid of '1's (land) and '0's (water), return the number of islands.

```python
def num_islands(grid: list[list[str]]) -> int:
    if not grid:
        return 0

    rows, cols = len(grid), len(grid[0])
    count = 0

    def dfs(r: int, c: int) -> None:
        if (r < 0 or r >= rows or c < 0 or c >= cols
                or grid[r][c] != '1'):
            return
        grid[r][c] = '0'  # Mark visited
        dfs(r + 1, c)
        dfs(r - 1, c)
        dfs(r, c + 1)
        dfs(r, c - 1)

    for r in range(rows):
        for c in range(cols):
            if grid[r][c] == '1':
                count += 1
                dfs(r, c)

    return count
```

**Key Insight**: DFS/BFS flood fill. Each unvisited '1' starts a new island.

**LeetCode**: [200. Number of Islands](https://leetcode.com/problems/number-of-islands/)

---

### 4. Implement Trie (Prefix Tree)

**Problem**: Implement a trie with insert, search, and startsWith methods.

**Multiple candidates confirmed trie problems appear at Whatnot.**

```python
class TrieNode:
    def __init__(self):
        self.children = {}
        self.is_end = False

class Trie:
    def __init__(self):
        self.root = TrieNode()

    def insert(self, word: str) -> None:
        node = self.root
        for ch in word:
            if ch not in node.children:
                node.children[ch] = TrieNode()
            node = node.children[ch]
        node.is_end = True

    def search(self, word: str) -> bool:
        node = self._find(word)
        return node is not None and node.is_end

    def starts_with(self, prefix: str) -> bool:
        return self._find(prefix) is not None

    def _find(self, prefix: str) -> TrieNode | None:
        node = self.root
        for ch in prefix:
            if ch not in node.children:
                return None
            node = node.children[ch]
        return node
```

**Key Insight**: Each node stores children as dict. Search vs startsWith differs only in checking is_end.

**LeetCode**: [208. Implement Trie](https://leetcode.com/problems/implement-trie-prefix-tree/)

---

### 5. Word Search II (Trie + Backtracking)

**Problem**: Given an m x n board and a list of words, find all words that exist in the board.

```python
class TrieNode:
    def __init__(self):
        self.children = {}
        self.word = None

def find_words(board: list[list[str]], words: list[str]) -> list[str]:
    # Build trie from words
    root = TrieNode()
    for word in words:
        node = root
        for ch in word:
            if ch not in node.children:
                node.children[ch] = TrieNode()
            node = node.children[ch]
        node.word = word

    rows, cols = len(board), len(board[0])
    result = []

    def dfs(r: int, c: int, node: TrieNode) -> None:
        if (r < 0 or r >= rows or c < 0 or c >= cols):
            return
        ch = board[r][c]
        if ch not in node.children:
            return

        next_node = node.children[ch]
        if next_node.word is not None:
            result.append(next_node.word)
            next_node.word = None  # Avoid duplicates

        board[r][c] = '#'  # Mark visited
        dfs(r + 1, c, next_node)
        dfs(r - 1, c, next_node)
        dfs(r, c + 1, next_node)
        dfs(r, c - 1, next_node)
        board[r][c] = ch  # Restore

        # Prune empty branches
        if not next_node.children:
            del node.children[ch]

    for r in range(rows):
        for c in range(cols):
            dfs(r, c, root)

    return result
```

**Key Insight**: Build trie from word list, then DFS on board guided by trie. Prune empty branches for optimization.

**LeetCode**: [212. Word Search II](https://leetcode.com/problems/word-search-ii/)

---

### 6. Design Add and Search Words Data Structure

**Problem**: Design a data structure that supports adding words and searching with '.' wildcard.

```python
class WordDictionary:
    def __init__(self):
        self.root = {}

    def add_word(self, word: str) -> None:
        node = self.root
        for ch in word:
            if ch not in node:
                node[ch] = {}
            node = node[ch]
        node['$'] = True

    def search(self, word: str) -> bool:
        return self._search(word, 0, self.root)

    def _search(self, word: str, i: int, node: dict) -> bool:
        if i == len(word):
            return '$' in node

        ch = word[i]
        if ch == '.':
            # Try all children
            for child in node:
                if child != '$' and self._search(word, i + 1, node[child]):
                    return True
            return False

        if ch not in node:
            return False
        return self._search(word, i + 1, node[ch])
```

**Key Insight**: Trie + DFS for wildcard matching. The '.' wildcard requires exploring all children.

**LeetCode**: [211. Design Add and Search Words](https://leetcode.com/problems/design-add-and-search-words-data-structure/)

---

## High-Priority Patterns to Review

### Pattern 1: Trie (HIGHEST PRIORITY)

Multiple candidates confirmed trie problems. Master these:

```python
# Autocomplete system - relevant to Whatnot search
class AutocompleteSystem:
    def __init__(self, sentences: list[str], times: list[int]):
        self.root = {}
        self.search_term = ""
        for i, sentence in enumerate(sentences):
            self._insert(sentence, times[i])

    def _insert(self, sentence: str, count: int) -> None:
        node = self.root
        for ch in sentence:
            if ch not in node:
                node[ch] = {}
            node = node[ch]
        node['#'] = node.get('#', 0) + count

    def input(self, c: str) -> list[str]:
        if c == '#':
            self._insert(self.search_term, 1)
            self.search_term = ""
            return []
        self.search_term += c
        # Find prefix node
        node = self.root
        for ch in self.search_term:
            if ch not in node:
                return []
            node = node[ch]
        # DFS to find all completions
        results = []
        self._dfs(node, self.search_term, results)
        results.sort(key=lambda x: (-x[1], x[0]))
        return [r[0] for r in results[:3]]

    def _dfs(self, node: dict, path: str, results: list) -> None:
        if '#' in node:
            results.append((path, node['#']))
        for ch in node:
            if ch != '#':
                self._dfs(node[ch], path + ch, results)
```

**Practice**: LeetCode 208, 211, 212, 642

### Pattern 2: BFS/DFS on Grids and Graphs

```python
# BFS template for grid problems
from collections import deque

def bfs_grid(grid: list[list[int]], start: tuple[int, int]) -> int:
    rows, cols = len(grid), len(grid[0])
    queue = deque([(*start, 0)])  # (row, col, distance)
    visited = {start}
    directions = [(0, 1), (0, -1), (1, 0), (-1, 0)]

    while queue:
        r, c, dist = queue.popleft()
        for dr, dc in directions:
            nr, nc = r + dr, c + dc
            if (0 <= nr < rows and 0 <= nc < cols
                    and (nr, nc) not in visited
                    and grid[nr][nc] != 0):
                visited.add((nr, nc))
                queue.append((nr, nc, dist + 1))

    return len(visited)
```

**Practice**: LeetCode 200, 79, 130, 994, 417

### Pattern 3: Hash Maps

```python
# Two Sum - classic hash map pattern
def two_sum(nums: list[int], target: int) -> list[int]:
    seen = {}
    for i, num in enumerate(nums):
        complement = target - num
        if complement in seen:
            return [seen[complement], i]
        seen[num] = i
    return []
```

**Practice**: LeetCode 1, 49, 128, 380, 347

### Pattern 4: Sliding Window

```python
# Longest substring without repeating characters
def length_of_longest_substring(s: str) -> int:
    char_index = {}
    max_len = 0
    left = 0

    for right, ch in enumerate(s):
        if ch in char_index and char_index[ch] >= left:
            left = char_index[ch] + 1
        char_index[ch] = right
        max_len = max(max_len, right - left + 1)

    return max_len
```

**Practice**: LeetCode 3, 76, 239, 567

### Pattern 5: Graph Algorithms

```python
# Topological Sort (useful for dependency resolution)
from collections import deque

def topological_sort(num_courses: int, prerequisites: list[list[int]]) -> list[int]:
    graph = {i: [] for i in range(num_courses)}
    in_degree = {i: 0 for i in range(num_courses)}

    for course, prereq in prerequisites:
        graph[prereq].append(course)
        in_degree[course] += 1

    queue = deque([n for n in in_degree if in_degree[n] == 0])
    order = []

    while queue:
        node = queue.popleft()
        order.append(node)
        for neighbor in graph[node]:
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    return order if len(order) == num_courses else []
```

**Practice**: LeetCode 207, 210, 269, 743

---

## Domain-Relevant Coding Problems

### Real-Time Bid Processing

```python
# Process bids and determine winner with proxy bidding (Secret Max Bid)
def process_bid(
    current_price: int,
    current_winner: str | None,
    max_bids: dict[str, int],  # user_id -> max_bid
    new_bidder: str,
    new_bid: int
) -> tuple[int, str]:
    """
    Process a new bid with Secret Max Bid support.
    Returns (new_price, winner).
    """
    max_bids = {**max_bids, new_bidder: max(max_bids.get(new_bidder, 0), new_bid)}

    # Find top two max bids
    sorted_bidders = sorted(max_bids.items(), key=lambda x: -x[1])

    if len(sorted_bidders) == 1:
        return (current_price + 1, sorted_bidders[0][0])

    top_bidder, top_max = sorted_bidders[0]
    _, second_max = sorted_bidders[1]

    # Price is one increment above second-highest max bid
    new_price = min(second_max + 1, top_max)
    return (new_price, top_bidder)
```

### Rate Limiter (Token Bucket)

```python
import time

class TokenBucket:
    """Rate limiter for API endpoints - relevant to admission control."""

    def __init__(self, capacity: int, refill_rate: float):
        self.capacity = capacity
        self.tokens = capacity
        self.refill_rate = refill_rate  # tokens per second
        self.last_refill = time.time()

    def allow_request(self) -> bool:
        self._refill()
        if self.tokens >= 1:
            self.tokens -= 1
            return True
        return False

    def _refill(self) -> None:
        now = time.time()
        elapsed = now - self.last_refill
        new_tokens = elapsed * self.refill_rate
        self.tokens = min(self.capacity, self.tokens + new_tokens)
        self.last_refill = now
```

---

## LeetCode Practice List (Priority Order)

### Must Do (Top 15) - Trie & Graph Heavy
1. Implement Trie (#208) **[CRITICAL]**
2. Design Add and Search Words (#211) **[CRITICAL]**
3. Word Search II (#212) **[CRITICAL]**
4. Word Search (#79)
5. Number of Islands (#200)
6. Group Anagrams (#49)
7. Longest Substring Without Repeating Characters (#3)
8. Two Sum (#1)
9. Top K Frequent Elements (#347)
10. Course Schedule (#207)
11. Clone Graph (#133)
12. Pacific Atlantic Water Flow (#417)
13. LRU Cache (#146)
14. Merge Intervals (#56)
15. Maximum Subarray (#53)

### Should Do (Next 10)
16. Word Break (#139)
17. Rotting Oranges (#994)
18. Network Delay Time (#743)
19. Subsets (#78)
20. Letter Combinations of Phone Number (#17)
21. Search in Rotated Sorted Array (#33)
22. Container With Most Water (#11)
23. Insert Delete GetRandom O(1) (#380)
24. Min Stack (#155)
25. Product of Array Except Self (#238)

---

## HackerRank Environment Tips

- **Familiarize yourself**: Create a free HackerRank account and practice in their IDE
- **Auto-complete**: HackerRank has basic autocomplete but no VS Code-level IntelliSense
- **Test cases**: You can add custom test cases before submitting
- **Stdin/Stdout**: Some problems use stdin/stdout format (not function signatures)
- **Time limits**: Usually generous, but avoid O(n^3) solutions for n > 1000

## Common Mistakes to Avoid

1. **Jumping to code too fast** - Spend 5-10 min discussing approach first
2. **Not handling edge cases** - Empty arrays, single elements, negative numbers
3. **Off-by-one errors** - Double-check loop boundaries
4. **Forgetting to return** - Especially in recursive solutions
5. **Not testing** - Walk through at least 2 examples before submitting
6. **Over-engineering** - Start with the simplest correct solution
7. **Ignoring tries** - Multiple candidates confirmed trie problems despite being told otherwise
