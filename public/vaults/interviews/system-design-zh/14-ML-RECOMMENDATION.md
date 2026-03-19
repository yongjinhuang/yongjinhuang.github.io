# 设计 ML 推荐系统 (Netflix/YouTube/TikTok)

## 1. 需求澄清

### 功能需求

| 需求         | 描述                                             |
| ------------ | ------------------------------------------------ |
| 个性化推荐   | 基于用户历史和偏好为每位用户量身定制内容         |
| 多种推荐类型 | 首页信息流、"相关内容"、"热门趋势"、"因为你看过" |
| 实时交互追踪 | 实时捕获点击、浏览、观看时长、点赞、分享         |
| 多格式内容   | 根据平台支持视频、文章、商品、音乐               |
| A/B testing  | 对模型、特征和排序策略进行实验                   |
| 可解释性     | 提供推荐理由（"因为你看过 X"）                   |
| 搜索集成     | 将个性化搜索结果与推荐内容融合                   |

### 非功能需求

| 需求   | 目标                          |
| ------ | ----------------------------- |
| 延迟   | 端到端推荐服务 < 200ms (p99)  |
| 可用性 | 服务路径 99.99% 正常运行时间  |
| 规模   | 5亿月活跃用户                 |
| 吞吐量 | 每天处理 100亿交互事件        |
| 冷启动 | 为全新用户/内容提供合理的推荐 |
| 新鲜度 | 在数分钟内纳入用户行为        |
| 多样性 | 避免信息茧房；展示多样化内容  |
| 公平性 | 避免跨人群的偏见放大          |

### 规模估算

```
用户:            5亿 MAU, 1亿 DAU
内容:            1亿总内容, 每天10万新内容
交互:            每天100亿事件
                  = 100亿 / 86400 = ~115K 事件/秒 (平均)
                  = ~350K 事件/秒 (峰值, 3倍)

推荐请求:
  - 1亿 DAU x 10 次会话/天 = 10亿请求/天
  - = ~12K QPS (平均), ~36K QPS (峰值)

Feature Store:
  - 用户特征:  5亿用户 x 2KB = 1TB
  - 内容特征:  1亿内容 x 1KB = 100GB
  - 用户 embeddings: 5亿 x 256 维 x 4 字节 = 512GB
  - 内容 embeddings: 1亿 x 256 维 x 4 字节 = 100GB
  - 在线存储总计: ~1.7TB (适合分布式 Redis 集群)

训练数据:
  - 每天100亿事件 x 500 字节/事件 = 5TB/天 原始数据
  - 30天训练窗口 = 150TB
  - 特征增强后的训练数据: ~300TB

模型服务:
  - 候选生成: 36K QPS x ~5ms = 需要 ~180 核
  - 排序模型: 36K QPS x ~20ms = 需要 ~720 核
  - ANN 索引: 1亿内容 x 256 维 x 4 字节 = 每副本 ~100GB
```

---

## 2. 推荐方法概述

### 2.1 Content-Based Filtering（基于内容的过滤）

使用内容属性（类型、导演、标签）来推荐与用户已喜欢内容相似的项目。

```
用户喜欢: "Inception" (科幻, 惊悚, Nolan)
                |
                v
    查找具有相似属性的内容
                |
                v
推荐: "Interstellar", "The Matrix", "Tenet"
```

**优点**: 新内容无冷启动问题（只需内容特征），解释透明。
**缺点**: 发现能力有限，无法捕获协同信号，特征工程工作量大。

### 2.2 Collaborative Filtering（协同过滤）

#### User-Based CF（基于用户的协同过滤）

```
用户 A 喜欢: Item 1, Item 2, Item 3
用户 B 喜欢: Item 1, Item 2, Item 4
                |
                v
    用户 A 和 B 相似
                |
                v
    向用户 A 推荐 Item 4
```

#### Item-Based CF（基于物品的协同过滤）

```
Item 1 被以下用户喜欢: 用户 A, 用户 B, 用户 C
Item 5 被以下用户喜欢: 用户 A, 用户 B, 用户 D
                |
                v
    Item 1 和 Item 5 相似
                |
                v
    向用户 C 推荐 Item 5
```

#### Matrix Factorization（矩阵分解）(SVD, ALS)

```
用户-内容交互矩阵 R (稀疏):

         Item1  Item2  Item3  Item4  Item5
User A   [ 5     3      ?      1      ? ]
User B   [ 4     ?      ?      1      ? ]
User C   [ 1     1      ?      5      ? ]
User D   [ ?     ?      5      4      ? ]

分解: R ≈ U x V^T

U (用户 embeddings):     V (内容 embeddings):
  5亿 x k               1亿 x k
  (k = 128-256)          (k = 128-256)

预测评分: r(u,i) = U[u] . V[i]^T
```

### 2.3 深度学习方法

#### Two-Tower Model（双塔模型）

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
  (记忆化)                    (泛化)
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
  (二阶       (高阶
  交互)       交互)
    |         |
    +----+----+
         |
    Prediction
```

#### 基于 Transformer 的模型 (BERT4Rec)

```
  用户交互序列: [Item3, Item7, Item1, Item9, [MASK]]
                                |       |       |      |      |
                          [Embedding + Position Encoding]
                                |       |       |      |      |
                          [Multi-Head Self-Attention x N]
                                |       |       |      |      |
                          [Feed-Forward Network]
                                        |
                              预测被遮盖的内容
```

### 2.4 对比表

| 方法                 | 复杂度 | 冷启动   | 可扩展性 | 延迟 | 质量 |
| -------------------- | ------ | -------- | -------- | ---- | ---- |
| Content-Based        | 低     | 内容: 好 | 好       | 低   | 中等 |
|                      |        | 用户: 差 |          |      |      |
| User-Based CF        | 中     | 差       | 差 (N^2) | 中   | 中等 |
| Item-Based CF        | 中     | 差       | 一般     | 中   | 中等 |
| Matrix Factorization | 中     | 差       | 好       | 低   | 好   |
| Two-Tower            | 高     | 一般     | 优秀     | 低   | 好   |
| Wide & Deep          | 高     | 一般     | 好       | 中   | 很好 |
| DeepFM               | 高     | 一般     | 好       | 中   | 很好 |
| BERT4Rec             | 很高   | 差       | 一般     | 高   | 很好 |
| Hybrid               | 很高   | 好       | 好       | 中   | 最佳 |

**行业选择:**

- **Netflix**: Two-Tower 用于候选生成 + 深度排序模型
- **YouTube**: Two-Tower（候选生成）+ Wide & Deep（排序）
- **TikTok**: Multi-gate mixture of experts + 实时特征

---

## 3. 高层架构

```
+------------------------------------------------------------------+
|                        客户端层                                    |
|   [移动应用]    [网页浏览器]    [智能电视]    [API 客户端]          |
+--------|--------------------|-------------|-------------|--------+
         |                    |             |             |
         v                    v             v             v
+------------------------------------------------------------------+
|                       API Gateway / CDN                           |
|            (限流, 认证, 负载均衡)                                  |
+------------------------------------------------------------------+
         |                                        |
         v                                        v
+------------------------+          +----------------------------+
| 在线服务路径           |          | 事件采集路径               |
|                        |          |                            |
| +--------------------+ |          | +------------------------+ |
| | Feature Store      | |          | | Kafka / Kinesis        | |
| | (Redis Cluster)    | |          | | (事件流)               | |
| +--------------------+ |          | +------------------------+ |
|          |              |          |      |            |        |
|          v              |          |      v            v        |
| +--------------------+ |          | +---------+ +-----------+  |
| | 候选               | |          | | Flink   | | Spark     |  |
| | 生成               | |          | | (实时   | | Streaming |  |
| | (ANN Index)        | |          | | 特征    | | (批量     |  |
| +--------------------+ |          | | 更新)   | | 特征)     |  |
|          |              |          | +---------+ +-----------+  |
|          v              |          +----------------------------+
| +--------------------+ |                     |
| | 排序模型           | |                     v
| | (GPU Serving)      | |          +----------------------------+
| +--------------------+ |          | 离线训练路径               |
|          |              |          |                            |
|          v              |          | +------------------------+ |
| +--------------------+ |          | | Data Lake (S3/HDFS)    | |
| | 重排序 &           | |          | | - 原始事件             | |
| | 业务逻辑           | |          | | - 训练数据集           | |
| +--------------------+ |          | | - 特征快照             | |
|          |              |          | +------------------------+ |
|          v              |          |          |                 |
| +--------------------+ |          | +------------------------+ |
| | 响应组装           | |          | | 训练 Pipeline          | |
| +--------------------+ |          | | (GPU 集群)             | |
+------------------------+          | | - 特征工程             | |
                                    | | - 模型训练             | |
                                    | | - 评估                 | |
                                    | +------------------------+ |
                                    |          |                 |
                                    | +------------------------+ |
                                    | | Model Registry         | |
                                    | | (MLflow / SageMaker)   | |
                                    | +------------------------+ |
                                    +----------------------------+
