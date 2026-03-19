# Chapter 7: Email and Archives

## Introduction

Email is one of the most common document sources in business. Invoices arrive as PDF attachments in EML files, customer communications are stored in MBOX archives, and automated reports are sent as HTML emails with embedded data. Understanding email parsing — MIME structure, attachment extraction, encoding issues — is essential for any document processing pipeline. Similarly, archives (ZIP, TAR, GZIP, 7z) are how documents are packaged for transfer and storage.

```
+------------------------------------------------------------------------+
|                    EMAIL & ARCHIVE PROCESSING                           |
+------------------------------------------------------------------------+
|                                                                        |
|  EMAIL FORMATS                   ARCHIVE FORMATS                       |
|  +------------------------+     +---------------------------+          |
|  | EML (.eml)              |     | ZIP (.zip)                |          |
|  |   Single email file     |     |   Most common, PKZIP      |          |
|  | MSG (.msg)              |     | TAR (.tar)                |          |
|  |   Outlook proprietary   |     |   Unix tape archive       |          |
|  | MBOX (.mbox)            |     | GZIP (.gz, .tar.gz)       |          |
|  |   Mailbox archive       |     |   Single-file compression  |          |
|  | PST (.pst)              |     | BZ2 (.bz2, .tar.bz2)     |          |
|  |   Outlook data file     |     |   Better compression       |          |
|  +------------------------+     | 7z (.7z)                  |          |
|                                  |   Best compression ratio   |          |
|  PYTHON LIBRARIES                | RAR (.rar)                |          |
|  +------------------------+     |   Proprietary              |          |
|  | email (stdlib)          |     +---------------------------+          |
|  | mailbox (stdlib)        |                                            |
|  | extract-msg             |     PYTHON LIBRARIES                       |
|  | imapclient              |     +---------------------------+          |
|  | beautifulsoup4          |     | zipfile (stdlib)           |          |
|  +------------------------+     | tarfile (stdlib)           |          |
|                                  | gzip, bz2, lzma (stdlib)  |          |
|                                  | py7zr (7z support)         |          |
|                                  | rarfile                    |          |
|                                  +---------------------------+          |
|                                                                        |
+------------------------------------------------------------------------+
```

---

## 1. Email Structure (MIME)

### 1.1 What Is MIME?

```
MIME (Multipurpose Internet Mail Extensions)

An email is NOT just text. It is a structured MIME message:

+--------------------------------------------------+
| Headers                                           |
|   From: alice@example.com                        |
|   To: bob@example.com                            |
|   Subject: Invoice Attached                      |
|   Date: Mon, 15 Jan 2024 10:30:00 +0000         |
|   Content-Type: multipart/mixed                  |
+--------------------------------------------------+
| Part 1: multipart/alternative                    |
|   +----------------------------------------------+
|   | Part 1a: text/plain                          |
|   |   "Please find the invoice attached."        |
|   +----------------------------------------------+
|   | Part 1b: text/html                           |
|   |   "<p>Please find the invoice attached.</p>" |
|   +----------------------------------------------+
+--------------------------------------------------+
| Part 2: application/pdf                          |
|   Content-Disposition: attachment                |
|   filename="invoice_12345.pdf"                   |
|   [Base64-encoded PDF data]                      |
+--------------------------------------------------+

Key concepts:
  multipart/mixed:       Main message + attachments
  multipart/alternative: Same content in different formats (text + HTML)
  Content-Transfer-Encoding: base64, quoted-printable, 7bit
```

---

## 2. Parsing EML Files

### 2.1 Basic Email Parsing

```python
import email
from email import policy
from email.parser import BytesParser

def parse_eml(eml_path: str) -> dict:
    """Parse an .eml file into structured data."""
    with open(eml_path, "rb") as f:
        msg = BytesParser(policy=policy.default).parse(f)

    return {
        "from": msg["from"],
        "to": msg["to"],
        "subject": msg["subject"],
        "date": msg["date"],
        "message_id": msg["message-id"],
        "cc": msg.get("cc"),
        "bcc": msg.get("bcc"),
        "reply_to": msg.get("reply-to"),
    }

# Usage
headers = parse_eml("invoice_email.eml")
print(f"From: {headers['from']}")
print(f"Subject: {headers['subject']}")
```

### 2.2 Extracting Email Body

