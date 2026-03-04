# Media Servers: A Comprehensive Guide for Software Engineers

## Table of Contents

1. [Why Media Servers](#1-why-media-servers)
2. [Media Server Architectures](#2-media-server-architectures)
3. [Janus Gateway](#3-janus-gateway)
4. [mediasoup](#4-mediasoup)
5. [LiveKit](#5-livekit)
6. [Pion](#6-pion)
7. [Kurento / OpenVidu](#7-kurento--openvidu)
8. [Jitsi](#8-jitsi)
9. [Streaming Media Servers](#9-streaming-media-servers)
10. [Media Server Comparison Table](#10-media-server-comparison-table)
11. [Choosing the Right Server](#11-choosing-the-right-server)
12. [Deployment Patterns](#12-deployment-patterns)
13. [Building a Custom SFU](#13-building-a-custom-sfu)
14. [Code Examples](#14-code-examples)
15. [Common Interview Questions](#15-common-interview-questions)

---

## 1. Why Media Servers

### The Limits of Peer-to-Peer

WebRTC was designed with peer-to-peer (P2P) communication in mind. Two browsers connect directly, exchanging audio and video without any server in the media path. This works well for 1:1 calls, but it breaks down quickly as you scale.

**The N*(N-1) problem**: In a full-mesh P2P topology, every participant sends their media to every other participant. For N participants, each peer must maintain N-1 upstream connections and N-1 downstream connections. The total number of connections is N*(N-1). With 5 participants, each peer sends 4 streams and receives 4 streams. With 10 participants, each peer sends 9 streams and receives 9 streams. The bandwidth, CPU, and battery consumption on each client grows linearly with the number of participants, making full-mesh impractical beyond 4-6 participants on most consumer hardware.

### Core Functions of a Media Server

Media servers sit in the media path between clients and provide several critical functions:

**Routing**: The most fundamental function. Instead of every client sending to every other client, each client sends to the server once. The server then routes (forwards) each stream to interested receivers. This reduces each client's upload requirement to a single stream regardless of participant count.

**Recording**: Capturing the media for later playback, compliance, or analysis. The server can record individual tracks or a composite mix. Without a media server, recording requires a dedicated client to join the call as a "recording bot," which is fragile and resource-intensive.

**Transcoding**: Converting media from one codec or resolution to another. If a mobile client can only decode H.264 but the sender is using VP8, the media server can transcode on the fly. Transcoding is CPU-intensive and is the primary reason MCU architectures exist.

**Broadcasting**: Distributing media from one source to many receivers. A media server can take a single WebRTC stream and repackage it as HLS, DASH, or RTMP for distribution to thousands or millions of viewers.

**Mixing**: Combining multiple audio or video streams into a single composite stream. Audio mixing is common (combining all participant audio into one stream per receiver, minus their own). Video mixing creates a layout (grid, speaker view) and composites it into a single video stream. Mixing offloads processing from clients to the server.

**Bridging Protocols**: Connecting different real-time protocols. A media server can bridge WebRTC to SIP (for telephony), RTMP (for legacy streaming), or proprietary protocols. This interoperability is essential in enterprise communications.

**Simulcast and SVC Handling**: Clients can send multiple quality layers (simulcast) or scalable video coding (SVC) streams. The media server selects which layer to forward to each receiver based on their bandwidth, display size, and priority, enabling adaptive quality without transcoding.

**Bandwidth Estimation and Congestion Control**: The media server participates in RTCP feedback loops, estimating available bandwidth for each receiver and instructing senders to adjust their bitrate accordingly.

### When You Need a Media Server

- More than 4-6 participants in a call
- Recording or archiving is required
- Broadcasting to large audiences
- Interoperability with SIP, RTMP, or other protocols
- Server-side media processing (transcoding, filters, AI)
- Regulatory compliance requiring server-side control
- Quality adaptation across heterogeneous networks

---

## 2. Media Server Architectures

### SFU (Selective Forwarding Unit)

An SFU receives media from each participant and selectively forwards it to other participants without decoding or re-encoding. It operates at the RTP packet level.

```
       Client A             Client B             Client C
         |                     |                     |
    send A's stream       send B's stream       send C's stream
         |                     |                     |
         v                     v                     v
    +--------------------------------------------------+
    |                      SFU                         |
    |  Receives all streams, forwards selectively      |
    |  No decoding, no re-encoding                     |
    +--------------------------------------------------+
         |    |           |    |           |    |
     fwd B  fwd C    fwd A  fwd C    fwd A  fwd B
         |    |           |    |           |    |
         v    v           v    v           v    v
       Client A         Client B         Client C
```

**Advantages**:
- Low latency (no transcoding delay)
- Low server CPU (no decode/encode)
- Preserves end-to-end encryption possibility
- Scales well horizontally
- Each receiver can get different quality layers (simulcast)

**Disadvantages**:
- Clients must decode multiple streams (N-1 decoders)
- Clients need sufficient download bandwidth for all streams
- No server-side composition or mixing

**Use cases**: Video conferencing (Zoom, Google Meet, Microsoft Teams all use SFU architectures), real-time collaboration tools.

### MCU (Multipoint Control Unit)

An MCU receives all participant streams, decodes them, mixes them into a single composite stream (for video: a grid layout; for audio: a mix of all participants), re-encodes, and sends the composite to each participant.

```
       Client A             Client B             Client C
         |                     |                     |
    send A's stream       send B's stream       send C's stream
         |                     |                     |
         v                     v                     v
    +--------------------------------------------------+
    |                      MCU                         |
    |  Decode all -> Mix/Compose -> Re-encode          |
    |  Single composite output per receiver            |
    +--------------------------------------------------+
         |                     |                     |
    composite stream     composite stream     composite stream
    (B+C mixed)          (A+C mixed)          (A+B mixed)
         |                     |                     |
         v                     v                     v
       Client A             Client B             Client C
```

**Advantages**:
- Minimal client resources (decode one stream only)
- Low download bandwidth (single stream)
- Works on very low-power devices
- Server controls the layout and quality

**Disadvantages**:
- Very high server CPU (decode + encode for every participant)
- Added latency from transcoding pipeline
- Breaks end-to-end encryption
- Difficult to scale
- Less flexible for client-side UI customization

**Use cases**: Legacy telephony bridges, situations where clients have very limited capabilities, specific regulatory requirements.

### Hybrid Architecture

Many production systems combine SFU and MCU approaches. For example:
- SFU for video (low latency, client decodes individual streams)
- MCU for audio (server mixes audio, reducing client processing)
- MCU for recording (server composites a single recording)
- SFU for active speakers, MCU for thumbnail/gallery views

### Cascaded SFU

When a single SFU cannot handle all participants or when participants are geographically distributed, multiple SFUs can be cascaded. Each SFU serves a region, and they forward streams between each other.

```
    Region: US-East              Region: EU-West
    +-----------+               +-----------+
    |   SFU-1   |<-- cascade -->|   SFU-2   |
    +-----------+               +-----------+
     /    |    \                  /    |    \
   A      B      C            D      E      F
```

**Key considerations**:
- Inter-SFU links add latency (typically 50-200ms cross-region)
- Selective forwarding decisions become more complex
- Need consistent signaling across SFUs
- Each SFU only needs to handle its local participants plus cascaded streams

**Implementations**: Jitsi's Ocula, LiveKit's multi-node, custom cascading with mediasoup.

### Distributed Media Servers

A fully distributed architecture goes beyond cascading. Media processing is spread across multiple nodes with:
- Load balancing of media streams
- Automatic failover
- Geographic optimization (route to nearest server)
- Independent scaling of different functions (routing, recording, transcoding)

This is the architecture used by large-scale platforms like Zoom, Twitch, and Cloudflare Calls.

---

## 3. Janus Gateway

### Overview

Janus is a general-purpose WebRTC gateway developed by Meetecho (originally funded by the EU). Written in C, it is lightweight, modular, and one of the oldest and most battle-tested open-source WebRTC media servers.

### Architecture

Janus uses a **plugin-based architecture**. The core handles:
- WebRTC negotiation (ICE, DTLS, SRTP)
- RTP/RTCP processing
- Transport management (WebSocket, HTTP, RabbitMQ, MQTT, Nanomsg, Unix sockets)
- Session management

All application logic lives in plugins. This makes Janus extremely flexible: you compose functionality by loading the plugins you need.

```
+---------------------------------------------+
|              Janus Core                      |
|  +----------+  +--------+  +-----------+    |
|  | ICE/DTLS |  |  RTP   |  | Transport |    |
|  | Handler  |  | Engine |  | Manager   |    |
|  +----------+  +--------+  +-----------+    |
+---------------------------------------------+
         |            |            |
   +----------+ +----------+ +----------+
   | VideoRoom| | AudioBrdg| |Streaming |
   | Plugin   | | Plugin   | | Plugin   |
   +----------+ +----------+ +----------+
   +----------+ +----------+ +----------+
   |   SIP    | | TextRoom | |Record&Ply|
   | Plugin   | | Plugin   | | Plugin   |
   +----------+ +----------+ +----------+
```

### Key Plugins

**VideoRoom**: The most commonly used plugin. It implements an SFU for video conferencing. Participants join a room and publish/subscribe to streams. Supports simulcast, recording, and configurable forwarding rules.

**AudioBridge**: An MCU for audio. Mixes audio from all participants in a room and sends the composite back. Ideal for large audio-only conferences or as a complement to VideoRoom for audio mixing.

**Streaming**: Accepts external media sources (RTP, RTSP, or files) and makes them available as WebRTC streams. Used for live streaming, IPTV, or restreaming.

**SIP**: Bridges WebRTC to SIP. Registers with a SIP server and enables WebRTC clients to make and receive SIP calls. Handles codec negotiation, SRTP-to-RTP conversion, and re-INVITE handling.

**TextRoom**: A data channel-based text chat room. Uses WebRTC data channels for reliable, low-latency text messaging.

**Record&Play**: Records WebRTC sessions to .mjr files (Janus's custom format containing RTP packets). Can play back recordings. The .mjr format can be post-processed into standard containers (WebM, MP4) using janus-pp-rec.

### API Model

Janus exposes a REST and WebSocket API. Communication follows a session-based model:

```
1. Create Session   -> POST /janus          -> returns session_id
2. Attach Plugin    -> POST /janus/{sid}    -> returns handle_id
3. Send Message     -> POST /janus/{sid}/{hid} -> plugin-specific
4. Trickle ICE      -> POST /janus/{sid}/{hid} -> ICE candidates
5. Long-poll Events -> GET  /janus/{sid}    -> server events
```

With WebSocket transport, all messages flow over a single connection using JSON.

**Signaling Model**: Janus uses JSEP (JavaScript Session Establishment Protocol). The client creates an SDP offer, sends it to Janus via the API, and Janus responds with an SDP answer. ICE candidates are trickled asynchronously.

### Deployment

Janus is typically deployed as a single process. For scaling:
- Run multiple Janus instances behind a load balancer
- Use RabbitMQ or MQTT transport for distributed signaling
- Each instance handles a set of rooms independently
- No built-in clustering; you must implement room-to-instance mapping

**Docker deployment**: Official Docker images are available. Typical configuration involves mounting config files for each plugin.

### Pros and Cons

**Pros**:
- Extremely lightweight (C, low memory footprint)
- Very modular plugin architecture
- Battle-tested, large community
- Excellent documentation and demos
- SIP bridging built-in
- Supports multiple transports

**Cons**:
- Plugin development requires C knowledge
- No built-in clustering or horizontal scaling
- Custom recording format (.mjr) requires post-processing
- Configuration can be complex (many config files)
- Single-threaded event loop per session (can be a bottleneck)

---

## 4. mediasoup

### Overview

mediasoup is a WebRTC SFU designed for building custom real-time applications. It consists of a Node.js (or Rust) library that orchestrates C++ worker processes. Created by Inaki Baz Castillo, it has become one of the most popular choices for developers building bespoke video applications.

### Architecture

mediasoup's architecture is built around a clear hierarchy of objects:

```
Application (Node.js)
  |
  +-- Worker (C++ process, one per CPU core)
       |
       +-- Router (equivalent to a "room" or media routing domain)
            |
            +-- Transport (WebRTC, Plain RTP, Pipe, or Direct)
                 |
                 +-- Producer (a media source: audio or video track)
                 |
                 +-- Consumer (a media sink: receiving a Producer's media)
```

**Worker**: A separate C++ process that handles all media processing. Each Worker runs on a single CPU core. You typically create one Worker per available core. Workers are isolated: a crash in one does not affect others.

**Router**: A routing domain within a Worker. Producers and Consumers within the same Router can exchange media. Think of it as a "room," though the concept is more flexible. Routers on different Workers or machines can be connected via PipeTransports.

**Transport**: The network-level connection. WebRtcTransport handles the ICE/DTLS/SRTP stack. PlainTransport handles plain RTP (for SIP integration or FFmpeg). PipeTransport connects Routers. DirectTransport handles data channels without RTP.

**Producer**: Represents a media source. When a client sends audio or video, a Producer is created on their Transport. The Producer has an RTP stream that the Router can route to Consumers.

**Consumer**: Represents a media sink. When a client wants to receive a Producer's media, a Consumer is created on the receiving client's Transport. The Consumer tells the Router which Producer to forward.

### Node.js + C++ Design

This split is deliberate and powerful:

- **Node.js layer**: Handles signaling, business logic, room management, authentication, and orchestration. This is where your application code lives. The Node.js API is clean, well-typed (TypeScript), and asynchronous.
- **C++ layer**: Handles all media processing (RTP parsing, SRTP encryption, RTCP handling, bandwidth estimation, simulcast layer selection). This is performance-critical code that runs in separate processes.

The two layers communicate via Unix pipes or similar IPC. The Node.js layer sends commands (create transport, create producer, etc.) and receives events (new RTP packet stats, consumer layerschange, etc.).

### Why It Is Popular for Custom Applications

1. **No opinions about rooms or signaling**: mediasoup does not dictate how you structure rooms, signaling, or authentication. You build your own signaling server (typically with Socket.io, WebSocket, or any transport) and use mediasoup's API to manage media.

2. **Full control**: Every aspect of the media pipeline is accessible. You can control which simulcast layer each consumer receives, pause/resume producers, set bandwidth limits, and inspect RTP statistics.

3. **TypeScript-first**: The Node.js API is written in TypeScript with comprehensive type definitions.

4. **Active development**: Frequent releases, responsive maintainer, active community.

### API Walkthrough

```typescript
// 1. Create a Worker
const worker = await mediasoup.createWorker({
  logLevel: 'warn',
  rtcMinPort: 10000,
  rtcMaxPort: 59999,
});

// 2. Create a Router (media routing domain / "room")
const router = await worker.createRouter({
  mediaCodecs: [
    { kind: 'audio', mimeType: 'audio/opus', clockRate: 48000, channels: 2 },
    { kind: 'video', mimeType: 'video/VP8', clockRate: 90000 },
    { kind: 'video', mimeType: 'video/H264', clockRate: 90000,
      parameters: { 'packetization-mode': 1, 'profile-level-id': '42e01f' } },
  ],
});

// 3. Create a WebRtcTransport for a client
const transport = await router.createWebRtcTransport({
  listenIps: [{ ip: '0.0.0.0', announcedIp: '203.0.113.1' }],
  enableUdp: true,
  enableTcp: true,
  preferUdp: true,
});

// 4. Client connects their transport (after exchanging params via signaling)
await transport.connect({ dtlsParameters: clientDtlsParameters });

// 5. Client produces media (sends audio/video)
const producer = await transport.produce({
  kind: 'video',
  rtpParameters: clientRtpParameters,
});

// 6. Another client consumes the producer's media
const consumer = await receiverTransport.consume({
  producerId: producer.id,
  rtpCapabilities: receiverRtpCapabilities,
});
```

### Scaling with Multiple Workers

Since each Worker is a single-threaded C++ process bound to one core, scaling on a multi-core machine means creating multiple Workers:

```typescript
const workers: mediasoup.types.Worker[] = [];
const numWorkers = os.cpus().length;

for (let i = 0; i < numWorkers; i++) {
  const worker = await mediasoup.createWorker();
  workers.push(worker);
}

// Round-robin or load-based assignment of Routers to Workers
let nextWorkerIndex = 0;
function getNextWorker() {
  const worker = workers[nextWorkerIndex];
  nextWorkerIndex = (nextWorkerIndex + 1) % workers.length;
  return worker;
}
```

For scaling across machines, use PipeTransports to connect Routers on different servers:

```typescript
// On Server A
const { pipeTransport: localPipe } = await routerA.createPipeTransport({
  listenIp: { ip: '0.0.0.0', announcedIp: '203.0.113.1' },
});

// Exchange pipe transport parameters between servers via your signaling

// On Server A: connect to Server B's pipe
await localPipe.connect({
  ip: serverBIp,
  port: serverBPipePort,
});

// Pipe a producer from Router A to Router B
await routerA.pipeToRouter({
  producerId: producer.id,
  router: routerB, // or remote router reference
});
```

### Simulcast and SVC Support

mediasoup has first-class support for simulcast and SVC:

- **Simulcast**: The producer sends multiple spatial/temporal layers. Consumers can be set to receive specific layers. The server handles layer switching based on bandwidth estimation or explicit API calls.
- **SVC (VP9 SVC, AV1 SVC)**: Scalable Video Coding where a single stream contains multiple quality layers. mediasoup can selectively forward specific spatial and temporal layers.

```typescript
// Set preferred layers for a consumer
await consumer.setPreferredLayers({
  spatialLayer: 2,   // highest quality
  temporalLayer: 2,
});

// The server automatically adjusts based on bandwidth
consumer.on('layerschange', (layers) => {
  console.log('Current layers:', layers);
});
```

### Pros and Cons

**Pros**:
- Extreme flexibility and control
- Clean, well-documented TypeScript API
- Efficient C++ media engine
- Multi-worker scaling on single machine
- PipeTransport for multi-machine scaling
- Active community and development
- No signaling opinions (build your own)

**Cons**:
- No out-of-the-box solution (you build everything)
- Requires strong understanding of WebRTC internals
- Signaling server is your responsibility
- No built-in recording (use FFmpeg via PlainTransport)
- No built-in client SDKs (just the server library)
- Steeper learning curve for teams new to WebRTC

---

## 5. LiveKit

### Overview

LiveKit is an open-source, real-time communication platform built in Go. It provides a complete stack: media server (SFU), signaling, client SDKs for every major platform, recording/streaming (egress), external media ingestion (ingress), and an AI agent framework. It has rapidly gained traction since its 2021 launch due to its developer experience and comprehensive feature set.

### Architecture

LiveKit's architecture centers on the concept of **Rooms**:

```
+--------------------------------------------------+
|                  LiveKit Server                   |
|                                                   |
|  +-----------+  +----------+  +-----------+       |
|  |   Room    |  |   Room   |  |   Room    |       |
|  | Manager   |  | Manager  |  | Manager   |       |
|  +-----------+  +----------+  +-----------+       |
|                                                   |
|  +----------+  +----------+  +-----------+        |
|  |   SFU    |  | Signaling|  |  Routing   |       |
|  |  Engine  |  |  (Protobuf|  |  Layer    |       |
|  |  (Pion)  |  |  over WS) |  |          |       |
|  +----------+  +----------+  +-----------+        |
|                                                   |
|  +----------+  +----------+  +-----------+        |
|  |  Egress  |  |  Ingress |  |  Agent    |        |
|  | Service  |  |  Service |  | Framework |        |
|  +----------+  +----------+  +-----------+        |
+--------------------------------------------------+
```

The SFU engine is built on **Pion** (Go WebRTC library). Signaling uses Protocol Buffers over WebSocket for efficient, typed communication.

### Room-Based Model

LiveKit abstracts WebRTC complexity behind a room model:

- **Room**: A communication space. Participants join rooms.
- **Participant**: A user in a room. Can publish and subscribe to tracks.
- **Track**: An audio or video stream. Published by a participant, subscribed to by others.
- **Track Publication**: Metadata about a published track (name, source, dimensions, simulcast).

The server handles all WebRTC negotiation, ICE, DTLS, and SRTP internally. Client SDKs expose a high-level API.

### SDKs

LiveKit provides official SDKs for virtually every platform:

| Platform | SDK | Language |
|----------|-----|----------|
| Web | livekit-client-sdk-js | TypeScript |
| React | @livekit/components-react | TypeScript/React |
| iOS | livekit-client-sdk-swift | Swift |
| Android | livekit-client-sdk-android | Kotlin |
| Flutter | livekit-client-sdk-flutter | Dart |
| Go | livekit-server-sdk-go | Go |
| Python | livekit-server-sdk-python | Python |
| Rust | livekit-client-sdk-rust | Rust |
| Unity | livekit-client-sdk-unity | C# |
| React Native | livekit-client-sdk-react-native | TypeScript |

All SDKs follow a consistent API pattern:

```typescript
// JavaScript example
import { Room, RoomEvent } from 'livekit-client';

const room = new Room();

room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
  if (track.kind === 'video') {
    const element = track.attach();
    document.getElementById('video-container').appendChild(element);
  }
});

await room.connect('wss://your-livekit-server.com', token);
await room.localParticipant.enableCameraAndMicrophone();
```

### Egress and Ingress

**Egress** (output from LiveKit):
- Room composite recording (all participants in a layout)
- Individual track recording
- Streaming to RTMP destinations (YouTube, Twitch)
- Web-based egress using headless Chrome for custom layouts
- Output formats: MP4, OGG, HLS, WebM, individual tracks

**Ingress** (input to LiveKit):
- Ingest RTMP streams into LiveKit rooms
- Ingest WHIP (WebRTC-HTTP Ingestion Protocol)
- Allows OBS, FFmpeg, or other streaming tools to publish into rooms

### Agent Framework for AI

One of LiveKit's most distinctive features is its **Agents framework**, designed for building AI-powered real-time applications:

```python
# Python Agent example
from livekit.agents import AutoSubscribe, JobContext, WorkerOptions, cli
from livekit.agents.voice_assistant import VoiceAssistant
from livekit.plugins import openai, silero

async def entrypoint(ctx: JobContext):
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    assistant = VoiceAssistant(
        vad=silero.VAD.load(),
        stt=openai.STT(),
        llm=openai.LLM(),
        tts=openai.TTS(),
    )

    assistant.start(ctx.room)
    await assistant.say("Hello! How can I help you?")

if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
```

The agent framework supports:
- Voice assistants (STT -> LLM -> TTS pipeline)
- Real-time video processing
- Plugin system for AI providers (OpenAI, Deepgram, ElevenLabs, etc.)
- Automatic job dispatching and scaling

### Cloud vs Self-Hosted

- **LiveKit Cloud**: Managed service with global edge network, automatic scaling, and SLA. Pay-per-minute pricing.
- **Self-hosted**: Full open-source server. Deploy on your own infrastructure. Requires managing scaling, TURN servers, and monitoring.

Both use the same codebase. The cloud version adds edge routing, analytics, and management UI.

### Why It Is Gaining Traction

1. **Complete platform**: Server + SDKs + recording + streaming + AI agents in one project
2. **Developer experience**: High-level SDKs abstract WebRTC complexity
3. **AI-first**: The agent framework is uniquely positioned for the AI voice/video boom
4. **Active development**: Rapid feature velocity, responsive team
5. **Go-based server**: High performance, easy deployment (single binary)
6. **Open source**: Apache 2.0 license

### Pros and Cons

**Pros**:
- Comprehensive platform (server, SDKs, egress, ingress, agents)
- Excellent developer experience
- Strong AI integration story
- Active community and commercial backing
- Built-in multi-node support with Redis
- Rich client SDKs for all platforms

**Cons**:
- Less low-level control compared to mediasoup
- Opinionated room model may not fit all use cases
- Self-hosted scaling requires Redis and careful configuration
- Newer project (less battle-tested than Janus)
- Some advanced features are cloud-only

---

## 6. Pion

### Overview

Pion is a **pure Go implementation of WebRTC**. It is not a media server itself but a library for building WebRTC applications, including media servers. It provides the building blocks: ICE, DTLS, SRTP, SCTP, RTP, RTCP, SDP, and the PeerConnection API.

### Pure Go Implementation

Unlike most WebRTC implementations that wrap Google's C++ libwebrtc, Pion is written entirely in Go. This means:

- No CGo dependencies (pure Go, easy cross-compilation)
- Go's concurrency model (goroutines, channels) for handling media
- Standard Go tooling (go build, go test, go modules)
- Easy to read, modify, and contribute to the source code
- Smaller binary sizes compared to libwebrtc wrappers

### Modular Design

Pion is split into independent, composable packages:

```
pion/webrtc     - Full PeerConnection API
pion/ice        - ICE agent (connectivity checks, STUN/TURN)
pion/dtls       - DTLS implementation (secure transport)
pion/srtp       - SRTP encryption/decryption
pion/rtp        - RTP packet parsing and construction
pion/rtcp       - RTCP packet handling
pion/sdp        - SDP parsing and generation
pion/sctp       - SCTP for data channels
pion/interceptor - RTP/RTCP interceptor pipeline
pion/turn       - TURN server implementation
```

You can use the full webrtc package for a complete PeerConnection, or pick individual packages if you only need specific functionality. For example, you could use just pion/rtp and pion/srtp to build a custom RTP forwarder without the full WebRTC stack.

### Building Custom SFUs with Pion

Pion makes it straightforward to build a custom SFU. The core pattern:

```go
// Simplified SFU concept
type Room struct {
    peers map[string]*Peer
    mu    sync.RWMutex
}

type Peer struct {
    pc     *webrtc.PeerConnection
    tracks []*webrtc.TrackLocalStaticRTP
}

// When a peer adds a track, forward it to all other peers
func (r *Room) OnTrack(sender *Peer, remoteTrack *webrtc.TrackRemote) {
    localTrack, _ := webrtc.NewTrackLocalStaticRTP(
        remoteTrack.Codec().RTPCodecCapability,
        remoteTrack.ID(),
        remoteTrack.StreamID(),
    )

    r.mu.RLock()
    for id, peer := range r.peers {
        if id != sender.ID {
            peer.pc.AddTrack(localTrack)
        }
    }
    r.mu.RUnlock()

    // Forward RTP packets
    buf := make([]byte, 1500)
    for {
        n, _, err := remoteTrack.Read(buf)
        if err != nil {
            return
        }
        localTrack.Write(buf[:n])
    }
}
```

### ion-SFU

**ion-SFU** (also known as Pion SFU or ion) was an open-source SFU built on Pion. It provided:
- Room management
- Simulcast support
- Data channels
- Bandwidth estimation (TWCC, REMB)
- Recording via WebM Saver

ion-SFU served as both a production-ready SFU and a reference implementation for building SFUs with Pion. While the original ion project is no longer actively maintained, its concepts live on in LiveKit (which is built on Pion) and various community forks.

### Pion Ecosystem

Beyond the core library, the Pion ecosystem includes:
- **pion/turn**: A production-ready TURN server written in Go
- **pion/interceptor**: Middleware pipeline for RTP/RTCP processing
- **pion/mediadevices**: Access to local media devices (camera, microphone)
- **pion/webrtc examples**: Extensive example collection (SFU, broadcast, recording)

### Pros and Cons

**Pros**:
- Pure Go (no CGo, easy deployment, cross-compilation)
- Highly modular and composable
- Excellent for building custom solutions
- Strong community and documentation
- Foundation for LiveKit and other production systems
- Permissive MIT license

**Cons**:
- Library, not a server (you build everything yourself)
- Go-only (though you can build services that other languages call)
- Performance may not match hand-optimized C/C++ for extreme scale
- Requires deep WebRTC knowledge to use effectively
- Less turnkey than complete server solutions

---

## 7. Kurento / OpenVidu

### Kurento

Kurento is a WebRTC media server written in C++ that introduced the concept of **media pipelines** and **media elements** for composing media processing graphs.

**Architecture**:

```
+-------------------------------------------+
|          Kurento Media Server             |
|                                           |
|  +--------+    +--------+    +--------+   |
|  |WebRTC  |--->|Filter  |--->|WebRTC  |   |
|  |Endpoint|    |Element |    |Endpoint|   |
|  +--------+    +--------+    +--------+   |
|                                           |
|  Media Pipeline (composable graph)        |
+-------------------------------------------+
```

**Media Pipeline Model**: Kurento treats media processing as a directed graph of media elements. You create endpoints (WebRTC, RTP, HTTP), connect them through filters (face detection, image overlay, audio mixing), and the media flows through the pipeline.

**Filter Architecture**: Kurento's unique strength was its filter system:
- **GStreamer-based**: Built on GStreamer, enabling rich media processing
- **Computer vision**: OpenCV-based filters for face detection, AR overlays
- **Custom filters**: Developers could write custom GStreamer elements
- **Chroma key**: Green screen / background replacement
- **Plate detection**: License plate recognition
- **Crowd detection**: Motion analysis

**Key Features**:
- SFU and MCU modes
- Recording to various formats
- Media processing pipelines
- WebRTC to RTP/RTSP bridging
- Group communications
- Media playback

**Current Status**: Kurento's development has significantly slowed. The original team at Naevatec (formerly Kurento Technologies) shifted focus to OpenVidu. While still functional, Kurento is considered legacy, and new projects are generally advised to use more actively maintained alternatives.

### OpenVidu

OpenVidu is a higher-level platform built on top of Kurento (and more recently, LiveKit). It provides:

- **Simplified API**: REST API and client SDKs that abstract away WebRTC and Kurento complexity
- **Ready-made UI components**: Drop-in video conferencing widgets
- **Recording**: Built-in recording with composable layouts
- **Scalability**: OpenVidu Pro adds clustering and load balancing
- **Authentication**: Built-in token-based authentication

**OpenVidu Architecture**:

```
+---------------------------+
|    OpenVidu Server        |
|  (REST API + Signaling)   |
+---------------------------+
          |
+---------------------------+
|    Media Server            |
|  (Kurento or LiveKit)      |
+---------------------------+
```

**OpenVidu 3.x**: The latest major version has transitioned from Kurento to LiveKit as its underlying media server, recognizing LiveKit's superior performance and active development.

### Pros and Cons

**Kurento Pros**: Rich media processing, filter architecture, GStreamer integration
**Kurento Cons**: Slowing development, complex deployment, memory leaks reported, Java/C++ stack

**OpenVidu Pros**: Easy to get started, good documentation, commercial support available
**OpenVidu Cons**: Abstraction can limit flexibility, commercial features behind paywall, transitioning underlying technology

---

## 8. Jitsi

### Overview

Jitsi is the most widely deployed open-source video conferencing platform. It includes a full stack for video meetings: a web client (Jitsi Meet), a WebRTC-compatible SFU (Jitsi Videobridge / JVB), a signaling server (Jicofo), a gateway to SIP and XMPP (Jigasi), and more.

### Architecture

```
+--------------------------------------------------+
|                  Jitsi Meet                       |
|              (React Web Client)                   |
+--------------------------------------------------+
          |                    |
+------------------+  +------------------+
|     Oserver     |  |     Oserver     |
|    (OHTTP)     |  |    (OHTTP)     |
+------------------+  +------------------+
          |                    |
+--------------------------------------------------+
|              Ojicofo (Focus)                      |
|        (Conference Management / XMPP)             |
+--------------------------------------------------+
          |                    |
+------------------+  +------------------+
|  Jitsi Video-   |  |  Jitsi Video-   |
|  bridge (JVB)   |  |  bridge (JVB)   |
|  (SFU in Java)  |  |  (SFU in Java)  |
+------------------+  +------------------+
```

### Jitsi Videobridge (JVB)

The JVB is the SFU at the heart of Jitsi. Written in Kotlin/Java, it:

- Receives WebRTC media from all participants
- Selectively forwards streams based on Last-N (only the N most recent active speakers get video forwarded)
- Handles simulcast layer selection
- Manages bandwidth estimation per receiver
- Supports data channels for bridge-to-client communication

**Last-N**: A key optimization. Instead of forwarding all video streams, JVB only forwards the N most recently active speakers' video to each participant. Audio is forwarded for all participants, but video is limited. When someone starts speaking, their video is promoted and someone else's is demoted. This dramatically reduces bandwidth.

### Ocula (Oascading JVBs)

For large-scale deployments and geographic distribution, Jitsi supports cascading multiple JVBs:

- **Ocula**: A system for connecting multiple JVBs across regions
- Participants connect to their nearest JVB
- JVBs relay media between each other
- Jicofo orchestrates which JVB handles which participants
- Enables conferences spanning multiple data centers

### Server-Side Processing

Jitsi includes server-side processing capabilities:

- **Oibri (Oitsi Orecording Oinfrastructure)**: Records conferences by joining as a headless Chrome participant
- **Oigasi**: SIP gateway for connecting telephony users to Jitsi meetings
- **Oranscription**: Real-time transcription using speech-to-text services
- **Oanguage translation**: Real-time translation of transcriptions

### Wide Adoption

Jitsi is used by:
- 8x8 (the company that maintains Jitsi, accessible at meet.jit.si)
- Oeutsche Oelekom
- Oelgian government
- French government (Etat's Webconf)
- Universities and schools worldwide
- Self-hosted by privacy-conscious organizations

### Pros and Cons

**Pros**:
- Complete video conferencing solution out of the box
- Very mature and battle-tested at scale
- Strong community and commercial backing (8x8)
- Easy to deploy for basic use cases
- Good documentation
- Active development

**Cons**:
- Java/Kotlin stack (higher resource usage than C/C++/Go alternatives)
- XMPP-based signaling adds complexity
- Customization beyond the standard UI requires significant effort
- Not designed as a general-purpose media server (focused on video conferencing)
- Complex multi-component architecture

---

## 9. Streaming Media Servers

While WebRTC media servers focus on real-time bidirectional communication, streaming media servers focus on one-to-many broadcast with potentially higher latency tolerance.

### Nginx-RTMP

An Nginx module that adds RTMP (Real-Time Messaging Protocol) server capabilities.

**Features**:
- Receive RTMP streams from OBS, FFmpeg, or other encoders
- Transmux to HLS and DASH for browser playback
- Live stream recording to FLV files
- Push/pull relay between servers
- Exec directives for calling external programs (FFmpeg for transcoding)

**Configuration example**:
```nginx
rtmp {
    server {
        listen 1935;

        application live {
            live on;
            record off;

            # Transmux to HLS
            hls on;
            hls_path /tmp/hls;
            hls_fragment 3;

            # Push to another server
            push rtmp://backup-server/live;
        }
    }
}
```

**Status**: The original module is unmaintained. The actively maintained fork is `nginx-rtmp-module` by `arut` (also known as `nginx-rtmp`). Another fork, `nginx-http-flv-module`, adds HTTP-FLV support.

### SRS (Simple Realtime Server)

A comprehensive open-source streaming server written in C++.

**Features**:
- RTMP, HLS, HTTP-FLV, WebRTC, SRT, MPEG-DASH
- Cluster support (origin/edge architecture)
- DVR (recording to file)
- Transcoding via FFmpeg
- HTTP API and callbacks
- WebRTC-to-RTMP bridging
- Low-latency HLS (LL-HLS)
- Docker-ready deployment

**Why SRS stands out**: It bridges the gap between traditional streaming and WebRTC. You can ingest an RTMP stream and serve it via WebRTC with sub-second latency, or accept a WebRTC publish and distribute it as HLS.

### Red5

An open-source streaming server written in Java.

- Supports RTMP, RTSP, HLS, WebSocket
- Plugin architecture for extensions
- Red5 Pro adds WebRTC support and clustering
- Used in education, live events, and IoT

### Wowza

A commercial streaming platform (with a free developer edition).

- RTMP, RTSP, WebRTC, SRT, HLS, DASH
- Transcoding and adaptive bitrate
- REST API for management
- Wowza Streaming Cloud for managed deployment
- Strong enterprise adoption

### Ant Media Server

An open-source streaming platform with WebRTC support.

- Ultra-low-latency WebRTC streaming
- Adaptive bitrate with simulcast
- RTMP ingest, WebRTC playback
- Clustering and auto-scaling
- Built-in recording
- REST API

### Differences from WebRTC Media Servers

| Aspect | Streaming Servers | WebRTC Media Servers |
|--------|------------------|---------------------|
| Primary direction | One-to-many | Many-to-many |
| Latency | 1-30 seconds (HLS/DASH) | Sub-second |
| Protocols | RTMP, HLS, DASH, SRT | WebRTC (RTP/SRTP) |
| Interactivity | Limited (chat via separate channel) | Full (audio/video both ways) |
| Scale | Millions of viewers (CDN) | Hundreds to thousands |
| Use case | Broadcasting, VOD | Conferencing, collaboration |
| Encryption | TLS | DTLS-SRTP (mandatory) |

Modern platforms increasingly blur these lines. SRS, LiveKit, and Ant Media support both WebRTC and traditional streaming protocols.

---

## 10. Media Server Comparison Table

| Feature | Janus | mediasoup | LiveKit | Pion | Kurento | Jitsi JVB | SRS |
|---------|-------|-----------|---------|------|---------|-----------|-----|
| **Language** | C | C++ (Node.js API) | Go | Go | C++ (Java API) | Kotlin/Java | C++ |
| **Type** | Gateway | SFU Library | SFU Platform | Library | Media Server | SFU | Streaming Server |
| **Architecture** | Plugin-based | Worker/Router | Room-based | Modular lib | Pipeline | Conference SFU | Origin/Edge |
| **SFU** | Yes (VideoRoom) | Yes | Yes | Build your own | Yes | Yes | Partial |
| **MCU** | Yes (AudioBridge) | No | No | Build your own | Yes | No | No |
| **Simulcast** | Yes | Yes | Yes | Yes | Limited | Yes | Limited |
| **SVC** | Limited | Yes (VP9, AV1) | Yes | Yes | No | Yes | No |
| **Recording** | .mjr format | Via FFmpeg | Built-in | Build your own | Built-in | Via Jibri | DVR |
| **SIP Bridge** | Yes (plugin) | Via PlainRTP | Via SIP trunk | Build your own | Via RTP | Via Jigasi | No |
| **RTMP** | No | Via FFmpeg | Egress/Ingress | No | No | No | Yes (native) |
| **Client SDKs** | JS only | None (server lib) | All platforms | Go only | JS, Java, .NET | JS (Jitsi Meet) | JS |
| **Data Channels** | Yes | Yes | Yes | Yes | Yes | Yes | No |
| **Scalability** | Manual | PipeTransport | Redis cluster | Manual | Limited | Ocula cascade | Origin/Edge |
| **License** | GPL-3.0 | ISC | Apache-2.0 | MIT | Apache-2.0 | Apache-2.0 | MIT |
| **Learning Curve** | Medium | High | Low-Medium | High | Medium | Low (deploy) | Low-Medium |
| **Community** | Large | Large | Growing fast | Large | Declining | Very large | Large |
| **Commercial** | Meetecho | None | LiveKit Inc | None | None | 8x8 | Ossrs.io |
| **Best For** | SIP bridging, plugins | Custom apps | Full platform | Custom solutions | Media processing | Video conferencing | Live streaming |

---

## 11. Choosing the Right Server

### Decision Matrix by Use Case

**Video Conferencing (small meetings, 2-50 participants)**:
- **Best choice**: LiveKit or Jitsi
- LiveKit if you want a platform with SDKs and customization
- Jitsi if you want a ready-made video conferencing solution
- mediasoup if you want full control over the experience

**Large-Scale Video Conferencing (hundreds of participants)**:
- **Best choice**: LiveKit (multi-node) or Jitsi (cascaded JVBs)
- Both support horizontal scaling
- LiveKit's Redis-based coordination is simpler to manage
- Jitsi's Ocula is battle-tested at scale

**Live Streaming / Broadcasting**:
- **Best choice**: SRS or LiveKit
- SRS for traditional RTMP/HLS broadcasting to millions
- LiveKit for WebRTC-based low-latency streaming
- Consider hybrid: WebRTC for ultra-low-latency, HLS/DASH for mass distribution

**Recording and Archiving**:
- **Best choice**: LiveKit (built-in egress) or Jitsi (Jibri)
- mediasoup requires custom recording via PlainTransport + FFmpeg
- Janus records to .mjr format requiring post-processing

**SIP / Telephony Integration**:
- **Best choice**: Janus (SIP plugin) or Oreeswitch + WebRTC
- Janus has mature SIP bridging
- mediasoup can bridge via PlainTransport
- Jitsi has Jigasi for SIP gateway

**AI-Powered Real-Time Applications**:
- **Best choice**: LiveKit (Agent Framework)
- Built-in support for voice assistants, real-time AI processing
- Python and Node.js agent SDKs
- Plugin ecosystem for STT, LLM, TTS providers

**Custom / Embedded Real-Time Features**:
- **Best choice**: mediasoup or Pion
- mediasoup for Node.js/TypeScript applications
- Pion for Go applications
- Both give maximum flexibility and control

**IoT / Low-Power Devices**:
- **Best choice**: Janus (low resource usage) or MCU architecture
- Janus's C-based core is very lightweight
- MCU mode reduces client-side processing
- Consider mediasoup with aggressive simulcast layer management

**Media Processing / Computer Vision**:
- **Best choice**: Kurento (if processing needs are primary)
- GStreamer-based pipeline for complex media processing
- However, consider running processing outside the media server (e.g., receive via mediasoup/LiveKit, process with dedicated service)

### Key Decision Factors

1. **Team expertise**: Go developers lean toward LiveKit/Pion, Node.js toward mediasoup, C toward Janus
2. **Time to market**: LiveKit (fastest), Jitsi (fast for conferencing), mediasoup (slower, more custom)
3. **Scale requirements**: All can scale, but the effort differs significantly
4. **Budget**: All are open-source, but operational costs vary (MCU >> SFU)
5. **Licensing**: GPL (Janus) vs Apache/MIT/ISC (others) matters for some organizations
6. **Long-term maintenance**: Consider community activity and commercial backing

---

## 12. Deployment Patterns

### Single Server Deployment

The simplest deployment for development or small-scale production:

```
                    Internet
                       |
              +--------+--------+
              |   Load Balancer  |
              |   (nginx/HAProxy)|
              +--------+--------+
                       |
              +--------+--------+
              |  Media Server    |
              | (Janus/mediasoup |
              |  /LiveKit)       |
              +-----------------+
```

**Considerations**:
- Single point of failure
- Limited by single machine resources
- UDP port range must be exposed (e.g., 10000-59999)
- TURN server should be separate for NAT traversal

### Kubernetes Deployment

For scalable, resilient deployments:

```yaml
# LiveKit Kubernetes deployment example
apiVersion: apps/v1
kind: Deployment
metadata:
  name: livekit-server
spec:
  replicas: 3
  selector:
    matchLabels:
      app: livekit
  template:
    metadata:
      labels:
        app: livekit
    spec:
      containers:
      - name: livekit
        image: livekit/livekit-server:latest
        ports:
        - containerPort: 7880  # HTTP/WS
          protocol: TCP
        - containerPort: 7881  # RTC (TCP)
          protocol: TCP
        - containerPort: 7882  # RTC (UDP)
          protocol: UDP
        env:
        - name: LIVEKIT_KEYS
          valueFrom:
            secretKeyRef:
              name: livekit-secrets
              key: keys
        - name: LIVEKIT_REDIS_ADDRESS
          value: "redis:6379"
        resources:
          requests:
            cpu: "2"
            memory: "4Gi"
          limits:
            cpu: "4"
            memory: "8Gi"
      hostNetwork: true  # Required for UDP media
```

**Kubernetes challenges for media servers**:
- **UDP**: Kubernetes services default to TCP. Media requires UDP. Use `hostNetwork: true` or `hostPort` mappings.
- **Port ranges**: SFUs need large UDP port ranges. NodePort services only support 30000-32767 by default.
- **Sticky sessions**: WebSocket signaling and media must reach the same pod. Use session affinity.
- **Resource limits**: CPU limits can cause packet drops under load. Use requests without hard limits for media pods.
- **Network policies**: Media servers need direct client connectivity. CNI plugins that encapsulate traffic add latency.

### Auto-Scaling

Media server auto-scaling is different from web server auto-scaling:

**Challenges**:
- Cannot simply terminate a pod with active media sessions
- Sessions are stateful (WebRTC connections, ongoing conferences)
- Scaling down requires session migration or graceful drain

**Strategies**:
- **Graceful drain**: Mark a pod as "draining," stop accepting new sessions, wait for existing sessions to end, then terminate
- **Proactive scaling**: Scale up before demand spikes (predictive based on time-of-day patterns)
- **Room-aware scheduling**: Place new rooms on least-loaded nodes, avoid splitting rooms across nodes when possible
- **Custom metrics**: Scale based on participant count, CPU usage, bandwidth, or concurrent rooms rather than generic metrics

```yaml
# Custom HPA for media server
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: media-server-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: livekit-server
  minReplicas: 2
  maxReplicas: 20
  metrics:
  - type: Pods
    pods:
      metric:
        name: active_participants
      target:
        type: AverageValue
        averageValue: "100"
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 600  # Wait 10 min before scaling down
      policies:
      - type: Pods
        value: 1
        periodSeconds: 300  # Remove max 1 pod every 5 min
```

### Geographic Distribution

For global deployments:

```
        US-East              EU-West              APAC
    +------------+      +------------+      +------------+
    | LB + TURN  |      | LB + TURN  |      | LB + TURN  |
    +------------+      +------------+      +------------+
    | Media Srv  |<---->| Media Srv  |<---->| Media Srv  |
    | Cluster    |      | Cluster    |      | Cluster    |
    +------------+      +------------+      +------------+
          |                   |                   |
    +------------+      +------------+      +------------+
    |   Redis    |<---->|   Redis    |<---->|   Redis    |
    +------------+      +------------+      +------------+
```

**Key considerations**:
- **Client routing**: DNS-based (GeoDNS) or anycast to route clients to nearest region
- **Inter-region media relay**: Cascaded SFUs or media relay servers connect regions
- **Signaling coordination**: Redis or similar for cross-region room state
- **Latency budgets**: Inter-region relay adds 50-200ms; acceptable for conferencing, less so for music collaboration

### TURN Co-Location

TURN servers should be deployed close to media servers to minimize relay latency:

```
Same data center or availability zone:
+------------------+     +------------------+
| Media Server     |<--->| TURN Server      |
| (mediasoup/LK)   |     | (coturn/pion)    |
+------------------+     +------------------+
```

- Deploy TURN in every region where you have media servers
- Use the same public IP for TURN and media server when possible
- Monitor TURN allocation counts for capacity planning
- Consider TURNS (TURN over TLS on port 443) for restrictive networks

### Monitoring

Essential metrics for media server monitoring:

**Server-level**:
- CPU utilization (per core for media workers)
- Memory usage
- Network I/O (bandwidth in/out)
- UDP packet drops (kernel buffer overflows)
- Open file descriptors (each connection uses FDs)

**Media-level**:
- Active rooms/sessions
- Total participants
- Packet loss rate (inbound and outbound)
- Jitter measurements
- Round-trip time (RTT)
- Bitrate per stream
- Simulcast layer distribution
- NACK count (retransmission requests)
- PLI/FIR count (keyframe requests)

**Quality of Experience (QoE)**:
- MOS (Mean Opinion Score) estimation
- Video freeze events
- Audio glitch events
- Join time (time to first media)
- Reconnection rate

**Tools**:
- Prometheus + Grafana for metrics visualization
- Jaeger for distributed tracing
- Custom WebRTC stats collection (getStats API)
- LiveKit provides built-in analytics; Jitsi has Oibri stats

---

## 13. Building a Custom SFU

### When to Build Your Own

Building a custom SFU makes sense when:
- You need behavior not supported by existing servers
- You want minimal dependencies and full control
- Your use case is narrow and specialized
- You have deep WebRTC expertise on your team

It does NOT make sense when:
- An existing solution covers your needs
- Time to market is critical
- Your team lacks WebRTC protocol knowledge

### High-Level Architecture

```
+------------------------------------------------------+
|                    Custom SFU                         |
|                                                       |
|  +-------------+  +-------------+  +--------------+  |
|  |  Signaling  |  | Room/Session|  |   Media      |  |
|  |  Server     |  | Manager     |  |   Engine     |  |
|  | (WebSocket) |  |             |  | (RTP/SRTP)   |  |
|  +-------------+  +-------------+  +--------------+  |
|                                                       |
|  +-------------+  +-------------+  +--------------+  |
|  | Bandwidth   |  | Simulcast   |  |   RTCP       |  |
|  | Estimator   |  | Controller  |  |   Handler    |  |
|  +-------------+  +-------------+  +--------------+  |
|                                                       |
|  +-------------+  +-------------+  +--------------+  |
|  |  Jitter     |  |  NACK       |  |   Keyframe   |  |
|  |  Buffer     |  |  Handler    |  |   Request    |  |
|  +-------------+  +-------------+  +--------------+  |
+------------------------------------------------------+
```

### Key Components

**SRTP (Secure RTP)**: All WebRTC media is encrypted with SRTP. Your SFU must:
- Complete the DTLS handshake with each client
- Derive SRTP keys from the DTLS session
- Decrypt incoming SRTP packets
- Re-encrypt outgoing packets for each receiver (different keys per connection)
- Handle key renegotiation

**RTCP (RTP Control Protocol)**: RTCP provides feedback about media quality:
- **Sender Reports (SR)**: Sent by the sender, contain NTP timestamp and packet/byte counts
- **Receiver Reports (RR)**: Sent by receivers, contain loss fraction, cumulative loss, jitter, RTT
- **NACK**: Negative acknowledgment requesting retransmission of lost packets
- **PLI (Picture Loss Indication)**: Requests a keyframe when video corruption is detected
- **FIR (Full Intra Request)**: Requests a keyframe (used when a new consumer joins)
- **REMB (Receiver Estimated Maximum Bitrate)**: Receiver's bandwidth estimate
- **TWCC (Transport-Wide Congestion Control)**: Packet-level feedback for sender-side bandwidth estimation

Your SFU must handle all of these correctly. Incorrect RTCP handling leads to poor quality.

**Bandwidth Estimation**: The SFU must estimate available bandwidth for each receiver:
- **TWCC (preferred)**: Collect per-packet arrival times, compute one-way delay variation, use GCC (Google Congestion Control) algorithm
- **REMB (legacy)**: Use the receiver's reported estimate
- Adjust forwarded simulcast layers or request sender bitrate changes based on estimates

**Jitter Buffer**: While SFUs typically do not buffer media (they forward immediately), some buffering is needed for:
- NACK retransmissions (need to hold recent packets)
- Reordering (out-of-order packets)
- Smooth forwarding during network jitter
- Typically a short ring buffer of recent RTP packets (500ms-2s)

**Simulcast Layer Selection**: When the sender provides multiple quality layers:
- Track available layers (via RTP header extensions or SSRC mapping)
- Select appropriate layer per consumer based on:
  - Consumer's available bandwidth
  - Consumer's display size
  - Priority settings (active speaker gets higher quality)
- Handle layer switching smoothly (request keyframe on switch-up)

### Key Considerations

1. **Threading model**: Media processing is CPU-intensive. Use one thread per core, avoid locks in the hot path, use lock-free queues for inter-thread communication.

2. **Memory allocation**: Avoid allocations in the media path. Pre-allocate buffers, use pool allocators, reuse packet buffers.

3. **UDP socket management**: Use multiple sockets to distribute kernel processing. Consider SO_REUSEPORT. Monitor kernel buffer sizes.

4. **ICE connectivity**: Implement ICE-lite (server-side) for simpler ICE processing. The server does not need to gather candidates; it provides its transport addresses directly.

5. **Codec awareness**: The SFU does not decode media but must understand codec framing to:
   - Identify keyframes (for layer switching and PLI handling)
   - Parse simulcast layer information
   - Handle codec-specific RTP packetization (VP8, VP9, H.264, AV1 each have different schemes)

6. **Data channels**: Implement SCTP over DTLS for WebRTC data channels. Used for signaling, file transfer, or custom application data.

---

## 14. Code Examples

### Basic mediasoup Server Setup (Node.js)

```typescript
import * as mediasoup from 'mediasoup';
import { Server } from 'socket.io';
import * as http from 'http';
import * as os from 'os';

// --- Configuration ---
const config = {
  listenIp: '0.0.0.0',
  announcedIp: process.env.ANNOUNCED_IP || '127.0.0.1',
  mediaCodecs: [
    {
      kind: 'audio' as mediasoup.types.MediaKind,
      mimeType: 'audio/opus',
      clockRate: 48000,
      channels: 2,
    },
    {
      kind: 'video' as mediasoup.types.MediaKind,
      mimeType: 'video/VP8',
      clockRate: 90000,
    },
  ] as mediasoup.types.RtpCodecCapability[],
};

// --- State ---
const workers: mediasoup.types.Worker[] = [];
const rooms = new Map<string, {
  router: mediasoup.types.Router;
  peers: Map<string, {
    transports: Map<string, mediasoup.types.WebRtcTransport>;
    producers: Map<string, mediasoup.types.Producer>;
    consumers: Map<string, mediasoup.types.Consumer>;
  }>;
}>();

let nextWorkerIdx = 0;

// --- Worker Pool ---
async function createWorkers(): Promise<void> {
  const numWorkers = os.cpus().length;
  for (let i = 0; i < numWorkers; i++) {
    const worker = await mediasoup.createWorker({
      rtcMinPort: 10000,
      rtcMaxPort: 59999,
    });

    worker.on('died', () => {
      console.error(`Worker ${worker.pid} died. Exiting.`);
      process.exit(1);
    });

    workers.push(worker);
  }
}

function getNextWorker(): mediasoup.types.Worker {
  const worker = workers[nextWorkerIdx];
  nextWorkerIdx = (nextWorkerIdx + 1) % workers.length;
  return worker;
}

// --- Room Management ---
async function getOrCreateRoom(
  roomId: string
): Promise<mediasoup.types.Router> {
  const existing = rooms.get(roomId);
  if (existing) {
    return existing.router;
  }

  const worker = getNextWorker();
  const router = await worker.createRouter({
    mediaCodecs: config.mediaCodecs,
  });

  rooms.set(roomId, { router, peers: new Map() });
  return router;
}

// --- Transport Factory ---
async function createWebRtcTransport(
  router: mediasoup.types.Router
): Promise<mediasoup.types.WebRtcTransport> {
  const transport = await router.createWebRtcTransport({
    listenIps: [{ ip: config.listenIp, announcedIp: config.announcedIp }],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    initialAvailableOutgoingBitrate: 1000000,
  });

  return transport;
}

// --- Signaling Server ---
async function main(): Promise<void> {
  await createWorkers();

  const httpServer = http.createServer();
  const io = new Server(httpServer, { cors: { origin: '*' } });

  io.on('connection', (socket) => {
    let currentRoomId: string | null = null;
    let currentPeerId: string | null = null;

    socket.on('joinRoom', async ({ roomId, peerId }, callback) => {
      try {
        const router = await getOrCreateRoom(roomId);
        const room = rooms.get(roomId);
        if (!room) {
          throw new Error('Room not found after creation');
        }

        room.peers.set(peerId, {
          transports: new Map(),
          producers: new Map(),
          consumers: new Map(),
        });

        currentRoomId = roomId;
        currentPeerId = peerId;

        callback({
          routerRtpCapabilities: router.rtpCapabilities,
        });
      } catch (error) {
        callback({ error: (error as Error).message });
      }
    });

    socket.on('createTransport', async ({ direction }, callback) => {
      try {
        if (!currentRoomId || !currentPeerId) {
          throw new Error('Not in a room');
        }

        const room = rooms.get(currentRoomId);
        if (!room) {
          throw new Error('Room not found');
        }

        const transport = await createWebRtcTransport(room.router);
        const peer = room.peers.get(currentPeerId);
        if (!peer) {
          throw new Error('Peer not found');
        }

        peer.transports.set(transport.id, transport);

        callback({
          id: transport.id,
          iceParameters: transport.iceParameters,
          iceCandidates: transport.iceCandidates,
          dtlsParameters: transport.dtlsParameters,
        });
      } catch (error) {
        callback({ error: (error as Error).message });
      }
    });

    socket.on('connectTransport', async (
      { transportId, dtlsParameters },
      callback
    ) => {
      try {
        if (!currentRoomId || !currentPeerId) {
          throw new Error('Not in a room');
        }

        const room = rooms.get(currentRoomId);
        const peer = room?.peers.get(currentPeerId);
        const transport = peer?.transports.get(transportId);

        if (!transport) {
          throw new Error('Transport not found');
        }

        await transport.connect({ dtlsParameters });
        callback({ connected: true });
      } catch (error) {
        callback({ error: (error as Error).message });
      }
    });

    socket.on('produce', async (
      { transportId, kind, rtpParameters },
      callback
    ) => {
      try {
        if (!currentRoomId || !currentPeerId) {
          throw new Error('Not in a room');
        }

        const room = rooms.get(currentRoomId);
        const peer = room?.peers.get(currentPeerId);
        const transport = peer?.transports.get(transportId);

        if (!transport || !peer) {
          throw new Error('Transport not found');
        }

        const producer = await transport.produce({ kind, rtpParameters });
        peer.producers.set(producer.id, producer);

        // Notify other peers about the new producer
        socket.to(currentRoomId).emit('newProducer', {
          producerId: producer.id,
          peerId: currentPeerId,
          kind: producer.kind,
        });

        callback({ producerId: producer.id });
      } catch (error) {
        callback({ error: (error as Error).message });
      }
    });

    socket.on('consume', async (
      { producerId, rtpCapabilities, transportId },
      callback
    ) => {
      try {
        if (!currentRoomId || !currentPeerId) {
          throw new Error('Not in a room');
        }

        const room = rooms.get(currentRoomId);
        const peer = room?.peers.get(currentPeerId);
        const transport = peer?.transports.get(transportId);

        if (!room || !peer || !transport) {
          throw new Error('Room, peer, or transport not found');
        }

        if (!room.router.canConsume({ producerId, rtpCapabilities })) {
          throw new Error('Cannot consume this producer');
        }

        const consumer = await transport.consume({
          producerId,
          rtpCapabilities,
          paused: true,
        });

        peer.consumers.set(consumer.id, consumer);

        callback({
          consumerId: consumer.id,
          producerId,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
        });
      } catch (error) {
        callback({ error: (error as Error).message });
      }
    });

    socket.on('disconnect', () => {
      if (currentRoomId && currentPeerId) {
        const room = rooms.get(currentRoomId);
        const peer = room?.peers.get(currentPeerId);

        if (peer) {
          for (const transport of peer.transports.values()) {
            transport.close();
          }
          room?.peers.delete(currentPeerId);
        }

        if (room && room.peers.size === 0) {
          room.router.close();
          rooms.delete(currentRoomId);
        }
      }
    });
  });

  httpServer.listen(3000, () => {
    console.log('mediasoup signaling server running on port 3000');
  });
}

main();
```

### Basic LiveKit Room (Node.js)

```typescript
import {
  AccessToken,
  RoomServiceClient,
  WebhookReceiver,
} from 'livekit-server-sdk';
import express from 'express';

const app = express();
app.use(express.json());

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || 'devkey';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'secret';
const LIVEKIT_URL = process.env.LIVEKIT_URL || 'ws://localhost:7880';

// --- Token Generation ---
function createToken(roomName: string, participantName: string): string {
  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: participantName,
    ttl: '1h',
  });

  token.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  return token.toJwt();
}

// --- API Endpoints ---
app.post('/api/token', (req, res) => {
  const { roomName, participantName } = req.body;

  if (!roomName || !participantName) {
    res.status(400).json({ error: 'roomName and participantName required' });
    return;
  }

  const token = createToken(roomName, participantName);

  res.json({
    token,
    url: LIVEKIT_URL,
  });
});

// --- Room Management ---
const roomService = new RoomServiceClient(
  LIVEKIT_URL,
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET
);

app.get('/api/rooms', async (_req, res) => {
  try {
    const rooms = await roomService.listRooms();
    res.json({
      rooms: rooms.map((room) => ({
        name: room.name,
        numParticipants: room.numParticipants,
        creationTime: room.creationTime,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.get('/api/rooms/:roomName/participants', async (req, res) => {
  try {
    const participants = await roomService.listParticipants(
      req.params.roomName
    );
    res.json({
      participants: participants.map((p) => ({
        identity: p.identity,
        state: p.state,
        joinedAt: p.joinedAt,
        tracks: p.tracks.map((t) => ({
          sid: t.sid,
          type: t.type,
          muted: t.muted,
        })),
      })),
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// --- Webhooks ---
const webhookReceiver = new WebhookReceiver(
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET
);

app.post('/api/webhook', async (req, res) => {
  try {
    const event = await webhookReceiver.receive(
      req.body,
      req.get('Authorization') || ''
    );

    switch (event.event) {
      case 'room_started':
        console.log(`Room started: ${event.room?.name}`);
        break;
      case 'room_finished':
        console.log(`Room finished: ${event.room?.name}`);
        break;
      case 'participant_joined':
        console.log(
          `${event.participant?.identity} joined ${event.room?.name}`
        );
        break;
      case 'participant_left':
        console.log(
          `${event.participant?.identity} left ${event.room?.name}`
        );
        break;
      case 'track_published':
        console.log(
          `Track published by ${event.participant?.identity}: ${event.track?.type}`
        );
        break;
      default:
        console.log(`Unhandled event: ${event.event}`);
    }

    res.status(200).send('OK');
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// --- Start Server ---
app.listen(8080, () => {
  console.log('LiveKit application server running on port 8080');
});
```

### Basic Pion SFU (Go)

```go
package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
	"github.com/pion/webrtc/v3"
)

// --- Room and Peer Management ---

type Peer struct {
	ID             string
	PC             *webrtc.PeerConnection
	LocalTracks    []*webrtc.TrackLocalStaticRTP
	mu             sync.Mutex
}

type Room struct {
	ID    string
	Peers map[string]*Peer
	mu    sync.RWMutex
}

var (
	rooms   = make(map[string]*Room)
	roomsMu sync.RWMutex
)

func getOrCreateRoom(roomID string) *Room {
	roomsMu.Lock()
	defer roomsMu.Unlock()

	if room, ok := rooms[roomID]; ok {
		return room
	}

	room := &Room{
		ID:    roomID,
		Peers: make(map[string]*Peer),
	}
	rooms[roomID] = room
	return room
}

// --- Signaling Messages ---

type SignalMessage struct {
	Type      string                     `json:"type"`
	RoomID    string                     `json:"roomId,omitempty"`
	PeerID    string                     `json:"peerId,omitempty"`
	SDP       *webrtc.SessionDescription `json:"sdp,omitempty"`
	Candidate *webrtc.ICECandidateInit   `json:"candidate,omitempty"`
}

// --- WebRTC Configuration ---

var webrtcConfig = webrtc.Configuration{
	ICEServers: []webrtc.ICEServer{
		{URLs: []string{"stun:stun.l.google.com:19302"}},
	},
}

// --- Track Forwarding ---

func forwardTrackToRoom(
	room *Room,
	senderID string,
	remoteTrack *webrtc.TrackRemote,
	receiver *webrtc.RTPReceiver,
) {
	localTrack, err := webrtc.NewTrackLocalStaticRTP(
		remoteTrack.Codec().RTPCodecCapability,
		remoteTrack.ID(),
		remoteTrack.StreamID(),
	)
	if err != nil {
		log.Printf("Failed to create local track: %v", err)
		return
	}

	// Add the local track to all other peers
	room.mu.RLock()
	for id, peer := range room.Peers {
		if id == senderID {
			continue
		}

		peer.mu.Lock()
		rtpSender, err := peer.PC.AddTrack(localTrack)
		if err != nil {
			log.Printf("Failed to add track to peer %s: %v", id, err)
			peer.mu.Unlock()
			continue
		}
		peer.mu.Unlock()

		// Read and discard RTCP from receiver
		go func() {
			rtcpBuf := make([]byte, 1500)
			for {
				if _, _, err := rtpSender.Read(rtcpBuf); err != nil {
					return
				}
			}
		}()
	}
	room.mu.RUnlock()

	// Forward RTP packets from remote to local track
	buf := make([]byte, 1500)
	for {
		n, _, readErr := remoteTrack.Read(buf)
		if readErr != nil {
			log.Printf("Track read error: %v", readErr)
			return
		}

		if _, writeErr := localTrack.Write(buf[:n]); writeErr != nil {
			log.Printf("Track write error: %v", writeErr)
			return
		}
	}
}

// --- WebSocket Handler ---

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed: %v", err)
		return
	}
	defer conn.Close()

	var currentRoom *Room
	var currentPeerID string

	for {
		_, raw, err := conn.ReadMessage()
		if err != nil {
			log.Printf("WebSocket read error: %v", err)
			break
		}

		var msg SignalMessage
		if err := json.Unmarshal(raw, &msg); err != nil {
			log.Printf("JSON parse error: %v", err)
			continue
		}

		switch msg.Type {
		case "join":
			currentRoom = getOrCreateRoom(msg.RoomID)
			currentPeerID = msg.PeerID

			pc, err := webrtc.NewPeerConnection(webrtcConfig)
			if err != nil {
				log.Printf("Failed to create PeerConnection: %v", err)
				continue
			}

			peer := &Peer{ID: currentPeerID, PC: pc}

			currentRoom.mu.Lock()
			currentRoom.Peers[currentPeerID] = peer
			currentRoom.mu.Unlock()

			// Handle incoming tracks
			pc.OnTrack(func(
				remoteTrack *webrtc.TrackRemote,
				receiver *webrtc.RTPReceiver,
			) {
				log.Printf(
					"Track received from %s: %s",
					currentPeerID,
					remoteTrack.Codec().MimeType,
				)
				go forwardTrackToRoom(
					currentRoom,
					currentPeerID,
					remoteTrack,
					receiver,
				)
			})

			// Forward ICE candidates to the client
			pc.OnICECandidate(func(c *webrtc.ICECandidate) {
				if c == nil {
					return
				}
				candidateInit := c.ToJSON()
				response := SignalMessage{
					Type:      "candidate",
					Candidate: &candidateInit,
				}
				respJSON, _ := json.Marshal(response)
				conn.WriteMessage(websocket.TextMessage, respJSON)
			})

			pc.OnConnectionStateChange(func(
				state webrtc.PeerConnectionState,
			) {
				log.Printf(
					"Peer %s connection state: %s",
					currentPeerID,
					state.String(),
				)
				if state == webrtc.PeerConnectionStateFailed ||
					state == webrtc.PeerConnectionStateClosed {
					currentRoom.mu.Lock()
					delete(currentRoom.Peers, currentPeerID)
					currentRoom.mu.Unlock()
				}
			})

			// Add transceivers for receiving audio and video
			pc.AddTransceiverFromKind(
				webrtc.RTPCodecTypeAudio,
				webrtc.RTPTransceiverInit{
					Direction: webrtc.RTPTransceiverDirectionRecvonly,
				},
			)
			pc.AddTransceiverFromKind(
				webrtc.RTPCodecTypeVideo,
				webrtc.RTPTransceiverInit{
					Direction: webrtc.RTPTransceiverDirectionRecvonly,
				},
			)

			response := SignalMessage{Type: "joined"}
			respJSON, _ := json.Marshal(response)
			conn.WriteMessage(websocket.TextMessage, respJSON)

		case "offer":
			if currentRoom == nil || currentPeerID == "" {
				continue
			}

			currentRoom.mu.RLock()
			peer, ok := currentRoom.Peers[currentPeerID]
			currentRoom.mu.RUnlock()
			if !ok {
				continue
			}

			if err := peer.PC.SetRemoteDescription(*msg.SDP); err != nil {
				log.Printf("SetRemoteDescription error: %v", err)
				continue
			}

			answer, err := peer.PC.CreateAnswer(nil)
			if err != nil {
				log.Printf("CreateAnswer error: %v", err)
				continue
			}

			if err := peer.PC.SetLocalDescription(answer); err != nil {
				log.Printf("SetLocalDescription error: %v", err)
				continue
			}

			response := SignalMessage{
				Type: "answer",
				SDP:  peer.PC.LocalDescription(),
			}
			respJSON, _ := json.Marshal(response)
			conn.WriteMessage(websocket.TextMessage, respJSON)

		case "candidate":
			if currentRoom == nil || currentPeerID == "" {
				continue
			}

			currentRoom.mu.RLock()
			peer, ok := currentRoom.Peers[currentPeerID]
			currentRoom.mu.RUnlock()
			if !ok || msg.Candidate == nil {
				continue
			}

			if err := peer.PC.AddICECandidate(*msg.Candidate); err != nil {
				log.Printf("AddICECandidate error: %v", err)
			}
		}
	}

	// Cleanup on disconnect
	if currentRoom != nil && currentPeerID != "" {
		currentRoom.mu.Lock()
		if peer, ok := currentRoom.Peers[currentPeerID]; ok {
			peer.PC.Close()
			delete(currentRoom.Peers, currentPeerID)
		}
		currentRoom.mu.Unlock()
	}
}

func main() {
	http.HandleFunc("/ws", handleWebSocket)

	fmt.Println("Pion SFU running on :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
```

---

## 15. Common Interview Questions

### Conceptual Questions

**Q1: What is the difference between an SFU and an MCU? When would you choose one over the other?**

An SFU (Selective Forwarding Unit) receives media from each participant and forwards it to others without decoding or re-encoding. Each receiver gets individual streams and decodes them independently. An MCU (Multipoint Control Unit) decodes all incoming streams, composites them into a single mixed stream, re-encodes, and sends one stream to each receiver.

Choose SFU when: you need low latency, want to preserve end-to-end encryption, need scalability, and clients are capable of decoding multiple streams. This covers most modern video conferencing scenarios.

Choose MCU when: clients are very resource-constrained, bandwidth is severely limited (each client only downloads one stream), or you need server-side composition (e.g., for a specific recording layout).

In practice, most modern systems use SFU for video and sometimes MCU for audio mixing.

---

**Q2: How does simulcast work in an SFU, and why is it important?**

Simulcast means the sender encodes their video at multiple resolutions and bitrates simultaneously (e.g., 720p at 1.5 Mbps, 360p at 500 Kbps, 180p at 150 Kbps) and sends all layers to the SFU.

The SFU then selects which layer to forward to each receiver based on:
- The receiver's available bandwidth (from TWCC/REMB feedback)
- The receiver's display size (a thumbnail does not need 720p)
- Priority (active speaker gets the highest layer)

This is important because it enables adaptive quality without transcoding. The SFU makes a simple forwarding decision rather than an expensive transcode operation. It keeps latency low and CPU usage minimal on the server while adapting to heterogeneous network conditions across receivers.

---

**Q3: Explain the N*(N-1) problem in peer-to-peer WebRTC and how media servers solve it.**

In a full-mesh P2P topology, each participant establishes a direct connection to every other participant. For N participants, each peer sends N-1 upstream streams and receives N-1 downstream streams. The total connection count is N*(N-1).

For 5 participants: 5*4 = 20 connections, each peer uploads 4 streams.
For 10 participants: 10*9 = 90 connections, each peer uploads 9 streams.

This is untenable because:
- Upload bandwidth scales linearly with participants
- CPU usage for encoding scales linearly (one encode per receiver)
- Battery drain on mobile devices
- Connection setup time increases

A media server (SFU) solves this by having each client send only one stream to the server. The server then forwards to N-1 receivers. Each client's upload is constant (one stream) regardless of participant count. Download still scales with N-1, but with simulcast, the server can send lower-quality streams to reduce bandwidth.

---

**Q4: How would you implement recording in a mediasoup-based application?**

mediasoup does not have built-in recording. The standard approach is:

1. Create a PlainTransport on the Router for each Producer you want to record.
2. The PlainTransport outputs plain RTP (not encrypted) to a local port.
3. Run FFmpeg or GStreamer to receive the RTP streams and mux them into a container format (WebM, MP4, MKV).
4. Use SDP files or FFmpeg's RTP input to configure the recording pipeline.

```typescript
// Create a PlainTransport for recording
const plainTransport = await router.createPlainTransport({
  listenIp: { ip: '127.0.0.1' },
  rtcpMux: false,
  comedia: true,
});

// Consume the producer on the plain transport
const consumer = await plainTransport.consume({
  producerId: videoProducer.id,
  rtpCapabilities: router.rtpCapabilities,
});

// FFmpeg receives RTP on the plain transport's port
// ffmpeg -protocol_whitelist rtp,udp -i recording.sdp -c copy output.webm
```

Alternatively, use a DirectTransport with a custom RTP receiver, or pipe to a recording service.

For composite recording (all participants in a layout), use a headless browser approach (similar to Jitsi's Jibri) or LiveKit's egress service.

---

**Q5: What is OTWCC (Transport-Wide Congestion Control) and why is it important for media servers?**

TWCC is a WebRTC mechanism for estimating available bandwidth. It works as follows:

1. The sender adds a transport-wide sequence number to every RTP packet via an RTP header extension.
2. The receiver tracks the arrival time of each packet.
3. Periodically, the receiver sends a TWCC feedback RTCP packet containing arrival timestamps for all received packets.
4. The sender (or the SFU acting as sender) uses these timestamps to compute one-way delay variation, which feeds into the GCC (Google Congestion Control) algorithm to estimate available bandwidth.

For media servers, TWCC is critical because:
- The SFU forwards packets to many receivers, each with different bandwidth
- TWCC provides per-receiver bandwidth estimates
- The SFU uses these estimates to select simulcast layers or request bitrate changes
- Without accurate bandwidth estimation, receivers experience packet loss, video freezes, and poor quality

TWCC replaced the older REMB mechanism and provides more accurate, sender-side bandwidth estimation.

---

**Q6: How would you design a globally distributed video conferencing system?**

1. **Multiple SFU regions**: Deploy SFU clusters in major regions (US-East, US-West, EU, APAC).
2. **Client routing**: Use GeoDNS or anycast to route each client to their nearest SFU.
3. **Cascaded SFUs**: When a room has participants in multiple regions, the regional SFUs connect to each other via dedicated relay links (PipeTransports in mediasoup, or native cascading in Jitsi/LiveKit).
4. **Signaling coordination**: A centralized or replicated signaling service (backed by Redis or similar) coordinates room state across regions.
5. **TURN co-location**: Deploy TURN servers in each region alongside SFUs.
6. **Quality adaptation**: Each regional SFU independently manages simulcast layer selection for its local participants.
7. **Failover**: If a regional SFU fails, clients reconnect to the next-nearest region. The signaling layer handles re-establishing room state.
8. **Monitoring**: Centralized monitoring of per-region quality metrics (loss, latency, MOS scores).

Key tradeoffs:
- Inter-region relay adds 50-200ms latency (acceptable for most conferencing)
- Room state must be consistent across regions
- Recording should happen in one region to avoid duplicate processing

---

**Q7: Compare Janus and mediasoup for building a video conferencing application.**

**Janus**:
- Complete gateway with built-in VideoRoom plugin for SFU conferencing
- Signaling and room management included (via REST/WebSocket API)
- SIP bridging, streaming, recording plugins available out of the box
- Written in C; lightweight and fast
- Plugin development requires C
- GPL-3.0 license
- Less flexible for custom behavior (plugin boundaries)

**mediasoup**:
- Pure SFU library; no opinions about rooms, signaling, or features
- You build the signaling server, room logic, and client integration
- TypeScript/Node.js API with C++ media engine
- Maximum flexibility and control
- ISC license (permissive)
- No built-in recording, SIP, or streaming
- Steeper learning curve; more code to write

**Choose Janus when**: you need SIP integration, want built-in plugins for common features, prefer a ready-made API, or need a lightweight C-based server.

**Choose mediasoup when**: you want full control over every aspect of the experience, are building a custom product (not a generic conferencing tool), prefer Node.js/TypeScript, or need permissive licensing.

---

**Q8: What happens at the network level when a WebRTC client connects to an SFU?**

1. **Signaling**: Client and server exchange SDP offers/answers via your signaling channel (WebSocket, HTTP). The SDP describes codecs, media types, ICE candidates, DTLS fingerprints, and RTP extensions.

2. **ICE connectivity checks**: The client gathers ICE candidates (host, server-reflexive via STUN, relay via TURN). The SFU typically uses ICE-lite (provides its candidates, lets the client drive connectivity checks). They exchange candidates and perform connectivity checks to find a working path.

3. **DTLS handshake**: Over the selected ICE candidate pair, a DTLS handshake establishes a secure channel. The DTLS session derives keying material for SRTP.

4. **SRTP session**: Using keys from DTLS, all RTP and RTCP packets are encrypted/decrypted with SRTP. The SFU decrypts incoming SRTP, makes forwarding decisions, and re-encrypts for each outbound connection (each with different SRTP keys).

5. **Media flow**: RTP packets carry audio/video. RTCP provides feedback (receiver reports, NACK for retransmission, TWCC for bandwidth estimation, PLI for keyframe requests).

6. **Data channels** (if used): SCTP over DTLS provides reliable/unreliable data transport for application data.

---

**Q9: How do you handle scalability challenges when a single media server instance is not enough?**

**Vertical scaling**:
- Use all CPU cores (mediasoup: multiple Workers; LiveKit/Pion: Go's goroutines)
- Increase UDP buffer sizes in the kernel
- Use faster network interfaces (10 Gbps+)

**Horizontal scaling**:
- **Room sharding**: Each room is assigned to one server. A routing layer directs clients to the correct server. Works well when rooms are independent.
- **Cascaded SFUs**: For rooms that span servers (large rooms or geographic distribution), connect SFUs via relay links. Each SFU handles a subset of participants.
- **Load balancing**: Use a load balancer or routing service that considers current load (participant count, CPU, bandwidth) when assigning new rooms.
- **Session migration**: When scaling down, gracefully drain sessions by stopping new room creation on a server and waiting for existing rooms to end.
- **Stateless signaling**: Keep signaling servers stateless (or backed by Redis) so they can scale independently from media servers.

**Infrastructure patterns**:
- Kubernetes with custom HPA based on media-specific metrics
- Redis for coordination between server instances
- Geographic DNS routing to nearest server cluster
- TURN server pool with health checking

---

**Q10: What is the role of OICE in WebRTC, and how does OICE-lite simplify things for media servers?**

ICE (Interactive Connectivity Establishment) is the protocol that discovers the best network path between two WebRTC endpoints. It handles NAT traversal by:
1. Gathering candidates (host addresses, STUN-derived addresses, TURN relays)
2. Exchanging candidates via signaling
3. Performing connectivity checks (STUN binding requests/responses)
4. Selecting the best candidate pair based on priority and reachability

Full ICE is designed for peer-to-peer scenarios where both sides may be behind NATs.

**ICE-lite** is a simplified ICE implementation for servers. Since the server has a public IP address:
- It does not gather candidates (it knows its own addresses)
- It does not initiate connectivity checks
- It only responds to connectivity checks from clients
- It advertises its IP/port as candidates in the SDP

This simplifies server implementation significantly: no STUN/TURN client needed, no candidate gathering, no connectivity check scheduling. The client drives the ICE process, and the server just responds.

Most media servers (mediasoup, LiveKit, Janus) use ICE-lite.

---

**Q11: How would you approach debugging poor video quality in an SFU-based system?**

Systematic debugging approach:

1. **Collect metrics**: Use WebRTC's getStats() API on the client and server-side RTCP stats.

2. **Check sender side**:
   - Is the sender's camera producing expected resolution/framerate?
   - Is the sender's encoder hitting its target bitrate?
   - Is the sender experiencing CPU overload (causing frame drops)?
   - What simulcast layers is the sender producing?

3. **Check network (sender to SFU)**:
   - Packet loss on the uplink (from Receiver Reports)
   - Jitter measurements
   - RTT between sender and SFU
   - NACK/retransmission counts

4. **Check SFU decisions**:
   - Which simulcast layer is being forwarded to the affected receiver?
   - Is bandwidth estimation accurate?
   - Is the SFU experiencing CPU or memory pressure?
   - Are RTCP feedback messages being processed correctly?

5. **Check network (SFU to receiver)**:
   - Packet loss on the downlink
   - Jitter and RTT
   - NACK/retransmission counts
   - Is the receiver behind a restrictive NAT (TURN relay being used)?

6. **Check receiver side**:
   - Is the decoder handling the codec correctly?
   - Is the rendering pipeline dropping frames?
   - Is the device overloaded?

Common root causes: insufficient sender bitrate, network congestion causing packet loss, SFU forwarding wrong simulcast layer, TURN relay adding latency, receiver CPU overload.

---

**Q12: Explain the difference between LiveKit and mediasoup in terms of architecture and developer experience.**

**Architecture**:
- LiveKit is a complete platform: server binary + SDKs + egress + ingress + agents. Written in Go, single binary deployment. Uses Redis for multi-node coordination.
- mediasoup is a library: C++ media engine controlled by Node.js API. You provide signaling, room logic, client code, recording, and everything else.

**Developer experience**:
- LiveKit: Generate a token, connect with an SDK, publish/subscribe to tracks. High-level APIs abstract WebRTC details. Most developers never touch SDP, ICE, or RTP directly.
- mediasoup: Create workers, routers, transports, producers, consumers. Build your own signaling server. Handle WebRTC negotiation details. Requires understanding of RTP capabilities, DTLS parameters, and media routing.

**Analogy**: LiveKit is like using Express.js (framework with conventions). mediasoup is like using Node's http module (building blocks, full control).

**Choose LiveKit**: when you want to ship quickly, need cross-platform SDKs, want built-in recording/streaming, or are building AI-powered voice/video apps.

**Choose mediasoup**: when you need to customize every aspect of the media pipeline, have unique requirements that don't fit LiveKit's room model, or prefer a library over a platform.

---

**Q13: How does a media server handle participants joining mid-conference? What about keyframes?**

When a new participant joins and subscribes to existing video streams:

1. **Consumer creation**: The SFU creates a new Consumer for each existing Producer the new participant wants to receive.

2. **Keyframe request**: Video codecs use inter-frame compression. Most frames (P-frames, B-frames) only contain differences from previous frames. A new consumer cannot decode these without a starting point. The SFU sends a PLI (Picture Loss Indication) or FIR (Full Intra Request) RTCP message to the sender, requesting a keyframe (I-frame).

3. **Sender generates keyframe**: Upon receiving PLI/FIR, the sender's encoder produces a keyframe. This is a complete frame that can be decoded independently.

4. **SFU forwards keyframe**: The SFU forwards the keyframe (and subsequent frames) to the new consumer.

5. **Display begins**: The new participant's decoder processes the keyframe and can then decode subsequent inter-frames.

**Latency impact**: There is a brief delay (typically 100-500ms) between subscribing and seeing video, as the SFU must wait for the next keyframe. Frequent keyframe requests waste bandwidth (keyframes are much larger than inter-frames), so SFUs typically batch or rate-limit PLI requests.

**Simulcast consideration**: When switching simulcast layers, the SFU also needs a keyframe from the target layer. Smart SFUs will switch layers at natural keyframe boundaries to minimize disruption.

---

**Q14: What are the security considerations for deploying a media server?**

1. **Encryption**: WebRTC mandates DTLS-SRTP. All media is encrypted in transit. The SFU terminates encryption (decrypts incoming, re-encrypts outgoing). This means the SFU has access to unencrypted media. For end-to-end encryption (E2EE), use insertable streams / SFrame to encrypt media payloads before sending to the SFU.

2. **Authentication**: Validate that clients are authorized to join rooms. Use signed tokens (JWT) with room permissions, participant identity, and expiration.

3. **Authorization**: Enforce publish/subscribe permissions. Not every participant should be able to publish, and some rooms may have viewer-only participants.

4. **Signaling security**: Use TLS (WSS) for signaling connections. Validate all signaling messages against expected schemas.

5. **DDoS protection**: Media servers are UDP-based and susceptible to UDP flood attacks. Use rate limiting, STUN message validation, and network-level DDoS mitigation.

6. **TURN security**: TURN servers can be abused as open proxies. Use authentication (shared secret or OAuth), IP allowlists, and allocation quotas.

7. **Server hardening**: Minimize exposed ports. Run the media server with least privileges. Keep dependencies updated. Monitor for anomalous behavior.

8. **Data retention**: If recording, ensure media is encrypted at rest, access is logged, and retention policies are enforced.

---

**Q15: You need to build a system that supports both real-time video conferencing (50 participants) and live streaming to 10,000 viewers. How would you architect this?**

This requires a hybrid architecture combining an SFU for the interactive participants and a streaming pipeline for the large audience:

```
Interactive Participants (50)
         |
    +---------+
    |   SFU   |  (LiveKit, mediasoup, or Janus)
    +---------+
         |
    Composite Egress
         |
    +---------+
    | Encoder |  (FFmpeg or LiveKit Egress)
    +---------+
         |
    RTMP / SRT
         |
    +---------+
    |   CDN   |  (CloudFront, Akamai, Cloudflare)
    +---------+
         |
    HLS / DASH / LL-HLS
         |
    Viewers (10,000)
```

**Design**:
1. **SFU layer**: 50 interactive participants connect to an SFU (e.g., LiveKit). They have full real-time audio/video/screen sharing capability.

2. **Egress/transcoding layer**: The SFU produces a composite output (all participants in a grid or speaker layout). This is rendered via a headless browser or server-side composition and encoded to H.264.

3. **Streaming distribution**: The encoded stream is pushed via RTMP or SRT to a CDN origin server. The CDN transcodes to multiple bitrates (adaptive bitrate) and distributes via HLS or DASH.

4. **Viewer experience**: The 10,000 viewers receive HLS/DASH with 3-10 second latency. For lower latency, use LL-HLS (Low-Latency HLS) or WebRTC-based distribution (Cloudflare Calls, Millicast).

5. **Interaction channel**: Viewers can interact via chat (WebSocket), reactions, or a "raise hand" mechanism that temporarily promotes them to the SFU as a full participant.

**Key considerations**:
- The CDN handles the scale; the SFU only handles 50 participants
- Latency for viewers is 3-10 seconds (HLS) or sub-second (WebRTC CDN)
- Recording can happen at the egress layer
- Adaptive bitrate streaming handles viewer bandwidth heterogeneity

---

### Quick-Fire Questions and Answers

**Q: What port does WebRTC media typically use?**
A: WebRTC uses dynamically allocated UDP ports (commonly in a range like 10000-59999). TURN fallback uses TCP 443 or UDP 3478. There is no single fixed port.

**Q: Can you have end-to-end encryption with an SFU?**
A: Yes, using insertable streams (Encoded Transform API) or SFrame. The SFU forwards encrypted payloads without decrypting them. It can still read RTP headers for routing but cannot access media content.

**Q: What is the difference between OREMB and OTWCC?**
A: REMB is receiver-side bandwidth estimation: the receiver computes an estimate and sends it to the sender. TWCC is sender-side: the receiver reports packet arrival times, and the sender computes the estimate. TWCC is more accurate and is the modern standard.

**Q: How many participants can a single SFU instance typically handle?**
A: It depends on hardware and configuration, but a single modern server (8-16 cores, 10 Gbps NIC) can typically handle 200-500 participants across multiple rooms with audio and video (simulcast).

**Q: What is a OData OChannel in WebRTC?**
A: A WebRTC Data Channel provides reliable or unreliable, ordered or unordered delivery of arbitrary data between peers. It uses SCTP over DTLS. Used for chat, file transfer, game state, signaling, or any application data.

**Q: Why do most production systems use SFU over MCU?**
A: SFU is more scalable (no transcoding CPU cost), lower latency (no encode/decode cycle), preserves flexibility (clients control their own layout), supports simulcast/SVC, and can support E2EE. MCU's advantage (single download stream) is less important given modern client capabilities.

**Q: What is OOce-lite?**
A: ICE-lite is a minimal ICE implementation for servers that have public IPs. The server does not gather candidates or initiate connectivity checks. It only responds to checks from clients. This simplifies server implementation significantly.

**Q: How does a media server decide which simulcast layer to forward?**
A: Based on: (1) receiver's estimated bandwidth (from TWCC/REMB), (2) receiver's requested resolution/quality, (3) whether the stream is displayed prominently or as a thumbnail, (4) active speaker status, (5) explicit API settings from the application.

---

## Summary

Media servers are the backbone of modern real-time communication at scale. The choice between Janus, mediasoup, LiveKit, Pion, Jitsi, or streaming servers like SRS depends on your use case, team expertise, and requirements for flexibility vs. time-to-market.

Key takeaways:
- **SFU** is the dominant architecture for video conferencing
- **mediasoup** gives maximum control for custom applications
- **LiveKit** provides the fastest path to a complete real-time platform
- **Janus** excels at protocol bridging and plugin extensibility
- **Pion** is the foundation for building custom Go-based media servers
- **Jitsi** is the go-to for deploying video conferencing quickly
- **SRS** bridges traditional streaming and WebRTC worlds

Understanding these systems deeply, from SRTP and RTCP to bandwidth estimation and cascaded SFU topologies, is essential for any engineer working in the real-time communication space.
