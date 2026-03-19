# Chapter 12: Pipelines and Production

## Introduction

Processing a single document on your laptop is straightforward. Processing 10,000 documents per day with error handling, retries, monitoring, and storage management is an engineering challenge. This chapter covers the architecture patterns, tools, and practices for building production-grade document processing systems — from task queues to monitoring to complete portfolio projects.

```
+------------------------------------------------------------------------+
|                    PRODUCTION PIPELINE                                    |
+------------------------------------------------------------------------+
|                                                                        |
|  INGESTION                       PROCESSING                            |
|  +------------------------+     +---------------------------+          |
|  | File upload (S3, GCS)   |     | Celery / RQ task queue     |          |
|  | Email polling            |     | Format detection           |          |
|  | API webhooks             |     | Text extraction            |          |
|  | Watch directories        |     | OCR (if needed)            |          |
|  | Scheduled scraping       |     | Data extraction            |          |
|  +------------------------+     | Validation                 |          |
|                                  +---------------------------+          |
|                                                                        |
|  STORAGE                         MONITORING                            |
|  +------------------------+     +---------------------------+          |
|  | S3 / GCS (raw files)    |     | Logging (structured JSON)  |          |
|  | PostgreSQL (metadata)   |     | Metrics (Prometheus)       |          |
|  | Redis (cache, queue)    |     | Alerting (PagerDuty)       |          |
|  | Elasticsearch (search)  |     | Dashboard (Grafana)        |          |
|  | Vector DB (embeddings)  |     | Error tracking (Sentry)    |          |
|  +------------------------+     +---------------------------+          |
|                                                                        |
+------------------------------------------------------------------------+
```

---

## 1. Architecture Patterns

### 1.1 Queue-Based Pipeline

```
QUEUE-BASED ARCHITECTURE (most common)

Upload -> Message Queue -> Worker Pool -> Storage
                |                |
              Redis/         Multiple
              RabbitMQ       Celery workers
              SQS            process in parallel

Advantages:
  - Scales horizontally (add more workers)
  - Handles failures (retry with backoff)
  - Decouples upload from processing
  - Back-pressure (queue absorbs spikes)

Components:
  1. API server:  Accepts uploads, enqueues tasks
  2. Message queue: Redis, RabbitMQ, or SQS
  3. Workers:     Celery/RQ processes that do the actual work
  4. Storage:     S3 for files, PostgreSQL for metadata
  5. Monitoring:  Logs, metrics, alerts
```

### 1.2 Simple Pipeline with Celery

```python
# tasks.py
from celery import Celery
import fitz
import json
from pathlib import Path

app = Celery("docprocessor", broker="redis://localhost:6379/0")

@app.task(bind=True, max_retries=3, default_retry_delay=60)
def process_document(self, file_path: str, job_id: str):
    """Process a single document."""
    try:
        path = Path(file_path)
        ext = path.suffix.lower()

        # Step 1: Extract text
        if ext == ".pdf":
            doc = fitz.open(file_path)
            text = "\n".join(page.get_text() for page in doc)
            doc.close()
        elif ext == ".docx":
            from docx import Document
            doc = Document(file_path)
            text = "\n".join(p.text for p in doc.paragraphs)
        elif ext == ".txt":
            text = path.read_text(encoding="utf-8")
        else:
            raise ValueError(f"Unsupported format: {ext}")

        # Step 2: Extract data
        import re
        result = {
            "job_id": job_id,
            "file": path.name,
            "format": ext,
            "char_count": len(text),
            "dates": re.findall(r"\d{4}-\d{2}-\d{2}", text),
            "emails": re.findall(r"[\w.+-]+@[\w.-]+\.\w+", text),
            "status": "completed",
        }

        # Step 3: Save results
        output_path = f"results/{job_id}.json"
        Path("results").mkdir(exist_ok=True)
        with open(output_path, "w") as f:
            json.dump(result, f, indent=2)

        return result

    except Exception as exc:
        self.retry(exc=exc)
```

```python
# api.py — FastAPI endpoint that enqueues tasks
from fastapi import FastAPI, UploadFile
from tasks import process_document
import uuid
from pathlib import Path

app = FastAPI()

@app.post("/upload")
async def upload_document(file: UploadFile):
    """Upload a document for processing."""
    job_id = str(uuid.uuid4())

    # Save uploaded file
    upload_dir = Path("uploads")
    upload_dir.mkdir(exist_ok=True)
    file_path = upload_dir / f"{job_id}_{file.filename}"

    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    # Enqueue processing task
    task = process_document.delay(str(file_path), job_id)

    return {"job_id": job_id, "task_id": task.id, "status": "queued"}

@app.get("/status/{job_id}")
async def get_status(job_id: str):
    """Check processing status."""
    result_path = Path(f"results/{job_id}.json")
    if result_path.exists():
        import json
        with open(result_path) as f:
            return json.load(f)
    return {"job_id": job_id, "status": "processing"}
```

