# Design Google Maps / Navigation System

Google Maps is one of the most complex consumer software systems ever built. It combines
cartography, graph theory, real-time data processing, machine learning, and massive-scale
distributed systems. This guide covers the core subsystems: map tile rendering, routing
algorithms, real-time traffic, navigation, and search/geocoding.

---

## 1. Requirements Clarification

### 1.1 Functional Requirements

| Requirement                  | Description                                                        |
|------------------------------|--------------------------------------------------------------------|
| **Map tile display**         | Render map tiles at 21 zoom levels (world overview to street view) |
| **Place search**             | Search for places by name, address, or category                    |
| **Route calculation**        | Calculate routes for driving, walking, cycling, and transit         |
| **Real-time navigation**     | Turn-by-turn directions with voice guidance                        |
| **ETA estimation**           | Accurate arrival time incorporating live traffic                   |
| **Traffic visualization**    | Color-coded traffic overlay on map (green/yellow/red)              |
| **Offline maps**             | Download regions for offline use                                   |
| **Multi-stop routing**       | Routes with multiple waypoints                                     |
| **Route options**            | Avoid tolls, highways, ferries; shortest vs fastest                |

### 1.2 Non-Functional Requirements

| Requirement              | Target                                                      |
|--------------------------|-------------------------------------------------------------|
| **Route latency**        | < 500ms for single-origin-destination route calculation     |
| **Tile load latency**    | < 100ms per tile (from CDN cache hit)                       |
| **Traffic freshness**    | Real-time traffic updates within 30-60 seconds              |
| **Availability**         | 99.99% uptime globally                                      |
| **Global coverage**      | Road networks for 220+ countries                            |
| **Offline capability**   | Full routing on downloaded regions without network           |
| **Accuracy**             | ETA within 10% of actual travel time (p90)                  |

### 1.3 Scale Estimation

```
Users:
  Monthly active users (MAU):     1,000,000,000 (1B)
  Daily active users (DAU):       500,000,000 (500M)
  Concurrent users (peak):        50,000,000 (50M)

Route Requests:
  Routes per user per day:        2
  Total route requests/day:       1,000,000,000 (1B)
  Route QPS (average):            1B / 86,400 ~ 11,574 QPS
  Route QPS (peak, 5x):           ~58,000 QPS
  Target: ~1M route requests/minute = ~16,700 QPS average

Map Tile Requests:
  Tiles per map view:             ~12-16 tiles (4x4 grid)
  Map views per user per day:     10
  Total tile requests/day:        500M * 10 * 16 = 80,000,000,000 (80B)
  Tile QPS (average):             80B / 86,400 ~ 926,000 QPS
  Tile QPS (peak, 3x):            ~2,800,000 QPS (mostly served by CDN)

Traffic Data:
  GPS probes from phones:         ~500M active devices reporting
  GPS updates per device:         1 per 3 seconds (during navigation)
  Peak GPS ingest rate:           ~50M updates/second
  Traffic data per day:           ~4 trillion GPS data points
```

### 1.4 Storage Estimates

```
Map Tile Storage:
  Zoom levels:                    0-20 (21 levels)
  Tiles at zoom level z:          4^z tiles
  Total tiles (all zoom levels):  ~4^20 = ~1.1 trillion tiles
  Average raster tile size:       ~15 KB (PNG)
  Total raster tile storage:      ~1.1T * 15KB = ~16.5 PB
  Vector tiles (10x smaller):     ~1.65 PB
  Multiple map styles (3x):       ~5 PB (vector) to ~50 PB (raster)

Road Network Graph:
  Intersections (nodes):          ~500,000,000 (500M globally)
  Road segments (edges):          ~1,000,000,000 (1B globally)
  Per node (id, lat, lng, meta):  ~64 bytes
  Per edge (id, src, dst, attrs): ~128 bytes
  Total graph size:               500M*64 + 1B*128 = ~160 GB
  With adjacency lists:           ~250 GB (fits on one large machine)
  Contraction hierarchy overlay:  ~2x = ~500 GB

Traffic Data:
  Road segments with traffic:     ~200M segments
  Speed record per segment:       ~32 bytes (segment_id, speed, timestamp, confidence)
  Traffic snapshot:               200M * 32 = ~6.4 GB per snapshot
  Snapshots per day (1/min):      1,440 * 6.4 GB = ~9.2 TB/day
  Historical (1 year):            ~3.4 PB

Place/POI Data:
  Total places:                   ~250,000,000 (250M)
  Average record:                 ~2 KB
  Total:                          ~500 GB
```

### 1.5 Key Observations

1. **Tile serving is the highest QPS** -- must use CDN aggressively (99%+ cache hit rate).
2. **Road graph fits in memory** (~250 GB) on a high-memory machine, or can be partitioned.
3. **Traffic data is enormous** but only the latest snapshot matters for routing (~6.4 GB).
4. **Routing is CPU-intensive**, not I/O-intensive -- scale with compute, not storage.
5. **Offline maps** require downloadable graph + tiles per region.

---

## 2. Map Tile Rendering

### 2.1 The Tile Pyramid System

Maps use a hierarchical tiling scheme. At each zoom level, the world is divided into
progressively smaller square tiles. The most common scheme is the **Slippy Map** standard
(used by Google Maps, OpenStreetMap, Mapbox).

```
Tile Pyramid (Mercator Projection):

Zoom 0: 1 tile (entire world)
┌─────────────────┐
│                  │
│   Whole World    │
│    (256x256)     │
│                  │
└─────────────────┘

Zoom 1: 4 tiles (2x2 grid)
┌────────┬────────┐
│  NW    │  NE    │
│ (0,0)  │ (1,0)  │
├────────┼────────┤
│  SW    │  SE    │
│ (0,1)  │ (1,1)  │
└────────┴────────┘

Zoom 2: 16 tiles (4x4 grid)
┌────┬────┬────┬────┐
│0,0 │1,0 │2,0 │3,0 │
├────┼────┼────┼────┤
│0,1 │1,1 │2,1 │3,1 │
├────┼────┼────┼────┤
│0,2 │1,2 │2,2 │3,2 │
├────┼────┼────┼────┤
│0,3 │1,3 │2,3 │3,3 │
└────┴────┴────┴────┘

...

Zoom 20: 4^20 = ~1.1 trillion tiles

Tile counts by zoom level:
  Zoom  0:  1 tile              (whole world)
  Zoom  1:  4 tiles
  Zoom  5:  1,024 tiles         (continent level)
  Zoom 10:  1,048,576 tiles     (city level)
  Zoom 15:  1,073,741,824       (neighborhood level)
  Zoom 20:  ~1.1 trillion       (individual buildings)
```

### 2.2 Tile Coordinate System

Each tile is identified by three coordinates: **(x, y, zoom)**.

```
Converting lat/lng to tile coordinates:

  n = 2^zoom
  tile_x = floor((lng + 180) / 360 * n)
  tile_y = floor((1 - ln(tan(lat_rad) + sec(lat_rad)) / pi) / 2 * n)

URL pattern:
  https://tiles.maps.example.com/{zoom}/{x}/{y}.png
  https://tiles.maps.example.com/15/16826/10770.png

Example: San Francisco at zoom 15
  lat = 37.7749, lng = -122.4194
  n = 2^15 = 32768
  tile_x = floor(((-122.4194) + 180) / 360 * 32768) = 5245
  tile_y = floor((1 - ln(tan(0.6593) + sec(0.6593)) / pi) / 2 * 32768) = 12661
```

### 2.3 Vector Tiles vs Raster Tiles

| Property               | Raster Tiles              | Vector Tiles              |
|------------------------|---------------------------|---------------------------|
| **Format**             | Pre-rendered PNG/JPEG     | Protobuf / GeoJSON        |
| **Size**               | ~15-30 KB per tile        | ~2-5 KB per tile          |
| **Rendering**          | Server-side               | Client-side (GPU)         |
| **Styling**            | Fixed at render time      | Dynamic (dark mode, etc.) |
| **Rotation**           | Pixelated when rotated    | Crisp at any angle        |
| **Label placement**    | Baked into image          | Dynamic per viewport      |
| **Zoom transitions**   | Discrete jumps            | Smooth continuous zoom    |
| **Offline storage**    | ~5 GB per metro area      | ~500 MB per metro area    |
| **CPU usage (client)** | Low (just display image)  | Higher (parse + render)   |
| **Bandwidth**          | Higher                    | 5-10x lower               |
| **Best for**           | Legacy, simple maps       | Modern interactive maps   |

Modern Google Maps uses **vector tiles** for most views. Satellite imagery uses raster tiles.

### 2.4 Tile Caching Strategy

