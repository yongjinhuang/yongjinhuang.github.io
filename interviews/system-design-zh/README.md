# 系统设计面试准备指南

## 概述

本目录包含全面的系统设计面试准备材料，涵盖**43个主题**，横跨经典基础、基础设施深度剖析、特定领域系统、SaaS与平台系统以及2025-2026年的新兴趋势。每份指南都遵循结构化方法，包含数据建模、架构图、权衡分析和扩展策略。

## 使用方法

1. **从框架开始** - 首先阅读 `00-FRAMEWORK.md`。它教你用4步法应对任何系统设计问题。
2. **按优先级学习主题** - 主题按面试出现频率排序。优先关注第一梯队。
3. **配合图表练习** - 每个主题都包含 ASCII 架构图，你可以在白板上重新绘制。
4. **复习数据模型** - 理解 Schema 设计决策及其背后的原因。
5. **掌握权衡分析** - 面试官更关注你的推理过程，而非"正确"答案。

## 目录

### 框架

| # | 文件 | 描述 |
|---|------|------|
| 0 | [00-FRAMEWORK.md](00-FRAMEWORK.md) | 系统设计面试的4步框架 |

### 第一梯队：必须掌握（80%以上的面试会考到）

| # | 文件 | 主题 | Key Concepts |
|---|------|------|--------------|
| 1 | [01-URL-SHORTENER.md](01-URL-SHORTENER.md) | 短链接服务 (TinyURL) | Hashing, Base62, read-heavy systems |
| 2 | [02-RATE-LIMITER.md](02-RATE-LIMITER.md) | 限流器 | Token bucket, sliding window, distributed counting |
| 3 | [03-CHAT-SYSTEM.md](03-CHAT-SYSTEM.md) | 聊天系统 (WhatsApp) | WebSocket, message queue, presence |
| 4 | [04-NEWS-FEED.md](04-NEWS-FEED.md) | 信息流 (Twitter/Facebook) | Fan-out, ranking, caching |

### 第二梯队：高频考题（50-80%的面试会考到）

| # | 文件 | 主题 | Key Concepts |
|---|------|------|--------------|
| 5 | [05-NOTIFICATION-SYSTEM.md](05-NOTIFICATION-SYSTEM.md) | 通知系统 | Push/pull, priority queue, deduplication |
| 6 | [06-DISTRIBUTED-CACHE.md](06-DISTRIBUTED-CACHE.md) | 分布式缓存 (Redis) | Consistent hashing, eviction, replication |
| 7 | [07-SEARCH-AUTOCOMPLETE.md](07-SEARCH-AUTOCOMPLETE.md) | 搜索自动补全 | Trie, prefix matching, ranking |
| 8 | [08-VIDEO-STREAMING.md](08-VIDEO-STREAMING.md) | 视频流媒体 (YouTube) | CDN, transcoding, adaptive bitrate |

### 第三梯队：进阶主题（30-50%的面试会考到）

| # | 文件 | 主题 | Key Concepts |
|---|------|------|--------------|
| 9 | [09-MESSAGE-QUEUE.md](09-MESSAGE-QUEUE.md) | 分布式消息队列 (Kafka) | Partitioning, offset, consumer groups |
| 10 | [10-KEY-VALUE-STORE.md](10-KEY-VALUE-STORE.md) | 键值存储 | LSM tree, consistent hashing, replication |
| 11 | [11-WEB-CRAWLER.md](11-WEB-CRAWLER.md) | 网络爬虫 | BFS, politeness, deduplication |
| 12 | [12-PROXIMITY-SERVICE.md](12-PROXIMITY-SERVICE.md) | 附近服务 (Yelp) | Geohash, quadtree, spatial indexing |

### 第四梯队：2025-2026年新兴主题

