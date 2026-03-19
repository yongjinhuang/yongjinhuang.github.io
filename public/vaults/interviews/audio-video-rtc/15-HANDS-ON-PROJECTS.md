# Hands-On Projects

Theory without practice is incomplete. This chapter provides structured, progressively
complex projects that exercise every layer of the media stack covered in this series.
Each project includes clear objectives, architecture overviews, step-by-step
implementation guidance, and extension challenges. By completing these projects, you
will have built real systems that demonstrate mastery of audio, video, and real-time
communication engineering.

---

## Project Structure

The projects are organized in four tiers of increasing complexity:

| Tier | Project                    | Key Skills                           | Estimated Time |
| ---- | -------------------------- | ------------------------------------ | -------------- |
| 1    | Custom HTML5 Video Player  | MSE, ABR, UI                         | 8-12 hours     |
| 2    | WebRTC Video Chat App      | Peer connections, signaling, ICE     | 12-16 hours    |
| 3    | Live Streaming Server      | FFmpeg, HLS/DASH, transcoding        | 16-24 hours    |
| 4    | Mini CDN with Edge Caching | Origin/edge, caching, load balancing | 20-30 hours    |

Each project builds on knowledge from previous ones. Tier 1 establishes client-side
fundamentals. Tier 2 introduces real-time communication. Tier 3 moves to server-side
media processing. Tier 4 combines everything into a distributed system.

---

## Project 1: Custom HTML5 Video Player with Adaptive Bitrate

### Objective

Build a fully custom video player from scratch using the Media Source Extensions (MSE)
API. The player will fetch fragmented MP4 (fMP4) segments, implement adaptive bitrate
(ABR) switching based on network conditions, and provide a polished UI with playback
controls, quality selection, and buffer visualization.

### Why This Project Matters

Every major streaming platform (YouTube, Netflix, Twitch) uses a custom player built
on MSE. Understanding how MSE works at the segment level -- how bytes are appended to
source buffers, how the browser's media pipeline processes them, and how ABR decisions
are made -- is foundational knowledge for any media engineer.

### Architecture

```
                    ┌─────────────────────────────────┐
                    │         Custom Video Player       │
                    │                                   │
┌──────────┐       │  ┌───────────┐   ┌─────────────┐ │
│  Origin   │◄─────┼──│  Fetcher  │──►│ Source Buffer│ │
│  Server   │ HTTP │  └───────────┘   └──────┬──────┘ │
│ (segments │      │  ┌───────────┐          │        │
│  + MPD)   │      │  │    ABR    │──────────┘        │
└──────────┘       │  │  Manager  │                   │
                    │  └───────────┘                   │
                    │  ┌───────────┐   ┌────────────┐ │
                    │  │  Buffer   │   │   Player   │ │
                    │  │  Monitor  │   │     UI     │ │
                    │  └───────────┘   └────────────┘ │
                    └─────────────────────────────────┘
```

### Prerequisites

- A set of fMP4 segments at multiple bitrates (we will create these with FFmpeg)
- A simple HTTP server (Python, Node.js, or nginx)
- Understanding of MSE concepts from [10-WEB-AUDIO-VIDEO-APIS.md](./10-WEB-AUDIO-VIDEO-APIS.md)

### Step 1: Prepare Media Segments

First, create a multi-bitrate encoding ladder from a source video and segment it into
fMP4 chunks.

```bash
# Download a test video (Big Buck Bunny, 1080p)
wget https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/1080/Big_Buck_Bunny_1080_10s_1MB.mp4 \
  -O source.mp4

# Or use any local video file you have

# Create encoding ladder with fragmented MP4 output
# 360p @ 800kbps
ffmpeg -i source.mp4 \
  -vf scale=640:360 -c:v libx264 -b:v 800k -preset medium \
  -c:a aac -b:a 96k \
  -movflags +frag_keyframe+empty_moov+default_base_moof \
  -frag_duration 2000000 \
  output_360p.mp4

# 720p @ 2500kbps
ffmpeg -i source.mp4 \
  -vf scale=1280:720 -c:v libx264 -b:v 2500k -preset medium \
  -c:a aac -b:a 128k \
  -movflags +frag_keyframe+empty_moov+default_base_moof \
  -frag_duration 2000000 \
  output_720p.mp4

# 1080p @ 5000kbps
ffmpeg -i source.mp4 \
  -vf scale=1920:1080 -c:v libx264 -b:v 5000k -preset medium \
  -c:a aac -b:a 128k \
  -movflags +frag_keyframe+empty_moov+default_base_moof \
  -frag_duration 2000000 \
  output_1080p.mp4
```

For segment-based fetching, split into individual segments:

```bash
# Segment each quality level into 2-second chunks
for quality in 360p 720p 1080p; do
  mkdir -p segments/${quality}
  ffmpeg -i output_${quality}.mp4 \
    -c copy \
    -f segment -segment_time 2 \
    -segment_format mp4 \
    -movflags +frag_keyframe+empty_moov+default_base_moof \
    segments/${quality}/seg_%03d.m4s

  # Extract initialization segment
  ffmpeg -i output_${quality}.mp4 \
    -c copy -t 0 \
    -movflags +frag_keyframe+empty_moov+default_base_moof \
    segments/${quality}/init.mp4
done
```

### Step 2: Build the MSE Player Core

Create the core player that uses MediaSource to append fMP4 segments to a video element.

```javascript
// player-core.js

class SegmentPlayer {
  constructor(videoElement) {
    this.video = videoElement;
    this.mediaSource = null;
    this.sourceBuffer = null;
    this.segmentQueue = [];
    this.isAppending = false;
    this.currentQuality = '720p';
    this.segmentIndex = 0;
    this.totalSegments = 0;
  }

  async initialize(qualities) {
    this.qualities = qualities;
    this.mediaSource = new MediaSource();
    this.video.src = URL.createObjectURL(this.mediaSource);

    return new Promise((resolve, reject) => {
      this.mediaSource.addEventListener('sourceopen', () => {
        const mimeType = 'video/mp4; codecs="avc1.64001f, mp4a.40.2"';

        if (!MediaSource.isTypeSupported(mimeType)) {
          reject(new Error(`Unsupported MIME type: ${mimeType}`));
          return;
        }

        this.sourceBuffer = this.mediaSource.addSourceBuffer(mimeType);
        this.sourceBuffer.mode = 'segments';

        this.sourceBuffer.addEventListener('updateend', () => {
          this.isAppending = false;
          this.processQueue();
        });

        resolve();
      });

      this.mediaSource.addEventListener('error', (e) => {
        reject(new Error(`MediaSource error: ${e}`));
      });
    });
  }

  async loadInitSegment(quality) {
    const url = `/segments/${quality}/init.mp4`;
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    this.appendBuffer(buffer);
  }

  async fetchSegment(quality, index) {
    const url = `/segments/${quality}/seg_${String(index).padStart(3, '0')}.m4s`;
    const response = await fetch(url);

    if (!response.ok) {
      return null; // No more segments
    }

    return response.arrayBuffer();
  }

  appendBuffer(data) {
    if (this.isAppending || this.sourceBuffer.updating) {
      this.segmentQueue.push(data);
      return;
    }

    this.isAppending = true;
    this.sourceBuffer.appendBuffer(data);
  }

  processQueue() {
    if (this.segmentQueue.length > 0 && !this.sourceBuffer.updating) {
      const next = this.segmentQueue.shift();
      this.isAppending = true;
      this.sourceBuffer.appendBuffer(next);
    }
  }

  async startPlayback() {
    await this.loadInitSegment(this.currentQuality);

    // Fetch first few segments to fill buffer
    for (let i = 0; i < 3; i++) {
      const data = await this.fetchSegment(this.currentQuality, i);
      if (data) {
        this.appendBuffer(data);
        this.segmentIndex = i + 1;
      }
    }

    this.video.play();
    this.startBufferMonitor();
  }

  startBufferMonitor() {
    setInterval(async () => {
      const buffered = this.getBufferedAhead();

      // If less than 10 seconds buffered ahead, fetch more
      if (buffered < 10) {
        const data = await this.fetchSegment(
          this.currentQuality,
          this.segmentIndex
        );
        if (data) {
          this.appendBuffer(data);
          this.segmentIndex++;
        } else if (
          this.segmentQueue.length === 0 &&
          !this.sourceBuffer.updating
        ) {
          this.mediaSource.endOfStream();
        }
      }
    }, 1000);
  }

  getBufferedAhead() {
    if (this.sourceBuffer.buffered.length === 0) return 0;
    const currentTime = this.video.currentTime;
    const bufferedEnd = this.sourceBuffer.buffered.end(
      this.sourceBuffer.buffered.length - 1
    );
    return bufferedEnd - currentTime;
  }
}
```

### Step 3: Implement ABR Logic

