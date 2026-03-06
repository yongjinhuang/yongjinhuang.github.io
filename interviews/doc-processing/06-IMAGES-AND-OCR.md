# Chapter 6: Images and OCR

Scanned documents, photographs of whiteboards, faxed forms, and camera-captured
receipts -- a staggering volume of the world's information lives inside images
rather than machine-readable text. **Optical Character Recognition (OCR)** is the
bridge between pixels and searchable, parseable strings. But OCR engines are
notoriously sensitive to image quality: feed in a dark, skewed, low-resolution
scan and you get gibberish; feed in a clean, high-contrast, deskewed image and
you get near-perfect text. This chapter covers the full pipeline -- from raw
image formats and metadata, through preprocessing with Pillow and OpenCV, to
extraction with Tesseract, EasyOCR, and OCRmyPDF, and finally to structured
table detection from scanned documents.

```
+------------------------------------------------------------------+
|                  IMAGE / OCR ECOSYSTEM OVERVIEW                  |
+------------------------------------------------------------------+
|                                                                  |
|  RAW IMAGE                                                       |
|  +------------------+                                            |
|  | JPEG / PNG / TIFF|                                            |
|  | BMP / WebP       |                                            |
|  | (with EXIF, DPI) |                                            |
|  +--------+---------+                                            |
|           |                                                      |
|           v                                                      |
|  PREPROCESSING PIPELINE                                          |
|  +----------------------------------------------------------+   |
|  |  Pillow / OpenCV                                          |   |
|  |                                                           |   |
|  |  Grayscale --> Binarize --> Denoise --> Deskew --> Scale   |   |
|  |                                                           |   |
|  |  Color adjust   Threshold   Median     Rotation   DPI     |   |
|  |  Crop/Resize    Otsu/Adapt  Gaussian   Hough      Up      |   |
|  +-----------------------------+-----------------------------+   |
|                                |                                 |
|                                v                                 |
|  OCR ENGINES                                                     |
|  +------------------+  +----------------+  +--------------+     |
|  | Tesseract        |  | EasyOCR        |  | OCRmyPDF     |     |
|  | (pytesseract)    |  | (GPU-accel)    |  | (PDF layer)  |     |
|  |                  |  |                |  |              |     |
|  | PSM modes        |  | Multi-lang     |  | Batch proc   |     |
|  | OEM modes        |  | Deep learning  |  | Searchable   |     |
|  | HOCR output      |  | Bounding boxes |  | PDF output   |     |
|  | Confidence       |  |                |  |              |     |
|  +--------+---------+  +-------+--------+  +------+-------+     |
|           |                    |                   |             |
|           +--------------------+-------------------+             |
|                                |                                 |
|                                v                                 |
|  POST-PROCESSING                                                 |
|  +----------------------------------------------------------+   |
|  |  Raw text --> Clean --> Structure --> Validate             |   |
|  |                                                           |   |
|  |  Table detection (img2table)                              |   |
|  |  Receipt parsing    Form extraction    Batch workflows    |   |
|  +----------------------------------------------------------+   |
|                                                                  |
+------------------------------------------------------------------+
```

---

## 1. Image Formats and Metadata

### 1.1 Common Formats Compared

| Format | Compression  | Transparency | Lossless | Typical Use               |
|--------|-------------|-------------|----------|---------------------------|
| JPEG   | Lossy       | No          | No       | Photos, scanned docs      |
| PNG    | Lossless    | Yes (alpha) | Yes      | Screenshots, diagrams     |
| TIFF   | Both        | Yes         | Both     | Archival, multi-page docs |
| BMP    | None        | No          | Yes      | Legacy Windows bitmaps    |
| WebP   | Both        | Yes         | Both     | Web-optimized images      |

**Key takeaway for OCR**: TIFF (uncompressed or LZW) and PNG are preferred for
OCR pipelines because they avoid JPEG compression artifacts that degrade text
edges. JPEG at quality 95+ is acceptable for photographs of documents.

### 1.2 EXIF Metadata with Pillow

EXIF (Exchangeable Image File Format) stores camera settings, GPS coordinates,
orientation, timestamps, and more inside JPEG and TIFF files.

```python
from PIL import Image
from PIL.ExifTags import TAGS, GPSTAGS

def read_exif(path: str) -> dict:
    """Extract and decode EXIF metadata from an image."""
    img = Image.open(path)
    exif_data = img.getexif()
    if not exif_data:
        return {}

    decoded = {}
    for tag_id, value in exif_data.items():
        tag_name = TAGS.get(tag_id, tag_id)
        decoded[tag_name] = value
    return decoded

# Usage
metadata = read_exif("scan_001.jpg")
print(metadata.get("DateTime"))       # '2024:03:15 10:30:00'
print(metadata.get("Orientation"))    # 6 (rotated 90 CW)
print(metadata.get("XResolution"))    # IFDRational(300, 1) => 300 DPI
```

### 1.3 DPI and Resolution

DPI (dots per inch) determines how many pixels map to one physical inch.
For OCR, **300 DPI** is the standard minimum; 600 DPI is better for small text.

```python
from PIL import Image

def get_dpi(path: str) -> tuple:
    """Return the DPI of an image, defaulting to (72, 72) if unset."""
    img = Image.open(path)
    dpi = img.info.get("dpi", (72, 72))
    return dpi

def set_dpi(input_path: str, output_path: str, target_dpi: int = 300):
    """Save an image with explicit DPI metadata."""
    img = Image.open(input_path)
    img.save(output_path, dpi=(target_dpi, target_dpi))

# Check and fix DPI
dpi = get_dpi("low_res_scan.png")
print(f"Current DPI: {dpi}")  # (72, 72)
set_dpi("low_res_scan.png", "high_res_scan.png", 300)
```

### 1.4 Color Spaces

