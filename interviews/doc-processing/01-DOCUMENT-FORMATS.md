# Chapter 1: Document Formats and File Fundamentals

## Introduction

Before you can process a document, you need to understand what a document _is_ at the byte level. A `.pdf` file is not "just text" — it is a complex binary format with objects, cross-reference tables, and content streams. A `.docx` file is actually a ZIP archive containing XML files. Understanding these internals is what allows you to choose the right library, debug extraction failures, and handle edge cases that trip up naive approaches.

```
+------------------------------------------------------------------------+
|                 DOCUMENT FORMAT LANDSCAPE                               |
+------------------------------------------------------------------------+
|                                                                        |
|  BINARY FORMATS               TEXT-BASED FORMATS                       |
|  +----------------------+    +---------------------------+             |
|  | PDF (.pdf)            |    | Plain text (.txt, .log)    |             |
|  | Legacy Word (.doc)    |    | CSV (.csv, .tsv)           |             |
|  | Legacy Excel (.xls)   |    | JSON (.json)               |             |
|  | Images (JPEG, PNG)    |    | XML (.xml)                 |             |
|  | Compiled archives     |    | YAML (.yaml, .yml)         |             |
|  +----------------------+    +---------------------------+             |
|                                                                        |
|  ZIP-BASED (COMPOUND)          STRUCTURED TEXT                         |
|  +----------------------+    +---------------------------+             |
|  | DOCX (.docx = ZIP)    |    | HTML (.html)               |             |
|  | XLSX (.xlsx = ZIP)    |    | Markdown (.md)             |             |
|  | PPTX (.pptx = ZIP)   |    | reStructuredText (.rst)    |             |
|  | EPUB (.epub = ZIP)   |    | LaTeX (.tex)               |             |
|  | ODF (.odt, .ods)      |    | TOML (.toml)               |             |
|  +----------------------+    +---------------------------+             |
|                                                                        |
+------------------------------------------------------------------------+
```

---

## 1. Binary vs Text Files

### 1.1 What Makes a File "Binary"?

Every file is a sequence of bytes (0-255). The difference between "text" and "binary" is interpretation:

```
TEXT FILE (UTF-8 encoded):
  Bytes:   72 101 108 108 111 10
  Meaning: H  e   l   l   o  \n
  Every byte (or multi-byte sequence) maps to a human-readable character.

BINARY FILE (JPEG image):
  Bytes:   255 216 255 224 0 16 74 70 73 70 ...
  Meaning: JPEG magic number + JFIF header + compressed pixel data
  Bytes represent structures, not characters.
  Opening in a text editor shows garbage.
```

### 1.2 File Signatures (Magic Bytes)

Every binary format starts with specific bytes (a "magic number") that identify it. This is more reliable than file extensions:

```
FORMAT          MAGIC BYTES (hex)           ASCII
PDF             25 50 44 46                 %PDF
ZIP/DOCX/XLSX   50 4B 03 04                 PK..
JPEG            FF D8 FF                    ...
PNG             89 50 4E 47 0D 0A 1A 0A     .PNG....
GIF             47 49 46 38                 GIF8
GZIP            1F 8B                       ..
ELF (Linux)     7F 45 4C 46                 .ELF
```

```python
import magic  # python-magic library

def detect_file_type(filepath: str) -> str:
    """Detect file type by magic bytes, not extension."""
    mime = magic.from_file(filepath, mime=True)
    description = magic.from_file(filepath)
    return f"MIME: {mime}, Description: {description}"

# A .pdf that's actually a renamed .jpg:
print(detect_file_type("invoice.pdf"))
# MIME: image/jpeg, Description: JPEG image data
# The extension lies! Magic bytes tell the truth.
```

```python
# Manual magic byte detection (no dependencies)
SIGNATURES = {
    b"%PDF": "application/pdf",
    b"PK\x03\x04": "application/zip",  # Also DOCX, XLSX, PPTX
    b"\xff\xd8\xff": "image/jpeg",
    b"\x89PNG": "image/png",
    b"GIF8": "image/gif",
    b"\x1f\x8b": "application/gzip",
}

def detect_mime(filepath: str) -> str:
    with open(filepath, "rb") as f:
        header = f.read(8)
    for sig, mime in SIGNATURES.items():
        if header.startswith(sig):
            return mime
    return "application/octet-stream"
```

