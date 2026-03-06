# Chapter 2: PDF Processing

## Introduction

PDF (Portable Document Format) is the most important document format in business. Contracts, invoices, reports, research papers, government forms — they are all PDFs. Yet PDF is one of the hardest formats to process programmatically because it is a *page description language*, not a data format. Text is positioned character by character, tables are just lines and text at coordinates, and a "paragraph" is a visual construct that no PDF reader natively understands.

```
+------------------------------------------------------------------------+
|                    PDF PROCESSING ECOSYSTEM                             |
+------------------------------------------------------------------------+
|                                                                        |
|  READING                         WRITING                               |
|  +------------------------+     +---------------------------+          |
|  | PyMuPDF (fitz)          |     | ReportLab                 |          |
|  |   - Fast text extraction|     |   - Full PDF generation   |          |
|  |   - Image extraction    |     |   - Tables, charts, images|          |
|  |   - Rendering to image  |     |                           |          |
|  | pdfplumber              |     | FPDF2                     |          |
|  |   - Table extraction    |     |   - Simple PDF creation   |          |
|  |   - Visual debugging    |     |   - Lightweight            |          |
|  | PyPDF                   |     | WeasyPrint                |          |
|  |   - Merge, split, rotate|     |   - HTML/CSS to PDF       |          |
|  |   - Form reading        |     |                           |          |
|  +------------------------+     +---------------------------+          |
|                                                                        |
|  MANIPULATION                    ADVANCED                              |
|  +------------------------+     +---------------------------+          |
|  | pikepdf                 |     | Camelot (table extraction) |          |
|  |   - Low-level PDF ops   |     | Tabula (Java-based tables) |          |
|  |   - Encryption/decrypt  |     | pdf2image (PDF to images)  |          |
|  |   - Metadata editing    |     | OCRmyPDF (add OCR layer)   |          |
|  | PyPDF                   |     | pdfminer.six (low-level)   |          |
|  |   - Watermarks          |     |                           |          |
|  |   - Page manipulation   |     |                           |          |
|  +------------------------+     +---------------------------+          |
|                                                                        |
+------------------------------------------------------------------------+
```

---

## 1. Why PDF Is Hard

### 1.1 PDF Is Not a Data Format

```
THE FUNDAMENTAL PROBLEM

What you SEE in a PDF:
  +----------------------------------+
  | Invoice #12345                   |
  | Date: 2024-01-15                 |
  |                                  |
  | Item          Qty    Price       |
  | Widget A       10    $5.00       |
  | Widget B        5   $12.50       |
  |                                  |
  | Total:                $112.50    |
  +----------------------------------+

What the PDF CONTAINS:
  BT /F1 18 Tf 72 750 Td (Invoice #12345) Tj ET
  BT /F1 12 Tf 72 730 Td (Date: 2024-01-15) Tj ET
  BT /F1 12 Tf 72 700 Td (Item) Tj ET
  BT /F1 12 Tf 250 700 Td (Qty) Tj ET
  BT /F1 12 Tf 350 700 Td (Price) Tj ET
  BT /F1 12 Tf 72 680 Td (Widget A) Tj ET
  BT /F1 12 Tf 260 680 Td (10) Tj ET
  ...

  There is NO "table" object. No "row" or "column".
  Just text placed at x,y coordinates on a page.
  Libraries must INFER structure from positions.
```

### 1.2 Types of PDFs

```
PDF TYPES (crucial to understand)

1. TEXT-BASED PDF (born digital):
   Created by Word, LaTeX, Chrome "Print to PDF", etc.
   Text is encoded in the PDF — you can select/copy it.
   Extraction: Use PyMuPDF or pdfplumber directly.

2. SCANNED PDF (image-only):
   Created by a scanner or camera.
   Each page is just a raster image — NO text data.
   Extraction: Must use OCR (Tesseract, cloud APIs).

3. HYBRID PDF (mixed):
   Some pages are text-based, others are scanned images.
   Some text is real, some is OCR-added (invisible layer).
   Extraction: Check each page; use OCR selectively.

How to tell which type:
  - Extract text with PyMuPDF
  - If text is empty or gibberish -> scanned, needs OCR
  - If text is readable -> born-digital, extract directly
```

