# Chapter 5: Plain Text and Markup

Processing text and markup is the bread and butter of data engineering. Whether you
are scraping web pages, reading configuration files, parsing API responses, or
normalising free-form user input, you need a reliable mental model of the formats
you will encounter and the Python libraries that handle them. This chapter walks
through every major format -- plain text, Markdown, HTML, XML, JSON, YAML, TOML --
and closes with Jinja2 templating so you can _generate_ documents as fluently as
you parse them.

```
 ============================================================================
 |                    TEXT & MARKUP LANDSCAPE                                |
 ============================================================================
 |                                                                          |
 |   UNSTRUCTURED            SEMI-STRUCTURED          STRUCTURED            |
 |  +--------------+       +-----------------+      +----------------+      |
 |  | Plain Text   |       | Markdown        |      | JSON  / JSONL  |      |
 |  | (.txt, .log) |       | (.md)           |      | (.json/.jsonl) |      |
 |  +--------------+       +-----------------+      +----------------+      |
 |         |                       |                        |               |
 |         v                       v                        v               |
 |  +-------------+        +-------------+          +--------------+        |
 |  | regex       |        | mistune     |          | json / orjson|        |
 |  | chardet     |        | markdown-it |          | jsonschema   |        |
 |  | unicodedata |        | commonmark  |          +--------------+        |
 |  +-------------+        +-------------+                                  |
 |                                                                          |
 |   MARKUP (TAGS)           MARKUP (TAGS)          CONFIG FORMATS          |
 |  +--------------+       +-----------------+      +----------------+      |
 |  | HTML         |       | XML / XSLT      |      | YAML (.yaml)  |      |
 |  | (.html)      |       | (.xml, .xsd)    |      | TOML (.toml)  |      |
 |  +--------------+       +-----------------+      +----------------+      |
 |         |                       |                        |               |
 |         v                       v                        v               |
 |  +-------------+        +-------------+          +--------------+        |
 |  | bs4         |        | ElementTree |          | PyYAML       |        |
 |  | lxml.html   |        | lxml.etree  |          | tomli/tomllib|        |
 |  | bleach       |       | xmltodict   |          | ruamel.yaml  |        |
 |  +-------------+        +-------------+          +--------------+        |
 |                                                                          |
 |   TEMPLATING                                                             |
 |  +--------------+                                                        |
 |  | Jinja2       |  <---  Generates any of the above formats              |
 |  +--------------+                                                        |
 ============================================================================
```

---

## 1. Plain Text Processing

### 1.1 Reading and Writing with Encoding Detection

Files on disk are bytes. Interpreting those bytes as text requires knowing the
encoding. UTF-8 dominates, but legacy data still arrives in Latin-1, Shift-JIS,
or Windows-1252.

```python
# --- Basic read / write with explicit encoding ---
from pathlib import Path

path = Path("/data/report.txt")

# Write
path.write_text("Hello, world!\n", encoding="utf-8")

# Read
text = path.read_text(encoding="utf-8")
```

When the encoding is unknown, use **chardet** or **charset-normalizer** to guess:

```python
import chardet

raw = Path("/data/mystery.txt").read_bytes()
detection = chardet.detect(raw)
# {'encoding': 'ISO-8859-1', 'confidence': 0.73, 'language': ''}

text = raw.decode(detection["encoding"])
```

For production pipelines prefer **charset-normalizer** (the default in `requests`
since v2.28):

```python
from charset_normalizer import from_bytes

results = from_bytes(raw)
best = results.best()
text = str(best)           # decoded text
encoding = best.encoding   # e.g. "utf-8"
```

### 1.2 Line-by-Line Processing

Streaming line-by-line is essential for files that do not fit in memory.

```python
def count_lines(path: str) -> int:
    """Count non-empty lines without loading the whole file."""
    total = 0
    with open(path, encoding="utf-8") as fh:
        for line in fh:           # lazy iterator -- one line at a time
            if line.strip():
                total += 1
    return total
```

Common gotcha: **universal newlines**. Python's text mode translates `\r\n`,
`\r`, and `\n` into `\n`. If you need the raw bytes, open in binary mode.

```python
# Strip trailing whitespace from every line (in-place rewrite)
from pathlib import Path

def strip_trailing(path: str) -> None:
    p = Path(path)
    lines = p.read_text(encoding="utf-8").splitlines()
    cleaned = [line.rstrip() for line in lines]
    p.write_text("\n".join(cleaned) + "\n", encoding="utf-8")
```

### 1.3 Regex for Text Extraction

Regular expressions are the Swiss-army knife of text extraction. Learn these
patterns cold for interviews.

