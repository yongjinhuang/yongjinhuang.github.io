# Chapter 3: Word Documents

Microsoft Word's `.docx` format is the de facto standard for business documents worldwide. From contracts and invoices to reports and resumes, Word files dominate corporate communication. Understanding how to programmatically read, write, and transform Word documents unlocks powerful automation: generating hundreds of personalized letters in seconds, extracting structured data from legacy reports, or building template-driven document pipelines that eliminate manual formatting entirely. This chapter dissects the `.docx` format from its XML internals to high-level template engines, giving you complete mastery over Word document processing in Python.

```
+------------------------------------------------------------------+
|                 WORD DOCUMENT PROCESSING ECOSYSTEM                |
+------------------------------------------------------------------+
|                                                                  |
|   .docx File (ZIP Archive)                                       |
|   +---------------------------+                                  |
|   | [Content_Types].xml       |                                  |
|   | _rels/.rels               |                                  |
|   | word/                     |                                  |
|   |   document.xml  <-------- Core content (paragraphs, tables)  |
|   |   styles.xml              |                                  |
|   |   settings.xml            |                                  |
|   |   header1.xml             |                                  |
|   |   footer1.xml             |                                  |
|   |   media/                  |                                  |
|   |     image1.png            |                                  |
|   |   _rels/                  |                                  |
|   |     document.xml.rels     |                                  |
|   +---------------------------+                                  |
|              |                                                   |
|              v                                                   |
|   +---------------------------+    +-------------------------+   |
|   |      python-docx          |    |     docxtpl             |   |
|   |  (Read / Write / Edit)    |    | (Jinja2 Templates)      |   |
|   +---------------------------+    +-------------------------+   |
|              |                              |                    |
|              v                              v                    |
|   +---------------------------+    +-------------------------+   |
|   |  Document Object Model    |    | Template Variables       |  |
|   |  - Document               |    |  {{ name }}              |  |
|   |    - Paragraph[]          |    |  {% for item in list %}  |  |
|   |      - Run[]              |    |  {{ item }}              |  |
|   |    - Table[]              |    |  {% endfor %}            |  |
|   |      - Row[]              |    +-------------------------+   |
|   |        - Cell[]           |                                  |
|   |    - Section[]            |    +-------------------------+   |
|   |      - Header             |    |  Legacy .doc Support    |   |
|   |      - Footer             |    |  LibreOffice CLI        |   |
|   +---------------------------+    |  antiword / textract    |   |
|                                    +-------------------------+   |
|                                                                  |
|   Pipeline:                                                      |
|   JSON/CSV/DB --> Python --> .docx Template --> Rendered .docx    |
|                      |                              |             |
|                      v                              v             |
|                  Analysis                     PDF / Print         |
+------------------------------------------------------------------+
```

---

## 1. DOCX Internals (OOXML Structure)

A `.docx` file is not a single binary blob -- it is a **ZIP archive** containing XML files that follow the Office Open XML (OOXML) specification. Understanding this internal structure demystifies everything that higher-level libraries do under the hood.

### 1.1 The ZIP Archive

Every `.docx` file can be opened with any standard ZIP tool. Python's built-in `zipfile` module is all you need to peek inside.

```python
import zipfile
from pathlib import Path


def inspect_docx(filepath: str) -> list[str]:
    """List all files inside a .docx archive."""
    docx_path = Path(filepath)
    if not docx_path.exists():
        raise FileNotFoundError(f"File not found: {filepath}")

    with zipfile.ZipFile(docx_path, "r") as zf:
        entries = zf.namelist()
        for entry in entries:
            info = zf.getinfo(entry)
            print(f"  {entry:45s}  {info.file_size:>8d} bytes")
        return entries


# Example usage
entries = inspect_docx("report.docx")
```

Typical output:

```
  [Content_Types].xml                          1432 bytes
  _rels/.rels                                   590 bytes
  word/document.xml                            8234 bytes
  word/styles.xml                              32410 bytes
  word/settings.xml                             2876 bytes
  word/fontTable.xml                            1204 bytes
  word/theme/theme1.xml                         6790 bytes
  word/_rels/document.xml.rels                   817 bytes
  word/header1.xml                               543 bytes
  word/footer1.xml                               487 bytes
  word/media/image1.png                        24530 bytes
  docProps/core.xml                              732 bytes
  docProps/app.xml                               648 bytes
```

### 1.2 document.xml -- The Heart of the Document

The main content lives in `word/document.xml`. This XML file contains the document body with paragraphs (`<w:p>`), runs (`<w:r>`), and text elements (`<w:t>`).

```python
import zipfile
from xml.etree import ElementTree as ET


def read_document_xml(filepath: str) -> str:
    """Extract and pretty-print document.xml from a .docx file."""
    with zipfile.ZipFile(filepath, "r") as zf:
        raw_xml = zf.read("word/document.xml")

    root = ET.fromstring(raw_xml)
    ET.indent(root, space="  ")
    return ET.tostring(root, encoding="unicode")


xml_content = read_document_xml("report.docx")
print(xml_content[:2000])
```

A simplified `document.xml` looks like this:

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr>
        <w:pStyle w:val="Heading1"/>
      </w:pPr>
      <w:r>
        <w:t>Chapter Title</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:rPr>
          <w:b/>
          <w:sz w:val="24"/>
        </w:rPr>
        <w:t>This is bold text.</w:t>
      </w:r>
      <w:r>
        <w:t xml:space="preserve"> This is normal text.</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>
```

Key elements:

| XML Element | Meaning |
|-------------|---------|
| `<w:p>` | Paragraph |
| `<w:pPr>` | Paragraph properties (style, alignment) |
| `<w:r>` | Run (contiguous text with same formatting) |
| `<w:rPr>` | Run properties (bold, italic, font size) |
| `<w:t>` | Text content |
| `<w:tbl>` | Table |
| `<w:tr>` | Table row |
| `<w:tc>` | Table cell |

### 1.3 Relationships and Parts

The `_rels/` directories contain relationship files that link parts together. For example, `word/_rels/document.xml.rels` maps relationship IDs to targets like images, headers, and footers.

```python
def read_relationships(filepath: str) -> list[dict]:
    """Parse document relationships from a .docx file."""
    with zipfile.ZipFile(filepath, "r") as zf:
        rels_xml = zf.read("word/_rels/document.xml.rels")

    ns = {"r": "http://schemas.openxmlformats.org/package/2006/relationships"}
    root = ET.fromstring(rels_xml)

    relationships = []
    for rel in root.findall("r:Relationship", ns):
        relationships.append({
            "id": rel.get("Id"),
            "type": rel.get("Type", "").split("/")[-1],
            "target": rel.get("Target"),
        })

    return relationships


rels = read_relationships("report.docx")
for r in rels:
    print(f"  {r['id']:10s}  {r['type']:20s}  {r['target']}")
