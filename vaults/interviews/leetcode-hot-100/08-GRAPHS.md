# Graphs - LeetCode Hot 100

## Graph Fundamentals

### Representations

**Adjacency List** — Most common for sparse graphs. Each node maps to its list of neighbors.

```python
# Unweighted undirected graph
graph: dict[int, list[int]] = {
    0: [1, 2],
    1: [0, 3],
    2: [0],
    3: [1],
}

# Build from edge list
def build_adj_list(n: int, edges: list[list[int]]) -> dict[int, list[int]]:
    graph: dict[int, list[int]] = {i: [] for i in range(n)}
    for u, v in edges:
        graph[u].append(v)
        graph[v].append(u)
    return graph
```

**Adjacency Matrix** — Better for dense graphs or when you need O(1) edge lookup.

```python
# matrix[i][j] == 1 means edge from i to j
matrix: list[list[int]] = [
    [0, 1, 1, 0],
    [1, 0, 0, 1],
    [1, 0, 0, 0],
    [0, 1, 0, 0],
]
```

**Grid as Implicit Graph** — 2D grids where cells are nodes and adjacent cells are neighbors.

```python
DIRS = [(0, 1), (0, -1), (1, 0), (-1, 0)]

def neighbors(r: int, c: int, rows: int, cols: int) -> list[tuple[int, int]]:
    return [
        (r + dr, c + dc)
        for dr, dc in DIRS
        if 0 <= r + dr < rows and 0 <= c + dc < cols
    ]
```

### BFS Template

```python
from collections import deque

def bfs(graph: dict[int, list[int]], start: int) -> list[int]:
    visited: set[int] = {start}
    queue: deque[int] = deque([start])
    order: list[int] = []

    while queue:
        node = queue.popleft()
        order.append(node)
        for neighbor in graph[node]:
            if neighbor not in visited:
                visited.add(neighbor)
                queue.append(neighbor)

    return order
```

### DFS Template

```python
# Iterative
def dfs_iterative(graph: dict[int, list[int]], start: int) -> list[int]:
    visited: set[int] = set()
    stack: list[int] = [start]
    order: list[int] = []

    while stack:
        node = stack.pop()
        if node in visited:
            continue
        visited.add(node)
        order.append(node)
        for neighbor in graph[node]:
            if neighbor not in visited:
                stack.append(neighbor)

    return order

# Recursive
def dfs_recursive(graph: dict[int, list[int]], node: int, visited: set[int]) -> None:
    visited.add(node)
    for neighbor in graph[node]:
        if neighbor not in visited:
            dfs_recursive(graph, neighbor, visited)
```

### Union-Find Template

```python
class UnionFind:
    def __init__(self, n: int) -> None:
        self.parent = list(range(n))
        self.rank = [0] * n
        self.components = n

    def find(self, x: int) -> int:
        if self.parent[x] != x:
            self.parent[x] = self.find(self.parent[x])  # path compression
        return self.parent[x]

    def union(self, x: int, y: int) -> bool:
        px, py = self.find(x), self.find(y)
        if px == py:
            return False
        if self.rank[px] < self.rank[py]:
            px, py = py, px
        self.parent[py] = px
        if self.rank[px] == self.rank[py]:
            self.rank[px] += 1
        self.components -= 1
        return True
```

### Topological Sort Template (Kahn's Algorithm)

```python
from collections import deque

def topological_sort(n: int, edges: list[list[int]]) -> list[int]:
    graph: dict[int, list[int]] = {i: [] for i in range(n)}
    in_degree: list[int] = [0] * n

    for u, v in edges:
        graph[u].append(v)
        in_degree[v] += 1

    queue: deque[int] = deque(i for i in range(n) if in_degree[i] == 0)
    order: list[int] = []

    while queue:
        node = queue.popleft()
        order.append(node)
        for neighbor in graph[node]:
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    return order if len(order) == n else []  # empty if cycle exists
```

---

## Problem 1. Number of Islands (LC #200) - Medium

**Problem**: Given an `m x n` 2D binary grid where `'1'` represents land and `'0'` represents water, count the number of islands. An island is surrounded by water and formed by connecting adjacent lands horizontally or vertically.