```python
import re

text = """
Contact: alice@example.com or bob@corp.co.uk
Call us: (555) 123-4567 or +1-800-555-0199
Visit https://docs.example.com/guide?page=2#section
Dates: 2024-03-15, 03/15/2024, March 15 2024
"""

# --- Email ---
EMAIL_RE = re.compile(
    r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"
)
emails = EMAIL_RE.findall(text)
# ['alice@example.com', 'bob@corp.co.uk']

# --- Phone (US-style) ---
PHONE_RE = re.compile(
    r"[\+]?[\d\-\(\)\s]{7,15}"
)
phones = [p.strip() for p in PHONE_RE.findall(text)]
# ['(555) 123-4567', '+1-800-555-0199']

# --- URL ---
URL_RE = re.compile(
    r"https?://[^\s,\)]+"
)
urls = URL_RE.findall(text)
# ['https://docs.example.com/guide?page=2#section']

# --- ISO date (YYYY-MM-DD) ---
ISO_DATE_RE = re.compile(
    r"\b\d{4}-\d{2}-\d{2}\b"
)
dates = ISO_DATE_RE.findall(text)
# ['2024-03-15']

# --- US date (MM/DD/YYYY) ---
US_DATE_RE = re.compile(
    r"\b\d{2}/\d{2}/\d{4}\b"
)
us_dates = US_DATE_RE.findall(text)
# ['03/15/2024']
```

**Named groups** make extraction self-documenting:

```python
LOG_RE = re.compile(
    r"(?P<timestamp>\d{4}-\d{2}-\d{2}T[\d:]+)\s+"
    r"(?P<level>INFO|WARN|ERROR)\s+"
    r"(?P<message>.*)"
)

line = "2024-03-15T10:42:07 ERROR Connection refused"
m = LOG_RE.match(line)
if m:
    record = m.groupdict()
    # {'timestamp': '2024-03-15T10:42:07', 'level': 'ERROR',
    #  'message': 'Connection refused'}
```

### 1.4 Text Normalisation (Unicode, Whitespace)

Unicode normalisation prevents subtle bugs where visually identical strings
compare as unequal.

```python
import unicodedata

# NFC: canonical composition   (e + combining accent -> single char)
# NFD: canonical decomposition (single char -> e + combining accent)
# NFKC / NFKD: compatibility variants (e.g. full-width -> ASCII)

s1 = "\u00e9"          # e-acute as single codepoint
s2 = "e\u0301"         # e + combining acute accent

s1 == s2                # False!
unicodedata.normalize("NFC", s1) == unicodedata.normalize("NFC", s2)  # True
```

Whitespace normalisation:

```python
def normalise_whitespace(text: str) -> str:
    """Collapse runs of whitespace into a single space and strip."""
    return re.sub(r"\s+", " ", text).strip()

normalise_whitespace("  hello   world\n\t!")
# 'hello world !'
```

Removing accents for search indexing:

```python
def remove_accents(text: str) -> str:
    nfkd = unicodedata.normalize("NFKD", text)
    return "".join(ch for ch in nfkd if not unicodedata.combining(ch))

remove_accents("cafe\u0301 resume\u0301")
# 'cafe resume'
```

---

## 2. Markdown Processing

### 2.1 Parsing with mistune

**mistune** is a fast, pure-Python Markdown parser.

```python
import mistune

md = mistune.create_markdown()
html = md("# Hello\n\nA paragraph with **bold** text.")
# '<h1>Hello</h1>\n<p>A paragraph with <strong>bold</strong> text.</p>\n'
```

### 2.2 Converting Markdown to HTML

For CommonMark-compliant parsing, **markdown-it-py** is excellent:

```python
from markdown_it import MarkdownIt

md = MarkdownIt()
tokens = md.parse("## Section\n\n- item 1\n- item 2\n")
html = md.render("## Section\n\n- item 1\n- item 2\n")
# '<h2>Section</h2>\n<ul>\n<li>item 1</li>\n<li>item 2</li>\n</ul>\n'
```

### 2.3 Extracting Structure (Headings, Links, Code Blocks)

The token stream gives you AST-level access:

````python
from markdown_it import MarkdownIt

source = """
# Title

Some text with a [link](https://example.com).

## Subtitle

```python
print("hello")
````

Another [reference](https://docs.python.org).
"""

md = MarkdownIt()
tokens = md.parse(source)

# Extract headings

headings = []
for i, tok in enumerate(tokens):
if tok.type == "heading_open":
level = int(tok.tag[1]) # "h1" -> 1
content = tokens[i + 1].content # inline token follows
headings.append({"level": level, "text": content})

# headings = [{'level': 1, 'text': 'Title'}, {'level': 2, 'text': 'Subtitle'}]

# Extract links (from inline tokens)

import re
LINK_RE = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")
links = LINK_RE.findall(source)

# [('link', 'https://example.com'), ('reference', 'https://docs.python.org')]

# Extract fenced code blocks

code_blocks = [
{"lang": tok.info, "code": tok.content}
for tok in tokens
if tok.type == "fence"
]

````

### 2.4 Generating Markdown Programmatically