```bash
# Running the pipeline
# Terminal 1: Start Redis
redis-server

# Terminal 2: Start Celery worker
celery -A tasks worker --loglevel=info --concurrency=4

# Terminal 3: Start API server
uvicorn api:app --reload

# Terminal 4: Upload a document
curl -X POST "http://localhost:8000/upload" \
  -F "file=@invoice.pdf"
```

---

## 2. Error Handling and Retries

### 2.1 Retry Strategies

```python
from celery import Celery
from celery.exceptions import MaxRetriesExceededError

app = Celery("docprocessor", broker="redis://localhost:6379/0")

@app.task(
    bind=True,
    max_retries=3,
    autoretry_for=(IOError, TimeoutError),
    retry_backoff=True,         # Exponential backoff: 1s, 2s, 4s
    retry_backoff_max=300,      # Max 5 minutes between retries
    retry_jitter=True,          # Add random jitter to prevent thundering herd
)
def process_with_retry(self, file_path: str):
    """Process with automatic retry on transient errors."""
    try:
        return do_processing(file_path)
    except ValueError as e:
        # Permanent error — don't retry
        return {"status": "failed", "error": str(e)}
    except MaxRetriesExceededError:
        return {"status": "failed", "error": "Max retries exceeded"}
```

### 2.2 Dead Letter Queue

```python
@app.task(bind=True, max_retries=3)
def process_document(self, file_path: str, job_id: str):
    try:
        return do_processing(file_path)
    except Exception as exc:
        try:
            self.retry(exc=exc)
        except MaxRetriesExceededError:
            # Send to dead letter queue for manual review
            send_to_dlq.delay(file_path, job_id, str(exc))
            raise

@app.task
def send_to_dlq(file_path: str, job_id: str, error: str):
    """Store failed jobs for manual review."""
    import json
    from pathlib import Path
    dlq_dir = Path("dead_letter_queue")
    dlq_dir.mkdir(exist_ok=True)
    with open(dlq_dir / f"{job_id}.json", "w") as f:
        json.dump({"file": file_path, "job_id": job_id, "error": error}, f)
```

---

## 3. Storage Patterns

### 3.1 S3 for File Storage

```python
import boto3
from pathlib import Path

class DocumentStore:
    """Store and retrieve documents from S3."""

    def __init__(self, bucket: str):
        self.s3 = boto3.client("s3")
        self.bucket = bucket

    def upload(self, file_path: str, key: str = None) -> str:
        """Upload a file to S3."""
        key = key or f"uploads/{Path(file_path).name}"
        self.s3.upload_file(file_path, self.bucket, key)
        return f"s3://{self.bucket}/{key}"

    def download(self, key: str, local_path: str):
        """Download a file from S3."""
        Path(local_path).parent.mkdir(parents=True, exist_ok=True)
        self.s3.download_file(self.bucket, key, local_path)

    def get_presigned_url(self, key: str, expires: int = 3600) -> str:
        """Generate a temporary download URL."""
        return self.s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket, "Key": key},
            ExpiresIn=expires,
        )
```

### 3.2 Metadata in PostgreSQL

```python
import psycopg2
import json
from datetime import datetime

class MetadataStore:
    """Store document processing metadata in PostgreSQL."""

    def __init__(self, conn_string: str):
        self.conn = psycopg2.connect(conn_string)
        self._setup()

    def _setup(self):
        cur = self.conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS documents (
                id SERIAL PRIMARY KEY,
                job_id VARCHAR(36) UNIQUE NOT NULL,
                filename VARCHAR(255) NOT NULL,
                format VARCHAR(10),
                s3_key VARCHAR(500),
                status VARCHAR(20) DEFAULT 'queued',
                result JSONB,
                error TEXT,
                created_at TIMESTAMP DEFAULT NOW(),
                completed_at TIMESTAMP
            )
        """)
        self.conn.commit()

    def create_job(self, job_id: str, filename: str, s3_key: str) -> int:
        cur = self.conn.cursor()
        cur.execute(
            "INSERT INTO documents (job_id, filename, s3_key) VALUES (%s, %s, %s) RETURNING id",
            (job_id, filename, s3_key),
        )
        self.conn.commit()
        return cur.fetchone()[0]

    def update_status(self, job_id: str, status: str, result: dict = None, error: str = None):
        cur = self.conn.cursor()
        cur.execute(
            """UPDATE documents SET status = %s, result = %s, error = %s,
               completed_at = CASE WHEN %s IN ('completed', 'failed') THEN NOW() ELSE NULL END
               WHERE job_id = %s""",
            (status, json.dumps(result) if result else None, error, status, job_id),
        )
        self.conn.commit()
```

---

## 4. Logging and Monitoring

