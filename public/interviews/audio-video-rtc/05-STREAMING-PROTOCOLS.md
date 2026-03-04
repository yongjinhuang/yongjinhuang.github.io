# Streaming Protocols

## Table of Contents

1. [Streaming Paradigms](#1-streaming-paradigms)
2. [RTMP (Real-Time Messaging Protocol)](#2-rtmp-real-time-messaging-protocol)
3. [HLS (HTTP Live Streaming)](#3-hls-http-live-streaming)
4. [DASH (Dynamic Adaptive Streaming over HTTP)](#4-dash-dynamic-adaptive-streaming-over-http)
5. [RTSP/RTP/RTCP](#5-rtsprtprtcp)
6. [SRT (Secure Reliable Transport)](#6-srt-secure-reliable-transport)
7. [RIST (Reliable Internet Stream Transport)](#7-rist-reliable-internet-stream-transport)
8. [WHIP/WHEP](#8-whipwhep)
9. [Comparison Table](#9-comparison-table)
10. [Adaptive Bitrate Streaming (ABR)](#10-adaptive-bitrate-streaming-abr)
11. [DRM (Digital Rights Management)](#11-drm-digital-rights-management)
12. [Code Examples](#12-code-examples)

---

## 1. Streaming Paradigms

### On-Demand vs Live

Streaming falls into two fundamental categories:

**Video on Demand (VOD):** The entire media file exists on the server before any viewer
requests it. The content can be pre-transcoded into multiple bitrates, segmented, and
cached at CDN edge nodes worldwide. Viewers can seek to any position instantly.

**Live Streaming:** Content is generated in real time. An encoder captures audio/video,
compresses it, and transmits it to an origin server, which then distributes it to viewers.
The content does not exist ahead of time, which means caching and seeking behave
differently. Latency between capture and display is a critical metric.

### Delivery Models

```
+------------------------------------------------------------------+
|                    Streaming Delivery Models                      |
+------------------------------------------------------------------+
|                                                                   |
|  Progressive Download                                             |
|  +---------------------------------------------------------+     |
|  | Single file, downloaded sequentially from byte 0        |     |
|  | Playback starts before download completes               |     |
|  | No adaptive quality, no live support                    |     |
|  | Example: MP4 over HTTP with moov atom at start          |     |
|  +---------------------------------------------------------+     |
|                                                                   |
|  Adaptive Bitrate Streaming (ABR)                                 |
|  +---------------------------------------------------------+     |
|  | Media split into small segments (2-10 seconds)          |     |
|  | Multiple quality levels (representations / variants)    |     |
|  | Client selects quality based on bandwidth + buffer      |     |
|  | Protocols: HLS, DASH                                    |     |
|  +---------------------------------------------------------+     |
|                                                                   |
|  Real-Time Streaming                                              |
|  +---------------------------------------------------------+     |
|  | Sub-second latency, often peer-to-peer                  |     |
|  | Used for video conferencing, interactive broadcast       |     |
|  | Protocols: WebRTC, RTSP/RTP, SRT                        |     |
|  +---------------------------------------------------------+     |
|                                                                   |
+------------------------------------------------------------------+
```

### The Latency Spectrum

Different use cases demand different latency targets. Here is the full spectrum from
traditional broadcast to ultra-low-latency interactive applications:

```
Latency Spectrum (capture to display)
======================================================================

  Ultra-Low       Low Latency      Reduced         Standard       Broadcast
  < 500ms         0.5 - 2s         2 - 5s          5 - 15s        15 - 45s
  |               |                |               |              |
  |  WebRTC       |  LL-HLS        |  Tuned HLS    |  Default     |  Traditional
  |  SRT          |  LL-DASH       |  Tuned DASH   |  HLS/DASH    |  Cable/SAT
  |  WHIP/WHEP   |  CMAF-CTE      |  SRT (high)   |              |
  |               |                |               |              |
  v               v                v               v              v
  Interactive     Near-real-time   Sports/News     Entertainment  Legacy
  Conferencing    Auction, Gaming  Commentary      VOD-like live  Distribution
  Gaming          E-sports         Social media    Concerts       OTT origin

======================================================================
```

**Why latency varies:**

- **Encoding latency:** Filling a GOP (Group of Pictures) takes time. A 2-second GOP
  introduces at least 2 seconds of latency.
- **Segment duration:** HLS/DASH segments are typically 4-10 seconds. The player must
  buffer at least one full segment before playback begins, often more.
- **CDN propagation:** Segments must travel from origin to edge to player.
- **Player buffer:** Players maintain a buffer for smooth playback (typically 3+ segments).
- **Protocol overhead:** Handshakes, manifest fetches, and key retrieval add latency.

### Glass-to-Glass Latency Breakdown

```
Camera -> Encoder -> Packager -> CDN Origin -> CDN Edge -> Player -> Display
  |         |          |           |              |          |         |
  5ms      50-200ms   10-50ms    50-200ms       10-50ms   100-500ms  5ms
           (codec     (segment   (network       (network  (buffer +
            + GOP)     creation)  transfer)      transfer)  decode)

Total (standard HLS): 6-30 seconds
Total (LL-HLS):       1-3 seconds
Total (WebRTC):       100-500 milliseconds
```

---

## 2. RTMP (Real-Time Messaging Protocol)

### History and Context

RTMP was developed by Macromedia (later acquired by Adobe) for streaming audio, video,
and data between a Flash Player client and a server. When Flash dominated the web,
RTMP was the de facto standard for both ingest and delivery. Flash's deprecation in
2020 killed RTMP for last-mile delivery, but it survives as the dominant ingest protocol
from encoders to media servers. Platforms like YouTube Live, Twitch, and Facebook Live
still accept RTMP ingest from OBS, Wirecast, and hardware encoders.

### RTMP Connection Establishment

RTMP operates over TCP (default port 1935). The connection follows a multi-step process:

```
Encoder (Client)                           Media Server
      |                                         |
      |--- TCP SYN --------------------------->|
      |<-- TCP SYN-ACK ------------------------|
      |--- TCP ACK --------------------------->|
      |                                         |
      |         RTMP Handshake (C0/S0, C1/S1, C2/S2)
      |--- C0 + C1 (1537 bytes) -------------->|
      |<-- S0 + S1 + S2 (3073 bytes) ---------|
      |--- C2 (1536 bytes) ------------------->|
      |                                         |
      |         RTMP Connect                    |
      |--- connect('app_name') --------------->|
      |<-- Window Ack Size --------------------|
      |<-- Set Peer Bandwidth -----------------|
      |<-- _result (connect success) ----------|
      |                                         |
      |         Create Stream                   |
      |--- createStream() -------------------->|
      |<-- _result (stream_id) ----------------|
      |                                         |
      |         Publish                         |
      |--- publish('stream_key', 'live') ----->|
      |<-- onStatus('NetStream.Publish.Start')-|
      |                                         |
      |--- Audio/Video Data ------------------->|
      |--- Audio/Video Data ------------------->|
      |            ...                          |
```

### Handshake Details

The RTMP handshake consists of three phases:

- **C0/S0** (1 byte each): Protocol version. Always `0x03` for standard RTMP.
- **C1/S1** (1536 bytes each): Contains a timestamp (4 bytes), zeros (4 bytes), and
  random data (1528 bytes). Used to calculate round-trip time.
- **C2/S2** (1536 bytes each): Echo of the peer's C1/S1 with timestamp differences.

### RTMP Message Format

After handshake, RTMP communication uses messages that are chunked for multiplexing:

```
RTMP Message Structure:
+------------------+------------------+
| Message Header   | Message Body     |
+------------------+------------------+
| - Message Type   | - Payload        |
| - Payload Length |                  |
| - Timestamp      |                  |
| - Stream ID      |                  |
+------------------+------------------+

Message Types:
  1  - Set Chunk Size
  2  - Abort Message
  3  - Acknowledgement
  4  - User Control Message
  5  - Window Acknowledgement Size
  6  - Set Peer Bandwidth
  8  - Audio Message
  9  - Video Message
  15 - Data Message (AMF3)
  17 - Command Message (AMF3)
  18 - Data Message (AMF0)
  20 - Command Message (AMF0)
```

### Chunk Stream

RTMP breaks messages into chunks to allow multiplexing of audio, video, and control
messages on a single TCP connection. The default chunk size is 128 bytes but is typically
increased to 4096 or higher via a Set Chunk Size message to reduce overhead.

```
Chunk Format:
+----------------+-----------------+-------------------+
| Basic Header   | Message Header  | Chunk Data        |
| (1-3 bytes)    | (0, 3, 7, or   | (up to chunk_size |
|                |  11 bytes)      |  bytes)           |
+----------------+-----------------+-------------------+

Basic Header Format (1 byte, most common):
  Bits 7-6: Format (fmt) - determines message header size
    00 = Type 0 (11-byte header, full)
    01 = Type 1 (7-byte header, same stream ID)
    10 = Type 2 (3-byte header, same stream + length)
    11 = Type 3 (0-byte header, continuation)
  Bits 5-0: Chunk Stream ID (2-63)
```

### AMF Encoding

Action Message Format (AMF) serializes ActionScript objects for RTMP commands:

**AMF0 Types:**
- `0x00` - Number (IEEE 754 double)
- `0x01` - Boolean
- `0x02` - String (UTF-8, 16-bit length prefix)
- `0x03` - Object (key-value pairs)
- `0x05` - Null
- `0x08` - ECMA Array
- `0x09` - Object End Marker

**Example connect command in AMF0:**
```
Command Name: "connect" (string)
Transaction ID: 1 (number)
Command Object: {
  app: "live",
  type: "nonprivate",
  flashVer: "FMLE/3.0",
  tcUrl: "rtmp://server/live"
}
```

### Enhanced RTMP

Enhanced RTMP (E-RTMP) extends the original protocol to support modern codecs:

- **HEVC/H.265** support (FourCC `hvc1`)
- **AV1** support (FourCC `av01`)
- **VP9** support (FourCC `vp09`)
- **HDR metadata** passthrough
- **Multitrack audio** support

Enhanced RTMP uses an extended video tag header with a FourCC codec identifier instead
of the legacy 4-bit codec ID, which was limited to 15 codecs.

### RTMP Variants

| Variant | Transport | Encryption | Port |
|---------|-----------|------------|------|
| RTMP    | TCP       | None       | 1935 |
| RTMPS   | TCP + TLS | TLS 1.2+   | 443  |
| RTMPE   | TCP       | Adobe proprietary | 1935 |
| RTMPT   | HTTP tunnel| None      | 80   |
| RTMFP   | UDP       | AES-128    | 1935 |

RTMPS is the only variant recommended today. RTMPE uses broken proprietary encryption.
RTMPT tunnels through HTTP but adds overhead. RTMFP is peer-to-peer and rarely used.

---

## 3. HLS (HTTP Live Streaming)

### Overview

HLS was created by Apple in 2009 as an HTTP-based alternative to RTMP delivery. It
quickly became the dominant delivery protocol because it works through standard HTTP
infrastructure (CDNs, caches, firewalls, load balancers). HLS is specified in
RFC 8216 (and RFC 8216bis for HLS version 2).

### Architecture

```
                         HLS Architecture
+----------+     +-----------+     +-------+     +--------+
|  Encoder |---->| Segmenter |---->| Origin|---->|  CDN   |
| (FFmpeg, |     | (creates  |     | Server|     | (edge  |
|  OBS)    |     |  .ts/.m4s |     |       |     |  cache)|
+----------+     |  + .m3u8) |     +-------+     +--------+
                 +-----------+                        |
                                                      |
                      +-------------------------------+
                      |
                 +---------+
                 |  Player  |
                 | (Safari, |
                 |  hls.js, |
                 |  ExoPlayer|
                 +---------+

Flow:
1. Player fetches master playlist (.m3u8)
2. Player selects variant based on bandwidth
3. Player fetches media playlist for chosen variant
4. Player downloads segments (.ts or .m4s)
5. Player periodically re-fetches live media playlist
```

### Master Playlist (Multivariant Playlist)

The master playlist describes available quality variants and their properties:

```
#EXTM3U
#EXT-X-VERSION:6

#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360,CODECS="avc1.4d401e,mp4a.40.2",FRAME-RATE=30
360p/playlist.m3u8

#EXT-X-STREAM-INF:BANDWIDTH=1400000,RESOLUTION=842x480,CODECS="avc1.4d401f,mp4a.40.2",FRAME-RATE=30
480p/playlist.m3u8

#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720,CODECS="avc1.64001f,mp4a.40.2",FRAME-RATE=30
720p/playlist.m3u8

#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2",FRAME-RATE=30
1080p/playlist.m3u8

#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=2560x1440,CODECS="avc1.640032,mp4a.40.2",FRAME-RATE=30
1440p/playlist.m3u8

#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=200000,RESOLUTION=1280x720,CODECS="avc1.64001f",URI="720p/iframes.m3u8"

#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",LANGUAGE="en",NAME="English",DEFAULT=YES,AUTOSELECT=YES,URI="audio/en/playlist.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",LANGUAGE="es",NAME="Spanish",URI="audio/es/playlist.m3u8"

#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",LANGUAGE="en",NAME="English",DEFAULT=YES,URI="subs/en/playlist.m3u8"
```

### Media Playlist (Live)

```
#EXTM3U
#EXT-X-VERSION:6
#EXT-X-TARGETDURATION:6
#EXT-X-MEDIA-SEQUENCE:26
#EXT-X-PROGRAM-DATE-TIME:2026-03-04T10:00:00.000Z

#EXTINF:6.006,
segment_0026.ts
#EXTINF:6.006,
segment_0027.ts
#EXTINF:6.006,
segment_0028.ts
#EXTINF:5.505,
segment_0029.ts
```

For live streams, the playlist does NOT contain `#EXT-X-ENDLIST`. The player re-fetches
the playlist at an interval derived from `#EXT-X-TARGETDURATION` to discover new segments.
Older segments are removed as new ones are added (sliding window).

### Media Playlist (VOD)

```
#EXTM3U
#EXT-X-VERSION:6
#EXT-X-TARGETDURATION:6
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-PLAYLIST-TYPE:VOD

#EXTINF:6.006,
segment_0000.ts
#EXTINF:6.006,
segment_0001.ts
...
#EXTINF:4.171,
segment_0149.ts
#EXT-X-ENDLIST
```

### Key EXT-X Tags

| Tag | Purpose |
|-----|---------|
| `#EXT-X-VERSION` | HLS protocol version |
| `#EXT-X-TARGETDURATION` | Maximum segment duration (integer seconds) |
| `#EXT-X-MEDIA-SEQUENCE` | Sequence number of first segment in playlist |
| `#EXT-X-DISCONTINUITY-SEQUENCE` | Discontinuity counter for live |
| `#EXT-X-ENDLIST` | Marks VOD or ended live stream |
| `#EXT-X-PLAYLIST-TYPE` | VOD or EVENT |
| `#EXT-X-MAP` | Initialization segment for fMP4 |
| `#EXT-X-KEY` | Encryption method and key URI |
| `#EXT-X-PROGRAM-DATE-TIME` | Wall-clock time mapping |
| `#EXT-X-DISCONTINUITY` | Encoding parameter change |
| `#EXT-X-STREAM-INF` | Variant stream properties |
| `#EXT-X-I-FRAME-STREAM-INF` | I-frame only variant (trick play) |
| `#EXT-X-MEDIA` | Alternate renditions (audio, subtitles) |
| `#EXT-X-INDEPENDENT-SEGMENTS` | Segments decode independently |
| `#EXT-X-DATERANGE` | Timed metadata (ad insertion, chapters) |

### Segment Formats

**MPEG-2 Transport Stream (.ts):**
- Legacy format, widely supported
- 188-byte fixed-size packets
- Contains PAT/PMT tables for stream identification
- Overhead: ~10-15% per segment due to TS headers + PES encapsulation
- Each segment starts with a PAT + PMT + keyframe

**Fragmented MP4 (.m4s / .fmp4):**
- Modern format, recommended since HLS v7
- Requires `#EXT-X-MAP` for initialization segment (.mp4 with moov box)
- Lower overhead than TS
- Better codec support (HEVC, AV1)
- Compatible with CMAF for unified HLS/DASH packaging

```
fMP4 Segment Structure:
+--------+--------+--------+--------+
| styp   | moof   | mdat   |        |
| (type) | (frag  | (media |        |
|        |  meta) |  data) |        |
+--------+--------+--------+--------+

Initialization Segment:
+--------+--------+
| ftyp   | moov   |
| (brand)| (track |
|        |  info) |
+--------+--------+
```

### HLS Segment Delivery Flow

```
         Time ------>

Encoder:  [====SEG 1====][====SEG 2====][====SEG 3====][====SEG 4====]
               6s              6s              6s              6s

Server playlist updates:

  t=6s:   #EXTINF:6.006
          segment_0001.ts

  t=12s:  #EXTINF:6.006
          segment_0001.ts
          #EXTINF:6.006
          segment_0002.ts

  t=18s:  #EXTINF:6.006
          segment_0001.ts
          #EXTINF:6.006
          segment_0002.ts
          #EXTINF:6.006
          segment_0003.ts

  t=24s:  #EXTINF:6.006         <-- segment_0001 removed (sliding window)
          segment_0002.ts
          #EXTINF:6.006
          segment_0003.ts
          #EXTINF:6.006
          segment_0004.ts

Player timeline:
  t=0-6s:    Waiting for first segment
  t=6-12s:   Buffering (downloading seg 1, waiting for seg 2)
  t=12-18s:  Playing seg 1, downloading seg 2-3
  t=18s+:    Steady-state playback (buffered ~2 segments ahead)

Total live latency: ~18-30 seconds (3-5 segment durations)
```

### Low-Latency HLS (LL-HLS)

Apple introduced LL-HLS in 2019 to reduce latency from 15-30 seconds to 2-4 seconds.

**Key Mechanisms:**

1. **Partial Segments:** Each full segment is divided into partial segments (parts),
   typically 200ms-500ms each. Parts are independently decodable and delivered as
   soon as they are produced.

2. **Preload Hints:** The playlist includes `#EXT-X-PRELOAD-HINT` to tell the player
   which resource to request next. The server holds the request open (HTTP chunked
   transfer or HTTP/2 push) until the resource is ready (blocking playlist reload).

3. **Blocking Playlist Reload:** The player adds `_HLS_msn` and `_HLS_part` query
   parameters to the playlist request. The server holds the response until the
   requested media sequence number and part index are available.

4. **Rendition Reports:** `#EXT-X-RENDITION-REPORT` provides the latest sequence
   number and part index for alternate renditions, allowing faster variant switching.

**LL-HLS Playlist Example:**

```
#EXTM3U
#EXT-X-VERSION:9
#EXT-X-TARGETDURATION:4
#EXT-X-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES,PART-HOLD-BACK=1.0,CAN-SKIP-UNTIL=24
#EXT-X-PART-INF:PART-TARGET=0.33334
#EXT-X-MEDIA-SEQUENCE:100

#EXTINF:4.00004,
segment_100.m4s
#EXT-X-PART:DURATION=0.33334,URI="part_101_0.m4s"
#EXT-X-PART:DURATION=0.33334,URI="part_101_1.m4s"
#EXT-X-PART:DURATION=0.33334,URI="part_101_2.m4s"
#EXT-X-PART:DURATION=0.33334,URI="part_101_3.m4s"
#EXT-X-PART:DURATION=0.33334,URI="part_101_4.m4s"
#EXT-X-PART:DURATION=0.33334,URI="part_101_5.m4s"
#EXT-X-PART:DURATION=0.33334,URI="part_101_6.m4s"
#EXT-X-PART:DURATION=0.33334,URI="part_101_7.m4s"
#EXT-X-PART:DURATION=0.33334,URI="part_101_8.m4s"
#EXT-X-PART:DURATION=0.33334,URI="part_101_9.m4s"
#EXT-X-PART:DURATION=0.33334,URI="part_101_10.m4s"
#EXT-X-PART:DURATION=0.33334,URI="part_101_11.m4s",INDEPENDENT=YES
#EXTINF:4.00004,
segment_101.m4s
#EXT-X-PART:DURATION=0.33334,URI="part_102_0.m4s",INDEPENDENT=YES
#EXT-X-PART:DURATION=0.33334,URI="part_102_1.m4s"
#EXT-X-PRELOAD-HINT:TYPE=PART,URI="part_102_2.m4s"

#EXT-X-RENDITION-REPORT:URI="../720p/playlist.m3u8",LAST-MSN=101,LAST-PART=1
```

---

## 4. DASH (Dynamic Adaptive Streaming over HTTP)

### Overview

DASH (ISO/IEC 23009-1) is an international standard for adaptive streaming over HTTP.
Unlike HLS (Apple-proprietary), DASH is codec-agnostic and vendor-neutral. It was
developed by MPEG and published as an ISO standard in 2012. Major adopters include
YouTube, Netflix, and most Android streaming platforms.

### Architecture

DASH uses an MPD (Media Presentation Description) manifest in XML format that describes
available content, quality levels, and segment locations.

```
DASH Architecture:

+----------+     +----------+     +-------+     +--------+
|  Encoder |---->| Packager |---->| Origin|---->|  CDN   |
|          |     | (creates |     | Server|     |        |
|          |     |  .mpd +  |     |       |     |        |
|          |     |  .m4s)   |     +-------+     +--------+
+----------+     +----------+                        |
                                                     |
                     +-------------------------------+
                     |
                +---------+
                |  Player  |
                | (dash.js,|
                | ExoPlayer|
                | Shaka)   |
                +---------+
```

### MPD Structure

```xml
<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011"
     profiles="urn:mpeg:dash:profile:isoff-live:2011"
     type="dynamic"
     availabilityStartTime="2026-03-04T10:00:00Z"
     minimumUpdatePeriod="PT2S"
     minBufferTime="PT4S"
     timeShiftBufferDepth="PT1H"
     publishTime="2026-03-04T10:15:00Z">

  <Period id="1" start="PT0S">
    <!-- Video Adaptation Set -->
    <AdaptationSet mimeType="video/mp4" codecs="avc1.64001f"
                   segmentAlignment="true" startWithSAP="1">
      <SegmentTemplate timescale="90000"
                       initialization="video/$RepresentationID$/init.mp4"
                       media="video/$RepresentationID$/seg_$Number$.m4s"
                       startNumber="1"
                       duration="540000"/>

      <Representation id="360p" bandwidth="800000"
                      width="640" height="360" frameRate="30"/>
      <Representation id="480p" bandwidth="1400000"
                      width="842" height="480" frameRate="30"/>
      <Representation id="720p" bandwidth="2800000"
                      width="1280" height="720" frameRate="30"/>
      <Representation id="1080p" bandwidth="5000000"
                      width="1920" height="1080" frameRate="30"/>
    </AdaptationSet>

    <!-- Audio Adaptation Set -->
    <AdaptationSet mimeType="audio/mp4" codecs="mp4a.40.2"
                   lang="en" segmentAlignment="true">
      <SegmentTemplate timescale="44100"
                       initialization="audio/en/init.mp4"
                       media="audio/en/seg_$Number$.m4s"
                       startNumber="1"
                       duration="264600"/>
      <Representation id="audio_en" bandwidth="128000"
                      audioSamplingRate="44100">
        <AudioChannelConfiguration
          schemeIdUri="urn:mpeg:dash:23003:3:audio_channel_configuration:2011"
          value="2"/>
      </Representation>
    </AdaptationSet>

    <!-- Subtitle Adaptation Set -->
    <AdaptationSet mimeType="application/mp4" codecs="wvtt"
                   lang="en">
      <Representation id="subs_en" bandwidth="1000">
        <BaseURL>subs/en/</BaseURL>
        <SegmentList duration="60">
          <SegmentURL media="sub_1.m4s"/>
          <SegmentURL media="sub_2.m4s"/>
        </SegmentList>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>
```

### MPD Hierarchy

```
MPD (Media Presentation Description)
  |
  +-- Period (time-bounded section of content)
  |     |
  |     +-- AdaptationSet (group of related representations)
  |     |     |
  |     |     +-- Representation (single quality level)
  |     |     |     |
  |     |     |     +-- SegmentTemplate / SegmentList / SegmentBase
  |     |     |           |
  |     |     |           +-- Initialization segment
  |     |     |           +-- Media segments
  |     |     |
  |     |     +-- Representation (another quality level)
  |     |     +-- ContentProtection (DRM info)
  |     |
  |     +-- AdaptationSet (audio)
  |     +-- AdaptationSet (subtitles)
  |
  +-- Period (e.g., ad break)
```

### Segment Addressing Modes

**SegmentTemplate with $Number$:**
```xml
<SegmentTemplate media="seg_$Number$.m4s" startNumber="1" duration="6"/>
```
Segments are addressed by sequential number. Simple and predictable.

**SegmentTemplate with $Time$:**
```xml
<SegmentTemplate media="seg_$Time$.m4s" timescale="90000">
  <SegmentTimeline>
    <S t="0" d="540000" r="9"/>
    <S d="270000"/>
  </SegmentTimeline>
</SegmentTemplate>
```
Segments are addressed by presentation timestamp. Supports variable-duration segments.

**SegmentList:**
```xml
<SegmentList duration="6">
  <Initialization sourceURL="init.mp4"/>
  <SegmentURL media="seg1.m4s"/>
  <SegmentURL media="seg2.m4s"/>
</SegmentList>
```
Explicit list of segment URLs. Used for VOD when segments have irregular durations.

**SegmentBase:**
```xml
<SegmentBase indexRange="708-1183">
  <Initialization range="0-707"/>
</SegmentBase>
```
Single file with byte-range addressing. Efficient for VOD with SIDX box for seeking.

### CMAF (Common Media Application Format)

CMAF (ISO/IEC 23000-19) defines a common segment format that works with both HLS and
DASH. It uses fragmented MP4 (fMP4) with constrained profiles:

- **Single codec per track**
- **Common encryption (CENC)**
- **Aligned segments** across bitrates
- **Chunked Transfer Encoding (CTE)** for low-latency delivery

With CMAF, a single set of media segments can serve both HLS and DASH clients. Only
the manifests (.m3u8 and .mpd) differ.

### Low-Latency DASH (LL-DASH)

LL-DASH uses CMAF chunks with HTTP chunked transfer encoding to deliver sub-segments
as they are produced:

```
Standard DASH Segment:
[=============SEGMENT (6s)=============]
  Must wait for entire segment before serving

LL-DASH with CMAF Chunks:
[=CHUNK=][=CHUNK=][=CHUNK=][=CHUNK=][=CHUNK=][=CHUNK=]
  0.5s     0.5s     0.5s     0.5s     0.5s     0.5s
  Each chunk is served immediately via HTTP CTE
```

Key LL-DASH MPD attributes:
- `availabilityTimeOffset` - how early segments can be requested
- `@duration` on SegmentTemplate for chunk duration
- `UTCTiming` element for clock synchronization
- `ServiceDescription` with `Latency` target for player guidance

---

## 5. RTSP/RTP/RTCP

### Overview

This protocol suite was designed for real-time media transport, primarily for
IP cameras, video surveillance, VoIP, and video conferencing. Unlike HTTP-based
protocols, RTP operates over UDP for minimal latency.

```
Protocol Stack:

+-------------------+
|   Application     |
+-------------------+
| RTSP (signaling)  |  TCP port 554
+-------------------+
| RTP  (media data) |  UDP (even port)
| RTCP (feedback)   |  UDP (odd port = RTP port + 1)
+-------------------+
| UDP / TCP         |
+-------------------+
| IP                |
+-------------------+
```

### RTSP (Real-Time Streaming Protocol)

RTSP (RFC 7826) is a signaling protocol similar to HTTP in syntax. It controls
media sessions but does not carry media data itself.

**Key RTSP Methods:**

| Method | Purpose |
|--------|---------|
| OPTIONS | Query supported methods |
| DESCRIBE | Get session description (SDP) |
| SETUP | Establish transport parameters |
| PLAY | Start media delivery |
| PAUSE | Temporarily halt delivery |
| TEARDOWN | End session |
| GET_PARAMETER | Keep-alive / query state |
| SET_PARAMETER | Set server parameters |

**Example RTSP Session:**

```
Client                                        Server
  |                                              |
  |--- OPTIONS rtsp://server/stream RTSP/2.0 -->|
  |<-- RTSP/2.0 200 OK (Public: DESCRIBE...) ---|
  |                                              |
  |--- DESCRIBE rtsp://server/stream ---------->|
  |<-- RTSP/2.0 200 OK                          |
  |    Content-Type: application/sdp             |
  |    (SDP body with media descriptions)        |
  |                                              |
  |--- SETUP rtsp://server/stream/trackID=1 --->|
  |    Transport: RTP/AVP;unicast;               |
  |    client_port=50000-50001                   |
  |<-- RTSP/2.0 200 OK                          |
  |    Transport: RTP/AVP;unicast;               |
  |    client_port=50000-50001;                  |
  |    server_port=60000-60001                   |
  |    Session: 12345678                         |
  |                                              |
  |--- PLAY rtsp://server/stream -------------->|
  |    Session: 12345678                         |
  |    Range: npt=0.000-                         |
  |<-- RTSP/2.0 200 OK                          |
  |                                              |
  |<========== RTP media data (UDP) ============|
  |<========== RTCP feedback (UDP) =============|
  |                                              |
  |--- TEARDOWN rtsp://server/stream ---------->|
  |    Session: 12345678                         |
  |<-- RTSP/2.0 200 OK                          |
```

### SDP (Session Description Protocol)

SDP (RFC 8866) describes media sessions. An RTSP DESCRIBE response contains SDP:

```
v=0
o=- 1234567890 1 IN IP4 192.168.1.100
s=Live Stream
t=0 0
m=video 0 RTP/AVP 96
a=rtpmap:96 H264/90000
a=fmtp:96 profile-level-id=42e01f;packetization-mode=1;
          sprop-parameter-sets=Z0IAH5WoFAFuQA==,aM4wpIA=
a=control:trackID=1
m=audio 0 RTP/AVP 97
a=rtpmap:97 MPEG4-GENERIC/44100/2
a=fmtp:97 streamtype=5;profile-level-id=1;mode=AAC-hbr;
          sizelength=13;indexlength=3;indexdeltalength=3;
          config=1210
a=control:trackID=2
```

### RTP Packet Format

```
RTP Header (12 bytes minimum):

 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|V=2|P|X|  CC   |M|     PT      |       Sequence Number          |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                           Timestamp                             |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|           Synchronization Source (SSRC) identifier              |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|            Contributing Source (CSRC) identifiers               |
|                             ....                                |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+

Field descriptions:
  V  (2 bits)  - Version, always 2
  P  (1 bit)   - Padding flag
  X  (1 bit)   - Extension header present
  CC (4 bits)  - CSRC count
  M  (1 bit)   - Marker bit (e.g., last packet of a video frame)
  PT (7 bits)  - Payload Type (codec identifier)
                 96-127 = dynamic (defined by SDP)
  Sequence Number (16 bits) - Increments per packet, detects loss
  Timestamp (32 bits) - Media clock timestamp
                        Video: 90000 Hz clock
                        Audio: sample rate (e.g., 48000 Hz)
  SSRC (32 bits) - Unique identifier for the media source
```

### RTCP Packet Types

RTCP provides feedback about the quality of RTP delivery:

| Type | Name | Purpose |
|------|------|---------|
| 200 | SR (Sender Report) | Sender's packet/byte counts, NTP+RTP timestamp mapping |
| 201 | RR (Receiver Report) | Fraction lost, cumulative lost, jitter, last SR timestamp |
| 202 | SDES | Source description (CNAME, NAME, EMAIL, etc.) |
| 203 | BYE | Session termination |
| 204 | APP | Application-specific data |
| 205 | RTPFB | Transport-layer feedback |
| 206 | PSFB | Payload-specific feedback |

**Key Feedback Messages (types 205/206):**

| FMT | Name | Description |
|-----|------|-------------|
| 1 | NACK | Negative acknowledgement (request retransmission of specific packets) |
| 1 | PLI | Picture Loss Indication (request a new keyframe) |
| 4 | FIR | Full Intra Request (force keyframe from encoder) |
| 15 | REMB | Receiver Estimated Maximum Bitrate |
| 15 | TWCC | Transport-Wide Congestion Control |

### Jitter Buffer

The jitter buffer compensates for network jitter (variation in packet arrival times):

```
Network arrival:     Jitter buffer output:
                     (smooth, regular intervals)
  |   *              |
  |  *               |   *   *   *   *   *   *
  |      *           |
  | *                |
  |        *         |
  |     *            |
  +------time-->     +------time-->

  Packets arrive     Buffer absorbs jitter,
  at irregular       outputs packets at
  intervals          codec clock rate

Buffer too small: Underrun -> glitches, artifacts
Buffer too large: Excessive latency
Adaptive: Adjusts size based on measured jitter
```

**Adaptive jitter buffer algorithm (simplified):**
1. Measure inter-arrival jitter for each packet
2. Maintain exponential moving average of jitter
3. Set buffer target to `mean_delay + k * jitter_estimate`
4. `k` is a tuning parameter (typically 2-4)
5. Grow buffer quickly (prevent underrun), shrink slowly (preserve stability)

---

## 6. SRT (Secure Reliable Transport)

### Overview

SRT (Secure Reliable Transport) was developed by Haivision and open-sourced in 2017
through the SRT Alliance. It is designed for reliable, low-latency video transport
over unpredictable networks (the public internet). SRT is rapidly replacing RTMP
for contribution (encoder-to-server) links.

### Why SRT Over RTMP?

| Feature | RTMP | SRT |
|---------|------|-----|
| Transport | TCP | UDP |
| Error recovery | TCP retransmission | ARQ (selective) |
| Encryption | RTMPS (TLS wrapper) | AES-128/256 built-in |
| Latency control | No | Configurable latency buffer |
| Firewall traversal | Poor (port 1935) | Rendezvous mode |
| Modern codecs | Enhanced RTMP only | Codec-agnostic (MPEG-TS) |
| Bandwidth overhead | TCP overhead | Minimal (selective retransmit) |
| Bonding | No | Yes (link aggregation) |

### SRT Architecture

```
Connection Modes:

1. Caller-Listener (most common):
   Encoder (Caller) ---------> Server (Listener)
   Caller initiates connection to Listener's IP:port

2. Rendezvous (NAT traversal):
   Peer A <------------------> Peer B
   Both sides connect simultaneously
   Works through NATs and firewalls

3. Listener-Caller (reverse):
   Server (Caller) ---------> Encoder (Listener)
   Server pulls from encoder
```

### ARQ-Based Error Recovery

SRT uses Automatic Repeat reQuest (ARQ) instead of TCP's cumulative acknowledgements.
This is more efficient for real-time media because it only retransmits lost packets
rather than stalling the entire stream.

```
Sender                                      Receiver
  |                                            |
  |--- Packet 1 ------------------------------>|  received
  |--- Packet 2 -----------X                   |  lost!
  |--- Packet 3 ------------------------------>|  received
  |--- Packet 4 ------------------------------>|  received
  |                                            |
  |                        |-- detects gap ----|
  |<-- NAK (Packet 2) -------------------------| (negative ack)
  |                                            |
  |--- Packet 2 (retransmit) ----------------->|  received
  |--- Packet 5 ------------------------------>|  received
  |                                            |

Timeline with SRT latency buffer:

  Sender:    [1][2][3][4][ ][5][6]...
                  ^
                  retransmit

  Receiver buffer (latency = 120ms):
  [---120ms buffer window---]
  Packets are held for up to 120ms.
  If retransmit arrives within this window,
  no packet loss is visible to the application.
```

### SRT Latency Configuration

The SRT latency parameter defines the size of the receiver buffer in milliseconds:

- **20ms** - LAN, near-zero packet loss
- **120ms** - Default, good for continental internet
- **500ms** - Intercontinental, high-loss networks
- **2000ms+** - Satellite, extremely lossy links

The latency must be at least 4x the RTT to allow retransmission attempts. SRT
negotiates the higher of the two peers' latency settings.

### AES Encryption

SRT supports AES-128 and AES-256 encryption in CTR mode:

- Encryption is negotiated during the handshake
- A passphrase (10-79 characters) is used to derive the key
- Key material is exchanged using PBKDF2
- Stream Encryption Key (SEK) is rotated periodically
- Even/odd key slots allow seamless key rotation without interruption

### Connection Bonding

SRT supports link bonding (connection groups) for redundancy and aggregation:

**Broadcast mode:** Same data sent over multiple links. Receiver uses first arrival.
Provides seamless failover.

**Backup mode:** Primary link active, secondary on standby. Automatic failover when
primary fails.

**Balancing mode:** Data distributed across links for bandwidth aggregation. Useful
for combining multiple cellular connections.

---

## 7. RIST (Reliable Internet Stream Transport)

### Overview

RIST (Reliable Internet Stream Transport) is a standardized protocol (VSF TR-06)
developed by the Video Services Forum. Like SRT, it provides reliable delivery
over unreliable networks, but it takes a standards-based approach with multiple
interoperable implementations.

### Profile Levels

RIST defines three profile levels of increasing complexity:

| Profile | Features |
|---------|----------|
| **Simple** | ARQ-based error recovery, null-packet deletion, basic authentication |
| **Main** | Adds tunneling, encryption (DTLS), multiplexing, bandwidth bonding |
| **Advanced** | Adds advanced congestion control, header extensions (future) |

### RIST vs SRT Comparison

| Feature | RIST | SRT |
|---------|------|-----|
| Standardization | VSF TR-06 (industry standard) | Open source (de facto standard) |
| Error recovery | ARQ (similar) | ARQ (similar) |
| Encryption | DTLS 1.2 (standard) | AES-CTR (custom) |
| Multiplexing | Native (Main profile) | Single stream per connection |
| Bonding | Yes (Main profile) | Yes (connection groups) |
| NAT traversal | STUN-based (Main profile) | Rendezvous mode |
| Interoperability | Multiple vendors, tested | Single reference implementation |
| Ecosystem | Broadcast vendors | IT/streaming vendors |
| Adoption | Traditional broadcast | OTT/cloud streaming |
| Maturity | Newer (2018+) | Older (2017+), more deployed |

### When to Choose RIST vs SRT

**Choose RIST when:**
- Multi-vendor broadcast infrastructure
- Standards compliance required (regulatory/contractual)
- Need native multiplexing of multiple streams
- Integration with traditional broadcast equipment

**Choose SRT when:**
- OTT/cloud-native infrastructure
- Wider software ecosystem needed (OBS, FFmpeg, etc.)
- Simpler deployment (single connection = single stream)
- Large existing SRT deployment

Both protocols solve the same fundamental problem and perform similarly in most
scenarios. The choice often comes down to ecosystem and organizational preferences.

---

## 8. WHIP/WHEP

### The Problem

WebRTC provides ultra-low-latency (sub-500ms) media delivery, but it was designed
for peer-to-peer communication. Using it for broadcast-style streaming requires:
1. A signaling server (custom implementation)
2. ICE negotiation for each viewer
3. Custom integration with media servers

RTMP ingest is well-established but aging. WHIP and WHEP standardize WebRTC-based
ingest and egress using simple HTTP signaling.

### WHIP (WebRTC-HTTP Ingestion Protocol)

WHIP (IETF RFC 9725) defines a simple HTTP-based protocol for pushing media
into a server using WebRTC.

```
WHIP Ingest Flow:

Encoder/Browser                          WHIP Endpoint
      |                                       |
      |--- POST /whip/stream_key ----------->|
      |    Content-Type: application/sdp      |
      |    Body: SDP offer                    |
      |                                       |
      |<-- 201 Created ----------------------|
      |    Content-Type: application/sdp      |
      |    Location: /whip/resource/abc123    |
      |    Body: SDP answer                   |
      |                                       |
      |<========= ICE connectivity check ====|
      |========= ICE connectivity check ====>|
      |                                       |
      |========= DTLS handshake ============>|
      |<======== DTLS handshake =============|
      |                                       |
      |========= SRTP media data ==========>|
      |                                       |
      |  (to end session)                     |
      |--- DELETE /whip/resource/abc123 ---->|
      |<-- 200 OK ---------------------------|
```

**Key WHIP Features:**
- Single HTTP POST for signaling (SDP offer/answer)
- Bearer token authentication (standard HTTP)
- ICE trickle via HTTP PATCH (optional)
- Resource lifecycle via HTTP DELETE
- Works with standard HTTP infrastructure (CDN, load balancers, proxies)
- CORS-friendly for browser-based ingest

### WHEP (WebRTC-HTTP Egress Protocol)

WHEP is the playback counterpart to WHIP. A viewer sends an SDP offer to the WHEP
endpoint and receives an SDP answer to establish a WebRTC session for receiving media.

```
WHEP Playback Flow:

Player/Browser                           WHEP Endpoint
      |                                       |
      |--- POST /whep/channel_id ----------->|
      |    Content-Type: application/sdp      |
      |    Body: SDP offer                    |
      |                                       |
      |<-- 201 Created ----------------------|
      |    Content-Type: application/sdp      |
      |    Location: /whep/session/xyz789     |
      |    Body: SDP answer                   |
      |                                       |
      |<========= ICE + DTLS handshake ======|
      |                                       |
      |<========= SRTP media data ===========|
      |         (server sends media to player)|
      |                                       |
      |--- DELETE /whep/session/xyz789 ----->|
      |<-- 200 OK ---------------------------|
```

### WHIP/WHEP Replacing RTMP

```
Traditional Workflow:
  Encoder --[RTMP]--> Media Server --[HLS/DASH]--> CDN --> Player
                                      (15-30s latency)

Modern Workflow with WHIP/WHEP:
  Encoder --[WHIP]--> Media Server --[WHEP]--> Player
                                      (< 500ms latency)

Hybrid Workflow:
  Encoder --[WHIP]--> Media Server --[HLS/DASH]--> CDN --> Most Viewers
                           |
                           +-------[WHEP]--> Low-latency Viewers
```

**Advantages over RTMP for ingest:**
- Sub-second latency (vs 1-3s for RTMP)
- Browser-native (no plugins, no Flash)
- Modern codecs (VP8/VP9/AV1/H.264/H.265 via WebRTC)
- Encrypted by default (DTLS-SRTP)
- Works through firewalls (ICE/STUN/TURN)
- Standard HTTP authentication

---

## 9. Comparison Table

### Protocol Comparison

```
+----------+----------+-----------+--------+----------+--------+-----------+
| Protocol | Latency  | Transport | Encrypt| Firewall | Scalab.| Codecs    |
+----------+----------+-----------+--------+----------+--------+-----------+
| RTMP     | 1-5s     | TCP       | TLS    | Poor     | Low    | H.264,AAC |
|          |          | (1935)    | (RTMPS)| (1935)   |        | (+E-RTMP) |
+----------+----------+-----------+--------+----------+--------+-----------+
| HLS      | 6-30s    | HTTP/TCP  | AES-128| Good     | High   | H.264,    |
|          |          | (80/443)  | sample | (HTTP)   | (CDN)  | HEVC,AAC  |
+----------+----------+-----------+--------+----------+--------+-----------+
| LL-HLS   | 2-4s     | HTTP/TCP  | AES-128| Good     | High   | H.264,    |
|          |          | (80/443)  | sample | (HTTP)   | (CDN)  | HEVC,AAC  |
+----------+----------+-----------+--------+----------+--------+-----------+
| DASH     | 6-30s    | HTTP/TCP  | CENC   | Good     | High   | Any       |
|          |          | (80/443)  |        | (HTTP)   | (CDN)  | (agnostic)|
+----------+----------+-----------+--------+----------+--------+-----------+
| LL-DASH  | 2-5s     | HTTP/TCP  | CENC   | Good     | High   | Any       |
|          |          | (80/443)  |        | (HTTP)   | (CDN)  | (agnostic)|
+----------+----------+-----------+--------+----------+--------+-----------+
| RTP/RTSP | <500ms   | UDP+TCP   | SRTP   | Poor     | Low    | Any       |
|          |          | (554+)    |        | (UDP)    |        | (SDP)     |
+----------+----------+-----------+--------+----------+--------+-----------+
| SRT      | 20ms-2s  | UDP       | AES    | Medium   | Low    | Any       |
|          |          | (custom)  | 128/256| (rendez.)| (P2P)  | (MPEG-TS) |
+----------+----------+-----------+--------+----------+--------+-----------+
| RIST     | 20ms-2s  | UDP       | DTLS   | Medium   | Low    | Any       |
|          |          | (custom)  |        | (STUN)   | (P2P)  | (MPEG-TS) |
+----------+----------+-----------+--------+----------+--------+-----------+
| WebRTC   | <500ms   | UDP       | DTLS   | Good     | Low    | VP8,VP9,  |
|          |          | (dynamic) | SRTP   | (ICE)    | (mesh) | H.264,AV1 |
+----------+----------+-----------+--------+----------+--------+-----------+
| WHIP     | <500ms   | UDP+HTTP  | DTLS   | Good     | Medium | VP8,VP9,  |
| (ingest) |          |           | SRTP   | (ICE)    | (SFU)  | H.264,AV1 |
+----------+----------+-----------+--------+----------+--------+-----------+
| WHEP     | <500ms   | UDP+HTTP  | DTLS   | Good     | Medium | VP8,VP9,  |
| (egress) |          |           | SRTP   | (ICE)    | (SFU)  | H.264,AV1 |
+----------+----------+-----------+--------+----------+--------+-----------+
```

### DRM Support by Protocol

```
+----------+------------+------------+------------+
| Protocol | Widevine   | FairPlay   | PlayReady  |
+----------+------------+------------+------------+
| HLS      | No*        | Yes        | No         |
| DASH     | Yes        | No         | Yes        |
| CMAF+HLS | Yes (cbcs) | Yes (cbcs) | Yes (cbcs) |
| CMAF+DASH| Yes (cenc) | No         | Yes (cenc) |
+----------+------------+------------+------------+
* Widevine with HLS requires CMAF (fMP4 segments)
```

### Typical Use Cases

| Use Case | Primary Protocol | Fallback |
|----------|-----------------|----------|
| Live event to millions | HLS / DASH | LL-HLS |
| Sports with low latency | LL-HLS / LL-DASH | WebRTC |
| Video conferencing | WebRTC | -- |
| Game streaming | WebRTC | SRT |
| Encoder to server | SRT / WHIP | RTMP |
| IP camera surveillance | RTSP/RTP | ONVIF |
| VOD (Netflix-style) | DASH (Widevine) | HLS (FairPlay) |
| Social media live | RTMP ingest, HLS delivery | WHIP ingest |
| Auction / betting | WebRTC / WHEP | LL-HLS |
| Broadcast contribution | SRT / RIST | Dedicated fiber |

### Protocol Latency Comparison (ASCII Diagram)

```
Latency (seconds, log scale)
|
|  30s  +------------------------------------------+  Traditional HLS/DASH
|       |//////////////////////////////////////////|
|  15s  +------------------------------------------+
|
|
|   5s  +------------------+                          Tuned HLS/DASH
|       |//////////////////|
|   3s  +------------------+
|
|   2s  +-----------+                                  LL-HLS / LL-DASH
|       |///////////|
|   1s  +-----------+
|
| 500ms +------+                                       SRT / RIST
|       |//////|
| 100ms +------+
|
|  50ms +---+                                          WebRTC / WHIP / WHEP
|       |///|
|  10ms +---+
|
+---------------------------------------------------------------> Protocol
        WebRTC    SRT     LL-HLS   Tuned    Standard
        WHIP/WHEP RIST    LL-DASH  HLS/DASH HLS/DASH
```

---

## 10. Adaptive Bitrate Streaming (ABR)

### How ABR Works

Adaptive Bitrate Streaming dynamically adjusts video quality during playback based
on network conditions and player state. The content is pre-encoded at multiple
quality levels (an encoding ladder), and the player selects which quality to
download for each segment.

```
ABR Decision Flow:

  +-----------+     +------------+     +-------------+
  | Measure   |---->| ABR        |---->| Request     |
  | bandwidth |     | Algorithm  |     | next segment|
  | + buffer  |     | (decision) |     | at chosen   |
  | level     |     |            |     | quality     |
  +-----------+     +------------+     +-------------+
       ^                                      |
       |                                      v
       +----------- feedback loop <-----------+
```

### The Encoding Ladder

An encoding ladder (also called an ABR ladder or bitrate ladder) defines the set
of quality levels available for ABR switching:

```
ABR Encoding Ladder Example:
+------+------------+----------+---------+--------+--------+
| Tier | Resolution | Bitrate  | Codec   | FPS    | Profile|
+------+------------+----------+---------+--------+--------+
|  1   | 426x240    | 400 kbps | H.264   | 24     | Base   |
|  2   | 640x360    | 800 kbps | H.264   | 30     | Main   |
|  3   | 854x480    | 1.4 Mbps | H.264   | 30     | Main   |
|  4   | 1280x720   | 2.8 Mbps | H.264   | 30     | High   |
|  5   | 1920x1080  | 5.0 Mbps | H.264   | 30     | High   |
|  6   | 2560x1440  | 8.0 Mbps | H.264   | 30     | High   |
|  7   | 3840x2160  | 15 Mbps  | H.264   | 30     | High   |
+------+------------+----------+---------+--------+--------+

        Visual representation of the ladder:

        Quality
          ^
  4K      |                                          * Tier 7
          |
  1440p   |                                    * Tier 6
          |
  1080p   |                              * Tier 5
          |
  720p    |                        * Tier 4
          |
  480p    |                  * Tier 3
          |
  360p    |            * Tier 2
          |
  240p    |      * Tier 1
          |
          +--+----+----+----+----+----+----+----+-----> Bitrate
             0.4  0.8  1.4  2.8  5.0  8.0  15   (Mbps)
```

### Per-Title Encoding

Netflix pioneered per-title encoding, where the encoding ladder is customized for
each piece of content based on its complexity:

- **Simple content** (animation, talking heads): Lower bitrates achieve same VMAF
- **Complex content** (action, sports): Higher bitrates needed for same quality
- Convex hull analysis finds the optimal quality-bitrate tradeoff per title
- Extended to per-shot and per-frame encoding in modern systems

### ABR Algorithm Families

**1. Throughput-Based (Rate-Based)**

The simplest approach: measure download throughput and select the highest quality
whose bitrate is below the measured throughput (with a safety margin).

```
Algorithm:
  measured_bw = segment_size / download_time
  safe_bw = measured_bw * 0.85  (15% safety margin)
  selected_quality = max quality where bitrate <= safe_bw

Pros:
  - Simple, reactive
  - Works well for stable connections

Cons:
  - Oscillates on variable networks
  - Throughput estimation is noisy
  - Can cause rebuffering on sudden bandwidth drops
```

**2. Buffer-Based (BBA - Buffer-Based Approach)**

Uses the player's buffer level as the primary signal. Developed by Stanford (Huang
et al., SIGCOMM 2014).

```
Buffer-Based Algorithm:

Quality
  ^
  |  7  +---------+                    +----------+
  |     |         |                    |          |
  |  5  |         +---------+         |          |
  |     |         |         |         |          |
  |  3  |         |         +----+    |          |
  |     |         |         |    |    |          |
  |  1  +---------+---------+----+----+----------+
  |     |         |         |    |    |          |
  +-----+---------+---------+----+----+----------+-> Buffer (s)
     0     R_min     mid    high    B_max
           (8s)     (20s)  (30s)   (60s)

  - Buffer < R_min: Select lowest quality (prevent rebuffer)
  - Buffer > B_max: Select highest quality (buffer is healthy)
  - Between: Linear or stepped mapping from buffer to quality
```

**3. Hybrid Approaches**

Modern ABR algorithms combine throughput and buffer signals. Examples:

- **MPC (Model Predictive Control):** Uses throughput prediction and buffer model
  to solve an optimization problem over a planning horizon of N future segments.
  Maximizes QoE (quality, switches, rebuffering).

- **BOLA (Buffer Occupancy based Lyapunov Algorithm):** Uses Lyapunov optimization
  theory to maximize a utility function balancing quality and rebuffering risk.
  Used in dash.js reference player.

- **Pensieve (MIT):** Uses reinforcement learning to train an ABR policy on
  network traces. The neural network takes bandwidth history, buffer level,
  and past quality as inputs and outputs the quality level for the next segment.

- **L2A (Learn2Adapt):** Online learning approach that adapts to current network
  conditions without requiring offline training data.

### Quality of Experience (QoE) Metrics

ABR algorithms optimize for a composite QoE score:

```
QoE = w1 * quality - w2 * rebuffering - w3 * quality_switches - w4 * startup_delay

Where:
  quality          = average VMAF/PSNR/bitrate over session
  rebuffering      = total rebuffering duration (seconds)
  quality_switches = number or magnitude of quality changes
  startup_delay    = time from click to first frame

Typical weights (example):
  w1 = 1.0  (quality reward)
  w2 = 3.0  (rebuffering penalty, heavily penalized)
  w3 = 0.5  (switching penalty)
  w4 = 0.5  (startup penalty)
```

**Key QoE Metrics:**

| Metric | Description | Target |
|--------|-------------|--------|
| VMAF | Video Multi-Method Assessment Fusion (0-100) | > 80 |
| PSNR | Peak Signal-to-Noise Ratio (dB) | > 35 dB |
| SSIM | Structural Similarity Index (0-1) | > 0.95 |
| Time to First Frame | Startup latency | < 2 seconds |
| Rebuffer Ratio | Rebuffer time / total time | < 1% |
| Bitrate Utilization | Delivered bitrate / available bandwidth | > 80% |
| Quality Stability | 1 - (switch_count / segment_count) | > 90% |

---

## 11. DRM (Digital Rights Management)

### The DRM Ecosystem

DRM systems protect content from unauthorized copying and redistribution. Three
major DRM systems dominate the streaming industry:

```
DRM Ecosystem:

+------------------------------------------------------------------+
|                       Browser / App                               |
|  +-----------+     +--------+     +----------+     +-----------+ |
|  |  Player   |---->|  EME   |---->|   CDM    |---->| Decrypted | |
|  | (dash.js, |     |  API   |     | (Content |     | frames    | |
|  |  hls.js)  |     |        |     | Decrypt  |     | (rendered)| |
|  +-----------+     +--------+     | Module)  |     +-----------+ |
|                                   +----------+                    |
+------------------------------------------------------------------+
        |                                 ^
        |  1. License request             |  2. License response
        v                                 |
+------------------------------------------------------------------+
|                    License Server                                 |
|  +------------------+  +------------------+  +-----------------+ |
|  |    Widevine      |  |    FairPlay      |  |   PlayReady     | |
|  |  (Google)        |  |    (Apple)       |  |   (Microsoft)   | |
|  +------------------+  +------------------+  +-----------------+ |
+------------------------------------------------------------------+
```

### Widevine

Developed by Google, Widevine is the most widely deployed DRM for web and Android.

**Security Levels:**
- **L1:** Hardware-based decryption and rendering. Required for HD/4K. Keys never
  leave the TEE (Trusted Execution Environment). Available on Android, ChromeOS,
  smart TVs.
- **L2:** Hardware-based decryption only. Rendering in software.
- **L3:** Software-only. Used in Chrome browser on desktop. Limited to SD quality
  by most content providers.

**License Flow:**
1. Player detects encrypted content (PSSH box in init segment)
2. EME `encrypted` event fires
3. Player creates `MediaKeySession` with Widevine CDM
4. CDM generates license request (challenge)
5. Player sends challenge to license server
6. License server validates entitlement and returns keys
7. CDM decrypts content using received keys

### FairPlay Streaming (FPS)

Apple's DRM for Safari, iOS, tvOS, and macOS.

**Key Differences from Widevine:**
- Uses HLS with SAMPLE-AES or SAMPLE-AES-CTR encryption
- Key delivery via custom `skd://` URI in `#EXT-X-KEY` tag
- Requires Apple-issued FPS Deployment Package
- Server Playback Context (SPC) / Content Key Context (CKC) exchange
- Hardware-level security on Apple devices

**HLS with FairPlay:**
```
#EXT-X-KEY:METHOD=SAMPLE-AES,URI="skd://content_id",
KEYFORMAT="com.apple.streamingkeydelivery",
KEYFORMATVERSIONS="1"
```

### PlayReady

Microsoft's DRM for Edge, Windows, Xbox, and many smart TVs.

**Security Levels:**
- **SL3000:** Hardware TEE (similar to Widevine L1)
- **SL2000:** Software with hardware root of trust
- **SL150:** Software-only

**PlayReady features:**
- License chaining (root + leaf licenses)
- Domain-based licensing (share across devices)
- Secure stop (confirm playback ended)
- Output protection (HDCP enforcement)

### Common Encryption (CENC)

ISO/IEC 23001-7 defines Common Encryption, allowing a single encryption of content
to work with multiple DRM systems:

```
CENC Encryption Schemes:

+--------+-------------------+----------------------------+
| Scheme | Description       | DRM Support                |
+--------+-------------------+----------------------------+
| cenc   | AES-128 CTR mode  | Widevine, PlayReady        |
|        | Full sample       |                            |
+--------+-------------------+----------------------------+
| cbc1   | AES-128 CBC mode  | (rarely used)              |
|        | Full sample       |                            |
+--------+-------------------+----------------------------+
| cens   | AES-128 CTR mode  | Widevine, PlayReady        |
|        | Subsample (pattern)|                           |
+--------+-------------------+----------------------------+
| cbcs   | AES-128 CBC mode  | Widevine, FairPlay,        |
|        | Subsample (pattern)| PlayReady                 |
+--------+-------------------+----------------------------+

cbcs is the most universal scheme, supporting all three major DRMs.
```

**PSSH Box (Protection System Specific Header):**

The PSSH box in the initialization segment contains DRM-specific data:

```
PSSH Box Structure:
+------------------+
| Box Size         |
| Box Type: 'pssh' |
| Version          |
| Flags            |
| System ID (GUID) |  <-- Identifies DRM system
| Data Size        |
| Data             |  <-- DRM-specific init data
+------------------+

System IDs:
  Widevine:  edef8ba9-79d6-4ace-a3c8-27dcd51d21ed
  FairPlay:  94ce86fb-07ff-4f43-adb8-93d2fa968ca2
  PlayReady: 9a04f079-9840-4286-ab92-e65be0885f95
```

### EME (Encrypted Media Extensions)

EME is the W3C API that allows web browsers to interact with DRM systems:

```javascript
// EME workflow (simplified)
async function setupDRM(video, initData) {
  // 1. Request access to a key system
  const keySystemAccess = await navigator.requestMediaKeySystemAccess(
    'com.widevine.alpha',
    [{
      initDataTypes: ['cenc'],
      videoCapabilities: [{
        contentType: 'video/mp4;codecs="avc1.640028"',
        robustness: 'SW_SECURE_DECODE'
      }],
      audioCapabilities: [{
        contentType: 'audio/mp4;codecs="mp4a.40.2"'
      }]
    }]
  );

  // 2. Create MediaKeys and set on video element
  const mediaKeys = await keySystemAccess.createMediaKeys();
  await video.setMediaKeys(mediaKeys);

  // 3. Create a key session
  const session = mediaKeys.createSession();

  // 4. Listen for license requests
  session.addEventListener('message', async (event) => {
    // 5. Send license request to license server
    const response = await fetch('https://license.example.com/widevine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: event.message
    });
    const license = await response.arrayBuffer();

    // 6. Provide license to CDM
    await session.update(license);
  });

  // 7. Generate license request from init data
  await session.generateRequest('cenc', initData);
}
```

### Multi-DRM Strategy

Most streaming services use multiple DRM systems to cover all platforms:

```
Platform Coverage:

+--------------------+-----------+----------+-----------+
| Platform           | Widevine  | FairPlay | PlayReady |
+--------------------+-----------+----------+-----------+
| Chrome (all OS)    |     X     |          |           |
| Firefox            |     X     |          |           |
| Safari (macOS/iOS) |           |    X     |           |
| Edge (Windows)     |     X     |          |     X     |
| Android            |     X     |          |           |
| iOS/tvOS           |           |    X     |           |
| Smart TVs (Samsung)|     X     |          |     X     |
| Smart TVs (LG)     |     X     |          |           |
| Roku               |           |          |     X     |
| Xbox               |           |          |     X     |
| PlayStation        |           |          |     X     |
+--------------------+-----------+----------+-----------+

Minimum coverage: Widevine + FairPlay = ~95% of devices
Full coverage:    Widevine + FairPlay + PlayReady = ~99%
```

---

## 12. Code Examples

### Creating an HLS Stream with FFmpeg

**Basic HLS from a file (VOD):**

```bash
ffmpeg -i input.mp4 \
  -codec:v libx264 -preset fast -crf 22 \
  -codec:a aac -b:a 128k \
  -hls_time 6 \
  -hls_list_size 0 \
  -hls_segment_type mpegts \
  -hls_flags independent_segments \
  -f hls output.m3u8
```

**Multi-bitrate HLS with master playlist:**

```bash
#!/bin/bash
INPUT="input.mp4"
OUTPUT_DIR="./hls_output"
mkdir -p "$OUTPUT_DIR"

# Encoding ladder
ffmpeg -i "$INPUT" \
  -filter_complex \
    "[0:v]split=4[v360][v480][v720][v1080]; \
     [v360]scale=640:360[v360out]; \
     [v480]scale=854:480[v480out]; \
     [v720]scale=1280:720[v720out]; \
     [v1080]scale=1920:1080[v1080out]" \
  \
  -map "[v360out]" -map 0:a -c:v libx264 -b:v 800k -maxrate 856k \
    -bufsize 1200k -preset fast -g 48 -keyint_min 48 -sc_threshold 0 \
    -c:a aac -b:a 96k -ar 44100 \
    -hls_time 6 -hls_playlist_type vod \
    -hls_segment_filename "$OUTPUT_DIR/360p_%03d.ts" \
    "$OUTPUT_DIR/360p.m3u8" \
  \
  -map "[v480out]" -map 0:a -c:v libx264 -b:v 1400k -maxrate 1498k \
    -bufsize 2100k -preset fast -g 48 -keyint_min 48 -sc_threshold 0 \
    -c:a aac -b:a 128k -ar 44100 \
    -hls_time 6 -hls_playlist_type vod \
    -hls_segment_filename "$OUTPUT_DIR/480p_%03d.ts" \
    "$OUTPUT_DIR/480p.m3u8" \
  \
  -map "[v720out]" -map 0:a -c:v libx264 -b:v 2800k -maxrate 2996k \
    -bufsize 4200k -preset fast -g 48 -keyint_min 48 -sc_threshold 0 \
    -c:a aac -b:a 128k -ar 44100 \
    -hls_time 6 -hls_playlist_type vod \
    -hls_segment_filename "$OUTPUT_DIR/720p_%03d.ts" \
    "$OUTPUT_DIR/720p.m3u8" \
  \
  -map "[v1080out]" -map 0:a -c:v libx264 -b:v 5000k -maxrate 5350k \
    -bufsize 7500k -preset fast -g 48 -keyint_min 48 -sc_threshold 0 \
    -c:a aac -b:a 192k -ar 44100 \
    -hls_time 6 -hls_playlist_type vod \
    -hls_segment_filename "$OUTPUT_DIR/1080p_%03d.ts" \
    "$OUTPUT_DIR/1080p.m3u8"

# Create master playlist
cat > "$OUTPUT_DIR/master.m3u8" << 'PLAYLIST'
#EXTM3U
#EXT-X-VERSION:3

#EXT-X-STREAM-INF:BANDWIDTH=896000,RESOLUTION=640x360
360p.m3u8

#EXT-X-STREAM-INF:BANDWIDTH=1528000,RESOLUTION=854x480
480p.m3u8

#EXT-X-STREAM-INF:BANDWIDTH=2928000,RESOLUTION=1280x720
720p.m3u8

#EXT-X-STREAM-INF:BANDWIDTH=5192000,RESOLUTION=1920x1080
1080p.m3u8
PLAYLIST

echo "HLS output ready in $OUTPUT_DIR"
```

**Live HLS from RTMP ingest (using FFmpeg as a simple media server):**

```bash
# Start FFmpeg as RTMP listener that outputs HLS
ffmpeg -listen 1 -i rtmp://0.0.0.0:1935/live/stream \
  -c:v libx264 -preset veryfast -tune zerolatency \
  -b:v 2500k -maxrate 2675k -bufsize 3750k \
  -g 30 -keyint_min 30 -sc_threshold 0 \
  -c:a aac -b:a 128k -ar 44100 \
  -f hls \
  -hls_time 4 \
  -hls_list_size 5 \
  -hls_flags delete_segments+append_list \
  -hls_segment_type fmp4 \
  -hls_fmp4_init_filename init.mp4 \
  /var/www/html/live/stream.m3u8
```

### Simple RTMP Ingest with Nginx-RTMP

**nginx.conf:**

```nginx
worker_processes auto;

events {
    worker_connections 1024;
}

rtmp {
    server {
        listen 1935;
        chunk_size 4096;

        application live {
            live on;
            record off;

            # Authentication via on_publish callback
            on_publish http://auth-server:8080/auth;

            # Transcode to HLS
            exec_push ffmpeg -i rtmp://localhost/live/$name
                -c:v libx264 -preset veryfast -tune zerolatency
                -b:v 2500k -g 60 -keyint_min 60 -sc_threshold 0
                -c:a aac -b:a 128k
                -f flv rtmp://localhost/hls/$name;
        }

        application hls {
            live on;
            hls on;
            hls_path /var/www/html/hls;
            hls_fragment 4s;
            hls_playlist_length 20s;

            # Multi-bitrate variants
            hls_variant _360p BANDWIDTH=800000 RESOLUTION=640x360;
            hls_variant _480p BANDWIDTH=1400000 RESOLUTION=854x480;
            hls_variant _720p BANDWIDTH=2800000 RESOLUTION=1280x720;
            hls_variant _1080p BANDWIDTH=5000000 RESOLUTION=1920x1080;
        }
    }
}

http {
    server {
        listen 8080;

        location /hls {
            alias /var/www/html/hls;
            types {
                application/vnd.apple.mpegurl m3u8;
                video/mp2t ts;
            }
            add_header Cache-Control no-cache;
            add_header Access-Control-Allow-Origin *;
        }
    }
}
```

### SRT Listener and Caller

**SRT Listener (receiver/server) with FFmpeg:**

```bash
# Start SRT listener on port 9000
# Receive SRT stream and output HLS
ffmpeg -i "srt://0.0.0.0:9000?mode=listener&latency=120000&passphrase=MySecretKey123" \
  -c:v libx264 -preset veryfast -tune zerolatency \
  -b:v 3000k -g 60 -keyint_min 60 \
  -c:a aac -b:a 128k \
  -f hls \
  -hls_time 4 \
  -hls_list_size 5 \
  -hls_flags delete_segments \
  /var/www/html/live/stream.m3u8
```

**SRT Caller (sender/encoder) with FFmpeg:**

```bash
# Send local file via SRT to a listener
ffmpeg -re -i input.mp4 \
  -c:v libx264 -preset veryfast -tune zerolatency \
  -b:v 3000k -maxrate 3210k -bufsize 4500k \
  -g 60 -keyint_min 60 \
  -c:a aac -b:a 128k \
  -f mpegts \
  "srt://server.example.com:9000?mode=caller&latency=120000&passphrase=MySecretKey123"
```

**SRT Rendezvous mode (both peers connect simultaneously):**

```bash
# Peer A
ffmpeg -re -i input.mp4 \
  -c copy -f mpegts \
  "srt://peer-b.example.com:9000?mode=rendezvous&latency=200000"

# Peer B
ffplay "srt://peer-a.example.com:9000?mode=rendezvous&latency=200000"
```

### SRT with srt-live-transmit

The `srt-live-transmit` tool from the SRT project is useful for protocol conversion:

```bash
# RTMP to SRT bridge
# Receive RTMP, forward as SRT
srt-live-transmit "rtmp://localhost/live/stream" \
  "srt://:9000?mode=listener&latency=120000" -v

# SRT to UDP (for legacy equipment)
srt-live-transmit \
  "srt://source:9000?mode=caller&latency=120000" \
  "udp://239.0.0.1:5000" -v

# SRT relay (receive and re-transmit)
srt-live-transmit \
  "srt://source:9000?mode=caller" \
  "srt://:9001?mode=listener" -v
```

### WHIP Ingest from Browser

```javascript
async function startWHIPStream(whipEndpoint, authToken) {
  // 1. Get user media
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 1280, height: 720, frameRate: 30 },
    audio: { sampleRate: 48000, channelCount: 2 }
  });

  // 2. Create RTCPeerConnection
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    bundlePolicy: 'max-bundle'
  });

  // 3. Add tracks (send-only)
  const videoTrack = stream.getVideoTracks()[0];
  const audioTrack = stream.getAudioTracks()[0];

  const videoSender = pc.addTransceiver(videoTrack, {
    direction: 'sendonly',
    sendEncodings: [
      { rid: 'h', maxBitrate: 2500000 },
      { rid: 'l', maxBitrate: 500000, scaleResolutionDownBy: 4 }
    ]
  });

  pc.addTransceiver(audioTrack, { direction: 'sendonly' });

  // 4. Create and set local offer
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  // 5. Wait for ICE gathering to complete
  await new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') {
      resolve();
    } else {
      pc.addEventListener('icegatheringstatechange', () => {
        if (pc.iceGatheringState === 'complete') resolve();
      });
    }
  });

  // 6. Send SDP offer to WHIP endpoint
  const response = await fetch(whipEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/sdp',
      'Authorization': `Bearer ${authToken}`
    },
    body: pc.localDescription.sdp
  });

  if (response.status !== 201) {
    throw new Error(`WHIP error: ${response.status} ${response.statusText}`);
  }

  // 7. Set remote SDP answer
  const answerSDP = await response.text();
  const resourceURL = response.headers.get('Location');

  await pc.setRemoteDescription({
    type: 'answer',
    sdp: answerSDP
  });

  // 8. Return cleanup function
  return {
    resourceURL,
    stop: async () => {
      pc.close();
      stream.getTracks().forEach(track => track.stop());
      // Delete the WHIP resource
      await fetch(resourceURL, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
    }
  };
}

// Usage
const session = await startWHIPStream(
  'https://media-server.example.com/whip/my-stream',
  'my-auth-token'
);

// Later, to stop streaming:
await session.stop();
```

### WHEP Playback from Browser

```javascript
async function startWHEPPlayback(whepEndpoint, videoElement, authToken) {
  // 1. Create RTCPeerConnection
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    bundlePolicy: 'max-bundle'
  });

  // 2. Set up receive-only transceivers
  pc.addTransceiver('video', { direction: 'recvonly' });
  pc.addTransceiver('audio', { direction: 'recvonly' });

  // 3. Handle incoming tracks
  pc.addEventListener('track', (event) => {
    if (event.streams && event.streams[0]) {
      videoElement.srcObject = event.streams[0];
    }
  });

  // 4. Create and set local offer
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  // 5. Wait for ICE gathering
  await new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') {
      resolve();
    } else {
      pc.addEventListener('icegatheringstatechange', () => {
        if (pc.iceGatheringState === 'complete') resolve();
      });
    }
  });

  // 6. Send offer to WHEP endpoint
  const response = await fetch(whepEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/sdp',
      'Authorization': `Bearer ${authToken}`
    },
    body: pc.localDescription.sdp
  });

  if (response.status !== 201) {
    throw new Error(`WHEP error: ${response.status}`);
  }

  // 7. Apply answer
  const answerSDP = await response.text();
  const resourceURL = response.headers.get('Location');

  await pc.setRemoteDescription({
    type: 'answer',
    sdp: answerSDP
  });

  // 8. Return session info
  return {
    peerConnection: pc,
    resourceURL,
    stop: async () => {
      pc.close();
      videoElement.srcObject = null;
      await fetch(resourceURL, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
    }
  };
}

// Usage
const video = document.getElementById('player');
const playback = await startWHEPPlayback(
  'https://media-server.example.com/whep/my-stream',
  video,
  'viewer-auth-token'
);
```

### DASH Packaging with Shaka Packager

```bash
# Package a multi-bitrate DASH stream with DRM

# Step 1: Encode multiple bitrates
for res in 360 480 720 1080; do
  ffmpeg -i input.mp4 \
    -vf "scale=-2:${res}" \
    -c:v libx264 -preset medium \
    -b:v $(echo "$res * 3" | bc)k \
    -g 48 -keyint_min 48 \
    -c:a aac -b:a 128k \
    -movflags +faststart \
    "intermediate_${res}p.mp4"
done

# Step 2: Package with Shaka Packager
packager \
  in=intermediate_360p.mp4,stream=video,output=video_360p.mp4,drm_label=SD \
  in=intermediate_480p.mp4,stream=video,output=video_480p.mp4,drm_label=SD \
  in=intermediate_720p.mp4,stream=video,output=video_720p.mp4,drm_label=HD \
  in=intermediate_1080p.mp4,stream=video,output=video_1080p.mp4,drm_label=HD \
  in=intermediate_360p.mp4,stream=audio,output=audio.mp4,drm_label=AUDIO \
  --mpd_output manifest.mpd \
  --segment_duration 6 \
  --fragment_duration 2 \
  --protection_scheme cbcs \
  --protection_systems Widevine,PlayReady \
  --keys label=SD:key_id=<key_id_sd>:key=<key_sd>,label=HD:key_id=<key_id_hd>:key=<key_hd>,label=AUDIO:key_id=<key_id_audio>:key=<key_audio>
```

### Monitoring Stream Health

```bash
# Check HLS stream health with ffprobe
ffprobe -v quiet -print_format json -show_format -show_streams \
  "https://cdn.example.com/live/master.m3u8"

# Validate HLS playlist syntax
# Apple's mediastreamvalidator (macOS)
mediastreamvalidator "https://cdn.example.com/live/master.m3u8"

# Monitor SRT connection statistics
srt-live-transmit "srt://source:9000" "file://con" -s 1000 -v 2>&1 | \
  grep -E "(STATS|lost|retrans|rtt)"

# FFmpeg SRT stats (enabled via stats URL parameter)
ffmpeg -i "srt://source:9000?mode=caller&latency=120000&stats=1" \
  -f null /dev/null 2>&1 | grep -i srt
```

---

## Summary

The streaming protocol landscape reflects a clear evolution:

1. **RTMP** pioneered live streaming but is limited to ingest today due to Flash's demise
   and TCP-only transport. Enhanced RTMP extends its codec support.

2. **HLS and DASH** dominate last-mile delivery through HTTP-based adaptive streaming.
   LL-HLS and LL-DASH bring latency down to 2-4 seconds while maintaining CDN scalability.

3. **RTSP/RTP** remain essential for IP cameras, surveillance, and real-time applications
   where sub-second latency over UDP is required.

4. **SRT and RIST** are replacing RTMP for contribution links, providing reliable
   delivery over the public internet with built-in encryption and error recovery.

5. **WHIP/WHEP** bring WebRTC's sub-500ms latency to broadcast workflows, standardizing
   ingest and egress with simple HTTP signaling.

6. **ABR algorithms** continue to advance, with machine learning approaches like
   Pensieve showing that data-driven methods can outperform hand-tuned heuristics.

7. **DRM** remains fragmented across three major systems (Widevine, FairPlay, PlayReady),
   but CMAF with cbcs encryption provides a common encrypted format that works with all
   three.

The trend is clear: the industry is converging on HTTP-based delivery for scalability,
WebRTC-based protocols for ultra-low latency, and SRT/RIST for reliable contribution
over the internet. Understanding all layers of this stack -- from protocol handshakes to
ABR algorithms to DRM key exchange -- is essential for building robust streaming systems.
