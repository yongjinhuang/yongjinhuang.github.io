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

```
┌──────────────────────────────────────────────────────┐
│                    Client (App)                       │
└──────────────────────────┬───────────────────────────┘
                           │ GET /feed
                           ▼
┌──────────────────────────────────────────────────────┐
│                   Feed Service                        │
│                                                      │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐     │
│  │ Retrieval  │→ │  Ranking   │→ │ Re-ranking │     │
│  │  Stage     │  │  Stage     │  │  Stage     │     │
│  └────────────┘  └────────────┘  └────────────┘     │
└──────────────┬────────────┬──────────────────────────┘
               │            │
    ┌──────────┴──┐    ┌────┴─────────┐
    │  Candidate  │    │   ML Model   │
    │  Sources    │    │  (SageMaker) │
    │             │    │              │
    │ - Live idx  │    │ - Features   │
    │ - Following │    │ - Embeddings │
    │ - Category  │    │ - Scores     │
    │ - Trending  │    └──────────────┘
    └─────────────┘
          │
    ┌─────┴──────┐
    │   Feature  │
    │   Store    │
    │  (Redis +  │
    │  Rockset)  │
    └────────────┘
```

---

## Step 3: Deep Dive

### Three-Stage Ranking Pipeline

```
Stage 1: RETRIEVAL          Stage 2: RANKING           Stage 3: RE-RANKING
(Cheap, broad)              (ML model)                 (Business rules)

Fetch ~1000 candidates  →   Score & rank top ~100  →   Apply rules, return ~50

Sources:                    Features:                   Rules:
- Live stream index         - User-stream affinity      - Diversity (no 5 sports
- Followed sellers          - Category preference         card streams in a row)
- Trending streams          - Seller quality score      - Seller boost (new sellers)
- Category affinity         - Stream engagement         - Geographic relevance
- Collaborative filter      - Price range match         - Dedup (same seller)
                            - User embeddings           - Business promotions
                            - Stream embeddings
```

### Retrieval Sources

```
┌─────────────────────────────────────────────────────────┐
│                   Retrieval Sources                       │
│                                                         │
│  1. FOLLOWING (highest recall for engaged users)        │
│     SELECT * FROM live_streams                          │
│     WHERE seller_id IN (user's following list)          │
│     → ~50-200 candidates                                │
│                                                         │
│  2. CATEGORY AFFINITY                                   │
│     SELECT * FROM live_streams                          │
│     WHERE category IN (user's top 5 categories)         │
│     ORDER BY engagement_score DESC                      │
│     → ~200-500 candidates                               │
│                                                         │
│  3. COLLABORATIVE FILTERING                             │
│     Users who watched X also watched Y                  │
│     → ~100-300 candidates                               │
│                                                         │
│  4. TRENDING (global popularity)                        │
│     SELECT * FROM live_streams                          │
│     ORDER BY current_viewers DESC                       │
│     → ~100 candidates                                   │
│                                                         │
│  5. EXPLORATION (new/undiscovered streams)              │
│     Random sample of streams with few viewers           │
│     → ~50 candidates (cold-start for sellers)           │
└─────────────────────────────────────────────────────────┘
```

### Feature Store Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Feature Store                         │
│                                                         │
│  REAL-TIME FEATURES (Redis, < 100ms)                    │
│  ┌─────────────────────────────────────────────┐        │
│  │ stream:{id}:viewers      → 12,345           │        │
│  │ stream:{id}:bid_count    → 47               │        │
│  │ stream:{id}:chat_rate    → 15.2 msg/s       │        │
│  │ stream:{id}:started_at   → 1710000000       │        │
│  │ user:{id}:last_categories → [cards, shoes]  │        │
│  │ user:{id}:last_watched   → [stream1, ...]   │        │
│  └─────────────────────────────────────────────┘        │
│                                                         │
│  NEAR-REAL-TIME FEATURES (Rockset, < 1s)                │
│  ┌─────────────────────────────────────────────┐        │
│  │ seller_quality_score     → computed hourly   │        │
│  │ category_conversion_rate → computed hourly   │        │
│  │ user_spend_percentile    → computed daily    │        │
│  └─────────────────────────────────────────────┘        │
│                                                         │
│  BATCH FEATURES (Snowflake → Redis, daily)              │
│  ┌─────────────────────────────────────────────┐        │
│  │ user_embedding           → 128-dim vector   │        │
│  │ seller_embedding         → 128-dim vector   │        │
│  │ user_category_affinity   → {cards: 0.8, ..} │        │
│  │ user_price_preference    → {min: 5, max: 50}│        │
│  └─────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────┘
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

```
NEW USER (no history):
├── Use device/location signals for initial category guess
├── Show trending streams (high engagement = broadly appealing)
├── Apply exploration boost (surface diverse categories)
├── After 1st stream watched → immediate re-ranking
├── After 3 streams → collaborative filtering kicks in
└── After 10 streams → full personalization

NEW SELLER (no viewers):
├── Boost in "exploration" retrieval source
├── Category-based matching to interested users
├── Show in "New Sellers" carousel
├── After 5 streams → quality score established
└── After 20 streams → full organic ranking
```

### Data Flow

```
┌─────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  User   │────→│  Kafka   │────→│  Feature │────→│  Redis   │
│ Events  │     │  Topics  │     │ Pipeline │     │ Feature  │
│         │     │          │     │ (Flink)  │     │  Store   │
└─────────┘     └──────────┘     └──────────┘     └──────────┘
                                                        │
┌─────────┐     ┌──────────┐     ┌──────────┐          │
│  Stream │────→│  Kafka   │────→│ Snowflake│          │
│ Events  │     │  Topics  │     │  (Batch) │          │
└─────────┘     └──────────┘     └──────────┘          │
                                      │                 │
                                      ▼                 ▼
                                ┌──────────┐     ┌──────────┐
                                │ ML Model │────→│  Feed    │
                                │ Training │     │ Service  │
                                │ (Daily)  │     │          │
                                └──────────┘     └──────────┘
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

| Decision | Choice | Why |
|----------|--------|-----|
| Online vs batch inference | **Online** | Freshness critical for ephemeral content |
| Precision vs latency | **Latency** (< 200ms) | Users won't wait; good-enough ranking fast > perfect ranking slow |
| Personalization vs exploration | **Mix** (80/20) | Heavy personalization creates filter bubbles; 20% exploration surfaces new categories |
| Feature freshness | **Tiered** (real-time + batch) | Some features need second-level freshness; others are fine daily |

### Experimentation (Statsig)

Whatnot runs 400+ experiments/year on feed ranking:

- **A/B test framework**: Split users into control/treatment groups
- **Metrics**: Stream watch time, bid rate, purchase rate, return visits
- **Guard rails**: Revenue per user, seller coverage, category diversity
- **Ramp process**: 1% → 5% → 20% → 50% → 100%

### Monitoring

| Metric | Target |
|--------|--------|
| Feed latency (p99) | < 200ms |
| Model inference time | < 50ms |
| Feature store read latency | < 10ms |
| Stream-to-feed latency | < 30s (new stream appears) |
| CTR (click-through rate) | Tracked per model version |
| Watch time per session | Primary optimization metric |
| Category diversity score | > 3 categories in top 10 |