```python
from PIL import Image

img = Image.open("document.png")
print(img.mode)  # 'RGB', 'CMYK', 'L' (grayscale), 'RGBA', '1' (binary)

# Convert between color spaces
rgb_img = img.convert("RGB")
gray_img = img.convert("L")        # Grayscale (8-bit, 0-255)
binary_img = img.convert("1")      # Binary (1-bit, black/white)
cmyk_img = img.convert("CMYK")     # For print workflows
```

| Mode   | Channels | Bits/Pixel | Use Case              |
|--------|----------|------------|-----------------------|
| `1`    | 1        | 1          | Binary OCR input      |
| `L`    | 1        | 8          | Grayscale processing  |
| `RGB`  | 3        | 24         | Standard color        |
| `RGBA` | 4        | 32         | Color + transparency  |
| `CMYK` | 4        | 32         | Print color space     |

---

## 2. Image Processing with Pillow

### 2.1 Opening, Saving, and Converting Formats

```python
from PIL import Image
from pathlib import Path

def convert_format(input_path: str, output_format: str) -> str:
    """Convert an image to a different format.

    Args:
        input_path: Path to source image.
        output_format: Target format extension (e.g., 'png', 'tiff').

    Returns:
        Path to the converted file.
    """
    img = Image.open(input_path)
    stem = Path(input_path).stem
    output_path = f"{stem}.{output_format}"

    # JPEG does not support alpha; flatten if needed
    if output_format.lower() in ("jpg", "jpeg") and img.mode == "RGBA":
        img = img.convert("RGB")

    img.save(output_path)
    return output_path

# Convert TIFF to PNG
convert_format("scanned_page.tiff", "png")

# Save multi-page TIFF
images = [Image.open(f"page_{i}.png") for i in range(1, 4)]
images[0].save(
    "multipage.tiff",
    save_all=True,
    append_images=images[1:],
    compression="tiff_lzw",
)
```

### 2.2 Resizing, Cropping, and Rotating

```python
from PIL import Image

img = Image.open("document.png")

# Resize -- use LANCZOS for high-quality downscaling
resized = img.resize((1200, 1600), Image.LANCZOS)

# Thumbnail -- preserves aspect ratio, fits within box
thumb = img.copy()
thumb.thumbnail((800, 800), Image.LANCZOS)

# Crop -- (left, upper, right, lower)
header = img.crop((0, 0, img.width, 200))

# Rotate -- expand=True prevents clipping corners
rotated = img.rotate(5, expand=True, fillcolor="white")

# Auto-orient based on EXIF (camera rotation)
from PIL import ImageOps
oriented = ImageOps.exif_transpose(img)
```

### 2.3 Color Adjustments

```python
from PIL import Image, ImageEnhance, ImageFilter

img = Image.open("dark_scan.jpg")

# Brightness (1.0 = original, >1 = brighter)
enhancer = ImageEnhance.Brightness(img)
bright = enhancer.enhance(1.5)

# Contrast (1.0 = original, >1 = higher contrast)
enhancer = ImageEnhance.Contrast(img)
high_contrast = enhancer.enhance(2.0)

# Sharpness
enhancer = ImageEnhance.Sharpness(img)
sharp = enhancer.enhance(2.0)

# Apply a sharpen filter
sharpened = img.filter(ImageFilter.SHARPEN)

# Apply an unsharp mask for fine detail
unsharp = img.filter(ImageFilter.UnsharpMask(radius=2, percent=150, threshold=3))
```

### 2.4 Drawing Text and Shapes on Images

Useful for annotating OCR results or creating overlays.

```python
from PIL import Image, ImageDraw, ImageFont

img = Image.open("page.png")
draw = ImageDraw.Draw(img)

# Draw a rectangle around a detected text region
draw.rectangle([(50, 100), (400, 150)], outline="red", width=2)

# Draw text annotation
try:
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 16)
except OSError:
    font = ImageFont.load_default()

draw.text((50, 80), "Detected: Invoice #1234", fill="red", font=font)

# Draw a line
draw.line([(0, 200), (img.width, 200)], fill="blue", width=1)

img.save("annotated_page.png")
```

---

## 3. Image Preprocessing for OCR

### 3.1 Why Preprocessing Matters

OCR engines (Tesseract in particular) expect **clean, high-contrast, correctly
oriented, sufficiently high-resolution** images. The preprocessing pipeline is
often more impactful than the choice of OCR engine.

```
Raw Scan Quality     Preprocessing     OCR Accuracy
-----------------    -------------     ------------
Perfect scan         None needed       95-99%
Slight skew          Deskew            90-97%
Low contrast         Binarize          85-95%
Noisy background     Denoise           80-92%
Low DPI (72-150)     Upscale           60-85%
All problems         Full pipeline     40-70% -> 85-95%
```

### 3.2 Grayscale Conversion

Always the first step -- reduces 3 channels to 1, simplifying downstream ops.

```python
from PIL import Image

def to_grayscale(img: Image.Image) -> Image.Image:
    """Convert an image to grayscale."""
    return img.convert("L")
```

### 3.3 Binarization (Thresholding)

Convert grayscale to pure black and white. This dramatically simplifies
character recognition.

```python
from PIL import Image
import numpy as np

def simple_threshold(img: Image.Image, threshold: int = 128) -> Image.Image:
    """Apply a fixed threshold to binarize a grayscale image."""
    gray = img.convert("L")
    return gray.point(lambda x: 255 if x > threshold else 0, mode="1")

def otsu_threshold(img: Image.Image) -> Image.Image:
    """Apply Otsu's method for automatic threshold selection (OpenCV)."""
    import cv2
    gray = np.array(img.convert("L"))
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return Image.fromarray(binary)

def adaptive_threshold(img: Image.Image, block_size: int = 11, c: int = 2) -> Image.Image:
    """Apply adaptive thresholding -- handles uneven lighting."""
    import cv2
    gray = np.array(img.convert("L"))
    binary = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY, block_size, c,
    )
    return Image.fromarray(binary)
```

