# Data Model: RAG Pipeline & LLM Serving

A Retrieval-Augmented Generation (RAG) system grounds LLM responses in factual documents by retrieving relevant context before generation. The data model must support two pipelines: an ingestion pipeline that chunks documents and computes embeddings, and a query pipeline that performs vector search, reranks results, and feeds context to the LLM. The key challenge is balancing retrieval quality (recall) against latency.

## Table Responsibilities

| Table               | Purpose                                     | Storage                              | Key Characteristic                                           |
| ------------------- | ------------------------------------------- | ------------------------------------ | ------------------------------------------------------------ |
| **documents**       | Source document metadata and access control | PostgreSQL                           | Source of truth for document lifecycle                       |
| **chunks**          | Document segments with embeddings           | PostgreSQL + Vector DB               | Core retrieval unit, sized for LLM context windows           |
| **embedding_index** | ANN search index over chunk vectors         | Vector DB (Pinecone/pgvector/Milvus) | Enables sub-100ms similarity search over millions of vectors |
| **retrieval_logs**  | Query audit trail and feedback loop         | PostgreSQL (partitioned by date)     | Powers retrieval quality evaluation and model fine-tuning    |

## Detailed Field Descriptions

### documents

| Field           | Type                | Description                                                                                                                                                              |
| --------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| document_id     | UUID, PK            | Unique document identifier. UUID avoids sequential guessing and works across distributed ingestion workers.                                                              |
| source          | VARCHAR(100), INDEX | Where the document came from (e.g., "confluence", "gdrive", "github"). Indexed for source-specific re-ingestion and filtering.                                           |
| title           | VARCHAR(512)        | Document title. Included in chunk metadata to provide context to the LLM (a chunk from "API Security Guide" is interpreted differently than one from "Cooking Recipes"). |
| author          | VARCHAR(255)        | Document author. Used for access control checks and attribution in generated responses.                                                                                  |
| category        | VARCHAR(100), INDEX | Topic category. Enables scoped retrieval ("search only engineering docs") to improve precision.                                                                          |
| access_level    | VARCHAR(50), INDEX  | Access control tag (e.g., "public", "internal", "confidential"). Filtered at query time to ensure users only retrieve documents they are authorized to see.              |
| raw_content_url | TEXT                | S3 URL to the original document. Kept for re-chunking if the chunking strategy changes (e.g., switching from fixed-size to semantic chunking).                           |
| created_at      | TIMESTAMP           | Document creation/upload time. Used for freshness-weighted retrieval.                                                                                                    |

**Why store `raw_content_url` separately?** Chunking strategies evolve. When you switch from 512-token fixed chunks to semantic paragraph-based chunks, you need to re-process the original document. Storing the raw content in S3 avoids data loss and enables re-ingestion without re-crawling sources.

### chunks

| Field         | Type                  | Description                                                                                                                                                                                 |
| ------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| chunk_id      | UUID, PK              | Unique chunk identifier. Used as the key in the vector index for mapping search results back to text.                                                                                       |
| document_id   | UUID, FK -> documents | Parent document. Enables fetching neighboring chunks for expanded context ("retrieve the chunk before and after the match").                                                                |
| chunk_index   | INT                   | Position of this chunk within the document (0-indexed). Enables ordering chunks and fetching surrounding context.                                                                           |
| text          | TEXT, NOT NULL        | The actual text content of the chunk. This is what gets injected into the LLM prompt as context.                                                                                            |
| token_count   | INT                   | Number of tokens in this chunk (model-specific tokenizer). Ensures chunks fit within the LLM's context window and enables precise token budget management.                                  |
| embedding     | VECTOR(1536)          | Dense vector representation of the text (e.g., OpenAI text-embedding-3-small produces 1536 dimensions). The core data for similarity search.                                                |
| metadata_json | JSONB                 | Flexible metadata (section headers, page numbers, table flags, etc.). Passed to the LLM alongside the text for richer context. Stored as JSONB because metadata structure varies by source. |

**Why track `token_count`?** LLMs have fixed context windows (e.g., 128K tokens). When assembling the prompt, we need to pack as many relevant chunks as possible without exceeding the limit. Pre-computed token counts enable greedy packing without re-tokenizing at query time.

**Why `chunk_index`?** When a chunk matches a query, the surrounding chunks often contain relevant context. Storing the index lets us fetch `chunk_index - 1` and `chunk_index + 1` to provide the LLM with a wider window around the match, significantly improving answer quality.

### embedding_index (Vector DB)

| Field    | Type        | Description                                                                                                                                               |
| -------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| chunk_id | UUID, PK    | Maps directly to chunks table. The vector DB stores the vector and returns chunk_ids, which are then used to fetch full text from the chunks table.       |
| vector   | FLOAT[1536] | The embedding vector, indexed for Approximate Nearest Neighbor (ANN) search. Index type (HNSW or IVF) is chosen based on the recall-vs-latency trade-off. |

**Why a separate vector index instead of pgvector?** Dedicated vector databases (Pinecone, Milvus, Qdrant) are optimized for ANN search at scale. pgvector works well under ~1M vectors but degrades at larger scale. A dedicated vector DB provides better recall, lower latency, and independent scaling of the search tier.

**Why HNSW over IVF?** HNSW (Hierarchical Navigable Small World) provides consistently high recall (>95%) with sub-10ms latency and does not require periodic retraining. IVF (Inverted File Index) is more memory-efficient but requires cluster retraining as data grows and has lower recall at the same speed.