No library needed -- string formatting works perfectly:

```python
def generate_table(headers: list[str], rows: list[list[str]]) -> str:
    """Generate a Markdown table."""
    header_line = "| " + " | ".join(headers) + " |"
    sep_line = "| " + " | ".join("---" for _ in headers) + " |"
    body_lines = [
        "| " + " | ".join(row) + " |"
        for row in rows
    ]
    return "\n".join([header_line, sep_line, *body_lines])

print(generate_table(
    ["Name", "Role"],
    [["Alice", "Engineer"], ["Bob", "Designer"]],
))
# | Name | Role |
# | --- | --- |
# | Alice | Engineer |
# | Bob | Designer |
````

---

## 3. HTML Processing

### 3.1 BeautifulSoup4 Basics

```python
from bs4 import BeautifulSoup

html = """
<html>
<head><title>Test Page</title></head>
<body>
  <div class="content">
    <h1>Welcome</h1>
    <p>First paragraph.</p>
    <p class="highlight">Second paragraph.</p>
    <a href="https://example.com">Link 1</a>
    <a href="https://docs.python.org">Link 2</a>
  </div>
</body>
</html>
"""

soup = BeautifulSoup(html, "html.parser")

# find() -- first match
title = soup.find("title").get_text()                # 'Test Page'

# find_all() -- all matches
paragraphs = [p.get_text() for p in soup.find_all("p")]
# ['First paragraph.', 'Second paragraph.']

# CSS selectors via select()
highlighted = soup.select("p.highlight")
# [<p class="highlight">Second paragraph.</p>]

# Extract all links
links = [
    {"text": a.get_text(), "href": a["href"]}
    for a in soup.find_all("a", href=True)
]
# [{'text': 'Link 1', 'href': 'https://example.com'}, ...]
```

### 3.2 Navigating the DOM Tree

```python
div = soup.find("div", class_="content")

# Children (direct)
for child in div.children:
    if child.name:
        print(child.name)     # h1, p, p, a, a

# Descendants (recursive)
for desc in div.descendants:
    if hasattr(desc, "name") and desc.name:
        print(desc.name)

# Parent / siblings
h1 = soup.find("h1")
h1.parent.name                   # 'div'
h1.find_next_sibling("p").text   # 'First paragraph.'
```

### 3.3 Extracting Tables

```python
table_html = """
<table>
  <thead><tr><th>Name</th><th>Score</th></tr></thead>
  <tbody>
    <tr><td>Alice</td><td>95</td></tr>
    <tr><td>Bob</td><td>87</td></tr>
  </tbody>
</table>
"""

soup = BeautifulSoup(table_html, "html.parser")

headers = [th.get_text() for th in soup.find("thead").find_all("th")]
rows = []
for tr in soup.find("tbody").find_all("tr"):
    cells = [td.get_text() for td in tr.find_all("td")]
    rows.append(dict(zip(headers, cells)))

# rows = [{'Name': 'Alice', 'Score': '95'}, {'Name': 'Bob', 'Score': '87'}]
```

### 3.4 lxml for Speed

lxml is a C-extension library that is significantly faster than html.parser:

```python
from lxml import html as lxml_html

tree = lxml_html.fromstring(html)

# XPath queries
titles = tree.xpath("//h1/text()")          # ['Welcome']
hrefs = tree.xpath("//a/@href")             # ['https://example.com', ...]

# CSS selectors (requires cssselect)
elements = tree.cssselect("p.highlight")
texts = [el.text_content() for el in elements]
```

### 3.5 HTML Sanitisation with bleach

Never render user-supplied HTML without sanitising it first:

```python
import bleach

dirty = '<p>Hello <script>alert("xss")</script> <b>world</b></p>'

clean = bleach.clean(
    dirty,
    tags=["p", "b", "i", "a"],
    attributes={"a": ["href"]},
    strip=True,
)
# '<p>Hello alert("xss") <b>world</b></p>'
```

> **Note**: bleach is now in maintenance mode. For new projects consider
> **nh3** (Rust-based, much faster):

```python
import nh3

clean = nh3.clean(dirty, tags={"p", "b", "i", "a"})
```

---

## 4. XML Processing

### 4.1 ElementTree Basics

```python
import xml.etree.ElementTree as ET

xml_str = """<?xml version="1.0"?>
<catalog>
  <book id="1">
    <title>Python Cookbook</title>
    <author>David Beazley</author>
    <price>39.99</price>
  </book>
  <book id="2">
    <title>Fluent Python</title>
    <author>Luciano Ramalho</author>
    <price>49.99</price>
  </book>
</catalog>
"""

root = ET.fromstring(xml_str)

# Iterate over children
for book in root.findall("book"):
    book_id = book.get("id")
    title = book.find("title").text
    price = float(book.find("price").text)
    print(f"[{book_id}] {title}: ${price}")