**When to use which:**
- **Simple threshold**: Uniform lighting, clean scans.
- **Otsu**: Unknown optimal threshold, bimodal histogram.
- **Adaptive**: Shadows, uneven illumination, photographed documents.

### 3.4 Noise Removal

```python
import cv2
import numpy as np
from PIL import Image

def denoise_median(img: Image.Image, kernel_size: int = 3) -> Image.Image:
    """Remove salt-and-pepper noise with a median filter."""
    arr = np.array(img)
    denoised = cv2.medianBlur(arr, kernel_size)
    return Image.fromarray(denoised)

def denoise_gaussian(img: Image.Image, kernel_size: int = 5) -> Image.Image:
    """Remove Gaussian noise with a Gaussian blur."""
    arr = np.array(img)
    denoised = cv2.GaussianBlur(arr, (kernel_size, kernel_size), 0)
    return Image.fromarray(denoised)

def denoise_morphological(img: Image.Image) -> Image.Image:
    """Remove small specks using morphological opening."""
    arr = np.array(img.convert("L"))
    kernel = np.ones((2, 2), np.uint8)
    opened = cv2.morphologyEx(arr, cv2.MORPH_OPEN, kernel)
    return Image.fromarray(opened)

def remove_border_noise(img: Image.Image, border_px: int = 10) -> Image.Image:
    """Remove dark borders common in photocopied documents."""
    arr = np.array(img)
    h, w = arr.shape[:2]
    arr[:border_px, :] = 255
    arr[h - border_px:, :] = 255
    arr[:, :border_px] = 255
    arr[:, w - border_px:] = 255
    return Image.fromarray(arr)
```

### 3.5 Deskewing (Fixing Rotated Scans)

```python
import cv2
import numpy as np
from PIL import Image

def detect_skew_angle(img: Image.Image) -> float:
    """Detect the skew angle of a scanned document using Hough lines."""
    gray = np.array(img.convert("L"))
    edges = cv2.Canny(gray, 50, 150, apertureSize=3)
    lines = cv2.HoughLinesP(
        edges, 1, np.pi / 180, threshold=100,
        minLineLength=gray.shape[1] // 4, maxLineGap=10,
    )
    if lines is None:
        return 0.0

    angles = []
    for line in lines:
        x1, y1, x2, y2 = line[0]
        angle = np.degrees(np.arctan2(y2 - y1, x2 - x1))
        angles.append(angle)

    # Filter to near-horizontal lines
    filtered = [a for a in angles if -10 < a < 10]
    if not filtered:
        return 0.0
    return float(np.median(filtered))

def deskew(img: Image.Image) -> Image.Image:
    """Automatically deskew a scanned document."""
    angle = detect_skew_angle(img)
    if abs(angle) < 0.1:
        return img
    return img.rotate(angle, expand=True, fillcolor="white")
```

### 3.6 DPI Upscaling

```python
from PIL import Image

def upscale_for_ocr(img: Image.Image, target_dpi: int = 300) -> Image.Image:
    """Upscale an image to meet minimum DPI for OCR.

    Assumes the image DPI is stored in metadata.
    Falls back to 72 DPI if not found.
    """
    current_dpi = img.info.get("dpi", (72, 72))
    x_dpi = current_dpi[0] if isinstance(current_dpi[0], (int, float)) else 72

    if x_dpi >= target_dpi:
        return img

    scale = target_dpi / x_dpi
    new_size = (int(img.width * scale), int(img.height * scale))
    upscaled = img.resize(new_size, Image.LANCZOS)
    upscaled.info["dpi"] = (target_dpi, target_dpi)
    return upscaled
```

### 3.7 Full Preprocessing Pipeline

```python
from PIL import Image

def preprocess_for_ocr(
    path: str,
    target_dpi: int = 300,
    use_adaptive: bool = True,
) -> Image.Image:
    """Full preprocessing pipeline for OCR.

    Steps: open -> orient -> upscale -> grayscale -> denoise ->
           binarize -> deskew
    """
    from PIL import ImageOps

    img = Image.open(path)

    # Step 1: Auto-orient based on EXIF
    img = ImageOps.exif_transpose(img)

    # Step 2: Upscale to target DPI
    img = upscale_for_ocr(img, target_dpi)

    # Step 3: Convert to grayscale
    img = img.convert("L")

    # Step 4: Denoise
    img = denoise_median(img, kernel_size=3)

    # Step 5: Binarize
    if use_adaptive:
        img = adaptive_threshold(img)
    else:
        img = otsu_threshold(img)

    # Step 6: Deskew
    img = deskew(img)

    return img
```

---

## 4. Tesseract OCR

Tesseract is the most widely used open-source OCR engine. Originally developed
by HP, now maintained by Google. Version 4+ includes an LSTM-based neural
network engine alongside the legacy pattern-matching engine.

### 4.1 Installation

```bash
# macOS
brew install tesseract tesseract-lang

# Ubuntu / Debian
sudo apt-get install tesseract-ocr tesseract-ocr-chi-sim tesseract-ocr-fra

# Python wrapper
pip install pytesseract Pillow
```

### 4.2 Basic Text Extraction

```python
import pytesseract
from PIL import Image

img = Image.open("document.png")
text = pytesseract.image_to_string(img)
print(text)

# Specify language
text_zh = pytesseract.image_to_string(img, lang="chi_sim")  # Simplified Chinese
text_multi = pytesseract.image_to_string(img, lang="eng+fra")  # English + French
```

### 4.3 Page Segmentation Modes (PSM)

The PSM tells Tesseract how to interpret the layout of the image.

