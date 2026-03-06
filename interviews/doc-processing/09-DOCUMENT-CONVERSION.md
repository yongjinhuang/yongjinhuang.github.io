# Chapter 9: Document Conversion

## Introduction

Document conversion — transforming files between formats — is one of the most requested features in document processing systems. Users upload Word documents that need to become PDFs. Scanned images need to become searchable PDFs. Markdown documentation needs to become polished HTML. This chapter covers the tools and techniques for reliable format conversion.

```
+------------------------------------------------------------------------+
|                    DOCUMENT CONVERSION                                   |
+------------------------------------------------------------------------+
|                                                                        |
|  UNIVERSAL CONVERTERS            FORMAT-SPECIFIC                       |
|  +------------------------+     +---------------------------+          |
|  | Pandoc                  |     | WeasyPrint (HTML -> PDF)   |          |
|  |   40+ formats           |     | ReportLab (data -> PDF)    |          |
|  |   CLI + Python wrapper  |     | python-docx (data -> DOCX) |          |
|  | LibreOffice (headless)  |     | openpyxl (data -> XLSX)    |          |
|  |   Office format expert  |     | Pillow (image conversion)  |          |
|  |   PDF, DOCX, XLSX, etc. |     | pdf2image (PDF -> images)  |          |
|  +------------------------+     +---------------------------+          |
|                                                                        |
|  COMMON CONVERSIONS                                                    |
|  +--------------------------------------------------------------+     |
|  | DOCX -> PDF    (LibreOffice, Word)                             |     |
|  | HTML -> PDF    (WeasyPrint, wkhtmltopdf, Chrome headless)      |     |
|  | PDF -> DOCX    (LibreOffice, limited fidelity)                 |     |
|  | PDF -> Images  (PyMuPDF, pdf2image + Poppler)                  |     |
|  | Images -> PDF  (PyMuPDF, Pillow, img2pdf)                      |     |
|  | Markdown -> HTML/PDF/DOCX (Pandoc)                             |     |
|  | Excel -> CSV   (openpyxl, pandas)                               |     |
|  | Scanned PDF -> Searchable PDF (OCRmyPDF)                       |     |
|  +--------------------------------------------------------------+     |
|                                                                        |
+------------------------------------------------------------------------+
```

---

## 1. Pandoc: The Universal Converter

### 1.1 What Pandoc Can Do

```
PANDOC SUPPORTED FORMATS (partial list)

INPUT:                          OUTPUT:
  Markdown (.md)                  HTML
  reStructuredText (.rst)         PDF (via LaTeX or wkhtmltopdf)
  HTML                            DOCX (Word)
  LaTeX (.tex)                    EPUB
  DOCX (Word)                     LaTeX
  EPUB                            Markdown
  MediaWiki                       reStructuredText
  Org-mode                        Reveal.js slides
  CSV (via extensions)            Plain text
  JSON (pandoc AST)               PPTX (PowerPoint)
```

### 1.2 Using Pandoc from Python

```python
import subprocess

def pandoc_convert(input_path: str, output_path: str, extra_args: list[str] = None):
    """Convert between document formats using Pandoc."""
    cmd = ["pandoc", input_path, "-o", output_path]
    if extra_args:
        cmd.extend(extra_args)

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"Pandoc error: {result.stderr}")
    print(f"Converted: {input_path} -> {output_path}")

# Markdown to HTML
pandoc_convert("README.md", "readme.html")

# Markdown to PDF (requires LaTeX or wkhtmltopdf)
pandoc_convert("report.md", "report.pdf")

# Markdown to DOCX
pandoc_convert("document.md", "document.docx")

# DOCX to Markdown
pandoc_convert("report.docx", "report.md")

# HTML to EPUB
pandoc_convert("book.html", "book.epub", ["--toc", "--toc-depth=2"])

# With custom CSS
pandoc_convert("doc.md", "doc.html", ["--css=style.css", "--standalone"])
```

### 1.3 Using pypandoc (Python Wrapper)

```python
# pip install pypandoc
import pypandoc

# String conversion
html = pypandoc.convert_text("# Hello\n\nWorld", "html", format="md")
print(html)  # <h1>Hello</h1>\n<p>World</p>

# File conversion
pypandoc.convert_file("report.md", "docx", outputfile="report.docx")

# With extra args
pypandoc.convert_file(
    "thesis.md", "pdf",
    outputfile="thesis.pdf",
    extra_args=["--pdf-engine=xelatex", "--toc"]
)
```

