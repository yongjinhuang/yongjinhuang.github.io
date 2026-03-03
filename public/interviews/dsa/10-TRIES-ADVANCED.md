# Tries & Bit Manipulation

Tries (prefix trees) are specialized tree structures for string operations. They excel at
prefix matching, autocomplete, and dictionary lookups. Bit manipulation is a separate topic
grouped here because both appear in "advanced" interview rounds and rely on non-obvious
tricks.

---

## 1. Trie (Prefix Tree)

### 1.1 Core Concept

A trie stores strings character by character. Each node represents a prefix, and paths from
root to marked nodes represent complete words.

**Properties:**
- Insertion: O(m) where m = word length
- Search: O(m)
- Prefix search: O(m)
- Space: O(ALPHABET_SIZE * m * n) where n = number of words

### 1.2 Trie Implementation

```python
class TrieNode:
    def __init__(self):
        self.children = {}
        self.is_end = False


class Trie:
    """
    Prefix tree for string operations.

    insert:      O(m) where m = word length
    search:      O(m)
    starts_with: O(m)
    Space:       O(total characters across all words)
    """

    def __init__(self):
        self.root = TrieNode()

    def insert(self, word: str) -> None:
        """Insert a word into the trie."""
        node = self.root
        for char in word:
            if char not in node.children:
                node.children[char] = TrieNode()
            node = node.children[char]
        node.is_end = True

    def search(self, word: str) -> bool:
        """Return True if the word exists in the trie."""
        node = self._find_prefix(word)
        return node is not None and node.is_end

    def starts_with(self, prefix: str) -> bool:
        """Return True if any word starts with the prefix."""
        return self._find_prefix(prefix) is not None

    def _find_prefix(self, prefix: str) -> TrieNode | None:
        """Traverse the trie following the prefix. Returns the last node or None."""
        node = self.root
        for char in prefix:
            if char not in node.children:
                return None
            node = node.children[char]
        return node
```

### 1.3 When to Use a Trie vs Hash Set

| Feature | Trie | Hash Set |
|---------|------|----------|
| Exact word lookup | O(m) | O(m) average |
| Prefix matching | O(m) | O(n * m) -- check all words |
| Autocomplete | Natural | Not supported |
| Space | Higher (one node per char) | Lower (one entry per word) |
| Wildcard search | O(26^m) but feasible | Impossible efficiently |

**Use a trie when:** prefix matching, autocomplete, wildcard search, or building words
character by character.

---

## 2. Trie Problems

### 2.1 Word Search II

**Problem:** Given a 2D board of characters and a list of words, find all words that can be
formed by sequentially adjacent cells (no cell reused per word).

**Approach:** Build a trie from the word list. DFS on the board, following trie paths. This
is much more efficient than running Word Search I for each word individually.

```python
class TrieNode:
    def __init__(self):
        self.children = {}
        self.word = None  # stores complete word at end nodes


def find_words(
    board: list[list[str]], words: list[str]
) -> list[str]:
    """
    Find all words from the list that exist in the board.

    Time:  O(m * n * 4^L + W * L) where L = max word length, W = word count
    Space: O(W * L) for the trie
    """
    # Build trie
    root = TrieNode()
    for word in words:
        node = root
        for char in word:
            if char not in node.children:
                node.children[char] = TrieNode()
            node = node.children[char]
        node.word = word

    rows, cols = len(board), len(board[0])
    result = []

    def dfs(r: int, c: int, node: TrieNode):
        if (r < 0 or r >= rows or c < 0 or c >= cols
                or board[r][c] == '#'
                or board[r][c] not in node.children):
            return

        char = board[r][c]
        next_node = node.children[char]

        if next_node.word is not None:
            result.append(next_node.word)
            next_node.word = None  # avoid duplicates

        board[r][c] = '#'  # mark visited

        dfs(r + 1, c, next_node)
        dfs(r - 1, c, next_node)
        dfs(r, c + 1, next_node)
        dfs(r, c - 1, next_node)

        board[r][c] = char  # restore

        # Optimization: prune empty trie branches
        if not next_node.children:
            del node.children[char]

    for r in range(rows):
        for c in range(cols):
            dfs(r, c, root)

    return result
```

**Optimization:** After finding a word, prune empty branches from the trie to speed up
subsequent searches.

---

### 2.2 Design Add and Search Words

**Problem:** Design a data structure that supports `addWord(word)` and `search(word)` where
search can contain `.` as a wildcard matching any character.

```python
class WordDictionary:
    """
    Dictionary with wildcard search support.

    addWord: O(m)
    search:  O(m) without wildcards, O(26^m) worst case with wildcards
    Space:   O(total characters)
    """

    def __init__(self):
        self.root = TrieNode()

    def add_word(self, word: str) -> None:
        node = self.root
        for char in word:
            if char not in node.children:
                node.children[char] = TrieNode()
            node = node.children[char]
        node.is_end = True

    def search(self, word: str) -> bool:
        def dfs(node: TrieNode, idx: int) -> bool:
            if idx == len(word):
                return node.is_end

            char = word[idx]
            if char == '.':
                # Wildcard: try all children
                for child in node.children.values():
                    if dfs(child, idx + 1):
                        return True
                return False
            else:
                if char not in node.children:
                    return False
                return dfs(node.children[char], idx + 1)

        return dfs(self.root, 0)
```

