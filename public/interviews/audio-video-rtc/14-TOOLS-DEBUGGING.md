# Tools and Debugging for Audio/Video/RTC

Mastering debugging and analysis tools is what separates a capable media engineer from
a struggling one. Real-time media systems have unique failure modes -- packet loss,
jitter, codec negotiation failures, synchronization drift -- that cannot be diagnosed
with standard web debugging techniques alone. This guide covers the essential toolkit
every audio/video/RTC engineer must know.

---

## 1. FFprobe -- Analyzing Media Files

FFprobe is the analysis companion to FFmpeg. It extracts detailed information about
media containers, streams, codecs, frame timing, and bitrate without performing any
transcoding.

### Basic Stream Information

```bash
# Show all streams in a file
ffprobe -v quiet -show_streams input.mp4

# Show format-level metadata (duration, bitrate, container)
ffprobe -v quiet -show_format input.mp4

# Compact one-line summary
ffprobe -v quiet -show_entries format=duration,bit_rate,format_name \
  -of compact input.mp4
```

### JSON Output for Scripting

```bash
# Full probe in JSON format
ffprobe -v quiet -print_format json -show_format -show_streams input.mp4

# Extract specific fields as JSON
ffprobe -v quiet -print_format json \
  -show_entries stream=codec_name,width,height,r_frame_rate,bit_rate \
  input.mp4
```

### Frame-Level Analysis

```bash
# Show every frame (type, size, timestamp)
ffprobe -v quiet -show_frames -select_streams v:0 input.mp4

# Show only keyframes (I-frames)
ffprobe -v quiet -show_frames -select_streams v:0 \
  -show_entries frame=pict_type,pts_time,pkt_size \
  -of csv input.mp4 | grep "I"

# Count frames by type
ffprobe -v quiet -show_frames -select_streams v:0 \
  -show_entries frame=pict_type \
  -of csv input.mp4 | sort | uniq -c
```

### Packet Timing Analysis

```bash
# Show packet timestamps and sizes
ffprobe -v quiet -show_packets -select_streams v:0 \
  -show_entries packet=pts_time,dts_time,duration_time,size,flags \
  -of csv input.mp4

# Detect DTS/PTS discontinuities
ffprobe -v quiet -show_packets -select_streams v:0 \
  -show_entries packet=pts_time,dts_time \
  -of csv input.mp4 | awk -F',' '{
    if (NR > 1 && $2 - prev > 0.1) print "Gap at " $2 " (" $2-prev "s)";
    prev=$2
  }'
```

### Bitrate Analysis

```bash
# Per-frame bitrate for graphing
ffprobe -v quiet -show_packets -select_streams v:0 \
  -show_entries packet=pts_time,size \
  -of csv input.mp4 | awk -F',' '{print $2, $3*8/1024}' > bitrate.dat

# Average bitrate over sliding window
ffprobe -v quiet -show_entries format=bit_rate input.mp4
```

### Useful Day-to-Day Commands

```bash
# Quick codec check
ffprobe -v error -select_streams v:0 \
  -show_entries stream=codec_name -of default=nw=1 input.mp4

# Check if file has B-frames
ffprobe -v quiet -show_frames -select_streams v:0 \
  -show_entries frame=pict_type -of csv input.mp4 | grep -c "B"

# Verify audio sample rate and channels
ffprobe -v error -select_streams a:0 \
  -show_entries stream=sample_rate,channels,codec_name \
  -of default=nw=1 input.mp4

# Check for edit lists (can cause playback offset issues)
ffprobe -v quiet -show_entries stream=start_time input.mp4

# Analyze HLS playlist
ffprobe -v quiet -show_format -show_streams \
  "https://example.com/stream/master.m3u8"
```

---

## 2. MediaInfo -- Detailed Codec and Format Analysis

MediaInfo provides a different perspective from FFprobe with more human-readable output
and deeper container-level analysis. It excels at showing metadata that FFprobe may
omit.

### CLI Usage

```bash
# Full report
mediainfo input.mp4

# Specific output format
mediainfo --Output=JSON input.mp4
mediainfo --Output=XML input.mp4

# Specific fields
mediainfo --Inform="Video;%Width%x%Height% @ %FrameRate% fps" input.mp4
mediainfo --Inform="General;%Duration/String3%" input.mp4
```

### Key Information MediaInfo Excels At

| Category           | Details MediaInfo Reveals                                   |
| ------------------ | ----------------------------------------------------------- |
| Container          | Profile, compatibility flags, writing application           |
| Color space        | Matrix coefficients, transfer characteristics, primaries    |
| HDR metadata       | MaxCLL, MaxFALL, mastering display info                     |
| Audio details      | Channel layout names, compression mode, dialog norm         |
| Subtitle tracks    | Format, language, forced flags, default flags               |
| Encoding settings  | x264/x265 encoding options string (if preserved)            |

### MediaInfo vs. FFprobe

| Aspect                | FFprobe                        | MediaInfo                      |
| --------------------- | ------------------------------ | ------------------------------ |
| Best for              | Scripting, frame-level data    | Human-readable reports         |
| JSON output           | Native support                 | Supported but less granular    |
| Frame analysis        | Full per-frame data            | Summary statistics only        |
| HDR metadata          | Basic                          | Comprehensive                  |
| Container internals   | Good                           | Excellent (edit lists, atoms)  |
| Encoding settings     | Not shown                      | Preserved x264/x265 options    |
| Speed                 | Fast                           | Very fast (no decode needed)   |
| GUI                   | None                           | Cross-platform GUI available   |

### Practical Use Cases

```bash
# Verify HDR10 content
mediainfo --Inform="Video;%HDR_Format%" input.mkv

# Check if Dolby Vision metadata is present
mediainfo --Inform="Video;%HDR_Format/String%" input.mp4

# Identify encoding library and settings
mediainfo --Inform="Video;%Encoded_Library_Settings%" input.mp4

# Batch analysis of a directory
for f in *.mp4; do
  echo "=== $f ==="
  mediainfo --Inform="Video;%Width%x%Height% %Format% %BitRate/String%" "$f"
done
```

---

## 3. Wireshark for Media Protocols

Wireshark is indispensable for debugging real-time media at the network level. It can
decode RTP, RTCP, SIP, STUN, TURN, DTLS, and SRTP packets, making it essential for
WebRTC and VoIP debugging.

### Capturing RTP/RTCP Packets

```
# Capture filter for RTP traffic (common port ranges)
udp portrange 10000-60000

# Display filter for RTP
rtp

# Display filter for RTCP
rtcp

# Filter by SSRC
rtp.ssrc == 0x12345678

# Filter RTP by payload type
rtp.p_type == 111
```

### SIP Analysis

```
# Display filter for SIP
sip

# Follow a SIP dialog
sip.Call-ID == "abc123@example.com"

# Filter SIP by method
sip.Method == "INVITE"
sip.Method == "BYE"

# SIP response codes
sip.Status-Code == 200
sip.Status-Code >= 400  # Error responses
```

### STUN/TURN Debugging

```
# Display filter for STUN
stun

# Filter STUN by message type
stun.type == 0x0001  # Binding Request
stun.type == 0x0101  # Binding Response

# Filter TURN allocations
stun.type == 0x0003  # Allocate Request
stun.type == 0x0103  # Allocate Response

# Filter by STUN transaction ID
stun.id == "hex-transaction-id"
```

### RTP Stream Analysis

Wireshark's built-in RTP stream analysis is extremely powerful:

1. Navigate to **Telephony > RTP > RTP Streams**
2. Select a stream and click **Analyze**
3. Key metrics displayed:
   - **Max Delta**: Largest inter-packet gap (jitter indicator)
   - **Max Jitter**: Maximum jitter observed
   - **Mean Jitter**: Average jitter across the stream
   - **Lost packets**: Count and percentage of lost RTP packets
   - **Sequence errors**: Out-of-order or duplicate packets

### Jitter Graphs

1. From RTP Stream Analysis, click **Graph**
2. The graph shows:
   - **Forward jitter**: Variation in packet arrival times
   - **Reverse jitter**: For bidirectional streams
   - **Delta**: Inter-arrival time between consecutive packets
3. Spikes in jitter correlate with buffering events or quality drops

### Useful Filter Expressions for Media Protocols

```
# Combined media protocol filter
rtp || rtcp || stun || dtls || sip

# WebRTC-specific: DTLS handshake
dtls

# DTLS followed by SRTP on same port
udp.port == 5004 && (dtls || rtp)

# Filter out STUN keep-alives (focus on data)
rtp && !stun

# Large RTP packets (possible keyframes)
rtp && udp.length > 1200

# RTP packets with marker bit set (frame boundaries)
rtp.marker == 1

# RTCP Sender Reports
rtcp.pt == 200

# RTCP Receiver Reports
rtcp.pt == 201

# RTCP NACK (packet loss recovery requests)
rtcp.pt == 205
```

### Practical Wireshark Workflow for Media Debugging

```
Step 1: Start capture with filter "udp portrange 1024-65535"
Step 2: Reproduce the issue
Step 3: Stop capture
Step 4: Apply display filter "rtp"
Step 5: Telephony > RTP > RTP Streams to get overview
Step 6: Analyze specific streams for jitter/loss
Step 7: Check RTCP reports for sender/receiver stats
Step 8: Export stream as raw audio/video for offline analysis
```

