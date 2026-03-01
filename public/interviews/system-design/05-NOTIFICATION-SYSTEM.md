# Design a Notification System

## 1. Requirements Clarification

### Functional Requirements

| Requirement | Description |
|---|---|
| Multi-channel delivery | Push notifications (iOS/Android), SMS, email, in-app |
| Real-time notifications | Deliver within seconds of trigger event |
| Scheduled notifications | Support future-dated delivery |
| User preferences | Per-channel opt-in/opt-out, quiet hours, frequency caps |
| Template system | Reusable templates with variable substitution and localization |
| Notification grouping | Batch related notifications into digests |
| Delivery tracking | Track sent, delivered, opened, clicked states |
| Priority levels | Different urgency tiers with corresponding SLAs |

### Non-Functional Requirements

| Requirement | Target |
|---|---|
| Latency | Soft real-time, < 5 seconds for P0/P1 |
| Delivery guarantee | At-least-once delivery |
| Availability | 99.99% uptime |
| Scalability | Billions of notifications per day |
| Fault tolerance | No single point of failure |
| Idempotency | Prevent duplicate notifications |
| Observability | End-to-end tracking and metrics |

### Scale Estimation

```
DAU:                    10 million
Notifications per user: ~10/day average
Total notifications:    100 million/day

Channel breakdown:
  - Push:    60M/day  (60%)
  - Email:   25M/day  (25%)
  - SMS:      5M/day   (5%)
  - In-app:  10M/day  (10%)
```

### Back-of-Envelope Calculations

```
Throughput:
  100M notifications / 86,400 seconds = ~1,157 notifications/sec (average)
  Peak (10x average)                  = ~11,570 notifications/sec

Storage (per notification record ~500 bytes):
  100M * 500 bytes = 50 GB/day
  50 GB * 365 days = ~18 TB/year (before cleanup)

Delivery log (per attempt ~200 bytes):
  With 1.2 avg attempts: 120M * 200 bytes = 24 GB/day

Bandwidth:
  Push payload (~4 KB avg):  60M * 4 KB  = 240 GB/day
  Email payload (~50 KB avg): 25M * 50 KB = 1.25 TB/day
  SMS payload (~160 bytes):   5M * 160 B  = 800 MB/day
  Total outbound: ~1.5 TB/day

User preferences cache:
  10M users * 1 KB = 10 GB (fits in memory)

Device tokens:
  10M users * avg 2 devices * 256 bytes = ~5 GB
```

---

## 2. Notification Types & Channels

### Channel Overview

#### Push Notifications (APNs / FCM)

Push notifications are delivered to mobile devices via Apple Push Notification Service (APNs) for iOS and Firebase Cloud Messaging (FCM) for Android.

```
Payload structure (FCM example):
{
  "message": {
    "token": "device_token_here",
    "notification": {
      "title": "New Message",
      "body": "Alice sent you a message"
    },
    "data": {
      "type": "direct_message",
      "conversation_id": "conv_123",
      "deep_link": "app://messages/conv_123"
    },
    "android": {
      "priority": "HIGH",
      "notification": {
        "channel_id": "messages"
      }
    },
    "apns": {
      "payload": {
        "aps": {
          "badge": 5,
          "sound": "default",
          "category": "MESSAGE"
        }
      }
    }
  }
}
```

#### SMS (Twilio / AWS SNS)

Short text messages sent via telecom carriers. Used for OTPs, security alerts, and critical transactional messages.

```
Constraints:
  - 160 characters (GSM-7) or 70 characters (UCS-2/Unicode)
  - Concatenated messages: up to 1600 characters (10 segments)
  - Country-specific regulations (TCPA, GDPR)
  - Sender ID or short code registration required
```

#### Email (SendGrid / SES)

Rich-content notifications supporting HTML, attachments, and tracking pixels.

```
Components:
  - Subject line
  - HTML body (with plain-text fallback)
  - Headers (List-Unsubscribe, Reply-To)
  - Tracking pixel for open tracking
  - Click-tracking URL rewriting
```

#### In-App Notifications

Real-time notifications displayed within the application UI via WebSocket or SSE connections.

```
Delivery methods:
  - WebSocket (persistent bidirectional connection)
  - Server-Sent Events (unidirectional, simpler)
  - Long polling (fallback)

Stored in notification feed for later retrieval.
```

### Channel Comparison Table

```
+----------+----------+---------+---------------+-----------+-----------+----------+
| Channel  | Latency  | Cost    | Deliverability| Open Rate | Rich      | Offline  |
|          |          | per msg |               |           | Content   | Support  |
+----------+----------+---------+---------------+-----------+-----------+----------+
| Push     | < 1s     | Free*   | 85-95%        | 5-15%     | Limited   | Yes      |
| SMS      | 1-5s     | $0.01+  | 95-99%        | 90-98%    | No        | Yes      |
| Email    | 1-30s    | $0.001  | 85-95%        | 15-25%    | Full HTML | Yes      |
| In-App   | < 0.5s   | Free    | 100%**        | 40-60%    | Full      | No       |
+----------+----------+---------+---------------+-----------+-----------+----------+

*  Push is free from the provider side; infrastructure cost applies.
** Only when user is active in the app.
```

### Channel Selection Strategy

```
Priority-based channel selection:

P0 (Security/OTP):     SMS + Push + Email (all channels)
P1 (Direct messages):  Push + In-App (email fallback after 5 min)
P2 (Social activity):  Push + In-App (batched)
P3 (Marketing):        Email only (respect frequency caps)

Fallback chain:
  Push -> In-App -> Email -> SMS (only for critical)
```

---

## 3. High-Level Architecture

### System Architecture Diagram