```python
import email
from email import policy
from email.parser import BytesParser

def get_email_body(eml_path: str) -> dict:
    """Extract both plain text and HTML body from an email."""
    with open(eml_path, "rb") as f:
        msg = BytesParser(policy=policy.default).parse(f)

    plain_body = None
    html_body = None

    if msg.is_multipart():
        for part in msg.walk():
            content_type = part.get_content_type()
            if content_type == "text/plain" and plain_body is None:
                plain_body = part.get_content()
            elif content_type == "text/html" and html_body is None:
                html_body = part.get_content()
    else:
        content_type = msg.get_content_type()
        content = msg.get_content()
        if content_type == "text/plain":
            plain_body = content
        elif content_type == "text/html":
            html_body = content

    return {"plain": plain_body, "html": html_body}

# Usage
body = get_email_body("newsletter.eml")
print(body["plain"][:200] if body["plain"] else "No plain text body")
```

### 2.3 Extracting Attachments

```python
import email
from email import policy
from email.parser import BytesParser
from pathlib import Path

def extract_attachments(eml_path: str, output_dir: str) -> list[dict]:
    """Extract all attachments from an .eml file."""
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    with open(eml_path, "rb") as f:
        msg = BytesParser(policy=policy.default).parse(f)

    attachments = []
    for part in msg.walk():
        disposition = part.get_content_disposition()
        if disposition != "attachment":
            continue

        filename = part.get_filename()
        if not filename:
            continue

        # Save attachment
        data = part.get_content()
        if isinstance(data, str):
            data = data.encode()

        filepath = str(Path(output_dir) / filename)
        with open(filepath, "wb") as f:
            f.write(data)

        attachments.append({
            "filename": filename,
            "content_type": part.get_content_type(),
            "size": len(data),
            "path": filepath,
        })

    return attachments

# Usage
attachments = extract_attachments("invoice_email.eml", "attachments/")
for att in attachments:
    print(f"  {att['filename']} ({att['content_type']}, {att['size']} bytes)")
```

---

## 3. Parsing MSG Files (Outlook)

```python
# pip install extract-msg
import extract_msg

def parse_msg(msg_path: str) -> dict:
    """Parse an Outlook .msg file."""
    msg = extract_msg.Message(msg_path)

    result = {
        "from": msg.sender,
        "to": msg.to,
        "subject": msg.subject,
        "date": msg.date,
        "body": msg.body,
        "html_body": msg.htmlBody,
        "attachments": [],
    }

    for attachment in msg.attachments:
        result["attachments"].append({
            "filename": attachment.longFilename or attachment.shortFilename,
            "size": len(attachment.data) if attachment.data else 0,
        })

    msg.close()
    return result

def extract_msg_attachments(msg_path: str, output_dir: str):
    """Extract attachments from a .msg file."""
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    msg = extract_msg.Message(msg_path)
    msg.saveAttachments(customPath=output_dir)
    msg.close()
```

---

## 4. MBOX Archives

### 4.1 Reading MBOX Files

```python
import mailbox

def read_mbox(mbox_path: str) -> list[dict]:
    """Read all messages from an MBOX archive."""
    mbox = mailbox.mbox(mbox_path)
    messages = []

    for msg in mbox:
        messages.append({
            "from": msg["from"],
            "to": msg["to"],
            "subject": msg["subject"],
            "date": msg["date"],
            "has_attachments": msg.is_multipart(),
        })

    mbox.close()
    return messages

# Usage
msgs = read_mbox("archive.mbox")
print(f"Found {len(msgs)} messages")
for m in msgs[:5]:
    print(f"  {m['date']} | {m['from']} | {m['subject']}")
```

### 4.2 Processing Gmail Takeout

```python
import mailbox
from email import policy

def process_gmail_takeout(mbox_path: str):
    """Process a Gmail Takeout MBOX export."""
    mbox = mailbox.mbox(mbox_path)
    stats = {"total": 0, "with_attachments": 0, "labels": {}}

    for msg in mbox:
        stats["total"] += 1

        if msg.is_multipart():
            for part in msg.walk():
                if part.get_content_disposition() == "attachment":
                    stats["with_attachments"] += 1
                    break

        # Gmail labels stored in X-Gmail-Labels header
        labels = msg.get("X-Gmail-Labels", "")
        for label in labels.split(","):
            label = label.strip()
            if label:
                stats["labels"][label] = stats["labels"].get(label, 0) + 1

    mbox.close()
    return stats
```

