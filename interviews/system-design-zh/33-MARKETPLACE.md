# 设计一个 Marketplace 平台 (Airbnb / Etsy / eBay)

---

## 1. 需求澄清

### 功能性需求

| #   | 需求           | 描述                                                           |
| --- | -------------- | -------------------------------------------------------------- |
| 1   | Listing 管理   | 卖家创建、更新和停用 listing，包含照片、描述、定价和库存       |
| 2   | 搜索与发现     | 买家通过关键词、类别、位置、价格区间和过滤器搜索和浏览 listing |
| 3   | 买卖双方消息   | 买家和卖家在购买前/后的直接通信                                |
| 4   | 交易流程       | 买家付款 → 资金存入 escrow → 卖家发货 → 买家确认 → 资金释放    |
| 5   | 评价与评分     | 交易后双向评价；买家评价卖家，卖家评价买家                     |
| 6   | 信任与安全     | 身份验证、欺诈检测和内容审核                                   |
| 7   | 争议解决       | 买家/卖家保护政策、调解工作流、退款                            |
| 8   | 佣金与费用     | 平台在交易结算时扣除 take rate                                 |
| 9   | 卖家分析       | 提供浏览量、点击量、转化率和收入指标的仪表盘                   |
| 10  | 通知           | 订单更新、消息、评价请求、付款确认                             |
| 11  | Multi-Currency | 支持跨境交易和货币转换                                         |
| 12  | Cold Start     | 在新类别或新地区引导供需                                       |

### 非功能性需求

| #   | 需求             | 目标                                   |
| --- | ---------------- | -------------------------------------- |
| 1   | 搜索延迟         | < 200ms (p95)                          |
| 2   | 交易处理         | 端到端 < 1 秒                          |
| 3   | 可用性           | 99.99%（每年停机时间 < 53 分钟）       |
| 4   | 重复扣费率       | 零（幂等支付）                         |
| 5   | Listing 写入延迟 | 创建/更新 < 500ms                      |
| 6   | 消息投递延迟     | < 2 秒                                 |
| 7   | 欺诈检测延迟     | < 500ms（内联，预授权）                |
| 8   | 一致性           | 交易强一致性；分析和搜索索引最终一致性 |
| 9   | 持久性           | 零订单丢失（至少一次处理 + 幂等性）    |
| 10  | 数据保留         | 财务记录 7 年；消息日志 90 天          |

### 规模估算

```
Listing 数:                50,000,000 个活跃 listing
买家:                      20,000,000 注册买家
卖家:                      2,000,000 注册卖家
每日交易:                  1,000,000 笔交易/天
峰值交易:                  ~50 笔交易/秒（促销期间为基线的 10 倍）
搜索查询:                  50,000,000 次查询/天 = ~580 QPS 平均; 3,000 QPS 峰值
消息:                      5,000,000 条消息/天
评价:                      500,000 条新评价/天
```

### 粗略估算

**交易写入吞吐量:**

```
每天 1M 笔交易 / 86,400 秒 = ~12 笔交易/秒（基线）
峰值因子: 5x = ~60 笔交易/秒
每笔交易: ~8 次状态转换 (CREATED → PAID → ESCROWED → SHIPPED → DELIVERED → RELEASED)
总写入量: 峰值时 ~480 次状态写入/秒
```

**存储估算:**

```
Listing 记录:              ~5 KB（文本字段、元数据）
Listing 照片:              ~10 张照片 * 500 KB（压缩后）= 每个 listing 5 MB
5000 万个 listing 文本:    50M * 5 KB = 250 GB（关系型数据库）
5000 万个 listing 照片:    50M * 5 MB = 250 TB（对象存储，通过 CDN 分发）
交易记录:                  ~2 KB
每天 1M 笔交易 * 2 KB:     ~2 GB/天; 730 GB/年
消息记录:                  ~500 字节
每天 5M 条消息 * 500 B:    ~2.5 GB/天
评价记录:                  ~1 KB
每天 50 万条评价 * 1 KB:    ~500 MB/天
```

**搜索索引:**

```
5000 万个 listing * 5 KB 文本 = 250 GB 原始数据
倒排索引（3 倍放大）= ~750 GB（存储在 Elasticsearch 中）
索引更新: 每天 20 万次 listing 变更 = ~2 次写入/秒
```

**带宽:**

```
搜索响应（50 个结果 * 500 字节）: 25 KB/响应
580 QPS * 25 KB = ~14.5 MB/秒 搜索服务出站流量
图片通过 CDN 分发: 每天 1M 会话 * 50 次图片浏览 * 50 KB = ~2.5 TB/天 CDN 分发
```

---

## 2. API 设计

### Listing API

```
POST   /v1/listings
       Body: { title, description, price, currency, categoryId, condition, quantity,
               location: { country, city, postalCode }, attributes: { key: value },
               shippingOptions: [{ carrier, method, price, estimatedDays }] }
       Response: { listingId, status: "draft", qualityScore, createdAt }

PATCH  /v1/listings/{listingId}
       Body: { price?, title?, description?, quantity?, status? }
       Response: { listingId, updatedAt, qualityScore }

GET    /v1/listings/{listingId}
       Response: { id, title, description, price, currency, seller: { id, displayName,
                   rating, reviewCount }, images: [url], attributes, shippingOptions,
                   views, watchlistCount, status, createdAt }

DELETE /v1/listings/{listingId}
       Response: 204 No Content

POST   /v1/listings/{listingId}/images
       Body: multipart/form-data with image files
       Response: { images: [{ id, url, order }] }
```

### 搜索 API

```
GET    /v1/search?q=&category=&minPrice=&maxPrice=&condition=&location=&radius=
              &sortBy=relevance|price_asc|price_desc|newest&page=&limit=
       Response: {
         total: 124500,
         page: 1,
         limit: 48,
         results: [{
           listingId, title, price, currency, thumbnailUrl, condition,
           sellerRating, location, shippingOptions, isPromoted
         }],
         facets: {
           categories: [{ id, name, count }],
           priceRanges: [{ min, max, count }],
           conditions: [{ value, count }]
         }
       }

GET    /v1/recommendations?userId=&context=homepage|listing|cart&limit=
       Response: { recommendations: [{ listingId, title, price, thumbnailUrl, reason }] }
```

### 交易 API

```
POST   /v1/orders
       Body: { listingId, quantity, shippingOptionId, buyerAddressId, paymentMethodId,
               promoCode?, idempotencyKey }
       Response: { orderId, status: "PENDING_PAYMENT", totalAmount, breakdown: {
                    itemPrice, shippingFee, tax, platformFee, total }, paymentIntentId }

GET    /v1/orders/{orderId}
       Response: { orderId, status, listing, buyer, seller, amounts, timeline: [
                   { status, timestamp, actor }], trackingNumber?, estimatedDelivery? }

POST   /v1/orders/{orderId}/confirm-receipt
       Body: { satisfied: true, notes? }
       Response: { orderId, status: "COMPLETED", payoutScheduled: true }

POST   /v1/orders/{orderId}/dispute
       Body: { reason: "ITEM_NOT_RECEIVED|NOT_AS_DESCRIBED|OTHER", description,
               evidenceUrls: [] }
       Response: { disputeId, status: "OPEN", resolutionDeadline }
```

