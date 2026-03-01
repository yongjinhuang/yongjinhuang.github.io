# Design an ML Recommendation System (Netflix/YouTube/TikTok)

## 1. Requirements Clarification

### Functional Requirements

| Requirement                  | Description                                                        |
|------------------------------|--------------------------------------------------------------------|
| Personalized recommendations | Tailored content for each user based on history and preferences    |
| Multiple recommendation types| Homepage feed, "Related Items", "Trending", "Because You Watched"  |
| Real-time interaction tracking| Capture clicks, views, watch time, likes, shares in real time     |
| Multi-format content         | Support videos, articles, products, music depending on platform    |
| A/B testing                  | Run experiments on models, features, and ranking strategies        |
| Explainability               | Provide reasons for recommendations ("Because you watched X")      |
| Search integration           | Personalized search results blended with recommendations           |

### Non-Functional Requirements

| Requirement     | Target                                                             |
|-----------------|--------------------------------------------------------------------|
| Latency         | < 200ms end-to-end for serving recommendations (p99)               |
| Availability    | 99.99% uptime for serving path                                     |
| Scale           | 500M monthly active users                                          |
| Throughput      | Handle 10B interaction events per day                              |
| Cold start      | Provide reasonable recommendations for brand new users/items       |
| Freshness       | Incorporate user actions within minutes                            |
| Diversity       | Avoid filter bubbles; surface varied content                       |
| Fairness        | Avoid bias amplification across demographics                       |

### Scale Estimates

```
Users:            500M MAU, 100M DAU
Items:            100M total items, 100K new items/day
Interactions:     10B events/day
                  = 10B / 86400 = ~115K events/sec (avg)
                  = ~350K events/sec (peak, 3x)

Recommendation requests:
  - 100M DAU x 10 sessions/day = 1B requests/day
  - = ~12K QPS (avg), ~36K QPS (peak)

Feature Store:
  - User features:  500M users x 2KB = 1TB
  - Item features:  100M items x 1KB = 100GB
  - User embeddings: 500M x 256 dims x 4 bytes = 512GB
  - Item embeddings: 100M x 256 dims x 4 bytes = 100GB
  - Total online store: ~1.7TB (fits in distributed Redis cluster)

Training Data:
  - 10B events/day x 500 bytes/event = 5TB/day raw
  - 30-day training window = 150TB
  - Feature-enriched training data: ~300TB

Model Serving:
  - Candidate generation: 36K QPS x ~5ms = needs ~180 cores
  - Ranking model: 36K QPS x ~20ms = needs ~720 cores
  - ANN index: 100M items x 256 dims x 4 bytes = ~100GB per replica
```

---

## 2. Recommendation Approaches Overview

### 2.1 Content-Based Filtering

Uses item attributes (genre, director, tags) to recommend similar items to what the user has liked.

```
User liked: "Inception" (sci-fi, thriller, Nolan)
                |
                v
    Find items with similar attributes
                |
                v
Recommend: "Interstellar", "The Matrix", "Tenet"
```

**Pros**: No cold-start for new items (only needs item features), transparent explanations.
**Cons**: Limited discovery, cannot capture collaborative signals, feature engineering heavy.

### 2.2 Collaborative Filtering

#### User-Based CF

```
User A likes: Item 1, Item 2, Item 3
User B likes: Item 1, Item 2, Item 4
                |
                v
    Users A and B are similar
                |
                v
    Recommend Item 4 to User A
```

#### Item-Based CF

```
Item 1 is liked by: User A, User B, User C
Item 5 is liked by: User A, User B, User D
                |
                v
    Items 1 and 5 are similar
                |
                v
    Recommend Item 5 to User C
```

#### Matrix Factorization (SVD, ALS)

```
User-Item Interaction Matrix R (sparse):

         Item1  Item2  Item3  Item4  Item5
User A   [ 5     3      ?      1      ? ]
User B   [ 4     ?      ?      1      ? ]
User C   [ 1     1      ?      5      ? ]
User D   [ ?     ?      5      4      ? ]

Factorize: R ≈ U x V^T

U (user embeddings):     V (item embeddings):
  500M x k               100M x k
  (k = 128-256)          (k = 128-256)

Predicted rating: r(u,i) = U[u] . V[i]^T
```

### 2.3 Deep Learning Approaches

#### Two-Tower Model

```
    User Tower                 Item Tower
    ----------                 ----------
   |  User ID  |             |  Item ID  |
   | Demographics|           | Metadata  |
   | History    |             | Tags      |
   | Context   |              | Features  |
        |                          |
   [Dense Layers]            [Dense Layers]
   [256 -> 128]              [256 -> 128]
        |                          |
   User Embedding            Item Embedding
   (128-dim)                 (128-dim)
        |                          |
        +------- dot product ------+
                    |
               Similarity Score
```

#### Wide & Deep (Google, 2016)

```
  Wide Component              Deep Component
  (Memorization)              (Generalization)
  ---------------             ----------------
  Cross-product               Dense embeddings
  features                    of sparse features
       |                            |
       |                     [Hidden layers]
       |                     [1024->512->256]
       |                            |
       +------------ + ------------+
                     |
              Combined Output
              (Sigmoid for CTR)
```

#### DeepFM

```
  Sparse Features: [UserID, ItemID, Genre, City, ...]
         |
    +----+----+
    |         |
    v         v
  FM Layer   Deep Layer
  (2nd order  (Higher order
  interactions) interactions)
    |         |
    +----+----+
         |
    Prediction
```

#### Transformer-Based (BERT4Rec)

```
  User interaction sequence: [Item3, Item7, Item1, Item9, [MASK]]
                                |       |       |      |      |
                          [Embedding + Position Encoding]
                                |       |       |      |      |
                          [Multi-Head Self-Attention x N]
                                |       |       |      |      |
                          [Feed-Forward Network]
                                        |
                              Predict masked item
```

### 2.4 Comparison Table

| Approach             | Complexity | Cold Start | Scale     | Latency | Quality |
|----------------------|-----------|------------|-----------|---------|---------|
| Content-Based        | Low       | Item: Good | Good      | Low     | Medium  |
|                      |           | User: Poor |           |         |         |
| User-Based CF        | Medium    | Poor       | Poor (N^2)| Medium  | Medium  |
| Item-Based CF        | Medium    | Poor       | Moderate  | Medium  | Medium  |
| Matrix Factorization | Medium    | Poor       | Good      | Low     | Good    |
| Two-Tower            | High      | Moderate   | Excellent | Low     | Good    |
| Wide & Deep          | High      | Moderate   | Good      | Medium  | V.Good  |
| DeepFM               | High      | Moderate   | Good      | Medium  | V.Good  |
| BERT4Rec             | Very High | Poor       | Moderate  | High    | V.Good  |
| Hybrid               | Very High | Good       | Good      | Medium  | Best    |

**Industry choices:**
- **Netflix**: Two-Tower for candidate gen + Deep ranking model
- **YouTube**: Two-Tower (candidate gen) + Wide & Deep (ranking)
- **TikTok**: Multi-gate mixture of experts + real-time features

---

## 3. High-Level Architecture

