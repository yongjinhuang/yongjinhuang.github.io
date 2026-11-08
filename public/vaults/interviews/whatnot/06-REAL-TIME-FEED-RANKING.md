# Design: Real-Time Feed Ranking & Discovery

> Whatnot's unique challenge: livestreams are **ephemeral content** — you can't recommend yesterday's streams to today's users. The ranking system must work in real-time.

## Problem Statement

Design a feed ranking system that surfaces the most relevant live streams to users in real-time, handling cold-start for new users and adapting to rapidly changing content.

---

## Step 1: Requirements

### Functional Requirements

- Home feed shows ranked list of currently live streams
- Personalized ranking based on user interests and behavior
- Support new users with no history (cold-start)
- Category-based browsing (sports cards, sneakers, beauty, etc.)
- "For You" algorithmic feed + "Following" chronological feed
- Search with autocomplete across live and upcoming streams

### Non-Functional Requirements

- **Latency**: Feed generation < 200ms (p99)
- **Freshness**: New streams appear in feed within 30 seconds of going live
- **Scale**: 20M+ users, thousands of concurrent streams
- **Personalization**: Different rankings for different users
- **Cold-start**: Usable recommendations for brand-new users

### Out of Scope

- Push notification triggers
- Seller analytics
- Ad ranking

---

## Step 2: High-Level Design

```mermaid
flowchart TD
    Client["Client (App)"] -->|"GET /feed"| FeedSvc
    subgraph FeedSvc["Feed Service"]
        Retrieval["Retrieval Stage"] --> Ranking["Ranking Stage"] --> Reranking["Re-ranking Stage"]
    end
    Retrieval --> Candidates["Candidate Sources<br/>- Live idx<br/>- Following<br/>- Category<br/>- Trending"]
    Ranking --> ML["ML Model (SageMaker)<br/>- Features<br/>- Embeddings<br/>- Scores"]
    Candidates --> FS[("Feature Store<br/>(Redis + Rockset)")]
    ML --> FS
```

---

## Step 3: Deep Dive

### Three-Stage Ranking Pipeline

```mermaid
flowchart LR
    S1["Stage 1: RETRIEVAL (Cheap, broad)<br/>Fetch ~1000 candidates<br/><br/>Sources:<br/>- Live stream index<br/>- Followed sellers<br/>- Trending streams<br/>- Category affinity<br/>- Collaborative filter"]
    S2["Stage 2: RANKING (ML model)<br/>Score &amp; rank top ~100<br/><br/>Features:<br/>- User-stream affinity<br/>- Category preference<br/>- Seller quality score<br/>- Stream engagement<br/>- Price range match<br/>- User &amp; stream embeddings"]
    S3["Stage 3: RE-RANKING (Business rules)<br/>Apply rules, return ~50<br/><br/>Rules:<br/>- Diversity (no 5 sports card streams in a row)<br/>- Seller boost (new sellers)<br/>- Geographic relevance<br/>- Dedup (same seller)<br/>- Business promotions"]
    S1 --> S2 --> S3
```

### Retrieval Sources

```mermaid
flowchart TD
    subgraph Sources["Retrieval Sources (~1000 Total Candidates)"]
        R1["1. FOLLOWING (~50-200 candidates)<br/>Highest recall for engaged users:<br/>SELECT * FROM live_streams WHERE seller_id IN (user's following list)"]
        R2["2. CATEGORY AFFINITY (~200-500 candidates)<br/>SELECT * FROM live_streams WHERE category IN (user's top 5 categories)<br/>ORDER BY engagement_score DESC"]
        R3["3. COLLABORATIVE FILTERING (~100-300 candidates)<br/>Users who watched X also watched Y"]
        R4["4. TRENDING (~100 candidates)<br/>Global popularity: SELECT * FROM live_streams ORDER BY current_viewers DESC"]
        R5["5. EXPLORATION (~50 candidates)<br/>Random sample of streams with few viewers (cold-start for sellers)"]
    end
```

### Feature Store Architecture

```mermaid
flowchart TD
    subgraph FS["Feature Store Architecture"]
        RT["REAL-TIME FEATURES (Redis, &lt; 100ms)<br/>- stream:{id}:viewers -&gt; 12,345<br/>- stream:{id}:bid_count -&gt; 47<br/>- stream:{id}:chat_rate -&gt; 15.2 msg/s<br/>- stream:{id}:started_at -&gt; 1710000000<br/>- user:{id}:last_categories -&gt; [cards, shoes]<br/>- user:{id}:last_watched -&gt; [stream1, ...]"]
        NRT["NEAR-REAL-TIME FEATURES (Rockset, &lt; 1s)<br/>- seller_quality_score (computed hourly)<br/>- category_conversion_rate (computed hourly)<br/>- user_spend_percentile (computed daily)"]
        Batch["BATCH FEATURES (Snowflake -&gt; Redis, daily)<br/>- user_embedding (128-dim vector)<br/>- seller_embedding (128-dim vector)<br/>- user_category_affinity ({cards: 0.8, ...})<br/>- user_price_preference ({min: 5, max: 50})"]
    end
```