---

### 2.3 Implement Autocomplete System

```python
from collections import defaultdict

class AutocompleteSystem:
    """
    Return top 3 suggestions based on prefix and historical frequency.

    input: O(p + n log n) where p = prefix length, n = matching sentences
    Space: O(total characters in all sentences)
    """

    def __init__(self, sentences: list[str], times: list[int]):
        self.root = TrieNode()
        self.freq = defaultdict(int)
        self.current_prefix = []
        self.current_node = self.root

        for sentence, count in zip(sentences, times):
            self.freq[sentence] = count
            self._insert(sentence)

    def _insert(self, sentence: str):
        node = self.root
        for char in sentence:
            if char not in node.children:
                node.children[char] = TrieNode()
            node = node.children[char]
        node.is_end = True

    def _collect_words(self, node: TrieNode, prefix: list[str], results: list):
        if node.is_end:
            word = "".join(prefix)
            results.append((-self.freq[word], word))

        for char in sorted(node.children):
            prefix.append(char)
            self._collect_words(node.children[char], prefix, results)
            prefix.pop()

    def input(self, c: str) -> list[str]:
        if c == '#':
            sentence = "".join(self.current_prefix)
            self.freq[sentence] += 1
            self._insert(sentence)
            self.current_prefix = []
            self.current_node = self.root
            return []

        self.current_prefix.append(c)

        if self.current_node and c in self.current_node.children:
            self.current_node = self.current_node.children[c]
        else:
            self.current_node = None
            return []

        results = []
        self._collect_words(self.current_node, list(self.current_prefix), results)
        results.sort()
        return [word for _, word in results[:3]]
```

---

## 3. Bit Manipulation

### 3.1 Essential Bit Operations

```python
# Basic operations
x & y     # AND: both bits 1
x | y     # OR: either bit 1
x ^ y     # XOR: bits differ
~x        # NOT: flip all bits
x << n    # Left shift: multiply by 2^n
x >> n    # Right shift: divide by 2^n

# Common tricks
x & (x - 1)     # Clear lowest set bit
x & (-x)        # Isolate lowest set bit
x | (x + 1)     # Set lowest unset bit
x ^ (1 << n)    # Toggle nth bit
x & (1 << n)    # Check if nth bit is set
x | (1 << n)    # Set nth bit
x & ~(1 << n)   # Clear nth bit
```

### 3.2 XOR Properties

```
a ^ 0 = a          # XOR with 0 gives the number itself
a ^ a = 0          # XOR with itself gives 0
a ^ b ^ a = b      # XOR is self-inverse
a ^ b = b ^ a      # Commutative
(a ^ b) ^ c = a ^ (b ^ c)  # Associative
```

---

### 3.3 Single Number

**Problem:** Every element appears twice except one. Find the single one.

```python
def single_number(nums: list[int]) -> int:
    """
    Find the element that appears exactly once.

    Time:  O(n)
    Space: O(1)
    """
    result = 0
    for num in nums:
        result ^= num
    return result
```

**Why it works:** XOR of a number with itself is 0. All pairs cancel out, leaving only the
single number.

---

### 3.4 Counting Bits

**Problem:** For every number from 0 to n, count the number of 1s in its binary representation.

```python
def count_bits(n: int) -> list[int]:
    """
    Count 1-bits for each number 0 to n.

    Time:  O(n)
    Space: O(n)
    """
    dp = [0] * (n + 1)
    for i in range(1, n + 1):
        dp[i] = dp[i >> 1] + (i & 1)
    return dp
```

**Recurrence:** `dp[i] = dp[i // 2] + (i % 2)`. The number of 1-bits in `i` is the number
in `i >> 1` (right shift) plus whether the last bit is 1.

**Alternative using `i & (i-1)`:**

```python
def count_bits_alt(n: int) -> list[int]:
    """
    Using the 'clear lowest set bit' trick.
    Time:  O(n)
    Space: O(n)
    """
    dp = [0] * (n + 1)
    for i in range(1, n + 1):
        dp[i] = dp[i & (i - 1)] + 1
    return dp
```

---

### 3.5 Reverse Bits

**Problem:** Reverse the bits of a 32-bit unsigned integer.

```python
def reverse_bits(n: int) -> int:
    """
    Reverse bits of a 32-bit unsigned integer.

    Time:  O(1) -- always 32 iterations
    Space: O(1)
    """
    result = 0
    for _ in range(32):
        result = (result << 1) | (n & 1)
        n >>= 1
    return result
```

---

### 3.6 Missing Number

**Problem:** Given an array of n distinct numbers in range [0, n], find the missing number.

```python
def missing_number(nums: list[int]) -> int:
    """
    Find missing number using XOR.

    Time:  O(n)
    Space: O(1)
    """
    result = len(nums)
    for i, num in enumerate(nums):
        result ^= i ^ num
    return result
```

**Why XOR?** XOR of `0, 1, 2, ..., n` XOR'd with all elements in the array cancels out
every number except the missing one.