```
+------------------------------------------------------------------+
|                        CLIENT LAYER                               |
|   [Mobile App]    [Web Browser]    [Smart TV]    [API Clients]    |
+--------|--------------------|-------------|-------------|--------+
         |                    |             |             |
         v                    v             v             v
+------------------------------------------------------------------+
|                       API GATEWAY / CDN                           |
|            (Rate Limiting, Auth, Load Balancing)                  |
+------------------------------------------------------------------+
         |                                        |
         v                                        v
+------------------------+          +----------------------------+
| ONLINE SERVING PATH    |          | EVENT INGESTION PATH       |
|                        |          |                            |
| +--------------------+ |          | +------------------------+ |
| | Feature Store      | |          | | Kafka / Kinesis        | |
| | (Redis Cluster)    | |          | | (Event Stream)         | |
| +--------------------+ |          | +------------------------+ |
|          |              |          |      |            |        |
|          v              |          |      v            v        |
| +--------------------+ |          | +---------+ +-----------+  |
| | Candidate          | |          | | Flink   | | Spark     |  |
| | Generation         | |          | | (RT     | | Streaming |  |
| | (ANN Index)        | |          | | Feature | | (Batch    |  |
| +--------------------+ |          | | Update) | | Features) |  |
|          |              |          | +---------+ +-----------+  |
|          v              |          +----------------------------+
| +--------------------+ |                     |
| | Ranking Model      | |                     v
| | (GPU Serving)      | |          +----------------------------+
| +--------------------+ |          | OFFLINE TRAINING PATH      |
|          |              |          |                            |
|          v              |          | +------------------------+ |
| +--------------------+ |          | | Data Lake (S3/HDFS)    | |
| | Re-ranking &       | |          | | - Raw events           | |
| | Business Logic     | |          | | - Training datasets    | |
| +--------------------+ |          | | - Feature snapshots    | |
|          |              |          | +------------------------+ |
|          v              |          |          |                 |
| +--------------------+ |          | +------------------------+ |
| | Response Assembly  | |          | | Training Pipeline      | |
| +--------------------+ |          | | (GPU Cluster)          | |
+------------------------+          | | - Feature engineering  | |
                                    | | - Model training       | |
                                    | | - Evaluation           | |
                                    | +------------------------+ |
                                    |          |                 |
                                    | +------------------------+ |
                                    | | Model Registry         | |
                                    | | (MLflow / SageMaker)   | |
                                    | +------------------------+ |
                                    +----------------------------+
```

### Three Processing Paths

```
1. ONLINE (Synchronous, < 200ms):
   Request -> Feature Lookup -> Candidate Gen -> Rank -> Re-rank -> Response

2. NEAR-REAL-TIME (Seconds to minutes):
   User Event -> Kafka -> Flink -> Update Online Features -> Update Session

3. OFFLINE (Hours):
   Events -> Data Lake -> Feature Engineering -> Model Training -> Deploy
```

---

## 4. Multi-Stage Recommendation Pipeline

### 4.1 Candidate Generation (Recall Stage)

**Goal**: Narrow from 100M items to 500-1000 candidates in < 10ms.

```
                    100M Total Items
                          |
          +---------------+---------------+
          |               |               |
    +-----v-----+  +-----v-----+  +------v------+
    | ANN-Based |  | CF-Based  |  | Rule-Based  |
    | Retrieval |  | Retrieval |  | Retrieval   |
    | (200)     |  | (200)     |  | (200)       |
    +-----------+  +-----------+  +-------------+
          |               |               |
          +-------+-------+-------+-------+
                  |               |
           +------v------+ +-----v--------+
           | Popularity  | | Trending     |
           | Based (100) | | Based (100)  |
           +-------------+ +--------------+
                  |               |
                  +-------+-------+
                          |
                    Merge & Deduplicate
                          |
                  ~500-1000 candidates
```

#### ANN (Approximate Nearest Neighbor) Retrieval

```
Pre-computed:
  - User embedding: E_u = UserTower(user_features)    -> 256-dim vector
  - Item embeddings: E_i = ItemTower(item_features)   -> 256-dim vectors

At serving time:
  1. Look up user embedding E_u from cache
  2. Query ANN index: top-K = ANN_search(E_u, K=200)
  3. Return K nearest item IDs

ANN Index Structure (HNSW):
  Layer 3:  [A] -------------- [B]
  Layer 2:  [A] ---- [C] ---- [B] ---- [D]
  Layer 1:  [A]-[E]-[C]-[F]-[B]-[G]-[D]-[H]
  Layer 0:  [A][I][E][J][C][K][F][L][B][M][G][N][D][O][H][P]

  Search: Start at top layer, greedily descend
  Time complexity: O(log N) with high recall
```

#### Multiple Retrieval Channels

| Channel              | Source             | Count | Latency |
|----------------------|--------------------|-------|---------|
| Two-Tower ANN        | User embedding     | 200   | 5ms     |
| Item-Based CF        | Recent interactions| 200   | 3ms     |
| User-Based CF        | Similar users      | 100   | 5ms     |
| Popularity           | Global trending    | 100   | 1ms     |
| Content-Based        | Liked item features| 100   | 3ms     |
| Editor's Picks       | Curated lists      | 50    | 1ms     |
| Geo/Context          | Location, time     | 50    | 2ms     |

All channels execute in **parallel**, results are merged and deduplicated.

### 4.2 Ranking (Scoring Stage)

**Goal**: Score 500-1000 candidates precisely using a rich feature set. Latency budget: ~50ms.

```
For each candidate item:

  +------------------+------------------+-------------------+
  |   User Features  |  Item Features   | Context Features  |
  +------------------+------------------+-------------------+
  | - user_id embed  | - item_id embed  | - time_of_day     |
  | - age, gender    | - category       | - day_of_week     |
  | - watch history  | - duration       | - device_type     |
  | - avg watch time | - upload_date    | - location        |
  | - click rate     | - view_count     | - session_length  |
  | - genre prefs    | - like_ratio     | - previous_item   |
  +------------------+------------------+-------------------+
            |                 |                   |
            v                 v                   v
  +----------------------------------------------------------+
  |              Feature Interaction Layer                     |
  |  (Cross features: user_genre x item_genre,                |
  |   user_avg_duration x item_duration, etc.)                 |
  +----------------------------------------------------------+
                          |
                          v
  +----------------------------------------------------------+
  |              Deep Neural Network                           |
  |  Input (concatenated): 1024-dim                            |
  |  Hidden: 1024 -> 512 -> 256 -> 128                         |
  |  Activation: ReLU + BatchNorm + Dropout                    |
  +----------------------------------------------------------+
                          |
                          v
  +----------------------------------------------------------+
  |              Multi-Task Heads                              |
  |  P(click)  |  P(watch>50%)  |  P(like)  |  P(share)       |
  +----------------------------------------------------------+
                          |
                          v
  Combined Score = w1*P(click) + w2*P(watch) + w3*P(like) + w4*P(share)
```

#### Feature Engineering Deep Dive

```
Feature Categories:

1. User Static Features (updated daily):
   - Demographics: age_bucket, gender, country, language
   - Account: account_age, subscription_tier
   - Preferences: favorite_genres (top-5), preferred_length

2. User Dynamic Features (updated in real-time):
   - Recent watches: last_10_items, last_10_categories
   - Session: items_viewed_this_session, session_duration
   - Engagement: rolling_7d_CTR, rolling_7d_watch_time

3. Item Static Features:
   - Metadata: category, tags, language, duration, creator_id
   - Content: title_embedding, thumbnail_embedding, description_embedding
   - Quality: production_quality_score

4. Item Dynamic Features (updated hourly):
   - Popularity: view_count_24h, like_ratio_7d, share_count_24h
   - Freshness: hours_since_upload, trending_score

5. Cross Features (computed at serving time):
   - user_genre_pref x item_genre (match score)
   - user_avg_watch_duration x item_duration (ratio)
   - user_language x item_language (binary match)
   - user_creator_affinity[item.creator_id] (historical engagement)

6. Contextual Features:
   - Time: hour_of_day, day_of_week, is_weekend, is_holiday
   - Device: device_type, screen_size, connection_speed
   - Session: position_in_session, time_since_last_interaction
```

### 4.3 Re-ranking (Business Logic Stage)

**Goal**: Apply business rules, diversity, and exploration on top of ranked results. Latency: ~10ms.

```
Ranked candidates (top 100 by score)
         |
         v
+---------------------+
| Diversity Injection |  -- Ensure no more than 3 items per category
+---------------------+     in top 20 results
         |
         v
+---------------------+
| Freshness Boost     |  -- Boost items < 24h old by 1.2x
+---------------------+     Boost items < 1h old by 1.5x
         |
         v
+---------------------+
| Business Rules      |  -- Insert promoted content at positions 3, 7
+---------------------+     Filter age-restricted content
         |                   Suppress already-watched items
         v
+---------------------+
| Exploration         |  -- Reserve 10% of slots for exploration
+---------------------+     Use Thompson Sampling for new items
         |
         v
+---------------------+
| Position Bias       |  -- Calibrate scores for position bias
| Correction          |     (items at top get more clicks regardless)
+---------------------+
         |
         v
  Final ordered list (top 50)
```

#### Exploration vs Exploitation Strategies

