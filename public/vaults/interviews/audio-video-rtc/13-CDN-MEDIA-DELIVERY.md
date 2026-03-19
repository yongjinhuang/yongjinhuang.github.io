# CDN and Media Delivery

## Table of Contents

1. [CDN Fundamentals](#1-cdn-fundamentals)
2. [Video CDN Architecture](#2-video-cdn-architecture)
3. [Adaptive Bitrate Delivery](#3-adaptive-bitrate-delivery)
4. [Transcoding Pipeline](#4-transcoding-pipeline)
5. [Video Packaging](#5-video-packaging)
6. [Live Streaming at Scale](#6-live-streaming-at-scale)
7. [DRM Integration](#7-drm-integration)
8. [Video Analytics](#8-video-analytics)
9. [Cost Optimization](#9-cost-optimization)
10. [Edge Computing for Media](#10-edge-computing-for-media)
11. [SSAI (Server-Side Ad Insertion)](#11-ssai-server-side-ad-insertion)
12. [Major CDN Providers](#12-major-cdn-providers)
13. [Common Interview Questions](#13-common-interview-questions)

---

## 1. CDN Fundamentals

### What Is a CDN?

A Content Delivery Network (CDN) is a geographically distributed network of proxy servers and data centers designed to provide high availability and performance by distributing content closer to end users. For media delivery, CDNs are the backbone that makes large-scale video streaming possible.

Without a CDN, every viewer would fetch video data from a single origin server. A popular live event with 10 million concurrent viewers at 5 Mbps each would require 50 Tbps of egress from one location, which is physically and economically impossible. CDNs solve this by caching content at hundreds or thousands of locations worldwide.

### Point of Presence (PoP)

A PoP is a physical location where a CDN deploys servers. Each PoP typically contains:

- **Edge servers**: Cache and serve content to nearby users.
- **Load balancers**: Distribute traffic across edge servers within the PoP.
- **Routing equipment**: Handle anycast or DNS-based traffic steering.
- **Interconnection ports**: Peer with ISPs and Internet Exchange Points (IXPs).

Major CDNs operate 200-300+ PoPs globally. The goal is to place a PoP within 20-30ms of every end user. PoP placement decisions are driven by user density, ISP peering availability, and regional demand patterns.

### Edge Servers

Edge servers are the frontline of a CDN. They handle TLS termination, HTTP request processing, cache lookups, and content delivery. A typical edge server has:

- High-capacity NVMe SSDs (tens of terabytes) for hot cache.
- Large RAM (128-512 GB) for in-memory caching of the most popular segments.
- High-bandwidth NICs (25-100 Gbps) for egress.

Edge servers implement cache eviction policies (LRU, LFU, or hybrid) and support HTTP range requests, which are critical for media delivery where clients request specific byte ranges of video segments.

### Origin Shield

An origin shield is an intermediate caching layer between edge servers and the origin. Instead of every edge PoP making cache-miss requests directly to the origin, they route through a designated shield PoP.

```
Viewer -> Edge PoP (cache miss) -> Origin Shield (cache miss) -> Origin
Viewer -> Edge PoP (cache miss) -> Origin Shield (cache HIT) -> response
```

Benefits of an origin shield:

- **Reduced origin load**: Only the shield makes requests to origin, collapsing thousands of edge misses into one.
- **Improved cache hit ratios**: The shield aggregates demand from all edges, so content that is moderately popular across many regions still gets cached.
- **Protection during spikes**: When a new video goes viral, the origin sees one request per unique object instead of one per edge PoP.

### Cache Hierarchy

Modern CDNs use a multi-tier cache hierarchy:

```
L1: Edge PoP (closest to viewer, smallest cache, fastest response)
 |
L2: Regional / Mid-tier cache (aggregates multiple edge PoPs)
 |
L3: Origin Shield (single aggregation point per region or globally)
 |
Origin Server (authoritative source of truth)
```

Each tier has different characteristics:

| Tier        | Latency   | Storage      | Hit Ratio Target |
| ----------- | --------- | ------------ | ---------------- |
| L1 Edge     | < 10ms    | 10-50 TB SSD | 85-95%           |
| L2 Mid-tier | 10-50ms   | 100-500 TB   | 95-99%           |
| L3 Shield   | 50-150ms  | 500 TB+      | 99%+             |
| Origin      | 100-500ms | Unlimited    | N/A              |

### Anycast Routing

Anycast is a networking technique where the same IP address is announced from multiple locations via BGP. When a user connects to an anycast IP, the network routes them to the nearest PoP based on BGP path selection.

Advantages for CDNs:

- **Automatic failover**: If a PoP goes down, BGP withdraws the route and traffic reroutes to the next closest PoP within seconds.
- **DDoS resilience**: Attack traffic is distributed across all PoPs announcing the address.
- **Simple DNS**: A single IP address works globally; no per-user DNS resolution logic needed.

Limitations:

- BGP "nearest" is based on network hops, not geographic distance or latency.
- Long-lived TCP connections can break if BGP routes change mid-session.
- Less granular control compared to DNS-based routing.

### DNS-Based Routing

DNS-based routing uses intelligent DNS resolution to direct users to the optimal PoP. The CDN's authoritative DNS server considers:

- **Geographic proximity**: GeoIP lookup of the resolver or client subnet (EDNS Client Subnet).
- **Server health**: Real-time health checks exclude unhealthy PoPs.
- **Load balancing**: Distribute traffic to avoid overloading specific PoPs.
- **Performance data**: Real User Metrics (RUM) can feed back into DNS decisions.

```
Client DNS query: video.example.com
  -> CDN authoritative DNS
  -> Evaluates: client location = Tokyo, nearest healthy PoP = Tokyo, load = 60%
  -> Returns: A record pointing to Tokyo edge IP
  -> TTL: 30-60 seconds (short for agility)
```

Most production CDNs combine anycast (for initial connection) with DNS-based routing (for granular control), using anycast for the DNS resolvers themselves and DNS logic to pick the serving PoP.

---

## 2. Video CDN Architecture

### End-to-End Flow

The full path from content creation to viewer playback:

```
Content Source (camera/file)
  -> Encoder/Transcoder (multiple bitrates, codecs)
  -> Packager (HLS/DASH segments + manifests)
  -> Origin Storage (S3, cloud object store)
  -> Origin Server (HTTP server or cloud origin)
  -> Mid-tier Cache (regional aggregation)
  -> Edge Cache (PoP near viewer)
  -> Viewer Player (ABR logic, buffer management)
```

For live streaming, the encoder and packager run in real-time, and segments are pushed to origin as they are produced. For VOD, all encoding and packaging happens ahead of time.

### Cache Key Design for Media

Cache key design is critical for media delivery. A poorly designed cache key fragments the cache and destroys hit ratios. The cache key must uniquely identify a cacheable object while avoiding unnecessary variation.

Typical cache key components for video:

```
cache_key = hash(URL_path + query_params_subset + variant_info)
```

**URL path**: `/video/12345/segment_00042.m4s`

**Query parameters to include**:

- Bitrate/quality selector if encoded in the URL.
- Token or signature parameters should be **excluded** from the cache key (they vary per user but the content is identical).

**Variant information**:

- Resolution (1080p, 720p, etc.) is typically embedded in the URL path.
- Codec (H.264, H.265, AV1) may be a separate path or query parameter.

**What to strip from cache keys**:

- Session tokens, authentication signatures.
- Analytics tracking parameters (utm_source, etc.).
- Client-specific identifiers.

Example of a well-structured media URL:

```
/v1/content/movie-123/hls/1080p/h264/segment-00042.m4s
                |          |     |     |        |
              content ID  format quality codec  segment number
```

Every component in the path contributes to the cache key, and nothing extraneous varies between users.

### Cache Hit Ratios

For video streaming, cache hit ratios directly impact cost and quality. Key metrics:

- **Byte hit ratio**: Percentage of bytes served from cache vs origin. Target: 95%+ for VOD, 85%+ for live.
- **Request hit ratio**: Percentage of requests served from cache. Target: 90%+ for VOD.
- **Origin offload**: The inverse of cache miss ratio. A 95% byte hit ratio means 20x offload of the origin.

Factors that affect cache hit ratios:

- **Content popularity distribution**: Head content (top 10% of titles) gets cached everywhere; long-tail content may only be cached at shield level.
- **Segment size**: Larger segments (6-10 seconds) have higher hit ratios than small ones (2 seconds) because there are fewer unique objects.
- **Cache capacity**: Edge servers with more storage can cache more of the long tail.
- **ABR ladder depth**: More bitrate variants mean more unique objects to cache.
- **TTL policy**: For live, TTLs must be short (segment duration) to avoid stale content.

### Cache Warming

Cache warming (or pre-positioning) proactively pushes content to edge caches before users request it. This is essential for:

- **Premiere events**: A new movie release on a streaming platform. Without warming, the first wave of viewers all cause cache misses.
- **Live events**: Pre-warm static assets (player, ads, pre-roll) before the event starts.
- **Geographic expansion**: When launching in a new region, warm caches with popular content.

Warming strategies:

1. **Push-based**: Origin proactively sends content to edges. Simple but bandwidth-intensive.
2. **Pull-based (synthetic requests)**: A warming service sends simulated requests through the CDN, causing caches to fill organically.
3. **Popularity-predictive**: Use historical viewing data to predict which content to warm and where.

---

## 3. Adaptive Bitrate Delivery

### ABR Ladder Design

An ABR (Adaptive Bitrate) ladder defines the set of encoded variants available for a piece of content. Each rung specifies resolution, bitrate, and codec. The player dynamically switches between rungs based on network conditions.

A typical ABR ladder for H.264:

| Rung | Resolution | Bitrate (kbps) | Codec | Profile  |
| ---- | ---------- | -------------- | ----- | -------- |
| 1    | 426x240    | 400            | H.264 | Baseline |
| 2    | 640x360    | 800            | H.264 | Main     |
| 3    | 854x480    | 1400           | H.264 | Main     |
| 4    | 1280x720   | 2800           | H.264 | High     |
| 5    | 1920x1080  | 5000           | H.264 | High     |
| 6    | 2560x1440  | 8000           | H.264 | High     |
| 7    | 3840x2160  | 16000          | H.264 | High     |

For newer codecs (H.265/HEVC, AV1), bitrates can be 30-50% lower for equivalent quality:

| Rung  | Resolution | H.264 (kbps) | H.265 (kbps) | AV1 (kbps) |
| ----- | ---------- | ------------ | ------------ | ---------- |
| 1080p | 1920x1080  | 5000         | 3500         | 2500       |
| 4K    | 3840x2160  | 16000        | 10000        | 7000       |

### Per-Title Encoding

A fixed bitrate ladder wastes bits. An animated cartoon at 1080p looks perfect at 2 Mbps, while a fast-action sports scene needs 8 Mbps. Per-title encoding (pioneered by Netflix) optimizes the ladder for each piece of content.

The process:

1. Analyze the source content for visual complexity (spatial and temporal information).
2. Encode at multiple resolution-bitrate combinations.
3. Compute quality metrics (VMAF, PSNR, SSIM) for each combination.
4. Select the Pareto-optimal set: the ladder that maximizes quality at each bitrate point.
5. Prune rungs where quality gain is minimal.

Result: Simple content gets fewer, lower-bitrate rungs. Complex content gets higher-bitrate rungs. Overall bandwidth usage drops while perceived quality improves.

### Content-Aware Encoding

Content-aware encoding extends per-title to per-scene or per-shot granularity:

- **Per-scene**: Adjust encoding parameters for each scene based on complexity. A dialogue scene uses lower bitrate; an action sequence gets more bits.
- **Per-shot**: Even finer granularity, adjusting at every shot boundary.
- **Dynamic optimizer**: Some encoders (e.g., Netflix's Dynamic Optimizer) can adjust quantization parameters frame-by-frame based on content complexity models.

### Netflix Encoding Strategy

Netflix's approach (publicly documented):

1. **Per-title optimization**: Every title gets a custom ABR ladder.
2. **VMAF-driven**: Quality is measured using VMAF (Video Multi-Method Assessment Fusion), Netflix's open-source perceptual quality metric.
3. **Shot-based encoding**: Content is split at shot boundaries, and each shot is encoded independently with optimal settings.
4. **Codec tiering**: H.264 for broad compatibility, H.265 for 4K/HDR, AV1 for supported devices.
5. **Two-pass encoding with look-ahead**: First pass analyzes complexity, second pass allocates bits accordingly.

### YouTube Encoding Strategy

YouTube's challenges differ from Netflix (user-generated content at massive scale):

1. **VP9 and AV1**: YouTube was the first major platform to deploy VP9 at scale, and is aggressively rolling out AV1.
2. **Encoding at upload time**: Content is transcoded immediately upon upload. For popular creators, higher-quality encodes are generated over time.
3. **Progressive encoding**: Initially, only a few renditions are created. As a video gains views, more renditions (higher quality, more codecs) are added.
4. **Hardware acceleration**: YouTube uses custom ASICs (Video Coding Units) for AV1 encoding at scale.

---

## 4. Transcoding Pipeline

### Just-in-Time vs Pre-Transcoding

**Pre-transcoding (offline)**:

- Content is transcoded ahead of time, typically at ingest or shortly after.
- All renditions are ready before any viewer requests them.
- Higher quality possible (slower encoding presets, multi-pass).
- Higher storage cost (all variants stored permanently).
- Used by: Netflix, Disney+, most VOD platforms.

**Just-in-time (JIT) transcoding**:

- Content is transcoded on-demand when a viewer requests a format not yet available.
- Lower storage cost (only popular variants are generated and cached).
- Higher compute cost per request, but amortized over subsequent viewers.
- Must be fast enough for real-time playback.
- Used by: YouTube (for long-tail content), user-generated content platforms.

**Hybrid approach**:

- Pre-transcode the most common variants (e.g., 720p H.264).
- JIT transcode less common variants (e.g., 4K AV1) and cache the result.

### Transcoding Farm Architecture

A scalable transcoding system:

```
Ingest Service
  -> Job Scheduler (priority queue)
  -> Worker Pool Manager
     -> Worker Node 1 (GPU/CPU)
     -> Worker Node 2 (GPU/CPU)
     -> ...
     -> Worker Node N (GPU/CPU)
  -> Output Validator
  -> Storage Writer (S3, GCS)
  -> Notification Service (job complete)
```

### Job Queue Design

The job queue manages transcoding work items:

```
Job {
  id: "job-uuid-12345"
  source: "s3://ingest/raw/movie-123.mxf"
  priority: "high"              // live > premium > standard > UGC
  profile: "hls-h264-1080p"
  output: "s3://encoded/movie-123/hls/1080p/"
  created_at: "2024-01-15T10:00:00Z"
  deadline: "2024-01-15T12:00:00Z"
  retries: 0
  max_retries: 3
  status: "pending"
}
```

Priority considerations:

- **Live content**: Highest priority, real-time deadline.
- **New premium releases**: High priority, hours deadline.
- **Catalog backfill**: Low priority, days or weeks deadline.
- **Re-encodes for new codecs**: Background priority.

### Worker Pools

Worker nodes can be CPU-based or GPU-based:

- **CPU workers**: Flexible, use software encoders (x264, x265, libsvtav1). Best for high-quality offline encoding (slower presets).
- **GPU workers**: Use hardware encoders (NVENC, AMD VCE, Intel QSV). Faster but slightly lower quality per bitrate. Best for JIT and live transcoding.

Scaling strategies:

- **Auto-scaling**: Scale worker count based on queue depth and job deadlines.
- **Spot/preemptible instances**: Use cheap cloud instances for non-urgent jobs; fall back to on-demand for deadline-critical work.
- **Heterogeneous pools**: Mix CPU and GPU workers; route jobs based on quality requirements and urgency.

### Output Validation

Every transcoded output must be validated before serving:

1. **Container integrity**: Verify the MP4/fMP4/TS container is well-formed.
2. **Duration check**: Output duration matches source duration within tolerance.
3. **Quality metrics**: VMAF/PSNR/SSIM against source meets minimum threshold.
4. **Segment alignment**: For ABR, verify all renditions have aligned segment boundaries.
5. **Audio sync**: Verify audio-video sync is within acceptable drift (< 40ms).
6. **Manifest correctness**: Verify HLS/DASH manifests reference all segments correctly.

### Watch Folders

A watch folder is a directory (or object storage prefix) monitored for new files. When a new source file appears, the system automatically triggers a transcoding workflow.

```
/ingest/incoming/    <- watch folder
  movie-123.mxf     <- new file detected
  -> trigger transcoding pipeline
  -> move to /ingest/processing/movie-123.mxf
  -> on completion, move to /ingest/completed/movie-123.mxf
  -> on failure, move to /ingest/failed/movie-123.mxf
```

Cloud equivalents use event notifications (S3 Event Notifications, GCS Pub/Sub) instead of filesystem polling.

---

## 5. Video Packaging

### Just-in-Time Packaging

Just-in-time (JIT) packaging converts stored mezzanine or intermediate files into the streaming format (HLS, DASH, CMAF) at request time. The packager runs at the origin or as a serverless function.

**Unified Streaming Platform (USP)**:

- Industry-standard JIT packager.
- Stores a single MP4 file per rendition.
- Dynamically generates HLS, DASH, or Smooth Streaming manifests and segments on request.
- Supports DRM encryption, time-shifting, trick play, subtitles.

**AWS Elemental MediaPackage**:

- Managed JIT packaging service.
- Receives live or VOD input in a single format.
- Outputs HLS, DASH, CMAF, and MSS.
- Integrates with CloudFront for caching.
- Supports DRM, ad insertion markers, and DVR windows.

### Origin-Side Packaging

Origin-side (or offline) packaging pre-generates all streaming formats and stores them:

```
/content/movie-123/
  hls/
    master.m3u8
    1080p/
      playlist.m3u8
      segment-00001.ts
      segment-00002.ts
      ...
    720p/
      playlist.m3u8
      ...
  dash/
    manifest.mpd
    1080p/
      init.mp4
      segment-00001.m4s
      ...
```

Trade-offs vs JIT:

| Factor                | Origin-Side                 | JIT                        |
| --------------------- | --------------------------- | -------------------------- |
| Storage cost          | Higher (multiple formats)   | Lower (one source)         |
| Origin CPU            | None at request time        | CPU per request            |
| Flexibility           | Must re-package for changes | Change on the fly          |
| Cache efficiency      | Higher (static files)       | Lower (dynamic generation) |
| Latency to first byte | Lower (static file serve)   | Slightly higher            |

### CMAF (Common Media Application Format)

CMAF unifies HLS and DASH by defining a single segment format (fragmented MP4 / fMP4) that both protocols can reference. Before CMAF, HLS used MPEG-TS segments and DASH used fragmented MP4, requiring separate packaging.

With CMAF:

- A single set of fMP4 segments serves both HLS and DASH.
- Only the manifests differ (m3u8 for HLS, mpd for DASH).
- Storage cost is roughly halved.
- Cache hit ratios improve because HLS and DASH viewers request the same segments.

CMAF also supports low-latency modes (CMAF chunked transfer), where segments are delivered incrementally as they are produced.

### Manifest Manipulation

Manifest manipulation is the practice of dynamically modifying HLS playlists or DASH MPDs at request time. Use cases:

- **Ad insertion**: Injecting ad segment URLs into the manifest.
- **Content filtering**: Removing certain quality rungs based on device capabilities or subscription tier.
- **A/B testing**: Serving different encoding ladders to different user cohorts.
- **Blackout enforcement**: Replacing content URLs for geographic restrictions.
- **Start-over/DVR**: Adjusting the manifest window for time-shifted viewing.

Manifest manipulation can happen at:

- The origin server.
- A dedicated manifest manipulation service.
- Edge compute functions (Lambda@Edge, Cloudflare Workers).

---

## 6. Live Streaming at Scale

### Ingest Redundancy

Live streaming requires redundant ingest paths because a single point of failure means millions of viewers lose the stream simultaneously.

**Dual-path ingest**:

```
Encoder A (primary)   --RTMP/SRT-->  Ingest Server A (primary)
Encoder B (backup)    --RTMP/SRT-->  Ingest Server B (backup)
                                          |
                                    Ingest Selector
                                    (picks best feed)
                                          |
                                    Transcoder / Packager
```

The ingest selector monitors both feeds for:

- Signal presence (is the feed arriving?).
- Quality metrics (frozen frames, black frames, audio silence).
- Timing (which feed is ahead/behind?).

If the primary feed degrades, the selector switches to backup within milliseconds.

### Origin Redundancy

The live origin must also be redundant:

- **Active-active origins**: Two or more origin servers independently receive packaged segments. CDN edges pull from whichever responds first.
- **Shared storage**: Both origins write to a shared storage layer (e.g., NFS, S3) so that any origin can serve any segment.
- **Health-checked failover**: CDN is configured with primary and failover origin; on primary failure, edges route to failover.

### Edge Cache Behavior for Live

Live streaming caching differs fundamentally from VOD:

- **Short TTLs**: Live segments are valid for their duration (e.g., 2-6 seconds) plus a small buffer. TTLs of 1-4 seconds are common.
- **Stale-while-revalidate**: Edge serves the cached segment while asynchronously checking origin for a newer version. This prevents cache stampedes when a new segment drops.
- **Negative caching**: Short negative TTLs (1-2 seconds) for 404 responses. During live, the next segment may not exist yet; the edge should retry quickly.
- **Request coalescing (collapse)**: When thousands of viewers simultaneously request a segment that is not yet cached, the edge sends one request to origin and holds all other requests until the response arrives.

```
Edge behavior for live segment request:

1. Viewer requests segment_00042.m4s
2. Edge checks cache -> miss
3. Edge sends request to origin, marks segment as "in-flight"
4. 500 more viewers request segment_00042.m4s
5. Edge holds these 500 requests (request coalescing)
6. Origin responds with segment
7. Edge caches segment and responds to all 501 viewers
```

### Manifest Freshness

The manifest (playlist) must be refreshed frequently for live:

- HLS: The player polls the media playlist every target duration (e.g., every 2 seconds for a 2-second segment duration).
- DASH: The player polls the MPD at the `minimumUpdatePeriod`.

Manifest TTLs at the edge must be very short (0.5-1 second) or use `no-cache` with `stale-while-revalidate`. Some CDNs support long-polling or server-push for manifests to reduce polling overhead.

### Time-Shift / DVR

DVR (Digital Video Recording) or time-shift allows viewers to pause, rewind, and seek within a live stream. Implementation:

- **Sliding window**: The manifest lists the last N segments (e.g., last 2 hours). As new segments arrive, old ones drop off the manifest but remain in storage.
- **DVR window**: Configurable per channel (30 minutes, 2 hours, 24 hours).
- **Storage**: Live segments are stored for the DVR window duration, then archived or deleted.
- **Seek behavior**: The player requests the manifest for a specific time offset; the origin or packaging service returns the appropriate segment list.

---

## 7. DRM Integration

### License Server Architecture

DRM (Digital Rights Management) protects premium content from unauthorized copying. The license server is the central component:

```
Player                License Server          Key Management
  |                        |                       |
  |-- License Request ---->|                       |
  |   (device cert,        |-- Key Request ------->|
  |    content ID,         |                       |
  |    auth token)         |<-- Content Keys ------|
  |                        |                       |
  |<-- License Response ---|
  |   (encrypted keys,
  |    usage rules)
```

License server responsibilities:

- Authenticate the requesting device and user.
- Verify entitlement (does this user have rights to this content?).
- Retrieve content encryption keys from key management.
- Package keys into a DRM-specific license format.
- Enforce business rules (rental duration, offline download limits, output restrictions).

### Key Rotation

Key rotation changes encryption keys periodically during playback, typically for live content:

- **Rotation period**: Every few minutes to hours.
- **Crypto period**: The duration a single key is valid.
- **Seamless rotation**: The player receives the next key before the current one expires. The manifest includes key identifiers (KID) so the player knows when to request a new license.

Key rotation limits the window of exposure if a key is compromised.

### Multi-DRM Workflow

No single DRM works on all platforms, so content providers must support multiple DRM systems:

| DRM       | Platforms                              |
| --------- | -------------------------------------- |
| Widevine  | Chrome, Android, Chromecast, smart TVs |
| FairPlay  | Safari, iOS, tvOS, macOS               |
| PlayReady | Edge, Windows, Xbox, some smart TVs    |

Multi-DRM workflow:

1. **Encrypt once**: Use CENC (Common Encryption) to encrypt content with a single set of keys. CENC allows multiple DRM systems to decrypt the same encrypted content.
2. **Generate DRM metadata**: For each DRM system, generate the DRM-specific initialization data (PSSH boxes for Widevine/PlayReady, key delivery parameters for FairPlay).
3. **Embed in manifest**: HLS playlists include `#EXT-X-KEY` or `#EXT-X-SESSION-KEY` tags; DASH MPDs include `<ContentProtection>` elements.
4. **License acquisition**: At playback, the player detects the DRM system, extracts initialization data, and contacts the appropriate license server.

### CPIX (Content Protection Information Exchange)

CPIX is a DASH-IF specification that standardizes the exchange of content protection information between the encoder, packager, and DRM systems.

A CPIX document contains:

- Content key IDs and values (encrypted).
- DRM system-specific data (PSSH boxes, HLS signaling data).
- Usage rules (key period, intended track type).

CPIX enables a workflow where:

1. The key management server generates keys and a CPIX document.
2. The encoder reads the CPIX document to encrypt content.
3. The packager reads the CPIX document to embed DRM signaling in manifests.
4. Each DRM license server reads the CPIX document to serve the correct keys.

### Token-Based URL Signing

URL signing prevents unauthorized access to CDN-hosted content. The origin generates a signed URL with:

- **Expiration time**: Token becomes invalid after a set time.
- **IP restriction**: Token is valid only from a specific IP or subnet.
- **Path restriction**: Token is valid only for a specific URL path or prefix.
- **Signature**: HMAC or asymmetric signature over the above parameters using a shared secret.

```
Original URL:  https://cdn.example.com/video/123/segment-001.m4s
Signed URL:    https://cdn.example.com/video/123/segment-001.m4s
               ?token=exp=1705312800~acl=/video/123/*~hmac=a1b2c3d4e5
```

The CDN edge validates the token before serving content. If validation fails, it returns a 403. The token parameters must be excluded from the cache key so that different users' tokens do not fragment the cache.

---

## 8. Video Analytics

### Quality of Experience (QoE) Metrics

QoE metrics measure the viewer's subjective experience:

**Startup time (Time to First Frame)**:

- Time from play button press to first video frame rendered.
- Target: < 2 seconds. Netflix targets < 1 second.
- Components: DNS resolution, TCP/TLS handshake, manifest fetch, first segment download, decode, render.

**Rebuffer rate**:

- Percentage of playback time spent buffering (stalling).
- Target: < 0.5% of total viewing time.
- Expressed as rebuffer ratio (rebuffer time / total time) or rebuffers per hour.

**Average bitrate**:

- Mean bitrate delivered during the session.
- Higher is generally better but must be correlated with device/screen size.

**Bitrate switches**:

- Number of quality switches during playback.
- Frequent switching (oscillation) degrades perceived quality even if average bitrate is acceptable.

**Video start failures (VSF)**:

- Percentage of play attempts that fail to start.
- Target: < 1%.

**Error rate**:

- HTTP errors (4xx, 5xx) during segment fetches.
- Manifest parsing errors.
- DRM license failures.

**Exits before video start (EBVS)**:

- Users who abandon before playback begins.
- Correlates strongly with startup time.

### Analytics Platforms

**Conviva**:

- Real-time video analytics platform.
- Sensor-based (client-side SDK in the player).
- Provides Experience Insights: viewer count, buffering, quality score.
- AI-powered alerting for QoE degradation.

**Mux Data**:

- Developer-friendly video analytics.
- Lightweight SDK, easy integration with major players.
- Real-time dashboard, API access, alerting.
- Focus on engineering metrics (p95 startup time, rebuffer frequency by CDN).

**Video.js analytics plugins**:

- Open-source player with plugin ecosystem.
- Plugins emit events (play, pause, buffering, error) to analytics backends.
- Custom integration with Google Analytics, Segment, or proprietary systems.

### Server-Side Analytics

CDN and origin metrics:

- **Cache hit ratio**: By PoP, by content type, by time window.
- **Origin load**: Requests per second, bandwidth, error rates at origin.
- **CDN bandwidth**: Total egress per PoP, per region, per content.
- **Latency**: Time to first byte (TTFB) at edge, shield, and origin.
- **Error rates**: 4xx and 5xx responses by PoP.
- **Throughput**: Bytes per second delivered to viewers (impacts rebuffering).

Correlating client-side QoE with server-side metrics is essential for root cause analysis. For example, high rebuffer rates in a specific region might correlate with low cache hit ratios at the corresponding PoP.

---

## 9. Cost Optimization

### CDN Pricing Models

**Per-GB egress**:

- Pay for each GB delivered from edge to viewer.
- Typical rates: $0.02-0.08/GB depending on region and volume.
- Simple and predictable.

**Committed use / reserved capacity**:

- Commit to a minimum monthly bandwidth or egress volume.
- Discounts of 20-50% compared to on-demand pricing.
- Risk: underutilization if traffic is below commitment.

**95th percentile (burstable)**:

- Pay based on the 95th percentile of bandwidth usage over the billing period.
- 5% of peak samples are discarded (accommodates occasional spikes).
- Good for traffic with predictable patterns and occasional bursts.

### Multi-CDN Strategies

Using multiple CDNs provides:

- **Resilience**: If one CDN has an outage, traffic shifts to another.
- **Performance**: Route each viewer to the CDN with the best performance for their location.
- **Cost leverage**: Negotiate better rates by credibly threatening to shift traffic.
- **Capacity**: No single CDN may have enough capacity for mega-events.

### CDN Selection Algorithms

Deciding which CDN to use for each request:

1. **Static weight-based**: 60% CDN-A, 30% CDN-B, 10% CDN-C. Simple but does not adapt.
2. **Performance-based**: Use RUM data to measure each CDN's performance (TTFB, throughput, error rate) per region. Route traffic to the best performer.
3. **Cost-aware**: Factor in per-CDN pricing. Route traffic to meet committed volumes first, then overflow to the cheapest option.
4. **Hybrid**: Combine performance scores with cost targets. Maximize quality subject to budget constraints.

Multi-CDN switching can happen at:

- **DNS level**: Different DNS responses for different users.
- **Client-side**: Player SDK chooses CDN per segment based on recent performance.
- **Server-side**: Manifest manipulation rewrites segment URLs to point to different CDNs.

### P2P CDN (Peer-Assisted Delivery)

Peer-to-peer delivery supplements traditional CDN by having viewers share segments with each other:

```
CDN Edge -> Viewer A
               |
               +--> Viewer B (receives from Viewer A via WebRTC)
               |
               +--> Viewer C (receives from Viewer A via WebRTC)
```

Benefits:

- Reduces CDN egress by 50-80% for popular live events.
- Scales naturally with viewership (more viewers = more peers).

Challenges:

- Requires WebRTC support in the player.
- Upload bandwidth of peers varies; not reliable for all segments.
- Latency can increase if peer connections are slow.
- Not effective for long-tail VOD content (too few concurrent viewers).

Providers: Streamroot (now Lumen), Peer5 (now Akamai), CDNBye.

### Storage Tiering

Not all content needs hot storage:

| Tier                 | Use Case                           | Access Latency     | Cost            |
| -------------------- | ---------------------------------- | ------------------ | --------------- |
| Hot (SSD/NVMe)       | Live segments, popular VOD         | < 10ms             | $$$             |
| Warm (HDD)           | Recent VOD, moderate popularity    | 10-100ms           | $$              |
| Cold (Archive)       | Old content, rarely accessed       | Seconds to minutes | $               |
| Glacier/Deep Archive | Mezzanine backups, legal retention | Hours              | $0.001/GB/month |

Implement lifecycle policies:

- After 30 days of no views, move from hot to warm.
- After 90 days, move to cold.
- Keep mezzanine files in deep archive indefinitely.

---

## 10. Edge Computing for Media

### Edge Functions for Manifest Manipulation

Edge compute platforms (Cloudflare Workers, Lambda@Edge, Fastly Compute) allow running custom logic at CDN edge PoPs. For media delivery:

```javascript
// Cloudflare Worker: Manifest manipulation example
async function handleRequest(request) {
  const url = new URL(request.url);

  if (url.pathname.endsWith('.m3u8')) {
    // Fetch the original manifest from origin
    const response = await fetch(request);
    let manifest = await response.text();

    // Modify the manifest at the edge
    manifest = insertAdBreaks(manifest, request);
    manifest = filterQualityLevels(manifest, request);
    manifest = rewriteSegmentUrls(manifest, request);

    return new Response(manifest, {
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-cache',
      },
    });
  }

  return fetch(request);
}
```

### A/B Testing at the Edge

Edge functions can route viewers to different encoding configurations:

- **Codec testing**: Serve AV1 to a test group, H.265 to control group, measure QoE difference.
- **Segment duration testing**: 2-second vs 4-second vs 6-second segments.
- **Player configuration**: Different ABR algorithm parameters.

The edge function reads a cookie or generates a consistent hash of the viewer ID to assign them to a cohort, then modifies the manifest accordingly.

### Ad Insertion at the Edge

Edge-based SSAI can reduce latency compared to centralized ad insertion:

1. Viewer requests manifest from edge.
2. Edge function detects ad break markers (SCTE-35).
3. Edge function calls ad decision server (ADS) to get ad URLs.
4. Edge function stitches ad segment URLs into the manifest.
5. Ad segments are cached at the edge like regular content.

This moves manifest manipulation closer to the viewer, reducing latency and enabling per-viewer personalization without round-tripping to a central service.

### Content Personalization at the Edge

Edge functions enable per-viewer content personalization:

- **Geographic restrictions**: Block or allow content based on viewer location.
- **Device-aware encoding**: Serve different ABR ladders based on device type (detected via User-Agent or client hints).
- **Subscription tier enforcement**: Premium subscribers get 4K HDR; free tier maxes out at 720p.
- **Language selection**: Serve the appropriate audio track and subtitle manifest based on viewer locale.

---

## 11. SSAI (Server-Side Ad Insertion)

### How SSAI Works

Server-Side Ad Insertion stitches ads into the video stream on the server side, before content reaches the viewer. Unlike client-side ad insertion (CSAI), the viewer receives a single continuous stream with no visible distinction between content and ads.

```
Content Origin     Ad Server       SSAI Service        CDN Edge       Viewer
     |                |                 |                  |             |
     |-- Content segments ------------>|                  |             |
     |                |-- Ad decision ->|                  |             |
     |                |<- Ad URLs ------|                  |             |
     |                |                 |-- Stitched ----->|             |
     |                |                 |   manifest       |             |
     |                |                 |                  |-- Stream -->|
```

Advantages of SSAI over CSAI:

- **Ad blocker resistance**: Ads come from the same domain/origin as content; ad blockers cannot distinguish them.
- **Seamless experience**: No buffering or visual glitch at ad boundaries.
- **Consistent QoE**: Ads are transcoded to match content quality.
- **Works on all devices**: No client-side ad SDK required; works on devices with limited app capabilities (smart TVs, set-top boxes).

### Ad Decision Server (ADS)

The ADS determines which ads to serve for a given opportunity:

- Receives a VAST (Video Ad Serving Template) request with targeting parameters: viewer demographics, content genre, geography, device type.
- Returns a VAST response containing ad creative URLs, tracking pixels, and companion ads.
- Must respond within tight latency budgets (< 200ms for live).

### Manifest Manipulation for SSAI

For HLS, SSAI modifies the media playlist:

```
#EXTM3U
#EXT-X-TARGETDURATION:6
#EXTINF:6.006,
content-segment-041.ts
#EXTINF:6.006,
content-segment-042.ts
#EXT-X-DISCONTINUITY          <-- ad break start
#EXTINF:6.006,
ad-creative-001-seg-001.ts
#EXTINF:6.006,
ad-creative-001-seg-002.ts
#EXTINF:5.005,
ad-creative-001-seg-003.ts
#EXT-X-DISCONTINUITY          <-- ad break end
#EXTINF:6.006,
content-segment-043.ts
```

The `#EXT-X-DISCONTINUITY` tag signals a change in encoding parameters (the ad may have different resolution, bitrate, or codec settings from the content).

### SCTE-35 Ad Markers

SCTE-35 is the industry standard for signaling ad opportunities in transport streams. In HLS, SCTE-35 is carried via `#EXT-X-DATERANGE` or `#EXT-X-CUE-OUT` / `#EXT-X-CUE-IN` tags.

```
#EXT-X-CUE-OUT:DURATION=30       <-- Start of 30-second ad break
#EXTINF:6.006,
content-segment-042.ts            <-- (may be replaced with ad)
#EXT-X-CUE-IN                    <-- End of ad break
```

SCTE-35 messages include:

- **splice_insert**: Signal an immediate or scheduled splice point.
- **time_signal**: Signal a time-based event (used with segmentation descriptors).
- **Segmentation descriptors**: Classify the event (program start, ad start, chapter, etc.).

### Ad Normalization

Ads from different sources arrive in different formats, resolutions, and codecs. Ad normalization transcodes all ad creatives to match the content's encoding ladder:

1. Receive ad creative (often a single MP4 file).
2. Transcode to all renditions matching the content's ABR ladder.
3. Package into the same segment format (HLS TS, CMAF fMP4).
4. Align segment boundaries with the content's segment duration.
5. Cache normalized ad segments for reuse across viewers.

Without normalization, the `#EXT-X-DISCONTINUITY` tag forces the player to reinitialize the decoder, which can cause visual glitches.

### Cue-Out / Cue-In

Cue-out marks the beginning of an ad opportunity. Cue-in marks the end. The SSAI service uses these markers to:

1. Detect the cue-out in the source stream or manifest.
2. Calculate the ad break duration from the cue-out signal.
3. Request ads from the ADS for that duration.
4. Replace content segments between cue-out and cue-in with ad segments.
5. Ensure the total ad duration fills the break precisely (padding with slate if needed).

---

## 12. Major CDN Providers

### Comparison Table

| Provider                       | Strengths                                     | Media Features                                             | Pricing Model                                        | Best For                            |
| ------------------------------ | --------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------- |
| Cloudflare Stream              | Simple API, global network                    | Encoding, storage, delivery, player                        | Per-minute stored + delivered                        | Small-to-mid platforms              |
| AWS CloudFront + MediaServices | Deep AWS integration                          | MediaLive, MediaPackage, MediaConvert, IVS                 | Per-GB + service-specific                            | AWS-native architectures            |
| Akamai                         | Largest network, enterprise-grade             | Media Delivery, Download Delivery, Adaptive Media Delivery | Custom/enterprise contracts                          | Large media companies, broadcasters |
| Fastly                         | Programmable edge (VCL/Wasm), real-time purge | Edge compute for manifest manipulation                     | Per-GB or committed                                  | Developers needing edge compute     |
| Mux                            | Developer-first video API                     | Encoding, hosting, streaming, analytics (Mux Data)         | Per-minute + per-viewer                              | Developer teams, SaaS products      |
| Cloudinary Video               | Media management + transformation             | On-the-fly transcoding, DAM, AI tagging                    | Credit-based (transformations + storage + bandwidth) | Content-heavy websites, e-commerce  |

### Cloudflare Stream

Cloudflare Stream is an end-to-end video platform that handles encoding, storage, and delivery. Key features:

- Upload via API, URL pull, or TUS resumable upload.
- Automatic ABR encoding (multiple renditions).
- Built-in player with analytics.
- Live streaming via RTMPS or SRT ingest.
- Sub-second latency mode (WebRTC-based).
- Token-based access control.
- Leverages Cloudflare's 300+ PoP global network.

### AWS CloudFront + MediaServices

AWS offers a full media pipeline:

- **MediaLive**: Live video encoding (RTMP/RTP/HLS ingest, HLS/DASH/CMAF output).
- **MediaPackage**: JIT packaging with DRM, DVR, ad marker passthrough.
- **MediaConvert**: File-based (VOD) transcoding.
- **Interactive Video Service (IVS)**: Managed low-latency live streaming.
- **CloudFront**: CDN delivery with Lambda@Edge for manifest manipulation.
- **S3**: Origin storage.

The components integrate tightly but require orchestration (Step Functions, EventBridge).

### Akamai

Akamai is the largest CDN by network size (4,000+ PoPs in 130+ countries). Media-specific products:

- **Adaptive Media Delivery**: Optimized for ABR streaming with prefetching, request coalescing, and media-aware caching.
- **Download Delivery**: Optimized for large file downloads (game patches, software updates).
- **NetStorage**: Origin storage distributed across Akamai's network.
- **Media Services Live**: Managed live streaming pipeline.

Akamai is the CDN of choice for major broadcasters (BBC, NBC, etc.) and sporting events.

### Fastly

Fastly differentiates through programmability:

- **VCL (Varnish Configuration Language)**: Powerful caching logic customization.
- **Compute@Edge (Wasm)**: Run arbitrary code at the edge in WebAssembly.
- **Instant purge**: Cache invalidation in < 150ms globally.
- **Real-time logging**: Stream logs to any endpoint in real-time.

For media, Fastly's programmability enables sophisticated manifest manipulation, per-viewer ad insertion, and dynamic ABR ladder selection at the edge.

### Mux

Mux is a developer-first video platform:

- **Mux Video**: Upload, encode, store, and stream video via API.
- **Mux Data**: Real-time video analytics (QoE monitoring).
- **Mux Player**: Drop-in player with built-in analytics.
- **Mux Spaces**: Real-time video conferencing (WebRTC-based).

Mux handles the entire video pipeline and is popular with SaaS companies, ed-tech, and developer platforms that need video without building infrastructure.

### Cloudinary Video

Cloudinary extends its image management platform to video:

- **On-the-fly transformations**: Resize, crop, overlay, trim, and transcode videos via URL parameters.
- **DAM (Digital Asset Management)**: Organize, tag, and search video assets.
- **AI-powered features**: Auto-tagging, auto-captioning, content-aware cropping.
- **Adaptive streaming**: Automatic HLS generation.

Cloudinary is best suited for websites and apps that need video embedded alongside images with consistent transformation capabilities.

---

## 13. Common Interview Questions

### Fundamentals

**Q: How does a CDN reduce latency for video delivery?**

A CDN places content on edge servers geographically close to viewers. Instead of traversing the entire internet to reach a distant origin server, the viewer's request is served from a nearby PoP. This reduces round-trip time for TCP/TLS handshake, segment downloads, and manifest updates. For video, this directly translates to faster startup times and more consistent throughput, reducing rebuffering.

**Q: Explain the difference between anycast and DNS-based CDN routing.**

Anycast announces the same IP address from multiple PoPs via BGP. The network naturally routes packets to the closest PoP by BGP path. It is simple, provides automatic failover, and is effective for DDoS mitigation, but offers limited control. DNS-based routing uses intelligent DNS resolution to direct users to specific PoPs based on geography, load, health, and performance data. It offers more granular control but depends on DNS TTLs and is slower to react than anycast.

**Q: What is an origin shield and why is it important for video?**

An origin shield is an intermediate cache layer that sits between edge PoPs and the origin. All cache misses from edges route through the shield instead of directly to the origin. For video, where a popular live event might generate millions of concurrent viewers across hundreds of PoPs, the shield collapses all those miss requests into a single origin request per unique segment. This protects the origin from being overwhelmed and improves overall cache efficiency.

### Architecture

**Q: Design a CDN architecture for a live sports streaming platform serving 10 million concurrent viewers.**

Key design considerations:

1. **Dual-path ingest**: Redundant encoders and ingest servers to eliminate single points of failure.
2. **Multi-region origins**: Active-active origins in at least 3 regions with shared storage.
3. **Origin shield per region**: Each region has a shield PoP to collapse edge misses.
4. **Multi-CDN**: Use 2-3 CDN providers for redundancy and capacity. A CDN selection layer routes traffic based on performance and availability.
5. **Request coalescing at edges**: For live segments, thousands of simultaneous requests are collapsed into one origin fetch.
6. **Short TTLs with stale-while-revalidate**: Live segments are cached for their duration with SWR to avoid cache stampedes.
7. **DVR window**: 4-hour sliding window for rewind/catch-up functionality.
8. **SSAI**: Server-side ad insertion for monetization without ad blockers.
9. **Multi-DRM**: Widevine + FairPlay + PlayReady for cross-platform protection.
10. **Real-time monitoring**: QoE analytics (Conviva/Mux Data) for instant visibility into viewer experience.

**Q: How would you design the cache key for a video streaming CDN?**

The cache key should include: URL path (which encodes content ID, rendition, codec, and segment number), and any parameters that change the response content (e.g., byte range). It should exclude: authentication tokens, session IDs, analytics parameters, and any per-user identifiers. The goal is to maximize cache sharing: all viewers of the same content, rendition, and segment should hit the same cache entry regardless of their authentication tokens.

### Adaptive Bitrate

**Q: What is per-title encoding and why does it matter?**

Per-title encoding creates a custom ABR encoding ladder for each piece of content based on its visual complexity. A simple animated show might encode beautifully at 1080p / 2 Mbps, while a complex action movie might need 1080p / 6 Mbps for equivalent quality. A fixed ladder either wastes bandwidth on simple content or under-serves complex content. Per-title encoding optimizes the quality-to-bitrate ratio for every title, reducing overall CDN bandwidth costs by 20-50% while maintaining or improving perceived quality.

**Q: Compare H.264, H.265, and AV1 for streaming delivery.**

H.264 has universal device support, is hardware-decoded everywhere, but is the least efficient. H.265 offers approximately 30-40% bitrate savings over H.264 at the same quality but has licensing complexities and incomplete browser support (no Firefox/Chrome on desktop). AV1 offers approximately 30-50% bitrate savings over H.265, is royalty-free, and has growing browser support (Chrome, Firefox, Edge) but requires significantly more encoding compute and hardware decoding support is still rolling out. Most platforms support all three and serve the most efficient codec each device supports.

### Live Streaming

**Q: How do you handle a CDN failure during a live event with millions of viewers?**

Multi-CDN is the primary defense. The system continuously monitors each CDN's health (error rates, latency, throughput) via both synthetic probes and real user metrics. When a CDN degrades, traffic is shifted to healthy CDNs within seconds. At the DNS level, unhealthy CDN endpoints are removed from resolution. At the client level, the player SDK can retry failed segment requests against an alternate CDN. At the manifest level, segment URLs can be rewritten to point to a backup CDN. The key is having automated, fast detection and switching rather than relying on manual intervention.

**Q: Explain how request coalescing works for live video segments.**

When a new live segment becomes available, hundreds or thousands of edge viewers request it simultaneously. Without coalescing, the edge would send hundreds of requests to origin for the same segment. With coalescing, the edge sends one request to origin and queues all other requests for the same segment. When the origin responds, the edge caches the segment and fulfills all queued requests from cache. This reduces origin load by orders of magnitude and is critical for live events at scale.

### DRM and Security

**Q: How does multi-DRM work with Common Encryption (CENC)?**

CENC (ISO 23001-7) allows content to be encrypted once with AES-128 CTR or CBC mode and decrypted by any supported DRM system. The content key is the same regardless of which DRM is used. Each DRM system provides its own mechanism to securely deliver this key to the player. The encrypted content contains PSSH (Protection System Specific Header) boxes for each DRM system. At playback, the platform's DRM module reads its PSSH box, contacts the corresponding license server, obtains the content key, and decrypts the content. This means you encrypt once and support Widevine, FairPlay, and PlayReady without re-encrypting.

**Q: How do you prevent unauthorized CDN access without breaking caching?**

Use token-based URL signing where the token parameters (expiration, IP restriction, path scope) are appended to the URL as query parameters. The CDN edge validates the token before serving. Critically, the token parameters must be excluded from the cache key so that the underlying content (which is the same for all authorized viewers) is cached once and served to all valid token holders. Most CDNs support configuring which query parameters are included in the cache key. Additionally, short-lived tokens (minutes) limit the window for token sharing.

### Analytics and Optimization

**Q: What QoE metrics would you track for a video streaming service, and why?**

The critical QoE metrics are: (1) Startup time, because studies show viewers abandon after 2-3 seconds of waiting. (2) Rebuffer rate, because even a single rebuffer event causes significant viewer dissatisfaction and increases churn. (3) Average bitrate and resolution, because higher quality increases engagement and retention. (4) Video start failure rate, because failed starts are the worst possible experience. (5) Error rates, to catch systemic issues before they impact many viewers. These metrics should be segmented by geography, device type, ISP, CDN, and content type to enable root cause analysis.

**Q: How would you implement a multi-CDN selection algorithm?**

The algorithm operates in a feedback loop. Client-side SDKs measure per-segment performance metrics (throughput, error rate, TTFB) for whichever CDN served the segment. These measurements are reported to a central analytics service. A decision engine aggregates recent measurements by CDN, region, and ISP. For each new session (or periodically during a session), the decision engine recommends the optimal CDN based on recent performance data. The recommendation can be delivered via DNS (longer feedback loop) or via client-side logic (per-segment switching). Cost constraints are layered on top: the algorithm ensures committed CDN volumes are met before routing traffic to more expensive overflow CDNs.

### Cost

**Q: How would you reduce CDN costs for a video platform by 30%?**

Several strategies combined can achieve this: (1) Per-title encoding to reduce bitrates by 20-30% without quality loss. (2) Migrate to more efficient codecs (AV1, H.265) for supported devices. (3) Optimize cache hit ratios to reduce origin egress (implement origin shield, increase segment duration, reduce ABR ladder fragmentation). (4) Multi-CDN with committed pricing: commit to volume discounts with primary CDN and use a secondary CDN for overflow at spot rates. (5) P2P delivery for popular live events to offload CDN egress. (6) Storage tiering to move cold content to cheaper storage. (7) Evaluate 95th percentile pricing if traffic is bursty.

### SSAI

**Q: Explain how server-side ad insertion works and its advantages over client-side.**

In SSAI, the ad insertion service sits between the origin and the CDN edge. When a viewer requests a manifest, the SSAI service detects ad break markers (SCTE-35), calls the ad decision server to get personalized ad URLs, and stitches the ad segment URLs into the manifest alongside content segment URLs. The viewer receives a single, continuous stream. Advantages over CSAI: ads cannot be blocked by ad blockers (they come from the same domain), there is no buffering at ad transitions, it works on all devices without an ad SDK, and analytics are more reliable because the server controls ad delivery. The main drawback is that personalization requires per-viewer manifest generation, which increases origin/SSAI service load.

### Edge Computing

**Q: What are practical use cases for edge computing in media delivery?**

Key use cases: (1) Manifest manipulation: modify HLS/DASH manifests at the edge for ad insertion, quality filtering, or A/B testing without round-tripping to origin. (2) Token validation: verify authentication tokens at the edge to reject unauthorized requests before they consume CDN resources. (3) Device-aware serving: inspect User-Agent or Client Hints at the edge to serve the optimal codec, resolution, or manifest for each device. (4) Geographic enforcement: block or allow content based on viewer location for licensing compliance. (5) Real-time personalization: customize the viewing experience (language, subtitles, audio track) based on viewer preferences stored in edge KV stores.

### System Design Scenarios

**Q: Design a video transcoding pipeline that can handle 10,000 hours of new content per day.**

Architecture:

1. **Ingest**: Content arrives via S3 upload, pull from partner CDN, or watch folder. An ingest service validates the source file (codec probing, duration check, corruption detection) and creates a job record.
2. **Job scheduler**: Prioritizes jobs (live > premium > standard > backfill). Breaks each title into chunk-level sub-jobs for parallel processing (split on GOPs or scene boundaries).
3. **Worker pool**: Auto-scaling pool of GPU and CPU workers. GPU workers handle time-critical jobs (live, new releases). CPU workers handle quality-critical jobs (catalog re-encodes with slow presets).
4. **Chunk processing**: Each worker transcodes its assigned chunk, uploads the output to intermediate storage.
5. **Assembly**: A concatenation service assembles chunks into complete renditions.
6. **Validation**: Automated QA checks duration, quality metrics (VMAF), segment alignment, audio sync.
7. **Packaging**: Generates HLS/DASH manifests and segments (or stores in JIT-ready format).
8. **Publication**: Writes to CDN origin storage and triggers cache warming for anticipated popular content.

Scale math: 10,000 hours/day = 417 hours/hour. If each worker processes 1 hour of content in 15 minutes (4x real-time, achievable with GPU encoding), you need approximately 105 workers running continuously. With chunked parallel processing and auto-scaling, you can handle bursts with fewer steady-state workers.

**Q: How would you architect a system to deliver live video to 100 million concurrent viewers?**

This is a scale challenge that requires careful capacity planning across every layer:

1. **Ingest**: Dual-path redundant ingest in 3+ regions. Use SRT for reliable contribution.
2. **Encoding**: Redundant encoders per region, outputting a common ABR ladder. Use GPU-accelerated encoding for real-time performance.
3. **Packaging**: JIT packaging (e.g., MediaPackage) to support HLS + DASH from a single encode.
4. **Multi-CDN**: No single CDN can handle 100M concurrent viewers at 5+ Mbps (500+ Tbps). Use 3-4 major CDNs (Akamai, CloudFront, Fastly, Cloudflare) with a CDN selection layer routing based on region, performance, and capacity.
5. **P2P augmentation**: For this scale, P2P delivery can offload 30-50% of CDN egress.
6. **Edge caching**: Request coalescing at every edge PoP. Aggressive prefetching of upcoming segments. Stale-while-revalidate for manifest freshness.
7. **Origin protection**: Origin shield per CDN per region. Rate limiting on origin. Pre-generated manifests where possible.
8. **Monitoring**: Real-time dashboards tracking per-CDN, per-region QoE. Automated traffic shifting when degradation is detected.
9. **Capacity**: 100M viewers at 5 Mbps average = 500 Tbps total egress. With 4 CDNs, each handles approximately 125 Tbps. With P2P offloading 40%, each CDN handles approximately 75 Tbps.
10. **Graceful degradation**: If capacity is exceeded, automatically reduce max ABR quality to lower bandwidth per viewer rather than failing entirely.

---

## Summary

CDN and media delivery is a deep domain that spans networking, distributed systems, video encoding, content protection, and real-time analytics. The key principles to remember:

- **Cache hierarchy and origin protection** are fundamental to scaling media delivery.
- **Adaptive bitrate** and **per-title encoding** optimize the quality-to-bandwidth trade-off.
- **Live streaming** demands unique caching strategies (short TTLs, request coalescing, manifest freshness).
- **Multi-DRM with CENC** enables cross-platform content protection without re-encryption.
- **SSAI** is the modern approach to monetization, combining ad blocker resistance with seamless viewer experience.
- **Multi-CDN** provides resilience, performance, and cost leverage at scale.
- **Edge computing** moves intelligence closer to viewers for personalization, security, and reduced latency.
- **QoE analytics** close the feedback loop, enabling data-driven optimization of every layer in the delivery chain.

Mastery of these concepts is essential for any engineer working on video platforms, streaming services, or large-scale content delivery systems.
