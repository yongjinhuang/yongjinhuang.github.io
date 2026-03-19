# 设计广告投放与实时竞价系统（Google Ads / Meta Ads）

---

## 1. 需求澄清

### 功能需求

| #   | 需求            | 描述                                                             |
| --- | --------------- | ---------------------------------------------------------------- |
| 1   | 广告请求投放    | 发布商发送广告请求；系统在延迟预算内返回中标广告素材             |
| 2   | 实时竞价（RTB） | 在 < 80ms 内运行 DSP 之间的 OpenRTB 拍卖，选择中标出价，投放素材 |
| 3   | 广告定向        | 通过上下文、行为、人口统计、再营销和相似受众信号将广告匹配到用户 |
| 4   | CTR 预测        | 使用 ML 模型预测每个候选广告的点击率                             |
| 5   | 拍卖引擎        | 支持第一价格和第二价格拍卖；执行底价和保留价                     |
| 6   | 频次控制        | 在滚动时间窗口内限制每个用户每个广告/活动的展示次数              |
| 7   | 预算节奏控制    | 在活动投放日期内均匀分配广告主支出；防止超支                     |
| 8   | 点击与展示跟踪  | 零丢失记录展示和点击；支持可见性测量                             |
| 9   | 归因            | 将转化归因到广告触点（末次点击、首次点击、多触点、浏览归因）     |
| 10  | 欺诈检测        | 实时检测和过滤点击欺诈、机器人流量和无效流量（IVT）              |
| 11  | 隐私合规        | 在定向前执行 GDPR 同意信号、CCPA 退出和 Apple ATT 选择加入       |
| 12  | 报告与分析      | 为广告主提供近实时的支出、展示、点击和转化仪表板                 |
| 13  | 广告素材管理    | 通过 CDN 上传、审核和投放展示、视频和原生素材                    |
| 14  | 活动管理        | 活动、广告组、广告、预算、定向规则和出价策略的 CRUD 操作         |

### 非功能需求

| #   | 需求           | 目标                                      |
| --- | -------------- | ----------------------------------------- |
| 1   | 广告投放延迟   | < 100ms 端到端（p99）                     |
| 2   | RTB 拍卖延迟   | < 80ms（为素材投放留出余量）              |
| 3   | 可用性         | 99.99%（每年 < 52 分钟停机时间）          |
| 4   | 吞吐量         | 峰值 1M+ 广告请求/秒                      |
| 5   | 点击跟踪持久性 | 零丢失——至少一次投递加去重                |
| 6   | 预算一致性     | 可接受最终一致性（容忍 < 1% 超支）        |
| 7   | 欺诈过滤延迟   | 在投放路径中内联 < 10ms                   |
| 8   | 归因管道延迟   | 近实时 < 15 分钟，最终确认 < 24 小时      |
| 9   | 数据保留       | 原始事件热存储 90 天，冷归档 7 年         |
| 10  | 隐私           | 未经有效同意不存储 PII；30 天后数据匿名化 |

### 规模估算

```
广告请求:            10,000,000,000 (10B) / 天
每秒请求数:          10B / 86,400 = ~115,000 req/s 平均
峰值 (3x 平均):     ~350,000 req/s
绝对峰值:            1,000,000 req/s（节日活动）

RTB 拍卖:            ~60% 的请求进入公开 RTB = 6B 拍卖/天
每次拍卖的 DSP:      ~50 个平均
出价响应:            6B * 50 = 300B 出价响应/天——大部分在 DSP 超时时被过滤

展示:                10B/天
点击:                ~0.1% CTR 平均 = 10M 点击/天 = 116 点击/秒
转化:                ~2% 的点击 = 200K 转化/天

点击流存储:
  展示事件:          ~500 字节
  点击事件:          ~200 字节
  10B 展示:          10B * 500B = 5 TB/天 原始事件
  含副本:            ~15 TB/天 摄入量
  500 TB/天预算      覆盖原始 + 处理后 + 聚合层

用户画像（行为）:
  1B 用户 * 10 KB 画像 = 10 PB 总计
  热工作集（30 天活跃）:  ~100M 用户 * 10 KB = 1 TB 内存中
  画像更新速率:  100M 事件/分钟 → ~1.7M 写入/秒

素材资产:
  10M 发布商页面, 1M 广告主
  ~50M 活跃素材
  平均大小: 50 KB 展示, 5 MB 视频缩略图
  总素材存储: ~50M * 50KB = 2.5 TB（展示）; 视频在 CDN 边缘

广告元数据（活动、定向规则）:
  1M 广告主 * 100 个活动 平均 = 100M 活动记录
  每条记录 ~5 KB → 500 GB 活动元数据总计
```

---

## 2. 广告技术生态系统

### 参与者和角色

```
+------------------+         +------------------+         +------------------+
|   ADVERTISER     |         |    AD EXCHANGE   |         |    PUBLISHER     |
|   广告主          |         |    广告交易平台    |         |    发布商         |
|                  |         |                  |         |                  |
| 希望向用户展示    |         | 运行 RTB 拍卖的   |         | 出售广告位的      |
| 广告             |         | 市场              |         | 网站/应用         |
|                  |         |                  |         |                  |
| 使用 DSP 出价    |         | 连接 DSP          |         | 使用 SSP 出售    |
+--------+---------+         | 和 SSP            |         +--------+---------+
         |                   +--------+---------+                  |
         |                            |                            |
         v                            |                            v
+--------+---------+         +--------+---------+         +--------+---------+
|       DSP        |         |       DMP        |         |       SSP        |
| (Demand-Side     |         | (Data Management |         | (Supply-Side     |
|  Platform)       |         |  Platform)       |         |  Platform)       |
|  需求方平台       |         |  数据管理平台     |         |  供给方平台       |
|                  |         |                  |         |                  |
| 代表广告主       |         | 聚合用户数据、    |         | 管理发布商的      |
| 进行出价         |         | 人群细分、        |         | 库存收益          |
|                  |         | 相似模型          |         |                  |
+------------------+         +------------------+         +------------------+
```

### 完整 RTB 流程

```
  Publisher Page                                          Advertiser
  发布商页面                                               广告主
       |                                                       |
       | 1. 广告位加载                                          |
       v                                                       |
  [SSP / Ad Tag]                                              |
       |                                                       |
       | 2. 出价请求 (OpenRTB)                                 |
       v                                                       |
  [Ad Exchange]                                               |
       |  3. 并行扇出到 N 个 DSP（< 80ms 超时）                |
       |-----------------------------------------------------> |
       |                                                  [DSP]|
       |                                                       |
       |  4. 出价响应（或不出价）                               |
       |<----------------------------------------------------- |
       |                                                       |
       | 5. 运行拍卖（选择中标者）                              |
       |                                                       |
       | 6. 中标通知发送给中标 DSP                              |
       |-----------------------------------------------------> |
       |                                                       |
       | 7. 素材 URL / 标记返回给发布商                         |
       v                                                       |
  [浏览器渲染广告]                                              |
       |                                                       |
       | 8. 展示信标触发                                        |
       | 9. 用户点击时跟踪点击                                  |
       | 10. 在广告主网站上跟踪转化                             |
```

---

## 3. API 设计

### 发布商广告请求 API