The ABR manager monitors download speed and buffer health to decide when to switch
quality levels.

```javascript
// abr-manager.js

class ABRManager {
  constructor(player) {
    this.player = player;
    this.bandwidthEstimates = [];
    this.maxSamples = 10;
    this.qualities = [
      { name: '360p', bitrate: 800000 },
      { name: '720p', bitrate: 2500000 },
      { name: '1080p', bitrate: 5000000 },
    ];
  }

  recordDownload(bytes, durationMs) {
    const bitsPerSecond = (bytes * 8) / (durationMs / 1000);
    this.bandwidthEstimates.push(bitsPerSecond);

    if (this.bandwidthEstimates.length > this.maxSamples) {
      this.bandwidthEstimates.shift();
    }
  }

  getEstimatedBandwidth() {
    if (this.bandwidthEstimates.length === 0) return Infinity;

    // Use harmonic mean -- more conservative than arithmetic mean,
    // better for bandwidth estimation
    const harmonicMean =
      this.bandwidthEstimates.length /
      this.bandwidthEstimates.reduce((sum, bw) => sum + 1 / bw, 0);

    return harmonicMean;
  }

  selectQuality() {
    const bandwidth = this.getEstimatedBandwidth();
    const bufferHealth = this.player.getBufferedAhead();

    // Safety factor: only use 70% of estimated bandwidth
    const safeBandwidth = bandwidth * 0.7;

    // Buffer-based adjustments
    let qualityIndex = 0;

    for (let i = this.qualities.length - 1; i >= 0; i--) {
      if (this.qualities[i].bitrate < safeBandwidth) {
        qualityIndex = i;
        break;
      }
    }

    // If buffer is critically low, drop quality aggressively
    if (bufferHealth < 3) {
      qualityIndex = Math.max(0, qualityIndex - 1);
    }

    // If buffer is healthy, allow quality increase
    if (bufferHealth > 15) {
      qualityIndex = Math.min(this.qualities.length - 1, qualityIndex + 1);
    }

    return this.qualities[qualityIndex].name;
  }

  async fetchWithMeasurement(url) {
    const startTime = performance.now();
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    const endTime = performance.now();

    this.recordDownload(buffer.byteLength, endTime - startTime);

    return buffer;
  }
}
```

### Step 4: Build the Player UI

```html
<!-- player.html -->
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Custom ABR Video Player</title>
    <style>
      .player-container {
        position: relative;
        max-width: 960px;
        margin: 0 auto;
        background: #000;
        border-radius: 8px;
        overflow: hidden;
      }

      video {
        width: 100%;
        display: block;
      }

      .controls {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        background: linear-gradient(transparent, rgba(0, 0, 0, 0.8));
        padding: 20px 16px 12px;
        display: flex;
        align-items: center;
        gap: 12px;
        opacity: 0;
        transition: opacity 0.3s;
      }

      .player-container:hover .controls {
        opacity: 1;
      }

      .progress-bar {
        flex: 1;
        height: 4px;
        background: rgba(255, 255, 255, 0.3);
        border-radius: 2px;
        cursor: pointer;
        position: relative;
      }

      .progress-buffered {
        position: absolute;
        top: 0;
        left: 0;
        height: 100%;
        background: rgba(255, 255, 255, 0.4);
        border-radius: 2px;
      }

      .progress-played {
        position: absolute;
        top: 0;
        left: 0;
        height: 100%;
        background: #e74c3c;
        border-radius: 2px;
      }

      .control-btn {
        background: none;
        border: none;
        color: white;
        font-size: 18px;
        cursor: pointer;
        padding: 4px 8px;
      }

      .quality-selector {
        background: rgba(0, 0, 0, 0.6);
        color: white;
        border: 1px solid rgba(255, 255, 255, 0.3);
        border-radius: 4px;
        padding: 4px 8px;
        font-size: 12px;
      }

      .stats-overlay {
        position: absolute;
        top: 10px;
        right: 10px;
        background: rgba(0, 0, 0, 0.7);
        color: #0f0;
        font-family: monospace;
        font-size: 11px;
        padding: 8px 12px;
        border-radius: 4px;
        display: none;
        line-height: 1.6;
      }

      .stats-overlay.visible {
        display: block;
      }
    </style>
  </head>
  <body>
    <div class="player-container">
      <video id="video" playsinline></video>

      <div class="stats-overlay" id="stats">
        <div>Quality: <span id="stat-quality">-</span></div>
        <div>Buffer: <span id="stat-buffer">-</span>s</div>
        <div>Bandwidth: <span id="stat-bandwidth">-</span> Mbps</div>
        <div>Dropped Frames: <span id="stat-dropped">-</span></div>
      </div>

      <div class="controls">
        <button class="control-btn" id="playPause">▶</button>

        <div class="progress-bar" id="progressBar">
          <div class="progress-buffered" id="buffered"></div>
          <div class="progress-played" id="played"></div>
        </div>

        <span style="color:white; font-size:12px" id="timeDisplay"
          >0:00 / 0:00</span
        >

        <select class="quality-selector" id="qualitySelect">
          <option value="auto">Auto</option>
          <option value="360p">360p</option>
          <option value="720p">720p</option>
          <option value="1080p">1080p</option>
        </select>

        <button class="control-btn" id="statsToggle">📊</button>
      </div>
    </div>

    <script src="player-core.js"></script>
    <script src="abr-manager.js"></script>
    <script src="player-ui.js"></script>
  </body>
</html>
```

```javascript
// player-ui.js

document.addEventListener('DOMContentLoaded', async () => {
  const video = document.getElementById('video');
  const player = new SegmentPlayer(video);
  const abr = new ABRManager(player);

  // Initialize player
  await player.initialize({
    '360p': { bitrate: 800000 },
    '720p': { bitrate: 2500000 },
    '1080p': { bitrate: 5000000 },
  });

  await player.startPlayback();

  // Play/Pause
  const playPauseBtn = document.getElementById('playPause');
  playPauseBtn.addEventListener('click', () => {
    if (video.paused) {
      video.play();
      playPauseBtn.textContent = '⏸';
    } else {
      video.pause();
      playPauseBtn.textContent = '▶';
    }
  });

  // Progress bar
  const progressBar = document.getElementById('progressBar');
  progressBar.addEventListener('click', (e) => {
    const rect = progressBar.getBoundingClientRect();
    const fraction = (e.clientX - rect.left) / rect.width;
    video.currentTime = fraction * video.duration;
  });

  // Quality selector
  const qualitySelect = document.getElementById('qualitySelect');
  qualitySelect.addEventListener('change', (e) => {
    if (e.target.value === 'auto') {
      player.autoQuality = true;
    } else {
      player.autoQuality = false;
      player.switchQuality(e.target.value);
    }
  });

  // Stats toggle
  const statsToggle = document.getElementById('statsToggle');
  const statsOverlay = document.getElementById('stats');
  statsToggle.addEventListener('click', () => {
    statsOverlay.classList.toggle('visible');
  });

  // Update UI loop
  setInterval(() => {
    // Progress bars
    if (video.duration) {
      const playedPct = (video.currentTime / video.duration) * 100;
      document.getElementById('played').style.width = `${playedPct}%`;

      if (video.buffered.length > 0) {
        const bufferedEnd = video.buffered.end(video.buffered.length - 1);
        const bufferedPct = (bufferedEnd / video.duration) * 100;
        document.getElementById('buffered').style.width = `${bufferedPct}%`;
      }
    }

    // Time display
    const formatTime = (s) => {
      const m = Math.floor(s / 60);
      const sec = Math.floor(s % 60);
      return `${m}:${String(sec).padStart(2, '0')}`;
    };
    document.getElementById('timeDisplay').textContent =
      `${formatTime(video.currentTime)} / ${formatTime(video.duration || 0)}`;

    // Stats
    document.getElementById('stat-quality').textContent = player.currentQuality;
    document.getElementById('stat-buffer').textContent = player
      .getBufferedAhead()
      .toFixed(1);
    document.getElementById('stat-bandwidth').textContent = (
      abr.getEstimatedBandwidth() / 1000000
    ).toFixed(2);

    const quality = video.getVideoPlaybackQuality?.();
    if (quality) {
      document.getElementById('stat-dropped').textContent =
        quality.droppedVideoFrames;
    }
  }, 250);
});
```

### Step 5: Serve and Test

```bash
# Simple Python HTTP server with CORS
python3 -c "
from http.server import HTTPServer, SimpleHTTPRequestHandler
class CORSHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET')
        super().end_headers()
HTTPServer(('', 8080), CORSHandler).serve_forever()
"
```

Open `http://localhost:8080/player.html` and verify:

- Video plays smoothly
- Progress bar and time display update correctly
- Buffer visualization reflects actual buffer state
- Quality can be switched manually via the selector
- Stats overlay shows real-time metrics