| PSM | Description                                   | Use Case                     |
|-----|-----------------------------------------------|------------------------------|
| 0   | Orientation and script detection only          | Detecting rotation           |
| 1   | Automatic with OSD                             | General documents            |
| 3   | Fully automatic (default)                      | Most documents               |
| 4   | Assume single column of variable-sized text    | Single-column articles       |
| 6   | Assume a single uniform block of text          | Cropped text regions         |
| 7   | Treat the image as a single text line          | Single lines, captions       |
| 8   | Treat the image as a single word               | License plates, labels       |
| 9   | Treat the image as a single word in a circle   | Circular stamps              |
| 10  | Treat the image as a single character          | CAPTCHA characters           |
| 11  | Sparse text -- find as much text as possible   | Mixed layout, forms          |
| 12  | Sparse text with OSD                           | Rotated sparse text          |
| 13  | Raw line -- treat as single line, no hacks     | Raw neural network mode      |

```python
import pytesseract
from PIL import Image

img = Image.open("receipt.png")

# Single column (receipts, narrow documents)
text = pytesseract.image_to_string(img, config="--psm 4")

# Single line (cropped text strip)
line_img = Image.open("single_line.png")
text = pytesseract.image_to_string(line_img, config="--psm 7")

# Sparse text (forms with scattered fields)
form_img = Image.open("form.png")
text = pytesseract.image_to_string(form_img, config="--psm 11")
```

### 4.4 OCR Engine Modes (OEM)

| OEM | Description                            |
|-----|----------------------------------------|
| 0   | Legacy engine only                     |
| 1   | LSTM neural network only               |
| 2   | Legacy + LSTM                          |
| 3   | Default (best available)               |

```python
# Use LSTM engine explicitly
text = pytesseract.image_to_string(img, config="--oem 1 --psm 3")
```

### 4.5 Confidence Scores

```python
import pytesseract
from PIL import Image
import pandas as pd

img = Image.open("document.png")

# Get word-level data with confidence scores
data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DATAFRAME)

# Filter to actual words (not empty text)
words = data[data["text"].notna() & (data["text"].str.strip() != "")]
print(words[["text", "conf", "left", "top", "width", "height"]])

# Flag low-confidence words
low_conf = words[words["conf"] < 60]
if not low_conf.empty:
    print(f"\nWARNING: {len(low_conf)} low-confidence words detected:")
    print(low_conf[["text", "conf"]].to_string(index=False))

# Overall confidence
avg_confidence = words["conf"].mean()
print(f"\nAverage confidence: {avg_confidence:.1f}%")
```

### 4.6 Word-Level and Character-Level Output

```python
import pytesseract
from PIL import Image

img = Image.open("document.png")

# Word-level bounding boxes
boxes = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)

for i, word in enumerate(boxes["text"]):
    if word.strip():
        x, y, w, h = (
            boxes["left"][i],
            boxes["top"][i],
            boxes["width"][i],
            boxes["height"][i],
        )
        conf = boxes["conf"][i]
        print(f"'{word}' at ({x},{y},{w},{h}) conf={conf}")

# Character-level bounding boxes
char_boxes = pytesseract.image_to_boxes(img)
for line in char_boxes.strip().split("\n"):
    parts = line.split()
    char, x1, y1, x2, y2 = parts[0], *map(int, parts[1:5])
    print(f"Character '{char}' at ({x1},{y1})->({x2},{y2})")
```

### 4.7 HOCR Output for Position Data

HOCR is an HTML-based format that embeds OCR results with bounding box
coordinates, enabling precise text positioning.

```python
import pytesseract
from PIL import Image
from bs4 import BeautifulSoup

img = Image.open("document.png")

# Get HOCR output
hocr = pytesseract.image_to_pdf_or_hocr(img, extension="hocr")
hocr_str = hocr.decode("utf-8")

# Parse with BeautifulSoup
soup = BeautifulSoup(hocr_str, "html.parser")

# Extract words with bounding boxes
for word_span in soup.find_all("span", class_="ocrx_word"):
    text = word_span.get_text()
    title = word_span.get("title", "")
    # title looks like: "bbox 100 200 300 250; x_wconf 95"
    parts = title.split(";")
    bbox_str = parts[0].replace("bbox ", "")
    coords = list(map(int, bbox_str.split()))
    conf_str = parts[1].strip().replace("x_wconf ", "") if len(parts) > 1 else "0"

    print(f"'{text}' bbox={coords} conf={conf_str}")
```

### 4.8 Generating Searchable PDFs

```python
import pytesseract
from PIL import Image

img = Image.open("scanned_page.png")

# Generate a searchable PDF with an invisible text layer
pdf_bytes = pytesseract.image_to_pdf_or_hocr(img, extension="pdf")

with open("searchable.pdf", "wb") as f:
    f.write(pdf_bytes)
```

---

## 5. EasyOCR

EasyOCR is a deep-learning-based OCR library that supports 80+ languages and
can leverage GPU acceleration. It often outperforms Tesseract on noisy,
stylized, or handwritten text.

### 5.1 Installation and Basic Usage

```bash
pip install easyocr
```

```python
import easyocr

# Initialize reader (downloads models on first run)
# gpu=True requires CUDA-compatible GPU
reader = easyocr.Reader(["en"], gpu=False)

# Basic text extraction
results = reader.readtext("document.png")

for bbox, text, confidence in results:
    print(f"Text: '{text}' | Confidence: {confidence:.2f}")
    print(f"  Bounding box: {bbox}")

# Output:
# Text: 'Invoice #1234' | Confidence: 0.97
#   Bounding box: [[50, 100], [400, 100], [400, 140], [50, 140]]
```

### 5.2 Multi-Language Support

```python
import easyocr

# Chinese + English
reader = easyocr.Reader(["ch_sim", "en"])
results = reader.readtext("chinese_doc.png")

# Japanese + English
reader = easyocr.Reader(["ja", "en"])
results = reader.readtext("japanese_doc.png")

# Extract just the text
texts = reader.readtext("document.png", detail=0)
full_text = "\n".join(texts)
print(full_text)
```