---

## 4. Chrome WebRTC Internals

The `chrome://webrtc-internals` page is the primary debugging tool for WebRTC
applications in Chrome. It provides real-time statistics for all active
PeerConnections.

### Accessing WebRTC Internals

1. Open `chrome://webrtc-internals` in a new tab
2. Open your WebRTC application in another tab
3. The internals page auto-detects all PeerConnection instances

### Reading Stats Graphs

#### Bitrate

- **outbound-rtp > bytesSent**: Outgoing bitrate (video and audio separate)
- **inbound-rtp > bytesReceived**: Incoming bitrate
- Look for sudden drops indicating network congestion or bandwidth estimation changes
- Compare `targetBitrate` with `actualBitrate` to see if the encoder is meeting targets

#### Frame Rate

- **outbound-rtp > framesPerSecond**: Sent frame rate
- **inbound-rtp > framesPerSecond**: Received frame rate
- **framesDecoded** vs **framesReceived**: Gap indicates decode failures
- **framesDropped**: Non-zero values indicate rendering cannot keep up

#### Packet Loss

- **inbound-rtp > packetsLost**: Cumulative lost packets
- **inbound-rtp > packetsReceived**: Total received
- Loss ratio = `packetsLost / (packetsLost + packetsReceived)`
- Healthy: < 1%, Degraded: 1-5%, Critical: > 5%

#### Jitter

- **inbound-rtp > jitter**: Reported in seconds
- Healthy: < 30ms, Degraded: 30-100ms, Critical: > 100ms
- High jitter requires larger jitter buffers, increasing latency

#### Round-Trip Time (RTT)

- **remote-inbound-rtp > roundTripTime**: Measured via RTCP
- **candidate-pair > currentRoundTripTime**: ICE-level RTT
- Healthy: < 100ms for interactive, < 300ms for one-way

### Interpreting ICE Candidate Pairs

The ICE candidates section shows:

```
Candidate pair states:
- succeeded: Active pair in use
- waiting: Connectivity check pending
- in-progress: Check sent, awaiting response
- failed: Check failed (timeout or error)
- frozen: Not yet checked

Candidate types:
- host: Direct local IP
- srflx: Server reflexive (NAT external IP via STUN)
- prflx: Peer reflexive (discovered during checks)
- relay: TURN relay (fallback when direct fails)
```

**Healthy pattern**: A `succeeded` pair using `host` or `srflx` candidates.
**Problematic pattern**: Only `relay` candidates succeeded (indicates firewall/NAT
issues forcing TURN relay).

### Debugging Connection Failures

Common patterns visible in webrtc-internals:

1. **All candidates failed**: Firewall blocking UDP entirely
2. **Only relay works**: Symmetric NAT, STUN insufficient
3. **DTLS failure after ICE success**: Certificate mismatch or DTLS timeout
4. **No remote candidates**: Signaling channel issue (offer/answer not exchanged)

### getUserMedia Requests

The internals page shows all `getUserMedia()` calls with:
- Requested constraints (resolution, frame rate, audio settings)
- Actual track settings after constraint resolution
- Errors (NotAllowedError, NotFoundError, OverconstrainedError)

---

## 5. webrtc-internals Deep Dive

Beyond basic usage, experienced engineers extract maximum diagnostic value from
webrtc-internals through systematic metric analysis and automation.

### Key Metrics to Monitor

| Metric                              | Location                | Healthy Range          |
| ----------------------------------- | ----------------------- | ---------------------- |
| `framesPerSecond` (send)            | outbound-rtp            | 24-30 fps              |
| `framesPerSecond` (receive)         | inbound-rtp             | 24-30 fps              |
| `qualityLimitationReason`           | outbound-rtp            | "none"                 |
| `qualityLimitationDurations`        | outbound-rtp            | cpu: 0, bandwidth: 0   |
| `nackCount`                         | outbound-rtp            | Low (< 5/sec)          |
| `pliCount`                          | outbound-rtp            | Low (< 1/sec)          |
| `firCount`                          | outbound-rtp            | 0 ideally              |
| `jitterBufferDelay`                 | inbound-rtp             | < 100ms                |
| `jitterBufferTargetDelay`           | inbound-rtp             | Adaptive               |
| `totalDecodeTime`                   | inbound-rtp             | < frame_interval       |
| `keyFramesDecoded`                  | inbound-rtp             | Infrequent             |
| `freezeCount`                       | inbound-rtp             | 0                      |
| `totalFreezesDuration`              | inbound-rtp             | 0                      |
| `availableOutgoingBitrate`          | candidate-pair          | > target bitrate       |

### Common Failure Patterns

#### ICE Failure

```
Symptoms in webrtc-internals:
- iceConnectionState transitions: new -> checking -> failed
- All candidate pairs in "failed" state
- No "succeeded" pairs

Root causes:
- STUN/TURN server unreachable
- Firewall blocking UDP
- Symmetric NAT without TURN
- Incorrect ICE server configuration

Fix checklist:
1. Verify TURN server credentials are valid
2. Test STUN server: https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/
3. Ensure UDP ports 3478 and 49152-65535 are open
4. Add TCP TURN fallback (port 443)
```

#### DTLS Failure

```
Symptoms:
- iceConnectionState: connected (ICE works)
- dtlsState: failed
- connectionState: failed

Root causes:
- Certificate fingerprint mismatch (SDP tampering)
- DTLS timeout (network path changed after ICE)
- Middlebox interfering with DTLS handshake
- Clock skew causing certificate validation failure

Fix checklist:
1. Verify SDP fingerprint matches actual certificate
2. Check for DTLS retransmission timeouts in packet capture
3. Ensure no TLS-intercepting proxy on the network
```

#### Codec Mismatch

```
Symptoms:
- Connection succeeds but no media flows
- outbound-rtp shows bytesSent increasing
- inbound-rtp shows bytesReceived = 0 or framesDecoded = 0

Root causes:
- No common codec in offer/answer negotiation
- Hardware decoder does not support negotiated profile
- SDP munging removed required codec

Fix checklist:
1. Compare offer and answer SDP for matching codecs
2. Check codec capabilities: RTCRtpSender.getCapabilities('video')
3. Verify H.264 profile level matches (Baseline vs High)
```

### Exporting Stats

```
From chrome://webrtc-internals:
1. Click "Create Dump" at the top of the page
2. Downloads a JSON file with all PeerConnection stats
3. Can be replayed/analyzed offline

The dump includes:
- Full SDP offer/answer exchange
- ICE candidate gathering log
- All getStats() snapshots over time
- getUserMedia requests and results
```

### Automation with getStats() API

```javascript
// Collect stats programmatically
async function collectStats(peerConnection) {
  const stats = await peerConnection.getStats();
  const report = {};

  stats.forEach((stat) => {
    if (stat.type === 'inbound-rtp' && stat.kind === 'video') {
      report.video_inbound = {
        packetsReceived: stat.packetsReceived,
        packetsLost: stat.packetsLost,
        bytesReceived: stat.bytesReceived,
        framesDecoded: stat.framesDecoded,
        framesDropped: stat.framesDropped,
        jitter: stat.jitter,
        freezeCount: stat.freezeCount,
        totalFreezesDuration: stat.totalFreezesDuration,
      };
    }

    if (stat.type === 'outbound-rtp' && stat.kind === 'video') {
      report.video_outbound = {
        packetsSent: stat.packetsSent,
        bytesSent: stat.bytesSent,
        framesPerSecond: stat.framesPerSecond,
        qualityLimitationReason: stat.qualityLimitationReason,
        nackCount: stat.nackCount,
        pliCount: stat.pliCount,
        targetBitrate: stat.targetBitrate,
      };
    }

    if (stat.type === 'candidate-pair' && stat.nominated) {
      report.connection = {
        currentRoundTripTime: stat.currentRoundTripTime,
        availableOutgoingBitrate: stat.availableOutgoingBitrate,
        localCandidateType: stat.localCandidateId,
        remoteCandidateType: stat.remoteCandidateId,
      };
    }
  });

  return report;
}

// Periodic collection for monitoring
function startMonitoring(pc, intervalMs = 2000) {
  const history = [];
  const timer = setInterval(async () => {
    const snapshot = await collectStats(pc);
    snapshot.timestamp = Date.now();
    history.push(snapshot);
  }, intervalMs);

  return {
    stop: () => clearInterval(timer),
    getHistory: () => [...history],
  };
}

// Calculate derived metrics from raw stats
function computeDerivedMetrics(current, previous) {
  const timeDelta = (current.timestamp - previous.timestamp) / 1000;

  const bitrateKbps =
    ((current.video_inbound.bytesReceived -
      previous.video_inbound.bytesReceived) *
      8) /
    1000 /
    timeDelta;

  const lossRate =
    (current.video_inbound.packetsLost - previous.video_inbound.packetsLost) /
    (current.video_inbound.packetsReceived -
      previous.video_inbound.packetsReceived +
      current.video_inbound.packetsLost -
      previous.video_inbound.packetsLost);

  return { bitrateKbps, lossRate };
}
```

---

## 6. Browser DevTools for Media