### Extension Challenges

1. **Implement quality switching with seamless transition**: When ABR decides to switch
   quality, you need to handle the init segment for the new quality, find the correct
   segment number based on current playback time, and append without a visible glitch.
   This requires using `SourceBuffer.changeType()` or managing multiple source buffers.

2. **Add keyboard shortcuts**: Space for play/pause, F for fullscreen, left/right
   arrows for seeking, up/down for volume.

3. **Implement a seek bar with thumbnail previews**: Generate thumbnail sprites using
   FFmpeg (`-vf fps=1,scale=160:-1,tile=10x10`) and display them on hover over the
   progress bar.

4. **Add DASH manifest parsing**: Instead of hardcoded segment paths, parse an MPD
   manifest file to discover available qualities and segment URLs.

5. **Implement bandwidth throttling simulation**: Add a developer control to simulate
   different network speeds and observe ABR behavior in real time.

---

## Project 2: WebRTC Video Chat Application

### Objective

Build a complete 1-to-1 video chat application using WebRTC with a custom signaling
server. The application will support camera/microphone capture, peer connection
establishment via ICE, quality monitoring, screen sharing, and text chat via data
channels.

### Why This Project Matters

WebRTC is the foundation of all browser-based real-time communication. Building a
video chat app from scratch forces you to understand the complete WebRTC lifecycle:
media capture, SDP offer/answer exchange, ICE candidate gathering, DTLS/SRTP setup,
and ongoing quality monitoring. This is knowledge that directly transfers to working
with any WebRTC-based platform.

### Architecture

```
┌──────────────┐                              ┌──────────────┐
│   Browser A  │                              │   Browser B  │
│              │                              │              │
│ getUserMedia │         Signaling            │ getUserMedia │
│      │       │    ┌────Server────┐          │      │       │
│      ▼       │    │  (WebSocket) │          │      ▼       │
│ PeerConn  ◄──┼────┤  SDP relay   ├─────────►  PeerConn    │
│   │  │  │    │    │  ICE relay   │          │   │  │  │    │
│   │  │  │    │    └──────────────┘          │   │  │  │    │
│   │  │  └────┼──── Data Channel ────────────┼───┘  │  │    │
│   │  └───────┼──── Audio (SRTP) ────────────┼──────┘  │    │
│   └──────────┼──── Video (SRTP) ────────────┼─────────┘    │
│              │                              │              │
│     STUN/TURN negotiation                   │              │
│     via ICE candidates                      │              │
└──────────────┘                              └──────────────┘
```

### Step 1: Signaling Server

The signaling server relays SDP offers/answers and ICE candidates between peers.
WebRTC does not define a signaling protocol, so we use WebSocket.

```javascript
// signaling-server.js (Node.js)
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
  // Serve static files for the client
  const filePath = path.join(
    __dirname,
    'public',
    req.url === '/' ? 'index.html' : req.url
  );
  const ext = path.extname(filePath);
  const contentTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
  };

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'text/plain' });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });

// Simple room-based signaling
const rooms = new Map();

wss.on('connection', (ws) => {
  let currentRoom = null;
  let peerId = null;

  ws.on('message', (raw) => {
    const message = JSON.parse(raw);

    switch (message.type) {
      case 'join': {
        currentRoom = message.room;
        peerId = message.peerId;

        if (!rooms.has(currentRoom)) {
          rooms.set(currentRoom, new Map());
        }

        const room = rooms.get(currentRoom);
        room.set(peerId, ws);

        // Notify other peers in the room
        room.forEach((peerWs, id) => {
          if (id !== peerId) {
            peerWs.send(
              JSON.stringify({
                type: 'peer-joined',
                peerId: peerId,
              })
            );
          }
        });

        // Tell the joiner about existing peers
        const existingPeers = Array.from(room.keys()).filter(
          (id) => id !== peerId
        );
        ws.send(
          JSON.stringify({
            type: 'room-peers',
            peers: existingPeers,
          })
        );
        break;
      }

      case 'offer':
      case 'answer':
      case 'ice-candidate': {
        // Relay to target peer
        const room = rooms.get(currentRoom);
        if (room) {
          const targetWs = room.get(message.targetPeerId);
          if (targetWs && targetWs.readyState === WebSocket.OPEN) {
            targetWs.send(
              JSON.stringify({
                ...message,
                fromPeerId: peerId,
              })
            );
          }
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    if (currentRoom && rooms.has(currentRoom)) {
      const room = rooms.get(currentRoom);
      room.delete(peerId);

      // Notify remaining peers
      room.forEach((peerWs) => {
        peerWs.send(
          JSON.stringify({
            type: 'peer-left',
            peerId: peerId,
          })
        );
      });

      if (room.size === 0) {
        rooms.delete(currentRoom);
      }
    }
  });
});

server.listen(3000, () => {
  console.log('Signaling server running on http://localhost:3000');
});
```

### Step 2: WebRTC Client

```javascript
// webrtc-client.js

class WebRTCClient {
  constructor() {
    this.localStream = null;
    this.peerConnection = null;
    this.dataChannel = null;
    this.ws = null;
    this.peerId = crypto.randomUUID();
    this.remotePeerId = null;

    this.iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      // Add TURN server for production:
      // {
      //   urls: 'turn:your-turn-server.com:3478',
      //   username: 'user',
      //   credential: 'pass',
      // },
    ];

    this.onRemoteStream = null;
    this.onDataMessage = null;
    this.onConnectionStateChange = null;
  }

  async captureMedia(constraints) {
    this.localStream = await navigator.mediaDevices.getUserMedia(
      constraints || { video: true, audio: true }
    );
    return this.localStream;
  }

  connectSignaling(serverUrl, room) {
    this.ws = new WebSocket(serverUrl);

    this.ws.onopen = () => {
      this.ws.send(
        JSON.stringify({
          type: 'join',
          room: room,
          peerId: this.peerId,
        })
      );
    };

    this.ws.onmessage = async (event) => {
      const message = JSON.parse(event.data);
      await this.handleSignalingMessage(message);
    };
  }

  async handleSignalingMessage(message) {
    switch (message.type) {
      case 'room-peers':
        // If there are existing peers, initiate a call to the first one
        if (message.peers.length > 0) {
          this.remotePeerId = message.peers[0];
          await this.createOffer();
        }
        break;

      case 'peer-joined':
        // A new peer joined -- they will send us an offer
        this.remotePeerId = message.peerId;
        break;

      case 'offer':
        this.remotePeerId = message.fromPeerId;
        await this.handleOffer(message.sdp);
        break;

      case 'answer':
        await this.handleAnswer(message.sdp);
        break;

      case 'ice-candidate':
        await this.handleIceCandidate(message.candidate);
        break;

      case 'peer-left':
        this.handlePeerDisconnect();
        break;
    }
  }

  createPeerConnection() {
    this.peerConnection = new RTCPeerConnection({
      iceServers: this.iceServers,
    });

    // Add local tracks to the connection
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        this.peerConnection.addTrack(track, this.localStream);
      });
    }

    // Handle incoming remote tracks
    this.peerConnection.ontrack = (event) => {
      if (this.onRemoteStream) {
        this.onRemoteStream(event.streams[0]);
      }
    };

    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.ws.send(
          JSON.stringify({
            type: 'ice-candidate',
            candidate: event.candidate,
            targetPeerId: this.remotePeerId,
          })
        );
      }
    };

    // Monitor connection state
    this.peerConnection.onconnectionstatechange = () => {
      if (this.onConnectionStateChange) {
        this.onConnectionStateChange(this.peerConnection.connectionState);
      }
    };

    // Create data channel for text chat
    this.dataChannel = this.peerConnection.createDataChannel('chat', {
      ordered: true,
    });

    this.dataChannel.onmessage = (event) => {
      if (this.onDataMessage) {
        this.onDataMessage(event.data);
      }
    };

    // Handle incoming data channels
    this.peerConnection.ondatachannel = (event) => {
      this.dataChannel = event.channel;
      this.dataChannel.onmessage = (e) => {
        if (this.onDataMessage) {
          this.onDataMessage(e.data);
        }
      };
    };

    return this.peerConnection;
  }

  async createOffer() {
    this.createPeerConnection();

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);

    this.ws.send(
      JSON.stringify({
        type: 'offer',
        sdp: offer,
        targetPeerId: this.remotePeerId,
      })
    );
  }

  async handleOffer(sdp) {
    this.createPeerConnection();

    await this.peerConnection.setRemoteDescription(
      new RTCSessionDescription(sdp)
    );

    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);

    this.ws.send(
      JSON.stringify({
        type: 'answer',
        sdp: answer,
        targetPeerId: this.remotePeerId,
      })
    );
  }

  async handleAnswer(sdp) {
    await this.peerConnection.setRemoteDescription(
      new RTCSessionDescription(sdp)
    );
  }

  async handleIceCandidate(candidate) {
    if (this.peerConnection) {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }

  sendMessage(text) {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(text);
    }
  }

  async startScreenShare() {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
    });

    const screenTrack = screenStream.getVideoTracks()[0];
    const sender = this.peerConnection
      .getSenders()
      .find((s) => s.track?.kind === 'video');

    if (sender) {
      await sender.replaceTrack(screenTrack);
    }

    // Revert to camera when screen share stops
    screenTrack.onended = async () => {
      const cameraTrack = this.localStream.getVideoTracks()[0];
      if (sender) {
        await sender.replaceTrack(cameraTrack);
      }
    };

    return screenStream;
  }

  getStats() {
    if (!this.peerConnection) return Promise.resolve(null);
    return this.peerConnection.getStats();
  }

  handlePeerDisconnect() {
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    this.remotePeerId = null;
  }

  disconnect() {
    this.handlePeerDisconnect();
    if (this.ws) {
      this.ws.close();
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
    }
  }
}
```