```
1. Epsilon-Greedy:
   - With probability (1-epsilon): show top-ranked items
   - With probability epsilon: show random items
   - Typical epsilon: 0.05-0.10

2. Thompson Sampling:
   - Maintain Beta(alpha, beta) distribution for each item
   - Sample from distribution, rank by sampled value
   - Higher uncertainty -> higher chance of exploration

   For item i with alpha=clicks, beta=impressions-clicks:
   sampled_score = Beta(alpha_i + 1, beta_i + 1).sample()

3. Upper Confidence Bound (UCB):
   score_i = estimated_reward_i + c * sqrt(ln(N) / n_i)
   where N = total impressions, n_i = impressions for item i

4. Contextual Bandits:
   - Train a model that takes (user, item, context) -> reward
   - Balance exploration/exploitation using LinUCB or neural variants
```

---

## 5. Feature Store Design

```
+-------------------------------------------------------------------+
|                       FEATURE STORE                                |
|                                                                    |
|  +--------------------+          +--------------------+            |
|  | ONLINE STORE       |          | OFFLINE STORE      |            |
|  | (Redis Cluster)    |          | (S3 + Hive/Iceberg)|            |
|  |                    |          |                    |             |
|  | - User features    |          | - Historical       |            |
|  |   (1TB, <1ms)      |          |   features         |            |
|  | - Item features    |          | - Training data    |            |
|  |   (100GB, <1ms)    |          |   (300TB)          |            |
|  | - Real-time        |          | - Feature          |            |
|  |   counters         |          |   snapshots        |            |
|  +--------^-----------+          +--------^-----------+            |
|           |                               |                        |
|  +--------+-----------+          +--------+-----------+            |
|  | STREAMING PIPELINE |          | BATCH PIPELINE     |            |
|  | (Flink)            |          | (Spark)            |            |
|  |                    |          |                    |             |
|  | - Real-time        |          | - Daily feature    |            |
|  |   aggregations     |          |   computation      |            |
|  | - Sliding window   |          | - Historical       |            |
|  |   features         |          |   aggregations     |            |
|  | - Session features |          | - Training data    |            |
|  |                    |          |   generation       |            |
|  +--------^-----------+          +--------^-----------+            |
|           |                               |                        |
|  +--------+-------------------------------+-----------+            |
|  |               EVENT STREAM (Kafka)                 |            |
|  |  Topics: clicks, views, watch_time, likes, shares  |            |
|  +----------------------------------------------------+            |
+-------------------------------------------------------------------+
```

### Feature Computation Pipeline

```
Raw Event:
{
  user_id: "u123",
  item_id: "v456",
  event: "watch",
  duration_sec: 180,
  item_total_sec: 240,
  timestamp: 1709312400,
  device: "mobile",
  location: "US-CA"
}

        |
        v (Flink Streaming)

Real-Time Features Updated:
  user:u123:session_watch_count     += 1
  user:u123:session_total_duration  += 180
  user:u123:last_watched_category   = "comedy"
  user:u123:rolling_1h_watch_count  += 1
  item:v456:view_count_1h           += 1
  item:v456:completion_rate_1h      = running_avg(180/240)

        |
        v (Written to Redis)

Online Feature Store (Redis):
  Key: "user_features:u123"
  Value: {
    session_watch_count: 5,
    rolling_1h_watch_count: 12,
    last_watched_category: "comedy",
    ...
  }

        |
        v (Spark Batch - Daily)

Offline Feature Store (S3/Hive):
  - user:u123:rolling_7d_avg_watch_time = 23.5 min
  - user:u123:top_categories_30d = ["comedy", "drama", "sci-fi"]
  - user:u123:creator_affinity = {c1: 0.8, c2: 0.6, ...}
```

### Point-in-Time Correctness

```
WRONG (Data Leakage):
  Training example at time T uses features computed at time T+1

  Timeline:     T-2    T-1    T(event)   T+1    T+2
  Features:     -------[used for training]--------->
                                          ^
                                     LEAKED future data!

CORRECT (Point-in-Time Join):
  Training example at time T uses features as they were at time T

  Timeline:     T-2    T-1    T(event)   T+1    T+2
  Features:     ------>|
                       ^
                  Features snapshot at T-1

Implementation:
  - Store feature snapshots with timestamps
  - Training pipeline joins events with feature snapshots
  - WHERE feature_timestamp < event_timestamp
```

---

## 6. Training Pipeline

```
+-------------------------------------------------------------------+
|                     TRAINING PIPELINE                              |
|                                                                    |
|  +------------------+     +------------------+                     |
|  | Data Collection  |     | Feature          |                     |
|  | & Sampling       |---->| Engineering      |                     |
|  | (Spark)          |     | (Spark + Flink)  |                     |
|  +------------------+     +------------------+                     |
|                                    |                               |
|                                    v                               |
|  +------------------+     +------------------+                     |
|  | Negative         |     | Training Data    |                     |
|  | Sampling         |---->| Validation       |                     |
|  +------------------+     +------------------+                     |
|                                    |                               |
|                                    v                               |
|  +------------------+     +------------------+                     |
|  | Distributed      |     | Hyperparameter   |                     |
|  | Training         |<--->| Tuning           |                     |
|  | (GPU Cluster)    |     | (Optuna/Ray)     |                     |
|  +------------------+     +------------------+                     |
|           |                                                        |
|           v                                                        |
|  +------------------+     +------------------+                     |
|  | Offline          |     | Model Registry   |                     |
|  | Evaluation       |---->| (MLflow)         |                     |
|  +------------------+     +------------------+                     |
|                                    |                               |
|                                    v                               |
|  +------------------+     +------------------+                     |
|  | Shadow / Canary  |     | Production       |                     |
|  | Deployment       |---->| Rollout          |                     |
|  +------------------+     +------------------+                     |
+-------------------------------------------------------------------+
```

### Implicit vs Explicit Feedback

```
Explicit Feedback:
  - Ratings (1-5 stars)
  - Thumbs up/down
  - "Not interested" clicks
  Pros: Clear signal
  Cons: Sparse, biased (users rate extreme experiences)

Implicit Feedback:
  - Clicks, views, watch time
  - Scroll depth, dwell time
  - Purchases, add-to-cart
  - Shares, saves, comments
  Pros: Abundant data
  Cons: Noisy, hard to interpret (did they watch or fall asleep?)

Label Construction for Implicit Feedback:
  Positive: watch_time / total_duration > 0.7
            OR liked
            OR shared
  Negative: watch_time / total_duration < 0.1
            OR "not interested" clicked
  Ignored:  everything else (ambiguous)
```

### Negative Sampling Strategies

```
Problem: In implicit feedback, we only observe positive interactions.
         How do we generate negative examples?

1. Random Negative Sampling:
   - For each positive (user, item), sample K random items as negatives
   - K typically 4-10
   - Cheap but may sample false negatives (items user would like)

2. Popularity-Weighted Sampling:
   - Sample negatives proportional to item popularity^0.75
   - More popular items more likely to be true negatives
   - P(item_j as negative) proportional to freq(item_j)^0.75

3. Hard Negative Mining:
   - Use current model to find items ranked high but not clicked
   - Mix: 50% random negatives + 50% hard negatives
   - Improves model discrimination on difficult cases

4. In-Batch Negatives (for Two-Tower):
   - Use other items in the same training batch as negatives
   - Efficient: no extra computation needed
   - Batch size of 1024 gives 1023 negatives per positive

Sampling ratio impact:
  Ratio 1:1   -> Underfits (too few negatives)
  Ratio 1:4   -> Good balance for most cases
  Ratio 1:10  -> Better for large item catalogs
  Ratio 1:100 -> Overfits on negatives
```

### Model Evaluation: Offline Metrics

```
Ranking Metrics:

1. AUC (Area Under ROC Curve):
   - Probability that a positive item is ranked higher than a negative
   - Target: > 0.80

2. NDCG@K (Normalized Discounted Cumulative Gain):
   NDCG@K = DCG@K / IDCG@K
   DCG@K  = sum(i=1 to K) of (2^rel_i - 1) / log2(i + 1)
   - Measures ranking quality considering position
   - Target: > 0.40 at K=10

3. MAP@K (Mean Average Precision):
   AP@K = (1/min(m,K)) * sum(k=1 to K) of P(k) * rel(k)
   MAP  = mean of AP across all users
   - Target: > 0.30 at K=10

4. Hit Rate@K:
   - Fraction of users where at least one relevant item in top K
   - Target: > 0.85 at K=20

5. Coverage:
   - Fraction of items ever recommended
   - Target: > 0.60 (avoid popularity bias)

6. Diversity (Intra-List Distance):
   ILD = avg pairwise distance between recommended items
   - Higher is more diverse
```

