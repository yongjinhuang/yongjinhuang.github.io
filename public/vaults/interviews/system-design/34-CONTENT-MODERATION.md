# Design a Content Moderation System (Facebook / YouTube / TikTok)

## Table of Contents

1. [Requirements Clarification](#requirements-clarification)
2. [API Design](#api-design)
3. [Data Model](#data-model)
4. [High-Level Architecture](#high-level-architecture)
5. [Deep Dive: Content Moderation Pipeline](#deep-dive-content-moderation-pipeline)
6. [Deep Dive: Content Types and Challenges](#deep-dive-content-types-and-challenges)
7. [Deep Dive: ML Classification Models](#deep-dive-ml-classification-models)
8. [Deep Dive: Confidence Tiers and Decision Logic](#deep-dive-confidence-tiers-and-decision-logic)
9. [Deep Dive: Hash-Based Matching](#deep-dive-hash-based-matching)
10. [Deep Dive: Human Review Queue](#deep-dive-human-review-queue)
11. [Deep Dive: Policy Engine](#deep-dive-policy-engine)
12. [Deep Dive: User Reporting System](#deep-dive-user-reporting-system)
13. [Deep Dive: Appeals Workflow](#deep-dive-appeals-workflow)
14. [Deep Dive: Real-Time Live Stream Moderation](#deep-dive-real-time-live-stream-moderation)
15. [Deep Dive: Abuse Pattern Detection](#deep-dive-abuse-pattern-detection)
16. [Deep Dive: LLM-Powered Moderation](#deep-dive-llm-powered-moderation)
17. [Deep Dive: Transparency and Moderator Well-being](#deep-dive-transparency-and-moderator-well-being)
18. [Scaling Strategy](#scaling-strategy)
19. [Trade-offs](#trade-offs)
20. [Common Interview Follow-ups](#common-interview-follow-ups)

---

## Requirements Clarification

### Clarifying Questions to Ask

- What content types do we need to moderate? (text, images, video, audio, live streams)
- Are we doing pre-publish screening, post-publish reactive moderation, or both?
- What violation categories are in scope? (CSAM, hate speech, violence, spam, misinformation)
- What are the legal/jurisdictional requirements? (GDPR, COPPA, DSA, local laws)
- How many human reviewers are available and in what time zones?
- Do we need appeals support? If so, how many tiers?
- What is the acceptable false positive rate? (removing legitimate content)
- Do we need to support live streaming moderation?

### Functional Requirements

| #   | Requirement             | Description                                                           |
| --- | ----------------------- | --------------------------------------------------------------------- |
| 1   | Pre-publish Screening   | Automatically screen content before it becomes publicly visible       |
| 2   | ML Classification       | Run content through text, image, video, and audio classifiers         |
| 3   | Hash-Based Matching     | Match against known bad content databases (PhotoDNA, pHash)           |
| 4   | Human Review Queue      | Route borderline content to human reviewers with priority ranking     |
| 5   | Policy Engine           | Apply rule-based and ML-hybrid policies, support policy versioning    |
| 6   | User Reporting          | Allow users to report content with categories; score report quality   |
| 7   | Content Actions         | Remove, reduce distribution, add label/warning, age-gate, demonetize  |
| 8   | Appeals Workflow        | Users can appeal decisions; multi-tier escalation to policy committee |
| 9   | Live Stream Moderation  | Monitor live streams with delay buffer and kill switch capability     |
| 10  | Abuse Pattern Detection | Detect coordinated inauthentic behavior, spam networks, ban evasion   |
| 11  | Transparency Reporting  | Export removal stats, false positive rates, appeal outcomes           |
| 12  | LLM-Powered Decisions   | Use large language models for nuanced, context-dependent policy calls |

### Non-Functional Requirements

| #   | Requirement                   | Target                                        |
| --- | ----------------------------- | --------------------------------------------- |
| 1   | Pre-publish screening latency | < 30 seconds end-to-end                       |
| 2   | ML inference latency          | < 500ms per content item                      |
| 3   | Hash matching latency         | < 100ms                                       |
| 4   | Availability                  | 99.99% (< 1 hour downtime/year)               |
| 5   | False positive rate           | < 1% (legitimate content incorrectly removed) |
| 6   | Human review SLA (standard)   | 24 hours                                      |
| 7   | Human review SLA (urgent)     | 1 hour                                        |
| 8   | Throughput                    | 500M posts/day screened                       |
| 9   | Report processing             | 10M user reports/day                          |
| 10  | Hash database size            | 1B stored content hashes                      |
| 11  | Reviewer capacity             | 50K human reviewers globally                  |
| 12  | Auto-action accuracy          | > 99% precision at auto-remove threshold      |

### Scale Estimation

```
Content volume:
  Posts/day:                500M posts/day
  Peak QPS (10x avg):       ~58,000 posts/second avg = 580,000 peak
  Content size distribution:
    Text only:              60% = 300M/day
    Image posts:            30% = 150M/day
    Video posts:             8% =  40M/day
    Audio posts:             2% =  10M/day

User reports:
  Reports/day:              10M reports/day
  Reports/second (avg):     ~116/sec
  Reports requiring review: ~20% = 2M/day

Hash matching:
  Hash DB size:             1B hashes
  Hash lookup time:         < 100ms (Redis bloom filter + exact match)
  Hash storage:             1B x 32 bytes (SHA-256) = 32GB (fits in RAM cluster)

ML inference:
  Text classifier:          300M items x 200ms avg = 60M CPU-core-seconds/day
  Image classifier:         150M items x 500ms avg = 75M GPU-seconds/day
  Video classifier:         40M items x 5,000ms avg = 200M GPU-seconds/day
  GPU requirement:          ~2,300 A100-equivalents for video alone (peak)

Human review:
  Reviewers:                50,000 globally (3 shifts, 24/7 coverage)
  Reviews/reviewer/hour:    ~200 for text, ~80 for video
  Daily capacity:           50K x 8h x 150 avg = 60M reviews/day
  Queue target:             Route ~1-3% of content to humans = 5-15M/day

Storage:
  Content metadata:         500M x 2KB = 1TB/day
  ML scores:                500M x 500 bytes = 250GB/day
  Audit logs:               500M x 1KB = 500GB/day
  Hash index:               1B x 64 bytes = 64GB (with metadata)
  Appeals data:             ~500K appeals/day x 5KB = 2.5GB/day

Bandwidth:
  Video ingestion:          40M videos/day x 50MB avg = 2PB/day ingress
  Frame sampling (1fps):    40M x 60 frames avg x 100KB/frame = 240TB/day
```

---

## API Design

### Content Submission and Moderation

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

### User Reporting

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
  "evidence_timestamps": [12, 45],   // For video: seconds where violation occurs
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

### Appeals

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

### Admin Policy Management

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

### Hash Submission (Trust & Safety Tools)

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

## Data Model

### Content Table

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

### Moderation Job Table

```sql
CREATE TABLE moderation_jobs (
  job_id            VARCHAR(36)   PRIMARY KEY,
  content_id        VARCHAR(36)   NOT NULL REFERENCES content(content_id),
  job_type          VARCHAR(20)   NOT NULL,        -- pre_publish | reactive | re_review
  status            VARCHAR(20)   NOT NULL DEFAULT 'queued',
                                               -- queued | processing | complete | failed
  priority          INT           NOT NULL DEFAULT 50,  -- 0 (highest) to 100 (lowest)
  hash_match        BOOLEAN       NOT NULL DEFAULT FALSE,
  hash_match_detail JSONB,
  ml_scores         JSONB,                         -- {toxicity: 0.02, nsfw: 0.01, ...}
  ml_decision       VARCHAR(20),                   -- auto_approve | auto_reject | human_review
  final_decision    VARCHAR(20),                   -- approve | reject | label | age_gate | demonetize | reduce_distribution
  final_action_reason TEXT,
  reviewed_by       VARCHAR(36),                   -- NULL if automated
  review_type       VARCHAR(20)   DEFAULT 'automated', -- automated | human
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  completed_at      TIMESTAMPTZ,
  processing_time_ms INT,
  INDEX idx_content (content_id),
  INDEX idx_status_priority (status, priority, created_at)
);
```

### Human Review Queue Table

```sql
CREATE TABLE review_queue (
  queue_id          VARCHAR(36)   PRIMARY KEY,
  job_id            VARCHAR(36)   NOT NULL REFERENCES moderation_jobs(job_id),
  content_id        VARCHAR(36)   NOT NULL,
  priority_score    FLOAT         NOT NULL,        -- computed: severity x reach x urgency
  violation_category VARCHAR(50)  NOT NULL,
  assigned_reviewer VARCHAR(36),
  assignment_time   TIMESTAMPTZ,
  sla_deadline      TIMESTAMPTZ   NOT NULL,
  status            VARCHAR(20)   NOT NULL DEFAULT 'unassigned',
                                               -- unassigned | assigned | in_review | complete | escalated
  escalated_to      VARCHAR(36),
  region            CHAR(2),                       -- route to regional reviewers
  language          CHAR(5),                       -- route to language-capable reviewers
  sensitive_flag    BOOLEAN       NOT NULL DEFAULT FALSE, -- requires senior reviewer
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  INDEX idx_priority (status, priority_score DESC, created_at),
  INDEX idx_reviewer (assigned_reviewer, status),
  INDEX idx_sla (sla_deadline, status)
);
```

### Content Hash Table

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

### Reports Table

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
  reporter_quality_score FLOAT,               -- tracks report accuracy over time
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  resolved_at       TIMESTAMPTZ,
  INDEX idx_content (content_id, created_at),
  INDEX idx_reporter (reporter_id, created_at),
  INDEX idx_status (status, created_at)
);
```

### Appeals Table

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
  tier              INT           NOT NULL DEFAULT 1,   -- 1 | 2 | 3 (policy committee)
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

### Policy Table

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

## High-Level Architecture

```
+------------------+     +------------------+     +------------------+
|   Mobile/Web     |     |   Upload Service  |     |   CDN / Storage  |
|   Clients        +---->+   (pre-screen     +---->+   (S3 / GCS)     |
|                  |     |    trigger)       |     |                  |
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
  | Content  |  | Report   |  | Hash    |  | Policy   |  | Appeals  |
  | Submit   |  | Service  |  | Match   |  | Engine   |  | Service  |
  | Service  |  |          |  | Service |  |          |  |          |
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
| ML        |   | Hash Matching  |  | Human Review |  | Action       |
| Pipeline  |   | Service        |  | Queue        |  | Executor     |
| Orchestr. |   | (Redis Bloom + |  | Service      |  | Service      |
|           |   |  Exact DB)     |  |              |  |              |
+----+------+   +----------------+  +-------+------+  +------+-------+
     |                                      |                 |
     v                                      v                 v
+----+------+   +----------------+  +-------+------+  +------+-------+
| Text      |   | Image          |  | Reviewer     |  | Content DB   |
| Classifier|   | Classifier     |  | Dashboard    |  | (PostgreSQL) |
| (BERT/    |   | (ResNet/CLIP)  |  | (Assignment  |  |              |
|  Persp.)  |   |                |  |  + Tools)    |  +------+-------+
+----+------+   +----+-----------+  +--------------+         |
     |               |                                        v
     v               v                               +--------+-----+
+----+---------------+---+                           | Audit Log    |
| Video/Audio            |                           | (ClickHouse) |
| Classifier             |                           |              |
| (Frame Sample +        |                           +--------------+
|  Audio Transcribe)     |
+------------------------+
```

---

## Deep Dive: Content Moderation Pipeline

The moderation pipeline is the core of the system. Every piece of content flows through multiple stages before being published or rejected.

```
Content Submitted
      |
      v
+-----+--------+     Match Found
| Hash-Based   +-----------------------------> AUTO-REJECT (CSAM/terrorism)
| Matching     |                               + Law enforcement reporting
+-----+--------+
      | No Match
      v
+-----+--------+
| Policy Rule  +----> Blocklist keyword? -----> AUTO-REJECT
| Pre-filter   |
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
|          Confidence Tier Routing                  |
|                                                   |
|  Safe Score > 0.95   -----> AUTO-APPROVE          |
|                                                   |
|  Violation Score > 0.99 --> AUTO-REJECT           |
|                                                   |
|  Gray zone (0.05-0.95) --> HUMAN REVIEW QUEUE     |
+---------------------------------------------------+
      |                           |
      v                           v
+-----+-------+           +-------+------+
| Action      |           | Human Review |
| Executor    |           | Queue        |
| - Approve   |           | - Priority   |
| - Reject    |           |   Scoring    |
| - Label     |           | - Assignment |
| - Age-gate  |           | - Decision   |
| - Demonetize|           | - Audit      |
+-----+-------+           +-------+------+
      |                           |
      v                           v
+-----+---------------------------+------+
|              Outcome                   |
|  - Notify creator                      |
|  - Update content status               |
|  - Feed enforcement actions            |
|  - Emit audit event                    |
|  - Update reporter (if report-driven)  |
+----------------------------------------+
```

### Pipeline Stage Details

**Stage 1: Ingestion and Pre-screening**

- Content is written to raw object storage (S3/GCS) before any processing
- A unique `content_id` is assigned immediately
- Upload service publishes `content.submitted` event to Kafka
- Content is held in "pending" state — not yet visible to other users

**Stage 2: Hash Matching (< 100ms)**

- Parallel lookup against:
  - SHA-256 exact match (known bad files)
  - pHash (perceptual hash for near-duplicate images)
  - PhotoDNA (Microsoft CSAM database)
  - Video fingerprints (TMKL / Video DNA)
- Hash match on CSAM triggers automatic rejection + NCMEC reporting
- Hash match on terrorism triggers rejection + referral to GIFCT database

**Stage 3: ML Classification (< 500ms per classifier)**

- Classifiers run in parallel for applicable content types
- Each classifier returns a confidence score [0.0 - 1.0] per violation category
- Results aggregated into a composite safety score

**Stage 4: Policy Engine Evaluation**

- Policy rules applied on top of ML scores
- Rules can override ML (e.g., regional legal requirements)
- Result: auto-approve, auto-reject, or route to human review

**Stage 5: Action Execution**

- Actions applied atomically: status update + notification + distribution change
- All actions recorded in immutable audit log

---

## Deep Dive: Content Types and Challenges

Different content types require fundamentally different moderation approaches:

### Text Content (300M/day — 60%)

```
Challenges:
- Context dependency (sarcasm, satire, coded language)
- Multi-language support (100+ languages)
- Dog whistles and evolving slang
- Coordinated campaigns with innocent-looking individual posts

Approaches:
- Toxicity scoring (Perspective API / fine-tuned BERT)
- Named entity recognition (targeted harassment detection)
- Semantic similarity (evading keyword filters with synonyms)
- Cross-post correlation (same text from many accounts = spam)
- LLM for nuanced context analysis (GPT-4 / Claude for gray zone)
```

### Image Content (150M/day — 30%)

```
Challenges:
- NSFW spectrum (art vs. pornography vs. CSAM)
- Context without text (image meaning depends on caption/thread)
- Adversarial perturbations (slightly altered images to evade hash)
- Memes and screenshots (text in images bypasses text filters)

Approaches:
- ResNet/EfficientNet for NSFW classification
- CLIP for semantic image understanding (image + text joint)
- OCR on images to extract and classify embedded text
- pHash for near-duplicate detection
- PhotoDNA for CSAM matching (required by law in many jurisdictions)
- Object detection for weapons, symbols (e.g., Nazi imagery)
```

### Video Content (40M/day — 8%)

```
Challenges:
- Cannot process every frame at scale
- Audio track may contain violations independent of video
- Thumbnails may be clean but content is harmful
- Temporal context (content meaning changes over time in video)

Approaches:
- Frame sampling at 1 FPS for initial screening
- Key-frame extraction (scene change detection)
- Audio track extraction + speech-to-text + text classification
- Video fingerprinting (TMKL) for known bad video matching
- Thumbnail classifier (separate, always runs)
- Full frame-by-frame analysis only for high-suspicion items
```

### Audio Content (10M/day — 2%)

```
Challenges:
- Hate speech in songs/podcasts
- Voice-based harassment in audio messages
- Misuse of AI-generated voices

Approaches:
- Whisper / speech-to-text transcription
- Transcript fed to text classifier
- Speaker diarization for multi-speaker audio
- Audio fingerprinting for known illegal content
```

### Live Streams (Real-time)

```
Challenges:
- Cannot pre-screen (content is real-time)
- Delay buffer is only intervention point
- Cannot afford high false positives (live audience disruption)
- Evolving violations mid-stream

Approaches:
- 30-60 second delay buffer allows reactive moderation
- Continuous frame sampling during stream
- Real-time audio transcription
- Automated kill switch for CSAM or violence scoring above threshold
- Human reviewer on high-risk streams (pre-flagged accounts)
- Viewer report button with instant escalation path
```

---

## Deep Dive: ML Classification Models

### Text Toxicity Model

```
Architecture: Fine-tuned BERT / RoBERTa (multilingual mBERT for non-English)
Output: Scores for [toxicity, hate_speech, threats, harassment, sexual_explicit, spam]

Training Data:
  - CivilComments dataset
  - Internal labeled data from human reviewers
  - Synthetic data augmentation for low-resource languages

Serving:
  - ONNX Runtime for optimized CPU inference
  - GPU inference for batch processing
  - Latency target: < 50ms for 512-token text

Perspective API Integration:
  - Google's Perspective API as a fallback / ensemble member
  - Useful for bootstrapping when internal data is insufficient
  - API call: POST https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze
  - Returns: {toxicity: 0.85, severeToxicity: 0.6, identityAttack: 0.9, ...}
```

### Image NSFW Model

```
Architecture:
  Stage 1 - ResNet-50 / EfficientNet-B4 (fast binary NSFW classifier)
  Stage 2 - CLIP (OpenAI) for semantic image-text understanding
  Stage 3 - Custom fine-tuned model for policy-specific categories

Output Classes:
  - safe, suggestive, partially_nude, explicit_adult, graphic_violence,
    hate_symbols, weapons, self_harm, spam_graphic

CLIP Usage:
  - Embed image into CLIP space
  - Compute similarity to category text embeddings:
    e.g., sim(image, "explicit sexual content") → score
  - Particularly effective for novel content types not in training set

Training:
  - Backbone: ImageNet pretrained + domain fine-tuning
  - Internal human-labeled data (100M+ labeled images)
  - Hard negative mining (adversarial examples)
  - Regular retraining as policy evolves
```

### Video Classification Pipeline

```
+---------------+    +------------------+    +------------------+
| Video Upload  +--->+ Thumbnail Extract+--->+ Image Classifier |
+-------+-------+    +------------------+    +--------+---------+
        |                                             |
        v                                             v
+-------+-------+    +------------------+    +--------+---------+
| Frame Sampler +--->+ Image Classifier +--->+ Score Aggregator |
| (1 FPS)       |    | (per frame)      |    |                  |
+-------+-------+    +------------------+    +--------+---------+
        |                                             |
        v                                             v
+-------+-------+    +------------------+    +--------+---------+
| Audio Extract +--->+ Whisper STT      +--->+ Text Classifier  |
+-------+-------+    +------------------+    +--------+---------+
        |                                             |
        v                                             v
+-------+-------+                           +--------+---------+
| Video Hash    |                           | Final Video      |
| Fingerprint   |                           | Decision         |
+---------------+                           +------------------+

Score Aggregation:
  final_score = max(
    max(frame_scores),          # worst frame wins
    transcript_toxicity_score,
    thumbnail_score
  )

  If any frame > 0.99 CSAM → immediate auto-reject + hash store
```

---

## Deep Dive: Confidence Tiers and Decision Logic

The confidence tier system translates ML scores into moderation decisions, balancing automation speed against accuracy.

```
                     ML Score → Violation Probability

0.00    0.05                    0.65    0.95    0.99    1.00
 |-------|------------------------|-------|-------|--------|
 |                                                        |
 AUTO-APPROVE zone      HUMAN REVIEW zone      AUTO-REJECT
 (Score < 0.05)         (0.05 - 0.95)          (Score > 0.99)

                                         CRITICAL VIOLATIONS
                                         (CSAM, terrorism):
                                         Threshold > 0.90
```

### Tier Definitions

| Tier                   | Condition                      | Action                          | Rationale                         |
| ---------------------- | ------------------------------ | ------------------------------- | --------------------------------- |
| Auto-Approve           | Safe confidence > 0.95         | Publish immediately             | 95% of content; low risk of error |
| Auto-Reject (standard) | Violation score > 0.99         | Remove + notify creator         | Very high precision required      |
| Auto-Reject (critical) | CSAM/terrorism score > 0.90    | Remove + law enforcement + hash | Safety over false positives       |
| Human Review           | Gray zone 0.05–0.95            | Queue for human                 | Uncertain; human judgment needed  |
| Expedited Human        | Gray zone + high reach content | Priority queue (1hr SLA)        | Viral content needs faster review |

### Priority Scoring Formula for Human Review

```
priority_score = severity_weight × reach_score × urgency_factor

Where:
  severity_weight:
    CSAM          = 10.0
    Violence      =  8.0
    Hate Speech   =  7.0
    Harassment    =  6.0
    Misinformation=  5.0
    NSFW Adult    =  4.0
    Spam          =  2.0

  reach_score = log10(1 + follower_count × virality_rate)
    # Viral content with 1M followers → score ~7.0
    # New account with 10 followers → score ~1.0

  urgency_factor:
    Live content                   = 5.0
    Breaking news context          = 3.0
    Time since report (decay):     = 1.0 / (1 + hours_since_report / 6)

final_priority = min(100, priority_score × 10)
# 0 = highest urgency, 100 = lowest urgency
```

### Auto-Reject Precision Requirements

To maintain < 1% false positive rate on auto-reject:

```
At 500M posts/day:
  ~5% violating content estimate = 25M violations/day
  Auto-reject catches 80% of clear violations = 20M auto-rejects
  1% false positive = 0.01 × 480M legitimate content = 4.8M incorrect removals/day

This is too high. The 1% FPR applies to the human review tier.
For auto-reject, we target:
  - Precision > 99.9% (< 0.1% FPR at auto-reject threshold)
  - At 20M auto-rejects: 0.001 × 20M = 20K incorrect auto-rejects
  - These users can appeal; appeals team reviews urgently
```

---

## Deep Dive: Hash-Based Matching

Hash matching is the fastest and most reliable method for detecting known illegal content.

### Hash Types

```
+------------------+--------+-------------------+--------------------+
| Hash Type        | Speed  | Use Case          | Collision Handling |
+------------------+--------+-------------------+--------------------+
| SHA-256          | < 1ms  | Exact file match  | None needed        |
| pHash            | ~5ms   | Near-duplicate    | Hamming distance   |
| PhotoDNA         | ~20ms  | CSAM (Microsoft)  | Proprietary        |
| Video TMKL       | ~50ms  | Video fingerprint | Similarity score   |
+------------------+--------+-------------------+--------------------+
```

### pHash Near-Duplicate Detection

```
Image → Resize to 32x32 → DCT transform → Take top-left 8x8 = 64 bits

Two images are "near duplicates" if Hamming distance < 10 bits (out of 64)
This tolerates: compression artifacts, minor crops, brightness changes

pHash Lookup Architecture:
  - Store all 64-bit pHashes in PostgreSQL with GiST index
  - Use BK-tree (Burkhard-Keller tree) for radius search
  - Query: find all hashes within Hamming distance 8 of query hash
  - Time: O(log n) with BK-tree, ~5ms for 1B hash database
```

### Bloom Filter for Fast Negative Screening

```
Before expensive hash lookup, use Redis Bloom Filter:

  Redis BLOOM module:
    BF.ADD  bad_hashes sha256:d4e8f2a1...
    BF.EXISTS bad_hashes sha256:<query_hash>

  Bloom filter: 1B items, 0.01% false positive rate
    Memory = -n × ln(p) / (ln 2)^2 = 1B × 9.6 / 0.48 = ~2.4 GB
    False positive: Triggers exact DB lookup (cheap, rare)
    False negative: Impossible by design

  If Bloom filter says "not present" → 100% definitely not in DB → skip
  If Bloom filter says "present" → 99.99% in DB → do exact lookup
```

### Hash Matching Flow

```
+----------+                                    +----------+
| Content  |                                    | NCMEC    |
| Submitted+---+                                | Database |
+----------+   |                                +----+-----+
               |                                     |
               v                                     v
         +-----+-----+      Not in        +----------+----------+
         | Redis     |      Bloom         | Hash Registry DB    |
         | Bloom     +-----Filter-------->+ (PostgreSQL +       |
         | Filter    |                   |  BK-tree index)      |
         +-----+-----+                   +----------+----------+
               |                                    |
               | In Bloom                           | Hash Found
               v                                    v
         +-----+-----+                    +---------+---------+
         | Exact     | Match!             | Auto-Reject +     |
         | Hash DB   +-------------------> Law Enforcement   |
         | Lookup    |                   | Report (CSAM)     |
         +-----+-----+                   +-------------------+
               |
               | No Match
               v
         Proceed to ML pipeline
```

---

## Deep Dive: Human Review Queue

Human reviewers are the last line of defense for nuanced violations and the appeals backstop.

### Reviewer Dashboard Layout

```
+--------------------------------------------------------------------+
|  REVIEWER DASHBOARD - Jane Smith | Queue: Hate Speech | EN/ZH     |
+--------------------------------------------------------------------+
|  Queue Status: 847 items | SLA Critical: 12 | Assigned to me: 3   |
+--------------------------------------------------------------------+
|                                                                    |
|  CURRENT ITEM (Priority: 94/100 | Urgency: HIGH)                  |
|  Content ID: cnt_abc123 | Type: Image + Text | Reports: 7         |
|                                                                    |
|  +----------------------------------+  +--------------------------+|
|  | [IMAGE THUMBNAIL - BLURRED]      |  | ML Scores:               ||
|  |                                  |  |  Hate Speech:   0.82     ||
|  | Caption: "These [slur]s should   |  |  Toxicity:      0.79     ||
|  | [violent phrase]..."             |  |  Violence:      0.45     ||
|  |                                  |  |  Safe Score:    0.09     ||
|  +----------------------------------+  |                          ||
|                                        | Policy: hate_speech_v3   ||
|  Context:                              | Rule triggered: hs_ml    ||
|  - Account age: 3 days                 +--------------------------+|
|  - Follower count: 12,400                                          |
|  - Prior violations: 2                                             |
|  - Reach: 850 engagements in 2h                                    |
|                                                                    |
|  Similar reviewed items: [link1] [link2] [link3]                   |
|                                                                    |
|  [ REMOVE ]  [ LABEL + WARNING ]  [ REDUCE DIST ]  [ APPROVE ]    |
|  [ ESCALATE TO SENIOR ]  [ REQUEST CONTEXT ]  [ FLAG POLICY GAP ] |
|                                                                    |
|  Decision notes: ____________________________________________      |
|  Time on item: 00:01:23    Accuracy streak: 47/50 correct          |
+--------------------------------------------------------------------+
```

### Reviewer Assignment Strategy

```
Assignment Logic:
  1. Language routing: Match reviewer's certified languages to content language
  2. Expertise routing: Match reviewer's trained categories to violation type
  3. Sensitivity routing: Escalate to senior reviewer if content is:
     - Potential CSAM (always senior)
     - High-profile account (>1M followers)
     - Politically sensitive (election content, government criticism)
     - Prior appeal history on similar content
  4. Load balancing: Distribute across available reviewers (token bucket)
  5. Fatigue management: Max 2h continuous severe content, then rotation

Reviewer Tiers:
  Tier 1 (General): Handle spam, minor NSFW, duplicate reports (~70% of queue)
  Tier 2 (Specialist): Handle hate speech, harassment, borderline violence (~25%)
  Tier 3 (Senior): Handle escalations, CSAM adjacent, political speech (~4%)
  Tier 4 (Policy): Handle edge cases, policy interpretation, precedent-setting (~1%)
```

### Quality Audit System

```
Quality Control Flow:

10% of all decisions are randomly sampled for quality audit.
100% of appeals that are overturned feed back to reviewer scoring.

Reviewer Quality Score = (
  (correct_decisions / total_audited_decisions) × 0.6 +
  (appeals_upheld_rate ≤ 5% ? 1.0 : 0.5) × 0.3 +
  (consistency_with_peers) × 0.1
)

Actions based on quality score:
  Score > 0.90: Trusted reviewer (eligible for senior tier)
  Score 0.80-0.90: Standard reviewer
  Score 0.70-0.80: Additional training required
  Score < 0.70: Review assignment suspended + remediation program

Inter-Annotator Agreement (IAA):
  Controversial items sent to 3 independent reviewers
  Majority decision used; ties escalated to senior
  IAA tracked as calibration metric
```

---

## Deep Dive: Policy Engine

The policy engine translates community guidelines (human-readable) into executable rules applied at scale.

### Policy Rule Types

```
Rule Hierarchy (evaluated top to bottom, first match wins):

Priority 1: MANDATORY LEGAL RULES (override everything)
  - CSAM: auto-reject, report to NCMEC
  - Terrorism (GIFCT): auto-reject
  - Court-ordered removals: auto-reject
  - Geo-blocking (e.g., content illegal in Germany): region-specific reject

Priority 2: HASH-BASED RULES
  - Exact hash match to blocklist: auto-reject
  - Near-duplicate match > 0.95 similarity: auto-reject

Priority 3: KEYWORD/PATTERN RULES
  - Exact slur list match: auto-reject (hate speech)
  - Spam pattern (repeated URLs, link farms): auto-reject
  - Phone/email PII pattern: auto-label + contact info removal

Priority 4: ML THRESHOLD RULES
  - NSFW score > 0.99: auto-reject
  - NSFW score > 0.70: age-gate (18+ audiences only)
  - Toxicity score > 0.85: human review (expedited)
  - Misinformation cluster match: reduce distribution + label

Priority 5: CONTEXTUAL RULES
  - High-reach account + borderline content: escalated human review
  - New account (< 7 days) + suspicious pattern: additional scrutiny
  - Repeat offender: lower threshold for action (strike system)
```

### Policy Versioning

```
+-------------------+        +-------------------+
| Policy v2.1       |        | Policy v3.0       |
| (current active)  |        | (A/B test: 10%)   |
+-------------------+        +-------------------+
         |                            |
         +-------------+--------------+
                       |
                       v
               +-------+-------+
               | Policy Router |
               |  90% → v2.1   |
               |  10% → v3.0   |
               +-------+-------+
                       |
                       v
               +-------+-------+
               | Policy Eval   |
               | Engine        |
               +---------------+

A/B Test Tracking:
  - Track outcomes: FPR, FNR, appeal rate, user reports
  - Statistical significance: χ² test, p < 0.05 before rollout
  - Rollout stages: 1% → 10% → 50% → 100%
  - Automatic rollback if FPR increases > 0.5%
```

### Policy Engine Implementation

```
// Pseudocode: Policy evaluation
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

  // Default: human review if no rule matches with confidence
  return { decision: 'human_review', reason: 'no_confident_match' }
}
```

---

## Deep Dive: User Reporting System

User reports are a critical signal for reactive moderation and for improving proactive models.

### Report Processing Pipeline

```
User Files Report
      |
      v
+-----+--------+
| Dedup Check  |  Same user reporting same content twice → deduplicate
| Rate Limit   |  Max 50 reports/day per user (prevent spam reporting)
+-----+--------+
      |
      v
+-----+-----------+
| Reporter Quality |
| Score Check      |
|                  |
| High quality >0.8 → fast-track to human review
| New reporter 0.5  → standard queue
| Low quality <0.3  → deprioritize + shadow queue
+-----+-----------+
      |
      v
+-----+----------+
| Report Cluster |
| Aggregation    |  N reports on same content → escalate priority
+-----+----------+
      |
      v
+-----+----------+
| Report Triage  |
|                |
| CSAM → immediate → legal team
| Violence/threat → urgent queue (1hr SLA)
| Harassment → standard queue (24hr)
| Spam → automated processing
+-----+----------+
```

### Report Quality Scoring

```
Reporter quality score tracks the accuracy of a user's historical reports:

quality_score = (
  confirmed_violations / total_reports_resolved × 0.7 +
  appeal_reversal_rate_on_my_reports × -0.3 +  // Reports where action was overturned
  base_score (0.5 for new users)
)

High-quality reporters:
  - Trusted testers (platform partners)
  - NGO partners (NCMEC, IWF, Moonshot CVE)
  - Prior track record > 0.85 accuracy
  → Their reports trigger immediate expedited review

Low-quality reporters:
  - Harassment reporters (filing reports against political opponents)
  - Serial reporters with < 20% accuracy
  → Reports queued but deprioritized
  → User warned about misuse of reporting system
```

### Serial Reporter Detection

```
Patterns that indicate abuse of reporting system:
  1. Targeting: 80% of reports against accounts user interacted negatively with
  2. Velocity: > 200 reports/day (coordinated reporting brigade)
  3. Category abuse: Only uses vague categories like "other" to bypass scrutiny
  4. False positive pattern: < 10% of reports result in action

Responses:
  - Rate limit reporting capability
  - Shadow-queue (reports accepted but deprioritized)
  - Account warning
  - Suspend reporting capability (last resort)
```

---

## Deep Dive: Appeals Workflow

Appeals allow users to contest moderation decisions and are critical for maintaining trust.

### Three-Tier Appeals Structure

```
+-------------------------------------------------------------------+
|                    APPEALS WORKFLOW                               |
+-------------------------------------------------------------------+
|                                                                   |
|  TIER 1: AUTOMATED REVIEW (< 24 hours)                           |
|  +------------------------------------------------------------+   |
|  | ML re-evaluation with updated models                      |   |
|  | Check if policy changed since original decision           |   |
|  | Simple cases: spam, minor NSFW → automated overturn/uphold|   |
|  | ~60% of appeals resolved at Tier 1                        |   |
|  +-----------+------------------------------------------------+   |
|              |                                                    |
|              | Unresolved or complex                              |
|              v                                                    |
|  TIER 2: HUMAN SECONDARY REVIEW (< 72 hours)                     |
|  +------------------------------------------------------------+   |
|  | Senior reviewer (not the original reviewer)               |   |
|  | Full context review: creator history, thread context      |   |
|  | Can: uphold, overturn, modify (add label instead of remove)|  |
|  | Required to document reasoning in structured format       |   |
|  | ~30% of appeals resolved at Tier 2                        |   |
|  +-----------+------------------------------------------------+   |
|              |                                                    |
|              | Further disputed                                   |
|              v                                                    |
|  TIER 3: POLICY COMMITTEE (< 14 days)                            |
|  +------------------------------------------------------------+   |
|  | Panel: Legal, Policy, Trust & Safety leads                |   |
|  | Precedent-setting cases → published as policy guidance    |   |
|  | External oversight board referral (for major platforms)   |   |
|  | Decision is final (unless legal challenge)                |   |
|  | ~10% of appeals reach Tier 3                              |   |
|  +------------------------------------------------------------+   |
|                                                                   |
+-------------------------------------------------------------------+

Appeal Outcomes:
  UPHELD: Original action stands, creator notified with explanation
  OVERTURNED: Content reinstated, action reversed, quality signal sent to reviewer
  MODIFIED: Action changed (e.g., remove → label with warning)
  ESCALATED: Move to higher tier
```

### Appeals Data Flow

```
Appeal Filed
    |
    v
Eligibility Check:
  - Within 30-day appeal window?
  - Not previously appealed (max 2 appeals per decision)?
  - Account not terminated (terminated accounts: limited appeal path)?
    |
    v
Tier 1: Re-run ML + policy check
    |
    +----> Auto-overturn: Policy change or ML score now safe
    |      Auto-uphold: ML still high + strong policy match
    |
    v (ambiguous)
Tier 2: Assign to senior reviewer
         (never original reviewer — conflict of interest)
    |
    +----> Upheld / Overturned / Modified
    |
    v (further disputed)
Tier 3: Policy committee review
    |
    +----> Final decision + publish as case study (anonymized)
```

---

## Deep Dive: Real-Time Live Stream Moderation

Live streams cannot be pre-screened — violations happen in real time and require a different architecture.

### Delay Buffer Architecture

```
Streamer → RTMP Ingest → +---30-60 second delay buffer---+
                          |                               |
                          |  Frame Sampler (1 FPS) -----> ML Pipeline
                          |  Audio Extractor ---------> Whisper STT
                          |  Viewer Reports ---------> Escalation
                          |                               |
                          +-------------------------------+
                                          |
                              Decision: SAFE or VIOLATION
                                    /         \
                              SAFE             VIOLATION
                                |                   |
                         Release to           Kill Switch:
                         viewers              - Cut stream
                         (30-60s delay)       - Notify streamer
                                              - Log incident
```

### Live Stream Moderation Components

```
Real-time ML on live frames:
  - Frame sample every 1 second
  - Image classifier: NSFW, violence (< 200ms per frame on GPU)
  - Audio: Rolling 10-second window → Whisper STT → text classifier
  - Score rolling average over 30s window to avoid single-frame false positives

Kill Switch Triggers (automatic):
  - CSAM score > 0.90 on any frame → immediate termination
  - Violence score > 0.95 (sustained 5+ frames) → immediate termination
  - Viewer report rate > 50/minute on single stream → alert human reviewer

Human Monitor Assignment:
  - Streams from accounts with prior violations → assigned human monitor
  - Large events (>100K concurrent viewers) → assigned human monitor
  - Flagged by keyword in stream title → elevated monitoring

Delay Buffer Design:
  - Target: 30s for music/gaming streams (user experience vs. safety tradeoff)
  - Target: 60s for news/political content (higher scrutiny)
  - Implementation: HLS segmented streaming; hold segments before CDN push
  - CDN push only after moderation clearance
```

---

## Deep Dive: Abuse Pattern Detection

Sophisticated adversaries use coordinated tactics to evade individual-content moderation.

### Coordinated Inauthentic Behavior (CIB)

```
Detection Signals:
  Temporal clustering:
    - N accounts posting similar content within short window
    - Unusual posting frequency (bots post 24/7, humans don't)

  Behavioral correlation:
    - Accounts created at similar times
    - Similar device fingerprints / IP subnets
    - All accounts following the same seed accounts
    - Coordinated amplification: same content liked/shared by cluster

  Content similarity:
    - Near-duplicate text with minor variations (typos to avoid dedup)
    - Same image across many accounts (watermark removed)
    - Shared media hashes across disconnected accounts

Graph-based Detection:
  - Build interaction graph: nodes = accounts, edges = interactions
  - Detect dense subgraphs (cliques of coordinated accounts)
  - GNN (Graph Neural Network) for community detection at scale
  - Louvain algorithm for clustering in daily batch jobs
```

### Spam Network Detection

```
+------------------+      +------------------+      +------------------+
| Account Behavior |      | Content Patterns |      | Network Graph    |
| Analysis         |      | Analysis         |      | Analysis         |
|                  |      |                  |      |                  |
| - Post velocity  |      | - URL patterns   |      | - Follower graph |
| - Login patterns |      | - Text templates |      | - Interaction    |
| - Device changes |      | - Image reuse    |      |   clustering     |
+--------+---------+      +--------+---------+      +--------+---------+
         |                         |                         |
         +-------------+-----------+-----------+-------------+
                       |
                       v
               +-------+-------+
               | Ensemble      |
               | Spam Scorer   |
               +-------+-------+
                       |
                       v
          Spam Score > threshold → Account suspension
          Spam Score moderate    → Content suppression
          Spam Score low         → Watchlist + monitoring
```

### Ban Evasion Detection

```
When an account is banned, detect return via:

  Device fingerprinting:
    - Canvas fingerprint, WebGL fingerprint, audio context fingerprint
    - Browser extension signatures
    - Stored in encrypted device ID

  IP correlation:
    - IP address / /24 subnet flagged on ban
    - New accounts from same IP subnet → elevated scrutiny

  Behavioral fingerprinting:
    - Typing patterns, scroll behavior, mouse movement (bot vs. human)
    - Graph distance to banned account's social graph
    - Reuse of unique phrases, emoji patterns, writing style

  Velocity checks:
    - New account posting immediately without "new user" exploration behavior
    - Immediately following same accounts as banned account

Action on suspected evasion:
  - Shadow ban (content visible only to poster)
  - Require phone verification
  - Challenge with CAPTCHA
  - Manual review before any content is published
```

---

## Deep Dive: LLM-Powered Moderation

Large language models enable nuanced, context-aware moderation decisions that rule-based systems cannot make.

### LLM Use Cases in Moderation

```
1. GRAY ZONE CLASSIFICATION
   When ML confidence is in 0.4-0.8 range for hate speech:

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

2. POLICY INTERPRETATION FOR NOVEL CONTENT
   - New memes, cultural references not in training data
   - Cross-cultural context (gesture meaning varies by country)
   - Satire vs. genuine extremism

3. APPEAL LETTER ANALYSIS
   - Summarize appeal arguments for human reviewer
   - Compare appeal to similar historical cases
   - Flag if appeal reveals a genuine policy gap

4. TRANSPARENCY REPORT GENERATION
   - Summarize moderation stats into natural language
   - Identify trends and anomalies in removal patterns
```

### LLM Integration Architecture

```
+---------------------+
| Gray Zone Content   |
| (ML score 0.4-0.8)  |
+----------+----------+
           |
           v
+----------+----------+
| LLM Router          |
| - Rate limiting     |  Only 1-5% of content reaches LLM (cost control)
| - Cost tracking     |  ~$0.01-0.10 per LLM call
| - Model selection   |  Haiku for simple, Sonnet for complex, Opus for escalation
+----------+----------+
           |
           v
+----------+----------+
| Prompt Builder      |
| - Policy template   |
| - Few-shot examples |  Retrieved from policy example store (vector search)
| - Context assembly  |
+----------+----------+
           |
           v
+----------+----------+
| LLM Inference       |
| - Claude / GPT-4    |
| - Structured output |
| - JSON response     |
+----------+----------+
           |
           v
+----------+----------+
| Output Validator    |
| - Parse JSON        |
| - Validate fields   |
| - Sanity check      |
+----------+----------+
           |
           v
     Final Decision

Cost Control:
  500M posts/day × 1% LLM routing = 5M LLM calls/day
  Average cost $0.02/call = $100,000/day → LLM budget constraint
  Optimization: Cache identical/near-identical content LLM results (1h TTL)
```

### Few-Shot Prompt Management

```
Policy Example Store (Vector DB):
  - 10,000+ human-curated examples per violation category
  - Each example: {content, context, decision, reasoning, policy_section}
  - Retrieved by semantic similarity to incoming content
  - Updated weekly with new edge cases from human review

Few-Shot Retrieval:
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

## Deep Dive: Transparency and Moderator Well-being

### Transparency Reporting

```
Quarterly Transparency Report Metrics:
+-----------------------------------------------+--------+----------+
| Metric                                        | Q4 2025| Q1 2026  |
+-----------------------------------------------+--------+----------+
| Total content pieces evaluated                | 45B    | 47B      |
| Pieces removed                                | 45M    | 42M      |
| Removal rate                                  | 0.10%  | 0.089%   |
| Auto-removed (ML + hash)                      | 85%    | 87%      |
| Human-reviewed and removed                    | 15%    | 13%      |
| False positive rate (auto-remove)             | 0.08%  | 0.07%    |
| Appeals filed                                 | 2.1M   | 1.9M     |
| Appeals upheld (action overturned)            | 18%    | 16%      |
| CSAM removed + reported to NCMEC              | 1.2M   | 1.1M     |
| Terrorism content removed                     | 420K   | 380K     |
| Government removal requests                   | 55K    | 61K      |
| Government requests complied with             | 72%    | 70%      |
+-----------------------------------------------+--------+----------+
```

### Moderator Well-being System

```
Content Moderation is one of the most psychologically demanding jobs.
Exposure to graphic violence, CSAM, and extremism causes vicarious trauma.

Well-being Protections:
+----------------------------------+
| CONTENT EXPOSURE LIMITS          |
|                                  |
| Severe content (CSAM, violence): |
|   Max 2 hours/day                |
|   Mandatory break every 30 min   |
|   Mandatory rotation every 4h    |
|                                  |
| Moderate content:                |
|   Max 6 hours/day                |
|   Break every 2 hours            |
+----------------------------------+

+----------------------------------+
| RESILIENCE TOOLS                 |
|                                  |
| - Grayscale mode for images      |
|   (reduces emotional impact of   |
|    graphic content)              |
| - Blur + progressive reveal      |
|   (reviewer controls exposure)   |
| - Content warning headers        |
|   (before full content load)     |
| - "Skip" option for distressing  |
|   content (no penalty)           |
+----------------------------------+

+----------------------------------+
| PSYCHOLOGICAL SUPPORT            |
|                                  |
| - On-staff psychologists         |
| - Mandatory EAP (Employee        |
|   Assistance Program) access     |
| - Peer support network           |
| - Resilience training            |
| - Regular wellness check-ins     |
| - Anonymous mental health surveys|
+----------------------------------+

+----------------------------------+
| FAIR COMPENSATION                |
|                                  |
| - Hazard pay for severe content  |
| - Clear career advancement path  |
| - Performance not solely judged  |
|   by speed (quality matters)     |
+----------------------------------+
```

---

## Scaling Strategy

### Horizontal Scaling by Service

```
+------------------------+--------+----------------------------------+
| Service                | Scale  | Strategy                         |
+------------------------+--------+----------------------------------+
| Content Submit Service | 580K/s | Stateless, auto-scale on QPS     |
| Hash Matching Service  | 580K/s | Redis cluster + read replicas    |
| ML Text Classifier     | 300M/d | CPU pods, batch + streaming mode |
| ML Image Classifier    | 150M/d | GPU node pools (A100), queue     |
| ML Video Classifier    |  40M/d | GPU node pools, priority queue   |
| Human Review Queue     |  15M/d | PostgreSQL partitioned by date   |
| Report Service         | 116/s  | Stateless, rate-limited per user |
| Policy Engine          | 580K/s | In-memory rule evaluation        |
| Action Executor        | 580K/s | Idempotent, Kafka-backed         |
| Appeals Service        | 500K/d | Standard DB-backed service       |
+------------------------+--------+----------------------------------+
```

### Kafka Topic Design

```
Topics:
  content.submitted        (partitions: 200, retention: 7 days)
  content.hash_checked     (partitions: 200, retention: 3 days)
  content.ml_scored        (partitions: 200, retention: 3 days)
  content.decision_made    (partitions: 200, retention: 30 days)
  content.actioned         (partitions: 100, retention: 90 days)
  reports.received         (partitions: 50,  retention: 30 days)
  reports.triaged          (partitions: 50,  retention: 30 days)
  appeals.filed            (partitions: 20,  retention: 90 days)
  hashes.added             (partitions: 5,   retention: forever)
  policy.updated           (partitions: 5,   retention: forever)

Partitioning:
  Content topics: partition by content_id (even distribution)
  Report topics: partition by content_id (collocate report processing)
  Appeals topics: partition by appeal_id
```

### GPU Infrastructure for ML

```
ML GPU Cluster:

Image Classification (150M images/day):
  - Throughput needed: 150M / 86400s = 1736 images/second
  - Each A100 can process: ~500 images/second (batch size 64)
  - Required: 4 A100s (with 2× headroom = 8 A100s)
  - Spot instances for batch, on-demand for real-time SLA

Video Classification (40M videos/day × 60 frames avg):
  - Frame throughput: 40M × 60 / 86400 = 27,778 frames/second
  - Each A100: ~200 frames/second (larger model)
  - Required: 140 A100s (with 2× headroom = 280 A100s)
  - Queue-based processing with priority for pre-publish

Cost optimization:
  - Use smaller models (EfficientNet-B0 vs B4) for initial pass
  - Full model only for high-suspicion content
  - Batch processing during off-peak hours
  - Spot/preemptible VMs for non-time-sensitive batch
```

### Data Partitioning

```
Content Table: Partition by content_type + created_at (monthly)
  - partition_image_2026_01, partition_video_2026_01, etc.
  - Hot partitions (current month) on SSD
  - Cold partitions (older) on HDD / object storage

Moderation Jobs: Partition by created_at (daily)
  - Job history > 90 days → archive to ClickHouse for analytics
  - Active jobs always in PostgreSQL

Hash Database: Sharded by hash_value prefix
  - 16 shards (first hex character = shard key)
  - Each shard: ~60M hashes, ~2GB
  - All shards replicated 3× for durability

Review Queue: Partition by priority_score range + region
  - Critical (0-20): separate high-priority queue
  - Standard (20-80): main queue
  - Low (80-100): background queue
```

---

## Trade-offs

### False Positives vs. False Negatives

| Concern         | False Positives (Over-removal)   | False Negatives (Under-removal)      |
| --------------- | -------------------------------- | ------------------------------------ |
| Definition      | Legitimate content removed       | Harmful content remains up           |
| User impact     | Chilling effect on speech        | Harm to targets, platform trust      |
| Business impact | Creator exodus, press criticism  | Advertiser boycotts, legal liability |
| Measurement     | FPR = FP / (FP + TN)             | FNR = FN / (FN + TP)                 |
| Mitigation      | Lower auto-reject threshold      | Lower human review threshold         |
| Tension         | Tightening one loosens the other | —                                    |

**Decision: Optimize for low FPR on auto-reject (< 0.1%), accept higher human review volume**

### Automation vs. Human Review Tradeoff

| Dimension   | Full Automation      | Full Human Review   |
| ----------- | -------------------- | ------------------- |
| Speed       | Milliseconds         | Hours to days       |
| Cost        | $                    | $$$$$               |
| Accuracy    | Good for clear cases | Better for nuance   |
| Scalability | Unlimited            | 50K reviewers cap   |
| Bias        | ML model bias        | Human cultural bias |
| Consistency | Very consistent      | Variable            |

**Decision: 95%+ automated for clear cases, humans for gray zone; tiered by severity**

### Pre-publish vs. Post-publish

| Approach        | Pre-publish Screening      | Post-publish + Reactive   |
| --------------- | -------------------------- | ------------------------- |
| Safety          | Higher (prevents harm)     | Lower (harm may occur)    |
| Latency         | 30s delay before visible   | Immediate publish         |
| User experience | Frustrating for creators   | Better creator experience |
| Scale           | Must handle all traffic    | Only handle flagged       |
| Suitable for    | High-risk categories, CSAM | Low-risk content types    |

**Decision: Pre-publish for video/image (higher risk), post-publish for most text (lower risk)**

### Centralized vs. Federated Moderation

| Approach        | Centralized                    | Federated (community)  |
| --------------- | ------------------------------ | ---------------------- |
| Consistency     | Uniform standards globally     | Local norms respected  |
| Scale           | Needs large team               | Distributed effort     |
| Accountability  | Single point of responsibility | Diffuse accountability |
| Speed           | Slower (central bottleneck)    | Faster (local action)  |
| Abuse potential | Platform overreach             | Community harassment   |

**Decision: Centralized for illegal content (non-negotiable), federated for community standards (subreddits, groups)**

---

## Common Interview Follow-ups

**Q: How do you handle content that is legal in one country but illegal in another?**

Geo-based policy routing. Maintain a policy matrix: {violation_type × country_code → action}. When content is flagged, check creator's country and viewer's country. Apply the most restrictive applicable rule. Use IP geolocation for viewer-side blocking. Legal team maintains the matrix; updated per regulatory changes. Examples: Holocaust denial (illegal in Germany, legal in US), certain political content, LGBTQ+ content in countries criminalizing it.

**Q: How do you prevent your ML models from developing or encoding bias?**

Multi-pronged approach: (1) Diverse training data — audit for demographic representation in labeled datasets; (2) Fairness metrics — track false positive rates across demographic groups (race, gender, religion, political affiliation); set maximum allowed disparity ratio; (3) Red team exercises — adversarial testing by diverse teams; (4) External audit — annual third-party bias audit; (5) Bias bounty program — researchers report bias findings; (6) Policy transparency — publish what we moderate and why so bias can be externally spotted.

**Q: How would you design the system to handle a viral piece of harmful content spreading faster than moderation?**

Viral content circuit breaker: (1) Detect velocity anomaly: content receiving 10× expected engagement in first 10 minutes triggers high-priority flag; (2) Expedite ML: bump to front of ML queue within 30 seconds; (3) Suppress sharing while under review: temporarily disable "share" button while in expedited review; (4) Shadow remove: hide from non-original-poster feeds while reviewing; (5) Pre-position reviewers: on-call senior reviewer gets instant Slack alert; (6) Hash immediately: if removed, immediately compute and store hash so re-uploads are auto-blocked.

**Q: What is PhotoDNA and how does it work?**

PhotoDNA (developed by Microsoft, donated to National Center for Missing and Exploited Children) creates a "hash" of illegal images (primarily CSAM) using a robust hashing algorithm. Unlike SHA-256 (which changes completely with 1 pixel change), PhotoDNA's hash is stable across: resizing, color changes, minor crops, compression artifacts. Two images with the same PhotoDNA hash are the same image. NCMEC maintains the database. We submit our detected CSAM to NCMEC; they add to the hash database; all platforms using PhotoDNA then automatically block those images. We run PhotoDNA matching on every image upload as a non-negotiable step.

**Q: How do you handle appeals at scale — 500K appeals/day?**

Tiered automation: (1) Tier 0 (auto): Re-run ML + policy check — if scores changed (model updated) or policy changed since removal, auto-resolve; handles ~40% of appeals automatically; (2) Tier 1 (human): Simplified review interface, pre-summarized with ML confidence and policy citation, 200 reviews/hour throughput per reviewer; (3) Prioritization: High-reach creators (>1M followers) get 48h SLA; standard creators get 7-day SLA; (4) Batch similar cases: Group appeals on same content type + violation together for batch human review; (5) Quality feedback loop: Every overturned appeal sends signal to original reviewer's quality score.

**Q: How do you build a moderation system that works across 100+ languages?**

(1) Multilingual models: mBERT / XLM-RoBERTa for cross-lingual transfer learning — train on English-heavy data, fine-tune with translated examples for each language; (2) Language-specific models: Train dedicated models for top 20 languages where we have labeled data; (3) Machine translation fallback: Translate low-resource language content to English for scoring (adds latency but improves coverage); (4) Language-aware reviewers: Build a reviewer pool tagged with language certifications; route content to matching reviewers; (5) Policy localization: Hire local policy experts per region to adapt global policies to local context; (6) Community experts: Partner with local NGOs who understand cultural nuance.

**Q: What metrics would you use in your weekly operations review?**

Operational metrics: (1) Pre-publish latency P50/P95/P99 (target: P99 < 30s); (2) ML inference latency per classifier; (3) Hash matching latency; (4) Queue depth by priority tier + SLA breach rate; (5) Auto-action rate (trending up = better automation, trending down = model degradation). Quality metrics: (6) False positive rate (estimated from appeal overturn rate); (7) False negative rate (estimated from proactive vs. reactive discovery ratio); (8) Appeal overturn rate by violation category; (9) Reviewer inter-annotator agreement. Business metrics: (10) Content removal volume by category; (11) User appeals filed trend; (12) Moderator well-being scores (weekly survey); (13) Regulatory compliance: government requests fulfilled within deadline.
