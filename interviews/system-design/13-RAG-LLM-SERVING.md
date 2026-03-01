# Design a RAG Pipeline & LLM Serving System

## 1. Requirements Clarification

### Functional Requirements

| Requirement | Description |
|---|---|
| Document Ingestion | Upload and process documents (PDF, HTML, Markdown, DOCX) |
| Chunking & Embedding | Split documents into chunks, generate vector embeddings |
| Vector Storage | Store embeddings in a vector database for fast retrieval |
| Semantic Retrieval | Retrieve relevant context given a user query |
| Answer Generation | Generate grounded answers using an LLM with retrieved context |
| Multi-turn Conversation | Maintain conversational context across turns |
| Citation Tracking | Attribute generated answers to source documents and passages |
| Feedback Collection | Collect user ratings (thumbs up/down) for continuous improvement |

### Non-Functional Requirements

| Requirement | Target |
|---|---|
| End-to-end latency | < 2 seconds (time to first token < 500ms) |
| Document scale | 10 million documents indexed |
| Query throughput | 100K queries/day (~1.2 QPS average, 10 QPS peak) |
| Availability | 99.9% uptime |
| Freshness | New documents searchable within 15 minutes |
| Cost efficiency | < $0.02 per query average |
| Accuracy | < 5% hallucination rate on factual queries |

### Scale Estimation

```
Documents:           10M documents
Avg document length: 5 pages ~ 2,500 words ~ 3,500 tokens
Avg chunks/doc:      ~10 chunks (at 256 tokens per chunk)
Total chunks:        100M chunks

Embedding dimensions: 1536 (OpenAI ada-002) or 768 (open-source)
Storage per chunk:
  - Vector:    1536 dims * 4 bytes = 6.1 KB
  - Metadata:  ~0.5 KB
  - Text:      ~1 KB
  - Total:     ~7.6 KB per chunk

Total vector storage: 100M * 6.1 KB = ~610 GB (vectors only)
Total storage:        100M * 7.6 KB = ~760 GB (with metadata + text)

Queries/day:         100K
Tokens per query:    ~2,000 (prompt + context + response)
Total tokens/day:    200M tokens
Monthly token cost:  200M * 30 * $0.003/1K = ~$18,000 (GPT-4 class)
                     200M * 30 * $0.00015/1K = ~$900 (GPT-4o-mini class)

Embedding cost (one-time ingestion):
  100M chunks * 256 tokens * $0.0001/1K = ~$2,560

GPU inference (self-hosted):
  ~4 A100 GPUs for 10 QPS with 70B model
  Cost: 4 * $2/hr = $8/hr = ~$5,760/month
```

---

## 2. RAG Architecture Overview

### What is RAG?

Retrieval-Augmented Generation (RAG) is a technique that enhances Large Language Model
(LLM) responses by retrieving relevant information from an external knowledge base before
generating an answer. Instead of relying solely on the model's parametric knowledge (training
data), RAG grounds responses in specific, up-to-date documents.

**Why RAG matters:**
- Reduces hallucinations by providing factual grounding
- Enables domain-specific answers without fine-tuning
- Knowledge can be updated without retraining the model
- Provides verifiable citations to source material
- More cost-effective than fine-tuning for most use cases

### RAG vs Fine-Tuning vs Prompt Engineering

```
+---------------------+------------------+------------------+------------------+
| Dimension           | Prompt Eng.      | RAG              | Fine-Tuning      |
+---------------------+------------------+------------------+------------------+
| Knowledge update    | Manual           | Real-time        | Requires retrain |
| Cost                | Low              | Medium           | High             |
| Implementation time | Hours            | Days             | Weeks            |
| Hallucination ctrl  | Limited          | Strong           | Moderate         |
| Domain adaptation   | Surface-level    | Deep (retrieval) | Deep (weights)   |
| Latency             | Fastest          | +200-500ms       | Same as base     |
| Data privacy        | N/A              | Full control     | Shared w/ vendor |
| Maintenance         | Low              | Medium           | High             |
| Best for            | Simple tasks     | Knowledge-heavy  | Style/behavior   |
+---------------------+------------------+------------------+------------------+
```

**When to use each:**
- **Prompt Engineering**: Simple tasks, formatting, persona control
- **RAG**: Enterprise knowledge bases, documentation Q&A, customer support
- **Fine-Tuning**: Custom tone/style, specialized reasoning, task-specific behavior
- **RAG + Fine-Tuning**: Best of both worlds for complex production systems

### RAG Evolution: Naive vs Advanced vs Modular

```
+-------------------+----------------------------------+---------------------------+
| Naive RAG         | Advanced RAG                     | Modular RAG               |
+-------------------+----------------------------------+---------------------------+
| Simple retrieve   | Pre-retrieval optimization       | Pluggable components      |
|   + generate      | (query rewriting, HyDE)          | (swap any module)         |
|                   |                                  |                           |
| Fixed chunking    | Smart chunking                   | Adaptive chunking         |
|                   | (semantic, parent-child)         | (per-document type)       |
|                   |                                  |                           |
| Single retrieval  | Multi-step retrieval             | Routing between           |
|                   | (retrieve -> rerank -> filter)   | retrieval strategies      |
|                   |                                  |                           |
| No evaluation     | Built-in evaluation              | Feedback loops +          |
|                   | (RAGAS, faithfulness)            | self-improving pipeline   |
|                   |                                  |                           |
| Problems:         | Improvements:                    | Architecture:             |
| - Low relevance   | - Query transformation           | - Agent-based routing     |
| - Hallucinations  | - Hybrid search (dense+sparse)   | - Multi-index strategies  |
| - No citations    | - Cross-encoder reranking        | - Iterative retrieval     |
+-------------------+----------------------------------+---------------------------+
```

### Complete RAG Pipeline (ASCII Diagram)

```
                        INGESTION PIPELINE (Offline/Async)
  +---------------------------------------------------------------------------+
  |                                                                           |
  |   +----------+    +-----------+    +-----------+    +----------------+    |
  |   | Documents |-->| Parser &  |--->| Chunking  |--->| Embedding      |    |
  |   | (PDF,HTML |   | Cleaner   |    | Engine    |    | Model          |    |
  |   |  MD,DOCX) |   +-----------+    +-----------+    +-------+--------+    |
  |   +----------+         |                |                   |             |
  |                        v                v                   v             |
  |                  +----------+    +------------+    +----------------+     |
  |                  | Metadata |    | Chunk Store|    | Vector DB      |     |
  |                  | Store    |    | (text+meta)|    | (embeddings)   |     |
  |                  +----------+    +------------+    +----------------+     |
  +---------------------------------------------------------------------------+

                         QUERY PIPELINE (Online/Sync)
  +---------------------------------------------------------------------------+
  |                                                                           |
  |   +-------+    +----------+    +----------+    +-----------+              |
  |   | User  |--->| Query    |--->| Embedding|--->| Vector    |              |
  |   | Query |    | Rewriter |    | Model    |    | Search    |              |
  |   +-------+    +----------+    +----------+    +-----+-----+             |
  |                                                      |                   |
  |                                                      v                   |
  |   +----------+    +-----------+    +-----------+    +----------+         |
  |   | Response |<---| LLM       |<---| Context   |<---| Reranker |         |
  |   | + Cites  |    | Generator |    | Assembler |    |          |         |
  |   +----------+    +-----------+    +-----------+    +----------+         |
  +---------------------------------------------------------------------------+
```

---

## 3. Document Ingestion Pipeline

### Document Parsing

Different document types require specialized parsers:

```
+-------------+---------------------------+----------------------------+
| Format      | Parser/Tool               | Considerations             |
+-------------+---------------------------+----------------------------+
| PDF         | PyMuPDF, pdfplumber,      | Tables, images, multi-col  |
|             | Unstructured, LlamaParse  | layouts need special care  |
| HTML        | BeautifulSoup, Trafilatura| Strip boilerplate, keep    |
|             |                           | semantic structure          |
| Markdown    | markdown-it, remark       | Preserve headers, code     |
|             |                           | blocks, lists              |
| DOCX        | python-docx, Unstructured | Handle styles, tables,     |
|             |                           | embedded images            |
| CSV/Excel   | pandas, openpyxl          | Row-level or table-level   |
|             |                           | chunking                   |
| Code        | tree-sitter, AST parsers  | Function/class level       |
|             |                           | semantic boundaries        |
+-------------+---------------------------+----------------------------+
```

**Document Parsing Pseudocode:**

```python
def parse_document(file_path: str, file_type: str) -> ParsedDocument:
    parser = get_parser(file_type)  # factory pattern

    raw_content = parser.extract_text(file_path)

    metadata = {
        "source": file_path,
        "file_type": file_type,
        "title": parser.extract_title(file_path),
        "author": parser.extract_author(file_path),
        "created_at": parser.extract_date(file_path),
        "page_count": parser.get_page_count(file_path),
        "word_count": len(raw_content.split()),
    }

    # Structured extraction preserves sections, headers, tables
    sections = parser.extract_sections(file_path)

    return ParsedDocument(
        content=raw_content,
        sections=sections,
        metadata=metadata
    )
```

### Chunking Strategies Deep Dive

Chunking is the most critical step in RAG quality. Poor chunking leads to poor retrieval.

#### 1. Fixed-Size Chunking

```
Document: [===========================================================]

Chunks:   [==========] [==========] [==========] [==========] [======]
           500 tokens   500 tokens   500 tokens   500 tokens   remainder

With overlap (50 tokens):
          [==========]
               [==========]
                    [==========]
                         [==========]
```

```python
def fixed_size_chunk(text: str, chunk_size: int = 500, overlap: int = 50) -> list[str]:
    tokens = tokenize(text)
    chunks = []
    start = 0
    while start < len(tokens):
        end = min(start + chunk_size, len(tokens))
        chunks.append(detokenize(tokens[start:end]))
        start += chunk_size - overlap
    return chunks
```

#### 2. Semantic Chunking

Split at natural boundaries (sentences, paragraphs) while respecting a size limit.

```
Document: [Para 1.............] [Para 2.....] [Para 3..................]

Chunks:   [Para 1.............] [Para 2..... | Para 3..................]
          (fits in limit)       (merged to fill chunk size)
```

```python
def semantic_chunk(text: str, max_tokens: int = 512) -> list[str]:
    paragraphs = text.split("\n\n")
    chunks = []
    current_chunk = []
    current_size = 0

    for para in paragraphs:
        para_tokens = count_tokens(para)
        if current_size + para_tokens > max_tokens and current_chunk:
            chunks.append("\n\n".join(current_chunk))
            current_chunk = []
            current_size = 0
        current_chunk.append(para)
        current_size += para_tokens

    if current_chunk:
        chunks.append("\n\n".join(current_chunk))
    return chunks
```