### Step 3: Connection Quality Monitor

```javascript
// stats-monitor.js

class StatsMonitor {
  constructor(client, updateInterval) {
    this.client = client;
    this.interval = updateInterval || 1000;
    this.previousStats = null;
    this.onStatsUpdate = null;
    this.timer = null;
  }

  start() {
    this.timer = setInterval(async () => {
      const stats = await this.client.getStats();
      if (!stats) return;

      const report = this.parseStats(stats);
      if (this.onStatsUpdate) {
        this.onStatsUpdate(report);
      }

      this.previousStats = stats;
    }, this.interval);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  parseStats(stats) {
    const report = {
      video: { bytesSent: 0, bytesReceived: 0, frameRate: 0, resolution: '' },
      audio: { bytesSent: 0, bytesReceived: 0 },
      connection: { rtt: 0, packetLoss: 0, candidateType: '' },
    };

    stats.forEach((stat) => {
      if (stat.type === 'outbound-rtp' && stat.kind === 'video') {
        report.video.bytesSent = stat.bytesSent;
        report.video.frameRate = stat.framesPerSecond || 0;
        report.video.resolution = `${stat.frameWidth}x${stat.frameHeight}`;
      }

      if (stat.type === 'inbound-rtp' && stat.kind === 'video') {
        report.video.bytesReceived = stat.bytesReceived;
        report.video.packetsLost = stat.packetsLost || 0;
        report.video.jitter = stat.jitter || 0;
      }

      if (stat.type === 'inbound-rtp' && stat.kind === 'audio') {
        report.audio.bytesReceived = stat.bytesReceived;
      }

      if (stat.type === 'candidate-pair' && stat.state === 'succeeded') {
        report.connection.rtt = stat.currentRoundTripTime * 1000;
        report.connection.candidateType = stat.localCandidateId;
      }
    });

    return report;
  }
}
```

### Step 4: Client UI

```html
<!-- public/index.html -->
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>WebRTC Video Chat</title>
    <style>
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }
      body {
        font-family: sans-serif;
        background: #1a1a2e;
        color: #eee;
      }

      .app {
        display: flex;
        flex-direction: column;
        height: 100vh;
      }

      .header {
        padding: 12px 20px;
        background: #16213e;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .video-grid {
        flex: 1;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        padding: 8px;
      }

      .video-container {
        position: relative;
        background: #0f0f23;
        border-radius: 8px;
        overflow: hidden;
      }

      .video-container video {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .video-label {
        position: absolute;
        bottom: 8px;
        left: 8px;
        background: rgba(0, 0, 0, 0.6);
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
      }

      .toolbar {
        display: flex;
        justify-content: center;
        gap: 12px;
        padding: 16px;
        background: #16213e;
      }

      .toolbar button {
        padding: 12px 20px;
        border: none;
        border-radius: 50px;
        font-size: 14px;
        cursor: pointer;
        transition: background 0.2s;
      }

      .btn-primary {
        background: #0f3460;
        color: white;
      }
      .btn-danger {
        background: #e94560;
        color: white;
      }
      .btn-secondary {
        background: #333;
        color: white;
      }

      .chat-panel {
        position: fixed;
        right: 0;
        top: 0;
        bottom: 0;
        width: 300px;
        background: #16213e;
        display: flex;
        flex-direction: column;
        transform: translateX(100%);
        transition: transform 0.3s;
      }

      .chat-panel.open {
        transform: translateX(0);
      }

      .chat-messages {
        flex: 1;
        overflow-y: auto;
        padding: 12px;
      }

      .chat-input {
        display: flex;
        padding: 12px;
        gap: 8px;
      }

      .chat-input input {
        flex: 1;
        padding: 8px;
        border: 1px solid #333;
        border-radius: 4px;
        background: #0f0f23;
        color: white;
      }

      .stats-panel {
        position: fixed;
        left: 10px;
        bottom: 80px;
        background: rgba(0, 0, 0, 0.8);
        padding: 12px;
        border-radius: 8px;
        font-family: monospace;
        font-size: 11px;
        display: none;
      }

      .stats-panel.visible {
        display: block;
      }

      .join-screen {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100vh;
        gap: 16px;
      }

      .join-screen input {
        padding: 12px 20px;
        border: 1px solid #333;
        border-radius: 8px;
        background: #0f0f23;
        color: white;
        font-size: 16px;
        width: 300px;
      }
    </style>
  </head>
  <body>
    <div id="joinScreen" class="join-screen">
      <h1>WebRTC Video Chat</h1>
      <input type="text" id="roomInput" placeholder="Enter room name" />
      <button
        class="btn-primary"
        id="joinBtn"
        style="padding:12px 40px;font-size:16px"
      >
        Join Room
      </button>
    </div>

    <div id="callScreen" class="app" style="display:none">
      <div class="header">
        <span>Room: <strong id="roomName"></strong></span>
        <span id="connectionState">Waiting for peer...</span>
      </div>

      <div class="video-grid">
        <div class="video-container">
          <video id="localVideo" autoplay playsinline muted></video>
          <span class="video-label">You</span>
        </div>
        <div class="video-container">
          <video id="remoteVideo" autoplay playsinline></video>
          <span class="video-label">Remote</span>
        </div>
      </div>

      <div class="toolbar">
        <button class="btn-secondary" id="toggleAudio">Mute Audio</button>
        <button class="btn-secondary" id="toggleVideo">Mute Video</button>
        <button class="btn-secondary" id="shareScreen">Share Screen</button>
        <button class="btn-secondary" id="toggleChat">Chat</button>
        <button class="btn-secondary" id="toggleStats">Stats</button>
        <button class="btn-danger" id="hangUp">Hang Up</button>
      </div>

      <div class="chat-panel" id="chatPanel">
        <div class="chat-messages" id="chatMessages"></div>
        <div class="chat-input">
          <input type="text" id="chatInput" placeholder="Type a message..." />
          <button class="btn-primary" id="chatSend">Send</button>
        </div>
      </div>

      <div class="stats-panel" id="statsPanel">
        <div>RTT: <span id="statRtt">-</span>ms</div>
        <div>
          Video: <span id="statResolution">-</span> @
          <span id="statFps">-</span>fps
        </div>
        <div>Packets lost: <span id="statLost">-</span></div>
        <div>Jitter: <span id="statJitter">-</span>ms</div>
      </div>
    </div>

    <script src="webrtc-client.js"></script>
    <script src="stats-monitor.js"></script>
    <script>
      const client = new WebRTCClient();
      const monitor = new StatsMonitor(client);

      const joinBtn = document.getElementById('joinBtn');
      const roomInput = document.getElementById('roomInput');

      joinBtn.addEventListener('click', async () => {
        const room = roomInput.value.trim();
        if (!room) return;

        // Capture local media
        const stream = await client.captureMedia({
          video: { width: 1280, height: 720 },
          audio: true,
        });
        document.getElementById('localVideo').srcObject = stream;

        // Connect signaling
        const wsUrl = `ws://${window.location.host}`;
        client.connectSignaling(wsUrl, room);

        // Handle remote stream
        client.onRemoteStream = (remoteStream) => {
          document.getElementById('remoteVideo').srcObject = remoteStream;
        };

        // Handle connection state
        client.onConnectionStateChange = (state) => {
          document.getElementById('connectionState').textContent = state;
        };

        // Handle incoming chat messages
        client.onDataMessage = (text) => {
          appendChatMessage('Remote', text);
        };

        // Show call screen
        document.getElementById('joinScreen').style.display = 'none';
        document.getElementById('callScreen').style.display = 'flex';
        document.getElementById('roomName').textContent = room;

        // Start stats monitoring
        monitor.onStatsUpdate = (report) => {
          document.getElementById('statRtt').textContent =
            report.connection.rtt.toFixed(0);
          document.getElementById('statResolution').textContent =
            report.video.resolution;
          document.getElementById('statFps').textContent =
            report.video.frameRate;
          document.getElementById('statLost').textContent =
            report.video.packetsLost || 0;
          document.getElementById('statJitter').textContent = (
            (report.video.jitter || 0) * 1000
          ).toFixed(1);
        };
        monitor.start();
      });

      // Toolbar handlers
      document
        .getElementById('toggleAudio')
        .addEventListener('click', function () {
          const audioTrack = client.localStream?.getAudioTracks()[0];
          if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            this.textContent = audioTrack.enabled
              ? 'Mute Audio'
              : 'Unmute Audio';
          }
        });

      document
        .getElementById('toggleVideo')
        .addEventListener('click', function () {
          const videoTrack = client.localStream?.getVideoTracks()[0];
          if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            this.textContent = videoTrack.enabled
              ? 'Mute Video'
              : 'Unmute Video';
          }
        });

      document.getElementById('shareScreen').addEventListener('click', () => {
        client.startScreenShare();
      });

      document.getElementById('toggleChat').addEventListener('click', () => {
        document.getElementById('chatPanel').classList.toggle('open');
      });

      document.getElementById('toggleStats').addEventListener('click', () => {
        document.getElementById('statsPanel').classList.toggle('visible');
      });

      document.getElementById('hangUp').addEventListener('click', () => {
        monitor.stop();
        client.disconnect();
        window.location.reload();
      });

      // Chat
      document.getElementById('chatSend').addEventListener('click', sendChat);
      document.getElementById('chatInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendChat();
      });

      function sendChat() {
        const input = document.getElementById('chatInput');
        const text = input.value.trim();
        if (!text) return;
        client.sendMessage(text);
        appendChatMessage('You', text);
        input.value = '';
      }

      function appendChatMessage(sender, text) {
        const container = document.getElementById('chatMessages');
        const msg = document.createElement('div');
        msg.style.marginBottom = '8px';
        msg.innerHTML = `<strong>${sender}:</strong> ${text}`;
        container.appendChild(msg);
        container.scrollTop = container.scrollHeight;
      }
    </script>
  </body>