```
POST /v1/ad/request
Content-Type: application/json

Request:
{
  "request_id": "req_abc123",
  "publisher_id": "pub_789",
  "page_url": "https://example.com/article/tech",
  "page_categories": ["IAB19", "IAB19-3"],
  "ad_slots": [
    {
      "slot_id": "div-slot-1",
      "width": 728,
      "height": 90,
      "position": "above_fold",
      "floor_price_cpm": 0.50
    }
  ],
  "user": {
    "id": "user_hashed_id",
    "ip": "203.0.113.x",
    "user_agent": "Mozilla/5.0...",
    "consent": { "gdpr": true, "ccpa_opt_out": false }
  },
  "geo": { "country": "US", "region": "CA", "dma": "807" },
  "device": { "type": "desktop", "os": "macOS", "browser": "Chrome" }
}

Response (200 OK):
{
  "request_id": "req_abc123",
  "ads": [
    {
      "slot_id": "div-slot-1",
      "ad_id": "ad_xyz456",
      "creative_url": "https://cdn.adserver.com/creatives/ad_xyz456.html",
      "impression_url": "https://track.adserver.com/imp?id=imp_789&token=...",
      "click_url": "https://track.adserver.com/clk?id=imp_789&token=...",
      "width": 728,
      "height": 90,
      "ad_type": "display"
    }
  ],
  "latency_ms": 47
}
```

### OpenRTB 出价请求（Ad Exchange → DSP）

```
POST /rtb/bid
Content-Type: application/json

{
  "id": "auction_abc123",
  "imp": [
    {
      "id": "1",
      "banner": { "w": 728, "h": 90, "pos": 1 },
      "bidfloor": 0.50,
      "bidfloorcur": "USD"
    }
  ],
  "site": {
    "id": "site_789",
    "page": "https://example.com/article/tech",
    "cat": ["IAB19"],
    "publisher": { "id": "pub_789" }
  },
  "user": {
    "id": "user_hashed_id",
    "buyeruid": "buyer_specific_uid",
    "data": [{ "id": "dmp_segment", "segment": [{ "id": "seg_tech_enthusiast" }] }]
  },
  "device": {
    "ip": "203.0.113.x",
    "ua": "Mozilla/5.0...",
    "devicetype": 2,
    "os": "macOS"
  },
  "tmax": 80,
  "cur": ["USD"]
}
```

### OpenRTB 出价响应（DSP → Ad Exchange）

```
{
  "id": "auction_abc123",
  "seatbid": [
    {
      "bid": [
        {
          "id": "bid_dsp_001",
          "impid": "1",
          "price": 2.35,
          "adid": "creative_567",
          "adm": "<div>...</div>",
          "adomain": ["advertiser.com"],
          "crid": "creative_567",
          "w": 728,
          "h": 90
        }
      ],
      "seat": "dsp_buyer_001"
    }
  ],
  "cur": "USD"
}
```

### 活动管理 API

```
POST   /v1/campaigns                        创建活动
GET    /v1/campaigns/{id}                   获取活动详情
PUT    /v1/campaigns/{id}                   更新活动
DELETE /v1/campaigns/{id}                   暂停/归档活动

POST   /v1/campaigns/{id}/ad-groups         创建带定向的广告组
GET    /v1/campaigns/{id}/ad-groups
PUT    /v1/campaigns/{id}/ad-groups/{agId}

POST   /v1/ad-groups/{id}/ads               创建广告素材
GET    /v1/ad-groups/{id}/ads

POST   /v1/campaigns/{id}/budgets           设置/更新预算
GET    /v1/advertisers/{id}/spend?date=     查询当前支出
```

### 跟踪与归因 API

```
GET  /imp?id={imp_id}&token={token}         展示信标（1x1 像素或重定向）
GET  /clk?id={imp_id}&token={token}         点击重定向和跟踪
POST /v1/conversions                        服务端转化回传

POST /v1/attributions/query                 查询归因报告
     Body: { advertiser_id, date_range, model: "last_click" | "linear" | "time_decay" }

GET  /v1/reports/campaigns/{id}?metrics=impressions,clicks,spend,conversions&granularity=hourly
```

---

## 4. 数据模型

### 活动和广告层级

```sql
CREATE TABLE advertisers (
    advertiser_id   BIGINT PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    status          ENUM('active','paused','suspended') DEFAULT 'active',
    billing_type    ENUM('prepaid','postpaid'),
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE campaigns (
    campaign_id     BIGINT PRIMARY KEY,
    advertiser_id   BIGINT NOT NULL REFERENCES advertisers(advertiser_id),
    name            VARCHAR(255) NOT NULL,
    status          ENUM('draft','active','paused','completed','archived') DEFAULT 'draft',
    campaign_type   ENUM('display','video','native','search'),
    budget_daily    DECIMAL(18,6),               -- 美元
    budget_total    DECIMAL(18,6),
    spend_today     DECIMAL(18,6) DEFAULT 0,
    spend_total     DECIMAL(18,6) DEFAULT 0,
    start_date      DATE NOT NULL,
    end_date        DATE,
    bidding_strategy ENUM('cpm','cpc','cpa','target_roas'),
    target_bid      DECIMAL(10,6),
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE ad_groups (
    ad_group_id     BIGINT PRIMARY KEY,
    campaign_id     BIGINT NOT NULL REFERENCES campaigns(campaign_id),
    name            VARCHAR(255),
    status          ENUM('active','paused','archived'),
    -- 定向
    geo_targets     JSON,                        -- [{"country":"US","region":"CA"}]
    device_targets  JSON,                        -- ["desktop","mobile"]
    age_targets     JSON,                        -- [{"min":25,"max":34}]
    gender_targets  JSON,                        -- ["M","F","U"]
    interest_segments JSON,                      -- DMP 人群细分 ID
    keyword_targets JSON,                        -- 上下文关键词
    retargeting_list_id BIGINT,
    -- 频次控制
    freq_cap_impressions INT DEFAULT 10,
    freq_cap_window     ENUM('hour','day','week','lifetime') DEFAULT 'day',
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE ads (
    ad_id           BIGINT PRIMARY KEY,
    ad_group_id     BIGINT NOT NULL REFERENCES ad_groups(ad_group_id),
    creative_id     BIGINT NOT NULL REFERENCES creatives(creative_id),
    status          ENUM('pending_review','active','paused','rejected','archived'),
    bid_override    DECIMAL(10,6),               -- 如果设置则覆盖广告组出价
    quality_score   DECIMAL(4,3),                -- 0.000-1.000，每日更新
    predicted_ctr   DECIMAL(6,5),                -- 0.00000-0.99999
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE creatives (
    creative_id     BIGINT PRIMARY KEY,
    advertiser_id   BIGINT NOT NULL,
    name            VARCHAR(255),
    creative_type   ENUM('display','video','native','html5'),
    width           INT,
    height          INT,
    asset_url       VARCHAR(2048),               -- CDN URL
    click_through_url VARCHAR(2048),
    duration_sec    INT,                         -- 视频用
    status          ENUM('pending_review','approved','rejected'),
    review_notes    TEXT,
    created_at      TIMESTAMP DEFAULT NOW()
);
```

### 展示和点击事件（Clickhouse / 列式存储）

