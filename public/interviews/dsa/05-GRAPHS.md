# Graphs

Graphs are one of the most versatile and frequently tested topics in coding interviews.
The core algorithms -- BFS, DFS, topological sort, shortest path, and union-find -- form the
backbone of problems ranging from social networks to dependency resolution to pathfinding.

---

## 1. Core Concepts

### 1.1 Graph Representations

**Adjacency List** (most common in interviews):

```python
from collections import defaultdict

# Unweighted graph
graph = defaultdict(list)
graph[0].append(1)
graph[1].append(0)  # undirected: add both directions

# Weighted graph
weighted = defaultdict(list)
weighted[0].append((1, 5))  # (neighbor, weight)
```

**Adjacency Matrix** (use when graph is dense or you need O(1) edge lookup):

```python
# n x n matrix; matrix[i][j] = 1 means edge from i to j
n = 5
matrix = [[0] * n for _ in range(n)]
matrix[0][1] = 1  # edge from 0 to 1
```

**Edge List** (use for union-find or Kruskal's):

```python
edges = [(0, 1, 5), (1, 2, 3), (0, 2, 8)]  # (u, v, weight)
```

| Representation | Space | Check Edge | Get Neighbors | Best For |
|---------------|-------|-----------|---------------|----------|
| Adjacency List | O(V+E) | O(degree) | O(1) | Sparse graphs |
| Adjacency Matrix | O(V^2) | O(1) | O(V) | Dense graphs |
| Edge List | O(E) | O(E) | O(E) | Union-find, sorting edges |

### 1.2 BFS vs DFS: When to Use Each

| Use BFS | Use DFS |
|---------|---------|
| Shortest path (unweighted) | Detect cycles |
| Level-order processing | Topological sort |
| Nearest neighbor | Path existence |
| Connected components (either works) | Backtracking/exhaustive search |
| Minimum steps/moves | Connected components (either works) |

### 1.3 BFS Template

```python
from collections import deque

def bfs(graph, start):
    visited = {start}
    queue = deque([start])

    while queue:
        node = queue.popleft()
        # process node

        for neighbor in graph[node]:
            if neighbor not in visited:
                visited.add(neighbor)
                queue.append(neighbor)
```

### 1.4 DFS Template

```python
def dfs(graph, start):
    visited = set()

    def explore(node):
        visited.add(node)
        # process node

        for neighbor in graph[node]:
            if neighbor not in visited:
                explore(neighbor)

    explore(start)
```

---

## 2. Classic Problems

### 2.1 Number of Islands

**Problem:** Given a 2D grid of `'1'`s (land) and `'0'`s (water), count the number of islands.
An island is surrounded by water and formed by connecting adjacent land cells.

**Approach:** Iterate through the grid. When you find a `'1'`, increment the count and BFS/DFS
to mark all connected land as visited.

```python
from collections import deque

def num_islands(grid: list[list[str]]) -> int:
    """
    Count number of islands using BFS.

    Time:  O(m * n) where m = rows, n = cols
    Space: O(min(m, n)) -- BFS queue in worst case
    """
    if not grid:
        return 0

    rows, cols = len(grid), len(grid[0])
    count = 0

    for r in range(rows):
        for c in range(cols):
            if grid[r][c] == '1':
                count += 1
                # BFS to mark all connected land
                queue = deque([(r, c)])
                grid[r][c] = '0'  # mark visited

                while queue:
                    row, col = queue.popleft()
                    for dr, dc in [(0, 1), (0, -1), (1, 0), (-1, 0)]:
                        nr, nc = row + dr, col + dc
                        if (0 <= nr < rows and 0 <= nc < cols
                                and grid[nr][nc] == '1'):
                            grid[nr][nc] = '0'
                            queue.append((nr, nc))

    return count
```

---

### 2.2 Clone Graph

**Problem:** Given a reference to a node in a connected undirected graph, return a deep copy.

**Approach:** BFS with a hash map from original node to its clone.

```python
class GraphNode:
    def __init__(self, val=0, neighbors=None):
        self.val = val
        self.neighbors = neighbors if neighbors is not None else []


def clone_graph(node: GraphNode | None) -> GraphNode | None:
    """
    Deep copy a graph using BFS.

    Time:  O(V + E)
    Space: O(V) -- hash map of clones
    """
    if not node:
        return None

    clones = {node: GraphNode(node.val)}
    queue = deque([node])

    while queue:
        current = queue.popleft()
        for neighbor in current.neighbors:
            if neighbor not in clones:
                clones[neighbor] = GraphNode(neighbor.val)
                queue.append(neighbor)
            clones[current].neighbors.append(clones[neighbor])

    return clones[node]
```

---

### 2.3 Course Schedule (Cycle Detection)

**Problem:** There are `numCourses` courses and prerequisites. Determine if you can finish
all courses (i.e., no cycle in the prerequisite graph).

**Approach:** Topological sort via DFS. If a cycle exists, topological ordering is impossible.

```python
def can_finish(num_courses: int, prerequisites: list[list[int]]) -> bool:
    """
    Detect if all courses can be finished (no cycle).

    Time:  O(V + E)
    Space: O(V + E)
    """
    graph = defaultdict(list)
    for course, prereq in prerequisites:
        graph[prereq].append(course)

    # States: 0 = unvisited, 1 = in progress, 2 = completed
    state = [0] * num_courses

    def has_cycle(node):
        if state[node] == 1:
            return True   # cycle detected
        if state[node] == 2:
            return False  # already verified

        state[node] = 1  # mark in progress

        for neighbor in graph[node]:
            if has_cycle(neighbor):
                return True

        state[node] = 2  # mark completed
        return False

    for course in range(num_courses):
        if has_cycle(course):
            return False

    return True
```

---

### 2.4 Course Schedule II (Topological Sort)

**Problem:** Return a valid order to finish all courses. If impossible, return empty.

**Approach (Kahn's Algorithm -- BFS):** Start with nodes that have 0 in-degree. Process
them, reduce neighbors' in-degrees, and add new 0-in-degree nodes.

```python
from collections import deque

def find_order(
    num_courses: int,
    prerequisites: list[list[int]]
) -> list[int]:
    """
    Topological sort using Kahn's algorithm (BFS).

    Time:  O(V + E)
    Space: O(V + E)
    """
    graph = defaultdict(list)
    in_degree = [0] * num_courses

    for course, prereq in prerequisites:
        graph[prereq].append(course)
        in_degree[course] += 1

    # Start with all nodes that have no prerequisites
    queue = deque(i for i in range(num_courses) if in_degree[i] == 0)
    order = []

    while queue:
        node = queue.popleft()
        order.append(node)

        for neighbor in graph[node]:
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    # If all courses are in the order, it is valid
    return order if len(order) == num_courses else []
```

**Approach (DFS):**

```python
def find_order_dfs(
    num_courses: int,
    prerequisites: list[list[int]]
) -> list[int]:
    """
    Topological sort using DFS (reverse postorder).

    Time:  O(V + E)
    Space: O(V + E)
    """
    graph = defaultdict(list)
    for course, prereq in prerequisites:
        graph[prereq].append(course)

    state = [0] * num_courses  # 0=unvisited, 1=in-progress, 2=done
    order = []

    def dfs(node):
        if state[node] == 1:
            return False  # cycle
        if state[node] == 2:
            return True

        state[node] = 1
        for neighbor in graph[node]:
            if not dfs(neighbor):
                return False

        state[node] = 2
        order.append(node)
        return True

    for course in range(num_courses):
        if not dfs(course):
            return []

    return order[::-1]  # reverse postorder
```

---

### 2.5 Word Ladder

**Problem:** Transform `beginWord` to `endWord` by changing one letter at a time. Each
intermediate word must be in `wordList`. Return the minimum number of transformations.

**Approach:** BFS where each word is a node and edges connect words differing by one letter.

```python
from collections import deque

def ladder_length(
    begin_word: str,
    end_word: str,
    word_list: list[str]
) -> int:
    """
    Shortest transformation sequence using BFS.

    Time:  O(n * m^2) where n = words, m = word length
    Space: O(n * m)
    """
    word_set = set(word_list)
    if end_word not in word_set:
        return 0

    queue = deque([(begin_word, 1)])
    visited = {begin_word}

    while queue:
        word, steps = queue.popleft()

        for i in range(len(word)):
            for c in 'abcdefghijklmnopqrstuvwxyz':
                next_word = word[:i] + c + word[i + 1:]
                if next_word == end_word:
                    return steps + 1
                if next_word in word_set and next_word not in visited:
                    visited.add(next_word)
                    queue.append((next_word, steps + 1))

    return 0
```

---

### 2.6 Network Delay Time (Dijkstra's)

**Problem:** Given a network of `n` nodes and weighted directed edges (times), find the time
it takes for a signal from node `k` to reach all nodes. Return -1 if impossible.

**Approach:** Dijkstra's algorithm finds shortest paths from a source in a weighted graph
with non-negative edges.

```python
import heapq
from collections import defaultdict

def network_delay_time(
    times: list[list[int]],
    n: int,
    k: int
) -> int:
    """
    Shortest path from k to all nodes using Dijkstra.

    Time:  O((V + E) log V) with binary heap
    Space: O(V + E)
    """
    graph = defaultdict(list)
    for u, v, w in times:
        graph[u].append((v, w))

    # Min-heap: (distance, node)
    heap = [(0, k)]
    dist = {}

    while heap:
        d, node = heapq.heappop(heap)

        if node in dist:
            continue  # already found shortest path to this node
        dist[node] = d

        for neighbor, weight in graph[node]:
            if neighbor not in dist:
                heapq.heappush(heap, (d + weight, neighbor))

    return max(dist.values()) if len(dist) == n else -1
```

---

### 2.7 Bellman-Ford Algorithm

Use Bellman-Ford when edges can have **negative weights** (Dijkstra fails with negative edges).

```python
def bellman_ford(
    n: int,
    edges: list[list[int]],
    src: int
) -> list[float]:
    """
    Shortest paths from src, handles negative weights.
    Detects negative cycles.

    Time:  O(V * E)
    Space: O(V)
    """
    dist = [float('inf')] * n
    dist[src] = 0

    # Relax all edges V-1 times
    for _ in range(n - 1):
        updated = False
        for u, v, w in edges:
            if dist[u] != float('inf') and dist[u] + w < dist[v]:
                dist[v] = dist[u] + w
                updated = True
        if not updated:
            break  # early termination

    # Check for negative cycles (one more relaxation)
    for u, v, w in edges:
        if dist[u] != float('inf') and dist[u] + w < dist[v]:
            raise ValueError("Negative cycle detected")

    return dist
```

---

### 2.8 Union-Find (Disjoint Set Union)

Union-Find efficiently tracks connected components. With path compression and union by rank,
operations are nearly O(1) amortized.

```python
class UnionFind:
    """
    Disjoint Set Union with path compression and union by rank.

    find:  O(alpha(n)) ~ O(1) amortized
    union: O(alpha(n)) ~ O(1) amortized
    Space: O(n)
    """

    def __init__(self, n: int):
        self.parent = list(range(n))
        self.rank = [0] * n
        self.components = n

    def find(self, x: int) -> int:
        """Find root with path compression."""
        if self.parent[x] != x:
            self.parent[x] = self.find(self.parent[x])
        return self.parent[x]

    def union(self, x: int, y: int) -> bool:
        """
        Union two sets. Returns True if they were in different sets.
        """
        root_x, root_y = self.find(x), self.find(y)
        if root_x == root_y:
            return False

        # Union by rank
        if self.rank[root_x] < self.rank[root_y]:
            root_x, root_y = root_y, root_x
        self.parent[root_y] = root_x
        if self.rank[root_x] == self.rank[root_y]:
            self.rank[root_x] += 1

        self.components -= 1
        return True

    def connected(self, x: int, y: int) -> bool:
        return self.find(x) == self.find(y)
```

---

## 3. Additional Important Problems

### 3.1 Connected Components

```python
def count_components(n: int, edges: list[list[int]]) -> int:
    """
    Count connected components using Union-Find.
    Time:  O(n + e * alpha(n))
    Space: O(n)
    """
    uf = UnionFind(n)
    for u, v in edges:
        uf.union(u, v)
    return uf.components
```

### 3.2 Pacific Atlantic Water Flow

```python
def pacific_atlantic(heights: list[list[int]]) -> list[list[int]]:
    """
    Find cells that can flow to both Pacific and Atlantic oceans.
    Time:  O(m * n)
    Space: O(m * n)
    """
    if not heights:
        return []

    rows, cols = len(heights), len(heights[0])
    pacific = set()
    atlantic = set()

    def dfs(r, c, reachable, prev_height):
        if ((r, c) in reachable or r < 0 or r >= rows
                or c < 0 or c >= cols or heights[r][c] < prev_height):
            return
        reachable.add((r, c))
        for dr, dc in [(0, 1), (0, -1), (1, 0), (-1, 0)]:
            dfs(r + dr, c + dc, reachable, heights[r][c])

    for c in range(cols):
        dfs(0, c, pacific, heights[0][c])
        dfs(rows - 1, c, atlantic, heights[rows - 1][c])

    for r in range(rows):
        dfs(r, 0, pacific, heights[r][0])
        dfs(r, cols - 1, atlantic, heights[r][cols - 1])

    return list(pacific & atlantic)
```

### 3.3 Graph Valid Tree

```python
def valid_tree(n: int, edges: list[list[int]]) -> bool:
    """
    A graph is a valid tree if it is connected and has no cycles.
    A tree with n nodes has exactly n-1 edges.

    Time:  O(n)
    Space: O(n)
    """
    if len(edges) != n - 1:
        return False

    uf = UnionFind(n)
    for u, v in edges:
        if not uf.union(u, v):
            return False  # cycle detected

    return True
```

---

## 4. Common Interview Questions

| # | Problem | Difficulty | Pattern | Key Insight |
|---|---------|-----------|---------|-------------|
| 1 | Number of Islands | Medium | BFS/DFS on grid | Flood fill from each unvisited '1' |
| 2 | Clone Graph | Medium | BFS + hash map | Map original to clone |
| 3 | Course Schedule | Medium | Cycle detection (DFS) | 3-state coloring |
| 4 | Course Schedule II | Medium | Topological sort | Kahn's BFS or DFS postorder |
| 5 | Pacific Atlantic | Medium | Multi-source DFS | Start from ocean borders |
| 6 | Number of Connected Components | Medium | Union-Find or DFS | Count roots/components |
| 7 | Graph Valid Tree | Medium | Union-Find | n-1 edges + no cycle = tree |
| 8 | Word Ladder | Hard | BFS | Each word is a node, 1-letter diff = edge |
| 9 | Network Delay Time | Medium | Dijkstra | Min-heap shortest path |
| 10 | Redundant Connection | Medium | Union-Find | First edge creating a cycle |
| 11 | Alien Dictionary | Hard | Topological sort | Build order from word comparisons |

---

## 5. Gotchas

### 5.1 BFS Gotchas
- **Mark visited BEFORE enqueueing**, not when dequeuing. Otherwise you enqueue duplicates.
- **Grid BFS**: Use `(row, col)` tuples for visited set. Don't forget bounds checking.
- **Shortest path guarantee**: BFS only gives shortest path for **unweighted** graphs. For
  weighted graphs, use Dijkstra.

### 5.2 DFS Gotchas
- **Cycle detection**: Need 3 states (unvisited, in-progress, completed) for **directed**
  graphs. For undirected graphs, tracking parent is sufficient.
- **Stack overflow**: For very deep graphs (100,000+ nodes), iterative DFS is safer.
- **Grid DFS**: Set `sys.setrecursionlimit()` for large grids, or use iterative BFS.

### 5.3 Topological Sort Gotchas
- **Only for DAGs**: Topological sort is undefined for graphs with cycles. Always check.
- **Multiple valid orders**: Topological sort is not unique. Don't assume a specific order.
- **Kahn's vs DFS**: Kahn's naturally detects cycles (output length < V). DFS needs
  explicit cycle checking.

### 5.4 Dijkstra Gotchas
- **No negative weights**: Dijkstra fails with negative edges. Use Bellman-Ford instead.
- **Lazy deletion**: With a binary heap, you may pop already-visited nodes. Skip them with
  `if node in dist: continue`.
- **0-indexed vs 1-indexed**: Many problems use 1-indexed nodes. Adjust accordingly.

### 5.5 Union-Find Gotchas
- **Path compression**: Always implement it. Without it, find is O(n) worst case.
- **Union by rank**: Pair with path compression for near-O(1) amortized operations.
- **Connected check**: `uf.find(a) == uf.find(b)`, not `uf.parent[a] == uf.parent[b]`.

---

## 6. Quick Reference

| Algorithm | When to Use | Time | Space | Key Detail |
|-----------|-------------|------|-------|------------|
| BFS | Shortest path (unweighted), level-order | O(V+E) | O(V) | Mark visited before enqueue |
| DFS | Cycle detection, path finding, topo sort | O(V+E) | O(V) | 3-state for directed cycles |
| Topological Sort (Kahn's) | Dependency ordering | O(V+E) | O(V+E) | Start from in-degree 0 |
| Topological Sort (DFS) | Dependency ordering | O(V+E) | O(V+E) | Reverse postorder |
| Dijkstra | Shortest path (weighted, non-negative) | O((V+E)logV) | O(V+E) | Min-heap, no negative edges |
| Bellman-Ford | Shortest path (negative edges ok) | O(V*E) | O(V) | Relax all edges V-1 times |
| Union-Find | Connected components, cycle detection | O(alpha(n))/op | O(V) | Path compression + union by rank |
| Grid BFS/DFS | 2D matrix traversal | O(m*n) | O(m*n) | 4-directional neighbors |
| Multi-source BFS | Distance from multiple sources | O(V+E) | O(V) | Enqueue all sources initially |
