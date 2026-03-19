# Data Model: Video Streaming (YouTube)

A video streaming platform handles two fundamentally different workloads: the upload pipeline (ingest, transcode, store) and the streaming pipeline (serve adaptive bitrate video segments via CDN). The data model reflects this split — PostgreSQL for metadata and social features, Cassandra for high-volume per-user data like watch history, and S3/CDN for the actual video segments.

## Table Responsibilities

| Table               | Purpose                            | Storage    | Key Characteristic                   |
| ------------------- | ---------------------------------- | ---------- | ------------------------------------ |
| **videos**          | Core video metadata and counters   | PostgreSQL | Central entity, heavily read         |
| **video_encodings** | Per-resolution encoding details    | PostgreSQL | One video → many encodings           |
| **channels**        | Creator channel profiles           | PostgreSQL | Denormalized subscriber_count        |
| **comments**        | User comments on videos            | PostgreSQL | High write volume on popular videos  |
| **watch_history**   | Per-user viewing history           | Cassandra  | Partitioned by user, ordered by time |
| **subscriptions**   | Channel subscription relationships | PostgreSQL | Composite PK prevents duplicates     |
| **playlists**       | User-created video collections     | PostgreSQL | Supports public/private              |
| **playlist_items**  | Videos within a playlist           | PostgreSQL | Ordered by position                  |

## Detailed Field Descriptions

### videos (PostgreSQL)

| Field         | Type                                                          | Description                                                                                                                  |
| ------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| video_id      | BIGINT, PK (Snowflake)                                        | Globally unique, time-sortable. Snowflake IDs avoid coordination across upload servers.                                      |
| uploader_id   | BIGINT, FK → channels.owner_id, INDEX                         | Who uploaded the video. Indexed for "all videos by this creator" queries.                                                    |
| title         | VARCHAR(500)                                                  | Video title. Indexed for full-text search (via separate search index like Elasticsearch).                                    |
| description   | TEXT                                                          | Long-form description. May contain links, hashtags, timestamps.                                                              |
| duration_sec  | INT                                                           | Video length in seconds. Used for UI display and recommendation filtering (short vs. long content).                          |
| file_size     | BIGINT                                                        | Original upload file size in bytes. Used for storage accounting and quota enforcement.                                       |
| status        | ENUM('uploading','processing','published','failed','removed') | Lifecycle state. Videos are not visible until status = 'published'. Processing includes transcoding to multiple resolutions. |
| thumbnail_url | VARCHAR(500)                                                  | CDN URL for the video thumbnail. Auto-generated from video frame or custom-uploaded.                                         |
| view_count    | BIGINT, DEFAULT 0                                             | Denormalized view counter. Updated asynchronously via a counter service to avoid lock contention on viral videos.            |
| like_count    | INT, DEFAULT 0                                                | Denormalized like counter. Same async pattern as view_count.                                                                 |

**Why `status` as an enum?** The upload-to-publish pipeline has distinct stages. The status field lets the UI show appropriate states (uploading spinner, processing bar, published video) and prevents serving incomplete videos.

### video_encodings (PostgreSQL)

| Field          | Type                             | Description                                                                                                                                                  |
| -------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| video_id       | BIGINT, FK → videos.video_id     | Which video this encoding belongs to.                                                                                                                        |
| resolution     | ENUM('360p','720p','1080p','4K') | Target resolution. Each resolution is a separate encoding with different file sizes and quality.                                                             |
| bitrate        | INT                              | Encoding bitrate in kbps. Higher bitrate = better quality = larger segments. The ABR algorithm on the client selects based on available bandwidth.           |
| codec          | VARCHAR(20)                      | Video codec (e.g., H.264, H.265, VP9, AV1). Different codecs offer different compression/quality tradeoffs. H.264 is most compatible; AV1 is most efficient. |
| manifest_url   | VARCHAR(500)                     | CDN URL for the HLS/DASH manifest file (e.g., `.m3u8`). The manifest lists all segments and their URLs.                                                      |
| segment_prefix | VARCHAR(500)                     | S3 path prefix for this encoding's segments (e.g., `s3://videos/v123/1080p/`). Segments are named sequentially: `seg_001.ts`, `seg_002.ts`, etc.             |

**Why store each resolution as a separate row?** Adaptive bitrate streaming requires the client to switch between resolutions dynamically. Each resolution has different manifest URLs and segment locations. Normalizing them into separate rows makes querying "available resolutions for video X" straightforward.

### channels (PostgreSQL)