```
                              ┌──────────────────────────────────────────────────────────┐
                              │                    TRIGGER LAYER                         │
                              │                                                          │
                              │  ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌─────────────┐  │
                              │  │ Payment │ │ Social  │ │ Messaging│ │  Scheduled  │  │
                              │  │ Service │ │ Service │ │  Service │ │    Jobs     │  │
                              │  └────┬────┘ └────┬────┘ └─────┬────┘ └──────┬──────┘  │
                              │       │           │            │             │          │
                              └───────┼───────────┼────────────┼─────────────┼──────────┘
                                      │           │            │             │
                                      ▼           ▼            ▼             ▼
                              ┌──────────────────────────────────────────────────────────┐
                              │              NOTIFICATION SERVICE (API)                  │
                              │                                                          │
                              │  ┌──────────┐  ┌────────────┐  ┌──────────────────────┐ │
                              │  │ Validate │  │  Template  │  │   User Preference    │ │
                              │  │ & Dedup  │  │   Engine   │  │       Check          │ │
                              │  └──────────┘  └────────────┘  └──────────────────────┘ │
                              │                                                          │
                              │  ┌──────────────────────────────────────────────────┐    │
                              │  │           Priority Router / Classifier           │    │
                              │  └──────────────────────────────────────────────────┘    │
                              └──────────────────────────┬───────────────────────────────┘
                                                         │
                              ┌───────────────────────────┼───────────────────────────────┐
                              │            MESSAGE QUEUE LAYER (Kafka)                    │
                              │                                                           │
                              │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐ │
                              │  │ P0 Queue │ │ P1 Queue │ │ P2 Queue │ │   P3 Queue   │ │
                              │  │(Critical)│ │ (High)   │ │ (Medium) │ │    (Low)     │ │
                              │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └──────┬───────┘ │
                              │       │            │            │              │          │
                              └───────┼────────────┼────────────┼──────────────┼──────────┘
                                      │            │            │              │
                              ┌───────┼────────────┼────────────┼──────────────┼──────────┐
                              │       │       WORKER LAYER      │              │          │
                              │       ▼            ▼            ▼              ▼          │
                              │  ┌──────────────────────────────────────────────────────┐ │
                              │  │              Channel Dispatcher                     │ │
                              │  └──────┬──────────┬──────────┬──────────┬─────────────┘ │
                              │         │          │          │          │               │
                              │    ┌────▼───┐ ┌────▼───┐ ┌───▼────┐ ┌──▼─────────┐     │
                              │    │  Push  │ │  SMS   │ │ Email  │ │  In-App    │     │
                              │    │ Worker │ │ Worker │ │ Worker │ │  Worker    │     │
                              │    └────┬───┘ └────┬───┘ └───┬────┘ └──┬─────────┘     │
                              │         │          │         │         │               │
                              └─────────┼──────────┼─────────┼─────────┼───────────────┘
                                        │          │         │         │
                              ┌─────────┼──────────┼─────────┼─────────┼───────────────┐
                              │         │   THIRD-PARTY      │         │               │
                              │         │   PROVIDERS        │         │               │
                              │    ┌────▼───┐ ┌────▼───┐ ┌───▼────┐   │               │
                              │    │  APNs  │ │ Twilio │ │SendGrid│   │               │
                              │    │  FCM   │ │AWS SNS │ │  SES   │   │               │
                              │    └────────┘ └────────┘ └────────┘   │               │
                              └───────────────────────────────────────┼───────────────┘
                                                                      │
                              ┌───────────────────────────────────────┼───────────────┐
                              │         REAL-TIME DELIVERY            │               │
                              │                                  ┌────▼──────────┐    │
                              │                                  │   WebSocket   │    │
                              │                                  │    Server     │    │
                              │                                  └───────────────┘    │
                              └───────────────────────────────────────────────────────┘

                              ┌───────────────────────────────────────────────────────┐
                              │                   DATA STORES                         │
                              │                                                       │
                              │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │
                              │  │PostgreSQL│ │  Redis   │ │  S3/Blob │ │ Time-    │ │
                              │  │(metadata)│ │ (cache,  │ │(templates│ │ Series   │ │
                              │  │          │ │  prefs)  │ │  assets) │ │  (metrics)│ │
                              │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ │
                              └───────────────────────────────────────────────────────┘

                              ┌───────────────────────────────────────────────────────┐
                              │              ANALYTICS & MONITORING                   │
                              │                                                       │
                              │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │
                              │  │Delivery  │ │  Open/   │ │ Error    │ │ Dashboard│ │
                              │  │ Tracker  │ │  Click   │ │ Tracker  │ │  & Alerts│ │
                              │  │          │ │ Tracker  │ │          │ │          │ │
                              │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ │
                              └───────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility |
|---|---|
| Notification Service API | Receives notification requests, validates, deduplicates, renders templates, routes to queues |
| Priority Queue (Kafka) | Decouples producers from consumers, enables backpressure, ordered delivery per partition |
| Channel Workers | Consume from queues, format payloads per channel, call third-party APIs |
| Template Engine | Renders templates with variables, handles localization |
| User Preference Store | Stores opt-in/out, quiet hours, frequency caps (cached in Redis) |
| Delivery Tracker | Records delivery attempts, successes, failures for each notification |
| WebSocket Server | Maintains persistent connections for in-app real-time delivery |

---

## 4. Data Model

### Entity Relationship

```
┌───────────────┐       ┌───────────────────┐       ┌──────────────────┐
│     users     │       │  user_preferences │       │  device_tokens   │
│───────────────│       │───────────────────│       │──────────────────│
│ id (PK)       │──┐    │ id (PK)           │       │ id (PK)          │
│ email         │  ├───>│ user_id (FK)      │       │ user_id (FK)     │◄──┐
│ phone         │  │    │ channel           │       │ platform         │   │
│ locale        │  │    │ enabled           │       │ token            │   │
│ timezone      │  │    │ quiet_start       │       │ is_active        │   │
│ created_at    │  │    │ quiet_end         │       │ last_used_at     │   │
└───────────────┘  │    │ frequency_cap     │       │ created_at       │   │
                   │    │ updated_at        │       └──────────────────┘   │
                   │    └───────────────────┘                              │
                   │                                                       │
                   │    ┌───────────────────┐       ┌──────────────────┐   │
                   │    │  notifications    │       │  delivery_log    │   │
                   │    │───────────────────│       │──────────────────│   │
                   └───>│ id (PK)           │──────>│ id (PK)          │   │
                        │ user_id (FK)      │       │ notification_id  │   │
                        │ template_id (FK)  │       │ channel          │   │
                        │ channel           │       │ status           │   │
                        │ priority          │       │ provider         │   │
                        │ status            │       │ provider_msg_id  │   │
                        │ idempotency_key   │       │ attempt_number   │   │
                        │ payload           │       │ error_message    │   │
                        │ scheduled_at      │       │ sent_at          │   │
                        │ sent_at           │       │ delivered_at     │   │
                        │ created_at        │       │ opened_at        │   │
                        └───────────────────┘       │ clicked_at       │   │
                                                    │ created_at       │   │
                        ┌───────────────────┐       └──────────────────┘   │
                        │notification_      │                              │
                        │  templates        │                              │
                        │───────────────────│                              │
                        │ id (PK)           │                              │
                        │ name              │       ┌──────────────────┐   │
                        │ channel           │       │ user_devices     │   │
                        │ locale            │       │  (view joining   │   │
                        │ version           │       │   users +        │───┘
                        │ subject_template  │       │   device_tokens) │
                        │ body_template     │       └──────────────────┘
                        │ variables_schema  │
                        │ is_active         │
                        │ created_at        │
                        │ updated_at        │
                        └───────────────────┘
```

### SQL Schema Definitions

```sql
-- Users table (core user data relevant to notifications)
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255),
    phone           VARCHAR(20),
    locale          VARCHAR(5) DEFAULT 'en',
    timezone        VARCHAR(50) DEFAULT 'UTC',
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_phone ON users(phone);

-- Device tokens for push notifications
CREATE TABLE device_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform        VARCHAR(10) NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
    token           VARCHAR(512) NOT NULL,
    app_version     VARCHAR(20),
    is_active       BOOLEAN DEFAULT TRUE,
    last_used_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, token)
);

CREATE INDEX idx_device_tokens_user_id ON device_tokens(user_id) WHERE is_active = TRUE;
CREATE INDEX idx_device_tokens_token ON device_tokens(token);

-- User notification preferences
CREATE TABLE user_preferences (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel         VARCHAR(20) NOT NULL CHECK (channel IN ('push', 'sms', 'email', 'in_app')),
    category        VARCHAR(50) NOT NULL DEFAULT 'all',
    enabled         BOOLEAN DEFAULT TRUE,
    quiet_start     TIME,                    -- e.g., 22:00
    quiet_end       TIME,                    -- e.g., 08:00
    frequency_cap   INTEGER,                 -- max notifications per day for this category
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, channel, category)
);

CREATE INDEX idx_user_preferences_user_id ON user_preferences(user_id);

-- Notification templates
CREATE TABLE notification_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL,
    channel         VARCHAR(20) NOT NULL,
    locale          VARCHAR(5) DEFAULT 'en',
    version         INTEGER DEFAULT 1,
    subject_template TEXT,                   -- for email subject, push title
    body_template   TEXT NOT NULL,           -- main content with {{variables}}
    variables_schema JSONB,                  -- JSON schema for required variables
    metadata        JSONB DEFAULT '{}',      -- extra channel-specific config
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(name, channel, locale, version)
);

CREATE INDEX idx_templates_name_channel ON notification_templates(name, channel, locale)
    WHERE is_active = TRUE;

-- Notifications table (main record)
CREATE TABLE notifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    template_id     UUID REFERENCES notification_templates(id),
    channel         VARCHAR(20) NOT NULL,
    priority        SMALLINT NOT NULL DEFAULT 2 CHECK (priority BETWEEN 0 AND 3),
    category        VARCHAR(50) NOT NULL DEFAULT 'general',
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'queued', 'sending', 'sent',
                                          'delivered', 'opened', 'clicked',
                                          'failed', 'cancelled')),
    idempotency_key VARCHAR(255) UNIQUE,
    subject         TEXT,
    body            TEXT NOT NULL,
    payload         JSONB DEFAULT '{}',      -- extra data (deep links, images, etc.)
    scheduled_at    TIMESTAMP WITH TIME ZONE,
    sent_at         TIMESTAMP WITH TIME ZONE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- Partition by month for manageability
CREATE TABLE notifications_2026_01 PARTITION OF notifications
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE notifications_2026_02 PARTITION OF notifications
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE notifications_2026_03 PARTITION OF notifications
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

CREATE INDEX idx_notifications_user_status ON notifications(user_id, status);
CREATE INDEX idx_notifications_scheduled ON notifications(scheduled_at)
    WHERE status = 'pending' AND scheduled_at IS NOT NULL;
CREATE INDEX idx_notifications_idempotency ON notifications(idempotency_key);

