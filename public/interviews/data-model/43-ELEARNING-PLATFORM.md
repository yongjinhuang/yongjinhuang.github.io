# Data Model: E-Learning Platform (Coursera/Udemy)

An e-learning platform must support course creation with structured content (videos, articles, quizzes, coding exercises), student enrollment and progress tracking, video delivery with adaptive bitrate streaming, and certificate generation upon completion. The data model separates the content hierarchy (course → section → lesson) from the student experience (enrollment → lesson_progress → quiz_attempts → certificate) so that course structure can evolve independently from student progress records.

---

## Table Responsibilities

| Table | Purpose | Why It Exists |
|-------|---------|---------------|
| **instructors** | Course creator profiles | Separates instructor identity from user account; supports verified status, payout tracking, and aggregate metrics |
| **courses** | Top-level learning product | The primary entity students browse and purchase; contains metadata, pricing, and aggregate statistics |
| **sections** | Logical groupings within a course | Organizes lessons into chapters/modules; provides structure and ordering |
| **lessons** | Individual learning units | The atomic content unit; each lesson is one video, article, quiz, or exercise |
| **video_assets** | Video file metadata and streaming configuration | Manages transcoding, DRM, adaptive bitrate manifests, and subtitles separately from lesson metadata |
| **enrollments** | Student-course relationships | Tracks each student's lifecycle in a course: purchase, progress, completion, and access expiration |
| **lesson_progress** | Per-lesson progress for each student | Granular tracking of video position, time spent, and completion status per lesson per student |
| **quizzes** | Quiz configuration | Defines quiz parameters (passing score, attempts, time limit) separately from questions |
| **quiz_questions** | Individual questions within a quiz | Supports multiple question types with type-specific data (MCQ options, code test cases) |
| **quiz_attempts** | Student quiz submission records | Records each attempt with answers, score, and time spent; supports multiple attempts |
| **certificates** | Completion certificates | Generated when a student completes all course requirements; includes a unique verification code |

---

## Detailed Field Descriptions

### instructors

| Field | Type | Description |
|-------|------|-------------|
| instructor_id | PK, UUID | Unique instructor identifier |
| user_id | FK → users | Links to the user account; an instructor is a role, not a separate user |
| display_name | VARCHAR | Public-facing name shown on course pages |
| bio | TEXT | Instructor biography and credentials |
| expertise | ARRAY | Areas of expertise (e.g., "machine_learning", "web_development"); used for discovery and recommendations |
| is_verified | BOOLEAN | Whether the instructor's credentials have been verified by the platform |
| payout_account_id | FK → payout_accounts | Where revenue share payments are sent |
| total_students | INT | Aggregate count of enrolled students across all courses; denormalized for display |
| avg_rating | DECIMAL(3,2) | Average rating across all courses; denormalized for sorting and filtering |

### courses

| Field | Type | Description |
|-------|------|-------------|
| course_id | PK, UUID | Unique course identifier |
| instructor_id | FK → instructors | Who created and teaches this course |
| title | VARCHAR | Course title shown in search and catalog |
| description | TEXT | Full course description with learning outcomes |
| category_id | FK → categories | Course category for browsing and filtering (e.g., "Data Science", "Web Development") |
| level | ENUM | beginner, intermediate, advanced; helps students find appropriate courses |
| price_cents | INT | Course price in smallest currency unit; 0 for free courses |
| currency | VARCHAR(3) | ISO 4217 currency code |
| duration_hours | DECIMAL | Total course duration; calculated from sum of lesson durations |
| total_lessons | INT | Denormalized lesson count for display |
| total_enrolled | INT | Denormalized enrollment count; social proof for prospective students |
| avg_rating | DECIMAL(3,2) | Average student rating; denormalized for sorting |
| status | ENUM | draft (being created), published (live), archived (no longer accepting enrollments) |

### sections

| Field | Type | Description |
|-------|------|-------------|
| section_id | PK, UUID | Unique section identifier |
| course_id | FK → courses | Which course this section belongs to |
| title | VARCHAR | Section title (e.g., "Module 1: Introduction to Python") |
| position | INT | Display order within the course; enables drag-and-drop reordering |
| lesson_count | INT | Denormalized count of lessons in this section |

### lessons

| Field | Type | Description |
|-------|------|-------------|
| lesson_id | PK, UUID | Unique lesson identifier |
| section_id | FK → sections | Which section this lesson belongs to |
| title | VARCHAR | Lesson title |
| lesson_type | ENUM | video, article, quiz, coding_exercise, assignment; determines the rendering component and progress tracking logic |
| position | INT | Display order within the section |
| duration_sec | INT | Estimated or actual duration in seconds; used for course total calculation |
| is_preview | BOOLEAN | If true, this lesson is accessible without enrollment; used for course marketing |