#### 3. Recursive Character Text Splitting (LangChain approach)

```
Attempt split by: ["\n\n", "\n", ". ", " ", ""]
                   paragraphs -> lines -> sentences -> words -> chars

If chunk > max_size:
  Try splitting by first separator
  If still too large, try next separator
  Recursively split until all chunks fit
```

#### 4. Parent-Child Chunking (Small-to-Big)

This is a powerful advanced technique: use small chunks for precise retrieval,
but return the larger parent chunk as context to the LLM.

```
Document Section (Parent - 2000 tokens):
+-----------------------------------------------------------------------+
| "Machine learning is a subset of AI that enables systems to learn     |
|  from data. There are three main types: supervised, unsupervised,     |
|  and reinforcement learning..."                                        |
+-----------------------------------------------------------------------+
        |                    |                    |
        v                    v                    v
  +------------+      +------------+      +------------+
  | Child 1    |      | Child 2    |      | Child 3    |
  | 256 tokens |      | 256 tokens |      | 256 tokens |
  | "ML is a   |      | "supervised|      | "reinforce-|
  |  subset..." |      |  learning."|      |  ment..."  |
  +------------+      +------------+      +------------+
  (indexed for         (indexed for        (indexed for
   retrieval)           retrieval)          retrieval)

Query: "What is supervised learning?"
  -> Matches Child 2 (precise match)
  -> Returns Parent chunk (full context) to LLM
```

```python
def parent_child_chunk(document: str) -> tuple[list[str], list[str]]:
    # Create large parent chunks
    parent_chunks = semantic_chunk(document, max_tokens=2000)

    child_chunks = []
    child_to_parent = {}

    for parent_idx, parent in enumerate(parent_chunks):
        # Create small child chunks from each parent
        children = fixed_size_chunk(parent, chunk_size=256, overlap=32)
        for child in children:
            child_idx = len(child_chunks)
            child_chunks.append(child)
            child_to_parent[child_idx] = parent_idx

    return parent_chunks, child_chunks, child_to_parent
```

#### 5. Sliding Window with Overlap

```
Window size: 512 tokens, Stride: 384 tokens (overlap = 128)

Position:  0        384       768      1152      1536
           |---------|---------|---------|---------|
Chunk 1:   [========512========]
Chunk 2:            [========512========]
Chunk 3:                      [========512========]
Chunk 4:                                [========512========]

Overlap ensures no information falls between chunk boundaries.
```

#### Chunking Strategy Comparison

```
+-------------------+------------+----------+-----------+------------------+
| Strategy          | Retrieval  | Context  | Implement | Best For         |
|                   | Precision  | Quality  | Effort    |                  |
+-------------------+------------+----------+-----------+------------------+
| Fixed-size        | Low-Med    | Low      | Trivial   | Quick prototype  |
| Semantic          | Medium     | Medium   | Low       | General docs     |
| Recursive split   | Medium     | Medium   | Low       | Mixed content    |
| Parent-child      | High       | High     | Medium    | Production RAG   |
| Sliding window    | Med-High   | Medium   | Low       | Dense technical  |
| Agentic (LLM)    | Highest    | Highest  | High      | High-value docs  |
+-------------------+------------+----------+-----------+------------------+
```

**Recommendation for production:** Parent-child chunking with semantic boundaries gives the
best balance of retrieval precision and context quality.

### Metadata Extraction and Enrichment

```python
def enrich_chunk(chunk: str, document_metadata: dict, chunk_idx: int) -> dict:
    return {
        "chunk_id": generate_uuid(),
        "document_id": document_metadata["document_id"],
        "text": chunk,
        "chunk_index": chunk_idx,

        # Document-level metadata
        "source": document_metadata["source"],
        "title": document_metadata["title"],
        "author": document_metadata["author"],
        "created_at": document_metadata["created_at"],
        "category": document_metadata["category"],

        # Chunk-level metadata (auto-extracted)
        "section_header": extract_nearest_header(chunk),
        "token_count": count_tokens(chunk),
        "has_code": contains_code_block(chunk),
        "has_table": contains_table(chunk),
        "language": detect_language(chunk),

        # For filtering in retrieval
        "department": document_metadata.get("department"),
        "access_level": document_metadata.get("access_level", "public"),
    }
```

### Ingestion Pipeline Architecture

```
                    Document Ingestion Pipeline

  +--------+     +----------------+     +------------------+
  | Upload |     | Message Queue  |     | Worker Pool      |
  | API    |---->| (SQS/Kafka)   |---->| (Auto-scaled)    |
  +--------+     +----------------+     +--------+---------+
                                                 |
                          +----------------------+---------------------+
                          |                      |                     |
                          v                      v                     v
                   +------------+        +-------------+       +------------+
                   | Parser     |        | Chunker     |       | Embedder   |
                   | Service    |------->| Service     |------>| Service    |
                   +------------+        +-------------+       +------+-----+
                                                                      |
                                               +----------------------+
                                               |                      |
                                               v                      v
                                        +------------+        +------------+
                                        | Chunk      |        | Vector     |
                                        | Store (PG) |        | DB         |
                                        +------------+        +------------+

  Monitoring: Track ingestion rate, error rate, embedding latency, queue depth
```

---

## 4. Embedding & Vector Storage

### Embedding Models Comparison

```
+--------------------+------+--------+----------+---------+------------------+
| Model              | Dims | MTEB   | Speed    | Cost    | Notes            |
|                    |      | Score  |          |         |                  |
+--------------------+------+--------+----------+---------+------------------+
| OpenAI text-       | 1536 | 61.0   | Fast     | $0.0001 | Most popular,    |
| embedding-3-small  |      |        | (API)    | /1K tok | good baseline    |
+--------------------+------+--------+----------+---------+------------------+
| OpenAI text-       | 3072 | 64.6   | Fast     | $0.00013| Higher quality,  |
| embedding-3-large  |      |        | (API)    | /1K tok | supports MRL     |
+--------------------+------+--------+----------+---------+------------------+
| Cohere embed-v3    | 1024 | 64.5   | Fast     | $0.0001 | Good multilingual|
|                    |      |        | (API)    | /1K tok | support          |
+--------------------+------+--------+----------+---------+------------------+
| Voyage-3           | 1024 | 67.1   | Fast     | $0.00006| Code + text,     |
|                    |      |        | (API)    | /1K tok | cost-effective   |
+--------------------+------+--------+----------+---------+------------------+
| BGE-large-en-v1.5  | 1024 | 64.2   | Medium   | Free    | Open-source,     |
| (BAAI)             |      |        | (GPU)    | (GPU$)  | self-hosted      |
+--------------------+------+--------+----------+---------+------------------+
| GTE-Qwen2-7B       | 3584 | 70.2   | Slow     | Free    | SOTA open-source |
| (Alibaba)          |      |        | (GPU)    | (GPU$)  | needs big GPU    |
+--------------------+------+--------+----------+---------+------------------+
| NV-Embed-v2        | 4096 | 72.3   | Slow     | Free    | NVIDIA, top MTEB |
| (NVIDIA)           |      |        | (GPU)    | (GPU$)  | as of late 2024  |
+--------------------+------+--------+----------+---------+------------------+
| all-MiniLM-L6-v2   | 384  | 56.3   | Fastest  | Free    | Lightweight,     |
| (sentence-transf.) |      |        | (CPU OK) | (CPU$)  | good for MVP     |
+--------------------+------+--------+----------+---------+------------------+
```

### Embedding Dimensions Trade-offs

```
Dimension       384         768        1024        1536        3072+
                 |           |           |           |           |
Quality     Low-Med     Medium      Med-High      High      Highest
Storage     1.5 KB      3.0 KB      4.0 KB       6.1 KB     12.3 KB
Search      Fastest     Fast        Medium        Slower     Slowest
Speed
RAM for     ~36 GB      ~72 GB      ~96 GB       ~144 GB    ~288 GB+
100M vecs
                 |           |           |           |           |
Best for    Prototype   Balanced    Production    Enterprise  Research
            Low-cost    General     High-quality  Max-quality Benchmarks
```

**Matryoshka Representation Learning (MRL):** Modern models like OpenAI text-embedding-3
support truncating embeddings to fewer dimensions (e.g., 1536 -> 512) with graceful quality
degradation. This enables a "try small first, upgrade if needed" approach.

### Vector Database Options

```
+-------------+-----------+--------+--------+-----------+--------------------+
| Database    | Type      | Scale  | Cost   | Filtering | Key Feature        |
+-------------+-----------+--------+--------+-----------+--------------------+
| Pinecone    | Managed   | 1B+    | $$     | Good      | Serverless option, |
|             | Cloud     |        |        |           | easy to start      |
+-------------+-----------+--------+--------+-----------+--------------------+
| Weaviate    | Managed / | 1B+    | $-$$   | Excellent | Multi-modal,       |
|             | Self-host |        |        |           | GraphQL API        |
+-------------+-----------+--------+--------+-----------+--------------------+
| Qdrant      | Managed / | 1B+    | $-$$   | Excellent | Rust-based, fast   |
|             | Self-host |        |        |           | filtering + search |
+-------------+-----------+--------+--------+-----------+--------------------+
| Milvus      | Self-host | 10B+   | $      | Good      | Highest scale,     |
| (Zilliz)    | / Managed |        |        |           | GPU-accelerated    |
+-------------+-----------+--------+--------+-----------+--------------------+
| pgvector    | Extension | 10M    | $      | Excellent | Postgres native,   |
|             | (Postgres)|        |        | (SQL!)    | simple ops         |
+-------------+-----------+--------+--------+-----------+--------------------+
| ChromaDB    | Embedded  | 1M     | Free   | Basic     | Local dev,         |
|             |           |        |        |           | prototyping        |
+-------------+-----------+--------+--------+-----------+--------------------+
| FAISS       | Library   | 1B+    | Free   | None      | Facebook, fastest  |
|             | (in-mem)  |        | (RAM$) | (manual)  | pure vector search |
+-------------+-----------+--------+--------+-----------+--------------------+
| Elasticsearch| Self-host| 1B+   | $-$$   | Excellent | Existing infra,    |
| (kNN)       | / Managed |       |        | (full BM25)| hybrid search     |
+-------------+-----------+--------+--------+-----------+--------------------+
```