---

## 5. ZIP Archives

### 5.1 Reading ZIP Files

```python
import zipfile
from pathlib import Path

def list_zip_contents(zip_path: str) -> list[dict]:
    """List all files in a ZIP archive."""
    with zipfile.ZipFile(zip_path, "r") as z:
        contents = []
        for info in z.infolist():
            contents.append({
                "filename": info.filename,
                "size": info.file_size,
                "compressed_size": info.compress_size,
                "is_dir": info.is_dir(),
                "date": f"{info.date_time[0]}-{info.date_time[1]:02d}-{info.date_time[2]:02d}",
            })
        return contents

def extract_zip(zip_path: str, output_dir: str):
    """Safely extract a ZIP archive."""
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path, "r") as z:
        # Security: check for path traversal attacks
        for member in z.namelist():
            member_path = Path(output_dir) / member
            if not str(member_path.resolve()).startswith(str(Path(output_dir).resolve())):
                raise ValueError(f"Path traversal detected: {member}")
        z.extractall(output_dir)
    print(f"Extracted to {output_dir}")
```

### 5.2 Creating ZIP Files

```python
import zipfile
from pathlib import Path

def create_zip(input_paths: list[str], output_path: str, compression=zipfile.ZIP_DEFLATED):
    """Create a ZIP archive from a list of files."""
    with zipfile.ZipFile(output_path, "w", compression=compression) as z:
        for path in input_paths:
            p = Path(path)
            if p.is_file():
                z.write(path, p.name)
            elif p.is_dir():
                for file in p.rglob("*"):
                    if file.is_file():
                        arcname = file.relative_to(p.parent)
                        z.write(file, arcname)
    print(f"Created {output_path}")

def add_to_zip(zip_path: str, file_path: str, arcname: str = None):
    """Add a file to an existing ZIP archive."""
    with zipfile.ZipFile(zip_path, "a") as z:
        z.write(file_path, arcname or Path(file_path).name)
```

### 5.3 Reading Files from ZIP Without Extracting

```python
import zipfile
import json

def read_from_zip(zip_path: str, internal_path: str) -> bytes:
    """Read a specific file from a ZIP without extracting."""
    with zipfile.ZipFile(zip_path, "r") as z:
        return z.read(internal_path)

# Example: Read a JSON file from inside a ZIP
data = read_from_zip("data_archive.zip", "data/config.json")
config = json.loads(data)
```

---

## 6. TAR and Compressed Archives

### 6.1 TAR Files

```python
import tarfile
from pathlib import Path

def extract_tar(tar_path: str, output_dir: str):
    """Extract a TAR archive (supports .tar, .tar.gz, .tar.bz2, .tar.xz)."""
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    # Auto-detect compression from extension
    mode = "r"
    if tar_path.endswith(".gz") or tar_path.endswith(".tgz"):
        mode = "r:gz"
    elif tar_path.endswith(".bz2"):
        mode = "r:bz2"
    elif tar_path.endswith(".xz"):
        mode = "r:xz"

    with tarfile.open(tar_path, mode) as tar:
        # Security: filter out dangerous paths
        safe_members = []
        for member in tar.getmembers():
            if member.name.startswith("/") or ".." in member.name:
                continue
            safe_members.append(member)
        tar.extractall(output_dir, members=safe_members)
    print(f"Extracted to {output_dir}")

def create_tar_gz(input_dir: str, output_path: str):
    """Create a .tar.gz archive from a directory."""
    with tarfile.open(output_path, "w:gz") as tar:
        tar.add(input_dir, arcname=Path(input_dir).name)
    print(f"Created {output_path}")
```

### 6.2 GZIP Single Files

```python
import gzip
import shutil

def gzip_file(input_path: str, output_path: str = None):
    """Compress a single file with gzip."""
    output_path = output_path or f"{input_path}.gz"
    with open(input_path, "rb") as f_in:
        with gzip.open(output_path, "wb") as f_out:
            shutil.copyfileobj(f_in, f_out)
    print(f"Compressed to {output_path}")

def gunzip_file(gz_path: str, output_path: str = None):
    """Decompress a gzip file."""
    output_path = output_path or gz_path.rstrip(".gz")
    with gzip.open(gz_path, "rb") as f_in:
        with open(output_path, "wb") as f_out:
            shutil.copyfileobj(f_in, f_out)
    print(f"Decompressed to {output_path}")
```