```

### 三条处理路径

```
1. 在线（同步, < 200ms）:
   请求 -> 特征查询 -> 候选生成 -> 排序 -> 重排序 -> 响应

2. 近实时（秒到分钟级）:
   用户事件 -> Kafka -> Flink -> 更新在线特征 -> 更新会话

3. 离线（小时级）:
   事件 -> Data Lake -> 特征工程 -> 模型训练 -> 部署
```

---

## 4. 多阶段推荐 Pipeline

### 4.1 候选生成（召回阶段）

**目标**: 在 < 10ms 内从 1亿内容缩小到 500-1000 个候选。

```
                    1亿总内容
                          |
          +---------------+---------------+
          |               |               |
    +-----v-----+  +-----v-----+  +------v------+
    | 基于 ANN  |  | 基于 CF   |  | 基于规则    |
    | 检索      |  | 检索      |  | 检索        |
    | (200)     |  | (200)     |  | (200)       |
    +-----------+  +-----------+  +-------------+
          |               |               |
          +-------+-------+-------+-------+
                  |               |
           +------v------+ +-----v--------+
           | 基于热度    | | 基于趋势     |
           | (100)       | | (100)        |
           +-------------+ +--------------+
                  |               |
                  +-------+-------+
                          |
                    合并 & 去重
                          |
                  ~500-1000 个候选
```

#### ANN (Approximate Nearest Neighbor) 检索

```
预计算:
  - 用户 embedding: E_u = UserTower(user_features)    -> 256维向量
  - 内容 embeddings: E_i = ItemTower(item_features)   -> 256维向量

服务时:
  1. 从缓存查找用户 embedding E_u
  2. 查询 ANN 索引: top-K = ANN_search(E_u, K=200)
  3. 返回 K 个最近的内容 ID

ANN 索引结构 (HNSW):
  Layer 3:  [A] -------------- [B]
  Layer 2:  [A] ---- [C] ---- [B] ---- [D]
  Layer 1:  [A]-[E]-[C]-[F]-[B]-[G]-[D]-[H]
  Layer 0:  [A][I][E][J][C][K][F][L][B][M][G][N][D][O][H][P]

  搜索: 从顶层开始，贪心下降
  时间复杂度: O(log N)，高召回率
```

#### 多路检索通道

| 通道          | 来源           | 数量 | 延迟 |
| ------------- | -------------- | ---- | ---- |
| Two-Tower ANN | 用户 embedding | 200  | 5ms  |
| Item-Based CF | 最近交互       | 200  | 3ms  |
| User-Based CF | 相似用户       | 100  | 5ms  |
| 热度          | 全局趋势       | 100  | 1ms  |
| Content-Based | 喜欢的内容特征 | 100  | 3ms  |
| 编辑精选      | 精选列表       | 50   | 1ms  |
| 地理/上下文   | 位置, 时间     | 50   | 2ms  |

所有通道**并行**执行，结果合并去重。

### 4.2 排序（打分阶段）

**目标**: 使用丰富的特征集对 500-1000 个候选精确打分。延迟预算: ~50ms。

```
对每个候选内容:

  +------------------+------------------+-------------------+
  |   用户特征       |  内容特征        | 上下文特征        |
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
  |              特征交互层                                    |
  |  (交叉特征: user_genre x item_genre,                      |
  |   user_avg_duration x item_duration, 等)                   |
  +----------------------------------------------------------+
                          |
                          v
  +----------------------------------------------------------+
  |              深度神经网络                                   |
  |  输入 (拼接): 1024维                                       |
  |  隐藏层: 1024 -> 512 -> 256 -> 128                         |
  |  激活函数: ReLU + BatchNorm + Dropout                      |
  +----------------------------------------------------------+
                          |
                          v
  +----------------------------------------------------------+
  |              多任务输出头                                   |
  |  P(click)  |  P(watch>50%)  |  P(like)  |  P(share)       |
  +----------------------------------------------------------+
                          |
                          v
  综合分数 = w1*P(click) + w2*P(watch) + w3*P(like) + w4*P(share)
```

#### 特征工程深入

```
特征类别:

1. 用户静态特征（每日更新）:
   - 人口统计: age_bucket, gender, country, language
   - 账户: account_age, subscription_tier
   - 偏好: favorite_genres (top-5), preferred_length

2. 用户动态特征（实时更新）:
   - 最近观看: last_10_items, last_10_categories
   - 会话: items_viewed_this_session, session_duration
   - 互动: rolling_7d_CTR, rolling_7d_watch_time

3. 内容静态特征:
   - 元数据: category, tags, language, duration, creator_id
   - 内容: title_embedding, thumbnail_embedding, description_embedding
   - 质量: production_quality_score

4. 内容动态特征（每小时更新）:
   - 热度: view_count_24h, like_ratio_7d, share_count_24h
   - 新鲜度: hours_since_upload, trending_score

5. 交叉特征（服务时计算）:
   - user_genre_pref x item_genre (匹配分数)
   - user_avg_watch_duration x item_duration (比率)
   - user_language x item_language (二元匹配)
   - user_creator_affinity[item.creator_id] (历史互动)

6. 上下文特征:
   - 时间: hour_of_day, day_of_week, is_weekend, is_holiday
   - 设备: device_type, screen_size, connection_speed
   - 会话: position_in_session, time_since_last_interaction
```

### 4.3 重排序（业务逻辑阶段）

**目标**: 在排序结果之上应用业务规则、多样性和探索。延迟: ~10ms。

```
排序后的候选（按分数排名前 100）
         |
         v
+---------------------+
| 多样性注入          |  -- 确保前 20 个结果中每个类别不超过 3 个
+---------------------+
         |
         v
+---------------------+
| 新鲜度加权          |  -- < 24h 的内容分数提升 1.2x
+---------------------+     < 1h 的内容分数提升 1.5x
         |
         v
+---------------------+
| 业务规则            |  -- 在位置 3, 7 插入推广内容
+---------------------+     过滤年龄限制内容
         |                   抑制已观看内容
         v
+---------------------+
| 探索                |  -- 保留 10% 的位置用于探索
+---------------------+     对新内容使用 Thompson Sampling
         |
         v
+---------------------+
| 位置偏差            |  -- 校准位置偏差的分数
| 校正                |     （顶部位置的内容无论如何都会获得更多点击）
+---------------------+
         |
         v
  最终排序列表（前 50）
```

#### 探索与利用策略

```
1. Epsilon-Greedy:
   - 以 (1-epsilon) 的概率: 展示排名最高的内容
   - 以 epsilon 的概率: 展示随机内容
   - 典型 epsilon: 0.05-0.10

2. Thompson Sampling:
   - 为每个内容维护 Beta(alpha, beta) 分布
   - 从分布中采样，按采样值排名
   - 不确定性越高 -> 探索概率越高

   对于内容 i, alpha=点击数, beta=展示数-点击数:
   sampled_score = Beta(alpha_i + 1, beta_i + 1).sample()

3. Upper Confidence Bound (UCB):
   score_i = estimated_reward_i + c * sqrt(ln(N) / n_i)
   其中 N = 总展示次数, n_i = 内容 i 的展示次数

4. Contextual Bandits:
   - 训练一个模型，输入 (user, item, context) -> reward
   - 使用 LinUCB 或神经网络变体平衡探索/利用