```sql
-- 存储在 Clickhouse（列式存储）中用于分析
CREATE TABLE impression_events (
    impression_id   UUID,
    request_id      String,
    ad_id           Int64,
    campaign_id     Int64,
    advertiser_id   Int64,
    publisher_id    Int64,
    slot_id         String,
    user_id         String,              -- 哈希/假名化
    auction_price   Decimal(10,6),       -- CPM 清算价格
    bid_price       Decimal(10,6),
    ecpm            Decimal(10,6),
    page_url        String,
    page_categories Array(String),
    geo_country     String,
    geo_region      String,
    device_type     LowCardinality(String),
    os              LowCardinality(String),
    browser         LowCardinality(String),
    is_viewable     UInt8 DEFAULT 0,     -- 由可见性信标设置
    is_fraud        UInt8 DEFAULT 0,
    event_time      DateTime,
    date            Date MATERIALIZED toDate(event_time)
) ENGINE = MergeTree()
  PARTITION BY date
  ORDER BY (advertiser_id, campaign_id, event_time)
  TTL date + INTERVAL 90 DAY;

CREATE TABLE click_events (
    click_id        UUID,
    impression_id   UUID,
    ad_id           Int64,
    campaign_id     Int64,
    advertiser_id   Int64,
    user_id         String,
    publisher_id    Int64,
    click_url       String,
    landing_url     String,
    is_fraud        UInt8 DEFAULT 0,
    time_to_click_sec Float32,
    event_time      DateTime,
    date            Date MATERIALIZED toDate(event_time)
) ENGINE = MergeTree()
  PARTITION BY date
  ORDER BY (advertiser_id, campaign_id, event_time);

CREATE TABLE conversion_events (
    conversion_id   UUID,
    click_id        UUID,              -- 关联到末次点击的点击
    impression_id   UUID,              -- 用于浏览归因
    advertiser_id   Int64,
    campaign_id     Int64,
    conversion_type String,            -- 'purchase', 'signup', 'lead'
    revenue         Decimal(18,6),
    currency        FixedString(3),
    event_time      DateTime,
    date            Date MATERIALIZED toDate(event_time)
) ENGINE = MergeTree()
  PARTITION BY date
  ORDER BY (advertiser_id, campaign_id, event_time);
```

### 用户画像存储（Redis / Aerospike）

```
Key:   user:{user_id}:profile
Value: {
  "segments":    ["seg_tech", "seg_auto_intender", "seg_18-34"],
  "interests":   ["electronics", "travel", "sports"],
  "retarget_ads": ["adv_123:campaign_456"],       -- 过去 30 天内看过的广告
  "freq_caps":   {
    "campaign_789": { "day": 3, "week": 10 },
    "campaign_012": { "day": 1, "week": 5 }
  },
  "last_seen":   1706745600,
  "consent":     { "gdpr": true, "ccpa_opt_out": false }
}
TTL: 30 天（滚动）
```

### 预算节奏状态（Redis）

```
Key:   budget:campaign:{campaign_id}:day:{YYYYMMDD}
Value: { "spend": 4523.45, "impressions": 1200000, "updated_at": ... }
TTL:   48 小时

Key:   budget:campaign:{campaign_id}:total
Value: { "spend": 98234.12, "impressions": 25000000 }
```

---

## 5. 高层架构

```
                         +-----------------------+
                         |  发布商 / 浏览器       |
                         +-----------+-----------+
                                     |
                              广告请求 (HTTP)
                                     |
                         +-----------v-----------+
                         |    负载均衡器 /        |
                         |    边缘（Anycast）     |
                         +-----------+-----------+
                                     |
                  +------------------+------------------+
                  |                                     |
      +-----------v-----------+           +------------v-----------+
      |   广告投放 API         |           |  RTB 网关               |
      |   （无状态）           |           |  （扇出到 DSP）          |
      |   - 认证、同意检查     |           |  - OpenRTB 协议          |
      |   - 速率限制           |           |  - 超时: 80ms            |
      +----+----------+-------+           +------------+-----------+
           |          |                                |
           |          |                    +-----------v-----------+
           |          |                    |   拍卖引擎             |
           |          |                    |   - 第一/第二价格       |
           |          |                    |   - 底价执行            |
           |          |                    +----------+------------+
           |          |                               |
  +--------v---+  +---v--------+           +----------v-----------+
  | 定向服务    |  | CTR/排名   |           |  中标通知服务          |
  |            |  | 预测器     |           |  - 计费事件            |
  |            |  |            |           |  - 素材 URL            |
  | - 人群细分  |  | - ML 模型  |           +----------+-----------+
  |   查找     |  | - 特征     |                      |
  | - 频次控制  |  |   工程     |             [中标 DSP]
  | - 同意检查  |  +------------+
  +--------+---+
           |
  +--------v---+
  | 候选广告    |
  | 获取器     |
  | （索引）    |
  +------------+

共享服务:
  +--------------------+     +--------------------+     +--------------------+
  |  用户画像           |     |  预算节奏            |     |  素材 CDN           |
  |  存储 (Aerospike)  |     |  服务 (Redis)        |     |  (CloudFront/S3)   |
  +--------------------+     +--------------------+     +--------------------+

跟踪管道:
  +--------------------+     +--------------------+     +--------------------+
  |  展示 /             |     |  Kafka             |     |  Clickhouse        |
  |  点击跟踪器         +---->|  （事件总线）        +---->|  （分析数据库）     |
  +--------------------+     +--------------------+     +--------------------+
                                        |
                              +---------v---------+
                              |  归因与             |
                              |  欺诈检测管道       |
                              |  (Flink/Spark)     |
                              +-------------------+
```

---

## 6. 深入探讨：广告投放管道

### 端到端请求流程（< 100ms 预算）

```
t=0ms    发布商发送广告请求
          |
t=1ms    边缘 PoP 接收请求，TLS 本地终止
          |
t=2ms    认证 + 同意检查（Redis 查找）
          |
t=5ms    用户画像丰富（Aerospike：人群细分、频次控制）
          |
t=8ms    从倒排索引中检索候选广告
          | - 按以下条件过滤：地理、设备、IAB 类别、预算活跃状态
          | - 在 < 5ms 内获取约 1000 个候选
          |
t=15ms   频次控制过滤（Redis bitfield 检查）
          | - 丢弃超出上限的广告
          | - 剩余约 500 个候选
          |
t=20ms   CTR 预测（对 500 个候选进行批量推理）
          | - 特征向量组装
          | - 模型推理（ONNX runtime，GPU 批处理）
          | - ~200ms 会太慢 → 预缓存分数 + 增量
          |
t=30ms   eCPM 排名
          | eCPM = bid * predicted_CTR * quality_score
          | 选择 top-K 广告（K=5 用于备选）
          |
t=35ms   预算节奏检查
          | - 活动是否在节奏预算内？（概率检查）
          | - 节流概率 = remaining_budget / expected_remaining_spend
          |
t=40ms   直接销售广告拍卖（如果适用）
          |
t=50ms   RTB 拍卖开始（与直接检查并行）
         [参见 RTB 深入探讨]
          |
t=120ms  ** 风险：RTB 可能超过 100ms **
         解决方案：RTB 在 80ms 超时；如果没有中标者则回退到自有广告
          |
t=85ms   选出中标者，组装素材 URL
          |
t=95ms   响应返回给发布商
          |
t=100ms  浏览器开始渲染素材
```

### 广告候选索引

候选检索步骤使用一个**倒排索引**（类似搜索引擎），将定向条件映射到广告 ID：

```
+-------------------------+      +--------------------------+
|  广告索引（内存中）       |      |   定向维度               |
|                         |      |                          |
| geo:US:CA -> [ad1, ad5] |      | geo, device, os,         |
| cat:IAB19 -> [ad2, ad5] |      | browser, IAB category,   |
| dev:mobile -> [ad3, ad5]|      | age, gender, language,   |
| seg:tech  -> [ad2, ad4] |      | keyword（上下文）,        |
|   ...                   |      | retargeting list         |
+-------------------------+      +--------------------------+
```

索引按发布商分区，每 5 分钟从数据库重建。热数据在每个投放节点上约占 100 GB RAM。

---

## 7. 深入探讨：实时竞价（RTB）

### OpenRTB 协议概述

**OpenRTB** 规范（IAB Tech Lab）标准化了广告交易平台和 DSP 之间的出价请求/响应格式。2.6 版本是当前标准。

