# Design a News Feed System (Twitter/Facebook)

A news feed is the constantly updating list of stories in the middle of a user's home page.
It aggregates posts from people and pages a user follows, ranks them by relevance, and
delivers a personalized experience. This is one of the most frequently asked system design
questions because it touches on fan-out strategies, caching, ranking, and massive scale.

---

## 1. Requirements Clarification

### Functional Requirements

| ID  | Requirement                        | Description                                                    |
| --- | ---------------------------------- | -------------------------------------------------------------- |
| F1  | Publish posts                      | Users can create text, image, and video posts                  |
| F2  | View personalized feed             | Users see an aggregated feed of posts from people they follow  |
| F3  | Follow / Unfollow                  | Users can follow and unfollow other users                      |
| F4  | Like / Comment                     | Users can like and comment on posts                            |
| F5  | Media support                      | Posts can contain images, videos, and links with previews      |
| F6  | Feed refresh                       | Users can pull to refresh to see new posts                     |
| F7  | Pagination                         | Infinite scroll with efficient pagination                      |

### Non-Functional Requirements

| ID   | Requirement            | Target                                                        |
| ---- | ---------------------- | ------------------------------------------------------------- |
| NF1  | Feed latency           | Feed generation and retrieval < 500ms at p99                  |
| NF2  | Consistency model       | Eventually consistent (slight delay in feed updates is OK)    |
| NF3  | Availability            | 99.99% uptime (AP system in CAP theorem)                      |
| NF4  | Durability              | Zero data loss for published posts                            |
| NF5  | Scalability             | Handle 300M DAU with traffic spikes                           |

### Scale Estimation

```
DAU:                    300,000,000
Avg follows per user:   300
Avg posts/day (active): 5 posts/day (10% of users are active posters)
Active posters:         30,000,000
Total posts/day:        150,000,000  (~1,750 posts/sec avg, ~5,000 posts/sec peak)

Feed reads/day:         300M users * 10 opens/day = 3,000,000,000 reads/day
Feed read QPS:          ~35,000 reads/sec avg, ~100,000 reads/sec peak

Fan-out writes/day:     150M posts * 300 followers avg = 45,000,000,000 fan-out writes
Fan-out write QPS:      ~520,000 writes/sec avg

Storage (posts/year):
  - Text: 150M posts/day * 1KB avg = 150GB/day = 55TB/year
  - Media: 150M * 20% with media * 2MB avg = 60TB/day = 22PB/year

Feed cache (Redis):
  - 300M users * 500 post IDs * 8 bytes = ~1.2TB
```

---

## 2. API Design

### 2.1 Publish a Post

```
POST /v1/feed/publish
Authorization: Bearer <token>

Request Body:
{
  "content": "Hello world! Check out this photo.",
  "media_ids": ["media_abc123", "media_def456"],
  "visibility": "public",          // public | followers | private
  "reply_to": null                  // post_id if this is a reply
}

Response: 201 Created
{
  "post_id": "post_789xyz",
  "created_at": "2025-01-15T10:30:00Z",
  "status": "published"
}
```

Media is uploaded separately via a pre-signed URL flow before calling publish:

```
POST /v1/media/upload
Authorization: Bearer <token>

Request Body: multipart/form-data (file)

Response: 200 OK
{
  "media_id": "media_abc123",
  "upload_url": "https://cdn.example.com/upload/...",
  "status": "processing"
}
```

### 2.2 Get Personalized Feed

```
GET /v1/feed?cursor=<cursor>&limit=20
Authorization: Bearer <token>

Response: 200 OK
{
  "posts": [
    {
      "post_id": "post_789xyz",
      "author": { "user_id": "u123", "name": "Alice", "avatar_url": "..." },
      "content": "Hello world!",
      "media": [{ "type": "image", "url": "..." }],
      "like_count": 42,
      "comment_count": 7,
      "liked_by_me": false,
      "created_at": "2025-01-15T10:30:00Z"
    }
  ],
  "next_cursor": "eyJ0IjoxNzA1MzEyMjAwfQ==",
  "has_more": true
}
```

### 2.3 Follow / Unfollow

```
POST   /v1/follow/{userId}        // Follow a user
DELETE /v1/follow/{userId}        // Unfollow a user
GET    /v1/follow/{userId}/followers?cursor=...&limit=20
GET    /v1/follow/{userId}/following?cursor=...&limit=20
```

### 2.4 Like / Comment

```
POST   /v1/posts/{postId}/like
DELETE /v1/posts/{postId}/like
POST   /v1/posts/{postId}/comments   { "text": "Great post!" }
GET    /v1/posts/{postId}/comments?cursor=...&limit=20
```

### 2.5 Cursor-Based vs Offset-Based Pagination

```
Offset-based:  GET /feed?offset=20&limit=10
Cursor-based:  GET /feed?cursor=abc123&limit=10
```

| Aspect               | Offset-Based                  | Cursor-Based                      |
| -------------------- | ----------------------------- | --------------------------------- |
| New items inserted   | Duplicates / skipped items    | No duplicates                     |
| Performance          | O(n) - scans skipped rows     | O(1) - seeks to cursor position   |
| Consistency          | Breaks with real-time inserts | Stable across mutations           |
| Implementation       | Simple                        | Slightly more complex             |
| Use case             | Static datasets               | Real-time feeds (our choice)      |

**Cursor format**: Base64-encoded JSON containing the timestamp or sort key of the last
item returned. The server decodes it and uses it as a WHERE clause boundary.

```
Cursor = base64({ "created_at": "2025-01-15T10:30:00Z", "post_id": "post_789xyz" })
Query: SELECT * FROM feed WHERE (created_at, post_id) < (decoded_ts, decoded_id)
       ORDER BY created_at DESC, post_id DESC LIMIT 20
```

---

## 3. Data Model

### 3.1 Users Table (PostgreSQL)

```sql
CREATE TABLE users (
    user_id       BIGINT PRIMARY KEY,
    username      VARCHAR(50) UNIQUE NOT NULL,
    display_name  VARCHAR(100),
    email         VARCHAR(255) UNIQUE NOT NULL,
    avatar_url    VARCHAR(500),
    bio           TEXT,
    follower_count   INT DEFAULT 0,
    following_count  INT DEFAULT 0,
    is_celebrity     BOOLEAN DEFAULT FALSE,   -- flag for hybrid fan-out
    created_at    TIMESTAMP DEFAULT NOW(),
    updated_at    TIMESTAMP DEFAULT NOW()
);

-- A user is flagged as celebrity when follower_count > 500,000
```

### 3.2 Posts Table (PostgreSQL, sharded by user_id)

