# Design a Video Streaming Platform (YouTube/Netflix)

A video streaming platform must handle massive-scale content upload, processing,
storage, and delivery while providing a smooth, low-latency viewing experience
across the globe. This guide walks through the end-to-end system design.

---

## 1. Requirements Clarification

### Functional Requirements

| Category        | Requirement                                                  |
| --------------- | ------------------------------------------------------------ |
| Upload          | Users can upload videos of any length (up to 12 hours)       |
| Streaming       | Users can stream videos with adaptive quality                |
| Search          | Full-text search over titles, descriptions, tags             |
| Recommendations | Personalized feed based on watch history and preferences     |
| Comments        | Threaded comments on videos                                  |
| Likes/Dislikes  | Users can like or dislike videos                             |
| Subscriptions   | Users subscribe to channels and receive updates              |
| Watch History   | Track and resume partially-watched videos                    |
| Playlists       | Users can create and share playlists                         |
| Notifications   | New video alerts for subscribed channels                     |

### Non-Functional Requirements

| Requirement       | Target                                                      |
| ----------------- | ----------------------------------------------------------- |
| Streaming quality | Adaptive bitrate, no buffering on stable connections        |
| Startup latency   | < 2 seconds to first frame                                  |
| Availability      | 99.99% uptime (< 53 min downtime/year)                     |
| Global reach      | Low-latency streaming from any continent                    |
| Durability        | Zero data loss for uploaded content (11 nines durability)   |
| Consistency       | Eventual consistency acceptable for view counts, likes      |
| Upload processing | Videos available for streaming within 10 minutes of upload  |

### Scale Estimates

| Metric                    | Value                          |
| ------------------------- | ------------------------------ |
| Total users               | 2 billion                      |
| Daily active users (DAU)  | 800 million                    |
| Video uploads per minute  | 500 hours                      |
| Video views per day       | 1 billion                      |
| Average video length      | 7 minutes                      |
| Average watch time/day    | 40 minutes per user            |
| Total videos stored       | 800 million+                   |

### Back-of-Envelope Calculations

#### Storage

```
Upload rate:
  500 hours/min = 30,000 hours/day = 10,950,000 hours/year

Average video size (original upload):
  1 hour of 1080p ~ 3 GB
  30,000 hours/day x 3 GB = 90 PB/day (raw uploads)

After transcoding (multiple resolutions):
  Each video is stored in ~6 resolutions + audio tracks
  Transcoded output ~ 3x raw size = 270 PB/day total new storage

Annual storage growth:
  270 PB/day x 365 = ~98 EB/year

  (In practice, compression and deduplication reduce this significantly.
   YouTube stores an estimated 1-10 exabytes total as of 2024.)
```

#### Bandwidth

```
Video views per day: 1 billion
Average watch duration per view: 7 minutes
Average bitrate: 5 Mbps (720p-1080p mix)

Egress bandwidth:
  1B views x 7 min x 60 sec x 5 Mbps = 2.1 x 10^12 Mb/day
  = 2.1 Petabits/day
  = 24.3 Tbps average
  Peak (2x average): ~50 Tbps

Daily egress:
  2.1 Pb/day = 262 PB/day

Monthly egress:
  ~8 EB/month

CDN cost estimate (at $0.02/GB for top-tier CDN):
  262 PB/day x $0.02/GB = 262,000 TB x $20/TB = $5.24M/day
  ~ $157M/month on CDN alone
```

#### Upload Bandwidth

```
Upload rate: 500 hours/min = ~8.3 hours/sec
At 3 GB/hour: 8.3 x 3 = 25 GB/s = 200 Gbps ingest bandwidth
```

#### Transcoding Compute

```
Transcoding 1 hour of video to 6 resolutions:
  ~6 CPU-hours (with hardware acceleration)

500 hours uploaded per minute:
  500 x 6 = 3,000 CPU-hours per minute of uploads
  = 50 CPU-hours per second
  Need ~50 powerful machines running continuously
  (In practice: 500-1000 machines with auto-scaling for bursts)
```

---

## 2. API Design

### Video Upload

```
POST /v1/videos/upload-url
Authorization: Bearer <token>
Content-Type: application/json

Request:
{
  "title": "My Video",
  "description": "A great video",
  "tags": ["tech", "tutorial"],
  "category": "education",
  "visibility": "public",        // public | unlisted | private
  "file_name": "recording.mp4",
  "file_size": 1073741824,       // bytes
  "content_type": "video/mp4"
}

Response 200:
{
  "video_id": "v_abc123",
  "upload_url": "https://storage.example.com/upload/...",  // pre-signed URL
  "upload_id": "upl_xyz789",
  "expires_at": "2024-01-15T12:00:00Z"
}
```

### Resumable Upload (tus protocol)

```
// Step 1: Create upload
POST /v1/videos/upload
Tus-Resumable: 1.0.0
Upload-Length: 1073741824
Upload-Metadata: title bXkgdmlkZW8=, type dmlkZW8vbXA0

Response 201:
Location: /v1/videos/upload/upl_xyz789
Tus-Resumable: 1.0.0

// Step 2: Upload chunk
PATCH /v1/videos/upload/upl_xyz789
Tus-Resumable: 1.0.0
Upload-Offset: 0
Content-Type: application/offset+octet-stream
Content-Length: 5242880

<binary data>

Response 204:
Upload-Offset: 5242880

// Step 3: Resume after failure (check current offset)
HEAD /v1/videos/upload/upl_xyz789

Response 200:
Upload-Offset: 5242880
Upload-Length: 1073741824
```

### Video Streaming

```
GET /v1/videos/{video_id}/manifest.m3u8
Authorization: Bearer <token>

Response 200:
Content-Type: application/vnd.apple.mpegurl

#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360
/v1/videos/v_abc123/360p/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1400000,RESOLUTION=854x480
/v1/videos/v_abc123/480p/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720
/v1/videos/v_abc123/720p/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080
/v1/videos/v_abc123/1080p/playlist.m3u8
```

### Search

```
GET /v1/search?q=system+design&type=video&sort=relevance&page=1&limit=20
Authorization: Bearer <token>

Response 200:
{
  "results": [
    {
      "video_id": "v_abc123",
      "title": "System Design Interview Guide",
      "thumbnail_url": "https://cdn.example.com/thumbs/v_abc123.jpg",
      "duration": 1845,
      "channel": { "id": "ch_001", "name": "TechChannel" },
      "views": 1250000,
      "published_at": "2024-01-10T08:00:00Z"
    }
  ],
  "total": 15432,
  "page": 1,
  "has_next": true
}
```

### Recommendations

```
GET /v1/feed/recommendations?page=1&limit=20
Authorization: Bearer <token>

Response 200:
{
  "videos": [
    {
      "video_id": "v_def456",
      "title": "Advanced Algorithms",
      "thumbnail_url": "https://cdn.example.com/thumbs/v_def456.jpg",
      "duration": 2400,
      "channel": { "id": "ch_002", "name": "CS Academy" },
      "views": 890000,
      "reason": "Because you watched 'Data Structures 101'"
    }
  ],
  "page": 1,
  "has_next": true
}
```

### Upload Strategy Comparison

| Strategy            | Pros                                       | Cons                                  | Best For           |
| ------------------- | ------------------------------------------ | ------------------------------------- | ------------------ |
| Direct upload       | Simple implementation                      | Server bandwidth bottleneck           | Small files < 100MB|
| Pre-signed URL      | Offloads to object storage                 | No resume on failure                  | Medium files       |
| Resumable (tus)     | Fault-tolerant, resume after disconnection | More complex client & server logic    | Large video files  |
| Chunked multipart   | Parallel upload of chunks                  | Chunk assembly complexity             | Very large files   |

**Decision**: Use resumable upload (tus protocol) as the primary strategy. Videos are
large files uploaded over potentially unreliable connections (mobile). The ability to
resume after network failure is critical for user experience.

---

## 3. High-Level Architecture

### Upload Flow