```

Output:

```
  rId1        styles                word/styles.xml
  rId2        settings              word/settings.xml
  rId3        image                 media/image1.png
  rId4        header                header1.xml
  rId5        footer                footer1.xml
```

### 1.4 Extracting Raw Text Without Libraries

Sometimes you need quick text extraction without installing any third-party packages.

```python
import zipfile
from xml.etree import ElementTree as ET


def extract_text_raw(filepath: str) -> str:
    """Extract all text from a .docx using only the standard library."""
    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}

    with zipfile.ZipFile(filepath, "r") as zf:
        xml_bytes = zf.read("word/document.xml")

    root = ET.fromstring(xml_bytes)
    paragraphs = []

    for para in root.iter(f"{{{ns['w']}}}p"):
        texts = []
        for text_elem in para.iter(f"{{{ns['w']}}}t"):
            if text_elem.text:
                texts.append(text_elem.text)
        if texts:
            paragraphs.append("".join(texts))

    return "\n".join(paragraphs)


content = extract_text_raw("report.docx")
print(content)
```

---

## 2. Reading Word Documents with python-docx

The `python-docx` library provides a Pythonic API over the raw OOXML structure. Install it with:

```bash
pip install python-docx
```

### 2.1 Opening Documents and Extracting Text

```python
from docx import Document


def read_all_text(filepath: str) -> str:
    """Read all paragraph text from a Word document."""
    doc = Document(filepath)
    return "\n".join(para.text for para in doc.paragraphs)


text = read_all_text("report.docx")
print(text)
```

### 2.2 Extracting Paragraphs with Style Information

Each paragraph carries a style (e.g., "Heading 1", "Normal", "List Bullet"). This is essential for understanding document structure.

```python
from docx import Document


def extract_structured_content(filepath: str) -> list[dict]:
    """Extract paragraphs with their style and formatting metadata."""
    doc = Document(filepath)
    content = []

    for para in doc.paragraphs:
        if not para.text.strip():
            continue

        runs_info = []
        for run in para.runs:
            runs_info.append({
                "text": run.text,
                "bold": run.bold,
                "italic": run.italic,
                "underline": run.underline,
                "font_name": run.font.name,
                "font_size": str(run.font.size) if run.font.size else None,
            })

        content.append({
            "text": para.text,
            "style": para.style.name,
            "alignment": str(para.alignment),
            "runs": runs_info,
        })

    return content


structured = extract_structured_content("report.docx")
for item in structured[:5]:
    print(f"[{item['style']}] {item['text'][:80]}")
```

### 2.3 Reading Tables

Word tables are accessed through `doc.tables`. Each table contains rows, and each row contains cells.

```python
from docx import Document


def extract_tables(filepath: str) -> list[list[list[str]]]:
    """Extract all tables as nested lists of strings."""
    doc = Document(filepath)
    all_tables = []

    for table in doc.tables:
        table_data = []
        for row in table.rows:
            row_data = [cell.text.strip() for cell in row.cells]
            table_data.append(row_data)
        all_tables.append(table_data)

    return all_tables


def tables_to_dicts(table_data: list[list[str]]) -> list[dict]:
    """Convert a table with a header row into a list of dictionaries."""
    if len(table_data) < 2:
        return []

    headers = table_data[0]
    return [
        dict(zip(headers, row))
        for row in table_data[1:]
    ]


tables = extract_tables("report.docx")
for i, table in enumerate(tables):
    print(f"\nTable {i + 1}:")
    records = tables_to_dicts(table)
    for record in records:
        print(f"  {record}")
```

### 2.4 Reading Headers and Footers

Headers and footers live in document sections. A document can have multiple sections, each with its own header and footer.

```python
from docx import Document


def extract_headers_footers(filepath: str) -> dict:
    """Extract headers and footers from all sections."""
    doc = Document(filepath)
    result = {"headers": [], "footers": []}

    for i, section in enumerate(doc.sections):
        header_text = "\n".join(
            para.text for para in section.header.paragraphs
            if para.text.strip()
        )
        footer_text = "\n".join(
            para.text for para in section.footer.paragraphs
            if para.text.strip()
        )

        if header_text:
            result["headers"].append({
                "section": i,
                "text": header_text,
            })
        if footer_text:
            result["footers"].append({
                "section": i,
                "text": footer_text,
            })

    return result


hf = extract_headers_footers("report.docx")
for h in hf["headers"]:
    print(f"Header (Section {h['section']}): {h['text']}")
for f in hf["footers"]:
    print(f"Footer (Section {f['section']}): {f['text']}")
```

### 2.5 Extracting Embedded Images

Images are stored as binary blobs inside the ZIP archive. We can extract them by following the relationships.

```python
import zipfile
from pathlib import Path
from docx import Document
from docx.opc.constants import RELATIONSHIP_TYPE as RT


def extract_images(filepath: str, output_dir: str) -> list[str]:
    """Extract all images from a .docx file to the output directory."""
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    saved_files = []

    with zipfile.ZipFile(filepath, "r") as zf:
        for entry in zf.namelist():
            if entry.startswith("word/media/"):
                filename = Path(entry).name
                dest = output_path / filename
                dest.write_bytes(zf.read(entry))
                saved_files.append(str(dest))
                print(f"  Extracted: {filename}")

    return saved_files


images = extract_images("report.docx", "./extracted_images")
print(f"Extracted {len(images)} images")
```

### 2.6 Full Document Extraction Pipeline

Combining all extraction methods into a single comprehensive pipeline:

```python
import json
from dataclasses import dataclass, asdict
from docx import Document


@dataclass(frozen=True)
class ExtractedDocument:
    filepath: str
    paragraphs: list[dict]
    tables: list[list[list[str]]]
    headers: list[str]
    footers: list[str]
    image_count: int


def full_extraction(filepath: str) -> ExtractedDocument:
    """Perform comprehensive extraction from a Word document."""
    doc = Document(filepath)

    paragraphs = [
        {"style": p.style.name, "text": p.text}
        for p in doc.paragraphs
        if p.text.strip()
    ]

    tables = [
        [[cell.text for cell in row.cells] for row in table.rows]
        for table in doc.tables
    ]

    headers = []
    footers = []
    for section in doc.sections:
        for para in section.header.paragraphs:
            if para.text.strip():
                headers.append(para.text)
        for para in section.footer.paragraphs:
            if para.text.strip():
                footers.append(para.text)

    image_count = sum(
        1 for rel in doc.part.rels.values()
        if "image" in rel.reltype
    )

    return ExtractedDocument(
        filepath=filepath,
        paragraphs=paragraphs,
        tables=tables,
        headers=headers,
        footers=footers,
        image_count=image_count,
    )


result = full_extraction("report.docx")
print(json.dumps(asdict(result), indent=2, default=str))
```

---

## 3. Writing Word Documents

### 3.1 Creating a New Document from Scratch

```python
from docx import Document
from docx.shared import Inches, Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH


def create_basic_document(output_path: str) -> None:
    """Create a basic Word document with common elements."""
    doc = Document()

    # Title
    title = doc.add_heading("Quarterly Report", level=0)
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER

    # Subtitle paragraph
    subtitle = doc.add_paragraph()
    subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = subtitle.add_run("Acme Corporation -- Q4 2025")
    run.font.size = Pt(14)
    run.font.color.rgb = RGBColor(0x66, 0x66, 0x66)

    # Section heading
    doc.add_heading("Executive Summary", level=1)

    # Normal paragraph
    doc.add_paragraph(
        "This report covers the financial performance and strategic "
        "initiatives undertaken during the fourth quarter of 2025. "
        "Key highlights include record revenue growth and successful "
        "expansion into three new markets."
    )

    # Bullet list
    doc.add_heading("Key Achievements", level=2)
    achievements = [
        "Revenue increased 23% year-over-year",
        "Customer base expanded to 50,000 active users",
        "Launched operations in Germany, Japan, and Brazil",
        "Net promoter score improved from 42 to 67",
    ]
    for item in achievements:
        doc.add_paragraph(item, style="List Bullet")

    # Numbered list
    doc.add_heading("Next Steps", level=2)
    next_steps = [
        "Finalize Series C funding round",
        "Hire 50 additional engineers",
        "Launch mobile application",
    ]
    for item in next_steps:
        doc.add_paragraph(item, style="List Number")

    doc.save(output_path)
    print(f"Document saved to {output_path}")


create_basic_document("quarterly_report.docx")
```

### 3.2 Adding Tables with Formatting

```python
from docx import Document
from docx.shared import Inches, Pt, RGBColor, Cm
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn


def create_formatted_table(doc: Document, headers: list[str],
                           rows: list[list[str]]) -> None:
    """Add a professionally formatted table to a document."""
    table = doc.add_table(rows=1, cols=len(headers))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.style = "Light Grid Accent 1"

    # Header row
    header_cells = table.rows[0].cells
    for i, header in enumerate(headers):
        header_cells[i].text = header
        for paragraph in header_cells[i].paragraphs:
            for run in paragraph.runs:
                run.bold = True
                run.font.size = Pt(11)
                run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)

    # Data rows
    for row_data in rows:
        row_cells = table.add_row().cells
        for i, value in enumerate(row_data):
            row_cells[i].text = str(value)
            for paragraph in row_cells[i].paragraphs:
                for run in paragraph.runs:
                    run.font.size = Pt(10)


def build_financial_report(output_path: str) -> None:
    """Build a report with formatted tables."""
    doc = Document()
    doc.add_heading("Financial Summary", level=1)

    headers = ["Quarter", "Revenue ($M)", "Expenses ($M)", "Profit ($M)"]
    rows = [
        ["Q1 2025", "12.4", "8.1", "4.3"],
        ["Q2 2025", "14.7", "9.2", "5.5"],
        ["Q3 2025", "16.1", "9.8", "6.3"],
        ["Q4 2025", "19.3", "11.0", "8.3"],
    ]

    create_formatted_table(doc, headers, rows)
    doc.add_paragraph()  # Spacer

    doc.add_heading("Regional Breakdown", level=2)
    region_headers = ["Region", "Revenue ($M)", "Growth (%)"]
    region_rows = [
        ["North America", "10.2", "18"],
        ["Europe", "5.1", "32"],
        ["Asia Pacific", "3.0", "45"],
        ["Latin America", "1.0", "120"],
    ]
    create_formatted_table(doc, region_headers, region_rows)

    doc.save(output_path)


build_financial_report("financial_report.docx")
```

### 3.3 Adding Images

```python
from docx import Document
from docx.shared import Inches, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH


def add_image_with_caption(doc: Document, image_path: str,
                           caption: str, width: float = 4.0) -> None:
    """Add an image with a centered caption below it."""
    # Image paragraph
    img_paragraph = doc.add_paragraph()
    img_paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = img_paragraph.add_run()
    run.add_picture(image_path, width=Inches(width))

    # Caption
    caption_para = doc.add_paragraph()
    caption_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
    caption_run = caption_para.add_run(caption)
    caption_run.italic = True
    caption_run.font.size = Pt(9)
    caption_run.font.color.rgb = RGBColor(0x88, 0x88, 0x88)


doc = Document()
doc.add_heading("Product Catalog", level=0)
add_image_with_caption(doc, "product_photo.png", "Figure 1: Widget Pro X100")
doc.save("catalog.docx")
```

### 3.4 Setting Page Layout

```python
from docx import Document
from docx.shared import Inches, Cm, Pt
from docx.enum.section import WD_ORIENT


def configure_page_layout(doc: Document,
                          orientation: str = "portrait",
                          margin_inches: float = 1.0) -> None:
    """Configure page layout for all sections."""
    for section in doc.sections:
        # Margins
        section.top_margin = Inches(margin_inches)
        section.bottom_margin = Inches(margin_inches)
        section.left_margin = Inches(margin_inches)
        section.right_margin = Inches(margin_inches)

        # Orientation
        if orientation == "landscape":
            section.orientation = WD_ORIENT.LANDSCAPE
            # Swap page dimensions for landscape
            original_width = section.page_width
            section.page_width = section.page_height
            section.page_height = original_width


doc = Document()
configure_page_layout(doc, orientation="landscape", margin_inches=0.75)
doc.add_heading("Wide Format Report", level=0)
doc.add_paragraph("This document uses landscape orientation with narrow margins.")
doc.save("landscape_report.docx")
```

### 3.5 Adding Headers and Footers

```python
from docx import Document
from docx.shared import Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH


def add_header_footer(doc: Document, header_text: str,
                      footer_text: str) -> None:
    """Add header and footer to the document."""
    for section in doc.sections:
        # Header
        header = section.header
        header.is_linked_to_previous = False
        header_para = header.paragraphs[0]
        header_para.text = header_text
        header_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        for run in header_para.runs:
            run.font.size = Pt(9)
            run.font.color.rgb = RGBColor(0x99, 0x99, 0x99)

        # Footer
        footer = section.footer
        footer.is_linked_to_previous = False
        footer_para = footer.paragraphs[0]
        footer_para.text = footer_text
        footer_para.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        for run in footer_para.runs:
            run.font.size = Pt(8)
            run.font.color.rgb = RGBColor(0x99, 0x99, 0x99)


doc = Document()
add_header_footer(doc, "CONFIDENTIAL -- Acme Corp", "Page | Draft v2.1")
doc.add_heading("Internal Memo", level=0)
doc.add_paragraph("This document is for internal use only.")
doc.save("memo_with_headers.docx")
```

### 3.6 Mixed Formatting Within Paragraphs

A single paragraph can contain multiple runs, each with different formatting.

```python
from docx import Document
from docx.shared import Pt, RGBColor