# [1] Python Cookbook: $39.99
# [2] Fluent Python: $49.99
```

### 4.2 lxml for XPath and XSLT

```python
from lxml import etree

root = etree.fromstring(xml_str.encode())

# Full XPath support
titles = root.xpath("//book[price > 40]/title/text()")
# ['Fluent Python']

# XPath with predicates
expensive = root.xpath("//book[@id='2']/author/text()")
# ['Luciano Ramalho']
```

XSLT transforms XML into another format:

```python
xslt_str = """
<xsl:stylesheet version="1.0"
    xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:template match="/">
    <html><body>
      <xsl:for-each select="catalog/book">
        <p><xsl:value-of select="title"/></p>
      </xsl:for-each>
    </body></html>
  </xsl:template>
</xsl:stylesheet>
"""

xslt_tree = etree.fromstring(xslt_str.encode())
transform = etree.XSLT(xslt_tree)
result = transform(root)
print(str(result))
# <html><body><p>Python Cookbook</p><p>Fluent Python</p></body></html>
```

### 4.3 Namespaces

Namespaces are a common source of confusion:

```python
xml_ns = """
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>First Post</title>
  </entry>
</feed>
"""

root = ET.fromstring(xml_ns)

# WRONG -- finds nothing because of the namespace
root.findall("entry")  # []

# CORRECT -- use namespace map
ns = {"atom": "http://www.w3.org/2005/Atom"}
entries = root.findall("atom:entry", ns)
titles = [e.find("atom:title", ns).text for e in entries]
# ['First Post']
```

### 4.4 XML Generation

```python
root = ET.Element("users")
for name, age in [("Alice", 30), ("Bob", 25)]:
    user = ET.SubElement(root, "user")
    ET.SubElement(user, "name").text = name
    ET.SubElement(user, "age").text = str(age)

tree = ET.ElementTree(root)
ET.indent(tree, space="  ")  # Python 3.9+

import io
buf = io.BytesIO()
tree.write(buf, encoding="unicode", xml_declaration=True)
print(buf.getvalue())
```

Output:

```xml
<?xml version='1.0' encoding='us-ascii'?>
<users>
  <user>
    <name>Alice</name>
    <age>30</age>
  </user>
  <user>
    <name>Bob</name>
    <age>25</age>
  </user>
</users>
```

---

## 5. JSON Processing

### 5.1 json Module Basics

```python
import json

# Serialise (Python -> JSON string)
data = {"name": "Alice", "scores": [95, 87, 92], "active": True}
json_str = json.dumps(data, indent=2, ensure_ascii=False)

# Deserialise (JSON string -> Python)
parsed = json.loads(json_str)

# File I/O
with open("data.json", "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2)

with open("data.json", encoding="utf-8") as f:
    loaded = json.load(f)
```

Custom serialisation for types json cannot handle natively:

```python
from datetime import datetime, date
from decimal import Decimal

class CustomEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, (datetime, date)):
            return obj.isoformat()
        if isinstance(obj, Decimal):
            return str(obj)
        return super().default(obj)

json.dumps({"ts": datetime.now(), "amount": Decimal("19.99")}, cls=CustomEncoder)
# '{"ts": "2024-03-15T10:30:00", "amount": "19.99"}'
```

### 5.2 orjson for Speed

**orjson** is 3-10x faster and handles datetime/UUID natively:

```python
import orjson

data = {"name": "Alice", "ts": datetime.now()}
raw: bytes = orjson.dumps(data, option=orjson.OPT_INDENT_2)
parsed = orjson.loads(raw)
```

Key differences from stdlib json:

- `dumps()` returns `bytes`, not `str`
- No `default` parameter; use `option` flags or `orjson.OPT_PASSTHROUGH_*`
- Natively handles `datetime`, `date`, `UUID`, `numpy` arrays

### 5.3 JSON Lines (JSONL)

JSONL stores one JSON object per line -- ideal for streaming and log data:

```python
# Writing JSONL
records = [
    {"id": 1, "name": "Alice"},
    {"id": 2, "name": "Bob"},
    {"id": 3, "name": "Charlie"},
]

with open("data.jsonl", "w", encoding="utf-8") as f:
    for record in records:
        f.write(json.dumps(record) + "\n")

# Reading JSONL (streaming -- constant memory)
def read_jsonl(path: str):
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                yield json.loads(line)

for record in read_jsonl("data.jsonl"):
    print(record["name"])
```

### 5.4 JSON Schema Validation

```python
from jsonschema import validate, ValidationError

schema = {
    "type": "object",
    "properties": {
        "name": {"type": "string", "minLength": 1},
        "age": {"type": "integer", "minimum": 0, "maximum": 150},
        "email": {"type": "string", "format": "email"},
    },
    "required": ["name", "age"],
    "additionalProperties": False,
}

# Valid
validate(instance={"name": "Alice", "age": 30}, schema=schema)

