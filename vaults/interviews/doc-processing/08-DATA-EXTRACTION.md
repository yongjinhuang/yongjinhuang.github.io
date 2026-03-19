# Chapter 8: Data Extraction

## Introduction

Extracting structured data from unstructured documents is the core challenge of document processing. A PDF invoice contains an invoice number, date, line items, and total — but they exist as positioned text, not as labeled fields. This chapter covers the techniques for pulling structured data out of messy documents: regex patterns, table extraction, named entity recognition, and key-value pair extraction.

```
+------------------------------------------------------------------------+
|                    DATA EXTRACTION TECHNIQUES                           |
+------------------------------------------------------------------------+
|                                                                        |
|  PATTERN-BASED                   POSITION-BASED                        |
|  +------------------------+     +---------------------------+          |
|  | Regular expressions     |     | PDF coordinate extraction  |          |
|  |   Dates, emails, phones|     | Bounding box analysis      |          |
|  |   Invoice numbers      |     | Zone-based extraction      |          |
|  |   Currency amounts     |     | Template matching          |          |
|  | Rule-based parsers     |     | Table grid detection       |          |
|  +------------------------+     +---------------------------+          |
|                                                                        |
|  NLP-BASED                       AI-BASED                              |
|  +------------------------+     +---------------------------+          |
|  | Named Entity Recognition|     | LLM extraction (GPT/Claude)|          |
|  |   spaCy, NLTK          |     | Document AI services       |          |
|  | Keyword proximity      |     | Fine-tuned models          |          |
|  | Sentence segmentation  |     | Vision models on images    |          |
|  +------------------------+     +---------------------------+          |
|                                                                        |
+------------------------------------------------------------------------+
```

---

## 1. Regular Expressions for Document Data

### 1.1 Common Patterns

```python
import re

# Date patterns
DATE_PATTERNS = [
    r"\d{4}-\d{2}-\d{2}",                        # 2024-01-15
    r"\d{1,2}/\d{1,2}/\d{2,4}",                  # 1/15/2024 or 01/15/24
    r"\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}",  # 15 January 2024
    r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}",  # January 15, 2024
]

# Money patterns
MONEY_PATTERNS = [
    r"\$[\d,]+\.?\d*",                            # $1,234.56
    r"USD\s*[\d,]+\.?\d*",                        # USD 1234.56
    r"[\d,]+\.?\d*\s*(?:USD|EUR|GBP)",            # 1234.56 USD
    r"€[\d,]+\.?\d*",                             # €1,234.56
    r"£[\d,]+\.?\d*",                             # £1,234.56
]

# Contact patterns
EMAIL_PATTERN = r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"
PHONE_PATTERNS = [
    r"\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}",  # US: (555) 123-4567
    r"\+\d{1,3}[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}",  # International
]
URL_PATTERN = r"https?://[^\s<>\"']+|www\.[^\s<>\"']+"

def extract_all_patterns(text: str) -> dict:
    """Extract common data patterns from text."""
    results = {
        "dates": [],
        "money": [],
        "emails": re.findall(EMAIL_PATTERN, text),
        "phones": [],
        "urls": re.findall(URL_PATTERN, text),
    }

    for pattern in DATE_PATTERNS:
        results["dates"].extend(re.findall(pattern, text, re.IGNORECASE))

    for pattern in MONEY_PATTERNS:
        results["money"].extend(re.findall(pattern, text))

    for pattern in PHONE_PATTERNS:
        results["phones"].extend(re.findall(pattern, text))

    return results
```

### 1.2 Invoice-Specific Extraction

```python
import re

def extract_invoice_fields(text: str) -> dict:
    """Extract standard invoice fields from text."""
    fields = {}

    # Invoice number
    inv_match = re.search(
        r"(?:Invoice|Inv|Invoice\s*#|Inv\s*#|Invoice\s*No\.?)\s*:?\s*([A-Z0-9-]+)",
        text, re.IGNORECASE
    )
    if inv_match:
        fields["invoice_number"] = inv_match.group(1)

    # PO number
    po_match = re.search(
        r"(?:PO|P\.O\.|Purchase\s*Order)\s*(?:#|No\.?|Number)?\s*:?\s*([A-Z0-9-]+)",
        text, re.IGNORECASE
    )
    if po_match:
        fields["po_number"] = po_match.group(1)

    # Due date
    due_match = re.search(
        r"(?:Due\s*Date|Payment\s*Due|Due)\s*:?\s*(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\w+\s+\d{1,2},?\s+\d{4})",
        text, re.IGNORECASE
    )
    if due_match:
        fields["due_date"] = due_match.group(1)

    # Total amount
    total_match = re.search(
        r"(?:Total|Amount\s*Due|Balance\s*Due|Grand\s*Total)\s*:?\s*\$?([\d,]+\.?\d*)",
        text, re.IGNORECASE
    )
    if total_match:
        fields["total"] = total_match.group(1)

    # Tax
    tax_match = re.search(
        r"(?:Tax|Sales\s*Tax|VAT|GST)\s*:?\s*\$?([\d,]+\.?\d*)",
        text, re.IGNORECASE
    )
    if tax_match:
        fields["tax"] = tax_match.group(1)

    return fields
```

