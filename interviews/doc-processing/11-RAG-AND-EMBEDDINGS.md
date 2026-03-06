# Chapter 11: RAG and Embeddings

## Introduction

Retrieval-Augmented Generation (RAG) is the technique that makes LLMs useful for document processing at scale. Instead of trying to fit entire documents into a prompt, you split documents into chunks, convert them to embeddings (numerical vectors), store them in a vector database, and retrieve only the most relevant chunks when answering a question. This chapter covers the complete RAG pipeline from document chunking to production deployment.

```
+------------------------------------------------------------------------+
|                    RAG PIPELINE                                          |
+------------------------------------------------------------------------+
|                                                                        |
|  INGESTION                                                              |
|  +--------------------------------------------------------------+     |
|  | 1. Load     | 2. Chunk      | 3. Embed       | 4. Store      |     |
|  | Documents   | Split into    | Convert to     | Save in       |     |
|  | (PDF, DOCX, | overlapping   | vectors using  | vector DB     |     |
|  |  HTML, etc.) | text segments | embedding model| (pgvector,    |     |
|  |              |               |                | Pinecone, etc)|     |
|  +--------------------------------------------------------------+     |
|                                                                        |
|  RETRIEVAL                                                              |
|  +--------------------------------------------------------------+     |
|  | 5. Query    | 6. Search     | 7. Rerank     | 8. Generate    |     |
|  | User asks   | Find similar  | Score and     | LLM answers    |     |
|  | a question  | chunks by     | filter top    | using retrieved|     |
|  |             | vector sim.   | results       | context        |     |
|  +--------------------------------------------------------------+     |
|                                                                        |
|  COMPONENTS                                                             |
|  +------------------------+     +---------------------------+          |
|  | Embedding Models        |     | Vector Databases           |          |
|  |   OpenAI text-embedding |     |   pgvector (PostgreSQL)    |          |
|  |   Voyage AI              |     |   Pinecone (managed)       |          |
|  |   Cohere embed           |     |   Chroma (local/embedded)  |          |
|  |   sentence-transformers  |     |   Weaviate                 |          |
|  |   (local, free)          |     |   Qdrant                   |          |
|  +------------------------+     +---------------------------+          |
|                                                                        |
+------------------------------------------------------------------------+
```

---

## 1. Document Chunking

### 1.1 Why Chunking Matters

```
THE CHUNKING PROBLEM

LLMs have context windows (e.g., 200K tokens for Claude).
But stuffing entire documents wastes tokens and reduces accuracy.

Instead:
  1. Split documents into meaningful chunks (500-1000 tokens each)
  2. Embed each chunk as a vector
  3. At query time, retrieve only the 5-20 most relevant chunks
  4. Send those chunks as context to the LLM

Chunk too small:  Lose context, answers lack detail
Chunk too large:  Dilute relevance, waste tokens
Overlap:          Prevents information loss at chunk boundaries
```

### 1.2 Chunking Strategies

```python
def chunk_by_characters(text: str, chunk_size: int = 1000, overlap: int = 200) -> list[str]:
    """Simple character-based chunking with overlap."""
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunk = text[start:end]
        chunks.append(chunk)
        start += chunk_size - overlap
    return chunks

def chunk_by_sentences(text: str, max_chunk_size: int = 1000) -> list[str]:
    """Chunk by sentence boundaries for better coherence."""
    import re
    sentences = re.split(r'(?<=[.!?])\s+', text)

    chunks = []
    current_chunk = ""
    for sentence in sentences:
        if len(current_chunk) + len(sentence) > max_chunk_size and current_chunk:
            chunks.append(current_chunk.strip())
            current_chunk = sentence
        else:
            current_chunk += " " + sentence
    if current_chunk.strip():
        chunks.append(current_chunk.strip())
    return chunks

def chunk_by_paragraphs(text: str, max_chunk_size: int = 1500) -> list[str]:
    """Chunk by paragraph boundaries."""
    paragraphs = text.split("\n\n")
    chunks = []
    current_chunk = ""

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        if len(current_chunk) + len(para) > max_chunk_size and current_chunk:
            chunks.append(current_chunk.strip())
            current_chunk = para
        else:
            current_chunk += "\n\n" + para

    if current_chunk.strip():
        chunks.append(current_chunk.strip())
    return chunks
```