### 评价 API

```
POST   /v1/reviews
       Body: { orderId, targetType: "BUYER|SELLER", rating: 1-5, comment,
               aspects: { communication: 1-5, accuracy: 1-5, shipping: 1-5 } }
       Response: { reviewId, status: "PENDING_PUBLICATION", publishAt }

GET    /v1/users/{userId}/reviews?role=seller|buyer&page=&limit=
       Response: { averageRating, totalCount, reviews: [{ id, rating, comment,
                   reviewer: { id, displayName }, createdAt, aspects }] }
```

### 消息 API

```
POST   /v1/conversations
       Body: { listingId, recipientId, message }
       Response: { conversationId, messageId, createdAt }

POST   /v1/conversations/{conversationId}/messages
       Body: { content, attachments?: [{ type, url }] }
       Response: { messageId, createdAt, redactedContent }

GET    /v1/conversations?page=&limit=
       Response: { conversations: [{ id, listing, participant, lastMessage,
                   unreadCount, updatedAt }] }

GET    /v1/conversations/{conversationId}/messages?page=&limit=
       Response: { messages: [{ id, senderId, content, attachments, sentAt, readAt }] }
```

### 卖家分析 API

```
GET    /v1/seller/analytics/summary?period=7d|30d|90d
       Response: { views: 12400, clicks: 3200, orders: 145, revenue: 8750.00,
                   conversionRate: 0.045, avgOrderValue: 60.34,
                   topListings: [{ listingId, title, revenue, orders }] }

GET    /v1/seller/analytics/listings/{listingId}?period=
       Response: { views, watchlists, orders, revenue, viewsByDay: [...],
                   searchImpressions, searchClickRate }
```

---

## 3. 数据模型

### 核心表

```sql
-- 卖家和买家共用 users 表
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  display_name  VARCHAR(100) NOT NULL,
  avatar_url    TEXT,
  role          VARCHAR(20) NOT NULL DEFAULT 'BUYER', -- BUYER, SELLER, BOTH, ADMIN
  status        VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, SUSPENDED, BANNED
  kyc_status    VARCHAR(20) NOT NULL DEFAULT 'UNVERIFIED', -- UNVERIFIED, PENDING, VERIFIED
  kyc_level     SMALLINT NOT NULL DEFAULT 0, -- 0=none, 1=email, 2=phone, 3=id_doc
  country_code  CHAR(2),
  timezone      VARCHAR(50),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE seller_profiles (
  user_id           UUID PRIMARY KEY REFERENCES users(id),
  shop_name         VARCHAR(150) UNIQUE NOT NULL,
  shop_description  TEXT,
  policies          JSONB,             -- 退货政策、配送政策
  avg_rating        NUMERIC(3,2),
  review_count      INT DEFAULT 0,
  total_sales       INT DEFAULT 0,
  gmv               NUMERIC(14,2) DEFAULT 0,
  response_rate     NUMERIC(5,2),      -- 24 小时内回复消息的百分比
  ship_on_time_rate NUMERIC(5,2),
  tier              VARCHAR(20) DEFAULT 'STANDARD', -- STANDARD, TOP_RATED, POWER
  payout_account_id UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE categories (
  id          INT PRIMARY KEY,
  parent_id   INT REFERENCES categories(id),
  name        VARCHAR(100) NOT NULL,
  slug        VARCHAR(100) UNIQUE NOT NULL,
  path        TEXT NOT NULL,           -- 例如 /electronics/phones/smartphones
  depth       SMALLINT NOT NULL,
  is_leaf     BOOLEAN NOT NULL DEFAULT FALSE,
  attributes  JSONB                    -- 该类别允许的属性
);

CREATE TABLE listings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id       UUID NOT NULL REFERENCES users(id),
  category_id     INT NOT NULL REFERENCES categories(id),
  title           VARCHAR(200) NOT NULL,
  description     TEXT,
  condition       VARCHAR(20) NOT NULL, -- NEW, LIKE_NEW, GOOD, FAIR, POOR
  price           NUMERIC(12,2) NOT NULL,
  currency        CHAR(3) NOT NULL DEFAULT 'USD',
  quantity        INT NOT NULL DEFAULT 1,
  quantity_sold   INT NOT NULL DEFAULT 0,
  status          VARCHAR(20) NOT NULL DEFAULT 'DRAFT', -- DRAFT, ACTIVE, PAUSED, SOLD, DELETED
  quality_score   NUMERIC(5,2),        -- 0-100，由 listing 质量服务计算
  is_promoted     BOOLEAN DEFAULT FALSE,
  location_country CHAR(2),
  location_city    VARCHAR(100),
  location_postal  VARCHAR(20),
  attributes      JSONB,               -- 类别特定属性
  view_count      INT DEFAULT 0,
  watchlist_count INT DEFAULT 0,
  search_rank     NUMERIC(10,4),       -- 预计算的排序分数
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at    TIMESTAMPTZ
);

CREATE INDEX idx_listings_seller ON listings(seller_id);
CREATE INDEX idx_listings_category ON listings(category_id);
CREATE INDEX idx_listings_status ON listings(status);
CREATE INDEX idx_listings_price ON listings(price);
CREATE INDEX idx_listings_created ON listings(created_at DESC);

CREATE TABLE listing_images (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id  UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  cdn_url     TEXT,
  display_order SMALLINT NOT NULL DEFAULT 0,
  width       INT,
  height      INT,
  size_bytes  INT,
  is_primary  BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE shipping_options (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id      UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  carrier         VARCHAR(50),
  method          VARCHAR(50) NOT NULL, -- STANDARD, EXPEDITED, OVERNIGHT, FREE
  price           NUMERIC(8,2) NOT NULL,
  estimated_days_min SMALLINT,
  estimated_days_max SMALLINT,
  ships_from_country CHAR(2),
  ships_to_countries TEXT[]            -- NULL 表示全球配送
);

-- 订单 / 交易
CREATE TABLE orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id          UUID NOT NULL REFERENCES users(id),
  seller_id         UUID NOT NULL REFERENCES users(id),
  listing_id        UUID NOT NULL REFERENCES listings(id),
  quantity          INT NOT NULL DEFAULT 1,
  item_price        NUMERIC(12,2) NOT NULL,
  shipping_fee      NUMERIC(8,2) NOT NULL DEFAULT 0,
  tax_amount        NUMERIC(8,2) NOT NULL DEFAULT 0,
  platform_fee      NUMERIC(8,2) NOT NULL,
  total_amount      NUMERIC(12,2) NOT NULL,
  seller_payout     NUMERIC(12,2) NOT NULL,
  currency          CHAR(3) NOT NULL,
  exchange_rate     NUMERIC(10,6) DEFAULT 1.0,
  status            VARCHAR(30) NOT NULL DEFAULT 'CREATED',
  -- CREATED, PENDING_PAYMENT, PAID, ESCROWED, SHIPPED,
  -- DELIVERED, COMPLETED, DISPUTED, REFUNDED, CANCELLED
  shipping_option_id UUID REFERENCES shipping_options(id),
  buyer_address_id   UUID,
  tracking_number    VARCHAR(100),
  carrier            VARCHAR(50),
  shipped_at         TIMESTAMPTZ,
  delivered_at       TIMESTAMPTZ,
  receipt_confirmed_at TIMESTAMPTZ,
  auto_release_at    TIMESTAMPTZ,      -- N 天后自动释放 escrow
  payment_intent_id  TEXT UNIQUE,      -- Stripe / 支付网关引用
  idempotency_key    TEXT UNIQUE,
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_buyer ON orders(buyer_id);
CREATE INDEX idx_orders_seller ON orders(seller_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_listing ON orders(listing_id);

CREATE TABLE order_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES orders(id),
  status      VARCHAR(30) NOT NULL,
  actor_id    UUID,
  actor_type  VARCHAR(20), -- BUYER, SELLER, SYSTEM, SUPPORT
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Escrow / 付款
CREATE TABLE escrow_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID UNIQUE NOT NULL REFERENCES orders(id),
  amount          NUMERIC(12,2) NOT NULL,
  currency        CHAR(3) NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'HOLDING',
  -- HOLDING, RELEASED, REFUNDED, PARTIALLY_REFUNDED
  held_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  release_at      TIMESTAMPTZ,
  released_amount NUMERIC(12,2),
  provider_ref    TEXT             -- 支付提供商 escrow 引用
);

CREATE TABLE payouts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id         UUID NOT NULL REFERENCES users(id),
  amount            NUMERIC(12,2) NOT NULL,
  currency          CHAR(3) NOT NULL,
  status            VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  -- PENDING, PROCESSING, COMPLETED, FAILED
  source_order_ids  UUID[],
  payout_account_id UUID,
  provider_ref      TEXT,
  scheduled_at      TIMESTAMPTZ,
  processed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 评价
CREATE TABLE reviews (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES orders(id),
  reviewer_id   UUID NOT NULL REFERENCES users(id),
  reviewee_id   UUID NOT NULL REFERENCES users(id),
  reviewee_type VARCHAR(10) NOT NULL, -- SELLER, BUYER
  rating        SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment       TEXT,
  aspects       JSONB,               -- { communication, accuracy, shipping }
  status        VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  -- PENDING, PUBLISHED, HIDDEN, FLAGGED
  fraud_score   NUMERIC(5,2),
  published_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id, reviewer_id)
);

CREATE INDEX idx_reviews_reviewee ON reviews(reviewee_id, status);

-- 争议
CREATE TABLE disputes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            UUID NOT NULL REFERENCES orders(id),
  claimant_id         UUID NOT NULL REFERENCES users(id),
  respondent_id       UUID NOT NULL REFERENCES users(id),
  reason              VARCHAR(50) NOT NULL,
  description         TEXT NOT NULL,
  evidence_urls       TEXT[],
  status              VARCHAR(30) NOT NULL DEFAULT 'OPEN',
  -- OPEN, AWAITING_SELLER_RESPONSE, UNDER_REVIEW, RESOLVED_BUYER,
  -- RESOLVED_SELLER, ESCALATED, CLOSED
  resolution          VARCHAR(30),
  resolution_notes    TEXT,
  assigned_agent_id   UUID,
  response_deadline   TIMESTAMPTZ NOT NULL,
  resolved_at         TIMESTAMPTZ,
  refund_amount       NUMERIC(12,2),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 消息
CREATE TABLE conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id      UUID REFERENCES listings(id),
  order_id        UUID REFERENCES orders(id),
  participant_ids UUID[] NOT NULL,
  last_message_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   UUID NOT NULL REFERENCES conversations(id),
  sender_id         UUID NOT NULL REFERENCES users(id),
  content           TEXT NOT NULL,
  redacted_content  TEXT,             -- 脱敏版本，用于审计日志
  attachments       JSONB,
  is_redacted       BOOLEAN DEFAULT FALSE,
  sent_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at           TIMESTAMPTZ
);
```