```
Tile Serving Pipeline:

  Client Request: GET /tiles/15/5245/12661.pbf
       │
       ▼
  ┌──────────────┐   Cache Hit (99%)    ┌─────────────┐
  │  CDN Edge    │ ◄──────────────────── │  CDN Cache   │
  │  (Cloudflare/│                       │  (per-POP)   │
  │   Fastly)    │ ──────────────────►   └─────────────┘
  └──────┬───────┘   Cache Miss (1%)
         │
         ▼
  ┌──────────────┐   Cache Hit (90%)    ┌─────────────┐
  │  Tile Cache  │ ◄──────────────────── │  Redis/      │
  │  (Regional)  │                       │  Memcached   │
  └──────┬───────┘   Cache Miss (10%)   └─────────────┘
         │
         ▼
  ┌──────────────┐
  │  Tile Store  │   Pre-rendered tiles in object storage
  │  (S3/GCS)    │   or on-demand tile generation
  └──────┬───────┘
         │  (only if not pre-rendered)
         ▼
  ┌──────────────┐
  │  Tile Render │   Render from raw map data
  │  Service     │   (only for dynamic/custom tiles)
  └──────────────┘

Cache TTL Strategy:
  - Zoom 0-10:   30 days  (continent/country rarely change)
  - Zoom 11-15:  7 days   (city level, occasional road changes)
  - Zoom 16-20:  1 day    (street level, more frequent updates)
  - Traffic tiles: 60 seconds (real-time overlay)
```

### 2.5 Map Data Sources

```
Data Source Pipeline:

  ┌─────────────────┐
  │ Satellite        │───┐
  │ Imagery (aerial) │   │
  └─────────────────┘   │
  ┌─────────────────┐   │     ┌──────────────┐     ┌──────────────┐
  │ Street-Level     │───┼────►│  Map Data     │────►│  Tile        │
  │ (Street View)    │   │     │  Pipeline     │     │  Rendering   │
  └─────────────────┘   │     │  (processing, │     │  Engine      │
  ┌─────────────────┐   │     │   conflation,  │     └──────────────┘
  │ Government/      │───┤     │   validation)  │
  │ Public Data      │   │     └──────────────┘
  └─────────────────┘   │
  ┌─────────────────┐   │
  │ User             │───┤
  │ Contributions    │   │
  └─────────────────┘   │
  ┌─────────────────┐   │
  │ Commercial       │───┘
  │ Partners         │
  └─────────────────┘
```

---

## 3. Road Network as Graph

### 3.1 Graph Representation

The road network is modeled as a **weighted directed graph** where:

- **Nodes** = intersections (or points where road attributes change)
- **Edges** = road segments connecting two nodes
- **Edge weights** = travel time (not distance!) based on speed limits, road type, and traffic

```
Road Network Graph Model:

  Physical Road Layout:              Graph Representation:

    ══A═══════B═══                    A ────(5min)────► B
    ║         ║                       │                 │
    ║  Park   ║                     (3min)            (2min)
    ║         ║                       │                 │
    ══C═══════D═══                    ▼                 ▼
    ║                                 C ────(4min)────► D
    ║                                 │
    ═══E══════                      (6min)
                                      │
                                      ▼
                                      E

  Note: Edge weights are TRAVEL TIME, not distance.
  A highway segment of 10km might have weight 5min,
  while a city street of 2km might also have weight 5min.
```

### 3.2 Road Network Data Model

```
Node (Intersection):
┌──────────────────────────────────────────────────────┐
│ node_id:    uint64    (8 bytes)                      │
│ latitude:   float64   (8 bytes)                      │
│ longitude:  float64   (8 bytes)                      │
│ elevation:  float32   (4 bytes)  -- for grade info   │
│ type:       uint8     (1 byte)   -- signal, stop, etc│
│ metadata:   bytes     (variable)                     │
│                                    Total: ~32-64 B   │
└──────────────────────────────────────────────────────┘

Edge (Road Segment):
┌──────────────────────────────────────────────────────┐
│ edge_id:       uint64   (8 bytes)                    │
│ source_node:   uint64   (8 bytes)                    │
│ target_node:   uint64   (8 bytes)                    │
│ distance_m:    uint32   (4 bytes)  -- meters         │
│ speed_limit:   uint16   (2 bytes)  -- km/h           │
│ road_class:    uint8    (1 byte)   -- highway, local │
│ lanes:         uint8    (1 byte)                     │
│ is_oneway:     bool     (1 byte)                     │
│ is_toll:       bool     (1 byte)                     │
│ road_name_id:  uint32   (4 bytes)  -- reference      │
│ geometry:      bytes    (variable) -- polyline shape  │
│ travel_time:   uint32   (4 bytes)  -- base seconds   │
│                                    Total: ~64-128 B  │
└──────────────────────────────────────────────────────┘

Road Classes (hierarchical):
  0: Motorway / Interstate
  1: Trunk road / State highway
  2: Primary road
  3: Secondary road
  4: Tertiary road
  5: Residential street
  6: Service / access road
  7: Pedestrian / bicycle path
```

### 3.3 Adjacency List Representation

```
Compact Adjacency List (CSR - Compressed Sparse Row):

  For a graph with N nodes, M edges:

  first_out[N+1]:  Array of offsets (4 bytes each)
  head[M]:         Array of target node IDs (4 bytes each)
  weight[M]:       Array of travel times (4 bytes each)

  To find neighbors of node v:
    for i in range(first_out[v], first_out[v+1]):
        neighbor = head[i]
        cost     = weight[i]

  Memory: 4*(N+1) + 4*M + 4*M bytes
  For 500M nodes, 1B edges:
    = 4*500M + 4*1B + 4*1B = 2GB + 4GB + 4GB = 10 GB

  This fits comfortably in RAM on a single machine!
```

### 3.4 Graph Partitioning

For distributed storage and processing, the graph is partitioned by geographic region.

```
Graph Partitioning Strategy:

  ┌─────────────┬─────────────┬─────────────┐
  │  Pacific     │  Mountain    │  Eastern     │
  │  Northwest   │  Region     │  Seaboard    │
  │             │             │             │
  │  Partition 1 │  Partition 2 │  Partition 3 │
  └──────┬──────┴──────┬──────┴──────┬──────┘
         │             │             │
         └──────┬──────┘             │
                │    Cross-partition │
                │    boundary edges  │
                └────────────────────┘

  Partitioning Methods:
  1. Geographic grid (simple but uneven)
  2. KD-tree based (balanced by node count)
  3. METIS graph partitioning (minimizes boundary edges)

  Each partition server holds:
  - Full subgraph for its region
  - "Ghost nodes" at partition boundaries
  - Shortcut edges to adjacent partitions

  Cross-partition routing:
  1. Route within source partition to boundary
  2. Route across boundary via overlay graph
  3. Route within destination partition from boundary
```

---

## 4. Routing Algorithms Deep Dive

### 4.1 Dijkstra's Algorithm

The baseline shortest-path algorithm. Explores nodes in order of increasing distance from
the source.

```
Pseudocode: Dijkstra's Algorithm

  function dijkstra(graph, source, target):
      dist = {v: INF for v in graph.nodes}
      dist[source] = 0
      prev = {}
      pq = MinPriorityQueue()
      pq.insert(source, 0)

      while pq is not empty:
          u, d = pq.extract_min()

          if u == target:
              return reconstruct_path(prev, target), d

          if d > dist[u]:
              continue  // stale entry

          for (v, weight) in graph.neighbors(u):
              alt = dist[u] + weight
              if alt < dist[v]:
                  dist[v] = alt
                  prev[v] = u
                  pq.insert(v, alt)

      return null  // no path found

  Time Complexity:  O((V + E) * log V) with binary heap
  Space Complexity: O(V)
```

```
Dijkstra Exploration Pattern (source = S, target = T):

  Explores outward in all directions like expanding circle:

          . . . . . . . . . . .
        . . . . . . . . . . . . .
      . . . . * * * * * . . . . . .
    . . . * * * * * * * * * . . . . .
  . . . * * * * * * * * * * * . . . . T
  . . * * * * * S * * * * * * . . . .
  . . . * * * * * * * * * * * . . . .
    . . . * * * * * * * * * . . . . .
      . . . . * * * * * . . . . . .
        . . . . . . . . . . . . .
          . . . . . . . . . . .

  * = explored nodes (wasted work!)

  For a continental route (e.g., NYC to LA):
    - Road network has ~30M nodes in the US
    - Dijkstra might explore ~15M nodes
    - Takes 5-30 seconds on modern hardware
    - FAR too slow for a consumer product
```

### 4.2 A* Algorithm

Improves on Dijkstra by using a **heuristic function** to guide the search toward the target.

```
Pseudocode: A* Algorithm

  function a_star(graph, source, target):
      g_score = {v: INF for v in graph.nodes}
      g_score[source] = 0
      f_score = {v: INF for v in graph.nodes}
      f_score[source] = heuristic(source, target)
      prev = {}
      open_set = MinPriorityQueue()  // ordered by f_score
      open_set.insert(source, f_score[source])

      while open_set is not empty:
          u, f = open_set.extract_min()

          if u == target:
              return reconstruct_path(prev, target), g_score[target]

          for (v, weight) in graph.neighbors(u):
              tentative_g = g_score[u] + weight
              if tentative_g < g_score[v]:
                  g_score[v] = tentative_g
                  f_score[v] = tentative_g + heuristic(v, target)
                  prev[v] = u
                  open_set.insert(v, f_score[v])

      return null

  Heuristic function (must be admissible = never overestimates):

  function heuristic(node, target):
      // Haversine distance / max_possible_speed
      straight_line_dist = haversine(node.lat, node.lng,
                                      target.lat, target.lng)
      max_speed = 130 km/h  // fastest road speed
      return straight_line_dist / max_speed
```