Beyond webrtc-internals, browser developer tools offer additional media debugging
capabilities.

### Network Tab for HLS/DASH Segments

For adaptive streaming, the Network tab reveals critical information:

```
Debugging HLS:
1. Filter by "m3u8" to see playlist requests
2. Filter by ".ts" or ".m4s" to see segment downloads
3. Check timing waterfall for segment download duration
4. Compare segment download time vs segment duration
   - If download_time > segment_duration => buffering will occur

Key columns to watch:
- Status: 200 OK vs 206 Partial Content vs errors
- Size: Segment size consistency
- Time: Download duration per segment
- Waterfall: Parallel vs sequential segment fetches
```

### Chrome Media Panel

Chrome DevTools has a dedicated Media panel (enable via DevTools > More Tools > Media):

```
Information shown:
- Active media players on the page
- Codec and container details
- Decoder status (hardware vs software)
- Dropped frames count
- Buffer ranges (audio and video)
- Events log (play, pause, seeking, error, stall)
- Properties:
  - Resolution, frame rate, bitrate
  - Video decoder type
  - Audio decoder type
  - Whether hardware acceleration is active
```

### Performance Profiling for Video Rendering

```
Using Chrome Performance tab:
1. Start recording
2. Play video or run WebRTC session
3. Stop recording
4. Look for:
   - GPU rasterization time (yellow blocks)
   - Compositor frame drops (red triangles)
   - Main thread jank blocking video decode
   - requestAnimationFrame timing consistency

Key indicators of video rendering issues:
- Long frames (> 16.6ms for 60fps display)
- GPU process bottleneck in summary
- "Dropped frames" markers in the timeline
```

### Memory Profiling for Media Apps

```
Common memory issues in media applications:
- MediaStream tracks not stopped (leak camera/mic)
- Video elements not removed from DOM
- Accumulated getStats() snapshots without cleanup
- Canvas/WebGL contexts not released
- Decoded frame buffers growing unbounded

Debugging steps:
1. Take heap snapshot before starting media
2. Run media for 5 minutes
3. Take another heap snapshot
4. Compare snapshots for growth
5. Look for MediaStream, RTCPeerConnection, VideoFrame objects
6. Check detached DOM nodes holding media elements
```

---

## 7. MP4Box.js / mp4dump -- Inspecting MP4 Box Structure

Understanding the internal box (atom) structure of MP4 files is essential for debugging
MSE (Media Source Extensions) playback, fragmented MP4 issues, and DASH/HLS packaging.

### MP4 Box Structure Fundamentals

```
MP4 files are organized as nested boxes (also called atoms):

ftyp  -- File type and compatibility
moov  -- Movie metadata (for non-fragmented MP4)
  mvhd  -- Movie header (timescale, duration)
  trak  -- Track (one per stream: video, audio)
    tkhd  -- Track header
    mdia  -- Media information
      mdhd  -- Media header (timescale)
      hdlr  -- Handler (vide, soun)
      minf  -- Media information container
        stbl  -- Sample table
          stsd  -- Sample description (codec config)
          stts  -- Time-to-sample
          stsc  -- Sample-to-chunk
          stsz  -- Sample sizes
          stco  -- Chunk offsets
          stss  -- Sync sample table (keyframes)
mdat  -- Actual media data

For fragmented MP4 (fMP4):
moov (init segment, no sample data)
moof  -- Movie fragment
  mfhd  -- Movie fragment header
  traf  -- Track fragment
    tfhd  -- Track fragment header
    tfdt  -- Track fragment decode time
    trun  -- Track fragment run (sample table)
mdat  -- Fragment media data
[moof + mdat repeat for each segment]
```

### Using MP4Box.js in the Browser

```javascript
// Load and parse MP4 in the browser
const mp4box = MP4Box.createFile();

mp4box.onReady = function (info) {
  console.log('Duration:', info.duration / info.timescale, 'seconds');
  console.log('Tracks:', info.tracks.length);

  info.tracks.forEach((track) => {
    console.log(`Track ${track.id}:`, {
      type: track.type,
      codec: track.codec,
      width: track.video ? track.video.width : undefined,
      height: track.video ? track.video.height : undefined,
      sampleRate: track.audio ? track.audio.sample_rate : undefined,
      timescale: track.timescale,
      nb_samples: track.nb_samples,
    });
  });
};

mp4box.onError = function (e) {
  console.error('Parse error:', e);
};

// Feed data from fetch
const response = await fetch('video.mp4');
const buffer = await response.arrayBuffer();
buffer.fileStart = 0;
mp4box.appendBuffer(buffer);
mp4box.flush();
```

### Using mp4dump (Command Line)

```bash
# Dump complete box tree
mp4dump input.mp4

# Show only top-level boxes
mp4dump --verbosity 0 input.mp4

# Typical output for a fragmented MP4:
# [ftyp] size=24
# [moov] size=812
#   [mvhd] size=108
#   [trak] size=696
#     [tkhd] size=92
#     [mdia] size=596
# [moof] size=200
#   [mfhd] size=16
#   [traf] size=176
#     [tfhd] size=16
#     [tfdt] size=20
#     [trun] size=132
# [mdat] size=48576
```

### Debugging MSE Issues

```
Common MSE problems and what to look for in box structure:

1. "Failed to execute 'appendBuffer'" errors:
   - Check that init segment has moov but no mdat
   - Verify sequence numbers in mfhd are incrementing
   - Ensure codec string matches SourceBuffer MIME type

2. Gap between segments:
   - Check tfdt (Track Fragment Decode Time) for continuity
   - Verify trun sample durations sum correctly

3. Audio/video sync drift:
   - Compare timescales between audio and video tracks
   - Check that tfdt base times align

4. Playback stutter at segment boundaries:
   - Look for missing SAP (Stream Access Point) at segment start
   - Verify first sample in trun has sync flag set
```

---

## 8. Bento4 Tools -- Swiss Army Knife for MP4

Bento4 is an open-source C++ toolkit for MP4 manipulation with a suite of
purpose-built command-line utilities.

### mp4info -- Container Analysis

```bash
# Comprehensive file information
mp4info input.mp4

# Output includes:
# - File size and duration
# - Track details (codec, resolution, bitrate)
# - Sample count and sizes
# - Sync sample positions (keyframes)
# - Edit list information
```

### mp4dump -- Box Structure

```bash
# Full box tree with hex dumps
mp4dump input.mp4

# Filter to specific box types
mp4dump --verbosity 2 input.mp4

# Useful for verifying:
# - avcC/hvcC codec configuration boxes
# - pssh boxes for DRM
# - edts/elst boxes for timing offsets
```

### mp4fragment -- Creating Fragmented MP4

```bash
# Fragment a regular MP4 for DASH/HLS
mp4fragment input.mp4 fragmented.mp4

# Specify fragment duration (in milliseconds)
mp4fragment --fragment-duration 4000 input.mp4 fragmented.mp4

# Verify fragmentation
mp4dump fragmented.mp4 | head -50
# Should show: ftyp, moov, moof, mdat, moof, mdat, ...
```

### mp4dash -- DASH Packaging

```bash
# Create DASH manifest from multiple qualities
mp4dash --output-dir=dash_output/ \
  video_1080p.mp4 \
  video_720p.mp4 \
  video_480p.mp4 \
  audio_128k.mp4

# With segment duration control
mp4dash --segment-duration=4 --output-dir=dash_output/ \
  fragmented_video.mp4 fragmented_audio.mp4

# Output structure:
# dash_output/
#   stream.mpd           (DASH manifest)
#   audio/
#     init.mp4           (init segment)
#     seg-1.m4s          (media segments)
#     seg-2.m4s
#   video_1080p/
#     init.mp4
#     seg-1.m4s
#     seg-2.m4s
```

### mp4hls -- HLS Packaging

```bash
# Create HLS output with multiple variants
mp4hls --output-dir=hls_output/ \
  video_1080p.mp4 \
  video_720p.mp4 \
  audio_128k.mp4

# With encryption (AES-128)
mp4hls --encryption-mode=AES-128 \
  --encryption-key=00112233445566778899aabbccddeeff \
  --output-dir=hls_output/ \
  fragmented.mp4

# Output structure:
# hls_output/
#   master.m3u8          (master playlist)
#   media-1/
#     stream.m3u8        (variant playlist)
#     init.mp4
#     seg-00001.m4s
```

### Other Useful Bento4 Tools

```bash
# mp4encrypt -- Add DRM encryption
mp4encrypt --method MPEG-CENC \
  --key 1:00112233445566778899aabbccddeeff:random \
  input.mp4 encrypted.mp4

# mp4decrypt -- Remove DRM (with key)
mp4decrypt --key 1:00112233445566778899aabbccddeeff \
  encrypted.mp4 decrypted.mp4

# mp4split -- Create server-side manifest for smooth streaming
mp4split input.mp4

# mp4compact -- Optimize MP4 for streaming
mp4compact input.mp4 compacted.mp4
```

---

## 9. VLC for Testing

VLC is more than a media player. It is a Swiss army knife for testing streaming
protocols, verifying media files, and even acting as a lightweight streaming server.

### Playing Various Protocols

