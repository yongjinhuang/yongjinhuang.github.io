# GStreamer Pipelines: A Comprehensive Guide

## Table of Contents

1. [What is GStreamer](#1-what-is-gstreamer)
2. [Core Concepts](#2-core-concepts)
3. [Element Types](#3-element-types)
4. [gst-launch-1.0](#4-gst-launch-10)
5. [Plugin System](#5-plugin-system)
6. [Common Pipelines](#6-common-pipelines)
7. [Dynamic Pipelines](#7-dynamic-pipelines)
8. [Programming with GStreamer](#8-programming-with-gstreamer)
9. [GStreamer for WebRTC](#9-gstreamer-for-webrtc)
10. [GStreamer for Streaming](#10-gstreamer-for-streaming)
11. [Debugging](#11-debugging)
12. [Comparison: GStreamer vs FFmpeg](#12-comparison-gstreamer-vs-ffmpeg)
13. [Common Interview Questions](#13-common-interview-questions)

---

## 1. What is GStreamer

### History

GStreamer was created by Erik Walthinsen in 1999 and has since become the foundational multimedia framework for the Linux desktop. It powers media playback in GNOME (via Totem), is the backbone of PipeWire (the modern replacement for PulseAudio and JACK), and is used in production by companies including Collabora, Centricular, Igalia, and Fluendo. The 1.0 stable API was released in 2012 and remains the current major version, with regular minor releases adding features while preserving backward compatibility.

### Design Philosophy

GStreamer is a **pipeline-based multimedia framework**. The central idea is that media processing is modeled as a directed acyclic graph (DAG) of processing elements connected by typed links. Data flows from sources through filters, encoders, muxers, and eventually to sinks. This design provides:

- **Modularity**: Each element does one thing well. You compose complex behavior by linking elements.
- **Reusability**: The same decoder element works whether you are playing a local file, streaming over RTSP, or transcoding.
- **Type Safety**: Connections between elements are negotiated through a capabilities (caps) system that ensures format compatibility.
- **Thread Safety**: Queues and the internal scheduling system manage threading automatically.

### GObject/GLib Foundation

GStreamer is built on top of **GLib** and its object system **GObject**. This gives GStreamer:

- A reference-counted object hierarchy with properties, signals, and introspection.
- Language bindings for nearly every language via **GObject Introspection (GI)**. Python, Rust, JavaScript, C#, and others can all use GStreamer natively.
- A main loop and event system (GMainLoop) that integrates with the GStreamer bus for message handling.

Every GStreamer element is a GObject subclass. Properties are set via `g_object_set()`, and signals (like "pad-added" on a demuxer) are connected via `g_signal_connect()`.

### GStreamer vs FFmpeg at a Glance

| Aspect            | GStreamer                         | FFmpeg                          |
| ----------------- | --------------------------------- | ------------------------------- |
| Architecture      | Pipeline graph of elements        | Monolithic library + CLI tool   |
| Primary use       | Real-time streaming, applications | Transcoding, file conversion    |
| API style         | GObject-based, event-driven       | C function calls, procedural    |
| Extensibility     | Plugin system, dynamic loading    | Compile-time codec selection    |
| Language bindings | Excellent (GI-based)              | Limited (C API, wrappers exist) |
| WebRTC support    | Built-in (webrtcbin)              | None                            |
| Latency control   | Fine-grained pipeline tuning      | Moderate                        |
| Learning curve    | Steeper (concepts to learn)       | Lower for simple tasks          |

Use **FFmpeg** when you need a quick command-line transcode or batch file conversion. Use **GStreamer** when you are building an application that needs real-time media processing, dynamic pipeline reconfiguration, or WebRTC integration.

---

## 2. Core Concepts

### Elements

An **element** is the fundamental building block of GStreamer. Every element performs a single, well-defined function:

- A `filesrc` element reads bytes from a file.
- An `h264parse` element parses an H.264 byte stream into NAL units.
- An `x264enc` element encodes raw video into H.264.
- An `autoaudiosink` element plays audio through the system audio output.

Elements are created by name from a factory:

```
gst_element_factory_make("filesrc", "my-source");
```

### Pads

**Pads** are the element's connection points. Data enters through **sink pads** and exits through **src pads** (the naming convention follows the direction of data flow, not the element's role).

Pad availability types:

| Type          | Description                                         | Example                                              |
| ------------- | --------------------------------------------------- | ---------------------------------------------------- |
| **Always**    | Exists as long as the element exists                | `filesrc` has an always src pad                      |
| **Sometimes** | Created dynamically based on media content          | `qtdemux` creates src pads when it discovers streams |
| **Request**   | Created on demand when requested by the application | `tee` creates src pads when you request them         |

"Sometimes" pads are the most common source of confusion. A demuxer does not know how many streams exist until it reads the container header. You must connect to the `pad-added` signal to link these pads dynamically.

### Capabilities (Caps)

**Caps** describe the type of data that flows through a pad. They are structured as a media type with optional parameters:

```
video/x-raw, format=I420, width=1920, height=1080, framerate=30/1
audio/x-raw, format=S16LE, rate=44100, channels=2
video/x-h264, stream-format=byte-stream, alignment=au
```

Caps can be **fixed** (all fields have a single value) or **unfixed** (fields have ranges or lists). Negotiation is the process by which linked elements agree on a single fixed caps.

### Caps Negotiation

When elements are linked, they negotiate a compatible format. The process works upstream and downstream:

1. The downstream element advertises what formats it accepts (via its sink pad template caps).
2. The upstream element advertises what formats it can produce (via its src pad template caps).
3. The intersection of these sets is computed.
4. One specific format is chosen from the intersection.

You can force specific caps using a `capsfilter` element:

```bash
gst-launch-1.0 videotestsrc ! "video/x-raw,width=640,height=480" ! autovideosink
```

### Pipeline State Machine

Every element (and the pipeline as a whole) has a state. The states form a strict hierarchy:

```
NULL  -->  READY  -->  PAUSED  -->  PLAYING
                                      |
NULL  <--  READY  <--  PAUSED  <------+
```

| State       | Description                                                                    |
| ----------- | ------------------------------------------------------------------------------ |
| **NULL**    | Default state. No resources allocated.                                         |
| **READY**   | Resources allocated (devices opened, buffers created), but no data flowing.    |
| **PAUSED**  | Data is pre-rolled (first buffer has reached sinks), but clock is not running. |
| **PLAYING** | Clock is running, data flows and is rendered in real time.                     |

State changes are **asynchronous**. When you call `gst_element_set_state(pipeline, GST_STATE_PLAYING)`, the return value is `GST_STATE_CHANGE_ASYNC` if the change has not completed yet. The transition from NULL to PLAYING passes through READY and PAUSED along the way.

A key property: in the **PAUSED** state, sinks have pre-rolled (they hold one buffer). This is why you can seek in a paused pipeline and see the resulting frame immediately.

### Bus and Messages

The **bus** is the message delivery system. Elements post messages to the bus, and the application reads them. Important message types:

| Message                     | Meaning                                                   |
| --------------------------- | --------------------------------------------------------- |
| `GST_MESSAGE_EOS`           | End of stream. All data has been processed.               |
| `GST_MESSAGE_ERROR`         | A fatal error occurred. Contains GError and debug string. |
| `GST_MESSAGE_WARNING`       | A non-fatal warning.                                      |
| `GST_MESSAGE_STATE_CHANGED` | An element changed state.                                 |
| `GST_MESSAGE_BUFFERING`     | Network stream is buffering. Contains percentage.         |
| `GST_MESSAGE_TAG`           | Metadata tags discovered (title, artist, etc.).           |
| `GST_MESSAGE_LATENCY`       | Latency has changed; pipeline should recalculate.         |
| `GST_MESSAGE_QOS`           | Quality of service event (dropped frames, etc.).          |

In a typical application loop:

```c
GstBus *bus = gst_element_get_bus(pipeline);
GstMessage *msg = gst_bus_timed_pop_filtered(bus, GST_CLOCK_TIME_NONE,
    GST_MESSAGE_ERROR | GST_MESSAGE_EOS);
```

Or using a GMainLoop with `gst_bus_add_watch()` for asynchronous handling.

---

## 3. Element Types

### Sources

Sources produce data. They have only **src pads** (no sink pads).

| Element        | Description                                                                                        |
| -------------- | -------------------------------------------------------------------------------------------------- |
| `filesrc`      | Reads from a local file. Property: `location`.                                                     |
| `v4l2src`      | Captures from a Video4Linux2 camera device. Property: `device=/dev/video0`.                        |
| `pulsesrc`     | Captures audio from PulseAudio.                                                                    |
| `alsasrc`      | Captures audio from ALSA directly.                                                                 |
| `udpsrc`       | Receives UDP packets. Properties: `port`, `address`, `caps`.                                       |
| `rtspsrc`      | RTSP client source. Handles SDP, RTCP, and transport negotiation. Property: `location=rtsp://...`. |
| `souphttpsrc`  | HTTP/HTTPS source using libsoup. Property: `location=https://...`.                                 |
| `videotestsrc` | Generates test video patterns. Property: `pattern`.                                                |
| `audiotestsrc` | Generates test audio tones. Properties: `freq`, `wave`.                                            |
| `appsrc`       | Application-provided data source (push or pull mode). Used for custom data injection.              |
| `ximagesrc`    | Captures the X11 screen.                                                                           |

### Sinks

Sinks consume data. They have only **sink pads** (no src pads).

| Element         | Description                                                         |
| --------------- | ------------------------------------------------------------------- |
| `filesink`      | Writes to a local file. Property: `location`.                       |
| `autovideosink` | Automatically selects the best video output (X11, Wayland, OpenGL). |
| `autoaudiosink` | Automatically selects the best audio output.                        |
| `ximagesink`    | Renders video to an X11 window.                                     |
| `waylandsink`   | Renders video to a Wayland surface.                                 |
| `pulsesink`     | Plays audio through PulseAudio.                                     |
| `alsasink`      | Plays audio through ALSA directly.                                  |
| `udpsink`       | Sends data as UDP packets. Properties: `host`, `port`.              |
| `appsink`       | Delivers buffers to the application (pull mode or callbacks).       |
| `fakesink`      | Discards all data. Useful for benchmarking and debugging.           |

### Filters and Converters

These elements transform data, having both sink and src pads.

| Element         | Description                                                         |
| --------------- | ------------------------------------------------------------------- |
| `videoconvert`  | Converts between video color formats (e.g., I420 to BGRA).          |
| `videoscale`    | Scales video resolution.                                            |
| `videorate`     | Adjusts frame rate by duplicating or dropping frames.               |
| `audioconvert`  | Converts between audio formats (int to float, channel count, etc.). |
| `audioresample` | Resamples audio to a different sample rate.                         |
| `capsfilter`    | Forces specific caps on the link. No data transformation occurs.    |
| `volume`        | Adjusts audio volume. Property: `volume` (1.0 = 100%).              |
| `videoflip`     | Flips or rotates video. Property: `method`.                         |
| `videocrop`     | Crops video. Properties: `top`, `bottom`, `left`, `right`.          |
| `deinterlace`   | Deinterlaces video.                                                 |

### Muxers and Demuxers

| Element         | Description                          |
| --------------- | ------------------------------------ |
| `qtdemux`       | Demuxes MP4/QuickTime containers.    |
| `matroskademux` | Demuxes Matroska/WebM containers.    |
| `tsdemux`       | Demuxes MPEG-TS streams.             |
| `mp4mux`        | Muxes into MP4 container.            |
| `matroskamux`   | Muxes into Matroska container.       |
| `webmmux`       | Muxes into WebM container.           |
| `mpegtsmux`     | Muxes into MPEG-TS container.        |
| `flvmux`        | Muxes into FLV container (for RTMP). |

### Encoders and Decoders

| Element                   | Description                                 |
| ------------------------- | ------------------------------------------- |
| `x264enc`                 | Encodes video to H.264 (software, libx264). |
| `x265enc`                 | Encodes video to H.265/HEVC (software).     |
| `vp8enc` / `vp9enc`       | Encodes video to VP8/VP9.                   |
| `av1enc`                  | Encodes video to AV1 (software, libaom).    |
| `avdec_h264`              | Decodes H.264 (via libav/FFmpeg).           |
| `vaapih264dec`            | Decodes H.264 using VA-API (hardware).      |
| `opusenc` / `opusdec`     | Encodes/decodes Opus audio.                 |
| `vorbisenc` / `vorbisdec` | Encodes/decodes Vorbis audio.               |
| `lamemp3enc`              | Encodes audio to MP3.                       |
| `faac` / `faad`           | Encodes/decodes AAC audio.                  |
| `avenc_aac`               | Encodes AAC audio (via libav).              |

### Tees and Queues

| Element      | Description                                                                               |
| ------------ | ----------------------------------------------------------------------------------------- |
| `tee`        | Splits a single stream into multiple outputs (request src pads).                          |
| `queue`      | Adds a buffer and creates a new thread boundary. Essential for multi-threaded pipelines.  |
| `queue2`     | Enhanced queue with buffering support (ring buffer, temp file). Used for network streams. |
| `multiqueue` | Manages multiple queues for synchronized streams. Used internally by many elements.       |

---

## 4. gst-launch-1.0

`gst-launch-1.0` is the command-line tool for constructing and running GStreamer pipelines. It is indispensable for prototyping and debugging.

### Basic Syntax

Elements are separated by `!` which links them:

```bash
gst-launch-1.0 videotestsrc ! autovideosink
```

This creates a test video pattern and displays it on screen.

### Setting Properties

Properties are set with `key=value` after the element name:

```bash
gst-launch-1.0 videotestsrc pattern=ball ! autovideosink
```

### Caps Filters

Caps are specified inline as a quoted string:

```bash
gst-launch-1.0 videotestsrc ! "video/x-raw,width=1280,height=720,framerate=60/1" ! autovideosink
```

### Named Elements

Use `name=` to give an element a name, then reference it later with `elementname.`:

```bash
gst-launch-1.0 \
  videotestsrc ! tee name=t \
  t. ! queue ! autovideosink \
  t. ! queue ! videoconvert ! x264enc ! filesink location=output.h264
```

This splits the test video into two branches: one for display, one for encoding to file.

### Audio Playback

```bash
gst-launch-1.0 filesrc location=song.mp3 ! mpegaudioparse ! mpg123audiodec ! audioconvert ! autoaudiosink
```

### Video File Playback

```bash
gst-launch-1.0 filesrc location=video.mp4 ! qtdemux name=demux \
  demux.video_0 ! queue ! h264parse ! avdec_h264 ! videoconvert ! autovideosink \
  demux.audio_0 ! queue ! aacparse ! avdec_aac ! audioconvert ! autoaudiosink
```

### Using playbin (High-Level)

For simple playback, `playbin` wraps everything:

```bash
gst-launch-1.0 playbin uri=file:///path/to/video.mp4
gst-launch-1.0 playbin uri=https://example.com/stream.m3u8
```

### Video Recording from Camera

```bash
gst-launch-1.0 v4l2src device=/dev/video0 ! videoconvert ! x264enc tune=zerolatency ! mp4mux ! filesink location=recording.mp4
```

### RTSP Streaming

```bash
# Receive RTSP stream and display
gst-launch-1.0 rtspsrc location=rtsp://192.168.1.100:8554/stream latency=100 ! \
  rtph264depay ! h264parse ! avdec_h264 ! videoconvert ! autovideosink

# Send video as RTP over UDP
gst-launch-1.0 videotestsrc ! x264enc tune=zerolatency ! rtph264pay ! \
  udpsink host=192.168.1.200 port=5000
```

### Network Streaming with RTP

Sender:

```bash
gst-launch-1.0 v4l2src ! videoconvert ! x264enc tune=zerolatency bitrate=2000 ! \
  rtph264pay config-interval=1 pt=96 ! udpsink host=224.1.1.1 port=5000
```

Receiver:

```bash
gst-launch-1.0 udpsrc port=5000 caps="application/x-rtp,media=video,encoding-name=H264,payload=96" ! \
  rtph264depay ! h264parse ! avdec_h264 ! videoconvert ! autovideosink
```

### Screen Capture

```bash
# Linux X11
gst-launch-1.0 ximagesrc ! videoconvert ! x264enc tune=zerolatency ! mp4mux ! filesink location=screen.mp4

# macOS (using avfvideosrc)
gst-launch-1.0 avfvideosrc capture-screen=true ! videoconvert ! x264enc ! mp4mux ! filesink location=screen.mp4
```

### Picture-in-Picture (Video Mixing)

```bash
gst-launch-1.0 compositor name=mix \
  sink_0::xpos=0 sink_0::ypos=0 sink_0::width=1280 sink_0::height=720 \
  sink_1::xpos=900 sink_1::ypos=20 sink_1::width=320 sink_1::height=240 ! \
  videoconvert ! autovideosink \
  videotestsrc pattern=smpte ! "video/x-raw,width=1280,height=720" ! mix.sink_0 \
  videotestsrc pattern=ball ! "video/x-raw,width=320,height=240" ! mix.sink_1
```

### Audio Mixing

```bash
gst-launch-1.0 audiomixer name=mix ! audioconvert ! autoaudiosink \
  audiotestsrc freq=440 ! mix. \
  audiotestsrc freq=880 wave=1 ! mix.
```

### Transcoding

```bash
# MP4 to WebM
gst-launch-1.0 filesrc location=input.mp4 ! qtdemux ! h264parse ! avdec_h264 ! \
  videoconvert ! vp9enc ! webmmux ! filesink location=output.webm

# Extract audio from video
gst-launch-1.0 filesrc location=video.mp4 ! qtdemux ! aacparse ! avdec_aac ! \
  audioconvert ! opusenc ! oggmux ! filesink location=audio.opus
```

---

## 5. Plugin System

### Plugin Categories

GStreamer plugins are distributed in separate packages based on licensing and quality:

| Package              | Description                                                             | Examples                                                           |
| -------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **gst-plugins-base** | Essential elements, always installed                                    | `playbin`, `decodebin`, `videoconvert`, `audioconvert`, `typefind` |
| **gst-plugins-good** | High-quality plugins with good licenses (LGPL)                          | `v4l2src`, `pulsesrc`, `rtpmanager`, `isomp4`, `matroska`, `flv`   |
| **gst-plugins-bad**  | Decent quality but lacking something (docs, tests, maintainer, license) | `webrtcbin`, `x265enc`, `tsdemux`, `hls`, `dash`                   |
| **gst-plugins-ugly** | Good quality but problematic licenses (patent-encumbered)               | `x264enc`, `mpg123audiodec`, `a52dec`                              |
| **gst-libav**        | Wraps FFmpeg/libav codecs as GStreamer elements                         | `avdec_h264`, `avdec_aac`, `avenc_*`                               |

### Installing Plugins

On Ubuntu/Debian:

```bash
sudo apt install gstreamer1.0-plugins-base gstreamer1.0-plugins-good \
  gstreamer1.0-plugins-bad gstreamer1.0-plugins-ugly gstreamer1.0-libav
```

On Fedora:

```bash
sudo dnf install gstreamer1-plugins-base gstreamer1-plugins-good \
  gstreamer1-plugins-bad-free gstreamer1-plugins-ugly-free gstreamer1-libav
```

On macOS (Homebrew):

```bash
brew install gstreamer gst-plugins-base gst-plugins-good gst-plugins-bad gst-plugins-ugly gst-libav
```

### gst-inspect-1.0

This tool inspects elements, showing their pads, properties, and capabilities:

```bash
# List all available elements
gst-inspect-1.0

# Inspect a specific element
gst-inspect-1.0 x264enc

# Search for elements by keyword
gst-inspect-1.0 | grep h264

# Show detailed information about a plugin package
gst-inspect-1.0 --plugin isomp4
```

Example output for `gst-inspect-1.0 x264enc` (abbreviated):

```
Factory Details:
  Rank      : primary (256)
  Long name : x264enc
  Klass     : Codec/Encoder/Video
  Description: H264 Encoder

Pad Templates:
  SINK template: 'sink'
    Availability: Always
    Capabilities:
      video/x-raw
        format: { I420, YV12, Y42B, Y444, NV12 }
        width: [ 16, 2147483647 ]
        height: [ 16, 2147483647 ]
        framerate: [ 0/1, 2147483647/1 ]

  SRC template: 'src'
    Availability: Always
    Capabilities:
      video/x-h264
        stream-format: { avc, byte-stream }
        alignment: au
        profile: { high-4:4:4, high-4:2:2, high-10, high, main, ... }

Element Properties:
  bitrate    : Bitrate in kbit/sec
               Type: uint, Range: 1 - 2048000, Default: 2048
  tune       : Preset tuning options
               Type: GstX264EncTune, Default: (none)
  speed-preset: Encoding speed vs quality tradeoff
               Type: GstX264EncPreset, Default: medium
  ...
```

### Writing Custom Plugins

Custom GStreamer plugins follow a standard structure. The minimal implementation requires:

1. A GObject subclass inheriting from `GstElement` (or a more specific base class like `GstBaseTransform`, `GstBaseSrc`, `GstVideoFilter`).
2. Pad templates declaring what formats the element accepts and produces.
3. A `chain` function (for filters) or `create` function (for sources) that processes data.
4. A plugin entry point registered with `GST_PLUGIN_DEFINE`.

For most use cases, you should subclass one of the base classes rather than `GstElement` directly:

| Base Class         | Use Case                                          |
| ------------------ | ------------------------------------------------- |
| `GstBaseSrc`       | Custom data sources                               |
| `GstBaseSink`      | Custom data sinks                                 |
| `GstBaseTransform` | 1-to-1 element transforms (in-place or copy)      |
| `GstVideoFilter`   | Video-specific filters (extends GstBaseTransform) |
| `GstAudioFilter`   | Audio-specific filters                            |
| `GstAggregator`    | Mixing or combining multiple inputs               |

---

## 6. Common Pipelines

### Camera Capture and Display

```bash
# Basic camera display
gst-launch-1.0 v4l2src ! videoconvert ! autovideosink

# Camera at specific resolution and framerate
gst-launch-1.0 v4l2src ! "video/x-raw,width=1920,height=1080,framerate=30/1" ! \
  videoconvert ! autovideosink

# Camera with overlay timestamp
gst-launch-1.0 v4l2src ! videoconvert ! clockoverlay ! autovideosink
```

### Video Recording with Audio

```bash
gst-launch-1.0 -e \
  v4l2src ! videoconvert ! x264enc tune=zerolatency ! h264parse ! mux. \
  pulsesrc ! audioconvert ! opusenc ! mux. \
  matroskamux name=mux ! filesink location=recording.mkv
```

The `-e` flag sends an EOS event on Ctrl+C, ensuring the container is finalized properly.

### Audio Playback Pipeline

```bash
# Simple WAV playback
gst-launch-1.0 filesrc location=audio.wav ! wavparse ! audioconvert ! autoaudiosink

# FLAC playback
gst-launch-1.0 filesrc location=music.flac ! flacparse ! flacdec ! audioconvert ! autoaudiosink

# With volume control
gst-launch-1.0 filesrc location=song.mp3 ! mpegaudioparse ! mpg123audiodec ! \
  audioconvert ! volume volume=0.5 ! autoaudiosink
```

### RTSP Server Pipeline (with gst-rtsp-server)

The `gst-rtsp-server` library (separate from core GStreamer) lets you create RTSP servers:

```bash
# Using test-launch utility from gst-rtsp-server
test-launch "( v4l2src ! videoconvert ! x264enc tune=zerolatency ! rtph264pay name=pay0 pt=96 )"
# Clients connect to rtsp://localhost:8554/test
```

### Screen Capture with Encoding

```bash
# Capture screen, encode to H.264, save to file
gst-launch-1.0 ximagesrc ! videoconvert ! videoscale ! \
  "video/x-raw,width=1920,height=1080,framerate=30/1" ! \
  x264enc tune=zerolatency speed-preset=ultrafast ! mp4mux ! filesink location=screen.mp4

# Capture screen and stream over RTP
gst-launch-1.0 ximagesrc ! videoconvert ! x264enc tune=zerolatency ! \
  rtph264pay ! udpsink host=192.168.1.100 port=5000
```

### Video Compositing (Picture-in-Picture)

```bash
gst-launch-1.0 compositor name=comp \
  sink_0::xpos=0 sink_0::ypos=0 \
  sink_1::xpos=800 sink_1::ypos=500 sink_1::width=400 sink_1::height=300 sink_1::zorder=1 ! \
  videoconvert ! autovideosink \
  filesrc location=main.mp4 ! qtdemux ! h264parse ! avdec_h264 ! videoconvert ! videoscale ! \
    "video/x-raw,width=1280,height=720" ! comp.sink_0 \
  v4l2src ! videoconvert ! videoscale ! \
    "video/x-raw,width=400,height=300" ! comp.sink_1
```

---

## 7. Dynamic Pipelines

Static pipelines (fully defined before PLAYING) are simpler but limited. Real applications often need to modify the pipeline at runtime.

### Adding Elements at Runtime

You can add and link elements while the pipeline is running:

```c
// 1. Create the new element
GstElement *new_element = gst_element_factory_make("x264enc", NULL);

// 2. Add it to the pipeline
gst_bin_add(GST_BIN(pipeline), new_element);

// 3. Sync its state with the pipeline
gst_element_sync_state_with_parent(new_element);

// 4. Link it to existing elements
gst_element_link(upstream, new_element);
gst_element_link(new_element, downstream);
```

### Removing Elements at Runtime

To safely remove an element, you must use pad probes to ensure no data is flowing through it at the moment of removal:

```c
// Block the src pad of the upstream element
GstPad *src_pad = gst_element_get_static_pad(upstream, "src");
gst_pad_add_probe(src_pad, GST_PAD_PROBE_TYPE_BLOCK_DOWNSTREAM,
    pad_probe_cb, user_data, NULL);
```

Inside the probe callback:

```c
static GstPadProbeReturn pad_probe_cb(GstPad *pad, GstPadProbeInfo *info, gpointer user_data) {
    // 1. Unlink the element
    gst_element_unlink(upstream, element_to_remove);
    gst_element_unlink(element_to_remove, downstream);

    // 2. Set to NULL state
    gst_element_set_state(element_to_remove, GST_STATE_NULL);

    // 3. Remove from pipeline
    gst_bin_remove(GST_BIN(pipeline), element_to_remove);

    // 4. Relink
    gst_element_link(upstream, downstream);

    // 5. Remove the probe
    return GST_PAD_PROBE_REMOVE;
}
```

### Pad Probes

Pad probes are callbacks invoked when data passes through a pad. They are the primary mechanism for dynamic pipeline manipulation.

Probe types:

| Type                                  | When invoked                                  |
| ------------------------------------- | --------------------------------------------- |
| `GST_PAD_PROBE_TYPE_BUFFER`           | When a buffer passes through                  |
| `GST_PAD_PROBE_TYPE_EVENT_DOWNSTREAM` | When a downstream event passes                |
| `GST_PAD_PROBE_TYPE_EVENT_UPSTREAM`   | When an upstream event passes                 |
| `GST_PAD_PROBE_TYPE_BLOCK_DOWNSTREAM` | Blocks data flow (for safe manipulation)      |
| `GST_PAD_PROBE_TYPE_IDLE`             | Called when the pad is idle (no data flowing) |

### Handling Dynamic Pads (Sometimes Pads)

Demuxers create pads dynamically. You handle this with the `pad-added` signal:

```c
g_signal_connect(demuxer, "pad-added", G_CALLBACK(on_pad_added), pipeline);

static void on_pad_added(GstElement *element, GstPad *new_pad, gpointer data) {
    GstCaps *new_pad_caps = gst_pad_get_current_caps(new_pad);
    GstStructure *new_pad_struct = gst_caps_get_structure(new_pad_caps, 0);
    const gchar *new_pad_type = gst_structure_get_name(new_pad_struct);

    if (g_str_has_prefix(new_pad_type, "video/")) {
        GstPad *video_sink_pad = gst_element_get_static_pad(video_queue, "sink");
        if (!gst_pad_is_linked(video_sink_pad)) {
            gst_pad_link(new_pad, video_sink_pad);
        }
        gst_object_unref(video_sink_pad);
    } else if (g_str_has_prefix(new_pad_type, "audio/")) {
        GstPad *audio_sink_pad = gst_element_get_static_pad(audio_queue, "sink");
        if (!gst_pad_is_linked(audio_sink_pad)) {
            gst_pad_link(new_pad, audio_sink_pad);
        }
        gst_object_unref(audio_sink_pad);
    }

    gst_caps_unref(new_pad_caps);
}
```

---

## 8. Programming with GStreamer

### C API

GStreamer's native API is C. Here is a complete example that plays a video file:

```c
#include <gst/gst.h>

int main(int argc, char *argv[]) {
    GstElement *pipeline;
    GstBus *bus;
    GstMessage *msg;

    gst_init(&argc, &argv);

    pipeline = gst_parse_launch(
        "filesrc location=video.mp4 ! qtdemux name=demux "
        "demux.video_0 ! queue ! h264parse ! avdec_h264 ! videoconvert ! autovideosink "
        "demux.audio_0 ! queue ! aacparse ! avdec_aac ! audioconvert ! autoaudiosink",
        NULL);

    gst_element_set_state(pipeline, GST_STATE_PLAYING);

    bus = gst_element_get_bus(pipeline);
    msg = gst_bus_timed_pop_filtered(bus, GST_CLOCK_TIME_NONE,
        GST_MESSAGE_ERROR | GST_MESSAGE_EOS);

    if (msg != NULL) {
        GError *err;
        gchar *debug_info;

        switch (GST_MESSAGE_TYPE(msg)) {
            case GST_MESSAGE_ERROR:
                gst_message_parse_error(msg, &err, &debug_info);
                g_printerr("Error from %s: %s\n",
                    GST_OBJECT_NAME(msg->src), err->message);
                g_printerr("Debug info: %s\n",
                    debug_info ? debug_info : "none");
                g_clear_error(&err);
                g_free(debug_info);
                break;
            case GST_MESSAGE_EOS:
                g_print("End of stream reached.\n");
                break;
            default:
                g_printerr("Unexpected message received.\n");
                break;
        }
        gst_message_unref(msg);
    }

    gst_object_unref(bus);
    gst_element_set_state(pipeline, GST_STATE_NULL);
    gst_object_unref(pipeline);

    return 0;
}
```

Compile with:

```bash
gcc -o player player.c $(pkg-config --cflags --libs gstreamer-1.0)
```

### Building a Pipeline Programmatically in C

```c
#include <gst/gst.h>

int main(int argc, char *argv[]) {
    gst_init(&argc, &argv);

    GstElement *pipeline = gst_pipeline_new("my-pipeline");
    GstElement *src = gst_element_factory_make("videotestsrc", "source");
    GstElement *conv = gst_element_factory_make("videoconvert", "converter");
    GstElement *sink = gst_element_factory_make("autovideosink", "sink");

    if (!pipeline || !src || !conv || !sink) {
        g_printerr("Failed to create elements.\n");
        return -1;
    }

    g_object_set(src, "pattern", 0, NULL);

    gst_bin_add_many(GST_BIN(pipeline), src, conv, sink, NULL);

    if (!gst_element_link_many(src, conv, sink, NULL)) {
        g_printerr("Elements could not be linked.\n");
        gst_object_unref(pipeline);
        return -1;
    }

    gst_element_set_state(pipeline, GST_STATE_PLAYING);

    GstBus *bus = gst_element_get_bus(pipeline);
    gst_bus_timed_pop_filtered(bus, GST_CLOCK_TIME_NONE,
        GST_MESSAGE_ERROR | GST_MESSAGE_EOS);

    gst_object_unref(bus);
    gst_element_set_state(pipeline, GST_STATE_NULL);
    gst_object_unref(pipeline);

    return 0;
}
```

### Python (gi.repository Gst)

Python bindings use GObject Introspection. This is the fastest way to prototype GStreamer applications.

```python
#!/usr/bin/env python3
import gi
gi.require_version('Gst', '1.0')
from gi.repository import Gst, GLib

Gst.init(None)

pipeline = Gst.parse_launch(
    'filesrc location=video.mp4 ! qtdemux name=demux '
    'demux.video_0 ! queue ! h264parse ! avdec_h264 ! videoconvert ! autovideosink '
    'demux.audio_0 ! queue ! aacparse ! avdec_aac ! audioconvert ! autoaudiosink'
)

loop = GLib.MainLoop()

bus = pipeline.get_bus()
bus.add_signal_watch()

def on_message(bus, message):
    t = message.type
    if t == Gst.MessageType.EOS:
        print("End of stream")
        loop.quit()
    elif t == Gst.MessageType.ERROR:
        err, debug = message.parse_error()
        print(f"Error: {err.message}")
        print(f"Debug: {debug}")
        loop.quit()

bus.connect("message", on_message)

pipeline.set_state(Gst.State.PLAYING)

try:
    loop.run()
except KeyboardInterrupt:
    pass

pipeline.set_state(Gst.State.NULL)
```

### Python: Building Pipelines Programmatically

```python
#!/usr/bin/env python3
import gi
gi.require_version('Gst', '1.0')
from gi.repository import Gst, GLib

Gst.init(None)

pipeline = Gst.Pipeline.new("my-pipeline")
src = Gst.ElementFactory.make("videotestsrc", "source")
convert = Gst.ElementFactory.make("videoconvert", "convert")
sink = Gst.ElementFactory.make("autovideosink", "sink")

src.set_property("pattern", 18)  # ball pattern

pipeline.add(src)
pipeline.add(convert)
pipeline.add(sink)

src.link(convert)
convert.link(sink)

pipeline.set_state(Gst.State.PLAYING)

loop = GLib.MainLoop()
bus = pipeline.get_bus()
bus.add_signal_watch()
bus.connect("message::eos", lambda bus, msg: loop.quit())
bus.connect("message::error", lambda bus, msg: (print(msg.parse_error()), loop.quit()))

try:
    loop.run()
except KeyboardInterrupt:
    pass

pipeline.set_state(Gst.State.NULL)
```

### Python: Using appsrc and appsink

```python
#!/usr/bin/env python3
import gi
gi.require_version('Gst', '1.0')
from gi.repository import Gst, GLib
import numpy as np

Gst.init(None)

WIDTH, HEIGHT, FPS = 640, 480, 30

pipeline = Gst.parse_launch(
    f'appsrc name=src caps="video/x-raw,format=RGB,width={WIDTH},height={HEIGHT},framerate={FPS}/1" '
    f'! videoconvert ! autovideosink'
)

appsrc = pipeline.get_by_name("src")
appsrc.set_property("format", Gst.Format.TIME)

frame_count = 0

def push_frame():
    global frame_count
    # Generate a frame with numpy (random noise)
    data = np.random.randint(0, 255, (HEIGHT, WIDTH, 3), dtype=np.uint8)
    buf = Gst.Buffer.new_wrapped(data.tobytes())

    duration = Gst.SECOND // FPS
    buf.pts = frame_count * duration
    buf.duration = duration

    appsrc.emit("push-buffer", buf)
    frame_count += 1
    return True  # Continue calling

pipeline.set_state(Gst.State.PLAYING)
GLib.timeout_add(1000 // FPS, push_frame)

loop = GLib.MainLoop()
try:
    loop.run()
except KeyboardInterrupt:
    pass

pipeline.set_state(Gst.State.NULL)
```

### Rust (gstreamer-rs)

The Rust bindings for GStreamer (`gstreamer-rs`, crate name `gst`) are considered the **best language bindings** for GStreamer. They provide memory safety, ergonomic APIs, and are actively maintained by Sebastian Droge at Centricular.

Add to `Cargo.toml`:

```toml
[dependencies]
gstreamer = "0.23"
glib = "0.20"
```

Basic pipeline example:

```rust
use gstreamer as gst;
use gst::prelude::*;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    gst::init()?;

    let pipeline = gst::parse::launch(
        "filesrc location=video.mp4 ! qtdemux name=demux \
         demux.video_0 ! queue ! h264parse ! avdec_h264 ! videoconvert ! autovideosink \
         demux.audio_0 ! queue ! aacparse ! avdec_aac ! audioconvert ! autoaudiosink"
    )?
    .downcast::<gst::Pipeline>()
    .expect("Expected a pipeline");

    pipeline.set_state(gst::State::Playing)?;

    let bus = pipeline.bus().expect("Pipeline has no bus");

    for msg in bus.iter_timed(gst::ClockTime::NONE) {
        match msg.view() {
            gst::MessageView::Eos(..) => {
                println!("End of stream");
                break;
            }
            gst::MessageView::Error(err) => {
                eprintln!(
                    "Error from {:?}: {} ({:?})",
                    err.src().map(|s| s.path_string()),
                    err.error(),
                    err.debug()
                );
                break;
            }
            _ => (),
        }
    }

    pipeline.set_state(gst::State::Null)?;
    Ok(())
}
```

### Rust: Building Pipelines Programmatically

```rust
use gstreamer as gst;
use gst::prelude::*;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    gst::init()?;

    let pipeline = gst::Pipeline::default();

    let src = gst::ElementFactory::make("videotestsrc")
        .property("pattern", 18i32) // ball
        .build()?;

    let convert = gst::ElementFactory::make("videoconvert").build()?;

    let sink = gst::ElementFactory::make("autovideosink").build()?;

    pipeline.add_many([&src, &convert, &sink])?;
    gst::Element::link_many([&src, &convert, &sink])?;

    pipeline.set_state(gst::State::Playing)?;

    let bus = pipeline.bus().unwrap();
    for msg in bus.iter_timed(gst::ClockTime::NONE) {
        match msg.view() {
            gst::MessageView::Eos(..) => break,
            gst::MessageView::Error(err) => {
                eprintln!("Error: {}", err.error());
                break;
            }
            _ => (),
        }
    }

    pipeline.set_state(gst::State::Null)?;
    Ok(())
}
```

### Rust: Handling Dynamic Pads

```rust
use gstreamer as gst;
use gst::prelude::*;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    gst::init()?;

    let pipeline = gst::Pipeline::default();

    let src = gst::ElementFactory::make("uridecodebin")
        .property("uri", "file:///path/to/video.mp4")
        .build()?;

    let video_convert = gst::ElementFactory::make("videoconvert").build()?;
    let video_sink = gst::ElementFactory::make("autovideosink").build()?;
    let audio_convert = gst::ElementFactory::make("audioconvert").build()?;
    let audio_sink = gst::ElementFactory::make("autoaudiosink").build()?;

    pipeline.add_many([&src, &video_convert, &video_sink, &audio_convert, &audio_sink])?;

    gst::Element::link_many([&video_convert, &video_sink])?;
    gst::Element::link_many([&audio_convert, &audio_sink])?;

    let pipeline_weak = pipeline.downgrade();
    src.connect_pad_added(move |_element, pad| {
        let Some(pipeline) = pipeline_weak.upgrade() else { return };
        let caps = pad.current_caps().unwrap_or_else(|| pad.query_caps(None));
        let structure = caps.structure(0).expect("caps has no structure");
        let name = structure.name();

        if name.starts_with("video/") {
            let video_convert = pipeline.by_name("videoconvert0").unwrap();
            let sink_pad = video_convert.static_pad("sink").unwrap();
            if !sink_pad.is_linked() {
                pad.link(&sink_pad).expect("Failed to link video pad");
            }
        } else if name.starts_with("audio/") {
            let audio_convert = pipeline.by_name("audioconvert0").unwrap();
            let sink_pad = audio_convert.static_pad("sink").unwrap();
            if !sink_pad.is_linked() {
                pad.link(&sink_pad).expect("Failed to link audio pad");
            }
        }
    });

    pipeline.set_state(gst::State::Playing)?;

    let bus = pipeline.bus().unwrap();
    for msg in bus.iter_timed(gst::ClockTime::NONE) {
        match msg.view() {
            gst::MessageView::Eos(..) => break,
            gst::MessageView::Error(err) => {
                eprintln!("Error: {}", err.error());
                break;
            }
            _ => (),
        }
    }

    pipeline.set_state(gst::State::Null)?;
    Ok(())
}
```

---

## 9. GStreamer for WebRTC

### The webrtcbin Element

`webrtcbin` is GStreamer's WebRTC implementation, found in `gst-plugins-bad`. It handles:

- ICE candidate gathering and connectivity checks (via libnice)
- DTLS-SRTP encryption
- SDP offer/answer generation
- RTP/RTCP handling
- Data channels (via SCTP)

Unlike browser WebRTC, `webrtcbin` gives you full control over the media pipeline before and after the WebRTC transport layer. You can encode with any codec, apply any filter, and process the received media however you want.

### Basic WebRTC Pipeline

Sending video over WebRTC:

```bash
gst-launch-1.0 webrtcbin name=sendrecv bundle-policy=max-bundle stun-server=stun://stun.l.google.com:19302 \
  videotestsrc is-live=true ! videoconvert ! vp8enc deadline=1 ! rtpvp8pay ! \
  "application/x-rtp,media=video,encoding-name=VP8,payload=96" ! sendrecv.
```

In practice, `webrtcbin` requires a signaling mechanism (not built into GStreamer). You must handle signaling yourself via WebSocket, HTTP, or any custom protocol.

### Python WebRTC Example

```python
#!/usr/bin/env python3
import gi
gi.require_version('Gst', '1.0')
gi.require_version('GstWebRTC', '1.0')
gi.require_version('GstSdp', '1.0')
from gi.repository import Gst, GstWebRTC, GstSdp, GLib
import json

Gst.init(None)

PIPELINE_DESC = '''
webrtcbin name=sendrecv bundle-policy=max-bundle
  stun-server=stun://stun.l.google.com:19302

videotestsrc is-live=true pattern=ball !
  videoconvert ! queue !
  vp8enc deadline=1 !
  rtpvp8pay !
  queue !
  application/x-rtp,media=video,encoding-name=VP8,payload=96 !
  sendrecv.

audiotestsrc is-live=true wave=red-noise !
  audioconvert ! audioresample ! queue !
  opusenc !
  rtpopuspay !
  queue !
  application/x-rtp,media=audio,encoding-name=OPUS,payload=111 !
  sendrecv.
'''

pipe = Gst.parse_launch(PIPELINE_DESC)
webrtc = pipe.get_by_name('sendrecv')

def on_negotiation_needed(element):
    promise = Gst.Promise.new_with_change_func(on_offer_created, element, None)
    element.emit('create-offer', None, promise)

def on_offer_created(promise, element, _):
    promise.wait()
    reply = promise.get_reply()
    offer = reply.get_value('offer')
    promise2 = Gst.Promise.new()
    element.emit('set-local-description', offer, promise2)
    promise2.interrupt()
    # Send offer.sdp.as_text() to remote peer via your signaling server
    sdp_text = offer.sdp.as_text()
    print(f"SDP Offer:\n{sdp_text}")

def on_ice_candidate(element, mlineindex, candidate):
    # Send ICE candidate to remote peer via your signaling server
    print(f"ICE Candidate: {candidate}")

webrtc.connect('on-negotiation-needed', on_negotiation_needed)
webrtc.connect('on-ice-candidate', on_ice_candidate)

pipe.set_state(Gst.State.PLAYING)

loop = GLib.MainLoop()
try:
    loop.run()
except KeyboardInterrupt:
    pass

pipe.set_state(Gst.State.NULL)
```

### Data Channels

`webrtcbin` supports WebRTC data channels for arbitrary data transfer:

```python
# Creating a data channel
channel = webrtc.emit('create-data-channel', 'my-channel', None)

def on_data_channel_open(channel):
    channel.emit('send-string', 'Hello from GStreamer!')

def on_data_channel_message(channel, message):
    print(f"Received: {message}")

channel.connect('on-open', on_data_channel_open)
channel.connect('on-message-string', on_data_channel_message)

# Handling incoming data channels from remote peer
def on_data_channel(webrtc, channel):
    channel.connect('on-message-string', on_data_channel_message)

webrtc.connect('on-data-channel', on_data_channel)
```

### How GStreamer WebRTC Differs from Browser WebRTC

| Aspect           | Browser WebRTC                          | GStreamer WebRTC                        |
| ---------------- | --------------------------------------- | --------------------------------------- |
| Signaling        | Built-in patterns (perfect negotiation) | You implement everything                |
| Codecs           | Browser-chosen, limited set             | Any codec GStreamer supports            |
| Media processing | Limited (insertable streams)            | Full pipeline before/after transport    |
| Hardware access  | getUserMedia API                        | v4l2src, pulsesrc, etc. directly        |
| Scalability      | One browser = one peer                  | Server-side SFU/MCU with full control   |
| Data channels    | Full API                                | Supported via SCTP                      |
| SRTP             | Mandatory, automatic                    | Mandatory, automatic (via libnice/dtls) |
| NAT traversal    | ICE/STUN/TURN built-in                  | ICE/STUN/TURN via libnice               |

GStreamer's WebRTC implementation is particularly useful for:

- **Media servers**: SFUs that need to transcode, mix, or record.
- **Embedded devices**: IoT cameras, robots, drones that need to stream via WebRTC.
- **Custom processing**: Applying machine learning inference on video frames before or after WebRTC transport.
- **Headless applications**: Server-side WebRTC without needing a browser or GUI.

---

## 10. GStreamer for Streaming

### RTMP Output (for Twitch, YouTube Live, etc.)

```bash
gst-launch-1.0 -e \
  v4l2src ! videoconvert ! x264enc tune=zerolatency bitrate=2500 ! h264parse ! flvmux name=mux streamable=true ! \
    rtmpsink location="rtmp://live.twitch.tv/app/YOUR_STREAM_KEY" \
  pulsesrc ! audioconvert ! audioresample ! voaacenc bitrate=128000 ! mux.
```

### HLS Output

```bash
gst-launch-1.0 -e \
  v4l2src ! videoconvert ! x264enc tune=zerolatency key-int-max=60 ! h264parse ! mux. \
  pulsesrc ! audioconvert ! voaacenc ! aacparse ! mux. \
  mpegtsmux name=mux ! hlssink max-files=10 target-duration=6 \
    location=segment_%05d.ts \
    playlist-location=stream.m3u8
```

### DASH Output

```bash
gst-launch-1.0 -e \
  v4l2src ! videoconvert ! x264enc ! h264parse ! mux. \
  pulsesrc ! audioconvert ! voaacenc ! aacparse ! mux. \
  dashsink name=mux mpd-filename=stream.mpd \
    target-duration=4 \
    muxer=mp4mux
```

### Adaptive Bitrate Streaming

For adaptive streaming, you encode at multiple bitrates and create a manifest. This typically involves multiple parallel encoding branches:

```bash
gst-launch-1.0 -e v4l2src ! videoconvert ! tee name=t \
  t. ! queue ! videoscale ! "video/x-raw,width=1920,height=1080" ! x264enc bitrate=5000 ! h264parse ! mux. \
  t. ! queue ! videoscale ! "video/x-raw,width=1280,height=720" ! x264enc bitrate=2500 ! h264parse ! mux. \
  t. ! queue ! videoscale ! "video/x-raw,width=640,height=360" ! x264enc bitrate=1000 ! h264parse ! mux. \
  pulsesrc ! audioconvert ! voaacenc ! aacparse ! mux. \
  hlssink2 name=mux max-files=10 target-duration=6 \
    location=segment_%05d.ts playlist-location=master.m3u8
```

In practice, adaptive bitrate with GStreamer often requires application-level logic to generate proper manifests. Libraries like `gst-rtsp-server` and custom code typically handle this.

### Low-Latency Pipelines

Achieving low latency in GStreamer requires attention at every stage:

1. **Encoder**: Use `tune=zerolatency` for x264enc. Use hardware encoders (VA-API, NVENC) when available.
2. **Queues**: Minimize queue sizes. Set `max-size-buffers=1` and `leaky=downstream` for live pipelines.
3. **Jitter buffers**: For RTP, reduce `latency` property on `rtpjitterbuffer` or `rtspsrc`.
4. **Sinks**: Set `sync=false` on sinks if you do not need A/V sync (useful for monitoring).
5. **Pipeline latency**: Set `latency` on the pipeline for live sources.

Example low-latency pipeline:

```bash
# Sender
gst-launch-1.0 v4l2src ! \
  "video/x-raw,width=1280,height=720,framerate=30/1" ! \
  videoconvert ! \
  x264enc tune=zerolatency speed-preset=ultrafast bitrate=4000 key-int-max=15 ! \
  rtph264pay config-interval=-1 ! \
  udpsink host=192.168.1.100 port=5000 sync=false

# Receiver (targeting < 100ms glass-to-glass)
gst-launch-1.0 udpsrc port=5000 \
  caps="application/x-rtp,media=video,encoding-name=H264,payload=96" ! \
  rtpjitterbuffer latency=0 ! \
  rtph264depay ! h264parse ! avdec_h264 ! \
  videoconvert ! autovideosink sync=false
```

### SRT (Secure Reliable Transport)

GStreamer supports SRT for reliable low-latency streaming:

```bash
# SRT sender (caller mode)
gst-launch-1.0 v4l2src ! videoconvert ! x264enc tune=zerolatency ! \
  mpegtsmux ! srtsink uri="srt://192.168.1.100:4900"

# SRT receiver (listener mode)
gst-launch-1.0 srtsrc uri="srt://:4900" ! tsdemux ! h264parse ! \
  avdec_h264 ! videoconvert ! autovideosink
```

---

## 11. Debugging

### GST_DEBUG Environment Variable

The `GST_DEBUG` environment variable controls logging verbosity. The format is:

```
GST_DEBUG=category:level,category:level,...
```

Debug levels:

| Level | Name    | Description                       |
| ----- | ------- | --------------------------------- |
| 0     | none    | No output                         |
| 1     | ERROR   | Fatal errors                      |
| 2     | WARNING | Non-fatal warnings                |
| 3     | FIXME   | Known issues that need fixing     |
| 4     | INFO    | Informational messages            |
| 5     | DEBUG   | Detailed debug messages           |
| 6     | LOG     | Verbose logging                   |
| 7     | TRACE   | Full trace (extremely verbose)    |
| 9     | MEMDUMP | Memory dump (hex dump of buffers) |

Examples:

```bash
# All categories at WARNING level
GST_DEBUG=2 gst-launch-1.0 videotestsrc ! autovideosink

# Specific category at DEBUG level
GST_DEBUG=videotestsrc:5 gst-launch-1.0 videotestsrc ! autovideosink

# Multiple categories
GST_DEBUG=GST_CAPS:4,x264enc:5,rtpjitterbuffer:6 gst-launch-1.0 ...

# Everything at WARNING, but caps negotiation at DEBUG
GST_DEBUG=2,GST_CAPS:5 gst-launch-1.0 ...

# Wildcard matching
GST_DEBUG=webrtc*:5 gst-launch-1.0 ...
```

### Colored Output

```bash
GST_DEBUG_COLOR_MODE=on GST_DEBUG=3 gst-launch-1.0 ...
```

### Dot Graph Generation

GStreamer can generate Graphviz dot files showing the pipeline structure, element states, and negotiated caps. This is one of the most powerful debugging tools.

```bash
# Set the directory for dot files
export GST_DEBUG_DUMP_DOT_DIR=/tmp/gst-dots

# Run pipeline
gst-launch-1.0 videotestsrc ! autovideosink

# Convert to PNG
dot -Tpng /tmp/gst-dots/*.dot -o pipeline.png
```

The dot files are generated at state transitions. You get separate files for NULL-to-READY, READY-to-PAUSED, and PAUSED-to-PLAYING transitions.

In application code, you can also trigger dot file generation programmatically:

```c
GST_DEBUG_BIN_TO_DOT_FILE(GST_BIN(pipeline), GST_DEBUG_GRAPH_SHOW_ALL, "my-pipeline");
```

Python equivalent:

```python
Gst.debug_bin_to_dot_file(pipeline, Gst.DebugGraphDetails.ALL, "my-pipeline")
```

### gst-debug-viewer

`gst-debug-viewer` is a GUI tool for browsing GStreamer debug logs:

```bash
# Save debug output to file
GST_DEBUG=4 gst-launch-1.0 ... 2> debug.log

# Open in viewer
gst-debug-viewer debug.log
```

### Common Debugging Techniques

**Caps negotiation failures**: If elements fail to link, inspect what caps each side offers:

```bash
GST_DEBUG=GST_CAPS:5 gst-launch-1.0 ...
```

Look for messages like "caps were incompatible" or "no common format."

**Pipeline hangs (deadlocks)**: If the pipeline stops flowing data, check for missing queues. Each branch of a tee needs its own queue. Also check if a sink is blocking because `sync=true` and the clock is wrong.

**Buffer timestamps**: For timing issues, enable logging on the specific element and look at PTS (presentation timestamp) and DTS (decoding timestamp) values:

```bash
GST_DEBUG=basesink:5 gst-launch-1.0 ...
```

**Identity element**: Insert an `identity` element with `silent=false` to see every buffer that passes through:

```bash
gst-launch-1.0 videotestsrc ! identity silent=false ! autovideosink
```

**Leaks**: Use `GST_DEBUG=GST_REFCOUNTING:5` to track reference count changes. Or use the `GST_TRACERS` system:

```bash
GST_TRACERS="leaks" GST_DEBUG=GST_TRACER:7 gst-launch-1.0 ...
```

### Tracer Framework

GStreamer 1.8+ includes a tracer framework for performance analysis:

```bash
# Log latency of each buffer
GST_TRACERS="latency" GST_DEBUG=GST_TRACER:7 gst-launch-1.0 ...

# Log statistics about buffer flow
GST_TRACERS="stats" GST_DEBUG=GST_TRACER:7 gst-launch-1.0 ...

# Log CPU and memory usage
GST_TRACERS="rusage" GST_DEBUG=GST_TRACER:7 gst-launch-1.0 ...

# Multiple tracers
GST_TRACERS="latency;stats;leaks" GST_DEBUG=GST_TRACER:7 gst-launch-1.0 ...
```

---

## 12. Comparison: GStreamer vs FFmpeg

### Detailed Feature Comparison

| Feature                     | GStreamer                                                  | FFmpeg                                                 |
| --------------------------- | ---------------------------------------------------------- | ------------------------------------------------------ |
| **Architecture**            | Plugin-based pipeline graph                                | Monolithic libraries (libavcodec, libavformat, etc.)   |
| **CLI tool**                | `gst-launch-1.0` (prototyping)                             | `ffmpeg` (production-grade)                            |
| **API paradigm**            | Object-oriented (GObject), event-driven                    | Procedural C API                                       |
| **Pipeline model**          | DAG of elements with negotiated caps                       | Linear filter graph (`-filter_complex` for non-linear) |
| **Real-time focus**         | Primary design goal (live sources, clocks)                 | Primarily offline; live possible but secondary         |
| **WebRTC**                  | Built-in (`webrtcbin`)                                     | Not supported                                          |
| **RTSP server**             | `gst-rtsp-server` library                                  | Not directly (use live555 separately)                  |
| **Hardware acceleration**   | VA-API, VDPAU, NVCODEC, V4L2, QSV plugins                  | VA-API, NVCODEC, QSV, VideoToolbox, MediaCodec         |
| **Language bindings**       | Excellent via GObject Introspection (Python, Rust, JS, C#) | Primarily C; wrappers exist but are unofficial         |
| **Dynamic reconfiguration** | First-class support (pad probes, dynamic linking)          | Very limited at runtime                                |
| **State management**        | Full state machine (NULL/READY/PAUSED/PLAYING)             | Manual seek/flush/drain                                |
| **Plugin ecosystem**        | base/good/bad/ugly/libav packages                          | All codecs compiled in                                 |
| **Container support**       | Via plugins (qtdemux, matroskademux, etc.)                 | Comprehensive built-in (libavformat)                   |
| **Codec coverage**          | Good; gaps filled by gst-libav (wraps FFmpeg)              | Most comprehensive codec library available             |
| **Subtitle support**        | Limited                                                    | Excellent (burn-in, extraction, conversion)            |
| **Stream copy**             | Possible but less ergonomic                                | First-class (`-c copy`)                                |
| **Batch processing**        | Not its strength                                           | Excellent                                              |
| **Community**               | Centricular, Collabora, GNOME ecosystem                    | Enormous open-source community                         |
| **Documentation**           | Good tutorials, some gaps in reference docs                | Extensive wiki and man pages                           |
| **License**                 | LGPL 2.1 (core), plugins vary                              | LGPL 2.1 (or GPL if enabled)                           |
| **Cross-platform**          | Linux (best), macOS, Windows, Android, iOS                 | All platforms well-supported                           |

### When to Use GStreamer

- Building **applications** that process media in real time (video conferencing, media servers, surveillance systems).
- You need **WebRTC** on the server side.
- You need to **dynamically reconfigure** the pipeline (switch codecs, add/remove streams, change resolution).
- You are working in an ecosystem that already uses GLib/GObject (GNOME, GTK applications).
- You need **fine-grained latency control** for live streaming.
- You are building an **embedded media application** (GStreamer is widely used on embedded Linux, Yocto/Buildroot).

### When to Use FFmpeg

- **Transcoding files** from one format to another.
- **Batch processing** a large number of media files.
- You need a **CLI tool** for scripting media operations.
- **Codec coverage** is the top priority (FFmpeg has the most codecs).
- **Stream copying** without re-encoding.
- You need extensive **subtitle** processing.
- **Quick prototyping** of media operations in a shell script.

### Using Both Together

It is common to use both in the same project:

- Use GStreamer for the real-time pipeline and use `gst-libav` (which wraps FFmpeg's codec libraries) for decoding/encoding.
- Use FFmpeg CLI for offline transcoding and GStreamer for live streaming.
- Use FFmpeg's `libavformat` for container parsing and GStreamer for playback/rendering.

---

## 13. Common Interview Questions

### Fundamentals

**Q: What is GStreamer and how does it differ from FFmpeg?**

GStreamer is a pipeline-based multimedia framework that models media processing as a directed graph of elements. Each element performs one operation (decode, encode, filter, render) and elements are connected via typed pads. FFmpeg is a collection of libraries and a CLI tool primarily designed for transcoding. The key differences are: GStreamer excels at real-time, dynamic pipelines and has built-in WebRTC support, while FFmpeg excels at offline transcoding and has broader codec coverage. GStreamer uses a plugin architecture with GObject for extensibility, while FFmpeg's codecs are compiled in. Many projects use both: GStreamer's `gst-libav` plugin wraps FFmpeg's codecs.

---

**Q: Explain the GStreamer pipeline state machine.**

GStreamer elements move through four states: NULL (no resources), READY (resources allocated, devices opened), PAUSED (data pre-rolled, first buffer at sinks, clock stopped), and PLAYING (clock running, data rendered in real time). State changes are incremental: going from NULL to PLAYING traverses READY and PAUSED. State transitions are asynchronous; `gst_element_set_state()` returns ASYNC if the transition is not yet complete. A critical property is that in PAUSED state, sinks hold one buffer, which is why seeking in a paused video shows the result frame immediately.

---

**Q: What are pads and what are the different pad availability types?**

Pads are the connection points of elements. Sink pads receive data, src pads produce data. There are three availability types: Always pads exist for the element's entire lifetime (e.g., `videoconvert` always has one sink and one src pad). Sometimes pads are created dynamically when the element discovers what it needs (e.g., a demuxer creates pads when it parses the container header and discovers video and audio streams). Request pads are created on demand by the application (e.g., `tee` creates additional src pads when you request them). Sometimes pads require connecting to the `pad-added` signal to link them dynamically.

---

**Q: What are caps and how does caps negotiation work?**

Caps (capabilities) describe the type and format of data flowing through a pad. For example, `video/x-raw,format=I420,width=1920,height=1080,framerate=30/1` describes raw video. When elements are linked, they negotiate compatible caps. The upstream element advertises what it can produce, the downstream element advertises what it accepts, and the intersection determines what format is used. A `capsfilter` element can force specific caps. If negotiation fails (no intersection), the link fails and the pipeline cannot transition to PAUSED.

---

### Architecture and Design

**Q: Why does every branch of a tee need its own queue?**

A `tee` element sends the same buffer to multiple branches. Without queues, all branches would execute in the same thread, which creates a deadlock risk: if one branch blocks (e.g., a sink waiting for clock time), all branches block. A `queue` element creates a thread boundary and an internal buffer. Each branch of a tee gets its own thread, allowing branches to process data at different speeds independently. Additionally, queues handle backpressure: if one branch is slow, its queue fills up rather than blocking the tee and other branches.

---

**Q: How would you build a low-latency video streaming pipeline?**

For low latency, I would address every stage: (1) Use a hardware encoder or set `tune=zerolatency speed-preset=ultrafast` on x264enc to minimize encoding latency. (2) Set `config-interval=-1` on the RTP payloader so SPS/PPS are sent with every keyframe for quick decoder startup. (3) Reduce queue sizes with `max-size-buffers=1 leaky=downstream` to avoid buffering. (4) On the receiver, set `latency=0` on the jitter buffer. (5) Set `sync=false` on the video sink to render frames as soon as they arrive rather than waiting for clock time. (6) Use UDP or SRT for transport. A realistic target is 50-150ms glass-to-glass latency on a LAN.

---

**Q: How do you handle dynamic pipeline reconfiguration?**

Use pad probes to safely modify a running pipeline. The process is: (1) Add a blocking pad probe on the upstream element's src pad. (2) When the probe fires, you know no data is flowing through that section. (3) Unlink the elements you want to modify. (4) Set removed elements to NULL state and remove them from the bin. (5) Add new elements, set their state to match the pipeline. (6) Link everything. (7) Remove the blocking probe to resume data flow. For adding elements, the simpler approach is to add them to the bin, sync their state with `gst_element_sync_state_with_parent()`, and link them in.

---

### WebRTC

**Q: How does GStreamer's WebRTC implementation differ from browser WebRTC?**

Browser WebRTC provides a high-level API (RTCPeerConnection) that handles codec selection, media capture, and rendering automatically. GStreamer's `webrtcbin` provides only the transport layer (ICE, DTLS-SRTP, SDP) and leaves everything else to the pipeline. This means you must explicitly build the encoding/decoding pipeline and implement signaling yourself. The advantage is full control: you can use any codec, apply arbitrary processing (ML inference, video mixing, transcoding), run headlessly on a server, and build SFU/MCU architectures. GStreamer uses libnice for ICE, the same library as many other Linux WebRTC implementations.

---

**Q: How would you use GStreamer to build a media server for video conferencing?**

I would use `webrtcbin` elements, one per connected peer. Each incoming `webrtcbin` decodes the received streams. A `compositor` element mixes the video streams for a combined view, and an `audiomixer` mixes audio. For an SFU (Selective Forwarding Unit), I would forward RTP packets directly between `webrtcbin` elements without decoding, using tees to distribute streams. For an MCU (Multipoint Control Unit), I would decode, mix, re-encode, and send the composite to each participant. The signaling server would be separate (e.g., a WebSocket server in Node.js or Python) that relays SDP and ICE candidates between GStreamer and browser clients.

---

### Debugging

**Q: A GStreamer pipeline is dropping frames. How do you diagnose this?**

First, enable QoS messages: check the bus for `GST_MESSAGE_QOS` which reports dropped frames. Set `GST_DEBUG=basesink:5` to see timestamp information and whether the sink is dropping late buffers. Use the latency tracer (`GST_TRACERS="latency"`) to measure end-to-end latency per buffer. Check if queues are full (they will post `overrun` messages). Common causes are: (1) The encoder is too slow for the input framerate (solution: lower quality or use hardware encoding). (2) Queues are too small for bursty processing. (3) The system clock and pipeline clock are out of sync. (4) The sink is syncing to a clock that is running too fast relative to the source.

---

**Q: How do you debug caps negotiation failures?**

Set `GST_DEBUG=GST_CAPS:5` and look for "not negotiated" errors and "caps were incompatible" warnings. Use `gst-inspect-1.0` on each element to see what caps their pad templates advertise. Common fixes are inserting converter elements (`videoconvert`, `audioconvert`, `audioresample`) between elements that do not share a common format, or using a `capsfilter` to constrain the format to something both sides support.

---

**Q: What is the purpose of GST_DEBUG_DUMP_DOT_DIR?**

Setting this environment variable to a directory path causes GStreamer to write Graphviz DOT files at each state transition. These files describe the full pipeline topology: every element, every pad, every negotiated caps value, and every link. Converting them to images with `dot -Tpng` gives you a visual diagram of the pipeline. This is invaluable for debugging complex pipelines where you need to verify that elements are linked correctly and that caps negotiation produced the expected formats.

---

### Practical Scenarios

**Q: How would you implement an RTSP to WebRTC gateway?**

The pipeline would use `rtspsrc` to receive the RTSP stream, depayload the RTP, optionally transcode to a WebRTC-compatible codec (VP8/VP9/H.264), re-payload, and send via `webrtcbin`. A simplified pipeline: `rtspsrc location=rtsp://... ! rtph264depay ! h264parse ! webrtcbin`. If the RTSP stream already uses H.264, you can avoid transcoding entirely. The signaling server would handle SDP exchange between the browser client and the GStreamer pipeline. For multiple viewers, you would tee the stream and create a `webrtcbin` per viewer.

---

**Q: How do you handle stream reconnection in GStreamer?**

For network sources like `rtspsrc` or `souphttpsrc`, listen for ERROR messages on the bus. When the connection drops, the source posts an error. In the error handler: (1) Set the pipeline to NULL state. (2) Wait a backoff interval. (3) Set back to PLAYING. For more sophisticated reconnection, handle it at the element level: `rtspsrc` has built-in reconnection logic (properties `timeout` and `tcp-timeout`). For UDP sources, there is no connection to lose, but you can detect data loss by monitoring the jitter buffer's statistics or setting a timeout on `udpsrc`.

---

**Q: What is the difference between `decodebin` and `playbin`?**

`decodebin` is an auto-plugging element that takes encoded data and automatically constructs a decode chain, producing raw audio and video on its sometimes src pads. You still need to provide the source and the sinks yourself. `playbin` is a higher-level element that wraps `uridecodebin` (which adds URI handling and source selection to `decodebin`) plus audio and video sinks. `playbin` handles everything: source selection, container demuxing, codec decoding, audio/video output, subtitle rendering, and volume control. Use `playbin` for simple playback; use `decodebin` when you need control over the pipeline after decoding.

---

**Q: How would you implement recording with live preview in GStreamer?**

Use a `tee` element to split the camera input into two branches. One branch goes through a queue to the display sink (`autovideosink`). The other branch goes through a queue to an encoder, muxer, and file sink. Both branches must have their own queue for independent threading. Use the `-e` flag (or send an EOS event programmatically) to properly finalize the recorded file when stopping. To start/stop recording dynamically, use pad probes to add/remove the recording branch at runtime without stopping the preview.

```bash
gst-launch-1.0 -e v4l2src ! videoconvert ! tee name=t \
  t. ! queue ! autovideosink \
  t. ! queue ! x264enc tune=zerolatency ! mp4mux ! filesink location=recording.mp4
```

---

**Q: Explain the GStreamer buffer lifecycle.**

A `GstBuffer` contains one or more `GstMemory` objects holding the actual data, plus metadata (timestamps, duration, flags). Buffers are reference-counted. When a source creates a buffer and pushes it downstream, the refcount is 1. If a tee duplicates the buffer to multiple branches, the refcount increases. Each element that finishes with the buffer unrefs it. When the refcount hits 0, the buffer is returned to a buffer pool (if one exists) or freed. Buffer pools are used to avoid allocation/deallocation overhead, especially with hardware memory (DMA-BUF, VA-API surfaces). A buffer is writable only when its refcount is 1; otherwise, you must copy it before modifying.

---

**Q: What are GStreamer buffer pools and why are they important?**

Buffer pools pre-allocate a fixed number of buffers that are reused rather than allocated and freed for each frame. This is critical for performance because: (1) Memory allocation is expensive, especially for large video frames. (2) Hardware elements (V4L2, VA-API) require buffers in specific memory regions (DMA-BUF, GPU memory) that cannot be allocated cheaply. (3) Pools enable zero-copy pipelines where the same buffer passes through multiple elements without copying data. Elements negotiate pool configuration during caps negotiation, agreeing on buffer size, minimum/maximum count, and memory type. The `bufferpool` negotiation happens through ALLOCATION queries.

---

**Q: How does GStreamer handle clock synchronization?**

Every pipeline has a clock, typically provided by the audio sink (since audio timing is more perceptible than video). The clock defines the pipeline's running time. Each buffer has a PTS (presentation timestamp). The sink element waits until the pipeline clock reaches the buffer's PTS before rendering it. For live sources (cameras, microphones), the element's clock provides timestamps. The pipeline can select between clocks from different elements. A/V sync works because both audio and video sinks reference the same pipeline clock. If an element introduces latency, it reports this via a LATENCY query, and the pipeline adjusts by adding latency compensation to all sinks.