### 1.3 Recursive Text Splitting

```python
def recursive_split(text: str, chunk_size: int = 1000, overlap: int = 200) -> list[str]:
    """Split text recursively by decreasing separator priority."""
    separators = ["\n\n", "\n", ". ", " ", ""]

    def _split(text: str, separators: list[str]) -> list[str]:
        if len(text) <= chunk_size:
            return [text] if text.strip() else []

        sep = separators[0]
        remaining_seps = separators[1:] if len(separators) > 1 else [""]

        if sep:
            parts = text.split(sep)
        else:
            # Character-level split as last resort
            return chunk_by_characters(text, chunk_size, overlap)

        chunks = []
        current = ""
        for part in parts:
            test = current + sep + part if current else part
            if len(test) > chunk_size and current:
                chunks.append(current.strip())
                current = part
            else:
                current = test

        if current.strip():
            chunks.append(current.strip())

        # Recursively split any chunks that are still too large
        final = []
        for chunk in chunks:
            if len(chunk) > chunk_size:
                final.extend(_split(chunk, remaining_seps))
            else:
                final.append(chunk)
        return final

    return _split(text, separators)
```

### 1.4 Semantic Chunking

```python
def semantic_chunk(text: str, embedding_model, threshold: float = 0.5) -> list[str]:
    """Split text where the topic changes (semantic similarity drops)."""
    sentences = [s.strip() for s in text.split(". ") if s.strip()]
    if len(sentences) <= 1:
        return [text]

    # Embed all sentences
    embeddings = embedding_model.encode(sentences)

    # Find breakpoints where similarity drops
    breakpoints = []
    for i in range(1, len(embeddings)):
        sim = cosine_similarity(embeddings[i-1], embeddings[i])
        if sim < threshold:
            breakpoints.append(i)

    # Build chunks from breakpoints
    chunks = []
    start = 0
    for bp in breakpoints:
        chunk = ". ".join(sentences[start:bp]) + "."
        chunks.append(chunk)
        start = bp
    chunks.append(". ".join(sentences[start:]) + ".")
    return chunks

def cosine_similarity(a, b):
    import numpy as np
    return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))
```

---

## 2. Text Embeddings

### 2.1 What Are Embeddings?

```
EMBEDDINGS EXPLAINED

Text:      "The cat sat on the mat"
Embedding: [0.012, -0.034, 0.056, ..., 0.089]  (1536 dimensions)

Similar text -> similar vectors -> small cosine distance:
  "The cat sat on the mat"     ↔  "A feline rested on a rug"     = 0.92 similarity
  "The cat sat on the mat"     ↔  "Stock prices rose yesterday"  = 0.11 similarity

This is how vector search works:
  1. Embed the query
  2. Find document chunks with most similar embeddings
  3. Return top-k results
```

### 2.2 OpenAI Embeddings

```python
from openai import OpenAI

client = OpenAI()

def embed_texts(texts: list[str], model: str = "text-embedding-3-small") -> list[list[float]]:
    """Generate embeddings for a list of texts."""
    response = client.embeddings.create(
        model=model,
        input=texts,
    )
    return [item.embedding for item in response.data]

# Usage
embeddings = embed_texts(["Hello world", "Document processing is fun"])
print(f"Dimensions: {len(embeddings[0])}")  # 1536 for text-embedding-3-small
```

### 2.3 Local Embeddings with sentence-transformers

```python
from sentence_transformers import SentenceTransformer

# Free, runs locally, no API key needed
model = SentenceTransformer("all-MiniLM-L6-v2")  # 384 dimensions, fast

def embed_local(texts: list[str]) -> list[list[float]]:
    """Generate embeddings locally (free, no API)."""
    return model.encode(texts).tolist()

# Usage
embeddings = embed_local(["Hello world", "Document processing"])
print(f"Dimensions: {len(embeddings[0])}")  # 384
```

### 2.4 Embedding Model Comparison

