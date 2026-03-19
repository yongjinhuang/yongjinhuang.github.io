# Chapter 10: Cloud Document APIs

## Introduction

When local OCR and rule-based extraction are not enough — poor scan quality, complex layouts, handwriting, or the need for high accuracy at scale — cloud AI document services provide pre-trained models that understand document structure. AWS Textract, Azure AI Document Intelligence, and Google Document AI can extract tables, forms, and key-value pairs from documents with far higher accuracy than Tesseract alone. Additionally, vision-capable LLMs like Claude and GPT-4o can understand document images directly.

```
+------------------------------------------------------------------------+
|                    CLOUD DOCUMENT AI SERVICES                           |
+------------------------------------------------------------------------+
|                                                                        |
|  AWS                             AZURE                                 |
|  +------------------------+     +---------------------------+          |
|  | Textract                |     | AI Document Intelligence  |          |
|  |   Text extraction       |     |   (formerly Form Recognizer)|        |
|  |   Table extraction      |     |   Pre-built models         |          |
|  |   Form key-value pairs |     |   Custom models            |          |
|  |   Expense analysis     |     |   Invoice, receipt, ID     |          |
|  |   Identity documents   |     |   Layout analysis          |          |
|  +------------------------+     +---------------------------+          |
|                                                                        |
|  GOOGLE                          LLM VISION                            |
|  +------------------------+     +---------------------------+          |
|  | Document AI             |     | Claude (Anthropic)         |          |
|  |   OCR                   |     |   Image understanding      |          |
|  |   Form parsing          |     |   Structured extraction    |          |
|  |   Custom processors    |     | GPT-4o (OpenAI)            |          |
|  |   Document classification|    |   Image understanding      |          |
|  | Cloud Vision API        |     | Gemini (Google)            |          |
|  |   OCR, label detection  |     |   Multimodal               |          |
|  +------------------------+     +---------------------------+          |
|                                                                        |
+------------------------------------------------------------------------+
```

---

## 1. AWS Textract

### 1.1 Overview

```
AWS TEXTRACT CAPABILITIES

Detect Text:     Extract lines and words from images/PDFs
Analyze Document: Extract text + tables + forms (key-value pairs)
Analyze Expense:  Specialized for receipts and invoices
Analyze ID:       Extract data from identity documents
Analyze Lending:  Extract data from mortgage documents

Supported formats: PDF, JPEG, PNG, TIFF
Max file size:     10 MB (sync), 500 MB (async)
Max pages:         1 (sync), 3000 (async)
```

### 1.2 Basic Text Extraction

```python
import boto3

def textract_detect_text(image_path: str) -> list[str]:
    """Extract text lines from an image using Textract."""
    client = boto3.client("textract")

    with open(image_path, "rb") as f:
        image_bytes = f.read()

    response = client.detect_document_text(
        Document={"Bytes": image_bytes}
    )

    lines = []
    for block in response["Blocks"]:
        if block["BlockType"] == "LINE":
            lines.append(block["Text"])

    return lines
```

### 1.3 Table and Form Extraction

```python
import boto3

def textract_analyze(image_path: str) -> dict:
    """Extract text, tables, and forms from a document."""
    client = boto3.client("textract")

    with open(image_path, "rb") as f:
        image_bytes = f.read()

    response = client.analyze_document(
        Document={"Bytes": image_bytes},
        FeatureTypes=["TABLES", "FORMS"],
    )

    result = {"text": [], "tables": [], "forms": {}}

    # Parse blocks
    blocks_by_id = {b["Id"]: b for b in response["Blocks"]}

    for block in response["Blocks"]:
        if block["BlockType"] == "LINE":
            result["text"].append(block["Text"])

        elif block["BlockType"] == "KEY_VALUE_SET":
            if "KEY" in block.get("EntityTypes", []):
                key_text = _get_text(block, blocks_by_id)
                value_block = _get_value_block(block, blocks_by_id)
                if value_block:
                    value_text = _get_text(value_block, blocks_by_id)
                    result["forms"][key_text] = value_text

    return result

def _get_text(block: dict, blocks_map: dict) -> str:
    """Get text from a block's child relationships."""
    text = ""
    if "Relationships" in block:
        for rel in block["Relationships"]:
            if rel["Type"] == "CHILD":
                for child_id in rel["Ids"]:
                    child = blocks_map.get(child_id, {})
                    if child.get("BlockType") == "WORD":
                        text += child.get("Text", "") + " "
    return text.strip()

def _get_value_block(key_block: dict, blocks_map: dict):
    """Find the VALUE block associated with a KEY block."""
    if "Relationships" in key_block:
        for rel in key_block["Relationships"]:
            if rel["Type"] == "VALUE":
                for value_id in rel["Ids"]:
                    return blocks_map.get(value_id)
    return None
```

