#!/usr/bin/env python3
"""Generate the 1200x630 Open Graph image for social sharing and Google search results.

Usage:
    python3 scripts/generate-og-image.py

Requires: pip install Pillow
"""

from PIL import Image, ImageDraw, ImageFont
import os

W, H = 1200, 630
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.join(SCRIPT_DIR, "..", "public")

# --- Config (edit these) ---
NAME = "Yongjin Huang"
TITLE = "Software Engineer"
COMPANIES = "Shopee  ·  Huawei  ·  Tarro  ·  WildData"
ABOUT_LINE_1 = "Full-stack engineer passionate about distributed systems,"
ABOUT_LINE_2 = "cloud architecture, and building products that matter."
URL = "yongjinhuang.github.io"
SELFIE_FILE = "selfie.png"
OUTPUT_FILE = "og-image.png"

# Colors (dark slate theme with amber accent)
BG_COLOR = "#0f172a"
ACCENT_COLOR = "#f59e0b"
TEXT_COLOR = "white"
SUBTITLE_COLOR = "#94a3b8"
ABOUT_COLOR = "#cbd5e1"
URL_COLOR = "#64748b"


def load_font(size: int) -> ImageFont.FreeTypeFont:
    """Try system fonts, fall back to default."""
    font_paths = [
        "/System/Library/Fonts/Helvetica.ttc",  # macOS
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",  # Linux
        "C:/Windows/Fonts/arial.ttf",  # Windows
    ]
    for path in font_paths:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def main() -> None:
    img = Image.new("RGB", (W, H), BG_COLOR)
    draw = ImageDraw.Draw(img)

    # Accent bars
    draw.rectangle([(0, 0), (W, 6)], fill=ACCENT_COLOR)
    draw.rectangle([(0, H - 4), (W, H)], fill=ACCENT_COLOR)

    # Dot pattern decoration
    for i in range(0, W, 120):
        for j in range(80, H, 60):
            draw.ellipse([(i - 1, j - 1), (i + 1, j + 1)], fill=(255, 255, 255))

    # Load and crop selfie into a circle
    selfie_path = os.path.join(BASE, SELFIE_FILE)
    if os.path.exists(selfie_path):
        selfie = Image.open(selfie_path).convert("RGBA").resize((220, 220), Image.LANCZOS)
        mask = Image.new("L", (220, 220), 0)
        ImageDraw.Draw(mask).ellipse([(0, 0), (220, 220)], fill=255)

        # Accent ring around selfie
        cx, cy = 100, 190
        draw.ellipse([(cx - 3, cy - 3), (cx + 226, cy + 226)], fill=ACCENT_COLOR)
        draw.ellipse([(cx, cy), (cx + 220, cy + 220)], fill=BG_COLOR)
        img.paste(selfie, (cx, cy), mask)

    # Fonts
    font_name = load_font(52)
    font_title = load_font(28)
    font_about = load_font(20)
    font_url = load_font(18)

    tx = 370

    # Name
    draw.text((tx, 195), NAME, fill=TEXT_COLOR, font=font_name)

    # Job title
    draw.text((tx, 260), TITLE, fill=ACCENT_COLOR, font=font_title)

    # Companies
    draw.text((tx, 300), COMPANIES, fill=SUBTITLE_COLOR, font=font_about)

    # About me
    draw.text((tx, 365), ABOUT_LINE_1, fill=ABOUT_COLOR, font=font_about)
    draw.text((tx, 395), ABOUT_LINE_2, fill=ABOUT_COLOR, font=font_about)

    # URL
    draw.text((100, 560), URL, fill=URL_COLOR, font=font_url)

    # Save
    output_path = os.path.join(BASE, OUTPUT_FILE)
    img.save(output_path, "PNG", optimize=True)
    print(f"Created: {output_path} ({W}x{H})")


if __name__ == "__main__":
    main()