**Decision guide:**
- **Startup/Prototype**: pgvector (if < 10M vectors) or ChromaDB (local dev)
- **Production (managed)**: Pinecone or Qdrant Cloud
- **Production (self-hosted, max control)**: Qdrant or Milvus
- **Already using Postgres**: pgvector with proper indexing
- **Need hybrid search**: Elasticsearch or Weaviate

### Indexing Algorithms

#### HNSW (Hierarchical Navigable Small World)

The most popular indexing algorithm for vector search. Builds a multi-layer graph
where higher layers have fewer, more spread-out nodes for fast navigation, and
lower layers are denser for precise search.

```
Layer 3 (sparse):     A ---- D
                      |
Layer 2 (medium):     A --- B ---- D --- F
                      |     |      |
Layer 1 (dense):      A - B - C - D - E - F - G - H
                      |   |   |   |   |   |   |   |
Layer 0 (all nodes):  A-B-C-D-E-F-G-H-I-J-K-L-M-N-O-P

Search: Start at top layer, greedily navigate to nearest node,
        drop to next layer, repeat until Layer 0.

Parameters:
  M  = max connections per node (16-64, higher = better recall, more RAM)
  ef = beam width during search (50-200, higher = better recall, slower)
```

```
+--------+------------+---------+----------+-----------+
| Algo   | Build Time | Query   | Memory   | Recall    |
+--------+------------+---------+----------+-----------+
| HNSW   | Slow       | Fastest | Highest  | ~99%      |
| IVF    | Medium     | Fast    | Medium   | ~95%      |
| PQ     | Medium     | Fast    | Lowest   | ~90%      |
| IVF+PQ | Medium     | Fast    | Low      | ~93%      |
| Flat   | None       | Slowest | Baseline | 100%      |
+--------+------------+---------+----------+-----------+
```

#### IVF (Inverted File Index)

Partitions the vector space into clusters. At query time, only search the nearest clusters.

```
Vector Space partitioned into K clusters:

  Cluster 1: [v1, v5, v12, v23, ...]
  Cluster 2: [v2, v8, v15, v31, ...]
  Cluster 3: [v3, v6, v19, v28, ...]
  ...
  Cluster K: [v4, v11, v22, v30, ...]

Query: embed(query) -> find nearest nprobe clusters -> search within them
  nprobe = 1:  fast but may miss relevant results
  nprobe = 10: slower but higher recall
```

#### Product Quantization (PQ)

Compresses vectors to reduce memory. Splits each vector into sub-vectors,
quantizes each sub-vector to nearest centroid from a codebook.

```
Original vector (1536 dims, 6144 bytes):
[0.12, 0.45, 0.78, ..., 0.33, 0.91, 0.56]

Split into 192 sub-vectors of 8 dims each:
[0.12,0.45,...] [0.78,0.21,...] ... [0.33,0.91,...]

Quantize each to nearest centroid (256 centroids = 1 byte each):
[42] [187] [5] ... [201]

Compressed: 192 bytes (32x compression!)
```

### Hybrid Search: Dense + Sparse

Combine semantic vector search with traditional keyword search (BM25) for
best-of-both-worlds retrieval.

```
User Query: "How does the TCP three-way handshake work?"

Dense Search (semantic):                 Sparse Search (BM25 keyword):
  1. [0.92] TCP connection setup guide     1. [8.5] TCP three-way handshake RFC
  2. [0.89] Network handshake protocols    2. [7.2] SYN SYN-ACK ACK explained
  3. [0.85] HTTP connection lifecycle      3. [6.8] TCP handshake timeout config
  4. [0.82] WebSocket handshake            4. [5.1] Handshake protocol overview

Reciprocal Rank Fusion (RRF):
  score(doc) = sum( 1 / (k + rank_dense) + 1 / (k + rank_sparse) )
  k = 60 (constant to reduce impact of outlier ranks)

Final fused ranking:
  1. TCP three-way handshake RFC        (strong keyword + good semantic)
  2. TCP connection setup guide         (strong semantic + decent keyword)
  3. Network handshake protocols        (good semantic)
  4. SYN SYN-ACK ACK explained          (good keyword)
```

```python
def hybrid_search(query: str, top_k: int = 10, alpha: float = 0.7) -> list[dict]:
    """
    alpha controls dense vs sparse weighting.
    alpha=1.0 = pure dense, alpha=0.0 = pure sparse
    """
    query_embedding = embed(query)

    # Dense retrieval
    dense_results = vector_db.search(query_embedding, top_k=top_k * 2)

    # Sparse retrieval (BM25)
    sparse_results = bm25_index.search(query, top_k=top_k * 2)

    # Reciprocal Rank Fusion
    scores = {}
    k = 60
    for rank, doc in enumerate(dense_results):
        scores[doc.id] = scores.get(doc.id, 0) + alpha * (1 / (k + rank + 1))
    for rank, doc in enumerate(sparse_results):
        scores[doc.id] = scores.get(doc.id, 0) + (1 - alpha) * (1 / (k + rank + 1))

    # Sort by fused score
    ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    return [fetch_document(doc_id) for doc_id, _ in ranked[:top_k]]
```

---

## 5. Retrieval & Reranking

### Similarity Metrics

```
+------------------+-------------------+----------------------------+----------+
| Metric           | Formula           | Properties                 | Use When |
+------------------+-------------------+----------------------------+----------+
| Cosine           | A.B / (|A|*|B|)   | Magnitude-invariant,       | Default  |
| Similarity       |                   | range [-1, 1]              | choice   |
+------------------+-------------------+----------------------------+----------+
| Dot Product      | A.B               | Magnitude-sensitive,       | Normalized|
|                  |                   | unbounded                  | vectors  |
+------------------+-------------------+----------------------------+----------+
| Euclidean (L2)   | sqrt(sum((a-b)^2))| Distance (lower = closer), | When     |
|                  |                   | unbounded                  | magnitude|
|                  |                   |                            | matters  |
+------------------+-------------------+----------------------------+----------+
```

Most embedding models are trained with cosine similarity. Use cosine unless
the model documentation specifies otherwise.

### Reranking with Cross-Encoder Models

Bi-encoder (embedding model) is fast but imprecise. Cross-encoder is slow but
highly accurate. Use a two-stage pipeline:

```
Stage 1: Bi-Encoder (fast, retrieve top-100)

  Query  ---> [Encoder] ---> query_vec  ---|
                                           |--> cosine similarity
  Doc_i  ---> [Encoder] ---> doc_vec_i ----|

  Speed: ~1ms per 1M documents (with index)
  Quality: Good but not great

Stage 2: Cross-Encoder (slow, rerank top-100 to top-10)

  (Query, Doc_i) ---> [Cross-Encoder] ---> relevance_score_i

  Speed: ~50ms per (query, doc) pair
  Quality: Excellent (sees query+doc together)

Pipeline:
  Bi-Encoder: 10M docs -> Top 100
  Cross-Encoder: Top 100 -> Top 10 (reranked)
  Total added latency: ~100 * 50ms / batch = ~200ms (batched on GPU)
```

**Popular reranker models:**
- Cohere Rerank v3 (API, best quality)
- BGE-Reranker-v2-m3 (open-source, multilingual)
- cross-encoder/ms-marco-MiniLM-L-12-v2 (lightweight, fast)

```python
def retrieve_and_rerank(query: str, top_k: int = 5) -> list[Chunk]:
    # Stage 1: Fast retrieval
    query_embedding = embed_model.encode(query)
    candidates = vector_db.search(query_embedding, top_k=100)

    # Stage 2: Precise reranking
    pairs = [(query, chunk.text) for chunk in candidates]
    rerank_scores = cross_encoder.predict(pairs)

    # Combine and sort
    scored_chunks = list(zip(candidates, rerank_scores))
    scored_chunks.sort(key=lambda x: x[1], reverse=True)

    return [chunk for chunk, score in scored_chunks[:top_k]]
```

### Query Transformation Techniques

#### HyDE (Hypothetical Document Embeddings)

Instead of embedding the query directly, ask the LLM to generate a hypothetical
answer, then embed THAT to find similar real documents.

```
User Query: "What causes aurora borealis?"

Step 1: LLM generates hypothetical answer:
  "The aurora borealis is caused by charged particles from the sun
   interacting with Earth's magnetosphere. Solar wind carries electrons
   and protons that collide with atmospheric gases..."

Step 2: Embed the hypothetical answer (not the original query)

Step 3: Search vector DB with hypothetical embedding
  -> Finds documents about solar wind, magnetosphere, atmospheric science

Why it works: The hypothetical answer is in the same "language" as the
stored documents, leading to better semantic matches than the question form.
```

```python
def hyde_retrieval(query: str, top_k: int = 5) -> list[Chunk]:
    # Generate hypothetical document
    hypothesis = llm.generate(
        f"Write a detailed passage that would answer: {query}"
    )

    # Embed the hypothetical document
    hypo_embedding = embed_model.encode(hypothesis)

    # Search with hypothetical embedding
    return vector_db.search(hypo_embedding, top_k=top_k)
```

#### Multi-Query Retrieval

Generate multiple reformulations of the original query to improve recall.

```
Original: "How to optimize database queries?"

Generated variants:
  1. "Database query performance tuning techniques"
  2. "SQL optimization best practices"
  3. "How to make slow database queries faster"
  4. "Index strategies for query optimization"

Retrieve top-K for each variant, then deduplicate and union results.
```

#### Step-Back Prompting

For specific questions, first ask a more general question to retrieve broader context.

```
Original: "What was the GDP of France in Q3 2024?"

Step-back: "What are the economic indicators of France in 2024?"

Retrieves broader economic context, which likely contains the specific answer.
```

### Retrieval Pipeline (ASCII Diagram)

```
+-------+
| Query |
+---+---+
    |
    v
+---+----------------+
| Query Router       |  Determine: simple vs complex vs multi-hop
+---+---+---+--------+
    |   |   |
    v   |   v
+-------+  +------------------+  +------------------+
| Direct|  | Query Rewriter   |  | HyDE Generator   |
| Embed |  | (multi-query)    |  | (hypothetical)   |
+---+---+  +--------+---------+  +--------+---------+
    |               |                      |
    v               v                      v
+---+---------------+----------------------+---+
|              Embedding Model                 |
+---+---------+----------+---------+-----------+
    |         |          |         |
    v         v          v         v
+---+---------+----------+---------+-----------+
|          Vector Database Search               |
|  (ANN search with metadata filters)          |
+---+------------------------------------------+
    |
    v
+---+------------------------------------------+
|          BM25 Keyword Search                  |
|  (sparse retrieval for exact matches)        |
+---+------------------------------------------+
    |
    v
+---+------------------------------------------+
|          Reciprocal Rank Fusion (RRF)        |
|  (merge dense + sparse results)              |
+---+------------------------------------------+
    |
    v (Top 50-100 candidates)
+---+------------------------------------------+
|          Cross-Encoder Reranker              |
|  (precise relevance scoring)                 |
+---+------------------------------------------+
    |
    v (Top 5-10 results)
+---+------------------------------------------+
|          Post-Processing                      |
|  - Deduplication                             |
|  - Diversity filter (avoid redundancy)       |
|  - Metadata filter (date, access level)      |
+---+------------------------------------------+
    |
    v
  [Retrieved Chunks ready for Context Assembly]
```

