# FFmpeg and Media Processing

A comprehensive guide for software engineers on FFmpeg internals, command-line usage,
encoding, filtering, streaming, hardware acceleration, and programmatic integration.

---

## Table of Contents

1. [What is FFmpeg](#what-is-ffmpeg)
2. [FFmpeg CLI Fundamentals](#ffmpeg-cli-fundamentals)
3. [Video Encoding with FFmpeg](#video-encoding-with-ffmpeg)
4. [Audio Encoding with FFmpeg](#audio-encoding-with-ffmpeg)
5. [Filter Graphs](#filter-graphs)
6. [Advanced Filtering](#advanced-filtering)
7. [Streaming with FFmpeg](#streaming-with-ffmpeg)
8. [Hardware Acceleration](#hardware-acceleration)
9. [FFprobe](#ffprobe)
10. [libav Programming](#libav-programming)
11. [FFmpeg in Other Languages](#ffmpeg-in-other-languages)
12. [Performance Optimization](#performance-optimization)
13. [Common Recipes](#common-recipes)
14. [Common Interview Questions](#common-interview-questions)

---

## What is FFmpeg

### History

FFmpeg was started by Fabrice Bellard in 2000 and has grown into the most widely used
multimedia framework in existence. The name stands for "Fast Forward MPEG." Virtually
every media application you use -- VLC, Chrome, YouTube's backend pipeline, OBS Studio,
HandBrake -- relies on FFmpeg or its libraries.

Key milestones:

- **2000**: Fabrice Bellard creates FFmpeg
- **2004**: Michael Niedermayer becomes lead maintainer
- **2011**: Libav fork occurs (later largely remerged)
- **2015+**: Hardware acceleration support matures (NVENC, QSV, VAAPI)
- **2020+**: AV1 encoding support via libaom, libsvtav1, librav1e

### Architecture Overview

FFmpeg is not a single program but a collection of tools and libraries:

```
+---------------------------------------------------------------------+
|                        FFmpeg Project                                |
+---------------------------------------------------------------------+
|                                                                     |
|  Command-Line Tools:                                                |
|  +-------------+  +-----------+  +-----------+                      |
|  |   ffmpeg    |  |  ffprobe  |  |  ffplay   |                      |
|  | (transcode) |  | (analyze) |  |  (play)   |                      |
|  +------+------+  +-----+-----+  +-----+-----+                     |
|         |               |              |                            |
|  +------v---------------v--------------v---------+                  |
|  |              Shared Libraries                  |                  |
|  |                                                |                  |
|  |  libavformat   - Container muxing/demuxing     |                  |
|  |  libavcodec    - Encoding/decoding             |                  |
|  |  libavfilter   - Filter graph processing       |                  |
|  |  libswscale    - Image scaling/conversion       |                  |
|  |  libswresample - Audio resampling              |                  |
|  |  libavutil     - Shared utilities              |                  |
|  |  libavdevice   - Device capture/output         |                  |
|  |  libpostproc   - Post-processing (legacy)      |                  |
|  +------------------------------------------------+                  |
+---------------------------------------------------------------------+
```

### Command-Line Tools

**ffmpeg** -- The main transcoding tool. Reads input, applies processing, writes output.

**ffprobe** -- Analyzes media files without transcoding. Extracts metadata, stream info,
frame details, and packet information.

**ffplay** -- A simple media player built on the FFmpeg libraries and SDL. Useful for
quick previewing and debugging filter graphs.

### Core Libraries

**libavformat** handles container-level I/O. It demuxes (reads) and muxes (writes)
containers like MP4, MKV, FLV, TS, and WebM. It manages the interleaving of audio and
video packets within a container.

**libavcodec** contains all the encoders and decoders. It transforms compressed bitstreams
into raw frames (decode) and raw frames into compressed bitstreams (encode). It wraps
both built-in codecs and external libraries like x264, x265, and libopus.

**libavfilter** provides a graph-based filter system. Filters can be chained and connected
to form complex processing pipelines. Video filters handle scaling, cropping, overlaying,
color correction, and more. Audio filters handle mixing, resampling, equalization, and
loudness normalization.

**libswscale** converts pixel formats and scales video. For example, converting from
YUV420p to RGB24, or resizing from 1920x1080 to 1280x720.

**libswresample** converts audio sample formats and resamples audio. For example,
converting from 48kHz float to 44.1kHz signed 16-bit integer.

**libavutil** provides common utility functions used by all other libraries: mathematics,
memory management, logging, rational number handling, pixel format descriptors, and more.

**libavdevice** provides I/O for grabbing from and rendering to device-level inputs
and outputs (webcams, microphones, screen capture, audio output devices).

### Processing Pipeline

The fundamental FFmpeg processing pipeline:

```
Input File(s)           Output File(s)
    |                       ^
    v                       |
+----------+          +----------+
| Demuxer  |          |  Muxer   |
| (format) |          | (format) |
+----+-----+          +----+-----+
     |                     ^
     v                     |
+----------+          +----------+
| Decoder  |          | Encoder  |
| (codec)  |          | (codec)  |
+----+-----+          +----+-----+
     |                     ^
     v                     |
+----------+          +----------+
| Raw      +--------->| Filtered |
| Frames   | Filters  | Frames   |
+----------+          +----------+
```

When using stream copy mode (`-c copy`), the decoder and encoder are bypassed entirely.
Packets are remuxed directly from the demuxer to the muxer.

---

## FFmpeg CLI Fundamentals

### Basic Syntax

```bash
ffmpeg [global_options] {[input_options] -i input_url} ... {[output_options] output_url} ...
```

Options placed before `-i` apply to the input. Options placed after the last `-i` (or
before the output filename) apply to the output.

### Simple Transcoding

```bash
# Transcode a video (FFmpeg chooses codecs based on output format)
ffmpeg -i input.mov output.mp4

# Specify output codecs explicitly
ffmpeg -i input.mov -c:v libx264 -c:a aac output.mp4

# Copy streams without re-encoding (remux)
ffmpeg -i input.mkv -c copy output.mp4
```

### Stream Specifiers

Stream specifiers select which stream an option applies to:

```bash
-c:v libx264     # Video codec
-c:a aac         # Audio codec
-c:s mov_text    # Subtitle codec
-b:v 5M          # Video bitrate
-b:a 128k        # Audio bitrate
-c:v:0 libx264   # First video stream codec
-c:a:1 aac       # Second audio stream codec
```

### Stream Selection with -map

By default, FFmpeg selects one stream per type (best video, best audio, etc.). The
`-map` option gives explicit control:

```bash
# Select specific streams
ffmpeg -i input.mkv -map 0:v:0 -map 0:a:0 output.mp4

# Explanation:
#   0:v:0  = First video stream from first input
#   0:a:0  = First audio stream from first input

# Select all streams from input 0
ffmpeg -i input.mkv -map 0 -c copy output.mkv

# Combine streams from multiple inputs
ffmpeg -i video.mp4 -i audio.wav -map 0:v -map 1:a -c copy output.mp4

# Exclude a stream type
ffmpeg -i input.mkv -map 0 -map -0:s -c copy output.mkv
# Copies everything except subtitles

# Select by language
ffmpeg -i input.mkv -map 0:v -map 0:a:m:language:eng -c copy output.mp4
```

### Format Conversion

```bash
# Force input or output format
ffmpeg -f rawvideo -pix_fmt yuv420p -s 1920x1080 -i raw.yuv output.mp4

# Force output format (useful when output is a pipe)
ffmpeg -i input.mp4 -f mpegts pipe:1

# Common container conversions
ffmpeg -i input.avi -c:v libx264 -c:a aac output.mp4
ffmpeg -i input.mp4 -c copy output.mkv
ffmpeg -i input.mp4 -c:v libvpx-vp9 -c:a libopus output.webm
```

### Seeking and Duration

```bash
# Seek to a position (fast seek, before -i)
ffmpeg -ss 00:01:30 -i input.mp4 -c copy output.mp4

# Seek + limit duration
ffmpeg -ss 00:01:30 -t 00:00:10 -i input.mp4 -c copy clip.mp4

# Seek to end point
ffmpeg -ss 00:01:30 -to 00:01:40 -i input.mp4 -c copy clip.mp4

# Note: -ss before -i is fast (seeks by keyframes).
# -ss after -i is slow but frame-accurate.
ffmpeg -i input.mp4 -ss 00:01:30 -t 10 -c:v libx264 -c:a aac clip.mp4
```

### Overwrite and Verbosity

```bash
# Automatically overwrite output
ffmpeg -y -i input.mp4 output.mp4

# Never overwrite
ffmpeg -n -i input.mp4 output.mp4

# Control log level
ffmpeg -v quiet -i input.mp4 output.mp4
ffmpeg -v error -i input.mp4 output.mp4
ffmpeg -v info -i input.mp4 output.mp4    # default
ffmpeg -v debug -i input.mp4 output.mp4
```

---

## Video Encoding with FFmpeg

### H.264 (libx264)

H.264/AVC is the most widely supported video codec. libx264 is the reference
open-source encoder.

#### Presets

Presets control the encoding speed vs compression efficiency tradeoff. Slower presets
produce smaller files at the same quality but take longer to encode.

```
ultrafast > superfast > veryfast > faster > fast > medium > slow > slower > veryslow

Fastest encoding ------>                                  <------ Best compression
Largest file     ------>                                  <------ Smallest file
```

```bash
ffmpeg -i input.mp4 -c:v libx264 -preset medium output.mp4
ffmpeg -i input.mp4 -c:v libx264 -preset veryslow output.mp4
```

#### CRF (Constant Rate Factor)

CRF is the recommended rate control mode for single-pass encoding when file size is
not a strict requirement. It targets a constant quality level.

```bash
# CRF range: 0 (lossless) to 51 (worst)
# Recommended range: 18-28
# Default: 23
# Lower CRF = better quality, larger file
# Each +6 roughly doubles the bitrate

ffmpeg -i input.mp4 -c:v libx264 -crf 23 output.mp4
ffmpeg -i input.mp4 -c:v libx264 -crf 18 -preset slow output.mp4
```

#### Bitrate Control

```bash
# Constant Bitrate (CBR) - useful for streaming
ffmpeg -i input.mp4 -c:v libx264 -b:v 5M -maxrate 5M -bufsize 10M output.mp4

# Variable Bitrate (VBR) with average target
ffmpeg -i input.mp4 -c:v libx264 -b:v 5M output.mp4

# Two-pass encoding for precise bitrate targeting
ffmpeg -i input.mp4 -c:v libx264 -b:v 5M -pass 1 -f null /dev/null
ffmpeg -i input.mp4 -c:v libx264 -b:v 5M -pass 2 output.mp4
```

#### Profile and Level

Profiles define feature sets. Levels define maximum parameters (resolution, bitrate).
Restricting these ensures device compatibility.

```bash
# Baseline: No B-frames, no CABAC. Maximum compatibility.
ffmpeg -i input.mp4 -c:v libx264 -profile:v baseline -level 3.0 output.mp4

# Main: B-frames + CABAC. Most devices since ~2010.
ffmpeg -i input.mp4 -c:v libx264 -profile:v main -level 4.0 output.mp4

# High: 8x8 DCT, more reference frames. Recommended default.
ffmpeg -i input.mp4 -c:v libx264 -profile:v high -level 4.1 output.mp4

# Common levels:
#   3.0 - SD (720x576 @ 25fps)
#   3.1 - 720p @ 30fps
#   4.0 - 1080p @ 30fps
#   4.1 - 1080p @ 60fps (common for streaming)
#   5.1 - 4K @ 30fps
#   5.2 - 4K @ 60fps
```

#### Keyframe Interval

```bash
# Set keyframe interval (GOP size)
# For streaming/seeking, 2-second intervals are common
ffmpeg -i input.mp4 -c:v libx264 -g 48 -keyint_min 48 output.mp4
# At 24fps, -g 48 = keyframe every 2 seconds

# Force all keyframes to be IDR frames (important for segmentation)
ffmpeg -i input.mp4 -c:v libx264 -x264-params "keyint=48:min-keyint=48:no-scenecut" output.mp4
```

#### Tune

```bash
ffmpeg -i input.mp4 -c:v libx264 -tune film output.mp4        # High-quality film content
ffmpeg -i input.mp4 -c:v libx264 -tune animation output.mp4   # Cartoons/anime
ffmpeg -i input.mp4 -c:v libx264 -tune grain output.mp4       # Preserve film grain
ffmpeg -i input.mp4 -c:v libx264 -tune stillimage output.mp4  # Slideshows
ffmpeg -i input.mp4 -c:v libx264 -tune zerolatency output.mp4 # Low-latency streaming
ffmpeg -i input.mp4 -c:v libx264 -tune fastdecode output.mp4  # Playback on weak devices
```

### H.265 / HEVC (libx265)

H.265 achieves roughly 50% bitrate savings over H.264 at the same quality, but
encoding is significantly slower.

```bash
# Basic H.265 encoding
ffmpeg -i input.mp4 -c:v libx265 -crf 28 output.mp4
# Note: CRF 28 for x265 is roughly equivalent to CRF 23 for x264

# With preset
ffmpeg -i input.mp4 -c:v libx265 -crf 26 -preset medium output.mp4

# x265 params
ffmpeg -i input.mp4 -c:v libx265 -crf 26 -x265-params \
  "keyint=48:min-keyint=48:no-open-gop=1" output.mp4

# 10-bit encoding (better quality, especially for gradients)
ffmpeg -i input.mp4 -c:v libx265 -crf 26 -pix_fmt yuv420p10le output.mp4
```

### VP9 (libvpx-vp9)

VP9 is Google's royalty-free codec, widely used for WebM. It typically requires
two-pass encoding for best results.

```bash
# Two-pass VP9 encoding (recommended)
ffmpeg -i input.mp4 -c:v libvpx-vp9 -b:v 2M -pass 1 -an -f null /dev/null
ffmpeg -i input.mp4 -c:v libvpx-vp9 -b:v 2M -pass 2 -c:a libopus output.webm

# Constant quality mode
ffmpeg -i input.mp4 -c:v libvpx-vp9 -crf 30 -b:v 0 -c:a libopus output.webm
# -b:v 0 is required for pure CQ mode

# With tile columns and threading for speed
ffmpeg -i input.mp4 -c:v libvpx-vp9 -crf 30 -b:v 0 \
  -tile-columns 2 -threads 4 -c:a libopus output.webm
```

### AV1

AV1 is the next-generation royalty-free codec from the Alliance for Open Media. It
offers roughly 30% better compression than H.265 but encoding is very slow.

```bash
# libaom-av1 (reference encoder, very slow)
ffmpeg -i input.mp4 -c:v libaom-av1 -crf 30 -b:v 0 \
  -cpu-used 4 -row-mt 1 output.mp4
# -cpu-used: 0 (slowest/best) to 8 (fastest/worst)
# -row-mt 1: Enable row-based multithreading

# libsvtav1 (SVT-AV1, much faster, recommended)
ffmpeg -i input.mp4 -c:v libsvtav1 -crf 30 -preset 6 output.mp4
# preset: 0 (slowest) to 13 (fastest)
# preset 6 is a good balance

# SVT-AV1 with grain synthesis (preserves film grain efficiently)
ffmpeg -i input.mp4 -c:v libsvtav1 -crf 30 -preset 6 \
  -svtav1-params "film-grain=10:film-grain-denoise=1" output.mp4
```

### Codec Comparison Summary

```
+----------+----------+----------+---------+----------+-----------+
| Codec    | Quality  | Speed    | Support | Royalty  | Container |
+----------+----------+----------+---------+----------+-----------+
| H.264    | Good     | Fast     | Best    | Licensed | MP4, MKV  |
| H.265    | Better   | Slow     | Good    | Licensed | MP4, MKV  |
| VP9      | Better   | Slow     | Good    | Free     | WebM, MKV |
| AV1      | Best     | Slowest  | Growing | Free     | MP4, WebM |
+----------+----------+----------+---------+----------+-----------+
```

---

## Audio Encoding with FFmpeg

### AAC

AAC is the most common audio codec for MP4 containers.

```bash
# FFmpeg's built-in AAC encoder
ffmpeg -i input.mp4 -c:a aac -b:a 128k output.mp4

# libfdk_aac (higher quality, may require compilation)
ffmpeg -i input.mp4 -c:a libfdk_aac -b:a 128k output.mp4

# libfdk_aac VBR mode (1=lowest, 5=highest quality)
ffmpeg -i input.mp4 -c:a libfdk_aac -vbr 4 output.mp4

# HE-AAC for low bitrates
ffmpeg -i input.mp4 -c:a libfdk_aac -profile:a aac_he -b:a 64k output.mp4

# HE-AAC v2 (parametric stereo) for very low bitrates
ffmpeg -i input.mp4 -c:a libfdk_aac -profile:a aac_he_v2 -b:a 32k output.mp4
```

### Opus

Opus is the best general-purpose audio codec, excelling at all bitrates. Mandatory
for WebM containers and WebRTC.

```bash
# Encode to Opus in OGG container
ffmpeg -i input.wav -c:a libopus -b:a 128k output.ogg

# Opus in WebM container
ffmpeg -i input.mp4 -c:a libopus -b:a 128k output.webm

# VBR mode (default, recommended)
ffmpeg -i input.wav -c:a libopus -b:a 128k -vbr on output.ogg

# Application type
ffmpeg -i input.wav -c:a libopus -b:a 64k -application voip output.ogg
ffmpeg -i input.wav -c:a libopus -b:a 128k -application audio output.ogg
ffmpeg -i input.wav -c:a libopus -b:a 128k -application lowdelay output.ogg
```

### MP3 (libmp3lame)

```bash
# Constant bitrate
ffmpeg -i input.wav -c:a libmp3lame -b:a 320k output.mp3

# Variable bitrate (V0 is highest quality, V9 is lowest)
ffmpeg -i input.wav -c:a libmp3lame -q:a 0 output.mp3   # ~245 kbps VBR
ffmpeg -i input.wav -c:a libmp3lame -q:a 2 output.mp3   # ~190 kbps VBR
ffmpeg -i input.wav -c:a libmp3lame -q:a 4 output.mp3   # ~165 kbps VBR
```

### Audio Filters

```bash
# Volume adjustment
ffmpeg -i input.mp4 -af "volume=1.5" output.mp4           # 150% volume
ffmpeg -i input.mp4 -af "volume=-3dB" output.mp4          # Reduce by 3dB
ffmpeg -i input.mp4 -af "volume=6dB" output.mp4           # Boost by 6dB

# Equalization
ffmpeg -i input.mp4 -af "equalizer=f=1000:t=h:w=200:g=-10" output.mp4
# f=frequency, t=type(h=Hz,q=Q-factor), w=width, g=gain(dB)

# Bass boost
ffmpeg -i input.mp4 -af "bass=g=10:f=110:w=0.6" output.mp4

# EBU R128 loudness normalization (broadcast standard)
ffmpeg -i input.mp4 -af "loudnorm=I=-16:TP=-1.5:LRA=11" output.mp4

# Two-pass loudness normalization for precision
ffmpeg -i input.mp4 -af "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json" \
  -f null /dev/null
# Parse the JSON output, then:
ffmpeg -i input.mp4 -af \
  "loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=-20:measured_TP=-2:measured_LRA=8:measured_thresh=-30:offset=-0.5:linear=true" \
  output.mp4

# Highpass / lowpass filters
ffmpeg -i input.mp4 -af "highpass=f=200,lowpass=f=3000" output.mp4

# Noise gate
ffmpeg -i input.mp4 -af "agate=threshold=0.01:ratio=2:attack=5:release=50" output.mp4

# Audio fade in/out
ffmpeg -i input.mp4 -af "afade=t=in:ss=0:d=3,afade=t=out:st=57:d=3" output.mp4

# Change sample rate
ffmpeg -i input.wav -ar 44100 output.wav

# Change channel layout
ffmpeg -i input.wav -ac 1 output_mono.wav    # Stereo to mono
ffmpeg -i input.wav -ac 2 output_stereo.wav  # Mono to stereo
```

---

## Filter Graphs

### Simple vs Complex Filter Graphs

**Simple filter graphs** have a single input and single output. They use the `-vf`
(video filter) and `-af` (audio filter) shorthand options.

**Complex filter graphs** have multiple inputs or outputs. They use the
`-filter_complex` option and use named pads for connecting filters.

### Simple Filter Syntax

Filters are separated by commas to form a filter chain:

```bash
# Single filter
ffmpeg -i input.mp4 -vf "scale=1280:720" output.mp4

# Chained filters (comma-separated)
ffmpeg -i input.mp4 -vf "scale=1280:720,fps=30,format=yuv420p" output.mp4

# Audio filter chain
ffmpeg -i input.mp4 -af "volume=1.5,equalizer=f=1000:t=h:w=200:g=-5" output.mp4
```

### Complex Filter Graph Syntax

In complex filter graphs, semicolons separate filter chains, and square brackets
denote named pads:

```bash
# Syntax: [input_pad]filter=params[output_pad];[input_pad]filter=params[output_pad]

# Picture-in-picture
ffmpeg -i main.mp4 -i overlay.mp4 -filter_complex \
  "[1:v]scale=320:180[pip];[0:v][pip]overlay=W-w-10:H-h-10" \
  -c:v libx264 output.mp4

# Side-by-side videos
ffmpeg -i left.mp4 -i right.mp4 -filter_complex \
  "[0:v]scale=640:480[left];[1:v]scale=640:480[right];[left][right]hstack" \
  -c:v libx264 output.mp4
```

### Common Video Filters

#### scale

```bash
# Scale to specific resolution
ffmpeg -i input.mp4 -vf "scale=1280:720" output.mp4

# Scale preserving aspect ratio (use -1 or -2 for auto)
ffmpeg -i input.mp4 -vf "scale=1280:-1" output.mp4   # auto height
ffmpeg -i input.mp4 -vf "scale=-2:720" output.mp4    # auto width (even number)

# Scale with algorithm selection
ffmpeg -i input.mp4 -vf "scale=1920:1080:flags=lanczos" output.mp4
# Algorithms: fast_bilinear, bilinear, bicubic, lanczos, spline

# Scale with expressions
ffmpeg -i input.mp4 -vf "scale=iw/2:ih/2" output.mp4   # Half size
ffmpeg -i input.mp4 -vf "scale='min(1280,iw)':'min(720,ih)'" output.mp4
```

#### crop

```bash
# crop=w:h:x:y
ffmpeg -i input.mp4 -vf "crop=640:480:100:50" output.mp4

# Crop to center square
ffmpeg -i input.mp4 -vf "crop=min(iw\,ih):min(iw\,ih)" output.mp4

# Crop to 16:9 from center
ffmpeg -i input.mp4 -vf "crop=ih*16/9:ih" output.mp4

# Remove black bars (auto-detect)
ffmpeg -i input.mp4 -vf "cropdetect" -f null /dev/null
# Then use the detected crop values
```

#### overlay

```bash
# overlay=x:y
ffmpeg -i background.mp4 -i foreground.png -filter_complex \
  "overlay=10:10" output.mp4

# Center overlay
ffmpeg -i bg.mp4 -i fg.png -filter_complex \
  "overlay=(W-w)/2:(H-h)/2" output.mp4

# Bottom-right corner
ffmpeg -i bg.mp4 -i fg.png -filter_complex \
  "overlay=W-w-10:H-h-10" output.mp4
```

#### drawtext

```bash
# Basic text overlay
ffmpeg -i input.mp4 -vf \
  "drawtext=text='Hello World':fontsize=48:fontcolor=white:x=100:y=100" \
  output.mp4

# Timestamp overlay
ffmpeg -i input.mp4 -vf \
  "drawtext=text='%{pts\\:hms}':fontsize=24:fontcolor=white:x=10:y=10" \
  output.mp4

# Timecode with background box
ffmpeg -i input.mp4 -vf \
  "drawtext=text='%{localtime}':fontsize=20:fontcolor=white:box=1:boxcolor=black@0.5:boxborderw=5:x=10:y=10" \
  output.mp4
```

#### fps and framerate manipulation

```bash
# Change framerate
ffmpeg -i input.mp4 -vf "fps=30" output.mp4

# Slow motion (0.5x speed)
ffmpeg -i input.mp4 -vf "setpts=2*PTS" -af "atempo=0.5" output.mp4

# Fast motion (2x speed)
ffmpeg -i input.mp4 -vf "setpts=0.5*PTS" -af "atempo=2.0" output.mp4

# Note: atempo supports 0.5 to 2.0 range.
# For 4x: chain two atempo filters
ffmpeg -i input.mp4 -vf "setpts=0.25*PTS" -af "atempo=2.0,atempo=2.0" output.mp4
```

#### trim

```bash
# Trim by time (seconds)
ffmpeg -i input.mp4 -vf "trim=start=10:end=20,setpts=PTS-STARTPTS" \
  -af "atrim=start=10:end=20,asetpts=PTS-STARTPTS" output.mp4

# Note: setpts=PTS-STARTPTS resets timestamps to start from 0
```

### Common Audio Filters

```bash
# amerge - Merge multiple audio streams
ffmpeg -i input1.mp4 -i input2.mp4 -filter_complex \
  "[0:a][1:a]amerge=inputs=2[a]" -map 0:v -map "[a]" output.mp4

# pan - Remap audio channels
ffmpeg -i input.mp4 -af "pan=mono|c0=0.5*c0+0.5*c1" output.mp4

# aresample - Resample audio
ffmpeg -i input.mp4 -af "aresample=44100" output.mp4

# silencedetect - Detect silence
ffmpeg -i input.mp4 -af "silencedetect=noise=-30dB:d=2" -f null /dev/null

# aecho - Add echo effect
ffmpeg -i input.mp4 -af "aecho=0.8:0.88:60:0.4" output.mp4
```

---

## Advanced Filtering

### Color Correction

```bash
# eq - Adjust brightness, contrast, saturation, gamma
ffmpeg -i input.mp4 -vf "eq=brightness=0.1:contrast=1.2:saturation=1.3:gamma=1.1" output.mp4
# brightness: -1.0 to 1.0
# contrast: -1000 to 1000 (1.0 = no change)
# saturation: 0.0 to 3.0 (1.0 = no change)
# gamma: 0.1 to 10.0 (1.0 = no change)

# colorbalance - Adjust color balance per range
ffmpeg -i input.mp4 -vf \
  "colorbalance=rs=0.1:gs=-0.1:bs=0.0:rm=0.0:gm=0.05:bm=0.0:rh=0.0:gh=0.0:bh=0.1" \
  output.mp4
# rs/gs/bs = shadows, rm/gm/bm = midtones, rh/gh/bh = highlights

# lut3d - Apply a 3D LUT (color grading)
ffmpeg -i input.mp4 -vf "lut3d=file=cinematic.cube" output.mp4
# Supports .cube, .3dl, and other LUT formats

# curves - Apply tone curves (like Photoshop curves)
ffmpeg -i input.mp4 -vf "curves=preset=lighter" output.mp4
ffmpeg -i input.mp4 -vf "curves=preset=darker" output.mp4
ffmpeg -i input.mp4 -vf "curves=preset=increase_contrast" output.mp4

# White balance adjustment via colortemperature
ffmpeg -i input.mp4 -vf "colortemperature=temperature=6500" output.mp4
```

### Deinterlacing

Deinterlacing converts interlaced video (common in broadcast) to progressive.

```bash
# yadif - Yet Another DeInterlacing Filter
ffmpeg -i interlaced.mpg -vf "yadif" output.mp4
# mode 0: Output one frame per frame (default)
# mode 1: Output one frame per field (doubles framerate)
ffmpeg -i interlaced.mpg -vf "yadif=1" output.mp4

# bwdif - Bob Weaver Deinterlacing Filter (better quality)
ffmpeg -i interlaced.mpg -vf "bwdif" output.mp4

# For detecting if input is interlaced:
ffprobe -v error -select_streams v:0 -show_entries stream=field_order input.mpg
```

### Noise Reduction

```bash
# nlmeans - Non-Local Means denoising (high quality, slow)
ffmpeg -i input.mp4 -vf "nlmeans=s=3.0:p=7:pc=5:r=15:rc=10" output.mp4
# s = denoising strength (default 1.0)
# p/r = patch/research size

# hqdn3d - High Quality 3D Denoiser (faster)
ffmpeg -i input.mp4 -vf "hqdn3d=4:3:6:4.5" output.mp4
# Parameters: luma_spatial:chroma_spatial:luma_tmp:chroma_tmp

# For very noisy video, combine spatial and temporal denoising
ffmpeg -i input.mp4 -vf "hqdn3d=6:4:8:6" output.mp4
```

### Sharpening

```bash
# unsharp - Unsharp mask (sharpen or blur)
ffmpeg -i input.mp4 -vf "unsharp=5:5:1.0:5:5:0.0" output.mp4
# luma_msize_x:luma_msize_y:luma_amount:chroma_msize_x:chroma_msize_y:chroma_amount
# Positive amount = sharpen, negative = blur

# Moderate sharpening
ffmpeg -i input.mp4 -vf "unsharp=3:3:0.5" output.mp4

# cas - Contrast Adaptive Sharpening (AMD FidelityFX)
ffmpeg -i input.mp4 -vf "cas=strength=0.5" output.mp4
```

### Complex Overlay Compositions

```bash
# Picture-in-picture with fade-in
ffmpeg -i main.mp4 -i pip.mp4 -filter_complex \
  "[1:v]scale=320:180,format=yuva420p,fade=in:st=2:d=1:alpha=1[pip]; \
   [0:v][pip]overlay=W-w-20:H-h-20:enable='between(t,2,10)'" \
  -c:v libx264 output.mp4

# Watermark with transparency
ffmpeg -i input.mp4 -i watermark.png -filter_complex \
  "[1:v]format=rgba,colorchannelmixer=aa=0.3[wm]; \
   [0:v][wm]overlay=W-w-10:10" \
  -c:v libx264 output.mp4

# Tiled mosaic of 4 videos
ffmpeg -i v1.mp4 -i v2.mp4 -i v3.mp4 -i v4.mp4 -filter_complex \
  "[0:v]scale=640:360[a];[1:v]scale=640:360[b]; \
   [2:v]scale=640:360[c];[3:v]scale=640:360[d]; \
   [a][b]hstack[top];[c][d]hstack[bottom]; \
   [top][bottom]vstack" \
  -c:v libx264 output.mp4

# Green screen (chroma key)
ffmpeg -i background.mp4 -i greenscreen.mp4 -filter_complex \
  "[1:v]chromakey=0x00FF00:0.1:0.2[fg];[0:v][fg]overlay" \
  -c:v libx264 output.mp4
```

---

## Streaming with FFmpeg

### RTMP Output

```bash
# Stream to RTMP server (e.g., YouTube, Twitch)
ffmpeg -re -i input.mp4 -c:v libx264 -preset veryfast -maxrate 3000k \
  -bufsize 6000k -pix_fmt yuv420p -g 50 -c:a aac -b:a 160k -ar 44100 \
  -f flv rtmp://live.twitch.tv/app/YOUR_STREAM_KEY

# -re flag reads input at native frame rate (important for live streaming)

# Stream webcam + microphone
ffmpeg -f avfoundation -i "0:0" -c:v libx264 -preset ultrafast \
  -tune zerolatency -b:v 2500k -c:a aac -b:a 128k \
  -f flv rtmp://your-server/live/stream
```

### HLS Output

HTTP Live Streaming (HLS) segments video into small chunks served over HTTP.

```bash
# Basic HLS output
ffmpeg -i input.mp4 -c:v libx264 -c:a aac -f hls \
  -hls_time 6 \
  -hls_list_size 0 \
  -hls_segment_filename "segment_%03d.ts" \
  playlist.m3u8

# HLS with fMP4 segments (more efficient than MPEG-TS)
ffmpeg -i input.mp4 -c:v libx264 -c:a aac -f hls \
  -hls_time 6 \
  -hls_list_size 0 \
  -hls_segment_type fmp4 \
  -hls_fmp4_init_filename "init.mp4" \
  -hls_segment_filename "segment_%03d.m4s" \
  playlist.m3u8

# Key HLS options:
#   -hls_time 6         Segment duration in seconds
#   -hls_list_size 0    Keep all segments in playlist (0 = unlimited)
#   -hls_list_size 5    Keep last 5 segments (for live)
#   -hls_segment_type   mpegts (default) or fmp4
#   -hls_flags          Various flags:
#     delete_segments   Delete old segments
#     independent_segments  Each segment is independently decodable
#     append_list       Append to existing playlist

# HLS with encryption
ffmpeg -i input.mp4 -c:v libx264 -c:a aac -f hls \
  -hls_time 6 \
  -hls_key_info_file key_info.txt \
  playlist.m3u8
```

### DASH Output

Dynamic Adaptive Streaming over HTTP (DASH) is the standard alternative to HLS.

```bash
# Basic DASH output
ffmpeg -i input.mp4 -c:v libx264 -c:a aac -f dash \
  -seg_duration 4 \
  -use_timeline 1 \
  -use_template 1 \
  manifest.mpd

# DASH with initialization segment
ffmpeg -i input.mp4 -c:v libx264 -c:a aac -f dash \
  -seg_duration 4 \
  -init_seg_name "init-\$RepresentationID\$.m4s" \
  -media_seg_name "chunk-\$RepresentationID\$-\$Number%05d\$.m4s" \
  manifest.mpd
```

### Multi-Bitrate Encoding for ABR

Adaptive Bitrate Streaming requires encoding the same content at multiple quality
levels. This is the standard practice for production video delivery.

```bash
# Multi-bitrate HLS with master playlist
ffmpeg -i input.mp4 \
  -filter_complex \
  "[0:v]split=3[v1][v2][v3]; \
   [v1]scale=1920:1080[v1out]; \
   [v2]scale=1280:720[v2out]; \
   [v3]scale=854:480[v3out]" \
  -map "[v1out]" -c:v:0 libx264 -b:v:0 5M -maxrate:v:0 5.5M -bufsize:v:0 10M -preset fast \
  -map "[v2out]" -c:v:1 libx264 -b:v:1 2.5M -maxrate:v:1 2.75M -bufsize:v:1 5M -preset fast \
  -map "[v3out]" -c:v:2 libx264 -b:v:2 1M -maxrate:v:2 1.1M -bufsize:v:2 2M -preset fast \
  -map 0:a -c:a aac -b:a 128k \
  -f hls \
  -hls_time 6 \
  -hls_list_size 0 \
  -master_pl_name master.m3u8 \
  -var_stream_map "v:0,a:0 v:1,a:0 v:2,a:0" \
  stream_%v/playlist.m3u8

# Resulting structure:
#   master.m3u8           - Master playlist pointing to variant playlists
#   stream_0/playlist.m3u8 - 1080p variant
#   stream_1/playlist.m3u8 - 720p variant
#   stream_2/playlist.m3u8 - 480p variant
```

### Re-streaming

```bash
# Receive RTMP and output HLS
ffmpeg -listen 1 -i rtmp://0.0.0.0:1935/live/stream \
  -c copy -f hls -hls_time 4 -hls_list_size 5 \
  -hls_flags delete_segments /var/www/html/live.m3u8

# Relay one RTMP to another
ffmpeg -i rtmp://source-server/live/stream \
  -c copy -f flv rtmp://destination-server/live/stream

# Record and stream simultaneously
ffmpeg -i rtmp://source/live/stream \
  -c copy -f flv rtmp://dest/live/stream \
  -c copy recording.mp4
```

---

## Hardware Acceleration

Hardware acceleration offloads encoding/decoding to dedicated hardware (GPU, ASIC),
drastically improving performance.

### Architecture

```
+-------------------------------------------------------------------+
|                  Hardware Acceleration Stack                       |
+-------------------------------------------------------------------+
|                                                                   |
|  +------------------+  +----------------+  +------------------+   |
|  |   NVIDIA NVENC   |  |   Intel QSV    |  |  Apple VideoTBx  |   |
|  |   NVIDIA NVDEC   |  |   (QuickSync)  |  |  (VideoToolbox)  |   |
|  +--------+---------+  +-------+--------+  +--------+---------+   |
|           |                    |                     |             |
|  +--------v--------------------v---------------------v---------+  |
|  |              FFmpeg Hardware Abstraction Layer               |  |
|  |                                                             |  |
|  |  hwaccel     - Hardware-accelerated decoding                |  |
|  |  hwupload    - Upload frames to GPU memory                  |  |
|  |  hwdownload  - Download frames from GPU memory              |  |
|  |  hwmap       - Map frames between hardware surfaces         |  |
|  +-------------------------------------------------------------+  |
+-------------------------------------------------------------------+
```

### NVIDIA NVENC/NVDEC

```bash
# Check available NVIDIA encoders
ffmpeg -encoders | grep nvenc

# H.264 hardware encoding
ffmpeg -i input.mp4 -c:v h264_nvenc -preset p6 -b:v 5M output.mp4
# NVENC presets: p1 (fastest) to p7 (slowest/best)

# H.265 hardware encoding
ffmpeg -i input.mp4 -c:v hevc_nvenc -preset p5 -b:v 3M output.mp4

# Hardware decode + encode (full GPU pipeline)
ffmpeg -hwaccel cuda -hwaccel_output_format cuda \
  -i input.mp4 -c:v h264_nvenc -preset p6 output.mp4

# GPU scaling with hardware frames
ffmpeg -hwaccel cuda -hwaccel_output_format cuda \
  -i input.mp4 \
  -vf "scale_cuda=1280:720" \
  -c:v h264_nvenc output.mp4

# CQ (Constant Quality) mode with NVENC
ffmpeg -i input.mp4 -c:v h264_nvenc -preset p5 \
  -rc constqp -qp 23 output.mp4

# VBR mode with NVENC
ffmpeg -i input.mp4 -c:v h264_nvenc -preset p5 \
  -rc vbr -b:v 5M -maxrate 8M -bufsize 10M output.mp4
```

### Intel Quick Sync Video (QSV)

```bash
# H.264 QSV encoding
ffmpeg -i input.mp4 -c:v h264_qsv -preset medium -b:v 5M output.mp4

# HEVC QSV encoding
ffmpeg -i input.mp4 -c:v hevc_qsv -preset medium -b:v 3M output.mp4

# Full QSV pipeline (decode + filter + encode)
ffmpeg -hwaccel qsv -c:v h264_qsv -i input.mp4 \
  -vf "scale_qsv=1280:720" -c:v h264_qsv output.mp4

# QSV with look-ahead (better quality)
ffmpeg -i input.mp4 -c:v h264_qsv -preset medium \
  -look_ahead 1 -look_ahead_depth 40 output.mp4
```

### Apple VideoToolbox (macOS)

```bash
# H.264 VideoToolbox encoding
ffmpeg -i input.mp4 -c:v h264_videotoolbox -b:v 5M output.mp4

# HEVC VideoToolbox encoding
ffmpeg -i input.mp4 -c:v hevc_videotoolbox -b:v 3M output.mp4

# Hardware decode + encode
ffmpeg -hwaccel videotoolbox -i input.mp4 \
  -c:v h264_videotoolbox -b:v 5M output.mp4

# Constant quality mode
ffmpeg -i input.mp4 -c:v h264_videotoolbox -q:v 50 output.mp4
# Quality: 1-100 (higher = better)

# Allow software fallback
ffmpeg -i input.mp4 -c:v h264_videotoolbox \
  -allow_sw 1 -b:v 5M output.mp4
```

### VA-API (Linux)

```bash
# H.264 VA-API encoding
ffmpeg -vaapi_device /dev/dri/renderD128 -i input.mp4 \
  -vf "format=nv12,hwupload" -c:v h264_vaapi -b:v 5M output.mp4

# HEVC VA-API encoding
ffmpeg -vaapi_device /dev/dri/renderD128 -i input.mp4 \
  -vf "format=nv12,hwupload" -c:v hevc_vaapi -b:v 3M output.mp4

# Full VA-API pipeline
ffmpeg -hwaccel vaapi -hwaccel_device /dev/dri/renderD128 \
  -hwaccel_output_format vaapi -i input.mp4 \
  -vf "scale_vaapi=1280:720" -c:v h264_vaapi output.mp4
```

### hwupload / hwdownload

When mixing software and hardware filters, you need to transfer frames between
system memory and GPU memory.

```bash
# Upload to GPU -> GPU filter -> encode on GPU
ffmpeg -i input.mp4 \
  -vf "hwupload_cuda,scale_cuda=1280:720" \
  -c:v h264_nvenc output.mp4

# Decode on GPU -> download to CPU -> software filter -> upload -> encode on GPU
ffmpeg -hwaccel cuda -hwaccel_output_format cuda -i input.mp4 \
  -vf "hwdownload,format=nv12,drawtext=text='Hello':fontsize=48:fontcolor=white,hwupload_cuda" \
  -c:v h264_nvenc output.mp4
```

---

## FFprobe

FFprobe is FFmpeg's media analysis tool. It extracts detailed information about
containers, streams, packets, and frames without transcoding.

### Basic Usage

```bash
# Show all information
ffprobe input.mp4

# Show specific stream info
ffprobe -show_streams input.mp4

# Show format (container) info
ffprobe -show_format input.mp4

# Show both
ffprobe -show_format -show_streams input.mp4
```

### JSON Output

```bash
# Output as JSON (best for programmatic use)
ffprobe -v quiet -print_format json -show_format -show_streams input.mp4

# Pretty-print JSON
ffprobe -v quiet -print_format json -show_format -show_streams input.mp4 | python3 -m json.tool
```

### Extracting Specific Properties

```bash
# Get video resolution
ffprobe -v error -select_streams v:0 \
  -show_entries stream=width,height \
  -of csv=s=x:p=0 input.mp4
# Output: 1920x1080

# Get duration
ffprobe -v error -show_entries format=duration \
  -of default=noprint_wrappers=1:nokey=1 input.mp4
# Output: 125.456000

# Get video codec
ffprobe -v error -select_streams v:0 \
  -show_entries stream=codec_name \
  -of default=noprint_wrappers=1:nokey=1 input.mp4
# Output: h264

# Get bitrate
ffprobe -v error -show_entries format=bit_rate \
  -of default=noprint_wrappers=1:nokey=1 input.mp4

# Get frame rate
ffprobe -v error -select_streams v:0 \
  -show_entries stream=r_frame_rate \
  -of default=noprint_wrappers=1:nokey=1 input.mp4
# Output: 24000/1001  (= 23.976 fps)

# Get pixel format
ffprobe -v error -select_streams v:0 \
  -show_entries stream=pix_fmt \
  -of default=noprint_wrappers=1:nokey=1 input.mp4

# Get audio sample rate and channels
ffprobe -v error -select_streams a:0 \
  -show_entries stream=sample_rate,channels \
  -of default=noprint_wrappers=1 input.mp4
```

### Frame Analysis

```bash
# Show all frames
ffprobe -show_frames input.mp4

# Show only keyframes (I-frames)
ffprobe -v error -select_streams v:0 -show_frames \
  -show_entries frame=pict_type,pts_time \
  -of csv input.mp4 | grep "I"

# Count total frames
ffprobe -v error -count_frames -select_streams v:0 \
  -show_entries stream=nb_read_frames \
  -of default=noprint_wrappers=1:nokey=1 input.mp4

# Show keyframe intervals
ffprobe -v error -select_streams v:0 -show_entries frame=key_frame,pts_time \
  -of csv=p=0 input.mp4 | grep "^1,"
```

### Packet Analysis

```bash
# Show packets
ffprobe -show_packets input.mp4

# Show video packet sizes (useful for bitrate analysis)
ffprobe -v error -select_streams v:0 -show_packets \
  -show_entries packet=pts_time,size \
  -of csv=p=0 input.mp4

# Show packet flags (keyframe detection)
ffprobe -v error -select_streams v:0 -show_packets \
  -show_entries packet=pts_time,flags \
  -of csv=p=0 input.mp4
```

### Detecting Properties

```bash
# Detect interlacing
ffprobe -v error -select_streams v:0 \
  -show_entries stream=field_order \
  -of default=noprint_wrappers=1:nokey=1 input.mpg

# Detect HDR (color metadata)
ffprobe -v error -select_streams v:0 \
  -show_entries stream=color_primaries,color_transfer,color_space \
  -of default=noprint_wrappers=1 input.mp4

# Detect crop values (black bar detection)
ffmpeg -i input.mp4 -vf "cropdetect=24:16:0" -f null /dev/null 2>&1 | tail -5

# Detect silence
ffmpeg -i input.mp4 -af "silencedetect=noise=-50dB:d=2" -f null /dev/null

# Detect black frames
ffmpeg -i input.mp4 -vf "blackdetect=d=0.5:pix_th=0.1" -f null /dev/null

# Check if file is valid / detect errors
ffmpeg -v error -i input.mp4 -f null /dev/null
```

---

## libav Programming

FFmpeg's libraries can be used directly in C programs for building custom media
applications. This section demonstrates the core APIs.

### Headers and Linking

```c
// Required headers
#include <libavformat/avformat.h>
#include <libavcodec/avcodec.h>
#include <libavutil/avutil.h>
#include <libavutil/imgutils.h>
#include <libswscale/swscale.h>
#include <libswresample/swresample.h>
#include <libavfilter/avfilter.h>
#include <libavfilter/buffersink.h>
#include <libavfilter/buffersrc.h>
```

```bash
# Compile with pkg-config
gcc -o mytool mytool.c $(pkg-config --cflags --libs libavformat libavcodec libavutil libswscale libswresample)
```

### Opening and Reading a Media File

```c
#include <libavformat/avformat.h>
#include <libavcodec/avcodec.h>
#include <stdio.h>

int main(int argc, char *argv[]) {
    AVFormatContext *fmt_ctx = NULL;
    int ret;

    // Open the input file
    ret = avformat_open_input(&fmt_ctx, argv[1], NULL, NULL);
    if (ret < 0) {
        char errbuf[256];
        av_strerror(ret, errbuf, sizeof(errbuf));
        fprintf(stderr, "Cannot open input: %s\n", errbuf);
        return 1;
    }

    // Read stream information
    ret = avformat_find_stream_info(fmt_ctx, NULL);
    if (ret < 0) {
        fprintf(stderr, "Cannot find stream info\n");
        avformat_close_input(&fmt_ctx);
        return 1;
    }

    // Print format info
    printf("Format: %s\n", fmt_ctx->iformat->long_name);
    printf("Duration: %lld us\n", fmt_ctx->duration);
    printf("Number of streams: %u\n", fmt_ctx->nb_streams);

    // Iterate streams
    for (unsigned int i = 0; i < fmt_ctx->nb_streams; i++) {
        AVStream *stream = fmt_ctx->streams[i];
        const AVCodecParameters *codecpar = stream->codecpar;

        printf("\nStream #%d:\n", i);
        printf("  Type: %s\n", av_get_media_type_string(codecpar->codec_type));
        printf("  Codec: %s\n", avcodec_get_name(codecpar->codec_id));

        if (codecpar->codec_type == AVMEDIA_TYPE_VIDEO) {
            printf("  Resolution: %dx%d\n", codecpar->width, codecpar->height);
            printf("  FPS: %.2f\n",
                   av_q2d(stream->avg_frame_rate));
        } else if (codecpar->codec_type == AVMEDIA_TYPE_AUDIO) {
            printf("  Sample Rate: %d\n", codecpar->sample_rate);
            printf("  Channels: %d\n", codecpar->ch_layout.nb_channels);
        }
    }

    avformat_close_input(&fmt_ctx);
    return 0;
}
```

### Complete Transcoding Example in C

This example reads an input file, decodes video frames, and encodes them to H.264
in an MP4 container.

```c
#include <libavformat/avformat.h>
#include <libavcodec/avcodec.h>
#include <libavutil/opt.h>
#include <libavutil/imgutils.h>
#include <libavutil/timestamp.h>
#include <libswscale/swscale.h>
#include <stdio.h>

typedef struct StreamContext {
    AVCodecContext *dec_ctx;
    AVCodecContext *enc_ctx;
    int stream_index;
} StreamContext;

static int open_input(const char *filename,
                      AVFormatContext **ifmt_ctx,
                      StreamContext *sc) {
    int ret;
    const AVCodec *decoder;

    ret = avformat_open_input(ifmt_ctx, filename, NULL, NULL);
    if (ret < 0) return ret;

    ret = avformat_find_stream_info(*ifmt_ctx, NULL);
    if (ret < 0) return ret;

    // Find the best video stream
    ret = av_find_best_stream(*ifmt_ctx, AVMEDIA_TYPE_VIDEO,
                              -1, -1, &decoder, 0);
    if (ret < 0) return ret;
    sc->stream_index = ret;

    // Create decoder context
    sc->dec_ctx = avcodec_alloc_context3(decoder);
    if (!sc->dec_ctx) return AVERROR(ENOMEM);

    avcodec_parameters_to_context(
        sc->dec_ctx,
        (*ifmt_ctx)->streams[sc->stream_index]->codecpar
    );

    ret = avcodec_open2(sc->dec_ctx, decoder, NULL);
    if (ret < 0) return ret;

    return 0;
}

static int open_output(const char *filename,
                       AVFormatContext *ifmt_ctx,
                       AVFormatContext **ofmt_ctx,
                       StreamContext *sc) {
    int ret;
    const AVCodec *encoder;
    AVStream *out_stream;

    ret = avformat_alloc_output_context2(ofmt_ctx, NULL, NULL, filename);
    if (ret < 0) return ret;

    // Create output stream
    out_stream = avformat_new_stream(*ofmt_ctx, NULL);
    if (!out_stream) return AVERROR(ENOMEM);

    // Set up H.264 encoder
    encoder = avcodec_find_encoder(AV_CODEC_ID_H264);
    if (!encoder) return AVERROR_ENCODER_NOT_FOUND;

    sc->enc_ctx = avcodec_alloc_context3(encoder);
    if (!sc->enc_ctx) return AVERROR(ENOMEM);

    sc->enc_ctx->width = sc->dec_ctx->width;
    sc->enc_ctx->height = sc->dec_ctx->height;
    sc->enc_ctx->sample_aspect_ratio = sc->dec_ctx->sample_aspect_ratio;
    sc->enc_ctx->pix_fmt = AV_PIX_FMT_YUV420P;
    sc->enc_ctx->time_base = av_inv_q(
        ifmt_ctx->streams[sc->stream_index]->avg_frame_rate
    );
    sc->enc_ctx->framerate =
        ifmt_ctx->streams[sc->stream_index]->avg_frame_rate;

    // Set encoding options
    av_opt_set(sc->enc_ctx->priv_data, "preset", "medium", 0);
    av_opt_set(sc->enc_ctx->priv_data, "crf", "23", 0);

    if ((*ofmt_ctx)->oformat->flags & AVFMT_GLOBALHEADER)
        sc->enc_ctx->flags |= AV_CODEC_FLAG_GLOBAL_HEADER;

    ret = avcodec_open2(sc->enc_ctx, encoder, NULL);
    if (ret < 0) return ret;

    ret = avcodec_parameters_from_context(out_stream->codecpar, sc->enc_ctx);
    if (ret < 0) return ret;

    out_stream->time_base = sc->enc_ctx->time_base;

    // Open output file
    if (!((*ofmt_ctx)->oformat->flags & AVFMT_NOFILE)) {
        ret = avio_open(&(*ofmt_ctx)->pb, filename, AVIO_FLAG_WRITE);
        if (ret < 0) return ret;
    }

    ret = avformat_write_header(*ofmt_ctx, NULL);
    return ret;
}

static int encode_write_frame(AVFrame *frame,
                              AVFormatContext *ofmt_ctx,
                              StreamContext *sc) {
    AVPacket *pkt = av_packet_alloc();
    if (!pkt) return AVERROR(ENOMEM);

    int ret = avcodec_send_frame(sc->enc_ctx, frame);
    if (ret < 0) {
        av_packet_free(&pkt);
        return ret;
    }

    while (ret >= 0) {
        ret = avcodec_receive_packet(sc->enc_ctx, pkt);
        if (ret == AVERROR(EAGAIN) || ret == AVERROR_EOF) {
            av_packet_free(&pkt);
            return 0;
        }
        if (ret < 0) {
            av_packet_free(&pkt);
            return ret;
        }

        pkt->stream_index = 0;
        av_packet_rescale_ts(pkt,
                             sc->enc_ctx->time_base,
                             ofmt_ctx->streams[0]->time_base);

        ret = av_interleaved_write_frame(ofmt_ctx, pkt);
        av_packet_unref(pkt);
    }

    av_packet_free(&pkt);
    return 0;
}

int main(int argc, char *argv[]) {
    if (argc < 3) {
        fprintf(stderr, "Usage: %s <input> <output>\n", argv[0]);
        return 1;
    }

    AVFormatContext *ifmt_ctx = NULL;
    AVFormatContext *ofmt_ctx = NULL;
    StreamContext sc = {0};
    AVPacket *pkt = NULL;
    AVFrame *frame = NULL;
    int ret;

    // Open input
    ret = open_input(argv[1], &ifmt_ctx, &sc);
    if (ret < 0) {
        fprintf(stderr, "Failed to open input\n");
        goto cleanup;
    }

    // Open output
    ret = open_output(argv[2], ifmt_ctx, &ofmt_ctx, &sc);
    if (ret < 0) {
        fprintf(stderr, "Failed to open output\n");
        goto cleanup;
    }

    pkt = av_packet_alloc();
    frame = av_frame_alloc();
    if (!pkt || !frame) {
        ret = AVERROR(ENOMEM);
        goto cleanup;
    }

    // Main decoding/encoding loop
    while (av_read_frame(ifmt_ctx, pkt) >= 0) {
        if (pkt->stream_index != sc.stream_index) {
            av_packet_unref(pkt);
            continue;
        }

        ret = avcodec_send_packet(sc.dec_ctx, pkt);
        av_packet_unref(pkt);
        if (ret < 0) break;

        while (ret >= 0) {
            ret = avcodec_receive_frame(sc.dec_ctx, frame);
            if (ret == AVERROR(EAGAIN) || ret == AVERROR_EOF) break;
            if (ret < 0) goto cleanup;

            frame->pict_type = AV_PICTURE_TYPE_NONE;

            ret = encode_write_frame(frame, ofmt_ctx, &sc);
            av_frame_unref(frame);
            if (ret < 0) goto cleanup;
        }
    }

    // Flush encoder
    encode_write_frame(NULL, ofmt_ctx, &sc);

    // Write trailer
    av_write_trailer(ofmt_ctx);
    printf("Transcoding complete.\n");

cleanup:
    av_packet_free(&pkt);
    av_frame_free(&frame);
    avcodec_free_context(&sc.dec_ctx);
    avcodec_free_context(&sc.enc_ctx);
    if (ifmt_ctx) avformat_close_input(&ifmt_ctx);
    if (ofmt_ctx) {
        if (!(ofmt_ctx->oformat->flags & AVFMT_NOFILE))
            avio_closep(&ofmt_ctx->pb);
        avformat_free_context(ofmt_ctx);
    }
    return ret < 0 ? 1 : 0;
}
```

### Key API Patterns

```
Demuxing:
  avformat_open_input()        Open file
  avformat_find_stream_info()  Probe streams
  av_read_frame()              Read next packet
  avformat_close_input()       Close file

Decoding:
  avcodec_alloc_context3()     Create decoder context
  avcodec_parameters_to_context()  Copy params from stream
  avcodec_open2()              Open decoder
  avcodec_send_packet()        Send compressed packet
  avcodec_receive_frame()      Get decoded frame
  avcodec_free_context()       Free decoder

Encoding:
  avcodec_find_encoder()       Find encoder by ID
  avcodec_alloc_context3()     Create encoder context
  avcodec_open2()              Open encoder
  avcodec_send_frame()         Send raw frame
  avcodec_receive_packet()     Get encoded packet
  avcodec_free_context()       Free encoder

Muxing:
  avformat_alloc_output_context2()  Create output context
  avformat_new_stream()        Add output stream
  avformat_write_header()      Write container header
  av_interleaved_write_frame() Write packet
  av_write_trailer()           Write container trailer
  avio_closep()                Close output file
```

---

## FFmpeg in Other Languages

### Python: ffmpeg-python

ffmpeg-python provides a Pythonic builder pattern for constructing FFmpeg commands.

```python
import ffmpeg

# Simple transcoding
(
    ffmpeg
    .input('input.mp4')
    .output('output.mp4', vcodec='libx264', crf=23, acodec='aac')
    .overwrite_output()
    .run()
)

# Scale and apply filter
(
    ffmpeg
    .input('input.mp4')
    .filter('scale', 1280, 720)
    .filter('fps', fps=30)
    .output('output.mp4', vcodec='libx264', crf=23)
    .run()
)

# Complex filter graph
main = ffmpeg.input('main.mp4')
overlay_file = ffmpeg.input('overlay.png')
(
    ffmpeg
    .overlay(main, overlay_file, x=10, y=10)
    .output('output.mp4', vcodec='libx264')
    .run()
)

# Get video info using ffprobe
probe = ffmpeg.probe('input.mp4')
video_info = next(
    s for s in probe['streams']
    if s['codec_type'] == 'video'
)
width = int(video_info['width'])
height = int(video_info['height'])

# Generate thumbnail
(
    ffmpeg
    .input('input.mp4', ss='00:01:00')
    .output('thumb.jpg', vframes=1)
    .run()
)

# HLS output
(
    ffmpeg
    .input('input.mp4')
    .output(
        'playlist.m3u8',
        vcodec='libx264',
        acodec='aac',
        format='hls',
        hls_time=6,
        hls_list_size=0
    )
    .run()
)
```

### Python: PyAV

PyAV provides direct Python bindings to the libav libraries, giving frame-level
access without subprocess overhead.

```python
import av

# Read and process frames
container = av.open('input.mp4')

for frame in container.decode(video=0):
    # frame is an av.VideoFrame
    # Convert to numpy array (requires Pillow or numpy)
    img = frame.to_ndarray(format='rgb24')

    # Process the image (e.g., with OpenCV or numpy)
    # ...

    print(f"Frame {frame.pts}: {frame.width}x{frame.height}")

container.close()

# Transcoding with PyAV
input_container = av.open('input.mp4')
output_container = av.open('output.mp4', mode='w')

# Add output stream
input_stream = input_container.streams.video[0]
output_stream = output_container.add_stream('libx264', rate=input_stream.average_rate)
output_stream.width = input_stream.codec_context.width
output_stream.height = input_stream.codec_context.height
output_stream.pix_fmt = 'yuv420p'

for packet in input_container.demux(input_stream):
    for frame in packet.decode():
        for out_packet in output_stream.encode(frame):
            output_container.mux(out_packet)

# Flush
for out_packet in output_stream.encode():
    output_container.mux(out_packet)

output_container.close()
input_container.close()
```

### Go: goav / ffmpeg-go

```go
package main

import (
    "log"
    "os/exec"
)

// Using os/exec with ffmpeg CLI (most common approach in Go)
func transcodeWithCLI(input, output string) error {
    cmd := exec.Command("ffmpeg",
        "-i", input,
        "-c:v", "libx264",
        "-crf", "23",
        "-c:a", "aac",
        "-b:a", "128k",
        "-y",
        output,
    )
    cmd.Stderr = log.Writer()
    return cmd.Run()
}

// Using ffmpeg-go package (builder pattern like ffmpeg-python)
// import ffmpeg "github.com/u2takey/ffmpeg-go"

func transcodeWithFFmpegGo(input, output string) error {
    return ffmpeg.Input(input).
        Output(output, ffmpeg.KwArgs{
            "c:v": "libx264",
            "crf": "23",
            "c:a": "aac",
        }).
        OverWriteOutput().
        Run()
}
```

### Node.js: fluent-ffmpeg

```javascript
const ffmpeg = require('fluent-ffmpeg');

// Basic transcoding
ffmpeg('input.mp4')
  .videoCodec('libx264')
  .audioCodec('aac')
  .outputOptions(['-crf 23', '-preset medium'])
  .on('progress', (progress) => {
    console.log(`Processing: ${progress.percent}% done`);
  })
  .on('end', () => {
    console.log('Transcoding finished');
  })
  .on('error', (err) => {
    console.error('Error:', err.message);
  })
  .save('output.mp4');

// Get file metadata
ffmpeg.ffprobe('input.mp4', (err, metadata) => {
  if (err) {
    console.error('Probe error:', err);
    return;
  }
  const videoStream = metadata.streams.find((s) => s.codec_type === 'video');
  console.log(`Resolution: ${videoStream.width}x${videoStream.height}`);
  console.log(`Duration: ${metadata.format.duration}s`);
});

// Generate thumbnails
ffmpeg('input.mp4').screenshots({
  timestamps: ['10%', '50%', '90%'],
  filename: 'thumb-%i.png',
  folder: './thumbnails',
  size: '320x240',
});

// HLS output
ffmpeg('input.mp4')
  .videoCodec('libx264')
  .audioCodec('aac')
  .outputOptions([
    '-f hls',
    '-hls_time 6',
    '-hls_list_size 0',
    '-hls_segment_filename segment_%03d.ts',
  ])
  .output('playlist.m3u8')
  .run();
```

### Rust: ffmpeg-next

```rust
// Cargo.toml: ffmpeg-next = "7"

use ffmpeg_next as ffmpeg;
use ffmpeg::format::{input, output};
use ffmpeg::media::Type;

fn main() -> Result<(), ffmpeg::Error> {
    ffmpeg::init()?;

    // Open input file
    let ictx = input(&"input.mp4")?;

    // Print format info
    println!("Format: {}", ictx.format().name());
    println!("Duration: {} us", ictx.duration());

    // Iterate streams
    for stream in ictx.streams() {
        let codec = ffmpeg::codec::context::Context::from_parameters(
            stream.parameters()
        )?;

        match stream.parameters().medium() {
            Type::Video => {
                let decoder = codec.decoder().video()?;
                println!(
                    "Video: {}x{}, codec: {:?}",
                    decoder.width(),
                    decoder.height(),
                    stream.parameters().id()
                );
            }
            Type::Audio => {
                let decoder = codec.decoder().audio()?;
                println!(
                    "Audio: {} Hz, {} channels, codec: {:?}",
                    decoder.rate(),
                    decoder.channels(),
                    stream.parameters().id()
                );
            }
            _ => {}
        }
    }

    Ok(())
}
```

---

## Performance Optimization

### Thread Count

```bash
# Set encoding thread count
ffmpeg -i input.mp4 -c:v libx264 -threads 8 output.mp4

# Auto-detect (default)
ffmpeg -i input.mp4 -c:v libx264 -threads 0 output.mp4

# x264 specific threading
ffmpeg -i input.mp4 -c:v libx264 -x264-params "threads=8" output.mp4

# Slice-based threading (lower latency, slightly worse compression)
ffmpeg -i input.mp4 -c:v libx264 -x264-params "sliced-threads=1" output.mp4
```

### B-frames and Reference Frames

B-frames improve compression by referencing both past and future frames. More
reference frames improve quality but increase memory usage and encoding time.

```bash
# Set B-frames (default: 3 for x264)
ffmpeg -i input.mp4 -c:v libx264 -bf 3 output.mp4

# Disable B-frames (lower latency, less compression)
ffmpeg -i input.mp4 -c:v libx264 -bf 0 output.mp4

# Set reference frames (default: 3, max: 16)
ffmpeg -i input.mp4 -c:v libx264 -refs 5 output.mp4

# More refs = better quality, but diminishing returns past 5-6
```

### Lookahead

Lookahead allows the encoder to make better rate control decisions by analyzing
future frames.

```bash
# x264 RC lookahead (default: 40)
ffmpeg -i input.mp4 -c:v libx264 -rc-lookahead 60 output.mp4

# MB-tree (macroblock tree rate control, enabled by default)
# Uses lookahead for better spatial quality allocation
ffmpeg -i input.mp4 -c:v libx264 -x264-params "mbtree=1:rc-lookahead=60" output.mp4

# NVENC lookahead
ffmpeg -i input.mp4 -c:v h264_nvenc -rc-lookahead 32 output.mp4
```

### Rate Control: Two-Pass vs CRF

```
+------------------+-------------------+-------------------+
| Property         | CRF               | Two-Pass          |
+------------------+-------------------+-------------------+
| Target           | Constant quality  | Target bitrate    |
| File size        | Variable          | Predictable       |
| Passes           | Single pass       | Two passes        |
| Speed            | Faster            | 2x slower         |
| Best for         | Local files       | Streaming/storage |
| Quality          | Consistent        | Variable          |
+------------------+-------------------+-------------------+
```

```bash
# CRF (single pass, recommended for quality-first)
ffmpeg -i input.mp4 -c:v libx264 -crf 23 -preset slow output.mp4

# Two-pass (recommended for bitrate-constrained delivery)
ffmpeg -i input.mp4 -c:v libx264 -b:v 5M -pass 1 -f null /dev/null
ffmpeg -i input.mp4 -c:v libx264 -b:v 5M -pass 2 output.mp4

# Constrained CRF (quality target with bitrate ceiling)
ffmpeg -i input.mp4 -c:v libx264 -crf 23 -maxrate 5M -bufsize 10M output.mp4
```

### Encoding Speed vs Quality

```
+--------------------------------------------------------------------+
|                   Encoding Speed vs Quality                        |
+--------------------------------------------------------------------+
|                                                                    |
|  Quality                                                           |
|    ^                                                               |
|    |        veryslow                                               |
|    |       slower                                                  |
|    |      slow                                                     |
|    |     medium   <-- default, good balance                        |
|    |    fast                                                       |
|    |   faster                                                      |
|    |  veryfast                                                     |
|    | superfast                                                     |
|    | ultrafast                                                     |
|    +------------------------------------------------> Speed        |
|                                                                    |
|  The quality difference between presets is roughly constant        |
|  per CRF value, but the time difference is exponential.            |
|  "slow" is often the best balance for offline encoding.            |
|  "veryfast" or "ultrafast" for live streaming.                     |
+--------------------------------------------------------------------+
```

### Additional Performance Tips

```bash
# Avoid unnecessary pixel format conversions
ffmpeg -i input.mp4 -c:v libx264 -pix_fmt yuv420p output.mp4

# Use stream copy when possible
ffmpeg -i input.mp4 -c copy -movflags +faststart output.mp4

# Enable fast start for web playback (moves moov atom to front)
ffmpeg -i input.mp4 -c:v libx264 -movflags +faststart output.mp4

# Limit output buffer for streaming
ffmpeg -i input.mp4 -c:v libx264 -bufsize 2M -maxrate 5M output.mp4

# Use pipe for multi-stage processing
ffmpeg -i input.mp4 -f rawvideo -pix_fmt yuv420p pipe:1 | \
  ffmpeg -f rawvideo -pix_fmt yuv420p -s 1920x1080 -i pipe:0 \
  -c:v libx264 output.mp4

# Segment-based parallel encoding (for offline batch processing)
# Split -> Encode in parallel -> Concatenate
ffmpeg -i input.mp4 -c copy -f segment -segment_time 60 segment_%03d.mp4
# Encode each segment in parallel, then concatenate
```

---

## Common Recipes

### 1. Extract Audio from Video

```bash
ffmpeg -i input.mp4 -vn -c:a copy audio.aac
ffmpeg -i input.mp4 -vn -c:a libmp3lame -b:a 320k audio.mp3
ffmpeg -i input.mp4 -vn -c:a libopus -b:a 128k audio.ogg
```

### 2. Extract Video (Remove Audio)

```bash
ffmpeg -i input.mp4 -an -c:v copy video_only.mp4
```

### 3. Create Thumbnails

```bash
# Single thumbnail at 10 seconds
ffmpeg -i input.mp4 -ss 00:00:10 -vframes 1 thumb.jpg

# Thumbnail every N seconds
ffmpeg -i input.mp4 -vf "fps=1/10" thumb_%04d.jpg

# Thumbnail grid (contact sheet)
ffmpeg -i input.mp4 -vf "fps=1/30,scale=320:180,tile=5x4" contact_sheet.jpg
```

### 4. Concatenate Videos

```bash
# Using concat demuxer (same codecs, recommended)
# Create filelist.txt:
#   file 'part1.mp4'
#   file 'part2.mp4'
#   file 'part3.mp4'
ffmpeg -f concat -safe 0 -i filelist.txt -c copy output.mp4

# Using concat filter (different codecs/resolutions)
ffmpeg -i part1.mp4 -i part2.mp4 -filter_complex \
  "[0:v:0][0:a:0][1:v:0][1:a:0]concat=n=2:v=1:a=1[outv][outa]" \
  -map "[outv]" -map "[outa]" output.mp4
```

### 5. Create GIF

```bash
# Simple GIF
ffmpeg -i input.mp4 -vf "fps=10,scale=480:-1" output.gif

# High-quality GIF with palette
ffmpeg -i input.mp4 -vf "fps=10,scale=480:-1:flags=lanczos,palettegen" palette.png
ffmpeg -i input.mp4 -i palette.png -filter_complex \
  "[0:v]fps=10,scale=480:-1:flags=lanczos[v];[v][1:v]paletteuse" output.gif
```

### 6. Add Subtitles

```bash
# Burn subtitles into video (hardcode)
ffmpeg -i input.mp4 -vf "subtitles=subs.srt" output.mp4

# Embed subtitles as a stream (softcode)
ffmpeg -i input.mp4 -i subs.srt -c copy -c:s mov_text output.mp4

# With ASS/SSA styling
ffmpeg -i input.mp4 -vf "ass=styled_subs.ass" output.mp4
```

### 7. Normalize Audio (EBU R128)

```bash
ffmpeg -i input.mp4 -af "loudnorm=I=-16:TP=-1.5:LRA=11" output.mp4
```

### 8. Screen Recording

```bash
# macOS screen recording
ffmpeg -f avfoundation -capture_cursor 1 -i "1:0" -c:v libx264 \
  -preset ultrafast -crf 18 screen.mp4

# Linux screen recording (X11)
ffmpeg -f x11grab -s 1920x1080 -i :0.0 -c:v libx264 \
  -preset ultrafast screen.mp4

# Windows screen recording
ffmpeg -f gdigrab -i desktop -c:v libx264 -preset ultrafast screen.mp4
```

### 9. Add Audio to Video

```bash
ffmpeg -i video.mp4 -i audio.mp3 -c:v copy -c:a aac -shortest output.mp4
```

### 10. Replace Audio Track

```bash
ffmpeg -i video.mp4 -i new_audio.mp3 -map 0:v -map 1:a \
  -c:v copy -c:a aac -shortest output.mp4
```

### 11. Convert Image Sequence to Video

```bash
ffmpeg -framerate 24 -i frame_%04d.png -c:v libx264 -pix_fmt yuv420p output.mp4

# With a specific start number
ffmpeg -framerate 30 -start_number 100 -i frame_%04d.png \
  -c:v libx264 -pix_fmt yuv420p output.mp4
```

### 12. Convert Video to Image Sequence

```bash
ffmpeg -i input.mp4 -q:v 2 frames/frame_%04d.jpg
```

### 13. Rotate Video

```bash
# 90 degrees clockwise
ffmpeg -i input.mp4 -vf "transpose=1" output.mp4

# 90 degrees counter-clockwise
ffmpeg -i input.mp4 -vf "transpose=2" output.mp4

# 180 degrees
ffmpeg -i input.mp4 -vf "transpose=1,transpose=1" output.mp4

# Fix rotation metadata without re-encoding
ffmpeg -i input.mp4 -c copy -metadata:s:v:0 rotate=0 output.mp4
```

### 14. Resize/Scale Video

```bash
# Scale to 720p
ffmpeg -i input.mp4 -vf "scale=1280:720" -c:v libx264 output.mp4

# Scale to fit within bounds (preserving aspect ratio)
ffmpeg -i input.mp4 -vf "scale=1280:720:force_original_aspect_ratio=decrease" output.mp4

# Scale and pad to exact size
ffmpeg -i input.mp4 -vf \
  "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2" \
  output.mp4
```

### 15. Change Container (Remux)

```bash
ffmpeg -i input.mkv -c copy output.mp4
ffmpeg -i input.avi -c copy output.mkv
ffmpeg -i input.mp4 -c copy output.ts
```

### 16. Extract Specific Time Range

```bash
ffmpeg -ss 00:05:00 -to 00:10:00 -i input.mp4 -c copy clip.mp4
```

### 17. Create Video from Single Image

```bash
ffmpeg -loop 1 -i image.jpg -c:v libx264 -t 10 -pix_fmt yuv420p output.mp4

# With audio
ffmpeg -loop 1 -i image.jpg -i audio.mp3 -c:v libx264 \
  -tune stillimage -c:a aac -shortest output.mp4
```

### 18. Cross-fade Between Videos

```bash
ffmpeg -i first.mp4 -i second.mp4 -filter_complex \
  "[0:v]trim=0:8,setpts=PTS-STARTPTS[v0]; \
   [1:v]trim=0:8,setpts=PTS-STARTPTS[v1]; \
   [v0][v1]xfade=transition=fade:duration=2:offset=6[vout]; \
   [0:a]atrim=0:8,asetpts=PTS-STARTPTS[a0]; \
   [1:a]atrim=0:8,asetpts=PTS-STARTPTS[a1]; \
   [a0][a1]acrossfade=d=2[aout]" \
  -map "[vout]" -map "[aout]" output.mp4
```

### 19. Picture-in-Picture

```bash
ffmpeg -i main.mp4 -i pip.mp4 -filter_complex \
  "[1:v]scale=320:180[pip];[0:v][pip]overlay=W-w-10:10" \
  -c:v libx264 output.mp4
```

### 20. Add Fade In/Out

```bash
# Video fade (first 2 seconds in, last 2 seconds out)
ffmpeg -i input.mp4 -vf "fade=t=in:st=0:d=2,fade=t=out:st=58:d=2" \
  -c:v libx264 output.mp4

# Audio fade
ffmpeg -i input.mp4 -af "afade=t=in:st=0:d=2,afade=t=out:st=58:d=2" output.mp4
```

### 21. Stabilize Video

```bash
# Two-pass stabilization
# Pass 1: Analyze
ffmpeg -i shaky.mp4 -vf "vidstabdetect=shakiness=5:accuracy=15" -f null /dev/null

# Pass 2: Apply
ffmpeg -i shaky.mp4 -vf "vidstabtransform=smoothing=30:zoom=-5" output.mp4
```

### 22. Create Test Patterns

```bash
# Color bars
ffmpeg -f lavfi -i "smptebars=duration=10:size=1920x1080:rate=30" test.mp4

# Sine wave audio
ffmpeg -f lavfi -i "sine=frequency=440:duration=5" sine.wav

# Test video with counter
ffmpeg -f lavfi -i "testsrc2=duration=10:size=1920x1080:rate=30" test.mp4
```

### 23. Reduce File Size

```bash
# Re-encode with higher CRF
ffmpeg -i input.mp4 -c:v libx264 -crf 28 -preset slow -c:a aac -b:a 96k output.mp4

# Scale down
ffmpeg -i input.mp4 -vf "scale=1280:720" -c:v libx264 -crf 23 output.mp4
```

### 24. Convert to WebM

```bash
ffmpeg -i input.mp4 -c:v libvpx-vp9 -crf 30 -b:v 0 -c:a libopus -b:a 128k output.webm
```

### 25. Detect Scene Changes

```bash
ffmpeg -i input.mp4 -filter_complex "select='gt(scene,0.4)',showinfo" -f null /dev/null
```

### 26. Loop a Video

```bash
# Loop 3 times
ffmpeg -stream_loop 3 -i input.mp4 -c copy output.mp4
```

### 27. Adjust Playback Speed

```bash
# 2x speed
ffmpeg -i input.mp4 -vf "setpts=0.5*PTS" -af "atempo=2.0" output.mp4

# 0.5x speed
ffmpeg -i input.mp4 -vf "setpts=2*PTS" -af "atempo=0.5" output.mp4
```

### 28. Mux Multiple Audio Tracks

```bash
ffmpeg -i video.mp4 -i english.aac -i spanish.aac \
  -map 0:v -map 1:a -map 2:a \
  -c copy \
  -metadata:s:a:0 language=eng -metadata:s:a:1 language=spa \
  output.mp4
```

### 29. Create Animated WebP

```bash
ffmpeg -i input.mp4 -vf "fps=15,scale=480:-1" -loop 0 output.webp
```

### 30. De-noise and Sharpen for Archiving

```bash
ffmpeg -i input.mp4 -vf "hqdn3d=4:3:6:4,unsharp=3:3:0.5" \
  -c:v libx264 -crf 18 -preset slow output.mp4
```

### 31. Add Chapter Metadata

```bash
# Create metadata file (chapters.txt):
# ;FFMETADATA1
# [CHAPTER]
# TIMEBASE=1/1000
# START=0
# END=60000
# title=Introduction
# [CHAPTER]
# TIMEBASE=1/1000
# START=60000
# END=180000
# title=Main Content

ffmpeg -i input.mp4 -i chapters.txt -map_metadata 1 -c copy output.mp4
```

### 32. Batch Convert with Shell Loop

```bash
for f in *.avi; do
  ffmpeg -i "$f" -c:v libx264 -crf 23 -c:a aac "${f%.avi}.mp4"
done
```

---

## Common Interview Questions

### Q1: What is the difference between a codec and a container?

A **codec** (coder-decoder) compresses and decompresses media data. Examples: H.264,
H.265, VP9, AAC, Opus. It defines how raw frames are transformed into a compressed
bitstream and back.

A **container** (format) wraps one or more codec streams together with metadata,
timestamps, and synchronization information. Examples: MP4 (.mp4), Matroska (.mkv),
WebM (.webm), MPEG-TS (.ts), FLV (.flv).

The relationship is many-to-many. H.264 video can be in MP4, MKV, or TS containers.
An MP4 container can hold H.264, H.265, or AV1 video with AAC or Opus audio.

### Q2: Explain the difference between CRF and two-pass encoding.

**CRF (Constant Rate Factor)** targets a constant visual quality level. The encoder
allocates more bits to complex scenes and fewer to simple ones. The resulting file
size is unpredictable. CRF is single-pass and faster. Use CRF when quality is the
priority and you do not need to hit an exact file size or bitrate.

**Two-pass encoding** targets a specific average bitrate. In pass 1, the encoder
analyzes the entire video and creates a log of scene complexity. In pass 2, it uses
this log to distribute bits optimally across the video. Two-pass is slower (2x) but
produces predictable file sizes. Use two-pass when you must hit a specific bitrate
target, such as for streaming or storage-constrained delivery.

### Q3: What are I-frames, P-frames, and B-frames?

**I-frames (Intra-coded)** are fully self-contained frames. They can be decoded
without reference to any other frame. They are the largest frame type and serve as
random access points (keyframes).

**P-frames (Predicted)** reference one or more previous frames. They store only the
differences from the referenced frames. Smaller than I-frames.

**B-frames (Bi-directional predicted)** reference both previous and future frames.
They achieve the best compression but add latency because future frames must be
decoded first. Smallest frame type.

A typical GOP (Group of Pictures) structure: I B B P B B P B B P B B I

### Q4: What is the purpose of the -map option in FFmpeg?

The `-map` option gives explicit control over which streams from which inputs are
included in the output. Without `-map`, FFmpeg uses automatic stream selection
(one stream per type based on heuristics). With `-map`, you can:

- Select specific streams by index (`-map 0:v:0`)
- Combine streams from different inputs (`-map 0:v -map 1:a`)
- Exclude streams (`-map 0 -map -0:s` to exclude subtitles)
- Include multiple streams of the same type (`-map 0:a:0 -map 0:a:1`)

### Q5: How does hardware-accelerated encoding differ from software encoding?

**Software encoding** (e.g., libx264) runs on the CPU. It offers the best compression
quality, the most tuning options, and consistent behavior across platforms. It is
slower and consumes significant CPU resources.

**Hardware encoding** (e.g., NVENC, QSV, VideoToolbox) runs on dedicated ASIC hardware
on the GPU or chipset. It is 5-20x faster and uses minimal CPU. However, it produces
slightly lower quality at the same bitrate compared to software encoding. It has
fewer tuning options and behavior varies by hardware generation.

Use hardware encoding for real-time applications (live streaming, video conferencing,
screen recording) where speed matters more than maximum compression. Use software
encoding for offline transcoding where quality per bit is paramount.

### Q6: What is adaptive bitrate streaming and how do you create it with FFmpeg?

Adaptive Bitrate (ABR) streaming encodes the same content at multiple quality levels
(renditions). The client player dynamically switches between renditions based on
network conditions. This provides smooth playback across varying bandwidth.

The two main ABR protocols are HLS (Apple) and DASH (MPEG). Both work by segmenting
the video into small chunks (typically 2-6 seconds) and providing a manifest file
that lists all available renditions and their segments.

With FFmpeg, you create ABR content by encoding multiple renditions in a single
command using filter graph splitting, then outputting to HLS or DASH with the
appropriate muxer options. Each rendition gets its own playlist, and a master playlist
references all of them.

### Q7: Explain the difference between simple and complex filter graphs.

A **simple filter graph** has exactly one input and one output. It is specified with
`-vf` (video) or `-af` (audio). Filters are chained with commas. Example:
`-vf "scale=1280:720,fps=30,format=yuv420p"`

A **complex filter graph** has multiple inputs and/or multiple outputs. It is specified
with `-filter_complex`. Named pads in square brackets connect filter inputs and
outputs. Filter chains are separated by semicolons. Example:
`-filter_complex "[0:v][1:v]overlay=10:10[out]" -map "[out]"`

Use complex filter graphs when you need to combine multiple inputs (overlay, concat),
split a stream into multiple outputs, or create any non-linear processing topology.

### Q8: What is the movflags +faststart option and why is it important?

MP4 files store metadata in a structure called the "moov atom." By default, FFmpeg
writes the moov atom at the end of the file. This means a player must download the
entire file before it can start playing (or issue a range request for the end).

`-movflags +faststart` moves the moov atom to the beginning of the file during a
post-processing pass. This allows progressive download playback -- the browser or
player can start playing immediately after receiving the initial metadata, which is
critical for web delivery.

### Q9: How would you create a transcoding pipeline for a video platform?

A production transcoding pipeline typically involves:

1. **Upload**: Receive the original file, store in object storage (S3)
2. **Analysis**: Use ffprobe to extract metadata (resolution, codec, duration, etc.)
3. **Encoding plan**: Based on the source, determine which renditions to create
   (e.g., 1080p, 720p, 480p, 360p)
4. **Parallel encoding**: Encode each rendition independently (can split into
   segments for parallel chunk encoding)
5. **ABR packaging**: Generate HLS/DASH manifests and segments
6. **Quality verification**: Validate output files, check VMAF/SSIM scores
7. **CDN distribution**: Upload packaged assets to CDN origin

Key considerations: queue-based processing (SQS/RabbitMQ), auto-scaling workers,
handling failures with retry logic, webhook notifications, VMAF-based quality ladders,
per-title encoding (optimal bitrate ladder per content type).

### Q10: What is the difference between muxing and encoding?

**Encoding** compresses raw audio/video data using a codec algorithm. It transforms
uncompressed data (e.g., raw PCM audio or YUV video frames) into a compressed
bitstream (e.g., H.264 NALUs or AAC frames). This is computationally expensive.

**Muxing** (multiplexing) takes one or more compressed streams and packages them
into a container format. It handles interleaving packets, writing timestamps, adding
metadata, and creating index structures. This is computationally cheap.

In FFmpeg, `-c copy` performs muxing only (stream copy), bypassing encoding and
decoding entirely. This is orders of magnitude faster than transcoding.

### Q11: What is CRF 0 and when would you use it?

CRF 0 in x264/x265 produces mathematically lossless output. Every pixel is preserved
exactly. The resulting files are very large (often larger than the original if the
original was lossy).

Use lossless encoding as an intermediate format in multi-stage processing pipelines
where you need to apply filters across multiple FFmpeg passes without accumulating
generational quality loss. For archival purposes, consider near-lossless CRF values
(e.g., CRF 10-14) instead, as true lossless files are impractically large.

### Q12: How do you handle audio/video sync issues?

Common approaches:

- **-itsoffset**: Shift input timestamps to fix constant offset
- **-async**: Resample audio to match video timestamps (legacy, use aresample)
- **aresample=async=1**: Modern approach to fix audio drift
- **setpts/asetpts**: Manually adjust presentation timestamps
- **-map**: Ensure correct stream mapping when combining sources
- **-shortest**: End output when the shortest stream ends

For diagnosing sync issues, use ffprobe to compare audio and video PTS values, or
ffplay to visually verify synchronization.

### Q13: What are the tradeoffs between H.264, H.265, VP9, and AV1?

| Factor          | H.264     | H.265          | VP9             | AV1                    |
| --------------- | --------- | -------------- | --------------- | ---------------------- |
| Compression     | Baseline  | ~40-50% better | ~40-50% better  | ~30% better than H.265 |
| Encode speed    | Fast      | 3-5x slower    | 5-10x slower    | 10-100x slower         |
| Decode support  | Universal | Wide           | Wide (browsers) | Growing                |
| Royalties       | Licensed  | Licensed       | Free            | Free                   |
| Hardware decode | Universal | Very wide      | Wide            | Growing                |
| Hardware encode | Universal | Wide           | Rare            | Growing                |

For maximum compatibility, use H.264. For modern streaming where bandwidth savings
matter, use H.265 (if licensing allows) or AV1 (if encode time is acceptable). VP9
is a good middle ground for web delivery (strong browser support, royalty-free).

### Q14: How does FFmpeg handle pixel formats and color spaces?

FFmpeg tracks pixel format (`pix_fmt`) and color metadata (primaries, transfer
characteristics, matrix coefficients) for every video stream. Common pixel formats:

- **yuv420p**: 4:2:0 chroma subsampling, 8-bit. Most common for delivery.
- **yuv422p**: 4:2:2, used in professional/broadcast.
- **yuv444p**: No chroma subsampling, best quality.
- **yuv420p10le**: 10-bit 4:2:0. Used for HDR and high-quality encoding.
- **rgb24**: 8-bit RGB. Common for image processing.
- **nv12**: GPU-native YUV format (CUDA, VA-API).

libswscale handles all format conversions. When transcoding, always specify the
output pixel format explicitly to avoid unexpected conversions:
`-pix_fmt yuv420p`

### Q15: Describe a scenario where you would use FFmpeg's filter graph to solve a real problem.

**Scenario**: A live streaming platform needs to create a composite view showing four
camera angles simultaneously with a broadcaster name overlay and normalized audio.

**Solution**:

```bash
ffmpeg -i cam1.mp4 -i cam2.mp4 -i cam3.mp4 -i cam4.mp4 -filter_complex \
  "[0:v]scale=640:360[a];[1:v]scale=640:360[b]; \
   [2:v]scale=640:360[c];[3:v]scale=640:360[d]; \
   [a][b]hstack[top];[c][d]hstack[bottom]; \
   [top][bottom]vstack, \
   drawtext=text='LIVE - Studio A':fontsize=36:fontcolor=white: \
   box=1:boxcolor=black@0.5:boxborderw=5:x=10:y=10[vout]; \
   [0:a][1:a][2:a][3:a]amix=inputs=4:duration=longest, \
   loudnorm=I=-16:TP=-1.5:LRA=11[aout]" \
  -map "[vout]" -map "[aout]" -c:v libx264 -preset veryfast \
  -tune zerolatency -c:a aac -b:a 128k \
  -f flv rtmp://streaming-server/live/composite
```

This uses complex filter graphs to: scale all four inputs to the same size, stack them
into a 2x2 grid, add a text overlay, mix the four audio streams, normalize loudness,
and output to RTMP for live streaming.

---

## Summary: Quick Reference Card

```
COMMON CODEC MAPPINGS:
  Video: -c:v libx264 / libx265 / libvpx-vp9 / libsvtav1
  Audio: -c:a aac / libopus / libmp3lame / libfdk_aac
  Copy:  -c copy (no re-encode)

QUALITY CONTROL:
  CRF:     -crf 23 (x264) / -crf 28 (x265) / -crf 30 (VP9/AV1)
  Bitrate: -b:v 5M -maxrate 5.5M -bufsize 10M
  Preset:  -preset slow (offline) / -preset veryfast (live)

ESSENTIAL OPTIONS:
  -ss 00:01:00        Seek to position
  -t 30               Duration limit
  -map 0:v:0          Stream selection
  -vf "scale=1280:720" Video filter
  -af "loudnorm"      Audio filter
  -movflags +faststart Web-optimized MP4
  -f hls              HLS output

HARDWARE ACCEL:
  NVIDIA:  -c:v h264_nvenc / hevc_nvenc
  Intel:   -c:v h264_qsv / hevc_qsv
  macOS:   -c:v h264_videotoolbox / hevc_videotoolbox
  Linux:   -c:v h264_vaapi / hevc_vaapi

ANALYSIS:
  ffprobe -v quiet -print_format json -show_format -show_streams input.mp4
  ffmpeg -v error -i input.mp4 -f null /dev/null  (validate file)
```