---

## 4. 高层架构

```
+-------------------------------------------------------------------+
|                        客户端层                                     |
|  +------------+   +----------------+   +----------------------+  |
|  | Web (Next) |   | iOS / Android  |   | 卖家后台              |  |
|  +-----+------+   +-------+--------+   +-----------+----------+  |
+--------|------------------|-------------------------|-------------+
         |                  |                         |
         v                  v                         v
+-------------------------------------------------------------------+
|                     CDN / API Gateway                             |
|    (Cloudflare / AWS CloudFront + API Gateway)                   |
|    - TLS 终止、DDoS 防护、限流                                     |
|    - Auth token 验证 (JWT)、请求路由                                |
+-------------------------------------------------------------------+
         |
         v
+-------------------------------------------------------------------+
|                    负载均衡器 (第 7 层)                              |
+----------+----------+----------+----------+----------+-----------+
           |          |          |          |          |
+----------v-+  +-----v----+  +-v--------+ +v--------+ +v---------+
| Listing    |  | Search   |  |Transaction| |Messaging| |User/Auth |
| Service    |  | Service  |  | Service   | |Service  | |Service   |
+----------+-+  +-----+----+  +-+--------+ +---------+ +----------+
           |          |          |
           |          |          |
+----------v----------v----------v---------------------------------+
|                     消息总线 (Kafka)                               |
|  Topics: listing-events, order-events, review-events,           |
|          payment-events, fraud-signals, analytics-events         |
+------------------------------------------------------------------+
     |          |          |          |          |
     v          v          v          v          v
+--------+ +-------+ +--------+ +--------+ +----------+
|Listing | |Search | |Payment | |Fraud   | |Analytics |
|Worker  | |Indexer| |Service | |Service | |Processor |
+---+----+ +---+---+ +---+----+ +--------+ +----------+
    |           |         |
+---v---+   +---v---+  +--v----------+
|Listing|   |Elastic|  |Stripe /     |
|DB     |   |search |  |Payment GW   |
|(Postgres) +-------+  +-------------+
+-------+
```

### 购买流程中的服务交互

```
买家            API Gateway       Transaction Svc    Payment Svc     Escrow Svc
  |                 |                   |                 |               |
  |-- POST /orders->|                   |                 |               |
  |                 |--- 验证 ---------> |                 |               |
  |                 |                   |-- 欺诈检查 ----> |               |
  |                 |                   |<- 欺诈通过 ----- |               |
  |                 |                   |-- 创建订单 ----> |               |
  |                 |                   |                 |-- 扣款 --->( )
  |                 |                   |                 |<- 成功 ---|
  |                 |                   |-- escrow 持有 ----------------->|
  |                 |                   |<- 已持有 ----------------------|
  |                 |<-- 200 orderId ---|                  |               |
  |<-- 订单响应 ----|                   |                  |               |
  |                 |                   |--发布 order-event 到 Kafka----->|
```