def add_mixed_paragraph(doc: Document) -> None:
    """Demonstrate mixed formatting within a single paragraph."""
    para = doc.add_paragraph()

    run_normal = para.add_run("The test results were ")
    run_normal.font.size = Pt(11)

    run_bold = para.add_run("statistically significant")
    run_bold.bold = True
    run_bold.font.size = Pt(11)

    run_normal2 = para.add_run(" with a p-value of ")
    run_normal2.font.size = Pt(11)

    run_colored = para.add_run("p < 0.001")
    run_colored.bold = True
    run_colored.italic = True
    run_colored.font.size = Pt(11)
    run_colored.font.color.rgb = RGBColor(0xCC, 0x00, 0x00)

    run_end = para.add_run(", confirming our hypothesis.")
    run_end.font.size = Pt(11)


doc = Document()
doc.add_heading("Research Findings", level=1)
add_mixed_paragraph(doc)
doc.save("research.docx")
```

---

## 4. Template-Based Generation

For complex documents with dynamic content, template-based generation using `docxtpl` (which wraps `python-docx` with Jinja2 templating) is far more maintainable than building documents programmatically.

```bash
pip install docxtpl
```

### 4.1 Basic Template Variables

Create a Word document template with `{{ variable }}` placeholders in the text, then render it with a context dictionary.

**Template file (`invoice_template.docx`):**
```
Invoice #{{ invoice_number }}
Date: {{ date }}
Bill To: {{ client_name }}
         {{ client_address }}

Total Due: ${{ total }}
```

**Rendering code:**

```python
from docxtpl import DocxTemplate


def render_invoice(template_path: str, output_path: str,
                   context: dict) -> None:
    """Render an invoice from a template."""
    tpl = DocxTemplate(template_path)
    tpl.render(context)
    tpl.save(output_path)


context = {
    "invoice_number": "INV-2025-0042",
    "date": "2025-12-15",
    "client_name": "Globex Corporation",
    "client_address": "742 Evergreen Terrace, Springfield, IL 62704",
    "total": "15,750.00",
}

render_invoice("invoice_template.docx", "invoice_0042.docx", context)
```

### 4.2 Loops and Conditionals in Templates

Templates support full Jinja2 syntax for iteration and conditional logic.

**Template with loops:**
```
{% for item in line_items %}
{{ item.description }}    Qty: {{ item.qty }}    Price: ${{ item.price }}
{% endfor %}

{% if discount %}
Discount Applied: {{ discount }}%
{% endif %}

Subtotal: ${{ subtotal }}
Tax: ${{ tax }}
Total: ${{ total }}
```

**Rendering with list data:**

```python
from docxtpl import DocxTemplate


def render_detailed_invoice(template_path: str, output_path: str) -> None:
    """Render an invoice with line items using template loops."""
    tpl = DocxTemplate(template_path)

    context = {
        "invoice_number": "INV-2025-0099",
        "date": "2025-12-20",
        "client_name": "Wayne Enterprises",
        "line_items": [
            {"description": "Consulting (40 hrs)", "qty": 40, "price": "6,000.00"},
            {"description": "Development (80 hrs)", "qty": 80, "price": "16,000.00"},
            {"description": "Server Setup", "qty": 1, "price": "2,500.00"},
        ],
        "discount": 10,
        "subtotal": "24,500.00",
        "tax": "2,205.00",
        "total": "24,255.00",
    }

    tpl.render(context)
    tpl.save(output_path)


render_detailed_invoice("invoice_detail_template.docx", "invoice_detail.docx")
```

### 4.3 Tables in Templates

For tables with dynamic rows, use the `{% tr %}` tag to indicate which table row should be repeated.

**Template table structure:**

| Item | Quantity | Price |
|------|----------|-------|
| `{%tr for item in items %}{{ item.name }}` | `{{ item.qty }}` | `${{ item.price }}{%tr endfor %}` |

```python
from docxtpl import DocxTemplate


def render_table_report(template_path: str, output_path: str) -> None:
    """Render a report with dynamically generated table rows."""
    tpl = DocxTemplate(template_path)

    context = {
        "report_title": "Inventory Status Report",
        "generated_date": "2025-12-20",
        "items": [
            {"name": "Widget A", "qty": 1500, "price": "4.99"},
            {"name": "Widget B", "qty": 800, "price": "9.99"},
            {"name": "Gadget X", "qty": 250, "price": "24.99"},
            {"name": "Gadget Y", "qty": 3200, "price": "2.49"},
        ],
    }

    tpl.render(context)
    tpl.save(output_path)


render_table_report("inventory_template.docx", "inventory_report.docx")
```

### 4.4 Inline Images in Templates

Insert images dynamically using the `InlineImage` helper.

```python
from docxtpl import DocxTemplate, InlineImage
from docx.shared import Mm


def render_with_images(template_path: str, output_path: str) -> None:
    """Render a template that includes dynamic inline images."""
    tpl = DocxTemplate(template_path)

    context = {
        "employee_name": "Jane Doe",
        "title": "Senior Engineer",
        "photo": InlineImage(tpl, "jane_photo.jpg", width=Mm(30)),
        "signature": InlineImage(tpl, "jane_signature.png", width=Mm(50)),
    }

    tpl.render(context)
    tpl.save(output_path)


render_with_images("id_card_template.docx", "id_card_jane.docx")
```

In the template, place `{{ photo }}` and `{{ signature }}` where images should appear.

### 4.5 Mail Merge Automation

Generate many personalized documents from a single template and a data source.

```python
import csv
from pathlib import Path
from docxtpl import DocxTemplate


def batch_mail_merge(template_path: str, csv_path: str,
                     output_dir: str) -> list[str]:
    """Generate personalized documents for each row in a CSV file."""
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        records = list(reader)

    generated_files = []

    for i, record in enumerate(records):
        tpl = DocxTemplate(template_path)
        tpl.render(record)

        filename = f"letter_{i + 1:04d}_{record.get('last_name', 'unknown')}.docx"
        dest = output_path / filename
        tpl.save(str(dest))
        generated_files.append(str(dest))

    print(f"Generated {len(generated_files)} documents in {output_dir}")
    return generated_files


# CSV file (recipients.csv):
# first_name,last_name,company,address,amount_due
# Alice,Smith,Acme Corp,123 Main St,$500
# Bob,Jones,Globex,456 Oak Ave,$750

files = batch_mail_merge(
    "letter_template.docx",
    "recipients.csv",
    "./output_letters",
)
```

---

## 5. Advanced Operations

### 5.1 Find and Replace Text

```python
from docx import Document