---

## 2. LibreOffice Headless Conversion

### 2.1 Why LibreOffice

LibreOffice is the best option for converting between Office formats because it uses the same rendering engine as a full office suite:

```
LIBREOFFICE CONVERSIONS

Best at:
  DOCX -> PDF  (high fidelity, preserves formatting)
  XLSX -> PDF  (preserves layout)
  PPTX -> PDF  (preserves slides)
  DOC -> DOCX  (legacy format upgrade)
  ODT -> DOCX  (OpenDocument to Office)

Install:
  macOS:  brew install --cask libreoffice
  Ubuntu: sudo apt install libreoffice
  Docker: FROM libreoffice/libreoffice:latest
```

### 2.2 Command-Line Usage

```bash
# DOCX to PDF
libreoffice --headless --convert-to pdf report.docx

# XLSX to PDF
libreoffice --headless --convert-to pdf spreadsheet.xlsx

# PPTX to PDF
libreoffice --headless --convert-to pdf presentation.pptx

# DOC to DOCX (legacy upgrade)
libreoffice --headless --convert-to docx old_document.doc

# Specify output directory
libreoffice --headless --convert-to pdf --outdir /output/ report.docx

# Batch conversion (all DOCX in a directory)
libreoffice --headless --convert-to pdf *.docx
```

### 2.3 Python Wrapper

```python
import subprocess
from pathlib import Path

def libreoffice_convert(input_path: str, output_format: str, output_dir: str = None) -> str:
    """Convert a document using LibreOffice headless."""
    output_dir = output_dir or str(Path(input_path).parent)
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    cmd = [
        "libreoffice",
        "--headless",
        "--convert-to", output_format,
        "--outdir", output_dir,
        input_path,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        raise RuntimeError(f"LibreOffice error: {result.stderr}")

    # Determine output path
    input_stem = Path(input_path).stem
    output_path = str(Path(output_dir) / f"{input_stem}.{output_format}")
    return output_path

# Usage
pdf_path = libreoffice_convert("report.docx", "pdf")
print(f"Converted to: {pdf_path}")
```

---

## 3. HTML to PDF

### 3.1 WeasyPrint

```python
from weasyprint import HTML

# From HTML string
HTML(string="<h1>Hello</h1><p>World</p>").write_pdf("output.pdf")

# From HTML file
HTML(filename="report.html").write_pdf("report.pdf")

# From URL
HTML(url="https://example.com").write_pdf("page.pdf")

# With custom CSS
HTML(string=html_content).write_pdf(
    "styled.pdf",
    stylesheets=["custom.css"],
)
```

### 3.2 Template-Based PDF Generation

```python
from jinja2 import Template
from weasyprint import HTML

def generate_pdf_from_template(template_html: str, data: dict, output_path: str):
    """Generate a PDF from an HTML template with data."""
    template = Template(template_html)
    rendered = template.render(**data)
    HTML(string=rendered).write_pdf(output_path)

# Usage
template = """
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial; margin: 40px; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background: #4472C4; color: white; }
        .total { font-weight: bold; font-size: 1.2em; }
    </style>
</head>
<body>
    <h1>Invoice {{ invoice_number }}</h1>
    <p>Date: {{ date }}</p>
    <p>Bill To: {{ customer }}</p>
    <table>
        <tr><th>Item</th><th>Qty</th><th>Price</th></tr>
        {% for item in items %}
        <tr><td>{{ item.name }}</td><td>{{ item.qty }}</td><td>${{ item.price }}</td></tr>
        {% endfor %}
    </table>
    <p class="total">Total: ${{ total }}</p>
</body>
</html>
"""

generate_pdf_from_template(template, {
    "invoice_number": "INV-2024-001",
    "date": "January 15, 2024",
    "customer": "Acme Corp",
    "items": [
        {"name": "Widget A", "qty": 10, "price": "50.00"},
        {"name": "Widget B", "qty": 5, "price": "62.50"},
    ],
    "total": "112.50",
}, "invoice.pdf")
```

---

## 4. PDF to Images

### 4.1 Using PyMuPDF

