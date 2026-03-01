# Design a Proximity Service (Yelp / Nearby Search)

A proximity service powers the "find nearby" feature in applications like Yelp, Google Maps,
Uber, and DoorDash. Given a user's location and a search radius, it returns businesses or
points of interest (POIs) sorted by distance, relevance, or rating.

This guide covers geospatial indexing algorithms in depth, system architecture, caching,
scaling, and common interview follow-ups.

---

## 1. Requirements Clarification

### 1.1 Functional Requirements

| Requirement            | Description                                                |
|------------------------|------------------------------------------------------------|
| **Nearby search**      | Search businesses by location (lat/lng) + radius           |
| **Business details**   | View detailed info (name, address, hours, photos, reviews) |
| **Business CRUD**      | Owners can add, update, delete business listings           |
| **Filtering**          | Filter by category (restaurant, gas station, hotel, etc.)  |
| **Sorting**            | Sort by distance, rating, popularity, or relevance         |
| **Autocomplete**       | Suggest businesses as user types (out of scope here)       |

### 1.2 Non-Functional Requirements

| Requirement               | Target                                               |
|---------------------------|------------------------------------------------------|
| **Latency**               | < 200ms for search (p99)                             |
| **Availability**          | 99.99% uptime                                        |
| **Consistency**           | Eventual consistency for business updates is OK       |
| **Scalability**           | Handle billions of queries per day                   |
| **Accuracy**              | Accurate distance calculation within search radius   |

### 1.3 Scale Estimation

```
Total businesses:           200,000,000 (200M)
Daily active users (DAU):   500,000,000 (500M)
Searches per user per day:  5
Total search QPS:           500M * 5 / 86,400 ~ 29,000 QPS
Peak QPS (3x average):     ~87,000 QPS

Business data size:
  - Average record size:    ~1 KB (name, lat, lng, category, metadata)
  - Total business data:    200M * 1 KB = 200 GB

Geospatial index size:
  - Per entry (id + geohash): ~50 bytes
  - Total index:             200M * 50 B = 10 GB (fits in memory!)

Read:Write ratio:           ~1000:1 (read-heavy)
Business updates per day:   ~100,000 (new + edits)
```

### 1.4 Key Observations

1. The system is **overwhelmingly read-heavy** -- optimize for search.
2. The geospatial index (~10 GB) **fits in memory** on a single machine.
3. Business data changes infrequently -- strong candidate for caching.
4. Location data has inherent **spatial locality** (users search nearby areas).

---

## 2. API Design

### 2.1 Search Nearby Businesses

```
GET /v1/search/nearby
```

**Query Parameters:**

| Parameter    | Type   | Required | Description                           |
|-------------|--------|----------|---------------------------------------|
| `lat`       | float  | Yes      | Latitude of the search center         |
| `lng`       | float  | Yes      | Longitude of the search center        |
| `radius`    | int    | No       | Search radius in meters (default 5000)|
| `category`  | string | No       | Business category filter              |
| `sort_by`   | string | No       | distance, rating, popularity          |
| `page`      | int    | No       | Page number (default 1)               |
| `page_size` | int    | No       | Results per page (default 20, max 50) |

**Response:**

```json
{
  "success": true,
  "data": {
    "businesses": [
      {
        "id": "biz_abc123",
        "name": "Joe's Pizza",
        "lat": 40.7580,
        "lng": -73.9855,
        "distance_meters": 234,
        "category": "restaurant",
        "rating": 4.5,
        "review_count": 1203,
        "price_level": 2,
        "is_open": true,
        "thumbnail_url": "https://cdn.example.com/biz_abc123/thumb.jpg"
      }
    ],
    "total": 145
  },
  "meta": {
    "page": 1,
    "page_size": 20,
    "total": 145,
    "has_next": true
  }
}
```

### 2.2 Get Business Details

```
GET /v1/businesses/{business_id}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "biz_abc123",
    "name": "Joe's Pizza",
    "lat": 40.7580,
    "lng": -73.9855,
    "address": "123 Broadway, New York, NY 10001",
    "phone": "+1-212-555-0123",
    "category": "restaurant",
    "subcategories": ["pizza", "italian"],
    "rating": 4.5,
    "review_count": 1203,
    "price_level": 2,
    "hours": {
      "monday": { "open": "10:00", "close": "23:00" },
      "tuesday": { "open": "10:00", "close": "23:00" }
    },
    "photos": ["url1", "url2"],
    "attributes": { "outdoor_seating": true, "delivery": true }
  }
}
```

### 2.3 Business CRUD

```
POST   /v1/businesses              -- Create a new business
PUT    /v1/businesses/{id}         -- Update business info
DELETE /v1/businesses/{id}         -- Delete a business
GET    /v1/businesses/{id}/reviews -- Get reviews for a business
POST   /v1/businesses/{id}/reviews -- Add a review
```

---

## 3. Geospatial Indexing Algorithms (Deep Dive)

The core challenge is: **Given a point (lat, lng) and radius r, find all businesses
within distance r.** A naive approach scanning all 200M businesses is O(n) per query
and far too slow. We need a spatial index.

### 3.1 Geohash

#### How Geohash Works

Geohash encodes a 2D coordinate (latitude, longitude) into a 1D string by recursively
bisecting the coordinate space and interleaving the bits.

**Step-by-step encoding of (37.7749, -122.4194):**

```
Longitude range: [-180, 180]
Latitude range:  [-90, 90]

Step 1 (longitude): -122.4194 in [-180, 0]?  Yes -> bit 0
Step 2 (latitude):   37.7749  in [0, 90]?    Yes -> bit 1
Step 3 (longitude): -122.4194 in [-180, -90]? No -> bit 1
Step 4 (latitude):   37.7749  in [45, 90]?   No  -> bit 0
Step 5 (longitude): -122.4194 in [-135, -90]? Yes, [-135,-112.5]?
  -122.4194 in [-90, -45]? ... (continue bisecting)

Binary result: 0 1 1 0 0 1 0 0 1 1 1 1 1 1 0 0 0 0 1 0 ...
               ^L ^l ^L ^l ^L ^l ^L ^l ^L ^l
               (L=longitude bit, l=latitude bit)

Group into 5-bit chunks and map to base-32:
01100 = 12 -> 'c'  (NOT standard base32, uses 0-9 b-z excluding a,i,l,o)
10011 = 19 -> 'q'
11110 = 30 -> 'w'
...

Result: "9q8yy..." (San Francisco)
```

#### Geohash Grid Hierarchy

Each additional character narrows the grid cell:

```
Precision 1: "9"
+-----------------------------------------------+
|                                               |
|                                               |
|          Covers ~5,000 km x 5,000 km          |
|                                               |
|                                               |
+-----------------------------------------------+

Precision 2: "9q"
+-------------------+
|                   |
|  ~1,250 x 625 km |
|                   |
+-------------------+

Precision 4: "9q8y"              Precision 6: "9q8yyk"
+--------+                       +--+
| ~40 km |                       |1 | ~1.2 km x 0.6 km
| x 20km |                       +--+
+--------+

Precision 8: "9q8yykbv"
+--+
|  | ~38 m x 19 m
+--+
```

#### Precision Levels Table

| Precision | Cell Width  | Cell Height | Use Case                      |
|-----------|-------------|-------------|-------------------------------|
| 1         | ~5,000 km   | ~5,000 km   | Continent-level               |
| 2         | ~1,250 km   | ~625 km     | Large country region          |
| 3         | ~156 km     | ~156 km     | State/Province                |
| 4         | ~39 km      | ~19.5 km    | City-level                    |
| 5         | ~4.9 km     | ~4.9 km     | District/neighborhood         |
| 6         | ~1.2 km     | ~0.6 km     | Street-level (~1 km radius)   |
| 7         | ~153 m      | ~153 m      | Building block                |
| 8         | ~38 m       | ~19 m       | Individual building           |