# Invalid -- raises ValidationError
try:
    validate(instance={"name": "", "age": -5}, schema=schema)
except ValidationError as e:
    print(e.message)
    # '' is too short
```

### 5.5 Nested JSON Flattening

Deeply nested JSON is common in API responses. Flattening makes it easier to
load into tabular formats:

```python
def flatten_json(
    obj: dict,
    parent_key: str = "",
    sep: str = ".",
) -> dict:
    """Recursively flatten a nested dict.

    {"a": {"b": 1, "c": [2, 3]}} -> {"a.b": 1, "a.c.0": 2, "a.c.1": 3}
    """
    items: list[tuple[str, object]] = []
    for k, v in obj.items():
        new_key = f"{parent_key}{sep}{k}" if parent_key else k
        if isinstance(v, dict):
            items.extend(flatten_json(v, new_key, sep).items())
        elif isinstance(v, list):
            for i, item in enumerate(v):
                if isinstance(item, dict):
                    items.extend(flatten_json(item, f"{new_key}{sep}{i}", sep).items())
                else:
                    items.append((f"{new_key}{sep}{i}", item))
        else:
            items.append((new_key, v))
    return dict(items)

nested = {
    "user": {
        "name": "Alice",
        "address": {"city": "Seattle", "zip": "98101"},
        "tags": ["admin", "active"],
    }
}

flat = flatten_json(nested)
# {
#   'user.name': 'Alice',
#   'user.address.city': 'Seattle',
#   'user.address.zip': '98101',
#   'user.tags.0': 'admin',
#   'user.tags.1': 'active'
# }
```

---

## 6. YAML and TOML

### 6.1 PyYAML for YAML

```python
import yaml

yaml_str = """
database:
  host: localhost
  port: 5432
  credentials:
    username: admin
    password: secret123
  replicas:
    - host: replica1.db.internal
      port: 5432
    - host: replica2.db.internal
      port: 5432
logging:
  level: INFO
  format: "%(asctime)s %(levelname)s %(message)s"
"""

# Parse
config = yaml.safe_load(yaml_str)
# config['database']['credentials']['username'] -> 'admin'

# Dump back to YAML
output = yaml.dump(config, default_flow_style=False, sort_keys=False)
```

### 6.2 Safe Loading -- Why It Matters

**NEVER use `yaml.load()` without a Loader**. The default full loader can
execute arbitrary Python code:

```yaml
# Malicious YAML (do not use yaml.load on untrusted input!)
exploit: !!python/object/apply:os.system ['rm -rf /']
```

```python
# DANGEROUS -- allows arbitrary code execution
data = yaml.load(yaml_str)                # DO NOT DO THIS

# SAFE -- restricts to basic types only
data = yaml.safe_load(yaml_str)           # Always use this

# Or explicitly:
data = yaml.load(yaml_str, Loader=yaml.SafeLoader)
```

For round-trip editing that preserves comments, use **ruamel.yaml**:

```python
from ruamel.yaml import YAML

ryaml = YAML()
ryaml.preserve_quotes = True

with open("config.yaml") as f:
    data = ryaml.load(f)

data["database"]["port"] = 5433

with open("config.yaml", "w") as f:
    ryaml.dump(data, f)
```

### 6.3 tomli / tomllib for TOML

Python 3.11+ includes **tomllib** in the standard library. For earlier versions
use **tomli** (same API).

```python
# Python 3.11+
import tomllib

toml_str = """
[project]
name = "my-app"
version = "1.0.0"

[project.dependencies]
requests = ">=2.28"
pydantic = ">=2.0"

[[project.authors]]
name = "Alice"
email = "alice@example.com"

[[project.authors]]
name = "Bob"
email = "bob@example.com"
"""

config = tomllib.loads(toml_str)
# config['project']['name'] -> 'my-app'
# config['project']['authors'] -> [{'name': 'Alice', ...}, {'name': 'Bob', ...}]
```

For _writing_ TOML, use **tomli-w**:

```python
import tomli_w

data = {
    "project": {
        "name": "my-app",
        "version": "2.0.0",
    }
}

toml_output = tomli_w.dumps(data)
# [project]
# name = "my-app"
# version = "2.0.0"
```

### 6.4 Configuration File Patterns

A common pattern loads config with defaults, environment overrides, and
validation:

```python
import os
import tomllib
from dataclasses import dataclass

@dataclass(frozen=True)
class DbConfig:
    host: str
    port: int
    name: str
    user: str
    password: str

def load_config(path: str) -> DbConfig:
    with open(path, "rb") as f:
        raw = tomllib.load(f)

    db = raw.get("database", {})

    return DbConfig(
        host=os.environ.get("DB_HOST", db.get("host", "localhost")),
        port=int(os.environ.get("DB_PORT", db.get("port", 5432))),
        name=os.environ.get("DB_NAME", db.get("name", "app")),
        user=os.environ.get("DB_USER", db.get("user", "postgres")),
        password=os.environ.get("DB_PASSWORD", db.get("password", "")),
    )