| # | 文件 | 主题 | Key Concepts |
|---|------|------|--------------|
| 13 | [13-RAG-LLM-SERVING.md](13-RAG-LLM-SERVING.md) | RAG 流水线与 LLM 服务 | Vector DB, embeddings, retrieval, chunking, inference scaling |
| 14 | [14-ML-RECOMMENDATION.md](14-ML-RECOMMENDATION.md) | 机器学习推荐系统 | Feature store, collaborative filtering, two-tower model, A/B testing |
| 15 | [15-PAYMENT-SYSTEM.md](15-PAYMENT-SYSTEM.md) | 支付系统 (Stripe) | Exactly-once, idempotency, double-entry ledger, PCI compliance |
| 16 | [16-GOOGLE-MAPS.md](16-GOOGLE-MAPS.md) | 谷歌地图 / 导航 | Contraction hierarchies, tile rendering, real-time traffic, ETA |
| 17 | [17-RIDE-SHARING.md](17-RIDE-SHARING.md) | 网约车 (Uber/Lyft) | Geospatial matching, surge pricing, trip state machine, ETA |
| 18 | [18-DISTRIBUTED-LOGGING.md](18-DISTRIBUTED-LOGGING.md) | 分布式日志 (ELK/Datadog) | Log ingestion, Elasticsearch, tracing, alerting, observability |

### 第五梯队：基础设施与架构深度剖析（2025-2026）

| # | 文件 | 主题 | Key Concepts |
|---|------|------|--------------|
| 19 | [19-UNIQUE-ID-GENERATOR.md](19-UNIQUE-ID-GENERATOR.md) | 唯一ID生成器 (Snowflake) | Snowflake bit layout, ULID, UUID v7, clock drift, k-sortability |
| 20 | [20-COLLABORATIVE-EDITOR.md](20-COLLABORATIVE-EDITOR.md) | 协同编辑器 (Google Docs) | CRDT, Operational Transform, real-time sync, presence, conflict resolution |
| 21 | [21-OBJECT-STORAGE.md](21-OBJECT-STORAGE.md) | 对象存储 (Amazon S3) | Erasure coding, 11-nines durability, multipart upload, lifecycle policies |
| 22 | [22-DISTRIBUTED-TASK-SCHEDULER.md](22-DISTRIBUTED-TASK-SCHEDULER.md) | 分布式任务调度器 (Temporal) | DAG execution, durable execution, saga pattern, workflow orchestration |
| 23 | [23-AI-AGENT-ORCHESTRATION.md](23-AI-AGENT-ORCHESTRATION.md) | AI Agent 编排平台 | Multi-agent systems, tool calling, guardrails, memory, model routing |
| 24 | [24-EVENT-SOURCING-CQRS.md](24-EVENT-SOURCING-CQRS.md) | 事件溯源与 CQRS | Append-only event log, projections, saga, schema evolution, DDD |
| 25 | [25-CONTENT-DELIVERY-NETWORK.md](25-CONTENT-DELIVERY-NETWORK.md) | 内容分发网络 (Cloudflare) | Edge compute, cache hierarchy, anycast, HTTP/3 QUIC, DDoS protection |
| 26 | [26-ECOMMERCE-INVENTORY.md](26-ECOMMERCE-INVENTORY.md) | 电商库存与订单 (Amazon) | Stock reservation, saga pattern, flash sales, order state machine |

### 第六梯队：特定领域系统（面试高频）

| # | 文件 | 主题 | Key Concepts |
|---|------|------|--------------|
| 27 | [27-AUTH-SSO-SYSTEM.md](27-AUTH-SSO-SYSTEM.md) | 认证与单点登录系统 | OAuth 2.0, OIDC, SAML, JWT, MFA, WebAuthn, session management |
| 28 | [28-AD-SERVING-RTB.md](28-AD-SERVING-RTB.md) | 广告投放与实时竞价 | RTB auction, DSP/SSP, CTR prediction, frequency capping, attribution |
| 29 | [29-BOOKING-RESERVATION.md](29-BOOKING-RESERVATION.md) | 预订系统 (Airbnb) | Double-booking prevention, overbooking, waitlist, dynamic pricing |
| 30 | [30-FOOD-DELIVERY.md](30-FOOD-DELIVERY.md) | 外卖配送 (DoorDash) | Three-sided marketplace, dispatch, driver batching, ETA prediction |
| 31 | [31-SEARCH-ENGINE.md](31-SEARCH-ENGINE.md) | 全文搜索引擎 (Elasticsearch) | Inverted index, BM25, faceted search, hybrid search, NRT indexing |

### 第七梯队：平台与信任系统（面试中频）