```
EMBEDDING MODEL COMPARISON

Model                        Dims    Speed     Quality   Cost
──────────────────────────────────────────────────────────────────
OpenAI text-embedding-3-small 1536   Fast      Good      $0.02/1M tokens
OpenAI text-embedding-3-large 3072   Medium    Best      $0.13/1M tokens
Voyage AI voyage-3            1024   Fast      Excellent $0.06/1M tokens
Cohere embed-v3               1024   Fast      Excellent $0.10/1M tokens
all-MiniLM-L6-v2 (local)     384    Very fast Fair      Free
BGE-large (local)             1024   Medium    Good      Free
E5-large-v2 (local)           1024   Medium    Good      Free
```

---

## 3. Vector Databases

### 3.1 Chroma (Local / Embedded)

```python
# pip install chromadb
import chromadb

def build_chroma_collection(chunks: list[str], metadatas: list[dict] = None):
    """Create a Chroma vector store from text chunks."""
    client = chromadb.Client()  # In-memory
    # Or: client = chromadb.PersistentClient(path="./chroma_db")

    collection = client.create_collection(
        name="documents",
        metadata={"hnsw:space": "cosine"},
    )

    collection.add(
        documents=chunks,
        metadatas=metadatas or [{"index": i} for i in range(len(chunks))],
        ids=[f"chunk_{i}" for i in range(len(chunks))],
    )

    return collection

def search_chroma(collection, query: str, n_results: int = 5) -> list[dict]:
    """Search for similar chunks."""
    results = collection.query(
        query_texts=[query],
        n_results=n_results,
    )

    output = []
    for i in range(len(results["documents"][0])):
        output.append({
            "text": results["documents"][0][i],
            "distance": results["distances"][0][i],
            "metadata": results["metadatas"][0][i],
        })
    return output
```

### 3.2 pgvector (PostgreSQL)

```python
import psycopg2
from pgvector.psycopg2 import register_vector

def setup_pgvector(conn_string: str, dimension: int = 1536):
    """Set up pgvector table."""
    conn = psycopg2.connect(conn_string)
    register_vector(conn)
    cur = conn.cursor()

    cur.execute("CREATE EXTENSION IF NOT EXISTS vector")
    cur.execute(f"""
        CREATE TABLE IF NOT EXISTS document_chunks (
            id SERIAL PRIMARY KEY,
            content TEXT NOT NULL,
            embedding vector({dimension}),
            metadata JSONB,
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)
    cur.execute("""
        CREATE INDEX IF NOT EXISTS chunks_embedding_idx
        ON document_chunks USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100)
    """)
    conn.commit()
    return conn

def insert_chunks(conn, chunks: list[str], embeddings: list[list[float]], metadatas: list[dict] = None):
    """Insert chunks with embeddings into pgvector."""
    cur = conn.cursor()
    for i, (chunk, emb) in enumerate(zip(chunks, embeddings)):
        meta = metadatas[i] if metadatas else {}
        cur.execute(
            "INSERT INTO document_chunks (content, embedding, metadata) VALUES (%s, %s, %s)",
            (chunk, emb, json.dumps(meta)),
        )
    conn.commit()

def search_pgvector(conn, query_embedding: list[float], limit: int = 5) -> list[dict]:
    """Search for similar chunks using cosine distance."""
    cur = conn.cursor()
    cur.execute("""
        SELECT content, metadata, 1 - (embedding <=> %s::vector) as similarity
        FROM document_chunks
        ORDER BY embedding <=> %s::vector
        LIMIT %s
    """, (query_embedding, query_embedding, limit))

    results = []
    for content, metadata, similarity in cur.fetchall():
        results.append({"content": content, "metadata": metadata, "similarity": similarity})
    return results
```

---

## 4. Complete RAG Pipeline

### 4.1 Document Ingestion