### 5.3 Advanced Configuration

```python
import easyocr

reader = easyocr.Reader(["en"])

results = reader.readtext(
    "document.png",
    decoder="beamsearch",         # 'greedy', 'beamsearch', 'wordbeamsearch'
    beamWidth=5,                  # Beam width for beam search
    batch_size=4,                 # Batch size for GPU processing
    contrast_ths=0.1,             # Contrast threshold for text detection
    adjust_contrast=0.5,          # Auto-adjust contrast
    text_threshold=0.7,           # Text confidence threshold
    low_text=0.4,                 # Low text bound
    paragraph=True,               # Merge results into paragraphs
    min_size=10,                  # Minimum text size in pixels
    rotation_info=[90, 180, 270], # Try rotated versions
)
```

### 5.4 Tesseract vs. EasyOCR Comparison

| Feature           | Tesseract           | EasyOCR              |
|-------------------|---------------------|----------------------|
| Engine            | LSTM + legacy       | CRAFT + CRNN (DL)    |
| Languages         | 100+                | 80+                  |
| GPU support       | No                  | Yes (CUDA)           |
| Speed (CPU)       | Fast                | Slower               |
| Speed (GPU)       | N/A                 | Very fast            |
| Handwriting       | Poor                | Moderate             |
| Noisy images      | Needs preprocessing | More robust          |
| Bounding boxes    | Yes (HOCR/data)     | Yes (native)         |
| Install size      | Small               | Large (DL models)    |
| Batch processing  | Manual              | Built-in batching    |

**Recommendation**: Use Tesseract for clean, well-preprocessed documents.
Use EasyOCR for noisy images, mixed languages, or when GPU is available.

---

## 6. OCRmyPDF

OCRmyPDF adds an invisible OCR text layer to scanned PDF files, making them
searchable and copyable while preserving the original scan quality.

### 6.1 Installation

```bash
# System dependencies
brew install tesseract ghostscript  # macOS
# sudo apt install tesseract-ocr ghostscript  # Ubuntu

pip install ocrmypdf
```

### 6.2 Command-Line Usage

```bash
# Basic: make a scanned PDF searchable
ocrmypdf input.pdf output.pdf

# Specify language
ocrmypdf -l eng+fra input.pdf output.pdf

# Skip pages that already have text
ocrmypdf --skip-text input.pdf output.pdf

# Force re-OCR all pages
ocrmypdf --force-ocr input.pdf output.pdf

# Clean up before OCR (removes noise, straightens)
ocrmypdf --clean input.pdf output.pdf

# Deskew pages
ocrmypdf --deskew input.pdf output.pdf

# Optimize output file size
ocrmypdf --optimize 3 input.pdf output.pdf

# Rotate pages to correct orientation
ocrmypdf --rotate-pages input.pdf output.pdf
```

### 6.3 Python API

```python
import ocrmypdf

# Basic OCR
ocrmypdf.ocr(
    "scanned.pdf",
    "searchable.pdf",
    language="eng",
    skip_text=True,
    deskew=True,
    clean=True,
    optimize=2,
)
```

### 6.4 Batch Processing

```python
import ocrmypdf
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor, as_completed

def ocr_single_pdf(input_path: Path, output_dir: Path) -> dict:
    """OCR a single PDF file."""
    output_path = output_dir / input_path.name
    try:
        exit_code = ocrmypdf.ocr(
            str(input_path),
            str(output_path),
            language="eng",
            skip_text=True,
            deskew=True,
            optimize=2,
        )
        return {"file": input_path.name, "status": "success", "code": exit_code}
    except ocrmypdf.exceptions.PriorOcrFoundError:
        return {"file": input_path.name, "status": "skipped", "code": 0}
    except Exception as e:
        return {"file": input_path.name, "status": "error", "error": str(e)}

def batch_ocr(input_dir: str, output_dir: str, max_workers: int = 4):
    """OCR all PDFs in a directory using parallel processing."""
    input_path = Path(input_dir)
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    pdf_files = list(input_path.glob("*.pdf"))
    print(f"Found {len(pdf_files)} PDF files to process")

    results = []
    with ProcessPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(ocr_single_pdf, pdf, output_path): pdf
            for pdf in pdf_files
        }
        for future in as_completed(futures):
            result = future.result()
            results.append(result)
            print(f"  {result['file']}: {result['status']}")

    success = sum(1 for r in results if r["status"] == "success")
    print(f"\nCompleted: {success}/{len(pdf_files)} successful")
    return results

# Usage
batch_ocr("./scanned_pdfs/", "./searchable_pdfs/")
```

---

## 7. Table Detection in Images

Detecting tabular data in scanned documents is one of the hardest OCR
problems. Standard OCR gives you raw text; you need additional structure
detection to reconstruct rows, columns, and cells.

### 7.1 Preprocessing Strategies for Table OCR

```python
import cv2
import numpy as np
from PIL import Image

def detect_lines(img: Image.Image) -> tuple:
    """Detect horizontal and vertical lines in a scanned table."""
    gray = np.array(img.convert("L"))
    _, binary = cv2.threshold(gray, 128, 255, cv2.THRESH_BINARY_INV)

    # Detect horizontal lines
    h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (40, 1))
    h_lines = cv2.morphologyEx(binary, cv2.MORPH_OPEN, h_kernel)

    # Detect vertical lines
    v_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 40))
    v_lines = cv2.morphologyEx(binary, cv2.MORPH_OPEN, v_kernel)

    return h_lines, v_lines

def extract_cells(h_lines, v_lines):
    """Find cell bounding boxes from line intersections."""
    # Combine lines
    combined = cv2.add(h_lines, v_lines)

    # Find contours (cells)
    contours, _ = cv2.findContours(combined, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)

    cells = []
    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        # Filter out very small or very large regions
        if 20 < w < 1000 and 10 < h < 500:
            cells.append((x, y, w, h))

    # Sort cells: top-to-bottom, then left-to-right
    cells.sort(key=lambda c: (c[1] // 20, c[0]))
    return cells
```

