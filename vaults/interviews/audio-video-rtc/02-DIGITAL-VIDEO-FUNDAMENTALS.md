# Digital Video Fundamentals

A comprehensive guide for software engineers starting from zero. This document covers
everything from how the human eye perceives motion to the math behind video compression,
with code examples and interview questions throughout.

---

## Table of Contents

1. [How Video Works](#1-how-video-works)
2. [Color Science](#2-color-science)
3. [Color Spaces](#3-color-spaces)
4. [Resolution and Aspect Ratios](#4-resolution-and-aspect-ratios)
5. [Raw Video Formats](#5-raw-video-formats)
6. [Video Processing Basics](#6-video-processing-basics)
7. [Image Compression Primer](#7-image-compression-primer)
8. [Video Compression Fundamentals](#8-video-compression-fundamentals)
9. [Key Libraries](#9-key-libraries)
10. [Code Examples](#10-code-examples)
11. [Common Interview Questions](#11-common-interview-questions)

---

## 1. How Video Works

### 1.1 Persistence of Vision

Video is an illusion. The human visual system retains an image for approximately
1/25th of a second after the stimulus disappears. When a sequence of still images
is presented faster than this retention period, the brain perceives continuous
motion rather than discrete frames.

This principle, called **persistence of vision**, is the foundation of all
motion picture technology -- from the zoetrope of the 1830s to the 120fps HDR
display on your desk.

```
Frame 1       Frame 2       Frame 3       Frame 4
 .---.         .---.         .---.         .---.
 | O |         | O |         | O |         | O |
 |/|\|         |/|\|         |/|\|         |/|\|
 |/ \|   -->   | /\|   -->   |  /||  -->   |  | |
 '---'         '---'         '---'         '---'
  t=0ms        t=33ms        t=66ms        t=100ms

  Brain perceives: a person walking smoothly
```

### 1.2 Frame Rates

A **frame rate** is the number of individual still images (frames) displayed per
second, measured in **fps** (frames per second) or **Hz**.

| Standard      | Frame Rate | Origin / Use Case                                |
| ------------- | ---------- | ------------------------------------------------ |
| Silent Film   | 16-18 fps  | Early cinema; looks "jerky" to modern eyes       |
| Cinema (Film) | 24 fps     | Theatrical standard since the late 1920s         |
| PAL           | 25 fps     | European broadcast (50 Hz mains frequency)       |
| NTSC          | 29.97 fps  | North American broadcast (60 Hz / 1.001)         |
| Web Video     | 30 fps     | Common for streaming and online content          |
| Smooth Video  | 60 fps     | Gaming, sports, modern streaming (Netflix, etc.) |
| High FR       | 120 fps    | Competitive gaming, VR, high-end displays        |
| Ultra High FR | 240 fps    | Slow-motion capture, specialized displays        |

**Why 29.97 and not 30?** When color was added to NTSC in 1953, engineers had to
shift the frame rate from exactly 30 fps down by a factor of 1000/1001 to prevent
interference between the color subcarrier and the audio carrier. This legacy
persists in all NTSC-derived standards.

**Drop-frame timecode** was invented to keep NTSC timecode synchronized with
wall-clock time despite the 29.97 fps rate. It "drops" frame numbers 0 and 1 at
the start of each minute, except every 10th minute.

### 1.3 Interlaced vs Progressive Scan

These are two fundamentally different ways to paint an image on screen.

**Progressive scan (p)** draws every line of every frame in sequence:

```
Progressive Frame (1080p):
Line 1:   ████████████████████████
Line 2:   ████████████████████████
Line 3:   ████████████████████████
Line 4:   ████████████████████████
...
Line 1079: ████████████████████████
Line 1080: ████████████████████████

All 1080 lines drawn in one pass = 1 complete frame
```

**Interlaced scan (i)** splits each frame into two **fields**: odd lines first
(top field), then even lines (bottom field):

```
Interlaced Frame (1080i):

Field 1 (Odd / Top):          Field 2 (Even / Bottom):
Line 1:   ████████████████     Line 1:   ----------------
Line 2:   ----------------     Line 2:   ████████████████
Line 3:   ████████████████     Line 3:   ----------------
Line 4:   ----------------     Line 4:   ████████████████
...                            ...
Line 1079: ████████████████    Line 1079: ----------------
Line 1080: ----------------    Line 1080: ████████████████

Each field = 540 lines, displayed 1/60th second apart
Two fields combine to form one frame at 1/30th second
```

| Property         | Interlaced (e.g., 1080i)      | Progressive (e.g., 1080p) |
| ---------------- | ----------------------------- | ------------------------- |
| Lines per pass   | Half (one field)              | All (one frame)           |
| Temporal cadence | 60 fields/sec                 | 30 or 60 frames/sec       |
| Motion artifacts | Combing / feathering          | None                      |
| Bandwidth        | Lower for same "fps feel"     | Higher                    |
| Modern usage     | Legacy broadcast, some sports | Everything new            |

**Combing artifacts** appear in interlaced video when an object moves between the
two fields. The odd and even lines show the object in slightly different positions,
creating a comb-like edge.

**Deinterlacing** is the process of converting interlaced content to progressive.
Common algorithms include bob (double field rate), weave (combine fields), and
adaptive methods like Yadif (Yet Another DeInterlacing Filter).

---

## 2. Color Science

### 2.1 The Light Spectrum

Visible light occupies wavelengths from approximately 380 nm (violet) to 700 nm (red):

```
  UV  |  Violet  Blue  Cyan  Green  Yellow  Orange  Red  |  IR
      |  380nm   450nm 490nm  530nm  570nm   600nm  700nm |
      |    |------|------|------|------|--------|------|   |
      |<=============== Visible Spectrum ================>|
```

A "color" in the physical world is a spectral power distribution (SPD) -- the
amount of energy at each wavelength. However, the human eye does not perceive
individual wavelengths. Instead, it has three types of cone cells.

### 2.2 Human Color Perception

The retina contains three types of cone photoreceptors:

| Cone Type  | Peak Sensitivity | Commonly Called |
| ---------- | ---------------- | --------------- |
| S (Short)  | ~420 nm          | Blue cones      |
| M (Medium) | ~530 nm          | Green cones     |
| L (Long)   | ~560 nm          | Red cones       |

```
Sensitivity
    ^
    |   S         M      L
    |  /\        /\     /\
    | /  \      /  \   /  \
    |/    \    /    \ /    \
    /      \  /      X      \
   /|       \/      / \      \
  / |        \     /   \      \
 /  |         \   /     \      \---
----+----------+--+------+---------> Wavelength
   400       500  530   560   700 nm
```

**Key insight**: Because we have only three types of cones, we can represent any
perceivable color with just three numbers. This is the foundation of all digital
color systems -- RGB, XYZ, YCbCr, and others.

**Metamerism**: Two physically different SPDs can produce the same cone response
and therefore look identical. This is why your monitor (which emits only red,
green, and blue light) can reproduce millions of perceived colors.

### 2.3 The RGB Color Model

In the additive RGB model, colors are created by combining red, green, and blue
light at varying intensities:

```
        Red (1,0,0)
           /\
          /  \
         / Yel\low (1,1,0)
        /   /\  \
       /   /  \  \
      / Mag/enta White (1,1,1)
     / (1,0,1) \  \
    /     |   Cyan \
   /      |  (0,1,1)\
  /       |     |    \
 Green ---+-----+--- Blue
 (0,1,0)  Black     (0,0,1)
          (0,0,0)
```

- **Red + Green = Yellow**
- **Red + Blue = Magenta**
- **Green + Blue = Cyan**
- **Red + Green + Blue = White**
- **No light = Black**

### 2.4 Color Depth (Bit Depth)

Color depth defines how many distinct values each channel can take:

| Bit Depth | Values per Channel | Total Colors | Use Case                     |
| --------- | ------------------ | ------------ | ---------------------------- |
| 8-bit     | 256 (0-255)        | 16.7 million | SDR content, web, most video |
| 10-bit    | 1,024 (0-1023)     | 1.07 billion | Professional video, HDR      |
| 12-bit    | 4,096 (0-4095)     | 68.7 billion | Cinema mastering, raw camera |
| 16-bit    | 65,536             | 281 trillion | Scientific imaging, VFX      |

**Why does bit depth matter?**

With 8 bits per channel, the entire range from black to white is divided into 256
steps. In dark gradients (like a sunset sky), these steps can become visible as
**banding** -- discrete bands of color instead of a smooth gradient.

10-bit provides 4x more steps (1024), virtually eliminating visible banding.

### 2.5 Gamma and Transfer Functions

Human vision perceives brightness non-linearly. We are far more sensitive to
differences in dark tones than in bright ones. A 50% increase in physical light
does not look like a 50% increase in brightness.

**Gamma encoding** exploits this by allocating more code values to dark tones:

```
Linear Light vs Gamma-Encoded Signal:

Perceived       Linear                Gamma (approx 1/2.2)
Brightness      Signal                Signal
    ^            |                     |
100%|          * |                   **|
    |        *   |                 *   |
 75%|      *     |               *     |
    |    *       |             *       |
 50%|  *         |           *         |
    | *          |         *           |
 25%|*           |       *             |
    *            |     *               |
  0%+----------->|   *---------------->|
    0%    50% 100%   0%    50%    100%
    Physical Light   Code Value

The gamma curve "stretches" the dark values, giving them more code values.
```

| Term               | Meaning                                                |
| ------------------ | ------------------------------------------------------ |
| Gamma (gamma)      | The exponent in the power function: V_out = V_in^gamma |
| OETF               | Opto-Electronic Transfer Function (camera -> signal)   |
| EOTF               | Electro-Optical Transfer Function (signal -> display)  |
| sRGB gamma         | Approx 2.2 (with linear segment near black)            |
| BT.1886            | Reference EOTF for BT.709 HD content                   |
| PQ (SMPTE ST 2084) | Perceptual Quantizer for HDR (up to 10,000 nits)       |
| HLG                | Hybrid Log-Gamma for broadcast HDR                     |

**PQ (Perceptual Quantizer)** is the HDR transfer function used by Dolby Vision
and HDR10. Unlike gamma, which is relative (0-100% of display max), PQ maps code
values to absolute luminance levels in cd/m^2 (nits), up to 10,000.

---

## 3. Color Spaces

### 3.1 RGB Color Space

RGB is the native color space for displays and cameras. Each pixel stores three
values: Red, Green, Blue. Simple, intuitive, but not efficient for video.

**Problem with RGB for video**: All three channels carry both brightness
(luminance) and color information. This means:

1. You cannot separate brightness from color
2. All three channels are equally important -- you cannot compress one more than
   another without visible artifacts
3. Human vision is more sensitive to brightness than color, but RGB gives no way
   to exploit this

### 3.2 YUV / YCbCr: Why Video Uses It

**YCbCr** (often loosely called YUV) separates brightness from color:

| Component | Name            | Contains                           |
| --------- | --------------- | ---------------------------------- |
| Y         | Luma            | Brightness (weighted sum of R,G,B) |
| Cb        | Blue-difference | Blue chrominance                   |
| Cr        | Red-difference  | Red chrominance                    |

```
RGB Image          Y (Luma)            Cb (Blue diff)      Cr (Red diff)
+----------+       +----------+        +----------+        +----------+
|  Full    |       | Grayscale|        | Blue     |        | Red      |
|  Color   |  -->  | Detail   |   +    | Color    |   +    | Color    |
|  Image   |       | Image    |        | Info     |        | Info     |
+----------+       +----------+        +----------+        +----------+
                   High detail          Low detail          Low detail
                   (keep full res)      (can subsample)     (can subsample)
```

**The key insight**: Human vision has much higher spatial resolution for
luminance than for chrominance. We can reduce the resolution of Cb and Cr
(chroma subsampling) with little perceptible quality loss, saving 33-50% of data.

### 3.3 RGB to YCbCr Conversion (BT.709)

The standard conversion matrices for HD video (ITU-R BT.709):

```
Y  =  0.2126 * R + 0.7152 * G + 0.0722 * B
Cb = -0.1146 * R - 0.3854 * G + 0.5000 * B + 128
Cr =  0.5000 * R - 0.4542 * G - 0.0458 * B + 128
```

Notice that Green dominates the Y (luma) equation. This matches human vision --
we are most sensitive to green light.

### 3.4 BT.601 vs BT.709 vs BT.2020

These are ITU-R Recommendations that define color spaces for different video standards:

| Standard | Resolution     | Color Primaries | Luma Coefficients (R, G, B) | Era  |
| -------- | -------------- | --------------- | --------------------------- | ---- |
| BT.601   | SD (480i/576i) | Narrower gamut  | 0.299, 0.587, 0.114         | 1982 |
| BT.709   | HD (720p+)     | sRGB primaries  | 0.2126, 0.7152, 0.0722      | 1990 |
| BT.2020  | UHD (4K/8K)    | Wide gamut      | 0.2627, 0.6780, 0.0593      | 2012 |

```
CIE 1931 Chromaticity Diagram (simplified):

         0.9 .
             |  .
         0.8 |    .  520nm (green)
             |      .
     y   0.7 |        .
         0.6 |    BT.2020 .
             |   /    \     .
         0.5 |  / BT.709\    .
             | /  /    \  \    . 570nm
         0.4 |/ /BT.601 \  \   .
             | /   /  \   \  \ .
         0.3 |/   /    \   \  . 600nm
             |   /      \   .
         0.2 |  /        \ .
             | /          .  700nm (red)
         0.1 |/         .
             +---------+---------->
             0.1  0.2  0.3  0.4  0.5  0.6  0.7  0.8
                              x

    Each triangle represents the range of colors (gamut) the standard can represent.
    BT.2020 > BT.709 > BT.601
```

**Critical**: Using the wrong color matrix when converting between RGB and YCbCr
is one of the most common video bugs. BT.601 coefficients on HD content (or vice
versa) produces washed-out or oversaturated colors.

### 3.5 Chroma Subsampling

Chroma subsampling notation uses three numbers: **J:a:b**

- **J** = reference block width (always 4 pixels)
- **a** = number of chroma samples in the first row
- **b** = number of chroma samples in the second row

```
4:4:4 - No subsampling (full chroma resolution)
Each pixel has its own Y, Cb, and Cr values.

Row 1: [Y Cb Cr] [Y Cb Cr] [Y Cb Cr] [Y Cb Cr]
Row 2: [Y Cb Cr] [Y Cb Cr] [Y Cb Cr] [Y Cb Cr]

Luma:        Chroma:
 Y Y Y Y      C C C C
 Y Y Y Y      C C C C

Data per 4x2 block: 8Y + 8Cb + 8Cr = 24 samples
Ratio to 4:4:4 = 100% (no savings)
```

```
4:2:2 - Horizontal chroma subsampling
Chroma is sampled at half horizontal resolution.

Row 1: [Y Cb Cr] [Y      ] [Y Cb Cr] [Y      ]
Row 2: [Y Cb Cr] [Y      ] [Y Cb Cr] [Y      ]

Luma:        Chroma:
 Y Y Y Y      C . C .
 Y Y Y Y      C . C .

Data per 4x2 block: 8Y + 4Cb + 4Cr = 16 samples
Ratio to 4:4:4 = 67% (saves 33%)
```

```
4:2:0 - Horizontal AND vertical chroma subsampling
Chroma is sampled at half resolution in both dimensions.

Row 1: [Y Cb Cr] [Y      ] [Y Cb Cr] [Y      ]
Row 2: [Y      ] [Y      ] [Y      ] [Y      ]

Luma:        Chroma:
 Y Y Y Y      C . C .
 Y Y Y Y      . . . .

Data per 4x2 block: 8Y + 2Cb + 2Cr = 12 samples
Ratio to 4:4:4 = 50% (saves 50%)
```

**Summary Table:**

| Format | Chroma H:V Ratio | Bits/Pixel (8-bit) | Savings | Use Case                    |
| ------ | ---------------- | ------------------ | ------- | --------------------------- |
| 4:4:4  | 1:1              | 24 bpp             | 0%      | Studio, graphics, VFX       |
| 4:2:2  | 1/2 : 1          | 16 bpp             | 33%     | Professional video, editing |
| 4:2:0  | 1/2 : 1/2        | 12 bpp             | 50%     | Consumer video, streaming   |
| 4:1:1  | 1/4 : 1          | 12 bpp             | 50%     | DV (legacy)                 |

**Why 4:2:0 dominates consumer video**: The human eye's chroma resolution is
roughly half its luma resolution. At normal viewing distances, 4:2:0 is
visually indistinguishable from 4:4:4 for natural content. The 50% reduction
in chroma data is essentially free quality.

---

## 4. Resolution and Aspect Ratios

### 4.1 Standard Resolutions

| Name        | Resolution  | Pixels     | Megapixels | Aspect Ratio |
| ----------- | ----------- | ---------- | ---------- | ------------ |
| SD (NTSC)   | 720 x 480   | 345,600    | 0.35 MP    | 3:2\*        |
| SD (PAL)    | 720 x 576   | 414,720    | 0.41 MP    | 5:4\*        |
| HD (720p)   | 1280 x 720  | 921,600    | 0.92 MP    | 16:9         |
| FHD (1080p) | 1920 x 1080 | 2,073,600  | 2.07 MP    | 16:9         |
| QHD (1440p) | 2560 x 1440 | 3,686,400  | 3.69 MP    | 16:9         |
| 4K UHD      | 3840 x 2160 | 8,294,400  | 8.29 MP    | 16:9         |
| 4K DCI      | 4096 x 2160 | 8,847,360  | 8.85 MP    | ~17:9        |
| 8K UHD      | 7680 x 4320 | 33,177,600 | 33.18 MP   | 16:9         |

\*SD uses non-square pixels; see Pixel Aspect Ratio below.

### 4.2 Aspect Ratios

```
4:3 (1.33:1)             16:9 (1.78:1)            21:9 (2.33:1)
+------------+           +------------------+      +------------------------+
|            |           |                  |      |                        |
|            |           |                  |      |                        |
|            |           |                  |      +------------------------+
+------------+           +------------------+
Classic TV                Modern standard          Ultrawide / Cinema
```

| Ratio  | Decimal | Use Case                                 |
| ------ | ------- | ---------------------------------------- |
| 4:3    | 1.33    | Classic TV, old monitors                 |
| 16:9   | 1.78    | Modern TV, streaming, YouTube            |
| 1.85:1 | 1.85    | US theatrical widescreen                 |
| 2.39:1 | 2.39    | Anamorphic cinema (CinemaScope)          |
| 21:9   | 2.33    | Ultrawide monitors                       |
| 9:16   | 0.56    | Vertical video (TikTok, Instagram Reels) |
| 1:1    | 1.00    | Instagram square posts                   |

### 4.3 Pixel Aspect Ratio (PAR) vs Display Aspect Ratio (DAR)

In SD video, pixels are not square. The storage resolution (720x480) does not
directly correspond to the display aspect ratio (4:3 or 16:9).

```
PAR (Pixel Aspect Ratio):
  The ratio of a single pixel's width to its height.
  Square pixels: PAR = 1:1
  NTSC 4:3:     PAR = 10:11 (pixels are slightly tall)
  NTSC 16:9:    PAR = 40:33 (pixels are wide)

Relationship:
  DAR = SAR x PAR

Where:
  DAR = Display Aspect Ratio (what you see on screen)
  SAR = Storage Aspect Ratio (width/height of pixel grid)
  PAR = Pixel Aspect Ratio

Example (NTSC 4:3):
  SAR = 720/480 = 3:2
  PAR = 10:11
  DAR = (3/2) x (10/11) = 30/22 = 15/11 ~ 1.36 ~ 4:3
```

In HD and beyond, pixels are always square (PAR = 1:1), so DAR = SAR.

---

## 5. Raw Video Formats

### 5.1 Planar vs Packed Pixel Formats

Raw (uncompressed) video stores pixel data in two fundamental arrangements:

**Planar**: Each color component is stored as a separate contiguous plane.

```
Planar YUV420P for a 4x4 image:

Memory layout:
[Y Y Y Y  Y Y Y Y  Y Y Y Y  Y Y Y Y | Cb Cb  Cb Cb | Cr Cr  Cr Cr]
|<-------- Y plane (16 bytes) ------->|<- Cb (4B) -->|<- Cr (4B) -->|

Total: 16 + 4 + 4 = 24 bytes for 16 pixels = 1.5 bytes/pixel

Y Plane (4x4):       Cb Plane (2x2):    Cr Plane (2x2):
 Y00 Y01 Y02 Y03      Cb00 Cb01          Cr00 Cr01
 Y10 Y11 Y12 Y13      Cb10 Cb11          Cr10 Cr11
 Y20 Y21 Y22 Y23
 Y30 Y31 Y32 Y33
```

**Packed (Interleaved)**: Components are interleaved per pixel or per scanline.

```
Packed RGB24 for a 4x2 image:

Memory layout:
[R G B  R G B  R G B  R G B  R G B  R G B  R G B  R G B]
 px00   px01   px02   px03   px10   px11   px12   px13

Total: 8 pixels x 3 bytes = 24 bytes = 3 bytes/pixel
```

### 5.2 Common Raw Formats

| Format  | Type    | Subsampling | Bytes/Pixel | Description                       |
| ------- | ------- | ----------- | ----------- | --------------------------------- |
| YUV420P | Planar  | 4:2:0       | 1.5         | Three separate Y, U, V planes     |
| I420    | Planar  | 4:2:0       | 1.5         | Same as YUV420P (Y, Cb, Cr order) |
| YV12    | Planar  | 4:2:0       | 1.5         | Same but Y, Cr, Cb order          |
| NV12    | Semi-pl | 4:2:0       | 1.5         | Y plane + interleaved UV plane    |
| NV21    | Semi-pl | 4:2:0       | 1.5         | Y plane + interleaved VU plane    |
| YUV422P | Planar  | 4:2:2       | 2.0         | Three planes, half-width chroma   |
| YUYV    | Packed  | 4:2:2       | 2.0         | Y0 U Y1 V (also called YUY2)      |
| UYVY    | Packed  | 4:2:2       | 2.0         | U Y0 V Y1                         |
| RGB24   | Packed  | N/A (4:4:4) | 3.0         | R G B R G B ...                   |
| BGR24   | Packed  | N/A (4:4:4) | 3.0         | B G R B G R ... (OpenCV default)  |
| RGBA    | Packed  | N/A (4:4:4) | 4.0         | R G B A (with alpha channel)      |
| RGB48   | Packed  | N/A (4:4:4) | 6.0         | 16-bit per channel RGB            |

### 5.3 NV12 and NV21 Detail

NV12 is the most common format in hardware decoders and mobile video:

```
NV12 layout for an 8x4 image:

Y Plane (8x4 = 32 bytes):
 Y00 Y01 Y02 Y03 Y04 Y05 Y06 Y07
 Y10 Y11 Y12 Y13 Y14 Y15 Y16 Y17
 Y20 Y21 Y22 Y23 Y24 Y25 Y26 Y27
 Y30 Y31 Y32 Y33 Y34 Y35 Y36 Y37

UV Plane (interleaved, 4x2 pairs = 16 bytes):
 U00 V00 U01 V01 U02 V02 U03 V03
 U10 V10 U11 V11 U12 V12 U13 V13

Total: 32 + 16 = 48 bytes = 1.5 bytes/pixel

NV21 is identical but with V before U:
 V00 U00 V01 U01 ...
```

**NV12 vs I420**: Both are YUV 4:2:0 with 1.5 bytes/pixel. The difference is
whether the chroma is stored as separate U and V planes (I420) or interleaved
UV pairs (NV12). NV12 is preferred by hardware because interleaved UV has
better cache locality when accessed together.

### 5.4 Calculating Raw Video Sizes

**Formula for a single frame:**

```
For YUV 4:2:0 (most common):
  frame_size = width * height * 1.5

For YUV 4:2:2:
  frame_size = width * height * 2

For RGB24:
  frame_size = width * height * 3

For RGBA:
  frame_size = width * height * 4
```

**Example: 1080p YUV420 at 30fps:**

```
Frame size = 1920 * 1080 * 1.5 = 3,110,400 bytes = ~2.97 MB
Per second = 3,110,400 * 30 = 93,312,000 bytes/s = ~89 MB/s
Per minute = 89 * 60 = ~5.3 GB/min
Per hour   = 5.3 * 60 = ~318 GB/hr
```

**Bandwidth table for common formats (uncompressed):**

| Resolution | Format | FPS | Frame Size | Bitrate   | Per Hour |
| ---------- | ------ | --- | ---------- | --------- | -------- |
| 720p       | YUV420 | 30  | 1.38 MB    | 331 Mbps  | 149 GB   |
| 1080p      | YUV420 | 30  | 2.97 MB    | 712 Mbps  | 320 GB   |
| 1080p      | YUV420 | 60  | 2.97 MB    | 1.42 Gbps | 640 GB   |
| 1080p      | RGB24  | 30  | 5.93 MB    | 1.42 Gbps | 640 GB   |
| 4K UHD     | YUV420 | 30  | 11.94 MB   | 2.86 Gbps | 1.29 TB  |
| 4K UHD     | YUV420 | 60  | 11.94 MB   | 5.73 Gbps | 2.58 TB  |
| 8K UHD     | YUV420 | 60  | 47.78 MB   | 22.9 Gbps | 10.3 TB  |

This makes it obvious why video compression is essential. Even a single hour
of uncompressed 4K 60fps would consume over 2.5 terabytes.

---

## 6. Video Processing Basics

### 6.1 Scaling (Resizing)

Scaling changes the resolution of a video frame. The quality depends heavily on
the interpolation algorithm:

| Algorithm        | Speed   | Quality   | Use Case                     |
| ---------------- | ------- | --------- | ---------------------------- |
| Nearest Neighbor | Fastest | Worst     | Pixel art, integer scaling   |
| Bilinear         | Fast    | OK        | Preview, real-time           |
| Bicubic          | Medium  | Good      | General-purpose scaling      |
| Lanczos          | Slow    | Excellent | High-quality downscaling     |
| Spline           | Slow    | Excellent | Professional post-production |

**Downscaling** (reducing resolution) requires a low-pass filter to prevent
aliasing. Lanczos is the gold standard for downscaling.

**Upscaling** (increasing resolution) cannot create detail that doesn't exist.
Modern approaches include AI super-resolution (DLSS, FSR, neural networks).

### 6.2 Cropping

Cropping removes pixels from the edges of a frame. No resampling is needed, so
it is a lossless geometric operation on raw data.

```
Original 1920x1080:              After crop (100,50,1720,980):
+---------------------------+    +---------------------+
|                           |    |                     |
|   +---------------------+ |   |    Cropped           |
|   |                     | |   |    1620 x 930        |
|   |   Cropped region    | |   |                     |
|   |                     | |   +---------------------+
|   +---------------------+ |
|                           |
+---------------------------+
```

### 6.3 Rotation

Video rotation can be done in two ways:

1. **Metadata rotation**: Set a rotation flag in the container. No pixel data
   is changed. Fast, lossless. Supported by MP4 (matrix in tkhd) and many players.

2. **Pixel rotation**: Actually transform every pixel. Required when the
   downstream consumer doesn't support rotation metadata.

For 90/180/270 degree rotations, pixel rotation is a simple transpose/flip
operation with no quality loss. Arbitrary angles require interpolation.

### 6.4 Color Space Conversion

Converting between color spaces (e.g., RGB to YCbCr or BT.601 to BT.709) is a
matrix multiplication applied to every pixel:

```
[ Y  ]     [ a  b  c ] [ R ]     [ d ]
[ Cb ]  =  [ e  f  g ] [ G ]  +  [ e ]
[ Cr ]     [ h  i  j ] [ B ]     [ f ]
```

This is one of the most performance-critical operations in a video pipeline.
Hardware encoders/decoders often include dedicated color space conversion units.

### 6.5 Deinterlacing

Converts interlaced content to progressive. Common algorithms:

| Method | Quality | Speed  | Description                                   |
| ------ | ------- | ------ | --------------------------------------------- |
| Bob    | Low     | Fast   | Each field becomes a frame; double frame rate |
| Weave  | Low     | Fast   | Interleave two fields; causes combing         |
| Blend  | Medium  | Fast   | Average adjacent fields                       |
| Yadif  | Good    | Medium | Spatial + temporal check per pixel            |
| QTGMC  | Best    | Slow   | Motion-compensated temporal Gaussian          |
| BWDIF  | Good    | Medium | Bob-Weave deinterlacer; used in FFmpeg        |

### 6.6 Frame Rate Conversion

Changing the frame rate of a video:

**Simple methods:**

- **Drop frames**: Remove frames to reduce rate (30fps -> 24fps: drop every 5th)
- **Duplicate frames**: Repeat frames to increase rate (causes judder)

**Advanced methods:**

- **Motion-compensated interpolation (MCI)**: Generate new intermediate frames
  by estimating motion between existing frames. Used in TV "motion smoothing"
  (the "soap opera effect").
- **Optical flow**: Dense per-pixel motion estimation for high-quality
  interpolation.

### 6.7 Overlay / Composition

Compositing layers video or images on top of each other. The fundamental
operation uses alpha blending:

```
output = foreground * alpha + background * (1 - alpha)

Where alpha is 0.0 (fully transparent) to 1.0 (fully opaque)
```

Common uses: watermarks, subtitles, picture-in-picture, green screen (chroma
keying).

---

## 7. Image Compression Primer

Understanding JPEG compression is essential because video codecs (H.264, H.265,
AV1) use the same fundamental techniques for each individual frame, then add
temporal compression on top.

### 7.1 Spatial Redundancy

Natural images have enormous spatial redundancy. Adjacent pixels are usually
very similar. A blue sky might have millions of pixels that are nearly identical.

Compression exploits this redundancy in four steps:

```
Original     Color     Block    DCT        Quantize    Entropy
Image    --> Convert -> Split -> Transform -> (Lossy) -> Encode
             (YCbCr)   (8x8)   (Frequency)             (Lossless)
```

### 7.2 The DCT (Discrete Cosine Transform)

The DCT converts an 8x8 block of pixel values from the spatial domain to the
frequency domain. Instead of storing 64 pixel values, you store 64 frequency
coefficients.

```
8x8 Pixel Block:                    8x8 DCT Coefficients:
+---+---+---+---+---+---+---+---+  +------+----+----+---+---+---+---+---+
|140|144|152|168|176|176|172|160|  | 1260 | -1 | -12| -5|  2|  1|  0|  0|
|124|140|152|168|180|180|176|164|  |  -23 | -17|  -6| -3| -3|  0|  0|  0|
|104|128|148|168|180|184|180|168|  |  -11 |  -9|  -2|  2|  0| -1|  0|  0|
| 96|112|140|164|180|184|184|176|  |   -7 |  -2|   0|  1|  1|  0|  0|  0|
|100|104|128|156|176|184|188|180|  |   -1 |  -1|   1|  2|  0| -1|  0|  0|
| 96|100|116|140|168|180|184|180|  |    2 |   0|   2|  0| -1|  0|  0|  0|
| 92| 96|108|128|152|172|180|176|  |   -1 |   0|   0| -1|  0|  0|  0|  0|
| 92| 92|100|120|140|160|172|172|  |   -3 |   2|  -4| -2|  2|  1|  0|  0|
+---+---+---+---+---+---+---+---+  +------+----+----+---+---+---+---+---+
     Spatial Domain                      Frequency Domain

Key observation: Most energy is concentrated in the top-left (low frequency)
coefficients. The bottom-right (high frequency) coefficients are near zero.
```

The top-left coefficient (DC coefficient) represents the average value of the
block. Moving right and down, coefficients represent increasingly higher spatial
frequencies (finer detail).

### 7.3 Quantization (The Lossy Step)

Quantization divides each DCT coefficient by a quantization factor and rounds
to the nearest integer. This is where information is permanently lost:

```
DCT Coefficient:       Quantization Matrix:     Quantized Result:
+------+----+----+     +----+----+----+          +-----+---+---+
| 1260 | -1 | -12|     | 16 | 11 | 10|          |  79 | 0 | -1|
|  -23 | -17|  -6|  /  | 12 | 12 | 14|    =     |  -2 | -1|  0|
|  -11 |  -9|  -2|     | 14 | 13 | 16|          |  -1 | -1|  0|
+------+----+----+     +----+----+----+          +-----+---+---+

Many coefficients become zero, especially high-frequency ones.
Higher quantization = more zeros = smaller file = lower quality.
```

**Quality control**: The quantization matrix determines the quality/size
tradeoff. JPEG quality 1-100 maps to different quantization matrices. Video
codecs use a similar concept called QP (Quantization Parameter).

### 7.4 Entropy Coding (The Lossless Step)

After quantization, the remaining non-zero coefficients are compressed
losslessly using techniques like:

1. **Zigzag scanning**: Read the 8x8 block in a zigzag order to group zeros
   together at the end:

```
 0  1  5  6 14 15 27 28
 2  4  7 13 16 26 29 42
 3  8 12 17 25 30 41 43
 9 11 18 24 31 40 44 53
10 19 23 32 39 45 52 54
20 22 33 38 46 51 55 60
21 34 37 47 50 56 59 61
35 36 48 49 57 58 62 63
```

2. **Run-Length Encoding (RLE)**: Encode runs of zeros efficiently
3. **Huffman coding** (JPEG) or **Arithmetic coding** (H.264/HEVC):
   Assign shorter codes to more frequent symbols

### 7.5 JPEG Compression Pipeline Summary

```
                        JPEG Encoder Pipeline

Input RGB Image
      |
      v
  Color Convert (RGB -> YCbCr)
      |
      v
  Chroma Subsample (4:2:0)     <-- 50% reduction
      |
      v
  Split into 8x8 blocks
      |
      v
  DCT Transform (spatial -> frequency)
      |
      v
  Quantization (lossy)          <-- Main compression
      |
      v
  Zigzag Scan + RLE
      |
      v
  Huffman/Arithmetic Coding     <-- Lossless
      |
      v
  JPEG Bitstream
```

Typical JPEG compression ratio: **10:1 to 20:1** with acceptable quality.

---

## 8. Video Compression Fundamentals

### 8.1 Temporal Redundancy

Images within a video are not independent. Consecutive frames are usually very
similar -- the background barely changes, and objects move only a few pixels.

```
Frame N:                    Frame N+1:
+---------------------------+  +---------------------------+
|                           |  |                           |
|   /---\                   |  |     /---\                 |
|  | car |       [house]    |  |    | car |     [house]    |
|   \---/                   |  |     \---/                 |
|                           |  |                           |
|===========================|  |===========================|
+---------------------------+  +---------------------------+

The house and road are identical. Only the car moved ~30 pixels right.
Instead of encoding the entire frame again, encode only the difference.
```

### 8.2 I-frames, P-frames, B-frames

Video codecs use three types of frames:

| Frame Type | Full Name           | Description                                     |
| ---------- | ------------------- | ----------------------------------------------- |
| I-frame    | Intra-coded frame   | Complete frame, compressed like a JPEG          |
| P-frame    | Predictive frame    | References one previous frame; stores only diff |
| B-frame    | Bi-predictive frame | References both previous AND future frames      |

```
Compression efficiency:     I-frame > P-frame > B-frame (most compressed)
Decode complexity:          I-frame < P-frame < B-frame (most complex)
Random access:              Only possible at I-frames
```

**Visual representation of frame dependencies:**

```
I ----> P ----> P ----> P ----> I ----> P ----> P
 \       \      \       /       \       \       /
  \       \      \     /         \       \     /
   v       v      v   v           v       v   v
    B   B   B   B       B   B   B   B

Display order: I  B  B  P  B  B  P  B  B  P  B  B  I  ...
Decode order:  I  P  B  B  P  B  B  P  B  B  I  ...

B-frames are decoded AFTER the frames they reference,
so decode order differs from display order.
```

### 8.3 GOP (Group of Pictures) Structure

A **GOP** is the sequence of frames from one I-frame to the next (exclusive).
It is the fundamental unit of video stream structure.

```
Closed GOP (most common for streaming):
+-----+---+---+---+---+---+---+---+---+---+---+---+-----+
| I   | B | B | P | B | B | P | B | B | P | B | B | I   |
+-----+---+---+---+---+---+---+---+---+---+---+---+-----+
|<=================== GOP (12 frames) ===============>|

GOP size = 12 frames
At 30fps: one I-frame every 0.4 seconds
At 60fps: one I-frame every 0.2 seconds
```

| GOP Parameter     | Typical Value | Effect                                  |
| ----------------- | ------------- | --------------------------------------- |
| GOP size          | 30-250        | Larger = better compression, worse seek |
| Number of B's     | 0-5           | More B's = better compression           |
| Closed GOP        | Yes/No        | Closed: no cross-GOP references         |
| Keyframe interval | 1-10 seconds  | For streaming: 1-4 seconds typical      |

**Trade-offs:**

- **Longer GOPs** = better compression (fewer expensive I-frames), but slower
  random access / seeking
- **Shorter GOPs** = worse compression, but faster seeking, better error recovery
- **Streaming standard**: GOP = 2x frame rate (e.g., 60 frames at 30fps = 2 sec)

### 8.4 Motion Estimation and Compensation

The core technique that makes P-frames and B-frames work.

**Motion estimation**: For each block in the current frame, search the reference
frame(s) for the best matching block. The displacement is a **motion vector**.

```
Reference Frame (previous I or P):         Current P-frame:
+---------------------------+              +---------------------------+
|                           |              |                           |
|   [Block A]               |              |         [Block A']        |
|   at (100, 200)           |              |         at (130, 210)     |
|                           |              |                           |
+---------------------------+              +---------------------------+

Motion vector for this block: (30, 10)
Meaning: "Block A moved 30 pixels right and 10 pixels down"

Residual = Block_A' - Block_A_predicted
(The residual is typically very small, requiring few bits to encode)
```

**Block matching algorithms:**

| Algorithm         | Description                      | Complexity |
| ----------------- | -------------------------------- | ---------- |
| Full Search       | Check every possible position    | Very high  |
| Three Step Search | Logarithmic step reduction       | Medium     |
| Diamond Search    | Diamond-shaped search pattern    | Medium-Low |
| Hexagonal Search  | Hexagonal pattern, used in x264  | Low        |
| UMH (Uneven MH)   | Multi-hex with early termination | Medium     |

Modern codecs (H.264+) use:

- Variable block sizes (from 64x64 down to 4x4)
- Sub-pixel motion estimation (quarter-pixel precision)
- Multiple reference frames
- Weighted prediction

### 8.5 Block-Based Hybrid Coding Architecture

All modern video codecs (H.264, H.265/HEVC, VP9, AV1) follow the same basic
architecture:

```
                    Video Encoder Block Diagram

Input Frame
      |
      v
+--[Intra or Inter?]--+
|                      |
v                      v
Intra Prediction    Motion Estimation
(spatial)           (temporal)
|                      |
v                      v
Form Prediction <------+
      |
      v
Residual = Original - Prediction
      |
      v
Transform (DCT/DST)
      |
      v
Quantization (QP)
      |
      v
Entropy Coding (CABAC/CAVLC)
      |
      v
Bitstream Output

      |
      +----> Inverse Quantize + Inverse Transform
                    |
                    v
              Reconstruct = Prediction + Residual
                    |
                    v
              In-Loop Filters (Deblock, SAO, ALF)
                    |
                    v
              Reference Frame Buffer (DPB)
```

### 8.6 Rate Control

Rate control determines how many bits to allocate to each frame, macroblock,
or coding unit. It adjusts the QP (Quantization Parameter) dynamically.

| Mode | Full Name                   | Description                                        |
| ---- | --------------------------- | -------------------------------------------------- |
| CBR  | Constant Bit Rate           | Fixed bitrate; QP varies. Required for live        |
| VBR  | Variable Bit Rate           | Target avg bitrate; allows peaks. Good for VOD     |
| CRF  | Constant Rate Factor        | Constant perceptual quality; file size varies      |
| CQP  | Constant Quantization Param | Fixed QP; quality/size unpredictable. Testing only |
| ABR  | Average Bit Rate            | Similar to VBR, targets average. Common in FFmpeg  |

**CRF scale** (used by x264, x265, libsvtav1):

```
CRF Value:    0 -------- 18 -------- 23 -------- 28 -------- 51
Quality:    Lossless    Excellent    Good       Acceptable    Terrible
File Size:  Enormous    Large        Medium     Small         Tiny

Recommended starting points:
  x264 (H.264): CRF 18-23
  x265 (H.265): CRF 22-28 (not directly comparable to x264)
  SVT-AV1:      CRF 25-35
```

**CRF vs CBR for streaming:**

CBR is required for live streaming because the encoder must produce a predictable
bitrate that fits within network bandwidth. CRF is ideal for file-based encoding
(VOD) because it allocates bits based on content complexity, giving better
quality per byte.

### 8.7 Major Video Codecs Comparison

| Codec      | Standard | Year | Compression vs H.264 | License      |
| ---------- | -------- | ---- | -------------------- | ------------ |
| H.264/AVC  | ITU/ISO  | 2003 | Baseline             | Patented     |
| H.265/HEVC | ITU/ISO  | 2013 | ~40-50% better       | Patented     |
| VP9        | Google   | 2013 | ~30-40% better       | Royalty-free |
| AV1        | AOMedia  | 2018 | ~50-60% better       | Royalty-free |
| VVC/H.266  | ITU/ISO  | 2020 | ~60-70% better       | Patented     |

---

## 9. Key Libraries

### 9.1 FFmpeg

The Swiss Army knife of multimedia. Handles encoding, decoding, transcoding,
muxing, demuxing, filtering, and streaming.

```bash
# Convert raw YUV to H.264
ffmpeg -f rawvideo -pix_fmt yuv420p -s 1920x1080 -r 30 \
       -i input.yuv -c:v libx264 -crf 23 output.mp4

# Extract raw YUV from a video
ffmpeg -i input.mp4 -f rawvideo -pix_fmt yuv420p output.yuv

# Scale video to 720p
ffmpeg -i input.mp4 -vf scale=1280:720 output.mp4

# Convert color space
ffmpeg -i input.mp4 -vf colorspace=bt709:iall=bt601 output.mp4
```

### 9.2 OpenCV

Computer vision library with strong video I/O and processing capabilities.
Default color format is BGR (not RGB).

```python
import cv2

cap = cv2.VideoCapture("input.mp4")
while cap.isOpened():
    ret, frame = cap.read()      # frame is BGR numpy array
    if not ret:
        break
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    yuv = cv2.cvtColor(frame, cv2.COLOR_BGR2YUV)
    cv2.imshow("Gray", gray)
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break
cap.release()
```

### 9.3 Pillow (PIL)

Python Imaging Library for image manipulation. Useful for frame-level
operations but not designed for video processing.

```python
from PIL import Image
import numpy as np

# Create image from numpy array
arr = np.zeros((1080, 1920, 3), dtype=np.uint8)
img = Image.fromarray(arr, mode='RGB')
img.save("frame.png")

# Convert between modes
ycbcr_img = img.convert('YCbCr')
```

### 9.4 ImageMagick

Command-line tool for image manipulation:

```bash
# Resize an image
convert input.png -resize 1920x1080 output.png

# Convert to YCbCr TIFF
convert input.png -colorspace YCbCr output.tiff

# Create a color test pattern
convert -size 1920x1080 plasma: testpattern.png
```

### 9.5 NumPy

The foundation for raw video manipulation in Python. Every pixel format can be
represented as a numpy array.

```python
import numpy as np

# Read raw YUV420P frame
width, height = 1920, 1080
frame_size = width * height * 3 // 2
raw = np.fromfile("frame.yuv", dtype=np.uint8, count=frame_size)

# Split into planes
y_size = width * height
uv_size = width * height // 4
y = raw[:y_size].reshape(height, width)
u = raw[y_size:y_size + uv_size].reshape(height // 2, width // 2)
v = raw[y_size + uv_size:].reshape(height // 2, width // 2)
```

### 9.6 GStreamer

A pipeline-based multimedia framework used heavily in embedded and Linux systems:

```bash
# Display a test pattern
gst-launch-1.0 videotestsrc ! autovideosink

# Transcode a file
gst-launch-1.0 filesrc location=input.mp4 ! decodebin ! \
  x264enc ! mp4mux ! filesink location=output.mp4
```

---

## 10. Code Examples

### 10.1 Generate a Raw YUV420P Frame with NumPy

```python
import numpy as np

def generate_yuv420p_color_bars(width: int, height: int) -> bytes:
    """
    Generate a standard color bar pattern in YUV420P format.
    Returns raw bytes suitable for writing to a .yuv file.

    Color bars (left to right):
    White, Yellow, Cyan, Green, Magenta, Red, Blue, Black
    """
    # Define color bars in RGB
    bars_rgb = [
        (235, 235, 235),  # White
        (235, 235, 16),   # Yellow
        (16, 235, 235),   # Cyan
        (16, 235, 16),    # Green
        (235, 16, 235),   # Magenta
        (235, 16, 16),    # Red
        (16, 16, 235),    # Blue
        (16, 16, 16),     # Black
    ]

    # Create RGB frame
    frame_rgb = np.zeros((height, width, 3), dtype=np.float64)
    bar_width = width // len(bars_rgb)

    for i, (r, g, b) in enumerate(bars_rgb):
        x_start = i * bar_width
        x_end = (i + 1) * bar_width if i < len(bars_rgb) - 1 else width
        frame_rgb[..., 0][..., x_start:x_end] = r  # R channel (note: no mutation of original)
        frame_rgb[..., 1][..., x_start:x_end] = g
        frame_rgb[..., 2][..., x_start:x_end] = b

    r = frame_rgb[..., 0]
    g = frame_rgb[..., 1]
    b = frame_rgb[..., 2]

    # Convert to YCbCr using BT.709 coefficients
    y_plane = np.clip(
        0.2126 * r + 0.7152 * g + 0.0722 * b,
        16, 235
    ).astype(np.uint8)

    cb_plane = np.clip(
        -0.1146 * r - 0.3854 * g + 0.5000 * b + 128,
        16, 240
    ).astype(np.uint8)

    cr_plane = np.clip(
        0.5000 * r - 0.4542 * g - 0.0458 * b + 128,
        16, 240
    ).astype(np.uint8)

    # Subsample chroma to 4:2:0 by averaging 2x2 blocks
    cb_420 = cb_plane[0::2, 0::2] // 2 + cb_plane[0::2, 1::2] // 2
    cr_420 = cr_plane[0::2, 0::2] // 2 + cr_plane[0::2, 1::2] // 2

    # Concatenate planes: Y (full) + Cb (quarter) + Cr (quarter)
    return b''.join([
        y_plane.tobytes(),
        cb_420.tobytes(),
        cr_420.tobytes()
    ])


# Generate and save a 1920x1080 color bar frame
frame_data = generate_yuv420p_color_bars(1920, 1080)
with open("colorbars_1920x1080.yuv", "wb") as f:
    f.write(frame_data)

print(f"Frame size: {len(frame_data)} bytes")
print(f"Expected:   {1920 * 1080 * 3 // 2} bytes")
# Output:
# Frame size: 3110400 bytes
# Expected:   3110400 bytes
```

### 10.2 Convert Between Color Spaces with NumPy

```python
import numpy as np
from typing import Tuple

# Type aliases for clarity
RGBFrame = np.ndarray   # shape: (H, W, 3), dtype: uint8
YCbCrFrame = np.ndarray # shape: (H, W, 3), dtype: uint8


def rgb_to_ycbcr_bt709(rgb: RGBFrame) -> YCbCrFrame:
    """
    Convert an RGB frame to YCbCr using BT.709 coefficients.
    Full-range input (0-255), video-range output (Y: 16-235, C: 16-240).
    """
    rgb_float = rgb.astype(np.float64)
    r, g, b = rgb_float[..., 0], rgb_float[..., 1], rgb_float[..., 2]

    y = np.clip(16 + 65.481 * r / 255 + 128.553 * g / 255 + 24.966 * b / 255,
                16, 235)
    cb = np.clip(128 - 37.797 * r / 255 - 74.203 * g / 255 + 112.0 * b / 255,
                 16, 240)
    cr = np.clip(128 + 112.0 * r / 255 - 101.772 * g / 255 - 10.228 * b / 255,
                 16, 240)

    return np.stack([y, cb, cr], axis=-1).astype(np.uint8)


def ycbcr_bt709_to_rgb(ycbcr: YCbCrFrame) -> RGBFrame:
    """
    Convert a YCbCr (BT.709) frame back to RGB.
    Video-range input, full-range output.
    """
    ycbcr_float = ycbcr.astype(np.float64)
    y, cb, cr = ycbcr_float[..., 0], ycbcr_float[..., 1], ycbcr_float[..., 2]

    r = np.clip(1.164 * (y - 16) + 1.793 * (cr - 128), 0, 255)
    g = np.clip(1.164 * (y - 16) - 0.213 * (cb - 128) - 0.533 * (cr - 128), 0, 255)
    b = np.clip(1.164 * (y - 16) + 2.112 * (cb - 128), 0, 255)

    return np.stack([r, g, b], axis=-1).astype(np.uint8)


def rgb_to_ycbcr_bt601(rgb: RGBFrame) -> YCbCrFrame:
    """
    Convert an RGB frame to YCbCr using BT.601 coefficients.
    Note the different luma weights compared to BT.709.
    """
    rgb_float = rgb.astype(np.float64)
    r, g, b = rgb_float[..., 0], rgb_float[..., 1], rgb_float[..., 2]

    y = np.clip(16 + 65.481 * r / 255 + 128.553 * g / 255 + 24.966 * b / 255,
                16, 235)
    cb = np.clip(128 - 37.797 * r / 255 - 74.203 * g / 255 + 112.0 * b / 255,
                 16, 240)
    cr = np.clip(128 + 112.0 * r / 255 - 101.772 * g / 255 - 10.228 * b / 255,
                 16, 240)

    return np.stack([y, cb, cr], axis=-1).astype(np.uint8)


# Demo: round-trip conversion
test_rgb = np.random.randint(0, 256, (4, 4, 3), dtype=np.uint8)
ycbcr = rgb_to_ycbcr_bt709(test_rgb)
recovered = ycbcr_bt709_to_rgb(ycbcr)

print("Original RGB:\n", test_rgb[0, 0])
print("YCbCr:\n", ycbcr[0, 0])
print("Recovered RGB:\n", recovered[0, 0])
print(f"Max round-trip error: {np.max(np.abs(test_rgb.astype(int) - recovered.astype(int)))}")
# Typical output: Max round-trip error: 2 (due to integer rounding)
```

### 10.3 Calculate Bandwidth for Raw Video

```python
from typing import NamedTuple


class VideoFormat(NamedTuple):
    width: int
    height: int
    fps: float
    bits_per_pixel: float
    name: str


def calculate_bandwidth(fmt: VideoFormat) -> dict:
    """
    Calculate raw bandwidth requirements for a video format.
    Returns a dictionary with various bandwidth representations.
    """
    frame_bytes = fmt.width * fmt.height * fmt.bits_per_pixel / 8
    bytes_per_second = frame_bytes * fmt.fps
    bits_per_second = bytes_per_second * 8

    return {
        "format": fmt.name,
        "resolution": f"{fmt.width}x{fmt.height}",
        "fps": fmt.fps,
        "frame_size_bytes": int(frame_bytes),
        "frame_size_mb": round(frame_bytes / (1024 * 1024), 2),
        "bitrate_mbps": round(bits_per_second / 1_000_000, 2),
        "bitrate_gbps": round(bits_per_second / 1_000_000_000, 3),
        "per_minute_gb": round(bytes_per_second * 60 / (1024**3), 2),
        "per_hour_gb": round(bytes_per_second * 3600 / (1024**3), 1),
    }


def print_bandwidth_table(formats: list) -> None:
    """Print a formatted bandwidth comparison table."""
    header = (
        f"{'Format':<25} {'Resolution':<12} {'FPS':>5} "
        f"{'Frame MB':>10} {'Mbps':>10} {'Gbps':>8} {'GB/hr':>10}"
    )
    print(header)
    print("-" * len(header))

    for fmt in formats:
        stats = calculate_bandwidth(fmt)
        print(
            f"{stats['format']:<25} {stats['resolution']:<12} "
            f"{stats['fps']:>5.1f} {stats['frame_size_mb']:>10.2f} "
            f"{stats['bitrate_mbps']:>10.1f} {stats['bitrate_gbps']:>8.3f} "
            f"{stats['per_hour_gb']:>10.1f}"
        )


# Define common video formats
formats = [
    VideoFormat(1280, 720, 30, 12, "720p YUV420"),
    VideoFormat(1920, 1080, 30, 12, "1080p YUV420 @30"),
    VideoFormat(1920, 1080, 60, 12, "1080p YUV420 @60"),
    VideoFormat(1920, 1080, 30, 24, "1080p RGB24 @30"),
    VideoFormat(3840, 2160, 30, 12, "4K UHD YUV420 @30"),
    VideoFormat(3840, 2160, 60, 12, "4K UHD YUV420 @60"),
    VideoFormat(3840, 2160, 60, 15, "4K UHD YUV420 10bit @60"),
    VideoFormat(7680, 4320, 60, 12, "8K UHD YUV420 @60"),
    VideoFormat(7680, 4320, 120, 15, "8K UHD YUV420 10bit @120"),
]

print_bandwidth_table(formats)

# Sample output:
# Format                    Resolution    FPS   Frame MB       Mbps     Gbps      GB/hr
# -----------------------------------------------------------------------------------------
# 720p YUV420               1280x720     30.0       1.32      316.4    0.316      142.3
# 1080p YUV420 @30          1920x1080    30.0       2.97      711.9    0.712      320.3
# 1080p YUV420 @60          1920x1080    60.0       2.97     1423.9    1.424      640.6
# 1080p RGB24 @30           1920x1080    30.0       5.93     1423.9    1.424      640.6
# 4K UHD YUV420 @30         3840x2160    30.0      11.88     2847.7    2.848     1281.2
# 4K UHD YUV420 @60         3840x2160    60.0      11.88     5695.5    5.695     2562.4
# 4K UHD YUV420 10bit @60   3840x2160    60.0      14.85     7119.4    7.119     3203.0
# 8K UHD YUV420 @60         7680x4320    60.0      47.52    22781.9   22.782    10249.6
# 8K UHD YUV420 10bit @120  7680x4320   120.0      59.40    56954.9   56.955    25624.0
```

### 10.4 Read and Display NV12 Frame

```python
import numpy as np


def nv12_to_rgb(nv12_data: bytes, width: int, height: int) -> np.ndarray:
    """
    Convert NV12 raw data to an RGB numpy array.
    NV12: Y plane followed by interleaved UV plane.
    Uses BT.709 coefficients.
    """
    y_size = width * height
    uv_size = width * height // 2

    if len(nv12_data) < y_size + uv_size:
        raise ValueError(
            f"NV12 data too small: expected {y_size + uv_size}, got {len(nv12_data)}"
        )

    # Parse Y plane
    y = np.frombuffer(nv12_data, dtype=np.uint8, count=y_size)
    y = y.reshape(height, width).astype(np.float64)

    # Parse interleaved UV plane
    uv = np.frombuffer(nv12_data, dtype=np.uint8, offset=y_size, count=uv_size)
    uv = uv.reshape(height // 2, width)

    # Separate U and V (interleaved: U0 V0 U1 V1 ...)
    u = uv[:, 0::2].astype(np.float64)  # Even columns
    v = uv[:, 1::2].astype(np.float64)  # Odd columns

    # Upsample chroma from (H/2, W/2) to (H, W) using nearest neighbor
    u_full = np.repeat(np.repeat(u, 2, axis=0), 2, axis=1)
    v_full = np.repeat(np.repeat(v, 2, axis=0), 2, axis=1)

    # BT.709 YCbCr to RGB conversion
    r = np.clip(1.164 * (y - 16) + 1.793 * (v - 128), 0, 255)
    g = np.clip(1.164 * (y - 16) - 0.213 * (u - 128) - 0.533 * (v - 128), 0, 255)
    b = np.clip(1.164 * (y - 16) + 2.112 * (u - 128), 0, 255)

    return np.stack([r, g, b], axis=-1).astype(np.uint8)


# Example usage:
# with open("frame.nv12", "rb") as f:
#     nv12_data = f.read()
# rgb_frame = nv12_to_rgb(nv12_data, 1920, 1080)
# Image.fromarray(rgb_frame).save("frame.png")
```

### 10.5 Generate a Gradient Test Pattern

```python
import numpy as np


def generate_gradient_yuv420p(width: int, height: int) -> bytes:
    """
    Generate a horizontal luma gradient with a color sweep in chroma.
    Useful for testing color space conversions and banding artifacts.
    """
    # Y: horizontal gradient from black (16) to white (235)
    y_row = np.linspace(16, 235, width, dtype=np.float64)
    y_plane = np.tile(y_row, (height, 1)).astype(np.uint8)

    # Cb: vertical gradient from 16 to 240
    cb_col = np.linspace(16, 240, height // 2, dtype=np.float64)
    cb_plane = np.tile(cb_col.reshape(-1, 1), (1, width // 2)).astype(np.uint8)

    # Cr: diagonal gradient
    cr_x = np.linspace(16, 240, width // 2, dtype=np.float64)
    cr_y = np.linspace(16, 240, height // 2, dtype=np.float64)
    cr_plane = np.clip(
        (cr_x[np.newaxis, :] + cr_y[:, np.newaxis]) / 2,
        16, 240
    ).astype(np.uint8)

    return b''.join([
        y_plane.tobytes(),
        cb_plane.tobytes(),
        cr_plane.tobytes()
    ])


# Generate and verify
frame = generate_gradient_yuv420p(1920, 1080)
expected = 1920 * 1080 + 2 * (960 * 540)
print(f"Generated {len(frame)} bytes (expected {expected})")
```

---

## 11. Common Interview Questions

### Conceptual Questions

**Q1: Why does video use YCbCr instead of RGB?**

YCbCr separates luminance (brightness) from chrominance (color). Since human
vision has higher spatial resolution for brightness than for color, the chroma
channels (Cb, Cr) can be subsampled (e.g., 4:2:0) without perceptible quality
loss. This immediately saves 50% of raw data before any compression. RGB does
not allow this separation, so all three channels must be stored at full
resolution.

---

**Q2: What is chroma subsampling 4:2:0 and why is it so widely used?**

4:2:0 means the chroma (color) channels are sampled at half the resolution of
luma in both the horizontal and vertical dimensions. For every 2x2 block of
pixels, there is one shared Cb value and one shared Cr value, but four
independent Y (luma) values. This reduces the data from 24 bits/pixel (4:4:4)
to 12 bits/pixel -- a 50% savings. It is ubiquitous in consumer video (H.264,
H.265, AV1, streaming, Blu-ray) because the quality loss is imperceptible at
normal viewing distances for natural content.

---

**Q3: Explain the difference between I-frames, P-frames, and B-frames.**

- **I-frame (Intra)**: Compressed independently like a JPEG. No references to
  other frames. Largest but provides random access points.
- **P-frame (Predictive)**: References one or more previous frames. Encodes
  only the differences (motion vectors + residuals). Much smaller than I-frames.
- **B-frame (Bi-predictive)**: References both previous AND future frames. Most
  efficient compression but requires frames to be decoded out of display order.
  Adds latency because the encoder must buffer future frames.

---

**Q4: Calculate the raw bandwidth of 4K 60fps 10-bit YUV 4:2:0 video.**

```
Width x Height = 3840 x 2160 = 8,294,400 pixels

YUV 4:2:0 with 10-bit:
  Y:  8,294,400 samples x 10 bits = 82,944,000 bits
  Cb: 8,294,400 / 4 samples x 10 bits = 20,736,000 bits
  Cr: 8,294,400 / 4 samples x 10 bits = 20,736,000 bits
  Total per frame: 124,416,000 bits = 15,552,000 bytes = ~14.83 MB

At 60 fps:
  124,416,000 x 60 = 7,464,960,000 bits/second
                    = ~7.46 Gbps
                    = ~933 MB/s

Per hour: 933 x 3600 = ~3,279 GB = ~3.2 TB
```

This explains why compression ratios of 100:1 to 1000:1 are necessary for
practical video delivery.

---

**Q5: What is a GOP and how does its size affect video?**

A GOP (Group of Pictures) is the sequence from one I-frame to the next. Typical
GOPs follow patterns like IBBBPBBBPBBBI.

- **Longer GOP**: Better compression (fewer expensive I-frames per second), but
  slower random access (seeking to a point requires decoding from the nearest
  I-frame) and worse error resilience.
- **Shorter GOP**: Worse compression (more I-frames), but faster seeking and
  better error recovery.
- **Streaming**: Typically 1-4 second GOPs for adaptive bitrate switching.
- **Live**: Often 1-2 second GOPs for low latency.

---

**Q6: What is the difference between BT.601 and BT.709? Why does it matter?**

BT.601 and BT.709 are ITU standards that define different RGB-to-YCbCr
conversion matrices and color primaries. BT.601 is for SD video; BT.709 is for
HD and above.

The luma coefficients differ:

- BT.601: Y = 0.299R + 0.587G + 0.114B
- BT.709: Y = 0.2126R + 0.7152G + 0.0722B

If you apply BT.601 coefficients to BT.709 content (or vice versa), the colors
will be noticeably wrong -- typically washed out greens or shifted skin tones.
This is one of the most common bugs in video pipelines.

---

**Q7: What is the difference between CBR, VBR, and CRF?**

- **CBR (Constant Bit Rate)**: The encoder outputs a fixed number of bits per
  second. Simple scenes are over-allocated, complex scenes are under-allocated.
  Required for live streaming and broadcasting.
- **VBR (Variable Bit Rate)**: The bitrate varies around a target average.
  Complex scenes get more bits, simple scenes get fewer. Better quality per byte
  than CBR.
- **CRF (Constant Rate Factor)**: The encoder targets constant perceptual
  quality, letting the bitrate vary freely. File size is unpredictable but
  quality is consistent. Ideal for file-based encoding.

---

**Q8: How does motion estimation work in video codecs?**

Motion estimation searches for the best matching block in reference frame(s)
for each block in the current frame. The displacement is recorded as a motion
vector. Instead of encoding all pixel values, the codec encodes:

1. The motion vector (a few bytes)
2. The residual (difference between the predicted and actual block)

Since the residual is usually very small (mostly near-zero values), it
compresses extremely well. This is the primary mechanism that makes video
compression efficient -- exploiting temporal redundancy between frames.

Modern codecs use variable block sizes (4x4 to 64x64), sub-pixel precision
(quarter-pixel in H.264+), and multiple reference frames.

---

**Q9: Explain the difference between NV12 and I420 (YUV420P).**

Both are YUV 4:2:0 formats using 1.5 bytes per pixel. The difference is in how
the chroma data is stored:

- **I420 (YUV420P)**: Three separate planes: Y plane, then U plane, then V plane.
  All contiguous but separate.
- **NV12**: Two planes: Y plane, then a single interleaved UV plane where U and V
  bytes alternate (U0 V0 U1 V1 ...).

NV12 is preferred by hardware decoders and GPUs because the interleaved UV data
has better cache locality when both U and V are needed together (which is always
the case during color conversion). I420 is more common in software pipelines
because separate planes are easier to process independently.

---

**Q10: What is gamma and why do we need it?**

Gamma describes the nonlinear relationship between a pixel's numerical value and
the physical brightness it produces on a display. Human vision perceives
brightness logarithmically -- we are much more sensitive to differences in dark
tones than bright ones.

Gamma encoding (applying a power function of approximately 1/2.2) allocates more
code values to dark tones, where our eyes are most discriminating. Without gamma,
an 8-bit linear encoding would show visible banding in shadows because too few
code values would represent the dark range where our eyes are most sensitive.

For HDR content, the PQ (Perceptual Quantizer, SMPTE ST 2084) transfer function
replaces traditional gamma. PQ is optimized for the wider luminance range (up to
10,000 nits) and maps code values to absolute luminance levels.

---

### Estimation and Design Questions

**Q11: A client wants to stream 1080p 30fps video over a 5 Mbps connection. What codec settings would you recommend?**

Raw 1080p 30fps YUV420 requires ~712 Mbps. We need approximately 142:1
compression to fit in 5 Mbps.

Recommended:

- **Codec**: H.264 (broadest compatibility) or H.265 (better compression)
- **H.264 at 5 Mbps**: Achievable with CRF ~23 or CBR 5M. Quality will be
  good for most content.
- **H.265 at 3-4 Mbps**: Equivalent visual quality to H.264 at 5 Mbps.
- **GOP**: 2 seconds (60 frames) for ABR streaming
- **Profile**: H.264 High, Level 4.0
- **B-frames**: 2-3 for better compression
- **Resolution**: Consider adaptive bitrate with 720p fallback

---

**Q12: Design a pipeline to process uploaded user videos for a social media platform.**

```
Upload -> Validate -> Transcode -> Store -> CDN

Detailed pipeline:
1. Upload: Accept via chunked upload API
2. Validate: Check container, duration limits, resolution
3. Probe: Extract metadata (resolution, codec, fps, duration)
4. Transcode to multiple renditions:
   - 1080p @ 4.5 Mbps (H.264 High)
   - 720p  @ 2.5 Mbps
   - 480p  @ 1.0 Mbps
   - 360p  @ 0.5 Mbps
5. Generate thumbnails (I-frame extraction)
6. Create HLS/DASH manifests
7. Store segments in object storage (S3)
8. Distribute via CDN
9. Clean up temporary files
```

---

### Quick-Fire Technical Questions

| Question                                            | Answer                                                                   |
| --------------------------------------------------- | ------------------------------------------------------------------------ |
| How many bytes is a 1080p YUV420 frame?             | 1920 x 1080 x 1.5 = 3,110,400 bytes (~2.97 MB)                           |
| What is the pixel format of most hardware decoders? | NV12                                                                     |
| Why is OpenCV BGR instead of RGB?                   | Historical: early camera hardware used BGR byte order                    |
| What does CRF 0 mean in x264?                       | Mathematically lossless encoding                                         |
| What is a keyframe interval of 2 seconds at 30fps?  | GOP size = 60 frames                                                     |
| What is the most common chroma subsampling?         | 4:2:0                                                                    |
| H.264 vs H.265 compression improvement?             | H.265 is ~40-50% better at the same quality                              |
| What is CABAC?                                      | Context-Adaptive Binary Arithmetic Coding (entropy coder in H.264/H.265) |
| What causes banding in video gradients?             | Insufficient bit depth (8-bit) + aggressive quantization                 |
| What is a deblocking filter?                        | In-loop filter that smooths block boundaries in coded video              |

---

## Summary: Key Takeaways

1. **Video is a sequence of still images** displayed fast enough to create the
   illusion of motion (persistence of vision).

2. **YCbCr separates brightness from color**, enabling chroma subsampling (4:2:0)
   which cuts raw data in half with negligible visual impact.

3. **Raw video is enormous** -- 1080p 30fps YUV420 is ~712 Mbps. Compression
   ratios of 100:1+ are necessary.

4. **Image compression** (JPEG-like) removes spatial redundancy using
   DCT + quantization + entropy coding.

5. **Video compression** additionally removes temporal redundancy using
   I/P/B-frames, motion estimation, and GOP structures.

6. **Color science matters** -- using the wrong BT.601/709 matrix, incorrect
   gamma, or mismatched color range will produce visually wrong results.

7. **NV12 is the hardware standard**, I420/YUV420P is the software standard.
   Know both formats and how to convert between them.

8. **Rate control** (CBR for live, CRF for files) determines the quality/size
   tradeoff. Understanding this is essential for any video pipeline.

9. **Always calculate raw bandwidth first** when designing a video system. It
   gives you the baseline for how much compression you need.

10. **Modern codecs** (H.264, H.265, AV1) all use the same hybrid block-based
    architecture: prediction + transform + quantize + entropy code.