---

## 7. Recursive Archive Processing

### 7.1 Processing Nested Archives

Real-world document batches often contain archives within archives:

```python
import zipfile
import tarfile
import tempfile
from pathlib import Path

def process_archive_recursive(archive_path: str, handler, depth: int = 0, max_depth: int = 3):
    """Recursively process archives, calling handler for each file."""
    if depth > max_depth:
        return

    path = Path(archive_path)

    if zipfile.is_zipfile(archive_path):
        with zipfile.ZipFile(archive_path, "r") as z:
            with tempfile.TemporaryDirectory() as tmp:
                z.extractall(tmp)
                for extracted in Path(tmp).rglob("*"):
                    if extracted.is_file():
                        process_archive_recursive(str(extracted), handler, depth + 1, max_depth)

    elif tarfile.is_tarfile(archive_path):
        with tarfile.open(archive_path) as tar:
            with tempfile.TemporaryDirectory() as tmp:
                tar.extractall(tmp, filter="data")
                for extracted in Path(tmp).rglob("*"):
                    if extracted.is_file():
                        process_archive_recursive(str(extracted), handler, depth + 1, max_depth)

    else:
        # Regular file — call the handler
        handler(archive_path)

# Usage
def handle_file(filepath: str):
    print(f"Found: {filepath} ({Path(filepath).suffix})")

process_archive_recursive("documents.zip", handle_file)
```

---

## 8. Security Considerations

```
ARCHIVE SECURITY RISKS

1. ZIP BOMB (Decompression Bomb):
   A 42 KB ZIP file that expands to 4.5 PETABYTES.
   Defense: Check uncompressed size before extracting.

2. PATH TRAVERSAL:
   Archive entry named "../../etc/passwd" could overwrite system files.
   Defense: Validate all paths before extraction.

3. SYMLINK ATTACKS:
   Archive contains symlinks pointing outside the extraction directory.
   Defense: Skip or validate symlinks.

4. MALICIOUS ATTACHMENTS:
   Email attachments containing malware.
   Defense: Scan with antivirus, sandbox untrusted files.
```

```python
import zipfile

def safe_extract(zip_path: str, output_dir: str, max_size: int = 500_000_000):
    """Extract ZIP with security checks."""
    output = Path(output_dir).resolve()
    output.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(zip_path, "r") as z:
        # Check for zip bomb
        total_size = sum(info.file_size for info in z.infolist())
        if total_size > max_size:
            raise ValueError(f"Archive too large: {total_size} bytes (max {max_size})")

        for info in z.infolist():
            # Check for path traversal
            target = (output / info.filename).resolve()
            if not str(target).startswith(str(output)):
                raise ValueError(f"Path traversal: {info.filename}")

            # Check individual file size
            if info.file_size > max_size:
                raise ValueError(f"File too large: {info.filename} ({info.file_size} bytes)")

        z.extractall(output_dir)
```

---

## 9. Worked Problems

### Problem 1: Email Attachment Pipeline

```python
import email
from email import policy
from email.parser import BytesParser
from pathlib import Path
import json

def process_email_folder(eml_dir: str, output_dir: str) -> list[dict]:
    """Process all .eml files in a directory, extract metadata and attachments."""
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    results = []

    for eml_file in Path(eml_dir).glob("*.eml"):
        with open(eml_file, "rb") as f:
            msg = BytesParser(policy=policy.default).parse(f)

        record = {
            "file": eml_file.name,
            "from": msg["from"],
            "to": msg["to"],
            "subject": msg["subject"],
            "date": msg["date"],
            "attachments": [],
        }

        # Extract attachments
        for part in msg.walk():
            if part.get_content_disposition() != "attachment":
                continue
            filename = part.get_filename()
            if not filename:
                continue

            data = part.get_content()
            if isinstance(data, str):
                data = data.encode()

            att_dir = Path(output_dir) / eml_file.stem
            att_dir.mkdir(exist_ok=True)
            att_path = att_dir / filename

            with open(att_path, "wb") as f:
                f.write(data)

            record["attachments"].append({
                "filename": filename,
                "type": part.get_content_type(),
                "size": len(data),
                "saved_to": str(att_path),
            })

        results.append(record)

    # Save manifest
    manifest_path = Path(output_dir) / "manifest.json"
    with open(manifest_path, "w") as f:
        json.dump(results, f, indent=2, default=str)

    return results

# Usage
results = process_email_folder("inbox/", "processed/")
total_attachments = sum(len(r["attachments"]) for r in results)
print(f"Processed {len(results)} emails, extracted {total_attachments} attachments")
```

