# Trees - LeetCode Hot 100

## TreeNode Definition

```python
class TreeNode:
    def __init__(self, val: int = 0, left: 'TreeNode | None' = None, right: 'TreeNode | None' = None):
        self.val = val
        self.left = left
        self.right = right
```

---

## Problem 1. Invert Binary Tree (LC #226) - Easy

**Problem**: Given the root of a binary tree, invert the tree (mirror it) and return its root. Every left child swaps with its right child at every level.
**Pattern**: DFS / Recursion

### Approach

Recursively swap the left and right children of every node. Process the current node by swapping its children, then recurse into both subtrees. Any traversal order works since we visit every node exactly once.

### Solution

```python
class Solution:
    def invertTree(self, root: TreeNode | None) -> TreeNode | None:
        if not root:
            return None

        root.left, root.right = root.right, root.left
        self.invertTree(root.left)
        self.invertTree(root.right)

        return root
```

**Time**: O(n) where n is the number of nodes
**Space**: O(h) where h is tree height (recursion stack); O(n) worst case for skewed tree
**Edge Cases**: empty tree (return None), single node, already symmetric tree

---

## Problem 2. Maximum Depth of Binary Tree (LC #104) - Easy

**Problem**: Given the root of a binary tree, return its maximum depth. Maximum depth is the number of nodes along the longest path from the root node down to the farthest leaf node.
**Pattern**: DFS / Recursion

### Approach

The depth of a tree is 1 + the maximum depth of its left and right subtrees. Base case: an empty node has depth 0.

### Solution

```python
class Solution:
    def maxDepth(self, root: TreeNode | None) -> int:
        if not root:
            return 0

        return 1 + max(self.maxDepth(root.left), self.maxDepth(root.right))
```

**Time**: O(n)
**Space**: O(h) recursion stack; O(n) worst case
**Edge Cases**: empty tree (return 0), single node (return 1), completely skewed tree (depth = n)

---

## Problem 3. Same Tree (LC #100) - Easy

**Problem**: Given the roots of two binary trees p and q, check if they are structurally identical and all nodes have the same values.
**Pattern**: DFS / Recursion

### Approach

Two trees are the same if their roots have the same value and their left subtrees are the same and their right subtrees are the same. Both being None is also a match; one being None and the other not is a mismatch.

### Solution

```python
class Solution:
    def isSameTree(self, p: TreeNode | None, q: TreeNode | None) -> bool:
        if not p and not q:
            return True
        if not p or not q:
            return False

        return (
            p.val == q.val
            and self.isSameTree(p.left, q.left)
            and self.isSameTree(p.right, q.right)
        )
```

**Time**: O(min(n, m)) where n, m are sizes of the two trees
**Space**: O(min(h1, h2)) recursion stack
**Edge Cases**: both empty (True), one empty (False), single matching nodes, same structure but different values

---

## Problem 4. Diameter of Binary Tree (LC #543) - Easy

**Problem**: Given the root of a binary tree, return the length of the diameter. The diameter is the length of the longest path between any two nodes (measured in number of edges). The path may or may not pass through the root.
**Pattern**: DFS with global state

### Approach

At each node, the longest path passing through it equals the height of its left subtree plus the height of its right subtree. We compute heights recursively while tracking the maximum diameter seen so far. The key insight is that the diameter through a node is `left_height + right_height`, but we return `1 + max(left_height, right_height)` upward to the parent.

### Solution

```python
class Solution:
    def diameterOfBinaryTree(self, root: TreeNode | None) -> int:
        result = 0

        def height(node: TreeNode | None) -> int:
            nonlocal result
            if not node:
                return 0

            left = height(node.left)
            right = height(node.right)
            result = max(result, left + right)

            return 1 + max(left, right)

        height(root)
        return result
```

**Time**: O(n)
**Space**: O(h) recursion stack
**Edge Cases**: empty tree (0), single node (0), linear tree (n-1), diameter not through root

---

## Problem 5. Subtree of Another Tree (LC #572) - Easy

