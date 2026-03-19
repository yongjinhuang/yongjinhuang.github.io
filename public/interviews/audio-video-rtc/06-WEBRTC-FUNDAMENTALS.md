# WebRTC Fundamentals

A comprehensive guide for software engineers covering the complete WebRTC stack,
from high-level architecture down to protocol-level details.

---

## Table of Contents

1. [What is WebRTC](#1-what-is-webrtc)
2. [WebRTC Architecture](#2-webrtc-architecture)
3. [Signaling](#3-signaling)
4. [SDP (Session Description Protocol)](#4-sdp-session-description-protocol)
5. [ICE (Interactive Connectivity Establishment)](#5-ice-interactive-connectivity-establishment)
6. [STUN](#6-stun)
7. [TURN](#7-turn)
8. [DTLS and SRTP](#8-dtls-and-srtp)
9. [Media Pipeline](#9-media-pipeline)
10. [RTCPeerConnection API](#10-rtcpeerconnection-api)
11. [getUserMedia / MediaDevices API](#11-getusermedia--mediadevices-api)
12. [Complete Code Example](#12-complete-code-example)
13. [Common Interview Questions](#13-common-interview-questions)

---

## 1. What is WebRTC

### History

WebRTC (Web Real-Time Communication) is an open-source project that provides
browsers and mobile applications with real-time communication capabilities via
simple APIs. Its history is rooted in strategic acquisitions by Google:

- **2010**: Google acquires **On2 Technologies** for $124.6 million. On2 created
  the VP8 video codec, which Google subsequently open-sourced as part of the
  WebM project. VP8 and its successor VP9 became foundational video codecs in
  WebRTC.

- **2010**: Google acquires **Global IP Solutions (GIPS)** for $68.2 million.
  GIPS was a Swedish company that developed real-time voice and video processing
  engines used by companies including Yahoo, AOL, and Oovoo. GIPS provided:

  - Audio codecs (iSAC, iLBC)
  - Acoustic Echo Cancellation (AEC)
  - Automatic Gain Control (AGC)
  - Noise Reduction
  - Video processing (jitter buffer, error concealment)

- **2011**: Google open-sources the GIPS technology under a BSD license and
  proposes WebRTC as a web standard. The first WebRTC-enabled browser was
  Chrome Canary in late 2011.

- **2012**: Firefox adds WebRTC support. The first cross-browser video call
  between Chrome and Firefox is demonstrated.

- **2017**: Safari adds WebRTC support in Safari 11 with iOS 11, the last major
  holdout.

- **2021**: WebRTC 1.0 reaches W3C Recommendation status, marking formal
  standardization after a decade of development.

### Standards Bodies

WebRTC is jointly standardized by two organizations:

| Organization                               | Scope           | Key Specifications                                       |
| ------------------------------------------ | --------------- | -------------------------------------------------------- |
| **W3C** (World Wide Web Consortium)        | JavaScript APIs | `RTCPeerConnection`, `MediaStream`, `RTCDataChannel`     |
| **IETF** (Internet Engineering Task Force) | Wire protocols  | ICE, DTLS-SRTP, SCTP, SDP extensions, codec requirements |

Key RFCs include:

- **RFC 8825** - Overview: Real-Time Communication in Web Browsers
- **RFC 8826** - Security Architecture
- **RFC 8827** - Security Considerations for WebRTC
- **RFC 8829** - JavaScript Session Establishment Protocol (JSEP)
- **RFC 8834** - Media Transport and Use of RTP
- **RFC 8835** - Transports for WebRTC
- **RFC 7742** - WebRTC Video Processing and Codec Requirements
- **RFC 7874** - WebRTC Audio Codec and Processing Requirements

### Browser Support

As of 2025, WebRTC is supported in all major browsers:

| Browser          | Support Since         | Notes                                  |
| ---------------- | --------------------- | -------------------------------------- |
| Chrome           | 2012 (v23)            | Full support, reference implementation |
| Firefox          | 2013 (v22)            | Full support                           |
| Safari           | 2017 (v11)            | Initially limited, now full support    |
| Edge             | 2018 (Chromium-based) | Full support via Chromium              |
| Opera            | 2013                  | Full support via Chromium              |
| Samsung Internet | 2016                  | Full support                           |
| iOS Safari       | iOS 11+               | Full support                           |
| Android WebView  | Chrome 28+            | Supported                              |

### The Peer-to-Peer Promise

WebRTC enables direct peer-to-peer communication between browsers without
requiring media to pass through a server. This provides:

- **Low latency**: No intermediate server adds round-trip delay
- **Reduced bandwidth cost**: Server does not relay media (in direct cases)
- **End-to-end encryption**: DTLS-SRTP is mandatory, not optional
- **No plugins**: Runs natively in the browser via JavaScript APIs
- **Rich media**: Audio, video, and arbitrary data channels

However, the "peer-to-peer" nature has important caveats:

- **Signaling still requires a server** to exchange session metadata
- **NAT traversal** may require STUN/TURN servers
- **Roughly 15-20% of connections** require a TURN relay, making them
  effectively server-mediated at the transport level
- **Multi-party calls** often require an SFU (Selective Forwarding Unit)
  or MCU (Multipoint Control Unit) server

---

## 2. WebRTC Architecture

### The Full Stack

```
+-------------------------------------------------------------------+
|                        APPLICATION LAYER                           |
|                                                                    |
|  getUserMedia()     RTCPeerConnection     RTCDataChannel           |
|       |                    |                    |                   |
|  MediaStream         Offer/Answer           SCTP                   |
+-------------------------------------------------------------------+
|                        SESSION LAYER                               |
|                                                                    |
|              SDP (Session Description Protocol)                    |
|              JSEP (JS Session Establishment Protocol)              |
+-------------------------------------------------------------------+
|                        SECURITY LAYER                              |
|                                                                    |
|         DTLS (Datagram Transport Layer Security)                   |
|         SRTP (Secure Real-time Transport Protocol)                 |
+-------------------------------------------------------------------+
|                       TRANSPORT LAYER                              |
|                                                                    |
|     ICE (Interactive Connectivity Establishment)                   |
|     STUN (Session Traversal Utilities for NAT)                     |
|     TURN (Traversal Using Relays around NAT)                       |
+-------------------------------------------------------------------+
|                        NETWORK LAYER                               |
|                                                                    |
|                    UDP (preferred) / TCP                            |
+-------------------------------------------------------------------+
```

### Layer-by-Layer Breakdown

**Application Layer**: The JavaScript APIs that developers interact with.
`getUserMedia` captures local media, `RTCPeerConnection` manages the connection
and media exchange, and `RTCDataChannel` provides arbitrary data transport.

**Session Layer**: SDP describes the session parameters (codecs, resolutions,
network candidates). JSEP defines the offer/answer exchange model implemented
by browser APIs.

**Security Layer**: DTLS performs the key exchange. SRTP encrypts and
authenticates media packets. This layer is mandatory in WebRTC --- there is no
way to send unencrypted media.

**Transport Layer**: ICE determines the best network path between peers, using
STUN to discover public addresses and TURN to relay traffic when direct
connectivity is impossible.

**Network Layer**: WebRTC prefers UDP for low-latency media transport. TCP is
used as a fallback (ICE TCP candidates) and for TURN-over-TCP when UDP is
blocked by firewalls.

### Detailed Data Flow

```
Peer A                                              Peer B
+------------------+                         +------------------+
| Camera/Mic       |                         | Camera/Mic       |
|    |              |                         |    |              |
| getUserMedia()   |                         | getUserMedia()   |
|    |              |                         |    |              |
| MediaStream      |                         | MediaStream      |
|    |              |                         |    |              |
| addTrack()       |                         | addTrack()       |
|    |              |                         |    |              |
| RTCPeerConnection|                         | RTCPeerConnection|
|    |              |                         |    |              |
| createOffer()    |                         | createAnswer()   |
|    |              |                         |    |              |
| SDP Offer  ------+--> Signaling Server -->-+-- SDP Offer      |
| SDP Answer ------+-<-- Signaling Server -<-+-- SDP Answer     |
|    |              |                         |    |              |
| ICE Candidates --+--> Signaling Server -->-+-- ICE Candidates |
| ICE Candidates --+-<-- Signaling Server -<-+-- ICE Candidates |
|    |              |                         |    |              |
| ICE Connectivity Checks (STUN Binding)     |    |              |
|    |<============= Direct or TURN ========>|    |              |
|    |              |                         |    |              |
| DTLS Handshake <=========================> | DTLS Handshake   |
|    |              |                         |    |              |
| SRTP Encrypted Media <===================> | SRTP Media       |
+------------------+                         +------------------+
```

---

## 3. Signaling

### Why WebRTC Does Not Define Signaling

A deliberate design decision: WebRTC specifies how media is transported but
not how peers discover each other or exchange session metadata. This was
intentional for several reasons:

1. **Interoperability with existing systems**: Applications may need to
   integrate with SIP, XMPP, or proprietary signaling infrastructure
2. **Flexibility**: Different applications have different requirements
   (1:1 calls, group calls, broadcast)
3. **Simplicity**: Keeping signaling out of the spec keeps the spec focused
   on real-time media transport
4. **Existing solutions**: HTTP, WebSocket, and other transport mechanisms
   already solve the signaling problem well

### What Gets Exchanged in Signaling

Signaling must convey three types of information:

1. **Session Description (SDP)**: Codec capabilities, media types, connection
   parameters
2. **ICE Candidates**: Network addresses and ports that the peer can be
   reached at
3. **Session Control**: Join, leave, mute, hold, transfer operations

### The Offer/Answer Model

WebRTC uses an offer/answer model defined by JSEP (RFC 8829):

```
Caller (Offerer)                           Callee (Answerer)
      |                                          |
      |  1. createOffer()                        |
      |  2. setLocalDescription(offer)           |
      |                                          |
      |  --- SDP Offer via Signaling --------->  |
      |                                          |
      |                   3. setRemoteDescription(offer)
      |                   4. createAnswer()
      |                   5. setLocalDescription(answer)
      |                                          |
      |  <--- SDP Answer via Signaling --------  |
      |                                          |
      |  6. setRemoteDescription(answer)         |
      |                                          |
      |  --- ICE Candidates (trickle) -------->  |
      |  <--- ICE Candidates (trickle) --------  |
      |                                          |
      |  ====== Media Flows ==================>  |
      |  <===== Media Flows ===================  |
```

### Common Signaling Approaches

#### WebSocket

The most popular approach for web applications. Provides full-duplex
communication, low latency, and natural fit for real-time signaling.

```javascript
// Signaling via WebSocket
const ws = new WebSocket('wss://signaling.example.com');

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  switch (message.type) {
    case 'offer':
      handleOffer(message.sdp);
      break;
    case 'answer':
      handleAnswer(message.sdp);
      break;
    case 'candidate':
      handleCandidate(message.candidate);
      break;
  }
};

function sendSignal(message) {
  ws.send(JSON.stringify(message));
}
```

#### HTTP Long Polling / Server-Sent Events

Used when WebSocket is not available. Higher latency but works through more
restrictive firewalls and proxies.

#### SIP (Session Initiation Protocol)

Used for interoperability with existing VoIP infrastructure. SIP over
WebSocket (RFC 7118) is commonly used with libraries like JsSIP or SIP.js.

#### XMPP (Jingle)

Used in some messaging platforms. Jingle (XEP-0166) is the XMPP extension
for session negotiation.

#### Custom REST API

Some applications use simple HTTP POST endpoints for exchanging SDP and
candidates, polling for updates. Simple but higher latency.

### Trickle ICE vs Vanilla ICE

- **Vanilla ICE**: All ICE candidates are gathered before the SDP is sent.
  Slower but simpler.
- **Trickle ICE** (RFC 8838): ICE candidates are sent incrementally as they
  are discovered. Faster connection establishment. This is the preferred
  approach in modern implementations.

---

## 4. SDP (Session Description Protocol)

### Overview

SDP (RFC 8866, originally RFC 4566) is a text-based format for describing
multimedia sessions. In WebRTC, SDP carries codec capabilities, media
descriptions, ICE candidates, DTLS fingerprints, and more.

SDP was not designed for WebRTC --- it predates it by decades. WebRTC
reuses SDP with extensions, which is why SDP in WebRTC can appear verbose
and sometimes confusing.

### SDP Anatomy Line by Line

An SDP message consists of lines in the format `<type>=<value>`:

```
v=0
o=- 4622731051429708location 2 IN IP4 127.0.0.1
s=-
t=0 0
a=group:BUNDLE 0 1
a=extmap-allow-mixed
a=msid-semantic: WMS stream0

m=audio 9 UDP/TLS/RTP/SAVPF 111 103 104 9 0 8 106 105 13 110 112 113 126
c=IN IP4 0.0.0.0
a=rtcp:9 IN IP4 0.0.0.0
a=ice-ufrag:abcd
a=ice-pwd:efghijklmnopqrstuvwxyz1234
a=ice-options:trickle
a=fingerprint:sha-256 AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99
a=setup:actpass
a=mid:0
a=extmap:1 urn:ietf:params:rtp-hdrext:ssrc-audio-level
a=extmap:2 http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time
a=sendrecv
a=msid:stream0 audioTrack0
a=rtcp-mux
a=rtpmap:111 opus/48000/2
a=rtcp-fb:111 transport-cc
a=fmtp:111 minptime=10;useinbandfec=1
a=rtpmap:103 ISAC/16000
a=rtpmap:9 G722/8000
a=rtpmap:0 PCMU/8000
a=rtpmap:8 PCMA/8000
a=ssrc:1234567890 cname:localCname
a=candidate:1 1 udp 2113937151 192.168.1.100 54321 typ host
a=candidate:2 1 udp 1845501695 203.0.113.50 12345 typ srflx raddr 192.168.1.100 rport 54321
a=candidate:3 1 udp 8331263 198.51.100.10 3478 typ relay raddr 203.0.113.50 rport 12345

m=video 9 UDP/TLS/RTP/SAVPF 96 97 98 99 100 101
c=IN IP4 0.0.0.0
a=rtcp:9 IN IP4 0.0.0.0
a=ice-ufrag:abcd
a=ice-pwd:efghijklmnopqrstuvwxyz1234
a=fingerprint:sha-256 AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99
a=setup:actpass
a=mid:1
a=extmap:14 urn:ietf:params:rtp-hdrext:toffset
a=extmap:2 http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time
a=extmap:3 urn:3gpp:video-orientation
a=sendrecv
a=msid:stream0 videoTrack0
a=rtcp-mux
a=rtcp-rsize
a=rtpmap:96 VP8/90000
a=rtcp-fb:96 goog-remb
a=rtcp-fb:96 transport-cc
a=rtcp-fb:96 ccm fir
a=rtcp-fb:96 nack
a=rtcp-fb:96 nack pli
a=rtpmap:97 rtx/90000
a=fmtp:97 apt=96
a=rtpmap:98 H264/90000
a=rtcp-fb:98 goog-remb
a=rtcp-fb:98 transport-cc
a=rtcp-fb:98 ccm fir
a=rtcp-fb:98 nack
a=rtcp-fb:98 nack pli
a=fmtp:98 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42001f
a=ssrc:9876543210 cname:localCname
```

### Line-by-Line Explanation

**Session-level fields:**

| Line                            | Meaning                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------- |
| `v=0`                           | Protocol version. Always 0.                                                     |
| `o=- 462... 2 IN IP4 127.0.0.1` | Origin: username (-), session ID, version, network type, address type, address  |
| `s=-`                           | Session name. Typically unused in WebRTC (set to `-`).                          |
| `t=0 0`                         | Timing: start time and stop time. 0 0 means the session is permanent.           |
| `a=group:BUNDLE 0 1`            | BUNDLE groups media sections (audio `0` and video `1`) onto a single transport. |
| `a=extmap-allow-mixed`          | Allows mixing one-byte and two-byte RTP header extensions.                      |
| `a=msid-semantic: WMS stream0`  | MediaStream identification semantic. `WMS` = WebRTC Media Streams.              |

**Media-level fields (per m= section):**

| Line                                      | Meaning                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------- |
| `m=audio 9 UDP/TLS/RTP/SAVPF 111 103 ...` | Media type, port (9 = placeholder with ICE), profile, payload type numbers      |
| `c=IN IP4 0.0.0.0`                        | Connection address. 0.0.0.0 is a placeholder; actual address determined by ICE. |
| `a=rtcp:9 IN IP4 0.0.0.0`                 | RTCP connection info. Also a placeholder.                                       |
| `a=ice-ufrag:abcd`                        | ICE username fragment for authentication.                                       |
| `a=ice-pwd:efgh...`                       | ICE password for authentication.                                                |
| `a=ice-options:trickle`                   | Supports trickle ICE (incremental candidate delivery).                          |
| `a=fingerprint:sha-256 AA:BB:...`         | DTLS certificate fingerprint for identity verification.                         |
| `a=setup:actpass`                         | DTLS role: offerer proposes `actpass` (willing to be active or passive).        |
| `a=mid:0`                                 | Media identification tag. Referenced by BUNDLE grouping.                        |
| `a=sendrecv`                              | Direction: send and receive media. Others: `sendonly`, `recvonly`, `inactive`.  |
| `a=msid:stream0 audioTrack0`              | Associates this media with a MediaStream and track ID.                          |
| `a=rtcp-mux`                              | Multiplex RTP and RTCP on the same port. Mandatory in WebRTC.                   |
| `a=rtpmap:111 opus/48000/2`               | Payload type 111 maps to Opus codec, 48kHz, 2 channels.                         |
| `a=fmtp:111 minptime=10;useinbandfec=1`   | Format parameters: minimum packet time 10ms, in-band FEC enabled.               |
| `a=rtcp-fb:111 transport-cc`              | RTCP feedback: transport-wide congestion control for payload 111.               |
| `a=ssrc:1234567890 cname:localCname`      | Synchronization source identifier and canonical name.                           |
| `a=candidate:...`                         | ICE candidate (see ICE section for full breakdown).                             |

### ICE Candidates in SDP

Candidates can appear inline in the SDP or be trickled separately:

```
a=candidate:foundation component-id transport priority address port typ type [raddr related-addr] [rport related-port]
```

Example breakdown:

```
a=candidate:2 1 udp 1845501695 203.0.113.50 12345 typ srflx raddr 192.168.1.100 rport 54321
            ^  ^  ^   ^          ^             ^         ^          ^                ^
            |  |  |   |          |             |         |          |                |
        found. comp proto priority  public-IP  port    type     private-IP      private-port
```

### Plan B vs Unified Plan

Historically there were two competing approaches to representing multiple
media tracks in SDP:

**Plan B** (Google's approach, now deprecated):

- Multiple tracks of the same media type share a single `m=` line
- Tracks distinguished by SSRC
- Used in older Chrome versions

**Unified Plan** (RFC 8829, current standard):

- Each track gets its own `m=` line
- Tracks identified by `a=mid` attribute
- Uses `a=msid` to associate tracks with MediaStreams
- Supported by all modern browsers
- Allows mid-session track addition/removal

```
// Plan B (DEPRECATED): One m=audio line with multiple SSRCs
m=audio 9 UDP/TLS/RTP/SAVPF 111
a=ssrc:1111 cname:peer1
a=ssrc:2222 cname:peer2

// Unified Plan (CURRENT): Separate m= lines per track
m=audio 9 UDP/TLS/RTP/SAVPF 111
a=mid:0
a=msid:stream1 track1

m=audio 9 UDP/TLS/RTP/SAVPF 111
a=mid:1
a=msid:stream2 track2
```

---

## 5. ICE (Interactive Connectivity Establishment)

### The NAT Problem

Most devices sit behind NAT (Network Address Translation) routers. A device
with private IP `192.168.1.100` cannot be directly reached from the public
internet. ICE (RFC 8445) solves the problem of establishing connectivity
between two peers behind NATs.

### NAT Types

Understanding NAT types is critical for predicting WebRTC connectivity:

```
+------------------------------------------------------------------+
|                         NAT TYPES                                 |
+------------------------------------------------------------------+
|                                                                    |
|  1. Full Cone NAT (Least Restrictive)                             |
|     - Any external host can send to the mapped port               |
|     - Once mapping is created, it's open to everyone              |
|                                                                    |
|     Internal: 192.168.1.100:5000                                  |
|     External: 203.0.113.50:12345                                  |
|     Any host can send to 203.0.113.50:12345                       |
|                                                                    |
|  2. Address-Restricted Cone NAT                                   |
|     - Only hosts that the internal host has sent to can reply      |
|     - Checks source IP but not source port                        |
|                                                                    |
|     Internal sends to 198.51.100.5:80                             |
|     198.51.100.5 (any port) can send back                         |
|     198.51.100.6 CANNOT send back                                 |
|                                                                    |
|  3. Port-Restricted Cone NAT                                     |
|     - Checks both source IP AND source port                       |
|                                                                    |
|     Internal sends to 198.51.100.5:80                             |
|     198.51.100.5:80 can send back                                 |
|     198.51.100.5:81 CANNOT send back                              |
|                                                                    |
|  4. Symmetric NAT (Most Restrictive)                              |
|     - Different mapping for each destination                       |
|     - Cannot be traversed by STUN alone                            |
|     - Requires TURN relay                                          |
|                                                                    |
|     Internal sends to Host A => Mapped to 203.0.113.50:12345     |
|     Internal sends to Host B => Mapped to 203.0.113.50:12346     |
|     (Different external port per destination!)                     |
|                                                                    |
+------------------------------------------------------------------+
```

**Connectivity matrix between NAT types:**

```
                   Full Cone  Addr-Rest  Port-Rest  Symmetric
Full Cone            STUN       STUN       STUN       STUN
Addr-Restricted      STUN       STUN       STUN       STUN
Port-Restricted      STUN       STUN       STUN       TURN*
Symmetric            STUN       STUN       TURN*      TURN
                                          (* sometimes works)
```

### ICE Candidate Types

ICE gathers multiple candidates and tests them to find the best path:

| Type    | Name             | Description                                                   | Priority |
| ------- | ---------------- | ------------------------------------------------------------- | -------- |
| `host`  | Host candidate   | Local interface address (e.g., 192.168.1.100:5000)            | Highest  |
| `srflx` | Server Reflexive | Public address discovered via STUN (e.g., 203.0.113.50:12345) | Medium   |
| `prflx` | Peer Reflexive   | Discovered during connectivity checks (surprise address)      | Medium   |
| `relay` | Relay candidate  | Address allocated on a TURN server                            | Lowest   |

### Candidate Gathering Process

```
+-------------------------------------------------------------------+
|                   ICE CANDIDATE GATHERING                          |
+-------------------------------------------------------------------+
|                                                                    |
|  Step 1: Enumerate local interfaces                               |
|    -> host candidates (192.168.1.100:5000, 10.0.0.5:5001, etc.)  |
|                                                                    |
|  Step 2: Send STUN Binding Requests to STUN server               |
|    -> server reflexive candidates (203.0.113.50:12345)            |
|                                                                    |
|  Step 3: Send TURN Allocate Requests to TURN server              |
|    -> relay candidates (198.51.100.10:49152)                      |
|                                                                    |
|  Step 4: Report all candidates to application (onicecandidate)    |
|                                                                    |
|  Step 5: Signal candidates to remote peer via signaling channel   |
|                                                                    |
+-------------------------------------------------------------------+
```

### Connectivity Checks

Once both peers have exchanged candidates, ICE forms candidate pairs and
performs connectivity checks:

```
ICE Connectivity Check Flow
============================

Peer A                                              Peer B
  |                                                    |
  |  Form candidate pairs from local + remote          |
  |  Sort by priority                                  |
  |                                                    |
  |  1. STUN Binding Request (USE-CANDIDATE) -------> |
  |     From: A.host     To: B.host                    |
  |                                                    |
  |  <---- STUN Binding Response (Success) ----------  |
  |        Pair (A.host, B.host) = SUCCEEDED           |
  |                                                    |
  |  2. STUN Binding Request -----------------------> |
  |     From: A.host     To: B.srflx                   |
  |                                                    |
  |  <---- STUN Binding Response (Success) ----------  |
  |        Pair (A.host, B.srflx) = SUCCEEDED          |
  |                                                    |
  |  3. STUN Binding Request -----------------------> |
  |     From: A.srflx    To: B.host                    |
  |                                                    |
  |  X---- Timeout (FAILED) -----X                     |
  |        Pair (A.srflx, B.host) = FAILED             |
  |                                                    |
  |  ... (continue for all pairs)                      |
  |                                                    |
  |  Select best successful pair as nominated pair      |
  |                                                    |
  |  ======= Media flows on nominated pair =========>  |
  |  <======= Media flows on nominated pair =========  |
```

### Nomination

ICE uses nomination to select which candidate pair will carry media:

- **Regular nomination**: The controlling agent (typically the offerer) tests
  all pairs, then sends a new check with the `USE-CANDIDATE` flag on the
  selected pair.
- **Aggressive nomination**: The controlling agent sets `USE-CANDIDATE` on
  every check. The first pair that succeeds is nominated. Faster but may
  select a suboptimal path.

### ICE States

The `RTCPeerConnection.iceConnectionState` property tracks the ICE state:

```
              +--------+
              |  new   |
              +--------+
                  |
                  v
             +----------+
             | checking |
             +----------+
              /        \
             v          v
     +-----------+  +--------+
     | connected |  | failed |
     +-----------+  +--------+
          |              |
          v              v
     +-----------+  +-----------+
     | completed |  | closed    |
     +-----------+  +-----------+
          |
          v
    +---------------+
    | disconnected  | (temporary, may recover)
    +---------------+
```

### ICE Restart

When connectivity is lost (e.g., network change, NAT rebinding), an ICE
restart can re-establish the connection without full renegotiation:

```javascript
// Trigger ICE restart
const offer = await pc.createOffer({ iceRestart: true });
await pc.setLocalDescription(offer);
// Send offer to remote peer via signaling
```

An ICE restart generates new ICE credentials (`ice-ufrag` and `ice-pwd`)
and triggers fresh candidate gathering, while preserving the existing
DTLS association.

---

## 6. STUN

### Overview

STUN (Session Traversal Utilities for NAT, RFC 8489) allows a client behind
a NAT to discover its public IP address and port mapping. It is a lightweight
request/response protocol.

### How STUN Works

```
STUN Binding Request/Response
==============================

Client (192.168.1.100:5000)       NAT (203.0.113.50)       STUN Server (stun.example.com:3478)
        |                               |                            |
        |  UDP packet ----------------->|                            |
        |  Src: 192.168.1.100:5000      |                            |
        |  Dst: stun.example.com:3478   |                            |
        |                               |                            |
        |       NAT creates mapping     |                            |
        |       192.168.1.100:5000 <--> 203.0.113.50:12345          |
        |                               |                            |
        |                               |  UDP packet -------------->|
        |                               |  Src: 203.0.113.50:12345  |
        |                               |  Dst: stun.example.com:3478|
        |                               |                            |
        |                               |                            | Server sees packet
        |                               |                            | from 203.0.113.50:12345
        |                               |                            |
        |                               |  STUN Binding Response <---|
        |                               |  XOR-MAPPED-ADDRESS:       |
        |                               |    203.0.113.50:12345      |
        |                               |                            |
        |  <----------------------------|                            |
        |  Client now knows its public                               |
        |  address: 203.0.113.50:12345                               |
        |                                                            |
        |  This becomes a "srflx" ICE candidate                      |
```

### STUN Message Structure

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|0 0|     STUN Message Type     |       Message Length          |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                     Magic Cookie (0x2112A442)                 |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                                                               |
|                  Transaction ID (96 bits)                      |
|                                                               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|         Attribute Type        |        Attribute Length        |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                       Attribute Value...                       |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

Key attributes:

- **MAPPED-ADDRESS**: The public IP:port as seen by the server
- **XOR-MAPPED-ADDRESS**: Same but XOR'd with magic cookie (prevents ALG
  tampering)
- **USERNAME**: Used for ICE authentication
- **MESSAGE-INTEGRITY**: HMAC-SHA1 for message authentication
- **FINGERPRINT**: CRC32 for demultiplexing from other protocols

### STUN Server Operation

A STUN server is extremely lightweight --- it simply echoes back the source
address it sees. This makes STUN servers cheap to operate. Google provides
free public STUN servers:

```javascript
const config = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};
```

### STUN Limitations

- Does not work with **Symmetric NAT**: The port mapping changes per
  destination, so the mapping discovered via STUN server is useless for
  communicating with a peer
- Only discovers addresses; does not relay traffic
- Cannot traverse firewalls that block incoming UDP

---

## 7. TURN

### Why TURN Is Needed

When STUN fails (symmetric NAT, restrictive firewalls), TURN (Traversal
Using Relays around NAT, RFC 8656) provides a relay server that both peers
can route media through. TURN guarantees connectivity at the cost of
increased latency and server bandwidth.

### TURN Relay Operation

```
TURN Relay Architecture
========================

Peer A                    TURN Server                    Peer B
(192.168.1.100)          (198.51.100.10)               (10.0.0.50)
     |                         |                            |
     | 1. Allocate Request --->|                            |
     |    (authenticate)       |                            |
     |                         |                            |
     | <-- Allocate Response --|                            |
     |    Relayed Address:     |                            |
     |    198.51.100.10:49152  |                            |
     |                         |                            |
     |  (This relayed address becomes a "relay" candidate)  |
     |                         |                            |
     | 2. CreatePermission --->|                            |
     |    (allow Peer B)       |                            |
     |                         |                            |
     | 3. Send Indication ---->|                            |
     |    Data for Peer B      |                            |
     |                         | 4. Forward data ---------->|
     |                         |    From 198.51.100.10:49152|
     |                         |                            |
     |                         | <--- Data from Peer B -----|
     |                         |      To 198.51.100.10:49152|
     | <-- Data Indication ----|                            |
     |    Data from Peer B     |                            |
     |                         |                            |
```

### TURN Messages

| Message              | Purpose                                                            |
| -------------------- | ------------------------------------------------------------------ |
| **Allocate**         | Request a relay address on the TURN server                         |
| **Refresh**          | Keep the allocation alive (must be refreshed periodically)         |
| **CreatePermission** | Authorize a peer IP to send through the relay                      |
| **ChannelBind**      | Create an efficient channel for a specific peer (reduces overhead) |
| **Send**             | Send data via the relay (uses Send Indication)                     |
| **Data**             | Receive data via the relay (uses Data Indication)                  |

### TURN over TCP and TLS

When UDP is completely blocked:

1. **TURN over TCP**: Client connects to TURN server via TCP. The TURN server
   relays traffic over UDP to the peer. Adds TCP overhead.
2. **TURN over TLS (port 443)**: Client connects to TURN server via TLS on
   port 443. Appears as normal HTTPS traffic to firewalls. Most reliable
   fallback but highest overhead.

```javascript
const config = {
  iceServers: [
    { urls: 'stun:stun.example.com:3478' },
    {
      urls: [
        'turn:turn.example.com:3478?transport=udp',
        'turn:turn.example.com:3478?transport=tcp',
        'turns:turn.example.com:443?transport=tcp',
      ],
      username: 'user',
      credential: 'password',
    },
  ],
};
```

### Cost Considerations

TURN servers are expensive because they relay all media traffic:

| Factor            | STUN                                     | TURN                                    |
| ----------------- | ---------------------------------------- | --------------------------------------- |
| **Bandwidth**     | Negligible (only binding requests)       | Full media bandwidth per session        |
| **CPU**           | Minimal                                  | Moderate (relaying, auth)               |
| **Scalability**   | Thousands of concurrent users per server | Hundreds, depends on bandwidth          |
| **Cost**          | Essentially free to run                  | $0.05-0.40 per GB depending on provider |
| **Typical usage** | 80-85% of connections                    | 15-20% of connections                   |

Managed TURN services include Twilio, Xirsys, and Cloudflare. Self-hosted
options include coturn (the most popular open-source TURN server).

### Allocation Lifetime and Refresh

- Default allocation lifetime: 600 seconds (10 minutes)
- Client must send Refresh before expiration
- If allocation expires, the relay address is released and connectivity is lost
- Permissions also expire (300 seconds) and must be refreshed

---

## 8. DTLS and SRTP

### Overview

WebRTC mandates encryption for all media. The security architecture uses:

- **DTLS** (Datagram Transport Layer Security, RFC 6347): Performs the key
  exchange and certificate verification
- **SRTP** (Secure Real-time Transport Protocol, RFC 3711): Encrypts the
  actual media packets
- **DTLS-SRTP** (RFC 5764): The mechanism for deriving SRTP keys from the
  DTLS handshake

### DTLS Handshake

DTLS is essentially TLS adapted for unreliable datagram transport (UDP). The
handshake establishes a shared secret used to derive SRTP keys.

```
DTLS-SRTP Handshake
=====================

Peer A (DTLS Client)                           Peer B (DTLS Server)
       |                                              |
       |  ClientHello -------------------------------->|
       |    (supported cipher suites,                  |
       |     DTLS version, random,                     |
       |     use_srtp extension)                       |
       |                                              |
       |  <------ HelloVerifyRequest (cookie) --------|
       |                                              |
       |  ClientHello (with cookie) ------------------>|
       |                                              |
       |  <-------------- ServerHello ----------------|
       |                 Certificate                   |
       |                 ServerKeyExchange             |
       |                 CertificateRequest            |
       |                 ServerHelloDone               |
       |                                              |
       |  Certificate -------------------------------->|
       |  ClientKeyExchange                            |
       |  CertificateVerify                            |
       |  [ChangeCipherSpec]                           |
       |  Finished ------------------------------------->
       |                                              |
       |  <------------- [ChangeCipherSpec] ----------|
       |  <------------- Finished --------------------|
       |                                              |
       |  DTLS handshake complete                      |
       |  SRTP keys derived from shared secret         |
       |                                              |
       |  ======= SRTP Encrypted Media ============>  |
       |  <====== SRTP Encrypted Media =============  |
```

### DTLS-SRTP Key Derivation

After the DTLS handshake completes:

1. Both peers have a shared master secret
2. The `use_srtp` DTLS extension negotiates an SRTP protection profile
   (e.g., `SRTP_AES128_CM_HMAC_SHA1_80`)
3. SRTP keys are exported from the DTLS master secret using the
   `DTLS-SRTP Key Material Exporter` (RFC 5705)
4. Four keys are derived:
   - Client SRTP master key
   - Server SRTP master key
   - Client SRTP master salt
   - Server SRTP master salt

### Fingerprint Verification

WebRTC uses self-signed certificates for DTLS. Trust is established by
including the certificate fingerprint in the SDP, which is delivered through
the (trusted) signaling channel:

```
a=fingerprint:sha-256 AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:...
```

During the DTLS handshake, each peer verifies that the certificate presented
matches the fingerprint from the SDP. If it does not match, the connection
is rejected. This is why the signaling channel must be secure --- if an
attacker can modify the SDP, they can perform a man-in-the-middle attack.

### SRTP Packet Structure

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|V=2|P|X|  CC   |M|     PT      |       Sequence Number         |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                           Timestamp                           |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|           Synchronization Source (SSRC) Identifier            |
+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+
|      ...Encrypted Payload (audio or video frame data)...      |
|                                                               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                    SRTP Authentication Tag                     |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

- **RTP header is NOT encrypted** (needed for routing)
- **Payload IS encrypted** using AES-128 Counter Mode
- **Authentication tag** covers the header and encrypted payload (HMAC-SHA1)
- Prevents tampering, eavesdropping, and replay attacks

### Protocol Demultiplexing

Since DTLS, SRTP, SRTCP, and STUN all share the same port (via ICE and
BUNDLE), the first byte of each packet is used to demultiplex:

| First Byte Range | Protocol                          |
| ---------------- | --------------------------------- |
| 0-3              | STUN                              |
| 20-63            | DTLS                              |
| 128-191          | RTP/SRTP                          |
| 192-223          | RTCP/SRTCP (when not muxed, rare) |

---

## 9. Media Pipeline

### End-to-End Media Flow

```
SENDER PIPELINE                              RECEIVER PIPELINE
===============                              =================

+------------------+                         +------------------+
| 1. CAPTURE       |                         | 10. RENDER       |
| Camera / Mic     |                         | <video> / <audio>|
| getUserMedia()   |                         | element          |
+--------+---------+                         +--------+---------+
         |                                            ^
         v                                            |
+------------------+                         +------------------+
| 2. PRE-PROCESS   |                         | 9. POST-PROCESS  |
| Echo Cancel (AEC)|                         | Jitter Buffer    |
| Noise Suppress.  |                         | Concealment      |
| Auto Gain (AGC)  |                         | De-jitter        |
+--------+---------+                         +--------+---------+
         |                                            ^
         v                                            |
+------------------+                         +------------------+
| 3. ENCODE        |                         | 8. DECODE        |
| VP8/VP9/H.264/AV1|                        | VP8/VP9/H.264/AV1|
| Opus/G.722       |                         | Opus/G.722       |
+--------+---------+                         +--------+---------+
         |                                            ^
         v                                            |
+------------------+                         +------------------+
| 4. PACKETIZE     |                         | 7. DEPACKETIZE   |
| Split into RTP   |                         | Reassemble from  |
| packets          |                         | RTP packets      |
| Add RTP headers  |                         | Reorder          |
+--------+---------+                         +--------+---------+
         |                                            ^
         v                                            |
+------------------+                         +------------------+
| 5. ENCRYPT       |                         | 6. DECRYPT       |
| SRTP encryption  |                         | SRTP decryption  |
| Auth tag         |                         | Auth verify      |
+--------+---------+                         +--------+---------+
         |                                            ^
         v                                            |
         +-------- UDP / Network Transport -----------+
```

### Audio Pipeline Details

**Capture**: Raw PCM audio from the microphone, typically at 48 kHz, 16-bit.

**Pre-processing** (all done in the browser engine, not JavaScript):

- **AEC (Acoustic Echo Cancellation)**: Removes echo from speaker playback
  that the microphone picks up
- **AGC (Automatic Gain Control)**: Normalizes audio volume levels
- **NS (Noise Suppression)**: Removes background noise

**Encoding**: WebRTC mandates Opus support. Opus is adaptive (6-510 kbps),
handles both voice and music, and supports in-band FEC for packet loss
resilience.

**Jitter Buffer** (receiver side): Buffers incoming packets to smooth out
arrival time variations. Trades latency for quality. Adaptive jitter buffers
adjust their size based on network conditions.

### Video Pipeline Details

**Encoding**: WebRTC requires VP8 and H.264 support. Common codecs:

- **VP8**: Older, widely supported, royalty-free
- **VP9**: Better compression than VP8, royalty-free
- **H.264**: Hardware acceleration on most devices, patent-encumbered
- **AV1**: Newest, best compression, increasingly supported

**Simulcast**: Sender encodes multiple quality levels simultaneously.
The SFU or receiver selects the appropriate quality based on available
bandwidth.

**SVC (Scalable Video Coding)**: A single bitstream with multiple layers.
Base layer provides basic quality; enhancement layers add resolution,
frame rate, or fidelity. More efficient than simulcast but harder to
implement.

### Congestion Control

WebRTC uses bandwidth estimation to prevent network congestion:

- **GCC (Google Congestion Control)**: Delay-based and loss-based estimation.
  Uses REMB (Receiver Estimated Maximum Bitrate) or Transport-CC feedback.
- **Transport-CC**: Receiver reports per-packet arrival times. Sender
  computes bandwidth estimate. More accurate than REMB.
- **NACK (Negative Acknowledgment)**: Receiver requests retransmission of
  lost packets.
- **PLI (Picture Loss Indication)**: Receiver requests a new keyframe when
  too many packets are lost to decode.
- **FIR (Full Intra Request)**: Similar to PLI but more forceful.

---

## 10. RTCPeerConnection API

### Full Lifecycle

```javascript
// 1. Configuration
const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    {
      urls: 'turn:turn.example.com:3478',
      username: 'user',
      credential: 'pass',
    },
  ],
  iceTransportPolicy: 'all', // 'all' or 'relay' (force TURN)
  bundlePolicy: 'max-bundle', // Bundle all media on one transport
  rtcpMuxPolicy: 'require', // Require RTCP multiplexing
};

// 2. Create peer connection
const pc = new RTCPeerConnection(configuration);

// 3. Add local media tracks
const stream = await navigator.mediaDevices.getUserMedia({
  video: true,
  audio: true,
});

stream.getTracks().forEach((track) => {
  pc.addTrack(track, stream);
});

// 4. Handle remote tracks
pc.ontrack = (event) => {
  const remoteVideo = document.getElementById('remoteVideo');
  remoteVideo.srcObject = event.streams[0];
};

// 5. Handle ICE candidates
pc.onicecandidate = (event) => {
  if (event.candidate) {
    // Send candidate to remote peer via signaling
    signalingChannel.send(
      JSON.stringify({
        type: 'candidate',
        candidate: event.candidate,
      })
    );
  }
};

// 6. Handle ICE connection state changes
pc.oniceconnectionstatechange = () => {
  console.log('ICE state:', pc.iceConnectionState);
  // new -> checking -> connected -> completed
  // OR: new -> checking -> failed
  // OR: connected -> disconnected -> connected (recovery)
};

// 7. Handle connection state changes
pc.onconnectionstatechange = () => {
  console.log('Connection state:', pc.connectionState);
  if (pc.connectionState === 'failed') {
    // Attempt ICE restart
    pc.restartIce();
  }
};

// 8. Handle negotiation needed (triggered when tracks are added/removed)
pc.onnegotiationneeded = async () => {
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  signalingChannel.send(
    JSON.stringify({
      type: 'offer',
      sdp: pc.localDescription,
    })
  );
};
```

### Creating and Handling Offers

```javascript
// OFFERER SIDE

async function createAndSendOffer() {
  // createOffer() generates an SDP offer based on:
  // - Added tracks (addTrack / addTransceiver)
  // - Data channels
  // - Current configuration
  const offer = await pc.createOffer({
    offerToReceiveAudio: true,
    offerToReceiveVideo: true,
    iceRestart: false, // Set true to restart ICE
  });

  // setLocalDescription triggers ICE candidate gathering
  await pc.setLocalDescription(offer);

  // Send offer via signaling
  signalingChannel.send(
    JSON.stringify({
      type: 'offer',
      sdp: offer,
    })
  );
}
```

### Creating and Handling Answers

```javascript
// ANSWERER SIDE

async function handleOffer(offerSdp) {
  // Set the remote description (the offer we received)
  await pc.setRemoteDescription(new RTCSessionDescription(offerSdp));

  // Add local tracks before creating answer
  const stream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true,
  });
  stream.getTracks().forEach((track) => pc.addTrack(track, stream));

  // createAnswer() generates a compatible SDP answer
  const answer = await pc.createAnswer();

  // setLocalDescription triggers ICE candidate gathering
  await pc.setLocalDescription(answer);

  // Send answer via signaling
  signalingChannel.send(
    JSON.stringify({
      type: 'answer',
      sdp: answer,
    })
  );
}
```

### Adding ICE Candidates

```javascript
async function handleRemoteCandidate(candidateData) {
  const candidate = new RTCIceCandidate(candidateData);
  await pc.addIceCandidate(candidate);
}
```

### RTCPeerConnection State Machine

```
signalingState transitions:
==========================

                        setLocal(offer)
            stable -----------------------> have-local-offer
              ^                                    |
              |                          setRemote(answer)
              |                                    |
              +------------------------------------+

                       setRemote(offer)
            stable -----------------------> have-remote-offer
              ^                                    |
              |                           setLocal(answer)
              |                                    |
              +------------------------------------+

            Any state -----> closed (via close())
```

### Data Channels

```javascript
// Create a data channel (offerer side)
const dataChannel = pc.createDataChannel('chat', {
  ordered: true, // Guarantee order (default: true)
  maxRetransmits: 3, // Max retransmission attempts
  // maxPacketLifeTime: 3000, // Alternative: max time in ms (mutually exclusive with maxRetransmits)
  protocol: '', // Sub-protocol name
  negotiated: false, // If true, both sides must create with same ID
});

dataChannel.onopen = () => {
  dataChannel.send('Hello from Peer A!');
};

dataChannel.onmessage = (event) => {
  console.log('Received:', event.data);
};

// Handle incoming data channels (answerer side)
pc.ondatachannel = (event) => {
  const channel = event.channel;
  channel.onmessage = (event) => {
    console.log('Received:', event.data);
  };
};
```

Data channels use SCTP (Stream Control Transmission Protocol) over DTLS,
providing reliable/unreliable and ordered/unordered delivery modes.

---

## 11. getUserMedia / MediaDevices API

### Basic Usage

```javascript
// Request audio and video
const stream = await navigator.mediaDevices.getUserMedia({
  audio: true,
  video: true,
});

// Display in a video element
const videoElement = document.getElementById('localVideo');
videoElement.srcObject = stream;
```

### Video Constraints

```javascript
const constraints = {
  video: {
    // Resolution
    width: { min: 640, ideal: 1280, max: 1920 },
    height: { min: 480, ideal: 720, max: 1080 },

    // Frame rate
    frameRate: { min: 15, ideal: 30, max: 60 },

    // Aspect ratio
    aspectRatio: { ideal: 16 / 9 },

    // Camera selection
    facingMode: 'user', // 'user' = front camera, 'environment' = rear
    // facingMode: { exact: 'environment' },  // Must be rear camera or fail

    // Specific device
    // deviceId: { exact: 'abc123' },

    // Resize mode
    resizeMode: 'crop-and-scale', // or 'none'
  },
};

const stream = await navigator.mediaDevices.getUserMedia(constraints);
```

### Audio Constraints

```javascript
const constraints = {
  audio: {
    // Echo cancellation
    echoCancellation: { ideal: true },

    // Noise suppression
    noiseSuppression: { ideal: true },

    // Automatic gain control
    autoGainControl: { ideal: true },

    // Sample rate (browser may not honor this)
    sampleRate: 48000,

    // Channel count
    channelCount: { ideal: 1 }, // Mono for voice

    // Latency
    latency: { ideal: 0.01 }, // 10ms

    // Specific device
    // deviceId: { exact: 'xyz789' },
  },
};
```

### Device Enumeration

```javascript
async function listDevices() {
  // Must call getUserMedia first to get permission and labels
  await navigator.mediaDevices.getUserMedia({ audio: true, video: true });

  const devices = await navigator.mediaDevices.enumerateDevices();

  const audioInputs = devices.filter((d) => d.kind === 'audioinput');
  const audioOutputs = devices.filter((d) => d.kind === 'audiooutput');
  const videoInputs = devices.filter((d) => d.kind === 'videoinput');

  // Each device has:
  // - deviceId: unique identifier
  // - kind: 'audioinput' | 'audiooutput' | 'videoinput'
  // - label: human-readable name (empty before permission granted)
  // - groupId: devices from same physical device share a group

  return { audioInputs, audioOutputs, videoInputs };
}
```

### Switching Devices

```javascript
async function switchCamera(deviceId) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { deviceId: { exact: deviceId } },
  });

  const [newTrack] = stream.getVideoTracks();

  // Replace track on existing peer connection
  const sender = pc
    .getSenders()
    .find((s) => s.track && s.track.kind === 'video');

  if (sender) {
    await sender.replaceTrack(newTrack);
  }
}
```

### Handling Permission Changes

```javascript
navigator.mediaDevices.ondevicechange = async () => {
  // A device was added or removed
  const devices = await navigator.mediaDevices.enumerateDevices();
  // Update device selection UI
};

// Check permission status
const cameraPermission = await navigator.permissions.query({ name: 'camera' });
cameraPermission.onchange = () => {
  console.log('Camera permission:', cameraPermission.state);
  // 'granted', 'denied', or 'prompt'
};
```

### Screen Sharing

```javascript
// getDisplayMedia for screen/window/tab capture
const screenStream = await navigator.mediaDevices.getDisplayMedia({
  video: {
    cursor: 'always', // Show cursor
    displaySurface: 'monitor', // 'monitor', 'window', 'browser'
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { max: 30 },
  },
  audio: true, // System audio (limited browser support)
});

// Replace camera track with screen share
const [screenTrack] = screenStream.getVideoTracks();
const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');

if (sender) {
  await sender.replaceTrack(screenTrack);
}

// Detect when user stops sharing
screenTrack.onended = () => {
  // Switch back to camera
};
```

---

## 12. Complete Code Example

A full working peer-to-peer video call with WebSocket signaling.

### Signaling Server (Node.js)

```javascript
// server.js
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs');

const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    const html = fs.readFileSync(path.join(__dirname, 'index.html'));
    res.end(html);
    return;
  }
  res.writeHead(404);
  res.end('Not found');
});

const wss = new WebSocketServer({ server });

const rooms = new Map();

wss.on('connection', (ws) => {
  let currentRoom = null;
  let clientId = null;

  ws.on('message', (data) => {
    const message = JSON.parse(data);

    switch (message.type) {
      case 'join': {
        currentRoom = message.room;
        clientId = message.clientId;

        if (!rooms.has(currentRoom)) {
          rooms.set(currentRoom, new Map());
        }

        const room = rooms.get(currentRoom);
        room.set(clientId, ws);

        // Notify existing peers about the new participant
        room.forEach((peerWs, peerId) => {
          if (peerId !== clientId) {
            peerWs.send(
              JSON.stringify({
                type: 'peer-joined',
                peerId: clientId,
              })
            );
          }
        });

        // Notify the joiner about existing peers
        const existingPeers = Array.from(room.keys()).filter(
          (id) => id !== clientId
        );
        ws.send(
          JSON.stringify({
            type: 'existing-peers',
            peers: existingPeers,
          })
        );
        break;
      }

      case 'offer':
      case 'answer':
      case 'candidate': {
        const room = rooms.get(currentRoom);
        if (room) {
          const targetWs = room.get(message.target);
          if (targetWs && targetWs.readyState === 1) {
            targetWs.send(
              JSON.stringify({
                ...message,
                sender: clientId,
              })
            );
          }
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    if (currentRoom && clientId) {
      const room = rooms.get(currentRoom);
      if (room) {
        room.delete(clientId);
        room.forEach((peerWs) => {
          peerWs.send(
            JSON.stringify({
              type: 'peer-left',
              peerId: clientId,
            })
          );
        });
        if (room.size === 0) {
          rooms.delete(currentRoom);
        }
      }
    }
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
});
```

### Client (HTML + JavaScript)

```html
<!-- index.html -->
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>WebRTC Video Call</title>
    <style>
      body {
        font-family: sans-serif;
        max-width: 900px;
        margin: 0 auto;
        padding: 20px;
        background: #1a1a2e;
        color: #eee;
      }
      .video-container {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }
      video {
        width: 420px;
        height: 315px;
        background: #000;
        border-radius: 8px;
      }
      #localVideo {
        transform: scaleX(-1);
      }
      button {
        padding: 10px 20px;
        margin: 5px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
      }
      .join-btn {
        background: #4ecca3;
        color: #1a1a2e;
      }
      .hang-up-btn {
        background: #e74c3c;
        color: #fff;
      }
      .controls {
        margin: 15px 0;
      }
      input {
        padding: 10px;
        border: 1px solid #333;
        border-radius: 4px;
        background: #16213e;
        color: #eee;
        font-size: 14px;
      }
      #status {
        margin: 10px 0;
        font-style: italic;
        color: #4ecca3;
      }
    </style>
  </head>
  <body>
    <h1>WebRTC Video Call</h1>
    <div class="controls">
      <input id="roomInput" placeholder="Enter room name" value="test-room" />
      <button class="join-btn" id="joinBtn" onclick="joinRoom()">
        Join Room
      </button>
      <button class="hang-up-btn" id="hangUpBtn" onclick="hangUp()" disabled>
        Hang Up
      </button>
    </div>
    <div id="status">Not connected</div>
    <div class="video-container">
      <div>
        <h3>Local</h3>
        <video id="localVideo" autoplay muted playsinline></video>
      </div>
      <div>
        <h3>Remote</h3>
        <video id="remoteVideo" autoplay playsinline></video>
      </div>
    </div>

    <script>
      // -------------------------------------------------------
      // State
      // -------------------------------------------------------
      let ws = null;
      let localStream = null;
      let peerConnection = null;
      const clientId = crypto.randomUUID();

      // -------------------------------------------------------
      // ICE server configuration
      // -------------------------------------------------------
      const rtcConfig = {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          // Add TURN servers here for production:
          // {
          //   urls: 'turn:turn.example.com:3478',
          //   username: 'user',
          //   credential: 'pass'
          // }
        ],
      };

      // -------------------------------------------------------
      // UI helpers
      // -------------------------------------------------------
      function setStatus(text) {
        document.getElementById('status').textContent = text;
      }

      // -------------------------------------------------------
      // Join a room
      // -------------------------------------------------------
      async function joinRoom() {
        const room = document.getElementById('roomInput').value.trim();
        if (!room) return;

        setStatus('Requesting camera and microphone...');

        // Capture local media
        localStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        document.getElementById('localVideo').srcObject = localStream;

        // Connect to signaling server
        const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
        ws = new WebSocket(`${protocol}://${location.host}`);

        ws.onopen = () => {
          setStatus('Connected to signaling server. Waiting for peer...');
          ws.send(JSON.stringify({ type: 'join', room, clientId }));
          document.getElementById('joinBtn').disabled = true;
          document.getElementById('hangUpBtn').disabled = false;
        };

        ws.onmessage = (event) => {
          const message = JSON.parse(event.data);
          handleSignalingMessage(message);
        };

        ws.onclose = () => {
          setStatus('Disconnected from signaling server');
        };
      }

      // -------------------------------------------------------
      // Handle signaling messages
      // -------------------------------------------------------
      async function handleSignalingMessage(message) {
        switch (message.type) {
          case 'existing-peers': {
            // We are the newer peer; create offers to existing peers
            if (message.peers.length > 0) {
              const peerId = message.peers[0]; // 1:1 call
              await createPeerConnection(peerId);
              const offer = await peerConnection.createOffer();
              await peerConnection.setLocalDescription(offer);
              ws.send(
                JSON.stringify({
                  type: 'offer',
                  target: peerId,
                  sdp: peerConnection.localDescription,
                })
              );
              setStatus('Sending offer to peer...');
            }
            break;
          }

          case 'peer-joined': {
            // A new peer joined; wait for their offer
            setStatus('Peer joined. Waiting for offer...');
            break;
          }

          case 'offer': {
            await createPeerConnection(message.sender);
            await peerConnection.setRemoteDescription(
              new RTCSessionDescription(message.sdp)
            );
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            ws.send(
              JSON.stringify({
                type: 'answer',
                target: message.sender,
                sdp: peerConnection.localDescription,
              })
            );
            setStatus('Received offer. Sending answer...');
            break;
          }

          case 'answer': {
            await peerConnection.setRemoteDescription(
              new RTCSessionDescription(message.sdp)
            );
            setStatus('Answer received. Establishing connection...');
            break;
          }

          case 'candidate': {
            if (peerConnection) {
              await peerConnection.addIceCandidate(
                new RTCIceCandidate(message.candidate)
              );
            }
            break;
          }

          case 'peer-left': {
            setStatus('Peer disconnected');
            closePeerConnection();
            break;
          }
        }
      }

      // -------------------------------------------------------
      // Create RTCPeerConnection
      // -------------------------------------------------------
      async function createPeerConnection(peerId) {
        peerConnection = new RTCPeerConnection(rtcConfig);

        // Add local tracks
        localStream.getTracks().forEach((track) => {
          peerConnection.addTrack(track, localStream);
        });

        // Handle remote tracks
        peerConnection.ontrack = (event) => {
          document.getElementById('remoteVideo').srcObject = event.streams[0];
          setStatus('Connected! Video call in progress.');
        };

        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
          if (event.candidate) {
            ws.send(
              JSON.stringify({
                type: 'candidate',
                target: peerId,
                candidate: event.candidate,
              })
            );
          }
        };

        // Monitor connection state
        peerConnection.oniceconnectionstatechange = () => {
          const state = peerConnection.iceConnectionState;
          switch (state) {
            case 'checking':
              setStatus('Checking connectivity...');
              break;
            case 'connected':
              setStatus('Connected! Video call in progress.');
              break;
            case 'completed':
              setStatus('Connection established (optimal path found).');
              break;
            case 'disconnected':
              setStatus('Peer disconnected. Attempting to reconnect...');
              break;
            case 'failed':
              setStatus('Connection failed. Try refreshing.');
              break;
            case 'closed':
              setStatus('Connection closed.');
              break;
          }
        };

        // Handle negotiation needed (for renegotiation scenarios)
        peerConnection.onnegotiationneeded = async () => {
          // Only the offerer initiates renegotiation
          if (peerConnection.signalingState === 'stable') {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            ws.send(
              JSON.stringify({
                type: 'offer',
                target: peerId,
                sdp: peerConnection.localDescription,
              })
            );
          }
        };
      }

      // -------------------------------------------------------
      // Hang up
      // -------------------------------------------------------
      function hangUp() {
        closePeerConnection();
        if (localStream) {
          localStream.getTracks().forEach((track) => track.stop());
          localStream = null;
        }
        document.getElementById('localVideo').srcObject = null;
        document.getElementById('remoteVideo').srcObject = null;
        if (ws) {
          ws.close();
          ws = null;
        }
        document.getElementById('joinBtn').disabled = false;
        document.getElementById('hangUpBtn').disabled = true;
        setStatus('Call ended');
      }

      function closePeerConnection() {
        if (peerConnection) {
          peerConnection.close();
          peerConnection = null;
        }
        document.getElementById('remoteVideo').srcObject = null;
      }
    </script>
  </body>
</html>
```

### Running the Example

```bash
# 1. Install dependency
npm init -y
npm install ws

# 2. Start the signaling server
node server.js

# 3. Open two browser tabs to http://localhost:8080
# 4. Enter the same room name in both tabs
# 5. Click "Join Room" in both tabs
# 6. Allow camera/microphone permissions
# 7. Video call should establish automatically
```

### Full WebRTC Connection Establishment Sequence

```
Complete Connection Establishment Sequence
============================================

Tab A (Offerer)           Signaling Server           Tab B (Answerer)
     |                          |                          |
     |  1. getUserMedia()       |                          |
     |  (camera + mic)          |                          |
     |                          |                          |
     |  2. WebSocket connect -->|                          |
     |     join(room, idA)      |                          |
     |                          |                          |
     |                          |          3. getUserMedia()|
     |                          |          (camera + mic)   |
     |                          |                          |
     |                          |<-- WebSocket connect ----|
     |                          |    join(room, idB)       |
     |                          |                          |
     |  <-- existing-peers: []  |                          |
     |                          |-- peer-joined(idA) ----->|
     |                          |-- existing-peers:[idA] ->|
     |                          |                          |
     |                          |                   4. new RTCPeerConnection()
     |                          |                      addTrack() x2
     |                          |                      createOffer()
     |                          |                      setLocalDescription()
     |                          |                          |
     |                          |<--- offer(sdp, to:idA) --|
     |  <-- offer(sdp, from:idB)|                          |
     |                          |                          |
     |  5. new RTCPeerConnection()                         |
     |     addTrack() x2        |                          |
     |     setRemoteDescription()|                         |
     |     createAnswer()       |                          |
     |     setLocalDescription()|                          |
     |                          |                          |
     |  -- answer(sdp, to:idB)->|                          |
     |                          |-- answer(sdp,from:idA)-->|
     |                          |                   6. setRemoteDescription()
     |                          |                          |
     |  7. ICE gathering starts |          ICE gathering starts
     |     (host candidates)    |          (host candidates)
     |     (srflx via STUN)     |          (srflx via STUN)
     |     (relay via TURN)     |          (relay via TURN)
     |                          |                          |
     |  -- candidate(c1,to:idB)>|                          |
     |  -- candidate(c2,to:idB)>|-- candidate(c1,from:idA)>|
     |  -- candidate(c3,to:idB)>|-- candidate(c2,from:idA)>|
     |                          |-- candidate(c3,from:idA)>|
     |                          |                          |
     |                          |<-- candidate(c4,to:idA)--|
     |  <-- candidate(c4,frm:B)|<-- candidate(c5,to:idA)--|
     |  <-- candidate(c5,frm:B)|<-- candidate(c6,to:idA)--|
     |  <-- candidate(c6,frm:B)|                          |
     |                          |                          |
     |  8. ICE connectivity checks (STUN binding on each pair)
     |     A.host <----> B.host         (check)            |
     |     A.host <----> B.srflx        (check)            |
     |     A.srflx <---> B.host         (check)            |
     |     A.srflx <---> B.srflx        (check)            |
     |     A.relay <---> B.host         (check)            |
     |     ...                                             |
     |                          |                          |
     |  9. Best pair selected and nominated                |
     |     (e.g., A.host <-> B.host)                       |
     |                          |                          |
     | 10. DTLS handshake over the nominated pair          |
     |     ClientHello --------------------------------->  |
     |     <--------------------------- ServerHello       |
     |     <--------------------------- Certificate       |
     |     <--------------------------- ServerHelloDone   |
     |     ClientKeyExchange ----->                        |
     |     ChangeCipherSpec ------>                        |
     |     Finished --------------->                       |
     |     <--------------- ChangeCipherSpec               |
     |     <--------------- Finished                       |
     |                          |                          |
     | 11. SRTP keys derived from DTLS master secret       |
     |                          |                          |
     | 12. SRTP encrypted media flows bidirectionally      |
     |     [Audio SRTP] ===============================>   |
     |     [Video SRTP] ===============================>   |
     |     <============================== [Audio SRTP]    |
     |     <============================== [Video SRTP]    |
     |                          |                          |
     |  ontrack fires           |           ontrack fires  |
     |  remoteVideo.srcObject   |    remoteVideo.srcObject |
     |  = remote stream         |    = remote stream       |
     |                          |                          |
     |  CALL IS LIVE            |           CALL IS LIVE   |
```

---

## 13. Common Interview Questions

### Q1: What is the difference between STUN and TURN?

**STUN** (Session Traversal Utilities for NAT) helps a client discover its
public IP address and port mapping by sending a binding request to a STUN
server. The server simply reflects the source address back. STUN is
lightweight and does not relay traffic.

**TURN** (Traversal Using Relays around NAT) acts as a relay. When direct
connectivity between peers is impossible (e.g., symmetric NAT or restrictive
firewalls), media is routed through the TURN server. TURN is bandwidth-
intensive and more expensive to operate.

Key differences:

- STUN only discovers addresses; TURN relays traffic
- STUN is nearly free; TURN has significant bandwidth costs
- STUN fails with symmetric NAT; TURN always works
- About 80-85% of connections use STUN; 15-20% need TURN

---

### Q2: Why does WebRTC not define a signaling protocol?

WebRTC intentionally leaves signaling unspecified to enable:

- **Interoperability**: Integration with existing systems (SIP, XMPP, custom)
- **Flexibility**: Different use cases need different signaling (1:1, group, broadcast)
- **Separation of concerns**: Signaling is an application-level concern; WebRTC focuses on real-time media transport
- **Avoid redundancy**: Reliable messaging protocols already exist (WebSocket, HTTP)

Signaling must exchange SDP (session descriptions) and ICE candidates, but
the transport mechanism is left to the application developer.

---

### Q3: Explain the WebRTC offer/answer model.

The offer/answer model (based on RFC 3264, adapted for WebRTC by JSEP RFC 8829)
is a negotiation protocol:

1. The **offerer** calls `createOffer()` to generate an SDP describing their
   media capabilities (codecs, resolutions, ICE credentials, DTLS fingerprint).
2. The offerer calls `setLocalDescription(offer)` to apply it locally.
3. The SDP offer is sent to the answerer via the signaling channel.
4. The **answerer** calls `setRemoteDescription(offer)` to process the offer.
5. The answerer calls `createAnswer()` to generate a compatible SDP response.
6. The answerer calls `setLocalDescription(answer)` to apply it locally.
7. The SDP answer is sent back to the offerer.
8. The offerer calls `setRemoteDescription(answer)` to complete negotiation.

The answer is a subset of the offer: it selects compatible codecs, confirms
media directions, and provides the answerer's ICE credentials and DTLS
fingerprint.

---

### Q4: What is ICE and why is it necessary?

ICE (Interactive Connectivity Establishment, RFC 8445) is a framework for
finding the best network path between two peers, especially when one or both
are behind NATs or firewalls.

ICE is necessary because:

- Most devices are behind NAT (no directly reachable public IP)
- Different NAT types have different traversal requirements
- Firewalls may block incoming connections
- Multiple network interfaces may be available (WiFi, cellular, VPN)

ICE works by:

1. Gathering multiple candidates (host, server reflexive, relay)
2. Exchanging candidates via signaling
3. Performing connectivity checks on all candidate pairs
4. Selecting the best working pair (highest priority that succeeds)
5. Nominating that pair for media transport

---

### Q5: What is SDP and what role does it play in WebRTC?

SDP (Session Description Protocol) is a text-based format that describes
multimedia session parameters. In WebRTC, SDP carries:

- **Media descriptions**: Audio/video, codecs, payload types
- **Network information**: ICE candidates, connection addresses
- **Security**: DTLS fingerprints, SRTP parameters
- **Directionality**: sendrecv, sendonly, recvonly, inactive
- **Codec parameters**: Bitrate, sampling rate, FEC settings
- **Bundle grouping**: Which media share a transport
- **Stream identification**: MediaStream and track IDs

SDP is used in the offer/answer exchange to negotiate a compatible session
configuration between two peers.

---

### Q6: How does WebRTC ensure security?

WebRTC mandates encryption --- there is no way to send unencrypted media:

1. **DTLS** (Datagram Transport Layer Security) performs the key exchange
   between peers. Self-signed certificates are used; trust is established
   by verifying the certificate fingerprint included in the SDP.
2. **SRTP** (Secure Real-time Transport Protocol) encrypts media payloads
   using keys derived from the DTLS handshake (DTLS-SRTP).
3. **SRTCP** encrypts control protocol messages.
4. The **signaling channel** must be secured separately (typically via
   HTTPS/WSS) to prevent SDP tampering.
5. **Permissions**: Browsers require explicit user consent for camera/mic access.
6. **Same-origin policy**: Applies to screen sharing and other sensitive APIs.

---

### Q7: What is the difference between Plan B and Unified Plan?

**Plan B** (deprecated):

- Google's original approach
- Multiple tracks of the same media type share one `m=` section in SDP
- Distinguished by SSRC identifiers
- Not standardized, removed from modern browsers

**Unified Plan** (current standard, RFC 8829):

- Each track gets its own `m=` section
- Uses `a=mid` for identification and `a=msid` for stream association
- Supports mid-session track addition and removal
- Standardized and required by all modern browsers

All new WebRTC code should use Unified Plan.

---

### Q8: What happens when a peer changes networks (e.g., WiFi to cellular)?

When a network change occurs:

1. The existing ICE candidate pair becomes unreachable
2. `iceConnectionState` transitions to `disconnected`
3. ICE may attempt to find an alternative pair from existing candidates
4. If that fails, an **ICE restart** can be triggered:
   - Call `pc.restartIce()` or `createOffer({ iceRestart: true })`
   - New ICE credentials are generated
   - Fresh candidate gathering occurs on the new network
   - A new offer/answer exchange happens
5. The DTLS association is preserved across ICE restarts
6. Media resumes on the new path once a valid pair is found

---

### Q9: Explain the difference between SFU and MCU for multi-party calls.

**SFU (Selective Forwarding Unit)**:

- Receives media streams from each participant
- Forwards selected streams to other participants without transcoding
- Each receiver decides quality via simulcast/SVC layer selection
- Lower server CPU (no transcoding), higher client bandwidth
- Most popular architecture (used by Zoom, Google Meet, Discord)

**MCU (Multipoint Control Unit)**:

- Receives all streams, decodes them, composites into a single layout
- Each participant receives one combined stream
- Higher server CPU (decoding + encoding), lower client bandwidth
- Used when clients have limited bandwidth or processing power

**Mesh (pure P2P)**:

- Each participant connects directly to every other participant
- N-1 upload streams and N-1 download streams per participant
- No server cost but scales very poorly (practical limit: 3-4 peers)

---

### Q10: How do you debug WebRTC connection issues?

Key debugging tools and approaches:

1. **chrome://webrtc-internals**: The most important tool. Shows detailed
   stats for all RTCPeerConnections including ICE candidates, selected pairs,
   codec info, packet loss, jitter, and bandwidth graphs.

2. **RTCPeerConnection.getStats()**: Programmatic access to stats:

   ```javascript
   const stats = await pc.getStats();
   stats.forEach((report) => {
     if (report.type === 'candidate-pair' && report.nominated) {
       console.log('Selected pair:', report);
       console.log('RTT:', report.currentRoundTripTime);
     }
   });
   ```

3. **Checking ICE state transitions**: Monitor `iceConnectionState` and
   `iceGatheringState`. If ICE stays in `checking`, candidates are not
   reaching each other (signaling issue or firewall).

4. **SDP inspection**: Log and inspect the SDP offer/answer for missing
   codecs, wrong directions, or missing ICE candidates.

5. **Network conditions**: Use browser DevTools Network Throttling or
   `tc` (Linux traffic control) to simulate packet loss and latency.

6. **TURN server verification**: If connections fail, check if TURN is
   configured and working. Force relay-only mode with
   `iceTransportPolicy: 'relay'` to test.

---

### Q11: What is Trickle ICE?

Trickle ICE (RFC 8838) is an optimization that sends ICE candidates
incrementally as they are discovered, rather than waiting for all candidates
to be gathered before sending the SDP.

Without Trickle ICE (Vanilla ICE):

- Wait for all candidates (host, srflx, relay)
- Include all candidates in the SDP
- Send SDP with all candidates at once
- Connection establishment is slow (TURN allocation can take seconds)

With Trickle ICE:

- Send SDP immediately (may have zero candidates)
- Send each candidate separately as it is discovered via `onicecandidate`
- Remote peer adds candidates incrementally via `addIceCandidate()`
- Connectivity checks begin as soon as the first pair is available
- Much faster connection establishment

---

### Q12: What are RTCDataChannels and when would you use them?

RTCDataChannels provide peer-to-peer data transfer using SCTP over DTLS.
They support both reliable/ordered and unreliable/unordered modes.

Use cases:

- **Chat messages**: Reliable, ordered delivery
- **Game state**: Unreliable, unordered for low-latency updates
- **File transfer**: Reliable delivery with progress tracking
- **Remote control**: Low-latency command delivery
- **Collaborative editing**: Real-time document sync

Key features:

- Binary and text data support
- Configurable reliability (maxRetransmits, maxPacketLifeTime)
- Multiple concurrent channels on one connection
- No server bandwidth cost (peer-to-peer)
- Encrypted via DTLS

---

### Q13: How does WebRTC handle bandwidth adaptation?

WebRTC adapts to network conditions through several mechanisms:

1. **GCC (Google Congestion Control)**: Estimates available bandwidth using
   delay-based (inter-packet delay variation) and loss-based feedback.

2. **Simulcast**: Sender encodes 2-3 spatial layers (e.g., 180p, 360p, 720p).
   The SFU or receiver selects the appropriate layer based on bandwidth.

3. **SVC (Scalable Video Coding)**: Single bitstream with embeddable layers.
   Intermediate nodes can drop enhancement layers without transcoding.

4. **Dynamic resolution/framerate**: Encoder adjusts resolution and frame rate
   based on the bandwidth estimate.

5. **RTCP feedback**:

   - **REMB**: Receiver reports estimated maximum bitrate
   - **Transport-CC**: Per-packet arrival times for sender-side estimation
   - **NACK**: Request retransmission of lost packets
   - **PLI/FIR**: Request new keyframes when too much data is lost

6. **Codec bitrate adjustment**: Opus (audio) adjusts from 6 kbps to 510 kbps.
   VP8/VP9/H.264/AV1 adjust bitrate target in response to bandwidth changes.

---

### Q14: What is SRTP and why is it used instead of regular RTP?

RTP (Real-time Transport Protocol) sends media packets in the clear with no
encryption or authentication. SRTP (Secure RTP, RFC 3711) adds:

- **Confidentiality**: AES-128 Counter Mode encryption of the payload
  (header remains in the clear for routing)
- **Authentication**: HMAC-SHA1 tag covers header and encrypted payload,
  preventing tampering
- **Replay protection**: Sequence number tracking prevents replay attacks

WebRTC mandates SRTP --- plain RTP is not allowed. Keys are derived from the
DTLS handshake via the DTLS-SRTP key exporter, ensuring end-to-end encryption
without requiring a trusted certificate authority (self-signed certificates
with fingerprint verification).

---

### Q15: How would you implement a production WebRTC application?

A production WebRTC application requires:

1. **Signaling server**: WebSocket-based, handles room management, SDP
   exchange, and ICE candidate relay. Must support reconnection and
   authentication.

2. **TURN infrastructure**: Deploy coturn or use a managed service (Twilio,
   Xirsys). Configure both UDP and TCP/TLS transports. Budget for bandwidth.

3. **SFU for multi-party**: Use mediasoup, Janus, or a commercial SFU
   for calls with more than 2-3 participants. SFU handles simulcast selection,
   bandwidth estimation per receiver, and recording.

4. **Media quality monitoring**: Track `RTCPeerConnection.getStats()` metrics:
   packet loss, jitter, round-trip time, available bandwidth. Alert on
   degradation.

5. **Fallback strategies**: ICE restart on disconnection, TURN fallback when
   direct connectivity fails, codec fallback (VP8 as universal fallback).

6. **Testing**: Automated testing with Puppeteer/Playwright for media flow
   verification. Network condition simulation for reliability testing.

7. **Security**: Secure signaling (WSS/HTTPS), short-lived TURN credentials
   (TURN REST API, RFC 8489), rate limiting, room authentication.

8. **Client-side**: Handle permission prompts gracefully, device enumeration
   and switching, echo cancellation and noise suppression configuration,
   graceful degradation on constrained devices.

---

## Quick Reference Card

```
+----------------------------------------------------------------------+
|                     WEBRTC QUICK REFERENCE                            |
+----------------------------------------------------------------------+
|                                                                      |
|  PROTOCOLS                                                           |
|  ---------                                                           |
|  ICE   = Find the best path through NATs                             |
|  STUN  = Discover public IP:port (lightweight, reflection only)      |
|  TURN  = Relay traffic when direct path fails (expensive)            |
|  DTLS  = Key exchange and certificate verification (like TLS for UDP)|
|  SRTP  = Encrypt media packets (mandatory, no opt-out)               |
|  SCTP  = Data channel transport (reliable/unreliable)                |
|  SDP   = Session description format (codecs, candidates, crypto)     |
|                                                                      |
|  API METHODS (RTCPeerConnection)                                     |
|  --------------------------------                                    |
|  createOffer()           -> Generate SDP offer                       |
|  createAnswer()          -> Generate SDP answer                      |
|  setLocalDescription()   -> Apply local SDP + start ICE gathering    |
|  setRemoteDescription()  -> Apply remote SDP                         |
|  addIceCandidate()       -> Add remote ICE candidate                 |
|  addTrack()              -> Add media track to connection            |
|  addTransceiver()        -> Add transceiver (more control)           |
|  getSenders()            -> Get RTPSender objects                    |
|  getReceivers()          -> Get RTPReceiver objects                  |
|  getStats()              -> Get connection statistics                |
|  restartIce()            -> Trigger ICE restart                      |
|  close()                 -> Close the connection                     |
|                                                                      |
|  EVENTS (RTCPeerConnection)                                          |
|  ---------------------------                                         |
|  ontrack                 -> Remote track received                    |
|  onicecandidate          -> New local ICE candidate                  |
|  oniceconnectionstatechange -> ICE state changed                     |
|  onconnectionstatechange -> Overall state changed                    |
|  onnegotiationneeded     -> Renegotiation required                   |
|  ondatachannel           -> Remote data channel opened               |
|  onicegatheringstatechange -> Gathering state changed                |
|  onsignalingstatechange  -> Signaling state changed                  |
|                                                                      |
|  ICE CANDIDATE TYPES                                                 |
|  --------------------                                                |
|  host   = Local IP address          (highest priority)               |
|  srflx  = Public IP via STUN        (medium priority)                |
|  prflx  = Discovered during checks  (medium priority)                |
|  relay  = TURN server address        (lowest priority)               |
|                                                                      |
|  NAT TYPES (restrictiveness)                                         |
|  ---------------------------                                         |
|  Full Cone < Address-Restricted < Port-Restricted < Symmetric        |
|  (most open)                                      (most restrictive) |
|                                                                      |
|  OHHH-FFFFFFFF MOMENT NUMBERS                                        |
|  ----------------------------                                        |
|  ~80-85% connections succeed via STUN (no TURN needed)               |
|  ~15-20% connections require TURN relay                              |
|  ICE gathering: 100ms-3s typical                                     |
|  DTLS handshake: 100-500ms typical                                   |
|  Total connection time: 500ms-5s typical                             |
|  Opus audio: 6-510 kbps adaptive                                     |
|  VP8 720p video: 1-2.5 Mbps typical                                  |
|  H.264 720p video: 0.8-2 Mbps typical                                |
|  TURN bandwidth cost: $0.05-0.40/GB                                  |
|                                                                      |
+----------------------------------------------------------------------+
```