### Problem 2: Archive Inventory Tool

```python
import zipfile
import tarfile
from pathlib import Path
import json

def inventory_archive(archive_path: str) -> dict:
    """Create a detailed inventory of an archive's contents."""
    path = Path(archive_path)
    inventory = {
        "archive": path.name,
        "format": None,
        "total_files": 0,
        "total_size": 0,
        "compressed_size": path.stat().st_size,
        "file_types": {},
        "files": [],
    }

    if zipfile.is_zipfile(archive_path):
        inventory["format"] = "ZIP"
        with zipfile.ZipFile(archive_path, "r") as z:
            for info in z.infolist():
                if info.is_dir():
                    continue
                ext = Path(info.filename).suffix.lower() or "(no extension)"
                inventory["file_types"][ext] = inventory["file_types"].get(ext, 0) + 1
                inventory["total_files"] += 1
                inventory["total_size"] += info.file_size
                inventory["files"].append({
                    "path": info.filename,
                    "size": info.file_size,
                    "compressed": info.compress_size,
                })

    elif tarfile.is_tarfile(archive_path):
        inventory["format"] = "TAR"
        with tarfile.open(archive_path) as tar:
            for member in tar.getmembers():
                if not member.isfile():
                    continue
                ext = Path(member.name).suffix.lower() or "(no extension)"
                inventory["file_types"][ext] = inventory["file_types"].get(ext, 0) + 1
                inventory["total_files"] += 1
                inventory["total_size"] += member.size
                inventory["files"].append({
                    "path": member.name,
                    "size": member.size,
                })

    ratio = inventory["total_size"] / inventory["compressed_size"] if inventory["compressed_size"] else 0
    inventory["compression_ratio"] = f"{ratio:.1f}x"

    return inventory

# Usage
inv = inventory_archive("documents.zip")
print(f"Archive: {inv['archive']} ({inv['format']})")
print(f"Files: {inv['total_files']}, Size: {inv['total_size']:,} bytes")
print(f"Compression: {inv['compression_ratio']}")
print(f"File types: {json.dumps(inv['file_types'], indent=2)}")
```

---

## Appendix: Email & Archives Cheat Sheet

```
EMAIL & ARCHIVES CHEAT SHEET

Email Parsing:
  EML:   email.parser.BytesParser(policy=policy.default).parse(f)
  MSG:   extract_msg.Message(path)
  MBOX:  mailbox.mbox(path)

Email Structure:
  Headers:  msg["from"], msg["to"], msg["subject"], msg["date"]
  Body:     msg.walk() -> check content_type (text/plain, text/html)
  Attach:   part.get_content_disposition() == "attachment"
            part.get_filename(), part.get_content()

ZIP:
  Read:     zipfile.ZipFile(path, "r") -> .namelist(), .read(), .extractall()
  Write:    zipfile.ZipFile(path, "w") -> .write(), .writestr()
  Security: Check path traversal, zip bombs, file sizes

TAR:
  Read:     tarfile.open(path) -> .getmembers(), .extractall()
  Create:   tarfile.open(path, "w:gz") -> .add()
  Modes:    r (auto), r:gz (gzip), r:bz2 (bzip2), r:xz (xz)

GZIP:
  Compress:   gzip.open(out, "wb") + shutil.copyfileobj
  Decompress: gzip.open(in, "rb") + shutil.copyfileobj

Security:
  Path traversal:     Validate all paths before extraction
  Zip bombs:          Check total uncompressed size
  Symlink attacks:    Skip or validate symlinks
  Malicious content:  Scan attachments, sandbox untrusted files

Key Libraries:
  email (stdlib):    EML parsing
  mailbox (stdlib):  MBOX archives
  extract-msg:       Outlook .msg files
  zipfile (stdlib):  ZIP archives
  tarfile (stdlib):  TAR archives
  gzip (stdlib):     GZIP compression
  py7zr:             7z archives
```