### video_assets

| Field | Type | Description |
|-------|------|-------------|
| video_id | PK, UUID | Unique video asset identifier |
| lesson_id | FK → lessons | Which lesson this video belongs to; 1:1 relationship |
| storage_key | VARCHAR | S3 object key for the original uploaded video; used for re-transcoding if needed |
| manifest_url | VARCHAR | HLS manifest URL (.m3u8) for adaptive bitrate streaming |
| renditions_json | JSONB | Available quality levels: `{"360p": {"url": "...", "bitrate": 800}, "720p": {...}, "1080p": {...}}` |
| drm_key_id | VARCHAR | DRM encryption key reference (Widevine/FairPlay); prevents unauthorized downloads |
| subtitles_json | JSONB | Available subtitle tracks: `{"en": "url", "zh": "url", "es": "url"}` |
| duration_sec | INT | Exact video duration from transcoding; may differ slightly from lesson.duration_sec |
| thumbnail_url | VARCHAR | Auto-generated or custom thumbnail for video preview |

### enrollments

| Field | Type | Description |
|-------|------|-------------|
| enrollment_id | PK, UUID | Unique enrollment identifier |
| course_id | FK → courses | Which course the student enrolled in |
| user_id | FK → users | Which student enrolled |
| status | ENUM | active (learning), completed (finished all lessons), refunded (money returned), expired (access ended) |
| payment_id | FK → payments | Reference to the purchase transaction; null for free courses |
| progress_percent | DECIMAL(5,2) | Calculated as (completed_lessons / total_lessons) * 100; denormalized for dashboard display |
| enrolled_at | TIMESTAMP | When the student enrolled; used for refund window calculation |
| completed_at | TIMESTAMP | When progress_percent reached 100%; null until completed |
| access_expires_at | TIMESTAMP | When access to course materials expires; null for lifetime access |

### lesson_progress

| Field | Type | Description |
|-------|------|-------------|
| enrollment_id | FK, composite PK | Which enrollment this progress belongs to |
| lesson_id | FK, composite PK | Which lesson this progress tracks |
| status | ENUM | not_started, in_progress, completed; drives the progress bar UI |
| video_position_sec | INT | Last watched position in the video; enables resume-where-you-left-off |
| time_spent_sec | INT | Total time spent on this lesson; used for learning analytics |
| playback_speed | DECIMAL(3,2) | Last used playback speed (0.5x to 2.0x); restored on resume |
| completed_at | TIMESTAMP | When the student completed this lesson; null until completed |

### quizzes

| Field | Type | Description |
|-------|------|-------------|
| quiz_id | PK, UUID | Unique quiz identifier |
| lesson_id | FK → lessons | Which lesson contains this quiz; 1:1 with quiz-type lessons |
| quiz_type | ENUM | mcq (multiple choice), short_answer, code (coding challenge), essay; determines grading method |
| passing_score | INT | Minimum percentage to pass (e.g., 70); below this the attempt is marked failed |
| max_attempts | INT | How many times the student can retake; null for unlimited |
| time_limit_min | INT | Time limit in minutes; null for untimed quizzes |

### quiz_questions

| Field | Type | Description |
|-------|------|-------------|
| question_id | PK, UUID | Unique question identifier |
| quiz_id | FK → quizzes | Which quiz this question belongs to |
| question_text | TEXT | The question prompt; supports markdown for formatting |
| question_type | ENUM | single_choice, multi_choice, short_answer, code, essay; determines the answer UI |
| options_json | JSONB | For choice questions: `[{"label": "A", "text": "...", "is_correct": true}, ...]` |
| correct_answer | TEXT | For short_answer: the expected answer; null for MCQ (stored in options_json) |
| test_cases_json | JSONB | For code questions: `[{"input": "...", "expected_output": "...", "is_hidden": false}]` |
| explanation | TEXT | Shown after the student answers; explains why the correct answer is correct |
| position | INT | Display order within the quiz |

### quiz_attempts

| Field | Type | Description |
|-------|------|-------------|
| attempt_id | PK, UUID | Unique attempt identifier |
| quiz_id | FK → quizzes | Which quiz was attempted |
| enrollment_id | FK → enrollments | Which enrollment (student+course) this attempt belongs to |
| answers_json | JSONB | Student's submitted answers: `{"question_id": "selected_option/text/code"}` |
| score | INT | Percentage score achieved (0-100) |
| passed | BOOLEAN | Whether score >= passing_score; determines if the lesson is marked complete |
| time_spent_sec | INT | How long the student spent on this attempt |
| submitted_at | TIMESTAMP | When the attempt was submitted |

### certificates