```bash
# Play RTSP stream
vlc rtsp://server:554/stream

# Play RTMP stream
vlc rtmp://server:1935/live/stream

# Play HLS
vlc https://example.com/master.m3u8

# Play DASH
vlc https://example.com/manifest.mpd

# Play RTP stream (with SDP file)
vlc stream.sdp

# Play raw RTP
vlc rtp://@:5004
```

### VLC as a Streaming Server

```bash
# Stream a file over HTTP (HLS-like)
vlc input.mp4 --sout '#standard{access=http,mux=ts,dst=:8080/stream}'

# Stream to RTP
vlc input.mp4 --sout '#rtp{dst=239.0.0.1,port=5004,mux=ts}'

# Transcode and stream
vlc input.mp4 --sout '#transcode{vcodec=h264,vb=2000,\
  acodec=mpga,ab=128}:standard{access=http,mux=ts,dst=:8080}'

# Stream webcam
vlc v4l2:///dev/video0 --sout '#standard{access=http,mux=ts,dst=:8080}'
```

### Command-Line Usage for Testing

```bash
# Play without GUI (headless testing)
cvlc input.mp4

# Extract codec info
vlc --intf dummy --vout dummy input.mp4 vlc://quit 2>&1 | grep codec

# Record a stream
vlc rtsp://server:554/live \
  --sout '#standard{access=file,mux=mp4,dst=recording.mp4}' \
  --run-time=60 vlc://quit

# Convert format
vlc input.mkv \
  --sout '#transcode{vcodec=h264,acodec=mp4a}:\
  standard{access=file,mux=mp4,dst=output.mp4}' \
  vlc://quit

# Test a stream and exit after 10 seconds
timeout 10 cvlc rtsp://server:554/stream --vout dummy --aout dummy
echo $?  # 0 = success, non-zero = failure
```

### VLC Diagnostic Output

```bash
# Verbose output for debugging
vlc -vvv input.mp4 2>&1 | tee vlc_debug.log

# Key log entries to look for:
# [demux] -- Container parsing issues
# [decoder] -- Codec errors
# [video output] -- Rendering problems
# [access] -- Network/protocol issues
# [stream] -- Buffering events
```

---

## 10. GStreamer Debugging

GStreamer's plugin-based pipeline architecture provides powerful debugging capabilities
through environment variables, visualization tools, and built-in tracing.

### GST_DEBUG Levels

```bash
# Debug level hierarchy:
# 0 = none
# 1 = ERROR
# 2 = WARNING
# 3 = FIXME
# 4 = INFO
# 5 = DEBUG
# 6 = LOG
# 7 = TRACE
# 9 = MEMDUMP

# Set global debug level
GST_DEBUG=3 gst-launch-1.0 videotestsrc ! autovideosink

# Set per-element debug level
GST_DEBUG=videotestsrc:5,autovideosink:4 gst-launch-1.0 \
  videotestsrc ! autovideosink

# Debug specific categories
GST_DEBUG=GST_CAPS:5 gst-launch-1.0 ...  # Capability negotiation
GST_DEBUG=GST_SCHEDULING:5 ...            # Pipeline scheduling
GST_DEBUG=basesrc:5 ...                   # Source element internals

# Log to file
GST_DEBUG=5 GST_DEBUG_FILE=/tmp/gst.log gst-launch-1.0 ...

# Colorized output
GST_DEBUG_COLOR_MODE=on GST_DEBUG=4 gst-launch-1.0 ...
```

### Pipeline Visualization with Dot Graphs

```bash
# Enable dot graph generation
GST_DEBUG_DUMP_DOT_DIR=/tmp/dots gst-launch-1.0 \
  videotestsrc ! x264enc ! mp4mux ! filesink location=out.mp4

# Convert dot files to PNG
dot -Tpng /tmp/dots/0.00.00.*.dot -o pipeline.png

# Dot files are generated at state changes:
# - NULL -> READY
# - READY -> PAUSED
# - PAUSED -> PLAYING
# Each shows elements, pads, and negotiated caps
```

### gst-debug-viewer

```bash
# GUI tool for analyzing GStreamer debug logs
# Install: pip install gst-debug-viewer (or from package manager)

# Generate log file
GST_DEBUG=5 GST_DEBUG_FILE=debug.log gst-launch-1.0 \
  filesrc location=input.mp4 ! decodebin ! autovideosink

# Open in viewer
gst-debug-viewer debug.log

# Features:
# - Filter by category, level, element
# - Search through messages
# - Colorized display
# - Timeline view
```

### Useful GStreamer Debug Pipelines

```bash
# Test video playback with metrics
gst-launch-1.0 filesrc location=input.mp4 ! \
  decodebin ! fpsdisplaysink text-overlay=true video-sink=autovideosink

# Debug RTP pipeline
GST_DEBUG=rtpjitterbuffer:5,rtpsession:5 gst-launch-1.0 \
  udpsrc port=5004 caps="application/x-rtp,payload=96" ! \
  rtpjitterbuffer ! rtph264depay ! avdec_h264 ! autovideosink

# Inspect element capabilities
gst-inspect-1.0 x264enc

# List all available elements
gst-inspect-1.0 | grep -i rtp
```

---

## 11. Test Pattern Generators

Generating known test content is essential for isolating issues. Is the problem in the
source, the encoder, the network, or the decoder? Test patterns provide a known-good
reference.

### FFmpeg Test Sources

```bash
# SMPTE color bars (standard broadcast test pattern)
ffmpeg -f lavfi -i smptebars=size=1920x1080:rate=30 \
  -t 10 -c:v libx264 smpte_bars.mp4

# Test source with moving pattern and timestamp
ffmpeg -f lavfi -i testsrc=size=1920x1080:rate=30 \
  -t 10 -c:v libx264 testsrc.mp4

# Test source v2 (more detailed, includes frame counter)
ffmpeg -f lavfi -i testsrc2=size=1920x1080:rate=30 \
  -t 10 -c:v libx264 testsrc2.mp4

# Color test with specific color
ffmpeg -f lavfi -i "color=c=red:s=1920x1080:r=30" \
  -t 5 -c:v libx264 red.mp4

# Mandelbrot fractal (good for testing encoder complexity handling)
ffmpeg -f lavfi -i mandelbrot=size=1920x1080:rate=30 \
  -t 10 -c:v libx264 mandelbrot.mp4

# Life simulation (varying complexity over time)
ffmpeg -f lavfi -i life=size=1920x1080:rate=30 \
  -t 10 -c:v libx264 life.mp4

# Noise pattern (worst case for encoders)
ffmpeg -f lavfi -i "nullsrc=size=1920x1080:rate=30,geq=random(1)*255" \
  -t 5 -c:v libx264 -crf 23 noise.mp4
```

### Audio Test Sources

```bash
# Generate sine wave tone
ffmpeg -f lavfi -i "sine=frequency=1000:sample_rate=48000" \
  -t 5 -c:a aac tone_1khz.m4a

# Generate sweep (frequency ramp)
ffmpeg -f lavfi -i "sine=frequency=100:beep_factor=4:sample_rate=48000" \
  -t 10 -c:a aac sweep.m4a

# White noise
ffmpeg -f lavfi -i "anoisesrc=color=white:sample_rate=48000" \
  -t 5 -c:a aac white_noise.m4a

# Silence (useful for testing audio sync)
ffmpeg -f lavfi -i "anullsrc=sample_rate=48000:channel_layout=stereo" \
  -t 10 -c:a aac silence.m4a

# Combined audio + video test pattern
ffmpeg -f lavfi -i testsrc2=size=1920x1080:rate=30 \
  -f lavfi -i "sine=frequency=440:sample_rate=48000" \
  -t 10 -c:v libx264 -c:a aac combined_test.mp4
```

### Test Patterns for Specific Scenarios

```bash
# High-motion content (stress test for encoders)
ffmpeg -f lavfi -i "testsrc2=size=1920x1080:rate=60" \
  -vf "scroll=horizontal=0.05" \
  -t 10 -c:v libx264 -preset fast high_motion.mp4

# Scene change test (abrupt content switches)
ffmpeg -f lavfi -i "color=red:s=1920x1080:r=30:d=2" \
  -f lavfi -i "color=blue:s=1920x1080:r=30:d=2" \
  -f lavfi -i "color=green:s=1920x1080:r=30:d=2" \
  -filter_complex "[0][1][2]concat=n=3" \
  -c:v libx264 scene_change.mp4

# Specific resolution and frame rate for device testing
ffmpeg -f lavfi -i testsrc2=size=640x480:rate=15 \
  -t 10 -c:v libx264 -profile:v baseline mobile_test.mp4
```

---

## 12. Network Simulation

Testing media applications under adverse network conditions is critical. Real-world
networks have latency, jitter, packet loss, and bandwidth constraints that must be
simulated during development.

### Linux tc/netem