#### Mapping Radius to Geohash Precision

```
Search radius    -> Geohash precision
  500 m          -> 6 (cell ~1.2 km)
  1 km           -> 5 (cell ~4.9 km)
  5 km           -> 5 (cell ~4.9 km)
  20 km          -> 4 (cell ~39 km)
```

#### The Boundary Problem

A critical issue: two points close together can have completely different geohashes
if they straddle a cell boundary.

```
    Geohash "9q8y"        Geohash "9q8z"
  +-----------------++-----------------+
  |                 ||                 |
  |            A *  || * B             |
  |                 ||                 |
  +-----------------++-----------------+

  Points A and B are 50 meters apart, but in different geohash cells.
  Searching only "9q8y" would miss B!
```

**Solution: Search the center cell AND all 8 neighboring cells.**

```
  +--------+--------+--------+
  | NW     | N      | NE     |
  | 9q8x   | 9q8z   | 9q90   |
  +--------+--------+--------+
  | W      | CENTER | E      |
  | 9q8v   | 9q8y   | 9q91   |
  +--------+--------+--------+
  | SW     | S      | SE     |
  | 9q8t   | 9q8w   | 9q92   |
  +--------+--------+--------+

  Query: SELECT * FROM businesses
         WHERE geohash IN ('9q8y', '9q8z', '9q8x', '9q90',
                           '9q8v', '9q91', '9q8t', '9q8w', '9q92')
         -- then post-filter by exact distance
```

#### Geohash Prefix Matching for Range Queries

All geohashes starting with the same prefix are in the same region. This property
enables efficient range queries using B-tree indexes:

```sql
-- All businesses in cells starting with "9q8y"
SELECT * FROM businesses
WHERE geohash LIKE '9q8y%'

-- Equivalent range scan (more efficient):
SELECT * FROM businesses
WHERE geohash >= '9q8y' AND geohash < '9q8z'
```

This is why geohash works brilliantly with standard databases -- it converts a 2D
spatial query into a 1D range scan on a B-tree index.

#### Geohash Implementation (Pseudocode)

```python
BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz'

def encode_geohash(lat, lng, precision=6):
    lat_range = (-90.0, 90.0)
    lng_range = (-180.0, 180.0)
    is_longitude = True
    bits = 0
    count = 0
    geohash = []

    while len(geohash) < precision:
        if is_longitude:
            mid = (lng_range[0] + lng_range[1]) / 2
            if lng >= mid:
                bits = bits * 2 + 1
                lng_range = (mid, lng_range[1])
            else:
                bits = bits * 2
                lng_range = (lng_range[0], mid)
        else:
            mid = (lat_range[0] + lat_range[1]) / 2
            if lat >= mid:
                bits = bits * 2 + 1
                lat_range = (mid, lat_range[1])
            else:
                bits = bits * 2
                lat_range = (lat_range[0], mid)

        is_longitude = not is_longitude
        count += 1

        if count == 5:
            geohash.append(BASE32[bits])
            bits = 0
            count = 0

    return ''.join(geohash)

# Example:
# encode_geohash(37.7749, -122.4194, 6) -> "9q8yyk"
```

---

### 3.2 Quadtree

#### How Quadtree Works

A quadtree recursively divides a 2D space into four quadrants. Each node either:
- Contains points (leaf node), or
- Has exactly four children (internal node)

We split a node when it exceeds a capacity threshold (e.g., 100 businesses).

```
  World (root)
  +-------------------------------------------+
  |                     |                      |
  |        NW           |         NE           |
  |    (sparse, leaf)   |   (dense, split)     |
  |                     |   +--------+------+  |
  |                     |   | NW(10) |NE(8) |  |
  |                     |   +--------+------+  |
  |                     |   | SW(95) |SE(12)|  |
  |---------------------+---+--------+------+  |
  |                     |                      |
  |        SW           |         SE           |
  |    (sparse, leaf)   |    (sparse, leaf)    |
  |                     |                      |
  +-------------------------------------------+

  Dense urban areas -> deeper tree (more splits)
  Sparse rural areas -> shallow tree (fewer splits)
```

#### Quadtree Node Structure

```
                      [Root: World]
                     /    |    |    \
                   /      |    |      \
                 /        |    |        \
    [NW: leaf]  [NE: internal]  [SW: leaf]  [SE: leaf]
     15 biz      split further    3 biz      22 biz
                /    |    |    \
              NW    NE   SW    SE
             10biz 8biz 95biz 12biz
                         |
                      (split if >100)
```

#### Building a Quadtree (Pseudocode)

```python
class Point:
    def __init__(self, lat, lng, business_id):
        self.lat = lat
        self.lng = lng
        self.business_id = business_id

class BoundingBox:
    def __init__(self, min_lat, max_lat, min_lng, max_lng):
        self.min_lat = min_lat
        self.max_lat = max_lat
        self.min_lng = min_lng
        self.max_lng = max_lng

    def contains(self, point):
        return (self.min_lat <= point.lat <= self.max_lat and
                self.min_lng <= point.lng <= self.max_lng)

    def intersects_circle(self, center_lat, center_lng, radius):
        # Check if bounding box intersects with search circle
        closest_lat = clamp(center_lat, self.min_lat, self.max_lat)
        closest_lng = clamp(center_lng, self.min_lng, self.max_lng)
        return haversine(center_lat, center_lng, closest_lat, closest_lng) <= radius

class QuadTreeNode:
    MAX_CAPACITY = 100

    def __init__(self, boundary):
        self.boundary = boundary
        self.points = []        # business locations
        self.children = None    # [NW, NE, SW, SE] or None
        self.is_leaf = True

    def insert(self, point):
        if not self.boundary.contains(point):
            return False

        if self.is_leaf:
            self.points.append(point)
            if len(self.points) > self.MAX_CAPACITY:
                self._subdivide()
            return True

        # Internal node: delegate to children
        for child in self.children:
            if child.insert(point):
                return True
        return False

    def _subdivide(self):
        mid_lat = (self.boundary.min_lat + self.boundary.max_lat) / 2
        mid_lng = (self.boundary.min_lng + self.boundary.max_lng) / 2
        b = self.boundary

        self.children = [
            QuadTreeNode(BoundingBox(mid_lat, b.max_lat, b.min_lng, mid_lng)),  # NW
            QuadTreeNode(BoundingBox(mid_lat, b.max_lat, mid_lng, b.max_lng)),  # NE
            QuadTreeNode(BoundingBox(b.min_lat, mid_lat, b.min_lng, mid_lng)),  # SW
            QuadTreeNode(BoundingBox(b.min_lat, mid_lat, mid_lng, b.max_lng)),  # SE
        ]
        self.is_leaf = False

        # Redistribute points to children
        for point in self.points:
            for child in self.children:
                if child.insert(point):
                    break
        self.points = []

    def query_range(self, center_lat, center_lng, radius):
        """Find all points within radius of center."""
        results = []

        if not self.boundary.intersects_circle(center_lat, center_lng, radius):
            return results

        if self.is_leaf:
            for point in self.points:
                dist = haversine(center_lat, center_lng, point.lat, point.lng)
                if dist <= radius:
                    results.append((point, dist))
            return results

        for child in self.children:
            results.extend(child.query_range(center_lat, center_lng, radius))

        return results
```

#### Memory Estimation for Quadtree