-- Delivery log (tracks every delivery attempt)
CREATE TABLE delivery_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID NOT NULL REFERENCES notifications(id),
    channel         VARCHAR(20) NOT NULL,
    status          VARCHAR(20) NOT NULL
                        CHECK (status IN ('attempting', 'sent', 'delivered',
                                          'failed', 'bounced')),
    provider        VARCHAR(50) NOT NULL,    -- 'apns', 'fcm', 'twilio', 'sendgrid'
    provider_msg_id VARCHAR(255),            -- provider's message ID for tracking
    attempt_number  SMALLINT DEFAULT 1,
    error_code      VARCHAR(50),
    error_message   TEXT,
    response_time_ms INTEGER,
    sent_at         TIMESTAMP WITH TIME ZONE,
    delivered_at    TIMESTAMP WITH TIME ZONE,
    opened_at       TIMESTAMP WITH TIME ZONE,
    clicked_at      TIMESTAMP WITH TIME ZONE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
) PARTITION BY RANGE (created_at);

CREATE INDEX idx_delivery_log_notification ON delivery_log(notification_id);
CREATE INDEX idx_delivery_log_provider_msg ON delivery_log(provider_msg_id);
CREATE INDEX idx_delivery_log_status ON delivery_log(status, created_at);
```

---

## 5. Detailed Design

### 5.1 Notification Flow

#### Step-by-Step Flow

```
1. EVENT TRIGGER
   A service (e.g., messaging) generates a notification event.

2. API REQUEST
   POST /api/v1/notifications
   {
     "user_id": "user_123",
     "template": "new_message",
     "channels": ["push", "in_app"],
     "priority": 1,
     "variables": {
       "sender_name": "Alice",
       "message_preview": "Hey, are you free..."
     },
     "idempotency_key": "msg_456_notif"
   }

3. VALIDATION & DEDUPLICATION
   - Validate request schema
   - Check idempotency_key against recent notifications
   - If duplicate, return existing notification ID

4. USER PREFERENCE CHECK
   - Load user preferences from Redis cache (fallback to DB)
   - Filter out opted-out channels
   - Check quiet hours against user's timezone
   - Verify frequency cap not exceeded

5. TEMPLATE RENDERING
   - Load template for user's locale and each channel
   - Substitute variables into template
   - Validate rendered output (length limits, etc.)

6. PRIORITY ASSIGNMENT & ROUTING
   - Assign priority queue based on notification priority
   - Produce message to appropriate Kafka topic

7. QUEUE CONSUMPTION
   - Workers consume from priority-ordered queues
   - P0 consumed with highest concurrency

8. CHANNEL-SPECIFIC DELIVERY
   - Format payload for target provider
   - Call third-party API (APNs, FCM, Twilio, SendGrid)
   - Record delivery attempt in delivery_log

9. DELIVERY TRACKING
   - Update notification status (sent -> delivered -> opened -> clicked)
   - Process webhooks from providers for delivery receipts

10. ANALYTICS
    - Emit metrics to time-series DB
    - Update aggregated counters
```

#### Sequence Diagram

```
Trigger       Notification      Preference     Template      Kafka       Channel      Third-Party
Service          Service          Store         Engine        Queue       Worker        Provider
  │                │                │              │            │            │              │
  │  POST /notify  │                │              │            │            │              │
  │───────────────>│                │              │            │            │              │
  │                │                │              │            │            │              │
  │                │ Check idemp.   │              │            │            │              │
  │                │ key (Redis)    │              │            │            │              │
  │                │──────┐         │              │            │            │              │
  │                │      │         │              │            │            │              │
  │                │<─────┘         │              │            │            │              │
  │                │                │              │            │            │              │
  │                │ Get prefs      │              │            │            │              │
  │                │───────────────>│              │            │            │              │
  │                │    prefs       │              │            │            │              │
  │                │<───────────────│              │            │            │              │
  │                │                │              │            │            │              │
  │                │ Check quiet hours, caps       │            │            │              │
  │                │──────┐                        │            │            │              │
  │                │      │                        │            │            │              │
  │                │<─────┘                        │            │            │              │
  │                │                │              │            │            │              │
  │                │ Render template│              │            │            │              │
  │                │──────────────────────────────>│            │            │              │
  │                │     rendered content          │            │            │              │
  │                │<─────────────────────────────│            │            │              │
  │                │                │              │            │            │              │
  │                │ Produce to priority queue     │            │            │              │
  │                │──────────────────────────────────────────>│            │              │
  │                │                │              │            │            │              │
  │  202 Accepted  │                │              │            │            │              │
  │<───────────────│                │              │            │            │              │
  │  {id: notif_x} │               │              │            │            │              │
  │                │                │              │            │            │              │
  │                │                │              │            │ Consume    │              │
  │                │                │              │            │──────────>│              │
  │                │                │              │            │            │              │
  │                │                │              │            │            │ Send payload │
  │                │                │              │            │            │─────────────>│
  │                │                │              │            │            │              │
  │                │                │              │            │            │  200 OK      │
  │                │                │              │            │            │<─────────────│
  │                │                │              │            │            │              │
  │                │                │              │            │ Log result │              │
  │                │                │              │            │<──────────│              │
  │                │                │              │            │            │              │
  │                │           Delivery webhook    │            │            │              │
  │                │<──────────────────────────────────────────────────────────────────────│
  │                │                │              │            │            │              │
  │                │ Update status  │              │            │            │              │
  │                │──────┐         │              │            │            │              │
  │                │      │         │              │            │            │              │
  │                │<─────┘         │              │            │            │              │
```

#### API Contract

```
POST /api/v1/notifications

Request:
{
  "user_id": "uuid",
  "user_ids": ["uuid"],              // for batch (mutually exclusive with user_id)
  "template": "template_name",
  "channels": ["push", "email"],     // optional, defaults to all enabled
  "priority": 1,                     // 0-3
  "category": "social",
  "variables": {                     // template variables
    "key": "value"
  },
  "payload": {                       // extra data
    "deep_link": "app://path",
    "image_url": "https://..."
  },
  "idempotency_key": "unique_key",
  "scheduled_at": "2026-03-01T10:00:00Z"  // optional, for scheduled delivery
}

Response (202 Accepted):
{
  "notification_id": "notif_uuid",
  "status": "queued",
  "channels": ["push", "email"],
  "estimated_delivery": "2026-03-01T10:00:05Z"
}

Error Response (400/422):
{
  "error": {
    "code": "INVALID_TEMPLATE",
    "message": "Template 'xyz' not found for channel 'push'",
    "details": {}
  }
}
```

### 5.2 Priority System

#### Priority Levels

```
┌──────────┬───────────────────────────┬──────────┬──────────────────┬───────────────┐
│ Priority │ Examples                  │ SLA      │ Queue            │ Retry Policy  │
├──────────┼───────────────────────────┼──────────┼──────────────────┼───────────────┤
│ P0       │ OTP, security alerts,     │ < 1s     │ notifications.p0 │ 3x, immediate │
│ Critical │ fraud warnings            │          │ (dedicated)      │ retry         │
├──────────┼───────────────────────────┼──────────┼──────────────────┼───────────────┤
│ P1       │ Direct messages, mentions │ < 5s     │ notifications.p1 │ 5x, exp.      │
│ High     │ order confirmations       │          │                  │ backoff       │
├──────────┼───────────────────────────┼──────────┼──────────────────┼───────────────┤
│ P2       │ Likes, comments, follows  │ < 30s    │ notifications.p2 │ 3x, exp.      │
│ Medium   │ friend requests           │          │                  │ backoff       │
├──────────┼───────────────────────────┼──────────┼──────────────────┼───────────────┤
│ P3       │ Marketing, digests,       │ < 5min   │ notifications.p3 │ 2x, delayed   │
│ Low      │ recommendations           │          │ (batch-friendly) │               │
└──────────┴───────────────────────────┴──────────┴──────────────────┴───────────────┘
```

#### Queue Architecture per Priority

```
Kafka Topics:

  notifications.p0 ──► 16 partitions, 3 replicas
       │                Consumer group: p0-workers (32 instances)
       │                Max poll interval: 5s
       │                No batching
       ▼
  [P0 Workers] ──► Dedicated thread pool, highest concurrency

  notifications.p1 ──► 12 partitions, 3 replicas
       │                Consumer group: p1-workers (24 instances)
       │                Max poll interval: 15s
       ▼
  [P1 Workers] ──► High concurrency

  notifications.p2 ──► 8 partitions, 3 replicas
       │                Consumer group: p2-workers (16 instances)
       │                Batch size: 50, linger: 100ms
       ▼
  [P2 Workers] ──► Medium concurrency, supports micro-batching

  notifications.p3 ──► 4 partitions, 3 replicas
       │                Consumer group: p3-workers (8 instances)
       │                Batch size: 200, linger: 1000ms
       ▼
  [P3 Workers] ──► Low concurrency, batch processing