### retrieval_logs

| Field               | Type               | Description                                                                                                                 |
| ------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| query_id            | UUID, PK           | Unique identifier for each query. Enables end-to-end tracing.                                                               |
| user_id             | BIGINT, INDEX      | Who issued the query. Used for personalization analysis and access auditing.                                                |
| query_text          | TEXT               | The original user question. Stored for query analysis, clustering common questions, and fine-tuning.                        |
| query_embedding     | VECTOR(1536)       | The embedded query vector. Cached to avoid re-embedding for analytics (e.g., "what queries produce poor results?").         |
| retrieved_chunk_ids | UUID[]             | Chunk IDs returned by vector search (before reranking). Enables measuring raw retrieval recall.                             |
| reranked_chunk_ids  | UUID[]             | Chunk IDs after cross-encoder reranking. Comparing with retrieved_chunk_ids shows how much reranking helps.                 |
| llm_response        | TEXT               | The generated answer. Stored for quality evaluation and hallucination detection.                                            |
| latency_ms          | INT                | End-to-end query latency. Broken down by stage (embedding, retrieval, reranking, generation) for bottleneck identification. |
| feedback            | SMALLINT, NULLABLE | User feedback (thumbs up/down or 1-5 rating). The most valuable signal for improving retrieval quality.                     |

**Why log both `retrieved_chunk_ids` and `reranked_chunk_ids`?** This lets you measure the value of the reranker. If reranking consistently promotes chunk X from position 8 to position 1, the retrieval stage needs improvement. If reranking rarely changes the order, you might remove it to save latency.

## ER Diagram

```
┌──────────────────────┐
│     documents         │
│──────────────────────│
│ document_id (PK)      │
│ source                │
│ title                 │
│ author                │
│ category              │
│ access_level          │
│ raw_content_url       │
│ created_at            │
└──────────────────────┘
          │
          │ 1
          │
          │ *
┌──────────────────────┐       ┌──────────────────────┐
│      chunks           │       │   embedding_index     │
│──────────────────────│       │   (Vector DB)         │
│ chunk_id (PK) ────────│──────►│ chunk_id (PK)         │
│ document_id (FK)      │       │ vector                │
│ chunk_index           │       └──────────────────────┘
│ text                  │
│ token_count           │
│ embedding             │
│ metadata_json         │
└──────────────────────┘
          │
          │ *
          │
          │ referenced by
          │
┌──────────────────────┐
│   retrieval_logs      │
│──────────────────────│
│ query_id (PK)         │
│ user_id               │
│ query_text            │
│ query_embedding       │
│ retrieved_chunk_ids   │──── references chunk_ids
│ reranked_chunk_ids    │──── references chunk_ids
│ llm_response          │
│ latency_ms            │
│ feedback              │
└──────────────────────┘

Relationships:
  documents 1───* chunks           (one document split into many chunks)
  chunks    1───1 embedding_index  (each chunk has exactly one vector entry)
  chunks    *───* retrieval_logs   (chunks referenced in query results)
```

## Data Flow

### Ingestion Pipeline (Write Path)

```
1. Document uploaded or crawled from source system
         │
         ▼
2. INSERT metadata into documents table
   Store raw content at raw_content_url (S3)
         │
         ▼
3. Parse document (PDF, HTML, Markdown, etc.)
   Clean: remove headers/footers, normalize whitespace
         │
         ▼
4. Chunk the document
   Strategy options:
   - Fixed-size: 512 tokens with 50-token overlap
   - Semantic: split on paragraph/section boundaries
   - Recursive: split by headers, then paragraphs, then sentences
         │
         ▼
5. For each chunk: generate embedding via embedding model API
         │
         ▼
6. INSERT chunks with embeddings into chunks table
         │
         ▼
7. Upsert vectors into embedding_index (Vector DB)
   with chunk_id as the key
```

### Query Pipeline (Read Path)

```
1. User submits question
         │
         ▼
2. Query rewriting (optional):
   - Expand acronyms
   - Decompose multi-part questions
   - Generate hypothetical answer (HyDE) for better embedding
         │
         ▼
3. Embed the query using same embedding model as ingestion
         │
         ▼
4. Vector search: find top-K nearest chunks in embedding_index
   (typically K=20-50 candidates)
         │
         ▼
5. (Optional) BM25 keyword search in parallel
   Merge results with vector search (hybrid retrieval)
         │
         ▼
6. Rerank candidates using cross-encoder model
   (scores each query-chunk pair, more accurate but slower)
   Select top-N (typically N=5-10)
         │
         ▼
7. Filter by access_level (join with documents table)
         │
         ▼
8. Assemble LLM prompt:
   System message + retrieved chunks + user question
         │
         ▼
9. Generate response via LLM
   Include chunk citations in response
         │
         ▼
10. Log everything to retrieval_logs
          │
          ▼
11. Return response with source citations to user
```

**Why hybrid retrieval (vector + BM25)?** Vector search excels at semantic similarity ("how to deploy" matches "deployment guide") but can miss exact keyword matches (error codes, product names). BM25 catches exact matches. Combining both consistently outperforms either alone by 5-15% on retrieval benchmarks.

**Why rerank with a cross-encoder?** The embedding model encodes query and chunk independently (bi-encoder), which is fast but less accurate. The cross-encoder processes query and chunk together, capturing fine-grained interactions. It is 100x slower than vector search but applied only to the top-K candidates, so the total added latency is ~50-100ms.
