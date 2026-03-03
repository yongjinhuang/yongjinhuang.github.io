# 设计在线教育平台 (Coursera / Udemy / Khan Academy)

在线教育平台使讲师能够创建和发布包含视频讲座、测验和作业的课程，同时学习者可以发现、注册并通过结构化的教育内容进行学习。系统必须在全球范围内提供低延迟视频传输，跟踪细粒度的学习进度，支持多种评估类型，并在完成后颁发可验证的证书。

## 目录

1. [需求澄清](#requirements-clarification)
2. [API 设计](#api-design)
3. [数据模型](#data-model)
4. [高层架构](#high-level-architecture)
5. [深入探讨：视频内容管道](#deep-dive-video-content-pipeline)
6. [深入探讨：进度跟踪](#deep-dive-progress-tracking)
7. [深入探讨：测验与评估引擎](#deep-dive-quiz--assessment-engine)
8. [深入探讨：证书生成](#deep-dive-certificate-generation)
9. [深入探讨：课程发现](#deep-dive-course-discovery)
10. [深入探讨：直播课堂](#deep-dive-live-classes)
11. [深入探讨：讲师分析](#deep-dive-instructor-analytics)
12. [深入探讨：离线访问](#deep-dive-offline-access)
13. [扩展策略](#scaling-strategy)
14. [部署架构](#deployment-architecture)
15. [常见面试追问](#common-interview-follow-ups)
16. [总结](#summary)

---

## 需求澄清

### 需要提出的澄清问题

- What types of content do instructors upload? (video, documents, code exercises, interactive labs)
- Do we need real-time live classes or only pre-recorded content?
- What assessment types are required? (MCQ, coding exercises, peer-reviewed essays, timed exams)
- Do we need offline access for mobile learners?
- How are instructors compensated? (revenue share, subscription model, per-course purchase)
- Do we issue verifiable certificates? Accredited degrees?
- What is the geographic distribution of learners? Do we need multi-language subtitles?
- Are there regulatory requirements (FERPA, GDPR, accessibility WCAG)?

### 功能需求

| # | Requirement | Description |
|---|-------------|-------------|
| 1 | Course Creation | Instructors create courses with sections, lessons (video/text/code), pricing, and metadata |
| 2 | Video Delivery | Upload, transcode, and stream video lectures with adaptive bitrate and subtitle support |
| 3 | Progress Tracking | Track video watch position, lesson completion, section completion, and overall course progress |
| 4 | Quizzes & Assignments | Support MCQ, coding exercises, essay submissions with auto and manual grading |
| 5 | Certificates | Generate verifiable completion certificates with unique codes |
| 6 | Enrollment | Browse, purchase/enroll, and manage course enrollments with payment processing |
| 7 | Reviews & Ratings | Learners rate and review courses; aggregate ratings displayed on course pages |
| 8 | Instructor Dashboard | Revenue analytics, engagement metrics, student progress overview, Q&A management |
| 9 | Search & Discovery | Full-text search, category browsing, personalized recommendations |
| 10 | Discussion Forums | Per-course Q&A threads, upvoting, instructor responses |
| 11 | Live Classes | Scheduled live video sessions with chat, screen sharing, and recording |
| 12 | Notifications | Enrollment confirmation, new content alerts, deadline reminders, certificate issued |

### 非功能需求

| # | Requirement | Target |
|---|-------------|--------|
| 1 | Video start latency | < 2 seconds globally (p95) |
| 2 | Video rebuffer ratio | < 0.5% of playback time |
| 3 | API response latency | < 200ms (p95) for reads, < 500ms for writes |
| 4 | Availability | 99.95% (< 4.4 hours downtime/year) |
| 5 | Progress sync latency | < 5 seconds (eventual consistency acceptable) |
| 6 | Search latency | < 150ms (p95) |
| 7 | Concurrent video streams | 2M simultaneous viewers at peak |
| 8 | Offline content | Download and view without network; sync on reconnect |
| 9 | Accessibility | WCAG 2.1 AA compliance (captions, screen reader, keyboard nav) |
| 10 | Data durability | Zero loss of enrollment, progress, or payment data |

### 规模估算

```
Users:
  Registered learners:           100M
  Monthly active learners:       20M
  Daily active learners:         5M
  Registered instructors:        500K
  Active instructors (monthly):  100K

Content:
  Total courses:                 500K
  Total video hours:             5M hours of content
  New courses/day:               500
  New video uploads/day:         10,000 lectures (~50,000 hours/month)

Engagement:
  Video views/day:               50M video play events
  Concurrent streams (peak):     2M simultaneous
  Enrollments/day:               1M
  Quiz submissions/day:          10M
  Certificate issuances/day:     200K
  Reviews submitted/day:         100K

Payments:
  Transactions/day:              500K purchases
  Revenue/day:                   ~$5M (avg $10/transaction)
```

### 粗略计算

**Video Storage:**
```
Existing library:      5M hours × 3 resolutions × avg 1.5 GB/hr = 22.5 PB
New uploads/month:     50,000 hrs × 3 resolutions × 1.5 GB/hr = 225 TB/month
Annual growth:         ~2.7 PB/year
Subtitle storage:      5M hours × 2 languages avg × 50 KB = 500 GB (negligible)
```

**Video Bandwidth:**
```
Concurrent streams:    2M peak
Average bitrate:       3 Mbps (720p adaptive)
Peak bandwidth:        2M × 3 Mbps = 6 Tbps
Daily egress:          50M plays × 15 min avg × 3 Mbps = 337 PB/month
CDN cost estimate:     ~$0.02/GB = ~$6.7M/month at scale
```

**API Throughput:**
```
Read QPS (catalog/progress):    50M views/day / 86400 = ~580 QPS avg, 3K peak
Write QPS (progress updates):   50M views × 5 progress pings/view = 250M/day
                                = ~2,900 writes/sec avg, ~15K peak
Enrollment writes:              1M/day = ~12/sec avg, ~100/sec peak
Quiz submissions:               10M/day = ~116/sec avg, ~600/sec peak
```

**Database Storage:**
```
Enrollment records:    100M users × 5 courses avg × 500 bytes = 250 GB
Progress records:      100M users × 5 courses × 20 lessons × 200 bytes = 2 TB
Quiz attempts:         10M/day × 365 × 2 KB = 7.3 TB/year
Reviews:               100K/day × 365 × 1 KB = 36.5 GB/year
Certificates:          200K/day × 365 × 1 KB = 73 GB/year
```

---

## API 设计

### 课程管理

```
POST /v1/courses
Authorization: Bearer <instructor_token>

Request:
{
  "title": "Machine Learning Fundamentals",
  "subtitle": "From linear regression to deep neural networks",
  "description": "A comprehensive introduction to ML...",
  "category_id": "cat_data_science",
  "subcategory_id": "subcat_ml",
  "tags": ["machine-learning", "python", "tensorflow"],
  "language": "en",
  "level": "intermediate",
  "pricing": {
    "type": "paid",
    "price_cents": 4999,
    "currency": "USD"
  },
  "requirements": ["Basic Python", "Linear Algebra"],
  "learning_objectives": [
    "Build and train neural networks",
    "Evaluate model performance",
    "Deploy ML models to production"
  ],
  "thumbnail_url": "https://cdn.example.com/uploads/thumb_abc.jpg"
}

Response 201:
{
  "course_id": "crs_ml_fund_001",
  "instructor_id": "inst_prof_smith",
  "status": "draft",
  "created_at": "2026-03-01T10:00:00Z",
  "edit_url": "/instructor/courses/crs_ml_fund_001/edit"
}
```

### 章节与课时管理

```
POST /v1/courses/{course_id}/sections
Authorization: Bearer <instructor_token>

Request:
{
  "title": "Neural Networks Basics",
  "description": "Introduction to neural network architecture",
  "order": 3
}

Response 201:
{
  "section_id": "sec_nn_basics",
  "course_id": "crs_ml_fund_001",
  "order": 3,
  "lesson_count": 0
}
```

```
POST /v1/courses/{course_id}/sections/{section_id}/lessons
Authorization: Bearer <instructor_token>

Request:
{
  "title": "Backpropagation Explained",
  "type": "video",
  "order": 2,
  "is_preview": false,
  "video_upload_id": "upload_vid_xyz789",
  "resources": [
    {
      "title": "Lecture Slides",
      "type": "pdf",
      "url": "https://cdn.example.com/resources/slides_backprop.pdf"
    }
  ]
}

Response 201:
{
  "lesson_id": "les_backprop_01",
  "section_id": "sec_nn_basics",
  "type": "video",
  "duration_seconds": 1245,
  "video_status": "transcoding",
  "order": 2
}
```

### 报名注册

```
POST /v1/enrollments
Authorization: Bearer <learner_token>

Request:
{
  "course_id": "crs_ml_fund_001",
  "payment_method_id": "pm_stripe_abc",
  "coupon_code": "LEARN2026",
  "idempotency_key": "idem_enroll_usr123_crs_ml_fund_001"
}

Response 201:
{
  "enrollment_id": "enr_abc123",
  "course_id": "crs_ml_fund_001",
  "learner_id": "usr_learner_456",
  "status": "active",
  "payment": {
    "amount_cents": 3999,
    "currency": "USD",
    "discount_applied": 1000,
    "transaction_id": "txn_stripe_xyz"
  },
  "enrolled_at": "2026-03-01T12:00:00Z",
  "access_expires_at": null
}
```

### 进度跟踪

```
PUT /v1/progress/{enrollment_id}/lessons/{lesson_id}
Authorization: Bearer <learner_token>

Request:
{
  "video_position_seconds": 742,
  "total_duration_seconds": 1245,
  "completed": false,
  "playback_speed": 1.5,
  "timestamp": "2026-03-01T14:30:00Z"
}

Response 200:
{
  "lesson_id": "les_backprop_01",
  "video_position_seconds": 742,
  "completion_percentage": 59.6,
  "completed": false,
  "section_progress": {
    "section_id": "sec_nn_basics",
    "completed_lessons": 1,
    "total_lessons": 5,
    "percentage": 20.0
  },
  "course_progress": {
    "completed_lessons": 8,
    "total_lessons": 42,
    "percentage": 19.0
  }
}
```

```
GET /v1/progress/{enrollment_id}
Authorization: Bearer <learner_token>

Response 200:
{
  "enrollment_id": "enr_abc123",
  "course_id": "crs_ml_fund_001",
  "overall_percentage": 19.0,
  "completed_lessons": 8,
  "total_lessons": 42,
  "total_watch_time_seconds": 18540,
  "current_streak_days": 5,
  "last_accessed_lesson": "les_backprop_01",
  "last_accessed_at": "2026-03-01T14:30:00Z",
  "sections": [
    {
      "section_id": "sec_intro",
      "title": "Introduction",
      "completed": true,
      "lessons": [
        {
          "lesson_id": "les_welcome",
          "title": "Welcome to the Course",
          "type": "video",
          "completed": true,
          "video_position_seconds": 300,
          "duration_seconds": 300
        }
      ]
    }
  ]
}
```

### 测验提交

```
POST /v1/quizzes/{quiz_id}/attempts
Authorization: Bearer <learner_token>

Request:
{
  "enrollment_id": "enr_abc123",
  "answers": [
    {
      "question_id": "q_001",
      "type": "mcq",
      "selected_option_ids": ["opt_b"]
    },
    {
      "question_id": "q_002",
      "type": "code",
      "code": "def sigmoid(x):\n    return 1 / (1 + math.exp(-x))",
      "language": "python"
    },
    {
      "question_id": "q_003",
      "type": "short_answer",
      "text": "Gradient descent minimizes the loss function by iteratively..."
    }
  ],
  "time_spent_seconds": 1800,
  "idempotency_key": "idem_quiz_attempt_usr123_q01_003"
}

Response 201:
{
  "attempt_id": "att_xyz789",
  "quiz_id": "quiz_nn_basics",
  "status": "graded",
  "score": 85.0,
  "passing_score": 70.0,
  "passed": true,
  "results": [
    {
      "question_id": "q_001",
      "correct": true,
      "points_earned": 10,
      "points_possible": 10,
      "explanation": "Option B is correct because..."
    },
    {
      "question_id": "q_002",
      "correct": true,
      "points_earned": 25,
      "points_possible": 25,
      "test_results": {
        "passed": 5,
        "failed": 0,
        "total": 5
      }
    },
    {
      "question_id": "q_003",
      "status": "pending_review",
      "points_earned": null,
      "points_possible": 15,
      "grading_eta_hours": 48
    }
  ],
  "attempt_number": 1,
  "max_attempts": 3,
  "submitted_at": "2026-03-01T15:00:00Z"
}
```

### 证书颁发

```
GET /v1/certificates/{certificate_id}

Response 200:
{
  "certificate_id": "cert_abc123",
  "verification_code": "VXKM-9F2A-PQ7L",
  "verification_url": "https://learn.example.com/verify/VXKM-9F2A-PQ7L",
  "learner_name": "Jane Smith",
  "course_title": "Machine Learning Fundamentals",
  "instructor_name": "Prof. John Smith",
  "issue_date": "2026-03-01",
  "completion_hours": 42,
  "final_grade": 92.5,
  "pdf_url": "https://cdn.example.com/certs/cert_abc123.pdf",
  "image_url": "https://cdn.example.com/certs/cert_abc123.png",
  "linkedin_share_url": "https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&...",
  "blockchain_tx_hash": "0xabc123..."
}
```

### 评价

```
POST /v1/courses/{course_id}/reviews
Authorization: Bearer <learner_token>

Request:
{
  "enrollment_id": "enr_abc123",
  "rating": 5,
  "title": "Excellent course for ML beginners",
  "body": "Professor Smith explains complex concepts clearly...",
  "completed_percentage_at_review": 100
}

Response 201:
{
  "review_id": "rev_abc123",
  "course_id": "crs_ml_fund_001",
  "status": "published",
  "helpful_count": 0,
  "created_at": "2026-03-01T16:00:00Z"
}
```

---

## 数据模型

### 核心模式

```sql
CREATE TABLE instructors (
    instructor_id       VARCHAR(36) PRIMARY KEY,
    user_id             VARCHAR(36) NOT NULL REFERENCES users(user_id),
    display_name        VARCHAR(200) NOT NULL,
    bio                 TEXT,
    profile_image_url   VARCHAR(500),
    expertise_areas     JSONB,
    payout_account_id   VARCHAR(100),
    verified            BOOLEAN DEFAULT FALSE,
    total_students      INTEGER DEFAULT 0,
    total_courses       INTEGER DEFAULT 0,
    average_rating      DECIMAL(3,2) DEFAULT 0.00,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE courses (
    course_id           VARCHAR(36) PRIMARY KEY,
    instructor_id       VARCHAR(36) NOT NULL REFERENCES instructors(instructor_id),
    title               VARCHAR(300) NOT NULL,
    subtitle            VARCHAR(500),
    description         TEXT,
    category_id         VARCHAR(36) NOT NULL,
    subcategory_id      VARCHAR(36),
    language            VARCHAR(10) NOT NULL DEFAULT 'en',
    level               VARCHAR(20) NOT NULL CHECK (level IN ('beginner','intermediate','advanced')),
    status              VARCHAR(20) NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','in_review','published','archived')),
    price_cents         INTEGER NOT NULL DEFAULT 0,
    currency            VARCHAR(3) NOT NULL DEFAULT 'USD',
    thumbnail_url       VARCHAR(500),
    promo_video_url     VARCHAR(500),
    total_duration_sec  INTEGER DEFAULT 0,
    total_lessons       INTEGER DEFAULT 0,
    total_enrollments   INTEGER DEFAULT 0,
    average_rating      DECIMAL(3,2) DEFAULT 0.00,
    total_reviews       INTEGER DEFAULT 0,
    requirements        JSONB,
    learning_objectives JSONB,
    tags                TEXT[],
    published_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_courses_category ON courses(category_id, status);
CREATE INDEX idx_courses_instructor ON courses(instructor_id);
CREATE INDEX idx_courses_published ON courses(published_at) WHERE status = 'published';

CREATE TABLE sections (
    section_id          VARCHAR(36) PRIMARY KEY,
    course_id           VARCHAR(36) NOT NULL REFERENCES courses(course_id),
    title               VARCHAR(300) NOT NULL,
    description         TEXT,
    order_index         INTEGER NOT NULL,
    total_duration_sec  INTEGER DEFAULT 0,
    lesson_count        INTEGER DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(course_id, order_index)
);

CREATE TABLE lessons (
    lesson_id           VARCHAR(36) PRIMARY KEY,
    section_id          VARCHAR(36) NOT NULL REFERENCES sections(section_id),
    course_id           VARCHAR(36) NOT NULL REFERENCES courses(course_id),
    title               VARCHAR(300) NOT NULL,
    type                VARCHAR(20) NOT NULL
                        CHECK (type IN ('video','article','quiz','coding_exercise','assignment')),
    order_index         INTEGER NOT NULL,
    is_preview          BOOLEAN DEFAULT FALSE,
    duration_seconds    INTEGER,
    video_asset_id      VARCHAR(36),
    article_content     TEXT,
    quiz_id             VARCHAR(36),
    resources           JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(section_id, order_index)
);
CREATE INDEX idx_lessons_course ON lessons(course_id);

CREATE TABLE video_assets (
    asset_id            VARCHAR(36) PRIMARY KEY,
    lesson_id           VARCHAR(36) REFERENCES lessons(lesson_id),
    original_filename   VARCHAR(500),
    original_size_bytes BIGINT,
    duration_seconds    INTEGER,
    status              VARCHAR(20) NOT NULL DEFAULT 'uploading'
                        CHECK (status IN ('uploading','transcoding','ready','failed')),
    storage_path        VARCHAR(500),
    hls_manifest_url    VARCHAR(500),
    dash_manifest_url   VARCHAR(500),
    renditions          JSONB,        -- [{resolution, bitrate, codec, url}]
    drm_key_id          VARCHAR(100),
    thumbnail_urls      JSONB,
    subtitles           JSONB,        -- [{language, url, auto_generated}]
    uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    transcoded_at       TIMESTAMPTZ
);

CREATE TABLE enrollments (
    enrollment_id       VARCHAR(36) PRIMARY KEY,
    learner_id          VARCHAR(36) NOT NULL,
    course_id           VARCHAR(36) NOT NULL REFERENCES courses(course_id),
    status              VARCHAR(20) NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','completed','refunded','expired')),
    payment_id          VARCHAR(36),
    price_paid_cents    INTEGER NOT NULL DEFAULT 0,
    currency            VARCHAR(3) NOT NULL DEFAULT 'USD',
    coupon_code         VARCHAR(50),
    progress_percentage DECIMAL(5,2) DEFAULT 0.00,
    enrolled_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at        TIMESTAMPTZ,
    last_accessed_at    TIMESTAMPTZ,
    access_expires_at   TIMESTAMPTZ,
    UNIQUE(learner_id, course_id)
);
CREATE INDEX idx_enrollments_learner ON enrollments(learner_id, status);
CREATE INDEX idx_enrollments_course ON enrollments(course_id);

CREATE TABLE lesson_progress (
    progress_id         VARCHAR(36) PRIMARY KEY,
    enrollment_id       VARCHAR(36) NOT NULL REFERENCES enrollments(enrollment_id),
    lesson_id           VARCHAR(36) NOT NULL REFERENCES lessons(lesson_id),
    video_position_sec  INTEGER DEFAULT 0,
    completed           BOOLEAN DEFAULT FALSE,
    completed_at        TIMESTAMPTZ,
    time_spent_seconds  INTEGER DEFAULT 0,
    playback_speed      DECIMAL(3,2) DEFAULT 1.00,
    last_accessed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(enrollment_id, lesson_id)
);
CREATE INDEX idx_progress_enrollment ON lesson_progress(enrollment_id);

CREATE TABLE quizzes (
    quiz_id             VARCHAR(36) PRIMARY KEY,
    course_id           VARCHAR(36) NOT NULL REFERENCES courses(course_id),
    lesson_id           VARCHAR(36) REFERENCES lessons(lesson_id),
    title               VARCHAR(300) NOT NULL,
    description         TEXT,
    passing_score       DECIMAL(5,2) NOT NULL DEFAULT 70.00,
    max_attempts        INTEGER DEFAULT 3,
    time_limit_seconds  INTEGER,
    shuffle_questions   BOOLEAN DEFAULT FALSE,
    shuffle_options     BOOLEAN DEFAULT FALSE,
    show_correct_after  BOOLEAN DEFAULT TRUE,
    question_count      INTEGER DEFAULT 0,
    total_points        DECIMAL(7,2) DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE quiz_questions (
    question_id         VARCHAR(36) PRIMARY KEY,
    quiz_id             VARCHAR(36) NOT NULL REFERENCES quizzes(quiz_id),
    type                VARCHAR(20) NOT NULL
                        CHECK (type IN ('mcq','multi_select','true_false','short_answer',
                                        'code','essay','fill_blank')),
    prompt              TEXT NOT NULL,
    options             JSONB,        -- [{id, text, is_correct}] for MCQ
    correct_answer      TEXT,         -- for short_answer / fill_blank
    code_template       TEXT,         -- starter code for coding questions
    test_cases          JSONB,        -- [{input, expected_output, hidden}]
    points              DECIMAL(5,2) NOT NULL DEFAULT 10.00,
    explanation         TEXT,
    order_index         INTEGER NOT NULL,
    tags                TEXT[],
    difficulty          VARCHAR(10) CHECK (difficulty IN ('easy','medium','hard'))
);
CREATE INDEX idx_questions_quiz ON quiz_questions(quiz_id);

CREATE TABLE quiz_attempts (
    attempt_id          VARCHAR(36) PRIMARY KEY,
    quiz_id             VARCHAR(36) NOT NULL REFERENCES quizzes(quiz_id),
    enrollment_id       VARCHAR(36) NOT NULL REFERENCES enrollments(enrollment_id),
    learner_id          VARCHAR(36) NOT NULL,
    attempt_number      INTEGER NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'in_progress'
                        CHECK (status IN ('in_progress','submitted','graded','expired')),
    answers             JSONB NOT NULL,
    score               DECIMAL(5,2),
    max_score           DECIMAL(5,2),
    passed              BOOLEAN,
    graded_results      JSONB,
    time_spent_seconds  INTEGER,
    started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    submitted_at        TIMESTAMPTZ,
    graded_at           TIMESTAMPTZ
);
CREATE INDEX idx_attempts_quiz_learner ON quiz_attempts(quiz_id, learner_id);
CREATE INDEX idx_attempts_enrollment ON quiz_attempts(enrollment_id);

CREATE TABLE certificates (
    certificate_id      VARCHAR(36) PRIMARY KEY,
    enrollment_id       VARCHAR(36) NOT NULL REFERENCES enrollments(enrollment_id),
    learner_id          VARCHAR(36) NOT NULL,
    course_id           VARCHAR(36) NOT NULL REFERENCES courses(course_id),
    instructor_id       VARCHAR(36) NOT NULL,
    verification_code   VARCHAR(20) NOT NULL UNIQUE,
    learner_name        VARCHAR(200) NOT NULL,
    course_title        VARCHAR(300) NOT NULL,
    instructor_name     VARCHAR(200) NOT NULL,
    final_grade         DECIMAL(5,2),
    completion_hours    INTEGER,
    pdf_url             VARCHAR(500),
    image_url           VARCHAR(500),
    blockchain_tx_hash  VARCHAR(100),
    issued_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_certificates_learner ON certificates(learner_id);
CREATE INDEX idx_certificates_verification ON certificates(verification_code);

CREATE TABLE reviews (
    review_id           VARCHAR(36) PRIMARY KEY,
    course_id           VARCHAR(36) NOT NULL REFERENCES courses(course_id),
    learner_id          VARCHAR(36) NOT NULL,
    enrollment_id       VARCHAR(36) NOT NULL REFERENCES enrollments(enrollment_id),
    rating              SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    title               VARCHAR(300),
    body                TEXT,
    completed_pct       DECIMAL(5,2),
    helpful_count       INTEGER DEFAULT 0,
    status              VARCHAR(20) DEFAULT 'published'
                        CHECK (status IN ('published','hidden','flagged')),
    instructor_reply    TEXT,
    replied_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(enrollment_id)
);
CREATE INDEX idx_reviews_course ON reviews(course_id, status);
```

### 实体关系图

```
  +--------------+       +---------------+       +----------------+
  |  instructors |──1:N──|    courses    |──1:N──|   sections     |
  +--------------+       +---------------+       +----------------+
                               │                       │
                               │ 1:N                   │ 1:N
                               ▼                       ▼
                         +---------------+       +----------------+
                         |   reviews     |       |    lessons     |
                         +---------------+       +----------------+
                               ▲                   │       │
                               │                   │       │ 1:1
                               │              1:1  │       ▼
  +--------------+       +---------------+    +----+---+ +--------+
  |   users      |──1:N──| enrollments  |    | quizzes| | video  |
  +--------------+       +---------------+    +--------+ | assets |
                               │                  │      +--------+
                               │ 1:N              │ 1:N
                               ▼                  ▼
                         +---------------+  +----------------+
                         |lesson_progress|  | quiz_attempts  |
                         +---------------+  +----------------+
                               │
                          (completion)
                               ▼
                         +---------------+
                         | certificates  |
                         +---------------+
```

---

## 高层架构

```
+-------------------+    +-------------------+    +---------------------+
|  Learner Web/App  |    | Instructor Portal |    |   Admin Dashboard   |
+--------+----------+    +--------+----------+    +----------+----------+
         |                        |                          |
         +------------------------+--------------------------+
                                  |
                          HTTPS / WebSocket
                                  |
                    +-------------v--------------+
                    |        API Gateway         |
                    |  (Auth, Rate Limit, Route, |
                    |   SSL Term, Geo-routing)   |
                    +-------------+--------------+
                                  |
     +----------+---------+-------+-------+---------+----------+
     |          |         |               |         |          |
+----v---+ +---v----+ +--v--------+ +----v----+ +--v------+ +-v--------+
| Course | | Video  | | Progress  | |  Quiz   | | Certif. | | Search & |
| Service| | Service| | Service   | | Engine  | | Service | | Recommend|
|        | |        | |           | |         | |         | |          |
| CRUD   | | Upload | | Track     | | Grade   | | Generate| | ES Index |
| Publish| | Trans- | | Video pos | | Code    | | Verify  | | Collab.  |
| Price  | | code   | | Complete  | | Execute | | PDF     | | Filter   |
| Review | | Stream | | Streaks   | | Bank    | | Chain   | | Personal.|
+---+----+ +---+----+ +----+------+ +----+----+ +----+----+ +----+-----+
    |          |            |             |           |            |
    |     +----v-------+    |             |           |            |
    |     | Transcode  |    |             |           |            |
    |     | Pipeline   |    |             |           |            |
    |     | (FFmpeg    |    |             |           |            |
    |     |  Workers)  |    |             |           |            |
    |     +----+-------+    |             |           |            |
    |          |            |             |           |            |
+---v----------v------------v-------------v-----------v------------v----+
|                          Event Bus (Kafka)                            |
|  Topics: course.published, video.transcoded, progress.updated,       |
|          quiz.graded, enrollment.created, certificate.issued,        |
|          review.submitted, payment.completed                         |
+---+------------+-------------+-------------+------------+-----------+
    |            |             |             |            |
+---v----+  +---v--------+ +--v--------+ +--v-------+ +-v---------+
| Notif. |  | Analytics  | | Payment   | | Live     | | Recommend |
| Service|  | Service    | | Service   | | Class    | | Engine    |
|        |  |            | |           | | Service  | |           |
| Email  |  | Instructor | | Stripe    | | WebRTC   | | CF + CBF  |
| Push   |  | Dashboards | | Revenue   | | Chat     | | ML Models |
| In-app |  | Engagement | | Payout    | | Record   | | User      |
+--------+  +------------+ +-----------+ +----------+ | Vectors   |
                                                       +-----------+

+--------------------+    +--------------------+    +------------------+
|  Primary DB        |    |  Cache Layer       |    |  Search Engine   |
|  (PostgreSQL)      |    |  (Redis Cluster)   |    |  (Elasticsearch) |
|                    |    |                    |    |                  |
|  - Courses         |    |  - Course metadata |    |  - Course index  |
|  - Enrollments     |    |  - Progress cache  |    |  - Full-text     |
|  - Quizzes         |    |  - Session tokens  |    |  - Faceted       |
|  - Certificates    |    |  - Leaderboards    |    |  - Autocomplete  |
+--------------------+    |  - Rate limits     |    +------------------+
                          +--------------------+
+--------------------+    +--------------------+
|  Object Storage    |    |  CDN (CloudFront)  |
|  (S3)              |    |                    |
|                    |    |  - Video HLS/DASH  |
|  - Raw uploads     |    |  - Thumbnails      |
|  - Transcoded video|    |  - Static assets   |
|  - Certificates    |    |  - Cert PDFs       |
|  - Subtitles       |    +--------------------+
+--------------------+
```

---

## 深入探讨：视频内容管道

### 上传流程

```
Instructor                API Gateway            Video Service          Object Storage
    |                         |                       |                       |
    |  1. Request upload URL  |                       |                       |
    |------------------------>|                       |                       |
    |                         |  2. Generate presigned|                       |
    |                         |------ URL ----------->|                       |
    |                         |                       |  3. Create presigned  |
    |                         |                       |       S3 PUT URL      |
    |                         |                       |---------------------->|
    |  4. Return presigned URL|                       |                       |
    |<------------------------|                       |                       |
    |                                                                         |
    |  5. Upload video directly to S3 (multipart)                            |
    |----------------------------------------------------------------------->|
    |                                                                         |
    |                         |  6. S3 Event triggers |                       |
    |                         |     Lambda/SNS        |                       |
    |                         |<----------------------|                       |
    |                         |                       |                       |
    |                         |  7. Enqueue transcode |                       |
    |                         |     job               |                       |
    |                         |---------------------->|                       |
```

### 转码管道

```python
# Transcoding job processor (pseudocode)
def process_transcode_job(job):
    asset = fetch_video_asset(job.asset_id)
    original_path = asset.storage_path

    # Define output renditions based on source resolution
    source_info = probe_video(original_path)
    renditions = compute_rendition_ladder(source_info)

    # Rendition ladder example:
    # [
    #   {"resolution": "1080p", "bitrate": "5000k", "codec": "h264"},
    #   {"resolution": "720p",  "bitrate": "2500k", "codec": "h264"},
    #   {"resolution": "480p",  "bitrate": "1000k", "codec": "h264"},
    #   {"resolution": "360p",  "bitrate": "600k",  "codec": "h264"},
    #   {"resolution": "1080p", "bitrate": "3500k", "codec": "h265"},  # HEVC for newer devices
    # ]

    transcoded_files = []
    for rendition in renditions:
        output_path = f"s3://video-transcoded/{asset.asset_id}/{rendition.tag}/"
        result = transcode_to_hls(
            input_path=original_path,
            output_path=output_path,
            resolution=rendition.resolution,
            bitrate=rendition.bitrate,
            codec=rendition.codec,
            segment_duration=6,         # 6-second HLS segments
            keyframe_interval=48        # keyframe every 2 seconds at 24fps
        )
        transcoded_files.append(result)

    # Generate master HLS manifest
    master_manifest = generate_master_playlist(transcoded_files)
    upload_manifest(master_manifest, f"s3://video-transcoded/{asset.asset_id}/master.m3u8")

    # Generate DASH manifest for wider compatibility
    dash_manifest = generate_dash_mpd(transcoded_files)
    upload_manifest(dash_manifest, f"s3://video-transcoded/{asset.asset_id}/manifest.mpd")

    # Extract thumbnails at regular intervals
    thumbnails = extract_thumbnails(original_path, interval_seconds=10)
    thumbnail_sprite = create_sprite_sheet(thumbnails)

    # Auto-generate subtitles via speech-to-text
    transcript = speech_to_text(original_path, language=asset.source_language)
    subtitle_vtt = format_as_webvtt(transcript)
    upload_subtitles(subtitle_vtt, asset.asset_id, language=asset.source_language)

    # Apply DRM encryption (Widevine + FairPlay)
    encrypt_content(
        asset_id=asset.asset_id,
        drm_providers=["widevine", "fairplay"],
        key_server_url="https://drm.example.com/keys"
    )

    # Update asset record
    update_video_asset(asset.asset_id, {
        "status": "ready",
        "hls_manifest_url": f"https://cdn.example.com/v/{asset.asset_id}/master.m3u8",
        "dash_manifest_url": f"https://cdn.example.com/v/{asset.asset_id}/manifest.mpd",
        "renditions": transcoded_files,
        "thumbnail_urls": thumbnail_sprite,
        "subtitles": [{"language": asset.source_language, "url": subtitle_vtt.url}],
        "transcoded_at": now()
    })

    publish_event("video.transcoded", {"asset_id": asset.asset_id})
```

### 自适应比特率流媒体

```
Master HLS Manifest (master.m3u8):

#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,CODECS="avc1.640028"
1080p/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720,CODECS="avc1.4d401f"
720p/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=854x480,CODECS="avc1.4d401e"
480p/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=600000,RESOLUTION=640x360,CODECS="avc1.42e01e"
360p/playlist.m3u8

Player behavior:
  1. Player downloads master manifest
  2. Measures current bandwidth (e.g., 4 Mbps)
  3. Selects highest rendition fitting in bandwidth budget (720p at 2.5 Mbps)
  4. Downloads 6-second segments sequentially
  5. Continuously re-estimates bandwidth
  6. Switches up/down between renditions seamlessly
  7. Buffer target: 30 seconds ahead (configurable)
```

### CDN 交付架构

```
                         +------- Origin Shield -------+
                         |    (Regional cache tier)     |
                         +-----+------------------+----+
                               |                  |
              +----------------v---+         +----v-----------------+
              |  CDN Edge PoP      |         |  CDN Edge PoP        |
              |  (North America)   |         |  (Asia-Pacific)      |
              |                    |         |                      |
              |  Cache HLS segments|         |  Cache HLS segments  |
              |  Cache manifests   |         |  Cache manifests     |
              |  TTL: 1 year       |         |  TTL: 1 year         |
              |  (immutable segs)  |         |  (immutable segs)    |
              +----+----------+----+         +----+----------+------+
                   |          |                   |          |
            +------v--+  +---v-----+       +-----v---+ +----v-----+
            | Learner | | Learner  |       | Learner | | Learner  |
            | (NYC)   | | (SF)     |       | (Tokyo) | | (Mumbai) |
            +---------+ +---------+       +---------+ +----------+

CDN caching strategy:
  - Video segments (*.ts): Cache-Control: public, max-age=31536000 (immutable)
  - Manifests (*.m3u8):    Cache-Control: public, max-age=5 (short TTL for updates)
  - Thumbnails:            Cache-Control: public, max-age=86400
  - Signed URLs:           Token-based auth with 4-hour expiry per session
  - DRM license requests:  Not cached, always hit license server
```

### 字幕与标题管道

```
                  +------------------+
                  |  Raw Video File  |
                  +--------+---------+
                           |
              +------------v-------------+
              |  Extract Audio Track     |
              |  (FFmpeg -vn -acodec pcm)|
              +-----------+--------------+
                          |
              +-----------v--------------+
              |  Speech-to-Text (ASR)    |
              |  Whisper / Google STT    |
              |  Output: timestamped     |
              |  word-level transcript   |
              +-----------+--------------+
                          |
              +-----------v--------------+
              |  Generate WebVTT         |
              |  Segment into lines      |
              |  (~42 chars, 2 lines max)|
              +-----------+--------------+
                          |
              +-----------v--------------+
              |  Machine Translation     |
              |  (Optional: to 10+ langs)|
              |  Preserve timestamps     |
              +-----------+--------------+
                          |
              +-----------v--------------+
              |  Human Review Queue      |
              |  (for popular courses)   |
              |  Fix ASR errors          |
              +-----------+--------------+
                          |
              +-----------v--------------+
              |  Store & Serve via CDN   |
              |  /v/{asset_id}/subs/     |
              |  en.vtt, zh.vtt, es.vtt  |
              +--------------------------+
```

---

## 深入探讨：进度跟踪

### 细粒度视频位置跟踪

```python
# Client-side progress reporting (pseudocode)
class VideoProgressTracker:
    def __init__(self, enrollment_id, lesson_id):
        self.enrollment_id = enrollment_id
        self.lesson_id = lesson_id
        self.last_reported_position = 0
        self.report_interval_sec = 15        # report every 15 seconds
        self.completion_threshold = 0.90     # 90% watched = completed
        self.watched_segments = IntervalSet() # track which segments were watched

    def on_time_update(self, current_position, duration):
        # Track watched intervals (handles seeking)
        self.watched_segments.add(
            current_position - self.report_interval_sec,
            current_position
        )

        # Report progress at intervals
        if current_position - self.last_reported_position >= self.report_interval_sec:
            watched_fraction = self.watched_segments.total_length() / duration
            self.report_progress(current_position, duration, watched_fraction)
            self.last_reported_position = current_position

    def report_progress(self, position, duration, watched_fraction):
        # Debounced API call
        api_call("PUT /v1/progress/{enrollment_id}/lessons/{lesson_id}", {
            "video_position_seconds": position,
            "total_duration_seconds": duration,
            "watched_fraction": watched_fraction,
            "completed": watched_fraction >= self.completion_threshold,
            "timestamp": now_iso()
        })

    def on_pause(self, current_position, duration):
        # Always report on pause (user may close tab)
        self.report_progress(current_position, duration,
                             self.watched_segments.total_length() / duration)

    def on_beforeunload(self, current_position, duration):
        # Use navigator.sendBeacon for reliable delivery on tab close
        send_beacon("/v1/progress/beacon", {
            "enrollment_id": self.enrollment_id,
            "lesson_id": self.lesson_id,
            "video_position_seconds": current_position,
            "timestamp": now_iso()
        })
```

### 服务端进度聚合

```python
# Progress update handler (pseudocode)
def handle_progress_update(enrollment_id, lesson_id, payload):
    # Upsert lesson progress (idempotent)
    lesson_progress = upsert_lesson_progress(
        enrollment_id=enrollment_id,
        lesson_id=lesson_id,
        video_position_sec=payload.video_position_seconds,
        completed=payload.completed,
        completed_at=now() if payload.completed else None,
        last_accessed_at=now()
    )

    if payload.completed and not lesson_progress.was_previously_completed:
        # Recalculate section progress
        section = get_section_for_lesson(lesson_id)
        completed_in_section = count_completed_lessons(enrollment_id, section.section_id)
        section_complete = (completed_in_section == section.lesson_count)

        # Recalculate course progress
        course = get_course_for_lesson(lesson_id)
        total_completed = count_completed_lessons_in_course(enrollment_id, course.course_id)
        course_progress_pct = (total_completed / course.total_lessons) * 100

        update_enrollment_progress(enrollment_id, course_progress_pct)

        # Check if course is fully completed
        if course_progress_pct >= 100.0:
            publish_event("course.completed", {
                "enrollment_id": enrollment_id,
                "course_id": course.course_id,
                "learner_id": payload.learner_id
            })

    # Update cache for fast reads
    cache_set(f"progress:{enrollment_id}:{lesson_id}", {
        "position": payload.video_position_seconds,
        "completed": payload.completed
    }, ttl=3600)

    # Update learning streak
    update_daily_streak(payload.learner_id)
```

### 续播

```
Resume playback flow:

1. Learner opens a lesson
2. Client requests: GET /v1/progress/{enrollment_id}/lessons/{lesson_id}
3. Server checks Redis cache first, falls back to DB
4. Returns last known position:
   {
     "video_position_seconds": 742,
     "completed": false,
     "last_accessed_at": "2026-03-01T14:30:00Z"
   }
5. Client seeks video player to position 742
6. Shows toast: "Resuming from where you left off"
7. If completed=true, plays from beginning (or offers choice)
```

### 学习连续打卡

```python
# Streak tracking with Redis sorted set (pseudocode)
def update_daily_streak(learner_id):
    today = date.today().isoformat()  # "2026-03-01"
    key = f"streak:active_days:{learner_id}"

    # Record today's activity
    redis.sadd(key, today)

    # Calculate current streak
    streak = 0
    check_date = date.today()
    while redis.sismember(key, check_date.isoformat()):
        streak += 1
        check_date = check_date - timedelta(days=1)

    # Update streak counter
    redis.hset(f"user:{learner_id}:stats", "current_streak", streak)

    # Update max streak if needed
    max_streak = int(redis.hget(f"user:{learner_id}:stats", "max_streak") or 0)
    if streak > max_streak:
        redis.hset(f"user:{learner_id}:stats", "max_streak", streak)

    # Streak milestone notifications
    if streak in [7, 30, 100, 365]:
        publish_event("streak.milestone", {
            "learner_id": learner_id,
            "streak_days": streak
        })
```

### 大规模进度数据模型

```
Write path (high volume):
  - 250M progress pings/day = ~2,900/sec avg, ~15K/sec peak
  - Use write-behind cache: buffer in Redis, flush to DB every 30 seconds
  - Partition lesson_progress by enrollment_id hash (16 shards)

Read path:
  - Resume playback: Redis cache hit (sub-ms), DB fallback (< 10ms)
  - Course progress dashboard: pre-aggregated in enrollment table
  - Instructor analytics: read from analytics replica

Storage optimization:
  - Only store latest position per lesson (not history)
  - Archive progress for completed+expired enrollments to cold storage after 2 years
  - Compress watched_segments intervals: store as bitmask (1 bit per 10-sec chunk)
```

---

## 深入探讨：测验与评估引擎

### 题目类型

```
+------------------+--------------------+---------------------------+
| Type             | Auto-Gradable?     | Storage Format            |
+------------------+--------------------+---------------------------+
| MCQ              | Yes                | options[] + correct_id    |
| Multi-select     | Yes                | options[] + correct_ids[] |
| True/False       | Yes                | correct_answer: bool      |
| Fill in blank    | Yes (fuzzy match)  | accepted_answers[]        |
| Short answer     | Yes (keyword/NLP)  | rubric + keywords[]       |
| Code exercise    | Yes (test cases)   | template + test_cases[]   |
| Essay            | No (manual/AI)     | rubric + grading_guide    |
| File upload      | No (manual)        | allowed_types + max_size  |
+------------------+--------------------+---------------------------+
```

### 自动评分管道

```python
# Quiz grading engine (pseudocode)
def grade_quiz_attempt(attempt):
    questions = fetch_questions(attempt.quiz_id)
    results = []
    total_score = 0
    max_score = 0

    for question in questions:
        answer = find_answer(attempt.answers, question.question_id)
        max_score += question.points

        if question.type == "mcq":
            correct = answer.selected_option_ids == [question.correct_option_id]
            score = question.points if correct else 0

        elif question.type == "multi_select":
            selected = set(answer.selected_option_ids)
            correct_set = set(question.correct_option_ids)
            # Partial credit: (correct selections - wrong selections) / total correct
            correct_selections = len(selected & correct_set)
            wrong_selections = len(selected - correct_set)
            partial = max(0, correct_selections - wrong_selections) / len(correct_set)
            score = round(question.points * partial, 2)
            correct = (selected == correct_set)

        elif question.type == "code":
            score, test_results = grade_code_submission(
                code=answer.code,
                language=answer.language,
                test_cases=question.test_cases,
                time_limit_ms=5000,
                memory_limit_mb=256
            )
            correct = all(t.passed for t in test_results)

        elif question.type == "essay":
            # Queue for manual grading or AI-assisted grading
            results.append({
                "question_id": question.question_id,
                "status": "pending_review",
                "points_earned": None,
                "points_possible": question.points
            })
            continue

        elif question.type == "short_answer":
            correct = fuzzy_match(
                answer.text,
                question.accepted_answers,
                threshold=0.85
            )
            score = question.points if correct else 0

        total_score += score
        results.append({
            "question_id": question.question_id,
            "correct": correct,
            "points_earned": score,
            "points_possible": question.points,
            "explanation": question.explanation if not correct else None
        })

    has_pending = any(r.get("status") == "pending_review" for r in results)
    passed = (total_score / max_score * 100) >= attempt.quiz.passing_score if not has_pending else None

    return {
        "attempt_id": attempt.attempt_id,
        "status": "graded" if not has_pending else "partially_graded",
        "score": round(total_score / max_score * 100, 2),
        "passed": passed,
        "results": results
    }
```

### 沙箱代码执行

```
Code execution architecture:

+------------------+    +-------------------+    +---------------------+
| Quiz Engine      |    | Code Executor     |    | Sandbox Container   |
| (submits code)   |    | Service           |    | (ephemeral)         |
+--------+---------+    +--------+----------+    +----------+----------+
         |                       |                          |
         | 1. Submit code        |                          |
         |  + test cases         |                          |
         +---------------------->|                          |
                                 | 2. Spin up sandboxed     |
                                 |    container (gVisor)    |
                                 +------------------------->|
                                 |                          |
                                 | 3. Write code to /tmp    |
                                 | 4. Execute with limits:  |
                                 |    - CPU: 2 cores        |
                                 |    - Memory: 256 MB      |
                                 |    - Time: 5 seconds     |
                                 |    - No network access   |
                                 |    - Read-only FS        |
                                 |                          |
                                 | 5. Run test cases        |
                                 |    stdin -> program      |
                                 |    stdout -> compare     |
                                 |<-------------------------+
                                 |                          |
                                 | 6. Destroy container     |
                                 +------------------------->|
         | 7. Return results     |
         |<----------------------+
         |

Supported languages:
  Python 3.11, Java 21, C++ 20, JavaScript (Node 22),
  Go 1.22, Rust 1.76, SQL (SQLite sandbox)

Security measures:
  - gVisor (application kernel) or Firecracker microVM
  - No network access inside sandbox
  - Resource limits enforced by cgroups
  - Process count limited (max 10)
  - Container destroyed after each execution (no state persistence)
  - Syscall allowlist (seccomp profile)
```

### 题库与随机化

```python
# Quiz generation with randomization (pseudocode)
def generate_quiz_instance(quiz_id, learner_id):
    quiz = fetch_quiz(quiz_id)
    all_questions = fetch_question_bank(quiz_id)

    if quiz.shuffle_questions:
        # Seed with learner_id for reproducible randomization per learner
        rng = Random(seed=hash(f"{quiz_id}:{learner_id}"))
        selected = rng.sample(all_questions, k=quiz.question_count)
        rng.shuffle(selected)
    else:
        selected = all_questions[:quiz.question_count]

    for question in selected:
        if quiz.shuffle_options and question.type in ("mcq", "multi_select"):
            rng.shuffle(question.options)

    return selected

# Plagiarism detection for essay/code submissions
def check_plagiarism(submission, enrollment_id):
    # Compare against other submissions for the same quiz
    other_submissions = fetch_submissions_for_quiz(
        quiz_id=submission.quiz_id,
        exclude_enrollment=enrollment_id
    )

    # Code similarity (AST comparison for code, n-gram for text)
    for other in other_submissions:
        similarity = compute_similarity(submission.content, other.content)
        if similarity > 0.85:
            flag_for_review(submission, other, similarity)
            break

    # Check against external sources (optional)
    external_matches = search_external_plagiarism_db(submission.content)
    if external_matches:
        flag_for_review(submission, external_matches[0], external_matches[0].score)
```

### 限时考试管理

```
Timed exam flow:

1. Learner clicks "Start Exam"
2. Server records start_time, calculates deadline = start_time + time_limit
3. Client receives exam questions + deadline timestamp
4. Client shows countdown timer (synced to server time via NTP)
5. Every 60 seconds, client sends heartbeat with current answers (auto-save)
6. On submit OR deadline reached:
   - Client sends final answers
   - Server validates: submitted_at <= deadline + 30s grace period
   - If past grace period, server uses last heartbeat answers
7. Server grades and records attempt

Anti-cheating measures:
  - Tab-switch detection (Page Visibility API) - logged, not blocked
  - Copy-paste disabled on exam content (optional per instructor)
  - Webcam proctoring integration (optional, via 3rd party)
  - IP address + device fingerprint logged
  - Random question order per student
  - Question pool larger than exam (draw subset)
  - Time-per-question analytics to detect anomalies
```

---

## 深入探讨：证书生成

### 完成验证

```python
# Certificate eligibility check (pseudocode)
def check_certificate_eligibility(enrollment_id):
    enrollment = fetch_enrollment(enrollment_id)
    course = fetch_course(enrollment.course_id)

    # 1. Verify all lessons completed
    completed_lessons = count_completed_lessons(enrollment_id, course.course_id)
    if completed_lessons < course.total_lessons:
        return {"eligible": False, "reason": "incomplete_lessons",
                "completed": completed_lessons, "required": course.total_lessons}

    # 2. Verify all required quizzes passed
    required_quizzes = fetch_required_quizzes(course.course_id)
    for quiz in required_quizzes:
        best_attempt = fetch_best_attempt(enrollment_id, quiz.quiz_id)
        if not best_attempt or not best_attempt.passed:
            return {"eligible": False, "reason": "quiz_not_passed",
                    "quiz_id": quiz.quiz_id, "quiz_title": quiz.title}

    # 3. Verify all required assignments submitted and graded
    required_assignments = fetch_required_assignments(course.course_id)
    for assignment in required_assignments:
        submission = fetch_submission(enrollment_id, assignment.assignment_id)
        if not submission or submission.status != "graded" or not submission.passed:
            return {"eligible": False, "reason": "assignment_incomplete",
                    "assignment_id": assignment.assignment_id}

    # 4. Calculate final grade
    final_grade = calculate_final_grade(enrollment_id, course.course_id)

    return {
        "eligible": True,
        "final_grade": final_grade,
        "completion_hours": calculate_total_hours(enrollment_id),
        "completed_at": now()
    }
```

### 证书渲染管道

```
+-------------------+     +--------------------+     +--------------------+
| Eligibility Check |---->| Template Engine    |---->| PDF Generator      |
| (verify all       |     | (select template,  |     | (Puppeteer/        |
|  requirements)    |     |  populate fields)  |     |  wkhtmltopdf)      |
+-------------------+     +--------------------+     +---------+----------+
                                                               |
                          +--------------------+               |
                          | Image Generator    |<--------------+
                          | (PNG for sharing)  |
                          +---------+----------+
                                    |
                          +---------v----------+
                          | Storage + CDN      |
                          | Upload PDF + PNG   |
                          | to S3 / CloudFront |
                          +--------------------+

模板字段：
  - 学习者全名
  - 课程标题
  - 讲师姓名 + 签名图片
  - 平台 logo
  - 颁发日期
  - 完成学时
  - 最终成绩（如适用）
  - 唯一验证码（XXXX-XXXX-XXXX 格式）
  - 链接到验证 URL 的二维码
  - 证书 ID
```

### 唯一验证码

```python
# Verification code generation (pseudocode)
import secrets
import string

def generate_verification_code():
    """Generate a unique, human-readable verification code.
    Format: XXXX-XXXX-XXXX (12 alphanumeric chars, no ambiguous characters)
    """
    # Exclude ambiguous characters: 0/O, 1/I/L
    alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"  # 30 chars
    # 12 characters from 30-char alphabet = 30^12 = ~531 trillion combinations
    code_chars = [secrets.choice(alphabet) for _ in range(12)]
    code = f"{''.join(code_chars[:4])}-{''.join(code_chars[4:8])}-{''.join(code_chars[8:12])}"

    # Verify uniqueness in database (collision probability is negligible but check)
    while certificate_exists_with_code(code):
        code_chars = [secrets.choice(alphabet) for _ in range(12)]
        code = f"{''.join(code_chars[:4])}-{''.join(code_chars[4:8])}-{''.join(code_chars[8:12])}"

    return code

# Public verification endpoint (no auth required)
# GET /verify/{verification_code}
def verify_certificate(verification_code):
    cert = fetch_certificate_by_code(verification_code)
    if not cert:
        return {"valid": False, "message": "Certificate not found"}

    return {
        "valid": True,
        "certificate_id": cert.certificate_id,
        "learner_name": cert.learner_name,
        "course_title": cert.course_title,
        "instructor_name": cert.instructor_name,
        "issued_at": cert.issued_at,
        "final_grade": cert.final_grade,
        "verification_url": f"https://learn.example.com/verify/{verification_code}"
    }
```

### 区块链锚定（可选）

```
区块链证书锚定流程：

1. 生成证书哈希：
   cert_hash = SHA-256(cert_id + learner_id + course_id + issued_at + final_grade)

2. 批量处理证书（每小时）：
   - 收集过去一小时内颁发的所有证书
   - 从证书哈希构建 Merkle 树
   - Merkle 根 = 代表所有证书的单个哈希

3. 锚定到区块链：
   - 将 Merkle 根写入 Ethereum/Polygon 智能合约
   - 交易成本：每批约 $0.01（分摊到数百个证书）
   - 将 tx_hash 存储在每个证书记录中

4. 验证：
   - 给定一个证书，计算其哈希
   - 从我们的数据库检索 Merkle 证明
   - 根据链上 Merkle 根验证证明
   - 证明证书在锚定时已存在
   - 防篡改：更改任何字段都会使证明无效

优势：
  - 去中心化验证（即使平台下线也能工作）
  - 防篡改（不能追溯修改证书数据）
  - 时间戳证明（区块链提供不可变的时间戳）

权衡：
  - 增加复杂性，仅对高价值凭证有意义
  - 大多数平台对基础课程证书跳过此功能
```

### LinkedIn 集成

```
LinkedIn 证书分享：

1. 证书页面包含"添加到 LinkedIn"按钮
2. 按钮 URL 格式：
   https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME
     &name={url_encoded_course_title}
     &organizationName={platform_name}
     &issueYear={year}
     &issueMonth={month}
     &certUrl={verification_url}
     &certId={verification_code}

3. LinkedIn 打开预填充的认证表单
4. 用户确认并添加到个人资料
5. 查看 LinkedIn 个人资料的任何人都可以点击验证 URL
6. 我们的平台返回实时验证结果
```

---

## 深入探讨：课程发现

### 搜索架构 (Elasticsearch)

```
Elasticsearch 索引映射：

PUT /courses
{
  "settings": {
    "number_of_shards": 5,
    "number_of_replicas": 2,
    "analysis": {
      "analyzer": {
        "course_analyzer": {
          "type": "custom",
          "tokenizer": "standard",
          "filter": ["lowercase", "stop", "snowball", "edge_ngram_filter"]
        }
      },
      "filter": {
        "edge_ngram_filter": {
          "type": "edge_ngram",
          "min_gram": 2,
          "max_gram": 20
        }
      }
    }
  },
  "mappings": {
    "properties": {
      "course_id":          { "type": "keyword" },
      "title":              { "type": "text", "analyzer": "course_analyzer",
                              "fields": { "exact": { "type": "keyword" } } },
      "subtitle":           { "type": "text", "analyzer": "course_analyzer" },
      "description":        { "type": "text" },
      "instructor_name":    { "type": "text",
                              "fields": { "exact": { "type": "keyword" } } },
      "category":           { "type": "keyword" },
      "subcategory":        { "type": "keyword" },
      "tags":               { "type": "keyword" },
      "language":           { "type": "keyword" },
      "level":              { "type": "keyword" },
      "price_cents":        { "type": "integer" },
      "average_rating":     { "type": "float" },
      "total_reviews":      { "type": "integer" },
      "total_enrollments":  { "type": "integer" },
      "total_duration_sec": { "type": "integer" },
      "total_lessons":      { "type": "integer" },
      "published_at":       { "type": "date" },
      "updated_at":         { "type": "date" },
      "popularity_score":   { "type": "float" },
      "learning_objectives":{ "type": "text" }
    }
  }
}
```

### 带排名的搜索查询

```python
# Search query construction (pseudocode)
def build_search_query(query, filters, page, page_size):
    es_query = {
        "query": {
            "bool": {
                "must": [
                    {
                        "multi_match": {
                            "query": query,
                            "fields": [
                                "title^5",          # title most important
                                "title.exact^10",   # exact title match bonus
                                "subtitle^3",
                                "tags^3",
                                "instructor_name^2",
                                "description^1",
                                "learning_objectives^2"
                            ],
                            "type": "best_fields",
                            "fuzziness": "AUTO"
                        }
                    }
                ],
                "filter": []
            }
        },
        "functions": [
            # Boost by popularity (log scale to prevent domination)
            {"field_value_factor": {
                "field": "popularity_score",
                "modifier": "log1p",
                "factor": 0.5
            }},
            # Boost by rating (only if sufficient reviews)
            {"script_score": {
                "script": "doc['total_reviews'].value > 10 ? doc['average_rating'].value * 2 : 5"
            }},
            # Recency boost (newer courses get slight boost)
            {"gauss": {
                "published_at": {
                    "origin": "now",
                    "scale": "180d",
                    "decay": 0.5
                }
            }}
        ],
        "score_mode": "sum",
        "boost_mode": "multiply"
    }

    # Apply filters
    if filters.get("category"):
        es_query["query"]["bool"]["filter"].append(
            {"term": {"category": filters["category"]}}
        )
    if filters.get("level"):
        es_query["query"]["bool"]["filter"].append(
            {"term": {"level": filters["level"]}}
        )
    if filters.get("price_range"):
        es_query["query"]["bool"]["filter"].append(
            {"range": {"price_cents": {
                "gte": filters["price_range"][0],
                "lte": filters["price_range"][1]
            }}}
        )
    if filters.get("language"):
        es_query["query"]["bool"]["filter"].append(
            {"term": {"language": filters["language"]}}
        )
    if filters.get("min_rating"):
        es_query["query"]["bool"]["filter"].append(
            {"range": {"average_rating": {"gte": filters["min_rating"]}}}
        )

    return es_query
```

### 推荐引擎

```
推荐架构：

+-------------------+     +--------------------+     +-------------------+
| User Activity     |     | Collaborative      |     | Content-Based     |
| Events (Kafka)    |---->| Filtering (CF)     |     | Filtering (CBF)   |
|                   |     |                    |     |                   |
| - enrollments     |     | User-User:         |     | Course features:  |
| - completions     |     |  Similar learners  |     |  - Category       |
| - searches        |     |  enrolled in X,    |     |  - Tags           |
| - views           |     |  also enrolled in Y|     |  - Level          |
| - ratings         |     |                    |     |  - Instructor     |
+-------------------+     | Item-Item:         |     |  - Description    |
                          |  Courses often     |     |    embeddings     |
                          |  enrolled together |     |                   |
                          +--------+-----------+     +--------+----------+
                                   |                          |
                          +--------v--------------------------v----------+
                          |            Hybrid Ranker                     |
                          |                                              |
                          |  score = w1 * cf_score                      |
                          |        + w2 * cbf_score                     |
                          |        + w3 * popularity_score              |
                          |        + w4 * recency_score                 |
                          |        + w5 * completion_probability        |
                          |                                              |
                          |  Personalization signals:                    |
                          |  - Learning history (completed topics)      |
                          |  - Skill gaps (started but not completed)   |
                          |  - Stated interests (onboarding survey)     |
                          |  - Career goal (if provided)               |
                          +---------------------+-----------------------+
                                                |
                          +---------------------v-----------------------+
                          |           Recommendation Cache              |
                          |  Redis: user:{id}:recommendations           |
                          |  TTL: 6 hours, refresh on new enrollment   |
                          +---------------------------------------------+

协同过滤实现：
  - 在用户-课程注册矩阵上进行矩阵分解 (ALS)
  - 用户嵌入（128 维）+ 课程嵌入（128 维）
  - 每天在 Spark 集群上重新训练
  - 近似最近邻 (FAISS/Annoy) 用于实时查找

基于内容的过滤：
  - 课程描述 → sentence-transformers 嵌入（384 维）
  - 分类 + 标签 + 级别 → one-hot 特征
  - 学习者个人向量与课程向量之间的余弦相似度
  - 个人向量 = 已注册课程向量的加权平均
```

### 个性化学习路径

```
学习路径生成：

1. 用户选择一个目标："成为数据科学家"
2. 系统将目标映射到技能图谱：

   +----------+     +-----------+     +------------------+
   | Python   |---->| Statistics|---->| Machine Learning |
   | Basics   |     | & Prob.   |     | Fundamentals     |
   +----------+     +-----------+     +--------+---------+
                                               |
                         +---------------------+-----+
                         |                           |
                  +------v-------+           +-------v--------+
                  | Deep Learning|           | Data Viz &     |
                  | with PyTorch |           | Communication  |
                  +--------------+           +----------------+

3. 对于技能图谱中的每个节点：
   - 推荐与该技能匹配的最高评分课程
   - 如果学习者已完成同等课程则跳过
   - 估算时间：课程时长之和

4. 输出个性化学习路径：
   {
     "goal": "Data Scientist",
     "estimated_hours": 180,
     "steps": [
       {"skill": "Python", "course_id": "crs_py101", "status": "completed"},
       {"skill": "Statistics", "course_id": "crs_stats201", "status": "in_progress"},
       {"skill": "ML Fundamentals", "course_id": "crs_ml_fund_001", "status": "locked"},
       ...
     ]
   }
```

---

## 深入探讨：直播课堂

### 实时视频架构

```
+----------------+     +------------------+     +------------------+
|  Instructor    |     |  Signaling       |     |  Learners        |
|  (broadcaster) |     |  Server (WS)     |     |  (viewers)       |
+-------+--------+     +--------+---------+     +--------+---------+
        |                       |                         |
        | 1. Create session     |                         |
        +---------------------->|                         |
        |                       |                         |
        | 2. SDP offer          |                         |
        +---------------------->|                         |
        |                       | 3. Relay offer          |
        |                       +------------------------>|
        |                       |                         |
        |                       | 4. SDP answer           |
        |                       |<------------------------+
        | 5. Relay answer       |                         |
        |<----------------------+                         |
        |                       |                         |
        | 6. ICE candidates     |                         |
        |<--------------------->|<----------------------->|
        |                       |                         |
        |  7. Media flows via SFU (Selective Forwarding Unit)
        |                       |                         |
+-------v-----------------------v-------------------------v--------+
|                     SFU (mediasoup / Janus)                      |
|                                                                   |
|  Instructor stream → SFU → fan-out to N learners                |
|  - Simulcast: instructor sends 3 quality layers                  |
|  - SFU selects appropriate layer per viewer bandwidth            |
|  - No transcoding at SFU (low CPU, high scalability)            |
|                                                                   |
|  For > 500 viewers: SFU cascading                                |
|  - Primary SFU receives instructor stream                        |
|  - Secondary SFUs pull from primary                              |
|  - Each secondary serves ~500 viewers                            |
+------------------------------------------------------------------+

直播课堂扩展：
  < 50 名参与者：      单个 SFU，完整 WebRTC（亚秒级延迟）
  50-500 名参与者：    SFU 配合 simulcast，观众仅接收
  500-10K 名参与者：   级联 SFU，RTMP 采集 + 低延迟 HLS 回退
  > 10K 名参与者：     RTMP 采集 → 实时转码 → 通过 CDN 的 LL-HLS（约 3-5 秒延迟）
```

### 直播聊天与互动

```
直播课堂功能：

+---------------------+     +-------------------+     +--------------------+
| Chat Service        |     | Q&A Service       |     | Poll Service       |
| (WebSocket)         |     |                   |     |                    |
| - Real-time messages|     | - Submit question |     | - Instructor       |
| - Emoji reactions   |     | - Upvote          |     |   creates poll     |
| - Rate limiting     |     | - Instructor pins |     | - Learners vote    |
|   (5 msg/10 sec)   |     | - Answer live     |     | - Real-time results|
| - Moderation filter |     | - Sort by votes   |     | - Timed auto-close |
+---------------------+     +-------------------+     +--------------------+

聊天消息流程：
  1. 学习者通过 WebSocket 发送消息
  2. 服务器验证（速率限制、内容过滤）
  3. 通过 Redis Pub/Sub 广播给所有连接的客户端
  4. 持久化到时间序列存储（用于回放）
  5. 超过 24 小时的消息归档到冷存储

屏幕共享：
  - 使用 WebRTC getDisplayMedia() API
  - 讲师将屏幕共享为额外的视频轨道
  - SFU 将屏幕共享轨道转发给所有观看者
  - 观看者看到屏幕 + 讲师摄像头（画中画）
```

### 录制与回放

```
录制管道：

1. SFU 录制讲师的媒体流（音频 + 视频 + 屏幕共享）
2. 合成录制：
   - 将摄像头 + 屏幕共享合并为单个视频
   - 布局：屏幕共享（80%）+ 摄像头画中画（20%）
   - 聊天覆盖层（可选，带时间戳）
3. 后处理：
   - 转码为标准版本（1080p、720p、480p）
   - 生成 HLS 清单
   - 自动生成字幕（与预录内容相同的 ASR 管道）
4. 作为课程中的常规课时发布
5. 错过直播的学习者可以观看录制内容

录制存储：
  - 原始录制：约 2 GB/小时 (1080p)
  - 转码后（3 个版本）：约 4.5 GB/小时
  - 保留期：永久（成为课程内容）
```

### 计划与出勤

```python
# Live session scheduling (pseudocode)
def schedule_live_session(course_id, instructor_id, session_data):
    session = create_live_session({
        "session_id": generate_id(),
        "course_id": course_id,
        "instructor_id": instructor_id,
        "title": session_data.title,
        "scheduled_start": session_data.start_time,
        "scheduled_end": session_data.end_time,
        "timezone": session_data.timezone,
        "max_participants": session_data.max_participants or 500,
        "status": "scheduled"
    })

    # Schedule notifications
    enrolled_learners = fetch_enrolled_learners(course_id)
    for learner in enrolled_learners:
        schedule_notification(learner.learner_id, {
            "type": "live_session_scheduled",
            "session_id": session.session_id,
            "send_at": session_data.start_time - timedelta(hours=24)
        })
        schedule_notification(learner.learner_id, {
            "type": "live_session_reminder",
            "session_id": session.session_id,
            "send_at": session_data.start_time - timedelta(minutes=15)
        })

    # Add to calendar feed
    update_course_calendar(course_id, session)

    return session

# Attendance tracking
def track_attendance(session_id, learner_id, event_type):
    # event_type: "joined", "left", "rejoined"
    log_attendance_event(session_id, learner_id, event_type, now())

    if event_type == "joined":
        increment_active_participants(session_id)
    elif event_type == "left":
        decrement_active_participants(session_id)

# Post-session: compute attendance summary
def compute_attendance_summary(session_id):
    events = fetch_attendance_events(session_id)
    session = fetch_session(session_id)
    total_duration = (session.actual_end - session.actual_start).total_seconds()

    attendance = {}
    for learner_id, learner_events in group_by_learner(events):
        present_seconds = compute_present_time(learner_events)
        attendance[learner_id] = {
            "present_seconds": present_seconds,
            "present_percentage": (present_seconds / total_duration) * 100,
            "attended": (present_seconds / total_duration) >= 0.75  # 75% threshold
        }

    return attendance
```

---

## 深入探讨：讲师分析

### 收入仪表盘

```
讲师收入数据模型：

+--------------------+     +---------------------+     +--------------------+
| Enrollments        |     | Revenue Events      |     | Payouts            |
| (source of truth)  |---->| (calculated)        |---->| (monthly)          |
+--------------------+     +---------------------+     +--------------------+

收入计算：
  Gross revenue       = sum(price_paid) for all enrollments in period
  Platform fee        = gross_revenue * platform_rate (e.g., 37% for Udemy organic)
  Instructor share    = gross_revenue - platform_fee
  Refund deductions   = sum(refunded_amount) in period
  Net instructor rev  = instructor_share - refund_deductions
  Tax withholding     = net_revenue * tax_rate (varies by country)
  Payout amount       = net_revenue - tax_withholding

仪表板查询：
  - 按课程的收入（最近 30/90/365 天）
  - 收入趋势（每日/每周/每月图表）
  - 按国家的收入（地理分布）
  - 按推荐来源的收入（自然流量、付费广告、联盟）
  - 每门课程的退款率
  - 优惠券使用和折扣影响
  - 终身收入
```

### 参与度指标

```
关键讲师指标：

+--------------------------+-------------------------------------------+
| 指标                     | 计算方式                                  |
+--------------------------+-------------------------------------------+
| 注册率                   | enrollments / course_page_views           |
| 完成率                   | completed_enrollments / total_enrollments |
| 平均观看时长             | total_watch_seconds / total_enrollments   |
| 按课时的流失率           | 完成第 N 课但未完成第 N+1 课的百分比      |
| 测验通过率               | passed_attempts / total_attempts          |
| 平均测验分数             | sum(scores) / count(attempts)             |
| 评价情感分析             | 评价文本的 NLP 情感分数                   |
| 回复时间（问答）         | 讲师回复问题的平均时间                    |
| 学生满意度               | 按近期加权的平均评分                      |
| 重复注册率               | 注册 2+ 门课程的学习者                    |
+--------------------------+-------------------------------------------+

流失分析（对讲师至关重要）：

课时 #       观看人数    流失率 %      累计 %
   1          10,000       -             100%
   2           8,500      15%             85%
   3           7,800       8%             78%
   4           7,600       3%             76%
   5           5,200      32%   <-- 红色警报：需要调查这节课
   6           5,000       4%             50%
   ...

操作：讲师看到第 5 课有异常流失。
可能原因：太难、太长、音频质量差、内容无聊。
平台建议："第 5 课有 32% 的流失率。考虑将其拆分为
更短的片段或添加互动练习。"
```

### A/B 测试课程内容

```python
# Course content A/B testing (pseudocode)
def create_content_experiment(course_id, instructor_id, experiment):
    """
    Example: Test two different lesson orders, or two promo videos.
    """
    exp = {
        "experiment_id": generate_id(),
        "course_id": course_id,
        "type": experiment.type,          # "promo_video", "lesson_order", "pricing"
        "variants": [
            {"variant_id": "A", "config": experiment.variant_a},
            {"variant_id": "B", "config": experiment.variant_b}
        ],
        "traffic_split": [50, 50],
        "primary_metric": experiment.metric,  # "enrollment_rate", "completion_rate"
        "min_sample_size": 1000,
        "status": "running",
        "started_at": now()
    }

    return exp

def assign_variant(experiment_id, learner_id):
    """Deterministic assignment based on hash for consistency."""
    hash_input = f"{experiment_id}:{learner_id}"
    bucket = hash(hash_input) % 100
    if bucket < 50:
        return "A"
    else:
        return "B"

def evaluate_experiment(experiment_id):
    """Check if experiment has reached statistical significance."""
    exp = fetch_experiment(experiment_id)
    results_a = fetch_variant_results(experiment_id, "A")
    results_b = fetch_variant_results(experiment_id, "B")

    # Chi-squared test for conversion rates
    chi2, p_value = chi_squared_test(
        [results_a.conversions, results_a.total - results_a.conversions],
        [results_b.conversions, results_b.total - results_b.conversions]
    )

    significant = p_value < 0.05 and min(results_a.total, results_b.total) >= exp.min_sample_size

    return {
        "variant_a": {"rate": results_a.conversions / results_a.total, "n": results_a.total},
        "variant_b": {"rate": results_b.conversions / results_b.total, "n": results_b.total},
        "p_value": p_value,
        "significant": significant,
        "winner": "A" if results_a.rate > results_b.rate else "B" if significant else None
    }
```

---

## 深入探讨：离线访问

### 内容下载架构

```
+------------------+     +-------------------+     +--------------------+
| Download Manager |     | DRM License       |     | Sync Manager       |
| (Mobile Client)  |     | Server            |     | (Client)           |
+--------+---------+     +---------+---------+     +---------+----------+
         |                         |                         |
         | 1. Request download     |                         |
         |   manifest for course   |                         |
         +------------------------>|                         |
         |                         |                         |
         | 2. Return manifest:     |                         |
         |   - Video segment URLs  |                         |
         |   - Subtitle URLs       |                         |
         |   - Resource URLs       |                         |
         |   - DRM offline license |                         |
         |<------------------------+                         |
         |                         |                         |
         | 3. Download in background                         |
         |   (prioritize next unwatched lesson)              |
         |                         |                         |
         | 4. Store encrypted on device                      |
         |   (AES-256, DRM-protected)                        |
         |                         |                         |
         |                    (device goes offline)          |
         |                         |                         |
         | 5. Play offline using                             |
         |   cached DRM license                              |
         |   (license valid 30 days)                         |
         |                         |                         |
         |                    (device comes online)          |
         |                         |                         |
         | 6. Sync progress        |                         |
         +-------------------------------------------------->|
         |                         |  7. Merge progress      |
         |                         |     (last-write-wins    |
         |                         |      per lesson)        |
         |                         |<------------------------+
```

### 离线内容 DRM

```
离线 DRM 策略：

1. 许可证获取（在线时）：
   - 客户端请求课程的离线许可证
   - DRM 服务器颁发带有约束条件的许可证：
     {
       "license_type": "offline",
       "valid_for_days": 30,
       "max_plays": "unlimited",
       "hdcp_required": false,
       "resolution_cap": "720p",    // cap offline quality to save storage
       "renewal_url": "https://drm.example.com/renew"
     }

2. 内容加密：
   - 视频使用 AES-128 CTR 模式加密
   - 每个版本有唯一的内容密钥
   - 密钥存储在设备安全区域（iOS Keychain / Android Keystore）

3. 播放：
   - 播放器从本地许可证存储请求解密密钥
   - 如果许可证有效 → 解密并播放
   - 如果许可证过期 → 提示上线并续期

4. 许可证续期：
   - 当设备上线时，自动续期许可证
   - 如果注册仍然有效 → 再续 30 天
   - 如果注册过期/退款 → 撤销许可证，删除内容

平台特定的 DRM：
  iOS：     FairPlay Streaming（离线 HLS）
  Android： Widevine L1/L3（离线 DASH）
  Web：     不支持离线（或带有限缓存的 PWA）
```

### 重新连接时的进度同步

```python
# Offline progress sync (pseudocode)
class OfflineProgressSync:
    def __init__(self):
        self.local_db = SQLiteDatabase("progress.db")  # device local storage

    def record_progress_offline(self, enrollment_id, lesson_id, position, completed):
        """Store progress locally when offline."""
        self.local_db.upsert("lesson_progress", {
            "enrollment_id": enrollment_id,
            "lesson_id": lesson_id,
            "video_position_sec": position,
            "completed": completed,
            "updated_at": now_iso(),
            "synced": False
        })

    def sync_when_online(self):
        """Batch sync all unsynced progress to server."""
        unsynced = self.local_db.query(
            "SELECT * FROM lesson_progress WHERE synced = FALSE"
        )

        if not unsynced:
            return

        # Batch API call
        response = api_call("POST /v1/progress/batch-sync", {
            "updates": [
                {
                    "enrollment_id": row.enrollment_id,
                    "lesson_id": row.lesson_id,
                    "video_position_sec": row.video_position_sec,
                    "completed": row.completed,
                    "client_timestamp": row.updated_at
                }
                for row in unsynced
            ]
        })

        # Server-side merge: last-write-wins based on client_timestamp
        # Mark synced locally
        for result in response.results:
            if result.status == "accepted":
                self.local_db.update("lesson_progress",
                    {"synced": True},
                    where={"lesson_id": result.lesson_id}
                )

    def get_storage_usage(self):
        """Report device storage used by downloaded content."""
        total_bytes = sum(
            file.size for file in self.local_db.query(
                "SELECT size FROM downloaded_content"
            )
        )
        return {
            "total_bytes": total_bytes,
            "total_gb": round(total_bytes / (1024**3), 2),
            "by_course": self.local_db.query(
                "SELECT course_id, SUM(size) as bytes "
                "FROM downloaded_content GROUP BY course_id"
            )
        }
```

### 存储管理

```
移动端存储管理：

设置：
  - 最大存储分配：可配置（默认 5 GB）
  - 下载质量：低（360p，约 150 MB/小时）、中（480p，约 400 MB/小时）、
                高（720p，约 1 GB/小时）
  - 自动下载：接下来 3 节未观看的课（仅在 WiFi 下）
  - 自动清理：7 天后删除已完成的课时

智能下载优先级：
  1. 当前已注册、正在积极学习的课程
  2. 每个活跃课程中下一节未观看的课
  3. 可下载的资源（PDF、幻灯片）
  4. 字幕文件（很小，始终下载）

存储空间不足警告：
  当设备存储 < 1 GB 时：
  - 暂停自动下载
  - 建议清理已完成的内容
  - 显示每门课程的存储使用详情，并提供删除选项

每门课程的预估存储：
  10-hour course at 480p ≈ 4 GB video + 50 MB resources
  10-hour course at 360p ≈ 1.5 GB video + 50 MB resources
```

---

## 扩展策略

### CDN 全球交付

```
CDN 拓扑：

                        +------ Origin (S3) ------+
                        |  Video segments          |
                        |  HLS/DASH manifests      |
                        |  Static assets           |
                        +-----------+--------------+
                                    |
                     +--------------+--------------+
                     |                             |
              +------v-------+             +-------v------+
              | Origin Shield|             | Origin Shield|
              | (US-East)    |             | (EU-West)    |
              +------+-------+             +-------+------+
                     |                             |
         +-----------+----------+       +----------+----------+
         |           |          |       |          |          |
    +----v--+  +----v---+ +----v--+ +--v----+ +---v---+ +---v---+
    | PoP   |  | PoP    | | PoP   | | PoP   | | PoP   | | PoP   |
    | US-E  |  | US-W   | | SA    | | EU-W  | | AP-SE | | AP-NE |
    +-------+  +--------+ +-------+ +-------+ +-------+ +-------+
     ~200ms     ~180ms      ~250ms    ~150ms    ~200ms    ~180ms
     to origin  to origin   to origin to origin to origin to origin

缓存命中率目标：
  视频片段：         > 95%（不可变内容，长 TTL）
  清单：             > 80%（短 TTL，频繁访问）
  课程缩略图：       > 99%（小文件，非常频繁访问）
  总体：             > 90%

缓存预热：
  - 当热门课程上线时，预热边缘缓存
  - 主动将前 3 节课推送到所有 PoP
  - 基于注册激增模式使用预测性预热
```

### 数据库分片策略

```
分片计划：

+------------------------+---------------------+---------------------------+
| 表                     | 分片键              | 策略                      |
+------------------------+---------------------+---------------------------+
| courses                | 无需分片            | 单主节点 + 副本           |
|                        |                     | （50 万行，轻松容纳）     |
+------------------------+---------------------+---------------------------+
| enrollments            | learner_id          | 基于哈希，16 个分片       |
|                        |                     | （5 亿行，持续增长）      |
+------------------------+---------------------+---------------------------+
| lesson_progress        | enrollment_id       | 基于哈希，32 个分片       |
|                        |                     | （100 亿+行，写入密集）   |
+------------------------+---------------------+---------------------------+
| quiz_attempts          | enrollment_id       | 基于哈希，16 个分片       |
|                        |                     | （与进度数据共置）        |
+------------------------+---------------------+---------------------------+
| reviews                | course_id           | 基于哈希，8 个分片        |
|                        |                     | （按课程读取）            |
+------------------------+---------------------+---------------------------+
| certificates           | 无需分片            | 单主节点 + 副本           |
|                        |                     | （每年 7300 万行，读取正常）|
+------------------------+---------------------+---------------------------+

跨分片查询处理：
  - "获取学习者的所有注册"：单个分片（按 learner_id 分片）
  - "获取课程的所有注册"：在所有分片上散射-收集
    → 通过分析数据库 (ClickHouse) 中的物化视图来缓解
  - "获取注册的进度"：单个分片（共置）
```

### 处理报名高峰（课程发布）

```
课程上线流量模式：

      Enrollments/min
           |
    2000   |              *
           |            *   *
    1500   |          *       *
           |        *           *
    1000   |      *               *
           |    *                   *
     500   |  *                       *    *    *    *
           |*                               *    *
         --+--+--+--+--+--+--+--+--+--+--+--+--+--+--> time
           0  5  10 15 20 25 30 35 40 45 50 55 60 min
              ^
              课程上线公告

扩展措施：
  1. 预扩展：讲师公布上线日期 →
     API 服务器自动扩展 2 倍，预热 CDN 缓存
  2. 注册队列：在峰值期间，注册请求进入
     Kafka 队列 → 异步处理 → 通过推送发送确认
  3. 支付处理：使用 Stripe 的幂等键来处理
     负载高峰期间的安全重试
  4. 课程页面缓存：Redis 缓存课程元数据，TTL 60 秒
     （目录的过期读取是可接受的）
  5. 速率限制：每用户每分钟 10 次注册（防止机器人）
  6. 视频预热：在上线前将第一节课推送到 CDN 边缘
```

### 缓存策略

```
缓存层架构：

+---------------------------+----------+--------+-----------------------------+
| 数据                      | 存储     | TTL    | 失效策略                    |
+---------------------------+----------+--------+-----------------------------+
| 课程元数据                | Redis    | 5 分钟 | 事件：course.updated        |
| 课程目录页面              | CDN      | 60 秒  | 发布时清除                  |
| 课时视频清单              | CDN      | 5 秒   | URL 中的版本号              |
| 视频片段                  | CDN      | 1 年   | 不可变（唯一 URL）          |
| 用户会话                  | Redis    | 30 分钟| 滑动过期                    |
| 注册状态                  | Redis    | 10 分钟| 事件：enrollment.created    |
| 进度（每课时）            | Redis    | 1 小时 | 更新时写透                  |
| 搜索结果                  | Redis    | 2 分钟 | 重新索引时驱逐              |
| 推荐                      | Redis    | 6 小时 | 新注册时刷新                |
| 讲师分析                  | Redis    | 15 分钟| 按需刷新                    |
| 测验题目（每测验）        | Redis    | 1 小时 | 事件：quiz.updated          |
| 排行榜                    | Redis    | 5 分钟 | Sorted set, ZINCRBY         |
+---------------------------+----------+--------+-----------------------------+

进度的写后模式：
  1. 客户端发送进度更新
  2. 立即写入 Redis（快速响应）
  3. 后台 worker 每 30 秒将 Redis 刷新到 PostgreSQL
  4. 如果 Redis 崩溃，最多丢失 30 秒的进度数据（可接受）
  5. 读取时：Redis 缓存命中 → 返回；未命中 → 从数据库读取 → 填充缓存
```

---

## 部署架构

```
+------------------------------------------------------------------------+
|                         Cloud Provider (AWS)                            |
|                                                                        |
|  +---------------------------+    +----------------------------------+ |
|  |    Region: US-East-1      |    |    Region: EU-West-1             | |
|  |                           |    |                                  | |
|  |  +---------------------+  |    |  +---------------------+        | |
|  |  | ALB (Application    |  |    |  | ALB                 |        | |
|  |  | Load Balancer)      |  |    |  +----------+----------+        | |
|  |  +----------+----------+  |    |             |                    | |
|  |             |              |    |  +----------v----------+        | |
|  |  +----------v----------+  |    |  | EKS Cluster         |        | |
|  |  | EKS Cluster         |  |    |  | (read replicas of   |        | |
|  |  | (Kubernetes)        |  |    |  |  all services)      |        | |
|  |  |                     |  |    |  +---------------------+        | |
|  |  | +------+ +--------+ |  |    |                                  | |
|  |  | |Course| |Video   | |  |    |  +---------------------+        | |
|  |  | |Svc   | |Svc     | |  |    |  | RDS Read Replica    |        | |
|  |  | +------+ +--------+ |  |    |  +---------------------+        | |
|  |  | +------+ +--------+ |  |    +----------------------------------+ |
|  |  | |Progr.| |Quiz    | |  |                                        |
|  |  | |Svc   | |Engine  | |  |    +----------------------------------+ |
|  |  | +------+ +--------+ |  |    |    Region: AP-Southeast-1       | |
|  |  | +------+ +--------+ |  |    |                                  | |
|  |  | |Cert  | |Search  | |  |    |  (same pattern as EU)            | |
|  |  | |Svc   | |Svc     | |  |    +----------------------------------+ |
|  |  | +------+ +--------+ |  |                                        |
|  |  | +------+ +--------+ |  |                                        |
|  |  | |Notif.| |Recomm. | |  |    +----------------------------------+ |
|  |  | |Svc   | |Engine  | |  |    |  Shared Services                 | |
|  |  | +------+ +--------+ |  |    |                                  | |
|  |  +---------------------+  |    |  +-------------+ +-------------+ | |
|  |                           |    |  | CloudFront  | | Route 53    | | |
|  |  +---------------------+  |    |  | (CDN)       | | (DNS +      | | |
|  |  | Data Layer          |  |    |  | 200+ PoPs   | |  latency    | | |
|  |  |                     |  |    |  +-------------+ |  routing)   | | |
|  |  | +------+ +--------+ |  |    |                  +-------------+ | |
|  |  | | RDS  | | Redis  | |  |    |  +-------------+ +-------------+ | |
|  |  | | (PG) | |Cluster | |  |    |  | S3          | | SES/SNS     | | |
|  |  | |Primary| |       | |  |    |  | (Video +    | | (Email +    | | |
|  |  | +------+ +--------+ |  |    |  |  Assets)    | |  Push)      | | |
|  |  | +------+ +--------+ |  |    |  +-------------+ +-------------+ | |
|  |  | | ES   | | Kafka  | |  |    |                                  | |
|  |  | |Cluster| |Cluster | |  |    |  +-------------+               | |
|  |  | +------+ +--------+ |  |    |  | MediaConvert|               | |
|  |  +---------------------+  |    |  | (Transcoding|               | |
|  +---------------------------+    |  |  Pipeline)  |               | |
|                                   |  +-------------+               | |
|                                   +----------------------------------+ |
+------------------------------------------------------------------------+

CI/CD Pipeline:
  GitHub → GitHub Actions → Build Docker images → ECR →
  ArgoCD (GitOps) → EKS rolling deployment

Monitoring:
  - Prometheus + Grafana (metrics)
  - ELK Stack (logs)
  - Jaeger (distributed tracing)
  - PagerDuty (alerting)
  - Custom dashboards: video start time, buffer ratio, enrollment funnel
```

---

## 常见面试追问

**问：如何处理视频盗版和防止未经授权的屏幕录制？**

Multi-layered approach: (1) DRM encryption (Widevine/FairPlay) prevents direct download of raw video files; (2) Forensic watermarking: embed an invisible, unique watermark per user session (learner_id + timestamp encoded into video frames using spread-spectrum technique). If a pirated copy surfaces, extract the watermark to identify the source account. (3) Token-based URL signing: video segment URLs expire after 4 hours and are tied to the user's session. (4) Concurrent stream limits: max 2 simultaneous streams per account. (5) HDCP enforcement on desktop for premium content. (6) Disable right-click and devtools detection (minor deterrent, not a real barrier). 权衡： aggressive DRM hurts legitimate users (compatibility issues), so apply strict DRM only to premium/paid content, not free preview content.

**问：如何设计系统以支持带有实时反馈的编程练习？**

两层架构：(1) 客户端执行用于简单练习：使用 WebAssembly 编译的语言运行时（Pyodide 用于 Python，QuickJS 用于 JavaScript），完全在浏览器中运行。零延迟，无服务器成本，处理 80% 的初级练习。(2) 服务端执行用于复杂练习：使用沙箱容器方法（gVisor/Firecracker）。每种语言预热一个容器池（50 个预热的 Python 容器，30 个预热的 Java 容器）。学习者代码通过 WebSocket 提交以获得亚秒级反馈。测试用例按顺序运行；在第一次失败时停止以快速反馈。对于数据库练习：启动带有预加载 schema 的临时 SQLite/PostgreSQL 实例。容器池根据队列深度自动扩展。成本：每次代码执行约 $0.001。

**问：如何处理 190 多个国家/地区不同货币和税务法规的讲师支付？**

使用 Stripe Connect 或 PayPal for Marketplaces 等支付处理器作为基础。(1) 每个讲师通过 Stripe Connect 进行身份验证 (KYC) 入驻。(2) 每笔交易计算收入分成：平台根据推荐来源（自然流量 vs. 讲师驱动）收取 30-50%。(3) 月度支付周期：汇总收入，扣除退款（30 天退款窗口），扣留适用税款（非美国的 W-8BEN，美国讲师的 1099）。(4) 货币处理：所有交易以美元存储；在支付时使用市场汇率转换为讲师当地货币。(5) 最低支付门槛：50 美元以减少交易成本。(6) 税务合规：生成年度税务文件（美国的 1099-MISC，当地等效文件）。(7) 欺诈检测：在支付前标记可疑的注册模式（自我注册、虚假账户）。

**问：如何大规模实现同行评审作业？**

结构化同行评审工作流程：(1) 学习者提交作业。(2) 系统从完成相同作业的学习者中随机分配 3 名同行评审员（确保能力）。(3) 评审员收到匿名提交 + 带有具体标准的评分标准（每个标准 1-5 分）。(4) 截止时间：7 天完成评审。(5) 校准：在评审同行之前，每个评审员对讲师预评分的"金标准"提交进行评分。如果他们的评分与讲师的评分偏差超过 20%，则展示讲师的推理进行校准。(6) 最终分数：3 个同行评分的中位数（对异常值稳健）。如果评审员之间的方差较高（标准差 > 1.5），则升级到讲师或助教。(7) 激励：评审同行计入课程进度（解锁证书的必要条件）。(8) 反馈质量：收到评审后，学习者对评审的有用性进行评分。持续获得高评价的评审员在未来作业队列中获得优先权。

**问：如何确保视频内容对残障学习者是无障碍的？**

跨四个支柱实现 WCAG 2.1 AA 合规：(1) 字幕：通过 ASR (Whisper) 自动生成，然后对前 100 门课程进行人工审核。支持隐藏字幕（可切换）和开放字幕（内嵌）。字幕准确度目标：人工审核 98% 以上，自动生成 90% 以上。(2) 音频描述：对于视觉密集内容（图表、代码演练），提供描述屏幕内容的补充音轨。(3) 键盘导航：所有播放器控件可通过键盘访问。Tab 顺序遵循逻辑序列。可见的焦点指示器。(4) 屏幕阅读器支持：所有交互元素上的 ARIA 标签。课程结构以语义 HTML 标题公开。通过 aria-live 区域进行进度公告。(5) 可调节播放：速度控制（0.5x 到 2x），字幕字体大小控制，高对比度字幕背景。(6) 文字记录：每个视频旁边都有可搜索的完整文字记录，与播放同步。(7) 色彩对比度：所有 UI 元素满足最低 4.5:1 的对比度。

**问：如何处理拥有 100 万学生的热门讲师突然删除账户的场景？**

这需要谨慎的策略和技术方法：(1) 带宽限期的软删除：讲师账户被停用而非删除。90 天宽限期内可以重新激活账户。(2) 内容保留：所有已发布的课程对已注册学习者无限期可访问（这在服务条款中有规定）。所有权转移给平台。(3) 新注册：宽限期后禁止讲师课程的新注册。(4) 证书：所有先前颁发的证书保持有效和可验证。(5) 收入：处理截至停用日期的所有已赚收入的最终支付。(6) 数据删除：90 天后，根据 GDPR/隐私要求删除讲师的个人数据，但保留匿名化的课程内容。(7) 沟通：通过电子邮件通知所有已注册的学习者讲师已离开。分配一个"社区助教"或将问答标记为"原讲师不再支持"。(8) 预防：大型讲师配备专属合作伙伴经理，监控账户健康信号（登录频率下降、支持工单升级）。

**问：如何设计系统以支持多种定价模式（一次性购买、订阅、企业许可）？**

灵活的定价引擎：(1) 一次性购买：最简单的模式。学习者支付一次，获得课程的终身访问权。存储为单个注册记录，`access_expires_at = NULL`。(2) 订阅（Coursera Plus 模式）：按月/年付费以访问课程目录。注册记录的 `access_expires_at` 绑定到订阅结束日期。订阅服务通过 Stripe 定期计费管理续期。取消后，学习者在期限结束前保留访问权，然后注册转为"过期"。(3) 企业许可（B2B）：公司为员工购买席位许可证。用于许可证管理的管理门户。SCORM/LTI 集成用于企业 LMS。使用报告和合规追踪。SSO 集成（SAML/OIDC）。(4) 免费增值：一些课程是免费的（`price_paid_cents = 0` 的注册），其他需要付费。免费课程作为付费课程的漏斗。(5) 实现：注册时由定价服务解析价格，评估：课程基础价格、活跃优惠券、用户的订阅状态、企业协议、促销活动。单个注册表处理所有模式；`payment_type` 字段进行区分。

**问：您会跟踪哪些平台健康和业务 KPI 指标？**

平台健康：(1) 每个 CDN 区域的视频启动时间 P50/P95/P99（目标：P95 < 2 秒）。(2) 重缓冲比率（目标：< 0.5%）。(3) 每个端点的 API 延迟 P50/P95/P99。(4) 每个服务的错误率 (5xx)（目标：< 0.1%）。(5) 进度同步成功率（目标：> 99.9%）。(6) 搜索延迟和零结果率。(7) 转码管道积压（目标：从上传到就绪 < 30 分钟）。业务 KPI：(8) 月活跃学习者 (MAL) 和 DAL/MAL 比率（粘性）。(9) 注册转化率（访客 -> 已注册）。(10) 课程完成率（总体和按类别）。(11) 课后调查的净推荐值 (NPS)。(12) 学习者终身价值 (LTV) 和客户获取成本 (CAC)。(13) 讲师供给：每月新课程数、讲师流失率。(14) 收入：GMV、净收入、每位学习者收入、订阅续期率。(15) 内容质量：平均课程评分趋势、每门课程退款率。

---

## 总结

### 关键架构决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 视频存储 | S3 + CDN (CloudFront) | PB 级别成本效益高，全球分发 |
| 视频流 | HLS + DASH 自适应码率 | 通用设备支持，带宽自适应 |
| DRM | Widevine + FairPlay | 覆盖 Android/Chrome + iOS/Safari |
| 主数据库 | PostgreSQL（分片） | 注册/支付的 ACID，JSON 支持 |
| 进度写入 | Redis 写后 → PostgreSQL | 以最终一致性处理 15K 次写入/秒 |
| 搜索 | Elasticsearch | 全文 + 分面过滤 + 自动补全 |
| 事件总线 | Kafka | 服务解耦，用于分析的事件溯源 |
| 代码执行 | gVisor 沙箱容器 | 安全隔离，多语言支持 |
| 推荐 | 混合 CF + CBF | 结合社交信号和内容相似度 |
| 证书 | PDF + PNG + 区块链锚定 | 可分享、可验证、防篡改 |
| 直播课堂 | WebRTC (SFU) + LL-HLS 回退 | 小组低延迟，大规模 CDN 扩展 |
| 离线 | 加密下载 + DRM 许可证 | 带有时间限制许可证的安全离线观看 |

### 关键权衡

| 权衡 | 选项 A | 选项 B | 决策 |
|------|--------|--------|------|
| 视频延迟 vs. 成本 | 专用流媒体服务器（低延迟） | CDN + HLS（较高延迟，较低成本） | CDN + HLS。2-3 秒启动时间对教育场景可接受。CDN 规模化后的成本节省显著。 |
| 进度一致性 | 同步数据库写入（强一致性） | Redis 写后（最终一致性） | 写后模式。丢失 30 秒进度数据是可接受的。同步处理 15K 次写入/秒成本很高。 |
| 代码执行安全性 | 每次执行完整 VM（最大隔离） | gVisor 容器（良好隔离，较低开销） | gVisor。启动速度比完整 VM 快 10 倍。安全性对教育代码执行足够。 |
| 评分方式 | 全部自动评分（可扩展，即时） | 可用人工评分（准确，慢） | 混合方式。自动评分选择题/代码，人工评分论述题。AI 辅助的简答评分减少人工负担。 |
| 推荐新鲜度 | 实时更新（计算成本高） | 每日批量计算（过时但便宜） | 每日批量 + 注册时事件触发刷新。推荐不需要秒级新鲜度。 |
| 离线 DRM 严格度 | 严格 DRM，不允许下载 | 带 30 天许可证的加密离线 | 加密离线。新兴市场的移动学习者需要离线访问。30 天许可证平衡了安全性和可用性。 |
| 直播课堂架构 | 纯 WebRTC（低延迟，有限规模） | RTMP + CDN（高延迟，无限规模） | 分层。< 500 名参与者使用 WebRTC，更大受众使用 RTMP + LL-HLS。大多数直播课堂是小规模的。 |
| 字幕生成 | 仅人工（高准确度，慢，昂贵） | ASR 自动生成（快速，更便宜，准确度较低） | 自动生成 + 热门课程人工审核。ASR 准确度（Whisper）对大多数内容足够。前 100 门课程进行人工审核。 |
