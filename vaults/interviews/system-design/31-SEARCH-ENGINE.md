# Design a Full-Text Search Engine (Elasticsearch / Solr / Algolia)

## Table of Contents

1. [Requirements Clarification](#1-requirements-clarification)
2. [API Design](#2-api-design)
3. [Data Model](#3-data-model)
4. [High-Level Architecture](#4-high-level-architecture)
5. [Inverted Index](#5-inverted-index)
6. [Text Analysis Pipeline](#6-text-analysis-pipeline)
7. [Indexing Process](#7-indexing-process)
8. [BM25 Scoring](#8-bm25-scoring)
9. [Query Types](#9-query-types)
10. [Faceted Search](#10-faceted-search)
11. [Autocomplete and Suggestions](#11-autocomplete-and-suggestions)
12. [Relevance Tuning](#12-relevance-tuning)
13. [Distributed Search](#13-distributed-search)
14. [Near-Real-Time Search](#14-near-real-time-search)
15. [Index Lifecycle Management](#15-index-lifecycle-management)
16. [Hybrid Search](#16-hybrid-search)
17. [Elasticsearch Cluster Architecture](#17-elasticsearch-cluster-architecture)
18. [Scaling Strategy](#18-scaling-strategy)
19. [Trade-offs](#19-trade-offs)
20. [Comparison: Search Engines](#20-comparison-search-engines)
21. [Common Interview Follow-ups](#21-common-interview-follow-ups)

---

## 1. Requirements Clarification

### Functional Requirements

| #   | Requirement          | Description                                                             |
| --- | -------------------- | ----------------------------------------------------------------------- |
| 1   | Full-Text Search     | Accept user queries and return ranked documents based on text relevance |
| 2   | Document Indexing    | Ingest, parse, analyze, and index documents from multiple sources       |
| 3   | Query Language       | Support term, phrase, bool, fuzzy, wildcard, and range queries          |
| 4   | Faceted Search       | Return aggregated facet counts for drill-down navigation                |
| 5   | Autocomplete         | Prefix-based and edge n-gram suggestions with sub-50ms latency          |
| 6   | Relevance Tuning     | Field boosting, custom scoring functions, business rules injection      |
| 7   | Near-Real-Time (NRT) | Indexed documents become searchable within ~1 second                    |
| 8   | Multi-Tenancy        | Isolated indexes per tenant with per-tenant quotas                      |
| 9   | Highlight & Snippet  | Return matching term highlights and context snippets                    |
| 10  | Synonym Support      | Expand queries using synonym dictionaries at index or query time        |
| 11  | Analytics            | Track query counts, zero-result rates, click-through rates              |
| 12  | Hybrid Search        | Combine keyword (BM25) and vector (kNN) search with result fusion       |

### Non-Functional Requirements

| Requirement      | Target                                             |
| ---------------- | -------------------------------------------------- |
| Search latency   | < 100ms p99 for keyword search                     |
| Indexing latency | < 1 second (NRT) from document write to searchable |
| Availability     | 99.99% (< 52 minutes downtime/year)                |
| Query throughput | 10,000+ queries/sec sustained                      |
| Index throughput | 1,000,000 document updates/hour                    |
| Durability       | Zero data loss; replicated across 3 nodes minimum  |
| Scalability      | Linear horizontal scaling via sharding             |
| Consistency      | Eventual consistency acceptable for search results |

### Scale Estimates

```
Documents:
  Total document corpus:          1 billion documents
  Average document size:          5 KB (uncompressed text + metadata)
  Raw data size:                  1B * 5 KB = 5 TB raw

Index Size:
  Inverted index overhead:        ~10x (posting lists, term dict, norms, doc values)
  Index size for 1B docs:         ~50 TB across the cluster
  Per shard target:               25-50 GB (Elasticsearch recommended)
  Shards needed:                  50 TB / 40 GB avg = ~1,250 shards
  With 1 replica:                 2,500 primary+replica shards total

Query Load:
  Total QPS:                      10,000 queries/sec
  Peak QPS (2x):                  20,000 queries/sec
  Average query fan-out:          5 shards per query
  Shard-level QPS:                10,000 * 5 = 50,000 shard queries/sec

Indexing Load:
  1M updates/hour = ~278 updates/sec average
  Peak burst (10x):               2,780 updates/sec
  Each update: analyze + merge segment + WAL write

Network:
  Average query response size:    10 KB (10 hits with snippets)
  Bandwidth out:                  10,000 * 10 KB = 100 MB/sec query traffic
  Indexing bandwidth in:          2,780 * 5 KB = ~14 MB/sec

Nodes (rough sizing at 64 GB RAM each):
  Data nodes:                     ~100 nodes (50 TB / 500 GB usable per node)
  Master nodes:                   3 dedicated (odd quorum)
  Coordinating nodes:             10 (for query fan-out at 10K QPS)
  Ingest nodes:                   5 (for pipeline processing)
```

### Back-of-Envelope Summary

| Resource           | Estimate                     |
| ------------------ | ---------------------------- |
| Total documents    | 1 billion                    |
| Index storage      | 50 TB                        |
| Query throughput   | 10K QPS (20K peak)           |
| Indexing rate      | 278/sec avg, 2,780/sec burst |
| Data nodes         | ~100 nodes @ 64 GB RAM       |
| p99 search latency | < 100ms                      |
| NRT indexing delay | < 1 second                   |

---

## 2. API Design

### Index a Document

```
POST /indexes/{index_name}/documents
Authorization: Bearer <api_key>
Content-Type: application/json

{
  "id": "doc_a1b2c3",
  "title": "Introduction to Distributed Systems",
  "body": "A distributed system is a collection of computers...",
  "author": "Jane Smith",
  "tags": ["distributed", "systems", "computer-science"],
  "category": "technology",
  "published_at": "2024-01-15T10:00:00Z",
  "view_count": 12345,
  "embedding": [0.123, -0.456, ...]  // optional: for hybrid search
}

Response 201 Created:
{
  "id": "doc_a1b2c3",
  "index": "articles",
  "version": 1,
  "result": "created",
  "shards": { "total": 2, "successful": 2, "failed": 0 }
}
```

### Bulk Index Documents

```
POST /indexes/{index_name}/documents/bulk
Content-Type: application/json

{
  "documents": [
    { "id": "doc_001", "title": "...", "body": "..." },
    { "id": "doc_002", "title": "...", "body": "..." }
  ],
  "refresh": "wait_for"  // "true" | "false" | "wait_for"
}

Response 200 OK:
{
  "took": 42,
  "errors": false,
  "items": [
    { "index": { "_id": "doc_001", "result": "created", "status": 201 } },
    { "index": { "_id": "doc_002", "result": "created", "status": 201 } }
  ]
}
```

### Search Documents

```
POST /indexes/{index_name}/search
Content-Type: application/json

{
  "query": {
    "bool": {
      "must": [
        { "match": { "body": "distributed systems" } }
      ],
      "filter": [
        { "term": { "category": "technology" } },
        { "range": { "published_at": { "gte": "2024-01-01" } } }
      ],
      "should": [
        { "match": { "title": { "query": "distributed systems", "boost": 2.0 } } }
      ]
    }
  },
  "aggs": {
    "by_category": {
      "terms": { "field": "category", "size": 10 }
    },
    "by_author": {
      "terms": { "field": "author.keyword", "size": 5 }
    }
  },
  "highlight": {
    "fields": { "body": { "fragment_size": 150, "number_of_fragments": 3 } }
  },
  "sort": [
    { "_score": "desc" },
    { "published_at": "desc" }
  ],
  "from": 0,
  "size": 10,
  "track_total_hits": true
}

Response 200 OK:
{
  "took": 12,
  "timed_out": false,
  "hits": {
    "total": { "value": 4821, "relation": "eq" },
    "max_score": 8.74,
    "hits": [
      {
        "_id": "doc_a1b2c3",
        "_score": 8.74,
        "_source": {
          "title": "Introduction to Distributed Systems",
          "author": "Jane Smith",
          "category": "technology",
          "published_at": "2024-01-15T10:00:00Z"
        },
        "highlight": {
          "body": [
            "A <em>distributed</em> <em>system</em> is a collection of computers..."
          ]
        }
      }
    ]
  },
  "aggregations": {
    "by_category": {
      "buckets": [
        { "key": "technology", "doc_count": 2341 },
        { "key": "science", "doc_count": 1205 }
      ]
    }
  }
}
```

### Autocomplete / Suggest

```
POST /indexes/{index_name}/suggest
Content-Type: application/json

{
  "prefix": "distrib",
  "field": "title.suggest",
  "size": 5,
  "fuzzy": { "fuzziness": 1 }
}

Response 200 OK:
{
  "suggestions": [
    { "text": "distributed systems", "score": 0.98, "freq": 4821 },
    { "text": "distributed computing", "score": 0.94, "freq": 3102 },
    { "text": "distributed databases", "score": 0.91, "freq": 2567 }
  ]
}
```

### Delete Document

```
DELETE /indexes/{index_name}/documents/{doc_id}

Response 200 OK:
{
  "id": "doc_a1b2c3",
  "index": "articles",
  "result": "deleted",
  "version": 2
}
```

### Get Index Stats

```
GET /indexes/{index_name}/stats

Response 200 OK:
{
  "index": "articles",
  "docs": { "count": 1000000000, "deleted": 12345 },
  "store": { "size_bytes": 52428800000 },
  "indexing": { "index_total": 5000000, "index_time_ms": 14200 },
  "search": { "query_total": 8432000, "query_time_ms": 21043 },
  "shards": { "total": 10, "primary": 5, "replicas": 5 }
}
```

---

## 3. Data Model

### Index Mapping (Schema)

```json
{
  "mappings": {
    "properties": {
      "id": { "type": "keyword" },
      "title": {
        "type": "text",
        "analyzer": "english",
        "fields": {
          "keyword": { "type": "keyword", "ignore_above": 256 },
          "suggest": { "type": "completion" },
          "ngram": { "type": "text", "analyzer": "edge_ngram_analyzer" }
        }
      },
      "body": {
        "type": "text",
        "analyzer": "english",
        "index_options": "offsets",
        "term_vector": "with_positions_offsets"
      },
      "author": {
        "type": "text",
        "fields": {
          "keyword": { "type": "keyword" }
        }
      },
      "tags": { "type": "keyword" },
      "category": { "type": "keyword" },
      "published_at": { "type": "date", "format": "strict_date_time" },
      "view_count": { "type": "long" },
      "embedding": {
        "type": "dense_vector",
        "dims": 768,
        "index": true,
        "similarity": "cosine"
      }
    }
  },
  "settings": {
    "number_of_shards": 5,
    "number_of_replicas": 1,
    "analysis": {
      "analyzer": {
        "edge_ngram_analyzer": {
          "tokenizer": "edge_ngram_tokenizer",
          "filter": ["lowercase"]
        }
      },
      "tokenizer": {
        "edge_ngram_tokenizer": {
          "type": "edge_ngram",
          "min_gram": 2,
          "max_gram": 20,
          "token_chars": ["letter", "digit"]
        }
      }
    },
    "index.refresh_interval": "1s",
    "index.merge.scheduler.max_thread_count": 1
  }
}
```

### Posting List Entry

```
Term: "distributed"

Posting List:
+----------+--------+-------+---------------------+
| doc_id   | tf     | norm  | positions           |
+----------+--------+-------+---------------------+
| doc_001  |  3     | 0.72  | [4, 18, 42]         |
| doc_005  |  1     | 0.85  | [2]                 |
| doc_012  |  7     | 0.61  | [1, 3, 8, 11, ...]  |
| doc_019  |  2     | 0.78  | [6, 22]             |
+----------+--------+-------+---------------------+

Term Dictionary Entry:
{
  "term": "distributed",
  "doc_freq": 48210,      // number of docs containing this term
  "total_tf": 127443,     // sum of term frequency across all docs
  "offset": 4294967296    // byte offset in posting list file
}
```

### Lucene Segment Structure

```
Segment (immutable once written):
+-----------------------------+
|  .tim  - Term Dictionary    |  (FST: terms -> block offsets)
|  .tip  - Term Index         |  (FST index for .tim)
|  .doc  - Postings (docIDs)  |  (delta-encoded, FOR compressed)
|  .pos  - Positions          |  (position data for phrase queries)
|  .pay  - Payloads           |  (offsets for highlighting)
|  .nvd  - Norms              |  (per-field length norms)
|  .dvm  - Doc Values         |  (columnar: sorting, aggregations)
|  .fdt  - Stored Fields      |  (_source document storage)
|  .fdx  - Field Index        |  (offsets into .fdt)
|  .si   - Segment Info       |  (segment metadata)
+-----------------------------+
```

---

## 4. High-Level Architecture

```
+--------------------------------------------------+
|                   Client Layer                   |
|  Web App | Mobile App | Internal Services        |
+--------------------------------------------------+
                         |
                         v
+--------------------------------------------------+
|              Load Balancer / API Gateway         |
|        (rate limiting, auth, routing)            |
+--------------------------------------------------+
           |                          |
           v                          v
+---------------------+    +---------------------+
|  Coordinating Nodes |    |   Ingest Nodes       |
|  (Query Fan-out)    |    |   (Doc Processing)   |
|  10 nodes           |    |   5 nodes            |
+---------------------+    +---------------------+
           |                          |
           v                          v
+--------------------------------------------------+
|            Data Node Cluster (100 nodes)         |
|                                                  |
|  +----------+  +----------+  +----------+        |
|  | Shard P0 |  | Shard P1 |  | Shard P2 |  ...  |
|  | (primary)|  | (primary)|  | (primary)|        |
|  +----------+  +----------+  +----------+        |
|  +----------+  +----------+  +----------+        |
|  | Shard R0 |  | Shard R1 |  | Shard R2 |  ...  |
|  | (replica)|  | (replica)|  | (replica)|        |
|  +----------+  +----------+  +----------+        |
+--------------------------------------------------+
           |
           v
+--------------------------------------------------+
|            Master Node Cluster (3 nodes)         |
|   Cluster state | Shard allocation | Election    |
+--------------------------------------------------+

Supporting Infrastructure:
+------------------+  +------------------+  +------------------+
|   Message Queue  |  |   Object Store   |  |   Config Store   |
|   (Kafka)        |  |   (S3 / MinIO)   |  |   (ZooKeeper /   |
|   Doc ingestion  |  |   Snapshot store |  |    etcd)         |
+------------------+  +------------------+  +------------------+
```

### Write Path (Document Indexing)

```
Document Source
     |
     v
+-------------+     +------------------+     +------------------+
|  Producer   | --> |  Kafka Topic     | --> |  Ingest Node     |
|  (API call  |     |  (doc-updates)   |     |  Pipeline        |
|   or CDC)   |     +------------------+     |  - Enrich        |
+-------------+                              |  - Validate      |
                                             |  - Transform     |
                                             +------------------+
                                                      |
                                                      v
                                             +------------------+
                                             |  Text Analysis   |
                                             |  Pipeline        |
                                             |  (per field)     |
                                             +------------------+
                                                      |
                                                      v
                                             +------------------+
                                             |  Primary Shard   |
                                             |  - Write to WAL  |
                                             |  - Add to buffer |
                                             |  - Refresh ->    |
                                             |    new segment   |
                                             +------------------+
                                                      |
                                                      v
                                             +------------------+
                                             |  Replica Shards  |
                                             |  (parallel write)|
                                             +------------------+
```

### Read Path (Query Execution)

```
Client Query
     |
     v
+------------------+
|  Coordinating    |  1. Parse & validate query
|  Node            |  2. Determine target shards
|                  |  3. Fan out to N shards
+------------------+
     |   (scatter)
     +----------+----------+----------+
     v          v          v          v
 Shard 0    Shard 1    Shard 2    Shard N
  Local       Local       Local       Local
  Search      Search      Search      Search
  Top-K       Top-K       Top-K       Top-K
     |          |          |          |
     +----------+----------+----------+
                   | (gather)
                   v
            +------------------+
            |  Coordinating    |  4. Merge & re-rank top-K
            |  Node            |  5. Fetch _source for top hits
            |                  |  6. Run aggregations
            +------------------+
                   |
                   v
              Response
```

---

## 5. Inverted Index

### Concept and Structure

The inverted index is the core data structure enabling full-text search. Instead of mapping documents to words, it maps words (terms) to the documents containing them.

```
Forward Index (document -> words):
  doc_1: ["the", "quick", "brown", "fox"]
  doc_2: ["the", "lazy", "brown", "dog"]
  doc_3: ["quick", "fox", "jumped", "dog"]

Inverted Index (term -> document list):
  "brown"  -> [doc_1, doc_2]
  "dog"    -> [doc_2, doc_3]
  "fox"    -> [doc_1, doc_3]
  "jumped" -> [doc_3]
  "lazy"   -> [doc_2]
  "quick"  -> [doc_1, doc_3]
  "the"    -> [doc_1, doc_2]
```

### Posting List Detail

Each entry in the posting list stores more than just the document ID:

```
Posting List for "search":

+--------+---------+----------+--------------------+-----------+
| doc_id | term_freq | doc_norm | positions          | offsets   |
+--------+---------+----------+--------------------+-----------+
|   42   |    5    |  0.8165  | [3, 14, 28, 35, 51]| byte pos  |
|  107   |    2    |  0.9129  | [1, 7]             | byte pos  |
|  283   |    1    |  1.0000  | [22]               | byte pos  |
|  501   |    8    |  0.7071  | [2, 5, 9, ...]     | byte pos  |
+--------+---------+----------+--------------------+-----------+

Fields:
  doc_id    : Document identifier (delta-encoded for compression)
  term_freq : Number of times the term appears in the doc (TF)
  doc_norm  : Field-length normalization factor (1/sqrt(num_tokens))
  positions : Token positions within the field (for phrase queries)
  offsets   : Byte offsets of term occurrences (for highlighting)
```

### Posting List Compression

Delta encoding reduces storage significantly:

```
Raw doc IDs:     [100, 103, 110, 115, 120, 145, 200]
Delta encoded:   [100,   3,   7,   5,   5,  25,  55]

Frame of Reference (FOR) encoding:
  Block of 128 doc IDs:
  +-------+--------+--------+--------+--------+
  | bits  | delta0 | delta1 | delta2 | ...    |
  | per N |        |        |        |        |
  +-------+--------+--------+--------+--------+
  (each delta stored in minimum bits needed)

PForDelta: handles outliers separately, rest packed tightly
  -> 4-8x compression ratio over raw 32-bit integers
```

### Term Dictionary (FST)

The term dictionary uses a Finite State Transducer (FST) for O(term_length) lookup:

```
FST for terms: ["cat", "cats", "car", "cars", "bar"]

        +---+
  b --> | b | --> a --> r --> [output: posting offset for "bar"]
  c --> | c | --> a --> r --> [output: posting offset for "car"]
        |   |         |
        |   |         +-> r --> s --> [output: posting offset for "cars"]
        |   |
        |   |     --> a --> t --> [output: posting offset for "cat"]
        |   |               |
        +---+               +-> s --> [output: posting offset for "cats"]

Properties:
  - Immutable once built (matches Lucene's segment immutability)
  - Stored in a single array (compact memory layout)
  - Prefix sharing eliminates redundant storage
  - O(len(term)) lookup time
```

---

## 6. Text Analysis Pipeline

The analysis pipeline transforms raw text into indexable tokens.

### Pipeline Overview

```
Raw Input: "The Quick-Brown Foxes are RUNNING fast!"
               |
               v
     +------------------+
     |    Tokenizer     |  Split on whitespace/punctuation
     +------------------+
               |
               v
     ["The", "Quick", "Brown", "Foxes", "are", "RUNNING", "fast"]
               |
               v
     +------------------+
     |  Lowercase Filter|  Normalize case
     +------------------+
               |
               v
     ["the", "quick", "brown", "foxes", "are", "running", "fast"]
               |
               v
     +------------------+
     | Stop Word Filter |  Remove high-frequency words
     +------------------+  (configurable per language)
               |
               v
     ["quick", "brown", "foxes", "running", "fast"]
               |
               v
     +------------------+
     |  Stemmer/Lemma   |  Reduce to root form
     +------------------+  (Snowball/Porter for English)
               |
               v
     ["quick", "brown", "fox", "run", "fast"]
               |
               v
     +------------------+
     | Synonym Expander |  Expand synonyms (optional)
     +------------------+
               |
               v
     ["quick", "brown", "fox", "run", "fast",
      "rapid", "swift"]          // "fast" -> also index synonyms
               |
               v
     Final Tokens -> Written to Inverted Index
```

### Analyzer Types

```
+-------------------+------------------------------------------+
| Analyzer          | Behavior                                  |
+-------------------+------------------------------------------+
| standard          | Unicode tokenizer + lowercase + stop words|
| english           | Standard + Snowball stemmer (English)     |
| simple            | Whitespace split + lowercase only         |
| whitespace        | Split on whitespace, no other transforms  |
| keyword           | Entire input as single token (no analysis)|
| pattern           | Regex-based tokenization                  |
| fingerprint       | Fingerprint for dedup (sorted unique toks)|
| custom            | Compose any tokenizer + filters           |
+-------------------+------------------------------------------+
```

### Stemming Example

```
Snowball / Porter Stemmer (English):

  "running"   -> "run"
  "runs"      -> "run"
  "runner"    -> "runner"  (not "run" -- Porter keeps this)
  "foxes"     -> "fox"
  "studies"   -> "studi"
  "studying"  -> "studi"
  "beautiful" -> "beauti"
  "beauty"    -> "beauti"

Why stemming matters:
  Query: "running shoes"
  Doc contains: "run track shoes"
  Without stemming: 0 match on "running"
  With stemming:    "running" -> "run" = match!
```

### Synonym Handling

```
Two modes:

1. Index-time synonyms (expand at index):
   "quick, fast, rapid, swift"

   Input: "fast car"
   Indexed tokens: ["fast", "rapid", "swift", "quick", "car"]
   Pros: Simple queries, larger index
   Cons: Must reindex when synonyms change

2. Query-time synonyms (expand at query):
   Input query: "fast car"
   Expanded query: (fast OR rapid OR swift OR quick) AND car
   Pros: Change synonyms without reindex
   Cons: Slightly higher query cost, scoring differences

   Best Practice: Use query-time synonyms for flexibility
```

---

## 7. Indexing Process

### Document Lifecycle

```
1. Document Arrival
   +-----------+
   |  Document |  POST /indexes/articles/documents
   +-----------+
         |
         v
2. Ingest Pipeline
   +-------------------+
   | - Parse JSON      |
   | - Validate schema |
   | - Enrich fields   |
   | - Set timestamps  |
   +-------------------+
         |
         v
3. Routing
   shard = hash(doc._id) % num_primary_shards
   -> Routes to correct primary shard node
         |
         v
4. Write to Primary Shard
   +---------------------------------------------+
   |  a) Append to Translog (WAL) -- fsync       |
   |  b) Add to In-Memory Buffer (IndexWriter)   |
   |  c) Acknowledge to client (after translog)  |
   +---------------------------------------------+
         |
         v
5. Replicate to Replicas
   +-------------------------------+
   | Primary forwards to replicas  |
   | Replicas write translog + buf |
   | Success when all replicas ACK |
   +-------------------------------+
         |
         v
6. Refresh (default every 1 second)
   +----------------------------------------+
   | IndexWriter.flush() -> new Lucene seg  |
   | Segment opened for search (NRT reader) |
   | Document now SEARCHABLE                |
   +----------------------------------------+
         |
         v
7. Flush (translog -> durable)
   +----------------------------------------+
   | Periodic (default 30 min) or size-based|
   | Lucene commit -> fsync all segments    |
   | Translog cleared after commit          |
   +----------------------------------------+
         |
         v
8. Segment Merge (background)
   +----------------------------------------+
   | Small segments merged into larger ones |
   | Deleted docs physically removed        |
   | Reduces segment count -> faster search |
   +----------------------------------------+
```

### Translog (Write-Ahead Log)

```
Translog provides durability between Lucene commits:

  Time:  T0        T1 (refresh)  T2 (flush/commit)
         |              |              |
Translog [op1,op2,op3] [op4,op5]     (truncated)
Segments     seg_1                  seg_1 + seg_2 (committed)
Buffer   [op1,op2,op3]  (empty)    (empty)

On node restart:
  1. Load last Lucene commit point
  2. Replay translog entries since last commit
  3. Node recovers to consistent state
```

### Segment Merging

```
Over time, many small segments accumulate:

Before merge:
  [seg_0: 100 docs] [seg_1: 120 docs] [seg_2: 80 docs]
  [seg_3: 90 docs]  [seg_4: 110 docs]

After merge (TieredMergePolicy):
  [seg_merged: 500 docs]  (deleted docs removed!)

Benefits:
  - Fewer files to open per search
  - Deleted documents physically purged
  - Better compression ratios
  - Improved cache utilization

Merge policy controls:
  - max_merge_at_once: max segments per merge (default 10)
  - segments_per_tier: ideal segments per log tier (default 10)
  - max_merged_segment: do not merge if result > N GB (default 5 GB)
```

---

## 8. BM25 Scoring

### Evolution from TF-IDF

```
TF-IDF (original):
  score(q, d) = sum over terms t: TF(t,d) * IDF(t)

  TF(t,d)  = freq(t,d) / |d|    (raw frequency, no ceiling)
  IDF(t)   = log(N / df(t))     (N = total docs, df = doc freq)

Problems with TF-IDF:
  1. TF grows unboundedly -- a term appearing 100x is scored
     much higher than appearing 10x (diminishing returns ignored)
  2. No separate control over length normalization

BM25 (Okapi BM25) -- solves these:
  score(q, d) = sum over terms t in q:
                  IDF(t) * (TF(t,d) * (k1 + 1))
                           ---------------------------------
                           TF(t,d) + k1 * (1 - b + b * |d|/avgdl)

Where:
  TF(t,d) = term frequency of t in document d
  |d|     = number of tokens in document d
  avgdl   = average document length in the corpus
  k1      = term frequency saturation (default 1.2)
            higher k1 -> TF matters more (slower saturation)
  b       = length normalization (default 0.75)
            b=1 -> full length normalization
            b=0 -> no length normalization
  IDF(t)  = log(1 + (N - df(t) + 0.5) / (df(t) + 0.5))
            (smoothed to avoid zero/negative for common terms)
```

### BM25 Intuition

```
TF Saturation Effect:

  k1=1.2, b=0.75, |d|=avgdl

  tf=1  -> score component = 1 * (2.2) / (1 + 1.2) = ~1.0
  tf=2  -> score component = 2 * (2.2) / (2 + 1.2) = ~1.375
  tf=5  -> score component = 5 * (2.2) / (5 + 1.2) = ~1.77
  tf=10 -> score component = 10 * (2.2) / (10 + 1.2) = ~1.96
  tf=50 -> score component = 50 * (2.2) / (50 + 1.2) = ~2.15
  tf=inf -> approaches k1+1 = 2.2  (saturation ceiling)

Length Normalization Effect:

  short doc (|d| = 50, avgdl = 200):
    denominator factor = 1 - 0.75 + 0.75 * (50/200) = 0.4375
    -> shorter doc boosts term importance (less penalized)

  long doc (|d| = 800, avgdl = 200):
    denominator factor = 1 - 0.75 + 0.75 * (800/200) = 3.25
    -> longer doc penalizes term importance (spread thin)
```

### Parameter Tuning

```
Parameter Tuning Guide:

  k1 (saturation, default 1.2):
  +-------+--------------------------------------------------+
  | Value | Effect                                           |
  +-------+--------------------------------------------------+
  |  0.0  | TF ignored, only IDF matters (binary relevance) |
  |  1.2  | Default: moderate TF influence                  |
  |  2.0  | Higher TF influence (good for longer documents) |
  |  3.0+ | TF dominates (for very specialized corpora)     |
  +-------+--------------------------------------------------+

  b (length normalization, default 0.75):
  +-------+--------------------------------------------------+
  | Value | Effect                                           |
  +-------+--------------------------------------------------+
  |  0.0  | No length normalization                          |
  |  0.75 | Default: moderate normalization                  |
  |  1.0  | Full normalization (penalizes long docs heavily) |
  +-------+--------------------------------------------------+

  Tuning recommendations:
  - Short-field search (titles): k1=0.9, b=0.4
  - Long-form documents (articles): k1=1.5, b=0.75
  - Code search: k1=2.0, b=0.25 (code length varies widely)
  - E-commerce product titles: k1=0.8, b=0.5
```

---

## 9. Query Types

### Term Query (Exact Match)

```json
{ "term": { "category": "technology" } }
// No analysis applied -- match exact keyword value

// Use for: enums, IDs, status fields (mapped as keyword)
```

### Match Query (Full-Text)

```json
{
  "match": {
    "body": {
      "query": "distributed systems",
      "operator": "OR", // OR (default) or AND
      "minimum_should_match": "75%",
      "fuzziness": "AUTO"
    }
  }
}
// Analysis applied to query text
// "distributed systems" -> analyzed -> ["distribut", "system"]
// OR: doc matches if any token present

// AND: doc must contain all tokens
```

### Match Phrase Query

```json
{
  "match_phrase": {
    "body": {
      "query": "distributed systems",
      "slop": 1
    }
  }
}
// Requires tokens to appear in ORDER and ADJACENT
// slop=1 allows 1 intervening token
// "distributed computing systems" matches with slop=1

// Uses position data from posting list
```

### Bool Query (Compound)

```json
{
  "bool": {
    "must": [{ "match": { "body": "search engine" } }],
    "should": [
      { "match": { "title": { "query": "search engine", "boost": 3.0 } } },
      { "term": { "tags": "featured" } }
    ],
    "must_not": [{ "term": { "status": "deleted" } }],
    "filter": [
      { "range": { "published_at": { "gte": "now-30d" } } },
      { "term": { "category": "technology" } }
    ],
    "minimum_should_match": 1
  }
}
// must:     contributes to score, document MUST match
// should:   contributes to score, optional (boosts relevance)
// must_not: document MUST NOT match (no scoring, cached as bitset)

// filter:   document MUST match (NO scoring, cached as bitset)
```

### Fuzzy Query

```json
{
  "fuzzy": {
    "title": {
      "value": "serch",
      "fuzziness": "AUTO", // AUTO: 0 for len<3, 1 for 3-5, 2 for >5
      "prefix_length": 2, // first N chars must match exactly
      "max_expansions": 50 // max candidate terms to consider
    }
  }
}
// Uses Levenshtein distance (edit distance)
// "serch" matches "search" (1 insertion)

// Implemented via Levenshtein automaton on term dictionary
```

### Range Query

```json
{
  "range": {
    "published_at": {
      "gte": "2024-01-01",
      "lte": "2024-12-31",
      "format": "yyyy-MM-dd",
      "time_zone": "+05:30"
    }
  }
}
// Numeric and date fields use BKD tree (Block K-D Tree)

// O(log N) range lookups, efficient for multi-dimensional ranges
```

### Multi-Match Query

```json
{
  "multi_match": {
    "query": "search engine technology",
    "fields": ["title^3", "body^1", "tags^2"],
    "type": "best_fields", // or cross_fields, most_fields, phrase
    "tie_breaker": 0.3
  }
}
// best_fields: score = max(field_score) + tie_breaker * other_scores
// cross_fields: treats all fields as one big field (good for names)

// most_fields:  sum of all field scores (good for multi-analyzer)
```

---

## 10. Faceted Search

### Aggregation Architecture

```
Query with Aggregations:

Client Request
     |
     v
+--------------------+
| Coordinating Node  |
| - Executes query   |
| - Requests partial |
|   agg results      |
+--------------------+
     | scatter
     +--------+--------+--------+
     v        v        v        v
  Shard0   Shard1   Shard2   ShardN
  Local    Local    Local    Local
  Agg      Agg      Agg      Agg
     |        |        |        |
     +--------+--------+--------+
              | gather
              v
     +--------------------+
     | Merge partial aggs |
     | Return final counts|
     +--------------------+

Partial aggregation results from each shard:
  Shard0: { "technology": 412, "science": 301, "sports": 89 }
  Shard1: { "technology": 398, "science": 287, "sports": 102 }
  Shard2: { "technology": 445, "science": 312, "sports": 76 }

Merged: { "technology": 1255, "science": 900, "sports": 267 }
```

### Facet Types

```
Terms Aggregation (categorical facets):
  "aggs": {
    "by_category": {
      "terms": {
        "field": "category",
        "size": 10,
        "order": { "_count": "desc" }
      }
    }
  }
  Result: [{ "key": "tech", "doc_count": 1255 }, ...]

Range Aggregation (numeric facets):
  "aggs": {
    "by_price": {
      "range": {
        "field": "price",
        "ranges": [
          { "to": 10 },
          { "from": 10, "to": 50 },
          { "from": 50, "to": 100 },
          { "from": 100 }
        ]
      }
    }
  }

Date Histogram (time facets):
  "aggs": {
    "by_month": {
      "date_histogram": {
        "field": "published_at",
        "calendar_interval": "month"
      }
    }
  }

Nested Aggregations (drill-down):
  "aggs": {
    "by_category": {
      "terms": { "field": "category" },
      "aggs": {
        "by_author": {
          "terms": { "field": "author.keyword", "size": 3 }
        }
      }
    }
  }
```

### Doc Values for Aggregations

```
Doc Values (columnar storage, opposite of inverted index):

  Inverted index:  term  -> [doc1, doc2, doc5, ...]
  Doc Values:      doc1  -> { category: "tech", price: 29.99 }
                   doc2  -> { category: "sci",  price: 14.99 }

  Stored on disk in column-oriented format (like Parquet):
  +-------+-----------+-------+
  | docID | category  | price |
  +-------+-----------+-------+
  |   1   | "tech"    | 29.99 |
  |   2   | "sci"     | 14.99 |
  |   5   | "tech"    | 49.99 |
  +-------+-----------+-------+

  Benefits:
  - Sequential reads for aggregations (cache friendly)
  - No heap pressure (memory-mapped files)
  - Efficient sorting for sort-by-field queries
  - Used for: terms agg, range agg, sorting, scripting
```

---

## 11. Autocomplete and Suggestions

### Edge N-gram Approach

```
Index-time edge n-gram generation:
  Input: "distributed"
  min_gram=2, max_gram=10

  Tokens indexed:
  "di", "dis", "dist", "distr", "distri", "distrib",
  "distribu", "distribut", "distributi", "distribut..."

Search query "dist" -> matches all docs with "dist" as prefix
  -> works as simple prefix search

Mapping:
  "title": {
    "type": "text",
    "analyzer": "standard",          // for regular search
    "fields": {
      "autocomplete": {
        "type": "text",
        "analyzer": "edge_ngram_analyzer",  // for autocomplete
        "search_analyzer": "standard"       // don't n-gram the query
      }
    }
  }

Query for autocomplete:
  { "match": { "title.autocomplete": "dist" } }
```

### Completion Suggester (FST-based)

```
The completion suggester builds an in-memory FST for O(1) lookup:

  Mapping:
    "title_suggest": {
      "type": "completion",
      "analyzer": "standard",
      "preserve_separators": true,
      "preserve_position_increments": true,
      "max_input_length": 50
    }

  Index-time input:
    {
      "title_suggest": {
        "input": ["Introduction to Distributed Systems",
                  "Distributed Systems",
                  "distributed"],
        "weight": 42           // popularity score
      }
    }

  Query:
    {
      "suggest": {
        "title-suggest": {
          "prefix": "dist",
          "completion": {
            "field": "title_suggest",
            "size": 5,
            "skip_duplicates": true,
            "fuzzy": { "fuzziness": 1 }
          }
        }
      }
    }

  Benefits vs edge n-gram:
  - Entirely in-memory (FST)
  - Extremely fast (< 5ms typically)
  - Supports fuzzy prefix matching
  - Supports context filtering (e.g., by category)
```

### Did-You-Mean Suggestions

```
Spell correction for "no results" or low-recall queries:

  Term Suggester (frequency-based):
    Query: "distrubuted systems"  (typo)
    Suggestion: "distributed systems"

    Algorithm:
    1. For each term in query, find similar terms in dictionary
    2. Rank by edit distance + term frequency in corpus
    3. Generate corrected query

    Config:
    {
      "suggest": {
        "spell-check": {
          "text": "distrubuted systems",
          "term": {
            "field": "body",
            "suggest_mode": "missing",   // or "popular" | "always"
            "sort": "frequency",
            "size": 1
          }
        }
      }
    }

  Phrase Suggester (uses shingle model):
    - Considers word-pair frequencies
    - "apple iphone" corrects "aple iphne" as a phrase
    - Better than per-term correction for multi-word queries
```

---

## 12. Relevance Tuning

### Field Boosting

```
Boost fields at index time (in mapping):
  "title": { "type": "text", "boost": 2.0 }  // title matters more

Boost fields at query time (preferred, no reindex):
  {
    "multi_match": {
      "query": "search engine",
      "fields": ["title^3", "body^1", "tags^2"]
    }
  }

  Effective score for doc d and query term t:
    score(t, "title") * 3.0 + score(t, "body") * 1.0 + score(t,"tags") * 2.0

  Rule of thumb:
    - title/name fields: 2x-5x boost
    - exact-match fields (keyword copy): 5x-10x boost
    - body/description: 1x (baseline)
    - metadata tags: 1.5x-2x
```

### Function Score Query

```json
{
  "function_score": {
    "query": { "match": { "body": "search engine" } },
    "functions": [
      {
        "filter": { "term": { "is_sponsored": true } },
        "weight": 1.5
      },
      {
        "field_value_factor": {
          "field": "view_count",
          "factor": 1.2,
          "modifier": "log1p",
          "missing": 1
        }
      },
      {
        "gauss": {
          "published_at": {
            "origin": "now",
            "scale": "30d",
            "decay": 0.5
          }
        }
      }
    ],
    "score_mode": "multiply",
    "boost_mode": "multiply",
    "max_boost": 10
  }
}
```

### Custom Ranking Signals

```
Combining signals for production relevance:

  final_score = BM25_score
                * freshness_decay(published_at)
                * popularity_factor(log1p(view_count))
                * quality_signal(editorial_score)
                * personalization_factor(user_affinity)

  Freshness decay example:
  +------+-------+-------------+
  | Age  | Scale | Decay factor|
  +------+-------+-------------+
  | 0d   |  --   |    1.0      |
  | 7d   | 30d   |    0.85     |
  | 30d  | 30d   |    0.50     |
  | 90d  | 30d   |    0.12     |
  | 365d | 30d   |    0.001    |
  +------+-------+-------------+

  Popularity factor (log1p normalization):
    view_count=0    -> log1p(0)    = 0.0   -> factor ~0.5 (floor)
    view_count=10   -> log1p(10)   = 2.4
    view_count=100  -> log1p(100)  = 4.6
    view_count=1000 -> log1p(1000) = 6.9
    view_count=10k  -> log1p(10k)  = 9.2
    -> logarithmic prevents viral outliers from dominating
```

---

## 13. Distributed Search

### Shard Allocation Strategy

```
Index creation with 5 primary shards, 1 replica:

  Cluster: 10 data nodes (N0 - N9)

  Primary shards:   P0 P1 P2 P3 P4
  Replica shards:   R0 R1 R2 R3 R4

  Allocation (primary never on same node as its replica):
  +------+------------------+
  | Node | Shards           |
  +------+------------------+
  | N0   | P0, R1           |
  | N1   | P1, R2           |
  | N2   | P2, R3           |
  | N3   | P3, R4           |
  | N4   | P4, R0           |
  | N5   | (spare/other idx)|
  +------+------------------+

  Routing formula:
    shard_id = hash(document._id) % number_of_primary_shards

  Custom routing (e.g., by tenant):
    shard_id = hash(tenant_id) % number_of_primary_shards
    -> All docs for tenant go to same shard (avoids scatter)
    -> Risk: hotspot if one tenant is much larger
```

### Scatter-Gather Pattern

```
Query execution with scatter-gather:

Phase 1: QUERY (scatter)
  +-------------------+
  | Coordinating Node |
  | query_then_fetch  |
  +-------------------+
      |  broadcast to all shards (or routing-selected)
      v
  [Shard0] [Shard1] [Shard2] [Shard3] [Shard4]
     |         |         |         |        |
  Execute    Execute    Execute   Execute  Execute
  local      local      local     local    local
  query      query      query     query    query
     |         |         |         |        |
  Return     Return    Return    Return   Return
  Top-K      Top-K     Top-K     Top-K    Top-K
  (score +   (just     doc IDs   doc IDs  doc IDs
   doc_id)   scores)

Phase 2: FETCH (gather)
  Coordinating node:
  1. Collects all (score, doc_id, shard_id) tuples
  2. Merges and sorts by score globally
  3. Takes top 10 (from + size)
  4. Issues MULTI_GET to shards for full _source of top 10
  5. Returns final response

Efficiency note:
  Only top-K scores cross the network in phase 1
  Only final top-N documents fetched in phase 2
  K >> N (K = from+size per shard, N = final result size)
```

### Coordinating Node

```
Coordinating node responsibilities:

  +------------------------------------------+
  |           Coordinating Node              |
  |                                          |
  |  1. Parse & validate query               |
  |  2. Determine shard routing              |
  |  3. Forward to N shard nodes (scatter)   |
  |  4. Await responses (with timeout)       |
  |  5. Merge partial results (gather)       |
  |  6. Re-rank & paginate                   |
  |  7. Merge aggregation partial results    |
  |  8. Issue fetch requests for _source     |
  |  9. Assemble & return final response     |
  +------------------------------------------+

  Coordinating nodes are stateless:
  - No data, no shards
  - Pure CPU + memory for merge operations
  - Horizontally scalable
  - Behind load balancer

  Resource usage:
  - Memory: holds all K*N_shards score tuples in memory
  - For 1000 shards and size=10, from=0:
    1000 * 10 = 10,000 tuples in memory per query
  - Deep pagination (from=10000, size=10):
    1000 * 10010 = ~10M tuples -- avoid!
    Use search_after (cursor-based pagination) instead
```

---

## 14. Near-Real-Time Search

### Refresh Cycle

```
Timeline of a document's journey to searchability:

T+0ms:    Document indexed (write to in-memory buffer)
           |
           | (document NOT YET searchable)
           |
T+1000ms: REFRESH (default 1s interval)
           |
           | IndexWriter creates new in-memory segment
           | New NRT reader opened over segment
           |
T+1001ms: Document IS NOW SEARCHABLE  (<-- NRT)
           |
           | (translog still holds ops since last commit)
           |
T+30min:  FLUSH (Lucene commit)
           |
           | All segments written to disk durably
           | Translog truncated to new checkpoint
           |
T+varies: MERGE (background)
           |
           | Smaller segments merged into larger ones
           | Deleted docs purged from merged segments

Tuning refresh_interval:
  "1s"    -> NRT search, higher indexing overhead
  "30s"   -> Less overhead, good for bulk indexing
  "-1"    -> Disable (manual refresh only, max throughput)
  "5s"    -> Good balance for many use cases
```

### Lucene Segments Deep Dive

```
Segment Lifecycle:

  RAM Buffer
  +--------------------+
  | in-flight docs     |  <-- new writes go here
  +--------------------+
           | refresh (flush to disk)
           v
  seg_0001 (immutable, NRT-readable)
  seg_0002 (immutable, NRT-readable)
  seg_0003 (immutable, NRT-readable)
     ...
  seg_0020 (immutable, NRT-readable)
           | background merge
           v
  seg_merged_001 (seg_0001 + seg_0002 + seg_0003 merged)

Immutability benefits:
  - No locking required for concurrent reads
  - Safe to read while writing new segments
  - Cache-friendly (OS page cache works perfectly)
  - Simple: no partial writes, no corruption risk

Deletion handling:
  - Deletions stored in .liv (live docs bitset)
  - Segment file NOT modified
  - Deleted docs skipped during search (bitset AND)
  - Physically removed only when segment is merged
```

### Refresh Performance

```
Refresh cost analysis:

  Per refresh operation:
  - Create new FST term dictionary (CPU intensive)
  - Open new file handles for segment
  - Update NRT reader
  - Typical cost: ~10-50ms for small segments

  Impact on indexing throughput:
  +------------------+---------------------+-------------------+
  | refresh_interval | Indexing throughput | Search freshness  |
  +------------------+---------------------+-------------------+
  | 1s (default)     | ~10K docs/sec       | ~1 second         |
  | 5s               | ~30K docs/sec       | ~5 seconds        |
  | 30s              | ~80K docs/sec       | ~30 seconds       |
  | -1 (disabled)    | ~100K+ docs/sec     | Manual only       |
  +------------------+---------------------+-------------------+

  Bulk indexing optimization:
  1. Set refresh_interval = -1 before bulk load
  2. Set number_of_replicas = 0 during load
  3. Bulk index with large batch sizes (5-15 MB per request)
  4. After load: set replicas = 1, trigger manual refresh
  5. 5-10x throughput improvement
```

---

## 15. Index Lifecycle Management

### ILM Tiers

```
Index lifecycle phases for time-series data (logs, events):

  HOT TIER                WARM TIER               COLD TIER
  +------------------+    +------------------+    +------------------+
  | Active indexing  |    | Read-only        |    | Infrequent reads |
  | Fast NVMe SSDs   |    | Regular HDDs     |    | Compressed, S3   |
  | Full replicas    |    | Reduced replicas |    | Searchable snaps |
  | 0-7 days         |    | 7-30 days        |    | 30-90 days       |
  +------------------+    +------------------+    +------------------+
          |                       |                       |
          | Rollover               | Move to warm          | Move to cold
          | when: max_age=1d       | after 7d              | after 30d
          | or max_size=50gb       |                       |
          v                       v                       v
  logs-000001             logs-000001             logs-000001
  logs-000002             (forcemerge 1 seg)      (snapshot + mount)
  logs-000003 (current)   (shrink shards)         (searchable snapshot)

  FROZEN TIER (new):
  +------------------+
  | S3-backed        |
  | On-demand load   |
  | Very slow reads  |
  | 90+ days         |
  +------------------+

  DELETE PHASE:
  After 365 days -> delete index entirely
```

### ILM Policy Example

```json
{
  "policy": {
    "phases": {
      "hot": {
        "min_age": "0ms",
        "actions": {
          "rollover": {
            "max_primary_shard_size": "50gb",
            "max_age": "1d"
          },
          "set_priority": { "priority": 100 }
        }
      },
      "warm": {
        "min_age": "7d",
        "actions": {
          "shrink": { "number_of_shards": 1 },
          "forcemerge": { "max_num_segments": 1 },
          "allocate": {
            "number_of_replicas": 0,
            "require": { "data": "warm" }
          },
          "set_priority": { "priority": 50 }
        }
      },
      "cold": {
        "min_age": "30d",
        "actions": {
          "searchable_snapshot": {
            "snapshot_repository": "s3-backup"
          },
          "set_priority": { "priority": 0 }
        }
      },
      "delete": {
        "min_age": "365d",
        "actions": {
          "delete": {}
        }
      }
    }
  }
}
```

---

## 16. Hybrid Search

### Combining BM25 and Vector Search

```
Two retrieval paradigms:

  BM25 (Keyword):               Vector (kNN):
  - Exact term matching         - Semantic similarity
  - Fast (inverted index)       - Handles synonyms natively
  - No training needed          - Dense embeddings (768-1536 dims)
  - Fails on synonyms           - Expensive (ANN index)
  - Interpretable               - Slow for exact kNN at scale

  Hybrid search combines both:
  final_score = alpha * BM25_score + (1 - alpha) * kNN_score
  or via Reciprocal Rank Fusion (RRF)

Document Indexing for Hybrid:
+------------------+       +------------------+
|  Text Fields     |       |  Embedding Field  |
|  (BM25 indexed)  |       |  (HNSW indexed)   |
+------------------+       +------------------+
| title: "..."     |       | embedding:        |
| body:  "..."     |       |  [0.12, -0.34, ...]|
+------------------+       +------------------+
```

### Vector Index (HNSW)

```
Hierarchical Navigable Small World (HNSW) graph:

  Layer 2 (sparse, long-range links):
    O---O           O---O
    |               |
  Layer 1 (medium density):
    O-O-O-O         O-O-O-O
    |               |
  Layer 0 (dense, all nodes):
    O-O-O-O-O-O-O-O-O-O-O-O

  ANN search:
  1. Enter at top layer, greedy navigate to nearest neighbor
  2. Drop to lower layer, repeat from nearest neighbor
  3. At layer 0, explore ef_search candidate pool
  4. Return top-k nearest by cosine/dot-product similarity

  HNSW Parameters:
  +------------+------------------------------------------+
  | Parameter  | Effect                                   |
  +------------+------------------------------------------+
  | m          | Connections per node (default 16)        |
  |            | Higher m -> better recall, more memory   |
  | ef_construction | Build-time candidate pool (default 100)|
  |            | Higher -> better quality, slower index   |
  | ef_search  | Query-time candidate pool (default 100)  |
  |            | Higher -> better recall, slower query    |
  | num_candidates | k * multiplier for initial retrieval |
  +------------+------------------------------------------+

  Index size: 1B documents * 768 dims * 4 bytes = 3 TB (raw vectors)
              + HNSW graph overhead: ~1.5x = ~4.5 TB
```

### Reciprocal Rank Fusion (RRF)

```
RRF combines ranked lists without score normalization:

  BM25 Results:           kNN Results:
  Rank 1: doc_A (8.74)    Rank 1: doc_C (0.95)
  Rank 2: doc_B (7.21)    Rank 2: doc_A (0.92)
  Rank 3: doc_C (6.88)    Rank 3: doc_D (0.89)
  Rank 4: doc_D (5.91)    Rank 4: doc_B (0.85)

  RRF score for doc d:
    RRF(d) = sum over rankers: 1 / (k + rank(d))
    where k = 60 (constant, reduces impact of top ranks)

  For doc_A:
    RRF(A) = 1/(60+1) + 1/(60+2) = 0.01639 + 0.01613 = 0.03252

  For doc_C:
    RRF(C) = 1/(60+3) + 1/(60+1) = 0.01587 + 0.01639 = 0.03226

  For doc_B:
    RRF(B) = 1/(60+2) + 1/(60+4) = 0.01613 + 0.01563 = 0.03176

  Final ranking: [doc_A, doc_C, doc_B, doc_D, ...]

  Elasticsearch sub_searches API:
  {
    "sub_searches": [
      { "query": { "match": { "body": "fast search" } } },
      { "knn": { "field": "embedding", "query_vector": [...], "k": 100 } }
    ],
    "rank": {
      "rrf": { "rank_constant": 60, "rank_window_size": 100 }
    }
  }
```

---

## 17. Elasticsearch Cluster Architecture

### Node Types

```
+------------------------------------------------------------------+
|                    Elasticsearch Cluster                         |
|                                                                  |
|  +------------------+   +------------------+                    |
|  | Master Node 1    |   | Master Node 2    |  Master Node 3     |
|  | (active master)  |   | (eligible)       |  (eligible)        |
|  | - Cluster state  |   | - Standby        |  - Standby         |
|  | - Shard alloc    |   |                  |                    |
|  | - Index lifecycle|   |                  |                    |
|  +------------------+   +------------------+                    |
|                                                                  |
|  +------------------+   +------------------+   +------------+   |
|  | Data Node (hot)  |   | Data Node (warm) |   | Ingest Node|   |
|  | NVMe SSDs        |   | HDD storage      |   | - Pipelines|   |
|  | Primary shards   |   | Read-only shards |   | - Enrich   |   |
|  | Replica shards   |   | Force-merged     |   | - GeoIP    |   |
|  | ~50 nodes        |   | ~30 nodes        |   | 5 nodes    |   |
|  +------------------+   +------------------+   +------------+   |
|                                                                  |
|  +--------------------+   +--------------------+                |
|  | Coordinating Node  |   | ML Node            |                |
|  | Query fan-out      |   | Model inference    |                |
|  | Agg merging        |   | Anomaly detection  |                |
|  | 10 nodes           |   | 3 nodes            |                |
|  +--------------------+   +--------------------+                |
+------------------------------------------------------------------+

External:
  +------------------+   +------------------+   +------------------+
  |  Load Balancer   |   |  Kibana          |   |  Logstash/       |
  |  (to coord nodes)|   |  (visualization) |   |  Beats/Fluentd   |
  +------------------+   +------------------+   +------------------+
```

### Master Election (Raft-like)

```
Zen2 / Raft-based consensus in Elasticsearch 7+:

  3 master-eligible nodes: M1, M2, M3

  Normal operation:
    M1 (active) <-> M2 (follower) <-> M3 (follower)
    M1 publishes cluster state; M2,M3 acknowledge

  M1 fails:
    M2 and M3 detect heartbeat timeout
    Election: M2 or M3 requests votes
    Quorum = (3/2)+1 = 2 votes needed
    M2 gets votes from M2+M3 -> M2 becomes active master
    Publishes new cluster state (without M1's shards)
    Triggers shard reallocation

  Split-brain prevention:
    Minimum master nodes = (N/2) + 1
    With 3 masters: min = 2
    Two isolated nodes cannot both reach quorum
    One partition loses master -> cluster health: RED
    But data integrity maintained
```

### Shard Recovery

```
Shard recovery scenarios:

1. New primary (node restart):
   +----------+     +----------+
   | Old Node |     | New Node |
   | (failed) |     |          |
   +----------+     +----------+
                          |
   Replica promoted       |  Recover from:
   to primary             |  a) Replica (fast - no network resync)
                          |  b) Snapshot (restore from S3)
                          |  c) Peer recovery (copy from another node)

2. Peer recovery process:
   Source node -> Target node
   Phase 1: Send Lucene segment files (can be large)
   Phase 2: Send translog ops (delta since snapshot)
   Phase 3: Start accepting writes

3. Snapshot-based recovery (preferred for large shards):
   Node fails -> Restore from S3 snapshot
   Replay translog from snapshot point to current
   Much faster than full peer recovery for TB-sized shards
```

---

## 18. Scaling Strategy

### Horizontal Scaling

```
Scaling pattern for growing index:

  Phase 1: 1B docs, 10 primary shards
  +------+------+------+------+------+
  | N0   | N1   | N2   | N3   | N4   |
  | P0R1 | P1R2 | P2R3 | P3R4 | P4R0 |
  +------+------+------+------+------+
  (10 shards on 5 nodes, 2 shards/node)

  Phase 2: 5B docs -- need more shards, but CAN'T re-shard!
  Solution: Create new index with more shards, reindex into it
    OR: Use split/clone API

  Split Index (P -> 2P shards):
    POST /old-index/_split/new-index
    { "settings": { "index.number_of_shards": 20 } }
    Requires: old index must be read-only, divisible shard count

  Alternatively: Cross-Cluster Reindex
    POST /_reindex
    {
      "source": { "index": "articles_v1" },
      "dest":   { "index": "articles_v2" }
    }
    Then use alias to switch traffic atomically:
    POST /_aliases
    { "actions": [
        { "remove": { "index": "articles_v1", "alias": "articles" } },
        { "add":    { "index": "articles_v2", "alias": "articles" } }
    ]}
```

### Query Throughput Scaling

```
10K QPS breakdown:

  Single coordinating node capacity: ~500-1000 QPS (varies)
  Target: 10K QPS -> need 10-20 coordinating nodes

  Load balancer distributes across 10 coord nodes:
  10K QPS / 10 nodes = 1K QPS per coord node

  Each query fans out to 5 shards (avg):
  10K * 5 = 50K shard-level searches/sec

  50K / 100 data nodes = 500 shard searches/sec per node

  Each shard search at p99:
  - BKD tree range filter: 5ms
  - Inverted index scan + BM25: 20ms
  - Doc values aggregation: 15ms
  - Network (coord -> data): 5ms
  Total: ~45ms -> well within 100ms p99 budget

Caching layers:
  +---------------------+---------------------+
  | Request Cache       | Query Cache         |
  | Caches entire       | Caches filter       |
  | aggregation results | bitsets (segments)  |
  | (shard-level)       |                     |
  | TTL: until refresh  | TTL: until segment  |
  |                     |   merge/delete      |
  +---------------------+---------------------+
  Cache warm rate:
    Popular queries: >80% cache hit after warm-up
    Long-tail queries: ~20% cache hit
    Overall: 50-60% cache hit rate -> effective QPS doubled
```

### Indexing Throughput Scaling

```
Target: 1M documents/hour = 278 docs/sec

  Ingest pipeline: 5 ingest nodes
  278 / 5 = ~56 docs/sec per ingest node (trivial)

  Peak burst: 2,780 docs/sec
  Kafka absorbs burst -> smooths input for indexing pipeline

  Primary shard write throughput:
  2,780 / 100 data nodes = 27.8 writes/sec per node
  Each write: translog append + buffer add = ~1-2ms
  Max: 500 writes/sec per shard (practical limit)
  -> Headroom: 27.8 << 500, plenty of capacity

  Bulk indexing optimization:
    Batch size: 5-15 MB per bulk request
    Concurrency: 1-2 parallel bulk threads per shard
    Thread pool: bulk queue = 200, size = cpu_count / 2
```

---

## 19. Trade-offs

| Decision                          | Option A                   | Option B                  | Recommendation                                                    |
| --------------------------------- | -------------------------- | ------------------------- | ----------------------------------------------------------------- |
| Refresh interval                  | 1s (NRT)                   | 30s (high throughput)     | 1s for search apps, 30s for log ingestion                         |
| Shard size                        | Small (5GB)                | Large (50GB)              | 25-50 GB; avoid too-small (overhead) or too-large (slow recovery) |
| Replica count                     | 0 (no HA)                  | 2 (extra read)            | 1 replica for HA; 2 for read-heavy workloads                      |
| Index-time vs query-time analysis | Index-time synonyms        | Query-time synonyms       | Query-time: no reindex needed when vocab changes                  |
| Keyword vs text mapping           | text only                  | text + keyword sub-field  | Multi-field: text for search, keyword for aggs/sort               |
| BM25 vs TF-IDF                    | TF-IDF (simpler)           | BM25 (default since ES5)  | Always BM25; TF-IDF only for legacy compat                        |
| Mapping strict vs dynamic         | dynamic=true               | dynamic=false             | Strict in production; prevent mapping explosion                   |
| Deep pagination                   | from/size                  | search_after (cursor)     | Always search_after for >1000 results                             |
| Aggregation precision             | shard_size=10              | shard_size=1000           | Increase shard_size for accurate counts (vs latency)              |
| Vector search ANN                 | HNSW (fast, less accurate) | Exact kNN (slow, perfect) | HNSW with num_candidates tuning                                   |
| Cross-cluster search              | Single cluster             | CCS (federated)           | CCS for geo-distributed or isolation requirements                 |

### Deep Pagination Problem

```
Problem with from+size pagination:
  from=10000, size=10

  Each shard returns top 10,010 results
  100 shards * 10,010 = 1,001,000 score tuples in memory
  at coordinating node -> OOM risk!

  Elasticsearch protection:
    index.max_result_window = 10000 (default)
    Requests beyond this fail with ResultWindowTooLarge error

Solution: search_after (cursor pagination)
  Page 1: sort by [_score, _id]
  Page 2: { "search_after": [8.74, "doc_a1b2c3"] }
  -> Stateless, no memory explosion
  -> BUT: cannot jump to arbitrary page (linear scan only)

For jump-to-page: Pre-compute page boundaries with scroll
  (scroll API deprecated in ES 8 -> use PIT + search_after)
```

---

## 20. Comparison: Search Engines

| Feature               | Elasticsearch                       | Apache Solr                | Algolia                                 | Typesense               | Meilisearch               |
| --------------------- | ----------------------------------- | -------------------------- | --------------------------------------- | ----------------------- | ------------------------- |
| **License**           | Elastic License 2.0 (SSPL for old)  | Apache 2.0                 | Proprietary SaaS                        | GPL-3.0 / Cloud         | MIT (self-host)           |
| **Primary Use**       | General purpose, logs, APM          | Enterprise search, faceted | Developer-friendly SaaS search          | Open-source Algolia alt | Open-source, ease of use  |
| **Query Language**    | Query DSL (JSON)                    | Solr Query Syntax, JSON    | Custom JSON API                         | Custom JSON             | Simple JSON               |
| **Scalability**       | Excellent (PB-scale)                | Good (TB-scale)            | Managed / auto                          | Good (10s TB)           | Moderate (single TB)      |
| **Distributed**       | Native (shards+replicas)            | SolrCloud                  | Managed                                 | Native                  | Limited                   |
| **Relevance Default** | BM25 (tunable)                      | BM25 (tunable)             | Proprietary (typo, geo, business rules) | BM25 + typo-tolerance   | BM25 + typo-tolerance     |
| **Faceted Search**    | Excellent (aggregations)            | Excellent                  | Good                                    | Good                    | Good                      |
| **Geo Search**        | Excellent                           | Good                       | Excellent                               | Good                    | Basic                     |
| **Analytics**         | Kibana, X-Pack                      | Native + Solr Admin        | Built-in (click analytics)              | Basic                   | Basic                     |
| **Vector/Hybrid**     | Yes (kNN + RRF)                     | Yes (KNN)                  | No (only keyword)                       | Yes (hybrid)            | No                        |
| **Schema**            | Semi-schemaless (dynamic mapping)   | Schema-required            | Schemaless                              | Schema optional         | Schemaless                |
| **Hosting**           | Self-host or Elastic Cloud          | Self-host or Managed       | SaaS only                               | Self-host or Cloud      | Self-host or Cloud        |
| **Setup Complexity**  | High                                | High                       | Low (API key + JSON)                    | Medium                  | Very low                  |
| **Search Latency**    | 10-100ms                            | 20-200ms                   | < 50ms (SLA)                            | < 50ms                  | < 50ms                    |
| **Indexing Speed**    | Very fast (bulk API)                | Fast                       | Fast                                    | Fast                    | Fast                      |
| **Best For**          | Enterprise full-text, observability | Enterprise Java apps       | Startup/SaaS instant search             | Self-hosted Algolia     | Simple self-hosted search |

### When to Choose What

```
Use Elasticsearch when:
  - Need massive scale (billions of documents)
  - Complex aggregations and analytics (APM, logs, metrics)
  - Hybrid search (BM25 + vector)
  - Custom relevance tuning with full control
  - Part of ELK/Elastic stack

Use Solr when:
  - Existing Java/Spring ecosystem
  - Strong faceted search requirements
  - Prefer Apache-licensed software
  - Need XML/Solr query syntax compatibility

Use Algolia when:
  - Fast time-to-market is priority
  - Managed service preferred
  - Instant search (< 50ms SLA)
  - Built-in analytics and A/B testing
  - Budget allows SaaS pricing

Use Typesense when:
  - Open-source Algolia alternative
  - Typo tolerance out of the box
  - Simpler ops than Elasticsearch
  - Moderate scale (< 100M documents)

Use Meilisearch when:
  - Self-hosted, developer-friendly
  - Small to medium scale
  - Rapid prototyping
  - Minimal configuration needed
```

---

## 21. Common Interview Follow-ups

**Q: How does Elasticsearch prevent data loss during a node failure?**

A: Elasticsearch uses a combination of mechanisms. The translog (write-ahead log) durably records every operation before acknowledging to the client. After a crash, on restart the node replays the translog on top of the last Lucene commit point, recovering all operations since the last flush. Additionally, primary shards are always co-located with at least one replica on a different node; if the primary fails, a replica is immediately promoted to primary, and the cluster continues serving writes and reads without data loss.

**Q: How do you handle the relevance scoring inconsistency across shards (shard statistics problem)?**

A: BM25 IDF is computed per-shard, not globally. This means a rare term might have different IDF values on different shards, causing inconsistent scoring. Solutions: (1) Use `search_type=dfs_query_then_fetch` to pre-collect global term statistics before scoring (adds one round-trip, ~20% latency overhead). (2) Use a single shard for small indexes where global stats don't vary much. (3) Index enough data per shard so IDF approximates global IDF (law of large numbers). In practice, for indexes with >1M documents per shard, the shard-local IDF is close enough to global IDF that inconsistency is negligible.

**Q: How would you design autocomplete for a search box that handles 100K QPS?**

A: The completion suggester uses an in-memory FST per shard, giving O(prefix_length) lookup with no disk I/O. For 100K QPS: (1) Use prefix caching at the application tier (Redis) for the most common prefixes (top 1000 prefix patterns cover ~80% of traffic). (2) Route autocomplete queries to a dedicated index with completion fields only (smaller memory footprint, better cache locality). (3) Pre-warm FST on shard allocation. (4) Use client-side debouncing (150-200ms) to reduce actual QPS by ~5-10x. Combined, actual Elasticsearch QPS drops to 10-20K, easily handled by 5-10 data nodes.

**Q: How do you keep the index fresh without impacting search performance during a bulk reindex?**

A: Use the zero-downtime reindex pattern: (1) Create a new index (`articles_v2`) with improved mapping. (2) Use the Reindex API to copy documents from `articles_v1` to `articles_v2` (runs in background, does not affect live traffic). (3) While reindexing, any new writes go to `articles_v1` via the existing alias. (4) After reindex completes, identify the cutoff point (timestamp) and reindex the delta (documents written after reindex started). (5) Atomically switch the alias from `articles_v1` to `articles_v2` using the `_aliases` API. (6) Keep `articles_v1` briefly as fallback. Zero downtime, zero search disruption.

**Q: How does segment merging work and why does it matter for performance?**

A: Lucene writes new segments frequently (one per refresh, every 1 second). Each segment is a self-contained mini-index with its own term dictionary, posting lists, and doc values. Query execution must search ALL segments and merge results; more segments = more files to open + more partial results to merge. Merging consolidates small segments into large ones using the TieredMergePolicy. It also physically deletes "deleted" documents (previously just masked by a .liv bitset). Post-merge, queries read fewer, larger segments = better cache utilization, fewer file handles, faster aggregations. The merge scheduler (`ConcurrentMergeScheduler`) runs in the background on separate threads to minimize impact on indexing throughput.

**Q: How would you implement field-level security (FLS) so different users see different fields?**

A: Two approaches: (1) Application-level: store documents with all fields but filter fields from the `_source` response in your application layer based on user roles (simple but fields still indexed). (2) Elasticsearch X-Pack field-level security: define role mappings that restrict which fields users can read/query. Works at the shard level, fields are excluded before leaving the data node. (3) Index-level isolation (most secure): create separate indexes per security domain, route users to their authorized indexes. This provides true isolation but increases operational complexity (N times more indexes to manage). For most cases, X-Pack FLS provides the right balance of security and manageability.

**Q: How do you tune search relevance when users complain about irrelevant results?**

A: A systematic relevance tuning workflow: (1) Collect query-document pairs with explicit relevance judgments (A/B testing clicks as implicit feedback, or hire editors for explicit ratings). (2) Compute NDCG (Normalized Discounted Cumulative Gain) or MAP (Mean Average Precision) as your offline metric. (3) Use the Ranking Evaluation API (`_rank_eval`) to score current ranking against your judgment set. (4) Apply changes: field boost tuning, BM25 parameter tuning (k1/b), function score (freshness, popularity), synonym expansion, custom analyzer tweaks. (5) Measure NDCG improvement before deploying. (6) A/B test in production with a holdout group. Common quick wins: boost title over body (3-5x), add exact-match sub-field boost (10x), apply freshness decay, expand synonyms for zero-result queries.

**Q: What happens when the master node goes down?**

A: With 3 master-eligible nodes, the remaining 2 form a quorum (majority of 3 is 2) and elect a new master within seconds (typically 1-10 seconds in Zen2/Raft). During this window: (1) Existing search requests continue being served by data nodes (they don't need the master for queries). (2) New index operations are buffered or fail depending on `wait_for_active_shards` settings. (3) Shard allocation pauses until a new master is elected. (4) After election, the new master reconciles cluster state and resumes normal operation. The cluster never becomes completely unavailable for reads during master election; only writes and cluster state changes are paused.