---

## 2. Address Parsing

### 2.1 US Address Extraction

```python
import re

def extract_us_address(text: str) -> list[dict]:
    """Extract US addresses from text."""
    # Pattern: street, city, state ZIP
    pattern = r"""
        (\d+\s+[\w\s]+(?:St|Street|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Rd|Road|Ln|Lane|Way|Ct|Court|Pl|Place)\.?)
        [,\s]+
        ([\w\s]+?)
        [,\s]+
        ([A-Z]{2})
        \s+
        (\d{5}(?:-\d{4})?)
    """

    matches = re.findall(pattern, text, re.VERBOSE | re.IGNORECASE)
    addresses = []
    for street, city, state, zipcode in matches:
        addresses.append({
            "street": street.strip(),
            "city": city.strip(),
            "state": state.upper(),
            "zip": zipcode,
        })
    return addresses
```

---

## 3. Table Extraction Strategies

### 3.1 From PDFs (pdfplumber)

```python
import pdfplumber
import pandas as pd

def extract_and_clean_tables(pdf_path: str) -> list[pd.DataFrame]:
    """Extract tables from PDF and clean them."""
    tables = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            raw_tables = page.extract_tables()
            for raw in raw_tables:
                if not raw or len(raw) < 2:
                    continue

                # Clean: remove None, strip whitespace
                cleaned = []
                for row in raw:
                    cleaned_row = [
                        cell.strip() if cell else ""
                        for cell in row
                    ]
                    cleaned.append(cleaned_row)

                # First row as headers
                df = pd.DataFrame(cleaned[1:], columns=cleaned[0])

                # Remove empty rows
                df = df.replace("", pd.NA).dropna(how="all")

                tables.append(df)
    return tables
```

### 3.2 From HTML (BeautifulSoup + pandas)

```python
import pandas as pd
from bs4 import BeautifulSoup

def extract_html_tables(html_content: str) -> list[pd.DataFrame]:
    """Extract all tables from HTML content."""
    # pandas can read HTML tables directly
    dfs = pd.read_html(html_content)
    return dfs

def extract_html_tables_custom(html_content: str) -> list[list[list[str]]]:
    """Extract tables from HTML with more control."""
    soup = BeautifulSoup(html_content, "html.parser")
    tables = []

    for table in soup.find_all("table"):
        rows = []
        for tr in table.find_all("tr"):
            cells = []
            for td in tr.find_all(["td", "th"]):
                cells.append(td.get_text(strip=True))
            if cells:
                rows.append(cells)
        if rows:
            tables.append(rows)
    return tables
```

---

## 4. Named Entity Recognition (NER)

### 4.1 spaCy for Document NER

```python
import spacy

# python -m spacy download en_core_web_sm
nlp = spacy.load("en_core_web_sm")

def extract_entities(text: str) -> dict:
    """Extract named entities using spaCy."""
    doc = nlp(text)
    entities = {}
    for ent in doc.ents:
        label = ent.label_
        if label not in entities:
            entities[label] = []
        entities[label].append(ent.text)
    return entities

# Usage
text = """
Apple Inc. reported revenue of $394.3 billion for fiscal year 2022.
CEO Tim Cook announced the results on January 26, 2023, from
their headquarters in Cupertino, California.
"""

entities = extract_entities(text)
# {
#   'ORG': ['Apple Inc.'],
#   'MONEY': ['$394.3 billion'],
#   'DATE': ['fiscal year 2022', 'January 26, 2023'],
#   'PERSON': ['Tim Cook'],
#   'GPE': ['Cupertino', 'California'],
# }
```

### 4.2 Custom Entity Patterns