### 7.2 img2table Library

`img2table` detects and extracts tables from images and PDFs, returning
structured data (DataFrames).

```bash
pip install img2table
```

```python
from img2table.document import Image as Img2TableImage
from img2table.ocr import TesseractOCR

# Initialize OCR engine
ocr = TesseractOCR(n_threads=4, lang="eng")

# Load the image
doc = Img2TableImage(src="table_scan.png")

# Extract tables
tables = doc.extract_tables(
    ocr=ocr,
    implicit_rows=True,     # Detect rows without explicit lines
    implicit_columns=True,  # Detect columns without explicit lines
    borderless_tables=True, # Detect tables without borders
    min_confidence=50,      # Minimum OCR confidence
)

# Each table is an ExtractedTable object
for i, table in enumerate(tables):
    print(f"\n--- Table {i + 1} ---")
    df = table.df
    print(df.to_string())

    # Save to CSV
    df.to_csv(f"table_{i + 1}.csv", index=False)
```

### 7.3 img2table with PDFs

```python
from img2table.document import PDF
from img2table.ocr import TesseractOCR

ocr = TesseractOCR(n_threads=4, lang="eng")

# Load a scanned PDF
pdf_doc = PDF(src="scanned_report.pdf", pages=[0, 1, 2])

# Extract tables from all specified pages
tables_by_page = pdf_doc.extract_tables(
    ocr=ocr,
    implicit_rows=True,
    borderless_tables=True,
)

# tables_by_page is a dict: {page_number: [ExtractedTable, ...]}
for page_num, tables in tables_by_page.items():
    print(f"\nPage {page_num}: {len(tables)} table(s) found")
    for j, table in enumerate(tables):
        print(table.df.to_string())
```

---

## 8. Worked Problems

### Problem 1: Receipt OCR Pipeline (Image to Structured Data)

Build a pipeline that takes a photograph of a receipt and extracts structured
fields: store name, date, line items (name, quantity, price), subtotal, tax,
and total.

```python
"""
Receipt OCR Pipeline
====================
Input:  Photograph of a receipt (JPEG/PNG)
Output: Structured dict with store name, date, items, totals
"""

import re
from dataclasses import dataclass, field
from PIL import Image, ImageOps, ImageEnhance
import pytesseract
import numpy as np
import cv2


@dataclass(frozen=True)
class LineItem:
    description: str
    quantity: int
    price: float


@dataclass(frozen=True)
class ReceiptData:
    store_name: str
    date: str
    items: tuple  # tuple of LineItem for immutability
    subtotal: float
    tax: float
    total: float
    raw_text: str


def preprocess_receipt(path: str) -> Image.Image:
    """Preprocess a receipt photo for OCR."""
    img = Image.open(path)

    # Auto-orient from EXIF
    img = ImageOps.exif_transpose(img)

    # Convert to grayscale
    img = img.convert("L")

    # Increase contrast (receipts are often faded)
    enhancer = ImageEnhance.Contrast(img)
    img = enhancer.enhance(2.0)

    # Increase sharpness
    enhancer = ImageEnhance.Sharpness(img)
    img = enhancer.enhance(2.0)

    # Adaptive threshold for uneven lighting
    arr = np.array(img)
    binary = cv2.adaptiveThreshold(
        arr, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY, 31, 10,
    )
    img = Image.fromarray(binary)

    # Upscale if small
    if img.width < 1000:
        scale = 1000 / img.width
        new_size = (int(img.width * scale), int(img.height * scale))
        img = img.resize(new_size, Image.LANCZOS)

    return img


def extract_text(img: Image.Image) -> str:
    """Run Tesseract OCR on the preprocessed receipt."""
    text = pytesseract.image_to_string(
        img,
        config="--psm 4 --oem 1",  # Single column, LSTM engine
    )
    return text


def parse_receipt(raw_text: str) -> ReceiptData:
    """Parse raw OCR text into structured receipt data."""
    lines = [line.strip() for line in raw_text.split("\n") if line.strip()]

    # Extract store name (usually first non-empty line)
    store_name = lines[0] if lines else "Unknown"

    # Extract date
    date_pattern = r"\d{1,2}[/-]\d{1,2}[/-]\d{2,4}"
    date = "Unknown"
    for line in lines:
        match = re.search(date_pattern, line)
        if match:
            date = match.group()
            break

    # Extract line items: look for lines with a price at the end
    item_pattern = r"^(.+?)\s+(\d+)\s+\$?(\d+\.\d{2})\s*$"
    simple_pattern = r"^(.+?)\s+\$?(\d+\.\d{2})\s*$"
    items = []
    for line in lines:
        match = re.match(item_pattern, line)
        if match:
            items.append(LineItem(
                description=match.group(1).strip(),
                quantity=int(match.group(2)),
                price=float(match.group(3)),
            ))
        else:
            match = re.match(simple_pattern, line)
            if match:
                desc = match.group(1).strip().upper()
                # Skip totals and tax lines
                if desc not in ("SUBTOTAL", "SUB TOTAL", "TAX", "TOTAL", "AMOUNT DUE"):
                    items.append(LineItem(
                        description=match.group(1).strip(),
                        quantity=1,
                        price=float(match.group(2)),
                    ))

    # Extract totals
    def find_amount(label: str) -> float:
        pattern = rf"{label}\s*:?\s*\$?(\d+\.\d{{2}})"
        for line in lines:
            match = re.search(pattern, line, re.IGNORECASE)
            if match:
                return float(match.group(1))
        return 0.0

    subtotal = find_amount("sub\s*total")
    tax = find_amount("tax")
    total = find_amount("total")

    return ReceiptData(
        store_name=store_name,
        date=date,
        items=tuple(items),
        subtotal=subtotal,
        tax=tax,
        total=total,
        raw_text=raw_text,
    )


def process_receipt(path: str) -> ReceiptData:
    """Full pipeline: image -> preprocessed -> OCR -> structured data."""
    img = preprocess_receipt(path)
    raw_text = extract_text(img)
    receipt = parse_receipt(raw_text)
    return receipt


# Usage
if __name__ == "__main__":
    receipt = process_receipt("receipt_photo.jpg")
    print(f"Store: {receipt.store_name}")
    print(f"Date:  {receipt.date}")
    print(f"\nItems:")
    for item in receipt.items:
        print(f"  {item.description:<30} x{item.quantity}  ${item.price:.2f}")
    print(f"\nSubtotal: ${receipt.subtotal:.2f}")
    print(f"Tax:      ${receipt.tax:.2f}")
    print(f"Total:    ${receipt.total:.2f}")
```