```
出价请求中的关键字段：
  imp[]        - 展示对象（尺寸、底价、广告类型）
  site/app     - 发布商上下文
  user         - 用户信号（哈希 ID、人群细分、同意）
  device       - 设备信号（IP、UA、OS）
  tmax         - 最大响应时间（毫秒）（例如 80）

出价响应中的关键字段：
  seatbid[].bid[].price   - CPM 出价（美元）
  seatbid[].bid[].adm     - 广告标记（HTML/VAST）
  seatbid[].bid[].adomain - 广告主域名（用于品牌安全）
  seatbid[].bid[].crid    - 素材 ID 用于去重
```

### RTB 拍卖架构

```
   Ad Exchange
   广告交易平台
        |
        | 扇出（并行 HTTP/2 到所有注册的 DSP）
        |
   +----+----+----+----+----+
   |    |    |    |    |    |
  DSP  DSP  DSP  DSP  DSP  ...  (50-200 个 DSP)
   |    |    |    |    |    |
   +----+----+----+----+----+
        |
        | 收集响应（80ms 硬超时）
        |
   +----v----+
   | 拍卖    |   <- 过滤：底价、品牌安全、广告质量
   | 引擎    |   <- 选择中标者（第一或第二价格）
   +----+----+
        |
   +----+--------+----------+
   |             |          |
   v             v          v
中标通知     落选通知     计费
（给中标者） （可选，     事件
            给落选者）
```

### 超时处理

未在 `tmax`（80ms）内响应的 DSP 被视为不出价。交易平台必须处理：

1. **部分超时**：部分 DSP 响应，其他超时。使用可用出价继续。
2. **全部超时**：没有 DSP 响应。投放自有广告或直接销售备选。
3. **无效响应**：格式错误的 JSON、出价低于底价、禁止的素材。静默丢弃。

### 拍卖类型

**第二价格拍卖（Vickrey）：**

```
出价: [DSP-A: $3.00, DSP-B: $2.50, DSP-C: $1.80]
中标者: DSP-A
清算价格: $2.50 + $0.01 = $2.51（第二高价 + $0.01）

特点：
  - 真实出价：最优策略是按真实价值出价
  - 发布商收入 < 最高出价
  - 在 2019 年之前主导程序化广告
```

**第一价格拍卖：**

```
出价: [DSP-A: $3.00, DSP-B: $2.50, DSP-C: $1.80]
中标者: DSP-A
清算价格: $3.00（中标者支付其确切出价）

特点：
  - DSP 进行出价压低（低于真实价值出价以最大化剩余）
  - 发布商收入 = 最高出价（在出价压低之前）
  - 现在在程序化广告中占主导地位（Google 在 2019 年转向第一价格）
  - 需要 DSP 使用出价压低算法
```

**Header Bidding：**

Header Bidding 允许发布商同时向多个广告交易平台提供库存（在传统瀑布流之外），增加竞争。

```
浏览器
  |
  | 1. 发布商 JS（Prebid.js）同时调用所有 SSP
  |
  +--SSP-A: 出价 $2.10
  +--SSP-B: 出价 $1.80
  +--SSP-C: 出价 $2.45  <- 中标者
  |
  | 2. 最佳 header bid ($2.45) 与直接销售底价竞争
  |
  | 3. 如果 header bid > 底价，header bid 中标
  | 4. 如果存在直接销售，直接销售通常中标
  |
  v
广告投放
```

---

## 8. 深入探讨：广告定向

### 定向类型

```
+-------------------------+------------------------------------------+
|  定向类型                |  实现方式                                 |
+-------------------------+------------------------------------------+
| 上下文定向               | 分类页面内容（IAB 分类法）                 |
|                         | 匹配页面文本中的关键词                     |
|                         | 不需要用户数据（隐私安全）                 |
+-------------------------+------------------------------------------+
| 行为定向                 | 来自浏览历史的用户兴趣细分                 |
|                         | （Cookie / 设备 ID）                      |
|                         | 存储在 DMP 中，每日刷新                    |
+-------------------------+------------------------------------------+
| 人口统计定向             | 年龄、性别、收入（推断或                    |
|                         | 在社交平台上声明的）                       |
+-------------------------+------------------------------------------+
| 再营销                   | 访问过广告主网站的用户                     |
|                         | 像素触发 → 用户添加到列表                  |
|                         | 在其他网站上展示后续广告                    |
+-------------------------+------------------------------------------+
| 相似受众                 | 找到与广告主最佳客户相似的用户              |
|                         | （ML 嵌入相似度）                          |
+-------------------------+------------------------------------------+
| 地理定向                 | 国家、DMA、城市、邮政编码、半径             |
|                         | IP 地理定位或 GPS（移动端）                 |
+-------------------------+------------------------------------------+
| 设备 / 浏览器            | OS、浏览器、设备类型、运营商                |
+-------------------------+------------------------------------------+
| 时段定向                 | 分时段投放（仅在上午 9 点至下午 5 点展示广告）|
+-------------------------+------------------------------------------+
```

### 再营销像素流程

```
  广告主网站                      广告服务器
        |                               |
  [用户访问 /checkout]                   |
        |                               |
  [再营销像素触发]                       |
  GET https://px.adserver.com/         |
      pixel?adv=123&page=checkout       |
                                        |
                               [广告服务器] 将 user_id
                               添加到再营销列表 123
                               （Redis SET，TTL 30 天）
                                        |
  [用户访问发布商网站]                    |
        |                               |
  [发送广告请求]                         |
        |-----------------------------> |
                               [检查再营销列表]
                               用户在列表 123 中 → 有资格
                               获得广告主 123 的再营销广告
```

### 相似受众算法

```
1. 种子受众：
   - 广告主提供"最佳客户"用户列表（邮箱哈希）
   - DMP 映射到内部用户 ID

2. 特征提取：
   - 对每个种子用户：提取兴趣向量（嵌入）
   - 维度：来自浏览行为的约 1000 个兴趣特征
   - 归一化到单位球面

3. 相似搜索（ANN）：
   - 使用 FAISS 或 ScaNN 在嵌入空间中查找最近邻
   - 检索与种子受众最相似的 top-N% 用户
   - N% 由广告主配置（可寻址受众的 1%-20%）

4. 排除：
   - 从相似受众中移除种子用户（无冗余定向）
   - 移除已退出的用户（GDPR/CCPA）
```

---

## 9. 深入探讨：CTR 预测

### CTR 预测的重要性

广告排名公式为：

```
eCPM = bid_price_cpm * predicted_CTR * quality_score

其中：
  bid_price_cpm   = 广告主的最高出价（CPM 或从 CPC 转换）
  predicted_CTR   = P(点击 | 展示上下文, 广告, 用户)
  quality_score   = 相关性/着陆页质量（0-1）

示例：
  广告 A: bid=$5.00 CPM, predicted_CTR=0.01, QS=0.8 → eCPM = $0.04
  广告 B: bid=$2.00 CPM, predicted_CTR=0.05, QS=0.9 → eCPM = $0.09
  广告 B 尽管出价较低但因为预测 CTR 更高而中标
```

### 特征工程

```
用户特征：
  - 人口统计：年龄段、性别、收入（推断）
  - 兴趣细分：[0, 1, 1, 0, ...]（二值，500 维）
  - 该广告格式的历史 CTR
  - 上次点击的时间
  - 设备类型、OS、浏览器

广告特征：
  - 广告素材 ID 嵌入
  - 历史 CTR（基础率）
  - 广告主域名质量分数
  - 素材尺寸和格式
  - 着陆页质量分数

上下文特征：
  - 发布商网站 / 应用类别
  - 页面主题嵌入
  - 页面位置（首屏之上、首屏之下）
  - 一天中的时间、一周中的哪天
  - 广告-用户亲和度分数（用户是否访问过广告主网站？）

交叉特征：
  - （用户细分, 广告类别）交互
  - （设备类型, 广告格式）交互
  - （一天中的时间, 用户细分）
```

### 模型架构