---

## 6. Context Assembly & Prompt Engineering

### Context Window Management

Modern LLMs have varying context windows. You must fit: system prompt + retrieved
chunks + conversation history + user query within the limit.

```
Model Context Budgets:
+-------------------+----------+--------------------------------------+
| Model             | Context  | Practical Budget                     |
+-------------------+----------+--------------------------------------+
| GPT-4o            | 128K     | System: 2K, Context: 80K,           |
|                   |          | History: 20K, Query: 1K, Output: 16K|
+-------------------+----------+--------------------------------------+
| Claude 3.5 Sonnet | 200K     | System: 2K, Context: 120K,          |
|                   |          | History: 40K, Query: 1K, Output: 8K |
+-------------------+----------+--------------------------------------+
| Llama 3.1 70B     | 128K     | System: 2K, Context: 60K,           |
|                   |          | History: 20K, Query: 1K, Output: 4K |
+-------------------+----------+--------------------------------------+
| Mistral Large     | 128K     | System: 2K, Context: 60K,           |
|                   |          | History: 20K, Query: 1K, Output: 4K |
+-------------------+----------+--------------------------------------+

Note: Using full context window degrades quality. Stay under 60-70% for best results.
```

### Prompt Template Design

```python
SYSTEM_PROMPT = """You are a helpful assistant that answers questions based on
the provided context. Follow these rules strictly:

1. ONLY use information from the provided context to answer
2. If the context does not contain enough information, say "I don't have enough
   information to answer that question based on the available documents."
3. Cite your sources using [Source: document_title, page X] format
4. Be concise but thorough
5. If information from multiple sources conflicts, acknowledge the discrepancy"""

def build_prompt(query: str, chunks: list[Chunk], history: list[Message]) -> str:
    # Format retrieved context
    context_parts = []
    for i, chunk in enumerate(chunks):
        context_parts.append(
            f"[Document {i+1}: {chunk.metadata['title']}]\n{chunk.text}\n"
        )
    context_str = "\n---\n".join(context_parts)

    # Format conversation history
    history_str = ""
    for msg in history[-10:]:  # Last 10 turns
        history_str += f"{msg.role}: {msg.content}\n"

    # Assemble final prompt
    return f"""{SYSTEM_PROMPT}

## Retrieved Context
{context_str}

## Conversation History
{history_str}

## Current Question
{query}

Please answer based on the context provided above. Cite sources."""
```

### Lost-in-the-Middle Problem

Research shows LLMs pay more attention to information at the beginning and end of
the context, often ignoring the middle. Mitigation strategies:

```
Naive ordering (poor):
  [Chunk 1 (most relevant)]
  [Chunk 2]
  [Chunk 3]          <-- LLM may ignore these
  [Chunk 4]          <-- LLM may ignore these
  [Chunk 5 (least relevant)]

Better: Interleaved ordering
  [Chunk 1 (most relevant)]    -- Beginning (high attention)
  [Chunk 3]
  [Chunk 5 (least relevant)]   -- Middle (low attention, OK for least relevant)
  [Chunk 4]
  [Chunk 2 (2nd most relevant)] -- End (high attention)

Best: Reduce to fewer, highly relevant chunks
  [Chunk 1] [Chunk 2] [Chunk 3]  -- Only include truly relevant chunks

  Fewer chunks = less middle = less information loss
```

### Citation and Source Tracking

```python
def generate_with_citations(query: str, chunks: list[Chunk]) -> dict:
    # Number each source in the prompt
    prompt = build_prompt_with_numbered_sources(query, chunks)

    response = llm.generate(prompt)

    # Extract citation references from response
    citations = extract_citations(response.text)  # e.g., [1], [2], [3]

    # Map citations to source documents
    source_map = {}
    for citation_num in citations:
        chunk = chunks[citation_num - 1]
        source_map[citation_num] = {
            "document_id": chunk.metadata["document_id"],
            "title": chunk.metadata["title"],
            "page": chunk.metadata.get("page"),
            "text_excerpt": chunk.text[:200],
            "url": chunk.metadata.get("url"),
        }

    return {
        "answer": response.text,
        "citations": source_map,
        "chunks_used": len(chunks),
        "model": response.model,
        "tokens_used": response.usage,
    }
```

---

## 7. LLM Serving Infrastructure

### Model Serving Options

```
+------------------+---------+--------+----------+----------+----------------+
| Platform         | Latency | Cost   | Privacy  | Custom.  | Best For       |
+------------------+---------+--------+----------+----------+----------------+
| OpenAI API       | Low     | Medium | Low      | Low      | Quick start,   |
| (GPT-4o/4o-mini) |         |        | (data    |          | general use    |
|                  |         |        |  shared) |          |                |
+------------------+---------+--------+----------+----------+----------------+
| Anthropic API    | Low     | Medium | Medium   | Low      | Complex reason,|
| (Claude 3.5/4)   |         |        |          |          | long context   |
+------------------+---------+--------+----------+----------+----------------+
| Google Vertex AI | Low     | Medium | Medium   | Medium   | GCP ecosystem, |
| (Gemini 2)       |         |        |          |          | multi-modal    |
+------------------+---------+--------+----------+----------+----------------+
| vLLM             | Medium  | Low    | Full     | Full     | Self-hosted    |
| (self-hosted)    |         | (GPU$) |          |          | production     |
+------------------+---------+--------+----------+----------+----------------+
| TGI (HuggingFace)| Medium  | Low    | Full     | Full     | HF models,     |
| (self-hosted)    |         | (GPU$) |          |          | easy setup     |
+------------------+---------+--------+----------+----------+----------------+
| TensorRT-LLM    | Lowest  | Low    | Full     | Full     | Max throughput |
| (NVIDIA)         |         | (GPU$) |          |          | NVIDIA GPUs    |
+------------------+---------+--------+----------+----------+----------------+
| Ollama           | Medium  | Free   | Full     | Limited  | Local dev,     |
| (local)          |         |        |          |          | prototyping    |
+------------------+---------+--------+----------+----------+----------------+
| Together.ai /    | Low     | Low-   | Medium   | Medium   | Open model     |
| Fireworks /      |         | Med    |          |          | APIs without   |
| Groq             |         |        |          |          | managing GPUs  |
+------------------+---------+--------+----------+----------+----------------+
```

### Inference Optimization Techniques

#### KV Cache

During autoregressive generation, each new token needs attention over all previous
tokens. The KV cache stores the Key and Value matrices so they do not need to be
recomputed for every new token.

```
Without KV Cache (naive):
  Token 1: Compute K,V for [token1]               -> output token2
  Token 2: Compute K,V for [token1, token2]        -> output token3
  Token 3: Compute K,V for [token1, token2, token3] -> output token4
  ... (quadratic in sequence length!)

With KV Cache:
  Token 1: Compute K1,V1, cache them               -> output token2
  Token 2: Compute K2,V2, cache them, attend to K1V1+K2V2  -> output token3
  Token 3: Compute K3,V3, cache them, attend to all cached  -> output token4
  ... (linear in sequence length!)

Memory cost: ~2 * num_layers * hidden_dim * seq_len * 2 bytes (FP16)
  For Llama 70B, 4K context: ~2 * 80 * 8192 * 4096 * 2 = ~10 GB per request
```

#### Continuous Batching

Traditional batching waits for all requests in a batch to complete. Continuous
batching dynamically adds/removes requests as they finish.

```
Traditional Batching:
  Req A: [============]            (12 tokens)
  Req B: [=====================]   (21 tokens)
  Req C: [========]                (8 tokens)

  Req C finishes at token 8, but GPU waits for Req B (21 tokens)
  GPU utilization: ~65%

Continuous Batching:
  Req A: [============]
  Req B: [=====================]
  Req C: [========]
  Req D:           [===========]    (starts when C finishes)
  Req E:             [=========]    (starts when A finishes)

  GPU utilization: ~95%
```

#### Speculative Decoding

Use a small "draft" model to generate several candidate tokens quickly, then
verify them in parallel with the large model.

```
Draft Model (1B params, fast):
  Generates: "The capital of France is Paris, which is"
             token1 token2 token3 token4 token5 token6 token7

Large Model (70B params, slow but accurate):
  Verifies all 7 tokens in ONE forward pass
  Accepts: "The capital of France is Paris" (5 tokens accepted)
  Rejects: ", which is" (diverges at token 6)

  Result: 5 tokens generated in ~1 forward pass of large model
  Speedup: ~3-4x for well-matched draft/target pairs
```

#### Quantization

Reduce model precision to save memory and increase speed.

```
+----------+--------+-----------+----------+----------------------------+
| Method   | Bits   | Model Size| Quality  | Notes                      |
|          |        | Reduction | Loss     |                            |
+----------+--------+-----------+----------+----------------------------+
| FP16     | 16-bit | 2x vs FP32| None    | Standard for inference     |
| INT8     | 8-bit  | 2x vs FP16| Minimal | Good balance               |
| INT4     | 4-bit  | 4x vs FP16| Small   | Most popular for serving   |
| GPTQ     | 4-bit  | 4x vs FP16| Small   | One-shot, good for GPU     |
| AWQ      | 4-bit  | 4x vs FP16| Smallest| Activation-aware, better   |
| GGUF     | 2-6bit | Varies    | Varies  | CPU-friendly (llama.cpp)   |
+----------+--------+-----------+----------+----------------------------+

Llama 70B memory requirements:
  FP16:  ~140 GB (2x A100 80GB)
  INT8:  ~70 GB  (1x A100 80GB)
  INT4:  ~35 GB  (1x A100 40GB or 1x A6000)
```

#### Flash Attention

Optimized attention mechanism that reduces memory from O(n^2) to O(n) by
tiling the computation and avoiding materializing the full attention matrix.