```python
import fitz
from pathlib import Path

class RAGPipeline:
    """Complete RAG pipeline for document Q&A."""

    def __init__(self, embedding_model, llm_client, vector_store):
        self.embedding_model = embedding_model
        self.llm = llm_client
        self.store = vector_store

    def ingest(self, filepath: str):
        """Ingest a document into the vector store."""
        # Step 1: Extract text
        text = self._extract_text(filepath)

        # Step 2: Chunk
        chunks = recursive_split(text, chunk_size=800, overlap=100)

        # Step 3: Add metadata
        filename = Path(filepath).name
        metadatas = [{"source": filename, "chunk_index": i} for i in range(len(chunks))]

        # Step 4: Embed and store
        embeddings = self.embedding_model.encode(chunks).tolist()
        self.store.add(chunks, embeddings, metadatas)

        return len(chunks)

    def query(self, question: str, top_k: int = 5) -> str:
        """Answer a question using RAG."""
        # Step 1: Embed the question
        query_emb = self.embedding_model.encode([question]).tolist()[0]

        # Step 2: Retrieve relevant chunks
        results = self.store.search(query_emb, limit=top_k)

        # Step 3: Build context
        context = "\n\n---\n\n".join([r["content"] for r in results])
        sources = [r["metadata"]["source"] for r in results]

        # Step 4: Generate answer with LLM
        prompt = f"""Answer the question based on the provided context.
If the answer is not in the context, say "I don't have enough information."

Context:
{context}

Question: {question}

Answer:"""

        answer = self.llm.generate(prompt)

        return {
            "answer": answer,
            "sources": list(set(sources)),
            "chunks_used": len(results),
        }

    def _extract_text(self, filepath: str) -> str:
        ext = Path(filepath).suffix.lower()
        if ext == ".pdf":
            doc = fitz.open(filepath)
            text = "\n".join(page.get_text() for page in doc)
            doc.close()
            return text
        elif ext == ".txt":
            return Path(filepath).read_text(encoding="utf-8")
        elif ext == ".docx":
            from docx import Document
            doc = Document(filepath)
            return "\n".join(p.text for p in doc.paragraphs)
        else:
            raise ValueError(f"Unsupported format: {ext}")
```

### 4.2 Using with Claude

```python
import anthropic
from sentence_transformers import SentenceTransformer
import chromadb

class SimpleRAG:
    """Simple RAG system using local embeddings + Chroma + Claude."""

    def __init__(self):
        self.embedder = SentenceTransformer("all-MiniLM-L6-v2")
        self.chroma = chromadb.Client()
        self.collection = self.chroma.create_collection("docs")
        self.claude = anthropic.Anthropic()
        self._doc_count = 0

    def add_document(self, text: str, source: str = "unknown"):
        chunks = recursive_split(text, chunk_size=800, overlap=100)
        ids = [f"doc_{self._doc_count}_{i}" for i in range(len(chunks))]
        self._doc_count += 1

        self.collection.add(
            documents=chunks,
            metadatas=[{"source": source, "chunk": i} for i in range(len(chunks))],
            ids=ids,
        )
        return len(chunks)

    def ask(self, question: str, top_k: int = 5) -> str:
        results = self.collection.query(query_texts=[question], n_results=top_k)
        context = "\n\n".join(results["documents"][0])

        message = self.claude.messages.create(
            model="claude-sonnet-4-5-20250514",
            max_tokens=2048,
            system="Answer questions using only the provided context. Cite sources when possible.",
            messages=[{
                "role": "user",
                "content": f"Context:\n{context}\n\nQuestion: {question}",
            }],
        )
        return message.content[0].text

# Usage
rag = SimpleRAG()

# Ingest documents
import fitz
doc = fitz.open("company_handbook.pdf")
text = "\n".join(page.get_text() for page in doc)
doc.close()
rag.add_document(text, source="company_handbook.pdf")

# Ask questions
answer = rag.ask("What is the company's PTO policy?")
print(answer)
```

---

## 5. Advanced RAG Techniques

### 5.1 Reranking

```python
def rerank_results(query: str, results: list[dict], top_n: int = 3) -> list[dict]:
    """Rerank search results using a cross-encoder model."""
    from sentence_transformers import CrossEncoder
    reranker = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")

    pairs = [(query, r["content"]) for r in results]
    scores = reranker.predict(pairs)

    for i, score in enumerate(scores):
        results[i]["rerank_score"] = float(score)

    results.sort(key=lambda x: x["rerank_score"], reverse=True)
    return results[:top_n]
```

### 5.2 Hybrid Search (Vector + Keyword)

