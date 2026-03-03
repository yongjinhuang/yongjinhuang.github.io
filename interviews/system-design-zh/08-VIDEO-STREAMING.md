# 设计视频流媒体平台（YouTube/Netflix）

视频流媒体平台必须处理大规模内容上传、处理、存储和分发，同时在全球范围内提供流畅、低延迟的观看体验。本指南将逐步介绍端到端的系统设计。

---

## 1. 需求澄清

### 功能需求

| 类别        | 需求                                                         |
| ----------- | ------------------------------------------------------------ |
| 上传        | 用户可以上传任意长度的视频（最长 12 小时）                   |
| 流媒体播放  | 用户可以以 adaptive quality 播放视频                         |
| 搜索        | 对标题、描述、标签进行全文搜索                               |
| 推荐        | 基于观看历史和偏好的个性化推荐                               |
| 评论        | 视频的线程式评论                                             |
| 点赞/踩     | 用户可以对视频点赞或踩                                       |
| 订阅        | 用户订阅频道并接收更新                                       |
| 观看历史    | 跟踪并恢复部分观看的视频                                     |
| 播放列表    | 用户可以创建和分享播放列表                                   |
| 通知        | 订阅频道的新视频提醒                                         |

### 非功能需求

| 需求            | 目标                                                        |
| --------------- | ----------------------------------------------------------- |
| 播放质量        | Adaptive bitrate，稳定连接下无缓冲                          |
| 启动延迟        | 首帧显示 < 2 秒                                             |
| 可用性          | 99.99% 正常运行时间（年停机时间 < 53 分钟）                 |
| 全球覆盖        | 任何大洲均可低延迟播放                                       |
| 持久性          | 上传内容零数据丢失（11 个 9 的持久性）                       |
| 一致性          | 观看次数、点赞数可接受最终一致性                             |
| 上传处理        | 视频上传后 10 分钟内可供播放                                 |

### 规模估算

| 指标                    | 数值                           |
| ----------------------- | ------------------------------ |
| 总用户数                | 20 亿                          |
| 日活跃用户（DAU）       | 8 亿                           |
| 每分钟视频上传量        | 500 小时                       |
| 每日视频观看量          | 10 亿                          |
| 平均视频长度            | 7 分钟                         |
| 每日人均观看时长        | 40 分钟                        |
| 存储视频总量            | 8 亿+                          |

### 粗略估算

#### 存储

```
上传速率：
  500 小时/分钟 = 30,000 小时/天 = 10,950,000 小时/年

平均视频大小（原始上传）：
  1 小时 1080p ≈ 3 GB
  30,000 小时/天 x 3 GB = 90 PB/天（原始上传）

transcoding 后（多种分辨率）：
  每个视频存储约 6 种分辨率 + 音轨
  transcoding 输出 ≈ 原始大小的 3 倍 = 270 PB/天总新增存储

年存储增长：
  270 PB/天 x 365 = ≈98 EB/年

  （实际上，压缩和去重会显著减少这个数字。
   截至 2024 年，YouTube 估计总共存储了 1-10 EB。）
```

#### 带宽

```
每日视频观看量：10 亿
每次观看平均时长：7 分钟
平均码率：5 Mbps（720p-1080p 混合）

出口带宽：
  10 亿次观看 x 7 分钟 x 60 秒 x 5 Mbps = 2.1 x 10^12 Mb/天
  = 2.1 Petabits/天
  = 24.3 Tbps 平均值
  峰值（2 倍平均值）：≈50 Tbps

每日出口流量：
  2.1 Pb/天 = 262 PB/天

每月出口流量：
  ≈8 EB/月

CDN 成本估算（按顶级 CDN $0.02/GB 计）：
  262 PB/天 x $0.02/GB = 262,000 TB x $20/TB = $5.24M/天
  ≈ $157M/月仅 CDN 费用
```

#### 上传带宽

```
上传速率：500 小时/分钟 = ≈8.3 小时/秒
按 3 GB/小时计：8.3 x 3 = 25 GB/s = 200 Gbps ingest 带宽
```

#### Transcoding 计算

```
将 1 小时视频 transcode 为 6 种分辨率：
  ≈6 CPU 小时（使用硬件加速）

每分钟上传 500 小时：
  500 x 6 = 3,000 CPU 小时/每分钟上传量
  = 50 CPU 小时/秒
  需要约 50 台强大机器持续运行
  （实际上：500-1000 台机器，带自动扩展应对突发流量）
```

---

## 2. API 设计

### 视频上传

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

### 可恢复上传（tus protocol）

```
// 步骤 1：创建上传
POST /v1/videos/upload
Tus-Resumable: 1.0.0
Upload-Length: 1073741824
Upload-Metadata: title bXkgdmlkZW8=, type dmlkZW8vbXA0

Response 201:
Location: /v1/videos/upload/upl_xyz789
Tus-Resumable: 1.0.0

// 步骤 2：上传分块
PATCH /v1/videos/upload/upl_xyz789
Tus-Resumable: 1.0.0
Upload-Offset: 0
Content-Type: application/offset+octet-stream
Content-Length: 5242880

<binary data>

Response 204:
Upload-Offset: 5242880

// 步骤 3：失败后恢复（检查当前偏移量）
HEAD /v1/videos/upload/upl_xyz789

Response 200:
Upload-Offset: 5242880
Upload-Length: 1073741824
```

### 视频流播放

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

### 搜索

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

### 推荐

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

### 上传策略比较

| 策略                | 优点                                       | 缺点                                  | 最适用场景        |
| ------------------- | ------------------------------------------ | ------------------------------------- | ----------------- |
| 直接上传            | 实现简单                                   | 服务器带宽瓶颈                        | 小文件 < 100MB    |
| Pre-signed URL      | 卸载到对象存储                             | 失败后无法恢复                        | 中等文件          |
| 可恢复上传（tus）   | 容错，断线后可恢复                         | 客户端和服务器逻辑更复杂              | 大型视频文件      |
| 分块多部分上传      | 可并行上传分块                             | 分块组装复杂                          | 超大文件          |

**决策**：使用可恢复上传（tus protocol）作为主要策略。视频是通过可能不可靠的连接（移动端）上传的大文件。网络故障后能够恢复上传对用户体验至关重要。

---

## 3. 高层架构

### 上传流程

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