```
Standard Attention:
  Compute S = Q * K^T  (n x n matrix, stored in HBM)  -- O(n^2) memory
  Compute P = softmax(S)
  Compute O = P * V

Flash Attention:
  Process Q, K, V in tiles/blocks
  Never materialize full n x n matrix
  Keep running statistics for softmax in SRAM
  Result: Same output, O(n) memory, 2-4x faster
```

### Streaming Responses (Server-Sent Events)

```python
# Server-side (FastAPI)
from fastapi import FastAPI
from fastapi.responses import StreamingResponse

app = FastAPI()

async def stream_rag_response(query: str):
    # Retrieve context (non-streaming)
    chunks = await retrieve_and_rerank(query)
    prompt = build_prompt(query, chunks)

    # Stream LLM response token by token
    async for token in llm.stream(prompt):
        yield f"data: {json.dumps({'token': token})}\n\n"

    # Send citations at the end
    citations = build_citations(chunks)
    yield f"data: {json.dumps({'citations': citations})}\n\n"
    yield "data: [DONE]\n\n"

@app.get("/api/chat")
async def chat(query: str):
    return StreamingResponse(
        stream_rag_response(query),
        media_type="text/event-stream"
    )
```

```javascript
// Client-side (JavaScript)
const eventSource = new EventSource(`/api/chat?query=${encodeURIComponent(query)}`);

eventSource.onmessage = (event) => {
  if (event.data === "[DONE]") {
    eventSource.close();
    return;
  }
  const data = JSON.parse(event.data);
  if (data.token) {
    appendToResponse(data.token);
  }
  if (data.citations) {
    renderCitations(data.citations);
  }
};
```

### GPU Provisioning and Auto-Scaling

```
Sizing for 10 QPS with Llama 70B (INT4):

Single A100 80GB throughput:
  - ~30 tokens/second per request
  - With continuous batching: ~8 concurrent requests
  - Average response: 500 tokens -> ~17 seconds
  - Effective throughput: ~8/17 = ~0.47 QPS per GPU

For 10 QPS peak:
  - Need: 10 / 0.47 = ~22 GPUs
  - With headroom (80% target utilization): ~28 GPUs
  - Cost: 28 * $2/hr = $56/hr = ~$40,320/month

Auto-scaling policy:
  Scale-up trigger:   p95 latency > 3s OR GPU utilization > 80%
  Scale-down trigger: GPU utilization < 30% for 10 minutes
  Min replicas: 4 (for availability)
  Max replicas: 40 (cost cap)
  Scale increment: 4 GPUs at a time

Alternative with GPT-4o-mini API:
  10 QPS * 2000 tokens * $0.00015/1K = $0.003/sec = ~$7,776/month
  (Much simpler ops, but less control)
```

---

## 8. Data Model

### Relational Schema (PostgreSQL)

```sql
-- Documents table: stores original document metadata
CREATE TABLE documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title           TEXT NOT NULL,
    source_url      TEXT,
    file_type       VARCHAR(20) NOT NULL,  -- 'pdf', 'html', 'markdown', 'docx'
    file_size_bytes BIGINT,
    page_count      INTEGER,
    word_count      INTEGER,
    author          TEXT,
    category        TEXT,
    department      TEXT,
    access_level    VARCHAR(20) DEFAULT 'public',
    ingestion_status VARCHAR(20) DEFAULT 'pending',  -- pending, processing, completed, failed
    error_message   TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    ingested_at     TIMESTAMPTZ
);

CREATE INDEX idx_documents_category ON documents(category);
CREATE INDEX idx_documents_status ON documents(ingestion_status);
CREATE INDEX idx_documents_created ON documents(created_at);

-- Chunks table: stores document chunks with embeddings (using pgvector)
CREATE TABLE chunks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index     INTEGER NOT NULL,
    text            TEXT NOT NULL,
    token_count     INTEGER NOT NULL,
    embedding       vector(1536),  -- pgvector column

    -- Metadata for filtering
    section_header  TEXT,
    page_number     INTEGER,
    has_code        BOOLEAN DEFAULT FALSE,
    has_table       BOOLEAN DEFAULT FALSE,

    -- Parent-child chunking support
    parent_chunk_id UUID REFERENCES chunks(id),
    chunk_level     VARCHAR(10) DEFAULT 'leaf',  -- 'parent', 'leaf'

    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- HNSW index for vector search
CREATE INDEX idx_chunks_embedding ON chunks
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 200);

CREATE INDEX idx_chunks_document ON chunks(document_id);
CREATE INDEX idx_chunks_parent ON chunks(parent_chunk_id);

-- Conversations table: multi-turn chat sessions
CREATE TABLE conversations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL,
    title           TEXT,
    model_id        VARCHAR(100) NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conversations_user ON conversations(user_id);

-- Messages table: individual messages within a conversation
CREATE TABLE messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            VARCHAR(20) NOT NULL,  -- 'user', 'assistant', 'system'
    content         TEXT NOT NULL,

    -- RAG metadata
    chunks_retrieved UUID[],           -- array of chunk IDs used
    retrieval_scores FLOAT[],          -- similarity scores
    model_id        VARCHAR(100),
    prompt_tokens   INTEGER,
    completion_tokens INTEGER,
    latency_ms      INTEGER,

    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id);

-- Feedback table: user ratings for answer quality
CREATE TABLE feedback (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id      UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL,
    rating          SMALLINT CHECK (rating IN (-1, 1)),  -- thumbs down/up
    feedback_text   TEXT,
    feedback_type   VARCHAR(50),  -- 'hallucination', 'irrelevant', 'helpful', 'wrong_source'
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_feedback_message ON feedback(message_id);
CREATE INDEX idx_feedback_rating ON feedback(rating);
```

### Vector DB Schema (for dedicated vector databases like Qdrant)

```json
{
  "collection_name": "document_chunks",
  "vectors": {
    "size": 1536,
    "distance": "Cosine"
  },
  "payload_schema": {
    "document_id": "keyword",
    "title": "text",
    "text": "text",
    "chunk_index": "integer",
    "section_header": "text",
    "category": "keyword",
    "department": "keyword",
    "access_level": "keyword",
    "created_at": "datetime",
    "has_code": "bool",
    "page_number": "integer",
    "parent_chunk_id": "keyword"
  },
  "optimizers_config": {
    "indexing_threshold": 20000
  },
  "hnsw_config": {
    "m": 16,
    "ef_construct": 200,
    "full_scan_threshold": 10000
  }
}
```

---

## 9. High-Level Architecture

### Full System Architecture

```
                              CLIENTS
                    +----------+  +----------+
                    | Web App  |  | API      |
                    | (React)  |  | Clients  |
                    +-----+----+  +----+-----+
                          |            |
                          v            v
                    +-----+------------+-----+
                    |    API Gateway          |
                    |  (Auth, Rate Limit,     |
                    |   Load Balance)         |
                    +----------+-------------+
                               |
               +---------------+---------------+
               |                               |
               v                               v
    +----------+----------+         +----------+----------+
    |   Chat/Query API    |         | Document Upload API |
    |   (Sync, Streaming) |         | (Async)             |
    +----------+----------+         +----------+----------+
               |                               |
               v                               v
    +----------+----------+         +----------+----------+
    |   Orchestrator      |         |   Message Queue     |
    |   Service           |         |   (Kafka / SQS)     |
    +--+-----+-----+-----+         +----------+----------+
       |     |     |                           |
       |     |     |                           v
       |     |     |                +----------+----------+
       |     |     |                | Ingestion Workers   |
       |     |     |                | (Auto-scaled)       |
       |     |     |                +--+-------+-------+--+
       |     |     |                   |       |       |
       v     |     v                   v       |       v
  +----+--+  |  +--+------+     +-----+-+     |  +---+--------+
  |Embed  |  |  |Reranker |     |Parser  |     |  |Embedding   |
  |Service|  |  |Service  |     |Service |     |  |Batch Svc   |
  +---+---+  |  +--+------+     +--------+     |  +---+--------+
      |      |     |                            |      |
      v      |     |                            |      v
  +---+------+-----+---+              +--------+------+--------+
  |    Vector Database  |              |    Vector Database     |
  |    (Qdrant/Pinecone)|              |    (write path)        |
  +---------------------+              +-----------+-----------+
      |      |                                     |
      |      v                                     |
      |  +---+------------------+                  |
      |  |  LLM Gateway         |                  |
      |  |  (Router + Fallback) |                  |
      |  +--+-----------+------+                   |
      |     |           |                          |
      |     v           v                          |
      |  +--+---+  +---+-------+                   |
      |  |OpenAI|  |Self-hosted|                   |
      |  |API   |  |vLLM (GPU) |                   |
      |  +------+  +-----------+                   |
      |                                            |
      v                                            v
  +---+--------------------------------------------+---+
  |              PostgreSQL                            |
  |  (documents, conversations, messages, feedback)    |
  +---+------------------------------------------------+
      |
      v
  +---+--------------------------------------------+
  |         Monitoring & Evaluation                |
  |  (Prometheus, Grafana, RAGAS, LangSmith)       |
  +------------------------------------------------+
```

### Orchestrator Service (Core Logic)

```python
class RAGOrchestrator:
    def __init__(self, config: RAGConfig):
        self.embed_service = EmbeddingService(config.embed_model)
        self.vector_db = VectorDBClient(config.vector_db_url)
        self.reranker = RerankerService(config.reranker_model)
        self.llm_gateway = LLMGateway(config.llm_config)
        self.cache = SemanticCache(config.cache_config)

    async def query(self, request: QueryRequest) -> QueryResponse:
        # Step 0: Check semantic cache
        cached = await self.cache.get(request.query)
        if cached:
            return cached

        # Step 1: Query transformation (optional)
        queries = await self.transform_query(request.query)

        # Step 2: Embed query(ies)
        query_embeddings = await self.embed_service.encode_batch(queries)

        # Step 3: Vector search (parallel for multi-query)
        all_candidates = []
        for embedding in query_embeddings:
            candidates = await self.vector_db.search(
                embedding=embedding,
                top_k=50,
                filters=request.filters
            )
            all_candidates.extend(candidates)

        # Step 4: Deduplicate
        unique_candidates = deduplicate_by_id(all_candidates)

        # Step 5: Rerank
        reranked = await self.reranker.rerank(
            query=request.query,
            documents=unique_candidates,
            top_k=request.context_chunks or 5
        )

        # Step 6: Handle parent-child (fetch parent if using leaf chunks)
        context_chunks = await self.resolve_parent_chunks(reranked)

        # Step 7: Build prompt
        prompt = build_prompt(
            query=request.query,
            chunks=context_chunks,
            history=request.conversation_history,
            system_prompt=request.system_prompt
        )

        # Step 8: Generate response (streaming)
        response = await self.llm_gateway.generate(
            prompt=prompt,
            model=request.model_id,
            stream=request.stream,
            max_tokens=request.max_tokens
        )

        # Step 9: Build response with citations
        result = QueryResponse(
            answer=response.text,
            citations=build_citations(context_chunks),
            model=response.model,
            usage=response.usage,
            retrieval_scores=[c.score for c in reranked]
        )

        # Step 10: Cache result
        await self.cache.set(request.query, result)

        return result
```