```

---

## 5. Feature Store 设计

```
+-------------------------------------------------------------------+
|                       FEATURE STORE                                |
|                                                                    |
|  +--------------------+          +--------------------+            |
|  | 在线存储           |          | 离线存储           |            |
|  | (Redis Cluster)    |          | (S3 + Hive/Iceberg)|            |
|  |                    |          |                    |             |
|  | - 用户特征         |          | - 历史             |            |
|  |   (1TB, <1ms)      |          |   特征             |            |
|  | - 内容特征         |          | - 训练数据         |            |
|  |   (100GB, <1ms)    |          |   (300TB)          |            |
|  | - 实时             |          | - 特征             |            |
|  |   计数器           |          |   快照             |            |
|  +--------^-----------+          +--------^-----------+            |
|           |                               |                        |
|  +--------+-----------+          +--------+-----------+            |
|  | 流处理 Pipeline    |          | 批处理 Pipeline    |            |
|  | (Flink)            |          | (Spark)            |            |
|  |                    |          |                    |             |
|  | - 实时             |          | - 每日特征         |            |
|  |   聚合             |          |   计算             |            |
|  | - 滑动窗口         |          | - 历史             |            |
|  |   特征             |          |   聚合             |            |
|  | - 会话特征         |          | - 训练数据         |            |
|  |                    |          |   生成             |            |
|  +--------^-----------+          +--------^-----------+            |
|           |                               |                        |
|  +--------+-------------------------------+-----------+            |
|  |               事件流 (Kafka)                       |            |
|  |  Topics: clicks, views, watch_time, likes, shares  |            |
|  +----------------------------------------------------+            |
+-------------------------------------------------------------------+
```

### 特征计算 Pipeline

```
原始事件:
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

实时特征更新:
  user:u123:session_watch_count     += 1
  user:u123:session_total_duration  += 180
  user:u123:last_watched_category   = "comedy"
  user:u123:rolling_1h_watch_count  += 1
  item:v456:view_count_1h           += 1
  item:v456:completion_rate_1h      = running_avg(180/240)

        |
        v (写入 Redis)

在线 Feature Store (Redis):
  Key: "user_features:u123"
  Value: {
    session_watch_count: 5,
    rolling_1h_watch_count: 12,
    last_watched_category: "comedy",
    ...
  }

        |
        v (Spark 批处理 - 每日)

离线 Feature Store (S3/Hive):
  - user:u123:rolling_7d_avg_watch_time = 23.5 min
  - user:u123:top_categories_30d = ["comedy", "drama", "sci-fi"]
  - user:u123:creator_affinity = {c1: 0.8, c2: 0.6, ...}
```

### Point-in-Time 正确性

```
错误（数据泄露）:
  在时间 T 的训练样本使用了时间 T+1 计算的特征

  时间线:     T-2    T-1    T(事件)   T+1    T+2
  特征:       -------[用于训练]--------->
                                          ^
                                     泄露了未来数据！

正确（Point-in-Time Join）:
  在时间 T 的训练样本使用时间 T 时的特征

  时间线:     T-2    T-1    T(事件)   T+1    T+2
  特征:       ------>|
                       ^
                  T-1 时刻的特征快照

实现:
  - 存储带有时间戳的特征快照
  - 训练 pipeline 将事件与特征快照进行 join
  - WHERE feature_timestamp < event_timestamp
```

---

## 6. 训练 Pipeline

```
+-------------------------------------------------------------------+
|                     训练 PIPELINE                                  |
|                                                                    |
|  +------------------+     +------------------+                     |
|  | 数据收集         |     | 特征              |                     |
|  | & 采样           |---->| 工程              |                     |
|  | (Spark)          |     | (Spark + Flink)  |                     |
|  +------------------+     +------------------+                     |
|                                    |                               |
|                                    v                               |
|  +------------------+     +------------------+                     |
|  | 负采样           |     | 训练数据          |                     |
|  |                  |---->| 验证              |                     |
|  +------------------+     +------------------+                     |
|                                    |                               |
|                                    v                               |
|  +------------------+     +------------------+                     |
|  | 分布式           |     | 超参数            |                     |
|  | 训练             |<--->| 调优              |                     |
|  | (GPU 集群)       |     | (Optuna/Ray)     |                     |
|  +------------------+     +------------------+                     |
|           |                                                        |
|           v                                                        |
|  +------------------+     +------------------+                     |
|  | 离线             |     | Model Registry   |                     |
|  | 评估             |---->| (MLflow)         |                     |
|  +------------------+     +------------------+                     |
|                                    |                               |
|                                    v                               |
|  +------------------+     +------------------+                     |
|  | Shadow / Canary  |     | 生产环境          |                     |
|  | 部署             |---->| 发布              |                     |
|  +------------------+     +------------------+                     |
+-------------------------------------------------------------------+
```

### 隐式反馈 vs 显式反馈

```
显式反馈:
  - 评分（1-5 星）
  - 点赞/踩
  - "不感兴趣" 点击
  优点: 信号明确
  缺点: 稀疏，有偏差（用户倾向于评价极端体验）

隐式反馈:
  - 点击、浏览、观看时长
  - 滚动深度、停留时间
  - 购买、加入购物车
  - 分享、收藏、评论
  优点: 数据丰富
  缺点: 噪声大，难以解读（他们是在看还是睡着了？）

隐式反馈的标签构建:
  正样本: watch_time / total_duration > 0.7
            或 点赞
            或 分享
  负样本: watch_time / total_duration < 0.1
            或 点击了"不感兴趣"
  忽略:  其他所有（模糊不清的）
```

### 负采样策略

```
问题: 在隐式反馈中，我们只观察到正向交互。
         如何生成负样本？

1. 随机负采样:
   - 对于每个正样本 (user, item)，采样 K 个随机内容作为负样本
   - K 通常为 4-10
   - 成本低但可能采到假负样本（用户实际会喜欢的内容）

2. 基于热度的加权采样:
   - 按内容热度^0.75 比例采样负样本
   - 更热门的内容更可能是真正的负样本
   - P(item_j 作为负样本) 正比于 freq(item_j)^0.75

3. Hard Negative Mining:
   - 使用当前模型找到排名高但未被点击的内容
   - 混合: 50% 随机负样本 + 50% hard negatives
   - 提高模型在困难案例上的区分能力

4. In-Batch Negatives（用于 Two-Tower）:
   - 使用同一训练批次中的其他内容作为负样本
   - 高效: 不需要额外计算
   - 批量大小 1024 给出 1023 个负样本/正样本

采样比例影响:
  比例 1:1   -> 欠拟合（负样本太少）
  比例 1:4   -> 大多数情况的良好平衡
  比例 1:10  -> 对大型内容目录更好
  比例 1:100 -> 在负样本上过拟合
```

### 模型评估: 离线指标

```
排序指标:

1. AUC (Area Under ROC Curve):
   - 正样本排名高于负样本的概率
   - 目标: > 0.80

2. NDCG@K (Normalized Discounted Cumulative Gain):
   NDCG@K = DCG@K / IDCG@K
   DCG@K  = sum(i=1 to K) of (2^rel_i - 1) / log2(i + 1)
   - 衡量考虑位置的排序质量
   - 目标: > 0.40 at K=10

3. MAP@K (Mean Average Precision):
   AP@K = (1/min(m,K)) * sum(k=1 to K) of P(k) * rel(k)
   MAP  = mean of AP across all users
   - 目标: > 0.30 at K=10

4. Hit Rate@K:
   - 至少有一个相关内容出现在前 K 中的用户比例
   - 目标: > 0.85 at K=20

5. Coverage（覆盖率）:
   - 曾被推荐过的内容比例
   - 目标: > 0.60（避免热度偏差）

6. Diversity（多样性）(Intra-List Distance):
   ILD = 推荐内容之间的平均成对距离
   - 越高越多样