### Training Schedule

```
+----------------------------------+------------------+------------------+
| Component                        | Retrain Frequency| Reason           |
+----------------------------------+------------------+------------------+
| Candidate generation (Two-Tower) | Daily            | User/item embeds |
| Ranking model                    | Daily            | Feature drift    |
| Item embeddings                  | Hourly (new items)| Cold start      |
| User embeddings                  | Every 6 hours    | Capture trends   |
| ANN index                        | Every 6 hours    | New embeddings   |
| Feature aggregations (batch)     | Daily            | Historical stats |
+----------------------------------+------------------+------------------+
```

---

## 7. Model Serving

### Embedding-Based Serving Architecture

```
+----------------------------------------------------------------+
|                    MODEL SERVING LAYER                          |
|                                                                |
|  +-------------------+     +-----------------------------+     |
|  | User Embedding    |     | ANN Index Service           |     |
|  | Cache (Redis)     |     | (FAISS / ScaNN)             |     |
|  |                   |     |                             |     |
|  | user_id -> 256d   |     | 100M item embeddings        |     |
|  | TTL: 6 hours      |     | HNSW index                  |     |
|  | Hit rate: ~95%    |     | Sharded across 10 nodes     |     |
|  +-------------------+     +-----------------------------+     |
|           |                          |                         |
|           v                          v                         |
|  +---------------------------------------------------+        |
|  | Candidate Generation Service                       |        |
|  | - Look up user embedding (cache or compute)        |        |
|  | - Query ANN index for top-200 candidates           |        |
|  | - Merge with CF, popularity, trending candidates   |        |
|  | - Output: ~500-1000 candidate item IDs             |        |
|  +---------------------------------------------------+        |
|                          |                                     |
|                          v                                     |
|  +---------------------------------------------------+        |
|  | Feature Assembly Service                           |        |
|  | - Batch lookup user features from Redis            |        |
|  | - Batch lookup item features for all candidates    |        |
|  | - Compute cross features                           |        |
|  | - Assemble feature vectors for ranking model       |        |
|  +---------------------------------------------------+        |
|                          |                                     |
|                          v                                     |
|  +---------------------------------------------------+        |
|  | Ranking Model Service (TF Serving / Triton)        |        |
|  | - GPU-accelerated inference                        |        |
|  | - Batch scoring: 500 items in single forward pass  |        |
|  | - Multi-task output: P(click), P(watch), P(like)   |        |
|  | - Combined score with business weights             |        |
|  +---------------------------------------------------+        |
|                          |                                     |
|                          v                                     |
|  +---------------------------------------------------+        |
|  | Re-ranking Service                                 |        |
|  | - Apply diversity, freshness, business rules       |        |
|  | - Final ordered list of 50 items                   |        |
|  +---------------------------------------------------+        |
+----------------------------------------------------------------+
```

### ANN Search Comparison

```
+------------------+----------+-----------+--------+-----------+
| Library          | Build    | Query     | Memory | Recall@100|
|                  | Time     | Time      |        |           |
+------------------+----------+-----------+--------+-----------+
| FAISS (IVF-PQ)   | ~1 hour  | ~1ms      | 10GB   | 95%       |
| FAISS (HNSW)     | ~2 hours | ~0.5ms    | 50GB   | 99%       |
| ScaNN (Google)   | ~1 hour  | ~0.3ms    | 15GB   | 97%       |
| Annoy (Spotify)  | ~30 min  | ~1ms      | 20GB   | 90%       |
| Milvus           | ~1 hour  | ~1ms      | 30GB   | 96%       |
| Pinecone (SaaS)  | Managed  | ~5ms      | N/A    | 98%       |
+------------------+----------+-----------+--------+-----------+

Note: Benchmarks for 100M vectors, 256 dimensions.
ScaNN and FAISS HNSW are most commonly used at scale.
```

### Batching and Caching Strategies

```
1. Request Batching:
   - Accumulate ranking requests for ~5ms
   - Batch multiple users' candidates into single GPU forward pass
   - Throughput: 10K -> 50K items/sec per GPU

2. Embedding Cache:
   - User embeddings: Cache in Redis, TTL = 6h, ~95% hit rate
   - Item embeddings: Cache popular items, TTL = 1h
   - Cache miss: Compute on-the-fly using feature store + model

3. Result Cache:
   - Full recommendation results: Cache for 5 min
   - Invalidate on new user interaction
   - Hit rate: ~30% (personalization limits caching)

4. Pre-computation:
   - Pre-compute recommendations for top 10M active users
   - Refresh every 15 minutes
   - Serve from cache, fall back to real-time for rest

Latency Breakdown (p50):
  Feature lookup:        5ms
  Candidate generation:  8ms (ANN) + 5ms (CF) = 13ms (parallel)
  Feature assembly:     10ms
  Ranking (GPU):        15ms
  Re-ranking:            3ms
  Network overhead:      5ms
  --------------------------------
  Total:               ~51ms (well within 200ms budget)

Latency Breakdown (p99):
  Feature lookup:       15ms
  Candidate generation: 25ms
  Feature assembly:     30ms
  Ranking (GPU):        40ms
  Re-ranking:            5ms
  Network overhead:     15ms
  --------------------------------
  Total:              ~130ms (within 200ms budget)
```

### A/B Testing Framework

```
+-----------------------------------------------------------+
|                   A/B TESTING SYSTEM                       |
|                                                           |
|  User Request                                             |
|      |                                                    |
|      v                                                    |
|  +------------------+                                     |
|  | Experiment       |  Consistent hashing:                |
|  | Assignment       |  bucket = hash(user_id) % 100       |
|  | Service          |                                     |
|  +------------------+                                     |
|      |                                                    |
|      +------- bucket 0-4:   Control (Model v1)            |
|      +------- bucket 5-9:   Treatment A (Model v2)        |
|      +------- bucket 10-14: Treatment B (Model v3)        |
|      +------- bucket 15-99: Production (Model v1)         |
|                                                           |
|  Metrics Collection:                                      |
|  - Per-bucket CTR, watch time, retention                  |
|  - Statistical significance testing (t-test, chi-square)  |
|  - Minimum 7-day experiment duration                      |
|  - Minimum 100K users per bucket                          |
|                                                           |
|  Guardrail Metrics (auto-rollback if breached):           |
|  - Revenue drop > 2%                                      |
|  - User complaints increase > 50%                         |
|  - Latency p99 > 300ms                                    |
+-----------------------------------------------------------+
```

---

## 8. Data Model

### Users Table

```sql
CREATE TABLE users (
    user_id         BIGINT PRIMARY KEY,
    username        VARCHAR(255),
    email           VARCHAR(255),
    country         VARCHAR(2),
    language        VARCHAR(5),
    age_bucket      VARCHAR(10),    -- '18-24', '25-34', etc.
    gender          VARCHAR(10),
    signup_date     TIMESTAMP,
    subscription    VARCHAR(20),    -- 'free', 'premium', 'family'
    last_active     TIMESTAMP,
    device_types    VARCHAR(100),   -- JSON array
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);
-- Partition by country for geo-distributed serving
```

### Items Table

```sql
CREATE TABLE items (
    item_id         BIGINT PRIMARY KEY,
    title           VARCHAR(500),
    description     TEXT,
    category        VARCHAR(100),
    subcategory     VARCHAR(100),
    tags            VARCHAR(500),   -- JSON array
    creator_id      BIGINT,
    language        VARCHAR(5),
    duration_sec    INT,            -- For video/audio
    content_type    VARCHAR(50),    -- 'video', 'article', 'product'
    quality_score   FLOAT,
    maturity_rating VARCHAR(10),    -- 'G', 'PG', 'PG-13', 'R'
    publish_date    TIMESTAMP,
    status          VARCHAR(20),    -- 'active', 'archived', 'blocked'
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);
-- Index on (category, publish_date) for trending queries
-- Index on (creator_id) for creator-based retrieval
```

### Interactions / Events Table