**Problem**: Given the roots of two binary trees root and subRoot, return true if there is a subtree of root with the same structure and node values as subRoot.
**Pattern**: DFS + Tree comparison

### Approach

For every node in the main tree, check if the subtree rooted at that node is identical to subRoot using the same-tree comparison. If any match is found, return True.

### Solution

```python
class Solution:
    def isSubtree(self, root: TreeNode | None, subRoot: TreeNode | None) -> bool:
        if not subRoot:
            return True
        if not root:
            return False

        return (
            self._is_same(root, subRoot)
            or self.isSubtree(root.left, subRoot)
            or self.isSubtree(root.right, subRoot)
        )

    def _is_same(self, p: TreeNode | None, q: TreeNode | None) -> bool:
        if not p and not q:
            return True
        if not p or not q:
            return False

        return (
            p.val == q.val
            and self._is_same(p.left, q.left)
            and self._is_same(p.right, q.right)
        )
```

**Time**: O(n * m) where n is the size of root and m is the size of subRoot
**Space**: O(h) recursion stack where h is height of root
**Edge Cases**: subRoot is None (True), root is None (False), identical trees, subRoot matches a leaf

---

## Problem 6. Balanced Binary Tree (LC #110) - Easy

**Problem**: Given a binary tree, determine if it is height-balanced. A height-balanced tree has left and right subtrees of every node differing in height by no more than 1.
**Pattern**: DFS with early termination

### Approach

Compute the height of each subtree bottom-up. If at any node the left and right heights differ by more than 1, return -1 as a sentinel to indicate imbalance. This avoids redundant height computations.

### Solution

```python
class Solution:
    def isBalanced(self, root: TreeNode | None) -> bool:
        def check(node: TreeNode | None) -> int:
            """Returns height if balanced, -1 if not."""
            if not node:
                return 0

            left = check(node.left)
            if left == -1:
                return -1

            right = check(node.right)
            if right == -1:
                return -1

            if abs(left - right) > 1:
                return -1

            return 1 + max(left, right)

        return check(root) != -1
```

**Time**: O(n)
**Space**: O(h) recursion stack
**Edge Cases**: empty tree (True), single node (True), linear chain (False for length > 1), balanced at root but not deeper

---

## Problem 7. Lowest Common Ancestor of a BST (LC #235) - Medium

**Problem**: Given a binary search tree (BST) and two nodes p and q, find their lowest common ancestor (LCA). The LCA is the deepest node that has both p and q as descendants (a node can be a descendant of itself).
**Pattern**: BST property exploitation

### Approach

Leverage the BST property: if both p and q are smaller than the current node, LCA is in the left subtree; if both are larger, LCA is in the right subtree. Otherwise, the current node is the split point and therefore the LCA.

### Solution

```python
class Solution:
    def lowestCommonAncestor(
        self, root: TreeNode, p: TreeNode, q: TreeNode
    ) -> TreeNode:
        node = root

        while node:
            if p.val < node.val and q.val < node.val:
                node = node.left
            elif p.val > node.val and q.val > node.val:
                node = node.right
            else:
                return node

        return root  # unreachable if p, q exist in tree
```

**Time**: O(h) where h is the height of the BST; O(log n) average, O(n) worst case
**Space**: O(1) iterative approach
**Edge Cases**: one node is ancestor of the other, p equals q, p and q are in different subtrees, skewed BST

---

## Problem 8. Binary Tree Level Order Traversal (LC #102) - Medium

**Problem**: Given the root of a binary tree, return the level order traversal of its nodes' values (left to right, level by level) as a list of lists.
**Pattern**: BFS / Queue

### Approach

Use a queue (deque) for BFS. Process one level at a time by recording the queue size at the start of each level, then dequeuing exactly that many nodes and enqueuing their children.

### Solution