```

### 训练调度

```
+----------------------------------+------------------+------------------+
| 组件                             | 重训练频率       | 原因             |
+----------------------------------+------------------+------------------+
| 候选生成 (Two-Tower)             | 每日             | 用户/内容 embeds |
| 排序模型                         | 每日             | 特征漂移         |
| 内容 embeddings                  | 每小时（新内容） | 冷启动           |
| 用户 embeddings                  | 每 6 小时        | 捕获趋势         |
| ANN 索引                         | 每 6 小时        | 新 embeddings    |
| 特征聚合（批处理）               | 每日             | 历史统计         |
+----------------------------------+------------------+------------------+
```

---

## 7. 模型服务

### 基于 Embedding 的服务架构

```
+----------------------------------------------------------------+
|                    模型服务层                                    |
|                                                                |
|  +-------------------+     +-----------------------------+     |
|  | 用户 Embedding    |     | ANN 索引服务                |     |
|  | 缓存 (Redis)      |     | (FAISS / ScaNN)             |     |
|  |                   |     |                             |     |
|  | user_id -> 256d   |     | 1亿内容 embeddings          |     |
|  | TTL: 6 小时       |     | HNSW 索引                   |     |
|  | 命中率: ~95%      |     | 分片至 10 个节点            |     |
|  +-------------------+     +-----------------------------+     |
|           |                          |                         |
|           v                          v                         |
|  +---------------------------------------------------+        |
|  | 候选生成服务                                       |        |
|  | - 查找用户 embedding（缓存或计算）                 |        |
|  | - 查询 ANN 索引获取 top-200 候选                   |        |
|  | - 与 CF、热度、趋势候选合并                        |        |
|  | - 输出: ~500-1000 个候选内容 ID                    |        |
|  +---------------------------------------------------+        |
|                          |                                     |
|                          v                                     |
|  +---------------------------------------------------+        |
|  | 特征组装服务                                       |        |
|  | - 从 Redis 批量查找用户特征                        |        |
|  | - 批量查找所有候选的内容特征                       |        |
|  | - 计算交叉特征                                     |        |
|  | - 为排序模型组装特征向量                           |        |
|  +---------------------------------------------------+        |
|                          |                                     |
|                          v                                     |
|  +---------------------------------------------------+        |
|  | 排序模型服务 (TF Serving / Triton)                 |        |
|  | - GPU 加速推理                                     |        |
|  | - 批量打分: 单次前向传播处理 500 个内容            |        |
|  | - 多任务输出: P(click), P(watch), P(like)          |        |
|  | - 使用业务权重的综合分数                           |        |
|  +---------------------------------------------------+        |
|                          |                                     |
|                          v                                     |
|  +---------------------------------------------------+        |
|  | 重排序服务                                         |        |
|  | - 应用多样性、新鲜度、业务规则                     |        |
|  | - 最终排序的 50 个内容列表                         |        |
|  +---------------------------------------------------+        |
+----------------------------------------------------------------+
```

### ANN 搜索对比

```
+------------------+----------+-----------+--------+-----------+
| 库               | 构建     | 查询      | 内存   | Recall@100|
|                  | 时间     | 时间      |        |           |
+------------------+----------+-----------+--------+-----------+
| FAISS (IVF-PQ)   | ~1 小时  | ~1ms      | 10GB   | 95%       |
| FAISS (HNSW)     | ~2 小时  | ~0.5ms    | 50GB   | 99%       |
| ScaNN (Google)   | ~1 小时  | ~0.3ms    | 15GB   | 97%       |
| Annoy (Spotify)  | ~30 分钟 | ~1ms      | 20GB   | 90%       |
| Milvus           | ~1 小时  | ~1ms      | 30GB   | 96%       |
| Pinecone (SaaS)  | 托管     | ~5ms      | N/A    | 98%       |
+------------------+----------+-----------+--------+-----------+

注: 基准测试为 1亿向量, 256 维。
ScaNN 和 FAISS HNSW 是大规模场景中最常用的。
```

### 批处理和缓存策略

```
1. 请求批处理:
   - 在 ~5ms 内累积排序请求
   - 将多个用户的候选批量合并到单次 GPU 前向传播中
   - 吞吐量: 每 GPU 10K -> 50K 内容/秒

2. Embedding 缓存:
   - 用户 embeddings: Redis 缓存, TTL = 6h, ~95% 命中率
   - 内容 embeddings: 缓存热门内容, TTL = 1h
   - 缓存未命中: 使用 Feature Store + 模型实时计算

3. 结果缓存:
   - 完整推荐结果: 缓存 5 分钟
   - 新用户交互时失效
   - 命中率: ~30%（个性化限制了缓存效果）

4. 预计算:
   - 为前 1000万活跃用户预计算推荐
   - 每 15 分钟刷新
   - 从缓存提供服务，其余用户回退到实时计算

延迟分解 (p50):
  特征查询:        5ms
  候选生成:        8ms (ANN) + 5ms (CF) = 13ms (并行)
  特征组装:       10ms
  排序 (GPU):     15ms
  重排序:          3ms
  网络开销:        5ms
  --------------------------------
  总计:          ~51ms（远在 200ms 预算内）

延迟分解 (p99):
  特征查询:       15ms
  候选生成:       25ms
  特征组装:       30ms
  排序 (GPU):     40ms
  重排序:          5ms
  网络开销:       15ms
  --------------------------------
  总计:          ~130ms（在 200ms 预算内）