```sql
CREATE TABLE interactions (
    event_id        BIGINT PRIMARY KEY,    -- Snowflake ID
    user_id         BIGINT NOT NULL,
    item_id         BIGINT NOT NULL,
    event_type      VARCHAR(20),           -- 'view','click','watch','like',
                                           -- 'share','purchase','skip'
    duration_sec    INT,                   -- Watch/read duration
    completion_rate FLOAT,                 -- 0.0 to 1.0
    device_type     VARCHAR(20),
    location        VARCHAR(50),
    session_id      VARCHAR(64),
    position        INT,                   -- Position in recommendation list
    source          VARCHAR(50),           -- 'homepage','search','related'
    timestamp       TIMESTAMP NOT NULL,
    created_at      TIMESTAMP DEFAULT NOW()
);
-- Partitioned by date (daily partitions)
-- Clustered by user_id within partitions
-- Stored in columnar format (Parquet) in data lake
-- Hot data (7 days) in Cassandra for real-time queries
-- Cold data in S3/HDFS for training
```

### Embeddings Table

```sql
CREATE TABLE embeddings (
    entity_type     VARCHAR(10),    -- 'user' or 'item'
    entity_id       BIGINT,
    model_version   VARCHAR(50),
    embedding       VECTOR(256),    -- 256-dimensional float vector
    computed_at     TIMESTAMP,
    PRIMARY KEY (entity_type, entity_id, model_version)
);
-- Stored in Redis for online serving
-- Stored in S3 for batch processing
-- ANN index built from item embeddings
```

### Features Table

```sql
CREATE TABLE feature_store (
    entity_type     VARCHAR(10),    -- 'user', 'item', 'context'
    entity_id       BIGINT,
    feature_name    VARCHAR(100),
    feature_value   BYTEA,          -- Serialized feature value
    computed_at     TIMESTAMP,
    PRIMARY KEY (entity_type, entity_id, feature_name)
);
-- Online: Redis with hash maps per entity
-- Offline: Hive/Iceberg tables partitioned by date
```

### Experiments Table

```sql
CREATE TABLE experiments (
    experiment_id   BIGINT PRIMARY KEY,
    name            VARCHAR(255),
    description     TEXT,
    status          VARCHAR(20),    -- 'draft','running','completed','rolled_back'
    start_date      TIMESTAMP,
    end_date        TIMESTAMP,
    traffic_pct     FLOAT,          -- Percentage of traffic allocated
    control_config  JSONB,          -- Model version, features, params
    treatment_config JSONB,
    metrics         JSONB,          -- Tracked metrics and results
    created_by      VARCHAR(100),
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE experiment_assignments (
    user_id         BIGINT,
    experiment_id   BIGINT,
    bucket          VARCHAR(20),    -- 'control', 'treatment_a', 'treatment_b'
    assigned_at     TIMESTAMP,
    PRIMARY KEY (user_id, experiment_id)
);
```

---

## 9. Cold Start Problem

### New User Cold Start

```
Brand new user (no interaction history):

Strategy 1: Popularity-Based
  +--------------------+
  | Global Popular     |  Show globally trending items
  | Items              |  Segmented by country/language
  +--------------------+

Strategy 2: Demographic-Based
  +--------------------+
  | Similar users by   |  Users with same age, country,
  | demographics       |  language tend to like these items
  +--------------------+

Strategy 3: Onboarding Quiz
  +--------------------+
  | "Select topics     |  User picks 5+ categories/genres
  |  you enjoy"        |  Use selections as initial preferences
  +--------------------+

Strategy 4: Contextual Signals
  +--------------------+
  | Device, location,  |  Mobile user in US at 10pm ->
  | time, referral     |  short entertainment videos
  +--------------------+

Progression:
  Interaction 0:    100% popularity + demographics
  Interactions 1-5:  70% popularity + 30% personalized
  Interactions 5-20: 40% popularity + 60% personalized
  Interactions 20+:  10% popularity + 90% personalized
```

### New Item Cold Start

```
Brand new item (no interaction data):

Strategy 1: Content-Based Features
  +--------------------+
  | Extract features   |  Title embedding, description embedding,
  | from metadata      |  category, tags, duration
  +--------------------+
          |
          v
  Compute content similarity to existing items
  Place in embedding space using item tower with content features only

Strategy 2: Creator Boost
  +--------------------+
  | Creator history    |  If creator's past items perform well,
  |                    |  boost new item's initial score
  +--------------------+

Strategy 3: Exploration Pool
  +--------------------+
  | Dedicated          |  Reserve 5-10% of impressions
  | exploration slots  |  for items with < 100 impressions
  +--------------------+

Strategy 4: Multi-Armed Bandit
  +--------------------+
  | Thompson Sampling  |  High uncertainty = high exploration
  | or UCB             |  Converges as data accumulates
  +--------------------+

New Item Lifecycle:
  Impressions 0:        Content features only, placed in exploration pool
  Impressions 1-100:    High exploration weight, rapid feedback
  Impressions 100-1K:   Transitioning to collaborative signals
  Impressions 1K+:      Full collaborative filtering, exploration reduces
```

### Cold Start Architecture

```
+------------------------------------------------------------------+
|                    COLD START SYSTEM                              |
|                                                                  |
|  User Request                                                    |
|      |                                                           |
|      v                                                           |
|  +------------------+                                            |
|  | User Profile     |                                            |
|  | Check            |                                            |
|  +------------------+                                            |
|      |           |                                               |
|  Has history  No history                                         |
|      |           |                                               |
|      v           v                                               |
|  Standard     +------------------+                               |
|  Pipeline     | Cold Start       |                               |
|               | Router           |                               |
|               +------------------+                               |
|                  |       |       |                                |
|                  v       v       v                                |
|            Popularity  Demo-  Onboarding                         |
|            Based      graphic  Quiz                              |
|                  |       |       |                                |
|                  +---+---+---+---+                                |
|                      |                                           |
|                      v                                           |
|              Blend with Exploration                              |
|                      |                                           |
|                      v                                           |
|              Return Recommendations                              |
+------------------------------------------------------------------+
```

---

## 10. Real-time Personalization

### Event Streaming Architecture

```
+------------------------------------------------------------------+
|                 REAL-TIME PERSONALIZATION                         |
|                                                                  |
|  User Action (click, watch, like)                                |
|      |                                                           |
|      v                                                           |
|  +-----------------+     +------------------+                    |
|  | Event Collector |---->| Kafka            |                    |
|  | (API Gateway)   |     | (Partitioned by  |                    |
|  +-----------------+     |  user_id)         |                    |
|                          +------------------+                    |
|                            |        |       |                    |
|                            v        v       v                    |
|  +-------------------+  +------+ +------+ +------+              |
|  | Session Service   |  |Flink | |Flink | |Flink |              |
|  | (In-memory)       |  |Job 1 | |Job 2 | |Job 3 |              |
|  |                   |  |RT    | |Online| |User   |              |
|  | - Current session |  |Agg   | |Feature| |Embed |              |
|  |   items viewed    |  |      | |Update| |Update|              |
|  | - Session context |  +------+ +------+ +------+              |
|  +-------------------+     |        |         |                  |
|                            v        v         v                  |
|                   +----------------------------+                 |
|                   | Redis (Online Feature Store)|                |
|                   +----------------------------+                 |
|                              |                                   |
|                              v                                   |
|                   Next recommendation request                    |
|                   uses updated features                          |
+------------------------------------------------------------------+
```

### Session-Based Recommendations

```
Within a single session, adapt recommendations in real-time:

Session Timeline:
  T0: User opens app
      -> Show pre-computed recommendations (cached)

  T1: User watches a comedy video (2 min)
      -> Update session features:
         session_categories = ["comedy"]
         session_watch_time = 120s
      -> Next request: boost comedy, similar duration

  T2: User skips a drama video after 3 sec
      -> Update session features:
         session_skipped = ["drama"]
      -> Next request: demote drama content

  T3: User watches a cooking video (5 min)
      -> Update session features:
         session_categories = ["comedy", "cooking"]
         session_engagement_trend = "increasing"
      -> Next request: recommend comedy + cooking crossovers

Session Feature Vector (updated per interaction):
  {
    session_id: "s789",
    items_viewed: ["v1", "v2", "v3"],
    categories_viewed: {"comedy": 2, "cooking": 1},
    avg_watch_pct: 0.72,
    session_duration: 420,
    last_action: "watch_complete",
    engagement_trend: "increasing",
    skip_categories: ["drama"]
  }
```