</html>
```

### Testing the Application

```bash
# Install dependencies
npm init -y
npm install ws

# Start the server
node signaling-server.js

# Open two browser tabs to http://localhost:3000
# Enter the same room name in both tabs and click Join
```

### Extension Challenges

1. **Add TURN server support**: Deploy a TURN server using coturn and configure the
   client to use it. Test connectivity across NAT boundaries.

2. **Implement simulcast**: Send multiple quality layers from the sender so the
   receiver (or an SFU) can select the appropriate layer based on network conditions.
   Use `RTCRtpSender.setParameters()` to configure encoding layers.

3. **Add recording**: Use `MediaRecorder` API to record both local and remote streams
   to WebM files. Implement server-side recording by forwarding media to FFmpeg.

4. **Multi-party support**: Extend beyond 1-to-1 by creating multiple peer connections
   (full mesh) for up to 4 participants. Observe how bandwidth scales with participants.

5. **Implement connection recovery**: Detect ICE disconnection, attempt ICE restart,
   and fall back to a re-offer if the connection cannot be recovered.

---

## Project 3: Live Streaming Server

### Objective

Build a live streaming server that accepts RTMP input from tools like OBS, transcodes
to multiple qualities using FFmpeg, packages into HLS (with optional LL-HLS), and
serves to viewers via a web player. The system includes stream authentication, a
status dashboard, and recording capabilities.

### Why This Project Matters

Live streaming is one of the highest-value applications of media engineering. This
project exercises the full ingest-to-playback pipeline: protocol handling (RTMP),
transcoding (FFmpeg), packaging (HLS/fMP4), serving (HTTP), and playback (hls.js).
Every live streaming platform -- Twitch, YouTube Live, Instagram Live -- is built on
these same primitives.

### Architecture

```
                    ┌─────────────────────────────────────┐
                    │         Live Streaming Server         │
                    │                                       │
┌──────┐  RTMP     │  ┌──────────┐   ┌────────────────┐  │    ┌─────────┐
│ OBS  │──────────►│  │  RTMP    │──►│   Transcoder   │  │    │  Web    │
│      │           │  │  Ingest  │   │   (FFmpeg)     │  │    │ Player  │
└──────┘           │  └──────────┘   └───────┬────────┘  │    │(hls.js) │
                    │                         │           │    └────┬────┘
                    │                    ┌────▼────┐      │         │
                    │                    │   HLS   │      │    HTTP │
                    │                    │Packager │      │◄────────┘
                    │                    └────┬────┘      │
                    │                         │           │
                    │  ┌──────────┐    ┌─────▼──────┐   │
                    │  │ Recorder │    │   HTTP     │   │
                    │  │(optional)│    │   Server   │   │
                    │  └──────────┘    └────────────┘   │
                    │                                    │
                    │  ┌──────────────────────────┐     │
                    │  │    Status Dashboard       │     │
                    │  │  (active streams, health) │     │
                    │  └──────────────────────────┘     │
                    └─────────────────────────────────────┘
```

### Step 1: RTMP Ingest with Node-Media-Server

```javascript
// server.js
const NodeMediaServer = require('node-media-server');
const { spawn } = require('child_process');
const express = require('express');
const path = require('path');
const fs = require('fs');

// Configuration
const MEDIA_ROOT = path.join(__dirname, 'media');
const HLS_ROOT = path.join(MEDIA_ROOT, 'live');

// Ensure directories exist
fs.mkdirSync(HLS_ROOT, { recursive: true });

// Stream registry
const activeStreams = new Map();

// RTMP Server Configuration
const nmsConfig = {
  rtmp: {
    port: 1935,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60,
  },
  http: {
    port: 8000,
    allow_origin: '*',
    mediaroot: MEDIA_ROOT,
  },
};

const nms = new NodeMediaServer(nmsConfig);

// Stream authentication
nms.on('prePublish', (id, streamPath, args) => {
  const streamKey = streamPath.split('/').pop();

  // Simple key validation (replace with database lookup in production)
  const validKeys = new Set(['stream-key-abc', 'stream-key-xyz']);

  if (!validKeys.has(streamKey)) {
    const session = nms.getSession(id);
    session.reject();
    console.log(`Rejected stream: invalid key ${streamKey}`);
    return;
  }

  console.log(`Stream published: ${streamPath}`);
});

// Start transcoding when stream begins
nms.on('postPublish', (id, streamPath) => {
  const streamKey = streamPath.split('/').pop();
  const outputDir = path.join(HLS_ROOT, streamKey);
  fs.mkdirSync(outputDir, { recursive: true });

  // FFmpeg transcoding command
  const ffmpegArgs = [
    '-i',
    `rtmp://127.0.0.1:1935${streamPath}`,

    // 720p variant
    '-map',
    '0:v',
    '-map',
    '0:a',
    '-c:v:0',
    'libx264',
    '-b:v:0',
    '2500k',
    '-s:v:0',
    '1280x720',
    '-preset',
    'veryfast',
    '-g',
    '48',
    '-keyint_min',
    '48',
    '-sc_threshold',
    '0',
    '-c:a:0',
    'aac',
    '-b:a:0',
    '128k',
    '-ar',
    '44100',

    // 480p variant
    '-map',
    '0:v',
    '-map',
    '0:a',
    '-c:v:1',
    'libx264',
    '-b:v:1',
    '1200k',
    '-s:v:1',
    '854x480',
    '-preset',
    'veryfast',
    '-g',
    '48',
    '-keyint_min',
    '48',
    '-sc_threshold',
    '0',
    '-c:a:1',
    'aac',
    '-b:a:1',
    '96k',
    '-ar',
    '44100',

    // 360p variant
    '-map',
    '0:v',
    '-map',
    '0:a',
    '-c:v:2',
    'libx264',
    '-b:v:2',
    '600k',
    '-s:v:2',
    '640x360',
    '-preset',
    'veryfast',
    '-g',
    '48',
    '-keyint_min',
    '48',
    '-sc_threshold',
    '0',
    '-c:a:2',
    'aac',
    '-b:a:2',
    '64k',
    '-ar',
    '44100',

    // HLS output with master playlist
    '-f',
    'hls',
    '-hls_time',
    '4',
    '-hls_list_size',
    '5',
    '-hls_flags',
    'delete_segments+independent_segments',
    '-hls_segment_type',
    'fmp4',
    '-master_pl_name',
    'master.m3u8',

    '-var_stream_map',
    'v:0,a:0 v:1,a:1 v:2,a:2',

    '-hls_segment_filename',
    `${outputDir}/v%v/seg_%03d.m4s`,
    `${outputDir}/v%v/index.m3u8`,
  ];

  // Create variant directories
  for (let i = 0; i < 3; i++) {
    fs.mkdirSync(path.join(outputDir, `v${i}`), { recursive: true });
  }

  const ffmpeg = spawn('ffmpeg', ffmpegArgs);

  ffmpeg.stderr.on('data', (data) => {
    // Parse FFmpeg output for monitoring
    const line = data.toString();
    if (line.includes('frame=')) {
      const match = line.match(/frame=\s*(\d+).*fps=\s*([\d.]+)/);
      if (match) {
        activeStreams.set(streamKey, {
          ...activeStreams.get(streamKey),
          frames: parseInt(match[1]),
          fps: parseFloat(match[2]),
          lastUpdate: Date.now(),
        });
      }
    }
  });

  ffmpeg.on('close', (code) => {
    console.log(`FFmpeg exited for ${streamKey} with code ${code}`);
    activeStreams.delete(streamKey);
  });

  activeStreams.set(streamKey, {
    id,
    streamPath,
    ffmpegProcess: ffmpeg,
    startTime: Date.now(),
    frames: 0,
    fps: 0,
    lastUpdate: Date.now(),
  });
});