---

## 2. Reading PDFs with PyMuPDF

### 2.1 Basic Text Extraction

PyMuPDF (imported as `fitz`) is the fastest and most capable Python PDF library.

```python
import fitz  # PyMuPDF

def extract_text(pdf_path: str) -> str:
    """Extract all text from a PDF."""
    doc = fitz.open(pdf_path)
    text = ""
    for page in doc:
        text += page.get_text()
    doc.close()
    return text

# Usage
content = extract_text("report.pdf")
print(content[:500])
```

### 2.2 Page-by-Page Extraction with Metadata

```python
import fitz

def extract_pages(pdf_path: str) -> list[dict]:
    """Extract text and metadata from each page."""
    doc = fitz.open(pdf_path)
    pages = []
    for i, page in enumerate(doc):
        pages.append({
            "page_number": i + 1,
            "text": page.get_text(),
            "width": page.rect.width,
            "height": page.rect.height,
            "rotation": page.rotation,
            "image_count": len(page.get_images()),
        })
    doc.close()
    return pages

# Usage
for p in extract_pages("report.pdf"):
    print(f"Page {p['page_number']}: {len(p['text'])} chars, {p['image_count']} images")
```

### 2.3 Structured Text Extraction

PyMuPDF can extract text as structured blocks (paragraphs) or as a dictionary with full position info:

```python
import fitz

def extract_blocks(pdf_path: str, page_num: int = 0) -> list[dict]:
    """Extract text blocks with position information."""
    doc = fitz.open(pdf_path)
    page = doc[page_num]

    # "dict" mode gives full structure: blocks -> lines -> spans
    data = page.get_text("dict")

    blocks = []
    for block in data["blocks"]:
        if block["type"] == 0:  # text block
            text = ""
            for line in block["lines"]:
                for span in line["spans"]:
                    text += span["text"]
                text += "\n"
            blocks.append({
                "text": text.strip(),
                "bbox": block["bbox"],  # (x0, y0, x1, y1)
                "font": block["lines"][0]["spans"][0]["font"] if block["lines"] else None,
                "size": block["lines"][0]["spans"][0]["size"] if block["lines"] else None,
            })
    doc.close()
    return blocks

# Find headings (large font size)
blocks = extract_blocks("report.pdf")
for b in blocks:
    if b["size"] and b["size"] > 14:
        print(f"HEADING: {b['text']}")
```

### 2.4 Extracting Images

```python
import fitz
from pathlib import Path

def extract_images(pdf_path: str, output_dir: str) -> list[str]:
    """Extract all images from a PDF."""
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    doc = fitz.open(pdf_path)
    saved = []

    for page_num, page in enumerate(doc):
        for img_index, img in enumerate(page.get_images()):
            xref = img[0]
            pix = fitz.Pixmap(doc, xref)

            # Convert CMYK to RGB if needed
            if pix.n >= 5:
                pix = fitz.Pixmap(fitz.csRGB, pix)

            filename = f"page{page_num + 1}_img{img_index + 1}.png"
            filepath = str(Path(output_dir) / filename)
            pix.save(filepath)
            saved.append(filepath)

    doc.close()
    return saved

# Usage
images = extract_images("brochure.pdf", "extracted_images/")
print(f"Extracted {len(images)} images")
```

### 2.5 Rendering Pages to Images

```python
import fitz

def pdf_page_to_image(pdf_path: str, page_num: int = 0, dpi: int = 200) -> bytes:
    """Render a PDF page as a PNG image."""
    doc = fitz.open(pdf_path)
    page = doc[page_num]

    # Higher DPI = higher quality but larger image
    zoom = dpi / 72  # 72 DPI is the default
    mat = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=mat)

    png_bytes = pix.tobytes("png")
    doc.close()
    return png_bytes

# Save page as image (useful for OCR preprocessing or thumbnails)
png = pdf_page_to_image("report.pdf", page_num=0, dpi=300)
with open("page1.png", "wb") as f:
    f.write(png)
```