### Online vs Batch Inference

Whatnot migrated from batch to online inference. Here's why:

```
BATCH INFERENCE (old approach):
- Run ML model every 24 hours on all users
- Pre-compute ranking scores
- Store in lookup table

Problems:
- New users get NO recommendations for 24 hours (cold-start)
- Stream that went live 1 hour ago not in pre-computed results
- Stale: user watched 3 card streams today but batch still
  recommends sneakers based on yesterday's data

ONLINE INFERENCE (current approach):
- Run ML model at request time
- Use real-time features (what user just watched)
- Fresh signals for every feed request

Benefits:
- New users get recommendations immediately (use session signals)
- New streams ranked within seconds of going live
- Adapts to user's current session behavior
- A/B test model changes instantly

Cost:
- Higher compute (SageMaker inference on every request)
- Need low-latency feature store
- Model must run in < 50ms
```

### Cold-Start Strategy

```mermaid
flowchart TD
    subgraph NewUser["NEW USER (No History)"]
        U1["Initial:<br/>- Use device/location signals for initial category guess<br/>- Show trending streams (high engagement)<br/>- Apply exploration boost (surface diverse categories)"]
        U2["After 1st stream watched: Immediate re-ranking"]
        U3["After 3 streams: Collaborative filtering kicks in"]
        U4["After 10 streams: Full personalization"]
        U1 --> U2 --> U3 --> U4
    end

    subgraph NewSeller["NEW SELLER (No Viewers)"]
        S1["Initial:<br/>- Boost in 'exploration' retrieval source<br/>- Category-based matching to interested users<br/>- Show in 'New Sellers' carousel"]
        S2["After 5 streams: Quality score established"]
        S3["After 20 streams: Full organic ranking"]
        S1 --> S2 --> S3
    end
```

### Data Flow

```mermaid
flowchart LR
    UE["User Events"] --> K1["Kafka Topics"]
    K1 --> Flink["Feature Pipeline<br/>(Flink)"]
    Flink --> Redis[("Redis Feature Store")]

    SE["Stream Events"] --> K2["Kafka Topics"]
    K2 --> Snow[("Snowflake<br/>(Batch)")]
    Snow --> Train["ML Model Training<br/>(Daily)"]
    Train --> Feed["Feed Service"]
    Redis --> Feed
```

---

## Step 4: Scaling & Trade-offs

### Caching Strategy

```
Feed Cache (Redis, TTL = 30 seconds):
- Key: feed:{user_id}:{page}
- Value: ranked stream IDs
- Invalidation: on user action (watch, bid, follow)

Stream Metadata Cache (Redis, TTL = 5 seconds):
- Key: stream:{id}:meta
- Value: {title, seller, category, viewers, current_item}
- Updated by stream events via Kafka → Redis pipeline
```

### Trade-offs

| Decision                       | Choice                         | Why                                                                                   |
| ------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------- |
| Online vs batch inference      | **Online**                     | Freshness critical for ephemeral content                                              |
| Precision vs latency           | **Latency** (< 200ms)          | Users won't wait; good-enough ranking fast > perfect ranking slow                     |
| Personalization vs exploration | **Mix** (80/20)                | Heavy personalization creates filter bubbles; 20% exploration surfaces new categories |
| Feature freshness              | **Tiered** (real-time + batch) | Some features need second-level freshness; others are fine daily                      |

### Experimentation (Statsig)

Whatnot runs 400+ experiments/year on feed ranking:

- **A/B test framework**: Split users into control/treatment groups
- **Metrics**: Stream watch time, bid rate, purchase rate, return visits
- **Guard rails**: Revenue per user, seller coverage, category diversity
- **Ramp process**: 1% → 5% → 20% → 50% → 100%

### Monitoring

| Metric                     | Target                      |
| -------------------------- | --------------------------- |
| Feed latency (p99)         | < 200ms                     |
| Model inference time       | < 50ms                      |
| Feature store read latency | < 10ms                      |
| Stream-to-feed latency     | < 30s (new stream appears)  |
| CTR (click-through rate)   | Tracked per model version   |
| Watch time per session     | Primary optimization metric |
| Category diversity score   | > 3 categories in top 10    |