def find_and_replace(filepath: str, output_path: str,
                     replacements: dict[str, str]) -> int:
    """Find and replace text across all paragraphs, tables, headers, footers."""
    doc = Document(filepath)
    total_replacements = 0

    def replace_in_paragraph(paragraph, old: str, new: str) -> int:
        count = 0
        if old in paragraph.text:
            # Rebuild paragraph preserving first run's formatting
            full_text = paragraph.text
            new_text = full_text.replace(old, new)
            count = full_text.count(old)

            if paragraph.runs:
                # Clear all runs except first, set new text on first
                first_run = paragraph.runs[0]
                first_run.text = new_text
                for run in paragraph.runs[1:]:
                    run.text = ""

        return count

    # Paragraphs in body
    for para in doc.paragraphs:
        for old, new in replacements.items():
            total_replacements += replace_in_paragraph(para, old, new)

    # Tables
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                for para in cell.paragraphs:
                    for old, new in replacements.items():
                        total_replacements += replace_in_paragraph(para, old, new)

    # Headers and footers
    for section in doc.sections:
        for para in section.header.paragraphs:
            for old, new in replacements.items():
                total_replacements += replace_in_paragraph(para, old, new)
        for para in section.footer.paragraphs:
            for old, new in replacements.items():
                total_replacements += replace_in_paragraph(para, old, new)

    doc.save(output_path)
    print(f"Made {total_replacements} replacements, saved to {output_path}")
    return total_replacements


find_and_replace(
    "contract_draft.docx",
    "contract_final.docx",
    {
        "{{COMPANY_NAME}}": "Acme Corporation",
        "{{DATE}}": "December 20, 2025",
        "{{AMOUNT}}": "$50,000",
    },
)
```

### 5.2 Working with Styles Programmatically

```python
from docx import Document
from docx.shared import Pt, RGBColor
from docx.enum.style import WD_STYLE_TYPE


def list_all_styles(filepath: str) -> list[dict]:
    """List all styles defined in a document."""
    doc = Document(filepath)
    styles_info = []

    for style in doc.styles:
        styles_info.append({
            "name": style.name,
            "type": str(style.type),
            "builtin": style.builtin,
            "base_style": style.base_style.name if style.base_style else None,
        })

    return styles_info


def create_custom_style(doc: Document, style_name: str,
                        font_name: str = "Calibri",
                        font_size: int = 11,
                        color: tuple[int, int, int] = (0, 0, 0),
                        bold: bool = False,
                        italic: bool = False) -> None:
    """Create a custom paragraph style."""
    style = doc.styles.add_style(style_name, WD_STYLE_TYPE.PARAGRAPH)
    style.font.name = font_name
    style.font.size = Pt(font_size)
    style.font.color.rgb = RGBColor(*color)
    style.font.bold = bold
    style.font.italic = italic


doc = Document()

create_custom_style(doc, "CustomTitle", font_name="Georgia",
                    font_size=24, color=(0, 51, 102), bold=True)
create_custom_style(doc, "CustomBody", font_name="Garamond",
                    font_size=12, color=(33, 33, 33))
create_custom_style(doc, "Highlight", font_name="Calibri",
                    font_size=12, color=(204, 0, 0), bold=True, italic=True)

doc.add_paragraph("Custom Styled Document", style="CustomTitle")
doc.add_paragraph(
    "This paragraph uses a custom body style with Garamond font.",
    style="CustomBody",
)
doc.add_paragraph("This text is highlighted in red!", style="Highlight")

doc.save("custom_styled.docx")
```

### 5.3 Handling Legacy .doc Files

The old binary `.doc` format is not supported by `python-docx`. Use LibreOffice to convert it first.

```python
import subprocess
from pathlib import Path


def convert_doc_to_docx(input_path: str, output_dir: str = ".") -> str:
    """Convert a legacy .doc file to .docx using LibreOffice."""
    input_file = Path(input_path)
    if not input_file.exists():
        raise FileNotFoundError(f"File not found: {input_path}")

    if input_file.suffix.lower() != ".doc":
        raise ValueError(f"Expected .doc file, got: {input_file.suffix}")

    result = subprocess.run(
        [
            "libreoffice",
            "--headless",
            "--convert-to", "docx",
            "--outdir", output_dir,
            str(input_file),
        ],
        capture_output=True,
        text=True,
        timeout=60,
    )

    if result.returncode != 0:
        raise RuntimeError(f"Conversion failed: {result.stderr}")

    output_file = Path(output_dir) / f"{input_file.stem}.docx"
    print(f"Converted: {input_path} -> {output_file}")
    return str(output_file)


def batch_convert_doc_files(input_dir: str, output_dir: str) -> list[str]:
    """Convert all .doc files in a directory to .docx."""
    input_path = Path(input_dir)
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    doc_files = list(input_path.glob("*.doc"))
    print(f"Found {len(doc_files)} .doc files to convert")

    converted = []
    for doc_file in doc_files:
        try:
            result = convert_doc_to_docx(str(doc_file), str(output_path))
            converted.append(result)
        except RuntimeError as e:
            print(f"  Failed to convert {doc_file.name}: {e}")

    return converted
```

### 5.4 Document Comparison / Diff

Compare two Word documents paragraph by paragraph to find differences.

```python
import difflib
from dataclasses import dataclass
from docx import Document


@dataclass(frozen=True)
class DocumentDiff:
    added: list[str]
    removed: list[str]
    changed: list[tuple[str, str]]
    unchanged_count: int


def compare_documents(path_a: str, path_b: str) -> DocumentDiff:
    """Compare two Word documents and return the differences."""
    doc_a = Document(path_a)
    doc_b = Document(path_b)

    lines_a = [p.text for p in doc_a.paragraphs if p.text.strip()]
    lines_b = [p.text for p in doc_b.paragraphs if p.text.strip()]

    matcher = difflib.SequenceMatcher(None, lines_a, lines_b)

    added = []
    removed = []
    changed = []
    unchanged_count = 0

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            unchanged_count += i2 - i1
        elif tag == "insert":
            added.extend(lines_b[j1:j2])
        elif tag == "delete":
            removed.extend(lines_a[i1:i2])
        elif tag == "replace":
            for old_line, new_line in zip(lines_a[i1:i2], lines_b[j1:j2]):
                changed.append((old_line, new_line))

    return DocumentDiff(
        added=added,
        removed=removed,
        changed=changed,
        unchanged_count=unchanged_count,
    )


def print_diff(diff: DocumentDiff) -> None:
    """Pretty-print document differences."""
    print(f"Unchanged paragraphs: {diff.unchanged_count}")
    print(f"Added: {len(diff.added)}")
    for line in diff.added:
        print(f"  + {line[:80]}")
    print(f"Removed: {len(diff.removed)}")
    for line in diff.removed:
        print(f"  - {line[:80]}")
    print(f"Changed: {len(diff.changed)}")
    for old, new in diff.changed:
        print(f"  ~ OLD: {old[:60]}")
        print(f"    NEW: {new[:60]}")


diff = compare_documents("draft_v1.docx", "draft_v2.docx")
print_diff(diff)
```

### 5.5 Converting DOCX to PDF

```python
import subprocess
from pathlib import Path