---

## 2. Character Encoding

### 2.1 Why Encoding Matters

Character encoding is the mapping between bytes and characters. Get it wrong and you see `Ã©` instead of `é`, or `???` instead of `中文`.

```
THE ENCODING PROBLEM

File on disk:  C3 A9           (2 bytes)
UTF-8 decode:  é               (correct!)
Latin-1 decode: Ã©             (mojibake — garbled text)
ASCII decode:   ERROR           (bytes > 127 are invalid ASCII)

This is the #1 cause of garbled text in document processing.
```

### 2.2 Common Encodings

| Encoding             | Bytes/Char | Range                     | Used By                    |
| -------------------- | ---------- | ------------------------- | -------------------------- |
| ASCII                | 1          | 0-127 (English only)      | Legacy systems             |
| UTF-8                | 1-4        | All Unicode               | Web, Linux, modern systems |
| UTF-16               | 2-4        | All Unicode               | Windows internals, Java    |
| Latin-1 (ISO-8859-1) | 1          | Western European          | Old web pages, legacy      |
| Windows-1252         | 1          | Western European + extras | Windows legacy documents   |
| Shift-JIS            | 1-2        | Japanese                  | Japanese legacy systems    |
| GB2312 / GBK         | 1-2        | Chinese                   | Chinese legacy systems     |

### 2.3 Detecting and Handling Encoding

```python
import chardet

def read_with_detection(filepath: str) -> str:
    """Read a file with automatic encoding detection."""
    with open(filepath, "rb") as f:
        raw = f.read()

    detected = chardet.detect(raw)
    encoding = detected["encoding"]
    confidence = detected["confidence"]
    print(f"Detected: {encoding} (confidence: {confidence:.0%})")

    return raw.decode(encoding)

# Better: try UTF-8 first, fall back to detection
def read_text_safe(filepath: str) -> str:
    with open(filepath, "rb") as f:
        raw = f.read()
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        detected = chardet.detect(raw)
        return raw.decode(detected["encoding"] or "latin-1")
```

### 2.4 BOM (Byte Order Mark)

Some files start with a BOM that declares their encoding:

```
UTF-8 BOM:    EF BB BF        (optional, often causes issues)
UTF-16 LE:    FF FE            (little-endian, Windows default)
UTF-16 BE:    FE FF            (big-endian)

Python handles BOMs with encoding names:
  "utf-8-sig"  -> strips UTF-8 BOM if present
  "utf-16"     -> auto-detects BOM and byte order
```

```python
# Reading a file that might have a UTF-8 BOM
with open("data.csv", encoding="utf-8-sig") as f:
    content = f.read()  # BOM automatically stripped
```

---

## 3. MIME Types

MIME (Multipurpose Internet Mail Extensions) types are the standard way to identify file formats in HTTP, email, and APIs:

```
COMMON MIME TYPES FOR DOCUMENTS

application/pdf                     PDF
application/msword                  Legacy .doc
application/vnd.openxmlformats-officedocument.
    wordprocessingml.document       .docx
application/vnd.openxmlformats-officedocument.
    spreadsheetml.sheet             .xlsx
application/vnd.ms-excel            Legacy .xls
text/plain                          .txt
text/csv                            .csv
text/html                           .html
text/markdown                       .md
application/json                    .json
application/xml                     .xml
image/jpeg                          .jpg/.jpeg
image/png                           .png
image/tiff                          .tiff
application/zip                     .zip
message/rfc822                      .eml
```

```python
import mimetypes

# Extension to MIME
mime_type, _ = mimetypes.guess_type("report.docx")
# 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

# MIME to extension
ext = mimetypes.guess_extension("application/pdf")
# '.pdf'
```

---

## 4. ZIP-Based Compound Formats

### 4.1 OOXML: What DOCX/XLSX/PPTX Really Are

Modern Office documents are ZIP archives containing XML files:

```
invoice.docx (renamed to .zip and extracted):

invoice/
├── [Content_Types].xml          # MIME type declarations
├── _rels/
│   └── .rels                    # Relationships between parts
├── word/
│   ├── document.xml             # Main document content
│   ├── styles.xml               # Formatting styles
│   ├── numbering.xml            # List numbering definitions
│   ├── fontTable.xml            # Font declarations
│   ├── settings.xml             # Document settings
│   ├── _rels/
│   │   └── document.xml.rels    # Relationships for document.xml
│   └── media/
│       └── image1.png           # Embedded images
└── docProps/
    ├── app.xml                  # Application metadata
    └── core.xml                 # Creator, dates, title
```

```python
import zipfile

# Peek inside a DOCX file
with zipfile.ZipFile("invoice.docx", "r") as z:
    for name in z.namelist():
        print(name)

    # Read the main document XML
    with z.open("word/document.xml") as f:
        content = f.read()
        print(content[:500])
```

### 4.2 PDF Internal Structure

PDF is NOT a ZIP — it is a complex binary format with a specific structure:

```
PDF FILE STRUCTURE

%PDF-1.7                          <- Header (version)

1 0 obj                           <- Object 1
<< /Type /Catalog                 <- Document catalog
   /Pages 2 0 R >>               <- Reference to page tree
endobj

2 0 obj                           <- Object 2
<< /Type /Pages
   /Kids [3 0 R]                  <- Array of page references
   /Count 1 >>
endobj

3 0 obj                           <- Object 3 (a page)
<< /Type /Page
   /MediaBox [0 0 612 792]        <- Page size (US Letter)
   /Contents 4 0 R                <- Reference to content stream
   /Resources << /Font << /F1 5 0 R >> >> >>
endobj

4 0 obj                           <- Content stream
<< /Length 44 >>
stream
BT /F1 12 Tf 100 700 Td (Hello World) Tj ET
endstream
endobj

xref                              <- Cross-reference table
0 6                               <- Object count
0000000000 65535 f                <- Free object
0000000009 00000 n                <- Object 1 offset
...

trailer                           <- Trailer
<< /Size 6 /Root 1 0 R >>
startxref
...
%%EOF                             <- End of file
```

**Key insight**: PDF is a _page description language_, not a data format. Text in a PDF is positioned character by character with `(H) Tj (e) Tj (l) Tj (l) Tj (o) Tj` commands. There is no concept of "paragraphs" or "tables" — those are visual constructs that libraries must infer from character positions.

---

## 5. File Size and Performance Considerations

```
DOCUMENT SIZE GUIDELINES

Format          Typical Size         Processing Time (Python)
Plain text      1 KB - 10 MB         Instant
CSV             10 KB - 1 GB         Seconds to minutes (pandas)
JSON            1 KB - 100 MB        Seconds (orjson is 10x faster)
PDF (text)      50 KB - 50 MB        1-10 seconds
PDF (scanned)   1 MB - 500 MB        10-60 seconds (OCR needed)
DOCX            50 KB - 100 MB       1-5 seconds
XLSX            100 KB - 500 MB      Seconds to minutes
Images          100 KB - 50 MB       Seconds (OCR: 5-30 seconds)
Email (.eml)    1 KB - 50 MB         Instant to seconds

PERFORMANCE TIPS:
- Stream large files (don't load entirely into memory)
- Use memory-mapped I/O for files > 100 MB
- Process in chunks (pandas read_csv chunksize=10000)
- Use binary libraries (orjson > json, polars > pandas for speed)
- Parallelize with multiprocessing for batch processing
```

---

## 6. Python Environment Setup