**Pattern**: Grid BFS/DFS — connected components on an implicit graph.

### Approach

Scan every cell. When we find an unvisited `'1'`, that is a new island. Run BFS (or DFS) from that cell to mark all connected land cells as visited. Increment the island count for each BFS launch.

### Solution

```python
from collections import deque

class Solution:
    def numIslands(self, grid: list[list[str]]) -> int:
        if not grid:
            return 0

        rows, cols = len(grid), len(grid[0])
        visited: set[tuple[int, int]] = set()
        islands = 0

        def bfs(r: int, c: int) -> None:
            queue: deque[tuple[int, int]] = deque([(r, c)])
            visited.add((r, c))
            while queue:
                cr, cc = queue.popleft()
                for dr, dc in [(0, 1), (0, -1), (1, 0), (-1, 0)]:
                    nr, nc = cr + dr, cc + dc
                    if (
                        0 <= nr < rows
                        and 0 <= nc < cols
                        and (nr, nc) not in visited
                        and grid[nr][nc] == "1"
                    ):
                        visited.add((nr, nc))
                        queue.append((nr, nc))

        for r in range(rows):
            for c in range(cols):
                if grid[r][c] == "1" and (r, c) not in visited:
                    bfs(r, c)
                    islands += 1

        return islands
```

**Time**: O(m _ n) — every cell visited at most once.
**Space**: O(m _ n) — visited set in the worst case.
**Edge Cases**:

- Empty grid → 0
- Grid of all water → 0
- Grid of all land → 1
- Single cell grid

---

## Problem 2. Clone Graph (LC #133) - Medium

**Problem**: Given a reference to a node in a connected undirected graph, return a deep copy of the graph. Each node has a `val` and a list of `neighbors`.

**Pattern**: BFS/DFS with hash map — map original nodes to their clones.

### Approach

Use a hash map `old_to_new` to track which nodes have been cloned. BFS from the given node: for each node, create its clone if it does not exist, then wire up the neighbor clones. The map both prevents duplicate clones and serves as the visited set.

### Solution

```python
from collections import deque


class Node:
    def __init__(self, val: int = 0, neighbors: list["Node"] | None = None) -> None:
        self.val = val
        self.neighbors = neighbors if neighbors is not None else []


class Solution:
    def cloneGraph(self, node: Node | None) -> Node | None:
        if node is None:
            return None

        old_to_new: dict[Node, Node] = {node: Node(node.val)}
        queue: deque[Node] = deque([node])

        while queue:
            current = queue.popleft()
            for neighbor in current.neighbors:
                if neighbor not in old_to_new:
                    old_to_new[neighbor] = Node(neighbor.val)
                    queue.append(neighbor)
                old_to_new[current].neighbors.append(old_to_new[neighbor])

        return old_to_new[node]
```

**Time**: O(V + E) — visit every node and edge once.
**Space**: O(V) — hash map storing all cloned nodes.
**Edge Cases**:

- `None` input → return `None`
- Single node with no neighbors
- Node with self-loop

---

## Problem 3. Pacific Atlantic Water Flow (LC #417) - Medium

**Problem**: Given an `m x n` island grid of heights, find all cells where rain water can flow to both the Pacific ocean (top/left borders) and the Atlantic ocean (bottom/right borders). Water flows from a cell to an adjacent cell with equal or lower height.

**Pattern**: Reverse BFS/DFS from ocean borders.

### Approach

Instead of checking from every cell whether water reaches both oceans (expensive), reverse the flow: start BFS from each ocean's border and move to cells with equal or greater height. A cell reachable from the Pacific border goes into `pacific_set`; similarly for Atlantic. The answer is the intersection.

### Solution