```python
from collections import deque


class Solution:
    def levelOrder(self, root: TreeNode | None) -> list[list[int]]:
        if not root:
            return []

        result: list[list[int]] = []
        queue = deque([root])

        while queue:
            level_size = len(queue)
            level: list[int] = []

            for _ in range(level_size):
                node = queue.popleft()
                level.append(node.val)

                if node.left:
                    queue.append(node.left)
                if node.right:
                    queue.append(node.right)

            result.append(level)

        return result
```

**Time**: O(n)
**Space**: O(n) for the queue (widest level can have n/2 nodes)
**Edge Cases**: empty tree (empty list), single node, complete binary tree, skewed tree (each level has 1 node)

---

## Problem 9. Validate Binary Search Tree (LC #98) - Medium

**Problem**: Given the root of a binary tree, determine if it is a valid binary search tree. A valid BST has all left subtree values strictly less than the node and all right subtree values strictly greater.
**Pattern**: DFS with range tracking

### Approach

Pass down valid value ranges (lower, upper) through recursion. For the root, the range is (-inf, +inf). When going left, the upper bound becomes the parent's value. When going right, the lower bound becomes the parent's value.

### Solution

```python
class Solution:
    def isValidBST(self, root: TreeNode | None) -> bool:
        def validate(
            node: TreeNode | None, lo: float, hi: float
        ) -> bool:
            if not node:
                return True

            if node.val <= lo or node.val >= hi:
                return False

            return (
                validate(node.left, lo, node.val)
                and validate(node.right, node.val, hi)
            )

        return validate(root, float("-inf"), float("inf"))
```

**Time**: O(n)
**Space**: O(h) recursion stack
**Edge Cases**: empty tree (True), single node (True), duplicate values (invalid), left subtree node violates grandparent constraint, Integer.MIN/MAX values as node values

---

## Problem 10. Kth Smallest Element in a BST (LC #230) - Medium

**Problem**: Given the root of a BST and an integer k, return the kth smallest value (1-indexed) in the tree.
**Pattern**: Inorder traversal (BST inorder = sorted order)

### Approach

An inorder traversal of a BST yields values in ascending order. Perform iterative inorder traversal and decrement k at each visited node. When k reaches 0, we have found the answer. Iterative avoids traversing the entire tree.

### Solution

```python
class Solution:
    def kthSmallest(self, root: TreeNode | None, k: int) -> int:
        stack: list[TreeNode] = []
        node = root

        while node or stack:
            while node:
                stack.append(node)
                node = node.left

            node = stack.pop()
            k -= 1

            if k == 0:
                return node.val

            node = node.right

        return -1  # unreachable if k is valid
```

**Time**: O(h + k) where h is tree height
**Space**: O(h) for the stack
**Edge Cases**: k = 1 (leftmost node), k = n (rightmost node), single node tree, skewed tree

---

## Problem 11. Binary Tree Right Side View (LC #199) - Medium

**Problem**: Given the root of a binary tree, return the values of the nodes you can see when looking at the tree from the right side, ordered from top to bottom.
**Pattern**: BFS level order / DFS with depth tracking

### Approach

Use BFS level order traversal. The last node processed in each level is visible from the right side. Alternatively, use DFS visiting right children first and recording the first node seen at each depth.

### Solution

```python
from collections import deque


class Solution:
    def rightSideView(self, root: TreeNode | None) -> list[int]:
        if not root:
            return []

        result: list[int] = []
        queue = deque([root])

        while queue:
            level_size = len(queue)

            for i in range(level_size):
                node = queue.popleft()

                if i == level_size - 1:
                    result.append(node.val)

                if node.left:
                    queue.append(node.left)
                if node.right:
                    queue.append(node.right)

        return result
```

**Time**: O(n)
**Space**: O(n) for the queue
**Edge Cases**: empty tree, single node, left-skewed tree (every node visible), right-skewed tree (every node visible), tree where left child is deeper than right

---

## Problem 12. Construct Binary Tree from Preorder and Inorder Traversal (LC #105) - Medium

**Problem**: Given two integer arrays preorder and inorder representing the preorder and inorder traversals of a binary tree, construct and return the binary tree.
**Pattern**: Divide and conquer with index mapping