### 流播放流程

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

     ABR：客户端测量带宽并动态切换分辨率
     例如，如果带宽下降，步骤 9 可能请求 /480p/segment_003.ts
```

### 完整系统概览

```
 +-----------------------------------------------------------------------+
 |                          客户端层                                      |
 |  +----------+  +-----------+  +------------+  +------------------+   |
 |  | Web App  |  | iOS App   |  | Android    |  | Smart TV / OTT   |   |
 |  | (React)  |  | (Swift)   |  | (Kotlin)   |  | (Roku, Fire TV)  |   |
 |  +----------+  +-----------+  +------------+  +------------------+   |
 +-----------------------------------------------------------------------+
              |                    |                       |
              v                    v                       v
 +-----------------------------------------------------------------------+
 |                      CDN 层（全球）                                    |
 |  200+ PoP 全球分布，边缘缓存，TLS 终止                               |
 +-----------------------------------------------------------------------+
              |
              v
 +-----------------------------------------------------------------------+
 |                     API Gateway / Load Balancer                       |
 |  速率限制、认证、路由、请求日志                                       |
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
 |                        数据层                                         |
 |  +----------+  +----------+  +----------+  +-----+  +----------+    |
 |  |PostgreSQL|  |Cassandra |  |Elastic-  |  |Redis|  |Object    |    |
 |  |(metadata)|  |(views,   |  |search    |  |(cache| |Storage   |    |
 |  |          |  | history) |  |(search)  |  | sess)| |(S3/GCS)  |    |
 |  +----------+  +----------+  +----------+  +-----+  +----------+    |
 +-----------------------------------------------------------------------+
              |
              v
 +-----------------------------------------------------------------------+
 |                    异步处理层                                          |
 |  +----------+  +-------------+  +----------+  +------------------+   |
 |  | Kafka    |  | Transcoding |  | ML Pipe- |  | Notification     |   |
 |  | (events) |  | Workers     |  | line     |  | Service          |   |
 |  +----------+  +-------------+  +----------+  +------------------+   |
 +-----------------------------------------------------------------------+