### LLM Gateway with Fallback

```python
class LLMGateway:
    """Routes requests to appropriate LLM provider with fallback."""

    def __init__(self, config: LLMConfig):
        self.providers = {
            "openai": OpenAIProvider(config.openai_key),
            "anthropic": AnthropicProvider(config.anthropic_key),
            "self_hosted": VLLMProvider(config.vllm_endpoint),
        }
        self.routing_strategy = config.routing_strategy
        self.fallback_order = config.fallback_order

    async def generate(self, prompt: str, model: str, **kwargs) -> LLMResponse:
        provider = self.resolve_provider(model)

        for attempt_provider in self.get_fallback_chain(provider):
            try:
                response = await attempt_provider.generate(
                    prompt=prompt,
                    model=model,
                    timeout=30,
                    **kwargs
                )
                return response
            except RateLimitError:
                # Try next provider
                continue
            except TimeoutError:
                # Try next provider
                continue
            except Exception as e:
                log_error(f"LLM provider error: {e}")
                continue

        raise AllProvidersFailedError("All LLM providers exhausted")

    def resolve_provider(self, model: str) -> str:
        """Route based on model name or smart routing."""
        if model.startswith("gpt"):
            return "openai"
        elif model.startswith("claude"):
            return "anthropic"
        elif self.routing_strategy == "cost_optimized":
            return "self_hosted"  # Cheapest first
        elif self.routing_strategy == "latency_optimized":
            return self.lowest_latency_provider()
        return self.fallback_order[0]
```

---

## 10. Evaluation & Monitoring

### RAG Evaluation Metrics

#### Retrieval Metrics

```
+-------------------+-----------------------------------------------------+
| Metric            | Description                                         |
+-------------------+-----------------------------------------------------+
| Recall@K          | % of relevant docs found in top-K results           |
|                   | Higher = finding more relevant content               |
+-------------------+-----------------------------------------------------+
| MRR (Mean         | Average of 1/rank of first relevant result           |
| Reciprocal Rank)  | Higher = relevant docs appearing earlier              |
+-------------------+-----------------------------------------------------+
| NDCG (Normalized  | Measures ranking quality considering position         |
| Discounted        | Higher = better ordering of relevant results         |
| Cumulative Gain)  |                                                     |
+-------------------+-----------------------------------------------------+
| Hit Rate          | % of queries where at least one relevant doc found   |
|                   | Basic but useful sanity check                        |
+-------------------+-----------------------------------------------------+
```

```python
def recall_at_k(retrieved_ids: list[str], relevant_ids: set[str], k: int) -> float:
    """What fraction of relevant documents were found in top-K?"""
    retrieved_set = set(retrieved_ids[:k])
    return len(retrieved_set & relevant_ids) / len(relevant_ids)

def mrr(retrieved_ids: list[str], relevant_ids: set[str]) -> float:
    """Mean Reciprocal Rank: 1/position of first relevant result."""
    for rank, doc_id in enumerate(retrieved_ids, start=1):
        if doc_id in relevant_ids:
            return 1.0 / rank
    return 0.0
```

#### Generation Metrics

```
+-------------------+-----------------------------------------------------+
| Metric            | Description                                         |
+-------------------+-----------------------------------------------------+
| Faithfulness      | Is the answer supported by the retrieved context?   |
|                   | (Measures hallucination rate)                       |
+-------------------+-----------------------------------------------------+
| Answer Relevance  | Does the answer actually address the question?      |
+-------------------+-----------------------------------------------------+
| Context Relevance | Are the retrieved chunks relevant to the question?  |
+-------------------+-----------------------------------------------------+
| Context Precision | Of the retrieved chunks, what % were actually used? |
+-------------------+-----------------------------------------------------+
| Answer            | How complete is the answer vs ground truth?         |
| Correctness       |                                                     |
+-------------------+-----------------------------------------------------+
```

### RAGAS Framework

RAGAS (Retrieval Augmented Generation Assessment) is the standard evaluation
framework for RAG systems. It uses LLMs to evaluate LLM outputs.

```python
from ragas import evaluate
from ragas.metrics import (
    faithfulness,
    answer_relevancy,
    context_precision,
    context_recall,
)

# Prepare evaluation dataset
eval_data = {
    "question": ["What is machine learning?", "How does TCP work?"],
    "answer": [generated_answer_1, generated_answer_2],
    "contexts": [retrieved_chunks_1, retrieved_chunks_2],
    "ground_truth": [expected_answer_1, expected_answer_2],
}

# Run evaluation
results = evaluate(
    dataset=eval_data,
    metrics=[
        faithfulness,        # Is answer grounded in context?
        answer_relevancy,    # Does answer address the question?
        context_precision,   # Are retrieved chunks relevant?
        context_recall,      # Do retrieved chunks cover the answer?
    ],
)

# Results:
# faithfulness:      0.92  (92% of claims supported by context)
# answer_relevancy:  0.88  (88% relevant to question)
# context_precision: 0.75  (75% of chunks were actually useful)
# context_recall:    0.85  (85% of needed info was retrieved)
```

### Online Monitoring Dashboard

```
+------------------------------------------------------------------+
|                    RAG System Dashboard                           |
+------------------------------------------------------------------+
|                                                                  |
|  Latency (p50/p95/p99)         Throughput                        |
|  +---------------------------+ +---------------------------+     |
|  | p50: 1.2s  p95: 2.8s     | | Queries/min: 72           |     |
|  | p99: 4.1s                 | | Embeddings/min: 72        |     |
|  |  Retrieval: 180ms (avg)   | | Tokens/min: 144K          |     |
|  |  Reranking: 200ms (avg)   | |                           |     |
|  |  LLM gen:   850ms (avg)   | |                           |     |
|  +---------------------------+ +---------------------------+     |
|                                                                  |
|  Token Usage                    Error Rates                      |
|  +---------------------------+ +---------------------------+     |
|  | Input:  1.2M tokens/hr    | | LLM errors: 0.3%          |     |
|  | Output: 350K tokens/hr    | | Vector DB errors: 0.01%   |     |
|  | Cost:   $1.82/hr          | | Timeout rate: 0.5%        |     |
|  | Cached: 23% hit rate      | | Empty retrieval: 2.1%     |     |
|  +---------------------------+ +---------------------------+     |
|                                                                  |
|  User Feedback                  Retrieval Quality                |
|  +---------------------------+ +---------------------------+     |
|  | Thumbs up:   78%          | | Avg chunks retrieved: 5.2 |     |
|  | Thumbs down: 12%          | | Avg rerank score: 0.73    |     |
|  | No feedback: 10%          | | Empty result rate: 2.1%   |     |
|  | Regen rate:  8%           | | Avg relevance: 0.81       |     |
|  +---------------------------+ +---------------------------+     |
+------------------------------------------------------------------+
```

### Alerts Configuration

```yaml
# alerting-rules.yaml
alerts:
  - name: high_latency
    condition: p95_latency > 3000ms
    for: 5m
    severity: warning

  - name: critical_latency
    condition: p99_latency > 8000ms
    for: 2m
    severity: critical

  - name: high_hallucination_rate
    condition: faithfulness_score < 0.85
    for: 15m
    severity: warning

  - name: low_retrieval_quality
    condition: avg_rerank_score < 0.5
    for: 10m
    severity: warning

  - name: high_empty_retrieval
    condition: empty_retrieval_rate > 5%
    for: 5m
    severity: critical

  - name: cost_spike
    condition: hourly_token_cost > 2x_rolling_average
    for: 30m
    severity: warning

  - name: gpu_saturation
    condition: gpu_utilization > 90%
    for: 5m
    severity: warning
```

---

## 11. Scaling

### Vector DB Sharding and Replication

```
Sharding Strategy for 100M chunks:

Option 1: Hash-based sharding (uniform distribution)
  Shard key: hash(document_id) % num_shards

  +----------+  +----------+  +----------+  +----------+
  | Shard 0  |  | Shard 1  |  | Shard 2  |  | Shard 3  |
  | 25M vecs |  | 25M vecs |  | 25M vecs |  | 25M vecs |
  +----------+  +----------+  +----------+  +----------+
  Query fans out to ALL shards, results merged

Option 2: Category-based sharding (query routing)
  Shard key: document.category

  +----------+  +----------+  +----------+  +----------+
  |Engineering|  |  Legal   |  |  Sales   |  |  Other   |
  | 30M vecs |  | 20M vecs |  | 25M vecs |  | 25M vecs |
  +----------+  +----------+  +----------+  +----------+
  Query routed to relevant shard(s) only -- faster!

Replication (for availability):
  Each shard has 2-3 replicas
  Writes go to primary, reads load-balanced across replicas

  Primary  --->  Replica 1
           --->  Replica 2
```

### Embedding Batch Processing

```
Real-time (single documents):
  Upload -> Parse -> Chunk -> Embed -> Store
  Latency: ~10-30 seconds per document

Batch pipeline (bulk ingestion):
  +--------+    +--------+    +--------+    +--------+
  | S3     |--->| Spark/ |--->| Embed  |--->| Bulk   |
  | Bucket |    | Flink  |    | Service|    | Insert |
  +--------+    +--------+    +--------+    +--------+
                  |              |
                  | Parallel     | GPU Batch
                  | Processing   | (256 docs/batch)
                  |              |
  Throughput: ~10K documents/minute with 4 GPUs

  Batch embedding optimization:
    - Sort chunks by length (minimize padding)
    - Batch size 256-512 for GPU efficiency
    - Use multiple embedding model replicas
```

### LLM Inference Auto-Scaling