---

## 5. 深入探讨：Two-Sided Marketplace 基础

### 先有鸡还是先有蛋的问题

Marketplace 的核心挑战：买家因为供给而来，卖家因为需求而来。没有另一方，任何一方都没有加入的理由。

```
+-------------------------------------------+
|         Marketplace 网络效应               |
|                                           |
|  更多卖家 --> 更好的选择                   |
|      |                   |               |
|      v                   v               |
|  更多买家 --> 卖家获得更多销售             |
|                                           |
|  流动性阈值：marketplace 实现              |
|  自我维持的临界点                          |
+-------------------------------------------+
```

**引导策略:**

```
策略 1：供给优先（Airbnb 模式）
  - 为早期卖家提供免费 listing 和免佣金补贴
  - 为前 N 笔交易保证最低收益
  - 在高需求地区/类别集中建设供给

策略 2：需求优先（eBay 模式）
  - 通过 SEO、付费推广聚集买家
  - 展示"缺货"listing 以衡量需求信号
  - 利用来自其他渠道的现有供给启动

策略 3：单边价值
  - 在没有另一方的情况下为一方提供价值
  - Etsy：让卖家将其作为作品集/店面使用
  - 在 marketplace 启动前为卖家提供免费分析工具

策略 4：地域/垂直集中
  - 在一个城市或一个细分品类启动
  - 先在本地实现流动性，再扩展
  - Portland 手工艺品先于全国扩展
```

### 流动性指标

```
流动性分数 = (成功交易数) / (有意向的搜索会话数)

目标指标:
  - 搜索到交易转化率:         > 5%
  - Listing 响应率:           > 80%（24 小时内）
  - 首次销售时间（卖家）:      < 30 天
  - 买家回访率（30 天）:       > 40%
```

### 网络效应类型

| 类型         | 描述                             | 示例                  |
| ------------ | -------------------------------- | --------------------- |
| 同侧效应     | 更多买家吸引更多买家（社交证明） | 热门 listing          |
| 跨侧效应     | 更多卖家吸引更多买家，反之亦然   | 核心 marketplace 效应 |
| 数据网络效应 | 更多交易改善推荐算法             | 个性化搜索            |
| 地域效应     | 一个区域的密度提高本地流动性     | 超本地搜索半径        |

---

## 6. 深入探讨：Listing ���理

### Listing 质量分数

Listing 质量分数（0-100）决定搜索排名和卖家等级。每次更新时异步重新计算。

```
质量分数组成:
+-----------------------------------------------+
|  因素                     | 权重   | 最高分数 |
|---------------------------|--------|----------|
|  标题完整性               |  15%   |    15    |
|  描述长度/丰富度          |  15%   |    15    |
|  照片数量（最少 3 张）     |  20%   |    20    |
|  照片分辨率质量           |  10%   |    10    |
|  价格竞争力               |  10%   |    10    |
|  类别属性填写率           |  10%   |    10    |
|  配送选项数量             |  10%   |    10    |
|  卖家评分                 |  10%   |    10    |
+-----------------------------------------------+
```

**Listing 生命周期状态机:**

```
            +--------+
  卖家      | DRAFT  |
  创建      +---+----+
                |  publish()
                v
           +--------+    out_of_stock()    +---------+
           | ACTIVE +-------------------->| PAUSED  |
           +---+----+                     +----+----+
               |  售罄 / 手动                  |  restock()
               |                               |
               v                               v
           +--------+                     +--------+
           |  SOLD  |                     | ACTIVE |
           +--------+                     +--------+
               |
               | admin_remove() / seller_delete()
               v
           +---------+
           | DELETED |
           +---------+
```

**Listing 创建流水线:**

```
卖家提交 listing
        |
        v
  输入验证（zod schema：标题长度、价格范围、类别是否存在）
        |
        v
  图片处理服务
    - 上传时进行病毒扫描
    - 调整为多种分辨率（缩略图 150px、中等 600px、完整 1200px）
    - CDN 上传 (S3 + CloudFront)
    - NSFW 图片分类器（异步）
        |
        v
  内容审核（异步，NLP）
    - 违禁物品检查（武器、假冒品）
    - 垃圾信息/关键词堆砌检测
    - 描述中的 PII 检测（电话号码、邮箱）
        |
        v
  质量分数计算（异步 worker）
        |
        v
  搜索索引更新（异步，Elasticsearch）
        |
        v
  Listing 在数据库中变为 ACTIVE 状态
```

---

## 7. 深入探讨：搜索与发现

### 搜索架构

```
+-------------------------------+
|       搜索查询                 |
+-------------+-----------------+
              |
              v
+-------------+------------------+
|       查询解析器                |
|  - 分词                        |
|  - 拼写纠正                    |
|  - 同义词扩展                  |
|  - 意图分类                    |
|    （导航型 vs 探索型）         |
+-------------+------------------+
              |
     +--------+--------+
     |                 |
     v                 v
+----+------+    +-----+------+
| 关键词     |    | 语义       |
| 搜索       |    | 搜索       |
|(BM25 在    |    |(Embedding  |
|Elasticsearch)  |向量 ANN)   |
+----+------+    +-----+------+
     |                 |
     +--------+--------+
              |
              v
+-------------+------------------+
|       排序 / 打分               |
|  base_score = BM25 + semantic  |
|  * quality_score_boost         |
|  * seller_reputation_boost     |
|  * recency_decay               |
|  * personalization_boost       |
|  * promoted_listing_boost      |
+-------------+------------------+
              |
              v
+-------------+------------------+
|     后过滤 / 分面统计           |
|  - 价格区间                    |
|  - 类别                        |
|  - 成色                        |
|  - 配送：免运费 / 快速          |
|  - 位置 / 半径                 |
+-------------+------------------+
              |
              v
           结果
```

### 排名算法

```
final_score(listing) =
    alpha * text_relevance(query, listing)
  + beta  * quality_score(listing) / 100
  + gamma * seller_score(listing.seller)
  + delta * recency_decay(listing.published_at)
  + epsilon * personalization_boost(user, listing)
  + is_promoted(listing) * promotion_multiplier

其中:
  alpha   = 0.35  （文本相关性占主导）
  beta    = 0.20  （listing 质量）
  gamma   = 0.15  （卖家信誉）
  delta   = 0.10  （新鲜度）
  epsilon = 0.20  （个性化）
  promotion_multiplier = 1.5（付费推广，位置上限为第 3 位）

recency_decay(t) = e^(-lambda * days_since_published)
  lambda = 0.05（大多数类别）
  lambda = 0.20（快速变动类别，例如电子产品）
```

### 基于位置的搜索