```

#### Worker Allocation Strategy

```python
# Dynamic worker allocation based on queue depth
def calculate_worker_count(priority, queue_depth):
    base_workers = {0: 32, 1: 24, 2: 16, 3: 8}
    max_workers =  {0: 128, 1: 96, 2: 64, 3: 32}

    threshold_per_worker = {0: 100, 1: 500, 2: 2000, 3: 10000}

    needed = max(
        base_workers[priority],
        queue_depth // threshold_per_worker[priority]
    )
    return min(needed, max_workers[priority])
```

### 5.3 Template System

#### Template Storage and Versioning

```
Template structure:

  template_name: "order_confirmation"
  ├── channel: "push"
  │   ├── locale: "en", version: 3 (active)
  │   ├── locale: "en", version: 2 (inactive)
  │   ├── locale: "zh", version: 2 (active)
  │   └── locale: "es", version: 1 (active)
  ├── channel: "email"
  │   ├── locale: "en", version: 5 (active)
  │   └── locale: "zh", version: 3 (active)
  └── channel: "sms"
      ├── locale: "en", version: 2 (active)
      └── locale: "zh", version: 1 (active)
```

#### Variable Substitution

```typescript
// Template rendering engine
interface TemplateVariables {
  [key: string]: string | number | boolean;
}

interface RenderedNotification {
  readonly subject: string | null;
  readonly body: string;
  readonly metadata: Record<string, unknown>;
}

function renderTemplate(
  template: NotificationTemplate,
  variables: TemplateVariables
): RenderedNotification {
  const variablePattern = /\{\{(\w+)\}\}/g;

  const renderString = (str: string): string =>
    str.replace(variablePattern, (match, key) => {
      if (!(key in variables)) {
        throw new Error(`Missing template variable: ${key}`);
      }
      return String(variables[key]);
    });

  return {
    subject: template.subject_template
      ? renderString(template.subject_template)
      : null,
    body: renderString(template.body_template),
    metadata: template.metadata ?? {},
  };
}

// Example usage:
// Template: "Hi {{user_name}}, your order #{{order_id}} has shipped!"
// Variables: { user_name: "Alice", order_id: "12345" }
// Result:   "Hi Alice, your order #12345 has shipped!"
```

#### Template Examples by Channel

```
PUSH TEMPLATE:
  Title:  "{{sender_name}} sent you a message"
  Body:   "{{message_preview}}"
  Data:   { "deep_link": "app://messages/{{conversation_id}}" }

EMAIL TEMPLATE:
  Subject: "Your order #{{order_id}} has been confirmed"
  Body:    (HTML)
  <html>
    <body>
      <h1>Order Confirmation</h1>
      <p>Hi {{user_name}},</p>
      <p>Your order <strong>#{{order_id}}</strong> has been confirmed.</p>
      <p>Estimated delivery: {{delivery_date}}</p>
      <a href="{{tracking_url}}">Track your order</a>
    </body>
  </html>

SMS TEMPLATE:
  Body: "[AppName] Your verification code is {{otp_code}}. Expires in 5 min."
```

#### Localization Support

```typescript
// Template resolution with locale fallback
async function resolveTemplate(
  name: string,
  channel: string,
  userLocale: string
): Promise<NotificationTemplate> {
  // Try exact locale match first
  const exactMatch = await templateRepo.find({
    name,
    channel,
    locale: userLocale,
    isActive: true,
  });

  if (exactMatch) {
    return exactMatch;
  }

  // Fall back to language without region (e.g., "zh-TW" -> "zh")
  const languageOnly = userLocale.split('-')[0];
  const languageMatch = await templateRepo.find({
    name,
    channel,
    locale: languageOnly,
    isActive: true,
  });

  if (languageMatch) {
    return languageMatch;
  }

  // Fall back to English
  const fallback = await templateRepo.find({
    name,
    channel,
    locale: 'en',
    isActive: true,
  });

  if (!fallback) {
    throw new Error(
      `No template found: name=${name}, channel=${channel}`
    );
  }

  return fallback;
}
```

### 5.4 User Preferences

#### Per-Channel Opt-In/Opt-Out

```typescript
interface UserPreference {
  readonly userId: string;
  readonly channel: 'push' | 'sms' | 'email' | 'in_app';
  readonly category: string;
  readonly enabled: boolean;
  readonly quietStart: string | null;  // "22:00"
  readonly quietEnd: string | null;    // "08:00"
  readonly frequencyCap: number | null;
}

// Check if notification should be sent
async function shouldSendNotification(
  userId: string,
  channel: string,
  category: string
): Promise<{ allowed: boolean; reason?: string }> {
  const prefs = await getPreferences(userId);

  // 1. Check global channel opt-out
  const globalPref = prefs.find(
    (p) => p.channel === channel && p.category === 'all'
  );
  if (globalPref && !globalPref.enabled) {
    return { allowed: false, reason: 'channel_disabled' };
  }

  // 2. Check category-specific opt-out
  const categoryPref = prefs.find(
    (p) => p.channel === channel && p.category === category
  );
  if (categoryPref && !categoryPref.enabled) {
    return { allowed: false, reason: 'category_disabled' };
  }

  // 3. Check quiet hours
  const quietPref = categoryPref ?? globalPref;
  if (quietPref?.quietStart && quietPref?.quietEnd) {
    const userTz = await getUserTimezone(userId);
    const now = getCurrentTimeInTz(userTz);
    if (isInQuietHours(now, quietPref.quietStart, quietPref.quietEnd)) {
      return { allowed: false, reason: 'quiet_hours' };
    }
  }

  // 4. Check frequency cap
  const effectiveCap = categoryPref?.frequencyCap ?? globalPref?.frequencyCap;
  if (effectiveCap) {
    const sentToday = await getNotificationCountToday(userId, channel, category);
    if (sentToday >= effectiveCap) {
      return { allowed: false, reason: 'frequency_cap_exceeded' };
    }
  }

  return { allowed: true };
}
```

#### Quiet Hours / Do Not Disturb

```
Quiet Hours Logic:

  User timezone: America/New_York (UTC-5)
  Quiet hours:   22:00 - 08:00

  Timeline:
  ─────────────────────────────────────────────────────
  00:00    08:00         22:00    24:00
    │ QUIET  │   ACTIVE    │ QUIET  │
  ─────────────────────────────────────────────────────

  Notification arrives at 23:30 UTC:
    → Convert to user time: 18:30 EST → ACTIVE → send immediately

  Notification arrives at 04:00 UTC:
    → Convert to user time: 23:00 EST → QUIET → defer to 08:00 EST

  Exception: P0 (critical) notifications BYPASS quiet hours.
```

#### Frequency Capping

```
Frequency cap examples:

  Global:     Max 20 notifications/day across all channels
  Push:       Max 10 push notifications/day
  Email:      Max 3 emails/day
  Marketing:  Max 1 marketing notification/week

  Implementation with Redis:

  Key:   freq:{user_id}:{channel}:{category}:{date}
  Value: count (integer)
  TTL:   24 hours (auto-cleanup)

  Before sending:
    INCR freq:user_123:push:social:2026-03-01
    If result > cap → reject
    Else → proceed with delivery
```

---

## 6. Reliability & Delivery Guarantees

### At-Least-Once Delivery

```
The system guarantees at-least-once delivery through:

1. Persistent message queues (Kafka with replication factor 3)
2. Consumer offset management (commit only after successful delivery)
3. Retry mechanism for transient failures
4. Dead letter queue for permanent failures

Flow:
  Producer ──► Kafka (acks=all) ──► Consumer ──► Provider
                                        │
                                   On success:
                                   commit offset
                                        │
                                   On failure:
                                   do NOT commit
                                   message re-delivered
```

### Deduplication (Idempotency Key)

```typescript
// Deduplication using Redis with TTL
async function checkAndSetIdempotency(
  idempotencyKey: string,
  notificationId: string
): Promise<{ isDuplicate: boolean; existingId?: string }> {
  const redisKey = `idemp:${idempotencyKey}`;

  // SET NX with 24-hour TTL
  const result = await redis.set(redisKey, notificationId, 'NX', 'EX', 86400);

  if (result === 'OK') {
    return { isDuplicate: false };
  }

  const existingId = await redis.get(redisKey);
  return { isDuplicate: true, existingId: existingId ?? undefined };
}

// Additional deduplication at consumer level
async function deduplicateAtConsumer(
  notificationId: string
): Promise<boolean> {
  const lockKey = `processing:${notificationId}`;
  // Distributed lock with 5-minute TTL
  const acquired = await redis.set(lockKey, '1', 'NX', 'EX', 300);
  return acquired === 'OK';
}
```

### Retry with Exponential Backoff

```typescript
interface RetryConfig {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly jitterMs: number;
}