| Field            | Type                       | Description                                                                     |
| ---------------- | -------------------------- | ------------------------------------------------------------------------------- |
| channel_id       | BIGINT, PK                 | Unique channel identifier.                                                      |
| owner_id         | BIGINT, FK → users, UNIQUE | One user owns one channel. UNIQUE constraint enforces this.                     |
| name             | VARCHAR(200)               | Channel display name.                                                           |
| description      | TEXT                       | Channel description/about section.                                              |
| subscriber_count | BIGINT, DEFAULT 0          | Denormalized counter. Updated async. Displayed prominently on the channel page. |

### comments (PostgreSQL)

| Field      | Type                       | Description                                                            |
| ---------- | -------------------------- | ---------------------------------------------------------------------- |
| comment_id | BIGINT, PK (Snowflake)     | Unique comment identifier.                                             |
| video_id   | BIGINT, FK → videos, INDEX | Which video this comment is on. Indexed for "load comments for video." |
| author_id  | BIGINT, FK → users         | Who wrote the comment.                                                 |
| text       | TEXT                       | Comment content. Subject to content moderation filters.                |
| like_count | INT, DEFAULT 0             | Comment likes. Used for "top comments" sorting.                        |
| created_at | TIMESTAMP                  | When the comment was posted. Used for "newest first" sorting.          |

### watch_history (Cassandra)

| Field            | Type                           | Description                                                                                                                      |
| ---------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| user_id          | BIGINT, PARTITION KEY          | All watch history for one user lives on the same partition. Enables efficient "continue watching" queries.                       |
| watched_at       | TIMESTAMP, CLUSTERING KEY DESC | When the user watched. DESC ordering means the most recent watches are read first (the common query pattern).                    |
| video_id         | BIGINT                         | Which video was watched.                                                                                                         |
| watched_duration | INT                            | How many seconds the user actually watched. Used for recommendations (watching 90% signals interest vs. 5% signals disinterest). |
| resume_position  | INT                            | Where the user stopped watching (in seconds). Enables "continue watching" — the player seeks to this position on re-open.        |

**Why Cassandra for watch history?** Watch events are high-volume writes (billions per day) and the primary query is per-user ("what did I watch recently?"). Cassandra's partition-per-user model handles this perfectly. PostgreSQL would struggle with the write throughput and table size.

### subscriptions (PostgreSQL)

| Field         | Type                                  | Description                                                                      |
| ------------- | ------------------------------------- | -------------------------------------------------------------------------------- |
| user_id       | BIGINT, PK (composite), FK → users    | Who subscribed.                                                                  |
| channel_id    | BIGINT, PK (composite), FK → channels | Which channel they subscribed to. Composite PK prevents duplicate subscriptions. |
| subscribed_at | TIMESTAMP                             | When the subscription was created. Used for "recently subscribed" notifications. |

### playlists (PostgreSQL)

| Field       | Type                      | Description                                                                                                      |
| ----------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| playlist_id | BIGINT, PK                | Unique playlist identifier.                                                                                      |
| owner_id    | BIGINT, FK → users, INDEX | Who created the playlist.                                                                                        |
| name        | VARCHAR(200)              | Playlist title.                                                                                                  |
| is_public   | BOOLEAN, DEFAULT true     | Whether the playlist is visible to others. Private playlists (like "Watch Later") are only visible to the owner. |

### playlist_items (PostgreSQL)

| Field       | Type                   | Description                                                                             |
| ----------- | ---------------------- | --------------------------------------------------------------------------------------- |
| playlist_id | BIGINT, FK → playlists | Which playlist this item belongs to.                                                    |
| video_id    | BIGINT, FK → videos    | Which video is in the playlist.                                                         |
| position    | INT                    | Order within the playlist (1, 2, 3...). Allows reordering without deleting/reinserting. |
| added_at    | TIMESTAMP              | When the video was added.                                                               |

## ER Diagram

