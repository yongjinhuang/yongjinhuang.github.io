# Design Search Autocomplete (Typeahead)

A typeahead / autocomplete system suggests query completions in real time as a user
types into a search box. Think Google Search suggestions, Amazon product search, or
YouTube's search bar. The core challenge is returning highly relevant suggestions
within a strict latency budget while ingesting billions of queries per day.

---

## Table of Contents

1. [Requirements Clarification](#1-requirements-clarification)
2. [API Design](#2-api-design)
3. [Data Structure Deep Dive: Trie](#3-data-structure-deep-dive-trie)
4. [High-Level Architecture](#4-high-level-architecture)
5. [Data Model](#5-data-model)
6. [Data Collection & Aggregation Pipeline](#6-data-collection--aggregation-pipeline)
7. [Trie Building & Update](#7-trie-building--update)
8. [Query Processing](#8-query-processing)
9. [Caching Strategy](#9-caching-strategy)
10. [Scaling](#10-scaling)
11. [Deployment Architecture](#11-deployment-architecture)
12. [Common Interview Follow-ups](#12-common-interview-follow-ups)

---

## 1. Requirements Clarification

### Functional Requirements

| # | Requirement | Detail |
|---|-------------|--------|
| F1 | Prefix matching | As the user types "din", return suggestions like "dinner recipes", "dinosaur games" |
| F2 | Top-K suggestions | Return the top 5-10 most popular/relevant completions |
| F3 | Ranked results | Suggestions ordered by popularity, recency, and relevance |
| F4 | Fast response | Results should appear as the user types each character |
| F5 | Multi-language | Support queries in English, Chinese, Spanish, etc. |
| F6 | Filtering | Exclude offensive, illegal, or inappropriate suggestions |

### Non-Functional Requirements

| # | Requirement | Target |
|---|-------------|--------|
| NF1 | Latency | < 100 ms end-to-end (p99) |
| NF2 | Availability | 99.99% uptime |
| NF3 | Scalability | Handle 10M+ DAU |
| NF4 | Consistency | Eventual consistency is acceptable (suggestions can lag minutes) |
| NF5 | Fault tolerance | No single point of failure |

### Back-of-Envelope Calculations

```
Users & Queries
---------------
DAU:                        10,000,000
Searches per user per day:  10
Total searches per day:     100,000,000

Keystrokes per search (avg query = 20 chars, avg 4 prefix lookups):
  Requests per search:      4
  (Users don't query every keystroke due to debouncing)

Total autocomplete QPS:
  100M searches x 4 prefixes = 400,000,000 requests/day
  Peak QPS = 400M / 86400 * 3 (peak factor) ~ 14,000 QPS
  Average QPS = 400M / 86400 ~ 4,600 QPS

Data Volume
-----------
Unique queries per day:     ~5,000,000
Average query length:       20 bytes (UTF-8)
New query data per day:     5M * 20B = 100 MB
Per year:                   ~36 GB of raw query text

Trie Size (in memory)
---------------------
Assume 5M unique prefixes in the Trie:
  Each node: 40 bytes (char + children pointers + top-K list pointer)
  Trie nodes (avg 15 chars per path): 5M * 15 * 40B = 3 GB
  Top-K cache per node (10 entries * 40 bytes): ~600 MB
  Total Trie memory: ~4 GB (fits in a single server's RAM)

Bandwidth
---------
Average response size: ~200 bytes (10 suggestions * 20 chars)
Peak bandwidth: 14,000 QPS * 200B = 2.8 MB/s (trivial)
```

---

## 2. API Design

### Endpoint

```
GET /v1/suggestions?prefix={prefix}&limit={limit}&lang={lang}&user_id={user_id}
```

| Parameter | Type   | Required | Default | Description |
|-----------|--------|----------|---------|-------------|
| prefix    | string | yes      | -       | The characters typed so far |
| limit     | int    | no       | 10      | Max number of suggestions to return |
| lang      | string | no       | "en"    | Language code for multi-language support |
| user_id   | string | no       | -       | For personalized suggestions (optional) |

### Response Format

```json
{
  "prefix": "how to m",
  "suggestions": [
    {
      "text": "how to make pancakes",
      "score": 98500,
      "type": "trending"
    },
    {
      "text": "how to make money online",
      "score": 87200,
      "type": "popular"
    },
    {
      "text": "how to meditate",
      "score": 76100,
      "type": "popular"
    },
    {
      "text": "how to measure ring size",
      "score": 65400,
      "type": "popular"
    },
    {
      "text": "how to merge pdf files",
      "score": 54300,
      "type": "popular"
    }
  ],
  "metadata": {
    "latency_ms": 12,
    "cache_hit": true
  }
}
```

### Client-Side Debouncing Strategy

Clients should NOT fire a request on every keystroke. Instead, use debouncing:

```
User types: "h" "o" "w" " " "t" "o" " " "m" "a" "k"

Without debounce (10 requests):
  t=0ms    -> GET ?prefix=h
  t=80ms   -> GET ?prefix=ho
  t=160ms  -> GET ?prefix=how
  ...10 total requests

With 150ms debounce (4 requests):
  t=0ms    -> user types "h"
  t=80ms   -> user types "o"
  t=160ms  -> user types "w"    -> debounce fires -> GET ?prefix=how
  t=200ms  -> user types " "
  t=280ms  -> user types "t"
  t=360ms  -> user types "o"    -> debounce fires -> GET ?prefix=how to
  t=400ms  -> user types " "
  t=480ms  -> user types "m"
  t=560ms  -> user types "a"
  t=640ms  -> user types "k"    -> debounce fires -> GET ?prefix=how to mak
  ...4 total requests (60% reduction)
```

**Additional client-side optimizations:**

| Optimization | Description |
|-------------|-------------|
| Debounce 100-200ms | Wait before sending request after last keystroke |
| Cancel in-flight | Abort previous XHR/fetch when new prefix arrives |
| Client cache | Cache prefix -> suggestions in sessionStorage |
| Min prefix length | Only query after 2+ characters typed |
| Adaptive debounce | Increase debounce interval on slow networks |

---

## 3. Data Structure Deep Dive: Trie

### What Is a Trie?

A **Trie** (prefix tree / digital tree) is a tree-like data structure where each node
represents a single character. Paths from root to leaf (or marked nodes) spell out
stored strings. All descendants of a node share the same prefix.

```
                        (root)
                       /  |   \
                      t   b    c
                     /    |     \
                    r     e      a
                   / \    |      |
                  e   i   s      r
                  |   |   |      |
                  e   p   t      [end]
                  |   |   [end]
                 [end][end]

  Stored words: "tree", "trip", "best", "car"
```

Each path from root to an `[end]` marker represents a complete stored string.

### Basic Trie Node (Pseudocode)

```python
class TrieNode:
    def __init__(self):
        self.children = {}        # char -> TrieNode
        self.is_end = False       # marks end of a complete word
        self.frequency = 0        # search frequency counter

class Trie:
    def __init__(self):
        self.root = TrieNode()

    def insert(self, word, freq=1):
        node = self.root
        for char in word:
            if char not in node.children:
                node.children[char] = TrieNode()
            node = node.children[char]
        node.is_end = True
        node.frequency += freq

    def search_prefix(self, prefix):
        """Find the node corresponding to the last char of prefix."""
        node = self.root
        for char in prefix:
            if char not in node.children:
                return None
            node = node.children[char]
        return node

    def get_top_k(self, prefix, k=10):
        """Get top-k completions for a prefix."""
        node = self.search_prefix(prefix)
        if node is None:
            return []
        # DFS to find all completions (SLOW for production)
        results = []
        self._dfs(node, prefix, results)
        results.sort(key=lambda x: x[1], reverse=True)
        return results[:k]

    def _dfs(self, node, current, results):
        if node.is_end:
            results.append((current, node.frequency))
        for char, child in node.children.items():
            self._dfs(child, current + char, results)
```

**Problem:** `get_top_k` requires a full DFS traversal of the subtree below the
prefix node. For a prefix like "a" that could have millions of completions, this is
far too slow for real-time use.

### Optimized Trie: Top-K Cache at Each Node

The key optimization: **precompute and cache the top-K suggestions at every node**.

```python
class OptimizedTrieNode:
    def __init__(self):
        self.children = {}
        self.is_end = False
        self.frequency = 0
        self.top_k = []           # Precomputed list of (word, freq) tuples

class OptimizedTrie:
    def __init__(self, k=10):
        self.root = OptimizedTrieNode()
        self.k = k

    def build(self, query_frequencies):
        """Build trie from {query: frequency} dict, then propagate top-K."""
        for query, freq in query_frequencies.items():
            self._insert(query, freq)
        self._propagate_top_k(self.root, "")

    def _insert(self, word, freq):
        node = self.root
        for char in word:
            if char not in node.children:
                node.children[char] = OptimizedTrieNode()
            node = node.children[char]
        node.is_end = True
        node.frequency = freq

    def _propagate_top_k(self, node, prefix):
        """Post-order traversal to propagate top-K up the tree."""
        candidates = []
        if node.is_end:
            candidates.append((prefix, node.frequency))
        for char, child in node.children.items():
            self._propagate_top_k(child, prefix + char)
            candidates.extend(child.top_k)
        # Keep only top-K by frequency
        candidates.sort(key=lambda x: x[1], reverse=True)
        node.top_k = candidates[:self.k]

    def get_suggestions(self, prefix):
        """O(L) lookup where L = len(prefix). No DFS needed."""
        node = self.root
        for char in prefix:
            if char not in node.children:
                return []
            node = node.children[char]
        return node.top_k
```

**Query time complexity: O(L)** where L is the length of the prefix. The top-K list
is already precomputed -- just walk down the Trie and return the cached list.

```
Optimized Trie with Top-K Cache (K=2):

                            (root)
                    top_k: [("tree", 50), ("trip", 40)]
                           /         \
                          t           b
              top_k: [("tree",50),   top_k: [("best",30)]
                      ("trip",40)]
                         |             |
                         r             e
              top_k: [("tree",50),   top_k: [("best",30)]
                      ("trip",40)]
                        / \            |
                       e   i           s
            top_k:     |   |        top_k: [("best",30)]
          [("tree",50)]| [("trip",40)]|
                       e   p           t
                       |   |           |
                     [end] [end]     [end]
                    freq=50 freq=40  freq=30

  Query "tr" -> walk to node 'r' -> return top_k: [("tree",50), ("trip",40)]
  Time: O(2) -- just 2 character lookups!
```

### Compressed Trie (Patricia Tree / Radix Tree)

Standard tries waste space when nodes have a single child. A **compressed trie**
(also called Patricia tree or radix tree) merges chains of single-child nodes:

```
Standard Trie (wasteful):                Compressed Trie (space-efficient):

        (root)                                   (root)
       /      \                                 /      \
      t        b                             "tr"     "best"
      |        |                             /   \      |
      r        e                           "ee"  "ip"  [end]
     / \       |                            |      |
    e   i      s                          [end]  [end]
    |   |      |
    e   p      t
    |   |      |
   [end][end] [end]

Nodes: 11                                 Nodes: 6  (45% reduction)
```

**Space savings:** For a corpus of N strings with average length L:

| Metric | Standard Trie | Compressed Trie |
|--------|--------------|-----------------|
| Nodes | O(N * L) | O(N) |
| Space | ~40 bytes/node * N*L | ~(40 + avg_label_len) bytes/node * N |
| Lookup | O(L) | O(L) (same) |

For 5M queries with avg length 20:
- Standard: 5M * 20 * 40B = 4 GB
- Compressed: 5M * 60B = 300 MB (>10x reduction)

### Alternative: Redis Sorted Sets (ZRANGEBYLEX)

For simpler deployments, Redis sorted sets offer prefix search via `ZRANGEBYLEX`:

```
ZADD autocomplete 0 "how to cook rice"
ZADD autocomplete 0 "how to code"
ZADD autocomplete 0 "how to clean"
ZADD autocomplete 0 "hotel booking"

# Prefix search for "how to c"
ZRANGEBYLEX autocomplete "[how to c" "[how to c\xff" LIMIT 0 10
# Returns: "how to clean", "how to code", "how to cook rice"
```

**Trade-offs: Trie vs Redis Sorted Set**

| Aspect | Custom Trie | Redis ZRANGEBYLEX |
|--------|------------|-------------------|
| Latency | < 1ms (in-process memory) | 1-5ms (network hop) |
| Top-K ranking | Precomputed at each node | Requires separate score structure |
| Space efficiency | Compressed trie is very compact | Stores full strings, more memory |
| Complexity | Custom code to build and maintain | Off-the-shelf, easy to operate |
| Scaling | Custom sharding logic needed | Redis Cluster handles sharding |
| Best for | High-scale, low-latency | Prototypes, moderate scale |

---

## 4. High-Level Architecture

The system has two major data flows:

1. **Query path** (online, latency-critical): user types prefix -> get suggestions
2. **Data collection path** (offline/near-real-time): collect search logs -> build trie

```
                         QUERY PATH (Online)
  ┌──────────┐     ┌──────────────┐     ┌───────────────────┐
  │  Client   │────>│ Load Balancer │────>│   API Servers     │
  │ (Browser) │<────│  (L7 / CDN)  │<────│  (Stateless)      │
  └──────────┘     └──────────────┘     └─────────┬─────────┘
                                                   │
                                          ┌────────▼────────┐
                                          │  Trie Service    │
                                          │  (In-Memory      │
                                          │   Trie Cache)    │
                                          └────────┬────────┘
                                                   │ fallback
                                          ┌────────▼────────┐
                                          │  Redis Cache     │
                                          │  (L2 Cache)      │
                                          └─────────────────┘


                    DATA COLLECTION PATH (Offline / Near-Real-Time)
  ┌──────────┐     ┌──────────┐     ┌─────────────┐     ┌─────────────┐
  │  Search   │────>│  Kafka   │────>│  Aggregator │────>│  Frequency  │
  │  Logs     │     │  Queue   │     │  (Flink /   │     │  Store      │
  │           │     │          │     │   Spark)    │     │  (DB)       │
  └──────────┘     └──────────┘     └─────────────┘     └──────┬──────┘
                                                                │
                                                       ┌────────▼────────┐
                                                       │  Trie Builder   │
                                                       │  (Periodic Job) │
                                                       └────────┬────────┘
                                                                │
                                               ┌────────────────▼────────────────┐
                                               │      Trie Snapshot Store        │
                                               │  (S3 / HDFS serialized tries)  │
                                               └────────────────┬────────────────┘
                                                                │ push / pull
                                               ┌────────────────▼────────────────┐
                                               │      Trie Service Nodes         │
                                               │  (Load new snapshot into memory)│
                                               └────────────────────────────────┘
```

### Component Responsibilities

| Component | Role |
|-----------|------|
| Client (Browser) | Debounce keystrokes, cache recent results, display suggestions |
| Load Balancer / CDN | Route requests, cache popular prefix responses at edge |
| API Servers | Validate input, route to Trie service, apply personalization |
| Trie Service | In-memory Trie lookup, return top-K for a prefix in < 1ms |
| Redis Cache | L2 cache for prefixes not in the in-memory Trie or for overflow |
| Kafka | Buffer search query logs for async processing |
| Aggregator | Count query frequencies per time window (hourly, daily) |
| Frequency Store | Persist aggregated (query, frequency, timestamp) data |
| Trie Builder | Read frequency data, build optimized Trie, serialize to snapshot |
| Snapshot Store | Durable storage (S3/HDFS) for Trie binary snapshots |

---

## 5. Data Model

### Raw Search Query Log

Stored in a log-structured store (Kafka topic, then archived to S3).

```
Table: search_query_log
┌──────────────────────────────────────────────────────────────────┐
│ Column       │ Type       │ Description                         │
├──────────────┼────────────┼─────────────────────────────────────┤
│ query_id     │ UUID       │ Unique log entry ID                 │
│ query        │ VARCHAR    │ The search query string              │
│ user_id      │ VARCHAR    │ User identifier (nullable)          │
│ timestamp    │ BIGINT     │ Unix epoch ms when query was issued │
│ locale       │ VARCHAR(5) │ Language/region (e.g., "en-US")     │
│ device_type  │ VARCHAR    │ "mobile", "desktop", "tablet"       │
│ session_id   │ VARCHAR    │ For grouping queries in a session   │
└──────────────────────────────────────────────────────────────────┘

Example rows:
  ("a1b2", "how to make pancakes",  "u123", 1709312400000, "en-US", "mobile",  "s001")
  ("c3d4", "how to make money",     "u456", 1709312401000, "en-US", "desktop", "s002")
  ("e5f6", "how to make pancakes",  "u789", 1709312402000, "en-US", "mobile",  "s003")
```

### Aggregated Frequency Table

Produced by the aggregation pipeline. Stored in a relational DB or key-value store.

```
Table: query_frequency
┌──────────────────────────────────────────────────────────────────┐
│ Column       │ Type       │ Description                         │
├──────────────┼────────────┼─────────────────────────────────────┤
│ query        │ VARCHAR    │ Normalized search query (PK)        │
│ frequency    │ BIGINT     │ Weighted frequency score            │
│ last_updated │ TIMESTAMP  │ When this row was last refreshed    │
│ locale       │ VARCHAR(5) │ Language segment                    │
│ is_filtered  │ BOOLEAN    │ Whether this query is blocklisted   │
└──────────────────────────────────────────────────────────────────┘

Example rows:
  ("how to make pancakes",      98500, "2024-03-01 12:00", "en-US", false)
  ("how to make money online",  87200, "2024-03-01 12:00", "en-US", false)
  ("how to make a bomb",          120, "2024-03-01 12:00", "en-US", true)
```

### Trie Node Serialization Format

The Trie is serialized to a binary format for storage and transport:

```
Trie Snapshot Binary Format:
┌────────────────────────────────────────────────────┐
│ Header (32 bytes)                                  │
│   magic_number: 4 bytes ("TRIE")                   │
│   version:      2 bytes                            │
│   node_count:   4 bytes                            │
│   locale:       8 bytes                            │
│   created_at:   8 bytes (unix epoch)               │
│   checksum:     4 bytes (CRC32)                    │
│   reserved:     2 bytes                            │
├────────────────────────────────────────────────────┤
│ Node Table (variable length)                       │
│   For each node:                                   │
│     node_id:        4 bytes                        │
│     char_label:     variable (UTF-8, null-term)    │
│     num_children:   2 bytes                        │
│     child_offsets:  4 bytes * num_children          │
│     is_end:         1 byte                         │
│     frequency:      4 bytes                        │
│     num_top_k:      1 byte                         │
│     top_k_entries:  (4 + 4) bytes * num_top_k      │
│       -> string_offset (4) + score (4)             │
├────────────────────────────────────────────────────┤
│ String Table (variable length)                     │
│   Deduplicated suggestion strings, null-terminated │
└────────────────────────────────────────────────────┘

Typical snapshot size for 5M queries: ~300-500 MB compressed
```

---

## 6. Data Collection & Aggregation Pipeline

### Pipeline Overview

```
  ┌───────────────┐
  │  User Search  │
  │  (Frontend)   │
  └───────┬───────┘
          │ 1. Log search event
          ▼
  ┌───────────────┐     ┌──────────────┐     ┌──────────────────┐
  │  Search API   │────>│    Kafka     │────>│  Stream Processor│
  │  Server       │     │  (Topic:     │     │  (Flink / Spark  │
  │               │     │   searches)  │     │   Streaming)     │
  └───────────────┘     └──────────────┘     └────────┬─────────┘
                                                       │
                                    2. Aggregate by     │
                                       time window      │
                                                       ▼
                                             ┌──────────────────┐
                                             │  Time-Window     │
                                             │  Aggregator      │
                                             │                  │
                                             │  1-hour buckets: │
                                             │  {query: count}  │
                                             └────────┬─────────┘
                                                      │
                                    3. Compute weighted │
                                       frequency        │
                                                      ▼
                                             ┌──────────────────┐
                                             │  Frequency       │
                                             │  Calculator      │
                                             │                  │
                                             │  Apply time      │
                                             │  decay + weights │
                                             └────────┬─────────┘
                                                      │
                                    4. Filter          │
                                       inappropriate   │
                                                      ▼
                                             ┌──────────────────┐
                                             │  Content Filter  │
                                             │                  │
                                             │  Blocklist +     │
                                             │  ML classifier   │
                                             └────────┬─────────┘
                                                      │
                                    5. Write to        │
                                       frequency store │
                                                      ▼
                                             ┌──────────────────┐
                                             │  Frequency       │
                                             │  Store (DB)      │
                                             └──────────────────┘
```

### Step-by-Step Details

#### Step 1: Real-Time Logging

Every completed search (user hits Enter or clicks a suggestion) is logged:

```json
{
  "event": "search_completed",
  "query": "how to make pancakes",
  "user_id": "u123",
  "timestamp": 1709312400000,
  "locale": "en-US",
  "source": "typeahead_click"
}
```

**Important:** We only log *completed* searches, not every prefix keystroke. This
avoids inflating counts for partial prefixes the user never intended.

#### Step 2: Time-Window Aggregation

The stream processor groups queries into time windows:

```
Tumbling window: 1 hour

Window [12:00 - 13:00]:
  "how to make pancakes"     -> 1,240
  "how to make money online" -> 980
  "how to make a resume"     -> 870

Window [13:00 - 14:00]:
  "how to make pancakes"     -> 1,180
  "how to make money online" -> 1,050
  ...
```

#### Step 3: Time-Weighted Frequency

Recent queries should rank higher than old ones. Use **exponential time decay**:

```
weighted_score = SUM over all time windows:
    count_in_window * decay_factor ^ (hours_since_window / half_life)

Where:
    decay_factor = 0.5
    half_life = 168 hours (1 week)

Example for "how to make pancakes":
    Last hour:    1,240 * 0.5^(0/168)   = 1,240.0
    2 hours ago:  1,180 * 0.5^(1/168)   = 1,175.1
    1 day ago:    1,100 * 0.5^(24/168)  = 1,000.4
    1 week ago:     900 * 0.5^(168/168) =   450.0
    2 weeks ago:    800 * 0.5^(336/168) =   200.0
                                          --------
    Total weighted score:                  ~4,065.5
```

This ensures:
- Trending queries rise quickly (recent high counts dominate)
- Old queries naturally fade without explicit deletion
- Evergreen queries maintain scores through consistent volume

#### Step 4: Content Filtering

Two-layer filtering system:

```
Layer 1: Blocklist (exact match + regex patterns)
  - Explicit list of banned queries
  - Regex patterns for categories (violence, hate speech, etc.)
  - Updated by content moderation team

Layer 2: ML Classifier
  - Trained on labeled data (safe / unsafe)
  - Catches novel offensive queries not in blocklist
  - Runs offline during aggregation (not on the query path)
  - Queries with unsafe_score > threshold are flagged
```

---

## 7. Trie Building & Update

### Offline Trie Building Process

The Trie is rebuilt periodically (e.g., every 15 minutes to 1 hour):

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ 1. Read from │────>│ 2. Build     │────>│ 3. Serialize │────>│ 4. Upload    │
│ Frequency    │     │ Optimized    │     │ to Binary    │     │ Snapshot to  │
│ Store        │     │ Trie         │     │ Format       │     │ S3 / HDFS    │
└──────────────┘     └──────────────┘     └──────────────┘     └──────┬───────┘
                                                                      │
                                                              ┌───────▼───────┐
                                                              │ 5. Notify     │
                                                              │ Trie Servers  │
                                                              │ to pull new   │
                                                              │ snapshot      │
                                                              └───────┬───────┘
                                                                      │
                                                              ┌───────▼───────┐
                                                              │ 6. Trie       │
                                                              │ Servers load  │
                                                              │ new Trie into │
                                                              │ memory        │
                                                              └───────────────┘
```

**Build pseudocode:**

```python
def build_trie_snapshot():
    # 1. Fetch top N queries by weighted score
    queries = frequency_store.get_top_queries(
        limit=5_000_000,
        min_score=10,
        is_filtered=False
    )

    # 2. Build optimized Trie with top-K at each node
    trie = OptimizedTrie(k=10)
    trie.build(queries)  # {query: score} dict

    # 3. Serialize to binary
    snapshot = trie.serialize()
    checksum = crc32(snapshot)

    # 4. Upload to durable storage
    snapshot_key = f"trie/en-US/{timestamp}.bin"
    s3.upload(snapshot_key, snapshot)

    # 5. Notify Trie servers
    notify_servers(snapshot_key, checksum)
```

### Snapshot-Based Updates (Primary Strategy)

```
Timeline:

  t=0        t=15min     t=30min     t=45min
  |           |           |           |
  Build v1    Build v2    Build v3    Build v4
  |           |           |           |
  Servers     Servers     Servers     Servers
  load v1     load v2     load v3     load v4

Rollout strategy (blue-green):
  Server pool A: serving v1     -> load v2 -> serving v2
  Server pool B: serving v1 (still serving while A loads v2)
  After A healthy: B loads v2
```

**Advantages:**
- Atomic updates (whole Trie is replaced at once)
- Easy rollback (just point to previous snapshot)
- No corruption from partial updates
- Servers remain read-only (simple, fast)

### Online Updates (Supplementary for Trending)

For breaking news / trending queries, waiting 15 minutes is too slow. Use a
lightweight online update mechanism:

```python
class TrieWithHotUpdates:
    def __init__(self):
        self.base_trie = None           # Loaded from snapshot
        self.hot_queries = {}            # {query: score} for trending
        self.hot_trie = OptimizedTrie()  # Small trie for hot queries

    def get_suggestions(self, prefix, k=10):
        base_results = self.base_trie.get_suggestions(prefix)
        hot_results = self.hot_trie.get_suggestions(prefix)
        # Merge and re-rank
        merged = merge_ranked(base_results, hot_results)
        return merged[:k]

    def update_hot(self, query, score):
        """Called by real-time stream processor for trending queries."""
        self.hot_queries[query] = score
        if len(self.hot_queries) > 10000:
            # Rebuild small hot trie
            self.hot_trie = OptimizedTrie(k=10)
            self.hot_trie.build(self.hot_queries)
```

### Trade-off: Freshness vs Build Cost

| Strategy | Freshness | Build Cost | Complexity | Use When |
|----------|-----------|-----------|------------|----------|
| Full rebuild every hour | ~30 min lag | High (rebuild entire Trie) | Low | Stable query patterns |
| Full rebuild every 15 min | ~8 min lag | Medium-High | Low | General use case |
| Snapshot + hot updates | ~seconds for trending | Low (hot Trie is tiny) | Medium | Breaking news needed |
| Fully real-time updates | Real-time | Very High (lock contention) | Very High | Rarely justified |

**Recommendation:** Snapshot rebuild every 15 minutes + hot update layer for trending.

---

## 8. Query Processing

### Prefix Matching Algorithm

```python
def handle_suggestion_request(prefix, limit, locale, user_id):
    # 1. Normalize the prefix
    normalized = normalize(prefix, locale)
    #   - lowercase
    #   - strip leading/trailing whitespace
    #   - normalize unicode (NFC form)
    #   - transliterate if needed (locale-specific)

    # 2. Check application cache (Redis)
    cache_key = f"suggest:{locale}:{normalized}"
    cached = redis.get(cache_key)
    if cached:
        results = deserialize(cached)
    else:
        # 3. Look up in Trie (in-memory)
        results = trie_service.get_suggestions(normalized)
        # 4. Cache the result
        redis.setex(cache_key, ttl=300, serialize(results))

    # 5. Apply personalization (if user_id provided)
    if user_id:
        results = personalize(results, user_id, limit)

    # 6. Return top-K
    return results[:limit]
```

### Top-K Retrieval from Trie Nodes

Since each node caches the top-K, retrieval is trivial:

```
Input prefix: "how to m"

Step 1: Walk down the Trie
  root -> 'h' -> 'o' -> 'w' -> ' ' -> 't' -> 'o' -> ' ' -> 'm'

Step 2: Read node.top_k at the 'm' node
  [
    ("how to make pancakes",       98500),
    ("how to make money online",   87200),
    ("how to meditate",            76100),
    ("how to measure ring size",   65400),
    ("how to merge pdf files",     54300),
    ("how to make a website",      48900),
    ("how to make slime",          42100),
    ("how to multiply fractions",  38600),
    ("how to make french toast",   35200),
    ("how to move to canada",      31800)
  ]

Step 3: Return the list (already sorted by score)

Time complexity: O(L) where L = length of prefix (8 in this case)
No DFS, no sorting, no aggregation at query time.
```

### Personalization Layer

Blend global suggestions with user-specific history:

```python
def personalize(global_results, user_id, limit):
    # Fetch user's recent search history
    user_history = user_store.get_recent_searches(user_id, limit=50)

    # Score user-history matches
    personal_results = []
    for query, timestamp in user_history:
        if query.startswith(prefix):
            recency_boost = compute_recency_boost(timestamp)
            personal_results.append((query, recency_boost))

    # Merge: interleave personal and global
    # Strategy: 30% personal slots, 70% global slots
    personal_slots = max(1, int(limit * 0.3))
    global_slots = limit - personal_slots

    merged = personal_results[:personal_slots]
    # Fill remaining with global, skipping duplicates
    seen = set(r[0] for r in merged)
    for result in global_results:
        if result[0] not in seen and len(merged) < limit:
            merged.append(result)

    return merged
```

### Spelling Correction / Fuzzy Matching

For handling typos in the prefix:

```
User types: "recpie" (misspelling of "recipe")

Strategy 1: Edit Distance
  - Compute edit distance from prefix to known prefixes in Trie
  - If no exact match found, try prefixes within edit distance 1-2
  - Expensive: O(N * L) where N = number of Trie nodes at that depth

Strategy 2: Phonetic Matching (Soundex / Metaphone)
  - Convert prefix to phonetic code
  - Maintain a phonetic index: phonetic_code -> [original_prefixes]
  - "recpie" -> phonetic code -> matches "recipe"

Strategy 3: Precomputed Correction Map
  - Offline: for top 100K queries, precompute common misspellings
  - Store as correction_map: {"recpie": "recipe", "reciepe": "recipe"}
  - At query time: O(1) lookup in correction map

Recommendation: Strategy 3 for production (fast, predictable)
  - Falls back to Strategy 1 if no map entry found
```

---

## 9. Caching Strategy

Autocomplete is extremely cache-friendly because:
- Popular prefixes are queried by many users ("how to", "what is", "best")
- Suggestions change infrequently (every 15 min rebuild)
- Responses are small (~200 bytes)

### Four-Layer Caching Architecture

```
  ┌─────────────────┐
  │  Layer 1:       │  Hit rate: ~30%
  │  Browser Cache  │  Latency: 0 ms
  │  (sessionStorage│  TTL: session duration
  │   + HTTP cache) │
  └────────┬────────┘
           │ miss
  ┌────────▼────────┐
  │  Layer 2:       │  Hit rate: ~40% of remaining
  │  CDN / Edge     │  Latency: 5-20 ms
  │  Cache          │  TTL: 5-15 minutes
  │  (CloudFront)   │
  └────────┬────────┘
           │ miss
  ┌────────▼────────┐
  │  Layer 3:       │  Hit rate: ~20% of remaining
  │  Redis Cache    │  Latency: 1-5 ms
  │  (Application)  │  TTL: 5 minutes
  └────────┬────────┘
           │ miss
  ┌────────▼────────┐
  │  Layer 4:       │  Hit rate: 100% (authoritative)
  │  In-Memory Trie │  Latency: < 1 ms
  │  (Trie Service) │
  └─────────────────┘
```

### Layer 1: Browser Cache

```javascript
// Client-side caching with sessionStorage
const CACHE_KEY_PREFIX = 'ac_';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCachedSuggestions(prefix) {
  const key = CACHE_KEY_PREFIX + prefix;
  const cached = sessionStorage.getItem(key);
  if (!cached) return null;

  const { suggestions, timestamp } = JSON.parse(cached);
  if (Date.now() - timestamp > CACHE_TTL_MS) {
    sessionStorage.removeItem(key);
    return null;
  }
  return suggestions;
}

function cacheSuggestions(prefix, suggestions) {
  const key = CACHE_KEY_PREFIX + prefix;
  sessionStorage.setItem(key, JSON.stringify({
    suggestions,
    timestamp: Date.now()
  }));
}
```

**HTTP Cache headers** (set by API server):

```
Cache-Control: public, max-age=300
Vary: Accept-Encoding
```

### Layer 2: CDN / Edge Cache

Popular prefixes are cached at CDN edge locations worldwide:

```
Top prefixes by volume (cache these aggressively):

  Prefix         QPS    CDN TTL
  ─────────────────────────────
  "how"          850    15 min
  "what"         720    15 min
  "how to"       680    15 min
  "best"         540    15 min
  "why"          430    15 min
  "where"        390    10 min
  "how to m"     180    10 min
  "iphone"       150     5 min   (may change with product launches)

Cache key: locale + normalized_prefix
  e.g., "en-US:how to m"
```

### Layer 3: Redis Cache (Application Level)

```python
def get_suggestions_with_cache(prefix, locale):
    cache_key = f"ac:{locale}:{prefix}"

    # Try Redis first
    cached = redis.get(cache_key)
    if cached:
        return json.loads(cached)

    # Fall through to Trie
    results = trie_service.lookup(prefix)

    # Populate Redis cache
    redis.setex(cache_key, 300, json.dumps(results))

    return results
```

### Layer 4: In-Memory Trie

The Trie itself serves as the ultimate cache. It holds the entire dataset in memory
on each Trie service node. Lookups are O(L) with no I/O.

### Cache Invalidation

```
When a new Trie snapshot is deployed:
  1. Trie servers load new snapshot (atomic swap)
  2. Redis cache: set TTL to 0 (flush) OR let entries expire naturally
  3. CDN: send invalidation request for high-traffic prefixes
  4. Browser cache: expires on its own (short TTL)

Since suggestions change gradually, stale cache entries are acceptable
for a few minutes. No hard invalidation needed in most cases.
```

---

## 10. Scaling

### Trie Partitioning (Sharding by Prefix Range)

When the Trie exceeds single-server memory (unlikely for most cases, but
necessary at extreme scale), partition by prefix:

```
Shard 0: prefixes starting with [a-d]     ~25% of queries
Shard 1: prefixes starting with [e-j]     ~30% of queries
Shard 2: prefixes starting with [k-p]     ~20% of queries
Shard 3: prefixes starting with [q-z]     ~15% of queries
Shard 4: prefixes starting with [0-9, _]  ~10% of queries

Note: Partitions are NOT even by letter count. They're divided
by query volume to balance load across shards.

    ┌───────────┐
    │   Router  │ prefix -> shard mapping
    └─────┬─────┘
     ┌────┼─────┬──────┬──────┐
     ▼    ▼     ▼      ▼      ▼
  ┌────┐┌────┐┌────┐┌────┐┌────┐
  │ S0 ││ S1 ││ S2 ││ S3 ││ S4 │
  │a-d ││e-j ││k-p ││q-z ││0-9 │
  └────┘└────┘└────┘└────┘└────┘
```

**Dynamic re-sharding:** If shard 1 (e-j) becomes a hotspot:
- Split into two: [e-g] and [h-j]
- Update the router's prefix-to-shard mapping
- Both new shards load their respective Trie partitions

### Replication for Read Scaling

Each shard is replicated for high availability and read throughput:

```
                     ┌──────────────────────────────┐
                     │         Shard 0 (a-d)        │
                     │                              │
                     │  ┌────────┐   ┌────────┐    │
                     │  │Primary │   │Replica │    │
                     │  │  (R/W) │   │  (R)   │    │
                     │  └────────┘   └────────┘    │
                     │               ┌────────┐    │
                     │               │Replica │    │
                     │               │  (R)   │    │
                     │               └────────┘    │
                     └──────────────────────────────┘

Read distribution:
  - Primary: handles Trie snapshot updates
  - Replicas: handle read traffic (load balanced)
  - Replication: push-based (primary pushes new snapshot to replicas)
```

### Geographic Distribution

Deploy Trie services in multiple regions to minimize latency:

```
                    ┌──────────────────────┐
                    │  Trie Builder        │
                    │  (Central / us-east) │
                    └──────────┬───────────┘
                               │ push snapshots
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
     ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
     │  us-east    │  │  eu-west    │  │  ap-south   │
     │  Trie Nodes │  │  Trie Nodes │  │  Trie Nodes │
     │  (3 shards  │  │  (3 shards  │  │  (3 shards  │
     │   x 2 repl) │  │   x 2 repl) │  │   x 2 repl) │
     └─────────────┘  └─────────────┘  └─────────────┘

Users routed to nearest region via GeoDNS / Anycast.
Each region has a full copy of the Trie.
```

### Multi-Language Support

Each language gets its own Trie (different character sets, different query patterns):

```
Language-specific considerations:

Language     Charset        Tokenization     Trie Type
─────────────────────────────────────────────────────────
English      ASCII/Latin    Whitespace       Standard prefix trie
Chinese      CJK Unicode    Character-level  Character trie (no spaces)
Japanese     Mixed          Morphological    Hybrid (kanji + kana tries)
Korean       Hangul         Jamo/syllable    Jamo-level trie
Arabic       Arabic script  Right-to-left    RTL-aware trie

Storage strategy:
  Separate Trie per locale:
    trie/en-US/snapshot_2024030112.bin   (300 MB)
    trie/zh-CN/snapshot_2024030112.bin   (250 MB)
    trie/ja-JP/snapshot_2024030112.bin   (200 MB)

  Each Trie server loads tries for its assigned locales.
  Routing: locale header -> appropriate Trie shard.
```

**Chinese example (character-level Trie):**

```
Query: "how to" in Chinese might be typed as pinyin: "zenme"
Or directly in Chinese characters: "怎么"

Character-level Trie for Chinese:

        (root)
       /      \
     怎        如
      |         |
     么         何
    / | \       |
   做  办  样   ...
   |  |   |
  饭  事  ...
   |
  [end] -> "怎么做饭" (how to cook)
```

---

## 11. Deployment Architecture

### Multi-Region Deployment Diagram

```
                          ┌─────────────────────────┐
                          │      Global DNS         │
                          │   (Route53 / GeoDNS)    │
                          └────────────┬────────────┘
                                       │
                    ┌──────────────────┬┴──────────────────┐
                    │                  │                    │
           ┌────────▼───────┐ ┌────────▼───────┐  ┌────────▼───────┐
           │   CDN Edge     │ │   CDN Edge     │  │   CDN Edge     │
           │   US Regions   │ │   EU Regions   │  │   APAC Regions │
           └────────┬───────┘ └────────┬───────┘  └────────┬───────┘
                    │                  │                    │
           ┌────────▼───────┐ ┌────────▼───────┐  ┌────────▼───────┐
           │ us-east-1      │ │ eu-west-1      │  │ ap-southeast-1 │
           │ ┌────────────┐ │ │ ┌────────────┐ │  │ ┌────────────┐ │
           │ │    ALB     │ │ │ │    ALB     │ │  │ │    ALB     │ │
           │ └──────┬─────┘ │ │ └──────┬─────┘ │  │ └──────┬─────┘ │
           │   ┌────┴────┐  │ │   ┌────┴────┐  │  │   ┌────┴────┐  │
           │   ▼         ▼  │ │   ▼         ▼  │  │   ▼         ▼  │
           │ ┌───┐    ┌───┐ │ │ ┌───┐    ┌───┐ │  │ ┌───┐    ┌───┐ │
           │ │API│    │API│ │ │ │API│    │API│ │  │ │API│    │API│ │
           │ │ 1 │    │ 2 │ │ │ │ 1 │    │ 2 │ │  │ │ 1 │    │ 2 │ │
           │ └─┬─┘    └─┬─┘ │ │ └─┬─┘    └─┬─┘ │  │ └─┬─┘    └─┬─┘ │
           │   └────┬────┘  │ │   └────┬────┘  │  │   └────┬────┘  │
           │   ┌────▼────┐  │ │   ┌────▼────┐  │  │   ┌────▼────┐  │
           │   │  Redis   │  │ │   │  Redis   │  │  │   │  Redis   │  │
           │   │  Cluster │  │ │   │  Cluster │  │  │   │  Cluster │  │
           │   └────┬────┘  │ │   └────┬────┘  │  │   └────┬────┘  │
           │   ┌────▼────┐  │ │   ┌────▼────┐  │  │   ┌────▼────┐  │
           │   │  Trie    │  │ │   │  Trie    │  │  │   │  Trie    │  │
           │   │  Service │  │ │   │  Service │  │  │   │  Service │  │
           │   │  Nodes   │  │ │   │  Nodes   │  │  │   │  Nodes   │  │
           │   │ (3x repl)│  │ │   │ (3x repl)│  │  │   │ (3x repl)│  │
           │   └──────────┘  │ │   └──────────┘  │  │   └──────────┘  │
           └─────────────────┘ └─────────────────┘  └─────────────────┘
                    │
           ┌────────▼───────────────────────────────────────────┐
           │              Central Data Pipeline                  │
           │  ┌──────────┐  ┌───────────┐  ┌───────────────┐   │
           │  │  Kafka   │─>│Aggregator │─>│ Trie Builder  │   │
           │  │  Cluster │  │(Flink)    │  │ (Periodic)    │   │
           │  └──────────┘  └───────────┘  └───────┬───────┘   │
           │                                       │            │
           │                               ┌───────▼───────┐   │
           │                               │  Snapshot      │   │
           │                               │  Store (S3)    │   │
           │                               └───────────────┘   │
           └────────────────────────────────────────────────────┘
```

### CDN + Edge Caching Details

```
CDN Caching Rules:

Path Pattern              Cache TTL    Cache Key
──────────────────────────────────────────────────────
/v1/suggestions?*         5 min        locale + prefix
  (popular prefixes)      15 min       (extended for top 1K)
  (long-tail prefixes)    1 min        (shorter for rare queries)

Cache Warmup Strategy:
  - Pre-populate CDN with top 10,000 prefixes per locale
  - On new Trie deployment, warm the CDN for top prefixes
  - Use cache tags for efficient invalidation

CDN Hit Rate Target: 50-60% of all requests
  (Reduces origin traffic by more than half)
```

### Health Checks and Failover

```
Health check hierarchy:

  1. CDN Health Check (every 10s)
     -> If region unhealthy, route to next closest region

  2. ALB Health Check (every 5s)
     -> /health endpoint on API servers
     -> Removes unhealthy instances from rotation

  3. Trie Service Health Check (every 5s)
     -> /ready endpoint checks:
        - Trie loaded in memory? (yes/no)
        - Snapshot age < 2 hours? (yes/no)
        - Memory usage < 90%? (yes/no)

  Failover sequence:
    API server fails   -> ALB routes to healthy server (< 5s)
    Trie node fails    -> API falls back to Redis cache (< 1s)
    Redis fails        -> API returns empty suggestions (graceful degradation)
    Entire region down -> DNS failover to next region (< 60s)
```

---

## 12. Common Interview Follow-ups

### How to Handle Trending / Breaking Queries?

**Problem:** A breaking news event (e.g., earthquake, celebrity news) generates
a surge of new queries that the periodic Trie rebuild hasn't captured yet.

**Solution: Hot query fast path**

```
Detection:
  - Stream processor monitors query velocity
  - If a query's count in the last 5 minutes exceeds 10x its historical average,
    flag it as "trending"

Fast path:
  1. Trending queries are pushed to a small "hot Trie" in real-time
  2. At query time, merge results from base Trie + hot Trie
  3. Hot Trie is rebuilt every 30-60 seconds (it's tiny, < 10K entries)

Scoring boost:
  trending_score = base_score * trending_multiplier
  trending_multiplier = min(5.0, velocity_ratio)
  where velocity_ratio = recent_count / historical_average

Example:
  "earthquake los angeles" -> historical avg: 10/hour -> now: 50,000/hour
  velocity_ratio = 5000 -> trending_multiplier = 5.0
  This query shoots to the top of suggestions for "earthquake" prefix
```

### How to Implement Personalized Suggestions?

```
Data sources for personalization:
  1. User's search history (last 30 days)
  2. User's click history (what they clicked after searching)
  3. User's location (geo-aware suggestions)
  4. User's language preference
  5. Collaborative filtering (users like you searched for X)

Architecture:
  ┌────────────┐     ┌──────────────┐     ┌─────────────────┐
  │ User types │────>│ Global Trie  │────>│ Personalization  │
  │ prefix     │     │ (top-K)      │     │ Ranker           │
  └────────────┘     └──────────────┘     └────────┬────────┘
                                                    │
                                          ┌─────────▼────────┐
                                          │ User Profile     │
                                          │ Store (Redis)    │
                                          │ - recent queries │
                                          │ - click history  │
                                          │ - preferences    │
                                          └──────────────────┘

Blending formula:
  final_score = alpha * global_score + beta * personal_score + gamma * recency_score
  where alpha + beta + gamma = 1.0

  Typical weights:
    alpha = 0.5 (global popularity)
    beta  = 0.3 (personal relevance)
    gamma = 0.2 (recency)

Privacy considerations:
  - Store user profiles with encryption at rest
  - Allow users to opt out of personalization
  - Provide "clear search history" functionality
  - Anonymize data after 90 days
```

### How to Filter Inappropriate Suggestions?

```
Multi-layer filtering:

Layer 1: Static Blocklist
  - Maintained by content moderation team
  - Exact match + regex patterns
  - Updated weekly or on-demand
  - Examples: slurs, explicit content, illegal activities

Layer 2: ML Content Classifier (Offline)
  - Runs during Trie build phase
  - Binary classifier: safe / unsafe
  - Trained on labeled dataset of 100K+ queries
  - Queries with P(unsafe) > 0.8 are excluded from Trie
  - Model retrained monthly

Layer 3: Real-time Safety Check
  - For queries that bypass Layer 1 & 2 (new, unseen queries)
  - Lightweight regex-based check at query time
  - Only applied to hot/trending queries not in the base Trie

Layer 4: Human Review Queue
  - Queries flagged with 0.5 < P(unsafe) < 0.8 go to human review
  - Moderators label as safe/unsafe
  - Decisions feed back into training data

Handling edge cases:
  - Context-dependent queries: "how to kill" -> a process? a game boss? -> Allow but monitor
  - Medical queries: "symptoms of..." -> Allow (legitimate health searches)
  - News events: "shooting in..." -> Allow news-related, block instructional
```

### How to Handle Multi-Language Autocomplete?

```
Strategy: Separate Trie per language + unified routing

Detection:
  - Input method: keyboard layout / IME tells us the language
  - Character detection: Unicode block analysis
    - Latin (U+0041-U+024F) -> likely English / European
    - CJK (U+4E00-U+9FFF)  -> likely Chinese
    - Hangul (U+AC00-U+D7AF) -> Korean
  - User's locale setting (primary signal)
  - Mixed input: pinyin "nihao" could be English or Chinese pinyin

Trie per language:
  trie_en: English queries (ASCII-optimized, 26 children per node)
  trie_zh: Chinese queries (Unicode, potentially thousands of children)
  trie_ja: Japanese queries (hiragana + katakana + kanji)
  trie_ko: Korean queries (jamo-level decomposition)

Chinese-specific: Pinyin support
  User types pinyin "zhongguo" -> suggest "中国" (China)
  Maintain a pinyin-to-hanzi Trie alongside the character Trie

Query routing:
  1. Detect input language from characters typed
  2. Route to appropriate language Trie
  3. For pinyin input, check both English Trie and Pinyin Trie
  4. Merge results with language preference weighting

Cross-language considerations:
  - Brand names: "iPhone" should appear in all language tries
  - Transliteration: "Starbucks" vs "星巴克" vs "スターバックス"
  - Code-switching: "如何 install python" (mixed Chinese + English)
```

### How to Implement "Did You Mean" Suggestions?

```
"Did you mean" corrects a full submitted query, distinct from autocomplete
(which completes a prefix). But the two systems share infrastructure.

Techniques:

1. Precomputed Correction Map (recommended for autocomplete)
   - For top 100K queries, generate common misspellings
   - Use edit distance, keyboard proximity, phonetic similarity
   - Store as hash map: misspelling -> correction

   Example:
     "recpie"    -> "recipe"
     "pythong"   -> "python"
     "amazno"    -> "amazon"
     "youutbe"   -> "youtube"

2. Norvig's Spelling Corrector (lightweight)
   - Generate all strings within edit distance 1-2
   - Check which exist in the query dictionary
   - Rank by frequency

   Pseudocode:
     def correct(word):
         candidates = (
             known([word]) or           # exact match
             known(edits1(word)) or     # edit distance 1
             known(edits2(word)) or     # edit distance 2
             [word]                      # give up
         )
         return max(candidates, key=frequency)

3. Embedding-Based Correction (ML approach)
   - Encode queries into vector embeddings
   - Find nearest neighbors of the mistyped query
   - Return the closest known query as correction
   - Works well for semantic similarity, not just typos

Integration with autocomplete:
  - If prefix has no matches in Trie:
    1. Try spelling correction on the prefix
    2. If correction found, return suggestions for the corrected prefix
    3. Prepend "Did you mean: {corrected}" to the response
```

---

## Summary: Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Core data structure | Trie with precomputed top-K at each node | O(L) lookup, no DFS at query time |
| Trie variant | Compressed (Patricia) Trie | 10x space reduction |
| Update strategy | Periodic snapshot rebuild (15 min) + hot Trie for trending | Balance freshness vs cost |
| Caching | 4-layer (browser, CDN, Redis, in-memory Trie) | Minimize latency at every hop |
| Sharding | Prefix-range partitioning | Simple routing, balanced load |
| Multi-language | Separate Trie per locale | Different charsets and patterns |
| Content filtering | Blocklist + ML classifier (offline) | Safety without query-time latency |
| Personalization | Blend global + personal scores at API layer | Non-invasive, optional layer |

### Latency Breakdown (p50)

```
CDN hit path:        ~10 ms  (CDN edge -> client)
Cache hit path:      ~25 ms  (client -> CDN miss -> API -> Redis hit -> response)
Trie lookup path:    ~35 ms  (client -> CDN miss -> API -> Redis miss -> Trie -> response)
  - Network (client -> LB):  15 ms
  - API processing:           2 ms
  - Trie lookup:            < 1 ms
  - Network (LB -> client):  15 ms
  - Serialization:            2 ms
```

All paths are well within the 100 ms p99 target.