```
A* Exploration Pattern (source = S, target = T):

  Explores preferentially toward the target:

                        . . . . . .
          . . .       . . * * * * . .
        . . . .     . * * * * * * . .
      . . * * .   . * * * * * * . . . T
    . . * * * . . * * * * * * . . .
  . . * * * S * * * * * * * . . .
    . . * * * * * * * * . . .
      . . * * * * * . . .
        . . . . . . .

  A* typically explores 2-5x fewer nodes than Dijkstra.
  But for NYC -> LA, it still explores millions of nodes.
  Query time: 1-5 seconds. Still too slow!
```

### 4.3 Contraction Hierarchies (CH)

**The algorithm that makes Google Maps possible.** Contraction Hierarchies is a
preprocessing-based speed-up technique that makes queries 1000-3000x faster than Dijkstra.

#### 4.3.1 Key Insight

Not all nodes are equally important. A highway interchange is more important than a
residential cul-de-sac. CH exploits this hierarchy.

#### 4.3.2 Preprocessing Phase

```
Contraction Hierarchies: Node Ordering and Contraction

  Step 1: Order all nodes by "importance"
          (heuristic: edge difference, deleted neighbors, etc.)

  Step 2: Contract nodes from least to most important

  Contracting node v:
    - For each pair of neighbors (u, w) of v:
      - If the shortest path u->w goes through v:
        - Add "shortcut edge" u->w with weight = w(u,v) + w(v,w)
    - Mark v as contracted

  Example:

  Before contracting node B:

    A ──(3)──► B ──(2)──► C
                │
              (5)
                │
                ▼
                D

  Is A->B->C the shortest A->C path? If yes, add shortcut:

    A ──(3)──► B ──(2)──► C       A ──────(5)──────► C
                │                  (shortcut added)
              (5)
                │
                ▼
                D

  After contracting all low-importance nodes:

  Original Graph:                    Contracted Graph:

  a─b─c─d─e─f─g                    a─b─c─d─e─f─g
  │ │ │ │ │ │ │                          │     │
  h─i─j─k─l─m─n      ──────►           H─────M
  │ │ │ │ │ │ │                          │     │
  o─p─q─r─s─t─u                    o─p─q─r─s─t─u

  (H, M are highway nodes with shortcuts
   connecting distant parts of the graph)
```

#### 4.3.3 Query Phase

```
CH Query: Bidirectional Search on Hierarchical Graph

  Key rule: Only traverse edges going UP in the hierarchy.

  Forward search from source S: only go to MORE important nodes
  Backward search from target T: only go to MORE important nodes
  They meet at some high-importance node in the middle.

          Importance
            ▲
            │     Highway     Highway
            │    interchange  interchange
            │       ╱ ╲         ╱ ╲
            │     ╱     ╲     ╱     ╲
            │   ╱         ╲ ╱         ╲
            │  arterial   arterial   arterial
            │  ╱  ╲        ╱ ╲       ╱  ╲
            │ local local local local local local
            │  S                              T
            └──────────────────────────────────────►
                        Geography

  Forward search (from S, going UP):
    S → local ��� arterial → highway interchange

  Backward search (from T, going UP):
    T → local → arterial → highway interchange

  Meeting point: both searches reach highway-level nodes
  Total nodes explored: ~500-2000 (vs millions for Dijkstra!)

Pseudocode:

  function ch_query(source, target):
      // Forward Dijkstra (only upward edges)
      dist_fwd = dijkstra_upward(source)

      // Backward Dijkstra (only upward edges in reverse graph)
      dist_bwd = dijkstra_upward_reverse(target)

      // Find meeting node with minimum total distance
      best = INF
      meeting = null
      for each node v explored by both searches:
          if dist_fwd[v] + dist_bwd[v] < best:
              best = dist_fwd[v] + dist_bwd[v]
              meeting = v

      // Unpack shortcuts to get full path
      return unpack_path(source, meeting, target), best
```

#### 4.3.4 Performance Comparison

```
CH Performance on US Road Network (~24M nodes, ~58M edges):

  Preprocessing:
    Node ordering:                    ~10 minutes
    Contraction:                      ~5 minutes
    Total preprocessing:              ~15 minutes
    Shortcut edges added:             ~30M (about 50% of original)
    Total edges in CH:                ~88M

  Query:
    Average nodes explored:           ~800
    Average query time:               ~0.3 ms
    Speedup over Dijkstra:            ~3,000x
    Speedup over A*:                  ~500x

  Memory:
    Original graph:                   ~1.5 GB
    CH overlay (shortcuts + order):   ~1 GB
    Total:                            ~2.5 GB
```

### 4.4 ALT Algorithm (A* + Landmarks + Triangle Inequality)

An alternative speedup technique that is simpler to implement and supports dynamic edge
weights better than CH.

```
ALT Algorithm:

  Preprocessing:
    1. Select ~16-32 "landmark" nodes spread across the graph
    2. Compute shortest distances from ALL nodes to ALL landmarks
       (and from all landmarks to all nodes)
    3. Store these distances in a lookup table

  Query:
    Use the triangle inequality to compute a tighter lower bound:

    For landmark L:
      dist(v, t) >= |dist(v, L) - dist(t, L)|    (triangle inequality)

    heuristic(v, t) = max over all landmarks L of:
      |dist(v, L) - dist(t, L)|

    This heuristic is much tighter than Haversine distance,
    so A* explores far fewer nodes.

  Performance:
    Preprocessing: O(k * (V + E) * log V)  where k = number of landmarks
    Query: ~10-50x speedup over plain A*
    Not as fast as CH, but supports dynamic weights!

  Memory:
    Landmark distances: 2 * k * V * 4 bytes
    For k=16, V=30M: 2 * 16 * 30M * 4 = 3.84 GB
```

### 4.5 Algorithm Comparison Table

