# Trees

Trees are among the most heavily tested data structures in coding interviews. You need to be
fluent in traversals (both recursive and iterative), understand BST properties, and recognize
when a problem maps to a tree pattern. The majority of tree problems can be solved with DFS
(preorder, inorder, postorder) or BFS (level-order).

---

## 1. Core Concepts

### 1.1 Binary Tree Node

```python
class TreeNode:
    def __init__(self, val: int = 0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right
```

### 1.2 Traversal Orders

| Traversal | Order | Common Use |
|-----------|-------|------------|
| Preorder | Root, Left, Right | Copy/serialize a tree |
| Inorder | Left, Root, Right | BST gives sorted order |
| Postorder | Left, Right, Root | Delete tree, compute sizes |
| Level-order | Level by level (BFS) | Find depth, level averages |

### 1.3 Recursive vs Iterative

Most tree problems have both recursive and iterative solutions. Recursion is typically
cleaner, but iterative solutions avoid stack overflow on deep trees.

**Recursive template (DFS):**

```python
def dfs(node):
    if not node:
        return base_case

    # Preorder: process node here
    left_result = dfs(node.left)
    # Inorder: process node here
    right_result = dfs(node.right)
    # Postorder: process node here

    return combine(left_result, right_result)
```

### 1.4 BST Properties

A valid Binary Search Tree satisfies:
- All nodes in the left subtree have values **strictly less than** the root
- All nodes in the right subtree have values **strictly greater than** the root
- Both subtrees are also valid BSTs

BST inorder traversal yields elements in **sorted ascending** order.

---

## 2. Traversals (Recursive and Iterative)

### 2.1 Inorder Traversal

```python
def inorder_recursive(root: TreeNode | None) -> list[int]:
    """
    Time:  O(n)
    Space: O(h) where h is tree height (O(n) worst case)
    """
    result = []

    def dfs(node):
        if not node:
            return
        dfs(node.left)
        result.append(node.val)
        dfs(node.right)

    dfs(root)
    return result


def inorder_iterative(root: TreeNode | None) -> list[int]:
    """
    Time:  O(n)
    Space: O(h)
    """
    result = []
    stack = []
    current = root

    while current or stack:
        # Go as far left as possible
        while current:
            stack.append(current)
            current = current.left

        current = stack.pop()
        result.append(current.val)
        current = current.right

    return result
```

### 2.2 Preorder Traversal

```python
def preorder_iterative(root: TreeNode | None) -> list[int]:
    """
    Time:  O(n)
    Space: O(h)
    """
    if not root:
        return []

    result = []
    stack = [root]

    while stack:
        node = stack.pop()
        result.append(node.val)
        # Push right first so left is processed first
        if node.right:
            stack.append(node.right)
        if node.left:
            stack.append(node.left)

    return result
```

### 2.3 Postorder Traversal

```python
def postorder_iterative(root: TreeNode | None) -> list[int]:
    """
    Trick: reverse of modified preorder (root, right, left).

    Time:  O(n)
    Space: O(h)
    """
    if not root:
        return []

    result = []
    stack = [root]

    while stack:
        node = stack.pop()
        result.append(node.val)
        if node.left:
            stack.append(node.left)
        if node.right:
            stack.append(node.right)

    return result[::-1]  # reverse gives postorder
```

### 2.4 Level-Order Traversal (BFS)

```python
from collections import deque

def level_order(root: TreeNode | None) -> list[list[int]]:
    """
    Time:  O(n)
    Space: O(w) where w is maximum width (up to n/2 at last level)
    """
    if not root:
        return []

    result = []
    queue = deque([root])

    while queue:
        level = []
        for _ in range(len(queue)):
            node = queue.popleft()
            level.append(node.val)
            if node.left:
                queue.append(node.left)
            if node.right:
                queue.append(node.right)
        result.append(level)

    return result
```

---

## 3. Classic Problems

### 3.1 Maximum Depth of Binary Tree

**Problem:** Find the maximum depth (number of nodes along the longest root-to-leaf path).