```
200M businesses, max 100 per leaf node:

Leaf nodes:  ~200M / 100 = 2M leaf nodes
Internal nodes: ~2M / 3 = ~670K  (each internal has 4 children)
Total nodes: ~2.67M

Per leaf node:
  - Boundary: 4 floats * 8 bytes = 32 bytes
  - Points array: 100 * (8+8+8) bytes = 2,400 bytes (lat, lng, id)
  - Overhead: ~50 bytes
  Total: ~2,500 bytes

Per internal node:
  - Boundary: 32 bytes
  - 4 child pointers: 32 bytes
  - Overhead: ~50 bytes
  Total: ~114 bytes

Total memory:
  Leaf:     2M * 2,500 B = 5.0 GB
  Internal: 670K * 114 B = 76.4 MB
  Total:    ~5.1 GB

This fits comfortably in a single server's RAM (64-128 GB typical).
```

#### Dynamic vs Static Quadtree

| Aspect          | Static Quadtree          | Dynamic Quadtree          |
|----------------|--------------------------|---------------------------|
| Build time     | Batch (offline)          | Incremental (online)      |
| Updates        | Requires full rebuild    | Insert/delete in O(log n) |
| Balance        | Optimal at build time    | May become unbalanced     |
| Use case       | Rarely changing data     | Frequently changing data  |
| Our choice     | **Preferred** (200M biz, | Use for moving objects    |
|                | infrequent updates)      | like Uber drivers         |

---

### 3.3 S2 Geometry (Google's Approach)

#### Hilbert Curve Mapping

S2 Geometry, developed by Google, projects Earth's surface onto a cube and then uses
a **Hilbert space-filling curve** to map 2D regions to 1D intervals.

```
  Hilbert Curve (Level 3):

  +--+  +--+  +--+--+
  |  |  |  |  |     |
  +  +--+  +  +  +--+
  |        |  |  |
  +--+  +--+  +--+  +
     |  |        |  |
  +--+  +--+--+--+  +
  |                  |
  +--+--+--+--+--+--+

  Key insight: Points close on the curve are close in 2D space.
  (Unlike Z-order / Morton code which has discontinuities)
```

#### S2 Cells and Levels

S2 divides the Earth into a hierarchy of cells:

```
Level 0:  6 face cells (cube projection)
Level 1:  24 cells
Level 2:  96 cells
...
Level 12: ~1.3 km^2 per cell (good for city-level search)
Level 14: ~80,000 m^2 per cell
Level 16: ~5,000 m^2 per cell
...
Level 30: ~1 cm^2 per cell (maximum resolution)

Cell ID is a 64-bit integer -> efficient storage and comparison
```

#### Why S2 is Powerful

1. **Variable-size covering**: S2 can cover any arbitrary shape with a set of cells
   at different levels, minimizing over-fetch.

```
  Search radius: circle around user

  Geohash approach:          S2 approach:
  (fixed-size grid)          (variable-size cells)

  +---+---+---+              +---+---+
  |   | X |   |              | L | L |
  +---+---+---+              +---+---+---+
  | X |*U*| X |              | L |*S*|*S*| S |
  +---+---+---+              +---+*S*|*S*|---+
  |   | X |   |              | L | L |
  +---+---+---+              +---+---+

  Geohash: 9 fixed cells     S2: Mixed sizes, tighter fit
  More over-fetch             Less over-fetch
```

2. **No boundary discontinuities** at poles or the antimeridian.
3. **Containment and intersection** are O(1) operations on cell IDs.
4. **Used by Google Maps**, Google S2 library is open source.

---

### 3.4 R-tree

#### Bounding Rectangle Approach

R-tree organizes spatial data using **minimum bounding rectangles (MBRs)**.
Internal nodes store MBRs that bound their children. Leaf nodes contain actual
data entries.

```
  R-tree structure:

                     [Root MBR]
                    /          \
           [MBR A]              [MBR B]
          /   |   \            /   |   \
       [r1] [r2] [r3]      [r4] [r5] [r6]

  MBR A:                     MBR B:
  +------------------+       +------------------+
  |  +---+           |       |       +------+   |
  |  | r1|  +----+   |       |       |  r5  |   |
  |  +---+  | r2 |   |       |  +--+ +------+   |
  |         +----+   |       |  |r4|    +----+   |
  |    +------+      |       |  +--+    | r6 |   |
  |    |  r3  |      |       |          +----+   |
  |    +------+      |       |                   |
  +------------------+       +------------------+
```

#### When to Use R-tree

| Scenario                              | Best Index      |
|---------------------------------------|-----------------|
| Rectangular region queries            | **R-tree**      |
| Point-in-polygon queries             | R-tree or S2    |
| Radius search (our use case)          | Geohash or S2   |
| Spatial joins (overlapping regions)   | **R-tree**      |
| Database with PostGIS                 | R-tree (GiST)   |
| In-memory distributed system          | Geohash or Quadtree |

R-trees excel in PostGIS (PostgreSQL + GIS extension) and are the default spatial
index in most relational databases. For custom in-memory systems, geohash or
quadtree is simpler to implement and shard.

---

### 3.5 Comparison Table

| Feature            | Geohash          | Quadtree          | S2 Geometry        | R-tree            |
|--------------------|------------------|-------------------|--------------------|-------------------|
| **Type**           | Space-filling    | Tree (in-memory)  | Space-filling      | Balanced tree     |
|                    | curve + hash     |                   | curve (Hilbert)    |                   |
| **Dimension**      | 2D -> 1D string  | 2D subdivision    | Sphere -> 1D int   | nD bounding rects |
| **Storage**        | String column    | In-memory tree    | 64-bit integer     | Disk-based tree   |
| **DB friendly**    | Very (B-tree)    | No (custom)       | Yes (integer range) | Yes (GiST/R*)    |
| **Precision**      | Fixed per level  | Adaptive          | Adaptive           | Adaptive          |
| **Boundary issue** | Yes (need 8      | No (tree handles  | No (Hilbert curve  | No (MBR overlap)  |
|                    | neighbors)       | naturally)        | continuity)        |                   |
| **Update cost**    | O(1) re-hash     | O(log n) or       | O(1) re-compute    | O(log n) rebalance|
|                    |                  | full rebuild      |                    |                   |
| **Sharding**       | Easy (prefix)    | Hard              | Easy (cell range)  | Hard              |
| **Complexity**     | Simple           | Medium            | Complex            | Medium            |
| **Used by**        | Redis, Elastic   | Custom (Uber)     | Google Maps        | PostGIS, MongoDB  |
| **Best for**       | Simple proximity | Dense/sparse      | Global-scale       | Polygon/region    |
|                    | search           | adaptive needs    | variable coverage  | queries           |

**Recommendation for this system: Geohash** -- simplest, works with standard databases,
easy to shard, and sufficient for radius-based search. Use S2 for Google-scale global
coverage needs.

---

## 4. High-Level Architecture

```
                              +-----------+
                              |  Clients  |
                              | (Mobile/  |
                              |   Web)    |
                              +-----+-----+
                                    |
                                    v
                             +------+------+
                             |    CDN /    |
                             | API Gateway |
                             |   + Auth    |
                             +------+------+
                                    |
                    +---------------+---------------+
                    |                               |
                    v                               v
        +-----------+----------+       +-----------+-----------+
        |  Location-Based      |       |   Business Service    |
        |  Service (LBS)       |       |   (CRUD operations)   |
        |  (Read-only, high    |       |   (Low QPS, writes)   |
        |   QPS, stateless)    |       |                       |
        +-----------+----------+       +-----------+-----------+
                    |                               |
          +---------+---------+                     |
          |                   |                     v
          v                   v             +-------+-------+
  +-------+-------+  +-------+------+      |   Business    |
  | Geospatial    |  | Business     |      |   Database    |
  | Index         |  | Cache        |      |   (Primary)   |
  | (Geohash in   |  | (Redis)      |      |  (MySQL /     |
  |  Redis or     |  |              |      |   PostgreSQL) |
  |  in-memory)   |  +--------------+      +-------+-------+
  +---------------+                                |
                                                   v
                                           +-------+-------+
                                           |  Read Replicas|
                                           |  (for LBS     |
                                           |   queries)    |
                                           +---------------+
```

