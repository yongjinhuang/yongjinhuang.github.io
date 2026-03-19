# 设计一个分析平台 (Mixpanel / Amplitude / Google Analytics)

## 目录

1. [需求澄清](#1-需求澄清)
2. [API 设计](#2-api-设计)
3. [数据模型](#3-数据模型)
4. [高层架构](#4-高层架构)
5. [事件摄取管道](#5-事件摄取管道)
6. [事件 Schema 设计](#6-事件-schema-设计)
7. [用户身份识别](#7-用户身份识别)
8. [Funnel 分析](#8-funnel-分析)
9. [Cohort 分析](#9-cohort-分析)
10. [留存分析](#10-留存分析)
11. [实时仪表盘](#11-实时仪表盘)
12. [会话重建](#12-会话重建)
13. [OLAP 存储引擎](#13-olap-存储引擎)
14. [查询引擎](#14-查询引擎)
15. [A/B 测试集成](#15-ab-测试集成)
16. [数据采样](#16-数据采样)
17. [隐私与用户同意](#17-隐私与用户同意)
18. [客户端 SDK 设计](#18-客户端-sdk-设计)
19. [数据管道阶段](#19-数据管道阶段)
20. [扩展策略](#20-扩展策略)
21. [权衡取舍](#21-权衡取舍)
22. [分析平台对比](#22-分析平台对比)
23. [常见面试追问](#23-常见面试追问)

---

## 1. 需求澄清

### 功能性需求

| 类别            | 需求                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------ |
| **事件追踪**    | 摄取带有自定义属性的任意用户事件；追踪页面浏览、点击、表单提交、购买等行为；支持服务端和客户端事件；跨设备识别用户 |
| **用户分析**    | 包含事件历史的用户画像；匿名用户到已识别用户的关联；跨设备身份识别；按属性和行为进行用户分群                       |
| **Funnel 分析** | 定义多步骤转化漏斗；计算逐步转化率；支持时间窗口漏斗（如 7 天内完成转化）；支持流失分析并提供用户列表              |
| **Cohort 分析** | 按首次出现日期划分的留存 cohort；按任意事件划分的行为 cohort；跨时间段的 cohort 对比；可导出 cohort 用户列表       |
| **留存分析**    | Day-N 留存（第 1、7、14、30 天）；滚动留存；无界留存；带 cohort 分组的 N 天留存曲线                                |
| **仪表盘**      | 实时和历史图表；事件计数、独立用户数、转化率；自定义日期范围；可分享和可嵌入的仪表盘                               |
| **分群**        | 按任意用户/事件属性筛选报表；AND/OR 条件构建器；可保存的分群以便复用                                               |
| **A/B 测试**    | 实验分组追踪；按变体统计转化率；统计显著性计算；样本量计算器                                                       |
| **数据导出**    | 通过 API 导出原始事件；数据仓库同步（BigQuery、Snowflake、Redshift）；CSV 下载 cohort 列表                         |

### 非功能性需求

| 需求           | 目标                                               |
| -------------- | -------------------------------------------------- |
| 事件摄取延迟   | < 5 秒端到端（从 SDK 发送到可查询）                |
| 仪表盘查询延迟 | 30 天日期范围内 < 3 秒                             |
| 可用性         | 摄取 99.9% 正常运行时间；查询 99.95%               |
| 摄取吞吐量     | 持续峰值 200 万+ 事件/秒                           |
| 数据持久性     | 零事件丢失（至少一次投递 + 去重）                  |
| 热数据保留     | 快速查询层保留 30 天                               |
| 可扩展性       | 线性水平扩展；无单点故障                           |
| 多租户         | 按项目/组织严格数据隔离                            |
| 安全性         | 传输中 TLS；静态 AES-256 加密；RBAC；SOC 2 Type II |

### 规模估算

```
每日活跃用户 (DAU)：           1 亿独立用户
每用户每天事件数：              1,000 事件/用户/天（平均）
每天总事件数：                  1 亿 * 1,000 = 1000 亿事件/天

每秒事件数（峰值为平均值的 2 倍）：
  平均值：                      1000 亿 / 86,400 = ~116 万事件/秒
  峰值 (2x)：                  ~230 万事件/秒（目标：200 万+ 持续）

事件负载大小：
  平均事件 JSON：               500 字节（未压缩）
  Snappy 压缩后：              ~200 字节
  摄取带宽：                    200 万 * 200 B = 400 MB/秒（压缩后）

每日存储：
  原始事件：                    1000 亿 * 500 B = 50 TB/天（未压缩）
  列式存储 + 压缩 (10:1)：     ~5 TB/天（ClickHouse/Druid）
  30 天热数据层：               5 TB * 30 = 150 TB
  1 年冷数据层：                5 TB * 365 = ~1.8 PB

Kafka 吞吐量：
  所需分区数：                  200 万事件/秒 / 5 万事件/分区 = 40 个分区
  副本因子：                    3（跨可用区）
  Kafka 集群：                  20 个 broker * 2 磁盘 @ 10K MB/秒

预计算聚合：
  每个项目的事件类型：          ~500 个唯一事件
  每个事件的属性：              ~20 个维度
  每日聚合行数：                500 * 20 * 1,440 分钟 = 1440 万行/天/项目
  1 万个项目：                  ~1440 亿聚合行/天

查询负载：
  并发仪表盘用户：              5 万
  每小时查询数：                1 万次复杂查询/小时
  p99 查询目标：                30 天范围 < 3 秒
```

### 粗略估算汇总

```
+--------------------------------+-----------------------+-------------------+
| 指标                           | 数值                  | 备注              |
+--------------------------------+-----------------------+-------------------+
| 每天事件数                     | 1000 亿               | 1 亿用户          |
| 峰值摄取速率                   | 200 万+ 事件/秒       | 日均 2 倍          |
| 摄取带宽                       | ~400 MB/秒            | 压缩后            |
| 每天原始存储                   | 50 TB                 | 未压缩            |
| 每天列式存储                   | 5 TB                  | 10:1 压缩         |
| 30 天热存储                    | 150 TB                | ClickHouse/Druid  |
| 查询吞吐量                     | 1 万次查询/小时       | p99 < 3 秒        |
| 独立用户数                     | 1 亿                  | 身份图谱          |
+--------------------------------+-----------------------+-------------------+
```

---

## 2. API 设计

### 2.1 事件摄取 API

```
POST /api/v1/track
Content-Type: application/json
Authorization: Bearer <project-api-key>

Request Body (batch):
{
  "batch": [
    {
      "event": "Purchase Completed",
      "distinct_id": "user_abc123",
      "anonymous_id": "anon_xyz789",
      "session_id": "sess_001",
      "timestamp": "2026-03-01T12:00:00.123Z",
      "properties": {
        "product_id": "prod_456",
        "price": 49.99,
        "currency": "USD",
        "category": "Electronics",
        "referrer": "google",
        "utm_campaign": "spring_sale"
      },
      "context": {
        "device": {
          "type": "mobile",
          "os": "iOS",
          "os_version": "17.2",
          "model": "iPhone 15"
        },
        "app": {
          "version": "3.4.1",
          "build": "341"
        },
        "network": {
          "wifi": true,
          "carrier": "AT&T"
        },
        "screen": {
          "width": 390,
          "height": 844,
          "density": 3.0
        },
        "locale": "en-US",
        "timezone": "America/New_York",
        "ip": "203.0.113.45",
        "library": {
          "name": "analytics-ios",
          "version": "4.2.0"
        }
      },
      "insert_id": "evt_dedup_key_unique_abc123"
    }
  ],
  "sent_at": "2026-03-01T12:00:01.000Z"
}

Response: 200 OK
{
  "status": "success",
  "accepted": 1,
  "rejected": 0
}
```

### 2.2 用户识别 API

```
POST /api/v1/identify
Authorization: Bearer <project-api-key>

Request Body:
{
  "distinct_id": "user_abc123",
  "anonymous_id": "anon_xyz789",
  "timestamp": "2026-03-01T12:00:00Z",
  "traits": {
    "email": "alice@example.com",
    "name": "Alice Johnson",
    "plan": "pro",
    "company": "Acme Corp",
    "created_at": "2024-01-15T08:00:00Z",
    "age": 30,
    "country": "US"
  }
}

Response: 200 OK
{
  "status": "success",
  "merged_profile_id": "user_abc123"
}
```

### 2.3 Funnel 查询 API

```
POST /api/v1/query/funnels
Authorization: Bearer <project-api-key>

Request Body:
{
  "steps": [
    { "event": "Page Viewed", "filters": [{ "property": "page_name", "op": "equals", "value": "Pricing" }] },
    { "event": "Sign Up Clicked" },
    { "event": "Account Created" },
    { "event": "Purchase Completed" }
  ],
  "conversion_window": { "value": 7, "unit": "days" },
  "time_range": { "from": "2026-02-01T00:00:00Z", "to": "2026-03-01T00:00:00Z" },
  "group_by": "country",
  "filters": [
    { "property": "plan", "op": "equals", "value": "pro" }
  ]
}

Response: 200 OK
{
  "steps": [
    { "name": "Page Viewed",       "count": 1000000, "conversion_from_prev": null,   "conversion_from_first": 1.0  },
    { "name": "Sign Up Clicked",   "count": 350000,  "conversion_from_prev": 0.35,   "conversion_from_first": 0.35 },
    { "name": "Account Created",   "count": 280000,  "conversion_from_prev": 0.80,   "conversion_from_first": 0.28 },
    { "name": "Purchase Completed","count": 42000,   "conversion_from_prev": 0.15,   "conversion_from_first": 0.042}
  ],
  "median_time_between_steps": [null, "PT2H30M", "PT0H15M", "P2DT4H"],
  "query_time_ms": 1240
}
```

### 2.4 留存查询 API

```
POST /api/v1/query/retention
Authorization: Bearer <project-api-key>

Request Body:
{
  "cohort_event": "Account Created",
  "retention_event": "Session Started",
  "retention_type": "day_n",
  "time_range": { "from": "2026-01-01T00:00:00Z", "to": "2026-03-01T00:00:00Z" },
  "intervals": [0, 1, 7, 14, 30, 60, 90]
}

Response: 200 OK
{
  "cohorts": [
    {
      "cohort_date": "2026-01-01",
      "cohort_size": 12500,
      "retention": {
        "day_0":  1.000,
        "day_1":  0.420,
        "day_7":  0.230,
        "day_14": 0.180,
        "day_30": 0.120,
        "day_60": 0.085,
        "day_90": 0.062
      }
    }
  ],
  "query_time_ms": 890
}
```

### 2.5 分群导出 API

```
POST /api/v1/segments/export
Authorization: Bearer <project-api-key>

Request Body:
{
  "segment": {
    "conditions": [
      { "type": "event", "event": "Purchase Completed", "op": "at_least", "value": 2,
        "time_range": { "from": "2026-02-01T00:00:00Z", "to": "2026-03-01T00:00:00Z" } },
      { "type": "user_property", "property": "country", "op": "equals", "value": "US" }
    ],
    "operator": "AND"
  },
  "output": {
    "fields": ["distinct_id", "email", "created_at"],
    "format": "csv"
  }
}

Response: 202 Accepted
{
  "export_id": "exp_abc123",
  "status": "processing",
  "estimated_rows": 45000,
  "download_url": null
}
```

---

## 3. 数据模型

### 3.1 原始事件表 (ClickHouse)

```sql
CREATE TABLE events (
    -- 身份标识
    project_id       UInt32,
    distinct_id      String,          -- 已识别的用户 ID
    anonymous_id     String,          -- 识别前的 ID
    device_id        String,          -- 稳定的设备标识符
    session_id       String,

    -- 事件核心
    event_name       String,
    insert_id        String,          -- 客户端提供的去重键
    event_time       DateTime64(3),   -- 毫秒级精度
    received_time    DateTime64(3),   -- 服务器摄取时间
    processed_time   DateTime64(3),

    -- 属性（嵌套/动态）
    properties       Map(String, String),   -- 字符串编码的值
    properties_json  String,               -- 原始 JSON 数据

    -- 上下文
    ip               String,
    country          LowCardinality(String),
    region           String,
    city             String,
    device_type      LowCardinality(String),
    os               LowCardinality(String),
    os_version       String,
    browser          LowCardinality(String),
    browser_version  String,
    app_version      String,
    sdk_name         LowCardinality(String),
    sdk_version      String,

    -- UTM / 归因
    utm_source       String,
    utm_medium       String,
    utm_campaign     String,
    utm_content      String,
    utm_term         String,
    referrer         String,

    -- 实验
    experiment_id    String,
    variant_id       String,

    -- 分区
    date             Date MATERIALIZED toDate(event_time)
)
ENGINE = MergeTree()
PARTITION BY (project_id, date)
ORDER BY (project_id, event_name, distinct_id, event_time)
SETTINGS index_granularity = 8192;
```

### 3.2 用户画像表

```sql
CREATE TABLE user_profiles (
    project_id       UInt32,
    distinct_id      String,
    anonymous_ids    Array(String),    -- 所有关联的匿名 ID
    device_ids       Array(String),    -- 所有关联的设备 ID
    traits           Map(String, String),
    created_at       DateTime64(3),
    updated_at       DateTime64(3),
    first_seen_at    DateTime64(3),
    last_seen_at     DateTime64(3),
    first_event      String,
    total_events     UInt64,
    is_identified    UInt8             -- 0=匿名, 1=已识别
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (project_id, distinct_id);
```

### 3.3 预聚合计数表

```sql
CREATE TABLE event_counts_minutely (
    project_id    UInt32,
    event_name    String,
    minute_bucket DateTime,           -- 截断到分钟
    count         UInt64,
    unique_users  AggregateFunction(uniqHLL12, String)  -- HyperLogLog
)
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(minute_bucket)
ORDER BY (project_id, event_name, minute_bucket);
```

### 3.4 身份图谱 (Redis / 键值存储)

```
Schema:
  anon:{project_id}:{anonymous_id}    -> distinct_id     (string)
  device:{project_id}:{device_id}     -> distinct_id     (string)
  user:{project_id}:{distinct_id}     -> {
      anonymous_ids: [anon_1, anon_2],
      device_ids:    [dev_1, dev_2],
      merged_into:   null | distinct_id   (用于合并的用户)
  }

身份解析查找：
  1. 客户端发送 anonymous_id="anon_xyz", distinct_id="user_abc"
  2. GET anon:{pid}:anon_xyz  -> "user_abc" (已关联，无操作)
     或
  2. SET anon:{pid}:anon_xyz -> "user_abc"  (新关联)
  3. SADD user:{pid}:user_abc:anon_ids "anon_xyz"
```

### 3.5 实验分配表

```sql
CREATE TABLE experiment_assignments (
    project_id      UInt32,
    experiment_id   String,
    variant_id      String,
    distinct_id     String,
    assigned_at     DateTime64(3),
    first_event_at  DateTime64(3),
    converted       UInt8,
    converted_at    DateTime64(3)
)
ENGINE = ReplacingMergeTree(assigned_at)
ORDER BY (project_id, experiment_id, distinct_id);
```

---

## 4. 高层架构

```
+------------------+     +------------------+     +------------------+
|   Web 浏览器     |     |   移动应用       |     |   服务端         |
|   (JS SDK)       |     |  (iOS/Android)   |     |   (HTTP API)     |
+--------+---------+     +--------+---------+     +--------+---------+
         |                        |                        |
         +------------------------+------------------------+
                                  |
                          HTTPS / TLS 1.3
                                  |
                    +-------------v--------------+
                    |     负载均衡器 (L7)         |
                    |   (AWS ALB / Nginx/Envoy)  |
                    +-------------+--------------+
                                  |
              +-------------------+-------------------+
              |                   |                   |
   +----------v-----+  +----------v-----+  +----------v-----+
   | Collector Pod  |  | Collector Pod  |  | Collector Pod  |
   | (无状态)       |  | (无状态)       |  | (无状态)       |
   |                |  |                |  |                |
   | - 认证/验证    |  | - 认证/验证    |  | - 认证/验证    |
   | - 解压缩       |  | - 解压缩       |  | - 解压缩       |
   | - 基础富化     |  | - 基础富化     |  | - 基础富化     |
   | - Geo-IP 查找  |  | - Geo-IP 查找  |  | - Geo-IP 查找  |
   +-------+--------+  +-------+--------+  +-------+--------+
           |                   |                   |
           +-------------------+-------------------+
                               |
                    +----------v-----------+
                    |    Apache Kafka      |
                    |  (raw-events topic)  |
                    |  40+ 分区            |
                    |  3x 副本             |
                    +-----+----------+-----+
                          |          |
            +-------------+          +------------------+
            |                                           |
   +--------v---------+                      +---------v--------+
   |  流处理器        |                      | 流处理器         |
   |  (Flink / Spark  |                      | (身份关联)       |
   |   Streaming)     |                      |                  |
   |                  |                      | - 匿名->用户映射|
   | - 会话化         |                      | - 跨设备识别     |
   | - 去重           |                      | - 合并画像       |
   | - 富化           |                      +---------+--------+
   | - Schema 校验    |                                |
   +--------+---------+                      +---------v--------+
            |                                | 身份图谱         |
            |                                | (Redis Cluster)  |
            |                                +------------------+
            |
   +--------v------------------------------------------+
   |              Kafka (enriched-events topic)         |
   +-----+-------------------+------------------+-------+
         |                   |                  |
+--------v------+  +---------v-----+  +--------v-------+
| ClickHouse    |  | 实时           |  | 数据仓库       |
| 集群          |  | 聚合器         |  | 同步 (Spark)   |
| (热数据: 30天)|  | (Druid /      |  |                |
|               |  |  Redis)       |  | - BigQuery     |
| - 原始事件    |  |               |  | - Snowflake    |
| - 物化视图    |  | - 分钟级      |  | - Redshift     |
|               |  |   计数器      |  +----------------+
| - OLAP 查询   |  | - 实时图表    |
+--------+------+  +---------+-----+
         |                   |
         +--------+----------+
                  |
         +--------v---------+
         |   查询服务       |
         | (Go / Java API)  |
         |                  |
         | - Funnel 引擎    |
         | - 留存计算       |
         | - Cohort 构建器  |
         | - 分群评估       |
         +--------+---------+
                  |
         +--------v---------+
         |   缓存层         |
         |   (Redis / CDN)  |
         +--------+---------+
                  |
         +--------v---------+
         |   仪表盘 UI      |
         | (React 前端)     |
         +------------------+
```

---

## 5. 事件摄取管道

### 5.1 管道阶段概览

```
客户端 SDK
    |
    | (1) 批处理 + 压缩 + 重试
    v
Collector 服务（无状态，水平扩展）
    |
    | (2) 认证检查、负载验证、Geo-IP 富化
    v
Kafka "raw-events" Topic
    |
    | (3) Flink 流处理器读取分区
    v
Flink 处理层
    |-- (3a) 去重（Bloom filter / 精确 Redis 集合）
    |-- (3b) Schema 验证与类型转换
    |-- (3c) 身份关联（anon_id -> user_id 通过 Redis 查找）
    |-- (3d) 会话分配
    |-- (3e) UTM 归因传播
    v
Kafka "enriched-events" Topic
    |
    +-------> ClickHouse Writer（批量插入，10 秒窗口）
    |
    +-------> 实时聚合器（Druid / 自定义 Redis 计数器）
    |
    +-------> 仓库同步（Spark streaming -> S3 上的 Parquet）
```

### 5.2 Collector 服务设计

```
+-----------------------------------------------------------+
| Collector 服务（单次请求生命周期）                         |
|                                                           |
| 1. 解析 HTTP 请求体（JSON / gzip+JSON / protobuf）        |
| 2. 认证：根据项目数据库验证 API key                       |
| 3. 限流检查：每个 project_id 使用令牌桶算法               |
| 4. 验证顶层 schema（必填字段存在性检查）                  |
| 5. 富化每个事件：                                         |
|      - 解析 IP -> 地理信息（国家、地区、城市）            |
|      - 解析 User-Agent -> 设备、浏览器、操作系统          |
|      - 标记服务器接收时间 received_time                    |
|      - 如果缺失则分配 insert_id（UUID v7）                |
| 6. 序列化为 Avro（schema registry）                       |
| 7. 发布到 Kafka 分区，按 (project_id, distinct_id) 分区   |
| 8. 立即返回 200（异步处理）                               |
+-----------------------------------------------------------+

容量：
  - 每个 Pod 8 vCPU, 16 GB RAM
  - 每个 Pod 5 万事件/秒（Geo-IP 缓存预热后）
  - 200 万事件/秒峰值需要 40 个 Pod
  - Geo-IP 数据库：MaxMind GeoIP2 加载到内存（~100 MB）
```

### 5.3 去重策略

```
问题：客户端重试导致重复事件
解决方案：多层去重

第一层：Bloom Filter（Flink 内存中）
  - 对每个分片的 Bloom filter 检查 insert_id
  - 误报率：0.1%（可接受）
  - 内存：每个分片 2^24 位 = 2 MB
  - TTL：每小时轮换（事件在 1 小时窗口内去重）

第二层：Redis 精确去重（用于高价值事件）
  - SET dedup:{project_id}:{insert_id} 1 EX 3600
  - 仅用于 "Purchase"、"Subscription" 等事件类型
  - 成本：~50 字节 * 200 万事件/小时 = 100 GB Redis 内存（可接受）

第三层：ClickHouse ReplacingMergeTree
  - insert_id 是唯一键的一部分
  - 读取时使用 FINAL 关键字在查询时合并重复数据
```

---

## 6. 事件 Schema 设计

### 6.1 规范事件结构

```json
{
  "schema_version": "1.0",
  "project_id": "proj_abc123",

  // 身份字段
  "distinct_id": "user_42", // 已识别用户（登录后）
  "anonymous_id": "anon_device_xyz", // 匿名标识符（登录前）
  "device_id": "dev_iphone_001", // 稳定硬件 ID（iOS 上的 IDFV）
  "session_id": "sess_20260301_001", // 会话级分组

  // 事件核心
  "event_name": "Purchase Completed",
  "insert_id": "evt_unique_abc123", // 幂等键
  "event_time": "2026-03-01T12:00:00.123Z", // 客户端时间戳
  "received_time": "2026-03-01T12:00:00.512Z", // 服务器时间戳

  // 自定义属性（自由格式）
  "properties": {
    "product_id": "prod_456",
    "price": 49.99,
    "currency": "USD",
    "category": "Electronics",
    "quantity": 2,
    "coupon_code": "SPRING10"
  },

  // 自动采集的上下文
  "context": {
    "ip": "203.0.113.45",
    "country": "US", // 服务端 geo 富化
    "region": "NY",
    "city": "New York",
    "device_type": "mobile",
    "os": "iOS",
    "os_version": "17.2",
    "browser": null,
    "app_version": "3.4.1",
    "screen_width": 390,
    "screen_height": 844,
    "locale": "en-US",
    "timezone": "America/New_York"
  },

  // 归因
  "utm_source": "google",
  "utm_medium": "cpc",
  "utm_campaign": "spring_sale_2026",
  "referrer": "https://google.com/search?q=..."
}
```

### 6.2 属性类型系统

```
字符串属性：   使用 LowCardinality(String) 存储高频值
数值属性：     使用 Float64 / Int64 存储
布尔属性：     使用 UInt8 (0/1) 存储
数组属性：     使用 Array(String) 存储 - 序列化
对象属性：     存储为 JSON blob，通过 JSONExtract() 可查询

类型转换规则：
  "true" -> true（布尔）
  "123"  -> 123（如果可解析则为数字，否则为字符串）
  null   -> 省略（不存储）
  {}     -> 跳过（空对象）
```

---

## 7. 用户身份识别

### 7.1 匿名用户到已识别用户的关联

```
用户旅程时间线：

第 1 天：匿名访问网站
  anonymous_id = "anon_browser_abc"（存储在 localStorage 中）
  事件：Page Viewed, Sign Up Button Clicked

第 2 天：创建账户
  客户端调用 identify("user_42", anonymous_id="anon_browser_abc")
  服务端：
    1. 创建关联：anon_browser_abc -> user_42
    2. 追溯将过去的匿名事件重新归属到 user_42
    3. 将匿名画像合并到 user_42 画像

结果：登录前后的所有事件都归属到 user_42

+------------------+     identify()     +------------------+
| anon_browser_abc |  ===============>  |    user_42       |
| (3 个事件)       |                    | (3 + N 个事件)   |
+------------------+                    +------------------+
```

### 7.2 跨设备身份图谱

```
设备 A (iPhone)：  device_id = "dev_iphone_001"
设备 B (MacBook)： device_id = "dev_mac_002"
设备 C (iPad)：    device_id = "dev_ipad_003"

用户在所有三台设备上使用 user_42 登录：

+---------------+     +---------------+     +---------------+
| dev_iphone_001|     | dev_mac_002   |     | dev_ipad_003  |
+-------+-------+     +-------+-------+     +-------+-------+
        |                     |                     |
        +---------------------+---------------------+
                              |
                        +-----v------+
                        |  user_42   |（规范身份）
                        +------------+
                        | 属性       |
                        | 历史       |
                        | Cohorts    |
                        +------------+

身份图谱存储 (Redis)：
  device:proj1:dev_iphone_001 -> "user_42"
  device:proj1:dev_mac_002    -> "user_42"
  device:proj1:dev_ipad_003   -> "user_42"
  user:proj1:user_42:devices  -> {"dev_iphone_001", "dev_mac_002", "dev_ipad_003"}

查询时解析：
  给定 device_id，以 O(1) 查找规范 user_id
  跨设备 funnel：通过解析后的 user_id 合并所有设备事件
```

### 7.3 用户合并 (Alias)

```
场景：用户在手机上创建账户 (user_phone_99)
      然后在网页上登录已有旧账户 (user_web_55)
      这是同一个人 -> 需要合并

POST /api/v1/alias
{
  "alias":     "user_phone_99",
  "distinct_id": "user_web_55"
}

解析过程：
  1. 标记 user_phone_99 为 "merged_into: user_web_55"
  2. 所有来自 user_phone_99 的未来事件路由到 user_web_55
  3. 历史事件重新归属（异步回填任务）
  4. 属性合并：冲突时 user_web_55 的属性优先

合并不是双向的 - 规范 ID 优先
```

---

## 8. Funnel 分析

### 8.1 有序步骤转化算法

```
Funnel：[步骤 A] -> [步骤 B] -> [步骤 C]
转化窗口：7 天

朴素 SQL 方法（ClickHouse）：

WITH
  a_events AS (
    SELECT distinct_id, min(event_time) AS step_a_time
    FROM events
    WHERE event_name = 'Page Viewed' AND project_id = 123
      AND event_time BETWEEN '2026-02-01' AND '2026-03-01'
    GROUP BY distinct_id
  ),
  b_events AS (
    SELECT e.distinct_id, min(e.event_time) AS step_b_time
    FROM events e
    JOIN a_events a ON e.distinct_id = a.distinct_id
    WHERE e.event_name = 'Sign Up Clicked'
      AND e.event_time > a.step_a_time
      AND e.event_time <= a.step_a_time + INTERVAL 7 DAY
    GROUP BY e.distinct_id
  ),
  c_events AS (
    SELECT e.distinct_id, min(e.event_time) AS step_c_time
    FROM events e
    JOIN b_events b ON e.distinct_id = b.distinct_id
    WHERE e.event_name = 'Account Created'
      AND e.event_time > b.step_b_time
      AND e.event_time <= b.step_b_time + INTERVAL 7 DAY
    GROUP BY e.distinct_id
  )
SELECT
  (SELECT count(*) FROM a_events)              AS step_a_count,
  (SELECT count(*) FROM b_events)              AS step_b_count,
  (SELECT count(*) FROM c_events)              AS step_c_count;

性能优化：
  - 从列式存储中仅读取 distinct_id、event_name、event_time
  - 首先按日期范围过滤分区
  - 对大规模 funnel 使用 bitmap 交集
  - 预计算用户-事件出现时间戳的倒排列表
```

### 8.2 时间窗口 Funnel

```
窗口类型：

1. 会话窗口：所有步骤必须在同一会话内发生
   - 严格模式：步骤在会话内按确切顺序执行
   - 任意顺序：会话内所有步骤完成即可，不限顺序

2. 日历窗口：在 N 个日历天内完成转化
   - 窗口在午夜重置
   - 示例：步骤 A 在周一，步骤 B 必须在下周一之前完成

3. 滑动窗口：从步骤 A 完成后 N 天内
   - 示例：步骤 A 在周二下午 3 点，窗口在下周二下午 3 点关闭

4. 无序 funnel：所有步骤完成即可，不限顺序
   - 用于功能采用分析

+------ 7 天转化窗口 ------+
|                           |
| 第 0 天：[步骤 A]         |
| 第 1 天：...              |
| 第 3 天：[步骤 B]         |
| 第 7 天：[步骤 C] <- 最后允许的一天 |
| 第 8 天：太晚了！         |
+---------------------------+
```

### 8.3 流失分析

```
计算 funnel 各步数量后：
  步骤 A：1,000,000 用户
  步骤 B：  350,000 用户（650,000 在 A 之后流失）
  步骤 C：  280,000 用户（ 70,000 在 B 之后流失）
  步骤 D：   42,000 用户（238,000 在 C 之后流失）

流失分析功能：
  1. 谁流失了：导出每个��失阶段的用户列表
  2. 为什么流失：比较流失用户与转化用户的共同属性
     - "美国用户在步骤 B 的转化率是欧盟用户的 2 倍"
     - "iOS 用户在步骤 C 的流失率比 Android 高 30%"
  3. 何时流失：时间分布直方图
     - 大多数在第一个小时内流失，或在 3-7 天有高峰
  4. 去了哪里：流失后的下一个事件
     - 40% 的步骤 B 流失用户查看了竞品页面
```

---

## 9. Cohort 分析

### 9.1 留存 Cohort

```
留存 Cohort 表（Day-N 格式）：

Cohort     | 规模   | Day 0 | Day 1 | Day 7 | Day 14 | Day 30
-----------+--------+-------+-------+-------+--------+--------
1 月第 1 周| 12,500 | 100%  | 42%   | 23%   | 18%    | 12%
1 月第 2 周| 11,800 | 100%  | 44%   | 25%   | 19%    | 13%
1 月第 3 周| 10,200 | 100%  | 38%   | 20%   | 15%    | 10%
2 月第 1 周| 13,100 | 100%  | 46%   | 27%   | 21%    | N/A

颜色编码：>30% 绿色，20-30% 黄色，<20% 红色
有助于发现影响留存的产品变更
```

### 9.2 行为 Cohort

```
行为 cohort：按用户做了或没做某项操作进行分组

示例：
  - "在第 1 天内完成新手引导教程的用户"
  - "注册后 7 天内邀请了 >= 3 个朋友的用户"
  - "从未启用通知的用户"
  - "活跃用户：前 30 天内 >= 10 次会话"

Cohort 构建器：
  Cohort = {
    name: "Tutorial Completers",
    criteria: [
      { event: "Tutorial Completed", time_from_signup: "0d", time_to_signup: "1d" }
    ]
  }

Cohort 计算（ClickHouse）：
  CREATE MATERIALIZED VIEW cohort_tutorial_completers
  AS SELECT DISTINCT distinct_id
  FROM events
  WHERE event_name = 'Tutorial Completed'
    AND event_time <= (
      SELECT first_seen_at + INTERVAL 1 DAY
      FROM user_profiles WHERE distinct_id = events.distinct_id
    );

然后比较 tutorial_completers 与其他用户的留存：
  教程完成者 Day-30 留存：24%
  未完成者 Day-30 留存：   8%
  -> 教程完成是留存的 3 倍预测因子
```

### 9.3 Cohort 对比

```
并排比较多个 cohort：

              Day 1  Day 7  Day 14  Day 30
教程完成者：  62%    35%    28%     24%
未完成教程：  38%    18%    12%      8%
邀请用户：    71%    45%    38%     31%
付费用户：    80%    60%    52%     45%

以重叠折线图可视化
统计显著性：使用卡方检验比较 cohort 间差异
导出：CSV 下载每个 cohort 的 user_id 用于再营销
```

---

## 10. 留存分析

### 10.1 Day-N 留存

```
定义：在 cohort_event 日期之后恰好第 N 天执行了 return_event 的
cohort 用户百分比（按日历天差异计算）。

计算方法：
  cohort_date = date(首次 "Account Created" 事件)
  return_date = date(任意 "Session Started" 事件)
  N = return_date - cohort_date

  Day-7 留存 = count(N=7 的用户) / cohort_size

ClickHouse 查询：
  SELECT
    cohort_date,
    cohort_size,
    countIf(day_diff = 1)  / cohort_size AS day_1,
    countIf(day_diff = 7)  / cohort_size AS day_7,
    countIf(day_diff = 30) / cohort_size AS day_30
  FROM (
    SELECT
      p.distinct_id,
      toDate(p.first_seen_at)                             AS cohort_date,
      count() OVER (PARTITION BY toDate(p.first_seen_at)) AS cohort_size,
      dateDiff('day', p.first_seen_at, e.event_time)      AS day_diff
    FROM user_profiles p
    JOIN events e ON p.distinct_id = e.distinct_id
    WHERE e.event_name = 'Session Started'
  )
  GROUP BY cohort_date, cohort_size
  ORDER BY cohort_date;
```

### 10.2 滚动留存

```
定义：在第 N 天或第 N 天之后的任何一天执行了 return_event 的用户百分比。
回答的问题是："他们在 30 天以上仍然活跃吗？"

滚动 Day-30 = count(在第 30 天及之后至少有一个事件的用户) / cohort_size

比 Day-N 更宽容：用户可能跳过第 30 天但在第 32 天回来

滚动留存与 Day-N 留存对比：
  Day-N 留存（第 30 天）：12%（恰好在第 30 天回来）
  滚动留存（第 30 天）：  35%（第 30 天之后任意时间点活跃）
```

### 10.3 无界留存

```
定义：在 N 天后曾经回来过的原始 cohort 百分比，
回访窗口没有上限。

用于衡量长期产品价值：
  "2024 年 1 月注册的用户中，1 年后曾经回来过的占比是多少？"

无界 Day-365 = 大多数消费者应用 8%（健康水平：15-20%）

实现方式：
  为每个用户预计算：last_active_date
  与 cohort 日期 JOIN，计算 last_active 距 cohort 的天数
  无界 Day-N = count(last_active_days_since_cohort >= N) / cohort_size
```

---

## 11. 实时仪表盘

### 11.1 流式聚合架构

```
Kafka enriched-events topic
          |
          | (以 200 万事件/秒消费)
          v
+----------------------------+
|   Flink 流处理任务         |
|                            |
|   窗口：1 分钟滚动窗口     |
|   键：(project, event)     |
|                            |
|   聚合：                   |
|   - count()                |
|   - approx_count_distinct()|  <- 使用 HyperLogLog 统计独立用户
|   - sum(numeric_property)  |
|   - p50/p95/p99 (t-digest) |
+----------+-----------------+
           |
           | (每 60 秒发出聚合行)
           v
+----------------------------+      +----------------------------+
|   Redis Time Series        |      |  ClickHouse               |
|   (实时：最近 24 小时)     |      |  (历史：30 天以上)        |
|                            |      |                            |
|   Key: {proj}:{event}      |      |  表：event_counts_1min     |
|   Value: (count, uniq_hll) |      |  分区：按月               |
+----------------------------+      +----------------------------+
           |                                   |
           +-----------------------------------+
                         |
                +--------v--------+
                |  查询服务       |
                |                 |
                | 最近 1 小时 -> Redis (< 10ms)
                | 最近 24 小时-> Redis (< 50ms)
                | 最近 30 天  -> ClickHouse (< 3s)
                +-----------------+
```

### 11.2 预计算 vs 按需查询

```
+-----------------------------+---------------------------+
| 预计算（物化视图）          | 按需（即席查询）          |
+-----------------------------+---------------------------+
| 简单事件计数                | 复杂多步骤 funnel         |
| 独立用户计数 (HLL)          | 任意属性过滤              |
| 按事件的时间序列            | Cohort 对比               |
| 热门属性值                  | 自定义公式指标            |
| 留存 Day-N 网格             | 跨项目分析                |
+-----------------------------+---------------------------+
| 响应时间：< 100ms           | 响应时间：1-10 秒         |
| 存储：高（大量行）          | 存储：仅原始事件          |
| 新鲜度：60 秒延迟           | 新鲜度：实时              |
+-----------------------------+---------------------------+

决策：标准报表预计算，即席查询按需执行

预计算调度：
  每分钟：事件计数���独立用户数 (HLL)
  每小时：热门属性分布、funnel 宏观统计
  每天：  留存 cohort 矩阵、完整用户分群
  每周：  高管摘要报告、A/B 测试结果
```

---

## 12. 会话重建

### 12.1 会话化算法

```
问题：客户端事件没有会话边界。
      需要将事件分组为会话。

算法：30 分钟不活动超时（行业标准）

Flink 有状态会话化：
  状态：per (project_id, distinct_id) -> {
    current_session_id: String,
    last_event_time: Timestamp
  }

  对于每个传入事件（按 event_time 排序）：
    gap = event_time - last_event_time

    如果 gap > 30 分钟 或 没有之前的会话：
      session_id = generate_session_id()  // UUID v7
      session_start = event_time
    否则：
      session_id = current_session_id

    为事件标注 session_id
    更新状态：{current_session_id, last_event_time = event_time}

  会话超时：Flink 会话窗口或状态 TTL

边界情况：
  - 后台应用事件：不延长会话
  - 时区变更：全程使用 UTC
  - 时钟偏移：接受未来 5 分钟内、过去 24 小时内的事件
```

### 12.2 页面流（桑基图）

```
会话重建支持页面流分析：

会话 1 (user_42)：
  /home -> /pricing -> /signup -> /onboarding -> /dashboard

会话 2 (user_43)：
  /home -> /pricing -> (30 分钟间隔) 新会话 -> /pricing -> 离开

页面流桑基图：
  /home (100K) ---60%---> /pricing (60K) ---30%---> /signup (18K)
               ---25%---> /features (25K)
               ---15%---> 离开 (15K)

计算：
  SELECT
    page_from,
    page_to,
    count() AS transitions
  FROM (
    SELECT
      event_name AS page_from,
      leadInFrame(event_name) OVER (
        PARTITION BY session_id ORDER BY event_time
      ) AS page_to
    FROM events
    WHERE project_id = 123 AND event_name = 'Page Viewed'
  )
  WHERE page_to IS NOT NULL
  GROUP BY page_from, page_to
  ORDER BY transitions DESC;
```

### 12.3 会话指标

```
会话级聚合（会话化后计算）：

CREATE TABLE sessions AS
SELECT
  project_id,
  distinct_id,
  session_id,
  min(event_time)                    AS session_start,
  max(event_time)                    AS session_end,
  dateDiff('second', min(event_time), max(event_time)) AS duration_seconds,
  count()                            AS event_count,
  countIf(event_name = 'Page Viewed') AS page_views,
  any(country)                       AS country,
  any(device_type)                   AS device_type,
  any(utm_source)                    AS utm_source
FROM events
GROUP BY project_id, distinct_id, session_id;

典型会话指标：
  平均会话时长：    4 分 32 秒
  每会话平均页面数：3.8
  跳出率（仅 1 页）：38%
  每用户每天会话数：2.1
```

---

## 13. OLAP 存储引擎

### 13.1 ClickHouse 架构

```
为什么选择 ClickHouse 做分析：
  - 列式存储：仅读取需要的列（10-100 倍加速）
  - 向量化查询执行：对列批次进行 SIMD 操作
  - MergeTree 引擎：排序主键用于范围扫描
  - LZ4/ZSTD 压缩：事件数据 10:1 压缩比
  - 通过 Distributed 表进行水平分片
  - 异步物化视图用于预聚合

ClickHouse 集群布局：
  +---------------+     +---------------+     +---------------+
  |   分片 1      |     |   分片 2      |     |   分片 3      |
  |               |     |               |     |               |
  | 副本 1 (R)    |     | 副本 1 (R)    |     | 副本 1 (R)    |
  | 副本 2 (R)    |     | 副本 2 (R)    |     | 副本 2 (R)    |
  +-------+-------+     +-------+-------+     +-------+-------+
          |                     |                     |
          +---------------------+---------------------+
                                |
                    +-----------v-----------+
                    |   ClickHouse Keeper   |
                    |   (ZooKeeper API,     |
                    |    原生 ClickHouse)   |
                    +-----------------------+

分片键：cityHash64(project_id, distinct_id)
副本：通过 ReplicatedMergeTree 异步复制（每个分片 2 个副本）
读取：Distributed 表分发到所有分片，合并结果
```

### 13.2 星型 Schema 设计

```
事实表：events（列式，每天 1000 亿行）
  - event_time, project_id, distinct_id, event_name
  - 所有属性（动态列或 JSON）

维度表（小表，缓存）：
  - dim_projects  (project_id -> api_key, name, settings)
  - dim_users     (distinct_id -> traits, cohort 成员关系)
  - dim_events    (event_name -> schema 定义, 显示名称)

预聚合事实表：
  - event_counts_1min     (project, event, minute -> count, hll)
  - event_counts_1hour    (project, event, hour -> count, hll)
  - event_counts_1day     (project, event, day -> count, hll)
  - property_breakdown_1d (project, event, property, value, day -> count)
  - funnel_daily          (project, funnel_id, date -> 步骤计数)
  - retention_grid        (project, cohort_date, N -> 留存数)

数据流：
  原始事件 -> 1 分钟聚合 (Flink) -> 1 小时汇总（定时） -> 1 天汇总
```

### 13.3 Druid 用于实时 OLAP

```
Apache Druid 擅长对流式数据进行亚秒级分析：

Druid 摄取：
  Kafka -> Druid 实时任务（内存中索引）
              -> 发布到 Historical 节点（每 10 分钟）

Druid segment 布局：
  Segment = 时间块（1 小时）* 按维度分片
  每个 segment：列式、压缩，带 bitmap 索引

Druid vs ClickHouse：
  ClickHouse：更适合复杂 SQL、大批量查询
  Druid：     更适合实时摄取、亚秒级切片分析

混合方案：
  实时（< 1 小时）：  Druid（< 500ms 响应）
  历史（> 1 小时）：  ClickHouse（30 天 < 3s）
  查询路由器：检查时间范围，据此路由
```

---

## 14. 查询引擎

### 14.1 维度上卷

```
上卷层级：分钟 -> 小时 -> 天 -> 周 -> 月

查询计划器根据以下条件选择预聚合表：
  - 请求的时间范围
  - 请求的粒度
  - 是否存在维度过滤

示例："显示过去 30 天按国家分组的每日页面浏览量"
  -> 使用 event_counts_1day 表（非原始事件）
  -> 30 行 * 200 个国家 = 6,000 行扫描（对比 1000 亿原始事件）
  -> 响应时间：50ms vs 30 秒

上卷表选择逻辑：
  time_range > 7 天  且 granularity = 天   -> 使用 event_counts_1day
  time_range > 1 天  且 granularity = 小时 -> 使用 event_counts_1hour
  time_range > 1 小时且 granularity = 分钟 -> 使用 event_counts_1min
  time_range < 1 小时或  自定义过滤        -> 使用原始事件表
```

### 14.2 时间序列分桶

```
ClickHouse 时间分桶函数：
  toStartOfMinute(event_time)    -- 分钟桶
  toStartOfHour(event_time)      -- 小时桶
  toStartOfDay(event_time)       -- 天桶
  toStartOfWeek(event_time)      -- ISO 周桶
  toStartOfMonth(event_time)     -- 月桶

示例查询（过去 7 天每小时事件数）：
  SELECT
    toStartOfHour(event_time) AS hour,
    count()                   AS events,
    uniqHLL12(distinct_id)    AS unique_users
  FROM events
  WHERE project_id = 123
    AND event_name = 'Page Viewed'
    AND event_time >= now() - INTERVAL 7 DAY
  GROUP BY hour
  ORDER BY hour;

缺失时间桶的填充：
  在 ORDER BY 中使用 WITH FILL ... STEP INTERVAL 1 HOUR
  确保每个小时都出现，即使没有事件
```

### 14.3 近似计数 (HyperLogLog)

```
问题：对 1000 亿事件执行 COUNT(DISTINCT user_id) 速度慢且内存密集

解决方案：HyperLogLog (HLL) - 概率基数估算器

特性：
  误差率：    0.81% / sqrt(m)，其中 m = 寄存器数量
  内存：      2^14 寄存器的标准 HLL 使用 12 KB
  准确度：    16KB 状态下约 1-2% 误差
  可合并性：  HLL sketch 可以组合（union = OR）

ClickHouse 实现：
  -- 在预聚合时存储 HLL sketch：
  INSERT INTO event_counts_1min
  SELECT
    project_id,
    event_name,
    toStartOfMinute(event_time),
    count()                         AS event_count,
    uniqHLL12State(distinct_id)     AS unique_users_hll
  FROM events
  GROUP BY 1, 2, 3;

  -- 查询：跨时间桶合并 HLL sketch：
  SELECT
    event_name,
    sum(event_count)                       AS total_events,
    uniqHLL12Merge(unique_users_hll)       AS unique_users
  FROM event_counts_1min
  WHERE event_time BETWEEN '2026-02-01' AND '2026-03-01'
  GROUP BY event_name;

  -- 合并 1 万个分钟桶的 HLL = 微秒级 vs 1000 亿行扫描
```

---

## 15. A/B 测试集成

### 15.1 实验分组

```
分组流程：
  1. 用户向你的产品发起请求
  2. 调用实验服务：GET /assign?user_id=42&experiment=exp_123
  3. 确定性哈希：bucket = murmurhash(user_id + exp_id) % 100
     bucket 0-49  -> 对照组   (variant_a)
     bucket 50-99 -> 实验组   (variant_b)
  4. 记录分组：track("Experiment Viewed", { experiment_id, variant_id })
  5. 分组缓存：Redis TTL 30 天（粘性分组）

+---------------+    hash(user+exp)    +------------------+
| 实验          | ===================> | 变体             |
| 服务          |      % 100           | 分配             |
|               |                      | (确定性)         |
+---------------+                      +------------------+
        |                                      |
        v                                      v
  记录 "Experiment                      缓存到 Redis
   Viewed" 事件                         (粘性会话)
```

### 15.2 统计显著性

```
实验结果表：
  变体 A（对照组）：50,000 用户，2,500 次转化 (5.0%)
  变体 B（实验组）：50,200 用户，3,014 次转化 (6.0%)

统计检验：双比例 Z 检验
  p_A = 2500 / 50000 = 0.050
  p_B = 3014 / 50200 = 0.060
  p_pool = (2500 + 3014) / (50000 + 50200) = 0.0551

  SE = sqrt(p_pool * (1 - p_pool) * (1/n_A + 1/n_B))
     = sqrt(0.0551 * 0.9449 * (1/50000 + 1/50200))
     = 0.00145

  Z = (p_B - p_A) / SE = (0.060 - 0.050) / 0.00145 = 6.90

  p 值 < 0.0001（阈值：0.05）
  置信度：99.99% -> 统计显著！

  相对提升：(6.0 - 5.0) / 5.0 = 20% 改进

贝叶斯替代方案（Amplitude 的方法）：
  将转化建模为 Beta 分布
  P(variant_B > variant_A) 通过积分计算
  更直观："实验组更好的概率为 91%"
  不需要固定样本量；可持续监控
```

### 15.3 样本量计算器

```
已知条件：
  基线转化率：p = 5%
  最小可检测效应：10% 相对（0.5% 绝对）
  统计功效：80%（beta = 0.20）
  显著性水平：5%（alpha = 0.05）

公式：
  n = 2 * (z_alpha + z_beta)^2 * p * (1 - p) / (delta^2)
    = 2 * (1.96 + 0.84)^2 * 0.05 * 0.95 / (0.005)^2
    = 2 * 7.84 * 0.0475 / 0.000025
    = ~29,800 每变体

  所需总用户数：~60,000
  在每天 1000 次曝光的情况下：~60 天达到显著性

API：
  POST /api/v1/experiments/sample-size
  {
    "baseline_rate": 0.05,
    "minimum_detectable_effect": 0.10,
    "power": 0.80,
    "significance": 0.05,
    "daily_traffic": 1000
  }

  响应：
  {
    "sample_size_per_variant": 29800,
    "total_sample_size": 59600,
    "days_to_significance": 60
  }
```

---

## 16. 数据采样

### 16.1 渐进式采样提升 UI 响应速度

```
问题：用户查询 12 个月数据。全量扫描 = 30 秒。
目标：在 < 2 秒内返回近似结果。

渐进式采样策略：
  1. 先对 1% 样本执行查询（< 200ms）
     立即显示结果，附带 "~1% 样本" 指示器
  2. 同时对 10% 样本执行查询（< 1s）
     更新结果，缩小置信区间
  3. 在后台执行 100% 样本查询（3-30s）
     最终更新移除采样指示器

ClickHouse SAMPLE 子句：
  SELECT count() * 100 AS estimated_count    -- 按采样因子缩放
  FROM events SAMPLE 0.01                     -- 1% 随机样本
  WHERE project_id = 123
    AND event_name = 'Purchase Completed'
    AND event_time >= '2025-01-01'

置信区间显示：
  估计值：4,230,000 +/- 42,000（1% 样本的 99% 置信区间）
  全量查询运行时显示进度条
```

### 16.2 分层采样

```
问题：随机采样会遗漏稀有事件（转化率 0.1%）
解决方案：分层采样保持分布

按以下维度分层：
  - 事件类型：确保稀有事件按比例采样
  - 用户分群：确保小 cohort 被充分代表
  - 时间桶：确保每个时间段被平等代表

ClickHouse 实现：
  SELECT *
  FROM events
  WHERE project_id = 123
    AND (
      event_name = 'Purchase Completed'   -- 100% 采样稀有转化事件
      OR (
        event_name != 'Purchase Completed'
        AND cityHash64(distinct_id) % 100 < 10  -- 10% 采样常见事件
      )
    )

加权聚合：
  SELECT
    event_name,
    sum(CASE WHEN event_name = 'Purchase Completed' THEN 1 ELSE 10 END) AS weighted_count
  FROM sampled_events
  GROUP BY event_name;
```

---

## 17. 隐私与用户同意

### 17.1 无 Cookie 追踪

```
传统方式：第三方 Cookie 用于跨站追踪
           -> 已被 Safari ITP、Firefox ETP、Chrome CHIPS 封锁

无 Cookie 替代方案：

1. 第一方设备指纹：
   - Canvas 指纹 + 屏幕分辨率 + 字体
   - User-Agent + 时区 + 语言
   - 确定性哈希 -> 伪匿名 device_id
   - 局限性：~5% 碰撞率，随浏览器更新而变化

2. 服务端会话 ID：
   - 设置 HttpOnly、SameSite=Strict 第一方 Cookie
   - 每次会话轮换以保护隐私
   - 在同域名内有效；不支持跨站

3. Client hints（浏览器 API）：
   - Accept-CH 头部请求 Sec-CH-UA-* 头部
   - 比 User-Agent 嗅探更稳定
   - 设计上保护隐私

4. PPID（发布者提供的 ID）：
   - 用户登录 -> hash(email) -> 稳定的跨会话 ID
   - 不存储 PII；确定性哈希不可逆

推荐方案：对已认证用户组合使用 (2) + (4)，
         对匿名用户在获得同意后使用 (1)。
```

### 17.2 服务端事件

```
问题：广告拦截器会屏蔽客户端 SDK 对分析域名的请求

解决方案：通过第一方域名代理（与产品同源）

架构：
  浏览器 -> POST /analytics/collect（你的域名，非分析供应商域名）
                |
                v（服务端，对广告拦截器隐藏）
            你的服务器 -> Analytics Collector

实现：
  // Nginx 反向代理
  location /analytics/collect {
    proxy_pass https://api.your-analytics.com/v1/track;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_hide_header X-Analytics-*;
  }

优势：
  - 绕过浏览器级广告拦截器
  - IP 是你的服务器 IP（对用户有隐私保护作用）
  - 无跨域请求问题

服务端富化：
  可以添加服务端验证的属性（如来自认证服务的用户等级）
  无法被客户端伪造（与客户端属性不同）
```

### 17.3 GDPR 数据删除

```
GDPR 被遗忘权：在请求后 30 天内删除所有用户数据

挑战：事件数据存储在不可变的列式表中。
      无法高效删除单独的行。

策略：伪匿名化 + 密钥轮换

1. 所有事件存储 pseudonymous_id（非真实 user_id）
   映射：real_user_id -> pseudonymous_id（存储在单独的表中）

2. 收到删除请求时：
   DELETE FROM identity_map WHERE user_id = 'user_42'
   -> pseudonymous_id 变成孤立的，无法解析到任何个人
   -> 事件保留但不再可与用户关联

3. 对于真正包含 PII 的属性（事件负载中的 email）：
   运行异步删除任务：
     UPDATE events SET properties = mapDelete(properties, 'email')
     WHERE distinct_id IN (
       SELECT pseudonymous_id FROM deleted_users
       WHERE deleted_at > now() - INTERVAL 30 DAY
     )
   ClickHouse 支持 mutations（ALTER TABLE ... DELETE/UPDATE）
   安排在非高峰时段执行（代价高昂的操作）

4. 同意管理：
   按用户按用途追踪同意状态：
   { user_id, purpose: "analytics", consented: true, timestamp }
   拒绝摄取撤销同意的用户数据

5. 数据保留策略执行：
   原始事件表 TTL：
   ALTER TABLE events MODIFY TTL date + INTERVAL 365 DAY;
   ClickHouse 自动删除过期分区。
```

---

## 18. 客户端 SDK 设计

### 18.1 SDK 架构

```
+--------------------------------------------------+
|              Analytics 客户端 SDK                 |
|                                                  |
|  +------------+    +----------+    +----------+  |
|  | 公共 API   |    | 批处理器 |    | 存储     |  |
|  | track()    | -> | 队列     | -> | (磁盘)   |  |
|  | identify() |    | (内存)   |    | 离线     |  |
|  | page()     |    +----+-----+    | 队列     |  |
|  +------------+         |         +----------+  |
|                    +----v-----+                  |
|                    | 刷新器   |                  |
|                    |          |                  |
|                    | 最多批量 |                  |
|                    | 100 个   |                  |
|                    | 事件     |                  |
|                    | 或 5 秒  |                  |
|                    +----+-----+                  |
|                         |                        |
|                    +----v-----+                  |
|                    | HTTP     |                  |
|                    | 客户端   |                  |
|                    |          |                  |
|                    | 压缩     |                  |
|                    | 重试     |                  |
|                    | 退避     |                  |
|                    +----------+                  |
+--------------------------------------------------+
```

### 18.2 批处理策略

```
刷新触发条件（以先到达者为准）：
  1. 批量大小 >= 100 个事件
  2. 自上次刷新后经过 >= 5 秒
  3. 应用进入后台（iOS UIApplicationWillResignActive）
  4. 显式调用 SDK.flush()（例如登出前）

批量负载构建：
  {
    "batch": [ event1, event2, ..., event100 ],
    "sent_at": "2026-03-01T12:00:01.000Z"
  }
  Gzip 压缩 -> ~80% 体积缩减
  Content-Encoding: gzip 头部

内存队列容量：最多 500 个事件
  如果队列满：丢弃最旧的事件，记录警告
  替代方案：写入磁盘（开销更大）
```

### 18.3 指数退避重试

```
重试策略：
  第 1 次尝试：立即
  第 2 次尝试：延迟 1 秒
  第 3 次尝试：延迟 2 秒
  第 4 次尝试：延迟 4 秒
  第 5 次尝试：延迟 8 秒
  最大尝试次数：5
  最大延迟：30 秒

  delay = min(base * 2^attempt + jitter, max_delay)
  jitter = random(0, 1000ms)  -- 防止惊群效应

重试条件：
  可重试：    5xx 错误、网络超时、DNS 失败
  不可重试：  4xx 错误（认证失败、错误负载 - 客户端 bug）

代码模式 (TypeScript)：
  async function sendWithRetry(batch: Event[], attempt = 0): Promise<void> {
    try {
      await httpClient.post('/v1/track', batch, { timeout: 10000 })
    } catch (error) {
      if (attempt >= MAX_RETRIES || !isRetryable(error)) {
        persistToOfflineQueue(batch)
        return
      }
      const delay = Math.min(BASE_DELAY * Math.pow(2, attempt) + jitter(), MAX_DELAY)
      await sleep(delay)
      await sendWithRetry(batch, attempt + 1)
    }
  }
```

### 18.4 离线队列

```
移动端用例：用户失去网络连接，事件不能丢失

离线队列实现：
  存储：设备上的 SQLite（iOS/Android）
  Schema：
    CREATE TABLE offline_queue (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      payload    TEXT NOT NULL,         -- JSON 编码的事件批次
      created_at INTEGER NOT NULL,      -- Unix 时间戳
      attempts   INTEGER DEFAULT 0
    );

  网络离线时：将批次写入 SQLite 而非 HTTP 发送
  网络恢复时：从 SQLite 读取，按顺序发送，成功后删除
  最大离线存储：100,000 个事件（可配置）
  淘汰策略：超过限制时丢弃最旧的事件

  iOS 生命周期集成：
    - 监听 Reachability 变化（SCNetworkReachability）
    - 在 WillResignActive 时刷新（应用进入后台）
    - 在 DidBecomeActive 时处理队列（应用进入前台）
```

### 18.5 负载压缩

```
发送前：
  原始 JSON 负载：50,000 字节（100 个事件 * 500 字节）
  Gzip 压缩后：  ~10,000 字节（80% 缩减）
  Snappy 压缩后：~15,000 字节（70% 缩减，更快）

浏览器 SDK：
  fetch('/v1/track', {
    method: 'POST',
    headers: { 'Content-Encoding': 'gzip', 'Content-Type': 'application/json' },
    body: await compress(JSON.stringify(payload))  // CompressionStream API
  })

移动端 SDK：
  NSData *compressed = [NSData dataWithBytes:... length:...];  // zlib
  request.HTTPBody = [payload compressedDataUsingAlgorithm:LZFSE];

服务端解压缩：
  Collector 自动检测 Content-Encoding 头部
  支持：gzip, deflate, br (Brotli), zstd
```

---

## 19. 数据管道阶段

### 19.1 管道概览

```
阶段 1：RAW（原始）
  - 从客户端 SDK 接收的原始事件
  - 最小验证（必填字段存在性检查）
  - 在 Kafka 中无限期存储（可配置保留期）
  - Schema：来自客户端的原始格式，不做转换

阶段 2：CLEANED（清洗）
  - 过滤无效事件（格式错误的 JSON、缺少 project_id）
  - PII 字段脱敏（email、phone -> 哈希或移除）
  - 时间戳标准化为 UTC
  - 应用 insert_id 去重
  - Schema：与原始相同 + 服务器时间戳

阶段 3：ENRICHED（富化）
  - 已应用身份解析（匿名 -> 用户）
  - 已完成 Geo-IP 查找（国家、城市）
  - 已解析 User-Agent（设备、浏览器、操作系统）
  - 已分配 Session ID
  - UTM 归因传播（首次触达 / 末次触达）
  - Schema：原始 + identity_resolved_distinct_id, session_id, geo_*, device_*

阶段 4：AGGREGATED（聚合）
  - 按时间桶汇总（1 分钟、1 小时、1 天）
  - 计算独立用户的 HyperLogLog sketch
  - 计算属性值分布
  - Funnel 步骤完成计数
  - 留存网格更新
  - Schema：维度聚合，非单个事件
```

### 19.2 Schema-on-Read vs Schema-on-Write

```
+-----------------------+---------------------------+
| Schema-on-Write       | Schema-on-Read            |
+-----------------------+---------------------------+
| 预先定义列            | 存储原始 JSON blob        |
| 严格类型检查          | 查询时解析                |
| 读取更快              | 灵活的 schema 演化        |
| 存储更少（类型化）    | 存储更多（冗余）          |
| 难以添加字段          | 无需迁移                  |
+-----------------------+---------------------------+

分析平台方案：混合模式

核心字段：Schema-on-Write（event_name, distinct_id, timestamp）
  - 有索引、强类型、快速查询

自定义属性：Schema-on-Read（properties JSON blob）
  - 灵活：客户定义自己的事件 schema
  - 查询时使用 JSONExtract：JSONExtractString(properties, 'product_id')
  - ClickHouse 支持 JSON 路径下推以提升性能

属性 schema registry（可选）：
  客户可以为每种事件类型定义 schema
  支持：摄取时的类型验证、UI 中的自动补全
  存储：已注册的 schema 存储在 PostgreSQL 中
```

---

## 20. 扩展策略

### 20.1 摄取层扩展

```
Collector 服务：
  - 无状态；使用 HPA（Kubernetes）水平扩展
  - 目标：每 Pod 5 万事件/秒
  - 200 万事件/秒时：40 个 Pod * 2 用于高可用 = 80 个 Pod
  - 自动扩展触发：CPU > 60% 或队列深度 > 10K

Kafka 扩展：
  - 随吞吐量增长向 raw-events topic 添加分区
  - 分区数 = 最大吞吐量 / 每分区吞吐量
  - 200 万事件/秒 / 每分区 5 万 = 40 个分区
  - Broker：40 个分区 + 副本因子 3 需要 20 个 broker
  - 分层存储：Kafka -> S3 实现无限保留

Flink 扩展：
  - 并行度 = 分区数（40 个任务槽）
  - 状态后端：RocksDB（溢出到磁盘，处理大状态）
  - 检查点：每 30 秒到 S3 以实现容错
```

### 20.2 存储层扩展

```
ClickHouse 扩展策略：

垂直扩展（每节点）：
  - 更多 RAM：更大的缓存，更快的 GROUP BY
  - 更多 CPU：更快的向量化计算
  - NVMe SSD：更快的 MergeTree 压实

水平分片：
  - 按 project_id 分片（租户隔离）
  - 每个分片 2 个副本（容错）
  - Distributed 表：读取分发到所有分片
  - 随存储增长添加分片：线性扩展

热/温/冷分层：
  热（0-30 天）：   本地 NVMe SSD，ClickHouse 集群
  温（30-90 天）：  挂载 EBS 卷，按需查询
  冷（90 天以上）： S3 上的 Parquet，通过 ClickHouse S3 引擎查询
  归档（2 年以上）：Glacier，按需恢复

查询缓存：
  Redis：缓存仪表盘查询（TTL 60 秒）
  查询哈希：MD5(project_id + query_params + time_range_bucket)
  命中率目标：标准仪表盘查询 70%+
```

### 20.3 多租户隔离

```
租户隔离策略：

1. 共享集群，逻辑隔离（默认）：
   - 所有租户在同一个 ClickHouse 集群中
   - 每个 WHERE 子句都包含 project_id
   - 按 (project_id, date) 分区
   - 通过查询中间件实现行级安全
   - 成本：低廉；风险：嘈杂邻居

2. 大租户专用集群：
   - 查询量大的企业客户
   - 专用 Kafka topic、ClickHouse 分片
   - 完全数据隔离
   - 成本：昂贵；风险：过度配置

3. 资源配额（折中方案）：
   - 每个 project_id 的 ClickHouse 用户配额
   - 最大并发查询数：每项目 10 个
   - 每查询最大内存：16 GB
   - 最大查询持续时间：60 秒
   - Collector API 的限流：按 API key
```

---

## 21. 权衡取舍

### 21.1 关键设计权衡

| 决策         | 选项 A              | 选项 B           | 选择          | 原因                                              |
| ------------ | ------------------- | ---------------- | ------------- | ------------------------------------------------- |
| 查询引擎     | ClickHouse          | BigQuery         | ClickHouse    | 更低延迟（<3s vs 5-30s），自托管，成本可控        |
| 流处理       | Kafka + Flink       | Kinesis + Lambda | Kafka + Flink | 更高吞吐量，有状态处理，无按事件计费              |
| 身份解析     | 同步（请求内）      | 异步（摄取后）   | 异步          | Collector 保持高速（<10ms）；身份关联离线处理     |
| 独立用户计数 | 精确 COUNT DISTINCT | HyperLogLog      | HLL           | 1-2% 误差可接受；节省 100 倍内存                  |
| Funnel 计算  | 预计算              | 按需             | 混合          | 常用 funnel 预计算；即席查询按需计算              |
| 会话边界     | 客户端              | 服务端           | 服务端        | 一致的会话化；客户端不可信                        |
| Schema       | 固定 schema         | 动态 JSON        | 混合          | 核心字段固定；自定义属性用 JSON blob              |
| 采样         | 不采样              | 渐进式采样       | 渐进式        | 用户体验：200ms 内显示结果 vs 30s；按需提供精确值 |

### 21.2 一致性 vs 可用性

```
分析平台倾向于可用性优先于一致性（CAP 中的 AP）：

原因：
  - 丢失一个事件比显示略微过时的计数更糟糕
  - 仪表盘读取可以容忍 60 秒的陈旧度
  - 实时精确计数的重要性低于快速响应

可接受的不一致性：
  - 仪表盘事件计数可能滞后 1-2 分钟
  - 独立用户计数是近似的（HLL ~1% 误差）
  - Funnel 结果在最终一致性快照上计算
  - 已删除用户可能在报表中出现最多 24 小时

保证的一致性：
  - 事件摄取：至少一次（Kafka acks）
  - 去重：通过 insert_id 最终一致
  - 身份合并：最终传播到所有查询
```

---

## 22. 分析平台对比

| 特性            | Mixpanel                 | Amplitude                      | Google Analytics 4        | PostHog                      |
| --------------- | ------------------------ | ------------------------------ | ------------------------- | ---------------------------- |
| **核心定位**    | 用户行为分析             | 产品分析                       | 网页/应用流量分析         | 开源产品分析                 |
| **Funnel 分析** | 优秀（业界最佳）         | 优秀                           | 基础                      | 良好                         |
| **Cohort 分析** | 良好                     | 优秀 (Journeys)                | 有限                      | 良好                         |
| **会话分析**    | 有限                     | 有限                           | 优秀                      | 良好                         |
| **实时**        | 是（< 1 分钟）           | 是（< 1 分钟）                 | 是（流式）                | 是（< 1 分钟）               |
| **A/B 测试**    | 通过 Experiments         | 是（内置）                     | Google Optimize（已弃用） | Feature Flags + Experiments  |
| **SQL 访问**    | 否（专有查询）           | 是 (Amplitude SQL)             | BigQuery 导出             | 是 (PostHog SQL)             |
| **数据所有权**  | 供应商持有数据           | 供应商持有数据                 | Google 持有数据           | 可自托管                     |
| **隐私 / GDPR** | 欧盟数据驻留             | 欧盟数据驻留                   | 数据保留限制              | 完全控制（自托管）           |
| **采样**        | 不采样（<=10 亿事件/月） | 超出配额后采样                 | 大量采样 (GA4)            | 不采样                       |
| **仓库同步**    | 是 (Mixpanel -> BQ)      | 是 (Amplitude -> BQ/Snowflake) | 原生 BigQuery             | 是 (PostHog -> BQ/Snowflake) |
| **定价模式**    | 基于 MTU                 | 月度追踪用户                   | 免费 + 360（企业版）      | 基于事件（慷慨的免费层）     |
| **SDK 支持**    | JS, iOS, Android, 服务端 | JS, iOS, Android, 服务端       | gtag.js, Firebase         | JS, iOS, Android, 15+ SDK    |
| **离线支持**    | 客户端 SDK 队列          | 客户端 SDK 队列                | 基础缓冲                  | 客户端 SDK 队列              |
| **存储架构**    | 专有列式存储             | 基于 Snowflake                 | BigQuery                  | ClickHouse                   |
| **最适合**      | 初创公司、B2C 应用       | 企业产品团队                   | 营销/SEO 团队             | 注重隐私、开源               |

### 22.1 查询语言对比

```
Mixpanel (JQL - JavaScript Query Language)：
  function main() {
    return Events({
      from_date: '2026-02-01',
      to_date: '2026-03-01',
      event_selectors: [{ event: 'Purchase Completed' }]
    }).groupByUser(['properties.country'], mixpanel.reducer.count());
  }

Amplitude (Amplitude SQL / Chart UI)：
  SELECT user_id, count(*) as purchases
  FROM events
  WHERE event_type = 'Purchase Completed'
    AND event_time BETWEEN '2026-02-01' AND '2026-03-01'
  GROUP BY user_id
  HAVING purchases >= 2;

Google Analytics 4 (BigQuery SQL)：
  SELECT event_name, COUNT(*) as count
  FROM `myproject.analytics_123456789.events_*`
  WHERE _TABLE_SUFFIX BETWEEN '20260201' AND '20260301'
    AND event_name = 'purchase'
  GROUP BY event_name;

PostHog (HogQL - 兼容 ClickHouse 的 SQL)：
  SELECT properties.country, count() as events
  FROM events
  WHERE event = 'Purchase Completed'
    AND toDate(timestamp) BETWEEN '2026-02-01' AND '2026-03-01'
  GROUP BY properties.country
  ORDER BY events DESC;
```

---

## 23. 常见面试追问

**问：如何处理乱序或延迟到达的事件？**

答：接受时间戳在过去 24 小时内的事件（可按项目配置）。Flink 使用事件时间处理和水印策略：将水印推进到 `max(event_time) - 5 分钟`。水印窗口内的事件正常处理；超出水印的迟到事件被发送到侧输出进行延迟处理。ClickHouse 按事件日期分区，因此迟到事件会插入到正确的分区。受影响时间桶的预聚合物化视图通过延迟刷新任务重新计算。

---

**问：身份图谱如何扩展到 1 亿用户？**

答：身份图谱是一个键值存储（Redis Cluster），有 3 种分片键：`anon:{project}:{anon_id}`、`device:{project}:{device_id}` 和 `user:{project}:{user_id}`。1 亿用户平均每人 2 台设备，共 3 亿个键。每个键约 100 字节 -> 总计 30 GB，轻松放入 Redis（3 节点 \* 64 GB）。对于非常大的企业客户，我们使用持久化图存储（Apache TinkerPop / Amazon Neptune）处理复杂的多跳查询，Redis 作为快速查找缓存。

---

**问：如何在大规模下高效计算 funnel？**

答：根据 funnel 复杂度使用三种策略。对于使用常见事件的简单 3 步 funnel，使用每小时更新的预计算物化视图。对于即席 funnel，使用 ClickHouse 内置的窗口函数 `windowFunnel()`：`SELECT windowFunnel(604800)(event_time, event='A', event='B', event='C') FROM events WHERE project_id=123 GROUP BY distinct_id`。这在单次表扫描中逐用户处理事件。对于非常大的数据集（>30 天范围），使用近似 bitmap：将每个步骤的用户集表示为 RoaringBitmap，计算交集得到转化数。1 亿位的 bitmap 交集只需微秒级时间。

---

**问：如何防止一个嘈杂租户影响其他租户？**

答：多层隔离：(1) 在 Collector 使用每 API key 的令牌桶限流（可按计划等级配置）。(2) Kafka topic 按 project_id 分区，大租户使用专用消费者组。(3) ClickHouse 每用户查询配额：max_concurrent_queries=10, max_memory_usage=16GB, max_execution_time=60s。(4) 查询队列：大租户有自己的查询队列，小租户共享一个池。(5) 对于企业 SLA 客户，提供专用 ClickHouse 分片，完全不共享。

---

**问：GDPR 删除如何在不破坏预聚合数据的情况下工作？**

答：删除在两个层面操作。对于原始事件：我们在事件存储中使用伪匿名 ID；删除身份映射条目使用户的事件无法解析到 PII，同时不破坏聚合数据。对于预聚合计数：计数不包含 PII，因此保留。删除后计数可能偏差 ±1 个用户，这是可接受的。对于包含 PII 特征的用户画像：在 24 小时内从 user_profiles 表和身份图谱中硬删除。对于大规模删除请求（如公司范围的数据清除），使用 ClickHouse ALTER TABLE DETACH PARTITION 分离用户的日期分区，然后 DROP。

---

**问：如何确保事件的精确一次处理？**

答：真正的精确一次成本很高；我们使用至少一次投递加幂等去重。客户端为每个事件包含一个唯一的 `insert_id`（UUID v7，客户端生成）。Flink 在 24 小时窗口内使用 Bloom filter（第一层）和 Redis SETNX（第二层）进行去重。ClickHouse ReplacingMergeTree 通过 `(project_id, insert_id)` 确保最终存储的副本唯一 - 尽管短暂存在多个副本，在合并时被折叠。查询使用 `FINAL` 修饰符或 `SELECT DISTINCT insert_id` 在读取时精确去重。

---

**问：如何设计 SDK 以最小化对应用性能的影响？**

答：SDK 在后台线程/队列上运行，永远不阻塞主线程。JavaScript SDK 使用 Web Worker 或 requestIdleCallback 进行批处理。事件入队到内存中（从调用者角度看是 O(1) 操作）并异步刷新。负载在发送前进行 Gzip 压缩（80% 体积缩减）。重试逻辑使用带抖动的指数退避以避免惊群效应。内存队列上限为 500 个事件；如果满了，旧事件被丢弃。基于磁盘的离线队列仅用于移动应用，不用于网页。总 SDK 体积：JS 压缩后 <15 KB，iOS/Android 二进制 <500 KB。

---

**问：热数据与冷数据的策略是什么？**

答：三层存储：热（0-30 天）在 NVMe SSD 上的 ClickHouse 中，支持 3 秒以内的查询；温（30-90 天）在较便宜的 EBS 卷上的 ClickHouse 中，查询稍慢（5-15 秒）；冷（90 天以上）作为 S3 上的 Parquet 文件，可通过 ClickHouse 的 S3 引擎或 Trino/Athena 进行一次性历史分析。ClickHouse 的 TTL 规则根据数据年龄自动在层之间移动分区。用户在运行冷查询前会看到查询时间估算（"此查询涉及冷存储，可能需要 30-60 秒"）。对于自助仓库导出，我们将原始 Parquet 同步到客户的 BigQuery/Snowflake，无查询成本。

---

**问：如何处理 A/B 测试跨设备的分组一致性？**

答：分组基于 `hash(user_id + experiment_id) % 100` 确定性计算。登录同一用户账户的任何设备都会获得相同的变体。对于匿名用户（登录前），分组基于 `hash(anonymous_id + experiment_id) % 100` 并缓存在 localStorage/cookie 中。登录时（身份解析），如果用户之前在其他设备/会话中已被分组，我们检查冲突：如果是同一实验，无操作（相同分桶）。如果他们在网页端是对照组而在移动端是实验组（罕见），我们保留最早的分组。分组在服务端存储在 Redis 中，TTL 30 天；TTL 到期后，确定性重新分组（相同 user_id 得到相同结果）。