| # | 文件 | 主题 | Key Concepts |
|---|------|------|--------------|
| 32 | [32-ANALYTICS-PLATFORM.md](32-ANALYTICS-PLATFORM.md) | 数据分析平台 (Mixpanel) | Event ingestion, funnels, cohorts, retention, OLAP, HyperLogLog |
| 33 | [33-MARKETPLACE.md](33-MARKETPLACE.md) | 电商平台 (Airbnb/Etsy) | Two-sided matching, escrow, trust/safety, reviews, cold start |
| 34 | [34-CONTENT-MODERATION.md](34-CONTENT-MODERATION.md) | 内容审核 (Facebook) | ML classification, hash matching, human review, appeals, policy engine |
| 35 | [35-DIGITAL-WALLET.md](35-DIGITAL-WALLET.md) | 数字钱包与账本 (PayPal) | Double-entry bookkeeping, P2P, KYC/AML, reconciliation, fraud |
| 36 | [36-API-GATEWAY.md](36-API-GATEWAY.md) | API 网关与服务网格 (Kong/Envoy) | Routing, circuit breaker, mTLS, service discovery, sidecar proxy |

### 第八梯队：SaaS与平台系统

| # | 文件 | 主题 | Key Concepts |
|---|------|------|--------------|
| 37 | [37-SUBSCRIPTION-BILLING.md](37-SUBSCRIPTION-BILLING.md) | 订阅与计费系统 | Plan management, dunning, proration, metered billing, payment retry |
| 38 | [38-MULTI-TENANT-SAAS.md](38-MULTI-TENANT-SAAS.md) | 多租户 SaaS 平台 | Schema isolation, resource quotas, tenant routing, data partitioning |
| 39 | [39-FEATURE-FLAGS.md](39-FEATURE-FLAGS.md) | 功能开关系统 (LaunchDarkly) | Flag evaluation, targeting rules, gradual rollout, A/B testing |
| 40 | [40-CMS.md](40-CMS.md) | 内容管理系统 | Content modeling, editorial workflows, versioning, headless API |
| 41 | [41-TICKETING-SYSTEM.md](41-TICKETING-SYSTEM.md) | 工单与客服系统 (Zendesk) | Queue routing, SLA tracking, escalation, omni-channel |
| 42 | [42-LOYALTY-REWARDS.md](42-LOYALTY-REWARDS.md) | 会员与积分系统 | Points ledger, tier calculation, redemption, partner integration |
| 43 | [43-ELEARNING-PLATFORM.md](43-ELEARNING-PLATFORM.md) | 在线学习平台 (Coursera) | Progress tracking, video delivery, certificates, adaptive learning |

## 快速参考：常见构建模块

以下构建模块在多个系统设计问题中反复出现：

| 构建模块 | 使用场景 | 用途 |
|----------|----------|------|
| **Load Balancer** | 所有系统 | 将流量分发到多台服务器 |
| **CDN** | 视频、信息流 | 将静态内容缓存到离用户更近的位置 |
| **Message Queue** | 聊天、通知、信息流 | 异步处理、解耦 |
| **Cache (Redis)** | 所有读密集型系统 | 降低数据库负载 |
| **Database Sharding** | 所有大规模系统 | 水平数据分区 |
| **Consistent Hashing** | 缓存、键值存储 | 均匀数据分布 |
| **Rate Limiter** | 所有公开 API | 防止滥用 |
| **WebSocket** | 聊天、通知 | 实时双向通信 |
| **Bloom Filter** | 爬虫、缓存 | 概率性成员检测 |
| **Zookeeper** | 队列、键值存储 | 分布式协调 |
| **Vector Database** | RAG、推荐系统 | 基于 Embeddings 的相似性搜索 |
| **Feature Store** | 推荐系统、机器学习 | 在线/离线提供 ML 特征 |
| **Graph Algorithms** | 地图、社交网络 | 最短路径、匹配 |
| **State Machine** | 支付、网约车 | 建模实体生命周期 |
| **OpenTelemetry** | 日志、链路追踪 | 可观测性基础设施 |
| **CRDT / OT** | 协同编辑器 | 无冲突复制数据类型 |
| **Erasure Coding** | 对象存储 | 低开销的容错存储 |
| **Snowflake IDs** | ID 生成器、所有系统 | 时间可排序的分布式唯一 ID |
| **Saga Pattern** | 任务调度器、电商 | 分布式事务协调 |
| **Edge Compute** | CDN | 在边缘节点运行代码（Workers、Lambda@Edge） |
| **Event Sourcing** | CQRS、审计系统 | 以追加写入的事件日志作为数据源 |
| **LLM Routing** | AI Agent 编排 | 成本/质量模型选择与级联 |
| **Inverted Index** | 搜索引擎 | 基于 BM25 评分的全文搜索 |
| **Escrow** | 电商平台、钱包 | 在交易完成前托管资金 |
| **Double-Entry Ledger** | 钱包、支付 | 每笔借方都有对应的贷方 |
| **Circuit Breaker** | API 网关 | 防止跨服务级联故障 |
| **RTB Auction** | 广告投放 | 100ms 预算内的实时竞价 |
| **Sidecar Proxy** | Service Mesh | 每个 Pod 的网络代理（Envoy） |
| **Hash Matching** | 内容审核 | 用 PhotoDNA/pHash 识别已知违规内容 |