```python
from collections import deque


class Solution:
    def pacificAtlantic(self, heights: list[list[int]]) -> list[list[int]]:
        if not heights:
            return []

        rows, cols = len(heights), len(heights[0])

        def bfs(starts: list[tuple[int, int]]) -> set[tuple[int, int]]:
            reachable: set[tuple[int, int]] = set(starts)
            queue: deque[tuple[int, int]] = deque(starts)
            while queue:
                r, c = queue.popleft()
                for dr, dc in [(0, 1), (0, -1), (1, 0), (-1, 0)]:
                    nr, nc = r + dr, c + dc
                    if (
                        0 <= nr < rows
                        and 0 <= nc < cols
                        and (nr, nc) not in reachable
                        and heights[nr][nc] >= heights[r][c]
                    ):
                        reachable.add((nr, nc))
                        queue.append((nr, nc))
            return reachable

        pacific_starts = (
            [(0, c) for c in range(cols)]
            + [(r, 0) for r in range(rows)]
        )
        atlantic_starts = (
            [(rows - 1, c) for c in range(cols)]
            + [(r, cols - 1) for r in range(rows)]
        )

        pacific = bfs(pacific_starts)
        atlantic = bfs(atlantic_starts)

        return [[r, c] for r, c in pacific & atlantic]
```

**Time**: O(m _ n) — each cell visited at most twice (once per ocean).
**Space**: O(m _ n) — two reachable sets.
**Edge Cases**:

- 1x1 grid → that single cell
- Flat grid (all same height) → every cell
- Strictly decreasing from top-left → only border cells

---

## Problem 4. Course Schedule (LC #207) - Medium

**Problem**: There are `numCourses` courses labeled `0` to `numCourses - 1`. Given prerequisite pairs `[a, b]` meaning you must take `b` before `a`, determine if you can finish all courses (i.e., no cycle in the directed graph).

**Pattern**: Topological sort / cycle detection in a directed graph.

### Approach

Build a directed graph and compute in-degrees. Use Kahn's algorithm (BFS topological sort): start with all nodes having in-degree 0, process them and decrement neighbors' in-degrees. If all nodes are processed, no cycle exists.

### Solution

```python
from collections import deque


class Solution:
    def canFinish(
        self, numCourses: int, prerequisites: list[list[int]]
    ) -> bool:
        graph: dict[int, list[int]] = {i: [] for i in range(numCourses)}
        in_degree: list[int] = [0] * numCourses

        for course, prereq in prerequisites:
            graph[prereq].append(course)
            in_degree[course] += 1

        queue: deque[int] = deque(
            i for i in range(numCourses) if in_degree[i] == 0
        )
        processed = 0

        while queue:
            node = queue.popleft()
            processed += 1
            for neighbor in graph[node]:
                in_degree[neighbor] -= 1
                if in_degree[neighbor] == 0:
                    queue.append(neighbor)

        return processed == numCourses
```

**Time**: O(V + E) — process every node and edge.
**Space**: O(V + E) — adjacency list and in-degree array.
**Edge Cases**:

- No prerequisites → always possible
- Self-loop `[0, 0]` → cycle, return `False`
- Disconnected graph → still valid if no cycles

---

## Problem 5. Course Schedule II (LC #210) - Medium

**Problem**: Same setup as Course Schedule, but return a valid ordering of courses. If no valid ordering exists (cycle), return an empty list.

**Pattern**: Topological sort — Kahn's algorithm returning the order.

### Approach

Identical to Course Schedule but collect the processing order. If the order includes all courses, return it; otherwise return an empty list indicating a cycle.

### Solution

```python
from collections import deque


class Solution:
    def findOrder(
        self, numCourses: int, prerequisites: list[list[int]]
    ) -> list[int]:
        graph: dict[int, list[int]] = {i: [] for i in range(numCourses)}
        in_degree: list[int] = [0] * numCourses

        for course, prereq in prerequisites:
            graph[prereq].append(course)
            in_degree[course] += 1

        queue: deque[int] = deque(
            i for i in range(numCourses) if in_degree[i] == 0
        )
        order: list[int] = []

        while queue:
            node = queue.popleft()
            order.append(node)
            for neighbor in graph[node]:
                in_degree[neighbor] -= 1
                if in_degree[neighbor] == 0:
                    queue.append(neighbor)

        return order if len(order) == numCourses else []
```

**Time**: O(V + E)
**Space**: O(V + E)
**Edge Cases**:

- No prerequisites → return `[0, 1, ..., n-1]` (any order)
- Single course → `[0]`
- Cycle → empty list
- Multiple valid orderings → any one is accepted

---

## Problem 6. Number of Connected Components (LC #323) - Medium

**Problem**: Given `n` nodes labeled `0` to `n - 1` and a list of undirected edges, find the number of connected components.

**Pattern**: Union-Find or BFS/DFS counting connected components.

### Approach

**Union-Find**: Initialize each node as its own component. For each edge, union the two nodes. The final component count is the answer. Path compression and union by rank give near-constant time per operation.

### Solution

```python
class Solution:
    def countComponents(self, n: int, edges: list[list[int]]) -> int:
        parent = list(range(n))
        rank = [0] * n
        components = n

        def find(x: int) -> int:
            while parent[x] != x:
                parent[x] = parent[parent[x]]  # path compression
                x = parent[x]
            return x

        def union(x: int, y: int) -> None:
            nonlocal components
            px, py = find(x), find(y)
            if px == py:
                return
            if rank[px] < rank[py]:
                px, py = py, px
            parent[py] = px
            if rank[px] == rank[py]:
                rank[px] += 1
            components -= 1

        for u, v in edges:
            union(u, v)

        return components
```

**Time**: O(E \* α(n)) ≈ O(E) — α is the inverse Ackermann function, effectively constant.
**Space**: O(n) — parent and rank arrays.
**Edge Cases**:

- No edges → `n` components
- Fully connected → 1 component
- `n = 0` → 0 components

---

## Problem 7. Graph Valid Tree (LC #261) - Medium

**Problem**: Given `n` nodes and a list of undirected edges, determine if these edges form a valid tree. A valid tree is a connected acyclic undirected graph.

**Pattern**: Union-Find for cycle detection + connectivity check.

### Approach

A tree with `n` nodes has exactly `n - 1` edges. Quick check: if `len(edges) != n - 1`, return `False`. Then use Union-Find: process each edge; if two nodes share the same root, adding this edge creates a cycle → not a tree. If no cycle is found and edge count is correct, the graph is a valid tree.

### Solution

```python
class Solution:
    def validTree(self, n: int, edges: list[list[int]]) -> bool:
        if len(edges) != n - 1:
            return False

        parent = list(range(n))

        def find(x: int) -> int:
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x

        def union(x: int, y: int) -> bool:
            px, py = find(x), find(y)
            if px == py:
                return False  # cycle detected
            parent[py] = px
            return True

        return all(union(u, v) for u, v in edges)
```

**Time**: O(E \* α(n)) ≈ O(n) since E = n - 1.
**Space**: O(n) — parent array.
**Edge Cases**:

- `n = 1`, no edges → valid tree
- `n = 0` → edge case; typically valid (empty tree)
- Duplicate edges → would cause cycle detection to fail → `False`
- Too many or too few edges → immediate `False`

---

## Problem 8. Rotting Oranges (LC #994) - Medium

**Problem**: In a grid, `0` = empty, `1` = fresh orange, `2` = rotten orange. Every minute, fresh oranges adjacent to rotten ones also become rotten. Return the minimum minutes until no fresh orange remains, or `-1` if impossible.

**Pattern**: Multi-source BFS — level-order traversal from all initial rotten oranges simultaneously.

### Approach

Collect all initially rotten oranges as BFS sources and count fresh oranges. BFS level by level: each level represents one minute. For each rotten orange, rot its fresh neighbors. When BFS ends, if any fresh oranges remain, return `-1`; otherwise return the number of minutes elapsed.

### Solution