### Architecture Principles

```
+----------------------------------------------------------------------+
|                         KEY DESIGN DECISIONS                         |
+----------------------------------------------------------------------+
|                                                                      |
|  1. SEPARATE READ AND WRITE PATHS                                    |
|     - LBS handles searches (high QPS, read-only)                     |
|     - Business Service handles CRUD (low QPS, writes)                |
|     - Scale independently                                            |
|                                                                      |
|  2. LBS IS STATELESS                                                 |
|     - Easy to horizontally scale                                     |
|     - Load balancer distributes evenly                               |
|     - Geospatial index loaded into each LBS server's memory          |
|       OR shared via Redis cluster                                    |
|                                                                      |
|  3. GEOSPATIAL INDEX IN MEMORY                                       |
|     - 10 GB index fits in RAM                                        |
|     - Sub-millisecond lookup                                         |
|     - Replicated across LBS nodes                                    |
|                                                                      |
|  4. EVENTUAL CONSISTENCY FOR BUSINESS DATA                           |
|     - New business takes minutes to appear in search                 |
|     - Acceptable for this use case                                   |
|                                                                      |
+----------------------------------------------------------------------+
```

---

## 5. Data Model

### 5.1 Business Table (Primary Database)

```sql
CREATE TABLE businesses (
    id              BIGINT PRIMARY KEY AUTO_INCREMENT,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    lat             DECIMAL(10, 7) NOT NULL,
    lng             DECIMAL(10, 7) NOT NULL,
    geohash         VARCHAR(12) NOT NULL,        -- precomputed geohash
    address         VARCHAR(500),
    city            VARCHAR(100),
    state           VARCHAR(50),
    country         VARCHAR(50),
    zip_code        VARCHAR(20),
    phone           VARCHAR(20),
    category_id     INT NOT NULL,
    owner_id        BIGINT NOT NULL,
    rating          DECIMAL(2, 1) DEFAULT 0.0,
    review_count    INT DEFAULT 0,
    price_level     TINYINT,                     -- 1-4 ($-$$$$)
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW(),

    INDEX idx_geohash (geohash),
    INDEX idx_category (category_id),
    INDEX idx_geohash_category (geohash, category_id)
);
```

### 5.2 Geospatial Index Structure

**Option A: Geohash in MySQL/PostgreSQL (Simple)**

The `geohash` column with a B-tree index supports prefix range scans:

```sql
-- Find businesses in geohash cell and neighbors
SELECT id, name, lat, lng, rating
FROM businesses
WHERE geohash LIKE '9q8yy%'
   OR geohash LIKE '9q8yz%'
   OR geohash LIKE '9q8yx%'
   -- ... (8 neighbors)
AND is_active = TRUE
AND category_id = 42;
```

**Option B: Redis Geospatial Index (High Performance)**

```
GEOADD businesses:restaurant -122.4194 37.7749 "biz_abc123"
GEOADD businesses:restaurant -122.4089 37.7837 "biz_def456"

GEORADIUS businesses:restaurant -122.4194 37.7749 5 km
  COUNT 20 ASC
```

**Option C: In-Memory Geohash HashMap (Custom)**

```
HashMap<String, List<BusinessId>>:
  "9q8yyk" -> [biz_001, biz_002, biz_045, ...]
  "9q8yym" -> [biz_003, biz_017, ...]
  "9q8yys" -> [biz_008, biz_023, biz_099, ...]
```

### 5.3 Supporting Tables

```sql
CREATE TABLE categories (
    id              INT PRIMARY KEY AUTO_INCREMENT,
    name            VARCHAR(100) NOT NULL,
    parent_id       INT,
    icon_url        VARCHAR(500),

    INDEX idx_parent (parent_id)
);

CREATE TABLE reviews (
    id              BIGINT PRIMARY KEY AUTO_INCREMENT,
    business_id     BIGINT NOT NULL,
    user_id         BIGINT NOT NULL,
    rating          TINYINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    content         TEXT,
    created_at      TIMESTAMP DEFAULT NOW(),

    INDEX idx_business (business_id),
    INDEX idx_user (user_id),
    FOREIGN KEY (business_id) REFERENCES businesses(id)
);

CREATE TABLE business_photos (
    id              BIGINT PRIMARY KEY AUTO_INCREMENT,
    business_id     BIGINT NOT NULL,
    url             VARCHAR(500) NOT NULL,
    caption         VARCHAR(255),
    uploaded_at     TIMESTAMP DEFAULT NOW(),

    INDEX idx_business (business_id)
);
```

### 5.4 Why Both SQL and Geospatial Index?

```
+-------------------------------------------+-------------------------------------------+
|        SQL Database (MySQL/Postgres)      |      Geospatial Index (Redis/Memory)      |
+-------------------------------------------+-------------------------------------------+
| Source of truth for business data         | Optimized for spatial queries              |
| Complex queries (joins, aggregations)     | Sub-millisecond proximity lookup           |
| ACID transactions for writes             | Eventually consistent copy                 |
| Rich business details                    | Minimal data (id, lat, lng, geohash)       |
| Reviews, photos, hours                   | Fits entirely in memory                    |
| Low QPS (writes)                         | High QPS (reads)                           |
+-------------------------------------------+-------------------------------------------+

Flow: SQL DB --(async sync)--> Geospatial Index
      (write path)              (read path)
```

---

## 6. Detailed Design

### 6.1 Read Path (Search Flow)

```
 Client                  LBS                  Geo Index           Cache          DB
   |                      |                      |                  |             |
   |  GET /search/nearby  |                      |                  |             |
   |  lat, lng, radius    |                      |                  |             |
   |--------------------->|                      |                  |             |
   |                      |                      |                  |             |
   |                 [1. Convert radius           |                  |             |
   |                  to geohash precision]       |                  |             |
   |                      |                      |                  |             |
   |                 [2. Compute center geohash   |                  |             |
   |                  + 8 neighbor geohashes]     |                  |             |
   |                      |                      |                  |             |
   |                      |  Query geohash cells  |                  |             |
   |                      |--------------------->|                  |             |
   |                      |                      |                  |             |
   |                      |  Business IDs in cells|                  |             |
   |                      |<---------------------|                  |             |
   |                      |                      |                  |             |
   |                 [3. Post-filter:             |                  |             |
   |                  exact haversine distance]   |                  |             |
   |                      |                      |                  |             |
   |                      |  Get business details |                  |             |
   |                      |------------------------------------>|             |
   |                      |                      |     Cache HIT    |             |
   |                      |<------------------------------------|             |
   |                      |                      |                  |             |
   |                      |  (Cache MISS)         |  Query DB        |             |
   |                      |------------------------------------------------------>|
   |                      |                      |                  |             |
   |                      |<------------------------------------------------------|
   |                      |  [Populate cache]     |                  |             |
   |                      |------------------------------------>|             |
   |                      |                      |                  |             |
   |                 [4. Rank results:            |                  |             |
   |                  distance + rating + etc.]   |                  |             |
   |                      |                      |                  |             |
   |                 [5. Paginate and return]      |                  |             |
   |  JSON Response       |                      |                  |             |
   |<---------------------|                      |                  |             |
```

#### Step-by-Step Breakdown

**Step 1: Convert Radius to Geohash Precision**