```
逻辑回归（快速、可解释）：
  - 特征哈希技巧（2^24 桶）
  - 通过 FTRL-Proximal 优化器进行在线学习
  - 每 5 分钟使用最近点击数据更新模型
  - 推理延迟：每个广告约 1ms（通过向量化可在 2ms 内对 500 个广告评分）

深度学习（更高精度、更高延迟）：
  - 架构：Wide & Deep（Google, 2016）或 DLRM（Meta, 2019）
  - Wide：通过交叉稀疏特征进行记忆（逻辑回归）
  - Deep：通过嵌入层 + MLP 进行泛化
  - 嵌入维度：每个分类特征 32-64
  - 推理：ONNX Runtime + GPU 批量评分 → 500 个广告约 10ms

生产策略：
  - 使用 LR 模型进行初始评分和 top-K 选择（约 1000 → 100）
  - 使用 DL 模型进行最终重排序（100 → top-5）
  - 两阶段将 DL 推理从 500 → 100 个候选（节省 5 倍）
```

### 训练管道

```
原始点击流 (Kafka)
        |
        v
特征存储（离线）
  - 将展示事件与点击标签连接（延迟：24 小时窗口）
  - 负采样：每 1 个点击采样 1 个未点击（1:1 比例）
  - 特征提取和向量化
        |
        v
训练（每日批处理）
  - 使用过去 7 天的数据训练
  - 在保留的一天上验证
  - A/B 影子模型后再提升
        |
        v
模型注册表 (MLflow)
        |
        v
模型服务 (TorchServe / ONNX Runtime)
  - 蓝绿部署（流量分割）
  - AUC 下降时回滚
```

---

## 10. 深入探讨：频次控制

### 问题描述

没有频次控制，用户可能每天看到同一广告数百次，导致：

- 广告疲劳和负面品牌联想
- 在增量曝光上浪费广告主预算
- 用户体验差

### 分布式频次控制架构

```
频次控制配置：  "活动 789：每用户每天最多 5 次展示"

每个广告请求：
  1. 在 Redis 中查找用户该活动的展示计数
  2. 如果计数 >= 上限，从拍卖中排除该活动
  3. 如果计数 < 上限，包含，并在展示后原子递增

Redis 数据结构：
  Key:   fc:{user_id}:{campaign_id}:{YYYYMMDD}
  Type:  String（整数）
  Cmd:   INCR fc:user123:camp789:20250301
         返回新计数；如果 > 上限，丢弃展示（但计数已递增）
  TTL:   48 小时（覆盖当天 + 次日）

更好的方式（原子检查并递增）：
  使用 Lua 脚本确保原子性：

  local key = KEYS[1]
  local cap = tonumber(ARGV[1])
  local current = redis.call('GET', key)
  if current == false then
    redis.call('SET', key, 1, 'EX', 172800)
    return 1  -- 允许，首次展示
  elseif tonumber(current) < cap then
    return redis.call('INCR', key)  -- 允许
  else
    return -1  -- 已达上限，拒绝
  end
```

### 滑动窗口频次控制

对于"每小时 10 次展示"风格的限制，使用 Redis 有序集合：

```
Key:   fc_sw:{user_id}:{campaign_id}
Type:  Sorted Set（有序集合）
Score: Unix 时间戳（毫秒）
Value: impression_id

每次展示的算法：
  1. ZADD key {timestamp_ms} {impression_id}
  2. ZREMRANGEBYSCORE key 0 {timestamp_ms - window_ms}  -- 淘汰旧的
  3. ZCARD key  -- 窗口内计数
  4. 如果计数 > 上限：拒绝（并 ZREM 刚添加的条目）

清理：Key 在 2 * 窗口时长后过期
```

### 大规模近似计数

对于 1B 用户和 100K 活动：精确的 Redis 每用户计数器太昂贵（1B \* 100K = 100T 个 key）。使用分层方式：

```
第一层（精确，热用户）：
  - 在 Redis 中存储过去 24 小时活跃的用户（约 100M 用户）
  - ~100M * （平均 5 个活动）* 8 字节 = 4 GB 每个 Redis 集群

第二层（概率，所有用户）：
  - 每个（活动, 时间窗口）使用 Count-Min Sketch
  - 误报率约 1%（在已达上限时展示广告）——可接受
  - 内存：O(campaigns * sketch_width * sketch_depth)
  - 对于 100K 活动：100K * 5000 * 4 字节 = 2 GB
```

---

## 11. 深入探讨：预算节奏控制

### 问题描述

广告主设定每天 $10,000 的预算。如果我们在前 2 小时内用完所有预算，活动在剩余 22 小时内处于黑暗状态，导致覆盖指标差，并错过晚间高峰时段的转化。

### 节奏算法

**节流（概率节奏）：**

```
预期每小时支出 = daily_budget / 24 小时
当前小时支出在 Redis 中跟踪

在每个广告请求（对于该活动）：
  pace_ratio = remaining_budget / expected_remaining_budget

  if pace_ratio >= 1.0:
    always_serve（节奏不足，加快支出）
  elif pace_ratio >= 0.8:
    以概率 = pace_ratio 投放
  else:
    积极节流：以概率 = pace_ratio^2 投放

示例：
  预算：$1000/天
  当前时间：中午 12:00（一天已过 50%）
  预期支出在中午：$500
  实际支出：$800（节奏过快）
  pace_ratio = ($1000-$800) / ($1000-$500) = $200/$500 = 0.40
  投放概率 = 0.40^2 = 0.16（节流到 16% 的请求）
```

**反馈控制（PID 控制器）：**

```
目标：每分钟花费 $X 以在 end_date 时用完预算
实际：跟踪实际支出速率（滚动 5 分钟窗口）

Error = target_rate - actual_rate

throttle_adjustment = Kp * error + Ki * integral_error + Kd * derivative_error

其中 Kp、Ki、Kd 是调优常数。

优势：平滑收敛，处理突发流量模式
```

### 预算节奏服务架构

```
+------------------+       +------------------+       +------------------+
|  广告投放 API     |       |  节奏服务         |       |   Redis 集群     |
|                  |       |                  |       |                  |
|  拍卖前：         +------>| check_pacing(    |<----->| budget:camp:1234 |
|  should_serve =  |       |   campaign_id)   |       | { spend: 4523.45 |
|  pacing.check()  |       |                  |       |   limit: 10000   |
|                  |       | 返回：True/       |       |   pace_ratio: .9 |
|  中标后：         |       |   False + ratio  |       |   updated: now } |
|  pacing.record(  +------>|                  |       +------------------+
|   campaign_id,   |       | record_spend(    |
|   clearing_price)|       |   campaign_id,   |
|                  |       |   price)         |
+------------------+       +------------------+
                                    |
                            [后台任务]
                            每 1 分钟：
                            - 计算 pace_ratio
                            - 更新 Redis
                            - 暂停超预算的活动
                            - 异常告警
```

---

## 12. 深入探讨：归因模型

### 归因触点

```
第 1 天       第 3 天       第 5 天       第 7 天（转化）
  |            |            |            |
[浏览]       [点击]       [浏览广告]    [购买]
展示          搜索         再营销        $99.00
  广告          广告          广告

末次点击归因：  100% 归功于搜索广告（第 3 天点击）
首次点击归因：  100% 归功于展示广告（第 1 天浏览）
线性归因：      每个触点 33.3%
时间衰减归因：  第 7 天：40%，第 5 天：30%，第 3 天：20%，第 1 天：10%
位置归因（U 形）：首次 40%，末次 40%，中间平分 20%
浏览归因：      如果窗口内没有点击，转化归功于浏览广告
```

### 归因管道