```bash
# Add 100ms latency to interface
sudo tc qdisc add dev eth0 root netem delay 100ms

# Add latency with jitter (100ms +/- 20ms, normal distribution)
sudo tc qdisc add dev eth0 root netem delay 100ms 20ms distribution normal

# Add 5% packet loss
sudo tc qdisc add dev eth0 root netem loss 5%

# Add packet loss with correlation (bursty loss)
sudo tc qdisc add dev eth0 root netem loss 5% 25%

# Add bandwidth limit (1 Mbit/s)
sudo tc qdisc add dev eth0 root tbf rate 1mbit burst 32kbit latency 400ms

# Combined: latency + jitter + loss + bandwidth limit
sudo tc qdisc add dev eth0 root handle 1: netem \
  delay 50ms 10ms loss 2%
sudo tc qdisc add dev eth0 parent 1: tbf \
  rate 2mbit burst 32kbit latency 400ms

# Remove all rules
sudo tc qdisc del dev eth0 root

# Show current rules
tc qdisc show dev eth0

# Apply to specific port range (using iptables + netem)
sudo iptables -A OUTPUT -p udp --dport 10000:60000 -j MARK --set-mark 1
sudo tc qdisc add dev eth0 root handle 1: prio
sudo tc qdisc add dev eth0 parent 1:3 handle 30: netem delay 100ms loss 3%
sudo tc filter add dev eth0 parent 1:0 protocol ip handle 1 fw flowid 1:3
```

### macOS Network Link Conditioner

```
Setup:
1. Download "Additional Tools for Xcode" from Apple Developer
2. Install "Hardware IO Tools" package
3. Open "Network Link Conditioner" from System Preferences

Built-in profiles:
- 100% Loss: Complete packet loss
- 3G: ~100ms latency, ~780 Kbps down, ~330 Kbps up
- DSL: ~5ms latency, ~2 Mbps down, ~256 Kbps up
- Edge: ~400ms latency, ~240 Kbps down, ~200 Kbps up
- LTE: ~50ms latency, ~50 Mbps down, ~10 Mbps up
- WiFi: ~1ms latency, ~40 Mbps down, ~33 Mbps up
- WiFi 802.11ac: ~1ms latency, ~80 Mbps symmetric

Custom profiles allow setting:
- Bandwidth (in/out)
- Packets dropped (%)
- Delay (ms)
- Protocol (Any, UDP, TCP)
```

### Clumsy (Windows)

```
Clumsy intercepts network packets on Windows using WinDivert:

Features:
- Lag: Add delay to packets
- Drop: Random packet loss
- Throttle: Block packets periodically
- Duplicate: Send packets multiple times
- Out of order: Reorder packets
- Tamper: Corrupt packet contents

Filter examples:
- outbound and udp and udp.DstPort == 3478  (STUN traffic)
- udp and (udp.SrcPort >= 10000 and udp.SrcPort <= 60000)  (RTP range)
```

### Testing Strategies for Media Under Poor Networks

```
Recommended test matrix for WebRTC applications:

| Scenario              | Latency | Jitter | Loss | Bandwidth |
| --------------------- | ------- | ------ | ---- | --------- |
| Excellent WiFi        | 5ms     | 1ms    | 0%   | 50 Mbps   |
| Good WiFi             | 20ms    | 5ms    | 0.1% | 10 Mbps   |
| Poor WiFi             | 50ms    | 20ms   | 2%   | 2 Mbps    |
| Mobile 4G             | 50ms    | 15ms   | 0.5% | 5 Mbps    |
| Mobile 3G             | 100ms   | 30ms   | 3%   | 1 Mbps    |
| Congested network     | 200ms   | 50ms   | 5%   | 500 Kbps  |
| Intercontinental      | 150ms   | 10ms   | 0.5% | 10 Mbps   |
| Satellite             | 600ms   | 50ms   | 1%   | 2 Mbps    |

What to verify at each condition:
1. Audio quality (MOS score equivalent)
2. Video frame rate and resolution adaptation
3. Lip sync (A/V synchronization)
4. Time to first frame
5. Recovery time after network improvement
6. Freeze count and duration
7. Bitrate adaptation speed
```

---

## 13. Performance Profiling

Media applications are CPU-, GPU-, and memory-intensive. Profiling identifies
bottlenecks before they cause dropped frames, audio glitches, or excessive battery
drain.

### CPU Profiling for Encoding/Decoding

```bash
# Linux: perf for FFmpeg encoding
perf record -g ffmpeg -i input.mp4 -c:v libx264 -preset medium output.mp4
perf report

# macOS: Instruments for encoding
instruments -t "Time Profiler" -D profile.trace \
  ffmpeg -i input.mp4 -c:v libx264 output.mp4

# flamegraph from perf data
perf script | stackcollapse-perf.pl | flamegraph.pl > encode_flame.svg

# Identify top CPU consumers in media pipeline
# Typical hotspots:
# - Motion estimation (x264/x265 me_range, subme)
# - Transform and quantization
# - In-loop deblock filter
# - Entropy coding (CABAC vs CAVLC)
# - Color space conversion (YUV <-> RGB)
```

### GPU Utilization Monitoring

```bash
# NVIDIA GPU monitoring
nvidia-smi dmon -s pucvmet -d 1
# p = power, u = utilization, c = clocks, v = violations,
# m = memory, e = ecc errors, t = temperature

# Continuous GPU utilization
watch -n 1 nvidia-smi

# Intel GPU (Linux)
intel_gpu_top

# macOS GPU monitoring
sudo powermetrics --samplers gpu_power -i 1000

# Key metrics for media workloads:
# - Video Encode utilization (NVENC/VCE/QSV)
# - Video Decode utilization (NVDEC/VCN/QSV)
# - GPU memory used by frame buffers
# - PCIe bandwidth (for frame transfers)
```

### Memory Analysis for Media Buffers

```bash
# Track memory usage over time
/usr/bin/time -v ffmpeg -i input.mp4 -c:v libx264 output.mp4

# Valgrind for memory leaks in native media code
valgrind --leak-check=full --track-origins=yes \
  ./media_application

# Memory profiling for Node.js media apps
node --inspect --max-old-space-size=4096 server.js
# Then use Chrome DevTools Memory tab

# Common memory budget for media:
# - 1080p frame (YUV 4:2:0): ~3 MB
# - Decoded frame buffer (5 frames): ~15 MB
# - Jitter buffer (200ms at 30fps): ~18 MB
# - Encoder reference frames (4 refs): ~12 MB
# - Total per-stream baseline: ~50-100 MB
```

### I/O Profiling

```bash
# Monitor disk I/O during recording/transcoding
iostat -x 1

# Trace file operations
strace -e trace=read,write,open -p <pid>  # Linux
dtruss -t read -t write -p <pid>          # macOS

# Key I/O patterns to watch:
# - Sequential read throughput for source files
# - Write amplification from multiple output qualities
# - Seek patterns for MP4 moov atom location
# - Memory-mapped file efficiency for large media files
```

---

## 14. Monitoring in Production

Production media systems require purpose-built monitoring that goes beyond standard web
application metrics.

### Prometheus Metrics for Media Servers

```yaml
# Key metrics to expose from media servers:

# Connection metrics
webrtc_active_connections{type="publisher|subscriber"} gauge
webrtc_connection_duration_seconds histogram
webrtc_ice_candidate_type{type="host|srflx|relay"} counter

# Quality metrics
media_packet_loss_ratio{stream_id, direction} gauge
media_jitter_seconds{stream_id, direction} gauge
media_round_trip_time_seconds{stream_id} gauge
media_bitrate_bps{stream_id, kind="audio|video"} gauge
media_frame_rate{stream_id} gauge

# Encoding metrics
encoder_cpu_usage_percent{codec, resolution} gauge
encoder_queue_depth{codec} gauge
transcoding_latency_seconds{codec, resolution} histogram

# Server health
sfu_cpu_usage_percent gauge
sfu_memory_bytes gauge
sfu_bandwidth_in_bps gauge
sfu_bandwidth_out_bps gauge
turn_active_allocations gauge
turn_bandwidth_bytes_total counter
```

### Grafana Dashboards

```
Essential dashboard panels for media systems:

1. Overview Dashboard:
   - Active sessions (time series)
   - Total bandwidth in/out (gauges)
   - Server CPU/memory (time series)
   - Error rate (time series)

2. Quality Dashboard:
   - Packet loss distribution (heatmap)
   - Jitter distribution (histogram)
   - RTT percentiles (p50, p95, p99)
   - Frame rate distribution
   - Resolution breakdown (pie chart)
   - Quality limitation reasons (stacked bar)

3. Per-Session Dashboard:
   - Bitrate over time (audio + video)
   - Packet loss over time
   - Jitter over time
   - ICE candidate type used
   - Codec in use
   - Resolution changes over session lifetime
   - NACK/PLI/FIR counts

4. Infrastructure Dashboard:
   - TURN server allocation count
   - TURN bandwidth per relay
   - Signaling server WebSocket connections
   - Media server cluster load distribution
   - Geographic distribution of users
```

### Alerting on Quality Metrics

```yaml
# Prometheus alerting rules for media quality

groups:
  - name: media_quality
    rules:
      - alert: HighPacketLoss
        expr: avg(media_packet_loss_ratio) > 0.05
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "Average packet loss exceeds 5%"

      - alert: CriticalPacketLoss
        expr: avg(media_packet_loss_ratio) > 0.15
        for: 1m
        labels:
          severity: critical

      - alert: HighJitter
        expr: avg(media_jitter_seconds) > 0.1
        for: 3m
        labels:
          severity: warning
        annotations:
          summary: "Average jitter exceeds 100ms"

      - alert: HighRTT
        expr: histogram_quantile(0.95, media_round_trip_time_seconds) > 0.3
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "P95 RTT exceeds 300ms"

      - alert: LowFrameRate
        expr: avg(media_frame_rate) < 15
        for: 2m
        labels:
          severity: warning

      - alert: TURNServerOverloaded
        expr: turn_active_allocations > 5000
        for: 1m
        labels:
          severity: critical

      - alert: TranscodingBacklog
        expr: encoder_queue_depth > 100
        for: 1m
        labels:
          severity: warning
```

