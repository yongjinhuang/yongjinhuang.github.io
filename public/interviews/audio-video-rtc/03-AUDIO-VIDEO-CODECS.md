# Audio and Video Codecs: A Deep Dive for Software Engineers

Codecs (coder-decoder) are the algorithms that compress and decompress media data.
Understanding how they work, their tradeoffs, and how to configure them is essential
for anyone building video streaming platforms, real-time communication systems, or
media processing pipelines. This guide covers every major codec in production use today.

---

## Table of Contents

1. [Video Codec Fundamentals](#1-video-codec-fundamentals)
2. [H.264/AVC](#2-h264avc)
3. [H.265/HEVC](#3-h265hevc)
4. [VP8/VP9](#4-vp8vp9)
5. [AV1](#5-av1)
6. [H.266/VVC](#6-h266vvc)
7. [Video Codec Comparison](#7-video-codec-comparison)
8. [Audio Codec Fundamentals](#8-audio-codec-fundamentals)
9. [MP3 (MPEG-1 Layer III)](#9-mp3-mpeg-1-layer-iii)
10. [AAC](#10-aac)
11. [Opus](#11-opus)
12. [Vorbis and FLAC](#12-vorbis-and-flac)
13. [Audio Codec Comparison](#13-audio-codec-comparison)
14. [Encoding Parameters](#14-encoding-parameters)
15. [Hardware Acceleration](#15-hardware-acceleration)
16. [Codec Negotiation](#16-codec-negotiation)

---

## 1. Video Codec Fundamentals

Before diving into specific codecs, it helps to understand the core ideas that all
modern video codecs share.

### Why Compress Video?

Raw, uncompressed 1080p video at 30 fps with 8-bit 4:2:0 color runs at roughly:

```
1920 x 1080 pixels x 1.5 bytes/pixel (YUV 4:2:0) x 30 fps = ~93 MB/s = ~746 Mbps
```

A two-hour movie at that rate would be approximately 670 GB. Compression makes storage
and transmission feasible. Modern codecs achieve 200:1 to 1000:1 compression ratios
while maintaining perceptually excellent quality.

### Core Compression Techniques

Every modern video codec uses some combination of these techniques:

| Technique              | Description                                                        |
| ---------------------- | ------------------------------------------------------------------ |
| Intra prediction       | Predict pixels from neighboring pixels within the same frame       |
| Inter prediction       | Predict pixels from previously decoded reference frames            |
| Transform coding       | Convert spatial-domain residuals to frequency domain (DCT/DST)     |
| Quantization           | Reduce precision of transform coefficients (lossy step)            |
| Entropy coding         | Losslessly compress quantized data (Huffman, arithmetic, ANS)      |
| In-loop filtering      | Reduce blocking artifacts before the frame is used as a reference  |
| Motion compensation    | Encode motion vectors instead of raw pixel differences             |

### Frame Types

| Frame Type | Name         | Description                                                     |
| ---------- | ------------ | --------------------------------------------------------------- |
| I-frame    | Intra frame  | Self-contained; no dependencies on other frames                 |
| P-frame    | Predicted    | References one or more past frames                              |
| B-frame    | Bi-predicted | References both past and future frames for better compression   |

A typical Group of Pictures (GOP) structure might look like:

```
I B B P B B P B B P B B I
```

The I-frame interval (keyframe interval) affects both compression efficiency (longer
intervals = better compression) and seek granularity (shorter intervals = faster seeking).

---

## 2. H.264/AVC

**H.264/AVC** (Advanced Video Coding), standardized by ITU-T and ISO/IEC in 2003, is
the single most important video codec ever created. It remains the most widely deployed
video codec in the world across streaming, broadcast, surveillance, video conferencing,
and Blu-ray.

### Why H.264 Dominates

- Universal hardware decode support (every phone, tablet, laptop, TV, set-top box)
- Mature, highly optimized encoder implementations (x264, NVENC, QSV, VideoToolbox)
- Well-understood patent licensing through MPEG-LA
- Excellent quality-to-bitrate ratio (revolutionary when introduced)
- Supported by every browser, every player, every container format

### Profiles

H.264 defines profiles that specify which coding tools are available. Higher profiles
enable more advanced features at the cost of encoding/decoding complexity.

| Profile    | Key Features                                      | Typical Use Case           |
| ---------- | ------------------------------------------------- | -------------------------- |
| Baseline   | I and P slices only, CAVLC only, no B-frames      | Video conferencing, mobile |
| Main       | B-frames, weighted prediction, CABAC              | Standard streaming         |
| High       | 8x8 transform, quantization matrices, monochrome  | Broadcast, Blu-ray, VOD    |
| High 10    | 10-bit color depth                                 | HDR content, grading       |
| High 4:2:2 | 4:2:2 chroma subsampling                          | Professional production    |
| High 4:4:4 | 4:4:4 chroma, lossless coding                     | Studio mastering           |

In practice, the **High profile** is used for nearly all consumer streaming and the
**Baseline profile** for real-time communication (WebRTC, video calling).

### Levels

Levels constrain the maximum resolution, frame rate, and bitrate that a decoder must
support. They are orthogonal to profiles.

| Level | Max Resolution | Max Frame Rate | Max Bitrate (High) |
| ----- | -------------- | -------------- | ------------------- |
| 3.0   | 720x480        | 30 fps         | 10 Mbps             |
| 3.1   | 1280x720       | 30 fps         | 14 Mbps             |
| 4.0   | 2048x1024      | 30 fps         | 20 Mbps             |
| 4.1   | 2048x1024      | 30 fps         | 50 Mbps             |
| 5.0   | 3672x1536      | 30 fps         | 135 Mbps            |
| 5.1   | 4096x2160      | 30 fps         | 240 Mbps            |
| 5.2   | 4096x2160      | 60 fps         | 240 Mbps            |

A codec string like `avc1.640028` encodes: **avc1** (H.264), profile_idc **64** (High),
constraint flags **00**, level_idc **28** (Level 4.0 = 0x28 = 40 decimal).

### NAL Units

H.264 bitstreams are composed of **Network Abstraction Layer (NAL) units**. Each NAL
unit has a one-byte header specifying its type:

```
+---------------+
| 0 | NRI | Type|   (1 byte: forbidden_zero_bit, nal_ref_idc, nal_unit_type)
+---------------+
| Payload ...   |
+---------------+
```

Critical NAL unit types:

| NAL Type | Value | Description                                         |
| -------- | ----- | --------------------------------------------------- |
| SPS      | 7     | Sequence Parameter Set (resolution, profile, level) |
| PPS      | 8     | Picture Parameter Set (entropy coding, slices)      |
| IDR      | 5     | Instantaneous Decoder Refresh (keyframe)            |
| Non-IDR  | 1     | Coded slice of a non-IDR picture                    |
| SEI      | 6     | Supplemental Enhancement Information                |

### SPS and PPS

The **Sequence Parameter Set (SPS)** and **Picture Parameter Set (PPS)** are the most
critical metadata structures in an H.264 stream.

**SPS** contains:
- Profile and level
- Resolution (pic_width_in_mbs, pic_height_in_map_units)
- Maximum number of reference frames
- Frame cropping offsets
- VUI (Video Usability Information): timing, color space, aspect ratio

**PPS** contains:
- Entropy coding mode (CABAC or CAVLC)
- Number of slice groups
- Weighted prediction flags
- Deblocking filter parameters
- Initial QP offset

SPS and PPS must be transmitted before any coded slices. In containerized formats
(MP4/fMP4), they are stored in the `avcC` box. In RTP, they are sent in-band or
via SDP `sprop-parameter-sets`.

### Slice Types

A single frame can be split into multiple **slices**, each independently decodable:

| Slice Type | Contains             | Use Case                              |
| ---------- | -------------------- | ------------------------------------- |
| I-slice    | Only intra MBs       | Random access, error recovery         |
| P-slice    | Intra + inter (past) | Standard prediction                   |
| B-slice    | Intra + bi-pred      | Maximum compression                   |
| SI-slice   | Switching I           | Bitstream switching (rare)            |
| SP-slice   | Switching P           | Bitstream switching (rare)            |

### Macroblock Structure

H.264 divides each frame into **16x16 macroblocks**. Each macroblock can be further
partitioned for motion compensation:

```
16x16 -> 16x8, 8x16 -> 8x8 -> 8x4, 4x8, 4x4
```

Smaller partitions improve motion estimation accuracy at the cost of more bits for
motion vectors. The encoder decides the optimal partition size per macroblock.

### CABAC vs CAVLC

H.264 supports two entropy coding methods:

**CAVLC (Context-Adaptive Variable-Length Coding)**:
- Simpler, faster to encode/decode
- Uses look-up tables (Exp-Golomb codes)
- Required for Baseline profile
- Roughly 10-15% less efficient than CABAC

**CABAC (Context-Adaptive Binary Arithmetic Coding)**:
- Models probability of each bit based on context
- Achieves 10-15% better compression than CAVLC
- Significantly more computationally expensive
- Used in Main and High profiles
- The context model adapts to local statistics in real time

### Deblocking (Loop) Filter

Quantization creates visible block boundaries at macroblock edges. H.264 applies an
**in-loop deblocking filter** that smooths these edges before the frame is used as
a reference for future frames. This is crucial: without it, blocking artifacts would
propagate and amplify across frames.

The filter strength is adaptive, based on:
- Quantization parameter (QP) of adjacent blocks
- Boundary strength (BS) derived from coding mode differences
- Pixel value differences across the boundary

### Encoding with x264

x264 is the gold-standard open-source H.264 encoder. Common FFmpeg invocations:

```bash
# High-quality CRF encode for VOD
ffmpeg -i input.mp4 \
  -c:v libx264 \
  -preset slow \
  -crf 18 \
  -profile:v high \
  -level 4.1 \
  -pix_fmt yuv420p \
  -movflags +faststart \
  output.mp4

# Low-latency encode for real-time streaming
ffmpeg -i input.mp4 \
  -c:v libx264 \
  -preset ultrafast \
  -tune zerolatency \
  -profile:v baseline \
  -b:v 2M \
  -maxrate 2.5M \
  -bufsize 4M \
  output.ts

# Two-pass ABR for precise bitrate control
ffmpeg -i input.mp4 -c:v libx264 -preset medium -b:v 4M \
  -pass 1 -an -f null /dev/null

ffmpeg -i input.mp4 -c:v libx264 -preset medium -b:v 4M \
  -pass 2 -c:a aac -b:a 128k output.mp4
```

---

## 3. H.265/HEVC

**H.265/HEVC** (High Efficiency Video Coding), standardized in 2013, was designed to
deliver the same visual quality as H.264 at roughly **50% of the bitrate**. It is the
primary codec for 4K/UHD content and HDR.

### Key Improvements Over H.264

#### CTU vs Macroblock

H.264 uses fixed 16x16 macroblocks. H.265 introduces the **Coding Tree Unit (CTU)**,
which can be as large as **64x64** pixels and is recursively subdivided using a
quadtree structure:

```
64x64 CTU
├── 32x32 CU
│   ├── 16x16 CU
│   │   ├── 8x8 CU
│   │   └── 8x8 CU
│   └── 16x16 CU
└── 32x32 CU (not split)
```

Larger blocks are efficient for homogeneous regions (sky, walls), while smaller
blocks handle fine detail. This adaptive structure is a major reason for HEVC's
superior compression.

#### Advanced Prediction

- **35 intra prediction modes** (vs 9 in H.264) for finer angular prediction
- **Asymmetric motion partitions** (e.g., 12x16, 4x16 within a CU)
- **Advanced motion vector prediction (AMVP)** with merge mode
- **Improved interpolation filters** (8-tap luma, 4-tap chroma vs 6-tap/bilinear)

#### Sample Adaptive Offset (SAO)

HEVC adds a new in-loop filter called **SAO** that runs after the deblocking filter.
SAO classifies pixels into categories and applies a per-category offset to reduce
ringing and banding artifacts. Two modes:

- **Edge offset**: Classifies pixels based on gradient direction (0, 45, 90, 135 deg)
- **Band offset**: Classifies pixels by intensity range (band position)

SAO can recover 0.5-1.0 dB PSNR at negligible decoder cost.

#### Parallel Processing

HEVC introduces **tiles** and **Wavefront Parallel Processing (WPP)** for better
multi-threaded decoding:

- **Tiles**: Divide a frame into rectangular regions decoded independently
- **WPP**: CTU rows can start decoding after the first two CTUs of the previous row

### Patent and Licensing Issues

HEVC's adoption has been severely hampered by its fragmented patent landscape:

| Patent Pool    | Annual Fee (est.)         |
| -------------- | ------------------------- |
| MPEG-LA        | $0.20/unit (cap $25M)     |
| HEVC Advance   | Variable, higher rates    |
| Velos Media    | Additional fees            |
| Individual     | Unknown, unlicensed       |

Three separate patent pools plus individual licensors created uncertainty and high
costs. This directly motivated the creation of the Alliance for Open Media and AV1.

### Encoding with x265

```bash
# High-quality CRF encode (10-bit recommended for HEVC)
ffmpeg -i input.mp4 \
  -c:v libx265 \
  -preset slow \
  -crf 22 \
  -pix_fmt yuv420p10le \
  -tag:v hvc1 \
  -movflags +faststart \
  output.mp4

# HDR encode with metadata
ffmpeg -i hdr_input.mov \
  -c:v libx265 \
  -preset medium \
  -crf 20 \
  -pix_fmt yuv420p10le \
  -x265-params "hdr-opt=1:repeat-headers=1:colorprim=bt2020:\
transfer=smpte2084:colormatrix=bt2020nc:\
max-cll=1000,400:master-display=G(13250,34500)\
B(7500,3000)R(34000,16000)WP(15635,16450)L(10000000,1)" \
  output_hdr.mp4

# Low-latency HEVC
ffmpeg -i input.mp4 \
  -c:v libx265 \
  -preset ultrafast \
  -tune zerolatency \
  -b:v 3M \
  output.ts
```

---

## 4. VP8/VP9

### VP8

VP8 was developed by On2 Technologies and acquired by Google in 2010, which released
it as open source under a BSD license. VP8 is roughly comparable to H.264 Baseline/Main
profile in compression efficiency.

Key characteristics:
- Boolean (arithmetic) entropy coder
- 4x4 and 16x16 block transforms
- Three reference frames (last, golden, alt-ref)
- Simple loop filter
- Used by WebRTC as a mandatory-to-implement video codec

### VP9

VP9, developed by Google and released in 2013, is the successor to VP8 and competes
directly with HEVC. It offers approximately **30-50% bitrate savings** over H.264 at
equivalent quality.

#### Architecture

VP9 uses a **superblock** structure similar to HEVC's CTU:

```
64x64 Superblock
├── 32x32 block
│   ├── 16x16 block
│   │   ├── 8x8 block
│   │   │   └── 4x4 block
│   │   └── 8x8 block
│   └── 16x16 block
└── 32x32 block
```

#### Key Features

| Feature                  | Description                                          |
| ------------------------ | ---------------------------------------------------- |
| Superblocks              | Up to 64x64 with recursive partitioning              |
| Prediction modes         | 10 intra modes, multiple inter modes                 |
| Reference frames         | Up to 3 active references from 8 stored              |
| Transform sizes          | 4x4, 8x8, 16x16, 32x32 DCT/ADST                    |
| Entropy coding           | Multi-symbol boolean arithmetic coder                |
| Loop filter              | Adaptive with direction detection                    |
| Segmentation             | Up to 8 segments with per-segment parameters         |
| Tile-based parallelism   | Column-based tiles for parallel decode               |
| 10/12-bit support        | Profile 2 (10-bit) and Profile 3 (12-bit)           |

#### YouTube and VP9

Google mandated VP9 for YouTube playback, making it one of the most-viewed codecs
in the world. YouTube's VP9 strategy:

- All videos above 720p are encoded in VP9
- VP9 reduces YouTube's bandwidth costs by approximately 30-50% vs H.264
- Hardware VP9 decode is now standard on most devices (2016+)
- VP9 enables higher quality at the same bandwidth in developing markets

### Encoding with libvpx

```bash
# High-quality VP9 encode (two-pass recommended)
ffmpeg -i input.mp4 -c:v libvpx-vp9 -b:v 0 -crf 30 \
  -pass 1 -an -f null /dev/null

ffmpeg -i input.mp4 -c:v libvpx-vp9 -b:v 0 -crf 30 \
  -pass 2 -c:a libopus -b:a 128k \
  -row-mt 1 -tile-columns 2 -threads 8 \
  output.webm

# Constrained quality mode (CRF with bitrate cap)
ffmpeg -i input.mp4 \
  -c:v libvpx-vp9 \
  -crf 32 \
  -b:v 2M \
  -row-mt 1 \
  -tile-columns 2 \
  output.webm

# Real-time VP9 (for streaming)
ffmpeg -i input.mp4 \
  -c:v libvpx-vp9 \
  -quality realtime \
  -speed 7 \
  -b:v 2M \
  -row-mt 1 \
  output.webm
```

---

## 5. AV1

**AV1** (AOMedia Video 1) is the royalty-free, open-source video codec developed by
the **Alliance for Open Media (AOMedia)**. AOMedia was founded in 2015 by Amazon,
Cisco, Google, Intel, Microsoft, Mozilla, and Netflix specifically to counter HEVC's
licensing issues.

AV1 delivers approximately **30-50% bitrate savings over HEVC** and **50-70% savings
over H.264** at equivalent perceptual quality.

### AOMedia Members

The alliance now includes virtually every major tech company: Apple, ARM, Broadcom,
Facebook (Meta), Hulu, IBM, NVIDIA, Samsung, Tencent, and many more. This broad
industry support guarantees AV1's long-term adoption.

### Coding Tools

AV1 inherits VP9's architecture but adds numerous advanced coding tools:

#### 128x128 Superblock

AV1 increases the maximum superblock size to **128x128** pixels (vs 64x64 in VP9),
enabling even more efficient coding of uniform regions:

```
128x128 Superblock
├── 128x128 (no split)
├── 64x64 quadtree split
├── Rectangular splits (128x64, 64x128)
└── Recursive subdivision down to 4x4
```

The partition structure is far more flexible than VP9, supporting 10 different
partition types including horizontal, vertical, and T-shaped splits.

#### CDEF (Constrained Directional Enhancement Filter)

CDEF is AV1's answer to the deblocking + SAO approach in HEVC. It uses a
**direction-finding algorithm** to detect the primary edge direction in each 8x8
block, then applies a directional nonlinear low-pass filter along that direction.

```
Direction detection:         Filtering:
  ╲  │  ╱                   Apply smoothing along
   ╲ │ ╱                    the detected edge
    ╲│╱                     direction, preserving
  ───┼───                   edge sharpness while
    ╱│╲                     reducing noise
   ╱ │ ╲
  ╱  │  ╲
```

CDEF is computationally cheaper than SAO while delivering better results.

#### Film Grain Synthesis

AV1 includes a dedicated **film grain synthesis** tool. Instead of wasting bits
encoding random film grain noise:

1. The encoder analyzes and removes grain from the source
2. Grain model parameters are transmitted as metadata (just a few bytes)
3. The decoder synthesizes and re-applies matching grain

This can save **10-30% bitrate** on grainy content (film, low-light footage) while
preserving the intended visual appearance.

#### 10-bit Native

AV1 was designed from the ground up for **10-bit** color depth. Even 8-bit source
content benefits from 10-bit internal processing, as it reduces banding artifacts
in gradients. Netflix recommends encoding all AV1 content at 10-bit regardless of
source depth.

#### Additional Tools

| Tool                    | Description                                                 |
| ----------------------- | ----------------------------------------------------------- |
| Intra edge filter       | Smooth or sharpen intra prediction edges                    |
| Palette mode            | Efficient coding for screen content (few distinct colors)   |
| Intra block copy        | Copy a block from elsewhere in the same frame               |
| Compound inter modes    | Blend two predictions with distance-weighted masks          |
| Warped motion           | Affine motion model (rotation, zoom, shear)                 |
| Global motion           | Frame-level motion parameters for camera pan/zoom           |
| Switchable restoration  | Choose Wiener filter, self-guided filter, or none per tile  |
| Symbol-by-symbol ANS    | Asymmetric numeral systems for entropy coding               |
| Reference frame scaling | Reference frames at different resolutions                   |

### Encoding Speed Tradeoffs

AV1's primary drawback is encoding speed. The reference encoder (libaom) is
notoriously slow:

| Encoder        | Speed vs x264 | Quality     | Use Case                     |
| -------------- | ------------- | ----------- | ---------------------------- |
| libaom         | 50-200x slower| Best        | Offline VOD, archival        |
| SVT-AV1        | 5-20x slower  | Very good   | Production VOD encoding      |
| rav1e          | 10-30x slower | Good        | Rust ecosystem, research     |
| Hardware (AV1) | 1-3x slower   | Good        | Real-time, high throughput   |

**SVT-AV1** (Scalable Video Technology for AV1), developed by Intel and Netflix,
has become the practical production encoder. It is dramatically faster than libaom
while producing comparable quality, especially at presets 4-8.

### dav1d Decoder

**dav1d** is the high-performance AV1 decoder developed by VideoLAN (VLC) and
FFmpeg communities, funded by AOMedia. Key characteristics:

- Written in C with extensive SIMD assembly optimizations (SSE, AVX2, NEON)
- 2-5x faster than the libaom reference decoder
- Used in Firefox, Chrome, VLC, mpv, and Android
- Supports all AV1 profiles and features
- Designed for both software and hardware-assisted decoding

### Encoding with libaom and SVT-AV1

```bash
# libaom: Maximum quality (extremely slow, use for short clips or archival)
ffmpeg -i input.mp4 \
  -c:v libaom-av1 \
  -crf 30 \
  -b:v 0 \
  -cpu-used 4 \
  -row-mt 1 \
  -tiles 2x2 \
  -pix_fmt yuv420p10le \
  output.mkv

# SVT-AV1: Production encode (recommended)
ffmpeg -i input.mp4 \
  -c:v libsvtav1 \
  -crf 28 \
  -preset 6 \
  -pix_fmt yuv420p10le \
  -svtav1-params "tune=0:film-grain=8:film-grain-denoise=1" \
  -movflags +faststart \
  output.mp4

# SVT-AV1: Fast encode for testing
ffmpeg -i input.mp4 \
  -c:v libsvtav1 \
  -crf 35 \
  -preset 10 \
  output.mp4

# AV1 with film grain synthesis for grainy content
ffmpeg -i grainy_film.mp4 \
  -c:v libsvtav1 \
  -crf 26 \
  -preset 4 \
  -pix_fmt yuv420p10le \
  -svtav1-params "film-grain=12:film-grain-denoise=1" \
  output.mp4
```

---

## 6. H.266/VVC

**H.266/VVC** (Versatile Video Coding), finalized in 2020, is the latest ITU-T/ISO
standard and the successor to HEVC. It targets an additional **30-50% bitrate savings
over HEVC** at equivalent quality.

### Key Improvements

| Feature                         | Description                                       |
| ------------------------------- | ------------------------------------------------- |
| CTU size up to 128x128          | Matches AV1's maximum block size                  |
| Multi-type tree partitioning    | Binary and ternary splits in addition to quadtree |
| 67 intra prediction modes       | vs 35 in HEVC, vs 9 in H.264                     |
| Affine motion compensation      | 4 and 6 parameter affine models                   |
| Bi-directional optical flow     | Refine motion at decoder side                     |
| Adaptive loop filter (ALF)      | Wiener-based filter with diamond shape             |
| LMCS                            | Luma mapping with chroma scaling                  |
| Joint Cb-Cr residual coding     | Code chroma residuals jointly                     |
| Subblock-based temporal MVP      | Better motion prediction for complex motion       |
| Decoder-side motion refinement  | DMVR and PROF                                     |
| Transform skip residual coding  | Improved screen content coding                    |

### Current Status

VVC is still in early adoption. Hardware decode support is beginning to appear in
2024-2025 era chips. The open-source **VVenC** encoder and **VVdeC** decoder (from
Fraunhofer HHI) are available. However, VVC faces the same licensing uncertainty
that plagued HEVC, which may limit its adoption against the royalty-free AV1.

```bash
# VVenC encoding example (standalone, not yet widely available in FFmpeg)
vvencapp --input input.yuv \
  --size 1920x1080 \
  --framerate 30 \
  --qp 32 \
  --preset medium \
  --threads 8 \
  --output output.266
```

---

## 7. Video Codec Comparison

| Property                  | H.264/AVC     | H.265/HEVC   | VP9           | AV1           | H.266/VVC    |
| ------------------------- | ------------- | ------------ | ------------- | ------------- | ------------ |
| Year standardized         | 2003          | 2013         | 2013          | 2018          | 2020         |
| Compression (vs H.264)    | Baseline      | ~50% better  | ~35% better   | ~55% better   | ~65% better  |
| Max block size            | 16x16         | 64x64        | 64x64         | 128x128       | 128x128      |
| Encoding speed (CPU)      | Fast          | Medium       | Medium        | Slow          | Very slow    |
| Decoding complexity       | Low           | Medium       | Medium        | Medium-High   | High         |
| Hardware decode support   | Universal     | Widespread   | Widespread    | Growing       | Emerging     |
| Hardware encode support   | Universal     | Widespread   | Limited       | Growing       | Rare         |
| Licensing                 | MPEG-LA       | 3 pools+     | Royalty-free  | Royalty-free  | Uncertain    |
| Chrome                    | Yes           | Partial      | Yes           | Yes           | No           |
| Firefox                   | Yes           | No           | Yes           | Yes           | No           |
| Safari                    | Yes           | Yes          | Yes (14.1+)   | Yes (17+)     | No           |
| Edge                      | Yes           | Yes          | Yes           | Yes           | No           |
| 10-bit support            | High 10 prof  | Main 10      | Profile 2     | Native        | Native       |
| HDR support               | Limited       | Full (HDR10) | VP9 Profile 2 | Full          | Full         |
| WebRTC support            | Yes           | No           | Yes           | Partial       | No           |
| Primary container         | MP4           | MP4          | WebM          | MP4/WebM      | MP4          |
| Best open encoder         | x264          | x265         | libvpx-vp9    | SVT-AV1       | VVenC        |

### When to Use Each Codec

| Scenario                        | Recommended Codec | Why                                      |
| ------------------------------- | ----------------- | ---------------------------------------- |
| Maximum compatibility           | H.264             | Universal hardware and software support  |
| 4K/HDR streaming                | HEVC or AV1       | Necessary bitrate savings at 4K          |
| YouTube/Web publishing          | AV1 (or VP9)      | Royalty-free, YouTube-native             |
| Real-time video conferencing    | H.264 or VP8/VP9  | Low-latency encode/decode, WebRTC        |
| Bandwidth-constrained delivery  | AV1               | Best compression efficiency              |
| Apple ecosystem                 | HEVC              | Native HW acceleration, ProRes workflow  |
| Archival / future-proofing      | AV1               | Open standard, broad industry support    |

---

## 8. Audio Codec Fundamentals

Audio codecs compress sound by exploiting two properties of human hearing:

### Psychoacoustic Masking

The human auditory system cannot perceive all sounds equally. Two key masking effects:

**Frequency (simultaneous) masking**: A loud tone at one frequency makes nearby
quieter tones inaudible. The codec can discard these masked frequencies without
perceptible quality loss.

```
Amplitude
│    ┌──┐
│    │  │    Masking threshold
│    │  │   ╱╲
│  ──┤  ├──╱──╲────
│    │  │ ╱    ╲
│    │  │╱      ╲    Masked (inaudible) tones below the curve
│    └──┘        ╲   can be discarded
└────────────────────── Frequency
```

**Temporal masking**: A loud sound masks quieter sounds that occur shortly before
(pre-masking, ~5ms) or after (post-masking, ~100ms) it.

### Perceptual Coding Pipeline

Most lossy audio codecs follow this general pipeline:

```
Input PCM
    │
    ▼
┌───────────────┐
│ Time→Frequency│  (MDCT or filterbank)
│   Transform   │
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ Psychoacoustic│  Analyze masking thresholds
│    Model      │
└───────┬───────┘
        │
        ▼
┌───────────────┐
│  Quantization │  Reduce precision based on masking model
│  & Scaling    │
└───────┬───────┘
        │
        ▼
┌───────────────┐
│   Entropy     │  Huffman or arithmetic coding
│   Coding      │
└───────┬───────┘
        │
        ▼
   Bitstream
```

### Key Audio Parameters

| Parameter       | Description                                    | Common Values        |
| --------------- | ---------------------------------------------- | -------------------- |
| Sample rate     | Samples per second                             | 44100, 48000 Hz      |
| Bit depth       | Bits per sample (uncompressed)                 | 16, 24 bits          |
| Channels        | Number of audio channels                       | 1 (mono), 2 (stereo) |
| Bitrate         | Compressed bits per second                     | 64-320 kbps          |
| Frame size      | Number of samples per codec frame              | 960-2048             |
| Latency         | Encoding delay in milliseconds                 | 3-100+ ms            |

---

## 9. MP3 (MPEG-1 Layer III)

MP3, standardized in 1993, was the codec that launched the digital music revolution.
While largely superseded by AAC and Opus for new applications, understanding MP3
is foundational.

### How MP3 Works

#### Step 1: Polyphase Filterbank

The input PCM signal is split into **32 equally spaced subbands** using a polyphase
filterbank. Each subband covers approximately 625 Hz (for 44.1 kHz audio).

#### Step 2: MDCT

Each subband is further analyzed using the **Modified Discrete Cosine Transform
(MDCT)**, producing 18 frequency lines per subband (576 total lines per granule).
The MDCT window can be:

- **Long window**: 36 samples, good frequency resolution, poor time resolution
- **Short window**: 12 samples (x3), good time resolution for transients
- **Start/Stop windows**: Transition between long and short

#### Step 3: Psychoacoustic Model

MP3 uses a psychoacoustic model to calculate masking thresholds for each frequency
band. Two models are defined:

- **Model 1**: Simpler, used for lower-quality encoding
- **Model 2**: More accurate, better for higher quality

The model identifies tonal (sinusoidal) and noise-like components, calculates
individual and global masking thresholds, and determines the **Signal-to-Mask Ratio
(SMR)** for each band.

#### Step 4: Quantization

Frequency coefficients are quantized using a non-uniform quantizer. The quantizer
step size is adjusted per scalefactor band to keep quantization noise below the
masking threshold. This is the lossy step.

#### Step 5: Huffman Coding

Quantized values are entropy-coded using **Huffman coding** with 32 predefined
Huffman tables. The encoder selects the table that minimizes output size.

### MP3 Bitrates and Quality

| Bitrate   | Quality Level        | Typical Use                    |
| --------- | -------------------- | ------------------------------ |
| 64 kbps   | Poor                 | Voice, low bandwidth           |
| 128 kbps  | Acceptable           | Casual listening               |
| 192 kbps  | Good                 | General music                  |
| 256 kbps  | Very good            | Quality-conscious listening    |
| 320 kbps  | Maximum (CBR)        | Near-transparent               |
| VBR V0    | ~245 kbps avg        | Best quality-to-size ratio     |
| VBR V2    | ~190 kbps avg        | Excellent quality, smaller     |

### MP3 Encoding with LAME

```bash
# VBR quality mode (recommended)
ffmpeg -i input.wav -c:a libmp3lame -q:a 0 output.mp3    # V0, highest quality
ffmpeg -i input.wav -c:a libmp3lame -q:a 2 output.mp3    # V2, good balance

# CBR mode
ffmpeg -i input.wav -c:a libmp3lame -b:a 320k output.mp3 # 320 kbps CBR

# LAME directly
lame -V 0 input.wav output.mp3                            # VBR V0
lame --cbr -b 256 input.wav output.mp3                    # CBR 256 kbps
```

### MP3 Limitations

- Maximum 320 kbps (CBR) or ~245 kbps average (VBR V0)
- Poor performance below 128 kbps (audible artifacts)
- 32-subband filterbank has frequency resolution limitations
- No native multichannel support beyond joint stereo
- Patents expired worldwide by 2017

---

## 10. AAC

**AAC** (Advanced Audio Coding), standardized as part of MPEG-2 (1997) and MPEG-4
(1999), was explicitly designed as MP3's successor. It is the default audio codec
for Apple products, YouTube, and most streaming services.

### Why AAC Replaced MP3

At the same bitrate, AAC typically sounds better than MP3 because:

- **Pure MDCT** (no polyphase filterbank, avoiding its resolution limitations)
- **More flexible window sizes**: 128-2048 samples vs MP3's fixed 36/12
- **Temporal Noise Shaping (TNS)**: Controls temporal shape of quantization noise
- **Better stereo coding**: Mid/Side stereo applied per scalefactor band
- **Improved Huffman coding**: More and larger codebook options
- **Perceptual Noise Substitution (PNS)**: Replaces noise-like spectral components

### AAC Profiles

| Profile       | Full Name                    | Bitrate Range | Use Case                      |
| ------------- | ---------------------------- | ------------- | ----------------------------- |
| AAC-LC        | Low Complexity               | 96-256 kbps   | Music streaming, podcasts     |
| HE-AAC (v1)  | High Efficiency AAC          | 48-96 kbps    | Radio, mobile streaming       |
| HE-AAC v2    | High Efficiency AAC v2       | 24-48 kbps    | Very low bitrate, voice+music |
| AAC-LD        | Low Delay                    | 64-128 kbps   | Video conferencing            |
| AAC-ELD       | Enhanced Low Delay           | 32-64 kbps    | Real-time communication       |
| xHE-AAC      | Extended HE-AAC (USAC)       | 12-256 kbps   | Adaptive streaming            |

### AAC-LC (Low Complexity)

AAC-LC is the most widely used profile. It uses:
- MDCT with 1024-sample (long) or 128-sample (short) windows
- Up to 48 scalefactor bands
- Huffman entropy coding with 12 codebook pairs
- TNS for transient handling
- M/S and intensity stereo

AAC-LC at 128 kbps is generally considered equivalent to MP3 at 192 kbps.

### HE-AAC and Spectral Band Replication (SBR)

**HE-AAC** (also known as aacPlus) adds **Spectral Band Replication (SBR)** to
AAC-LC. SBR is a bandwidth extension technique:

1. The encoder codes only the lower frequencies (below ~6-8 kHz) with AAC-LC
2. SBR metadata describes the relationship between low and high frequencies
3. The decoder reconstructs high frequencies by transposing and adjusting low-frequency content

```
Without SBR (AAC-LC at 48 kbps):
Frequency: |████████░░░░░░░░░░░░|  (only low freqs coded, harsh cutoff)
           0 Hz                 22 kHz

With SBR (HE-AAC at 48 kbps):
Frequency: |████████████████████|  (full bandwidth restored)
           0 Hz   ↑            22 kHz
                   SBR reconstructs this region
```

HE-AAC at 48 kbps can sound comparable to AAC-LC at 96 kbps.

### HE-AAC v2 and Parametric Stereo (PS)

HE-AAC v2 adds **Parametric Stereo (PS)** on top of SBR. Instead of coding two
separate channels, it:

1. Codes a mono downmix with AAC-LC + SBR
2. Transmits stereo parameters (IID, ICC, IPD) as side information (~2-3 kbps)
3. The decoder reconstructs the stereo image from the mono signal and parameters

This enables usable stereo audio at bitrates as low as **24-32 kbps**.

### AAC Encoding

```bash
# AAC-LC with FFmpeg's native encoder
ffmpeg -i input.wav -c:a aac -b:a 192k output.m4a

# AAC-LC with fdk-aac (higher quality, if compiled with libfdk_aac)
ffmpeg -i input.wav -c:a libfdk_aac -b:a 192k output.m4a

# HE-AAC v1 (requires fdk-aac)
ffmpeg -i input.wav -c:a libfdk_aac -profile:a aac_he -b:a 64k output.m4a

# HE-AAC v2 (stereo only, requires fdk-aac)
ffmpeg -i input.wav -c:a libfdk_aac -profile:a aac_he_v2 -b:a 32k output.m4a

# Apple AAC encoder (macOS only, often considered best quality)
afconvert input.wav output.m4a -d aac -f m4af -b 256000 -q 127 -s 2
```

---

## 11. Opus

**Opus** is the undisputed king of real-time audio codecs and one of the most
technically impressive audio codecs ever designed. Standardized as RFC 6716 in 2012,
it is mandatory in WebRTC and has become the default for Discord, Zoom, WhatsApp
voice, and many other communication platforms.

### Architecture: SILK + CELT Hybrid

Opus is unique in combining two codecs into one:

```
                        Opus Codec
     ┌──────────────────────────────────────┐
     │                                      │
     │   ┌──────────┐    ┌──────────┐       │
     │   │   SILK   │    │   CELT   │       │
     │   │  (Voice) │    │  (Music) │       │
     │   └────┬─────┘    └────┬─────┘       │
     │        │               │             │
     │        └───────┬───────┘             │
     │                │                     │
     │         ┌──────┴──────┐              │
     │         │   Hybrid    │              │
     │         │    Mode     │              │
     │         └─────────────┘              │
     │                                      │
     └──────────────────────────────────────┘
```

**SILK** (originally from Skype):
- Linear Predictive Coding (LPC) based, optimized for speech
- Excellent at very low bitrates (6-12 kbps)
- Handles narrowband (8 kHz), mediumband (12 kHz), wideband (16 kHz)

**CELT** (Constrained Energy Lapped Transform):
- MDCT-based, optimized for general audio and music
- Low algorithmic delay
- Handles fullband audio (48 kHz)
- Excellent transient handling

**Hybrid mode**:
- SILK handles frequencies below ~8 kHz
- CELT handles frequencies above ~8 kHz
- Used for wideband/superwideband speech at medium bitrates

### Operating Modes

| Mode     | Bandwidth       | Bitrate Range  | Best For             | Delay     |
| -------- | --------------- | -------------- | -------------------- | --------- |
| SILK     | 4-16 kHz        | 6-40 kbps      | Voice, low bitrate   | 25-65 ms  |
| Hybrid   | up to 20 kHz    | 12-64 kbps     | Voice + some music   | 25-65 ms  |
| CELT     | up to 24 kHz    | 12-510 kbps    | Music, general audio | 5-22.5 ms |

### Why WebRTC Chose Opus

Opus was selected as the mandatory-to-implement audio codec for WebRTC for these
reasons:

1. **Ultra-low latency**: Frame sizes from 2.5ms to 60ms, with a minimum
   algorithmic delay of just 5ms (CELT mode) or 6.5ms (including look-ahead)
2. **Seamless bitrate adaptation**: Opus can change bitrate, bandwidth, channel
   count, and frame duration on every packet boundary without gaps or glitches
3. **Wide bitrate range**: Usable from 6 kbps (narrowband voice) to 510 kbps
   (near-lossless stereo music) in a single codec
4. **Packet loss resilience**: Forward error correction (FEC) built in, with
   LBRR (Low Bitrate Redundancy) for critical speech frames
5. **Royalty-free**: BSD-licensed reference implementation, no patent royalties
6. **Superior quality**: Consistently wins in listening tests across all bitrates

### Opus vs Everything Else

At every bitrate point, Opus matches or exceeds the quality of specialized codecs:

```
Quality
│                               ┌─── Opus
│                          ╱───┘
│                     ╱───┘
│                ╱───┘
│           ╱───┘          AAC-LC ───┐
│      ╱───┘           ╱────────────┘
│ ╱───┘           ╱───┘
│┘           ╱───┘
│       ╱───┘     MP3 ─┐
│  ╱───┘      ╱────────┘
│─┘      ╱───┘
│   ╱───┘
│──┘
└──────────────────────────────── Bitrate
  6    32    64    96   128   192   256  kbps
```

### Encoding with libopus

```bash
# Voice encoding (uses SILK mode automatically at low bitrate)
ffmpeg -i input.wav \
  -c:a libopus \
  -b:a 32k \
  -vbr on \
  -application voip \
  output.opus

# Music encoding
ffmpeg -i input.wav \
  -c:a libopus \
  -b:a 128k \
  -vbr on \
  -application audio \
  output.opus

# High-quality music (near-transparent)
ffmpeg -i input.wav \
  -c:a libopus \
  -b:a 256k \
  -vbr on \
  -application audio \
  output.opus

# Low-latency real-time (minimum frame size)
ffmpeg -i input.wav \
  -c:a libopus \
  -b:a 64k \
  -vbr on \
  -application lowdelay \
  -frame_duration 2.5 \
  output.opus

# Opus in WebM container
ffmpeg -i input.wav \
  -c:a libopus \
  -b:a 128k \
  -vbr on \
  output.webm

# opusenc (reference encoder)
opusenc --bitrate 128 --vbr input.wav output.opus
opusenc --bitrate 32 --speech input.wav voice_output.opus
```

### Opus Frame Structure

```
┌────────────────────────────────────────────┐
│ TOC Byte │ Frame Length │ Frame Data ...    │
├──────────┼─────────────┼───────────────────┤
│ Config   │ # frames    │ Encoded audio     │
│ (5 bits) │ (2 bits)    │                   │
│ Stereo   │             │                   │
│ (1 bit)  │             │                   │
└────────────────────────────────────────────┘

TOC byte encodes:
  - Bandwidth (narrowband to fullband)
  - Frame duration (2.5, 5, 10, 20, 40, 60, 80, 100, 120 ms)
  - Mode (SILK, CELT, or Hybrid)
  - Channel count (mono/stereo)
```

---

## 12. Vorbis and FLAC

### Vorbis

**Vorbis** is an open-source lossy audio codec developed by the Xiph.Org Foundation,
released in 2000. It was created as a patent-free alternative to MP3 and AAC.

Key characteristics:
- MDCT-based with floor/residue coding approach
- Quality range: q-1 (~45 kbps) to q10 (~500 kbps)
- Generally comparable to AAC-LC at similar bitrates
- Native container: Ogg (.ogg)
- Used in games (via Ogg Vorbis), Wikipedia audio, and early web applications

```bash
# Vorbis encoding
ffmpeg -i input.wav -c:a libvorbis -q:a 6 output.ogg     # Quality 6 (~192 kbps)
ffmpeg -i input.wav -c:a libvorbis -q:a 8 output.ogg     # Quality 8 (~256 kbps)
ffmpeg -i input.wav -c:a libvorbis -b:a 192k output.ogg   # Target bitrate

# oggenc
oggenc -q 6 input.wav -o output.ogg
```

Vorbis has been largely superseded by Opus for new applications. Opus at any bitrate
is equal to or better than Vorbis, with the added benefit of low-latency support.

### FLAC

**FLAC** (Free Lossless Audio Codec) is the most popular open-source lossless audio
codec. It compresses audio by approximately **40-60%** with zero quality loss.

How FLAC works:
1. **Blocking**: Audio is divided into blocks (1024-65535 samples)
2. **Interchannel decorrelation**: Convert L/R to Mid/Side for better compression
3. **Prediction**: LPC prediction (up to 32nd order) removes redundancy
4. **Residual coding**: Rice coding on the prediction residual

```bash
# FLAC encoding
ffmpeg -i input.wav -c:a flac -compression_level 8 output.flac

# flac encoder directly
flac -8 input.wav -o output.flac              # Level 8 (maximum compression)
flac -5 input.wav -o output.flac              # Level 5 (default, good balance)
flac --verify -8 input.wav -o output.flac     # Verify decode matches original
```

| Compression Level | Encoding Speed | File Size Reduction |
| ----------------- | -------------- | ------------------- |
| 0                 | Fastest        | ~40%                |
| 5 (default)       | Balanced       | ~50%                |
| 8 (maximum)       | Slowest        | ~55%                |

FLAC is widely supported: Apple Music, Tidal, Amazon Music, Roon, and all major
media players support FLAC natively. It is the standard for music archival and
audiophile distribution.

---

## 13. Audio Codec Comparison

| Property           | MP3           | AAC-LC        | HE-AAC v2    | Opus          | Vorbis        | FLAC          |
| ------------------ | ------------- | ------------- | ------------ | ------------- | ------------- | ------------- |
| Year               | 1993          | 1997          | 2006         | 2012          | 2000          | 2001          |
| Type               | Lossy         | Lossy         | Lossy        | Lossy         | Lossy         | Lossless      |
| Bitrate range      | 32-320 kbps   | 16-256 kbps   | 16-64 kbps  | 6-510 kbps    | 45-500 kbps   | ~500-1100 kbps|
| Sweet spot         | 192-256 kbps  | 128-192 kbps  | 32-48 kbps  | 64-128 kbps   | 160-192 kbps  | N/A (lossless)|
| Min latency        | ~100 ms       | ~80 ms        | ~100+ ms    | ~5 ms         | ~50 ms        | N/A           |
| Sample rates       | up to 48 kHz  | up to 96 kHz  | up to 48 kHz| up to 48 kHz  | up to 192 kHz | up to 655 kHz |
| Channels           | 2 (stereo)    | 48 (7.1+)     | 2 (PS)      | 255           | 255           | 8             |
| Container          | .mp3          | .m4a, .mp4    | .m4a, .mp4  | .opus, .ogg   | .ogg          | .flac         |
| Licensing          | Free (2017)   | MPEG-LA       | MPEG-LA     | Royalty-free   | Royalty-free  | Royalty-free  |
| Browser support    | All           | All           | All         | All modern     | Firefox, Chrome| Chrome, Edge  |
| WebRTC support     | No            | No            | No          | Mandatory      | No            | No            |
| Best for           | Legacy compat | Streaming     | Low bitrate | Real-time/VoIP | Games, web    | Archival      |

### Choosing the Right Audio Codec

| Scenario                         | Recommended    | Why                                    |
| -------------------------------- | -------------- | -------------------------------------- |
| Real-time voice (WebRTC)         | Opus           | Lowest latency, adaptive, mandatory    |
| Music streaming                  | AAC-LC or Opus | Wide support (AAC) or quality (Opus)   |
| Podcast distribution             | AAC-LC or MP3  | Universal player compatibility         |
| Low-bandwidth voice              | Opus or HE-AAC | Excellent quality at 24-48 kbps        |
| Music archival                   | FLAC           | Lossless, open format                  |
| Game audio                       | Vorbis or Opus | Royalty-free, low CPU decode           |
| Maximum compatibility            | MP3            | Plays literally everywhere             |
| Adaptive streaming (DASH/HLS)    | AAC-LC         | HLS requires AAC, DASH supports both   |

---

## 14. Encoding Parameters

Understanding encoding parameters is essential for balancing quality, file size,
encoding speed, and latency. These concepts apply across all codecs.

### Rate Control Modes

#### CRF (Constant Rate Factor)

CRF is the recommended mode for offline encoding when file size is not a strict
constraint. The encoder targets a constant perceptual quality level.

```bash
# x264 CRF (range 0-51, default 23, lower = higher quality)
ffmpeg -i input.mp4 -c:v libx264 -crf 18 output.mp4    # Visually lossless
ffmpeg -i input.mp4 -c:v libx264 -crf 23 output.mp4    # Default, good quality
ffmpeg -i input.mp4 -c:v libx264 -crf 28 output.mp4    # Lower quality, smaller

# x265 CRF (range 0-51, default 28, same scale but different absolute values)
ffmpeg -i input.mp4 -c:v libx265 -crf 22 output.mp4    # Equivalent to x264 CRF 18

# SVT-AV1 CRF (range 0-63, default 35)
ffmpeg -i input.mp4 -c:v libsvtav1 -crf 28 output.mp4  # High quality
```

CRF values are not comparable across codecs. Approximate equivalences:

| Visual Quality     | x264 CRF | x265 CRF | SVT-AV1 CRF | libvpx-vp9 CRF |
| ------------------ | --------- | --------- | ------------ | --------------- |
| Visually lossless  | 17-18     | 20-22     | 18-22        | 15-20           |
| High quality       | 20-23     | 24-28     | 25-30        | 25-32           |
| Medium quality     | 24-27     | 29-32     | 32-38        | 33-38           |
| Low quality        | 28-32     | 33-38     | 40-48        | 40-45           |

#### CBR (Constant Bitrate)

Every second of video gets the same number of bits. Required for some broadcast
and streaming scenarios.

```bash
ffmpeg -i input.mp4 -c:v libx264 -b:v 4M -minrate 4M -maxrate 4M -bufsize 8M output.ts
```

#### ABR (Average Bitrate)

The encoder targets an average bitrate but allows per-scene variation.

```bash
ffmpeg -i input.mp4 -c:v libx264 -b:v 4M output.mp4
```

#### VBV (Video Buffering Verifier) / Constrained VBR

Limits the maximum instantaneous bitrate while allowing VBR within bounds. Essential
for streaming where the network has a known capacity.

```bash
# CRF with maxrate constraint
ffmpeg -i input.mp4 -c:v libx264 -crf 20 \
  -maxrate 5M -bufsize 10M output.mp4

# ABR with VBV constraint
ffmpeg -i input.mp4 -c:v libx264 -b:v 4M \
  -maxrate 5M -bufsize 8M output.mp4
```

### Two-Pass Encoding

Two-pass encoding analyzes the entire video in pass 1 (statistics collection),
then optimally distributes bits in pass 2. Essential for hitting precise file
size or bitrate targets.

```bash
# Pass 1: Analyze (fast, no output needed)
ffmpeg -i input.mp4 -c:v libx264 -preset medium -b:v 4M \
  -pass 1 -an -f null /dev/null

# Pass 2: Encode with optimal bit allocation
ffmpeg -i input.mp4 -c:v libx264 -preset medium -b:v 4M \
  -pass 2 -c:a aac -b:a 128k output.mp4
```

### Presets (Encoding Speed vs Compression Efficiency)

x264 and x265 use named presets that trade encoding speed for compression:

| Preset      | Encoding Speed | File Size (relative) | Use Case                |
| ----------- | -------------- | -------------------- | ----------------------- |
| ultrafast   | ~50x           | +80-100%             | Real-time, testing      |
| superfast   | ~30x           | +50-70%              | Real-time streaming     |
| veryfast    | ~15x           | +30-40%              | Fast encode needs       |
| faster      | ~8x            | +15-25%              | Balanced speed          |
| fast        | ~5x            | +10-15%              | Slightly faster encode  |
| medium      | ~3x (baseline) | Baseline              | Default, recommended    |
| slow        | ~1.5x          | -5-10%               | Quality-focused VOD     |
| slower      | ~0.7x          | -8-15%               | Maximum offline quality |
| veryslow    | ~0.3x          | -10-18%              | Archival, benchmarking  |
| placebo     | ~0.1x          | -12-20%              | Diminishing returns     |

**Important**: The difference between `medium` and `veryslow` at the same CRF is
typically only 10-18% file size savings. Going from `medium` to `slow` is often the
best tradeoff for VOD encoding.

For SVT-AV1, presets range from 0 (slowest, best quality) to 13 (fastest):

```bash
# SVT-AV1 preset comparison
ffmpeg -i input.mp4 -c:v libsvtav1 -crf 28 -preset 4 output.mp4  # Quality-focused
ffmpeg -i input.mp4 -c:v libsvtav1 -crf 28 -preset 8 output.mp4  # Balanced
ffmpeg -i input.mp4 -c:v libsvtav1 -crf 28 -preset 12 output.mp4 # Fast
```

### Tuning Profiles

x264 provides `-tune` options that optimize for specific content types:

| Tune          | Effect                                                      |
| ------------- | ----------------------------------------------------------- |
| film          | Optimized for high-detail film content, lower deblocking    |
| animation     | More deblocking, better for flat areas and hard edges       |
| grain         | Preserves film grain at cost of higher bitrate              |
| stillimage    | Optimized for static or near-static content                 |
| fastdecode    | Disables CABAC and loop filter for faster decoding          |
| zerolatency   | Disables lookahead, B-frames; for real-time streaming       |
| psnr          | Optimize for PSNR metric (not perceptual quality)           |
| ssim          | Optimize for SSIM metric                                    |

```bash
# Animated content
ffmpeg -i anime.mp4 -c:v libx264 -crf 20 -preset slow -tune animation output.mp4

# Film grain preservation
ffmpeg -i film.mp4 -c:v libx264 -crf 18 -preset slow -tune grain output.mp4

# Zero-latency live streaming
ffmpeg -i rtmp://input -c:v libx264 -preset ultrafast -tune zerolatency \
  -b:v 3M -f flv rtmp://output
```

### Keyframe Interval (GOP Size)

```bash
# Fixed keyframe interval (every 2 seconds at 30fps)
ffmpeg -i input.mp4 -c:v libx264 -g 60 -keyint_min 60 output.mp4

# Scene-cut aware keyframe insertion (default behavior)
ffmpeg -i input.mp4 -c:v libx264 -g 250 -sc_threshold 40 output.mp4

# Force keyframe at specific interval for adaptive streaming
ffmpeg -i input.mp4 -c:v libx264 -g 48 -keyint_min 48 -sc_threshold 0 \
  -force_key_frames "expr:gte(t,n_forced*2)" output.mp4
```

For adaptive bitrate streaming (HLS/DASH), keyframe intervals must be aligned
across all quality levels, typically at 2-4 second intervals.

---

## 15. Hardware Acceleration

Hardware encoders and decoders use dedicated silicon on GPUs and SoCs to process
video far faster and more power-efficiently than CPU-based software.

### Hardware Encoder Comparison

| Platform        | API          | H.264 | HEVC | AV1  | Vendor               |
| --------------- | ------------ | ----- | ---- | ---- | -------------------- |
| NVIDIA GPU      | NVENC        | Yes   | Yes  | Yes  | NVIDIA               |
| Intel iGPU/Arc  | QSV          | Yes   | Yes  | Yes  | Intel                |
| AMD GPU         | AMF/VCE      | Yes   | Yes  | Yes  | AMD                  |
| Apple Silicon   | VideoToolbox | Yes   | Yes  | No   | Apple                |
| Qualcomm SoC    | OMX/C2       | Yes   | Yes  | Yes  | Qualcomm             |
| MediaTek SoC    | OMX/C2       | Yes   | Yes  | Yes  | MediaTek             |
| ASIC (custom)   | Varies       | Yes   | Yes  | Yes  | Various (data center)|

### NVENC (NVIDIA)

NVIDIA's hardware encoder is the most widely used GPU encoder for professional
and streaming applications.

```bash
# H.264 NVENC encoding
ffmpeg -i input.mp4 \
  -c:v h264_nvenc \
  -preset p7 \
  -tune hq \
  -rc constqp \
  -qp 20 \
  -b:v 0 \
  output.mp4

# HEVC NVENC encoding
ffmpeg -i input.mp4 \
  -c:v hevc_nvenc \
  -preset p7 \
  -tune hq \
  -rc constqp \
  -qp 22 \
  output.mp4

# AV1 NVENC (RTX 40 series and later)
ffmpeg -i input.mp4 \
  -c:v av1_nvenc \
  -preset p7 \
  -tune hq \
  -cq 28 \
  output.mp4

# NVENC low-latency streaming
ffmpeg -i input.mp4 \
  -c:v h264_nvenc \
  -preset p1 \
  -tune ll \
  -zerolatency 1 \
  -b:v 6M \
  -maxrate 8M \
  -bufsize 12M \
  output.ts
```

NVENC presets (Ada Lovelace / Turing+):
- `p1` (fastest) to `p7` (highest quality)
- `ll` tune for low latency
- `hq` tune for high quality
- `lossless` tune for lossless encoding

### Intel Quick Sync Video (QSV)

```bash
# H.264 QSV encoding
ffmpeg -hwaccel qsv -i input.mp4 \
  -c:v h264_qsv \
  -preset veryslow \
  -global_quality 23 \
  output.mp4

# HEVC QSV encoding
ffmpeg -hwaccel qsv -i input.mp4 \
  -c:v hevc_qsv \
  -preset veryslow \
  -global_quality 25 \
  output.mp4

# AV1 QSV (Intel Arc / 12th gen+)
ffmpeg -hwaccel qsv -i input.mp4 \
  -c:v av1_qsv \
  -preset veryslow \
  -global_quality 28 \
  output.mp4
```

### Apple VideoToolbox

```bash
# H.264 VideoToolbox encoding (macOS)
ffmpeg -i input.mp4 \
  -c:v h264_videotoolbox \
  -q:v 65 \
  -profile:v high \
  output.mp4

# HEVC VideoToolbox encoding
ffmpeg -i input.mp4 \
  -c:v hevc_videotoolbox \
  -q:v 55 \
  -tag:v hvc1 \
  output.mp4

# ProRes encoding via VideoToolbox
ffmpeg -i input.mp4 \
  -c:v prores_videotoolbox \
  -profile:v 3 \
  output.mov
```

### VA-API (Linux)

```bash
# H.264 VA-API
ffmpeg -vaapi_device /dev/dri/renderD128 \
  -i input.mp4 \
  -vf 'format=nv12,hwupload' \
  -c:v h264_vaapi \
  -qp 23 \
  output.mp4

# HEVC VA-API
ffmpeg -vaapi_device /dev/dri/renderD128 \
  -i input.mp4 \
  -vf 'format=nv12,hwupload' \
  -c:v hevc_vaapi \
  -qp 25 \
  output.mp4
```

### GPU vs CPU Encoding: When to Use Which

| Factor              | CPU (Software)                | GPU (Hardware)                    |
| ------------------- | ----------------------------- | --------------------------------- |
| Quality per bit     | Higher (5-20% better)         | Lower (but gap is narrowing)      |
| Encoding speed      | Slower                        | 5-50x faster                      |
| Parallel sessions   | Limited by cores              | Dedicated ASIC, many sessions     |
| Latency             | Higher (preset dependent)     | Lower (fixed pipeline)            |
| Power efficiency    | Lower                         | Higher (dedicated silicon)        |
| Cost per encode     | Higher (CPU time)             | Lower (amortized)                 |
| Configuration       | Highly tunable                | Limited parameters                |
| Quality consistency | Very consistent               | Can vary across GPU generations   |

**Use CPU encoding when**:
- Maximum quality matters (VOD, archival)
- You need fine-grained parameter control
- Encoding is offline and not time-sensitive
- Quality per bit is the primary optimization target

**Use GPU encoding when**:
- Real-time or near-real-time encoding required (live streaming, gaming)
- High throughput needed (many simultaneous streams)
- Power efficiency matters (mobile, data center density)
- Encoding latency must be minimized

### ASIC Decoders

Modern devices include dedicated **ASIC (Application-Specific Integrated Circuit)**
video decoders that are separate from both CPU and GPU:

- **Decode-only silicon**: Ultra-low power, always-on capability
- **Zero CPU/GPU load**: Frees compute for other tasks
- **Hardware decode is universal**: Every phone, tablet, TV has ASIC decoders
- **Codec support varies by generation**: Newer chips support AV1, older ones do not

Data center ASICs (Google Argos, Meta MSVP, AWS Aqua Trimaran) handle millions
of concurrent decode/encode operations for platforms like YouTube and Netflix.

---

## 16. Codec Negotiation

When two endpoints (browser-to-browser, player-to-server) need to agree on a codec,
they use a negotiation process.

### SDP (Session Description Protocol) in WebRTC

WebRTC uses **SDP** (RFC 4566) in the offer/answer model to negotiate codecs:

```
# SDP offer (simplified)
m=video 9 UDP/TLS/RTP/SAVPF 96 97 98 99 100
a=rtpmap:96 VP8/90000
a=rtpmap:97 VP9/90000
a=fmtp:97 profile-id=0
a=rtpmap:98 H264/90000
a=fmtp:98 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=640c1f
a=rtpmap:99 H264/90000
a=fmtp:99 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f
a=rtpmap:100 AV1/90000
a=fmtp:100 profile=0;level-idx=5;tier=0

m=audio 9 UDP/TLS/RTP/SAVPF 111 103 9 0
a=rtpmap:111 opus/48000/2
a=fmtp:111 minptime=10;useinbandfec=1
a=rtpmap:103 ISAC/16000
a=rtpmap:9 G722/8000
a=rtpmap:0 PCMU/8000
```

Key SDP fields for codecs:
- `a=rtpmap`: Maps payload type number to codec name, clock rate, and channels
- `a=fmtp`: Format-specific parameters (profile, level, packetization mode)
- Payload types in `m=` line indicate preference order (first = most preferred)

### Codec Strings in HTML5

The `<video>` and `<source>` elements and the MediaSource API use **codec strings**
to identify supported codecs.

#### H.264 Codec String Format

```
avc1.PPCCLL

PP = profile_idc (hex)
CC = constraint_set flags (hex)
LL = level_idc (hex)
```

Common H.264 codec strings:

| String          | Meaning                                 |
| --------------- | --------------------------------------- |
| avc1.42E01E     | Baseline Profile, Level 3.0             |
| avc1.4D401F     | Main Profile, Level 3.1                 |
| avc1.640028     | High Profile, Level 4.0                 |
| avc1.640032     | High Profile, Level 5.0                 |
| avc1.640034     | High Profile, Level 5.2                 |

#### HEVC Codec String Format

```
hev1.P.T.Lxxx  or  hvc1.P.T.Lxxx

P = profile (1=Main, 2=Main10)
T = tier (L=Main, H=High)
Lxxx = level (e.g., L120 = Level 4.0 = 120/30)
```

Examples:

| String              | Meaning                          |
| ------------------- | -------------------------------- |
| hvc1.1.6.L93.B0     | Main Profile, Level 3.1          |
| hvc1.2.4.L120.B0    | Main 10, Level 4.0               |
| hvc1.2.4.L150.B0    | Main 10, Level 5.0               |

#### VP9 Codec String Format

```
vp09.PP.LL.DD

PP = profile (00, 01, 02, 03)
LL = level (10-62)
DD = bit depth (08, 10, 12)
```

| String           | Meaning                            |
| ---------------- | ---------------------------------- |
| vp09.00.31.08    | Profile 0, Level 3.1, 8-bit       |
| vp09.02.41.10    | Profile 2, Level 4.1, 10-bit      |

#### AV1 Codec String Format

```
av01.P.LLM.DD

P   = profile (0=Main, 1=High, 2=Professional)
LLM = level + tier (e.g., 09M = Level 3.1, Main tier)
DD  = bit depth (08, 10, 12)
```

| String            | Meaning                            |
| ----------------- | ---------------------------------- |
| av01.0.04M.08     | Main Profile, Level 3.0, 8-bit    |
| av01.0.09M.10     | Main Profile, Level 4.1, 10-bit   |
| av01.0.12M.10     | Main Profile, Level 5.1, 10-bit   |

### Browser Codec Support Detection

```javascript
// Check video codec support using MediaSource API
function isCodecSupported(codecString) {
  if (typeof MediaSource !== 'undefined') {
    return MediaSource.isTypeSupported(`video/mp4; codecs="${codecString}"`)
  }
  return false
}

// Check common video codecs
const codecs = {
  'H.264 Baseline':  'avc1.42E01E',
  'H.264 High':      'avc1.640028',
  'H.265 Main':      'hvc1.1.6.L93.B0',
  'H.265 Main 10':   'hvc1.2.4.L120.B0',
  'VP9 Profile 0':   'vp09.00.31.08',
  'VP9 Profile 2':   'vp09.02.41.10',
  'AV1 Main 8-bit':  'av01.0.04M.08',
  'AV1 Main 10-bit': 'av01.0.09M.10',
}

for (const [name, codec] of Object.entries(codecs)) {
  console.log(`${name} (${codec}): ${isCodecSupported(codec)}`)
}

// Check audio codec support
function isAudioCodecSupported(mimeType) {
  const audio = document.createElement('audio')
  return audio.canPlayType(mimeType) !== ''
}

const audioCodecs = {
  'AAC-LC':  'audio/mp4; codecs="mp4a.40.2"',
  'HE-AAC':  'audio/mp4; codecs="mp4a.40.5"',
  'Opus':    'audio/webm; codecs="opus"',
  'Vorbis':  'audio/ogg; codecs="vorbis"',
  'FLAC':    'audio/flac',
  'MP3':     'audio/mpeg',
}

for (const [name, mime] of Object.entries(audioCodecs)) {
  console.log(`${name}: ${isAudioCodecSupported(mime)}`)
}
```

### Adaptive Bitrate Streaming and Codecs

In HLS and DASH, codec information appears in the manifest:

#### HLS (m3u8) Example

```
#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=800000,CODECS="avc1.4D401F,mp4a.40.2",RESOLUTION=640x360
360p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2400000,CODECS="avc1.640028,mp4a.40.2",RESOLUTION=1280x720
720p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=5000000,CODECS="avc1.640032,mp4a.40.2",RESOLUTION=1920x1080
1080p_h264.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=3000000,CODECS="hvc1.2.4.L120.B0,mp4a.40.2",RESOLUTION=1920x1080
1080p_hevc.m3u8
```

#### DASH (MPD) Example

```xml
<AdaptationSet mimeType="video/mp4" codecs="avc1.640028">
  <Representation id="1" bandwidth="2400000" width="1280" height="720" />
  <Representation id="2" bandwidth="5000000" width="1920" height="1080" />
</AdaptationSet>
<AdaptationSet mimeType="video/mp4" codecs="av01.0.09M.10">
  <Representation id="3" bandwidth="1500000" width="1280" height="720" />
  <Representation id="4" bandwidth="3000000" width="1920" height="1080" />
</AdaptationSet>
<AdaptationSet mimeType="audio/mp4" codecs="mp4a.40.2">
  <Representation id="5" bandwidth="128000" audioSamplingRate="48000" />
</AdaptationSet>
```

### Codec Selection Strategy for Production

A practical multi-codec encoding strategy for a video streaming platform:

```
Input Source
    │
    ├──► AV1 (SVT-AV1, CRF 28, preset 6, 10-bit)
    │    ├── 360p   @ 300 kbps
    │    ├── 480p   @ 600 kbps
    │    ├── 720p   @ 1.5 Mbps
    │    ├── 1080p  @ 3.0 Mbps
    │    └── 4K     @ 8.0 Mbps
    │
    ├──► HEVC (x265, CRF 22, preset slow, 10-bit)
    │    ├── 720p   @ 2.0 Mbps
    │    ├── 1080p  @ 4.0 Mbps
    │    └── 4K     @ 12.0 Mbps
    │
    └──► H.264 (x264, CRF 20, preset slow)
         ├── 360p   @ 600 kbps
         ├── 480p   @ 1.2 Mbps
         ├── 720p   @ 3.0 Mbps
         └── 1080p  @ 6.0 Mbps

Player Logic:
  1. Detect supported codecs via MediaSource.isTypeSupported()
  2. Prefer AV1 if supported (best quality per bit)
  3. Fall back to HEVC on Apple devices
  4. Fall back to H.264 as universal baseline
  5. Select resolution/bitrate based on network bandwidth
```

### Audio Codec Negotiation in WebRTC

The WebRTC specification mandates Opus support. The typical negotiation priority:

```
Offered (in order of preference):
  1. Opus/48000/2  (always first, mandatory)
  2. G722/8000     (fallback wideband)
  3. PCMU/8000     (last resort, uncompressed-ish)
  4. PCMA/8000     (G.711 A-law variant)

Opus SDP parameters:
  a=fmtp:111 minptime=10;useinbandfec=1;stereo=1;
             maxaveragebitrate=128000;cbr=0;
             sprop-maxcapturerate=48000
```

Key Opus SDP parameters:

| Parameter               | Description                                    | Default   |
| ----------------------- | ---------------------------------------------- | --------- |
| maxaveragebitrate       | Maximum average receive bitrate (bps)          | No limit  |
| maxplaybackrate         | Maximum output sampling rate the receiver wants| 48000     |
| stereo                  | Receiver prefers stereo (1) or mono (0)        | 0         |
| sprop-stereo            | Sender will send stereo                        | 0         |
| cbr                     | Constant bitrate (1) or VBR (0)                | 0         |
| useinbandfec            | Enable in-band FEC                             | 0         |
| usedtx                  | Discontinuous transmission (silence suppression)| 0        |
| minptime                | Minimum packet duration in ms                  | 3         |
| ptime                   | Preferred packet duration in ms                | 20        |

---

## Summary

Choosing the right codec requires balancing compression efficiency, computational
cost, latency, hardware support, licensing, and ecosystem compatibility. The key
takeaways for software engineers:

1. **H.264 remains the safe default** for maximum compatibility, but is the least
   efficient modern codec.

2. **AV1 is the future** of video compression: royalty-free, broadly supported by
   major tech companies, and delivering dramatically better compression. Use SVT-AV1
   for production encoding and dav1d for decoding.

3. **HEVC fills the gap** on Apple platforms and legacy 4K content, but its licensing
   complexity limits web adoption.

4. **Opus is the clear winner** for real-time audio. There is no scenario in WebRTC
   where another codec is preferable.

5. **Hardware acceleration** is essential for real-time and high-throughput encoding.
   GPU encoders have narrowed the quality gap with software encoders significantly.

6. **Multi-codec strategies** are standard in production streaming platforms. Encode
   once in multiple codecs and let the player select the best option.

7. **Understand codec strings**. Being able to read `avc1.640028` or `av01.0.09M.10`
   and knowing what they mean is a practical skill for debugging media playback issues.