```
转化事件（像素 / 服务端回传）
        |
        v
Kafka topic: conversions
        |
        v
归因服务（Flink 流处理作业）
  - 回溯窗口：点击 30 天，浏览归因 7 天
  - 在 S3/Hive 中将转化与展示/点击日志关联
  - 应用选定的归因模型
  - 发出 attribution_credit 事件
        |
        +---> Kafka: attribution_credits
                  |
                  v
          活动统计更新器
          - 在 Clickhouse 中更新转化、CPA、ROAS
          - 近实时：15 分钟延迟（微批次）
          - 最终确认：转化后 24 小时（允许延迟信标）

跨设备归因：
  - 确定性：相同登录（已知 user_id）
  - 概率性：设备指纹相似度 + IP 匹配
  - 身份图谱：第三方数据（LiveRamp）链接设备
```

---

## 13. 深入探讨：欺诈检测

### 广告欺诈类型

```
+-------------------------+------------------------------------------+
|  欺诈类型                |  描述                                    |
+-------------------------+------------------------------------------+
| 点击欺诈                 | 竞争对手或发布商点击自己的                  |
|                         | 广告以耗尽广告主预算                       |
+-------------------------+------------------------------------------+
| 机器人流量               | 自动化机器人模拟页面浏览                    |
|                         | 和广告展示（无真实用户）                    |
+-------------------------+------------------------------------------+
| 点击农场                 | 低成本人工点击广告                         |
|                         | （难以与真实流量区分）                      |
+-------------------------+------------------------------------------+
| 域名欺骗                 | 虚假发布商在出价请求中冒充                  |
|                         | 高端网站 ID（OpenRTB 欺诈）                |
+-------------------------+------------------------------------------+
| 广告堆叠                 | 多个广告堆叠，只有顶部可见                  |
|                         | 但所有都计为"展示"                         |
+-------------------------+------------------------------------------+
| 像素填充                 | 1x1 像素广告计为展示，                     |
|                         | 用户永远看不到                             |
+-------------------------+------------------------------------------+
| 浏览欺诈 (SIVT)          | 复杂无效流量：                             |
|                         | GIVT = 一般无效流量（已知机器人列表）        |
+-------------------------+------------------------------------------+
```

### 欺诈检测系统

```
两个阶段：内联（< 10ms）和异步（投放后）

内联（实时，阻塞）：
  1. IP 黑名单检查（已知机器人网络、数据中心）
     - 内存中布隆过滤器：约 1B IP，约 1 GB RAM
  2. User-Agent 分析（已知机器人 UA 字符串）
  3. 同意信号验证（GDPR/CCPA）
  4. 发布商白名单/黑名单（IAB ads.txt 验证）
  5. 点击间隔检查：如果同一用户在 < 1 秒前点击了同一广告，拒绝

异步（投放后，5 分钟延迟）：
  1. 点击模式分析：
     - 每个 IP 的点击率 > 100/分钟 → 标记为机器人
     - 点击到转化率异常
     - 地理不一致（美国广告，马来西亚 IP）
  2. 会话分析：
     - 鼠标移动模式（JS 信号）
     - 会话时长、滚动行为
  3. 设备指纹聚类：
     - 多个 IP 共享相同指纹 → 机器人农场
  4. 发布商异常检测：
     - 发布商 CTR 飙升 > 基线 10 倍 → 调查
     - 高流量的新发布商突然出现 → 暂扣付款

输出：
  - 展示/点击记录上的 is_fraud 标志
  - 自动退款到广告主账户
  - 发布商付款暂扣等待调查
```

---

## 14. 深入探讨：隐私与用户身份

### 隐私法规影响

```
+------------------+----------------------------------------------+
|  法规             |  广告技术影响                                  |
+------------------+----------------------------------------------+
| GDPR（欧盟）      | 行为跟踪前需要同意                             |
|                  | 被遗忘权：从 DMP 删除用户                       |
|                  | 数据最小化：仅收集必要的                        |
|                  | 出价请求中的同意字符串（IAB TCF 2.0）            |
+------------------+----------------------------------------------+
| CCPA（加州）      | 选择退出"出售"个人信息                          |
|                  | OpenRTB 中的 us_privacy 字符串                  |
|                  | 在 15 个工作日内执行退出                        |
+------------------+----------------------------------------------+
| ATT（iOS 14.5+） | 应用跟踪透明度：需要明确选择加入                  |
|                  | 未经同意 IDFA（设备 ID）不可用                   |
|                  | SKAdNetwork 用于聚合归因                        |
+------------------+----------------------------------------------+
| 第三方 Cookie 弃用 | Chrome 阻止第三方 Cookie（2024+）              |
|                  | Privacy Sandbox：Topics API、Protected          |
|                  | Audience API (FLEDGE) 替代基于 Cookie 的方式     |
+------------------+----------------------------------------------+
```

### 隐私保护定向替代方案

**Topics API（Chrome Privacy Sandbox）：**

```
浏览器在本地观察用户的浏览历史
将用户分配到每周"主题"（例如"技术 > 软件"）
分类法：350 个主题

在广告请求时：
  - 浏览器 JS API 返回 3 个主题（当前周 + 过去 2 周）
  - 不跨网站共享用户 ID
  - 添加噪声：5% 概率出现随机主题

发布商页面调用：
  document.browsingTopics().then(topics => {
    // topics = [{ topic: 142, version: "1:2" }]  // "Technology"
    // 通过 URL 参数传递给广告服务器，而不是第三方 Cookie
  })
```

**FLEDGE / Protected Audience API：**

```
无需第三方 Cookie 的再营销：

1. 广告主将用户加入兴趣组（浏览器本地）：
   navigator.joinAdInterestGroup({
     owner: 'https://advertiser.com',
     name: 'checkout_abandoner',
     biddingLogicUrl: 'https://dsp.com/bid.js',
     ads: [{ renderUrl: 'https://cdn.com/ad.html' }]
   }, 30 * 24 * 3600)  // 30 天会员资格

2. 在发布商页面，拍卖在隔离的 "worklet" 中运行：
   navigator.runAdAuction({
     seller: 'https://adexchange.com',
     decisionLogicUrl: 'https://adexchange.com/score.js',
     interestGroupBuyers: ['https://advertiser.com'],
   })
   // 拍卖在客户端进行；中标广告在 Fenced Frame 中渲染
   // 没有跨站用户数据离开浏览器
```

### 同意执行架构

```
广告请求（带同意字符串）
        |
        v
+-------+-------+
| 同意网关       |
|               |
| 解析 IAB TCF  |  没有行为同意？
| 同意字符串     +----------------------> 仅上下文模式：
|               |                        - 无用户细分
| 检查 CCPA     |                        - 无再营销
| us_privacy    |                        - 无频次控制
|               |                          （无法识别用户）
| 检查 ATT      |                        - 仅上下文定向
| （移动端）     |
+-------+-------+
        |
  所有目的都获得同意？
        |
        v
完整行为定向管道
```

---

## 15. 深入探讨：展示跟踪与可见性

### 展示跟踪方法

```
方法 1：1x1 跟踪像素（标准）
  广告 HTML 包含：<img src="https://track.adserver.com/imp?id=..." width=1 height=1>
  当浏览器加载广告时，像素请求自动触发
  问题：广告拦截器、无渲染的预获取

方法 2：JavaScript 信标
  广告 JS 调用：new Image().src = "https://track.adserver.com/imp?..."
  比像素更可靠；可以包含可见性检查

方法 3：服务端对服务端（S2S）
  发布商服务器在渲染后 ping 广告服务器（程序化）
  更高保真度；不受浏览器端阻止的影响

视频跟踪（VAST/VPAID）：
  VAST（视频广告投放模板）：视频广告的 XML 描述符
  <Tracking event="start">   <![CDATA[https://track.../start]]>
  <Tracking event="firstQuartile">   ...
  <Tracking event="midpoint">   ...
  <Tracking event="thirdQuartile">   ...
  <Tracking event="complete">   ...
  <Tracking event="impression">   ...
```