def docx_to_pdf(input_path: str, output_dir: str = ".") -> str:
    """Convert a .docx file to PDF using LibreOffice."""
    input_file = Path(input_path)
    if not input_file.exists():
        raise FileNotFoundError(f"File not found: {input_path}")

    result = subprocess.run(
        [
            "libreoffice",
            "--headless",
            "--convert-to", "pdf",
            "--outdir", output_dir,
            str(input_file),
        ],
        capture_output=True,
        text=True,
        timeout=120,
    )

    if result.returncode != 0:
        raise RuntimeError(f"PDF conversion failed: {result.stderr}")

    output_file = Path(output_dir) / f"{input_file.stem}.pdf"
    print(f"Converted to PDF: {output_file}")
    return str(output_file)
```

---

## 6. Worked Problems

### Problem 1: Resume Generator from JSON Data

**Goal:** Given a JSON file with resume data, generate a professionally formatted Word document.

```python
import json
from docx import Document
from docx.shared import Inches, Pt, RGBColor, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT


RESUME_DATA = {
    "name": "Alice Chen",
    "title": "Senior Software Engineer",
    "email": "alice.chen@example.com",
    "phone": "+1 (555) 123-4567",
    "location": "San Francisco, CA",
    "linkedin": "linkedin.com/in/alicechen",
    "summary": (
        "Results-driven software engineer with 8+ years of experience "
        "building scalable distributed systems. Expert in Python, Go, "
        "and cloud-native architectures. Passionate about mentoring "
        "junior engineers and driving engineering excellence."
    ),
    "experience": [
        {
            "company": "TechCorp Inc.",
            "role": "Senior Software Engineer",
            "dates": "2022 -- Present",
            "bullets": [
                "Architected microservices platform serving 10M daily requests",
                "Reduced API latency by 40% through caching and query optimization",
                "Led team of 5 engineers delivering payment processing system",
                "Established CI/CD pipeline reducing deployment time from 2hrs to 15min",
            ],
        },
        {
            "company": "StartupXYZ",
            "role": "Software Engineer",
            "dates": "2019 -- 2022",
            "bullets": [
                "Built real-time data pipeline processing 500K events/sec",
                "Designed RESTful APIs consumed by 200+ enterprise clients",
                "Implemented automated testing increasing coverage from 30% to 85%",
            ],
        },
        {
            "company": "BigData Solutions",
            "role": "Junior Developer",
            "dates": "2017 -- 2019",
            "bullets": [
                "Developed ETL workflows for financial data processing",
                "Created internal dashboard reducing manual reporting by 20 hrs/week",
            ],
        },
    ],
    "education": [
        {
            "institution": "University of California, Berkeley",
            "degree": "B.S. Computer Science",
            "dates": "2013 -- 2017",
            "gpa": "3.8/4.0",
        },
    ],
    "skills": {
        "Languages": "Python, Go, TypeScript, SQL, Rust",
        "Frameworks": "FastAPI, Django, React, gRPC",
        "Cloud": "AWS (ECS, Lambda, RDS, S3), GCP, Terraform",
        "Data": "PostgreSQL, Redis, Kafka, Elasticsearch",
        "Tools": "Docker, Kubernetes, GitHub Actions, Datadog",
    },
}


def add_section_divider(doc: Document) -> None:
    """Add a thin horizontal line as a section divider."""
    para = doc.add_paragraph()
    para.paragraph_format.space_before = Pt(2)
    para.paragraph_format.space_after = Pt(2)
    # Use a border on the paragraph
    pPr = para._p.get_or_add_pPr()
    from docx.oxml.ns import qn
    from lxml import etree
    pBdr = etree.SubElement(pPr, qn("w:pBdr"))
    bottom = etree.SubElement(pBdr, qn("w:bottom"))
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), "4")
    bottom.set(qn("w:space"), "1")
    bottom.set(qn("w:color"), "999999")


def generate_resume(data: dict, output_path: str) -> None:
    """Generate a professional resume from structured data."""
    doc = Document()

    # Page margins
    for section in doc.sections:
        section.top_margin = Cm(1.5)
        section.bottom_margin = Cm(1.5)
        section.left_margin = Cm(2.0)
        section.right_margin = Cm(2.0)

    # Name
    name_para = doc.add_paragraph()
    name_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
    name_run = name_para.add_run(data["name"])
    name_run.bold = True
    name_run.font.size = Pt(22)
    name_run.font.color.rgb = RGBColor(0x1A, 0x1A, 0x2E)

    # Title
    title_para = doc.add_paragraph()
    title_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title_para.paragraph_format.space_before = Pt(0)
    title_run = title_para.add_run(data["title"])
    title_run.font.size = Pt(13)
    title_run.font.color.rgb = RGBColor(0x55, 0x55, 0x55)

    # Contact info
    contact_parts = [
        data["email"], data["phone"], data["location"], data["linkedin"]
    ]
    contact_para = doc.add_paragraph()
    contact_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
    contact_run = contact_para.add_run(" | ".join(contact_parts))
    contact_run.font.size = Pt(9)
    contact_run.font.color.rgb = RGBColor(0x77, 0x77, 0x77)

    add_section_divider(doc)

    # Summary
    heading = doc.add_heading("PROFESSIONAL SUMMARY", level=2)
    for run in heading.runs:
        run.font.size = Pt(12)
        run.font.color.rgb = RGBColor(0x1A, 0x1A, 0x2E)
    summary_para = doc.add_paragraph(data["summary"])
    summary_para.paragraph_format.space_after = Pt(4)
    for run in summary_para.runs:
        run.font.size = Pt(10)

    add_section_divider(doc)

    # Experience
    heading = doc.add_heading("PROFESSIONAL EXPERIENCE", level=2)
    for run in heading.runs:
        run.font.size = Pt(12)
        run.font.color.rgb = RGBColor(0x1A, 0x1A, 0x2E)

    for job in data["experience"]:
        # Company and dates on one line
        job_para = doc.add_paragraph()
        job_para.paragraph_format.space_before = Pt(6)
        job_para.paragraph_format.space_after = Pt(2)

        company_run = job_para.add_run(job["company"])
        company_run.bold = True
        company_run.font.size = Pt(11)

        dates_run = job_para.add_run(f"  |  {job['dates']}")
        dates_run.font.size = Pt(10)
        dates_run.font.color.rgb = RGBColor(0x77, 0x77, 0x77)

        # Role
        role_para = doc.add_paragraph()
        role_para.paragraph_format.space_before = Pt(0)
        role_para.paragraph_format.space_after = Pt(2)
        role_run = role_para.add_run(job["role"])
        role_run.italic = True
        role_run.font.size = Pt(10)

        # Bullets
        for bullet in job["bullets"]:
            bullet_para = doc.add_paragraph(bullet, style="List Bullet")
            bullet_para.paragraph_format.space_before = Pt(1)
            bullet_para.paragraph_format.space_after = Pt(1)
            for run in bullet_para.runs:
                run.font.size = Pt(10)

    add_section_divider(doc)

    # Education
    heading = doc.add_heading("EDUCATION", level=2)
    for run in heading.runs:
        run.font.size = Pt(12)
        run.font.color.rgb = RGBColor(0x1A, 0x1A, 0x2E)

    for edu in data["education"]:
        edu_para = doc.add_paragraph()
        inst_run = edu_para.add_run(edu["institution"])
        inst_run.bold = True
        inst_run.font.size = Pt(11)
        edu_para.add_run(f"  |  {edu['dates']}").font.size = Pt(10)

        degree_para = doc.add_paragraph()
        degree_para.paragraph_format.space_before = Pt(0)
        degree_run = degree_para.add_run(f"{edu['degree']} -- GPA: {edu['gpa']}")
        degree_run.font.size = Pt(10)
        degree_run.italic = True

    add_section_divider(doc)

    # Skills
    heading = doc.add_heading("TECHNICAL SKILLS", level=2)
    for run in heading.runs:
        run.font.size = Pt(12)
        run.font.color.rgb = RGBColor(0x1A, 0x1A, 0x2E)

    for category, skills in data["skills"].items():
        skill_para = doc.add_paragraph()
        skill_para.paragraph_format.space_before = Pt(2)
        skill_para.paragraph_format.space_after = Pt(2)
        cat_run = skill_para.add_run(f"{category}: ")
        cat_run.bold = True
        cat_run.font.size = Pt(10)
        val_run = skill_para.add_run(skills)
        val_run.font.size = Pt(10)

    doc.save(output_path)
    print(f"Resume saved to {output_path}")