### 1.4 Async Processing for Large Documents

```python
import boto3
import time

def textract_async(s3_bucket: str, s3_key: str) -> dict:
    """Process a large PDF asynchronously via S3."""
    client = boto3.client("textract")

    # Start async job
    response = client.start_document_analysis(
        DocumentLocation={"S3Object": {"Bucket": s3_bucket, "Name": s3_key}},
        FeatureTypes=["TABLES", "FORMS"],
    )
    job_id = response["JobId"]

    # Poll for completion
    while True:
        result = client.get_document_analysis(JobId=job_id)
        status = result["JobStatus"]
        if status == "SUCCEEDED":
            break
        elif status == "FAILED":
            raise RuntimeError(f"Textract job failed: {result.get('StatusMessage')}")
        time.sleep(5)

    # Collect all pages
    blocks = result["Blocks"]
    next_token = result.get("NextToken")
    while next_token:
        result = client.get_document_analysis(JobId=job_id, NextToken=next_token)
        blocks.extend(result["Blocks"])
        next_token = result.get("NextToken")

    return {"blocks": blocks, "pages": result.get("DocumentMetadata", {}).get("Pages", 0)}
```

---

## 2. Azure AI Document Intelligence

### 2.1 Overview

```
AZURE AI DOCUMENT INTELLIGENCE

Pre-built models:
  prebuilt-invoice:    Invoice data extraction
  prebuilt-receipt:    Receipt parsing
  prebuilt-idDocument: ID card / passport / driver's license
  prebuilt-layout:     Tables, text, structure
  prebuilt-read:       OCR text extraction

Custom models:
  Train on your own document types
  Classify documents automatically
  Compose multiple models
```

### 2.2 Using the Python SDK

```python
from azure.ai.formrecognizer import DocumentAnalysisClient
from azure.core.credentials import AzureKeyCredential

def azure_analyze_invoice(filepath: str, endpoint: str, key: str) -> dict:
    """Extract invoice data using Azure Document Intelligence."""
    client = DocumentAnalysisClient(
        endpoint=endpoint,
        credential=AzureKeyCredential(key),
    )

    with open(filepath, "rb") as f:
        poller = client.begin_analyze_document("prebuilt-invoice", f)

    result = poller.result()
    invoices = []

    for doc in result.documents:
        invoice = {}
        for name, field in doc.fields.items():
            if field.value_type == "currency":
                invoice[name] = {"amount": field.value.amount, "code": field.value.code}
            elif field.value_type == "list":
                invoice[name] = [
                    {k: v.value for k, v in item.value.items()}
                    for item in field.value
                ]
            else:
                invoice[name] = field.value
        invoices.append(invoice)

    return {"invoices": invoices}
```

### 2.3 Layout Analysis

```python
def azure_analyze_layout(filepath: str, endpoint: str, key: str) -> dict:
    """Extract document layout (text, tables, structure)."""
    client = DocumentAnalysisClient(
        endpoint=endpoint,
        credential=AzureKeyCredential(key),
    )

    with open(filepath, "rb") as f:
        poller = client.begin_analyze_document("prebuilt-layout", f)

    result = poller.result()

    tables = []
    for table in result.tables:
        rows = {}
        for cell in table.cells:
            row_idx = cell.row_index
            if row_idx not in rows:
                rows[row_idx] = {}
            rows[row_idx][cell.column_index] = cell.content

        table_data = []
        for row_idx in sorted(rows.keys()):
            row = [rows[row_idx].get(col, "") for col in range(table.column_count)]
            table_data.append(row)
        tables.append(table_data)

    return {
        "text": result.content,
        "tables": tables,
        "page_count": len(result.pages),
    }
```

---

## 3. Google Document AI

### 3.1 Overview

```
GOOGLE DOCUMENT AI

Processors:
  OCR:              Text extraction
  Form Parser:      Key-value pairs and tables
  Invoice Parser:   Invoice-specific fields
  Expense Parser:   Receipt parsing
  ID Proofing:      Identity verification
  Document Splitter: Split multi-document PDFs
  Custom:           Train on your documents

Pricing:
  OCR:          $1.50 per 1000 pages
  Form Parser:  $30 per 1000 pages
  Specialized:  $10-50 per 1000 pages
```

### 3.2 Using the Python SDK