```
对于带有位置感知配送的实物商品：
  1. 用户 geo-IP 检测或浏览器位置 API
  2. Listing 标记 ships_from_country
  3. 提升国内配送的 listing（较低的 estimated_days）
  4. 对于本地自提：listing.location 上的 Geohash 索引
     - Geohash 精度 6 = ~1.2km * 0.6km 单元格
     - 查询: listings WHERE geohash LIKE 'prefix%'

对于服务/本地物品（Craigslist 模式）：
  1. Elasticsearch geo_distance 过滤器
  2. 半径搜索: 默认 50km，可调整
  3. 相关性相近时按距离排序
```

### 搜索索引更新流水线

```
Listing 事件 (Kafka)
        |
        v
  Indexer Consumer（读取 listing_events topic）
        |
  +-----+-------+
  |             |
  v             v
 全量          增量
 索引          更新
 (新           (价格、数量、
 listing)     状态变更)
  |             |
  +-----+-------+
        |
        v
  Elasticsearch bulk API
  （批量 100 条文档，每 200ms 刷新一次）
        |
        v
  索引可供搜索使用
  （最终一致性，~500ms 延迟）
```

---

## 8. 深入探讨：信任与安全

### 身份验证 (KYC) 等级

```
+----------------------------------------------------+
| KYC Level 0: 仅邮箱                                 |
|   限制: 每月最高 $500 交易                           |
|   可以: 浏览、发消息、购买低价商品                     |
+----------------------------------------------------+
| KYC Level 1: 邮箱 + 手机验证                         |
|   限制: 每月最高 $5,000                              |
|   可以: 销售、发布 listing                            |
+----------------------------------------------------+
| KYC Level 2: 政府身份证件（OCR + 自拍匹配）           |
|   限制: 每月最高 $50,000                             |
|   必须: 每月提款 > $1,000 时需要                      |
+----------------------------------------------------+
| KYC Level 3: 企业验证（针对商户）                     |
|   限制: 无限制                                       |
|   提供: 增强的争议保护                                |
+----------------------------------------------------+
```

**KYC 流程:**

```
用户提交身份证件 + 自拍照
        |
        v
  证件 OCR 提取 (AWS Rekognition / Stripe Identity)
        |
        v
  活体检测（防欺骗）
        |
        v
  人脸匹配: 自拍 vs. 证件照片（相似度 > 0.95）
        |
        v
  制裁筛查 (OFAC, PEP 名单)
        |
        v
  人工审核队列（置信度低于阈值时）
        |
        v
  KYC 状态更新；通知用户
```

### 欺诈检测流水线

```
交易请求
        |
        v
+-------+-----------------------------------+
|     实时欺诈信号 (<100ms)                  |
|  - 设备指纹（新设备标记）                   |
|  - IP 信誉（VPN、Tor、代理）               |
|  - 频率: M 分钟内 N 笔订单                 |
|  - 账单/收货地址不匹配                      |
|  - 卡 BIN 国家 vs IP 国家                  |
|  - 用户账户年龄                             |
+-------+-----------------------------------+
        |
        v
+-------+-----------------------------------+
|     ML 欺诈评分 (XGBoost 模型)             |
|  - 特征向量: 50+ 个信号                    |
|  - 在历史欺诈标签上训练                     |
|  - 输出: 欺诈概率 0.0-1.0                  |
+-------+-----------------------------------+
        |
   +----+----+-----+
   |         |     |
   v         v     v
score<0.1  0.1-  0.8+
  放行     0.8   拒绝
           增强
           验证
           (3DS /
           OTP)
```

**卖家欺诈模式:**

| 模式                      | 检测信号                           | 处理措施                  |
| ------------------------- | ---------------------------------- | ------------------------- |
| Shill bidding（虚假竞价） | 买卖双方网络图中的环路             | 暂停账户                  |
| 假冒商品                  | 图片与已知品牌的相似度             | 移除 listing + 通知品牌方 |
| 逃避费用                  | 消息中的平台外支付请求             | 消息过滤 + 警告           |
| 账户被盗                  | 从新地域 + 新设备登录              | 强制 2FA 重新认证         |
| 评价操纵                  | 评价聚类分析（相同设备、IP、时间） | 移除评价 + 处罚           |

---

## 9. 深入探讨：评价与评分系统

### 双向评价流程

买卖双方都可以留下评价。为防止报复性评价，评价仅在双方都提交后或窗口期过期后才公开。

```
订单完成
        |
        v
  向买卖双方发送评价邀请（异步，邮件 + 推送）
        |
        v
  +-----+-----+
  |           |
  v           v
买家        卖家
撰写        撰写
评价        评价
  |           |
  +-----+-----+
        |
  窗口期到期（14 天）或双方均已提交
        |
        v
  双方评价同时公开
  （撰写时双方都看不到对方的评价）
```

### 评价存储与聚合

```
评价提交
        |
        v
  欺诈分类器（ML 模型）
    - 与评价者过去评价的相似度分数
    - 评价频率检查（同一用户短时间内大量评价）
    - IP/设备指纹与被评价者的重叠
    - 文本情感分析（检测付费评价模式）
        |
   fraud_score > 阈值?
   是 -> status = FLAGGED，进入人工审核队列
   否 -> status = PENDING_PUBLICATION
        |
        v
  在 T=0 时发布（同时揭晓）
        |
        v
  评分聚合任务（每 5 分钟运行一次）
    UPDATE seller_profiles
    SET avg_rating = (
      SELECT AVG(rating) FROM reviews
      WHERE reviewee_id = seller_id
        AND reviewee_type = 'SELLER'
        AND status = 'PUBLISHED'
        AND created_at > NOW() - INTERVAL '12 months'
    ),
    review_count = COUNT(...)
```

### 虚假评价检测

```
fraud_score 使用的信号:
  1. 评价者账户年龄 < 7 天
  2. 评价者在平台上没有过往购买记录
  3. 评价者和被评价者共享设备指纹
  4. 评价文本与其他评价相同或高度相似
  5. listing 上线后 24 小时内出现大量 5 星评价
  6. 评价者 IP 与卖家在同一子网
  7. NLP: 没有具体内容的泛泛好评（"好产品！"）

集成模型:
  - 基于规则的标记（快速、确定性）
  - 文本 embedding 相似度 (TF-IDF + cosine sim)
  - 基于图的: 评价者-被评价者关系 (Neo4j)
  - 评分分布偏移的异常检测
```

---

## 10. 深入探讨：交易流程 (Escrow)

### 完整交易状态机

```
CREATED
   |
   | 发起支付 (Stripe PaymentIntent created)
   v
PENDING_PAYMENT
   |
   | 支付确认 (来自 Stripe 的 webhook)
   v
PAID
   |
   | 资金转入平台 escrow 账户
   v
ESCROWED -----> DISPUTED (买家发起争议)
   |                 |
   | 卖家发货        | 调解员裁定
   v                 |
SHIPPED            RESOLVED_BUYER 或 RESOLVED_SELLER
   |
   | 承运商确认送达 (webhook)
   v
DELIVERED
   |
   | 买家确认收货（或 3 天后自动释放）
   v
COMPLETED
   |
   | 付款任务运行（每日批量或即时）
   v
FUNDS_RELEASED --> 卖家收款
```