```python
def radius_to_precision(radius_meters):
    """Map search radius to optimal geohash precision."""
    if radius_meters <= 50:
        return 8    # ~38m cells
    elif radius_meters <= 400:
        return 7    # ~153m cells
    elif radius_meters <= 2000:
        return 6    # ~1.2km cells
    elif radius_meters <= 10000:
        return 5    # ~4.9km cells
    elif radius_meters <= 50000:
        return 4    # ~39km cells
    else:
        return 3    # ~156km cells
```

**Step 2: Compute Center + Neighbor Geohashes**

```python
def get_search_geohashes(lat, lng, radius_meters):
    precision = radius_to_precision(radius_meters)
    center_hash = encode_geohash(lat, lng, precision)
    neighbors = get_8_neighbors(center_hash)  # library function
    return [center_hash] + neighbors  # 9 geohash cells total
```

**Step 3: Query and Post-Filter**

```python
def search_nearby(lat, lng, radius_meters, category=None):
    geohashes = get_search_geohashes(lat, lng, radius_meters)

    # Fetch candidate businesses from geospatial index
    candidates = []
    for gh in geohashes:
        business_ids = geo_index.get_businesses_by_geohash(gh)
        candidates.extend(business_ids)

    # Post-filter by exact distance (haversine formula)
    results = []
    for biz_id in candidates:
        biz = cache.get(biz_id) or db.get(biz_id)
        distance = haversine(lat, lng, biz.lat, biz.lng)
        if distance <= radius_meters:
            if category is None or biz.category == category:
                results.append((biz, distance))

    return results
```

**Step 4: Haversine Distance Formula**

```python
import math

def haversine(lat1, lng1, lat2, lng2):
    """Calculate distance between two points on Earth in meters."""
    R = 6_371_000  # Earth radius in meters

    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lng2 - lng1)

    a = (math.sin(delta_phi / 2) ** 2 +
         math.cos(phi1) * math.cos(phi2) *
         math.sin(delta_lambda / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return R * c  # distance in meters
```

**Step 5: Rank Results**

```python
def rank_results(results, sort_by='relevance'):
    if sort_by == 'distance':
        return sorted(results, key=lambda x: x[1])  # (biz, distance)

    if sort_by == 'rating':
        return sorted(results, key=lambda x: -x[0].rating)

    # Default: relevance score (weighted combination)
    def relevance_score(biz, distance):
        distance_score = 1.0 / (1.0 + distance / 1000)   # decay with distance
        rating_score = biz.rating / 5.0                    # normalized 0-1
        popularity_score = min(biz.review_count / 1000, 1) # cap at 1000 reviews
        recency_score = recency_factor(biz.updated_at)     # freshness

        return (0.35 * distance_score +
                0.30 * rating_score +
                0.20 * popularity_score +
                0.15 * recency_score)

    return sorted(results, key=lambda x: -relevance_score(x[0], x[1]))
```

### 6.2 Write Path (Business CRUD)

```
 Owner              API Gateway        Business Service      Database        Async Worker
   |                     |                    |                  |                |
   |  POST /businesses   |                    |                  |                |
   |  {name, lat, lng..} |                    |                  |                |
   |-------------------->|                    |                  |                |
   |                     |  Auth + validate   |                  |                |
   |                     |------------------->|                  |                |
   |                     |                    |                  |                |
   |                     |               [Compute geohash       |                |
   |                     |                from lat/lng]          |                |
   |                     |                    |                  |                |
   |                     |                    |  INSERT business |                |
   |                     |                    |----------------->|                |
   |                     |                    |  Success         |                |
   |                     |                    |<-----------------|                |
   |                     |                    |                  |                |
   |                     |                    |  Publish event   |                |
   |                     |                    |  to message queue|                |
   |                     |                    |-------------------------------> |
   |                     |                    |                  |                |
   |  201 Created        |                    |                  |    Update      |
   |<--------------------|                    |                  |    geospatial  |
   |                     |                    |                  |    index       |
   |                     |                    |                  |                |
   |                     |                    |                  |    Invalidate  |
   |                     |                    |                  |    cache       |
```

#### Index Rebuild Strategy

```
+------------------------------------------------------------------+
|                  INDEX UPDATE STRATEGIES                          |
+------------------------------------------------------------------+
|                                                                  |
|  Option 1: Real-Time (Event-Driven)                              |
|  - Business write -> Kafka event -> Index updater                |
|  - Latency: seconds                                              |
|  - Complexity: medium                                            |
|  - Use when: near real-time freshness is needed                  |
|                                                                  |
|  Option 2: Periodic Batch Rebuild                                |
|  - Cron job rebuilds index from DB every N minutes               |
|  - Latency: minutes                                              |
|  - Complexity: low                                               |
|  - Use when: data changes infrequently (our case!)               |
|                                                                  |
|  Option 3: Hybrid                                                |
|  - Periodic full rebuild + real-time delta updates               |
|  - Best of both worlds                                           |
|  - Complexity: high                                              |
|  - Use when: large scale with mixed update patterns              |
|                                                                  |
|  RECOMMENDATION: Option 1 (real-time events via Kafka)           |
|  - Simple consumer updates geohash index                         |
|  - Propagation delay < 5 seconds                                 |
|  - Full rebuild as fallback (daily)                              |
|                                                                  |
+------------------------------------------------------------------+
```

### 6.3 Ranking

#### Multi-Factor Ranking System

```
                    +------------------+
                    |  Raw Candidates  |
                    |  (from geo index)|
                    +--------+---------+
                             |
                             v
                    +--------+---------+
                    |  Distance Filter |  <-- Exact haversine
                    |  (within radius) |
                    +--------+---------+
                             |
                             v
                    +--------+---------+
                    |  Scoring Engine  |
                    +--------+---------+
                             |
              +--------------+--------------+
              |              |              |
              v              v              v
        +-----+----+  +-----+----+  +------+-----+
        | Distance  |  | Quality  |  | Business   |
        | Score     |  | Score    |  | Boost      |
        | (35%)     |  | (45%)    |  | (20%)      |
        +-----------+  +----------+  +------------+
              |              |              |
              |    +----+    |    +----+    |    +----+
              +--->|    |<---+--->|    |<---+--->|    |
                   +--+-+        +--+-+        +--+-+
                      |             |             |
                      v             v             v
                   +--+-------------+-------------+--+
                   |       Weighted Final Score       |
                   +----------------+-----------------+
                                    |
                                    v
                           +--------+--------+
                           |  Sort & Paginate |
                           +-----------------+

Distance Score:
  - Inverse distance decay: 1 / (1 + d/1000)
  - Closer = higher score

Quality Score:
  - Rating (normalized):     rating / 5.0         * 0.5
  - Review count (log):      log(review_count+1)/10 * 0.3
  - Photo count:             min(photos/10, 1)    * 0.1
  - Response rate:           response_rate         * 0.1

Business Boost:
  - Sponsored (paid):        +0.2 boost (labeled "Ad")
  - Recently updated:        +0.05 boost
  - Claimed & verified:      +0.05 boost
  - Category match:          +0.1 if exact category match
```

---

## 7. Caching Strategy

### 7.1 Cache Architecture

```
                  +-------------------------------------------+
                  |              CACHING LAYERS                |
                  +-------------------------------------------+
                  |                                           |
                  |  Layer 1: CDN / Edge Cache                |
                  |  - Static assets (photos, icons)          |
                  |  - Popular search results (by region)     |
                  |  - TTL: 5 minutes                         |
                  |                                           |
                  |  Layer 2: Application Cache (Redis)       |
                  |  - Business details by ID                 |
                  |  - Search results by geohash+category     |
                  |  - TTL: 15-60 minutes                     |
                  |                                           |
                  |  Layer 3: Geospatial Index (In-Memory)    |
                  |  - Geohash -> business ID mapping         |
                  |  - Updated via event stream               |
                  |  - Always in memory (not really "cache")  |
                  |                                           |
                  +-------------------------------------------+
```