### Problem 2: Batch OCR for a Folder of Scanned Documents

Process an entire directory of scanned images, run OCR, compute confidence
metrics, and output text files alongside a summary report.

```python
"""
Batch OCR Pipeline
==================
Input:  Directory of scanned images (JPEG, PNG, TIFF)
Output: Text files + JSON summary report
"""

import json
import time
from dataclasses import dataclass, asdict
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor, as_completed

import pytesseract
from PIL import Image, ImageOps
import numpy as np
import cv2


@dataclass(frozen=True)
class OcrResult:
    filename: str
    text: str
    word_count: int
    avg_confidence: float
    low_confidence_words: int
    processing_time_seconds: float
    status: str
    error: str = ""


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".tiff", ".tif", ".bmp", ".webp"}


def preprocess_image(img: Image.Image) -> Image.Image:
    """Standard preprocessing for scanned documents."""
    img = ImageOps.exif_transpose(img)
    gray = np.array(img.convert("L"))

    # Otsu binarization
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    # Denoise
    denoised = cv2.medianBlur(binary, 3)

    return Image.fromarray(denoised)


def process_single_image(image_path: Path, output_dir: Path) -> OcrResult:
    """OCR a single image file and save the text output."""
    start_time = time.time()

    try:
        img = Image.open(image_path)
        processed = preprocess_image(img)

        # Get detailed OCR data
        data = pytesseract.image_to_data(
            processed,
            config="--psm 3 --oem 1",
            output_type=pytesseract.Output.DICT,
        )

        # Extract text
        words = []
        confidences = []
        for i, text in enumerate(data["text"]):
            if text.strip():
                words.append(text)
                confidences.append(int(data["conf"][i]))

        full_text = pytesseract.image_to_string(processed, config="--psm 3 --oem 1")

        # Save text file
        text_filename = image_path.stem + ".txt"
        text_path = output_dir / text_filename
        text_path.write_text(full_text, encoding="utf-8")

        avg_conf = np.mean(confidences) if confidences else 0.0
        low_conf_count = sum(1 for c in confidences if c < 60)
        elapsed = time.time() - start_time

        return OcrResult(
            filename=image_path.name,
            text=full_text[:500],  # Truncate for summary
            word_count=len(words),
            avg_confidence=round(float(avg_conf), 1),
            low_confidence_words=low_conf_count,
            processing_time_seconds=round(elapsed, 2),
            status="success",
        )

    except Exception as e:
        elapsed = time.time() - start_time
        return OcrResult(
            filename=image_path.name,
            text="",
            word_count=0,
            avg_confidence=0.0,
            low_confidence_words=0,
            processing_time_seconds=round(elapsed, 2),
            status="error",
            error=str(e),
        )


def batch_ocr_images(
    input_dir: str,
    output_dir: str,
    max_workers: int = 4,
) -> list:
    """Process all images in a directory with parallel OCR.

    Args:
        input_dir: Directory containing scanned images.
        output_dir: Directory for text output and report.
        max_workers: Number of parallel workers.

    Returns:
        List of OcrResult objects.
    """
    input_path = Path(input_dir)
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    image_files = sorted(
        f for f in input_path.iterdir()
        if f.suffix.lower() in IMAGE_EXTENSIONS
    )

    if not image_files:
        print(f"No image files found in {input_dir}")
        return []

    print(f"Processing {len(image_files)} images with {max_workers} workers...\n")

    results = []
    with ProcessPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(process_single_image, img_path, output_path): img_path
            for img_path in image_files
        }

        for future in as_completed(futures):
            result = future.result()
            results.append(result)
            status_icon = "OK" if result.status == "success" else "FAIL"
            print(
                f"  [{status_icon}] {result.filename}"
                f"  words={result.word_count}"
                f"  conf={result.avg_confidence}%"
                f"  time={result.processing_time_seconds}s"
            )

    # Sort by filename for consistent ordering
    results.sort(key=lambda r: r.filename)

    # Generate summary report
    report = {
        "total_files": len(results),
        "successful": sum(1 for r in results if r.status == "success"),
        "failed": sum(1 for r in results if r.status == "error"),
        "total_words": sum(r.word_count for r in results),
        "avg_confidence": round(
            np.mean([r.avg_confidence for r in results if r.status == "success"]),
            1,
        ),
        "total_low_confidence_words": sum(r.low_confidence_words for r in results),
        "total_processing_time": round(
            sum(r.processing_time_seconds for r in results), 2
        ),
        "files": [asdict(r) for r in results],
    }

    report_path = output_path / "ocr_report.json"
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"\nReport saved to {report_path}")
    print(f"Summary: {report['successful']}/{report['total_files']} successful, "
          f"{report['total_words']} total words, "
          f"{report['avg_confidence']}% avg confidence")

    return results


# Usage
if __name__ == "__main__":
    batch_ocr_images(
        input_dir="./scanned_documents/",
        output_dir="./ocr_output/",
        max_workers=4,
    )
```

---