## 覆盖范围对照：系统设计 vs 互联网业务知识

与[互联网业务知识](../web-business/00-README.md)指南交叉参考。这有助于你同时学习**怎么做**（系统设计）和**为什么**（业务逻辑）。

### 已覆盖（已有对应的系统设计主题）

| 互联网业务 | 系统设计 | 备注 |
|---|---|---|
| 01 - 认证 | [27-AUTH-SSO-SYSTEM](27-AUTH-SSO-SYSTEM.md) | OAuth 2.0, OIDC, SAML, JWT, MFA, SSO |
| 02 - 支付处理 | [15-PAYMENT-SYSTEM](15-PAYMENT-SYSTEM.md) | 完整覆盖 |
| 03 - 电子商务 | [26-ECOMMERCE-INVENTORY](26-ECOMMERCE-INVENTORY.md) | 库存、订单、结算 |
| 06 - 邮件与通知 | [05-NOTIFICATION-SYSTEM](05-NOTIFICATION-SYSTEM.md) | Push/pull、优先级、去重 |
| 08 - 搜索与筛选 | [07-SEARCH-AUTOCOMPLETE](07-SEARCH-AUTOCOMPLETE.md) + [31-SEARCH-ENGINE](31-SEARCH-ENGINE.md) | 自动补全 + 全文搜索 |
| 09 - 文件上传与存储 | [21-OBJECT-STORAGE](21-OBJECT-STORAGE.md) | S3 架构、Erasure Coding |
| 11 - 数据分析与追踪 | [32-ANALYTICS-PLATFORM](32-ANALYTICS-PLATFORM.md) | 漏斗、群组、OLAP、HLL |
| 14 - 第三方集成 | [36-API-GATEWAY](36-API-GATEWAY.md) | 网关、路由、服务网格 |
| 17 - 限流与 API | [02-RATE-LIMITER](02-RATE-LIMITER.md) | Token bucket, sliding window |
| 18 - 缓存策略 | [06-DISTRIBUTED-CACHE](06-DISTRIBUTED-CACHE.md) | Redis, consistent hashing |
| 20 - 日志与监控 | [18-DISTRIBUTED-LOGGING](18-DISTRIBUTED-LOGGING.md) | ELK、链路追踪、告警 |
| 22 - 业务中的 LLM 与 RAG | [13-RAG-LLM-SERVING](13-RAG-LLM-SERVING.md) | Vector DB、检索、推理 |
| 23 - 即时通讯 | [03-CHAT-SYSTEM](03-CHAT-SYSTEM.md) | WebSocket、在线状态、消息送达 |
| 24 - 社交信息流与审核 | [04-NEWS-FEED](04-NEWS-FEED.md) + [34-CONTENT-MODERATION](34-CONTENT-MODERATION.md) | 信息流 + ML 审核流水线 |
| 25 - 电商平台 | [33-MARKETPLACE](33-MARKETPLACE.md) | 双边市场、托管、信任/安全 |
| 26 - 广告技术 | [28-AD-SERVING-RTB](28-AD-SERVING-RTB.md) | RTB、竞价、定向投放、归因分析 |
| 27 - 预订与预约 | [29-BOOKING-RESERVATION](29-BOOKING-RESERVATION.md) | 防止重复预订、超售 |
| 28 - 金融科技与钱包 | [35-DIGITAL-WALLET](35-DIGITAL-WALLET.md) | 复式记账、P2P、KYC |
| 29 - 视频与直播 | [08-VIDEO-STREAMING](08-VIDEO-STREAMING.md) | CDN、转码、ABR |
| 33 - 外卖配送 | [30-FOOD-DELIVERY](30-FOOD-DELIVERY.md) | 调度、批次、ETA |