```

---

## 7. Templating with Jinja2

### 7.1 Template Syntax

Jinja2 is the de-facto Python templating engine, used by Flask, Ansible,
dbt, and many more.

```python
from jinja2 import Environment, BaseLoader

env = Environment(loader=BaseLoader())

# Variables
template = env.from_string("Hello, {{ name }}!")
template.render(name="Alice")
# 'Hello, Alice!'

# Conditionals
template = env.from_string("""
{% if score >= 90 %}Grade: A
{% elif score >= 80 %}Grade: B
{% else %}Grade: C
{% endif %}
""".strip())

template.render(score=92)
# 'Grade: A'
```

### 7.2 Loops and Filters

```python
template = env.from_string("""
<ul>
{% for item in items %}
  <li>{{ item | capitalize }} ({{ loop.index }})</li>
{% endfor %}
</ul>
""".strip())

template.render(items=["alice", "bob", "charlie"])
# <ul>
#   <li>Alice (1)</li>
#   <li>Bob (2)</li>
#   <li>Charlie (3)</li>
# </ul>
```

Built-in filters include `upper`, `lower`, `title`, `trim`, `default`,
`tojson`, `length`, `join`, `sort`, `unique`, `reject`, `select`, and many more.

Custom filters:

```python
def reverse_words(s: str) -> str:
    return " ".join(s.split()[::-1])

env.filters["reverse_words"] = reverse_words

template = env.from_string("{{ text | reverse_words }}")
template.render(text="hello beautiful world")
# 'world beautiful hello'
```

### 7.3 Template Inheritance

This is Jinja2's killer feature for generating consistent documents:

```python
from jinja2 import Environment, DictLoader

templates = {
    "base.html": """
<!DOCTYPE html>
<html>
<head><title>{% block title %}Default{% endblock %}</title></head>
<body>
  <nav>{% block nav %}Home | About{% endblock %}</nav>
  <main>{% block content %}{% endblock %}</main>
  <footer>{% block footer %}Copyright 2024{% endblock %}</footer>
</body>
</html>
""".strip(),
    "page.html": """
{% extends "base.html" %}
{% block title %}{{ page_title }}{% endblock %}
{% block content %}
<h1>{{ page_title }}</h1>
<p>{{ body }}</p>
{% endblock %}
""".strip(),
}

env = Environment(loader=DictLoader(templates))
result = env.get_template("page.html").render(
    page_title="Welcome",
    body="This is the home page.",
)
```

### 7.4 Generating Documents from Templates

Generate configuration files, reports, emails, or any text format:

```python
from jinja2 import Environment, FileSystemLoader

env = Environment(
    loader=FileSystemLoader("templates/"),
    autoescape=False,           # Turn off HTML escaping for non-HTML
    trim_blocks=True,
    lstrip_blocks=True,
)

# Generate a YAML config from a template
# templates/docker-compose.yml.j2:
# services:
# {% for svc in services %}
#   {{ svc.name }}:
#     image: {{ svc.image }}
#     ports:
#       - "{{ svc.port }}:{{ svc.port }}"
# {% endfor %}

services = [
    {"name": "web", "image": "nginx:latest", "port": 80},
    {"name": "api", "image": "python:3.12", "port": 8000},
    {"name": "db", "image": "postgres:16", "port": 5432},
]

template = env.get_template("docker-compose.yml.j2")
output = template.render(services=services)
```

---

## 8. Worked Problems

### Problem 1: Web Scraper -- Extracting Structured Data from HTML

**Task**: Given an HTML page with a product listing, extract all products into
a list of dictionaries.

```python
"""
Web scraper that extracts product data from an HTML product listing page.
Handles missing fields gracefully and returns clean, structured data.
"""

from bs4 import BeautifulSoup
import json
import re

SAMPLE_HTML = """
<html>
<body>
<div class="products">
  <div class="product-card" data-id="101">
    <h2 class="product-name">Wireless Mouse</h2>
    <span class="price">$29.99</span>
    <p class="description">Ergonomic wireless mouse with USB-C receiver.</p>
    <div class="rating" data-stars="4.5">4.5/5</div>
    <ul class="tags">
      <li>electronics</li>
      <li>peripherals</li>
    </ul>
  </div>
  <div class="product-card" data-id="102">
    <h2 class="product-name">Mechanical Keyboard</h2>
    <span class="price">$89.99</span>
    <p class="description">Cherry MX Blue switches, RGB backlight.</p>
    <div class="rating" data-stars="4.8">4.8/5</div>
    <ul class="tags">
      <li>electronics</li>
      <li>keyboards</li>
      <li>gaming</li>
    </ul>
  </div>
  <div class="product-card" data-id="103">
    <h2 class="product-name">USB-C Hub</h2>
    <span class="price">$45.00</span>
    <!-- no description for this product -->
    <div class="rating" data-stars="3.9">3.9/5</div>
    <ul class="tags">
      <li>accessories</li>
    </ul>
  </div>
</div>
</body>
</html>
"""