// Clean up when stream ends
nms.on('donePublish', (id, streamPath) => {
  const streamKey = streamPath.split('/').pop();
  const streamInfo = activeStreams.get(streamKey);

  if (streamInfo?.ffmpegProcess) {
    streamInfo.ffmpegProcess.kill('SIGTERM');
  }

  activeStreams.delete(streamKey);
  console.log(`Stream ended: ${streamPath}`);
});

nms.run();

// HTTP Server for HLS delivery and dashboard
const app = express();

// Serve HLS segments with proper CORS and content types
app.use(
  '/live',
  express.static(HLS_ROOT, {
    setHeaders: (res, filePath) => {
      res.set('Access-Control-Allow-Origin', '*');

      if (filePath.endsWith('.m3u8')) {
        res.set('Content-Type', 'application/vnd.apple.mpegurl');
        res.set('Cache-Control', 'no-cache');
      } else if (filePath.endsWith('.m4s')) {
        res.set('Content-Type', 'video/iso.segment');
        res.set('Cache-Control', 'max-age=300');
      }
    },
  })
);

// Dashboard API
app.get('/api/streams', (req, res) => {
  const streams = [];
  activeStreams.forEach((info, key) => {
    streams.push({
      key,
      uptime: Math.floor((Date.now() - info.startTime) / 1000),
      fps: info.fps,
      frames: info.frames,
      hlsUrl: `/live/${key}/master.m3u8`,
    });
  });
  res.json({ streams });
});

// Serve player page
app.get('/watch/:streamKey', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Live Stream - ${req.params.streamKey}</title>
      <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
      <style>
        body { margin: 0; background: #000; display: flex;
               justify-content: center; align-items: center; height: 100vh; }
        video { max-width: 100%; max-height: 100%; }
        .info { position: fixed; top: 10px; left: 10px; color: #fff;
                font-family: monospace; font-size: 12px;
                background: rgba(0,0,0,0.7); padding: 8px; border-radius: 4px; }
      </style>
    </head>
    <body>
      <video id="video" controls autoplay></video>
      <div class="info" id="info">Loading...</div>
      <script>
        const video = document.getElementById('video');
        const info = document.getElementById('info');
        const src = '/live/${req.params.streamKey}/master.m3u8';

        if (Hls.isSupported()) {
          const hls = new Hls({
            lowLatencyMode: true,
            liveSyncDurationCount: 3,
            liveMaxLatencyDurationCount: 5,
          });
          hls.loadSource(src);
          hls.attachMedia(video);

          hls.on(Hls.Events.MANIFEST_PARSED, () => { video.play(); });

          hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
            const level = hls.levels[data.level];
            info.textContent =
              'Quality: ' + level.width + 'x' + level.height +
              ' @ ' + Math.round(level.bitrate / 1000) + 'kbps';
          });

          hls.on(Hls.Events.ERROR, (_, data) => {
            if (data.fatal) {
              if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                hls.startLoad();
              } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                hls.recoverMediaError();
              }
            }
          });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = src;
        }
      </script>
    </body>
    </html>
  `);
});

// Dashboard page
app.get('/dashboard', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Stream Dashboard</title>
      <style>
        body { font-family: sans-serif; max-width: 800px;
               margin: 40px auto; padding: 0 20px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        .status { display: inline-block; width: 8px; height: 8px;
                  border-radius: 50%; background: #4caf50; margin-right: 8px; }
        a { color: #1976d2; }
      </style>
    </head>
    <body>
      <h1>Live Streams Dashboard</h1>
      <table>
        <thead>
          <tr>
            <th>Stream</th><th>Uptime</th><th>FPS</th>
            <th>Frames</th><th>Watch</th>
          </tr>
        </thead>
        <tbody id="streams">
          <tr><td colspan="5">Loading...</td></tr>
        </tbody>
      </table>
      <script>
        async function refresh() {
          const res = await fetch('/api/streams');
          const data = await res.json();
          const tbody = document.getElementById('streams');

          if (data.streams.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5">No active streams</td></tr>';
            return;
          }

          tbody.innerHTML = data.streams.map(s =>
            '<tr>' +
            '<td><span class="status"></span>' + s.key + '</td>' +
            '<td>' + s.uptime + 's</td>' +
            '<td>' + s.fps.toFixed(1) + '</td>' +
            '<td>' + s.frames + '</td>' +
            '<td><a href="/watch/' + s.key + '">Watch</a></td>' +
            '</tr>'
          ).join('');
        }

        refresh();
        setInterval(refresh, 2000);
      </script>
    </body>
    </html>
  `);
});

app.listen(8080, () => {
  console.log('HTTP server on http://localhost:8080');
  console.log('Dashboard: http://localhost:8080/dashboard');
});
```

### Step 2: Run and Test

```bash
# Install dependencies
npm init -y
npm install node-media-server express

# Start the server
node server.js

# Configure OBS:
#   Settings > Stream
#   Service: Custom
#   Server: rtmp://localhost:1935/live
#   Stream Key: stream-key-abc

# Start streaming in OBS, then open:
#   http://localhost:8080/watch/stream-key-abc
#   http://localhost:8080/dashboard
```

### Step 3: Add Stream Recording

```javascript
// Add to server.js after transcoding setup

function startRecording(streamKey, streamPath) {
  const recordDir = path.join(MEDIA_ROOT, 'recordings');
  fs.mkdirSync(recordDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputFile = path.join(recordDir, `${streamKey}_${timestamp}.mp4`);

  const recorder = spawn('ffmpeg', [
    '-i',
    `rtmp://127.0.0.1:1935${streamPath}`,
    '-c',
    'copy',
    '-movflags',
    '+faststart',
    outputFile,
  ]);

  return { process: recorder, file: outputFile };
}
```

### Extension Challenges

1. **Implement Low-Latency HLS (LL-HLS)**: Configure FFmpeg to produce partial
   segments and add `EXT-X-PART` tags to the manifest. Use hls.js with
   `lowLatencyMode: true` and measure the achieved latency.

2. **Add SRT ingest**: Accept SRT input alongside RTMP using FFmpeg's SRT support.
   This requires running a separate FFmpeg process listening on a UDP port with the
   SRT protocol.

3. **Implement stream thumbnails**: Periodically extract a frame from each active
   stream using FFmpeg and serve it as a JPEG for the dashboard preview.

4. **Add chat with WebSocket**: Implement a simple chat system alongside the stream
   using WebSocket, similar to Twitch chat.

5. **Implement DVR (time-shift)**: Keep a sliding window of segments (e.g., last
   30 minutes) and allow viewers to seek backward in the live stream.

---

## Project 4: Mini CDN with Edge Caching

### Objective

Build a simplified content delivery network with an origin server and multiple edge
cache nodes. The system demonstrates cache hierarchy, cache invalidation, request
routing, origin shielding, and basic load balancing. While a real CDN has thousands
of edge nodes globally, this project captures the core architectural concepts.

### Why This Project Matters

CDNs deliver the vast majority of video content on the internet. Understanding how
they work -- how cache hierarchies reduce origin load, how routing decisions are made,
how cache invalidation propagates, and how ABR interacts with edge caching -- is
essential for anyone building or operating media delivery systems.

### Architecture

```
                          ┌───────────────┐
                          │   Router /    │
       Viewer ──────────► │ Load Balancer │
                          └───────┬───────┘
                                  │
                    ┌─────────────┼─────────────┐
                    │             │             │
              ┌─────▼─────┐ ┌────▼──────┐ ┌────▼──────┐
              │  Edge 1   │ │  Edge 2   │ │  Edge 3   │
              │ (cache)   │ │ (cache)   │ │ (cache)   │
              └─────┬─────┘ └─────┬─────┘ └─────┬─────┘
                    │             │             │
                    └─────────────┼─────────────┘
                                  │
                          ┌───────▼───────┐
                          │    Shield     │
                          │   (mid-tier   │
                          │    cache)     │
                          └───────┬───────┘
                                  │
                          ┌───────▼───────┐
                          │    Origin     │
                          │   (HLS +     │
                          │  segments)   │
                          └───────────────┘
```

### Step 1: Origin Server

The origin server hosts the master content and generates HLS manifests.

```javascript
// origin.js
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 4000;
const CONTENT_ROOT = path.join(__dirname, 'content');

// Track origin requests for monitoring
let originHits = 0;

app.use((req, res, next) => {
  originHits++;
  console.log(`[ORIGIN] ${req.method} ${req.path} (total hits: ${originHits})`);
  next();
});

// Serve HLS content with appropriate cache headers
app.get('/live/:stream/master.m3u8', (req, res) => {
  const filePath = path.join(CONTENT_ROOT, req.params.stream, 'master.m3u8');

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Stream not found' });
  }

  res.set({
    'Content-Type': 'application/vnd.apple.mpegurl',
    'Cache-Control': 'no-cache', // Manifest should not be cached long
    'X-Origin-Hit': originHits.toString(),
  });

  res.sendFile(filePath);
});