| Field | Type | Description |
|-------|------|-------------|
| certificate_id | PK, UUID | Unique certificate identifier |
| enrollment_id | FK → enrollments | Which enrollment earned this certificate |
| course_id | FK → courses | Denormalized for quick lookup; avoids joining through enrollment |
| user_id | FK → users | Denormalized for the certificate display page |
| verification_code | VARCHAR, UNIQUE | Short alphanumeric code (e.g., "CERT-A7B3X9") for third-party verification |
| issued_at | TIMESTAMP | When the certificate was generated |
| certificate_url | VARCHAR | URL to the rendered certificate PDF/image (stored in S3) |

---

## ER Diagram

```
+------------------+
|   instructors    |
|------------------|
| instructor_id(PK)|
| user_id (FK)     |
| display_name     |
| bio              |
| expertise        |
| is_verified      |
| payout_account_id|
| total_students   |
| avg_rating       |
+------------------+
        |
        | 1
        |
        +───* courses
        |
+------------------+
|     courses      |
|------------------|
| course_id (PK)   |
| instructor_id(FK)|
| title            |
| description      |
| category_id (FK) |
| level            |
| price_cents      |
| currency         |
| duration_hours   |
| total_lessons    |
| total_enrolled   |
| avg_rating       |
| status           |
+------------------+
   |             |
   | 1           | 1
   |             |
   +──* sections +───────────────* enrollments
   |                              |
+--+-------------+    +-----------+----------+
|    sections    |    |     enrollments      |
|----------------|    |----------------------|
| section_id(PK) |    | enrollment_id (PK)   |
| course_id (FK) |    | course_id (FK)       |
| title          |    | user_id (FK)         |
| position       |    | status               |
| lesson_count   |    | payment_id           |
+----------------+    | progress_percent     |
        |             | enrolled_at          |
        | 1           | completed_at         |
        |             | access_expires_at    |
        +──* lessons  +----------------------+
        |                |             |
+-------+--------+      | 1           | 1
|     lessons    |      |             |
|----------------|      +──* lesson_  +──* quiz_attempts
| lesson_id (PK) |      |   progress  |
| section_id(FK) |      |             |    +------------------+
| title          |  +---+----------+  |    |  quiz_attempts   |
| lesson_type    |  |lesson_progress|  |    |------------------|
| position       |  |--------------|  |    | attempt_id (PK)  |
| duration_sec   |  |enrollment_id |  |    | quiz_id (FK)     |
| is_preview     |  | (FK, PK)     |  |    | enrollment_id(FK)|
+----------------+  |lesson_id     |  |    | answers_json     |
   |         |      | (FK, PK)     |  |    | score            |
   |         |      |status        |  |    | passed           |
   | 1       | 1    |video_position|  |    | time_spent_sec   |
   |         |      | _sec         |  |    | submitted_at     |
   |         |      |time_spent_sec|  |    +------------------+
   |         |      |playback_speed|  |
   |         |      |completed_at  |  |    +------------------+
   |         |      +--------------+  |    |   certificates   |
   |         |                        |    |------------------|
   |    +----+----------+            |    | certificate_id   |
   |    |  video_assets |            |    |  (PK)            |
   |    |---------------|            └────| enrollment_id(FK)|
   |    | video_id (PK) |                 | course_id (FK)   |
   |    | lesson_id(FK) |                 | user_id (FK)     |
   |    | storage_key   |                 | verification_code|
   |    | manifest_url  |                 | issued_at        |
   |    | renditions_   |                 | certificate_url  |
   |    |  json         |                 +------------------+
   |    | drm_key_id    |
   |    | subtitles_json|
   |    | duration_sec  |
   |    | thumbnail_url |
   |    +---------------+
   |
   +──1 quizzes
   |
+--+-------------+
|    quizzes     |
|----------------|
| quiz_id (PK)   |
| lesson_id (FK) |
| quiz_type      |
| passing_score  |
| max_attempts   |
| time_limit_min |
+----------------+
        |
        | 1
        |
        +──* quiz_questions
        |
+------------------+
| quiz_questions   |
|------------------|
| question_id (PK) |
| quiz_id (FK)     |
| question_text    |
| question_type    |
| options_json     |
| correct_answer   |
| test_cases_json  |
| explanation      |
| position         |
+------------------+

Relationships:
  instructors 1───* courses
  courses 1───* sections
  courses 1───* enrollments
  sections 1───* lessons
  lessons 1───1 video_assets     (one video per video lesson)
  lessons 1───1 quizzes          (one quiz per quiz lesson)
  quizzes 1───* quiz_questions
  enrollments 1───* lesson_progress  (one per lesson in the course)
  enrollments 1───* quiz_attempts
  enrollments 1───1 certificates     (one certificate per completion)
```

---

## Data Flow

1. **Course Creation**: An instructor creates a `courses` record with status = `draft`. They add `sections` to organize the curriculum, then add `lessons` within each section. The `position` field on both sections and lessons enables drag-and-drop reordering.