### Real-Time Embedding Updates

```
Full embedding retraining is expensive (hours).
For real-time updates, use lightweight approaches:

1. Embedding Interpolation:
   new_user_embed = alpha * stored_embed + (1-alpha) * session_embed
   where session_embed = mean(embeddings of items interacted in session)
   alpha = 0.7 (weight toward historical, decays with session length)

2. Incremental Learning:
   - Keep last layer of user tower unfrozen
   - Fine-tune on new interactions with small learning rate
   - Update every N interactions (N=10)

3. Contextual Adjustment:
   - Store base user embedding (historical)
   - At serving time, concatenate with session features
   - Ranking model learns to weight both signals

Latency: Embedding update completes in < 100ms per user interaction
```

---

## 11. Evaluation & A/B Testing

### Offline Evaluation Metrics

```
+--------------------+--------------------------------------------------+
| Metric             | Formula & Interpretation                         |
+--------------------+--------------------------------------------------+
| Precision@K        | |relevant in top K| / K                          |
|                    | "Of items shown, how many were relevant?"        |
+--------------------+--------------------------------------------------+
| Recall@K           | |relevant in top K| / |all relevant|             |
|                    | "Of all relevant items, how many did we find?"   |
+--------------------+--------------------------------------------------+
| NDCG@K             | DCG@K / IDCG@K                                   |
|                    | Accounts for position: relevant items higher = better|
+--------------------+--------------------------------------------------+
| Hit Rate@K         | fraction of users with >= 1 relevant item in top K|
+--------------------+--------------------------------------------------+
| MRR                | mean(1 / rank of first relevant item)            |
|                    | "How quickly do we surface a relevant item?"     |
+--------------------+--------------------------------------------------+
| Coverage            | |unique items recommended| / |all items|         |
|                    | "How much of the catalog do we expose?"          |
+--------------------+--------------------------------------------------+
| Diversity (ILD)    | avg pairwise distance among recommended items    |
|                    | Higher = more diverse recommendations            |
+--------------------+--------------------------------------------------+
| Novelty            | avg(-log2(popularity)) of recommended items      |
|                    | Higher = recommending less obvious items         |
+--------------------+--------------------------------------------------+
| Serendipity        | fraction of relevant items not in user's history |
|                    | "Unexpected but useful recommendations"          |
+--------------------+--------------------------------------------------+
```

### Online Evaluation Metrics

```
Primary Metrics (directly optimized):
  - CTR (Click-Through Rate): clicks / impressions
  - Watch Time: total minutes watched per session
  - Completion Rate: avg(watch_duration / item_duration)
  - Conversion Rate: purchases / recommendations (e-commerce)

Secondary Metrics (business health):
  - DAU / MAU ratio: user stickiness
  - Session Length: time per session
  - Sessions per Day: engagement frequency
  - Retention (D1, D7, D30): returning user rates
  - Revenue per User: monetization

Guardrail Metrics (must not degrade):
  - Diversity Score: variety of categories consumed
  - Creator Fairness: distribution of impressions across creators
  - Complaint Rate: reports, blocks, "not interested" clicks
  - Latency: p50 and p99 serving latency
```

### A/B Testing Process

```
1. Hypothesis Formation:
   "Adding real-time session features to ranking model will
    increase watch time by 3%"

2. Power Analysis:
   - Baseline watch time: 30 min/session
   - MDE (Minimum Detectable Effect): 3% = 0.9 min
   - Standard deviation: 15 min
   - Required sample size per group:
     n = (Z_alpha/2 + Z_beta)^2 * 2 * sigma^2 / delta^2
     n = (1.96 + 0.84)^2 * 2 * 225 / 0.81
     n = 7.84 * 450 / 0.81
     n = ~4,356 users per group (minimum)
   - Run for 7+ days to capture weekly patterns

3. Experiment Setup:
   - Control: 5% of traffic (Model v1, no session features)
   - Treatment: 5% of traffic (Model v2, with session features)
   - Production: 90% of traffic (Model v1)

4. Analysis:
   - Wait for minimum duration (7 days)
   - Check statistical significance (p < 0.05)
   - Check practical significance (effect > MDE)
   - Check guardrail metrics
   - Check for novelty effects (compare week 1 vs week 2)

5. Decision:
   - Ship: All metrics positive, statistically significant
   - Iterate: Mixed results, dig deeper
   - Kill: Guardrail metrics degraded
```

### Interleaving Experiments

```
More sensitive than A/B testing for ranking changes:

Standard A/B:
  Group A sees: [A1, A2, A3, A4, A5]  (Ranker A)
  Group B sees: [B1, B2, B3, B4, B5]  (Ranker B)
  Problem: Differences between groups add noise

Interleaving:
  Same user sees merged list from both rankers:
  [A1, B1, A2, B2, A3, ...]

  Credit assignment:
  - If user clicks A1 -> point for Ranker A
  - If user clicks B2 -> point for Ranker B

  Winner = ranker with more credits across all users

  Advantages:
  - 10x more sensitive than A/B (need 10x fewer users)
  - Controls for user-level variance
  - Faster experiment turnaround (days vs weeks)

  Implementation (Team Draft Interleaving):
  1. Both rankers produce ordered lists
  2. Alternate picking from each (like sports draft)
  3. Track which ranker "owns" each position
  4. Attribute engagement to the owning ranker
```

---

## 12. Scaling

### Embedding Index Sharding

```
100M items x 256 dims x 4 bytes = ~100GB per index replica

Sharding Strategy:
  +--------------------------------------------------+
  |              ANN Index Service                    |
  |                                                  |
  | Shard 1: Items 0 - 10M        (10GB)             |
  | Shard 2: Items 10M - 20M      (10GB)             |
  | ...                                               |
  | Shard 10: Items 90M - 100M    (10GB)             |
  |                                                  |
  | Each shard: 2 replicas for availability          |
  | Total: 20 nodes x 10GB = 200GB cluster           |
  +--------------------------------------------------+

Query Flow:
  1. Query all shards in parallel
  2. Each shard returns top-K locally
  3. Merge top-K from all shards -> global top-K
  4. Latency = max(shard latencies) + merge time
  5. ~5ms per shard + 1ms merge = ~6ms total

Refresh Strategy:
  - Build new index in background (shadow index)
  - Atomic swap when ready
  - Zero-downtime index updates
```

### Feature Store Partitioning

```
Redis Cluster for Online Feature Store:

  Total data: ~1.7TB
  Redis nodes: 20 nodes x 100GB each (with overhead)
  Partitioning: Consistent hashing by entity_id
  Replication: 1 primary + 2 replicas per shard

  +--------+  +--------+  +--------+       +--------+
  | Shard 1|  | Shard 2|  | Shard 3| . . . |Shard 20|
  | 0-5%   |  | 5-10%  |  |10-15%  |       |95-100% |
  | hash   |  | hash   |  | hash   |       | hash   |
  +--------+  +--------+  +--------+       +--------+
      |            |            |               |
  +--------+  +--------+  +--------+       +--------+
  |Replica |  |Replica |  |Replica |       |Replica |
  |  1a    |  |  2a    |  |  3a    |       | 20a    |
  +--------+  +--------+  +--------+       +--------+

  Read path: Route to closest replica (geo-aware)
  Write path: Write to primary, async replication
  Failover: Automatic promotion of replica to primary
```

### Model Serving Auto-Scaling

```
+------------------------------------------------------------------+
|              AUTO-SCALING ARCHITECTURE                            |
|                                                                  |
|  Load Balancer                                                   |
|      |                                                           |
|      v                                                           |
|  +-------------------+    Scaling Policy:                        |
|  | Model Server Pool |    - Scale up: GPU utilization > 70%      |
|  |                   |      OR p99 latency > 100ms               |
|  | Min: 10 instances |    - Scale down: GPU utilization < 30%    |
|  | Max: 100 instances|      AND p99 latency < 50ms               |
|  | GPU: A100 / T4    |    - Cooldown: 5 minutes                  |
|  +-------------------+                                           |
|                                                                  |
|  Time-Based Scaling:                                             |
|  00:00-06:00  ->  10 instances (low traffic)                     |
|  06:00-09:00  ->  30 instances (morning ramp)                    |
|  09:00-18:00  ->  50 instances (daytime)                         |
|  18:00-23:00  ->  80 instances (peak evening)                    |
|  23:00-00:00  ->  40 instances (wind down)                       |
|                                                                  |
|  Cost Optimization:                                              |
|  - Use spot/preemptible GPU instances for 60% of fleet           |
|  - Reserve on-demand for baseline capacity                       |
|  - Estimated cost: $50K-100K/month for 36K QPS peak             |
+------------------------------------------------------------------+
```