### 4.1 Structured Logging

```python
import logging
import json
from datetime import datetime

class JSONFormatter(logging.Formatter):
    def format(self, record):
        log_entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "level": record.levelname,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
        }
        if hasattr(record, "job_id"):
            log_entry["job_id"] = record.job_id
        if record.exc_info:
            log_entry["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_entry)

def setup_logging():
    logger = logging.getLogger("docprocessor")
    handler = logging.StreamHandler()
    handler.setFormatter(JSONFormatter())
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    return logger

# Usage
logger = setup_logging()
logger.info("Processing started", extra={"job_id": "abc-123"})
```

### 4.2 Metrics

```python
from prometheus_client import Counter, Histogram, Gauge

# Metrics
documents_processed = Counter(
    "documents_processed_total",
    "Total documents processed",
    ["format", "status"],
)

processing_duration = Histogram(
    "document_processing_seconds",
    "Time to process a document",
    ["format"],
    buckets=[0.5, 1, 2, 5, 10, 30, 60, 120],
)

queue_size = Gauge(
    "document_queue_size",
    "Number of documents waiting in queue",
)

# Usage in task
import time

def process_with_metrics(file_path: str):
    ext = Path(file_path).suffix.lower()
    start = time.time()

    try:
        result = do_processing(file_path)
        documents_processed.labels(format=ext, status="success").inc()
        return result
    except Exception:
        documents_processed.labels(format=ext, status="error").inc()
        raise
    finally:
        duration = time.time() - start
        processing_duration.labels(format=ext).observe(duration)
```

---

## 5. Batch Processing

### 5.1 Processing a Directory

```python
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor, as_completed
import json

def batch_process(input_dir: str, output_dir: str, max_workers: int = 4) -> dict:
    """Process all documents in a directory with parallel workers."""
    input_path = Path(input_dir)
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    supported = {".pdf", ".docx", ".txt", ".csv", ".xlsx"}
    files = [f for f in input_path.iterdir() if f.suffix.lower() in supported]

    stats = {"total": len(files), "success": 0, "failed": 0, "errors": []}

    def process_one(filepath: Path) -> dict:
        try:
            import fitz
            import re

            if filepath.suffix.lower() == ".pdf":
                doc = fitz.open(str(filepath))
                text = "\n".join(page.get_text() for page in doc)
                doc.close()
            elif filepath.suffix.lower() == ".txt":
                text = filepath.read_text(encoding="utf-8")
            else:
                text = ""

            result = {
                "file": filepath.name,
                "format": filepath.suffix,
                "chars": len(text),
                "emails": re.findall(r"[\w.+-]+@[\w.-]+\.\w+", text),
                "status": "success",
            }

            # Save individual result
            result_file = output_path / f"{filepath.stem}.json"
            with open(result_file, "w") as f:
                json.dump(result, f, indent=2)

            return result

        except Exception as e:
            return {"file": filepath.name, "status": "error", "error": str(e)}

    with ProcessPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(process_one, f): f for f in files}
        for future in as_completed(futures):
            result = future.result()
            if result["status"] == "success":
                stats["success"] += 1
            else:
                stats["failed"] += 1
                stats["errors"].append(result)

            processed = stats["success"] + stats["failed"]
            print(f"Progress: {processed}/{stats['total']}", end="\r")

    print(f"\nDone: {stats['success']} succeeded, {stats['failed']} failed")
    return stats
```

---

## 6. Testing Document Processing Code

```python
import pytest
from pathlib import Path
import json

class TestDocumentProcessing:
    """Test suite for document processing pipeline."""

    def test_pdf_extraction(self, tmp_path):
        """Test that PDF text extraction works."""
        from reportlab.pdfgen import canvas

        # Create a test PDF
        pdf_path = str(tmp_path / "test.pdf")
        c = canvas.Canvas(pdf_path)
        c.drawString(72, 700, "Hello World")
        c.save()

        # Test extraction
        import fitz
        doc = fitz.open(pdf_path)
        text = doc[0].get_text()
        doc.close()

        assert "Hello World" in text

    def test_invoice_extraction(self):
        """Test invoice field extraction."""
        text = "Invoice #12345\nDate: 2024-01-15\nTotal: $1,234.56"
        result = extract_invoice_fields(text)

        assert result["invoice_number"] == "12345"
        assert result["total"] == "1,234.56"

    def test_chunking(self):
        """Test text chunking produces valid chunks."""
        text = "A" * 5000
        chunks = recursive_split(text, chunk_size=1000, overlap=100)

        assert len(chunks) > 1
        for chunk in chunks:
            assert len(chunk) <= 1100  # chunk_size + some tolerance

    def test_unsupported_format(self):
        """Test that unsupported formats raise clear errors."""
        with pytest.raises(ValueError, match="Unsupported format"):
            process_document("/fake/path.xyz", "test-job")
```