```

---

## 4. 数据模型

### 视频表（PostgreSQL - 按 video_id 分片）

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
    original_url    TEXT,                              -- S3 原始文件路径
    manifest_url    TEXT,                              -- HLS manifest 路径
    thumbnail_url   TEXT,
    file_size_bytes BIGINT,
    resolution      VARCHAR(10),                      -- 原始分辨率
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

### 用户表（PostgreSQL）

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

### 订阅表（PostgreSQL - 按 subscriber_id 分片）

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

### 评论表（PostgreSQL - 按 video_id 分片）

```sql
CREATE TABLE comments (
    comment_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id        UUID NOT NULL REFERENCES videos(video_id),
    user_id         UUID NOT NULL REFERENCES users(user_id),
    parent_id       UUID REFERENCES comments(comment_id),  -- 用于线程化
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

### 视频统计表（Cassandra - 针对高写入吞吐量优化）

```sql
-- Cassandra 实时计数器表
CREATE TABLE video_stats (
    video_id    UUID,
    view_count  COUNTER,
    like_count  COUNTER,
    dislike_count COUNTER,
    share_count COUNTER,
    comment_count COUNTER,
    PRIMARY KEY (video_id)
);

-- 时间序列分析（按视频 + 日期分区）
CREATE TABLE video_views_daily (
    video_id    UUID,
    view_date   DATE,
    view_count  COUNTER,
    watch_time_sec COUNTER,
    PRIMARY KEY (video_id, view_date)
) WITH CLUSTERING ORDER BY (view_date DESC);
```

### 观看历史表（Cassandra）

```sql
CREATE TABLE watch_history (
    user_id         UUID,
    watched_at      TIMEUUID,
    video_id        UUID,
    progress_sec    INT,           -- 恢复播放位置
    duration_sec    INT,
    completed       BOOLEAN,
    PRIMARY KEY (user_id, watched_at)
) WITH CLUSTERING ORDER BY (watched_at DESC)
  AND default_time_to_live = 31536000;  -- 1 年 TTL
```

### 视频处理任务表（PostgreSQL）

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

### 数据模型关系

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

## 5. 视频上传和处理管道

### 上传流程（分步详解）

```
 步骤 1：客户端请求上传 URL
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

 步骤 2：客户端直接上传到 S3
 =======================================

 Client                                  Object Storage (S3)
   |                                          |
   |-- PUT <upload_url> --------------------->|
   |   Content-Type: video/mp4               |
   |   <binary video data>                   |
   |                                          |
   |   (可恢复上传：带偏移量的 PATCH)         |
   |                                          |
   |<-- 200 OK -------------------------------|

 步骤 3：S3 事件通知触发处理
 ==================================================

 Object Storage        Message Queue          Upload Service
   |                      |                        |
   |-- S3 Event --------->|                        |
   |   (ObjectCreated)   |                        |
   |                      |-- upload.completed --->|
   |                      |                        |
   |                      |     更新视频状态为 'processing'
   |                      |                        |
   |                      |<-- transcode.request --|
   |                      |   {video_id, paths,   |
   |                      |    target_resolutions} |

 步骤 4：Transcoding 管道处理视频
 ==================================================

   Message Queue          Transcoding Orchestrator
      |                          |
      |-- transcode.request ---->|
      |                          |
      |     创建任务 DAG：
      |     1. 探测视频元数据
      |     2. 分割成片段
      |     3. 各分辨率 transcode（并行）
      |     4. 生成缩略图
      |     5. 提取音轨
      |     6. 生成 manifest 文件
      |     7. 将 transcoded 片段上传到 S3
      |     8. 通知完成
      |                          |
      |<-- transcode.completed --|
```

### Transcoding 管道（DAG）

```
                      单个视频的 Transcoding DAG
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
          | 4. 生成        |   | 5. 提取         |
          |    缩略图      |   |    音轨         |
          |    - sprite    |   |    - AAC 128k   |
          |    - poster    |   |    - AAC 256k   |
          |    - timeline  |   +--------+--------+
          +--------+-------+            |
                   |                    |
                   +----------+---------+
                              |
                   +----------v----------+
                   | 6. 生成             |
                   |    Manifest 文件    |
                   |    - master.m3u8    |
                   |    - 每种分辨率的   |
                   |      playlist      |
                   +----------+----------+
                              |
                   +----------v----------+
                   | 7. 上传到 S3        |
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
                   | 8. 发布事件         |
                   |    - 更新状态       |
                   |      为 'ready'     |
                   |    - 通知用户       |
                   |    - 使 CDN 缓存失效|
                   +---------------------+
```

### Transcoding 配置矩阵

| 分辨率 | 码率（H.264）    | 码率（H.265）    | 码率（VP9）   | 码率（AV1）   |
| ------ | ---------------- | ---------------- | ------------- | ------------- |
| 240p   | 400 kbps         | 250 kbps         | 200 kbps      | 150 kbps      |
| 360p   | 700 kbps         | 450 kbps         | 400 kbps      | 300 kbps      |
| 480p   | 1,200 kbps       | 750 kbps         | 700 kbps      | 500 kbps      |
| 720p   | 2,500 kbps       | 1,500 kbps       | 1,400 kbps    | 1,000 kbps    |
| 1080p  | 5,000 kbps       | 3,000 kbps       | 2,800 kbps    | 2,000 kbps    |
| 4K     | 16,000 kbps      | 10,000 kbps      | 9,000 kbps    | 6,000 kbps    |

### Codec 选择策略

```
Codec 选择决策树：

  该视频是否热门（前 24 小时 >10K 观看量）？
    |
    +-- 是：Transcode 为所有 codec（H.264、H.265、VP9、AV1）
    |        AV1 在大规模下比 H.264 节省 50% 带宽
    |
    +-- 否：仅 transcode 为 H.264（通用兼容性）
             如果观看量增长，将 VP9/AV1 transcoding 排入队列
```

---

## 6. 视频流播放深入探讨

### 流媒体协议比较

| 特性                 | HLS                  | DASH                 | RTMP              |
| -------------------- | -------------------- | -------------------- | ----------------- |
| 全称                 | HTTP Live Streaming  | Dynamic Adaptive     | Real-Time         |
|                      |                      | Streaming over HTTP  | Messaging Protocol|
| 开发者               | Apple                | MPEG                 | Adobe             |
| 传输协议             | HTTP                 | HTTP                 | TCP               |
| Manifest 格式        | .m3u8                | .mpd (XML)           | N/A               |
| 分段格式             | .ts 或 .fmp4         | .m4s 或 .mp4         | FLV               |
| Adaptive Bitrate     | 是                   | 是                   | 有限              |
| DRM 支持             | FairPlay, Widevine   | Widevine, PlayReady  | 有限              |
| 延迟                 | 6-30s (LL-HLS: 2-5s)| 3-10s (LL-DASH: 2-3s)| 1-3s              |
| 浏览器支持           | Safari 原生，JS      | JS 播放器            | Flash（已弃用）   |
|                      | 播放器全平台支持     | 全平台支持           |                   |
| CDN 友好度           | 非常好（基于 HTTP）  | 非常好（基于 HTTP）  | 差                |
| 行业采用率           | 非常高               | 高                   | 仅遗留系统        |

**决策**：使用 HLS 作为主要协议，DASH 作为备选。HLS 拥有最广泛的设备支持（iOS、Android、智能电视），并与基于 HTTP 的 CDN 无缝配合。

### Adaptive Bitrate Streaming（ABR）

```
 Adaptive Bitrate Streaming
 ============================================================================

  客户端带宽
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
  0 +--+---+---+---+---+---+---+---+---+---+---+---+---+---+---+--> 时间
       s1  s2  s3  s4  s5  s6  s7  s8  s9  s10 s11 s12 s13 s14 s15

  选择的画质：
       360 360 480 720 720 1080 1080 1080 1080 1080 720 720 480 480 360

  +----------+     +-------------------+     +------------------+
  | 播放器   |     | ABR 算法          |     | 片段请求         |
  | 缓冲     |---->| - 测量            |---->| GET /720p/       |
  | 监控器   |     |   吞吐量          |     |   segment_005.ts |
  |          |     | - 检查缓冲        |     |                  |
  |          |     |   级别            |     |                  |
  |          |     | - 选择画质        |     |                  |
  +----------+     +-------------------+     +------------------+

  ABR 算法输入：
  1. 最近 N 个片段的实测下载吞吐量
  2. 当前缓冲级别（已缓冲的视频秒数）
  3. 缓冲目标（通常 30 秒）
  4. manifest 中可用的画质级别

  ABR 算法决策：
  - 如果吞吐量 > 当前码率的 1.5 倍 且 缓冲 > 10 秒 -> 提高画质
  - 如果吞吐量 < 当前码率的 0.8 倍 或 缓冲 < 5 秒 -> 降低画质
  - 否则 -> 维持当前画质
```

### HLS Manifest 结构

```
 Master Playlist (manifest.m3u8)
 ================================

 #EXTM3U
 #EXT-X-VERSION:6
 #EXT-X-INDEPENDENT-SEGMENTS

 # 纯音频轨道
 #EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",
   DEFAULT=YES,URI="audio/en/playlist.m3u8"
 #EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Spanish",
   DEFAULT=NO,URI="audio/es/playlist.m3u8"

 # 字幕轨道
 #EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",
   DEFAULT=YES,URI="subs/en/playlist.m3u8"

 # 视频变体（按带宽排序）
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


 分辨率 Playlist (720p/playlist.m3u8)
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

### 分块传输和缓冲管理

```
 片段时间线
 ============================================================================

 视频：[seg0][seg1][seg2][seg3][seg4][seg5][seg6][seg7][seg8][seg9]...
        10s   10s   10s   10s   10s   10s   10s   10s   10s   10s

 播放器在 t=35 秒时的缓冲状态：
 ============================================================================

         已播放                  当前     预缓冲
 |========================|====|=============================|
 seg0    seg1    seg2     ^seg3  seg4    seg5    seg6
                          |
                     播放头 (35s)

 缓冲级别 = 播放头前方 25 秒
 目标缓冲 = 30 秒
 操作：以当前画质下载 seg7

 缓冲管理策略：
 ============================================================================

 缓冲级别        操作
 ---------------------------------------------------------------
 < 2 秒          紧急：请求最低画质，暂停播放
 2-5 秒          立即切换到最低可用画质
 5-10 秒         降低一个画质级别
 10-30 秒        维持当前画质或在吞吐量允许时提高
 > 30 秒         停止下载直到缓冲降至目标以下
```

---

## 7. CDN 架构

### 为什么 CDN 对视频至关重要

```
 没有 CDN：
 ============================================================================

 东京用户               伦敦用户              圣保罗用户
      |                     |                      |
      |   250ms RTT         |   150ms RTT          |   180ms RTT
      |                     |                      |
      +---------------------+----------------------+
                             |
                    源站 (US-East)

 每个 2MB 片段需要：
   TCP 握手：1 RTT
   TLS 握手：2 RTT
   HTTP 请求：1 RTT
   数据传输：≈4 RTT（2MB 在典型带宽下）
   总计：≈8 RTT 每个片段

 对于东京用户：8 x 250ms = 2 秒每个片段
 使用 10 秒片段：勉强跟上，没有缓冲余量


 有 CDN：
 ============================================================================

 东京用户               伦敦用户              圣保罗用户
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
                    源站 (US-East)

 对于东京用户：8 x 5ms = 40ms 每个片段（50 倍提升）
 缓存命中率目标：热门内容 95%+
```

### CDN 拓扑

```
 CDN 层级结构（3 层）
 ============================================================================

 第 1 层：边缘 PoP（全球 200+ 个位置）
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

 第 2 层：区域 PoP（20-30 个位置）
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

 第 3 层：Origin Shield + 对象存储
 ============================================================================
                   +------------------+
                   | Origin Shield    |
                   | (将多个边缘请求  |
                   |  合并为一个)     |
                   | Cache: 5PB      |
                   +--------+---------+
                            |
                   +--------v---------+
                   | Object Storage   |
                   | (S3 / GCS)       |
                   | 所有视频数据     |
                   +------------------+
```

### 缓存策略

| 内容类型             | 缓存时长       | 策略      | 备注                           |
| -------------------- | -------------- | --------- | ------------------------------ |
| 视频片段（.ts）      | 1 年           | Pull      | 不可变，内容寻址               |
| HLS manifest         | 10 秒          | Pull      | 直播需要保持新鲜度             |
| 缩略图               | 30 天          | Pull      | 更新时重新生成                 |
| 热门视频             | 主动推送       | Push      | 预热边缘缓存                   |
| 长尾内容             | 按需           | Pull      | 通过 LRU 淘汰                  |

### Push 与 Pull CDN 策略

```
 内容热度分布（Zipf 定律）
 ============================================================================

 观看量
   ^
   |  *
   |  **
   |   ***
   |     *****
   |          **********
   |                    ****************************
   +---+---+---+---+---+---+---+---+---+---+---+---+----> 视频
       |       |                   |
   前 0.1%   前 1%              前 10%
   (头部)    (腰部)             (长尾)

 策略：
 - 前 0.1%（病毒式传播/热门）：主动 PUSH 到所有边缘 PoP
   约 800 个视频，存储在所有 200 台边缘服务器上

 - 前 1%：PUSH 到区域 PoP，按需 pull 到边缘
   约 8,000 个视频，存储在 25 台区域服务器上

 - 前 10%：边缘 pull-through 缓存，保留在区域节点
   约 80,000 个视频

 - 剩余 90%：按需从源站 pull，短缓存 TTL
   约 720,000,000 个视频，大部分从源站提供

 缓存命中率目标：
 - 边缘：85-90%（热门内容）
 - 区域：95%（包含腰部内容）
 - Origin Shield：99%（保护对象存储）
```

---

## 8. 推荐系统

### 架构概览

```
 推荐管道
 ============================================================================

 +------------------+     +------------------+     +------------------+
 | 数据收集         |---->| 特征工程         |---->| 模型训练         |
 |                  |     |                  |     |                  |
 | - 观看历史       |     | - 用户特征       |     | - Collaborative  |
 | - 搜索查询       |     | - 视频特征       |     |   filtering      |
 | - 点赞/踩        |     | - 上下文（时间、 |     | - Content-based  |
 | - 观看时长       |     |   设备、位置）   |     | - Deep learning  |
 | - 订阅           |     | - 交互特征       |     |   (two-tower)    |
 +------------------+     +------------------+     +------------------+
                                                          |
                                                          v
                                                   +------------------+
 +------------------+     +------------------+     | 候选生成         |
 | 最终排序         |<----| 重新排序         |<----| Candidate        |
 |                  |     |                  |     | Generation       |
 | - Top N 视频     |     | - 多样性         |     |                  |
 | - 个性化         |     | - 新鲜度         |     | - 1000 个候选    |
 |   推荐流         |     | - 业务规则       |     |   视频           |
 | - 缓存 5 分钟    |     | - 过滤已看       |     | - 来自多个       |
 +------------------+     +------------------+     |   来源           |
                                                   +------------------+
```

### Collaborative Filtering

```
 用户-物品交互矩阵
 ============================================================================

              Video1  Video2  Video3  Video4  Video5  Video6
 User A:      [  5      3       -       1       -       4  ]
 User B:      [  4      -       -       1       -       5  ]
 User C:      [  -      3       4       -       5       -  ]
 User D:      [  -      -       5       -       4       -  ]

 方法：矩阵分解（ALS 或 SVD）
 - 分解为用户矩阵 (U) x 物品矩阵 (V)
 - U：每个用户表示为隐空间中的向量
 - V：每个视频表示为隐空间中的向量
 - 预测评分 = 用户向量和视频向量的点积
 - 填充缺失值以生成推荐

 对于 User B（喜欢 Video1、Video4、Video6）：
   与 User A 相似 -> 推荐 Video2（A 评分为 3）
```

### Content-Based Filtering

```
 视频特征向量
 ============================================================================

 提取的视频特征：
 - 类别：[education, tech, cooking, music, sports, ...]
 - 标签：TF-IDF 加权
 - 标题/描述：BERT embeddings（768 维）
 - 视觉特征：CNN 提取（从缩略图/帧）
 - 音频特征：时长、是否有音乐、语音比例
 - 参与度信号：平均观看完成百分比、点赞率

 用户画像 = 观看过的视频特征向量的加权平均
 推荐 = 找到与用户画像余弦相似度最高的视频

 余弦相似度：
   sim(user, video) = (user_vec . video_vec) / (|user_vec| * |video_vec|)
```

### Two-Tower 深度学习模型（生产方案）

```
 Two-Tower 架构
 ============================================================================

    用户塔                                   视频塔
 +-----------------+                    +-----------------+
 | User ID (embed) |                    | Video ID (embed)|
 | 观看历史        |                    | 标题 (BERT)     |
 | 人口统计        |                    | 类别            |
 | 设备/上下文     |                    | 标签            |
 +-----------------+                    | 时长            |
         |                              | 上传日期        |
    +----v----+                         | 参与度统计      |
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
                   分数 (0-1)

 训练：优化观看时长预测
 服务：预计算视频 embedding，实时计算用户 embedding
 ANN（近似最近邻）：使用 FAISS/ScaNN 进行快速检索
```

### 特征工程总结

| 特征类别     | 特征                                               | 来源             |
| ------------ | -------------------------------------------------- | ---------------- |
| 用户画像     | 年龄、国家、语言、设备类型                         | 注册信息         |
| 观看历史     | 最近 100 个观看视频、观看完成率                    | 事件日志         |
| 参与度       | 点赞率、评论频率、分享频率                         | 事件日志         |
| 上下文       | 一天中的时间、星期几、会话时长                     | 实时             |
| 视频元数据   | 标题、描述、标签、类别、时长                       | 上传元数据       |
| 视频质量     | 分辨率、制作质量评分                               | ML 模型          |
| 社交信号     | 订阅者数、视频年龄、热门评分                       | 聚合统计         |
| 新鲜度       | 上传后小时数、观看量增长速度                       | 计算值           |

---

## 9. 搜索

### 搜索架构

```
 搜索管道
 ============================================================================

 +--------+     +-----------+     +----------------+     +-------------+
 | 客户端 |---->| API       |---->| 查询理解       |---->| Elastic-    |
 | 查询   |     | Gateway   |     | - 分词         |     | search      |
 |        |     |           |     | - 拼写检查     |     | 集群        |
 |        |     |           |     | - 同义词       |     |             |
 |        |     |           |     | - 查询扩展     |     | 按 video_id |
 +--------+     +-----------+     +----------------+     | 分片        |
                                                          +------+------+
                                                                |
                                                         +------v------+
 +--------+     +---------------+     +-------------+   | 原始结果    |
 | 最终   |<----| 个性化        |<----| 相关性       |<--| (前 1000)   |
 | 结果   |     | 重新排序      |     | 评分         |   |             |
 | (前20) |     |               |     |             |   +-------------+
 +--------+     +---------------+     +-------------+
```

### Elasticsearch 索引映射

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

### 相关性评分公式

```
 最终分数 = w1 * text_relevance
           + w2 * engagement_score
           + w3 * freshness_score
           + w4 * personalization_score
           + w5 * quality_score

 其中：
   text_relevance     = BM25(query, title) * 3.0
                      + BM25(query, description) * 1.0
                      + BM25(query, tags) * 2.0
                      + BM25(query, captions) * 0.5

   engagement_score   = log(1 + view_count) * 0.3
                      + like_ratio * 0.4
                      + avg_watch_completion * 0.3

   freshness_score    = exp(-age_days / 30)   （指数衰减）

   personalization    = cosine_sim(user_embedding, video_embedding)

   quality_score      = channel_authority * 0.5
                      + production_quality * 0.3
                      + content_safety * 0.2

 典型权重：w1=0.4, w2=0.25, w3=0.1, w4=0.15, w5=0.1
```

### 搜索排序因素

| 因素                    | 权重   | 描述                                        |
| ----------------------- | ------ | ------------------------------------------- |
| 标题匹配                | 高     | 标题中的精确和部分匹配                      |
| 标签匹配                | 高     | 查询词匹配视频标签                          |
| 描述匹配                | 中     | 描述中的查询词                              |
| 字幕匹配                | 低     | 自动生成字幕中的查询词                      |
| 观看量                  | 中     | 总观看量的对数尺度                          |
| 点赞/踩比率             | 中     | 更高比率 = 更好的内容信号                   |
| 观看完成率              | 中     | 用户看完的视频排名更高                      |
| 新鲜度                  | 低     | 较新的视频获得小幅提升                      |
| 频道权威度              | 低     | 持续高质量的成熟频道                        |
| 用户个性化              | 中     | 基于用户的观看历史和偏好                    |

---

## 10. 扩展性

### 存储扩展

```
 存储架构
 ============================================================================

 +------------------------------------------------------------------+
 |                     对象存储 (S3)                                 |
 |                                                                  |
 |  Bucket: videos-raw                                              |
 |  ├── 生命周期：30 天后迁移到 S3-IA                              |
 |  ├── 生命周期：1 年后迁移到 Glacier                             |
 |  └── 生命周期：7 年后删除（如果 3 年内无观看）                  |
 |                                                                  |
 |  Bucket: videos-transcoded                                       |
 |  ├── 热层 (S3 Standard)：最近 30 天 + 热门视频                  |
 |  ├── 温层 (S3-IA)：30 天至 1 年，中等观看量                     |
 |  └── 冷层 (S3 Glacier IR)：>1 年，低观看量                      |
 |                                                                  |
 |  Bucket: thumbnails                                              |
 |  └── S3 Standard（始终热存储，小文件，频繁访问）                |
 +------------------------------------------------------------------+

 存储成本优化：
 ============================================================

 层级          | 成本/GB/月  | 内容                   | 数据占比
 --------------|------------|------------------------|----------
 S3 Standard   | $0.023     | 最新 + 热门             | 15%
 S3-IA         | $0.0125    | 中等访问               | 25%
 S3 Glacier IR | $0.004     | 罕见访问，快速读取     | 40%
 S3 Glacier DA | $0.00099   | 归档，12 小时检索      | 20%

 混合费率：≈$0.007/GB/月
 对于 1 EB 存储：≈$7M/月（相比全部 Standard 的 $23M）
```

### 数据库分片策略

```
 元数据数据库 (PostgreSQL) 分片
 ============================================================================

 分片键：video_id（一致性哈希）

 +----------+  +----------+  +----------+  +----------+
 | Shard 0  |  | Shard 1  |  | Shard 2  |  | Shard 3  |
 | videos   |  | videos   |  | videos   |  | videos   |
 | 0-25%    |  | 25-50%   |  | 50-75%   |  | 75-100%  |
 | hash     |  | hash     |  | hash     |  | hash     |
 | range    |  | range    |  | range    |  | range    |
 +----+-----+  +----+-----+  +----+-----+  +----+-----+
      |              |              |              |
      +--- 每个分片：主节点 + 2 个只读副本 ---+

 分片数量：从 16 开始，通过一致性哈希扩展到 64+
 每个分片：约 5000 万个视频

 用户数据库：按 user_id 分片
 评论：按 video_id 分片（与视频元数据共同定位）
 订阅：按 subscriber_id 分片（用于用户的订阅列表）
               按 channel_id 的二级索引（用于订阅者数量）
```

### Transcoding 自动扩展

```
 Transcoding 工作节点集群
 ============================================================================

 +--------------------+
 | 任务队列 (SQS)     |     扩展策略：
 | - 优先级队列       |     - 目标：队列等待时间 < 5 分钟
 | - 失败死信队列     |     - 扩容：队列深度 > 1000 时
 +--------+-----------+     - 缩容：队列深度 < 100 时
          |                 - 最小：50 个实例
          v                 - 最大：2000 个实例
 +---+---+---+---+---+     - 冷却时间：5 分钟
 | W | W | W | W | W |
 | 1 | 2 | 3 | 4 | 5 |     实例类型：
 +---+---+---+---+---+     - GPU 实例 (g5.xlarge) 用于 H.265/AV1
 | W | W | W | W | W |     - CPU 实例 (c6i.8xlarge) 用于 H.264
 | 6 | 7 | 8 | 9 |10 |    - Spot 实例用于非紧急 transcoding
 +---+---+---+---+---+       （节省 70% 成本，处理中断）
         ...
 +---+---+---+---+---+
 | W | W | W | W | W |
 |46 |47 |48 |49 |50 |
 +---+---+---+---+---+

 优先级：
   P0：付费创作者（SLA：5 分钟内处理完成）
   P1：普通上传（SLA：15 分钟内处理完成）
   P2：重新编码现有内容（SLA：24 小时）
   P3：推测性格式 transcoding（尽力而为）
```

### 大规模观看量计数

```
 观看量计数管道（处理每天 10 亿+ 次观看）
 ============================================================================

 问题：每次观看直接递增数据库 = 数据库崩溃

 解决方案：多层聚合

 第 1 层：客户端去重
 +--------+     客户端对观看事件进行防抖（每个视频每 30 秒 1 次）
 | Client |     过滤类似机器人的行为模式
 +---+----+
     |
 第 2 层：边缘聚合
     v
 +---+----------+     按每台边缘服务器每个视频计数
 | 边缘计数器   |     每 10 秒刷新一次
 | (内存中)     |     本地 HyperLogLog 估算唯一观看者
 +---+----------+
     |
 第 3 层：Kafka 流处理
     v
 +---+----------+     聚合来自所有边缘的观看事件
 | Kafka Streams|     窗口聚合（1 分钟翻转窗口）
 | / Flink      |     使用概率数据结构去重
 +---+----------+
     |
 第 4 层：批量更新数据库
     v
 +---+----------+     每 1 分钟批量 UPDATE
 | Cassandra    |     UPDATE video_stats SET view_count = view_count + delta
 | (counters)   |     近似计数（精度在 2% 以内）
 +---+----------+
     |
 第 5 层：读取缓存
     v
 +---+----------+     在 Redis 中缓存观看量（TTL：60 秒）
 | Redis Cache  |     从缓存提供读取请求
 +---+----------+     仅在缓存未命中时查询 Cassandra

 精度与性能的权衡：
 - 实时显示：近似计数（约 2% 以内），每分钟更新
 - 分析仪表板：来自批处理的精确计数（每小时）
 - 变现：来自审计批处理管道的精确计数（每天）
```

---

## 11. 成本优化

### 成本分解（满规模估计月度费用）

```
 月度成本分解
 ============================================================================

 类别                  | 月成本      | 占总成本 % | 备注
 ----------------------|-------------|------------|---------------------------
 CDN / 带宽            | $150M       | 50%        | 最大成本项
 存储（对象存储）      | $70M        | 23%        | 含分层优化
 Transcoding 计算      | $30M        | 10%        | GPU + CPU 集群
 元数据数据库          | $15M        | 5%         | PostgreSQL + Cassandra
 搜索 (Elasticsearch)  | $10M        | 3%         | 大型集群
 ML / 推荐             | $10M        | 3%         | 训练 + 服务
 其他（认证、API 等）  | $15M        | 5%         | 辅助服务
 ----------------------|-------------|------------|
 总计                  | ≈$300M      | 100%       |
```

### 存储分层策略

```
 视频生命周期和存储层迁移
 ============================================================================

 上传    1 天    7 天    30 天    1 年     3 年     7 年
   |       |       |       |        |         |        |
   v       v       v       v        v         v        v
 [原始上传]--->[确认 transcoding 完成后删除原始文件]
 [Transcoded]--->[S3 Standard]--->[S3-IA]--------->[Glacier IR]-->[Glacier DA]
 [缩略图]--->[S3 Standard（始终）]
 [字幕]--->[S3 Standard（始终，小文件）]

 智能分层：
 - 最近 90 天内 0 次观看的视频 -> 迁移到 Glacier IR
 - 最近 1 年内 0 次观看的视频 -> 迁移到 Glacier Deep Archive
 - 如果冷视频被观看 -> 恢复到 S3-IA（异步，显示"加载中"）
```

### CDN 成本优化

```
 CDN 成本优化策略
 ============================================================================

 1. 多 CDN 策略
    - 按区域使用最便宜的 CDN
    - Akamai 用于北美/欧洲
    - CloudFront 用于 AWS 密集区域
    - 区域 CDN 用于特定市场（中国、印度）
    - 基于 DNS 的路由到最便宜的提供商

 2. 源站卸载
    - 目标：95%+ 缓存命中率
    - 将热门内容预热到边缘
    - 视频片段使用更长的缓存 TTL（不可变）
    - Origin shield 减少源站请求

 3. Codec 效率
    - AV1 在相同质量下比 H.264 减少 50% 带宽
    - 将前 1% 的视频迁移到 AV1：节省约 15% CDN 成本
    - 预计节省：$22M/月

 4. 区域编码
    - 在连接较慢的区域降低默认画质
    - 移动用户：上限 720p，除非明确请求更高画质
    - 减少不必要的 4K transcoding

 5. P2P 辅助 (WebRTC)
    - 用于非常热门的直播内容
    - 观众与附近的观众共享片段
    - 对于病毒式内容可减少 30-60% CDN 负载
```

### Transcoding 成本优化

```
 Transcoding 策略矩阵
 ============================================================================

 视频热度           | 即时 Transcode         | 延迟 Transcode
 (预测)            | (上传时)               | (首次请求时)
 --------------------|----------------------|--------------------
 高（预计 >10K      | 240p, 360p, 480p,    | 4K AV1
 次观看）           | 720p, 1080p H.264    |
                    | + VP9 720p, 1080p    |
 --------------------|----------------------|--------------------
 中（1K-10K）       | 360p, 720p, 1080p    | 4K, 240p, VP9, AV1
                    | 仅 H.264             |
 --------------------|----------------------|--------------------
 低（预计 <1K       | 仅 360p, 720p H.264  | 其他所有
 次观看）           |                      | （请求时再
                    |                      |  transcode）
 --------------------|----------------------|--------------------

 热度预测模型：
 - 频道订阅者数量
 - 历史视频表现
 - 标题/缩略图质量评分
 - 上传时间 / 热门话题

 相比全部 transcode 的预估节省：
   减少 40% transcoding 计算成本（约 $12M/月节省）
```

---

## 12. 部署架构

### 全球基础设施

```
 全球部署架构
 ============================================================================

                           +---------------------------+
                           |    Global DNS (Route 53)  |
                           |    GeoDNS / 基于延迟路由  |
                           +-----+-----+-----+--------+
                                 |     |     |
                +----------------+     |     +----------------+
                |                      |                      |
                v                      v                      v
 +==========================+ +==========================+ +==========================+
 |    US-EAST 区域           | |    EU-WEST 区域           | |    APAC 区域             |
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
                              | 跨区域同步           |
                              | - 数据库复制         |
                              | - S3 CRR            |
                              | - 事件总线 (Kafka)   |
                              +---------------------+
```

### 部署策略

| 组件              | 策略                             | 发布方式           |
| ----------------- | -------------------------------- | ------------------ |
| API 服务          | 蓝绿部署                         | 金丝雀 1% -> 10% -> 100% |
| Transcoding       | 滚动更新                         | 每次替换 10%              |
| CDN 配置          | 渐进式传播                       | 逐区域发布                |
| 数据库 Schema     | 在线迁移 (gh-ost)                | 零停机                    |
| ML 模型           | 影子模式 -> A/B 测试 -> 全量     | 先衡量参与度              |
| 客户端应用        | Feature flags                    | 渐进式发布                |

---

## 13. 常见面试追问

### 如何处理直播流？

```
 直播流架构
 ============================================================================

 +----------+     +----------------+     +------------------+
 | 主播     |---->| Ingest 服务器  |---->| Transcoding      |
 | (OBS/    |RTMP | (接收 RTMP/    |     | (实时)           |
 |  移动端) |SRT  |  SRT 流)       |     | - 更低延迟       |
 +----------+     +----------------+     | - 更少画质       |
                                          |   级别 (3-4)     |
                                          +--------+---------+
                                                   |
                                          +--------v---------+
                                          | Packager          |
                                          | - 分割成          |
                                          |   2-6 秒的分块   |
                                          | - 生成直播        |
                                          |   m3u8 manifest  |
                                          +--------+---------+
                                                   |
                                          +--------v---------+
                                          | CDN (LL-HLS)     |
                                          | - 低延迟 HLS     |
                                          | - 2-5 秒延迟     |
                                          | - 部分片段       |
                                          |   传输           |
                                          +--------+---------+
                                                   |
                                          +--------v---------+
                                          | 观众（数百万）   |
                                          +------------------+

 与 VOD 的关键区别：
 - 实时 transcoding（没有时间优化编码）
 - 滑动窗口 manifest（不是完整播放列表）
 - 更短的片段时长（2-6 秒 vs VOD 的 10 秒）
 - DVR 功能：保留最近 2-4 小时供回看
 - 聊天服务同步运行（基于 WebSocket）
 - 直播结束后：从录制创建 VOD
```

### 如何实现视频版权检测？

```
 版权检测管道
 ============================================================================

 1. Content ID 系统（类似 YouTube）：
    - 版权所有者上传参考文件（音频 + 视频指纹）
    - 每个上传的视频都会被提取指纹并与参考数据库比对

 2. 检测流程：

 +----------+     +------------------+     +------------------+
 | 上传的   |---->| 音频指纹         |---->| 视频指纹         |
 | 视频     |     | 提取             |     | 提取             |
 +----------+     | (Chromaprint/    |     | (感知哈希，      |
                  |  Dejavu)         |     |  场景检测)       |
                  +--------+---------+     +--------+---------+
                           |                        |
                  +--------v------------------------v---------+
                  |           匹配引擎                        |
                  |  与参考数据库比对                          |
                  |  （数十亿指纹）                           |
                  |  使用 Locality-Sensitive Hashing 加速     |
                  +---------------------+---------------------+
                                        |
                            +-----------v-----------+
                            |   是否匹配？           |
                            +---+---------------+---+
                                |               |
                            是  |               | 否
                                v               v
                  +------------------+  +------------------+
                  | 应用策略：       |  | 允许视频         |
                  | - 阻止上传       |  | （继续正常       |
                  | - 为版权所有者   |  |  处理）          |
                  |   变现           |  +------------------+
                  | - 允许但带广告   |
                  +------------------+

 3. 持续监控：随着参考数据库增长定期重新扫描
```

### 如何处理病毒式视频（突发流量高峰）？

```
 病毒式视频处理
 ============================================================================

 检测：
 - 监控观看速度：如果 观看量/分钟 > 平均值的 10 倍，标记为病毒式
 - 预测模型：订阅者通知参与率
 - 社交媒体监控：外部链接激增检测

 响应（自动化）：

 +--------------------+     +--------------------+     +--------------------+
 | 第 1 级：检测      |---->| 第 2 级：CDN 预热  |---->| 第 3 级：源站      |
 | (< 1 分钟)         |     | (< 5 分钟)          |     | 保护               |
 |                     |     |                     |     | (持续)             |
 | - 观看速度         |     | - 将视频推送到所有 |     | - Origin shield    |
 |   告警触发         |     |   边缘 PoP         |     |   合并重复请求     |
 | - 自动分类         |     | - 预热所有         |     | - 自动扩展         |
 |   为"热门"内容     |     |   分辨率           |     |   源站容量         |
 |                     |     | - 增加 CDN         |     | - 限制非关键       |
 |                     |     |   缓存 TTL         |     |   API 速率         |
 +--------------------+     +--------------------+     +--------------------+

 容量规划：
 - 病毒式视频可以从 0 增长到 1000 万次观看/小时
 - 以 5 Mbps 平均码率：1000 万次观看/小时 x 5 Mbps = 50 Tbps 峰值
 - CDN 必须能处理 50 Tbps 突发（与 CDN 提供商预先协商容量）
 - 源站必须在最初几分钟处理缓存未命中
```

### 如何实现视频章节/时间戳？

```
 视频章节
 ============================================================================

 两种方法：

 1. 创作者定义的章节：
    - 创作者在描述中或通过 UI 添加时间戳
    - 上传时解析：正则匹配 "MM:SS - 标题" 模式
    - 存储在视频元数据中：

    chapters: [
      { time_sec: 0,    title: "Introduction" },
      { time_sec: 120,  title: "Setting Up" },
      { time_sec: 340,  title: "Core Concepts" },
      { time_sec: 780,  title: "Advanced Topics" },
      { time_sec: 1200, title: "Summary" }
    ]

 2. 自动生成章节（ML）：
    - 场景检测：识别视觉转场
    - 语音转文字：转录并按主题分段
    - NLP：从转录片段生成章节标题
    - 用参与度数据验证：章节与观看行为中的
      自然暂停/重播点对齐

 播放器集成：
 +------------------------------------------------------------------+
 | [======|====|=============|===========|======] 20:30             |
 |  Intro  Setup  Core          Advanced   Summary                  |
 +------------------------------------------------------------------+
   悬停进度条时显示章节标题和缩略图
```

### 如何减少视频启动时间？

```
 启动时间优化（目标：< 2 秒）
 ============================================================================

 视频启动分解：

 步骤                      未优化        优化后         技术
 ------------------------  -----------    ----------     --------------------
 DNS 解析                  50-200ms       5-10ms         DNS prefetch，keep-alive
 TCP + TLS 握手            100-300ms      0ms            连接预热，
                                                         HTTP/2 多路复用
 Manifest 获取             50-200ms       20-50ms        CDN 边缘缓存，
                                                         内联到页面 HTML
 首个片段获取              200-500ms      50-100ms       CDN 边缘，更小的
                                                         初始片段 (2s)
 解码 + 渲染               100-200ms      50-100ms       硬件解码，
                                                         预加载首帧
 ABR 决策                  50-100ms       0ms            以低画质开始，
                                                         2 个片段后提升
 最小缓冲                  500-2000ms     200-500ms      仅缓冲 1 个片段
                                                         即开始播放
 ------------------------  -----------    ----------
 总计                      1050-3500ms    325-760ms

 其他技术：
 1. 预测性预加载：当用户悬停在缩略图上时，在后台开始
    获取首个片段
 2. 在搜索结果页面预取前 3 个结果的 manifest
 3. 使用 HTTP/3 (QUIC) 实现 0-RTT 连接建立
 4. Byte-range 请求：初始仅获取前 2 秒
 5. MOOV atom 优化：将 MP4 元数据放在文件开头
 6. 客户端片段缓存：缓存最近观看的视频片段
```

---

## 总结

### 关键设计决策

| 决策                         | 选择                      | 理由                                 |
| ---------------------------- | ------------------------- | ------------------------------------ |
| 上传协议                     | 可恢复上传 (tus)          | 大文件，不可靠的网络                 |
| 流媒体协议                   | HLS（主要）               | 最广泛的设备支持，CDN 友好           |
| 视频存储                     | 对象存储 (S3)             | 无限扩展，高持久性                   |
| 元数据数据库                 | PostgreSQL（分片）        | ACID 保证关键元数据                  |
| 计数器/分析                  | Cassandra                 | 高写入吞吐量，时间序列              |
| 搜索                         | Elasticsearch             | 全文搜索，相关性评分                 |
| 缓存                         | Redis                     | 会话、元数据、计数缓存              |
| 消息队列                     | Kafka                     | 高吞吐量，事件回放                   |
| CDN 策略                     | 多 CDN，3 层              | 成本优化，全球覆盖                   |
| Transcoding                  | 自动扩展工作节点集群      | 处理可变的上传量                     |
| 推荐                         | Two-tower 深度学习        | 规模化和个性化                       |
| 观看量计数                   | 多层聚合                  | 每天处理 10 亿次观看而不压垮数据库   |

### 面试关键路径

在 45 分钟面试中重点讨论以下领域：

```
 时间    主题                           深度
 -----   ----------------------------   ----------------------------
 0-5     需求 + 估算                    展示存储/带宽的数学计算
 5-10    高层架构                       上传流程 + 流播放流程
 10-20   视频上传 + transcoding         DAG 管道，codec 选择
 20-30   流播放深入探讨                 HLS，ABR，CDN 架构
 30-35   扩展性挑战                     观看量计数，存储分层
 35-40   推荐（简述）                   Two-tower 模型概述
 40-45   追问                           直播流，病毒式处理
```

### 需要讨论的权衡

| 权衡                              | 选项 A                      | 选项 B                        |
| --------------------------------- | --------------------------- | ----------------------------- |
| 一致性 vs 可用性                  | 强一致性（观看量计数）      | 最终一致性（为扩展性选择）    |
| 即时 vs 延迟 transcoding          | 预先处理所有格式            | 按需处理（为成本选择）        |
| 自建 CDN vs 第三方               | 完全控制，高资本支出        | 托管，运营支出（选择）        |
| 单体 vs 微服务                    | 更简单的运维                | 独立扩展（选择）              |
| SQL vs NoSQL 存储元数据           | ACID 保证（选择）           | 更容易水平扩展                |
| 实时 vs 批处理推荐                | 更新鲜的结果（选择）        | 更低的计算成本                |