### Escrow 实现

```
平台并不为每个订单开设一个真实的 escrow 银行账户。
而是使用由资金池商户账户支撑的虚拟账本。

一笔 $100 订单的账本条目（10% 平台费）：
  T+0（支付）:
    DR  buyer_payment_account   $100
    CR  platform_pooled_escrow  $100

  T+发货确认:
    （无资金流动，仅状态更新）

  T+确认送达:
    DR  platform_pooled_escrow  $100
    CR  platform_revenue           $10  （佣金）
    CR  seller_pending_payout      $90

  T+付款批次:
    DR  seller_pending_payout   $90
    CR  seller_bank_account     $90  （ACH / 银行转账）
```

### 支付幂等性

```
每次支付变更都携带客户端 idempotency_key (UUID)。
如果相同的 key 被提交两次，第二次调用将返回
第一次缓存的响应，而不会重复扣费。

数据库层面保障:
  orders.idempotency_key  TEXT UNIQUE

应用层面保障:
  Redis SET NX idempotency:{key} {orderId} EX 86400
  如果已存在: 返回缓存的订单
  否则: 执行扣费并 SET 该 key
```

---

## 11. 深入探讨：佣金与费用

### Take Rate 模型

```
+------------------------------------------------------+
| 阶梯佣金结构                                          |
|                                                      |
| 收入等级（过去 12 个月）      | 平台 Take Rate        |
|-------------------------------|---------------------|
| $0 - $1,000                   | 12%                 |
| $1,001 - $10,000              | 10%                 |
| $10,001 - $50,000             | 8%                  |
| $50,001+                      | 6%                  |
|                                                      |
| 加上每笔交易费: $0.30 + 2.9%（支付处理费，             |
| 从 Stripe 透传）                                      |
+------------------------------------------------------+
```

### 费用计算

```
一笔 $85 商品 + $10 运费的订单明细:

  商品价格:          $85.00
  运费:              $10.00
  ---------------------
  小计:              $95.00
  税（8.5%）:         $8.08
  ---------------------
  买家支付:          $103.08

  平台佣金: $85.00 * 10% = $8.50
  支付处理费: $103.08 * 2.9% + $0.30 = $3.29
  ---------------------
  总费用:            $11.79
  卖家收到:          $95.00 - $8.50 - $3.29 = $83.21
  平台净收入:        $8.50（扣除支付处理成本后）
```

### 费用计算服务

```
calculateFees(order):
  sellerTier   = getTierForSeller(order.seller_id)
  takeRate     = TIER_RATES[sellerTier]
  platformFee  = order.item_price * takeRate
  processingFee = (order.total_amount * STRIPE_RATE) + STRIPE_FIXED
  sellerPayout = order.item_price + order.shipping_fee - platformFee - processingFee
  return { platformFee, processingFee, sellerPayout }
```

---

## 12. 深入探讨：争议解决

### 争议工作流

```
买家发起争议（购买后 30 天内）
        |
        v
  创建争议记录；通知卖家
        |
        v
  卖家响应窗口：3 个工作日
        |
  +-----+-----+
  |           |
卖家        无响应
响应        （默认：买家胜出）
  |
  v
客服专员审核证据
  （照片、消息、物流跟踪数据）
        |
        v
  专员裁定: RESOLVE_FOR_BUYER 或 RESOLVE_FOR_SELLER
        |
   +----+----+
   |         |
   v         v
退款        释放
给买家      给卖家
   |
   v
  Escrow 服务执行退款
  如果卖家无余额，平台承担损失
```

### 买家保护策略引擎

```
自动裁定条件（无需人工介入）：
  1. 订单状态 = DELIVERED + 物流确认送达
     + 买家声称"未收到商品"
     -> 自动拒绝申诉（卖家胜出）

  2. 订单状态 = SHIPPED 但承运商显示"丢失"
     -> 自动退款给买家 + 向卖家追偿

  3. 卖家 3 天内未响应
     -> 自动裁定买家胜出

升级触发条件:
  - 争议金额 > $500
  - 买家/卖家双方提交了矛盾的照片
  - 重复申诉者（90 天内 >2 次争议）
  - 卖家争议率 > 5% 的订单量
```

---

## 13. 深入探讨：消息系统

### 架构

```
+------------------+      WebSocket       +------------------+
|   买家客户端      |<------------------->|  Messaging       |
+------------------+                     |  Service         |
                                         |  (Node.js)       |
+------------------+      WebSocket       +--------+---------+
|  卖家客户端      |<------------------->|        |          |
+------------------+                     |  Redis Pub/Sub   |
                                         |  (按 conversation |
                                         |   进行 fan-out)   |
                                         +--------+---------+
                                                  |
                                          +-------v-------+
                                          | Messages DB   |
                                          | (PostgreSQL)  |
                                          +---------------+
                                                  |
                                          +-------v-------+
                                          | PII 脱敏       |
                                          | 服务            |
                                          +---------------+
```

### PII 脱敏

消息在存储前进行扫描，防止买卖双方交换联系方式并在平台外完成交易（逃避费用）。

```
脱敏模式（正则 + NLP）：
  - 电话号码: \+?[0-9]{7,15}  -> [电话已脱敏]
  - 邮箱地址: 标准邮箱正则 -> [邮箱已脱敏]
  - 社交账号: @username 模式（上下文感知）
  - Venmo/PayPal/Zelle 引用 -> [支付信息已脱敏]
  - 竞品平台 URL

实现方式:
  1. 客户端提交消息
  2. 对照脱敏规则扫描（< 5ms，同步）
  3. 原始内容存储在 messages.content 中（静态加密）
  4. 脱敏版本存储在 messages.redacted_content 中
  5. 客户端接收脱敏版本
  6. 客服专员可查看原始内容（需审计日志）
```

---

## 14. 深入探讨：卖家分析

### 分析架构

```
事件来源:
  - Listing 浏览        （页面曝光）
  - Listing 点击        （来自搜索）
  - 加入关注列表
  - 向卖家发送消息
  - 下单
  - 订单完成
  - 留下评价

事件流:
  Client SDK
      |
      v
  Kafka (analytics-events topic)
      |
      v
  Flink 流处理器
  - 会话化（30 分钟窗口）
  - 漏斗计算
  - 实时聚合
      |
      +---> ClickHouse（OLAP，原始事件 + 预聚合）
      +---> Redis（实时计数器：浏览量/小时）
      |
      v
  卖家仪表盘 API
  （从 ClickHouse 读取历史数据，从 Redis 读取实时数据）
```

### 关键指标计算