```
                              Upload Flow
 ============================================================================

 +--------+     +----------------+     +------------------+
 | Client |---->| API Gateway /  |---->| Upload Service   |
 | (Web/  |     | Load Balancer  |     | - Validate       |
 |  App)  |     +----------------+     | - Generate URL   |
 +--------+            |               +------------------+
     |                 |                        |
     |                 v                        v
     |          +-------------+         +---------------+
     |          | Auth Service|         | Metadata DB   |
     |          +-------------+         | (PostgreSQL)  |
     |                                  +---------------+
     |
     |  (Direct upload via pre-signed URL)
     |
     v
 +-------------------+     +---------------------+     +----------------+
 | Object Storage    |---->| Message Queue       |---->| Transcoding    |
 | (S3 / GCS)       |     | (Kafka / SQS)       |     | Workers        |
 | - Raw video       |     | - upload.completed  |     | - FFmpeg       |
 +-------------------+     | - transcode.request |     | - GPU-accel    |
                           +---------------------+     +----------------+
                                                              |
                                    +-------------------------+
                                    |           |             |
                                    v           v             v
                              +---------+ +---------+ +-------------+
                              | 360p    | | 720p    | | 1080p / 4K  |
                              | encode  | | encode  | | encode      |
                              +---------+ +---------+ +-------------+
                                    |           |             |
                                    v           v             v
                           +------------------------------------------+
                           |        Object Storage (Transcoded)       |
                           |  /v_abc123/360p/segment_001.ts           |
                           |  /v_abc123/720p/segment_001.ts           |
                           |  /v_abc123/1080p/segment_001.ts          |
                           |  /v_abc123/manifest.m3u8                 |
                           +------------------------------------------+
                                              |
                                              v
                                    +------------------+
                                    | CDN (CloudFront  |
                                    | / Akamai / own)  |
                                    +------------------+
```

### Streaming Flow

```
                             Streaming Flow
 ============================================================================

 +--------+                                              +-----------------+
 | Client |----(1) GET /manifest.m3u8------------------->| CDN Edge PoP   |
 | Player |                                              | (closest to    |
 |        |<---(2) Return master playlist----------------|  user)         |
 |        |                                              +-----------------+
 |        |                                                  |  Cache Miss?
 |        |                                                  v
 |        |                                              +-----------------+
 |        |                                              | CDN Regional   |
 |        |                                              | PoP            |
 |        |                                              +-----------------+
 |        |                                                  |  Cache Miss?
 |        |                                                  v
 |        |                                              +-----------------+
 |        |                                              | Origin Server  |
 |        |                                              | + Object Store |
 |        |                                              +-----------------+
 |        |
 |        |----(3) GET /720p/playlist.m3u8-------------->| CDN Edge       |
 |        |<---(4) Return resolution playlist------------|                |
 |        |                                              |                |
 |        |----(5) GET /720p/segment_001.ts------------->|                |
 |        |<---(6) Return video segment------------------|                |
 |        |                                              |                |
 |        |----(7) GET /720p/segment_002.ts------------->|                |
 |        |<---(8) Return video segment------------------|                |
 +--------+                                              +----------------+

     ABR: Client measures bandwidth and switches resolution dynamically
     e.g., step 9 might request /480p/segment_003.ts if bandwidth drops
```

### Full System Overview

```
 +-----------------------------------------------------------------------+
 |                          CLIENT LAYER                                 |
 |  +----------+  +-----------+  +------------+  +------------------+   |
 |  | Web App  |  | iOS App   |  | Android    |  | Smart TV / OTT   |   |
 |  | (React)  |  | (Swift)   |  | (Kotlin)   |  | (Roku, Fire TV)  |   |
 |  +----------+  +-----------+  +------------+  +------------------+   |
 +-----------------------------------------------------------------------+
              |                    |                       |
              v                    v                       v
 +-----------------------------------------------------------------------+
 |                      CDN LAYER (Global)                               |
 |  200+ PoPs worldwide, edge caching, TLS termination                  |
 +-----------------------------------------------------------------------+
              |
              v
 +-----------------------------------------------------------------------+
 |                     API GATEWAY / LOAD BALANCER                       |
 |  Rate limiting, authentication, routing, request logging              |
 +-----------------------------------------------------------------------+
              |
     +--------+--------+--------+--------+--------+
     v        v        v        v        v        v
 +------+ +------+ +------+ +------+ +------+ +--------+
 |Upload| |Stream| |Search| |Recom-| |User  | |Comment |
 |Svc   | |Svc   | |Svc   | |mend  | |Svc   | |Svc     |
 +------+ +------+ +------+ +------+ +------+ +--------+
     |        |        |        |        |        |
     v        v        v        v        v        v
 +-----------------------------------------------------------------------+
 |                        DATA LAYER                                     |
 |  +----------+  +----------+  +----------+  +-----+  +----------+    |
 |  |PostgreSQL|  |Cassandra |  |Elastic-  |  |Redis|  |Object    |    |
 |  |(metadata)|  |(views,   |  |search    |  |(cache| |Storage   |    |
 |  |          |  | history) |  |(search)  |  | sess)| |(S3/GCS)  |    |
 |  +----------+  +----------+  +----------+  +-----+  +----------+    |
 +-----------------------------------------------------------------------+
              |
              v
 +-----------------------------------------------------------------------+
 |                    ASYNC PROCESSING LAYER                             |
 |  +----------+  +-------------+  +----------+  +------------------+   |
 |  | Kafka    |  | Transcoding |  | ML Pipe- |  | Notification     |   |
 |  | (events) |  | Workers     |  | line     |  | Service          |   |
 |  +----------+  +-------------+  +----------+  +------------------+   |
 +-----------------------------------------------------------------------+
```

---

## 4. Data Model

### Videos Table (PostgreSQL - sharded by video_id)

```sql
CREATE TABLE videos (
    video_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id      UUID NOT NULL REFERENCES channels(channel_id),
    title           VARCHAR(500) NOT NULL,
    description     TEXT,
    category        VARCHAR(50),
    tags            TEXT[],
    visibility      VARCHAR(20) DEFAULT 'private',    -- public/unlisted/private
    status          VARCHAR(20) DEFAULT 'uploading',  -- uploading/processing/ready/failed
    duration_sec    INTEGER,
    original_url    TEXT,                              -- S3 path to original
    manifest_url    TEXT,                              -- path to HLS manifest
    thumbnail_url   TEXT,
    file_size_bytes BIGINT,
    resolution      VARCHAR(10),                      -- original resolution
    language        VARCHAR(10),
    captions_url    TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    published_at    TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_videos_channel ON videos(channel_id, published_at DESC);
CREATE INDEX idx_videos_status ON videos(status);
CREATE INDEX idx_videos_category ON videos(category, published_at DESC);
```

### Users Table (PostgreSQL)

```sql
CREATE TABLE users (
    user_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username        VARCHAR(50) UNIQUE NOT NULL,
    email           VARCHAR(255) UNIQUE NOT NULL,
    display_name    VARCHAR(100),
    avatar_url      TEXT,
    bio             TEXT,
    country         VARCHAR(5),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE channels (
    channel_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(user_id),
    name            VARCHAR(100) NOT NULL,
    description     TEXT,
    banner_url      TEXT,
    subscriber_count BIGINT DEFAULT 0,
    video_count     INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### Subscriptions Table (PostgreSQL - sharded by subscriber_id)

```sql
CREATE TABLE subscriptions (
    subscriber_id   UUID NOT NULL REFERENCES users(user_id),
    channel_id      UUID NOT NULL REFERENCES channels(channel_id),
    notify          BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (subscriber_id, channel_id)
);