### Training Data Pipeline Scaling

```
+------------------------------------------------------------------+
|           TRAINING DATA PIPELINE (SPARK / FLINK)                 |
|                                                                  |
|  Raw Events (10B/day, 5TB/day)                                   |
|      |                                                           |
|      v                                                           |
|  +------------------+                                            |
|  | Kafka            |  Partitions: 256                           |
|  | (Event Ingestion)|  Retention: 7 days                         |
|  +------------------+  Throughput: 2GB/sec                       |
|      |                                                           |
|      v                                                           |
|  +------------------+                                            |
|  | Spark Streaming  |  Cluster: 200 executors                    |
|  | (ETL + Feature   |  Memory: 16GB per executor                 |
|  |  Engineering)    |  Process: ~30 min for daily batch          |
|  +------------------+                                            |
|      |                                                           |
|      v                                                           |
|  +------------------+                                            |
|  | Training Data    |  Format: TFRecord / Parquet                |
|  | (S3 / HDFS)      |  Size: ~300TB (30-day window)              |
|  +------------------+  Partitioned by date                       |
|      |                                                           |
|      v                                                           |
|  +------------------+                                            |
|  | Distributed      |  Framework: PyTorch DDP / Horovod          |
|  | Training         |  GPUs: 32x A100 (80GB)                     |
|  | (GPU Cluster)    |  Training time: ~4 hours per full retrain  |
|  +------------------+  Data loading: Petastorm / WebDataset      |
|      |                                                           |
|      v                                                           |
|  +------------------+                                            |
|  | Model Artifact   |  Size: ~2GB per model                      |
|  | (S3 + Registry)  |  Versions: Keep last 30                    |
|  +------------------+                                            |
+------------------------------------------------------------------+
```

---

## 13. Deployment Architecture

```
+===================================================================+
||                    GLOBAL DEPLOYMENT                              ||
||                                                                  ||
||   Region: US-East              Region: EU-West                   ||
||   +-----------------------+   +-----------------------+          ||
||   |  +-------+ +-------+ |   |  +-------+ +-------+ |          ||
||   |  | API   | | API   | |   |  | API   | | API   | |          ||
||   |  | GW 1  | | GW 2  | |   |  | GW 1  | | GW 2  | |          ||
||   |  +---+---+ +---+---+ |   |  +---+---+ +---+---+ |          ||
||   |      |         |     |   |      |         |     |           ||
||   |  +---v---------v---+ |   |  +---v---------v---+ |          ||
||   |  | Recommendation  | |   |  | Recommendation  | |          ||
||   |  | Service Cluster | |   |  | Service Cluster | |          ||
||   |  | (K8s)           | |   |  | (K8s)           | |          ||
||   |  |                 | |   |  |                 | |          ||
||   |  | - Candidate Gen | |   |  | - Candidate Gen | |          ||
||   |  | - Ranking (GPU) | |   |  | - Ranking (GPU) | |          ||
||   |  | - Re-ranking    | |   |  | - Re-ranking    | |          ||
||   |  +-----------------+ |   |  +-----------------+ |          ||
||   |                      |   |                      |           ||
||   |  +-----------------+ |   |  +-----------------+ |          ||
||   |  | Feature Store   | |   |  | Feature Store   | |          ||
||   |  | (Redis Cluster) | |   |  | (Redis Cluster) | |          ||
||   |  | 10 shards       | |   |  | 10 shards       | |          ||
||   |  +-----------------+ |   |  +-----------------+ |          ||
||   |                      |   |                      |           ||
||   |  +-----------------+ |   |  +-----------------+ |          ||
||   |  | ANN Index       | |   |  | ANN Index       | |          ||
||   |  | (FAISS/ScaNN)   | |   |  | (FAISS/ScaNN)   | |          ||
||   |  | 10 shards       | |   |  | 10 shards       | |          ||
||   |  +-----------------+ |   |  +-----------------+ |          ||
||   +-----------------------+   +-----------------------+          ||
||                                                                  ||
||   +----------------------------------------------------------+   ||
||   |              SHARED INFRASTRUCTURE                        |   ||
||   |                                                          |   ||
||   |  +----------------+  +----------------+  +------------+  |   ||
||   |  | Kafka Cluster  |  | Data Lake      |  | Model      |  |   ||
||   |  | (Event Stream) |  | (S3/HDFS)      |  | Registry   |  |   ||
||   |  | Cross-region   |  | Central        |  | (MLflow)   |  |   ||
||   |  | replication    |  | repository     |  |            |  |   ||
||   |  +----------------+  +----------------+  +------------+  |   ||
||   |                                                          |   ||
||   |  +----------------+  +----------------+  +------------+  |   ||
||   |  | GPU Training   |  | Spark Cluster  |  | Monitoring |  |   ||
||   |  | Cluster        |  | (Feature Eng)  |  | (Grafana + |  |   ||
||   |  | (32x A100)     |  |                |  |  PagerDuty)|  |   ||
||   |  +----------------+  +----------------+  +------------+  |   ||
||   +----------------------------------------------------------+   ||
||                                                                  ||
||   Model Deployment Flow:                                         ||
||   Training Cluster -> Model Registry -> Canary (5% traffic)      ||
||   -> Shadow (compare with production) -> Full Rollout             ||
||                                                                  ||
||   Cross-Region Sync:                                             ||
||   - Model artifacts: replicated via S3 cross-region replication  ||
||   - Feature store: async replication with < 1 min lag            ||
||   - ANN index: built centrally, distributed to regions           ||
||   - Events: Kafka MirrorMaker for cross-region streaming         ||
+===================================================================+
```

### Deployment Checklist

```
Pre-deployment:
  [ ] Offline metrics meet thresholds (AUC > 0.80, NDCG@10 > 0.40)
  [ ] Model size within serving budget (< 2GB)
  [ ] Inference latency < 20ms per batch (tested on target hardware)
  [ ] Feature compatibility validated (no missing features)
  [ ] A/B test configured with proper traffic allocation

Canary deployment (5% traffic, 2 hours):
  [ ] No latency regression (p99 < 200ms)
  [ ] No error rate increase (< 0.1%)
  [ ] No guardrail metric degradation

Shadow deployment (parallel with production, 24 hours):
  [ ] Compare predictions with production model
  [ ] Log discrepancies for analysis
  [ ] Verify feature store compatibility

Full rollout:
  [ ] Gradual ramp: 5% -> 25% -> 50% -> 100% over 48 hours
  [ ] Monitor all online metrics continuously
  [ ] Maintain rollback capability (previous model version warm)
```

---

## 14. Common Interview Follow-ups

### How to handle position bias?

```
Problem: Items shown at higher positions get more clicks regardless of
relevance. Training on this data amplifies the bias.

Solutions:

1. Position Feature at Training Time:
   - Include position as a feature during training
   - At inference, set position = 0 (or average position)
   - Model learns to separate position effect from relevance

2. Inverse Propensity Weighting (IPW):
   - Estimate P(click | position) from randomized experiments
   - Weight each training example by 1 / P(click | position)
   - Items at top positions get lower weight

3. Position Bias Model:
   P(click) = P(examine | position) * P(click | examine, relevance)
   - Train separate models for examination and relevance
   - Use only relevance model at serving time

4. Randomized Data Collection:
   - Periodically shuffle a small % of results
   - Use this unbiased data for model evaluation
   - Costly (degrades user experience) but most accurate
```

### How to add diversity to recommendations?