```sql
-- 卖家的转化漏斗
SELECT
  listing_id,
  COUNT(CASE WHEN event_type = 'VIEWED'         THEN 1 END) AS views,
  COUNT(CASE WHEN event_type = 'CLICKED'        THEN 1 END) AS clicks,
  COUNT(CASE WHEN event_type = 'WATCHLISTED'    THEN 1 END) AS watchlists,
  COUNT(CASE WHEN event_type = 'ORDER_PLACED'   THEN 1 END) AS orders,
  ROUND(COUNT(CASE WHEN event_type = 'ORDER_PLACED' THEN 1 END)::numeric
      / NULLIF(COUNT(CASE WHEN event_type = 'VIEWED' THEN 1 END), 0) * 100, 2)
    AS conversion_rate_pct
FROM listing_events
WHERE seller_id = $1
  AND event_time >= NOW() - INTERVAL '30 days'
GROUP BY listing_id
ORDER BY views DESC;
```

---

## 15. 深入探讨：Multi-Currency 与跨境交易

### 架构

```
货币流转:
  买家以 USD 支付
  卖家以 EUR 收款

  汇率来源: 欧洲中央银行每日汇率
                        （UTC 00:00 更新）
  平台使用中间市场汇率 + 0.5% FX 点差

  Orders 表存储:
    currency     = 'USD'    （买家货币）
    exchange_rate = 1.08200  （支付时的汇率）
    item_price   = 100.00   （以 USD 计）
    seller_payout = 82.90    （净 USD 金额）

  付款服务:
    - 将 seller_payout 转换为卖家首选货币
    - 使用 Stripe multi-currency payouts 或 Wise 进行国际 ACH
    - 在订单创建时锁定汇率（汇率风险由平台承担）
```

### 跨境合规

```
每笔交易的要求:
  1. 出口管制: 根据目的地国家出口限制检查商品类别的 HS code
     (ECCN 清单)
  2. 进口关税估算: 在结账时使用 Avalara / TaxJar API
     向买家提供预估关税
  3. VAT/GST: 为欧盟 (OSS scheme)、英国 (VAT MOSS) 收取并缴纳
  4. 制裁筛查: 根据 OFAC、EU、UN 名单检查买家 + 卖家

实现方式:
  TaxService.calculateDuties(listingId, buyerCountry, sellerCountry)
    -> { estimatedDuty, vatAmount, requiresCustomsDeclaration }
  在结账时作为信息展示；买家承担关税责任
```

---

## 16. 深入探讨：Cold Start 问题

### 供给引导

```
阶段 1: 种子供给（第 0-3 月）
  - 从合作平台抓取/导入 listing（经同意）
  - 邀请相邻平台的现有卖家（eBay 出口商）
  - 前 90 天零卖家费用
  - 为目标类别的前 50 名卖家提供白手套式入驻服务
  - 最低保障: 平台回购未售出库存

阶段 2: 有机增长（第 3-12 月）
  - SEO: 每个 listing 页面都是可被 Google 索引的 URL
    /listings/{id}/{slug} -> 驱动自然发现
  - 推荐计划: 现有卖家可获得被推荐卖家 GMV 的 5%
  - 类别扩展: 优先选择搜索量最高但在现有平台上
    竞争最低的类别

阶段 3: 网络效应（第 12 月+）
  - 卖家分析推动再投资（数据优势）
  - 交叉销售: 买家变成卖家（用户产生的供给）
  - 品牌合作: 平台独家库存
```

### 需求引导

```
策略:
  1. 付费搜索 (Google Shopping): 高意向，可衡量 CPA
  2. 比价: 在 Google Shopping、PriceGrabber 上展示
  3. 社交证明: 精选集合、编辑内容、买家指南
  4. 网红种草: 向细分领域的微网红发送产品
  5. 首次购买价格匹配保证: 牺牲利润吸引买家

新类别的 Cold Start:
  - 临时降低质量门槛以允许更多供给进入
  - 运行类别特定促销（类别内免运费）
  - 对尚未上架的高需求商品展示"即将推出"候补名单
  - 与 1-2 个锚定品牌合作独家发布
```

---

## 17. 扩展策略

### 服务级别扩展

```
+------------------------------------------+
| 服务           | 扩展方式                 |
|----------------|--------------------------|
| 搜索           | Elasticsearch 集群       |
|                | 3 个 master + 12 个 data 节点 |
|                | 每个分片的读副本          |
|                | Redis 缓存热门查询        |
|----------------|--------------------------|
| Listing 写入    | PostgreSQL 主从复制      |
|                | 读副本用于读操作          |
|                | PgBouncer 连接池          |
|----------------|--------------------------|
| 交易           | 强一致性:                 |
|                | 单区域写入                |
|                | 多区域读副本              |
|                | Saga 模式用于回滚         |
|----------------|--------------------------|
| 消息           | Redis cluster (Pub/Sub)   |
|                | WebSocket 服务器自动扩缩   |
|                | 消息数据库按               |
|                | conversation_id hash 分片  |
|----------------|--------------------------|
| 分析           | Kafka + Flink 流处理      |
|                | ClickHouse 集群           |
|                | 预聚合每日视图             |
+------------------------------------------+
```

### 缓存策略

```
第 1 层: CDN (CloudFront)
  - Listing 详情页面（静态 HTML，缓存 5 分钟）
  - 产品图片（缓存 30 天，更新时 cache-bust）
  - 类别树（缓存 1 小时）

第 2 层: 应用缓存 (Redis)
  - 热门查询的搜索结果: TTL 60 秒
  - 用户会话数据: TTL 24 小时
  - 卖家资料: TTL 10 分钟
  - 汇率: TTL 1 小时
  - Listing 浏览计数器: 在 Redis 中递增，每 1 分钟刷新到数据库

第 3 层: 数据库读副本
  - 非关键读操作路由到副本
  - 延迟容忍度: listing 读取 < 100ms；支付 0ms
```

### 数据库分片计划

```
阶段 1（0-5000 万 listing）: 单个 PostgreSQL 主库 + 读副本
阶段 2（5000 万-5 亿 listing）:
  - 按 category_id % N_SHARDS 分片 listings 表
  - 热门类别分配专用分片
  - 跨分片搜索查询通过 Elasticsearch 路由（从不直接查数据库）

阶段 3（5 亿+ listing）:
  - 将 OLTP (PostgreSQL, 分片) 与 OLAP (ClickHouse) 分离
  - 订单采用 Event Sourcing: 只追加的 order_events 表
  - CQRS: 为卖家分析设置独立的读模型
```

---

## 18. 权衡取舍