### 7.2 Cache Key Design

```
Business detail cache:
  Key:   "biz:{business_id}"
  Value: JSON blob of business details
  TTL:   60 minutes
  Example: "biz:abc123" -> {"name": "Joe's Pizza", ...}

Search result cache:
  Key:   "search:{geohash}:{category}:{sort}"
  Value: List of business IDs (pre-sorted)
  TTL:   15 minutes
  Example: "search:9q8yyk:restaurant:distance" -> [id1, id2, id3, ...]

Geohash cell cache:
  Key:   "geo:{geohash_prefix}"
  Value: Set of business IDs in this cell
  TTL:   None (event-driven invalidation)
  Example: "geo:9q8yyk" -> {id1, id2, id3, ...}
```

### 7.3 Cache Invalidation

```
Business updated
       |
       v
+------+-------+
| Publish event |
| to Kafka      |
+------+-------+
       |
       +-------------------+-------------------+
       |                   |                   |
       v                   v                   v
+------+-------+  +--------+------+  +--------+------+
| Invalidate   |  | Update geo    |  | Invalidate    |
| biz:{id}     |  | index entry   |  | search:*      |
| cache key    |  | (re-geohash   |  | cache keys    |
|              |  |  if location  |  | for affected  |
|              |  |  changed)     |  | geohash cells |
+--------------+  +---------------+  +---------------+
```

### 7.4 Redis Geospatial Commands

Redis natively supports geospatial indexing, which can serve as both the
geo index and cache:

```redis
-- Add businesses with coordinates
GEOADD businesses -122.4194 37.7749 "biz_001"
GEOADD businesses -122.4089 37.7837 "biz_002"
GEOADD businesses -122.3940 37.7895 "biz_003"

-- Find businesses within 5 km of a point
GEOSEARCH businesses FROMLONLAT -122.4194 37.7749 BYRADIUS 5 km
  ASC COUNT 20
-- Returns: ["biz_001", "biz_002", "biz_003"]

-- Get distance between two businesses
GEODIST businesses "biz_001" "biz_002" km
-- Returns: "1.2345"

-- Get geohash of a business
GEOHASH businesses "biz_001"
-- Returns: ["9q8yyk0000"]

-- Category-specific indexes
GEOADD biz:restaurant -122.4194 37.7749 "biz_001"
GEOADD biz:hotel      -122.4089 37.7837 "biz_002"

-- Search by category
GEOSEARCH biz:restaurant FROMLONLAT -122.4194 37.7749 BYRADIUS 2 km ASC
```

---

## 8. Scaling

### 8.1 Database Sharding

```
Strategy: Shard by geohash prefix (first 2-3 characters)

  Shard 1: geohash 00-3f  (North America West)
  Shard 2: geohash 40-7f  (North America East + South America)
  Shard 3: geohash 80-bf  (Europe + Africa)
  Shard 4: geohash c0-ff  (Asia + Oceania)

  +----------+    +----------+    +----------+    +----------+
  | Shard 1  |    | Shard 2  |    | Shard 3  |    | Shard 4  |
  | NA West  |    | NA East  |    | EU + AF  |    | Asia     |
  | 50M biz  |    | 30M biz  |    | 60M biz  |    | 60M biz  |
  +----------+    +----------+    +----------+    +----------+

  Problem: Uneven distribution (Manhattan vs Sahara Desert)
  Solution: Virtual shards + consistent hashing on geohash prefix
```

### 8.2 Handling Dense vs Sparse Areas

```
  Manhattan (dense):                Rural Montana (sparse):

  Geohash "dr5ru" has 50,000       Geohash "c80" has 5
  businesses in one cell            businesses in entire region

  Solution:                         Solution:
  - Use higher precision (7-8)      - Use lower precision (3-4)
  - More index entries              - Fewer index entries
  - Might need sub-sharding         - Single query covers area

  Adaptive precision algorithm:

  def get_adaptive_precision(lat, lng, base_precision):
      count = estimate_density(lat, lng, base_precision)
      if count > 10000:
          return base_precision + 1  # more precise for dense areas
      elif count < 10:
          return base_precision - 1  # less precise for sparse areas
      return base_precision
```

### 8.3 Read Replica Architecture

```
                     +------------------+
                     |   Primary DB     |
                     |   (Writes only)  |
                     +--------+---------+
                              |
                   Replication|Stream
                              |
            +-----------------+-----------------+
            |                 |                 |
            v                 v                 v
   +--------+------+  +------+--------+  +-----+---------+
   | Read Replica 1|  | Read Replica 2|  | Read Replica 3|
   | (LBS queries) |  | (LBS queries) |  | (Analytics)   |
   +---------------+  +---------------+  +---------------+

   - LBS reads from replicas (no impact on write performance)
   - Replication lag < 1 second (acceptable for our consistency model)
   - Analytics replica for reporting (isolated from production reads)
```

### 8.4 Geospatial Index Scaling

```
  Option A: Replicated (our choice for 200M businesses)

  +----------+    +----------+    +----------+
  | LBS-1    |    | LBS-2    |    | LBS-3    |
  | +------+ |    | +------+ |    | +------+ |
  | |Index | |    | |Index | |    | |Index | |
  | |Copy 1| |    | |Copy 2| |    | |Copy 3| |
  | +------+ |    | +------+ |    | +------+ |
  +----------+    +----------+    +----------+

  Each LBS has full copy of index (~5-10 GB)
  Updated independently via Kafka consumer


  Option B: Sharded Redis Cluster (for larger scale)

  +--------------------+
  | Redis Cluster      |
  | +------+ +------+  |
  | |Shard1| |Shard2|  |
  | |geo:0*| |geo:4*|  |
  | +------+ +------+  |
  | +------+ +------+  |
  | |Shard3| |Shard4|  |
  | |geo:8*| |geo:c*|  |
  | +------+ +------+  |
  +--------------------+

  Sharded by geohash prefix
  Each shard handles a geographic region
```

### 8.5 Load Balancing Considerations

```
  Approach 1: Round Robin (simple, ignores locality)

  Approach 2: Geo-Aware Routing (optimal)

  User in NYC -----> LBS instance in us-east-1
  User in Tokyo ---> LBS instance in ap-northeast-1
  User in London --> LBS instance in eu-west-1

  Benefits:
  - Lower latency (closer servers)
  - Cache locality (same region users share cache)
  - Reduced cross-region data transfer
```

---

## 9. Real-time Location Updates

### 9.1 Static vs Moving Businesses

```
  Static businesses (99%):        Moving businesses (1%):
  - Restaurants                   - Food trucks
  - Hotels                        - Pop-up shops
  - Gas stations                  - Delivery vehicles (Uber, DoorDash)
  - Hospitals                     - Mobile vendors

  Static: update geohash on rare location edits
  Moving: continuous location stream at high frequency
```

### 9.2 Real-Time Location Pipeline (Moving Objects)

```
  Food Truck           Location Service          Stream            Index
  GPS Device           (WebSocket)              Processor          Updater
      |                     |                      |                  |
      | lat/lng every 5s    |                      |                  |
      |-------------------->|                      |                  |
      |                     | Publish to Kafka     |                  |
      |                     |--------------------->|                  |
      |                     |                      |                  |
      |                     |                 [Compute new geohash]   |
      |                     |                 [Compare with old]      |
      |                     |                      |                  |
      |                     |                 [If geohash changed:]   |
      |                     |                      |  Update index    |
      |                     |                      |----------------->|
      |                     |                      |                  |
      |                     |                 [If geohash same:]      |
      |                     |                      |  No-op (skip)    |
      |                     |                      |                  |

  Optimization: Only update index when geohash cell changes.
  A truck moving within the same geohash cell needs no index update.

  Example: At precision 6, a cell is ~1.2 km wide.
  A food truck moving slowly may stay in the same cell for 10+ minutes.
```