```
                    Auto-Scaling Architecture

  +----------------------------------------------------+
  |                 Load Balancer                       |
  +----+-----+-----+-----+-----+-----+-----+-----+---+
       |     |     |     |     |     |     |     |
       v     v     v     v     v     v     v     v
  +------+ +------+ +------+ +------+ +------+ +------+
  |vLLM  | |vLLM  | |vLLM  | |vLLM  | |vLLM  | |vLLM  |
  |Pod 1 | |Pod 2 | |Pod 3 | |Pod 4 | |Pod 5 | |Pod 6 |
  |A100  | |A100  | |A100  | |A100  | |A100  | |A100  |
  +------+ +------+ +------+ +------+ +------+ +------+
  [--- Min: 4 pods --------]  [--- Scaled up pods ----]

  Kubernetes HPA (Horizontal Pod Autoscaler):
    metric: custom/gpu_utilization
    target: 70%
    minReplicas: 4
    maxReplicas: 20
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
        - type: Pods
          value: 4          # Add 4 pods at a time
          periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300  # Wait 5 min before scaling down
      policies:
        - type: Pods
          value: 2
          periodSeconds: 120
```

### Semantic Cache

Cache responses for semantically similar queries to avoid redundant LLM calls.

```
Query: "What is the capital of France?"
  -> Embed query -> Check cache (cosine > 0.95 threshold)
  -> Cache MISS -> Retrieve -> Generate -> Cache result

Query: "What's France's capital city?"
  -> Embed query -> Check cache
  -> Cache HIT (cosine similarity = 0.97 with cached query)
  -> Return cached response instantly

Implementation:
  +----------+     +--------------+     +--------+
  | Query    |---->| Semantic     |---->| Cache  |
  | Embedding|     | Similarity   |     | Hit?   |
  +----------+     | (cosine>0.95)|     +---+----+
                   +--------------+         |
                                      Yes   |   No
                                      +-----+-----+
                                      v           v
                                  Return       Full RAG
                                  Cached       Pipeline
                                  Response     (then cache)
```

```python
class SemanticCache:
    def __init__(self, threshold: float = 0.95, ttl_hours: int = 24):
        self.threshold = threshold
        self.ttl = timedelta(hours=ttl_hours)
        self.cache_db = VectorDBClient("cache_collection")

    async def get(self, query: str) -> QueryResponse | None:
        query_embedding = await embed(query)
        results = await self.cache_db.search(
            embedding=query_embedding,
            top_k=1,
            score_threshold=self.threshold
        )
        if results and results[0].score >= self.threshold:
            cached = results[0]
            if datetime.now() - cached.created_at < self.ttl:
                return QueryResponse.from_cache(cached)
        return None

    async def set(self, query: str, response: QueryResponse) -> None:
        query_embedding = await embed(query)
        await self.cache_db.upsert(
            id=generate_uuid(),
            embedding=query_embedding,
            payload={
                "query": query,
                "response": response.to_dict(),
                "created_at": datetime.now().isoformat(),
            }
        )
```

### Multi-Tenant Isolation

```
Tenant Isolation Strategies:

1. Collection-per-tenant (strong isolation):
   +------------------+  +------------------+  +------------------+
   | Tenant A         |  | Tenant B         |  | Tenant C         |
   | Collection       |  | Collection       |  | Collection       |
   | (own index)      |  | (own index)      |  | (own index)      |
   +------------------+  +------------------+  +------------------+
   Pros: Full isolation, per-tenant scaling, easy deletion
   Cons: More resources, index per tenant

2. Shared collection + metadata filter (cost-efficient):
   +-----------------------------------------------------+
   | Shared Collection                                    |
   | [tenant_id=A, ...] [tenant_id=B, ...] [tenant_id=C]|
   +-----------------------------------------------------+
   All queries include: filter={"tenant_id": request.tenant_id}
   Pros: Efficient, simple
   Cons: Noisy neighbor, harder to delete tenant data

3. Hybrid (recommended for production):
   Large tenants (>1M chunks): Dedicated collection
   Small tenants (<1M chunks): Shared collection with filters
```

---

## 12. Cost Optimization

### Token Cost Analysis

```
Per-Query Cost Breakdown (GPT-4o):

Component          | Tokens  | Rate         | Cost
-------------------+---------+--------------+----------
System prompt      | 500     | $2.50/1M in  | $0.00125
Retrieved context  | 2,000   | $2.50/1M in  | $0.00500
Conversation hist. | 500     | $2.50/1M in  | $0.00125
User query         | 50      | $2.50/1M in  | $0.000125
Output             | 500     | $10.00/1M out| $0.00500
-------------------+---------+--------------+----------
Total per query    | 3,550   |              | $0.01263

Daily (100K queries):                        $1,263
Monthly:                                     $37,875

With GPT-4o-mini instead:
Input:  3,050 tokens * $0.15/1M  = $0.000458
Output: 500 tokens * $0.60/1M    = $0.000300
Total per query:                   $0.000758
Monthly (100K/day):                $2,273  (15x cheaper)

Self-hosted Llama 70B (INT4, 4x A100):
GPU cost: $5,760/month (fixed)
Per query: $5,760 / 3M queries = $0.00192
Monthly:   $5,760 (fixed, cheaper above ~1.5M queries/month)
```

### Cost Optimization Strategies

```
Strategy                    | Savings  | Effort | Trade-off
----------------------------+----------+--------+---------------------------
Semantic caching            | 20-40%   | Low    | Slightly stale responses
Smaller model for simple Qs | 30-50%   | Medium | Need query classifier
Reduce context chunks       | 10-20%   | Low    | May miss information
Shorter system prompts      | 5-10%    | Low    | Less instruction following
Batch embedding (off-peak)  | 20-30%   | Low    | Higher ingestion latency
MRL (reduced dimensions)    | 30-50%   | Low    | Slightly lower recall
  on embedding storage      |          |        |
Quantized self-hosted model | 60-80%   | High   | Operational complexity
Output token limits         | 10-30%   | Low    | Truncated responses
```

### Query Routing (Cost-Aware)

```python
class CostAwareRouter:
    """Route queries to the most cost-effective model."""

    MODELS = {
        "simple": {
            "model": "gpt-4o-mini",
            "cost_per_1k_in": 0.00015,
            "cost_per_1k_out": 0.0006,
        },
        "complex": {
            "model": "gpt-4o",
            "cost_per_1k_in": 0.0025,
            "cost_per_1k_out": 0.01,
        },
        "reasoning": {
            "model": "claude-3-5-sonnet",
            "cost_per_1k_in": 0.003,
            "cost_per_1k_out": 0.015,
        },
    }

    async def classify_query(self, query: str) -> str:
        """Use a cheap model to classify query complexity."""
        classification = await cheap_llm.classify(
            query,
            categories=["simple", "complex", "reasoning"]
        )
        return classification

    async def route(self, query: str) -> str:
        complexity = await self.classify_query(query)
        return self.MODELS[complexity]["model"]
```

### Embedding Cost Optimization

```
Batch vs Real-time Embedding:

Real-time (per-document):
  - Immediate availability (< 30s)
  - Higher cost due to API overhead
  - Good for: urgent documents, user uploads

Batch (hourly/daily):
  - Delayed availability (hours)
  - 20-30% cheaper (batch API pricing, GPU utilization)
  - Good for: bulk ingestion, periodic updates

Hybrid approach:
  - Real-time for high-priority documents
  - Batch for bulk/low-priority content
  - Scheduled re-embedding for updated documents
```

---

## 13. Deployment Architecture

### Production Deployment (Kubernetes)

```
                    Production Deployment Architecture

  +------------------------------------------------------------------+
  |                        Cloud Provider (AWS/GCP)                   |
  |                                                                  |
  |   +-------------------+    +----------------------------------+  |
  |   | CloudFront/CDN    |    | Route 53 / Cloud DNS             |  |
  |   +--------+----------+    +---------------+------------------+  |
  |            |                               |                     |
  |            v                               v                     |
  |   +--------+-------------------------------+------------------+  |
  |   |              Application Load Balancer                    |  |
  |   |              (ALB / Cloud Load Balancer)                  |  |
  |   +--------+-------------------------------+------------------+  |
  |            |                               |                     |
  |   +--------+------------------+   +--------+------------------+  |
  |   |  Kubernetes Cluster       |   |  Kubernetes Cluster       |  |
  |   |  (Region: us-east-1)      |   |  (Region: us-west-2)     |  |
  |   |                          |   |                            |  |
  |   | +------+ +------+       |   | +------+ +------+         |  |
  |   | |API   | |API   |       |   | |API   | |API   |         |  |
  |   | |Pod x3| |Pod x3|       |   | |Pod x3| |Pod x3|         |  |
  |   | +------+ +------+       |   | +------+ +------+         |  |
  |   |                          |   |                            |  |
  |   | +------+ +------+       |   | +------+ +------+         |  |
  |   | |Embed | |Rerank|       |   | |Embed | |Rerank|         |  |
  |   | |Svc x2| |Svc x2|       |   | |Svc x2| |Svc x2|        |  |
  |   | +------+ +------+       |   | +------+ +------+         |  |
  |   |                          |   |                            |  |
  |   | +----------------------+ |   | +----------------------+  |  |
  |   | | GPU Node Pool        | |   | | GPU Node Pool        |  |  |
  |   | | vLLM Pods (4x A100)  | |   | | vLLM Pods (4x A100)  | |  |
  |   | +----------------------+ |   | +----------------------+  |  |
  |   +--------------------------+   +----------------------------+  |
  |                                                                  |
  |   +--------------------------+   +----------------------------+  |
  |   | Qdrant Cluster           |   | PostgreSQL (RDS)           |  |
  |   | (3-node, replicated)     |   | (Multi-AZ, read replicas) |  |
  |   +--------------------------+   +----------------------------+  |
  |                                                                  |
  |   +--------------------------+   +----------------------------+  |
  |   | Redis Cluster            |   | Kafka / SQS               |  |
  |   | (semantic cache)         |   | (ingestion queue)         |  |
  |   +--------------------------+   +----------------------------+  |
  |                                                                  |
  |   +-----------------------------------------------------------+  |
  |   | Monitoring: Prometheus + Grafana + PagerDuty              |  |
  |   | Logging: ELK Stack / CloudWatch                           |  |
  |   | Tracing: Jaeger / Datadog APM                             |  |
  |   | RAG Eval: LangSmith / Arize Phoenix                       |  |
  |   +-----------------------------------------------------------+  |
  +------------------------------------------------------------------+
```

### Kubernetes Resource Definitions