const RETRY_CONFIGS: Record<number, RetryConfig> = {
  0: { maxAttempts: 3, baseDelayMs: 100,  maxDelayMs: 1000,   jitterMs: 50  },
  1: { maxAttempts: 5, baseDelayMs: 1000, maxDelayMs: 30000,  jitterMs: 500 },
  2: { maxAttempts: 3, baseDelayMs: 5000, maxDelayMs: 60000,  jitterMs: 1000},
  3: { maxAttempts: 2, baseDelayMs: 10000,maxDelayMs: 120000, jitterMs: 2000},
};

function calculateRetryDelay(
  config: RetryConfig,
  attemptNumber: number
): number {
  const exponentialDelay = config.baseDelayMs * Math.pow(2, attemptNumber - 1);
  const clampedDelay = Math.min(exponentialDelay, config.maxDelayMs);
  const jitter = Math.random() * config.jitterMs;
  return clampedDelay + jitter;
}

// Retry timeline example for P1:
// Attempt 1: immediate
// Attempt 2: ~1s delay
// Attempt 3: ~2s delay
// Attempt 4: ~4s delay
// Attempt 5: ~8s delay
// Total max time: ~15s
```

### Dead Letter Queue

```
Failed notification flow:

  Main Queue ──► Worker ──► Provider
                   │
              All retries
              exhausted?
                   │
              ┌────┴────┐
              │  Yes     │ No → retry
              ▼          │
  ┌──────────────────┐   │
  │ Dead Letter Queue│   │
  │ (notifications.  │   │
  │  dlq)            │   │
  └────────┬─────────┘   │
           │              │
           ▼              │
  ┌──────────────────┐    │
  │ DLQ Processor    │    │
  │ (manual review   │    │
  │  + alerting)     │    │
  └──────────────────┘    │

DLQ contains:
  - Original notification payload
  - All attempt error messages
  - Timestamp of each attempt
  - Provider response codes
  - Worker instance ID
```

### Delivery Tracking and Receipts

```
Notification Lifecycle States:

  pending ──► queued ──► sending ──► sent ──► delivered ──► opened ──► clicked
                                       │                       │
                                       └──► failed ◄──────────┘
                                       │                    (bounce)
                                       └──► cancelled

Webhook processing for delivery receipts:

  POST /webhooks/sendgrid
  {
    "event": "delivered",
    "sg_message_id": "abc123",
    "timestamp": 1709308800
  }

  POST /webhooks/twilio
  {
    "MessageSid": "SM123",
    "MessageStatus": "delivered"
  }

  POST /webhooks/fcm (HTTP v1 delivery data via BigQuery export)
  {
    "message_id": "projects/xxx/messages/123",
    "event": "message_delivered"
  }

  APNs: Use APNs feedback service to detect invalid tokens.
```

---

## 7. Rate Limiting & Throttling

### Per-User Rate Limiting

```typescript
// Sliding window rate limiter using Redis
async function checkUserRateLimit(
  userId: string,
  channel: string
): Promise<{ allowed: boolean; retryAfterMs?: number }> {
  const limits: Record<string, { count: number; windowSec: number }> = {
    push:   { count: 30,  windowSec: 3600 },   // 30 push/hour
    sms:    { count: 5,   windowSec: 3600 },   // 5 SMS/hour
    email:  { count: 10,  windowSec: 3600 },   // 10 emails/hour
    in_app: { count: 100, windowSec: 3600 },   // 100 in-app/hour
  };

  const limit = limits[channel];
  if (!limit) {
    return { allowed: true };
  }

  const key = `ratelimit:${userId}:${channel}`;
  const now = Date.now();
  const windowStart = now - limit.windowSec * 1000;

  // Redis sorted set: score = timestamp, value = notification ID
  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, 0, windowStart);      // Remove old entries
  pipeline.zcard(key);                                  // Count current window
  pipeline.zadd(key, now, `${now}:${Math.random()}`);  // Add current request
  pipeline.expire(key, limit.windowSec);                // Set TTL

  const results = await pipeline.exec();
  const currentCount = results[1][1] as number;

  if (currentCount >= limit.count) {
    const oldestInWindow = await redis.zrange(key, 0, 0, 'WITHSCORES');
    const retryAfterMs = oldestInWindow.length > 1
      ? Number(oldestInWindow[1]) + limit.windowSec * 1000 - now
      : limit.windowSec * 1000;

    return { allowed: false, retryAfterMs };
  }

  return { allowed: true };
}
```

### Per-Channel Rate Limiting (Provider Limits)

```
Provider rate limits (must be respected):

┌────────────┬────────────────────────────────────────────┐
│ Provider   │ Rate Limits                                │
├────────────┼────────────────────────────────────────────┤
│ APNs       │ No strict limit, but throttles at high     │
│            │ volume. Recommended: < 100K/sec per topic  │
├────────────┼────────────────────────────────────────────┤
│ FCM        │ 1,000 msg/sec per project (can request     │
│            │ increase). Batch API: 500 messages/call    │
├────────────┼────────────────────────────────────────────┤
│ Twilio     │ 1 msg/sec per phone number (SMS)           │
│            │ 100 msg/sec per messaging service          │
├────────────┼────────────────────────────────────────────┤
│ SendGrid   │ Depends on plan. Typical: 10K-100K/sec     │
├────────────┼────────────────────────────────────────────┤
│ AWS SES    │ Default: 14 emails/sec (can request        │
│            │ increase to 1000+/sec)                     │
├────────────┼────────────────────────────────────────────┤
│ AWS SNS    │ SMS: varies by country (1-20 msg/sec)      │
│            │ Soft limit: 20 SMS/sec (US)                │
└────────────┴────────────────────────────────────────────┘
```

```typescript
// Token bucket rate limiter for provider calls
class TokenBucketRateLimiter {
  private readonly capacity: number;
  private readonly refillRatePerSec: number;
  private tokens: number;
  private lastRefillTime: number;

  constructor(capacity: number, refillRatePerSec: number) {
    this.capacity = capacity;
    this.refillRatePerSec = refillRatePerSec;
    this.tokens = capacity;
    this.lastRefillTime = Date.now();
  }

  tryAcquire(tokensNeeded: number = 1): boolean {
    this.refill();

    if (this.tokens >= tokensNeeded) {
      this.tokens -= tokensNeeded;
      return true;
    }

    return false;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefillTime) / 1000;
    const newTokens = elapsed * this.refillRatePerSec;

    this.tokens = Math.min(this.capacity, this.tokens + newTokens);
    this.lastRefillTime = now;
  }
}

// Usage per provider:
const providerLimiters = {
  fcm:      new TokenBucketRateLimiter(1000, 1000),
  apns:     new TokenBucketRateLimiter(50000, 50000),
  twilio:   new TokenBucketRateLimiter(100, 100),
  sendgrid: new TokenBucketRateLimiter(10000, 10000),
};
```

### Frequency Capping

```
Per-user daily/weekly caps:

  Global daily cap:       50 notifications/day
  Push daily cap:         20/day
  Email daily cap:        5/day
  Marketing weekly cap:   3/week
  Social daily cap:       30/day

  Implementation:

  Redis keys:
    freq:daily:{user_id}:{channel}    TTL: end of day (user TZ)
    freq:weekly:{user_id}:marketing   TTL: end of week
    freq:daily:{user_id}:global       TTL: end of day

  Before sending:
    1. INCR freq:daily:{user_id}:global
    2. If > 50 → drop (log reason)
    3. INCR freq:daily:{user_id}:{channel}
    4. If > channel_cap → drop
    5. INCR freq:{period}:{user_id}:{category}
    6. If > category_cap → drop
    7. Proceed with delivery

  When cap exceeded, options:
    a) Drop silently (log for analytics)
    b) Queue for digest delivery
    c) Downgrade to less intrusive channel
```

---

## 8. Scaling

### Kafka Partitioning Strategy

```
Partitioning by user_id ensures ordering per user:

  Topic: notifications.p1
  Partitions: 12
  Partition key: user_id

  Partition assignment:
    hash(user_id) % num_partitions → partition number

  This guarantees:
    ✓ All notifications for a user go to the same partition
    ✓ Ordered delivery per user
    ✓ Even distribution (assuming uniform user ID distribution)

  Scaling partitions:
    100M notifications/day = ~1,157/sec average, ~11,570/sec peak

    At 1,000 messages/sec per partition throughput:
      P0: 16 partitions → 16,000 msg/sec capacity
      P1: 12 partitions → 12,000 msg/sec capacity
      P2:  8 partitions →  8,000 msg/sec capacity
      P3:  4 partitions →  4,000 msg/sec capacity
      Total: 40 partitions → 40,000 msg/sec capacity

  Hot partition mitigation:
    - If a single user generates massive volume (e.g., celebrity mention),
      use compound key: user_id + notification_type
    - Or route high-volume users to dedicated overflow topics