---

## 3. Table Extraction with pdfplumber

### 3.1 Why Tables Are Hard

```
TABLE EXTRACTION CHALLENGE

PDF has no "table" concept. A table is just:
  - Horizontal and vertical lines (sometimes invisible)
  - Text positioned in a grid pattern
  - Sometimes no lines at all (whitespace-delimited)

pdfplumber uses line detection + text positioning
to reconstruct table structure. It works well for:
  ✓ Tables with visible borders/lines
  ✓ Tables with consistent column alignment
  ✗ Tables with merged cells (partial support)
  ✗ Tables spanning multiple pages (manual handling)
  ✗ Tables without any lines (use Camelot "stream" mode)
```

### 3.2 Basic Table Extraction

```python
import pdfplumber

def extract_tables(pdf_path: str) -> list[list[list[str]]]:
    """Extract all tables from all pages."""
    all_tables = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables()
            all_tables.extend(tables)
    return all_tables

# Usage
tables = extract_tables("financial_report.pdf")
for i, table in enumerate(tables):
    print(f"\nTable {i + 1}:")
    for row in table:
        print(row)
```

### 3.3 Tables to pandas DataFrames

```python
import pdfplumber
import pandas as pd

def tables_to_dataframes(pdf_path: str) -> list[pd.DataFrame]:
    """Extract tables and convert to pandas DataFrames."""
    dataframes = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables()
            for table in tables:
                if not table or len(table) < 2:
                    continue
                # First row as header, rest as data
                df = pd.DataFrame(table[1:], columns=table[0])
                dataframes.append(df)
    return dataframes

# Usage
dfs = tables_to_dataframes("quarterly_report.pdf")
for i, df in enumerate(dfs):
    print(f"\nTable {i + 1}:")
    print(df.to_string())
```

### 3.4 Custom Table Settings

```python
import pdfplumber

def extract_with_settings(pdf_path: str, page_num: int = 0):
    """Extract tables with custom detection settings."""
    with pdfplumber.open(pdf_path) as pdf:
        page = pdf.pages[page_num]

        # Custom settings for better table detection
        table_settings = {
            "vertical_strategy": "lines",    # or "text", "explicit"
            "horizontal_strategy": "lines",  # or "text", "explicit"
            "snap_tolerance": 3,             # pixel tolerance for alignment
            "join_tolerance": 3,             # tolerance for joining lines
            "edge_min_length": 3,            # minimum line length
            "min_words_vertical": 3,         # min words for vertical strategy
            "min_words_horizontal": 1,       # min words for horizontal strategy
        }

        tables = page.extract_tables(table_settings)
        return tables
```

### 3.5 Visual Debugging

pdfplumber can render pages with detected lines and tables highlighted:

```python
import pdfplumber

def debug_table_detection(pdf_path: str, page_num: int = 0, output: str = "debug.png"):
    """Visualize what pdfplumber detects on a page."""
    with pdfplumber.open(pdf_path) as pdf:
        page = pdf.pages[page_num]

        # Draw detected elements
        im = page.to_image(resolution=200)
        im.debug_tablefinder()  # Highlights detected table structure
        im.save(output)
        print(f"Debug image saved to {output}")

# Usage
debug_table_detection("report.pdf", page_num=2)
```

---

## 4. Writing PDFs with ReportLab

### 4.1 Simple PDF Generation