**Alternative (math):**

```python
def missing_number_math(nums: list[int]) -> int:
    n = len(nums)
    return n * (n + 1) // 2 - sum(nums)
```

---

### 3.7 Sum of Two Integers (No + or - operator)

**Problem:** Calculate the sum of two integers without using `+` or `-`.

```python
def get_sum(a: int, b: int) -> int:
    """
    Add two integers using only bit operations.

    Time:  O(1) -- at most 32 iterations
    Space: O(1)
    """
    # Python handles arbitrary-precision integers, so we need a mask
    mask = 0xFFFFFFFF
    max_int = 0x7FFFFFFF

    while b & mask:
        carry = (a & b) << 1
        a = a ^ b
        b = carry

    # Handle negative numbers in Python
    return a & mask if a > max_int else a
```

**Note:** This is trickier in Python than C/Java because Python integers have arbitrary
precision. The mask simulates 32-bit overflow.

---

## 4. Common Interview Questions

| # | Problem | Difficulty | Category | Key Insight |
|---|---------|-----------|----------|-------------|
| 1 | Implement Trie | Medium | Trie | Dict-based children, is_end flag |
| 2 | Word Search II | Hard | Trie + backtracking | Trie guides DFS exploration |
| 3 | Design Add/Search Words | Medium | Trie + DFS | Wildcard `.` explores all children |
| 4 | Single Number | Easy | Bit: XOR | `a ^ a = 0` |
| 5 | Missing Number | Easy | Bit: XOR or math | XOR cancels paired numbers |
| 6 | Counting Bits | Easy | Bit: DP | `dp[i] = dp[i>>1] + (i&1)` |
| 7 | Reverse Bits | Easy | Bit: shift | Extract LSB, build result |
| 8 | Number of 1 Bits | Easy | Bit: `n & (n-1)` | Clear lowest set bit |
| 9 | Sum of Two Integers | Medium | Bit: carry | XOR for sum, AND for carry |
| 10 | Word Search II | Hard | Trie + DFS | Prune trie branches after finding |

---

## 5. Gotchas

### 5.1 Trie Gotchas
- **`search` vs `startsWith`**: `search` requires `is_end = True` at the final node.
  `startsWith` only requires the prefix path exists.
- **Memory**: Tries can use a lot of memory. For sparse vocabularies, consider hash maps
  for children (as shown) rather than arrays of size 26.
- **Delete operation**: Not commonly asked, but if needed, decrement a reference count
  rather than actually removing nodes.
- **Case sensitivity**: Clarify with the interviewer. Convert to lowercase if case-insensitive.

### 5.2 Word Search II Gotchas
- **Trie pruning**: After finding a word, set `node.word = None` to avoid duplicates.
  Optionally prune empty branches for speed.
- **Board restoration**: Always restore `board[r][c]` after DFS returns.
- **Multiple words starting same way**: The trie naturally handles this -- one DFS path
  can find multiple words.

### 5.3 Bit Manipulation Gotchas
- **Python integers are arbitrary precision**: Unlike C/Java, Python ints don't overflow.
  For problems expecting 32-bit behavior, use `& 0xFFFFFFFF`.
- **Negative numbers**: Python's `~` on positive numbers gives negative results (due to
  arbitrary precision). Use masks when simulating fixed-width integers.
- **Right shift of negative numbers**: In Python, `>>` preserves the sign bit (arithmetic
  shift). For logical shift, mask first: `(n & 0xFFFFFFFF) >> 1`.
- **XOR trick only works for exactly 2 occurrences**: "Single Number" relies on every other
  element appearing exactly twice. For 3 occurrences, you need a different approach.

### 5.4 Python-Specific
- `bin(n)` returns binary string: `bin(5)` = `'0b101'`
- `bin(n).count('1')` counts set bits (Hamming weight)
- `int('101', 2)` converts binary string to int: `5`
- `n.bit_length()` returns number of bits needed: `(5).bit_length()` = `3`

---

## 6. Quick Reference

| Data Structure / Technique | When to Use | Time | Space | Key Detail |
|---------------------------|-------------|------|-------|------------|
| Trie insert/search | String prefix operations | O(m) | O(SIGMA*m*n) | Dict or array for children |
| Trie + DFS | Word search in grid | O(m*n*4^L) | O(W*L) | Trie prunes exploration |
| Trie + wildcard | Pattern matching with `.` | O(26^m) worst | O(W*L) | DFS on wildcard characters |
| XOR (single number) | Find unique in pairs | O(n) | O(1) | `a ^ a = 0`, `a ^ 0 = a` |
| XOR (missing number) | Find missing in range | O(n) | O(1) | XOR indices with values |
| `n & (n-1)` | Clear lowest set bit | O(1) | O(1) | Count bits, power-of-2 check |
| `n & (-n)` | Isolate lowest set bit | O(1) | O(1) | Useful in BIT/Fenwick tree |
| Shift + mask | Reverse bits, extract bits | O(32) | O(1) | Process bit by bit |
| DP on bits | Count bits for range | O(n) | O(n) | `dp[i] = dp[i>>1] + (i&1)` |