```

### Worker Auto-Scaling

```
Auto-scaling based on queue depth and consumer lag:

  Metrics watched:
    - Consumer group lag (messages behind)
    - Average processing time per message
    - Error rate per worker

  Scaling rules:

  ┌─────────────┬──────────────────────┬──────────────────────────────┐
  │ Metric      │ Threshold            │ Action                       │
  ├─────────────┼──────────────────────┼──────────────────────────────┤
  │ Lag         │ > 10,000 (P0)        │ Scale up by 50%              │
  │             │ > 50,000 (P1)        │ Scale up by 50%              │
  │             │ > 200,000 (P2/P3)    │ Scale up by 25%              │
  ├─────────────┼──────────────────────┼──────────────────────────────┤
  │ Lag         │ < 100 for 10 min     │ Scale down by 25%            │
  ├─────────────┼──────────────────────┼──────────────────────────────┤
  │ Error rate  │ > 10% per worker     │ Circuit break that worker    │
  │             │ > 30% across fleet   │ Alert + pause consumption    │
  ├─────────────┼──────────────────────┼──────────────────────────────┤
  │ Latency     │ p99 > 2x SLA         │ Scale up by 25%              │
  └─────────────┴──────────────────────┴──────────────────────────────┘

  Kubernetes HPA configuration (conceptual):
    minReplicas: 4
    maxReplicas: 64
    metrics:
      - kafka consumer lag
      - CPU utilization (secondary)
    scaleUpPeriod: 30s
    scaleDownPeriod: 300s
    scaleDownStabilization: 600s
```

### Database Sharding

```
Sharding strategy for notifications table:

  Primary shard key: user_id
  Shard count: 16 shards (expandable)

  Shard assignment:
    shard_id = consistent_hash(user_id) % num_shards

  Benefits:
    ✓ User's notifications co-located (efficient queries)
    ✓ Even distribution
    ✓ Independent scaling per shard

  Schema per shard:
    notifications_shard_00
    notifications_shard_01
    ...
    notifications_shard_15

  Each shard is further partitioned by created_at (monthly):
    notifications_shard_00_2026_01
    notifications_shard_00_2026_02
    ...

  Query routing:
    SELECT * FROM notifications WHERE user_id = ?
    → Route to shard: consistent_hash(user_id) % 16
    → Within shard: query correct monthly partition

  Cross-shard queries (admin/analytics):
    → Fan out to all shards in parallel
    → Aggregate results
    → Alternatively, use read replicas with full data for analytics
```

```
Delivery log sharding:

  Shard key: notification_id (co-located with notification)
  Retention: 30 days in primary, archived to cold storage

  Cold storage (S3/GCS):
    Partitioned by: date/channel/status
    Format: Parquet (columnar, efficient for analytics)
    Retention: 1 year
```

### Caching User Preferences

```
Cache hierarchy:

  L1: In-process cache (worker-local)
      Size: 10K most recent users
      TTL: 60 seconds
      Eviction: LRU

  L2: Redis cluster
      Size: All 10M users (~10 GB)
      TTL: 1 hour
      Invalidation: Write-through on preference update

  L3: PostgreSQL (source of truth)
      Queried on L2 cache miss

  Cache key format:
    user_prefs:{user_id}

  Cache value (JSON):
    {
      "channels": {
        "push":   { "enabled": true,  "quiet": ["22:00", "08:00"], "cap": 20 },
        "email":  { "enabled": true,  "quiet": null,               "cap": 5  },
        "sms":    { "enabled": false, "quiet": null,               "cap": null},
        "in_app": { "enabled": true,  "quiet": null,               "cap": null}
      },
      "categories": {
        "marketing": { "push": false, "email": true },
        "social":    { "push": true,  "email": false }
      },
      "timezone": "America/New_York",
      "locale": "en"
    }

  Invalidation flow:
    User updates preferences
    → Write to PostgreSQL
    → Delete Redis key (lazy reload)
    → Publish invalidation event to Kafka
    → All workers clear L1 cache for that user
```

---

## 9. Monitoring & Analytics

### Key Metrics

```
Delivery Metrics:
┌──────────────────────┬──────────────────────────────────────────────┐
│ Metric               │ Description                                  │
├──────────────────────┼──────────────────────────────────────────────┤
│ delivery_rate        │ % of notifications successfully delivered    │
│ open_rate            │ % of delivered notifications opened          │
│ click_rate           │ % of opened notifications with click-through│
│ bounce_rate          │ % of notifications that bounced (email/SMS) │
│ opt_out_rate         │ % of users who opted out after notification │
│ unsubscribe_rate     │ Unsubscribes per notification campaign      │
└──────────────────────┴──────────────────────────────────────────────┘

Latency Metrics:
┌──────────────────────┬──────────────────────────────────────────────┐
│ Metric               │ Target                                       │
├──────────────────────┼──────────────────────────────────────────────┤
│ e2e_latency_p50      │ < 500ms (P0), < 2s (P1)                    │
│ e2e_latency_p95      │ < 1s (P0), < 5s (P1)                       │
│ e2e_latency_p99      │ < 3s (P0), < 10s (P1)                      │
│ queue_wait_time_p95  │ < 100ms (P0), < 1s (P1)                    │
│ provider_latency_p95 │ < 500ms (push), < 2s (email), < 3s (SMS)   │
└──────────────────────┴──────────────────────────────────────────────┘

System Health Metrics:
┌──────────────────────┬──────────────────────────────────────────────┐
│ Metric               │ Alert Threshold                              │
├──────────────────────┼──────────────────────────────────────────────┤
│ queue_depth          │ > 100K (P0), > 500K (P1)                   │
│ consumer_lag         │ Growing for > 5 minutes                     │
│ error_rate           │ > 5% per channel                            │
│ dlq_growth           │ > 100 messages/hour                         │
│ provider_errors      │ > 1% per provider                           │
│ worker_cpu           │ > 80% sustained                             │
│ redis_memory         │ > 80% capacity                              │
└──────────────────────┴──────────────────────────────────────────────┘
```

### Error Tracking per Channel

```
Error categorization:

  Push:
    - InvalidToken (remove device token, stop retrying)
    - ExpiredToken (refresh token, retry)
    - PayloadTooLarge (log, do not retry)
    - ServiceUnavailable (retry with backoff)
    - TopicDisabled (log, alert)

  SMS:
    - InvalidNumber (mark user phone invalid)
    - CarrierBlocked (try alternate carrier)
    - RateLimited (backoff, retry)
    - InsufficientFunds (alert ops team)
    - Unreachable (retry with backoff)

  Email:
    - HardBounce (mark email invalid, stop sending)
    - SoftBounce (retry up to 3 times)
    - SpamComplaint (auto-unsubscribe user)
    - Throttled (backoff, retry)
    - InvalidAddress (mark invalid)

Error handling code:

  function classifyError(channel, errorCode):
    if isRetryable(channel, errorCode):
      return { action: 'RETRY', delay: calculateBackoff() }
    if isTokenInvalid(channel, errorCode):
      return { action: 'INVALIDATE_TOKEN' }
    if isPermanentFailure(channel, errorCode):
      return { action: 'DLQ', alert: errorCode.severity === 'HIGH' }
    return { action: 'LOG_AND_SKIP' }
```

### A/B Testing for Notification Content

```
A/B testing framework:

  Experiment definition:
  {
    "experiment_id": "exp_001",
    "name": "Order confirmation subject line",
    "template": "order_confirmation",
    "channel": "email",
    "variants": [
      {
        "id": "control",
        "weight": 50,
        "subject": "Your order #{{order_id}} is confirmed"
      },
      {
        "id": "variant_a",
        "weight": 50,
        "subject": "Great news! Order #{{order_id}} confirmed"
      }
    ],
    "success_metric": "open_rate",
    "min_sample_size": 10000,
    "start_date": "2026-03-01",
    "end_date": "2026-03-15"
  }

  Assignment:
    variant = variants[hash(user_id + experiment_id) % total_weight]

  Tracking:
    For each notification, log:
      - experiment_id
      - variant_id
      - delivered (boolean)
      - opened (boolean)
      - clicked (boolean)
      - timestamp

  Analysis (daily job):
    - Calculate open_rate per variant
    - Run statistical significance test (chi-squared)
    - Auto-promote winner when significance > 95%