```python
def max_depth(root: TreeNode | None) -> int:
    """
    Time:  O(n)
    Space: O(h) -- recursion stack
    """
    if not root:
        return 0
    return 1 + max(max_depth(root.left), max_depth(root.right))
```

---

### 3.2 Validate Binary Search Tree

**Problem:** Determine if a binary tree is a valid BST.

**Approach:** Pass valid range `(low, high)` down the recursion. Each node must satisfy
`low < node.val < high`.

```python
def is_valid_bst(root: TreeNode | None) -> bool:
    """
    Validate BST using range checking.

    Time:  O(n)
    Space: O(h)
    """
    def validate(node, low=float('-inf'), high=float('inf')):
        if not node:
            return True

        if not (low < node.val < high):
            return False

        return (
            validate(node.left, low, node.val) and
            validate(node.right, node.val, high)
        )

    return validate(root)
```

**Alternative (inorder):** Inorder traversal of a BST is strictly increasing. Track the
previous value and ensure each value is greater.

```python
def is_valid_bst_inorder(root: TreeNode | None) -> bool:
    """
    Validate BST using inorder traversal.

    Time:  O(n)
    Space: O(h)
    """
    prev = [float('-inf')]

    def inorder(node):
        if not node:
            return True
        if not inorder(node.left):
            return False
        if node.val <= prev[0]:
            return False
        prev[0] = node.val
        return inorder(node.right)

    return inorder(root)
```

---

### 3.3 Lowest Common Ancestor (LCA)

**Problem:** Find the lowest common ancestor of two nodes `p` and `q` in a binary tree.

**Approach:** If the current node is `p` or `q`, return it. Recurse on both subtrees. If
both return non-null, the current node is the LCA. If only one returns non-null, propagate it.

```python
def lowest_common_ancestor(
    root: TreeNode | None,
    p: TreeNode,
    q: TreeNode
) -> TreeNode | None:
    """
    Find LCA of nodes p and q.

    Time:  O(n) -- visit each node at most once
    Space: O(h)
    """
    if not root or root is p or root is q:
        return root

    left = lowest_common_ancestor(root.left, p, q)
    right = lowest_common_ancestor(root.right, p, q)

    if left and right:
        return root  # p and q are in different subtrees
    return left if left else right
```

**BST variant:** If it is a BST, use the BST property: if both p and q are smaller than root,
go left; if both are larger, go right; otherwise root is the LCA.

```python
def lca_bst(root: TreeNode, p: TreeNode, q: TreeNode) -> TreeNode:
    """
    LCA in a BST.
    Time:  O(h)
    Space: O(1) iterative / O(h) recursive
    """
    while root:
        if p.val < root.val and q.val < root.val:
            root = root.left
        elif p.val > root.val and q.val > root.val:
            root = root.right
        else:
            return root
```

---

### 3.4 Serialize and Deserialize Binary Tree

**Problem:** Design an algorithm to serialize a binary tree to a string and deserialize it
back to the original tree structure.

**Approach:** Use preorder traversal with a null marker.

```python
class Codec:
    """
    Serialize/deserialize using preorder with null markers.

    Serialize: O(n) time, O(n) space
    Deserialize: O(n) time, O(n) space
    """

    def serialize(self, root: TreeNode | None) -> str:
        result = []

        def preorder(node):
            if not node:
                result.append("N")
                return
            result.append(str(node.val))
            preorder(node.left)
            preorder(node.right)

        preorder(root)
        return ",".join(result)

    def deserialize(self, data: str) -> TreeNode | None:
        values = iter(data.split(","))

        def build():
            val = next(values)
            if val == "N":
                return None
            node = TreeNode(int(val))
            node.left = build()
            node.right = build()
            return node

        return build()
```

---

### 3.5 Binary Tree Right Side View

**Problem:** Return the values visible from the right side of the tree (last node at each
level).