### 部分覆盖

| 互联网业务 | 系统设计 | 差距 |
|---|---|---|
| 21 - 配送与供应链 | [17-RIDE-SHARING](17-RIDE-SHARING.md) + [30-FOOD-DELIVERY](30-FOOD-DELIVERY.md) | 最后一公里已覆盖；仓储物流、车队管理缺失 |
| 31 - 工作流与审批 | [22-DISTRIBUTED-TASK-SCHEDULER](22-DISTRIBUTED-TASK-SCHEDULER.md) | DAG 执行已覆盖；业务审批链、委托、SLA 缺失 |

### 新增覆盖（第八梯队：SaaS与平台系统）

| 互联网业务 | 系统设计 | 备注 |
|---|---|---|
| 04 - 订阅与计费 | [37-SUBSCRIPTION-BILLING](37-SUBSCRIPTION-BILLING.md) | 计划管理、催缴、按比例计费、计量 |
| 12 - 多租户 | [38-MULTI-TENANT-SAAS](38-MULTI-TENANT-SAAS.md) | Schema 隔离、资源配额、路由 |
| 19 - 功能开关 | [39-FEATURE-FLAGS](39-FEATURE-FLAGS.md) | Flag 评估、定向规则、灰度发布 |
| 07 - 内容管理 | [40-CMS](40-CMS.md) | 内容建模、工作流、版本控制 |
| 30 - 客户支持 | [41-TICKETING-SYSTEM](41-TICKETING-SYSTEM.md) | 队列路由、SLA 追踪、升级 |
| 32 - 会员与积分 | [42-LOYALTY-REWARDS](42-LOYALTY-REWARDS.md) | 积分账本、等级计算、兑换 |
| 34 - 在线教育 | [43-ELEARNING-PLATFORM](43-ELEARNING-PLATFORM.md) | 进度追踪、视频交付、证书 |

### 未覆盖（无需对应的系统设计主题）

| 互联网业务主题 | 原因 |
|---|---|
| 05 - 用户管理 | 已包含在 [27-AUTH-SSO-SYSTEM](27-AUTH-SSO-SYSTEM.md) 中 |
| 10 - DevOps 流水线 | 属于 DevOps 面试，非系统设计 |
| 13 - 数据隐私 | 跨领域关注点 |
| 15 - 国际化 | 非系统设计主题 |
| 16 - SEO | 非系统设计主题 |

## 学习计划建议

| 周次 | 重点 | 主题 |
|------|------|------|
| 第1周 | 框架 + 第一梯队 | 框架、短链接服务、限流器 |
| 第2周 | 第一梯队（续） | 聊天系统、信息流 |
| 第3周 | 第二梯队 | 通知系统、缓存、自动补全、视频流媒体 |
| 第4周 | 第三梯队 | 消息队列、键值存储、爬虫、附近服务 |
| 第5周 | 第四梯队（新兴） | RAG/LLM、ML 推荐系统、支付系统 |
| 第6周 | 第四梯队（续） | 谷歌地图、网约车、分布式日志 |
| 第7周 | 第五梯队（深度剖析） | 唯一ID生成器、协同编辑器、对象存储 |
| 第8周 | 第五梯队（续） | 任务调度器、AI Agent、事件溯源、CDN、电商 |
| 第9周 | 第六梯队（领域） | 认证与SSO、广告投放/RTB、预订系统 |
| 第10周 | 第六梯队（续） | 外卖配送、搜索引擎 |
| 第11周 | 第七梯队（平台） | 数据分析、电商平台、内容审核 |
| 第12周 | 第七梯队（续） | 数字钱包、API 网关与服务网格 |
| 第13周 | 第八梯队（SaaS） | 订阅与计费、多租户 SaaS、功能开关、CMS |
| 第14周 | 第八梯队（续） | 工单系统、会员与积分、在线学习平台 |

祝你面试顺利！