```python
from reportlab.lib.pagesizes import letter, A4
from reportlab.pdfgen import canvas

def create_simple_pdf(output_path: str):
    """Create a basic PDF document."""
    c = canvas.Canvas(output_path, pagesize=letter)
    width, height = letter  # 612 x 792 points

    # Title
    c.setFont("Helvetica-Bold", 24)
    c.drawString(72, height - 72, "Invoice #12345")

    # Body text
    c.setFont("Helvetica", 12)
    c.drawString(72, height - 120, "Date: 2024-01-15")
    c.drawString(72, height - 140, "Bill To: Acme Corporation")

    # Draw a line
    c.setStrokeColorRGB(0, 0, 0)
    c.line(72, height - 160, width - 72, height - 160)

    # Table-like data
    y = height - 190
    c.setFont("Helvetica-Bold", 12)
    c.drawString(72, y, "Item")
    c.drawString(300, y, "Qty")
    c.drawString(400, y, "Price")

    c.setFont("Helvetica", 12)
    items = [("Widget A", "10", "$50.00"), ("Widget B", "5", "$62.50")]
    for item, qty, price in items:
        y -= 20
        c.drawString(72, y, item)
        c.drawString(300, y, qty)
        c.drawString(400, y, price)

    c.save()
    print(f"PDF saved to {output_path}")

create_simple_pdf("invoice.pdf")
```

### 4.2 Using Platypus (High-Level API)

ReportLab's Platypus framework handles page layout, pagination, and flow automatically:

```python
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib import colors

def create_report(output_path: str):
    """Create a formatted report with Platypus."""
    doc = SimpleDocTemplate(output_path, pagesize=letter)
    styles = getSampleStyleSheet()
    story = []

    # Title
    story.append(Paragraph("Quarterly Report Q4 2024", styles["Title"]))
    story.append(Spacer(1, 0.3 * inch))

    # Body paragraph
    story.append(Paragraph(
        "This report summarizes the financial performance for Q4 2024. "
        "Revenue increased by 15% compared to the previous quarter.",
        styles["BodyText"],
    ))
    story.append(Spacer(1, 0.2 * inch))

    # Table
    data = [
        ["Product", "Units Sold", "Revenue"],
        ["Widget A", "1,200", "$60,000"],
        ["Widget B", "800", "$100,000"],
        ["Widget C", "2,500", "$25,000"],
        ["Total", "4,500", "$185,000"],
    ]

    table = Table(data, colWidths=[2 * inch, 1.5 * inch, 1.5 * inch])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.grey),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
        ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 12),
        ("BACKGROUND", (0, -1), (-1, -1), colors.lightgrey),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 1, colors.black),
    ]))
    story.append(table)

    doc.build(story)
    print(f"Report saved to {output_path}")

create_report("quarterly_report.pdf")
```

### 4.3 HTML to PDF with WeasyPrint

For complex layouts, generating PDF from HTML/CSS is often easier:

```python
# pip install weasyprint
from weasyprint import HTML

def html_to_pdf(html_content: str, output_path: str):
    """Convert HTML string to PDF."""
    HTML(string=html_content).write_pdf(output_path)

html = """
<html>
<head>
    <style>
        body { font-family: Arial; margin: 40px; }
        h1 { color: #333; border-bottom: 2px solid #333; }
        table { border-collapse: collapse; width: 100%; margin-top: 20px; }
        th { background: #333; color: white; padding: 10px; }
        td { border: 1px solid #ddd; padding: 8px; }
        tr:nth-child(even) { background: #f2f2f2; }
        .total { font-weight: bold; background: #e0e0e0 !important; }
    </style>
</head>
<body>
    <h1>Invoice #12345</h1>
    <p>Date: January 15, 2024</p>
    <table>
        <tr><th>Item</th><th>Qty</th><th>Price</th></tr>
        <tr><td>Widget A</td><td>10</td><td>$50.00</td></tr>
        <tr><td>Widget B</td><td>5</td><td>$62.50</td></tr>
        <tr class="total"><td>Total</td><td></td><td>$112.50</td></tr>
    </table>
</body>
</html>
"""

html_to_pdf(html, "invoice_from_html.pdf")
```

---

## 5. PDF Manipulation with PyPDF

### 5.1 Merging PDFs

