# Design an E-Learning Platform (Coursera / Udemy / Khan Academy)

An e-learning platform enables instructors to create and publish courses with video lectures, quizzes, and assignments, while learners discover, enroll in, and progress through structured educational content. The system must deliver low-latency video globally, track granular learning progress, support diverse assessment types, and issue verifiable certificates upon completion.

## Table of Contents

1. [Requirements Clarification](#requirements-clarification)
2. [API Design](#api-design)
3. [Data Model](#data-model)
4. [High-Level Architecture](#high-level-architecture)
5. [Deep Dive: Video Content Pipeline](#deep-dive-video-content-pipeline)
6. [Deep Dive: Progress Tracking](#deep-dive-progress-tracking)
7. [Deep Dive: Quiz & Assessment Engine](#deep-dive-quiz--assessment-engine)
8. [Deep Dive: Certificate Generation](#deep-dive-certificate-generation)
9. [Deep Dive: Course Discovery](#deep-dive-course-discovery)
10. [Deep Dive: Live Classes](#deep-dive-live-classes)
11. [Deep Dive: Instructor Analytics](#deep-dive-instructor-analytics)
12. [Deep Dive: Offline Access](#deep-dive-offline-access)
13. [Scaling Strategy](#scaling-strategy)
14. [Deployment Architecture](#deployment-architecture)
15. [Common Interview Follow-ups](#common-interview-follow-ups)
16. [Summary](#summary)

---

## Requirements Clarification

### Clarifying Questions to Ask

- What types of content do instructors upload? (video, documents, code exercises, interactive labs)
- Do we need real-time live classes or only pre-recorded content?
- What assessment types are required? (MCQ, coding exercises, peer-reviewed essays, timed exams)
- Do we need offline access for mobile learners?
- How are instructors compensated? (revenue share, subscription model, per-course purchase)
- Do we issue verifiable certificates? Accredited degrees?
- What is the geographic distribution of learners? Do we need multi-language subtitles?
- Are there regulatory requirements (FERPA, GDPR, accessibility WCAG)?

### Functional Requirements

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

### Non-Functional Requirements

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

### Scale Estimation

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

### Back-of-Envelope Calculations

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

## API Design

### Course Management

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

### Section & Lesson Management

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

### Enrollment

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

### Progress Tracking

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

### Quiz Submission

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

### Certificate Issuance

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

### Reviews

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

## Data Model

### Core Schema

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

### Entity Relationship Diagram

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

## High-Level Architecture

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

## Deep Dive: Video Content Pipeline

### Upload Flow

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

### Transcoding Pipeline

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

### Adaptive Bitrate Streaming

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

### CDN Delivery Architecture

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

### Subtitle & Caption Pipeline

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

## Deep Dive: Progress Tracking

### Granular Video Position Tracking

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

### Server-Side Progress Aggregation

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

### Resume Playback

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

### Learning Streaks

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

### Progress Data Model at Scale

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

## Deep Dive: Quiz & Assessment Engine

### Question Types

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

### Auto-Grading Pipeline

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

### Sandboxed Code Execution

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

### Question Bank & Randomization

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

### Timed Exam Management

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

## Deep Dive: Certificate Generation

### Completion Verification

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

### Certificate Rendering Pipeline

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

Template fields:
  - Learner full name
  - Course title
  - Instructor name + signature image
  - Platform logo
  - Issue date
  - Completion hours
  - Final grade (if applicable)
  - Unique verification code (XXXX-XXXX-XXXX format)
  - QR code linking to verification URL
  - Certificate ID
```

### Unique Verification Codes

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

### Blockchain Anchoring (Optional)

```
Blockchain certificate anchoring flow:

1. Generate certificate hash:
   cert_hash = SHA-256(cert_id + learner_id + course_id + issued_at + final_grade)

2. Batch certificates (hourly):
   - Collect all certificates issued in the past hour
   - Build Merkle tree from certificate hashes
   - Merkle root = single hash representing all certificates

3. Anchor to blockchain:
   - Write Merkle root to Ethereum/Polygon smart contract
   - Transaction cost: ~$0.01 per batch (amortized across 100s of certs)
   - Store tx_hash in each certificate record

4. Verification:
   - Given a certificate, compute its hash
   - Retrieve Merkle proof from our database
   - Verify proof against on-chain Merkle root
   - Proves certificate existed at the time of anchoring
   - Tamper-evident: changing any field invalidates the proof

Benefits:
  - Decentralized verification (works even if platform goes down)
  - Tamper-proof (cannot retroactively modify certificate data)
  - Timestamped (blockchain provides immutable timestamp)

Trade-off:
  - Adds complexity, only valuable for high-stakes credentials
  - Most platforms skip this for basic course certificates
```

### LinkedIn Integration

```
LinkedIn certificate sharing:

1. Certificate page includes "Add to LinkedIn" button
2. Button URL format:
   https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME
     &name={url_encoded_course_title}
     &organizationName={platform_name}
     &issueYear={year}
     &issueMonth={month}
     &certUrl={verification_url}
     &certId={verification_code}

3. LinkedIn opens pre-filled certification form
4. User confirms and adds to their profile
5. Anyone viewing the LinkedIn profile can click the verification URL
6. Our platform returns real-time verification result
```

---

## Deep Dive: Course Discovery

### Search Architecture (Elasticsearch)

```
Elasticsearch index mapping:

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

### Search Query with Ranking

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

### Recommendation Engine

```
Recommendation architecture:

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

Collaborative filtering implementation:
  - Matrix factorization (ALS) on user-course enrollment matrix
  - User embedding (128-dim) + Course embedding (128-dim)
  - Retrained daily on Spark cluster
  - Approximate nearest neighbors (FAISS/Annoy) for real-time lookup

Content-based filtering:
  - Course description → sentence-transformers embedding (384-dim)
  - Category + tags + level → one-hot features
  - Cosine similarity between learner profile vector and course vectors
  - Profile vector = weighted average of enrolled course vectors
```

### Personalized Learning Paths

```
Learning path generation:

1. User selects a goal: "Become a Data Scientist"
2. System maps goal to skill graph:

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

3. For each node in the skill graph:
   - Recommend top-rated course matching the skill
   - Skip if learner has already completed equivalent course
   - Estimate time: sum of course durations

4. Output personalized learning path:
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

## Deep Dive: Live Classes

### Real-Time Video Architecture

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

Scaling live classes:
  < 50 participants:    Single SFU, full WebRTC (sub-second latency)
  50-500 participants:  SFU with simulcast, viewers receive-only
  500-10K participants: Cascaded SFUs, RTMP ingest + low-latency HLS fallback
  > 10K participants:   RTMP ingest → live transcoding → LL-HLS via CDN (~3-5s latency)
```

### Live Chat & Interaction

```
Live class features:

+---------------------+     +-------------------+     +--------------------+
| Chat Service        |     | Q&A Service       |     | Poll Service       |
| (WebSocket)         |     |                   |     |                    |
| - Real-time messages|     | - Submit question |     | - Instructor       |
| - Emoji reactions   |     | - Upvote          |     |   creates poll     |
| - Rate limiting     |     | - Instructor pins |     | - Learners vote    |
|   (5 msg/10 sec)   |     | - Answer live     |     | - Real-time results|
| - Moderation filter |     | - Sort by votes   |     | - Timed auto-close |
+---------------------+     +-------------------+     +--------------------+

Chat message flow:
  1. Learner sends message via WebSocket
  2. Server validates (rate limit, content filter)
  3. Broadcast to all connected clients via Redis Pub/Sub
  4. Persist to time-series store (for replay)
  5. Messages older than 24h archived to cold storage

Screen sharing:
  - Uses WebRTC getDisplayMedia() API
  - Instructor shares screen as additional video track
  - SFU forwards screen share track to all viewers
  - Viewers see screen + instructor camera (picture-in-picture)
```

### Recording & Replay

```
Recording pipeline:

1. SFU records instructor media streams (audio + video + screen share)
2. Composite recording:
   - Merge camera + screen share into single video
   - Layout: screen share (80%) + camera PIP (20%)
   - Chat overlay (optional, timestamped)
3. Post-processing:
   - Transcode to standard renditions (1080p, 720p, 480p)
   - Generate HLS manifest
   - Auto-generate subtitles (same ASR pipeline as pre-recorded)
4. Publish as a regular lesson in the course
5. Learners who missed the live session can watch the recording

Recording storage:
  - Raw recording: ~2 GB/hour (1080p)
  - Transcoded (3 renditions): ~4.5 GB/hour
  - Retention: permanent (becomes course content)
```

### Scheduling & Attendance

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

## Deep Dive: Instructor Analytics

### Revenue Dashboard

```
Instructor revenue data model:

+--------------------+     +---------------------+     +--------------------+
| Enrollments        |     | Revenue Events      |     | Payouts            |
| (source of truth)  |---->| (calculated)        |---->| (monthly)          |
+--------------------+     +---------------------+     +--------------------+

Revenue calculation:
  Gross revenue       = sum(price_paid) for all enrollments in period
  Platform fee        = gross_revenue * platform_rate (e.g., 37% for Udemy organic)
  Instructor share    = gross_revenue - platform_fee
  Refund deductions   = sum(refunded_amount) in period
  Net instructor rev  = instructor_share - refund_deductions
  Tax withholding     = net_revenue * tax_rate (varies by country)
  Payout amount       = net_revenue - tax_withholding

Dashboard queries:
  - Revenue by course (last 30/90/365 days)
  - Revenue trend (daily/weekly/monthly chart)
  - Revenue by country (geo breakdown)
  - Revenue by referral source (organic, paid ads, affiliate)
  - Refund rate per course
  - Coupon usage and discount impact
  - Lifetime revenue
```

### Engagement Metrics

```
Key instructor metrics:

+--------------------------+-------------------------------------------+
| Metric                   | Calculation                               |
+--------------------------+-------------------------------------------+
| Enrollment rate          | enrollments / course_page_views           |
| Completion rate          | completed_enrollments / total_enrollments |
| Average watch time       | total_watch_seconds / total_enrollments   |
| Drop-off by lesson       | % who completed lesson N but not N+1     |
| Quiz pass rate           | passed_attempts / total_attempts          |
| Avg quiz score           | sum(scores) / count(attempts)             |
| Review sentiment         | NLP sentiment score on review text        |
| Response time (Q&A)      | avg time instructor replies to questions  |
| Student satisfaction     | avg_rating weighted by recency            |
| Repeat enrollment rate   | learners who enroll in 2+ courses         |
+--------------------------+-------------------------------------------+

Drop-off analysis (critical for instructors):

Lesson #     Viewers    Drop-off %    Cumulative %
   1          10,000       -             100%
   2           8,500      15%             85%
   3           7,800       8%             78%
   4           7,600       3%             76%
   5           5,200      32%   <-- RED FLAG: investigate this lesson
   6           5,000       4%             50%
   ...

Action: Instructor sees lesson 5 has abnormal drop-off.
Possible causes: too difficult, too long, poor audio, boring content.
Platform suggests: "Lesson 5 has 32% drop-off. Consider splitting it
into shorter segments or adding an interactive exercise."
```

### A/B Testing Course Content

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

## Deep Dive: Offline Access

### Content Download Architecture

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

### DRM for Offline Content

```
Offline DRM strategy:

1. License acquisition (while online):
   - Client requests offline license for course
   - DRM server issues license with constraints:
     {
       "license_type": "offline",
       "valid_for_days": 30,
       "max_plays": "unlimited",
       "hdcp_required": false,
       "resolution_cap": "720p",    // cap offline quality to save storage
       "renewal_url": "https://drm.example.com/renew"
     }

2. Content encryption:
   - Videos encrypted with AES-128 CTR mode
   - Each rendition has unique content key
   - Keys stored in device secure enclave (iOS Keychain / Android Keystore)

3. Playback:
   - Player requests decryption key from local license store
   - If license valid → decrypt and play
   - If license expired → prompt to go online and renew

4. License renewal:
   - When device comes online, auto-renew licenses
   - If enrollment is still active → renew for 30 more days
   - If enrollment expired/refunded → revoke license, delete content

Platform-specific DRM:
  iOS:     FairPlay Streaming (offline HLS)
  Android: Widevine L1/L3 (offline DASH)
  Web:     No offline support (or PWA with limited caching)
```

### Progress Sync on Reconnect

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

### Storage Management

```
Mobile storage management:

Settings:
  - Max storage allocation: configurable (default 5 GB)
  - Download quality: Low (360p, ~150 MB/hr), Medium (480p, ~400 MB/hr),
                      High (720p, ~1 GB/hr)
  - Auto-download: next 3 unwatched lessons (on WiFi only)
  - Auto-cleanup: delete completed lessons after 7 days

Smart download priorities:
  1. Currently enrolled, actively studying courses
  2. Next unwatched lesson in each active course
  3. Downloadable resources (PDFs, slides)
  4. Subtitle files (tiny, always download)

Storage low warning:
  When device storage < 1 GB:
  - Pause auto-downloads
  - Suggest cleanup of completed content
  - Show per-course storage breakdown with delete option

Estimated storage per course:
  10-hour course at 480p ≈ 4 GB video + 50 MB resources
  10-hour course at 360p ≈ 1.5 GB video + 50 MB resources
```

---

## Scaling Strategy

### CDN for Global Delivery

```
CDN topology:

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

Cache hit ratio targets:
  Video segments:    > 95% (immutable content, long TTL)
  Manifests:         > 80% (short TTL, frequently accessed)
  Course thumbnails: > 99% (small, very frequently accessed)
  Overall:           > 90%

Cache warming:
  - When a popular course launches, pre-warm edge caches
  - Push first 3 lessons to all PoPs proactively
  - Use predictive warming based on enrollment surge patterns
```

### Database Sharding Strategy

```
Sharding plan:

+------------------------+---------------------+---------------------------+
| Table                  | Shard Key           | Strategy                  |
+------------------------+---------------------+---------------------------+
| courses                | No sharding needed  | Single primary + replicas |
|                        |                     | (500K rows, fits easily)  |
+------------------------+---------------------+---------------------------+
| enrollments            | learner_id          | Hash-based, 16 shards     |
|                        |                     | (500M rows, growing)      |
+------------------------+---------------------+---------------------------+
| lesson_progress        | enrollment_id       | Hash-based, 32 shards     |
|                        |                     | (10B+ rows, write-heavy)  |
+------------------------+---------------------+---------------------------+
| quiz_attempts          | enrollment_id       | Hash-based, 16 shards     |
|                        |                     | (co-located with progress)|
+------------------------+---------------------+---------------------------+
| reviews                | course_id           | Hash-based, 8 shards      |
|                        |                     | (reads by course)         |
+------------------------+---------------------+---------------------------+
| certificates           | No sharding needed  | Single primary + replicas |
|                        |                     | (73M rows/year, reads OK) |
+------------------------+---------------------+---------------------------+

Cross-shard query handling:
  - "Get all enrollments for a learner": single shard (sharded by learner_id)
  - "Get all enrollments for a course": scatter-gather across all shards
    → mitigate with materialized view in analytics DB (ClickHouse)
  - "Get progress for an enrollment": single shard (co-located)
```

### Handling Peak Enrollment (Course Launch)

```
Course launch traffic pattern:

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
              Course launch announcement

Scaling measures:
  1. Pre-scale: instructor announces launch date →
     auto-scale API servers 2x, warm CDN caches
  2. Enrollment queue: during peak, enrollment requests go to
     Kafka queue → processed async → confirmation sent via push
  3. Payment processing: use Stripe's idempotency keys to handle
     retries safely during load spikes
  4. Course page caching: Redis cache course metadata with 60s TTL
     (stale reads acceptable for catalog)
  5. Rate limiting: 10 enrollments/minute per user (prevent bots)
  6. Video pre-warming: push first lesson to CDN edge before launch
```

### Caching Strategy

```
Cache layer architecture:

+---------------------------+----------+--------+-----------------------------+
| Data                      | Store    | TTL    | Invalidation                |
+---------------------------+----------+--------+-----------------------------+
| Course metadata           | Redis    | 5 min  | Event: course.updated       |
| Course catalog page       | CDN      | 60 sec | Purge on publish            |
| Lesson video manifest     | CDN      | 5 sec  | Version in URL              |
| Video segments            | CDN      | 1 year | Immutable (unique URLs)     |
| User session              | Redis    | 30 min | Sliding expiry              |
| Enrollment status         | Redis    | 10 min | Event: enrollment.created   |
| Progress (per lesson)     | Redis    | 1 hr   | Write-through on update     |
| Search results            | Redis    | 2 min  | Evict on reindex            |
| Recommendations           | Redis    | 6 hr   | Refresh on new enrollment   |
| Instructor analytics      | Redis    | 15 min | Refresh on demand           |
| Quiz questions (per quiz) | Redis    | 1 hr   | Event: quiz.updated         |
| Leaderboard               | Redis    | 5 min  | Sorted set, ZINCRBY         |
+---------------------------+----------+--------+-----------------------------+

Write-behind pattern for progress:
  1. Client sends progress update
  2. Write to Redis immediately (fast response)
  3. Background worker flushes Redis → PostgreSQL every 30 seconds
  4. If Redis crashes, lose at most 30 seconds of progress data (acceptable)
  5. On read: Redis cache hit → return; miss → read from DB → populate cache
```

---

## Deployment Architecture

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

## Common Interview Follow-ups

**Q: How do you handle video piracy and prevent unauthorized screen recording?**

Multi-layered approach: (1) DRM encryption (Widevine/FairPlay) prevents direct download of raw video files; (2) Forensic watermarking: embed an invisible, unique watermark per user session (learner_id + timestamp encoded into video frames using spread-spectrum technique). If a pirated copy surfaces, extract the watermark to identify the source account. (3) Token-based URL signing: video segment URLs expire after 4 hours and are tied to the user's session. (4) Concurrent stream limits: max 2 simultaneous streams per account. (5) HDCP enforcement on desktop for premium content. (6) Disable right-click and devtools detection (minor deterrent, not a real barrier). Trade-off: aggressive DRM hurts legitimate users (compatibility issues), so apply strict DRM only to premium/paid content, not free preview content.

**Q: How would you design the system to support coding exercises with real-time feedback?**

Two-tier architecture: (1) Client-side execution for simple exercises: use WebAssembly-compiled language runtimes (Pyodide for Python, QuickJS for JavaScript) that run entirely in the browser. Zero latency, no server cost, handles 80% of beginner exercises. (2) Server-side execution for complex exercises: use the sandboxed container approach (gVisor/Firecracker). Pre-warm a pool of containers per language (50 warm Python containers, 30 warm Java containers). Learner code submitted via WebSocket for sub-second feedback. Test cases run sequentially; stop on first failure for fast feedback. For database exercises: spin up ephemeral SQLite/PostgreSQL instances with pre-loaded schemas. Container pool auto-scales based on queue depth. Cost: ~$0.001 per code execution.

**Q: How do you handle instructor payouts across 190+ countries with different currencies and tax regulations?**

Use a payment processor like Stripe Connect or PayPal for Marketplaces as the foundation. (1) Each instructor onboards with identity verification (KYC) through Stripe Connect. (2) Revenue split calculated per transaction: platform takes 30-50% depending on referral source (organic vs. instructor-driven). (3) Monthly payout cycle: aggregate earnings, deduct refunds (30-day refund window), withhold applicable taxes (W-8BEN for non-US, 1099 for US instructors). (4) Currency handling: store all transactions in USD; convert to instructor's local currency at payout time using market rates. (5) Minimum payout threshold: $50 to reduce transaction costs. (6) Tax compliance: generate annual tax documents (1099-MISC for US, local equivalents). (7) Fraud detection: flag suspicious enrollment patterns (self-enrollment, fake accounts) before payout.

**Q: How would you implement peer-reviewed assignments at scale?**

Structured peer review workflow: (1) Learner submits assignment. (2) System assigns 3 random peer reviewers from learners who have completed the same assignment (ensures competency). (3) Reviewers receive anonymized submission + rubric with specific criteria (1-5 scale per criterion). (4) Deadline: 7 days to complete review. (5) Calibration: before reviewing peers, each reviewer grades a "gold standard" submission pre-graded by the instructor. If their grade deviates more than 20% from the instructor's grade, show the instructor's reasoning to calibrate them. (6) Final score: median of 3 peer scores (robust to outliers). If variance among reviewers is high (stddev > 1.5), escalate to instructor or TA. (7) Incentive: reviewing peers counts toward course progress (mandatory to unlock certificate). (8) Feedback quality: after receiving reviews, learners rate review helpfulness. Reviewers with consistently helpful ratings get priority in future assignment queues.

**Q: How do you ensure video content is accessible to learners with disabilities?**

WCAG 2.1 AA compliance across four pillars: (1) Captions: auto-generated via ASR (Whisper), then human-reviewed for top 100 courses. Support closed captions (toggleable) and open captions (burned in). Caption accuracy target: 98%+ for human-reviewed, 90%+ for auto-generated. (2) Audio descriptions: for visual-heavy content (diagrams, code walkthroughs), provide supplementary audio track describing what is on screen. (3) Keyboard navigation: all player controls accessible via keyboard. Tab order follows logical sequence. Visible focus indicators. (4) Screen reader support: ARIA labels on all interactive elements. Course structure exposed as semantic HTML headings. Progress announcements via aria-live regions. (5) Adjustable playback: speed control (0.5x to 2x), font size control for captions, high-contrast caption backgrounds. (6) Transcript: full searchable text transcript alongside every video, synchronized with playback. (7) Color contrast: all UI elements meet 4.5:1 contrast ratio minimum.

**Q: How would you handle a scenario where a popular instructor with 1M students suddenly deletes their account?**

This requires a careful policy and technical approach: (1) Soft delete with grace period: instructor account is deactivated, not deleted. 90-day grace period during which account can be reactivated. (2) Content preservation: all published courses remain accessible to enrolled learners indefinitely (this is in the ToS). Ownership transfers to the platform. (3) New enrollments: disable new enrollments for the instructor's courses after grace period. (4) Certificates: all previously issued certificates remain valid and verifiable. (5) Revenue: final payout processed for all earned revenue up to deactivation date. (6) Data deletion: after 90 days, delete instructor's personal data per GDPR/privacy requirements, but retain anonymized course content. (7) Communication: notify all enrolled learners via email that the instructor has left. Assign a "community TA" or mark Q&A as "unsupported by original instructor." (8) Prevent: large instructors get a dedicated partner manager who monitors account health signals (login frequency drop, support ticket escalation).

**Q: How do you design the system to support multiple pricing models (one-time purchase, subscription, enterprise licensing)?**

Flexible pricing engine: (1) One-time purchase: simplest model. Learner pays once, gets lifetime access to the course. Stored as a single enrollment record with `access_expires_at = NULL`. (2) Subscription (Coursera Plus model): monthly/annual fee for access to a catalog. Enrollment records have `access_expires_at` tied to subscription end date. Subscription service manages renewals via Stripe recurring billing. On cancellation, learners keep access until period end, then enrollments transition to "expired." (3) Enterprise licensing (B2B): company purchases seat licenses for employees. Admin portal for license management. SCORM/LTI integration for corporate LMS. Usage reporting and compliance tracking. SSO integration (SAML/OIDC). (4) Freemium: some courses are free (enrollment with `price_paid_cents = 0`), others require payment. Free courses serve as funnel for paid courses. (5) Implementation: pricing resolved at enrollment time by a Pricing Service that evaluates: course base price, active coupons, user's subscription status, enterprise agreement, promotional campaigns. Single enrollment table handles all models; the `payment_type` field distinguishes them.

**Q: What metrics would you track for platform health and business KPIs?**

Platform health: (1) Video start time P50/P95/P99 per CDN region (target: P95 < 2s). (2) Rebuffer ratio (target: < 0.5%). (3) API latency P50/P95/P99 per endpoint. (4) Error rate (5xx) per service (target: < 0.1%). (5) Progress sync success rate (target: > 99.9%). (6) Search latency and zero-result rate. (7) Transcode pipeline backlog (target: < 30 min from upload to ready). Business KPIs: (8) Monthly active learners (MAL) and DAL/MAL ratio (stickiness). (9) Enrollment conversion rate (visitor -> enrolled). (10) Course completion rate (overall and by category). (11) Net Promoter Score (NPS) from post-course survey. (12) Learner lifetime value (LTV) and customer acquisition cost (CAC). (13) Instructor supply: new courses/month, instructor churn rate. (14) Revenue: GMV, net revenue, revenue per learner, subscription renewal rate. (15) Content quality: average course rating trend, refund rate per course.

---

## Summary

### Key Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Video storage | S3 + CDN (CloudFront) | Cost-effective at petabyte scale, global delivery |
| Video streaming | HLS + DASH adaptive bitrate | Universal device support, bandwidth adaptation |
| DRM | Widevine + FairPlay | Covers Android/Chrome + iOS/Safari |
| Primary database | PostgreSQL (sharded) | ACID for enrollments/payments, JSON support |
| Progress writes | Redis write-behind → PostgreSQL | Handle 15K writes/sec with eventual consistency |
| Search | Elasticsearch | Full-text + faceted filtering + autocomplete |
| Event bus | Kafka | Decouple services, event sourcing for analytics |
| Code execution | gVisor sandboxed containers | Secure isolation, multi-language support |
| Recommendations | Hybrid CF + CBF | Combines social signals with content similarity |
| Certificates | PDF + PNG + blockchain anchor | Shareable, verifiable, tamper-evident |
| Live classes | WebRTC (SFU) + LL-HLS fallback | Low latency for small groups, CDN scale for large |
| Offline | Encrypted download + DRM license | Secure offline viewing with time-limited license |

### Key Trade-offs

| Trade-off | Option A | Option B | Decision |
|-----------|----------|----------|----------|
| Video latency vs. cost | Dedicated streaming servers (low latency) | CDN with HLS (higher latency, lower cost) | CDN + HLS. 2-3s start time is acceptable for education. CDN cost savings at scale are significant. |
| Progress consistency | Synchronous DB write (strong consistency) | Redis write-behind (eventual consistency) | Write-behind. Losing 30s of progress data is acceptable. Handling 15K writes/sec synchronously is expensive. |
| Code execution security | Full VM per execution (maximum isolation) | gVisor containers (good isolation, lower overhead) | gVisor. 10x faster startup than full VMs. Security is sufficient for educational code execution. |
| Grading approach | All auto-graded (scalable, instant) | Human grading available (accurate, slow) | Hybrid. Auto-grade MCQ/code, human-grade essays. AI-assisted grading for short answers reduces manual load. |
| Recommendation freshness | Real-time updates (expensive compute) | Batch-computed daily (stale but cheap) | Batch daily + event-triggered refresh on enrollment. Recommendations do not need second-level freshness. |
| Offline DRM strictness | Strict DRM, no downloads | Encrypted offline with 30-day license | Encrypted offline. Mobile learners in emerging markets need offline access. 30-day license balances security and usability. |
| Live class architecture | Pure WebRTC (low latency, limited scale) | RTMP + CDN (high latency, unlimited scale) | Tiered. WebRTC for < 500 participants, RTMP + LL-HLS for larger audiences. Most live classes are small. |
| Subtitle generation | Human-only (high accuracy, slow, expensive) | ASR auto-generated (fast, cheaper, less accurate) | Auto-generated + human review for popular courses. ASR accuracy (Whisper) is sufficient for most content. Human review for top 100 courses. |