### Log Aggregation Patterns

```
Structured logging for media systems:

{
  "timestamp": "2024-01-15T10:30:00Z",
  "level": "info",
  "event": "session_quality_report",
  "session_id": "abc-123",
  "participant_id": "user-456",
  "duration_seconds": 300,
  "audio": {
    "codec": "opus",
    "packets_sent": 15000,
    "packets_lost": 45,
    "loss_ratio": 0.003,
    "avg_jitter_ms": 12
  },
  "video": {
    "codec": "VP8",
    "resolution": "1280x720",
    "avg_fps": 28.5,
    "packets_sent": 90000,
    "packets_lost": 900,
    "loss_ratio": 0.01,
    "nack_count": 150,
    "pli_count": 3,
    "avg_bitrate_kbps": 1500,
    "quality_limitation": "bandwidth"
  },
  "connection": {
    "ice_type": "srflx",
    "avg_rtt_ms": 45,
    "turn_relay": false
  }
}

Log aggregation best practices:
1. Log session start/end with full connection details
2. Periodic quality snapshots (every 10-30 seconds)
3. Log all ICE state transitions
4. Log codec negotiation results
5. Log quality adaptation events (resolution/bitrate changes)
6. Tag logs with session_id for correlation
7. Use structured JSON for machine-parseable logs
8. Ship to ELK/Loki/Datadog for analysis
```

---

## 15. Common Debugging Scenarios

### WebRTC Connection Failure Checklist

```
Step 1: Check signaling
  [ ] Is the signaling channel (WebSocket) connected?
  [ ] Was the SDP offer sent successfully?
  [ ] Was the SDP answer received?
  [ ] Were ICE candidates exchanged?

Step 2: Check ICE
  [ ] Are STUN/TURN servers configured?
  [ ] Are STUN/TURN servers reachable? (test with curl or trickle-ice tool)
  [ ] Are TURN credentials valid and not expired?
  [ ] Is UDP traffic allowed on the network?
  [ ] Check iceConnectionState transitions in webrtc-internals

Step 3: Check DTLS
  [ ] Did DTLS handshake complete?
  [ ] Is there a certificate fingerprint mismatch?
  [ ] Check dtlsState in webrtc-internals

Step 4: Check media
  [ ] Is getUserMedia succeeding?
  [ ] Are tracks added to PeerConnection before creating offer?
  [ ] Is there a common codec between offer and answer?
  [ ] Check outbound-rtp for bytesSent > 0
  [ ] Check inbound-rtp for bytesReceived > 0
```

### Video Playback Issues

```
HTML5 Video Element Not Playing:

1. Check error event:
   video.error.code:
   1 = MEDIA_ERR_ABORTED
   2 = MEDIA_ERR_NETWORK
   3 = MEDIA_ERR_DECODE
   4 = MEDIA_ERR_SRC_NOT_SUPPORTED

2. Check codec support:
   MediaSource.isTypeSupported('video/mp4; codecs="avc1.64001f"')

3. Verify container/codec combination:
   - MP4 + H.264 + AAC = Universal support
   - WebM + VP9 + Opus = Chrome/Firefox
   - MP4 + H.265/HEVC = Safari only (generally)

4. Check for CORS issues:
   - Is the video served with Access-Control-Allow-Origin?
   - Are credentials needed?

5. Check for autoplay policy:
   - Muted autoplay is generally allowed
   - Unmuted autoplay requires user gesture
   - Check document.hasFocus() and user activation state

6. MSE-specific issues:
   - Is the init segment appended before media segments?
   - Are segment timestamps continuous?
   - Is the SourceBuffer not full? (QuotaExceededError)
   - Check MediaSource.readyState === 'open'
```

### Audio Sync Problems

```
Diagnosing A/V Synchronization Issues:

1. Measure the offset:
   - Use test content with visible audio cue (clap, flash)
   - Record playback and measure offset in editing tool
   - Target: < 40ms for acceptable lip sync

2. Common causes:
   a. Different timescales for audio/video tracks
      - Check with: ffprobe -show_entries stream=time_base input.mp4
      - Both should reference a common timeline

   b. Decoder initialization delay
      - Audio decoders warm up faster than video decoders
      - Solution: Pre-buffer both streams before playback

   c. Jitter buffer differences
      - Audio and video may have different jitter buffer depths
      - Check jitterBufferDelay in getStats()

   d. Edit list (elst) offset in MP4
      - Check: mp4dump input.mp4 | grep elst
      - Remove with: ffmpeg -i input.mp4 -c copy -movflags +faststart output.mp4

   e. Encoder delay (priming samples)
      - AAC has ~2048 samples of encoder delay
      - Check: ffprobe -show_entries stream=start_time input.mp4

3. Fix strategies:
   - Remux with explicit sync: ffmpeg -i input.mp4 -c copy -async 1 output.mp4
   - Adjust audio offset: ffmpeg -i input.mp4 -itsoffset 0.04 -i input.mp4 \
       -map 0:v -map 1:a -c copy output.mp4
   - For WebRTC: Ensure NTP timestamp alignment in RTCP SR
```

### Choppy Video

```
Diagnosing choppy/stuttering video:

1. Client-side checks:
   a. Frame drops:
      - Chrome: video.getVideoPlaybackQuality()
      - droppedVideoFrames > 0 indicates decode/render issues
      - totalVideoFrames vs droppedVideoFrames ratio

   b. CPU bottleneck:
      - Check qualityLimitationReason === "cpu" in getStats()
      - Monitor CPU usage during playback
      - Consider hardware acceleration

   c. Renderer bottleneck:
      - Chrome DevTools Performance panel
      - Check for long compositor frames
      - GPU process utilization

2. Network-side checks:
   a. Insufficient bandwidth:
      - Compare available bandwidth with stream bitrate
      - Check for ABR switching too aggressively

   b. High jitter:
      - Jitter > 50ms causes buffer underruns
      - Increase jitter buffer size (trades latency for smoothness)

   c. Burst packet loss:
      - Check NACK count in getStats()
      - Correlated loss causes keyframe requests (PLI)
      - Recovery takes 1-2 seconds per keyframe request

3. Server-side checks:
   a. Encoder overload:
      - Encoding taking longer than frame interval
      - Check encoder queue depth

   b. Pacing issues:
      - Packets sent in bursts instead of evenly spaced
      - Check pacer queue and timing
```

### High Latency Diagnosis

```
End-to-end latency breakdown for live/real-time media:

Capture:     ~5-30ms  (camera frame interval)
Encode:      ~10-100ms (depends on preset/profile)
Packetize:   ~1ms
Network:     ~5-300ms (depends on path)
Jitter buf:  ~20-200ms (adaptive)
Decode:      ~5-50ms
Render:      ~5-16ms (display refresh)
             ─────────
Total:       ~50-700ms

Reducing latency:
1. Capture: Use lower resolution, higher frame rate
2. Encode: Use fastest preset, tune=zerolatency, no B-frames
3. Network: Reduce TURN relay hops, choose closer servers
4. Jitter buffer: Reduce target delay (accept more underruns)
5. Decode: Use hardware decoder
6. Render: Minimize DOM/layout overhead for video element

Measuring end-to-end latency:
- Display a millisecond clock on sender
- Point receiver's camera at sender's screen
- Measure difference between displayed clocks
- Or use NTP-synchronized timestamps in frame metadata
```

### Codec Negotiation Failures

```
WebRTC codec negotiation debugging:

1. Inspect the SDP offer:
   Look for m=video and m=audio lines
   Check a=rtpmap lines for offered codecs
   Example:
     m=video 9 UDP/TLS/RTP/SAVPF 96 97 98
     a=rtpmap:96 VP8/90000
     a=rtpmap:97 H264/90000
     a=fmtp:97 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f

2. Inspect the SDP answer:
   Should contain subset of offered codecs
   If m=video line has port 0 => video rejected entirely

3. Common negotiation failures:
   a. No common codec:
      - Offer has only VP8, answer side only supports H264
      - Fix: Add more codec options or use transcoding

   b. H264 profile mismatch:
      - Offer: profile-level-id=640032 (High profile)
      - Answer: Only supports 42e01f (Baseline)
      - Fix: Ensure compatible profiles or let browser negotiate

   c. Missing payload type in answer:
      - Check SDP manipulation code for bugs
      - Verify no codec was accidentally removed

   d. Simulcast negotiation failure:
      - Check a=simulcast line in offer
      - Verify a=rid lines match

4. Programmatic debugging:
   const sender = pc.getSenders().find(s => s.track.kind === 'video');
   const params = sender.getParameters();
   console.log('Active codecs:', params.codecs);

   const capabilities = RTCRtpSender.getCapabilities('video');
   console.log('Supported codecs:', capabilities.codecs);
```