app.get('/live/:stream/:variant/index.m3u8', (req, res) => {
  const filePath = path.join(
    CONTENT_ROOT,
    req.params.stream,
    req.params.variant,
    'index.m3u8'
  );

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Variant not found' });
  }

  res.set({
    'Content-Type': 'application/vnd.apple.mpegurl',
    'Cache-Control': 'max-age=1', // Short cache for live manifests
    'X-Origin-Hit': originHits.toString(),
  });

  res.sendFile(filePath);
});

app.get('/live/:stream/:variant/:segment', (req, res) => {
  const filePath = path.join(
    CONTENT_ROOT,
    req.params.stream,
    req.params.variant,
    req.params.segment
  );

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Segment not found' });
  }

  // Segments are immutable -- cache aggressively
  res.set({
    'Content-Type': req.params.segment.endsWith('.m4s')
      ? 'video/iso.segment'
      : 'video/mp4',
    'Cache-Control': 'public, max-age=86400, immutable',
    'X-Origin-Hit': originHits.toString(),
  });

  res.sendFile(filePath);
});

// Origin stats API
app.get('/api/stats', (req, res) => {
  res.json({ originHits });
});

app.listen(PORT, () => {
  console.log(`Origin server running on http://localhost:${PORT}`);
});
```

### Step 2: Edge Cache Node

```javascript
// edge.js
const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class EdgeCache {
  constructor(maxSizeMB) {
    this.cache = new Map();
    this.maxSize = maxSizeMB * 1024 * 1024;
    this.currentSize = 0;
    this.hits = 0;
    this.misses = 0;
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }

    // Check TTL
    if (entry.expires && entry.expires < Date.now()) {
      this.remove(key);
      this.misses++;
      return null;
    }

    // LRU: move to front
    this.cache.delete(key);
    this.cache.set(key, entry);
    this.hits++;

    return entry;
  }

  set(key, data, headers, ttlSeconds) {
    const size = data.length;

    // Evict if necessary
    while (this.currentSize + size > this.maxSize && this.cache.size > 0) {
      const oldestKey = this.cache.keys().next().value;
      this.remove(oldestKey);
    }

    const entry = {
      data,
      headers,
      size,
      expires: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
      cachedAt: Date.now(),
    };

    this.cache.set(key, entry);
    this.currentSize += size;
  }

  remove(key) {
    const entry = this.cache.get(key);
    if (entry) {
      this.currentSize -= entry.size;
      this.cache.delete(key);
    }
  }

  getStats() {
    const total = this.hits + this.misses;
    return {
      entries: this.cache.size,
      sizeMB: (this.currentSize / (1024 * 1024)).toFixed(2),
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? ((this.hits / total) * 100).toFixed(1) + '%' : 'N/A',
    };
  }
}