```python
from collections import deque

def right_side_view(root: TreeNode | None) -> list[int]:
    """
    Right side view using BFS.

    Time:  O(n)
    Space: O(w) where w = max width
    """
    if not root:
        return []

    result = []
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

**DFS alternative:** Use DFS with `depth == len(result)` to detect the first node at each
depth from the right.

```python
def right_side_view_dfs(root: TreeNode | None) -> list[int]:
    """
    Right side view using DFS (right-first preorder).

    Time:  O(n)
    Space: O(h)
    """
    result = []

    def dfs(node, depth):
        if not node:
            return
        if depth == len(result):
            result.append(node.val)
        dfs(node.right, depth + 1)  # visit right first
        dfs(node.left, depth + 1)

    dfs(root, 0)
    return result
```

---

### 3.6 Diameter of Binary Tree

**Problem:** Find the length of the longest path between any two nodes. The path does not
need to pass through the root.

**Approach:** At each node, the diameter passing through it is `left_height + right_height`.
Track the global maximum.

```python
def diameter_of_binary_tree(root: TreeNode | None) -> int:
    """
    Find diameter (longest path between any two nodes).

    Time:  O(n)
    Space: O(h)
    """
    max_diameter = [0]

    def height(node):
        if not node:
            return 0

        left_h = height(node.left)
        right_h = height(node.right)

        # Diameter through this node
        max_diameter[0] = max(max_diameter[0], left_h + right_h)

        return 1 + max(left_h, right_h)

    height(root)
    return max_diameter[0]
```

---

## 4. Additional Important Problems

### 4.1 Invert Binary Tree

```python
def invert_tree(root: TreeNode | None) -> TreeNode | None:
    """
    Time:  O(n)
    Space: O(h)
    """
    if not root:
        return None
    root.left, root.right = invert_tree(root.right), invert_tree(root.left)
    return root
```

### 4.2 Same Tree / Subtree

```python
def is_same_tree(p: TreeNode | None, q: TreeNode | None) -> bool:
    if not p and not q:
        return True
    if not p or not q:
        return False
    return (
        p.val == q.val and
        is_same_tree(p.left, q.left) and
        is_same_tree(p.right, q.right)
    )

def is_subtree(root: TreeNode | None, sub_root: TreeNode | None) -> bool:
    """
    Time:  O(n * m)
    Space: O(n)
    """
    if not root:
        return False
    if is_same_tree(root, sub_root):
        return True
    return is_subtree(root.left, sub_root) or is_subtree(root.right, sub_root)
```

### 4.3 Construct Binary Tree from Preorder and Inorder

```python
def build_tree(preorder: list[int], inorder: list[int]) -> TreeNode | None:
    """
    Time:  O(n)
    Space: O(n)
    """
    if not preorder or not inorder:
        return None

    # Build index map for O(1) lookup in inorder
    inorder_idx = {val: i for i, val in enumerate(inorder)}

    def build(pre_start, pre_end, in_start, in_end):
        if pre_start > pre_end:
            return None

        root_val = preorder[pre_start]
        root = TreeNode(root_val)

        mid = inorder_idx[root_val]
        left_size = mid - in_start

        root.left = build(
            pre_start + 1, pre_start + left_size,
            in_start, mid - 1
        )
        root.right = build(
            pre_start + left_size + 1, pre_end,
            mid + 1, in_end
        )
        return root

    return build(0, len(preorder) - 1, 0, len(inorder) - 1)
```

### 4.4 Kth Smallest Element in BST

```python
def kth_smallest(root: TreeNode, k: int) -> int:
    """
    Iterative inorder traversal, stop at kth element.
    Time:  O(h + k)
    Space: O(h)
    """
    stack = []
    current = root

    while current or stack:
        while current:
            stack.append(current)
            current = current.left

        current = stack.pop()
        k -= 1
        if k == 0:
            return current.val
        current = current.right
```

### 4.5 Binary Tree Maximum Path Sum

```python
def max_path_sum(root: TreeNode | None) -> int:
    """
    Maximum path sum (any node to any node).
    Time:  O(n)
    Space: O(h)
    """
    result = [float('-inf')]

    def dfs(node):
        if not node:
            return 0

        # Only take positive contributions
        left_gain = max(dfs(node.left), 0)
        right_gain = max(dfs(node.right), 0)

        # Path through this node
        path_sum = node.val + left_gain + right_gain
        result[0] = max(result[0], path_sum)

        # Return max single-side gain for parent
        return node.val + max(left_gain, right_gain)

    dfs(root)
    return result[0]