```python
import fitz

def pdf_to_images(pdf_path: str, output_dir: str, dpi: int = 200) -> list[str]:
    """Convert each PDF page to a PNG image."""
    from pathlib import Path
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    doc = fitz.open(pdf_path)
    zoom = dpi / 72
    mat = fitz.Matrix(zoom, zoom)
    saved = []

    for i, page in enumerate(doc):
        pix = page.get_pixmap(matrix=mat)
        output_path = str(Path(output_dir) / f"page_{i + 1:03d}.png")
        pix.save(output_path)
        saved.append(output_path)

    doc.close()
    return saved

# Usage
images = pdf_to_images("report.pdf", "pages/", dpi=300)
print(f"Created {len(images)} images")
```

### 4.2 Using pdf2image (Poppler-based)

```python
# pip install pdf2image
# Also requires poppler: brew install poppler (macOS) or apt install poppler-utils
from pdf2image import convert_from_path

def pdf_to_images_poppler(pdf_path: str, output_dir: str, dpi: int = 200) -> list[str]:
    """Convert PDF to images using Poppler (often better quality)."""
    from pathlib import Path
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    images = convert_from_path(pdf_path, dpi=dpi)
    saved = []
    for i, img in enumerate(images):
        path = str(Path(output_dir) / f"page_{i + 1:03d}.png")
        img.save(path, "PNG")
        saved.append(path)
    return saved
```

---

## 5. Images to PDF

### 5.1 Using img2pdf (Lossless)

```python
# pip install img2pdf
import img2pdf
from pathlib import Path

def images_to_pdf(image_paths: list[str], output_path: str):
    """Convert images to PDF (lossless, preserves original quality)."""
    with open(output_path, "wb") as f:
        f.write(img2pdf.convert(image_paths))
    print(f"Created {output_path}")

# Usage
images = sorted(Path("scans/").glob("*.jpg"))
images_to_pdf([str(p) for p in images], "scanned_document.pdf")
```

### 5.2 Using Pillow

```python
from PIL import Image
from pathlib import Path

def images_to_pdf_pillow(image_paths: list[str], output_path: str):
    """Convert images to PDF using Pillow."""
    images = []
    for path in image_paths:
        img = Image.open(path)
        if img.mode == "RGBA":
            img = img.convert("RGB")
        images.append(img)

    if images:
        images[0].save(output_path, save_all=True, append_images=images[1:])
    print(f"Created {output_path}")
```

---

## 6. Scanned PDF to Searchable PDF (OCRmyPDF)

```bash
# Install: pip install ocrmypdf
# Also requires Tesseract: brew install tesseract

# Basic usage: add OCR text layer to scanned PDF
ocrmypdf input_scan.pdf output_searchable.pdf

# Specify language
ocrmypdf -l eng+fra scan.pdf searchable.pdf

# Skip pages that already have text
ocrmypdf --skip-text mixed_document.pdf output.pdf

# Force OCR on all pages
ocrmypdf --force-ocr document.pdf output.pdf

# Optimize file size
ocrmypdf --optimize 3 large_scan.pdf smaller.pdf

# Deskew (fix rotation) + clean (remove noise)
ocrmypdf --deskew --clean scan.pdf clean_output.pdf
```

```python
import subprocess

def make_searchable(input_pdf: str, output_pdf: str, language: str = "eng"):
    """Add OCR text layer to a scanned PDF."""
    cmd = [
        "ocrmypdf",
        "--skip-text",       # Don't re-OCR pages that have text
        "--deskew",          # Fix page rotation
        "-l", language,
        input_pdf,
        output_pdf,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"OCRmyPDF error: {result.stderr}")
    print(f"Searchable PDF: {output_pdf}")
```

---

## 7. Batch Conversion Pipeline

```python
from pathlib import Path
import subprocess
from concurrent.futures import ProcessPoolExecutor

def batch_convert(input_dir: str, output_dir: str, output_format: str = "pdf",
                  max_workers: int = 4):
    """Convert all supported documents in a directory."""
    input_path = Path(input_dir)
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    # Find convertible files
    extensions = {".docx", ".doc", ".xlsx", ".xls", ".pptx", ".ppt", ".odt", ".ods", ".odp"}
    files = [f for f in input_path.iterdir() if f.suffix.lower() in extensions]

    if not files:
        print("No files to convert")
        return []

    def convert_one(filepath: Path) -> dict:
        try:
            cmd = [
                "libreoffice", "--headless",
                "--convert-to", output_format,
                "--outdir", str(output_path),
                str(filepath),
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            success = result.returncode == 0
            return {"file": filepath.name, "success": success, "error": result.stderr if not success else None}
        except Exception as e:
            return {"file": filepath.name, "success": False, "error": str(e)}

    results = []
    with ProcessPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(convert_one, f): f for f in files}
        for future in futures:
            results.append(future.result())

    succeeded = sum(1 for r in results if r["success"])
    print(f"Converted {succeeded}/{len(results)} files")
    return results

# Usage
results = batch_convert("uploads/", "converted/", "pdf")
```

