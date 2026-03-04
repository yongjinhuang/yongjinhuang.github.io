# Advanced WebRTC

## Overview

Basic WebRTC gets you a 1:1 video call between two browsers. Production WebRTC -- the kind behind Google Meet, Zoom, Discord, Loom, and Miro -- demands mastery of server-mediated topologies, adaptive bitrate strategies, end-to-end encryption, data channels, screen sharing, recording, and deep diagnostics. Interviewers at companies building real-time communication products expect you to reason about why pure peer-to-peer breaks down past a handful of participants, how an SFU selects simulcast layers, how congestion control algorithms adapt to fluctuating bandwidth, and what happens under the hood when you call `getStats()`. This guide covers every advanced topic you will encounter.

---

## 1. Scaling WebRTC -- Why P2P Doesn't Scale

### The Mesh Problem

In a naive peer-to-peer mesh, every participant connects directly to every other participant. For N participants the number of connections is:

```
connections = N * (N - 1) / 2
```

| Participants | Connections | Upload Streams per Peer |
|-------------|-------------|------------------------|
| 2           | 1           | 1                      |
| 4           | 6           | 3                      |
| 8           | 28          | 7                      |
| 16          | 120         | 15                     |
| 50          | 1225        | 49                     |

Each peer must encode and upload its media stream once per remote peer. A participant on a 5 Mbps upload link sending 1.5 Mbps video can handle roughly 3 outbound streams before quality collapses.

### Mesh Topology Diagram

```
        Mesh (4 Participants)

     A ───────────── B
     │ ╲           ╱ │
     │   ╲       ╱   │
     │     ╲   ╱     │
     │       ╳       │
     │     ╱   ╲     │
     │   ╱       ╲   │
     │ ╱           ╲ │
     C ───────────── D

  Connections: 4*(4-1)/2 = 6
  Each peer sends 3 streams
  Each peer receives 3 streams
```

### Why Mesh Fails at Scale

1. **Upload bandwidth** -- Each peer must upload N-1 copies of its media.
2. **Encoding cost** -- Hardware encoders are limited; software encoding N-1 streams pins CPU.
3. **ICE complexity** -- Each connection requires independent STUN/TURN negotiation.
4. **NAT traversal** -- More connections means more chances of firewall failure requiring TURN relays.
5. **Inconsistent quality** -- Each link has independent bandwidth; one slow peer degrades its view for everyone.

### Three Server Topologies

```
  ┌──────────────────────────────────────────────────────┐
  │                  TOPOLOGY COMPARISON                  │
  ├──────────┬──────────────┬──────────────┬─────────────┤
  │          │    Mesh      │     SFU      │     MCU     │
  ├──────────┼──────────────┼──────────────┼─────────────┤
  │ Server   │ None         │ Forwards     │ Decodes &   │
  │ Role     │              │ packets      │ re-encodes  │
  ├──────────┼──────────────┼──────────────┼─────────────┤
  │ Upload   │ N-1 streams  │ 1 stream     │ 1 stream    │
  │ per peer │              │ (or simulcast│             │
  │          │              │  2-3 layers) │             │
  ├──────────┼──────────────┼──────────────┼─────────────┤
  │ Download │ N-1 streams  │ N-1 streams  │ 1 composite │
  │ per peer │              │ (selected)   │ stream      │
  ├──────────┼──────────────┼──────────────┼─────────────┤
  │ Server   │ None         │ Low          │ Very High   │
  │ CPU      │              │ (forwarding) │ (transcode) │
  ├──────────┼──────────────┼──────────────┼─────────────┤
  │ Latency  │ Lowest       │ Low          │ Higher      │
  │          │ (direct)     │ (1 hop)      │ (decode +   │
  │          │              │              │  encode)    │
  ├──────────┼──────────────┼──────────────┼─────────────┤
  │ Scale    │ ~4-6 peers   │ Hundreds     │ Tens        │
  │ Limit    │              │              │             │
  ├──────────┼──────────────┼──────────────┼─────────────┤
  │ Use Case │ Small calls  │ Video conf,  │ Legacy,     │
  │          │              │ live stream  │ telephony   │
  └──────────┴──────────────┴──────────────┴─────────────┘
```

---

## 2. SFU (Selective Forwarding Unit)

### Architecture

An SFU sits between all participants. Each peer uploads a single media stream (or multiple simulcast layers) to the SFU. The SFU then forwards those packets to all other participants without decoding or re-encoding them.

```
  SFU Architecture

  ┌───────┐   upload    ┌─────────────────────┐   forward   ┌───────┐
  │ Peer A│ ──────────▶ │                     │ ──────────▶ │ Peer B│
  └───────┘             │                     │             └───────┘
                        │                     │
  ┌───────┐   upload    │        SFU          │   forward   ┌───────┐
  │ Peer B│ ──────────▶ │                     │ ──────────▶ │ Peer A│
  └───────┘             │   (No transcode)    │             └───────┘
                        │   (Packet routing)  │
  ┌───────┐   upload    │   (Layer selection) │   forward   ┌───────┐
  │ Peer C│ ──────────▶ │                     │ ──────────▶ │ Peer A│
  └───────┘             │                     │  ─────────▶ │ Peer B│
                        └─────────────────────┘             └───────┘

  Each peer uploads 1 stream (or 2-3 simulcast layers).
  SFU selects which layer to forward to each receiver.
```

### How the SFU Routes Media

1. **Receives RTP packets** from each sender over DTLS-SRTP.
2. **Parses RTP headers** -- SSRC, sequence number, timestamp, payload type, RTP extensions.
3. **Maintains a routing table** -- maps each incoming SSRC to a set of subscriber PeerConnections.
4. **Rewrites headers** -- adjusts sequence numbers and timestamps for each outbound stream to maintain continuity (the receiver sees a clean, continuous RTP stream even if the SFU switches simulcast layers).
5. **Handles RTCP** -- processes receiver reports, NACK (retransmission requests), PLI/FIR (keyframe requests), and generates sender reports.

### Advantages of SFU

- **Low latency** -- No decode/encode cycle, typically adds less than 50ms.
- **Low server CPU** -- Forwarding packets is cheap compared to transcoding.
- **Flexible layouts** -- Each client renders its own layout (grid, speaker view, pinned).
- **Simulcast-friendly** -- SFU can select different quality layers for different receivers.
- **Scalable** -- A single SFU can handle hundreds of streams; cascade multiple SFUs for thousands.

### Simulcast with SFU

When simulcast is enabled, each sender encodes multiple quality layers (e.g., 720p, 360p, 180p). The SFU picks which layer to forward based on:

- **Receiver viewport size** -- A thumbnail gets the lowest layer.
- **Receiver bandwidth** -- Estimated via REMB/TWCC feedback.
- **Active speaker** -- The current speaker gets the highest layer from all receivers.
- **Manual pinning** -- User pins a participant to see full quality.

### Bandwidth Estimation in SFU

The SFU participates in bandwidth estimation:

1. **Receiver-side BWE** -- The SFU acts as a receiver for each sender and estimates their available upload bandwidth using loss and delay.
2. **Sender-side BWE** -- The SFU sends TWCC feedback to senders, enabling sender-side congestion control (GCC algorithm).
3. **Subscriber-side** -- The SFU also estimates each subscriber's download bandwidth and adjusts which simulcast layers or SVC temporal layers to forward.

### Popular SFU Implementations

| SFU | Language | License | Notes |
|-----|----------|---------|-------|
| mediasoup | C++/Node.js | ISC | Highly performant, popular for custom applications |
| Janus | C | GPL-3.0 | Plugin-based, versatile gateway |
| Pion | Go | MIT | Pure Go, great for custom SFUs |
| LiveKit | Go (Pion-based) | Apache-2.0 | Full-featured platform with SDKs |
| ion-sfu | Go | MIT | Lightweight, Pion-based |
| Jitsi Videobridge | Java/Kotlin | Apache-2.0 | Powers Jitsi Meet |

---

## 3. MCU (Multipoint Control Unit)

### Architecture

An MCU receives media from all participants, decodes every stream, composites them into a single mixed stream (video layout + audio mix), re-encodes, and sends one stream back to each participant.

```
  MCU Architecture

  ┌───────┐            ┌──────────────────────────┐            ┌───────┐
  │ Peer A│ ─────────▶ │  Decode A, B, C          │            │ Peer A│
  └───────┘            │         │                 │  composite │       │
                       │         ▼                 │ ─────────▶ │(sees  │
  ┌───────┐            │  ┌─────────────┐          │            │B + C) │
  │ Peer B│ ─────────▶ │  │ Video Mixer │          │            └───────┘
  └───────┘            │  │ Audio Mixer │          │
                       │  └─────────────┘          │            ┌───────┐
  ┌───────┐            │         │                 │ ─────────▶ │ Peer B│
  │ Peer C│ ─────────▶ │         ▼                 │            │(sees  │
  └───────┘            │  Encode composite         │            │A + C) │
                       │  per recipient            │            └───────┘
                       └──────────────────────────┘
                              MCU Server
                        (Decode + Mix + Encode)
```