```yaml
# vllm-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: vllm-serving
spec:
  replicas: 4
  selector:
    matchLabels:
      app: vllm
  template:
    metadata:
      labels:
        app: vllm
    spec:
      nodeSelector:
        nvidia.com/gpu.product: "A100"
      containers:
        - name: vllm
          image: vllm/vllm-openai:latest
          args:
            - "--model=meta-llama/Llama-3.1-70B-Instruct"
            - "--quantization=awq"
            - "--tensor-parallel-size=1"
            - "--max-model-len=8192"
            - "--gpu-memory-utilization=0.9"
          resources:
            limits:
              nvidia.com/gpu: 1
              memory: "96Gi"
              cpu: "16"
            requests:
              nvidia.com/gpu: 1
              memory: "80Gi"
              cpu: "8"
          ports:
            - containerPort: 8000
          readinessProbe:
            httpGet:
              path: /health
              port: 8000
            initialDelaySeconds: 120
            periodSeconds: 10
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: vllm-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: vllm-serving
  minReplicas: 4
  maxReplicas: 20
  metrics:
    - type: Pods
      pods:
        metric:
          name: gpu_utilization
        target:
          type: AverageValue
          averageValue: "70"
```

### Multi-Region Considerations

```
Active-Active Multi-Region:

Region A (us-east-1, Primary)          Region B (us-west-2, Secondary)
+----------------------------+         +----------------------------+
| Full RAG stack             |         | Full RAG stack             |
| API + Embedding + LLM     |         | API + Embedding + LLM     |
+----------------------------+         +----------------------------+
         |                                       |
         v                                       v
+----------------------------+         +----------------------------+
| Vector DB (Primary)       |  <--->  | Vector DB (Replica)       |
| PostgreSQL (Primary)      |  <--->  | PostgreSQL (Read Replica) |
+----------------------------+  Async  +----------------------------+
                                Repl.

Routing: GeoDNS routes users to nearest region
Writes: Always go to primary region, replicated async
Reads: Served from nearest region
Failover: If Region A down, Region B promotes to primary

Latency benefit: 50-100ms reduction for users in western US
Cost: ~1.8x of single region (shared vector DB replication)
```

---

## 14. Common Interview Follow-ups

### How to Handle Hallucinations?

**Multi-layered approach:**

1. **Retrieval grounding**: Only answer from retrieved context (strict prompt instructions)
2. **Faithfulness checking**: Post-generation LLM call to verify claims against context
3. **Confidence scoring**: Ask the LLM to rate its confidence; low confidence triggers "I don't know"
4. **Citation enforcement**: Require inline citations; reject answers without them
5. **Guardrails**: Use NeMo Guardrails or similar to filter hallucinated content

```python
async def check_faithfulness(answer: str, context: list[str]) -> float:
    """Use LLM to verify each claim in the answer is supported by context."""
    claims = await extract_claims(answer)  # Split answer into individual claims

    supported_count = 0
    for claim in claims:
        is_supported = await llm.classify(
            f"Is this claim supported by the context?\n"
            f"Claim: {claim}\n"
            f"Context: {' '.join(context)}\n"
            f"Answer: YES or NO"
        )
        if is_supported == "YES":
            supported_count += 1

    return supported_count / len(claims) if claims else 0.0
```

### How to Update the Knowledge Base in Real-Time?

```
Real-time update pipeline:

1. Document change detected (webhook, file watcher, API upload)
2. Change event published to message queue
3. Worker consumes event:
   a. Re-parse changed document
   b. Diff chunking (only re-chunk changed sections)
   c. Re-embed changed chunks
   d. Upsert to vector DB (atomic: delete old + insert new)
   e. Invalidate semantic cache entries for affected documents
4. Metadata update in PostgreSQL

Incremental vs Full Re-index:
  - Small edit (typo fix): Re-embed only affected chunks
  - Major rewrite: Re-chunk and re-embed entire document
  - Schema change: Full re-index (background job, zero-downtime swap)
```

### How to Handle Multi-Modal RAG (Images + Text)?

```
Multi-modal RAG Pipeline:

Document with images:
  [Text paragraph 1]
  [Image: architecture diagram]
  [Text paragraph 2]
  [Table with data]

Processing:
  1. Extract images from documents (PyMuPDF, pdf2image)
  2. Generate image descriptions using vision model (GPT-4V, LLaVA)
  3. Create text chunks: original text + image descriptions
  4. Embed everything as text (unified embedding space)

  OR (advanced):
  1. Use multi-modal embeddings (CLIP, Nomic Embed Vision)
  2. Store text and image embeddings in same vector space
  3. Retrieve both text and image chunks
  4. Pass images directly to multi-modal LLM for generation

Architecture change:
  +--------+    +--------+    +--------+    +--------+
  | Images |    | Tables |    | Text   |    | Code   |
  +---+----+    +---+----+    +---+----+    +---+----+
      |             |             |             |
      v             v             v             v
  +---+----+    +---+----+    +---+----+    +---+----+
  | Vision |    | Table  |    | Text   |    | Code   |
  | Model  |    | Parser |    | Parser |    | Parser |
  +---+----+    +---+----+    +---+----+    +---+----+
      |             |             |             |
      v             v             v             v
      +---------+---+----+-------+------+------+
                |  Unified Embedding Space |
                +--------------------------+
```

### How to Implement Conversational Memory?

```
Approach 1: Sliding Window (simple)
  Keep last N messages in prompt context.
  Pros: Simple, bounded cost
  Cons: Loses early context

Approach 2: Summary Memory (balanced)
  Periodically summarize older messages into a running summary.

  Messages: [M1, M2, M3, M4, M5, M6, M7, M8, M9, M10]

  After 5 messages:
  Summary: "User asked about ML basics, we discussed supervised learning..."
  Active:  [M6, M7, M8, M9, M10]

  Prompt: [System] + [Summary] + [M6-M10] + [Retrieved Context] + [Query]

Approach 3: RAG over conversation history
  Embed each message and store in a per-session vector store.
  At query time, retrieve relevant past messages alongside document chunks.

Implementation:
```

```python
class ConversationMemory:
    def __init__(self, max_messages: int = 20, summary_threshold: int = 10):
        self.max_messages = max_messages
        self.summary_threshold = summary_threshold

    async def get_context(self, conversation_id: str) -> str:
        messages = await db.get_messages(conversation_id)

        if len(messages) <= self.max_messages:
            return format_messages(messages)

        # Summarize older messages
        older = messages[:-self.summary_threshold]
        recent = messages[-self.summary_threshold:]

        summary = await llm.summarize(
            f"Summarize this conversation so far:\n{format_messages(older)}"
        )

        return f"Previous conversation summary:\n{summary}\n\nRecent messages:\n{format_messages(recent)}"
```

### How to Evaluate RAG Quality at Scale?

```
Automated Evaluation Pipeline:

1. Golden Dataset (human-curated):
   - 500-1000 question/answer/context triples
   - Updated quarterly
   - Covers edge cases and common queries

2. Synthetic Evaluation (LLM-generated):
   - Generate questions from documents using LLM
   - Create expected answers from ground truth
   - Scale to 10K+ test cases automatically

3. Continuous Evaluation:
   - Run RAGAS metrics on 5% of production traffic (shadow eval)
   - Track metrics over time for regression detection
   - Alert on metric drops

4. Human-in-the-Loop:
   - Sample low-confidence responses for human review
   - Use feedback to improve retrieval and generation
   - Periodically audit a random sample

Metrics Dashboard:
  +------------------------------------------+
  | Weekly RAG Quality Report                 |
  +------------------------------------------+
  | Faithfulness:   0.92 (+0.02 vs last week)|
  | Relevance:      0.88 (-0.01)             |
  | Context Recall: 0.85 (+0.03)             |
  | Hallucination:  4.2% (-0.8%)             |
  | User Satisfaction: 82% (+2%)             |
  +------------------------------------------+
```

### How to Handle Conflicting Information in Documents?

```
Strategy 1: Temporal Priority
  - Always prefer the most recently updated document
  - Include document dates in metadata and prompt

Strategy 2: Source Authority
  - Assign trust scores to document sources
  - Official docs > internal wikis > user-generated content
  - Weight retrieval scores by source authority

Strategy 3: Explicit Conflict Detection
  - Post-retrieval: Use LLM to detect conflicting claims
  - Present both perspectives to the user with sources

  Example response:
  "According to the 2024 policy document, the limit is $5,000.
   However, the 2023 handbook states $3,000. The more recent
   policy (2024) likely supersedes the earlier document.
   [Source: Policy v3.2, Jan 2024] [Source: Handbook v2.0, Mar 2023]"

Strategy 4: Retrieval-Time Deduplication
  - Detect near-duplicate chunks from different document versions
  - Keep only the most recent version
  - Log conflicts for admin review
```

---

## Summary: Interview Checklist

When designing a RAG system in an interview, make sure to cover:

```
+---+------------------------------------------------------------------+
| # | Topic                                                            |
+---+------------------------------------------------------------------+
| 1 | Requirements: scale, latency, accuracy, cost constraints         |
+---+------------------------------------------------------------------+
| 2 | Ingestion: parsing, chunking strategy (parent-child recommended) |
+---+------------------------------------------------------------------+
| 3 | Embedding: model choice, dimensions, batch vs real-time          |
+---+------------------------------------------------------------------+
| 4 | Vector DB: selection rationale, indexing (HNSW), hybrid search   |
+---+------------------------------------------------------------------+
| 5 | Retrieval: multi-query, reranking, metadata filtering            |
+---+------------------------------------------------------------------+
| 6 | Context assembly: prompt design, lost-in-middle, citations       |
+---+------------------------------------------------------------------+
| 7 | LLM serving: API vs self-hosted, optimization (KV cache, quant.) |
+---+------------------------------------------------------------------+
| 8 | Streaming: SSE for token-by-token output                         |
+---+------------------------------------------------------------------+
| 9 | Evaluation: RAGAS metrics, online monitoring, feedback loops      |
+---+------------------------------------------------------------------+
|10 | Scaling: sharding, caching (semantic cache), auto-scaling GPUs   |
+---+------------------------------------------------------------------+
|11 | Cost: model routing, caching, quantization, batch processing     |
+---+------------------------------------------------------------------+
|12 | Edge cases: hallucinations, conflicts, multi-modal, real-time    |
+---+------------------------------------------------------------------+
```

**Key differentiators in interviews:**
- Mention parent-child chunking (shows depth beyond naive RAG)
- Discuss hybrid search (dense + sparse) over pure vector search
- Bring up semantic caching as a cost/latency optimization
- Mention cross-encoder reranking as a precision booster
- Discuss RAGAS framework for evaluation (shows production awareness)
- Consider cost-aware model routing (shows business acumen)
- Address the lost-in-the-middle problem (shows research awareness)