```

### Dashboard

```
Real-time dashboard panels:

  ┌──────────────────────────────────────────────────────────────┐
  │                NOTIFICATION SYSTEM DASHBOARD                │
  ├──────────────┬──────────────┬──────────────┬────────────────┤
  │  Total Sent  │  Delivered   │   Opened     │   Clicked      │
  │  1.2M/hr     │  1.14M/hr   │   285K/hr    │   42K/hr       │
  │  ▲ 5%        │  95.2%       │   25.0%      │   3.7%         │
  ├──────────────┴──────────────┴──────────────┴────────────────┤
  │                                                              │
  │  Latency (p95)              Error Rate by Channel            │
  │  ┌─────────────────┐       ┌─────────────────┐              │
  │  │ P0: ██ 0.8s     │       │ Push:  ██ 0.5%  │              │
  │  │ P1: ████ 3.2s   │       │ Email: ███ 1.2% │              │
  │  │ P2: █████ 12s   │       │ SMS:   █ 0.3%   │              │
  │  │ P3: ██████ 45s  │       │ InApp: ▏ 0.01%  │              │
  │  └─────────────────┘       └─────────────────┘              │
  │                                                              │
  │  Queue Depth                Worker Utilization               │
  │  ┌─────────────────┐       ┌─────────────────┐              │
  │  │ P0: 124         │       │ Push:  ██████ 60%│              │
  │  │ P1: 3,451       │       │ Email: ████ 45%  │              │
  │  │ P2: 45,200      │       │ SMS:   ██ 20%    │              │
  │  │ P3: 120,000     │       │ InApp: █████ 55% │              │
  │  └─────────────────┘       └─────────────────┘              │
  │                                                              │
  │  DLQ Messages: 23 (last hour)    Active Experiments: 4      │
  └──────────────────────────────────────────────────────────────┘
```

---

## 10. Deployment Architecture

### Multi-Region Setup

```
                    ┌───────────────────────────────────────┐
                    │           GLOBAL LOAD BALANCER         │
                    │          (Route53 / CloudFlare)        │
                    └─────────────┬─────────────────────────┘
                                  │
                    ┌─────────────┼─────────────────────────┐
                    │             │                          │
              ┌─────▼─────┐ ┌────▼──────┐ ┌───────────────▼┐
              │  US-EAST   │ │  EU-WEST  │ │   AP-SOUTH     │
              │  Region    │ │  Region   │ │   Region       │
              └─────┬──────┘ └─────┬─────┘ └───────┬────────┘
                    │              │                │
        ┌───────────┼──────────────┼────────────────┼──────────────┐
        │           │              │                │              │
        │     Each region contains:                 │              │
        │                                           │              │
        │  ┌─────────────────────────────────────┐  │              │
        │  │   Notification Service (API)        │  │              │
        │  │   ├── 3+ instances behind ALB       │  │              │
        │  │   └── Auto-scaling group            │  │              │
        │  └─────────────────────────────────────┘  │              │
        │                                           │              │
        │  ┌─────────────────────────────────────┐  │              │
        │  │   Kafka Cluster                     │  │              │
        │  │   ├── 6 brokers                     │  │              │
        │  │   ├── Cross-region replication       │  │              │
        │  │   │   (MirrorMaker 2)               │  │              │
        │  │   └── 3-day retention               │  │              │
        │  └─────────────────────────────────────┘  │              │
        │                                           │              │
        │  ┌─────────────────────────────────────┐  │              │
        │  │   Worker Fleet                      │  │              │
        │  │   ├── Push workers (8-64)           │  │              │
        │  │   ├── Email workers (4-32)          │  │              │
        │  │   ├── SMS workers (4-16)            │  │              │
        │  │   └── In-app workers (4-32)         │  │              │
        │  └──��──────────────────────────────────┘  │              │
        │                                           │              │
        │  ┌─────────────────────────────────────┐  │              │
        │  │   Data Stores                       │  │              │
        │  │   ├── PostgreSQL (primary/replica)  │  │              │
        │  │   ├── Redis cluster (6 nodes)       │  │              │
        │  │   └── S3/GCS (templates, archives)  │  │              │
        │  └─────────────────────────────────────┘  │              │
        │                                           │              │
        └───────────────────────────────────────────┘              │
                                                                   │
                              Cross-Region Replication             │
                    ┌─────────────────────────────────────────────┘
                    │
                    ▼
        ┌─────────────────────────────────────┐
        │   Cross-Region Sync                 │
        │   ├── Kafka MirrorMaker 2           │
        │   │   (async replication)           │
        │   ├── PostgreSQL logical             │
        │   │   replication (user prefs)      │
        │   ├── Redis cluster with             │
        │   │   cross-region sync             │
        │   └── Template sync via S3           │
        │       cross-region replication       │
        └─────────────────────────────────────┘
```

### Failover Strategy

```
Failover scenarios and handling:

1. SINGLE WORKER FAILURE
   ─────────────────────
   Detection: Health check fails (Kubernetes liveness probe)
   Action:    Pod restarted automatically
   Impact:    Kafka rebalances partitions to remaining workers
   RTO:       < 30 seconds

2. PROVIDER OUTAGE (e.g., FCM down)
   ──────────────────────────────────
   Detection: Error rate > 50% for provider over 60 seconds
   Action:    Circuit breaker opens
              → Messages queued in retry topic
              → Alert sent to on-call
              → Fallback to alternate provider if available
   Impact:    Delayed delivery for affected channel
   RTO:       Automatic recovery when provider returns

3. KAFKA BROKER FAILURE
   ─────────────────────
   Detection: ISR (In-Sync Replicas) count drops
   Action:    Automatic leader election (replication factor 3)
   Impact:    Brief pause in consumption (< 10 seconds)
   RTO:       < 10 seconds

4. FULL REGION FAILURE
   ────────────────────
   Detection: Health checks from Global LB fail
   Action:    Route53 failover to secondary region
              → Secondary region Kafka has replicated data
              → Workers in secondary region take over
   Impact:    Some notifications may be duplicated (at-least-once)
   RTO:       < 60 seconds (DNS propagation)

5. DATABASE FAILURE
   ─────────────────
   Detection: Connection timeouts to primary
   Action:    Promote read replica to primary
              → Update connection strings
              → Workers use cached preferences during transition
   Impact:    Brief read-only period for preferences
   RTO:       < 120 seconds

Circuit breaker configuration:

  ┌─────────────────────────────────────────────────────────┐
  │                   CIRCUIT BREAKER                       │
  │                                                         │
  │  States: CLOSED ──► OPEN ──► HALF-OPEN ──► CLOSED      │
  │                                                         │
  │  CLOSED → OPEN:                                         │
  │    Trigger: > 50% failure rate in 60-second window      │
  │    OR: > 100 consecutive failures                       │
  │                                                         │
  │  OPEN → HALF-OPEN:                                      │
  │    After: 30 seconds cooldown                           │
  │    Action: Allow 5 probe requests through               │
  │                                                         │
  │  HALF-OPEN → CLOSED:                                    │
  │    Trigger: 4 of 5 probe requests succeed               │
  │                                                         │
  │  HALF-OPEN → OPEN:                                      │
  │    Trigger: 2 of 5 probe requests fail                  │
  └─────────────────────────────────────────────────────────┘
```

---

## 11. Common Interview Follow-ups

### How to handle notification storms (viral event)?

```
Problem: A viral post generates millions of notifications in seconds.
         Example: Celebrity post → 10M followers each get a notification.

Solutions:

1. DETECTION
   - Monitor queue depth growth rate
   - Alert when single event generates > 100K notifications
   - Identify "fan-out" events early

2. BACKPRESSURE
   - Kafka naturally provides backpressure
   - Workers consume at sustainable rate
   - Priority queues ensure P0/P1 not starved by P2/P3

3. PROGRESSIVE FAN-OUT
   Instead of producing 10M messages at once:

   Event: Celebrity posts
     → Produce 1 message to "fan-out" topic
     → Fan-out worker reads follower list in batches (1000 at a time)
     → Produces notifications in throttled batches
     → Total fan-out takes 5-10 minutes instead of flooding

   ┌────────┐    ┌──────────┐    ┌──────────────┐    ┌─────────┐
   │ Event  │───>│ Fan-out  │───>│  Batch 1     │───>│ Workers │
   │        │    │ Queue    │    │  (1K users)   │    │         │
   │        │    │          │───>│  Batch 2     │───>│         │
   │        │    │          │    │  (1K users)   │    │         │
   │        │    │          │───>│  ...         │───>│         │
   │        │    │          │    │  Batch 10K   │    │         │
   └────────┘    └──────────┘    └──────────────┘    └─────────┘