| 决策                    | 选项 A                       | 选项 B                    | 选择         | 原因                                              |
| ----------------------- | ---------------------------- | ------------------------- | ------------ | ------------------------------------------------- |
| 搜索一致性              | 强一致（数据库读取）         | 最终一致（Elasticsearch） | 最终一致     | 500ms 延迟可接受；ES 提供更好的全文搜索和排名     |
| Escrow 模型             | 每笔订单独立银行 escrow 账户 | 虚拟账本（资金池账户）    | 虚拟账本     | 更便宜、更快；真实银行 escrow 慢且成本高          |
| 评价展示                | 立即发布                     | 双向同时揭晓              | 双向同时揭晓 | 防止报复性评价；Airbnb 研究显示评价质量更高       |
| 支付网关                | 自建                         | 第三方 (Stripe)           | 第三方       | PCI DSS 合规负担；上市时间；Stripe 处理 3DS、欺诈 |
| 消息存储                | Kafka（事件日志）            | PostgreSQL（关系型）      | PostgreSQL   | 消息量低；关系型模型更容易处理会话线程            |
| 欺诈检测                | 仅规则                       | ML 模型 + 规则            | ML + 规则    | 规则快速处理已知模式；ML 捕获新型欺诈模式         |
| 搜索排名                | 纯相关性                     | 相关性 + 业务指标         | 混合         | 纯相关性忽略 listing 质量；纯业务指标损害用户体验 |
| Multi-currency 汇率锁定 | 支付时                       | 订单创建时                | 支付时       | 在资金流动时锁定汇率；避免汇率过期窗口            |

---

## 19. 常见面试追问

**问：如何防止卖家重复接受同一订单（超卖）？**

答：对于固定数量的 listing，使用库存字段的乐观锁：

```sql
UPDATE listings
SET quantity = quantity - :requested_qty,
    updated_at = NOW()
WHERE id = :listing_id
  AND quantity >= :requested_qty  -- 保护条件
  AND status = 'ACTIVE'
RETURNING id;
-- 如果更新 0 行: 库存已空，拒绝订单
```

对于拍卖或高争用商品：使用 Redis `DECRBY listings:qty:{id} 1` 原子操作作为数据库写入前的快速检查。

---

**问：如何处理支付成功但订单创建失败的情况（部分失败）？**

答：使用 idempotency key 和 saga 模式：

```
1. 在支付前由客户端生成 idempotency_key (UUID)
2. 首先创建状态为 CREATED 的订单记录
3. 使用 idempotency_key 发起支付
4. 支付 webhook 成功时: 将订单更新为 PAID
5. 如果步骤 2 或 4 失败: 补偿交易退还支付

Saga 补偿:
  - 如果支付后数据库写入失败: 调度异步退款任务
  - 存储在 Redis 中的 idempotency key 防止重试时重复扣费
  - 补偿失败的进入死信队列；运维告警 + 人工审核
```

---

**问：如何解决推荐系统的 cold start 问题？**

答：使用分级回退策略：

```
新用户（0 次购买）:
  -> 其浏览类别中的热门 listing（基于流行度）
  -> 地理相关的 listing（基于 IP）

初期用户（1-5 次购买）:
  -> 基于购买历史的物品协同过滤
  -> 来自相同卖家的"其他客户也购买了"

成熟用户（5+ 次购买）:
  -> 用户-物品矩阵分解 (ALS 或 two-tower 神经网络模型)
  -> 搜索结果的个性化重排序
  -> 惊喜注入: 10% 的探索预算用于新类别
```

---

**问：如何将消息系统扩展到数百万并发连接？**

答：使用由 Redis Pub/Sub 支撑的可水平扩展的 WebSocket 层：

```
WebSocket 服务器（无状态，每台 10K 连接）:
  - 每台服务器为已连接用户订阅 Redis channel
  - 发送消息时: 发布到 Redis channel conversation:{id}
  - 所有订阅该 channel 的 WebSocket 服务器将消息转发给客户端
  - Redis Cluster 处理 Pub/Sub fan-out（N 台服务器订阅）

可扩展性:
  - 1000 万活跃用户 / 每台服务器 10K 连接 = 1,000 台 WS 服务器
  - Redis Pub/Sub 吞吐量: 每个集群 ~100K 消息/秒
  - 每天 500 万条消息 = ~58 条消息/秒: 单个 Redis 集群完全足够
```

---

**问：如何检测和处理 listing 价格操纵（例如卖家在订单创建后涨价）？**

答：价格在订单创建时快照：

```sql
orders.item_price  -- 购买时的价格（PAID 后不可变）
orders.listing_id  -- 引用 listing（listing 价格可能会变化）
```

订单价格在买家发起结账时锁定。一旦订单创建完成，listing 的当前价格不再相关。价格历史记录在 `listing_price_history` 表中，用于审计目的。

---

**问：如何处理美国 50 个州和国际的税收征收？**

答：集成专用税务引擎 (Avalara TaxJar)：

```
1. 结账时: 调用 TaxService.calculate(buyerAddress, sellerAddress, items)
   -> 返回 { taxAmount, jurisdictions: [...], breakdown }
2. 从买家征收的税款单独存放在税务 escrow 中
3. 月度批量: TaxService.remit(period) -> 向每个管辖区申报
4. 欧盟 VAT: 注册 OSS (One-Stop-Shop) 方案，在销售点征收 VAT
5. 存储 tax_line_items 表，每笔订单保留 7 年（审计）
```

---

**问：如何设计 promoted listing 的竞价系统？**

答：使���带有质量分数调整的第二价格拍卖（Vickrey auction）：

```
有效 CPM 出价 = seller_bid * quality_score

卖家 A 出价 $2.00，quality = 0.9 -> 有效值 = $1.80
卖家 B 出价 $1.50，quality = 1.0 -> 有效值 = $1.50
卖家 C 出价 $1.80，quality = 0.8 -> 有效值 = $1.44

赢家: 卖家 A（有效值 $1.80）
实际收费: 第二价格 = $1.50（卖家 B 的出价）+ $0.01

实现方式:
  - 出价存储在 Redis sorted set 中: ZADD promoted:cat:{id} score sellerListingId
  - Top-K 提取: ZREVRANGE promoted:cat:{id} 0 2
  - 拍卖在查询时运行（<5ms），使用预索引的有效分数
  - 卖家更新出价或质量分数变化时重新计算分数
```

---

**问：平台在活跃交易期间宕机时会发生什么？**

答：设计为每一步都具备至少一次投递和幂等性：

```
故障模式和恢复:
  1. 客户端在 POST /orders 后超时（无响应）
     -> 客户端使用相同的 idempotency_key 重试
     -> 如果订单已创建，服务端返回缓存的响应
     -> 如果未找到 key，服务端创建新订单

  2. 支付 webhook 丢失
     -> Stripe 使用指数退避重试 webhook（72 小时窗口）
     -> 平台同时轮询 Stripe 中未解决的 PaymentIntent（每小时任务）

  3. 支付成功后 escrow 服务宕机
     -> 支付成功但未创建 escrow 记录
     -> 对账任务: 对于每个 PAID 状态但无 escrow 记录的订单，
        创建 escrow 记录（使用 payment_intent_id 进行幂等插入）

  4. 付款服务宕机
     -> 付款记录保持 PENDING 状态
     -> 恢复后重试任务处理 PENDING 状态的付款
     -> 卖家在仪表盘中看到"付款延迟"状态
```