---

## 8. Worked Problems

### Problem 1: Multi-Format Document Converter API

```python
from pathlib import Path
import subprocess
import fitz
from weasyprint import HTML

class DocumentConverter:
    """Convert between common document formats."""

    LIBREOFFICE_FORMATS = {".docx", ".doc", ".xlsx", ".xls", ".pptx", ".ppt", ".odt", ".ods"}

    def convert(self, input_path: str, output_format: str) -> str:
        """Convert a document to the specified format."""
        path = Path(input_path)
        ext = path.suffix.lower()
        output_path = str(path.with_suffix(f".{output_format}"))

        if ext in self.LIBREOFFICE_FORMATS and output_format == "pdf":
            return self._libreoffice_convert(input_path, output_format)
        elif ext == ".md" and output_format in ("html", "pdf", "docx"):
            return self._pandoc_convert(input_path, output_path)
        elif ext == ".html" and output_format == "pdf":
            return self._html_to_pdf(input_path, output_path)
        elif ext == ".pdf" and output_format == "png":
            return self._pdf_to_images(input_path)
        else:
            raise ValueError(f"Unsupported conversion: {ext} -> {output_format}")

    def _libreoffice_convert(self, input_path: str, output_format: str) -> str:
        output_dir = str(Path(input_path).parent)
        cmd = ["libreoffice", "--headless", "--convert-to", output_format, "--outdir", output_dir, input_path]
        subprocess.run(cmd, capture_output=True, text=True, timeout=120, check=True)
        return str(Path(input_path).with_suffix(f".{output_format}"))

    def _pandoc_convert(self, input_path: str, output_path: str) -> str:
        subprocess.run(["pandoc", input_path, "-o", output_path], check=True)
        return output_path

    def _html_to_pdf(self, input_path: str, output_path: str) -> str:
        HTML(filename=input_path).write_pdf(output_path)
        return output_path

    def _pdf_to_images(self, input_path: str) -> str:
        output_dir = str(Path(input_path).parent / "images")
        Path(output_dir).mkdir(exist_ok=True)
        doc = fitz.open(input_path)
        for i, page in enumerate(doc):
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
            pix.save(str(Path(output_dir) / f"page_{i+1}.png"))
        doc.close()
        return output_dir

# Usage
converter = DocumentConverter()
converter.convert("report.docx", "pdf")
converter.convert("readme.md", "html")
```

---

## Appendix: Document Conversion Cheat Sheet

```
DOCUMENT CONVERSION CHEAT SHEET

Universal Converters:
  Pandoc:       40+ formats, great for text-based (MD, HTML, DOCX, LaTeX)
  LibreOffice:  Best for Office formats (DOCX/XLSX/PPTX -> PDF)

HTML to PDF:
  WeasyPrint:     Python-native, CSS support, good for templates
  wkhtmltopdf:    WebKit-based, good CSS support
  Chrome headless: Best browser rendering fidelity

PDF to Images:
  PyMuPDF:      fitz.open() -> page.get_pixmap() -> save()
  pdf2image:    Poppler-based, often better quality

Images to PDF:
  img2pdf:      Lossless, preserves original quality
  Pillow:       Simple, handles format conversion
  PyMuPDF:      Full control over page layout

Scanned PDF -> Searchable:
  OCRmyPDF:     ocrmypdf --skip-text --deskew input.pdf output.pdf

Office -> PDF:
  LibreOffice:  libreoffice --headless --convert-to pdf file.docx

Batch Conversion:
  ProcessPoolExecutor for parallelism
  LibreOffice for Office formats
  Error handling per file (don't fail the whole batch)

Key Libraries:
  pypandoc:     Python wrapper for Pandoc
  weasyprint:   HTML/CSS to PDF
  pdf2image:    PDF to images (requires Poppler)
  img2pdf:      Images to PDF (lossless)
  ocrmypdf:     Add OCR layer to scanned PDFs
  fitz:         PyMuPDF for PDF rendering
```