4. SMART DEGRADATION
   - If queue depth > threshold, auto-downgrade P3 to digest
   - Collapse multiple notifications for same event into one
   - "Alice and 4,999 others liked your post"

5. AUTO-SCALING
   - Kubernetes HPA scales workers based on queue depth
   - Pre-provisioned capacity for expected viral events
   - Spot/preemptible instances for burst capacity
```

### How to implement digest/batching?

```
Digest system: Aggregate multiple notifications into a single summary.

Types of digests:
  - Time-based:     Every 15 min / 1 hour / daily
  - Count-based:    After 5 unread notifications
  - Hybrid:         Whichever comes first

Architecture:

  ┌───────────────────────────────────────────────────────┐
  │                  DIGEST SYSTEM                        │
  │                                                       │
  │  Notification arrives                                 │
  │       │                                               │
  │       ▼                                               │
  │  Is user eligible for digest?                         │
  │  (preference + category check)                        │
  │       │                                               │
  │  ┌────┴────┐                                          │
  │  │  Yes    │  No → send immediately                   │
  │  ▼         │                                          │
  │  Add to digest buffer (Redis sorted set)              │
  │  Key: digest:{user_id}:{category}                     │
  │  Score: timestamp                                     │
  │  Value: notification payload                          │
  │       │                                               │
  │  Check trigger conditions:                            │
  │  ┌────┴────────────────────┐                          │
  │  │ Count >= threshold?     │ ──Yes──► Flush digest    │
  │  │ Time since first item   │                          │
  │  │   >= interval?          │ ──Yes──► Flush digest    │
  │  │ Neither?                │ ──No───► Wait            │
  │  └────────────────────────┘                           │
  │                                                       │
  │  Flush digest:                                        │
  │    1. Read all items from buffer                      │
  │    2. Render digest template                          │
  │    3. Send as single notification                     │
  │    4. Clear buffer                                    │
  └───────────────────────────────────────────────────────┘

  Cron job (every 5 minutes):
    - Scan all digest buffers with age > max_interval
    - Flush any that exceed time threshold

  Digest template example (email):
    Subject: "5 new activities on your post"
    Body:
      - Alice liked your post (2 min ago)
      - Bob commented: "Great!" (5 min ago)
      - Carol shared your post (10 min ago)
      - 2 more activities...
      [View all activity →]
```

### How to track notification effectiveness?

```
Tracking pipeline:

  1. DELIVERY TRACKING (server-side)
     - Record: queued → sent → delivered → failed
     - Source: Provider API response + webhooks

  2. OPEN TRACKING
     Email: 1x1 tracking pixel
       <img src="https://track.example.com/open?id=notif_123" />
     Push: App opens from notification tap
       → App reports: POST /api/v1/notifications/notif_123/opened
     In-app: Component visibility observer

  3. CLICK TRACKING
     Email: URL rewriting
       Original: https://example.com/product/456
       Tracked:  https://track.example.com/click?id=notif_123&url=...
     Push: Deep link handler reports clicks
     In-app: onClick handler

  4. CONVERSION TRACKING
     Tie notification to downstream action:
       notification_id → user opened app → completed purchase
       Attribution window: 24 hours after notification delivery

  5. AGGREGATION
     Daily batch job aggregates per:
       - Template
       - Channel
       - Category
       - User segment
       - Time of day

  Key metrics:
    CTR (Click-Through Rate) = clicks / delivered
    Conversion Rate = conversions / delivered
    Opt-out Rate = opt-outs within 24h / delivered
    Revenue per Notification = attributed revenue / delivered
```

### How to handle unsubscribes?

```
Unsubscribe flow:

  1. ONE-CLICK UNSUBSCRIBE (email, required by law)
     Email header: List-Unsubscribe: <https://example.com/unsub?token=xxx>
     Email header: List-Unsubscribe-Post: List-Unsubscribe=One-Click

     When clicked:
       → Validate token
       → Update user_preferences: channel=email, category=X, enabled=false
       → Invalidate Redis cache
       → Return confirmation page
       → Log unsubscribe event for analytics

  2. GRANULAR PREFERENCES PAGE
     https://example.com/notification-preferences?token=xxx

     Shows:
       ┌──────────────────────────────────────────┐
       │  Notification Preferences                │
       │                                          │
       │  Push Notifications                      │
       │  ├── Messages          [ON]  [OFF]       │
       │  ├── Social Activity   [ON]  [OFF]       │
       │  ├── Marketing         [ON]  [OFF]       │
       │  └── Product Updates   [ON]  [OFF]       │
       │                                          │
       │  Email                                   │
       │  ├── Messages          [ON]  [OFF]       │
       │  ├── Social Activity   [ON]  [OFF]       │
       │  ├── Weekly Digest     [ON]  [OFF]       │
       │  └── Marketing         [ON]  [OFF]       │
       │                                          │
       │  SMS                                     │
       │  ├── Security Alerts   [ON]  [always on] │
       │  └── Marketing         [ON]  [OFF]       │
       │                                          │
       │  [Unsubscribe from ALL]                  │
       └──────────────────────────────────────────┘

  3. COMPLIANCE
     - CAN-SPAM: Must honor unsubscribe within 10 business days
     - GDPR: Must provide easy opt-out mechanism
     - TCPA: Explicit consent required for SMS marketing
     - Implementation: Process unsubscribes synchronously (immediate effect)

  4. RE-ENGAGEMENT
     After unsubscribe, periodically offer to re-subscribe:
       - In-app prompt after 30 days
       - "You're missing out on..." (but never via the unsubscribed channel)
```

### How to implement rich notifications with images?

```
Rich notification support varies by channel:

1. iOS RICH PUSH (Notification Service Extension)
   Payload:
   {
     "aps": {
       "alert": { "title": "New photo", "body": "Alice shared a photo" },
       "mutable-content": 1
     },
     "media_url": "https://cdn.example.com/images/thumb_123.jpg",
     "media_type": "image"
   }

   The iOS Notification Service Extension downloads the image
   and attaches it to the notification before display.

   Requirements:
     - Image must be < 10 MB
     - Supported formats: JPEG, PNG, GIF
     - Must use HTTPS
     - Thumbnail recommended: 1038 x 1038 pixels max

2. ANDROID RICH PUSH (FCM BigPictureStyle)
   Payload:
   {
     "message": {
       "notification": {
         "title": "New photo",
         "body": "Alice shared a photo",
         "image": "https://cdn.example.com/images/thumb_123.jpg"
       }
     }
   }

   Requirements:
     - Image auto-downloaded by system
     - Recommended: 2:1 aspect ratio
     - Max size: 1 MB (200 KB recommended)

3. EMAIL RICH CONTENT
   - Inline images via CID or hosted URLs
   - Responsive HTML templates
   - Preheader text for preview
   - Dark mode compatible styles

4. IMAGE PIPELINE
   When a notification requires an image:
     1. Source image URL provided in notification payload
     2. Image processing service creates thumbnails:
        - Push iOS: 1038x1038
        - Push Android: 800x400
        - Email: 600px wide
     3. Upload to CDN with cache headers
     4. Include CDN URL in notification payload
     5. Set TTL on CDN (match notification relevance window)

   ┌──────────┐    ┌──────────┐    ┌─────┐    ┌──────────┐
   │ Source   │───>│ Image    │───>│ CDN │───>│ Device   │
   │ Image    │    │ Resizer  │    │     │    │ renders  │
   └──────────┘    └──────────┘    └─────┘    └──────────┘
```

---

## Summary Checklist for Interview

```
When designing a notification system, cover these areas:

  [x] Requirements & scale estimation
  [x] Multi-channel support (push, SMS, email, in-app)
  [x] Async architecture with message queues
  [x] Priority-based processing
  [x] Template system with localization
  [x] User preferences and quiet hours
  [x] At-least-once delivery with deduplication
  [x] Retry with exponential backoff + DLQ
  [x] Rate limiting (per-user + per-provider)
  [x] Frequency capping
  [x] Database design with partitioning/sharding
  [x] Caching strategy for preferences
  [x] Monitoring and analytics
  [x] Multi-region deployment
  [x] Failover and circuit breakers

Key trade-offs to discuss:
  - At-least-once vs exactly-once delivery
  - Latency vs cost (SMS is expensive but reliable)
  - Push vs pull for in-app notifications
  - Immediate vs batched/digest delivery
  - Single queue vs priority queues
  - Monolith notification service vs microservices per channel
```