## Appendix: Cheat Sheet

### Installation Quick Reference

```bash
# Core libraries
pip install Pillow pytesseract easyocr ocrmypdf img2table
pip install opencv-python numpy pandas beautifulsoup4

# System dependencies
brew install tesseract tesseract-lang ghostscript  # macOS
sudo apt install tesseract-ocr ghostscript         # Ubuntu
```

### Pillow One-Liners

```python
from PIL import Image, ImageOps, ImageEnhance

img = Image.open("doc.png")                          # Open
img.save("doc.jpg", quality=95)                      # Save as JPEG
img.convert("L")                                     # Grayscale
img.convert("1")                                     # Binary
img.resize((1200, 1600), Image.LANCZOS)              # Resize
img.crop((0, 0, 500, 200))                           # Crop
img.rotate(5, expand=True, fillcolor="white")        # Rotate
ImageOps.exif_transpose(img)                         # Fix EXIF rotation
ImageEnhance.Contrast(img).enhance(2.0)              # Boost contrast
ImageEnhance.Sharpness(img).enhance(2.0)             # Boost sharpness
img.info.get("dpi", (72, 72))                        # Read DPI
img.save("out.png", dpi=(300, 300))                  # Set DPI
```

### OpenCV Preprocessing One-Liners

```python
import cv2
import numpy as np

gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)                         # Grayscale
_, bw = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)  # Otsu
bw = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                           cv2.THRESH_BINARY, 11, 2)                 # Adaptive
denoised = cv2.medianBlur(gray, 3)                                   # Median denoise
denoised = cv2.GaussianBlur(gray, (5, 5), 0)                        # Gaussian denoise
opened = cv2.morphologyEx(bw, cv2.MORPH_OPEN, np.ones((2,2)))       # Remove specks
```

### Tesseract Quick Reference

```python
import pytesseract
from PIL import Image

img = Image.open("doc.png")

# Plain text
pytesseract.image_to_string(img)
pytesseract.image_to_string(img, lang="eng+fra")
pytesseract.image_to_string(img, config="--psm 4 --oem 1")

# Structured data
pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)       # Word boxes
pytesseract.image_to_data(img, output_type=pytesseract.Output.DATAFRAME)  # DataFrame
pytesseract.image_to_boxes(img)                                           # Char boxes
pytesseract.image_to_pdf_or_hocr(img, extension="hocr")                  # HOCR XML
pytesseract.image_to_pdf_or_hocr(img, extension="pdf")                   # Searchable PDF
pytesseract.image_to_osd(img)                                            # Orientation info
```

### EasyOCR Quick Reference

```python
import easyocr

reader = easyocr.Reader(["en"], gpu=False)

# Full results: [(bbox, text, confidence), ...]
results = reader.readtext("doc.png")

# Text only
texts = reader.readtext("doc.png", detail=0)

# With paragraphs
results = reader.readtext("doc.png", paragraph=True)
```

### OCRmyPDF Quick Reference

```bash
ocrmypdf input.pdf output.pdf                     # Basic
ocrmypdf -l eng+chi_sim input.pdf output.pdf      # Multi-language
ocrmypdf --skip-text input.pdf output.pdf         # Skip existing text
ocrmypdf --force-ocr input.pdf output.pdf         # Re-OCR everything
ocrmypdf --deskew --clean input.pdf output.pdf    # Preprocess
ocrmypdf --rotate-pages input.pdf output.pdf      # Auto-rotate
ocrmypdf --optimize 3 input.pdf output.pdf        # Max compression
```

```python
import ocrmypdf
ocrmypdf.ocr("in.pdf", "out.pdf", language="eng", deskew=True, skip_text=True)
```

### PSM Mode Decision Tree

```
What does your image contain?
|
+-- Full document page? ---------> PSM 3 (default) or PSM 1 (with OSD)
|
+-- Single column of text? ------> PSM 4
|
+-- Single text block? ----------> PSM 6
|
+-- Single line of text? --------> PSM 7
|
+-- Single word? -----------------> PSM 8
|
+-- Single character? ------------> PSM 10
|
+-- Scattered/sparse text? ------> PSM 11
|
+-- Need orientation detection? -> PSM 0
```

### Preprocessing Decision Guide

```
Image Problem             Solution                    Function
--------------------      -----------------------     ------------------
Color image               Grayscale conversion        img.convert("L")
Low contrast              Enhance contrast            ImageEnhance.Contrast
Uneven lighting           Adaptive threshold          cv2.adaptiveThreshold
Salt-and-pepper noise     Median filter               cv2.medianBlur
Gaussian noise            Gaussian blur               cv2.GaussianBlur
Small specks/dots         Morphological opening       cv2.morphologyEx
Skewed/rotated            Deskew via Hough lines      detect_skew_angle()
Low DPI (< 300)           Upscale with LANCZOS        img.resize()
Dark borders              Border removal              remove_border_noise()
Wrong EXIF orientation    Auto-orient                 ImageOps.exif_transpose
```

### Common Pitfalls and Fixes

| Problem                          | Cause                           | Fix                                       |
|----------------------------------|---------------------------------|-------------------------------------------|
| Garbled output                   | Low DPI or heavy compression    | Upscale to 300+ DPI, use PNG/TIFF         |
| Missing characters               | Over-aggressive binarization    | Adjust threshold, try adaptive            |
| Merged words                     | Low resolution                  | Upscale, increase spacing detection       |
| Wrong language detected          | Default to English              | Set `lang` parameter explicitly           |
| Rotated text not detected        | Wrong PSM mode                  | Use PSM 0 for OSD, then correct rotation  |
| Slow processing                  | Large images, no GPU            | Downscale to 300 DPI, use Tesseract       |
| Tables extracted as text soup    | No structure detection          | Use img2table or line detection first     |
| Confidence scores all -1         | Empty regions being scored      | Filter `conf > 0` and non-empty text      |