```python
import spacy
from spacy.matcher import Matcher

nlp = spacy.load("en_core_web_sm")

def extract_invoice_entities(text: str) -> dict:
    """Extract invoice-specific entities using pattern matching."""
    matcher = Matcher(nlp.vocab)

    # Pattern: Invoice + # + number
    invoice_pattern = [
        {"LOWER": {"IN": ["invoice", "inv"]}},
        {"IS_PUNCT": True, "OP": "?"},
        {"LIKE_NUM": True},
    ]
    matcher.add("INVOICE_NUM", [invoice_pattern])

    doc = nlp(text)
    matches = matcher(doc)

    results = {"invoice_numbers": []}
    for match_id, start, end in matches:
        span = doc[start:end]
        results["invoice_numbers"].append(span.text)

    # Also get standard NER entities
    for ent in doc.ents:
        key = ent.label_.lower() + "s"
        if key not in results:
            results[key] = []
        results[key].append(ent.text)

    return results
```

---

## 5. Key-Value Pair Extraction

### 5.1 Label-Value Patterns

```python
import re

def extract_key_value_pairs(text: str) -> dict:
    """Extract key-value pairs from text with common separators."""
    pairs = {}

    # Pattern: "Key: Value" or "Key - Value"
    lines = text.split("\n")
    for line in lines:
        line = line.strip()
        if not line:
            continue

        # Try colon separator
        match = re.match(r"^([A-Za-z\s]+?)\s*:\s*(.+)$", line)
        if match:
            key = match.group(1).strip()
            value = match.group(2).strip()
            if len(key) < 40:  # Avoid matching prose sentences
                pairs[key] = value
                continue

        # Try tab separator
        parts = line.split("\t")
        if len(parts) == 2:
            pairs[parts[0].strip()] = parts[1].strip()

    return pairs

# Usage
text = """
Invoice Number: INV-2024-001
Date: January 15, 2024
Customer: Acme Corporation
Amount Due: $1,234.56
Payment Terms: Net 30
"""

kv = extract_key_value_pairs(text)
# {'Invoice Number': 'INV-2024-001', 'Date': 'January 15, 2024', ...}
```

### 5.2 Proximity-Based Extraction

```python
def extract_by_proximity(text: str, label: str, window: int = 50) -> str:
    """Find a value near a label in text."""
    pattern = re.escape(label) + r"\s*:?\s*(.{1," + str(window) + r"}?)(?:\n|$)"
    match = re.search(pattern, text, re.IGNORECASE)
    if match:
        return match.group(1).strip()
    return None

# Usage
text = "The total amount due is $5,432.10. Please pay by March 15."
total = extract_by_proximity(text, "total amount due")
# "$5,432.10. Please pay by March 15."
# -> further clean with money regex
```

---

## 6. Building Extraction Pipelines

### 6.1 Multi-Stage Pipeline

```python
import fitz
import pdfplumber
import re
import json

class DocumentExtractor:
    """Multi-stage document data extraction pipeline."""

    def __init__(self):
        self.extractors = []

    def add_extractor(self, name: str, func):
        self.extractors.append((name, func))
        return self

    def extract(self, pdf_path: str) -> dict:
        # Stage 1: Get raw text
        doc = fitz.open(pdf_path)
        full_text = "\n".join(page.get_text() for page in doc)
        doc.close()

        # Stage 2: Get tables
        tables = []
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                tables.extend(page.extract_tables())

        # Stage 3: Run all extractors
        result = {"raw_text_length": len(full_text), "table_count": len(tables)}
        context = {"text": full_text, "tables": tables}

        for name, func in self.extractors:
            try:
                result[name] = func(context)
            except Exception as e:
                result[name] = {"error": str(e)}

        return result

# Build a pipeline
pipeline = DocumentExtractor()

pipeline.add_extractor("invoice_fields", lambda ctx: {
    "number": re.search(r"Invoice\s*#?\s*(\w+)", ctx["text"], re.I),
    "total": re.search(r"Total:?\s*\$?([\d,.]+)", ctx["text"], re.I),
})

pipeline.add_extractor("line_items", lambda ctx: [
    row for table in ctx["tables"]
    for row in table[1:]
    if row and len(row) >= 2
])

# Usage
result = pipeline.extract("invoice.pdf")
print(json.dumps(result, indent=2, default=str))
```

---

## 7. Worked Problems

### Problem 1: Receipt Parser

