# Container Formats and Muxing/Demuxing

## Table of Contents

1. [What Are Container Formats](#1-what-are-container-formats)
2. [MP4 (MPEG-4 Part 14 / ISO BMFF)](#2-mp4-mpeg-4-part-14--iso-bmff)
3. [MKV (Matroska)](#3-mkv-matroska)
4. [WebM](#4-webm)
5. [FLV (Flash Video)](#5-flv-flash-video)
6. [MPEG-TS (Transport Stream)](#6-mpeg-ts-transport-stream)
7. [Ogg](#7-ogg)
8. [Muxing and Demuxing](#8-muxing-and-demuxing)
9. [Metadata](#9-metadata)
10. [Subtitles](#10-subtitles)
11. [Practical Examples](#11-practical-examples)
12. [Container Format Comparison Table](#12-container-format-comparison-table)
13. [Common Interview Questions](#13-common-interview-questions)

---

## 1. What Are Container Formats

### Codec vs. Container

One of the most fundamental distinctions in media engineering is the difference between a **codec** and a **container**. These terms are frequently confused, but they serve entirely different purposes.

A **codec** (coder-decoder) is an algorithm that compresses and decompresses audio or video data. Examples include H.264, H.265/HEVC, VP9, AV1 (video) and AAC, Opus, MP3, Vorbis (audio). The codec defines *how* the raw media samples are encoded into a compressed bitstream.

A **container** (also called a wrapper or file format) is a file structure that packages one or more compressed bitstreams together along with metadata. The container defines *how the streams are organized, synchronized, and stored on disk or transmitted over a network*. Examples include MP4, MKV, WebM, FLV, MPEG-TS, and Ogg.

```
Think of it this way:

  Codec  = the language a letter is written in (English, Mandarin, etc.)
  Container = the envelope that holds the letter(s) plus addresses, stamps, etc.

  You can put the same letter (H.264 video) into different envelopes (MP4, MKV, TS).
  You can put letters in different languages (H.264 + AAC) into one envelope (MP4).
```

### Why Containers Exist

Raw compressed bitstreams are not self-describing. A naked H.264 bitstream (an Annex B bytestream) contains NAL units but no timing information, no audio, and no way to seek efficiently. Containers solve several critical problems:

1. **Synchronization** - Interleaving audio and video so a player knows which audio sample corresponds to which video frame. Without this, A/V sync would be impossible.

2. **Seeking** - Providing an index or table of contents so a player can jump to any point in the file without reading everything from the start.

3. **Multiple Streams** - Holding multiple audio tracks (different languages), multiple subtitle tracks, multiple video angles, or even embedded images (album art, thumbnails).

4. **Metadata** - Storing title, artist, album, creation date, encoding parameters, copyright information, and other descriptive data.

5. **Chapters** - Defining named time ranges (e.g., chapters in a movie or sections in a podcast).

6. **Error Resilience** - Some containers (like MPEG-TS) are designed for environments where data loss is expected (broadcast), with built-in mechanisms for resynchronization.

7. **Streaming** - Some containers are designed for progressive download or adaptive bitrate streaming, where the entire file is not available at once.

### Anatomy of a Container

At a high level, every container format stores:

```
+--------------------------------------------------+
|                  CONTAINER FILE                   |
|                                                   |
|  +--------------------------------------------+  |
|  |  HEADER / FILE METADATA                    |  |
|  |  - Format identification (magic bytes)     |  |
|  |  - Version, compatibility flags            |  |
|  |  - Duration, creation date                 |  |
|  +--------------------------------------------+  |
|                                                   |
|  +--------------------------------------------+  |
|  |  STREAM DESCRIPTIONS (Track Info)          |  |
|  |  - Track 1: H.264 video, 1920x1080, 24fps |  |
|  |  - Track 2: AAC audio, 48kHz, stereo       |  |
|  |  - Track 3: SRT subtitles, English         |  |
|  +--------------------------------------------+  |
|                                                   |
|  +--------------------------------------------+  |
|  |  INDEX / SEEK TABLE                        |  |
|  |  - Sample-to-chunk mappings                |  |
|  |  - Byte offsets for keyframes              |  |
|  |  - Timestamps for each sample              |  |
|  +--------------------------------------------+  |
|                                                   |
|  +--------------------------------------------+  |
|  |  INTERLEAVED MEDIA DATA                    |  |
|  |  [Video Frame 1][Audio Samples 1-1024]     |  |
|  |  [Video Frame 2][Audio Samples 1025-2048]  |  |
|  |  [Video Frame 3][Audio Samples 2049-3072]  |  |
|  |  ...                                       |  |
|  +--------------------------------------------+  |
|                                                   |
|  +--------------------------------------------+  |
|  |  OPTIONAL: Chapters, Attachments, Tags     |  |
|  +--------------------------------------------+  |
+--------------------------------------------------+
```

### The Multiplexing Concept

The process of combining multiple elementary streams into a single container is called **muxing** (multiplexing). The reverse process of extracting individual streams from a container is called **demuxing** (demultiplexing). These operations are performed without re-encoding the actual media data; they only manipulate the container-level structure.

---

## 2. MP4 (MPEG-4 Part 14 / ISO BMFF)

### Overview

MP4 is the most widely used container format on the internet and in consumer media. It is formally specified as MPEG-4 Part 14 and is based on the **ISO Base Media File Format** (ISO BMFF, ISO 14496-12). The format evolved from Apple's QuickTime file format (.mov), and the two share the same fundamental box-based structure.

MP4 supports a wide range of codecs:
- **Video**: H.264/AVC, H.265/HEVC, H.266/VVC, AV1, VP9
- **Audio**: AAC, MP3, AC-3, E-AC-3, Opus, FLAC
- **Subtitles**: Timed Text (tx3g), WebVTT (in fMP4)
- **Metadata**: iTunes-style tags, XMP data

### Box (Atom) Structure

MP4 files are composed of hierarchical **boxes** (historically called **atoms** in QuickTime). Each box has a simple structure:

```
+---------------------------+
|  Box Size (4 bytes)       |  Total size of this box including header
+---------------------------+
|  Box Type (4 bytes)       |  Four ASCII characters (e.g., 'ftyp', 'moov')
+---------------------------+
|  Box Payload (variable)   |  Data or nested child boxes
|  ...                      |
+---------------------------+

For sizes > 4GB, an extended size field is used:
+---------------------------+
|  Size = 1 (4 bytes)       |  Signals that extended size follows
+---------------------------+
|  Box Type (4 bytes)       |
+---------------------------+
|  Extended Size (8 bytes)  |  64-bit size value
+---------------------------+
|  Box Payload              |
+---------------------------+
```

### Top-Level MP4 Structure

A typical MP4 file has this high-level layout:

```
MP4 File
|
+-- ftyp (File Type Box)
|     Brand: "isom", "mp41", "mp42", "avc1", etc.
|     Tells players what features this file uses.
|
+-- moov (Movie Box) -- Contains ALL metadata, NO media data
|   |
|   +-- mvhd (Movie Header Box)
|   |     Duration, timescale, creation/modification dates,
|   |     preferred rate, preferred volume, matrix
|   |
|   +-- trak (Track Box) -- One per stream (video, audio, subtitle)
|   |   |
|   |   +-- tkhd (Track Header Box)
|   |   |     Track ID, duration, width/height (video), volume (audio)
|   |   |
|   |   +-- edts (Edit Box) -- Optional, edit list for timing offsets
|   |   |   +-- elst (Edit List Box)
|   |   |
|   |   +-- mdia (Media Box)
|   |       |
|   |       +-- mdhd (Media Header Box)
|   |       |     Timescale, duration, language
|   |       |
|   |       +-- hdlr (Handler Box)
|   |       |     Handler type: 'vide', 'soun', 'text', 'subt'
|   |       |
|   |       +-- minf (Media Information Box)
|   |           |
|   |           +-- vmhd/smhd/nmhd (Video/Sound/Null Media Header)
|   |           |
|   |           +-- dinf (Data Information Box)
|   |           |   +-- dref (Data Reference Box)
|   |           |
|   |           +-- stbl (Sample Table Box) *** CRITICAL FOR PLAYBACK ***
|   |               |
|   |               +-- stsd (Sample Description Box)
|   |               |     Codec-specific config: SPS/PPS for H.264,
|   |               |     AudioSpecificConfig for AAC, etc.
|   |               |
|   |               +-- stts (Decoding Time to Sample Box)
|   |               |     Maps sample number -> decode timestamp (DTS)
|   |               |
|   |               +-- ctts (Composition Time to Sample Box)
|   |               |     Delta between DTS and PTS (for B-frames)
|   |               |
|   |               +-- stss (Sync Sample Box)
|   |               |     Lists which samples are keyframes (I-frames)
|   |               |     THIS IS HOW SEEKING WORKS
|   |               |
|   |               +-- stsc (Sample-to-Chunk Box)
|   |               |     Maps samples to chunks (groups of samples)
|   |               |
|   |               +-- stsz (Sample Size Box)
|   |               |     Size in bytes for every single sample
|   |               |
|   |               +-- stco / co64 (Chunk Offset Box)
|   |                     Byte offset of each chunk within the file
|   |                     stco = 32-bit offsets, co64 = 64-bit offsets
|   |
|   +-- trak (Audio Track)
|   |   +-- (same structure as above)
|   |
|   +-- udta (User Data Box) -- Optional
|       +-- meta (Metadata Box)
|           +-- ilst (iTunes Metadata List)
|
+-- mdat (Media Data Box)
|     Contains the actual compressed audio and video samples.
|     This is the largest box by far. Samples are referenced
|     by offset from the stbl tables in moov.
|
+-- free (Free Space Box) -- Optional, padding for in-place edits
```

### How Seeking Works in MP4

Seeking in MP4 is an index-based operation that relies on the sample table (stbl) boxes. Here is the step-by-step process when a user clicks on a timeline position:

```
User seeks to time T
        |
        v
1. stts (Time-to-Sample) table
   Convert time T to sample number N
   (Walk through run-length encoded entries:
    "100 samples, each 1001 ticks" -> find which sample N
    corresponds to time T in the media timescale)
        |
        v
2. stss (Sync Sample) table
   Find the nearest keyframe at or before sample N.
   If N = 450 and keyframes are at [1, 30, 60, ..., 420, 450, 480],
   the nearest sync sample <= 450 is sample 450.
   Let this be sample K.
        |
        v
3. stsc (Sample-to-Chunk) table
   Find which chunk contains sample K.
   Entries like: "From sample 1, chunk_group starts at chunk 1,
                  3 samples per chunk"
   -> Sample K is in chunk C.
        |
        v
4. stco (Chunk Offset) table
   Look up the byte offset of chunk C within the file.
   offset = stco[C]
        |
        v
5. stsz (Sample Size) table
   If sample K is not the first in its chunk,
   sum sizes of preceding samples in the chunk
   to find the exact byte position within the chunk.
   final_offset = stco[C] + sum(stsz[first_in_chunk..K-1])
        |
        v
6. Seek to final_offset in the file, read sample K (a keyframe),
   then decode forward from K to the originally requested sample N.
```

This is why MP4 files with the `moov` box at the end are problematic for streaming: the player must download the entire file (or at least the end) to read the index before it can play anything. The tool `qt-faststart` or FFmpeg's `-movflags +faststart` moves the `moov` box before the `mdat` box.

### Fragmented MP4 (fMP4)

Traditional MP4 requires the entire `moov` box (with full sample tables) to be present before playback can begin. This is unsuitable for live streaming. **Fragmented MP4 (fMP4)** solves this by breaking the file into a series of self-contained fragments:

```
Fragmented MP4 Structure:

+-- ftyp
+-- moov (Initialization Segment)
|   +-- mvhd
|   +-- trak (minimal, no sample tables)
|       +-- stbl (empty - stts, stsz, stsc, stco all have 0 entries)
|
+-- moof (Movie Fragment Box) -- Fragment 1 header
|   +-- mfhd (Movie Fragment Header)
|   |     Sequence number: 1
|   +-- traf (Track Fragment Box)
|       +-- tfhd (Track Fragment Header)
|       +-- tfdt (Track Fragment Decode Time)
|       |     Base decode time for this fragment
|       +-- trun (Track Fragment Run)
|             Per-sample: duration, size, flags, composition offset
|             data_offset: offset from moof start to sample data
+-- mdat (Media Data for Fragment 1)
|
+-- moof (Movie Fragment Box) -- Fragment 2 header
|   +-- traf
|       +-- tfdt (base_decode_time advances)
|       +-- trun
+-- mdat (Media Data for Fragment 2)
|
+-- moof -- Fragment 3
+-- mdat
...
```

Each `moof` + `mdat` pair is a self-contained fragment. The player needs only the initial `moov` (the initialization segment) plus any single fragment to begin playback. This is the foundation of:

- **DASH (Dynamic Adaptive Streaming over HTTP)** - Uses fMP4 segments
- **HLS (HTTP Live Streaming)** - Apple added fMP4 support in 2016 alongside the traditional MPEG-TS
- **MSE (Media Source Extensions)** - Browsers accept fMP4 segments via JavaScript

### CMAF (Common Media Application Format)

**CMAF** (ISO 23000-19) is a standardization effort to unify DASH and HLS around a common segment format. A CMAF segment is an fMP4 segment that conforms to specific constraints:

- Uses ISO BMFF (fMP4) as the container
- Requires specific codec configurations (H.264/H.265 for video, AAC/AC-3 for audio)
- Defines a "CMAF Track" as a single codec, single track fMP4
- Defines a "CMAF Chunk" which is a subset of a segment, enabling ultra-low-latency streaming

```
CMAF Hierarchy:

CMAF Presentation
  +-- CMAF Selection Set (e.g., all video renditions)
  |     +-- CMAF Switching Set
  |           +-- CMAF Track (720p, 2Mbps)
  |           |     +-- CMAF Segment (2 seconds)
  |           |     |     +-- CMAF Chunk (500ms)
  |           |     |     +-- CMAF Chunk (500ms)
  |           |     |     +-- CMAF Chunk (500ms)
  |           |     |     +-- CMAF Chunk (500ms)
  |           |     +-- CMAF Segment
  |           |     ...
  |           +-- CMAF Track (1080p, 4Mbps)
  |           +-- CMAF Track (480p, 1Mbps)
  +-- CMAF Selection Set (audio)
        +-- CMAF Track (English AAC)
        +-- CMAF Track (Spanish AAC)
```

The key benefit of CMAF is that content providers can encode once and serve both DASH and HLS clients from the same segments, reducing storage and encoding costs by roughly 50%.

---

## 3. MKV (Matroska)

### Overview

Matroska (.mkv for video, .mka for audio, .mks for subtitles, .mk3d for stereoscopic video) is an open, free container format that aims to be a universal container. It is developed by the Matroska.org community and is specified in RFC 8794 (IETF).

Matroska is the most flexible container format available. It supports:
- Virtually any video codec (H.264, H.265, AV1, VP9, MPEG-2, etc.)
- Virtually any audio codec (AAC, FLAC, Opus, DTS, TrueHD, etc.)
- Unlimited number of tracks of any type
- Multiple subtitle formats (SRT, ASS/SSA, PGS, VobSub)
- Chapter definitions with nested chapters
- Tags (metadata) with any custom fields
- Attachments (fonts, images, documents)
- Soft-linking and hard-linking of files for ordered chapters

### EBML-Based Structure

Matroska is built on **EBML** (Extensible Binary Meta Language), a binary XML-like format. Every element in an MKV file has:

```
EBML Element Structure:

+----------------------------------+
|  Element ID (1-4 bytes)          |  Variable-length coded integer
+----------------------------------+  identifies the element type
|  Data Size (1-8 bytes)           |  Variable-length coded integer
+----------------------------------+  indicates payload size
|  Data (variable)                 |  Payload: raw data or child elements
+----------------------------------+

Variable-length integer encoding (VINT):
  1-byte:  1xxx xxxx                    (7 data bits)
  2-byte:  01xx xxxx xxxx xxxx          (14 data bits)
  3-byte:  001x xxxx xxxx xxxx xxxx xxxx (21 data bits)
  4-byte:  0001 xxxx ... (28 bits)
  ...up to 8 bytes
```

### MKV File Structure

```
MKV File
|
+-- EBML Header
|     EBML version, read version, max ID length, max size length,
|     DocType: "matroska" (or "webm" for WebM files),
|     DocTypeVersion, DocTypeReadVersion
|
+-- Segment (top-level container for everything else)
    |
    +-- SeekHead (Meta Seek Information)
    |     Index of byte positions of other top-level elements.
    |     Allows jumping directly to Tracks, Cues, etc.
    |
    +-- Info (Segment Information)
    |     TimestampScale (nanoseconds per unit, default 1000000 = 1ms),
    |     Duration, Title, MuxingApp, WritingApp, DateUTC, SegmentUID
    |
    +-- Tracks (Track Descriptions)
    |   +-- TrackEntry (Video Track)
    |   |     TrackNumber, TrackUID, TrackType (1=video),
    |   |     CodecID ("V_MPEG4/ISO/AVC" for H.264),
    |   |     CodecPrivate (SPS/PPS for H.264),
    |   |     Video: PixelWidth, PixelHeight, DisplayWidth, DisplayHeight,
    |   |            ColourSpace, Colour (HDR metadata)
    |   +-- TrackEntry (Audio Track)
    |   |     TrackNumber, TrackUID, TrackType (2=audio),
    |   |     CodecID ("A_AAC" for AAC),
    |   |     Audio: SamplingFrequency, Channels, BitDepth
    |   +-- TrackEntry (Subtitle Track)
    |         TrackNumber, TrackUID, TrackType (17=subtitle),
    |         CodecID ("S_TEXT/ASS" for ASS subtitles),
    |         Language, FlagDefault, FlagForced
    |
    +-- Chapters (optional)
    |   +-- EditionEntry
    |       +-- ChapterAtom
    |       |     ChapterUID, ChapterTimeStart, ChapterTimeEnd,
    |       |     ChapterDisplay: ChapString, ChapLanguage
    |       +-- ChapterAtom (can be nested for sub-chapters)
    |
    +-- Cluster (Media Data) -- Repeated for the entire file
    |   |  Timestamp (cluster base timestamp)
    |   +-- SimpleBlock or BlockGroup
    |   |     TrackNumber, relative_timestamp, flags (keyframe, etc.),
    |   |     compressed frame data
    |   +-- SimpleBlock
    |   +-- BlockGroup
    |   |     Block + optional BlockDuration, ReferenceBlock,
    |   |     BlockAdditions (alpha channel, etc.)
    |   ...
    +-- Cluster
    +-- Cluster
    ...
    |
    +-- Cues (Seek Index) -- Similar to MP4's stss + stco
    |   +-- CuePoint
    |   |     CueTime, CueTrackPositions:
    |   |       CueTrack, CueClusterPosition, CueRelativePosition,
    |   |       CueDuration, CueBlockNumber
    |   +-- CuePoint
    |   ...
    |
    +-- Attachments (optional)
    |   +-- AttachedFile
    |         FileName ("DejaVuSans.ttf"),
    |         FileMimeType ("font/ttf"),
    |         FileData (raw binary of the file)
    |
    +-- Tags (optional)
        +-- Tag
            Targets: TargetTypeValue, TrackUID, ChapterUID
            SimpleTag: TagName, TagString, TagLanguage
```

### Key MKV Features

**Unlimited Tracks**: Unlike MP4 which has practical limits, MKV can contain any number of video, audio, and subtitle tracks. A Blu-ray rip might contain 1 video track, 8 audio tracks (different languages and formats), and 12 subtitle tracks.

**Ordered Chapters and Segment Linking**: MKV files can reference other MKV files by their SegmentUID. This allows constructing a seamless playback experience across multiple files. For example, a TV series might share a common opening credits file, and each episode references it rather than duplicating the data.

**Attachments**: MKV can embed arbitrary files. The most common use is embedding fonts required by ASS/SSA subtitles, ensuring the subtitles display correctly regardless of what fonts are installed on the system.

**Codec Agnostic**: MKV's design separates the container structure from the codec. New codecs can be supported simply by registering a new CodecID string. No changes to the container specification are needed.

---

## 4. WebM

### Overview

**WebM** is an open, royalty-free media container format developed by Google, based on a profile (subset) of the Matroska container. It was designed specifically for the web, with a focus on simplicity and broad browser support.

### Codec Restrictions

Unlike MKV which accepts virtually any codec, WebM restricts the allowed codecs:

| Type   | Allowed Codecs                |
|--------|-------------------------------|
| Video  | VP8, VP9, AV1                 |
| Audio  | Vorbis, Opus                  |

All of these codecs are royalty-free, which was a primary design goal. The EBML DocType for a WebM file is `"webm"` rather than `"matroska"`.

### WebM vs. MKV

```
MKV (Full Matroska)
|
|-- Any video codec
|-- Any audio codec
|-- Chapters: YES
|-- Attachments: YES
|-- Tags: Full support
|-- Subtitles: SRT, ASS, PGS, VobSub, etc.
|
WebM (Matroska Subset)
|
|-- Video: VP8, VP9, AV1 ONLY
|-- Audio: Vorbis, Opus ONLY
|-- Chapters: YES (but rarely used)
|-- Attachments: NO
|-- Tags: Limited support
|-- Subtitles: WebVTT only (via browser)
```

### Browser Support

WebM was created to provide a royalty-free alternative to H.264 in the `<video>` element:

- Chrome: Full support (VP8, VP9, AV1 + Vorbis, Opus)
- Firefox: Full support
- Edge: Full support
- Safari: VP9 support added in Safari 16.4 (2023), AV1 support varies
- Opera: Full support

### Streaming with WebM

WebM supports streaming through:
- **WebM Byte Stream Format** for Media Source Extensions (MSE)
- Progressive download (the Cues element enables seeking)
- Live streaming via chunked WebM (similar to how fMP4 works, using Clusters as natural segment boundaries)

However, WebM is not commonly used with HLS or DASH in production. Most adaptive streaming deployments use fMP4.

---

## 5. FLV (Flash Video)

### Overview

FLV (Flash Video) was developed by Macromedia (later Adobe) for use with Adobe Flash Player. Despite Flash Player reaching end-of-life in 2020, FLV remains relevant because it is the container format used in **RTMP (Real-Time Messaging Protocol)** streaming. Most live streaming software (OBS Studio, FFmpeg, etc.) sends RTMP streams using FLV encapsulation to ingest servers.

### Supported Codecs

| Type  | Codecs                                      |
|-------|---------------------------------------------|
| Video | H.264/AVC, Sorenson Spark, VP6, Screen Video |
| Audio | AAC, MP3, Speex, ADPCM, Nellymoser          |

Modern RTMP/FLV usage is almost exclusively H.264 + AAC. An extension called **Enhanced RTMP** adds support for HEVC, VP9, and AV1.

### FLV File Structure

```
FLV File Structure:

+------------------------------------------+
|  FLV Header (9 bytes)                    |
|    Signature: "FLV" (3 bytes)            |
|    Version: 0x01 (1 byte)               |
|    Flags: 0x05 = audio+video (1 byte)   |
|    Header Size: 0x00000009 (4 bytes)     |
+------------------------------------------+
|  PreviousTagSize0: 0x00000000 (4 bytes)  |
+------------------------------------------+
|  FLV Tag 1 (Script Data / Metadata)      |
|    Tag Type: 18 (script data)            |
|    Data Size: variable                   |
|    Timestamp: 0                          |
|    Payload: AMF-encoded "onMetaData"     |
|      - duration, width, height           |
|      - videodatarate, audiodatarate      |
|      - framerate, audiosamplerate        |
+------------------------------------------+
|  PreviousTagSize1 (4 bytes)              |
+------------------------------------------+
|  FLV Tag 2 (Video - Sequence Header)     |
|    Tag Type: 9 (video)                   |
|    Payload: AVC Decoder Config Record    |
|      (SPS/PPS for H.264)                 |
+------------------------------------------+
|  PreviousTagSize2 (4 bytes)              |
+------------------------------------------+
|  FLV Tag 3 (Audio - Sequence Header)     |
|    Tag Type: 8 (audio)                   |
|    Payload: AudioSpecificConfig (AAC)    |
+------------------------------------------+
|  PreviousTagSize3 (4 bytes)              |
+------------------------------------------+
|  FLV Tag 4 (Video - Keyframe)           |
|    Tag Type: 9                           |
|    Timestamp: 0                          |
|    Payload: H.264 IDR frame              |
+------------------------------------------+
|  PreviousTagSize4 (4 bytes)              |
+------------------------------------------+
|  FLV Tag 5 (Audio)                       |
|    Tag Type: 8                           |
|    Timestamp: 0                          |
|    Payload: AAC raw frame                |
+------------------------------------------+
|  PreviousTagSize5                        |
+------------------------------------------+
|  ... more tags ...                       |
+------------------------------------------+
```

### FLV Tag Structure

```
FLV Tag (11-byte header + data):

+---------------------------+
|  Tag Type (1 byte)        |  8=audio, 9=video, 18=script data
+---------------------------+
|  Data Size (3 bytes)      |  Size of payload (not including header)
+---------------------------+
|  Timestamp (3 bytes)      |  Milliseconds (lower 24 bits)
+---------------------------+
|  Timestamp Ext (1 byte)   |  Upper 8 bits of timestamp (total: 32 bits)
+---------------------------+
|  Stream ID (3 bytes)      |  Always 0
+---------------------------+
|  Payload (Data Size bytes) |
+---------------------------+

After each tag: PreviousTagSize (4 bytes) = 11 + Data Size
This enables backward seeking through the file.
```

### FLV in Modern Usage

FLV's continued relevance is entirely due to RTMP:

1. **Ingest**: Streamers use OBS -> RTMP -> FLV to send video to platforms like Twitch, YouTube Live, etc.
2. **Server-side**: Media servers (Nginx-RTMP, SRS, Ant Media) receive FLV via RTMP, then **transmux** (remux) to HLS/DASH for delivery.
3. **HTTP-FLV**: Some CDNs in China (e.g., Alibaba Cloud, Bilibili) serve FLV over HTTP for low-latency playback, as FLV's simple tag structure allows immediate progressive playback.

---

## 6. MPEG-TS (Transport Stream)

### Overview

MPEG Transport Stream (MPEG-TS, .ts) is defined in MPEG-2 Part 1 (ISO 13818-1). It was designed for environments where data loss is expected: digital television broadcasting (DVB, ATSC), satellite transmission, and cable TV. It is also the traditional segment format for Apple's HLS (HTTP Live Streaming), though fMP4 is now preferred.

### Design Philosophy

Unlike MP4, which assumes a reliable storage medium (hard drive), MPEG-TS assumes an unreliable transport channel (airwaves, satellite). Key design choices:

- **Fixed-size packets (188 bytes)** for easy synchronization
- **No global index** - the stream is self-describing at regular intervals
- **Frequent resynchronization** - Program information is repeated every ~100ms
- **Error detection** - Each packet has a continuity counter to detect dropped packets
- **No seeking index** - Seeking requires scanning or an external index

### MPEG-TS Packet Structure

```
MPEG-TS Packet (188 bytes, fixed):

  0                   1                   2                   3
  0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
 +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 |  Sync Byte    | T|P|T| PID (13 bits)         |S|A| Continuity|
 |  0x47         | E|U|P|                       |C|F| Counter   |
 |  (8 bits)     | I|S|I|                       | |C| (4 bits)  |
 +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 |                                                               |
 |  Adaptation Field (variable, 0-183 bytes)                     |
 |    - Adaptation field length                                  |
 |    - Flags: discontinuity, random access, PCR flag            |
 |    - PCR (Program Clock Reference, 42 bits, if present)       |
 |    - OPCR, splice countdown, private data                     |
 |    - Stuffing bytes (0xFF padding)                            |
 |                                                               |
 +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 |                                                               |
 |  Payload (variable, 0-184 bytes)                              |
 |    Contains PES packet data, PSI tables, or other data.       |
 |    A PES packet may span multiple TS packets.                 |
 |                                                               |
 +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+

 Total: always 188 bytes (some systems use 204 bytes with FEC)

 Header fields:
   Sync Byte (8b):  Always 0x47 - used to find packet boundaries
   TEI (1b):        Transport Error Indicator
   PUSI (1b):       Payload Unit Start Indicator (start of PES/PSI)
   TP (1b):         Transport Priority
   PID (13b):       Packet Identifier (which stream this belongs to)
   SC (2b):         Scrambling Control
   AFC (2b):        Adaptation Field Control (01=payload only,
                    10=adaptation only, 11=adaptation+payload)
   CC (4b):         Continuity Counter (0-15, increments per PID)
```

### PID Assignments and PSI Tables

```
MPEG-TS PID System:

  PID 0x0000 = PAT (Program Association Table)
  PID 0x0001 = CAT (Conditional Access Table)
  PID 0x0011 = SDT (Service Description Table) [DVB]
  PID 0x1FFF = Null packet (stuffing / padding)

  PAT (PID 0x0000) -- Transmitted every ~100ms
  +----------------------------------+
  |  Program Number | PMT PID        |
  |  1              | 0x0100         |
  |  2              | 0x0200         |
  +----------------------------------+

  PMT (Program Map Table, PID from PAT) -- Transmitted every ~100ms
  +----------------------------------+
  |  PCR PID: 0x0101                 |  (which PID carries the clock)
  |  Stream Type | Elementary PID    |
  |  0x1B (H.264)| 0x0101 (video)   |
  |  0x0F (AAC)  | 0x0102 (audio)   |
  |  0x06 (PES)  | 0x0103 (subtitles)|
  +----------------------------------+

  PES (Packetized Elementary Stream):
  Video frames and audio frames are wrapped in PES packets,
  which are then split across multiple 188-byte TS packets.
```

### PES Packet Structure

```
PES Packet (carried in TS payload):

+------------------------------------------+
|  Packet Start Code Prefix (3 bytes)      |  0x000001
+------------------------------------------+
|  Stream ID (1 byte)                      |  0xE0-0xEF = video
|                                          |  0xC0-0xDF = audio
+------------------------------------------+
|  PES Packet Length (2 bytes)             |  Can be 0 for video
+------------------------------------------+
|  Optional PES Header                     |
|    - PTS (Presentation Timestamp, 33b)   |
|    - DTS (Decode Timestamp, 33b)         |
|    - ESCR, ES rate, etc.                 |
+------------------------------------------+
|  PES Payload                             |
|    Raw H.264 NAL units or AAC frames     |
+------------------------------------------+
```

### PCR (Program Clock Reference)

The PCR is a 42-bit timestamp (33 bits base at 90kHz + 9 bits extension at 27MHz) carried in the adaptation field. It is the master clock for synchronization:

- Transmitted at least every 100ms (typically every 40ms)
- The decoder uses PCR to synchronize its local clock with the encoder's clock
- Audio and video PTS/DTS values are relative to this clock
- Clock recovery: the decoder adjusts its playback speed to match the PCR rate

### Why MPEG-TS for Broadcast and HLS

1. **Error Resilience**: Each 188-byte packet is self-contained in terms of identification (PID) and synchronization (0x47 sync byte). Losing packets means losing some data, but the stream can be resynchronized at the next 0x47 byte.

2. **No Global Index**: A receiver can tune into a broadcast stream at any point. Within ~100ms, it will receive a PAT and PMT telling it what streams are available and a PCR for clock synchronization. It then waits for the next keyframe and begins decoding.

3. **Constant Bitrate Friendly**: Null packets (PID 0x1FFF) can be inserted as padding to maintain a constant bitrate, which is required for broadcast transponders and cable systems.

4. **HLS Legacy**: Apple chose MPEG-TS for HLS because it was well-understood, supported by hardware decoders, and its self-contained nature meant each segment was independently playable. However, fMP4 segments are now preferred for HLS due to smaller overhead and better compatibility with DASH.

---

## 7. Ogg

### Overview

**Ogg** is a free, open container format developed by the Xiph.Org Foundation. It is designed to provide efficient streaming and manipulation of high-quality digital multimedia. The name "Ogg" refers to the container format; the codecs are separate projects:

- **Vorbis** - Lossy audio codec (Ogg Vorbis, .ogg)
- **Opus** - Low-latency audio codec (Ogg Opus, .opus)
- **FLAC** - Lossless audio codec (Ogg FLAC, .oga)
- **Theora** - Video codec based on VP3 (Ogg Theora, .ogv)
- **Speex** - Speech codec (deprecated in favor of Opus)

### Ogg Page Structure

Ogg uses a page-based structure rather than packets:

```
Ogg Page Structure:

+------------------------------------------------------+
|  Capture Pattern (4 bytes): "OggS"                   |
+------------------------------------------------------+
|  Version (1 byte): 0                                 |
+------------------------------------------------------+
|  Header Type (1 byte):                               |
|    bit 0: continuation of previous packet             |
|    bit 1: first page of logical bitstream (BOS)       |
|    bit 2: last page of logical bitstream (EOS)        |
+------------------------------------------------------+
|  Granule Position (8 bytes):                         |
|    Codec-specific position (e.g., PCM sample number) |
+------------------------------------------------------+
|  Serial Number (4 bytes):                            |
|    Identifies the logical bitstream (track)           |
+------------------------------------------------------+
|  Page Sequence Number (4 bytes):                     |
|    Monotonically increasing per logical bitstream     |
+------------------------------------------------------+
|  CRC Checksum (4 bytes): CRC32 of entire page        |
+------------------------------------------------------+
|  Number of Segments (1 byte): 1-255                  |
+------------------------------------------------------+
|  Segment Table (N bytes):                            |
|    Each byte = segment length (0-255)                |
|    Segments of 255 bytes mean the packet continues    |
|    A segment < 255 bytes terminates the packet        |
+------------------------------------------------------+
|  Segment Data (variable):                            |
|    Concatenated data for all segments                 |
+------------------------------------------------------+
```

### Multiplexing in Ogg

Multiple logical bitstreams (e.g., Theora video + Vorbis audio) are multiplexed by interleaving their pages. Each logical bitstream has a unique serial number. The granule position provides time information for seeking.

### Usage Today

Ogg is used in:
- Many video games (Ogg Vorbis for game audio)
- Podcasts (Opus in Ogg)
- Wikipedia (Ogg Theora/Vorbis for embedded media, though WebM is now preferred)
- Some Linux distributions default to Ogg for audio

However, Ogg has largely been eclipsed by WebM for web video and by MP4/M4A for audio distribution. Opus itself is more commonly found in WebM containers for web use.

---

## 8. Muxing and Demuxing

### What These Operations Do

**Muxing (Multiplexing)**: The process of combining multiple elementary streams (video, audio, subtitles) into a single container file. The muxer interleaves the streams, creates index tables, writes metadata, and produces a conformant container file.

```
Elementary Streams -> Muxer -> Container File

  H.264 bitstream ----+
                       |
  AAC bitstream -------+---> [MUXER] ---> output.mp4
                       |
  SRT subtitles -------+
```

**Demuxing (Demultiplexing)**: The reverse process. The demuxer reads the container, parses the structure, and separates the interleaved data back into individual elementary streams.

```
Container File -> Demuxer -> Elementary Streams

                          +---> H.264 bitstream
                          |
  input.mp4 ---> [DEMUXER]+---> AAC bitstream
                          |
                          +---> SRT subtitles
```

### Remuxing

**Remuxing** is the process of changing the container format without re-encoding the actual media data. The compressed video and audio bitstreams are extracted from one container and placed into another. This is:

- **Very fast** (limited by disk I/O, not CPU)
- **Lossless** (no quality change since the codec bitstream is untouched)
- **Common use cases**: MKV to MP4, TS to MP4, FLV to MP4

```
Remuxing Flow:

  input.mkv ---> [DEMUXER] ---> H.264 + AAC + SRT
                                    |
                                    v
  output.mp4 <--- [MUXER] <--- H.264 + AAC (SRT may be dropped
                                             if MP4 doesn't support it)
```

Remuxing limitations:
- The target container must support the codecs in the source. For example, you cannot remux VP9 into FLV (FLV does not support VP9 without Enhanced RTMP).
- Some features may be lost (e.g., MKV attachments when remuxing to MP4, or ASS subtitle styling when converting to SRT).

### Stream Mapping

When a container has multiple tracks, you often need to select which streams to include in the output. This is called **stream mapping**. FFmpeg uses the `-map` option for this:

```
Input file has:
  Stream 0:0 - H.264 video
  Stream 0:1 - AAC audio (English)
  Stream 0:2 - AAC audio (Spanish)
  Stream 0:3 - SRT subtitles (English)
  Stream 0:4 - SRT subtitles (Spanish)

To select only video + Spanish audio + English subtitles:
  -map 0:0 -map 0:2 -map 0:3

To select all streams of a type:
  -map 0:v  (all video streams)
  -map 0:a  (all audio streams)

To combine streams from multiple input files:
  Input 0: video.mp4 (has video)
  Input 1: audio_en.aac (English audio)
  Input 2: audio_es.aac (Spanish audio)

  -map 0:v -map 1:a -map 2:a
```

### The Muxer's Responsibilities

A muxer must handle several non-trivial tasks:

1. **Interleaving**: Audio and video samples must be interleaved so that a player can read sequentially without large buffers. Typically, video and audio chunks alternate every 0.5-1 second.

2. **Timestamp Mapping**: Different codecs may use different timebases. The muxer must convert all timestamps to the container's timescale.

3. **Index Generation**: For seekable formats (MP4, MKV), the muxer builds sample tables or cue points. For streaming formats (MPEG-TS, FLV), this may be omitted.

4. **Codec-Specific Packaging**: Each container has specific rules for how codec data is stored. For example, H.264 in MP4 uses AVCC format (length-prefixed NAL units), while H.264 in MPEG-TS uses Annex B format (start code prefixed).

5. **Buffer Model Compliance**: For broadcast containers, the muxer must ensure the bitstream conforms to the buffer model (T-STD for MPEG-TS) to prevent decoder buffer overflows or underflows.

---

## 9. Metadata

### Overview

Metadata in media files includes descriptive information about the content (title, artist, album), technical information (encoding parameters, bitrate), and structural information (chapters, thumbnails).

### ID3 Tags

ID3 is the de facto metadata standard for MP3 files, though it is also used in other contexts (MPEG-TS in HLS uses ID3 for timed metadata events).

```
ID3v2 Tag Structure (at beginning of file):

+----------------------------------+
|  Header (10 bytes)               |
|    "ID3" (3 bytes)               |
|    Version: v2.3 or v2.4         |
|    Flags: unsynchronization,     |
|           extended header, etc.  |
|    Size (4 bytes, syncsafe int)  |
+----------------------------------+
|  Frame: TIT2 (Title)            |
|    Frame ID (4 bytes): "TIT2"    |
|    Size (4 bytes)                |
|    Flags (2 bytes)               |
|    Encoding + "Song Title"       |
+----------------------------------+
|  Frame: TPE1 (Artist)           |
|  Frame: TALB (Album)            |
|  Frame: APIC (Attached Picture) |
|    Album art as JPEG/PNG         |
+----------------------------------+
```

Common ID3 frames:
- TIT2: Title
- TPE1: Artist
- TALB: Album
- TRCK: Track number
- TDRC: Recording date
- TCON: Genre
- APIC: Attached picture (album art)
- COMM: Comments
- USLT: Unsynchronized lyrics

### MP4 Metadata (iTunes-Style)

MP4 stores metadata in the `moov/udta/meta/ilst` box hierarchy using a key-value format derived from the iTunes metadata specification:

```
MP4 Metadata Atoms:

moov
  +-- udta
      +-- meta
          +-- hdlr (handler: 'mdir')
          +-- ilst
              +-- (c)nam  -> Title
              +-- (c)ART  -> Artist
              +-- (c)alb  -> Album
              +-- (c)day  -> Year
              +-- trkn    -> Track number
              +-- covr    -> Cover art (JPEG/PNG data)
              +-- (c)gen  -> Genre
              +-- (c)wrt  -> Composer
              +-- desc    -> Description
              +-- tmpo    -> BPM
              +-- cprt    -> Copyright
```

### MKV Tags

MKV uses a flexible, hierarchical tag system:

```xml
<Tags>
  <Tag>
    <Targets>
      <TargetTypeValue>50</TargetTypeValue>  <!-- Album/Movie level -->
    </Targets>
    <SimpleTag>
      <TagName>TITLE</TagName>
      <TagString>The Movie Title</TagString>
    </SimpleTag>
    <SimpleTag>
      <TagName>DIRECTOR</TagName>
      <TagString>Director Name</TagString>
    </SimpleTag>
  </Tag>
  <Tag>
    <Targets>
      <TargetTypeValue>30</TargetTypeValue>  <!-- Track/Chapter level -->
      <TrackUID>12345</TrackUID>
    </Targets>
    <SimpleTag>
      <TagName>TITLE</TagName>
      <TagString>Audio Track Title</TagString>
    </SimpleTag>
  </Tag>
</Tags>
```

Target type values: 70=Collection, 60=Season/Sequel, 50=Album/Movie, 40=Part/Session, 30=Track/Song/Chapter, 20=Subtrack, 10=Movement.

### Chapter Markers

Chapters allow defining named time ranges within a media file.

**MKV Chapters** (native support):
```xml
<Chapters>
  <EditionEntry>
    <ChapterAtom>
      <ChapterUID>1</ChapterUID>
      <ChapterTimeStart>0</ChapterTimeStart>
      <ChapterTimeEnd>300000000000</ChapterTimeEnd>  <!-- nanoseconds -->
      <ChapterDisplay>
        <ChapString>Introduction</ChapString>
        <ChapLanguage>eng</ChapLanguage>
      </ChapterDisplay>
    </ChapterAtom>
    <ChapterAtom>
      <ChapterUID>2</ChapterUID>
      <ChapterTimeStart>300000000000</ChapterTimeStart>
      <ChapterTimeEnd>900000000000</ChapterTimeEnd>
      <ChapterDisplay>
        <ChapString>Main Content</ChapString>
        <ChapLanguage>eng</ChapLanguage>
      </ChapterDisplay>
    </ChapterAtom>
  </EditionEntry>
</Chapters>
```

**MP4 Chapters**: Stored either as a QuickTime text track or in the `chpl` box (Nero chapters).

### Embedded Artwork

Both MP4 and MKV support embedded images:
- **MP4**: `covr` atom in ilst, contains raw JPEG or PNG
- **MKV**: Attachments element, with MIME type "image/jpeg" or "image/png"
- **ID3**: APIC frame, supports front cover, back cover, artist photo, etc.

---

## 10. Subtitles

### Overview

Subtitles are text (or image-based) overlays synchronized with video playback. They can be **embedded** (inside the container) or **sidecar** (separate files alongside the video).

### SRT (SubRip Text)

The simplest and most widely supported subtitle format. Plain text with sequence numbers and timestamps.

```
1
00:00:01,000 --> 00:00:04,000
Hello, welcome to the presentation.

2
00:00:05,500 --> 00:00:08,200
Today we will discuss container formats.

3
00:00:10,000 --> 00:00:14,500
Let's start with the basics of
how media files are structured.
```

**Pros**: Universal support, easy to create and edit, human-readable.
**Cons**: No styling, no positioning, no formatting beyond line breaks.

### ASS/SSA (Advanced SubStation Alpha)

A powerful subtitle format with rich styling capabilities. Originally created for fansubbing anime.

```
[Script Info]
Title: Example Subtitles
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,2,1,2,10,10,40,1
Style: Italics,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,-1,-1,0,0,100,100,0,0,1,2,1,2,10,10,40,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:04.00,Default,,0,0,0,,Hello, welcome to the presentation.
Dialogue: 0,0:00:05.50,0:00:08.20,Italics,,0,0,0,,Today we will discuss {\b1}container formats{\b0}.
Dialogue: 0,0:00:10.00,0:00:14.50,Default,,0,0,0,,{\pos(960,100)}This text is positioned at the top center.
```

**Features**: Font selection, colors, bold/italic, positioning, rotation, animation effects (karaoke, movement), transparency, border/shadow styles.

**Use case**: MKV files often embed ASS subtitles along with the required fonts as attachments.

### WebVTT (Web Video Text Tracks)

The web standard for subtitles, used with HTML5 `<video>` and `<track>` elements.

```
WEBVTT

NOTE This is a comment

STYLE
::cue(.highlight) {
  color: yellow;
  font-weight: bold;
}

00:00:01.000 --> 00:00:04.000 position:50% align:center
Hello, welcome to the presentation.

00:00:05.500 --> 00:00:08.200
Today we will discuss <b>container formats</b>.

00:00:10.000 --> 00:00:14.500
<c.highlight>Let's start with the basics.</c>
```

**Features**: CSS styling via `::cue`, positioning, alignment, inline tags (`<b>`, `<i>`, `<u>`), classes, voice tags, vertical text.

**Browser support**: All modern browsers via `<track kind="subtitles">`.

### PGS (Presentation Graphic Stream)

A bitmap-based subtitle format used in Blu-ray discs. Unlike SRT/ASS/WebVTT, PGS subtitles are rendered images, not text.

```
PGS Segment Types:
  0x16 = Palette Definition Segment (defines colors)
  0x17 = Object Definition Segment (compressed bitmap data)
  0x14 = Presentation Composition Segment (timing + positioning)
  0x15 = Window Definition Segment (display area)
  0x80 = End of Display Set Segment
```

**Pros**: Pixel-perfect rendering, supports any font/style, no font dependency issues.
**Cons**: Cannot be searched or edited easily, larger file size, cannot be restyled by the player.

### VobSub

DVD bitmap subtitles, stored as .idx (index) + .sub (bitmaps) files or embedded in MKV.

### Embedded vs. Sidecar Subtitles

| Aspect         | Embedded                          | Sidecar                          |
|----------------|-----------------------------------|----------------------------------|
| Location       | Inside the container (MKV, MP4)   | Separate file (.srt, .vtt, .ass) |
| Distribution   | Single file to distribute         | Must distribute video + subtitle |
| Editing        | Requires remuxing to change       | Edit the text file directly      |
| Player support | Player must support the container | Most players auto-detect by name |
| Streaming      | Works with all delivery methods   | Requires separate HTTP request   |
| File naming    | N/A                               | movie.en.srt, movie.zh.srt      |

### Subtitle Conversion

Subtitles can be converted between formats:

```
SRT -> WebVTT:  Straightforward (timestamps, basic text)
SRT -> ASS:     Loses nothing (ASS is a superset)
ASS -> SRT:     Loses styling, positioning, effects
PGS -> SRT:     Requires OCR (e.g., Subtitle Edit, Tesseract)
WebVTT -> SRT:  Loses CSS styling, keeps text
```

---

## 11. Practical Examples

### FFmpeg Muxing Examples

**Mux raw H.264 and AAC into MP4:**
```bash
ffmpeg -i video.h264 -i audio.aac \
  -c:v copy -c:a copy \
  -map 0:v -map 1:a \
  output.mp4
```

**Mux video + multiple audio tracks + subtitles into MKV:**
```bash
ffmpeg -i video.h264 \
  -i audio_en.aac \
  -i audio_es.aac \
  -i subs_en.srt \
  -i subs_es.srt \
  -map 0:v -map 1:a -map 2:a -map 3:s -map 4:s \
  -c:v copy -c:a copy -c:s srt \
  -metadata:s:a:0 language=eng -metadata:s:a:0 title="English" \
  -metadata:s:a:1 language=spa -metadata:s:a:1 title="Spanish" \
  -metadata:s:s:0 language=eng -metadata:s:s:0 title="English" \
  -metadata:s:s:1 language=spa -metadata:s:s:1 title="Spanish" \
  output.mkv
```

### FFmpeg Demuxing Examples

**Extract video stream only (no re-encoding):**
```bash
ffmpeg -i input.mp4 -map 0:v -c copy video_only.h264
```

**Extract audio stream to a separate file:**
```bash
ffmpeg -i input.mp4 -map 0:a -c copy audio_only.aac
```

**Extract subtitles from MKV:**
```bash
ffmpeg -i input.mkv -map 0:s:0 subtitles.srt
```

**Extract all streams separately:**
```bash
ffmpeg -i input.mkv \
  -map 0:v:0 -c copy video.h264 \
  -map 0:a:0 -c copy audio_en.aac \
  -map 0:a:1 -c copy audio_es.aac \
  -map 0:s:0 subs_en.srt \
  -map 0:s:1 subs_es.srt
```

### FFmpeg Remuxing Examples

**Remux MKV to MP4 (no re-encoding):**
```bash
ffmpeg -i input.mkv -c copy -movflags +faststart output.mp4
```
Note: `-movflags +faststart` moves the moov atom to the beginning for web streaming.

**Remux MPEG-TS to MP4:**
```bash
ffmpeg -i input.ts -c copy -bsf:a aac_adtstoasc output.mp4
```
Note: `-bsf:a aac_adtstoasc` converts AAC from ADTS framing (used in TS) to raw framing (used in MP4).

**Remux MP4 to fragmented MP4:**
```bash
ffmpeg -i input.mp4 -c copy \
  -movflags +frag_keyframe+empty_moov+default_base_moof \
  output_fragmented.mp4
```

**Remux to WebM (may require re-encoding if codecs are incompatible):**
```bash
# If source is already VP9+Opus, just remux:
ffmpeg -i input.mkv -c copy output.webm

# If source is H.264+AAC, must re-encode:
ffmpeg -i input.mp4 -c:v libvpx-vp9 -c:a libopus output.webm
```

**Remux FLV to MP4:**
```bash
ffmpeg -i input.flv -c copy output.mp4
```

### Adding Subtitles

**Add SRT subtitles to MP4 (as a sidecar track):**
```bash
ffmpeg -i input.mp4 -i subtitles.srt \
  -map 0:v -map 0:a -map 1:s \
  -c:v copy -c:a copy -c:s mov_text \
  output.mp4
```

**Burn (hardcode) subtitles into video:**
```bash
ffmpeg -i input.mp4 -vf "subtitles=subtitles.srt" \
  -c:v libx264 -c:a copy output.mp4
```
Note: Burning subtitles requires re-encoding the video.

**Add WebVTT to fragmented MP4 for DASH/HLS:**
```bash
ffmpeg -i input.mp4 -i subtitles.vtt \
  -map 0:v -map 0:a -map 1:s \
  -c:v copy -c:a copy -c:s webvtt \
  -movflags +frag_keyframe+empty_moov \
  output.mp4
```

### Creating HLS Segments

**Create HLS with MPEG-TS segments:**
```bash
ffmpeg -i input.mp4 \
  -c:v copy -c:a copy \
  -hls_time 6 \
  -hls_list_size 0 \
  -hls_segment_type mpegts \
  -hls_segment_filename "segment_%03d.ts" \
  playlist.m3u8
```

**Create HLS with fMP4 segments:**
```bash
ffmpeg -i input.mp4 \
  -c:v copy -c:a copy \
  -hls_time 6 \
  -hls_list_size 0 \
  -hls_segment_type fmp4 \
  -hls_fmp4_init_filename "init.mp4" \
  -hls_segment_filename "segment_%03d.m4s" \
  playlist.m3u8
```

### Inspecting Container Structure

**Show all streams in a file:**
```bash
ffprobe -show_streams input.mp4
```

**Show container format details:**
```bash
ffprobe -show_format input.mp4
```

**Show MP4 box structure:**
```bash
# Using mp4dump (from Bento4 tools)
mp4dump input.mp4

# Using ffprobe atoms
ffprobe -show_entries format_tags input.mp4
```

**Show MPEG-TS stream info:**
```bash
ffprobe -show_programs -show_streams input.ts
```

**Show all packets with timestamps:**
```bash
ffprobe -show_packets -select_streams v:0 input.mp4 | head -100
```

### Advanced: Splitting and Joining

**Split a file at specific times (no re-encoding):**
```bash
# Extract from 00:05:00 to 00:10:00
ffmpeg -i input.mp4 -ss 00:05:00 -to 00:10:00 -c copy segment.mp4
```

**Concatenate files (same codec/format):**
```bash
# Create a file list
echo "file 'part1.mp4'" > filelist.txt
echo "file 'part2.mp4'" >> filelist.txt
echo "file 'part3.mp4'" >> filelist.txt

# Concatenate without re-encoding
ffmpeg -f concat -safe 0 -i filelist.txt -c copy output.mp4
```

---

## 12. Container Format Comparison Table

### General Features

| Feature            | MP4        | MKV         | WebM       | FLV        | MPEG-TS    | Ogg        |
|--------------------|------------|-------------|------------|------------|------------|------------|
| File extension     | .mp4, .m4a | .mkv, .mka  | .webm      | .flv       | .ts, .m2ts | .ogg, .ogv |
| Specification      | ISO 14496  | RFC 8794    | WebM spec  | Adobe spec | ISO 13818  | RFC 3533   |
| License            | Patented   | Free/Open   | Free/Open  | Proprietary| Patented   | Free/Open  |
| Structure          | Box/Atom   | EBML        | EBML       | Tags       | Packets    | Pages      |
| Max video tracks   | Multiple   | Unlimited   | 1 (typical)| 1          | Multiple   | Multiple   |
| Max audio tracks   | Multiple   | Unlimited   | 1 (typical)| 1          | Multiple   | Multiple   |
| Subtitle tracks    | Limited    | Unlimited   | Limited    | None       | DVB/Teletext| Limited   |
| Chapters           | Yes        | Yes (rich)  | Basic      | No         | No         | Basic      |
| Attachments        | No         | Yes         | No         | No         | No         | No         |
| Metadata           | iTunes/XMP | Flexible    | Limited    | AMF        | Limited    | Vorbis Comment|
| Seeking            | Excellent  | Excellent   | Good       | Limited    | Poor*      | Good       |
| Streaming          | Excellent  | Good        | Good       | Good (RTMP)| Excellent  | Fair       |
| Error resilience   | Low        | Low         | Low        | Low        | High       | Medium     |
| Overhead           | Low        | Low-Medium  | Low        | Low        | High       | Medium     |

*MPEG-TS seeking requires scanning unless an external index is provided.

### Codec Support

| Codec          | MP4 | MKV | WebM | FLV | MPEG-TS | Ogg |
|----------------|-----|-----|------|-----|---------|-----|
| H.264/AVC      | Yes | Yes | No   | Yes | Yes     | No  |
| H.265/HEVC     | Yes | Yes | No   | Yes*| Yes     | No  |
| H.266/VVC      | Yes | Yes | No   | No  | Yes     | No  |
| VP8            | Yes | Yes | Yes  | Yes | No      | No  |
| VP9            | Yes | Yes | Yes  | Yes*| No      | No  |
| AV1            | Yes | Yes | Yes  | Yes*| Yes     | No  |
| MPEG-2         | Yes | Yes | No   | No  | Yes     | No  |
| Theora         | No  | Yes | No   | No  | No      | Yes |
| AAC            | Yes | Yes | No   | Yes | Yes     | No  |
| MP3            | Yes | Yes | No   | Yes | Yes     | No  |
| Opus           | Yes | Yes | Yes  | No  | No      | Yes |
| Vorbis         | No  | Yes | Yes  | No  | No      | Yes |
| FLAC           | Yes | Yes | No   | No  | No      | Yes |
| AC-3 / E-AC-3  | Yes | Yes | No   | No  | Yes     | No  |
| DTS / DTS-HD   | No  | Yes | No   | No  | Yes     | No  |
| TrueHD / Atmos | No  | Yes | No   | No  | Yes     | No  |

*Enhanced RTMP/FLV extension required.

### Browser Support (HTML5 `<video>`)

| Container | Chrome | Firefox | Safari | Edge  |
|-----------|--------|---------|--------|-------|
| MP4       | Yes    | Yes     | Yes    | Yes   |
| WebM      | Yes    | Yes     | Partial| Yes   |
| Ogg       | Yes    | Yes     | No     | Yes   |
| MKV       | No*    | No      | No     | No*   |
| FLV       | No     | No      | No     | No    |
| MPEG-TS   | No**   | No      | Yes*** | No    |

*Chromium-based browsers may play some MKV files since MKV is a superset of WebM.
**MPEG-TS via MSE (Media Source Extensions) in JavaScript.
***Safari supports MPEG-TS natively for HLS playback.

### Streaming Protocol Compatibility

| Container  | HLS       | DASH | RTMP | MSE  | Progressive |
|------------|-----------|------|------|------|-------------|
| MP4        | Yes (fMP4)| Yes  | No   | Yes  | Yes*        |
| MPEG-TS    | Yes       | No   | No   | Yes  | No          |
| FLV        | No        | No   | Yes  | No   | Yes         |
| WebM       | No        | Rare | No   | Yes  | Yes         |
| MKV        | No        | No   | No   | No   | No          |
| Ogg        | No        | No   | No   | No   | Yes         |

*Requires faststart (moov before mdat).

---

## 13. Common Interview Questions

### Conceptual Questions

**Q1: What is the difference between a codec and a container?**

A codec is an algorithm for compressing/decompressing media data (e.g., H.264 encodes video pixels into a compressed bitstream). A container is a file format that packages one or more compressed streams together with metadata, timing information, and indices for seeking. You can place the same codec's output into different containers (H.264 in MP4, MKV, or TS) and a single container can hold multiple codecs (MP4 with H.264 video + AAC audio + Opus commentary track).

**Q2: Why would you remux a file instead of re-encoding it?**

Remuxing changes only the container, not the media data. It is essentially instant (limited by I/O speed), completely lossless (the compressed bitstreams are bit-identical), and does not require significant CPU resources. Re-encoding is only needed when you want to change the codec, resolution, bitrate, or other encoding parameters. Common remux scenarios: MKV to MP4 for Apple device compatibility, TS to MP4 for web playback, FLV to MP4 after RTMP ingest.

**Q3: Why must the moov atom be at the beginning of an MP4 file for web streaming?**

The moov atom contains the sample table (stbl) which maps timestamps to byte offsets in the file. Without this information, the player cannot determine where any given frame is located. If moov is at the end, the player must download the entire file (or issue a range request for the end) before it can parse the index and start playback. Moving moov to the front (via `qt-faststart` or `-movflags +faststart`) allows the player to begin reading the index immediately and start progressive playback.

**Q4: What is fragmented MP4 and why is it used for streaming?**

Fragmented MP4 breaks the traditional single-moov + single-mdat structure into an initialization segment (minimal moov with codec config but no sample tables) followed by a series of moof+mdat pairs (fragments). Each fragment is self-contained with its own timing and offset information (trun box). This allows live streaming (where the total duration is unknown), adaptive bitrate switching between fragments, and low-latency delivery since the player needs only the init segment + one fragment to begin.

**Q5: Why does HLS traditionally use MPEG-TS segments instead of MP4?**

MPEG-TS was designed for broadcast environments where the receiver can tune in at any point. Each segment is self-synchronizing (0x47 sync bytes, PAT/PMT tables, PCR). This means each HLS segment is independently playable without needing data from any other segment. Traditional MP4 requires a single moov atom for the entire file, making it unsuitable for segmented delivery. However, Apple introduced fMP4 support for HLS in 2016, and fMP4 is now the recommended segment format because it has lower overhead and enables CMAF compatibility with DASH.

**Q6: What is CMAF and why does it matter?**

CMAF (Common Media Application Format) standardizes the fMP4 segment format so that the same encoded segments can be served by both DASH and HLS. Before CMAF, content providers had to encode and store two separate sets of segments. CMAF reduces storage costs by ~50% and simplifies encoding pipelines. CMAF also defines "chunks" (sub-segments) which enable ultra-low-latency streaming by allowing the player to request partial segments as they are being produced.

### Practical/Debugging Questions

**Q7: A user reports that an MP4 file plays fine locally but does not play when served over HTTP. What could be wrong?**

The most likely cause is that the moov atom is at the end of the file. The browser cannot seek to the end over HTTP without range request support. Solutions: (1) Remux with `-movflags +faststart` to move moov to the front. (2) Ensure the web server supports HTTP Range requests (206 Partial Content). (3) Check that the Content-Type header is `video/mp4`. Other possibilities: the codec is not supported by the browser (e.g., H.265 in Chrome), or the file uses features the browser does not support (e.g., edit lists).

**Q8: You have a video in MKV with H.264 + DTS audio. How do you make it playable in a web browser?**

Web browsers do not support MKV containers or DTS audio. You need to: (1) Remux from MKV to MP4 for the container. (2) Re-encode the audio from DTS to AAC (browsers universally support AAC). The video can be copied without re-encoding since H.264 is supported in MP4.

```bash
ffmpeg -i input.mkv -c:v copy -c:a aac -b:a 256k output.mp4
```

**Q9: How does seeking work differently in MP4 vs. MPEG-TS?**

MP4 has a complete index (stbl boxes: stts, stss, stsc, stsz, stco) that maps any timestamp to an exact byte offset. Seeking is O(log n) using binary search on these tables. MPEG-TS has no built-in index. Seeking requires either: (1) scanning the stream for PAT/PMT/PCR packets to find the target time (slow, O(n)), (2) using an external index file, or (3) estimating the byte position based on bitrate and then scanning for the nearest sync byte and keyframe.

**Q10: What is the difference between PTS and DTS, and why does it matter for containers?**

PTS (Presentation Timestamp) is when a frame should be displayed. DTS (Decode Timestamp) is when a frame should be decoded. For streams without B-frames, PTS equals DTS. With B-frames, frames must be decoded out of display order (the decoder needs future reference frames before it can decode B-frames). Containers must store both timestamps. In MP4, DTS is stored in stts and the PTS-DTS offset in ctts. In MPEG-TS, both PTS and DTS are stored in the PES header. Incorrect PTS/DTS causes A/V desync, stuttering, or frames displayed in wrong order.

**Q11: You receive a live RTMP stream and need to serve it as HLS. Describe the pipeline.**

```
OBS (encoder)
  |
  | RTMP (H.264 + AAC in FLV)
  v
Media Server (e.g., Nginx-RTMP, SRS, MediaMTX)
  |
  | 1. Demux FLV, extract H.264 and AAC elementary streams
  | 2. Segment into chunks (e.g., 6-second segments)
  | 3. Mux each segment as either:
  |    a. MPEG-TS (.ts files) - traditional HLS
  |    b. fMP4 (.m4s files) - modern HLS with init.mp4
  | 4. Generate .m3u8 playlist file
  | 5. Serve via HTTP/HTTPS
  v
CDN -> Browser/Player (HLS.js or native)
```

Key considerations: keyframe alignment (each segment should start with a keyframe, controlled by encoder GOP settings), playlist type (event vs. sliding window for live), and whether to use LL-HLS (Low-Latency HLS with CMAF chunks and partial segments).

**Q12: What are the tradeoffs between embedding subtitles in the container vs. using sidecar files?**

Embedded subtitles: Single file to distribute, always available, cannot be accidentally separated from the video. But changing subtitles requires remuxing the entire file, and adding new languages requires the same.

Sidecar subtitles: Easy to edit, easy to add new languages, no need to modify the video file. But must be distributed alongside the video (multiple files to manage), file naming must follow conventions for auto-detection, and some delivery methods (native HLS) do not support sidecar files easily.

For streaming (DASH/HLS): Subtitles are typically served as separate files (WebVTT segments or TTML) referenced in the manifest, giving the best of both worlds: structured delivery with the flexibility of separate tracks.

**Q13: Explain why the same H.264 stream needs different packaging in MP4 vs. MPEG-TS.**

H.264 NAL units can be packaged in two ways:

1. **Annex B format** (MPEG-TS): NAL units are prefixed with start codes (0x00000001 or 0x000001). SPS and PPS are sent inline in the stream as NAL units. This is self-synchronizing - a decoder can find NAL unit boundaries by scanning for start codes.

2. **AVCC format** (MP4): NAL units are prefixed with their length (1, 2, or 4 bytes). SPS and PPS are stored once in the sample description (avcC box in stsd), not inline. This is more compact but not self-synchronizing.

When remuxing from TS to MP4, the muxer must convert from Annex B to AVCC format (extract SPS/PPS to avcC box, replace start codes with length prefixes). FFmpeg handles this automatically with the `h264_mp4toannexb` and `extract_extradata` bitstream filters.

**Q14: A video file has correct audio but the video appears frozen or shows artifacts after seeking. What could cause this?**

Several container-level causes: (1) The seek landed on a non-keyframe and the player failed to decode from the previous keyframe forward (stss box may be missing or incorrect). (2) Corrupted or incorrect ctts (composition time offset) table causing frames to be displayed in wrong order. (3) Missing or incorrect edit list (elst) causing a timing offset. (4) For MPEG-TS, the seek estimation was inaccurate and the player started decoding from a P/B-frame instead of an I-frame.

Codec-level causes: (1) The stream uses open GOPs where B-frames reference the previous GOP's last frame, and the previous GOP was not decoded. (2) Temporal scalability layers with missing reference frames.

**Q15: How would you reduce the startup latency of an adaptive bitrate stream?**

Container-level optimizations:
1. Use fMP4 instead of MPEG-TS for segments (lower overhead, smaller init segment).
2. Use CMAF chunks to enable sub-segment delivery (player receives data before the full segment is ready).
3. Reduce segment duration (4s -> 2s segments, with tradeoff of more HTTP requests and potentially lower compression efficiency).
4. Ensure the init segment is small and cached aggressively (long Cache-Control max-age).
5. Use HTTP/2 or HTTP/3 to reduce connection overhead.
6. Preload the init segment and first segment hint via `<link rel="preload">`.
7. Start with the lowest bitrate rendition for fast initial playback, then switch up.
8. For LL-HLS: use partial segments, preload hints, and blocking playlist reload to achieve ~2-3 second latency.

---

## Summary of Key Concepts

```
Container Format Selection Guide:

  Web playback         -> MP4 (H.264/H.265 + AAC)
  Archival / Hoarding  -> MKV (any codec, maximum flexibility)
  Royalty-free web     -> WebM (VP9/AV1 + Opus)
  Live ingest (RTMP)   -> FLV (H.264 + AAC)
  Broadcast TV         -> MPEG-TS
  Streaming (HLS/DASH) -> fMP4 (CMAF preferred)
  Open-source audio    -> Ogg (Opus or Vorbis)

  Need to change container? -> Remux (fast, lossless)
  Need to change codec?     -> Re-encode (slow, generation loss)
  Need to add subtitles?    -> Mux (add stream to container)
  Need to extract audio?    -> Demux (extract stream from container)
```

Understanding container formats is essential for anyone working with media pipelines, streaming infrastructure, or media applications. The container determines what codecs can be used, how efficiently seeking works, whether the file can be streamed, and what metadata can be stored. Making the right container choice at each stage of the pipeline (ingest, storage, processing, delivery) directly impacts latency, compatibility, storage costs, and user experience.