PRICE_RE = re.compile(r"\$(\d+\.\d{2})")


def extract_products(html: str) -> list[dict]:
    """Extract structured product data from HTML.

    Returns a list of dicts with keys:
        id, name, price, description, rating, tags
    """
    soup = BeautifulSoup(html, "html.parser")
    products = []

    for card in soup.select("div.product-card"):
        product_id = card.get("data-id", "")

        name_el = card.select_one("h2.product-name")
        name = name_el.get_text(strip=True) if name_el else ""

        price_el = card.select_one("span.price")
        price_text = price_el.get_text(strip=True) if price_el else "$0.00"
        price_match = PRICE_RE.search(price_text)
        price = float(price_match.group(1)) if price_match else 0.0

        desc_el = card.select_one("p.description")
        description = desc_el.get_text(strip=True) if desc_el else None

        rating_el = card.select_one("div.rating")
        rating = float(rating_el.get("data-stars", 0)) if rating_el else 0.0

        tags = [li.get_text(strip=True) for li in card.select("ul.tags li")]

        products.append({
            "id": product_id,
            "name": name,
            "price": price,
            "description": description,
            "rating": rating,
            "tags": tags,
        })

    return products


# --- Run ---
products = extract_products(SAMPLE_HTML)
print(json.dumps(products, indent=2))

# Output:
# [
#   {
#     "id": "101",
#     "name": "Wireless Mouse",
#     "price": 29.99,
#     "description": "Ergonomic wireless mouse with USB-C receiver.",
#     "rating": 4.5,
#     "tags": ["electronics", "peripherals"]
#   },
#   {
#     "id": "102",
#     "name": "Mechanical Keyboard",
#     "price": 89.99,
#     "description": "Cherry MX Blue switches, RGB backlight.",
#     "rating": 4.8,
#     "tags": ["electronics", "keyboards", "gaming"]
#   },
#   {
#     "id": "103",
#     "name": "USB-C Hub",
#     "price": 45.0,
#     "description": null,
#     "rating": 3.9,
#     "tags": ["accessories"]
#   }
# ]
```

---

### Problem 2: Config File Migrator (YAML to TOML)

**Task**: Write a utility that reads a YAML configuration file and writes an
equivalent TOML file, handling nested structures and arrays.

```python
"""
Config file migrator: YAML -> TOML.

Reads a YAML config, validates it, and writes a TOML equivalent.
Handles nested dicts, lists, and common YAML features.
"""

import yaml
import tomli_w
from pathlib import Path
from datetime import datetime


SAMPLE_YAML = """
# Application configuration
app:
  name: my-service
  version: "2.1.0"
  debug: false

server:
  host: 0.0.0.0
  port: 8080
  workers: 4
  timeout: 30.0

database:
  url: "postgresql://localhost:5432/mydb"
  pool_size: 10
  ssl: true

logging:
  level: INFO
  handlers:
    - type: console
      format: plain
    - type: file
      path: /var/log/app.log
      format: json
      max_size_mb: 100

features:
  enable_cache: true
  cache_ttl: 300
  allowed_origins:
    - "https://example.com"
    - "https://app.example.com"
"""


def yaml_to_toml(yaml_content: str) -> str:
    """Convert a YAML string to a TOML string.

    Args:
        yaml_content: Valid YAML string.

    Returns:
        Equivalent TOML string.

    Raises:
        ValueError: If YAML is invalid or contains unconvertible types.
    """
    data = yaml.safe_load(yaml_content)

    if not isinstance(data, dict):
        raise ValueError(
            f"Top-level YAML must be a mapping, got {type(data).__name__}"
        )

    # TOML does not support None values -- remove them
    cleaned = _remove_none_values(data)

    return tomli_w.dumps(cleaned)


def _remove_none_values(obj):
    """Recursively remove None values (TOML has no null type)."""
    if isinstance(obj, dict):
        return {
            k: _remove_none_values(v)
            for k, v in obj.items()
            if v is not None
        }
    if isinstance(obj, list):
        return [_remove_none_values(item) for item in obj if item is not None]
    return obj


def migrate_file(yaml_path: str, toml_path: str) -> None:
    """Read a YAML file and write the equivalent TOML file.

    Args:
        yaml_path: Path to source YAML file.
        toml_path: Path to destination TOML file.
    """
    yaml_content = Path(yaml_path).read_text(encoding="utf-8")
    toml_content = yaml_to_toml(yaml_content)

    # Add a migration comment header
    header = (
        f"# Migrated from {Path(yaml_path).name}\n"
        f"# Generated at {datetime.now().isoformat()}\n\n"
    )

    Path(toml_path).write_text(
        header + toml_content,
        encoding="utf-8",
    )