| Property                | Dijkstra       | A*             | CH              | ALT            |
|-------------------------|----------------|----------------|-----------------|----------------|
| **Preprocessing**       | None           | None           | 15-30 min       | 30-60 min      |
| **Query time (US)**     | 3-10 sec       | 0.5-2 sec      | 0.1-1 ms        | 10-50 ms       |
| **Nodes explored**      | ~15M           | ~3M            | ~500-2000       | ~50K-200K      |
| **Speedup vs Dijkstra** | 1x             | 3-5x           | 1000-3000x      | 50-200x        |
| **Dynamic weights**     | Yes            | Yes            | No (re-preproc) | Partial        |
| **Space overhead**      | O(V)           | O(V)           | O(V + E')       | O(k * V)       |
| **Implementation**      | Simple         | Simple         | Complex         | Moderate       |
| **Used in production**  | Rarely         | Small graphs   | Google, Apple   | Some providers |
| **Turn restrictions**   | Easy           | Easy           | Complex         | Easy           |
| **Multi-criteria**      | Easy           | Easy           | Separate CH     | Moderate       |

---

## 5. Real-Time Traffic

### 5.1 Traffic Data Sources

```
Traffic Data Sources and Their Characteristics:

┌──────────────────────┬───────────────┬────────────────┬──────────────┐
│ Source               │ Coverage      │ Latency        │ Accuracy     │
├──────────────────────┼───────────────┼────────────────┼──────────────┤
│ GPS traces (phones)  │ Excellent     │ Real-time (3s) │ High         │
│ Connected vehicles   │ Growing       │ Real-time      │ Very High    │
│ Road sensors/loops   │ Limited       │ Real-time      │ Very High    │
│ Traffic cameras      │ Urban only    │ Near-real-time  │ High         │
│ Historical patterns  │ Complete      │ N/A            │ Moderate     │
│ Event feeds          │ Supplementary │ Minutes        │ Variable     │
│ Waze user reports    │ Good          │ Real-time      │ Moderate     │
└──────────────────────┴───────────────┴────────────────┴──────────────┘

Primary source: GPS traces from phones running Google Maps, Waze,
  Android location services. This gives Google data from hundreds
  of millions of devices.
```

### 5.2 Traffic Data Pipeline

```
Traffic Data Pipeline:

  ┌─────────────┐   GPS updates    ┌─────────────┐
  │  500M+      │   (lat, lng,     │  Ingestion   │
  │  Mobile     │──────────────────►│  Gateway     │
  │  Devices    │   speed, heading │  (load       │
  └─────────────┘   1 per 3 sec)   │  balancer)   │
                                    └──────┬──────┘
                                           │
                    ┌──────────────────────┐│
                    │                      ▼│
              ┌─────┴──────┐      ┌────────┴───────┐
              │  Kafka     │      │  Kafka         │
              │  Cluster   │◄─────│  Partitioned   │
              │  (raw GPS) │      │  by geo-hash   │
              └─────┬──────┘      └────────────────┘
                    │
         ┌──────────┼──────────┐
         ▼          ▼          ▼
  ┌────────────┐ ┌────────────┐ ┌────────────┐
  │  Flink/    │ │  Flink/    │ │  Flink/    │
  │  Spark     │ │  Spark     │ │  Spark     │
  │  (Region 1)│ │  (Region 2)│ │  (Region N)│
  │            │ │            │ │            │
  │  Map Match │ │  Map Match │ │  Map Match │
  │  Aggregate │ │  Aggregate │ │  Aggregate │
  │  Classify  │ │  Classify  │ │  Classify  │
  └─────┬──────┘ └─────┬──────┘ └─────┬──────┘
        │              │              │
        └──────────┬───┘──────────────┘
                   ▼
         ┌─────────────────┐
         │  Traffic State   │
         │  Store           │
         │  (Redis cluster) │
         │                  │
         │  key: segment_id │
         │  val: speed,     │
         │       confidence,│
         │       timestamp  │
         └────────┬────────┘
                  │
        ┌─────────┼─────────┐
        ▼         ▼         ▼
  ┌──────────┐ ┌──────────┐ ┌──────────┐
  │ Routing  │ │ Traffic  │ │ Traffic  │
  │ Service  │ │ Tile     │ │ History  │
  │ (weight  │ │ Renderer │ │ Store    │
  │  update) │ │ (colors) │ │ (HDFS)   │
  └──────────┘ └──────────┘ └──────────┘
```

### 5.3 Map Matching

Raw GPS traces must be "snapped" to the road network (map matching).

```
Map Matching Problem:

  Raw GPS points (noisy):       Matched to road segments:

       *                              ═══════════
    *     *                          ║
       *                             ║
         *    *                      ╚══════════
            *
         *                           Road segments now
       *                             have speed data!
    *

  Algorithm: Hidden Markov Model (HMM) based map matching
  - States: road segments
  - Observations: GPS points
  - Transition probabilities: road connectivity
  - Emission probabilities: GPS point to road distance
  - Solved with Viterbi algorithm
```

### 5.4 Speed Profiles and Traffic Classification

```
Speed Profile for a Road Segment:

  Speed (km/h)
  80 ┤
     │     ████                               ████
  60 ┤   ██    ██                           ██    ██
     │  █        █                         █        █
  40 ┤ █          █         ████          █          █
     │█            █      ██    ██       █
  20 ┤              █   ██        ██    █
     │               ███            ███
   0 ┤─────────────────────────────────────────────────
     0  2  4  6  8  10 12 14 16 18 20 22 24
                     Hour of day

  Morning rush: 7-9 AM (speed drops to 15 km/h)
  Evening rush: 5-7 PM (speed drops to 20 km/h)
  Free flow:    10 PM - 6 AM (80 km/h)

Traffic Classification:

  ┌─────────────────────────────────────────────────────┐
  │ Classification │ Speed Ratio*   │ Color   │ Code   │
  ├─────────────────────────────────────────────────────┤
  │ Free flow      │ > 0.75         │ Green   │ 0      │
  │ Moderate       │ 0.50 - 0.75    │ Yellow  │ 1      │
  │ Slow           │ 0.25 - 0.50    │ Orange  │ 2      │
  │ Congested      │ < 0.25         │ Red     │ 3      │
  │ Closed/Blocked │ 0              │ Black   │ 4      │
  └─────────────────────────────────────────────────────┘

  * Speed Ratio = current_speed / free_flow_speed
```

### 5.5 Integrating Traffic into Routing

```
Live Traffic + Routing Integration:

  Static edge weight (no traffic):
    weight(u, v) = distance(u, v) / speed_limit(u, v)

  Dynamic edge weight (with traffic):
    weight(u, v) = distance(u, v) / current_speed(u, v)

  Time-dependent routing:
    When the route takes 2 hours, the traffic at the destination
    should be predicted for 2 hours from now, not current traffic.

    weight(u, v, departure_time) =
      distance(u, v) / predicted_speed(u, v, departure_time)

  For CH with traffic:
    Option 1: Customizable CH (CCH)
      - Preprocess CH topology once
      - Update edge weights quickly (~1 second) when traffic changes
      - Re-run metric update every 60 seconds

    Option 2: CH + traffic corridor
      - Run CH query ignoring traffic (fast, ~1ms)
      - Get candidate paths
      - Re-weight candidate paths with live traffic
      - Select best path

    Option 3: Time-dependent CH (TCH)
      - Most complex, supports proper time-dependent routing
      - Edge weights are functions of departure time, not constants
```

---

## 6. High-Level Architecture

```
Google Maps System Architecture:

  ┌─────────────────────────────────────────────────────────────────┐
  │                          CLIENTS                                │
  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
  │  │ Mobile   │  │ Web      │  │ Embed    │  │ Maps SDK     │   │
  │  │ App      │  │ App      │  │ iFrame   │  │ (3rd party)  │   │
  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘   │
  └───────┼──────────────┼────────────┼────────────────┼───────────┘
          │              │            │                │
          ▼              ▼            ▼                ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │                     CDN (Tile Serving)                          │
  │              Cloudflare / Fastly / Akamai                       │
  │         (serves 99%+ of tile requests from edge)                │
  └────────────────────────────┬────────────────────────────────────┘
                               │ (cache miss only)
          ┌────────────────────┼────────────────────┐
          ▼                    ▼                    ▼
  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐
  │  Tile        │    │  API Gateway │    │  WebSocket       │
  │  Origin      │    │  (REST/gRPC) │    │  Gateway         │
  │  Server      │    │              │    │  (navigation)    │
  └──────────────┘    └──────┬───────┘    └────────┬─────────┘
                             │                     │
          ┌──────────────────┼─────────────────────┤
          │                  │                     │
          ▼                  ▼                     ▼
  ┌──────────────┐  ┌──────────────┐      ┌──────────────┐
  │  Search /    │  │  Routing     │      │  Navigation  │
  │  Geocoding   │  │  Service     │      │  Service     │
  │  Service     │  │              │      │              │
  └──────┬───────┘  └──────┬───────┘      └──────┬───────┘
         │                 │                     │
         ▼                 ▼                     ▼
  ┌──────────────┐  ┌──────────────┐      ┌──────────────┐
  │  Places DB   │  │  Graph Store │      │  Session     │
  │  (Elastic-   │  │  (in-memory  │      │  Store       │
  │   search)    │  │   CH graph)  │      │  (Redis)     │
  └──────────────┘  └──────┬───────┘      └──────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  Traffic     │
                    │  Service     │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
       ┌───────────┐ ┌───────────┐ ┌───────────┐
       │  Traffic   │ │  Traffic  │ │  ETA ML   │
       │  Redis     │ │  Pipeline │ │  Model    │
       │  (live)    │ │  (Kafka + │ │  Service  │
       │            │ │   Flink)  │ │           │
       └───────────┘ └─────┬─────┘ └───────────┘
                           │
                           ▼
                    ┌───────────┐
                    │  GPS Data │
                    │  Ingest   │
                    │  (from    │
                    │  devices) │
                    └───────────┘
```

### 6.1 Service Responsibilities

| Service              | Responsibility                                              |
|----------------------|-------------------------------------------------------------|
| **Tile Service**     | Serve pre-rendered map tiles, generate custom tiles on miss  |
| **Search Service**   | Forward/reverse geocoding, place search, autocomplete        |
| **Routing Service**  | Calculate shortest/fastest paths using CH algorithm          |
| **Navigation Svc**   | Manage active navigation sessions, push reroute updates      |
| **Traffic Service**  | Aggregate GPS data, compute live speeds per road segment     |
| **ETA Service**      | ML-based ETA prediction combining traffic + historical data  |

---

## 7. ETA Prediction

### 7.1 ETA Calculation Methods

```
Method 1: Simple (distance / speed limit)
  ──────────────────────────────────────
  ETA = sum of (segment_distance / segment_speed_limit)

  Problem: Ignores traffic completely. Wildly inaccurate during rush hour.
  Accuracy: ~40% within 10% of actual time

Method 2: Graph Traversal with Live Traffic
  ──────────────────────────────────────────
  ETA = sum of (segment_distance / segment_current_speed)

  Better: Uses real-time traffic data.
  Problem: Assumes traffic is static. A 2-hour drive will encounter
           different traffic at the end than at the start.
  Accuracy: ~70% within 10% of actual time

Method 3: Time-Dependent Graph Traversal
  ──────────────────────────────────────────
  For each segment along the route:
    departure_time = start_time + cumulative_travel_time
    speed = predicted_speed(segment, departure_time)
    segment_time = segment_distance / speed

  Better: Accounts for traffic changing over the journey.
  Accuracy: ~80% within 10% of actual time

Method 4: ML-Based ETA (Google's DeepMind approach)
  ──────────────────────────────────────────────────
  Features:
    - Route geometry (sequence of road segments)
    - Time of day, day of week
    - Current traffic state per segment
    - Historical traffic patterns per segment
    - Weather conditions
    - Special events (sports, concerts, holidays)
    - Road closures / construction
    - Segment-level features (road class, lanes, signals)

  Model architecture:
    - Graph Neural Network (GNN) over road network
    - Transformer/attention over route sequence
    - Outputs: predicted travel time + confidence interval

  Training data:
    - Billions of completed trips with actual travel times
    - Segment-level timestamps from GPS traces

  Accuracy: ~95% within 10% of actual time
```

### 7.2 ETA Confidence Intervals

```
ETA Prediction with Confidence:

  Route: Home → Office (normally 35 min)

  Time: 8:15 AM (peak rush hour)

  Predicted ETA:    42 minutes
  80% confidence:   [38 min, 48 min]
  95% confidence:   [35 min, 55 min]

  Factors increasing uncertainty:
    - Accident-prone corridor (high variance)
    - Construction zone (unpredictable delays)
    - Weather event approaching
    - Special event ending soon (stadium nearby)

  Display to user:
    "Usually 38-48 minutes at this time"
    "Arrive by 9:00 AM"  (uses 80th percentile)
```

---

## 8. Search / Geocoding

### 8.1 Forward Geocoding

```
Forward Geocoding: text → (lat, lng)

  Input:  "Eiffel Tower"
  Output: { lat: 48.8584, lng: 2.2945, type: "landmark" }

  Input:  "1600 Amphitheatre Parkway, Mountain View, CA"
  Output: { lat: 37.4220, lng: -122.0841, type: "address" }

  Pipeline:
    ┌───────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
    │  Query    │────►│  Text    │────►│  Candidate│────►│  Ranking  │
    │  "Eiffel  │     │  Parsing │     │  Generation│    │  & Scoring│
    │   Tower"  │     │  & Norm  │     │  (ES/Lucene│    │  (ML model│
    └───────────┘     └──────────┘     │  + spatial)│    │  + geo    │
                                       └──────────┘     │  context) │
                                                        └──────────┘
  Text Parsing:
    - Normalize: lowercase, remove accents, expand abbreviations
    - Tokenize: "1600 Amphitheatre Pkwy" → [1600, amphitheatre, parkway]
    - Classify: is it an address, place name, or category?

  Candidate Generation:
    - Full-text search in Elasticsearch on place names
    - Address parsing + street-level lookup
    - Fuzzy matching for typos (Levenshtein distance)

  Ranking:
    - Relevance score from text match
    - Proximity to user's current location
    - Popularity/importance of the place
    - User's search history and preferences
```

### 8.2 Reverse Geocoding

```
Reverse Geocoding: (lat, lng) → address/place

  Input:  { lat: 48.8584, lng: 2.2945 }
  Output: "Champ de Mars, 5 Avenue Anatole France, 75007 Paris, France"

  Algorithm:
    1. Find the nearest road segment to the point (spatial index)
    2. Interpolate the address number along the segment
    3. Look up administrative boundaries (city, state, country)
    4. Format according to local conventions

  Spatial Index: R-tree or S2 geometry cells
    - O(log N) lookup for nearest road segment
    - Pre-built index fits in memory
```

### 8.3 Place Search with Autocomplete

```
Autocomplete Architecture:

  User types: "star"

  Client:
    Debounce 100ms → send query

  Server:
    ┌──────────────┐
    │  Trie Index   │  "star" → [starbucks, star pizza, starlight cafe, ...]
    │  (in-memory)  │
    └──────┬───────┘
           │ candidates
           ▼
    ┌──────────────┐
    │  Geo Filter   │  Filter by user's viewport / location
    │  (S2 cells)   │  Remove results > 50km away
    └──────┬───────┘
           │ filtered
           ▼
    ┌──────────────┐
    │  Rank & Score │  Combine: text_relevance * 0.3
    │               │          + popularity * 0.3
    │               │          + proximity * 0.2
    │               │          + personal * 0.2
    └──────┬───────┘
           │ top 5-10
           ▼
    Return to client

  Response time target: < 50ms
  Updated with each keystroke (after debounce)

  Data structures:
    - Trie: for prefix matching on place names
    - Elasticsearch: for fuzzy / typo-tolerant search
    - S2 cell index: for geospatial filtering
    - Redis: for caching popular queries per region
```

---

## 9. Data Model

### 9.1 Core Tables

```sql
-- Map Tiles Metadata (tiles are stored in object storage)
CREATE TABLE map_tiles (
    zoom_level   SMALLINT     NOT NULL,
    tile_x       INT          NOT NULL,
    tile_y       INT          NOT NULL,
    tile_style   VARCHAR(32)  NOT NULL,  -- 'standard', 'satellite', 'terrain'
    tile_format  VARCHAR(8)   NOT NULL,  -- 'pbf' (vector), 'png' (raster)
    storage_url  VARCHAR(256) NOT NULL,
    size_bytes   INT          NOT NULL,
    created_at   TIMESTAMP    NOT NULL,
    updated_at   TIMESTAMP    NOT NULL,
    etag         VARCHAR(64)  NOT NULL,  -- for cache invalidation
    PRIMARY KEY (zoom_level, tile_x, tile_y, tile_style)
);

-- Road Segments (Edges in the graph)
CREATE TABLE road_segments (
    segment_id      BIGINT       PRIMARY KEY,
    source_node_id  BIGINT       NOT NULL REFERENCES intersections(node_id),
    target_node_id  BIGINT       NOT NULL REFERENCES intersections(node_id),
    road_name       VARCHAR(256),
    road_class      SMALLINT     NOT NULL,  -- 0=motorway, ..., 7=path
    distance_m      INT          NOT NULL,
    speed_limit_kph SMALLINT     NOT NULL,
    base_travel_sec INT          NOT NULL,
    num_lanes       SMALLINT,
    is_oneway       BOOLEAN      NOT NULL DEFAULT FALSE,
    is_toll         BOOLEAN      NOT NULL DEFAULT FALSE,
    is_tunnel       BOOLEAN      NOT NULL DEFAULT FALSE,
    is_bridge       BOOLEAN      NOT NULL DEFAULT FALSE,
    surface_type    VARCHAR(32),            -- 'paved', 'gravel', etc.
    geometry        GEOMETRY(LINESTRING, 4326) NOT NULL,  -- road shape
    country_code    CHAR(2)      NOT NULL,
    updated_at      TIMESTAMP    NOT NULL
);
CREATE INDEX idx_segments_source ON road_segments(source_node_id);
CREATE INDEX idx_segments_target ON road_segments(target_node_id);
CREATE INDEX idx_segments_geo ON road_segments USING GIST(geometry);

-- Intersections (Nodes in the graph)
CREATE TABLE intersections (
    node_id       BIGINT       PRIMARY KEY,
    latitude      DOUBLE PRECISION NOT NULL,
    longitude     DOUBLE PRECISION NOT NULL,
    elevation_m   REAL,
    node_type     SMALLINT     NOT NULL,   -- 0=simple, 1=signal, 2=stop_sign
    country_code  CHAR(2)      NOT NULL,
    updated_at    TIMESTAMP    NOT NULL
);
CREATE INDEX idx_nodes_geo ON intersections
    USING GIST(ST_SetSRID(ST_MakePoint(longitude, latitude), 4326));

-- Places / Points of Interest
CREATE TABLE places (
    place_id       BIGINT       PRIMARY KEY,
    name           VARCHAR(512) NOT NULL,
    category       VARCHAR(128) NOT NULL,   -- 'restaurant', 'gas_station', etc.
    latitude       DOUBLE PRECISION NOT NULL,
    longitude      DOUBLE PRECISION NOT NULL,
    address        JSONB,                   -- structured address components
    phone          VARCHAR(32),
    website        VARCHAR(512),
    rating         REAL,
    review_count   INT          DEFAULT 0,
    hours          JSONB,                   -- opening hours per day
    price_level    SMALLINT,                -- 1-4 ($-$$$$)
    photos         TEXT[],                  -- URLs to photo storage
    country_code   CHAR(2)      NOT NULL,
    created_at     TIMESTAMP    NOT NULL,
    updated_at     TIMESTAMP    NOT NULL
);
CREATE INDEX idx_places_geo ON places
    USING GIST(ST_SetSRID(ST_MakePoint(longitude, latitude), 4326));
CREATE INDEX idx_places_name ON places USING GIN(to_tsvector('english', name));
CREATE INDEX idx_places_category ON places(category);

-- Traffic Snapshots (current state per road segment)
CREATE TABLE traffic_snapshots (
    segment_id      BIGINT       NOT NULL,
    timestamp       TIMESTAMP    NOT NULL,
    current_speed   SMALLINT     NOT NULL,  -- km/h
    free_flow_speed SMALLINT     NOT NULL,  -- km/h
    confidence      REAL         NOT NULL,  -- 0.0 - 1.0
    traffic_level   SMALLINT     NOT NULL,  -- 0=free, 1=mod, 2=slow, 3=jam
    sample_count    INT          NOT NULL,  -- GPS samples in window
    PRIMARY KEY (segment_id, timestamp)
);
-- Partitioned by time for efficient cleanup
-- Only latest snapshot matters for routing; historical for ML training

-- User Location History (anonymized, for traffic + ML)
CREATE TABLE user_location_pings (
    ping_id         BIGINT       PRIMARY KEY,
    anonymous_id    BIGINT       NOT NULL,  -- hashed, rotating ID
    latitude        DOUBLE PRECISION NOT NULL,
    longitude       DOUBLE PRECISION NOT NULL,
    speed_mps       REAL,                   -- meters per second
    heading         REAL,                   -- degrees 0-360
    accuracy_m      REAL,                   -- GPS accuracy
    timestamp       TIMESTAMP    NOT NULL,
    matched_segment BIGINT       REFERENCES road_segments(segment_id)
);
-- Stored in time-series DB (e.g., TimescaleDB) or streaming (Kafka → HDFS)
-- Retention: raw data 30 days, aggregated indefinitely
```

---

## 10. Navigation Flow

### 10.1 End-to-End Navigation Sequence

```
Real-Time Navigation Flow:

  ┌──────────┐                    ┌──────────────┐         ┌──────────────┐
  │  Client  │                    │  API Gateway │         │  Services    │
  │  (Phone) │                    │              │         │              │
  └────┬─────┘                    └──────┬───────┘         └──────┬───────┘
       │                                 │                        │
       │  1. POST /route                 │                        │
       │    {origin, destination,        │                        │
       │     mode: "driving"}            │                        │
       │ ───────────────────────────────►│                        │
       │                                 │  2. Calculate route    │
       │                                 │ ──────────────────────►│
       │                                 │    (Routing Service    │
       │                                 │     + Traffic Service) │
       │                                 │                        │
       │                                 │  3. Route response     │
       │  4. Route with polyline,        │◄────────────────────── │
       │     steps, ETA, distance        │                        │
       │◄─────────────────────────────── │                        │
       │                                 │                        │
       │  5. User taps "Start Navigation"│                        │
       │                                 │                        │
       │  6. WS connect /navigate        │                        │
       │    {route_id, session_id}       │                        │
       │ ═══════════════════════════════►│  7. Create nav session │
       │    (WebSocket upgrade)          │ ──────────────────────►│
       │                                 │    (Navigation Svc)    │
       │                                 │                        │
       │  ┌────── Navigation Loop ──────┐│                        │
       │  │                             ││                        │
       │  │ 8. GPS update (every 1-3s)  ││                        │
       │  │   {lat, lng, speed, heading}││                        │
       │  │ ════════════════════════════►│  9. Process position   │
       │  │                             ││ ──────────────────────►│
       │  │                             ││    - Map match         │
       │  │                             ││    - Progress tracking │
       │  │                             ││    - Off-route check   │
       │  │                             ││    - Next instruction  │
       │  │                             ││                        │
       │  │ 10. Navigation update       ││  (if on route)        │
       │  │   {next_turn, distance,     ││◄────────────────────── │
       │  │    updated_eta}             ││                        │
       │  │◄════════════════════════════ │                        │
       │  │                             ││                        │
       │  │ 11. (if off-route or        ││                        │
       │  │     traffic reroute)        ││  12. Recalculate      │
       │  │                             ││ ──────────────────────►│
       │  │ 13. REROUTE push            ││                        │
       │  │   {new_route, reason}       ││◄────────────────────── │
       │  │◄════════════════════════════ │                        │
       │  │                             ││                        │
       │  └─────────────────────────────┘│                        │
       │                                 │                        │
       │  14. Arrive at destination      │                        │
       │  15. WS close                   │                        │
       │ ═══════════════════════════════►│  16. End session       │
       │                                 │ ──────────────────────►│
       │                                 │                        │
```

### 10.2 Turn-by-Turn Instruction Generation

```
Generating Turn-by-Turn Directions:

  Route: sequence of road segments [S1, S2, S3, ..., Sn]

  For each junction between consecutive segments:

  1. Calculate the bearing change:
     bearing_before = bearing(S_i.last_point, S_i.end_point)
     bearing_after  = bearing(S_{i+1}.start_point, S_{i+1}.second_point)
     angle = normalize(bearing_after - bearing_before)

  2. Classify the maneuver:
     ┌──────────────────────────────────────────────┐
     │ Angle Range        │ Maneuver                │
     ├──────────────────────────────────────────────┤
     │ -15° to 15°        │ Continue straight        │
     │ 15° to 60°         │ Slight right             │
     │ 60° to 120°        │ Turn right               │
     │ 120° to 170°       │ Sharp right              │
     │ 170° to 180°       │ U-turn                   │
     │ -60° to -15°       │ Slight left              │
     │ -120° to -60°      │ Turn left                │
     │ -170° to -120°     │ Sharp left               │
     └──────────────────────────────────────────────┘

  3. Add context:
     - Road name: "Turn right onto Main Street"
     - Distance: "In 200 meters, turn right"
     - Landmarks: "Turn right after the gas station"
     - Lane guidance: "Use the right two lanes"
     - Highway: "Take exit 42 for Route 101 North"

  4. Voice instruction timing:
     - Advance warning: ~1 km before (highway) or 300m before (city)
     - Preparation: ~500m / 150m before
     - Instruction: ~200m / 50m before
     - Confirmation: "Continue for 3.2 km"
```

### 10.3 Off-Route Detection

```
Off-Route Detection Algorithm:

  For each GPS update:

  1. Project GPS point onto route polyline
     → Find nearest point on route

  2. Calculate perpendicular distance to route
     → If distance > 50m:
        confidence_off_route += 1

  3. Check heading alignment
     → If heading differs from route bearing by > 45°:
        confidence_off_route += 1

  4. Trigger reroute when:
     → confidence_off_route >= 3 consecutive updates
     OR
     → single update with distance > 200m from route

  Reroute decision:
    ┌───────────────────────────────────────────────┐
    │  GPS position ──────── 85m from route         │
    │  Heading ───────────── 90° off route bearing  │
    │  Consecutive misses ── 3                      │
    │                                               │
    │  Decision: REROUTE                            │
    │  Action: Recalculate from current position    │
    │          to original destination              │
    │  Push: New route via WebSocket                │
    └───────────────────────────────────────────────┘
```

---

## 11. Offline Maps

### 11.1 Downloadable Region Architecture

```
Offline Map Download:

  ┌──────────────────────────────────────────────────────┐
  │  Region Selection                                     │
  │                                                      │
  │  User selects: "San Francisco Bay Area"              │
  │                                                      │
  │  Download package contains:                          │
  │  ┌─────────────────────────────────────────────┐    │
  │  │  1. Vector tiles (zoom 0-17)     ~150 MB    │    │
  │  │  2. Road graph (region subgraph) ~80 MB     │    │
  │  │  3. CH overlay (shortcuts)       ~40 MB     │    │
  │  │  4. Place/POI data               ~30 MB     │    │
  │  │  5. Address data (geocoding)     ~50 MB     │    │
  │  │  6. Search index                 ~20 MB     │    │
  │  │                                             │    │
  │  │  Total: ~370 MB for metro area              │    │
  │  └─────────────────────────────────────────────┘    │
  │                                                      │
  │  For comparison:                                     │
  │    - California:        ~1.5 GB                      │
  │    - United States:     ~8 GB                        │
  │    - Western Europe:    ~6 GB                        │
  │    - Entire world:      ~100 GB (vector tiles only)  │
  └──────────────────────────────────────────────────────┘
```

### 11.2 On-Device Routing

```
On-Device Routing Pipeline:

  ┌──────────┐    ┌────────────┐    ┌────────────┐    ┌──────────┐
  │  User    │───►│  On-device │───►│  On-device │───►│  Turn-by │
  │  Input   │    │  Geocoding │    │  CH Router │    │  -turn   │
  │  "Home   │    │  (local    │    │  (local    │    │  (local  │
  │  to Work"│    │   index)   │    │   graph)   │    │  engine) │
  └──────────┘    └────────────┘    └────────────┘    └──────────┘

  Capabilities while offline:
    + Map viewing (cached/downloaded tiles)
    + Place search (downloaded POI index)
    + Route calculation (downloaded CH graph)
    + Turn-by-turn navigation
    + GPS tracking on map

  Limitations while offline:
    - No live traffic data
    - No rerouting based on incidents
    - ETAs based on speed limits only
    - No satellite imagery (too large)
    - Stale business hours / info
```

### 11.3 Selective Sync Strategy

```
Smart Offline Download:

  Priority 1: Frequently visited areas
    - Home and work locations (auto-detected)
    - Frequently traveled routes
    - Download automatically on Wi-Fi

  Priority 2: Upcoming trips
    - If user has calendar events with locations
    - Downloaded overnight before travel day

  Priority 3: User-selected regions
    - Explicit region download for travel

  Update strategy:
    - Differential updates (only changed tiles/segments)
    - Weekly update for frequently used regions
    - Monthly for others
    - Notify user of stale data (> 3 months)

  Storage management:
    - LRU eviction of unused offline regions
    - User-selected regions are pinned
    - Configurable storage limit (default: 2 GB)
```

---

## 12. Scaling

### 12.1 Tile Serving at Scale

```
Tile Serving Scale:

  Peak tile QPS:          ~3,000,000 QPS
  CDN cache hit rate:     99.5%+
  Origin QPS:             ~15,000 QPS (0.5% cache miss)

  CDN Architecture:
    ┌─────────────────────────────────────────────────────┐
    │  200+ PoPs (Points of Presence) worldwide           │
    │                                                     │
    │  Each PoP:                                          │
    │    - 50-100 edge servers                            │
    │    - 10-50 TB SSD cache                             │
    │    - Handles 10K-50K tile req/sec per PoP           │
    │                                                     │
    │  Popular tiles (zoom 0-12) cached at ALL PoPs       │
    │  Regional tiles (zoom 13-17) cached at nearby PoPs  │
    │  Street-level tiles (zoom 18-20) cached on demand   │
    └─────────────────────────────────────────────────────┘

  Storage:
    - Object storage (S3/GCS): all pre-rendered tiles
    - SSD on edge: hot tiles (~50 TB per PoP)
    - In-memory (CDN): hottest tiles (~1 TB per PoP)
```

### 12.2 Routing Service Scaling

```
Routing Service Scaling:

  Peak route QPS:         ~60,000 QPS
  Average query time:     ~5 ms (CH query + traffic lookup + path unpacking)
  Queries per core:       ~200/sec (CPU-bound)
  Cores needed:           60,000 / 200 = 300 cores minimum
  With 3x headroom:       ~900 cores = ~30 machines (32 cores each)

  Architecture:
    ┌──────────────────────────────────────────────────┐
    │  Routing Service Fleet                            │
    │                                                  │
    │  Region: US                                      │
    │  ┌──────┐ ┌──────┐ ┌──────┐      ┌──────┐     │
    │  │ RS-1 │ │ RS-2 │ │ RS-3 │ ...  │ RS-N │     │
    │  │      │ │      │ │      │      │      │     │
    │  │ CH   │ │ CH   │ │ CH   │      │ CH   │     │
    │  │graph │ │graph │ │graph │      │graph │     │
    │  │(RAM) │ │(RAM) │ │(RAM) │      │(RAM) │     │
    │  └──────┘ └──────┘ └──────┘      └──────┘     │
    │                                                  │
    │  Each instance:                                  │
    │    - 256 GB RAM (full US graph + CH in memory)   │
    │    - 32 cores                                    │
    │    - Stateless (any instance handles any query)  │
    │    - Graph loaded at startup from shared storage │
    │                                                  │
    │  Graph updates:                                  │
    │    - Traffic weight refresh: every 60 seconds    │
    │    - Road network update: weekly rolling deploy  │
    └──────────────────────────────────────────────────┘

  Cross-region routing (e.g., NYC to London):
    Handled by overlay graph connecting region borders.
    Most queries are intra-region (99%+).
```

### 12.3 Traffic Pipeline Scaling

```
Traffic Data Pipeline at Scale:

  Input rate:      ~50M GPS pings/second (peak)
  Data per ping:   ~64 bytes (lat, lng, speed, heading, timestamp, device_id)
  Ingress:         ~3.2 GB/sec = ~11.5 TB/hour

  ┌──────────────────────────────────────────────────────┐
  │  Kafka Cluster                                        │
  │                                                      │
  │  Topics:                                             │
  │    raw-gps-pings:    1024 partitions                 │
  │    map-matched:      256 partitions (by geo region)  │
  │    segment-speeds:   128 partitions                  │
  │                                                      │
  │  Brokers: 50-100 (handling 50M msg/sec)              │
  │  Retention: raw = 2 hours, processed = 24 hours      │
  │  Replication factor: 3                               │
  └──────────────────────────────────────────────────────┘

  Processing (Apache Flink):
    ┌──────────────────────────────────────────────────┐
    │  Stage 1: Map Matching (heaviest)                │
    │    - 200+ parallel instances                     │
    │    - Snap GPS points to road segments            │
    │    - Output: (segment_id, speed, timestamp)      │
    │                                                  │
    │  Stage 2: Aggregation (1-minute tumbling window) │
    │    - Per segment: mean speed, sample count       │
    │    - Confidence scoring                          │
    │    - Output: traffic snapshot per segment        │
    │                                                  │
    │  Stage 3: Classification + Publishing            │
    │    - Free flow / slow / congested labels         │
    │    - Publish to Redis (for routing service)      │
    │    - Publish to tile renderer (for traffic map)  │
    │    - Archive to HDFS (for ML training)           │
    └──────────────────────────────────────────────────┘

  Redis (Live Traffic Store):
    - Cluster: 20-30 nodes
    - Total memory: ~200 GB
    - Keys: ~200M (one per road segment with traffic data)
    - Value: {speed, free_flow_speed, confidence, level, timestamp}
    - TTL: 5 minutes (stale data auto-expires)
    - Read QPS: ~500K (from routing service instances)
    - Write QPS: ~3M (from Flink output)
```

---

## 13. Deployment Architecture

```
Global Deployment:

  ┌─────────────────────────────────────────────────────────────────┐
  │                      GLOBAL LAYER                               │
  │                                                                 │
  │  ┌───────────────────────────────────────────────────────────┐ │
  │  │  Global CDN (200+ PoPs)                                   │ │
  │  │  - Map tiles (vector + raster)                            │ │
  │  │  - Static assets                                          │ │
  │  │  - API edge caching (popular routes)                      │ │
  │  └───────────────────────────────────────────────────────────┘ │
  │                                                                 │
  │  ┌───────────────────────────────────────────────────────────┐ │
  │  │  Global DNS (GeoDNS)                                      │ │
  │  │  - Route users to nearest regional cluster                │ │
  │  └───────────────────────────────────────────────────────────┘ │
  └─────────────────────────────────────────────────────────────────┘

  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
  │  REGION: US-EAST │  │  REGION: EU-WEST │  │  REGION: APAC   │
  │                  │  │                  │  │                  │
  │  ┌────────────┐ │  │  ┌────────────┐ │  │  ┌────────────┐ │
  │  │ API Gateway│ │  │  │ API Gateway│ │  │  │ API Gateway│ │
  │  └─────┬──────┘ │  │  └─────┬──────┘ │  │  └─────┬──────┘ │
  │        │        │  │        │        │  │        │        │
  │  ┌─────┴──────┐ │  │  ┌─────┴──────┐ │  │  ┌─────┴──────┐ │
  │  │ Routing    │ │  │  │ Routing    │ │  │  │ Routing    │ │
  │  │ (US graph) │ │  │  │ (EU graph) │ │  │  │ (APAC graph│ │
  │  │ 30 nodes   │ │  │  │ 25 nodes   │ │  │  │) 35 nodes  │ │
  │  └────────────┘ │  │  └────────────┘ │  │  └────────────┘ │
  │                  │  │                  │  │                  │
  │  ┌────────────┐ │  │  ┌────────────┐ │  │  ┌────────────┐ │
  │  │ Traffic    │ │  │  │ Traffic    │ │  │  │ Traffic    │ │
  │  │ Pipeline   │ │  │  │ Pipeline   │ │  │  │ Pipeline   │ │
  │  │ Kafka+Flink│ │  │  │ Kafka+Flink│ │  │  │ Kafka+Flink│ │
  │  └────────────┘ │  │  └────────────┘ │  │  └────────────┘ │
  │                  │  │                  │  │                  │
  │  ┌────────────┐ │  │  ┌────────────┐ │  │  ┌────────────┐ │
  │  │ Search     │ │  │  │ Search     │ │  │  │ Search     │ │
  │  │ (ES cluster│ │  │  │ (ES cluster│ │  │  │ (ES cluster│ │
  │  │) US places │ │  │  │) EU places │ │  │  │) APAC places│ │
  │  └────────────┘ │  │  └────────────┘ │  │  └────────────┘ │
  │                  │  │                  │  │                  │
  │  ┌────────────┐ │  │  ┌────────────┐ │  │  ┌────────────┐ │
  │  │ Navigation │ │  │  │ Navigation │ │  │  │ Navigation │ │
  │  │ (WebSocket)│ │  │  │ (WebSocket)│ │  │  │ (WebSocket)│ │
  │  │ 50 nodes   │ │  │  │ 40 nodes   │ │  │  │ 60 nodes   │ │
  │  └────────────┘ │  │  └────────────┘ │  │  └────────────┘ │
  │                  │  │                  │  │                  │
  │  ┌────────────┐ │  │  ┌────────────┐ │  │  ┌────────────┐ │
  │  │ Tile Origin│ │  │  │ Tile Origin│ │  │  │ Tile Origin│ │
  │  │ (S3 / GCS)│ │  │  │ (S3 / GCS)│ │  │  │ (S3 / GCS)│ │
  │  └────────────┘ │  │  └────────────┘ │  │  └────────────┘ │
  └─────────────────┘  └─────────────────┘  └─────────────────┘

  Cross-Region Overlay:
    ┌──────────────────────────────────────────────────┐
    │  Inter-region routing overlay graph               │
    │  Handles cross-region routes (e.g., driving       │
    │  from France to Germany)                          │
    │  Small graph: ~10K nodes at region boundaries     │
    │  Replicated to all regions                        │
    └──────────────────────────────────────────────────┘
```

### 13.1 Failure Handling

```
Failure Scenarios and Mitigation:

  ┌─────────────────────────────────────────────────────────┐
  │ Failure                │ Mitigation                     │
  ├─────────────────────────────────────────────────────────┤
  │ CDN PoP down           │ DNS failover to next PoP       │
  │ Routing node crash     │ Load balancer routes around     │
  │ Traffic pipeline lag   │ Fall back to historical data    │
  │ WebSocket disconnect   │ Client auto-reconnect + resync │
  │ Graph store corrupted  │ Reload from versioned snapshot  │
  │ Region outage          │ Route to nearest healthy region │
  │ GPS signal lost        │ Dead reckoning from last known  │
  │ Search index stale     │ Serve cached results + banner   │
  └─────────────────────────────────────────────────────────┘
```

---

## 14. Common Interview Follow-ups

### 14.1 Multi-Modal Routing (Driving + Transit)

```
Multi-Modal Routing:

  Problem: "Drive to the train station, take a train to the city,
           then walk to the destination."

  Approach:
    1. Build a combined graph:
       - Driving edges (road network)
       - Transit edges (rail/bus with schedules)
       - Walking edges (pedestrian network)
       - Transfer edges (parking lot → station, station → street)

    2. Time-expanded graph:
       - Transit is time-dependent (trains run on schedules)
       - Each transit stop has nodes for each departure time
       - Edge weight = wait_time + travel_time

    3. Multi-criteria optimization:
       - Minimize total time
       - Minimize number of transfers
       - Minimize walking distance
       - Pareto-optimal set of routes

  Example result:
    Option A: Drive 15 min → BART 22 min → Walk 8 min = 45 min total
    Option B: Drive 5 min  → Bus 35 min  → Walk 3 min = 43 min total
    Option C: Drive entire way = 55 min (with traffic)
```

### 14.2 "Avoid Tolls" / "Avoid Highways"

```
Route Preferences:

  Implementation: Modify edge weights based on preferences.

  For "avoid tolls":
    weight(e) = original_weight(e) + (LARGE_PENALTY if e.is_toll)
    // Penalty = 30 minutes equivalent (makes tolls unattractive
    // but still usable if no alternative exists)

  For "avoid highways":
    weight(e) = original_weight(e) + (LARGE_PENALTY if e.road_class <= 1)

  For "shortest distance" (vs "fastest time"):
    weight(e) = e.distance_meters   // instead of travel time

  CH implications:
    - Each preference combination needs a separate CH preprocessing
    - Common: precompute CH for top ~8 preference combinations
    - Rare combos: fall back to A* or ALT algorithm
```

### 14.3 Multi-Waypoint Routing

```
Multi-Stop Route Optimization:

  Problem: Visit locations A, B, C, D in optimal order.

  If order is fixed (A → B → C → D):
    Simply concatenate individual routes.
    Total time = route(A,B) + route(B,C) + route(C,D)

  If order is flexible (Traveling Salesman Problem):
    - For N <= 10 stops: exact solution via dynamic programming
      O(N^2 * 2^N) -- feasible for small N
    - For N = 10-25: approximation algorithms
      - Nearest neighbor heuristic
      - 2-opt / 3-opt local search
      - Christofides algorithm (1.5x optimal guarantee)
    - For N > 25: use OR-Tools or similar solver

  Route matrix optimization:
    1. Compute all-pairs shortest paths between waypoints
       (N*(N-1)/2 CH queries -- very fast)
    2. Solve TSP on the small distance matrix
    3. Return the optimal ordering with individual routes
```

### 14.4 Map Data Updates

```
Handling Map Changes (New Roads, Closures):

  Data update pipeline:
    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
    │  Data Sources │───►│  Validation  │───►│  Graph       │
    │  - Satellite  │    │  & Conflation│    │  Update      │
    │  - Street View│    │  Pipeline    │    │  Service     │
    │  - User edits │    │              │    │              │
    │  - Government │    │  (verify new │    │  (add/remove │
    │    records    │    │   roads are  │    │   edges and  │
    └──────────────┘    │   real)      │    │   nodes)     │
                        └──────────────┘    └──────┬───────┘
                                                   │
                                        ┌──────────┼──────────┐
                                        ▼          ▼          ▼
                                   ┌─────────┐ ┌─────────┐ ┌─────────┐
                                   │ Rebuild  │ │ Update  │ │ Update  │
                                   │ CH       │ │ Tiles   │ │ Search  │
                                   │ (weekly) │ │ (daily) │ │ Index   │
                                   └─────────┘ └─────────┘ └─────────┘

  For urgent changes (road closures):
    - Mark edge as closed in traffic layer (weight = INF)
    - Takes effect in ~1 minute (no CH rebuild needed)
    - CH rebuild happens weekly in the background

  For new roads:
    - Add to graph, rebuild CH for affected region
    - Regional CH rebuild: ~2 minutes (not full global rebuild)
    - Blue-green deployment: old CH serves queries while new CH builds
```

### 14.5 Live Location Sharing

```
Live Location Sharing ("Share your ETA"):

  ┌──────────┐        ┌──────────────┐        ┌──────────┐
  │  Sharer  │        │  Location    │        │  Viewer  │
  │  (driver)│        │  Sharing Svc │        │  (friend)│
  └────┬─────┘        └──────┬───────┘        └────┬─────┘
       │                     │                     │
       │  1. Share trip       │                     │
       │  {trip_id, viewers} │                     │
       │ ───────────────────►│                     │
       │                     │  2. Generate share link
       │                     │  3. Notify viewers  │
       │                     │ ───────────────────►│
       │                     │                     │
       │  4. GPS updates     │                     │
       │  (from nav session) │                     │
       │ ───────────────────►│  5. Forward position│
       │                     │  + ETA updates      │
       │                     │ ───────────────────►│
       │                     │                     │
       │                     │  (repeat every 3-5s)│
       │                     │                     │

  Privacy considerations:
    - Time-limited sharing (auto-expires)
    - Location fuzzed to ~100m for non-close contacts
    - Share link has one-time token (not guessable)
    - Sharer can revoke access instantly
    - No location history stored for viewers
```

### 14.6 Popular Route Caching

```
Route Caching Strategy:

  Observation: Many route queries are repeated.
    - "Home to work" patterns
    - Airport to city center
    - Tourist routes

  Cache key: (origin_cell, dest_cell, mode, preferences, time_bucket)
    - origin_cell: S2 cell at level 14 (~150m x 150m)
    - dest_cell:   S2 cell at level 14
    - time_bucket: 15-minute window (traffic varies)

  Cache hierarchy:
    1. Exact route cache (Redis, TTL = 5 min)
       - Same origin/dest cells, same time bucket
       - Cache hit rate: ~15-25%

    2. Route corridor cache (Redis, TTL = 15 min)
       - Cache the "corridor" of road segments for popular OD pairs
       - Re-weight with current traffic (fast: ~1ms)
       - Cache hit rate: ~40-50%

    3. No cache: full CH query (~5ms)

  Estimated savings:
    At 60K QPS, with 40% corridor cache hit:
    - 24K QPS use cached corridors (1ms each)
    - 36K QPS need full CH query (5ms each)
    - Effective average: ~3.4ms (vs 5ms without caching)
    - 32% reduction in routing compute
```

---

## 15. Cost Analysis

```
Estimated Monthly Infrastructure Cost (order of magnitude):

  ┌───────────────────────────────────────────────────────────┐
  │ Component                │ Specs              │ Cost/mo   │
  ├───────────────────────────────────────────────────────────┤
  │ CDN (tile serving)       │ ~3M QPS peak       │ $500K     │
  │                          │ 5+ PB egress/mo    │           │
  ├───────────────────────────────────────────────────────────┤
  │ Tile storage (S3/GCS)    │ ~5 PB              │ $100K     │
  ├───────────────────────────────────────────────────────────┤
  │ Routing fleet            │ ~100 x 256GB RAM   │ $200K     │
  │                          │ (global)           │           │
  ├───────────────────────────────────────────────────────────┤
  │ Traffic pipeline         │ Kafka (100 brokers)│ $300K     │
  │ (Kafka + Flink)          │ Flink (500 cores)  │           │
  ├───────────────────────────────────────────────────────────┤
  │ Redis (traffic state)    │ ~200 GB cluster    │ $50K      │
  ├───────────────────────────────────────────────────────────┤
  │ Search (Elasticsearch)   │ ~50 nodes global   │ $150K     │
  ├───────────────────────────────────────────────────────────┤
  │ Navigation (WebSocket)   │ ~150 nodes global  │ $100K     │
  ├───────────────────────────────────────────────────────────┤
  │ GPS ingest gateway       │ ~50M msg/sec       │ $100K     │
  ├───────────────────────────────────────────────────────────┤
  │ ML/ETA model serving     │ GPU fleet          │ $200K     │
  ├───────────────────────────────────────────────────────────┤
  │ HDFS / data lake         │ ~100 PB (history)  │ $300K     │
  ├───────────────────────────────────────────────────────────┤
  │ TOTAL (rough estimate)   │                    │ ~$2M/mo   │
  └───────────────────────────────────────────────────────────┘

  Note: Google operates its own infrastructure, so actual costs
  are significantly lower than cloud pricing. This estimate uses
  cloud-equivalent pricing for reference.
```

---

## 16. Summary Cheat Sheet

```
┌─────────────────────────────────────────────────────────────────┐
│                  GOOGLE MAPS DESIGN SUMMARY                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Map Tiles:    Tile pyramid (zoom 0-20), vector tiles,          │
│                CDN-first architecture (99.5%+ cache hit)         │
│                                                                  │
│  Road Graph:   ~500M nodes, ~1B edges, weighted directed graph  │
│                Fits in RAM (~250 GB with CH overlay)             │
│                                                                  │
│  Routing:      Contraction Hierarchies (CH) for 1000x speedup  │
│                ~0.3ms per query vs ~5s for Dijkstra             │
│                Bidirectional search on hierarchical graph        │
│                                                                  │
│  Traffic:      GPS traces from 500M+ devices                    │
│                Kafka → Flink → Redis (60-second refresh)        │
│                Map matching (HMM) to snap GPS to roads          │
│                                                                  │
│  ETA:          ML model (GNN + Transformer)                     │
│                Time-dependent routing for long trips             │
│                Confidence intervals for reliability              │
│                                                                  │
│  Navigation:   WebSocket for real-time push updates             │
│                Off-route detection + automatic rerouting         │
│                Turn-by-turn from bearing angle analysis          │
│                                                                  │
│  Search:       Elasticsearch + Trie (autocomplete)              │
│                Forward/reverse geocoding                         │
│                Geospatial filtering with S2 cells               │
│                                                                  │
│  Offline:      Downloadable regions (~370 MB per metro)         │
│                On-device CH routing without network              │
│                                                                  │
│  Scale:        Regional graph partitioning                      │
│                Stateless routing service (horizontal scaling)    │
│                CDN for tile serving (petabyte scale)             │
│                                                                  │
│  Key Insight:  Contraction Hierarchies are THE algorithm        │
│                that makes real-time routing possible at scale.   │
│                Everything else (traffic, ETA, navigation) is    │
│                built on top of this fast routing primitive.      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```