```
Problem: Optimizing purely for relevance leads to repetitive, homogeneous
recommendations (all action movies, all pop songs).

Solutions:

1. Maximal Marginal Relevance (MMR):
   MMR = argmax[lambda * Sim(item, query) - (1-lambda) * max(Sim(item, selected))]
   - Balance relevance with novelty relative to already-selected items
   - lambda = 0.7 (favor relevance, some diversity)

2. Determinantal Point Processes (DPP):
   - Model repulsion between similar items
   - Jointly select a diverse subset with high quality
   - P(subset S) proportional to det(L_S) where L encodes quality + diversity

3. Category-Based Rules:
   - Max 3 items per category in top 20
   - At least 2 categories represented in top 5
   - Enforce creator diversity (max 2 items per creator)

4. Sub-modular Optimization:
   - Formulate as submodular function maximization
   - Greedily add items that maximize marginal utility
   - Utility = relevance + diversity_bonus

5. Post-hoc Re-ranking:
   - Sliding window: ensure diversity within every window of 5 items
   - Swap lower items in if they increase diversity significantly
```

### How to implement "Because you watched X" explanations?

```
Approaches:

1. Retrieval Source Attribution:
   Each candidate tracks which retrieval channel produced it:
   - Item-CF: "Because you watched [source item]"
   - Content-Based: "Because you like [genre/category]"
   - Popularity: "Trending in your area"
   - Creator-Based: "More from [creator name]"

2. Feature Attribution (SHAP/LIME):
   - For ranking model, compute feature importance per prediction
   - Top contributing feature becomes explanation:
     * user_genre_pref x item_genre -> "Matches your comedy preference"
     * user_creator_affinity -> "From a creator you follow"

3. Nearest Neighbor Explanation:
   - Find which items in user history are closest to recommended item
   - "Because you watched [nearest item in embedding space]"

4. Template-Based:
   Templates:
   - "Because you watched {item_title}"
   - "Popular in {user_country}"
   - "Trending in {category}"
   - "Fans of {similar_item} also enjoyed this"
   - "New from {creator_name}"

   Selection logic:
   if retrieval_source == "item_cf":
       explanation = f"Because you watched {source_item.title}"
   elif retrieval_source == "content_based":
       explanation = f"Because you enjoy {item.category}"
   elif retrieval_source == "popularity":
       explanation = f"Trending in {user.country}"
```

### How to handle the filter bubble problem?

```
Problem: Recommendations reinforce existing preferences, limiting
exposure to new content and potentially creating echo chambers.

Solutions:

1. Diversity Injection (see above)
   - Force categorical diversity in every recommendation set
   - Ensures users see content outside their comfort zone

2. Serendipity Optimization:
   - Add serendipity as an objective in multi-task ranking
   - P(serendipity) = P(relevant) * (1 - P(expected))
   - Reward items that are relevant but unexpected

3. Interest Exploration:
   - Periodically show items from adjacent categories
   - If user likes "sci-fi action", try "sci-fi drama"
   - Track exploration success rate, adapt exploration radius

4. Content Understanding:
   - Use content features to find items that bridge categories
   - "This documentary combines history (your interest)
     with cooking (new topic)"

5. Social Proof Diversification:
   - "Users similar to you also enjoyed [different category]"
   - Leverages collaborative signals for safe exploration

6. Explicit Controls:
   - Let users adjust recommendation preferences
   - "Show me more diverse content" slider
   - Category blocking and boosting controls

Measurement:
  - Track user content category distribution over time
  - Healthy: category entropy should not decrease
  - Alert if category concentration exceeds threshold
```

### How to balance exploration vs exploitation?

```
Framework: Multi-Armed Bandit with Contextual Features

                    Exploitation
                   (Show what works)
                        |
    Pure Exploitation ---+--- Pure Exploration
    (Always top-ranked)  |   (Random items)
                        |
                    Exploration
                  (Try new things)

Implementation:

1. Epsilon-Greedy with Decay:
   epsilon(t) = max(0.01, 0.1 * decay^t)
   - Start with 10% exploration, decay to 1%
   - Simple but effective

2. Thompson Sampling (Recommended):
   For each item i:
     alpha_i = successes + 1
     beta_i = failures + 1
     sampled_reward = Beta(alpha_i, beta_i).sample()
   Rank by sampled_reward

   Properties:
   - Automatically explores uncertain items
   - Converges to exploitation as confidence grows
   - Handles non-stationary environments

3. Contextual Bandits (LinUCB):
   For each item i given context x:
     predicted_reward = theta_i^T * x
     confidence = alpha * sqrt(x^T * A_i^-1 * x)
     score = predicted_reward + confidence

   - Uses user/item context for smarter exploration
   - More efficient than context-free bandits

Budget Allocation:
  - 85% exploitation (top-ranked by model)
  - 10% Thompson Sampling exploration (uncertain items)
  - 5% random exploration (new/cold-start items)
```

### How to measure long-term user satisfaction?

```
Problem: Optimizing for clicks/watch-time can lead to clickbait and
addictive patterns that hurt long-term satisfaction.

Short-term Metrics (easy to measure, can be misleading):
  - CTR, watch time, session length
  - Can be gamed by clickbait, autoplay, dark patterns

Long-term Metrics (harder to measure, more meaningful):
  - D7/D30 retention: Do users come back?
  - Net Promoter Score (NPS): Would they recommend?
  - Subscription renewal rate
  - Survey-based satisfaction scores
  - Content quality ratings (post-watch)
  - Time well spent (self-reported)

Measurement Approaches:

1. Holdout Experiments (Gold Standard):
   - Run A/B test for 30+ days
   - Measure retention, not just engagement
   - "Model A has higher CTR but lower D30 retention"
   - Choose the model with better long-term outcomes

2. Delayed Feedback Modeling:
   - Train models on retention as a label (not just clicks)
   - Weight recent retention signals higher
   - Multi-task: optimize click + long-term satisfaction jointly

3. User Surveys:
   - Sample 1% of users for post-session surveys
   - "How satisfied are you with today's recommendations?" (1-5)
   - Correlate survey scores with model changes

4. Proxy Metrics:
   - Voluntary watch time (exclude autoplay)
   - Re-watch rate (users revisiting content)
   - Save/bookmark rate (intent to return)
   - Organic search within platform (exploring)
   - Ratio of positive actions (likes) to negative (skip, hide)

5. Counter-Metrics:
   Monitor and constrain harmful engagement patterns:
   - Session length > 3 hours (potential addiction)
   - Late-night usage spikes (sleep disruption)
   - Regret signals ("hide" or "not interested" after click)

Composite Satisfaction Score:
  satisfaction = w1 * retention_7d
               + w2 * voluntary_watch_pct
               + w3 * like_to_skip_ratio
               + w4 * survey_score
               - w5 * regret_rate
               - w6 * complaint_rate
```

---

## Summary: Key Design Decisions

```
+--------------------+----------------------+---------------------------+
| Decision           | Choice               | Rationale                 |
+--------------------+----------------------+---------------------------+
| Candidate Gen      | Two-Tower + ANN      | Scales to 100M items,     |
|                    | (FAISS/ScaNN)        | <10ms retrieval           |
+--------------------+----------------------+---------------------------+
| Ranking Model      | Deep Multi-Task      | Captures complex feature  |
|                    | (Wide & Deep variant)| interactions, multi-obj   |
+--------------------+----------------------+---------------------------+
| Feature Store      | Redis (online) +     | <1ms reads, point-in-time |
|                    | S3/Hive (offline)    | correctness for training  |
+--------------------+----------------------+---------------------------+
| Event Processing   | Kafka + Flink        | Real-time feature updates |
|                    |                      | within seconds            |
+--------------------+----------------------+---------------------------+
| Training           | Daily full retrain + | Balance freshness with    |
|                    | Hourly embed updates | training cost             |
+--------------------+----------------------+---------------------------+
| Exploration        | Thompson Sampling    | Principled uncertainty-   |
|                    |                      | based exploration         |
+--------------------+----------------------+---------------------------+
| Cold Start         | Content features +   | Graceful degradation,     |
|                    | Popularity + Bandits | progressive personalization|
+--------------------+----------------------+---------------------------+
| Serving            | Triton Inference     | GPU batching, multi-model,|
|                    | Server               | <50ms ranking latency     |
+--------------------+----------------------+---------------------------+
| A/B Testing        | Interleaving +       | Sensitive detection,      |
|                    | Long-term holdouts   | long-term measurement     |
+--------------------+----------------------+---------------------------+
| Deployment         | Multi-region with    | <100ms latency globally,  |
|                    | canary rollout       | safe deployments          |
+--------------------+----------------------+---------------------------+
```
