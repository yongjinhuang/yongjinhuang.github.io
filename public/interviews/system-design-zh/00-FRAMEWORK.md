# 系统设计面试框架

一份全面且可操作的指南，帮助你应对任何系统设计面试。

---

## 目录

1. [四步框架](#四步框架)
2. [第一步：理解问题与确定设计范围](#第一步理解问题与确定设计范围)
3. [第二步：提出高层设计](#第二步提出高层设计)
4. [第三步：深入设计](#第三步深入设计)
5. [第四步：总结](#第四步总结)
6. [粗略估算](#粗略估算)
7. [常用构建模块](#常用构建模块)
8. [CAP 定理](#cap-定理)
9. [数据库选型指南](#数据库选型指南)
10. [通信协议](#通信协议)
11. [评分标准](#评分标准)
12. [快速参考清单](#快速参考清单)

---

## 四步框架

每一场系统设计面试，无论题目是什么，都可以用这个四步框架来应对。面试总时长通常为 45-60 分钟。

```
+-------------------------------------------------------------+
|                    SYSTEM DESIGN INTERVIEW                   |
|                        (45-60 minutes)                       |
+-------------------------------------------------------------+
|                                                              |
|  STEP 1: Understand the Problem    [3-5 min]    ~8%         |
|  +---------------------------------------------------------+ |
|  | Ask clarifying questions, define scope, identify users   | |
|  +---------------------------------------------------------+ |
|                                                              |
|  STEP 2: High-Level Design         [10-15 min]  ~30%        |
|  +---------------------------------------------------------+ |
|  | API design, data model, architecture diagram             | |
|  +---------------------------------------------------------+ |
|                                                              |
|  STEP 3: Design Deep Dive          [10-15 min]  ~45%        |
|  +---------------------------------------------------------+ |
|  | Scale bottlenecks, detailed component design             | |
|  +---------------------------------------------------------+ |
|                                                              |
|  STEP 4: Wrap Up                   [3-5 min]    ~17%        |
|  +---------------------------------------------------------+ |
|  | Error handling, monitoring, future improvements          | |
|  +---------------------------------------------------------+ |
|                                                              |
+-------------------------------------------------------------+
```

**黄金法则：**

- 永远不要直接跳到解决方案。始终从需求开始。
- 在每一步都要大声说出你的思考过程。
- 主导对话。面试官希望你来引导。
- 没有唯一正确的答案。重要的是你的推理过程。
- 权衡取舍是系统设计的核心。要明确地指出它们。

---

## 第一步：理解问题与确定设计范围

**时间预算：3-5 分钟**

这一步是为了证明你不会过早地跳到解决方案。
候选人最大的错误就是跳过这一步。

### 该做什么

1. **用自己的话复述问题**，以确认理解正确。
2. **提出澄清性问题**，了解功能需求和非功能需求。
3. **确定约束条件**（规模、延迟、可用性、一致性）。
4. **定义本次面试的范围内和范围外的内容**。

### 要问的问题

#### 功能需求

| 类别 | 示例问题 |
|----------|-------------------|
| **用户** | 用户是谁？是否有不同的用户角色？ |
| **核心功能** | 需要设计的最重要的功能是什么？ |
| **输入/输出** | 用户输入什么？他们看到什么？ |
| **现有系统** | 是否有可以利用的现有服务？ |
| **边界情况** | 如果发生[异常场景]会怎样？ |

#### 非功能需求

| 类别 | 示例问题 |
|----------|-------------------|
| **规模** | 有多少用户？DAU/MAU 是多少？每秒多少请求？ |
| **性能** | 预期延迟是多少？p50？p99？ |
| **可用性** | 需要什么样的正常运行时间？99.9% 是否足够？ |
| **一致性** | 最终一致性是否可接受，还是需要强一致性？ |
| **持久性** | 是否可以承受数据丢失？数据保留策略是什么？ |
| **地理分布** | 用户是在一个区域还是全球分布的？ |

#### 数据特征

| 类别 | 示例问题 |
|----------|-------------------|
| **数据量** | 每天/每月/每年产生多少数据？ |
| **读写比** | 系统是读密集型还是写密集型？ |
| **数据形态** | 典型的记录是什么样的？ |
| **访问模式** | 数据如何被查询？热数据与冷数据？ |
| **增长速率** | 数据增长有多快？ |

### 在白板上写什么

在白板顶部创建一个需求框：

```
+------------------------------------------+
| REQUIREMENTS                             |
|                                          |
| Functional:                              |
| - Users can post short messages (280ch)  |
| - Users can follow other users           |
| - Home timeline shows followed posts     |
| - Search posts by keyword                |
|                                          |
| Non-Functional:                          |
| - 500M DAU                               |
| - Timeline load < 200ms                  |
| - Highly available (99.99%)              |
| - Eventual consistency is OK             |
| - Read-heavy (100:1 read/write)          |
|                                          |
| Out of Scope:                            |
| - Direct messages                        |
| - Media uploads                          |
| - Notifications                          |
+------------------------------------------+
```

### 示例对话

> **面试官：** 设计一个类似 bit.ly 的短链接服务。
>
> **你：** 好的，让我确认一下我理解了这个问题。我们需要一个服务，接受一个长 URL 并返回一个短 URL。当用户访问短 URL 时，会被重定向到原始的长 URL。对吗？
>
> **面试官：** 是的，完全正确。
>
> **你：** 让我问几个澄清性问题。首先，预期规模是多少？每天会缩短多少 URL？
>
> **面试官：** 大约每天 1 亿个新 URL。
>
> **你：** 明白了。那读写比是多少？我猜点击短 URL 的人远多于创建短 URL 的人。
>
> **面试官：** 是的，大约 10:1 的读写比。
>
> **你：** 短 URL 是否需要可自定义，还是自动生成的就够了？
>
> **面试官：** 目前自动生成的就可以了。
>
> **你：** 短 URL 的长度呢？URL 是否需要过期？
>
> **面试官：** 尽可能短。默认 URL 5 年后过期。
>
> **你：** 好的，让我也确认一下非功能需求。我们需要高可用性，因为这是一个重定向服务——如果它宕机了，所有短链接都会失效。重定向的延迟应该非常低。我假设最终一致性是可以接受的？
>
> **面试官：** 是的，听起来都对。
>
> **你：** 完美。让我总结一下我们要构建的内容...

### 常见错误

- **直接跳到解决方案**，没有问任何问题。
- **问太多问题**，花了 10 分钟以上才开始设计。
- **没有确认规模**——这会改变整个设计。
- **忽略非功能需求**——这是区分初级和高级工程师的关键。
- **太被动**——等待面试官告诉你该做什么。

---

## 第二步：提出高层设计

**时间预算：10-15 分钟**

这是你展示整体架构的地方。从简单开始，逐步迭代。

### 该做什么

1. **定义 API**——系统暴露哪些端点或接口？
2. **定义数据模型**——核心实体和关系是什么？
3. **画高层架构图**——用方框和箭头展示主要组件。
4. **端到端地走查一个关键用例**。
5. **获得面试官的认可**，然后再深入。

### API 设计

始终从 API 开始，因为它迫使你从用户的角度思考系统。

```
API DESIGN (URL Shortener)
==========================

POST /api/v1/urls
  Request:  { "long_url": "https://example.com/very/long/path" }
  Response: { "short_url": "https://tny.im/abc123", "expires_at": "2031-01-01" }
  Status:   201 Created

GET /{short_code}
  Response: 301 Redirect to long_url
  Headers:  Location: https://example.com/very/long/path

GET /api/v1/urls/{short_code}/stats
  Response: { "clicks": 1234, "created_at": "...", "long_url": "..." }
  Status:   200 OK

DELETE /api/v1/urls/{short_code}
  Status:   204 No Content
```

**API 设计技巧：**
- 使用 RESTful 约定，或者说明你更倾向 GraphQL/gRPC 及原因。
- 从一开始就包含版本控制（v1）。
- 考虑认证和 Rate Limiting。
- 列表端点要考虑分页。
- 写操作要考虑幂等性。

### 数据模型

定义你的核心实体及其关系：

```
DATA MODEL (URL Shortener)
==========================

urls
+----------------+---------------+-----------------------------------+
| Column         | Type          | Notes                             |
+----------------+---------------+-----------------------------------+
| id             | BIGINT        | Primary key, auto-increment       |
| short_code     | VARCHAR(7)    | Unique index, the short URL code  |
| long_url       | VARCHAR(2048) | The original URL                  |
| user_id        | BIGINT        | FK to users table (nullable)      |
| created_at     | TIMESTAMP     | Creation time                     |
| expires_at     | TIMESTAMP     | Expiration time                   |
| click_count    | BIGINT        | Denormalized counter              |
+----------------+---------------+-----------------------------------+

click_events (for analytics)
+----------------+---------------+-----------------------------------+
| Column         | Type          | Notes                             |
+----------------+---------------+-----------------------------------+
| id             | BIGINT        | Primary key                       |
| short_code     | VARCHAR(7)    | FK to urls.short_code             |
| timestamp      | TIMESTAMP     | When the click happened           |
| ip_address     | VARCHAR(45)   | For geo lookups                   |
| user_agent     | VARCHAR(512)  | Browser/device info               |
| referrer       | VARCHAR(2048) | Where the click came from         |
+----------------+---------------+-----------------------------------+
```

### 高层架构图

将架构画成方框和箭头。从简单开始：

```
                         HIGH-LEVEL ARCHITECTURE
                         ======================

    +--------+       +----------------+       +------------------+
    |        |       |                |       |                  |
    | Client +------>| Load Balancer  +------>| Application      |
    |        |       |                |       | Servers          |
    +--------+       +----------------+       | (Stateless)      |
                                              +--------+---------+
                                                       |
                                              +--------+---------+
                                              |                  |
                                         +----+----+      +-----+-----+
                                         |         |      |           |
                                         | Cache   |      | Database  |
                                         | (Redis) |      | (MySQL)   |
                                         |         |      |           |
                                         +---------+      +-----------+
```

然后迭代添加更多细节：

```
                    DETAILED ARCHITECTURE (URL Shortener)
                    ====================================

                            +-----------+
                            |   CDN     |
                            +-----+-----+
                                  |
    +--------+              +-----+------+
    |        |   HTTPS      |            |
    | Client +------------->|    Load    |
    |        |              |  Balancer  |
    +--------+              +-----+------+
                                  |
                    +-------------+-------------+
                    |                           |
              +-----+------+            +------+-----+
              | Write      |            | Read       |
              | Service    |            | Service    |
              +-----+------+            +------+-----+
                    |                          |
              +-----+------+            +------+-----+
              |            |            |            |
              | ID Gen     |            | Cache      |
              | Service    |            | (Redis)    |
              | (Snowflake)|            |            |
              +-----+------+            +------+-----+
                    |                          |
                    +-------------+------------+
                                  |
                         +--------+--------+
                         |                 |
                    +----+----+    +-------+-------+
                    |  MySQL  |    | Analytics DB  |
                    | Primary |    | (Cassandra)   |
                    +----+----+    +---------------+
                         |
                    +----+----+
                    | MySQL   |
                    | Replicas|
                    +---------+
```

### 走查用例

始终带面试官走查至少一个关键流程：

> **你：** 让我走查一下 URL 创建流程：
>
> 1. 客户端发送 POST 请求到 `/api/v1/urls`，附带长 URL。
> 2. 请求到达我们的 Load Balancer，被路由到一个 Write Service 实例。
> 3. Write Service 调用 ID Generation Service 获取唯一的短代码。
> 4. 我们将映射（short_code -> long_url）存储到 MySQL 中。
> 5. 我们同时将此映射写入 Redis 缓存。
> 6. 我们将短 URL 返回给客户端。
>
> 现在是重定向流程：
>
> 1. 客户端访问 `https://tny.im/abc123`。
> 2. 请求到达 Load Balancer，被路由到一个 Read Service 实例。
> 3. Read Service 首先检查 Redis 缓存中的短代码。
> 4. 如果找到（缓存命中），我们立即返回 301 重定向。
> 5. 如果未找到（缓存未命中），我们查询 MySQL，缓存结果，然后重定向。
> 6. 我们异步记录点击事件用于分析。

### 获得面试官认可

在进入深入设计之前，始终确认：

> **你：** 这个高层设计看起来合理吗？有没有你希望我深入的组件，还是我应该聚焦在[我认为最有趣/最有挑战的地方]？

这是协作式的。让面试官引导深入探讨的方向。

### 常见错误

- **一开始就过度设计**——从简单开始，然后增加复杂性。
- **没有 API 设计**——直接跳到架构方框图。
- **没有数据模型**——Schema 体现了你对业务领域的理解。
- **画图时不解释**——始终一边画一边讲解。
- **单体式图表**——将复杂系统拆分为读路径和写路径。
- **不走查用例**——仅靠图表是不够的。

---

## 第三步：深入设计

**时间预算：10-15 分钟**

这是你展示深度的地方。面试官通常会引导你深入 1-2 个他们想探讨的领域。如果没有，选择最具挑战性或最有趣的方面。

### 该做什么

1. **识别瓶颈**——高层设计中的瓶颈在哪里。
2. **深入 2-3 个组件**，进行详细设计。
3. **明确讨论权衡取舍**——每个决策都要。
4. **处理故障场景**和边��情况。
5. **展示扩展策略**——针对已识别的瓶颈。

### 常见深入探讨主题

#### 数据库扩展

```
DATABASE SCALING PROGRESSION
============================

Stage 1: Single Server
+----------+
| DB       |
| (Single) |
+----------+

Stage 2: Primary-Replica (Read Scaling)
+----------+     +----------+     +----------+
| Primary  +---->| Replica  |     | Replica  |
| (Write)  |     | (Read)   |     | (Read)   |
+----------+     +----------+     +----------+

Stage 3: Sharding (Write Scaling)
+----------+     +----------+     +----------+
| Shard 0  |     | Shard 1  |     | Shard 2  |
| (A-H)    |     | (I-P)    |     | (Q-Z)    |
+----------+     +----------+     +----------+
     |                |                |
  +--+--+          +--+--+         +--+--+
  |Rep 1|          |Rep 1|         |Rep 1|
  +-----+          +-----+         +-----+
```

#### 缓存策略

```
CACHE-ASIDE PATTERN (Most Common)
=================================

    +--------+                  +---------+
    | App    |---1. Check------>| Cache   |
    | Server |<--2. Miss--------|         |
    |        |                  +---------+
    |        |---3. Query------>+---------+
    |        |<--4. Return------| Database|
    |        |                  +---------+
    |        |---5. Populate--->+---------+
    |        |                  | Cache   |
    +--------+                  +---------+

WRITE-THROUGH PATTERN
=====================

    +--------+                  +---------+
    | App    |---1. Write------>| Cache   |
    | Server |                  |         |
    |        |                  +----+----+
    |        |                       |
    |        |                  2. Write
    |        |                       |
    |        |                  +----+----+
    |        |                  | Database|
    +--------+                  +---------+

WRITE-BEHIND (WRITE-BACK) PATTERN
==================================

    +--------+                  +---------+
    | App    |---1. Write------>| Cache   |
    | Server |<--2. ACK---------|         |
    |        |                  +----+----+
    +--------+                       |
                               3. Async
                               batch write
                                     |
                                +----+----+
                                | Database|
                                +---------+
```

#### Rate Limiting

```
TOKEN BUCKET ALGORITHM
======================

    Bucket Capacity: 10 tokens
    Refill Rate: 2 tokens/second

    [Request arrives]
         |
         v
    +----+-----+
    | Tokens    |    YES: Allow request, remove 1 token
    | Available?+-------->
    +----+-----+
         |
         | NO
         v
    [Reject: 429 Too Many Requests]

    Token State Over Time:
    t=0s  [**********]  10/10 tokens
    t=0s  [*********_]   9/10 (1 request served)
    t=0s  [********__]   8/10 (2nd request)
    t=1s  [**********]  10/10 (refilled 2 tokens, capped at 10)
```

#### 唯一 ID 生成

| 方案 | 优点 | 缺点 | 适用场景 |
|----------|------|------|----------|
| **UUID** | 无需协调，简单 | 128 位（较大），不可排序 | ID 不需要短或有序 |
| **Auto-Increment** | 简单，可排序 | 单点故障，非分布式 | 单数据库，低规模 |
| **Snowflake ID** | 可排序，64 位，分布式 | 需要时钟同步 | 高规模分布式系统 |
| **TSID** | 类似 Snowflake 但更简单 | 同样的时钟依赖 | Snowflake 的现代替代方案 |
| **Zookeeper/etcd** | 强一致性 | 额外基础设施，速度较慢 | 需要强排序保证时 |

```
SNOWFLAKE ID STRUCTURE (64 bits)
=================================

+--+-------------------+----------+--------------+
|0 |   41 bits         | 10 bits  |  12 bits     |
|  |   Timestamp       | Machine  |  Sequence    |
|  |   (milliseconds)  | ID       |  Number      |
+--+-------------------+----------+--------------+
 |         |                |            |
 |         |                |            +-- 4096 IDs per ms per machine
 |         |                +-- 1024 machines
 |         +-- ~69 years from epoch
 +-- Sign bit (always 0)

Total: ~4 million unique IDs per second per machine
```

#### Consistent Hashing

```
CONSISTENT HASHING
==================

Traditional hashing problem:
  hash(key) % N   -->  When N changes, most keys remap!

Consistent hashing solution:
  Only K/N keys remap when a node is added/removed.

           Node A
            /\
           /  \
          /    \
    Node D      Node B
          \    /
           \  /
            \/
           Node C

Hash Ring:
    0 -------- Node A -------- Node B --------+
    |                                          |
    |                                          |
    +--- Node D -------- Node C ---------------+

    Key "user_123" hashes to position X on the ring.
    Walk clockwise to find the first node -> that node owns the key.

Virtual Nodes (solve hotspot problem):
    Each physical node maps to multiple virtual positions on the ring.

    Physical Node A  -->  A-1, A-2, A-3 (3 virtual nodes on ring)
    Physical Node B  -->  B-1, B-2, B-3

    0 -- A-1 -- B-2 -- A-3 -- B-1 -- A-2 -- B-3 --+
    |                                                |
    +------------------------------------------------+

    More virtual nodes = more uniform distribution.
    Typical: 100-200 virtual nodes per physical node.
```

### 讨论权衡取舍

对于每个设计决策，使用这个模板：

> **你：** 这里有一个权衡取舍。我们可以使用[方案 A]或[方案 B]。
>
> 方案 A 给我们[优势]，但缺点是[劣势]。
> 方案 B 给我们[优势]，但缺点是[劣势]。
>
> 根据我们[需求]的要求，我会选择[所选方案]，
> 因为[推理过程]。

**示例：**

> **你：** 对于缓存，我们可以使用 Cache-Aside 或 Write-Through。
>
> Cache-Aside 更简单，只缓存实际被读取的数据，但这意味着写入后的第一次读取会是缓存未命中。Write-Through 确保缓存始终同步，但它增加了写入延迟，并且会缓存可能永远不会被读取的数据。
>
> 鉴于我们的系统是读密集型的，读写比为 100:1，且我们可以容忍轻微的数据过时，我会选择 Cache-Aside。缓存会自然地被热门 URL 预热。

### 处理故障

始终至少讨论一个故障场景：

```
FAILURE SCENARIOS TO DISCUSS
=============================

1. Server crashes
   - Stateless services: Load balancer routes to healthy instances
   - Stateful services: Leader election, failover

2. Database failures
   - Primary down: Promote replica to primary
   - Replica down: Remove from read pool, remaining replicas handle load

3. Cache failures
   - Redis down: Fall back to database (increased latency)
   - Cache stampede: Use locking or request coalescing

4. Network partitions
   - Between services: Retry with exponential backoff, circuit breaker
   - Between data centers: CAP theorem applies

5. Data corruption
   - Checksums on stored data
   - Regular backup and verification
   - Point-in-time recovery

6. Cascading failures
   - Circuit breaker pattern
   - Bulkhead pattern (isolate resources)
   - Graceful degradation
```

### 常见错误

- **太广泛**而不是深入 1-2 个主题。
- **不讨论权衡取舍**——只是选择一个技术而不加以论证。
- **忽略故障模式**——真实系统随时都可能故障。
- **过度聚焦在一个你熟悉的技术上**，而不是解决实际的瓶颈。
- **不做量化分析**——用粗略估算来支撑你的决策。

---

## 第四步：总结

**时间预算：3-5 分钟**

这一步经常被匆忙跳过，但它是你展示成熟度的机会。

### 该做什么

1. **简要总结**设计。
2. **识别剩余的瓶颈**以及你将如何解决。
3. **讨论运维方面的关注点**（监控、告警、部署）。
4. **建议范围外的未来改进**。
5. **回答面试官的任何剩余问题。**

### 运维关注点清单

```
OPERATIONAL CHECKLIST
=====================

Monitoring & Observability:
  [ ] Metrics: latency (p50, p95, p99), throughput, error rate
  [ ] Logging: structured logs, correlation IDs, log aggregation
  [ ] Tracing: distributed tracing (Jaeger, Zipkin)
  [ ] Dashboards: real-time system health visualization
  [ ] Alerts: on-call rotation, escalation policies

Deployment:
  [ ] CI/CD pipeline
  [ ] Blue-green or canary deployments
  [ ] Feature flags for gradual rollout
  [ ] Rollback strategy

Security:
  [ ] Authentication and authorization
  [ ] Rate limiting per user/IP
  [ ] Input validation and sanitization
  [ ] Encryption at rest and in transit
  [ ] DDoS protection

Data Management:
  [ ] Backup strategy (frequency, retention)
  [ ] Disaster recovery plan (RPO, RTO)
  [ ] Data archival for old/cold data
  [ ] GDPR/compliance considerations
```

### 示例总结对话

> **你：** 让我总结一下我们设计了什么。我们构建了一个短链接服务，每天处理 1 亿个新 URL 和 10 亿次重定向。系统使用基于 Snowflake 的 ID 生成的写服务来创建短 URL，以及由 Redis 缓存支持的读服务来实现快速重定向。
>
> 如果我有更多时间，我会聚焦在：
>
> 1. **分析管道** —— 使用 Kafka 将点击事件流传输到数据仓库，实现实时分析。
> 2. **地理分布** —— 在多个区域部署读副本和缓存节点，以降低全球延迟。
> 3. **滥用防护** —— 在允许 URL 创建之前添加恶意软件和钓鱼扫描。
> 4. **监控** —— 设置仪表板监控重定向延迟、缓存命中率、数据库复制延迟和错误率。

### 常见错误

- **不做总结**——面试官可能已经跟丢了设计的脉络。
- **不提监控**——生产系统需要可观测性。
- **对设计选择持防御态度**，而不是承认权衡取舍。
- **没有准备好未来改进**——这展示了长期思维。

---

## 粗略估算

估算是一项关键技能。在设计系统之前，你会被要求估算容量需求。

### 2 的幂

| 幂次 | 精确值 | 近似值 | 常用名称 |
|------:|------------:|------------:|-------------|
| 10 | 1,024 | 1 千 | 1 KB |
| 20 | 1,048,576 | 1 百万 | 1 MB |
| 30 | 1,073,741,824 | 10 亿 | 1 GB |
| 40 | 1,099,511,627,776 | 1 万亿 | 1 TB |
| 50 | ~1.13 x 10^15 | 1 千万亿 | 1 PB |

### 常用换算捷径

```
1 day   = 86,400 seconds    ~ 10^5 seconds (use 100,000 for easy math)
1 month = 2,592,000 seconds ~ 2.5 x 10^6 seconds
1 year  = 31,536,000 seconds ~ 3 x 10^7 seconds

Quick QPS trick:
  If you have X requests per day:
  QPS = X / 100,000 (approximately)
  Peak QPS = QPS x 2 (or x 3 for spiky traffic)
```

### 每个程序员都应该知道的延迟数据

```
LATENCY COMPARISON
==================

Operation                              Time          Notes
---------------------------------------------------------------------
L1 cache reference                     0.5 ns
Branch mispredict                      5 ns
L2 cache reference                     7 ns
Mutex lock/unlock                      25 ns
Main memory reference                  100 ns        RAM access
Compress 1K bytes with Zippy           3,000 ns      3 us
Send 1 KB over 1 Gbps network         10,000 ns     10 us
Read 4 KB randomly from SSD            150,000 ns    150 us
Read 1 MB sequentially from memory     250,000 ns    250 us
Round trip within same datacenter      500,000 ns    500 us    0.5 ms
Read 1 MB sequentially from SSD        1,000,000 ns  1 ms
HDD disk seek                          10,000,000 ns 10 ms
Read 1 MB sequentially from HDD        20,000,000 ns 20 ms
Send packet CA -> Netherlands -> CA     150,000,000 ns 150 ms
TLS handshake                          250,000,000 ns 250 ms  (rough)

VISUAL SCALE:
=============

1 ns   |
10 ns  |=
100 ns |==========
1 us   |==========|
10 us  |==========|=
100 us |==========|==========
1 ms   |==========|==========|
10 ms  |==========|==========|==========
100 ms |==========|==========|==========|==========

KEY TAKEAWAYS:
- Memory is fast (~100 ns), disk is slow (~10 ms for HDD)
- SSD is 10-100x faster than HDD for random reads
- Network within a datacenter is ~0.5 ms
- Cross-continent round trip is ~150 ms
- Avoid disk seeks and network round trips in hot paths
```

### 常见 QPS 计算

```
QPS ESTIMATION TEMPLATE
========================

Given:
  DAU = Daily Active Users
  Actions per user per day = N
  Read:Write ratio = R:W

  Daily writes = DAU x N
  Write QPS = Daily writes / 86,400 (~100,000 for easy math)
  Peak Write QPS = Write QPS x 2 (or 3)
  Read QPS = Write QPS x R
  Peak Read QPS = Read QPS x 2 (or 3)


EXAMPLE: Twitter-like Service
==============================

Given:
  DAU = 300 million
  Average tweets per user per day = 2
  Read:Write = 100:1

  Daily writes = 300M x 2 = 600M tweets/day
  Write QPS = 600M / 100K = 6,000 QPS
  Peak Write QPS = 6,000 x 3 = 18,000 QPS
  Read QPS = 6,000 x 100 = 600,000 QPS
  Peak Read QPS = 600K x 3 = 1,800,000 QPS (1.8M)


EXAMPLE: URL Shortener
========================

Given:
  100 million new URLs per day
  Read:Write = 10:1

  Write QPS = 100M / 100K = 1,000 QPS
  Peak Write QPS = 1,000 x 2 = 2,000 QPS
  Read QPS = 1,000 x 10 = 10,000 QPS
  Peak Read QPS = 10,000 x 2 = 20,000 QPS
```

### 存储估算

```
STORAGE ESTIMATION TEMPLATE
============================

Step 1: Estimate average record size
  - Text fields: count characters x encoding size
  - IDs: 8 bytes (BIGINT) or 16 bytes (UUID)
  - Timestamps: 8 bytes
  - URLs: average 100-200 bytes
  - Overhead (indexes, metadata): +20-30%

Step 2: Calculate daily storage
  Daily storage = records_per_day x avg_record_size

Step 3: Project over time
  Yearly storage = daily_storage x 365
  5-year storage = yearly_storage x 5


EXAMPLE: URL Shortener
========================

Average URL record:
  short_code:  7 bytes
  long_url:    200 bytes (average)
  user_id:     8 bytes
  created_at:  8 bytes
  expires_at:  8 bytes
  click_count: 8 bytes
  --------------------------
  Total:       ~240 bytes
  With overhead: ~300 bytes

Daily: 100M x 300 bytes = 30 GB/day
Yearly: 30 GB x 365 = ~11 TB/year
5 years: 11 TB x 5 = ~55 TB

With replication (3x): 55 TB x 3 = ~165 TB
```

### 带宽估算

```
BANDWIDTH ESTIMATION TEMPLATE
===============================

Incoming bandwidth = Write QPS x average request size
Outgoing bandwidth = Read QPS x average response size


EXAMPLE: Image Hosting Service
================================

Write path:
  Write QPS = 100 requests/sec
  Average image = 500 KB
  Incoming = 100 x 500 KB = 50 MB/s

Read path:
  Read QPS = 10,000 requests/sec
  Average image = 500 KB
  Outgoing = 10,000 x 500 KB = 5 GB/s

  Note: This is why CDNs are essential for media-heavy services!


HANDY BANDWIDTH FACTS:
  1 Gbps = 125 MB/s
  10 Gbps = 1.25 GB/s
  A single server typically has 1-10 Gbps network
  A CDN can handle terabits per second across its edge nodes
```

### 服务器数量估算

```
SERVER ESTIMATION
==================

Assume:
  - A single application server handles ~10K-50K QPS (simple operations)
  - A single application server handles ~1K-5K QPS (complex operations)
  - Memory per server: 64-256 GB
  - Disk per server: 1-10 TB

  Number of servers = Peak QPS / QPS per server
  (Add buffer: multiply by 1.5-2x for redundancy)


EXAMPLE:
  Peak QPS = 100,000
  QPS per server = 10,000 (simple read operations)
  Servers needed = 100,000 / 10,000 = 10 servers
  With redundancy: 10 x 2 = 20 servers
```

---

## 常用构建模块

这些是你在几乎每个系统设计中都会用到的构建模块。要烂熟于心。

### Load Balancer

```
LOAD BALANCER PATTERNS
======================

Layer 4 (Transport Layer):
  Routes based on IP + port
  Fast, but no content awareness
  Cannot do URL-based routing

Layer 7 (Application Layer):
  Routes based on HTTP headers, URL, cookies
  Slower, but more flexible
  Can do SSL termination, content-based routing


                    LAYER 7 LOAD BALANCER
                    =====================

    +--------+      +--------------+      +-----------+
    |        | ---->|              | ---->| /api/*    |
    | Client |      | Load         |      | API Svr   |
    |        |      | Balancer     |      +-----------+
    +--------+      | (Nginx/ALB)  |
                    |              | ---->+-----------+
                    |              |      | /static/* |
                    +--------------+      | CDN/Static|
                                          +-----------+

LOAD BALANCING ALGORITHMS:

1. Round Robin
   Server 1 -> Server 2 -> Server 3 -> Server 1 -> ...
   Simple, works when servers are identical

2. Weighted Round Robin
   Server 1 (w=3) -> Server 1 -> Server 1 -> Server 2 (w=1) -> ...
   When servers have different capacities

3. Least Connections
   Route to server with fewest active connections
   Good for long-lived connections (WebSockets)

4. IP Hash
   hash(client_IP) % num_servers
   Ensures same client always hits same server (session affinity)

5. Consistent Hashing
   Used for cache servers
   Minimizes redistribution when servers are added/removed
```

### 数据库复制

```
PRIMARY-REPLICA REPLICATION
============================

Synchronous Replication:
  Primary waits for replica to acknowledge write before responding.
  + Strong consistency
  - Higher write latency
  - Write availability depends on replica health

         Write
    App ------> Primary
                  |
                  | sync replicate (wait for ACK)
                  |
                Replica 1 ---> ACK
                  |
    App <------ Primary (now responds to client)


Asynchronous Replication:
  Primary responds immediately, replicates in background.
  + Low write latency
  + Write availability not affected by replica health
  - Eventual consistency (replica lag)

         Write
    App ------> Primary ------> App (immediate response)
                  |
                  | async replicate (fire and forget)
                  |
                Replica 1 (may lag behind)


Semi-Synchronous:
  Wait for at least 1 replica to ACK, others are async.
  Good balance of consistency and performance.

    Primary --sync--> Replica 1 (must ACK)
       |
       +------async--> Replica 2 (best effort)
       +------async--> Replica 3 (best effort)
```

### 数据库分片

```
SHARDING STRATEGIES
===================

1. RANGE-BASED SHARDING
   Shard by ranges of the shard key.

   Shard 0: user_id 0 - 999,999
   Shard 1: user_id 1,000,000 - 1,999,999
   Shard 2: user_id 2,000,000 - 2,999,999

   + Simple to implement
   + Range queries within a shard are efficient
   - Can lead to hotspots (e.g., new users all go to last shard)
   - Uneven data distribution


2. HASH-BASED SHARDING
   shard_id = hash(shard_key) % num_shards

   + Even distribution
   + No hotspots (if hash is good)
   - Range queries require querying all shards (scatter-gather)
   - Adding/removing shards requires re-hashing (use consistent hashing)


3. DIRECTORY-BASED SHARDING
   A lookup service maps each key to its shard.

   +----------+      +-----------+      +---------+
   | App      | ---->| Directory | ---->| Shard N |
   | Server   |      | Service   |      |         |
   +----------+      +-----------+      +---------+

   + Flexible, can move data between shards
   + No constraints on shard key
   - Directory is a single point of failure
   - Additional network hop for every query


4. GEO-BASED SHARDING
   Shard by geographic region.

   Shard US: Users in North America
   Shard EU: Users in Europe
   Shard AP: Users in Asia-Pacific

   + Low latency for users (data is nearby)
   + Compliance with data residency laws
   - Cross-region queries are expensive
   - Uneven distribution (some regions have more users)


COMMON SHARD KEY SELECTION CRITERIA:
  - High cardinality (many unique values)
  - Even distribution across shards
  - Frequently used in queries (to avoid scatter-gather)
  - Immutable (changing shard key requires moving data)
```

### 缓存策略

```
CACHING STRATEGIES COMPARISON
==============================

+------------------+-------------------+------------------+-----------------+
| Strategy         | Best For          | Consistency      | Complexity      |
+------------------+-------------------+------------------+-----------------+
| Cache-Aside      | Read-heavy, data  | Eventual (TTL)   | Low             |
| (Lazy Loading)   | that changes      |                  |                 |
|                  | infrequently      |                  |                 |
+------------------+-------------------+------------------+-----------------+
| Read-Through     | Read-heavy, want  | Eventual (TTL)   | Medium          |
|                  | transparent cache |                  | (cache manages  |
|                  |                   |                  |  DB reads)      |
+------------------+-------------------+------------------+-----------------+
| Write-Through    | Data that must    | Strong           | Medium          |
|                  | be consistent     | (sync writes)    |                 |
+------------------+-------------------+------------------+-----------------+
| Write-Behind     | Write-heavy       | Eventual         | High            |
| (Write-Back)     | workloads         | (async writes)   | (data loss risk)|
+------------------+-------------------+------------------+-----------------+
| Refresh-Ahead    | Predictable       | Strong-ish       | High            |
|                  | access patterns   | (proactive)      |                 |
+------------------+-------------------+------------------+-----------------+


CACHE EVICTION POLICIES:

  LRU (Least Recently Used)
    Evict the item that was accessed longest ago.
    Most commonly used. Good general-purpose policy.

  LFU (Least Frequently Used)
    Evict the item that was accessed least often.
    Good for stable access patterns. Slow to adapt to changes.

  FIFO (First In, First Out)
    Evict the oldest item regardless of access.
    Simple but often suboptimal.

  TTL (Time To Live)
    Items expire after a set duration.
    Often combined with LRU. Essential for consistency.


CACHE PROBLEMS AND SOLUTIONS:

  Cache Stampede (Thundering Herd):
    Problem: Popular key expires, 1000 requests all hit DB simultaneously.
    Solutions:
      - Mutex/lock: Only 1 request fetches from DB, others wait
      - Stale-while-revalidate: Serve stale data while refreshing
      - Probabilistic early expiration: Refresh before TTL expires

  Cache Penetration:
    Problem: Queries for data that does not exist bypass cache every time.
    Solutions:
      - Cache negative results (with short TTL)
      - Bloom filter: Check if key could exist before querying DB

  Hot Key:
    Problem: One key receives disproportionate traffic.
    Solutions:
      - Local cache on application servers (L1 cache)
      - Replicate hot key across multiple cache nodes
      - Add random suffix to split across shards
```

### 消息队列

```
MESSAGE QUEUE PATTERNS
======================

POINT-TO-POINT (Work Queue):
  Each message consumed by exactly one consumer.

    Producer --> [ Queue ] --> Consumer 1
                           --> Consumer 2 (load balanced)
                           --> Consumer 3

    Use case: Task distribution, job processing


PUBLISH-SUBSCRIBE (Pub/Sub):
  Each message delivered to all subscribers.

    Producer --> [ Topic ] --> Subscriber 1 (gets all messages)
                           --> Subscriber 2 (gets all messages)
                           --> Subscriber 3 (gets all messages)

    Use case: Event broadcasting, notifications


WHEN TO USE A MESSAGE QUEUE:

  +------------------------------------------+-----------------------------+
  | Scenario                                 | Why Queue Helps             |
  +------------------------------------------+-----------------------------+
  | Producer is faster than consumer         | Buffer / absorb spikes      |
  | Consumer processing is slow/unreliable   | Retry, dead letter queue    |
  | Decouple services                        | Services evolve independently|
  | Need guaranteed delivery                 | Persistence + acknowledgment|
  | Fan-out to multiple consumers            | One write, many reads       |
  | Order matters                            | FIFO queues, partitioning   |
  +------------------------------------------+-----------------------------+


POPULAR MESSAGE QUEUE COMPARISON:

  +-------------+------------------+------------------+------------------+
  | Feature     | Kafka            | RabbitMQ         | SQS (AWS)        |
  +-------------+------------------+------------------+------------------+
  | Model       | Pub/Sub + Log    | Pub/Sub + Queue  | Queue            |
  | Throughput  | Millions/sec     | Thousands/sec    | Thousands/sec    |
  | Ordering    | Per partition    | Per queue        | Best effort/FIFO |
  | Persistence | Disk (append)    | Memory + disk    | Managed          |
  | Replay      | Yes (offset)     | No               | No               |
  | Use Case    | Event streaming  | Task routing     | Simple decoupling|
  +-------------+------------------+------------------+------------------+


KAFKA ARCHITECTURE:
                                        +------------------+
                                        |   Partition 0    |
    +----------+     +--------+    +--->| [m1][m2][m3][m4] |
    | Producer | --> | Topic  | ---+    +------------------+
    +----------+     | "orders"|   |    +------------------+
                     +--------+    +--->|   Partition 1    |
                                   |    | [m5][m6][m7]     |
                                   |    +------------------+
                                   |    +------------------+
                                   +--->|   Partition 2    |
                                        | [m8][m9]         |
                                        +------------------+

    Consumer Group A:   Consumer 1 reads P0, Consumer 2 reads P1+P2
    Consumer Group B:   Consumer 3 reads P0+P1+P2 (independent)
```

### CDN（内容分发网络）

```
CDN ARCHITECTURE
================

Without CDN:
    User (Tokyo) ------- 150ms -------> Origin (US East)
    (Every request crosses the ocean)

With CDN:
    User (Tokyo) --- 5ms ---> Edge (Tokyo) --- cache hit ---> Response
                               |
                               | cache miss (rare)
                               |
                               +------- 150ms -------> Origin (US East)


PUSH CDN vs PULL CDN:

  Push CDN:
    You upload content to CDN proactively.
    + Content available immediately
    + You control what is cached
    - More operational overhead
    - May push content that is never accessed

  Pull CDN:
    CDN fetches from origin on first request, then caches.
    + Zero operational overhead
    + Only caches what is actually requested
    - First request is slow (cache miss)
    - Need to handle TTL and invalidation


CDN INVALIDATION:
  1. TTL-based: Content expires after set time
  2. Purge API: Explicitly invalidate specific URLs
  3. Versioned URLs: /style.v2.css (never invalidate, just change URL)
  4. Stale-while-revalidate: Serve stale, refresh in background
```

### Bloom Filter

```
BLOOM FILTER
=============

A space-efficient probabilistic data structure.
Answers: "Is this element in the set?"

  Possible answers:
    "Definitely NOT in the set"  (100% accurate)
    "PROBABLY in the set"        (may have false positives)

  NO false negatives. May have false positives.


How it works:
  Bit array of size m, with k hash functions.

  INSERT "apple":
    h1("apple") = 3  --> set bit 3
    h2("apple") = 7  --> set bit 7
    h3("apple") = 11 --> set bit 11

    Bit array: [0 0 0 1 0 0 0 1 0 0 0 1 0 0 0]
                       ^           ^           ^

  LOOKUP "banana":
    h1("banana") = 3  --> bit 3 is 1 (set by apple)
    h2("banana") = 5  --> bit 5 is 0 --> DEFINITELY NOT in set


USE CASES:
  - Cache penetration prevention (check before hitting DB)
  - Email spam detection
  - Avoiding recommending already-seen content
  - Web crawler: checking if URL was already visited

  Space: ~10 bits per element for 1% false positive rate
  Example: 1 billion elements -> ~1.2 GB (vs 10+ GB for a hash set)
```

---

## CAP 定理

### 三个保证

```
CAP THEOREM
============

In a distributed system, you can only guarantee 2 of 3 properties:

              Consistency (C)
                  /\
                 /  \
                /    \
               / CP   \
              / systems \
             /    CA     \
            / (impossible \
           /  in practice) \
          /________________\
    Availability (A) ---- Partition
                          Tolerance (P)
                     AP
                   systems

C = Consistency
    Every read receives the most recent write or an error.
    All nodes see the same data at the same time.

A = Availability
    Every request receives a (non-error) response,
    without guarantee that it contains the most recent write.

P = Partition Tolerance
    System continues to operate despite network partitions
    (messages between nodes being dropped or delayed).
```

### 为什么必须选择 P

在任何真实的分布式系统中，网络分区**一定会**发生。你无法避免它们。因此，你实际上是在以下两者之间做选择：

- **CP**（一致性 + 分区容错性）：当分区发生时，系统可能拒绝请求以维持一致性。返回错误而不是过时的数据。

- **AP**（可用性 + 分区容错性）：当分区发生时，系统继续处理请求，但数据可能是过时或不一致的。

**CA**（一致性 + 可用性）仅在没有网络分区时才可能，这意味着是单节点系统。根本不是分布式系统。

### 实际示例

```
CP SYSTEMS (Consistency over Availability):
  - Banking/financial transactions
  - Inventory management (prevent overselling)
  - Leader election (Zookeeper, etcd)
  - Configuration management

  Technologies: HBase, MongoDB (default), Redis Cluster, Zookeeper, etcd

  Trade-off: During a partition, some requests will fail or timeout.
  Users may see: "Service temporarily unavailable. Please try again."


AP SYSTEMS (Availability over Consistency):
  - Social media feeds
  - Product catalog browsing
  - DNS
  - Shopping cart (eventually consistent)

  Technologies: Cassandra, DynamoDB, CouchDB, Riak

  Trade-off: During a partition, users may see stale data.
  Users may see: Slightly outdated follower count, old product price.


NEITHER STRICTLY CP NOR AP:
  Most real systems are tunable and exist on a spectrum.
  - Cassandra: Tunable consistency (ONE, QUORUM, ALL)
  - DynamoDB: Eventual or strong consistency per read
  - MongoDB: Read concern and write concern are configurable
```

### PACELC 定理（CAP 的扩展）

```
PACELC THEOREM
===============

If there is a Partition (P):
  Choose Availability (A) or Consistency (C)
Else (E) when system is running normally:
  Choose Latency (L) or Consistency (C)

This is more practical because partitions are rare.
Most of the time, the trade-off is between latency and consistency.

+-------------+-------------------+-------------------+
| System      | During Partition  | Normal Operation  |
+-------------+-------------------+-------------------+
| DynamoDB    | AP (available)    | EL (low latency)  |
| Cassandra   | AP (available)    | EL (low latency)  |
| MongoDB     | CP (consistent)   | EC (consistent)   |
| HBase       | CP (consistent)   | EC (consistent)   |
| MySQL (InnoDB) | CP (consistent)| EC (consistent)   |
+-------------+-------------------+-------------------+
```

### 一致性模型

```
CONSISTENCY SPECTRUM
=====================

Strong Consistency                              Eventual Consistency
|<------------------------------------------------------------>|
|                                                              |
| Linearizable  Sequential  Causal    Read-your  Eventual     |
|                                     -writes                 |
| (Strongest)                                    (Weakest)    |

Linearizable:
  All operations appear to occur in a single, global order.
  Every read sees the most recent write.
  Equivalent to having a single copy of the data.
  Example: Zookeeper, etcd

Sequential Consistency:
  Operations appear in a total order that is consistent with
  the order seen by each individual process.
  Example: Some database isolation levels

Causal Consistency:
  Causally related operations are seen in the same order by all.
  Concurrent operations may be seen in different orders.
  Example: Some distributed databases

Read-Your-Writes:
  A user always sees their own writes.
  Others may see stale data.
  Example: Social media (see your own post immediately)

Eventual Consistency:
  If no new writes, all replicas will eventually converge.
  No guarantees on when.
  Example: DNS, Cassandra with consistency level ONE
```

---

## 数据库选型指南

### 决策框架

```
DATABASE SELECTION FLOWCHART
=============================

START: What are your data requirements?
  |
  +---> Structured data with relationships?
  |     |
  |     +---> YES: Need ACID transactions?
  |     |     |
  |     |     +---> YES: Need horizontal scale?
  |     |     |     |
  |     |     |     +---> YES: CockroachDB, Google Spanner, TiDB
  |     |     |     +---> NO:  PostgreSQL, MySQL
  |     |     |
  |     |     +---> NO: Read-heavy?
  |     |           |
  |     |           +---> YES: PostgreSQL + read replicas
  |     |           +---> NO:  MySQL, PostgreSQL
  |     |
  |     +---> NO: What type of data?
  |           |
  |           +---> Key-Value?      --> Redis, DynamoDB, Memcached
  |           +---> Document?       --> MongoDB, Couchbase
  |           +---> Wide-Column?    --> Cassandra, HBase, ScyllaDB
  |           +---> Graph?          --> Neo4j, Amazon Neptune
  |           +---> Time-Series?    --> InfluxDB, TimescaleDB
  |           +---> Search/Text?    --> Elasticsearch, OpenSearch
  |           +---> Blob/Object?    --> S3, GCS, Azure Blob
```

### SQL 与 NoSQL 对比

```
+-------------------+---------------------------+---------------------------+
| Criteria          | SQL (Relational)          | NoSQL                     |
+-------------------+---------------------------+---------------------------+
| Data Model        | Tables with rows/columns  | Document, KV, Wide-Col,  |
|                   | Fixed schema              | Graph (flexible schema)   |
+-------------------+---------------------------+---------------------------+
| Schema            | Rigid, predefined         | Flexible, schema-on-read  |
+-------------------+---------------------------+---------------------------+
| Relationships     | JOINs across tables       | Denormalized, embedded    |
+-------------------+---------------------------+---------------------------+
| Transactions      | Full ACID                 | Limited (some offer ACID) |
+-------------------+---------------------------+---------------------------+
| Scaling           | Vertical (scale up)       | Horizontal (scale out)    |
|                   | Read replicas for reads   | Native sharding           |
+-------------------+---------------------------+---------------------------+
| Query Language    | SQL (standardized)        | Varies by database        |
+-------------------+---------------------------+---------------------------+
| Consistency       | Strong by default         | Tunable, often eventual   |
+-------------------+---------------------------+---------------------------+
| Best For          | Complex queries, JOINs,   | High write throughput,    |
|                   | ACID transactions,        | flexible schema, massive  |
|                   | data integrity             | scale, low latency        |
+-------------------+---------------------------+---------------------------+
```

### 何时使用什么

| 使用场景 | 推荐数据库 | 理由 |
|----------|---------------|-----------|
| **用户账户、订单、支付** | PostgreSQL, MySQL | ACID 事务，关系型数据 |
| **产品目录** | MongoDB, PostgreSQL | 灵活的 Schema，多样化属性 |
| **Session 存储** | Redis | 快速读取，自动过期（TTL） |
| **排行榜、计数器** | Redis | 原子递增，Sorted Set |
| **社交图谱** | Neo4j, Amazon Neptune | 图遍历查询，关系密集型 |
| **聊天消息** | Cassandra | 高写入吞吐量，按时间排序 |
| **分析、日志** | ClickHouse, Elasticsearch | 列式存储，快速聚合 |
| **时序指标** | InfluxDB, TimescaleDB | 针对时序数据优化 |
| **全文搜索** | Elasticsearch, OpenSearch | 倒排索引，相关性评分 |
| **文件/媒体存储** | S3, GCS | Blob 存储，CDN 集成 |
| **购物车** | DynamoDB, Redis | 键值访问，高可用 |
| **新闻流、时间线** | Redis（缓存）+ Cassandra（存储） | 快速读取，写密集型 |
| **配置管理** | etcd, Consul | 强一致性，分布式 |
| **地理空间查询** | PostGIS, MongoDB | 内置地理索引 |

### 你应该知道的数据库内部原理

```
B-TREE vs LSM TREE
===================

B-Tree (PostgreSQL, MySQL InnoDB):
  - Balanced tree structure
  - Optimized for reads
  - In-place updates
  - Good for read-heavy workloads
  - Write amplification on updates

  Read:  O(log n)
  Write: O(log n) + random I/O

LSM Tree (Cassandra, RocksDB, LevelDB):
  - Log-Structured Merge Tree
  - Optimized for writes
  - Append-only writes to memory (memtable)
  - Background compaction merges sorted files
  - Good for write-heavy workloads

  Read:  O(log n) + potential multi-file lookup
  Write: O(1) amortized (sequential I/O)

  Write Path:
  +----------+     +-----------+     +--------+     +--------+
  | Write    | --> | MemTable  | --> | SSTable | --> | SSTable |
  | (append) |     | (in-mem)  |     | Level 0|     | Level 1|
  +----------+     +-----------+     +--------+     +--------+
                        |                     \       /
                        | flush               compaction
                        v                       |
                   +-----------+          +--------+
                   | WAL       |          | SSTable |
                   | (durability)         | Level 2 |
                   +-----------+          +--------+
```

---

## 通信协议

### 协议对比

```
+---------------+-------------+-----------+-------------+--------------+
| Feature       | HTTP/REST   | WebSocket | SSE         | gRPC         |
+---------------+-------------+-----------+-------------+--------------+
| Direction     | Request-    | Full      | Server to   | Bidirectional|
|               | Response    | Duplex    | Client      | streaming    |
+---------------+-------------+-----------+-------------+--------------+
| Connection    | Short-lived | Persistent| Persistent  | Persistent   |
|               | (per req)   |           |             | (HTTP/2)     |
+---------------+-------------+-----------+-------------+--------------+
| Protocol      | HTTP/1.1    | WS over   | HTTP/1.1    | HTTP/2       |
|               | or HTTP/2   | TCP       |             |              |
+---------------+-------------+-----------+-------------+--------------+
| Encoding      | JSON, XML   | Any       | Text        | Protobuf     |
|               |             |           | (event      | (binary)     |
|               |             |           |  stream)    |              |
+---------------+-------------+-----------+-------------+--------------+
| Browser       | Yes         | Yes       | Yes         | Via proxy    |
| Support       |             |           |             | (grpc-web)   |
+---------------+-------------+-----------+-------------+--------------+
| Overhead      | Medium      | Low (no   | Low         | Very Low     |
|               | (headers)   |  headers  |             | (binary)     |
|               |             |  per msg) |             |              |
+---------------+-------------+-----------+-------------+--------------+
| Reconnection  | Built-in    | Manual    | Built-in    | Manual       |
|               | (new req)   |           | (auto)      |              |
+---------------+-------------+-----------+-------------+--------------+
| Scalability   | Easy (LB)   | Harder    | Easy (LB)   | Easy (LB)    |
|               |             | (sticky)  |             |              |
+---------------+-------------+-----------+-------------+--------------+
```

### 何时使用什么

```
HTTP/REST:
  - Standard CRUD operations (create, read, update, delete)
  - Public APIs consumed by many different clients
  - Simple request-response patterns
  - When cacheability matters (GET requests)
  Examples: User profile API, product catalog, search


WebSocket:
  - Real-time bidirectional communication
  - Low-latency messaging
  - When both client and server need to push data
  Examples: Chat applications, multiplayer games, collaborative editing,
            live trading platforms


Server-Sent Events (SSE):
  - Server pushes updates to client
  - Client does not need to send data after initial connection
  - Simpler than WebSocket for one-way streaming
  Examples: Live score updates, stock tickers, notification streams,
            progress updates for long-running operations


gRPC:
  - Internal service-to-service communication
  - High-performance, low-latency requirements
  - Strongly typed contracts between services
  - Streaming (both server-streaming and bidirectional)
  Examples: Microservice communication, ML model serving,
            real-time data pipelines


Long Polling (legacy approach):
  - Client sends request, server holds it open until data available
  - Simpler than WebSocket but less efficient
  - Use when WebSocket/SSE are not supported
  Examples: Legacy systems, simple notification checks
```

### 协议深入探讨

```
WEBSOCKET CONNECTION LIFECYCLE
===============================

    Client                              Server
    |                                   |
    |  --- HTTP Upgrade Request ----->  |
    |  GET / HTTP/1.1                   |
    |  Upgrade: websocket               |
    |  Connection: Upgrade              |
    |                                   |
    |  <-- 101 Switching Protocols ---  |
    |                                   |
    |  ====== WebSocket Frames ======>  |
    |  <===== WebSocket Frames =======  |
    |  ====== WebSocket Frames ======>  |
    |                                   |
    |  --- Close Frame ------------->   |
    |  <-- Close Frame Ack ----------   |
    |                                   |


SCALING WEBSOCKET CONNECTIONS:

  Problem: WebSocket connections are persistent and stateful.
  A load balancer cannot simply route each message independently.

  Solution 1: Sticky Sessions
    Load balancer routes all traffic from a client to the same server.
    - Simple but limits scaling flexibility
    - Server failure disconnects all its clients

  Solution 2: Pub/Sub Backend (Redis, Kafka)
    +--------+     +---------+     +--------+
    | WS Srv |<--->|  Redis  |<--->| WS Srv |
    |   1    |     | Pub/Sub |     |   2    |
    +---+----+     +---------+     +---+----+
        |                              |
    Clients                        Clients
    A, B, C                        D, E, F

    When User A sends a message to User D:
    1. WS Server 1 receives message from A
    2. WS Server 1 publishes to Redis channel
    3. Redis delivers to WS Server 2
    4. WS Server 2 sends to User D


SSE vs WEBSOCKET DECISION:
==============================

  Need bidirectional? ---YES---> WebSocket
         |
         NO
         |
  Need server push only? ---YES---> SSE
         |
         NO
         |
  Standard request-response? ---YES---> HTTP/REST
```

---

## 评分标准

### 面试官实际评估什么

```
SYSTEM DESIGN SCORING RUBRIC
==============================

1. PROBLEM EXPLORATION (15%)
   +-----------+------------------------------------------------+
   | Strong    | Asks insightful clarifying questions. Identifies|
   |           | ambiguities. Defines clear scope and priorities.|
   +-----------+------------------------------------------------+
   | Adequate  | Asks basic questions. Mostly understands scope. |
   +-----------+------------------------------------------------+
   | Weak      | Jumps to solution. Makes assumptions without    |
   |           | confirming. Misunderstands the problem.         |
   +-----------+------------------------------------------------+

2. HIGH-LEVEL DESIGN (25%)
   +-----------+------------------------------------------------+
   | Strong    | Clean architecture. Sensible API and data model.|
   |           | Walks through key flows clearly. Gets buy-in.   |
   +-----------+------------------------------------------------+
   | Adequate  | Reasonable architecture. Some gaps in API or    |
   |           | data model. Covers main flow.                   |
   +-----------+------------------------------------------------+
   | Weak      | Unstructured diagram. Missing core components.  |
   |           | Cannot walk through a use case end-to-end.      |
   +-----------+------------------------------------------------+

3. DETAILED DESIGN (30%)
   +-----------+------------------------------------------------+
   | Strong    | Deep expertise in 2-3 areas. Quantifies with   |
   |           | math. Discusses alternatives and trade-offs.    |
   |           | Handles edge cases and failure modes.           |
   +-----------+------------------------------------------------+
   | Adequate  | Good depth in 1 area. Some trade-off discussion.|
   |           | Mentions scaling but without detailed plan.     |
   +-----------+------------------------------------------------+
   | Weak      | Surface-level on all topics. No trade-offs.     |
   |           | Cannot explain why a technology was chosen.     |
   +-----------+------------------------------------------------+

4. COMMUNICATION & COLLABORATION (20%)
   +-----------+------------------------------------------------+
   | Strong    | Drives the conversation. Structures thought     |
   |           | process clearly. Responds well to hints.        |
   |           | Explains complex ideas simply.                  |
   +-----------+------------------------------------------------+
   | Adequate  | Communicates ideas but needs prompting.         |
   |           | Sometimes jumps between topics.                 |
   +-----------+------------------------------------------------+
   | Weak      | Unclear explanations. Ignores interviewer cues. |
   |           | Cannot articulate reasoning.                    |
   +-----------+------------------------------------------------+

5. KNOWLEDGE BREADTH & DEPTH (10%)
   +-----------+------------------------------------------------+
   | Strong    | Demonstrates knowledge of distributed systems,  |
   |           | databases, caching, networking. Knows when to  |
   |           | use what and why.                               |
   +-----------+------------------------------------------------+
   | Adequate  | Knows common patterns. Some gaps but generally  |
   |           | reasonable choices.                             |
   +-----------+------------------------------------------------+
   | Weak      | Significant gaps in fundamental concepts.       |
   |           | Choices do not match requirements.              |
   +-----------+------------------------------------------------+
```

### 让候选人扣分的危险信号

```
INSTANT RED FLAGS
==================

1. Not asking any clarifying questions
   "Let me just start designing..."
   --> Shows you do not scope problems before solving them

2. Over-engineering immediately
   "First we need Kubernetes with 50 microservices..."
   --> Shows you cannot start simple and iterate

3. Naming technologies without understanding them
   "We will use Kafka" / "Why?" / "Because everyone uses it"
   --> Shows you follow trends without understanding trade-offs

4. Ignoring the interviewer's hints
   Interviewer: "What about the write path?"
   You: *continues talking about reads*
   --> Shows poor collaboration and listening skills

5. No quantitative reasoning
   "We need a lot of servers"
   --> Shows you cannot estimate or reason about scale

6. Single-point-of-failure ignorance
   Drawing a single database with no replication or backup plan
   --> Shows you have not worked with production systems

7. Not discussing trade-offs
   "We will use NoSQL because it scales"
   --> Shows binary thinking instead of nuanced reasoning

8. Cannot handle follow-up questions
   "I am not sure" (repeatedly) without attempting to reason through
   --> Shows you give up instead of reasoning from first principles
```

### 让面试官印象深刻的加分信号

```
WHAT MAKES CANDIDATES STAND OUT
=================================

1. Structured approach
   "Let me break this into four parts..."
   --> Shows organized thinking

2. Quantitative reasoning
   "At 10K QPS, we need approximately 3 servers assuming
    each handles 4K QPS..."
   --> Shows practical estimation skills

3. Trade-off awareness
   "We could use SQL or NoSQL here. SQL gives us ACID
    transactions which we need for payments, but NoSQL
    would scale writes more easily. Given that payment
    consistency is critical, I would choose PostgreSQL."
   --> Shows nuanced decision-making

4. Failure mode awareness
   "What happens if this cache node goes down? We need
    a fallback to the database, and we should implement
    a circuit breaker to prevent cascade failures."
   --> Shows production experience

5. Iterative design
   "Let me start with the simplest design that works,
    then we can add complexity where needed."
   --> Shows practical engineering judgment

6. Responsive to feedback
   Interviewer: "What about consistency here?"
   You: "Great point. Let me reconsider..."
   --> Shows collaboration and intellectual humility

7. Domain awareness
   "In a payment system, we need idempotency keys
    because network retries can cause duplicate charges."
   --> Shows real-world experience

8. Clear communication
   "Let me summarize where we are before diving deeper..."
   --> Shows ability to manage complexity and communicate clearly
```

---

## 快速参考清单

### 面试前准备清单

```
BEFORE THE INTERVIEW
=====================

[ ] Review the 4-step framework
[ ] Practice back-of-envelope estimation (do 5 examples)
[ ] Know all common building blocks by heart
[ ] Practice drawing diagrams quickly (whiteboard or virtual)
[ ] Prepare 2-3 deep dive topics you can speak about for 10 minutes
[ ] Review CAP theorem and when to choose CP vs AP
[ ] Know SQL vs NoSQL decision criteria
[ ] Practice timing: 5 + 15 + 15 + 5 = 40 minutes
[ ] Have a shorthand for common components (LB, DB, Cache, MQ)
```

### 面试中清单

```
DURING STEP 1 (Requirements):
  [ ] Restated the problem
  [ ] Asked about functional requirements (features)
  [ ] Asked about non-functional requirements (scale, latency, availability)
  [ ] Confirmed read/write ratio
  [ ] Defined what is in and out of scope
  [ ] Wrote requirements on the board

DURING STEP 2 (High-Level Design):
  [ ] Defined API endpoints
  [ ] Defined data model / schema
  [ ] Drew high-level architecture diagram
  [ ] Walked through at least one key flow end-to-end
  [ ] Got buy-in from interviewer before proceeding

DURING STEP 3 (Deep Dive):
  [ ] Identified 2-3 most interesting/challenging components
  [ ] Discussed scaling strategy with quantitative reasoning
  [ ] Mentioned caching strategy and eviction policy
  [ ] Addressed at least one failure scenario
  [ ] Discussed trade-offs for major design decisions
  [ ] Used back-of-envelope math to support decisions

DURING STEP 4 (Wrap Up):
  [ ] Summarized the design
  [ ] Mentioned monitoring and observability
  [ ] Suggested 2-3 future improvements
  [ ] Answered remaining interviewer questions
```

### 常见系统设计题目

```
FREQUENTLY ASKED SYSTEM DESIGN QUESTIONS
==========================================

BEGINNER LEVEL:
  [ ] URL Shortener (bit.ly)
  [ ] Paste Bin
  [ ] Rate Limiter
  [ ] Key-Value Store
  [ ] Unique ID Generator

INTERMEDIATE LEVEL:
  [ ] Design Twitter / News Feed
  [ ] Design Instagram / Photo Sharing
  [ ] Design Chat System (WhatsApp/Slack)
  [ ] Design Web Crawler
  [ ] Design Notification System
  [ ] Design Search Autocomplete
  [ ] Design YouTube / Video Streaming

ADVANCED LEVEL:
  [ ] Design Google Maps / Proximity Service
  [ ] Design Distributed Cache (Memcached/Redis)
  [ ] Design Distributed Message Queue (Kafka)
  [ ] Design Stock Exchange / Trading System
  [ ] Design Google Docs / Collaborative Editing
  [ ] Design Payment System (Stripe)
  [ ] Design Ad Click Aggregation
  [ ] Design Hotel Reservation System
  [ ] Design Distributed File System (GFS/HDFS)
  [ ] Design S3-like Object Storage

FOR EACH QUESTION, KNOW:
  - What clarifying questions to ask
  - Core entities and relationships
  - Read vs write patterns
  - Key scaling challenges
  - Which building blocks to use
  - 2-3 deep dive topics specific to that system
```

### 估算快速参考卡

```
QUICK ESTIMATION REFERENCE
============================

TIME:
  1 day    ~ 100K seconds
  1 month  ~ 2.5M seconds
  1 year   ~ 30M seconds

SCALE:
  1 Million     = 10^6  = 1M
  1 Billion     = 10^9  = 1B
  1 Trillion    = 10^12 = 1T

DATA SIZES:
  1 char (ASCII)  = 1 byte
  1 char (UTF-8)  = 1-4 bytes
  UUID             = 16 bytes (128 bits)
  Long/BigInt      = 8 bytes (64 bits)
  Timestamp        = 8 bytes
  Average URL      = 100-200 bytes
  Average tweet    = 300 bytes (with metadata)
  Average email    = 50 KB
  Average photo    = 500 KB - 2 MB
  Average video    = 50 MB (1 min, compressed)

DAILY ACTIVE USERS (DAU) for reference:
  Small app        = 10K - 100K
  Medium app       = 1M - 10M
  Large app        = 50M - 100M
  Massive (FB)     = 2B+

QPS QUICK MATH:
  DAU x actions/user/day / 100,000 = average QPS
  Peak = average x 2-3

STORAGE QUICK MATH:
  records/day x bytes/record x 365 = yearly storage
  Add 3x for replication

BANDWIDTH QUICK MATH:
  QPS x response_size = bandwidth
  1 Gbps = 125 MB/s
```

### ASCII 图表模板

这些是常见架构的可复用模板。练习在面试中快速画出它们。

```
TEMPLATE 1: BASIC WEB APPLICATION
===================================

    +--------+     +-------+     +----------+     +---------+
    | Client | --> |  CDN  | --> |   Load   | --> |   App   |
    +--------+     +-------+     | Balancer |     | Servers |
                                 +----------+     +----+----+
                                                       |
                                               +-------+-------+
                                               |               |
                                          +----+----+    +-----+-----+
                                          |  Cache  |    | Database  |
                                          | (Redis) |    | (Primary) |
                                          +---------+    +-----+-----+
                                                               |
                                                         +-----+-----+
                                                         | Replicas  |
                                                         +-----------+


TEMPLATE 2: MICROSERVICES WITH MESSAGE QUEUE
=============================================

    +--------+     +----------+     +------------+
    | Client | --> |   API    | --> | Service A  |
    +--------+     | Gateway  |     +------+-----+
                   +----------+            |
                        |            +-----+------+
                        |            | Message    |
                        |            | Queue      |
                        |            +-----+------+
                        |                  |
                   +----+-----+      +-----+------+
                   | Service B|      | Service C  |
                   +----+-----+      +-----+------+
                        |                  |
                   +----+-----+      +-----+------+
                   | DB (SQL) |      | DB (NoSQL) |
                   +----------+      +------------+


TEMPLATE 3: READ-HEAVY SYSTEM WITH CACHING LAYERS
===================================================

    +--------+
    | Client |
    +---+----+
        |
    +---+----+
    |  CDN   |  <-- Static assets, cached responses
    +---+----+
        |
    +---+-------+
    |    Load   |
    |  Balancer |
    +---+-------+
        |
    +---+----+
    | App    |
    | Server |
    +---+----+
        |
    +---+-------+
    | L1 Cache  |  <-- Local/in-process cache (e.g., Caffeine)
    | (App Mem) |
    +---+-------+
        |
    +---+-------+
    | L2 Cache  |  <-- Distributed cache (e.g., Redis)
    | (Redis)   |
    +---+-------+
        |
    +---+-------+
    | Database  |  <-- Only reached on double cache miss
    | (with     |
    |  replicas)|
    +-----------+


TEMPLATE 4: EVENT-DRIVEN ARCHITECTURE
=======================================

    +----------+     +---------+     +----------+
    | Producer | --> |  Event  | --> | Consumer |
    | Service  |     |  Store  |     | Group A  |
    +----------+     | (Kafka) |     +----------+
                     |         |
    +----------+     |         |     +----------+
    | Producer | --> |         | --> | Consumer |
    | Service  |     |         |     | Group B  |
    +----------+     +---------+     +----------+
                                          |
                                     +----+-----+
                                     | Analytics|
                                     | DB       |
                                     +----------+


TEMPLATE 5: GLOBAL MULTI-REGION DEPLOYMENT
============================================

                  +-------------------+
                  |   Global DNS /    |
                  |   GeoDNS / GSLB   |
                  +--------+----------+
                           |
            +--------------+---------------+
            |                              |
    +-------+-------+            +--------+--------+
    | US Region     |            | EU Region       |
    |               |            |                 |
    | +---+  +---+  |            | +---+  +---+   |
    | |App|  |App|  |            | |App|  |App|   |
    | +---+  +---+  |            | +---+  +---+   |
    |               |            |                 |
    | +---+  +---+  |  async     | +---+  +---+   |
    | |DB |->|DB |--+--repl.---->| |DB |->|DB |   |
    | |Pri|  |Rep|  |            | |Pri|  |Rep|   |
    | +---+  +---+  |            | +---+  +---+   |
    |               |            |                 |
    | +--------+    |            | +--------+      |
    | | Cache  |    |            | | Cache  |      |
    | +--------+    |            | +--------+      |
    +---------------+            +-----------------+
```

---

## 附录 A：系统设计模式速查表

### 针对特定问题的模式

```
PATTERN QUICK REFERENCE
=========================

Problem: Too many reads
  --> Add caching (Redis/Memcached)
  --> Add read replicas
  --> Add CDN for static content
  --> Denormalize data

Problem: Too many writes
  --> Async writes via message queue
  --> Write-behind cache
  --> Database sharding
  --> Use LSM-tree based DB (Cassandra)

Problem: Large files/media
  --> Object storage (S3)
  --> CDN for delivery
  --> Chunked upload/download
  --> Transcoding pipeline (for video)

Problem: Search functionality
  --> Elasticsearch/OpenSearch
  --> Inverted index
  --> Trie for autocomplete

Problem: Real-time updates
  --> WebSocket for bidirectional
  --> SSE for server push
  --> Long polling as fallback

Problem: Distributed coordination
  --> Zookeeper/etcd for leader election
  --> Distributed locks
  --> Consensus algorithms (Raft, Paxos)

Problem: Hotspots
  --> Consistent hashing with virtual nodes
  --> Rate limiting
  --> Request coalescing
  --> L1 cache for hot keys

Problem: Data consistency across services
  --> Saga pattern (choreography or orchestration)
  --> Two-phase commit (2PC) for strong consistency
  --> Outbox pattern for reliable event publishing
  --> CQRS for read/write separation

Problem: Idempotency
  --> Idempotency keys on write requests
  --> Deduplication table
  --> At-least-once delivery + idempotent processing

Problem: Global scale
  --> Multi-region deployment
  --> Geo-DNS / GSLB routing
  --> Regional data partitioning
  --> Conflict-free replicated data types (CRDTs)
```

### Saga 模式

```
SAGA PATTERN (Distributed Transactions)
=========================================

When a business transaction spans multiple services and you cannot
use a traditional distributed transaction (2PC):

CHOREOGRAPHY SAGA (event-driven):

  Order         Payment        Inventory       Shipping
  Service       Service        Service         Service
    |               |              |               |
    |--OrderCreated-->             |               |
    |               |--PaymentOK-->|               |
    |               |              |--Reserved---->|
    |               |              |               |--Shipped-->
    |               |              |               |
    | If failure at any step, compensating events are published:
    |               |              |               |
    |               |<--ReserveFail-|              |
    |               |--PaymentRefund-->            |
    |<--OrderCancelled|            |               |


ORCHESTRATION SAGA (central coordinator):

                 +-------------+
                 | Saga        |
                 | Orchestrator|
                 +------+------+
                        |
          +-------------+-------------+
          |             |             |
    +-----+---+   +----+----+  +-----+----+
    | Order   |   | Payment |  | Inventory|
    | Service |   | Service |  | Service  |
    +---------+   +---------+  +----------+

    Orchestrator controls the sequence:
    1. Create order
    2. Process payment
    3. Reserve inventory
    4. If any step fails, run compensating actions in reverse
```

### CQRS 模式

```
CQRS (Command Query Responsibility Segregation)
=================================================

Separate the read model from the write model.

Traditional:
    +--------+     +----------+     +---------+
    | Client | --> | Service  | --> | Single  |
    |        | <-- |          | <-- | Database|
    +--------+     +----------+     +---------+

CQRS:
    +--------+     +----------+     +---------+
    | Client | --> | Command  | --> | Write   |
    | (Write)|     | Service  |     | Database|
    +--------+     +----------+     +---------+
                                         |
                                    Event / CDC
                                         |
                                         v
    +--------+     +----------+     +---------+
    | Client | --> | Query    | --> | Read    |
    | (Read) |     | Service  |     | Database|
    +--------+     +----------+     +---------+

    Write DB: Optimized for writes (normalized, ACID)
    Read DB:  Optimized for reads (denormalized, materialized views)

    Use when:
    - Read and write patterns are very different
    - Need to scale reads and writes independently
    - Complex queries that do not fit the write model
```

---

## 附录 B：技术参考

### 快速技术查询

```
LOAD BALANCERS:
  Hardware:  F5, Citrix
  Software:  Nginx, HAProxy, Envoy
  Cloud:     AWS ALB/NLB, GCP Cloud LB, Azure LB

CACHES:
  In-process: Caffeine (Java), node-cache (Node.js)
  Distributed: Redis, Memcached
  CDN: CloudFront, Cloudflare, Akamai, Fastly

DATABASES:
  Relational:   PostgreSQL, MySQL, CockroachDB, Spanner
  Document:     MongoDB, Couchbase, DynamoDB
  Wide-Column:  Cassandra, HBase, ScyllaDB
  Key-Value:    Redis, DynamoDB, etcd
  Graph:        Neo4j, Amazon Neptune
  Time-Series:  InfluxDB, TimescaleDB
  Search:       Elasticsearch, OpenSearch
  Analytics:    ClickHouse, BigQuery, Redshift, Snowflake

MESSAGE QUEUES:
  Kafka, RabbitMQ, Amazon SQS/SNS, Google Pub/Sub, NATS

OBJECT STORAGE:
  Amazon S3, Google Cloud Storage, Azure Blob Storage, MinIO

COORDINATION:
  Zookeeper, etcd, Consul

MONITORING:
  Prometheus + Grafana, Datadog, New Relic, PagerDuty (alerting)

TRACING:
  Jaeger, Zipkin, AWS X-Ray, Honeycomb

API GATEWAY:
  Kong, AWS API Gateway, Apigee, Nginx
```

---

## 附录 C：带提示的练习题

使用这些作为自学材料。对于每道题，练习完整的四步框架。

### 题目 1：设计一个 Rate Limiter

```
Key Questions:
  - Client-side or server-side?
  - What is the rate limit (requests per second/minute)?
  - Per user, per IP, or per API key?
  - Distributed (multiple servers) or single server?

Key Concepts:
  - Token Bucket algorithm (most common)
  - Sliding Window Log
  - Sliding Window Counter
  - Fixed Window Counter
  - Redis for distributed rate limiting

Deep Dive Areas:
  - How to handle distributed rate limiting across multiple servers
  - Race conditions in token bucket with Redis
  - HTTP 429 response and Retry-After header
  - Rate limit headers (X-RateLimit-Remaining, X-RateLimit-Reset)
```

### 题目 2：设计一个聊天系统

```
Key Questions:
  - 1:1 chat, group chat, or both?
  - Maximum group size?
  - Online/offline indicator?
  - Message persistence? How long?
  - Media support (images, files)?
  - Read receipts? Typing indicators?

Key Concepts:
  - WebSocket for real-time messaging
  - Message queue for guaranteed delivery
  - Presence service (online/offline status)
  - Push notifications for offline users

Deep Dive Areas:
  - How to handle message ordering in distributed system
  - Group chat fan-out (small groups vs large channels)
  - Offline message storage and delivery
  - End-to-end encryption
  - Schema: messages, conversations, participants tables
```

### 题目 3：设计新闻流

```
Key Questions:
  - How many friends/followers per user?
  - What content types (text, images, video)?
  - How is the feed ranked (chronological, algorithmic)?
  - How often is the feed refreshed?

Key Concepts:
  - Fan-out on write vs fan-out on read
  - Celebrity problem (users with millions of followers)
  - Feed ranking algorithm
  - Pre-computed feeds in cache

Deep Dive Areas:
  - Fan-out on write: Pre-compute feed for each user
    + Fast reads
    - Slow writes for celebrities
    - Wasted computation for inactive users
  - Fan-out on read: Compute feed on request
    + No wasted computation
    - Slow reads
  - Hybrid: Fan-out on write for normal users,
    fan-out on read for celebrities
```

### 题目 4：设计通知系统

```
Key Questions:
  - What channels (push, email, SMS, in-app)?
  - Real-time or can be delayed?
  - Can users set preferences (opt-out, quiet hours)?
  - How many notifications per day?

Key Concepts:
  - Message queue for decoupling and reliability
  - Template system for notification content
  - Rate limiting (do not spam users)
  - Preference service

Deep Dive Areas:
  - Exactly-once delivery guarantee
  - Priority queue (urgent vs non-urgent)
  - Analytics (delivery rate, open rate, click rate)
  - Third-party integration (APNs, FCM, Twilio, SendGrid)

Architecture:
  +----------+     +---------+     +-----------+     +--------+
  | Event    | --> | Notif   | --> | Priority  | --> | Worker |
  | Source   |     | Service |     | Queue     |     | Pool   |
  +----------+     +---------+     +-----------+     +---+----+
                        |                                |
                   +----+-----+              +-----------+-----------+
                   | User     |              |           |           |
                   | Prefs DB |          +---+---+  +---+---+  +---+---+
                   +----------+          | Push  |  | Email |  | SMS   |
                                         | (APNs |  |(Send- |  |(Twil- |
                                         |  FCM) |  | Grid) |  |  io)  |
                                         +-------+  +-------+  +-------+
```

---

## 结语

系统设计面试考察的是你有条理地思考复杂问题的能力。没有唯一正确的答案。面试官关心的是：

1. **你如何思考**，而不是你记住了什么。
2. **你如何沟通**，而不是你画得多快。
3. **你如何做权衡取舍**，而不是你能说出多少技术名称。
4. **你如何处理模糊性**，而不是你对每个细节了解得多完美。

练习四步框架直到它成为第二天性。练习估算直到你能快速完成。练习画图直到它们清晰可读。最重要的是，练习大声解释你的推理过程。

祝你好运。