function createEdgeServer(edgePort, upstreamHost, upstreamPort, cacheSizeMB) {
  const app = express();
  const cache = new EdgeCache(cacheSizeMB || 100);
  const edgeId = `edge-${edgePort}`;

  app.use(async (req, res) => {
    const cacheKey = req.path;

    // Check cache first
    const cached = cache.get(cacheKey);
    if (cached) {
      console.log(`[${edgeId}] CACHE HIT: ${req.path}`);

      Object.entries(cached.headers).forEach(([key, val]) => {
        res.set(key, val);
      });
      res.set('X-Cache', 'HIT');
      res.set('X-Edge', edgeId);
      res.send(cached.data);
      return;
    }

    console.log(`[${edgeId}] CACHE MISS: ${req.path}`);

    // Fetch from upstream
    const upstream = `http://${upstreamHost}:${upstreamPort}${req.path}`;

    try {
      const response = await fetch(upstream);

      if (!response.ok) {
        res.status(response.status).send('Upstream error');
        return;
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const headers = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      // Parse Cache-Control for TTL
      const cacheControl = headers['cache-control'] || '';
      let ttl = 0;

      if (
        cacheControl.includes('no-cache') ||
        cacheControl.includes('no-store')
      ) {
        ttl = 0;
      } else {
        const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
        if (maxAgeMatch) {
          ttl = parseInt(maxAgeMatch[1]);
        }
      }

      // Cache if cacheable
      if (ttl > 0) {
        cache.set(cacheKey, buffer, headers, ttl);
      }

      Object.entries(headers).forEach(([key, val]) => {
        res.set(key, val);
      });
      res.set('X-Cache', 'MISS');
      res.set('X-Edge', edgeId);
      res.send(buffer);
    } catch (err) {
      console.error(`[${edgeId}] Upstream fetch failed: ${err.message}`);
      res.status(502).send('Bad Gateway');
    }
  });

  // Stats endpoint (on a separate port to avoid caching it)
  const statsApp = express();
  statsApp.get('/stats', (req, res) => {
    res.json({
      edgeId,
      ...cache.getStats(),
    });
  });

  app.listen(edgePort, () => {
    console.log(`${edgeId} running on http://localhost:${edgePort}`);
  });

  statsApp.listen(edgePort + 1000, () => {
    console.log(`${edgeId} stats on http://localhost:${edgePort + 1000}/stats`);
  });

  return { app, cache };
}

// Parse CLI arguments
const edgePort = parseInt(process.argv[2]) || 5001;
const upstreamHost = process.argv[3] || 'localhost';
const upstreamPort = parseInt(process.argv[4]) || 4000;

createEdgeServer(edgePort, upstreamHost, upstreamPort, 100);
```

### Step 3: Router / Load Balancer

```javascript
// router.js
const express = require('express');
const app = express();
const PORT = 3000;

const edges = [
  { host: 'localhost', port: 5001, statsPort: 6001, weight: 1 },
  { host: 'localhost', port: 5002, statsPort: 6002, weight: 1 },
  { host: 'localhost', port: 5003, statsPort: 6003, weight: 1 },
];

let roundRobinIndex = 0;

// Simple round-robin with weighted selection
function selectEdge() {
  const edge = edges[roundRobinIndex % edges.length];
  roundRobinIndex++;
  return edge;
}

// Proxy requests to selected edge
app.use(async (req, res) => {
  if (req.path === '/cdn-stats') {
    // Aggregate stats from all edges
    const stats = await Promise.all(
      edges.map(async (edge) => {
        try {
          const resp = await fetch(
            `http://${edge.host}:${edge.statsPort}/stats`
          );
          return resp.json();
        } catch {
          return { edgeId: `edge-${edge.port}`, error: 'unreachable' };
        }
      })
    );
    res.json({ edges: stats });
    return;
  }

  const edge = selectEdge();
  const upstream = `http://${edge.host}:${edge.port}${req.path}`;

  try {
    const response = await fetch(upstream);
    const buffer = Buffer.from(await response.arrayBuffer());

    response.headers.forEach((value, key) => {
      res.set(key, value);
    });
    res.set('X-CDN-Edge', `${edge.host}:${edge.port}`);
    res.status(response.status).send(buffer);
  } catch (err) {
    // Try next edge on failure
    const fallback = edges[roundRobinIndex % edges.length];
    const fallbackUrl = `http://${fallback.host}:${fallback.port}${req.path}`;

    try {
      const response = await fetch(fallbackUrl);
      const buffer = Buffer.from(await response.arrayBuffer());

      response.headers.forEach((value, key) => {
        res.set(key, value);
      });
      res.set('X-CDN-Edge', `${fallback.host}:${fallback.port}`);
      res.set('X-CDN-Failover', 'true');
      res.status(response.status).send(buffer);
    } catch {
      res.status(502).send('All edges unavailable');
    }
  }
});

app.listen(PORT, () => {
  console.log(`CDN Router on http://localhost:${PORT}`);
  console.log(`Stats: http://localhost:${PORT}/cdn-stats`);
});
```

### Step 4: Run the Full System

```bash
# Terminal 1: Origin
node origin.js

# Terminal 2-4: Edge nodes
node edge.js 5001 localhost 4000
node edge.js 5002 localhost 4000
node edge.js 5003 localhost 4000

# Terminal 5: Router
node router.js

# Test with curl
curl -I http://localhost:3000/live/test/master.m3u8
# Note the X-Cache and X-CDN-Edge headers

# Request same URL again -- should be CACHE HIT
curl -I http://localhost:3000/live/test/master.m3u8

# View CDN stats
curl http://localhost:3000/cdn-stats | jq
```

### Step 5: Load Testing

```bash
# Install a load testing tool
npm install -g autocannon

# Generate load against the CDN
autocannon -c 100 -d 30 http://localhost:3000/live/test/v0/seg_001.m4s

# Compare with direct origin access
autocannon -c 100 -d 30 http://localhost:4000/live/test/v0/seg_001.m4s

# Observe: CDN should handle significantly more requests per second
# because most are served from edge cache without hitting origin
```

### Extension Challenges

1. **Implement cache purge API**: Add an endpoint to invalidate specific cached
   content across all edge nodes. This is critical for live streaming where stale
   manifests cause playback issues.

2. **Add origin shielding (mid-tier cache)**: Insert a shield layer between edge
   nodes and origin. Edge misses go to the shield first, and only shield misses go
   to origin. This dramatically reduces origin load.

3. **Implement geo-based routing**: Instead of round-robin, route requests to the
   nearest edge based on client IP geolocation (using a GeoIP database like MaxMind).

4. **Add cache warming**: Pre-populate edge caches by proactively fetching popular
   content from origin before viewers request it.

5. **Implement request coalescing**: When multiple edge misses for the same content
   arrive simultaneously, send only one request to upstream and serve all waiting
   clients from the single response. This prevents origin thundering herd.

6. **Build a monitoring dashboard**: Create a real-time web dashboard showing per-edge
   cache hit rates, request throughput, origin load, and latency metrics using
   Server-Sent Events or WebSocket.

---

## Integration Project: End-to-End Live Streaming Platform

### Objective

Combine all four projects into a complete live streaming platform. A broadcaster
pushes RTMP from OBS to the streaming server (Project 3), which transcodes to HLS and
pushes segments to the origin server (Project 4). Edge caches serve viewers through the
CDN router. Viewers watch using the custom player (Project 1 adapted for HLS) and can
interact via WebRTC data channels (Project 2 technology applied to chat).

### Architecture

```
┌───────┐  RTMP   ┌───────────┐  HLS    ┌────────┐
│  OBS  │────────►│ Streaming │───────►  │ Origin │
└───────┘         │  Server   │ segments │ Server │
                  │(Project 3)│          │(Proj 4)│
                  └───────────┘          └───┬────┘
                                             │
                              ┌──────────────┼──────────────┐
                              │              │              │
                        ┌─────▼────┐  ┌─────▼────┐  ┌─────▼────┐
                        │  Edge 1  │  │  Edge 2  │  │  Edge 3  │
                        └─────┬────┘  └─────┬────┘  └─────┬────┘
                              │              │              │
                              └──────────────┼──────────────┘
                                             │
                                     ┌───────▼───────┐
                                     │    Router     │
                                     └───────┬───────┘
                                             │
                                     ┌───────▼───────┐
                                     │ Custom Player │
                                     │  (Project 1)  │
                                     │ + WebSocket   │
                                     │   Chat (P2)   │
                                     └───────────────┘
```

### Implementation Outline

1. **Modify the streaming server** (Project 3) to write HLS segments to the origin
   server's content directory instead of serving them directly.

2. **Configure the origin** (Project 4) to serve the HLS content produced by the
   streaming server.

3. **Adapt the custom player** (Project 1) to use hls.js for live playback through
   the CDN router, with the stats overlay showing which edge served each segment.

4. **Add a chat overlay** using WebSocket (borrowing the signaling server pattern
   from Project 2) so viewers can interact during the stream.

5. **Build a unified dashboard** that shows:
   - Active streams with encoding stats from the streaming server
   - CDN health: per-edge cache hit rate, origin request rate
   - Viewer count (based on active player connections)
   - Chat activity

### Verification Checklist

Use these checks to verify the integrated system works correctly:

```bash
# 1. Start all services
node origin.js          # Port 4000
node edge.js 5001       # Edge 1
node edge.js 5002       # Edge 2
node router.js          # Port 3000
node streaming-server.js # RTMP 1935, HTTP 8080

# 2. Start streaming from OBS to rtmp://localhost:1935/live/mystream

# 3. Verify HLS segments are being created
ls content/mystream/v0/

# 4. Verify playback through CDN
curl -I http://localhost:3000/live/mystream/master.m3u8
# Should show X-Cache header

# 5. Open player and verify smooth playback
# http://localhost:8080/watch/mystream (or custom player pointed at CDN)

# 6. Check CDN stats
curl http://localhost:3000/cdn-stats
# Should show cache hits increasing, origin hits staying low

# 7. Simulate edge failure
# Kill one edge process and verify router fails over to another edge
```

---

## Debugging Tips for All Projects

### Common Issues and Solutions

**Video plays audio but shows black screen**:

- Codec mismatch: Verify the MIME type in `addSourceBuffer()` matches the actual
  codec in the segments. Use `ffprobe -show_streams` to check.
- Missing init segment: The initialization segment must be appended before any media
  segments.

**WebRTC connection fails to establish**:

- Check ICE candidates: Open `chrome://webrtc-internals` and verify candidates are
  being gathered and exchanged.
- NAT issues: If both peers are behind symmetric NATs, STUN alone will not work.
  Deploy a TURN server.
- Signaling: Verify SDP offer and answer are being exchanged correctly. Log them and
  compare.

**HLS playback has high latency**:

- Reduce segment duration in FFmpeg (`-hls_time 2` or lower).
- Reduce the playlist size (`-hls_list_size 3`).
- Enable low-latency mode in hls.js.
- Check that manifests are not being cached too aggressively by the CDN.

**Edge cache not caching segments**:

- Verify `Cache-Control` headers from origin include `max-age`.
- Check that the edge's TTL parsing is correct.
- Confirm the cache size limit is not being hit.

**FFmpeg transcoding is too slow (real-time ratio < 1x)**:

- Use `-preset veryfast` or `-preset ultrafast`.
- Enable hardware acceleration: `-c:v h264_videotoolbox` (macOS),
  `-c:v h264_nvenc` (NVIDIA), `-c:v h264_vaapi` (Linux/Intel).
- Reduce the number of output variants.

### Essential Debugging Commands

```bash
# Check what codecs are in a file
ffprobe -v error -show_entries stream=codec_name,codec_type -of csv input.mp4

# Verify HLS manifest is valid
ffprobe -v error -i http://localhost:3000/live/test/master.m3u8

# Monitor RTMP connection
ffprobe -v verbose rtmp://localhost:1935/live/test

# Check WebSocket connectivity
websocat ws://localhost:3000

# Monitor HTTP caching headers
curl -v http://localhost:3000/live/test/v0/seg_001.m4s 2>&1 | grep -i cache

# Measure segment download time
time curl -o /dev/null -s http://localhost:3000/live/test/v0/seg_001.m4s
```

---

## Summary

These four projects plus the integration exercise cover the full spectrum of media
engineering:

| Project          | Stack Layer             | Core Concepts                                   |
| ---------------- | ----------------------- | ----------------------------------------------- |
| Video Player     | Client/Render           | MSE, ABR, buffering, segment parsing            |
| WebRTC Chat      | Transport/Real-time     | Peer connections, ICE, signaling, data channels |
| Streaming Server | Ingest/Encode/Package   | RTMP, transcoding, HLS packaging                |
| Mini CDN         | Delivery/Infrastructure | Caching, routing, origin shielding              |
| Integration      | Full stack              | End-to-end pipeline, system design              |

By completing these projects, you have:

- Built a video player that understands how bytes become pixels on screen
- Established real-time peer-to-peer connections with full NAT traversal
- Operated a live transcoding pipeline from RTMP ingest to HLS delivery
- Designed a caching architecture that scales content delivery
- Integrated all layers into a functioning live streaming platform

These are the same building blocks used by every major media platform. The scale
differs, but the principles are identical. From here, you can extend any project
into a production system, contribute to open-source media projects, or architect
media infrastructure at any scale.

Return to [00 - Framework & Overview](./00-FRAMEWORK.md) to review the complete
learning roadmap, or revisit [14 - Tools & Debugging](./14-TOOLS-DEBUGGING.md) when
you encounter issues during implementation.