```python
from pypdf import PdfReader, PdfWriter

def merge_pdfs(input_paths: list[str], output_path: str):
    """Merge multiple PDFs into one."""
    writer = PdfWriter()
    for path in input_paths:
        reader = PdfReader(path)
        for page in reader.pages:
            writer.add_page(page)
    with open(output_path, "wb") as f:
        writer.write(f)
    print(f"Merged {len(input_paths)} PDFs into {output_path}")

# Usage
merge_pdfs(["cover.pdf", "chapter1.pdf", "chapter2.pdf"], "book.pdf")
```

### 5.2 Splitting PDFs

```python
from pypdf import PdfReader, PdfWriter

def split_pdf(input_path: str, output_dir: str):
    """Split a PDF into individual pages."""
    from pathlib import Path
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    reader = PdfReader(input_path)
    for i, page in enumerate(reader.pages):
        writer = PdfWriter()
        writer.add_page(page)
        output_path = str(Path(output_dir) / f"page_{i + 1}.pdf")
        with open(output_path, "wb") as f:
            writer.write(f)
    print(f"Split into {len(reader.pages)} pages in {output_dir}")

def extract_page_range(input_path: str, start: int, end: int, output_path: str):
    """Extract a range of pages (1-indexed)."""
    reader = PdfReader(input_path)
    writer = PdfWriter()
    for i in range(start - 1, min(end, len(reader.pages))):
        writer.add_page(reader.pages[i])
    with open(output_path, "wb") as f:
        writer.write(f)
    print(f"Extracted pages {start}-{end} to {output_path}")
```

### 5.3 Rotating and Watermarking

```python
from pypdf import PdfReader, PdfWriter

def rotate_pages(input_path: str, output_path: str, degrees: int = 90):
    """Rotate all pages in a PDF."""
    reader = PdfReader(input_path)
    writer = PdfWriter()
    for page in reader.pages:
        page.rotate(degrees)
        writer.add_page(page)
    with open(output_path, "wb") as f:
        writer.write(f)

def add_watermark(input_path: str, watermark_path: str, output_path: str):
    """Add a watermark PDF to every page."""
    reader = PdfReader(input_path)
    watermark = PdfReader(watermark_path).pages[0]
    writer = PdfWriter()

    for page in reader.pages:
        page.merge_page(watermark)
        writer.add_page(page)

    with open(output_path, "wb") as f:
        writer.write(f)
    print(f"Watermarked PDF saved to {output_path}")
```

### 5.4 Reading and Writing Metadata

```python
from pypdf import PdfReader, PdfWriter

def read_metadata(pdf_path: str) -> dict:
    """Read PDF metadata."""
    reader = PdfReader(pdf_path)
    meta = reader.metadata
    return {
        "title": meta.title if meta else None,
        "author": meta.author if meta else None,
        "subject": meta.subject if meta else None,
        "creator": meta.creator if meta else None,
        "producer": meta.producer if meta else None,
        "page_count": len(reader.pages),
    }

def set_metadata(input_path: str, output_path: str, metadata: dict):
    """Set PDF metadata."""
    reader = PdfReader(input_path)
    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)

    writer.add_metadata({
        "/Title": metadata.get("title", ""),
        "/Author": metadata.get("author", ""),
        "/Subject": metadata.get("subject", ""),
    })

    with open(output_path, "wb") as f:
        writer.write(f)
```

---

## 6. PDF Security

### 6.1 Encryption and Decryption

```python
from pypdf import PdfReader, PdfWriter

def encrypt_pdf(input_path: str, output_path: str, password: str):
    """Encrypt a PDF with a password."""
    reader = PdfReader(input_path)
    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)

    # user_password: needed to open the PDF
    # owner_password: needed to change permissions
    writer.encrypt(
        user_password=password,
        owner_password=password,
        use_128bit=True,
    )

    with open(output_path, "wb") as f:
        writer.write(f)
    print(f"Encrypted PDF saved to {output_path}")

def decrypt_pdf(input_path: str, output_path: str, password: str):
    """Decrypt a password-protected PDF."""
    reader = PdfReader(input_path)
    if reader.is_encrypted:
        reader.decrypt(password)

    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)

    with open(output_path, "wb") as f:
        writer.write(f)
    print(f"Decrypted PDF saved to {output_path}")
```