# Generate from embedded data
generate_resume(RESUME_DATA, "alice_chen_resume.docx")

# Generate from JSON file
def generate_resume_from_json(json_path: str, output_path: str) -> None:
    """Load resume data from a JSON file and generate a Word document."""
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    generate_resume(data, output_path)
```

---

### Problem 2: Batch Mail Merge (Generate 100 Personalized Letters)

**Goal:** Read recipient data from a CSV, apply it to a Word template, and generate one document per recipient. Then optionally merge all into a single document.

```python
import csv
import random
import string
from pathlib import Path
from docx import Document
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH


# -- Step 1: Generate sample CSV data --

def generate_sample_csv(output_path: str, count: int = 100) -> None:
    """Generate a sample CSV with recipient data."""
    first_names = [
        "Alice", "Bob", "Carol", "David", "Eve", "Frank", "Grace",
        "Henry", "Iris", "Jack", "Karen", "Leo", "Mia", "Noah",
        "Olivia", "Peter", "Quinn", "Rachel", "Sam", "Tina",
    ]
    last_names = [
        "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia",
        "Miller", "Davis", "Rodriguez", "Martinez", "Hernandez",
        "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas",
    ]
    cities = [
        "New York, NY", "Los Angeles, CA", "Chicago, IL", "Houston, TX",
        "Phoenix, AZ", "San Diego, CA", "Dallas, TX", "Austin, TX",
        "Denver, CO", "Seattle, WA", "Boston, MA", "Portland, OR",
    ]

    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "first_name", "last_name", "company", "address",
            "city", "account_number", "amount_due",
        ])
        writer.writeheader()

        for _ in range(count):
            writer.writerow({
                "first_name": random.choice(first_names),
                "last_name": random.choice(last_names),
                "company": f"{''.join(random.choices(string.ascii_uppercase, k=3))} Corp",
                "address": f"{random.randint(100, 9999)} {random.choice(['Main', 'Oak', 'Elm', 'Pine', 'Cedar'])} St",
                "city": random.choice(cities),
                "account_number": f"ACCT-{random.randint(10000, 99999)}",
                "amount_due": f"{random.randint(100, 10000):.2f}",
            })

    print(f"Generated {count} recipient records in {output_path}")


# -- Step 2: Create a letter for a single recipient --

def create_letter(data: dict, sender_info: dict) -> Document:
    """Create a single personalized letter as a Document object."""
    doc = Document()

    # Margins
    for section in doc.sections:
        section.top_margin = Inches(1.0)
        section.bottom_margin = Inches(1.0)
        section.left_margin = Inches(1.25)
        section.right_margin = Inches(1.25)

    # Sender header
    sender_para = doc.add_paragraph()
    sender_para.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    lines = [
        sender_info["company"],
        sender_info["address"],
        sender_info["city"],
        sender_info["phone"],
    ]
    for line in lines:
        run = sender_para.add_run(line + "\n")
        run.font.size = Pt(10)
        run.font.color.rgb = RGBColor(0x33, 0x33, 0x33)

    # Date
    date_para = doc.add_paragraph()
    date_para.paragraph_format.space_before = Pt(24)
    date_run = date_para.add_run(sender_info["date"])
    date_run.font.size = Pt(11)

    # Recipient address
    recipient_para = doc.add_paragraph()
    recipient_para.paragraph_format.space_before = Pt(12)
    recipient_lines = [
        f"{data['first_name']} {data['last_name']}",
        data["company"],
        data["address"],
        data["city"],
    ]
    for line in recipient_lines:
        run = recipient_para.add_run(line + "\n")
        run.font.size = Pt(11)

    # Greeting
    greeting = doc.add_paragraph()
    greeting.paragraph_format.space_before = Pt(12)
    greeting_run = greeting.add_run(
        f"Dear {data['first_name']} {data['last_name']},"
    )
    greeting_run.font.size = Pt(11)

    # Body
    body_text = (
        f"We are writing to inform you that your account "
        f"({data['account_number']}) has an outstanding balance of "
        f"${data['amount_due']}. Please remit payment at your earliest "
        f"convenience to avoid any service interruptions."
    )
    body_para = doc.add_paragraph()
    body_para.paragraph_format.space_before = Pt(12)
    body_run = body_para.add_run(body_text)
    body_run.font.size = Pt(11)

    body2_text = (
        "If you have already submitted payment, please disregard this "
        "notice. For questions about your account, contact our billing "
        "department at billing@acmecorp.com or call (555) 000-1234."
    )
    body2_para = doc.add_paragraph()
    body2_run = body2_para.add_run(body2_text)
    body2_run.font.size = Pt(11)

    # Closing
    closing = doc.add_paragraph()
    closing.paragraph_format.space_before = Pt(24)
    closing_run = closing.add_run("Sincerely,")
    closing_run.font.size = Pt(11)

    sig = doc.add_paragraph()
    sig.paragraph_format.space_before = Pt(36)
    sig_run = sig.add_run(sender_info["sender_name"])
    sig_run.font.size = Pt(11)
    sig_run.bold = True

    title_para = doc.add_paragraph()
    title_para.paragraph_format.space_before = Pt(0)
    title_run = title_para.add_run(sender_info["sender_title"])
    title_run.font.size = Pt(10)
    title_run.font.color.rgb = RGBColor(0x66, 0x66, 0x66)

    return doc


# -- Step 3: Batch generation --