---

## 16. Common Interview Questions

### Q1: You join a WebRTC call and the remote video is black but audio works fine. Walk through your debugging process.

**Answer:**

Start at the media source and work outward:

1. **Verify the remote camera is active**: Check `getUserMedia()` in webrtc-internals on
   the remote side. Confirm the video track is live (`track.readyState === 'live'` and
   `track.enabled === true`).

2. **Check the sender**: In webrtc-internals, examine `outbound-rtp` for video.
   If `bytesSent` is 0, the video track was never sent. If `bytesSent` is increasing,
   the issue is downstream.

3. **Check codec negotiation**: Compare the SDP offer and answer. Ensure both sides
   agreed on a video codec. Look for `m=video` with a non-zero port in the answer.

4. **Check the receiver**: Look at `inbound-rtp` for video. If `bytesReceived > 0` but
   `framesDecoded === 0`, there is a decode failure -- likely a codec or profile mismatch
   that the browser cannot handle.

5. **Check the DOM**: Ensure the `<video>` element has `srcObject` set to the remote
   stream, `autoplay` is present, and the element is not hidden by CSS. Call
   `video.play()` explicitly if autoplay policy blocks it.

6. **Check for track muting**: The `onmute` event on the remote video track fires when
   no packets arrive. This can indicate the sender paused or network is dropping all
   video packets.

---

### Q2: A user reports choppy video on a WebRTC call. What metrics do you look at and in what order?

**Answer:**

Prioritize by likelihood and severity:

1. **Packet loss** (`inbound-rtp > packetsLost`): Even 2-3% loss causes visible
   choppiness. If loss is high, the network path is the issue. Check if NACK-based
   recovery is working (`nackCount` should be increasing proportionally).

2. **Frame rate** (`inbound-rtp > framesPerSecond`): If the received frame rate is
   significantly lower than expected (for instance, 10fps instead of 30fps), the sender
   may be CPU-constrained. Check `qualityLimitationReason` on the sender side.

3. **Frames dropped** (`inbound-rtp > framesDropped`): Non-zero indicates the renderer
   cannot keep up. This is a client CPU/GPU issue.

4. **Jitter** (`inbound-rtp > jitter`): High jitter (>50ms) means packets arrive
   irregularly, forcing larger jitter buffers. Check `jitterBufferDelay` for the
   current buffer depth.

5. **Available bandwidth** (`candidate-pair > availableOutgoingBitrate`): If bandwidth
   is low, the encoder should have adapted. Check if the actual bitrate matches the
   bandwidth estimate. A mismatch indicates the bandwidth estimator or the encoder
   adaptation is malfunctioning.

6. **Freeze events** (`inbound-rtp > freezeCount`, `totalFreezesDuration`): These
   directly quantify the user experience impact.

---

### Q3: How would you use FFprobe to determine if a video file has proper keyframe placement for HLS/DASH streaming?

**Answer:**

Keyframe interval matters because each HLS/DASH segment must start with a keyframe for
independent decodability:

```bash
# List all keyframes with their timestamps
ffprobe -v quiet -select_streams v:0 -show_frames \
  -show_entries frame=pict_type,pts_time \
  -of csv input.mp4 | grep ",I,"

# Calculate keyframe interval
ffprobe -v quiet -select_streams v:0 -show_frames \
  -show_entries frame=pict_type,pts_time \
  -of csv input.mp4 | grep ",I," | \
  awk -F',' '{if(prev) print $3-prev; prev=$3}'
```

For HLS with 6-second segments, keyframes should appear every 6 seconds (or every
2 seconds for 2-second segments). If the keyframe interval is irregular or does not
align with the segment duration, segments will either be misaligned (requiring extra
data) or will not start with a keyframe (causing decode errors on segment boundaries).

The fix is to re-encode with a forced keyframe interval:
```bash
ffmpeg -i input.mp4 -c:v libx264 -g 60 -keyint_min 60 \
  -sc_threshold 0 -c:a copy output.mp4
```
Here, `-g 60` sets the GOP size to 60 frames (2 seconds at 30fps), and
`-sc_threshold 0` disables scene-change detection keyframes that would create
irregular intervals.

---

### Q4: Explain how you would set up monitoring for a production WebRTC SFU to detect quality degradation before users complain.

**Answer:**

Build a three-layer monitoring system:

**Layer 1 -- Infrastructure metrics (Prometheus + node_exporter)**:
Monitor CPU, memory, bandwidth, and disk I/O on SFU servers. Alert at 70% CPU because
media servers degrade non-linearly above that threshold.

**Layer 2 -- Media quality metrics (custom Prometheus exporter)**:
Expose per-session metrics from the SFU: packet loss ratio, jitter, RTT, bitrate,
and frame rate for every forwarded stream. The SFU has access to RTCP Receiver Reports
and can compute these server-side. Key alerts:
- Average packet loss > 3% for more than 1 minute
- P95 RTT > 200ms
- Average frame rate < 15fps
- TURN allocation count approaching server limit

**Layer 3 -- Client-side telemetry (getStats() + beacon)**:
Instrument the client application to periodically call `getStats()`, compute derived
metrics (bitrate, loss rate, freeze count), and report them to a telemetry endpoint.
This captures the true end-user experience, including last-mile network issues
invisible to the SFU.

**Dashboards (Grafana)**:
- Real-time overview: active sessions, aggregate quality score
- Drill-down per session: timeline of quality metrics with event annotations
- Geographic heatmap: quality by region to identify ISP or CDN issues

**Proactive alerting**:
Use anomaly detection on quality metrics rather than fixed thresholds. A sudden
increase in average packet loss from 0.5% to 2% is more actionable than a fixed
5% threshold, because it indicates a network event even if the absolute value is
below the hard alert threshold.

---

### Q5: You notice that an MP4 file plays fine in VLC but fails in the browser. How do you diagnose this?

**Answer:**

Browsers are stricter than VLC about MP4 conformance. Systematic diagnosis:

1. **Check codec support**:
   ```javascript
   // Test in browser console
   document.createElement('video').canPlayType('video/mp4; codecs="avc1.64001f"')
   // "probably" = supported, "" = not supported
   ```
   VLC supports virtually any codec. Browsers support H.264 Baseline/Main/High,
   VP8/VP9, and AV1. HEVC support varies (Safari yes, Chrome only with hardware).

2. **Inspect container structure**:
   ```bash
   mp4dump input.mp4 | head -20
   ```
   Check if `moov` box is before `mdat` (required for progressive download). If `moov`
   is at the end, run `ffmpeg -i input.mp4 -c copy -movflags +faststart output.mp4`.

3. **Check for edit lists**:
   ```bash
   ffprobe -v quiet -show_entries stream=start_time input.mp4
   ```
   Non-zero start times or complex edit lists can confuse browser demuxers.

4. **Verify H.264 profile**:
   ```bash
   ffprobe -v error -select_streams v:0 \
     -show_entries stream=profile,level -of default=nw=1 input.mp4
   ```
   If the profile is "High 4:4:4 Predictive" or uses features outside the browser's
   decoder capability, it will fail.

5. **Check for B-frames with MSE**:
   Some MSE implementations struggle with B-frames if composition time offsets are
   incorrectly set. Re-encode without B-frames as a diagnostic step:
   ```bash
   ffmpeg -i input.mp4 -c:v libx264 -bf 0 -c:a aac output.mp4
   ```

---

### Q6: Describe how you would use Wireshark to diagnose why a WebRTC participant hears robotic/choppy audio.

**Answer:**

Robotic audio in WebRTC typically indicates packet loss, excessive jitter, or FEC
(Forward Error Correction) failure:

1. **Capture the traffic**: Run Wireshark on the receiver's machine with capture filter
   `udp portrange 1024-65535`. Reproduce the issue for at least 30 seconds.

2. **Identify the audio RTP stream**: Apply display filter `rtp`. Go to
   Telephony > RTP > RTP Streams. Identify the audio stream by its SSRC, payload type
   (111 for Opus is common), and packet rate (~50 pps for 20ms Opus frames).

3. **Analyze the stream**: Select the audio stream and click "Analyze." Key metrics:
   - **Lost packets**: Any loss > 1% is audible with Opus
   - **Max delta**: Values > 40ms indicate jitter spikes
   - **Sequence errors**: Out-of-order packets that arrived after the jitter buffer
     playout deadline are effectively lost

4. **Check the jitter graph**: Click "Graph" in the stream analysis. Look for:
   - Periodic spikes (indicates network path oscillation)
   - Sustained high jitter (indicates congestion)
   - Gaps in packets (indicates route failure or firewall drops)

5. **Check RTCP reports**: Filter by `rtcp.pt == 201` (Receiver Reports). The receiver
   reports cumulative loss and jitter back to the sender. If the sender's RTCP SR shows
   low jitter but the receiver sees high jitter, the issue is in the last-mile network.

6. **Check for DTLS retransmissions**: Filter `dtls.record.content_type == 23`. If
   there are DTLS retransmissions interleaved with SRTP, a middlebox may be interfering.

The fix depends on the root cause: increase jitter buffer for jitter issues, enable
FEC/RED for packet loss, or switch to TURN/TCP for severe network problems.

---