```bash
# Create a virtual environment for document processing
python3 -m venv doc-env
source doc-env/bin/activate  # Linux/Mac
# doc-env\Scripts\activate   # Windows

# Core libraries
pip install pymupdf           # PDF reading (import fitz)
pip install pdfplumber        # PDF table extraction
pip install pypdf             # PDF merge/split
pip install reportlab         # PDF generation
pip install python-docx       # Word documents
pip install openpyxl          # Excel .xlsx
pip install xlsxwriter        # Excel writing (better formatting)
pip install pandas            # Data processing
pip install polars            # Fast data processing
pip install beautifulsoup4    # HTML parsing
pip install lxml              # XML/HTML parsing (fast)
pip install Pillow            # Image processing
pip install pytesseract       # Tesseract OCR wrapper
pip install python-magic      # File type detection
pip install chardet           # Encoding detection
pip install jinja2            # Template engine
pip install pyyaml            # YAML parsing
pip install orjson            # Fast JSON parsing

# Optional: OCR engine (system-level install)
# macOS: brew install tesseract
# Ubuntu: sudo apt install tesseract-ocr
# Windows: download from GitHub releases
```

---

## 7. Worked Problems

### Problem 1: Build a File Type Classifier

```python
import os
from pathlib import Path

SIGNATURES = {
    b"%PDF": ("PDF", "application/pdf"),
    b"PK\x03\x04": ("ZIP/Office", "application/zip"),
    b"\xff\xd8\xff": ("JPEG", "image/jpeg"),
    b"\x89PNG": ("PNG", "image/png"),
    b"GIF8": ("GIF", "image/gif"),
    b"\x1f\x8b": ("GZIP", "application/gzip"),
    b"Rar!": ("RAR", "application/x-rar-compressed"),
    b"\xd0\xcf\x11\xe0": ("OLE2 (doc/xls/ppt)", "application/x-ole-storage"),
}

def classify_file(filepath: str) -> dict:
    path = Path(filepath)
    stat = path.stat()

    with open(filepath, "rb") as f:
        header = f.read(16)

    file_type = "Unknown"
    mime = "application/octet-stream"
    for sig, (name, m) in SIGNATURES.items():
        if header.startswith(sig):
            file_type = name
            mime = m
            break

    # Distinguish DOCX/XLSX/PPTX from generic ZIP
    if file_type == "ZIP/Office":
        import zipfile
        try:
            with zipfile.ZipFile(filepath) as z:
                names = z.namelist()
                if any(n.startswith("word/") for n in names):
                    file_type, mime = "DOCX", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                elif any(n.startswith("xl/") for n in names):
                    file_type, mime = "XLSX", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                elif any(n.startswith("ppt/") for n in names):
                    file_type, mime = "PPTX", "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        except zipfile.BadZipFile:
            pass

    return {
        "path": str(path),
        "extension": path.suffix,
        "size_bytes": stat.st_size,
        "type": file_type,
        "mime": mime,
    }

# Usage
info = classify_file("report.docx")
print(info)
# {'path': 'report.docx', 'extension': '.docx', 'size_bytes': 45230,
#  'type': 'DOCX', 'mime': 'application/vnd...wordprocessingml.document'}
```

---

## Appendix: File Formats Cheat Sheet

```
DOCUMENT FORMATS CHEAT SHEET

Binary vs Text:
  Binary: Bytes represent structures (PDF, JPEG, legacy .doc)
  Text:   Bytes represent characters (TXT, CSV, JSON, XML)
  Compound: ZIP containing XML (DOCX, XLSX, PPTX, EPUB)

Magic Bytes (reliable file detection):
  %PDF     -> PDF
  PK..     -> ZIP (or DOCX/XLSX/PPTX)
  FF D8 FF -> JPEG
  89 PNG   -> PNG

Character Encoding:
  UTF-8:        Modern standard, variable-length, backwards-compatible with ASCII
  Latin-1:      Western European, single byte, common in legacy systems
  Windows-1252: Microsoft variant of Latin-1
  Always try UTF-8 first, fall back to chardet detection

MIME Types:
  application/pdf -> PDF
  application/vnd.openxmlformats-officedocument.wordprocessingml.document -> DOCX
  application/vnd.openxmlformats-officedocument.spreadsheetml.sheet -> XLSX
  text/csv -> CSV
  text/plain -> TXT

Key Python Libraries:
  python-magic:  File type detection by magic bytes
  chardet:       Character encoding detection
  zipfile:       Read/write ZIP archives (and DOCX/XLSX internals)
  pathlib:       Modern file path handling
  mimetypes:     MIME type lookup by extension
```