2. **Video Upload & Transcoding**: When a video lesson is created, the instructor uploads a video file. The system stores the original in S3 (`storage_key`), then transcodes it into multiple renditions (360p, 720p, 1080p). An HLS manifest is generated for adaptive bitrate streaming. DRM encryption is applied. The `video_assets` record is created with all streaming metadata.

3. **Quiz Creation**: For quiz lessons, the instructor creates a `quizzes` record with passing criteria, then adds `quiz_questions`. For coding exercises, `test_cases_json` includes both visible test cases (shown to the student) and hidden test cases (for grading).

4. **Course Publishing**: When the instructor publishes the course, `courses.status` changes to `published`. The course appears in the catalog. Denormalized fields (`duration_hours`, `total_lessons`) are calculated from the sections and lessons.

5. **Student Enrollment**: A student purchases or enrolls in a course. An `enrollments` record is created with status = `active`. `lesson_progress` records are initialized for all lessons in the course with status = `not_started`. The course's `total_enrolled` counter is incremented.

6. **Video Watching**: As the student watches a video, `lesson_progress.video_position_sec` is periodically updated (every 10-30 seconds) to enable resume. `time_spent_sec` is accumulated. `playback_speed` is saved. When the student reaches a configurable threshold (e.g., 90% of the video), the lesson is marked `completed`.

7. **Quiz Taking**: The student starts a quiz attempt. A `quiz_attempts` record is created. Answers are submitted as JSON. For MCQ and short_answer, grading is automatic. For code questions, submissions are executed against `test_cases_json` in a sandboxed environment. The `score` and `passed` status are calculated.

8. **Progress Tracking**: Each time a `lesson_progress` status changes to `completed`, the `enrollments.progress_percent` is recalculated: `(completed lessons / total lessons) * 100`. This drives the progress bar on the student dashboard.

9. **Course Completion**: When `progress_percent` reaches 100% (all lessons completed, all required quizzes passed), `enrollments.status` changes to `completed` and `completed_at` is set.

10. **Certificate Generation**: Upon completion, a `certificates` record is created with a unique `verification_code`. A PDF certificate is rendered with the student's name, course title, completion date, and instructor signature. The PDF is stored in S3 and `certificate_url` is set. The verification code enables employers to verify the certificate via a public URL.

11. **Analytics**: The instructor views a dashboard showing: total enrollments, completion rates, average quiz scores per question, video drop-off points (from aggregated `video_position_sec` data), and revenue.

---

## Key Design Decisions for Interviews

- **Why separate video_assets from lessons?** Not all lessons have videos (articles, quizzes, exercises). Video assets have complex metadata (renditions, DRM keys, manifests, subtitles) that would clutter the lessons table. Separating them enables independent evolution of the video pipeline without affecting the content structure.

- **Why HLS with multiple renditions?** Adaptive bitrate streaming automatically adjusts video quality based on the student's bandwidth. A student on mobile data gets 360p; a student on broadband gets 1080p. Without this, students on slow connections would experience buffering, and students on fast connections would see unnecessary compression artifacts.

- **Why composite PK (enrollment_id + lesson_id) on lesson_progress?** This enforces that each student has exactly one progress record per lesson per enrollment. It also makes lookups O(1) by primary key when loading a specific lesson's progress.

- **Why video_position_sec for resume?** Students rarely watch an entire lecture in one sitting. Saving the exact playback position enables "continue where you left off" across devices and sessions. This is critical for engagement -- forcing students to re-watch content they have already seen causes drop-off.

- **Why max_attempts on quizzes?** Unlimited attempts would let students brute-force the correct answers. Limited attempts force genuine learning. Tracking each attempt separately in `quiz_attempts` provides data on which questions students struggle with, informing course improvement.

- **Why test_cases_json with is_hidden?** Visible test cases help students understand the expected behavior and debug their code. Hidden test cases prevent students from hardcoding answers to specific inputs. This mirrors real-world coding assessments.

- **Why a unique verification_code on certificates?** Certificates are only valuable if they can be verified. A unique code (e.g., "CERT-A7B3X9") enables any third party (employer, university) to verify the certificate's authenticity via a public verification page, without needing access to the student's account.

- **Why denormalize total_enrolled and avg_rating on courses?** Course catalog pages display these metrics for thousands of courses simultaneously. Computing them from enrollments and reviews on every page load would be prohibitively expensive. Denormalized counters are updated asynchronously when new enrollments or ratings occur.

- **Why access_expires_at on enrollments?** Some business models (subscription-based platforms like Coursera Plus) grant temporary access rather than lifetime access. This field enables both models: null for lifetime access, a specific date for time-limited access. Expired enrollments restrict content access but preserve progress for re-enrollment.