```python
from collections import deque


class Solution:
    def orangesRotting(self, grid: list[list[int]]) -> int:
        rows, cols = len(grid), len(grid[0])
        queue: deque[tuple[int, int]] = deque()
        fresh = 0

        for r in range(rows):
            for c in range(cols):
                if grid[r][c] == 2:
                    queue.append((r, c))
                elif grid[r][c] == 1:
                    fresh += 1

        if fresh == 0:
            return 0

        minutes = 0

        while queue and fresh > 0:
            minutes += 1
            for _ in range(len(queue)):
                r, c = queue.popleft()
                for dr, dc in [(0, 1), (0, -1), (1, 0), (-1, 0)]:
                    nr, nc = r + dr, c + dc
                    if (
                        0 <= nr < rows
                        and 0 <= nc < cols
                        and grid[nr][nc] == 1
                    ):
                        grid[nr][nc] = 2
                        fresh -= 1
                        queue.append((nr, nc))

        return minutes if fresh == 0 else -1
```

**Time**: O(m _ n) — every cell processed at most once.
**Space**: O(m _ n) — queue can hold all cells.
**Edge Cases**:

- No fresh oranges → 0 (already done)
- No rotten oranges but fresh exist → -1
- Fresh orange isolated by empty cells → -1
- All rotten from the start → 0

---

## Problem 9. Word Ladder (LC #127) - Hard

**Problem**: Given `beginWord`, `endWord`, and a `wordList`, find the length of the shortest transformation sequence from `beginWord` to `endWord` where each step changes exactly one letter and each intermediate word must be in `wordList`. Return `0` if no such sequence exists.

**Pattern**: BFS shortest path — each word is a node, edges connect words differing by one letter.

### Approach

Build an implicit graph: for each word, generate all possible one-letter-off patterns (e.g., `"hot"` → `"*ot"`, `"h*t"`, `"ho*"`). Map each pattern to all words that match it. BFS from `beginWord`, exploring neighbors via the pattern map. The first time we reach `endWord`, the BFS depth is the answer.

### Solution

```python
from collections import defaultdict, deque


class Solution:
    def ladderLength(
        self, beginWord: str, endWord: str, wordList: list[str]
    ) -> int:
        word_set: set[str] = set(wordList)
        if endWord not in word_set:
            return 0

        # Build pattern -> words mapping
        pattern_map: dict[str, list[str]] = defaultdict(list)
        for word in word_set:
            for i in range(len(word)):
                pattern = word[:i] + "*" + word[i + 1 :]
                pattern_map[pattern].append(word)

        visited: set[str] = {beginWord}
        queue: deque[str] = deque([beginWord])
        steps = 1

        while queue:
            steps += 1
            for _ in range(len(queue)):
                current = queue.popleft()
                for i in range(len(current)):
                    pattern = current[:i] + "*" + current[i + 1 :]
                    for neighbor in pattern_map[pattern]:
                        if neighbor == endWord:
                            return steps
                        if neighbor not in visited:
                            visited.add(neighbor)
                            queue.append(neighbor)

        return 0
```

**Time**: O(n _ k^2) — `n` words of length `k`; generating each pattern is O(k), and we do this for every word.
**Space**: O(n _ k) — pattern map and visited set.
**Edge Cases**:

- `endWord` not in word list → 0
- `beginWord == endWord` → debatable; per LeetCode constraints they differ
- No possible transformations → 0
- Very long word list with short words → pattern map keeps it efficient

---

## Summary Table

| #   | Problem                     | Pattern                   | Key Insight                                    |
| --- | --------------------------- | ------------------------- | ---------------------------------------------- |
| 200 | Number of Islands           | Grid BFS/DFS              | Count connected components on a grid           |
| 133 | Clone Graph                 | BFS + Hash Map            | Map old nodes to new nodes to avoid duplicates |
| 417 | Pacific Atlantic Water Flow | Reverse Multi-source BFS  | Flow backward from ocean borders               |
| 207 | Course Schedule             | Topological Sort (Kahn's) | Cycle detection via in-degree processing       |
| 210 | Course Schedule II          | Topological Sort (Kahn's) | Same as 207 but collect the order              |
| 323 | Connected Components        | Union-Find                | Merge components, count remaining              |
| 261 | Graph Valid Tree            | Union-Find                | Tree = connected + n-1 edges + no cycle        |
| 994 | Rotting Oranges             | Multi-source BFS          | Level-order BFS = simultaneous spread          |
| 127 | Word Ladder                 | BFS Shortest Path         | Wildcard pattern map for neighbor lookup       |
