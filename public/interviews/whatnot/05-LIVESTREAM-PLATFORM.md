# Design: Scalable Livestream Platform with Chat

> Whatnot's platform must deliver low-latency video AND real-time chat to audiences ranging from 50 to 583,000 concurrent viewers on a single stream.

## Problem Statement

Design a livestream platform that supports sellers broadcasting live video while thousands of viewers watch, bid, and chat in real-time. The system must gracefully scale from small intimate streams to viral events with hundreds of thousands of viewers.

---

## Step 1: Requirements

### Functional Requirements

- Sellers broadcast live video from mobile app
- Viewers watch with minimal latency (sub-second for small streams)
- Real-time chat alongside the video feed
- Auction overlay showing current bid, timer, item info
- Viewers can join/leave streams dynamically
- Multi-quality adaptive streaming based on viewer's connection

### Non-Functional Requirements

- **Video Latency**: < 500ms for small streams (WebRTC), < 5s for large (HLS)
- **Chat Latency**: < 200ms for message delivery
- **Scale**: 583K concurrent on single stream, 1.35M platform-wide
- **Availability**: 99.9% — stream downtime during an auction = lost sales
- **Reliability**: Auto-failover between streaming providers

### Out of Scope

- Video recording/VOD
- Content moderation ML
- Seller analytics dashboard

---

## Step 2: High-Level Design

```
┌──────────────────────────────────────────────────────────────────┐
│                         Seller (Mobile App)                      │
└──────────────────────────────┬───────────────────────────────────┘
                               │ WebRTC / RTMP
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                      Ingest Layer                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   WebRTC    │  │  Amazon     │  │   Agora     │              │
│  │  (Default)  │  │  IVS        │  │  (Massive)  │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└──────────────────────────────┬───────────────────────────────────┘
                               │
                    ┌──────────┼──────────┐
                    ▼          ▼          ▼
             ┌───────────┐ ┌────────┐ ┌───────────┐
             │ Transcode │ │  Edge  │ │   Chat    │
             │  Service  │ │  CDN   │ │  Service  │
             └─────┬─────┘ └───┬────┘ │ (Elixir)  │
                   │           │      └─────┬─────┘
                   ▼           ▼            ▼
             ┌───────────────────────────────────┐
             │          Viewer (Mobile App)       │
             │  Video + Chat + Auction Overlay    │
             └───────────────────────────────────┘
```

---

## Step 3: Deep Dive

### Multi-Vendor Streaming Architecture

Whatnot's key insight: **no single streaming provider handles all scenarios well.**

```
┌──────────────────────────────────────────────────┐
│              Stream Router Service                │
│                                                  │
│  Input: stream_id, viewer_count, region          │
│                                                  │
│  Rules:                                          │
│  ┌──────────────────────────────────────────┐    │
│  │ viewers < 1,000    → WebRTC (direct)     │    │
│  │ 1,000 - 50,000     → Amazon IVS          │    │
│  │ 50,000+            → Agora + IVS fallback│    │
│  │ IVS degraded       → Agora takeover      │    │
│  └──────────────────────────────────────────┘    │
│                                                  │
│  Health monitoring:                              │
│  - Per-provider error rates                      │
│  - Latency measurements                         │
│  - Viewer quality metrics                        │
└──────────────────────────────────────────────────┘
```

### Streaming Protocol Comparison

| Protocol                     | Latency | Scale           | Use Case               |
| ---------------------------- | ------- | --------------- | ---------------------- |
| **WebRTC**                   | < 500ms | ~1,000 viewers  | Small intimate streams |
| **Amazon IVS** (Low-latency) | 2-5s    | ~100K viewers   | Medium streams         |
| **Agora**                    | 1-3s    | 500K+ viewers   | Viral events (MrBeast) |
| **HLS/DASH**                 | 10-30s  | Unlimited (CDN) | Fallback / catch-up    |

### Dynamic Provider Switching

During the MrBeast event, Whatnot dynamically shifted viewers between providers:

```
Time 0:00   - Stream starts on WebRTC (100 viewers)
Time 0:05   - Viewers surge to 5,000 → Switch to IVS
Time 0:15   - Viewers hit 50,000 → Add Agora tier
Time 0:30   - IVS shows degradation → Migrate viewers to Agora
Time 1:00   - 583K viewers, 95% on Agora, 5% on IVS (backup)
Time 2:00   - Viewers drop to 20K → Scale back to IVS only
```

**Key challenge**: Switching providers mid-stream must be seamless to viewers (brief rebuffer acceptable, no dropped auction data).

### Chat System Architecture

The critical challenge: **chat messages compete with auction events for bandwidth.**