```python
import re

def parse_receipt(text: str) -> dict:
    """Parse a store receipt into structured data."""
    receipt = {
        "store": None,
        "date": None,
        "items": [],
        "subtotal": None,
        "tax": None,
        "total": None,
        "payment_method": None,
    }

    lines = text.strip().split("\n")

    # Store name is usually the first non-empty line
    for line in lines:
        line = line.strip()
        if line and not re.match(r"^[-=*]+$", line):
            receipt["store"] = line
            break

    # Date
    for pattern in [r"\d{1,2}/\d{1,2}/\d{2,4}", r"\d{4}-\d{2}-\d{2}"]:
        match = re.search(pattern, text)
        if match:
            receipt["date"] = match.group()
            break

    # Line items: look for "item name    $price" patterns
    item_pattern = r"^(.+?)\s{2,}\$?([\d,]+\.\d{2})\s*$"
    for line in lines:
        match = re.match(item_pattern, line.strip())
        if match:
            name = match.group(1).strip()
            price = match.group(2)
            # Skip subtotal/tax/total lines
            if not re.match(r"(?:sub)?total|tax|discount", name, re.I):
                receipt["items"].append({"name": name, "price": price})

    # Totals
    subtotal = re.search(r"Subtotal\s*:?\s*\$?([\d,]+\.\d{2})", text, re.I)
    tax = re.search(r"Tax\s*:?\s*\$?([\d,]+\.\d{2})", text, re.I)
    total = re.search(r"Total\s*:?\s*\$?([\d,]+\.\d{2})", text, re.I)

    if subtotal:
        receipt["subtotal"] = subtotal.group(1)
    if tax:
        receipt["tax"] = tax.group(1)
    if total:
        receipt["total"] = total.group(1)

    # Payment method
    pay = re.search(r"(VISA|MASTERCARD|AMEX|CASH|DEBIT|CREDIT)\s*(?:x+\d{4})?", text, re.I)
    if pay:
        receipt["payment_method"] = pay.group(0).strip()

    return receipt

# Usage
sample_receipt = """
WHOLE FOODS MARKET
123 Main Street, San Francisco, CA
01/15/2024  3:42 PM

Organic Bananas          $1.99
Almond Milk              $4.49
Sourdough Bread          $5.99
Avocado (2)              $3.98

Subtotal:               $16.45
Tax:                     $1.32
Total:                  $17.77

VISA x4521
"""

parsed = parse_receipt(sample_receipt)
print(json.dumps(parsed, indent=2))
```

### Problem 2: Multi-Format Data Extractor

```python
import fitz
import json
import re
from pathlib import Path

def extract_from_any(filepath: str) -> dict:
    """Extract key data from any supported document format."""
    path = Path(filepath)
    ext = path.suffix.lower()
    text = ""

    if ext == ".pdf":
        doc = fitz.open(filepath)
        text = "\n".join(page.get_text() for page in doc)
        doc.close()
    elif ext == ".txt":
        with open(filepath, encoding="utf-8") as f:
            text = f.read()
    elif ext == ".json":
        with open(filepath) as f:
            return {"format": "json", "data": json.load(f)}
    elif ext in (".docx",):
        from docx import Document
        doc = Document(filepath)
        text = "\n".join(p.text for p in doc.paragraphs)
    else:
        raise ValueError(f"Unsupported format: {ext}")

    # Extract common fields
    return {
        "format": ext,
        "char_count": len(text),
        "dates": re.findall(r"\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}/\d{2,4}", text),
        "emails": re.findall(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", text),
        "money": re.findall(r"\$[\d,]+\.?\d*", text),
        "phones": re.findall(r"\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}", text),
    }
```

---

## Appendix: Data Extraction Cheat Sheet

```
DATA EXTRACTION CHEAT SHEET

Regex Patterns:
  Date:    \d{4}-\d{2}-\d{2}  or  \d{1,2}/\d{1,2}/\d{2,4}
  Money:   \$[\d,]+\.?\d*
  Email:   [a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}
  Phone:   \+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}
  URL:     https?://[^\s<>"']+

Table Extraction:
  PDF:   pdfplumber.open(path) -> page.extract_tables()
  HTML:  pd.read_html(html) or BeautifulSoup find_all("table")
  Excel: openpyxl or pandas.read_excel()

NER (Named Entity Recognition):
  spaCy:  nlp(text).ents -> PERSON, ORG, DATE, MONEY, GPE
  Custom: spacy.matcher.Matcher for domain-specific patterns

Key-Value Extraction:
  Colon:     re.match(r"^(Key)\s*:\s*(.+)$", line)
  Proximity: Search near known labels
  Zone:      Use PDF coordinates for known document layouts

Pipeline Pattern:
  1. Extract raw text (PyMuPDF for speed)
  2. Extract tables (pdfplumber)
  3. Run regex extractors
  4. Run NER
  5. Validate and structure results
  6. Output as JSON

Libraries:
  re (stdlib):   Regex patterns
  spacy:         NER and NLP
  pdfplumber:    PDF table extraction
  pandas:        HTML table extraction, data cleaning
  dateutil:      Flexible date parsing
```
