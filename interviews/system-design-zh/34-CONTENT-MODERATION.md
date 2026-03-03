# 设计内容审核系统 (Facebook / YouTube / TikTok)

## 目录

1. [需求澄清](#需求澄清)
2. [API 设计](#api-设计)
3. [数据模型](#数据模型)
4. [高层架构](#高层架构)
5. [深入探讨：内容审核流水线](#深入探讨内容审核流水线)
6. [深入探讨：内容类型与挑战](#深入探讨内容类型与挑战)
7. [深入探讨：ML Classification Models](#深入探讨ml-classification-models)
8. [深入探讨：Confidence Tiers 与决策逻辑](#深入探讨confidence-tiers-与决策逻辑)
9. [深入探讨：Hash-Based Matching](#深入探讨hash-based-matching)
10. [深入探讨：人工审核队列](#深入探讨人工审核队列)
11. [深入探讨：Policy Engine](#深入探讨policy-engine)
12. [深入探讨：用户举报系统](#深入探讨用户举报系统)
13. [深入探讨：申诉工作流](#深入探讨申诉工作流)
14. [深入探讨：实时直播审核](#深入探讨实时直播审核)
15. [深入探讨：滥用模式检测](#深入探讨滥用模式检测)
16. [深入探讨：LLM 驱动的审核](#深入探讨llm-驱动的审核)
17. [深入探讨：透明度与审核员身心健康](#深入探讨透明度与审核员身心健康)
18. [扩展策略](#扩展策略)
19. [权衡取舍](#权衡取舍)
20. [常见面试追问](#常见面试追问)

---

## 需求澄清

### 需要澄清的问题

- 我们需要审核哪些内容类型？（文本、图片、视频、音频、直播）
- 我们是做发布前筛查、发布后被动审核，还是两者兼有？
- 哪些违规类别在范围内？（CSAM、仇恨言论、暴力、垃圾信息、虚假信息）
- 法律/管辖区要求是什么？（GDPR、COPPA、DSA、当地法律）
- 有多少人工审核员可用，分布在哪些时区？
- 我们是否需要支持申诉？如果需要，有多少层级？
- 可接受的误报率是多少？（错误删除合法内容）
- 我们是否需要支持直播审核？

### 功能需求

| # | 需求 | 描述 |
|---|------|------|
| 1 | 发布前筛查 | 在内容公开可见之前自动筛查 |
| 2 | ML Classification | 通过文本、图片、视频和音频分类器处理内容 |
| 3 | Hash-Based Matching | 与已知违规内容数据库匹配（PhotoDNA、pHash） |
| 4 | 人工审核队列 | 将边界内容路由到人工审核员并进行优先级排序 |
| 5 | Policy Engine | 应用基于规则和 ML 混合的策略，支持策略版本管理 |
| 6 | 用户举报 | 允许用户按类别举报内容；对举报质量进行评分 |
| 7 | 内容处置 | 删除、降低分发、添加标签/警告、年龄限制、取消变现 |
| 8 | 申诉工作流 | 用户可以对决定提出申诉；多层级升级到策略委员会 |
| 9 | 直播审核 | 通过延迟缓冲和紧急停播能力监控直播 |
| 10 | 滥用模式检测 | 检测协同虚假行为、垃圾信息网络、封禁规避 |
| 11 | 透明度报告 | 导出删除统计、误报率、申诉结果 |
| 12 | LLM 驱动的决策 | 使用大语言模型进行细微的、依赖上下文的策略判定 |

### 非功能需求

| # | 需求 | 目标 |
|---|------|------|
| 1 | 发布前筛查延迟 | < 30 秒端到端 |
| 2 | ML 推理延迟 | < 500ms 每项内容 |
| 3 | Hash matching 延迟 | < 100ms |
| 4 | 可用性 | 99.99%（< 1 小时停机/年） |
| 5 | 误报率 | < 1%（合法内容被错误删除） |
| 6 | 人工审核 SLA（标准） | 24 小时 |
| 7 | 人工审核 SLA（紧急） | 1 小时 |
| 8 | 吞吐量 | 5 亿帖子/天筛查 |
| 9 | 举报处理 | 1000 万用户举报/天 |
| 10 | Hash 数据库大小 | 10 亿条存储的内容 hash |
| 11 | 审核员容量 | 全球 5 万名人工审核员 |
| 12 | 自动处置准确率 | 在自动删除阈值下精确率 > 99% |

### 规模估算

```
内容量：
  帖子/天：                5 亿帖子/天
  峰值 QPS（10 倍平均）：   ~58,000 帖子/秒 平均 = 580,000 峰值
  内容大小分布：
    纯文本：               60% = 3 亿/天
    图片帖子：             30% = 1.5 亿/天
    视频帖子：              8% = 4000 万/天
    音频帖子：              2% = 1000 万/天

用户举报：
  举报/天：                1000 万举报/天
  举报/秒（平均）：         ~116/秒
  需要审核的举报：          ~20% = 200 万/天

Hash matching：
  Hash DB 大小：           10 亿条 hash
  Hash 查询时间：          < 100ms（Redis bloom filter + 精确匹配）
  Hash 存储：              10 亿 x 32 字节（SHA-256）= 32GB（可放入 RAM 集群）

ML 推理：
  Text classifier：       3 亿项 x 200ms 平均 = 6000 万 CPU-core-seconds/天
  Image classifier：      1.5 亿项 x 500ms 平均 = 7500 万 GPU-seconds/天
  Video classifier：      4000 万项 x 5,000ms 平均 = 2 亿 GPU-seconds/天
  GPU 需求：               仅视频就需要 ~2,300 个 A100 等效（峰值）

人工审核：
  审核员：                 全球 50,000 名（3 班制，24/7 覆盖）
  审核/审核员/小时：        文本 ~200，视频 ~80
  日处理能力：              5 万 x 8 小时 x 150 平均 = 6000 万次审核/天
  队列目标：               将 ~1-3% 的内容路由到人工 = 500-1500 万/天

存储：
  内容元数据：              5 亿 x 2KB = 1TB/天
  ML 评分：                5 亿 x 500 字节 = 250GB/天
  审计日志：               5 亿 x 1KB = 500GB/天
  Hash 索引：              10 亿 x 64 字节 = 64GB（含元数据）
  申诉数据：               ~50 万申诉/天 x 5KB = 2.5GB/天

带宽：
  视频摄入：               4000 万视频/天 x 50MB 平均 = 2PB/天摄入
  帧采样（1fps）：          4000 万 x 60 帧平均 x 100KB/帧 = 240TB/天
```

---

## API 设计

### 内容提交与审核

```
POST /v1/content/submit
Content-Type: application/json

Request:
{
  "content_id": "cnt_abc123",
  "creator_id": "usr_xyz789",
  "content_type": "image",           // text | image | video | audio | live_stream
  "payload": {
    "text_body": "Check out this photo!",
    "media_url": "gs://raw-uploads/cnt_abc123/image.jpg",
    "media_hash_sha256": "d4e8f2a1..."
  },
  "metadata": {
    "platform": "mobile_ios",
    "ip_address": "203.0.113.42",
    "device_fingerprint": "fp_...",
    "geo_country": "US",
    "audience_setting": "public"      // public | friends | private
  },
  "publishing_target": "feed"        // feed | story | reel | comment | live
}

Response 200:
{
  "moderation_job_id": "mod_job_001",
  "status": "pending_review",        // approved | rejected | pending_review
  "estimated_review_time_seconds": 18,
  "content_id": "cnt_abc123"
}
```

```
GET /v1/moderation/status/{content_id}

Response 200:
{
  "content_id": "cnt_abc123",
  "moderation_job_id": "mod_job_001",
  "status": "approved",
  "ml_scores": {
    "toxicity": 0.02,
    "nsfw_explicit": 0.01,
    "violence": 0.03,
    "spam": 0.04,
    "overall_safe_confidence": 0.97
  },
  "hash_match": false,
  "action_taken": "approve",
  "reviewed_at": "2026-03-01T10:00:05Z",
  "review_type": "automated"         // automated | human
}
```

### 用户举报

```
POST /v1/reports
Content-Type: application/json

Request:
{
  "reporter_id": "usr_reporter1",
  "content_id": "cnt_abc123",
  "creator_id": "usr_xyz789",
  "report_category": "hate_speech",  // hate_speech | violence | nudity | spam | misinformation | harassment | csam | other
  "sub_category": "racial_slurs",
  "description": "This post contains racial slurs targeting...",
  "evidence_timestamps": [12, 45],   // 视频：违规发生的秒数
  "context_url": "https://platform.com/post/cnt_abc123"
}

Response 201:
{
  "report_id": "rpt_001",
  "status": "received",
  "estimated_review_hours": 24,
  "tracking_url": "https://platform.com/reports/rpt_001"
}
```

### 申诉

```
POST /v1/appeals
Content-Type: application/json

Request:
{
  "appellant_id": "usr_xyz789",
  "content_id": "cnt_abc123",
  "original_action": "remove",
  "appeal_reason": "context_misunderstood",
  "appeal_statement": "This image is educational content about...",
  "supporting_evidence_urls": ["https://..."],
  "desired_outcome": "reinstate_with_label"
}

Response 201:
{
  "appeal_id": "apl_001",
  "status": "submitted",
  "tier": 1,
  "estimated_resolution_hours": 72,
  "case_number": "CASE-2026-001234"
}
```

### 管理员策略管理

```
POST /v1/policies
Content-Type: application/json

Request:
{
  "policy_name": "hate_speech_v3",
  "version": "3.1.0",
  "content_types": ["text", "image"],
  "rules": [
    {
      "rule_id": "hs_slur_list",
      "type": "keyword_match",
      "action": "auto_reject",
      "priority": 100,
      "config": {
        "word_list_id": "slurs_global_v7",
        "match_mode": "exact_and_variants"
      }
    },
    {
      "rule_id": "hs_ml_threshold",
      "type": "ml_score",
      "classifier": "hate_speech_bert_v2",
      "action": "human_review",
      "threshold": 0.65,
      "priority": 50
    }
  ],
  "effective_date": "2026-04-01T00:00:00Z",
  "ab_test_config": {
    "enabled": true,
    "rollout_percentage": 10,
    "control_policy": "hate_speech_v2"
  }
}
```

### Hash 提交（信任与安全工具）

```
POST /v1/hashes/submit
Content-Type: application/json

Request:
{
  "hash_type": "phash",              // phash | sha256 | photodna | video_fingerprint
  "hash_value": "f8e0c0808080c0e0",
  "content_category": "csam",       // csam | terrorism | copyright
  "source": "ncmec",                // ncmec | interpol | internal | partner
  "severity": "critical",
  "metadata": {
    "reported_date": "2026-01-15",
    "jurisdiction": "global"
  }
}
```

---

## 数据模型

### 内容表

```sql
CREATE TABLE content (
  content_id        VARCHAR(36)   PRIMARY KEY,
  creator_id        VARCHAR(36)   NOT NULL,
  content_type      VARCHAR(20)   NOT NULL,        -- text | image | video | audio | live_stream
  publishing_target VARCHAR(20)   NOT NULL,
  text_body         TEXT,
  media_url         TEXT,
  media_hash_sha256 VARCHAR(64),
  geo_country       CHAR(2),
  audience_setting  VARCHAR(20)   NOT NULL,
  platform          VARCHAR(30),
  ip_address        INET,
  device_fingerprint VARCHAR(128),
  status            VARCHAR(30)   NOT NULL DEFAULT 'pending',
                                               -- pending | approved | rejected | under_review | appealing
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  published_at      TIMESTAMPTZ,
  removed_at        TIMESTAMPTZ,
  INDEX idx_creator (creator_id, created_at),
  INDEX idx_status (status, created_at)
);
```

### 审核任务表

```sql
CREATE TABLE moderation_jobs (
  job_id            VARCHAR(36)   PRIMARY KEY,
  content_id        VARCHAR(36)   NOT NULL REFERENCES content(content_id),
  job_type          VARCHAR(20)   NOT NULL,        -- pre_publish | reactive | re_review
  status            VARCHAR(20)   NOT NULL DEFAULT 'queued',
                                               -- queued | processing | complete | failed
  priority          INT           NOT NULL DEFAULT 50,  -- 0（最高）到 100（最低）
  hash_match        BOOLEAN       NOT NULL DEFAULT FALSE,
  hash_match_detail JSONB,
  ml_scores         JSONB,                         -- {toxicity: 0.02, nsfw: 0.01, ...}
  ml_decision       VARCHAR(20),                   -- auto_approve | auto_reject | human_review
  final_decision    VARCHAR(20),                   -- approve | reject | label | age_gate | demonetize | reduce_distribution
  final_action_reason TEXT,
  reviewed_by       VARCHAR(36),                   -- 如果是自动审核则为 NULL
  review_type       VARCHAR(20)   DEFAULT 'automated', -- automated | human
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  completed_at      TIMESTAMPTZ,
  processing_time_ms INT,
  INDEX idx_content (content_id),
  INDEX idx_status_priority (status, priority, created_at)
);
```

### 人工审核队列表

```sql
CREATE TABLE review_queue (
  queue_id          VARCHAR(36)   PRIMARY KEY,
  job_id            VARCHAR(36)   NOT NULL REFERENCES moderation_jobs(job_id),
  content_id        VARCHAR(36)   NOT NULL,
  priority_score    FLOAT         NOT NULL,        -- 计算方式：严重性 x 传播范围 x 紧急度
  violation_category VARCHAR(50)  NOT NULL,
  assigned_reviewer VARCHAR(36),
  assignment_time   TIMESTAMPTZ,
  sla_deadline      TIMESTAMPTZ   NOT NULL,
  status            VARCHAR(20)   NOT NULL DEFAULT 'unassigned',
                                               -- unassigned | assigned | in_review | complete | escalated
  escalated_to      VARCHAR(36),
  region            CHAR(2),                       -- 路由到区域审核员
  language          CHAR(5),                       -- 路由到具备语言能力的审核员
  sensitive_flag    BOOLEAN       NOT NULL DEFAULT FALSE, -- 需要高级审核员
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  INDEX idx_priority (status, priority_score DESC, created_at),
  INDEX idx_reviewer (assigned_reviewer, status),
  INDEX idx_sla (sla_deadline, status)
);
```

### 内容 Hash 表

```sql
CREATE TABLE content_hashes (
  hash_id           VARCHAR(36)   PRIMARY KEY,
  hash_type         VARCHAR(20)   NOT NULL,        -- phash | sha256 | photodna | video_fingerprint
  hash_value        VARCHAR(256)  NOT NULL,
  content_category  VARCHAR(30)   NOT NULL,        -- csam | terrorism | copyright
  severity          VARCHAR(20)   NOT NULL,        -- critical | high | medium | low
  source            VARCHAR(30)   NOT NULL,
  added_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  is_active         BOOLEAN       NOT NULL DEFAULT TRUE,
  match_count       BIGINT        NOT NULL DEFAULT 0,
  UNIQUE INDEX idx_hash (hash_type, hash_value)
);
```

### 举报表

```sql
CREATE TABLE reports (
  report_id         VARCHAR(36)   PRIMARY KEY,
  reporter_id       VARCHAR(36)   NOT NULL,
  content_id        VARCHAR(36)   NOT NULL,
  creator_id        VARCHAR(36)   NOT NULL,
  report_category   VARCHAR(50)   NOT NULL,
  sub_category      VARCHAR(50),
  description       TEXT,
  evidence_data     JSONB,
  status            VARCHAR(20)   NOT NULL DEFAULT 'received',
                                               -- received | triaged | under_review | resolved | dismissed
  resolution        VARCHAR(30),               -- action_taken | no_violation | duplicate
  action_taken      VARCHAR(30),
  reporter_quality_score FLOAT,               -- 跟踪举报准确率
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  resolved_at       TIMESTAMPTZ,
  INDEX idx_content (content_id, created_at),
  INDEX idx_reporter (reporter_id, created_at),
  INDEX idx_status (status, created_at)
);
```

### 申诉表

```sql
CREATE TABLE appeals (
  appeal_id         VARCHAR(36)   PRIMARY KEY,
  appellant_id      VARCHAR(36)   NOT NULL,
  content_id        VARCHAR(36)   NOT NULL,
  original_job_id   VARCHAR(36)   NOT NULL REFERENCES moderation_jobs(job_id),
  original_action   VARCHAR(30)   NOT NULL,
  appeal_reason     VARCHAR(50)   NOT NULL,
  appeal_statement  TEXT,
  evidence_urls     TEXT[],
  tier              INT           NOT NULL DEFAULT 1,   -- 1 | 2 | 3（策略委员会）
  status            VARCHAR(20)   NOT NULL DEFAULT 'submitted',
                                               -- submitted | under_review | resolved | escalated
  outcome           VARCHAR(30),               -- upheld | overturned | modified | escalated
  reviewer_id       VARCHAR(36),
  resolution_notes  TEXT,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  resolved_at       TIMESTAMPTZ,
  INDEX idx_appellant (appellant_id, created_at),
  INDEX idx_content (content_id),
  INDEX idx_tier_status (tier, status, created_at)
);
```

### 策略表

```sql
CREATE TABLE policies (
  policy_id         VARCHAR(36)   PRIMARY KEY,
  policy_name       VARCHAR(100)  NOT NULL,
  version           VARCHAR(20)   NOT NULL,
  content_types     TEXT[]        NOT NULL,
  rules             JSONB         NOT NULL,
  status            VARCHAR(20)   NOT NULL DEFAULT 'draft',
                                               -- draft | testing | active | deprecated
  ab_test_config    JSONB,
  rollout_pct       INT           NOT NULL DEFAULT 0,
  effective_date    TIMESTAMPTZ,
  deprecated_at     TIMESTAMPTZ,
  created_by        VARCHAR(36)   NOT NULL,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  UNIQUE INDEX idx_name_version (policy_name, version)
);
```

---

## 高层架构

```
+------------------+     +------------------+     +------------------+
|   移动端/Web      |     |   上传服务        |     |   CDN / 存储      |
|   客户端          +---->+   （预筛查         +---->+   （S3 / GCS）    |
|                  |     |    触发器）        |     |                  |
+------------------+     +--------+---------+     +------------------+
                                  |
                    +-------------v--------------+
                    |      API Gateway / LB       |
                    +-------------+--------------+
                                  |
          +-----------+-----------+-----------+-----------+
          |           |           |           |           |
          v           v           v           v           v
  +-------+--+  +----+-----+  +--+------+  +-+--------+  +----------+
  | 内容     |  | 举报     |  | Hash   |  | Policy  |  | 申诉     |
  | 提交     |  | 服务     |  | 匹配    |  | Engine  |  | 服务     |
  | 服务     |  |          |  | 服务    |  |          |  |          |
  +----+-----+  +----+-----+  +--+------+  +-+--------+  +----+-----+
       |              |          |            |                |
       v              v          v            v                v
  +----+---------------------------------------------+--------+-----+
  |                     Kafka Event Bus                              |
  | Topics: content.submitted, report.created, hash.matched,        |
  |         decision.made, appeal.filed, policy.updated             |
  +--+-------------------+------------------+-------------------+---+
     |                   |                  |                   |
     v                   v                  v                   v
+----+------+   +--------+-------+  +-------+------+  +--------+-----+
| ML        |   | Hash Matching  |  | 人工审核     |  | Action       |
| Pipeline  |   | 服务           |  | 队列         |  | Executor     |
| Orchestr. |   | (Redis Bloom + |  | 服务         |  | 服务         |
|           |   |  Exact DB)     |  |              |  |              |
+----+------+   +----------------+  +-------+------+  +------+-------+
     |                                      |                 |
     v                                      v                 v
+----+------+   +----------------+  +-------+------+  +------+-------+
| Text      |   | Image          |  | 审核员       |  | Content DB   |
| Classifier|   | Classifier     |  | 仪表板       |  | (PostgreSQL) |
| (BERT/    |   | (ResNet/CLIP)  |  | （分配       |  |              |
|  Persp.)  |   |                |  |  + 工具）    |  +------+-------+
+----+------+   +----+-----------+  +--------------+         |
     |               |                                        v
     v               v                               +--------+-----+
+----+---------------+---+                           | 审计日志      |
| Video/Audio            |                           | (ClickHouse) |
| Classifier             |                           |              |
| (Frame Sample +        |                           +--------------+
|  Audio Transcribe)     |
+------------------------+
```

---

## 深入探讨：内容审核流水线

审核流水线是系统的核心。每一条内容在发布或拒绝之前都会经过多个阶段的处理。

```
内容已提交
      |
      v
+-----+--------+     发现匹配
| Hash-Based   +-----------------------------> 自动拒绝（CSAM/恐怖主义）
| Matching     |                               + 执法机构报告
+-----+--------+
      | 无匹配
      v
+-----+--------+
| Policy 规则  +----> 黑名单关键词？ -----> 自动拒绝
| 预过滤       |
+-----+--------+
      |
      v
+-----+---------------+
| ML Classification   |
|                     |
|  Text Classifier    |
|  Image Classifier   |
|  Video Classifier   |
|  Audio Classifier   |
+-----+---------------+
      |
      v
+-----+--------------------------------------------+
|          Confidence Tier 路由                     |
|                                                   |
|  Safe Score > 0.95   -----> 自动通过               |
|                                                   |
|  Violation Score > 0.99 --> 自动拒绝               |
|                                                   |
|  灰色地带 (0.05-0.95) --> 人工审核队列             |
+---------------------------------------------------+
      |                           |
      v                           v
+-----+-------+           +-------+------+
| Action      |           | 人工审核     |
| Executor    |           | 队列         |
| - 通过      |           | - 优先级     |
| - 拒绝      |           |   评分       |
| - 标签      |           | - 分配       |
| - 年龄限制  |           | - 决定       |
| - 取消变现  |           | - 审计       |
+-----+-------+           +-------+------+
      |                           |
      v                           v
+-----+---------------------------+------+
|              结果                      |
|  - 通知创作者                          |
|  - 更新内容状态                        |
|  - 执行 Feed 层处置                    |
|  - 发出审计事件                        |
|  - 更新举报人（如果由举报触发）          |
+----------------------------------------+
```

### 流水线阶段详情

**阶段 1：摄入与预筛查**
- 在任何处理之前，内容被写入原始对象存储（S3/GCS）
- 立即分配唯一的 `content_id`
- 上传服务将 `content.submitted` 事件发布到 Kafka
- 内容保持"待审"状态 --- 尚未对其他用户可见

**阶段 2：Hash Matching（< 100ms）**
- 并行查找：
  - SHA-256 精确匹配（已知违规文件）
  - pHash（用于近似重复图片的感知 hash）
  - PhotoDNA（Microsoft CSAM 数据库）
  - Video fingerprints（TMKL / Video DNA）
- CSAM 的 hash 匹配触发自动拒绝 + NCMEC 报告
- 恐怖主义的 hash 匹配触发拒绝 + 转介至 GIFCT 数据库

**阶段 3：ML Classification（< 500ms 每个分类器）**
- 分类器针对适用的内容类型并行运行
- 每个分类器返回每个违规类别的置信度分数 [0.0 - 1.0]
- 结果汇总为综合安全评分

**阶段 4：Policy Engine 评估**
- 在 ML 评分基础上应用策略规则
- 规则可以覆盖 ML（例如，区域法律要求）
- 结果：自动通过、自动拒绝或路由到人工审核

**阶段 5：处置执行**
- 处置原子化执行：状态更新 + 通知 + 分发变更
- 所有处置记录在不可变的审计日志中

---

## 深入探讨：内容类型与挑战

不同的内容类型需要根本不同的审核方法：

### 文本内容（3 亿/天 --- 60%）

```
挑战：
- 上下文依赖性（讽刺、戏仿、暗语）
- 多语言支持（100+ 种语言）
- 隐语和不断演变的俚语
- 由看似无害的单个帖子组成的协同攻击

方法：
- 毒性评分（Perspective API / 微调 BERT）
- 命名实体识别（定向骚扰检测）
- 语义相似度（用同义词规避关键词过滤）
- 跨帖关联（多个账户发送相同文本 = 垃圾信息）
- LLM 进行细微的上下文分析（GPT-4 / Claude 用于灰色地带）
```

### 图片内容（1.5 亿/天 --- 30%）

```
挑战：
- NSFW 光谱（艺术 vs. 色情 vs. CSAM）
- 无文本的上下文（图片含义取决于标题/帖子串）
- 对抗性扰动（轻微修改图片以规避 hash）
- 表情包和截图（图片中的文本绕过文本过滤器）

方法：
- ResNet/EfficientNet 用于 NSFW 分类
- CLIP 用于语义图像理解（图像 + 文本联合）
- OCR 提取并分类嵌入文本
- pHash 用于近似重复检测
- PhotoDNA 用于 CSAM 匹配（在许多司法管辖区法律要求）
- 物体检测用于武器、符号（例如纳粹图像）
```

### 视频内容（4000 万/天 --- 8%）

```
挑战：
- 无法大规模处理每一帧
- 音频轨道可能包含独立于视频的违规内容
- 缩略图可能无害但内容有害
- 时间上下文（视频中的内容含义随时间变化）

方法：
- 初始筛查以 1 FPS 帧采样
- 关键帧提取（场景变化检测）
- 音频轨道提取 + 语音转文本 + 文本分类
- Video fingerprinting（TMKL）用于已知违规视频匹配
- 缩略图分类器（独立运行，始终执行）
- 仅对高嫌疑项进行逐帧全面分析
```

### 音频内容（1000 万/天 --- 2%）

```
挑战：
- 歌曲/播客中的仇恨言论
- 音频消息中的语音骚扰
- AI 生成语音的滥用

方法：
- Whisper / 语音转文本转录
- 转录文本送入文本分类器
- 多说话人音频的���话人分离
- 音频指纹用于已知违法内容
```

### 直播（实时）

```
挑战：
- 无法预筛查（内容是实时的）
- 延迟缓冲是唯一的干预点
- 不能承受高误报率（干扰直播观众）
- 直播过程中不断演变的违规行为

方法：
- 30-60 秒延迟缓冲允许被动审核
- 直播期间持续帧采样
- 实时音频转录
- CSAM 或暴力评分超过阈值时的自动停播开关
- 对高风险直播（预标记账户）分配人工审核员
- 观众举报按钮，具有即时升级路径
```

---

## 深入探讨：ML Classification Models

### 文本毒性模型

```
架构：微调 BERT / RoBERTa（非英语使用多语言 mBERT）
输出：[toxicity, hate_speech, threats, harassment, sexual_explicit, spam] 的分数

训练数据：
  - CivilComments 数据集
  - 来自人工审核员的内部标注数据
  - 低资源语言的合成数据增强

服务：
  - ONNX Runtime 用于优化 CPU 推理
  - GPU 推理用于批量处理
  - 延迟目标：< 50ms 处理 512-token 文本

Perspective API 集成：
  - Google 的 Perspective API 作为后备 / 集成成员
  - 在内部数据不足时用于启动引导
  - API 调用：POST https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze
  - 返回：{toxicity: 0.85, severeToxicity: 0.6, identityAttack: 0.9, ...}
```

### 图像 NSFW 模型

```
架构：
  阶段 1 - ResNet-50 / EfficientNet-B4（快速二分类 NSFW 分类器）
  阶段 2 - CLIP（OpenAI）用于语义图像-文本理解
  阶段 3 - 针对策略特定类别的自定义微调模型

输出类别：
  - safe, suggestive, partially_nude, explicit_adult, graphic_violence,
    hate_symbols, weapons, self_harm, spam_graphic

CLIP 用法：
  - 将图像嵌入 CLIP 空间
  - 计算与类别文本嵌入的相似度：
    例如，sim(image, "explicit sexual content") → score
  - 对训练集中没有的新型内容特别有效

训练：
  - 骨干网络：ImageNet 预训练 + 领域微调
  - 内部人工标注数据（1 亿+ 标注图像）
  - 困难负样本挖掘（对抗性样本）
  - 随着策略演变定期重新训练
```

### 视频分类流水线

```
+---------------+    +------------------+    +------------------+
| 视频上传      +--->+ 缩略图提取       +--->+ Image Classifier |
+-------+-------+    +------------------+    +--------+---------+
        |                                             |
        v                                             v
+-------+-------+    +------------------+    +--------+---------+
| 帧采样器      +--->+ Image Classifier +--->+ 分数聚合器       |
| (1 FPS)       |    | （每帧）         |    |                  |
+-------+-------+    +------------------+    +--------+---------+
        |                                             |
        v                                             v
+-------+-------+    +------------------+    +--------+---------+
| 音频提取      +--->+ Whisper STT      +--->+ Text Classifier  |
+-------+-------+    +------------------+    +--------+---------+
        |                                             |
        v                                             v
+-------+-------+                           +--------+---------+
| Video Hash    |                           | 最终视频          |
| Fingerprint   |                           | 决定              |
+---------------+                           +------------------+

分数聚合：
  final_score = max(
    max(frame_scores),          # 最差帧优先
    transcript_toxicity_score,
    thumbnail_score
  )

  如果任何帧 > 0.99 CSAM → 立即自动拒绝 + hash 存储
```

---

## 深入探讨：Confidence Tiers 与决策逻辑

Confidence tier 系统将 ML 评分转化为审核决策，在自动化速度和准确性之间取得平衡。

```
                     ML Score → 违规概率

0.00    0.05                    0.65    0.95    0.99    1.00
 |-------|------------------------|-------|-------|--------|
 |                                                        |
 自动通过区域            人工审核区域            自动拒绝
 (Score < 0.05)         (0.05 - 0.95)          (Score > 0.99)

                                         严重违规
                                         (CSAM, 恐怖主义):
                                         阈值 > 0.90
```

### Tier 定义

| Tier | 条件 | 处置 | 理由 |
|------|------|------|------|
| 自动通过 | 安全置信度 > 0.95 | 立即发布 | 95% 的内容；错误风险低 |
| 自动拒绝（标准） | 违规分数 > 0.99 | 删除 + 通知创作者 | 需要极高精确率 |
| 自动拒绝（严重） | CSAM/恐怖主义分数 > 0.90 | 删除 + 执法机构 + hash | 安全优先于误报 |
| 人工审核 | 灰色地带 0.05-0.95 | 排队等待人工 | 不确定；需要人工判断 |
| 加急人工审核 | 灰色地带 + 高传播内容 | 优先队列（1 小时 SLA） | 病毒式内容需要更快审核 |

### 人工审核优先级评分公式

```
priority_score = severity_weight × reach_score × urgency_factor

其中：
  severity_weight（严重性权重）：
    CSAM          = 10.0
    暴力          =  8.0
    仇恨言论      =  7.0
    骚扰          =  6.0
    虚假信息      =  5.0
    NSFW 成人     =  4.0
    垃圾信息      =  2.0

  reach_score = log10(1 + follower_count × virality_rate)
    # 拥有 100 万粉丝的病毒式内容 → 分数 ~7.0
    # 拥有 10 个粉丝的新账户 → 分数 ~1.0

  urgency_factor（紧急度因子）：
    直播内容                   = 5.0
    突发新闻上下文              = 3.0
    自举报以来的时间（衰减）：   = 1.0 / (1 + hours_since_report / 6)

final_priority = min(100, priority_score × 10)
# 0 = 最高紧急度，100 = 最低紧急度
```

### 自动拒绝精确率要求

为保持自动拒绝的 < 1% 误报率：

```
以 5 亿帖子/天计算：
  ~5% 违规内容估算 = 2500 万违规/天
  自动拒绝捕获 80% 的明确违规 = 2000 万自动拒绝
  1% 误报 = 0.01 × 4.8 亿合法内容 = 480 万次错误删除/天

这太高了。1% FPR 适用于人工审核层级。
对于自动拒绝，我们的目标是：
  - 精确率 > 99.9%（自动拒绝阈值下 < 0.1% FPR）
  - 在 2000 万自动拒绝中：0.001 × 2000 万 = 2 万次错误自动拒绝
  - 这些用户可以申诉；申诉团队优先审核
```

---

## 深入探讨：Hash-Based Matching

Hash matching 是检测已知违法内容的最快速和最可靠的方法。

### Hash 类型

```
+------------------+--------+-------------------+--------------------+
| Hash 类型        | 速度   | 用途              | 碰撞处理           |
+------------------+--------+-------------------+--------------------+
| SHA-256          | < 1ms  | 精确文件匹配      | 无需处理           |
| pHash            | ~5ms   | 近似重复          | Hamming 距离       |
| PhotoDNA         | ~20ms  | CSAM（Microsoft） | 专有方案           |
| Video TMKL       | ~50ms  | 视频指纹          | 相似度分数         |
+------------------+--------+-------------------+--------------------+
```

### pHash 近似重复检测

```
图像 → 缩放至 32x32 → DCT 变换 → 取左上 8x8 = 64 位

如果 Hamming 距离 < 10 位（共 64 位），两张图像为"近似重复"
可容忍：压缩失真、小幅裁剪、亮度变化

pHash 查询架构：
  - 将所有 64 位 pHash 存储在 PostgreSQL 中，使用 GiST 索引
  - 使用 BK-tree（Burkhard-Keller 树）进行半径搜索
  - 查询：找到所有与查询 hash 的 Hamming 距离在 8 以内的 hash
  - 时间：BK-tree O(log n)，10 亿 hash 数据库约 5ms
```

### Bloom Filter 快速否定筛查

```
在执行昂贵的 hash 查找之前，使用 Redis Bloom Filter：

  Redis BLOOM 模块：
    BF.ADD  bad_hashes sha256:d4e8f2a1...
    BF.EXISTS bad_hashes sha256:<query_hash>

  Bloom filter：10 亿项，0.01% 误报率
    内存 = -n × ln(p) / (ln 2)^2 = 10 亿 × 9.6 / 0.48 = ~2.4 GB
    误报：触发精确 DB 查找（低成本，罕见）
    漏报：设计上不可能

  如果 Bloom filter 显示"不存在" → 100% 确定不在 DB 中 → 跳过
  如果 Bloom filter 显示"存在" → 99.99% 在 DB 中 → 执行精确查找
```

### Hash Matching 流程

```
+----------+                                    +----------+
| 内容     |                                    | NCMEC    |
| 已提交   +---+                                | 数据库   |
+----------+   |                                +----+-----+
               |                                     |
               v                                     v
         +-----+-----+      不在           +----------+----------+
         | Redis     |      Bloom          | Hash Registry DB    |
         | Bloom     +-----Filter-------->+ (PostgreSQL +       |
         | Filter    |                   |  BK-tree 索引)       |
         +-----+-----+                   +----------+----------+
               |                                    |
               | 在 Bloom 中                        | Hash 找到
               v                                    v
         +-----+-----+                    +---------+---------+
         | 精确      | 匹配！             | 自动拒绝 +        |
         | Hash DB   +-------------------> 执法机构           |
         | 查找      |                   | 报告（CSAM）      |
         +-----+-----+                   +-------------------+
               |
               | 无匹配
               v
         继续进入 ML 流水线
```

---

## 深入探讨：人工审核队列

人工审核员是细微违规的最后防线，也是申诉的后盾。

### 审核员仪表板布局

```
+--------------------------------------------------------------------+
|  审核员仪表板 - Jane Smith | 队列：仇恨言论 | EN/ZH               |
+--------------------------------------------------------------------+
|  队列状态：847 项 | SLA 紧急：12 | 分配给我：3                     |
+--------------------------------------------------------------------+
|                                                                    |
|  当前项目（优先级：94/100 | 紧急度：高）                            |
|  Content ID: cnt_abc123 | 类型：图片 + 文本 | 举报数：7              |
|                                                                    |
|  +----------------------------------+  +--------------------------+|
|  | [图片缩略图 - 已模糊]            |  | ML 评分：                ||
|  |                                  |  |  Hate Speech:   0.82     ||
|  | 标题："These [slur]s should      |  |  Toxicity:      0.79     ||
|  | [violent phrase]..."             |  |  Violence:      0.45     ||
|  |                                  |  |  Safe Score:    0.09     ||
|  +----------------------------------+  |                          ||
|                                        | Policy: hate_speech_v3   ||
|  上下文：                              | 触发规则：hs_ml          ||
|  - 账户年龄：3 天                      +--------------------------+|
|  - 粉丝数：12,400                                                  |
|  - 历史违规：2                                                      |
|  - 触达范围：2 小时内 850 次互动                                     |
|                                                                    |
|  相似已审核项目：[link1] [link2] [link3]                             |
|                                                                    |
|  [ 删除 ]  [ 标签 + 警告 ]  [ 降低分发 ]  [ 通过 ]                  |
|  [ 升级至高级审核员 ]  [ 请求上下文 ]  [ 标记策略缺口 ]              |
|                                                                    |
|  决定备注：____________________________________________              |
|  审核用时：00:01:23    准确率连续记录：47/50 正确                     |
+--------------------------------------------------------------------+
```

### 审核员分配策略

```
分配逻辑：
  1. 语言路由：将审核员认证的语言与内容语言匹配
  2. 专业路由：将审核员训练的类别与违规类型匹配
  3. 敏感性路由：在以下情况下升级到高级审核员：
     - 潜在 CSAM（始终高级）
     - 高知名度账户（>100 万粉丝）
     - 政治敏感（选举内容、政府批评）
     - 类似内容有过申诉历史
  4. 负载均衡：在可用审核员之间分配（令牌桶）
  5. 疲劳管理：最多连续 2 小时处理严重内容，然后轮换

审核员层级：
  Tier 1（通用）：处理垃圾信息、轻微 NSFW、重复举报（队列的 ~70%）
  Tier 2（专家）：处理仇恨言论、骚扰、边界暴力（~25%）
  Tier 3（高级）：处理升级案例、CSAM 相关、政治言论（~4%）
  Tier 4（策略）：处理边缘案例、策略解读、开创性先例（~1%）
```

### 质量审计系统

```
质量控制流程：

所有决定中 10% 被随机抽样进行质量审计。
所有被推翻的申诉 100% 反馈到审核员评分。

审核员质量分数 = (
  (correct_decisions / total_audited_decisions) × 0.6 +
  (appeals_upheld_rate ≤ 5% ? 1.0 : 0.5) × 0.3 +
  (consistency_with_peers) × 0.1
)

基于质量分数的处置：
  分数 > 0.90：受信审核员（有资格晋升高级层级）
  分数 0.80-0.90：标准审核员
  分数 0.70-0.80：需要额外培训
  分数 < 0.70：暂停审核分配 + 补救计划

评注者间一致性（IAA）：
  争议性项目发送给 3 名独立审核员
  使用多数决；平局升级到高级审核员
  IAA 作为校准指标进行追踪
```

---

## 深入探讨：Policy Engine

Policy engine 将社区准则（人类可读）转化为大规模执行的可执行规则。

### 策略规则类型

```
规则层次结构（从上到下评估，首次匹配生效）：

优先级 1：强制性法律规则（覆盖一切）
  - CSAM：自动拒绝，报告给 NCMEC
  - 恐怖主义（GIFCT）：自动拒绝
  - 法院命令的删除：自动拒绝
  - 地理封锁（例如，在德国违法的内容）：区域特定拒绝

优先级 2：基于 HASH 的规则
  - 与黑名单的精确 hash 匹配：自动拒绝
  - 近似重复匹配 > 0.95 相似度：自动拒绝

优先级 3：关键词/模式规则
  - 精确侮辱词列表匹配：自动拒绝（仇恨言论）
  - 垃圾信息模式（重复 URL、链接农场）：自动拒绝
  - 电话/邮箱 PII 模式：自动标签 + 联系信息删除

优先级 4：ML 阈值规则
  - NSFW 分数 > 0.99：自动拒绝
  - NSFW 分数 > 0.70：年龄限制（仅 18+ 受众）
  - 毒性分数 > 0.85：人工审核（加急）
  - 虚假信息集群匹配：降低分发 + 标签

优先级 5：上下文规则
  - 高传播账户 + 边界内容：升级人工审核
  - 新账户（< 7 天）+ 可疑模式：额外审查
  - 累犯者：降低处置阈值（处罚积分制）
```

### 策略版本管理

```
+-------------------+        +-------------------+
| Policy v2.1       |        | Policy v3.0       |
| （当前活跃）       |        | （A/B 测试：10%）  |
+-------------------+        +-------------------+
         |                            |
         +-------------+--------------+
                       |
                       v
               +-------+-------+
               | Policy 路由器 |
               |  90% → v2.1   |
               |  10% → v3.0   |
               +-------+-------+
                       |
                       v
               +-------+-------+
               | Policy 评估   |
               | 引擎          |
               +---------------+

A/B 测试追踪：
  - 追踪结果：FPR、FNR、申诉率、用户举报
  - 统计显著性：χ² 检验，p < 0.05 后才发布
  - 发布阶段：1% → 10% → 50% → 100%
  - 如果 FPR 增加 > 0.5% 则自动回滚
```

### Policy Engine 实现

```
// 伪代码：策略评估
function evaluatePolicy(content, mlScores, policyVersion) {
  const rules = loadPolicy(policyVersion)

  for (const rule of rules.sortByPriority()) {
    const matches = rule.evaluate({
      content,
      mlScores,
      creatorProfile: content.creator,
      geoContext: content.geo_country
    })

    if (matches) {
      return {
        decision: rule.action,          // auto_approve | auto_reject | human_review
        reason: rule.rule_id,
        confidence: matches.confidence,
        policy_version: policyVersion,
        applicable_policy: rule.policy_name
      }
    }
  }

  // 默认：如果没有规则高置信度匹配则人工审核
  return { decision: 'human_review', reason: 'no_confident_match' }
}
```

---

## 深入探讨：用户举报系统

用户举报是被动审核的关键信号，也是改进主动模型的关键。

### 举报处理流水线

```
用户提交举报
      |
      v
+-----+--------+
| 去重检查     |  同一用户举报同一内容两次 → 去重
| 速率限制     |  每用户每天最多 50 次举报（防止滥用举报）
+-----+--------+
      |
      v
+-----+-----------+
| 举报人质量       |
| 分数检查         |
|                  |
| 高质量 >0.8 → 快速通道进入人工审核
| 新举报人 0.5  → 标准队列
| 低质量 <0.3  → 降低优先级 + 影子队列
+-----+-----------+
      |
      v
+-----+----------+
| 举报集群        |
| 聚合           |  同一内容的 N 次举报 → 提升优先级
+-----+----------+
      |
      v
+-----+----------+
| 举报分流        |
|                |
| CSAM → 立即处理 → 法律团队
| 暴力/威胁 → 紧急队列（1 小时 SLA）
| 骚扰 → 标准队列（24 小时）
| 垃圾信息 → 自动化处理
+-----+----------+
```

### 举报质量评分

```
举报人质量分数追踪用户历史举报的准确性：

quality_score = (
  confirmed_violations / total_reports_resolved × 0.7 +
  appeal_reversal_rate_on_my_reports × -0.3 +  // 举报导致的处置被推翻的比例
  base_score（新用户为 0.5）
)

高质量举报人：
  - 受信测试人员（平台合作伙伴）
  - NGO 合作伙伴（NCMEC、IWF、Moonshot CVE）
  - 历史记录准确率 > 0.85
  → 他们的举报触发立即加急审核

低质量举报人：
  - 骚扰举报者（针对政治对手提交举报）
  - 准确率 < 20% 的连续举报者
  → 举报入队但降低优先级
  → 用户收到滥用举报系统的警告
```

### 连续举报者检测

```
表明滥用举报系统的模式：
  1. 定向攻击：80% 的举报针对用户与之有负面互动的账户
  2. 速度：> 200 次举报/天（协同举报大队）
  3. 类别滥用：仅使用模糊类别如"其他"以绕过审查
  4. 误报模式：< 10% 的举报导致处置

应对措施：
  - 限制举报能力的速率
  - 影子队列（举报被接受但降低优先级）
  - 账户警告
  - 暂停举报能力（最后手段）
```

---

## 深入探讨：申诉工作流

申诉允许用户对审核决定提出异议，对维护信任至关重要。

### 三层申诉结构

```
+-------------------------------------------------------------------+
|                    申诉工作流                                       |
+-------------------------------------------------------------------+
|                                                                   |
|  TIER 1：自动审核（< 24 小时）                                     |
|  +------------------------------------------------------------+   |
|  | 使用更新的模型重新进行 ML 评估                               |   |
|  | 检查自原始决定以来策略是否有变更                              |   |
|  | 简单案例：垃圾信息、轻微 NSFW → 自动推翻/维持                |   |
|  | ~60% 的申诉在 Tier 1 解决                                   |   |
|  +-----------+------------------------------------------------+   |
|              |                                                    |
|              | 未解决或复杂                                        |
|              v                                                    |
|  TIER 2：人工二次审核（< 72 小时）                                  |
|  +------------------------------------------------------------+   |
|  | 高级审核员（非原审核员）                                     |   |
|  | 全面上下文审核：创作者历史、帖子串上下文                      |   |
|  | 可以：维持、推翻、修改（添加标签代替删除）                    |   |
|  | 需要以结构化格式记录推理过程                                 |   |
|  | ~30% 的申诉在 Tier 2 解决                                   |   |
|  +-----------+------------------------------------------------+   |
|              |                                                    |
|              | 进一步争议                                           |
|              v                                                    |
|  TIER 3：策略委员会（< 14 天）                                      |
|  +------------------------------------------------------------+   |
|  | 委员会：法律、策略、信任与安全负责人                          |   |
|  | 开创性案例 → 作为策略指导发布                                |   |
|  | 转介外部监督委员会（针对大型平台）                            |   |
|  | 决定为最终决定（除非法律挑战）                                |   |
|  | ~10% 的申诉到达 Tier 3                                      |   |
|  +------------------------------------------------------------+   |
|                                                                   |
+-------------------------------------------------------------------+

申诉结果：
  维持（UPHELD）：原处置维持，通知创作者并附解释
  推翻（OVERTURNED）：内容恢复，处置撤销，向审核员发送质量信号
  修改（MODIFIED）：处置变更（例如，删除 → 添加警告标签）
  升级（ESCALATED）：转移到更高层级
```

### 申诉数据流

```
申诉已提交
    |
    v
资格检查：
  - 在 30 天申诉窗口内？
  - 未曾申诉过（每个决定最多 2 次申诉）？
  - 账户未被终止（已终止账户：有限的申诉途径）？
    |
    v
Tier 1：重新运行 ML + 策略检查
    |
    +----> 自动推翻：策略变更或 ML 分数现在安全
    |      自动维持：ML 仍然高 + 强策略匹配
    |
    v（模糊）
Tier 2：分配给高级审核员
         （绝不是原审核员 — 利益冲突）
    |
    +----> 维持 / 推翻 / 修改
    |
    v（进一步争议）
Tier 3：策略委员会审核
    |
    +----> 最终决定 + 作为案例研究发布（匿名化）
```

---

## 深入探讨：实时直播审核

直播无法预筛查 --- 违规行为实时发生，需要不同的架构。

### 延迟缓冲架构

```
主播 → RTMP 接入 → +---30-60 秒延迟缓冲---+
                          |                               |
                          |  帧采样器（1 FPS）-----> ML Pipeline
                          |  音频提取器 ---------> Whisper STT
                          |  观众举报 -----------> 升级
                          |                               |
                          +-------------------------------+
                                          |
                              决定：安全 或 违规
                                    /         \
                              安全              违规
                                |                   |
                         释放给             紧急停播：
                         观众              - 切断直播
                         （30-60 秒延迟）   - 通知主播
                                           - 记录事件
```

### 直播审核组件

```
直播帧的实时 ML：
  - 每秒采样一帧
  - Image classifier：NSFW、暴力（GPU 上每帧 < 200ms）
  - 音频：滚动 10 秒窗口 → Whisper STT → text classifier
  - 30 秒窗口内的滚动平均分数以避免单帧误报

紧急停播触发条件（自动）：
  - 任何帧 CSAM 分数 > 0.90 → 立即终止
  - 暴力分数 > 0.95（持续 5+ 帧）→ 立即终止
  - 单条直播的观众举报率 > 50 次/分钟 → 提醒人工审核员

人工监控员分配：
  - 有过违规记录的账户直播 → 分配人工监控员
  - 大型活动（>10 万同时在线观众）→ 分配人工监控员
  - 直播标题包含标记关键词 → 提升监控级别

延迟缓冲设计：
  - 目标：音乐/游戏直播 30 秒（用户体验 vs. 安全权衡）
  - 目标：新闻/政治内容 60 秒（更高审查）
  - 实现：HLS 分段流；在 CDN 推送前保留分段
  - 仅在审核放行后 CDN 推送
```

---

## 深入探讨：滥用模式检测

老练的攻击者使用协同策略来规避单个内容的审核。

### 协同虚假行为（CIB）

```
检测信号：
  时间聚类：
    - N 个账户在短时间窗口内发布相似内容
    - 异常发帖频率（机器人 24/7 发帖，人类不会）

  行为关联：
    - 账户在相似时间创建
    - 相似的设备指纹 / IP 子网
    - 所有账户关注相同的种子账户
    - 协同放大：同一内容被集群点赞/分享

  内容相似性：
    - 带有细微变化的近似重复文本（拼写错误以避免去重）
    - 同一图片出现在多个账户（水印被删除）
    - 不相关账户之间共享的媒体 hash

基于图的检测：
  - 构建互动图：节点 = 账户，边 = 互动
  - 检测密集子图（协同账户的团体）
  - GNN（图神经网络）用于大规模社区检测
  - Louvain 算法用于每日批处理中的聚类
```

### 垃圾信息网络检测

```
+------------------+      +------------------+      +------------------+
| 账户行为         |      | 内容模式         |      | 网络图           |
| 分析             |      | 分析             |      | 分析             |
|                  |      |                  |      |                  |
| - 发帖速度       |      | - URL 模式       |      | - 粉丝图         |
| - 登录模式       |      | - 文本模板       |      | - 互动           |
| - 设备变更       |      | - 图片复用       |      |   聚类           |
+--------+---------+      +--------+---------+      +--------+---------+
         |                         |                         |
         +-------------+-----------+-----------+-------------+
                       |
                       v
               +-------+-------+
               | 集成           |
               | 垃圾信息评分器 |
               +-------+-------+
                       |
                       v
          垃圾信息分数 > 阈值 → 账户暂停
          垃圾信息分数中等     → 内容抑制
          垃圾信息分数低       → 监控名单 + 监控
```

### 封禁规避检测

```
当账户被封禁时，通过以下方式检测回归：

  设备指纹：
    - Canvas fingerprint、WebGL fingerprint、audio context fingerprint
    - 浏览器扩展签名
    - 存储在加密的设备 ID 中

  IP 关联：
    - 封禁时标记 IP 地址 / /24 子网
    - 来自同一 IP 子网的新账户 → 提升审查级别

  行为指纹：
    - 打字模式、滚动行为、鼠标移动（机器人 vs. 人类）
    - 与被封禁账户社交图的图距离
    - 独特短语、表情符号模式、写作风格的复用

  速度检查：
    - 新账户立即发帖，没有"新用户"探索行为
    - 立即关注与被封禁账户相同的账户

对疑似规避的处置：
  - Shadow ban（内容仅对发帖者可见）
  - 要求手机验证
  - CAPTCHA 挑战
  - 任何内容发布前进行人工审核
```

---

## 深入探讨：LLM 驱动的审核

大语言模型实现了规则系统无法做出的细微的、上下文感知的审核决策。

### LLM 在审核中的用例

```
1. 灰色地带分类
   当 ML 对仇恨言论的置信度在 0.4-0.8 范围时：

   Prompt:
   """
   You are a content moderation expert. Review the following content
   and determine if it violates our hate speech policy.

   Policy: Content that attacks people based on race, ethnicity,
   national origin, religion, gender, sexual orientation, or disability.

   Context: The content was posted in a thread discussing immigration policy.
   Creator has 50K followers. 3 users reported it for hate speech.

   Content: "[content text]"

   Examples of violations: [few-shot examples]
   Examples of non-violations: [few-shot examples]

   Respond with:
   - decision: violates | does_not_violate | ambiguous
   - confidence: 0.0-1.0
   - reasoning: [2-3 sentences]
   - suggested_action: remove | label | human_review | approve
   """

2. 新型内容的策略解读
   - 不在训练数据中的新表情包、文化引用
   - 跨文化上下文（手势含义因国家而异）
   - 讽刺 vs. 真正的极端主义

3. 申诉信分析
   - 为人工审核员总结申诉论点
   - 将申诉与类似历史案例进行比较
   - 标记申诉是否揭示了真正的策略缺口

4. 透明度报告生成
   - 将审核统计数据总结为自然语言
   - 识别删除模式中的趋势和异常
```

### LLM 集成架构

```
+---------------------+
| 灰色地带内容         |
| （ML 分数 0.4-0.8）  |
+----------+----------+
           |
           v
+----------+----------+
| LLM 路由器          |
| - 速率限制          |  仅 1-5% 的内容到达 LLM（成本控制）
| - 成本追踪          |  每次 LLM 调用约 $0.01-0.10
| - 模型选择          |  简单用 Haiku，复杂用 Sonnet，升级用 Opus
+----------+----------+
           |
           v
+----------+----------+
| Prompt 构建器       |
| - 策略模板          |
| - Few-shot 示例     |  从策略示例库检索（向量搜索）
| - 上下文组装        |
+----------+----------+
           |
           v
+----------+----------+
| LLM 推理            |
| - Claude / GPT-4    |
| - 结构化输出        |
| - JSON 响应         |
+----------+----------+
           |
           v
+----------+----------+
| 输出验证器          |
| - 解析 JSON         |
| - 验证字段          |
| - 合理性检查        |
+----------+----------+
           |
           v
     最终决定

成本控制：
  5 亿帖子/天 × 1% LLM 路由 = 500 万次 LLM 调用/天
  平均成本 $0.02/次 = $100,000/天 → LLM 预算约束
  优化：缓存相同/近似相同内容的 LLM 结果（1 小时 TTL）
```

### Few-Shot Prompt 管理

```
策略示例库（Vector DB）：
  - 每个违规类别 10,000+ 人工精选示例
  - 每个示例：{content, context, decision, reasoning, policy_section}
  - 通过与输入内容的语义相似度检索
  - 每周使用人工审核中的新边缘案例更新

Few-Shot 检索：
  query_embedding = embed(incoming_content)
  relevant_examples = vector_search(
    query_embedding,
    collection="policy_examples",
    category=suspected_category,
    top_k=5
  )
  prompt = build_prompt(policy_text, relevant_examples, incoming_content)
```

---

## 深入探讨：透明度与审核员身心健康

### 透明度报告

```
季度透明度报告指标：
+-----------------------------------------------+--------+----------+
| 指标                                          | Q4 2025| Q1 2026  |
+-----------------------------------------------+--------+----------+
| 总评估内容数                                   | 450 亿 | 470 亿   |
| 已删除内容数                                   | 4500 万| 4200 万  |
| 删除率                                         | 0.10%  | 0.089%   |
| 自动删除（ML + hash）                           | 85%    | 87%      |
| 人工审核并删除                                  | 15%    | 13%      |
| 误报率（自动删除）                              | 0.08%  | 0.07%    |
| 已提交申诉数                                   | 210 万 | 190 万   |
| 申诉通过（处置被推翻）                          | 18%    | 16%      |
| CSAM 删除 + 报告给 NCMEC                       | 120 万 | 110 万   |
| 恐怖主义内容删除                                | 42 万  | 38 万    |
| 政府删除请求                                   | 5.5 万 | 6.1 万   |
| 政府请求合规率                                  | 72%    | 70%      |
+-----------------------------------------------+--------+----------+
```

### 审核员身心健康保障系统

```
内容审核是心理要求最高的工作之一。
接触血腥暴力、CSAM 和极端主义内容会导致替代性创伤。

身心健康保护措施：
+----------------------------------+
| 内容接触限制                      |
|                                  |
| 严重内容（CSAM、暴力）：          |
|   每天最多 2 小时                 |
|   每 30 分钟强制休息              |
|   每 4 小时强制轮换               |
|                                  |
| 中等内容：                        |
|   每天最多 6 小时                 |
|   每 2 小时休息                   |
+----------------------------------+

+----------------------------------+
| 心理韧性工具                      |
|                                  |
| - 图片灰度模式                    |
|   （降低血腥内容的情感冲击）       |
| - 模糊 + 渐进显示                 |
|   （审核员控制暴露程度）           |
| - 内容警告标头                    |
|   （在完整内容加载之前）           |
| - "跳过"选项用于                  |
|   令人痛苦的内容（无惩罚）         |
+----------------------------------+

+----------------------------------+
| 心理支持                          |
|                                  |
| - 专职心理咨询师                  |
| - 强制 EAP（员工援助计划）        |
|   访问权限                        |
| - 同伴支持网络                    |
| - 心理韧性培训                    |
| - 定期健康检查                    |
| - 匿名心理健康调查                |
+----------------------------------+

+----------------------------------+
| 合理薪酬                          |
|                                  |
| - 严重内容的危险津贴              |
| - 明确的职业晋升路径              |
| - 绩效不仅以速度衡量              |
|   （质量同样重要）                |
+----------------------------------+
```

---

## 扩展策略

### 按服务水平扩展

```
+------------------------+--------+----------------------------------+
| 服务                   | 规模   | 策略                             |
+------------------------+--------+----------------------------------+
| Content Submit 服务    | 580K/s | 无状态，按 QPS 自动扩展          |
| Hash Matching 服务     | 580K/s | Redis 集群 + 只读副本            |
| ML Text Classifier     | 3 亿/天| CPU pod，批处理 + 流处理模式     |
| ML Image Classifier    | 1.5亿/天| GPU 节点池（A100），队列         |
| ML Video Classifier    | 4000万/天| GPU 节点池，优先级队列          |
| 人工审核队列           | 1500万/天| PostgreSQL 按日期分区           |
| Report 服务            | 116/s  | 无状态，每用户速率限制            |
| Policy Engine          | 580K/s | 内存中规则评估                    |
| Action Executor        | 580K/s | 幂等，Kafka 支撑                 |
| Appeals 服务           | 50 万/天| 标准 DB 支撑服务                 |
+------------------------+--------+----------------------------------+
```

### Kafka Topic 设计

```
Topics：
  content.submitted        (partitions: 200, retention: 7 天)
  content.hash_checked     (partitions: 200, retention: 3 天)
  content.ml_scored        (partitions: 200, retention: 3 天)
  content.decision_made    (partitions: 200, retention: 30 天)
  content.actioned         (partitions: 100, retention: 90 天)
  reports.received         (partitions: 50,  retention: 30 天)
  reports.triaged          (partitions: 50,  retention: 30 天)
  appeals.filed            (partitions: 20,  retention: 90 天)
  hashes.added             (partitions: 5,   retention: 永久)
  policy.updated           (partitions: 5,   retention: 永久)

分区策略：
  内容 topics：按 content_id 分区（均匀分布）
  举报 topics：按 content_id 分区（将举报处理集中在一起）
  申诉 topics：按 appeal_id 分区
```

### ML GPU 基础设施

```
ML GPU 集群：

Image Classification（1.5 亿图片/天）：
  - 所需吞吐量：1.5 亿 / 86400 秒 = 1736 张图片/秒
  - 每个 A100 可处理：~500 张图片/秒（batch size 64）
  - 所需：4 个 A100（2 倍余量 = 8 个 A100）
  - 批处理使用竞价实例，实时 SLA 使用按需实例

Video Classification（4000 万视频/天 × 60 帧平均）：
  - 帧吞吐量：4000 万 × 60 / 86400 = 27,778 帧/秒
  - 每个 A100：~200 帧/秒（更大的模型）
  - 所需：140 个 A100（2 倍余量 = 280 个 A100）
  - 基于队列的处理，发布前优先

成本优化：
  - 初始轮使用更小的模型（EfficientNet-B0 vs B4）
  - 仅对高嫌疑内容使用完整模型
  - 在非高峰时段进行批处理
  - 非时间敏感批处理使用竞价/可抢占 VM
```

### 数据分区

```
Content 表：按 content_type + created_at 分区（按月）
  - partition_image_2026_01, partition_video_2026_01 等
  - 热分区（当月）存放在 SSD 上
  - 冷分区（较早）存放在 HDD / 对象存储上

Moderation Jobs：按 created_at 分区（按天）
  - 超过 90 天的任务历史 → 归档到 ClickHouse 用于分析
  - 活跃任务始终在 PostgreSQL 中

Hash 数据库：按 hash_value 前缀分片
  - 16 个分片（第一个十六进制字符 = 分片键）
  - 每个分片：~6000 万条 hash，~2GB
  - 所有分片 3 倍副本保证持久性

Review Queue：按 priority_score 范围 + 区域分区
  - 紧急（0-20）：单独的高优先级队列
  - 标准（20-80）：主队列
  - 低（80-100）：后台队列
```

---

## 权衡取舍

### 误报 vs. 漏报

| 关注点 | 误报（过度删除） | 漏报（删除不足） |
|--------|-----------------|------------------|
| 定义 | 合法内容被删除 | 有害内容仍然在线 |
| 用户影响 | 对言论产生寒蝉效应 | 对受害者造成伤害，损害平台信任 |
| 业务影响 | 创作者流失，媒体批评 | 广告主抵制，法律责任 |
| 衡量指标 | FPR = FP / (FP + TN) | FNR = FN / (FN + TP) |
| 缓解措施 | 降低自动拒绝阈值 | 降低人工审核阈值 |
| 矛盾 | 收紧一个会放松另一个 | -- |

**决策：优化自动拒绝的低 FPR（< 0.1%），接受更高的人工审核量**

### 自动化 vs. 人工审核权衡

| 维度 | 完全自动化 | 完全人工审核 |
|------|-----------|-------------|
| 速度 | 毫秒级 | 数小时到数天 |
| 成本 | $ | $$$$$ |
| 准确率 | 对明确案例好 | 对细微判断更好 |
| 可扩展性 | 无限 | 5 万审核员上限 |
| 偏见 | ML 模型偏见 | 人类文化偏见 |
| 一致性 | 非常一致 | 可变 |

**决策：明确案例 95%+ 自动化，灰色地带人工处理；按严重性分层**

### 发布前 vs. 发布后

| 方法 | 发布前筛查 | 发布后 + 被动 |
|------|-----------|--------------|
| 安全性 | 更高（预防伤害） | 更低（可能造成伤害） |
| 延迟 | 可见前 30 秒延迟 | 立即发布 |
| 用户体验 | 对创作者有挫败感 | 更好的创作者体验 |
| 规模 | 必须处理所有流量 | 仅处理被标记的 |
| 适用于 | 高风险类别，CSAM | 低风险内容类型 |

**决策：视频/图片（风险更高）发布前筛查，大多数文本（风险更低）发布后处理**

### 集中式 vs. 联邦式审核

| 方法 | 集中式 | 联邦式（社区） |
|------|--------|---------------|
| 一致性 | 全球统一标准 | 尊重本地规范 |
| 规模 | 需要大型团队 | 分布式协作 |
| 问责制 | 单一责任点 | 分散的问责 |
| 速度 | 较慢（中心瓶颈） | 较快（本地处置） |
| 滥用风险 | 平台越权 | 社区骚扰 |

**决策：违法内容集中式（不可协商），社区标准联邦式（子版块、群组）**

---

## 常见面试追问

**问：如何处理在一个国家合法但在另一个国家违法的内容？**

基于地理位置的策略路由。维护一个策略矩阵：{violation_type x country_code -> action}。当内容被标记时，检查创作者所在国家和观众所在国家。应用最严格的适用规则。使用 IP 地理定位进行观众端封锁。法律团队维护矩阵；根据法规变化更新。例如：否认大屠杀（在德国违法，在美国合法）、某些政治内容、在将 LGBTQ+ 定为犯罪的国家中的 LGBTQ+ 内容。

**问：如何防止 ML 模型产生或编码偏见？**

多管齐下的方法：(1) 多样化训练数据 --- 审计标注数据集中的人口统计学代表性；(2) 公平性指标 --- 跟踪不同人口群体（种族、性别、宗教、政治倾向）的误报率；设定最大允许差异比率；(3) 红队演练 --- 由多元化团队进行对抗性测试；(4) 外部审计 --- 年度第三方偏见审计；(5) 偏见赏金计划 --- 研究人员报告偏见发现；(6) 策略透明度 --- 公布我们审核的内容和原因，以便外部发现偏见。

**问：如何设计系统来处理传播速度超过审核速度的病毒式有害内容？**

病毒式内容断路器：(1) 检测速度异常：内容在前 10 分钟内获得 10 倍预期互动量则触发高优先级标记；(2) 加速 ML：在 30 秒内推到 ML 队列前端；(3) 审核期间抑制分享：在加速审核期间临时禁用"分享"按钮；(4) Shadow remove：审核期间从非原始发帖者的 feed 中隐藏；(5) 预先安排审核员：值班高级审核员收到即时 Slack 警报；(6) 立即生成 hash：如果被删除，立即计算并存储 hash，以便自动拦截重新上传。

**问：什么是 PhotoDNA，它是如何工作的？**

PhotoDNA（由 Microsoft 开发，捐赠给 National Center for Missing and Exploited Children）使用鲁棒 hash 算法为违法图片（主要是 CSAM）创建"hash"。与 SHA-256（改变 1 个像素就完全不同）不同，PhotoDNA 的 hash 在以下情况下保持稳定：调整大小、颜色变化、小幅裁剪、压缩失真。两张具有相同 PhotoDNA hash 的图片是同一张图片。NCMEC 维护数据库。我们将检测到的 CSAM 提交给 NCMEC；他们添加到 hash 数据库；所有使用 PhotoDNA 的平台然后自动拦截这些图片。我们对每张图片上传都运行 PhotoDNA 匹配，这是不可协商的步骤。

**问：如何大规模处理申诉 --- 50 万申诉/天？**

分层自动化：(1) Tier 0（自动）：重新运行 ML + 策略检查 --- 如果分数已变化（模型更新）或自删除以来策略已变更，自动解决；自动处理约 40% 的申诉；(2) Tier 1（人工）：简化的审核界面，预先以 ML 置信度和策略引用进行总结，每审核员每小时 200 次审核的吞吐量；(3) 优先级排序：高传播创作者（>100 万粉丝）48 小时 SLA；标准创作者 7 天 SLA；(4) 批量处理相似案例：将相同内容类型 + 违规的申诉分组进行批量人工审核；(5) 质量反馈循环：每个被推翻的申诉向原审核员的质量分数发送信号。

**问：如何构建一个支持 100+ 种语言的审核系统？**

(1) 多语言模型：mBERT / XLM-RoBERTa 用于跨语言迁移学习 --- 在英语为主的数据上训练，使用每种语言的翻译示例进行微调；(2) 语言特定模型：为拥有标注数据的前 20 种语言训练专用模型；(3) 机器翻译后备：将低资源语言内容翻译成英语进行评分（增加延迟但提高覆盖率）；(4) 语言匹配审核员：建立标注了语言认证的审核员池；将内容路由到匹配的审核员；(5) 策略本地化：每个区域聘请本地策略专家，将全球策略适配到本地上下文；(6) 社区专家：与了解文化细微差别的本地 NGO 合作。

**问：你在每周运营回顾中会使用哪些指标？**

运营指标：(1) 发布前延迟 P50/P95/P99（目标：P99 < 30 秒）；(2) 每个分类器的 ML 推理延迟；(3) Hash matching 延迟；(4) 按优先级层级的队列深度 + SLA 违约率；(5) 自动处置率（上升趋势 = 更好的自动化，下降趋势 = 模型退化）。质量指标：(6) 误报率（通过申诉推翻率估算）；(7) 漏报率（通过主动 vs. 被动发现比率估算）；(8) 按违规类别的申诉推翻率；(9) 审核员评注者间一致性。业务指标：(10) 按类别的内容删除量；(11) 用户申诉提交趋势；(12) 审核员身心健康评分（每周调查）；(13) 法规合规：在截止日期前完成的政府请求。