```python
def hybrid_search(query: str, collection, bm25_index, top_k: int = 10) -> list[dict]:
    """Combine vector search with BM25 keyword search."""
    # Vector search
    vector_results = collection.query(query_texts=[query], n_results=top_k)

    # BM25 keyword search
    tokenized_query = query.lower().split()
    bm25_scores = bm25_index.get_scores(tokenized_query)

    # Reciprocal Rank Fusion (RRF)
    scores = {}
    k = 60  # RRF constant

    for rank, doc_id in enumerate(vector_results["ids"][0]):
        scores[doc_id] = scores.get(doc_id, 0) + 1 / (k + rank + 1)

    bm25_ranked = sorted(enumerate(bm25_scores), key=lambda x: x[1], reverse=True)[:top_k]
    for rank, (doc_idx, _) in enumerate(bm25_ranked):
        doc_id = f"chunk_{doc_idx}"
        scores[doc_id] = scores.get(doc_id, 0) + 1 / (k + rank + 1)

    # Sort by combined score
    ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    return ranked[:top_k]
```

---

## 6. Worked Problems

### Problem: Document Q&A System

```python
import fitz
import chromadb
from sentence_transformers import SentenceTransformer
from pathlib import Path

def build_document_qa(pdf_dir: str):
    """Build a Q&A system over a directory of PDFs."""
    embedder = SentenceTransformer("all-MiniLM-L6-v2")
    client = chromadb.PersistentClient(path="./qa_db")

    # Check if collection exists
    try:
        collection = client.get_collection("documents")
        print("Using existing index")
    except Exception:
        collection = client.create_collection("documents")

        # Ingest all PDFs
        doc_id = 0
        for pdf_path in Path(pdf_dir).glob("*.pdf"):
            doc = fitz.open(str(pdf_path))
            text = "\n".join(page.get_text() for page in doc)
            doc.close()

            chunks = recursive_split(text, chunk_size=800, overlap=100)
            if not chunks:
                continue

            ids = [f"doc_{doc_id}_{i}" for i in range(len(chunks))]
            metadatas = [{"source": pdf_path.name, "chunk": i} for i in range(len(chunks))]

            collection.add(documents=chunks, metadatas=metadatas, ids=ids)
            doc_id += 1
            print(f"Indexed {pdf_path.name}: {len(chunks)} chunks")

    return collection

# Interactive Q&A
collection = build_document_qa("./documents/")
while True:
    question = input("\nQuestion (q to quit): ")
    if question.lower() == "q":
        break

    results = collection.query(query_texts=[question], n_results=5)
    print("\nRelevant passages:")
    for i, (doc, meta) in enumerate(zip(results["documents"][0], results["metadatas"][0])):
        print(f"\n[{i+1}] Source: {meta['source']}")
        print(f"    {doc[:200]}...")
```

---

## Appendix: RAG Cheat Sheet

```
RAG & EMBEDDINGS CHEAT SHEET

Chunking:
  Character:  Simple, fast, may break mid-sentence
  Sentence:   Respects boundaries, better coherence
  Recursive:  Try paragraph -> sentence -> character
  Semantic:   Split where topic changes (requires embeddings)
  Size:       500-1000 tokens typical, 100-200 overlap

Embedding Models:
  Cloud:  OpenAI text-embedding-3-small (1536d, best balance)
  Cloud:  Voyage AI voyage-3 (1024d, high quality)
  Local:  all-MiniLM-L6-v2 (384d, fast, free)
  Local:  BGE-large (1024d, good quality, free)

Vector Databases:
  Chroma:    Local/embedded, easy setup, good for prototyping
  pgvector:  PostgreSQL extension, production-ready
  Pinecone:  Managed cloud, auto-scaling
  Qdrant:    Self-hosted or cloud, fast
  Weaviate:  Multi-modal, GraphQL API

RAG Pipeline:
  1. Extract text from documents
  2. Split into overlapping chunks (800 tokens, 100 overlap)
  3. Embed chunks with embedding model
  4. Store in vector database
  5. On query: embed question -> vector search -> get top-k chunks
  6. Send chunks as context to LLM
  7. LLM generates answer with citations

Advanced:
  Reranking:     Cross-encoder rescoring of search results
  Hybrid search: Vector + BM25 keyword, combine with RRF
  Metadata:      Filter by source, date, document type
  Multi-query:   Generate multiple query variations
```