### Q7: What is the difference between `ffprobe -show_frames` and `ffprobe -show_packets`, and when would you use each?

**Answer:**

**Packets** (`-show_packets`) represent the raw data units in the container. Each
packet corresponds to a chunk of compressed data with a DTS (decode timestamp), PTS
(presentation timestamp), size, and flags. One packet may contain one or more frames
(for audio) or one frame (for video). Packets reflect what the demuxer reads from the
container.

**Frames** (`-show_frames`) represent decoded output. Each frame has a PTS, duration,
picture type (I/P/B for video), and dimensions. Frames are in presentation order (by
PTS), while packets may be in decode order (by DTS) -- these differ when B-frames are
present.

**Use packets when**:
- Analyzing container-level timing (DTS/PTS gaps, discontinuities)
- Measuring bitrate distribution over time
- Debugging muxing issues (wrong packet interleaving)
- Checking if packets are in decode order

**Use frames when**:
- Analyzing GOP structure (I/P/B frame pattern)
- Finding keyframe positions and intervals
- Verifying frame types for encoding quality analysis
- Checking decoded dimensions and pixel format

---

### Q8: How would you simulate a 3G mobile network for testing a video calling app, and what metrics would you monitor?

**Answer:**

**Setup (Linux)**:
```bash
# Simulate 3G: 100ms latency, 30ms jitter, 3% loss, 1 Mbps bandwidth
sudo tc qdisc add dev eth0 root handle 1: netem \
  delay 100ms 30ms distribution normal loss 3%
sudo tc qdisc add dev eth0 parent 1: tbf \
  rate 1mbit burst 32kbit latency 400ms
```

**Setup (macOS)**: Use Network Link Conditioner with the built-in "3G" profile or create
a custom profile matching the parameters above.

**Metrics to monitor during the test**:

1. **Adaptation behavior**: Does the video bitrate drop below 1 Mbps? Does resolution
   decrease? Check `qualityLimitationReason` -- it should show "bandwidth."

2. **Audio quality**: Audio should remain intelligible. Opus at 20-32 kbps should still
   work on 1 Mbps. Check for audio dropouts by monitoring `concealedSamples` and
   `insertedSamplesForDeceleration` in getStats().

3. **Recovery time**: Remove the network constraint and measure how quickly the video
   returns to full quality. Good implementations recover within 5-10 seconds.

4. **Freeze count**: Under 3G conditions, some freezes are expected. Log
   `freezeCount` and `totalFreezesDuration` to quantify the experience.

5. **End-to-end latency**: Measure if the jitter buffer grows under high jitter
   conditions. Check `jitterBufferDelay / jitterBufferEmittedCount` for the average
   buffer depth. Under 3G, this may grow to 200-400ms.

---

### Q9: A DASH stream works in Chrome but not in Safari. How do you debug this?

**Answer:**

DASH support in Safari is limited because Safari relies on MSE for DASH playback and
does not have a native DASH player (unlike its native HLS support). Debugging steps:

1. **Check if MSE is being used correctly**: Safari's MSE implementation has stricter
   requirements than Chrome's. Verify `MediaSource.isTypeSupported()` for the exact
   codec string used in the DASH manifest.

2. **Check codec compatibility**: Safari may not support VP9 in MSE (only supports VP9
   in WebM natively in newer versions). If the DASH manifest uses VP9, provide an H.264
   fallback AdaptationSet.

3. **Check fMP4 compatibility**: Use mp4dump to verify the init segment structure.
   Safari requires:
   - `ftyp` with `isom` brand
   - Correct `avcC` or `hvcC` box in `stsd`
   - No features Safari's demuxer does not understand

4. **Check for CORS and range requests**: Safari's MSE requires proper CORS headers
   and may handle byte-range requests differently.

5. **Check the manifest**: Use `mpd-parser` or manually inspect the MPD. Ensure
   `@codecs` attributes match what Safari supports and that `SegmentTemplate` or
   `SegmentList` URLs are correct.

6. **Test with a known-good DASH stream** to isolate whether the issue is the player
   implementation or the content.

---

### Q10: Describe a production monitoring setup you would build for a live streaming platform serving 100,000 concurrent viewers.

**Answer:**

At 100K concurrent viewers, monitoring must be automated, layered, and actionable:

**Ingestion monitoring**:
- Source health: Is the encoder connected? Bitrate stable? Keyframe interval correct?
- Use FFprobe on the ingest server to continuously verify stream parameters
- Alert if keyframe interval drifts from the configured GOP size
- Alert if source bitrate drops below minimum threshold

**Origin/packaging monitoring**:
- Transcoding pipeline health: queue depth, encoding speed vs real-time ratio
- Segment generation: verify each quality variant produces segments on schedule
- Manifest correctness: periodic synthetic fetch of master and variant playlists

**CDN monitoring**:
- Cache hit ratio per edge POP (target > 95%)
- Segment download latency from synthetic probes in multiple regions
- 4xx/5xx error rates on segment and manifest requests
- Bandwidth per POP to detect capacity issues

**Client-side telemetry** (most important layer):
- Beacon every 30 seconds with: buffer health, current bitrate, rebuffer events,
  startup time, error codes
- Aggregate into real-time dashboards: rebuffer ratio (should be < 1%), average
  startup time (target < 2s), error rate, quality distribution
- Segment by: ISP, device type, geographic region, CDN POP

**Alerting chain**:
- P1 (page on-call): Rebuffer ratio > 5% across all viewers, or complete stream failure
- P2 (Slack alert): Rebuffer ratio > 2%, any quality variant failing, CDN error spike
- P3 (daily review): Startup time regression, quality distribution shifts

The key principle is monitoring from the viewer's perspective (client telemetry) rather
than only from the server's perspective, because the majority of quality issues occur in
the last mile between CDN edge and viewer.

---

### Q11: How do you use GStreamer's debugging tools to diagnose a pipeline that is producing corrupted video output?

**Answer:**

1. **Start with GST_DEBUG=3** for warnings and errors:
   ```bash
   GST_DEBUG=3 gst-launch-1.0 filesrc location=input.mp4 ! decodebin ! \
     x264enc ! mp4mux ! filesink location=output.mp4
   ```
   Look for negotiation failures, format mismatches, or buffer errors.

2. **Generate dot graphs** at each state transition:
   ```bash
   GST_DEBUG_DUMP_DOT_DIR=/tmp/dots gst-launch-1.0 ...
   ```
   Convert to images and verify that capabilities (caps) negotiated between elements
   are consistent. A common corruption cause is mismatched color spaces (for example,
   NV12 going into an element expecting I420).

3. **Increase debug on specific elements**:
   ```bash
   GST_DEBUG=x264enc:5,videoconvert:5 gst-launch-1.0 ...
   ```
   Check if the encoder is receiving the expected resolution, frame rate, and pixel
   format.

4. **Insert identity elements** with `signal-handoffs=true` to inspect buffers at
   specific points in the pipeline:
   ```bash
   gst-launch-1.0 ... ! identity signal-handoffs=true name=probe ! ...
   ```

5. **Use `fakesink dump=true`** to see raw buffer hex dumps and verify data is not
   all zeros or garbage.

6. **Compare with a known-good pipeline**: Replace the source with `videotestsrc` to
   isolate whether the corruption comes from the source or from downstream processing.

---

### Q12: What tools and techniques would you use to debug a 200ms audio-video sync issue in a live WebRTC stream?

**Answer:**

A 200ms A/V sync offset is clearly perceptible (threshold is around 40ms). Debugging
approach:

1. **Measure precisely**: Use a test pattern that includes both visual and audio cues
   (such as a clap or a flash with a beep). Record the received output and measure the
   offset in an audio/video editor frame by frame.

2. **Check sender-side sync**: On the sender, verify that audio and video capture
   timestamps are aligned. If using separate capture devices, clock drift between the
   audio and video capture clocks can cause progressive desync.

3. **Check RTP timestamps**: In Wireshark, compare RTP timestamps between the audio
   and video streams. Audio RTP uses a 48000Hz clock (for Opus), video uses 90000Hz.
   Convert both to wall-clock time using RTCP Sender Reports (which map RTP timestamps
   to NTP time). If the NTP times of simultaneous audio and video packets are offset,
   the sender is the problem.

4. **Check jitter buffers**: In webrtc-internals, compare `jitterBufferDelay` for audio
   and video inbound-rtp stats. If the video jitter buffer is 200ms deeper than the
   audio buffer, the playout timing differs by that amount.

5. **Check decoder latency**: Video decoders (especially hardware decoders) may
   introduce buffering for reordering B-frames. Audio decoders are nearly instantaneous.
   This asymmetry is a common source of sync offset.

6. **Fix**: Most WebRTC implementations have a sync module that aligns audio and video
   playout using RTCP SR timestamps. If sync is off, verify that RTCP SRs are being
   exchanged (check `rtcp.pt == 200` in Wireshark) and that both streams reference the
   same NTP clock.

---

This guide covers the essential tools and debugging techniques that audio/video/RTC
engineers use daily. Mastering these tools is not optional -- it is the foundation of
being effective in media engineering. The key principle across all scenarios is
systematic diagnosis: start with what you can observe, narrow down the layer where the
problem exists (capture, encode, network, decode, render), and use the appropriate
specialized tool for that layer.