```

---

## 5. Common Interview Questions

| # | Problem | Difficulty | Pattern | Key Insight |
|---|---------|-----------|---------|-------------|
| 1 | Maximum Depth | Easy | DFS | `1 + max(left, right)` |
| 2 | Invert Binary Tree | Easy | DFS | Swap children recursively |
| 3 | Same Tree | Easy | DFS | Compare structure + values |
| 4 | Diameter of Binary Tree | Easy | DFS (postorder) | `left_h + right_h` at each node |
| 5 | Balanced Binary Tree | Easy | DFS | Height diff <= 1 at every node |
| 6 | Validate BST | Medium | DFS with range | Pass `(low, high)` bounds |
| 7 | Lowest Common Ancestor | Medium | DFS | Both sides non-null = LCA |
| 8 | Binary Tree Right Side View | Medium | BFS | Last node at each level |
| 9 | Kth Smallest in BST | Medium | Inorder | Stop at kth element |
| 10 | Construct from Preorder/Inorder | Medium | Divide and conquer | Root splits inorder array |
| 11 | Serialize/Deserialize | Hard | Preorder + null markers | Use iterator for deserialize |
| 12 | Binary Tree Max Path Sum | Hard | DFS (postorder) | Track global max, return single-side |

---

## 6. Gotchas

### 6.1 Recursive Gotchas
- **Base case**: Always handle `None` nodes. Forgetting this causes `AttributeError`.
- **Return value confusion**: Know what your recursive function returns. Height? Boolean?
  Node reference? Mixing these up is a common bug.
- **Global state**: Using `self.result` or a mutable container like `[0]` to track global
  values in recursion. Don't use a plain `int` -- it won't update across recursive calls
  due to Python's scoping rules.

### 6.2 BST Gotchas
- **Validate BST**: You cannot just check `left.val < root.val < right.val` locally. You
  must check against the entire valid range (all ancestors).
- **Duplicate values**: Clarify with the interviewer how duplicates are handled. Standard
  BST usually forbids duplicates or puts them on one consistent side.
- **BST inorder is sorted**: Use this property to simplify problems like kth smallest,
  validate BST, and convert BST to sorted list.

### 6.3 BFS Gotchas
- **Level tracking**: Use `for _ in range(len(queue))` to process one level at a time.
  Don't forget to capture `len(queue)` before the inner loop starts.
- **Space complexity**: BFS space is O(w) where w is the maximum width, which can be up
  to O(n/2) = O(n) for a complete binary tree.

### 6.4 Path Gotchas
- **Path sum vs max path sum**: "Path" can mean root-to-leaf, any-to-any, or root-to-any.
  Clarify with the interviewer.
- **Negative values**: When computing max path sum, use `max(child_gain, 0)` to optionally
  exclude negative subtrees.

---

## 7. Quick Reference

| Pattern | When to Use | Time | Space | Key Steps |
|---------|-------------|------|-------|-----------|
| DFS (preorder) | Process root before children | O(n) | O(h) | Process, then recurse left/right |
| DFS (inorder) | BST operations, sorted order | O(n) | O(h) | Left, process, right |
| DFS (postorder) | Compute subtree info bottom-up | O(n) | O(h) | Left, right, process |
| BFS (level-order) | Level-by-level processing | O(n) | O(w) | Queue with level size loop |
| Range validation | Validate BST | O(n) | O(h) | Pass `(low, high)` bounds |
| LCA recursion | Find common ancestor | O(n) | O(h) | Return node if found, combine |
| Preorder + null markers | Serialize/deserialize | O(n) | O(n) | "N" for null, comma-separated |
| Height + diameter | Longest path in tree | O(n) | O(h) | Track `left_h + right_h` globally |
| Iterative inorder | BST kth smallest, no recursion | O(h+k) | O(h) | Stack, go left, pop, go right |