```
┌──────────────────┐       ┌──────────────────────┐
│    channels       │       │   video_encodings     │
│──────────────────│       │──────────────────────│
│ channel_id (PK)   │       │ video_id (FK)         │
│ owner_id (FK)     │       │ resolution            │
│ name              │       │ bitrate               │
│ description       │       │ codec                 │
│ subscriber_count  │       │ manifest_url          │
└──────────────────┘       │ segment_prefix        │
         │ 1                └──────────────────────┘
         │                            *
         │                            │
    *    │                            │
┌────────┴─────────┐       ┌──────────┴───────────┐
│  subscriptions    │       │      videos           │
│──────────────────│       │──────────────────────│
│ user_id (PK,FK)   │       │ video_id (PK)         │
│ channel_id (PK,FK)│       │ uploader_id (FK)      │
│ subscribed_at     │       │ title                 │
└──────────────────┘       │ description           │
                            │ duration_sec          │
                            │ status                │
                            │ view_count            │
                            │ like_count            │
                            └──────────────────────┘
                              │ 1           │ 1
                              │             │
                         *    │        *    │
                   ┌──────────┴──┐  ┌──────┴───────────┐
                   │  comments    │  │  playlist_items   │
                   │─────────────│  │──────────────────│
                   │ comment_id   │  │ playlist_id (FK)  │
                   │ video_id(FK) │  │ video_id (FK)     │
                   │ author_id    │  │ position          │
                   │ text         │  │ added_at          │
                   │ like_count   │  └──────────────────┘
                   │ created_at   │           *
                   └─────────────┘           │
                                              │
                                   ┌──────────┴───────┐
                                   │   playlists       │
                                   │──────────────────│
                                   │ playlist_id (PK)  │
                                   │ owner_id (FK)     │
                                   │ name              │
                                   │ is_public         │
                                   └──────────────────┘

Cassandra:
┌──────────────────────┐
│   watch_history       │
│──────────────────────│
│ user_id (PK)          │
│ watched_at (CK DESC) │
│ video_id              │
│ watched_duration      │
│ resume_position       │
└──────────────────────┘

Relationships:
  channels 1───* videos          (one channel has many videos)
  videos   1───* video_encodings (one video has many resolutions)
  videos   1───* comments        (one video has many comments)
  videos   *───* playlists       (via playlist_items, many-to-many)
  users    *───* channels        (via subscriptions, many-to-many)
```

## Data Flow

### Upload Pipeline

```
1. Creator initiates upload via web/mobile client
         │
         ▼
2. Server generates pre-signed S3 upload URL
   INSERT into videos (status = 'uploading')
         │
         ▼
3. Client uploads directly to S3 (bypasses app servers)
   Large files use multipart upload (5MB chunks)
         │
         ▼
4. S3 triggers event notification on upload complete
         │
         ▼
5. Publish to Kafka: video.uploaded
         │
         ▼
6. Transcoding Workers consume event:
   ├─ UPDATE videos SET status = 'processing'
   ├─ Download original from S3
   ├─ Transcode to multiple resolutions (parallel):
   │   ├─ 360p  → segments + manifest → S3
   │   ├─ 720p  → segments + manifest → S3
   │   ├─ 1080p → segments + manifest → S3
   │   └─ 4K    → segments + manifest → S3
   ├─ Generate thumbnail (frame extraction)
   ├─ INSERT video_encodings for each resolution
   └─ UPDATE videos SET status = 'published', thumbnail_url = ...
         │
         ▼
7. CDN pulls segments on first viewer request (pull-through cache)
```

### Streaming Pipeline (Adaptive Bitrate)

```
1. User clicks play on a video
         │
         ▼
2. Client requests video metadata:
   Query videos + video_encodings WHERE video_id = X
         │
         ▼
3. Client fetches HLS manifest from CDN (manifest_url)
   Manifest lists all available resolutions and segment URLs
         │
         ▼
4. Client's ABR (Adaptive Bitrate) algorithm:
   ├─ Measure current bandwidth
   ├─ Select appropriate resolution
   │   (e.g., 1080p on fast WiFi, 360p on slow cellular)
   └─ Request first segment at chosen resolution
         │
         ▼
5. CDN serves segment:
   ├─ Cache hit: return immediately (~10ms)
   └─ Cache miss: fetch from S3 origin → cache → return
         │
         ▼
6. Client plays segment, continuously monitors bandwidth
   ├─ Bandwidth drops: switch to lower resolution mid-stream
   └─ Bandwidth improves: switch to higher resolution
         │
         ▼
7. Async: log watch event to Kafka
   ├─ UPDATE watch_history (resume_position, watched_duration)
   ├─ Increment view_count via counter service
   └─ Feed data to recommendation engine
```

**Why pre-signed URLs for upload?** Routing video file bytes through app servers would consume enormous bandwidth and memory. Pre-signed URLs let clients upload directly to S3, keeping app servers free for metadata operations. The pre-signed URL expires after a short time for security.

**Why HLS with segments?** Segments (typically 2-10 seconds each) enable adaptive bitrate: the client can switch resolutions at any segment boundary based on current bandwidth. Monolithic files cannot support this. HLS is the most widely supported streaming protocol across devices.

**Why denormalize view_count on the videos table?** The videos table is read on every video page load. Joining to a separate view_count table would add latency. The denormalized counter is updated asynchronously by a counter service that batches increments, avoiding row-lock contention when millions of users watch the same viral video.