---

## 7. Portfolio Projects

### Project 1: Invoice Processing System

```
INVOICE PROCESSING SYSTEM

Features:
  - Upload PDF/image invoices via web interface
  - Extract: vendor, date, line items, total
  - Store results in PostgreSQL
  - Dashboard showing processed invoices
  - Export to CSV/Excel

Tech stack:
  Backend:   FastAPI + Celery + Redis
  Frontend:  React or simple HTML/HTMX
  Storage:   S3 (files) + PostgreSQL (data)
  OCR:       PyMuPDF (text PDFs) + Tesseract (scans)
  Extraction: Regex + pdfplumber tables

Architecture:
  Upload -> S3 -> Celery task -> Extract -> PostgreSQL -> API -> UI
```

### Project 2: Document Search Engine

```
DOCUMENT SEARCH ENGINE

Features:
  - Upload any document (PDF, DOCX, TXT, HTML)
  - Full-text search with highlighting
  - AI-powered Q&A (RAG)
  - Document preview
  - Tag and categorize documents

Tech stack:
  Backend:    FastAPI
  Search:     Elasticsearch (full-text) + pgvector (semantic)
  Embeddings: sentence-transformers (local)
  LLM:        Claude API
  Storage:    S3 + PostgreSQL

Architecture:
  Upload -> Extract text -> Index in ES + embed in pgvector
  Search -> Hybrid (ES + vector) -> Rerank -> Display results
  Q&A    -> RAG pipeline -> Claude generates answer with citations
```

### Project 3: Report Generator

```
AUTOMATED REPORT GENERATOR

Features:
  - Define report templates (Jinja2 + HTML/CSS)
  - Connect to data sources (CSV, API, database)
  - Generate PDF reports on schedule
  - Email reports to stakeholders
  - Dashboard with report history

Tech stack:
  Backend:    FastAPI + Celery
  Templates:  Jinja2 + WeasyPrint
  Scheduling: Celery Beat
  Email:      SMTP / SendGrid
  Charts:     matplotlib / plotly (rendered as images)
```

---

## 8. Deployment Checklist

```
PRODUCTION DEPLOYMENT CHECKLIST

Infrastructure:
  [ ] API server behind load balancer
  [ ] Celery workers auto-scaling
  [ ] Redis cluster for queue
  [ ] S3 bucket with lifecycle rules
  [ ] PostgreSQL with backups
  [ ] Container orchestration (Docker + Kubernetes)

Security:
  [ ] File type validation (magic bytes, not just extension)
  [ ] File size limits
  [ ] Virus scanning on uploads
  [ ] Sandboxed processing (containers)
  [ ] No path traversal in file handling
  [ ] Encrypted storage at rest
  [ ] API authentication

Reliability:
  [ ] Retry with exponential backoff
  [ ] Dead letter queue for failed jobs
  [ ] Idempotent processing (reprocess safely)
  [ ] Health checks on all services
  [ ] Circuit breakers for external APIs

Monitoring:
  [ ] Structured logging (JSON)
  [ ] Metrics (processing time, queue depth, error rate)
  [ ] Alerts on error spikes
  [ ] Dashboard for operations
  [ ] Distributed tracing

Performance:
  [ ] Parallel processing (multiple workers)
  [ ] Stream large files (don't load into memory)
  [ ] Cache frequent operations (Redis)
  [ ] Compress stored results
  [ ] CDN for generated documents
```

---

## Appendix: Production Cheat Sheet

```
PRODUCTION PIPELINE CHEAT SHEET

Architecture:
  Upload -> Queue (Redis) -> Workers (Celery) -> Storage (S3 + PG)
  Always async, always with retries

Task Queue:
  Celery:  Most popular, Redis or RabbitMQ broker
  RQ:      Simpler alternative (Redis-only)
  Dramatiq: Modern alternative to Celery

Storage:
  Files:     S3 / GCS / Azure Blob
  Metadata:  PostgreSQL (JSONB for flexible schema)
  Search:    Elasticsearch (full-text) + pgvector (semantic)
  Cache:     Redis

Error Handling:
  Retry:     Exponential backoff with jitter
  DLQ:       Dead letter queue for manual review
  Idempotent: Safe to re-process the same document

Monitoring:
  Logging:   Structured JSON logs
  Metrics:   Prometheus + Grafana
  Errors:    Sentry
  Alerts:    PagerDuty / OpsGenie

Testing:
  Unit:       Test extraction functions with known inputs
  Integration: Test pipeline end-to-end with sample docs
  Load:       Test with realistic document volumes

Key Libraries:
  celery:          Task queue
  fastapi:         API server
  boto3:           AWS S3 integration
  psycopg2:        PostgreSQL
  redis:           Cache and queue
  prometheus_client: Metrics
  sentry-sdk:      Error tracking
```