def batch_generate_letters(csv_path: str, output_dir: str) -> list[str]:
    """Generate one letter per CSV row."""
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    sender_info = {
        "company": "Acme Corporation",
        "address": "100 Innovation Drive",
        "city": "San Francisco, CA 94105",
        "phone": "(555) 000-1234",
        "date": "December 20, 2025",
        "sender_name": "Margaret Reynolds",
        "sender_title": "Director of Accounts Receivable",
    }

    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        records = list(reader)

    generated = []

    for i, record in enumerate(records):
        doc = create_letter(record, sender_info)
        filename = f"letter_{i + 1:04d}_{record['last_name']}.docx"
        filepath = output_path / filename
        doc.save(str(filepath))
        generated.append(str(filepath))

        if (i + 1) % 25 == 0:
            print(f"  Generated {i + 1}/{len(records)} letters...")

    print(f"Batch complete: {len(generated)} letters in {output_dir}")
    return generated


# -- Step 4: Merge all letters into a single document --

def merge_documents(file_paths: list[str], output_path: str) -> None:
    """Merge multiple .docx files into a single document with page breaks."""
    if not file_paths:
        raise ValueError("No files to merge")

    merged = Document(file_paths[0])

    for filepath in file_paths[1:]:
        # Add page break before each subsequent letter
        merged.add_page_break()

        doc = Document(filepath)
        for element in doc.element.body:
            merged.element.body.append(element)

    merged.save(output_path)
    print(f"Merged {len(file_paths)} documents into {output_path}")


# -- Run the full pipeline --

def run_mail_merge_pipeline() -> None:
    """Execute the complete mail merge pipeline."""
    csv_file = "recipients.csv"
    output_dir = "./generated_letters"
    merged_file = "all_letters_merged.docx"

    # Generate sample data
    generate_sample_csv(csv_file, count=100)

    # Generate individual letters
    files = batch_generate_letters(csv_file, output_dir)

    # Merge into single document
    merge_documents(files, merged_file)

    print("\nPipeline complete!")
    print(f"  Individual letters: {output_dir}/")
    print(f"  Merged document:    {merged_file}")


if __name__ == "__main__":
    run_mail_merge_pipeline()
```

---

## Appendix: Word Document Processing Cheat Sheet

### Installation

```bash
pip install python-docx          # Core read/write library
pip install docxtpl              # Jinja2 template engine for .docx
pip install lxml                 # XML processing (dependency of python-docx)
```

### Quick Reference -- python-docx

```python
from docx import Document
from docx.shared import Inches, Pt, Cm, RGBColor, Emu
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.section import WD_ORIENT
from docx.enum.style import WD_STYLE_TYPE

# --- Open / Create ---
doc = Document()                         # New blank document
doc = Document("existing.docx")          # Open existing

# --- Paragraphs ---
doc.add_paragraph("Text")               # Normal paragraph
doc.add_paragraph("Item", "List Bullet") # Styled paragraph
doc.add_heading("Title", level=1)        # Heading (0=Title, 1-9=Heading)

para = doc.add_paragraph()
run = para.add_run("bold text")
run.bold = True
run.italic = True
run.underline = True
run.font.size = Pt(14)
run.font.name = "Arial"
run.font.color.rgb = RGBColor(0xFF, 0x00, 0x00)

para.alignment = WD_ALIGN_PARAGRAPH.CENTER  # LEFT, RIGHT, JUSTIFY

# --- Tables ---
table = doc.add_table(rows=3, cols=4)
table.style = "Light Grid Accent 1"
cell = table.cell(0, 0)                 # Access by row, col
cell.text = "Value"
row = table.add_row()                   # Add row dynamically
table.rows[0].cells[0].text = "Header"

# --- Images ---
doc.add_picture("photo.png", width=Inches(3))
run.add_picture("inline.png", width=Cm(5))

# --- Page Layout ---
section = doc.sections[0]
section.page_width = Inches(11)
section.page_height = Inches(8.5)
section.orientation = WD_ORIENT.LANDSCAPE
section.top_margin = Inches(0.75)
section.left_margin = Cm(2)

# --- Headers / Footers ---
header = section.header
header.paragraphs[0].text = "Header Text"
footer = section.footer
footer.paragraphs[0].text = "Footer Text"

# --- Styles ---
style = doc.styles.add_style("MyStyle", WD_STYLE_TYPE.PARAGRAPH)
style.font.name = "Calibri"
style.font.size = Pt(12)

# --- Read Content ---
for para in doc.paragraphs:
    print(para.style.name, para.text)

for table in doc.tables:
    for row in table.rows:
        for cell in row.cells:
            print(cell.text)

# --- Save ---
doc.save("output.docx")
```

### Quick Reference -- docxtpl

```python
from docxtpl import DocxTemplate, InlineImage
from docx.shared import Mm

tpl = DocxTemplate("template.docx")

# Simple render
tpl.render({"name": "Alice", "date": "2025-12-20"})
tpl.save("output.docx")

# With inline image
context = {
    "photo": InlineImage(tpl, "photo.jpg", width=Mm(30)),
}
tpl.render(context)
tpl.save("output.docx")
```

### Template Syntax (in the .docx template file)

```
{{ variable }}                    Plain variable
{{ item.property }}               Dot notation
{% for x in items %}...{% endfor %}  Loop
{% if condition %}...{% endif %}      Conditional
{%tr for x in items %}            Table row loop (use inside table)
{{ x | upper }}                   Jinja2 filter
```

### Common Unit Conversions

| Unit | Constructor | 1 inch = |
|------|-------------|----------|
| Inches | `Inches(1)` | 914400 EMU |
| Points | `Pt(72)` | 1 inch |
| Centimeters | `Cm(2.54)` | 1 inch |
| Millimeters | `Mm(25.4)` | 1 inch |
| EMU | `Emu(914400)` | 1 inch |

### Legacy .doc Conversion

```bash
# Single file
libreoffice --headless --convert-to docx input.doc

# Batch convert
libreoffice --headless --convert-to docx --outdir ./output/ *.doc

# Convert to PDF
libreoffice --headless --convert-to pdf document.docx
```

### Inspecting DOCX Internals

```bash
# List contents
unzip -l document.docx

# Extract specific file
unzip -p document.docx word/document.xml | xmllint --format -

# Extract all
unzip document.docx -d extracted/
```

### Common Pitfalls

| Pitfall | Solution |
|---------|----------|
| `python-docx` cannot read `.doc` files | Convert to `.docx` with LibreOffice first |
| Find-and-replace breaks formatting | Replace within runs, not raw XML |
| Images extracted without filenames | Map relationship IDs to media files |
| Template `{%tr%}` not working | Must be inside a table cell, not a paragraph |
| `add_picture` fails with URL | Download the image to a file or BytesIO first |
| Merged cells in tables | Use `cell.merge(other_cell)` carefully |
| Paragraph text splits across runs | Use `paragraph.text` for full text, iterate `runs` for formatting |
| Header/footer not appearing | Set `is_linked_to_previous = False` on the section |