# --- Demo ---
toml_output = yaml_to_toml(SAMPLE_YAML)
print(toml_output)

# Output:
# [app]
# name = "my-service"
# version = "2.1.0"
# debug = false
#
# [server]
# host = "0.0.0.0"
# port = 8080
# workers = 4
# timeout = 30.0
#
# [database]
# url = "postgresql://localhost:5432/mydb"
# pool_size = 10
# ssl = true
#
# [logging]
# level = "INFO"
#
# [[logging.handlers]]
# type = "console"
# format = "plain"
#
# [[logging.handlers]]
# type = "file"
# path = "/var/log/app.log"
# format = "json"
# max_size_mb = 100
#
# [features]
# enable_cache = true
# cache_ttl = 300
# allowed_origins = [
#     "https://example.com",
#     "https://app.example.com",
# ]
```

---

## Appendix: Cheat Sheet

```
 ============================================================================
 FORMAT       LIBRARY            READ                WRITE
 ============================================================================
 Plain Text   built-in           open() / Path       open() / Path
              chardet             chardet.detect()    ---
              charset-normalizer  from_bytes()        ---
 --------------------------------------------------------------------------
 Regex        re                 re.findall()         ---
                                 re.search()
                                 re.match()
                                 re.sub()
 --------------------------------------------------------------------------
 Markdown     mistune            mistune.html()       string formatting
              markdown-it-py     md.parse() / render
 --------------------------------------------------------------------------
 HTML         bs4                BeautifulSoup()      soup.prettify()
                                 find / find_all
                                 select (CSS)
              lxml.html          fromstring()         tostring()
                                 xpath() / cssselect
              bleach / nh3       ---                  clean()
 --------------------------------------------------------------------------
 XML          xml.etree          ET.fromstring()      ET.tostring()
                                 find / findall       ET.SubElement()
              lxml.etree         etree.fromstring()   etree.tostring()
                                 xpath()              XSLT()
 --------------------------------------------------------------------------
 JSON         json               json.loads()         json.dumps()
                                 json.load()          json.dump()
              orjson             orjson.loads()        orjson.dumps()
              jsonschema         validate()            ---
 --------------------------------------------------------------------------
 JSONL        json               readline + loads     dumps + \n
 --------------------------------------------------------------------------
 YAML         PyYAML             yaml.safe_load()     yaml.dump()
              ruamel.yaml        YAML().load()        YAML().dump()
 --------------------------------------------------------------------------
 TOML         tomllib (3.11+)    tomllib.loads()      ---
              tomli              tomli.loads()         ---
              tomli_w            ---                   tomli_w.dumps()
 --------------------------------------------------------------------------
 Templates    Jinja2             env.get_template()   template.render()
                                 env.from_string()
 ============================================================================

 SAFETY RULES:
 1. YAML:  ALWAYS use safe_load(), NEVER yaml.load() on untrusted input
 2. HTML:  ALWAYS sanitise user HTML (bleach / nh3) before rendering
 3. XML:   ALWAYS use defusedxml for untrusted XML (prevents XXE attacks)
 4. JSON:  Validate with jsonschema before trusting structure
 5. TOML:  Inherently safe (no code execution vectors)

 PERFORMANCE TIPS:
 +----------+------------------+------------------------------------------+
 | Format   | Fast Library     | When to Use                              |
 +----------+------------------+------------------------------------------+
 | JSON     | orjson           | >10k records, datetime/UUID heavy        |
 | HTML/XML | lxml             | Large docs, complex XPath queries         |
 | YAML     | ruamel.yaml      | Round-trip editing with comments          |
 | Markdown | mistune           | High-volume Markdown->HTML conversion    |
 +----------+------------------+------------------------------------------+

 COMMON REGEX PATTERNS:
 +------------+---------------------------------------------------+
 | Target     | Pattern                                           |
 +------------+---------------------------------------------------+
 | Email      | [a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}  |
 | URL        | https?://[^\s,)]+                                 |
 | ISO Date   | \d{4}-\d{2}-\d{2}                                |
 | US Phone   | [\+]?[\d\-\(\)\s]{7,15}                          |
 | IPv4       | \d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}              |
 | Log line   | (?P<ts>[\dT:-]+)\s+(?P<lvl>\w+)\s+(?P<msg>.*)    |
 +------------+---------------------------------------------------+

 ENCODING DETECTION DECISION TREE:
 1. Is encoding specified (HTTP header, BOM, XML declaration)?  -> Use it
 2. Is it a modern API / known source?                          -> Assume UTF-8
 3. Unknown legacy file?                                        -> chardet / charset-normalizer
 4. Still failing?                                              -> Try latin-1 (never throws)
```