### Approach

The first element of preorder is always the root. Find this root's index in inorder to split it into left and right subtrees. Elements to the left of the root in inorder form the left subtree; elements to the right form the right subtree. Use a hashmap for O(1) index lookups in inorder. Track positions using index boundaries to avoid creating subarrays.

### Solution

```python
class Solution:
    def buildTree(
        self, preorder: list[int], inorder: list[int]
    ) -> TreeNode | None:
        inorder_index = {val: i for i, val in enumerate(inorder)}
        pre_idx = 0

        def build(lo: int, hi: int) -> TreeNode | None:
            nonlocal pre_idx

            if lo > hi:
                return None

            root_val = preorder[pre_idx]
            pre_idx += 1

            root = TreeNode(root_val)
            mid = inorder_index[root_val]

            root.left = build(lo, mid - 1)
            root.right = build(mid + 1, hi)

            return root

        return build(0, len(inorder) - 1)
```

**Time**: O(n)
**Space**: O(n) for the hashmap and recursion stack
**Edge Cases**: single node, left-only tree, right-only tree, all values distinct (guaranteed by problem)

---

## Problem 13. Serialize and Deserialize Binary Tree (LC #297) - Hard

**Problem**: Design an algorithm to serialize a binary tree to a string and deserialize the string back to the original tree structure. There is no restriction on how the serialization/deserialization algorithm works.
**Pattern**: Preorder traversal with null markers

### Approach

Serialize using preorder traversal, representing null nodes with a sentinel value (e.g., "#"). Separate values with commas. For deserialization, iterate through the serialized tokens; each token either creates a new node or represents a null child.

### Solution

```python
class Codec:
    def serialize(self, root: TreeNode | None) -> str:
        tokens: list[str] = []

        def preorder(node: TreeNode | None) -> None:
            if not node:
                tokens.append("#")
                return

            tokens.append(str(node.val))
            preorder(node.left)
            preorder(node.right)

        preorder(root)
        return ",".join(tokens)

    def deserialize(self, data: str) -> TreeNode | None:
        tokens = iter(data.split(","))

        def build() -> TreeNode | None:
            val = next(tokens)

            if val == "#":
                return None

            node = TreeNode(int(val))
            node.left = build()
            node.right = build()

            return node

        return build()
```

**Time**: O(n) for both serialize and deserialize
**Space**: O(n) for the serialized string and recursion stack
**Edge Cases**: empty tree (serializes to "#"), single node, negative values, very deep tree (recursion limit), large values

---

## Problem 14. Binary Tree Maximum Path Sum (LC #124) - Hard

**Problem**: Given the root of a binary tree, return the maximum path sum of any non-empty path. A path is a sequence of nodes where each pair of adjacent nodes has an edge connecting them. A node can only appear at most once in the path. The path does not need to pass through the root.
**Pattern**: DFS with global tracking (similar to diameter)

### Approach

At each node, compute the maximum gain obtainable by extending a path through that node to its parent. The gain from a subtree is `max(0, subtree_gain)` (we can choose not to extend into a negative subtree). The path sum through the current node is `node.val + left_gain + right_gain`. Track the global maximum. Return `node.val + max(left_gain, right_gain)` upward since a path through the parent can only go through one child.

### Solution

```python
class Solution:
    def maxPathSum(self, root: TreeNode | None) -> int:
        result = float("-inf")

        def max_gain(node: TreeNode | None) -> int:
            nonlocal result

            if not node:
                return 0

            left = max(0, max_gain(node.left))
            right = max(0, max_gain(node.right))

            result = max(result, node.val + left + right)

            return node.val + max(left, right)

        max_gain(root)
        return int(result)
```

**Time**: O(n)
**Space**: O(h) recursion stack; O(n) worst case for skewed tree
**Edge Cases**: all negative values (pick the least negative single node), single node, path is a single node, path goes through root, path entirely in one subtree
