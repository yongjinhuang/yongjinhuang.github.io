# RAG Systems (Retrieval-Augmented Generation)

A complete guide to building RAG pipelines -- from document ingestion to evaluation.
Covers chunking strategies, embedding models, vector databases, retrieval techniques,
and production evaluation metrics with full Python implementations.

---

## Table of Contents

1. [What Is RAG and Why It Matters](#what-is-rag-and-why-it-matters)
2. [End-to-End RAG Architecture](#end-to-end-rag-architecture)
3. [Document Ingestion](#document-ingestion)
4. [Chunking Strategies](#chunking-strategies)
5. [Embedding Models](#embedding-models)
6. [Vector Databases](#vector-databases)
7. [Similarity Search](#similarity-search)
8. [Retrieval Strategies](#retrieval-strategies)
9. [Complete RAG Implementation](#complete-rag-implementation)
10. [Evaluation Metrics](#evaluation-metrics)
11. [Common Interview Questions](#common-interview-questions)
12. [Quick Reference](#quick-reference)

---

## What Is RAG and Why It Matters

RAG augments an LLM's knowledge by retrieving relevant documents from an external
knowledge base before generating a response. Instead of relying solely on what the model
memorized during training, RAG grounds answers in specific, up-to-date sources.

### RAG vs Fine-Tuning vs Prompt Engineering

```
+---------------------+------------------+------------------+------------------+
| Dimension           | Prompt Eng.      | RAG              | Fine-Tuning      |
+---------------------+------------------+------------------+------------------+
| Knowledge update    | Manual           | Real-time        | Requires retrain |
| Cost                | Low              | Medium           | High             |
| Implementation time | Hours            | Days-Weeks       | Weeks-Months     |
| Hallucination ctrl  | Limited          | Strong           | Moderate         |
| Domain adaptation   | Surface-level    | Deep (retrieval) | Deep (weights)   |
| Latency overhead    | None             | +200-500ms       | None             |
| Data privacy        | N/A              | Full control     | Shared w/ vendor |
| Maintenance         | Low              | Medium           | High             |
| Best for            | Simple tasks     | Knowledge-heavy  | Style/behavior   |
+---------------------+------------------+------------------+------------------+
```

**When to use RAG:**
- Enterprise knowledge bases (internal docs, wikis, policies)
- Customer support with product-specific knowledge
- Legal/medical/financial domain Q&A
- Any scenario where knowledge changes frequently
- When you need citations and source attribution

---

## End-to-End RAG Architecture

```
                    INGESTION PIPELINE (Offline / Async)
  +------------------------------------------------------------------------+
  |                                                                        |
  |  +----------+    +-----------+    +-----------+    +---------------+   |
  |  | Documents |--->| Parser &  |--->| Chunking  |--->| Embedding     |   |
  |  | (PDF,HTML |    | Cleaner   |    | Engine    |    | Model         |   |
  |  |  MD,DOCX) |    +-----------+    +-----------+    +------+--------+   |
  |  +----------+                                              |            |
  |                                                            v            |
  |                                      +------------+  +---------------+  |
  |                                      | Metadata   |  | Vector DB     |  |
  |                                      | Store      |  | (embeddings)  |  |
  |                                      +------------+  +---------------+  |
  +------------------------------------------------------------------------+

                    QUERY PIPELINE (Online / Sync)
  +------------------------------------------------------------------------+
  |                                                                        |
  |  +-------+    +----------+    +----------+    +-----------+            |
  |  | User  |--->| Query    |--->| Embedding|--->| Vector    |            |
  |  | Query |    | Rewriter |    | Model    |    | Search    |            |
  |  +-------+    +----------+    +----------+    +-----+-----+            |
  |                                                     |                  |
  |                                                     v                  |
  |  +----------+    +-----------+    +-----------+   +----------+         |
  |  | Response |<---| LLM       |<---| Context   |<--| Reranker |         |
  |  | + Cites  |    | Generator |    | Assembler |   |          |         |
  |  +----------+    +-----------+    +-----------+   +----------+         |
  +------------------------------------------------------------------------+
```

---

## Document Ingestion

### Parsing Different Document Types

```python
from dataclasses import dataclass

@dataclass(frozen=True)
class ParsedDocument:
    content: str
    metadata: dict
    source: str

def parse_document(file_path: str) -> ParsedDocument:
    """Parse document based on file extension."""
    ext = file_path.rsplit(".", 1)[-1].lower()

    parsers = {
        "pdf": parse_pdf,
        "html": parse_html,
        "md": parse_markdown,
        "txt": parse_text,
        "docx": parse_docx,
    }

    parser = parsers.get(ext)
    if parser is None:
        raise ValueError(f"Unsupported file type: {ext}")

    return parser(file_path)


def parse_pdf(file_path: str) -> ParsedDocument:
    """Parse PDF using PyMuPDF."""
    import fitz  # PyMuPDF

    doc = fitz.open(file_path)
    pages = []
    for page in doc:
        pages.append(page.get_text())

    return ParsedDocument(
        content="\n\n".join(pages),
        metadata={
            "source": file_path,
            "type": "pdf",
            "pages": len(doc),
            "title": doc.metadata.get("title", ""),
        },
        source=file_path,
    )


def parse_html(file_path: str) -> ParsedDocument:
    """Parse HTML, extracting main content."""
    from bs4 import BeautifulSoup

    with open(file_path, "r", encoding="utf-8") as f:
        soup = BeautifulSoup(f.read(), "html.parser")

    # Remove script and style elements
    for tag in soup(["script", "style", "nav", "footer", "header"]):
        tag.decompose()

    text = soup.get_text(separator="\n", strip=True)

    return ParsedDocument(
        content=text,
        metadata={
            "source": file_path,
            "type": "html",
            "title": soup.title.string if soup.title else "",
        },
        source=file_path,
    )
```

### Document Parsing Tools Comparison

| Tool | Best For | Strengths | Weaknesses |
|------|----------|-----------|------------|
| **PyMuPDF (fitz)** | PDF | Fast, handles most PDFs | Struggles with scanned docs |
| **pdfplumber** | PDF with tables | Great table extraction | Slower than PyMuPDF |
| **Unstructured** | Multi-format | Handles 20+ formats | Heavy dependency |
| **LlamaParse** | Complex PDFs | AI-powered parsing | API cost, latency |
| **BeautifulSoup** | HTML | Flexible, well-known | Manual boilerplate removal |
| **Trafilatura** | Web pages | Auto-extracts main content | May miss structured data |
| **python-docx** | DOCX | Native Word support | No complex layouts |

---

## Chunking Strategies

Chunking determines how documents are split into pieces for embedding and retrieval.
This is the single most impactful decision in RAG quality.

### 1. Fixed-Size Chunking

Split by token/character count with optional overlap.

```python
import tiktoken

def fixed_size_chunk(
    text: str,
    chunk_size: int = 512,
    chunk_overlap: int = 50,
    model: str = "gpt-4o",
) -> list[str]:
    """Split text into fixed-size chunks with overlap."""
    enc = tiktoken.encoding_for_model(model)
    tokens = enc.encode(text)
    chunks = []
    start = 0

    while start < len(tokens):
        end = min(start + chunk_size, len(tokens))
        chunk_tokens = tokens[start:end]
        chunks.append(enc.decode(chunk_tokens))
        start += chunk_size - chunk_overlap

    return chunks
```

**Pros:** Simple, predictable chunk sizes, easy to reason about cost.
**Cons:** Splits mid-sentence/paragraph, loses semantic coherence.

### 2. Recursive Character Chunking

Split at natural boundaries (paragraphs, sentences, words) recursively.

```python
def recursive_chunk(
    text: str,
    chunk_size: int = 1000,
    chunk_overlap: int = 200,
    separators: list[str] | None = None,
) -> list[str]:
    """Recursively split text at natural boundaries."""
    if separators is None:
        separators = ["\n\n", "\n", ". ", " ", ""]

    chunks = []
    current_sep = separators[0]
    remaining_seps = separators[1:]

    # Split on current separator
    parts = text.split(current_sep) if current_sep else list(text)

    current_chunk: list[str] = []
    current_length = 0

    for part in parts:
        part_with_sep = part + current_sep if current_sep else part
        part_length = len(part_with_sep)

        if current_length + part_length > chunk_size and current_chunk:
            # Current chunk is full, save it
            chunk_text = current_sep.join(current_chunk) if current_sep else "".join(current_chunk)

            if len(chunk_text) > chunk_size and remaining_seps:
                # Chunk still too large, recurse with finer separator
                sub_chunks = recursive_chunk(
                    chunk_text, chunk_size, chunk_overlap, remaining_seps
                )
                chunks.extend(sub_chunks)
            else:
                chunks.append(chunk_text)

            # Keep overlap
            overlap_parts: list[str] = []
            overlap_len = 0
            for p in reversed(current_chunk):
                p_len = len(p + current_sep) if current_sep else len(p)
                if overlap_len + p_len > chunk_overlap:
                    break
                overlap_parts.insert(0, p)
                overlap_len += p_len
            current_chunk = overlap_parts
            current_length = overlap_len

        current_chunk.append(part)
        current_length += part_length

    # Handle remaining text
    if current_chunk:
        remaining_text = current_sep.join(current_chunk) if current_sep else "".join(current_chunk)
        chunks.append(remaining_text)

    return chunks
```

**Pros:** Respects natural boundaries, better semantic coherence.
**Cons:** Variable chunk sizes, more complex implementation.

### 3. Semantic Chunking

Split based on embedding similarity between sentences. Group semantically similar
sentences together.

```python
import numpy as np
from openai import OpenAI

def semantic_chunk(
    text: str,
    threshold: float = 0.5,
    max_chunk_size: int = 1000,
) -> list[str]:
    """Split text into semantically coherent chunks."""
    client = OpenAI()

    # Split into sentences
    sentences = [s.strip() for s in text.split(". ") if s.strip()]

    # Get embeddings for each sentence
    response = client.embeddings.create(
        model="text-embedding-3-small",
        input=sentences,
    )
    embeddings = [item.embedding for item in response.data]

    # Calculate similarity between consecutive sentences
    chunks = []
    current_chunk = [sentences[0]]

    for i in range(1, len(sentences)):
        sim = cosine_similarity(embeddings[i - 1], embeddings[i])

        chunk_text = ". ".join(current_chunk)
        if sim < threshold or len(chunk_text) > max_chunk_size:
            chunks.append(chunk_text + ".")
            current_chunk = [sentences[i]]
        else:
            current_chunk.append(sentences[i])

    if current_chunk:
        chunks.append(". ".join(current_chunk) + ".")

    return chunks


def cosine_similarity(a: list[float], b: list[float]) -> float:
    a_arr = np.array(a)
    b_arr = np.array(b)
    return float(np.dot(a_arr, b_arr) / (np.linalg.norm(a_arr) * np.linalg.norm(b_arr)))
```

**Pros:** Best semantic coherence, adaptive to content.
**Cons:** Requires embedding API calls during chunking (cost), slower.

### Chunking Strategy Comparison

```
+---------------------+--------+----------+---------+---------+
| Strategy            | Quality| Speed    | Cost    | Best For|
+---------------------+--------+----------+---------+---------+
| Fixed-size          | Low    | Fastest  | Free    | Quick   |
|                     |        |          |         | MVP     |
| Recursive character | Medium | Fast     | Free    | General |
|                     |        |          |         | purpose |
| Semantic            | High   | Slow     | $$      | High    |
|                     |        |          |         | quality |
| Parent-child        | High   | Medium   | $       | Complex |
| (hierarchical)      |        |          |         | docs    |
+---------------------+--------+----------+---------+---------+
```

### Chunk Size Guidelines

| Document Type | Recommended Size | Overlap | Reasoning |
|--------------|-----------------|---------|-----------|
| Technical docs | 512-1024 tokens | 50-100 | Dense info, need context |
| Legal contracts | 256-512 tokens | 100-150 | Precise retrieval needed |
| Customer support FAQs | 128-256 tokens | 20-50 | Short, focused answers |
| Long-form articles | 512-1024 tokens | 100-200 | Preserve narrative flow |
| Code documentation | 256-512 tokens | 50 | Function-level granularity |

---

## Embedding Models

Embeddings convert text into dense vectors in a high-dimensional space where semantically
similar texts are close together.

### Popular Embedding Models (2025)

| Model | Dimensions | Max Tokens | MTEB Score | Cost (per 1M tokens) |
|-------|-----------|-----------|-----------|---------------------|
| text-embedding-3-large (OpenAI) | 3072 | 8191 | 64.6 | $0.13 |
| text-embedding-3-small (OpenAI) | 1536 | 8191 | 62.3 | $0.02 |
| Cohere Embed v3 | 1024 | 512 | 64.5 | $0.10 |
| BGE-large-en-v1.5 | 1024 | 512 | 63.5 | Free (self-hosted) |
| E5-mistral-7b-instruct | 4096 | 32768 | 66.6 | Free (self-hosted) |
| Voyage-3 | 1024 | 32000 | 67.1 | $0.06 |
| Jina Embeddings v3 | 1024 | 8192 | 65.5 | $0.02 |

### Generating Embeddings

```python
from openai import OpenAI

client = OpenAI()

def get_embeddings(texts: list[str], model: str = "text-embedding-3-small") -> list[list[float]]:
    """Generate embeddings for a list of texts."""
    # OpenAI allows batching up to 2048 inputs
    response = client.embeddings.create(
        model=model,
        input=texts,
    )
    return [item.embedding for item in response.data]


# Single text
embedding = get_embeddings(["What is machine learning?"])[0]
print(f"Dimensions: {len(embedding)}")  # 1536 for text-embedding-3-small

# Batch processing
texts = ["Document chunk 1...", "Document chunk 2...", "Document chunk 3..."]
embeddings = get_embeddings(texts)
```

### Open-Source Embeddings with Sentence-Transformers

```python
from sentence_transformers import SentenceTransformer

model = SentenceTransformer("BAAI/bge-large-en-v1.5")

texts = ["What is machine learning?", "ML is a subset of AI"]
embeddings = model.encode(texts, normalize_embeddings=True)

# Compute similarity
similarity = embeddings[0] @ embeddings[1]
print(f"Similarity: {similarity:.4f}")
```

---

## Vector Databases

Vector databases store embeddings and enable fast similarity search at scale.

### Vector Database Comparison

```
+------------------+------------+----------+--------+-----------+----------+
| Database         | Type       | Hosting  | Scale  | Best For  | Filters  |
+------------------+------------+----------+--------+-----------+----------+
| Pinecone         | Managed    | Cloud    | 1B+    | Production| Yes      |
| Weaviate         | Self/Cloud | Both     | 100M+  | Hybrid    | Yes      |
| Qdrant           | Self/Cloud | Both     | 100M+  | Performance| Yes     |
| ChromaDB         | Embedded   | Local    | 1M     | Prototyping| Yes     |
| pgvector         | Extension  | Self     | 10M    | Postgres  | Yes      |
| Milvus           | Self/Cloud | Both     | 1B+    | Large scale| Yes     |
| FAISS            | Library    | In-memory| 1B+    | Research  | No       |
+------------------+------------+----------+--------+-----------+----------+
```

### ChromaDB (Prototyping / Small Scale)

```python
import chromadb

client = chromadb.Client()

collection = client.create_collection(
    name="documents",
    metadata={"hnsw:space": "cosine"},
)

# Add documents with embeddings
collection.add(
    ids=["doc1", "doc2", "doc3"],
    documents=[
        "Python is a programming language",
        "Machine learning uses algorithms to learn from data",
        "Docker containers package applications",
    ],
    metadatas=[
        {"source": "wiki", "topic": "programming"},
        {"source": "textbook", "topic": "ml"},
        {"source": "docs", "topic": "devops"},
    ],
)

# Query
results = collection.query(
    query_texts=["What is ML?"],
    n_results=2,
    where={"topic": "ml"},  # Metadata filter
)
print(results["documents"])
```

### pgvector (Production with PostgreSQL)

```python
import psycopg2
from pgvector.psycopg2 import register_vector

conn = psycopg2.connect("postgresql://localhost/mydb")
register_vector(conn)

cur = conn.cursor()

# Create table with vector column
cur.execute("""
    CREATE TABLE IF NOT EXISTS documents (
        id SERIAL PRIMARY KEY,
        content TEXT NOT NULL,
        embedding vector(1536),
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW()
    )
""")

# Create HNSW index for fast similarity search
cur.execute("""
    CREATE INDEX IF NOT EXISTS documents_embedding_idx
    ON documents USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 200)
""")

# Insert document
import numpy as np
embedding = np.random.rand(1536).tolist()  # Replace with real embedding
cur.execute(
    "INSERT INTO documents (content, embedding, metadata) VALUES (%s, %s, %s)",
    ("Document text here", embedding, '{"source": "wiki"}'),
)

# Similarity search
query_embedding = np.random.rand(1536).tolist()
cur.execute("""
    SELECT content, 1 - (embedding <=> %s::vector) AS similarity
    FROM documents
    ORDER BY embedding <=> %s::vector
    LIMIT 5
""", (query_embedding, query_embedding))

results = cur.fetchall()
conn.commit()
```

### Pinecone (Managed Production)

```python
from pinecone import Pinecone

pc = Pinecone(api_key="your-api-key")

index = pc.Index("documents")

# Upsert vectors
index.upsert(
    vectors=[
        {
            "id": "doc1",
            "values": [0.1, 0.2, ...],  # 1536-dim embedding
            "metadata": {"source": "wiki", "topic": "ml", "date": "2025-01-15"},
        },
    ],
    namespace="production",
)

# Query with metadata filter
results = index.query(
    vector=[0.1, 0.2, ...],  # query embedding
    top_k=5,
    namespace="production",
    filter={"topic": {"$eq": "ml"}},
    include_metadata=True,
)

for match in results["matches"]:
    print(f"Score: {match['score']:.4f}, ID: {match['id']}")
```

---

## Similarity Search

### Distance Metrics

| Metric | Formula | Range | Best For | Notes |
|--------|---------|-------|----------|-------|
| **Cosine** | 1 - (A . B)/(||A|| * ||B||) | [0, 2] | Most text embeddings | Normalized, direction-based |
| **Dot Product** | A . B | (-inf, inf) | When magnitude matters | Faster than cosine |
| **L2 (Euclidean)** | sqrt(sum((A-B)^2)) | [0, inf) | Spatial similarity | Sensitive to magnitude |

**Rule of thumb:** Use cosine similarity for text embeddings. Most embedding models are
designed to work best with cosine distance.

### Approximate Nearest Neighbors (ANN)

Exact nearest neighbor search is O(n) per query. ANN algorithms trade accuracy for
speed, enabling sub-millisecond search over billions of vectors.

```
+---------------------+---------+------------+----------+------------------+
| Algorithm           | Speed   | Memory     | Accuracy | Used By          |
+---------------------+---------+------------+----------+------------------+
| HNSW                | Fast    | High       | 99%+     | pgvector, Qdrant |
| IVF (Inverted File) | Medium  | Medium     | 95%+     | FAISS, Milvus    |
| Product Quantization| Fastest | Lowest     | 90%+     | FAISS            |
| ScaNN               | Fast    | Medium     | 98%+     | Google           |
+---------------------+---------+------------+----------+------------------+
```

**HNSW (Hierarchical Navigable Small World)** is the most popular for production:
- Build time: O(n log n)
- Query time: O(log n)
- Recall: 95-99%+ with proper tuning

---

## Retrieval Strategies

### 1. Basic Vector Search (Naive RAG)

```python
def basic_retrieval(query: str, collection, top_k: int = 5) -> list[str]:
    """Simple vector similarity search."""
    results = collection.query(
        query_texts=[query],
        n_results=top_k,
    )
    return results["documents"][0]
```

### 2. Hybrid Search (Dense + Sparse)

Combine semantic (dense) search with keyword (sparse) search for better recall.

```python
def hybrid_search(
    query: str,
    dense_results: list[dict],
    sparse_results: list[dict],
    alpha: float = 0.7,
) -> list[dict]:
    """Combine dense (semantic) and sparse (keyword) search results.

    alpha: weight for dense results (1.0 = all dense, 0.0 = all sparse)
    """
    # Normalize scores to [0, 1] range
    all_docs = {}

    for doc in dense_results:
        all_docs[doc["id"]] = {
            "dense_score": doc["score"],
            "sparse_score": 0.0,
            "content": doc["content"],
        }

    for doc in sparse_results:
        if doc["id"] in all_docs:
            all_docs[doc["id"]]["sparse_score"] = doc["score"]
        else:
            all_docs[doc["id"]] = {
                "dense_score": 0.0,
                "sparse_score": doc["score"],
                "content": doc["content"],
            }

    # Compute hybrid score
    scored = []
    for doc_id, doc in all_docs.items():
        hybrid_score = alpha * doc["dense_score"] + (1 - alpha) * doc["sparse_score"]
        scored.append({
            "id": doc_id,
            "score": hybrid_score,
            "content": doc["content"],
        })

    return sorted(scored, key=lambda x: x["score"], reverse=True)
```

### 3. Reranking

Use a cross-encoder to rerank initial retrieval results for higher precision.

```python
from sentence_transformers import CrossEncoder

reranker = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-12-v2")

def rerank_results(
    query: str,
    documents: list[str],
    top_k: int = 5,
) -> list[dict]:
    """Rerank retrieved documents using a cross-encoder."""
    pairs = [(query, doc) for doc in documents]
    scores = reranker.predict(pairs)

    ranked = sorted(
        zip(documents, scores),
        key=lambda x: x[1],
        reverse=True,
    )

    return [
        {"content": doc, "score": float(score)}
        for doc, score in ranked[:top_k]
    ]
```

### 4. Maximal Marginal Relevance (MMR)

Reduce redundancy in retrieved results by penalizing documents similar to already
selected ones.

```python
import numpy as np

def mmr_search(
    query_embedding: list[float],
    document_embeddings: list[list[float]],
    documents: list[str],
    top_k: int = 5,
    lambda_param: float = 0.7,
) -> list[str]:
    """Select diverse, relevant documents using MMR."""
    query_vec = np.array(query_embedding)
    doc_vecs = np.array(document_embeddings)

    # Compute query-document similarities
    query_sims = doc_vecs @ query_vec / (
        np.linalg.norm(doc_vecs, axis=1) * np.linalg.norm(query_vec)
    )

    selected_indices: list[int] = []
    remaining = list(range(len(documents)))

    for _ in range(min(top_k, len(documents))):
        best_score = -float("inf")
        best_idx = -1

        for idx in remaining:
            relevance = query_sims[idx]

            # Max similarity to already selected documents
            if selected_indices:
                selected_vecs = doc_vecs[selected_indices]
                doc_sims = selected_vecs @ doc_vecs[idx] / (
                    np.linalg.norm(selected_vecs, axis=1) * np.linalg.norm(doc_vecs[idx])
                )
                max_sim_to_selected = float(np.max(doc_sims))
            else:
                max_sim_to_selected = 0.0

            mmr_score = lambda_param * relevance - (1 - lambda_param) * max_sim_to_selected

            if mmr_score > best_score:
                best_score = mmr_score
                best_idx = idx

        selected_indices.append(best_idx)
        remaining.remove(best_idx)

    return [documents[i] for i in selected_indices]
```

### 5. Query Transformation

Improve retrieval by transforming the user query before searching.

```python
def query_expansion(client, query: str) -> list[str]:
    """Generate multiple query variations for better recall."""
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        temperature=0.7,
        messages=[
            {
                "role": "system",
                "content": "Generate 3 alternative phrasings of the user query "
                           "for document retrieval. Return one per line.",
            },
            {"role": "user", "content": query},
        ],
    )
    variations = response.choices[0].message.content.strip().split("\n")
    return [query] + [v.strip() for v in variations if v.strip()]


def hyde_query(client, query: str) -> str:
    """HyDE: Generate a hypothetical document that would answer the query,
    then use that document's embedding for retrieval."""
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        temperature=0,
        messages=[
            {
                "role": "system",
                "content": "Write a short paragraph that would be a perfect "
                           "answer to the following question. Write it as if "
                           "it were an excerpt from a document.",
            },
            {"role": "user", "content": query},
        ],
    )
    return response.choices[0].message.content
```

### Retrieval Strategy Decision Guide

```
Start: What is your retrieval quality like?
  |
  +--> Low recall (missing relevant docs)
  |      +--> Try hybrid search (dense + sparse)
  |      +--> Try query expansion / HyDE
  |      +--> Increase top_k
  |
  +--> Low precision (too many irrelevant docs)
  |      +--> Add reranking (cross-encoder)
  |      +--> Add metadata filters
  |      +--> Decrease chunk size
  |
  +--> Redundant results
  |      +--> Use MMR (lambda=0.5-0.7)
  |
  +--> Good retrieval but bad generation
         +--> Improve prompt (add "only use provided context")
         +--> Add citation requirement
         +--> Use more capable LLM
```

---

## Complete RAG Implementation

```python
import json
from dataclasses import dataclass
from openai import OpenAI

@dataclass(frozen=True)
class RetrievedChunk:
    content: str
    source: str
    score: float

@dataclass(frozen=True)
class RAGResponse:
    answer: str
    sources: list[RetrievedChunk]
    model: str
    tokens_used: int


class RAGPipeline:
    """Production-ready RAG pipeline."""

    def __init__(
        self,
        embedding_model: str = "text-embedding-3-small",
        generation_model: str = "gpt-4o",
        top_k: int = 5,
        rerank: bool = True,
    ):
        self.client = OpenAI()
        self.embedding_model = embedding_model
        self.generation_model = generation_model
        self.top_k = top_k
        self.rerank = rerank
        # In production, use a real vector DB
        self._chunks: list[dict] = []
        self._embeddings: list[list[float]] = []

    def ingest(self, documents: list[dict]) -> int:
        """Ingest documents: chunk, embed, and store."""
        all_chunks = []
        for doc in documents:
            chunks = recursive_chunk(doc["content"], chunk_size=512, chunk_overlap=50)
            for chunk in chunks:
                all_chunks.append({
                    "content": chunk,
                    "source": doc["source"],
                    "metadata": doc.get("metadata", {}),
                })

        # Batch embed all chunks
        texts = [c["content"] for c in all_chunks]
        embeddings = self._embed(texts)

        self._chunks.extend(all_chunks)
        self._embeddings.extend(embeddings)

        return len(all_chunks)

    def query(self, question: str) -> RAGResponse:
        """Run the full RAG pipeline."""
        # Step 1: Embed the query
        query_embedding = self._embed([question])[0]

        # Step 2: Retrieve top-k chunks
        retrieved = self._retrieve(query_embedding, self.top_k * 2)

        # Step 3: Rerank (optional)
        if self.rerank and len(retrieved) > self.top_k:
            retrieved = self._rerank(question, retrieved)[:self.top_k]
        else:
            retrieved = retrieved[:self.top_k]

        # Step 4: Generate answer
        context = "\n\n---\n\n".join(
            f"[Source: {r.source}]\n{r.content}" for r in retrieved
        )

        response = self.client.chat.completions.create(
            model=self.generation_model,
            temperature=0,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Answer the question based ONLY on the provided context. "
                        "If the context does not contain enough information, say "
                        "'I don't have enough information to answer this.' "
                        "Cite your sources using [Source: filename] format."
                    ),
                },
                {
                    "role": "user",
                    "content": f"Context:\n{context}\n\nQuestion: {question}",
                },
            ],
        )

        return RAGResponse(
            answer=response.choices[0].message.content,
            sources=retrieved,
            model=self.generation_model,
            tokens_used=response.usage.total_tokens,
        )

    def _embed(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for texts."""
        response = self.client.embeddings.create(
            model=self.embedding_model,
            input=texts,
        )
        return [item.embedding for item in response.data]

    def _retrieve(
        self, query_embedding: list[float], top_k: int
    ) -> list[RetrievedChunk]:
        """Retrieve top-k chunks by cosine similarity."""
        import numpy as np

        query_vec = np.array(query_embedding)
        doc_vecs = np.array(self._embeddings)

        similarities = doc_vecs @ query_vec / (
            np.linalg.norm(doc_vecs, axis=1) * np.linalg.norm(query_vec)
        )

        top_indices = np.argsort(similarities)[::-1][:top_k]

        return [
            RetrievedChunk(
                content=self._chunks[i]["content"],
                source=self._chunks[i]["source"],
                score=float(similarities[i]),
            )
            for i in top_indices
        ]

    def _rerank(
        self, query: str, chunks: list[RetrievedChunk]
    ) -> list[RetrievedChunk]:
        """Rerank using LLM-based scoring."""
        scored = []
        for chunk in chunks:
            response = self.client.chat.completions.create(
                model="gpt-4o-mini",
                temperature=0,
                messages=[
                    {
                        "role": "system",
                        "content": "Rate how relevant this passage is to the query "
                                   "on a scale of 0-10. Respond with just the number.",
                    },
                    {
                        "role": "user",
                        "content": f"Query: {query}\n\nPassage: {chunk.content}",
                    },
                ],
            )
            try:
                score = float(response.choices[0].message.content.strip())
            except ValueError:
                score = 5.0
            scored.append(RetrievedChunk(
                content=chunk.content,
                source=chunk.source,
                score=score,
            ))

        return sorted(scored, key=lambda x: x.score, reverse=True)


# Usage
pipeline = RAGPipeline()

# Ingest documents
pipeline.ingest([
    {"content": "Python is a high-level programming language...", "source": "python-docs.md"},
    {"content": "Docker containers package applications...", "source": "docker-guide.md"},
])

# Query
result = pipeline.query("How do I containerize a Python application?")
print(result.answer)
for source in result.sources:
    print(f"  [{source.source}] (score: {source.score:.3f})")
```

---

## Evaluation Metrics

### Retrieval Metrics

| Metric | What It Measures | Formula |
|--------|-----------------|---------|
| **Recall@k** | Fraction of relevant docs retrieved in top k | relevant_retrieved / total_relevant |
| **Precision@k** | Fraction of retrieved docs that are relevant | relevant_retrieved / k |
| **MRR** | Rank of first relevant result | 1 / rank_of_first_relevant |
| **nDCG@k** | Ranked relevance quality | normalized discounted cumulative gain |
| **Hit Rate** | Whether any relevant doc appears in top k | 1 if any relevant in top k, else 0 |

### Generation Metrics (RAGAS Framework)

```python
# Using RAGAS for RAG evaluation
from ragas import evaluate
from ragas.metrics import (
    faithfulness,
    answer_relevancy,
    context_precision,
    context_recall,
)
from datasets import Dataset

eval_data = {
    "question": ["What is Python?", "How do containers work?"],
    "answer": ["Python is a programming language...", "Containers use OS-level..."],
    "contexts": [
        ["Python is a high-level programming language created by Guido..."],
        ["Docker containers package applications with their dependencies..."],
    ],
    "ground_truth": [
        "Python is a high-level, interpreted programming language.",
        "Containers use OS-level virtualization to package applications.",
    ],
}

dataset = Dataset.from_dict(eval_data)

results = evaluate(
    dataset,
    metrics=[faithfulness, answer_relevancy, context_precision, context_recall],
)

print(results)
# {'faithfulness': 0.92, 'answer_relevancy': 0.87,
#  'context_precision': 0.85, 'context_recall': 0.90}
```

### Key RAGAS Metrics Explained

| Metric | What It Measures | Good Score |
|--------|-----------------|-----------|
| **Faithfulness** | Is the answer grounded in the context? (no hallucination) | > 0.85 |
| **Answer Relevancy** | Is the answer relevant to the question? | > 0.80 |
| **Context Precision** | Are retrieved docs relevant to the question? | > 0.80 |
| **Context Recall** | Does context contain all info needed for ground truth? | > 0.85 |

---

## Common Interview Questions

### Q1: Walk me through how a RAG pipeline works end-to-end.

**Answer:** A RAG pipeline has two phases. The ingestion phase (offline): documents are
parsed, split into chunks (typically 256-1024 tokens with overlap), each chunk is
converted to a vector embedding using a model like text-embedding-3-small, and the
embeddings plus chunk text are stored in a vector database. The query phase (online):
the user question is embedded using the same model, similar chunks are retrieved via
approximate nearest neighbor search (typically HNSW), optionally reranked using a
cross-encoder, and the top-k chunks are assembled into a context prompt. The LLM then
generates an answer grounded in the retrieved context, ideally with citations.

### Q2: How do you choose a chunking strategy?

**Answer:** Start with recursive character chunking (split at paragraphs, then sentences)
with 512-token chunks and 50-100 token overlap. This works well for 80% of use cases. Use
smaller chunks (256 tokens) for precise retrieval (legal, medical) and larger chunks
(1024) for narrative content. If quality is insufficient, try semantic chunking based on
embedding similarity between sentences. For structured documents, use parent-child
chunking where small chunks are retrieved but the parent (larger context) is passed to
the LLM. Always measure with Recall@k -- chunk size is the single most impactful
parameter on RAG quality.

### Q3: When would you use hybrid search over pure vector search?

**Answer:** Hybrid search combines dense (semantic) and sparse (keyword/BM25) retrieval.
Use it when: (1) queries contain specific terms, names, or codes that must match exactly
(sparse search excels here), (2) you need both semantic understanding and keyword
precision, (3) your evaluation shows pure vector search has low recall. The alpha
parameter controls the balance (0.7 means 70% semantic, 30% keyword). Most production
RAG systems use hybrid search because it consistently outperforms either method alone.
Weaviate and Qdrant support hybrid search natively.

### Q4: How do you evaluate a RAG system?

**Answer:** Evaluate at three levels. (1) Retrieval quality: use Recall@k, MRR, and
precision@k -- create a test set of questions with known relevant documents and measure
whether retrieval finds them. (2) Generation quality: use RAGAS metrics -- faithfulness
(is the answer grounded in context?), answer relevancy (is the answer relevant?), context
precision/recall. (3) End-to-end: human evaluation on a sample, A/B testing in production,
user feedback (thumbs up/down). Track hallucination rate as a key metric -- even 5%
hallucination is too high for most enterprise use cases.

### Q5: How do you handle RAG at scale (millions of documents)?

**Answer:** Several strategies: (1) Use a managed vector database (Pinecone, Qdrant Cloud)
with HNSW indexing for sub-millisecond search at billion-scale. (2) Partition by namespace
or tenant for multi-tenant applications. (3) Use metadata filters to narrow the search
space before vector search. (4) Implement a two-stage retrieval: fast ANN search for
top-100, then cross-encoder reranking for top-5. (5) Cache frequent queries and their
retrieved contexts. (6) Use async ingestion pipelines with message queues for document
processing. (7) Monitor embedding drift -- retrain or re-embed periodically.

---

## Quick Reference

### RAG Pipeline Checklist

```
Ingestion:
  [ ] Document parsing (PDF, HTML, MD, DOCX)
  [ ] Chunking strategy selected and tuned
  [ ] Embedding model chosen
  [ ] Vector database provisioned
  [ ] Metadata extraction and storage
  [ ] Deduplication logic

Query:
  [ ] Query preprocessing / rewriting
  [ ] Embedding generation (same model as ingestion)
  [ ] Vector search with appropriate top_k
  [ ] Reranking (if precision matters)
  [ ] Context assembly with source tracking
  [ ] LLM generation with grounding instructions
  [ ] Citation extraction

Evaluation:
  [ ] Test dataset with ground truth
  [ ] Retrieval metrics (Recall@k, MRR)
  [ ] Generation metrics (faithfulness, relevancy)
  [ ] Hallucination monitoring
  [ ] Latency and cost tracking
```

### Cost Estimation Template

```
Documents:           1M documents
Avg chunks/doc:      10
Total chunks:        10M

Embedding cost (one-time):
  10M chunks * 256 tokens * $0.02/1M = $51.20

Vector storage (pgvector):
  10M * 1536 dims * 4 bytes = ~60 GB

Query cost (per query):
  Embedding:   256 tokens * $0.02/1M = $0.000005
  Retrieval:   ~free (vector DB query)
  Reranking:   5 * 256 tokens * $0.15/1M = $0.000192
  Generation:  ~2000 tokens * $10/1M = $0.020
  Total:       ~$0.02 per query

Monthly cost at 10K queries/day:
  300K queries * $0.02 = $6,000/month
```