### 可见性标准（MRC）

```
展示广告：>= 50% 的像素可见持续 >= 1 秒
视频广告：>= 50% 的像素可见持续 >= 2 秒

测量：Intersection Observer API
  const observer = new IntersectionObserver(
    (entries) => {
      const entry = entries[0]
      if (entry.intersectionRatio >= 0.5) {
        viewableStartTime = Date.now()
      } else if (viewableStartTime) {
        const duration = Date.now() - viewableStartTime
        if (duration >= 1000) {
          fireViewabilityBeacon(impression_id)
        }
      }
    },
    { threshold: 0.5 }
  )
  observer.observe(adElement)
```

### 点击跟踪管道

```
用户点击广告
        |
        | 点击 URL: https://track.adserver.com/clk?id=imp_789&token=...
        v
点击跟踪服务（边缘，Anycast）
  - 解析展示 ID + HMAC 令牌（防止点击填充）
  - 写入 Kafka：topic=clicks（异步，非阻塞）
  - 立即 302 重定向到着陆页（< 5ms）
        |
        | Kafka 消费者
        v
点击处理器（Flink）
  - 去重：在 Redis 中检查 click_id（TTL 24 小时）——防止重复计数
  - 欺诈检查：按 IP、按展示进行速率限制
  - 与展示记录关联以丰富数据
  - 写入 Clickhouse 点击表
  - 发送到归因管道
        |
        v
实时报告更新（< 1 分钟延迟）
```

---

## 16. 深入探讨：边缘广告投放

### 素材的 CDN 架构

```
素材上传流程：
  广告主上传素材（图片/HTML/视频）
        |
  素材审核服务（ML + 人工审核）
        |  已批准
        v
  源存储 (S3)
        |
  CDN 失效 / 预热
        |
  边缘 PoP 缓存（CloudFront / Fastly / Akamai）
  - 全球 200+ PoP
  - 展示素材：约 50 KB → 从缓存中 < 5ms 投放
  - 缓存 TTL：24 小时（素材很少变更）
  - 缓存键：{creative_id}:{width}x{height}

边缘广告投放：
  - 广告决策逻辑在 PoP 运行（而非源站）
  - 边缘用户画像缓存：每个 PoP 区域 1 跳 Redis
  - CTR 模型缓存在边缘（每 30 分钟更新）
  - 频次控制读取：边缘 Redis → 2ms vs 跨区域 50ms

延迟分解（边缘优化）：
  TLS 握手（恢复）：      5ms
  路由 + 负载均衡：       2ms
  同意 + 欺诈检查：       3ms
  用户画像查找：          2ms（边缘 Redis）
  候选检索：              5ms（边缘索引）
  CTR 评分（LR 模型）：   2ms
  预算节奏检查：          2ms
  响应组装：              1ms
  网络 RTT（边缘→客户端）：10ms
  ----------------------------------
  总计：                  ~32ms（远在 100ms 预算之内）
```

### 边缘广告服务器架构

```
                    +-----------+     +-----------+     +-----------+
                    |  美国东部   |     |  欧洲西部   |     | 亚太南部   |
                    |  PoP      |     |  PoP      |     |  PoP      |
                    |           |     |           |     |           |
                    | 广告引擎   |     | 广告引擎   |     | 广告引擎   |
                    | CTR 模型  |     | CTR 模型  |     | CTR 模型  |
                    | 广告索引   |     | 广告索引   |     | 广告索引   |
                    | 边缘 Redis|     | 边缘 Redis|     | 边缘 Redis|
                    +-----+-----+     +-----+-----+     +-----+-----+
                          |                 |                 |
                          |   每 5 分钟同步                    |
                          |   （活动数据、预算）                |
                          |                 |                 |
                    +-----v-----------------v-----------------v-----+
                    |               控制平面                         |
                    |  活动数据库  |  预算服务  |  ML 模型            |
                    +-----------------------------------------------+

RTB 发送到中心化交易平台（延迟敏感，DSP 是中心化的）
直接销售广告完全在边缘投放（不需要 RTB）
```

---

## 17. 扩展策略

### 按组件水平扩展

```
+----------------------------+--------------+---------------------------+
| 组件                        | 扩展单元      | 策略                       |
+----------------------------+--------------+---------------------------+
| 广告投放 API                 | 无状态       | 基于 CPU/RPS 自动扩展       |
|                            |              | 目标 1M req/s：约 500 Pod  |
+----------------------------+--------------+---------------------------+
| RTB 网关                    | 无状态       | 随拍卖量扩展                |
|                            |              | 异步 HTTP/2 扇出            |
+----------------------------+--------------+---------------------------+
| 用户画像存储                 | 分区         | Aerospike 集群              |
|                            |              | 按 user_id 哈希分片         |
|                            |              | 100 节点，总计 1TB+ RAM    |
+----------------------------+--------------+---------------------------+
| 频次控制 Redis               | 分区         | Redis Cluster，32 分片     |
|                            |              | 按 user_id 一致性哈希       |
+----------------------------+--------------+---------------------------+
| Kafka（事件总线）            | 分区         | 每个 topic 200 个分区       |
|                            |              | 3 倍复制因子                |
+----------------------------+--------------+---------------------------+
| Clickhouse（分析）           | 分片         | 按 advertiser_id 分片       |
|                            |              | MergeTree + ReplicatedMT   |
+----------------------------+--------------+---------------------------+
| CTR 模型服务                 | 无状态       | GPU Pod，自动扩展            |
|                            |              | TorchServe 批量推理          |
+----------------------------+--------------+---------------------------+
| 预算节奏服务                 | 半有状态     | 每个活动一个主节点            |
|                            |              | Redis 支持的状态             |
+----------------------------+--------------+---------------------------+
| 欺诈检测                    | 无状态       | 流处理（Flink）              |
|                            |              | 布隆过滤器复制               |
+----------------------------+--------------+---------------------------+
```

### 数据层扩展

```
活动元数据（MySQL/PostgreSQL）：
  - 投放路径的读副本（广告候选查找）
  - 主节点用于写入（活动 CRUD、预算更新）
  - 缓存层：Redis，活跃活动 5 分钟 TTL
  - 定向规则缓存在每个投放节点的进程中（每分钟刷新）

用户画像（Aerospike）：
  - 内存 + SSD 混合存储
  - 1 亿热画像在 RAM 中：集群范围约 1 TB
  - 亚毫秒读取（可用区内 < 1ms p99）
  - 跨区域复制：异步，每区域 2 个副本

点击流（Kafka → Clickhouse）：
  - Kafka：10 个 Broker 上每天摄入 500 TB
  - Clickhouse：列式压缩 10:1 → 每天存储 50 TB
  - 分层存储：NVMe SSD 用于热数据（30 天），S3 支持冷数据
  - 查询延迟：即席查询 < 5 秒，预聚合仪表板 < 100ms
```

### 全球分布

```
广告投放：多区域主动-主动（美国、欧洲、亚太、拉丁美洲）
  - Anycast DNS 将请求路由到最近的 PoP
  - 每个区域服务其本地流量
  - 热路径中没有跨区域调用

RTB：按地理集群中心化（美国、欧洲、亚太）
  - DSP 连接到区域交易平台端点
  - 出价处理与 DSP 基础设施同地部署

数据同步：
  - 活动状态：异步复制延迟 < 5 秒可接受
  - 预算状态：共享全局 Redis，乐观并发
    （允许超支最多 1%，通过对账调整）
  - 用户画像：默认区域隔离，跨区域用于
    确定性跨设备（哈希邮箱匹配）
```

