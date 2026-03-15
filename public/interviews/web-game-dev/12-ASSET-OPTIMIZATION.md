# Asset Optimization for Web Games

## Table of Contents

1. [Why Size Matters](#1-why-size-matters)
2. [Image Optimization](#2-image-optimization)
3. [Audio Optimization](#3-audio-optimization)
4. [Code Optimization](#4-code-optimization)
5. [Base64 Encoding](#5-base64-encoding)
6. [Build Pipeline for Playable Ads](#6-build-pipeline-for-playable-ads)
7. [Measuring and Budgeting](#7-measuring-and-budgeting)
8. [Interview Questions](#8-interview-questions)

---

## 1. Why Size Matters

### The Hard Limits

Playable ads operate under strict size constraints that vary by ad network:

| Ad Network       | Max Size (Uncompressed) | Max Size (Compressed) | Notes                        |
|------------------|------------------------|-----------------------|------------------------------|
| TikTok           | 2 MB                   | 2 MB                  | Strictest limit              |
| Facebook/Meta    | 5 MB                   | 2 MB (gzip)           | Measures both                |
| Google Ads       | 5 MB                   | -                     | Single HTML file             |
| Unity Ads        | 5 MB                   | -                     | Can use MRAID               |
| IronSource       | 5 MB                   | -                     | DAPI integration             |
| AppLovin         | 5 MB                   | 5 MB                  | Single HTML or zip           |
| Mintegral        | 5 MB                   | -                     | Single HTML file             |
| Vungle/Liftoff   | 5 MB                   | -                     | ZIP allowed                  |

### Why These Limits Exist

```
User taps ad slot
    |
    v
Ad SDK requests creative from CDN
    |
    v
Creative downloads over mobile network (often 3G/4G)
    |
    v
WebView loads and renders creative
    |
    v
User interacts (15-30 seconds)
    |
    v
CTA → App Store
```

Key reasons for size limits:
- **Load time**: Users abandon if ad takes >2 seconds to load
- **Data costs**: Many users are on metered mobile data
- **Memory**: WebViews have limited memory (especially on low-end Android)
- **CDN costs**: Ad networks serve billions of impressions daily
- **Battery**: Larger downloads drain more battery

### The Size Budget Reality

A typical 5MB playable ad budget breakdown:

```
Total budget:     5,000 KB (5 MB)
├── HTML shell:       5 KB
├── CSS:             15 KB
├── JavaScript:     200 KB (minified)
├── Sprite atlas:  1,500 KB (base64 encoded)
├── Audio:          300 KB (base64 encoded)
├── Fonts:          100 KB (base64 or CSS)
├── Base64 overhead: ~33% of binary assets = ~600 KB
└── Remaining:    2,280 KB buffer
```

For TikTok's 2MB limit, you must be far more aggressive:

```
Total budget:     2,000 KB (2 MB)
├── HTML/CSS/JS:    150 KB
├── Sprites:        800 KB (heavily compressed before base64)
├── Audio:          100 KB (or procedural audio = 0 KB)
├── Base64 overhead: ~300 KB
└── Remaining:      650 KB buffer
```

---

## 2. Image Optimization

### Texture Compression Formats

GPU-compressed texture formats allow the GPU to decompress textures on the fly, saving both download size and GPU memory.

#### Format Comparison

| Format    | Platforms           | Compression Ratio | Quality    | Alpha Support |
|-----------|--------------------|--------------------|------------|---------------|
| ASTC      | iOS, modern Android | 4:1 to 36:1        | Excellent  | Yes           |
| ETC2      | OpenGL ES 3.0+     | 4:1 to 6:1        | Good       | Yes           |
| PVRTC     | iOS (older)        | 8:1                | Fair       | Yes           |
| S3TC/DXT  | Desktop            | 4:1 to 6:1        | Good       | Yes (DXT5)    |
| Basis     | Universal          | Varies             | Good       | Yes           |

#### When to Use Each

```
Decision Tree for Texture Compression:

Is this a playable ad (single HTML file)?
├── YES → Use PNG/WebP/AVIF (base64 encoded)
│         GPU formats can't be easily base64'd for single-file delivery
└── NO → Is this for a specific platform?
    ├── iOS only → ASTC (preferred) or PVRTC (legacy)
    ├── Android only → ASTC (preferred) or ETC2 (fallback)
    ├── Desktop only → S3TC/DXT
    └── Cross-platform → Basis Universal (transcodes to native format)
```

#### Basis Universal Example

```typescript
// Loading Basis Universal textures in WebGL
async function loadBasisTexture(
  gl: WebGLRenderingContext,
  url: string
): Promise<WebGLTexture> {
  // Initialize the Basis transcoder (one-time)
  const { BasisFile, initializeBasis } = await import('./basis_transcoder');
  await initializeBasis();

  // Fetch the .basis file
  const response = await fetch(url);
  const data = new Uint8Array(await response.arrayBuffer());

  const basisFile = new BasisFile(data);
  if (!basisFile.startTranscoding()) {
    throw new Error('Failed to start Basis transcoding');
  }

  // Detect supported format
  const format = detectSupportedFormat(gl);
  //   ASTC  → gl.COMPRESSED_RGBA_ASTC_4x4_KHR
  //   ETC2  → gl.COMPRESSED_RGBA8_ETC2_EAC
  //   S3TC  → gl.COMPRESSED_RGBA_S3TC_DXT5_EXT
  //   None  → transcode to RGBA32 (fallback)

  const width = basisFile.getImageWidth(0, 0);
  const height = basisFile.getImageHeight(0, 0);
  const levels = basisFile.getNumLevels(0);

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);

  for (let level = 0; level < levels; level++) {
    const transcoded = basisFile.getImageTranscodedSizeInBytes(0, level, format);
    const dst = new Uint8Array(transcoded);
    basisFile.transcodeImage(dst, 0, level, format, 0, 0);
    gl.compressedTexImage2D(
      gl.TEXTURE_2D, level, format,
      basisFile.getImageWidth(0, level),
      basisFile.getImageHeight(0, level),
      0, dst
    );
  }

  basisFile.close();
  basisFile.delete();

  return texture;
}

function detectSupportedFormat(gl: WebGLRenderingContext): number {
  const astc = gl.getExtension('WEBGL_compressed_texture_astc');
  if (astc) return astc.COMPRESSED_RGBA_ASTC_4x4_KHR;

  const etc2 = gl.getExtension('WEBGL_compressed_texture_etc');
  if (etc2) return etc2.COMPRESSED_RGBA8_ETC2_EAC;

  const s3tc = gl.getExtension('WEBGL_compressed_texture_s3tc');
  if (s3tc) return s3tc.COMPRESSED_RGBA_S3TC_DXT5_EXT;

  // Fallback to uncompressed RGBA
  return 0;
}
```

### WebP: The Sweet Spot

WebP is typically 30% smaller than equivalent PNG with near-identical quality.

```bash
# Convert PNG to WebP (lossy)
cwebp -q 80 input.png -o output.webp

# Convert PNG to WebP (lossless, still smaller than PNG)
cwebp -lossless input.png -o output.webp

# Batch convert all PNGs in a directory
for f in *.png; do
  cwebp -q 80 "$f" -o "${f%.png}.webp"
done
```

**Browser support**: 97%+ globally (all modern browsers). Safe for playable ads.

**Size comparison example**:
```
character_sprite.png  →  145 KB
character_sprite.webp →   98 KB  (32% smaller, lossy q=80)
character_sprite.webp →  112 KB  (23% smaller, lossless)
```

### AVIF: Maximum Compression

AVIF offers even better compression than WebP (40-50% smaller than PNG), but with caveats.

```bash
# Convert PNG to AVIF
avifenc --min 20 --max 30 input.png output.avif

# With specific speed/quality tradeoff
avifenc --speed 4 --min 25 --max 35 input.png output.avif
```

**Browser support**: ~92% (missing in older Safari, some Android WebViews). Use with fallback.

```typescript
// Feature detection for AVIF
function supportsAvif(): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.width === 1);
    img.onerror = () => resolve(false);
    // Tiny 1x1 AVIF
    img.src = 'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQ0MAAAAABNjb2xybmNseAACAAIAAYAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKBxgABnQEBQIGBwYHCAkICgoLCgsMDQwNDAsMDg==';
  });
}

// Load image with AVIF fallback
async function loadOptimalImage(
  avifSrc: string,
  webpSrc: string,
  pngSrc: string
): Promise<HTMLImageElement> {
  const avifSupported = await supportsAvif();
  const src = avifSupported ? avifSrc : webpSrc;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      // Final fallback to PNG
      const fallback = new Image();
      fallback.onload = () => resolve(fallback);
      fallback.onerror = reject;
      fallback.src = pngSrc;
    };
    img.src = src;
  });
}
```

### PNG Optimization

For playable ads, PNG is often the safest choice due to universal WebView support. Optimization is critical.

#### pngquant: Lossy PNG Compression

Reduces 24-bit PNGs to 8-bit (256 colors) with dithering. Dramatic size reduction.

```bash
# Basic usage (overwrites original)
pngquant --quality=65-80 --force --ext .png input.png

# Batch optimize with output directory
mkdir -p optimized
for f in *.png; do
  pngquant --quality=65-80 --output "optimized/$f" "$f"
done

# Maximum compression (lower quality)
pngquant --quality=45-65 --speed 1 --force --ext .png input.png
```

**Typical results**:
```
Before: game_sprites.png   → 850 KB (32-bit RGBA)
After:  game_sprites.png   → 210 KB (8-bit, quality 65-80)
Savings: 75%
```

#### optipng: Lossless PNG Compression

```bash
# Optimize with maximum compression
optipng -o7 input.png

# Batch optimize
find . -name "*.png" -exec optipng -o5 {} \;
```

#### Reducing Color Depth

```bash
# Reduce to 8-bit with ImageMagick
convert input.png -colors 256 PNG8:output.png

# Reduce to specific palette size
convert input.png -colors 64 PNG8:output.png
```

#### Pipeline: Combine Tools for Maximum Compression

```bash
#!/bin/bash
# optimize-png.sh - Maximum PNG compression pipeline

INPUT=$1
OUTPUT=$2

# Step 1: Reduce color depth (lossy)
pngquant --quality=60-80 --output /tmp/step1.png "$INPUT"

# Step 2: Lossless compression
optipng -o7 /tmp/step1.png -out /tmp/step2.png

# Step 3: Strip metadata
pngstrip /tmp/step2.png "$OUTPUT" 2>/dev/null || cp /tmp/step2.png "$OUTPUT"

# Report savings
ORIG_SIZE=$(stat -f%z "$INPUT")
NEW_SIZE=$(stat -f%z "$OUTPUT")
SAVINGS=$(( (ORIG_SIZE - NEW_SIZE) * 100 / ORIG_SIZE ))
echo "$INPUT: ${ORIG_SIZE}B → ${NEW_SIZE}B (${SAVINGS}% savings)"
```

### JPEG for Non-Transparent Textures

JPEG is excellent for photographic textures (backgrounds, environment art) that don't need alpha.

```bash
# Optimize JPEG with mozjpeg (superior compression)
cjpeg -quality 75 -progressive input.png > output.jpg

# Convert with ImageMagick
convert input.png -quality 75 -sampling-factor 4:2:0 output.jpg

# Strip EXIF and optimize
jpegtran -copy none -progressive -optimize input.jpg > output.jpg
```

**Quality guidelines**:
- 85-95: High quality, barely noticeable loss
- 70-85: Good for backgrounds, game textures
- 50-70: Acceptable for blurred backgrounds, thumbnails
- <50: Visible artifacts, avoid

### SVG for Vector Graphics

SVG is perfect for UI elements, icons, and simple shapes. Infinitely scalable, tiny file size.

```xml
<!-- Before optimization: 2.4 KB -->
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     viewBox="0 0 100 100" width="100" height="100">
  <defs>
    <style type="text/css">
      .cls-1 { fill: #ff6b6b; }
    </style>
  </defs>
  <g id="Layer_1" data-name="Layer 1">
    <circle class="cls-1" cx="50.00000" cy="50.00000" r="40.00000"/>
  </g>
</svg>

<!-- After SVGO optimization: 0.2 KB -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle fill="#ff6b6b" cx="50" cy="50" r="40"/>
</svg>
```

#### SVGO Configuration

```javascript
// svgo.config.js
module.exports = {
  multipass: true,
  plugins: [
    'preset-default',
    'removeDimensions',
    'removeOffCanvasPaths',
    {
      name: 'removeAttrs',
      params: { attrs: ['data-name'] }
    },
    {
      name: 'convertPathData',
      params: {
        floatPrecision: 2,
        transformPrecision: 2
      }
    }
  ]
};
```

```bash
# Run SVGO
npx svgo input.svg -o output.svg --config svgo.config.js

# Batch optimize
npx svgo -f ./icons/ -o ./icons-optimized/
```

### Sprite Sheet Packing

Sprite sheets combine multiple images into a single texture, reducing HTTP requests and draw calls.

#### MaxRects Algorithm

The MaxRects bin packing algorithm efficiently places rectangles into a fixed-size container.

```typescript
interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface SpriteFrame {
  readonly name: string;
  readonly frame: Rect;
  readonly trimmed: boolean;
  readonly sourceSize: { readonly width: number; readonly height: number };
}

class MaxRectsPacker {
  private readonly width: number;
  private readonly height: number;
  private readonly padding: number;
  private freeRects: ReadonlyArray<Rect>;
  private readonly usedRects: ReadonlyArray<Rect>;

  constructor(width: number, height: number, padding: number = 1) {
    this.width = width;
    this.height = height;
    this.padding = padding;
    this.freeRects = [{ x: 0, y: 0, width, height }];
    this.usedRects = [];
  }

  insert(rectWidth: number, rectHeight: number): Rect | null {
    const w = rectWidth + this.padding * 2;
    const h = rectHeight + this.padding * 2;

    // Find best position using Best Short Side Fit heuristic
    let bestScore = Infinity;
    let bestRect: Rect | null = null;
    let bestIndex = -1;

    for (let i = 0; i < this.freeRects.length; i++) {
      const free = this.freeRects[i];
      if (w <= free.width && h <= free.height) {
        const leftover = Math.min(free.width - w, free.height - h);
        if (leftover < bestScore) {
          bestScore = leftover;
          bestRect = {
            x: free.x + this.padding,
            y: free.y + this.padding,
            width: rectWidth,
            height: rectHeight
          };
          bestIndex = i;
        }
      }
    }

    if (bestRect === null) return null;

    // Split the free rectangle
    this.splitFreeRect(bestIndex, {
      x: bestRect.x - this.padding,
      y: bestRect.y - this.padding,
      width: w,
      height: h
    });

    return bestRect;
  }

  private splitFreeRect(index: number, used: Rect): void {
    const free = this.freeRects[index];
    const newFreeRects: Rect[] = [];

    // Right remainder
    if (used.x + used.width < free.x + free.width) {
      newFreeRects.push({
        x: used.x + used.width,
        y: free.y,
        width: free.x + free.width - used.x - used.width,
        height: free.height
      });
    }

    // Bottom remainder
    if (used.y + used.height < free.y + free.height) {
      newFreeRects.push({
        x: free.x,
        y: used.y + used.height,
        width: free.width,
        height: free.y + free.height - used.y - used.height
      });
    }

    // Remove used free rect and add new ones (immutable)
    this.freeRects = [
      ...this.freeRects.slice(0, index),
      ...this.freeRects.slice(index + 1),
      ...newFreeRects
    ];
  }
}
```

#### Sprite Sheet Tools

| Tool             | Type       | Output Format      | Notes                       |
|------------------|-----------|--------------------|-----------------------------|
| TexturePacker    | Commercial | JSON + PNG          | Industry standard, many features |
| free-tex-packer  | Free       | JSON + PNG          | Open source alternative     |
| Shoebox          | Free       | JSON + PNG          | Adobe AIR based             |
| spritesmith      | npm        | JSON + PNG          | Node.js, scriptable         |

#### Important Settings

```
Padding:    1-2px (prevents texture bleeding from adjacent sprites)
Extrude:    1px (duplicates edge pixels, prevents bleeding in mipmapped textures)
Trim:       ON (removes transparent borders, saves atlas space)
Max Size:   2048x2048 (safe for all mobile GPUs)
POT:        ON if WebGL mipmaps needed
```

### Texture Atlas Size Limits

```
Device Tier           Max Texture Size    Recommended Atlas Size
─────────────────────────────────────────────────────────────────
Low-end Android       2048 x 2048         1024 x 1024
Mid-range devices     4096 x 4096         2048 x 2048
Flagship / Desktop    8192 x 8192         4096 x 4096 max
```

```typescript
// Query max texture size at runtime
function getMaxTextureSize(gl: WebGLRenderingContext): number {
  return gl.getParameter(gl.MAX_TEXTURE_SIZE);
}

// Choose atlas size based on device capability
function chooseAtlasSize(gl: WebGLRenderingContext): number {
  const maxSize = getMaxTextureSize(gl);
  // Use at most half of max to be safe
  return Math.min(2048, maxSize / 2);
}
```

### Power-of-Two Textures

WebGL requires power-of-two (POT) textures for mipmaps and certain wrap modes.

```
POT sizes: 1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096

If texture is NOT power-of-two:
  - No mipmaps (gl.LINEAR only, no gl.LINEAR_MIPMAP_LINEAR)
  - Wrap mode must be gl.CLAMP_TO_EDGE (no gl.REPEAT or gl.MIRRORED_REPEAT)
```

```typescript
function isPowerOfTwo(n: number): boolean {
  return (n & (n - 1)) === 0 && n > 0;
}

function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

// Resize canvas to POT if needed
function ensurePOT(image: HTMLImageElement): HTMLCanvasElement {
  const w = nextPowerOfTwo(image.width);
  const h = nextPowerOfTwo(image.height);

  if (w === image.width && h === image.height) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    return canvas;
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  // Draw image at top-left, leaving padding at right/bottom
  ctx.drawImage(image, 0, 0);
  return canvas;
}
```

---

## 3. Audio Optimization

### Format Comparison

| Format | Compression | Quality/Size  | Support           | Best For          |
|--------|------------|---------------|-------------------|-------------------|
| MP3    | Lossy      | Good          | Universal         | Music, general    |
| OGG    | Lossy      | Better        | All except old iOS| SFX, music        |
| AAC    | Lossy      | Best per byte | iOS native, most  | iOS-targeted      |
| WAV    | None       | Perfect       | Universal         | Never in prod     |
| OPUS   | Lossy      | Excellent     | Modern browsers   | Future-proof      |

### Sample Rate Reduction

Human hearing tops out around 20kHz. CD quality is 44100Hz (Nyquist theorem: captures up to 22050Hz). For game SFX, we can go much lower.

```bash
# Convert to 22050Hz mono MP3 (great for SFX)
ffmpeg -i explosion.wav -ar 22050 -ac 1 -b:a 64k explosion.mp3

# Even smaller: 11025Hz (fine for short blips/clicks)
ffmpeg -i click.wav -ar 11025 -ac 1 -b:a 32k click.mp3

# Convert to OGG Vorbis
ffmpeg -i music.wav -ar 22050 -ac 1 -q:a 3 music.ogg

# Batch convert entire SFX directory
for f in sfx/*.wav; do
  ffmpeg -i "$f" -ar 22050 -ac 1 -b:a 64k "sfx_optimized/$(basename "${f%.wav}.mp3")" -y
done
```

**Size comparison for a 2-second explosion sound**:
```
explosion.wav       →  352 KB (44100Hz, stereo, 16-bit)
explosion_44k.mp3   →   32 KB (44100Hz, stereo, 128kbps)
explosion_22k.mp3   →   16 KB (22050Hz, mono, 64kbps)
explosion_11k.mp3   →    8 KB (11025Hz, mono, 32kbps)
```

### Mono vs Stereo

**Rule**: SFX should always be mono. Music can be stereo if budget allows.

```bash
# Convert stereo to mono
ffmpeg -i stereo_sfx.mp3 -ac 1 mono_sfx.mp3
```

Why mono for SFX:
- 50% smaller file size
- Most mobile devices have single or closely-spaced speakers
- Game engine can apply stereo panning at runtime if needed

### Short Loops and Trimming

```bash
# Trim silence from start and end
ffmpeg -i music_loop.mp3 -af "silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse" trimmed.mp3

# Fade in/out for seamless loop (apply 100ms crossfade at boundaries)
ffmpeg -i loop.mp3 -af "afade=t=in:st=0:d=0.1,afade=t=out:st=2.9:d=0.1" faded_loop.mp3

# Extract specific segment (start at 1s, duration 3s)
ffmpeg -i long_music.mp3 -ss 1 -t 3 -c:a libmp3lame -b:a 64k short_loop.mp3
```

### Procedural Audio with Web Audio API

Procedural audio generates sounds entirely in code, adding zero bytes to your asset budget. This is a game-changer for playable ads.

```typescript
// Procedural sound effects using Web Audio API
class ProceduralAudio {
  private readonly ctx: AudioContext;

  constructor() {
    this.ctx = new AudioContext();
  }

  // Ensure audio context is resumed (required after user interaction)
  async resume(): Promise<void> {
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  // Simple click/tap sound
  playClick(): void {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.frequency.setValueAtTime(800, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, this.ctx.currentTime + 0.05);

    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);

    osc.start(this.ctx.currentTime);
    osc.stop(this.ctx.currentTime + 0.05);
  }

  // Pop/bubble sound (good for match-3 games)
  playPop(): void {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, this.ctx.currentTime + 0.03);
    osc.frequency.exponentialRampToValueAtTime(200, this.ctx.currentTime + 0.1);

    gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);

    osc.start(this.ctx.currentTime);
    osc.stop(this.ctx.currentTime + 0.15);
  }

  // Explosion/boom sound
  playExplosion(): void {
    const duration = 0.5;
    const sampleRate = this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, sampleRate * duration, sampleRate);
    const data = buffer.getChannelData(0);

    // Generate noise with decay
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      const envelope = Math.exp(-t * 6); // Exponential decay
      data[i] = (Math.random() * 2 - 1) * envelope;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    // Low-pass filter for rumble effect
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2000, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.6, this.ctx.currentTime);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    source.start(this.ctx.currentTime);
  }

  // Coin/collect sound
  playCoin(): void {
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.ctx.destination);

    // Two tones in quick succession (classic coin sound)
    osc1.frequency.setValueAtTime(987, this.ctx.currentTime);  // B5
    osc2.frequency.setValueAtTime(1318, this.ctx.currentTime + 0.08); // E6

    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);

    osc1.start(this.ctx.currentTime);
    osc1.stop(this.ctx.currentTime + 0.08);
    osc2.start(this.ctx.currentTime + 0.08);
    osc2.stop(this.ctx.currentTime + 0.3);
  }

  // Swoosh/swipe sound
  playSwoosh(): void {
    const duration = 0.2;
    const sampleRate = this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, sampleRate * duration, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      const envelope = Math.sin(Math.PI * t / duration); // Rise and fall
      data[i] = (Math.random() * 2 - 1) * envelope * 0.3;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(3000, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(6000, this.ctx.currentTime + duration);
    filter.Q.value = 1;

    source.connect(filter);
    filter.connect(this.ctx.destination);
    source.start(this.ctx.currentTime);
  }

  // Victory/success jingle
  playVictory(): void {
    const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6
    const noteLength = 0.15;

    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime + i * noteLength);

      const start = this.ctx.currentTime + i * noteLength;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.2, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, start + noteLength);

      osc.start(start);
      osc.stop(start + noteLength);
    });
  }
}

// Usage
const audio = new ProceduralAudio();

// Must be called after user interaction (browser autoplay policy)
document.addEventListener('touchstart', async () => {
  await audio.resume();
  audio.playClick();
}, { once: true });
```

---

## 4. Code Optimization

### Tree Shaking

Tree shaking eliminates unused code from your bundle. It relies on ES module static analysis.

```typescript
// BAD: Imports entire library
import _ from 'lodash';  // ~70KB minified
const result = _.debounce(fn, 300);

// GOOD: Cherry-picked import (tree-shakeable)
import debounce from 'lodash/debounce';  // ~1KB
const result = debounce(fn, 300);

// BEST: Write your own for playable ads (zero dependency)
function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
```

### Dead Code Elimination

Bundlers remove unreachable code, but you must help them:

```typescript
// BAD: Dynamic import prevents tree shaking
const utils = require('./utils');

// GOOD: Static import enables tree shaking
import { calculateScore } from './utils';

// Mark side-effect-free for bundlers
// package.json: "sideEffects": false

// Use const enum for zero-cost abstractions (TypeScript)
const enum GameState {
  Loading = 0,
  Playing = 1,
  GameOver = 2
}
// Compiles to just numbers, no runtime object
```

### Minification Comparison

```bash
# Terser (most configurable)
npx terser src/game.js -c passes=3,dead_code,drop_console -m toplevel -o dist/game.min.js

# esbuild (fastest, good for development)
npx esbuild src/game.ts --bundle --minify --target=es2018 --outfile=dist/game.min.js

# For playable ads, esbuild is often the best choice:
npx esbuild src/main.ts \
  --bundle \
  --minify \
  --target=es2017 \
  --format=iife \
  --outfile=dist/game.js \
  --define:DEBUG=false
```

### Gzip vs Brotli

When ad networks serve your HTML file, they typically apply gzip compression. Understanding this affects optimization strategy.

```
Compression ratios (typical for JavaScript):

Original:    100 KB
Gzip:         30 KB (70% reduction)
Brotli:       25 KB (75% reduction)

Original:    100 KB of base64 data
Gzip:         75 KB (only 25% reduction - base64 compresses poorly!)
Brotli:       70 KB (30% reduction)
```

**Key insight**: Base64-encoded binary data compresses much worse than text. This means:
- Optimize assets BEFORE base64 encoding (compress images first, then base64)
- The 33% base64 overhead is partially recovered by gzip on text portions
- Focus optimization effort on raw asset size, not gzipped size

### Avoiding Large Libraries

```
Library               Size (min)     Alternative
─────────────────────────────────────────────────────
lodash                70 KB          Native JS / cherry-pick
moment.js             67 KB          Date API / dayjs (2KB)
jQuery                87 KB          Native DOM API
three.js              150 KB         Custom WebGL renderer
pixi.js               130 KB         Custom Canvas/WebGL
howler.js             10 KB          Web Audio API direct
gsap                  28 KB          Custom tween engine
```

For playable ads, every kilobyte counts. Write minimal implementations:

```typescript
// Instead of importing a tween library (28KB):
function tween(
  from: number,
  to: number,
  duration: number,
  easing: (t: number) => number,
  onUpdate: (value: number) => void,
  onComplete?: () => void
): void {
  const startTime = performance.now();
  const delta = to - from;

  function tick(now: number): void {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easedProgress = easing(progress);
    onUpdate(from + delta * easedProgress);

    if (progress < 1) {
      requestAnimationFrame(tick);
    } else if (onComplete) {
      onComplete();
    }
  }

  requestAnimationFrame(tick);
}

// Common easing functions
const ease = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => t * (2 - t),
  inOutQuad: (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  outBack: (t: number) => {
    const c = 1.70158;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  },
  outElastic: (t: number) => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t - 0.075) * (2 * Math.PI) / 0.3) + 1;
  },
  outBounce: (t: number) => {
    if (t < 1 / 2.75) return 7.5625 * t * t;
    if (t < 2 / 2.75) return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
    if (t < 2.5 / 2.75) return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
    return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
  }
} as const;
```

---

## 5. Base64 Encoding

### How It Works

Base64 converts binary data to ASCII text using 64 characters: `A-Z`, `a-z`, `0-9`, `+`, `/`, with `=` for padding.

```
Binary Input:  3 bytes = 24 bits
Base64 Output: 4 characters = 32 bits (24 bits of data)

Size increase: 4/3 = 33%

Example:
Binary (hex): 89 50 4E  (first 3 bytes of PNG header)
Binary:       10001001 01010000 01001110
Split 6-bit:  100010 010101 000001 001110
Base64 chars: i      V      B      O
```

### When to Use

```
Context               Use Base64?    Reason
─────────────────────────────────────────────────────────
Playable ad           YES            Single-file requirement
Regular web game      NO             Use separate files with HTTP/2
WebGL game            NO             Use fetch() for assets
Email HTML            YES            Inline images required
Data URLs in CSS      SOMETIMES      Small images only (<4KB)
```

### Data URI Format

```
data:[<mediatype>][;base64],<data>

Examples:
  data:image/png;base64,iVBORw0KGgo...
  data:image/webp;base64,UklGR...
  data:audio/mp3;base64,SUQzBA...
  data:audio/ogg;base64,T2dnUw...
  data:application/font-woff2;base64,d09G...
  data:image/svg+xml;base64,PHN2Zy...
  data:image/svg+xml,%3Csvg...  (URL-encoded SVG, often smaller than base64)
```

### Encoding in JavaScript

```typescript
// Browser: Convert blob/file to base64
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Node.js: Convert file to base64 data URI
import { readFileSync } from 'fs';
import { extname } from 'path';

function fileToDataUri(filePath: string): string {
  const data = readFileSync(filePath);
  const base64 = data.toString('base64');
  const mimeTypes: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.wav': 'audio/wav',
    '.woff2': 'font/woff2',
  };
  const ext = extname(filePath).toLowerCase();
  const mime = mimeTypes[ext] ?? 'application/octet-stream';
  return `data:${mime};base64,${base64}`;
}
```

### Optimization: Compress Before Encoding

```
WRONG ORDER:
  image.png (100KB) → base64 (133KB) → gzip (100KB)

CORRECT ORDER:
  image.png (100KB) → pngquant (30KB) → base64 (40KB) → gzip (35KB)

The 33% base64 overhead applies to whatever goes in.
Smaller input = smaller base64 output.
```

```bash
# Pipeline: optimize then encode
pngquant --quality=65-80 input.png -o /tmp/optimized.png
base64 -i /tmp/optimized.png | tr -d '\n' > /tmp/encoded.txt

# Measure the difference
echo "Original PNG base64: $(base64 -i input.png | wc -c) bytes"
echo "Optimized PNG base64: $(cat /tmp/encoded.txt | wc -c) bytes"
```

---

## 6. Build Pipeline for Playable Ads

### Overview

```
                    ASSET PIPELINE
                    ──────────────
Source Assets       Optimized Assets       Encoded Assets
─────────────       ────────────────       ──────────────
sprites/*.png  →  pngquant/optipng    →  base64 data URIs
audio/*.wav    →  ffmpeg (mp3/ogg)    →  base64 data URIs
icons/*.svg    →  svgo                →  inline SVG or base64
fonts/*.woff2  →  (already optimized) →  base64 data URIs

                    CODE PIPELINE
                    ─────────────
Source Code         Bundle              Final Output
───────────         ──────              ────────────
src/*.ts       →  esbuild/webpack  →  Single minified JS string
styles/*.css   →  cssnano          →  Inline <style> tag
index.html     →  html-minifier    →  Final single HTML file
                                        (< 2-5MB)
```

### Step-by-Step Build Pipeline

#### Step 1: Optimize Individual Assets

```javascript
// scripts/optimize-assets.mjs
import { execSync } from 'child_process';
import { readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

const ASSETS_DIR = './assets';
const OPTIMIZED_DIR = './assets-optimized';

function optimizeImages(): void {
  const images = readdirSync(join(ASSETS_DIR, 'images'));

  for (const file of images) {
    const input = join(ASSETS_DIR, 'images', file);
    const output = join(OPTIMIZED_DIR, 'images', file);
    const ext = extname(file).toLowerCase();

    if (ext === '.png') {
      execSync(`pngquant --quality=60-80 --output "${output}" "${input}" --force`);
      execSync(`optipng -o5 "${output}"`);
    } else if (ext === '.jpg' || ext === '.jpeg') {
      execSync(`cjpeg -quality 75 "${input}" > "${output}"`);
    } else if (ext === '.svg') {
      execSync(`npx svgo "${input}" -o "${output}"`);
    }

    const origSize = statSync(input).size;
    const newSize = statSync(output).size;
    const savings = ((1 - newSize / origSize) * 100).toFixed(1);
    console.log(`${file}: ${origSize}B → ${newSize}B (${savings}% saved)`);
  }
}

function optimizeAudio(): void {
  const audioFiles = readdirSync(join(ASSETS_DIR, 'audio'));

  for (const file of audioFiles) {
    const input = join(ASSETS_DIR, 'audio', file);
    const output = join(OPTIMIZED_DIR, 'audio', file.replace(/\.\w+$/, '.mp3'));

    execSync(`ffmpeg -i "${input}" -ar 22050 -ac 1 -b:a 64k "${output}" -y`);

    const origSize = statSync(input).size;
    const newSize = statSync(output).size;
    console.log(`${file}: ${origSize}B → ${newSize}B`);
  }
}

optimizeImages();
optimizeAudio();
```

#### Step 2: Bundle Code

```javascript
// esbuild.config.mjs
import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, extname } from 'path';

// Create asset loader plugin
const assetPlugin = {
  name: 'inline-assets',
  setup(build) {
    // Inline images as base64
    build.onLoad({ filter: /\.(png|jpg|webp|gif)$/ }, (args) => {
      const data = readFileSync(args.path);
      const base64 = data.toString('base64');
      const ext = extname(args.path).slice(1);
      const mimeTypes = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
      const dataUri = `data:${mimeTypes[ext]};base64,${base64}`;
      return { contents: `export default "${dataUri}"`, loader: 'js' };
    });

    // Inline audio as base64
    build.onLoad({ filter: /\.(mp3|ogg|wav)$/ }, (args) => {
      const data = readFileSync(args.path);
      const base64 = data.toString('base64');
      const ext = extname(args.path).slice(1);
      const mimeTypes = { mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav' };
      const dataUri = `data:${mimeTypes[ext]};base64,${base64}`;
      return { contents: `export default "${dataUri}"`, loader: 'js' };
    });
  }
};

await esbuild.build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  minify: true,
  target: 'es2017',
  format: 'iife',
  outfile: 'dist/game.js',
  plugins: [assetPlugin],
  define: {
    'process.env.NODE_ENV': '"production"'
  }
});
```

#### Step 3 & 4: Inline Everything into Single HTML

```javascript
// scripts/build-single-html.mjs
import { readFileSync, writeFileSync } from 'fs';

const gameJs = readFileSync('./dist/game.js', 'utf-8');
const gameCss = readFileSync('./dist/game.css', 'utf-8');

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<meta name="ad.size" content="width=320,height=480">
<style>${gameCss}</style>
</head>
<body>
<canvas id="game"></canvas>
<script>${gameJs}</script>
</body>
</html>`;

writeFileSync('./dist/playable.html', html);
```

#### Step 5: Minify Final HTML

```bash
npx html-minifier-terser \
  --collapse-whitespace \
  --remove-comments \
  --minify-css true \
  --minify-js true \
  dist/playable.html \
  -o dist/playable.min.html
```

#### Step 6: Size Check

```javascript
// scripts/check-size.mjs
import { statSync } from 'fs';
import { gzipSync } from 'zlib';
import { readFileSync } from 'fs';

const LIMITS = {
  tiktok: 2 * 1024 * 1024,      // 2 MB
  facebook: 5 * 1024 * 1024,     // 5 MB uncompressed
  facebook_gz: 2 * 1024 * 1024,  // 2 MB gzipped
  google: 5 * 1024 * 1024,       // 5 MB
  unity: 5 * 1024 * 1024,        // 5 MB
  ironsource: 5 * 1024 * 1024,   // 5 MB
};

const file = './dist/playable.min.html';
const content = readFileSync(file);
const rawSize = content.length;
const gzipSize = gzipSync(content).length;

console.log('\n=== SIZE REPORT ===');
console.log(`Raw:    ${(rawSize / 1024).toFixed(1)} KB (${(rawSize / 1024 / 1024).toFixed(2)} MB)`);
console.log(`Gzip:   ${(gzipSize / 1024).toFixed(1)} KB (${(gzipSize / 1024 / 1024).toFixed(2)} MB)`);
console.log('');

for (const [network, limit] of Object.entries(LIMITS)) {
  const size = network.endsWith('_gz') ? gzipSize : rawSize;
  const pass = size <= limit;
  const label = pass ? 'PASS' : 'FAIL';
  const limitMB = (limit / 1024 / 1024).toFixed(0);
  console.log(`  ${label}  ${network.padEnd(15)} ${(size / 1024 / 1024).toFixed(2)}MB / ${limitMB}MB`);
}
```

### Complete Build Script (package.json)

```json
{
  "scripts": {
    "build:assets": "node scripts/optimize-assets.mjs",
    "build:code": "node esbuild.config.mjs",
    "build:html": "node scripts/build-single-html.mjs",
    "build:minify": "npx html-minifier-terser --collapse-whitespace --remove-comments --minify-css true dist/playable.html -o dist/playable.min.html",
    "build:check": "node scripts/check-size.mjs",
    "build": "npm run build:assets && npm run build:code && npm run build:html && npm run build:minify && npm run build:check"
  }
}
```

### Webpack Plugin Alternative

```javascript
// webpack.config.js for playable ads
const HtmlWebpackPlugin = require('html-webpack-plugin');
const HtmlInlineScriptPlugin = require('html-inline-script-webpack-plugin');
const HTMLInlineCSSWebpackPlugin = require('html-inline-css-webpack-plugin').default;

module.exports = {
  entry: './src/main.ts',
  output: {
    filename: 'game.js',
    path: __dirname + '/dist'
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/
      },
      {
        test: /\.(png|jpg|gif|webp)$/i,
        type: 'asset/inline'  // Converts to base64 data URI
      },
      {
        test: /\.(mp3|ogg)$/i,
        type: 'asset/inline'
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/index.html',
      inject: 'body',
      minify: { collapseWhitespace: true, removeComments: true }
    }),
    new HtmlInlineScriptPlugin(),
    new HTMLInlineCSSWebpackPlugin()
  ],
  resolve: {
    extensions: ['.ts', '.js']
  },
  mode: 'production'
};
```

---

## 7. Measuring and Budgeting

### Asset Size Budget Template

```
PROJECT: [Game Name] Playable Ad
TARGET:  TikTok (2MB) / Facebook (5MB)
DATE:    [Date]

BUDGET BREAKDOWN
────────────────
Category          Budget    Actual    Status
──────────────────────────────────────────────
HTML shell         10 KB     8 KB    OK
CSS                20 KB    15 KB    OK
JavaScript        200 KB   180 KB    OK
Sprite atlas    1,000 KB   920 KB    OK
UI elements       200 KB   175 KB    OK
Audio             200 KB   150 KB    OK
Font              100 KB    85 KB    OK
──────────────────────────────────────────────
Subtotal        1,730 KB  1,533 KB
Base64 overhead   577 KB    511 KB   (33% of binary)
──────────────────────────────────────────────
TOTAL           2,307 KB  2,044 KB   OK (< 5MB)
Gzipped est.    1,600 KB  1,430 KB   OK (< 2MB)
```

### Chrome DevTools: Network Analysis

```
Steps to analyze asset sizes:

1. Open Chrome DevTools (F12)
2. Go to Network tab
3. Check "Disable cache"
4. Reload page
5. Sort by Size column
6. Check "Total" row at bottom

For playable ads (single HTML):
1. Drag the HTML file into Chrome
2. Open DevTools → Sources tab
3. Look at the file size
4. Or: DevTools → Network → select file → check "Content-Length"
```

### Coverage Tool

```
1. Chrome DevTools → three dots menu → More tools → Coverage
2. Click record, interact with game
3. See which CSS and JS code is actually used

Red bars = unused code (candidates for removal)
Blue bars = used code

Target: >80% code coverage
If <50%, you likely have unnecessary library code
```

### Custom Size Analysis Script

```typescript
// scripts/analyze-size.mjs
import { readFileSync } from 'fs';

const html = readFileSync('./dist/playable.min.html', 'utf-8');

// Count base64 data URIs
const base64Pattern = /data:([^;]+);base64,([A-Za-z0-9+/=]+)/g;
let totalBase64 = 0;
const assets: Array<{ type: string; size: number }> = [];
let match;

while ((match = base64Pattern.exec(html)) !== null) {
  const [, mimeType, data] = match;
  const bytes = Math.ceil(data.length * 3 / 4);
  totalBase64 += data.length;
  assets.push({ type: mimeType, size: bytes });
}

// Count script size
const scriptPattern = /<script[^>]*>([\s\S]*?)<\/script>/g;
let totalScript = 0;
while ((match = scriptPattern.exec(html)) !== null) {
  totalScript += match[1].length;
}

// Count style size
const stylePattern = /<style[^>]*>([\s\S]*?)<\/style>/g;
let totalStyle = 0;
while ((match = stylePattern.exec(html)) !== null) {
  totalStyle += match[1].length;
}

console.log('\n=== ASSET ANALYSIS ===');
console.log(`Total HTML size: ${(html.length / 1024).toFixed(1)} KB`);
console.log(`JavaScript:      ${(totalScript / 1024).toFixed(1)} KB`);
console.log(`CSS:             ${(totalStyle / 1024).toFixed(1)} KB`);
console.log(`Base64 data:     ${(totalBase64 / 1024).toFixed(1)} KB`);
console.log(`Other HTML:      ${((html.length - totalScript - totalStyle - totalBase64) / 1024).toFixed(1)} KB`);

console.log('\n=== EMBEDDED ASSETS ===');
const grouped: Record<string, { count: number; totalSize: number }> = {};
for (const asset of assets) {
  const key = asset.type;
  if (!grouped[key]) {
    grouped[key] = { count: 0, totalSize: 0 };
  }
  grouped[key] = {
    count: grouped[key].count + 1,
    totalSize: grouped[key].totalSize + asset.size
  };
}

for (const [type, info] of Object.entries(grouped)) {
  console.log(`  ${type}: ${info.count} files, ${(info.totalSize / 1024).toFixed(1)} KB (decoded)`);
}
```

---

## 8. Interview Questions

### Q1: You have a playable ad that's 6.2MB and needs to be under 5MB. Walk me through your optimization strategy.

**Answer:**

I'd approach this systematically, targeting the largest savings first:

**1. Identify the biggest offenders** (use the size analysis script):
- Run the asset analysis to see breakdown by category
- Usually sprites are the #1 culprit

**2. Image optimization** (typically saves 40-60%):
- Run pngquant on all PNGs (65-80 quality): often halves PNG size
- Consider WebP if the ad network supports it
- Reduce atlas size from 4096 to 2048 if possible
- Trim unused sprite sheet regions
- Check for duplicate or unnecessary sprites

**3. Audio optimization** (saves 50-70%):
- Convert to mono, 22050Hz, 64kbps MP3
- Consider procedural audio for SFX (zero file size)
- Shorten loops, trim silence

**4. Code optimization**:
- Check for accidentally bundled libraries
- Enable tree shaking, dead code elimination
- Ensure minification is working properly

**5. Nuclear options if still over budget**:
- Reduce sprite color depth to 64 or 32 colors
- Downscale all sprites by 50% and render at 2x
- Remove non-essential visual effects
- Use CSS for simple shapes instead of sprites

I'd measure after each step and stop once under budget. The goal is maximum quality within the size constraint.

---

### Q2: Explain the tradeoffs between using WebP vs PNG for a playable ad sprite atlas.

**Answer:**

**PNG advantages:**
- Universal support in all WebViews, including older Android
- Lossless compression preserves sharp pixel art
- Well-understood optimization pipeline (pngquant + optipng)

**WebP advantages:**
- 25-35% smaller than equivalent quality PNG
- Can be lossy or lossless (both smaller than PNG)
- Supports animation (alternative to sprite sheets)

**WebP risks:**
- Older Android WebViews (pre-4.3) lack support (rare now)
- Some ad network preview tools may not render WebP
- lossy WebP can show artifacts on hard edges (pixel art)

**My recommendation:** For most playable ads today, WebP (lossy at quality 80-85) is the best default choice. The size savings are significant and support is >97%. For pixel art games, use lossless WebP or stick with pngquant'd PNG. Always test on the target ad network's preview tool to confirm rendering.

---

### Q3: How does base64 encoding affect your size budget, and how do you minimize the impact?

**Answer:**

Base64 converts every 3 bytes of binary data into 4 ASCII characters, a 33% increase. For a 1MB sprite atlas, that becomes 1.33MB in the HTML file.

**Minimization strategies:**

1. **Compress before encoding**: Run pngquant/optipng before base64. The 33% overhead applies to whatever goes in, so reducing 1MB to 400KB means base64 is 533KB instead of 1.33MB.

2. **Use the most compact image format**: WebP is 30% smaller than PNG, so after base64 it's still 30% smaller.

3. **Consider URL-encoded SVG instead of base64 SVG**: For SVG assets, `data:image/svg+xml,%3Csvg...` is often smaller than base64 because SVG is already text.

4. **Leverage gzip on the final HTML**: Ad networks typically gzip-compress the HTML file. Text (code, CSS, HTML markup) compresses well. Base64 data compresses poorly (~25% reduction vs ~70% for text). This means the "real" overhead of base64 after gzip is less than 33%, but it's still significant.

5. **Reduce the number of assets**: Each unique base64 string has overhead. Combining sprites into a single atlas means one base64 string instead of many.

---

### Q4: You need sound effects for a playable ad targeting TikTok (2MB limit). What approach do you take?

**Answer:**

With a 2MB total budget, audio gets very little room. My approach:

**Primary strategy: Procedural audio** (0 bytes)
- Use Web Audio API oscillators and noise generators
- Click, pop, swoosh, coin collect sounds are all achievable
- Match-3 pop: sine wave 600Hz → 1200Hz → 200Hz over 100ms
- Explosion: filtered noise with exponential decay
- Victory: sequence of sine tones (C-E-G-C arpeggio)

**If music is required:**
- Generate a simple loop with Web Audio API (arpeggiator pattern)
- Or: very short MP3 loop, 3-5 seconds, 11025Hz mono, 32kbps (~10-20KB)

**Fallback for complex sounds:**
- 22050Hz mono MP3 at 48kbps
- Maximum 2-3 second clips
- Budget: 50-100KB total for all audio
- Test with audio removed to verify game works silently (some networks mute by default)

**Critical detail:** Many ad networks start with audio muted (DAPI.getAudioVolume() returns 0). Always handle the muted case gracefully, and never block gameplay on audio initialization.

---

### Q5: What's the difference between texture compression formats (ASTC, ETC2, S3TC) and image formats (PNG, WebP)? When would you use each?

**Answer:**

They solve different problems:

**Image formats (PNG, WebP, JPEG):**
- Compressed for storage and transmission
- Must be fully decoded to RGBA pixels before GPU can use them
- A 512x512 PNG might be 100KB on disk but 1MB in GPU memory (512 * 512 * 4 bytes)
- Used for: web delivery, playable ads (single-file HTML)

**GPU texture compression (ASTC, ETC2, S3TC):**
- Compressed format that the GPU reads directly without full decompression
- A 512x512 ASTC 4x4 texture is ~256KB both on disk AND in GPU memory
- Dramatically reduces GPU memory usage (4:1 to 36:1 ratio)
- Used for: native mobile games, WebGL games with separate asset loading

**For playable ads:** You almost always use PNG/WebP/JPEG because:
1. Assets must be base64-encoded into a single HTML file
2. GPU compressed formats add complexity (need Basis Universal transcoder ~100KB)
3. The size limits (2-5MB) constrain total file size, not GPU memory

**For larger WebGL games:** GPU texture compression via Basis Universal is essential. A 4096x4096 atlas at RGBA is 64MB of GPU memory. With ASTC 4x4, it's ~16MB. This is the difference between running and crashing on mobile.

---

### Q6: Design a build pipeline for a playable ad studio that produces 20+ creatives per month.

**Answer:**

```
Source Control (Git)
  |
  v
Shared Asset Library (optimized master sprites, audio)
  |
  v
Project Template (cookiecutter/yeoman generator)
  ├── src/
  │   ├── main.ts
  │   ├── scenes/
  │   └── assets/ (references shared library)
  ├── build.config.ts
  └── package.json
  |
  v
CI/CD (GitHub Actions)
  ├── npm run build
  │   ├── Step 1: Lint + type check
  │   ├── Step 2: Optimize assets (pngquant, ffmpeg)
  │   ├── Step 3: Bundle (esbuild)
  │   ├── Step 4: Inline to single HTML
  │   └── Step 5: Minify
  ├── Size check (fail if over limit)
  ├── Run unit tests
  ├── Screenshot test (headless Chrome)
  └── Deploy to staging CDN
  |
  v
QA Dashboard
  ├── Preview on real devices (BrowserStack)
  ├── MRAID compliance check
  ├── Performance metrics (FPS, load time)
  └── Manual QA checklist
  |
  v
Ad Network Upload (automated via API where available)
  ├── Facebook, Google, Unity, IronSource, etc.
  └── Each with network-specific validation
```

Key features:
- **Shared asset library**: Pre-optimized sprites and audio that multiple creatives reuse
- **Template generator**: New creative in minutes, not hours
- **Automated size checks**: CI fails if over budget, catches regressions
- **Multi-network builds**: Single source, build targets for each network's constraints
- **Version tracking**: Associate creative version with performance metrics for data-driven iteration

---

### Q7: A colleague suggests using three.js (150KB) for a simple 2D playable ad. How do you respond?

**Answer:**

I'd recommend against it. Here's my reasoning:

**The math doesn't work for playable ads:**
- three.js minified: ~150KB
- After base64 encoding of assets + three.js, you've used most of your 2MB TikTok budget before writing any game logic
- three.js includes 3D rendering, materials, geometry, lights, loaders, math utils, and many other features we won't use

**What I'd suggest instead:**
- For 2D Canvas rendering: write a minimal custom renderer (~2-5KB)
- For simple WebGL: write a custom sprite batcher (~5-10KB)
- For PixiJS-level features: write a thin abstraction over WebGL (~10-20KB)

**When three.js IS appropriate:**
- Full 3D playable ads (car racing, FPS demos)
- Larger HTML5 games (>5MB budget)
- Prototyping/internal tools where size doesn't matter

**The 80/20 rule applies:** For a 2D game, you need maybe 5% of what three.js offers. Write that 5% yourself and save 140KB. That's enough room for several more sprite sheets or audio files that will actually improve the user experience.

---

### Q8: How would you handle serving different asset qualities for different devices?

**Answer:**

For a regular web game (not single-file playable ad):

```typescript
interface DeviceTier {
  readonly name: string;
  readonly maxTextureSize: number;
  readonly audioSampleRate: number;
  readonly particleCount: number;
}

function detectDeviceTier(gl: WebGLRenderingContext): DeviceTier {
  const maxTexSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  const renderer = gl.getParameter(gl.RENDERER);
  const memory = (navigator as any).deviceMemory ?? 4; // GB

  if (memory <= 2 || maxTexSize <= 2048 || /Mali-4|Adreno 3/.test(renderer)) {
    return {
      name: 'low',
      maxTextureSize: 1024,
      audioSampleRate: 11025,
      particleCount: 20
    };
  }

  if (memory <= 4 || maxTexSize <= 4096) {
    return {
      name: 'medium',
      maxTextureSize: 2048,
      audioSampleRate: 22050,
      particleCount: 50
    };
  }

  return {
    name: 'high',
    maxTextureSize: 4096,
    audioSampleRate: 44100,
    particleCount: 100
  };
}

// Load appropriate assets
async function loadAssets(tier: DeviceTier): Promise<GameAssets> {
  const prefix = `assets/${tier.name}`;
  return {
    sprites: await loadImage(`${prefix}/sprites.webp`),
    audio: await loadAudio(`${prefix}/music.mp3`),
  };
}
```

For playable ads, you can't serve different files (single HTML), but you can adjust quality at runtime:

```typescript
// Reduce render resolution on low-end devices
function setupCanvas(tier: DeviceTier): HTMLCanvasElement {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const dpr = tier.name === 'low' ? 1 : Math.min(window.devicePixelRatio, 2);
  canvas.width = canvas.clientWidth * dpr;
  canvas.height = canvas.clientHeight * dpr;
  return canvas;
}
```

---

### Q9: What are the key differences in asset optimization between a playable ad and a full HTML5 web game?

**Answer:**

| Aspect                 | Playable Ad              | Full Web Game            |
|------------------------|--------------------------|--------------------------|
| Total size budget      | 2-5 MB                   | 10-100+ MB               |
| Delivery               | Single HTML file          | Multiple files via CDN   |
| Assets encoded as      | Base64 (inline)           | Separate files (fetch)   |
| Texture compression    | PNG/WebP (decoded)        | ASTC/ETC2/Basis (GPU)   |
| Audio format           | Procedural / tiny MP3     | Full OGG/AAC tracks     |
| Progressive loading    | Not possible              | Essential (loading bar)  |
| Asset LOD              | Single quality            | Multiple quality tiers   |
| Streaming              | Not possible              | Audio/video streaming    |
| External requests      | Forbidden                 | Normal                   |
| Caching                | N/A (one-time use)        | Service Worker, HTTP cache |
| Font loading           | Base64 inline or CSS      | @font-face with woff2   |

The fundamental difference is that playable ads are self-contained: everything must be in one file. This constraint drives every optimization decision toward absolute minimum size, even at the cost of quality. Full web games can leverage progressive loading, CDN caching, and streaming to deliver high-quality assets without strict size limits.

---

### Q10: Explain the concept of "procedural generation" for asset optimization. Where can it save the most bytes?

**Answer:**

Procedural generation creates content through code rather than pre-made assets. Each category has different code-to-asset tradeoffs:

**Audio** (highest savings, ~50-200KB → 0KB):
- All SFX can be procedural (clicks, pops, explosions)
- Simple music loops via oscillator patterns
- Web Audio API is built into every browser

**Backgrounds** (high savings, ~100-500KB → ~1-5KB of code):
- Gradient backgrounds via Canvas or CSS
- Starfield: random dots on black
- Particle effects: snow, rain, confetti
- Geometric patterns: grids, hexagons, waves

**UI elements** (moderate savings, ~50-200KB → ~2-10KB):
- Buttons: Canvas rounded rectangles with gradients
- Progress bars, health bars: simple shapes
- Score popups: text rendering with shadows

**Example: Procedural background (saves an entire background image)**:
```typescript
function drawStarfield(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#0a0a2e';
  ctx.fillRect(0, 0, w, h);

  // Use seeded random for consistent results
  let seed = 12345;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let i = 0; i < 200; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const size = rand() * 2 + 0.5;
    const alpha = rand() * 0.8 + 0.2;
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }
}
```

The tradeoff: procedural content looks "generated" rather than hand-crafted. For playable ads, this is often acceptable because the interaction time is only 15-30 seconds and the focus should be on gameplay, not visual fidelity.