### 6.2 Redaction with pikepdf

```python
import pikepdf

def remove_metadata(input_path: str, output_path: str):
    """Remove all metadata from a PDF for privacy."""
    with pikepdf.open(input_path) as pdf:
        # Remove document info
        with pdf.open_metadata() as meta:
            for key in list(meta.keys()):
                del meta[key]

        pdf.save(output_path)
    print(f"Metadata removed, saved to {output_path}")
```

---

## 7. Advanced: Form Handling

### 7.1 Reading Form Fields

```python
from pypdf import PdfReader

def read_form_fields(pdf_path: str) -> dict:
    """Read all form field values from a PDF."""
    reader = PdfReader(pdf_path)
    fields = reader.get_fields()
    if not fields:
        return {}

    result = {}
    for name, field in fields.items():
        result[name] = {
            "value": field.get("/V"),
            "type": str(field.get("/FT")),
        }
    return result

# Usage
fields = read_form_fields("application_form.pdf")
for name, info in fields.items():
    print(f"{name}: {info['value']} (type: {info['type']})")
```

### 7.2 Filling Form Fields

```python
from pypdf import PdfReader, PdfWriter

def fill_form(input_path: str, output_path: str, data: dict):
    """Fill PDF form fields with data."""
    reader = PdfReader(input_path)
    writer = PdfWriter()

    writer.append(reader)
    writer.update_page_form_field_values(
        writer.pages[0],
        data,
    )

    with open(output_path, "wb") as f:
        writer.write(f)
    print(f"Filled form saved to {output_path}")

# Usage
fill_form("tax_form.pdf", "tax_form_filled.pdf", {
    "name": "John Doe",
    "ssn": "123-45-6789",
    "income": "75000",
})
```

---

## 8. Choosing the Right Library

```
LIBRARY DECISION MATRIX

Task                          Best Library          Alternative
─────────────────────────────────────────────────────────────────
Fast text extraction          PyMuPDF (fitz)        pdfminer.six
Table extraction              pdfplumber            Camelot
Merge / split / rotate        PyPDF                 pikepdf
PDF generation (programmatic) ReportLab             FPDF2
PDF generation (from HTML)    WeasyPrint            wkhtmltopdf
Low-level PDF manipulation    pikepdf               PyPDF
Encryption / decryption       PyPDF or pikepdf      -
Form reading / filling        PyPDF                 pikepdf
Image extraction              PyMuPDF               pdfminer.six
Page rendering (PDF to image) PyMuPDF               pdf2image + Poppler
OCR on scanned PDFs           OCRmyPDF              pytesseract + pdf2image
Metadata handling             pikepdf               PyPDF

PERFORMANCE COMPARISON (extracting text from 100-page PDF):
  PyMuPDF:       ~0.5 seconds  (fastest, C-based)
  pdfplumber:    ~3 seconds    (slower, pure Python table logic)
  pdfminer.six:  ~5 seconds    (slowest, most detailed)
  PyPDF:         ~1 second     (fast, but less text quality)
```

---

## 9. Worked Problems

### Problem 1: Invoice Data Extraction Pipeline

```python
import fitz
import pdfplumber
import re
import json

def extract_invoice(pdf_path: str) -> dict:
    """Extract structured data from an invoice PDF."""
    # Step 1: Get full text with PyMuPDF (fast)
    doc = fitz.open(pdf_path)
    full_text = ""
    for page in doc:
        full_text += page.get_text()
    doc.close()

    # Step 2: Extract key-value pairs with regex
    invoice_num = re.search(r"Invoice\s*#?\s*(\w+)", full_text)
    date = re.search(r"Date:\s*(\d{4}-\d{2}-\d{2})", full_text)
    total = re.search(r"Total:?\s*\$?([\d,]+\.?\d*)", full_text)

    # Step 3: Extract tables with pdfplumber
    line_items = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables()
            for table in tables:
                for row in table[1:]:  # skip header
                    if row and len(row) >= 3:
                        line_items.append({
                            "item": row[0],
                            "quantity": row[1],
                            "price": row[2],
                        })

    return {
        "invoice_number": invoice_num.group(1) if invoice_num else None,
        "date": date.group(1) if date else None,
        "total": total.group(1) if total else None,
        "line_items": line_items,
    }

# Usage
data = extract_invoice("invoice.pdf")
print(json.dumps(data, indent=2))
```