```python
from google.cloud import documentai_v1 as documentai

def google_docai_process(filepath: str, project_id: str, location: str, processor_id: str) -> dict:
    """Process a document with Google Document AI."""
    client = documentai.DocumentProcessorServiceClient()

    resource_name = client.processor_path(project_id, location, processor_id)

    with open(filepath, "rb") as f:
        content = f.read()

    request = documentai.ProcessRequest(
        name=resource_name,
        raw_document=documentai.RawDocument(
            content=content,
            mime_type="application/pdf",
        ),
    )

    result = client.process_document(request=request)
    document = result.document

    # Extract text
    text = document.text

    # Extract entities (for specialized processors)
    entities = []
    for entity in document.entities:
        entities.append({
            "type": entity.type_,
            "text": entity.mention_text,
            "confidence": entity.confidence,
        })

    # Extract tables
    tables = []
    for page in document.pages:
        for table in page.tables:
            rows = []
            for row in table.body_rows:
                cells = [
                    _get_text_from_layout(cell.layout, document.text)
                    for cell in row.cells
                ]
                rows.append(cells)
            tables.append(rows)

    return {"text": text, "entities": entities, "tables": tables}

def _get_text_from_layout(layout, full_text: str) -> str:
    """Extract text from a layout element."""
    result = ""
    for segment in layout.text_anchor.text_segments:
        start = int(segment.start_index)
        end = int(segment.end_index)
        result += full_text[start:end]
    return result.strip()
```

---

## 4. LLM-Powered Document Extraction

### 4.1 Using Claude for Document Understanding

```python
import anthropic
import base64

def claude_extract_document(image_path: str, prompt: str) -> str:
    """Use Claude's vision to extract data from a document image."""
    client = anthropic.Anthropic()

    with open(image_path, "rb") as f:
        image_data = base64.standard_b64encode(f.read()).decode("utf-8")

    # Determine media type
    ext = image_path.lower().split(".")[-1]
    media_types = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}
    media_type = media_types.get(ext, "image/png")

    message = client.messages.create(
        model="claude-sonnet-4-5-20250514",
        max_tokens=4096,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {"type": "base64", "media_type": media_type, "data": image_data},
                },
                {
                    "type": "text",
                    "text": prompt,
                },
            ],
        }],
    )

    return message.content[0].text

# Usage: Extract structured data from an invoice image
result = claude_extract_document("invoice_scan.png", """
Extract all data from this invoice and return it as JSON with these fields:
- invoice_number
- date
- vendor_name
- vendor_address
- bill_to
- line_items (array of {description, quantity, unit_price, amount})
- subtotal
- tax
- total
""")

import json
invoice_data = json.loads(result)
```

### 4.2 Using Claude for PDF Pages

```python
import anthropic
import fitz
import base64

def claude_extract_pdf(pdf_path: str, prompt: str, max_pages: int = 5) -> str:
    """Convert PDF pages to images and send to Claude for extraction."""
    client = anthropic.Anthropic()

    # Render PDF pages as images
    doc = fitz.open(pdf_path)
    images = []
    for i, page in enumerate(doc):
        if i >= max_pages:
            break
        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
        png_bytes = pix.tobytes("png")
        b64 = base64.standard_b64encode(png_bytes).decode("utf-8")
        images.append({
            "type": "image",
            "source": {"type": "base64", "media_type": "image/png", "data": b64},
        })
    doc.close()

    # Build message with all page images
    content = images + [{"type": "text", "text": prompt}]

    message = client.messages.create(
        model="claude-sonnet-4-5-20250514",
        max_tokens=4096,
        messages=[{"role": "user", "content": content}],
    )

    return message.content[0].text
```

### 4.3 Structured Output with LLMs

```python
import anthropic
import json

def extract_with_schema(image_path: str, schema: dict) -> dict:
    """Extract data matching a specific schema using Claude."""
    client = anthropic.Anthropic()

    with open(image_path, "rb") as f:
        image_data = base64.standard_b64encode(f.read()).decode("utf-8")

    prompt = f"""Extract data from this document image.
Return ONLY valid JSON matching this schema:
{json.dumps(schema, indent=2)}

Rules:
- Use null for fields you cannot find
- Dates in YYYY-MM-DD format
- Currency as numbers without symbols
- Be precise, don't guess"""

    message = client.messages.create(
        model="claude-sonnet-4-5-20250514",
        max_tokens=4096,
        messages=[{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": image_data}},
                {"type": "text", "text": prompt},
            ],
        }],
    )

    return json.loads(message.content[0].text)

# Usage
schema = {
    "invoice_number": "string",
    "date": "YYYY-MM-DD",
    "total": "number",
    "line_items": [{"description": "string", "amount": "number"}],
}
data = extract_with_schema("invoice.png", schema)
```