CREATE INDEX idx_subscriptions_channel ON subscriptions(channel_id);
```

### Comments Table (PostgreSQL - sharded by video_id)

```sql
CREATE TABLE comments (
    comment_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id        UUID NOT NULL REFERENCES videos(video_id),
    user_id         UUID NOT NULL REFERENCES users(user_id),
    parent_id       UUID REFERENCES comments(comment_id),  -- for threading
    content         TEXT NOT NULL,
    like_count      INTEGER DEFAULT 0,
    reply_count     INTEGER DEFAULT 0,
    is_edited       BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_comments_video ON comments(video_id, created_at DESC);
CREATE INDEX idx_comments_parent ON comments(parent_id);
```

### Video Stats Table (Cassandra - optimized for high-write throughput)

```sql
-- Cassandra table for real-time counters
CREATE TABLE video_stats (
    video_id    UUID,
    view_count  COUNTER,
    like_count  COUNTER,
    dislike_count COUNTER,
    share_count COUNTER,
    comment_count COUNTER,
    PRIMARY KEY (video_id)
);

-- Time-series analytics (partitioned by video + date)
CREATE TABLE video_views_daily (
    video_id    UUID,
    view_date   DATE,
    view_count  COUNTER,
    watch_time_sec COUNTER,
    PRIMARY KEY (video_id, view_date)
) WITH CLUSTERING ORDER BY (view_date DESC);
```

### Watch History Table (Cassandra)

```sql
CREATE TABLE watch_history (
    user_id         UUID,
    watched_at      TIMEUUID,
    video_id        UUID,
    progress_sec    INT,           -- resume position
    duration_sec    INT,
    completed       BOOLEAN,
    PRIMARY KEY (user_id, watched_at)
) WITH CLUSTERING ORDER BY (watched_at DESC)
  AND default_time_to_live = 31536000;  -- 1 year TTL
```

### Video Processing Jobs Table (PostgreSQL)

```sql
CREATE TABLE video_processing_jobs (
    job_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id        UUID NOT NULL REFERENCES videos(video_id),
    job_type        VARCHAR(50) NOT NULL,   -- transcode/thumbnail/caption
    resolution      VARCHAR(10),
    codec           VARCHAR(20),
    status          VARCHAR(20) DEFAULT 'pending',
    priority        INTEGER DEFAULT 5,
    input_path      TEXT NOT NULL,
    output_path     TEXT,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    error_message   TEXT,
    retry_count     INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_jobs_status ON video_processing_jobs(status, priority DESC);
CREATE INDEX idx_jobs_video ON video_processing_jobs(video_id);
```

### Data Model Relationships

```
 +----------+       +----------+       +-----------+
 | users    |1----*>| channels |1----*>| videos    |
 +----------+       +----------+       +-----------+
      |                   ^                  |
      |                   |                  |
      |  +----------------+            +-----+-----+
      |  |                             |           |
      v  v                             v           v
 +---------------+              +-----------+ +----------+
 | subscriptions |              | comments  | |video_stats|
 +---------------+              +-----------+ +----------+
                                     |
                                     v
                                +-----------+
                                | (replies) |
                                +-----------+
```

---

## 5. Video Upload & Processing Pipeline

### Upload Flow (Step by Step)

```
 Step 1: Client requests upload URL
 ===================================

 Client                  Upload Service           Object Storage (S3)
   |                          |                          |
   |-- POST /upload-url ----->|                          |
   |   {title, size, type}   |                          |
   |                          |-- Generate pre-signed -->|
   |                          |   PUT URL               |
   |                          |<-- Signed URL -----------|
   |                          |                          |
   |                          |-- INSERT video record -->|  (Metadata DB)
   |                          |   status: 'uploading'   |
   |                          |                          |
   |<-- {video_id,            |                          |
   |     upload_url} ---------|                          |

 Step 2: Client uploads directly to S3
 =======================================

 Client                                  Object Storage (S3)
   |                                          |
   |-- PUT <upload_url> --------------------->|
   |   Content-Type: video/mp4               |
   |   <binary video data>                   |
   |                                          |
   |   (For resumable: PATCH with offset)    |
   |                                          |
   |<-- 200 OK -------------------------------|

 Step 3: S3 event notification triggers processing
 ==================================================

 Object Storage        Message Queue          Upload Service
   |                      |                        |
   |-- S3 Event --------->|                        |
   |   (ObjectCreated)   |                        |
   |                      |-- upload.completed --->|
   |                      |                        |
   |                      |     Update video status to 'processing'
   |                      |                        |
   |                      |<-- transcode.request --|
   |                      |   {video_id, paths,   |
   |                      |    target_resolutions} |

 Step 4: Transcoding pipeline processes the video
 ==================================================

   Message Queue          Transcoding Orchestrator
      |                          |
      |-- transcode.request ---->|
      |                          |
      |     Create DAG of tasks:
      |     1. Probe video metadata
      |     2. Split into segments
      |     3. Transcode each resolution (parallel)
      |     4. Generate thumbnails
      |     5. Extract audio tracks
      |     6. Generate manifest files
      |     7. Upload transcoded segments to S3
      |     8. Notify completion
      |                          |
      |<-- transcode.completed --|
```

### Transcoding Pipeline (DAG)

```
                      Transcoding DAG for a Single Video
 ============================================================================

                          +------------------+
                          | 1. Probe Video   |
                          |    (FFprobe)     |
                          |    - codec info  |
                          |    - resolution  |
                          |    - duration    |
                          |    - audio info  |
                          +--------+---------+
                                   |
                          +--------v---------+
                          | 2. Split into    |
                          |    Segments      |
                          |    (10 sec each) |
                          +--------+---------+
                                   |
              +--------------------+--------------------+
              |                    |                    |
     +--------v-------+  +--------v-------+  +--------v-------+
     | 3a. Transcode  |  | 3b. Transcode  |  | 3c. Transcode  |
     |     240p       |  |     360p       |  |     480p       |
     |     H.264      |  |     H.264      |  |     H.264      |
     +--------+-------+  +--------+-------+  +--------+-------+
              |                    |                    |
              |    +---------------+----+              |
              |    |               |    |              |
              |    |  +--------v--+--v-+--v-------+   |
              |    |  | 3d. Transcode  | 3e.      |   |
              |    |  |     720p       |  1080p   |   |
              |    |  |     H.264     |  H.264   |   |
              |    |  +-------+-------+ +----+---+   |
              |    |          |              |        |
              +----+----------+--------------+--------+
                              |
                   +----------+----------+
                   |                     |
          +--------v-------+   +--------v--------+
          | 4. Generate    |   | 5. Extract      |
          |    Thumbnails  |   |    Audio Tracks |
          |    - sprite    |   |    - AAC 128k   |
          |    - poster    |   |    - AAC 256k   |
          |    - timeline  |   +--------+--------+
          +--------+-------+            |
                   |                    |
                   +----------+---------+
                              |
                   +----------v----------+
                   | 6. Generate         |
                   |    Manifest Files   |
                   |    - master.m3u8    |
                   |    - per-resolution |
                   |      playlists      |
                   +----------+----------+
                              |
                   +----------v----------+
                   | 7. Upload to S3     |
                   |    /videos/v_abc123/|
                   |      /240p/         |
                   |      /360p/         |
                   |      /480p/         |
                   |      /720p/         |
                   |      /1080p/        |
                   |      manifest.m3u8  |
                   +----------+----------+
                              |
                   +----------v----------+
                   | 8. Publish Event    |
                   |    - Update status  |
                   |      to 'ready'     |
                   |    - Notify user    |
                   |    - Invalidate CDN |
                   +---------------------+
```

### Transcoding Configuration Matrix

| Resolution | Bitrate (H.264) | Bitrate (H.265) | Bitrate (VP9) | Bitrate (AV1) |
| ---------- | ---------------- | ---------------- | ------------- | ------------- |
| 240p       | 400 kbps         | 250 kbps         | 200 kbps      | 150 kbps      |
| 360p       | 700 kbps         | 450 kbps         | 400 kbps      | 300 kbps      |
| 480p       | 1,200 kbps       | 750 kbps         | 700 kbps      | 500 kbps      |
| 720p       | 2,500 kbps       | 1,500 kbps       | 1,400 kbps    | 1,000 kbps    |
| 1080p      | 5,000 kbps       | 3,000 kbps       | 2,800 kbps    | 2,000 kbps    |
| 4K         | 16,000 kbps      | 10,000 kbps      | 9,000 kbps    | 6,000 kbps    |

### Codec Selection Strategy

```
Decision tree for codec selection:

  Is the video popular (>10K views in first 24h)?
    |
    +-- YES: Transcode to ALL codecs (H.264, H.265, VP9, AV1)
    |        AV1 saves 50% bandwidth vs H.264 at scale
    |
    +-- NO:  Transcode to H.264 only (universal compatibility)
             Queue VP9/AV1 transcoding for later if views grow
```

---

## 6. Video Streaming Deep Dive

### Streaming Protocol Comparison

| Feature              | HLS                  | DASH                 | RTMP              |
| -------------------- | -------------------- | -------------------- | ----------------- |
| Full Name            | HTTP Live Streaming  | Dynamic Adaptive     | Real-Time         |
|                      |                      | Streaming over HTTP  | Messaging Protocol|
| Developer            | Apple                | MPEG                 | Adobe             |
| Transport            | HTTP                 | HTTP                 | TCP               |
| Manifest Format      | .m3u8                | .mpd (XML)           | N/A               |
| Segment Format       | .ts or .fmp4         | .m4s or .mp4         | FLV               |
| Adaptive Bitrate     | Yes                  | Yes                  | Limited           |
| DRM Support          | FairPlay, Widevine   | Widevine, PlayReady  | Limited           |
| Latency              | 6-30s (LL-HLS: 2-5s)| 3-10s (LL-DASH: 2-3s)| 1-3s              |
| Browser Support      | Safari native, JS    | JS players           | Flash (deprecated)|
|                      | players everywhere   | everywhere           |                   |
| CDN Friendly         | Very (HTTP-based)    | Very (HTTP-based)    | Poor              |
| Industry Adoption    | Very high            | High                 | Legacy only       |

**Decision**: Use HLS as primary protocol with DASH as fallback. HLS has the widest
device support (iOS, Android, smart TVs) and works seamlessly with HTTP-based CDNs.

### Adaptive Bitrate Streaming (ABR)

```
 Adaptive Bitrate Streaming
 ============================================================================

  Client Bandwidth
  (Mbps)
    ^
  8 |                                    ___________
    |                                   /           \
  6 |                    ______________/             \
    |                   /                             \
  4 |    ______________/                               \_______
    |   /                                                      \
  2 |  /                                                        \___
    | /
  0 +--+---+---+---+---+---+---+---+---+---+---+---+---+---+---+--> Time
       s1  s2  s3  s4  s5  s6  s7  s8  s9  s10 s11 s12 s13 s14 s15

  Quality Selected:
       360 360 480 720 720 1080 1080 1080 1080 1080 720 720 480 480 360

  +----------+     +-------------------+     +------------------+
  | Player   |     | ABR Algorithm     |     | Segment Request  |
  | Buffer   |---->| - Measure         |---->| GET /720p/       |
  | Monitor  |     |   throughput      |     |   segment_005.ts |
  |          |     | - Check buffer    |     |                  |
  |          |     |   level           |     |                  |
  |          |     | - Select quality  |     |                  |
  +----------+     +-------------------+     +------------------+

  ABR Algorithm Inputs:
  1. Measured download throughput of last N segments
  2. Current buffer level (seconds of video buffered)
  3. Buffer target (typically 30 seconds)
  4. Available quality levels from manifest

  ABR Algorithm Decision:
  - If throughput > 1.5x current bitrate AND buffer > 10s -> switch UP
  - If throughput < 0.8x current bitrate OR buffer < 5s -> switch DOWN
  - Otherwise -> maintain current quality
```

### HLS Manifest Structure

```
 Master Playlist (manifest.m3u8)
 ================================

 #EXTM3U
 #EXT-X-VERSION:6
 #EXT-X-INDEPENDENT-SEGMENTS

 # Audio-only tracks
 #EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",
   DEFAULT=YES,URI="audio/en/playlist.m3u8"
 #EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Spanish",
   DEFAULT=NO,URI="audio/es/playlist.m3u8"

 # Subtitle tracks
 #EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",
   DEFAULT=YES,URI="subs/en/playlist.m3u8"

 # Video variants (sorted by bandwidth)
 #EXT-X-STREAM-INF:BANDWIDTH=400000,RESOLUTION=426x240,
   CODECS="avc1.4d4015,mp4a.40.2",AUDIO="audio",SUBTITLES="subs"
 240p/playlist.m3u8

 #EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360,
   CODECS="avc1.4d401e,mp4a.40.2",AUDIO="audio",SUBTITLES="subs"
 360p/playlist.m3u8

 #EXT-X-STREAM-INF:BANDWIDTH=1400000,RESOLUTION=854x480,
   CODECS="avc1.4d401f,mp4a.40.2",AUDIO="audio",SUBTITLES="subs"
 480p/playlist.m3u8

 #EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720,
   CODECS="avc1.4d4020,mp4a.40.2",AUDIO="audio",SUBTITLES="subs"
 720p/playlist.m3u8

 #EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,
   CODECS="avc1.640028,mp4a.40.2",AUDIO="audio",SUBTITLES="subs"
 1080p/playlist.m3u8


 Resolution Playlist (720p/playlist.m3u8)
 ==========================================

 #EXTM3U
 #EXT-X-VERSION:6
 #EXT-X-TARGETDURATION:10
 #EXT-X-MEDIA-SEQUENCE:0
 #EXT-X-PLAYLIST-TYPE:VOD

 #EXTINF:10.000,
 segment_000.ts
 #EXTINF:10.000,
 segment_001.ts
 #EXTINF:10.000,
 segment_002.ts
 #EXTINF:10.000,
 segment_003.ts
 #EXTINF:7.500,
 segment_004.ts

 #EXT-X-ENDLIST
```

### Chunk-Based Delivery and Buffer Management

```
 Segment Timeline
 ============================================================================

 Video:  [seg0][seg1][seg2][seg3][seg4][seg5][seg6][seg7][seg8][seg9]...
          10s   10s   10s   10s   10s   10s   10s   10s   10s   10s

 Player Buffer State at time t=35s:
 ============================================================================

         Already played          Current     Buffered ahead
 |========================|====|=============================|
 seg0    seg1    seg2     ^seg3  seg4    seg5    seg6
                          |
                     Playhead (35s)

 Buffer level = 25 seconds ahead of playhead
 Target buffer = 30 seconds
 Action: Download seg7 at current quality

 Buffer Management Strategy:
 ============================================================================

 Buffer Level    Action
 ---------------------------------------------------------------
 < 2 seconds     EMERGENCY: Request lowest quality, pause playback
 2-5 seconds     Switch to lowest available quality immediately
 5-10 seconds    Step down one quality level
 10-30 seconds   Maintain current quality or step up if throughput allows
 > 30 seconds    Stop downloading until buffer drops below target
```

---

## 7. CDN Architecture

### Why CDN Is Critical for Video

```
 Without CDN:
 ============================================================================

 User in Tokyo         User in London        User in Sao Paulo
      |                     |                      |
      |   250ms RTT         |   150ms RTT          |   180ms RTT
      |                     |                      |
      +---------------------+----------------------+
                             |
                    Origin (US-East)

 Each 2MB segment requires:
   TCP handshake: 1 RTT
   TLS handshake: 2 RTT
   HTTP request:  1 RTT
   Data transfer: ~4 RTT (for 2MB at typical bandwidth)
   Total: ~8 RTT per segment

 For Tokyo user: 8 x 250ms = 2 seconds per segment
 With 10-second segments: barely keeping up, no buffer margin


 With CDN:
 ============================================================================

 User in Tokyo         User in London        User in Sao Paulo
      |                     |                      |
      |   5ms RTT           |   10ms RTT           |   8ms RTT
      |                     |                      |
 +----v-----+          +----v-----+           +----v-----+
 | CDN Edge |          | CDN Edge |           | CDN Edge |
 | Tokyo    |          | London   |           | Sao Paulo|
 +----+-----+          +----+-----+           +----+-----+
      |                     |                      |
      | 50ms                | 80ms                 | 120ms
      |                     |                      |
 +----v-----+          +----v-----+           +----v-----+
 | CDN Reg. |          | CDN Reg. |           | CDN Reg. |
 | Asia     |          | Europe   |           | S. America|
 +----+-----+          +----+-----+           +----+-----+
      |                     |                      |
      +---------------------+----------------------+
                             |
                    Origin (US-East)

 For Tokyo user: 8 x 5ms = 40ms per segment (50x improvement)
 Cache hit ratio target: 95%+ for popular content
```

### CDN Topology

```
 CDN Hierarchy (3-Tier)
 ============================================================================

 Tier 1: Edge PoPs (200+ locations worldwide)
 ============================================================================
 +-------+ +-------+ +-------+ +-------+ +-------+ +-------+
 |Tokyo  | |Seoul  | |Mumbai | |London | |NYC    | |SP     |
 |Edge   | |Edge   | |Edge   | |Edge   | |Edge   | |Edge   |
 |       | |       | |       | |       | |       | |       |
 |Cache: | |Cache: | |Cache: | |Cache: | |Cache: | |Cache: |
 |50TB   | |50TB   | |50TB   | |50TB   | |50TB   | |50TB   |
 +---+---+ +---+---+ +---+---+ +---+---+ +---+---+ +---+---+
     |         |         |         |         |         |
     +----+----+         |    +----+----+    |         |
          |              |    |         |    |         |
          v              v    v         v    v         v

 Tier 2: Regional PoPs (20-30 locations)
 ============================================================================
     +-----------+    +-----------+    +-----------+
     | Asia-Pac  |    | Europe    |    | Americas  |
     | Regional  |    | Regional  |    | Regional  |
     |           |    |           |    |           |
     | Cache:    |    | Cache:    |    | Cache:    |
     | 500TB     |    | 500TB     |    | 500TB     |
     +-----+-----+    +-----+-----+    +-----+-----+
           |                |                |
           +----------------+----------------+
                            |

 Tier 3: Origin Shield + Object Storage
 ============================================================================
                   +------------------+
                   | Origin Shield    |
                   | (collapse multi  |
                   |  edge requests   |
                   |  into one)       |
                   | Cache: 5PB      |
                   +--------+---------+
                            |
                   +--------v---------+
                   | Object Storage   |
                   | (S3 / GCS)       |
                   | All video data   |
                   +------------------+
```

### Cache Strategy

| Content Type         | Cache Duration | Strategy  | Notes                          |
| -------------------- | -------------- | --------- | ------------------------------ |
| Video segments (.ts) | 1 year         | Pull      | Immutable, content-addressed   |
| HLS manifests        | 10 seconds     | Pull      | Needs freshness for live       |
| Thumbnails           | 30 days        | Pull      | Regenerated on update          |
| Popular videos       | Proactive push | Push      | Pre-warm edge caches           |
| Long-tail content    | On-demand      | Pull      | Evicted by LRU                 |

### Push vs Pull CDN Strategy

```
 Content Popularity Distribution (Zipf's Law)
 ============================================================================

 Views
   ^
   |  *
   |  **
   |   ***
   |     *****
   |          **********
   |                    ****************************
   +---+---+---+---+---+---+---+---+---+---+---+---+----> Videos
       |       |                   |
   Top 0.1%  Top 1%            Top 10%
   (head)    (torso)           (long tail)

 Strategy:
 - Top 0.1% (viral/trending): PUSH to all edge PoPs proactively
   ~800 videos, stored on all 200 edge servers

 - Top 1%: PUSH to regional PoPs, pull to edge on demand
   ~8,000 videos, stored on 25 regional servers

 - Top 10%: Pull-through cache at edge, keep in regional
   ~80,000 videos

 - Remaining 90%: Pull from origin on demand, short cache TTL
   ~720,000,000 videos, mostly served from origin

 Cache Hit Ratio Target:
 - Edge: 85-90% (popular content)
 - Regional: 95% (includes torso content)
 - Origin Shield: 99% (protects object storage)
```

---

## 8. Recommendation System

### Architecture Overview

```
 Recommendation Pipeline
 ============================================================================

 +------------------+     +------------------+     +------------------+
 | Data Collection  |---->| Feature          |---->| Model Training   |
 |                  |     | Engineering      |     |                  |
 | - Watch history  |     | - User features  |     | - Collaborative  |
 | - Search queries |     | - Video features |     |   filtering      |
 | - Likes/dislikes |     | - Context (time, |     | - Content-based  |
 | - Watch time     |     |   device, loc)   |     | - Deep learning  |
 | - Subscriptions  |     | - Interaction    |     |   (two-tower)    |
 +------------------+     +------------------+     +------------------+
                                                          |
                                                          v
                                                   +------------------+
 +------------------+     +------------------+     | Candidate        |
 | Final Ranking    |<----| Re-Ranking       |<----| Generation       |
 |                  |     |                  |     |                  |
 | - Top N videos   |     | - Diversity      |     | - 1000 candidate |
 | - Personalized   |     | - Freshness      |     |   videos         |
 |   feed           |     | - Business rules |     | - From multiple  |
 | - Cached 5 min   |     | - Filter seen    |     |   sources        |
 +------------------+     +------------------+     +------------------+
```

### Collaborative Filtering

```
 User-Item Interaction Matrix
 ============================================================================

              Video1  Video2  Video3  Video4  Video5  Video6
 User A:      [  5      3       -       1       -       4  ]
 User B:      [  4      -       -       1       -       5  ]
 User C:      [  -      3       4       -       5       -  ]
 User D:      [  -      -       5       -       4       -  ]

 Approach: Matrix Factorization (ALS or SVD)
 - Decompose into User matrix (U) x Item matrix (V)
 - U: each user represented as a vector in latent space
 - V: each video represented as a vector in latent space
 - Predicted rating = dot product of user and video vectors
 - Fill in missing values to generate recommendations

 For User B (who liked Video1, Video4, Video6):
   Similar to User A -> recommend Video2 (rated 3 by A)
```

### Content-Based Filtering

```
 Video Feature Vectors
 ============================================================================

 Video features extracted:
 - Category: [education, tech, cooking, music, sports, ...]
 - Tags: TF-IDF weighted
 - Title/description: BERT embeddings (768-dim)
 - Visual features: CNN-extracted (from thumbnails/frames)
 - Audio features: duration, has_music, speech_ratio
 - Engagement signals: avg_watch_percentage, like_ratio

 User profile = weighted average of watched video feature vectors
 Recommendation = find videos with highest cosine similarity to user profile

 Cosine Similarity:
   sim(user, video) = (user_vec . video_vec) / (|user_vec| * |video_vec|)
```

### Two-Tower Deep Learning Model (Production Approach)

```
 Two-Tower Architecture
 ============================================================================

    User Tower                              Video Tower
 +-----------------+                    +-----------------+
 | User ID (embed) |                    | Video ID (embed)|
 | Watch history   |                    | Title (BERT)    |
 | Demographics    |                    | Category        |
 | Device/context  |                    | Tags            |
 +-----------------+                    | Duration        |
         |                              | Upload date     |
    +----v----+                         | Engagement stats|
    | Dense   |                         +-----------------+
    | Layers  |                                  |
    | (256)   |                             +----v----+
    | (128)   |                             | Dense   |
    | (64)    |                             | Layers  |
    +----+----+                             | (256)   |
         |                                  | (128)   |
    +----v----+                             | (64)    |
    | User    |                             +----+----+
    | Embed-  |                                  |
    | ding    |                             +----v----+
    | (64-dim)|                             | Video   |
    +----+----+                             | Embed-  |
         |                                  | ding    |
         |                                  | (64-dim)|
         |                                  +----+----+
         |                                       |
         +---> dot product / cosine sim <--------+
                        |
                   Score (0-1)

 Training: Optimize for watch time prediction
 Serving: Pre-compute video embeddings, compute user embedding in real-time
 ANN (Approximate Nearest Neighbor): Use FAISS/ScaNN for fast retrieval
```

### Feature Engineering Summary

| Feature Category | Features                                           | Source           |
| ---------------- | -------------------------------------------------- | ---------------- |
| User profile     | Age, country, language, device type                | Registration     |
| Watch history    | Last 100 videos watched, watch completion rate     | Event logs       |
| Engagement       | Like ratio, comment frequency, share frequency     | Event logs       |
| Context          | Time of day, day of week, session length           | Real-time        |
| Video metadata   | Title, description, tags, category, duration       | Upload metadata  |
| Video quality    | Resolution, production quality score               | ML model         |
| Social signals   | Subscriber count, video age, trending score        | Aggregated stats |
| Freshness        | Hours since upload, velocity of views              | Computed         |

---

## 9. Search

### Search Architecture

```
 Search Pipeline
 ============================================================================

 +--------+     +-----------+     +----------------+     +-------------+
 | Client |---->| API       |---->| Query          |---->| Elastic-    |
 | Query  |     | Gateway   |     | Understanding  |     | search      |
 |        |     |           |     | - Tokenize     |     | Cluster     |
 |        |     |           |     | - Spell check  |     |             |
 |        |     |           |     | - Synonyms     |     | Sharded by  |
 |        |     |           |     | - Expand query |     | video_id    |
 +--------+     +-----------+     +----------------+     +------+------+
                                                                |
                                                         +------v------+
 +--------+     +---------------+     +-------------+   | Raw Results |
 | Final  |<----| Personalized  |<----| Relevance   |<--| (top 1000)  |
 | Results|     | Re-ranking    |     | Scoring     |   |             |
 | (top20)|     |               |     |             |   +-------------+
 +--------+     +---------------+     +-------------+
```

### Elasticsearch Index Mapping

```json
{
  "mappings": {
    "properties": {
      "video_id":     { "type": "keyword" },
      "title":        { "type": "text", "analyzer": "custom_analyzer",
                        "fields": { "exact": { "type": "keyword" } } },
      "description":  { "type": "text", "analyzer": "custom_analyzer" },
      "tags":         { "type": "keyword" },
      "category":     { "type": "keyword" },
      "channel_name": { "type": "text",
                        "fields": { "exact": { "type": "keyword" } } },
      "language":     { "type": "keyword" },
      "duration_sec": { "type": "integer" },
      "view_count":   { "type": "long" },
      "like_count":   { "type": "long" },
      "published_at": { "type": "date" },
      "captions":     { "type": "text", "analyzer": "standard" },
      "embedding":    { "type": "dense_vector", "dims": 768 }
    }
  }
}
```

### Relevance Scoring Formula

```
 Final Score = w1 * text_relevance
             + w2 * engagement_score
             + w3 * freshness_score
             + w4 * personalization_score
             + w5 * quality_score

 Where:
   text_relevance     = BM25(query, title) * 3.0
                      + BM25(query, description) * 1.0
                      + BM25(query, tags) * 2.0
                      + BM25(query, captions) * 0.5

   engagement_score   = log(1 + view_count) * 0.3
                      + like_ratio * 0.4
                      + avg_watch_completion * 0.3

   freshness_score    = exp(-age_days / 30)   (exponential decay)

   personalization    = cosine_sim(user_embedding, video_embedding)

   quality_score      = channel_authority * 0.5
                      + production_quality * 0.3
                      + content_safety * 0.2

 Typical weights: w1=0.4, w2=0.25, w3=0.1, w4=0.15, w5=0.1
```

### Search Ranking Factors

| Factor                  | Weight | Description                                 |
| ----------------------- | ------ | ------------------------------------------- |
| Title match             | High   | Exact and partial matches in title           |
| Tag match               | High   | Query terms matching video tags              |
| Description match       | Medium | Query terms in description                   |
| Caption match           | Low    | Query terms in auto-generated captions       |
| View count              | Medium | Logarithmic scale of total views             |
| Like/dislike ratio      | Medium | Higher ratio = better content signal         |
| Watch completion rate   | Medium | Videos people finish rank higher             |
| Freshness               | Low    | Newer videos get a small boost               |
| Channel authority       | Low    | Established channels with consistent quality |
| User personalization    | Medium | Based on user's watch history and prefs      |

---

## 10. Scaling

### Storage Scaling

```
 Storage Architecture
 ============================================================================

 +------------------------------------------------------------------+
 |                     Object Storage (S3)                          |
 |                                                                  |
 |  Bucket: videos-raw                                              |
 |  ├── Lifecycle: Move to S3-IA after 30 days                     |
 |  ├── Lifecycle: Move to Glacier after 1 year                    |
 |  └── Lifecycle: Delete after 7 years (if no views in 3 years)   |
 |                                                                  |
 |  Bucket: videos-transcoded                                       |
 |  ├── Hot tier (S3 Standard): last 30 days + popular videos      |
 |  ├── Warm tier (S3-IA): 30 days - 1 year old, moderate views    |
 |  └── Cold tier (S3 Glacier IR): >1 year, low views              |
 |                                                                  |
 |  Bucket: thumbnails                                              |
 |  └── S3 Standard (always hot, small files, frequent access)     |
 +------------------------------------------------------------------+

 Storage Cost Optimization:
 ============================================================

 Tier          | Cost/GB/mo | Content                | % of Data
 --------------|------------|------------------------|----------
 S3 Standard   | $0.023     | Recent + popular       | 15%
 S3-IA         | $0.0125    | Moderate access         | 25%
 S3 Glacier IR | $0.004     | Rare access, fast read | 40%
 S3 Glacier DA | $0.00099   | Archive, 12h retrieval | 20%

 Blended rate: ~$0.007/GB/month
 For 1 EB of storage: ~$7M/month (vs $23M if all Standard)
```

### Database Sharding Strategy

```
 Metadata Database (PostgreSQL) Sharding
 ============================================================================

 Shard Key: video_id (consistent hashing)

 +----------+  +----------+  +----------+  +----------+
 | Shard 0  |  | Shard 1  |  | Shard 2  |  | Shard 3  |
 | videos   |  | videos   |  | videos   |  | videos   |
 | 0-25%    |  | 25-50%   |  | 50-75%   |  | 75-100%  |
 | hash     |  | hash     |  | hash     |  | hash     |
 | range    |  | range    |  | range    |  | range    |
 +----+-----+  +----+-----+  +----+-----+  +----+-----+
      |              |              |              |
      +--- Each shard: Primary + 2 Read Replicas --+

 Shard count: start with 16, expand to 64+ with consistent hashing
 Each shard: ~50M videos

 User Database: Shard by user_id
 Comments: Shard by video_id (co-located with video metadata)
 Subscriptions: Shard by subscriber_id (for user's subscription list)
                Secondary index by channel_id (for subscriber count)
```

### Transcoding Auto-Scaling

```
 Transcoding Worker Fleet
 ============================================================================

 +--------------------+
 | Job Queue (SQS)    |     Scaling Policy:
 | - Priority queue   |     - Target: < 5 min queue wait time
 | - DLQ for failures |     - Scale up: when queue depth > 1000
 +--------+-----------+     - Scale down: when queue depth < 100
          |                 - Min: 50 instances
          v                 - Max: 2000 instances
 +---+---+---+---+---+     - Cool down: 5 minutes
 | W | W | W | W | W |
 | 1 | 2 | 3 | 4 | 5 |     Instance Type:
 +---+---+---+---+---+     - GPU instances (g5.xlarge) for H.265/AV1
 | W | W | W | W | W |     - CPU instances (c6i.8xlarge) for H.264
 | 6 | 7 | 8 | 9 |10 |    - Spot instances for non-urgent transcoding
 +---+---+---+---+---+       (70% cost savings, handle interruption)
         ...
 +---+---+---+---+---+
 | W | W | W | W | W |
 |46 |47 |48 |49 |50 |
 +---+---+---+---+---+

 Priority Levels:
   P0: Paying creators (SLA: processed in 5 min)
   P1: Regular uploads (SLA: processed in 15 min)
   P2: Re-encoding existing content (SLA: 24 hours)
   P3: Speculative format transcoding (best effort)
```

### View Counting at Scale

```
 View Count Pipeline (handling 1B+ views/day)
 ============================================================================

 Problem: Direct database increment for each view = DB meltdown

 Solution: Multi-layer aggregation

 Layer 1: Client-side deduplication
 +--------+     Client debounces view events (1 per video per 30 seconds)
 | Client |     Filter out bot-like patterns
 +---+----+
     |
 Layer 2: Edge aggregation
     v
 +---+----------+     Count views per video per edge server
 | Edge Counter |     Flush every 10 seconds
 | (in-memory)  |     Local HyperLogLog for unique viewer estimation
 +---+----------+
     |
 Layer 3: Kafka stream processing
     v
 +---+----------+     Aggregate view events from all edges
 | Kafka Streams|     Windowed aggregation (1-minute tumbling windows)
 | / Flink      |     Deduplication using probabilistic data structures
 +---+----------+
     |
 Layer 4: Batch update to database
     v
 +---+----------+     Batch UPDATE every 1 minute
 | Cassandra    |     UPDATE video_stats SET view_count = view_count + delta
 | (counters)   |     Approximate count (within 2% accuracy)
 +---+----------+
     |
 Layer 5: Cache for reads
     v
 +---+----------+     Cache view counts in Redis (TTL: 60 seconds)
 | Redis Cache  |     Serve read requests from cache
 +---+----------+     Only go to Cassandra on cache miss

 Accuracy vs Performance Tradeoff:
 - Real-time display: approximate count (within ~2%), updated every minute
 - Analytics dashboard: exact count from batch processing (hourly)
 - Monetization: exact count from audited batch pipeline (daily)
```

---

## 11. Cost Optimization

### Cost Breakdown (Estimated Monthly at Full Scale)

```
 Monthly Cost Breakdown
 ============================================================================

 Category              | Cost/Month  | % of Total | Notes
 ----------------------|-------------|------------|---------------------------
 CDN / Bandwidth       | $150M       | 50%        | Largest cost by far
 Storage (Object)      | $70M        | 23%        | With tiering optimization
 Transcoding Compute   | $30M        | 10%        | GPU + CPU fleet
 Metadata Databases    | $15M        | 5%         | PostgreSQL + Cassandra
 Search (Elasticsearch)| $10M        | 3%         | Large cluster
 ML / Recommendations  | $10M        | 3%         | Training + serving
 Other (Auth, API, etc)| $15M        | 5%         | Supporting services
 ----------------------|-------------|------------|
 Total                 | ~$300M      | 100%       |
```

### Storage Tiering Strategy

```
 Video Lifecycle and Storage Tier Migration
 ============================================================================

 Upload  1 day   7 days  30 days  1 year   3 years  7 years
   |       |       |       |        |         |        |
   v       v       v       v        v         v        v
 [Raw Upload]--->[Delete raw after transcoding confirmed]
 [Transcoded]--->[S3 Standard]--->[S3-IA]--------->[Glacier IR]-->[Glacier DA]
 [Thumbnails]--->[S3 Standard (always)]
 [Captions ]--->[S3 Standard (always, small)]

 Intelligent Tiering:
 - Videos with 0 views in last 90 days -> move to Glacier IR
 - Videos with 0 views in last 1 year  -> move to Glacier Deep Archive
 - If a cold video gets a view -> restore to S3-IA (async, show "loading")
```

### CDN Cost Optimization

```
 CDN Cost Optimization Strategies
 ============================================================================

 1. Multi-CDN Strategy
    - Use cheapest CDN per region
    - Akamai for North America/Europe
    - CloudFront for AWS-heavy regions
    - Regional CDNs for specific markets (China, India)
    - DNS-based routing to cheapest provider

 2. Origin Offload
    - Target: 95%+ cache hit ratio
    - Pre-warm popular content to edge
    - Longer cache TTLs for video segments (immutable)
    - Origin shield to reduce origin fetches

 3. Codec Efficiency
    - AV1 reduces bandwidth 50% vs H.264 for same quality
    - Migrate top 1% of videos to AV1: save ~15% of CDN cost
    - Estimated savings: $22M/month

 4. Regional Encoding
    - Lower default quality in regions with slower connections
    - Mobile users: cap at 720p unless explicitly requesting higher
    - Reduce unnecessary 4K transcoding

 5. Peer-to-Peer Assist (WebRTC)
    - For very popular live content
    - Viewers share segments with nearby viewers
    - Can reduce CDN load by 30-60% for viral content
```

### Transcoding Cost Optimization

```
 Transcoding Strategy Matrix
 ============================================================================

 Video Popularity    | Eager Transcode       | Lazy Transcode
 (predicted)        | (at upload time)      | (on first request)
 --------------------|----------------------|--------------------
 High (>10K views   | 240p, 360p, 480p,    | 4K AV1
 predicted)         | 720p, 1080p H.264    |
                    | + VP9 720p, 1080p    |
 --------------------|----------------------|--------------------
 Medium (1K-10K)    | 360p, 720p, 1080p    | 4K, 240p, VP9, AV1
                    | H.264 only           |
 --------------------|----------------------|--------------------
 Low (<1K views     | 360p, 720p H.264     | Everything else
 predicted)         | only                 | (transcode if
                    |                      |  requested)
 --------------------|----------------------|--------------------

 Popularity prediction model:
 - Channel subscriber count
 - Historical video performance
 - Title/thumbnail quality score
 - Upload time / trending topics

 Estimated savings vs transcode-everything:
   40% reduction in transcoding compute cost (~$12M/month savings)
```

---

## 12. Deployment Architecture

### Global Infrastructure

```
 Global Deployment Architecture
 ============================================================================

                           +---------------------------+
                           |    Global DNS (Route 53)  |
                           |    GeoDNS / Latency-based |
                           +-----+-----+-----+--------+
                                 |     |     |
                +----------------+     |     +----------------+
                |                      |                      |
                v                      v                      v
 +==========================+ +==========================+ +==========================+
 |    US-EAST Region        | |    EU-WEST Region        | |    APAC Region           |
 |                          | |                          | |                          |
 | +----+ +----+ +----+    | | +----+ +----+ +----+    | | +----+ +----+ +----+    |
 | |Edge| |Edge| |Edge|    | | |Edge| |Edge| |Edge|    | | |Edge| |Edge| |Edge|    |
 | |NYC | |ATL | |CHI |    | | |LON | |PAR | |FRA |    | | |TYO | |SIN | |SYD |    |
 | +----+ +----+ +----+    | | +----+ +----+ +----+    | | +----+ +----+ +----+    |
 |          |               | |          |               | |          |               |
 | +--------v----------+   | | +--------v----------+   | | +--------v----------+   |
 | | Regional CDN PoP  |   | | | Regional CDN PoP  |   | | | Regional CDN PoP  |   |
 | +--------+----------+   | | +--------+----------+   | | +--------+----------+   |
 |          |               | |          |               | |          |               |
 | +--------v----------+   | | +--------v----------+   | | +--------v----------+   |
 | | API Gateway + LB  |   | | | API Gateway + LB  |   | | | API Gateway + LB  |   |
 | +----+----+----+----+   | | +----+----+----+----+   | | +----+----+----+----+   |
 |      |    |    |    |    | |      |    |    |    |    | |      |    |    |    |    |
 | +--+ +--+ +--+ +--+    | | +--+ +--+ +--+ +--+    | | +--+ +--+ +--+ +--+    |
 | |Up| |St| |Sr| |Rc|    | | |Up| |St| |Sr| |Rc|    | | |Up| |St| |Sr| |Rc|    |
 | +--+ +--+ +--+ +--+    | | +--+ +--+ +--+ +--+    | | +--+ +--+ +--+ +--+    |
 |                          | |                          | |                          |
 | +--------------------+  | | +--------------------+  | | +--------------------+  |
 | | PostgreSQL Primary |  | | | PostgreSQL Replica  |  | | | PostgreSQL Replica  |  |
 | | + Cassandra        |  | | | + Cassandra         |  | | | + Cassandra         |  |
 | | + Redis Cluster    |  | | | + Redis Cluster     |  | | | + Redis Cluster     |  |
 | | + Elasticsearch    |  | | | + Elasticsearch     |  | | | + Elasticsearch     |  |
 | +--------------------+  | | +--------------------+  | | +--------------------+  |
 |                          | |                          | |                          |
 | +--------------------+  | | +--------------------+  | | +--------------------+  |
 | | S3 (Primary)       |  | | | S3 (Cross-Region   |  | | | S3 (Cross-Region   |  |
 | | + Transcode Fleet  |  | | |    Replication)     |  | | |    Replication)     |  |
 | +--------------------+  | | +--------------------+  | | +--------------------+  |
 +==========================+ +==========================+ +==========================+
                                         |
                                         v
                              +---------------------+
                              | Cross-Region Sync   |
                              | - DB replication    |
                              | - S3 CRR            |
                              | - Event bus (Kafka) |
                              +---------------------+
```

### Deployment Strategy

| Component         | Strategy                         | Rollout            |
| ----------------- | -------------------------------- | ------------------ |
| API Services      | Blue-green deployment            | Canary 1% -> 10% -> 100% |
| Transcoding       | Rolling update                   | Replace 10% at a time     |
| CDN Config        | Gradual propagation              | Region by region          |
| Database Schema   | Online migration (gh-ost)        | Zero-downtime             |
| ML Models         | Shadow mode -> A/B test -> full  | Measure engagement first  |
| Client Apps       | Feature flags                    | Gradual rollout           |

---

## 13. Common Interview Follow-ups

### How to handle live streaming?

```
 Live Streaming Architecture
 ============================================================================

 +----------+     +----------------+     +------------------+
 | Streamer |---->| Ingest Server  |---->| Transcoding      |
 | (OBS/    |RTMP | (accept RTMP/  |     | (real-time)      |
 |  mobile) |SRT  |  SRT streams)  |     | - Lower latency  |
 +----------+     +----------------+     | - Fewer quality   |
                                          |   levels (3-4)   |
                                          +--------+---------+
                                                   |
                                          +--------v---------+
                                          | Packager          |
                                          | - Segment into    |
                                          |   2-6 sec chunks |
                                          | - Generate live   |
                                          |   m3u8 manifest  |
                                          +--------+---------+
                                                   |
                                          +--------v---------+
                                          | CDN (LL-HLS)     |
                                          | - Low-latency HLS|
                                          | - 2-5 sec delay  |
                                          | - Partial segment|
                                          |   delivery       |
                                          +--------+---------+
                                                   |
                                          +--------v---------+
                                          | Viewers (millions)|
                                          +------------------+

 Key Differences from VOD:
 - Real-time transcoding (no time to optimize encoding)
 - Sliding window manifest (not full playlist)
 - Lower segment duration (2-6 sec vs 10 sec for VOD)
 - DVR functionality: keep last 2-4 hours for rewind
 - Chat service running alongside (WebSocket-based)
 - After stream ends: create VOD from recording
```

### How to implement video copyright detection?

```
 Copyright Detection Pipeline
 ============================================================================

 1. Content ID System (like YouTube's):
    - Rights holders upload reference files (audio + video fingerprints)
    - Every uploaded video is fingerprinted and compared against reference DB

 2. Detection Flow:

 +----------+     +------------------+     +------------------+
 | Uploaded |---->| Audio Finger-    |---->| Video Finger-    |
 | Video    |     | printing         |     | printing         |
 +----------+     | (Chromaprint/    |     | (perceptual hash,|
                  |  Dejavu)         |     |  scene detection)|
                  +--------+---------+     +--------+---------+
                           |                        |
                  +--------v------------------------v---------+
                  |           Matching Engine                  |
                  |  Compare against reference DB              |
                  |  (billions of fingerprints)                |
                  |  Locality-Sensitive Hashing for speed      |
                  +---------------------+---------------------+
                                        |
                            +-----------v-----------+
                            |   Match Found?        |
                            +---+---------------+---+
                                |               |
                            YES |               | NO
                                v               v
                  +------------------+  +------------------+
                  | Apply Policy:    |  | Allow video      |
                  | - Block upload   |  | (continue normal |
                  | - Monetize for   |  |  processing)     |
                  |   rights holder  |  +------------------+
                  | - Allow with ads |
                  +------------------+

 3. Ongoing monitoring: periodic re-scan as reference DB grows
```

### How to handle viral videos (sudden traffic spike)?

```
 Viral Video Handling
 ============================================================================

 Detection:
 - Monitor view velocity: if views/minute > 10x average, flag as viral
 - Predictive model: subscriber notification engagement rate
 - Social media monitoring: external link surge detection

 Response (automated):

 +--------------------+     +--------------------+     +--------------------+
 | Tier 1: Detection  |---->| Tier 2: CDN Warmup |---->| Tier 3: Origin     |
 | (< 1 minute)       |     | (< 5 minutes)      |     | Protection         |
 |                     |     |                     |     | (continuous)       |
 | - View velocity    |     | - Push video to ALL |     | - Origin shield    |
 |   alert triggers   |     |   edge PoPs         |     |   collapses        |
 | - Auto-classify    |     | - Pre-warm all      |     |   duplicate reqs   |
 |   as "hot" content |     |   resolutions       |     | - Auto-scale       |
 |                     |     | - Increase CDN      |     |   origin capacity  |
 |                     |     |   cache TTL         |     | - Rate limit non-  |
 |                     |     |                     |     |   critical APIs     |
 +--------------------+     +--------------------+     +--------------------+

 Capacity Planning:
 - Viral video can go from 0 to 10M views/hour
 - At 5 Mbps avg bitrate: 10M views/hr x 5 Mbps = 50 Tbps peak
 - CDN must handle 50 Tbps burst (pre-negotiated capacity with CDN providers)
 - Origin must handle cache misses for first few minutes
```

### How to implement video chapters/timestamps?

```
 Video Chapters
 ============================================================================

 Two approaches:

 1. Creator-defined chapters:
    - Creator adds timestamps in description or via UI
    - Parsed on upload: regex match "MM:SS - Title" pattern
    - Stored in video metadata:

    chapters: [
      { time_sec: 0,    title: "Introduction" },
      { time_sec: 120,  title: "Setting Up" },
      { time_sec: 340,  title: "Core Concepts" },
      { time_sec: 780,  title: "Advanced Topics" },
      { time_sec: 1200, title: "Summary" }
    ]

 2. Auto-generated chapters (ML):
    - Scene detection: identify visual transitions
    - Speech-to-text: transcribe and segment by topic
    - NLP: generate chapter titles from transcript segments
    - Validate with engagement data: chapters align with
      natural pause/replay points in viewing behavior

 Player Integration:
 +------------------------------------------------------------------+
 | [======|====|=============|===========|======] 20:30             |
 |  Intro  Setup  Core          Advanced   Summary                  |
 +------------------------------------------------------------------+
   Hovering over progress bar shows chapter title and thumbnail
```

### How to reduce video startup time?

```
 Startup Time Optimization (Target: < 2 seconds)
 ============================================================================

 Breakdown of video startup:

 Step                      Unoptimized    Optimized      Technique
 ------------------------  -----------    ----------     --------------------
 DNS resolution            50-200ms       5-10ms         DNS prefetch, keep-alive
 TCP + TLS handshake       100-300ms      0ms            Connection pre-warming,
                                                         HTTP/2 multiplexing
 Manifest fetch            50-200ms       20-50ms        CDN edge cache,
                                                         inline in page HTML
 First segment fetch       200-500ms      50-100ms       CDN edge, smaller
                                                         initial segment (2s)
 Decode + render           100-200ms      50-100ms       Hardware decode,
                                                         preload first frame
 ABR decision              50-100ms       0ms            Start at low quality,
                                                         switch up after 2 segs
 Buffer minimum            500-2000ms     200-500ms      Start playback with
                                                         only 1 segment buffered
 ------------------------  -----------    ----------
 Total                     1050-3500ms    325-760ms

 Additional Techniques:
 1. Predictive preloading: When user hovers over thumbnail, start
    fetching first segment in background
 2. Prefetch manifest on search results page for top 3 results
 3. Use HTTP/3 (QUIC) for 0-RTT connection establishment
 4. Byte-range requests: fetch only first 2 seconds initially
 5. MOOV atom optimization: place MP4 metadata at file start
 6. Client-side segment cache: cache recently watched video segments
```

---

## Summary

### Key Design Decisions

| Decision                       | Choice                    | Rationale                            |
| ------------------------------ | ------------------------- | ------------------------------------ |
| Upload protocol                | Resumable (tus)           | Large files, unreliable networks     |
| Streaming protocol             | HLS (primary)             | Widest device support, CDN-friendly  |
| Video storage                  | Object storage (S3)       | Infinite scale, durability           |
| Metadata database              | PostgreSQL (sharded)      | ACID for critical metadata           |
| Counters/analytics             | Cassandra                 | High write throughput, time-series   |
| Search                         | Elasticsearch             | Full-text search, relevance scoring  |
| Cache                          | Redis                     | Session, metadata, count caching     |
| Message queue                  | Kafka                     | High throughput, event replay        |
| CDN strategy                   | Multi-CDN, 3-tier         | Cost optimization, global reach      |
| Transcoding                    | Auto-scaling worker fleet | Handle variable upload volume        |
| Recommendations                | Two-tower deep learning   | Scale and personalization            |
| View counting                  | Multi-layer aggregation   | Handle 1B views/day without DB load  |

### Critical Path for Interview

Focus the discussion on these areas in a 45-minute interview:

```
 Time    Topic                          Depth
 -----   ----------------------------   ----------------------------
 0-5     Requirements + estimates       Show math for storage/bandwidth
 5-10    High-level architecture        Upload flow + streaming flow
 10-20   Video upload + transcoding     DAG pipeline, codec selection
 20-30   Streaming deep dive            HLS, ABR, CDN architecture
 30-35   Scaling challenges             View counting, storage tiering
 35-40   Recommendations (brief)        Two-tower model overview
 40-45   Follow-ups                     Live streaming, viral handling
```

### Trade-offs to Discuss

| Trade-off                           | Option A                    | Option B                      |
| ----------------------------------- | --------------------------- | ----------------------------- |
| Consistency vs availability         | Strong (view counts)        | Eventual (chosen for scale)   |
| Eager vs lazy transcoding           | All formats upfront         | On-demand (chosen for cost)   |
| Own CDN vs third-party              | Full control, high capex    | Managed, opex (chosen)        |
| Monolith vs microservices           | Simpler operations          | Independent scaling (chosen)  |
| SQL vs NoSQL for metadata           | ACID guarantees (chosen)    | Easier horizontal scaling     |
| Real-time vs batch recommendations  | Fresher results (chosen)    | Cheaper compute               |