```

### A/B Testing 框架

```
+-----------------------------------------------------------+
|                   A/B TESTING 系统                         |
|                                                           |
|  用户请求                                                 |
|      |                                                    |
|      v                                                    |
|  +------------------+                                     |
|  | 实验             |  一致性哈希:                        |
|  | 分配             |  bucket = hash(user_id) % 100       |
|  | 服务             |                                     |
|  +------------------+                                     |
|      |                                                    |
|      +------- bucket 0-4:   对照组 (Model v1)            |
|      +------- bucket 5-9:   实验组 A (Model v2)          |
|      +------- bucket 10-14: 实验组 B (Model v3)          |
|      +------- bucket 15-99: 生产环境 (Model v1)          |
|                                                           |
|  指标收集:                                                |
|  - 每桶 CTR、观看时长、留存                               |
|  - 统计显著性检验（t检验、卡方检验）                      |
|  - 最少 7 天实验时长                                      |
|  - 每桶最少 10万用户                                      |
|                                                           |
|  护栏指标（超出时自动回滚）:                              |
|  - 收入下降 > 2%                                          |
|  - 用户投诉增加 > 50%                                     |
|  - 延迟 p99 > 300ms                                       |
+-----------------------------------------------------------+
```

---

## 8. 数据模型

### 用户表

```sql
CREATE TABLE users (
    user_id         BIGINT PRIMARY KEY,
    username        VARCHAR(255),
    email           VARCHAR(255),
    country         VARCHAR(2),
    language        VARCHAR(5),
    age_bucket      VARCHAR(10),    -- '18-24', '25-34', 等
    gender          VARCHAR(10),
    signup_date     TIMESTAMP,
    subscription    VARCHAR(20),    -- 'free', 'premium', 'family'
    last_active     TIMESTAMP,
    device_types    VARCHAR(100),   -- JSON 数组
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);
-- 按国家分区用于地理分布式服务
```

### 内容表

```sql
CREATE TABLE items (
    item_id         BIGINT PRIMARY KEY,
    title           VARCHAR(500),
    description     TEXT,
    category        VARCHAR(100),
    subcategory     VARCHAR(100),
    tags            VARCHAR(500),   -- JSON 数组
    creator_id      BIGINT,
    language        VARCHAR(5),
    duration_sec    INT,            -- 用于视频/音频
    content_type    VARCHAR(50),    -- 'video', 'article', 'product'
    quality_score   FLOAT,
    maturity_rating VARCHAR(10),    -- 'G', 'PG', 'PG-13', 'R'
    publish_date    TIMESTAMP,
    status          VARCHAR(20),    -- 'active', 'archived', 'blocked'
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);
-- 在 (category, publish_date) 上建索引用于趋势查询
-- 在 (creator_id) 上建索引用于基于创作者的检索
```

### 交互/事件表

```sql
CREATE TABLE interactions (
    event_id        BIGINT PRIMARY KEY,    -- Snowflake ID
    user_id         BIGINT NOT NULL,
    item_id         BIGINT NOT NULL,
    event_type      VARCHAR(20),           -- 'view','click','watch','like',
                                           -- 'share','purchase','skip'
    duration_sec    INT,                   -- 观看/阅读时长
    completion_rate FLOAT,                 -- 0.0 到 1.0
    device_type     VARCHAR(20),
    location        VARCHAR(50),
    session_id      VARCHAR(64),
    position        INT,                   -- 在推荐列表中的位置
    source          VARCHAR(50),           -- 'homepage','search','related'
    timestamp       TIMESTAMP NOT NULL,
    created_at      TIMESTAMP DEFAULT NOW()
);
-- 按日期分区（每日分区）
-- 分区内按 user_id 聚簇
-- 以列式格式（Parquet）存储在数据湖中
-- 热数据（7天）存储在 Cassandra 用于实时查询
-- 冷数据存储在 S3/HDFS 用于训练
```

### Embeddings 表

```sql
CREATE TABLE embeddings (
    entity_type     VARCHAR(10),    -- 'user' 或 'item'
    entity_id       BIGINT,
    model_version   VARCHAR(50),
    embedding       VECTOR(256),    -- 256维浮点向量
    computed_at     TIMESTAMP,
    PRIMARY KEY (entity_type, entity_id, model_version)
);
-- 存储在 Redis 用于在线服务
-- 存储在 S3 用于批处理
-- 从内容 embeddings 构建 ANN 索引
```

### 特征表

```sql
CREATE TABLE feature_store (
    entity_type     VARCHAR(10),    -- 'user', 'item', 'context'
    entity_id       BIGINT,
    feature_name    VARCHAR(100),
    feature_value   BYTEA,          -- 序列化的特征值
    computed_at     TIMESTAMP,
    PRIMARY KEY (entity_type, entity_id, feature_name)
);
-- 在线: Redis 使用每个实体的 hash maps
-- 离线: Hive/Iceberg 表按日期分区
```

### 实验表

```sql
CREATE TABLE experiments (
    experiment_id   BIGINT PRIMARY KEY,
    name            VARCHAR(255),
    description     TEXT,
    status          VARCHAR(20),    -- 'draft','running','completed','rolled_back'
    start_date      TIMESTAMP,
    end_date        TIMESTAMP,
    traffic_pct     FLOAT,          -- 分配的流量百分比
    control_config  JSONB,          -- 模型版本、特征、参数
    treatment_config JSONB,
    metrics         JSONB,          -- 跟踪的指标和结果
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

## 9. 冷启动问题

### 新用户冷启动

```
全新用户（无交互历史）:

策略 1: 基于热度
  +--------------------+
  | 全局热门           |  展示全球趋势内容
  | 内容               |  按国家/语言细分
  +--------------------+

策略 2: 基于人口统计
  +--------------------+
  | 按人口统计特征     |  相同年龄、国家、
  | 匹配相似用户       |  语言的用户倾向于喜欢这些内容
  +--------------------+

策略 3: 入门问卷
  +--------------------+
  | "选择你感兴趣      |  用户选择 5+ 个类别/流派
  |  的话题"           |  使用选择作为初始偏好
  +--------------------+

策略 4: 上下文信号
  +--------------------+
  | 设备、位置、       |  晚上 10 点美国的移动用户 ->
  | 时间、来源         |  短视频娱乐内容
  +--------------------+

渐进过程:
  交互 0:    100% 热度 + 人口统计
  交互 1-5:  70% 热度 + 30% 个性化
  交互 5-20: 40% 热度 + 60% 个性化
  交互 20+:  10% 热度 + 90% 个性化
```

### 新内容冷启动

```
全新内容（无交互数据）:

策略 1: 基于内容的特征
  +--------------------+
  | 从元数据中         |  标题 embedding、描述 embedding、
  | 提取特征           |  类别、标签、时长
  +--------------------+
          |
          v
  计算与现有内容的相似度
  仅使用内容特征通过 item tower 放置到 embedding 空间中

策略 2: 创作者加权
  +--------------------+
  | 创作者历史         |  如果创作者过去的内容表现好，
  |                    |  提升新内容的初始分数
  +--------------------+

策略 3: 探索池
  +--------------------+
  | 专用               |  为展示次数 < 100 的内容
  | 探索位             |  保留 5-10% 的展示位
  +--------------------+

策略 4: Multi-Armed Bandit
  +--------------------+
  | Thompson Sampling  |  高不确定性 = 高探索
  | 或 UCB             |  随着数据积累收敛
  +--------------------+

新内容生命周期:
  展示 0:        仅内容特征，放入探索池
  展示 1-100:    高探索权重，快速反馈
  展示 100-1K:   过渡到协同过滤信号
  展示 1K+:      完整协同过滤，探索减少
```

### 冷启动架构

```
+------------------------------------------------------------------+
|                    冷启动系统                                      |
|                                                                  |
|  用户请求                                                        |
|      |                                                           |
|      v                                                           |
|  +------------------+                                            |
|  | 用户画像         |                                            |
|  | 检查             |                                            |
|  +------------------+                                            |
|      |           |                                               |
|  有历史      无历史                                              |
|      |           |                                               |
|      v           v                                               |
|  标准        +------------------+                                |
|  Pipeline    | 冷启动           |                                |
|               | 路由器          |                                |
|               +------------------+                               |
|                  |       |       |                                |
|                  v       v       v                                |
|            基于热度  基于人口  入门                               |
|                      统计     问卷                               |
|                  |       |       |                                |
|                  +---+---+---+---+                                |
|                      |                                           |
|                      v                                           |
|              与探索混合                                           |
|                      |                                           |
|                      v                                           |
|              返回推荐结果                                        |
+------------------------------------------------------------------+
```

---

## 10. 实时个性化

### 事件流架构

```
+------------------------------------------------------------------+
|                 实时个性化                                         |
|                                                                  |
|  用户行为（点击、观看、点赞）                                    |
|      |                                                           |
|      v                                                           |
|  +-----------------+     +------------------+                    |
|  | 事件收集器      |---->| Kafka            |                    |
|  | (API Gateway)   |     | (按 user_id      |                    |
|  +-----------------+     |  分区)            |                    |
|                          +------------------+                    |
|                            |        |       |                    |
|                            v        v       v                    |
|  +-------------------+  +------+ +------+ +------+              |
|  | 会话服务          |  |Flink | |Flink | |Flink |              |
|  | (内存中)          |  |Job 1 | |Job 2 | |Job 3 |              |
|  |                   |  |实时  | |在线  | |用户  |              |
|  | - 当前会话        |  |聚合  | |特征  | |Embed |              |
|  |   浏览内容        |  |      | |更新  | |更新  |              |
|  | - 会话上下文      |  +------+ +------+ +------+              |
|  +-------------------+     |        |         |                  |
|                            v        v         v                  |
|                   +----------------------------+                 |
|                   | Redis (在线 Feature Store)  |                |
|                   +----------------------------+                 |
|                              |                                   |
|                              v                                   |
|                   下次推荐请求                                    |
|                   使用更新后的特征                                |
+------------------------------------------------------------------+
```

### 基于会话的推荐

```
在单次会话内，实时调整推荐:

会话时间线:
  T0: 用户打开应用
      -> 展示预计算的推荐（缓存）

  T1: 用户观看一个喜剧视频（2 分钟）
      -> 更新会话特征:
         session_categories = ["comedy"]
         session_watch_time = 120s
      -> 下次请求: 提升喜剧，相似时长

  T2: 用户 3 秒后跳过一个剧情视频
      -> 更新会话特征:
         session_skipped = ["drama"]
      -> 下次请求: 降低剧情内容权重

  T3: 用户观看一个烹饪视频（5 分钟）
      -> 更新会话特征:
         session_categories = ["comedy", "cooking"]
         session_engagement_trend = "increasing"
      -> 下次请求: 推荐喜剧 + 烹饪交叉内容

会话特征向量（每次交互更新）:
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

### 实时 Embedding 更新

```
完整 embedding 重训练成本高（数小时）。
对于实时更新，使用轻量级方法:

1. Embedding 插值:
   new_user_embed = alpha * stored_embed + (1-alpha) * session_embed
   其中 session_embed = mean(会话中交互内容的 embeddings)
   alpha = 0.7（偏向历史，随会话长度衰减）

2. 增量学习:
   - 保持 user tower 最后一层可训练
   - 用小学习率在新交互上微调
   - 每 N 次交互更新一次（N=10）

3. 上下文调整:
   - 存储基础用户 embedding（历史）
   - 服务时与会话特征拼接
   - 排序模型学习对两种信号加权

延迟: 每次用户交互的 Embedding 更新在 < 100ms 内完成
```

---

## 11. 评估与 A/B Testing

### 离线评估指标

```
+--------------------+--------------------------------------------------+
| 指标               | 公式和解释                                       |
+--------------------+--------------------------------------------------+
| Precision@K        | |前 K 中的相关内容| / K                          |
|                    | "展示的内容中，有多少是相关的？"                 |
+--------------------+--------------------------------------------------+
| Recall@K           | |前 K 中的相关内容| / |所有相关内容|             |
|                    | "所有相关内容中，我们找到了多少？"               |
+--------------------+--------------------------------------------------+
| NDCG@K             | DCG@K / IDCG@K                                   |
|                    | 考虑位置: 相关内容排名越高越好                   |
+--------------------+--------------------------------------------------+
| Hit Rate@K         | 前 K 中至少有 1 个相关内容的用户比例             |
+--------------------+--------------------------------------------------+
| MRR                | mean(1 / 第一个相关内容的排名)                   |
|                    | "我们多快能展示一个相关内容？"                   |
+--------------------+--------------------------------------------------+
| Coverage            | |被推荐过的唯一内容| / |所有内容|                |
|                    | "我们展示了目录中多大比例的内容？"               |
+--------------------+--------------------------------------------------+
| Diversity (ILD)    | 推荐内容之间的平均成对距离                       |
|                    | 越高 = 推荐越多样                                |
+--------------------+--------------------------------------------------+
| Novelty            | avg(-log2(popularity)) 推荐内容的                |
|                    | 越高 = 推荐了越不显而易见的内容                  |
+--------------------+--------------------------------------------------+
| Serendipity        | 不在用户历史中的相关内容比例                     |
|                    | "意外但有用的推荐"                               |
+--------------------+--------------------------------------------------+
```

### 在线评估指标

```
主要指标（直接优化）:
  - CTR (Click-Through Rate): 点击数 / 展示数
  - 观看时长: 每次会话的总观看分钟数
  - 完成率: avg(观看时长 / 内容时长)
  - 转化率: 购买数 / 推荐数（电商）

次要指标（业务健康度）:
  - DAU / MAU 比率: 用户粘性
  - 会话时长: 每次会话时间
  - 每日会话次数: 互动频率
  - 留存率 (D1, D7, D30): 回访用户率
  - 用户收入: 变现能力

护栏指标（不得下降）:
  - 多样性分数: 消费的类别多样性
  - 创作者公平性: 展示量在创作者间的分布
  - 投诉率: 举报、屏蔽、"不感兴趣" 点击
  - 延迟: p50 和 p99 服务延迟
```

### A/B Testing 流程

```
1. 假设形成:
   "在排序模型中添加实时会话特征将使
    观看时长增加 3%"

2. 功效分析:
   - 基线观看时长: 30 分钟/会话
   - MDE (最小可检测效应): 3% = 0.9 分钟
   - 标准差: 15 分钟
   - 每组所需样本量:
     n = (Z_alpha/2 + Z_beta)^2 * 2 * sigma^2 / delta^2
     n = (1.96 + 0.84)^2 * 2 * 225 / 0.81
     n = 7.84 * 450 / 0.81
     n = ~4,356 用户/组（���少）
   - 运行 7+ 天以捕获每周模式

3. 实验设置:
   - 对照组: 5% 流量 (Model v1, 无会话特征)
   - 实验组: 5% 流量 (Model v2, 有会话特征)
   - 生产环境: 90% 流量 (Model v1)

4. 分析:
   - 等待最短持续时间（7天）
   - 检查统计显著性 (p < 0.05)
   - 检查实际显著性（效果 > MDE）
   - 检查护栏指标
   - 检查新奇效应（比较第 1 周 vs 第 2 周）

5. 决策:
   - 发布: 所有指标正向，统计显著
   - 迭代: 混合结果，深入分析
   - 终止: 护栏指标下降
```

### Interleaving 实验

```
比 A/B testing 对排序变化更敏感:

标准 A/B:
  组 A 看到: [A1, A2, A3, A4, A5]  (排序器 A)
  组 B 看到: [B1, B2, B3, B4, B5]  (排序器 B)
  问题: 组间差异增加噪声

Interleaving:
  同一用户看到两个排序器合并的列表:
  [A1, B1, A2, B2, A3, ...]

  功劳分配:
  - 如果用户点击 A1 -> 排序器 A 得分
  - 如果用户点击 B2 -> 排序器 B 得分

  赢家 = 所有用户中得分更多的排序器

  优势:
  - 比 A/B 灵敏 10 倍（需要少 10 倍的用户）
  - 控制了用户级别的方差
  - 更快的实验周转（天 vs 周）

  实现（Team Draft Interleaving）:
  1. 两个排序器产生有序列表
  2. 交替从每个中选取（像体育选秀）
  3. 跟踪哪个排序器"拥有"每个位置
  4. 将互动归因于拥有该位置的排序器
```

---

## 12. 扩展性

### Embedding 索引分片

```
1亿内容 x 256 维 x 4 字节 = 每个索引副本 ~100GB

分片策略:
  +--------------------------------------------------+
  |              ANN 索引服务                          |
  |                                                  |
  | 分片 1: Items 0 - 10M        (10GB)               |
  | 分片 2: Items 10M - 20M      (10GB)               |
  | ...                                               |
  | 分片 10: Items 90M - 100M    (10GB)               |
  |                                                  |
  | 每个分片: 2 个副本保证可用性                       |
  | 总计: 20 个节点 x 10GB = 200GB 集群               |
  +--------------------------------------------------+

查询流程:
  1. 并行查询所有分片
  2. 每个分片返回本地 top-K
  3. 合并所有分片的 top-K -> 全局 top-K
  4. 延迟 = max(分片延迟) + 合并时间
  5. ~5ms 每分片 + 1ms 合并 = ~6ms 总计

刷新策略:
  - 在后台构建新索引（影子索引）
  - 准备好后原子切换
  - 零停机索引更新
```

### Feature Store 分区

```
Redis Cluster 用于在线 Feature Store:

  总数据: ~1.7TB
  Redis 节点: 20 个节点 x 每个 100GB（含开销）
  分区: 按 entity_id 一致性哈希
  复制: 每个分片 1 主 + 2 副本

  +--------+  +--------+  +--------+       +--------+
  | 分片 1 |  | 分片 2 |  | 分片 3 | . . . |分片 20 |
  | 0-5%   |  | 5-10%  |  |10-15%  |       |95-100% |
  | hash   |  | hash   |  | hash   |       | hash   |
  +--------+  +--------+  +--------+       +--------+
      |            |            |               |
  +--------+  +--------+  +--------+       +--------+
  |副本    |  |副本    |  |副本    |       |副本    |
  |  1a    |  |  2a    |  |  3a    |       | 20a    |
  +--------+  +--------+  +--------+       +--------+

  读路径: 路由到最近的副本（地理感知）
  写路径: 写入主节点，异步复制
  故障转移: 自动将副本提升为主节点
```

### 模型服务自动扩缩容

```
+------------------------------------------------------------------+
|              自动扩缩容架构                                        |
|                                                                  |
|  负载均衡器                                                      |
|      |                                                           |
|      v                                                           |
|  +-------------------+    扩缩策略:                               |
|  | 模型服务器池      |    - 扩容: GPU 利用率 > 70%               |
|  |                   |      或 p99 延迟 > 100ms                  |
|  | 最小: 10 实例     |    - 缩容: GPU 利用率 < 30%               |
|  | 最大: 100 实例    |      且 p99 延迟 < 50ms                   |
|  | GPU: A100 / T4    |    - 冷却时间: 5 分钟                     |
|  +-------------------+                                           |
|                                                                  |
|  基于时间的扩缩:                                                 |
|  00:00-06:00  ->  10 实例（低流量）                              |
|  06:00-09:00  ->  30 实例（早晨上升）                            |
|  09:00-18:00  ->  50 实例（白天）                                |
|  18:00-23:00  ->  80 实例（晚间高峰）                            |
|  23:00-00:00  ->  40 实例（逐渐下降）                            |
|                                                                  |
|  成本优化:                                                       |
|  - 60% 的集群使用 spot/抢占式 GPU 实例                           |
|  - 预留按需实例用于基线容量                                      |
|  - 预估成本: $50K-100K/月（36K QPS 峰值）                       |
+------------------------------------------------------------------+
```

### 训练数据 Pipeline 扩展

```
+------------------------------------------------------------------+
|           训练数据 PIPELINE (SPARK / FLINK)                       |
|                                                                  |
|  原始事件 (每天 100亿, 5TB/天)                                   |
|      |                                                           |
|      v                                                           |
|  +------------------+                                            |
|  | Kafka            |  分区: 256                                 |
|  | (事件采集)       |  保留: 7 天                                |
|  +------------------+  吞吐量: 2GB/秒                            |
|      |                                                           |
|      v                                                           |
|  +------------------+                                            |
|  | Spark Streaming  |  集群: 200 个 executors                    |
|  | (ETL + 特征      |  内存: 每个 executor 16GB                  |
|  |  工程)           |  处理: 每日批次 ~30 分钟                   |
|  +------------------+                                            |
|      |                                                           |
|      v                                                           |
|  +------------------+                                            |
|  | 训练数据         |  格式: TFRecord / Parquet                  |
|  | (S3 / HDFS)      |  大小: ~300TB（30天窗口）                  |
|  +------------------+  按日期分区                                |
|      |                                                           |
|      v                                                           |
|  +------------------+                                            |
|  | 分布式           |  框架: PyTorch DDP / Horovod               |
|  | 训练             |  GPU: 32x A100 (80GB)                      |
|  | (GPU 集群)       |  训练时间: 每次完整重训练 ~4 小时          |
|  +------------------+  数据加载: Petastorm / WebDataset          |
|      |                                                           |
|      v                                                           |
|  +------------------+                                            |
|  | 模型产物         |  大小: 每个模型 ~2GB                       |
|  | (S3 + Registry)  |  版本: 保留最近 30 个                      |
|  +------------------+                                            |
+------------------------------------------------------------------+
```

---

## 13. 部署架构

```
+===================================================================+
||                    全球部署                                        ||
||                                                                  ||
||   区域: US-East              区域: EU-West                       ||
||   +-----------------------+   +-----------------------+          ||
||   |  +-------+ +-------+ |   |  +-------+ +-------+ |          ||
||   |  | API   | | API   | |   |  | API   | | API   | |          ||
||   |  | GW 1  | | GW 2  | |   |  | GW 1  | | GW 2  | |          ||
||   |  +---+---+ +---+---+ |   |  +---+---+ +---+---+ |          ||
||   |      |         |     |   |      |         |     |           ||
||   |  +---v---------v---+ |   |  +---v---------v---+ |          ||
||   |  | 推荐            | |   |  | 推荐            | |          ||
||   |  | 服务集群        | |   |  | 服务集群        | |          ||
||   |  | (K8s)           | |   |  | (K8s)           | |          ||
||   |  |                 | |   |  |                 | |          ||
||   |  | - 候选生成      | |   |  | - 候选生成      | |          ||
||   |  | - 排序 (GPU)    | |   |  | - 排序 (GPU)    | |          ||
||   |  | - 重排序        | |   |  | - 重排序        | |          ||
||   |  +-----------------+ |   |  +-----------------+ |          ||
||   |                      |   |                      |           ||
||   |  +-----------------+ |   |  +-----------------+ |          ||
||   |  | Feature Store   | |   |  | Feature Store   | |          ||
||   |  | (Redis Cluster) | |   |  | (Redis Cluster) | |          ||
||   |  | 10 个分片       | |   |  | 10 个分片       | |          ||
||   |  +-----------------+ |   |  +-----------------+ |          ||
||   |                      |   |                      |           ||
||   |  +-----------------+ |   |  +-----------------+ |          ||
||   |  | ANN 索引        | |   |  | ANN 索引        | |          ||
||   |  | (FAISS/ScaNN)   | |   |  | (FAISS/ScaNN)   | |          ||
||   |  | 10 个分片       | |   |  | 10 个分片       | |          ||
||   |  +-----------------+ |   |  +-----------------+ |          ||
||   +-----------------------+   +-----------------------+          ||
||                                                                  ||
||   +----------------------------------------------------------+   ||
||   |              共享基础设施                                  |   ||
||   |                                                          |   ||
||   |  +----------------+  +----------------+  +------------+  |   ||
||   |  | Kafka 集群     |  | Data Lake      |  | Model      |  |   ||
||   |  | (事件流)       |  | (S3/HDFS)      |  | Registry   |  |   ||
||   |  | 跨区域         |  | 中心化         |  | (MLflow)   |  |   ||
||   |  | 复制           |  | 仓库           |  |            |  |   ||
||   |  +----------------+  +----------------+  +------------+  |   ||
||   |                                                          |   ||
||   |  +----------------+  +----------------+  +------------+  |   ||
||   |  | GPU 训练       |  | Spark 集群     |  | 监控       |  |   ||
||   |  | 集群           |  | (特征工程)     |  | (Grafana + |  |   ||
||   |  | (32x A100)     |  |                |  |  PagerDuty)|  |   ||
||   |  +----------------+  +----------------+  +------------+  |   ||
||   +----------------------------------------------------------+   ||
||                                                                  ||
||   模型部署流程:                                                  ||
||   训练集群 -> Model Registry -> Canary (5% 流量)                 ||
||   -> Shadow（与生产对比）-> 全量发布                             ||
||                                                                  ||
||   跨区域同步:                                                    ||
||   - 模型产物: 通过 S3 跨区域复制                                 ||
||   - Feature Store: 异步复制，延迟 < 1 分钟                      ||
||   - ANN 索引: 中心化构建，分发到各区域                           ||
||   - 事件: Kafka MirrorMaker 跨区域流式传输                       ||
+===================================================================+
```

### 部署检查清单

```
部署前:
  [ ] 离线指标达到阈值 (AUC > 0.80, NDCG@10 > 0.40)
  [ ] 模型大小在服务预算内 (< 2GB)
  [ ] 推理延迟 < 20ms 每批次（在目标硬件上测试）
  [ ] 特征兼容性验证（无缺失特征）
  [ ] A/B test 配置了适当的流量分配

Canary 部署（5% 流量, 2 小时）:
  [ ] 无延迟回归 (p99 < 200ms)
  [ ] 无错误率增加 (< 0.1%)
  [ ] 无护栏指标下降

Shadow 部署（与生产并行, 24 小时）:
  [ ] 与生产模型预测对比
  [ ] 记录差异用于分析
  [ ] 验证 Feature Store 兼容性

全量发布:
  [ ] 渐进增量: 5% -> 25% -> 50% -> 100%，48 小时内完成
  [ ] 持续监控所有在线指标
  [ ] 保持回滚能力（前一个模型版本保持热备）
```

---

## 14. 常见面试追问

### 如何处理位置偏差？

```
问题: 展示在较高位置的内容无论相关性如何都会获得更多点击。
用这些数据训练会放大偏差。

解决方案:

1. 训练时的位置特征:
   - 训练时将位置作为特征
   - 推理时将位置设为 0（或平均位置）
   - 模型学习区分位置效应和相关性

2. Inverse Propensity Weighting (IPW):
   - 从随机化实验估计 P(click | position)
   - 每个训练样本权重为 1 / P(click | position)
   - 顶部位置的内容获得较低权重

3. 位置偏差模型:
   P(click) = P(examine | position) * P(click | examine, relevance)
   - 分别训练检视和相关性模型
   - 服务时仅使用相关性模型

4. 随机化数据收集:
   - 定期对小比例的结果进行随机打乱
   - 使用这些无偏数据进行模型评估
   - 成本高（降低用户体验）但最准确
```

### 如何为推荐增加多样性？

```
问题: 纯粹优化相关性会导致重复、同质化的推荐
（全是动作片、全是流行歌曲）。

解决方案:

1. Maximal Marginal Relevance (MMR):
   MMR = argmax[lambda * Sim(item, query) - (1-lambda) * max(Sim(item, selected))]
   - 平衡相关性与相对于已选内容的新颖性
   - lambda = 0.7（偏向相关性，兼顾多样性）

2. Determinantal Point Processes (DPP):
   - 建模相似内容之间的排斥
   - 联合选择一个高质量的多样化子集
   - P(子集 S) 正比于 det(L_S)，其中 L 编码质量 + 多样性

3. 基于类别的规则:
   - 前 20 中每个类别最多 3 个内容
   - 前 5 中至少包含 2 个类别
   - 强制创作者多样性（每个创作者最多 2 个内容）

4. 次模优化:
   - 将问题表述为次模函数最大化
   - 贪心地添加最大化边际效用的内容
   - 效用 = 相关性 + 多样性奖励

5. 后处理重排序:
   - 滑动窗口: 确保每 5 个内容的窗口内保持多样性
   - 如果能显著增加多样性，则交换较低位的内容上来
```

### 如何实现"因为你看过 X"的解释？

```
方法:

1. 检索来源归因:
   每个候选跟踪产生它的检索通道:
   - Item-CF: "因为你看过 [来源内容]"
   - Content-Based: "因为你喜欢 [类型/类别]"
   - Popularity: "你所在地区的热门趋势"
   - Creator-Based: "来自 [创作者名称] 的更多内容"

2. 特征归因 (SHAP/LIME):
   - 对排序模型计算每个预测的特征重要性
   - 贡献最大的特征成为解释:
     * user_genre_pref x item_genre -> "与你的喜剧偏好匹配"
     * user_creator_affinity -> "来自你关注的创作者"

3. 最近邻解释:
   - 在用户历史中找到与推荐内容最接近的内容
   - "因为你看过 [embedding 空间中最近的内容]"

4. 基于模板:
   模板:
   - "因为你看过 {item_title}"
   - "在 {user_country} 热门"
   - "{category} 中的热门趋势"
   - "{similar_item} 的粉丝也喜欢这个"
   - "来自 {creator_name} 的新内容"

   选择逻辑:
   if retrieval_source == "item_cf":
       explanation = f"因为你看过 {source_item.title}"
   elif retrieval_source == "content_based":
       explanation = f"因为你喜欢 {item.category}"
   elif retrieval_source == "popularity":
       explanation = f"在 {user.country} 热门"
```

### 如何处理信息茧房问题？

```
问题: 推荐强化现有偏好，限制了对新内容的接触，
可能制造信息茧房。

解决方案:

1. 多样性注入（见上文）
   - 在每个推荐集中强制类别多样性
   - 确保用户看到舒适区之外的内容

2. Serendipity 优化:
   - 将 serendipity 作为多任务排序的目标
   - P(serendipity) = P(relevant) * (1 - P(expected))
   - 奖励相关但出乎意料的内容

3. 兴趣探索:
   - 定期展示相邻类别的内容
   - 如果用户喜欢"科幻动作"，尝试"科幻剧情"
   - 跟踪探索成功率，调整探索范围

4. 内容理解:
   - 使用内容特征找到跨类别的桥接内容
   - "这部纪录片结合了历史（你的兴趣）
     和烹饪（新话题）"

5. 社交证明多样化:
   - "与你相似的用户也喜欢 [不同类别]"
   - 利用协同信号进行安全探索

6. 显式控制:
   - 让用户调整推荐偏好
   - "给我展示更多样化的内容" 滑块
   - 类别屏蔽和加权控制

衡量:
  - 跟踪用户内容类别分布随时间的变化
  - 健康: 类别熵不应下降
  - 当类别集中度超过阈值时发出告警
```

### 如何平衡探索与利用？

```
框架: 带上下文特征的 Multi-Armed Bandit

                    利用
                   (展示有效的内容)
                        |
    纯利用          ---+---     纯探索
    (总是排名最高)      |       (随机内容)
                        |
                    探索
                  (尝试新事物)

实现:

1. 带衰减的 Epsilon-Greedy:
   epsilon(t) = max(0.01, 0.1 * decay^t)
   - 从 10% 探索开始，衰减到 1%
   - 简单但有效

2. Thompson Sampling（推荐）:
   对于每个内容 i:
     alpha_i = 成功次数 + 1
     beta_i = 失败次数 + 1
     sampled_reward = Beta(alpha_i, beta_i).sample()
   按 sampled_reward 排序

   特性:
   - 自动探索不确定的内容
   - 随着置信度增长收敛到利用
   - 处理非平稳环境

3. Contextual Bandits (LinUCB):
   对于给定上下文 x 的每个内容 i:
     predicted_reward = theta_i^T * x
     confidence = alpha * sqrt(x^T * A_i^-1 * x)
     score = predicted_reward + confidence

   - 使用用户/内容上下文进行更智能的探索
   - 比无上下文的 bandits 更高效

预算分配:
  - 85% 利用（模型排名最高的内容）
  - 10% Thompson Sampling 探索（不确定的内容）
  - 5% 随机探索（新的/冷启动内容）
```

### 如何衡量长期用户满意度？

```
问题: 优化点击率/观看时长可能导致标题党和
上瘾模式，损害长期满意度。

短期指标（容易衡量，可能有误导性）:
  - CTR、观看时长、会话时长
  - 可被标题党、自动播放、暗黑模式利用

长期指标（较难衡量，更有意义）:
  - D7/D30 留存率: 用户是否回来？
  - Net Promoter Score (NPS): 他们会推荐吗？
  - 订阅续费率
  - 基于调查的满意度分数
  - 内容质量评分（观看后）
  - 时间花得值不值（自我报告）

衡量方法:

1. 留出实验（黄金标准）:
   - 运行 30+ 天的 A/B 测试
   - 衡量留存率，而不仅是互动量
   - "模型 A 的 CTR 更高但 D30 留存率更低"
   - 选择长期结果更好的模型

2. 延迟反馈建模:
   - 以留存作为标签训练模型（而不仅是点击）
   - 给近期留存信号更高权重
   - 多任务: 联合优化点击 + 长期满意度

3. 用户调查:
   - 对 1% 的用户进行会话后调查
   - "你对今天的推荐满意吗？"（1-5）
   - 将调查分数与模型变更关联

4. 代理指标:
   - 主动观看时间（排除自动播放）
   - 重复观看率（用户重新访问内容）
   - 收藏/书签率（打算回来的意图）
   - 平台内自然搜索（探索行为）
   - 正向行为（点赞）与负向行为（跳过、隐藏）的比率

5. 反向指标:
   监控并约束有害的互动模式:
   - 会话时长 > 3 小时（潜在上瘾）
   - 深夜使用激增（睡眠干扰）
   - 后悔信号（点击后"隐藏"或"不感兴趣"）

综合满意度分数:
  satisfaction = w1 * retention_7d
               + w2 * voluntary_watch_pct
               + w3 * like_to_skip_ratio
               + w4 * survey_score
               - w5 * regret_rate
               - w6 * complaint_rate
```

---

## 总结: 关键设计决策

```
+--------------------+----------------------+---------------------------+
| 决策               | 选择                 | 理由                      |
+--------------------+----------------------+---------------------------+
| 候选生成           | Two-Tower + ANN      | 可扩展至 1亿内容，       |
|                    | (FAISS/ScaNN)        | <10ms 检索               |
+--------------------+----------------------+---------------------------+
| 排序模型           | 深度多任务           | 捕获复杂特征交互，       |
|                    | (Wide & Deep 变体)   | 多目标优化               |
+--------------------+----------------------+---------------------------+
| Feature Store      | Redis (在线) +       | <1ms 读取，训练的        |
|                    | S3/Hive (离线)       | Point-in-Time 正确性     |
+--------------------+----------------------+---------------------------+
| 事件处理           | Kafka + Flink        | 秒级实时特征更新         |
|                    |                      |                           |
+--------------------+----------------------+---------------------------+
| 训练               | 每日完整重训练 +     | 平衡新鲜度与             |
|                    | 每小时 embed 更新    | 训练成本                 |
+--------------------+----------------------+---------------------------+
| 探索               | Thompson Sampling    | 基于原则的不确定性       |
|                    |                      | 探索                     |
+--------------------+----------------------+---------------------------+
| 冷启动             | 内容特征 +           | 优雅降级，               |
|                    | 热度 + Bandits       | 渐进个性化               |
+--------------------+----------------------+---------------------------+
| 服务               | Triton Inference     | GPU 批处理，多模型，     |
|                    | Server               | <50ms 排序延迟           |
+--------------------+----------------------+---------------------------+
| A/B Testing        | Interleaving +       | 灵敏检测，               |
|                    | 长期留出实验         | 长期衡量                 |
+--------------------+----------------------+---------------------------+
| 部署               | 多区域 +             | 全球延迟 <100ms，        |
|                    | canary 发布          | 安全部署                 |
+--------------------+----------------------+---------------------------+
```