### 9.3 Geofencing

```
  Define a geographic boundary and trigger events when
  objects enter or leave.

  +-------------------------------------------+
  |                                           |
  |     Delivery Zone (Polygon)               |
  |                                           |
  |        +----+                             |
  |        |    |  <-- Restaurant             |
  |        +----+                             |
  |                    * <-- Driver enters     |
  |                         TRIGGER: "Driver   |
  |                         near restaurant"   |
  |                                           |
  +-------------------------------------------+

  Implementation with geohash:
  1. Pre-compute geohashes that overlap with the geofence polygon
  2. When an object's geohash matches any of those cells, do fine-grained
     point-in-polygon check
  3. If inside polygon, trigger the geofence event

  Use case: Send push notification when user is near a business
```

---

## 10. Deployment Architecture

### 10.1 Multi-Region Deployment

```
                          +-------------------+
                          |    Global DNS     |
                          | (GeoDNS routing)  |
                          +--------+----------+
                                   |
                 +-----------------+-----------------+
                 |                 |                 |
                 v                 v                 v
        +--------+------+  +------+--------+  +-----+---------+
        |  US Region    |  |  EU Region    |  | APAC Region   |
        |  us-east-1    |  |  eu-west-1    |  | ap-northeast-1|
        +--------+------+  +------+--------+  +-----+---------+
                 |                 |                 |
           +-----+-----+    +-----+-----+    +-----+-----+
           |           |    |           |    |           |
           v           v    v           v    v           v
      +----+---+  +---+----+---+  +---+----+---+  +---+----+
      |  LBS   |  |  Biz   |  |  |  LBS   |  |  |  LBS   |
      | Cluster|  |Service |  |  | Cluster|  |  | Cluster|
      +----+---+  +---+----+  |  +---+----+  |  +---+----+
           |           |      |      |        |      |
           v           v      |      v        |      v
      +----+---+  +---+----+  | +---+----+   | +---+----+
      | Redis  |  |  MySQL  |  | | Redis  |   | | Redis  |
      | Cluster|  | Primary |  | | Cluster|   | | Cluster|
      +--------+  +---+----+  | +--------+   | +--------+
                       |       |              |
                  Replication  |         Replication
                       |       |              |
                       v       v              v
                  +----+-------+----+   +-----+------+
                  | MySQL Read      |   | MySQL Read |
                  | Replicas (EU)   |   | Replicas   |
                  +-----------------+   | (APAC)     |
                                        +------------+
```

### 10.2 Edge Caching for Popular Locations

```
  Popular location detection:

  1. Track search query frequency by geohash cell
  2. Identify "hot" cells (Times Square, Shibuya, etc.)
  3. Pre-warm edge caches for hot cells

  Cache warming pipeline:

  Analytics      Hot Cell         CDN Edge
  System         Detector         Nodes
     |               |               |
     | Query logs    |               |
     |-------------->|               |
     |               |               |
     |          [Identify top 1%     |
     |           geohash cells by    |
     |           query volume]       |
     |               |               |
     |               | Push results  |
     |               | to edge cache |
     |               |-------------->|
     |               |               |
     |               |          [Cache search
     |               |           results for
     |               |           hot cells at
     |               |           edge PoPs]
     |               |               |

  Result: Searches in Times Square served from edge (< 50ms)
  instead of hitting LBS backend (< 200ms)
```

---

## 11. Putting It All Together -- End-to-End Example

### User searches "pizza near me" in San Francisco

```
Step 1: Client sends request
  GET /v1/search/nearby?lat=37.7749&lng=-122.4194&radius=2000&category=restaurant

Step 2: API Gateway authenticates, rate-limits, routes to LBS

Step 3: LBS computes geohashes
  Center: encode(37.7749, -122.4194, precision=6) -> "9q8yyk"
  Neighbors: ["9q8yym", "9q8yyh", "9q8yys", "9q8yye",
              "9q8yy7", "9q8yyt", "9q8yyj", "9q8yyn"]

Step 4: Query geospatial index
  For each of 9 geohashes, get business IDs:
  "9q8yyk" -> [biz_001, biz_045, biz_089, ...]
  "9q8yym" -> [biz_003, biz_067, ...]
  ... total candidates: 340 businesses

Step 5: Post-filter by exact distance
  For each candidate, compute haversine distance.
  Keep only those within 2000m.
  Result: 187 businesses within radius.

Step 6: Apply category filter
  Filter to restaurants only.
  Result: 89 restaurants.

Step 7: Fetch business details from cache/DB
  Batch fetch: MGET biz:biz_001 biz:biz_045 ...
  Cache hits: 72 / 89 (81% hit rate)
  Remaining 17: query read replica, then populate cache.

Step 8: Rank results
  Sort by relevance score = 0.35*distance + 0.30*rating + 0.20*popularity + 0.15*recency
  Top result: "Joe's Pizza" (distance=234m, rating=4.5, 1203 reviews)

Step 9: Paginate and return
  Return top 20 results (page 1 of 5).
  Total latency: ~80ms (well under 200ms SLA).
```

---

## 12. Common Interview Follow-ups

### Q1: How to handle "search as I move" (real-time updates)?

```
Approach: Client-side debouncing + server streaming

1. Client sends location updates every 3-5 seconds
2. Debounce: Only trigger search if user moved > 100m from last search center
3. Server-sent events (SSE) or WebSocket for streaming results

Client-side pseudocode:
  let lastSearchCenter = null

  onLocationUpdate(newLocation) {
    if (!lastSearchCenter ||
        distance(lastSearchCenter, newLocation) > 100) {
      lastSearchCenter = newLocation
      fetchNearbyResults(newLocation)
    }
  }

Optimization: Incremental diff
  - Server tracks user's last result set
  - Only send delta (added/removed businesses) instead of full results
  - Reduces bandwidth significantly for small movements
```

### Q2: How to implement "businesses within driving distance" (not straight line)?

```
Problem: Haversine gives straight-line distance, not driving distance.
         A business 1 km away by air might be 5 km by road.

Solution layers:

Layer 1: Quick filter with haversine (generous radius)
  - Search with 2x the desired driving distance as haversine radius
  - This gives a superset of candidates

Layer 2: Driving distance calculation
  - For each candidate, call a routing engine (OSRM, Google Directions)
  - Get actual driving distance and estimated travel time
  - Filter by actual driving distance/time

Layer 3: Caching driving distances
  - Cache (origin_geohash, dest_geohash) -> driving_distance
  - At geohash precision 7 (~153m), cache is very reusable

  +----------+                +------------+
  | Candidate| -- haversine   | Routing    |
  | Filter   |   < 2x radius  | Engine     |
  | (fast)   |--------------->| (OSRM)     |
  | 500 biz  |                | Drive dist |
  +----------+                +-----+------+
                                    |
                              +-----+------+
                              | 180 biz    |
                              | within 10  |
                              | min drive  |
                              +------------+
```

### Q3: How to handle different zoom levels on a map?