```sql
CREATE TABLE posts (
    post_id       BIGINT PRIMARY KEY,       -- Snowflake ID (contains timestamp)
    author_id     BIGINT NOT NULL,
    content       TEXT,
    visibility    VARCHAR(20) DEFAULT 'public',
    reply_to      BIGINT,                    -- NULL if not a reply
    like_count    INT DEFAULT 0,
    comment_count INT DEFAULT 0,
    share_count   INT DEFAULT 0,
    created_at    TIMESTAMP DEFAULT NOW(),

    INDEX idx_author_time (author_id, created_at DESC)
);
```

### 3.3 Follow Table (PostgreSQL, sharded by follower_id)

```sql
CREATE TABLE follows (
    follower_id   BIGINT NOT NULL,
    followee_id   BIGINT NOT NULL,
    created_at    TIMESTAMP DEFAULT NOW(),

    PRIMARY KEY (follower_id, followee_id),
    INDEX idx_followee (followee_id, follower_id)
);

-- "Who does user X follow?"  -> WHERE follower_id = X
-- "Who follows user Y?"      -> WHERE followee_id = Y
```

### 3.4 Feed Cache Structure (Redis Sorted Set)

```
Key:    feed:{user_id}
Type:   Sorted Set
Score:  post timestamp (or ranking score)
Value:  post_id

Example:
  ZADD feed:u123 1705312200 "post_abc"
  ZADD feed:u123 1705312100 "post_def"
  ZADD feed:u123 1705312000 "post_ghi"

Read:   ZREVRANGEBYSCORE feed:u123 +inf -inf LIMIT 0 20
Size:   Keep only latest 800 entries per user (ZREMRANGEBYRANK to trim)
TTL:    7 days (re-warm on access if expired)
```

### 3.5 Likes Table

```sql
CREATE TABLE likes (
    user_id    BIGINT NOT NULL,
    post_id    BIGINT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (user_id, post_id),
    INDEX idx_post (post_id)
);
```

### 3.6 Comments Table

```sql
CREATE TABLE comments (
    comment_id  BIGINT PRIMARY KEY,
    post_id     BIGINT NOT NULL,
    author_id   BIGINT NOT NULL,
    content     TEXT NOT NULL,
    created_at  TIMESTAMP DEFAULT NOW(),

    INDEX idx_post_time (post_id, created_at DESC)
);
```

### 3.7 Media Table

```sql
CREATE TABLE media (
    media_id    BIGINT PRIMARY KEY,
    post_id     BIGINT,
    uploader_id BIGINT NOT NULL,
    media_type  VARCHAR(20),          -- image, video, gif
    url         VARCHAR(500) NOT NULL,
    thumbnail   VARCHAR(500),
    width       INT,
    height      INT,
    size_bytes  BIGINT,
    status      VARCHAR(20) DEFAULT 'processing',
    created_at  TIMESTAMP DEFAULT NOW(),

    INDEX idx_post (post_id)
);
```

### 3.8 Database Selection Rationale

| Data               | Storage Choice  | Reason                                                       |
| ------------------ | --------------- | ------------------------------------------------------------ |
| Users              | PostgreSQL      | Strong consistency for profiles, ACID transactions           |
| Posts              | PostgreSQL      | Structured data, relational queries, sharded by author_id    |
| Follows            | PostgreSQL      | Graph queries, bidirectional lookups, transactional counts   |
| Feed cache         | Redis           | Ultra-low latency reads, sorted sets for ranking             |
| Media metadata     | PostgreSQL      | Relational joins with posts                                  |
| Media files        | S3 + CDN        | Blob storage, globally distributed                           |
| Likes / Comments   | PostgreSQL      | Transactional integrity, count accuracy                      |
| Activity log       | Cassandra       | High write throughput, time-series, append-only              |
| Search index       | Elasticsearch   | Full-text search on post content                             |

---

## 4. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENTS                                        │
│                    (Mobile Apps, Web Browsers)                               │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
                        ┌───────▼───────┐
                        │  API Gateway  │  (Rate limiting, Auth, Routing)
                        │  + Load       │
                        │  Balancer     │
                        └───┬───────┬───┘
                            │       │
              ┌─────────────▼─┐   ┌─▼──────────────┐
              │  WRITE PATH   │   │   READ PATH     │
              │               │   │                  │
              │ ┌───────────┐ │   │ ┌────────────┐  │
              │ │   Post    │ │   │ │   Feed     │  │
              │ │  Service  │ │   │ │  Service   │  │
              │ └─────┬─────┘ │   │ └──────┬─────┘  │
              │       │       │   │        │         │
              │ ┌─────▼─────┐ │   │ ┌──────▼─────┐  │
              │ │  Fan-out  │ │   │ │ Feed Cache  │  │
              │ │  Service  │ │   │ │  (Redis)    │  │
              │ └─────┬─────┘ │   │ └──────┬─────┘  │
              │       │       │   │        │         │
              └───────┼───────┘   └────────┼─────────┘
                      │                    │
          ┌───────────▼────────────────────▼──────────┐
          │              MESSAGE QUEUE                  │
          │               (Kafka)                       │
          └──┬──────────┬──────────┬──────────┬───────┘
             │          │          │          │
        ┌────▼───┐ ┌────▼───┐ ┌───▼────┐ ┌──▼───────┐
        │Post DB │ │Feed    │ │Notif.  │ │Analytics │
        │(PG)    │ │Cache   │ │Service │ │Service   │
        └────────┘ │(Redis) │ └────────┘ └──────────┘
                   └────────┘
          ┌───────────────────────────────────────────┐
          │                CDN (Media)                 │
          │         S3 / CloudFront / Akamai           │
          └───────────────────────────────────────────┘