```
┌─────────────────────────────────────────────────────┐
│                 Chat Architecture                    │
│                                                     │
│  ┌─────────────┐     ┌──────────────┐              │
│  │   Client    │────→│  Phoenix     │              │
│  │  (App)      │     │  Channel     │              │
│  │             │←────│  (WebSocket) │              │
│  └─────────────┘     └──────┬───────┘              │
│                             │                       │
│                      ┌──────┴───────┐              │
│                      │  Priority    │              │
│                      │  Router      │              │
│                      └──────┬───────┘              │
│                             │                       │
│              ┌──────────────┼──────────────┐       │
│              ▼              ▼              ▼        │
│        ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│        │ CRITICAL │  │   HIGH   │  │   LOW    │   │
│        │          │  │          │  │          │   │
│        │ - Bids   │  │ - Chat   │  │ - Emoji  │   │
│        │ - Price  │  │   msgs   │  │ - Typing │   │
│        │ - Timer  │  │ - System │  │ - Join/  │   │
│        │ - Winner │  │   alerts │  │   Leave  │   │
│        └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────┘
```

### Chat Scaling Problem

```
Stream Size    Messages/sec    Fan-out/sec       Strategy
──────────────────────────────────────────────────────────
50 viewers     10 msg/s        500 msg/s         Direct broadcast
500 viewers    50 msg/s        25,000 msg/s      PubSub sharding
5,000 viewers  100 msg/s       500,000 msg/s     Sample + batch
50,000 viewers 500 msg/s       25,000,000 msg/s  Heavy sampling
500,000 viewers 1,000 msg/s   500,000,000 msg/s  Extreme sampling
```

### Chat Strategies by Scale

**Small streams (< 1,000 viewers)**:

- All messages delivered to all viewers
- No sampling needed
- Full interactivity

**Medium streams (1,000 - 50,000)**:

- Chat messages sampled (show 1 in N)
- All auction events delivered (never dropped)
- Viewer sees representative subset of chat

**Large streams (50,000+)**:

- Aggressive chat sampling (show 1 in 100)
- Batch chat updates every 500ms instead of real-time
- Auction events still delivered individually and instantly
- "Top chat" feature: surface high-engagement messages

```python
# Chat sampling algorithm
def should_deliver_message(
    message_type: str,
    viewer_count: int,
    user_is_seller: bool
) -> bool:
    # Always deliver auction events
    if message_type in ('bid', 'price_update', 'timer', 'winner'):
        return True

    # Always deliver seller messages
    if user_is_seller:
        return True

    # Sample rate based on viewer count
    if viewer_count < 1000:
        return True  # 100%
    elif viewer_count < 10000:
        return random.random() < 0.1  # 10%
    elif viewer_count < 100000:
        return random.random() < 0.01  # 1%
    else:
        return random.random() < 0.002  # 0.2%
```

### Admission Control Integration

For massive events, the Client Admission Service (Go) gates entry:

```
┌──────────┐     ┌──────────────┐     ┌──────────────┐
│  Client  │────→│  Admission   │────→│  Stream      │
│          │     │  Service     │     │  Service     │
│          │←────│              │     │              │
└──────────┘     └──────────────┘     └──────────────┘
                       │
                 Policies:
                 1. Global cap: 600K max
                 2. Rate limit: 1000 joins/sec
                 3. Identity-based shedding:
                    hash(user_id) % 100 < threshold
                 4. Queue overflow: "stream is full" UI
```

---

## Step 4: Scaling & Trade-offs

### Trade-offs

| Decision               | Choice                                 | Alternative       | Why                                         |
| ---------------------- | -------------------------------------- | ----------------- | ------------------------------------------- |
| WebRTC vs HLS          | **Both** (dynamic)                     | Single provider   | Different scale needs different protocols   |
| Chat fidelity vs scale | **Sampling at scale**                  | Full delivery     | 500M msg/s fan-out is physically impossible |
| Multi-vendor vs single | **Multi-vendor**                       | Single provider   | No single provider handles 583K well        |
| Latency vs scale       | **Latency for small, scale for large** | One-size-fits-all | Intimate streams need interactivity         |

### Architecture Principles (from Whatnot engineering)

1. **Design for the peak, not the average** - Every component must handle 3x normal load
2. **Graceful degradation** - Reduce chat fidelity before dropping auction events
3. **Multi-vendor resilience** - No single vendor dependency for streaming
4. **Priority-based resource allocation** - Auction events > chat > cosmetic features

### Monitoring

| Metric                               | Alert Threshold  |
| ------------------------------------ | ---------------- |
| Video rebuffer rate                  | > 1% of viewers  |
| Stream start failure rate            | > 0.5%           |
| Chat message delivery latency (p99)  | > 500ms          |
| Auction event delivery latency (p99) | > 100ms          |
| Provider error rate                  | > 2%             |
| WebSocket connection drops           | > 5% in 1 minute |
| Admission queue depth                | > 10,000         |

### What Changes at 10x Scale?

- **Edge computing**: Deploy stream relay nodes closer to viewers globally
- **Custom CDN**: Build purpose-built CDN for auction streams (not generic video CDN)
- **Tiered chat**: Separate chat channels for different engagement levels
- **Pre-warming**: Predictively scale infrastructure for scheduled viral events
- **Client-side rendering**: Move more UI state to client to reduce server messages