---

## 5. Comparing Cloud Services

```
CLOUD DOCUMENT AI COMPARISON

Feature              AWS Textract    Azure Doc Intel   Google Doc AI    LLM Vision
─────────────────────────────────────────────────────────────────────────────────────
Text OCR             Excellent       Excellent         Excellent        Good
Table extraction     Excellent       Excellent         Good             Good
Form key-values      Excellent       Excellent         Good             Excellent
Invoice parsing      Built-in        Built-in          Built-in         Via prompt
Custom models        No              Yes               Yes              Via prompt
Handwriting          Good            Good              Good             Excellent
Multi-language       Good            Excellent         Excellent        Excellent
Pricing (per page)   $1.50-15        $1-15             $1.50-30         $0.01-0.10*
Latency              1-5 sec         1-5 sec           2-10 sec         2-10 sec
Max document size    500 MB          500 MB            20 MB            ~10 images

* LLM pricing varies by model and token count

WHEN TO USE WHAT:
  High-volume, structured:  Cloud AI services (Textract, Azure, Google)
  Complex/varied layouts:   LLM vision (Claude, GPT-4o)
  Simple text extraction:   Local OCR (Tesseract) — free
  Handwriting/messy scans:  LLM vision or Azure
  Custom document types:    Azure or Google custom models
```

---

## 6. Worked Problems

### Problem: Hybrid Extraction Pipeline

```python
import fitz
import base64
import anthropic
import json

class HybridExtractor:
    """Use local extraction first, fall back to cloud AI for hard cases."""

    def __init__(self, anthropic_key: str = None):
        self.client = anthropic.Anthropic(api_key=anthropic_key) if anthropic_key else None

    def extract(self, pdf_path: str) -> dict:
        # Stage 1: Try local extraction
        doc = fitz.open(pdf_path)
        text = "\n".join(page.get_text() for page in doc)
        doc.close()

        # If we got good text, use regex extraction
        if len(text.strip()) > 100:
            return self._extract_from_text(text)

        # Stage 2: Fall back to LLM vision for scanned/complex documents
        if self.client:
            return self._extract_with_llm(pdf_path)

        return {"error": "No text found and no LLM API configured"}

    def _extract_from_text(self, text: str) -> dict:
        import re
        return {
            "method": "local",
            "dates": re.findall(r"\d{4}-\d{2}-\d{2}", text),
            "emails": re.findall(r"[\w.+-]+@[\w.-]+\.\w+", text),
            "money": re.findall(r"\$[\d,]+\.?\d*", text),
            "text_length": len(text),
        }

    def _extract_with_llm(self, pdf_path: str) -> dict:
        doc = fitz.open(pdf_path)
        page = doc[0]
        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
        b64 = base64.standard_b64encode(pix.tobytes("png")).decode()
        doc.close()

        message = self.client.messages.create(
            model="claude-sonnet-4-5-20250514",
            max_tokens=4096,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": b64}},
                    {"type": "text", "text": "Extract all text and data from this document. Return as JSON."},
                ],
            }],
        )

        return {"method": "llm_vision", "data": json.loads(message.content[0].text)}
```

---

## Appendix: Cloud Document APIs Cheat Sheet

```
CLOUD DOCUMENT APIS CHEAT SHEET

AWS Textract:
  detect_document_text():   OCR text only
  analyze_document():       Text + tables + forms
  analyze_expense():        Invoice/receipt specific
  start_document_analysis(): Async for large PDFs (via S3)

Azure AI Document Intelligence:
  prebuilt-read:        OCR
  prebuilt-layout:      Tables + structure
  prebuilt-invoice:     Invoice fields
  prebuilt-receipt:     Receipt fields
  Custom models:        Train on your documents

Google Document AI:
  OCR Processor:        Text extraction
  Form Parser:          Key-value pairs
  Invoice/Expense:      Specialized parsers
  Custom:               Train your own

LLM Vision (Claude/GPT-4o):
  Send document as image + extraction prompt
  Best for: varied layouts, handwriting, complex reasoning
  Return structured JSON with schema guidance
  Cost-effective for low volume

Decision Guide:
  Simple OCR:           Tesseract (free, local)
  Structured forms:     Cloud AI (Textract/Azure/Google)
  Complex/varied docs:  LLM vision
  High volume:          Cloud AI with async processing
  Privacy-sensitive:    Local OCR or on-premise deployment
```