```

### Two Main Flows

**Flow 1 - Feed Publishing (Write Path):**
```
User creates post
  -> API Gateway
    -> Post Service (validate, store in DB)
      -> Kafka (fan-out topic)
        -> Fan-out Service (write post_id to followers' feed caches)
        -> Notification Service (push notifications)
        -> Search Indexer (index for search)
```

**Flow 2 - Feed Reading (Read Path):**
```
User opens app / scrolls feed
  -> API Gateway
    -> Feed Service
      -> Check feed cache (Redis)
        -> If HIT:  return cached feed entries
        -> If MISS: query followers' posts, rank, cache, return
      -> Hydrate post_ids with full post data
      -> Merge celebrity posts on-the-fly (hybrid model)
      -> Return ranked, paginated feed
```

---

## 5. Feed Publishing Deep Dive

The core design decision in any feed system is the **fan-out strategy**: when and how
do we distribute a new post to the feeds of all followers?

### 5.1 Fan-out on Write (Push Model)

When a user publishes a post, immediately push the post_id into the feed cache of
every follower.

```
               User A publishes post P
                       │
                       ▼
              ┌─────────────────┐
              │  Post Service   │
              │  (store post)   │
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │  Fan-out Worker │
              │  (async via     │
              │   Kafka)        │
              └────────┬────────┘
                       │
          ┌────────────┼────────────┐
          │            │            │
          ▼            ▼            ▼
   ┌────────────┐ ┌────────────┐ ┌────────────┐
   │feed:userB  │ │feed:userC  │ │feed:userD  │
   │ + post P   │ │ + post P   │ │ + post P   │
   │(Redis ZADD)│ │(Redis ZADD)│ │(Redis ZADD)│
   └────────────┘ └────────────┘ └────────────┘
        ...for all N followers of User A
```

**Steps:**
1. Post Service validates and stores the post in the Posts DB.
2. Post Service publishes an event to Kafka: `{ post_id, author_id }`.
3. Fan-out workers consume the event.
4. For each follower of the author, execute `ZADD feed:{follower_id} <timestamp> <post_id>`.
5. Trim each feed to the latest 800 entries: `ZREMRANGEBYRANK feed:{follower_id} 0 -801`.

### 5.2 Fan-out on Read (Pull Model)

Do nothing at publish time. When a user opens their feed, query the posts of
everyone they follow in real time.

```
               User B requests feed
                       │
                       ▼
              ┌─────────────────┐
              │  Feed Service   │
              └────────┬────────┘
                       │
           ┌───────────┼───────────┐
           │           │           │
           ▼           ▼           ▼
    ┌────────────┐ ┌────────────┐ ┌────────────┐
    │ Posts by   │ │ Posts by   │ │ Posts by   │
    │ User A     │ │ User C     │ │ User D     │
    │ (query DB) │ │ (query DB) │ │ (query DB) │
    └─────┬──────┘ └─────┬──────┘ └─────┬──────┘
          │              │              │
          └──────────────┼──────────────┘
                         │
                         ▼
                ┌─────────────────┐
                │   Merge + Rank  │
                │   + Paginate    │
                └─────────────────┘
                         │
                         ▼
                   Return feed
```

**Steps:**
1. Feed Service looks up who User B follows (from follows table or cache).
2. For each followee, fetch their latest N posts.
3. Merge all posts, rank by score, and return the top page.

### 5.3 Hybrid Approach (Recommended)

Use **fan-out on write** for normal users and **fan-out on read** for celebrities.

```
                User publishes post
                        │
                        ▼
                ┌───────────────┐
                │ Post Service  │
                └───────┬───────┘
                        │
                        ��
               ┌─────────────────┐
               │ Is author a     │
               │ celebrity?      │
               │ (>500K followers)│
               └──┬───────────┬──┘
                  │           │
              NO  │           │  YES
                  ▼           ▼
         ┌──────────────┐  ┌──────────────────┐
         │ Fan-out on   │  │ Store post only.  │
         │ Write to all │  │ Do NOT fan-out.   │
         │ followers'   │  │ Post will be      │
         │ feed caches  │  │ merged at read    │
         └──────────────┘  │ time.             │
                           └──────────────────┘

                    --- AT READ TIME ---

         ┌──────────────────────────────────┐
         │ Feed Service reads user's feed   │
         │                                  │
         │ 1. Get pre-computed feed (cache) │
         │ 2. Get list of celebrities user  │
         │    follows                       │
         │ 3. Fetch latest posts from each  │
         │    celebrity                     │
         │ 4. Merge + Re-rank              │
         │ 5. Return paginated result       │
         └──────────────────────────────────┘
```

### 5.4 Strategy Comparison

| Aspect              | Fan-out on Write (Push)       | Fan-out on Read (Pull)       | Hybrid                         |
| ------------------- | ----------------------------- | ---------------------------- | ------------------------------ |
| Write latency       | High (fan to all followers)   | Low (just store post)        | Medium                         |
| Read latency        | Low (pre-computed)            | High (compute on read)       | Low (mostly pre-computed)      |
| Celebrity problem   | Severe (millions of writes)   | None                         | Solved (pull for celebrities)  |
| Storage cost        | High (duplicate post_ids)     | Low                          | Medium                         |
| Freshness           | Near real-time                | Always fresh                 | Near real-time                 |
| Inactive users      | Wasted writes                 | No waste                     | Optimized (TTL on cache)       |
| Complexity          | Simple                        | Simple                       | More complex                   |
| Best for            | Small-medium users            | Systems with many celebrities| Production systems at scale    |

### 5.5 Fan-out Write Volume Calculation

```
For a normal user with 300 followers:
  1 post -> 300 Redis ZADD operations
  Time: ~300 * 0.1ms = 30ms (pipelined, much less)

For a celebrity with 10M followers:
  1 post -> 10,000,000 Redis ZADD operations
  Time: ~10M * 0.1ms = 1,000 seconds (unacceptable!)

  With hybrid: 0 fan-out writes. Merged at read time for each reader.
  Read-time cost: ~5-10 celebrity post fetches, ~2ms each = 10-20ms additional
```

---

## 6. Feed Ranking

### 6.1 Chronological vs Algorithmic

| Approach       | Pros                               | Cons                              |
| -------------- | ---------------------------------- | --------------------------------- |
| Chronological  | Simple, transparent, real-time     | Low engagement, spam dominates    |
| Algorithmic    | Higher engagement, personalized    | Complex, "filter bubble" risk     |

Most modern feeds use **algorithmic ranking** with an option to switch to chronological.

### 6.2 Simple Ranking Formula

A basic scoring function that works well for interviews:

```
Score = Affinity * TimeDecay * PostTypeWeight * QualityScore

Where:
  Affinity      = measure of how much the reader interacts with the author
  TimeDecay     = 1 / (1 + age_hours * decay_rate)
  PostTypeWeight = weight based on post type (image > text, video > image)
  QualityScore  = engagement signals normalized
```

**Affinity Score Calculation:**

```
Affinity(reader, author) =
    w1 * like_frequency        // how often reader likes author's posts
  + w2 * comment_frequency     // how often reader comments on author's posts
  + w3 * profile_view_freq     // how often reader views author's profile
  + w4 * message_frequency     // how often they message each other
  + w5 * recency_of_follow     // recently followed = higher affinity

Typical weights: w1=0.3, w2=0.3, w3=0.15, w4=0.15, w5=0.10
```

**Time Decay Function:**

```
TimeDecay(age_hours) = 1 / (1 + 0.1 * age_hours)

Examples:
  0 hours old:  1.0
  1 hour old:   0.91
  6 hours old:  0.63
  24 hours old: 0.29
  72 hours old: 0.12
```

**Post Type Weights:**

```
video_with_engagement:  1.5
image_post:             1.3
link_with_preview:      1.1
text_post:              1.0
reshare:                0.8
```

**Quality Score:**

```
QualityScore = normalize(
    likes * 1.0
  + comments * 3.0        // comments are higher signal
  + shares * 5.0          // shares are highest signal
  - hides * -10.0         // negative signal
  - reports * -50.0       // strong negative signal
)
```

### 6.3 ML-Based Ranking Pipeline

For a production system, ranking is a multi-stage ML pipeline:

```
    All candidate posts (~2000)
              │
              ▼
    ┌──────────────────┐
    │  Stage 1:        │   Lightweight model, reduces to ~500 candidates
    │  Candidate       │   Features: author affinity, post age, post type
    │  Filtering       │
    └────────┬─────────┘
             │
             ▼
    ┌──────────────────┐
    │  Stage 2:        │   Medium model, scores each candidate
    │  Coarse Ranking  │   Features: engagement prediction, content quality
    │  (Score ~500)    │
    └────────┬─────────┘
             │
             ▼
    ┌──────────────────┐
    │  Stage 3:        │   Heavy model (deep neural network)
    │  Fine Ranking    │   Features: full feature set, cross-features
    │  (Rank top ~100) │   Output: P(like), P(comment), P(share), P(click)
    └────────┬─────────┘
             │
             ▼
    ┌──────────────────┐
    │  Stage 4:        │   Business rules, diversity injection
    │  Re-ranking /    │   - No more than 2 posts from same author
    │  Policy Layer    │   - Insert ads at positions 3, 8, 15...
    └────────┬─────────┘   - Boost new content types
             │             - Demote clickbait
             ▼
      Final ranked feed
        (return top 20)
```

**Feature Categories for ML Model:**

| Category          | Features                                                        |
| ----------------- | --------------------------------------------------------------- |
| User features     | Age, location, device, session count, active hours              |
| Author features   | Follower count, post frequency, avg engagement rate             |
| Post features     | Age, type, length, has_media, has_link, language                |
| Interaction       | Affinity score, last interaction time, mutual friends           |
| Context           | Time of day, day of week, user's recent activity                |
| Engagement (label)| Did user like/comment/share/click/spend >5s reading?           |

---

## 7. Feed Reading Deep Dive

### 7.1 Read Path Flow

```
    User opens app
         │
         ▼
  ┌──────────────┐
  │ API Gateway  │
  └──────┬───────┘
         │
         ▼
  ┌──────────────┐     ┌────────────────────┐
  │ Feed Service │────>│ Feed Cache (Redis)  │
  └──────┬───────┘     └─────────┬──────────┘
         │                       │
         │    ┌──────────────────┘
         │    │
         ▼    ▼
  ┌─────────────────────────────────────┐
  │         Cache HIT?                  │
  │                                     │
  │  YES:                               │
  │    1. Read post_ids from sorted set │
  │    2. Fetch celebrity posts         │
  │    3. Merge and re-rank             │
  │                                     │
  │  NO (cache miss):                   │
  │    1. Query follows table           │
  │    2. For each followee:            │
  │       fetch latest 50 posts         │
  │    3. Merge all posts               │
  │    4. Rank with scoring function    │
  │    5. Cache top 800 post_ids        │
  │    6. Set TTL = 7 days              │
  └─────────────┬───────────────────────┘
                │
                ▼
  ┌──────────────────────────────┐
  │  Hydrate post_ids            │
  │  (batch fetch from Post DB   │
  │   or post cache)             │
  │                              │
  │  post_ids -> full post       │
  │  objects with author info,   │
  │  media URLs, engagement      │
  │  counts, liked_by_me flag    │
  └──────────────┬───────────────┘
                 │
                 ▼
  ┌──────────────────────────────┐
  │  Return paginated response   │
  │  with next_cursor            │
  └──────────────────────────────┘
```

### 7.2 Feed Cache Structure (Redis Detail)

```
# Per-user feed cache (Sorted Set)
Key:     feed:{user_id}
Score:   ranking_score (or timestamp for chronological)
Member:  post_id

# Operations:
ZADD     feed:u123 1705312200 "post_abc"      # Add post to feed
ZREVRANGE feed:u123 0 19                       # Get top 20 posts
ZREVRANGEBYSCORE feed:u123 <cursor_score> -inf LIMIT 0 20  # Cursor pagination
ZCARD    feed:u123                             # Feed size
ZREMRANGEBYRANK feed:u123 0 -801               # Keep only top 800

# Per-user celebrity following list (Set)
Key:     celeb_following:{user_id}
Members: celebrity user_ids

SMEMBERS celeb_following:u123                  # Get celebrities user follows

# Post cache (Hash)
Key:     post:{post_id}
Fields:  author_id, content, media, like_count, comment_count, created_at

HGETALL post:post_abc                          # Get full post data
```

### 7.3 Cursor-Based Pagination Implementation

```
Page 1 request:
  GET /v1/feed?limit=20

  Server:
    ZREVRANGEBYSCORE feed:u123 +inf -inf LIMIT 0 21   # fetch 21 to check has_more
    last_item_score = items[19].score
    last_item_id = items[19].post_id
    next_cursor = base64({ "s": last_item_score, "id": last_item_id })
    has_more = (len(items) == 21)
    return items[0:20], next_cursor, has_more

Page 2 request:
  GET /v1/feed?cursor=eyJzIjoxNzA1MzEyMjAwLCJpZCI6InBvc3RfYWJjIn0=&limit=20

  Server:
    decoded = decode(cursor)  # { "s": 1705312200, "id": "post_abc" }
    # Use composite key to avoid ties
    ZREVRANGEBYSCORE feed:u123 (1705312200 -inf LIMIT 0 21
    # If scores tie, filter by post_id < cursor.id
    ...
```

### 7.4 Feed Hydration

Post IDs stored in the feed cache are lightweight. We need to "hydrate" them into
full post objects. This is done via a batch multi-get:

```
Input:  [post_id_1, post_id_2, ..., post_id_20]

Step 1: Check post cache (Redis MGET)
  MGET post:id_1 post:id_2 ... post:id_20
  -> Returns cached posts + cache misses

Step 2: For cache misses, batch query Posts DB
  SELECT * FROM posts WHERE post_id IN (miss_1, miss_2, ...)
  -> Backfill into post cache

Step 3: Batch fetch author info
  MGET user:author_1 user:author_2 ...
  -> Same miss-and-fill pattern

Step 4: Check if current user liked each post
  Pipeline: SISMEMBER likes:post_id_1 current_user_id
            SISMEMBER likes:post_id_2 current_user_id
            ...

Step 5: Assemble full response objects
```

---

## 8. Celebrity / Hot User Problem

### 8.1 The Problem

Consider a celebrity with 50 million followers who posts 10 times per day:

```
Fan-out writes per post:  50,000,000
Fan-out writes per day:   500,000,000
Time per post fan-out:    50M * 0.1ms / pipeline = ~50 seconds

During those 50 seconds:
  - Redis cluster under heavy write load
  - Followers' feeds are partially updated (inconsistency)
  - Other fan-out operations are queued and delayed
  - System-wide feed freshness degrades
```

### 8.2 Hybrid Solution Detail

```
┌───────────────────────────────────────────────────────┐
│                Celebrity Classification                │
│                                                       │
│  Threshold: follower_count > 500,000                  │
│  Updated: batch job runs daily, also on follow events │
│  Storage: is_celebrity flag on users table + cache     │
│                                                       │
│  ~0.1% of users are celebrities = ~300K users         │
│  These 300K produce ~20% of all content consumed      │
└───────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────┐
│            At Post Time (for celebrity)                │
│                                                       │
│  1. Store post in Posts DB           (same as always) │
│  2. Add to celebrity's post timeline (Redis list)     │
│     LPUSH celeb_posts:{author_id} post_id             │
│     LTRIM celeb_posts:{author_id} 0 99                │
│  3. Do NOT fan-out to followers                       │
│  4. Optionally notify "super fans" only               │
└───────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────┐
│          At Read Time (merging celebrity posts)        │
│                                                       │
│  1. Read pre-computed feed from cache (normal posts)  │
│  2. Get list of celebrities user follows:             │
│     SMEMBERS celeb_following:{user_id}                │
│  3. For each celebrity (typically 5-20 per user):     │
│     LRANGE celeb_posts:{celeb_id} 0 9                 │
│     (fetch latest 10 posts from each celebrity)       │
│  4. Merge celebrity posts into the feed               │
│  5. Re-rank the merged set                            │
│  6. Return top N                                      │
│                                                       │
│  Additional read latency: ~5-20ms (acceptable)        │
└───────────────────────────────────────────────────────┘
```

### 8.3 Optimization: Celebrity Post Cache

```
# Pre-computed "trending celebrity posts" cache
# Updated every 30 seconds by a background worker

Key:    trending_celeb_posts
Type:   Sorted Set
Score:  engagement_velocity (likes_per_minute * comment_weight)
Member: post_id

# Users who follow many celebrities get this as a supplement
# Reduces per-celebrity lookups to a single sorted set read
```

---

## 9. Caching Strategy

### 9.1 Multi-Level Cache Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    CACHE HIERARCHY                        │
│                                                          │
│  Level 1: CDN Cache (edge)                               │
│  ┌─────────────────────────────────────────────┐         │
│  │ - Static media (images, videos, thumbnails)  │         │
│  │ - Profile pictures                           │         │
│  │ - TTL: hours to days                         │         │
│  │ - Hit rate: 80-90% for media                 │         │
│  └─────────────────────────────────────────────┘         │
│                         │ MISS                           │
│                         ▼                                │
│  Level 2: Application Cache (in-process)                 │
│  ┌─────────────────────────────────────────────┐         │
│  │ - Hot user profiles (LRU, 100K entries)      │         │
│  │ - Feature flags, config                      │         │
│  │ - TTL: 30-60 seconds                         │         │
│  │ - Hit rate: 70-80%                           │         │
│  └─────────────────────────────────────────────┘         │
│                         │ MISS                           │
│                         ▼                                │
│  Level 3: Feed Cache (Redis cluster)                     │
│  ┌─────────────────────────────────────────────┐         │
│  │ - Per-user feed sorted sets                  │         │
│  │ - Post data hashes                           │         │
│  │ - Celebrity post lists                       │         │
│  │ - User relationship caches                   │         │
│  │ - TTL: 7 days (feed), 1 hour (posts)         │         │
│  │ - Hit rate: 95%+ for active users            │         │
│  └─────────────────────────────────────────────┘         │
│                         │ MISS                           │
│                         ▼                                │
│  Level 4: Database (PostgreSQL + read replicas)          │
│  ┌─────────────────────────────────────────────┐         │
│  │ - Source of truth                            │         │
│  │ - Read replicas for feed generation queries  │         │
│  │ - Connection pooling (PgBouncer)             │         │
│  └─────────────────────────────────────────────┘         │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 9.2 Cache Invalidation Strategies

```
Event: New post published
  -> Fan-out service adds post_id to followers' feed caches (ZADD)
  -> No invalidation needed (additive operation)

Event: Post deleted
  -> Remove from author's post cache: DEL post:{post_id}
  -> Async: remove from all feed caches that contain it
     (or let it expire, and filter at read time if post is missing)

Event: Post edited
  -> Update post cache: HSET post:{post_id} content "new content"
  -> Feed caches only store post_id, so no feed invalidation needed

Event: User unfollows author
  -> Remove author's posts from follower's feed cache (expensive)
  -> Alternative: filter at read time (check follows table before returning)
  -> Lazy approach: let posts age out of the 800-entry window naturally

Event: User profile updated
  -> Invalidate user cache: DEL user:{user_id}
  -> CDN purge if avatar changed
```

### 9.3 Cache Warming

```
Active user detection:
  - Users who open the app at least once in the last 24 hours
  - ~60% of DAU = ~180M users

Cache warming strategy:
  ┌─────────────────────────────────────────┐
  │  Background Worker (runs continuously)   │
  │                                          │
  │  1. Consume new post events from Kafka   │
  │  2. For active followers:                │
  │     -> Immediate fan-out (high priority) │
  │  3. For inactive followers:              │
  │     -> Skip fan-out (save resources)     │
  │     -> Warm their cache on next login    │
  │                                          │
  │  On user login (if cache is cold):       │
  │  1. Fetch following list                 │
  │  2. Parallel fetch latest posts          │
  │  3. Rank and cache                       │
  │  4. Time: ~200-500ms (acceptable for     │
  │     first load after long absence)       │
  └─────────────────────────────────────────┘
```

---

## 10. Scaling

### 10.1 Database Sharding

```
┌────────────────────────────────────────────────────────┐
│                  SHARDING STRATEGY                       │
│                                                         │
│  Posts DB: Shard by author_id                           │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐      │
│  │ Shard 0 │ │ Shard 1 │ │ Shard 2 │ │ Shard 3 │      │
│  │users    │ │users    │ │users    │ │users    │      │
│  │0-74M    │ │75-149M  │ │150-224M │ │225-300M │      │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘      │
│  Shard key: hash(author_id) % num_shards               │
│  Benefit: all posts by one user on same shard           │
│  Drawback: cross-shard queries for feed generation      │
│                                                         │
│  Follows DB: Shard by follower_id                       │
│  Benefit: "who do I follow?" is single-shard query      │
│  Drawback: "who follows me?" requires scatter-gather    │
│  Solution: maintain both directions, double-write       │
│                                                         │
│  Feed Cache (Redis): Shard by user_id                   │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐      │
│  │Redis    │ │Redis    │ │Redis    │ │Redis    │      │
│  │Cluster 0│ │Cluster 1│ │Cluster 2│ │Cluster 3│      │
│  │(384 GB) │ │(384 GB) │ │(384 GB) │ │(384 GB) │      │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘      │
│  Total: ~1.5TB Redis across 4 clusters                  │
│  Each cluster: 3 masters + 3 replicas                   │
│  Shard key: hash(user_id) % 16384 (Redis hash slots)   │
└────────────────────────────────────────────────────────┘
```

### 10.2 Message Queue Architecture (Kafka)

```
┌───────────────────────────────────────────────────────┐
│                  KAFKA TOPOLOGY                        │
│                                                       │
│  Topic: post-events                                   │
│  Partitions: 128                                      │
│  Partition key: author_id                             │
│  Retention: 7 days                                    │
│  Consumers: Fan-out workers (128 instances)           │
│                                                       │
│  Topic: fanout-tasks                                  │
│  Partitions: 256                                      │
│  Partition key: target_user_id                        │
│  Purpose: Individual fan-out operations               │
│  Consumers: Feed-write workers (256 instances)        │
│                                                       │
│  Topic: notifications                                 │
│  Partitions: 64                                       │
│  Partition key: target_user_id                        │
│  Consumers: Notification workers (64 instances)       │
│                                                       │
│  Flow:                                                │
│  post-events -> Fan-out Service -> fanout-tasks       │
│                                 -> notifications      │
│                                 -> search-indexing    │
│                                 -> analytics          │
└───────────────────────────────────────────────────────┘
```

**Why partition by target_user_id for fan-out:**
- All writes to the same user's feed go through the same partition
- Prevents race conditions on a single user's feed cache
- Enables ordered processing per user

### 10.3 Read Replicas

```
┌───────────────────────────────────────────────────┐
│              READ REPLICA TOPOLOGY                  │
│                                                    │
│           ┌─────────────┐                          │
│           │   Primary   │  (Writes only)           │
│           │  PostgreSQL │                          │
│           └──┬──┬──┬────┘                          │
│     Streaming│  │  │Replication                    │
│              │  │  │                               │
│     ┌────────▼┐ │ ┌▼────────┐                     │
│     │Replica 1│ │ │Replica 3│  (Feed generation)  │
│     │(Region A)│ │ │(Region B)│                    │
│     └─────────┘ │ └─────────┘                     │
│            ┌────▼────┐                             │
│            │Replica 2│  (Analytics/Search)         │
│            │(Region A)│                            │
│            └─────────┘                             │
│                                                    │
│  Replication lag: < 100ms (acceptable for          │
│  eventually consistent feed)                       │
│                                                    │
│  Read ratio: ~95% reads, ~5% writes                │
│  3 replicas handle ~3x the read throughput         │
└───────────────────────────────────────────────────┘
```

### 10.4 CDN for Media

```
Media upload flow:
  Client -> Pre-signed S3 URL -> Upload to S3
  S3 event -> Media Processing Lambda:
    - Generate thumbnails (150x150, 300x300, 600x600)
    - Transcode video (360p, 720p, 1080p)
    - Extract metadata
    - Update media status to "ready"
  CloudFront CDN serves processed media globally

CDN configuration:
  - Origin: S3 buckets (regional)
  - Edge locations: 200+ globally
  - Cache policy: immutable content (hash-based filenames)
  - TTL: 1 year (content-addressed storage)
  - Invalidation: not needed (new media = new URL)
```

---

## 11. Deployment Architecture

### 11.1 Multi-Region Deployment

```
┌─────────────────────────────────────────────────────────────────┐
│                    MULTI-REGION DEPLOYMENT                        │
│                                                                  │
│   ┌──────────────── US-EAST-1 ───────────────────┐              │
│   │                                               │              │
│   │  ┌───────────┐  ┌───────────┐  ┌───────────┐ │              │
│   │  │ API GW +  │  │ Feed      │  │ Fan-out   │ │              │
│   │  │ Web Svrs  │  │ Service   │  │ Workers   │ │              │
│   │  │ (ECS x20) │  │ (ECS x10) │  │ (ECS x50)│ │              │
│   │  └───────────┘  └───────────┘  └───────────┘ │              │
│   │                                               │              │
│   │  ┌───────────┐  ┌───────────┐  ┌───────────┐ │              │
│   │  │ Redis     │  │PostgreSQL │  │  Kafka    │ │              │
│   │  │ Cluster   │  │ Primary   │  │  Cluster  │ │              │
│   │  │ (384GB)   │  │ + 2 Read  │  │ (128 part)│ │              │
│   │  └───────────┘  └───────────┘  └───────────┘ │              │
│   │                                               │              │
│   └───────────────────────┬───────────────────────┘              │
│                           │                                      │
│              Cross-region │ replication                           │
│                           │                                      │
│   ┌──────────────── EU-WEST-1 ───────────────────┐              │
│   │                                               │              │
│   │  ┌───────────┐  ┌───────────┐  ┌───────────┐ │              │
│   │  │ API GW +  │  │ Feed      │  │ Fan-out   │ │              │
│   │  │ Web Svrs  │  │ Service   │  │ Workers   │ │              │
│   │  │ (ECS x15) │  │ (ECS x8)  │  │ (ECS x30)│ │              │
│   │  └───────────┘  └───────────┘  └───────────┘ │              │
│   │                                               │              │
│   │  ┌───────────┐  ┌───────────┐  ┌───────────┐ │              │
│   │  │ Redis     │  │PostgreSQL │  │  Kafka    │ │              │
│   │  │ Cluster   │  │ Read      │  │  Cluster  │ │              │
│   │  │ (256GB)   │  │ Replicas  │  │ (Mirror)  │ │              │
│   │  └───────────┘  └───────────┘  └───────────┘ │              │
│   │                                               │              │
│   └───────────────────────┬───────────────────────┘              │
│                           │                                      │
│              Cross-region │ replication                           │
│                           │                                      │
│   ┌──────────────── AP-SOUTHEAST-1 ──────────────┐              │
│   │                                               │              │
│   │  ┌───────────┐  ┌───────────┐  ┌───────────┐ │              │
│   │  │ API GW +  │  │ Feed      │  │ Fan-out   │ │              │
│   │  │ Web Svrs  │  │ Service   │  │ Workers   │ │              │
│   │  │ (ECS x15) │  │ (ECS x8)  │  │ (ECS x30)│ │              │
│   │  └───────────┘  └───────────┘  └───────────┘ │              │
│   │                                               │              │
│   │  ┌───────────┐  ┌───────────┐  ┌───────────┐ │              │
│   │  │ Redis     │  │PostgreSQL │  │  Kafka    │ │              │
│   │  │ Cluster   │  │ Read      │  │  Cluster  │ │              │
│   │  │ (256GB)   │  │ Replicas  │  │ (Mirror)  │ │              │
│   │  └───────────┘  └───────────┘  └───────────┘ │              │
│   │                                               │              │
│   └───────────────────────────────────────────────┘              │
│                                                                  │
│   ┌──────────────────── GLOBAL ──────────────────┐              │
│   │                                               │              │
│   │  ┌──────────────────────────────────────┐     │              │
│   │  │  CloudFront CDN (200+ edge locations) │     │              │
│   │  └──────────────────────────────────────┘     │              │
│   │  ┌──────────────────────────────────────┐     │              │
│   │  │  Route53 (latency-based routing)      │     │              │
│   │  └──────────────────────────────────────┘     │              │
│   │  ┌──────────────────────────────────────┐     │              │
│   │  │  S3 (cross-region replicated media)   │     │              │
│   │  └──────────────────────────────────────┘     │              │
│   │                                               │              │
│   └───────────────────────────────────────────────┘              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 11.2 Cross-Region Consistency Challenges

| Challenge                 | Solution                                                     |
| ------------------------- | ------------------------------------------------------------ |
| User posts in US, follower reads in EU | Async replication with <500ms lag; acceptable for feeds |
| User profile update       | Write to primary (US-EAST), replicate to all regions         |
| Follow/Unfollow           | Write to primary, async fan-out adjustment in all regions    |
| Feed cache inconsistency  | Each region maintains its own feed cache, populated locally  |
| Celebrity post propagation| Publish to all regional Kafka clusters via MirrorMaker       |
| Conflict resolution       | Last-writer-wins with vector clocks for edge cases           |

**Consistency model:**
- Posts: written to primary region, replicated within ~200-500ms
- Feed cache: eventually consistent, built per-region from local replicas
- User profiles: read-your-own-writes guaranteed via sticky sessions to primary
- Follow graph: eventually consistent (brief delay in feed updates on follow)

---

## 12. Common Interview Follow-ups

### 12.1 How to Handle Real-Time Feed Updates?

```
Option A: Long Polling
  - Client polls every 30 seconds: GET /v1/feed/updates?since=<timestamp>
  - Server holds connection open until new posts are available or timeout
  - Simple, works behind proxies
  - Latency: 0-30 seconds

Option B: Server-Sent Events (SSE)
  - Client opens persistent connection: GET /v1/feed/stream
  - Server pushes new post notifications
  - Unidirectional, lightweight
  - Good for web clients

Option C: WebSockets
  - Bidirectional persistent connection
  - Server pushes feed updates in real time
  - Higher resource cost (persistent connections)
  - Best for chat-like experiences

Recommended: SSE for feed updates
  ┌────────┐        ┌────────────┐        ┌───────────┐
  │ Client │<──SSE──│ Feed Push  │<──Sub──│  Redis     │
  │        │        │ Service    │        │  Pub/Sub   │
  └────────┘        └────────────┘        └───────────┘
                                               ▲
                                               │ Publish
                                          ┌────┴──────┐
                                          │ Fan-out   │
                                          │ Service   │
                                          └───────────┘

  Flow:
  1. Fan-out service publishes to Redis Pub/Sub channel: user:{user_id}:feed
  2. Feed Push Service subscribes to channels for connected users
  3. On new message, push SSE event to client
  4. Client receives and prepends to feed UI

  Scale consideration:
  - Not all users need real-time (~10% are actively viewing feed)
  - Use presence detection to only maintain connections for active users
  - Connection limit: ~1M concurrent SSE connections per server (with tuning)
  - For 30M concurrent users: 30 Feed Push servers
```

### 12.2 How to Implement Trending Topics?

```
Architecture:
  ┌───────────────┐     ┌────────────────┐     ┌──────────────┐
  │  Post Stream   │────>│ Topic Extractor │────>│ Trending     │
  │  (Kafka)       │     │ (NLP Service)   │     │ Aggregator   │
  └───────────────┘     └────────────────┘     └──────┬───────┘
                                                      │
                                                      ▼
                                               ┌──────────────┐
                                               │ Trending     │
                                               │ Cache (Redis)│
                                               └──────────────┘

  Topic Extraction:
  - Hashtag extraction (explicit signals)
  - Named Entity Recognition (implicit signals)
  - N-gram frequency analysis

  Trending Score:
  TrendingScore = (mentions_last_hour - mentions_baseline) / mentions_baseline
                  * geographic_weight * freshness_decay

  Time windows:
  - Sliding window: 1 hour, 6 hours, 24 hours
  - Compare against baseline for same day-of-week and hour
  - Spike detection: current rate > 3x baseline = trending

  Personalization:
  - Global trending: top topics across all users
  - Regional trending: top topics filtered by user's location
  - Personal trending: topics weighted by user's interests
```

### 12.3 How to Filter Inappropriate Content?

```
Multi-layer content moderation pipeline:

  ┌───────────┐
  │ User Post │
  └─────┬─────┘
        │
        ▼
  ┌───────────────┐
  │ Layer 1:      │  Keyword blocklist, regex patterns
  │ Rule-based    │  Latency: <5ms, catches obvious violations
  │ Filter        │  Action: block immediately
  └───────┬───────┘
          │ PASS
          ▼
  ┌───────────────┐
  │ Layer 2:      │  Pre-trained ML classifier
  │ ML Classifier │  Categories: spam, hate speech, nudity, violence
  │ (real-time)   │  Latency: <50ms, confidence threshold: 0.9
  └───────┬───────┘  Action: block if confidence > 0.9, queue for review if 0.5-0.9
          │ PASS
          ▼
  ┌───────────────┐
  │ Layer 3:      │  Image/video analysis
  │ Media         │  NSFW detection, OCR on images for hidden text
  │ Analysis      │  Latency: <200ms (async, media shown after clearing)
  └───────┬───────┘
          │ PASS
          ▼
  ┌───────────────┐
  │ Layer 4:      │  Sampled review of borderline cases
  │ Human Review  │  Queue prioritized by reach * severity score
  │ (async)       │  SLA: 24 hours for review
  └───────────────┘

  Feed-time filtering:
  - Each post has a moderation_status: { clean, pending_review, removed }
  - Feed service filters out removed posts
  - Pending posts shown with reduced distribution (shadow reduction)
```

### 12.4 How to Handle Feed for New Users (Cold Start)?

```
Problem: New user has no follows, no interaction history, empty feed.

Solution layers:

  1. Onboarding Interest Selection
     - During signup, ask user to select 5+ topics of interest
     - Map topics to curated "seed" accounts
     - Auto-follow seed accounts (with user consent)

  2. Popular/Trending Content
     - Show global trending posts for the user's region
     - Mix in editorially curated "best of" content
     - Weighted by topic diversity

  3. Collaborative Filtering
     - "Users like you also follow..." recommendations
     - Based on demographics, signup source, device type
     - Updated in batch daily

  4. Progressive Personalization
     - Track every interaction (view, like, click, dwell time)
     - After 10+ interactions, start blending personalized content
     - After 50+ interactions, transition to full algorithmic feed

  Feed composition for new users:
  ┌─────────────────────────────────────────┐
  │  Day 1:  80% trending + 20% seed follows │
  │  Day 3:  50% trending + 30% follows +   │
  │          20% collaborative filtering      │
  │  Day 7:  30% trending + 50% follows +   │
  │          20% personalized                 │
  │  Day 14: 10% trending + 60% follows +   │
  │          30% personalized (full algo)     │
  └─────────────────────────────────────────┘
```

### 12.5 How to Add Ads into the Feed?

```
Ad injection happens at the re-ranking / policy layer (Stage 4 of ranking pipeline):

  ┌──────────────────────────────────────────────────┐
  │              AD INJECTION PIPELINE                │
  │                                                   │
  │  Input: Ranked organic feed (20 posts)            │
  │                                                   │
  │  Step 1: Determine ad slots                       │
  │    - Position 3, 8, 15 (every ~5 organic posts)  │
  │    - Max 3 ads per page of 20                     │
  │    - Respect frequency cap per advertiser          │
  │                                                   │
  │  Step 2: Ad Selection (from Ad Service)           │
  │    - Auction: eligible ads bid for each slot      │
  │    - Targeting: demographics, interests, behavior │
  │    - Budget check: advertiser has remaining budget│
  │    - Relevance score: ad relevance to user        │
  │    - Final rank: bid * relevance * CTR_prediction │
  │                                                   │
  │  Step 3: Ad Quality Check                         │
  │    - Deduplication (no same ad twice in feed)     │
  │    - Brand safety (no competing brands adjacent)  │
  │    - User experience (no more than 1 video ad)    │
  │                                                   │
  │  Step 4: Insert ads at designated positions       │
  │    - Mark ad posts with is_ad: true               │
  │    - Include ad tracking pixel URLs               │
  │    - Log impression for billing                   │
  │                                                   │
  │  Output: Final feed (20 organic + 3 ads = 23)     │
  └──────────────────────────────────────────────────┘

  Ad serving latency budget: <50ms (runs in parallel with feed ranking)

  Architecture:
  ┌────────────┐     ┌──────────────┐     ┌───────────────┐
  │ Feed       │────>│ Ad Service   │────>│ Ad Selection  │
  │ Service    │     │ (request ads │     │ Engine        │
  │            │<────│  for slots)  │<────│ (auction)     │
  └────────────┘     └──────────────┘     └───────────────┘
```

---

## 13. Summary: Key Design Decisions

| Decision Point             | Our Choice                     | Rationale                              |
| -------------------------- | ------------------------------ | -------------------------------------- |
| Fan-out strategy           | Hybrid (push + pull)           | Handles celebrities without waste      |
| Feed storage               | Redis sorted sets              | Sub-millisecond reads, sorted by rank  |
| Pagination                 | Cursor-based                   | Stable under real-time insertions      |
| Ranking                    | Algorithmic (ML pipeline)      | Higher engagement than chronological   |
| Database for posts         | PostgreSQL (sharded)           | ACID, mature tooling, well understood  |
| Message queue              | Kafka                          | High throughput, durable, partitioned  |
| Cache invalidation         | Write-through + TTL            | Eventual consistency is acceptable     |
| Celebrity threshold        | 500K followers                 | Empirically balances cost vs freshness |
| Multi-region               | Active-passive per region      | Latency-optimized reads, central write |
| Real-time updates          | SSE                            | Lightweight, sufficient for feeds      |
| Content moderation         | Multi-layer (rules + ML + human)| Balance speed and accuracy            |

---

## 14. Scalability Numbers at a Glance

```
┌──────────────────────────────────────────────────────┐
│              SYSTEM CAPACITY SUMMARY                  │
│                                                      │
│  DAU:                  300,000,000                    │
│  Feed read QPS:        ~35,000 (avg) / 100K (peak)   │
│  Post write QPS:       ~1,750 (avg) / 5K (peak)      │
│  Fan-out write QPS:    ~520,000 (avg)                 │
│                                                      │
│  Redis cluster:        ~1.5TB total                   │
│  PostgreSQL:           ~55TB/year (text)              │
│  Media storage:        ~22PB/year                     │
│                                                      │
│  Feed latency (p99):   <500ms                        │
│  Fan-out latency:      <5s for normal users          │
│  Celebrity post merge:  <20ms additional at read     │
│                                                      │
│  Servers (estimated):                                │
│    API / Web:          50 instances                   │
│    Feed Service:       30 instances                   │
│    Fan-out Workers:    100+ instances                 │
│    Redis nodes:        24 (4 clusters x 6 nodes)     │
│    PostgreSQL:         12 (4 primary + 8 replicas)    │
│    Kafka brokers:      20                            │
│    Media processing:   30 (auto-scaled)              │
│    CDN edge nodes:     200+ (managed by provider)    │
└──────────────────────────────────────────────────────┘
```

---

## 15. Interview Tips

1. **Start with requirements.** Clarify the scope before diving into design. Ask about
   scale, consistency needs, and which features are in scope.

2. **Identify the core problem.** The news feed problem is fundamentally about the
   **fan-out strategy**. Make sure to discuss push vs pull vs hybrid early.

3. **Do the math.** Back-of-envelope calculations show why fan-out on write breaks for
   celebrities (50M writes per post) and why you need the hybrid approach.

4. **Discuss trade-offs explicitly.** Every design choice has trade-offs. Call them out:
   consistency vs availability, storage vs compute, latency vs freshness.

5. **Draw clear diagrams.** Separate the write path (publishing) from the read path
   (feed retrieval). This makes the architecture easier to reason about.

6. **Layer your caching.** CDN -> application -> Redis -> DB. Explain hit rates and
   invalidation strategy at each level.

7. **Address the celebrity problem proactively.** Interviewers love to probe this.
   Have the hybrid solution ready with concrete numbers.

8. **End with monitoring.** Mention key metrics: feed latency p99, fan-out lag,
   cache hit rates, error rates. Show you think about production systems.