### Server-Side Mixing

**Audio mixing**: The MCU decodes PCM samples from all participants, sums the waveforms (excluding the recipient's own audio to prevent echo), and encodes a single mixed audio stream per recipient.

**Video compositing**: The MCU arranges decoded video frames into a grid layout:

```
  Composite Layout Examples

  ┌──────────────────┐    ┌──────────────────┐
  │   2x2 Grid       │    │   Speaker + Grid  │
  │ ┌────┐ ┌────┐    │    │ ┌────────────┐   │
  │ │ A  │ │ B  │    │    │ │            │   │
  │ └────┘ └────┘    │    │ │  Speaker A │   │
  │ ┌────┐ ┌────┐    │    │ │            │   │
  │ │ C  │ │ D  │    │    │ └────────────┘   │
  │ └────┘ └────┘    │    │ ┌──┐ ┌──┐ ┌──┐  │
  └──────────────────┘    │ │B │ │C │ │D │  │
                          │ └──┘ └──┘ └──┘  │
                          └──────────────────┘
```

### When to Use MCU vs SFU

**Choose MCU when:**
- Participants have extremely limited download bandwidth (receive only 1 stream).
- You need server-side recording with a composited layout.
- Interoperating with legacy SIP/H.323 telephony systems that expect a single composite.
- You need guaranteed layout consistency across all participants.

**Choose SFU when:**
- You need low latency (no encode/decode round trip on server).
- You want to minimize server cost (forwarding is 10-100x cheaper than transcoding).
- Clients can handle multiple streams (modern browsers, mobile apps).
- You want flexible, client-controlled layouts.
- You need to scale to many participants.

**Hybrid approaches** are common: use an SFU for the main conference and an MCU only for legacy dial-in participants or recording.

---

## 4. Simulcast

### Concept

Simulcast means the sender encodes the same source into multiple independent streams at different resolutions and bitrates. These are separate RTP streams (different SSRCs) that the SFU can independently select per subscriber.

### Spatial Layers in Simulcast

```
  Simulcast Layers (Typical Configuration)

  Layer 2 (High):    1280x720 @ 30fps   ~2500 kbps
  Layer 1 (Medium):   640x360 @ 30fps   ~500 kbps
  Layer 0 (Low):      320x180 @ 30fps   ~150 kbps

  ┌─────────────────────────────────┐
  │           Layer 2               │
  │   ┌─────────────────────┐      │
  │   │      Layer 1        │      │
  │   │  ┌───────────┐      │      │
  │   │  │  Layer 0  │      │      │
  │   │  └───────────┘      │      │
  │   └─────────────────────┘      │
  └─────────────────────────────────┘
```

### RID-Based Simulcast

RID (Restriction Identifier) is an RTP header extension that labels each simulcast layer with a string identifier, allowing the SFU to distinguish layers without relying on SSRC mappings alone.

```javascript
// Configuring simulcast with RID in JavaScript
const pc = new RTCPeerConnection(config);

const stream = await navigator.mediaDevices.getUserMedia({
  video: { width: 1280, height: 720 }
});

const videoTrack = stream.getVideoTracks()[0];

const transceiver = pc.addTransceiver(videoTrack, {
  direction: 'sendrecv',
  sendEncodings: [
    {
      rid: 'low',
      maxBitrate: 150_000,
      scaleResolutionDownBy: 4,
      maxFramerate: 15
    },
    {
      rid: 'medium',
      maxBitrate: 500_000,
      scaleResolutionDownBy: 2,
      maxFramerate: 30
    },
    {
      rid: 'high',
      maxBitrate: 2_500_000,
      scaleResolutionDownBy: 1,
      maxFramerate: 30
    }
  ]
});
```

### How the SFU Selects Layers

```
  SFU Layer Selection Decision Flow

  ┌─────────────────────┐
  │ Subscriber requests  │
  │ participant's video  │
  └──────────┬──────────┘
             │
             ▼
  ┌─────────────────────┐     ┌──────────────────┐
  │ Check subscriber's  │ ──▶ │ Bandwidth < 200k │ ──▶ Forward Layer 0
  │ estimated bandwidth │     └──────────────────┘
  └──────────┬──────────┘
             │ bandwidth OK
             ▼
  ┌─────────────────────┐     ┌──────────────────┐
  │ Check viewport size │ ──▶ │ Tile < 200x150   │ ──▶ Forward Layer 0
  │ requested by client │     └──────────────────┘
  └──────────┬──────────┘
             │ viewport large
             ▼
  ┌─────────────────────┐     ┌──────────────────┐
  │ Is this the active  │ ──▶ │ No               │ ──▶ Forward Layer 1
  │ speaker?            │     └──────────────────┘
  └──────────┬──────────┘
             │ Yes
             ▼
       Forward Layer 2
```

The SFU may also use temporal layer switching: within a single spatial layer, it can drop higher temporal layers (reducing frame rate) to further reduce bandwidth without switching spatial layers.

### Layer Switching Mechanics

When the SFU switches between simulcast layers, it must:

1. **Wait for a keyframe** on the target layer (or request one via PLI/FIR).
2. **Rewrite RTP sequence numbers** to ensure continuity for the receiver.
3. **Rewrite RTP timestamps** to match the receiver's timeline.
4. **Send a marker** (some implementations use RTP header extensions) to signal the switch so the decoder can handle it gracefully.

---

## 5. SVC (Scalable Video Coding)

### Concept

SVC encodes a single bitstream with embedded layers that can be peeled off by an intermediary (the SFU) without re-encoding. Unlike simulcast which produces independent streams, SVC layers are interdependent -- higher layers reference lower layers.

### Three Dimensions of Scalability

```
  SVC Scalability Dimensions

  Temporal (Frame Rate)         Spatial (Resolution)       Quality (Fidelity)
  ─────────────────────        ────────────────────       ──────────────────
  T0: 7.5 fps (base)          S0: 320x180 (base)        Q0: Low quality
  T1: 15 fps                  S1: 640x360               Q1: Medium quality
  T2: 30 fps                  S2: 1280x720              Q2: High quality

  ┌─────────────────┐
  │ T2 (30fps)      │  ← Drop this layer: still decodable at 15fps
  ├─────────────────┤
  │ T1 (15fps)      │  ← Drop this layer: still decodable at 7.5fps
  ├─────────────────┤
  │ T0 (7.5fps)     │  ← Base layer: always required
  └─────────────────┘
```

### Temporal Scalability

Frames are organized in a dependency hierarchy. The base temporal layer (T0) contains keyframes and reference frames. Higher layers (T1, T2) contain frames that reference only lower layers. The SFU can drop T2 frames to reduce bandwidth by ~33% while the receiver still decodes smoothly at a lower frame rate.

```
  Temporal Layer Dependencies

  T0    T1    T2    T1    T0    T1    T2    T1    T0
  │           │           │           │           │
  I ────────▶ P ────────▶ P ────────▶ P ────────▶ P
        │           │           │           │
        P     P     P     P     P     P     P
              │                       │
              P                       P

  SFU can strip T2 frames → receiver gets 15fps instead of 30fps
  SFU can strip T1+T2    → receiver gets 7.5fps (base only)
```

### VP9 SVC

VP9 supports both temporal and spatial scalability. Chrome uses VP9 SVC (often called "K-SVC") for WebRTC:

- **K-SVC** (Key-frame SVC): Spatial layers only depend on lower spatial layers at keyframes. Between keyframes, each spatial layer is independently decodable. This allows the SFU to switch spatial layers without waiting for a keyframe.
- Typically configured as L3T3 (3 spatial layers, 3 temporal layers = 9 sub-layers total).

### AV1 SVC

AV1 provides even more flexible SVC with:

- Superior compression efficiency (~30% better than VP9 at the same quality).
- Native support in the spec for SVC (unlike VP9 where SVC was a Google extension).
- Configurable dependency structures via AV1's OBU (Open Bitstream Unit) design.
- Growing hardware encoder support (Intel Arc, NVIDIA RTX 40-series).

### Simulcast vs SVC Comparison

```
  ┌────────────────────┬───────────────────┬───────────────────┐
  │                    │    Simulcast      │       SVC         │
  ├────────────────────┼───────────────────┼───────────────────┤
  │ Encoding           │ Multiple separate │ Single layered    │
  │                    │ encoders          │ encoder           │
  ├────────────────────┼───────────────────┼───────────────────┤
  │ Bandwidth overhead │ ~1.5-2x of        │ ~1.2-1.5x of     │
  │                    │ highest layer     │ highest layer     │
  ├────────────────────┼───────────────────┼───────────────────┤
  │ Layer switching    │ Requires keyframe │ Can switch at     │
  │                    │ (unless K-SVC)    │ any frame (K-SVC) │
  ├────────────────────┼───────────────────┼───────────────────┤
  │ CPU cost (sender)  │ Higher (N encodes)│ Lower (1 encode)  │
  ├────────────────────┼───────────────────┼───────────────────┤
  │ SFU complexity     │ Simple routing    │ Must understand   │
  │                    │                   │ layer structure   │
  ├────────────────────┼───────────────────┼───────────────────┤
  │ Codec support      │ H.264, VP8, VP9,  │ VP9, AV1          │
  │                    │ AV1               │ (H.264 SVC rare)  │
  ├────────────────────┼───────────────────┼───────────────────┤
  │ Browser support    │ All modern        │ VP9 SVC: Chrome   │
  │                    │ browsers          │ AV1 SVC: emerging │
  └────────────────────┴───────────────────┴───────────────────┘
```

---

## 6. Data Channels

### RTCDataChannel API

Data channels provide a peer-to-peer (or SFU-relayed) channel for arbitrary data. They run over SCTP (Stream Control Transmission Protocol) tunneled through DTLS, which itself runs over the same ICE transport as media.

```
  Protocol Stack

  ┌──────────────────┐
  │  Application     │  RTCDataChannel API
  ├──────────────────┤
  │  SCTP            │  Stream Control Transport Protocol
  ├──────────────────┤
  │  DTLS            │  Datagram TLS (encryption)
  ├──────────────────┤
  │  ICE / UDP       │  Connectivity + transport
  └──────────────────┘
```

### Creating a Data Channel

```javascript
const pc = new RTCPeerConnection(config);

// Offerer creates the channel
const channel = pc.createDataChannel('chat', {
  ordered: true,           // SCTP ordered delivery
  maxRetransmits: undefined, // reliable (default)
});

channel.onopen = () => {
  channel.send('Hello from peer A!');
};

channel.onmessage = (event) => {
  const message = event.data; // string or ArrayBuffer
  handleIncomingMessage(message);
};

channel.onclose = () => {
  handleChannelClosed();
};

// Answerer receives the channel
pc.ondatachannel = (event) => {
  const remoteChannel = event.channel;
  remoteChannel.onmessage = (e) => {
    handleIncomingMessage(e.data);
  };
};
```

### Ordered vs Unordered, Reliable vs Unreliable

| Mode | Config | Behavior | Use Case |
|------|--------|----------|----------|
| Ordered + Reliable | `{ ordered: true }` (default) | TCP-like: in-order, no loss | Chat messages, file transfer |
| Unordered + Reliable | `{ ordered: false }` | All messages arrive, order not guaranteed | Asset loading |
| Ordered + Unreliable | `{ ordered: true, maxRetransmits: 3 }` | Limited retries, in-order | Game commands |
| Unordered + Unreliable | `{ ordered: false, maxRetransmits: 0 }` | Fire-and-forget, lowest latency | Game position updates, cursor sync |

You can also use `maxPacketLifeTime` (in milliseconds) instead of `maxRetransmits` to limit how long SCTP retries.

### Binary Data Support

```javascript
// Send binary data
channel.binaryType = 'arraybuffer'; // or 'blob'

// Send a file chunk
const fileChunk = new Uint8Array(16384);
channel.send(fileChunk.buffer);

// Send structured data as JSON
const gameState = { x: 100, y: 200, health: 80 };
channel.send(JSON.stringify(gameState));

// Or use protocol buffers for efficiency
const encoded = MyProto.encode(gameState).finish();
channel.send(encoded);
```

### Data Channel Use Cases

1. **Text chat** -- Reliable, ordered. No server roundtrip for message delivery.
2. **File transfer** -- Reliable, ordered. Chunk files into ~16KB pieces and reassemble.
3. **Game state sync** -- Unreliable, unordered for position/velocity. Reliable for critical events (damage, score).
4. **Cursor/pointer sharing** -- Unreliable, unordered. High frequency, stale data is useless.
5. **Remote control** -- Reliable, ordered. Keyboard and mouse events.
6. **Collaborative editing** -- Reliable, ordered. CRDT operations.
7. **Sensor data streaming** -- Unreliable for real-time telemetry.

### Data Channel Limitations

- **Message size**: Browsers fragment messages larger than ~256KB but it is best practice to chunk at ~16KB.
- **Throughput**: SCTP over DTLS is slower than raw WebSocket for bulk transfer (~30-80 Mbps vs 100+ Mbps).
- **No multicast**: In a mesh, data must be sent to each peer separately. With an SFU, data channels typically route through the server.

---

## 7. Screen Sharing

### getDisplayMedia API

```javascript
async function startScreenShare() {
  try {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        cursor: 'always',         // Show cursor in capture
        displaySurface: 'monitor', // Prefer full screen
        frameRate: { ideal: 30, max: 60 },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      },
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        // System audio capture (Chrome only, tab sharing)
      },
      // Chrome: controls what the user sees in the picker
      preferCurrentTab: false,
      selfBrowserSurface: 'exclude',
      systemAudio: 'include',
      surfaceSwitching: 'include',
      monitorTypeSurfaces: 'include'
    });

    return screenStream;
  } catch (error) {
    if (error.name === 'NotAllowedError') {
      // User denied permission or dismissed the picker
      handlePermissionDenied();
    }
    throw error;
  }
}
```

### Capture Types

The browser presents a picker where the user selects what to share:

| Surface | Description | Audio Support |
|---------|-------------|---------------|
| Screen/Monitor | Entire display including all windows | OS-level (limited) |
| Window | Single application window | No |
| Browser Tab | A specific browser tab | Yes (Chrome) |

### Combining Screen Share with Camera (PiP)

A common pattern is to show the user's camera in a picture-in-picture overlay on top of their screen share.

```javascript
async function startScreenShareWithCamera(pc) {
  // Get screen share stream
  const screenStream = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: 30 },
    audio: true
  });

  // Get camera stream (small resolution for PiP)
  const cameraStream = await navigator.mediaDevices.getUserMedia({
    video: { width: 320, height: 240, frameRate: 15 },
    audio: false // Audio already captured from mic
  });

  // Add screen share track to peer connection
  const screenTrack = screenStream.getVideoTracks()[0];
  const screenSender = pc.addTrack(screenTrack, screenStream);

  // Add camera as a second video track
  const cameraTrack = cameraStream.getVideoTracks()[0];
  const cameraSender = pc.addTrack(cameraTrack, cameraStream);

  // Handle user stopping screen share via browser UI
  screenTrack.onended = () => {
    pc.removeTrack(screenSender);
    handleScreenShareStopped();
  };

  return { screenStream, cameraStream };
}
```

### System Audio Capture

System audio capture is available when sharing a Chrome tab. The audio track appears in the `getDisplayMedia` stream:

```javascript
const stream = await navigator.mediaDevices.getDisplayMedia({
  video: true,
  audio: true // Request system audio
});

const audioTracks = stream.getAudioTracks();
if (audioTracks.length > 0) {
  // System audio is available
  // Mix with microphone audio using Web Audio API
  const audioContext = new AudioContext();
  const systemSource = audioContext.createMediaStreamSource(
    new MediaStream([audioTracks[0]])
  );
  const micSource = audioContext.createMediaStreamSource(micStream);
  const destination = audioContext.createMediaStreamDestination();

  systemSource.connect(destination);
  micSource.connect(destination);

  // Use destination.stream for the mixed audio
  const mixedAudioTrack = destination.stream.getAudioTracks()[0];
  pc.addTrack(mixedAudioTrack);
}
```

### Screen Share Encoding Considerations

Screen content (text, code, slides) has very different characteristics from camera video:

- **Content type hint**: Use `videoTrack.contentHint = 'text'` to tell the encoder to prioritize sharpness over smoothness (higher resolution, lower frame rate).
- **Codec selection**: VP9 and AV1 handle screen content much better than H.264 due to better intra-prediction for sharp edges and flat regions.
- **Bitrate**: Screen share typically needs higher bitrate than camera at the same resolution because text detail matters more than face detail.

---

## 8. Media Recording

### MediaRecorder API

The MediaRecorder API records `MediaStream` objects (from `getUserMedia`, `getDisplayMedia`, or remote WebRTC streams) into binary Blobs.

```javascript
function recordStream(stream) {
  const mimeType = getSupportedMimeType();
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 2_500_000,
    audioBitsPerSecond: 128_000
  });

  const chunks = [];

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: mimeType });
    const url = URL.createObjectURL(blob);
    downloadRecording(url);
  };

  recorder.onerror = (event) => {
    handleRecordingError(event.error);
  };

  // Start recording, get data every second
  recorder.start(1000);

  return recorder;
}

function getSupportedMimeType() {
  const types = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=h264,opus',
    'video/webm',
    'video/mp4'
  ];

  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }

  throw new Error('No supported recording format found');
}
```

### Recording Remote WebRTC Streams

To record a remote participant's stream, capture it from the RTCPeerConnection:

```javascript
pc.ontrack = (event) => {
  const remoteStream = event.streams[0];

  // Record the remote stream
  const recorder = new MediaRecorder(remoteStream, {
    mimeType: 'video/webm;codecs=vp9,opus'
  });

  // Or combine local + remote into a single canvas for composite recording
  const compositeStream = createCompositeStream(localStream, remoteStream);
  const compositeRecorder = new MediaRecorder(compositeStream);
};
```

### Server-Side Recording

For production recording, prefer server-side approaches:

1. **SFU-based recording** -- The SFU writes raw RTP packets to disk, then post-processes into a playable container (WebM, MP4).
2. **Headless browser** -- A server-side Chrome instance joins the call and records using MediaRecorder (used by tools like Recall.ai).
3. **MCU recording** -- The MCU naturally produces a composite stream that can be written directly to storage.

### Blob Handling and Download

```javascript
function downloadRecording(blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `recording-${Date.now()}.webm`;
  a.click();
  URL.revokeObjectURL(url);
}

// Upload recording to server
async function uploadRecording(blob) {
  const formData = new FormData();
  formData.append('recording', blob, 'recording.webm');

  const response = await fetch('/api/recordings', {
    method: 'POST',
    body: formData
  });

  return response.json();
}
```

---

## 9. Insertable Streams / Encoded Transform

### WebRTC Encoded Transform API

The Encoded Transform API (formerly called Insertable Streams) allows JavaScript to intercept encoded media frames between the encoder and the packetizer (sender side) or between the depacketizer and the decoder (receiver side). This enables:

- **End-to-end encryption (E2EE)** -- Encrypt frames so even the SFU cannot read them.
- **Watermarking** -- Inject forensic watermarks into encoded frames.
- **Custom processing** -- ML-based background blur on encoded data, metadata injection.

```
  Encoded Transform Pipeline

  Sender Side:
  ┌──────┐   ┌─────────┐   ┌──────────────────┐   ┌────────────┐   ┌──────┐
  │Camera│──▶│ Encoder │──▶│ Transform (JS)   │──▶│ Packetizer │──▶│ SRTP │
  └──────┘   └─────────┘   │ (encrypt/modify) │   └────────────┘   └──────┘
                            └──────────────────┘

  Receiver Side:
  ┌──────┐   ┌──────────────┐   ┌──────────────────┐   ┌─────────┐   ┌───────┐
  │ SRTP │──▶│ Depacketizer│──▶│ Transform (JS)   │──▶│ Decoder │──▶│Display│
  └──────┘   └──────────────┘   │ (decrypt/modify) │   └─────────┘   └───────┘
                                └──────────────────┘
```

### Implementing E2EE with Encoded Transform

```javascript
// Sender side: encrypt outgoing frames
const sender = pc.addTrack(videoTrack);

const senderTransform = new TransformStream({
  async transform(encodedFrame, controller) {
    const encryptedData = await encryptFrame(encodedFrame, encryptionKey);

    // Create a new frame with encrypted payload
    const newFrame = new EncodedVideoChunk({
      type: encodedFrame.type,
      timestamp: encodedFrame.timestamp,
      data: encryptedData
    });

    controller.enqueue(newFrame);
  }
});

// Apply transform to the sender
const senderStreams = sender.createEncodedStreams();
senderStreams.readable
  .pipeThrough(senderTransform)
  .pipeTo(senderStreams.writable);

// Using the newer RTCRtpScriptTransform API (preferred):
sender.transform = new RTCRtpScriptTransform(worker, {
  operation: 'encrypt',
  keyId: currentKeyId
});
```

### Worker-Based Transform (Production Pattern)

In production, transforms run in a Web Worker for performance:

```javascript
// main.js
const worker = new Worker('transform-worker.js');

const sender = pc.addTrack(videoTrack);
sender.transform = new RTCRtpScriptTransform(worker, {
  operation: 'encrypt'
});

const receiver = pc.getReceivers().find(r => r.track.kind === 'video');
receiver.transform = new RTCRtpScriptTransform(worker, {
  operation: 'decrypt'
});

// Provide encryption key to worker
worker.postMessage({
  type: 'setKey',
  key: await exportKey(encryptionKey)
});
```

```javascript
// transform-worker.js
let encryptionKey = null;

onmessage = (event) => {
  if (event.data.type === 'setKey') {
    encryptionKey = event.data.key;
  }
};

onrtctransform = (event) => {
  const transformer = event.transformer;
  const { operation } = transformer.options;

  const transform = new TransformStream({
    async transform(frame, controller) {
      if (operation === 'encrypt') {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const data = new Uint8Array(frame.data);

        const encrypted = await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv },
          encryptionKey,
          data
        );

        // Prepend IV to encrypted data
        const combined = new Uint8Array(iv.length + encrypted.byteLength);
        combined.set(iv);
        combined.set(new Uint8Array(encrypted), iv.length);

        frame.data = combined.buffer;
        controller.enqueue(frame);
      } else {
        // Decrypt
        const data = new Uint8Array(frame.data);
        const iv = data.slice(0, 12);
        const ciphertext = data.slice(12);

        const decrypted = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv },
          encryptionKey,
          ciphertext
        );

        frame.data = decrypted;
        controller.enqueue(frame);
      }
    }
  });

  transformer.readable
    .pipeThrough(transform)
    .pipeTo(transformer.writable);
};
```

### Key Rotation for E2EE

In a group call, key rotation is essential. When a participant leaves, all remaining participants must rotate keys so the departed participant cannot decrypt future frames. This is called "sender ratcheting":

1. Each participant maintains a key chain derived from a base secret via HKDF.
2. When a participant leaves, all others advance their key chain.
3. A short window of frames may be undecryptable during rotation; receivers buffer and retry.

---

## 10. Bandwidth Estimation

### Why Bandwidth Estimation Matters

WebRTC must continuously adapt to available bandwidth. Too much data causes congestion (packet loss, increased delay). Too little wastes available bandwidth and degrades quality. The congestion control algorithm balances these forces in real time.

### GCC (Google Congestion Control)

GCC is the default congestion control algorithm in WebRTC. It combines two estimators:

```
  GCC Architecture

  ┌──────────────────────────────────────────────────┐
  │              Sender                              │
  │                                                  │
  │  ┌─────────────────┐   ┌──────────────────────┐ │
  │  │ Loss-based      │   │ Delay-based          │ │
  │  │ estimator       │   │ estimator            │ │
  │  │                 │   │                      │ │
  │  │ Uses RTCP RR    │   │ Uses TWCC feedback   │ │
  │  │ packet loss %   │   │ inter-arrival delay  │ │
  │  └────────┬────────┘   └──────────┬───────────┘ │
  │           │                       │              │
  │           ▼                       ▼              │
  │  ┌─────────────────────────────────────────────┐ │
  │  │        min(loss_estimate, delay_estimate)    │ │
  │  │        = target_bitrate                      │ │
  │  └─────────────────────────────────────────────┘ │
  └──────────────────────────────────────────────────┘
```

**Loss-based estimator**:
- If packet loss > 10%: reduce bitrate by (1 - loss/2).
- If packet loss < 2%: increase bitrate by ~8% per second.
- Between 2-10%: hold steady.

**Delay-based estimator**:
- Measures one-way delay variation (OWD) of packets.
- Uses a Kalman filter to estimate the queuing delay trend.
- Three states: Overuse (decrease), Underuse (increase), Normal (hold).
- Reacts faster than loss-based because delay increases before loss occurs.

### REMB (Receiver Estimated Maximum Bitrate)

REMB is an older receiver-side bandwidth estimation mechanism:

1. The receiver measures incoming packet rate and inter-arrival times.
2. It computes an estimated available bitrate.
3. It sends a REMB RTCP message back to the sender.
4. The sender adjusts its encoding bitrate accordingly.

**Limitations**: REMB only provides a single number and has slower feedback loop. It has been largely replaced by TWCC.

### TWCC (Transport-Wide Congestion Control)

TWCC moves bandwidth estimation to the sender side:

1. **Sender** adds a transport-wide sequence number to every RTP packet via an RTP header extension.
2. **Receiver** batches acknowledgements: for each received packet, it reports the arrival timestamp.
3. **Receiver** sends TWCC feedback packets (RTCP transport-cc) at regular intervals (~100ms).
4. **Sender** correlates send timestamps with receive timestamps to compute one-way delay variations.
5. **Sender** runs the GCC delay-based estimator on these measurements.

```
  TWCC Flow

  Sender                                    Receiver
    │                                          │
    │──── RTP pkt (seq=1, send_ts=100) ──────▶│
    │──── RTP pkt (seq=2, send_ts=105) ──────▶│
    │──── RTP pkt (seq=3, send_ts=110) ──────▶│
    │                                          │
    │◀─── TWCC feedback ──────────────────────│
    │     seq=1 recv_ts=200                    │
    │     seq=2 recv_ts=208                    │
    │     seq=3 recv_ts=215                    │
    │                                          │
    │  Sender computes:                        │
    │  send_delta(1→2) = 5ms                   │
    │  recv_delta(1→2) = 8ms                   │
    │  delay_variation = 8 - 5 = +3ms          │
    │  → queue building up → reduce bitrate    │
    │                                          │
```

### How ABE Affects Quality

The adaptive bitrate estimation (ABE) drives a chain of quality adaptations:

1. **Encoder bitrate** -- Direct adjustment of the video encoder's target bitrate.
2. **Resolution** -- At low bitrates, the encoder or the application reduces capture resolution.
3. **Frame rate** -- Below a threshold, frame rate drops (30 -> 15 -> 7.5 fps).
4. **Simulcast layer** -- The SFU selects lower layers for receivers with limited bandwidth.
5. **Audio codec switching** -- Opus can adapt from 6 kbps to 510 kbps seamlessly via its built-in VBR.

---

## 11. Statistics & Monitoring

### getStats() API

Every `RTCPeerConnection` exposes a `getStats()` method that returns a `RTCStatsReport` -- a Map of stat objects covering every aspect of the connection.

```javascript
async function collectStats(pc) {
  const report = await pc.getStats();

  const stats = {};

  report.forEach((stat) => {
    switch (stat.type) {
      case 'inbound-rtp':
        stats.inbound = {
          kind: stat.kind,
          bytesReceived: stat.bytesReceived,
          packetsReceived: stat.packetsReceived,
          packetsLost: stat.packetsLost,
          jitter: stat.jitter,
          framesDecoded: stat.framesDecoded,
          framesDropped: stat.framesDropped,
          frameWidth: stat.frameWidth,
          frameHeight: stat.frameHeight,
          framesPerSecond: stat.framesPerSecond,
          totalDecodeTime: stat.totalDecodeTime,
          nackCount: stat.nackCount,
          pliCount: stat.pliCount,
          firCount: stat.firCount
        };
        break;

      case 'outbound-rtp':
        stats.outbound = {
          kind: stat.kind,
          bytesSent: stat.bytesSent,
          packetsSent: stat.packetsSent,
          framesEncoded: stat.framesEncoded,
          frameWidth: stat.frameWidth,
          frameHeight: stat.frameHeight,
          framesPerSecond: stat.framesPerSecond,
          totalEncodeTime: stat.totalEncodeTime,
          qualityLimitationReason: stat.qualityLimitationReason,
          qualityLimitationDurations: stat.qualityLimitationDurations,
          retransmittedPacketsSent: stat.retransmittedPacketsSent
        };
        break;

      case 'candidate-pair':
        if (stat.state === 'succeeded') {
          stats.connection = {
            currentRoundTripTime: stat.currentRoundTripTime,
            availableOutgoingBitrate: stat.availableOutgoingBitrate,
            bytesReceived: stat.bytesReceived,
            bytesSent: stat.bytesSent,
            localCandidateType: stat.localCandidateId,
            remoteCandidateType: stat.remoteCandidateId
          };
        }
        break;

      case 'remote-inbound-rtp':
        stats.remoteInbound = {
          roundTripTime: stat.roundTripTime,
          jitter: stat.jitter,
          fractionLost: stat.fractionLost,
          packetsLost: stat.packetsLost
        };
        break;
    }
  });

  return stats;
}
```

### Key Metrics to Monitor

```
  ┌─────────────────────────────────────────────────────────┐
  │                  CRITICAL METRICS                       │
  ├──────────────────────┬──────────────────────────────────┤
  │ Metric               │ Healthy Range                    │
  ├──────────────────────┼──────────────────────────────────┤
  │ Round-Trip Time (RTT)│ < 150ms (good), < 300ms (ok)    │
  ├──────────────────────┼──────────────────────────────────┤
  │ Packet Loss          │ < 1% (good), < 5% (degraded)    │
  ├──────────────────────┼──────────────────────────────────┤
  │ Jitter               │ < 30ms (good), < 50ms (ok)      │
  ├──────────────────────┼──────────────────────────────────┤
  │ Bitrate (video)      │ 500kbps-5Mbps depending on res  │
  ├──────────────────────┼──────────────────────────────────┤
  │ Frame Rate           │ 24-30fps (target), >15fps (min)  │
  ├──────────────────────┼──────────────────────────────────┤
  │ Frames Dropped       │ < 1% of decoded frames           │
  ├──────────────────────┼──────────────────────────────────┤
  │ qualityLimitReason   │ "none" (ideal), "bandwidth" or   │
  │                      │ "cpu" indicates problems          │
  ├──────────────────────┼──────────────────────────────────┤
  │ NACK count           │ Increasing = packet loss          │
  ├──────────────────────┼──────────────────────────────────┤
  │ PLI count            │ Increasing = decoder struggling   │
  └──────────────────────┴──────────────────────────────────┘
```

### Periodic Stats Collection

```javascript
class StatsMonitor {
  constructor(pc, intervalMs = 2000) {
    this.pc = pc;
    this.intervalMs = intervalMs;
    this.previousStats = null;
    this.intervalId = null;
  }

  start() {
    this.intervalId = setInterval(async () => {
      const report = await this.pc.getStats();
      const currentStats = this.parseReport(report);
      const delta = this.computeDelta(this.previousStats, currentStats);

      this.emit('stats', delta);

      if (delta.packetLossRate > 0.05) {
        this.emit('quality-warning', {
          type: 'high-packet-loss',
          value: delta.packetLossRate
        });
      }

      if (delta.roundTripTime > 0.3) {
        this.emit('quality-warning', {
          type: 'high-latency',
          value: delta.roundTripTime
        });
      }

      this.previousStats = currentStats;
    }, this.intervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  parseReport(report) {
    // Extract relevant stats from RTCStatsReport
    const parsed = { timestamp: Date.now() };

    report.forEach((stat) => {
      if (stat.type === 'inbound-rtp' && stat.kind === 'video') {
        parsed.videoInbound = {
          packetsReceived: stat.packetsReceived,
          packetsLost: stat.packetsLost,
          bytesReceived: stat.bytesReceived,
          jitter: stat.jitter,
          framesDecoded: stat.framesDecoded,
          framesDropped: stat.framesDropped,
          framesPerSecond: stat.framesPerSecond
        };
      }
    });

    return parsed;
  }

  computeDelta(prev, curr) {
    if (!prev || !prev.videoInbound || !curr.videoInbound) {
      return { packetLossRate: 0, roundTripTime: 0, bitrate: 0 };
    }

    const timeDelta = (curr.timestamp - prev.timestamp) / 1000;
    const packetsLostDelta =
      curr.videoInbound.packetsLost - prev.videoInbound.packetsLost;
    const packetsRecvDelta =
      curr.videoInbound.packetsReceived - prev.videoInbound.packetsReceived;

    const totalPackets = packetsLostDelta + packetsRecvDelta;
    const packetLossRate = totalPackets > 0
      ? packetsLostDelta / totalPackets
      : 0;

    const bytesDelta =
      curr.videoInbound.bytesReceived - prev.videoInbound.bytesReceived;
    const bitrate = (bytesDelta * 8) / timeDelta;

    return {
      packetLossRate,
      roundTripTime: curr.videoInbound.jitter,
      bitrate,
      framesPerSecond: curr.videoInbound.framesPerSecond
    };
  }

  // Simple event emitter
  emit(event, data) {
    // Send to monitoring dashboard, log, etc.
  }
}
```

### Monitoring Dashboards

Production WebRTC applications send stats to observability platforms:

- **callstats.io** (now part of 8x8) -- Purpose-built WebRTC analytics.
- **Twilio Video Insights** -- If using Twilio's SDK.
- **Custom** -- Send stats via the data channel or a side HTTP/WebSocket connection to your own Grafana/Datadog/New Relic backend.

Key dashboard panels:
1. **Call quality distribution** -- Histogram of MOS scores across all calls.
2. **Packet loss heatmap** -- Per-region, per-time breakdown.
3. **Bitrate over time** -- Per participant, with simulcast layer annotations.
4. **Connection setup time** -- ICE gathering + connectivity check duration.
5. **TURN usage rate** -- What percentage of connections need a relay.

---

## 12. Advanced Patterns

### Renegotiation

Renegotiation happens whenever you add, remove, or modify tracks on an existing PeerConnection. It triggers a new SDP offer/answer exchange without tearing down the ICE connection.

```javascript
// Add a screen share track mid-call
async function addScreenShare(pc, screenTrack) {
  const sender = pc.addTrack(screenTrack);

  // This triggers 'negotiationneeded' event
  // The perfect negotiation pattern handles this automatically
  return sender;
}

pc.onnegotiationneeded = async () => {
  await negotiate(pc);
};
```

### ICE Restart

When network conditions change (e.g., switching from Wi-Fi to cellular), ICE connectivity may break. An ICE restart re-gathers candidates and re-checks connectivity without creating a new PeerConnection.

```javascript
async function restartIce(pc) {
  // Create a new offer with ICE restart flag
  const offer = await pc.createOffer({ iceRestart: true });
  await pc.setLocalDescription(offer);

  // Send offer to remote peer via signaling
  signalingChannel.send({
    type: 'offer',
    sdp: pc.localDescription.sdp
  });
}

// Detect ICE failure
pc.oniceconnectionstatechange = () => {
  if (pc.iceConnectionState === 'failed') {
    restartIce(pc);
  }
};
```

### Perfect Negotiation Pattern

The perfect negotiation pattern eliminates glare (simultaneous offers from both sides) by assigning roles: one peer is "polite" and the other is "impolite."

```
  Perfect Negotiation State Machine

  ┌───────────────────────────────────────────────────────┐
  │                                                       │
  │   Polite Peer                   Impolite Peer         │
  │                                                       │
  │   ┌─────────┐                   ┌─────────┐          │
  │   │  Stable  │                   │  Stable  │          │
  │   └────┬────┘                   └────┬────┘          │
  │        │                              │               │
  │        │ negotiationneeded            │ negotiation    │
  │        │                              │ needed         │
  │        ▼                              ▼               │
  │   ┌──────────┐                  ┌──────────┐         │
  │   │ Create   │                  │ Create   │         │
  │   │ Offer    │                  │ Offer    │         │
  │   └────┬─────┘                  └────┬─────┘         │
  │        │                              │               │
  │        │ ──── Offer ────▶             │               │
  │        │             ◀──── Offer ──── │               │
  │        │                              │               │
  │   GLARE DETECTED!                     │               │
  │   Polite peer:                   Impolite peer:       │
  │   - Rolls back                   - Ignores incoming   │
  │   - Accepts remote offer         - Keeps own offer    │
  │   - Creates answer                                    │
  │        │                              │               │
  │        ▼                              ▼               │
  │   ┌─────────┐                   ┌─────────┐          │
  │   │  Stable  │◀── Answer ──────│  Stable  │          │
  │   └─────────┘                   └─────────┘          │
  │                                                       │
  └───────────────────────────────────────────────────────┘
```

```javascript
// Perfect negotiation implementation
function setupPerfectNegotiation(pc, signaling, isPolite) {
  let makingOffer = false;
  let ignoreOffer = false;

  pc.onnegotiationneeded = async () => {
    try {
      makingOffer = true;
      await pc.setLocalDescription();
      signaling.send({
        type: pc.localDescription.type,
        sdp: pc.localDescription.sdp
      });
    } catch (err) {
      // handle error
    } finally {
      makingOffer = false;
    }
  };

  signaling.onmessage = async ({ type, sdp, candidate }) => {
    try {
      if (type === 'offer' || type === 'answer') {
        const description = { type, sdp };

        const offerCollision =
          type === 'offer' &&
          (makingOffer || pc.signalingState !== 'stable');

        ignoreOffer = !isPolite && offerCollision;

        if (ignoreOffer) {
          return;
        }

        await pc.setRemoteDescription(description);

        if (type === 'offer') {
          await pc.setLocalDescription();
          signaling.send({
            type: pc.localDescription.type,
            sdp: pc.localDescription.sdp
          });
        }
      } else if (candidate) {
        try {
          await pc.addIceCandidate(candidate);
        } catch (err) {
          if (!ignoreOffer) {
            throw err;
          }
        }
      }
    } catch (err) {
      // handle error
    }
  };
}
```

### Transceiver API

The `RTCRtpTransceiver` API provides fine-grained control over sending and receiving media. Each transceiver pairs exactly one sender and one receiver.

```javascript
// Create a transceiver with specific direction
const transceiver = pc.addTransceiver('video', {
  direction: 'sendrecv',
  sendEncodings: [
    { rid: 'low', maxBitrate: 100_000, scaleResolutionDownBy: 4 },
    { rid: 'high', maxBitrate: 1_000_000, scaleResolutionDownBy: 1 }
  ]
});

// Change direction mid-call (e.g., mute sending)
transceiver.direction = 'recvonly';

// Stop the transceiver entirely
transceiver.stop();

// Get codec preferences
const codecs = RTCRtpReceiver.getCapabilities('video').codecs;
// Prefer VP9 over H.264
const vp9Codecs = codecs.filter(c => c.mimeType === 'video/VP9');
const otherCodecs = codecs.filter(c => c.mimeType !== 'video/VP9');
transceiver.setCodecPreferences([...vp9Codecs, ...otherCodecs]);
```

### replaceTrack

`replaceTrack()` swaps the media source on an existing sender without renegotiation. This is much faster and smoother than removing/adding tracks.

```javascript
// Switch from camera to screen share without renegotiation
async function switchToScreenShare(pc) {
  const screenStream = await navigator.mediaDevices.getDisplayMedia({
    video: true
  });
  const screenTrack = screenStream.getVideoTracks()[0];

  const videoSender = pc.getSenders().find(s =>
    s.track && s.track.kind === 'video'
  );

  // No renegotiation needed
  await videoSender.replaceTrack(screenTrack);

  // Switch back when screen share ends
  screenTrack.onended = async () => {
    const cameraStream = await navigator.mediaDevices.getUserMedia({
      video: true
    });
    await videoSender.replaceTrack(cameraStream.getVideoTracks()[0]);
  };
}
```

### Media Constraints Adaptation

Dynamically adjust capture constraints based on network conditions:

```javascript
async function adaptVideoQuality(videoTrack, networkQuality) {
  const constraints = videoTrack.getConstraints();

  switch (networkQuality) {
    case 'excellent':
      await videoTrack.applyConstraints({
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 }
      });
      break;

    case 'good':
      await videoTrack.applyConstraints({
        width: { ideal: 640 },
        height: { ideal: 360 },
        frameRate: { ideal: 24 }
      });
      break;

    case 'poor':
      await videoTrack.applyConstraints({
        width: { ideal: 320 },
        height: { ideal: 180 },
        frameRate: { ideal: 15 }
      });
      break;

    case 'critical':
      // Audio only
      videoTrack.enabled = false;
      break;
  }
}
```

---

## 13. WebRTC in Native Apps

### libwebrtc (Google's C++ Library)

The canonical WebRTC implementation. Used internally by Chrome, Electron, and as the basis for most platform SDKs.

- **Repository**: https://webrtc.googlesource.com/src
- **Language**: C++ with Objective-C (iOS) and Java/Kotlin (Android) wrappers.
- **Build system**: GN + Ninja (Google's build tools).
- **Size**: ~1.5 million lines of code. Build takes 30+ minutes.
- **Pros**: Feature-complete, battle-tested, same implementation as Chrome.
- **Cons**: Massive codebase, difficult to customize, slow build times, Google-specific build system.

### Platform SDKs

**iOS (WebRTC.framework)**

```swift
import WebRTC

let config = RTCConfiguration()
config.iceServers = [
    RTCIceServer(urlStrings: ["stun:stun.l.google.com:19302"])
]

let constraints = RTCMediaConstraints(
    mandatoryConstraints: nil,
    optionalConstraints: nil
)

let factory = RTCPeerConnectionFactory()
let peerConnection = factory.peerConnection(
    with: config,
    constraints: constraints,
    delegate: self
)

// Camera capture
let capturer = RTCCameraVideoCapturer(delegate: videoSource)
let device = RTCCameraVideoCapturer.captureDevices().first!
capturer.startCapture(with: device, format: format, fps: 30)
```

**Android (org.webrtc)**

```kotlin
val factory = PeerConnectionFactory.builder()
    .setVideoDecoderFactory(DefaultVideoDecoderFactory(eglBase.eglBaseContext))
    .setVideoEncoderFactory(DefaultVideoEncoderFactory(
        eglBase.eglBaseContext, true, true
    ))
    .createPeerConnectionFactory()

val config = PeerConnection.RTCConfiguration(listOf(
    PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer()
))

val peerConnection = factory.createPeerConnection(config, observer)

// Camera capture
val videoCapturer = Camera2Enumerator(context)
    .createCapturer(cameraName, null)
videoCapturer.initialize(
    surfaceTextureHelper,
    context,
    videoSource.capturerObserver
)
videoCapturer.startCapture(1280, 720, 30)
```

### Pion (Go)

Pion is a pure Go implementation of WebRTC. Popular for building custom SFUs and media servers.

```go
package main

import (
    "github.com/pion/webrtc/v4"
)

func main() {
    config := webrtc.Configuration{
        ICEServers: []webrtc.ICEServer{
            {URLs: []string{"stun:stun.l.google.com:19302"}},
        },
    }

    pc, err := webrtc.NewPeerConnection(config)
    if err != nil {
        panic(err)
    }
    defer pc.Close()

    // Handle incoming tracks
    pc.OnTrack(func(track *webrtc.TrackRemote, receiver *webrtc.RTPReceiver) {
        codec := track.Codec()
        if codec.MimeType == webrtc.MimeTypeVP8 {
            // Forward to subscribers, save to disk, etc.
            for {
                rtp, _, err := track.ReadRTP()
                if err != nil {
                    return
                }
                // Process RTP packet
                _ = rtp
            }
        }
    })

    // Handle data channels
    pc.OnDataChannel(func(dc *webrtc.DataChannel) {
        dc.OnMessage(func(msg webrtc.DataChannelMessage) {
            // Handle incoming message
        })
    })
}
```

**Why Pion is popular for SFUs:**
- Pure Go: easy cross-compilation, no CGo dependencies.
- Modular: use only the components you need (ICE, DTLS, SRTP, SCTP separately).
- Well-documented with many examples.
- Active community and maintenance.

### webrtc-rs (Rust)

A pure Rust implementation, suitable for performance-critical servers and embedded systems.

```rust
use webrtc::api::APIBuilder;
use webrtc::peer_connection::configuration::RTCConfiguration;
use webrtc::ice_transport::ice_server::RTCIceServer;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = RTCConfiguration {
        ice_servers: vec![RTCIceServer {
            urls: vec!["stun:stun.l.google.com:19302".to_owned()],
            ..Default::default()
        }],
        ..Default::default()
    };

    let api = APIBuilder::new().build();
    let peer_connection = api.new_peer_connection(config).await?;

    peer_connection.on_track(Box::new(move |track, _receiver, _transceiver| {
        tokio::spawn(async move {
            // Process incoming RTP packets
            while let Ok((rtp_packet, _)) = track.read_rtp().await {
                // Forward, record, or process
            }
        });
        Box::pin(async {})
    }));

    Ok(())
}
```

### aiortc (Python)

A Python implementation built on asyncio. Useful for testing, bots, and server-side processing.

```python
import asyncio
from aiortc import RTCPeerConnection, RTCSessionDescription
from aiortc.contrib.media import MediaRecorder

async def main():
    pc = RTCPeerConnection()
    recorder = MediaRecorder("output.mp4")

    @pc.on("track")
    async def on_track(track):
        if track.kind == "video":
            recorder.addTrack(track)
            await recorder.start()

    # Create offer/answer via signaling...
    # When done:
    await recorder.stop()
    await pc.close()

asyncio.run(main())
```

### Native Implementation Comparison

```
  ┌────────────┬───────────┬───────────┬──────────────┬──────────────┐
  │            │ libwebrtc │   Pion    │  webrtc-rs   │   aiortc     │
  ├────────────┼───────────┼───────────┼──────────────┼──────────────┤
  │ Language   │ C++       │ Go        │ Rust         │ Python       │
  ├────────────┼───────────┼───────────┼──────────────┼──────────────┤
  │ Maturity   │ Very High │ High      │ Medium       │ Medium       │
  ├────────────┼───────────┼───────────┼──────────────┼──────────────┤
  │ Performance│ Excellent │ Very Good │ Excellent    │ Good         │
  ├────────────┼───────────┼───────────┼──────────────┼──────────────┤
  │ Build ease │ Difficult │ Easy      │ Easy         │ Easy         │
  ├────────────┼───────────┼───────────┼──────────────┼──────────────┤
  │ Use case   │ Browsers, │ SFUs,     │ High-perf    │ Testing,     │
  │            │ mobile    │ servers   │ servers      │ bots, ML     │
  ├────────────┼───────────┼───────────┼──────────────┼──────────────┤
  │ HW accel   │ Yes       │ No*       │ No*          │ No           │
  ├────────────┼───────────┼───────────┼──────────────┼──────────────┤
  │ Simulcast  │ Full      │ Full      │ Full         │ Limited      │
  ├────────────┼───────────┼───────────┼──────────────┼──────────────┤
  │ Data Ch    │ Full      │ Full      │ Full         │ Full         │
  └────────────┴───────────┴───────────┴──────────────┴──────────────┘

  * Pion and webrtc-rs handle RTP forwarding; encoding/decoding
    is typically done by external libraries (e.g., GStreamer, FFmpeg).
```

---

## 14. Common Interview Questions

### Scaling & Architecture

**Q: Why can't WebRTC P2P scale to 50 participants?**

A: In a full mesh, each peer must send N-1 separate encoded streams. With 50 participants that means 49 simultaneous uploads per peer. A typical residential connection can handle 3-5 Mbps upload, supporting only 2-3 high-quality video streams. Additionally, each connection requires independent ICE negotiation and STUN/TURN traversal, exponentially increasing setup complexity. The total connections grow as N*(N-1)/2 = 1225, making mesh infeasible. SFUs solve this by reducing upload to 1 stream (or 2-3 simulcast layers) per peer.

**Q: Compare SFU and MCU. When would you choose each?**

A: An SFU forwards encrypted media packets without decoding -- low CPU cost, low added latency (~20-50ms), and the client controls its own layout. An MCU decodes all streams, composites a single video layout, and re-encodes -- high CPU cost (~10-100x more), higher latency (~100-300ms added), but each participant downloads only one stream. Choose SFU for modern video conferencing where clients have decent bandwidth and processing power. Choose MCU for interoperating with legacy SIP endpoints, ultra-low bandwidth clients, or when you need guaranteed server-side composited recordings.

**Q: How does an SFU handle simulcast layer switching?**

A: The SFU maintains per-subscriber state tracking their estimated bandwidth (via TWCC/REMB), their requested viewport size, and whether they are viewing the speaker or a thumbnail. When switching to a lower layer, the SFU waits for a keyframe on the target layer (or sends a PLI to request one), then begins forwarding from the new layer. It rewrites RTP sequence numbers and timestamps to present a continuous stream to the decoder. Some SFUs use temporal layer switching as a finer-grained adjustment before dropping to a lower spatial layer.

### Simulcast & SVC

**Q: What is the difference between simulcast and SVC?**

A: Simulcast encodes the source into multiple independent streams (e.g., 720p, 360p, 180p) with separate SSRCs. The SFU picks which complete stream to forward. SVC encodes a single bitstream with embedded layers that can be stripped by the SFU. Simulcast has higher bandwidth overhead (~1.5x vs ~1.2x) and requires keyframes to switch spatial layers. SVC is more bandwidth-efficient and allows smoother switching (especially K-SVC in VP9) but has more limited codec support. Simulcast works with H.264, VP8, VP9, and AV1. SVC works primarily with VP9 and AV1.

**Q: Explain temporal scalability in SVC.**

A: Temporal scalability organizes frames into a hierarchy of layers. The base layer (T0) contains essential reference frames at a low frame rate (e.g., 7.5 fps). T1 adds intermediate frames that reference only T0, doubling the rate to 15 fps. T2 adds frames referencing T1, reaching 30 fps. The SFU can strip higher temporal layers to reduce bandwidth without waiting for keyframes or causing decoder errors, because each layer is designed to be droppable without breaking the decode chain.

### Data Channels

**Q: How are WebRTC data channels different from WebSockets?**

A: Data channels run over SCTP/DTLS/ICE, providing P2P (or SFU-relayed) transport with configurable reliability. WebSockets are client-server over TCP. Key differences: (1) Data channels support unreliable/unordered delivery for low-latency use cases, while WebSockets are always reliable and ordered. (2) Data channels are encrypted by default via DTLS. (3) Data channels can work P2P without a server relay. (4) WebSockets have higher throughput for bulk transfer since they avoid SCTP overhead. (5) Data channels share the same ICE transport as media, reducing connection overhead.

**Q: When would you use an unreliable, unordered data channel?**

A: For any high-frequency state that becomes stale quickly: game player positions (30+ updates/second), cursor positions in collaborative tools, real-time sensor telemetry, live captions in progress. Retransmitting a stale position update is wasteful and adds latency. With `{ ordered: false, maxRetransmits: 0 }`, the channel behaves like a UDP datagram -- fire-and-forget with the lowest possible latency.

### Screen Sharing

**Q: How does getDisplayMedia differ from getUserMedia?**

A: `getDisplayMedia()` captures screen content (monitor, window, or browser tab) rather than camera/microphone. Key differences: (1) It always shows a browser-native picker dialog; you cannot programmatically select a source. (2) It requires a user gesture (click) to invoke. (3) It supports system audio capture (Chrome tab sharing only). (4) The content type is fundamentally different -- screen content has sharp text and static regions, so encoders should be tuned differently (use `contentHint = 'text'`). (5) The user can stop sharing via browser UI, triggering the track's `onended` event.

### E2EE & Encoded Transform

**Q: How does end-to-end encryption work in WebRTC when using an SFU?**

A: Standard WebRTC uses DTLS-SRTP between each peer and the SFU, meaning the SFU can decrypt media. For true E2EE, we use the Encoded Transform API (RTCRtpScriptTransform). On the sender side, after encoding but before packetization, a JavaScript transform encrypts the frame payload with a shared key (typically AES-GCM). The encrypted RTP packets pass through the SFU, which can route them based on headers but cannot read the payload. On the receiver side, a reverse transform decrypts before decoding. Key management is handled out-of-band via a separate secure channel (e.g., MLS protocol or a Signal-like double ratchet). Key rotation is required when participants join or leave.

### Bandwidth Estimation

**Q: Explain how TWCC works.**

A: TWCC (Transport-Wide Congestion Control) shifts bandwidth estimation to the sender. Every RTP packet gets a monotonically increasing transport-wide sequence number via an RTP header extension. The receiver periodically (every ~100ms) sends an RTCP feedback packet reporting the arrival timestamp of each received packet. The sender correlates its send timestamps with the reported receive timestamps to compute one-way delay variations. If inter-arrival delays are increasing, the network is congesting. The GCC algorithm uses a Kalman filter on these delay measurements to determine whether to increase, decrease, or hold the sending bitrate. TWCC is superior to REMB because the sender has more information and can react faster.

**Q: What happens when bandwidth drops suddenly (e.g., entering a tunnel)?**

A: The congestion control detects increased delay and packet loss within 1-2 seconds. The delay-based estimator in GCC signals "Overuse" state, immediately reducing the target bitrate. The encoder responds by lowering its output bitrate (the encoder has a built-in rate controller). If simulcast is active, the SFU simultaneously switches subscribers to lower layers. If the bitrate drops below a threshold, resolution decreases, then frame rate drops. Audio is typically prioritized over video. If the connection is completely lost, ICE detects the failure after ~5-10 seconds of missed STUN binding responses, and the application can trigger an ICE restart to attempt reconnection.

### Statistics & Debugging

**Q: How would you debug poor video quality in a WebRTC call?**

A: Start with `getStats()` and examine: (1) `qualityLimitationReason` on `outbound-rtp` -- if "bandwidth," the sender cannot send at the desired bitrate; if "cpu," encoding is too expensive. (2) `packetsLost`/`packetsReceived` ratio on `inbound-rtp` -- above 5% indicates severe network issues. (3) `jitter` -- above 50ms suggests variable network delay. (4) `framesDropped`/`framesDecoded` -- dropped frames indicate the decoder cannot keep up or late frames arrived after playout time. (5) `currentRoundTripTime` on the `candidate-pair` -- above 300ms means significant propagation delay. (6) `nackCount`/`pliCount` -- high values indicate frequent retransmission requests, wasting bandwidth. (7) Check the ICE candidate type -- if `relay`, TURN is being used, which adds latency and server cost. Then cross-reference with server-side SFU logs for the same timeframe.

### Advanced Patterns

**Q: What is the perfect negotiation pattern and why is it needed?**

A: Perfect negotiation solves the "glare" problem -- when both peers simultaneously send offers. Without it, both peers set their local description to an offer and then receive the other's offer, causing `InvalidStateError` because you cannot set a remote offer when your signaling state is `have-local-offer`. The pattern assigns roles: one peer is "polite" (will roll back its offer and accept the incoming one) and the other is "impolite" (will ignore the incoming offer and wait for its own to be accepted). This guarantees exactly one offer survives any collision, and both peers converge to a stable state.

**Q: When would you use replaceTrack vs removing and adding a track?**

A: Use `replaceTrack()` when switching media sources (e.g., camera to screen share, front to back camera) because it swaps the source without triggering renegotiation -- no new offer/answer exchange, no ICE restart risk, instant switch. Use remove/add when you need to change the number of tracks (e.g., adding a second video stream for screen share alongside camera) because that requires a new m-line in the SDP, which requires renegotiation.

**Q: How does ICE restart differ from creating a new PeerConnection?**

A: ICE restart re-gathers candidates and re-runs connectivity checks while preserving the existing DTLS session and RTP streams. It generates new ICE credentials (ufrag/pwd) but reuses the DTLS key material. This means media may briefly interrupt (a few hundred milliseconds) but resumes quickly without the overhead of a full DTLS handshake, SDP exchange, and codec negotiation. Creating a new PeerConnection tears everything down and starts fresh, causing a noticeable disruption. ICE restart is the right choice for transient network changes (Wi-Fi to cellular, brief connectivity loss). A new PeerConnection is needed only when the entire session context must be reset.

### Native Implementations

**Q: Why would you use Pion (Go) instead of libwebrtc for a server?**

A: Pion is a pure Go implementation with no CGo dependencies, making it trivially cross-compilable and easy to integrate into Go services. For SFU use cases, the server does not need to encode or decode media -- it forwards RTP packets, which Pion handles natively. libwebrtc is designed as a client library and carries enormous complexity (audio processing, video encoding, rendering) that a server does not need. Pion's modular architecture lets you use only the components required (ICE, DTLS, SRTP, SCTP). It builds in seconds versus 30+ minutes for libwebrtc, and the Go ecosystem provides excellent concurrency primitives for handling thousands of simultaneous connections.

**Q: How would you build a recording bot that joins a WebRTC call?**

A: Three approaches in order of increasing complexity: (1) **Headless browser** -- Run Chrome in headless mode (via Puppeteer or Playwright), join the call as a regular participant, use MediaRecorder to capture. Simple but resource-heavy (each bot runs a full browser). (2) **Server-side SDK (aiortc/Pion)** -- Write a bot using aiortc (Python) or Pion (Go) that implements the signaling protocol, joins as a peer, receives RTP streams, and writes them to disk or pipes to FFmpeg for muxing. More efficient but requires implementing the application's signaling protocol. (3) **SFU-side recording** -- Configure the SFU (e.g., mediasoup, LiveKit) to fork incoming RTP streams to a recording pipeline. Most efficient; no extra peer connection needed. LiveKit and mediasoup both have recording features built in.

---

## Summary Cheat Sheet

```
  WebRTC Advanced Topic Map

  ┌─────────────────────────────────────────────────┐
  │              SCALING                             │
  │  Mesh ──▶ SFU ──▶ MCU ──▶ Hybrid               │
  │  (P2P)   (forward) (mix)  (SFU + MCU)          │
  └──────────────────────┬──────────────────────────┘
                         │
  ┌──────────────────────┼──────────────────────────┐
  │         QUALITY ADAPTATION                       │
  │                      │                           │
  │  Simulcast      SVC        BWE (GCC/TWCC)       │
  │  (N layers)  (embedded)  (congestion control)    │
  │  rid-based   VP9/AV1    delay + loss estimator   │
  └──────────────────────┬──────────────────────────┘
                         │
  ┌──────────────────────┼──────────────────────────┐
  │              FEATURES                            │
  │                      │                           │
  │  Data Channels   Screen Share   Recording        │
  │  SCTP/DTLS      getDisplayMedia MediaRecorder    │
  │  ordered/unrel  tab/window/scrn server-side      │
  └──────────────────────┬──────────────────────────┘
                         │
  ┌──────────────────────┼──────────────────────────┐
  │           ADVANCED                               │
  │                      │                           │
  │  E2EE (Encoded     Perfect        getStats()    │
  │   Transform)       Negotiation    monitoring     │
  │  AES-GCM frames   polite/impolite RTCStatsReport│
  └──────────────────────┬──────────────────────────┘
                         │
  ┌──────────────────────┼──────────────────────────┐
  │        NATIVE IMPLEMENTATIONS                    │
  │                      │                           │
  │  libwebrtc  Pion   webrtc-rs   aiortc           │
  │  (C++)     (Go)    (Rust)      (Python)         │
  │  Browser   SFU     High-perf   Testing/ML       │
  └─────────────────────────────────────────────────┘
```

---

## Further Reading

- **WebRTC for the Curious** (webrtcforthecurious.com) -- Free, in-depth protocol walkthrough.
- **RFC 8829** -- JavaScript Session Establishment Protocol (JSEP).
- **RFC 8834** -- Media Transport and Use of RTP in WebRTC.
- **RFC 8831** -- WebRTC Data Channels.
- **RFC 8836** -- Congestion Control Requirements for RMCAT.
- **draft-ietf-rtcweb-sdp** -- SDP for WebRTC guidelines.
- **W3C WebRTC Encoded Transform** -- https://www.w3.org/TR/webrtc-encoded-transform/
- **Pion documentation** -- https://github.com/pion/webrtc
- **mediasoup documentation** -- https://mediasoup.org/documentation/
- **LiveKit documentation** -- https://docs.livekit.io