---

## 18. 权衡取舍

### 拍卖机制

```
权衡：第一价格 vs 第二价格拍卖

第二价格：
  + 真实出价（最优策略是出价 = 真实价值）
  + DSP 实现简单
  - 发布商收入较低（支付第二高价，而非真实价值）
  - 市场：2019 年之前的标准

第一价格：
  + 发布商收入更高
  + 透明（中标者支付其出价）
  - DSP 需要复杂的出价压低以避免超付
  - 增加 DSP 复杂性
  - 市场：2024 年的标准

决策：第一价格现在是行业标准；通过底价实现
以防止竞相压价。
```

### CTR 模型延迟 vs 精度

```
权衡：深度学习 vs 逻辑回归用于 CTR 预测

逻辑回归：
  + 500 个候选 1ms 推理
  + 不需要 GPU
  + 可解释，易于调试
  - AUC 较低（典型 0.72）

深度学习（Wide & Deep, DLRM）：
  + AUC 更高（0.76-0.80）
  + 在稀疏特征交互上更好
  - 推理 10-50ms（GPU）或 200ms（CPU）
  - GPU 成本、运维复杂性

决策：两阶段管道：
  阶段 1：LR 模型对 1000 个候选评分 → top 100（1ms）
  阶段 2：DL 模型重排序 top 100 → top 5（10ms GPU）
  净节省：DL 评分 100 个（而非 1000 个）→ 推理成本降低 10 倍
```

### 实时 vs 批量归因

```
权衡：多快归因转化？

实时（< 1 分钟）：
  + 广告主立即看到转化
  + 预算决策的更快反馈循环
  - 遗漏延迟信标（移动应用可能数小时后才报告）
  - 去重完成前的重复计数风险
  - 需要复杂的流式关联

批量（24 小时最终确认）：
  + 准确：收集所有延迟事件
  + 实现更简单（SQL 批处理作业）
  - 广告主直到明天才能看到今天的表现

决策：双管道：
  - 流式（Flink）：近实时（约 15 分钟延迟，初步）
  - 批量（Spark）：每日最终确认（黄金标准数据）
  - 报告同时显示"初步"和"最终"计数
```

### 频次控制精度 vs 成本

```
权衡：频次控制的精确计数 vs 近似计数

精确（Redis 每用户每活动）：
  + 零误报（达上限时绝不展示广告）
  - 内存：1B 用户 * 100K 活动 * 8 字节 = 太大
  - 仅适用于热活跃用户（约 100M）

近似（Count-Min Sketch 或 HyperLogLog）：
  + 大幅降低内存（所有用户和活动 2 GB）
  - 约 1% 误报率：偶尔在达上限时展示广告
  - 1% 误差 = 1% 浪费支出 = 大多数广告主可容忍

决策：混合方案：
  - Redis 精确用于 top 1 亿活跃用户（热路径）
  - Count-Min Sketch 用于长尾用户（很少活跃）
  - 从 Redis 淘汰时：将近似计数合并到 CMS
```

---

## 19. 常见面试追问

**问：如果 RTB 需要 80ms，你如何处理 100ms 的延迟预算？**

80ms 是 RTB 扇出的硬超时。与此同时，我们并行运行直接销售广告选择（耗时约 30ms）。如果 RTB 在 80ms 内完成，我们比较 RTB 中标者与直接销售中标者，选择更高 eCPM 的。如果 RTB 超时，我们立即回退到直接销售或自有广告。关键是 80ms RTB 步骤与其他处理并行运行，而非顺序执行。

**问：你如何防止活动预算超支？**

我们使用概率节奏和 Redis 支持的支出计数器，每次展示时更新。节奏服务读取当前支出并计算投放概率。由于最终一致性（多个 PoP 可能在计数器同步前同时投放），我们允许最多 1% 的超支。在活动结束时，我们进行对账并将超支部分退还给广告主。

**问：你如何处理持续超时的 DSP？**

我们在熔断器中跟踪每个 DSP 的响应时间百分位。如果 DSP 的 p95 延迟超过 70ms，我们将给他们的超时缩减到 60ms。如果 >20% 的请求超时，我们打开熔断器并跳过该 DSP 60 秒，然后重试。这防止了一个慢速 DSP 降低整体拍卖的性能。

**问：当用户删除 Cookie 或使用新设备时会发生什么？**

我们失去了识别用户的能力（这是隐私设计）。用户实际上变成了新的匿名用户。频次控制重置，再营销列表无法匹配，行为定向回退到仅上下文模式。这是可接受的；我们的系统会优雅降级到仅上下文模式。

**问：你如何大规模检测和处理点击欺诈？**

三层：

1. 实时（内联，< 5ms）：IP 黑名单布隆过滤器、UA 机器人检测、点击间隔检查（同一展示被点击两次）。
2. 近实时（Flink，< 5 分钟）：每个 IP、每个发布商的点击率异常。地理 IP 不一致。
3. 批量（每日）：发布商级别 CTR 异常检测 vs 基线。可疑发布商的付款暂扣等待调查。
   确认的 IVT 自动向广告主发放退款。

**问：系统如何处理突发流量（例如超级碗广告）？**

我们使用基于 CPU 和请求队列深度的 Kubernetes HPA 自动扩展无状态广告投放层。我们在已知事件前 30 分钟预热容量（我们可以根据活动投放日期和地理定向预测这些）。Kafka 为跟踪管道吸收突发。预算节奏自然会节流快速耗尽每日预算的活动。

**问：你如何确保点击跟踪零丢失？**

点击跟踪器在重定向用户之前立即写入 Kafka（持久、复制的日志）。Kafka 保证至少一次投递给消费者。Flink 消费者使用 Redis 中的 click_id（TTL 24 小时）进行去重。Kafka 持久性 + 消费者去重的组合实现了至少一次投递和精确一次计数语义。

**问：你如何实现流媒体视频的服务端广告插入（SSAI）？**

SSAI 在服务端将广告素材拼接到视频流中，使其在网络层面与内容无法区分（击败广告拦截器）。广告决策和转码在投递前完成：

1. 视频播放器从 CDN 源站请求流。
2. 源站调用广告决策服务，带有内容上下文 + 用户信号。
3. 广告决策返回素材 URL。
4. Manifest 操作器（服务端）将素材片段拼接到 HLS/DASH manifest 中。
5. 播放器无缝播放，不知道内容何处结束、广告何处开始。
6. 展示通过 manifest 请求时序跟踪，而非客户端信标。

**问：Google 的 Privacy Sandbox 如何替代第三方 Cookie 进行再营销？**

Protected Audience API（前身为 FLEDGE）将再营销逻辑移入浏览器。广告主在其网站上调用 `navigator.joinAdInterestGroup()` 将用户注册到兴趣组（本地存储）。当用户访问发布商时，浏览器在沙盒 "worklet" 中运行设备端拍卖。DSP 出价逻辑（JS）在此 worklet 中运行，仅可访问本地兴趣组——永远不会将用户身份发送到任何服务器。中标广告在 Fenced Frame 中渲染，该 Frame 无法与周围页面通信。这实现了无需跨站跟踪的再营销。

**问：活动元数据和点击流数据你会使用什么数据库？**

活动元数据（活动、广告组、素材）：PostgreSQL 或 MySQL。低写入率、复杂关系查询、计费需要强一致性。在投放路径上添加 Redis 缓存层。

点击流（展示、点击、转化）：Clickhouse（列式 OLAP）。专为仅追加高吞吐写入和对数十亿行的快速聚合查询设计。按日期分区，按广告主分片。替代方案：Apache Druid 用于亚秒级汇总查询，或 Pinot 用于实时分析。

---

_广告投放与实时竞价系统设计结束_