```
Zoom level directly maps to geohash precision:

  Zoom 3-5  (continent)  -> Geohash precision 1-2 (show clusters)
  Zoom 6-8  (country)    -> Geohash precision 3   (show regions)
  Zoom 9-11 (city)       -> Geohash precision 4   (show neighborhoods)
  Zoom 12-14 (district)  -> Geohash precision 5-6 (show individual pins)
  Zoom 15+  (street)     -> Geohash precision 7+  (show all details)

Clustering strategy:
  At low zoom levels, aggregate businesses into clusters:

  Zoom 5 (viewing California):
  +---------------------------+
  |                           |
  |   [San Francisco: 45K]   |
  |                           |
  |        [San Jose: 28K]   |
  |                           |
  |   [Los Angeles: 72K]     |
  |                           |
  +---------------------------+

  Zoom 12 (viewing a neighborhood):
  +---------------------------+
  |  * Pizza Place            |
  |        * Coffee Shop      |
  |     * Bookstore           |
  |  * Gym                    |
  |            * Bank         |
  +---------------------------+

Pre-computed cluster counts:
  - For each geohash at each precision level, store business count
  - "9q" -> 145,000 businesses (precision 2)
  - "9q8" -> 23,000 businesses (precision 3)
  - "9q8y" -> 3,200 businesses (precision 4)
```

### Q4: How to implement business recommendations?

```
  Recommendation system architecture:

  +------------------+     +------------------+     +------------------+
  | User Profile     |     | Collaborative    |     | Content-Based    |
  | - Past searches  |     | Filtering        |     | Filtering        |
  | - Past visits    |---->| "Users like you  |     | "Businesses      |
  | - Ratings given  |     |  also liked..."  |     |  similar to ones |
  | - Categories     |     +--------+---------+     |  you liked..."   |
  +------------------+              |               +--------+---------+
                                    |                        |
                                    v                        v
                           +--------+------------------------+---------+
                           |           Recommendation Mixer            |
                           |  - Combine collaborative + content scores |
                           |  - Apply location boost (nearby preferred)|
                           |  - Apply diversity (avoid all same type)  |
                           |  - Apply freshness (new businesses boost) |
                           +-------------------+-----------------------+
                                               |
                                               v
                                    +----------+---------+
                                    | Personalized       |
                                    | Ranked Results     |
                                    +--------------------+

  Feature vector per business:
  [category, price_level, avg_rating, review_count, distance,
   cuisine_type, has_outdoor_seating, has_delivery, ...]

  Real-time signals:
  - Time of day (breakfast vs dinner restaurants)
  - Day of week (weekday vs weekend activities)
  - Weather (indoor activities on rainy days)
  - Current events (stadium restaurants on game day)
```

### Q5: How to handle location accuracy issues?

```
  Problem: GPS accuracy varies from 3m (open sky) to 100m+ (urban canyon)

  Solutions:

  1. Expand search radius by accuracy margin
     effective_radius = user_radius + gps_accuracy
     If user wants 1km and GPS accuracy is 50m:
     Search with 1050m radius

  2. Location smoothing (for moving users)
     - Kalman filter to smooth noisy GPS readings
     - Reject sudden jumps (> 100 km/h movement speed)
     - Use Wi-Fi / cell tower triangulation as fallback

  3. Snap to known location
     - If user is at a known place (office, home), use that coordinate
     - More accurate than raw GPS in many cases

  4. Client-side accuracy reporting
     - Mobile OS provides accuracy estimate with each reading
     - API accepts optional "accuracy" parameter
     - Server adjusts search strategy accordingly

     GET /v1/search/nearby?lat=37.7749&lng=-122.4194
         &radius=2000&accuracy=50
```

### Q6: How does Uber find nearby drivers (moving objects)?

```
  Key difference from static businesses: drivers move constantly.

  Architecture:

  1. Driver location ingestion (high write throughput)
     - 1M active drivers sending GPS every 3 seconds
     - ~333K writes/second to location service
     - Use Kafka for ingestion buffering

  2. In-memory spatial index (NOT database)
     - Quadtree or geohash in-memory (updates are cheap)
     - Partition by city/region
     - Each partition server handles one geographic area

  3. Matching flow:
     Rider request -> Find geohash cell -> Get drivers in cell + neighbors
     -> Filter by distance -> Filter by availability
     -> Rank by ETA -> Dispatch to best driver

  4. Key optimizations:
     - S2 cells for variable-size covering (small cells in city, large in suburbs)
     - Ring buffer per driver (last 30 seconds of locations)
     - Skip index update if driver hasn't crossed cell boundary
     - Predictive positioning (where will driver be in 2 min?)

  Scale comparison:
  +------------------+------------------+------------------+
  |                  | Yelp (static)    | Uber (moving)    |
  +------------------+------------------+------------------+
  | Objects          | 200M businesses  | 5M drivers       |
  | Update frequency | Rarely           | Every 3 seconds  |
  | Index updates/s  | ~1/s             | ~500K/s          |
  | Search QPS       | ~30K/s           | ~10K/s           |
  | Index type       | Geohash (DB)     | Quadtree (RAM)   |
  | Consistency      | Eventually       | Real-time        |
  +------------------+------------------+------------------+
```

---

## 13. Summary -- Key Takeaways for Interviews

```
+------------------------------------------------------------------------+
|                     INTERVIEW CHEAT SHEET                               |
+------------------------------------------------------------------------+
|                                                                        |
|  1. ALGORITHM CHOICE                                                   |
|     - Geohash: simplest, DB-friendly, use for most interviews          |
|     - Quadtree: adaptive density, good for in-memory index             |
|     - S2: Google-scale, variable-size cells, mention for bonus points  |
|     - R-tree: PostGIS default, polygon queries                         |
|                                                                        |
|  2. CORE INSIGHT: 2D spatial query -> 1D range scan                    |
|     Geohash converts (lat, lng) to a sortable string.                  |
|     All businesses in a geohash cell share a common prefix.            |
|     Standard B-tree index handles prefix range scans efficiently.      |
|                                                                        |
|  3. ARCHITECTURE PATTERN                                               |
|     - Separate read (LBS) and write (Business Service) paths           |
|     - Geospatial index fits in memory (10 GB for 200M businesses)      |
|     - Eventual consistency is acceptable                               |
|     - Event-driven index updates via Kafka                             |
|                                                                        |
|  4. THE BOUNDARY PROBLEM                                               |
|     Always mention: search center cell + 8 neighbors.                  |
|     Always mention: post-filter with haversine for exact distance.     |
|                                                                        |
|  5. CACHING WINS                                                       |
|     - Spatial locality: users in same area hit same cache keys         |
|     - Cache by geohash prefix + category                               |
|     - Redis GEOSEARCH for combined cache + geo-index                   |
|                                                                        |
|  6. SCALING STRATEGY                                                   |
|     - Shard database by geohash prefix (geographic partitioning)       |
|     - Replicate full geo index to each LBS server                      |
|     - Multi-region deployment with GeoDNS routing                      |
|     - Adaptive precision for dense vs sparse areas                     |
|                                                                        |
|  7. NUMBERS TO REMEMBER                                                |
|     - 200M businesses * 50 bytes = 10 GB index (fits in RAM)           |
|     - Geohash precision 6 ~ 1.2 km cell (good for ~1 km radius)       |
|     - 9 geohash cells to search (center + 8 neighbors)                |
|     - Post-filter candidates with haversine formula                    |
|     - Target: < 200ms p99 latency                                     |
|                                                                        |
+------------------------------------------------------------------------+
```

---

## References

- *System Design Interview* by Alex Xu, Chapter 13: Design a Proximity Service
- Google S2 Geometry Library: https://s2geometry.io/
- Redis Geospatial Commands: https://redis.io/docs/data-types/geospatial/
- Geohash Explorer: https://geohash.softeng.co/
- Uber H3 Hexagonal Hierarchical Spatial Index: https://h3geo.org/
- PostGIS Documentation: https://postgis.net/documentation/