### Problem 2: PDF Report Generator

```python
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table,
    TableStyle, PageBreak, Image
)
from reportlab.lib import colors

def generate_report(data: dict, output_path: str):
    """Generate a formatted PDF report from structured data."""
    doc = SimpleDocTemplate(output_path, pagesize=letter,
                           topMargin=0.75*inch, bottomMargin=0.75*inch)
    styles = getSampleStyleSheet()
    story = []

    # Title page
    story.append(Spacer(1, 2 * inch))
    story.append(Paragraph(data["title"], styles["Title"]))
    story.append(Spacer(1, 0.5 * inch))
    story.append(Paragraph(f"Prepared by: {data['author']}", styles["Normal"]))
    story.append(Paragraph(f"Date: {data['date']}", styles["Normal"]))
    story.append(PageBreak())

    # Sections
    for section in data["sections"]:
        story.append(Paragraph(section["heading"], styles["Heading1"]))
        story.append(Spacer(1, 0.1 * inch))
        story.append(Paragraph(section["body"], styles["BodyText"]))
        story.append(Spacer(1, 0.3 * inch))

        # Add table if present
        if "table" in section:
            t = Table(section["table"]["rows"])
            t.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#4472C4")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#D9E2F3")]),
            ]))
            story.append(t)
            story.append(Spacer(1, 0.3 * inch))

    doc.build(story)
    print(f"Report saved to {output_path}")

# Usage
report_data = {
    "title": "Annual Performance Report",
    "author": "Data Team",
    "date": "2024-12-31",
    "sections": [
        {
            "heading": "Executive Summary",
            "body": "This report summarizes key metrics for the fiscal year 2024.",
        },
        {
            "heading": "Revenue Breakdown",
            "body": "Revenue grew 18% year-over-year, driven by product expansion.",
            "table": {
                "rows": [
                    ["Quarter", "Revenue", "Growth"],
                    ["Q1", "$1.2M", "+12%"],
                    ["Q2", "$1.4M", "+15%"],
                    ["Q3", "$1.5M", "+18%"],
                    ["Q4", "$1.8M", "+22%"],
                ],
            },
        },
    ],
}

generate_report(report_data, "annual_report.pdf")
```

---

## Appendix: PDF Processing Cheat Sheet

```
PDF PROCESSING CHEAT SHEET

PDF Types:
  Born-digital: Has text data, extract directly
  Scanned:      Image-only, needs OCR
  Hybrid:       Mix of both, check each page

Reading:
  PyMuPDF:    fitz.open(path) -> page.get_text()
  pdfplumber: pdfplumber.open(path) -> page.extract_tables()

Writing:
  ReportLab:  canvas.Canvas() for simple, Platypus for complex
  WeasyPrint: HTML(string=html).write_pdf(output)

Manipulation:
  Merge:      PdfWriter().add_page() from multiple readers
  Split:      PdfWriter() per page
  Rotate:     page.rotate(degrees)
  Watermark:  page.merge_page(watermark_page)
  Encrypt:    writer.encrypt(password)

Tables:
  pdfplumber: page.extract_tables() (line-based detection)
  Camelot:    lattice mode (lines) or stream mode (whitespace)
  Debug:      page.to_image().debug_tablefinder()

Forms:
  Read:       PdfReader.get_fields()
  Fill:       writer.update_page_form_field_values()

Key Libraries:
  PyMuPDF (fitz):  Fast read, images, render
  pdfplumber:      Tables, visual debug
  PyPDF:           Merge, split, forms, encrypt
  ReportLab:       Generate PDFs programmatically
  pikepdf:         Low-level, metadata, repair
  WeasyPrint:      HTML/CSS to PDF
```
